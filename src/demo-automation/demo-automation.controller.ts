import { Controller, Post, Body, Get, Param } from '@nestjs/common';
import { DemoAutomationService } from './demo-automation.service';
import { 
  CreateDemoResponseDto, 
  CreateDemoRequestDto, 
  GenerateTourRequestDto 
} from './demo-automation.dto';
import { DemoAutomationResult } from './types/demo-automation.types';

@Controller('demo')
export class DemoAutomationController {
  constructor(private readonly demoAutomationService: DemoAutomationService) {}

  @Post('create-demo')
  async createDemo(
    @Body() body: CreateDemoRequestDto,
  ): Promise<CreateDemoResponseDto> {
    try {
      if (body.tourConfig && body.featureDocs) {
        // Generate product tour
        const result = await this.demoAutomationService.generateProductTour(
          body.websiteUrl,
          body.credentials,
          body.tourConfig,
          body.featureDocs
        );
        return result;
      } else {
        // Simple login demo
        const result = await this.demoAutomationService.loginToWebsite(
          body.websiteUrl,
          body.credentials,
        );
        return result;
      }
    } catch (error) {
      throw error;
    }
  }

  @Post('generate-tour')
  async generateTour(
    @Body() body: GenerateTourRequestDto,
  ): Promise<DemoAutomationResult> {
    try {
      const result = await this.demoAutomationService.generateTourForFeature(
        body.websiteUrl,
        body.credentials,
        body.featureName,
        body.goal,
        body.maxSteps || 10
      );
      return result;
    } catch (error) {
      throw error;
    }
  }

  @Post('stop-automation')
  async stopAutomation(): Promise<{ message: string }> {
    try {
      await this.demoAutomationService.stopAllAutomation();
      return { message: 'All automation stopped successfully' };
    } catch (error) {
      throw error;
    }
  }
}
