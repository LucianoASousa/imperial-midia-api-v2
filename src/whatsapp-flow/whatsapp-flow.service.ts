import {
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { ProductsService } from '../products/products.service';
import {
  CreateFlowDto,
  FlowExecutionResponse,
  UpdateFlowDto,
  WhatsappFlowData,
  ProductNodeData,
  FlowNode,
} from './types';

// Interface para rastreamento de sessões ativas
interface ActiveSession {
  userId: string; // ID do usuário (número de telefone)
  flowId: string; // ID do fluxo em execução
  currentNodeId: string; // ID do nó atual
  expectedResponses: string[]; // Respostas esperadas (para validação)
  lastInteractionTime: Date; // Hora da última interação
  context: Record<string, any>; // Contexto da conversa (variáveis)
  history: Array<{
    // Histórico de nós visitados
    nodeId: string;
    timestamp: Date;
  }>;
}

@Injectable()
export class WhatsappFlowService {
  // Armazenando sessões ativas em memória
  private activeSessions: Map<string, ActiveSession> = new Map();
  // Timeout para considerar uma sessão expirada (30 minutos)
  private readonly SESSION_TIMEOUT = 30 * 60 * 1000;

  constructor(
    private readonly prismaService: PrismaService,
    @Inject(forwardRef(() => WhatsappService))
    private readonly whatsappService: WhatsappService,
    private readonly productsService: ProductsService,
  ) {
    // Iniciar limpeza periódica de sessões expiradas
    setInterval(() => this.cleanExpiredSessions(), 5 * 60 * 1000);
  }

  // Limpeza de sessões expiradas
  private cleanExpiredSessions() {
    const now = new Date();
    for (const [userId, session] of this.activeSessions.entries()) {
      const elapsed = now.getTime() - session.lastInteractionTime.getTime();
      if (elapsed > this.SESSION_TIMEOUT) {
        // Envia mensagem informando que a sessão expirou
        this.whatsappService.sendMessage({
          to: userId,
          message:
            'Sua sessão expirou por inatividade. Para iniciar novamente, envie uma mensagem de ativação.',
        });
        this.activeSessions.delete(userId);
      }
    }
  }

  // Verificar se uma resposta está fora do contexto esperado
  private isOutOfContextResponse(
    session: ActiveSession,
    message: string,
  ): boolean {
    // Se não houver respostas esperadas, qualquer resposta é válida
    if (!session.expectedResponses || session.expectedResponses.length === 0) {
      return false;
    }

    // Verifica se a mensagem corresponde a alguma das respostas esperadas
    const lowerMessage = message.toLowerCase().trim();

    // Tratamento especial para respostas de lista (que podem incluir texto + descrição)
    // Exemplo: "luciano\noiii" - precisamos verificar a primeira linha
    const firstLineOfMessage = lowerMessage.split('\n')[0].trim();

    return !session.expectedResponses.some((response) => {
      // Verifica correspondência exata (com mensagem completa)
      if (lowerMessage === response.toLowerCase()) {
        return true;
      }

      // Verifica correspondência exata apenas com a primeira linha (para lidar com texto + descrição)
      if (firstLineOfMessage === response.toLowerCase()) {
        return true;
      }

      // Verifica se a mensagem começa com o texto da resposta esperada
      // Isso captura casos onde a mensagem é "texto\ndescrição"
      if (lowerMessage.startsWith(response.toLowerCase())) {
        return true;
      }

      // Verifica correspondência por regex
      try {
        const regex = new RegExp(response, 'i');
        return regex.test(lowerMessage) || regex.test(firstLineOfMessage);
      } catch (error) {
        return false;
      }
    });
  }

  // Tratar resposta fora do contexto
  private async handleOutOfContextResponse(userId: string): Promise<boolean> {
    const session = this.activeSessions.get(userId);
    if (!session) return false;

    // Pergunta se o usuário quer encerrar a conversa
    await this.whatsappService.sendMessage({
      to: userId,
      message:
        'Parece que sua resposta está fora do contexto esperado. Deseja encerrar esta conversa? (Responda com "sim" ou "não")',
    });

    // Salva o contexto atual, mas altera as respostas esperadas
    this.activeSessions.set(userId, {
      ...session,
      expectedResponses: ['sim', 'não', 'nao', 'yes', 'no'],
      lastInteractionTime: new Date(),
      // Incluímos um marcador para indicar que estamos em um estado especial
      context: {
        ...session.context,
        _handlingOutOfContext: true,
        _previousNodeId: session.currentNodeId,
      },
    });

    return true;
  }

  // Processa a resposta para mensagem fora do contexto
  private async processOutOfContextDecision(
    userId: string,
    message: string,
  ): Promise<boolean> {
    const session = this.activeSessions.get(userId);
    if (!session || !session.context._handlingOutOfContext) return false;

    const lowerMessage = message.toLowerCase().trim();
    const wantsToEnd = ['sim', 'yes', 's', 'y'].includes(lowerMessage);

    if (wantsToEnd) {
      // Usuário quer encerrar a conversa
      await this.whatsappService.sendMessage({
        to: userId,
        message:
          'Conversa encerrada. Obrigado por utilizar nosso serviço! Para iniciar novamente, envie uma mensagem de ativação.',
      });
      this.activeSessions.delete(userId);
    } else {
      // Usuário quer continuar de onde parou
      const previousNodeId = session.context._previousNodeId as string; // Adicionar type assertion

      // Remover marcadores especiais
      const cleanContext = { ...session.context };
      delete cleanContext._handlingOutOfContext;
      delete cleanContext._previousNodeId;

      // Restaurar sessão ao estado anterior
      this.activeSessions.set(userId, {
        ...session,
        currentNodeId: previousNodeId,
        context: cleanContext,
        lastInteractionTime: new Date(),
      });

      await this.whatsappService.sendMessage({
        to: userId,
        message: 'Ok, vamos continuar de onde paramos.',
      });

      // Reprocessar o nó atual para continuar o fluxo
      await this.processNode(userId, session.flowId, previousNodeId);
    }

    return true;
  }

  // Método para lidar com mensagens em uma sessão ativa
  private async handleSessionMessage(
    userId: string,
    message: string,
  ): Promise<void> {
    const activeSession = this.activeSessions.get(userId);
    if (!activeSession) return;

    // Verificar se estamos tratando uma resposta para uma pergunta de "fora do contexto"
    if (activeSession.context._handlingOutOfContext) {
      await this.processOutOfContextDecision(userId, message);
      return;
    }

    // Verificar se a mensagem está fora do contexto esperado
    if (this.isOutOfContextResponse(activeSession, message)) {
      await this.handleOutOfContextResponse(userId);
      return;
    }

    // Atualizar hora da última interação
    activeSession.lastInteractionTime = new Date();

    // Processar a resposta para o nó atual
    await this.processNodeResponse(
      userId,
      activeSession.flowId,
      activeSession.currentNodeId,
      message,
    );
  }

  async createFlow(createFlowDto: CreateFlowDto): Promise<WhatsappFlowData> {
    // Criar o fluxo base
    const flow = await this.prismaService.whatsappFlow.create({
      data: {
        name: createFlowDto.name,
        description: createFlowDto.description,
        instanceName: createFlowDto.instanceName,
      },
    });

    // Criar os nós
    const createdNodes = await Promise.all(
      createFlowDto.nodes.map(async (node) => {
        return await this.prismaService.flowNode.create({
          data: {
            type: node.type,
            position: node.position,
            data: node.data as any,
            flowId: flow.id,
          },
        });
      }),
    );

    // Mapeamento de IDs temporários para IDs persistidos
    const nodeIdMap = new Map<string, string>();
    createFlowDto.nodes.forEach((node, index) => {
      nodeIdMap.set(node.id, createdNodes[index].id);
    });

    // Criar as arestas com os IDs persistidos
    await Promise.all(
      createFlowDto.edges.map(async (edge) => {
        const sourceId = nodeIdMap.get(edge.source);
        const targetId = nodeIdMap.get(edge.target);

        if (!sourceId || !targetId) {
          throw new Error(
            `Nó de origem ou destino não encontrado para a aresta ${edge.id}`,
          );
        }

        return await this.prismaService.flowEdge.create({
          data: {
            sourceId,
            targetId,
            sourceHandle: edge.sourceHandle,
            flowId: flow.id,
          },
        });
      }),
    );

    // Retornar o fluxo completo
    return this.getFlowById(flow.id);
  }

  async getAllFlows(): Promise<WhatsappFlowData[]> {
    const flows = await this.prismaService.whatsappFlow.findMany({
      include: {
        nodes: true,
        edges: true,
      },
    });

    return flows.map((flow) => this.mapFlowToDto(flow));
  }

  async getFlowById(id: string): Promise<WhatsappFlowData> {
    const flow = await this.prismaService.whatsappFlow.findUnique({
      where: { id },
      include: {
        nodes: true,
        edges: true,
      },
    });

    if (!flow) {
      throw new NotFoundException(`Fluxo com ID ${id} não encontrado`);
    }

    return this.mapFlowToDto(flow);
  }

  async updateFlow(
    id: string,
    updateFlowDto: UpdateFlowDto,
  ): Promise<WhatsappFlowData> {
    // Verificar se o fluxo existe
    const existingFlow = await this.prismaService.whatsappFlow.findUnique({
      where: { id },
    });

    if (!existingFlow) {
      throw new NotFoundException(`Fluxo com ID ${id} não encontrado`);
    }

    // Atualizar dados básicos do fluxo
    await this.prismaService.whatsappFlow.update({
      where: { id },
      data: {
        name: updateFlowDto.name ?? existingFlow.name,
        description: updateFlowDto.description ?? existingFlow.description,
        active: updateFlowDto.active ?? existingFlow.active,
        instanceName: updateFlowDto.instanceName ?? existingFlow.instanceName,
      },
    });

    // Se houver novos nós, primeiro remover os existentes e depois criar os novos
    if (updateFlowDto.nodes) {
      // Remover nós existentes (as arestas serão removidas em cascata conforme definido no schema)
      await this.prismaService.flowNode.deleteMany({
        where: { flowId: id },
      });

      // Criar os novos nós
      const createdNodes = await Promise.all(
        updateFlowDto.nodes.map(async (node) => {
          return await this.prismaService.flowNode.create({
            data: {
              type: node.type,
              position: node.position,
              data: node.data as any,
              flowId: id,
            },
          });
        }),
      );

      // Mapeamento de IDs temporários para IDs persistidos
      const nodeIdMap = new Map<string, string>();
      updateFlowDto.nodes.forEach((node, index) => {
        nodeIdMap.set(node.id, createdNodes[index].id);
      });

      // Criar as novas arestas
      if (updateFlowDto.edges) {
        await Promise.all(
          updateFlowDto.edges.map(async (edge) => {
            const sourceId = nodeIdMap.get(edge.source);
            const targetId = nodeIdMap.get(edge.target);

            if (!sourceId || !targetId) {
              throw new Error(
                `Nó de origem ou destino não encontrado para a aresta ${edge.id}`,
              );
            }

            return await this.prismaService.flowEdge.create({
              data: {
                sourceId,
                targetId,
                sourceHandle: edge.sourceHandle,
                flowId: id,
              },
            });
          }),
        );
      }
    }

    // Retornar o fluxo atualizado
    return this.getFlowById(id);
  }

  async deleteFlow(id: string): Promise<void> {
    const flow = await this.prismaService.whatsappFlow.findUnique({
      where: { id },
    });

    if (!flow) {
      throw new NotFoundException(`Fluxo com ID ${id} não encontrado`);
    }

    // Excluir o fluxo (nós e arestas serão excluídos em cascata)
    await this.prismaService.whatsappFlow.delete({
      where: { id },
    });
  }

  // Método para processar mensagens recebidas
  async processIncomingMessage(userId: string, message: string): Promise<void> {
    // Verificar se já existe uma sessão ativa para este usuário
    const activeSession = this.activeSessions.get(userId);

    if (activeSession) {
      // Já existe uma sessão ativa, processar a resposta
      await this.handleSessionMessage(userId, message);
    } else {
      // Verificar se a mensagem é um gatilho para algum fluxo
      const trigger = await this.findTriggerForMessage(message);
      if (trigger) {
        await this.executeFlow(trigger.flowId, userId, message);
      } else {
        // Alteração: Em vez de procurar especificamente o fluxo "Atendimento Automatizado",
        // procurar qualquer fluxo ativo criado pelo usuário
        try {
          // Buscar qualquer fluxo ativo (privilegiando fluxos criados pelo usuário)
          const defaultFlow = await this.prismaService.whatsappFlow.findFirst({
            where: {
              active: true,
            },
            orderBy: {
              createdAt: 'desc', // Prioriza fluxos mais recentes (provavelmente criados pelo usuário)
            },
          });

          if (defaultFlow) {
            console.log(
              `🤖 Iniciando fluxo padrão (${defaultFlow.name}) para mensagem não reconhecida: ${message}`,
            );
            await this.executeFlow(defaultFlow.id, userId, message);
          } else {
            // Nenhum fluxo ativo encontrado, usar resposta genérica
            await this.whatsappService.sendMessage({
              to: userId,
              message:
                'Olá! Não reconheci sua mensagem. Parece que não há fluxos ativos configurados no sistema.',
            });
          }
        } catch (error) {
          console.error('Erro ao iniciar fluxo padrão:', error);
          await this.whatsappService.sendMessage({
            to: userId,
            message:
              'Desculpe, estamos enfrentando problemas técnicos. Por favor, tente novamente mais tarde.',
          });
        }
      }
    }
  }

  // Encontrar um gatilho para a mensagem recebida
  private async findTriggerForMessage(
    message: string,
  ): Promise<{ flowId: string } | null> {
    // Obter todos os gatilhos do serviço WhatsApp
    const triggers = this.whatsappService.getFlowTriggers();

    const lowerMessage = message.toLowerCase().trim();

    for (const trigger of triggers) {
      if (typeof trigger.keyword === 'string') {
        // Gatilho de texto simples
        if (lowerMessage === trigger.keyword.toLowerCase()) {
          return { flowId: trigger.flowId };
        }
      } else {
        // Gatilho de regex - usando string diretamente
        try {
          // Assumir que o valor já é um padrão regex válido como string
          const regex = new RegExp(String(trigger.keyword), 'i');
          if (regex.test(lowerMessage)) {
            return { flowId: trigger.flowId };
          }
        } catch (error) {
          console.error('Erro ao processar regex em gatilho:', error);
        }
      }
    }

    return null;
  }

  async executeFlow(
    id: string,
    contactNumber: string,
    message?: string,
  ): Promise<FlowExecutionResponse> {
    try {
      const flow = await this.getFlowById(id);
      if (!flow) {
        return {
          success: false,
          message: `Fluxo com ID ${id} não encontrado`,
          error: 'FLOW_NOT_FOUND',
        };
      }

      // Encontrar o nó inicial
      const startNode = flow.nodes.find((node) => node.type === 'start');
      if (!startNode) {
        return {
          success: false,
          message: 'Nó de início não encontrado no fluxo',
          error: 'START_NODE_NOT_FOUND',
        };
      }

      // Iniciar uma nova sessão
      this.activeSessions.set(contactNumber, {
        userId: contactNumber,
        flowId: id,
        currentNodeId: startNode.id,
        expectedResponses: [],
        lastInteractionTime: new Date(),
        context: {
          // Se houver uma mensagem inicial, armazenar no contexto
          initialMessage: message || null,
        },
        history: [
          {
            nodeId: startNode.id,
            timestamp: new Date(),
          },
        ],
      });

      // Processar o nó inicial
      await this.processNode(contactNumber, id, startNode.id);

      return {
        success: true,
        message: 'Fluxo iniciado com sucesso',
        currentNodeId: startNode.id,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Erro ao executar o fluxo',
        error: error.message,
      };
    }
  }

  // Processar um nó do fluxo
  private async processNode(
    userId: string,
    flowId: string,
    nodeId: string,
  ): Promise<void> {
    const flow = await this.getFlowById(flowId);
    const node = flow.nodes.find((n) => n.id === nodeId);

    if (!node) {
      await this.whatsappService.sendMessage({
        to: userId,
        message: 'Erro: Nó não encontrado no fluxo. A conversa será encerrada.',
      });
      this.activeSessions.delete(userId);
      return;
    }

    const session = this.activeSessions.get(userId);
    if (!session) return;

    // Atualizar o nó atual na sessão
    session.currentNodeId = nodeId;
    session.history.push({
      nodeId,
      timestamp: new Date(),
    });

    switch (node.type) {
      case 'start':
        // Enviar mensagem de boas-vindas APENAS se houver uma label personalizada
        if (node.data.label && node.data.label !== 'Início do Fluxo') {
          await this.whatsappService.sendMessage({
            to: userId,
            message: node.data.label,
          });
        }

        // Encontrar o próximo nó conectado ao nó inicial
        const nextNodeAfterStart = this.findNextNode(flow, nodeId);
        if (nextNodeAfterStart) {
          await this.processNode(userId, flowId, nextNodeAfterStart);
        } else {
          await this.whatsappService.sendMessage({
            to: userId,
            message: 'Fluxo incompleto. Não há nós conectados ao nó inicial.',
          });
          this.activeSessions.delete(userId);
        }
        break;

      case 'message':
        // Enviar a mensagem
        await this.whatsappService.sendMessage({
          to: userId,
          message: node.data.label || 'Mensagem sem conteúdo',
        });

        // Verificar se o nó aguarda resposta
        if (node.data.aguardaResposta) {
          // Configurar as respostas esperadas com base nos gatilhos
          if (node.data.gatilhos && node.data.gatilhos.length > 0) {
            const expectedResponses = node.data.gatilhos
              .filter((g) => g.tipo !== 'qualquer')
              .map((g) => g.valor || '');

            session.expectedResponses = expectedResponses;
          } else {
            // Se não há gatilhos específicos, aceitar qualquer resposta
            session.expectedResponses = [];
          }

          // Não prosseguir automaticamente, aguardar resposta do usuário
        } else {
          // Não aguarda resposta, seguir para o próximo nó
          const nextNode = this.findNextNode(flow, nodeId);
          if (nextNode) {
            await this.processNode(userId, flowId, nextNode);
          } else {
            // Fim do fluxo
            await this.whatsappService.sendMessage({
              to: userId,
              message: 'Fim da conversa. Obrigado!',
            });
            this.activeSessions.delete(userId);
          }
        }
        break;

      case 'list':
        // Enviar uma mensagem de lista com opções
        const listData = node.data as any; // Tipo específico para nós de lista

        if (listData.options && listData.options.length > 0) {
          // Criar a mensagem de lista
          const listMessage = {
            number: userId,
            title: 'Selecione uma opção',
            description:
              node.data.label || 'Por favor, escolha uma das opções abaixo:',
            buttonText: 'Ver opções',
            footerText: 'Imperial Mídia WhatsApp Flow',
            sections: [
              {
                title: 'Opções disponíveis',
                rows: listData.options.map((option) => ({
                  title: option.text,
                  description: option.description || '',
                  rowId: option.id,
                })),
              },
            ],
          };

          // Salvar as opções válidas como respostas esperadas
          // Incluir tanto os IDs das opções quanto os textos das opções como respostas válidas
          session.expectedResponses = [
            ...listData.options.map((option) => option.id),
            ...listData.options.map((option) => option.text),
          ];

          // Enviar a lista
          await this.whatsappService.sendListMessage(listMessage);
        } else {
          // Lista sem opções, enviar mensagem de erro
          await this.whatsappService.sendMessage({
            to: userId,
            message: 'Erro: Lista de opções vazia.',
          });

          // Tentar prosseguir para o próximo nó
          const nextNode = this.findNextNode(flow, nodeId);
          if (nextNode) {
            await this.processNode(userId, flowId, nextNode);
          } else {
            this.activeSessions.delete(userId);
          }
        }
        break;

      case 'product':
        await this.processProductNode(userId, node, session);
        break;

      case 'conditional':
        // Nó condicional - na implementação atual, processamos baseado nos gatilhos
        // Como não temos uma resposta do usuário para avaliar, apenas mostramos a mensagem
        // e aguardamos a resposta
        await this.whatsappService.sendMessage({
          to: userId,
          message: node.data.label || 'Por favor, responda para prosseguir:',
        });

        // Configurar respostas esperadas com base nos gatilhos
        if (node.data.gatilhos && node.data.gatilhos.length > 0) {
          const expectedResponses = node.data.gatilhos
            .filter((g) => g.tipo !== 'qualquer')
            .map((g) => g.valor || '');

          session.expectedResponses = expectedResponses;
        }
        break;

      case 'end':
        // Nó final - encerrar o fluxo, mas enviar mensagem APENAS se houver uma personalizada
        if (node.data.label && node.data.label !== 'Fim do fluxo') {
          await this.whatsappService.sendMessage({
            to: userId,
            message: node.data.label,
          });
        }

        // Remover a sessão ativa
        this.activeSessions.delete(userId);
        break;

      default:
        // Tipo de nó desconhecido
        await this.whatsappService.sendMessage({
          to: userId,
          message: `Tipo de nó não suportado: ${node.type}`,
        });

        // Tentar prosseguir para o próximo nó
        const nextNodeDefault = this.findNextNode(flow, nodeId);
        if (nextNodeDefault) {
          await this.processNode(userId, flowId, nextNodeDefault);
        } else {
          this.activeSessions.delete(userId);
        }
    }
  }

  // Processar a resposta do usuário para um nó
  private async processNodeResponse(
    userId: string,
    flowId: string,
    nodeId: string,
    userResponse: string,
  ): Promise<void> {
    const flow = await this.getFlowById(flowId);
    const node = flow.nodes.find((n) => n.id === nodeId);

    if (!node || !flow) {
      this.activeSessions.delete(userId);
      return;
    }

    // Encontrar o próximo nó com base na resposta e nos gatilhos
    let nextNodeId: string | null = null;

    // Verificar gatilhos específicos do nó
    if (node.data.gatilhos && node.data.gatilhos.length > 0) {
      const lowerUserResponse = userResponse.toLowerCase().trim();

      // Tentar encontrar um gatilho correspondente
      for (const gatilho of node.data.gatilhos) {
        if (gatilho.tipo === 'qualquer') {
          // Gatilho que aceita qualquer resposta
          nextNodeId = gatilho.proximoNoId || this.findNextNode(flow, nodeId);
          break;
        } else if (gatilho.tipo === 'texto' && gatilho.valor) {
          // Gatilho de texto exato
          if (lowerUserResponse === gatilho.valor.toLowerCase()) {
            nextNodeId = gatilho.proximoNoId || this.findNextNode(flow, nodeId);

            // Enviar resposta automática se configurada
            if (gatilho.resposta) {
              await this.whatsappService.sendMessage({
                to: userId,
                message: gatilho.resposta,
              });
            }
            break;
          }
        } else if (gatilho.tipo === 'regex' && gatilho.valor) {
          // Gatilho de regex
          try {
            const regex = new RegExp(gatilho.valor, 'i');
            if (regex.test(lowerUserResponse)) {
              nextNodeId =
                gatilho.proximoNoId || this.findNextNode(flow, nodeId);

              // Enviar resposta automática se configurada
              if (gatilho.resposta) {
                await this.whatsappService.sendMessage({
                  to: userId,
                  message: gatilho.resposta,
                });
              }
              break;
            }
          } catch (error) {
            // Erro na regex, ignorar este gatilho
          }
        }
      }
    }

    // Se não encontrou por gatilhos, usar o próximo nó conectado
    if (!nextNodeId) {
      nextNodeId = this.findNextNode(flow, nodeId);
    }

    // Processar o próximo nó se encontrado
    if (nextNodeId) {
      await this.processNode(userId, flowId, nextNodeId);
    } else {
      // Fim do fluxo, sem próximo nó
      await this.whatsappService.sendMessage({
        to: userId,
        message: 'Fim da conversa. Obrigado!',
      });
      this.activeSessions.delete(userId);
    }
  }

  // Encontrar o próximo nó conectado
  private findNextNode(
    flow: WhatsappFlowData,
    currentNodeId: string,
  ): string | null {
    const edge = flow.edges.find((e) => e.source === currentNodeId);
    return edge ? edge.target : null;
  }

  // Método auxiliar para mapear o modelo do banco para o DTO
  private mapFlowToDto(flow: any): WhatsappFlowData {
    // Mapear os nós
    const nodes = flow.nodes.map((node) => ({
      id: node.id,
      type: node.type,
      position: node.position as any,
      data: node.data as any,
    }));

    // Mapear as arestas
    const edges = flow.edges.map((edge) => ({
      id: edge.id,
      source: edge.sourceId,
      target: edge.targetId,
      sourceHandle: edge.sourceHandle,
    }));

    return {
      id: flow.id,
      name: flow.name,
      description: flow.description,
      nodes,
      edges,
      instanceName: flow.instanceName,
    };
  }

  // Adicionar o método para processar o nó do tipo produto
  private async processProductNode(
    userId: string,
    node: FlowNode,
    session: ActiveSession,
  ): Promise<void> {
    try {
      // Extrair dados do nó de produto
      const productNodeData = node.data as ProductNodeData;

      // Se não há ID de produto definido, enviar mensagem de erro e avançar
      if (!productNodeData.productId) {
        await this.whatsappService.sendMessage({
          to: userId,
          message: 'Produto não configurado corretamente.',
        });

        // Tentar avançar para o próximo nó
        const flow = await this.getFlowById(session.flowId);
        const nextNode = this.findNextNode(flow, node.id);
        if (nextNode) {
          await this.processNode(userId, session.flowId, nextNode);
        }
        return;
      }

      try {
        // Buscar o produto pelo ID
        const product = await this.productsService.getProductById(
          productNodeData.productId,
        );

        // Preparar a mensagem do produto
        let productMessage = `*${product.name}*\n\n`;

        if (productNodeData.showDescription !== false && product.description) {
          productMessage += `${product.description}\n\n`;
        }

        if (productNodeData.showPrice !== false && product.price) {
          productMessage += `*Preço:* R$ ${product.price.toFixed(2)}\n\n`;
        }

        if (productNodeData.customText) {
          productMessage += `${productNodeData.customText}\n\n`;
        }

        // Enviar a mensagem do produto
        await this.whatsappService.sendMessage({
          to: userId,
          message: productMessage,
        });

        // Se há uma imagem e está configurado para mostrar
        if (productNodeData.showImage !== false && product.imageUrl) {
          await this.whatsappService.sendMessage({
            to: userId,
            message: product.imageUrl,
          });
        }

        // Se está configurado para mostrar botão de adicionar ao carrinho
        if (productNodeData.addToCartButton) {
          // Aqui poderia implementar botões ou outras ações específicas
          // Por enquanto, apenas simulando com uma mensagem
          await this.whatsappService.sendMessage({
            to: userId,
            message:
              "Para adicionar este produto ao carrinho, responda com 'adicionar'.",
          });

          // Configurar resposta esperada para adicionar ao carrinho
          session.expectedResponses = ['adicionar', 'comprar', 'quero'];
          return;
        }

        // Se não requer interação, avançar para o próximo nó
        const flow = await this.getFlowById(session.flowId);
        const nextNode = this.findNextNode(flow, node.id);
        if (nextNode) {
          await this.processNode(userId, session.flowId, nextNode);
        }
      } catch (error) {
        console.error('Erro ao processar produto:', error);
        await this.whatsappService.sendMessage({
          to: userId,
          message: 'Não foi possível obter informações do produto solicitado.',
        });

        // Mesmo com erro, tentamos avançar para o próximo nó
        const flow = await this.getFlowById(session.flowId);
        const nextNode = this.findNextNode(flow, node.id);
        if (nextNode) {
          await this.processNode(userId, session.flowId, nextNode);
        }
      }
    } catch (error) {
      console.error('Erro ao processar nó de produto:', error);
      await this.whatsappService.sendMessage({
        to: userId,
        message: 'Ocorreu um erro ao processar o produto.',
      });
    }
  }
}
