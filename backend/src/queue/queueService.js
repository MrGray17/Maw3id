import { AppError } from '../http/errors.js';

const ACTIVE_TICKET_STATUSES = ['waiting', 'called', 'in_consultation'];

function activeStatusesForSql() {
  return ACTIVE_TICKET_STATUSES;
}

export async function joinQueue({ pool, queueSessionId, patientId, actorUserId, source = 'online', requestId }) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const sessionResult = await client.query(
      `
        SELECT id, state, capacity, next_ticket_number, average_consultation_minutes
        FROM queue_sessions
        WHERE id = $1
        FOR UPDATE
      `,
      [queueSessionId],
    );

    if (sessionResult.rowCount === 0) {
      throw new AppError(404, 'queue_session_not_found', 'Queue session was not found.');
    }

    const session = sessionResult.rows[0];

    if (session.state !== 'open') {
      throw new AppError(409, 'queue_session_not_open', 'Queue session is not accepting new tickets.');
    }

    const duplicateResult = await client.query(
      `
        SELECT id, ticket_number, status
        FROM tickets
        WHERE queue_session_id = $1
          AND patient_id = $2
          AND status = ANY($3::ticket_status[])
        LIMIT 1
      `,
      [queueSessionId, patientId, activeStatusesForSql()],
    );

    if (duplicateResult.rowCount > 0) {
      throw new AppError(409, 'active_ticket_exists', 'Patient already has an active ticket for this queue.', {
        ticketId: duplicateResult.rows[0].id,
        ticketNumber: duplicateResult.rows[0].ticket_number,
      });
    }

    const countResult = await client.query(
      `
        SELECT count(*)::int AS active_count
        FROM tickets
        WHERE queue_session_id = $1
          AND status = ANY($2::ticket_status[])
      `,
      [queueSessionId, activeStatusesForSql()],
    );

    const activeCount = countResult.rows[0].active_count;

    if (activeCount >= session.capacity) {
      throw new AppError(409, 'queue_capacity_reached', 'Queue session has reached capacity.');
    }

    const ticketNumber = session.next_ticket_number;

    const ticketResult = await client.query(
      `
        INSERT INTO tickets (
          queue_session_id,
          patient_id,
          ticket_number,
          status,
          source,
          created_by
        )
        VALUES ($1, $2, $3, 'waiting', $4, $5)
        RETURNING id, queue_session_id, patient_id, ticket_number, status, source, created_at
      `,
      [queueSessionId, patientId, ticketNumber, source, actorUserId],
    );

    await client.query(
      `
        UPDATE queue_sessions
        SET next_ticket_number = next_ticket_number + 1,
            last_status_update_at = now(),
            updated_at = now()
        WHERE id = $1
      `,
      [queueSessionId],
    );

    await client.query(
      `
        INSERT INTO audit_events (
          actor_user_id,
          entity_type,
          entity_id,
          action,
          new_value,
          request_id
        )
        VALUES ($1, 'ticket', $2, 'ticket.created', $3, $4)
      `,
      [
        actorUserId,
        ticketResult.rows[0].id,
        JSON.stringify({
          queueSessionId,
          patientId,
          ticketNumber,
          source,
        }),
        requestId,
      ],
    );

    await client.query('COMMIT');

    return {
      ticket: ticketResult.rows[0],
      position: activeCount + 1,
      estimatedWaitMinutes: activeCount * session.average_consultation_minutes,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
