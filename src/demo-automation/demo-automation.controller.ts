import { Controller, Post, Body, UseInterceptors, UploadedFiles, Req } from '@nestjs/common';
import { FilesInterceptor, AnyFilesInterceptor } from '@nestjs/platform-express';
import { DemoAutomationService } from './demo-automation.service';
import { CreateDemoResponseDto, CreateDemoWithFileRequestDto } from './demo-automation.dto';

@Controller('demo')
export class DemoAutomationController {
  constructor(private readonly demoAutomationService: DemoAutomationService) {}

  @Post('create-demo')
  @UseInterceptors(FilesInterceptor('featureDocs', 10)) // Allow up to 10 files
  async createDemo(
    @Body() body: CreateDemoWithFileRequestDto,
    @UploadedFiles() files: Express.Multer.File[],
  ): Promise<any> {
    try {
      console.log("🚀 ~ DemoAutomationController ~ createDemo ~ body:", body)
      
      // Validate credentials
      if (!body.username || !body.password) {
        throw new Error('Invalid credentials: username and password are required');
      }

      if (body.username === 'undefined' || body.password === 'undefined') {
        throw new Error('Invalid credentials: username and password cannot be undefined');
      }
      
      if (!files || files.length === 0) {
        throw new Error('No files received. Please ensure you are sending files with the field name "featureDocs" and using multipart/form-data content type.');
      }
      
      // Create credentials object from the request body
      const credentials = {
        username: body.username,
        password: body.password
      };
      
      // Generate tour from uploaded documents
      const result = await this.demoAutomationService.generateProductTourFromFiles(
        body.websiteUrl,
        credentials,
        files,
        body.featureName
      );
      // Return just the tour steps from the scraped data
      return result.scrapedData?.pages?.[0]?.scrapedData || [];
    } catch (error) {
      throw error;
    }
  }


  @Post('parse-document')
  @UseInterceptors(AnyFilesInterceptor())
  async parseDocument(
    @Body() body: { websiteUrl?: string; featureName?: string },
    @UploadedFiles() files: Express.Multer.File[],
  ): Promise<any> {
    try {
      console.log("🚀 ~ DemoAutomationController ~ parseDocument ~ body:", body);
      
      if (!files || files.length === 0) {
        throw new Error('No files received. Please ensure you are sending files with multipart/form-data content type.');
      }
      
      // Parse the first file and generate action plan
      const result = await this.demoAutomationService.parseDocumentFile(
        files[0],
        body.featureName,
        body.websiteUrl
      );
      
      return {
        success: result.success,
        featureDocs: result.featureDocs,
        validation: result.validation,
        actionPlan: result.actionPlan
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
