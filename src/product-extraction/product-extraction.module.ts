import { Module } from '@nestjs/common';
import { ProductExtractionService } from './product-extraction.service';
import { ProductExtractionController } from './product-extraction.controller';
import { DocumentParserModule } from '../document-parser/document-parser.module';
import { WebCrawlerModule } from '../web-crawler/web-crawler.module';
import { UploadModule } from '../upload/upload.module';
import { LLMModule } from '../llm/llm.module';

@Module({
  imports: [DocumentParserModule, WebCrawlerModule, UploadModule, LLMModule],
  controllers: [ProductExtractionController],
  providers: [ProductExtractionService],
  exports: [ProductExtractionService],
})
export class ProductExtractionModule {}
