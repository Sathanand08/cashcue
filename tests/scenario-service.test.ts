import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import assert from "node:assert/strict";
import { after, test } from "node:test";

// Must be set before any lib/db/* module is imported: the client reads it on first open.
const dbPath = path.join(os.tmpdir(), `cashcue-scenario-test-${process.pid}-${Date.now()}.db`);
process.env.CASHCUE_DB_PATH = dbPath;

const { getDb } = await import("../lib/db/client");
const { getDemoWorkspaceId } = await import("../lib/db/workspace");
const { runWorkspaceDelayScenario } = await import("../lib/services/scenarios");
const { createCustomer, createInvoice, listReceivables } = await import("../lib/services/invoices");

after(() => {
  try {
    getDb().close();
  } catch {
    // already closed
  }
  for (const suffix of ["", "-wal", "-shm"]) {
    fs.rmSync(dbPath + suffix, { force: true });
  }
});

const db: DatabaseSync = getDb();
const ws = getDemoWorkspaceId();

function invoiceId(workspaceId: string, invoiceNumber: string): string {
  const row = db
    .prepare("SELECT id FROM invoices WHERE workspace_id = ? AND invoice_number = ?")
    .get(workspaceId, invoiceNumber) as { id: string } | undefined;
  assert.ok(row, `${invoiceNumber} should exist in workspace ${workspaceId}`);
  return row.id;
}

const SNAPSHOT_TABLES = [
  "invoices",
  "payments",
  "cash_transactions",
  "scheduled_outflows",
  "recurring_expenses",
  "reminder_drafts",
  "workspace_settings",
] as const;

function snapshot(workspaceId: string): Record<string, { count: number; rows: unknown[] }> {
  const out: Record<string, { count: number; rows: unknown[] }> = {};
  for (const table of SNAPSHOT_TABLES) {
    const rows = db
      .prepare(`SELECT * FROM ${table} WHERE workspace_id = ? ORDER BY id`)
      .all(workspaceId) as unknown[];
    out[table] = { count: rows.length, rows };
  }
  return out;
}

test("Aster: delaying INV-001 by 15 days moves its date and reports the breach shift", () => {
  const id = invoiceId(ws, "INV-001");
  const result = runWorkspaceDelayScenario(db, ws, {
    invoice_ids: [id],
    days: 30,
    shift_days: 15,
  });

  assert.equal(result.shifted.length, 1);
  assert.equal(result.shifted[0].from, "2026-11-25");
  assert.equal(result.shifted[0].to, "2026-12-10");
  assert.equal(result.comparison.scenarioFirstBreach, "2026-11-28");
  assert.equal(result.comparison.scenarioMinPaise, 2300000);
  assert.equal(result.comparison.shortfallDeltaPaise, 2700000);
});

test("read-only: delay scenario leaves every workspace table unchanged", () => {
  const id = invoiceId(ws, "INV-001");
  const before = snapshot(ws);

  runWorkspaceDelayScenario(db, ws, { invoice_ids: [id], days: 30, shift_days: 15 });
  runWorkspaceDelayScenario(db, ws, { invoice_ids: [id], days: 30, shift_days: 15 });

  const after2 = snapshot(ws);
  assert.deepEqual(after2, before);

  const inv = db
    .prepare("SELECT due_date, promised_date FROM invoices WHERE id = ?")
    .get(id) as { due_date: string; promised_date: string | null };
  assert.equal(inv.due_date, "2026-11-24");
  assert.equal(inv.promised_date, "2026-11-25");
});

test("draft invoice is rejected with BUSINESS_RULE", () => {
  const cust = createCustomer(db, ws, { name: "Draft Test Client" });
  const draft = createInvoice(db, ws, {
    customer_id: cust.id,
    invoice_number: "DRAFT-SCEN-1",
    amount: 10000,
    due_date: "2026-12-15",
    workflow_status: "draft",
    invoice_type: "retainer",
  });

  try {
    assert.throws(() => runWorkspaceDelayScenario(db, ws, { invoice_ids: [draft.id] }), {
      code: "BUSINESS_RULE",
    });
  } finally {
    db.prepare("DELETE FROM invoices WHERE id = ?").run(draft.id);
    db.prepare("DELETE FROM customers WHERE id = ?").run(cust.id);
  }
});

test("unknown invoice id is rejected with NOT_FOUND", () => {
  assert.throws(
    () => runWorkspaceDelayScenario(db, ws, { invoice_ids: ["does-not-exist"] }),
    { code: "NOT_FOUND" },
  );
});

test("workspace isolation: another workspace cannot delay the demo workspace's invoice", () => {
  const otherWs = "ws-scen-b";
  const id = invoiceId(ws, "INV-001");
  const now = new Date().toISOString();
  db.prepare("INSERT INTO workspaces (id, name, created_at) VALUES (?, ?, ?)").run(otherWs, "Other", now);
  db.prepare(
    `INSERT INTO workspace_settings (id, workspace_id, opening_cash_paise, opening_cash_as_of,
       minimum_cash_buffer_paise, currency, timezone, updated_at)
     VALUES (?, ?, 0, '2026-11-21', 0, 'INR', 'Asia/Kolkata', ?)`,
  ).run(`${otherWs}-settings`, otherWs, now);

  try {
    assert.throws(() => runWorkspaceDelayScenario(db, otherWs, { invoice_ids: [id] }), {
      code: "NOT_FOUND",
    });
  } finally {
    db.prepare("DELETE FROM workspace_settings WHERE workspace_id = ?").run(otherWs);
    db.prepare("DELETE FROM workspaces WHERE id = ?").run(otherWs);
  }
});

test("validation: bad invoice_ids, shift_days and days are rejected with VALIDATION_ERROR", () => {
  const id = invoiceId(ws, "INV-001");
  const tooMany = Array.from({ length: 21 }, (_, i) => `id-${i}`);

  assert.throws(() => runWorkspaceDelayScenario(db, ws, {}), { code: "VALIDATION_ERROR" });
  assert.throws(() => runWorkspaceDelayScenario(db, ws, { invoice_ids: tooMany }), {
    code: "VALIDATION_ERROR",
  });
  assert.throws(() => runWorkspaceDelayScenario(db, ws, { invoice_ids: [id], shift_days: 0 }), {
    code: "VALIDATION_ERROR",
  });
  assert.throws(() => runWorkspaceDelayScenario(db, ws, { invoice_ids: [id], days: 45 }), {
    code: "VALIDATION_ERROR",
  });
});

test("multi-invoice: delaying INV-001 and INV-002 together is at least as bad as INV-001 alone", () => {
  const id1 = invoiceId(ws, "INV-001");
  const id2 = invoiceId(ws, "INV-002");

  const one = runWorkspaceDelayScenario(db, ws, { invoice_ids: [id1] });
  const both = runWorkspaceDelayScenario(db, ws, { invoice_ids: [id1, id2] });

  assert.ok(
    both.comparison.shortfallDeltaPaise >= one.comparison.shortfallDeltaPaise,
    `expected ${both.comparison.shortfallDeltaPaise} >= ${one.comparison.shortfallDeltaPaise}`,
  );
});

// listReceivables is imported to confirm the demo invoice set is readable through the same service layer.
test("demo workspace has receivables readable through the invoices service", () => {
  assert.ok(listReceivables(db, ws).some((r) => r.invoice_number === "INV-001"));
});
