import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || 'development',
  
  // Edge runtime has different constraints
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.05 : 1.0,
  
  beforeSend(event, hint) {
    // Edge runtime specific filtering
    if (event.request?.headers) {
      delete event.request.headers['authorization'];
      delete event.request.headers['x-api-key'];
    }
    return event;
  },
  
  initialScope: {
    tags: {
      component: 'edge',
      feature: 'keyword-engine',
    },
  },
});