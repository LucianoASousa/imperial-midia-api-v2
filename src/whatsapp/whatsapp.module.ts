// src/socket/socket-client.module.ts

import { forwardRef, Module } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { WhatsappController } from './whatsapp.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { WhatsappFlowModule } from '../whatsapp-flow/whatsapp-flow.module';

@Module({
  imports: [PrismaModule, forwardRef(() => WhatsappFlowModule)],
  providers: [WhatsappService],
  controllers: [WhatsappController],
  exports: [WhatsappService], // exporta para ser usado em outros lugares
})
export class WhatsappModule {}
