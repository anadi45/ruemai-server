import {
  Controller,
  Post,
  Body,
  Get,
  Delete,
  UseInterceptors,
  UploadedFiles,
  ValidationPipe,
  UsePipes,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ExtractionService, ExtractionRequest } from './extraction.service';
import { Feature, ExtractionResult } from '../types/feature.interface';
import { UploadService } from '../upload/upload.service';
import {
  ExtractionRequestDto,
  WebsiteExtractionDto,
} from '../dto/extraction.dto';

@Controller('extract')
export class ExtractionController {
  constructor(
    private readonly extractionService: ExtractionService,
    private readonly uploadService: UploadService,
  ) {}

  @Post()
  @UseInterceptors(FilesInterceptor('files', 10, UploadService.multerConfig))
  @UsePipes(new ValidationPipe({ transform: true }))
  async extractFeatures(
    @UploadedFiles() files: Express.Multer.File[],
    @Body() body: ExtractionRequestDto,
  ): Promise<ExtractionResult> {
    const request: ExtractionRequest = {
      files,
      url: body.url,
    };

    return this.extractionService.extractFeatures(request);
  }

  @Post('documents')
  @UseInterceptors(FilesInterceptor('files', 10, UploadService.multerConfig))
  async extractFromDocuments(
    @UploadedFiles() files: Express.Multer.File[],
  ): Promise<{ features: Feature[] }> {
    const features = await this.extractionService.extractFromDocuments(files);
    return { features };
  }

  @Post('website')
  @UsePipes(new ValidationPipe({ transform: true }))
  async extractFromWebsite(
    @Body() body: WebsiteExtractionDto,
  ): Promise<{ features: Feature[] }> {
    const features = await this.extractionService.extractFromWebsite(body.url);
    return { features };
  }

  @Get('features')
  async getAllFeatures(): Promise<{ features: Feature[]; stats: any }> {
    const features = this.extractionService['storage'].getAllFeatures();
    const stats = this.extractionService.getStorageStats();
    return { features, stats };
  }

  @Get('stats')
  async getStats(): Promise<any> {
    return this.extractionService.getStorageStats();
  }

  @Delete('clear')
  async clearStorage(): Promise<{ message: string }> {
    this.extractionService.clearStorage();
    return { message: 'Storage cleared successfully' };
  }
}
