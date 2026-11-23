import { mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';

const schemaSql = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');

/** Opens (or creates) the SQLite database and applies the schema. Use ':memory:' in tests. */
export function createDatabase(databasePath: string): Database.Database {
  if (databasePath !== ':memory:') {
    mkdirSync(dirname(databasePath), { recursive: true });
  }

  const db = new Database(databasePath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(schemaSql);
  return db;
}
