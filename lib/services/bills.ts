import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { withTransaction } from "@/lib/db/client";
import { todayIST } from "@/lib/time";
import { businessRule, notFound } from "./errors";
import { dbAll, dbGet } from "./invoices";
import {
  parseIsoDate,
  parseMoneyRupees,
  parseNonEmptyString,
  parseOptionalString,
  requireObject,
} from "./validators";

export type BillStatus = "scheduled" | "paid" | "cancelled";
export type BillSourceType = "one_time" | "recurring";

export interface BillRecord {
  id: string;
  title: string;
  payee: string | null;
  category: string;
  amount_paise: number;
  due_date: string;
  source_type: BillSourceType;
  recurring_expense_id: string | null;
  status: BillStatus;
  paid_at: string | null;
  created_at: string;
}

const BILL_COLUMNS =
  "id, title, payee, category, amount_paise, due_date, source_type, recurring_expense_id, status, paid_at, created_at";

function toBillRecord(row: BillRecord): BillRecord {
  return {
    id: row.id,
    title: row.title,
    payee: row.payee,
    category: row.category,
    amount_paise: Number(row.amount_paise),
    due_date: row.due_date,
    source_type: row.source_type,
    recurring_expense_id: row.recurring_expense_id,
    status: row.status,
    paid_at: row.paid_at,
    created_at: row.created_at,
  };
}

/** Loads one bill in the workspace, or throws NOT_FOUND. */
export function getBill(db: DatabaseSync, ws: string, id: string): BillRecord {
  const row = dbGet<BillRecord>(
    db,
    `SELECT ${BILL_COLUMNS} FROM scheduled_outflows WHERE workspace_id = ? AND id = ?`,
    [ws, id],
  );
  if (!row) throw notFound("Bill not found");
  return toBillRecord(row);
}

/** Lists bills for the workspace, newest due date last. */
export function listBills(db: DatabaseSync, ws: string): BillRecord[] {
  return dbAll<BillRecord>(
    db,
    `SELECT ${BILL_COLUMNS} FROM scheduled_outflows
     WHERE workspace_id = ? ORDER BY due_date, created_at`,
    [ws],
  ).map(toBillRecord);
}

/**
 * Creates a one-time scheduled bill (outflow). Amount is accepted in rupees at the boundary.
 */
export function createBill(db: DatabaseSync, ws: string, input: unknown): BillRecord {
  const body = requireObject(input);
  const title = parseNonEmptyString(body.title, "title", 200);
  const category = parseNonEmptyString(body.category, "category", 100);
  const amountPaise = parseMoneyRupees(body.amount, "amount");
  const dueDate = parseIsoDate(body.due_date, "due_date", true)!;
  const payee = parseOptionalString(body.payee, "payee", 200);

  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO scheduled_outflows
       (id, workspace_id, title, payee, category, amount_paise, due_date, source_type,
        recurring_expense_id, status, paid_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'one_time', NULL, 'scheduled', NULL, ?)`,
  ).run(id, ws, title, payee, category, amountPaise, dueDate, now);

  return getBill(db, ws, id);
}

export type PayBillResult = {
  bill: BillRecord;
  cash_outflow: {
    amount_paise: number;
    occurred_on: string;
    source_type: "bill_payment";
    source_id: string;
  };
};

/** Parses optional paid_on; defaults to today IST; rejects future dates. */
export function parseBillPaidOn(input: unknown): string {
  const body = requireObject(input ?? {});
  const today = todayIST();
  const paidOn = parseIsoDate(body.paid_on, "paid_on", false) ?? today;
  if (paidOn > today) {
    throw businessRule("Payment date cannot be in the future");
  }
  return paidOn;
}

/**
 * Marks a scheduled outflow paid and writes the cash outflow.
 * Caller must already be inside a transaction when composing multi-step flows.
 */
export function payBillInTransaction(
  db: DatabaseSync,
  ws: string,
  billId: string,
  paidOn: string,
): PayBillResult {
  const bill = getBill(db, ws, billId);

  if (bill.status === "paid") {
    throw businessRule("Bill is already paid");
  }
  if (bill.status === "cancelled") {
    throw businessRule("Cannot pay a cancelled bill");
  }

  const now = new Date().toISOString();
  db.prepare(
    `UPDATE scheduled_outflows
     SET status = 'paid', paid_at = ?
     WHERE workspace_id = ? AND id = ? AND status = 'scheduled'`,
  ).run(paidOn, ws, billId);

  const updated = getBill(db, ws, billId);
  if (updated.status !== "paid") {
    throw businessRule("Bill could not be marked paid");
  }

  db.prepare(
    `INSERT INTO cash_transactions (id, workspace_id, direction, amount_paise, occurred_on,
       source_type, source_id, note, created_at)
     VALUES (?, ?, 'outflow', ?, ?, 'bill_payment', ?, ?, ?)`,
  ).run(
    randomUUID(),
    ws,
    bill.amount_paise,
    paidOn,
    billId,
    `Bill payment: ${bill.title}`,
    now,
  );

  return {
    bill: updated,
    cash_outflow: {
      amount_paise: bill.amount_paise,
      occurred_on: paidOn,
      source_type: "bill_payment",
      source_id: billId,
    },
  };
}

/**
 * Marks a scheduled bill paid and records the matching cash outflow, atomically.
 * Optional paid_on defaults to today (IST). Replays against paid/cancelled bills are rejected.
 */
export function payBill(db: DatabaseSync, ws: string, billId: string, input: unknown = {}) {
  const paidOn = parseBillPaidOn(input);
  return withTransaction(db, () => payBillInTransaction(db, ws, billId, paidOn));
}

/** Cancels a scheduled bill. Paid bills cannot be cancelled. */
export function cancelBill(db: DatabaseSync, ws: string, billId: string): BillRecord {
  return withTransaction(db, () => {
    const bill = getBill(db, ws, billId);
    if (bill.status === "paid") {
      throw businessRule("Cannot cancel a paid bill");
    }
    if (bill.status === "cancelled") {
      throw businessRule("Bill is already cancelled");
    }

    db.prepare(
      `UPDATE scheduled_outflows SET status = 'cancelled'
       WHERE workspace_id = ? AND id = ? AND status = 'scheduled'`,
    ).run(ws, billId);

    return getBill(db, ws, billId);
  });
}
