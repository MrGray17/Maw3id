import pg from 'pg';

const { Pool } = pg;

export function createPgPool(env = process.env) {
  return new Pool({
    connectionString: env.DATABASE_URL,
    user: env.POSTGRES_USER,
    host: env.POSTGRES_HOST,
    database: env.POSTGRES_DB,
    password: env.POSTGRES_PASSWORD,
    port: env.POSTGRES_PORT ? Number(env.POSTGRES_PORT) : undefined,
    max: env.POSTGRES_POOL_MAX ? Number(env.POSTGRES_POOL_MAX) : 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
}

export const pool = createPgPool();
