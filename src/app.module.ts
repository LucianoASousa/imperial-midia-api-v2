import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { WhatsappModule } from './whatsapp/whatsapp.module';
import { WhatsappFlowModule } from './whatsapp-flow/whatsapp-flow.module';

@Module({
  imports: [PrismaModule, WhatsappModule, WhatsappFlowModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
