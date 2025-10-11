import { Injectable } from '@nestjs/common';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { ParserService } from '../parser/parser.service';
import { storage } from '../utils/storage';
import { CrawledPage } from '../types/feature.interface';

export interface CrawlResult {
  pages: CrawledPage[];
  totalPages: number;
  crawledUrls: string[];
}

@Injectable()
export class WebCrawlerService {
  private readonly MAX_DEPTH = 3;
  private readonly TIMEOUT = 15000; // Reduced timeout for faster processing
  private readonly CONCURRENT_REQUESTS = 8; // Increased concurrent requests
  private readonly BATCH_SIZE = 15; // Increased batch size
  private readonly REQUEST_DELAY = 100; // Small delay to be respectful

  constructor(private readonly parserService: ParserService) {}

  async crawlWebsite(baseUrl: string): Promise<CrawlResult> {
    const visitedUrls = new Set<string>();
    const pages: CrawledPage[] = [];
    const crawledUrls: string[] = [];
    const urlsToCrawl = new Set<string>();

    try {
      // First, crawl the main page
      const mainPage = await this.crawlPage(baseUrl);
      if (mainPage) {
        pages.push(mainPage);
        storage.addCrawledPage(mainPage);
        visitedUrls.add(baseUrl);
        crawledUrls.push(baseUrl);
      }

      // Find all internal links from the main page
      const initialLinks = await this.findInternalLinks(baseUrl, baseUrl);
      initialLinks.forEach((link) => urlsToCrawl.add(link));

      // Process URLs in batches with improved concurrency control
      while (urlsToCrawl.size > 0) {
        const batch = Array.from(urlsToCrawl).slice(0, this.BATCH_SIZE);

        // Process batch with concurrency control using Promise.allSettled for better error handling
        const batchPromises = batch.map(async (url) => {
          if (visitedUrls.has(url)) return null;

          try {
            const page = await this.crawlPage(url);
            if (page) {
              visitedUrls.add(url);
              crawledUrls.push(url);

              // Find new links from this page (don't await to avoid blocking)
              this.findInternalLinks(baseUrl, url)
                .then((newLinks) => {
                  newLinks.forEach((link) => {
                    if (!visitedUrls.has(link) && !urlsToCrawl.has(link)) {
                      urlsToCrawl.add(link);
                    }
                  });
                })
                .catch((error) => {});

              return page;
            }
          } catch (error) {}

          return null;
        });

        // Wait for all requests in the batch to complete
        const batchResults = await Promise.allSettled(batchPromises);

        // Add successful pages to results
        batchResults.forEach((result) => {
          if (result.status === 'fulfilled' && result.value) {
            pages.push(result.value);
            storage.addCrawledPage(result.value);
          }
        });

        // Remove processed URLs from the queue
        batch.forEach((url) => urlsToCrawl.delete(url));

        // Add delay between batches to be respectful
        if (urlsToCrawl.size > 0) {
          await new Promise((resolve) =>
            setTimeout(resolve, this.REQUEST_DELAY),
          );
        }
      }

      return {
        pages,
        totalPages: crawledUrls.length,
        crawledUrls,
      };
    } catch (error) {
      throw new Error(`Failed to crawl website ${baseUrl}: ${error.message}`);
    }
  }

  private async crawlPage(url: string): Promise<CrawledPage | null> {
    try {
      const response = await axios.get(url, {
        timeout: this.TIMEOUT,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        },
      });

      // Parse HTML content to extract clean text
      const extractedContent = await this.parserService.parseHTMLContent(
        response.data,
        url,
      );

      const page: CrawledPage = {
        url,
        content: extractedContent.text,
        crawledAt: new Date(),
        title: extractedContent.metadata?.title,
      };

      return page;
    } catch (error) {
      return null;
    }
  }

  private async findInternalLinks(
    baseUrl: string,
    currentUrl: string,
  ): Promise<string[]> {
    try {
      const response = await axios.get(currentUrl, {
        timeout: this.TIMEOUT,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        },
      });

      const $ = cheerio.load(response.data);
      const links: string[] = [];

      $('a[href]').each((index, element) => {
        const href = $(element).attr('href');
        if (href) {
          try {
            const absoluteUrl = new URL(href, baseUrl).href;
            if (
              absoluteUrl.startsWith(baseUrl) &&
              !links.includes(absoluteUrl)
            ) {
              links.push(absoluteUrl);
            }
          } catch (error) {
            // Invalid URL, skip
          }
        }
      });

      return links; // No limit - crawl all internal links
    } catch (error) {
      return [];
    }
  }
}
