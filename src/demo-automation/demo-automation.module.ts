import { Module } from '@nestjs/common';
import { DemoAutomationController } from './demo-automation.controller';
import { DemoAutomationService } from './demo-automation.service';
import { LLMService } from './services/llm.service';
import { ActionPlanService } from './services/action-plan.service';
import { PuppeteerWorkerService } from './services/puppeteer-worker.service';
import { WebAutomation } from '../agents/web-automation/agent';
import { IntelligentElementDiscoveryService } from './services/intelligent-element-discovery.service';
import { ActionLoggerService } from './services/action-logger.service';

@Module({
  controllers: [DemoAutomationController],
  providers: [
    DemoAutomationService,
    LLMService,
    ActionPlanService,
    PuppeteerWorkerService,
    WebAutomation,
    IntelligentElementDiscoveryService,
    ActionLoggerService
  ],
  exports: [DemoAutomationService],
})
export class DemoAutomationModule {}
