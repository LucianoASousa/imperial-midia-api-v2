// src/socket/socket-client.service.ts

import {
  forwardRef,
  Inject,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { io, Socket } from 'socket.io-client';
import { Instance, ListMessage } from './type';
import { WhatsappFlowService } from '../whatsapp-flow/whatsapp-flow.service';
import {
  WhatsappFlowData,
  NodeGatilho,
  BaseNodeData,
  ListNodeData,
  FlowNode,
} from '../whatsapp-flow/types';
import { PrismaService } from '../prisma/prisma.service';

// Tipos para o sistema de chatbot
interface UserState {
  flowId: string;
  currentNodeId: string;
  contactNumber: string;
  lastInteraction: Date;
  instanceName: string;
  context: Record<string, any>;
  aguardandoResposta?: boolean;
  gatilhosAtivosNode?: NodeGatilho[] | null;
  inicioAguardandoResposta?: Date | null;
}

interface FlowTrigger {
  keyword: string | RegExp;
  flowId: string;
}

@Injectable()
export class WhatsappService implements OnModuleInit, OnModuleDestroy {
  private sockets: Map<string, Socket> = new Map();
  private host: string;
  private port: string;

  // Estado dos usuários no fluxo de conversação
  private userStates: Map<string, UserState> = new Map();

  // Gatilhos para iniciar fluxos específicos
  private flowTriggers: FlowTrigger[] = [];

  constructor(
    @Inject(forwardRef(() => WhatsappFlowService))
    private whatsappFlowService: WhatsappFlowService,
    private prisma: PrismaService,
  ) {}

  async onModuleInit() {
    this.host = process.env.HOST || 'localhost';
    this.port = process.env.PORT || '8080';

    // Carregar fluxos ativos e configurar os gatilhos
    await this.loadFlowTriggers();

    const instances = await this.fetchInstances();

    // Criar um socket para cada instância
    if (instances && instances.length > 0) {
      for (const instance of instances) {
        await this.createSocketForInstance(instance);
      }
    }
  }

  /**
   * Carrega os gatilhos para todos os fluxos ativos
   */
  private async loadFlowTriggers() {
    try {
      // Resetar gatilhos
      this.flowTriggers = [];

      // Buscar todos os gatilhos do banco de dados
      const whatsappTriggers = await this.prisma.whatsappTrigger.findMany({
        include: {
          flow: {
            select: {
              id: true,
              active: true,
            },
          },
        },
      });

      // Filtrar apenas gatilhos de fluxos ativos
      const activeTriggers = whatsappTriggers.filter(
        (trigger) => trigger.flow.active,
      );

      // Adicionar gatilhos às triggers
      for (const trigger of activeTriggers) {
        if (trigger.type === 'regex') {
          // Criar um RegExp para gatilhos de regex
          try {
            const regex = new RegExp(trigger.value, 'i');
            this.flowTriggers.push({
              keyword: regex,
              flowId: trigger.flowId,
            });
            console.log(`✅ Gatilho regex carregado: ${trigger.value}`);
          } catch (error) {
            console.error(
              `❌ Erro ao processar regex '${trigger.value}':`,
              error,
            );
          }
        } else {
          // Para gatilhos de texto simples
          // Tratamento especial para o asterisco '*' como wildcard
          if (trigger.value === '*') {
            this.flowTriggers.push({
              keyword: new RegExp('.*', 'i'), // Regex que corresponde a qualquer texto
              flowId: trigger.flowId,
            });
            console.log(`✅ Gatilho wildcard carregado: * (qualquer mensagem)`);
          } else {
            this.flowTriggers.push({
              keyword: trigger.value.toLowerCase(),
              flowId: trigger.flowId,
            });
            console.log(`✅ Gatilho de texto carregado: ${trigger.value}`);
          }
        }
      }

      console.log(
        `✅ Carregados ${this.flowTriggers.length} gatilhos de fluxo do banco de dados`,
      );
    } catch (error) {
      console.error('❌ Erro ao carregar gatilhos de fluxo:', error);
    }
  }

  private async createSocketForInstance(instance: Instance) {
    const instanceName = instance.name;
    console.log(`Criando socket para instância: ${instanceName}`);

    const socket = io(`http://${this.host}:${this.port}/${instanceName}`, {
      reconnection: true,
      timeout: 10000,
      transports: ['websocket'],
    });

    this.sockets.set(instanceName, socket);
    this.registerEventsForSocket(socket, instanceName);
  }

  private registerEventsForSocket(socket: Socket, instanceName: string) {
    socket.on('connect', () => {
      console.log(
        `✅ Conectado ao Evolution WhatsApp - Instância: ${instanceName}`,
      );
    });

    socket.on('connect_error', (error) => {
      console.error(
        `❌ Erro de conexão na instância ${instanceName}:`,
        error.message,
      );
    });

    socket.on('disconnect', (reason) => {
      console.warn(`⚠️ Desconectado da instância ${instanceName}:`, reason);
    });

    socket.on('messages.upsert', (data) => {
      console.log(`📩 Nova mensagem na instância ${instanceName}:`, data);
      // Processar mensagem recebida
      this.processIncomingMessage(data, instanceName);
    });
  }

  /**
   * Processa as mensagens recebidas e gerencia os fluxos de conversação
   */
  private async processIncomingMessage(data: any, instanceName: string) {
    try {
      // Validar dados recebidos
      if (!data.data || !data.data.key || !data.data.message) {
        console.error('❌ Formato de mensagem inválido:', data);
        return;
      }

      // Verificar se a mensagem é do próprio bot
      if (data.data.key.fromMe) {
        console.log('🤖 Mensagem enviada pelo próprio bot, ignorando...');
        return;
      }

      // Extrair informações da mensagem
      const contactNumber = data.data.key.remoteJid
        .replace('@s.whatsapp.net', '')
        .replace('@c.us', '');
      const messageText = this.extractMessageText(data.data.message);

      console.log(
        `💬 Mensagem recebida de ${contactNumber} (${instanceName}): ${messageText}`,
      );

      // Verificar se existe estado para este usuário
      const userState = this.userStates.get(contactNumber);

      if (userState) {
        // Usuário já está em um fluxo ativo
        console.log(`🔄 Continuando fluxo para ${contactNumber}`);
        await this.continueUserFlow(userState, messageText);
      } else {
        // Verificar se a mensagem ativa algum gatilho
        console.log(`🔍 Verificando gatilhos para ${contactNumber}`);
        const foundTrigger = await this.checkFlowTriggers(
          messageText,
          contactNumber,
          instanceName,
          true, // Evitar mensagem duplicada se o processIncomingMessage for chamado de dentro do WhatsappFlowService
        );

        if (!foundTrigger) {
          // Se nenhum gatilho foi encontrado no WhatsappService, encaminhar para o WhatsappFlowService
          console.log(
            `➡️ Encaminhando mensagem para WhatsappFlowService: ${messageText}`,
          );
          await this.whatsappFlowService.processIncomingMessage(
            contactNumber,
            messageText,
          );
        }
      }
    } catch (error) {
      console.error('❌ Erro ao processar mensagem:', error);
    }
  }

  /**
   * Extrai o texto de diferentes tipos de mensagens
   */
  private extractMessageText(message: any): string {
    try {
      console.log('Estrutura da mensagem:', JSON.stringify(message, null, 2));

      if (!message) {
        return '';
      }

      if (message.conversation) {
        return message.conversation;
      } else if (
        message.listResponseMessage?.singleSelectReply?.selectedRowId
      ) {
        return message.listResponseMessage.singleSelectReply.selectedRowId;
      } else if (message.buttonsResponseMessage?.selectedButtonId) {
        return message.buttonsResponseMessage.selectedButtonId;
      } else if (message.extendedTextMessage?.text) {
        return message.extendedTextMessage.text;
      } else if (message.messageContextInfo && message.conversation) {
        // Formato observado no log
        return message.conversation;
      }

      // Tentar um método genérico para buscar o texto em qualquer campo que pareça ser texto
      for (const key in message) {
        if (typeof message[key] === 'string') {
          return message[key];
        }
      }

      // Se não conseguir extrair de nenhuma forma específica, retornar a mensagem em formato string
      return JSON.stringify(message);
    } catch (error) {
      console.error('❌ Erro ao extrair texto da mensagem:', error);
      return '';
    }
  }

  /**
   * Verifica se a mensagem corresponde a algum gatilho de fluxo
   */
  private async checkFlowTriggers(
    messageText: string,
    contactNumber: string,
    instanceName: string,
    fromProcessIncomingMessage?: boolean, // Flag para evitar mensagem padrão se chamado de dentro do processIncomingMessage
  ): Promise<boolean> {
    // Retorna true se um gatilho foi ativado e um fluxo iniciado
    const lowerCaseMsg = messageText.toLowerCase();

    console.log(`Verificando gatilhos para mensagem: "${messageText}"`);

    // Primeiro verificar gatilhos específicos (prioridade maior)
    const specificTriggers = this.flowTriggers.filter((trigger) => {
      // Se for regex, verificar se não é o padrão wildcard
      if (typeof trigger.keyword === 'object') {
        const regexStr = String(trigger.keyword);
        return (
          regexStr !== '/.*|i/' && regexStr !== '/./i/' && regexStr !== '/.*/i'
        );
      }
      return true; // Gatilhos de texto são sempre específicos
    });

    // Depois verificar gatilhos wildcard (prioridade menor)
    const wildcardTriggers = this.flowTriggers.filter((trigger) => {
      // Identificar regex que são wildcards
      if (typeof trigger.keyword === 'object') {
        const regexStr = String(trigger.keyword);
        return (
          regexStr === '/.*|i/' || regexStr === '/./i/' || regexStr === '/.*/i'
        );
      }
      // Verificar se é o gatilho especial '*'
      return typeof trigger.keyword === 'string' && trigger.keyword === '*';
    });

    console.log(
      `Encontrados ${specificTriggers.length} gatilhos específicos e ${wildcardTriggers.length} wildcards`,
    );

    // Verificar gatilhos específicos primeiro
    for (const trigger of specificTriggers) {
      let isMatch = false;

      if (typeof trigger.keyword === 'string') {
        isMatch = lowerCaseMsg === trigger.keyword.toLowerCase();
      } else {
        try {
          isMatch = trigger.keyword.test(lowerCaseMsg);
        } catch (error) {
          console.error(`Erro ao testar regex: ${error}`);
        }
      }

      if (isMatch) {
        console.log(
          `🚀 Gatilho específico encontrado: "${trigger.keyword}", iniciando fluxo ${trigger.flowId} para ${contactNumber}`,
        );
        await this.startFlow(trigger.flowId, contactNumber, instanceName);
        return true; // Gatilho específico ativado
      }
    }

    // Se nenhum gatilho específico corresponder, verificar gatilhos wildcard
    if (wildcardTriggers.length > 0) {
      // Usar o primeiro gatilho wildcard encontrado
      const wildcardTrigger = wildcardTriggers[0];
      console.log(
        `🚀 Gatilho wildcard ativado para mensagem: "${messageText}", iniciando fluxo ${wildcardTrigger.flowId} para ${contactNumber}`,
      );
      await this.startFlow(wildcardTrigger.flowId, contactNumber, instanceName);
      return true; // Gatilho wildcard ativado
    }

    // Nenhum gatilho correspondeu à mensagem
    if (!fromProcessIncomingMessage) {
      await this.sendMessage({
        message:
          'Olá! Não entendi sua mensagem. Para iniciar uma conversa, digite o nome de um dos nossos serviços.',
        to: contactNumber,
        instanceName,
      });
    }
    return false; // Nenhum gatilho ativado
  }

  /**
   * Inicia um fluxo para o usuário
   */
  private async startFlow(
    flowId: string,
    contactNumber: string,
    instanceName: string,
  ) {
    try {
      const flow = await this.whatsappFlowService.getFlowById(flowId);
      if (!flow || !flow.nodes || flow.nodes.length === 0) {
        console.error(`❌ Fluxo ${flowId} está vazio ou não foi encontrado.`);
        await this.sendMessage({
          message: 'Desculpe, não consegui encontrar o fluxo solicitado.',
          to: contactNumber,
          instanceName,
        });
        return;
      }

      // Encontrar o nó inicial (deve haver apenas um)
      const startNode = flow.nodes.find((node) => node.type === 'start');
      if (!startNode) {
        console.error(
          `❌ Fluxo ${flowId} não possui um nó inicial (tipo 'start').`,
        );
        await this.sendMessage({
          message:
            'Desculpe, o fluxo parece estar mal configurado (sem nó inicial).',
          to: contactNumber,
          instanceName,
        });
        return;
      }

      console.log(
        `🏁 Iniciando fluxo ${flowId} para ${contactNumber} a partir do nó ${startNode.id}`,
      );

      // Limpar qualquer estado anterior para este contato (se um novo fluxo está começando)
      this.userStates.delete(contactNumber);

      const newUserState: UserState = {
        flowId,
        currentNodeId: startNode.id, // Começa pelo nó inicial
        contactNumber,
        lastInteraction: new Date(),
        instanceName,
        context: {},
        aguardandoResposta: false, // Será definido por processNode
        gatilhosAtivosNode: null, // Será definido por processNode
        inicioAguardandoResposta: null, // Será definido por processNode
      };
      this.userStates.set(contactNumber, newUserState);

      // Processar o nó inicial - não há mensagem de gatilho específica para o start node em si neste ponto.
      await this.processNode(startNode.id, flow, newUserState);
    } catch (error) {
      console.error(
        `❌ Erro ao iniciar fluxo ${flowId} para ${contactNumber}:`,
        error,
      );
      await this.sendMessage({
        message: 'Desculpe, ocorreu um erro ao tentar iniciar nossa conversa.',
        to: contactNumber,
        instanceName,
      });
      this.userStates.delete(contactNumber); // Limpar estado em caso de erro na inicialização
    }
  }

  /**
   * Continua o fluxo do usuário com base na mensagem recebida
   */
  private async continueUserFlow(userState: UserState, messageText: string) {
    try {
      const { flowId, currentNodeId, contactNumber, instanceName } = userState;

      // Buscar o fluxo completo
      const flow = await this.whatsappFlowService.getFlowById(flowId);

      // Encontrar o nó atual
      const currentNode = flow.nodes.find((node) => node.id === currentNodeId);
      if (!currentNode) {
        throw new Error(
          `Nó ${currentNodeId} não encontrado no fluxo ${flowId}`,
        );
      }

      // Encontrar as arestas que saem do nó atual
      const outgoingEdges = flow.edges.filter(
        (edge) => edge.source === currentNodeId,
      );

      // Determinar o próximo nó com base no tipo de nó atual
      let nextNodeId: string | null = null;

      if (currentNode.type === 'message') {
        // Se for um nó de mensagem, simplesmente seguir para o próximo nó
        if (outgoingEdges.length > 0) {
          nextNodeId = outgoingEdges[0].target;
        }
      } else if (currentNode.type === 'conditional') {
        // Se for um nó condicional, verificar a condição
        const conditionalData = currentNode.data as any;

        // Implementar lógica para avaliar condições baseadas na entrada do usuário
        const condition = conditionalData.condition;
        const userInput = messageText.toLowerCase();

        // Lógica simples: se a entrada contém a condição, vai para o "yes", senão para o "no"
        const handleToUse = userInput.includes(condition.toLowerCase())
          ? 'yes'
          : 'no';

        // Encontrar a aresta correta baseada no handle
        const matchingEdge = outgoingEdges.find(
          (edge) => edge.sourceHandle === handleToUse,
        );
        if (matchingEdge) {
          nextNodeId = matchingEdge.target;
        }
      } else if (currentNode.type === 'list') {
        // Se for um nó de lista, verificar qual opção foi selecionada
        const listData = currentNode.data as any;
        const selectedOptionId = messageText;

        // Encontrar a opção selecionada
        const selectedOption = listData.options.find(
          (option) => option.id === selectedOptionId,
        );

        if (selectedOption) {
          // Encontrar a aresta que corresponde a essa opção
          const matchingEdge = outgoingEdges.find(
            (edge) => edge.sourceHandle === selectedOptionId,
          );

          if (matchingEdge) {
            nextNodeId = matchingEdge.target;
          }
        } else {
          // Opção inválida selecionada
          await this.sendMessage({
            message: 'Por favor, selecione uma opção válida da lista.',
            to: contactNumber,
            instanceName,
          });
          return;
        }
      }

      // Se encontramos o próximo nó, processar
      if (nextNodeId) {
        await this.processNode(nextNodeId, flow, userState);
      } else {
        // Fim do fluxo ou erro
        await this.sendMessage({
          message:
            'Obrigado pela sua interação. O fluxo de conversa foi finalizado.',
          to: contactNumber,
          instanceName,
        });

        // Remover o estado do usuário
        this.userStates.delete(contactNumber);
      }
    } catch (error) {
      console.error('❌ Erro ao continuar fluxo do usuário:', error);

      // Em caso de erro, enviar mensagem e limpar o estado
      await this.sendMessage({
        message: 'Desculpe, ocorreu um erro ao processar sua solicitação.',
        to: userState.contactNumber,
        instanceName: userState.instanceName,
      });

      this.userStates.delete(userState.contactNumber);
    }
  }

  /**
   * Processa um nó específico do fluxo
   */
  private async processNode(
    nodeId: string,
    flow: WhatsappFlowData,
    userState: UserState,
  ) {
    const node = flow.nodes.find((n) => n.id === nodeId);
    if (!node) {
      console.error(
        `❌ Nó ${nodeId} não encontrado no fluxo ${userState.flowId}. Encerrando fluxo para ${userState.contactNumber}.`,
      );
      await this.sendMessage({
        message:
          'Ocorreu um erro interno e não foi possível continuar. Por favor, tente iniciar novamente mais tarde.',
        to: userState.contactNumber,
        instanceName: userState.instanceName,
      });
      this.userStates.delete(userState.contactNumber);
      return;
    }

    const { contactNumber, instanceName } = userState;
    const nodeData = node.data as BaseNodeData; // Cast para o tipo base que inclui os novos campos

    // Atualizar o estado do usuário
    userState.currentNodeId = nodeId;
    userState.lastInteraction = new Date();
    userState.aguardandoResposta = nodeData.aguardaResposta === true;
    userState.gatilhosAtivosNode =
      nodeData.gatilhos && nodeData.gatilhos.length > 0
        ? nodeData.gatilhos
        : null;
    userState.inicioAguardandoResposta = userState.aguardandoResposta
      ? new Date()
      : null;

    // Se o nó atual tiver uma label (mensagem a ser enviada), envie-a.
    // Isso se aplica a MessageNode, ListNode (título), ConditionalNode (pergunta)
    if (nodeData.label) {
      const messageToSend = nodeData.label;
      // TODO: Implementar substituição de variáveis do contexto na mensagem (ex: {{context.nome}})

      // Enviar mensagem com base no tipo de nó (simplificado)
      if (node.type === 'list' && (node.data as ListNodeData).options) {
        const listData = node.data as ListNodeData;
        await this.sendListMessage(
          {
            number: contactNumber,
            title: listData.label || 'Selecione uma opção',
            description: 'Escolha uma das opções abaixo',
            buttonText: 'Ver opções',
            footerText: 'Imperial Mídia WhatsApp Flow',
            sections: [
              {
                title: 'Opções disponíveis',
                rows: listData.options.map((option) => ({
                  title: option.text,
                  description: option.description || option.text,
                  rowId: option.id, // Usaremos o ID da opção como gatilho se for uma lista
                })),
              },
            ],
          },
          instanceName,
        );
      } else {
        // Para message, conditional (label é a pergunta), start, end
        await this.sendMessage({
          message: messageToSend,
          to: contactNumber,
          instanceName,
        });
      }
    }

    // Se o nó é do tipo 'end', finalizar o fluxo aqui.
    if (node.type === 'end') {
      this.userStates.delete(contactNumber);
      // A mensagem de 'end' já foi enviada acima se nodeData.label existia.
      console.log(`🏁 Fluxo finalizado para ${contactNumber} no nó ${nodeId}`);
      return;
    }

    // Se o nó NÃO aguarda resposta e não é um nó final, tentar avançar automaticamente.
    if (!userState.aguardandoResposta && node.type !== 'end') {
      console.log(
        `⏩ Nó ${nodeId} não aguarda resposta, tentando avançar automaticamente para ${contactNumber}.`,
      );
      await this.avancarParaProximoNo(userState, flow, null, node); // mensagemGatilho é null para avanço automático
    }
  }

  private verificarGatilhosNoNode(
    mensagem: string,
    gatilhos: NodeGatilho[] | null | undefined,
  ): NodeGatilho | null {
    if (!gatilhos || gatilhos.length === 0) {
      // Se aguardaResposta é true mas não há gatilhos definidos, qualquer mensagem pode ser considerada um "match"
      // para simplesmente prosseguir, ou podemos definir um gatilho "qualquer" implícito.
      // Por agora, retornaremos null e a lógica em processIncomingMessage decidirá.
      // Alternativamente, poderia retornar um gatilho do tipo "qualquer" se essa for a intenção.
      return null;
    }

    const mensagemLower = mensagem.toLowerCase();

    for (const gatilho of gatilhos) {
      if (gatilho.tipo === 'qualquer') {
        return gatilho;
      }
      if (gatilho.valor) {
        // Certificar que valor existe para texto e regex
        if (gatilho.tipo === 'texto') {
          if (mensagemLower === gatilho.valor.toLowerCase()) {
            return gatilho;
          }
        } else if (gatilho.tipo === 'regex') {
          try {
            const regex = new RegExp(gatilho.valor, 'i');
            if (regex.test(mensagemLower)) {
              return gatilho;
            }
          } catch (e) {
            console.error(`❌ Erro ao processar regex "${gatilho.valor}":`, e);
            // Ignorar regex inválida e continuar
          }
        }
      }
    }
    return null; // Nenhum gatilho correspondeu
  }

  private async avancarParaProximoNo(
    userState: UserState,
    flow: WhatsappFlowData,
    mensagemGatilho: string | null, // A mensagem que ativou o gatilho do nó ANTERIOR (ex: ID da opção da lista)
    noAnteriorProcessado: FlowNode, // O nó que acabamos de processar
  ): Promise<void> {
    const { contactNumber, instanceName, currentNodeId } = userState;
    let proximoNoId: string | null = null;

    // 1. Se o gatilho que foi satisfeito no nó anterior já especifica um proximoNoId
    if (mensagemGatilho && userState.gatilhosAtivosNode) {
      const gatilhoSatisfeito = this.verificarGatilhosNoNode(
        mensagemGatilho,
        userState.gatilhosAtivosNode,
      );
      if (gatilhoSatisfeito?.proximoNoId) {
        proximoNoId = gatilhoSatisfeito.proximoNoId;
      }
    }

    // 2. Se não, verificar as arestas de saída do nó atual
    if (!proximoNoId) {
      const outgoingEdges = flow.edges.filter(
        (edge) => edge.source === currentNodeId,
      );

      if (outgoingEdges.length === 0) {
        console.log(
          `🔚 Sem próximas arestas para o nó ${currentNodeId}. Finalizando fluxo para ${contactNumber}.`,
        );
        // A mensagem de final de fluxo deve ser tratada pelo nó 'end' ou aqui se for implícito.
        // this.userStates.delete(contactNumber); // O nó 'end' já deve fazer isso.
        return; // Fim do fluxo por falta de arestas
      }

      // Lógica para selecionar a aresta/próximo nó:
      if (noAnteriorProcessado.type === 'list' && mensagemGatilho) {
        // Para nós de lista, a mensagemGatilho é o ID da opção selecionada.
        // Procurar uma aresta cujo sourceHandle corresponda ao ID da opção OU uma opção com proximoNoId.
        const listData = noAnteriorProcessado.data as ListNodeData;
        const selectedOption = listData.options.find(
          (opt) => opt.id === mensagemGatilho,
        );
        if (selectedOption?.proximoNoId) {
          proximoNoId = selectedOption.proximoNoId;
        }
        if (!proximoNoId) {
          const edgeForOption = outgoingEdges.find(
            (edge) => edge.sourceHandle === mensagemGatilho,
          );
          if (edgeForOption) proximoNoId = edgeForOption.target;
        }
      } else if (
        noAnteriorProcessado.type === 'conditional' &&
        mensagemGatilho
      ) {
        // Para nós condicionais, a mensagemGatilho é a resposta do usuário.
        // A lógica de qual handle usar (ex: 'yes', 'no') deve ser determinada pelos gatilhos do nó condicional
        // e o proximoNoId já teria sido definido no passo 1.
        // Se não foi, podemos ter uma lógica de fallback aqui baseada em sourceHandle, mas é mais limpo via gatilhos.
        // Por simplicidade, se os gatilhos do nó condicional não definiram proximoNoId, pegamos a primeira aresta.
        if (outgoingEdges.length > 0 && !proximoNoId) {
          // Esta é uma simplificação. Idealmente, o nó condicional teria gatilhos que definem proximoNoId.
          console.warn(
            `⚠️ Lógica condicional para ${currentNodeId} não resolveu proximoNoId via gatilhos. Usando primeira aresta.`,
          );
          proximoNoId = outgoingEdges[0].target;
        }
      } else {
        // Para outros tipos de nós ou se não houver lógica específica, pegar a primeira aresta de saída
        if (outgoingEdges.length > 0) {
          proximoNoId = outgoingEdges[0].target;
        }
      }
    }

    if (proximoNoId) {
      console.log(
        `➡️ Avançando para o próximo nó ${proximoNoId} para ${contactNumber}.`,
      );
      await this.processNode(proximoNoId, flow, userState);
    } else {
      console.log(
        `🚫 Não foi possível determinar o próximo nó para ${contactNumber} a partir de ${currentNodeId}. Fluxo pode ter terminado ou há um erro de configuração.`,
      );
      // Considerar enviar uma mensagem de erro ou finalizar o fluxo se nenhum próximo nó for encontrado e não for um nó 'end'.
      // Se o nó atual não era um nó 'end', e não conseguimos avançar, isso pode ser um beco sem saída.
      if (noAnteriorProcessado.type !== 'end') {
        await this.sendMessage({
          message:
            'Não foi possível determinar o próximo passo. O fluxo pode ter terminado inesperadamente.',
          to: contactNumber,
          instanceName,
        });
        this.userStates.delete(contactNumber);
      }
    }
  }

  /**
   * Adiciona um novo gatilho de fluxo
   */
  addFlowTrigger(keyword: string | RegExp, flowId: string) {
    this.flowTriggers.push({ keyword, flowId });
  }

  /**
   * Remove um gatilho de fluxo
   */
  removeFlowTrigger(flowId: string) {
    this.flowTriggers = this.flowTriggers.filter(
      (trigger) => trigger.flowId !== flowId,
    );
  }

  /**
   * Retorna todos os gatilhos de fluxo cadastrados
   */
  getFlowTriggers() {
    return this.flowTriggers.map((trigger) => ({
      keyword:
        trigger.keyword instanceof RegExp
          ? trigger.keyword.toString()
          : trigger.keyword,
      flowId: trigger.flowId,
      isRegex: trigger.keyword instanceof RegExp,
    }));
  }

  onModuleDestroy() {
    this.sockets.forEach((socket, instanceName) => {
      if (socket) {
        socket.disconnect();
        console.log(
          `🔌 Socket da instância ${instanceName} desconectado ao destruir o módulo.`,
        );
      }
    });
    this.sockets.clear();
  }

  async sendMessage({
    message,
    instanceName,
    to,
  }: {
    message: string;
    instanceName?: string;
    to?: string;
  }): Promise<any> {
    try {
      // Usar a instância especificada ou a primeira disponível
      const targetInstance = instanceName || this.sockets.keys().next().value;

      return await fetch(
        `http://${this.host}:${this.port}/message/sendText/${targetInstance}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: '429683C4C977415CAAFCCE10F7D57E11',
          },
          body: JSON.stringify({ text: message, number: to }),
        },
      ).then((data) => data.json());
    } catch (e) {
      console.error('❌ Erro ao enviar mensagem:', e);
      return { success: false, error: e.message };
    }
  }

  async sendListMessage(listMessage: ListMessage, instanceName?: string) {
    try {
      const targetInstance = instanceName || this.sockets.keys().next().value;

      // Garantir que todas as opções tenham descrições para a API
      const processedListMessage = {
        ...listMessage,
        sections: listMessage.sections.map((section) => ({
          ...section,
          rows: section.rows.map((row) => ({
            ...row,
            description: row.description || row.title, // Usar título como descrição se não houver uma
          })),
        })),
      };

      const data = await fetch(
        `http://${this.host}:${this.port}/message/sendList/${targetInstance}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: '429683C4C977415CAAFCCE10F7D57E11',
          },
          body: JSON.stringify(processedListMessage),
        },
      ).then((data) => data.json());
      return data;
    } catch (e) {
      console.error('❌ Erro ao enviar mensagem:', e);
      return { success: false, error: e.message };
    }
  }

  // Método para obter o socket de uma instância específica
  getSocket(instanceName: string): Socket | undefined {
    return this.sockets.get(instanceName);
  }

  // Método para obter todas as instâncias com sockets
  getInstances(): string[] {
    return Array.from(this.sockets.keys());
  }

  async fetchInstances(): Promise<Instance[]> {
    try {
      return await fetch(
        `http://${this.host}:${this.port}/instance/fetchInstances`,
        {
          method: 'GET',
          headers: {
            apikey: '429683C4C977415CAAFCCE10F7D57E11',
          },
        },
      ).then((data) => data.json());
    } catch (e) {
      console.error('Erro ao buscar instâncias:', e);
      throw new Error(e);
    }
  }
}
