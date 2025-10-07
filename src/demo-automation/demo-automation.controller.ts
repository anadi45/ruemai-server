import {
  Controller,
  Post,
  Body,
  ValidationPipe,
  UsePipes,
  Logger,
} from '@nestjs/common';
import { DemoAutomationService } from './demo-automation.service';
import {
  CreateDemoRequestDto,
  CreateDemoResponseDto,
} from '../dto/demo-automation.dto';

@Controller('demo')
export class DemoAutomationController {
  private readonly logger = new Logger(DemoAutomationController.name);

  constructor(private readonly demoAutomationService: DemoAutomationService) {}

  @Post('create-demo')
  @UsePipes(new ValidationPipe({ transform: true }))
  async createDemo(
    @Body() createDemoRequest: CreateDemoRequestDto,
  ): Promise<CreateDemoResponseDto> {
    this.logger.log(
      `🎬 Creating demo for website: ${createDemoRequest.websiteUrl}`,
    );

    try {
      const result =
        await this.demoAutomationService.createDemo(createDemoRequest);

      this.logger.log(
        `✅ Demo created successfully: ${result.demoId} with ${result.generatedScripts.length} scripts`,
      );

      return result;
    } catch (error) {
      this.logger.error(
        `❌ Failed to create demo: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

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
}
