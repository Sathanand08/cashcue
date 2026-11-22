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

test("resetDemoWorkspace wipes mutations and restores Aster seed baseline", () => {
  const ws = seed.seedDemoWorkspace(db);

  db.prepare(
    `UPDATE workspace_settings SET opening_cash_paise = ? WHERE workspace_id = ?`,
  ).run(11_400_000, ws);

  const inv1 = db
    .prepare("SELECT id FROM invoices WHERE workspace_id = ? AND invoice_number = 'INV-001'")
    .get(ws) as { id: string };
  db.prepare(
    `INSERT INTO cash_transactions
      (id, workspace_id, direction, amount_paise, occurred_on, source_type, source_id, note, created_at)
     VALUES (?, ?, 'inflow', ?, '2026-11-21', 'test', NULL, 'dirty', ?)`,
  ).run(crypto.randomUUID(), ws, 340_000, "2026-11-21T00:00:00+05:30");
  db.prepare(
    `INSERT INTO payments
      (id, workspace_id, invoice_id, amount_paise, received_on, payment_method, reference, idempotency_key, created_at)
     VALUES (?, ?, ?, ?, '2026-11-21', 'UPI', 'DIRTY', NULL, ?)`,
  ).run(crypto.randomUUID(), ws, inv1.id, 100_000, "2026-11-21T00:00:00+05:30");

  const result = seed.resetDemoWorkspace(db);

  assert.equal(result.workspace_name, "PixelCraft Studio");
  assert.equal(result.opening_cash_paise, 8_000_000);
  assert.equal(result.opening_cash_as_of, "2026-11-21");
  assert.equal(result.minimum_cash_buffer_paise, 5_000_000);
  assert.equal(result.invoice_count, 7);
  assert.equal(result.primary_demo_invoice, "INV-001");

  const cashTx = db.prepare("SELECT COUNT(*) AS n FROM cash_transactions").get() as { n: number };
  assert.equal(cashTx.n, 0);

  const aster = db
    .prepare(
      `SELECT i.invoice_number, c.name, i.amount_paise,
              (SELECT COALESCE(SUM(p.amount_paise), 0) FROM payments p WHERE p.invoice_id = i.id) AS paid
       FROM invoices i
       JOIN customers c ON c.id = i.customer_id
       WHERE i.workspace_id = ? AND i.invoice_number = 'INV-001'`,
    )
    .get(result.workspace_id) as {
    invoice_number: string;
    name: string;
    amount_paise: number;
    paid: number;
  };
  assert.equal(aster.name, "Aster Dental Clinic");
  assert.equal(aster.amount_paise, 4_500_000);
  assert.equal(aster.paid, 0);

  const inv005Paid = db
    .prepare(
      `SELECT COALESCE(SUM(p.amount_paise), 0) AS paid
       FROM payments p
       JOIN invoices i ON i.id = p.invoice_id
       WHERE i.workspace_id = ? AND i.invoice_number = 'INV-005'`,
    )
    .get(result.workspace_id) as { paid: number };
  assert.equal(inv005Paid.paid, 2_000_000);
});
