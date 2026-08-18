const DEFAULT_ALLOWED_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173'];

function parseOrigins(value) {
  const origins = (value ? value.split(',') : DEFAULT_ALLOWED_ORIGINS)
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (origins.length === 0) {
    throw new Error('At least one CORS origin is required.');
  }

  return origins.map((origin) => {
    let parsed;

    try {
      parsed = new URL(origin);
    } catch {
      throw new Error(`Invalid CORS origin: ${origin}`);
    }

    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin) {
      throw new Error(`CORS origin must contain only scheme and authority: ${origin}`);
    }

    return parsed.origin;
  });
}

function positiveInteger(value, fallback, name) {
  const parsed = Number(value ?? fallback);

  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return parsed;
}

function portNumber(value) {
  const port = Number(value ?? 3000);

  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }

  return port;
}

export function loadConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV || 'development';
  const sessionIdleTtlSeconds = positiveInteger(
    env.SESSION_IDLE_TTL_SECONDS,
    30 * 60,
    'SESSION_IDLE_TTL_SECONDS',
  );
  const sessionAbsoluteTtlSeconds = positiveInteger(
    env.SESSION_ABSOLUTE_TTL_SECONDS,
    7 * 24 * 60 * 60,
    'SESSION_ABSOLUTE_TTL_SECONDS',
  );

  if (sessionIdleTtlSeconds > sessionAbsoluteTtlSeconds) {
    throw new Error('Session idle TTL cannot exceed the absolute TTL.');
  }

  return {
    env: nodeEnv,
    isProduction: nodeEnv === 'production',
    port: portNumber(env.PORT),
    serviceName: env.SERVICE_NAME || 'maw3id-api',
    allowedOrigins: parseOrigins(env.CORS_ALLOWED_ORIGINS),
    databaseUrl: env.DATABASE_URL || null,
    sessionCookieName: env.SESSION_COOKIE_NAME || 'maw3id_session',
    sessionIdleTtlSeconds,
    sessionAbsoluteTtlSeconds,
    otpHashPepper: env.OTP_HASH_PEPPER || (nodeEnv === 'production' ? null : 'development-only-otp-pepper'),
    otpDeliveryMode: env.OTP_DELIVERY_MODE || (nodeEnv === 'production' ? 'http' : 'development'),
    otpProviderUrl: env.OTP_PROVIDER_URL || null,
    otpProviderToken: env.OTP_PROVIDER_TOKEN || null,
  };
}

export function assertProductionConfig(config = loadConfig()) {
  if (!config.isProduction) {
    return;
  }

  if (!config.databaseUrl) {
    throw new Error('Production requires DATABASE_URL.');
  }

  let databaseUrl;

  try {
    databaseUrl = new URL(config.databaseUrl);
  } catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL URL.');
  }

  if (!['postgres:', 'postgresql:'].includes(databaseUrl.protocol)) {
    throw new Error('DATABASE_URL must use the PostgreSQL protocol.');
  }

  if (config.allowedOrigins.some((origin) => new URL(origin).protocol !== 'https:')) {
    throw new Error('Production CORS origins must use HTTPS.');
  }

  if (
    config.allowedOrigins.some((origin) => {
      const hostname = new URL(origin).hostname;
      return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
    })
  ) {
    throw new Error('Production CORS origins must not use loopback hosts.');
  }

  if (!config.sessionCookieName.startsWith('__Host-')) {
    throw new Error('Production session cookies must use the __Host- prefix.');
  }

  if (!config.otpHashPepper || config.otpHashPepper.length < 32) {
    throw new Error('Production requires an OTP_HASH_PEPPER of at least 32 characters.');
  }

  if (config.otpDeliveryMode !== 'http' || !config.otpProviderUrl || !config.otpProviderToken) {
    throw new Error('Production requires the HTTP OTP provider URL and token.');
  }

  let otpProviderUrl;
  try {
    otpProviderUrl = new URL(config.otpProviderUrl);
  } catch {
    throw new Error('OTP_PROVIDER_URL must be a valid HTTPS URL.');
  }
  if (otpProviderUrl.protocol !== 'https:') {
    throw new Error('OTP_PROVIDER_URL must be a valid HTTPS URL.');
  }
}
