import { Module } from '@nestjs/common';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { UpMidiAssProvider } from './providers/upmidiass-provider';

@Module({
  imports: [PrismaModule],
  controllers: [ProductsController],
  providers: [ProductsService, UpMidiAssProvider],
  exports: [ProductsService],
})
export class ProductsModule {}
