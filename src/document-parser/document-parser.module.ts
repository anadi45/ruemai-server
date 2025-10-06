import { Module } from '@nestjs/common';
import { DocumentParserService } from './document-parser.service';
import { LLMModule } from '../llm/llm.module';

@Module({
  imports: [LLMModule],
  providers: [DocumentParserService],
  exports: [DocumentParserService],
})
export class DocumentParserModule {}
