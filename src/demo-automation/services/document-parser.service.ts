import { Injectable } from '@nestjs/common';
import { GeminiService } from './gemini.service';
import * as mammoth from 'mammoth';
const pdfParse = require('pdf-parse');
import * as sharp from 'sharp';
import { ProductDocs } from '../types/demo-automation.types';

export interface ParsedDocument {
  text: string;
  images: Array<{
    data: Buffer;
    format: string;
    description?: string;
  }>;
  metadata: {
    title?: string;
    author?: string;
    pages?: number;
    wordCount?: number;
  };
}

export interface ExtractedFeatureDocs {
  featureName: string;
  description: string;
  steps: string[];
  selectors: Record<string, string>;
  expectedOutcomes: string[];
  prerequisites?: string[];
  screenshots?: Array<{
    data: Buffer;
    description: string;
    stepReference?: string;
  }>;
}

@Injectable()
export class DocumentParserService {
  constructor(private geminiService: GeminiService) {}

  async parseDocument(file: Express.Multer.File): Promise<ParsedDocument> {
    const fileExtension = this.getFileExtension(file.originalname);
    
    switch (fileExtension) {
      case 'pdf':
        return await this.parsePDF(file);
      case 'docx':
      case 'doc':
        return await this.parseWord(file);
      case 'txt':
        return await this.parseText(file);
      default:
        throw new Error(`Unsupported file format: ${fileExtension}`);
    }
  }

  private getFileExtension(filename: string): string {
    return filename.split('.').pop()?.toLowerCase() || '';
  }

  private async parsePDF(file: Express.Multer.File): Promise<ParsedDocument> {
    try {
      const pdfData = await pdfParse(file.buffer);
      
      return {
        text: pdfData.text,
        images: [], // PDF images would need additional extraction
        metadata: {
          title: pdfData.info?.Title,
          author: pdfData.info?.Author,
          pages: pdfData.numpages,
          wordCount: pdfData.text.split(/\s+/).length
        }
      };
    } catch (error) {
      throw new Error(`Failed to parse PDF: ${error.message}`);
    }
  }

  private async parseWord(file: Express.Multer.File): Promise<ParsedDocument> {
    try {
      const result = await mammoth.extractRawText({ buffer: file.buffer });
      
      // For now, we'll skip image extraction from Word docs
      // as it requires more complex handling
      const extractedImages: Array<{ data: Buffer; format: string; description?: string }> = [];

      return {
        text: result.value,
        images: extractedImages,
        metadata: {
          wordCount: result.value.split(/\s+/).length
        }
      };
    } catch (error) {
      throw new Error(`Failed to parse Word document: ${error.message}`);
    }
  }

  private async parseText(file: Express.Multer.File): Promise<ParsedDocument> {
    return {
      text: file.buffer.toString('utf-8'),
      images: [],
      metadata: {
        wordCount: file.buffer.toString('utf-8').split(/\s+/).length
      }
    };
  }

  async extractFeatureDocsFromDocument(
    parsedDoc: ParsedDocument,
    featureName?: string
  ): Promise<ExtractedFeatureDocs> {
    const prompt = this.buildExtractionPrompt(parsedDoc, featureName);
    
    try {
      // Use Gemini to extract structured feature documentation
      const result = await this.geminiService.extractStructuredData(prompt);
      
      // Parse the JSON response
      const extractedData = JSON.parse(result);
      
      // Process images if any
      const processedImages = await this.processDocumentImages(
        parsedDoc.images,
        extractedData
      );

      return {
        featureName: extractedData.featureName || featureName || 'Unknown Feature',
        description: extractedData.description || '',
        steps: extractedData.steps || [],
        selectors: extractedData.selectors || {},
        expectedOutcomes: extractedData.expectedOutcomes || [],
        prerequisites: extractedData.prerequisites || [],
        screenshots: processedImages
      };
    } catch (error) {
      console.error('Failed to extract feature docs:', error);
      
      // Fallback to basic extraction
      return this.fallbackExtraction(parsedDoc.text, featureName);
    }
  }

  async extractFeatureDocsFromDocuments(
    parsedDocs: ParsedDocument[],
    featureName?: string
  ): Promise<ExtractedFeatureDocs> {
    // Combine all document texts
    const combinedText = parsedDocs.map(doc => doc.text).join('\n\n---\n\n');
    
    // Combine all images from all documents
    const allImages = parsedDocs.flatMap(doc => doc.images);
    
    // Create a combined document for processing
    const combinedDoc: ParsedDocument = {
      text: combinedText,
      images: allImages,
      metadata: {
        title: `Combined from ${parsedDocs.length} documents`,
        wordCount: combinedText.split(/\s+/).length
      }
    };

    const prompt = this.buildMultiDocumentExtractionPrompt(combinedDoc, featureName);
    
    try {
      // Use Gemini to extract structured feature documentation from combined content
      const result = await this.geminiService.extractStructuredData(prompt);
      
      // Parse the JSON response
      const extractedData = JSON.parse(result);
      
      // Process images if any
      const processedImages = await this.processDocumentImages(
        combinedDoc.images,
        extractedData
      );

      return {
        featureName: extractedData.featureName || featureName || 'Combined Feature',
        description: extractedData.description || '',
        steps: extractedData.steps || [],
        selectors: extractedData.selectors || {},
        expectedOutcomes: extractedData.expectedOutcomes || [],
        prerequisites: extractedData.prerequisites || [],
        screenshots: processedImages
      };
    } catch (error) {
      console.error('Failed to extract feature docs from multiple documents:', error);
      
      // Fallback to basic extraction
      return this.fallbackExtraction(combinedText, featureName);
    }
  }

  private buildExtractionPrompt(parsedDoc: ParsedDocument, featureName?: string): string {
    const imageContext = parsedDoc.images.length > 0 
      ? `\n\nImages found: ${parsedDoc.images.length} images (descriptions will be provided separately)`
      : '';

    return `
Extract structured feature documentation from the following document content.

${featureName ? `Target Feature: ${featureName}` : ''}

Document Content:
${parsedDoc.text}

${imageContext}

Please extract and structure the following information:

1. **Feature Name**: The main feature or functionality being described
2. **Description**: A clear description of what the feature does
3. **Steps**: A numbered list of user actions/steps to complete the feature
4. **Selectors**: CSS selectors or element identifiers for UI elements (if mentioned)
5. **Expected Outcomes**: What should happen after each step or at the end
6. **Prerequisites**: Any requirements or setup needed before using this feature

Return the data in this JSON format:
{
  "featureName": "string",
  "description": "string", 
  "steps": ["step1", "step2", "step3"],
  "selectors": {
    "elementName": "css-selector-or-identifier"
  },
  "expectedOutcomes": ["outcome1", "outcome2"],
  "prerequisites": ["prerequisite1", "prerequisite2"]
}

Focus on:
- User actions and workflows
- UI elements and interactions
- Expected results and validations
- Any technical details about selectors or identifiers
`;
  }

  private buildMultiDocumentExtractionPrompt(combinedDoc: ParsedDocument, featureName?: string): string {
    const imageContext = combinedDoc.images.length > 0 
      ? `\n\nImages found: ${combinedDoc.images.length} images (descriptions will be provided separately)`
      : '';

    return `
Extract structured feature documentation from the following combined document content from multiple files.

${featureName ? `Target Feature: ${featureName}` : ''}

Combined Document Content:
${combinedDoc.text}

${imageContext}

Please extract and structure the following information by analyzing all the provided documents together:

1. **Feature Name**: The main feature or functionality being described across all documents
2. **Description**: A comprehensive description combining information from all documents
3. **Steps**: A consolidated numbered list of user actions/steps from all documents
4. **Selectors**: CSS selectors or element identifiers found across all documents
5. **Expected Outcomes**: Combined expected outcomes from all documents
6. **Prerequisites**: All prerequisites mentioned across the documents

Return the data in this JSON format:
{
  "featureName": "string",
  "description": "string", 
  "steps": ["step1", "step2", "step3"],
  "selectors": {
    "elementName": "css-selector-or-identifier"
  },
  "expectedOutcomes": ["outcome1", "outcome2"],
  "prerequisites": ["prerequisite1", "prerequisite2"]
}

Focus on:
- Consolidating information from multiple documents
- Removing duplicates and conflicts
- Creating a comprehensive workflow
- Combining all relevant selectors and outcomes
- Ensuring the final result is coherent and complete
`;
  }

  private async processDocumentImages(
    images: Array<{ data: Buffer; format: string; description?: string }>,
    extractedData: any
  ): Promise<Array<{ data: Buffer; description: string; stepReference?: string }>> {
    if (images.length === 0) return [];

    const processedImages = [];
    
    for (let i = 0; i < images.length; i++) {
      const image = images[i];
      
      // Use Gemini to analyze the image and provide description
      const imageDescription = await this.analyzeImage(image.data);
      
      // Try to match image to a step
      const stepReference = this.matchImageToStep(imageDescription, extractedData.steps);
      
      processedImages.push({
        data: image.data,
        description: imageDescription,
        stepReference
      });
    }
    
    return processedImages;
  }

  private async analyzeImage(imageBuffer: Buffer): Promise<string> {
    try {
      // Convert image to base64 for Gemini
      const base64Image = imageBuffer.toString('base64');
      
      const prompt = `
Analyze this image and provide a description of what it shows, focusing on:
- UI elements visible
- User interface components
- Any text or labels visible
- The overall context or step being demonstrated

Keep the description concise but informative.
`;

      // Note: This would require Gemini's vision capabilities
      // For now, return a generic description
      return `Screenshot showing UI elements and interface components`;
    } catch (error) {
      console.error('Failed to analyze image:', error);
      return 'Image from documentation';
    }
  }

  private matchImageToStep(imageDescription: string, steps: string[]): string | undefined {
    // Simple matching logic - could be enhanced with more sophisticated NLP
    for (const step of steps) {
      const stepWords = step.toLowerCase().split(/\s+/);
      const imageWords = imageDescription.toLowerCase().split(/\s+/);
      
      const commonWords = stepWords.filter(word => 
        imageWords.includes(word) && word.length > 3
      );
      
      if (commonWords.length > 0) {
        return step;
      }
    }
    
    return undefined;
  }

  private fallbackExtraction(text: string, featureName?: string): ExtractedFeatureDocs {
    // Basic text analysis as fallback
    const lines = text.split('\n').filter(line => line.trim().length > 0);
    
    // Try to find numbered steps
    const steps = lines
      .filter(line => /^\d+\./.test(line.trim()))
      .map(line => line.replace(/^\d+\.\s*/, '').trim());
    
    // Try to find selectors (basic pattern matching)
    const selectorMatches = text.match(/[.#][a-zA-Z][a-zA-Z0-9_-]*/g) || [];
    const selectors: Record<string, string> = {};
    
    selectorMatches.forEach((selector, index) => {
      selectors[`element${index + 1}`] = selector;
    });

    return {
      featureName: featureName || 'Extracted Feature',
      description: lines[0] || 'Feature extracted from document',
      steps: steps.length > 0 ? steps : ['Step 1: Review the feature', 'Step 2: Complete the workflow'],
      selectors,
      expectedOutcomes: ['Feature completed successfully'],
      prerequisites: []
    };
  }

  async validateExtractedDocs(docs: ExtractedFeatureDocs): Promise<{
    isValid: boolean;
    issues: string[];
    suggestions: string[];
  }> {
    const issues: string[] = [];
    const suggestions: string[] = [];

    // Validate required fields
    if (!docs.featureName || docs.featureName.trim().length === 0) {
      issues.push('Feature name is required');
    }

    if (!docs.description || docs.description.trim().length === 0) {
      issues.push('Feature description is required');
    }

    if (!docs.steps || docs.steps.length === 0) {
      issues.push('At least one step is required');
    }

    if (!docs.expectedOutcomes || docs.expectedOutcomes.length === 0) {
      issues.push('At least one expected outcome is required');
    }

    // Check for quality issues
    if (docs.steps && docs.steps.length < 2) {
      suggestions.push('Consider adding more detailed steps for better automation');
    }

    if (Object.keys(docs.selectors).length === 0) {
      suggestions.push('Consider adding CSS selectors for better element targeting');
    }

    if (docs.steps && docs.steps.some(step => step.length < 10)) {
      suggestions.push('Steps should be more descriptive for better understanding');
    }

    return {
      isValid: issues.length === 0,
      issues,
      suggestions
    };
  }
}
