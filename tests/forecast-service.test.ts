import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import assert from "node:assert/strict";
import { after, test } from "node:test";

// Must be set before any lib/db/* module is imported: the client reads it on first open.
const dbPath = path.join(os.tmpdir(), `cashcue-forecast-test-${process.pid}-${Date.now()}.db`);
process.env.CASHCUE_DB_PATH = dbPath;

const { getDb } = await import("../lib/db/client");
const { getDemoWorkspaceId } = await import("../lib/db/workspace");
const { buildForecastInput, getForecast, parseForecastDays } = await import(
  "../lib/services/forecast"
);
const { getCashSettings } = await import("../lib/services/cash");

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

test("parseForecastDays accepts 30, 60, 90 and rejects everything else", () => {
  assert.equal(parseForecastDays("30"), 30);
  assert.equal(parseForecastDays("60"), 60);
  assert.equal(parseForecastDays("90"), 90);
  for (const bad of [null, "45", ""]) {
    assert.throws(() => parseForecastDays(bad), { code: "VALIDATION_ERROR" });
  }
});

test("getForecast 30 days: cash now, buffer and INV-005 outstanding", () => {
  const f = getForecast(db, ws, 30);
  assert.equal(f.cashNowPaise, 8000000);
  assert.equal(f.series.length, 31);
  assert.equal(f.bufferPaise, 5000000);

  const input = buildForecastInput(db, ws, 30);
  const inv = input.invoices.find((i) => i.invoiceNumber === "INV-005");
  assert.ok(inv, "INV-005 should exist in the demo workspace");
  assert.equal(inv.paidPaise, 2000000);
  assert.equal(inv.amountPaise, 5000000);
  assert.equal(inv.amountPaise - inv.paidPaise, 3000000);
});

test("getForecast series length follows the horizon (30, 60, 90)", () => {
  assert.equal(getForecast(db, ws, 30).series.length, 31);
  assert.equal(getForecast(db, ws, 60).series.length, 61);
  assert.equal(getForecast(db, ws, 90).series.length, 91);
});

test("getForecast 30 days: receipts and outflows are non-negative; series starts on opening date", () => {
  const f = getForecast(db, ws, 30);
  assert.equal(typeof f.receiptsInPeriodPaise, "number");
  assert.ok(f.receiptsInPeriodPaise >= 0);
  assert.equal(typeof f.outflowsInPeriodPaise, "number");
  assert.ok(f.outflowsInPeriodPaise >= 0);
  assert.equal(f.series[0].date, "2026-11-21");
});

test("workspace isolation: another workspace sees no invoices, outflows, rules or cash transactions", async () => {
  const otherWs = "ws-forecast-b";
  const now = new Date().toISOString();
  db.prepare("INSERT INTO workspaces (id, name, created_at) VALUES (?, ?, ?)").run(
    otherWs,
    "Other",
    now,
  );
  db.prepare(
    `INSERT INTO workspace_settings (id, workspace_id, opening_cash_paise, opening_cash_as_of,
       minimum_cash_buffer_paise, currency, timezone, updated_at)
     VALUES (?, ?, 0, '2026-11-21', 0, 'INR', 'Asia/Kolkata', ?)`,
  ).run(`${otherWs}-settings`, otherWs, now);

  try {
    getCashSettings(db, otherWs); // sanity: settings exist
    const input = buildForecastInput(db, otherWs, 30);
    assert.equal(input.invoices.length, 0);
    assert.equal(input.outflows.length, 0);
    assert.equal(input.recurringRules.length, 0);
    assert.equal(input.cashTransactions.length, 0);
  } finally {
    db.prepare("DELETE FROM workspace_settings WHERE workspace_id = ?").run(otherWs);
    db.prepare("DELETE FROM workspaces WHERE id = ?").run(otherWs);
  }
});

test("paid bills are not future scheduled outflows; their cash outflow reduces cash now", () => {
  const billId = "test-paid-bill";
  const cashId = "test-paid-bill-cash";
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO scheduled_outflows (id, workspace_id, title, payee, category, amount_paise, due_date,
       source_type, recurring_expense_id, status, paid_at, created_at)
     VALUES (?, ?, 'Test paid bill', NULL, 'test', 2500000, '2026-11-24', 'one_time', NULL, 'paid', '2026-11-22', ?)`,
  ).run(billId, ws, now);
  db.prepare(
    `INSERT INTO cash_transactions (id, workspace_id, direction, amount_paise, occurred_on, source_type,
       source_id, note, created_at)
     VALUES (?, ?, 'outflow', 2500000, '2026-11-22', 'bill_payment', ?, NULL, ?)`,
  ).run(cashId, ws, billId, now);

  try {
    const f = getForecast(db, ws, 30);
    assert.equal(f.cashNowPaise, 8000000 - 2500000);
    const billEvents = f.series.flatMap((p) => p.events).filter((e) => e.type === "bill");
    assert.equal(
      billEvents.some((e) => e.outflowId === billId),
      false,
    );
  } finally {
    db.prepare("DELETE FROM cash_transactions WHERE workspace_id = ? AND id = ?").run(ws, cashId);
    db.prepare("DELETE FROM scheduled_outflows WHERE workspace_id = ? AND id = ?").run(ws, billId);
  }
});
