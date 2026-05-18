import fs from 'fs';
import path from 'path';
import { pool } from './db.js';

async function main() {
  const dir = path.join(__dirname, 'migrations');
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  if (files.length === 0) {
    console.log('No migration files found.');
    await pool.end();
    return;
  }
  for (const file of files) {
    const sql = fs.readFileSync(path.join(dir, file), 'utf-8');
    console.log(`Running migration: ${file}`);
    await pool.query(sql);
  }
  console.log('All migrations complete.');
  await pool.end();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
