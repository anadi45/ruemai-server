import { Injectable } from '@nestjs/common';

export interface PerformanceMetrics {
  operation: string;
  startTime: number;
  endTime: number;
  duration: number;
  success: boolean;
  metadata?: Record<string, any>;
}

@Injectable()
export class PerformanceService {
  private metrics: PerformanceMetrics[] = [];

  /**
   * Start timing an operation
   */
  startTiming(operation: string, metadata?: Record<string, any>): string {
    const id = `${operation}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();

    // Store the start time and metadata
    this.metrics.push({
      operation,
      startTime,
      endTime: 0,
      duration: 0,
      success: false,
      metadata: { ...metadata, id },
    });

    return id;
  }

  /**
   * End timing an operation
   */
  endTiming(id: string, success: boolean = true): void {
    const endTime = Date.now();
    const metric = this.metrics.find((m) => m.metadata?.id === id);

    if (metric) {
      metric.endTime = endTime;
      metric.duration = endTime - metric.startTime;
      metric.success = success;
    }
  }

  /**
   * Get performance metrics for an operation
   */
  getMetrics(operation?: string): PerformanceMetrics[] {
    if (operation) {
      return this.metrics.filter((m) => m.operation === operation);
    }
    return [...this.metrics];
  }

  /**
   * Get average duration for an operation
   */
  getAverageDuration(operation: string): number {
    const operationMetrics = this.metrics.filter(
      (m) => m.operation === operation,
    );
    if (operationMetrics.length === 0) return 0;

    const totalDuration = operationMetrics.reduce(
      (sum, m) => sum + m.duration,
      0,
    );
    return totalDuration / operationMetrics.length;
  }

  /**
   * Get success rate for an operation
   */
  getSuccessRate(operation: string): number {
    const operationMetrics = this.metrics.filter(
      (m) => m.operation === operation,
    );
    if (operationMetrics.length === 0) return 0;

    const successful = operationMetrics.filter((m) => m.success).length;
    return successful / operationMetrics.length;
  }

  /**
   * Clear old metrics (keep last 1000)
   */
  cleanup(): void {
    if (this.metrics.length > 1000) {
      this.metrics = this.metrics.slice(-1000);
    }
  }

  /**
   * Get performance summary
   */
  getSummary(): Record<string, any> {
    const operations = [...new Set(this.metrics.map((m) => m.operation))];
    const summary: Record<string, any> = {};

    for (const operation of operations) {
      const operationMetrics = this.metrics.filter(
        (m) => m.operation === operation,
      );
      const durations = operationMetrics.map((m) => m.duration);

      summary[operation] = {
        count: operationMetrics.length,
        averageDuration:
          durations.reduce((a, b) => a + b, 0) / durations.length,
        minDuration: Math.min(...durations),
        maxDuration: Math.max(...durations),
        successRate: this.getSuccessRate(operation),
        lastExecution: operationMetrics[operationMetrics.length - 1]?.endTime,
      };
    }

    return summary;
  }

  /**
   * Clear all metrics
   */
  clear(): void {
    this.metrics = [];
  }
}
