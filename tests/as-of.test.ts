import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import assert from "node:assert/strict";
import { after, test } from "node:test";

const dbPath = path.join(os.tmpdir(), `cashcue-asof-test-${process.pid}-${Date.now()}.db`);
process.env.CASHCUE_DB_PATH = dbPath;

const { getDb } = await import("../lib/db/client");
const { getDemoWorkspaceId } = await import("../lib/db/workspace");
const { getBootstrap } = await import("../lib/services/bootstrap");
const { getCashSettings, getWorkspaceAsOf, updateCashSettings } = await import(
  "../lib/services/cash"
);
const { buildForecastInput, getForecast } = await import("../lib/services/forecast");
const { getInvoiceWithBalance, listReceivables } = await import("../lib/services/invoices");

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

test("getWorkspaceAsOf matches opening_cash_as_of and forecast asOf", () => {
  const settings = getCashSettings(db, ws);
  assert.equal(settings.opening_cash_as_of, "2026-11-21");
  assert.equal(getWorkspaceAsOf(db, ws), "2026-11-21");

  const input = buildForecastInput(db, ws, 30);
  assert.equal(input.asOf, settings.opening_cash_as_of);
  assert.equal(getForecast(db, ws, 30).series[0]!.date, "2026-11-21");
});

test("bootstrap today/as_of align with forecast; calendar_today is wall clock", () => {
  const boot = getBootstrap(db, ws);
  const asOf = getWorkspaceAsOf(db, ws);
  assert.equal(boot.today, asOf);
  assert.equal(boot.as_of, asOf);
  assert.equal(boot.settings.opening_cash_as_of, asOf);
  assert.match(boot.calendar_today, /^\d{4}-\d{2}-\d{2}$/);
});

test("INV-003 is overdue on receivables using workspace as-of (not wall clock drift)", () => {
  const inv3 = listReceivables(db, ws).find((r) => r.invoice_number === "INV-003");
  assert.ok(inv3, "INV-003 should exist");
  assert.equal(inv3.status, "overdue");
  assert.ok(inv3.days_overdue > 0);

  const balance = getInvoiceWithBalance(db, ws, inv3.id);
  assert.equal(balance.status, "overdue");
  assert.equal(balance.days_overdue, inv3.days_overdue);

  // Forecast overdue receipt for INV-003 uses the same asOf.
  const input = buildForecastInput(db, ws, 30);
  const fInv = input.invoices.find((i) => i.invoiceNumber === "INV-003");
  assert.ok(fInv);
  assert.ok(fInv.dueDate < input.asOf);
});

test("changing opening_cash_as_of updates aging and forecast together", () => {
  const inv3 = listReceivables(db, ws).find((r) => r.invoice_number === "INV-003")!;
  const originalAsOf = getWorkspaceAsOf(db, ws);

  try {
    // Move as-of before INV-003 due date so it is no longer overdue.
    updateCashSettings(db, ws, { opening_cash_as_of: "2026-11-15" });
    assert.equal(getWorkspaceAsOf(db, ws), "2026-11-15");
    assert.equal(buildForecastInput(db, ws, 30).asOf, "2026-11-15");

    const after = getInvoiceWithBalance(db, ws, inv3.id);
    assert.notEqual(after.status, "overdue");
    assert.equal(getBootstrap(db, ws).as_of, "2026-11-15");
  } finally {
    updateCashSettings(db, ws, { opening_cash_as_of: originalAsOf });
  }

  assert.equal(getInvoiceWithBalance(db, ws, inv3.id).status, "overdue");
});
