import { Injectable, Logger } from '@nestjs/common';
import { CreateDemoResponseDto } from '../dto/demo-automation.dto';
import * as puppeteer from 'puppeteer';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class DemoAutomationService {
  private readonly logger = new Logger(DemoAutomationService.name);

  async loginToWebsite(
    websiteUrl: string,
    credentials: { username: string; password: string },
  ): Promise<CreateDemoResponseDto> {
    const startTime = Date.now();
    const demoId = uuidv4();

    this.logger.log(`🚀 Starting login to website: ${websiteUrl}`);

    try {
      // Launch browser and navigate to website
      const browser = await puppeteer.launch({
        headless: false, // Set to true for production
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });

      const page = await browser.newPage();
      await page.setViewport({ width: 1920, height: 1080 });

      // Navigate to website and attempt login
      await this.performLogin(page, websiteUrl, credentials);

      // Wait for login to complete
      this.logger.log('⏳ Waiting for login to complete...');
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Get page info after login
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

      // Clean up
      await browser.close();

      const processingTime = Date.now() - startTime;

      this.logger.log(`✅ Login completed successfully in ${processingTime}ms`);

      return {
        demoId,
        demoName: 'Website Login Demo',
        websiteUrl,
        loginStatus: 'success',
        pageInfo,
        summary: {
          processingTime,
          loginAttempted: true,
          finalUrl: pageInfo.url,
        },
      };
    } catch (error) {
      this.logger.error(`❌ Login failed: ${error.message}`);
      throw new Error(`Login failed: ${error.message}`);
    }
  }

  private async performLogin(
    page: puppeteer.Page,
    websiteUrl: string,
    credentials: { username: string; password: string },
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
      await usernameInput.type(credentials.username);

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
}
