import { Injectable } from '@nestjs/common';
import puppeteer, { Browser, Page, ElementHandle } from 'puppeteer';
import { Action, DOMState, PuppeteerWorkerConfig } from '../types/demo-automation.types';

@Injectable()
export class PuppeteerWorkerService {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private config: PuppeteerWorkerConfig;

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

    try {
      // Navigate with multiple wait strategies
      await this.page.goto(url, { 
        waitUntil: 'domcontentloaded',
        timeout: this.config.timeout 
      });

      // Wait for JavaScript to load
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Check if JavaScript is working by looking for common indicators
      const jsWorking = await this.page.evaluate(() => {
        // Check if we can execute JavaScript
        return typeof window !== 'undefined' && typeof document !== 'undefined';
      });

      if (!jsWorking) {
        throw new Error('JavaScript execution failed - page may not be fully loaded');
      }

      // Wait for network to be idle
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Additional wait for dynamic content
      await new Promise(resolve => setTimeout(resolve, 2000));

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

      switch (action.type) {
        case 'click':
          // Wait for element to be visible and clickable
          await this.page.waitForSelector(action.selector!, { 
            visible: true, 
            timeout: this.config.waitForSelectorTimeout 
          });
          await this.page.click(action.selector!);
          break;
        
        case 'type':
          // Wait for input field to be visible
          await this.page.waitForSelector(action.selector!, { 
            visible: true, 
            timeout: this.config.waitForSelectorTimeout 
          });
          await this.page.click(action.selector!);
          await this.page.type(action.selector!, String(action.inputText || ''), { delay: 100 });
          break;
        
        case 'hover':
          await this.page.waitForSelector(action.selector!, { 
            visible: true, 
            timeout: this.config.waitForSelectorTimeout 
          });
          await this.page.hover(action.selector!);
          break;
        
        case 'select':
          await this.page.waitForSelector(action.selector!, { 
            visible: true, 
            timeout: this.config.waitForSelectorTimeout 
          });
          await this.page.select(action.selector!, action.inputText || '');
          break;
        
        case 'navigate':
          await this.navigateToUrl(action.inputText || '');
          break;
        
        case 'wait':
          const waitTime = parseInt(action.inputText || '1000');
          await new Promise(resolve => setTimeout(resolve, waitTime));
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

      return { success: true };
    } catch (error) {
      console.error(`Action failed: ${action.type} on ${action.selector}`, error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  async checkForJavaScriptErrors(): Promise<boolean> {
    if (!this.page) {
      return false;
    }

    try {
      const errors = await this.page.evaluate(() => {
        // Check for common JavaScript error indicators
        const errorSelectors = [
          'text=You need to enable JavaScript to run this app',
          'text=JavaScript is disabled',
          'text=Please enable JavaScript',
          '[data-testid*="error"]',
          '.error-message',
          '.js-error'
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

  isInitialized(): boolean {
    return this.browser !== null && this.page !== null;
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
}
