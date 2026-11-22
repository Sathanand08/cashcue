import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

declare global {
  // eslint-disable-next-line no-var
  var __cashcueDb: DatabaseSync | undefined;
}

function resolveDbPath(): string {
  const configured = process.env.CASHCUE_DB_PATH ?? "data/cashcue.db";
  return path.resolve(process.cwd(), configured);
}

function openDatabase(): DatabaseSync {
  const dbPath = resolveDbPath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA journal_mode = WAL;");

  const schemaSql = fs.readFileSync(
    path.join(process.cwd(), "lib/db/schema.sql"),
    "utf8",
  );
  db.exec(schemaSql);

  return db;
}

/**
 * Returns the process-wide SQLite connection, opening it (and applying the
 * idempotent schema) on first use. Cached on globalThis so that hot reloads
 * in development do not open extra connections.
 */
export function getDb(): DatabaseSync {
  if (!globalThis.__cashcueDb) {
    globalThis.__cashcueDb = openDatabase();
  }
  return globalThis.__cashcueDb;
}

/**
 * Runs fn inside BEGIN IMMEDIATE ... COMMIT. Rolls back and rethrows if fn throws.
 */
export function withTransaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
