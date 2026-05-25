import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';

const DB_PATH = process.env.XFLIP_DB_PATH ?? 'data/xflip.db';

mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    username   TEXT NOT NULL UNIQUE,
    pw_hash    TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS collection (
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    gid        TEXT NOT NULL,
    count      INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, gid)
  );

  CREATE TABLE IF NOT EXISTS pack_opens (
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    pack       TEXT NOT NULL,
    count      INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, pack)
  );
`);

export interface UserRow {
  id: number;
  username: string;
  pw_hash: string;
  created_at: number;
}

const stmtInsertUser = db.prepare<[string, string, number]>(
  'INSERT INTO users (username, pw_hash, created_at) VALUES (?, ?, ?)',
);
const stmtUserByName = db.prepare<[string]>('SELECT * FROM users WHERE username = ?');
const stmtUserById = db.prepare<[number]>('SELECT * FROM users WHERE id = ?');
const stmtCollection = db.prepare<[number]>('SELECT gid, count FROM collection WHERE user_id = ?');
const stmtUpsertCard = db.prepare<[number, string, number]>(`
  INSERT INTO collection (user_id, gid, count, updated_at)
  VALUES (?, ?, 1, ?)
  ON CONFLICT(user_id, gid) DO UPDATE SET count = count + 1, updated_at = excluded.updated_at
`);
const stmtOpens = db.prepare<[number]>('SELECT pack, count FROM pack_opens WHERE user_id = ?');
const stmtIncOpen = db.prepare<[number, string, number]>(`
  INSERT INTO pack_opens (user_id, pack, count, updated_at)
  VALUES (?, ?, 1, ?)
  ON CONFLICT(user_id, pack) DO UPDATE SET count = count + 1, updated_at = excluded.updated_at
`);

export function createUser(username: string, pwHash: string): UserRow {
  const info = stmtInsertUser.run(username, pwHash, Date.now());
  return stmtUserById.get(info.lastInsertRowid as number) as UserRow;
}

export function findUserByName(username: string): UserRow | undefined {
  return stmtUserByName.get(username) as UserRow | undefined;
}

export function findUserById(id: number): UserRow | undefined {
  return stmtUserById.get(id) as UserRow | undefined;
}

export function getCollection(userId: number): Record<string, number> {
  const rows = stmtCollection.all(userId) as { gid: string; count: number }[];
  const out: Record<string, number> = {};
  for (const r of rows) out[r.gid] = r.count;
  return out;
}

const addMany = db.transaction((userId: number, gids: string[]) => {
  const now = Date.now();
  for (const gid of gids) stmtUpsertCard.run(userId, gid, now);
});

export function addCards(userId: number, gids: string[]): Record<string, number> {
  addMany(userId, gids);
  return getCollection(userId);
}

export function getOpens(userId: number): Record<string, number> {
  const rows = stmtOpens.all(userId) as { pack: string; count: number }[];
  const out: Record<string, number> = {};
  for (const r of rows) out[r.pack] = r.count;
  return out;
}

export function recordOpen(userId: number, pack: string): Record<string, number> {
  stmtIncOpen.run(userId, pack, Date.now());
  return getOpens(userId);
}
