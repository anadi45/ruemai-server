import { Injectable } from '@nestjs/common';
import { CreateDemoResponseDto } from './demo-automation.dto';
import { GeminiService } from './services/gemini.service';
import { PuppeteerWorkerService } from './services/puppeteer-worker.service';
import { LangGraphWorkflowService } from './services/langgraph-workflow.service';
import { DocumentParserService } from './services/document-parser.service';
import { 
  TourConfig, 
  ProductDocs, 
  DemoAutomationResult,
  TourStep 
} from './types/demo-automation.types';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class DemoAutomationService {
  constructor(
    private geminiService: GeminiService,
    private puppeteerWorker: PuppeteerWorkerService,
    private langGraphWorkflow: LangGraphWorkflowService,
    private documentParser: DocumentParserService
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

  async generateProductTour(
    websiteUrl: string,
    credentials: { username: string; password: string },
    tourConfig: TourConfig,
    featureDocs: ProductDocs
  ): Promise<CreateDemoResponseDto> {
    const demoId = uuidv4();
    const startTime = Date.now();

    try {
      // Initialize and login
      await this.puppeteerWorker.initialize();
      await this.puppeteerWorker.navigateToUrl(websiteUrl);
      const loginSuccess = await this.puppeteerWorker.login(credentials);

      if (!loginSuccess) {
        throw new Error('Login failed - cannot generate tour');
      }

      // Run the LangGraph workflow
      const result = await this.langGraphWorkflow.runDemoAutomation(
        tourConfig,
        featureDocs,
        credentials
      );

      // Build response
      const processingTime = Date.now() - startTime;

      return {
        demoId,
        demoName: `Tour-${tourConfig.featureName}-${demoId.slice(0, 8)}`,
        websiteUrl,
        loginStatus: 'success',
        pageInfo: await this.getPageInfo(),
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
            title: await this.puppeteerWorker.getPageTitle() || 'Tour Page',
            html: '', // Not storing full HTML for demo
            scrapedData: result.tourSteps,
            timestamp: new Date().toISOString(),
            pageInfo: await this.getPageInfo()
          }]
        }
      };
    } catch (error) {
      console.error('Tour generation failed:', error);
      throw error;
    } finally {
      await this.puppeteerWorker.cleanup();
    }
  }

  async generateTourForFeature(
    websiteUrl: string,
    credentials: { username: string; password: string },
    featureName: string
  ): Promise<DemoAutomationResult> {
    const tourConfig: TourConfig = {
      goal: `Automated tour for ${featureName}`,
      featureName,
      maxSteps: 10,
      timeout: 30000,
      includeScreenshots: true
    };

    const featureDocs: ProductDocs = {
      featureName,
      description: `Automated tour for ${featureName}`,
      steps: [
        `Navigate to ${featureName} section`,
        'Interact with key elements',
        'Complete the workflow'
      ],
      selectors: {},
      expectedOutcomes: [
        'Successfully navigate through the feature',
        'Complete the intended workflow'
      ]
    };

    try {
      await this.puppeteerWorker.initialize();
      await this.puppeteerWorker.navigateToUrl(websiteUrl);
      const loginSuccess = await this.puppeteerWorker.login(credentials);

      if (!loginSuccess) {
        throw new Error('Login failed');
      }

      return await this.langGraphWorkflow.runDemoAutomation(
        tourConfig,
        featureDocs,
        credentials
      );
    } catch (error) {
      console.error('Feature tour generation failed:', error);
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

  async generateProductTourFromFile(
    websiteUrl: string,
    credentials: { username: string; password: string },
    file: Express.Multer.File,
    featureName?: string
  ): Promise<CreateDemoResponseDto> {
    const demoId = uuidv4();
    const startTime = Date.now();

    try {
      // Parse the document
      const parsedDoc = await this.documentParser.parseDocument(file);
      const extractedDocs = await this.documentParser.extractFeatureDocsFromDocument(
        parsedDoc,
        featureName
      );

      // Validate the extracted documentation
      const validation = await this.documentParser.validateExtractedDocs(extractedDocs);
      
      if (!validation.isValid) {
        throw new Error(`Invalid feature documentation: ${validation.issues.join(', ')}`);
      }

      // Convert to ProductDocs format
      const featureDocs: ProductDocs = {
        featureName: extractedDocs.featureName,
        description: extractedDocs.description,
        steps: extractedDocs.steps,
        selectors: extractedDocs.selectors,
        expectedOutcomes: extractedDocs.expectedOutcomes,
        prerequisites: extractedDocs.prerequisites
      };

      // Generate tour configuration
      const tourConfig: TourConfig = {
        goal: featureDocs.description,
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

      // Run the LangGraph workflow
      const result = await this.langGraphWorkflow.runDemoAutomation(
        tourConfig,
        featureDocs,
        credentials
      );

      // Build response
      const processingTime = Date.now() - startTime;

      return {
        demoId,
        demoName: `Tour-${featureDocs.featureName}-${demoId.slice(0, 8)}`,
        websiteUrl,
        loginStatus: 'success',
        pageInfo: await this.getPageInfo(),
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
            title: await this.puppeteerWorker.getPageTitle() || 'Tour Page',
            html: '', // Not storing full HTML for demo
            scrapedData: result.tourSteps,
            timestamp: new Date().toISOString(),
            pageInfo: await this.getPageInfo()
          }]
        }
      };
    } catch (error) {
      console.error('Tour generation from file failed:', error);
      throw error;
    } finally {
      await this.puppeteerWorker.cleanup();
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
      // Parse all documents and combine their content
      const allParsedDocs = [];
      for (const file of files) {
        const parsedDoc = await this.documentParser.parseDocument(file);
        allParsedDocs.push(parsedDoc);
      }

      // Extract feature docs from all documents
      const extractedDocs = await this.documentParser.extractFeatureDocsFromDocuments(
        allParsedDocs,
        featureName
      );

      // Validate the extracted documentation
      const validation = await this.documentParser.validateExtractedDocs(extractedDocs);
      
      if (!validation.isValid) {
        throw new Error(`Invalid feature documentation: ${validation.issues.join(', ')}`);
      }

      // Convert to ProductDocs format
      const featureDocs: ProductDocs = {
        featureName: extractedDocs.featureName,
        description: extractedDocs.description,
        steps: extractedDocs.steps,
        selectors: extractedDocs.selectors,
        expectedOutcomes: extractedDocs.expectedOutcomes,
        prerequisites: extractedDocs.prerequisites
      };

      // Generate tour configuration
      const tourConfig: TourConfig = {
        goal: featureDocs.description,
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

      // Run the LangGraph workflow
      const result = await this.langGraphWorkflow.runDemoAutomation(
        tourConfig,
        featureDocs,
        credentials
      );

      // Build response
      const processingTime = Date.now() - startTime;

      return {
        demoId,
        demoName: `Tour-${featureDocs.featureName}-${demoId.slice(0, 8)}`,
        websiteUrl,
        loginStatus: 'success',
        pageInfo: await this.getPageInfo(),
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
            title: await this.puppeteerWorker.getPageTitle() || 'Tour Page',
            html: '', // Not storing full HTML for demo
            scrapedData: result.tourSteps,
            timestamp: new Date().toISOString(),
            pageInfo: await this.getPageInfo()
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

  async parseDocumentFile(
    file: Express.Multer.File,
    featureName?: string
  ): Promise<{ success: boolean; featureDocs: any; validation: any }> {
    try {
      // Parse the document
      const parsedDoc = await this.documentParser.parseDocument(file);
      const extractedDocs = await this.documentParser.extractFeatureDocsFromDocument(
        parsedDoc,
        featureName
      );

      // Validate the extracted documentation
      const validation = await this.documentParser.validateExtractedDocs(extractedDocs);

      return {
        success: validation.isValid,
        featureDocs: extractedDocs,
        validation
      };
    } catch (error) {
      console.error('Document parsing failed:', error);
      throw error;
    }
  }

  async stopAllAutomation(): Promise<void> {
    await this.puppeteerWorker.cleanup();
    await this.langGraphWorkflow.stopWorkflow();
  }
}
