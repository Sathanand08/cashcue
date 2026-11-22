// Set the temp DB path before any lib/db/* module is loaded (they are imported lazily below).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DB_PATH = path.join(
  os.tmpdir(),
  `cashcue-isolation-test-${process.pid}-${Date.now()}.db`,
);
process.env.CASHCUE_DB_PATH = DB_PATH;

import assert from "node:assert/strict";
import type { DatabaseSync } from "node:sqlite";
import { after, before, test } from "node:test";
import type { AppError } from "../lib/services/errors";

const WS_B = "ws-isolation-b";

let db!: DatabaseSync;
let wsA!: string;
let invoices!: typeof import("../lib/services/invoices");
let payments!: typeof import("../lib/services/payments");

function run(sql: string, params: (string | number | null)[] = []): void {
  db.prepare(sql).run(...params);
}

before(async () => {
  const clientMod = await import("../lib/db/client");
  const workspaceMod = await import("../lib/db/workspace");
  invoices = await import("../lib/services/invoices");
  payments = await import("../lib/services/payments");

  db = clientMod.getDb();
  wsA = workspaceMod.getDemoWorkspaceId();

  const now = new Date().toISOString();

  run("INSERT INTO workspaces (id, name, created_at) VALUES (?, ?, ?)", [
    WS_B,
    "Isolation Test Other Studio",
    "2026-11-21T00:00:00+05:30",
  ]);
  run(
    `INSERT INTO workspace_settings (id, workspace_id, opening_cash_paise, opening_cash_as_of,
       minimum_cash_buffer_paise, currency, timezone, updated_at)
     VALUES (?, ?, 0, '2026-11-21', 0, 'INR', 'Asia/Kolkata', ?)`,
    ["settings-ws-isolation-b", WS_B, now],
  );
  run(
    `INSERT INTO customers (id, workspace_id, name, whatsapp_number, notes, created_at)
     VALUES (?, ?, ?, NULL, NULL, ?)`,
    ["cust-b-1", WS_B, "Other Studio Client", now],
  );
  run(
    `INSERT INTO invoices (id, workspace_id, customer_id, invoice_number, title, invoice_type,
       amount_paise, issue_date, due_date, promised_date, workflow_status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'retainer', 500000, '2026-11-20', '2026-11-30', NULL, 'sent', ?, ?)`,
    ["inv-b-1", WS_B, "cust-b-1", "OTHER-001", "Other", now, now],
  );
  run(
    `INSERT INTO payments (id, workspace_id, invoice_id, amount_paise, received_on,
       payment_method, reference, idempotency_key, created_at)
     VALUES (?, ?, ?, 100000, '2026-11-21', 'UPI', NULL, NULL, ?)`,
    ["pay-b-1", WS_B, "inv-b-1", now],
  );
  run(
    `INSERT INTO cash_transactions (id, workspace_id, direction, amount_paise, occurred_on,
       source_type, source_id, note, created_at)
     VALUES (?, ?, 'inflow', 100000, '2026-11-21', 'payment', 'pay-b-1', NULL, ?)`,
    ["cash-b-1", WS_B, now],
  );
});

after(() => {
  try {
    db?.close();
  } catch {
    // Connection may already be closed; the file is removed below regardless.
  }
  for (const suffix of ["", "-wal", "-shm"]) {
    fs.rmSync(DB_PATH + suffix, { force: true });
  }
});

test("listReceivables for workspace A excludes workspace B invoices and payments", () => {
  const rows = invoices.listReceivables(db, wsA);
  assert.equal(rows.some((r) => r.id === "inv-b-1"), false);
  assert.equal(rows.some((r) => r.invoice_number === "OTHER-001"), false);
  const paymentIds = rows.flatMap((r) => r.payments.map((p) => p.id));
  assert.equal(paymentIds.includes("pay-b-1"), false);
});

test("listReceivables for workspace B returns only its own invoice with the correct balance", () => {
  const rows = invoices.listReceivables(db, WS_B);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].invoice_number, "OTHER-001");
  assert.equal(rows[0].outstanding_paise, 400000);
});

test("getInvoiceWithBalance from workspace A throws NOT_FOUND for a workspace B invoice", () => {
  assert.throws(
    () => invoices.getInvoiceWithBalance(db, wsA, "inv-b-1"),
    (err: unknown) => (err as AppError).code === "NOT_FOUND",
  );
});

test("listPaymentsForInvoice from workspace A returns nothing for a workspace B invoice", () => {
  assert.deepEqual(payments.listPaymentsForInvoice(db, wsA, "inv-b-1"), []);
});

test("listCustomers isolates customers per workspace", () => {
  const namesA = invoices.listCustomers(db, wsA).map((c) => c.id);
  assert.equal(namesA.includes("cust-b-1"), false);
  const namesB = invoices.listCustomers(db, WS_B).map((c) => c.name);
  assert.deepEqual(namesB, ["Other Studio Client"]);
});

test("cross-tenant join guard: workspace A invoice pointing at a workspace B customer is excluded", () => {
  const now = new Date().toISOString();
  run(
    `INSERT INTO invoices (id, workspace_id, customer_id, invoice_number, title, invoice_type,
       amount_paise, issue_date, due_date, promised_date, workflow_status, created_at, updated_at)
     VALUES ('inv-cross-a', ?, 'cust-b-1', 'CROSS-001', 'Cross', 'retainer', 300000,
       '2026-11-20', '2026-11-30', NULL, 'sent', ?, ?)`,
    [wsA, now, now],
  );
  try {
    const ids = invoices.listReceivables(db, wsA).map((r) => r.id);
    assert.equal(ids.includes("inv-cross-a"), false);
  } finally {
    run("DELETE FROM invoices WHERE id = 'inv-cross-a'");
  }
});
