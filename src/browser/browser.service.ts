import { Injectable } from '@nestjs/common';
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
    scrapedData?: any; // Comprehensive scraped data
    timestamp: string;
  }>;
  totalPages: number;
  crawlTime: number;
}

@Injectable()
export class BrowserService {
  async loginAndExtractPage(
    websiteUrl: string,
    credentials: { username: string; password: string },
  ): Promise<LoginResult> {
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

      return {
        success: loginSuccess,
        finalUrl: page.url(),
        pageInfo,
        html,
      };
    } catch (error) {
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
            return true;
          } catch (error) {
            return true;
          }
        }
      } else {
        return false;
      }

      return false;
    } catch (error) {
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

  private async extractComprehensivePageData(page: Page) {
    return await page.evaluate(() => {
      // Extract all text content
      const bodyText = document.body.innerText;
      const bodyHTML = document.body.innerHTML;

      // Extract structured data
      const forms = Array.from(document.querySelectorAll('form')).map(
        (form) => ({
          action: form.action,
          method: form.method,
          inputs: Array.from(
            form.querySelectorAll('input, select, textarea'),
          ).map((input) => ({
            type:
              (input as HTMLInputElement).type || input.tagName.toLowerCase(),
            name: (input as HTMLInputElement).name,
            placeholder: (input as HTMLInputElement).placeholder,
            required: (input as HTMLInputElement).required,
            value: (input as HTMLInputElement).value,
          })),
        }),
      );

      // Extract all buttons with their text and attributes
      const buttons = Array.from(
        document.querySelectorAll('button, [role="button"]'),
      ).map((btn) => ({
        text: btn.textContent?.trim(),
        type: (btn as HTMLButtonElement).type,
        className: btn.className,
        id: btn.id,
        dataAttributes: Array.from(btn.attributes)
          .filter((attr) => attr.name.startsWith('data-'))
          .reduce((acc, attr) => ({ ...acc, [attr.name]: attr.value }), {}),
      }));

      // Extract all links with their destinations
      const links = Array.from(document.querySelectorAll('a')).map((link) => ({
        text: link.textContent?.trim(),
        href: link.href,
        target: link.target,
        className: link.className,
        id: link.id,
      }));

      // Extract images with their sources and alt text
      const images = Array.from(document.querySelectorAll('img')).map(
        (img) => ({
          src: img.src,
          alt: img.alt,
          width: img.width,
          height: img.height,
          className: img.className,
        }),
      );

      // Extract tables and their data
      const tables = Array.from(document.querySelectorAll('table')).map(
        (table) => ({
          headers: Array.from(table.querySelectorAll('th')).map((th) =>
            th.textContent?.trim(),
          ),
          rows: Array.from(table.querySelectorAll('tr')).map((tr) =>
            Array.from(tr.querySelectorAll('td, th')).map((cell) =>
              cell.textContent?.trim(),
            ),
          ),
        }),
      );

      // Extract navigation elements
      const navigation = {
        menus: Array.from(
          document.querySelectorAll('nav, [role="navigation"]'),
        ).map((nav) => ({
          text: nav.textContent?.trim(),
          links: Array.from(nav.querySelectorAll('a')).map((a) => ({
            text: a.textContent?.trim(),
            href: a.href,
          })),
        })),
        breadcrumbs: Array.from(
          document.querySelectorAll('[aria-label*="breadcrumb"], .breadcrumb'),
        ).map((bc) => ({
          text: bc.textContent?.trim(),
          links: Array.from(bc.querySelectorAll('a')).map((a) => ({
            text: a.textContent?.trim(),
            href: a.href,
          })),
        })),
      };

      // Extract meta information
      const meta = {
        description: document
          .querySelector('meta[name="description"]')
          ?.getAttribute('content'),
        keywords: document
          .querySelector('meta[name="keywords"]')
          ?.getAttribute('content'),
        author: document
          .querySelector('meta[name="author"]')
          ?.getAttribute('content'),
        viewport: document
          .querySelector('meta[name="viewport"]')
          ?.getAttribute('content'),
        robots: document
          .querySelector('meta[name="robots"]')
          ?.getAttribute('content'),
      };

      // Extract structured data (JSON-LD, microdata, etc.)
      const structuredData = {
        jsonLd: Array.from(
          document.querySelectorAll('script[type="application/ld+json"]'),
        )
          .map((script) => {
            try {
              return JSON.parse(script.textContent || '');
            } catch {
              return null;
            }
          })
          .filter(Boolean),
        microdata: Array.from(document.querySelectorAll('[itemscope]')).map(
          (item) => ({
            type: item.getAttribute('itemtype'),
            properties: Array.from(item.querySelectorAll('[itemprop]')).map(
              (prop) => ({
                name: prop.getAttribute('itemprop'),
                value: prop.textContent?.trim() || prop.getAttribute('content'),
              }),
            ),
          }),
        ),
      };

      // Extract headings hierarchy
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
        h4: Array.from(document.querySelectorAll('h4')).map((h) =>
          h.textContent?.trim(),
        ),
        h5: Array.from(document.querySelectorAll('h5')).map((h) =>
          h.textContent?.trim(),
        ),
        h6: Array.from(document.querySelectorAll('h6')).map((h) =>
          h.textContent?.trim(),
        ),
      };

      // Extract lists
      const lists = {
        ordered: Array.from(document.querySelectorAll('ol')).map((ol) =>
          Array.from(ol.querySelectorAll('li')).map((li) =>
            li.textContent?.trim(),
          ),
        ),
        unordered: Array.from(document.querySelectorAll('ul')).map((ul) =>
          Array.from(ul.querySelectorAll('li')).map((li) =>
            li.textContent?.trim(),
          ),
        ),
      };

      // Extract cards, sections, and content blocks
      const contentBlocks = Array.from(
        document.querySelectorAll(
          '.card, .section, .block, [class*="content"], [class*="panel"]',
        ),
      ).map((block) => ({
        tagName: block.tagName.toLowerCase(),
        className: block.className,
        text: block.textContent?.trim().substring(0, 200),
        children: block.children.length,
      }));

      // Extract React/Vue/Angular specific elements
      const frameworkElements = {
        reactComponents: Array.from(
          document.querySelectorAll('[data-reactroot], [data-react-helmet]'),
        ),
        vueElements: Array.from(document.querySelectorAll('[data-v-]')),
        angularElements: Array.from(
          document.querySelectorAll('[ng-], [data-ng-]'),
        ),
      };

      return {
        // Basic page info
        title: document.title,
        url: window.location.href,
        bodyText: bodyText,
        bodyHTML: bodyHTML,

        // Element counts
        totalElements: document.querySelectorAll('*').length,
        buttons: buttons.length,
        links: links.length,
        inputs: document.querySelectorAll('input').length,
        images: images.length,
        forms: forms.length,
        tables: tables.length,

        // Extracted data
        formsData: forms,
        buttonsData: buttons,
        linksData: links,
        imagesData: images,
        tablesData: tables,
        navigationData: navigation,
        metaData: meta,
        structuredData,
        headingsData: headings,
        listsData: lists,
        contentBlocksData: contentBlocks,
        frameworkElements,

        // Content analysis
        wordCount: bodyText.split(/\s+/).length,
        characterCount: bodyText.length,
        hasLoginForm: forms.some((form) =>
          form.inputs.some(
            (input) =>
              input.type === 'password' ||
              input.name?.toLowerCase().includes('password') ||
              input.name?.toLowerCase().includes('email'),
          ),
        ),
        hasSearchForm: forms.some((form) =>
          form.inputs.some(
            (input) =>
              input.type === 'search' ||
              input.name?.toLowerCase().includes('search') ||
              input.placeholder?.toLowerCase().includes('search'),
          ),
        ),
        hasContactInfo:
          bodyText.toLowerCase().includes('contact') ||
          bodyText.toLowerCase().includes('email') ||
          bodyText.toLowerCase().includes('phone'),
        hasPricing:
          bodyText.toLowerCase().includes('price') ||
          bodyText.toLowerCase().includes('cost') ||
          bodyText.toLowerCase().includes('$'),
        hasSocialMedia:
          Array.from(
            document.querySelectorAll(
              'a[href*="facebook"], a[href*="twitter"], a[href*="linkedin"], a[href*="instagram"]',
            ),
          ).length > 0,
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
      } else {
      }

      // Wait for page to stabilize
      await page.waitForTimeout(3000);

      // For React apps, try to interact with the page to reveal more content
      await this.interactWithReactApp(page);

      // Process the current page first
      const currentUrl = page.url();

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

      return {
        success: true,
        pages: crawledPages,
        totalPages: crawledPages.length,
        crawlTime,
      };
    } catch (error) {
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
      // Extract comprehensive page data (scraping)
      const scrapedData = await this.extractComprehensivePageData(page);
      const html = await page.content();

      crawledPages.push({
        url: currentUrl,
        title: scrapedData.title,
        html,
        pageInfo: {
          title: scrapedData.title,
          url: scrapedData.url,
          bodyText: scrapedData.bodyText.substring(0, 1000),
          totalElements: scrapedData.totalElements,
          buttons: scrapedData.buttons,
          links: scrapedData.links,
          inputs: scrapedData.inputs,
        },
        scrapedData, // Add comprehensive scraped data
        timestamp: new Date().toISOString(),
      });

      // DEEP INTERACTIVE SCRAPING - Click on ALL interactive elements
      await this.performDeepInteractiveScraping(
        page,
        baseUrl,
        visitedUrls,
        crawledPages,
        maxPages,
        depth,
      );
    } catch (error) {}
  }

  private async performDeepInteractiveScraping(
    page: Page,
    baseUrl: string,
    visitedUrls: Set<string>,
    crawledPages: CrawlResult['pages'],
    maxPages: number,
    depth: number,
  ): Promise<void> {
    try {
      // Get all interactive elements
      const interactiveElements = await page.evaluate(() => {
        const elements = [];

        // 1. All clickable elements
        const clickableSelectors = [
          'button',
          '[role="button"]',
          '[onclick]',
          '[class*="button"]',
          '[class*="btn"]',
          'a',
          '[role="link"]',
          '[class*="link"]',
          '[class*="nav"]',
          '[data-testid*="button"]',
          '[data-testid*="link"]',
          '[data-testid*="nav"]',
          '[class*="clickable"]',
          '[class*="interactive"]',
          '[class*="action"]',
          'input[type="button"]',
          'input[type="submit"]',
          'input[type="reset"]',
          '[tabindex]',
          '[aria-expanded]',
          '[aria-haspopup]',
        ];

        clickableSelectors.forEach((selector) => {
          const found = document.querySelectorAll(selector);
          found.forEach((el) => {
            if ((el as HTMLElement).offsetParent !== null) {
              // Only visible elements
              elements.push({
                tagName: el.tagName.toLowerCase(),
                className: el.className,
                id: el.id,
                text: el.textContent?.trim().substring(0, 50),
                selector: selector,
                href: el.getAttribute('href'),
                onclick: el.getAttribute('onclick'),
                role: el.getAttribute('role'),
                dataTestId: el.getAttribute('data-testid'),
                dataAttributes: Array.from(el.attributes)
                  .filter((attr) => attr.name.startsWith('data-'))
                  .reduce(
                    (acc, attr) => ({ ...acc, [attr.name]: attr.value }),
                    {},
                  ),
              });
            }
          });
        });

        return elements;
      });

      // Test each interactive element
      for (
        let i = 0;
        i < interactiveElements.length && crawledPages.length < maxPages;
        i++
      ) {
        const element = interactiveElements[i];

        try {
          // Try to click the element
          const beforeUrl = page.url();
          const beforeTitle = await page.title();

          // Find the element and click it
          const elementFound = await this.findAndClickElement(page, element);

          if (elementFound) {
            // Wait for potential navigation or content change
            await page.waitForTimeout(2000);

            const afterUrl = page.url();
            const afterTitle = await page.title();

            // Check if we navigated to a new page or content changed
            if (afterUrl !== beforeUrl || afterTitle !== beforeTitle) {
              // Check if this is a new page we haven't visited
              if (
                !visitedUrls.has(afterUrl) &&
                this.isInternalUrl(afterUrl, baseUrl)
              ) {
                // Recursively crawl this new page
                await this.crawlPageRecursively(
                  page,
                  baseUrl,
                  visitedUrls,
                  crawledPages,
                  maxPages,
                  depth + 1,
                );
              } else {
                // Go back to continue testing other elements
                if (afterUrl !== beforeUrl) {
                  await page.goBack();
                  await page.waitForTimeout(1000);
                }
              }
            } else {
              // Even if no navigation, the content might have changed
              // Check if we should scrape this "new" state
              const currentUrl = page.url();
              if (!visitedUrls.has(currentUrl + '#interacted')) {
                visitedUrls.add(currentUrl + '#interacted');

                // Scrape the potentially changed content
                const scrapedData =
                  await this.extractComprehensivePageData(page);
                const html = await page.content();

                crawledPages.push({
                  url: currentUrl + '#interacted',
                  title: scrapedData.title + ' (interacted)',
                  html,
                  pageInfo: {
                    title: scrapedData.title,
                    url: scrapedData.url,
                    bodyText: scrapedData.bodyText.substring(0, 1000),
                    totalElements: scrapedData.totalElements,
                    buttons: scrapedData.buttons,
                    links: scrapedData.links,
                    inputs: scrapedData.inputs,
                  },
                  scrapedData,
                  timestamp: new Date().toISOString(),
                });
              }
            }
          }
        } catch (error) {
          continue;
        }
      }
    } catch (error) {}
  }

  private async findAndClickElement(
    page: Page,
    element: any,
  ): Promise<boolean> {
    try {
      // Try multiple strategies to find and click the element
      const strategies = [
        // Strategy 1: By exact selector
        `[data-testid="${element.dataTestId}"]`,
        // Strategy 2: By ID
        element.id ? `#${element.id}` : null,
        // Strategy 3: By class and text
        element.className ? `.${element.className.split(' ')[0]}` : null,
        // Strategy 4: By tag and text content
        `${element.tagName}:has-text("${element.text}")`,
        // Strategy 5: By role
        element.role ? `[role="${element.role}"]` : null,
        // Strategy 6: By href
        element.href ? `a[href="${element.href}"]` : null,
      ].filter(Boolean);

      for (const selector of strategies) {
        try {
          const elementHandle = await page.$(selector);
          if (elementHandle) {
            await elementHandle.click();
            return true;
          }
        } catch (e) {
          continue;
        }
      }

      // Fallback: Try to click by coordinates if element is visible
      const elementInfo = await page.evaluate((el) => {
        const elements = document.querySelectorAll(el.selector);
        for (const elem of elements) {
          if (elem.textContent?.trim() === el.text) {
            const rect = elem.getBoundingClientRect();
            return {
              x: rect.left + rect.width / 2,
              y: rect.top + rect.height / 2,
              visible: rect.width > 0 && rect.height > 0,
            };
          }
        }
        return null;
      }, element);

      if (elementInfo && elementInfo.visible) {
        await page.mouse.click(elementInfo.x, elementInfo.y);
        return true;
      }

      return false;
    } catch (error) {
      return false;
    }
  }

  private async interactWithReactApp(page: Page): Promise<void> {
    try {
      // 1. Try to click on common navigation elements
      const navSelectors = [
        'nav a',
        'nav button',
        '[role="navigation"] a',
        '[role="navigation"] button',
        '.navbar a',
        '.navbar button',
        '.nav a',
        '.nav button',
        '.menu a',
        '.menu button',
        '.sidebar a',
        '.sidebar button',
      ];

      for (const selector of navSelectors) {
        try {
          const elements = await page.$$(selector);
          for (const element of elements.slice(0, 3)) {
            // Limit to first 3 elements
            try {
              await element.click();
              await page.waitForTimeout(1000);
              // Go back to original state
              await page.goBack();
              await page.waitForTimeout(1000);
            } catch (e) {
              // Ignore click errors
            }
          }
        } catch (e) {
          // Ignore selector errors
        }
      }

      // 2. Try to open dropdowns and menus
      const dropdownSelectors = [
        '[data-testid*="dropdown"]',
        '[data-testid*="menu"]',
        '.dropdown-toggle',
        '.menu-toggle',
        '[aria-haspopup="true"]',
      ];

      for (const selector of dropdownSelectors) {
        try {
          const element = await page.$(selector);
          if (element) {
            await element.click();
            await page.waitForTimeout(1000);
            // Click elsewhere to close
            await page.click('body');
            await page.waitForTimeout(500);
          }
        } catch (e) {
          // Ignore errors
        }
      }

      // 3. Scroll to trigger lazy loading
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
      await page.waitForTimeout(2000);

      await page.evaluate(() => {
        window.scrollTo(0, 0);
      });
      await page.waitForTimeout(1000);

      // 4. Try to trigger any modals or overlays
      const modalTriggers = [
        '[data-testid*="modal"]',
        '[data-testid*="overlay"]',
        '.modal-trigger',
        '.overlay-trigger',
      ];

      for (const selector of modalTriggers) {
        try {
          const element = await page.$(selector);
          if (element) {
            await element.click();
            await page.waitForTimeout(1000);
            // Press Escape to close modal
            await page.keyboard.press('Escape');
            await page.waitForTimeout(500);
          }
        } catch (e) {
          // Ignore errors
        }
      }
    } catch (error) {}
  }

  private isInternalUrl(url: string, baseUrl: string): boolean {
    try {
      const urlObj = new URL(url);
      const baseUrlObj = new URL(baseUrl);

      // Check if same hostname
      const isSameHost = urlObj.hostname === baseUrlObj.hostname;

      // Also check if URL starts with base URL (for subdirectories)
      const startsWithBase = url.startsWith(baseUrl);

      return isSameHost || startsWithBase;
    } catch (error) {
      return false;
    }
  }
}
