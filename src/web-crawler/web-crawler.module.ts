import { Module } from '@nestjs/common';
import { WebCrawlerService } from './web-crawler.service';
import { ParserModule } from '../parser/parser.module';
import { DebugLogger } from '../utils/debug-logger';

@Module({
  imports: [ParserModule],
  providers: [WebCrawlerService, DebugLogger],
  exports: [WebCrawlerService],
})
export class WebCrawlerModule {}
