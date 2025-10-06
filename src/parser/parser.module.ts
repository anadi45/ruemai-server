import { Module } from '@nestjs/common';
import { ParserService } from './parser.service';
import { DebugLogger } from '../utils/debug-logger';

@Module({
  providers: [ParserService, DebugLogger],
  exports: [ParserService],
})
export class ParserModule {}
