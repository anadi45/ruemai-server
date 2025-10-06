import { Injectable } from '@nestjs/common';
import axios from 'axios';
import * as cheerio from 'cheerio';
import puppeteer from 'puppeteer';
import { LLMService, ProductFeature } from '../llm/llm.service';

export interface WebsiteProduct {
  name: string;
  description: string;
  url: string;
  price?: string;
  category?: string;
  features?: string[];
}

export interface CrawlResult {
  products: WebsiteProduct[];
  totalPages: number;
  crawledUrls: string[];
}

@Injectable()
export class WebCrawlerService {
  private readonly MAX_PAGES = 50;
  private readonly MAX_DEPTH = 3;
  private readonly TIMEOUT = 30000;

  constructor(private readonly llmService: LLMService) {}

  async crawlWebsite(baseUrl: string): Promise<CrawlResult> {
    const visitedUrls = new Set<string>();
    const products: WebsiteProduct[] = [];
    const crawledUrls: string[] = [];

    try {
      // First, try to get the main page
      const mainPageProducts = await this.extractProductsFromPage(baseUrl);
      products.push(...mainPageProducts);
      visitedUrls.add(baseUrl);
      crawledUrls.push(baseUrl);

      // Find all internal links
      const internalLinks = await this.findInternalLinks(baseUrl, baseUrl);

      // Crawl internal links (limited to prevent infinite crawling)
      const linksToCrawl = internalLinks
        .filter((link) => !visitedUrls.has(link))
        .slice(0, this.MAX_PAGES - 1);

      for (const link of linksToCrawl) {
        try {
          const pageProducts = await this.extractProductsFromPage(link);
          products.push(...pageProducts);
          visitedUrls.add(link);
          crawledUrls.push(link);

          // Add a small delay to be respectful to the server
          await new Promise((resolve) => setTimeout(resolve, 1000));
        } catch (error) {
          console.warn(`Failed to crawl ${link}: ${error.message}`);
        }
      }

      return {
        products: this.deduplicateProducts(products),
        totalPages: crawledUrls.length,
        crawledUrls,
      };
    } catch (error) {
      throw new Error(`Failed to crawl website ${baseUrl}: ${error.message}`);
    }
  }

  private async extractProductsFromPage(
    url: string,
  ): Promise<WebsiteProduct[]> {
    try {
      // Use Puppeteer for JavaScript-heavy sites
      const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });

      const page = await browser.newPage();
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      );
      await page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: this.TIMEOUT,
      });

      const content = await page.content();
      await browser.close();

      // Use LLM for intelligent extraction from HTML content
      try {
        const result = await this.llmService.extractProductsFromWebsiteContent(
          content,
          url,
        );
        return this.convertLLMProductsToWebsiteProducts(result.products, url);
      } catch (llmError) {
        console.warn(
          `LLM extraction failed for ${url}, falling back to DOM parsing:`,
          llmError.message,
        );
        return this.fallbackExtraction(content, url);
      }
    } catch (error) {
      // Fallback to simple HTTP request if Puppeteer fails
      try {
        const response = await axios.get(url, {
          timeout: this.TIMEOUT,
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          },
        });

        // Try LLM extraction on static content
        try {
          const result =
            await this.llmService.extractProductsFromWebsiteContent(
              response.data,
              url,
            );
          return this.convertLLMProductsToWebsiteProducts(result.products, url);
        } catch (llmError) {
          console.warn(
            `LLM extraction failed for ${url}, falling back to DOM parsing:`,
            llmError.message,
          );
          return this.fallbackExtraction(response.data, url);
        }
      } catch (fallbackError) {
        console.warn(
          `Failed to extract products from ${url}: ${fallbackError.message}`,
        );
        return [];
      }
    }
  }

  private convertLLMProductsToWebsiteProducts(
    llmProducts: ProductFeature[],
    url: string,
  ): WebsiteProduct[] {
    return llmProducts.map((product) => ({
      name: product.name,
      description: product.description,
      url: url,
      price: (product as any).price,
      category: product.category,
      features: product.features,
    }));
  }

  private fallbackExtraction(
    htmlContent: string,
    url: string,
  ): WebsiteProduct[] {
    const $ = cheerio.load(htmlContent);
    const products: WebsiteProduct[] = [];

    // Common selectors for product information
    const productSelectors = [
      '.product',
      '.product-item',
      '.product-card',
      '.feature',
      '.service',
      '.solution',
      '.product-tile',
      '.item',
      '[data-product]',
      '.product-info',
      '.product-details',
      '.feature-item',
      '.service-item',
      '.solution-item',
    ];

    // Try different product container selectors
    for (const selector of productSelectors) {
      $(selector).each((index, element) => {
        const $element = $(element);
        const product = this.extractProductFromElement($element, $, url);
        if (product) {
          products.push(product);
        }
      });
    }

    // If no products found with specific selectors, try to extract from general content
    if (products.length === 0) {
      const generalProducts = this.extractProductsFromGeneralContent($, url);
      products.push(...generalProducts);
    }

    return products;
  }

  private extractProductFromElement(
    $element: any,
    $: any,
    baseUrl: string,
  ): WebsiteProduct | null {
    const name = this.extractText($element, [
      'h1',
      'h2',
      'h3',
      '.title',
      '.name',
      '.product-name',
      '.product-title',
      '[data-name]',
      '.heading',
      '.product-heading',
    ]);

    const description = this.extractText($element, [
      'p',
      '.description',
      '.product-description',
      '.summary',
      '.content',
      '.details',
      '.product-details',
      '.feature-description',
      '.service-description',
    ]);

    const price = this.extractText($element, [
      '.price',
      '.cost',
      '.amount',
      '[data-price]',
      '.product-price',
    ]);

    const category = this.extractText($element, [
      '.category',
      '.type',
      '.product-category',
      '[data-category]',
    ]);

    const features: string[] = [];
    $element
      .find('.feature, .benefit, .advantage, li')
      .each((index, element) => {
        const featureText = $(element).text().trim();
        if (featureText && featureText.length > 5) {
          features.push(featureText);
        }
      });

    if (name && description && name.length > 2 && description.length > 10) {
      return {
        name: name.trim(),
        description: description.trim(),
        url: baseUrl,
        price: price?.trim(),
        category: category?.trim(),
        features: features.slice(0, 10), // Limit to 10 features
      };
    }

    return null;
  }

  private extractText($element: any, selectors: string[]): string | null {
    for (const selector of selectors) {
      const text = $element.find(selector).first().text().trim();
      if (text) {
        return text;
      }
    }
    return null;
  }

  private extractProductsFromGeneralContent(
    $: cheerio.CheerioAPI,
    url: string,
  ): WebsiteProduct[] {
    const products: WebsiteProduct[] = [];

    // Look for headings that might be product names
    $('h1, h2, h3, h4').each((index, element) => {
      const $heading = $(element);
      const name = $heading.text().trim();

      if (name && name.length > 3 && name.length < 100) {
        // Look for description in the next paragraph or sibling
        let description = '';
        const $next = $heading.next('p, div, section');
        if ($next.length > 0) {
          description = $next.text().trim();
        }

        if (description && description.length > 10) {
          products.push({
            name,
            description,
            url,
          });
        }
      }
    });

    return products;
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

  private deduplicateProducts(products: WebsiteProduct[]): WebsiteProduct[] {
    const seen = new Set<string>();
    return products.filter((product) => {
      const key = `${product.name.toLowerCase()}-${product.description.toLowerCase()}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }
}
