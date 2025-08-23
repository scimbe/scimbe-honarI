/**
 * Retry Handler - Implements retry logic with exponential backoff
 * Provides configurable retry mechanisms for:
 * - Activity execution failures
 * - Network timeouts
 * - Temporary system errors
 * - Custom retry policies
 */

import { createServiceLogger } from '../shared-utils-local';

const logger = createServiceLogger('retry-handler');

export interface RetryPolicy {
  max_attempts: number;
  initial_delay_ms: number;
  max_delay_ms: number;
  backoff_multiplier: number;
  retryable_errors: string[];
}

export interface RetryResult<T> {
  success: boolean;
  result?: T;
  error?: Error;
  attempts: number;
  total_delay_ms: number;
}

export class RetryHandler {
  private defaultPolicy: RetryPolicy = {
    max_attempts: 3,
    initial_delay_ms: 1000,
    max_delay_ms: 30000,
    backoff_multiplier: 2,
    retryable_errors: [
      'TIMEOUT_ERROR',
      'NETWORK_ERROR',
      'TEMPORARY_FAILURE',
      'SERVICE_UNAVAILABLE',
      'CONNECTION_ERROR'
    ]
  };

  /**
   * Execute an operation with retry logic
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    policy?: RetryPolicy
  ): Promise<T> {
    const retryPolicy = { ...this.defaultPolicy, ...policy };
    let attempt = 1;
    let totalDelay = 0;
    let lastError: Error;

    while (attempt <= retryPolicy.max_attempts) {
      try {
        logger.getLogger().debug('Executing operation', {
          attempt,
          maxAttempts: retryPolicy.max_attempts
        });

        const result = await operation();
        
        if (attempt > 1) {
          logger.getLogger().info('Operation succeeded after retry', {
            attempt,
            totalDelay
          });
        }

        return result;

      } catch (error) {
        lastError = error as Error;
        
        logger.getLogger().warn('Operation failed', {
          attempt,
          error: lastError.message,
          retryable: this.isRetryableError(lastError, retryPolicy)
        });

        // Check if error is retryable
        if (!this.isRetryableError(lastError, retryPolicy)) {
          logger.getLogger().info('Error is not retryable, giving up', {
            errorType: this.classifyError(lastError),
            attempt
          });
          throw lastError;
        }

        // Check if we've exhausted all attempts
        if (attempt >= retryPolicy.max_attempts) {
          logger.getLogger().error('All retry attempts exhausted', {
            attempts: attempt,
            totalDelay,
            finalError: lastError.message
          });
          throw lastError;
        }

        // Calculate delay for next attempt
        const delay = this.calculateDelay(attempt, retryPolicy);
        totalDelay += delay;

        logger.getLogger().info('Retrying operation', {
          attempt: attempt + 1,
          delay,
          totalDelay
        });

        // Wait before retrying
        await this.sleep(delay);
        attempt++;
      }
    }

    throw lastError!;
  }

  /**
   * Execute with retry and return detailed result
   */
  async executeWithRetryDetails<T>(
    operation: () => Promise<T>,
    policy?: RetryPolicy
  ): Promise<RetryResult<T>> {
    const retryPolicy = { ...this.defaultPolicy, ...policy };
    const startTime = Date.now();
    let attempt = 1;
    let lastError: Error;

    while (attempt <= retryPolicy.max_attempts) {
      try {
        const result = await operation();
        const totalDelay = Date.now() - startTime;

        return {
          success: true,
          result,
          attempts: attempt,
          total_delay_ms: totalDelay
        };

      } catch (error) {
        lastError = error as Error;

        if (!this.isRetryableError(lastError, retryPolicy) || 
            attempt >= retryPolicy.max_attempts) {
          break;
        }

        const delay = this.calculateDelay(attempt, retryPolicy);
        await this.sleep(delay);
        attempt++;
      }
    }

    const totalDelay = Date.now() - startTime;
    return {
      success: false,
      error: lastError!,
      attempts: attempt,
      total_delay_ms: totalDelay
    };
  }

  /**
   * Check if an error is retryable based on policy
   */
  private isRetryableError(error: Error, policy: RetryPolicy): boolean {
    const errorType = this.classifyError(error);
    return policy.retryable_errors.includes(errorType);
  }

  /**
   * Classify error type based on error message
   */
  private classifyError(error: Error): string {
    const message = error.message.toLowerCase();

    if (message.includes('timeout') || message.includes('timed out')) {
      return 'TIMEOUT_ERROR';
    }

    if (message.includes('network') || message.includes('connection')) {
      return 'NETWORK_ERROR';
    }

    if (message.includes('unavailable') || message.includes('service')) {
      return 'SERVICE_UNAVAILABLE';
    }

    if (message.includes('temporary') || message.includes('retry')) {
      return 'TEMPORARY_FAILURE';
    }

    if (message.includes('rate limit') || message.includes('throttle')) {
      return 'RATE_LIMITED';
    }

    if (message.includes('permission') || message.includes('unauthorized')) {
      return 'PERMISSION_ERROR';
    }

    if (message.includes('validation') || message.includes('invalid')) {
      return 'VALIDATION_ERROR';
    }

    return 'UNKNOWN_ERROR';
  }

  /**
   * Calculate delay for next retry attempt using exponential backoff
   */
  private calculateDelay(attempt: number, policy: RetryPolicy): number {
    const exponentialDelay = policy.initial_delay_ms * 
      Math.pow(policy.backoff_multiplier, attempt - 1);

    // Add jitter to prevent thundering herd
    const jitter = Math.random() * 0.1 * exponentialDelay;
    const delayWithJitter = exponentialDelay + jitter;

    // Cap at maximum delay
    return Math.min(delayWithJitter, policy.max_delay_ms);
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Create a retry policy for specific scenarios
   */
  static createPolicy(scenario: 'network' | 'database' | 'api' | 'custom'): RetryPolicy {
    switch (scenario) {
      case 'network':
        return {
          max_attempts: 5,
          initial_delay_ms: 1000,
          max_delay_ms: 30000,
          backoff_multiplier: 2,
          retryable_errors: [
            'TIMEOUT_ERROR',
            'NETWORK_ERROR',
            'CONNECTION_ERROR',
            'SERVICE_UNAVAILABLE'
          ]
        };

      case 'database':
        return {
          max_attempts: 3,
          initial_delay_ms: 500,
          max_delay_ms: 5000,
          backoff_multiplier: 2,
          retryable_errors: [
            'CONNECTION_ERROR',
            'TEMPORARY_FAILURE',
            'TIMEOUT_ERROR'
          ]
        };

      case 'api':
        return {
          max_attempts: 4,
          initial_delay_ms: 2000,
          max_delay_ms: 60000,
          backoff_multiplier: 2.5,
          retryable_errors: [
            'TIMEOUT_ERROR',
            'SERVICE_UNAVAILABLE',
            'RATE_LIMITED',
            'TEMPORARY_FAILURE'
          ]
        };

      default:
        return {
          max_attempts: 3,
          initial_delay_ms: 1000,
          max_delay_ms: 10000,
          backoff_multiplier: 2,
          retryable_errors: ['TEMPORARY_FAILURE']
        };
    }
  }
}