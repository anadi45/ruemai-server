import { Injectable } from '@nestjs/common';
import { LLMService } from '../llm/llm.service';
import { Feature } from '../types/feature.interface';

@Injectable()
export class FeatureExtractorService {
  constructor(private readonly llmService: LLMService) {}

  async extractFeatures(content: string, source: string): Promise<Feature[]> {
    try {
      const result = await this.llmService.extractProductsFromText(content);

      // Convert products to features
      const features: Feature[] = result.products.map((product) => ({
        name: product.name,
        description: product.description,
        source: source,
        category: product.category,
        confidence: product.confidence,
      }));

      return features;
    } catch (error) {
      console.error('Feature extraction failed:', error);
      throw new Error(`Failed to extract features: ${error.message}`);
    }
  }

  async extractFeaturesFromChunks(
    chunks: string[],
    source: string,
  ): Promise<Feature[]> {
    const allFeatures: Feature[] = [];

    // Use batch processing for better performance
    const BATCH_SIZE = 5; // Process 5 chunks at a time to avoid overwhelming the API

    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE);

      try {
        // Use batch processing from LLM service
        const batchResults =
          await this.llmService.extractProductsFromTextBatch(batch);

        // Convert all results to features
        for (let j = 0; j < batchResults.length; j++) {
          const result = batchResults[j];
          const features: Feature[] = result.products.map((product) => ({
            name: product.name,
            description: product.description,
            source: source,
            category: product.category,
            confidence: product.confidence,
          }));
          allFeatures.push(...features);
        }
      } catch (error) {
        console.warn(
          `Failed to extract features from batch ${Math.floor(i / BATCH_SIZE) + 1}:`,
          error.message,
        );

        // Fallback to individual processing for this batch
        const fallbackPromises = batch.map(async (chunk, index) => {
          try {
            const features = await this.extractFeatures(chunk, source);
            return features;
          } catch (error) {
            console.warn(
              `Failed to extract features from chunk ${i + index + 1}:`,
              error.message,
            );
            return [];
          }
        });

        const fallbackResults = await Promise.all(fallbackPromises);
        for (const features of fallbackResults) {
          allFeatures.push(...features);
        }
      }
    }

    // Deduplicate features
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
}
