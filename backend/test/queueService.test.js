import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { AppError } from '../src/http/errors.js';
import { joinQueue } from '../src/queue/queueService.js';

function createFakePool(results) {
  const calls = [];
  const client = {
    async query(sql, params = []) {
      calls.push({ sql: String(sql), params });

      if (String(sql).trim() === 'BEGIN' || String(sql).trim() === 'COMMIT' || String(sql).trim() === 'ROLLBACK') {
        return { rowCount: 0, rows: [] };
      }

      const next = results.shift();
      if (!next) {
        throw new Error(`Unexpected query: ${String(sql)}`);
      }

      return next;
    },
    releaseCalled: false,
    release() {
      this.releaseCalled = true;
    },
  };

  return {
    calls,
    client,
    async connect() {
      return client;
    },
  };
}

describe('joinQueue', () => {
  it('creates a ticket inside a transaction and returns position and estimate', async () => {
    const pool = createFakePool([
      {
        rowCount: 1,
        rows: [
          {
            id: 'queue-1',
            state: 'open',
            capacity: 25,
            next_ticket_number: 7,
            average_consultation_minutes: 12,
          },
        ],
      },
      { rowCount: 0, rows: [] },
      { rowCount: 1, rows: [{ active_count: 6 }] },
      {
        rowCount: 1,
        rows: [
          {
            id: 'ticket-1',
            queue_session_id: 'queue-1',
            patient_id: 'patient-1',
            ticket_number: 7,
            status: 'waiting',
            source: 'online',
            created_at: '2026-08-17T00:00:00.000Z',
          },
        ],
      },
      { rowCount: 1, rows: [] },
      { rowCount: 1, rows: [] },
    ]);

    const result = await joinQueue({
      pool,
      queueSessionId: 'queue-1',
      patientId: 'patient-1',
      actorUserId: 'patient-1',
      requestId: 'request-1',
    });

    assert.equal(result.ticket.ticket_number, 7);
    assert.equal(result.position, 7);
    assert.equal(result.estimatedWaitMinutes, 72);
    assert.equal(pool.client.releaseCalled, true);
    assert.equal(pool.calls[0].sql, 'BEGIN');
    assert.equal(pool.calls.at(-1).sql, 'COMMIT');
  });

  it('rejects duplicate active tickets and rolls back', async () => {
    const pool = createFakePool([
      {
        rowCount: 1,
        rows: [
          {
            id: 'queue-1',
            state: 'open',
            capacity: 25,
            next_ticket_number: 7,
            average_consultation_minutes: 12,
          },
        ],
      },
      {
        rowCount: 1,
        rows: [{ id: 'ticket-existing', ticket_number: 3, status: 'waiting' }],
      },
    ]);

    await assert.rejects(
      () =>
        joinQueue({
          pool,
          queueSessionId: 'queue-1',
          patientId: 'patient-1',
          actorUserId: 'patient-1',
          requestId: 'request-1',
        }),
      (error) => error instanceof AppError && error.code === 'active_ticket_exists',
    );

    assert.equal(pool.calls.at(-1).sql, 'ROLLBACK');
    assert.equal(pool.client.releaseCalled, true);
  });

  it('rejects a full queue and rolls back', async () => {
    const pool = createFakePool([
      {
        rowCount: 1,
        rows: [
          {
            id: 'queue-1',
            state: 'open',
            capacity: 2,
            next_ticket_number: 3,
            average_consultation_minutes: 12,
          },
        ],
      },
      { rowCount: 0, rows: [] },
      { rowCount: 1, rows: [{ active_count: 2 }] },
    ]);

    await assert.rejects(
      () =>
        joinQueue({
          pool,
          queueSessionId: 'queue-1',
          patientId: 'patient-3',
          actorUserId: 'patient-3',
          requestId: 'request-1',
        }),
      (error) => error instanceof AppError && error.code === 'queue_capacity_reached',
    );

    assert.equal(pool.calls.at(-1).sql, 'ROLLBACK');
    assert.equal(pool.client.releaseCalled, true);
  });
});
