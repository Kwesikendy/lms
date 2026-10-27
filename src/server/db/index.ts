import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from '../config.js';

let dbInstance: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (!dbInstance) {
    const dbPath = process.env.TEST_DB_MEMORY === '1' ? ':memory:' : config.sqliteDbPath;
    if (dbPath !== ':memory:') {
      const dir = path.dirname(dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
    dbInstance = new DatabaseSync(dbPath);
    dbInstance.exec('PRAGMA foreign_keys = ON;');
    if (dbPath !== ':memory:') {
      dbInstance.exec('PRAGMA journal_mode = WAL;');
    }
    runMigrations(dbInstance);
  }
  return dbInstance;
}

export function resetTestDb(): DatabaseSync {
  if (dbInstance) {
    try {
      dbInstance.close();
    } catch {
      // ignore close errors
    }
    dbInstance = null;
  }
  process.env.TEST_DB_MEMORY = '1';
  return getDb();
}

export function runMigrations(db: DatabaseSync): void {
  const migrationPath = path.resolve(
    process.cwd(),
    'migrations',
    '001_initial_schema.sqlite.sql'
  );
  const sql = fs.readFileSync(migrationPath, 'utf-8');
  db.exec(sql);
}

/**
 * Runs a callback inside an atomic SQLite ACID transaction.
 */
export function withTransaction<T>(fn: (db: DatabaseSync) => T): T {
  const db = getDb();
  db.exec('BEGIN IMMEDIATE TRANSACTION;');
  try {
    const result = fn(db);
    db.exec('COMMIT;');
    return result;
  } catch (error) {
    db.exec('ROLLBACK;');
    throw error;
  }
}

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function writeAuditLog(params: {
  actorId?: string | null;
  actorRole?: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
}): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO audit_logs (id, actor_id, actor_role, action, target_type, target_id, metadata, ip_address, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    newId('aud'),
    params.actorId ?? null,
    params.actorRole ?? null,
    params.action,
    params.targetType,
    params.targetId ?? null,
    params.metadata ? JSON.stringify(params.metadata) : null,
    params.ipAddress ?? null,
    nowIso()
  );
}
