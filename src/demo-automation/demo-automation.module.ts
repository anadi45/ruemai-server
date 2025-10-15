import { Module } from '@nestjs/common';
import { DemoAutomationController } from './demo-automation.controller';
import { DemoAutomationService } from './demo-automation.service';
import { GeminiService } from './services/gemini.service';
import { PuppeteerWorkerService } from './services/puppeteer-worker.service';
import { LangGraphWorkflowService } from './services/langgraph-workflow.service';
import { SmartLangGraphAgentService } from './services/smart-langgraph-agent.service';
import { IntelligentElementDiscoveryService } from './services/intelligent-element-discovery.service';
import { IntelligentScrapingService } from './services/intelligent-scraping.service';

@Module({
  controllers: [DemoAutomationController],
  providers: [
    DemoAutomationService,
    GeminiService,
    PuppeteerWorkerService,
    LangGraphWorkflowService,
    SmartLangGraphAgentService,
    IntelligentElementDiscoveryService,
    IntelligentScrapingService
  ],
  exports: [DemoAutomationService, IntelligentScrapingService],
})
export class DemoAutomationModule {}
