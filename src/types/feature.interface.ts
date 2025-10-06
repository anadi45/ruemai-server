export interface Document {
  id: string;
  filename: string;
  content: string;
  uploadedAt: Date;
  mimeType: string;
}

export interface CrawledPage {
  url: string;
  content: string;
  crawledAt: Date;
  title?: string;
}

export interface Feature {
  name: string;
  description: string;
  source: string;
  category?: string;
  confidence?: number;
}

export interface ExtractionStats {
  documentsProcessed: number;
  pagesCrawled: number;
  featuresFound: number;
  processingTime: string;
}

export interface ExtractionResult {
  features: Feature[];
  stats: ExtractionStats;
}
