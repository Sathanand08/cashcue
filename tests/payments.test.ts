import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Must run before any lib/db/* module is loaded: the DB client reads this path on first use.
// One unique temp DB per test file (node --test runs each file in its own process).
const TMP_DB = path.join(os.tmpdir(), `cashcue-payments-test-${process.pid}-${Date.now()}.db`);
process.env.CASHCUE_DB_PATH = TMP_DB;

type Db = import("node:sqlite").DatabaseSync;
type PaymentsModule = typeof import("../lib/services/payments");
type InvoicesModule = typeof import("../lib/services/invoices");

let db: Db;
let ws: string;
let inv5Id: string;
let payments: PaymentsModule;
let invoices: InvoicesModule;

before(async () => {
  const client = await import("../lib/db/client");
  const workspace = await import("../lib/db/workspace");
  payments = await import("../lib/services/payments");
  invoices = await import("../lib/services/invoices");

  db = client.getDb();
  ws = workspace.getDemoWorkspaceId();
  inv5Id = (
    db.prepare("SELECT id FROM invoices WHERE workspace_id = ? AND invoice_number = ?").get(ws, "INV-005") as {
      id: string;
    }
  ).id;
});

// Reset strategy: the temp DB is created and seeded once per file. beforeEach removes every
// payment except the seeded INV-005 payment (reference DEMO-UPI-001), all cash_transactions,
// and any TEST- invoices created by earlier cases. This restores INV-005 to its seeded
// state: ₹50,000 total, ₹20,000 paid, ₹30,000 outstanding.
beforeEach(() => {
  db.prepare("DELETE FROM payments WHERE workspace_id = ? AND (reference IS NULL OR reference <> 'DEMO-UPI-001')").run(ws);
  db.prepare("DELETE FROM cash_transactions WHERE workspace_id = ?").run(ws);
  db.prepare("DELETE FROM invoices WHERE workspace_id = ? AND invoice_number LIKE 'TEST-%'").run(ws);
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

function countPayments(invoiceId: string): number {
  return (
    db.prepare("SELECT COUNT(*) AS n FROM payments WHERE workspace_id = ? AND invoice_id = ?").get(ws, invoiceId) as {
      n: number;
    }
  ).n;
}

function countCashRows(): number {
  return (
    db.prepare("SELECT COUNT(*) AS n FROM cash_transactions WHERE workspace_id = ?").get(ws) as { n: number }
  ).n;
}

function countPaymentInflows(paymentId: string): number {
  return (
    db
      .prepare("SELECT COUNT(*) AS n FROM cash_transactions WHERE workspace_id = ? AND source_type = 'payment' AND source_id = ?")
      .get(ws, paymentId) as { n: number }
  ).n;
}

test("recordPayment: ₹10,000 on INV-005 reduces outstanding and writes one inflow", () => {
  const cashBefore = countCashRows();

  const { payment, invoice } = payments.recordPayment(db, ws, inv5Id, { amount: 10000, payment_method: "UPI" });

  assert.ok(payment);
  assert.equal(invoice.outstanding_paise, 2000000);
  assert.equal(countCashRows() - cashBefore, 1);

  const row = db
    .prepare(
      "SELECT direction, amount_paise, source_type, source_id FROM cash_transactions WHERE workspace_id = ? AND source_id = ?",
    )
    .get(ws, payment.id) as {
    direction: string;
    amount_paise: number;
    source_type: string;
    source_id: string;
  };
  assert.equal(row.direction, "inflow");
  assert.equal(Number(row.amount_paise), 1000000);
  assert.equal(row.source_type, "payment");
  assert.equal(row.source_id, payment.id);

  // Seeded ₹20,000 payment plus the new one.
  assert.equal(payments.listPaymentsForInvoice(db, ws, inv5Id).length, 2);
  assert.equal(countPayments(inv5Id), 2);
});

test("recordPayment: replaying the same idempotency_key returns the original and writes nothing", () => {
  const first = payments.recordPayment(db, ws, inv5Id, {
    amount: 10000,
    payment_method: "UPI",
    idempotency_key: "pay-test-idem-1",
  });
  const cashAfterFirst = countCashRows();
  const paymentsAfterFirst = countPayments(inv5Id);
  assert.equal(countPaymentInflows(first.payment.id), 1);

  const replay = payments.recordPayment(db, ws, inv5Id, {
    amount: 10000,
    payment_method: "UPI",
    idempotency_key: "pay-test-idem-1",
  });

  assert.equal(replay.payment.id, first.payment.id);
  assert.equal(countPayments(inv5Id), paymentsAfterFirst);
  assert.equal(countCashRows(), cashAfterFirst);
  assert.equal(countPaymentInflows(first.payment.id), 1);
  assert.equal(replay.invoice.outstanding_paise, 2000000);
});

test("recordPayment: a different idempotency_key creates a new payment and a new inflow", () => {
  const paymentsBefore = countPayments(inv5Id);
  const cashBefore = countCashRows();

  // Both calls are made inside this test so it does not depend on the replay test's state.
  const first = payments.recordPayment(db, ws, inv5Id, {
    amount: 10000,
    payment_method: "UPI",
    idempotency_key: "pay-test-idem-1",
  });
  const second = payments.recordPayment(db, ws, inv5Id, {
    amount: 1000,
    payment_method: "UPI",
    idempotency_key: "pay-test-idem-2",
  });

  const idem1 = db
    .prepare("SELECT id FROM payments WHERE workspace_id = ? AND idempotency_key = 'pay-test-idem-1'")
    .get(ws) as { id: string } | undefined;
  assert.ok(idem1);
  assert.notEqual(second.payment.id, idem1.id);
  assert.notEqual(second.payment.id, first.payment.id);

  assert.equal(countPayments(inv5Id) - paymentsBefore, 2);
  assert.equal(countCashRows() - cashBefore, 2);
  assert.equal(countPaymentInflows(first.payment.id), 1);
  assert.equal(countPaymentInflows(second.payment.id), 1);

  // Original outstanding ₹30,000 (3,000,000 paise) less ₹11,000 (1,100,000 paise).
  assert.equal(second.invoice.outstanding_paise, 3000000 - 1100000);
});

test("recordPayment: overpayment throws and writes no row", () => {
  // Bring INV-005 to ₹20,000 outstanding first.
  payments.recordPayment(db, ws, inv5Id, { amount: 10000, payment_method: "UPI" });
  const paymentsBefore = countPayments(inv5Id);
  const cashBefore = countCashRows();

  assert.throws(() => payments.recordPayment(db, ws, inv5Id, { amount: 25000, payment_method: "UPI" }), /exceeds/);

  assert.equal(countPayments(inv5Id), paymentsBefore);
  assert.equal(countCashRows(), cashBefore);
});

test("recordPayment: draft invoice rejects payment", () => {
  const customerId = (
    db.prepare("SELECT customer_id FROM invoices WHERE id = ?").get(inv5Id) as { customer_id: string }
  ).customer_id;
  const draft = invoices.createInvoice(db, ws, {
    customer_id: customerId,
    invoice_number: "TEST-DRAFT-001",
    invoice_type: "retainer",
    amount: 5000,
    due_date: "2026-12-31",
    workflow_status: "draft",
  });
  assert.equal(draft.workflow_status, "draft");

  const paymentsBefore = countPayments(draft.id);
  const cashBefore = countCashRows();

  assert.throws(() => payments.recordPayment(db, ws, draft.id, { amount: 1000, payment_method: "UPI" }), /draft/);

  assert.equal(countPayments(draft.id), paymentsBefore);
  assert.equal(countCashRows(), cashBefore);
});

test("recordPayment: zero and negative amounts throw and write nothing", () => {
  const paymentsBefore = countPayments(inv5Id);
  const cashBefore = countCashRows();

  assert.throws(() => payments.recordPayment(db, ws, inv5Id, { amount: 0, payment_method: "UPI" }), /greater than zero/);
  assert.throws(() => payments.recordPayment(db, ws, inv5Id, { amount: -100, payment_method: "UPI" }), /greater than zero/);

  assert.equal(countPayments(inv5Id), paymentsBefore);
  assert.equal(countCashRows(), cashBefore);
});
