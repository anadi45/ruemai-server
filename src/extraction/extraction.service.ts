import { Injectable } from '@nestjs/common';
import { UploadService } from '../upload/upload.service';
import { WebCrawlerService } from '../web-crawler/web-crawler.service';
import { ParserService } from '../parser/parser.service';
import { FeatureExtractorService } from '../feature-extractor/feature-extractor.service';
import { storage } from '../utils/storage';
import {
  Feature,
  ExtractionResult,
  ExtractionStats,
} from '../types/feature.interface';

export interface ExtractionRequest {
  files?: Express.Multer.File[];
  url?: string;
}

@Injectable()
export class ExtractionService {
  constructor(
    private readonly uploadService: UploadService,
    private readonly webCrawlerService: WebCrawlerService,
    private readonly parserService: ParserService,
    private readonly featureExtractorService: FeatureExtractorService,
  ) {}

  async extractFeatures(request: ExtractionRequest): Promise<ExtractionResult> {
    const startTime = Date.now();
    let documentsProcessed = 0;
    let pagesCrawled = 0;
    let featuresFound = 0;

    try {
      // Process uploaded files
      if (request.files && request.files.length > 0) {
        const documents = await this.uploadService.processMultipleFiles(
          request.files,
        );
        documentsProcessed = documents.length;

        // Extract features from documents
        for (const document of documents) {
          const chunks = await this.parserService.processContentWithOverlap(
            document.content,
          );
          const features =
            await this.featureExtractorService.extractFeaturesFromChunks(
              chunks,
              document.filename,
            );
          storage.addFeatures(features);
          featuresFound += features.length;
        }
      }

      // Crawl website if URL provided
      if (request.url) {
        const crawlResult = await this.webCrawlerService.crawlWebsite(
          request.url,
        );
        pagesCrawled = crawlResult.totalPages;

        // Extract features from crawled pages
        for (const page of crawlResult.pages) {
          const chunks = await this.parserService.processContentWithOverlap(
            page.content,
          );
          const features =
            await this.featureExtractorService.extractFeaturesFromChunks(
              chunks,
              page.url,
            );
          storage.addFeatures(features);
          featuresFound += features.length;
        }
      }

      // Get all features and deduplicate
      const allFeatures = this.deduplicateFeatures(storage.getAllFeatures());
      storage.clearFeatures();
      storage.addFeatures(allFeatures);

      const processingTime = ((Date.now() - startTime) / 1000).toFixed(2);

      const stats: ExtractionStats = {
        documentsProcessed,
        pagesCrawled,
        featuresFound: allFeatures.length,
        processingTime: `${processingTime}s`,
      };

      return {
        features: allFeatures,
        stats,
      };
    } catch (error) {
      throw new Error(`Extraction failed: ${error.message}`);
    }
  }

  async extractFromDocuments(files: Express.Multer.File[]): Promise<Feature[]> {
    const documents = await this.uploadService.processMultipleFiles(files);
    const allFeatures: Feature[] = [];

    for (const document of documents) {
      const chunks = await this.parserService.processContentWithOverlap(
        document.content,
      );
      const features =
        await this.featureExtractorService.extractFeaturesFromChunks(
          chunks,
          document.filename,
        );
      allFeatures.push(...features);
    }

    return this.deduplicateFeatures(allFeatures);
  }

  async extractFromWebsite(url: string): Promise<Feature[]> {
    const crawlResult = await this.webCrawlerService.crawlWebsite(url);
    const allFeatures: Feature[] = [];

    for (const page of crawlResult.pages) {
      const chunks = await this.parserService.processContentWithOverlap(
        page.content,
      );
      const features =
        await this.featureExtractorService.extractFeaturesFromChunks(
          chunks,
          page.url,
        );
      allFeatures.push(...features);
    }

    return this.deduplicateFeatures(allFeatures);
  }

  private deduplicateFeatures(features: Feature[]): Feature[] {
    const seen = new Set<string>();
    const deduplicated: Feature[] = [];

    for (const feature of features) {
      // Create a key based on name and description for deduplication
      const key = `${feature.name.toLowerCase()}-${feature.description.toLowerCase()}`;

      if (!seen.has(key)) {
        seen.add(key);
        deduplicated.push(feature);
      }
    }

    return deduplicated;
  }

  getStorageStats() {
    return storage.getStats();
  }

  clearStorage() {
    storage.clear();
  }
}
