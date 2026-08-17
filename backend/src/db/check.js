import { pool } from './pool.js';

try {
  const result = await pool.query('SELECT now() AS now, current_database() AS database_name');
  const row = result.rows[0];

  console.log(
    JSON.stringify({
      status: 'ok',
      database: row.database_name,
      timestamp: row.now,
    }),
  );
} finally {
  await pool.end();
}
