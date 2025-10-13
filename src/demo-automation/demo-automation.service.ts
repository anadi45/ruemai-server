import { Injectable } from '@nestjs/common';
import { CreateDemoResponseDto, FeatureFileDto } from './demo-automation.dto';
import puppeteer, { Browser, Page } from 'puppeteer';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
// import TurndownService from 'turndown';

// Tour step schema for structured output
const TourStepSchema = z.object({
  selector: z.string().describe('CSS selector for the element'),
  action: z
    .enum(['click', 'hover', 'type', 'scroll', 'wait'])
    .describe('Action to perform'),
  description: z.string().describe('Human-readable description of the step'),
  voiceover: z
    .string()
    .optional()
    .describe('Text for text-to-speech narration'),
  screenshot: z
    .string()
    .optional()
    .describe('Base64 encoded screenshot of the step'),
  order: z.number().describe('Step order in the tour'),
  elementText: z
    .string()
    .optional()
    .describe('Text content of the target element'),
  elementType: z
    .string()
    .optional()
    .describe('Type of HTML element (button, link, input, etc.)'),
});

const TourSchema = z.object({
  title: z.string().describe('Title of the product tour'),
  description: z.string().describe('Description of what the tour demonstrates'),
  steps: z.array(TourStepSchema).describe('Array of tour steps'),
  totalDuration: z
    .number()
    .optional()
    .describe('Estimated total duration in seconds'),
  difficulty: z
    .enum(['beginner', 'intermediate', 'advanced'])
    .optional()
    .describe('Tour difficulty level'),
});

export type TourStep = z.infer<typeof TourStepSchema>;
export type Tour = z.infer<typeof TourSchema>;

@Injectable()
export class DemoAutomationService {
  // private turndownService: TurndownService;

  constructor() {
    // this.turndownService = new TurndownService({
    //   headingStyle: 'atx',
    //   bulletListMarker: '-',
    //   codeBlockStyle: 'fenced',
    // });
  }

  /**
   * Process uploaded feature files to extract relevant information
   */
  private async processFeatureFiles(
    featureFiles?: FeatureFileDto[],
  ): Promise<{
    apiDocs: string[];
    productDocs: string[];
    techDocs: string[];
    otherDocs: string[];
  }> {
    if (!featureFiles || featureFiles.length === 0) {
      return {
        apiDocs: [],
        productDocs: [],
        techDocs: [],
        otherDocs: [],
      };
    }

    console.log(`📁 Processing ${featureFiles.length} feature files...`);

    const processed = {
      apiDocs: [] as string[],
      productDocs: [] as string[],
      techDocs: [] as string[],
      otherDocs: [] as string[],
    };

    for (const file of featureFiles) {
      console.log(`📄 Processing file: ${file.filename} (${file.type})`);
      
      switch (file.type) {
        case 'api-docs':
          processed.apiDocs.push(`File: ${file.filename}\n${file.content}`);
          break;
        case 'product-docs':
          processed.productDocs.push(`File: ${file.filename}\n${file.content}`);
          break;
        case 'tech-docs':
          processed.techDocs.push(`File: ${file.filename}\n${file.content}`);
          break;
        default:
          processed.otherDocs.push(`File: ${file.filename}\n${file.content}`);
          break;
      }
    }

    console.log(`✅ Processed files: API docs (${processed.apiDocs.length}), Product docs (${processed.productDocs.length}), Tech docs (${processed.techDocs.length}), Other (${processed.otherDocs.length})`);
    
    return processed;
  }

  /**
   * Extract feature-specific URLs from crawl instructions
   */
  private extractFeatureUrlsFromInstructions(
    instructions: string,
    baseUrl: string,
  ): string[] {
    const urls: string[] = [];
    
    // Look for URLs in the instructions
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const matches = instructions.match(urlRegex);
    
    if (matches) {
      matches.forEach(match => {
        if (this.isInternalUrl(match, baseUrl)) {
          urls.push(match);
        }
      });
    }
    
    // Look for relative paths
    const pathRegex = /\/[a-zA-Z0-9\/\-_]+/g;
    const pathMatches = instructions.match(pathRegex);
    
    if (pathMatches) {
      pathMatches.forEach(path => {
        const fullUrl = this.resolveUrl(path, baseUrl);
        if (this.isInternalUrl(fullUrl, baseUrl)) {
          urls.push(fullUrl);
        }
      });
    }
    
    return [...new Set(urls)]; // Remove duplicates
  }

  /**
   * Create a roadmap for Puppeteer using LLM analysis of documentation
   */
  private async createPuppeteerRoadmap(
    processedFiles: {
      apiDocs: string[];
      productDocs: string[];
      techDocs: string[];
      otherDocs: string[];
    },
    targetFeature?: string,
  ): Promise<{
    roadmap: Array<{
      step: number;
      action: string;
      url?: string;
      selector?: string;
      description: string;
      expectedOutcome: string;
      waitFor?: string;
      screenshot?: boolean;
    }>;
    featureContext: string;
    keyUrls: string[];
  }> {
    console.log('🗺️ Creating Puppeteer roadmap using LLM analysis...');

    // Extract feature context from documentation
    const featureContext = this.extractFeatureContext(processedFiles, targetFeature);
    
    // Use LLM to analyze documentation and create intelligent roadmap
    const llmRoadmap = await this.generateRoadmapWithLLM(
      processedFiles,
      targetFeature,
      featureContext
    );

    console.log(`✅ LLM-generated roadmap created with ${llmRoadmap.roadmap.length} steps`);
    console.log(`📍 Key URLs identified: ${llmRoadmap.keyUrls.length}`);
    
    return llmRoadmap;
  }

  /**
   * Use LLM to generate intelligent roadmap from documentation
   */
  private async generateRoadmapWithLLM(
    processedFiles: {
      apiDocs: string[];
      productDocs: string[];
      techDocs: string[];
      otherDocs: string[];
    },
    targetFeature?: string,
    featureContext?: string,
  ): Promise<{
    roadmap: Array<{
      step: number;
      action: string;
      url?: string;
      selector?: string;
      description: string;
      expectedOutcome: string;
      waitFor?: string;
      screenshot?: boolean;
    }>;
    featureContext: string;
    keyUrls: string[];
  }> {
    console.log('🤖 Using LLM to analyze documentation and create roadmap...');

    try {
      // Create LLM prompt for roadmap generation
      const roadmapPrompt = this.createRoadmapPrompt(
        processedFiles,
        targetFeature,
        featureContext
      );

      // Call LLM service to generate roadmap
      const llmResponse = await this.callLLMForRoadmap(roadmapPrompt);

      // Parse LLM response into roadmap structure
      const roadmap = this.parseRoadmapResponse(llmResponse);

      // Extract key URLs from the roadmap
      const keyUrls = this.extractUrlsFromRoadmap(roadmap);

      return {
        roadmap,
        featureContext: featureContext || '',
        keyUrls,
      };
    } catch (error) {
      console.error('❌ LLM roadmap generation failed, using fallback:', error);
      
      // Fallback to basic roadmap generation
      const keyUrls = this.extractKeyUrlsFromDocs(processedFiles);
      const roadmap = this.generateRoadmapSteps(processedFiles, targetFeature, keyUrls);
      
      return {
        roadmap,
        featureContext: featureContext || '',
        keyUrls,
      };
    }
  }

  /**
   * Create LLM prompt for roadmap generation
   */
  private createRoadmapPrompt(
    processedFiles: {
      apiDocs: string[];
      productDocs: string[];
      techDocs: string[];
      otherDocs: string[];
    },
    targetFeature?: string,
    featureContext?: string,
  ): string {
    const allDocs = [
      ...processedFiles.apiDocs,
      ...processedFiles.productDocs,
      ...processedFiles.techDocs,
      ...processedFiles.otherDocs,
    ];

    return `
You are an expert web automation specialist tasked with creating a detailed Puppeteer roadmap for crawling and testing a web application.

TARGET FEATURE: ${targetFeature || 'General application features'}

DOCUMENTATION PROVIDED:
${allDocs.length > 0 ? allDocs.join('\n\n---\n\n') : 'No documentation provided'}

FEATURE CONTEXT:
${featureContext || 'No additional context'}

TASK:
Create a detailed roadmap for Puppeteer automation that will:
1. Navigate through the application systematically
2. Test the target feature thoroughly
3. Follow the documentation workflows
4. Capture relevant data for tour generation

REQUIREMENTS:
- Create 5-10 specific steps maximum
- Each step should have clear actions (navigate, click, type, wait, etc.)
- Include expected outcomes for each step
- Focus on the target feature and documentation workflows
- Include URLs and selectors where possible
- Add appropriate wait conditions
- Include screenshot capture for important steps

RESPONSE FORMAT:
Return a JSON object with this structure:
{
  "roadmap": [
    {
      "step": 1,
      "action": "navigate|click|type|wait|scroll|hover",
      "url": "optional URL for navigation",
      "selector": "optional CSS selector",
      "description": "Clear description of what this step does",
      "expectedOutcome": "What should happen after this step",
      "waitFor": "networkidle2|navigation|selector|timeout",
      "screenshot": true|false
    }
  ],
  "keyUrls": ["list of important URLs found in documentation"],
  "featureSummary": "Brief summary of the target feature"
}

Focus on creating actionable steps that will effectively demonstrate the target feature.
`;
  }

  /**
   * Call LLM service for roadmap generation
   */
  private async callLLMForRoadmap(prompt: string): Promise<string> {
    // This would integrate with your actual LLM service
    // For now, return a mock response structure
    console.log('🤖 Calling LLM service for roadmap generation...');
    
    // Mock response for now - replace with actual LLM service call
    return JSON.stringify({
      roadmap: [
        {
          step: 1,
          action: "navigate",
          description: "Navigate to main application page",
          expectedOutcome: "Main page loads successfully",
          waitFor: "networkidle2",
          screenshot: true
        },
        {
          step: 2,
          action: "login",
          description: "Perform login with provided credentials",
          expectedOutcome: "User successfully logged in",
          waitFor: "navigation",
          screenshot: true
        }
      ],
      keyUrls: [],
      featureSummary: "Target feature analysis"
    });
  }

  /**
   * Parse LLM response into roadmap structure
   */
  private parseRoadmapResponse(llmResponse: string): Array<{
    step: number;
    action: string;
    url?: string;
    selector?: string;
    description: string;
    expectedOutcome: string;
    waitFor?: string;
    screenshot?: boolean;
  }> {
    try {
      const parsed = JSON.parse(llmResponse);
      return parsed.roadmap || [];
    } catch (error) {
      console.error('❌ Failed to parse LLM roadmap response:', error);
      return [];
    }
  }

  /**
   * Extract URLs from roadmap
   */
  private extractUrlsFromRoadmap(roadmap: Array<{
    step: number;
    action: string;
    url?: string;
    selector?: string;
    description: string;
    expectedOutcome: string;
    waitFor?: string;
    screenshot?: boolean;
  }>): string[] {
    return roadmap
      .filter(step => step.url)
      .map(step => step.url!)
      .filter(url => url && url.length > 0);
  }

  /**
   * Extract feature context from all documentation
   */
  private extractFeatureContext(
    processedFiles: {
      apiDocs: string[];
      productDocs: string[];
      techDocs: string[];
      otherDocs: string[];
    },
    targetFeature?: string,
  ): string {
    const contextParts: string[] = [];
    
    if (targetFeature) {
      contextParts.push(`Target Feature: ${targetFeature}`);
    }
    
    // Combine all documentation
    const allDocs = [
      ...processedFiles.apiDocs,
      ...processedFiles.productDocs,
      ...processedFiles.techDocs,
      ...processedFiles.otherDocs,
    ];
    
    if (allDocs.length > 0) {
      contextParts.push('Documentation Context:');
      contextParts.push(allDocs.join('\n\n---\n\n'));
    }
    
    return contextParts.join('\n\n');
  }

  /**
   * Extract key URLs from documentation and instructions
   */
  private extractKeyUrlsFromDocs(
    processedFiles: {
      apiDocs: string[];
      productDocs: string[];
      techDocs: string[];
      otherDocs: string[];
    },
  ): string[] {
    const urls: string[] = [];
    
    // Extract from all documentation
    const allDocs = [
      ...processedFiles.apiDocs,
      ...processedFiles.productDocs,
      ...processedFiles.techDocs,
      ...processedFiles.otherDocs,
    ];
    
    // Look for URLs in documentation
    const urlRegex = /(https?:\/\/[^\s\)]+)/g;
    const pathRegex = /\/[a-zA-Z0-9\/\-_\.]+/g;
    
    allDocs.forEach(doc => {
      // Extract full URLs
      const urlMatches = doc.match(urlRegex);
      if (urlMatches) {
        urls.push(...urlMatches);
      }
      
      // Extract relative paths
      const pathMatches = doc.match(pathRegex);
      if (pathMatches) {
        urls.push(...pathMatches);
      }
    });
    
    return [...new Set(urls)]; // Remove duplicates
  }

  /**
   * Generate roadmap steps based on documentation
   */
  private generateRoadmapSteps(
    processedFiles: {
      apiDocs: string[];
      productDocs: string[];
      techDocs: string[];
      otherDocs: string[];
    },
    targetFeature?: string,
    keyUrls: string[] = [],
  ): Array<{
    step: number;
    action: string;
    url?: string;
    selector?: string;
    description: string;
    expectedOutcome: string;
    waitFor?: string;
    screenshot?: boolean;
  }> {
    const steps: Array<{
      step: number;
      action: string;
      url?: string;
      selector?: string;
      description: string;
      expectedOutcome: string;
      waitFor?: string;
      screenshot?: boolean;
    }> = [];
    
    let stepNumber = 1;
    
    // Step 1: Navigate to main page
    steps.push({
      step: stepNumber++,
      action: 'navigate',
      description: 'Navigate to the main application page',
      expectedOutcome: 'Main page loads successfully',
      waitFor: 'networkidle2',
      screenshot: true,
    });
    
    // Step 2: Login (if credentials provided)
    steps.push({
      step: stepNumber++,
      action: 'login',
      description: 'Perform login with provided credentials',
      expectedOutcome: 'User successfully logged in',
      waitFor: 'navigation',
      screenshot: true,
    });
    
    // Add steps for key URLs from documentation
    keyUrls.slice(0, 5).forEach((url, index) => {
      steps.push({
        step: stepNumber++,
        action: 'navigate',
        url: url,
        description: `Navigate to ${url} to explore feature`,
        expectedOutcome: `Page loads and shows relevant content`,
        waitFor: 'networkidle2',
        screenshot: true,
      });
    });
    
    // Add feature-specific steps based on target feature
    if (targetFeature) {
      steps.push({
        step: stepNumber++,
        action: 'explore',
        description: `Explore ${targetFeature} functionality`,
        expectedOutcome: `User understands ${targetFeature} features`,
        waitFor: 'networkidle2',
        screenshot: true,
      });
    }
    
    // Add steps based on API documentation
    if (processedFiles.apiDocs.length > 0) {
      steps.push({
        step: stepNumber++,
        action: 'test-api-features',
        description: 'Test API-related features based on documentation',
        expectedOutcome: 'API features work as documented',
        waitFor: 'networkidle2',
        screenshot: true,
      });
    }
    
    // Add steps based on product documentation
    if (processedFiles.productDocs.length > 0) {
      steps.push({
        step: stepNumber++,
        action: 'follow-product-guide',
        description: 'Follow product documentation workflow',
        expectedOutcome: 'Product features work as documented',
        waitFor: 'networkidle2',
        screenshot: true,
      });
    }
    
    return steps;
  }

  /**
   * Execute the roadmap using Puppeteer
   */
  private async executeRoadmap(
    page: Page,
    baseUrl: string,
    roadmap: {
      roadmap: Array<{
        step: number;
        action: string;
        url?: string;
        selector?: string;
        description: string;
        expectedOutcome: string;
        waitFor?: string;
        screenshot?: boolean;
      }>;
      featureContext: string;
      keyUrls: string[];
    },
    credentials: { username: string; password: string },
  ): Promise<{
    pages: any[];
    elements: any[];
    screenshots: string[];
    metadata: any;
  }> {
    console.log('🚀 Executing roadmap with Puppeteer...');

    const pages: any[] = [];
    const elements: any[] = [];
    const screenshots: string[] = [];
    const metadata: any = {
      roadmapSteps: roadmap.roadmap.length,
      executedSteps: 0,
      featureContext: roadmap.featureContext,
      keyUrls: roadmap.keyUrls,
    };

    try {
      for (const step of roadmap.roadmap) {
        console.log(`📍 Executing step ${step.step}: ${step.description}`);
        
        try {
          const stepResult = await this.executeRoadmapStep(page, step, baseUrl, credentials);
          
          if (stepResult.pageData) {
            pages.push(stepResult.pageData);
          }
          
          if (stepResult.elements) {
            elements.push(...stepResult.elements);
          }
          
          if (stepResult.screenshot) {
            screenshots.push(stepResult.screenshot);
          }
          
          metadata.executedSteps++;
          
          console.log(`✅ Step ${step.step} completed: ${step.expectedOutcome}`);
        } catch (error) {
          console.error(`❌ Step ${step.step} failed:`, error.message);
          // Continue with next step
        }
      }
    } catch (error) {
      console.error('❌ Roadmap execution failed:', error);
    }

    console.log(`✅ Roadmap execution completed: ${metadata.executedSteps}/${metadata.roadmapSteps} steps executed`);
    console.log(`📊 Collected: ${pages.length} pages, ${elements.length} elements, ${screenshots.length} screenshots`);

    return {
      pages,
      elements,
      screenshots,
      metadata,
    };
  }

  /**
   * Execute a single roadmap step
   */
  private async executeRoadmapStep(
    page: Page,
    step: {
      step: number;
      action: string;
      url?: string;
      selector?: string;
      description: string;
      expectedOutcome: string;
      waitFor?: string;
      screenshot?: boolean;
    },
    baseUrl: string,
    credentials: { username: string; password: string },
  ): Promise<{
    pageData?: any;
    elements?: any[];
    screenshot?: string;
  }> {
    const result: {
      pageData?: any;
      elements?: any[];
      screenshot?: string;
    } = {};

    switch (step.action) {
      case 'navigate':
        if (step.url) {
          const fullUrl = this.resolveUrl(step.url, baseUrl);
          await page.goto(fullUrl, {
            waitUntil: (step.waitFor as any) || 'networkidle2',
            timeout: 30000,
          });
          
          // Extract page data
          result.pageData = await this.extractPageData(page);
          result.elements = await this.extractInteractiveElements(page);
        }
        break;

      case 'login':
        await this.performLogin(page, credentials);
        result.pageData = await this.extractPageData(page);
        result.elements = await this.extractInteractiveElements(page);
        break;

      case 'click':
        if (step.selector) {
          await page.waitForSelector(step.selector, { timeout: 10000 });
          await page.click(step.selector);
          
          if (step.waitFor) {
            await page.waitForNavigation({ waitUntil: 'networkidle2' });
          }
          
          result.pageData = await this.extractPageData(page);
          result.elements = await this.extractInteractiveElements(page);
        }
        break;

      case 'type':
        if (step.selector) {
          await page.waitForSelector(step.selector, { timeout: 10000 });
          await page.type(step.selector, 'test input');
        }
        break;

      case 'wait':
        if (step.waitFor === 'selector' && step.selector) {
          await page.waitForSelector(step.selector, { timeout: 10000 });
        } else if (step.waitFor === 'navigation') {
          await page.waitForNavigation({ waitUntil: 'networkidle2' });
        } else {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
        break;

      case 'scroll':
        await page.evaluate(() => {
          window.scrollTo(0, document.body.scrollHeight);
        });
        await new Promise(resolve => setTimeout(resolve, 1000));
        break;

      case 'hover':
        if (step.selector) {
          await page.waitForSelector(step.selector, { timeout: 10000 });
          await page.hover(step.selector);
        }
        break;

      case 'explore':
        // Explore the current page for interactive elements
        result.elements = await this.extractInteractiveElements(page);
        result.pageData = await this.extractPageData(page);
        break;

      case 'test-api-features':
        // Test API-related features (this would be customized based on your needs)
        result.pageData = await this.extractPageData(page);
        result.elements = await this.extractInteractiveElements(page);
        break;

      case 'follow-product-guide':
        // Follow product documentation workflow
        result.pageData = await this.extractPageData(page);
        result.elements = await this.extractInteractiveElements(page);
        break;

      default:
        console.log(`⚠️ Unknown action: ${step.action}`);
    }

    // Take screenshot if requested
    if (step.screenshot) {
      const screenshot = await page.screenshot({
        fullPage: true,
        encoding: 'base64',
      });
      result.screenshot = screenshot;
    }

    return result;
  }

  async generateProductTour(
    websiteUrl: string,
    credentials: { username: string; password: string },
    featureFiles?: FeatureFileDto[],
    targetFeature?: string,
  ): Promise<CreateDemoResponseDto> {
    const startTime = Date.now();
    const demoId = uuidv4();
    let browser: Browser | null = null;

    try {
      console.log(`🚀 Starting product tour generation for: ${websiteUrl}`);

      // Step 1: Validate inputs
      this.validateInputs(websiteUrl, credentials);

      // Step 2: Launch browser with stealth mode
      browser = await this.launchStealthBrowser();
      const page = await browser.newPage();

      // Step 3: Navigate and login
      await this.navigateAndLogin(page, websiteUrl, credentials);

      // Step 4: Process feature files and extract relevant information
      const processedFiles = await this.processFeatureFiles(featureFiles);

      // Step 5: Create roadmap from documentation
      const roadmap = await this.createPuppeteerRoadmap(
        processedFiles,
        targetFeature
      );

      // Step 6: Execute roadmap and crawl data
      const scrapedData = await this.executeRoadmap(
        page,
        websiteUrl,
        roadmap,
        credentials
      );

      // Step 7: Generate tour using LLM with roadmap context
      const tour = await this.generateTourWithLLM(
        scrapedData, 
        websiteUrl, 
        processedFiles, 
        targetFeature,
        roadmap
      );

      // Step 6: Validate and structure response
      const validatedTour = TourSchema.parse(tour);

      const processingTime = Date.now() - startTime;

      return {
        demoId,
        demoName: validatedTour.title,
        websiteUrl,
        loginStatus: 'success',
        pageInfo: {
          title: validatedTour.title,
          url: websiteUrl,
          bodyText: validatedTour.description,
          totalElements: validatedTour.steps.length,
          buttons: 0,
          links: 0,
          inputs: 0,
        },
        summary: {
          processingTime,
          loginAttempted: true,
          finalUrl: websiteUrl,
        },
        scrapedData: {
          success: true,
          totalPages: scrapedData.pages.length,
          crawlTime: processingTime,
          pages: scrapedData.pages,
        },
      };
    } catch (error) {
      console.error('❌ Product tour generation failed:', error);
      throw new Error(`Product tour generation failed: ${error.message}`);
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  /**
   * Validate input parameters for security and correctness
   */
  private validateInputs(
    websiteUrl: string,
    credentials: { username: string; password: string },
  ): void {
    if (!websiteUrl || typeof websiteUrl !== 'string') {
      throw new Error('Website URL is required and must be a string');
    }

    if (!credentials.username || !credentials.password) {
      throw new Error('Username and password are required');
    }

    // Validate URL format
    try {
      const url = new URL(websiteUrl);
      if (!['http:', 'https:'].includes(url.protocol)) {
        throw new Error('URL must use HTTP or HTTPS protocol');
      }
    } catch (error) {
      throw new Error(`Invalid URL format: ${error.message}`);
    }

    // Basic credential validation
    if (credentials.username.length < 1 || credentials.password.length < 1) {
      throw new Error('Username and password cannot be empty');
    }

    console.log('✅ Input validation passed');
  }

  /**
   * Launch browser with stealth mode to avoid detection
   */
  private async launchStealthBrowser(): Promise<Browser> {
    console.log('🚀 Launching stealth browser...');

    const browser = await puppeteer.launch({
      headless: true, // Use headless for production
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-default-apps',
        '--disable-extensions',
        '--disable-plugins',
        '--disable-sync',
        '--disable-translate',
        '--hide-scrollbars',
        '--mute-audio',
        '--no-zygote',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-features=TranslateUI',
        '--disable-ipc-flooding-protection',
      ],
      defaultViewport: null,
    });

    console.log('✅ Stealth browser launched successfully');
    return browser;
  }

  /**
   * Navigate to website and perform login
   */
  private async navigateAndLogin(
    page: Page,
    websiteUrl: string,
    credentials: { username: string; password: string },
  ): Promise<void> {
    console.log(`🌐 Navigating to: ${websiteUrl}`);

    // Set stealth user agent and headers
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    );

    await page.setViewport({ width: 1920, height: 1080 });

    // Enable request interception for stealth
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const headers = {
        ...request.headers(),
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
      };
      request.continue({ headers });
    });

    // Navigate to website
    await page.goto(websiteUrl, {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });

    console.log('🔐 Attempting login...');
    const loginSuccess = await this.performLogin(page, credentials);

    if (!loginSuccess) {
      throw new Error(
        'Login failed - could not authenticate with provided credentials',
      );
    }

    console.log('✅ Login successful');
  }

  /**
   * Perform login using AI-driven form detection
   */
  private async performLogin(
    page: Page,
    credentials: { username: string; password: string },
  ): Promise<boolean> {
    try {
      console.log('🔍 Starting login process...');
      console.log(`📧 Username: ${credentials.username}`);
      console.log(`🔑 Password: ${'*'.repeat(credentials.password.length)}`);
      
      // Wait for page to load completely
      console.log('⏳ Waiting for page to load...');
      await page.waitForFunction(() => document.readyState === 'complete');
      
      // Get current URL for debugging
      const currentUrl = page.url();
      console.log(`🌐 Current URL: ${currentUrl}`);
      
      // Take a screenshot for debugging
      try {
        const screenshot = await page.screenshot({ 
          fullPage: true, 
          encoding: 'base64' 
        });
        console.log(`📸 Screenshot captured (${screenshot.length} chars)`);
      } catch (error) {
        console.log('⚠️ Could not capture screenshot:', error.message);
      }

      // Use AI to find login form elements
      console.log('🔍 Looking for login form elements...');
      const loginElements = await this.findLoginElements(page);

      if (!loginElements.username || !loginElements.password) {
        console.log('❌ Could not find login form elements');
        console.log('🔍 Available elements on page:');
        
        // Debug: Show all available input elements
        const allInputs = await page.evaluate(() => {
          const inputs = Array.from(document.querySelectorAll('input'));
          return inputs.map(input => ({
            type: input.type,
            name: input.name,
            id: input.id,
            placeholder: input.placeholder,
            className: input.className,
            visible: input.offsetParent !== null
          }));
        });
        
        console.log('📋 All input elements found:', allInputs);
        
        // Try alternative approach - look for any form and try to fill it
        console.log('🔄 Trying alternative login approach...');
        const alternativeSuccess = await this.tryAlternativeLogin(page, credentials);
        if (alternativeSuccess) {
          console.log('✅ Alternative login approach succeeded');
          return true;
        }
        
        return false;
      }

      console.log('✅ Found login form elements');
      console.log(`📝 Username field: ${loginElements.username ? 'Found' : 'Not found'}`);
      console.log(`🔒 Password field: ${loginElements.password ? 'Found' : 'Not found'}`);
      console.log(`🔘 Submit button: ${loginElements.submitButton ? 'Found' : 'Not found'}`);

      // Fill in credentials
      console.log('📝 Filling in username...');
      await loginElements.username.click({ clickCount: 3 });
      await loginElements.username.type(credentials.username, { delay: 100 });

      console.log('🔒 Filling in password...');
      await loginElements.password.click({ clickCount: 3 });
      await loginElements.password.type(credentials.password, { delay: 100 });

      // Submit form
      console.log('🚀 Submitting login form...');
      if (loginElements.submitButton) {
        await loginElements.submitButton.click();
      } else {
        // Try pressing Enter on password field
        await loginElements.password.press('Enter');
      }

      // Wait for navigation or success indicators
      console.log('⏳ Waiting for login completion...');
      await this.waitForLoginCompletion(page);

      // Check if login was successful
      console.log('🔍 Verifying login success...');
      const loginSuccess = await this.verifyLoginSuccess(page);
      
      console.log(`🎯 Login result: ${loginSuccess ? 'SUCCESS' : 'FAILED'}`);
      return loginSuccess;
      
    } catch (error) {
      console.error('❌ Login error:', error);
      console.error('❌ Error details:', error.message);
      console.error('❌ Stack trace:', error.stack);
      return false;
    }
  }

  /**
   * Use AI to intelligently find login form elements
   */
  private async findLoginElements(page: Page): Promise<{
    username: any;
    password: any;
    submitButton: any;
  }> {
    const loginElements = await page.evaluate(() => {
      // Comprehensive selectors for username/email fields
      const usernameSelectors = [
        'input[type="email"]',
        'input[name="email"]',
        'input[name="username"]',
        'input[name="user"]',
        'input[name="login"]',
        'input[name="loginId"]',
        'input[id*="email"]',
        'input[id*="username"]',
        'input[id*="user"]',
        'input[id*="login"]',
        'input[placeholder*="email" i]',
        'input[placeholder*="username" i]',
        'input[placeholder*="user" i]',
        'input[placeholder*="login" i]',
      ];

      // Comprehensive selectors for password fields
      const passwordSelectors = [
        'input[type="password"]',
        'input[name="password"]',
        'input[name="pass"]',
        'input[name="pwd"]',
        'input[id*="password"]',
        'input[id*="pass"]',
      ];

      // Comprehensive selectors for submit buttons
      const submitSelectors = [
        'button[type="submit"]',
        'input[type="submit"]',
        'button:has-text("Login")',
        'button:has-text("Sign In")',
        'button:has-text("Log In")',
        'button:has-text("Sign in")',
        'button:has-text("Log in")',
        'input[value*="Login" i]',
        'input[value*="Sign In" i]',
        'input[value*="Log In" i]',
        'button[class*="login"]',
        'button[class*="submit"]',
        'button[id*="login"]',
        'button[id*="submit"]',
      ];

      let username = null;
      let password = null;
      let submitButton = null;

      // Find username field
      for (const selector of usernameSelectors) {
        const element = document.querySelector(selector);
        if (element && (element as any).offsetParent !== null) {
          // Check if visible
          username = element;
          break;
        }
      }

      // Find password field
      for (const selector of passwordSelectors) {
        const element = document.querySelector(selector);
        if (element && (element as any).offsetParent !== null) {
          // Check if visible
          password = element;
          break;
        }
      }

      // Find submit button
      for (const selector of submitSelectors) {
        const element = document.querySelector(selector);
        if (element && (element as any).offsetParent !== null) {
          // Check if visible
          submitButton = element;
          break;
        }
      }

      return {
        username: username
          ? {
              tagName: username.tagName,
              type: username.type,
              name: username.name,
              id: username.id,
              className: username.className,
            }
          : null,
        password: password
          ? {
              tagName: password.tagName,
              type: password.type,
              name: password.name,
              id: password.id,
              className: password.className,
            }
          : null,
        submitButton: submitButton
          ? {
              tagName: submitButton.tagName,
              type: submitButton.type,
              textContent: submitButton.textContent,
              className: submitButton.className,
            }
          : null,
      };
    });

    console.log('🔍 Found login elements:', loginElements);

    // Convert back to Puppeteer elements with better error handling
    let usernameElement = null;
    let passwordElement = null;
    let submitElement = null;
    
    if (loginElements.username) {
      try {
        const selectors = [
          `input[name="${loginElements.username.name}"]`,
          `input[id="${loginElements.username.id}"]`,
          `input[type="${loginElements.username.type}"]`
        ].filter(s => !s.includes('undefined'));
        
        for (const selector of selectors) {
          usernameElement = await page.$(selector);
          if (usernameElement) break;
        }
        console.log(`✅ Username element found: ${!!usernameElement}`);
      } catch (error) {
        console.log('⚠️ Error finding username element:', error);
      }
    }
    
    if (loginElements.password) {
      try {
        const selectors = [
          `input[name="${loginElements.password.name}"]`,
          `input[id="${loginElements.password.id}"]`,
          `input[type="${loginElements.password.type}"]`
        ].filter(s => !s.includes('undefined'));
        
        for (const selector of selectors) {
          passwordElement = await page.$(selector);
          if (passwordElement) break;
        }
        console.log(`✅ Password element found: ${!!passwordElement}`);
      } catch (error) {
        console.log('⚠️ Error finding password element:', error);
      }
    }
    
    if (loginElements.submitButton) {
      try {
        const selectors = [
          'button[type="submit"]',
          'input[type="submit"]',
          `button:has-text("${loginElements.submitButton.textContent}")`
        ];
        
        for (const selector of selectors) {
          submitElement = await page.$(selector);
          if (submitElement) break;
        }
        console.log(`✅ Submit element found: ${!!submitElement}`);
      } catch (error) {
        console.log('⚠️ Error finding submit element:', error);
      }
    }

    return {
      username: usernameElement,
      password: passwordElement,
      submitButton: submitElement,
    };
  }

  /**
   * Try alternative login approach when standard method fails
   */
  private async tryAlternativeLogin(
    page: Page,
    credentials: { username: string; password: string },
  ): Promise<boolean> {
    try {
      console.log('🔄 Attempting alternative login approach...');
      
      // Look for any form on the page
      const forms = await page.$$('form');
      console.log(`📋 Found ${forms.length} forms on the page`);
      
      for (let i = 0; i < forms.length; i++) {
        console.log(`🔍 Trying form ${i + 1}/${forms.length}`);
        
        try {
          // Look for any input fields in this form
          const inputs = await forms[i].$$('input');
          console.log(`📝 Form ${i + 1} has ${inputs.length} input fields`);
          
          let usernameField = null;
          let passwordField = null;
          
          // Try to find username/email field
          for (const input of inputs) {
            const inputInfo = await input.evaluate(el => ({
              type: el.type,
              name: el.name,
              id: el.id,
              placeholder: el.placeholder,
              visible: el.offsetParent !== null
            }));
            
            if (inputInfo.visible && (
              inputInfo.type === 'email' || 
              inputInfo.type === 'text' ||
              inputInfo.name?.toLowerCase().includes('email') ||
              inputInfo.name?.toLowerCase().includes('username') ||
              inputInfo.name?.toLowerCase().includes('user') ||
              inputInfo.placeholder?.toLowerCase().includes('email') ||
              inputInfo.placeholder?.toLowerCase().includes('username')
            )) {
              usernameField = input;
              console.log(`✅ Found username field: ${inputInfo.name || inputInfo.id || inputInfo.type}`);
              break;
            }
          }
          
          // Try to find password field
          for (const input of inputs) {
            const inputInfo = await input.evaluate(el => ({
              type: el.type,
              name: el.name,
              id: el.id,
              visible: el.offsetParent !== null
            }));
            
            if (inputInfo.visible && inputInfo.type === 'password') {
              passwordField = input;
              console.log(`✅ Found password field: ${inputInfo.name || inputInfo.id}`);
              break;
            }
          }
          
          if (usernameField && passwordField) {
            console.log('🎯 Found both username and password fields, attempting login...');
            
            // Fill in credentials
            await usernameField.click({ clickCount: 3 });
            await usernameField.type(credentials.username, { delay: 100 });
            
            await passwordField.click({ clickCount: 3 });
            await passwordField.type(credentials.password, { delay: 100 });
            
            // Try to submit the form
            const submitButton = await forms[i].$('button[type="submit"], input[type="submit"], button');
            if (submitButton) {
              await submitButton.click();
            } else {
              // Try pressing Enter
              await passwordField.press('Enter');
            }
            
            // Wait and check if login was successful
            await new Promise(resolve => setTimeout(resolve, 3000));
            const loginSuccess = await this.verifyLoginSuccess(page);
            
            if (loginSuccess) {
              console.log('✅ Alternative login successful!');
              return true;
            } else {
              console.log('❌ Alternative login failed, trying next form...');
            }
          }
        } catch (error) {
          console.log(`⚠️ Error with form ${i + 1}:`, error.message);
          continue;
        }
      }
      
      console.log('❌ All alternative login attempts failed');
      return false;
      
    } catch (error) {
      console.error('❌ Alternative login error:', error);
      return false;
    }
  }

  /**
   * Wait for login completion and page navigation
   */
  private async waitForLoginCompletion(page: Page): Promise<void> {
    try {
      // Wait for navigation or network idle
      await Promise.race([
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }),
        page.waitForFunction(() => document.readyState === 'complete', {
          timeout: 10000,
        }),
      ]);

      // Additional wait for dynamic content
      await new Promise((resolve) => setTimeout(resolve, 2000));

      console.log('✅ Login completion wait finished');
    } catch (error) {
      console.log('⚠️ Login completion wait timeout, continuing...');
    }
  }

  /**
   * Verify if login was successful
   */
  private async verifyLoginSuccess(page: Page): Promise<boolean> {
    try {
      console.log('🔍 Verifying login success using API responses...');

      // Monitor network requests for login-related API calls
      const loginApiResponses: any[] = [];
      const authTokens: string[] = [];

      // Set up request/response monitoring
      page.on('response', async (response) => {
        const url = response.url();
        const status = response.status();

        // Check for authentication-related endpoints
        if (this.isAuthEndpoint(url)) {
          console.log(`🔐 Auth API call: ${url} - Status: ${status}`);

          try {
            const responseData = await response.json().catch(() => null);
            loginApiResponses.push({
              url,
              status,
              data: responseData,
              headers: response.headers(),
            });

            // Extract auth tokens from response
            if (responseData) {
              const tokens = this.extractAuthTokens(
                responseData,
                response.headers(),
              );
              authTokens.push(...tokens);
            }
          } catch (error) {
            console.log(`⚠️ Could not parse response from ${url}`);
          }
        }
      });

      // Wait for potential API calls to complete
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Check for successful authentication indicators
      const hasSuccessfulAuth = this.checkAuthSuccess(
        loginApiResponses,
        authTokens,
      );

      // Check for session cookies
      const cookies = await page.cookies();
      const hasSessionCookies = this.checkSessionCookies(cookies);

      // Check for authentication headers in subsequent requests
      const hasAuthHeaders = await this.checkAuthHeaders(page);

      // Check if we're redirected to a post-login page
      const currentUrl = page.url();
      const isRedirected = this.isPostLoginRedirect(currentUrl);

      // Check for user-specific data in the page
      const hasUserData = await this.checkUserDataInPage(page);

      const loginSuccess =
        hasSuccessfulAuth ||
        hasSessionCookies ||
        hasAuthHeaders ||
        (isRedirected && hasUserData);

      console.log(`🔍 Login verification results:`);
      console.log(`  - API Success: ${hasSuccessfulAuth}`);
      console.log(`  - Session Cookies: ${hasSessionCookies}`);
      console.log(`  - Auth Headers: ${hasAuthHeaders}`);
      console.log(`  - Post-login Redirect: ${isRedirected}`);
      console.log(`  - User Data Present: ${hasUserData}`);
      console.log(`  - Final Result: ${loginSuccess ? 'SUCCESS' : 'FAILED'}`);

      return loginSuccess;
    } catch (error) {
      console.error('❌ Error verifying login:', error);
      return false;
    }
  }

  /**
   * Check if URL is an authentication endpoint
   */
  private isAuthEndpoint(url: string): boolean {
    const authPatterns = [
      /\/auth\//i,
      /\/login/i,
      /\/signin/i,
      /\/sign-in/i,
      /\/authenticate/i,
      /\/token/i,
      /\/session/i,
      /\/user\/me/i,
      /\/profile/i,
      /\/account/i,
      /\/api\/auth/i,
      /\/api\/login/i,
      /\/api\/user/i,
    ];

    return authPatterns.some((pattern) => pattern.test(url));
  }

  /**
   * Extract authentication tokens from API response
   */
  private extractAuthTokens(responseData: any, headers: any): string[] {
    const tokens: string[] = [];

    // Check response body for tokens
    if (responseData) {
      const tokenFields = [
        'token',
        'access_token',
        'auth_token',
        'jwt',
        'session_id',
        'user_id',
      ];
      tokenFields.forEach((field) => {
        if (responseData[field]) {
          tokens.push(responseData[field]);
        }
      });
    }

    // Check headers for auth tokens
    const authHeaders = [
      'authorization',
      'x-auth-token',
      'x-access-token',
      'x-session-id',
    ];
    authHeaders.forEach((header) => {
      const value = headers[header];
      if (value && value !== 'Bearer null' && value !== 'null') {
        tokens.push(value);
      }
    });

    return tokens;
  }

  /**
   * Check if authentication was successful based on API responses
   */
  private checkAuthSuccess(apiResponses: any[], authTokens: string[]): boolean {
    // Check for successful status codes
    const hasSuccessStatus = apiResponses.some(
      (response) => response.status >= 200 && response.status < 300,
    );

    // Check for authentication tokens
    const hasAuthTokens = authTokens.length > 0;

    // Check for user data in responses
    const hasUserData = apiResponses.some((response) => {
      if (response.data) {
        const userFields = ['user', 'user_id', 'email', 'username', 'profile'];
        return userFields.some((field) => response.data[field]);
      }
      return false;
    });

    return hasSuccessStatus && (hasAuthTokens || hasUserData);
  }

  /**
   * Check for session cookies
   */
  private checkSessionCookies(cookies: any[]): boolean {
    const sessionCookieNames = [
      'session',
      'sessionid',
      'session_id',
      'auth',
      'auth_token',
      'jwt',
      'access_token',
      'user_session',
      'login_session',
    ];

    return cookies.some((cookie) =>
      sessionCookieNames.some((name) =>
        cookie.name.toLowerCase().includes(name.toLowerCase()),
      ),
    );
  }

  /**
   * Check for authentication headers in subsequent requests
   */
  private async checkAuthHeaders(page: Page): Promise<boolean> {
    let hasAuthHeaders = false;

    // Monitor the next few requests for auth headers
    const requestHandler = (request: any) => {
      const headers = request.headers();
      const authHeaders = [
        'authorization',
        'x-auth-token',
        'x-access-token',
        'x-session-id',
      ];

      if (
        authHeaders.some(
          (header) => headers[header] && headers[header] !== 'Bearer null',
        )
      ) {
        hasAuthHeaders = true;
      }
    };

    page.on('request', requestHandler);

    // Wait a bit for requests to be made
    await new Promise((resolve) => setTimeout(resolve, 2000));

    page.off('request', requestHandler);

    return hasAuthHeaders;
  }

  /**
   * Check if current URL indicates post-login redirect
   */
  private isPostLoginRedirect(url: string): boolean {
    const postLoginPatterns = [
      /\/dashboard/i,
      /\/home/i,
      /\/main/i,
      /\/app/i,
      /\/profile/i,
      /\/account/i,
      /\/admin/i,
      /\/workspace/i,
      /\/console/i,
    ];

    const loginPatterns = [/\/login/i, /\/signin/i, /\/sign-in/i, /\/auth/i];

    const isPostLogin = postLoginPatterns.some((pattern) => pattern.test(url));
    const isLoginPage = loginPatterns.some((pattern) => pattern.test(url));

    return isPostLogin || !isLoginPage;
  }

  /**
   * Check for user-specific data in the page
   */
  private async checkUserDataInPage(page: Page): Promise<boolean> {
    try {
      const userData = await page.evaluate(() => {
        // Check for user data in global variables
        const userDataSources = [
          (window as any).user,
          (window as any).currentUser,
          (window as any).userData,
          (window as any).auth,
          (window as any).session,
        ];

        // Check for user data in meta tags
        const userMeta = document
          .querySelector('meta[name="user-id"]')
          ?.getAttribute('content');
        const authMeta = document
          .querySelector('meta[name="auth-token"]')
          ?.getAttribute('content');

        // Check for user-specific elements
        const userElements = document.querySelectorAll(
          '[data-user-id], [data-user], [data-auth]',
        );

        return {
          hasGlobalUserData: userDataSources.some(
            (data) => data && typeof data === 'object',
          ),
          hasUserMeta: !!userMeta,
          hasAuthMeta: !!authMeta,
          hasUserElements: userElements.length > 0,
        };
      });

      return (
        userData.hasGlobalUserData ||
        userData.hasUserMeta ||
        userData.hasAuthMeta ||
        userData.hasUserElements
      );
    } catch (error) {
      console.log('⚠️ Error checking user data in page:', error);
      return false;
    }
  }

  /**
   * Crawl website and extract comprehensive data for tour generation
   */
  private async crawlWebsite(
    page: Page,
    baseUrl: string,
    targetFeature?: string,
    crawlInstructions?: string,
    processedFiles?: {
      apiDocs: string[];
      productDocs: string[];
      crawlInstructions: string[];
      otherDocs: string[];
    },
  ): Promise<{
    pages: any[];
    elements: any[];
    screenshots: string[];
    metadata: any;
  }> {
    console.log('🕷️ Starting feature-focused website crawl...');

    // Initialize feature-focused crawling
    const visitedUrls = new Set<string>();
    const urlQueue: string[] = [baseUrl];
    const maxPages = targetFeature ? 5 : 10; // Reduce pages for feature-focused crawling
    const maxDepth = targetFeature ? 1 : 2; // Reduce depth for feature-focused crawling
    const urlDepthMap = new Map<string, number>();
    urlDepthMap.set(baseUrl, 0);

    // If we have feature files or target feature, prioritize relevant pages
    if (targetFeature || processedFiles) {
      console.log(`🎯 Feature-focused crawling for: ${targetFeature || 'specific features'}`);
      
      // Add feature-specific URLs if provided in crawl instructions
      if (crawlInstructions) {
        const featureUrls = this.extractFeatureUrlsFromInstructions(crawlInstructions, baseUrl);
        featureUrls.forEach(url => {
          if (!urlQueue.includes(url)) {
            urlQueue.push(url);
            urlDepthMap.set(url, 0);
          }
        });
        console.log(`📍 Added ${featureUrls.length} feature-specific URLs from instructions`);
      }
    }

    const pages: any[] = [];
    const elements: any[] = [];
    const screenshots: string[] = [];

    let processedPages = 0;

    while (urlQueue.length > 0 && processedPages < maxPages) {
      const currentUrl = urlQueue.shift()!;

      if (visitedUrls.has(currentUrl)) {
        continue;
      }

      if (!this.isInternalUrl(currentUrl, baseUrl)) {
        continue;
      }

      const currentDepth = urlDepthMap.get(currentUrl) || 0;
      if (currentDepth > maxDepth) {
        continue;
      }

      visitedUrls.add(currentUrl);
      processedPages++;

      try {
        console.log(
          `📄 Crawling page ${processedPages}/${maxPages}: ${currentUrl}`,
        );

        // Navigate to page
        await page.goto(currentUrl, {
          waitUntil: 'networkidle2',
          timeout: 30000,
        });

        // Wait for dynamic content
        await this.waitForDynamicContent(page);

        // Extract page data
        const pageData = await this.extractPageData(page);
        pages.push({
          url: currentUrl,
          title: pageData.title,
          html: pageData.html,
          markdown: pageData.markdown,
          elements: pageData.elements,
          screenshot: pageData.screenshot,
          metadata: pageData.metadata,
        });

        // Extract interactive elements for tour steps
        const interactiveElements = await this.extractInteractiveElements(page);
        elements.push(...interactiveElements);

        // Take screenshot
        const screenshot = await page.screenshot({
          fullPage: true,
          encoding: 'base64',
        });
        screenshots.push(screenshot);

        // Extract links for further crawling
        const links = await this.extractLinksFromPage(page);
        for (const link of links) {
          const fullUrl = this.resolveUrl(link.href, baseUrl);
          if (
            this.isInternalUrl(fullUrl, baseUrl) &&
            !visitedUrls.has(fullUrl) &&
            !urlQueue.includes(fullUrl)
          ) {
            urlQueue.push(fullUrl);
            urlDepthMap.set(fullUrl, currentDepth + 1);
          }
        }
      } catch (error) {
        console.error(`❌ Failed to crawl ${currentUrl}:`, error.message);
        continue;
      }
    }

    console.log(
      `✅ Crawl completed: ${pages.length} pages, ${elements.length} interactive elements`,
    );

    return {
      pages,
      elements,
      screenshots,
      metadata: {
        totalPages: pages.length,
        totalElements: elements.length,
        baseUrl,
        crawlTime: Date.now(),
      },
    };
  }

  /**
   * Extract comprehensive page data including HTML, markdown, and metadata with intelligent re-scraping
   */
  private async extractPageData(page: Page): Promise<any> {
    console.log('📄 Extracting comprehensive page data...');
    
    // Wait for dynamic content to load
    await this.waitForDynamicContent(page);

    // Get initial content snapshot
    let previousSnapshot = await this.getContentSnapshot(page);
    let extractionAttempts = 0;
    const maxExtractionAttempts = 3;
    let allElements: any[] = [];
    let allScreenshots: string[] = [];

    // Iterative extraction to capture all dynamic content
    while (extractionAttempts < maxExtractionAttempts) {
      console.log(`🔄 Extraction attempt ${extractionAttempts + 1}/${maxExtractionAttempts}`);
      
      // Wait for content to stabilize
      await this.stabilizeContent(page);
      
      // Extract current elements
      const currentElements = await this.extractInteractiveElements(page);
      allElements = this.mergeElements(allElements, currentElements);
      
      // Take screenshot
      const screenshot = await page.screenshot({
        fullPage: true,
        encoding: 'base64',
      });
      allScreenshots.push(screenshot);
      
      // Get current content snapshot
      const currentSnapshot = await this.getContentSnapshot(page);
      
      // Check if content has changed significantly
      const hasSignificantChange = this.compareContentSnapshots(previousSnapshot, currentSnapshot);
      
      if (!hasSignificantChange || extractionAttempts >= maxExtractionAttempts - 1) {
        console.log('✅ Content extraction complete');
        break;
      }
      
      // Trigger additional interactions to reveal more content
      await this.triggerAdditionalInteractions(page);
      previousSnapshot = currentSnapshot;
      extractionAttempts++;
    }

    // Final content extraction
    await this.stabilizeContent(page);
    
    // Get final HTML content
    const html = await page.content();

    // Convert to markdown for LLM processing
    const markdown = this.convertHtmlToMarkdown(html);

    // Extract comprehensive page metadata
    const metadata = await page.evaluate(() => ({
      title: document.title,
      url: window.location.href,
      description:
        document
          .querySelector('meta[name="description"]')
          ?.getAttribute('content') || '',
      keywords:
        document
          .querySelector('meta[name="keywords"]')
          ?.getAttribute('content') || '',
      viewport:
        document
          .querySelector('meta[name="viewport"]')
          ?.getAttribute('content') || '',
      canonical:
        document.querySelector('link[rel="canonical"]')?.getAttribute('href') ||
        '',
      ogTitle:
        document
          .querySelector('meta[property="og:title"]')
          ?.getAttribute('content') || '',
      ogDescription:
        document
          .querySelector('meta[property="og:description"]')
          ?.getAttribute('content') || '',
      ogImage:
        document
          .querySelector('meta[property="og:image"]')
          ?.getAttribute('content') || '',
      // Additional metadata
      totalElements: document.querySelectorAll('*').length,
      interactiveElements: document.querySelectorAll('button, a, input, select, textarea').length,
      forms: document.querySelectorAll('form').length,
      images: document.querySelectorAll('img').length,
      links: document.querySelectorAll('a[href]').length,
      scripts: document.querySelectorAll('script').length,
      stylesheets: document.querySelectorAll('link[rel="stylesheet"]').length,
    }));

    // Take final screenshot
    const finalScreenshot = await page.screenshot({
      fullPage: true,
      encoding: 'base64',
    });

    console.log(`✅ Page data extracted: ${allElements.length} elements, ${allScreenshots.length + 1} screenshots`);

    return {
      title: metadata.title,
      html,
      markdown,
      elements: allElements,
      screenshots: [...allScreenshots, finalScreenshot],
      screenshot: finalScreenshot,
      metadata,
      extractionAttempts: extractionAttempts + 1,
    };
  }

  /**
   * Trigger additional interactions to reveal more dynamic content
   */
  private async triggerAdditionalInteractions(page: Page): Promise<void> {
    console.log('🔄 Triggering additional interactions...');
    
    // Strategy 1: Click on tabs and accordions
    await this.interactWithTabsAndAccordions(page);
    
    // Strategy 2: Hover over more elements
    await this.hoverOverAdditionalElements(page);
    
    // Strategy 3: Interact with dropdowns and menus
    await this.interactWithDropdowns(page);
    
    // Strategy 4: Trigger form field interactions
    await this.triggerFormFieldInteractions(page);
    
    // Strategy 5: Handle modal and popup triggers
    await this.handleModalTriggers(page);
  }

  /**
   * Interact with tabs and accordions to reveal content
   */
  private async interactWithTabsAndAccordions(page: Page): Promise<void> {
    console.log('📑 Interacting with tabs and accordions...');
    
    const tabSelectors = [
      '[role="tab"]', '.tab', '.tabs a', '.nav-tabs a',
      '[data-toggle="tab"]', '[data-bs-toggle="tab"]',
      '.accordion-header', '.accordion-button', '.collapse-toggle'
    ];
    
    for (const selector of tabSelectors) {
      try {
        const elements = await page.$$(selector);
        for (const element of elements.slice(0, 5)) { // Limit interactions
          try {
            await element.click();
            await new Promise(resolve => setTimeout(resolve, 1000));
            console.log('✅ Clicked tab/accordion element');
          } catch (error) {
            // Continue with next element
          }
        }
      } catch (error) {
        // Continue with next selector
      }
    }
  }

  /**
   * Hover over additional elements to reveal content
   */
  private async hoverOverAdditionalElements(page: Page): Promise<void> {
    console.log('🖱️ Hovering over additional elements...');
    
    const hoverSelectors = [
      '.card', '.widget', '.tile', '.item', '.product',
      '[data-hover]', '[data-tooltip]', '[data-popover]',
      '.hover', '.tooltip', '.popover', '.dropdown-toggle'
    ];
    
    for (const selector of hoverSelectors) {
      try {
        const elements = await page.$$(selector);
        for (const element of elements.slice(0, 10)) { // Limit interactions
          try {
            await element.hover();
            await new Promise(resolve => setTimeout(resolve, 500));
            console.log('✅ Hovered over element');
          } catch (error) {
            // Continue with next element
          }
        }
      } catch (error) {
        // Continue with next selector
      }
    }
  }

  /**
   * Interact with dropdowns and menus
   */
  private async interactWithDropdowns(page: Page): Promise<void> {
    console.log('📋 Interacting with dropdowns and menus...');
    
    const dropdownSelectors = [
      '.dropdown-toggle', '.dropdown-trigger', '.menu-toggle',
      '[data-toggle="dropdown"]', '[data-bs-toggle="dropdown"]',
      '.select', '.combobox', '[role="combobox"]'
    ];
    
    for (const selector of dropdownSelectors) {
      try {
        const elements = await page.$$(selector);
        for (const element of elements.slice(0, 5)) { // Limit interactions
          try {
            await element.click();
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Try to interact with dropdown options
            const options = await page.$$('.dropdown-menu a, .dropdown-item, .option');
            for (const option of options.slice(0, 3)) {
              try {
                await option.hover();
                await new Promise(resolve => setTimeout(resolve, 300));
              } catch (error) {
                // Continue
              }
            }
            
            // Close dropdown
            await element.click();
            console.log('✅ Interacted with dropdown');
          } catch (error) {
            // Continue with next element
          }
        }
      } catch (error) {
        // Continue with next selector
      }
    }
  }

  /**
   * Trigger form field interactions
   */
  private async triggerFormFieldInteractions(page: Page): Promise<void> {
    console.log('📝 Triggering form field interactions...');
    
    const formSelectors = [
      'input[type="text"]', 'input[type="email"]', 'input[type="search"]',
      'select', 'textarea', '[role="combobox"]', '[role="textbox"]'
    ];
    
    for (const selector of formSelectors) {
      try {
        const elements = await page.$$(selector);
        for (const element of elements.slice(0, 3)) { // Limit interactions
          try {
            await element.click();
            await element.type('test', { delay: 50 });
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Clear the input
            await element.click({ clickCount: 3 });
            await element.press('Backspace');
            console.log('✅ Tested form field');
          } catch (error) {
            // Continue with next element
          }
        }
      } catch (error) {
        // Continue with next selector
      }
    }
  }

  /**
   * Handle modal and popup triggers
   */
  private async handleModalTriggers(page: Page): Promise<void> {
    console.log('🪟 Handling modal and popup triggers...');
    
    const modalSelectors = [
      '[data-toggle="modal"]', '[data-bs-toggle="modal"]',
      '.modal-trigger', '.popup-trigger', '.lightbox-trigger',
      '[data-target*="modal"]', '[data-bs-target*="modal"]'
    ];
    
    for (const selector of modalSelectors) {
      try {
        const elements = await page.$$(selector);
        for (const element of elements.slice(0, 3)) { // Limit interactions
          try {
            await element.click();
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Try to close modal if it opened
            const closeButtons = await page.$$('.modal-close, .close, [data-dismiss="modal"]');
            for (const closeBtn of closeButtons) {
              try {
                await closeBtn.click();
                break;
              } catch (error) {
                // Continue
              }
            }
            
            console.log('✅ Handled modal trigger');
          } catch (error) {
            // Continue with next element
          }
        }
      } catch (error) {
        // Continue with next selector
      }
    }
  }

  /**
   * Merge elements from multiple extractions, removing duplicates
   */
  private mergeElements(existingElements: any[], newElements: any[]): any[] {
    const elementMap = new Map<string, any>();
    
    // Add existing elements
    existingElements.forEach(element => {
      elementMap.set(element.selector, element);
    });
    
    // Add new elements, updating existing ones if they have higher importance
    newElements.forEach(element => {
      const existing = elementMap.get(element.selector);
      if (!existing || element.importance > existing.importance) {
        elementMap.set(element.selector, element);
      }
    });
    
    return Array.from(elementMap.values()).sort((a, b) => b.importance - a.importance);
  }

  /**
   * Extract comprehensive interactive elements including dynamically loaded content
   */
  private async extractInteractiveElements(page: Page): Promise<any[]> {
    console.log('🔍 Extracting comprehensive interactive elements...');
    
    // First, ensure all dynamic content is loaded
    await this.waitForDynamicContent(page);
    
    return page.evaluate(() => {
      const elements: any[] = [];
      const processedElements = new Set<string>();

      // Helper function to generate robust CSS selector for an element
      const generateSelector = (element: Element): string => {
        // Priority 1: ID
        if (element.id) {
          return `#${element.id}`;
        }

        // Priority 2: Data attributes
        if (element.getAttribute('data-testid')) {
          return `[data-testid="${element.getAttribute('data-testid')}"]`;
        }

        if (element.getAttribute('data-cy')) {
          return `[data-cy="${element.getAttribute('data-cy')}"]`;
        }

        if (element.getAttribute('data-qa')) {
          return `[data-qa="${element.getAttribute('data-qa')}"]`;
        }

        // Priority 3: Aria attributes
        if (element.getAttribute('aria-label')) {
          return `[aria-label="${element.getAttribute('aria-label')}"]`;
        }

        // Priority 4: Role attribute
        if (element.getAttribute('role')) {
          const role = element.getAttribute('role');
          const tagName = element.tagName.toLowerCase();
          return `${tagName}[role="${role}"]`;
        }

        // Priority 5: Class names (most specific first)
        if (element.className) {
          const classes = element.className.split(' ').filter((c) => c.trim());
          if (classes.length > 0) {
            // Use the most specific class
            const specificClass = classes.find(c => 
              c.includes('btn') || c.includes('button') || c.includes('link') ||
              c.includes('nav') || c.includes('menu') || c.includes('tab')
            ) || classes[0];
            return `.${specificClass}`;
          }
        }

        // Priority 6: Tag with attributes
        const tagName = element.tagName.toLowerCase();
        const type = element.getAttribute('type');
        if (type) {
          return `${tagName}[type="${type}"]`;
        }

        // Priority 7: Tag with text content (for buttons/links)
        const text = element.textContent?.trim();
        if (text && text.length < 50) {
          return `${tagName}:has-text("${text}")`;
        }

        // Fallback: Tag with nth-child
        const parent = element.parentElement;
        if (parent) {
          const siblings = Array.from(parent.children).filter(s => s.tagName === element.tagName);
          const index = siblings.indexOf(element);
          return `${tagName}:nth-of-type(${index + 1})`;
        }

        return tagName;
      };

      // Helper function to check if an element is interactive
      const isInteractiveElement = (element: Element): boolean => {
        const interactiveTags = [
          'button', 'a', 'input', 'select', 'textarea', 'label',
          'summary', 'details', 'option', 'optgroup'
        ];
        const interactiveRoles = [
          'button', 'link', 'tab', 'menuitem', 'option', 'checkbox',
          'radio', 'textbox', 'combobox', 'listbox', 'menu', 'menubar',
          'tablist', 'tree', 'grid', 'row', 'cell'
        ];

        // Check by tag name
        if (interactiveTags.includes(element.tagName.toLowerCase())) {
          return true;
        }

        // Check by role
        const role = element.getAttribute('role');
        if (role && interactiveRoles.includes(role)) {
          return true;
        }

        // Check for event handlers
        const hasEventHandlers = [
          'onclick', 'onmousedown', 'onmouseup', 'onmouseover',
          'onmouseout', 'onfocus', 'onblur', 'onchange', 'onsubmit'
        ].some(attr => element.getAttribute(attr));

        if (hasEventHandlers) {
          return true;
        }

        // Check for interactive classes
        const className = element.className.toLowerCase();
        const interactiveClasses = [
          'btn', 'button', 'link', 'clickable', 'interactive',
          'nav', 'menu', 'tab', 'accordion', 'dropdown', 'toggle',
          'expand', 'collapse', 'show', 'hide'
        ];

        if (interactiveClasses.some(cls => className.includes(cls))) {
          return true;
        }

        // Check for cursor pointer style
        const computedStyle = window.getComputedStyle(element);
        if (computedStyle.cursor === 'pointer') {
          return true;
        }

        return false;
      };

      // Helper function to get element importance score
      const getElementImportance = (element: Element): number => {
        let score = 0;
        
        // High importance indicators
        if (element.getAttribute('data-testid')) score += 10;
        if (element.getAttribute('data-cy')) score += 10;
        if (element.getAttribute('data-qa')) score += 10;
        if (element.id) score += 8;
        if (element.getAttribute('aria-label')) score += 7;
        if (element.getAttribute('role')) score += 6;
        
        // Text content importance
        const text = element.textContent?.trim();
        if (text) {
          const importantTexts = [
            'login', 'sign in', 'sign up', 'register', 'dashboard', 'home',
            'profile', 'settings', 'account', 'billing', 'payment', 'upgrade',
            'create', 'add', 'new', 'edit', 'delete', 'save', 'cancel',
            'submit', 'continue', 'next', 'previous', 'back', 'close'
          ];
          
          if (importantTexts.some(important => text.toLowerCase().includes(important))) {
            score += 5;
          }
        }
        
        // Class name importance
        const className = element.className.toLowerCase();
        if (className.includes('primary')) score += 4;
        if (className.includes('main')) score += 3;
        if (className.includes('nav')) score += 3;
        if (className.includes('menu')) score += 3;
        
        return score;
      };

      // Comprehensive selectors for all possible interactive elements
      const selectors = [
        // Standard interactive elements
        'button', 'a[href]', 'input', 'select', 'textarea', 'label',
        'summary', 'details', 'option', 'optgroup',
        
        // Role-based selectors
        '[role="button"]', '[role="link"]', '[role="tab"]', '[role="menuitem"]',
        '[role="checkbox"]', '[role="radio"]', '[role="textbox"]', '[role="combobox"]',
        '[role="listbox"]', '[role="menu"]', '[role="menubar"]', '[role="tablist"]',
        '[role="tree"]', '[role="grid"]', '[role="row"]', '[role="cell"]',
        
        // Event handler selectors
        '[onclick]', '[onmousedown]', '[onmouseup]', '[onmouseover]',
        '[onmouseout]', '[onfocus]', '[onblur]', '[onchange]', '[onsubmit]',
        
        // Data attribute selectors
        '[data-testid]', '[data-cy]', '[data-qa]', '[data-test]',
        '[data-hover]', '[data-toggle]', '[data-collapse]', '[data-expand]',
        '[data-dropdown]', '[data-popover]', '[data-tooltip]',
        
        // Aria attribute selectors
        '[aria-label]', '[aria-labelledby]', '[aria-describedby]',
        '[aria-expanded]', '[aria-selected]', '[aria-checked]',
        '[aria-pressed]', '[aria-current]', '[aria-haspopup]',
        
        // Common class patterns
        '.btn', '.button', '.link', '.clickable', '.interactive',
        '.nav', '.navbar', '.menu', '.menu-item', '.nav-item',
        '.tab', '.tabs', '.accordion', '.dropdown', '.toggle',
        '.expand', '.collapse', '.show', '.hide', '.active',
        '.primary', '.secondary', '.main', '.sidebar', '.header',
        '.footer', '.content', '.widget', '.card', '.tile',
        '.form', '.input', '.field', '.control', '.action',
        
        // Framework-specific patterns
        '[class*="btn"]', '[class*="button"]', '[class*="link"]',
        '[class*="nav"]', '[class*="menu"]', '[class*="tab"]',
        '[class*="accordion"]', '[class*="dropdown"]', '[class*="toggle"]',
        '[class*="expand"]', '[class*="collapse"]', '[class*="show"]',
        '[class*="hide"]', '[class*="active"]', '[class*="click"]',
        '[class*="hover"]', '[class*="focus"]', '[class*="interact"]',
        
        // Component patterns
        '[class*="component"]', '[class*="element"]', '[class*="item"]',
        '[class*="option"]', '[class*="choice"]', '[class*="select"]',
        '[class*="picker"]', '[class*="chooser"]', '[class*="selector"]',
      ];

      // Process all selectors
      selectors.forEach((selector) => {
        try {
        const foundElements = document.querySelectorAll(selector);
        foundElements.forEach((element) => {
          const rect = element.getBoundingClientRect();
            const computedStyle = window.getComputedStyle(element);

            // Check if element is visible and interactive
            const isVisible = (
            rect.width > 0 &&
            rect.height > 0 &&
            (element as any).offsetParent !== null &&
              computedStyle.visibility !== 'hidden' &&
              computedStyle.display !== 'none' &&
              computedStyle.opacity !== '0'
            );

            if (isVisible) {
              const selector = generateSelector(element);
              const elementKey = `${element.tagName}-${selector}`;
              
              // Avoid duplicates
              if (!processedElements.has(elementKey)) {
                processedElements.add(elementKey);
                
            const elementData = {
                  selector,
              tagName: element.tagName.toLowerCase(),
              text: element.textContent?.trim() || '',
              href: element.getAttribute('href') || '',
              type: element.getAttribute('type') || '',
              id: element.id || '',
              className: element.className || '',
              role: element.getAttribute('role') || '',
              'aria-label': element.getAttribute('aria-label') || '',
              'data-testid': element.getAttribute('data-testid') || '',
                  'data-cy': element.getAttribute('data-cy') || '',
                  'data-qa': element.getAttribute('data-qa') || '',
              onclick: element.getAttribute('onclick') || '',
              position: {
                    x: Math.round(rect.x),
                    y: Math.round(rect.y),
                    width: Math.round(rect.width),
                    height: Math.round(rect.height),
              },
              isVisible: true,
              isInteractive: isInteractiveElement(element),
                  importance: getElementImportance(element),
                  // Additional metadata
                  hasChildren: element.children.length > 0,
                  isExpanded: element.getAttribute('aria-expanded') === 'true',
                  isSelected: element.getAttribute('aria-selected') === 'true',
                  isChecked: element.getAttribute('aria-checked') === 'true',
                  isPressed: element.getAttribute('aria-pressed') === 'true',
                  hasPopup: element.getAttribute('aria-haspopup') === 'true',
                  current: element.getAttribute('aria-current') === 'true',
            };

            elements.push(elementData);
              }
            }
          });
        } catch (error) {
          // Continue with next selector if one fails
          console.warn(`Error processing selector ${selector}:`, error);
        }
      });

      // Sort by importance and remove duplicates
      const uniqueElements = elements
        .filter((element, index, self) => 
          index === self.findIndex(e => e.selector === element.selector)
        )
        .sort((a, b) => b.importance - a.importance);

      console.log(`Found ${uniqueElements.length} interactive elements`);
      return uniqueElements;
    });
  }


  /**
   * Extract links from current page
   */
  private async extractLinksFromPage(
    page: Page,
  ): Promise<Array<{ href: string; text: string }>> {
    return page.evaluate(() => {
      const links: Array<{ href: string; text: string }> = [];
      const anchorElements = document.querySelectorAll('a[href]');

      anchorElements.forEach((anchor) => {
        const href = anchor.getAttribute('href');
        const text = anchor.textContent?.trim() || '';

        if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
          links.push({ href, text });
        }
      });

      return links;
    });
  }

  /**
   * Check if URL is internal to the base domain
   */
  private isInternalUrl(url: string, baseUrl: string): boolean {
    try {
      const urlObj = new URL(url, baseUrl);
      const baseObj = new URL(baseUrl);
      return urlObj.origin === baseObj.origin;
    } catch {
      return false;
    }
  }

  /**
   * Resolve relative URLs to absolute URLs
   */
  private resolveUrl(href: string, baseUrl: string): string {
    try {
      return new URL(href, baseUrl).href;
    } catch {
      return href;
    }
  }

  /**
   * Intelligently wait for and discover dynamic content through systematic interaction
   */
  private async waitForDynamicContent(page: Page): Promise<void> {
    try {
      console.log('🔍 Starting intelligent dynamic content discovery...');
      
      // Step 1: Wait for initial page load
      await page.waitForFunction(() => document.readyState === 'complete');
      console.log('✅ Initial page load complete');

      // Step 2: Wait for loading indicators to disappear
      await this.waitForLoadingIndicators(page);
      
      // Step 3: Systematic content discovery through interactions
      await this.discoverDynamicContent(page);
      
      // Step 4: Final content stabilization
      await this.stabilizeContent(page);
      
      console.log('✅ Dynamic content discovery complete');
    } catch (error) {
      console.log('⚠️ Dynamic content discovery timeout, continuing...');
    }
  }

  /**
   * Wait for loading indicators to disappear
   */
  private async waitForLoadingIndicators(page: Page): Promise<void> {
    const loadingSelectors = [
      '[class*="loading"]',
      '[class*="spinner"]',
      '[id*="loading"]',
      '[data-testid*="loading"]',
      '[aria-label*="loading"]',
      '.loading',
      '.spinner',
      '.loader',
      '[class*="skeleton"]',
      '[class*="placeholder"]',
    ];

    for (const selector of loadingSelectors) {
      try {
        await page.waitForFunction(
          () => {
            const elements = document.querySelectorAll(selector);
            return elements.length === 0 || 
                   Array.from(elements).every(el => 
                     window.getComputedStyle(el).display === 'none' ||
                     window.getComputedStyle(el).visibility === 'hidden'
                   );
          },
          { timeout: 3000 }
        );
      } catch (error) {
          // Continue if timeout
      }
    }
  }

  /**
   * Discover dynamic content through systematic interactions
   */
  private async discoverDynamicContent(page: Page): Promise<void> {
    console.log('🔍 Discovering dynamic content through interactions...');
    
    // Get initial content state
    const initialContent = await this.getContentSnapshot(page);
    
    // Strategy 1: Scroll to trigger lazy loading
    await this.triggerLazyLoading(page);
    
    // Strategy 2: Hover over interactive elements to reveal content
    await this.hoverToRevealContent(page);
    
    // Strategy 3: Click on expandable/collapsible elements
    await this.clickToExpandContent(page);
    
    // Strategy 4: Interact with tabs and navigation
    await this.interactWithNavigation(page);
    
    // Strategy 5: Trigger form interactions
    await this.triggerFormInteractions(page);
    
    // Strategy 6: Handle infinite scroll and pagination
    await this.handleInfiniteScroll(page);
    
    // Strategy 7: Comprehensive element interactions
    await this.performComprehensiveElementInteractions(page);
    
    // Check if new content was revealed
    const finalContent = await this.getContentSnapshot(page);
    const hasNewContent = this.compareContentSnapshots(initialContent, finalContent);
    
    if (hasNewContent) {
      console.log('✅ New dynamic content discovered');
      // Recursively discover more content
      await this.discoverDynamicContent(page);
    }
  }

  /**
   * Trigger lazy loading by scrolling
   */
  private async triggerLazyLoading(page: Page): Promise<void> {
    console.log('📜 Triggering lazy loading through scrolling...');
    
    const viewportHeight = await page.evaluate(() => window.innerHeight);
    const documentHeight = await page.evaluate(() => document.body.scrollHeight);
    
    // Scroll in increments to trigger lazy loading
    for (let scrollPosition = 0; scrollPosition < documentHeight; scrollPosition += viewportHeight) {
      await page.evaluate((pos) => {
        window.scrollTo(0, pos);
      }, scrollPosition);
      
      // Wait for potential lazy loading
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Scroll back to top
    await page.evaluate(() => window.scrollTo(0, 0));
  }

  /**
   * Hover over elements to reveal hidden content
   */
  private async hoverToRevealContent(page: Page): Promise<void> {
    console.log('🖱️ Hovering to reveal content...');
    
    const hoverableElements = await page.evaluate(() => {
      const elements = document.querySelectorAll(`
        [data-hover], [data-tooltip], [data-popover], [data-dropdown],
        .hover, .tooltip, .popover, .dropdown,
        [class*="hover"], [class*="tooltip"], [class*="popover"],
        button, a, [role="button"], [role="menuitem"]
      `);
      
      return Array.from(elements)
        .filter(el => {
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0 && 
                 window.getComputedStyle(el).visibility !== 'hidden';
        })
        .slice(0, 20) // Limit to prevent excessive interactions
        .map(el => ({
          selector: this.generateSelector(el),
          tagName: el.tagName.toLowerCase(),
          text: el.textContent?.trim().substring(0, 50) || '',
        }));
    });

    for (const element of hoverableElements) {
      try {
        const elementHandle = await page.$(element.selector);
        if (elementHandle) {
          await elementHandle.hover();
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Check if new content appeared
          const newElements = await page.evaluate(() => 
            document.querySelectorAll('[class*="show"], [class*="visible"], [class*="active"]').length
          );
          
          if (newElements > 0) {
            console.log(`✅ Hover revealed content on ${element.tagName}`);
          }
        }
    } catch (error) {
        // Continue with next element
      }
    }
  }

  /**
   * Click on expandable elements to reveal content
   */
  private async clickToExpandContent(page: Page): Promise<void> {
    console.log('🖱️ Clicking to expand content...');
    
    const expandableElements = await page.evaluate(() => {
      const elements = document.querySelectorAll(`
        [data-toggle], [data-collapse], [data-expand],
        .collapse, .expand, .accordion, .toggle,
        [class*="collapse"], [class*="expand"], [class*="accordion"],
        button[aria-expanded], [role="button"][aria-expanded],
        [data-testid*="expand"], [data-testid*="toggle"]
      `);
      
      return Array.from(elements)
        .filter(el => {
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0 && 
                 (el as any).offsetParent !== null &&
                 window.getComputedStyle(el).visibility !== 'hidden' &&
                 window.getComputedStyle(el).display !== 'none';
        })
        .slice(0, 15) // Limit interactions
        .map(el => ({
          selector: this.generateSelector(el),
          tagName: el.tagName.toLowerCase(),
          text: el.textContent?.trim().substring(0, 50) || '',
          ariaExpanded: el.getAttribute('aria-expanded'),
        }));
    });

    for (const element of expandableElements) {
      try {
        const elementHandle = await page.$(element.selector);
        if (elementHandle) {
          // Check if element is already expanded
          const isExpanded = await elementHandle.evaluate(el => 
            el.getAttribute('aria-expanded') === 'true' ||
            el.classList.contains('expanded') ||
            el.classList.contains('active')
          );
          
          if (!isExpanded) {
            await elementHandle.click();
            await new Promise(resolve => setTimeout(resolve, 1000));
            console.log(`✅ Clicked expandable element: ${element.text}`);
          }
        }
      } catch (error) {
        // Continue with next element
      }
    }
  }

  /**
   * Interact with navigation elements (tabs, menus, etc.)
   */
  private async interactWithNavigation(page: Page): Promise<void> {
    console.log('🧭 Interacting with navigation elements...');
    
    const navElements = await page.evaluate(() => {
      const elements = document.querySelectorAll(`
        nav a, .nav a, .navbar a, .menu a,
        [role="tab"], [role="menuitem"], [role="navigation"] a,
        .tab, .menu-item, .nav-item,
        [data-testid*="nav"], [data-testid*="menu"], [data-testid*="tab"]
      `);
      
      return Array.from(elements)
        .filter(el => {
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0 && 
                 window.getComputedStyle(el).visibility !== 'hidden';
        })
        .slice(0, 10) // Limit to main navigation
        .map(el => ({
          selector: this.generateSelector(el),
          text: el.textContent?.trim().substring(0, 50) || '',
          href: el.getAttribute('href') || '',
        }));
    });

    for (const element of navElements) {
      try {
        const elementHandle = await page.$(element.selector);
        if (elementHandle) {
          await elementHandle.click();
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          // Check if we're on a new page or if content changed
          const currentUrl = page.url();
          if (currentUrl !== element.href && element.href) {
            console.log(`✅ Navigated to: ${element.text}`);
            // Go back to continue discovery
            await page.goBack();
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
      } catch (error) {
        // Continue with next element
      }
    }
  }

  /**
   * Trigger form interactions to reveal dynamic content
   */
  private async triggerFormInteractions(page: Page): Promise<void> {
    console.log('📝 Triggering form interactions...');
    
    const formElements = await page.evaluate(() => {
      const elements = document.querySelectorAll(`
        input[type="text"], input[type="email"], input[type="search"],
        select, textarea, [role="combobox"], [role="textbox"]
      `);
      
      return Array.from(elements)
        .filter(el => {
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0 && 
                 window.getComputedStyle(el).visibility !== 'hidden';
        })
        .slice(0, 5) // Limit form interactions
        .map(el => ({
          selector: this.generateSelector(el),
          type: el.getAttribute('type') || el.tagName.toLowerCase(),
          placeholder: el.getAttribute('placeholder') || '',
        }));
    });

    for (const element of formElements) {
      try {
        const elementHandle = await page.$(element.selector);
        if (elementHandle) {
          await elementHandle.click();
          await elementHandle.type('test', { delay: 100 });
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // Clear the input
          await elementHandle.click({ clickCount: 3 });
          await elementHandle.press('Backspace');
          
          console.log(`✅ Tested form element: ${element.type}`);
        }
      } catch (error) {
        // Continue with next element
      }
    }
  }

  /**
   * Handle infinite scroll and pagination
   */
  private async handleInfiniteScroll(page: Page): Promise<void> {
    console.log('♾️ Handling infinite scroll and pagination...');
    
    let previousHeight = 0;
    let currentHeight = await page.evaluate(() => document.body.scrollHeight);
    let scrollAttempts = 0;
    const maxScrollAttempts = 5;

    while (currentHeight > previousHeight && scrollAttempts < maxScrollAttempts) {
      previousHeight = currentHeight;
      
      // Scroll to bottom
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Check for "Load More" buttons
      const loadMoreButtons = await page.$$(`
        button:has-text("Load More"), button:has-text("Show More"),
        button:has-text("Load More"), [data-testid*="load-more"],
        [class*="load-more"], [class*="show-more"]
      `);
      
      for (const button of loadMoreButtons) {
        try {
          await button.click();
          await new Promise(resolve => setTimeout(resolve, 2000));
          console.log('✅ Clicked load more button');
        } catch (error) {
          // Continue
        }
      }
      
      currentHeight = await page.evaluate(() => document.body.scrollHeight);
      scrollAttempts++;
    }
    
    // Scroll back to top
    await page.evaluate(() => window.scrollTo(0, 0));
  }

  /**
   * Stabilize content after all interactions
   */
  private async stabilizeContent(page: Page): Promise<void> {
    console.log('⏳ Stabilizing content...');
    
    // Wait for any remaining animations or transitions
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Wait for network idle
    try {
      await page.waitForFunction(() => document.readyState === 'complete', { timeout: 5000 });
    } catch (error) {
      // Continue if timeout
    }
    
    // Final scroll to ensure all content is loaded
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
      window.scrollTo(0, 0);
    });
    
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  /**
   * Get a snapshot of current page content for comparison
   */
  private async getContentSnapshot(page: Page): Promise<any> {
    return await page.evaluate(() => ({
      elementCount: document.querySelectorAll('*').length,
      textContent: document.body.textContent?.length || 0,
      visibleElements: document.querySelectorAll('*').length,
      scrollHeight: document.body.scrollHeight,
    }));
  }

  /**
   * Compare content snapshots to detect changes
   */
  private compareContentSnapshots(initial: any, final: any): boolean {
    return (
      final.elementCount > initial.elementCount ||
      final.textContent > initial.textContent ||
      final.scrollHeight > initial.scrollHeight
    );
  }

  /**
   * Generate CSS selector for an element
   */
  private generateSelector(element: Element): string {
    if (element.id) {
      return `#${element.id}`;
    }
    
    if (element.getAttribute('data-testid')) {
      return `[data-testid="${element.getAttribute('data-testid')}"]`;
    }
    
    if (element.className) {
      const classes = element.className.split(' ').filter(c => c.trim());
      if (classes.length > 0) {
        return `.${classes.join('.')}`;
      }
    }
    
    return element.tagName.toLowerCase();
  }

  /**
   * Comprehensive element interaction system for different content types
   */
  private async performComprehensiveElementInteractions(page: Page): Promise<void> {
    console.log('🎯 Performing comprehensive element interactions...');
    
    // Get all interactive elements
    const elements = await page.evaluate(() => {
      const interactiveElements = document.querySelectorAll(`
        button, a, input, select, textarea, [role="button"], [role="link"],
        [role="tab"], [role="menuitem"], [role="checkbox"], [role="radio"],
        [data-testid], [data-cy], [data-qa], [onclick], [onmousedown],
        .btn, .button, .link, .nav, .menu, .tab, .accordion, .dropdown,
        .toggle, .expand, .collapse, .show, .hide, .active, .clickable,
        .interactive, .hover, .tooltip, .popover, .modal-trigger
      `);
      
      return Array.from(interactiveElements)
        .filter(el => {
          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          return (
            rect.width > 0 && rect.height > 0 &&
            (el as any).offsetParent !== null &&
            style.visibility !== 'hidden' &&
            style.display !== 'none' &&
            style.opacity !== '0'
          );
        })
        .slice(0, 50) // Limit to prevent excessive interactions
        .map(el => ({
          selector: this.generateSelector(el),
          tagName: el.tagName.toLowerCase(),
          text: el.textContent?.trim().substring(0, 100) || '',
          type: el.getAttribute('type') || '',
          role: el.getAttribute('role') || '',
          className: el.className || '',
          hasChildren: el.children.length > 0,
          isExpanded: el.getAttribute('aria-expanded') === 'true',
          isSelected: el.getAttribute('aria-selected') === 'true',
          isChecked: el.getAttribute('aria-checked') === 'true',
          hasPopup: el.getAttribute('aria-haspopup') === 'true',
        }));
    });

    console.log(`🎯 Found ${elements.length} interactive elements to test`);

    // Categorize elements by interaction type
    const elementCategories = this.categorizeElements(elements);

    // Perform different types of interactions
    await this.performHoverInteractions(page, elementCategories.hoverElements);
    await this.performClickInteractions(page, elementCategories.clickElements);
    await this.performFormInteractions(page, elementCategories.formElements);
    await this.performNavigationInteractions(page, elementCategories.navElements);
    await this.performExpandableInteractions(page, elementCategories.expandableElements);
  }

  /**
   * Categorize elements by interaction type
   */
  private categorizeElements(elements: any[]): any {
    return {
      hoverElements: elements.filter(el => 
        el.className.includes('hover') || 
        el.className.includes('tooltip') || 
        el.className.includes('popover') ||
        el.role === 'menuitem' ||
        el.hasPopup
      ),
      clickElements: elements.filter(el => 
        el.tagName === 'button' || 
        el.tagName === 'a' || 
        el.role === 'button' || 
        el.role === 'link' ||
        el.className.includes('btn') ||
        el.className.includes('button') ||
        el.className.includes('clickable')
      ),
      formElements: elements.filter(el => 
        el.tagName === 'input' || 
        el.tagName === 'select' || 
        el.tagName === 'textarea' ||
        el.role === 'textbox' ||
        el.role === 'combobox' ||
        el.role === 'checkbox' ||
        el.role === 'radio'
      ),
      navElements: elements.filter(el => 
        el.className.includes('nav') || 
        el.className.includes('menu') || 
        el.className.includes('tab') ||
        el.role === 'tab' ||
        el.role === 'menuitem' ||
        el.role === 'navigation'
      ),
      expandableElements: elements.filter(el => 
        el.className.includes('accordion') || 
        el.className.includes('collapse') || 
        el.className.includes('expand') ||
        el.className.includes('toggle') ||
        el.className.includes('dropdown') ||
        el.isExpanded !== undefined ||
        el.hasChildren
      )
    };
  }

  /**
   * Perform hover interactions to reveal tooltips and popovers
   */
  private async performHoverInteractions(page: Page, elements: any[]): Promise<void> {
    console.log(`🖱️ Performing hover interactions on ${elements.length} elements...`);
    
    for (const element of elements.slice(0, 20)) { // Limit interactions
      try {
        const elementHandle = await page.$(element.selector);
        if (elementHandle) {
          await elementHandle.hover();
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // Check if new content appeared
          const newContent = await page.evaluate(() => {
            const tooltips = document.querySelectorAll('[class*="tooltip"], [class*="popover"], [class*="show"]');
            return tooltips.length;
          });
          
          if (newContent > 0) {
            console.log(`✅ Hover revealed content on ${element.tagName}: ${element.text}`);
          }
        }
      } catch (error) {
        // Continue with next element
      }
    }
  }

  /**
   * Perform click interactions on buttons and links
   */
  private async performClickInteractions(page: Page, elements: any[]): Promise<void> {
    console.log(`🖱️ Performing click interactions on ${elements.length} elements...`);
    
    for (const element of elements.slice(0, 15)) { // Limit interactions
      try {
        const elementHandle = await page.$(element.selector);
        if (elementHandle) {
          const initialUrl = page.url();
          
          await elementHandle.click();
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          // Check if navigation occurred
          const currentUrl = page.url();
          if (currentUrl !== initialUrl) {
            console.log(`✅ Click navigated: ${element.text}`);
            // Go back to continue testing
            await page.goBack();
            await new Promise(resolve => setTimeout(resolve, 1000));
          } else {
            console.log(`✅ Clicked element: ${element.text}`);
          }
        }
      } catch (error) {
        // Continue with next element
      }
    }
  }

  /**
   * Perform form interactions
   */
  private async performFormInteractions(page: Page, elements: any[]): Promise<void> {
    console.log(`📝 Performing form interactions on ${elements.length} elements...`);
    
    for (const element of elements.slice(0, 10)) { // Limit interactions
      try {
        const elementHandle = await page.$(element.selector);
        if (elementHandle) {
          if (element.tagName === 'input' || element.tagName === 'textarea') {
            await elementHandle.click();
            await elementHandle.type('test input', { delay: 100 });
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Clear the input
            await elementHandle.click({ clickCount: 3 });
            await elementHandle.press('Backspace');
            console.log(`✅ Tested input: ${element.text}`);
          } else if (element.tagName === 'select') {
            await elementHandle.click();
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Try to select an option
            const options = await page.$$('option');
            if (options.length > 1) {
              await options[1].click();
              await new Promise(resolve => setTimeout(resolve, 500));
            }
            console.log(`✅ Tested select: ${element.text}`);
          }
        }
      } catch (error) {
        // Continue with next element
      }
    }
  }

  /**
   * Perform navigation interactions
   */
  private async performNavigationInteractions(page: Page, elements: any[]): Promise<void> {
    console.log(`🧭 Performing navigation interactions on ${elements.length} elements...`);
    
    for (const element of elements.slice(0, 10)) { // Limit interactions
      try {
        const elementHandle = await page.$(element.selector);
        if (elementHandle) {
          const initialUrl = page.url();
          
          await elementHandle.click();
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          // Check if navigation occurred
          const currentUrl = page.url();
          if (currentUrl !== initialUrl) {
            console.log(`✅ Navigation: ${element.text}`);
            // Go back to continue testing
            await page.goBack();
            await new Promise(resolve => setTimeout(resolve, 1000));
          } else {
            console.log(`✅ Clicked nav element: ${element.text}`);
          }
        }
      } catch (error) {
        // Continue with next element
      }
    }
  }

  /**
   * Perform expandable element interactions
   */
  private async performExpandableInteractions(page: Page, elements: any[]): Promise<void> {
    console.log(`📂 Performing expandable interactions on ${elements.length} elements...`);
    
    for (const element of elements.slice(0, 10)) { // Limit interactions
      try {
        const elementHandle = await page.$(element.selector);
        if (elementHandle) {
          // Check if already expanded
          const isExpanded = await elementHandle.evaluate(el => 
            el.getAttribute('aria-expanded') === 'true' ||
            el.classList.contains('expanded') ||
            el.classList.contains('active') ||
            el.classList.contains('show')
          );
          
          if (!isExpanded) {
            await elementHandle.click();
            await new Promise(resolve => setTimeout(resolve, 2000));
            console.log(`✅ Expanded element: ${element.text}`);
            
            // Try to interact with expanded content
            const expandedContent = await page.$$('.show, .expanded, .active, .collapse.show');
            for (const content of expandedContent.slice(0, 3)) {
              try {
                await content.hover();
                await new Promise(resolve => setTimeout(resolve, 500));
              } catch (error) {
                // Continue
              }
            }
          }
        }
      } catch (error) {
        // Continue with next element
      }
    }
  }

  /**
   * Generate product tour using LLM analysis of scraped data
   */
  private async generateTourWithLLM(
    scrapedData: {
      pages: any[];
      elements: any[];
      screenshots: string[];
      metadata: any;
    },
    websiteUrl: string,
    processedFiles?: {
      apiDocs: string[];
      productDocs: string[];
      techDocs: string[];
      otherDocs: string[];
    },
    targetFeature?: string,
    roadmap?: {
      roadmap: Array<{
        step: number;
        action: string;
        url?: string;
        selector?: string;
        description: string;
        expectedOutcome: string;
        waitFor?: string;
        screenshot?: boolean;
      }>;
      featureContext: string;
      keyUrls: string[];
    },
  ): Promise<Tour> {
    console.log('🤖 Generating tour with LLM analysis...');

    try {
      // Prepare data for LLM analysis
      const analysisData = this.prepareDataForLLM(scrapedData);

      // Create LLM prompt for tour generation
      this.createTourGenerationPrompt(analysisData, websiteUrl, processedFiles, targetFeature, roadmap);

      // Call LLM service (this would integrate with your LLM service)
      const llmResponse = await this.callLLMService();

      // Parse and validate LLM response
      const tour = this.parseLLMResponse(llmResponse);

      console.log(`✅ Tour generated with ${tour.steps.length} steps`);
      return tour;
    } catch (error) {
      console.error('❌ LLM tour generation failed:', error);

      // Fallback: Generate basic tour from scraped elements
      return this.generateFallbackTour(scrapedData);
    }
  }

  /**
   * Prepare scraped data for LLM analysis
   */
  private prepareDataForLLM(scrapedData: {
    pages: any[];
    elements: any[];
    screenshots: string[];
    metadata: any;
  }): any {
    const analysisData = {
      website: {
        totalPages: scrapedData.pages.length,
        totalElements: scrapedData.elements.length,
        pages: scrapedData.pages.map((page) => ({
          url: page.url,
          title: page.title,
          markdown: page.markdown?.substring(0, 2000), // Limit for token efficiency
          elementCount: page.elements?.length || 0,
          metadata: page.metadata,
        })),
      },
      interactiveElements: scrapedData.elements
        .filter((el) => el.isInteractive)
        .map((el) => ({
          selector: el.selector,
          tagName: el.tagName,
          text: el.text,
          href: el.href,
          type: el.type,
          role: el.role,
          'aria-label': el['aria-label'],
          position: el.position,
        })),
      keyFeatures: this.extractKeyFeatures(scrapedData),
      userFlows: this.identifyUserFlows(),
    };

    return analysisData;
  }

  /**
   * Extract key features from scraped data
   */
  private extractKeyFeatures(scrapedData: any): string[] {
    const features: string[] = [];

    // Analyze page titles and content for key features
    scrapedData.pages.forEach((page) => {
      const title = page.title?.toLowerCase() || '';
      const markdown = page.markdown?.toLowerCase() || '';

      // Common feature indicators
      const featureKeywords = [
        'dashboard',
        'analytics',
        'reports',
        'settings',
        'profile',
        'billing',
        'payment',
        'subscription',
        'plan',
        'upgrade',
        'notification',
        'alert',
        'message',
        'chat',
        'support',
        'documentation',
        'help',
        'guide',
        'tutorial',
        'api',
        'integration',
        'webhook',
        'export',
        'import',
        'sync',
      ];

      featureKeywords.forEach((keyword) => {
        if (title.includes(keyword) || markdown.includes(keyword)) {
          if (!features.includes(keyword)) {
            features.push(keyword);
          }
        }
      });
    });

    return features;
  }

  /**
   * Identify potential user flows from scraped data
   */
  private identifyUserFlows(): string[] {
    const flows: string[] = [];

    // Analyze navigation patterns and common user journeys
    const commonFlows = [
      'Login → Dashboard → Settings',
      'Dashboard → Analytics → Reports',
      'Profile → Settings → Billing',
      'Dashboard → Create → Configure',
      'Dashboard → View → Edit → Save',
    ];

    // This is a simplified version - in practice, you'd analyze
    // the actual navigation patterns and element relationships
    flows.push(...commonFlows);

    return flows;
  }

  /**
   * Create comprehensive prompt for LLM tour generation
   */
  private createTourGenerationPrompt(
    analysisData: any,
    websiteUrl: string,
    processedFiles?: {
      apiDocs: string[];
      productDocs: string[];
      techDocs: string[];
      otherDocs: string[];
    },
    targetFeature?: string,
    roadmap?: {
      roadmap: Array<{
        step: number;
        action: string;
        url?: string;
        selector?: string;
        description: string;
        expectedOutcome: string;
        waitFor?: string;
        screenshot?: boolean;
      }>;
      featureContext: string;
      keyUrls: string[];
    },
  ): string {
    // Build feature context section
    let featureContext = '';
    if (targetFeature) {
      featureContext += `\nTARGET FEATURE: ${targetFeature}`;
    }
    
    if (processedFiles) {
      if (processedFiles.apiDocs.length > 0) {
        featureContext += `\n\nAPI DOCUMENTATION:\n${processedFiles.apiDocs.join('\n\n')}`;
      }
      if (processedFiles.productDocs.length > 0) {
        featureContext += `\n\nPRODUCT DOCUMENTATION:\n${processedFiles.productDocs.join('\n\n')}`;
      }
      if (processedFiles.techDocs.length > 0) {
        featureContext += `\n\nTECHNICAL DOCUMENTATION:\n${processedFiles.techDocs.join('\n\n')}`;
      }
      if (processedFiles.otherDocs.length > 0) {
        featureContext += `\n\nADDITIONAL DOCUMENTATION:\n${processedFiles.otherDocs.join('\n\n')}`;
      }
    }

    // Add roadmap context
    if (roadmap) {
      featureContext += `\n\nEXECUTION ROADMAP:\n`;
      featureContext += `Feature Context: ${roadmap.featureContext}\n`;
      featureContext += `Key URLs: ${roadmap.keyUrls.join(', ')}\n`;
      featureContext += `Execution Steps:\n`;
      roadmap.roadmap.forEach(step => {
        featureContext += `${step.step}. ${step.description} (${step.action})\n`;
      });
    }

    return `
You are an expert UX analyst tasked with creating an interactive product tour for a web application.

WEBSITE DATA:
- URL: ${websiteUrl}
- Total Pages: ${analysisData.website.totalPages}
- Total Interactive Elements: ${analysisData.interactiveElements.length}
- Key Features: ${analysisData.keyFeatures.join(', ')}
- Identified User Flows: ${analysisData.userFlows.join(', ')}${featureContext}

PAGES ANALYZED:
${analysisData.website.pages
  .map(
    (page, index) => `
${index + 1}. ${page.title}
   URL: ${page.url}
   Elements: ${page.elementCount}
   Content Preview: ${page.markdown?.substring(0, 200)}...
`,
  )
  .join('')}

INTERACTIVE ELEMENTS:
${analysisData.interactiveElements
  .slice(0, 20)
  .map(
    (el, index) => `
${index + 1}. ${el.tagName} - "${el.text}"
   Selector: ${el.selector}
   Type: ${el.type}
   Role: ${el.role}
`,
  )
  .join('')}

TASK:
Create a focused product tour that demonstrates the specific features and functionality of this web application. The tour should:

1. Focus on the target feature: ${targetFeature || 'key features identified from the website'}
2. Use the provided documentation to understand feature context and functionality
3. Follow logical user flows based on the feature requirements
4. Include clear, actionable steps that demonstrate the feature
5. Be suitable for users wanting to learn about this specific feature
6. Cover 3-8 key steps maximum (focused on the feature)
7. Include both navigation and feature demonstration steps
8. Prioritize steps that showcase the feature's value and functionality

REQUIREMENTS:
- Each step must have a valid CSS selector
- Actions should be: click, hover, type, scroll, or wait
- Descriptions should be clear and user-friendly
- Voiceover text should be conversational and helpful
- Steps should be ordered logically
- Include both basic navigation and advanced features

OUTPUT FORMAT:
Return a JSON object with this exact structure:
{
  "title": "Product Tour Title",
  "description": "Brief description of what this tour demonstrates",
  "steps": [
    {
      "selector": "CSS selector for the element",
      "action": "click|hover|type|scroll|wait",
      "description": "What the user should do",
      "voiceover": "Text for narration",
      "order": 1,
      "elementText": "Text content of the element",
      "elementType": "HTML element type"
    }
  ],
  "totalDuration": 300,
  "difficulty": "beginner|intermediate|advanced"
}

Focus on creating a tour that showcases the application's core value proposition and key features in a logical, user-friendly sequence.
`;
  }

  /**
   * Call LLM service to generate tour
   */
  private async callLLMService(): Promise<string> {
    // This is a placeholder - you would integrate with your actual LLM service
    // For now, return a mock response for demonstration

    console.log('🤖 Calling LLM service...');

    // Mock LLM response for demonstration
    const mockResponse = {
      title: 'Complete Product Tour',
      description:
        'A comprehensive tour showcasing the key features and functionality of the application',
      steps: [
        {
          selector: "button[data-testid='dashboard-btn']",
          action: 'click',
          description:
            'Click the Dashboard button to access the main dashboard',
          voiceover:
            "Welcome! Let's start by clicking the Dashboard button to see your main overview.",
          order: 1,
          elementText: 'Dashboard',
          elementType: 'button',
        },
        {
          selector: '.analytics-card',
          action: 'hover',
          description: 'Hover over the Analytics card to see detailed metrics',
          voiceover:
            'Here you can see your key analytics. Hover over this card to explore the metrics.',
          order: 2,
          elementText: 'Analytics',
          elementType: 'div',
        },
        {
          selector: "input[name='search']",
          action: 'type',
          description: 'Type in the search box to find specific data',
          voiceover:
            "Use the search functionality to quickly find what you're looking for.",
          order: 3,
          elementText: '',
          elementType: 'input',
        },
        {
          selector: "button[aria-label='Settings']",
          action: 'click',
          description:
            'Click the Settings button to configure your preferences',
          voiceover: 'Access your settings to customize your experience.',
          order: 4,
          elementText: 'Settings',
          elementType: 'button',
        },
        {
          selector: '.notification-bell',
          action: 'click',
          description: 'Click the notification bell to view your alerts',
          voiceover:
            'Stay updated with your notifications by clicking the bell icon.',
          order: 5,
          elementText: 'Notifications',
          elementType: 'button',
        },
      ],
      totalDuration: 300,
      difficulty: 'beginner',
    };

    return JSON.stringify(mockResponse);
  }

  /**
   * Parse and validate LLM response
   */
  private parseLLMResponse(response: string): Tour {
    try {
      const parsed = JSON.parse(response);
      return TourSchema.parse(parsed);
    } catch (error) {
      console.error('❌ Failed to parse LLM response:', error);
      throw new Error('Invalid LLM response format');
    }
  }

  /**
   * Generate fallback tour when LLM fails
   */
  private generateFallbackTour(scrapedData: {
    pages: any[];
    elements: any[];
    screenshots: string[];
    metadata: any;
  }): Tour {
    console.log('🔄 Generating fallback tour...');

    const interactiveElements = scrapedData.elements.filter(
      (el) => el.isInteractive,
    );
    const steps: TourStep[] = [];

    // Create basic tour steps from interactive elements
    interactiveElements.slice(0, 5).forEach((element, index) => {
      steps.push({
        selector: element.selector,
        action: this.determineAction(element),
        description: `Step ${index + 1}: ${element.text || 'Interact with this element'}`,
        voiceover: `Let's explore this ${element.tagName} element.`,
        order: index + 1,
        elementText: element.text,
        elementType: element.tagName,
      });
    });

    return {
      title: 'Basic Product Tour',
      description: 'An introductory tour of the main features',
      steps,
      totalDuration: steps.length * 30, // 30 seconds per step
      difficulty: 'beginner',
    };
  }

  /**
   * Determine appropriate action for an element
   */
  private determineAction(
    element: any,
  ): 'click' | 'hover' | 'type' | 'scroll' | 'wait' {
    const tagName = element.tagName?.toLowerCase();
    const type = element.type?.toLowerCase();

    if (tagName === 'input' && type === 'text') {
      return 'type';
    } else if (tagName === 'button' || tagName === 'a' || type === 'submit') {
      return 'click';
    } else if (tagName === 'select') {
      return 'click';
    } else {
      return 'click'; // Default to click
    }
  }

  /**
   * Convert HTML to Markdown (simplified version)
   */
  private convertHtmlToMarkdown(html: string): string {
    try {
      // Basic HTML to Markdown conversion
      let markdown = html;

      // Remove script and style tags
      markdown = markdown.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
      markdown = markdown.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

      // Convert headings
      markdown = markdown.replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n');
      markdown = markdown.replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n');
      markdown = markdown.replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n');

      // Convert links
      markdown = markdown.replace(
        /<a[^>]*href=["']([^"']*)["'][^>]*>(.*?)<\/a>/gi,
        '[$2]($1)',
      );

      // Convert bold and italic
      markdown = markdown.replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**');
      markdown = markdown.replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**');
      markdown = markdown.replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*');
      markdown = markdown.replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*');

      // Convert lists
      markdown = markdown.replace(/<ul[^>]*>/gi, '');
      markdown = markdown.replace(/<\/ul>/gi, '\n');
      markdown = markdown.replace(/<ol[^>]*>/gi, '');
      markdown = markdown.replace(/<\/ol>/gi, '\n');
      markdown = markdown.replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n');

      // Convert paragraphs
      markdown = markdown.replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n');

      // Remove remaining HTML tags
      markdown = markdown.replace(/<[^>]+>/g, '');

      // Clean up whitespace
      markdown = markdown.replace(/\n\s*\n/g, '\n\n');
      markdown = markdown.replace(/^\s+|\s+$/g, '');

      return markdown;
    } catch (error) {
      console.error('❌ Error converting HTML to Markdown:', error);
      return html; // Return original HTML if conversion fails
    }
  }
}
