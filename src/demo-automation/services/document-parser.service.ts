import { Injectable } from '@nestjs/common';
import { GeminiService } from './gemini.service';
import * as mammoth from 'mammoth';
import * as sharp from 'sharp';
import { ProductDocs } from '../types/demo-automation.types';
import { PDFParse } from 'pdf-parse';
import * as fs from 'fs';
import * as path from 'path';

export interface ParsedDocument {
  text: string;
  images?: Array<{
    data: Buffer;
    description: string;
    stepReference?: string;
    mimeType: string;
  }>;
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
    console.log(`Parsing file: ${file.originalname}, extension: ${fileExtension}`);
    
    switch (fileExtension) {
      case 'pdf':
        console.log('Using PDF parser');
        return await this.parsePDF(file);
      case 'docx':
      case 'doc':
        console.log('Using Word parser');
        return await this.parseWord(file);
      case 'txt':
        console.log('Using text parser');
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
      console.log('Starting PDF parsing...');
      
      // Use PDFParse class constructor with buffer
      const parser = new PDFParse({ data: file.buffer });
      const pdfData = await parser.getText();
      console.log('PDF parsing completed');
      
      // Extract images from PDF
      const images = await this.extractImagesFromPDF(file.buffer);
      
      return {
        text: pdfData.text,
        images: images
      };
    } catch (error) {
      console.error('PDF parsing error:', error);
      throw new Error(`Failed to parse PDF: ${error.message}`);
    }
  }

  private async parseWord(file: Express.Multer.File): Promise<ParsedDocument> {
    try {
      const result = await mammoth.extractRawText({ buffer: file.buffer });
      
      // Extract images from Word document
      const images = await this.extractImagesFromWord(file.buffer);
      
      return {
        text: result.value,
        images: images
      };
    } catch (error) {
      throw new Error(`Failed to parse Word document: ${error.message}`);
    }
  }

  private async parseText(file: Express.Multer.File): Promise<ParsedDocument> {
    return {
      text: file.buffer.toString('utf-8'),
    };
  }

  async extractFeatureDocsFromDocument(
    parsedDoc: ParsedDocument,
    featureName?: string
  ): Promise<ExtractedFeatureDocs> {
    // Process images if they exist
    let imageDescriptions: string[] = [];
    if (parsedDoc.images && parsedDoc.images.length > 0) {
      console.log(`Processing ${parsedDoc.images.length} images from document...`);
      
      for (const image of parsedDoc.images) {
        try {
          const description = await this.analyzeImage(image.data);
          imageDescriptions.push(description);
        } catch (error) {
          console.error('Failed to analyze image:', error);
          imageDescriptions.push('Image from documentation');
        }
      }
    }

    // Combine text and image descriptions
    const combinedContent = this.combineTextAndImages(parsedDoc.text, imageDescriptions);
    const prompt = this.buildExtractionPromptWithImages(combinedContent, featureName);
    
    try {
      // Use Gemini to extract structured feature documentation
      const result = await this.geminiService.extractStructuredData(prompt);
      
      // Parse the JSON response - clean markdown code blocks if present
      const cleanedResult = this.cleanJsonResponse(result);
      const extractedData = JSON.parse(cleanedResult);
      
      return {
        featureName: extractedData.featureName || featureName || 'Unknown Feature',
        description: extractedData.description || '',
        steps: extractedData.steps || [],
        selectors: extractedData.selectors || {},
        expectedOutcomes: extractedData.expectedOutcomes || [],
        prerequisites: extractedData.prerequisites || [],
        screenshots: parsedDoc.images?.map(img => ({
          data: img.data,
          description: img.description,
          stepReference: img.stepReference
        })) || []
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
    
    // Process images from all documents
    let allImageDescriptions: string[] = [];
    let allImages: Array<{
      data: Buffer;
      description: string;
      stepReference?: string;
      mimeType: string;
    }> = [];

    for (const doc of parsedDocs) {
      if (doc.images && doc.images.length > 0) {
        for (const image of doc.images) {
          try {
            const description = await this.analyzeImage(image.data);
            allImageDescriptions.push(description);
            allImages.push({
              data: image.data,
              description: description,
              stepReference: image.stepReference,
              mimeType: image.mimeType
            });
          } catch (error) {
            console.error('Failed to analyze image:', error);
            allImageDescriptions.push('Image from documentation');
            allImages.push({
              data: image.data,
              description: 'Image from documentation',
              stepReference: image.stepReference,
              mimeType: image.mimeType
            });
          }
        }
      }
    }

    // Combine text and image descriptions
    const combinedContent = this.combineTextAndImages(combinedText, allImageDescriptions);
    const prompt = this.buildMultiDocumentExtractionPromptWithImages(combinedContent, featureName);
    
    try {
      // Use Gemini to extract structured feature documentation from combined content
      const result = await this.geminiService.extractStructuredData(prompt);
      
      // Parse the JSON response - clean markdown code blocks if present
      const cleanedResult = this.cleanJsonResponse(result);
      const extractedData = JSON.parse(cleanedResult);
      
      return {
        featureName: extractedData.featureName || featureName || 'Combined Feature',
        description: extractedData.description || '',
        steps: extractedData.steps || [],
        selectors: extractedData.selectors || {},
        expectedOutcomes: extractedData.expectedOutcomes || [],
        prerequisites: extractedData.prerequisites || [],
        screenshots: allImages.map(img => ({
          data: img.data,
          description: img.description,
          stepReference: img.stepReference
        }))
      };
    } catch (error) {
      console.error('Failed to extract feature docs from multiple documents:', error);
      
      // Fallback to basic extraction
      return this.fallbackExtraction(combinedText, featureName);
    }
  }

  private combineTextAndImages(text: string, imageDescriptions: string[]): string {
    let combined = text;
    
    if (imageDescriptions.length > 0) {
      combined += '\n\n--- IMAGE DESCRIPTIONS ---\n';
      imageDescriptions.forEach((description, index) => {
        combined += `\nImage ${index + 1}: ${description}\n`;
      });
    }
    
    return combined;
  }

  private buildExtractionPromptWithImages(combinedContent: string, featureName?: string): string {
    return `
Extract structured feature documentation from the following document content, which includes both text and image descriptions.

${featureName ? `Target Feature: ${featureName}` : ''}

Document Content (including image descriptions):
${combinedContent}

Please extract and structure the following information, considering both the text content and the image descriptions:

1. **Feature Name**: The main feature or functionality being described
2. **Description**: A clear description of what the feature does (incorporate insights from images)
3. **Steps**: A numbered list of user actions/steps to complete the feature (use image descriptions to enhance step details)
4. **Selectors**: CSS selectors or element identifiers for UI elements (if mentioned in text or visible in images)
5. **Expected Outcomes**: What should happen after each step or at the end (consider what images show)
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
- User actions and workflows (enhanced by image context)
- UI elements and interactions (use image descriptions to identify elements)
- Expected results and validations (consider what images demonstrate)
- Any technical details about selectors or identifiers
- Combine textual instructions with visual context from images
`;
  }

  private buildExtractionPrompt(parsedDoc: ParsedDocument, featureName?: string): string {
    return `
Extract structured feature documentation from the following document content.

${featureName ? `Target Feature: ${featureName}` : ''}

Document Content:
${parsedDoc.text}

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

  private buildMultiDocumentExtractionPromptWithImages(combinedContent: string, featureName?: string): string {
    return `
Extract structured feature documentation from the following combined document content from multiple files, which includes both text and image descriptions.

${featureName ? `Target Feature: ${featureName}` : ''}

Combined Document Content (including image descriptions):
${combinedContent}

Please extract and structure the following information by analyzing all the provided documents together, considering both text content and image descriptions:

1. **Feature Name**: The main feature or functionality being described across all documents
2. **Description**: A comprehensive description combining information from all documents and images
3. **Steps**: A consolidated numbered list of user actions/steps from all documents (enhanced by image context)
4. **Selectors**: CSS selectors or element identifiers found across all documents and visible in images
5. **Expected Outcomes**: Combined expected outcomes from all documents (consider what images demonstrate)
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
- Consolidating information from multiple documents and images
- Removing duplicates and conflicts
- Creating a comprehensive workflow enhanced by visual context
- Combining all relevant selectors and outcomes
- Using image descriptions to identify UI elements and enhance step details
- Ensuring the final result is coherent and complete
`;
  }

  private buildMultiDocumentExtractionPrompt(combinedDoc: ParsedDocument, featureName?: string): string {
    return `
Extract structured feature documentation from the following combined document content from multiple files.

${featureName ? `Target Feature: ${featureName}` : ''}

Combined Document Content:
${combinedDoc.text}

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

  private async extractImagesFromPDF(pdfBuffer: Buffer): Promise<Array<{
    data: Buffer;
    description: string;
    stepReference?: string;
    mimeType: string;
  }>> {
    try {
      // For now, we'll use a simple approach to extract images
      // In a production environment, you might want to use pdf2pic or similar libraries
      console.log('Extracting images from PDF...');
      
      // This is a placeholder implementation
      // In practice, you'd use a library like pdf2pic or pdf-poppler
      const images: Array<{
        data: Buffer;
        description: string;
        stepReference?: string;
        mimeType: string;
      }> = [];
      
      // For now, return empty array - this would need proper PDF image extraction
      console.log('PDF image extraction not yet implemented');
      return images;
    } catch (error) {
      console.error('Failed to extract images from PDF:', error);
      return [];
    }
  }

  private async extractImagesFromWord(docxBuffer: Buffer): Promise<Array<{
    data: Buffer;
    description: string;
    stepReference?: string;
    mimeType: string;
  }>> {
    try {
      console.log('Extracting images from Word document...');
      
      // Use mammoth to extract images
      const result = await mammoth.extractRawText({ buffer: docxBuffer });
      
      // For now, we'll use mammoth's image extraction capabilities
      // This is a simplified approach - in practice, you might need more sophisticated extraction
      const images: Array<{
        data: Buffer;
        description: string;
        stepReference?: string;
        mimeType: string;
      }> = [];
      
      // Note: mammoth doesn't directly extract images, so this is a placeholder
      // You might need to use a different library or approach for Word document image extraction
      console.log('Word document image extraction not yet fully implemented');
      return images;
    } catch (error) {
      console.error('Failed to extract images from Word document:', error);
      return [];
    }
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

      // Use Gemini service to analyze the image
      const description = await this.geminiService.analyzeImage(base64Image, prompt);
      return description;
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

  private cleanJsonResponse(response: string): string {
    // Remove markdown code blocks if present
    const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch && jsonMatch[1]) {
      return jsonMatch[1].trim();
    }
    
    // Try to extract JSON from the response
    const jsonExtract = response.match(/\{[\s\S]*\}/);
    if (jsonExtract) {
      return jsonExtract[0];
    }
    
    // Return the original response if no cleaning needed
    return response.trim();
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
