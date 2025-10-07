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
      // Create a specialized prompt for WIS generation
      const prompt = `
You are an expert UI automation analyst. Analyze the following UI elements from a web application and generate Web Interaction Scripts (WIS) that represent common user flows.

Website: ${websiteUrl}
UI Elements: ${JSON.stringify(uiElements.slice(0, 50), null, 2)} // Limit to first 50 elements for performance

Instructions:
1. Identify logical user flows based on the available UI elements
2. Group related elements into meaningful workflows
3. Create 2-4 different user flows as WIS JSON objects
4. Each flow should represent a logical sequence of user actions

Common flows to consider:
- Navigation flows (clicking links, buttons)
- Form interactions (filling inputs, submitting)
- Action flows (clicking buttons, toggles)
- Data entry flows (typing in inputs, selecting options)

For each flow, provide:
1. A descriptive name
2. A brief description
3. A category (e.g., "Navigation", "Data Entry", "Actions", "Forms")
4. A sequence of steps with selectors, actions, and tooltips

Return the response as a JSON array of WIS objects in this exact format:
[
  {
    "name": "Flow Name",
    "description": "Flow description",
    "category": "Category",
    "steps": [
      {
        "selector": "element selector",
        "action": "click|type|hover",
        "value": "value if action is type",
        "tooltip": {
          "text": "Tooltip text",
          "position": "top|bottom|left|right"
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
      return this.generateFallbackScripts(uiElements);
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

  private sanitizeFileName(fileName: string): string {
    return fileName
      .replace(/[^a-zA-Z0-9\s-]/g, '') // Remove special characters
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .toLowerCase()
      .substring(0, 50); // Limit length
  }
}
