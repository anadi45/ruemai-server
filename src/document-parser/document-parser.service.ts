import { Injectable } from '@nestjs/common';
import { readFile } from 'fs/promises';
const pdfParse = require('pdf-parse');
import * as mammoth from 'mammoth';
import { LLMService, ProductFeature } from '../llm/llm.service';

export interface ExtractedContent {
  text: string;
  metadata?: {
    title?: string;
    author?: string;
    subject?: string;
    creator?: string;
    producer?: string;
    creationDate?: Date;
    modificationDate?: Date;
  };
}

@Injectable()
export class DocumentParserService {
  constructor(private readonly llmService: LLMService) {}
  async parsePDF(filePath: string): Promise<ExtractedContent> {
    try {
      const dataBuffer = await readFile(filePath);
      const pdfData = await pdfParse(dataBuffer);

      return {
        text: pdfData.text,
        metadata: {
          title: 'PDF Document',
        },
      };
    } catch (error) {
      throw new Error(`Failed to parse PDF: ${error.message}`);
    }
  }

  async parseWord(filePath: string): Promise<ExtractedContent> {
    try {
      const result = await mammoth.extractRawText({ path: filePath });
      return {
        text: result.value,
        metadata: {
          title: 'Word Document',
        },
      };
    } catch (error) {
      throw new Error(`Failed to parse Word document: ${error.message}`);
    }
  }

  async parseDocument(
    filePath: string,
    mimeType: string,
  ): Promise<ExtractedContent> {
    if (mimeType === 'application/pdf') {
      return this.parsePDF(filePath);
    } else if (
      mimeType ===
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      mimeType === 'application/msword' ||
      mimeType === 'application/vnd.ms-word.document.macroEnabled.12' ||
      mimeType ===
        'application/vnd.openxmlformats-officedocument.wordprocessingml.template' ||
      mimeType === 'application/vnd.ms-word.template.macroEnabled.12'
    ) {
      return this.parseWord(filePath);
    } else {
      throw new Error(`Unsupported file type: ${mimeType}`);
    }
  }

  async extractProductInfo(text: string): Promise<ProductFeature[]> {
    try {
      // Use LLM for intelligent product extraction
      const result = await this.llmService.extractProductsFromText(text);
      return result.products;
    } catch (error) {
      // Fallback to original pattern matching
      return this.fallbackExtraction(text);
    }
  }

  private fallbackExtraction(text: string): ProductFeature[] {
    const products: ProductFeature[] = [];

    // Common patterns for product names and descriptions
    const productPatterns = [
      // Pattern 1: Product name followed by description
      /(?:Product|Feature|Service|Solution):\s*([^\n\r]+?)(?:\n|$)([^\n\r]+?)(?:\n\n|\n[A-Z]|$)/gi,
      // Pattern 2: Bullet points with product names
      /[-•*]\s*([^:\n\r]+?):\s*([^\n\r]+?)(?:\n|$)/gi,
      // Pattern 3: Numbered lists
      /\d+\.\s*([^:\n\r]+?):\s*([^\n\r]+?)(?:\n|$)/gi,
      // Pattern 4: Bold or emphasized text followed by description
      /\*\*([^*]+?)\*\*:\s*([^\n\r]+?)(?:\n|$)/gi,
      // Pattern 5: Capitalized words that might be product names
      /([A-Z][A-Za-z\s]+(?:API|Service|Platform|Tool|System|Engine|Framework|Library|SDK|Plugin|Extension|Module|Component|Feature|Solution|Product|App|Application|Software|Platform|Suite|Package|Bundle|Kit|Toolkit|Framework|Engine|Library|SDK|Plugin|Extension|Module|Component|Feature|Solution|Product|App|Application|Software|Platform|Suite|Package|Bundle|Kit|Toolkit))\s*[-:]\s*([^\n\r]+?)(?:\n|$)/gi,
    ];

    for (const pattern of productPatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const name = match[1]?.trim();
        const description = match[2]?.trim();

        if (name && description && name.length > 2 && description.length > 10) {
          // Avoid duplicates
          const exists = products.some(
            (p) =>
              p.name.toLowerCase() === name.toLowerCase() ||
              p.description.toLowerCase() === description.toLowerCase(),
          );

          if (!exists) {
            products.push({
              name,
              description,
              category: 'Product',
              features: [],
              confidence: 0.5,
            });
          }
        }
      }
    }

    // If no patterns matched, try to extract from headings and paragraphs
    if (products.length === 0) {
      const lines = text.split('\n').filter((line) => line.trim().length > 0);

      for (let i = 0; i < lines.length - 1; i++) {
        const currentLine = lines[i].trim();
        const nextLine = lines[i + 1].trim();

        // Check if current line looks like a product name and next line like a description
        if (
          currentLine.length > 3 &&
          currentLine.length < 100 &&
          nextLine.length > 20 &&
          !currentLine.includes('.') &&
          !nextLine.startsWith('-') &&
          !nextLine.startsWith('•') &&
          !nextLine.startsWith('*')
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
    }

    return products;
  }
}
