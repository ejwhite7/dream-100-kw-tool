import { ApiError, RateLimitInfo, CostInfo } from '../types/api';
import * as Sentry from '@sentry/nextjs';

export class CustomApiError extends Error implements ApiError {
  constructor(
    message: string,
    public code: string,
    public statusCode?: number,
    public retryable: boolean = false,
    public rateLimit?: RateLimitInfo,
    public cost?: CostInfo,
    public provider?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class RetryableError extends CustomApiError {
  constructor(
    message: string,
    code: string,
    statusCode?: number,
    rateLimit?: RateLimitInfo,
    cost?: CostInfo,
    provider?: string
  ) {
    super(message, code, statusCode, true, rateLimit, cost, provider);
    this.name = 'RetryableError';
  }
}

export class RateLimitError extends CustomApiError {
  constructor(
    message: string,
    rateLimit: RateLimitInfo,
    provider: string
  ) {
    super(
      `${message}. Retry after ${rateLimit.retryAfter || rateLimit.reset} seconds`,
      'RATE_LIMIT_EXCEEDED',
      429,
      true,
      rateLimit,
      undefined,
      provider
    );
    this.name = 'RateLimitError';
  }
}

export class BudgetExceededError extends CustomApiError {
  constructor(
    message: string,
    cost: CostInfo,
    provider: string
  ) {
    super(
      `${message}. Budget remaining: $${cost.budgetRemaining || 0}`,
      'BUDGET_EXCEEDED',
      402,
      false,
      undefined,
      cost,
      provider
    );
    this.name = 'BudgetExceededError';
  }
}

export class CircuitBreakerOpenError extends CustomApiError {
  constructor(provider: string, nextRetryTime: number) {
    super(
      `Circuit breaker for ${provider} is open. Next retry: ${new Date(nextRetryTime)}`,
      'CIRCUIT_BREAKER_OPEN',
      503,
      false,
      undefined,
      undefined,
      provider
    );
    this.name = 'CircuitBreakerOpenError';
  }
}

export class ApiResponseError extends CustomApiError {
  constructor(
    message: string,
    statusCode: number,
    provider: string,
    responseBody?: any
  ) {
    const retryable = statusCode >= 500 || statusCode === 429;
    super(message, `HTTP_${statusCode}`, statusCode, retryable, undefined, undefined, provider);
    this.name = 'ApiResponseError';
    
    if (responseBody) {
      (this as any).responseBody = responseBody;
    }
  }
}

// Enhanced error handler with Sentry integration
export class ErrorHandler {
  static handle(error: Error, context?: Record<string, any>): ApiError {
    let apiError: ApiError;
    
    if (error instanceof CustomApiError) {
      apiError = error;
    } else if (error.name === 'AbortError' || error.message?.includes('timeout')) {
      apiError = new RetryableError(
        'Request timeout',
        'TIMEOUT',
        408,
        undefined,
        undefined,
        context?.provider
      );
    } else if (error.message?.includes('ECONNRESET') || error.message?.includes('ENOTFOUND')) {
      apiError = new RetryableError(
        'Network error',
        'NETWORK_ERROR',
        undefined,
        undefined,
        undefined,
        context?.provider
      );
    } else {
      apiError = new CustomApiError(
        error.message,
        'UNKNOWN_ERROR',
        undefined,
        false,
        undefined,
        undefined,
        context?.provider
      );
    }
    
    // Send to Sentry with enhanced context
    Sentry.withScope((scope) => {
      scope.setTag('errorType', apiError.name);
      scope.setTag('errorCode', apiError.code);
      scope.setTag('provider', apiError.provider || 'unknown');
      scope.setTag('retryable', apiError.retryable);
      
      if (apiError.statusCode) {
        scope.setTag('statusCode', apiError.statusCode);
      }
      
      if (apiError.rateLimit) {
        scope.setContext('rateLimit', apiError.rateLimit);
      }
      
      if (apiError.cost) {
        scope.setContext('cost', apiError.cost);
      }
      
      if (context) {
        scope.setContext('errorContext', context);
      }
      
      // Set appropriate level based on error type
      const level = apiError.retryable ? 'warning' : 'error';
      scope.setLevel(level);
      
      Sentry.captureException(apiError);
    });
    
    return apiError;
  }
  
  static handleError(error: Error, context?: Record<string, any>): ApiError {
    return ErrorHandler.handle(error, context);
  }
  
  static isRetryable(error: Error): boolean {
    if (error instanceof CustomApiError) {
      return error.retryable;
    }
    
    // Check for common retryable patterns
    if (error.name === 'AbortError' || error.message?.includes('timeout')) {
      return true;
    }
    
    if (error.message?.includes('ECONNRESET') || error.message?.includes('ENOTFOUND')) {
      return true;
    }
    
    return false;
  }
  
  static getRetryDelay(error: ApiError, attempt: number): number {
    // Respect rate limit retry-after header
    if (error instanceof RateLimitError && error.rateLimit?.retryAfter) {
      return error.rateLimit.retryAfter * 1000;
    }
    
    // Exponential backoff with jitter
    const baseDelay = Math.min(1000 * Math.pow(2, attempt), 30000); // Cap at 30 seconds
    const jitter = Math.random() * 1000; // Up to 1 second jitter
    
    return baseDelay + jitter;
  }
  
  static createTimeoutError(timeoutMs: number, provider: string): ApiError {
    return new RetryableError(
      `Request timed out after ${timeoutMs}ms`,
      'TIMEOUT',
      408,
      undefined,
      undefined,
      provider
    );
  }
  
  static createNetworkError(originalError: Error, provider: string): ApiError {
    return new RetryableError(
      `Network error: ${originalError.message}`,
      'NETWORK_ERROR',
      undefined,
      undefined,
      undefined,
      provider
    );
  }
  
  static createRateLimitError(
    rateLimit: RateLimitInfo,
    provider: string,
    message?: string
  ): RateLimitError {
    return new RateLimitError(
      message || `Rate limit exceeded for ${provider}`,
      rateLimit,
      provider
    );
  }
  
  static createBudgetError(
    cost: CostInfo,
    provider: string,
    message?: string
  ): BudgetExceededError {
    return new BudgetExceededError(
      message || `Budget exceeded for ${provider}`,
      cost,
      provider
    );
  }
}

// Retry utility with exponential backoff
export class RetryHandler {
  static async withRetry<T>(
    operation: () => Promise<T>,
    options: {
      maxAttempts?: number;
      backoffMultiplier?: number;
      maxDelay?: number;
      shouldRetry?: (error: Error) => boolean;
      onRetry?: (error: Error, attempt: number) => void;
      provider?: string;
    } = {}
  ): Promise<T> {
    const {
      maxAttempts = 3,
      backoffMultiplier = 2,
      maxDelay = 30000,
      shouldRetry = ErrorHandler.isRetryable,
      onRetry,
      provider = 'unknown'
    } = options;
    
    let lastError: Error;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        
        if (attempt === maxAttempts || !shouldRetry(lastError)) {
          throw ErrorHandler.handle(lastError, { provider, attempt });
        }
        
        const apiError = ErrorHandler.handle(lastError, { provider, attempt });
        const delay = ErrorHandler.getRetryDelay(apiError, attempt - 1);
        
        if (onRetry) {
          onRetry(lastError, attempt);
        }
        
        Sentry.addBreadcrumb({
          message: `Retrying operation after error (attempt ${attempt}/${maxAttempts})`,
          level: 'warning',
          category: 'retry',
          data: {
            provider,
            attempt,
            error: lastError.message,
            retryDelay: delay
          }
        });
        
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw ErrorHandler.handle(lastError!, { provider, finalAttempt: true });
  }
}

// Error aggregation for batch operations
export class ErrorAggregator {
  private errors: Array<{
    index: number;
    error: ApiError;
    context?: any;
  }> = [];
  
  addError(index: number, error: Error, context?: any): void {
    const apiError = ErrorHandler.handle(error, context);
    this.errors.push({ index, error: apiError, context });
  }
  
  hasErrors(): boolean {
    return this.errors.length > 0;
  }
  
  getErrors(): Array<{ index: number; error: ApiError; context?: any }> {
    return this.errors;
  }
  
  getRetryableErrors(): Array<{ index: number; error: ApiError; context?: any }> {
    return this.errors.filter(e => e.error.retryable);
  }
  
  getFatalErrors(): Array<{ index: number; error: ApiError; context?: any }> {
    return this.errors.filter(e => !e.error.retryable);
  }
  
  getErrorSummary() {
    const total = this.errors.length;
    const retryable = this.getRetryableErrors().length;
    const fatal = this.getFatalErrors().length;
    
    const errorsByType = this.errors.reduce((acc, e) => {
      acc[e.error.code] = (acc[e.error.code] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    return {
      total,
      retryable,
      fatal,
      errorsByType,
      successRate: total > 0 ? 1 - (total / (total + this.getSuccessCount())) : 1
    };
  }
  
  private getSuccessCount(): number {
    // This would need to be set externally or calculated differently
    return 0;
  }
  
  clear(): void {
    this.errors = [];
  }
}