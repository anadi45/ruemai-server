import { Injectable } from '@nestjs/common';
import { CreateDemoResponseDto } from './demo-automation.dto';
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

  async generateProductTour(
    websiteUrl: string,
    credentials: { username: string; password: string },
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

      // Step 4: Crawl and extract data
      const scrapedData = await this.crawlWebsite(page, websiteUrl);

      // Step 5: Generate tour using LLM
      const tour = await this.generateTourWithLLM(scrapedData, websiteUrl);

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
   * Debug login process to help troubleshoot issues
   */
  async debugLoginProcess(
    websiteUrl: string,
    credentials: { username: string; password: string },
  ): Promise<any> {
    const startTime = Date.now();
    let browser: any = null;
    const debugInfo: any = {
      loginSuccess: false,
      steps: [],
      errors: [],
      screenshots: [],
      pageInfo: {},
    };

    try {
      console.log('🔍 Starting debug login process...');
      
      // Step 1: Validate inputs
      debugInfo.steps.push({ step: 'validate_inputs', status: 'started' });
      this.validateInputs(websiteUrl, credentials);
      debugInfo.steps.push({ step: 'validate_inputs', status: 'completed' });

      // Step 2: Launch browser
      debugInfo.steps.push({ step: 'launch_browser', status: 'started' });
      browser = await this.launchStealthBrowser();
      const page = await browser.newPage();
      debugInfo.steps.push({ step: 'launch_browser', status: 'completed' });

      // Step 3: Navigate to website
      debugInfo.steps.push({ step: 'navigate', status: 'started' });
      await page.goto(websiteUrl, {
        waitUntil: 'networkidle2',
        timeout: 30000,
      });
      debugInfo.pageInfo.initialUrl = page.url();
      debugInfo.pageInfo.title = await page.title();
      debugInfo.steps.push({ step: 'navigate', status: 'completed' });

      // Step 4: Take initial screenshot
      try {
        const screenshot = await page.screenshot({ fullPage: true, encoding: 'base64' });
        debugInfo.screenshots.push({ name: 'initial_page', data: screenshot });
      } catch (error) {
        debugInfo.errors.push({ step: 'initial_screenshot', error: error.message });
      }

      // Step 5: Find login elements
      debugInfo.steps.push({ step: 'find_login_elements', status: 'started' });
      const loginElements = await this.findLoginElements(page);
      debugInfo.loginElements = loginElements;
      debugInfo.steps.push({ step: 'find_login_elements', status: 'completed' });

      if (!loginElements.username || !loginElements.password) {
        debugInfo.errors.push({ step: 'find_login_elements', error: 'Could not find username or password fields' });
        
        // Try alternative approach
        debugInfo.steps.push({ step: 'alternative_login', status: 'started' });
        const alternativeSuccess = await this.tryAlternativeLogin(page, credentials);
        debugInfo.loginSuccess = alternativeSuccess;
        debugInfo.steps.push({ step: 'alternative_login', status: alternativeSuccess ? 'completed' : 'failed' });
      } else {
        // Step 6: Perform login
        debugInfo.steps.push({ step: 'perform_login', status: 'started' });
        
        try {
          await loginElements.username.click({ clickCount: 3 });
          await loginElements.username.type(credentials.username, { delay: 100 });
          
          await loginElements.password.click({ clickCount: 3 });
          await loginElements.password.type(credentials.password, { delay: 100 });
          
          if (loginElements.submitButton) {
            await loginElements.submitButton.click();
          } else {
            await loginElements.password.press('Enter');
          }
          
          debugInfo.steps.push({ step: 'perform_login', status: 'completed' });
          
          // Step 7: Wait and verify
          debugInfo.steps.push({ step: 'verify_login', status: 'started' });
          await this.waitForLoginCompletion(page);
          const loginSuccess = await this.verifyLoginSuccess(page);
          debugInfo.loginSuccess = loginSuccess;
          debugInfo.steps.push({ step: 'verify_login', status: loginSuccess ? 'completed' : 'failed' });
          
        } catch (error) {
          debugInfo.errors.push({ step: 'perform_login', error: error.message });
          debugInfo.steps.push({ step: 'perform_login', status: 'failed' });
        }
      }

      // Step 8: Final screenshot
      try {
        const finalScreenshot = await page.screenshot({ fullPage: true, encoding: 'base64' });
        debugInfo.screenshots.push({ name: 'final_page', data: finalScreenshot });
      } catch (error) {
        debugInfo.errors.push({ step: 'final_screenshot', error: error.message });
      }

      debugInfo.pageInfo.finalUrl = page.url();
      debugInfo.processingTime = Date.now() - startTime;

      return debugInfo;

    } catch (error) {
      debugInfo.errors.push({ step: 'general', error: error.message, stack: error.stack });
      debugInfo.steps.push({ step: 'general', status: 'failed' });
      return debugInfo;
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
  ): Promise<{
    pages: any[];
    elements: any[];
    screenshots: string[];
    metadata: any;
  }> {
    console.log('🕷️ Starting website crawl...');

    const visitedUrls = new Set<string>();
    const urlQueue: string[] = [baseUrl];
    const maxPages = 10; // Limit for tour generation
    const maxDepth = 2;
    const urlDepthMap = new Map<string, number>();
    urlDepthMap.set(baseUrl, 0);

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
   * Extract comprehensive page data including HTML, markdown, and metadata
   */
  private async extractPageData(page: Page): Promise<any> {
    // Wait for dynamic content to load
    await this.waitForDynamicContent(page);

    // Scroll to load lazy content
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Get HTML content
    const html = await page.content();

    // Convert to markdown for LLM processing (simplified version)
    const markdown = this.convertHtmlToMarkdown(html);

    // Extract page metadata
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
    }));

    // Extract interactive elements
    const elements = await this.extractInteractiveElements(page);

    // Take screenshot
    const screenshot = await page.screenshot({
      fullPage: true,
      encoding: 'base64',
    });

    return {
      title: metadata.title,
      html,
      markdown,
      elements,
      screenshot,
      metadata,
    };
  }

  /**
   * Extract interactive elements that could be tour steps
   */
  private async extractInteractiveElements(page: Page): Promise<any[]> {
    return page.evaluate(() => {
      const elements: any[] = [];

      // Helper function to generate CSS selector for an element
      const generateSelector = (element: Element): string => {
        if (element.id) {
          return `#${element.id}`;
        }

        if (element.className) {
          const classes = element.className.split(' ').filter((c) => c.trim());
          if (classes.length > 0) {
            return `.${classes.join('.')}`;
          }
        }

        if (element.getAttribute('data-testid')) {
          return `[data-testid="${element.getAttribute('data-testid')}"]`;
        }

        if (element.getAttribute('aria-label')) {
          return `[aria-label="${element.getAttribute('aria-label')}"]`;
        }

        // Fallback to tag name with nth-child
        const parent = element.parentElement;
        if (parent) {
          const siblings = Array.from(parent.children);
          const index = siblings.indexOf(element);
          return `${element.tagName.toLowerCase()}:nth-child(${index + 1})`;
        }

        return element.tagName.toLowerCase();
      };

      // Helper function to check if an element is interactive
      const isInteractiveElement = (element: Element): boolean => {
        const interactiveTags = ['button', 'a', 'input', 'select', 'textarea'];
        const interactiveRoles = ['button', 'link', 'tab', 'menuitem', 'option'];

        if (interactiveTags.includes(element.tagName.toLowerCase())) {
          return true;
        }

        if (interactiveRoles.includes(element.getAttribute('role') || '')) {
          return true;
        }

        if (
          element.getAttribute('onclick') ||
          element.getAttribute('onmousedown')
        ) {
          return true;
        }

        return false;
      };

      // Find all interactive elements
      const selectors = [
        'button',
        'a[href]',
        'input[type="submit"]',
        'input[type="button"]',
        'input[type="checkbox"]',
        'input[type="radio"]',
        'select',
        '[onclick]',
        '[role="button"]',
        '[role="link"]',
        '[role="tab"]',
        '[role="menuitem"]',
        '[data-testid]',
        '[aria-label]',
        '.btn',
        '.button',
        '.link',
        '.menu-item',
        '.nav-item',
        '.tab',
        '.card',
        '.tile',
        '.widget',
      ];

      selectors.forEach((selector) => {
        const foundElements = document.querySelectorAll(selector);
        foundElements.forEach((element) => {
          const rect = element.getBoundingClientRect();

          // Only include visible elements
          if (
            rect.width > 0 &&
            rect.height > 0 &&
            (element as any).offsetParent !== null &&
            window.getComputedStyle(element).visibility !== 'hidden'
          ) {
            const elementData = {
              selector: generateSelector(element),
              tagName: element.tagName.toLowerCase(),
              text: element.textContent?.trim() || '',
              href: element.getAttribute('href') || '',
              type: element.getAttribute('type') || '',
              id: element.id || '',
              className: element.className || '',
              role: element.getAttribute('role') || '',
              'aria-label': element.getAttribute('aria-label') || '',
              'data-testid': element.getAttribute('data-testid') || '',
              onclick: element.getAttribute('onclick') || '',
              position: {
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height,
              },
              isVisible: true,
              isInteractive: isInteractiveElement(element),
            };

            elements.push(elementData);
          }
        });
      });

      return elements;
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
   * Wait for dynamic content to load completely
   */
  private async waitForDynamicContent(page: Page): Promise<void> {
    try {
      // Wait for network idle
      await page.waitForFunction(() => document.readyState === 'complete');

      // Wait for any loading indicators to disappear
      await page
        .waitForFunction(
          () => {
            const loadingElements = document.querySelectorAll(
              '[class*="loading"], [class*="spinner"], [id*="loading"]',
            );
            return loadingElements.length === 0;
          },
          { timeout: 5000 },
        )
        .catch(() => {
          // Continue if timeout
        });

      // Additional wait for any remaining dynamic content
      await new Promise((resolve) => setTimeout(resolve, 2000));
    } catch (error) {
      console.log('⚠️ Dynamic content wait timeout, continuing...');
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
  ): Promise<Tour> {
    console.log('🤖 Generating tour with LLM analysis...');

    try {
      // Prepare data for LLM analysis
      const analysisData = this.prepareDataForLLM(scrapedData);

      // Create LLM prompt for tour generation
      this.createTourGenerationPrompt(analysisData, websiteUrl);

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
  ): string {
    return `
You are an expert UX analyst tasked with creating an interactive product tour for a web application.

WEBSITE DATA:
- URL: ${websiteUrl}
- Total Pages: ${analysisData.website.totalPages}
- Total Interactive Elements: ${analysisData.interactiveElements.length}
- Key Features: ${analysisData.keyFeatures.join(', ')}
- Identified User Flows: ${analysisData.userFlows.join(', ')}

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
Create a comprehensive product tour that demonstrates the key features and functionality of this web application. The tour should:

1. Start with the most important/valuable features
2. Follow logical user flows
3. Include clear, actionable steps
4. Be suitable for both new users and existing users wanting to learn more
5. Cover 5-10 key steps maximum
6. Include both navigation and feature demonstration steps

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
