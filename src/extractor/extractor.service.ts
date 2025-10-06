import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { z } from 'zod';
import { Feature } from '../types/feature.interface';

const FeatureSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().min(10).max(500),
  source: z.string().min(1),
  category: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
});

const ExtractionResponseSchema = z.object({
  features: z.array(FeatureSchema),
});

@Injectable()
export class ExtractorService {
  private openai: OpenAI;

  constructor(private configService: ConfigService) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY'),
    });
  }

  async extractFeatures(content: string, source: string): Promise<Feature[]> {
    try {
      const prompt = this.buildExtractionPrompt(content);

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: [
          {
            role: 'system',
            content:
              'You are a technical documentation analyst. Extract ALL product features from the provided documentation. Return a JSON array where each object has: name (short feature name 2-6 words), description (clear 1-2 sentence description), source (the URL or document name where found), category (optional), confidence (optional 0-1). Extract every distinct feature mentioned. Be comprehensive but avoid duplicates. Include technical capabilities, integrations, and functions. Description should be clear and actionable.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.1,
        max_tokens: 4000,
        response_format: { type: 'json_object' },
      });

      const content_response = response.choices[0]?.message?.content;
      if (!content_response) {
        throw new Error('No response from OpenAI');
      }

      const parsed = JSON.parse(content_response);
      const validated = ExtractionResponseSchema.parse(parsed);

      // Add source to all features
      const features = validated.features.map((feature) => ({
        ...feature,
        source: source,
      }));

      return features;
    } catch (error) {
      console.error('OpenAI extraction failed:', error);
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

  private buildExtractionPrompt(content: string): string {
    return `
Extract ALL product features from the provided documentation.

Return a JSON object with a "features" array where each object has:
- name: Short feature name (2-6 words)
- description: Clear 1-2 sentence description
- source: The URL or document name where found
- category: Optional category (e.g., "API", "UI", "Integration", "Security")
- confidence: Optional confidence score (0-1)

Rules:
- Extract every distinct feature mentioned
- Be comprehensive but avoid duplicates
- Include technical capabilities, integrations, and functions
- Description should be clear and actionable
- Focus on what the product can do, not just what it is

Documentation:
${content}

Return only the JSON object, no other text.
`;
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

  async extractFeaturesWithRetry(
    content: string,
    source: string,
    maxRetries: number = 3,
  ): Promise<Feature[]> {
    let lastError: Error;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.extractFeatures(content, source);
      } catch (error) {
        lastError = error;
        console.warn(`Extraction attempt ${attempt} failed:`, error.message);

        if (attempt < maxRetries) {
          // Wait before retry (exponential backoff)
          await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
        }
      }
    }

    throw new Error(
      `Failed to extract features after ${maxRetries} attempts: ${lastError.message}`,
    );
  }
}
