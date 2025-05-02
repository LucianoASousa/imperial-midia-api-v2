// src/socket/socket-client.module.ts

import { Module } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { WhatsappController } from './whatsapp.controller';

@Module({
  providers: [WhatsappService],
  controllers: [WhatsappController],
  exports: [WhatsappService], // exporta para ser usado em outros lugares
})
export class WhatsappModule {}
