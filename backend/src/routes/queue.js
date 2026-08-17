import express from 'express';

import { requireAuthenticatedUser, requireRole } from '../auth/authorization.js';
import { requireCsrfToken } from '../auth/csrf.js';
import { createQueueController } from '../queue/queueController.js';

export function createQueueRouter({ pool, authenticate, joinQueueService }) {
  const router = express.Router();
  const controller = createQueueController({ pool, joinQueueService });

  router.post(
    '/queue-sessions/:queueSessionId/tickets',
    authenticate,
    requireAuthenticatedUser,
    requireCsrfToken,
    requireRole('patient'),
    controller.join,
  );

  return router;
}
