import { rejectUnexpectedFields, requireUuid } from '../http/validation.js';

export function createQueueController({ pool, joinQueueService }) {
  return {
    join: async (req, res) => {
      const queueSessionId = requireUuid(req.params.queueSessionId, 'queueSessionId');

      // Online patients may only join for themselves. Identity and source are
      // server-controlled so a caller cannot create a ticket for another user.
      rejectUnexpectedFields(req.body, []);

      const result = await joinQueueService({
        pool,
        queueSessionId,
        patientId: req.auth.userId,
        actorUserId: req.auth.userId,
        source: 'online',
        requestId: req.id,
      });

      return res.status(201).json({
        data: result,
        meta: {
          requestId: req.id,
        },
      });
    },
  };
}
