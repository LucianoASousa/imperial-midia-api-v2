import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import {
  CreateFlowDto,
  FlowExecutionResponse,
  UpdateFlowDto,
  WhatsappFlowData,
} from './types';

@Injectable()
export class WhatsappFlowService {
  constructor(
    private prisma: PrismaService,
    private whatsappService: WhatsappService,
  ) {}

  async createFlow(createFlowDto: CreateFlowDto): Promise<WhatsappFlowData> {
    // Criar o fluxo base
    const flow = await this.prisma.whatsappFlow.create({
      data: {
        name: createFlowDto.name,
        description: createFlowDto.description,
        instanceName: createFlowDto.instanceName,
      },
    });

    // Criar os nós
    const createdNodes = await Promise.all(
      createFlowDto.nodes.map(async (node) => {
        return await this.prisma.flowNode.create({
          data: {
            type: node.type,
            position: node.position,
            data: node.data,
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

        return await this.prisma.flowEdge.create({
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
    const flows = await this.prisma.whatsappFlow.findMany({
      include: {
        nodes: true,
        edges: true,
      },
    });

    return flows.map((flow) => this.mapFlowToDto(flow));
  }

  async getFlowById(id: string): Promise<WhatsappFlowData> {
    const flow = await this.prisma.whatsappFlow.findUnique({
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
    const existingFlow = await this.prisma.whatsappFlow.findUnique({
      where: { id },
    });

    if (!existingFlow) {
      throw new NotFoundException(`Fluxo com ID ${id} não encontrado`);
    }

    // Atualizar dados básicos do fluxo
    await this.prisma.whatsappFlow.update({
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
      await this.prisma.flowNode.deleteMany({
        where: { flowId: id },
      });

      // Criar os novos nós
      const createdNodes = await Promise.all(
        updateFlowDto.nodes.map(async (node) => {
          return await this.prisma.flowNode.create({
            data: {
              type: node.type,
              position: node.position,
              data: node.data,
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

            return await this.prisma.flowEdge.create({
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
    const flow = await this.prisma.whatsappFlow.findUnique({
      where: { id },
    });

    if (!flow) {
      throw new NotFoundException(`Fluxo com ID ${id} não encontrado`);
    }

    // Excluir o fluxo (nós e arestas serão excluídos em cascata)
    await this.prisma.whatsappFlow.delete({
      where: { id },
    });
  }

  async executeFlow(
    flowId: string,
    contactNumber: string,
  ): Promise<FlowExecutionResponse> {
    try {
      // Obter o fluxo completo
      const flow = await this.getFlowById(flowId);

      if (!flow.instanceName) {
        return {
          success: false,
          message: 'Este fluxo não possui uma instância de WhatsApp associada',
          error: 'NO_INSTANCE',
        };
      }

      // Encontrar o nó inicial (start)
      const startNode = flow.nodes.find((node) => node.type === 'start');
      if (!startNode) {
        return {
          success: false,
          message: 'Este fluxo não possui um nó inicial',
          error: 'NO_START_NODE',
        };
      }

      // Encontrar o primeiro nó após o start
      const outgoingEdges = flow.edges.filter(
        (edge) => edge.source === startNode.id,
      );
      if (outgoingEdges.length === 0) {
        return {
          success: false,
          message: 'Nó inicial não está conectado a nenhum outro nó',
          error: 'NO_OUTGOING_EDGES',
        };
      }

      // Obter nó de destino
      const nextNodeId = outgoingEdges[0].target;
      const nextNode = flow.nodes.find((node) => node.id === nextNodeId);

      // Processar o próximo nó
      if (nextNode.type === 'message') {
        // Enviar mensagem de texto
        await this.sendTextMessage(
          flow.instanceName,
          contactNumber,
          nextNode.data.label,
        );

        // Continuar processando o fluxo para o próximo nó após a mensagem
        const nextEdges = flow.edges.filter(
          (edge) => edge.source === nextNode.id,
        );
        const nextNodeIds = nextEdges.map((edge) => edge.target);

        return {
          success: true,
          message: 'Mensagem enviada com sucesso',
          currentNodeId: nextNode.id,
          nextNodeIds,
        };
      } else if (nextNode.type === 'list') {
        // Enviar mensagem com lista de opções
        const listData = nextNode.data as any;
        await this.sendListMessage(flow.instanceName, contactNumber, listData);

        return {
          success: true,
          message: 'Lista de opções enviada com sucesso',
          currentNodeId: nextNode.id,
        };
      }

      return {
        success: true,
        message: 'Fluxo iniciado com sucesso',
        currentNodeId: startNode.id,
        nextNodeIds: [nextNodeId],
      };
    } catch (error) {
      console.error('Erro ao executar fluxo:', error);
      return {
        success: false,
        message: 'Erro ao executar o fluxo',
        error: error.message,
      };
    }
  }

  private async sendTextMessage(
    instanceName: string,
    number: string,
    text: string,
  ): Promise<any> {
    await this.whatsappService.sendMessage({
      message: text,
      instanceName,
      to: number,
    });
    return { success: true };
  }

  private async sendListMessage(
    instanceName: string,
    number: string,
    listData: any,
  ): Promise<any> {
    const listMessage = {
      number: number,
      title: listData.label || 'Selecione uma opção',
      description: 'Escolha uma das opções abaixo',
      buttonText: 'Ver opções',
      footerText: 'Imperial Mídia WhatsApp Flow',
      sections: [
        {
          title: 'Opções disponíveis',
          rows: listData.options.map((option) => ({
            title: option.text,
            description: 'a',
            rowId: option.id,
          })),
        },
      ],
    };

    // Enviar a mensagem com lista usando o WhatsappService
    return await this.whatsappService.sendListMessage(
      listMessage,
      instanceName,
    );
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
}
