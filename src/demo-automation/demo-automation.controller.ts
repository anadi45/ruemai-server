import { Controller, Post, Body, Logger } from '@nestjs/common';
import { DemoAutomationService } from './demo-automation.service';
import { CreateDemoResponseDto } from '../dto/demo-automation.dto';

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
      maxPages?: number;
    },
  ): Promise<CreateDemoResponseDto> {
    this.logger.log(`🎬 Creating comprehensive demo for: ${body.websiteUrl}`);

    try {
      const result = await this.demoAutomationService.loginToWebsite(
        body.websiteUrl,
        body.credentials,
        body.maxPages || 50,
      );

      this.logger.log(`✅ Demo created successfully: ${result.demoId}`);

      if (result.crawlData) {
        this.logger.log(
          `🕷️ App crawl completed: ${result.crawlData.totalPages} pages`,
        );
        this.logger.log(`📁 Dump saved to: ${result.crawlData.dumpPath}`);
      }

      return result;
    } catch (error) {
      this.logger.error(
        `❌ Demo creation failed: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
