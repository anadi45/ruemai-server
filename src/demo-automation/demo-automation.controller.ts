import { Controller, Post, Body, UseInterceptors, UploadedFiles } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { DemoAutomationService } from './demo-automation.service';
import { CreateDemoRequestDto } from './demo-automation.dto';

@Controller('demo')
export class DemoAutomationController {
  constructor(
    private readonly demoAutomationService: DemoAutomationService
  ) {}

  @Post('create-demo')
  @UseInterceptors(FilesInterceptor('featureDocs', 10)) // Allow up to 10 files
  async createDemo(
    @Body() body: CreateDemoRequestDto,
    @UploadedFiles() files: Express.Multer.File[],
  ): Promise<any> {
    try {
      // Validate files (this validation cannot be done at DTO level for multipart/form-data)
      if (!files || files.length === 0) {
        throw new Error('No files received. Please ensure you are sending files with the field name "featureDocs" and using multipart/form-data content type.');
      }
      
      // Create credentials object from the request body
      const credentials = {
        username: body.username,
        password: body.password
      };
      
      // Generate tour from uploaded documents (includes action planning and console logging)
      const result = await this.demoAutomationService.generateProductTourFromFiles(
        body.websiteUrl,
        credentials,
        files,
        body.featureName
      );
      
      console.log(`\n✅ Demo automation completed successfully!`);
      console.log(`📊 Demo ID: ${result.demoId}`);
      console.log(`📝 Demo Name: ${result.demoName}`);
      console.log(`🔗 Final URL: ${result.summary?.finalUrl}`);
      
      // Return comprehensive result including tour steps and metadata
      return {
        demoId: result.demoId,
        demoName: result.demoName,
        websiteUrl: result.websiteUrl,
        loginStatus: result.loginStatus,
        tourSteps: result.scrapedData?.pages?.[0]?.scrapedData || [],
        summary: result.summary,
        pageInfo: result.pageInfo
      };
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
