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
        args: [
          '--no-sandbox', 
          '--disable-setuid-sandbox',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor'
        ],
        defaultViewport: null,
      });

      const page = await browser.newPage();
      await page.setViewport({ width: 1920, height: 1080 });
      
      // Set user agent to avoid detection
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
      
      // Enable request interception to handle cookies and sessions
      await page.setRequestInterception(true);
      page.on('request', (request) => {
        // Allow all requests but add headers for session persistence
        request.continue();
      });

      // Navigate to website and login
      try {
        await page.goto(websiteUrl, {
          waitUntil: 'networkidle2', // Wait until network is idle for dynamic content
          timeout: 30000,
        });
        
        // Wait additional time for any remaining dynamic content to load
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Wait for any specific elements that might indicate page is fully loaded
        try {
          await page.waitForFunction(() => {
            return document.readyState === 'complete';
          }, { timeout: 5000 });
        } catch (error) {
          // If specific wait fails, continue anyway
          console.log('Page ready state wait timeout, continuing...');
        }
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
        
        // Save cookies after successful login for session persistence
        const cookies = await page.cookies();
        console.log(`🍪 Saved ${cookies.length} cookies after login`);
      }

      // Start recursive scraping with queue-based approach
      await this.recursiveScrapeAllLinks(
        page,
        websiteUrl,
        visitedUrls,
        scrapedPages,
        credentials,
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

  private extractLinksFromHTML(html: string, currentUrl: string): Array<{href: string, text: string}> {
    try {
      // Use regex to find all anchor tags with href attributes
      const linkRegex = /<a[^>]+href\s*=\s*["']([^"']+)["'][^>]*>([^<]*)<\/a>/gi;
      const links: Array<{href: string, text: string}> = [];
      
      let match;
      while ((match = linkRegex.exec(html)) !== null) {
        const href = match[1];
        const text = match[2].replace(/<[^>]*>/g, '').trim(); // Remove any HTML tags from link text
        
        if (href && href.trim()) {
          links.push({
            href: href.trim(),
            text: text || ''
          });
        }
      }
      
      // Also look for href attributes that might not be in full anchor tags
      const hrefOnlyRegex = /href\s*=\s*["']([^"']+)["']/gi;
      const hrefMatches = new Set<string>();
      
      let hrefMatch;
      while ((hrefMatch = hrefOnlyRegex.exec(html)) !== null) {
        const href = hrefMatch[1].trim();
        if (href && !href.startsWith('#') && !href.startsWith('javascript:') && !href.startsWith('mailto:') && !href.startsWith('tel:')) {
          hrefMatches.add(href);
        }
      }
      
      // Add any additional href-only links that weren't captured by the full anchor regex
      hrefMatches.forEach(href => {
        if (!links.some(link => link.href === href)) {
          links.push({
            href,
            text: ''
          });
        }
      });
      
      // Filter out non-HTML resources and unwanted file types
      const filteredLinks = this.filterUsefulLinks(links, currentUrl);
      
      console.log(`📊 HTML Link Extraction Results:`);
      console.log(`  - Found ${links.length} total links in HTML`);
      console.log(`  - Found ${hrefMatches.size} unique href attributes`);
      console.log(`  - Filtered to ${filteredLinks.length} useful links`);
      
      return filteredLinks;
    } catch (error) {
      console.error(`❌ Error extracting links from HTML: ${error.message}`);
      return [];
    }
  }

  /**
   * Filter links to only include useful HTML pages and exclude resources like CSS, JS, images, etc.
   */
  private filterUsefulLinks(links: Array<{href: string, text: string}>, currentUrl: string): Array<{href: string, text: string}> {
    const filteredLinks: Array<{href: string, text: string}> = [];
    
    // File extensions and patterns to exclude
    const excludePatterns = [
      // Static resource extensions
      /\.(css|js|json|xml|txt|pdf|doc|docx|xls|xlsx|ppt|pptx|zip|rar|7z|tar|gz)$/i,
      /\.(jpg|jpeg|png|gif|svg|webp|ico|bmp|tiff|tif)$/i,
      /\.(mp4|avi|mov|wmv|flv|webm|mkv|mp3|wav|ogg|flac|aac)$/i,
      /\.(woff|woff2|ttf|otf|eot)$/i,
      
      // API endpoints and data sources
      /\/api\//i,
      /\/data\//i,
      /\/assets\//i,
      /\/static\//i,
      /\/media\//i,
      /\/uploads\//i,
      /\/files\//i,
      
      // Common non-page paths
      /\/admin\//i,
      /\/login\//i,
      /\/logout\//i,
      /\/register\//i,
      /\/signup\//i,
      /\/signin\//i,
      /\/auth\//i,
      
      // Query parameters that indicate non-HTML content
      /\?.*format=(json|xml|csv|pdf)/i,
      /\?.*download=true/i,
      /\?.*action=(download|export|print)/i,
    ];
    
    // Keywords in URLs that indicate non-HTML content
    const excludeKeywords = [
      'download',
      'export',
      'print',
      'preview',
      'thumbnail',
      'embed',
      'widget',
      'iframe',
      'popup',
      'modal',
      'ajax',
      'xhr',
      'api',
      'service',
      'endpoint',
    ];
    
    let excludedCount = 0;
    let excludedByExtension = 0;
    let excludedByPattern = 0;
    let excludedByKeyword = 0;
    
    for (const link of links) {
      const href = link.href.toLowerCase();
      let shouldExclude = false;
      let exclusionReason = '';
      
      // Check file extensions
      for (const pattern of excludePatterns) {
        if (pattern.test(href)) {
          shouldExclude = true;
          exclusionReason = 'file extension';
          excludedByExtension++;
          break;
        }
      }
      
      // Check keywords in URL
      if (!shouldExclude) {
        for (const keyword of excludeKeywords) {
          if (href.includes(keyword)) {
            shouldExclude = true;
            exclusionReason = 'keyword';
            excludedByKeyword++;
            break;
          }
        }
      }
      
      // Additional checks for common non-HTML patterns
      if (!shouldExclude) {
        // Check for data URLs
        if (href.startsWith('data:')) {
          shouldExclude = true;
          exclusionReason = 'data URL';
        }
        // Check for blob URLs
        else if (href.startsWith('blob:')) {
          shouldExclude = true;
          exclusionReason = 'blob URL';
        }
        // Check for very short URLs (likely not pages)
        else if (href.length < 10 && !href.includes('/')) {
          shouldExclude = true;
          exclusionReason = 'too short';
        }
      }
      
      if (shouldExclude) {
        excludedCount++;
        console.log(`  ❌ Excluded link (${exclusionReason}): ${link.href}`);
      } else {
        filteredLinks.push(link);
        console.log(`  ✅ Included link: ${link.href}`);
      }
    }
    
    console.log(`📊 Link Filtering Summary:`);
    console.log(`  - Total links: ${links.length}`);
    console.log(`  - Excluded by extension: ${excludedByExtension}`);
    console.log(`  - Excluded by keyword: ${excludedByKeyword}`);
    console.log(`  - Total excluded: ${excludedCount}`);
    console.log(`  - Useful links remaining: ${filteredLinks.length}`);
    
    return filteredLinks;
  }

  /**
   * Calculate priority score for a URL (higher = more important)
   */
  private calculateUrlPriority(url: string, linkText: string): number {
    const urlLower = url.toLowerCase();
    const textLower = linkText.toLowerCase();
    let priority = 1; // Base priority
    
    // High priority indicators
    const highPriorityPatterns = [
      /\/home/i,
      /\/index/i,
      /\/main/i,
      /\/dashboard/i,
      /\/products/i,
      /\/services/i,
      /\/about/i,
      /\/contact/i,
      /\/help/i,
      /\/support/i,
      /\/documentation/i,
      /\/guide/i,
      /\/tutorial/i,
    ];
    
    const highPriorityKeywords = [
      'home', 'main', 'index', 'dashboard', 'products', 'services',
      'about', 'contact', 'help', 'support', 'documentation', 'guide',
      'tutorial', 'overview', 'introduction', 'getting started'
    ];
    
    // Check URL patterns
    for (const pattern of highPriorityPatterns) {
      if (pattern.test(urlLower)) {
        priority += 3;
        break;
      }
    }
    
    // Check link text keywords
    for (const keyword of highPriorityKeywords) {
      if (textLower.includes(keyword)) {
        priority += 2;
        break;
      }
    }
    
    // Penalize certain patterns
    const lowPriorityPatterns = [
      /\/tag\//i,
      /\/category\//i,
      /\/author\//i,
      /\/date\//i,
      /\/page\//i,
      /\/search\//i,
      /\/filter\//i,
      /\?.*page=/i,
      /\?.*sort=/i,
    ];
    
    for (const pattern of lowPriorityPatterns) {
      if (pattern.test(urlLower)) {
        priority -= 1;
      }
    }
    
    // Ensure minimum priority of 1 if it's a valid page
    return Math.max(1, priority);
  }

  /**
   * Insert URL into queue based on priority (higher priority URLs first)
   */
  private insertUrlByPriority(urlQueue: string[], url: string, priority: number): void {
    // For simplicity, we'll just add to the end for now
    // In a more sophisticated implementation, you could maintain a priority queue
    urlQueue.push(url);
  }

  private async restoreSessionCookies(page: Page, baseUrl: string): Promise<void> {
    try {
      // Get cookies from the current domain
      const cookies = await page.cookies();
      console.log(`🍪 Restoring ${cookies.length} session cookies`);
      
      // Set cookies for the current domain
      await page.setCookie(...cookies);
      console.log('✅ Session cookies restored');
    } catch (error) {
      console.log(`❌ Error restoring cookies: ${error.message}`);
    }
  }

  private async checkLoginStatus(page: Page): Promise<boolean> {
    try {
      // Get HTML content and check login status from HTML
      const html = await page.content();
      const currentUrl = page.url().toLowerCase();
      
      // Extract body text from HTML
      const bodyText = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                           .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                           .replace(/<[^>]+>/g, ' ')
                           .replace(/\s+/g, ' ')
                           .toLowerCase();

      // Check for common logged-in indicators
      const loggedInIndicators = [
        'dashboard', 'profile', 'account', 'welcome', 'logout', 'sign out', 
        'user menu', 'admin', 'home', 'main', 'app', 'settings'
      ];
      
      // Check URL and content for logged-in indicators
      const hasLoggedInIndicator = loggedInIndicators.some(indicator => 
        currentUrl.includes(indicator) || bodyText.includes(indicator)
      );
      
      // Check if we're NOT on a login page
      const isNotOnLoginPage = !currentUrl.includes('login') && 
                              !currentUrl.includes('signin') && 
                              !currentUrl.includes('auth') &&
                              !currentUrl.includes('sign-in');
      
      // Check for logout buttons or user menus in HTML
      const hasLogoutButton = /href\s*=\s*["'][^"']*logout[^"']*["']/i.test(html) ||
                             /onclick\s*=\s*["'][^"']*logout[^"']*["']/i.test(html) ||
                             /href\s*=\s*["'][^"']*signout[^"']*["']/i.test(html) ||
                             /href\s*=\s*["'][^"']*sign-out[^"']*["']/i.test(html);
      
      const hasUserMenu = /class\s*=\s*["'][^"']*user[^"']*["']/i.test(html) ||
                         /class\s*=\s*["'][^"']*profile[^"']*["']/i.test(html) ||
                         /class\s*=\s*["'][^"']*account[^"']*["']/i.test(html) ||
                         /id\s*=\s*["'][^"']*user[^"']*["']/i.test(html) ||
                         /id\s*=\s*["'][^"']*profile[^"']*["']/i.test(html) ||
                         /id\s*=\s*["'][^"']*account[^"']*["']/i.test(html);
      
      const isLoggedIn = hasLoggedInIndicator || (isNotOnLoginPage && (hasLogoutButton || hasUserMenu));
      
      console.log(`🔍 Login status check: ${isLoggedIn ? 'LOGGED IN' : 'NOT LOGGED IN'}`);
      console.log(`  - Has logged in indicator: ${hasLoggedInIndicator}`);
      console.log(`  - Not on login page: ${isNotOnLoginPage}`);
      console.log(`  - Has logout button: ${hasLogoutButton}`);
      console.log(`  - Has user menu: ${hasUserMenu}`);
      
      return isLoggedIn;
    } catch (error) {
      console.log(`❌ Error checking login status: ${error.message}`);
      return false;
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

        // Wait for login to process and page to redirect/load
        console.log('⏳ Waiting for login to complete...');
        await this.waitForLoginCompletion(page);
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
            
            // Wait for login to process and page to redirect/load
            console.log('⏳ Waiting for login to complete...');
            await this.waitForLoginCompletion(page);
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
    credentials: { username: string; password: string },
  ): Promise<void> {
    const urlQueue: string[] = [baseUrl];
    const maxPages = 50; // Limit to prevent infinite loops
    const maxDepth = 3; // Limit crawling depth
    const urlDepthMap = new Map<string, number>(); // Track depth of each URL
    urlDepthMap.set(baseUrl, 0);
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
          waitUntil: 'networkidle0',
          timeout: 30000,
        });

        // Wait for dynamic content to load with smart waiting
        console.log('⏳ Waiting for dynamic content to load...');
        await this.waitForDynamicContent(page);

        // Check if we're still logged in, and if not, try to login again
        const isLoggedIn = await this.checkLoginStatus(page);
        if (!isLoggedIn && currentUrl !== baseUrl) {
          console.log(`🔐 Not logged in on ${currentUrl}, attempting to re-login...`);
          
          // Try to find login form on this page
          const loginForm = await page.$('form[action*="login"], form[action*="signin"], form[action*="auth"], form[id*="login"], form[class*="login"]');
          if (loginForm) {
            console.log('✅ Found login form on this page, attempting login...');
            const loginSuccess = await this.performLogin(page, credentials);
            if (!loginSuccess) {
              console.log('❌ Re-login failed on this page, skipping...');
              continue;
            } else {
              console.log('✅ Re-login successful on this page');
            }
          } else {
            // Navigate back to base URL to login
            console.log('🔄 Navigating back to base URL to re-login...');
            await page.goto(baseUrl, {
              waitUntil: 'networkidle0',
              timeout: 30000,
            });
            
            // Check if we need to login again
            const needsLogin = !(await this.checkLoginStatus(page));
            if (needsLogin) {
              console.log('🔐 Session expired, attempting fresh login...');
              const loginSuccess = await this.performLogin(page, credentials);
              if (!loginSuccess) {
                console.log('❌ Fresh login failed, skipping this page...');
                continue;
              } else {
                console.log('✅ Fresh login successful');
              }
            } else {
              console.log('✅ Still logged in, continuing...');
            }
            
            // Navigate back to the original URL
            console.log(`🔄 Navigating back to original URL: ${currentUrl}`);
            await page.goto(currentUrl, {
              waitUntil: 'networkidle0',
              timeout: 30000,
            });
            
            // Wait for page to load with smart waiting
            console.log('⏳ Waiting for page to load after re-login...');
            await this.waitForDynamicContent(page);
          }
        }

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

        // Extract links from the cleaned HTML instead of live DOM queries
        const links = this.extractLinksFromHTML(pageData.html, currentUrl);
        
        console.log(`🔍 Found ${links.length} total links in HTML from ${currentUrl}`);
        
        // Debug: Show sample links found in HTML
        console.log(`📄 HTML Link Analysis:`);
        console.log(`  - Page Title: "${pageData.title}"`);
        console.log(`  - HTML Length: ${pageData.html.length} characters`);
        console.log(`  - Sample Links:`, links.slice(0, 5));
        
        // Process links from HTML and add internal ones to queue
        let validLinks = 0;
        let internalLinks = 0;
        let newLinks = 0;
        let duplicateLinks = 0;

        // Get current depth for this page
        const currentDepth = urlDepthMap.get(currentUrl) || 0;
        
        // Add new internal links to the queue
        for (const link of links) {
          if (link.href) {
            validLinks++;
            const fullUrl = this.resolveUrl(link.href, baseUrl);
            
            console.log(`Processing HTML link: ${link.href} -> ${fullUrl}`);
            console.log(`  - Text: "${link.text}"`);
            console.log(`  - Internal: ${this.isInternalUrl(fullUrl, baseUrl)}`);
            console.log(`  - Already visited: ${visitedUrls.has(fullUrl)}`);
            console.log(`  - In queue: ${urlQueue.includes(fullUrl)}`);
            console.log(`  - Current depth: ${currentDepth}`);
            
            if (this.isInternalUrl(fullUrl, baseUrl)) {
              internalLinks++;
              
              // Check depth limit
              const newDepth = currentDepth + 1;
              if (newDepth > maxDepth) {
                console.log(`  ❌ Skipped (depth limit ${maxDepth}): ${fullUrl}`);
                continue;
              }
              
              if (!visitedUrls.has(fullUrl) && !urlQueue.includes(fullUrl)) {
                // Prioritize URLs based on importance
                const priority = this.calculateUrlPriority(fullUrl, link.text);
                
                if (priority > 0) {
                  // Insert at appropriate position based on priority
                  this.insertUrlByPriority(urlQueue, fullUrl, priority);
                  urlDepthMap.set(fullUrl, newDepth);
                  newLinks++;
                  console.log(`  ✅ Added to queue (depth ${newDepth}, priority ${priority}): ${fullUrl}`);
                } else {
                  console.log(`  ❌ Skipped (low priority): ${fullUrl}`);
                }
              } else {
                duplicateLinks++;
                console.log(`  ❌ Skipped (duplicate): ${fullUrl}`);
              }
            } else {
              console.log(`  ❌ Skipped (external): ${fullUrl}`);
            }
          } else {
            console.log(`❌ Link with no href: "${link.text}"`);
          }
        }

        console.log(`📊 Link Processing Summary for ${currentUrl}:`);
        console.log(`  - Total links found in HTML: ${links.length}`);
        console.log(`  - Links with valid href: ${validLinks}`);
        console.log(`  - Internal links: ${internalLinks}`);
        console.log(`  - New links added to queue: ${newLinks}`);
        console.log(`  - Duplicate links skipped: ${duplicateLinks}`);
        console.log(`  - Current queue size: ${urlQueue.length}`);

      } catch (error) {
        console.error(`❌ Failed to scrape ${currentUrl}:`, error.message);
        // Continue with other URLs if this one fails
        continue;
      }
    }

    console.log(`🎉 Scraping completed! Processed ${processedPages} pages, found ${scrapedPages.length} successfully scraped pages`);
  }

  private async extractPageData(page: Page): Promise<any> {
    // Wait for any remaining dynamic content before extracting
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Scroll to ensure all lazy-loaded content is loaded
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Scroll back to top
    await page.evaluate(() => {
      window.scrollTo(0, 0);
    });
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Get the fully rendered HTML content
    const rawHtml = await page.content();
    
    // Clean the HTML to remove CSS, JS, and other irrelevant elements
    const cleanedHtml = this.cleanHtmlContent(rawHtml);
    
    // Also get the cleaned body HTML
    const cleanedBodyHtml = await page.evaluate(() => {
      // Remove unwanted elements from the DOM before getting innerHTML
      const unwantedSelectors = [
        'script', 'style', 'link[rel="stylesheet"]', 'noscript',
        'meta[name="viewport"]', 'meta[name="generator"]',
        'link[rel="icon"]', 'link[rel="shortcut icon"]',
        'style', '[style]', // Remove inline styles
        '.advertisement', '.ads', '.banner', '.sidebar',
        '.footer', '.header', '.navigation', '.nav',
        '[class*="ad-"]', '[id*="ad-"]', '[class*="banner"]',
        '[class*="popup"]', '[class*="modal"]', '[class*="overlay"]'
      ];
      
      unwantedSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach(el => el.remove());
      });
      
      return document.body.innerHTML;
    });
    
    // Extract data from cleaned HTML using regex patterns
    const extractedData = this.extractDataFromHTML(cleanedHtml);
    
    // Get basic page info
    const title = await page.title();
    const url = page.url();
    
    // Get additional page metadata that might be dynamically set
    const pageMetadata = await page.evaluate(() => {
      return {
        documentTitle: document.title,
        url: window.location.href,
        readyState: document.readyState,
        hasContent: document.body?.textContent?.trim().length > 0,
        bodyClasses: document.body?.className || '',
        viewportHeight: window.innerHeight,
        viewportWidth: window.innerWidth,
        scrollHeight: document.body?.scrollHeight || 0,
      };
    });
    
    return {
      title,
      url,
      html: cleanedHtml, // Use cleaned HTML instead of raw HTML
      rawHtml, // Keep raw HTML for reference if needed
      bodyHtml: cleanedBodyHtml, // Use cleaned body HTML
      pageMetadata,
      ...extractedData,
      pageInfo: {
        title,
        url,
        bodyText: extractedData.bodyText.substring(0, 1000),
        totalElements: extractedData.totalElements,
        buttons: extractedData.buttons,
        links: extractedData.links,
        inputs: extractedData.inputs,
        readyState: pageMetadata.readyState,
        hasContent: pageMetadata.hasContent,
        originalHtmlSize: rawHtml.length,
        cleanedHtmlSize: cleanedHtml.length,
        sizeReduction: `${((rawHtml.length - cleanedHtml.length) / rawHtml.length * 100).toFixed(1)}%`,
      },
    };
  }

  /**
   * Clean HTML content by removing CSS, JavaScript, and other irrelevant elements
   */
  private cleanHtmlContent(html: string): string {
    try {
      let cleanedHtml = html;
      
      console.log(`🧹 Cleaning HTML content (original length: ${html.length} chars)`);
      
      // Remove script tags and their content
      cleanedHtml = cleanedHtml.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
      console.log(`  ✅ Removed script tags`);
      
      // Remove style tags and their content
      cleanedHtml = cleanedHtml.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
      console.log(`  ✅ Removed style tags`);
      
      // Remove link tags for stylesheets, icons, etc.
      cleanedHtml = cleanedHtml.replace(/<link[^>]*rel=["']?(stylesheet|icon|shortcut icon|apple-touch-icon)["']?[^>]*>/gi, '');
      console.log(`  ✅ Removed stylesheet and icon link tags`);
      
      // Remove meta tags (except essential ones)
      cleanedHtml = cleanedHtml.replace(/<meta[^>]*name=["']?(viewport|generator|robots|author|keywords|description)["']?[^>]*>/gi, '');
      console.log(`  ✅ Removed meta tags`);
      
      // Remove noscript tags
      cleanedHtml = cleanedHtml.replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '');
      console.log(`  ✅ Removed noscript tags`);
      
      // Remove inline styles from all elements
      cleanedHtml = cleanedHtml.replace(/\sstyle\s*=\s*["'][^"']*["']/gi, '');
      console.log(`  ✅ Removed inline styles`);
      
      // Remove class attributes that contain styling-related keywords
      cleanedHtml = cleanedHtml.replace(/\sclass\s*=\s*["'][^"']*(?:ad|banner|popup|modal|overlay|sidebar|footer|header|nav|ads|advertisement)[^"']*["']/gi, '');
      console.log(`  ✅ Removed styling-related class attributes`);
      
      // Remove id attributes that contain styling-related keywords
      cleanedHtml = cleanedHtml.replace(/\sid\s*=\s*["'][^"']*(?:ad|banner|popup|modal|overlay|sidebar|footer|header|nav|ads|advertisement)[^"']*["']/gi, '');
      console.log(`  ✅ Removed styling-related id attributes`);
      
      // Remove comments
      cleanedHtml = cleanedHtml.replace(/<!--[\s\S]*?-->/g, '');
      console.log(`  ✅ Removed HTML comments`);
      
      // Remove empty elements that are likely styling-related
      const emptyElements = ['div', 'span', 'p', 'section', 'article'];
      emptyElements.forEach(tag => {
        cleanedHtml = cleanedHtml.replace(new RegExp(`<${tag}[^>]*>\\s*</${tag}>`, 'gi'), '');
      });
      console.log(`  ✅ Removed empty elements`);
      
      // Clean up extra whitespace
      cleanedHtml = cleanedHtml.replace(/\s+/g, ' ').trim();
      console.log(`  ✅ Cleaned up whitespace`);
      
      // Remove elements with common advertisement/UI class patterns
      const unwantedPatterns = [
        /<[^>]*class[^>]*(?:ad|banner|popup|modal|overlay|sidebar|footer|header|nav|ads|advertisement)[^>]*>[\s\S]*?<\/[^>]*>/gi,
        /<[^>]*id[^>]*(?:ad|banner|popup|modal|overlay|sidebar|footer|header|nav|ads|advertisement)[^>]*>[\s\S]*?<\/[^>]*>/gi,
      ];
      
      unwantedPatterns.forEach(pattern => {
        const matches = cleanedHtml.match(pattern);
        if (matches) {
          matches.forEach(match => {
            cleanedHtml = cleanedHtml.replace(match, '');
          });
        }
      });
      console.log(`  ✅ Removed elements with unwanted patterns`);
      
      // Final cleanup
      cleanedHtml = cleanedHtml.replace(/\s+/g, ' ').trim();
      
      console.log(`🧹 HTML cleaning complete (cleaned length: ${cleanedHtml.length} chars)`);
      console.log(`  📊 Size reduction: ${((html.length - cleanedHtml.length) / html.length * 100).toFixed(1)}%`);
      
      return cleanedHtml;
    } catch (error) {
      console.error(`❌ Error cleaning HTML content: ${error.message}`);
      return html; // Return original HTML if cleaning fails
    }
  }

  private extractDataFromHTML(html: string): any {
    try {
      // Extract title (keep title tag since it's useful)
      const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
      const title = titleMatch ? titleMatch[1].trim() : '';

      // Extract body text (remove HTML tags) - HTML is already cleaned
      const bodyText = html.replace(/<[^>]+>/g, ' ')
                           .replace(/\s+/g, ' ')
                           .trim();

      // Extract forms
      const forms = this.extractFormsFromHTML(html);

      // Extract buttons
      const buttons = this.extractButtonsFromHTML(html);

      // Extract links
      const links = this.extractLinksFromHTML(html, '');

      // Extract images
      const images = this.extractImagesFromHTML(html);

      // Extract tables
      const tables = this.extractTablesFromHTML(html);

      // Extract headings
      const headings = this.extractHeadingsFromHTML(html);

      // Count elements
      const totalElements = (html.match(/<[^\/][^>]*>/g) || []).length;

      return {
        title,
        bodyText,
        totalElements,
        buttons: buttons.length,
        links: links.length,
        inputs: (html.match(/<input[^>]*>/gi) || []).length,
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
          wordCount: bodyText.split(/\s+/).filter(word => word.length > 0).length,
          characterCount: bodyText.length,
        },
      };
    } catch (error) {
      console.error(`❌ Error extracting data from HTML: ${error.message}`);
      return {
        title: '',
        bodyText: '',
        totalElements: 0,
        buttons: 0,
        links: 0,
        inputs: 0,
        forms: 0,
        images: 0,
        tables: 0,
        scrapedData: {
          forms: [],
          buttons: [],
          links: [],
          images: [],
          tables: [],
          headings: { h1: [], h2: [], h3: [] },
          wordCount: 0,
          characterCount: 0,
        },
      };
    }
  }

  private extractFormsFromHTML(html: string): any[] {
    const formRegex = /<form[^>]*>[\s\S]*?<\/form>/gi;
    const forms: any[] = [];
    let match;

    while ((match = formRegex.exec(html)) !== null) {
      const formHtml = match[0];
      const actionMatch = formHtml.match(/action\s*=\s*["']([^"']*)["']/i);
      const methodMatch = formHtml.match(/method\s*=\s*["']([^"']*)["']/i);
      
      // Extract input fields
      const inputRegex = /<input[^>]*>/gi;
      const inputs: any[] = [];
      let inputMatch;
      
      while ((inputMatch = inputRegex.exec(formHtml)) !== null) {
        const inputHtml = inputMatch[0];
        const typeMatch = inputHtml.match(/type\s*=\s*["']([^"']*)["']/i);
        const nameMatch = inputHtml.match(/name\s*=\s*["']([^"']*)["']/i);
        const placeholderMatch = inputHtml.match(/placeholder\s*=\s*["']([^"']*)["']/i);
        
        inputs.push({
          type: typeMatch ? typeMatch[1] : 'text',
          name: nameMatch ? nameMatch[1] : '',
          placeholder: placeholderMatch ? placeholderMatch[1] : '',
        });
      }

      forms.push({
        action: actionMatch ? actionMatch[1] : '',
        method: methodMatch ? methodMatch[1] : 'GET',
        inputs,
      });
    }

    return forms;
  }

  private extractButtonsFromHTML(html: string): any[] {
    const buttonRegex = /<button[^>]*>([^<]*)<\/button>/gi;
    const buttons: any[] = [];
    let match;

    while ((match = buttonRegex.exec(html)) !== null) {
      const buttonHtml = match[0];
      const text = match[1].trim();
      const typeMatch = buttonHtml.match(/type\s*=\s*["']([^"']*)["']/i);
      const classMatch = buttonHtml.match(/class\s*=\s*["']([^"']*)["']/i);

      buttons.push({
        text,
        type: typeMatch ? typeMatch[1] : 'button',
        className: classMatch ? classMatch[1] : '',
      });
    }

    return buttons;
  }

  private extractImagesFromHTML(html: string): any[] {
    const imgRegex = /<img[^>]*>/gi;
    const images: any[] = [];
    let match;

    while ((match = imgRegex.exec(html)) !== null) {
      const imgHtml = match[0];
      const srcMatch = imgHtml.match(/src\s*=\s*["']([^"']*)["']/i);
      const altMatch = imgHtml.match(/alt\s*=\s*["']([^"']*)["']/i);

      images.push({
        src: srcMatch ? srcMatch[1] : '',
        alt: altMatch ? altMatch[1] : '',
      });
    }

    return images;
  }

  private extractTablesFromHTML(html: string): any[] {
    const tableRegex = /<table[^>]*>[\s\S]*?<\/table>/gi;
    const tables: any[] = [];
    let match;

    while ((match = tableRegex.exec(html)) !== null) {
      const tableHtml = match[0];
      const rows = (tableHtml.match(/<tr[^>]*>/gi) || []).length;
      const cells = (tableHtml.match(/<td[^>]*>|<\/td>/gi) || []).length / 2 + 
                   (tableHtml.match(/<th[^>]*>|<\/th>/gi) || []).length / 2;

      tables.push({
        rows,
        cells: Math.floor(cells),
      });
    }

    return tables;
  }

  private extractHeadingsFromHTML(html: string): any {
    const extractHeadings = (tag: string) => {
      const regex = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, 'gi');
      const headings: string[] = [];
      let match;

      while ((match = regex.exec(html)) !== null) {
        headings.push(match[1].trim());
      }

      return headings;
    };

    return {
      h1: extractHeadings('h1'),
      h2: extractHeadings('h2'),
      h3: extractHeadings('h3'),
    };
  }

  private isInternalUrl(url: string, baseUrl: string): boolean {
    try {
      // Handle relative URLs, fragments, and query parameters
      if (!url || url.startsWith('#') || url.startsWith('javascript:') || url.startsWith('mailto:') || url.startsWith('tel:')) {
        return false;
      }

      // First check if it's a valid URL and internal
      const urlObj = new URL(url, baseUrl);
      const baseObj = new URL(baseUrl);
      
      const isInternal = urlObj.origin === baseObj.origin;
      
      if (!isInternal) {
        console.log(`    URL comparison: ${url} (${urlObj.origin}) vs ${baseUrl} (${baseObj.origin}) -> external`);
        return false;
      }

      // Additional filtering for internal URLs - check if it's a useful page
      const href = urlObj.href.toLowerCase();
      
      // File extensions and patterns to exclude (same as in filterUsefulLinks)
      const excludePatterns = [
        /\.(css|js|json|xml|txt|pdf|doc|docx|xls|xlsx|ppt|pptx|zip|rar|7z|tar|gz)$/i,
        /\.(jpg|jpeg|png|gif|svg|webp|ico|bmp|tiff|tif)$/i,
        /\.(mp4|avi|mov|wmv|flv|webm|mkv|mp3|wav|ogg|flac|aac)$/i,
        /\.(woff|woff2|ttf|otf|eot)$/i,
        /\/api\//i,
        /\/data\//i,
        /\/assets\//i,
        /\/static\//i,
        /\/media\//i,
        /\/uploads\//i,
        /\/files\//i,
        /\?.*format=(json|xml|csv|pdf)/i,
        /\?.*download=true/i,
        /\?.*action=(download|export|print)/i,
      ];
      
      const excludeKeywords = [
        'download', 'export', 'print', 'preview', 'thumbnail', 'embed',
        'widget', 'iframe', 'popup', 'modal', 'ajax', 'xhr', 'api',
        'service', 'endpoint'
      ];
      
      // Check file extensions
      for (const pattern of excludePatterns) {
        if (pattern.test(href)) {
          console.log(`    URL excluded by pattern: ${url}`);
          return false;
        }
      }
      
      // Check keywords
      for (const keyword of excludeKeywords) {
        if (href.includes(keyword)) {
          console.log(`    URL excluded by keyword: ${url}`);
          return false;
        }
      }
      
      // Additional checks
      if (href.startsWith('data:') || href.startsWith('blob:')) {
        console.log(`    URL excluded (data/blob): ${url}`);
        return false;
      }
      
      console.log(`    URL approved: ${url}`);
      return true;
    } catch (error) {
      console.log(`    URL parsing error for ${url}: ${error.message}`);
      return false;
    }
  }

  private resolveUrl(href: string, baseUrl: string): string {
    try {
      const resolved = new URL(href, baseUrl).href;
      console.log(`    URL resolution: ${href} -> ${resolved}`);
      return resolved;
    } catch (error) {
      console.log(`    URL resolution error for ${href}: ${error.message}`);
      return href;
    }
  }

  private async waitForLoginCompletion(page: Page): Promise<void> {
    try {
      // Wait for network to be idle (no requests for 500ms)
      try {
        await page.waitForFunction(() => {
          const navEntry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
          return navEntry && navEntry.loadEventEnd > 0;
        }, { timeout: 10000 });
      } catch (error) {
        console.log('⚠️ Network idle timeout, continuing...');
      }

      // Additional wait for any redirects or dynamic content
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Wait for common post-login elements to appear
      const postLoginSelectors = [
        '[class*="dashboard"]',
        '[class*="profile"]',
        '[class*="welcome"]',
        '[class*="user"]',
        '[class*="account"]',
        '[href*="logout"]',
        '[href*="signout"]',
        'button:has-text("Logout")',
        'button:has-text("Sign Out")'
      ];

      let foundPostLoginElement = false;
      for (const selector of postLoginSelectors) {
        try {
          await page.waitForSelector(selector, { timeout: 2000 });
          console.log(`✅ Found post-login element: ${selector}`);
          foundPostLoginElement = true;
          break;
        } catch {
          // Continue to next selector
        }
      }

      if (!foundPostLoginElement) {
        console.log('⚠️ No specific post-login elements found, but continuing...');
      }

      console.log('✅ Login completion wait finished');
    } catch (error) {
      console.log(`⚠️ Error during login completion wait: ${error.message}`);
      // Don't throw, just log and continue
    }
  }

  private async waitForDynamicContent(page: Page): Promise<void> {
    try {
      console.log('⏳ Starting comprehensive dynamic content wait...');
      
      // Wait for network to be idle (no requests for 500ms)
      try {
        await page.waitForFunction(() => {
          const navEntry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
          return navEntry && navEntry.loadEventEnd > 0;
        }, { timeout: 15000 });
        console.log('✅ Navigation timing completed');
      } catch (error) {
        console.log('⚠️ Network idle timeout, continuing...');
      }

      // Wait for DOM to be fully ready
      try {
        await page.waitForFunction(() => {
          return document.readyState === 'complete';
        }, { timeout: 10000 });
        console.log('✅ DOM ready state complete');
      } catch (error) {
        console.log('⚠️ DOM ready state timeout, continuing...');
      }

      // Wait for common dynamic content indicators to disappear
      const dynamicContentSelectors = [
        '[class*="loading"]',
        '[class*="spinner"]',
        '[id*="loading"]',
        '[id*="spinner"]',
        '.loading',
        '.spinner',
        '[class*="skeleton"]',
        '[data-testid*="loading"]',
        '[aria-label*="loading"]'
      ];

      // Check if any loading indicators are present and wait for them to disappear
      for (const selector of dynamicContentSelectors) {
        try {
          const element = await page.$(selector);
          if (element) {
            console.log(`⏳ Found loading indicator: ${selector}, waiting for it to disappear...`);
            await page.waitForSelector(selector, { hidden: true, timeout: 8000 }).catch(() => {
              console.log(`⚠️ Loading indicator ${selector} did not disappear, continuing...`);
            });
          }
        } catch {
          // Continue to next selector
        }
      }

      // Wait for any lazy-loaded images to load
      try {
        await page.evaluate(async () => {
          const images = Array.from(document.querySelectorAll('img'));
          const imagePromises = images.map(img => {
            if (img.complete) return Promise.resolve();
            return new Promise(resolve => {
              img.onload = resolve;
              img.onerror = resolve;
              setTimeout(resolve, 3000); // Max wait 3 seconds per image
            });
          });
          await Promise.all(imagePromises);
        });
        console.log('✅ Images loaded');
      } catch (error) {
        console.log('⚠️ Image loading timeout, continuing...');
      }

      // Wait for any pending fetch requests or AJAX calls
      try {
        await page.waitForFunction(() => {
          // Check if there are any pending XMLHttpRequests
          const hasPendingXHR = (window as any).XMLHttpRequest && 
            (window as any).XMLHttpRequest.prototype._activeXHRs?.length > 0;
          
          // Check if fetch is still in progress (this is harder to detect)
          return !hasPendingXHR;
        }, { timeout: 5000 });
        console.log('✅ Pending requests completed');
      } catch (error) {
        console.log('⚠️ Pending requests timeout, continuing...');
      }

      // Additional wait for any remaining dynamic content
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Check for common dynamic content that might still be loading
      const contentSelectors = [
        '[class*="content"]',
        '[class*="main"]',
        '[class*="container"]',
        'main',
        'article',
        'section',
        '[role="main"]',
        '.main-content',
        '.page-content'
      ];

      let foundContent = false;
      let maxContentLength = 0;
      let bestSelector = '';

      for (const selector of contentSelectors) {
        try {
          const element = await page.$(selector);
          if (element) {
            const text = await element.evaluate(el => el.textContent?.trim() || '');
            if (text.length > maxContentLength) {
              maxContentLength = text.length;
              bestSelector = selector;
            }
            if (text.length > 50) { // Ensure there's substantial content
              foundContent = true;
            }
          }
        } catch {
          // Continue to next selector
        }
      }

      if (foundContent) {
        console.log(`✅ Found substantial content (${maxContentLength} chars) in: ${bestSelector}`);
      } else {
        console.log('⚠️ No substantial content found, but continuing...');
      }

      // Final check: ensure the page has some visible content
      const hasVisibleContent = await page.evaluate(() => {
        const body = document.body;
        if (!body) return false;
        
        const textContent = body.textContent?.trim() || '';
        const hasText = textContent.length > 20;
        
        const hasElements = body.children.length > 0;
        
        return hasText || hasElements;
      });

      if (!hasVisibleContent) {
        console.log('⚠️ Page appears to have no visible content, but continuing...');
      } else {
        console.log('✅ Page has visible content');
      }

      console.log('✅ Dynamic content wait finished');
    } catch (error) {
      console.log(`⚠️ Error during dynamic content wait: ${error.message}`);
      // Don't throw, just log and continue
    }
  }
}
