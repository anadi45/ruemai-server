import { Module } from '@nestjs/common';
import { WebCrawlerService } from './web-crawler.service';
import { ParserModule } from '../parser/parser.module';

@Module({
  imports: [ParserModule],
  providers: [WebCrawlerService],
  exports: [WebCrawlerService],
})
export class WebCrawlerModule {}
