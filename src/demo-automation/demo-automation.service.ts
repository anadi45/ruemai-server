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

  async createAutomatedApplicationDemo(
    targetUrl: string = 'http://localhost:3001',
    credentials: { username: string; password: string } = {
      username: 'demo@example.com',
      password: 'demo123',
    },
  ): Promise<CreateDemoResponseDto> {
    const startTime = Date.now();
    const demoId = uuidv4();

    this.logger.log(`🚀 Starting automated application demo with Puppeteer`);
    this.logger.log(`🎯 Target URL: ${targetUrl}`);

    try {
      // Step 1: Launch browser and navigate to target application
      const browser = await puppeteer.launch({
        headless: false, // Set to true for production
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });

      const page = await browser.newPage();
      await page.setViewport({ width: 1920, height: 1080 });

      // Step 2: Navigate to target application and login
      await this.navigateAndLoginToTargetApp(page, targetUrl, credentials);

      // Step 3: Wait for page to stabilize after login
      this.logger.log('⏳ Waiting for page to stabilize after login...');
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Step 4: Extract features using LLM
      this.logger.log('🧠 Extracting features using LLM...');

      // First, let's debug what's on the page
      const pageInfo = await page.evaluate(() => {
        return {
          title: document.title,
          url: window.location.href,
          bodyText: document.body.innerText.substring(0, 500),
          totalElements: document.querySelectorAll('*').length,
          buttons: document.querySelectorAll('button').length,
          links: document.querySelectorAll('a').length,
          inputs: document.querySelectorAll('input').length,
        };
      });

      this.logger.log(`📄 Page Info: ${JSON.stringify(pageInfo, null, 2)}`);

      const extractedFeatures = await this.extractFeaturesFromLocalApp(page);

      // Step 5: Explore the UI and capture elements
      this.logger.log('🔍 Exploring UI elements...');
      const uiElements = await this.exploreUI(page);

      // Step 6: Generate WIS scripts based on extracted features and UI elements
      this.logger.log('🤖 Generating WIS scripts for extracted features...');
      const generatedScripts = await this.generateWISFromFeatures(
        extractedFeatures,
        uiElements,
        targetUrl,
      );

      // Step 7: Clean up
      await browser.close();

      const processingTime = Date.now() - startTime;

      this.logger.log(
        `✅ Automated application demo completed in ${processingTime}ms`,
      );

      // Save WIS scripts to disk
      const filePaths = await this.saveWISScripts(demoId, generatedScripts, {
        websiteUrl: targetUrl,
        demoName: 'Automated Application Demo',
        credentials,
      });

      return {
        demoId,
        demoName: 'Automated Application Demo',
        websiteUrl: targetUrl,
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
      this.logger.error(
        `❌ Automated application demo failed: ${error.message}`,
      );
      throw new Error(`Automated application demo failed: ${error.message}`);
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
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Check if page is still valid
    try {
      const title = await page.evaluate(() => document.title);
      this.logger.log(`📄 Page title: ${title}`);
    } catch (error) {
      throw new Error(
        'Page context is no longer valid - likely due to navigation',
      );
    }

    // Take a screenshot for debugging
    try {
      await page.screenshot({
        path: 'logs/debug/ui-exploration.png',
        fullPage: true,
      });
      this.logger.log('📸 Screenshot saved to logs/debug/ui-exploration.png');
    } catch (error) {
      this.logger.warn('⚠️ Could not take screenshot:', error.message);
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

      // Debug: Log total elements found
      console.log('🔍 Starting element detection...');

      interactiveSelectors.forEach((selector) => {
        const nodes = document.querySelectorAll(selector);
        console.log(`🔍 Selector "${selector}" found ${nodes.length} elements`);

        nodes.forEach((node: Element) => {
          const rect = node.getBoundingClientRect();
          const text = node.textContent?.trim() || '';
          const isVisible =
            window.getComputedStyle(node).visibility !== 'hidden' &&
            window.getComputedStyle(node).display !== 'none';

          // More lenient visibility check - include elements that might be partially visible
          const isInViewport = rect.width > 0 && rect.height > 0;

          // Include elements even without text if they're interactive
          const isInteractive =
            node.tagName === 'BUTTON' ||
            node.tagName === 'A' ||
            node.getAttribute('onclick') ||
            node.getAttribute('role') === 'button' ||
            node.getAttribute('role') === 'link' ||
            node.getAttribute('role') === 'menuitem' ||
            node.getAttribute('role') === 'tab';

          if (isVisible && isInViewport && (text.length > 0 || isInteractive)) {
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
              isClickable: isInteractive,
              hasText: text.length > 0,
              textLength: text.length,
            });
          }
        });
      });

      console.log(`🔍 Total elements found: ${elements.length}`);

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

    // If we found very few elements, try a more aggressive approach
    if (uniqueElements.length < 5) {
      this.logger.log(
        '⚠️ Found very few elements, trying fallback detection...',
      );

      const fallbackElements = await page.evaluate(() => {
        const allElements = document.querySelectorAll('*');
        const elements = [];

        allElements.forEach((node: Element) => {
          const rect = node.getBoundingClientRect();
          const text = node.textContent?.trim() || '';
          const tagName = node.tagName.toLowerCase();

          // Look for any potentially interactive element
          const isInteractive =
            tagName === 'button' ||
            tagName === 'a' ||
            tagName === 'input' ||
            tagName === 'select' ||
            tagName === 'textarea' ||
            node.getAttribute('onclick') ||
            node.getAttribute('role') ||
            node.getAttribute('tabindex') ||
            text.length > 0;

          if (isInteractive && rect.width > 0 && rect.height > 0) {
            elements.push({
              tagName,
              id: node.id,
              className: node.className,
              text: text.substring(0, 100),
              selector: node.id ? `#${node.id}` : tagName,
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
            });
          }
        });

        return elements;
      });

      this.logger.log(
        `📊 Fallback detection found ${fallbackElements.length} elements`,
      );
      return fallbackElements;
    }

    return uniqueElements;
  }

  private async generateWISScripts(
    uiElements: any[],
    websiteUrl: string,
  ): Promise<WebInteractionScriptDto[]> {
    this.logger.log('🤖 Generating WIS scripts using AI...');
    this.logger.log(`📊 Found ${uiElements.length} UI elements to analyze`);

    try {
      // Create a specialized prompt for WIS generation based on actual website analysis
      const prompt = `
You are an expert UI automation analyst. Analyze the following UI elements from the actual website and generate Web Interaction Scripts (WIS) that demonstrate the REAL features of this application.

Website: ${websiteUrl}
UI Elements: ${JSON.stringify(uiElements.slice(0, 50), null, 2)}

Instructions:
1. Analyze the actual UI elements to understand what this application really does
2. Look for buttons, links, forms, and interactive elements that represent real features
3. Create WIS scripts that demonstrate the ACTUAL user workflows on this website
4. Focus on realistic user journeys based on what you can see in the UI elements
5. Do NOT assume generic features - only create scripts for features you can actually see in the UI

For each real feature you identify, provide:
1. A descriptive name based on the actual UI elements
2. A brief description of what the feature does
3. A category that makes sense for the feature
4. A sequence of steps with the actual selectors from the UI elements

Return the response as a JSON array of WIS objects in this exact format:
[
  {
    "name": "Feature Name Based on UI",
    "description": "What this feature actually does based on UI elements",
    "category": "Appropriate Category",
    "steps": [
      {
        "selector": "actual-selector-from-ui",
        "action": "click",
        "tooltip": {
          "text": "Description of what this step does",
          "position": "bottom"
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

    // Group elements by type and analyze their actual purpose
    const buttons = uiElements.filter(
      (el) => el.tagName === 'button' || el.className.includes('btn'),
    );
    const links = uiElements.filter((el) => el.tagName === 'a');
    const inputs = uiElements.filter((el) => el.tagName === 'input');
    const forms = uiElements.filter((el) => el.tagName === 'form');

    this.logger.log(
      `📊 Found: ${buttons.length} buttons, ${links.length} links, ${inputs.length} inputs, ${forms.length} forms`,
    );

    const scripts: WebInteractionScriptDto[] = [];

    // Analyze actual features based on UI element text and context
    const featureKeywords = {
      sales: ['sales', 'deals', 'revenue', 'pipeline', 'opportunities'],
      dashboard: ['dashboard', 'overview', 'home', 'main'],
      reports: ['reports', 'analytics', 'metrics', 'insights'],
      settings: ['settings', 'profile', 'account', 'preferences'],
      notifications: ['notifications', 'alerts', 'messages'],
      calendar: ['calendar', 'schedule', 'meetings', 'events'],
      team: ['team', 'collaboration', 'users', 'members'],
      workflow: ['workflow', 'process', 'automation', 'tasks'],
    };

    // Create scripts based on actual UI element analysis
    for (const [category, keywords] of Object.entries(featureKeywords)) {
      const relevantElements = uiElements.filter((el) => {
        const text = el.text?.toLowerCase() || '';
        return keywords.some((keyword) => text.includes(keyword));
      });

      if (relevantElements.length > 0) {
        const categoryName =
          category.charAt(0).toUpperCase() + category.slice(1);
        scripts.push({
          name: `${categoryName} Management`,
          description: `Manage ${category} related features in the application`,
          category: categoryName,
          steps: relevantElements.slice(0, 3).map((element) => ({
            selector: element.selector,
            action: element.tagName === 'input' ? 'type' : 'click',
            value: element.tagName === 'input' ? 'Sample data' : undefined,
            tooltip: {
              text: `Interact with ${category} feature: ${element.text || element.tagName}`,
              position: 'bottom' as const,
            },
          })),
        });
      }
    }

    // Create navigation flow based on actual links
    if (links.length > 0) {
      scripts.push({
        name: 'Application Navigation',
        description: 'Navigate through the main sections of the application',
        category: 'Navigation',
        steps: links.slice(0, 4).map((link) => ({
          selector: link.selector,
          action: 'click',
          tooltip: {
            text: `Navigate to ${link.text || 'next section'}`,
            position: 'bottom' as const,
          },
        })),
      });
    }

    // Create form interaction flow based on actual forms
    if (inputs.length > 0) {
      scripts.push({
        name: 'Data Entry & Forms',
        description: 'Interact with form elements and input fields',
        category: 'Data Entry',
        steps: inputs.slice(0, 3).map((input) => ({
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

    // Create action flow based on actual buttons
    if (buttons.length > 0) {
      scripts.push({
        name: 'Action Buttons',
        description: 'Interact with buttons and action elements',
        category: 'Actions',
        steps: buttons.slice(0, 3).map((button) => ({
          selector: button.selector,
          action: 'click',
          tooltip: {
            text: `Click to ${button.text || 'perform action'}`,
            position: 'top' as const,
          },
        })),
      });
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

    // This method should not be used for external websites like Rattle
    // It's only for internal application features
    this.logger.warn('⚠️ This method should not be used for external websites');

    return [];
  }

  private async navigateAndLoginToTargetApp(
    page: puppeteer.Page,
    targetUrl: string,
    credentials: { username: string; password: string },
  ): Promise<void> {
    this.logger.log(`🌐 Navigating to target application: ${targetUrl}`);

    await page.goto(targetUrl, { waitUntil: 'networkidle2' });

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
      await usernameInput.type(credentials.username);

      // Clear and fill password
      await passwordInput.click({ clickCount: 3 });
      await passwordInput.type(credentials.password);

      // Find and click submit button
      const submitSelectors = [
        'button[type="submit"]',
        'input[type="submit"]',
        'button:contains("Sign In")',
        'button:contains("Login")',
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

  private async extractFeaturesFromLocalApp(
    page: puppeteer.Page,
  ): Promise<any[]> {
    this.logger.log(
      '🧠 Extracting features from local application using LLM...',
    );

    try {
      // Get page content and structure
      const pageContent = await page.evaluate(() => {
        return {
          title: document.title,
          url: window.location.href,
          text: document.body.innerText,
          html: document.documentElement.outerHTML,
          links: Array.from(document.querySelectorAll('a')).map((a) => ({
            text: a.textContent?.trim(),
            href: a.href,
            selector:
              a.tagName.toLowerCase() +
              (a.id ? `#${a.id}` : '') +
              (a.className ? `.${a.className.split(' ').join('.')}` : ''),
          })),
          buttons: Array.from(document.querySelectorAll('button')).map((b) => ({
            text: b.textContent?.trim(),
            selector:
              b.tagName.toLowerCase() +
              (b.id ? `#${b.id}` : '') +
              (b.className ? `.${b.className.split(' ').join('.')}` : ''),
          })),
          forms: Array.from(document.querySelectorAll('form')).map((f) => ({
            action: f.action,
            method: f.method,
            inputs: Array.from(f.querySelectorAll('input')).map((i) => ({
              type: i.type,
              name: i.name,
              placeholder: i.placeholder,
              selector:
                i.tagName.toLowerCase() +
                (i.id ? `#${i.id}` : '') +
                (i.className ? `.${i.className.split(' ').join('.')}` : ''),
            })),
          })),
        };
      });

      // Use LLM to extract features from the page content
      const features = await this.llmService.extractProductsFromText(
        `Application: ${pageContent.title}
URL: ${pageContent.url}
Content: ${pageContent.text}
Links: ${JSON.stringify(pageContent.links)}
Buttons: ${JSON.stringify(pageContent.buttons)}
Forms: ${JSON.stringify(pageContent.forms)}`,
      );

      this.logger.log(
        `✅ Extracted ${features.products.length} features from local application`,
      );
      return features.products;
    } catch (error) {
      this.logger.error(`❌ Failed to extract features: ${error.message}`);
      return [];
    }
  }

  private async generateWISFromFeatures(
    features: any[],
    uiElements: any[],
    websiteUrl: string,
  ): Promise<WebInteractionScriptDto[]> {
    this.logger.log('🤖 Generating WIS scripts from extracted features...');

    const scripts: WebInteractionScriptDto[] = [];

    // Create WIS scripts for each extracted feature
    for (const feature of features) {
      const featureScript = await this.createWISForFeature(
        feature,
        uiElements,
        websiteUrl,
      );
      if (featureScript) {
        scripts.push(featureScript);
      }
    }

    // Create general navigation and interaction scripts
    const navigationScript = this.createNavigationWIS(uiElements, websiteUrl);
    if (navigationScript) {
      scripts.push(navigationScript);
    }

    this.logger.log(`✅ Generated ${scripts.length} WIS scripts from features`);
    return scripts;
  }

  private async createWISForFeature(
    feature: any,
    uiElements: any[],
    websiteUrl: string,
  ): Promise<WebInteractionScriptDto | null> {
    try {
      // Find UI elements that match the feature
      const relevantElements = uiElements.filter((element) => {
        const elementText = element.text?.toLowerCase() || '';
        const featureName = feature.name?.toLowerCase() || '';
        const featureDescription = feature.description?.toLowerCase() || '';

        return (
          elementText.includes(featureName) ||
          elementText.includes(featureDescription) ||
          featureName.includes(elementText) ||
          featureDescription.includes(elementText)
        );
      });

      if (relevantElements.length === 0) {
        return null;
      }

      // Create WIS script for this feature
      const steps = relevantElements.slice(0, 3).map((element, index) => ({
        selector: element.selector,
        action: element.tagName === 'input' ? 'type' : 'click',
        value: element.tagName === 'input' ? 'Sample data' : undefined,
        tooltip: {
          text: `Interact with ${feature.name}: ${element.text || element.tagName}`,
          position: 'bottom' as const,
        },
      }));

      return {
        name: `${feature.name} Feature Flow`,
        description: `Demonstrate the ${feature.name} feature: ${feature.description}`,
        category: feature.category || 'Feature',
        steps,
      };
    } catch (error) {
      this.logger.error(
        `❌ Failed to create WIS for feature ${feature.name}: ${error.message}`,
      );
      return null;
    }
  }

  private createNavigationWIS(
    uiElements: any[],
    websiteUrl: string,
  ): WebInteractionScriptDto | null {
    try {
      // Find navigation elements
      const navElements = uiElements.filter(
        (element) =>
          element.tagName === 'a' ||
          element.className?.includes('nav') ||
          element.text?.toLowerCase().includes('dashboard') ||
          element.text?.toLowerCase().includes('extraction') ||
          element.text?.toLowerCase().includes('demo') ||
          element.text?.toLowerCase().includes('profile'),
      );

      if (navElements.length === 0) {
        return null;
      }

      const steps = navElements.slice(0, 4).map((element, index) => ({
        selector: element.selector,
        action: 'click',
        tooltip: {
          text: `Navigate to ${element.text || 'next section'}`,
          position: 'bottom' as const,
        },
      }));

      return {
        name: 'Application Navigation Flow',
        description: 'Navigate through the main sections of the application',
        category: 'Navigation',
        steps,
      };
    } catch (error) {
      this.logger.error(`❌ Failed to create navigation WIS: ${error.message}`);
      return null;
    }
  }

  async debugUIElements(
    targetUrl: string,
    credentials: { username: string; password: string },
  ): Promise<any> {
    this.logger.log(`🔍 Debugging UI elements for: ${targetUrl}`);

    try {
      const browser = await puppeteer.launch({
        headless: false,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });

      const page = await browser.newPage();
      await page.setViewport({ width: 1920, height: 1080 });

      // Navigate and login
      await this.navigateAndLoginToTargetApp(page, targetUrl, credentials);

      // Wait for page to stabilize
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Get page info
      const pageInfo = await page.evaluate(() => {
        return {
          title: document.title,
          url: window.location.href,
          bodyText: document.body.innerText.substring(0, 1000),
          totalElements: document.querySelectorAll('*').length,
          buttons: document.querySelectorAll('button').length,
          links: document.querySelectorAll('a').length,
          inputs: document.querySelectorAll('input').length,
          divs: document.querySelectorAll('div').length,
          spans: document.querySelectorAll('span').length,
        };
      });

      // Take screenshot
      await page.screenshot({
        path: 'logs/debug/debug-ui.png',
        fullPage: true,
      });

      // Try UI exploration
      const uiElements = await this.exploreUI(page);

      await browser.close();

      return {
        pageInfo,
        uiElements,
        elementCount: uiElements.length,
        screenshot: 'logs/debug/debug-ui.png',
      };
    } catch (error) {
      this.logger.error(`❌ Debug failed: ${error.message}`);
      throw error;
    }
  }

  private sanitizeFileName(fileName: string): string {
    return fileName
      .replace(/[^a-zA-Z0-9\s-]/g, '') // Remove special characters
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .toLowerCase()
      .substring(0, 50); // Limit length
  }
}
