import express from 'express';

import { createSessionAuthentication } from './auth/sessionAuthentication.js';
import { loadConfig } from './config.js';
import { pool as defaultPool } from './db/pool.js';
import { errorHandler, notFoundHandler } from './http/errors.js';
import { cors, requestContext, securityHeaders } from './http/middleware.js';
import { joinQueue } from './queue/queueService.js';
import { healthRouter } from './routes/health.js';
import { createQueueRouter } from './routes/queue.js';

export function createApp(config = loadConfig(), dependencies = {}) {
  const app = express();
  const pool = dependencies.pool ?? defaultPool;
  const authenticate =
    dependencies.authenticate ??
    createSessionAuthentication({
      pool,
      cookieName: config.sessionCookieName,
      idleTtlSeconds: config.sessionIdleTtlSeconds,
    });
  const joinQueueService = dependencies.joinQueueService ?? joinQueue;

  app.disable('x-powered-by');

  app.use(requestContext(config));
  app.use(securityHeaders);
  app.use(cors(config.allowedOrigins));
  app.use(express.json({ limit: '32kb' }));

  app.use(healthRouter(config));
  app.use('/api/v1', createQueueRouter({ pool, authenticate, joinQueueService }));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
