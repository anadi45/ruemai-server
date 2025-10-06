import { Injectable } from '@nestjs/common';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

@Injectable()
export class DebugLogger {
  private readonly logDir = 'logs';
  private readonly debugDir = 'logs/debug';

  constructor() {
    this.ensureLogDirectories();
  }

  private async ensureLogDirectories() {
    try {
      await mkdir(this.logDir, { recursive: true });
      await mkdir(this.debugDir, { recursive: true });
    } catch (error) {
      console.warn('Failed to create log directories:', error);
    }
  }

  async logCrawledContent(url: string, content: string, metadata?: any) {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `crawled-${timestamp}-${this.sanitizeFilename(url)}.txt`;
      const filepath = join(this.debugDir, filename);

      const logContent = {
        url,
        timestamp: new Date().toISOString(),
        contentLength: content.length,
        metadata,
        content: content.substring(0, 10000), // Limit to first 10k chars
      };

      await writeFile(filepath, JSON.stringify(logContent, null, 2));
      console.log(`Crawled content logged to: ${filepath}`);
    } catch (error) {
      console.error('Failed to log crawled content:', error);
    }
  }

  async logParsedContent(
    filename: string,
    originalContent: string,
    parsedContent: string,
    metadata?: any,
  ) {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const logFilename = `parsed-${timestamp}-${this.sanitizeFilename(filename)}.txt`;
      const filepath = join(this.debugDir, logFilename);

      // Check if originalContent is binary data indicator
      const isBinaryContent =
        originalContent.startsWith('[Binary file -') ||
        originalContent.includes('\u0000') || // Contains null bytes
        /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/.test(originalContent); // Contains control characters

      const logContent = {
        originalFilename: filename,
        timestamp: new Date().toISOString(),
        originalContentLength: originalContent.length,
        parsedContentLength: parsedContent.length,
        metadata,
        originalContent: isBinaryContent
          ? originalContent // Don't truncate binary indicators
          : originalContent.substring(0, 5000), // Limit to first 5k chars for text
        parsedContent: parsedContent.substring(0, 10000), // Limit to first 10k chars
        isBinaryFile: isBinaryContent,
      };

      await writeFile(filepath, JSON.stringify(logContent, null, 2));
      console.log(`Parsed content logged to: ${filepath}`);
    } catch (error) {
      console.error('Failed to log parsed content:', error);
    }
  }

  async logExtractionResults(extractionType: string, results: any) {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `extraction-${extractionType}-${timestamp}.json`;
      const filepath = join(this.debugDir, filename);

      const logContent = {
        extractionType,
        timestamp: new Date().toISOString(),
        results,
      };

      await writeFile(filepath, JSON.stringify(logContent, null, 2));
      console.log(`Extraction results logged to: ${filepath}`);
    } catch (error) {
      console.error('Failed to log extraction results:', error);
    }
  }

  async logError(context: string, error: any, additionalData?: any) {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `error-${context}-${timestamp}.json`;
      const filepath = join(this.debugDir, filename);

      const logContent = {
        context,
        timestamp: new Date().toISOString(),
        error: {
          message: error.message,
          stack: error.stack,
          name: error.name,
        },
        additionalData,
      };

      await writeFile(filepath, JSON.stringify(logContent, null, 2));
      console.log(`Error logged to: ${filepath}`);
    } catch (logError) {
      console.error('Failed to log error:', logError);
    }
  }

  private sanitizeFilename(filename: string): string {
    return filename.replace(/[^a-zA-Z0-9.-]/g, '_').substring(0, 50);
  }
}
