import { Injectable } from '@nestjs/common';
import { CreateDemoResponseDto } from './demo-automation.dto';
import puppeteer, { Browser, Page } from 'puppeteer';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class DemoAutomationService {
  async loginToWebsite(
    websiteUrl: string,
    credentials: { username: string; password: string },
  ): Promise<CreateDemoResponseDto> {
    const startTime = Date.now();
    const demoId = uuidv4();
    let browser: Browser | null = null;
    const visitedUrls = new Set<string>();
    const scrapedPages: any[] = [];

    try {
      // Launch browser with persistent context for session management
      browser = await puppeteer.launch({
        headless: false,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });

      const page = await browser.newPage();
      await page.setViewport({ width: 1920, height: 1080 });

      // Navigate to website and login
      try {
        await page.goto(websiteUrl, {
          waitUntil: 'domcontentloaded',
          timeout: 30000,
        });
      } catch (error) {
        throw new Error(
          `Failed to navigate to ${websiteUrl}: ${error.message}`,
        );
      }

      // Perform login
      console.log('Attempting to login...');
      const loginSuccess = await this.performLogin(page, credentials);

      if (!loginSuccess) {
        console.log('❌ Login failed');
        throw new Error('Login failed');
      } else {
        console.log('✅ Login successful');
      }

      // Start recursive scraping with queue-based approach
      await this.recursiveScrapeAllLinks(
        page,
        websiteUrl,
        visitedUrls,
        scrapedPages,
      );

      const processingTime = Date.now() - startTime;

      return {
        demoId,
        demoName: 'Deep Website Scraping Demo',
        websiteUrl,
        loginStatus: 'success',
        pageInfo: scrapedPages[0]?.pageInfo,
        summary: {
          processingTime,
          loginAttempted: true,
          finalUrl: scrapedPages[0]?.url || websiteUrl,
        },
        scrapedData: {
          success: true,
          totalPages: scrapedPages.length,
          crawlTime: processingTime,
          pages: scrapedPages,
        },
      };
    } catch (error) {
      throw new Error(`Demo automation failed: ${error.message}`);
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  private async performLogin(
    page: Page,
    credentials: { username: string; password: string },
  ): Promise<boolean> {
    try {
      console.log('🔍 Looking for login form...');

      // Try to find login form with multiple strategies
      const loginFormSelectors = [
        'form[action*="login"]',
        'form[action*="signin"]',
        'form[action*="auth"]',
        'form[id*="login"]',
        'form[class*="login"]',
        'form',
      ];

      let loginForm = null;
      for (const selector of loginFormSelectors) {
        try {
          loginForm = await page.waitForSelector(selector, { timeout: 3000 });
          if (loginForm) {
            console.log(`✅ Found login form with selector: ${selector}`);
            break;
          }
        } catch {}
      }

      // If no form found, try to find input fields directly
      if (!loginForm) {
        console.log(
          '🔍 No login form found, looking for input fields directly...',
        );
        // Find username/email field with more comprehensive selectors
        const usernameSelectors = [
          'input[type="email"]',
          'input[name="email"]',
          'input[name="username"]',
          'input[name="user"]',
          'input[name="login"]',
          'input[name="loginId"]',
          'input[type="text"]',
          'input[placeholder*="email" i]',
          'input[placeholder*="username" i]',
          'input[placeholder*="user" i]',
          'input[placeholder*="login" i]',
          'input[id*="email"]',
          'input[id*="username"]',
          'input[id*="user"]',
          'input[id*="login"]',
        ];

        let usernameField = null;
        for (const selector of usernameSelectors) {
          try {
            usernameField = await page.waitForSelector(selector, {
              timeout: 2000,
            });
            if (usernameField) break;
          } catch {}
        }

        if (!usernameField) {
          console.log('❌ No username field found');
          return false;
        }
        console.log('✅ Found username field');

        // Find password field
        const passwordSelectors = [
          'input[type="password"]',
          'input[name="password"]',
          'input[name="pass"]',
          'input[name="pwd"]',
          'input[id*="password"]',
          'input[id*="pass"]',
        ];

        let passwordField = null;
        for (const selector of passwordSelectors) {
          try {
            passwordField = await page.waitForSelector(selector, {
              timeout: 2000,
            });
            if (passwordField) break;
          } catch {}
        }

        if (!passwordField) {
          console.log('❌ No password field found');
          return false;
        }
        console.log('✅ Found password field');

        // Clear and fill credentials
        console.log('📝 Filling in credentials...');
        await usernameField.click({ clickCount: 3 });
        await usernameField.type(credentials.username);
        await passwordField.click({ clickCount: 3 });
        await passwordField.type(credentials.password);

        // Find and click login button with more selectors
        const loginButtonSelectors = [
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
          'button[class*="btn"]',
          'button[id*="login"]',
          'button[id*="submit"]',
          'form button',
          'form input[type="submit"]',
        ];

        let loginButton = null;
        for (const selector of loginButtonSelectors) {
          try {
            loginButton = await page.waitForSelector(selector, {
              timeout: 2000,
            });
            if (loginButton) break;
          } catch {}
        }

        if (!loginButton) {
          console.log('❌ No login button found');
          return false;
        }
        console.log('✅ Found login button');

        // Click login button
        console.log('🖱️ Clicking login button...');
        await loginButton.click();
      } else {
        // If we found a form, try to fill it
        const usernameField = await loginForm.$(
          'input[type="email"], input[name="email"], input[name="username"], input[name="user"], input[type="text"]',
        );
        const passwordField = await loginForm.$('input[type="password"]');

        if (usernameField && passwordField) {
          await usernameField.click({ clickCount: 3 });
          await usernameField.type(credentials.username);
          await passwordField.click({ clickCount: 3 });
          await passwordField.type(credentials.password);

          const submitButton = await loginForm.$(
            'button[type="submit"], input[type="submit"], button',
          );
          if (submitButton) {
            await submitButton.click();
          }
        }
      }

      // Check if login was successful with multiple indicators
      const currentUrl = page.url();
      const pageContent = await page.content();

      // Check for login success indicators
      const successIndicators = [
        'dashboard',
        'profile',
        'account',
        'welcome',
        'logout',
        'sign out',
        'user menu',
        'admin',
        'home',
        'main',
        'app',
      ];

      // Check for login failure indicators
      const failureIndicators = [
        'invalid',
        'incorrect',
        'wrong',
        'error',
        'failed',
        'denied',
        'unauthorized',
        'login failed',
        'invalid credentials',
        'wrong password',
        'user not found',
      ];

      const hasFailureIndicator = failureIndicators.some(
        (indicator) =>
          currentUrl.toLowerCase().includes(indicator) ||
          pageContent.toLowerCase().includes(indicator),
      );

      if (hasFailureIndicator) {
        console.log('❌ Login failed - failure indicators detected');
        return false;
      }

      const hasSuccessIndicator = successIndicators.some(
        (indicator) =>
          currentUrl.toLowerCase().includes(indicator) ||
          pageContent.toLowerCase().includes(indicator),
      );

      // Also check if we're no longer on a login page
      const isNotOnLoginPage =
        !currentUrl.toLowerCase().includes('login') &&
        !currentUrl.toLowerCase().includes('signin') &&
        !currentUrl.toLowerCase().includes('auth');

      const loginResult = hasSuccessIndicator || isNotOnLoginPage;

      if (loginResult) {
        console.log('✅ Login successful - success indicators detected');
      } else {
        console.log('❌ Login failed - no success indicators found');
      }

      return loginResult;
    } catch (error) {
      return false;
    }
  }

  private async recursiveScrapeAllLinks(
    page: Page,
    baseUrl: string,
    visitedUrls: Set<string>,
    scrapedPages: any[],
  ): Promise<void> {
    const urlQueue: string[] = [baseUrl];
    const maxPages = 50; // Limit to prevent infinite loops
    let processedPages = 0;

    while (urlQueue.length > 0 && processedPages < maxPages) {
      const currentUrl = urlQueue.shift()!;

      // Skip if already visited
      if (visitedUrls.has(currentUrl)) {
        continue;
      }

      // Check if URL is internal
      if (!this.isInternalUrl(currentUrl, baseUrl)) {
        continue;
      }

      visitedUrls.add(currentUrl);
      processedPages++;

      try {
        console.log(`📄 Scraping page ${processedPages}/${maxPages}: ${currentUrl}`);
        
        // Navigate to the current URL
        await page.goto(currentUrl, {
          waitUntil: 'domcontentloaded',
          timeout: 30000,
        });

        // Wait a bit for dynamic content to load
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Extract page data
        const pageData = await this.extractPageData(page);
        scrapedPages.push({
          url: currentUrl,
          title: pageData.title,
          html: pageData.html,
          scrapedData: pageData.scrapedData,
          timestamp: new Date().toISOString(),
          pageInfo: pageData.pageInfo,
        });

        // Get all href links from the page
        const links = await page.evaluate(() => {
          const linkElements = document.querySelectorAll('a[href]');
          return Array.from(linkElements).map((link) => ({
            href: link.getAttribute('href'),
            text: link.textContent?.trim(),
          }));
        });

        // Add new internal links to the queue
        for (const link of links) {
          if (link.href) {
            const fullUrl = this.resolveUrl(link.href, baseUrl);
            
            if (this.isInternalUrl(fullUrl, baseUrl) && !visitedUrls.has(fullUrl) && !urlQueue.includes(fullUrl)) {
              urlQueue.push(fullUrl);
            }
          }
        }

        console.log(`✅ Successfully scraped: ${currentUrl} (found ${links.length} links, queue size: ${urlQueue.length})`);

      } catch (error) {
        console.error(`❌ Failed to scrape ${currentUrl}:`, error.message);
        // Continue with other URLs if this one fails
        continue;
      }
    }

    console.log(`🎉 Scraping completed! Processed ${processedPages} pages, found ${scrapedPages.length} successfully scraped pages`);
  }

  private async extractPageData(page: Page): Promise<any> {
    const pageData = await page.evaluate(() => {
      const title = document.title;
      const url = window.location.href;
      const bodyText = document.body.innerText;

      // Extract comprehensive data
      const forms = Array.from(document.querySelectorAll('form')).map(
        (form) => ({
          action: form.action,
          method: form.method,
          inputs: Array.from(form.querySelectorAll('input')).map((input) => ({
            type: input.type,
            name: input.name,
            placeholder: input.placeholder,
          })),
        }),
      );

      const buttons = Array.from(document.querySelectorAll('button')).map(
        (btn) => ({
          text: btn.textContent?.trim(),
          type: btn.type,
          className: btn.className,
        }),
      );

      const links = Array.from(document.querySelectorAll('a')).map((link) => ({
        href: link.href,
        text: link.textContent?.trim(),
      }));

      const images = Array.from(document.querySelectorAll('img')).map(
        (img) => ({
          src: img.src,
          alt: img.alt,
        }),
      );

      const tables = Array.from(document.querySelectorAll('table')).map(
        (table) => ({
          rows: table.rows.length,
          cells: table.querySelectorAll('td, th').length,
        }),
      );

      const headings = {
        h1: Array.from(document.querySelectorAll('h1')).map((h) =>
          h.textContent?.trim(),
        ),
        h2: Array.from(document.querySelectorAll('h2')).map((h) =>
          h.textContent?.trim(),
        ),
        h3: Array.from(document.querySelectorAll('h3')).map((h) =>
          h.textContent?.trim(),
        ),
      };

      return {
        title,
        url,
        bodyText,
        totalElements: document.querySelectorAll('*').length,
        buttons: buttons.length,
        links: links.length,
        inputs: document.querySelectorAll('input').length,
        forms: forms.length,
        images: images.length,
        tables: tables.length,
        scrapedData: {
          forms,
          buttons,
          links,
          images,
          tables,
          headings,
          wordCount: bodyText.split(/\s+/).length,
          characterCount: bodyText.length,
        },
      };
    });

    return {
      ...pageData,
      html: await page.content(),
      pageInfo: {
        title: pageData.title,
        url: pageData.url,
        bodyText: pageData.bodyText.substring(0, 1000),
        totalElements: pageData.totalElements,
        buttons: pageData.buttons,
        links: pageData.links,
        inputs: pageData.inputs,
      },
    };
  }

  private isInternalUrl(url: string, baseUrl: string): boolean {
    try {
      const urlObj = new URL(url);
      const baseObj = new URL(baseUrl);
      return urlObj.origin === baseObj.origin;
    } catch {
      return false;
    }
  }

  private resolveUrl(href: string, baseUrl: string): string {
    try {
      return new URL(href, baseUrl).href;
    } catch {
      return href;
    }
  }
}
