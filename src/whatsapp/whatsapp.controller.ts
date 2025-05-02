import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { ListMessage } from './type';

@Controller('whatsapp')
export class WhatsappController {
  constructor(private readonly whatsappService: WhatsappService) {}

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
}
