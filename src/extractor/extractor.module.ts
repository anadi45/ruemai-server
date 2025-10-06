import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ExtractorService } from './extractor.service';
import { ExtractorController } from './extractor.controller';

@Module({
  imports: [ConfigModule],
  controllers: [ExtractorController],
  providers: [ExtractorService],
  exports: [ExtractorService],
})
export class ExtractorModule {}
