import express from 'express';

import { createSessionAuthentication } from './auth/sessionAuthentication.js';
import { createHttpOtpSender, requestPhoneOtp, verifyPhoneOtp } from './auth/otpService.js';
import { loadConfig } from './config.js';
import { pool as defaultPool } from './db/pool.js';
import { errorHandler, notFoundHandler } from './http/errors.js';
import { cors, requestContext, securityHeaders } from './http/middleware.js';
import { joinQueue } from './queue/queueService.js';
import { searchNearbyDoctors } from './search/doctorSearchService.js';
import { createDoctorRouter } from './routes/doctors.js';
import { createAuthRouter } from './routes/auth.js';
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
  const doctorSearchService =
    dependencies.doctorSearchService ?? ((input) => searchNearbyDoctors({ pool, ...input }));
  const sendOtp = dependencies.sendOtp ?? (
    config.otpDeliveryMode === 'http'
      ? createHttpOtpSender({ url: config.otpProviderUrl, token: config.otpProviderToken })
      : async () => {}
  );
  const requestOtpService = dependencies.requestOtpService ?? ((input) => requestPhoneOtp({
    pool, pepper: config.otpHashPepper, sendOtp, ...input,
  }));
  const verifyOtpService = dependencies.verifyOtpService ?? ((input) => verifyPhoneOtp({
    pool, pepper: config.otpHashPepper,
    idleTtlSeconds: config.sessionIdleTtlSeconds,
    absoluteTtlSeconds: config.sessionAbsoluteTtlSeconds,
    ...input,
  }));

  app.disable('x-powered-by');
  app.locals.pool = pool;

  app.use(requestContext(config));
  app.use(securityHeaders);
  app.use(cors(config.allowedOrigins));
  app.use(express.json({ limit: '32kb' }));

  app.use(healthRouter(config));
  app.use('/api/v1', createAuthRouter({ config, authenticate, requestOtpService, verifyOtpService }));
  app.use('/api/v1', createDoctorRouter({ searchService: doctorSearchService }));
  app.use('/api/v1', createQueueRouter({ pool, authenticate, joinQueueService }));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
