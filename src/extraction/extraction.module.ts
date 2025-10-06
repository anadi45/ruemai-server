import { Module } from '@nestjs/common';
import { ExtractionService } from './extraction.service';
import { ExtractionController } from './extraction.controller';
import { UploadModule } from '../upload/upload.module';
import { WebCrawlerModule } from '../web-crawler/web-crawler.module';
import { ParserModule } from '../parser/parser.module';
import { FeatureExtractorModule } from '../feature-extractor/feature-extractor.module';

@Module({
  imports: [
    UploadModule,
    WebCrawlerModule,
    ParserModule,
    FeatureExtractorModule,
  ],
  controllers: [ExtractionController],
  providers: [ExtractionService],
  exports: [ExtractionService],
})
export class ExtractionModule {}
