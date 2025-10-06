import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFiles,
  Body,
  BadRequestException,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  ProductExtractionService,
  ExtractionResult,
} from './product-extraction.service';
import { UploadService } from '../upload/upload.service';

export class ExtractProductsDto {
  websiteUrl: string;
}

@Controller('api/products')
export class ProductExtractionController {
  constructor(
    private readonly productExtractionService: ProductExtractionService,
    private readonly uploadService: UploadService,
  ) {}

  @Post('extract')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FilesInterceptor('files', 10, UploadService.multerConfig))
  async extractProducts(
    @UploadedFiles() files: Express.Multer.File[],
    @Body() body: ExtractProductsDto,
  ): Promise<ExtractionResult> {
    if (!files || files.length === 0) {
      throw new BadRequestException('No files uploaded');
    }

    if (!body.websiteUrl) {
      throw new BadRequestException('Website URL is required');
    }

    // Validate website URL
    try {
      new URL(body.websiteUrl);
    } catch (error) {
      throw new BadRequestException('Invalid website URL format');
    }

    const filePaths = files.map((file) => file.path);
    const mimeTypes = files.map((file) => file.mimetype);

    try {
      const result =
        await this.productExtractionService.extractProductsFromFilesAndWebsite(
          filePaths,
          mimeTypes,
          body.websiteUrl,
        );

      return result;
    } catch (error) {
      throw new BadRequestException(
        `Failed to extract products: ${error.message}`,
      );
    }
  }

  @Post('extract-from-website')
  @HttpCode(HttpStatus.OK)
  async extractFromWebsiteOnly(
    @Body() body: ExtractProductsDto,
  ): Promise<ExtractionResult> {
    if (!body.websiteUrl) {
      throw new BadRequestException('Website URL is required');
    }

    // Validate website URL
    try {
      new URL(body.websiteUrl);
    } catch (error) {
      throw new BadRequestException('Invalid website URL format');
    }

    try {
      const result =
        await this.productExtractionService.extractProductsFromFilesAndWebsite(
          [],
          [],
          body.websiteUrl,
        );

      return result;
    } catch (error) {
      throw new BadRequestException(
        `Failed to extract products from website: ${error.message}`,
      );
    }
  }
}
