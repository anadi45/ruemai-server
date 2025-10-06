import { Injectable } from '@nestjs/common';
import { extname } from 'path';
import { memoryStorage } from 'multer';
import { ParserService } from '../parser/parser.service';
import { storage } from '../utils/storage';
import { Document } from '../types/feature.interface';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class UploadService {
  constructor(private readonly parserService: ParserService) {}

  static multerConfig = {
    storage: memoryStorage(),
    fileFilter: (req, file, callback) => {
      const allowedMimes = [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/msword',
        'application/vnd.ms-word.document.macroEnabled.12',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.template',
        'application/vnd.ms-word.template.macroEnabled.12',
        'text/plain',
        'text/markdown',
        'text/html',
      ];

      if (allowedMimes.includes(file.mimetype)) {
        callback(null, true);
      } else {
        callback(
          new Error('Unsupported file type. Allowed: PDF, Word, TXT, MD, HTML'),
          false,
        );
      }
    },
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB limit
    },
  };

  async processUploadedFile(file: Express.Multer.File): Promise<Document> {
    try {
      const documentId = uuidv4();
      const extractedContent = await this.parserService.parseDocument(
        file.buffer,
        file.mimetype,
        file.originalname,
      );

      const document: Document = {
        id: documentId,
        filename: file.originalname,
        content: extractedContent.text,
        uploadedAt: new Date(),
        mimeType: file.mimetype,
      };

      storage.addDocument(document);
      return document;
    } catch (error) {
      throw new Error(`Failed to process uploaded file: ${error.message}`);
    }
  }

  async processMultipleFiles(
    files: Express.Multer.File[],
  ): Promise<Document[]> {
    // Process all files in parallel
    const filePromises = files.map(async (file) => {
      try {
        return await this.processUploadedFile(file);
      } catch (error) {
        console.warn(
          `Failed to process file ${file.originalname}:`,
          error.message,
        );
        return null;
      }
    });

    const results = await Promise.all(filePromises);

    // Filter out null results (failed files)
    return results.filter(
      (document): document is Document => document !== null,
    );
  }
}
