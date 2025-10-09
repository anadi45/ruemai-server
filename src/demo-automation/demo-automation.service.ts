import { Injectable, Logger } from '@nestjs/common';
import { CreateDemoResponseDto } from '../dto/demo-automation.dto';
import { BrowserService } from '../browser/browser.service';
import { AiService } from '../ai/ai.service';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class DemoAutomationService {
  private readonly logger = new Logger(DemoAutomationService.name);

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

    this.logger.log(
      `🚀 Starting comprehensive demo automation for: ${websiteUrl}`,
    );

    try {
      // Use browser service to login and extract page
      const loginResult = await this.browserService.loginAndExtractPage(
        websiteUrl,
        credentials,
      );

      if (!loginResult.success) {
        this.logger.warn(
          '⚠️ Login may not have been successful, but continuing with feature extraction',
        );
      }

      // Extract features using AI
      this.logger.log('🤖 Starting AI feature extraction...');
      const featureTree = await this.aiService.extractFeatures(
        loginResult.html,
        loginResult.pageInfo,
      );

      this.logger.log(`✅ Feature extraction completed`);
      this.logger.log(`📊 Extracted ${featureTree.features.length} features`);

      // If login was successful, perform comprehensive crawling
      let crawlData = null;
      if (loginResult.success) {
        this.logger.log(
          '🕷️ Login successful, starting comprehensive app crawl...',
        );

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

            const htmlPath = path.join(pageDir, 'content.html');
            fs.writeFileSync(htmlPath, page.html);

            const metadataPath = path.join(pageDir, 'metadata.json');
            fs.writeFileSync(
              metadataPath,
              JSON.stringify(
                {
                  url: page.url,
                  title: page.title,
                  pageInfo: page.pageInfo,
                  timestamp: page.timestamp,
                },
                null,
                2,
              ),
            );
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

          this.logger.log(
            `✅ App crawl completed: ${crawlResult.totalPages} pages`,
          );
          this.logger.log(`📁 Dump saved to: ${demoDir}`);
        } catch (crawlError) {
          this.logger.warn(
            `⚠️ Crawl failed, continuing with feature extraction: ${crawlError.message}`,
          );
        }
      } else {
        this.logger.log('⚠️ Login failed, skipping app crawl');
      }

      const processingTime = Date.now() - startTime;

      this.logger.log(`✅ Demo automation completed in ${processingTime}ms`);

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
      this.logger.error(`❌ Demo automation failed: ${error.message}`);
      throw new Error(`Demo automation failed: ${error.message}`);
    }
  }
}
