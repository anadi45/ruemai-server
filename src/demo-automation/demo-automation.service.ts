import { Injectable } from '@nestjs/common';
import { CreateDemoResponseDto } from './demo-automation.dto';
import { GeminiService } from './services/gemini.service';
import { PuppeteerWorkerService } from './services/puppeteer-worker.service';
import { LangGraphWorkflowService } from './services/langgraph-workflow.service';
import { SmartLangGraphAgentService } from './services/smart-langgraph-agent.service';
import { writePlanToFile } from './utils/plan-writer';
import { 
  TourConfig, 
  ProductDocs, 
  DemoAutomationResult,
  TourStep,
  ActionPlan
} from './types/demo-automation.types';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class DemoAutomationService {
  constructor(
    private geminiService: GeminiService,
    private puppeteerWorker: PuppeteerWorkerService,
    private langGraphWorkflow: LangGraphWorkflowService,
    private smartAgent: SmartLangGraphAgentService
  ) {}

  async generateProductTour(
    websiteUrl: string,
    credentials: { username: string; password: string },
    files: Express.Multer.File[],
    featureName?: string
  ): Promise<CreateDemoResponseDto> {
    const demoId = uuidv4();
    const startTime = Date.now();

    try {
      // Process files directly with Gemini
      console.log(`Processing ${files.length} files directly with Gemini...`);
      const extractedData = await this.geminiService.processFilesDirectly(files, featureName);

      // Convert to ProductDocs format
      const featureDocs: ProductDocs = {
        featureName: extractedData.featureName,
        description: extractedData.description,
        steps: extractedData.steps,
        selectors: extractedData.selectors,
        expectedOutcomes: extractedData.expectedOutcomes,
        prerequisites: extractedData.prerequisites,
      };

      // Generate and log intelligent action plan
      let actionPlan: ActionPlan;
      try {
        actionPlan = await this.generateAndLogActionPlan(featureDocs, websiteUrl);
        console.log('🧠 Generated intelligent, flexible action plan');
        console.log(`📋 Plan provides high-level guidance for ${actionPlan.actions.length} actions`);
        console.log('🎯 Agent will make intelligent decisions based on visual context');
      } catch (error) {
        console.error('Failed to generate intelligent action plan with Gemini:', error);
        throw error;
      }

      // Write the plan to JSON file
      writePlanToFile(actionPlan);

      // Generate tour configuration
      const tourConfig: TourConfig = {
        goal: websiteUrl,
        featureName: featureDocs.featureName,
        maxSteps: 10,
        timeout: 30000,
        includeScreenshots: true
      };

      // Initialize and login
      await this.puppeteerWorker.initialize();
      await this.puppeteerWorker.navigateToUrl(websiteUrl);
      const loginSuccess = await this.puppeteerWorker.login(credentials);

      if (!loginSuccess) {
        throw new Error('Login failed - cannot generate tour');
      }

      // Run the Intelligent Smart LangGraph Agent
      console.log('🤖 Starting Intelligent Smart LangGraph Agent...');
      console.log('🧠 Agent will intelligently adapt based on visual context and page state');
      console.log('🎯 Plan provides guidance but agent makes smart decisions');
      
      const result = await this.smartAgent.runSmartAgent(
        actionPlan,
        tourConfig,
        featureDocs,
        credentials
      );

      const pageTitle = await this.puppeteerWorker.getPageTitle() || 'Tour Page';

      // Build response
      const processingTime = Date.now() - startTime;

      return {
        demoId,
        demoName: `Tour-${featureDocs.featureName}-${demoId.slice(0, 8)}`,
        websiteUrl,
        loginStatus: 'success',
        summary: {
          processingTime,
          loginAttempted: true,
          finalUrl: result.finalUrl
        },
        scrapedData: {
          success: result.success,
          totalPages: 1,
          crawlTime: processingTime,
          pages: [{
            url: result.finalUrl,
            title: pageTitle,
            html: '', // Not storing full HTML for demo
            scrapedData: result.tourSteps,
            timestamp: new Date().toISOString(),
            pageInfo: {
              title: pageTitle,
              url: result.finalUrl,
              bodyText: '',
              totalElements: 0,
              buttons: 0,
              links: 0,
              inputs: 0
            }
          }]
        }
      };
    } catch (error) {
      console.error('Tour generation from files failed:', error);
      throw error;
    } finally {
      await this.puppeteerWorker.cleanup();
    }
  }


  async generateAndLogActionPlan(featureDocs: ProductDocs, websiteUrl: string): Promise<ActionPlan> {
    try {
      console.log('\n🤖 Generating Puppeteer Action Plan...');
      
      const actionPlan = await this.geminiService.generateActionPlan(featureDocs, websiteUrl);

      return actionPlan;
    } catch (error) {
      console.error('❌ Error generating intelligent action plan:', error);
      throw error;
    }
  }

  async stopAllAutomation(): Promise<void> {
    await this.puppeteerWorker.cleanup();
    await this.langGraphWorkflow.stopWorkflow();
  }
}
