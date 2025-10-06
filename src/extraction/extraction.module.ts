import { Module } from '@nestjs/common';
import { ExtractionService } from './extraction.service';
import { ExtractionController } from './extraction.controller';
import { UploadModule } from '../upload/upload.module';
import { WebCrawlerModule } from '../web-crawler/web-crawler.module';
import { ParserModule } from '../parser/parser.module';
import { FeatureExtractorModule } from '../feature-extractor/feature-extractor.module';
import { CacheModule } from '../cache/cache.module';
import { PerformanceModule } from '../performance/performance.module';
import { DebugLogger } from '../utils/debug-logger';

@Module({
  imports: [
    UploadModule,
    WebCrawlerModule,
    ParserModule,
    FeatureExtractorModule,
    CacheModule,
    PerformanceModule,
  ],
  controllers: [ExtractionController],
  providers: [ExtractionService, DebugLogger],
  exports: [ExtractionService],
})
export class ExtractionModule {}
