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
        headless: false, // Set to false for debugging
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });

      const page = await browser.newPage();
      await page.setViewport({ width: 1920, height: 1080 });

      // Navigate to website and login
      console.log(`Navigating to: ${websiteUrl}`);
      try {
        await page.goto(websiteUrl, {
          waitUntil: 'domcontentloaded', // Changed from networkidle0 for faster loading
          timeout: 30000,
        });
        console.log(`Successfully loaded: ${websiteUrl}`);
      } catch (error) {
        console.log(`Navigation failed for ${websiteUrl}:`, error.message);
        throw new Error(
          `Failed to navigate to ${websiteUrl}: ${error.message}`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Perform login
      const loginSuccess = await this.performLogin(page, credentials);

      if (!loginSuccess) {
        throw new Error('Login failed');
      }

      // Wait for login to complete
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Start deep scraping with session persistence
      await this.deepScrapeWithSession(
        page,
        websiteUrl,
        visitedUrls,
        scrapedPages,
        100, // Max pages
        0, // Current depth
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
      // Wait for page to load completely
      await new Promise((resolve) => setTimeout(resolve, 2000));

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
          if (loginForm) break;
        } catch {}
      }

      // If no form found, try to find input fields directly
      if (!loginForm) {
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
          console.log('No username field found');
          return false;
        }

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
          console.log('No password field found');
          return false;
        }

        // Clear and fill credentials
        await usernameField.click({ clickCount: 3 }); // Select all text
        await usernameField.type(credentials.username);
        await passwordField.click({ clickCount: 3 }); // Select all text
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
          console.log('No login button found');
          return false;
        }

        // Click login button
        await loginButton.click();
      } else {
        // If we found a form, try to fill it
        const usernameField = await loginForm.$(
          'input[type="email"], input[name="email"], input[name="username"], input[name="user"], input[type="text"]',
        );
        const passwordField = await loginForm.$('input[type="password"]');

        if (usernameField && passwordField) {
          await usernameField.click({ clickCount: 3 }); // Select all text
          await usernameField.type(credentials.username);
          await passwordField.click({ clickCount: 3 }); // Select all text
          await passwordField.type(credentials.password);

          const submitButton = await loginForm.$(
            'button[type="submit"], input[type="submit"], button',
          );
          if (submitButton) {
            await submitButton.click();
          }
        }
      }

      // Wait for login to process
      await new Promise((resolve) => setTimeout(resolve, 5000));

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
        console.log('Login failure detected');
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

      return hasSuccessIndicator || isNotOnLoginPage;
    } catch (error) {
      console.log('Login error:', error.message);
      return false;
    }
  }

  private async deepScrapeWithSession(
    page: Page,
    baseUrl: string,
    visitedUrls: Set<string>,
    scrapedPages: any[],
    maxPages: number,
    depth: number,
  ): Promise<void> {
    if (scrapedPages.length >= maxPages || depth > 10) {
      return;
    }

    const currentUrl = page.url();

    // Skip if already visited
    if (visitedUrls.has(currentUrl)) {
      return;
    }

    // Check if URL is internal
    if (!this.isInternalUrl(currentUrl, baseUrl)) {
      return;
    }

    visitedUrls.add(currentUrl);

    try {
      // Extract comprehensive page data
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

      // Process each link
      for (const link of links) {
        if (scrapedPages.length >= maxPages) break;

        if (link.href && this.isInternalUrl(link.href, baseUrl)) {
          const fullUrl = this.resolveUrl(link.href, baseUrl);

          if (!visitedUrls.has(fullUrl)) {
            try {
              // Navigate to the link while maintaining session
              console.log(`Navigating to link: ${fullUrl}`);
              await page.goto(fullUrl, {
                waitUntil: 'domcontentloaded', // Changed from networkidle0 for faster loading
                timeout: 30000,
              });
              console.log(`Successfully loaded link: ${fullUrl}`);
              await new Promise((resolve) => setTimeout(resolve, 2000));

              // Recursively scrape the new page
              await this.deepScrapeWithSession(
                page,
                baseUrl,
                visitedUrls,
                scrapedPages,
                maxPages,
                depth + 1,
              );
            } catch (error) {
              // Continue with other links if this one fails
              console.log(
                `Failed to navigate to link ${fullUrl}:`,
                error.message,
              );
              continue;
            }
          }
        }
      }
    } catch (error) {
      // Continue scraping other pages if this one fails
    }
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
