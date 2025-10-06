import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LLMService } from './llm.service';
import { CacheModule } from '../cache/cache.module';

@Module({
  imports: [ConfigModule, CacheModule],
  providers: [LLMService],
  exports: [LLMService],
})
export class LLMModule {}
