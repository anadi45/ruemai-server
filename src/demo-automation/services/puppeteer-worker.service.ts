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
      viewport: { width: 1280, height: 720 },
      timeout: 30000,
      waitForSelectorTimeout: 5000
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
        '--disable-gpu'
      ]
    });

    this.page = await this.browser.newPage();
    await this.page.setViewport(this.config.viewport);
    
    if (this.config.userAgent) {
      await this.page.setUserAgent(this.config.userAgent);
    }

    // Set timeouts
    this.page.setDefaultTimeout(this.config.timeout);
    this.page.setDefaultNavigationTimeout(this.config.timeout);
  }

  async navigateToUrl(url: string): Promise<void> {
    if (!this.page) {
      throw new Error('Page not initialized. Call initialize() first.');
    }

    await this.page.goto(url, { 
      waitUntil: 'networkidle2',
      timeout: this.config.timeout 
    });
  }

  async login(credentials: { username: string; password: string }): Promise<boolean> {
    if (!this.page) {
      throw new Error('Page not initialized. Call initialize() first.');
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
      await usernameField.type(String(credentials.username));

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
      await passwordField.type(String(credentials.password));

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
      switch (action.type) {
        case 'click':
          await this.page.click(action.selector!);
          break;
        
        case 'type':
          await this.page.click(action.selector!);
          await this.page.type(action.selector!, String(action.inputText || ''));
          break;
        
        case 'hover':
          await this.page.hover(action.selector!);
          break;
        
        case 'select':
          await this.page.select(action.selector!, action.inputText || '');
          break;
        
        case 'navigate':
          await this.page.goto(action.inputText || '', { 
            waitUntil: 'networkidle2' 
          });
          break;
        
        case 'wait':
          await new Promise(resolve => setTimeout(resolve, parseInt(action.inputText || '1000')));
          break;
        
        default:
          throw new Error(`Unknown action type: ${action.type}`);
      }

      // Wait for page to settle
      await new Promise(resolve => setTimeout(resolve, 500));
      return { success: true };
    } catch (error) {
      console.error(`Action failed: ${action.type} on ${action.selector}`, error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  async getDOMState(includeScreenshot: boolean = false): Promise<DOMState> {
    if (!this.page) {
      throw new Error('Page not initialized. Call initialize() first.');
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

    let screenshot: string | undefined;
    if (includeScreenshot) {
      screenshot = await this.page.screenshot({ 
        encoding: 'base64',
        fullPage: false 
      });
    }

    return {
      domHtml,
      visibleText,
      clickableSelectors,
      inputSelectors,
      selectSelectors,
      currentUrl,
      pageTitle,
      screenshot,
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
}
