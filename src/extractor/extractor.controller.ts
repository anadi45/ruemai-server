import { Controller, Post, Body, Get, Delete } from '@nestjs/common';
import { ExtractorService } from './extractor.service';
import { Feature } from '../types/feature.interface';
import { storage } from '../utils/storage';

@Controller('extractor')
export class ExtractorController {
  constructor(private readonly extractorService: ExtractorService) {}

  @Post('extract')
  async extractFeatures(
    @Body() body: { content: string; source: string },
  ): Promise<{ features: Feature[] }> {
    const { content, source } = body;
    const features = await this.extractorService.extractFeatures(
      content,
      source,
    );
    return { features };
  }

  @Get('features')
  async getAllFeatures(): Promise<{ features: Feature[]; stats: any }> {
    const features = storage.getAllFeatures();
    const stats = storage.getStats();
    return { features, stats };
  }

  @Delete('clear')
  async clearStorage(): Promise<{ message: string }> {
    storage.clear();
    return { message: 'Storage cleared successfully' };
  }
}
