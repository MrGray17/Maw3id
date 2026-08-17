import express from 'express';

export function healthRouter(config) {
  const router = express.Router();

  router.get('/healthz', (_req, res) => {
    res.status(200).json({
      status: 'ok',
      service: config.serviceName,
      environment: config.env,
      timestamp: new Date().toISOString(),
    });
  });

  router.get('/readyz', (_req, res) => {
    res.status(200).json({
      status: 'ready',
      service: config.serviceName,
    });
  });

  return router;
}
