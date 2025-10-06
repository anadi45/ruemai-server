import { Module } from '@nestjs/common';
import { WebCrawlerService } from './web-crawler.service';
import { LLMModule } from '../llm/llm.module';

@Module({
  imports: [LLMModule],
  providers: [WebCrawlerService],
  exports: [WebCrawlerService],
})
export class WebCrawlerModule {}
