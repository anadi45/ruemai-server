import { Module } from '@nestjs/common';
import { DemoAutomationController } from './demo-automation.controller';
import { DemoAutomationService } from './demo-automation.service';
import { BrowserModule } from '../browser/browser.module';

@Module({
  imports: [BrowserModule],
  controllers: [DemoAutomationController],
  providers: [DemoAutomationService],
  exports: [DemoAutomationService],
})
export class DemoAutomationModule {}
