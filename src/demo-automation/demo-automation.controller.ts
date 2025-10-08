import { Controller, Post, Body, Logger } from '@nestjs/common';
import { DemoAutomationService } from './demo-automation.service';
import { CreateDemoResponseDto } from '../dto/demo-automation.dto';

@Controller('demo')
export class DemoAutomationController {
  private readonly logger = new Logger(DemoAutomationController.name);

  constructor(private readonly demoAutomationService: DemoAutomationService) {}

  @Post('login')
  async loginToWebsite(
    @Body()
    body: {
      websiteUrl: string;
      credentials: { username: string; password: string };
    },
  ): Promise<CreateDemoResponseDto> {
    this.logger.log(`🔐 Attempting login to: ${body.websiteUrl}`);

    try {
      const result = await this.demoAutomationService.loginToWebsite(
        body.websiteUrl,
        body.credentials,
      );

      this.logger.log(`✅ Login completed successfully: ${result.demoId}`);

      return result;
    } catch (error) {
      this.logger.error(`❌ Login failed: ${error.message}`, error.stack);
      throw error;
    }
  }

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
}
