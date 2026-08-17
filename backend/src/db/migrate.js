import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { pool } from './pool.js';

const currentFile = fileURLToPath(import.meta.url);
const backendRoot = path.resolve(path.dirname(currentFile), '..', '..');
const migrationsDir = path.join(backendRoot, 'db', 'migrations');

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `);
}

async function listMigrationFiles() {
  const entries = await fs.readdir(migrationsDir, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => entry.name)
    .sort();
}

async function hasMigrationBeenApplied(client, filename) {
  const result = await client.query('SELECT 1 FROM schema_migrations WHERE filename = $1', [filename]);
  return result.rowCount > 0;
}

async function runMigration(client, filename) {
  const fullPath = path.join(migrationsDir, filename);
  const sql = await fs.readFile(fullPath, 'utf8');

  await client.query('BEGIN');
  await client.query(sql);
  await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [filename]);
  await client.query('COMMIT');
}

const client = await pool.connect();

try {
  await ensureMigrationsTable(client);

  const files = await listMigrationFiles();
  const applied = [];
  const skipped = [];

  for (const filename of files) {
    if (await hasMigrationBeenApplied(client, filename)) {
      skipped.push(filename);
      continue;
    }

    try {
      await runMigration(client, filename);
      applied.push(filename);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }

  console.log(
    JSON.stringify({
      status: 'ok',
      applied,
      skipped,
    }),
  );
} finally {
  client.release();
  await pool.end();
}
