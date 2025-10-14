import { Controller, Post, Body, UseInterceptors, UploadedFiles, Req } from '@nestjs/common';
import { FilesInterceptor, AnyFilesInterceptor } from '@nestjs/platform-express';
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
      
      if (!files || files.length === 0) {
        throw new Error('No files received. Please ensure you are sending files with the field name "featureDocs" and using multipart/form-data content type.');
      }
      
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

  @Post('create-demo-flexible')
  @UseInterceptors(AnyFilesInterceptor())
  async createDemoFlexible(
    @Body() body: {
      websiteUrl: string;
      credentials: { username: string; password: string };
      featureName?: string;
    },
    @UploadedFiles() files: Express.Multer.File[],
    @Req() req: any,
  ): Promise<any> {
    try {
      // Debug: Log the received files and request details
      console.log('Flexible endpoint - Received files:', files);
      console.log('Files length:', files?.length || 0);
      console.log('Body:', body);
      console.log('Request headers:', req.headers);
      console.log('Content-Type:', req.headers['content-type']);
      
      if (!files || files.length === 0) {
        throw new Error('No files received. Please ensure you are sending files with multipart/form-data content type.');
      }
      
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
