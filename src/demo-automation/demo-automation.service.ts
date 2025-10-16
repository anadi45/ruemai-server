import { Injectable } from '@nestjs/common';
import { CreateDemoResponseDto } from './demo-automation.dto';
import { GeminiService } from './services/gemini.service';
import { PuppeteerWorkerService } from './services/puppeteer-worker.service';
import { LangGraphWorkflowService } from './services/langgraph-workflow.service';
import { WebAutomationAgentService } from './services/web-automation-agent.service';
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
    private webAutomationAgent: WebAutomationAgentService
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

      // Generate and log intelligent roadmap
      let actionPlan: ActionPlan;
      try {
        actionPlan = await this.generateAndLogActionPlan(featureDocs, websiteUrl);
        console.log('🧠 Generated intelligent roadmap for feature demonstration');
        console.log(`📋 Roadmap provides ${actionPlan.actions.length} high-level goals`);
        console.log('🎯 Agent will figure out execution details based on visual analysis');
        console.log('🔍 Agent will intelligently navigate to and use the feature');
      } catch (error) {
        console.error('Failed to generate intelligent roadmap with Gemini:', error);
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

      // Run the Intelligent Web Automation Agent
      console.log('🤖 Starting Intelligent Web Automation Agent...');
      console.log('🧠 Agent will intelligently navigate to and use the feature');
      console.log('🎯 Roadmap provides goals, agent figures out execution details');
      console.log('🔍 Agent will analyze screenshots and make intelligent decisions');
      
      const result = await this.webAutomationAgent.runWebAutomationAgent(
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
      console.log('\n🧠 Generating Intelligent Roadmap...');
      console.log('🎯 Creating high-level goals for feature demonstration');
      console.log('🔍 Agent will figure out execution details through visual analysis');
      
      const actionPlan = await this.geminiService.generateActionPlan(featureDocs, websiteUrl);

      console.log('✅ Generated intelligent roadmap');
      console.log(`📋 Roadmap contains ${actionPlan.actions.length} high-level goals`);
      console.log('🧠 Agent will intelligently execute each goal based on visual context');

      return actionPlan;
    } catch (error) {
      console.error('❌ Error generating intelligent roadmap:', error);
      throw error;
    }
  }

  async stopAllAutomation(): Promise<void> {
    await this.puppeteerWorker.cleanup();
    await this.langGraphWorkflow.stopWorkflow();
  }
}
