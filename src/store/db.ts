// Opens the SQLite file and brings its tables up to date.
// Migrations are numbered SQL strings: never edit an old one, only add a new one at the end.

import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';

export type Db = Database.Database;

export const MIGRATIONS: readonly string[] = [
  // 1: initial tables (ARCHITECTURE.md section 6).
  `
  CREATE TABLE user_settings (
    user_id    TEXT PRIMARY KEY,
    preset     TEXT,
    speed      REAL NOT NULL DEFAULT 1,
    pitch      REAL NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE guild_opt_in (
    guild_id   TEXT NOT NULL,
    user_id    TEXT NOT NULL,
    opted_in   INTEGER NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (guild_id, user_id)
  );
  CREATE TABLE guild_settings (
    guild_id        TEXT PRIMARY KEY,
    queue_mode      TEXT NOT NULL DEFAULT 'in-order',
    name_prefix     TEXT NOT NULL DEFAULT 'on-change',
    read_channel_id TEXT,
    max_chars       INTEGER NOT NULL DEFAULT 300
  );
  CREATE TABLE dictionary (
    guild_id TEXT NOT NULL,
    word     TEXT NOT NULL,
    spoken   TEXT NOT NULL,
    PRIMARY KEY (guild_id, word)
  );
  `,
  // 2: optional name to say before someone's messages, per server (/tts on name:...).
  `ALTER TABLE guild_opt_in ADD COLUMN spoken_name TEXT;`,
];

// path ':memory:' gives a throwaway database (tests).
export function openDb(path: string): Db {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  // WAL: readers don't block the writer, and a crash can't leave a half-written file.
  if (path !== ':memory:') db.pragma('journal_mode = WAL');
  migrate(db);
  return db;
}

export function migrate(db: Db): void {
  db.exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)');
  const row = db.prepare('SELECT version FROM schema_version').get() as { version: number } | undefined;
  if (row === undefined) db.prepare('INSERT INTO schema_version (version) VALUES (0)').run();
  const current = row?.version ?? 0;

  for (let v = current; v < MIGRATIONS.length; v++) {
    // Each migration and its version bump succeed or fail together.
    db.transaction(() => {
      db.exec(MIGRATIONS[v]!);
      db.prepare('UPDATE schema_version SET version = ?').run(v + 1);
    })();
  }
}
