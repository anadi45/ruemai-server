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
    await this.page.setUserAgent(this.config.userAgent);
    
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
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
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
      
      // Navigate with multiple wait strategies
      await this.page.goto(validUrl, { 
        waitUntil: 'networkidle0',
        timeout: this.config.timeout 
      });

      // Wait for JavaScript to load and execute
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Check if JavaScript is working by looking for common indicators
      const jsWorking = await this.page.evaluate(() => {
        // Check if we can execute JavaScript
        return typeof window !== 'undefined' && typeof document !== 'undefined';
      });

      if (!jsWorking) {
        console.warn('JavaScript execution check failed - page may not be fully loaded');
      }

      // Wait for network to be idle
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Additional wait for dynamic content
      await new Promise(resolve => setTimeout(resolve, 2000));

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

  async login(credentials: { username: string; password: string }): Promise<boolean> {
    if (!this.page) {
      throw new Error('Page not initialized. Call initialize() first.');
    }

    // Debug: Log credentials to help identify undefined values
    console.log('PuppeteerWorkerService.login - Received credentials:', {
      username: credentials?.username,
      password: credentials?.password ? '[REDACTED]' : 'undefined',
      credentialsType: typeof credentials,
      usernameType: typeof credentials?.username,
      passwordType: typeof credentials?.password
    });

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

      // Wait for navigation or error message
      await new Promise(resolve => setTimeout(resolve, 2000));

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
      // Check for JavaScript errors before executing action
      const hasJsErrors = await this.checkForJavaScriptErrors();
      if (hasJsErrors) {
        console.warn('JavaScript errors detected on page, but continuing with action');
      }

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

      // Wait for page to settle and check for errors
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Check for JavaScript errors after action
      const hasJsErrorsAfter = await this.checkForJavaScriptErrors();
      if (hasJsErrorsAfter) {
        console.warn('JavaScript errors detected after action execution');
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
    
    // Wait a bit for scroll to complete
    await new Promise(resolve => setTimeout(resolve, 500));
    
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

  async checkForJavaScriptErrors(): Promise<boolean> {
    if (!this.page) {
      return false;
    }

    try {
      const errors = await this.page.evaluate(() => {
        // Check for common JavaScript error indicators by text content
        const errorTexts = [
          'You need to enable JavaScript to run this app',
          'JavaScript is disabled',
          'Please enable JavaScript',
          'Enable JavaScript',
          'JavaScript required',
          'JavaScript is not enabled',
          'Please turn on JavaScript',
          'This page requires JavaScript'
        ];
        
        // Check for error text in the document
        const bodyText = document.body.textContent || '';
        for (const errorText of errorTexts) {
          if (bodyText.includes(errorText)) {
            return true;
          }
        }
        
        // Check for error elements by class or data attributes
        const errorSelectors = [
          '[data-testid*="error"]',
          '.error-message',
          '.js-error',
          '.javascript-error',
          '[class*="error"]'
        ];
        
        for (const selector of errorSelectors) {
          if (document.querySelector(selector)) {
            return true;
          }
        }
        
        // Check if we can execute basic JavaScript
        try {
          return typeof window === 'undefined' || typeof document === 'undefined';
        } catch (e) {
          return true;
        }
      });
      
      return errors;
    } catch (error) {
      console.error('Error checking for JavaScript errors:', error);
      return false;
    }
  }

  async getDOMState(includeScreenshot: boolean = false): Promise<DOMState> {
    if (!this.page) {
      throw new Error('Page not initialized. Call initialize() first.');
    }

    // Check for JavaScript errors first
    const hasJsErrors = await this.checkForJavaScriptErrors();
    if (hasJsErrors) {
      console.warn('JavaScript errors detected when getting DOM state');
    }

    const domHtml = await this.page.content();
    const currentUrl = this.page.url();
    const pageTitle = await this.page.title();

    // Get visible text
    const visibleText = await this.page.evaluate(() => {
      const elements = document.querySelectorAll('*');
      const texts: string[] = [];
      
      elements.forEach(el => {
        const text = el.textContent?.trim();
        if (text && text.length > 0 && text.length < 100) {
          texts.push(text);
        }
      });
      
      return [...new Set(texts)]; // Remove duplicates
    });

    // Get clickable selectors
    const clickableSelectors = await this.page.evaluate(() => {
      const elements = document.querySelectorAll('a, button, [role="button"], input[type="submit"], input[type="button"]');
      return Array.from(elements).map(el => {
        // Generate a unique selector
        if (el.id) return `#${el.id}`;
        if (el.className) return `.${el.className.split(' ')[0]}`;
        return el.tagName.toLowerCase();
      });
    });

    // Get input selectors
    const inputSelectors = await this.page.evaluate(() => {
      const elements = document.querySelectorAll('input[type="text"], input[type="email"], input[type="password"], input:not([type])');
      return Array.from(elements).map(el => {
        if (el.id) return `#${el.id}`;
        if ((el as any).name) return `[name="${(el as any).name}"]`;
        if (el.className) return `.${el.className.split(' ')[0]}`;
        return el.tagName.toLowerCase();
      });
    });

    // Get select selectors
    const selectSelectors = await this.page.evaluate(() => {
      const elements = document.querySelectorAll('select');
      return Array.from(elements).map(el => {
        if (el.id) return `#${el.id}`;
        if ((el as any).name) return `[name="${(el as any).name}"]`;
        if (el.className) return `.${el.className.split(' ')[0]}`;
        return el.tagName.toLowerCase();
      });
    });

    return {
      domHtml,
      visibleText,
      clickableSelectors,
      inputSelectors,
      selectSelectors,
      currentUrl,
      pageTitle,
      timestamp: Date.now()
    };
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

    // Get current viewport dimensions
    const viewport = this.page.viewport();
    if (!viewport) {
      throw new Error('Unable to get viewport dimensions');
    }

    // Generate unique filename
    const timestamp = Date.now();
    const screenshotPath = path.join(process.cwd(), 'screenshots', `screenshot_${timestamp}.png`);

    // Take screenshot and save as file
    await this.page.screenshot({ 
      path: screenshotPath as `${string}.png`,
      fullPage: false 
    });

    // Also get base64 for compatibility
    const screenshot = await this.page.screenshot({ 
      encoding: 'base64',
      fullPage: false 
    });

    return {
      screenshot,
      screenshotData: {
        data: screenshot,
        mimeType: 'image/png'
      },
      screenshotPath,
      dimensions: { width: viewport.width, height: viewport.height },
      viewport: { width: viewport.width, height: viewport.height }
    };
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
      await this.page.waitForNavigation({ timeout });
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

  async waitForAppToLoad(maxWaitTime: number = 10000): Promise<boolean> {
    if (!this.page) {
      throw new Error('Page not initialized. Call initialize() first.');
    }

    try {
      // Wait for common app loading indicators
      const appLoaded = await this.page.waitForFunction(() => {
        // Check for common app loading indicators
        const indicators = [
          // React/Vue/Angular apps
          document.querySelector('[data-reactroot]'),
          document.querySelector('[data-vue]'),
          document.querySelector('[ng-app]'),
          // Common app containers
          document.querySelector('#app'),
          document.querySelector('.app'),
          document.querySelector('[class*="app"]'),
          // Check if body has content beyond just error messages
          document.body.children.length > 1,
          // Check for interactive elements
          document.querySelector('button, input, a, [role="button"]')
        ];
        
        return indicators.some(indicator => indicator !== null);
      }, { timeout: maxWaitTime });

      return !!appLoaded;
    } catch (error) {
      console.warn('App loading timeout or error:', error);
      return false;
    }
  }

  async retryNavigation(url: string, maxRetries: number = 3): Promise<boolean> {
    for (let i = 0; i < maxRetries; i++) {
      try {
        console.log(`Navigation attempt ${i + 1}/${maxRetries} to ${url}`);
        
        await this.navigateToUrl(url);
        
        // Check if JavaScript is working
        const jsWorking = await this.page!.evaluate(() => {
          return typeof window !== 'undefined' && typeof document !== 'undefined';
        });

        if (jsWorking) {
          // Wait for app to load
          const appLoaded = await this.waitForAppToLoad(5000);
          if (appLoaded) {
            console.log('Navigation successful and app loaded');
            return true;
          }
        }

        if (i < maxRetries - 1) {
          console.log(`Navigation attempt ${i + 1} failed, retrying in 3 seconds...`);
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      } catch (error) {
        console.error(`Navigation attempt ${i + 1} failed:`, error);
        if (i < maxRetries - 1) {
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
      throw new Error(`Invalid coordinates: (${x}, ${y}). Coordinates should be within screen bounds.`);
    }

    // Take a screenshot before clicking for verification
    const screenshot = await this.takeScreenshot();
    console.log(`📸 Screenshot taken before coordinate click`);

    try {
      // Click at the specified coordinates
      await this.page!.mouse.click(x, y);
      console.log(`✅ Coordinate click successful at (${x}, ${y})`);
      
      // Wait for any potential page changes after click
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      console.error(`❌ Coordinate click failed at (${x}, ${y}):`, error);
      throw error;
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
      
      // Wait for any hover effects to trigger
      await new Promise(resolve => setTimeout(resolve, 500));
      
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
      
      // Wait for input field to be focused
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Clear any existing text and type new text
      await this.page!.keyboard.down('Control');
      await this.page!.keyboard.press('KeyA');
      await this.page!.keyboard.up('Control');
      await this.page!.keyboard.type(action.inputText);
      
      console.log(`✅ Typed text "${action.inputText}" at coordinates (${x}, ${y})`);
      
      // Wait for any potential page changes after typing
      await new Promise(resolve => setTimeout(resolve, 1000));
      
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
      
      // Wait for scroll to complete
      await new Promise(resolve => setTimeout(resolve, 1000));
      
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
      
      // Wait for dropdown to open
      await new Promise(resolve => setTimeout(resolve, 1000));
      
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
      
      // Wait for selection to complete
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      console.error(`❌ Coordinate select failed at (${x}, ${y}):`, error);
      throw error;
    }
  }
}
