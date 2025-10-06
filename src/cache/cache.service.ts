import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number; // Time to live in milliseconds
}

@Injectable()
export class CacheService {
  private cache = new Map<string, CacheEntry<any>>();
  private readonly DEFAULT_TTL = 24 * 60 * 60 * 1000; // 24 hours

  /**
   * Generate a cache key from content hash
   */
  private generateKey(content: string, type: string): string {
    const hash = createHash('sha256').update(content).digest('hex');
    return `${type}:${hash}`;
  }

  /**
   * Get cached data if it exists and is not expired
   */
  get<T>(content: string, type: string): T | null {
    const key = this.generateKey(content, type);
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // Check if entry is expired
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  /**
   * Set cached data with TTL
   */
  set<T>(
    content: string,
    type: string,
    data: T,
    ttl: number = this.DEFAULT_TTL,
  ): void {
    const key = this.generateKey(content, type);
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl,
    };

    this.cache.set(key, entry);
  }

  /**
   * Check if content is cached and not expired
   */
  has(content: string, type: string): boolean {
    const key = this.generateKey(content, type);
    const entry = this.cache.get(key);

    if (!entry) {
      return false;
    }

    // Check if entry is expired
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Clear expired entries
   */
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clear all cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    entries: Array<{ key: string; age: number; ttl: number }>;
  } {
    const entries = Array.from(this.cache.entries()).map(([key, entry]) => ({
      key,
      age: Date.now() - entry.timestamp,
      ttl: entry.ttl,
    }));

    return {
      size: this.cache.size,
      entries,
    };
  }
}
