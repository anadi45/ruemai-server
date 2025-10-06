import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { PromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { RunnableSequence } from '@langchain/core/runnables';
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
  private readonly model: ChatGoogleGenerativeAI;
  private readonly extractionPrompt: PromptTemplate;

  constructor(private configService: ConfigService) {
    // Initialize Gemini model
    this.model = new ChatGoogleGenerativeAI({
      model: 'gemini-1.5-flash',
      temperature: 0.1,
      maxOutputTokens: 4000,
      apiKey: this.configService.get<string>('GEMINI_API_KEY'),
    });

    // Create prompt template for feature extraction
    this.extractionPrompt = PromptTemplate.fromTemplate(`
You are a technical documentation analyst. Extract ALL product features from the provided documentation.

Documentation:
{content}

Instructions:
1. Extract every distinct feature mentioned
2. Be comprehensive but avoid duplicates
3. Include technical capabilities, integrations, and functions
4. Description should be clear and actionable
5. Focus on what the product can do, not just what it is

Return a JSON object with a "features" array where each object has:
- name: Short feature name (2-6 words)
- description: Clear 1-2 sentence description
- source: The URL or document name where found
- category: Optional category (e.g., "API", "UI", "Integration", "Security")
- confidence: Optional confidence score (0-1)

Return only the JSON object, no other text.
`);
  }

  async extractFeatures(content: string, source: string): Promise<Feature[]> {
    try {
      const chain = RunnableSequence.from([
        this.extractionPrompt,
        this.model,
        new StringOutputParser(),
      ]);

      const response = await chain.invoke({ content });

      const parsed = JSON.parse(response);
      const validated = ExtractionResponseSchema.parse(parsed);

      // Add source to all features and ensure required fields are present
      const features = validated.features.map((feature) => ({
        name: feature.name,
        description: feature.description || 'No description provided',
        source: source,
        category: feature.category,
        confidence: feature.confidence,
      }));

      return features;
    } catch (error) {
      console.error('Gemini extraction failed:', error);
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
