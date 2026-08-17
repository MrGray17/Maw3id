const DEFAULT_ALLOWED_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173'];

function required(name) {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function parseOrigins(value) {
  if (!value) {
    return DEFAULT_ALLOWED_ORIGINS;
  }

  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function loadConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV || 'development';

  return {
    env: nodeEnv,
    isProduction: nodeEnv === 'production',
    port: Number(env.PORT || 3000),
    serviceName: env.SERVICE_NAME || 'maw3id-api',
    allowedOrigins: parseOrigins(env.CORS_ALLOWED_ORIGINS),
    databaseUrl: env.DATABASE_URL || null,
  };
}

export function assertProductionConfig(config = loadConfig()) {
  if (!config.isProduction) {
    return;
  }

  required('DATABASE_URL');

  if (config.allowedOrigins.some((origin) => origin.includes('localhost'))) {
    throw new Error('Production CORS origins must not include localhost.');
  }
}
