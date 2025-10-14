import { Controller, Post, Body, Get, Param, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { DemoAutomationService } from './demo-automation.service';
import { 
  CreateDemoResponseDto, 
  CreateDemoRequestDto, 
  CreateDemoWithFileRequestDto,
  GenerateTourRequestDto 
} from './demo-automation.dto';
import { DemoAutomationResult, TourConfig } from './types/demo-automation.types';

@Controller('demo')
export class DemoAutomationController {
  constructor(private readonly demoAutomationService: DemoAutomationService) {}

  @Post('create-demo')
  async createDemo(
    @Body() body: CreateDemoRequestDto,
  ): Promise<CreateDemoResponseDto> {
    try {
      // Generate product tour with default configuration
      const tourConfig: TourConfig = {
        goal: body.featureDocs.description,
        featureName: body.featureDocs.featureName,
        maxSteps: 10,
        timeout: 30000,
        includeScreenshots: true
      };

      const result = await this.demoAutomationService.generateProductTour(
        body.websiteUrl,
        body.credentials,
        tourConfig,
        body.featureDocs
      );
      return result;
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

  @Post('create-demo-from-file')
  @UseInterceptors(FileInterceptor('featureDoc'))
  async createDemoFromFile(
    @Body() body: CreateDemoWithFileRequestDto,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<CreateDemoResponseDto> {
    try {
      if (!file) {
        throw new Error('Feature documentation file is required');
      }

      const result = await this.demoAutomationService.generateProductTourFromFile(
        body.websiteUrl,
        body.credentials,
        file,
        body.featureName
      );
      return result;
    } catch (error) {
      throw error;
    }
  }

  @Post('parse-document')
  @UseInterceptors(FileInterceptor('document'))
  async parseDocument(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { featureName?: string }
  ): Promise<{ success: boolean; featureDocs: any; validation: any }> {
    try {
      if (!file) {
        throw new Error('Document file is required');
      }

      const result = await this.demoAutomationService.parseDocumentFile(
        file,
        body.featureName
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
