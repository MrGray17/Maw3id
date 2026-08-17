CREATE EXTENSION IF NOT EXISTS citext;

ALTER TABLE users
  RENAME COLUMN phone TO phone_e164;

ALTER TABLE users
  ALTER COLUMN email DROP NOT NULL,
  ALTER COLUMN email TYPE citext USING lower(email),
  ALTER COLUMN password_hash DROP NOT NULL,
  ADD COLUMN phone_verified_at timestamptz,
  ADD COLUMN deleted_at timestamptz,
  ADD CONSTRAINT users_phone_e164_format_check
    CHECK (phone_e164 IS NULL OR phone_e164 ~ '^[+][1-9][0-9]{7,14}$'),
  ADD CONSTRAINT users_login_identifier_check
    CHECK (email IS NOT NULL OR phone_e164 IS NOT NULL);

CREATE UNIQUE INDEX users_phone_e164_unique_idx
  ON users (phone_e164)
  WHERE phone_e164 IS NOT NULL;

CREATE TABLE user_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('phone', 'google', 'password', 'passkey')),
  provider_subject text NOT NULL CHECK (char_length(provider_subject) BETWEEN 1 AND 512),
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_subject),
  UNIQUE (user_id, provider, provider_subject)
);

CREATE INDEX user_identities_user_idx ON user_identities (user_id);

CREATE TABLE auth_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash bytea NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
  csrf_token_hash bytea NOT NULL CHECK (octet_length(csrf_token_hash) = 32),
  authentication_methods text[] NOT NULL,
  assurance_level smallint NOT NULL DEFAULT 1 CHECK (assurance_level BETWEEN 1 AND 3),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  idle_expires_at timestamptz NOT NULL,
  absolute_expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revocation_reason text CHECK (revocation_reason IS NULL OR char_length(revocation_reason) <= 160),
  user_agent_hash bytea CHECK (user_agent_hash IS NULL OR octet_length(user_agent_hash) = 32),
  ip_prefix_hash bytea CHECK (ip_prefix_hash IS NULL OR octet_length(ip_prefix_hash) = 32),
  CHECK (idle_expires_at <= absolute_expires_at),
  CHECK (absolute_expires_at > created_at),
  CHECK (
    cardinality(authentication_methods) > 0
    AND authentication_methods <@ ARRAY['phone_otp', 'google_oidc', 'password', 'passkey', 'totp']::text[]
  ),
  CHECK ((revoked_at IS NULL AND revocation_reason IS NULL) OR revoked_at IS NOT NULL)
);

CREATE INDEX auth_sessions_active_user_idx
  ON auth_sessions (user_id, absolute_expires_at DESC)
  WHERE revoked_at IS NULL;
