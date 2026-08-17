CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE user_role AS ENUM ('patient', 'doctor', 'secretary', 'admin');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'verification_status') THEN
    CREATE TYPE verification_status AS ENUM ('pending', 'verified', 'rejected', 'suspended');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'queue_session_state') THEN
    CREATE TYPE queue_session_state AS ENUM ('draft', 'open', 'paused', 'closed', 'cancelled');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ticket_status') THEN
    CREATE TYPE ticket_status AS ENUM (
      'waiting',
      'called',
      'in_consultation',
      'completed',
      'absent',
      'cancelled_by_patient',
      'cancelled_by_staff'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ticket_source') THEN
    CREATE TYPE ticket_source AS ENUM ('online', 'walk_in', 'staff_created');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL CHECK (char_length(full_name) BETWEEN 2 AND 120),
  email text NOT NULL UNIQUE,
  phone text,
  password_hash text NOT NULL,
  role user_role NOT NULL DEFAULT 'patient',
  is_active boolean NOT NULL DEFAULT true,
  email_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cabinets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 160),
  address text NOT NULL,
  city text NOT NULL,
  neighborhood text,
  latitude numeric(9, 6) NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude numeric(9, 6) NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  verification_status verification_status NOT NULL DEFAULT 'pending',
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cabinets_city_idx ON cabinets (city);
CREATE INDEX IF NOT EXISTS cabinets_location_idx ON cabinets (latitude, longitude);

CREATE TABLE IF NOT EXISTS doctors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE RESTRICT,
  cabinet_id uuid NOT NULL REFERENCES cabinets(id) ON DELETE RESTRICT,
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 2 AND 160),
  specialty text NOT NULL CHECK (char_length(specialty) BETWEEN 2 AND 120),
  bio text,
  average_consultation_minutes integer NOT NULL DEFAULT 12 CHECK (average_consultation_minutes BETWEEN 3 AND 120),
  max_patients_per_session integer NOT NULL DEFAULT 25 CHECK (max_patients_per_session BETWEEN 1 AND 200),
  accepts_amo boolean NOT NULL DEFAULT false,
  accepts_cnops boolean NOT NULL DEFAULT false,
  verification_status verification_status NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS doctors_specialty_idx ON doctors (specialty);
CREATE INDEX IF NOT EXISTS doctors_cabinet_idx ON doctors (cabinet_id);

CREATE TABLE IF NOT EXISTS staff_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id uuid NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role user_role NOT NULL CHECK (role IN ('doctor', 'secretary')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (doctor_id, user_id)
);

CREATE TABLE IF NOT EXISTS queue_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id uuid NOT NULL REFERENCES doctors(id) ON DELETE RESTRICT,
  cabinet_id uuid NOT NULL REFERENCES cabinets(id) ON DELETE RESTRICT,
  service_date date NOT NULL,
  starts_at time NOT NULL,
  ends_at time NOT NULL,
  state queue_session_state NOT NULL DEFAULT 'draft',
  capacity integer NOT NULL CHECK (capacity BETWEEN 1 AND 200),
  next_ticket_number integer NOT NULL DEFAULT 1 CHECK (next_ticket_number >= 1),
  average_consultation_minutes integer NOT NULL CHECK (average_consultation_minutes BETWEEN 3 AND 120),
  last_status_update_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (starts_at < ends_at),
  UNIQUE (doctor_id, cabinet_id, service_date, starts_at, ends_at)
);

CREATE INDEX IF NOT EXISTS queue_sessions_search_idx ON queue_sessions (service_date, state);
CREATE INDEX IF NOT EXISTS queue_sessions_doctor_date_idx ON queue_sessions (doctor_id, service_date);

CREATE TABLE IF NOT EXISTS tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_session_id uuid NOT NULL REFERENCES queue_sessions(id) ON DELETE RESTRICT,
  patient_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  ticket_number integer NOT NULL CHECK (ticket_number >= 1),
  status ticket_status NOT NULL DEFAULT 'waiting',
  source ticket_source NOT NULL DEFAULT 'online',
  called_at timestamptz,
  consultation_started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (queue_session_id, ticket_number)
);

CREATE UNIQUE INDEX IF NOT EXISTS tickets_one_active_per_patient_session_idx
  ON tickets (queue_session_id, patient_id)
  WHERE status IN ('waiting', 'called', 'in_consultation');

CREATE INDEX IF NOT EXISTS tickets_queue_status_number_idx
  ON tickets (queue_session_id, status, ticket_number);

CREATE TABLE IF NOT EXISTS audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  entity_type text NOT NULL CHECK (char_length(entity_type) BETWEEN 2 AND 80),
  entity_id uuid NOT NULL,
  action text NOT NULL CHECK (char_length(action) BETWEEN 2 AND 120),
  old_value jsonb,
  new_value jsonb,
  reason text,
  request_id text,
  ip_address inet,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_events_entity_idx ON audit_events (entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_actor_idx ON audit_events (actor_user_id, created_at DESC);
