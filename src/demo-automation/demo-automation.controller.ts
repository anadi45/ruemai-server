import {
  Controller,
  Post,
  Body,
  ValidationPipe,
  UsePipes,
  Logger,
} from '@nestjs/common';
import { DemoAutomationService } from './demo-automation.service';
import { CreateDemoResponseDto } from '../dto/demo-automation.dto';

@Controller('demo')
export class DemoAutomationController {
  private readonly logger = new Logger(DemoAutomationController.name);

  constructor(private readonly demoAutomationService: DemoAutomationService) {}

  @Post('create-application-demo')
  async createApplicationFeatureDemo(): Promise<CreateDemoResponseDto> {
    this.logger.log('🎬 Creating application feature demo...');

    try {
      const result =
        await this.demoAutomationService.createApplicationFeatureDemo();

      this.logger.log(
        `✅ Application feature demo created successfully: ${result.demoId} with ${result.generatedScripts.length} scripts`,
      );

      return result;
    } catch (error) {
      this.logger.error(
        `❌ Failed to create application feature demo: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  @Post('create-automated-demo')
  async createAutomatedApplicationDemo(
    @Body()
    body?: {
      targetUrl?: string;
      credentials?: { username: string; password: string };
    },
  ): Promise<CreateDemoResponseDto> {
    this.logger.log('🤖 Creating automated application demo with Puppeteer...');

    try {
      const result =
        await this.demoAutomationService.createAutomatedApplicationDemo(
          body?.targetUrl,
          body?.credentials,
        );

      this.logger.log(
        `✅ Automated application demo created successfully: ${result.demoId} with ${result.generatedScripts.length} scripts`,
      );

      return result;
    } catch (error) {
      this.logger.error(
        `❌ Failed to create automated application demo: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  @Post('debug-ui')
  async debugUI(
    @Body()
    body?: {
      targetUrl?: string;
      credentials?: { username: string; password: string };
    },
  ): Promise<any> {
    this.logger.log('🔍 Debugging UI element detection...');

    try {
      const result = await this.demoAutomationService.debugUIElements(
        body?.targetUrl || 'http://localhost:3001',
        body?.credentials || {
          username: 'demo@example.com',
          password: 'demo123',
        },
      );

      return result;
    } catch (error) {
      this.logger.error(
        `❌ Failed to debug UI elements: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
