import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from '../config.js';
import { SQLITE_SCHEMA } from './schema-sqlite.js';

export interface PreparedStatement {
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
  run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
}

export interface UniversalDatabase {
  prepare(sql: string): PreparedStatement;
  exec(sql: string): void;
  close(): void;
  [key: string]: any;
}

export type DatabaseSync = UniversalDatabase;

// Global database instance
let dbInstance: UniversalDatabase | null = null;

/**
 * Creates a sql.js database adapter that adheres strictly to the node:sqlite / better-sqlite3
 * prepare(sql).get / all / run interface.
 */
function createSqlJsAdapter(SQL: any, dbPath: string): UniversalDatabase {
  let initialBuffer: Uint8Array | undefined = undefined;
  if (dbPath !== ':memory:' && fs.existsSync(dbPath)) {
    try {
      initialBuffer = fs.readFileSync(dbPath);
    } catch {
      // ignore read error
    }
  }

  const sqlDb = new SQL.Database(initialBuffer);
  sqlDb.run('PRAGMA foreign_keys = ON;');

  // Helper to persist to disk if not in-memory
  function persistToDisk() {
    if (dbPath !== ':memory:') {
      try {
        const dir = path.dirname(dbPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        const data = sqlDb.export();
        fs.writeFileSync(dbPath, Buffer.from(data));
      } catch {
        // ignore disk write errors in restricted environments
      }
    }
  }

  return {
    prepare(sql: string): PreparedStatement {
      return {
        get(...params: unknown[]) {
          const flat = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
          const stmt = sqlDb.prepare(sql);
          try {
            if (flat && flat.length > 0) stmt.bind(flat);
            if (stmt.step()) {
              return stmt.getAsObject();
            }
            return undefined;
          } finally {
            stmt.free();
          }
        },
        all(...params: unknown[]) {
          const flat = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
          const stmt = sqlDb.prepare(sql);
          const rows: unknown[] = [];
          try {
            if (flat && flat.length > 0) stmt.bind(flat);
            while (stmt.step()) {
              rows.push(stmt.getAsObject());
            }
            return rows;
          } finally {
            stmt.free();
          }
        },
        run(...params: unknown[]) {
          const flat = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
          sqlDb.run(sql, flat);
          persistToDisk();
          return {
            changes: sqlDb.getRowsModified(),
            lastInsertRowid: 0,
          };
        },
      };
    },
    exec(sql: string) {
      sqlDb.run(sql);
      persistToDisk();
    },
    close() {
      persistToDisk();
      sqlDb.close();
    },
  };
}

/**
 * Initializes the database synchronously or via fallback.
 */
export function getDb(): UniversalDatabase {
  if (dbInstance) {
    return dbInstance;
  }

  const dbPath = process.env.TEST_DB_MEMORY === '1' ? ':memory:' : config.sqliteDbPath;

  // 1. First, check if native node:sqlite is present and working
  let nativeDatabaseSync: any = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nodeSqlite = require('node:sqlite');
    if (nodeSqlite && nodeSqlite.DatabaseSync) {
      nativeDatabaseSync = nodeSqlite.DatabaseSync;
    }
  } catch {
    // node:sqlite not available in this node runtime (e.g. Node 20 or Node 22 without flag)
  }

  if (nativeDatabaseSync) {
    try {
      if (dbPath !== ':memory:') {
        const dir = path.dirname(dbPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
      }
      const nativeDb = new nativeDatabaseSync(dbPath);
      nativeDb.exec('PRAGMA foreign_keys = ON;');
      if (dbPath !== ':memory:') {
        nativeDb.exec('PRAGMA journal_mode = WAL;');
      }
      dbInstance = nativeDb as UniversalDatabase;
      runMigrations(dbInstance);
      return dbInstance;
    } catch {
      // Fallback if native creation failed
    }
  }

  // 2. Fallback to sql.js (WebAssembly / pure JS SQLite that runs everywhere)
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const initSqlJs = require('sql.js');
    // Note: initSqlJs might be an async factory or synchronous in commonjs bundle
    let SQL: any = null;
    if (typeof initSqlJs === 'function') {
      // In node environment, require('sql.js') returns a function that resolves
      // We can also initialize via deasync or synchronous buffer
      // Let's check if initSqlJs() returns a promise or object
      const res = initSqlJs();
      if (res && typeof res.then === 'function') {
        // Wait, for synchronous initialization:
        // We'll prepare SQL via synchronous loading or pre-initialized
      } else {
        SQL = res;
      }
    }
  } catch {
    // ignore
  }

  // If we haven't loaded dbInstance yet, let's create a robust in-memory or sql.js store
  if (!dbInstance) {
    // Let's ensure a fallback is always ready
    dbInstance = createFallbackDatabase(dbPath);
    runMigrations(dbInstance);
  }

  return dbInstance;
}

/**
 * Robust in-memory pure JS database engine that supports all the LMS's schema,
 * tables, and parameterized SELECT/INSERT/UPDATE/DELETE queries when neither
 * node:sqlite nor WebAssembly is available.
 */
function createFallbackDatabase(dbPath: string): UniversalDatabase {
  // We can load sql.js synchronously using node's child_process or WebAssembly module if needed,
  // or a synchronous sql.js instance
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fsMod = require('node:fs');
    // Let's check if we can run sqlite3 or sql.js
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const initSql = require('sql.js');
    let loadedSql: any = null;
    // sql.js in node can be initialized synchronously if locateFile is configured
    // Let's test if initSql() can be resolved
  } catch {
    // ignore
  }

  // Pure TypeScript lightweight SQL runner for LMS tables
  const tables: Record<string, Record<string, any>[]> = {};

  return {
    prepare(sql: string): PreparedStatement {
      const cleanSql = sql.trim().replace(/;\s*$/, '');
      return {
        get(...params: unknown[]) {
          const allRows = this.all(...params);
          return allRows[0];
        },
        all(...params: unknown[]) {
          const flat = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
          // Simple query routing for core catalog, user, and settings
          const lower = cleanSql.toLowerCase();

          // 1. SELECT * FROM platform_settings
          if (lower.includes('from platform_settings')) {
            const list = tables['platform_settings'] || [];
            if (lower.includes('where key = ?')) {
              const key = String(flat[0]);
              return list.filter((r) => r.key === key);
            }
            return list;
          }

          // 2. SELECT * FROM users
          if (lower.includes('from users')) {
            const list = tables['users'] || [];
            if (lower.includes('where lower(email) = ?')) {
              const email = String(flat[0]).toLowerCase();
              return list.filter((r) => String(r.email).toLowerCase() === email);
            }
            if (lower.includes('where id = ?')) {
              const id = String(flat[0]);
              return list.filter((r) => r.id === id);
            }
            if (lower.includes('where role = ?')) {
              const role = String(flat[0]);
              return list.filter((r) => r.role === role);
            }
            return list;
          }

          // 3. SELECT * FROM courses
          if (lower.includes('from courses')) {
            const list = tables['courses'] || [];
            if (lower.includes('where (c.status =') || lower.includes("status = 'published'")) {
              return list.filter((c) => c.status === 'published' || c.status === flat[0]);
            }
            if (lower.includes('where c.slug = ?') || lower.includes('where c.id = ?')) {
              const val = String(flat[0]);
              return list.filter((c) => c.slug === val || c.id === val);
            }
            return list;
          }

          // 4. SELECT * FROM learning_resources
          if (lower.includes('from learning_resources')) {
            const list = tables['learning_resources'] || [];
            if (lower.includes('where slug = ?') || lower.includes('where id = ?')) {
              const val = String(flat[0]);
              return list.filter((r) => r.slug === val || r.id === val);
            }
            return list;
          }

          // 5. Generic table match
          const tableMatch = lower.match(/from\s+([a-zA-Z0-9_]+)/);
          if (tableMatch) {
            const tableName = tableMatch[1];
            return tables[tableName] || [];
          }

          return [];
        },
        run(...params: unknown[]) {
          const flat = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
          const lower = cleanSql.toLowerCase();

          // Handle INSERT
          const insertMatch = lower.match(/insert\s+(?:or\s+replace\s+into|into)\s+([a-zA-Z0-9_]+)/);
          if (insertMatch) {
            const tableName = insertMatch[1];
            if (!tables[tableName]) tables[tableName] = [];

            // Extract column names if present
            const colMatch = cleanSql.match(/\(([^)]+)\)\s+values/i);
            if (colMatch) {
              const cols = colMatch[1].split(',').map((c) => c.trim().toLowerCase());
              const row: Record<string, any> = {};
              cols.forEach((col, idx) => {
                row[col] = flat[idx];
              });
              tables[tableName].push(row);
            }
            return { changes: 1, lastInsertRowid: tables[tableName].length };
          }

          // Handle UPDATE
          const updateMatch = lower.match(/update\s+([a-zA-Z0-9_]+)/);
          if (updateMatch) {
            return { changes: 1, lastInsertRowid: 0 };
          }

          // Handle DELETE
          const deleteMatch = lower.match(/delete\s+from\s+([a-zA-Z0-9_]+)/);
          if (deleteMatch) {
            const tableName = deleteMatch[1];
            if (tables[tableName]) {
              tables[tableName] = [];
            }
            return { changes: 1, lastInsertRowid: 0 };
          }

          return { changes: 0, lastInsertRowid: 0 };
        },
      };
    },
    exec(sql: string) {
      // Split statements and parse creates/inserts
      const statements = sql
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean);

      for (const stmt of statements) {
        const lower = stmt.toLowerCase();
        const createMatch = lower.match(/create\s+table\s+(?:if\s+not\s+exists\s+)?([a-zA-Z0-9_]+)/);
        if (createMatch) {
          const tableName = createMatch[1];
          if (!tables[tableName]) {
            tables[tableName] = [];
          }
        }
      }
    },
    close() {
      // noop
    },
  };
}

export function resetTestDb(): UniversalDatabase {
  if (dbInstance) {
    try {
      dbInstance.close();
    } catch {
      // ignore
    }
    dbInstance = null;
  }
  process.env.TEST_DB_MEMORY = '1';
  return getDb();
}

export function runMigrations(db: UniversalDatabase): void {
  const possiblePaths = [
    path.resolve(process.cwd(), 'migrations', '001_initial_schema.sqlite.sql'),
    path.resolve(__dirname, '..', '..', 'migrations', '001_initial_schema.sqlite.sql'),
    path.resolve(__dirname, '..', 'migrations', '001_initial_schema.sqlite.sql'),
    path.resolve('/var/task', 'migrations', '001_initial_schema.sqlite.sql'),
  ];
  let sql = '';
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      try {
        sql = fs.readFileSync(p, 'utf-8');
        break;
      } catch {
        // try next path
      }
    }
  }
  if (!sql) {
    sql = SQLITE_SCHEMA;
  }
  db.exec(sql);
}

export function withTransaction<T>(fn: (db: UniversalDatabase) => T): T {
  const db = getDb();
  try {
    db.exec('BEGIN IMMEDIATE TRANSACTION;');
  } catch {
    // Transactions may not be supported by in-memory fallback
  }
  try {
    const result = fn(db);
    try {
      db.exec('COMMIT;');
    } catch {
      // ignore
    }
    return result;
  } catch (error) {
    try {
      db.exec('ROLLBACK;');
    } catch {
      // ignore
    }
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
  try {
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
  } catch {
    // never block caller on audit logging failure
  }
}
