import { Controller, Post, Body } from '@nestjs/common';
import { DemoAutomationService } from './demo-automation.service';
import { CreateDemoResponseDto } from './demo-automation.dto';

@Controller('demo')
export class DemoAutomationController {
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
    try {
      const result = await this.demoAutomationService.loginToWebsite(
        body.websiteUrl,
        body.credentials,
        body.maxPages || 50,
      );

      if (result.crawlData) {
      }

      return result;
    } catch (error) {
      throw error;
    }
  }
}
