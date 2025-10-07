import { Module } from '@nestjs/common';
import { DemoAutomationController } from './demo-automation.controller';
import { DemoAutomationService } from './demo-automation.service';
import { LLMModule } from '../llm/llm.module';

@Module({
  imports: [LLMModule],
  controllers: [DemoAutomationController],
  providers: [DemoAutomationService],
  exports: [DemoAutomationService],
})
export class DemoAutomationModule {}
