CREATE TABLE phone_otp_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_e164 text NOT NULL CHECK (phone_e164 ~ '^[+]212[5-7][0-9]{8}$'),
  code_hash bytea NOT NULL CHECK (octet_length(code_hash) = 32),
  request_ip_hash bytea NOT NULL CHECK (octet_length(request_ip_hash) = 32),
  attempt_count smallint NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 5),
  expires_at timestamptz NOT NULL,
  resend_available_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at),
  CHECK (resend_available_at > created_at)
);

CREATE INDEX phone_otp_challenges_phone_created_idx
  ON phone_otp_challenges (phone_e164, created_at DESC);

CREATE INDEX phone_otp_challenges_ip_created_idx
  ON phone_otp_challenges (request_ip_hash, created_at DESC);

CREATE INDEX phone_otp_challenges_expiry_idx
  ON phone_otp_challenges (expires_at)
  WHERE consumed_at IS NULL;
