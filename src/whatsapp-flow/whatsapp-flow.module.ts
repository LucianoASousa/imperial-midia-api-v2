import { Module, forwardRef } from '@nestjs/common';
import { WhatsappFlowService } from './whatsapp-flow.service';
import { WhatsappFlowController } from './whatsapp-flow.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { ProductsModule } from '../products/products.module';

@Module({
  imports: [PrismaModule, forwardRef(() => WhatsappModule), ProductsModule],
  controllers: [WhatsappFlowController],
  providers: [WhatsappFlowService],
  exports: [WhatsappFlowService],
})
export class WhatsappFlowModule {}
