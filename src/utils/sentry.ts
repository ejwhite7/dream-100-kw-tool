import * as Sentry from '@sentry/nextjs';

export class SentryReporter {
  static captureApiUsage(event: any): void {
    Sentry.addBreadcrumb({
      message: `API call to ${event.provider}`,
      level: event.status >= 400 ? 'warning' : 'info',
      category: 'api-usage',
      data: {
        provider: event.provider,
        endpoint: event.endpoint,
        method: event.method,
        status: event.status,
        responseTime: event.responseTime,
        cost: event.cost,
        cached: event.cached,
        userId: event.userId,
        runId: event.runId
      }
    });

    if (event.status >= 400) {
      Sentry.captureMessage(`API Error: ${event.provider} ${event.endpoint}`, 'warning');
    }
  }

  static captureApiMetrics(serviceName: string, metrics: any): void {
    Sentry.addBreadcrumb({
      message: `API metrics for ${serviceName}`,
      level: 'info',
      category: 'api-metrics',
      data: {
        serviceName,
        ...metrics
      }
    });
  }

  static captureBusinessMetrics(metrics: any): void {
    Sentry.addBreadcrumb({
      message: 'Business metrics update',
      level: 'info',
      category: 'business-metrics',
      data: metrics
    });
  }

  static captureKeywordProcessing(data: any): void {
    Sentry.addBreadcrumb({
      message: 'Keyword processing event',
      level: 'info',
      category: 'keyword-processing',
      data: {
        stage: data.stage,
        keywordCount: data.keywordCount,
        processingTime: data.processingTime,
        success: data.success
      }
    });
  }

  static captureExportEvent(event: any): void {
    Sentry.addBreadcrumb({
      message: `Export ${event.format} requested`,
      level: 'info',
      category: 'export',
      data: {
        format: event.format,
        recordCount: event.recordCount,
        template: event.template,
        success: event.success
      }
    });
  }

  static captureUserAction(action: string, context?: Record<string, any>): void {
    Sentry.addBreadcrumb({
      message: `User action: ${action}`,
      level: 'info',
      category: 'user-action',
      data: context
    });
  }

  static capturePipelineProgress(progress: any): void {
    Sentry.addBreadcrumb({
      message: 'Pipeline progress update',
      level: 'info',
      category: 'pipeline-progress',
      data: {
        step: progress.step,
        progress: progress.progress,
        eta: progress.eta,
        keywordsProcessed: progress.keywordsProcessed
      }
    });
  }

  static capturePerformanceMetric(metric: string, value: number, unit: string): void {
    Sentry.addBreadcrumb({
      message: `Performance metric: ${metric}`,
      level: 'info',
      category: 'performance',
      data: {
        metric,
        value,
        unit,
        timestamp: Date.now()
      }
    });
  }

  static captureError(error: Error, context?: Record<string, any>): void {
    Sentry.withScope((scope) => {
      if (context) {
        Object.keys(context).forEach(key => {
          scope.setContext(key, context[key]);
        });
      }
      Sentry.captureException(error);
    });
  }

  static setUserContext(user: { id: string; email?: string }): void {
    Sentry.setUser(user);
  }

  static setRunContext(runId: string, metadata?: Record<string, any>): void {
    Sentry.setTag('runId', runId);
    if (metadata) {
      Sentry.setContext('run', metadata);
    }
  }
}

// Enhanced error boundary wrapper
export function withSentryErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  options?: {
    fallback?: React.ComponentType<{ error: Error; resetError: () => void }>;
    showDialog?: boolean;
  }
) {
  return Sentry.withErrorBoundary(Component, {
    fallback: options?.fallback || (() => null),
    showDialog: options?.showDialog || false,
    beforeCapture: (scope, error, errorInfo) => {
      scope.setTag('errorBoundary', true);
      scope.setContext('errorInfo', errorInfo);
      scope.setLevel('error');
    }
  });
}

// Hook for capturing user interactions
export function useSentryInteraction() {
  return {
    captureClick: (element: string, context?: Record<string, any>) => {
      Sentry.addBreadcrumb({
        message: `User clicked: ${element}`,
        level: 'info',
        category: 'ui.click',
        data: context
      });
    },
    captureNavigation: (from: string, to: string) => {
      Sentry.addBreadcrumb({
        message: `Navigation: ${from} -> ${to}`,
        level: 'info',
        category: 'navigation'
      });
    }
  };
}