import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Query,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { ListMessage } from './type';
import { WhatsappFlowService } from '../whatsapp-flow/whatsapp-flow.service';

// DTOs para adicionar gatilhos
class AddTriggerDto {
  keyword: string;
  flowId: string;
  isRegex?: boolean;
}

// Nova DTO para o novo endpoint de criação de gatilhos
class CreateTriggerDto {
  instanceName: string;
  type: 'keyword' | 'regex';
  value: string;
  flowId: string;
}

// DTO para mensagens recebidas do WhatsApp
class IncomingMessageDto {
  from: string; // Número do remetente no formato internacional
  message: string; // Conteúdo da mensagem
  instanceName?: string; // Nome da instância do WhatsApp (opcional)
}

@Controller('whatsapp')
export class WhatsappController {
  constructor(
    private readonly whatsappService: WhatsappService,
    @Inject(forwardRef(() => WhatsappFlowService))
    private readonly whatsappFlowService: WhatsappFlowService,
  ) {}

  @Get('instances')
  async fetchInstances() {
    return await this.whatsappService.fetchInstances();
  }

  @Get('active-sockets')
  getActiveSockets() {
    return {
      instances: this.whatsappService.getInstances(),
    };
  }

  @Post('list')
  async sendListMessage(@Body() listMessage: ListMessage) {
    return await this.whatsappService.sendListMessage(listMessage);
  }

  @Post('list/:instanceName')
  async sendListMessageToInstance(
    @Body() listMessage: ListMessage,
    @Param('instanceName') instanceName: string,
  ) {
    return await this.whatsappService.sendListMessage(
      listMessage,
      instanceName,
    );
  }

  // Novo endpoint para receber mensagens do WhatsApp
  @Post('incoming-message')
  async receiveIncomingMessage(@Body() messageDto: IncomingMessageDto) {
    try {
      // Processar a mensagem recebida através do serviço de fluxo
      await this.whatsappFlowService.processIncomingMessage(
        messageDto.from,
        messageDto.message,
      );

      return {
        success: true,
        message: 'Mensagem processada com sucesso',
      };
    } catch (error) {
      console.error('Erro ao processar mensagem:', error);
      return {
        success: false,
        message: 'Erro ao processar mensagem',
        error: error.message,
      };
    }
  }

  // Novos endpoints para compatibilidade com o frontend

  @Get('triggers')
  async getTriggers(@Query('instanceName') instanceName: string) {
    const allTriggers = this.whatsappService.getFlowTriggers();

    // Converter para formato que o frontend espera
    return allTriggers.map((trigger, index) => ({
      id: `trigger_${index}`,
      instanceName: instanceName || 'default',
      type: trigger.isRegex ? 'regex' : 'keyword',
      value:
        typeof trigger.keyword === 'string'
          ? trigger.keyword
          : (trigger.keyword as RegExp).toString().slice(1, -2), // Correção: adicionar cast explícito para RegExp
      flowId: trigger.flowId,
      createdAt: new Date().toISOString(),
    }));
  }

  @Post('triggers')
  async createTrigger(@Body() dto: CreateTriggerDto) {
    // Converter tipo e valor para formato esperado pelo serviço
    const keyword =
      dto.type === 'regex' ? new RegExp(dto.value, 'i') : dto.value;

    this.whatsappService.addFlowTrigger(keyword, dto.flowId);

    return {
      id: `trigger_${Date.now()}`,
      instanceName: dto.instanceName,
      type: dto.type,
      value: dto.value,
      flowId: dto.flowId,
      createdAt: new Date().toISOString(),
    };
  }

  @Delete('triggers/:id')
  async deleteTrigger(
    @Param('id') id: string,
    @Body() body: { flowId: string },
  ) {
    // Como não temos IDs reais para gatilhos, usamos o flowId para remoção
    this.whatsappService.removeFlowTrigger(body.flowId);

    return {
      success: true,
      message: `Gatilho ${id} removido com sucesso`,
    };
  }

  // Mantemos os endpoints antigos para compatibilidade

  @Post('trigger/add')
  async addTrigger(@Body() dto: AddTriggerDto) {
    // Converter para regex se especificado
    const keyword = dto.isRegex ? new RegExp(dto.keyword, 'i') : dto.keyword;

    this.whatsappService.addFlowTrigger(keyword, dto.flowId);
    return {
      success: true,
      message: `Gatilho "${dto.keyword}" adicionado para o fluxo ${dto.flowId}`,
    };
  }

  @Post('trigger/remove/:flowId')
  async removeTrigger(@Param('flowId') flowId: string) {
    this.whatsappService.removeFlowTrigger(flowId);
    return {
      success: true,
      message: `Gatilhos removidos para o fluxo ${flowId}`,
    };
  }

  @Get('trigger/list')
  async listTriggers() {
    return this.whatsappService.getFlowTriggers();
  }
}
