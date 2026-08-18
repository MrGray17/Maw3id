CREATE INDEX IF NOT EXISTS phone_otp_challenges_created_idx
  ON phone_otp_challenges (created_at DESC);
