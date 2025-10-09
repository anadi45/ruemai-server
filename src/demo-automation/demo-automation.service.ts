import { Injectable, Logger } from '@nestjs/common';
import { CreateDemoResponseDto } from '../dto/demo-automation.dto';
import { BrowserService, CrawlResult } from '../browser/browser.service';
import { AiService, FeatureTree } from '../ai/ai.service';
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
  ): Promise<CreateDemoResponseDto> {
    const startTime = Date.now();
    const demoId = uuidv4();

    this.logger.log(`🚀 Starting feature extraction for: ${websiteUrl}`);

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

      const processingTime = Date.now() - startTime;

      this.logger.log(`✅ Feature extraction completed in ${processingTime}ms`);
      this.logger.log(`📊 Extracted ${featureTree.features.length} features`);

      return {
        demoId,
        demoName: 'AI-Powered Feature Extraction Demo',
        websiteUrl,
        loginStatus: loginResult.success ? 'success' : 'partial',
        pageInfo: loginResult.pageInfo,
        summary: {
          processingTime,
          loginAttempted: true,
          finalUrl: loginResult.finalUrl,
        },
        extractedFeatures: featureTree,
      };
    } catch (error) {
      this.logger.error(`❌ Feature extraction failed: ${error.message}`);
      throw new Error(`Feature extraction failed: ${error.message}`);
    }
  }

  async crawlAndDumpApp(
    websiteUrl: string,
    credentials: { username: string; password: string },
    maxPages: number = 50,
  ): Promise<{ success: boolean; dumpPath: string; crawlResult: CrawlResult }> {
    const startTime = Date.now();
    const demoId = uuidv4();

    this.logger.log(`🕷️ Starting comprehensive app crawl for: ${websiteUrl}`);

    try {
      // Perform comprehensive crawl
      const crawlResult = await this.browserService.crawlCompleteApp(
        websiteUrl,
        credentials,
        maxPages,
      );

      // Create dump directory
      const dumpDir = path.join(process.cwd(), 'demo-crawl-dump');
      if (!fs.existsSync(dumpDir)) {
        fs.mkdirSync(dumpDir, { recursive: true });
      }

      // Create demo-specific directory
      const demoDir = path.join(dumpDir, demoId);
      fs.mkdirSync(demoDir, { recursive: true });

      // Save crawl results
      const crawlData = {
        demoId,
        websiteUrl,
        credentials: { username: credentials.username, password: '***' }, // Hide password
        crawlResult,
        timestamp: new Date().toISOString(),
        processingTime: Date.now() - startTime,
      };

      // Save main crawl data
      const crawlDataPath = path.join(demoDir, 'crawl-data.json');
      fs.writeFileSync(crawlDataPath, JSON.stringify(crawlData, null, 2));

      // Save individual pages
      const pagesDir = path.join(demoDir, 'pages');
      fs.mkdirSync(pagesDir, { recursive: true });

      for (let i = 0; i < crawlResult.pages.length; i++) {
        const page = crawlResult.pages[i];
        const pageDir = path.join(pagesDir, `page-${i + 1}`);
        fs.mkdirSync(pageDir, { recursive: true });

        // Save page HTML
        const htmlPath = path.join(pageDir, 'content.html');
        fs.writeFileSync(htmlPath, page.html);

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

      this.logger.log(`✅ App crawl and dump completed: ${demoDir}`);

      return {
        success: true,
        dumpPath: demoDir,
        crawlResult,
      };
    } catch (error) {
      this.logger.error(`❌ App crawl and dump failed: ${error.message}`);
      throw new Error(`App crawl and dump failed: ${error.message}`);
    }
  }
}
