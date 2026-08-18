import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';

import pg from 'pg';

import { AppError } from '../src/http/errors.js';
import { joinQueue } from '../src/queue/queueService.js';
import { searchNearbyDoctors } from '../src/search/doctorSearchService.js';

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  host: process.env.POSTGRES_HOST,
  port: process.env.POSTGRES_PORT ? Number(process.env.POSTGRES_PORT) : undefined,
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  max: 6,
});

const fixtureRequestPrefixes = [];

async function createFixture({ capacity = 10 } = {}) {
  const suffix = randomUUID();
  const requestPrefix = `integration-${suffix}`;
  fixtureRequestPrefixes.push(requestPrefix);

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const doctorUser = await client.query(
      `INSERT INTO users (full_name, email, role)
       VALUES ('Integration Doctor', $1, 'doctor')
       RETURNING id`,
      [`doctor-${suffix}@example.test`],
    );
    const patientOne = await client.query(
      `INSERT INTO users (full_name, email, role)
       VALUES ('Integration Patient One', $1, 'patient')
       RETURNING id`,
      [`patient-one-${suffix}@example.test`],
    );
    const patientTwo = await client.query(
      `INSERT INTO users (full_name, email, role)
       VALUES ('Integration Patient Two', $1, 'patient')
       RETURNING id`,
      [`patient-two-${suffix}@example.test`],
    );
    const cabinet = await client.query(
      `INSERT INTO cabinets (
         name, address, city, latitude, longitude, verification_status, verified_at
       )
       VALUES ('Integration Cabinet', '1 Test Street', 'Rabat', 34.020882, -6.841650, 'verified', now())
       RETURNING id`,
    );
    const doctor = await client.query(
      `INSERT INTO doctors (
         user_id, cabinet_id, display_name, specialty, verification_status
       )
       VALUES ($1, $2, 'Dr Integration', 'General medicine', 'verified')
       RETURNING id`,
      [doctorUser.rows[0].id, cabinet.rows[0].id],
    );
    const queueSession = await client.query(
      `INSERT INTO queue_sessions (
         doctor_id, cabinet_id, service_date, starts_at, ends_at, state,
         capacity, average_consultation_minutes, created_by
       )
       VALUES ($1, $2, current_date, '08:00', '12:00', 'open', $3, 12, $4)
       RETURNING id`,
      [doctor.rows[0].id, cabinet.rows[0].id, capacity, doctorUser.rows[0].id],
    );

    await client.query('COMMIT');

    return {
      requestPrefix,
      doctorUserId: doctorUser.rows[0].id,
      patientIds: [patientOne.rows[0].id, patientTwo.rows[0].id],
      cabinetId: cabinet.rows[0].id,
      doctorId: doctor.rows[0].id,
      queueSessionId: queueSession.rows[0].id,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function removeFixture(fixture) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM audit_events WHERE request_id LIKE $1', [
      `${fixture.requestPrefix}%`,
    ]);
    await client.query('DELETE FROM tickets WHERE queue_session_id = $1', [fixture.queueSessionId]);
    await client.query('DELETE FROM queue_sessions WHERE id = $1', [fixture.queueSessionId]);
    await client.query('DELETE FROM doctors WHERE id = $1', [fixture.doctorId]);
    await client.query('DELETE FROM cabinets WHERE id = $1', [fixture.cabinetId]);
    await client.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [
      [fixture.doctorUserId, ...fixture.patientIds],
    ]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

before(async () => {
  const result = await pool.query('SELECT current_database() AS database_name');
  const databaseName = result.rows[0].database_name;

  assert.match(
    databaseName,
    /_(test|validation)$/,
    `Integration tests refuse to mutate database "${databaseName}". Use a database ending in _test or _validation.`,
  );

  const migrations = await pool.query('SELECT filename FROM schema_migrations ORDER BY filename');
  assert.deepEqual(
    migrations.rows.map((row) => row.filename),
    ['001_core_schema.sql', '002_identity_and_sessions.sql', '003_public_doctor_search_indexes.sql'],
    'Run the database migrations before the integration suite.',
  );
});

after(async () => {
  await pool.end();
});

describe('PostgreSQL queue admission', () => {
  it('commits a ticket, increments numbering, and records its audit event', async () => {
    const fixture = await createFixture();

    try {
      const result = await joinQueue({
        pool,
        queueSessionId: fixture.queueSessionId,
        patientId: fixture.patientIds[0],
        actorUserId: fixture.patientIds[0],
        requestId: `${fixture.requestPrefix}-join`,
      });

      assert.equal(result.ticket.ticket_number, 1);
      assert.equal(result.position, 1);
      assert.equal(result.estimatedWaitMinutes, 0);

      const persisted = await pool.query(
        `SELECT qs.next_ticket_number, count(t.id)::int AS ticket_count
         FROM queue_sessions qs
         LEFT JOIN tickets t ON t.queue_session_id = qs.id
         WHERE qs.id = $1
         GROUP BY qs.id`,
        [fixture.queueSessionId],
      );
      assert.deepEqual(persisted.rows[0], { next_ticket_number: 2, ticket_count: 1 });

      const audit = await pool.query(
        `SELECT action, actor_user_id
         FROM audit_events
         WHERE request_id = $1`,
        [`${fixture.requestPrefix}-join`],
      );
      assert.equal(audit.rowCount, 1);
      assert.equal(audit.rows[0].action, 'ticket.created');
      assert.equal(audit.rows[0].actor_user_id, fixture.patientIds[0]);
    } finally {
      await removeFixture(fixture);
    }
  });

  it('serializes two patients competing for the final queue place', async () => {
    const fixture = await createFixture({ capacity: 1 });

    try {
      const attempts = fixture.patientIds.map((patientId, index) =>
        joinQueue({
          pool,
          queueSessionId: fixture.queueSessionId,
          patientId,
          actorUserId: patientId,
          requestId: `${fixture.requestPrefix}-race-${index}`,
        }),
      );
      const results = await Promise.allSettled(attempts);
      const fulfilled = results.filter((result) => result.status === 'fulfilled');
      const rejected = results.filter((result) => result.status === 'rejected');

      assert.equal(fulfilled.length, 1);
      assert.equal(rejected.length, 1);
      assert.ok(rejected[0].reason instanceof AppError);
      assert.equal(rejected[0].reason.code, 'queue_capacity_reached');

      const persisted = await pool.query(
        `SELECT count(*)::int AS ticket_count,
                min(ticket_number)::int AS first_number,
                max(ticket_number)::int AS last_number
         FROM tickets
         WHERE queue_session_id = $1`,
        [fixture.queueSessionId],
      );
      assert.deepEqual(persisted.rows[0], {
        ticket_count: 1,
        first_number: 1,
        last_number: 1,
      });
    } finally {
      await removeFixture(fixture);
    }
  });

  it('enforces one active ticket per patient at the database boundary', async () => {
    const fixture = await createFixture();

    try {
      await joinQueue({
        pool,
        queueSessionId: fixture.queueSessionId,
        patientId: fixture.patientIds[0],
        actorUserId: fixture.patientIds[0],
        requestId: `${fixture.requestPrefix}-first`,
      });

      await assert.rejects(
        pool.query(
          `INSERT INTO tickets (
             queue_session_id, patient_id, ticket_number, status, source, created_by
           )
           VALUES ($1, $2, 99, 'called', 'online', $2)`,
          [fixture.queueSessionId, fixture.patientIds[0]],
        ),
        (error) => error.code === '23505' && error.constraint === 'tickets_one_active_per_patient_session_idx',
      );
    } finally {
      await removeFixture(fixture);
    }
  });
});

describe('PostgreSQL public doctor search', () => {
  it('returns a verified doctor with live queue and distance data', async () => {
    const fixture = await createFixture();

    try {
      await joinQueue({
        pool,
        queueSessionId: fixture.queueSessionId,
        patientId: fixture.patientIds[0],
        actorUserId: fixture.patientIds[0],
        requestId: `${fixture.requestPrefix}-search-ticket`,
      });

      const results = await searchNearbyDoctors({
        pool,
        criteria: {
          serviceDate: new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit',
          }).format(new Date()),
          specialty: 'general MEDICINE',
          latitude: 34.020882,
          longitude: -6.84165,
          radiusMeters: 1_000,
          acceptingOnly: true,
          limit: 20,
          offset: 0,
        },
      });

      assert.equal(results.length, 1);
      assert.equal(results[0].id, fixture.doctorId);
      assert.equal(results[0].queueStatus, 'available');
      assert.equal(results[0].acceptingTickets, true);
      assert.deepEqual(results[0].estimatedWaitMinutes, { min: 12, max: 12 });
      assert.equal(results[0].distanceMeters, 0);
      assert.deepEqual(Object.keys(results[0]).sort(), [
        'acceptingTickets', 'cabinet', 'displayName', 'distanceMeters',
        'estimatedWaitMinutes', 'id', 'lastUpdatedAt', 'queueStatus', 'specialty',
      ]);
    } finally {
      await removeFixture(fixture);
    }
  });

  it('never exposes unverified doctors', async () => {
    const fixture = await createFixture();

    try {
      await pool.query("UPDATE doctors SET verification_status = 'pending' WHERE id = $1", [fixture.doctorId]);
      const results = await searchNearbyDoctors({
        pool,
        criteria: {
          serviceDate: new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit',
          }).format(new Date()),
          specialty: 'General medicine',
          city: 'Rabat',
          radiusMeters: 25_000,
          acceptingOnly: false,
          limit: 20,
          offset: 0,
        },
      });

      assert.deepEqual(results, []);
    } finally {
      await removeFixture(fixture);
    }
  });

  it('never exposes doctors whose user account is inactive', async () => {
    const fixture = await createFixture();

    try {
      await pool.query('UPDATE users SET is_active = false WHERE id = $1', [fixture.doctorUserId]);
      const results = await searchNearbyDoctors({
        pool,
        criteria: {
          serviceDate: new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit',
          }).format(new Date()),
          specialty: 'General medicine',
          city: 'Rabat',
          radiusMeters: 25_000,
          acceptingOnly: false,
          limit: 20,
          offset: 0,
        },
      });

      assert.deepEqual(results, []);
    } finally {
      await removeFixture(fixture);
    }
  });
});
