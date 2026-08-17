import express from 'express';

import bookingRoutes from '../routes/bookingRoutes.js';
import { loadConfig } from './config.js';
import { errorHandler, notFoundHandler } from './http/errors.js';
import { cors, requestContext, securityHeaders } from './http/middleware.js';
import { healthRouter } from './routes/health.js';

export function createApp(config = loadConfig()) {
  const app = express();

  app.disable('x-powered-by');

  app.use(requestContext(config));
  app.use(securityHeaders);
  app.use(cors(config.allowedOrigins));
  app.use(express.json({ limit: '32kb' }));

  app.use(healthRouter(config));
  app.use('/api/v1', bookingRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
