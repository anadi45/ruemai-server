import { Injectable } from '@nestjs/common';
import { CreateDemoResponseDto } from '../dto/demo-automation.dto';
import { BrowserService } from '../browser/browser.service';
import { AiService } from '../ai/ai.service';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class DemoAutomationService {
  constructor(
    private readonly browserService: BrowserService,
    private readonly aiService: AiService,
  ) {}

  async loginToWebsite(
    websiteUrl: string,
    credentials: { username: string; password: string },
    maxPages: number = 50,
  ): Promise<CreateDemoResponseDto> {
    const startTime = Date.now();
    const demoId = uuidv4();

    try {
      // Use browser service to login and extract page
      const loginResult = await this.browserService.loginAndExtractPage(
        websiteUrl,
        credentials,
      );

      if (!loginResult.success) {
      }

      // Extract features using AI
      const featureTree = await this.aiService.extractFeatures(
        loginResult.html,
        loginResult.pageInfo,
      );

      // If login was successful, perform comprehensive crawling
      let crawlData = null;
      if (loginResult.success) {
        try {
          const crawlResult = await this.browserService.crawlCompleteApp(
            websiteUrl,
            credentials,
            maxPages,
          );

          // Create dump directory and save crawl results
          const dumpDir = path.join(process.cwd(), 'demo-crawl-dump');
          if (!fs.existsSync(dumpDir)) {
            fs.mkdirSync(dumpDir, { recursive: true });
          }

          const demoDir = path.join(dumpDir, demoId);
          fs.mkdirSync(demoDir, { recursive: true });

          // Save crawl results
          const crawlDataToSave = {
            demoId,
            websiteUrl,
            credentials: { username: credentials.username, password: '***' },
            crawlResult,
            timestamp: new Date().toISOString(),
            processingTime: Date.now() - startTime,
          };

          const crawlDataPath = path.join(demoDir, 'crawl-data.json');
          fs.writeFileSync(
            crawlDataPath,
            JSON.stringify(crawlDataToSave, null, 2),
          );

          // Save individual pages
          const pagesDir = path.join(demoDir, 'pages');
          fs.mkdirSync(pagesDir, { recursive: true });

          for (let i = 0; i < crawlResult.pages.length; i++) {
            const page = crawlResult.pages[i];
            const pageDir = path.join(pagesDir, `page-${i + 1}`);
            fs.mkdirSync(pageDir, { recursive: true });

            // Save HTML content
            const htmlPath = path.join(pageDir, 'content.html');
            fs.writeFileSync(htmlPath, page.html);

            // Save comprehensive scraped data
            const scrapedDataPath = path.join(pageDir, 'scraped-data.json');
            fs.writeFileSync(
              scrapedDataPath,
              JSON.stringify(page.scrapedData || {}, null, 2),
            );

            // Save page metadata
            const metadataPath = path.join(pageDir, 'metadata.json');
            fs.writeFileSync(
              metadataPath,
              JSON.stringify(
                {
                  url: page.url,
                  title: page.title,
                  pageInfo: page.pageInfo,
                  timestamp: page.timestamp,
                  hasScrapedData: !!page.scrapedData,
                },
                null,
                2,
              ),
            );

            // Save structured data summary
            if (page.scrapedData) {
              const summaryPath = path.join(pageDir, 'content-summary.txt');
              const summary = `
Page Content Summary
====================
Title: ${page.title}
URL: ${page.url}
Word Count: ${page.scrapedData.wordCount || 'N/A'}
Character Count: ${page.scrapedData.characterCount || 'N/A'}

Content Analysis:
- Has Login Form: ${page.scrapedData.hasLoginForm || false}
- Has Search Form: ${page.scrapedData.hasSearchForm || false}
- Has Contact Info: ${page.scrapedData.hasContactInfo || false}
- Has Pricing: ${page.scrapedData.hasPricing || false}
- Has Social Media: ${page.scrapedData.hasSocialMedia || false}

Elements Found:
- Forms: ${page.scrapedData.forms?.length || 0}
- Buttons: ${page.scrapedData.buttons?.length || 0}
- Links: ${page.scrapedData.links?.length || 0}
- Images: ${page.scrapedData.images?.length || 0}
- Tables: ${page.scrapedData.tables?.length || 0}

Headings:
${Object.entries(page.scrapedData.headingsData || {})
  .map(
    ([level, headings]) =>
      `${level.toUpperCase()}: ${(headings as string[]).join(', ')}`,
  )
  .join('\n')}

Navigation:
${page.scrapedData.navigationData?.menus?.map((menu) => `- ${menu.text}`).join('\n') || 'None found'}

Meta Information:
- Description: ${page.scrapedData.metaData?.description || 'None'}
- Keywords: ${page.scrapedData.metaData?.keywords || 'None'}
- Author: ${page.scrapedData.metaData?.author || 'None'}
              `.trim();

              fs.writeFileSync(summaryPath, summary);
            }
          }

          // Create summary file
          const summaryPath = path.join(demoDir, 'summary.txt');
          const summary = `
Demo Crawl Summary
==================
Demo ID: ${demoId}
Website: ${websiteUrl}
Total Pages Crawled: ${crawlResult.totalPages}
Crawl Time: ${crawlResult.crawlTime}ms
Processing Time: ${Date.now() - startTime}ms
Timestamp: ${new Date().toISOString()}

Pages Crawled:
${crawlResult.pages
  .map((page, index) => `${index + 1}. ${page.title} (${page.url})`)
  .join('\n')}
          `.trim();

          fs.writeFileSync(summaryPath, summary);

          crawlData = {
            success: crawlResult.success,
            totalPages: crawlResult.totalPages,
            crawlTime: crawlResult.crawlTime,
            dumpPath: demoDir,
            pages: crawlResult.pages.map((page) => ({
              url: page.url,
              title: page.title,
              timestamp: page.timestamp,
              pageInfo: page.pageInfo,
            })),
          };
        } catch (crawlError) {}
      } else {
      }

      const processingTime = Date.now() - startTime;

      return {
        demoId,
        demoName: 'AI-Powered Feature Extraction & App Crawl Demo',
        websiteUrl,
        loginStatus: loginResult.success ? 'success' : 'partial',
        pageInfo: loginResult.pageInfo,
        summary: {
          processingTime,
          loginAttempted: true,
          finalUrl: loginResult.finalUrl,
        },
        extractedFeatures: featureTree,
        crawlData,
      };
    } catch (error) {
      throw new Error(`Demo automation failed: ${error.message}`);
    }
  }
}
