import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Must run before any lib/db/* module is loaded: the DB client reads this path on first use.
// One unique temp DB per test file (node --test runs each file in its own process).
const TMP_DB = path.join(os.tmpdir(), `cashcue-seed-test-${process.pid}-${Date.now()}.db`);
process.env.CASHCUE_DB_PATH = TMP_DB;

type Db = import("node:sqlite").DatabaseSync;
type SeedModule = typeof import("../lib/db/seed");

let db: Db;
let seed: SeedModule;

before(async () => {
  const client = await import("../lib/db/client");
  seed = await import("../lib/db/seed");
  db = client.getDb();
});

after(() => {
  try {
    db?.close();
  } catch {
    // ignore
  }
  for (const f of [TMP_DB, `${TMP_DB}-wal`, `${TMP_DB}-shm`]) {
    try {
      fs.rmSync(f, { force: true });
    } catch {
      // ignore: file may still be locked on Windows
    }
  }
});

function countInvoices(workspaceId: string): number {
  return (
    db.prepare("SELECT COUNT(*) AS n FROM invoices WHERE workspace_id = ?").get(workspaceId) as { n: number }
  ).n;
}

test("fresh seed: INV-007 has issue_date 2026-11-20 and due_date 2027-01-05", () => {
  const ws = seed.seedDemoWorkspace(db);

  const row = db
    .prepare("SELECT issue_date, due_date, workflow_status FROM invoices WHERE invoice_number = 'INV-007' AND workspace_id = ?")
    .get(ws) as { issue_date: string; due_date: string; workflow_status: string } | undefined;
  assert.ok(row);
  assert.equal(row.issue_date, "2026-11-20");
  assert.equal(row.due_date, "2027-01-05");
  assert.equal(row.workflow_status, "sent");

  const late = db
    .prepare("SELECT COUNT(*) AS n FROM invoices WHERE workspace_id = ? AND issue_date > '2026-11-21'")
    .get(ws) as { n: number };
  assert.equal(late.n, 0);
});

test("seed is idempotent: second call returns the same workspace id and invoice count", () => {
  const ws1 = seed.seedDemoWorkspace(db);
  const count1 = countInvoices(ws1);

  const ws2 = seed.seedDemoWorkspace(db);

  assert.equal(ws2, ws1);
  assert.equal(countInvoices(ws2), count1);
});
