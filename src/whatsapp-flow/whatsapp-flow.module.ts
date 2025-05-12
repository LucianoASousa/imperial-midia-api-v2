import { Module, forwardRef } from '@nestjs/common';
import { WhatsappFlowService } from './whatsapp-flow.service';
import { WhatsappFlowController } from './whatsapp-flow.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [PrismaModule, forwardRef(() => WhatsappModule)],
  controllers: [WhatsappFlowController],
  providers: [WhatsappFlowService],
  exports: [WhatsappFlowService],
})
export class WhatsappFlowModule {}
