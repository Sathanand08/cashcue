import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TMP_DB = path.join(os.tmpdir(), `cashcue-bills-test-${process.pid}-${Date.now()}.db`);
process.env.CASHCUE_DB_PATH = TMP_DB;

type Db = import("node:sqlite").DatabaseSync;
type BillsModule = typeof import("../lib/services/bills");
type ForecastModule = typeof import("../lib/services/forecast");

let db: Db;
let ws: string;
let bills: BillsModule;
let forecast: ForecastModule;
const seededBillIds = new Set<string>();

before(async () => {
  const client = await import("../lib/db/client");
  const workspace = await import("../lib/db/workspace");
  bills = await import("../lib/services/bills");
  forecast = await import("../lib/services/forecast");

  db = client.getDb();
  ws = workspace.getDemoWorkspaceId();

  for (const row of db
    .prepare("SELECT id FROM scheduled_outflows WHERE workspace_id = ?")
    .all(ws) as { id: string }[]) {
    seededBillIds.add(row.id);
  }
});

beforeEach(() => {
  db.prepare(
    `DELETE FROM cash_transactions WHERE workspace_id = ? AND source_type = 'bill_payment'`,
  ).run(ws);
  db.prepare(
    `DELETE FROM scheduled_outflows WHERE workspace_id = ? AND id NOT IN (${
      [...seededBillIds].map(() => "?").join(",") || "''"
    })`,
  ).run(ws, ...seededBillIds);
  // Restore seeded bills to scheduled (tests may pay them).
  db.prepare(
    `UPDATE scheduled_outflows SET status = 'scheduled', paid_at = NULL
     WHERE workspace_id = ?`,
  ).run(ws);
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
      // ignore
    }
  }
});

function countBillOutflows(billId: string): number {
  return (
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM cash_transactions
         WHERE workspace_id = ? AND source_type = 'bill_payment' AND source_id = ?`,
      )
      .get(ws, billId) as { n: number }
  ).n;
}

test("listBills returns seeded one-time contractor payouts", () => {
  const list = bills.listBills(db, ws);
  const oneTime = list.filter((b) => b.source_type === "one_time");
  assert.ok(oneTime.length >= 2);
  assert.ok(oneTime.some((b) => b.title.includes("landing page")));
  assert.ok(oneTime.every((b) => b.status === "scheduled"));
});

test("createBill stores a one-time scheduled outflow", () => {
  const bill = bills.createBill(db, ws, {
    title: "Test printer ink",
    category: "Office",
    amount: 1500.5,
    due_date: "2026-11-30",
    payee: "OfficeMart",
  });

  assert.equal(bill.source_type, "one_time");
  assert.equal(bill.status, "scheduled");
  assert.equal(bill.amount_paise, 150050);
  assert.equal(bill.payee, "OfficeMart");
  assert.equal(bill.due_date, "2026-11-30");
  assert.equal(bills.getBill(db, ws, bill.id).id, bill.id);
});

test("createBill rejects missing title and invalid amount", () => {
  assert.throws(
    () => bills.createBill(db, ws, { category: "X", amount: 100, due_date: "2026-11-30" }),
    { code: "VALIDATION_ERROR" },
  );
  assert.throws(
    () =>
      bills.createBill(db, ws, {
        title: "X",
        category: "Y",
        amount: 0,
        due_date: "2026-11-30",
      }),
    { code: "VALIDATION_ERROR" },
  );
});

test("payBill marks paid, writes one cash outflow, and drops bill from forecast", () => {
  const bill = bills.createBill(db, ws, {
    title: "Pay-me bill",
    category: "Test",
    amount: 25000,
    due_date: "2026-11-24",
  });

  const before = forecast.getForecast(db, ws, 30);
  const cashBefore = before.cashNowPaise;

  const result = bills.payBill(db, ws, bill.id, { paid_on: "2026-11-22" });

  assert.equal(result.bill.status, "paid");
  assert.equal(result.bill.paid_at, "2026-11-22");
  assert.equal(result.cash_outflow.amount_paise, 2500000);
  assert.equal(result.cash_outflow.occurred_on, "2026-11-22");
  assert.equal(countBillOutflows(bill.id), 1);

  const after = forecast.getForecast(db, ws, 30);
  assert.equal(after.cashNowPaise, cashBefore - 2500000);

  const billEvents = after.series.flatMap((p) => p.events).filter((e) => e.type === "bill");
  assert.equal(
    billEvents.some((e) => e.outflowId === bill.id),
    false,
  );
});

test("payBill rejects double pay and cancelled bills", () => {
  const bill = bills.createBill(db, ws, {
    title: "Once only",
    category: "Test",
    amount: 1000,
    due_date: "2026-11-25",
  });

  bills.payBill(db, ws, bill.id, { paid_on: "2026-11-22" });
  assert.throws(() => bills.payBill(db, ws, bill.id, { paid_on: "2026-11-22" }), {
    code: "BUSINESS_RULE",
  });
  assert.equal(countBillOutflows(bill.id), 1);

  const other = bills.createBill(db, ws, {
    title: "Cancel me",
    category: "Test",
    amount: 2000,
    due_date: "2026-11-26",
  });
  bills.cancelBill(db, ws, other.id);
  assert.throws(() => bills.payBill(db, ws, other.id, {}), { code: "BUSINESS_RULE" });
  assert.equal(countBillOutflows(other.id), 0);
});

test("payBill rejects future paid_on and unknown bill id", () => {
  const bill = bills.createBill(db, ws, {
    title: "Future pay",
    category: "Test",
    amount: 500,
    due_date: "2026-12-01",
  });

  assert.throws(() => bills.payBill(db, ws, bill.id, { paid_on: "2099-01-01" }), {
    code: "BUSINESS_RULE",
  });
  assert.throws(() => bills.payBill(db, ws, "missing-bill-id", {}), { code: "NOT_FOUND" });
});

test("cancelBill sets cancelled; cannot cancel paid", () => {
  const bill = bills.createBill(db, ws, {
    title: "Cancel ok",
    category: "Test",
    amount: 800,
    due_date: "2026-12-02",
  });
  const cancelled = bills.cancelBill(db, ws, bill.id);
  assert.equal(cancelled.status, "cancelled");
  assert.throws(() => bills.cancelBill(db, ws, bill.id), { code: "BUSINESS_RULE" });

  const paid = bills.createBill(db, ws, {
    title: "Paid no cancel",
    category: "Test",
    amount: 900,
    due_date: "2026-12-03",
  });
  bills.payBill(db, ws, paid.id, { paid_on: "2026-11-22" });
  assert.throws(() => bills.cancelBill(db, ws, paid.id), { code: "BUSINESS_RULE" });
});

test("workspace isolation: bills from another workspace are invisible", () => {
  const otherWs = "ws-bills-iso";
  const now = new Date().toISOString();
  db.prepare("INSERT INTO workspaces (id, name, created_at) VALUES (?, ?, ?)").run(
    otherWs,
    "Other Bills",
    now,
  );

  try {
    const mine = bills.createBill(db, ws, {
      title: "Mine only",
      category: "Test",
      amount: 111,
      due_date: "2026-12-10",
    });
    db.prepare(
      `INSERT INTO scheduled_outflows
         (id, workspace_id, title, payee, category, amount_paise, due_date, source_type,
          recurring_expense_id, status, paid_at, created_at)
       VALUES (?, ?, 'Other bill', NULL, 'Test', 22200, '2026-12-10', 'one_time', NULL, 'scheduled', NULL, ?)`,
    ).run("other-bill-1", otherWs, now);

    assert.equal(
      bills.listBills(db, ws).some((b) => b.id === "other-bill-1"),
      false,
    );
    assert.throws(() => bills.getBill(db, ws, "other-bill-1"), { code: "NOT_FOUND" });
    assert.throws(() => bills.payBill(db, ws, "other-bill-1", {}), { code: "NOT_FOUND" });
    assert.ok(bills.getBill(db, ws, mine.id));
  } finally {
    db.prepare("DELETE FROM scheduled_outflows WHERE workspace_id = ?").run(otherWs);
    db.prepare("DELETE FROM workspaces WHERE id = ?").run(otherWs);
  }
});
