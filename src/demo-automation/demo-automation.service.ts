import { Injectable, Logger } from '@nestjs/common';
import {
  CreateDemoRequestDto,
  CreateDemoResponseDto,
  WebInteractionScriptDto,
} from '../dto/demo-automation.dto';
import { LLMService } from '../llm/llm.service';
import * as puppeteer from 'puppeteer';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class DemoAutomationService {
  private readonly logger = new Logger(DemoAutomationService.name);

  constructor(private readonly llmService: LLMService) {}

  async createDemo(
    request: CreateDemoRequestDto,
  ): Promise<CreateDemoResponseDto> {
    const startTime = Date.now();
    const demoId = uuidv4();

    this.logger.log(`🚀 Starting demo automation for: ${request.websiteUrl}`);

    try {
      // Step 1: Launch browser and navigate to website
      const browser = await puppeteer.launch({
        headless: false, // Set to true for production
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });

      const page = await browser.newPage();
      await page.setViewport({ width: 1920, height: 1080 });

      // Step 2: Navigate to website and login
      await this.navigateAndLogin(
        page,
        request.websiteUrl,
        request.credentials,
      );

      // Step 3: Wait for page to stabilize after login
      this.logger.log('⏳ Waiting for page to stabilize after login...');
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Step 4: Explore the UI and capture elements
      let uiElements: any[] = [];
      try {
        uiElements = await this.exploreUI(page);
      } catch (error) {
        this.logger.error(`❌ Failed to explore UI: ${error.message}`);
        this.logger.log(
          '🔄 Attempting to recover by navigating to the original URL...',
        );

        // Try to navigate back to the original URL if context was destroyed
        try {
          await page.goto(request.websiteUrl, { waitUntil: 'networkidle2' });
          await new Promise((resolve) => setTimeout(resolve, 2000));
          uiElements = await this.exploreUI(page);
        } catch (recoveryError) {
          this.logger.error(`❌ Recovery failed: ${recoveryError.message}`);
          this.logger.log(
            '🔄 Creating new page and attempting fresh navigation...',
          );

          // Create a new page as last resort
          try {
            const newPage = await browser.newPage();
            await newPage.setViewport({ width: 1920, height: 1080 });
            await newPage.goto(request.websiteUrl, {
              waitUntil: 'networkidle2',
            });
            await new Promise((resolve) => setTimeout(resolve, 2000));
            uiElements = await this.exploreUI(newPage);
            await newPage.close();
          } catch (finalError) {
            this.logger.error(
              `❌ Final recovery attempt failed: ${finalError.message}`,
            );
            // Return empty array as fallback
            uiElements = [];
          }
        }
      }

      // Step 5: Generate WIS scripts using AI
      this.logger.log(`📊 UI Elements captured: ${uiElements.length}`);
      this.logger.log(
        `📊 Sample elements: ${JSON.stringify(uiElements.slice(0, 3), null, 2)}`,
      );

      const generatedScripts = await this.generateWISScripts(
        uiElements,
        request.websiteUrl,
      );

      this.logger.log(`📊 Generated scripts count: ${generatedScripts.length}`);
      if (generatedScripts.length > 0) {
        this.logger.log(
          `📊 Sample script: ${JSON.stringify(generatedScripts[0], null, 2)}`,
        );
      }

      // Step 5: Clean up
      await browser.close();

      const processingTime = Date.now() - startTime;

      this.logger.log(`✅ Demo automation completed in ${processingTime}ms`);

      // Save WIS scripts to disk
      const filePaths = await this.saveWISScripts(
        demoId,
        generatedScripts,
        request,
      );

      return {
        demoId,
        demoName:
          request.demoName ||
          `Demo for ${new URL(request.websiteUrl).hostname}`,
        websiteUrl: request.websiteUrl,
        generatedScripts,
        summary: {
          totalFlows: generatedScripts.length,
          totalSteps: generatedScripts.reduce(
            (sum, script) => sum + script.steps.length,
            0,
          ),
          processingTime,
        },
        filePaths,
      };
    } catch (error) {
      this.logger.error(`❌ Demo automation failed: ${error.message}`);
      throw new Error(`Demo automation failed: ${error.message}`);
    }
  }

  async createApplicationFeatureDemo(): Promise<CreateDemoResponseDto> {
    const startTime = Date.now();
    const demoId = uuidv4();

    this.logger.log(`🚀 Creating application feature demo automation`);

    try {
      // Generate WIS scripts for application features without browser automation
      const applicationScripts = this.generateApplicationFeatureScripts([]);

      const processingTime = Date.now() - startTime;

      this.logger.log(
        `✅ Application feature demo completed in ${processingTime}ms`,
      );

      // Save WIS scripts to disk
      const filePaths = await this.saveWISScripts(demoId, applicationScripts, {
        websiteUrl: 'http://localhost:3000', // Default local URL
        demoName: 'Application Feature Demo',
        credentials: {
          username: 'demo@example.com',
          password: 'demo123',
        },
      });

      return {
        demoId,
        demoName: 'Application Feature Demo',
        websiteUrl: 'http://localhost:3000',
        generatedScripts: applicationScripts,
        summary: {
          totalFlows: applicationScripts.length,
          totalSteps: applicationScripts.reduce(
            (sum, script) => sum + script.steps.length,
            0,
          ),
          processingTime,
        },
        filePaths,
      };
    } catch (error) {
      this.logger.error(`❌ Application feature demo failed: ${error.message}`);
      throw new Error(`Application feature demo failed: ${error.message}`);
    }
  }

  private async navigateAndLogin(
    page: puppeteer.Page,
    websiteUrl: string,
    credentials: any,
  ): Promise<void> {
    this.logger.log(`🌐 Navigating to: ${websiteUrl}`);

    await page.goto(websiteUrl, { waitUntil: 'networkidle2' });

    // Wait for page to load
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Try to find login form elements
    const loginSelectors = [
      'input[type="email"]',
      'input[name="email"]',
      'input[name="username"]',
      'input[type="text"]',
      'input[placeholder*="email" i]',
      'input[placeholder*="username" i]',
    ];

    const passwordSelectors = [
      'input[type="password"]',
      'input[name="password"]',
    ];

    // Find username/email input
    let usernameInput = null;
    for (const selector of loginSelectors) {
      try {
        usernameInput = await page.$(selector);
        if (usernameInput) break;
      } catch (e) {
        continue;
      }
    }

    // Find password input
    let passwordInput = null;
    for (const selector of passwordSelectors) {
      try {
        passwordInput = await page.$(selector);
        if (passwordInput) break;
      } catch (e) {
        continue;
      }
    }

    if (usernameInput && passwordInput) {
      this.logger.log('🔐 Found login form, attempting to login...');

      // Clear and fill username
      await usernameInput.click({ clickCount: 3 });
      await usernameInput.type(credentials.username || credentials.email);

      // Clear and fill password
      await passwordInput.click({ clickCount: 3 });
      await passwordInput.type(credentials.password);

      // Find and click submit button
      const submitSelectors = [
        'button[type="submit"]',
        'input[type="submit"]',
        'button:contains("Login")',
        'button:contains("Sign In")',
        'button:contains("Log In")',
      ];

      for (const selector of submitSelectors) {
        try {
          const submitButton = await page.$(selector);
          if (submitButton) {
            await submitButton.click();
            break;
          }
        } catch (e) {
          continue;
        }
      }

      // Wait for login to complete and handle potential navigation
      this.logger.log('⏳ Waiting for login to complete...');
      try {
        // Wait for navigation or timeout
        await Promise.race([
          page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }),
          new Promise((resolve) => setTimeout(resolve, 5000)),
        ]);
        this.logger.log('✅ Login completed, page may have navigated');
      } catch (error) {
        this.logger.log('⚠️ No navigation detected after login, continuing...');
      }
    } else {
      this.logger.log(
        '⚠️ No login form found, proceeding without authentication',
      );
    }
  }

  private async exploreUI(page: puppeteer.Page): Promise<any[]> {
    this.logger.log('🔍 Exploring UI elements...');

    // Wait a bit for dynamic content to load
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Check if page is still valid
    try {
      await page.evaluate(() => document.title);
    } catch (error) {
      throw new Error(
        'Page context is no longer valid - likely due to navigation',
      );
    }

    const uiElements = await page.evaluate(() => {
      // Helper function to generate CSS selectors
      function generateSelector(element) {
        if (element.id) {
          return `#${element.id}`;
        }

        if (element.className) {
          const classes = element.className
            .split(' ')
            .filter((c) => c.length > 0);
          if (classes.length > 0) {
            return `.${classes[0]}`;
          }
        }

        // Fallback to tag name with attributes
        const tagName = element.tagName.toLowerCase();
        const attributes = Array.from(element.attributes);

        for (const attr of attributes) {
          if (
            (attr as any).name === 'data-testid' ||
            (attr as any).name === 'name' ||
            (attr as any).name === 'type'
          ) {
            return `${tagName}[${(attr as any).name}="${(attr as any).value}"]`;
          }
        }

        return tagName;
      }

      const elements = [];

      // Get all interactive elements with more comprehensive selectors
      const interactiveSelectors = [
        'button',
        'a',
        'input',
        'select',
        'textarea',
        '[role="button"]',
        '[role="link"]',
        '[role="tab"]',
        '[role="menuitem"]',
        '[onclick]',
        '[data-testid]',
        '[data-test]',
        '[data-cy]',
        '[data-qa]',
        '.btn',
        '.button',
        '.link',
        '.nav-link',
        '.menu-item',
        '.tab',
        '.card',
        '.tile',
        '.item',
        '[class*="btn"]',
        '[class*="button"]',
        '[class*="link"]',
        '[class*="nav"]',
        '[class*="menu"]',
        '[class*="tab"]',
        '[class*="card"]',
        '[class*="tile"]',
        '[class*="item"]',
      ];

      interactiveSelectors.forEach((selector) => {
        const nodes = document.querySelectorAll(selector);
        nodes.forEach((node: Element) => {
          const rect = node.getBoundingClientRect();
          if (
            rect.width > 0 &&
            rect.height > 0 &&
            rect.top >= 0 &&
            rect.left >= 0
          ) {
            // Only visible elements that are in viewport
            const text = node.textContent?.trim();
            const isVisible =
              window.getComputedStyle(node).visibility !== 'hidden' &&
              window.getComputedStyle(node).display !== 'none';

            if (isVisible && text && text.length > 0) {
              elements.push({
                tagName: node.tagName.toLowerCase(),
                id: node.id,
                className: node.className,
                text: text.substring(0, 100),
                selector: generateSelector(node),
                rect: {
                  x: rect.x,
                  y: rect.y,
                  width: rect.width,
                  height: rect.height,
                },
                attributes: Array.from(node.attributes).reduce((acc, attr) => {
                  acc[attr.name] = attr.value;
                  return acc;
                }, {}),
                // Add more metadata for better analysis
                isClickable:
                  node.tagName === 'BUTTON' ||
                  node.tagName === 'A' ||
                  node.getAttribute('onclick') ||
                  node.getAttribute('role') === 'button',
                hasText: text.length > 0,
                textLength: text.length,
              });
            }
          }
        });
      });

      // Also capture form elements specifically
      const formElements = document.querySelectorAll(
        'form input, form select, form textarea, form button',
      );
      formElements.forEach((node: Element) => {
        const rect = node.getBoundingClientRect();
        if (
          rect.width > 0 &&
          rect.height > 0 &&
          rect.top >= 0 &&
          rect.left >= 0
        ) {
          const text =
            node.textContent?.trim() || node.getAttribute('placeholder') || '';
          const isVisible =
            window.getComputedStyle(node).visibility !== 'hidden' &&
            window.getComputedStyle(node).display !== 'none';

          if (isVisible) {
            elements.push({
              tagName: node.tagName.toLowerCase(),
              id: node.id,
              className: node.className,
              text: text.substring(0, 100),
              selector: generateSelector(node),
              rect: {
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height,
              },
              attributes: Array.from(node.attributes).reduce((acc, attr) => {
                acc[attr.name] = attr.value;
                return acc;
              }, {}),
              isClickable: true,
              hasText: text.length > 0,
              textLength: text.length,
              isFormElement: true,
            });
          }
        }
      });

      return elements;
    });

    // Remove duplicates based on selector
    const uniqueElements = uiElements.filter(
      (element, index, self) =>
        index === self.findIndex((e) => e.selector === element.selector),
    );

    this.logger.log(
      `📊 Found ${uniqueElements.length} unique interactive elements`,
    );
    this.logger.log(
      `📊 Elements breakdown: ${uniqueElements.filter((e) => e.tagName === 'button').length} buttons, ${uniqueElements.filter((e) => e.tagName === 'a').length} links, ${uniqueElements.filter((e) => e.tagName === 'input').length} inputs`,
    );

    return uniqueElements;
  }

  private async generateWISScripts(
    uiElements: any[],
    websiteUrl: string,
  ): Promise<WebInteractionScriptDto[]> {
    this.logger.log('🤖 Generating WIS scripts using AI...');
    this.logger.log(`📊 Found ${uiElements.length} UI elements to analyze`);

    try {
      // Create a specialized prompt for WIS generation focused on application features
      const prompt = `
You are an expert UI automation analyst for a feature extraction application. Analyze the following UI elements and generate Web Interaction Scripts (WIS) that demonstrate the core application features.

Website: ${websiteUrl}
UI Elements: ${JSON.stringify(uiElements.slice(0, 50), null, 2)}

This application has the following core features:
1. Document Upload & Processing (PDF, Word, HTML, Markdown, Text)
2. Web Crawling & Content Extraction
3. Feature Extraction using AI/LLM
4. Performance Monitoring
5. Demo Automation

Instructions:
1. Identify UI elements that relate to these core features
2. Create WIS scripts that demonstrate each feature workflow
3. Focus on realistic user journeys through the application
4. Include file upload, form submissions, and result viewing flows

Create 4-6 different user flows as WIS JSON objects:

1. Document Upload Flow - Upload and process documents
2. Web Crawling Flow - Extract content from websites
3. Feature Extraction Flow - Use AI to extract features from content
4. Performance Monitoring Flow - View metrics and analytics
5. Demo Automation Flow - Create automated demos
6. Results Review Flow - View and analyze extracted features

For each flow, provide:
1. A descriptive name
2. A brief description
3. A category (e.g., "Document Processing", "Web Crawling", "AI Extraction", "Analytics", "Automation")
4. A sequence of steps with selectors, actions, and tooltips

Return the response as a JSON array of WIS objects in this exact format:
[
  {
    "name": "Document Upload & Processing",
    "description": "Upload documents and process them for feature extraction",
    "category": "Document Processing",
    "steps": [
      {
        "selector": "input[type='file']",
        "action": "click",
        "tooltip": {
          "text": "Click to select documents for upload",
          "position": "bottom"
        }
      },
      {
        "selector": "button[type='submit']",
        "action": "click",
        "tooltip": {
          "text": "Submit documents for processing",
          "position": "top"
        }
      }
    ]
  }
]

Only return valid JSON. Do not include any other text.
      `;

      // Use the LLM service with a custom prompt for WIS generation
      const response = await this.llmService.generateWISFromUIElements(
        prompt,
        uiElements,
      );

      this.logger.log(`✅ Generated ${response.length} WIS scripts using AI`);
      return response;
    } catch (error) {
      this.logger.error(
        `❌ Failed to generate WIS scripts with AI: ${error.message}`,
      );
      this.logger.log('🔄 Falling back to rule-based script generation...');

      // Return fallback scripts if AI generation fails
      return this.generateApplicationFeatureScripts(uiElements);
    }
  }

  private generateWISFromProducts(
    products: any[],
    uiElements: any[],
  ): WebInteractionScriptDto[] {
    this.logger.log('🤖 Generating WIS scripts from extracted products...');

    const scripts: WebInteractionScriptDto[] = [];

    // Create a basic navigation flow based on available UI elements
    const buttons = uiElements.filter(
      (el) => el.tagName === 'button' || el.className.includes('btn'),
    );
    const links = uiElements.filter((el) => el.tagName === 'a');
    const inputs = uiElements.filter((el) => el.tagName === 'input');

    // Navigation flow
    if (links.length > 0) {
      scripts.push({
        name: 'Application Navigation',
        description: 'Navigate through the main sections of the application',
        category: 'Navigation',
        steps: links.slice(0, 3).map((link, index) => ({
          selector: link.selector,
          action: 'click',
          tooltip: {
            text: `Click to navigate to ${link.text || 'next section'}`,
            position: 'bottom' as const,
          },
        })),
      });
    }

    // Form interaction flow
    if (inputs.length > 0) {
      scripts.push({
        name: 'Data Entry Flow',
        description: 'Interact with form elements and input fields',
        category: 'Data Entry',
        steps: inputs.slice(0, 2).map((input, index) => ({
          selector: input.selector,
          action: 'type',
          value: 'Sample data',
          tooltip: {
            text: `Enter information in this field`,
            position: 'right' as const,
          },
        })),
      });
    }

    // Button interaction flow
    if (buttons.length > 0) {
      scripts.push({
        name: 'Action Flow',
        description: 'Interact with buttons and action elements',
        category: 'Actions',
        steps: buttons.slice(0, 2).map((button, index) => ({
          selector: button.selector,
          action: 'click',
          tooltip: {
            text: `Click this button to ${button.text || 'perform action'}`,
            position: 'top' as const,
          },
        })),
      });
    }

    return scripts;
  }

  private parseWISResponse(response: string): WebInteractionScriptDto[] {
    try {
      // Try to extract JSON from the response
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }

      // If no JSON array found, try to parse as single object
      const singleObjectMatch = response.match(/\{[\s\S]*\}/);
      if (singleObjectMatch) {
        return [JSON.parse(singleObjectMatch[0])];
      }

      throw new Error('No valid JSON found in response');
    } catch (error) {
      this.logger.warn(`⚠️ Failed to parse AI response: ${error.message}`);
      return [];
    }
  }

  private generateApplicationFeatureScripts(
    uiElements: any[],
  ): WebInteractionScriptDto[] {
    this.logger.log('🔄 Generating application feature WIS scripts...');
    this.logger.log(
      `📊 Processing ${uiElements.length} UI elements for feature scripts`,
    );

    // Group elements by type and create application-specific flows
    const fileInputs = uiElements.filter(
      (el) => el.tagName === 'input' && el.attributes?.type === 'file',
    );
    const textInputs = uiElements.filter(
      (el) => el.tagName === 'input' && el.attributes?.type === 'text',
    );
    const urlInputs = uiElements.filter(
      (el) => el.tagName === 'input' && el.attributes?.type === 'url',
    );
    const buttons = uiElements.filter(
      (el) => el.tagName === 'button' || el.className.includes('btn'),
    );
    const links = uiElements.filter((el) => el.tagName === 'a');
    const forms = uiElements.filter((el) => el.tagName === 'form');

    this.logger.log(
      `📊 Found: ${fileInputs.length} file inputs, ${textInputs.length} text inputs, ${urlInputs.length} URL inputs, ${buttons.length} buttons, ${links.length} links, ${forms.length} forms`,
    );

    const scripts: WebInteractionScriptDto[] = [];

    // 1. Document Upload & Processing Flow
    if (fileInputs.length > 0) {
      scripts.push({
        name: 'Document Upload & Processing',
        description:
          'Upload documents (PDF, Word, HTML, etc.) for feature extraction',
        category: 'Document Processing',
        steps: [
          {
            selector: fileInputs[0].selector,
            action: 'click',
            tooltip: {
              text: 'Click to select documents for upload (PDF, Word, HTML, Markdown, Text)',
              position: 'bottom' as const,
            },
          },
          ...(buttons.length > 0
            ? [
                {
                  selector: buttons[0].selector,
                  action: 'click' as const,
                  tooltip: {
                    text: 'Submit documents for processing',
                    position: 'top' as const,
                  },
                },
              ]
            : []),
        ],
      });
    }

    // 2. Web Crawling Flow
    if (
      urlInputs.length > 0 ||
      textInputs.some((input) =>
        input.attributes?.placeholder?.toLowerCase().includes('url'),
      )
    ) {
      const urlInput =
        urlInputs[0] ||
        textInputs.find((input) =>
          input.attributes?.placeholder?.toLowerCase().includes('url'),
        );

      scripts.push({
        name: 'Web Crawling & Content Extraction',
        description: 'Extract content from websites for feature analysis',
        category: 'Web Crawling',
        steps: [
          {
            selector: urlInput.selector,
            action: 'type',
            value: 'https://example.com',
            tooltip: {
              text: 'Enter website URL to crawl and extract content',
              position: 'right' as const,
            },
          },
          ...(buttons.length > 0
            ? [
                {
                  selector: buttons[0].selector,
                  action: 'click' as const,
                  tooltip: {
                    text: 'Start web crawling process',
                    position: 'top' as const,
                  },
                },
              ]
            : []),
        ],
      });
    }

    // 3. Feature Extraction Flow
    if (textInputs.length > 0) {
      scripts.push({
        name: 'AI Feature Extraction',
        description: 'Use AI/LLM to extract features from content',
        category: 'AI Extraction',
        steps: [
          {
            selector: textInputs[0].selector,
            action: 'type',
            value: 'Sample content for feature extraction',
            tooltip: {
              text: 'Enter or paste content for AI feature extraction',
              position: 'right' as const,
            },
          },
          ...(buttons.length > 0
            ? [
                {
                  selector: buttons[0].selector,
                  action: 'click' as const,
                  tooltip: {
                    text: 'Start AI feature extraction process',
                    position: 'top' as const,
                  },
                },
              ]
            : []),
        ],
      });
    }

    // 4. Performance Monitoring Flow
    if (
      links.some(
        (link) =>
          link.text?.toLowerCase().includes('performance') ||
          link.text?.toLowerCase().includes('metrics'),
      )
    ) {
      const performanceLink = links.find(
        (link) =>
          link.text?.toLowerCase().includes('performance') ||
          link.text?.toLowerCase().includes('metrics'),
      );

      scripts.push({
        name: 'Performance Monitoring',
        description: 'View performance metrics and analytics',
        category: 'Analytics',
        steps: [
          {
            selector: performanceLink.selector,
            action: 'click',
            tooltip: {
              text: 'View performance metrics and analytics',
              position: 'bottom' as const,
            },
          },
        ],
      });
    }

    // 5. Demo Automation Flow
    if (
      links.some(
        (link) =>
          link.text?.toLowerCase().includes('demo') ||
          link.text?.toLowerCase().includes('automation'),
      )
    ) {
      const demoLink = links.find(
        (link) =>
          link.text?.toLowerCase().includes('demo') ||
          link.text?.toLowerCase().includes('automation'),
      );

      scripts.push({
        name: 'Demo Automation',
        description: 'Create automated demos and WIS scripts',
        category: 'Automation',
        steps: [
          {
            selector: demoLink.selector,
            action: 'click',
            tooltip: {
              text: 'Access demo automation features',
              position: 'bottom' as const,
            },
          },
        ],
      });
    }

    // 6. Results Review Flow
    if (
      links.some(
        (link) =>
          link.text?.toLowerCase().includes('results') ||
          link.text?.toLowerCase().includes('features'),
      )
    ) {
      const resultsLink = links.find(
        (link) =>
          link.text?.toLowerCase().includes('results') ||
          link.text?.toLowerCase().includes('features'),
      );

      scripts.push({
        name: 'Results Review & Analysis',
        description: 'View and analyze extracted features and results',
        category: 'Analytics',
        steps: [
          {
            selector: resultsLink.selector,
            action: 'click',
            tooltip: {
              text: 'View extracted features and analysis results',
              position: 'bottom' as const,
            },
          },
        ],
      });
    }

    // Fallback: Create basic interaction flows if no specific features found
    if (scripts.length === 0) {
      // Basic navigation flow
      if (links.length > 0) {
        scripts.push({
          name: 'Application Navigation',
          description: 'Navigate through the main sections of the application',
          category: 'Navigation',
          steps: links.slice(0, 3).map((link, index) => ({
            selector: link.selector,
            action: 'click',
            tooltip: {
              text: `Click to navigate to ${link.text || 'next section'}`,
              position: 'bottom' as const,
            },
          })),
        });
      }

      // Basic form interaction flow
      if (textInputs.length > 0) {
        scripts.push({
          name: 'Form Interaction',
          description: 'Interact with form elements on the page',
          category: 'Data Entry',
          steps: textInputs.slice(0, 2).map((input, index) => ({
            selector: input.selector,
            action: 'type',
            value: 'Sample text',
            tooltip: {
              text: `Enter information in this field`,
              position: 'right' as const,
            },
          })),
        });
      }

      // Basic button interaction flow
      if (buttons.length > 0) {
        scripts.push({
          name: 'Button Actions',
          description: 'Interact with buttons and action elements',
          category: 'Actions',
          steps: buttons.slice(0, 2).map((button, index) => ({
            selector: button.selector,
            action: 'click',
            tooltip: {
              text: `Click this button to ${button.text || 'perform action'}`,
              position: 'top' as const,
            },
          })),
        });
      }
    }

    this.logger.log(
      `✅ Generated ${scripts.length} application feature WIS scripts`,
    );
    return scripts;
  }

  private generateFallbackScripts(
    uiElements: any[],
  ): WebInteractionScriptDto[] {
    this.logger.log('🔄 Generating fallback WIS scripts...');
    this.logger.log(
      `📊 Processing ${uiElements.length} UI elements for fallback scripts`,
    );

    // Group elements by type and create basic flows
    const buttons = uiElements.filter(
      (el) => el.tagName === 'button' || el.className.includes('btn'),
    );
    const inputs = uiElements.filter((el) => el.tagName === 'input');
    const links = uiElements.filter((el) => el.tagName === 'a');
    const clickableElements = uiElements.filter(
      (el) =>
        el.tagName === 'button' ||
        el.tagName === 'a' ||
        el.className.includes('btn') ||
        el.className.includes('link'),
    );

    this.logger.log(
      `📊 Found: ${buttons.length} buttons, ${inputs.length} inputs, ${links.length} links, ${clickableElements.length} clickable elements`,
    );

    const scripts: WebInteractionScriptDto[] = [];

    // Create a basic navigation flow
    if (links.length > 0) {
      scripts.push({
        name: 'Basic Navigation',
        description: 'Navigate through the main sections of the application',
        category: 'Navigation',
        steps: links.slice(0, 3).map((link, index) => ({
          selector: link.selector,
          action: 'click',
          tooltip: {
            text: `Click to navigate to ${link.text || 'next section'}`,
            position: 'bottom' as const,
          },
        })),
      });
    }

    // Create a basic form interaction flow
    if (inputs.length > 0) {
      scripts.push({
        name: 'Form Interaction',
        description: 'Interact with form elements on the page',
        category: 'Data Entry',
        steps: inputs.slice(0, 2).map((input, index) => ({
          selector: input.selector,
          action: 'type',
          value: 'Sample text',
          tooltip: {
            text: `Enter information in this field`,
            position: 'right' as const,
          },
        })),
      });
    }

    // Create a basic button interaction flow
    if (buttons.length > 0) {
      scripts.push({
        name: 'Button Actions',
        description: 'Interact with buttons and action elements',
        category: 'Actions',
        steps: buttons.slice(0, 2).map((button, index) => ({
          selector: button.selector,
          action: 'click',
          tooltip: {
            text: `Click this button to ${button.text || 'perform action'}`,
            position: 'top' as const,
          },
        })),
      });
    }

    // Create a general clickable elements flow if we have any clickable elements
    if (clickableElements.length > 0 && scripts.length === 0) {
      scripts.push({
        name: 'General Interaction',
        description: 'Interact with clickable elements on the page',
        category: 'General',
        steps: clickableElements.slice(0, 3).map((element, index) => ({
          selector: element.selector,
          action: 'click',
          tooltip: {
            text: `Click this element: ${element.text || element.tagName}`,
            position: 'bottom' as const,
          },
        })),
      });
    }

    // If we still have no scripts, create a minimal one with the first few elements
    if (scripts.length === 0 && uiElements.length > 0) {
      scripts.push({
        name: 'Basic UI Interaction',
        description: 'Basic interaction with available UI elements',
        category: 'General',
        steps: uiElements.slice(0, 2).map((element, index) => ({
          selector: element.selector,
          action: element.tagName === 'input' ? 'type' : 'click',
          value: element.tagName === 'input' ? 'Sample text' : undefined,
          tooltip: {
            text: `Interact with this ${element.tagName} element`,
            position: 'bottom' as const,
          },
        })),
      });
    }

    this.logger.log(`✅ Generated ${scripts.length} fallback WIS scripts`);
    return scripts;
  }

  private async saveWISScripts(
    demoId: string,
    scripts: WebInteractionScriptDto[],
    request: CreateDemoRequestDto,
  ): Promise<{
    demoFolder: string;
    wisFiles: string[];
    metadataFile: string;
  }> {
    this.logger.log(`💾 Saving WIS scripts to disk for demo: ${demoId}`);

    try {
      // Create demo-specific folder in logs directory
      const demoFolder = path.join(process.cwd(), 'logs', 'demo', demoId);
      await fs.promises.mkdir(demoFolder, { recursive: true });

      const wisFiles: string[] = [];

      // Save each WIS script as a separate JSON file
      for (let i = 0; i < scripts.length; i++) {
        const script = scripts[i];
        const fileName = `${i + 1}-${this.sanitizeFileName(script.name)}.json`;
        const filePath = path.join(demoFolder, fileName);

        await fs.promises.writeFile(
          filePath,
          JSON.stringify(script, null, 2),
          'utf8',
        );

        wisFiles.push(filePath);
        this.logger.log(`📄 Saved WIS script: ${fileName}`);
      }

      // Create metadata file
      const metadata = {
        demoId,
        demoName:
          request.demoName ||
          `Demo for ${new URL(request.websiteUrl).hostname}`,
        websiteUrl: request.websiteUrl,
        createdAt: new Date().toISOString(),
        totalScripts: scripts.length,
        totalSteps: scripts.reduce(
          (sum, script) => sum + script.steps.length,
          0,
        ),
        scripts: scripts.map((script, index) => ({
          index: index + 1,
          name: script.name,
          category: script.category,
          steps: script.steps.length,
          fileName: `${index + 1}-${this.sanitizeFileName(script.name)}.json`,
        })),
      };

      const metadataPath = path.join(demoFolder, 'metadata.json');
      await fs.promises.writeFile(
        metadataPath,
        JSON.stringify(metadata, null, 2),
        'utf8',
      );

      this.logger.log(`📋 Saved metadata: ${metadataPath}`);

      return {
        demoFolder,
        wisFiles,
        metadataFile: metadataPath,
      };
    } catch (error) {
      this.logger.error(`❌ Failed to save WIS scripts: ${error.message}`);
      throw new Error(`Failed to save WIS scripts: ${error.message}`);
    }
  }

  private generateApplicationFeatureWIS(): WebInteractionScriptDto[] {
    this.logger.log('🎯 Generating WIS scripts for application features...');

    const scripts: WebInteractionScriptDto[] = [
      {
        name: 'Document Upload & Processing',
        description:
          'Upload and process various document types (PDF, Word, HTML, Markdown, Text) for feature extraction',
        category: 'Document Processing',
        steps: [
          {
            selector: 'input[type="file"]',
            action: 'click',
            tooltip: {
              text: 'Click to select documents for upload (supports PDF, Word, HTML, Markdown, Text)',
              position: 'bottom' as const,
            },
          },
          {
            selector: 'input[type="file"]',
            action: 'type',
            value: 'C:\\path\\to\\document.pdf',
            tooltip: {
              text: 'Select multiple documents for batch processing',
              position: 'right' as const,
            },
          },
          {
            selector: 'button[type="submit"]',
            action: 'click',
            tooltip: {
              text: 'Submit documents for processing and feature extraction',
              position: 'top' as const,
            },
          },
          {
            selector: '.processing-status',
            action: 'hover',
            tooltip: {
              text: 'Monitor document processing status',
              position: 'bottom' as const,
            },
          },
        ],
      },
      {
        name: 'Web Crawling & Content Extraction',
        description: 'Extract content from websites and analyze for features',
        category: 'Web Crawling',
        steps: [
          {
            selector: 'input[name="url"]',
            action: 'click',
            tooltip: {
              text: 'Enter website URL to crawl and extract content',
              position: 'right' as const,
            },
          },
          {
            selector: 'input[name="url"]',
            action: 'type',
            value: 'https://example.com',
            tooltip: {
              text: 'Enter the target website URL for content extraction',
              position: 'right' as const,
            },
          },
          {
            selector: 'button[type="submit"]',
            action: 'click',
            tooltip: {
              text: 'Start web crawling process',
              position: 'top' as const,
            },
          },
          {
            selector: '.crawl-progress',
            action: 'hover',
            tooltip: {
              text: 'Monitor crawling progress and extracted pages',
              position: 'bottom' as const,
            },
          },
        ],
      },
      {
        name: 'AI Feature Extraction',
        description: 'Use AI/LLM to extract features and products from content',
        category: 'AI Extraction',
        steps: [
          {
            selector: 'textarea[name="content"]',
            action: 'click',
            tooltip: {
              text: 'Enter or paste content for AI feature extraction',
              position: 'right' as const,
            },
          },
          {
            selector: 'textarea[name="content"]',
            action: 'type',
            value: 'Sample content with product descriptions and features...',
            tooltip: {
              text: 'Paste content containing product information for AI analysis',
              position: 'right' as const,
            },
          },
          {
            selector: 'button[type="submit"]',
            action: 'click',
            tooltip: {
              text: 'Start AI feature extraction process',
              position: 'top' as const,
            },
          },
          {
            selector: '.extraction-results',
            action: 'hover',
            tooltip: {
              text: 'View extracted features and products',
              position: 'bottom' as const,
            },
          },
        ],
      },
      {
        name: 'Performance Monitoring',
        description:
          'View performance metrics and analytics for all operations',
        category: 'Analytics',
        steps: [
          {
            selector: 'a[href*="performance"]',
            action: 'click',
            tooltip: {
              text: 'Navigate to performance monitoring dashboard',
              position: 'bottom' as const,
            },
          },
          {
            selector: '.metrics-summary',
            action: 'hover',
            tooltip: {
              text: 'View overall performance metrics',
              position: 'bottom' as const,
            },
          },
          {
            selector: '.operation-stats',
            action: 'click',
            tooltip: {
              text: 'View detailed operation statistics',
              position: 'top' as const,
            },
          },
          {
            selector: '.success-rate',
            action: 'hover',
            tooltip: {
              text: 'Monitor success rates for different operations',
              position: 'right' as const,
            },
          },
        ],
      },
      {
        name: 'Demo Automation',
        description: 'Create automated demos and WIS scripts for applications',
        category: 'Automation',
        steps: [
          {
            selector: 'a[href*="demo"]',
            action: 'click',
            tooltip: {
              text: 'Access demo automation features',
              position: 'bottom' as const,
            },
          },
          {
            selector: 'input[name="websiteUrl"]',
            action: 'click',
            tooltip: {
              text: 'Enter target website URL for demo automation',
              position: 'right' as const,
            },
          },
          {
            selector: 'input[name="websiteUrl"]',
            action: 'type',
            value: 'https://target-website.com',
            tooltip: {
              text: 'Enter the website URL to create demos for',
              position: 'right' as const,
            },
          },
          {
            selector: 'button[type="submit"]',
            action: 'click',
            tooltip: {
              text: 'Generate WIS scripts for the target website',
              position: 'top' as const,
            },
          },
        ],
      },
      {
        name: 'Results Review & Analysis',
        description: 'View and analyze extracted features and results',
        category: 'Analytics',
        steps: [
          {
            selector: '.results-section',
            action: 'click',
            tooltip: {
              text: 'View extracted features and analysis results',
              position: 'bottom' as const,
            },
          },
          {
            selector: '.feature-list',
            action: 'hover',
            tooltip: {
              text: 'Browse through extracted features and products',
              position: 'right' as const,
            },
          },
          {
            selector: '.feature-details',
            action: 'click',
            tooltip: {
              text: 'View detailed information about a specific feature',
              position: 'top' as const,
            },
          },
          {
            selector: '.export-button',
            action: 'click',
            tooltip: {
              text: 'Export results to various formats',
              position: 'bottom' as const,
            },
          },
        ],
      },
    ];

    this.logger.log(
      `✅ Generated ${scripts.length} application feature WIS scripts`,
    );
    return scripts;
  }

  private sanitizeFileName(fileName: string): string {
    return fileName
      .replace(/[^a-zA-Z0-9\s-]/g, '') // Remove special characters
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .toLowerCase()
      .substring(0, 50); // Limit length
  }
}
