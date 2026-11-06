/**
 * Retry Manager
 * Handles automatic retries with exponential backoff
 */
import { logger } from './logger';

export interface RetryConfig {
  maxRetries: number;
  initialDelay: number; // milliseconds
  maxDelay: number; // milliseconds
  backoffMultiplier: number;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelay: 5000, // 5 seconds
  maxDelay: 300000, // 5 minutes
  backoffMultiplier: 2,
};

export class RetryManager {
  /**
   * Calculate delay for next retry using exponential backoff
   */
  calculateDelay(retryCount: number, config: RetryConfig = DEFAULT_RETRY_CONFIG): number {
    const delay = config.initialDelay * Math.pow(config.backoffMultiplier, retryCount);
    return Math.min(delay, config.maxDelay);
  }

  /**
   * Calculate next retry timestamp
   */
  getNextRetryTime(retryCount: number, config: RetryConfig = DEFAULT_RETRY_CONFIG): Date {
    const delay = this.calculateDelay(retryCount, config);
    return new Date(Date.now() + delay);
  }

  /**
   * Check if an item should be retried
   */
  shouldRetry(
    retryCount: number,
    maxRetries: number,
    error: string,
    config: RetryConfig = DEFAULT_RETRY_CONFIG
  ): boolean {
    // Don't retry if max retries reached
    if (retryCount >= maxRetries) {
      logger.info(`[RetryManager] Max retries (${maxRetries}) reached, giving up`);
      return false;
    }

    // Don't retry certain types of errors (permanent failures)
    const permanentErrors = [
      /video unavailable/i,
      /private video/i,
      /deleted video/i,
      /age.restricted/i,
      /members.only/i,
      /geo.restricted/i,
      /copyright/i,
      /drm/i,
      /404/i,
      /file corrupted/i,
    ];

    for (const pattern of permanentErrors) {
      if (pattern.test(error)) {
        logger.info(`[RetryManager] Permanent error detected, not retrying: ${error}`);
        return false;
      }
    }

    // Retry transient errors (network issues, temporary failures)
    logger.info(`[RetryManager] Transient error, will retry: ${error}`);
    return true;
  }

  /**
   * Format retry delay for display
   */
  formatDelay(milliseconds: number): string {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  }

  /**
   * Check if retry time has arrived
   */
  isRetryReady(nextRetryAt: string | undefined): boolean {
    if (!nextRetryAt) return true;
    return new Date(nextRetryAt) <= new Date();
  }
}

// Singleton instance
export const retryManager = new RetryManager();
