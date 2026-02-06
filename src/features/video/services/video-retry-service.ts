import type { RetryState, VideoError } from '../types/video-error.types';
import { calculateRetryDelay } from '../types/video-error.types';

export class VideoRetryService {
  /**
   * Check if retry is allowed based on current state
   */
  static canRetry(retryState: RetryState, error: VideoError | null): boolean {
    return (
      !retryState.isRetrying &&
      retryState.attempt < retryState.maxAttempts &&
      !!error?.canRetry
    );
  }

  /**
   * Calculate delay for next retry attempt
   */
  static getRetryDelay(
    attempt: number,
    baseDelay: number = 1000,
    maxDelay: number = 30000
  ): number {
    return calculateRetryDelay(attempt, baseDelay, maxDelay);
  }

  /**
   * Execute retry with delay
   */
  static async executeRetry(
    retryFunction: () => void | Promise<void>,
    delayMs: number
  ): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(async () => {
        await retryFunction();
        resolve();
      }, delayMs);
    });
  }

  /**
   * Create retry state for new attempt
   */
  static createRetryState(
    maxAttempts: number = 3,
    baseDelay: number = 1000
  ): RetryState {
    return {
      attempt: 0,
      maxAttempts,
      baseDelay,
      isRetrying: false,
    };
  }

  /**
   * Reset retry state to initial values
   */
  static resetRetryState(retryState: RetryState): RetryState {
    return {
      ...retryState,
      attempt: 0,
      isRetrying: false,
    };
  }

  /**
   * Update retry state for next attempt
   */
  static incrementRetryAttempt(retryState: RetryState): RetryState {
    return {
      ...retryState,
      attempt: retryState.attempt + 1,
      isRetrying: false,
    };
  }

  /**
   * Mark retry as in progress
   */
  static markRetryInProgress(retryState: RetryState): RetryState {
    return {
      ...retryState,
      isRetrying: true,
    };
  }

  /**
   * Get retry progress as percentage
   */
  static getRetryProgress(retryState: RetryState): number {
    return Math.round((retryState.attempt / retryState.maxAttempts) * 100);
  }

  /**
   * Get human-readable retry status
   */
  static getRetryStatus(retryState: RetryState): string {
    if (retryState.isRetrying) {
      return `Retrying... (${retryState.attempt + 1}/${retryState.maxAttempts})`;
    }

    if (retryState.attempt >= retryState.maxAttempts) {
      return 'Maximum retries reached';
    }

    if (retryState.attempt > 0) {
      return `Retry ${retryState.attempt}/${retryState.maxAttempts}`;
    }

    return 'Ready';
  }
}