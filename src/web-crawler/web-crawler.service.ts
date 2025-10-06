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
  private readonly MAX_PAGES = 50;
  private readonly MAX_DEPTH = 3;
  private readonly TIMEOUT = 30000;

  constructor(private readonly parserService: ParserService) {}

  async crawlWebsite(
    baseUrl: string,
    maxPages: number = this.MAX_PAGES,
  ): Promise<CrawlResult> {
    const visitedUrls = new Set<string>();
    const pages: CrawledPage[] = [];
    const crawledUrls: string[] = [];

    try {
      // First, crawl the main page
      const mainPage = await this.crawlPage(baseUrl);
      if (mainPage) {
        pages.push(mainPage);
        storage.addCrawledPage(mainPage);
        visitedUrls.add(baseUrl);
        crawledUrls.push(baseUrl);
      }

      // Find all internal links
      const internalLinks = await this.findInternalLinks(baseUrl, baseUrl);

      // Crawl internal links (limited to prevent infinite crawling)
      const linksToCrawl = internalLinks
        .filter((link) => !visitedUrls.has(link))
        .slice(0, maxPages - 1);

      for (const link of linksToCrawl) {
        try {
          const page = await this.crawlPage(link);
          if (page) {
            pages.push(page);
            storage.addCrawledPage(page);
            visitedUrls.add(link);
            crawledUrls.push(link);
          }

          // Add a small delay to be respectful to the server
          await new Promise((resolve) => setTimeout(resolve, 1000));
        } catch (error) {
          console.warn(`Failed to crawl ${link}: ${error.message}`);
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
      console.warn(`Failed to crawl page ${url}: ${error.message}`);
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

      return links.slice(0, 20); // Limit to 20 links per page
    } catch (error) {
      return [];
    }
  }
}
