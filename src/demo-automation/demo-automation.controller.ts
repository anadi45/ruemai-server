import { Controller, Post, Body } from '@nestjs/common';
import { DemoAutomationService } from './demo-automation.service';
import { CreateDemoResponseDto, CreateDemoRequestDto } from './demo-automation.dto';

@Controller('demo')
export class DemoAutomationController {
  constructor(private readonly demoAutomationService: DemoAutomationService) { }

  @Post('create-demo')
  async createDemo(
    @Body() body: CreateDemoRequestDto,
  ): Promise<CreateDemoResponseDto> {
    try {
      const result = await this.demoAutomationService.generateProductTour(
        body.websiteUrl,
        body.credentials,
        body.featureFiles,
        body.targetFeature,
      );

      return result;
    } catch (error) {
      console.error('❌ Demo creation failed:', error);
      throw error;
    }
  }
}
