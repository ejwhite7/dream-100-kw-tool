import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || 'development',
  
  // Server-side performance monitoring
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  
  // Enhanced server-side error context
  beforeSend(event, hint) {
    // Sanitize sensitive data
    if (event.request?.headers) {
      delete event.request.headers['authorization'];
      delete event.request.headers['x-api-key'];
    }
    
    // Filter out expected errors
    if (event.exception) {
      const error = event.exception.values?.[0];
      if (error?.value?.includes('ECONNRESET')) {
        return null;
      }
    }
    
    return event;
  },
  
  // Custom tags for server components
  initialScope: {
    tags: {
      component: 'server',
      feature: 'keyword-engine',
    },
  },
});