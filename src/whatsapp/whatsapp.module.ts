// src/socket/socket-client.module.ts

import { Module, forwardRef } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { WhatsappController } from './whatsapp.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { WhatsappFlowModule } from '../whatsapp-flow/whatsapp-flow.module';

@Module({
  imports: [PrismaModule, forwardRef(() => WhatsappFlowModule)],
  controllers: [WhatsappController],
  providers: [WhatsappService],
  exports: [WhatsappService],
})
export class WhatsappModule {}
