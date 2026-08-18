const ACTIVE_TICKET_STATUSES = ['waiting', 'called', 'in_consultation'];
const QUEUE_FRESHNESS_MINUTES = 15;

function queueProjection(row) {
  if (!row.queue_session_id) {
    return { queueStatus: 'closed', estimatedWaitMinutes: null, acceptingTickets: false };
  }

  const lastUpdatedAt = new Date(row.last_updated_at);
  const isFresh = Date.now() - lastUpdatedAt.getTime() <= QUEUE_FRESHNESS_MINUTES * 60_000;

  if (!isFresh) {
    return { queueStatus: 'unknown', estimatedWaitMinutes: null, acceptingTickets: false };
  }

  if (row.queue_state === 'paused') {
    return { queueStatus: 'paused', estimatedWaitMinutes: null, acceptingTickets: false };
  }

  if (row.queue_state !== 'open') {
    return { queueStatus: 'closed', estimatedWaitMinutes: null, acceptingTickets: false };
  }

  const activeCount = Number(row.active_ticket_count);
  const capacity = Number(row.capacity);
  const wait = activeCount * Number(row.average_consultation_minutes);

  if (activeCount >= capacity) {
    return {
      queueStatus: 'full',
      estimatedWaitMinutes: { min: wait, max: wait },
      acceptingTickets: false,
    };
  }

  const queueStatus = wait <= 30 ? 'available' : wait <= 60 ? 'moderate' : 'busy';
  return {
    queueStatus,
    estimatedWaitMinutes: { min: wait, max: wait },
    acceptingTickets: true,
  };
}

function mapDoctor(row) {
  const queue = queueProjection(row);

  return {
    id: row.doctor_id,
    displayName: row.display_name,
    specialty: row.specialty,
    cabinet: {
      id: row.cabinet_id,
      name: row.cabinet_name,
      address: row.address,
      city: row.city,
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
    },
    ...queue,
    distanceMeters: row.distance_meters === null ? null : Math.round(Number(row.distance_meters)),
    lastUpdatedAt: new Date(row.last_updated_at).toISOString(),
  };
}

export async function searchNearbyDoctors({ pool, criteria }) {
  const hasCoordinates = criteria.latitude !== undefined;
  const distanceExpression = `6371000 * 2 * asin(least(1.0, sqrt(
    power(sin(radians(c.latitude - $3) / 2), 2) +
    cos(radians($3)) * cos(radians(c.latitude)) *
    power(sin(radians(c.longitude - $4) / 2), 2)
  )))`;

  const result = await pool.query(
    `
      SELECT
        d.id AS doctor_id,
        d.display_name,
        d.specialty,
        c.id AS cabinet_id,
        c.name AS cabinet_name,
        c.address,
        c.city,
        c.latitude,
        c.longitude,
        q.id AS queue_session_id,
        q.state AS queue_state,
        q.capacity,
        q.average_consultation_minutes,
        q.last_status_update_at,
        coalesce(t.active_ticket_count, 0)::int AS active_ticket_count,
        coalesce(q.last_status_update_at, c.updated_at) AS last_updated_at,
        ${distanceExpression} AS distance_meters
      FROM doctors d
      JOIN users doctor_user ON doctor_user.id = d.user_id
      JOIN cabinets c ON c.id = d.cabinet_id
      LEFT JOIN LATERAL (
        SELECT qs.*
        FROM queue_sessions qs
        WHERE qs.doctor_id = d.id
          AND qs.cabinet_id = c.id
          AND qs.service_date = $1
        ORDER BY
          CASE qs.state WHEN 'open' THEN 0 WHEN 'paused' THEN 1 ELSE 2 END,
          qs.starts_at DESC
        LIMIT 1
      ) q ON true
      LEFT JOIN LATERAL (
        SELECT count(*)::int AS active_ticket_count
        FROM tickets ticket
        WHERE ticket.queue_session_id = q.id
          AND ticket.status = ANY($2::ticket_status[])
      ) t ON true
      WHERE d.verification_status = 'verified'
        AND c.verification_status = 'verified'
        AND doctor_user.is_active = true
        AND doctor_user.deleted_at IS NULL
        AND lower(d.specialty) = lower($5)
        AND ($6::text IS NULL OR lower(c.city) = lower($6))
        AND ($7::double precision IS NULL OR ${distanceExpression} <= $7)
        AND (
          NOT $10::boolean
          OR (
            q.state = 'open'
            AND q.last_status_update_at >= now() - interval '${QUEUE_FRESHNESS_MINUTES} minutes'
            AND coalesce(t.active_ticket_count, 0) < q.capacity
          )
        )
      ORDER BY distance_meters ASC NULLS LAST, d.display_name ASC
      LIMIT $8 OFFSET $9
    `,
    [
      criteria.serviceDate,
      ACTIVE_TICKET_STATUSES,
      criteria.latitude ?? null,
      criteria.longitude ?? null,
      criteria.specialty,
      criteria.city ?? null,
      hasCoordinates ? criteria.radiusMeters : null,
      criteria.limit,
      criteria.offset,
      criteria.acceptingOnly,
    ],
  );

  return result.rows.map(mapDoctor);
}
