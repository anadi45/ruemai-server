import { Injectable } from '@nestjs/common';
import {
  DocumentParserService,
  ExtractedContent,
} from '../document-parser/document-parser.service';
import {
  WebCrawlerService,
  WebsiteProduct,
  CrawlResult,
} from '../web-crawler/web-crawler.service';
import {
  LLMService,
  ProductFeature as LLMProductFeature,
} from '../llm/llm.service';

export interface ProductFeature {
  name: string;
  description: string;
  source: 'document' | 'website';
  sourceUrl?: string;
  confidence: number;
  category?: string;
  features?: string[];
  price?: string;
}

export interface ExtractionResult {
  products: ProductFeature[];
  totalProducts: number;
  documentProducts: number;
  websiteProducts: number;
  processingTime: number;
  metadata: {
    websiteUrl: string;
    documentsProcessed: number;
    pagesCrawled: number;
  };
}

@Injectable()
export class ProductExtractionService {
  constructor(
    private readonly documentParserService: DocumentParserService,
    private readonly webCrawlerService: WebCrawlerService,
    private readonly llmService: LLMService,
  ) {}

  async extractProductsFromFilesAndWebsite(
    filePaths: string[],
    mimeTypes: string[],
    websiteUrl: string,
  ): Promise<ExtractionResult> {
    const startTime = Date.now();
    const products: ProductFeature[] = [];
    let documentProducts = 0;
    let websiteProducts = 0;
    let pagesCrawled = 0;

    try {
      // Process documents
      for (let i = 0; i < filePaths.length; i++) {
        const filePath = filePaths[i];
        const mimeType = mimeTypes[i];

        try {
          const extractedContent =
            await this.documentParserService.parseDocument(filePath, mimeType);
          const documentProductsData =
            await this.documentParserService.extractProductInfo(
              extractedContent.text,
            );

          const documentFeatures: ProductFeature[] = documentProductsData.map(
            (product) => ({
              name: product.name,
              description: product.description,
              source: 'document' as const,
              confidence: product.confidence,
              category: product.category,
              features: product.features,
            }),
          );

          products.push(...documentFeatures);
          documentProducts += documentFeatures.length;
        } catch (error) {
          console.warn(
            `Failed to process document ${filePath}: ${error.message}`,
          );
        }
      }

      // Crawl website
      try {
        const crawlResult: CrawlResult =
          await this.webCrawlerService.crawlWebsite(websiteUrl);
        pagesCrawled = crawlResult.totalPages;

        const websiteFeatures: ProductFeature[] = crawlResult.products.map(
          (product) => ({
            name: product.name,
            description: product.description,
            source: 'website' as const,
            sourceUrl: product.url,
            confidence: 0.8, // LLM provides better confidence scoring
            category: product.category || 'Product',
            features: product.features,
            price: product.price,
          }),
        );

        products.push(...websiteFeatures);
        websiteProducts += websiteFeatures.length;
      } catch (error) {
        console.warn(`Failed to crawl website ${websiteUrl}: ${error.message}`);
      }

      // Use LLM to enhance and merge products
      const enhancedProducts = await this.enhanceProductsWithLLM(products);
      const mergedProducts = this.mergeAndDeduplicateProducts(enhancedProducts);

      const processingTime = Date.now() - startTime;

      return {
        products: mergedProducts,
        totalProducts: mergedProducts.length,
        documentProducts,
        websiteProducts,
        processingTime,
        metadata: {
          websiteUrl,
          documentsProcessed: filePaths.length,
          pagesCrawled,
        },
      };
    } catch (error) {
      throw new Error(`Failed to extract products: ${error.message}`);
    }
  }

  private calculateConfidence(
    name: string,
    description: string,
    source: 'document' | 'website',
  ): number {
    let confidence = 0.5; // Base confidence

    // Length factors
    if (name.length > 5 && name.length < 100) confidence += 0.1;
    if (description.length > 20 && description.length < 500) confidence += 0.1;

    // Content quality indicators
    if (
      name.includes('API') ||
      name.includes('Service') ||
      name.includes('Platform')
    )
      confidence += 0.1;
    if (
      description.includes('feature') ||
      description.includes('capability') ||
      description.includes('functionality')
    )
      confidence += 0.1;

    // Source-specific adjustments
    if (source === 'website') {
      // Website products might be more structured
      confidence += 0.1;
    } else if (source === 'document') {
      // Document products might be more detailed
      if (description.length > 50) confidence += 0.1;
    }

    // Avoid obvious non-products
    if (
      name.toLowerCase().includes('copyright') ||
      name.toLowerCase().includes('terms') ||
      name.toLowerCase().includes('privacy')
    ) {
      confidence -= 0.3;
    }

    return Math.min(Math.max(confidence, 0), 1);
  }

  private categorizeProduct(name: string, description: string): string {
    const nameLower = name.toLowerCase();
    const descLower = description.toLowerCase();

    if (nameLower.includes('api') || descLower.includes('api')) return 'API';
    if (nameLower.includes('service') || descLower.includes('service'))
      return 'Service';
    if (nameLower.includes('platform') || descLower.includes('platform'))
      return 'Platform';
    if (nameLower.includes('tool') || descLower.includes('tool')) return 'Tool';
    if (nameLower.includes('framework') || descLower.includes('framework'))
      return 'Framework';
    if (nameLower.includes('library') || descLower.includes('library'))
      return 'Library';
    if (nameLower.includes('sdk') || descLower.includes('sdk')) return 'SDK';
    if (nameLower.includes('plugin') || descLower.includes('plugin'))
      return 'Plugin';
    if (nameLower.includes('extension') || descLower.includes('extension'))
      return 'Extension';
    if (nameLower.includes('module') || descLower.includes('module'))
      return 'Module';
    if (nameLower.includes('component') || descLower.includes('component'))
      return 'Component';
    if (nameLower.includes('feature') || descLower.includes('feature'))
      return 'Feature';
    if (nameLower.includes('solution') || descLower.includes('solution'))
      return 'Solution';
    if (nameLower.includes('app') || descLower.includes('application'))
      return 'Application';
    if (nameLower.includes('software') || descLower.includes('software'))
      return 'Software';

    return 'Product';
  }

  private mergeAndDeduplicateProducts(
    products: ProductFeature[],
  ): ProductFeature[] {
    const productMap = new Map<string, ProductFeature>();

    for (const product of products) {
      const key = this.generateProductKey(product.name, product.description);
      const existing = productMap.get(key);

      if (!existing) {
        productMap.set(key, product);
      } else {
        // Merge products with same key
        const merged: ProductFeature = {
          name: product.name,
          description: this.mergeDescriptions(
            existing.description,
            product.description,
          ),
          source: existing.source, // Keep original source
          sourceUrl: existing.sourceUrl || product.sourceUrl,
          confidence: Math.max(existing.confidence, product.confidence),
          category: existing.category || product.category,
          features: this.mergeFeatures(existing.features, product.features),
          price: existing.price || product.price,
        };
        productMap.set(key, merged);
      }
    }

    return Array.from(productMap.values())
      .filter((product) => product.confidence > 0.3) // Filter out low-confidence products
      .sort((a, b) => b.confidence - a.confidence); // Sort by confidence
  }

  private generateProductKey(name: string, description: string): string {
    // Create a normalized key for deduplication
    const normalizedName = name
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    const normalizedDesc = description
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 100); // Use first 100 chars for key

    return `${normalizedName}-${normalizedDesc}`;
  }

  private mergeDescriptions(desc1: string, desc2: string): string {
    if (desc1 === desc2) return desc1;
    if (desc1.includes(desc2)) return desc1;
    if (desc2.includes(desc1)) return desc2;

    // Return the longer, more detailed description
    return desc1.length > desc2.length ? desc1 : desc2;
  }

  private mergeFeatures(features1?: string[], features2?: string[]): string[] {
    const allFeatures = [...(features1 || []), ...(features2 || [])];
    return [...new Set(allFeatures)]; // Remove duplicates
  }

  private async enhanceProductsWithLLM(
    products: ProductFeature[],
  ): Promise<ProductFeature[]> {
    try {
      // Convert to LLM format
      const llmProducts: LLMProductFeature[] = products.map((product) => ({
        name: product.name,
        description: product.description,
        category: product.category,
        features: product.features,
        confidence: product.confidence,
        price: product.price,
      }));

      // Use LLM to enhance the products
      const result = await this.llmService.enhanceProducts(llmProducts);

      // Convert back to ProductFeature format
      return result.products.map((product) => ({
        name: product.name,
        description: product.description,
        source: products[0]?.source || 'document',
        sourceUrl: products[0]?.sourceUrl,
        confidence: product.confidence,
        category: product.category,
        features: product.features,
        price: (product as any).price,
      }));
    } catch (error) {
      console.warn(
        'LLM enhancement failed, using original products:',
        error.message,
      );
      return products;
    }
  }
}
