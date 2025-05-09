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
import { WhatsappFlowData } from '../whatsapp-flow/types';
import { PrismaService } from '../prisma/prisma.service';

// Tipos para o sistema de chatbot
interface UserState {
  flowId: string;
  currentNodeId: string;
  contactNumber: string;
  lastInteraction: Date;
  instanceName: string;
  context: Record<string, any>;
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
      // Buscar todos os fluxos ativos
      const activeFlows = await this.prisma.whatsappFlow.findMany({
        where: { active: true },
      });

      // Resetar gatilhos
      this.flowTriggers = [];

      // Para cada fluxo, adicionar um gatilho baseado no nome
      activeFlows.forEach((flow) => {
        // Usando o nome do fluxo como gatilho padrão (em minúsculas)
        this.flowTriggers.push({
          keyword: new RegExp(`^${flow.name.toLowerCase()}$`, 'i'),
          flowId: flow.id,
        });
      });

      console.log(
        `✅ Carregados ${this.flowTriggers.length} gatilhos de fluxo`,
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
      // Verificar se é uma mensagem recebida (não enviada pelo bot)
      if (!data.messages || data.messages.length === 0) return;

      // Pegar a primeira mensagem do array
      const messageData = data.messages[0];

      // Ignorar mensagens enviadas pelo bot
      if (messageData.key.fromMe) return;

      // Extrair o número do remetente (remover @c.us no final)
      const contactNumber = messageData.key.remoteJid.replace('@c.us', '');

      // Extrair texto da mensagem
      const messageText = this.extractMessageText(messageData.message);

      console.log(`💬 Mensagem recebida de ${contactNumber}: ${messageText}`);

      // Verificar se o usuário está em algum fluxo ativo
      const userState = this.userStates.get(contactNumber);

      if (userState) {
        // Usuário está em um fluxo, continuar a partir do ponto atual
        await this.continueUserFlow(userState, messageText);
      } else {
        // Usuário não está em nenhum fluxo, verificar se a mensagem ativa algum gatilho
        await this.checkFlowTriggers(messageText, contactNumber, instanceName);
      }
    } catch (error) {
      console.error('❌ Erro ao processar mensagem:', error);
    }
  }

  /**
   * Extrai o texto de diferentes tipos de mensagens
   */
  private extractMessageText(message: any): string {
    if (message.conversation) {
      return message.conversation;
    } else if (message.listResponseMessage?.singleSelectReply?.selectedRowId) {
      return message.listResponseMessage.singleSelectReply.selectedRowId;
    } else if (message.buttonsResponseMessage?.selectedButtonId) {
      return message.buttonsResponseMessage.selectedButtonId;
    } else if (message.extendedTextMessage?.text) {
      return message.extendedTextMessage.text;
    }

    return '';
  }

  /**
   * Verifica se a mensagem corresponde a algum gatilho de fluxo
   */
  private async checkFlowTriggers(
    messageText: string,
    contactNumber: string,
    instanceName: string,
  ) {
    const lowerCaseMsg = messageText.toLowerCase();

    // Verificar cada gatilho
    for (const trigger of this.flowTriggers) {
      const isMatch =
        typeof trigger.keyword === 'string'
          ? lowerCaseMsg === trigger.keyword.toLowerCase()
          : trigger.keyword.test(lowerCaseMsg);

      if (isMatch) {
        // Iniciar o fluxo correspondente
        await this.startFlow(trigger.flowId, contactNumber, instanceName);
        return;
      }
    }

    // Se não encontrou nenhum gatilho, pode enviar uma mensagem padrão
    await this.sendMessage({
      message:
        'Olá! Não entendi sua mensagem. Para iniciar uma conversa, digite o nome de um dos nossos serviços.',
      to: contactNumber,
      instanceName,
    });
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
      // Executar o fluxo
      const result = await this.whatsappFlowService.executeFlow(
        flowId,
        contactNumber,
      );

      if (result.success) {
        // Salvar o estado do usuário
        this.userStates.set(contactNumber, {
          flowId,
          currentNodeId: result.currentNodeId,
          contactNumber,
          lastInteraction: new Date(),
          instanceName,
          context: {},
        });
      } else {
        console.error(`❌ Erro ao iniciar fluxo: ${result.error}`);
      }
    } catch (error) {
      console.error(`❌ Erro ao iniciar fluxo ${flowId}:`, error);
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
    if (!node) return;

    const { contactNumber, instanceName } = userState;

    // Atualizar o estado do usuário
    userState.currentNodeId = nodeId;
    userState.lastInteraction = new Date();

    switch (node.type) {
      case 'message':
        // Enviar uma mensagem simples
        await this.sendMessage({
          message: node.data.label,
          to: contactNumber,
          instanceName,
        });

        // Verificar se há próximos nós
        const nextEdges = flow.edges.filter((edge) => edge.source === nodeId);
        if (nextEdges.length > 0) {
          // Continuar automaticamente para o próximo nó
          await this.processNode(nextEdges[0].target, flow, userState);
        } else {
          // Fim do fluxo
          this.userStates.delete(contactNumber);
        }
        break;

      case 'list':
        // Enviar uma mensagem com lista de opções
        const listData = node.data as any;
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
                  description: option.text,
                  rowId: option.id,
                })),
              },
            ],
          },
          instanceName,
        );
        break;

      case 'conditional':
        // Enviar uma mensagem perguntando algo
        const conditionalData = node.data as any;
        await this.sendMessage({
          message: conditionalData.label,
          to: contactNumber,
          instanceName,
        });
        break;

      case 'end':
        // Enviar mensagem final e limpar o estado
        await this.sendMessage({
          message: node.data.label,
          to: contactNumber,
          instanceName,
        });
        this.userStates.delete(contactNumber);
        break;
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
