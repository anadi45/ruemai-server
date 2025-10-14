import { Controller, Post, Body, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { DemoAutomationService } from './demo-automation.service';
import { CreateDemoResponseDto } from './demo-automation.dto';

@Controller('demo')
export class DemoAutomationController {
  constructor(private readonly demoAutomationService: DemoAutomationService) {}

  @Post('create-demo')
  @UseInterceptors(FileInterceptor('featureDoc'))
  async createDemo(
    @Body() body: {
      websiteUrl: string;
      credentials: { username: string; password: string };
      featureName?: string;
      goal?: string;
      maxSteps?: number;
    },
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<any> {
    try {
      if (file) {
        // Generate tour from uploaded document
        const result = await this.demoAutomationService.generateProductTourFromFile(
          body.websiteUrl,
          body.credentials,
          file,
          body.featureName
        );
        // Return just the tour steps from the scraped data
        return result.scrapedData?.pages?.[0]?.scrapedData || [];
      } else {
        // Generate tour with basic configuration
        const result = await this.demoAutomationService.generateTourForFeature(
          body.websiteUrl,
          body.credentials,
          body.featureName || 'Feature',
          body.goal || 'Complete the feature workflow',
          body.maxSteps || 10
        );
        
        // Return just the tour steps
        return result.tourSteps || [];
      }
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
