import { Injectable } from '@nestjs/common';
import { readFile } from 'fs/promises';
import { pdf as pdfParse } from 'pdf-parse';
import * as mammoth from 'mammoth';
import * as cheerio from 'cheerio';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import { encode } from 'gpt-3-encoder';

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
  private readonly MAX_CHUNK_TOKENS = 4000;
  private readonly CHUNK_OVERLAP = 200; // tokens

  async parseDocument(
    file: Buffer,
    mimeType: string,
    filename: string,
  ): Promise<ExtractedContent> {
    try {
      switch (mimeType) {
        case 'application/pdf':
          return this.parsePDF(file);
        case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        case 'application/msword':
        case 'application/vnd.ms-word.document.macroEnabled.12':
          return this.parseWord(file);
        case 'text/plain':
          return this.parseText(file);
        case 'text/markdown':
          return this.parseMarkdown(file);
        case 'text/html':
          return this.parseHTML(file);
        default:
          throw new Error(`Unsupported file type: ${mimeType}`);
      }
    } catch (error) {
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

    return chunks;
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
