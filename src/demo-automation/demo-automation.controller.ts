import { Controller, Post, Body, Logger } from '@nestjs/common';
import { DemoAutomationService } from './demo-automation.service';
import { CreateDemoResponseDto } from '../dto/demo-automation.dto';
import * as path from 'path';

@Controller('demo')
export class DemoAutomationController {
  private readonly logger = new Logger(DemoAutomationController.name);

  constructor(private readonly demoAutomationService: DemoAutomationService) {}

  @Post('create-demo')
  async createDemo(
    @Body()
    body: {
      websiteUrl: string;
      credentials: { username: string; password: string };
    },
  ): Promise<CreateDemoResponseDto> {
    this.logger.log(`🎬 Creating demo for: ${body.websiteUrl}`);

    try {
      const result = await this.demoAutomationService.loginToWebsite(
        body.websiteUrl,
        body.credentials,
      );

      this.logger.log(`✅ Demo created successfully: ${result.demoId}`);

      return result;
    } catch (error) {
      this.logger.error(
        `❌ Demo creation failed: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  @Post('crawl-and-dump')
  async crawlAndDumpApp(
    @Body()
    body: {
      websiteUrl: string;
      credentials: { username: string; password: string };
      maxPages?: number;
    },
  ): Promise<{
    success: boolean;
    demoId: string;
    dumpPath: string;
    totalPages: number;
    crawlTime: number;
  }> {
    this.logger.log(`🕷️ Starting app crawl and dump for: ${body.websiteUrl}`);

    try {
      const result = await this.demoAutomationService.crawlAndDumpApp(
        body.websiteUrl,
        body.credentials,
        body.maxPages || 50,
      );

      this.logger.log(`✅ App crawl and dump completed: ${result.dumpPath}`);

      return {
        success: result.success,
        demoId: result.dumpPath.split(path.sep).pop() || 'unknown',
        dumpPath: result.dumpPath,
        totalPages: result.crawlResult.totalPages,
        crawlTime: result.crawlResult.crawlTime,
      };
    } catch (error) {
      this.logger.error(
        `❌ App crawl and dump failed: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
