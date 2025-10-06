import {
  Controller,
  Post,
  Body,
  UseInterceptors,
  UploadedFiles,
  ValidationPipe,
  UsePipes,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ExtractionService, ExtractionRequest } from './extraction.service';
import { ExtractionResult } from '../types/feature.interface';
import { UploadService } from '../upload/upload.service';
import { ExtractionRequestDto } from '../dto/extraction.dto';

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
}
