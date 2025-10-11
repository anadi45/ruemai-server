import { Module } from '@nestjs/common';
import { DemoAutomationController } from './demo-automation.controller';
import { DemoAutomationService } from './demo-automation.service';

@Module({
  controllers: [DemoAutomationController],
  providers: [DemoAutomationService],
  exports: [DemoAutomationService],
})
export class DemoAutomationModule {}
