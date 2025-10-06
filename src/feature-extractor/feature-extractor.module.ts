import { Module } from '@nestjs/common';
import { FeatureExtractorService } from './feature-extractor.service';
import { LLMModule } from '../llm/llm.module';

@Module({
  imports: [LLMModule],
  providers: [FeatureExtractorService],
  exports: [FeatureExtractorService],
})
export class FeatureExtractorModule {}
