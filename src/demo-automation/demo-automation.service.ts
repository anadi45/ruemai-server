import { Injectable } from '@nestjs/common';
import { CreateDemoResponseDto } from './demo-automation.dto';
import { BrowserService } from '../browser/browser.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class DemoAutomationService {
  constructor(private readonly browserService: BrowserService) {}

  async loginToWebsite(
    websiteUrl: string,
    credentials: { username: string; password: string },
  ): Promise<CreateDemoResponseDto> {
    const startTime = Date.now();
    const demoId = uuidv4();

    try {
      // Use browser service to login and crawl the complete website
      const crawlResult = await this.browserService.crawlCompleteApp(
        websiteUrl,
        credentials,
        100, // Max pages to crawl
      );

      const processingTime = Date.now() - startTime;

      return {
        demoId,
        demoName: 'Website Scraping Demo',
        websiteUrl,
        loginStatus: crawlResult.success ? 'success' : 'failed',
        pageInfo: crawlResult.pages[0]?.pageInfo,
        summary: {
          processingTime,
          loginAttempted: true,
          finalUrl: crawlResult.pages[0]?.url || websiteUrl,
        },
        scrapedData: {
          success: crawlResult.success,
          totalPages: crawlResult.totalPages,
          crawlTime: crawlResult.crawlTime,
          pages: crawlResult.pages.map((page) => ({
            url: page.url,
            title: page.title,
            html: page.html,
            scrapedData: page.scrapedData,
            timestamp: page.timestamp,
            pageInfo: page.pageInfo,
          })),
        },
      };
    } catch (error) {
      throw new Error(`Demo automation failed: ${error.message}`);
    }
  }
}
