import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { WhatsappFlowService } from './whatsapp-flow.service';
import {
  CreateFlowDto,
  FlowExecutionResponse,
  UpdateFlowDto,
  WhatsappFlowData,
} from './types';

@Controller('whatsapp-flow')
export class WhatsappFlowController {
  constructor(private readonly whatsappFlowService: WhatsappFlowService) {}

  @Post()
  async createFlow(
    @Body() createFlowDto: CreateFlowDto,
  ): Promise<WhatsappFlowData> {
    return await this.whatsappFlowService.createFlow(createFlowDto);
  }

  @Get()
  async getAllFlows(): Promise<WhatsappFlowData[]> {
    return await this.whatsappFlowService.getAllFlows();
  }

  @Get(':id')
  async getFlowById(@Param('id') id: string): Promise<WhatsappFlowData> {
    return await this.whatsappFlowService.getFlowById(id);
  }

  @Put(':id')
  async updateFlow(
    @Param('id') id: string,
    @Body() updateFlowDto: UpdateFlowDto,
  ): Promise<WhatsappFlowData> {
    return await this.whatsappFlowService.updateFlow(id, updateFlowDto);
  }

  @Delete(':id')
  async deleteFlow(@Param('id') id: string): Promise<void> {
    return await this.whatsappFlowService.deleteFlow(id);
  }

  @Post(':id/execute')
  async executeFlow(
    @Param('id') id: string,
    @Body() payload: { contactNumber: string; messageContent?: string },
  ): Promise<FlowExecutionResponse> {
    return await this.whatsappFlowService.executeFlow(
      id,
      payload.contactNumber,
    );
  }
}
