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

    // Process chunks in parallel for better performance
    const chunkPromises = chunks.map(async (chunk, index) => {
      try {
        const features = await this.extractFeatures(chunk, source);
        return features;
      } catch (error) {
        console.warn(
          `Failed to extract features from chunk ${index + 1}:`,
          error.message,
        );
        return [];
      }
    });

    const chunkResults = await Promise.all(chunkPromises);

    // Flatten all features
    for (const features of chunkResults) {
      allFeatures.push(...features);
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
