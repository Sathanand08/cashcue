import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import assert from "node:assert/strict";
import { after, test } from "node:test";

// Must be set before any lib/db/* module is imported: the client reads it on first open.
const dbPath = path.join(os.tmpdir(), `cashcue-actions-test-${process.pid}-${Date.now()}.db`);
process.env.CASHCUE_DB_PATH = dbPath;

const { getDb } = await import("../lib/db/client");
const { getDemoWorkspaceId } = await import("../lib/db/workspace");
const { getActionQueue, parseActionDays } = await import("../lib/services/actions");

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

const SNAPSHOT_TABLES = ["invoices", "payments", "cash_transactions"] as const;

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

test("action queue contains INV-001 with its stress shortfall increase", () => {
  const actions = getActionQueue(db, ws, 30);
  const inv1 = actions.find((a) => a.invoiceNumber === "INV-001");
  assert.ok(inv1, "INV-001 should be in the action queue");
  assert.equal(inv1.stressShortfallIncreasePaise, 2700000);
});

test("action queue contains overdue INV-003 with outstanding and impact of 1800000", () => {
  const actions = getActionQueue(db, ws, 30);
  const inv3 = actions.find((a) => a.invoiceNumber === "INV-003");
  assert.ok(inv3, "INV-003 should be in the action queue");
  assert.equal(inv3.overdue, true);
  assert.equal(inv3.outstandingPaise, 1800000);
  assert.equal(inv3.impactValuePaise, 1800000);
});

test("action queue contains INV-002 with a positive stress shortfall increase", () => {
  const actions = getActionQueue(db, ws, 30);
  const inv2 = actions.find((a) => a.invoiceNumber === "INV-002");
  assert.ok(inv2, "INV-002 should be in the action queue");
  assert.ok(inv2.stressShortfallIncreasePaise > 0);
});

test("action queue is sorted by impactValuePaise descending", () => {
  const actions = getActionQueue(db, ws, 30);
  for (let i = 1; i < actions.length; i++) {
    assert.ok(
      actions[i - 1].impactValuePaise >= actions[i].impactValuePaise,
      `expected ${actions[i - 1].impactValuePaise} >= ${actions[i].impactValuePaise}`,
    );
  }
});

test("INV-001 recommendation text is derived from the engine and contains ₹45,000", () => {
  const actions = getActionQueue(db, ws, 30);
  const inv1 = actions.find((a) => a.invoiceNumber === "INV-001");
  assert.ok(inv1, "INV-001 should be in the action queue");
  assert.equal(inv1.stressShortfallIncreasePaise, 2700000);
  assert.ok(
    inv1.recommendedAction.includes("₹45,000"),
    `recommendedAction should contain ₹45,000, got: ${inv1.recommendedAction}`,
  );
});

test("workspace isolation: another workspace has an empty action queue", () => {
  const otherWs = "ws-actions-b";
  const now = new Date().toISOString();
  db.prepare("INSERT INTO workspaces (id, name, created_at) VALUES (?, ?, ?)").run(otherWs, "Other", now);
  db.prepare(
    `INSERT INTO workspace_settings (id, workspace_id, opening_cash_paise, opening_cash_as_of,
       minimum_cash_buffer_paise, currency, timezone, updated_at)
     VALUES (?, ?, 0, '2026-11-21', 0, 'INR', 'Asia/Kolkata', ?)`,
  ).run(`${otherWs}-settings`, otherWs, now);

  try {
    assert.deepEqual(getActionQueue(db, otherWs, 30), []);
  } finally {
    db.prepare("DELETE FROM workspace_settings WHERE workspace_id = ?").run(otherWs);
    db.prepare("DELETE FROM workspaces WHERE id = ?").run(otherWs);
  }
});

test("parseActionDays: null defaults to 30 and invalid values are rejected", () => {
  assert.equal(parseActionDays(null), 30);
  assert.throws(() => parseActionDays("45"), { code: "VALIDATION_ERROR" });
});

test("read-only: getActionQueue leaves invoices, payments and cash_transactions unchanged", () => {
  const before = snapshot(ws);

  getActionQueue(db, ws, 30);
  getActionQueue(db, ws, 30);

  assert.deepEqual(snapshot(ws), before);
});
