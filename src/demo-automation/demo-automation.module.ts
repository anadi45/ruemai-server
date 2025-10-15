import { Module } from '@nestjs/common';
import { DemoAutomationController } from './demo-automation.controller';
import { DemoAutomationService } from './demo-automation.service';
import { GeminiService } from './services/gemini.service';
import { PuppeteerWorkerService } from './services/puppeteer-worker.service';
import { LangGraphWorkflowService } from './services/langgraph-workflow.service';
import { SmartLangGraphAgentService } from './services/smart-langgraph-agent.service';
import { IntelligentElementDiscoveryService } from './services/intelligent-element-discovery.service';
import { ActionLoggerService } from './services/action-logger.service';

@Module({
  controllers: [DemoAutomationController],
  providers: [
    DemoAutomationService,
    GeminiService,
    PuppeteerWorkerService,
    LangGraphWorkflowService,
    SmartLangGraphAgentService,
    IntelligentElementDiscoveryService,
    ActionLoggerService
  ],
  exports: [DemoAutomationService],
})
export class DemoAutomationModule {}
