import { Injectable } from '@nestjs/common';
import puppeteer, { Browser, Page, ElementHandle } from 'puppeteer';
import { Action, DOMState, PuppeteerWorkerConfig } from '../types/demo-automation.types';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class PuppeteerWorkerService {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private config: PuppeteerWorkerConfig;
  private isInitializing: boolean = false;
  private operationLock: Promise<void> = Promise.resolve();

  constructor() {
    this.config = {
      headless: false,
      viewport: { width: 1366, height: 768 },
      timeout: 30000,
      waitForSelectorTimeout: 10000,
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };
  }

  async initialize(): Promise<void> {
    if (this.browser) {
      return;
    }

    if (this.isInitializing) {
      // Wait for the ongoing initialization to complete
      await this.operationLock;
      return;
    }

    this.isInitializing = true;
    this.operationLock = this.performInitialization();
    
    await this.operationLock;
    this.isInitializing = false;
  }

  isInitialized(): boolean {
    return this.browser !== null && this.page !== null;
  }

  private async performInitialization(): Promise<void> {
    this.browser = await puppeteer.launch({
      headless: this.config.headless,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-extensions',
        '--disable-plugins',
        '--disable-default-apps',
        '--disable-sync',
        '--disable-translate',
        '--hide-scrollbars',
        '--mute-audio',
        '--no-default-browser-check',
        '--no-pings',
        '--no-zygote',
        '--single-process'
      ]
    });

    this.page = await this.browser.newPage();
    
    // Enable JavaScript explicitly
    await this.page.setJavaScriptEnabled(true);
    
    // Set realistic user agent
    await this.page.setUserAgent({ userAgent: this.config.userAgent });
    
    // Set viewport
    await this.page.setViewport(this.config.viewport);
    
    // Disable web security for better compatibility
    await this.page.setBypassCSP(true);
    
    // Set extra headers to look more like a real browser
    await this.page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
      'Upgrade-Insecure-Requests': '1',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache'
    });

    // Set timeouts
    this.page.setDefaultTimeout(this.config.timeout);
    this.page.setDefaultNavigationTimeout(this.config.timeout);
  }

  async navigateToUrl(url: string): Promise<void> {
    if (!this.page) {
      throw new Error('Page not initialized. Call initialize() first.');
    }

    if (!url || url === 'undefined') {
      throw new Error(`Invalid URL provided: "${url}". URL cannot be undefined or empty.`);
    }

    // Validate and fix URL format
    let validUrl = url;
    
    // First, try to extract a clean URL if the input contains descriptive text
    const urlMatch = url.match(/https?:\/\/[^\s]+/);
    if (urlMatch) {
      validUrl = urlMatch[0].replace(/[.,;!?]+$/, '');
      console.log(`🔧 Extracted clean URL from text: "${url}" -> "${validUrl}"`);
    } else if (!url.startsWith('http://') && !url.startsWith('https://')) {
      // If it looks like a domain, add https://
      if (url.includes('.') && !url.includes(' ')) {
        validUrl = `https://${url}`;
        console.log(`🔧 Fixed URL format: ${url} -> ${validUrl}`);
      } else {
        throw new Error(`Invalid URL format: "${url}". URL must include protocol (http:// or https://) or be a valid domain.`);
      }
    }

    try {
      console.log(`🧭 Navigating to: ${validUrl}`);
      
      // Navigate with networkidle wait strategy
      await this.page.goto(validUrl, { 
        waitUntil: 'networkidle0',
        timeout: this.config.timeout 
      });

      // Verify navigation was successful
      const currentUrl = this.page.url();
      console.log(`✅ Navigation completed. Current URL: ${currentUrl}`);
      
      if (currentUrl === 'about:blank' || currentUrl === 'data:,' || !currentUrl.includes(url.split('/')[2])) {
        throw new Error(`Navigation failed - URL did not change to expected destination. Current: ${currentUrl}, Expected: ${url}`);
      }

    } catch (error) {
      console.error('Navigation failed:', error);
      throw error;
    }
  }

  async goBack(): Promise<void> {
    if (!this.page) {
      throw new Error('Page not initialized. Call initialize() first.');
    }

    try {
      console.log(`🔙 Going back to previous page...`);
      
      // Use browser history to go back
      await this.page.goBack({ 
        waitUntil: 'networkidle0',
        timeout: this.config.timeout 
      });


      // Verify navigation was successful
      const currentUrl = this.page.url();
      console.log(`✅ Successfully navigated back. Current URL: ${currentUrl}`);

    } catch (error) {
      console.error('Go back failed:', error);
      throw error;
    }
  }

  async login(credentials: { username: string; password: string }): Promise<boolean> {
    if (!this.page) {
      throw new Error('Page not initialized. Call initialize() first.');
    }

    // Validate credentials before attempting login
    if (!credentials || !credentials.username || !credentials.password) {
      throw new Error('Invalid credentials: username and password are required');
    }

    if (credentials.username === 'undefined' || credentials.password === 'undefined') {
      throw new Error('Invalid credentials: username and password cannot be undefined');
    }

    try {
      // Look for common login form selectors
      const usernameSelectors = [
        'input[type="email"]',
        'input[name="username"]',
        'input[name="email"]',
        'input[id*="username"]',
        'input[id*="email"]',
        'input[placeholder*="email" i]',
        'input[placeholder*="username" i]'
      ];

      const passwordSelectors = [
        'input[type="password"]',
        'input[name="password"]',
        'input[id*="password"]'
      ];

      const submitSelectors = [
        'button[type="submit"]',
        'input[type="submit"]',
        'button:contains("Login")',
        'button:contains("Sign In")',
        'button:contains("Log In")'
      ];

      // Find and fill username field
      let usernameField: ElementHandle | null = null;
      for (const selector of usernameSelectors) {
        try {
          usernameField = await this.page.$(selector);
          if (usernameField) break;
        } catch (e) {
          continue;
        }
      }

      if (!usernameField) {
        throw new Error('Could not find username/email input field');
      }

      await usernameField.click();
      await usernameField.type(credentials.username);

      // Find and fill password field
      let passwordField: ElementHandle | null = null;
      for (const selector of passwordSelectors) {
        try {
          passwordField = await this.page.$(selector);
          if (passwordField) break;
        } catch (e) {
          continue;
        }
      }

      if (!passwordField) {
        throw new Error('Could not find password input field');
      }

      await passwordField.click();
      await passwordField.type(credentials.password);

      // Find and click submit button
      let submitButton: ElementHandle | null = null;
      for (const selector of submitSelectors) {
        try {
          submitButton = await this.page.$(selector);
          if (submitButton) break;
        } catch (e) {
          continue;
        }
      }

      if (!submitButton) {
        throw new Error('Could not find submit button');
      }

      await submitButton.click();


      return true;
    } catch (error) {
      console.error('Login failed:', error);
      return false;
    }
  }

  async executeAction(action: Action): Promise<{ success: boolean; error?: string }> {
    if (!this.page) {
      throw new Error('Page not initialized. Call initialize() first.');
    }

    try {

      console.log(`🎯 Executing action: ${action.type} - ${action.description}`);
      console.log(`🔍 Using selector: ${action.selector}`);

      switch (action.type) {
        case 'click':
          await this.executeClickAction(action);
          break;
        
        case 'type':
          await this.executeTypeAction(action);
          break;
        
        case 'hover':
          await this.executeHoverAction(action);
          break;
        
        case 'select':
          await this.executeSelectAction(action);
          break;
        
        case 'navigate':
          await this.executeNavigateAction(action);
          break;
        
        case 'wait':
          await this.executeWaitAction(action);
          break;
        
        case 'click_coordinates':
          await this.executeCoordinateClickAction(action);
          break;
        
        case 'hover_coordinates':
          await this.executeCoordinateHoverAction(action);
          break;
        
        case 'type_coordinates':
          await this.executeCoordinateTypeAction(action);
          break;
        
        case 'scroll_coordinates':
          await this.executeCoordinateScrollAction(action);
          break;
        
        case 'select_coordinates':
          await this.executeCoordinateSelectAction(action);
          break;
        
        default:
          throw new Error(`Unknown action type: ${action.type}`);
      }


      console.log(`✅ Action completed successfully: ${action.type}`);
      return { success: true };
    } catch (error) {
      console.error(`❌ Action failed: ${action.type} on ${action.selector}`, error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  private async executeClickAction(action: Action): Promise<void> {
    if (!action.selector) {
      throw new Error('Selector is required for click action');
    }

    // Try multiple strategies to find and click the element
    const strategies = [
      // Strategy 1: Direct selector
      () => this.clickWithSelector(action.selector!),
      // Strategy 2: Text-based search
      () => this.clickByText(action.description),
      // Strategy 3: XPath search
      () => this.clickByXPath(action.description),
      // Strategy 4: Generic element search
      () => this.clickByGenericSearch(action.description)
    ];

    let lastError: Error | null = null;
    
    for (let i = 0; i < strategies.length; i++) {
      try {
        console.log(`🔄 Trying click strategy ${i + 1}/${strategies.length}`);
        await strategies[i]();
        console.log(`✅ Click successful with strategy ${i + 1}`);
        return;
      } catch (error) {
        lastError = error as Error;
        console.warn(`❌ Click strategy ${i + 1} failed:`, error);
        if (i < strategies.length - 1) {
          console.log(`🔄 Trying next strategy...`);
        }
      }
    }

    throw lastError || new Error('All click strategies failed');
  }

  private async clickWithSelector(selector: string): Promise<void> {
    console.log(`🎯 Clicking with selector: ${selector}`);
    
    // Wait for element to be visible and clickable
    await this.page!.waitForSelector(selector, { 
      visible: true, 
      timeout: this.config.waitForSelectorTimeout 
    });
    
    // Ensure element is in viewport
    await this.page!.evaluate((sel) => {
      const element = document.querySelector(sel);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, selector);
    
    
    // Click the element
    await this.page!.click(selector);
  }

  private async clickByText(description: string): Promise<void> {
    console.log(`🔍 Searching for clickable element by text: "${description}"`);
    
    // Extract key terms from description
    const searchTerms = this.extractSearchTerms(description);
    console.log(`🔍 Search terms: ${searchTerms.join(', ')}`);
    
    // Try different text-based selectors
    const textSelectors = [
      `button:contains("${searchTerms[0]}")`,
      `a:contains("${searchTerms[0]}")`,
      `[role="button"]:contains("${searchTerms[0]}")`,
      `*:contains("${searchTerms[0]}")`
    ];
    
    for (const selector of textSelectors) {
      try {
        console.log(`🔍 Trying text selector: ${selector}`);
        await this.page!.waitForSelector(selector, { 
          visible: true, 
          timeout: 2000 
        });
        await this.page!.click(selector);
        console.log(`✅ Click successful with text selector: ${selector}`);
        return;
      } catch (error) {
        console.warn(`❌ Text selector failed: ${selector}`, error);
      }
    }
    
    throw new Error(`No clickable element found for text: "${description}"`);
  }

  private async clickByXPath(description: string): Promise<void> {
    console.log(`🔍 Searching for clickable element by XPath: "${description}"`);
    
    const searchTerms = this.extractSearchTerms(description);
    
    // Try XPath expressions using evaluate
    const xpathExpressions = [
      `//button[contains(text(), "${searchTerms[0]}")]`,
      `//a[contains(text(), "${searchTerms[0]}")]`,
      `//*[@role="button" and contains(text(), "${searchTerms[0]}")]`,
      `//*[contains(text(), "${searchTerms[0]}")]`
    ];
    
    for (const xpath of xpathExpressions) {
      try {
        console.log(`🔍 Trying XPath: ${xpath}`);
        const elements = await this.page!.evaluateHandle((xpath) => {
          const result = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
          const elements = [];
          for (let i = 0; i < result.snapshotLength; i++) {
            elements.push(result.snapshotItem(i));
          }
          return elements;
        }, xpath);
        
        const elementArray = await elements.evaluate((el) => el);
        if (elementArray.length > 0) {
          await this.page!.evaluate((xpath) => {
            const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
            if (result.singleNodeValue) {
              (result.singleNodeValue as HTMLElement).click();
            }
          }, xpath);
          console.log(`✅ Click successful with XPath: ${xpath}`);
          return;
        }
      } catch (error) {
        console.warn(`❌ XPath failed: ${xpath}`, error);
      }
    }
    
    throw new Error(`No clickable element found with XPath for: "${description}"`);
  }

  private async clickByGenericSearch(description: string): Promise<void> {
    console.log(`🔍 Generic search for clickable element: "${description}"`);
    
    // Get all clickable elements and search by text content
    const clickableElements = await this.page!.evaluate(() => {
      const elements = document.querySelectorAll('button, a, [role="button"], input[type="button"], input[type="submit"]');
      return Array.from(elements).map(el => ({
        tagName: el.tagName,
        textContent: el.textContent?.trim() || '',
        className: el.className,
        id: el.id,
        role: el.getAttribute('role')
      }));
    });
    
    console.log(`🔍 Found ${clickableElements.length} clickable elements`);
    
    const searchTerms = this.extractSearchTerms(description);
    console.log(`🔍 Looking for elements containing: ${searchTerms.join(', ')}`);
    
    // Find matching elements
    const matchingElements = clickableElements.filter(el => {
      const text = el.textContent.toLowerCase();
      return searchTerms.some(term => text.includes(term.toLowerCase()));
    });
    
    console.log(`🔍 Found ${matchingElements.length} matching elements`);
    
    if (matchingElements.length === 0) {
      throw new Error(`No clickable elements found matching: "${description}"`);
    }
    
    // Try to click the first matching element
    const targetElement = matchingElements[0];
    console.log(`🎯 Attempting to click element: ${targetElement.tagName} with text "${targetElement.textContent}"`);
    
    // Try different selectors for the matching element
    const selectors = [
      targetElement.id ? `#${targetElement.id}` : null,
      targetElement.className ? `.${targetElement.className.split(' ')[0]}` : null,
      `${targetElement.tagName.toLowerCase()}:contains("${targetElement.textContent}")`
    ].filter(Boolean);
    
    for (const selector of selectors) {
      try {
        console.log(`🔍 Trying selector: ${selector}`);
        await this.page!.waitForSelector(selector!, { 
          visible: true, 
          timeout: 2000 
        });
        await this.page!.click(selector!);
        console.log(`✅ Click successful with selector: ${selector}`);
        return;
      } catch (error) {
        console.warn(`❌ Selector failed: ${selector}`, error);
      }
    }
    
    throw new Error(`Could not click element matching: "${description}"`);
  }

  private extractSearchTerms(description: string): string[] {
    // Extract meaningful terms from the description
    const words = description.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2 && !['click', 'on', 'the', 'button', 'link', 'element'].includes(word));
    
    return words;
  }

  private async executeTypeAction(action: Action): Promise<void> {
    if (!action.selector) {
      throw new Error('Selector is required for type action');
    }

    console.log(`⌨️ Typing "${action.inputText}" into ${action.selector}`);
    
    // Wait for input field to be visible
    await this.page!.waitForSelector(action.selector, { 
      visible: true, 
      timeout: this.config.waitForSelectorTimeout 
    });
    
    // Clear the field first
    await this.page!.click(action.selector);
    await this.page!.keyboard.down('Control');
    await this.page!.keyboard.press('KeyA');
    await this.page!.keyboard.up('Control');
    
    // Type the text
    await this.page!.type(action.selector, String(action.inputText || ''), { delay: 100 });
  }

  private async executeHoverAction(action: Action): Promise<void> {
    if (!action.selector) {
      throw new Error('Selector is required for hover action');
    }

    console.log(`🖱️ Hovering over ${action.selector}`);
    
    await this.page!.waitForSelector(action.selector, { 
      visible: true, 
      timeout: this.config.waitForSelectorTimeout 
    });
    
    await this.page!.hover(action.selector);
  }

  private async executeSelectAction(action: Action): Promise<void> {
    if (!action.selector) {
      throw new Error('Selector is required for select action');
    }

    console.log(`📋 Selecting "${action.inputText}" from ${action.selector}`);
    
    await this.page!.waitForSelector(action.selector, { 
      visible: true, 
      timeout: this.config.waitForSelectorTimeout 
    });
    
    await this.page!.select(action.selector, action.inputText || '');
  }

  private async executeNavigateAction(action: Action): Promise<void> {
    const url = action.inputText || action.selector || '';
    console.log(`🧭 Navigating to: ${url}`);
    
    if (!url) {
      throw new Error('URL is required for navigate action');
    }
    
    await this.navigateToUrl(url);
  }

  private async executeWaitAction(action: Action): Promise<void> {
    const waitTime = parseInt(action.inputText || '1000');
    console.log(`⏳ Waiting for ${waitTime}ms`);
    
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }

  async takeScreenshot(): Promise<string> {
    if (!this.page) {
      throw new Error('Page not initialized. Call initialize() first.');
    }

    return await this.page.screenshot({ 
      encoding: 'base64',
      fullPage: false 
    });
  }

  /**
   * NEW: Take screenshot with specific dimensions for coordinate-based automation
   * Enhanced with page stability checks and consistent viewport handling
   */
  async takeScreenshotForCoordinates(): Promise<{
    screenshot: string;
    screenshotData: { data: string; mimeType: string };
    screenshotPath: string;
    dimensions: { width: number; height: number };
    viewport: { width: number; height: number };
  }> {
    if (!this.page) {
      throw new Error('Page not initialized. Call initialize() first.');
    }

    // Wait for page to be stable before taking screenshot
    await this.waitForPageStability();

    // Get current viewport dimensions
    const viewport = this.page.viewport();
    if (!viewport) {
      throw new Error('Unable to get viewport dimensions');
    }

    // Ensure consistent viewport dimensions
    const consistentViewport = {
      width: viewport.width || this.config.viewport.width,
      height: viewport.height || this.config.viewport.height
    };

    // Generate unique filename
    const timestamp = Date.now();
    const screenshotPath = path.join(process.cwd(), 'screenshots', `screenshot_${timestamp}.png`);

    // Take screenshot and save as file with consistent viewport
    await this.page.screenshot({ 
      path: screenshotPath as `${string}.png`,
      fullPage: false 
    });

    // Also get base64 for compatibility
    const screenshot = await this.page.screenshot({ 
      encoding: 'base64',
      fullPage: false 
    });

    console.log(`📸 Screenshot captured with stable page state. Viewport: ${consistentViewport.width}x${consistentViewport.height}`);

    return {
      screenshot,
      screenshotData: {
        data: screenshot,
        mimeType: 'image/png'
      },
      screenshotPath,
      dimensions: consistentViewport,
      viewport: consistentViewport
    };
  }

  /**
   * Wait for page stability before taking screenshots
   */
  private async waitForPageStability(): Promise<void> {
    if (!this.page) {
      throw new Error('Page not initialized. Call initialize() first.');
    }

    try {
      // Wait for network to be idle (Puppeteer equivalent)
      await this.page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 5000 }).catch(() => {
        // Ignore timeout if no navigation is happening
      });
      
      // Wait for any pending animations or transitions
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Check if page is still loading
      const isLoading = await this.page.evaluate(() => {
        return document.readyState !== 'complete' || 
               document.querySelectorAll('[style*="loading"], .loading, .spinner').length > 0;
      });
      
      if (isLoading) {
        console.log('⏳ Page still loading, waiting for stability...');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      console.log('✅ Page is stable, ready for screenshot');
    } catch (error) {
      console.warn('⚠️ Could not verify page stability, proceeding with screenshot:', error);
    }
  }

  /**
   * Clean up screenshot file after processing
   */
  async cleanupScreenshot(screenshotPath: string): Promise<void> {
    try {
      if (fs.existsSync(screenshotPath)) {
        fs.unlinkSync(screenshotPath);
        console.log(`🗑️  Cleaned up screenshot: ${screenshotPath}`);
      }
    } catch (error) {
      console.warn(`⚠️  Failed to cleanup screenshot ${screenshotPath}:`, error);
    }
  }

  /**
   * Clean up multiple screenshot files
   */
  async cleanupScreenshots(screenshotPaths: string[]): Promise<void> {
    for (const path of screenshotPaths) {
      await this.cleanupScreenshot(path);
    }
  }

  /**
   * Verify if an action was successful by checking DOM state changes
   */
  async verifyActionSuccess(
    actionType: string,
    actionDescription: string,
    expectedOutcome?: string
  ): Promise<{ success: boolean; reasoning: string; confidence: number }> {
    if (!this.page) {
      throw new Error('Page not initialized. Call initialize() first.');
    }

    try {
      // Get current page state
      const currentUrl = this.page.url();
      const pageTitle = await this.page.title();
      
      // Check for common success indicators based on action type
      let success = false;
      let reasoning = '';
      let confidence = 0;

      if (actionType === 'click' || actionType === 'click_coordinates') {
        // For click actions, check if the page state changed or if we're on a new page
        const urlChanged = currentUrl !== this.lastKnownUrl;
        const titleChanged = pageTitle !== this.lastKnownTitle;
        
        if (urlChanged || titleChanged) {
          success = true;
          reasoning = `Page state changed after click: URL=${urlChanged}, Title=${titleChanged}`;
          confidence = 0.8;
        } else {
          // Check for visual feedback like button states, form submissions, etc.
          const hasVisualFeedback = await this.checkForVisualFeedback(actionDescription);
          if (hasVisualFeedback) {
            success = true;
            reasoning = 'Visual feedback detected after click action';
            confidence = 0.7;
          } else {
            success = false;
            reasoning = 'No visible changes detected after click action';
            confidence = 0.3;
          }
        }
      } else if (actionType === 'type' || actionType === 'type_coordinates') {
        // For type actions, check if the input field has the expected value
        const inputValue = await this.getLastFocusedInputValue();
        if (inputValue && inputValue.length > 0) {
          success = true;
          reasoning = `Text successfully entered: "${inputValue}"`;
          confidence = 0.9;
        } else {
          success = false;
          reasoning = 'No text detected in input field';
          confidence = 0.2;
        }
      } else if (actionType === 'navigate') {
        // For navigation, check if we're on the expected page
        success = currentUrl.includes(actionDescription) || pageTitle.includes(actionDescription);
        reasoning = success ? 'Successfully navigated to target page' : 'Navigation did not reach target page';
        confidence = success ? 0.9 : 0.1;
      }

      // Store current state for next comparison
      this.lastKnownUrl = currentUrl;
      this.lastKnownTitle = pageTitle;

      return { success, reasoning, confidence };
    } catch (error) {
      console.error('Error verifying action success:', error);
      return { 
        success: false, 
        reasoning: `Verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        confidence: 0.1 
      };
    }
  }

  /**
   * Check for visual feedback after an action
   */
  private async checkForVisualFeedback(actionDescription: string): Promise<boolean> {
    if (!this.page) {
      return false;
    }

    try {
      // Check for common success indicators
      const indicators = await this.page.evaluate(() => {
        const successIndicators = [
          // Check for success messages
          document.querySelectorAll('[class*="success"], [class*="successful"], .alert-success, .toast-success').length > 0,
          // Check for loading states that might indicate processing
          document.querySelectorAll('[class*="loading"], .spinner, [class*="processing"]').length > 0,
          // Check for form submissions
          document.querySelectorAll('form[data-submitted="true"], .form-submitted').length > 0,
          // Check for button state changes
          document.querySelectorAll('button[disabled], .btn-disabled').length > 0,
          // Check for new content appearing
          document.querySelectorAll('[class*="new"], [class*="added"], [class*="created"]').length > 0
        ];
        
        return indicators.some(indicator => indicator);
      });

      return indicators;
    } catch (error) {
      console.warn('Error checking for visual feedback:', error);
      return false;
    }
  }

  /**
   * Get the value of the last focused input field
   */
  private async getLastFocusedInputValue(): Promise<string> {
    if (!this.page) {
      return '';
    }

    try {
      return await this.page.evaluate(() => {
        const activeElement = document.activeElement as HTMLInputElement;
        if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
          return activeElement.value || '';
        }
        
        // Fallback: check all input fields for recent changes
        const inputs = document.querySelectorAll('input[type="text"], input[type="email"], input[type="password"], textarea');
        for (const input of inputs) {
          if ((input as HTMLInputElement).value && (input as HTMLInputElement).value.length > 0) {
            return (input as HTMLInputElement).value;
          }
        }
        
        return '';
      });
    } catch (error) {
      console.warn('Error getting input value:', error);
      return '';
    }
  }

  // Store last known state for comparison
  private lastKnownUrl: string = '';
  private lastKnownTitle: string = '';

  /**
   * NEW: Click at specific coordinates
   */
  async clickAtCoordinates(x: number, y: number): Promise<{ success: boolean; error?: string }> {
    if (!this.page) {
      throw new Error('Page not initialized. Call initialize() first.');
    }

    try {
      console.log(`🎯 Clicking at coordinates: (${x}, ${y})`);
      
      // Ensure coordinates are within viewport bounds
      const viewport = this.page.viewport();
      if (!viewport) {
        throw new Error('Unable to get viewport dimensions');
      }

      const clampedX = Math.max(0, Math.min(x, viewport.width));
      const clampedY = Math.max(0, Math.min(y, viewport.height));

      if (clampedX !== x || clampedY !== y) {
        console.warn(`⚠️  Coordinates clamped from (${x}, ${y}) to (${clampedX}, ${clampedY})`);
      }

      // Click at the specified coordinates
      await this.page.mouse.click(clampedX, clampedY);
      
      console.log(`✅ Click successful at coordinates: (${clampedX}, ${clampedY})`);
      return { success: true };
    } catch (error) {
      console.error(`❌ Click failed at coordinates (${x}, ${y}):`, error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Coordinate click failed' 
      };
    }
  }

  /**
   * NEW: Get current viewport dimensions
   */
  async getViewportDimensions(): Promise<{ width: number; height: number }> {
    if (!this.page) {
      throw new Error('Page not initialized. Call initialize() first.');
    }

    const viewport = this.page.viewport();
    if (!viewport) {
      throw new Error('Unable to get viewport dimensions');
    }

    return { width: viewport.width, height: viewport.height };
  }

  async waitForElement(selector: string, timeout: number = 5000): Promise<boolean> {
    if (!this.page) {
      throw new Error('Page not initialized. Call initialize() first.');
    }

    try {
      await this.page.waitForSelector(selector, { timeout });
      return true;
    } catch (error) {
      return false;
    }
  }

  async waitForNavigation(timeout: number = 10000): Promise<boolean> {
    if (!this.page) {
      throw new Error('Page not initialized. Call initialize() first.');
    }

    try {
      await this.page.waitForNavigation({ 
        timeout,
        waitUntil: 'networkidle0'
      });
      return true;
    } catch (error) {
      return false;
    }
  }

  async getElementPosition(selector: string): Promise<{ x: number; y: number } | null> {
    if (!this.page) {
      throw new Error('Page not initialized. Call initialize() first.');
    }

    try {
      const element = await this.page.$(selector);
      if (!element) return null;

      const box = await element.boundingBox();
      if (!box) return null;

      return {
        x: box.x + box.width / 2,
        y: box.y + box.height / 2
      };
    } catch (error) {
      console.error('Error getting element position:', error);
      return null;
    }
  }

  async cleanup(): Promise<void> {
    if (this.page) {
      await this.page.close();
      this.page = null;
    }
    
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  getCurrentUrl(): string | null {
    return this.page?.url() || null;
  }

  async getPageTitle(): Promise<string | null> {
    return this.page?.title() || null;
  }

  async getElement(selector: string): Promise<ElementHandle | null> {
    if (!this.page) {
      throw new Error('Page not initialized. Call initialize() first.');
    }
    return await this.page.$(selector);
  }

  async evaluate<T = any>(pageFunction: () => T): Promise<T> {
    if (!this.page) {
      throw new Error('Page not initialized. Call initialize() first.');
    }
    return await this.page.evaluate(pageFunction);
  }


  async retryNavigation(url: string, maxRetries: number = 3): Promise<boolean> {
    for (let i = 0; i < maxRetries; i++) {
      try {
        console.log(`Navigation attempt ${i + 1}/${maxRetries} to ${url}`);
        
        await this.navigateToUrl(url);
        console.log('Navigation successful');
        return true;
      } catch (error) {
        console.error(`Navigation attempt ${i + 1} failed:`, error);
        if (i < maxRetries - 1) {
          console.log(`Retrying navigation in 3 seconds...`);
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      }
    }

    console.error('All navigation attempts failed');
    return false;
  }

  /**
   * Execute coordinate-based click action
   */
  private async executeCoordinateClickAction(action: Action): Promise<void> {
    if (!action.coordinates) {
      throw new Error('Coordinates are required for coordinate-based click action');
    }

    const { x, y, confidence, reasoning } = action.coordinates;
    
    console.log(`🎯 Executing coordinate click at (${x}, ${y}) with confidence ${confidence}`);
    console.log(`💭 Reasoning: ${reasoning}`);

    // Validate coordinates are within reasonable bounds
    if (x < 0 || y < 0 || x > 1920 || y > 1080) {
      console.warn(`⚠️ Coordinates outside typical screen bounds: (${x}, ${y}). Proceeding with click.`);
    }

    // Take a screenshot before clicking for verification
    const screenshot = await this.takeScreenshot();
    console.log(`📸 Screenshot taken before coordinate click`);

    try {
      // Click at the specified coordinates
      await this.page!.mouse.click(x, y);
      console.log(`✅ Coordinate click successful at (${x}, ${y})`);
      
      // Wait for any potential page changes or animations
      await this.waitForActionCompletion();
      
    } catch (error) {
      console.error(`❌ Coordinate click failed at (${x}, ${y}):`, error);
      throw error;
    }
  }

  /**
   * Wait for action completion and page stability
   */
  private async waitForActionCompletion(): Promise<void> {
    if (!this.page) {
      return;
    }

    try {
      // Wait for any immediate page changes
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Wait for network activity to settle
      await this.page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 3000 }).catch(() => {
        // Ignore timeout if no navigation is happening
      });
      
      // Wait for any animations or transitions to complete
      await new Promise(resolve => setTimeout(resolve, 300));
      
      console.log('✅ Action completion wait finished');
    } catch (error) {
      console.warn('⚠️ Could not wait for action completion:', error);
    }
  }

  /**
   * Execute coordinate-based hover action
   */
  private async executeCoordinateHoverAction(action: Action): Promise<void> {
    if (!action.coordinates) {
      throw new Error('Coordinates are required for coordinate-based hover action');
    }

    const { x, y, confidence, reasoning } = action.coordinates;
    
    console.log(`🎯 Executing coordinate hover at (${x}, ${y}) with confidence ${confidence}`);
    console.log(`💭 Reasoning: ${reasoning}`);

    // Validate coordinates are within reasonable bounds
    if (x < 0 || y < 0 || x > 1920 || y > 1080) {
      throw new Error(`Invalid coordinates: (${x}, ${y}). Coordinates should be within screen bounds.`);
    }

    try {
      // Move mouse to the specified coordinates
      await this.page!.mouse.move(x, y);
      console.log(`✅ Coordinate hover successful at (${x}, ${y})`);
      
      
    } catch (error) {
      console.error(`❌ Coordinate hover failed at (${x}, ${y}):`, error);
      throw error;
    }
  }

  /**
   * Execute coordinate-based type action
   */
  private async executeCoordinateTypeAction(action: Action): Promise<void> {
    if (!action.coordinates) {
      throw new Error('Coordinates are required for coordinate-based type action');
    }

    if (!action.inputText) {
      throw new Error('Input text is required for coordinate-based type action');
    }

    const { x, y, confidence, reasoning } = action.coordinates;
    
    console.log(`🎯 Executing coordinate type at (${x}, ${y}) with text: "${action.inputText}"`);
    console.log(`💭 Reasoning: ${reasoning}`);

    // Validate coordinates are within reasonable bounds
    if (x < 0 || y < 0 || x > 1920 || y > 1080) {
      throw new Error(`Invalid coordinates: (${x}, ${y}). Coordinates should be within screen bounds.`);
    }

    try {
      // Click at the coordinates first to focus the input field
      await this.page!.mouse.click(x, y);
      console.log(`✅ Clicked at coordinates (${x}, ${y}) to focus input field`);
      
      
      // Clear any existing text and type new text
      await this.page!.keyboard.down('Control');
      await this.page!.keyboard.press('KeyA');
      await this.page!.keyboard.up('Control');
      await this.page!.keyboard.type(action.inputText);
      
      console.log(`✅ Typed text "${action.inputText}" at coordinates (${x}, ${y})`);
      
      
    } catch (error) {
      console.error(`❌ Coordinate type failed at (${x}, ${y}):`, error);
      throw error;
    }
  }

  /**
   * Execute coordinate-based scroll action
   */
  private async executeCoordinateScrollAction(action: Action): Promise<void> {
    if (!action.coordinates) {
      throw new Error('Coordinates are required for coordinate-based scroll action');
    }

    const { x, y, confidence, reasoning } = action.coordinates;
    
    console.log(`🎯 Executing coordinate scroll at (${x}, ${y})`);
    console.log(`💭 Reasoning: ${reasoning}`);

    // Validate coordinates are within reasonable bounds
    if (x < 0 || y < 0 || x > 1920 || y > 1080) {
      throw new Error(`Invalid coordinates: (${x}, ${y}). Coordinates should be within screen bounds.`);
    }

    try {
      // Move mouse to the coordinates
      await this.page!.mouse.move(x, y);
      console.log(`✅ Moved mouse to coordinates (${x}, ${y})`);
      
      // Perform scroll action at the coordinates
      // Use wheel event for more precise scrolling
      await this.page!.mouse.wheel({ deltaY: 500 }); // Scroll down
      
      console.log(`✅ Scrolled at coordinates (${x}, ${y})`);
      
      
    } catch (error) {
      console.error(`❌ Coordinate scroll failed at (${x}, ${y}):`, error);
      throw error;
    }
  }

  /**
   * Execute coordinate-based select action
   */
  private async executeCoordinateSelectAction(action: Action): Promise<void> {
    if (!action.coordinates) {
      throw new Error('Coordinates are required for coordinate-based select action');
    }

    if (!action.inputText) {
      throw new Error('Input text is required for coordinate-based select action');
    }

    const { x, y, confidence, reasoning } = action.coordinates;
    
    console.log(`🎯 Executing coordinate select at (${x}, ${y}) with option: "${action.inputText}"`);
    console.log(`💭 Reasoning: ${reasoning}`);

    // Validate coordinates are within reasonable bounds
    if (x < 0 || y < 0 || x > 1920 || y > 1080) {
      throw new Error(`Invalid coordinates: (${x}, ${y}). Coordinates should be within screen bounds.`);
    }

    try {
      // Click at the coordinates to open the dropdown/select
      await this.page!.mouse.click(x, y);
      console.log(`✅ Clicked at coordinates (${x}, ${y}) to open select`);
      
      
      // Try to find and click the option by text using evaluate
      const optionFound = await this.page!.evaluate((text) => {
        const selectors = [
          `option:contains("${text}")`,
          `div:contains("${text}")`,
          `li:contains("${text}")`,
          `[role="option"]:contains("${text}")`
        ];
        
        for (const selector of selectors) {
          const element = document.querySelector(selector);
          if (element) {
            (element as HTMLElement).click();
            return true;
          }
        }
        return false;
      }, action.inputText);
      
      if (optionFound) {
        console.log(`✅ Selected option "${action.inputText}" at coordinates (${x}, ${y})`);
      } else {
        // Fallback: try to type the option text
        await this.page!.keyboard.type(action.inputText);
        await this.page!.keyboard.press('Enter');
        console.log(`✅ Typed and selected option "${action.inputText}" at coordinates (${x}, ${y})`);
      }
      
      
    } catch (error) {
      console.error(`❌ Coordinate select failed at (${x}, ${y}):`, error);
      throw error;
    }
  }
}
