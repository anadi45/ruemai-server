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

  async loginToWebsite(
    websiteUrl: string,
    credentials: { username: string; password: string }
  ): Promise<CreateDemoResponseDto> {
    const demoId = uuidv4();
    const startTime = Date.now();

    try {
      // Initialize Puppeteer
      await this.puppeteerWorker.initialize();
      
      // Navigate to website
      await this.puppeteerWorker.navigateToUrl(websiteUrl);
      
      // Attempt login
      const loginSuccess = await this.puppeteerWorker.login(credentials);
      
      // Get page info
      const pageInfo = await this.getPageInfo();
      
      const processingTime = Date.now() - startTime;

      return {
        demoId,
        demoName: `Demo-${demoId.slice(0, 8)}`,
        websiteUrl,
        loginStatus: loginSuccess ? 'success' : 'failed',
        pageInfo,
        summary: {
          processingTime,
          loginAttempted: true,
          finalUrl: this.puppeteerWorker.getCurrentUrl() || websiteUrl
        }
      };
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    } finally {
      await this.puppeteerWorker.cleanup();
    }
  }

  private async getPageInfo() {
    try {
      const domState = await this.puppeteerWorker.getDOMState();
      
      return {
        title: domState.pageTitle,
        url: domState.currentUrl,
        bodyText: domState.visibleText.slice(0, 10).join(' '),
        totalElements: domState.clickableSelectors.length + 
                      domState.inputSelectors.length + 
                      domState.selectSelectors.length,
        buttons: domState.clickableSelectors.length,
        links: domState.clickableSelectors.filter(sel => sel.includes('a')).length,
        inputs: domState.inputSelectors.length
      };
    } catch (error) {
      console.error('Error getting page info:', error);
      return {
        title: 'Unknown',
        url: 'Unknown',
        bodyText: '',
        totalElements: 0,
        buttons: 0,
        links: 0,
        inputs: 0
      };
    }
  }

  async generateProductTourFromFiles(
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

      // Generate and log action plan
      let actionPlan: ActionPlan;
      try {
        actionPlan = await this.generateAndLogActionPlan(featureDocs, websiteUrl);
      } catch (error) {
        console.error('Failed to generate action plan with Gemini:', error);
        // Create a fallback plan
        actionPlan = {
          featureName: featureDocs.featureName,
          totalActions: 0,
          estimatedDuration: 0,
          scrapingStrategy: 'Fallback plan - Gemini service unavailable',
          actions: [],
          summary: {
            clickActions: 0,
            typeActions: 0,
            navigationActions: 0,
            waitActions: 0,
            extractActions: 0,
            evaluateActions: 0
          }
        };
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

      // Run the Smart LangGraph Agent
      const result = await this.smartAgent.runSmartAgent(
        actionPlan,
        tourConfig,
        featureDocs,
        credentials
      );

      // Get page info before cleanup
      const pageInfo = await this.getPageInfo();
      const pageTitle = await this.puppeteerWorker.getPageTitle() || 'Tour Page';

      // Build response
      const processingTime = Date.now() - startTime;

      return {
        demoId,
        demoName: `Tour-${featureDocs.featureName}-${demoId.slice(0, 8)}`,
        websiteUrl,
        loginStatus: 'success',
        pageInfo,
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
            pageInfo
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
      console.error('❌ Error generating action plan:', error);
      throw error;
    }
  }

  private getActionTypeEmoji(actionType: string): string {
    const emojiMap: Record<string, string> = {
      'click': '🖱️',
      'type': '⌨️',
      'navigate': '🧭',
      'wait': '⏳',
      'scroll': '📜',
      'select': '📋',
      'hover': '👆',
      'extract': '📊',
      'evaluate': '🔧'
    };
    return emojiMap[actionType] || '🔧';
  }

  async stopAllAutomation(): Promise<void> {
    await this.puppeteerWorker.cleanup();
    await this.langGraphWorkflow.stopWorkflow();
  }
}
