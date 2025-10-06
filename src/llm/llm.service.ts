import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { PromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { RunnableSequence } from '@langchain/core/runnables';

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

@Injectable()
export class LLMService {
  private readonly model: ChatGoogleGenerativeAI;
  private readonly productExtractionPrompt: PromptTemplate;
  private readonly productAnalysisPrompt: PromptTemplate;

  constructor(private readonly configService: ConfigService) {
    // Initialize Gemini model
    this.model = new ChatGoogleGenerativeAI({
      model: 'gemini-1.5-flash',
      temperature: 0.1,
      maxOutputTokens: 2048,
      apiKey: this.configService.get<string>('GOOGLE_API_KEY'),
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
      const chain = RunnableSequence.from([
        this.productExtractionPrompt,
        this.model,
        new StringOutputParser(),
      ]);

      const response = await chain.invoke({ text });

      // Parse the JSON response
      const result = JSON.parse(response);

      // Validate and clean the results
      const cleanedProducts = this.validateAndCleanProducts(
        result.products || [],
      );

      return {
        products: cleanedProducts,
        summary: result.summary,
      };
    } catch (error) {
      console.error('Error extracting products with LLM:', error);

      // Fallback to basic extraction if LLM fails
      return this.fallbackExtraction(text);
    }
  }

  async enhanceProducts(
    products: ProductFeature[],
    context?: string,
  ): Promise<ExtractionResult> {
    try {
      const productsJson = JSON.stringify(products, null, 2);
      const chain = RunnableSequence.from([
        this.productAnalysisPrompt,
        this.model,
        new StringOutputParser(),
      ]);

      const response = await chain.invoke({
        products: productsJson,
        context: context || 'No additional context provided',
      });

      const result = JSON.parse(response);
      const cleanedProducts = this.validateAndCleanProducts(
        result.products || [],
      );

      return {
        products: cleanedProducts,
        summary: result.summary,
      };
    } catch (error) {
      console.error('Error enhancing products with LLM:', error);

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

      const chain = RunnableSequence.from([
        websitePrompt,
        this.model,
        new StringOutputParser(),
      ]);

      const response = await chain.invoke({
        content: htmlContent,
        url: url,
      });

      const result = JSON.parse(response);
      const cleanedProducts = this.validateAndCleanProducts(
        result.products || [],
      );

      return {
        products: cleanedProducts,
        summary: result.summary,
      };
    } catch (error) {
      console.error('Error extracting products from website with LLM:', error);
      return this.fallbackExtraction(htmlContent);
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
