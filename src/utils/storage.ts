import { Document, CrawledPage, Feature } from '../types/feature.interface';

export class InMemoryStorage {
  private documents: Map<string, Document> = new Map();
  private crawledPages: Map<string, CrawledPage> = new Map();
  private features: Feature[] = [];

  // Document methods
  addDocument(document: Document): void {
    this.documents.set(document.id, document);
  }

  getDocument(id: string): Document | undefined {
    return this.documents.get(id);
  }

  getAllDocuments(): Document[] {
    return Array.from(this.documents.values());
  }

  deleteDocument(id: string): boolean {
    return this.documents.delete(id);
  }

  // Crawled page methods
  addCrawledPage(page: CrawledPage): void {
    this.crawledPages.set(page.url, page);
  }

  getCrawledPage(url: string): CrawledPage | undefined {
    return this.crawledPages.get(url);
  }

  getAllCrawledPages(): CrawledPage[] {
    return Array.from(this.crawledPages.values());
  }

  deleteCrawledPage(url: string): boolean {
    return this.crawledPages.delete(url);
  }

  // Feature methods
  addFeature(feature: Feature): void {
    this.features.push(feature);
  }

  addFeatures(features: Feature[]): void {
    this.features.push(...features);
  }

  getAllFeatures(): Feature[] {
    return [...this.features];
  }

  getFeaturesBySource(source: string): Feature[] {
    return this.features.filter((feature) => feature.source === source);
  }

  clearFeatures(): void {
    this.features = [];
  }

  // Combined methods
  getAllContent(): string[] {
    const documentContent = this.getAllDocuments().map((doc) => doc.content);
    const pageContent = this.getAllCrawledPages().map((page) => page.content);
    return [...documentContent, ...pageContent];
  }

  getTotalContentLength(): number {
    return this.getAllContent().join(' ').length;
  }

  // Clear all data
  clear(): void {
    this.documents.clear();
    this.crawledPages.clear();
    this.features = [];
  }

  // Statistics
  getStats() {
    return {
      documentsCount: this.documents.size,
      pagesCount: this.crawledPages.size,
      featuresCount: this.features.length,
      totalContentLength: this.getTotalContentLength(),
    };
  }
}

// Singleton instance
export const storage = new InMemoryStorage();
