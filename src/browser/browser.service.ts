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

export interface CrawlResult {
  success: boolean;
  pages: Array<{
    url: string;
    title: string;
    html: string;
    pageInfo: {
      title: string;
      url: string;
      bodyText: string;
      totalElements: number;
      buttons: number;
      links: number;
      inputs: number;
    };
    timestamp: string;
  }>;
  totalPages: number;
  crawlTime: number;
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

  async crawlCompleteApp(
    websiteUrl: string,
    credentials: { username: string; password: string },
    maxPages: number = 50,
  ): Promise<CrawlResult> {
    const startTime = Date.now();
    this.logger.log(`🕷️ Starting comprehensive app crawl for: ${websiteUrl}`);

    let browser: Browser | null = null;
    const visitedUrls = new Set<string>();
    const crawledPages: CrawlResult['pages'] = [];

    try {
      // Launch browser
      browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });

      const page = await browser.newPage();
      await page.setViewportSize({ width: 1920, height: 1080 });

      // Navigate to website and login
      await page.goto(websiteUrl, { waitUntil: 'networkidle' });
      await page.waitForTimeout(2000);

      // Perform login
      const loginSuccess = await this.performLogin(page, credentials);
      if (loginSuccess) {
        this.logger.log('✅ Login successful, starting app crawl');
      } else {
        this.logger.log('⚠️ Login failed, proceeding with public pages only');
      }

      // Wait for page to stabilize
      await page.waitForTimeout(3000);

      // Process the current page first
      const currentUrl = page.url();
      this.logger.log(`🔍 Processing initial page: ${currentUrl}`);

      // Extract page information
      const pageInfo = await this.extractPageInfo(page);
      const html = await page.content();

      crawledPages.push({
        url: currentUrl,
        title: pageInfo.title,
        html,
        pageInfo,
        timestamp: new Date().toISOString(),
      });

      visitedUrls.add(currentUrl);

      // Now start crawling from the current page
      await this.crawlPageRecursively(
        page,
        websiteUrl,
        visitedUrls,
        crawledPages,
        maxPages,
        0,
      );

      const crawlTime = Date.now() - startTime;

      this.logger.log(
        `✅ App crawl completed: ${crawledPages.length} pages in ${crawlTime}ms`,
      );

      return {
        success: true,
        pages: crawledPages,
        totalPages: crawledPages.length,
        crawlTime,
      };
    } catch (error) {
      this.logger.error(`❌ App crawl failed: ${error.message}`);
      throw new Error(`App crawl failed: ${error.message}`);
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  private async crawlPageRecursively(
    page: Page,
    baseUrl: string,
    visitedUrls: Set<string>,
    crawledPages: CrawlResult['pages'],
    maxPages: number,
    depth: number,
  ): Promise<void> {
    if (crawledPages.length >= maxPages || depth > 5) {
      this.logger.log(
        `🛑 Stopping crawl: maxPages=${maxPages}, depth=${depth}`,
      );
      return;
    }

    const currentUrl = page.url();
    this.logger.log(`🔍 Processing page: ${currentUrl} (depth: ${depth})`);

    // Skip if already visited
    if (visitedUrls.has(currentUrl)) {
      this.logger.log(`⏭️ Skipping already visited: ${currentUrl}`);
      return;
    }

    // Check if URL is internal
    if (!this.isInternalUrl(currentUrl, baseUrl)) {
      this.logger.log(`🚫 Skipping external URL: ${currentUrl}`);
      return;
    }

    visitedUrls.add(currentUrl);

    try {
      // Extract page information
      const pageInfo = await this.extractPageInfo(page);
      const html = await page.content();

      crawledPages.push({
        url: currentUrl,
        title: pageInfo.title,
        html,
        pageInfo,
        timestamp: new Date().toISOString(),
      });

      this.logger.log(
        `✅ Crawled page ${crawledPages.length}: ${pageInfo.title}`,
      );

      // Find all internal links on the page
      const links = await page.evaluate((baseUrl) => {
        const linkElements = Array.from(document.querySelectorAll('a[href]'));
        const foundLinks = linkElements
          .map((link) => {
            const href = link.getAttribute('href');
            if (!href) return null;

            try {
              // Convert relative URLs to absolute
              const url = new URL(href, baseUrl).href;
              return url;
            } catch {
              return null;
            }
          })
          .filter((url) => url && url.startsWith(baseUrl))
          .slice(0, 20); // Limit to 20 links per page to avoid infinite loops

        console.log(`Found ${foundLinks.length} internal links on page`);
        return foundLinks;
      }, baseUrl);

      this.logger.log(`🔗 Found ${links.length} internal links to crawl`);

      // Crawl found links
      for (const linkUrl of links) {
        if (crawledPages.length >= maxPages) {
          this.logger.log(`🛑 Reached max pages limit: ${maxPages}`);
          break;
        }

        if (visitedUrls.has(linkUrl)) {
          this.logger.log(`⏭️ Already visited: ${linkUrl}`);
          continue;
        }

        this.logger.log(`🌐 Navigating to: ${linkUrl}`);

        try {
          await page.goto(linkUrl, {
            waitUntil: 'networkidle',
            timeout: 15000,
          });
          await page.waitForTimeout(2000); // Wait for dynamic content

          await this.crawlPageRecursively(
            page,
            baseUrl,
            visitedUrls,
            crawledPages,
            maxPages,
            depth + 1,
          );
        } catch (error) {
          this.logger.warn(`⚠️ Failed to crawl ${linkUrl}: ${error.message}`);
          continue;
        }
      }
    } catch (error) {
      this.logger.warn(
        `⚠️ Failed to process page ${currentUrl}: ${error.message}`,
      );
    }
  }

  private isInternalUrl(url: string, baseUrl: string): boolean {
    try {
      const urlObj = new URL(url);
      const baseUrlObj = new URL(baseUrl);

      // Check if same hostname
      const isSameHost = urlObj.hostname === baseUrlObj.hostname;

      // Also check if URL starts with base URL (for subdirectories)
      const startsWithBase = url.startsWith(baseUrl);

      this.logger.log(
        `🔍 URL check: ${url} - Same host: ${isSameHost}, Starts with base: ${startsWithBase}`,
      );

      return isSameHost || startsWithBase;
    } catch (error) {
      this.logger.warn(`⚠️ URL parsing error: ${url} - ${error.message}`);
      return false;
    }
  }
}
