import { Injectable, Logger } from '@nestjs/common';
import { chromium, Browser, Page } from 'playwright';

export interface LoginResult {
  success: boolean;
  finalUrl: string;
  pageInfo: {
    title: string;
    url: string;
    bodyText: string;
    totalElements: number;
    buttons: number;
    links: number;
    inputs: number;
  };
  html: string;
}

@Injectable()
export class BrowserService {
  private readonly logger = new Logger(BrowserService.name);

  async loginAndExtractPage(
    websiteUrl: string,
    credentials: { username: string; password: string },
  ): Promise<LoginResult> {
    this.logger.log(`🌐 Starting browser automation for: ${websiteUrl}`);

    let browser: Browser | null = null;

    try {
      // Launch browser
      browser = await chromium.launch({
        headless: true, // Set to false for debugging
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });

      const page = await browser.newPage();
      await page.setViewportSize({ width: 1920, height: 1080 });

      // Navigate to website
      await page.goto(websiteUrl, { waitUntil: 'networkidle' });
      await page.waitForTimeout(2000);

      // Attempt login
      const loginSuccess = await this.performLogin(page, credentials);

      // Wait for page to stabilize after login
      await page.waitForTimeout(3000);

      // Extract page information
      const pageInfo = await this.extractPageInfo(page);
      const html = await page.content();

      this.logger.log(`✅ Browser automation completed successfully`);

      return {
        success: loginSuccess,
        finalUrl: page.url(),
        pageInfo,
        html,
      };
    } catch (error) {
      this.logger.error(`❌ Browser automation failed: ${error.message}`);
      throw new Error(`Browser automation failed: ${error.message}`);
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
    this.logger.log('🔐 Attempting to find and fill login form...');

    try {
      // Common selectors for username/email fields
      const usernameSelectors = [
        'input[type="email"]',
        'input[name="email"]',
        'input[name="username"]',
        'input[name="user"]',
        'input[type="text"]',
        'input[placeholder*="email" i]',
        'input[placeholder*="username" i]',
        'input[placeholder*="user" i]',
        '#email',
        '#username',
        '#user',
      ];

      // Common selectors for password fields
      const passwordSelectors = [
        'input[type="password"]',
        'input[name="password"]',
        '#password',
      ];

      // Find username field
      let usernameField = null;
      for (const selector of usernameSelectors) {
        try {
          usernameField = await page.$(selector);
          if (usernameField) {
            this.logger.log(`Found username field: ${selector}`);
            break;
          }
        } catch (e) {
          continue;
        }
      }

      // Find password field
      let passwordField = null;
      for (const selector of passwordSelectors) {
        try {
          passwordField = await page.$(selector);
          if (passwordField) {
            this.logger.log(`Found password field: ${selector}`);
            break;
          }
        } catch (e) {
          continue;
        }
      }

      if (usernameField && passwordField) {
        // Fill credentials
        await usernameField.fill(credentials.username);
        await passwordField.fill(credentials.password);

        // Find and click submit button
        const submitSelectors = [
          'button[type="submit"]',
          'input[type="submit"]',
          'button:has-text("Login")',
          'button:has-text("Sign In")',
          'button:has-text("Log In")',
          'button:has-text("Submit")',
          '.login-button',
          '.submit-button',
        ];

        let submitted = false;
        for (const selector of submitSelectors) {
          try {
            const submitButton = await page.$(selector);
            if (submitButton) {
              await submitButton.click();
              submitted = true;
              this.logger.log(`Clicked submit button: ${selector}`);
              break;
            }
          } catch (e) {
            continue;
          }
        }

        if (submitted) {
          // Wait for navigation or login completion
          try {
            await Promise.race([
              page.waitForNavigation({
                waitUntil: 'networkidle',
                timeout: 10000,
              }),
              page.waitForTimeout(5000),
            ]);
            this.logger.log('✅ Login form submitted successfully');
            return true;
          } catch (error) {
            this.logger.log(
              '⚠️ No navigation detected, but form was submitted',
            );
            return true;
          }
        }
      } else {
        this.logger.log(
          '⚠️ No login form found, proceeding without authentication',
        );
        return false;
      }

      return false;
    } catch (error) {
      this.logger.error(`Login attempt failed: ${error.message}`);
      return false;
    }
  }

  private async extractPageInfo(page: Page) {
    return await page.evaluate(() => {
      return {
        title: document.title,
        url: window.location.href,
        bodyText: document.body.innerText.substring(0, 1000),
        totalElements: document.querySelectorAll('*').length,
        buttons: document.querySelectorAll('button').length,
        links: document.querySelectorAll('a').length,
        inputs: document.querySelectorAll('input').length,
      };
    });
  }

  async takeScreenshot(page: Page, path: string): Promise<void> {
    await page.screenshot({ path, fullPage: true });
  }

  async getPageContent(page: Page): Promise<string> {
    return await page.content();
  }
}
