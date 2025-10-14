import { Controller, Post, Body, UseInterceptors, UploadedFiles } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { DemoAutomationService } from './demo-automation.service';
import { CreateDemoResponseDto } from './demo-automation.dto';

@Controller('demo')
export class DemoAutomationController {
  constructor(private readonly demoAutomationService: DemoAutomationService) {}

  @Post('create-demo')
  @UseInterceptors(FilesInterceptor('featureDocs', 10)) // Allow up to 10 files
  async createDemo(
    @Body() body: {
      websiteUrl: string;
      credentials: { username: string; password: string };
      featureName?: string;
    },
    @UploadedFiles() files: Express.Multer.File[],
  ): Promise<any> {
    try {
      // Generate tour from uploaded documents
      const result = await this.demoAutomationService.generateProductTourFromFiles(
        body.websiteUrl,
        body.credentials,
        files,
        body.featureName
      );
      // Return just the tour steps from the scraped data
      return result.scrapedData?.pages?.[0]?.scrapedData || [];
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
