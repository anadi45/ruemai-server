import { Injectable } from '@nestjs/common';
import { readFile } from 'fs/promises';
import { pdf as pdfParse } from 'pdf-parse';
import * as mammoth from 'mammoth';
import * as cheerio from 'cheerio';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import { encode } from 'gpt-3-encoder';
import { DebugLogger } from '../utils/debug-logger';

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
export class ParserService {
  private readonly MAX_CHUNK_TOKENS = 6000; // Increased for better context
  private readonly CHUNK_OVERLAP = 300; // Increased overlap for better context

  constructor(private readonly debugLogger: DebugLogger) {}

  async parseDocument(
    file: Buffer,
    mimeType: string,
    filename: string,
  ): Promise<ExtractedContent> {
    try {
      let result: ExtractedContent;

      switch (mimeType) {
        case 'application/pdf':
          result = await this.parsePDF(file);
          break;
        case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        case 'application/msword':
        case 'application/vnd.ms-word.document.macroEnabled.12':
          result = await this.parseWord(file);
          break;
        case 'text/plain':
          result = await this.parseText(file);
          break;
        case 'text/markdown':
          result = await this.parseMarkdown(file);
          break;
        case 'text/html':
          result = await this.parseHTML(file);
          break;
        default:
          throw new Error(`Unsupported file type: ${mimeType}`);
      }

      // Log parsed document content for debugging
      await this.debugLogger.logParsedContent(
        filename,
        file.toString('utf8', 0, Math.min(5000, file.length)), // Log first 5k chars
        result.text,
        {
          filename,
          mimeType,
          fileSize: file.length,
          parsedTextLength: result.text.length,
          hasMetadata: !!result.metadata,
          title: result.metadata?.title,
        },
      );

      return result;
    } catch (error) {
      // Log parsing errors
      await this.debugLogger.logError('DOCUMENT_PARSING', error, {
        filename,
        mimeType,
        fileSize: file.length,
        filePreview: file.toString('utf8', 0, Math.min(1000, file.length)),
      });

      throw new Error(`Failed to parse document ${filename}: ${error.message}`);
    }
  }

  private async parsePDF(file: Buffer): Promise<ExtractedContent> {
    try {
      const pdfData = await pdfParse(file);
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

  private async parseWord(file: Buffer): Promise<ExtractedContent> {
    try {
      const result = await mammoth.extractRawText({ buffer: file });
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

  private async parseText(file: Buffer): Promise<ExtractedContent> {
    return {
      text: file.toString('utf-8'),
    };
  }

  private async parseMarkdown(file: Buffer): Promise<ExtractedContent> {
    return {
      text: file.toString('utf-8'),
    };
  }

  private async parseHTML(file: Buffer): Promise<ExtractedContent> {
    try {
      const html = file.toString('utf-8');
      const dom = new JSDOM(html);
      const reader = new Readability(dom.window.document);
      const article = reader.parse();

      if (article) {
        return {
          text: article.textContent || article.content,
          metadata: {
            title: article.title,
          },
        };
      } else {
        // Fallback to cheerio extraction
        const $ = cheerio.load(html);
        return {
          text: $('body').text().trim(),
        };
      }
    } catch (error) {
      throw new Error(`Failed to parse HTML: ${error.message}`);
    }
  }

  async parseHTMLContent(html: string, url: string): Promise<ExtractedContent> {
    try {
      const dom = new JSDOM(html);
      const reader = new Readability(dom.window.document);
      const article = reader.parse();

      let result: ExtractedContent;

      if (article) {
        result = {
          text: article.textContent || article.content,
          metadata: {
            title: article.title,
          },
        };
      } else {
        // Fallback to cheerio extraction
        const $ = cheerio.load(html);
        result = {
          text: $('body').text().trim(),
        };
      }

      // Log parsed content for debugging
      await this.debugLogger.logParsedContent(
        url,
        html.substring(0, 5000), // Log first 5k chars of HTML
        result.text,
        {
          url,
          originalHtmlLength: html.length,
          parsedTextLength: result.text.length,
          hasMetadata: !!result.metadata,
          title: result.metadata?.title,
        },
      );

      return result;
    } catch (error) {
      // Log parsing errors
      await this.debugLogger.logError('HTML_PARSING', error, {
        url,
        htmlLength: html.length,
        htmlPreview: html.substring(0, 1000),
      });

      throw new Error(
        `Failed to parse HTML content from ${url}: ${error.message}`,
      );
    }
  }

  chunkText(text: string, maxTokens: number = this.MAX_CHUNK_TOKENS): string[] {
    const chunks: string[] = [];
    const sentences = this.splitIntoSentences(text);

    let currentChunk = '';
    let currentTokens = 0;

    for (const sentence of sentences) {
      const sentenceTokens = this.countTokens(sentence);

      // If adding this sentence would exceed the limit, save current chunk and start new one
      if (currentTokens + sentenceTokens > maxTokens && currentChunk.trim()) {
        chunks.push(currentChunk.trim());
        currentChunk = sentence;
        currentTokens = sentenceTokens;
      } else {
        currentChunk += (currentChunk ? ' ' : '') + sentence;
        currentTokens += sentenceTokens;
      }
    }

    // Add the last chunk if it has content
    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    // Filter out very small chunks that are likely not useful
    return chunks.filter((chunk) => this.countTokens(chunk) > 100);
  }

  private splitIntoSentences(text: string): string[] {
    // Split by sentence endings, but be careful with abbreviations
    const sentences = text
      .split(/(?<=[.!?])\s+/)
      .filter((sentence) => sentence.trim().length > 0);

    return sentences;
  }

  private countTokens(text: string): number {
    try {
      return encode(text).length;
    } catch (error) {
      // Fallback: rough estimation (1 token ≈ 4 characters)
      return Math.ceil(text.length / 4);
    }
  }

  async processContentWithOverlap(text: string): Promise<string[]> {
    const chunks = this.chunkText(text);

    // Add overlap between chunks for better context
    if (chunks.length <= 1) {
      return chunks;
    }

    const overlappedChunks: string[] = [];

    for (let i = 0; i < chunks.length; i++) {
      let chunk = chunks[i];

      // Add overlap from previous chunk
      if (i > 0) {
        const prevChunk = chunks[i - 1];
        const overlapText = this.getOverlapText(prevChunk, this.CHUNK_OVERLAP);
        if (overlapText) {
          chunk = overlapText + ' ' + chunk;
        }
      }

      // Add overlap to next chunk
      if (i < chunks.length - 1) {
        const nextChunk = chunks[i + 1];
        const overlapText = this.getOverlapText(nextChunk, this.CHUNK_OVERLAP);
        if (overlapText) {
          chunk = chunk + ' ' + overlapText;
        }
      }

      overlappedChunks.push(chunk);
    }

    return overlappedChunks;
  }

  private getOverlapText(text: string, maxTokens: number): string {
    const sentences = this.splitIntoSentences(text);
    let overlap = '';
    let tokens = 0;

    for (const sentence of sentences) {
      const sentenceTokens = this.countTokens(sentence);
      if (tokens + sentenceTokens > maxTokens) {
        break;
      }
      overlap += (overlap ? ' ' : '') + sentence;
      tokens += sentenceTokens;
    }

    return overlap;
  }
}
