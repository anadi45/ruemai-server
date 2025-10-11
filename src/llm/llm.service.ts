import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatOpenAI } from '@langchain/openai';
import { PromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { RunnableSequence } from '@langchain/core/runnables';
import { z } from 'zod';

export interface ProductFeature {
  name: string;
  description: string;
  category?: string;
  features?: string[];
  confidence: number;
}

export interface ExtractionResult {
  products: ProductFeature[];
  summary?: string;
}

// Zod schemas for structured output
const ProductFeatureSchema = z.object({
  name: z.string(),
  description: z.string(),
  category: z.string().optional(),
  features: z.array(z.string()).optional(),
  confidence: z.number().min(0).max(1),
});

const ExtractionResultSchema = z.object({
  products: z.array(ProductFeatureSchema),
  summary: z.string().optional(),
});

@Injectable()
export class LLMService {
  private readonly model: ChatOpenAI;
  private readonly productExtractionPrompt: PromptTemplate;
  private readonly productAnalysisPrompt: PromptTemplate;

  constructor(private readonly configService: ConfigService) {
    // Initialize OpenAI model with optimized settings
    this.model = new ChatOpenAI({
      model: 'gpt-4o-mini', // Faster and cheaper model
      temperature: 0.1,
      openAIApiKey: this.configService.get<string>('OPENAI_API_KEY'),
      maxTokens: 4000, // Limit response size for faster processing
      timeout: 30000, // 30 second timeout
    });

    // Create prompt template for product extraction
    this.productExtractionPrompt = PromptTemplate.fromTemplate(`
You are an expert product analyst. Your task is to extract product features and capabilities from the given text.

Text to analyze:
{text}

Instructions:
1. Identify all products, services, features, or capabilities mentioned in the text
2. For each product/feature, extract:
   - Name: Clear, concise product/feature name
   - Description: Detailed description of what it does
   - Category: Type of product (API, Service, Platform, Tool, Framework, Library, SDK, Plugin, Extension, Module, Component, Feature, Solution, Application, Software, etc.)
   - Features: List of specific capabilities or features (if applicable)
   - Confidence: Rate from 0.0 to 1.0 based on how clearly the product is described

3. Focus on actual products/services, not generic terms
4. Avoid extracting copyright notices, terms of service, or legal text
5. Be precise and avoid duplicates

Return the results in the following JSON format:
{{
  "products": [
    {{
      "name": "Product Name",
      "description": "Detailed description of the product",
      "category": "Product Type",
      "features": ["feature1", "feature2"],
      "confidence": 0.9
    }}
  ],
  "summary": "Brief summary of the main products/services found"
}}

Only return valid JSON. Do not include any other text.
`);

    // Create prompt template for product analysis and enhancement
    this.productAnalysisPrompt = PromptTemplate.fromTemplate(`
You are an expert product analyst. Analyze the following products and enhance their descriptions.

Products to analyze:
{products}

Instructions:
1. Review each product for clarity and completeness
2. Enhance descriptions to be more detailed and informative
3. Improve categorization accuracy
4. Add missing features or capabilities if mentioned in the context
5. Rate confidence based on the quality of information available
6. Remove any products that are not actual products/services

Return the enhanced results in the following JSON format:
{{
  "products": [
    {{
      "name": "Enhanced Product Name",
      "description": "Enhanced detailed description",
      "category": "Accurate Category",
      "features": ["enhanced feature1", "enhanced feature2"],
      "confidence": 0.95
    }}
  ],
  "summary": "Summary of enhanced products"
}}

Only return valid JSON. Do not include any other text.
`);
  }

  async extractProductsFromText(text: string): Promise<ExtractionResult> {
    try {
      const structuredModel = this.model.withStructuredOutput(
        ExtractionResultSchema,
      );

      const chain = RunnableSequence.from([
        this.productExtractionPrompt,
        structuredModel,
      ]);

      const result = await chain.invoke({ text });

      // Validate and clean the results
      const cleanedProducts = this.validateAndCleanProducts(
        result.products || [],
      );

      const extractionResult = {
        products: cleanedProducts,
        summary: result.summary,
      };

      return extractionResult;
    } catch (error) {
      // Fallback to basic extraction if LLM fails
      return this.fallbackExtraction(text);
    }
  }

  async extractProductsFromTextBatch(
    texts: string[],
  ): Promise<ExtractionResult[]> {
    try {
      const structuredModel = this.model.withStructuredOutput(
        ExtractionResultSchema,
      );

      // Process all texts in parallel
      const batchPromises = texts.map(async (text) => {
        try {
          const chain = RunnableSequence.from([
            this.productExtractionPrompt,
            structuredModel,
          ]);

          const result = await chain.invoke({ text });
          const cleanedProducts = this.validateAndCleanProducts(
            result.products || [],
          );

          return {
            products: cleanedProducts,
            summary: result.summary,
          };
        } catch (error) {
          return this.fallbackExtraction(text);
        }
      });

      return await Promise.all(batchPromises);
    } catch (error) {
      // Fallback to individual processing
      return Promise.all(
        texts.map((text) => this.extractProductsFromText(text)),
      );
    }
  }

  async enhanceProducts(
    products: ProductFeature[],
    context?: string,
  ): Promise<ExtractionResult> {
    try {
      const productsJson = JSON.stringify(products, null, 2);
      const structuredModel = this.model.withStructuredOutput(
        ExtractionResultSchema,
      );

      const chain = RunnableSequence.from([
        this.productAnalysisPrompt,
        structuredModel,
      ]);

      const result = await chain.invoke({
        products: productsJson,
        context: context || 'No additional context provided',
      });

      const cleanedProducts = this.validateAndCleanProducts(
        result.products || [],
      );

      return {
        products: cleanedProducts,
        summary: result.summary,
      };
    } catch (error) {
      // Return original products if enhancement fails
      return {
        products: products,
        summary: 'Products could not be enhanced due to processing error',
      };
    }
  }

  async extractProductsFromWebsiteContent(
    htmlContent: string,
    url: string,
  ): Promise<ExtractionResult> {
    try {
      // Create a specialized prompt for website content
      const websitePrompt = PromptTemplate.fromTemplate(`
You are an expert web content analyst. Extract product information from this website content.

Website URL: {url}
Content: {content}

Instructions:
1. Focus on actual products, services, or features offered by this website
2. Look for product names, descriptions, features, and capabilities
3. Extract pricing information if available
4. Identify the main value propositions
5. Categorize products appropriately

Return the results in the following JSON format:
{{
  "products": [
    {{
      "name": "Product Name",
      "description": "Detailed description",
      "category": "Product Type",
      "features": ["feature1", "feature2"],
      "confidence": 0.9,
      "price": "Price if available"
    }}
  ],
  "summary": "Summary of the website's main products/services"
}}

Only return valid JSON. Do not include any other text.
`);

      const structuredModel = this.model.withStructuredOutput(
        ExtractionResultSchema,
      );

      const chain = RunnableSequence.from([websitePrompt, structuredModel]);

      const result = await chain.invoke({
        content: htmlContent,
        url: url,
      });
      const cleanedProducts = this.validateAndCleanProducts(
        result.products || [],
      );

      return {
        products: cleanedProducts,
        summary: result.summary,
      };
    } catch (error) {
      return this.fallbackExtraction(htmlContent);
    }
  }

  async generateWISFromUIElements(
    prompt: string,
    uiElements: any[],
  ): Promise<any[]> {
    try {
      // Create a specialized prompt for WIS generation
      const wisPrompt = PromptTemplate.fromTemplate(`
{prompt}

Return only valid JSON array. Do not include any other text or explanations.
      `);

      // Use the model directly for WIS generation
      const response = await this.model.invoke([
        { role: 'user', content: prompt },
      ]);

      // Parse the JSON response
      const responseText = response.content as string;

      // Try to extract JSON from the response
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const wisScripts = JSON.parse(jsonMatch[0]);
        return wisScripts;
      }

      // If no JSON array found, try to parse as single object
      const singleObjectMatch = responseText.match(/\{[\s\S]*\}/);
      if (singleObjectMatch) {
        const singleScript = JSON.parse(singleObjectMatch[0]);
        return [singleScript];
      }

      throw new Error('No valid JSON found in LLM response');
    } catch (error) {
      throw error;
    }
  }

  private validateAndCleanProducts(products: any[]): ProductFeature[] {
    if (!Array.isArray(products)) {
      return [];
    }

    return products
      .filter((product) => {
        // Basic validation
        return (
          product &&
          typeof product === 'object' &&
          product.name &&
          product.description &&
          typeof product.name === 'string' &&
          typeof product.description === 'string' &&
          product.name.trim().length > 0 &&
          product.description.trim().length > 0
        );
      })
      .map((product) => ({
        name: product.name.trim(),
        description: product.description.trim(),
        category: product.category || 'Product',
        features: Array.isArray(product.features) ? product.features : [],
        confidence:
          typeof product.confidence === 'number'
            ? Math.max(0, Math.min(1, product.confidence))
            : 0.5,
        price: product.price || undefined,
      }))
      .filter((product) => {
        // Filter out low-quality extractions
        return (
          product.name.length > 2 &&
          product.description.length > 10 &&
          product.confidence > 0.3
        );
      });
  }

  private fallbackExtraction(text: string): ExtractionResult {
    // Simple fallback extraction using basic patterns
    const products: ProductFeature[] = [];
    const lines = text.split('\n').filter((line) => line.trim().length > 0);

    for (let i = 0; i < lines.length - 1; i++) {
      const currentLine = lines[i].trim();
      const nextLine = lines[i + 1].trim();

      // Simple heuristic: if current line looks like a title and next line like description
      if (
        currentLine.length > 3 &&
        currentLine.length < 100 &&
        nextLine.length > 20 &&
        !currentLine.includes('.') &&
        !nextLine.startsWith('-') &&
        !nextLine.startsWith('•')
      ) {
        products.push({
          name: currentLine,
          description: nextLine,
          category: 'Product',
          features: [],
          confidence: 0.4,
        });
      }
    }

    return {
      products: products.slice(0, 10), // Limit to 10 products
      summary: 'Basic extraction completed',
    };
  }
}
