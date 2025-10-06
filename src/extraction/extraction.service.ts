import { Injectable } from '@nestjs/common';
import { UploadService } from '../upload/upload.service';
import { WebCrawlerService } from '../web-crawler/web-crawler.service';
import { ParserService } from '../parser/parser.service';
import { FeatureExtractorService } from '../feature-extractor/feature-extractor.service';
import { storage } from '../utils/storage';
import { DebugLogger } from '../utils/debug-logger';
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
    private readonly debugLogger: DebugLogger,
  ) {}

  async extractFeatures(request: ExtractionRequest): Promise<ExtractionResult> {
    const startTime = Date.now();
    let documentsProcessed = 0;
    let pagesCrawled = 0;
    let featuresFound = 0;

    try {
      // Process files and URL in parallel
      const [fileResults, urlResults] = await Promise.allSettled([
        this.processFiles(request.files),
        this.processUrl(request.url),
      ]);

      // Handle file processing results
      if (fileResults.status === 'fulfilled') {
        documentsProcessed = fileResults.value.documentsProcessed;
        featuresFound += fileResults.value.featuresFound;
      } else {
        console.warn('File processing failed:', fileResults.reason);
      }

      // Handle URL processing results
      if (urlResults.status === 'fulfilled') {
        pagesCrawled = urlResults.value.pagesCrawled;
        featuresFound += urlResults.value.featuresFound;
      } else {
        console.warn('URL processing failed:', urlResults.reason);
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

      const result = {
        features: allFeatures,
        stats,
      };

      // Log extraction results for debugging
      await this.debugLogger.logExtractionResults('FEATURE_EXTRACTION', {
        request: {
          hasFiles: !!request.files?.length,
          fileCount: request.files?.length || 0,
          hasUrl: !!request.url,
          url: request.url,
        },
        results: result,
        processingTime: `${processingTime}s`,
      });

      return result;
    } catch (error) {
      throw new Error(`Extraction failed: ${error.message}`);
    }
  }

  async extractFromDocuments(files: Express.Multer.File[]): Promise<Feature[]> {
    const documents = await this.uploadService.processMultipleFiles(files);

    // Process all documents in parallel
    const documentPromises = documents.map(async (document) => {
      const chunks = await this.parserService.processContentWithOverlap(
        document.content,
      );
      const features =
        await this.featureExtractorService.extractFeaturesFromChunks(
          chunks,
          document.filename,
        );
      return features;
    });

    const featureArrays = await Promise.all(documentPromises);
    const allFeatures = featureArrays.flat();

    return this.deduplicateFeatures(allFeatures);
  }

  async extractFromWebsite(url: string): Promise<Feature[]> {
    const crawlResult = await this.webCrawlerService.crawlWebsite(url);

    // Process all pages in parallel
    const pagePromises = crawlResult.pages.map(async (page) => {
      const chunks = await this.parserService.processContentWithOverlap(
        page.content,
      );
      const features =
        await this.featureExtractorService.extractFeaturesFromChunks(
          chunks,
          page.url,
        );
      return features;
    });

    const featureArrays = await Promise.all(pagePromises);
    const allFeatures = featureArrays.flat();

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

  private async processFiles(files?: Express.Multer.File[]): Promise<{
    documentsProcessed: number;
    featuresFound: number;
  }> {
    if (!files || files.length === 0) {
      return { documentsProcessed: 0, featuresFound: 0 };
    }

    const documents = await this.uploadService.processMultipleFiles(files);
    const documentsProcessed = documents.length;

    // Process all documents in parallel
    const documentPromises = documents.map(async (document) => {
      const chunks = await this.parserService.processContentWithOverlap(
        document.content,
      );
      const features =
        await this.featureExtractorService.extractFeaturesFromChunks(
          chunks,
          document.filename,
        );
      storage.addFeatures(features);
      return features.length;
    });

    const featureCounts = await Promise.all(documentPromises);
    const featuresFound = featureCounts.reduce((sum, count) => sum + count, 0);

    return { documentsProcessed, featuresFound };
  }

  private async processUrl(url?: string): Promise<{
    pagesCrawled: number;
    featuresFound: number;
  }> {
    if (!url) {
      return { pagesCrawled: 0, featuresFound: 0 };
    }

    const crawlResult = await this.webCrawlerService.crawlWebsite(url);
    const pagesCrawled = crawlResult.totalPages;

    // Process all crawled pages in parallel
    const pagePromises = crawlResult.pages.map(async (page) => {
      const chunks = await this.parserService.processContentWithOverlap(
        page.content,
      );
      const features =
        await this.featureExtractorService.extractFeaturesFromChunks(
          chunks,
          page.url,
        );
      storage.addFeatures(features);
      return features.length;
    });

    const featureCounts = await Promise.all(pagePromises);
    const featuresFound = featureCounts.reduce((sum, count) => sum + count, 0);

    return { pagesCrawled, featuresFound };
  }
}
