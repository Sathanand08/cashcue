import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { withTransaction } from "@/lib/db/client";
import {
  expandOccurrences,
  type RecurrenceFrequency,
} from "@/lib/finance/recurring-expenses";
import {
  getBill,
  parseBillPaidOn,
  payBillInTransaction,
  type BillRecord,
  type PayBillResult,
} from "./bills";
import { businessRule, notFound, validationError } from "./errors";
import { dbAll, dbGet } from "./invoices";
import {
  parseEnum,
  parseIsoDate,
  parseMoneyRupees,
  parseNonEmptyString,
  requireObject,
} from "./validators";

export const RECURRENCE_FREQUENCIES = ["weekly", "monthly", "quarterly"] as const;

export interface RecurringExpenseRecord {
  id: string;
  title: string;
  category: string;
  amount_paise: number;
  frequency: RecurrenceFrequency;
  interval_count: number;
  next_due_date: string;
  active: boolean;
  created_at: string;
}

const RULE_COLUMNS =
  "id, title, category, amount_paise, frequency, interval_count, next_due_date, active, created_at";

const UPDATABLE_FIELDS = new Set([
  "title",
  "category",
  "amount",
  "frequency",
  "interval_count",
  "next_due_date",
  "active",
]);

type RuleRow = Omit<RecurringExpenseRecord, "active"> & { active: number };

function toRecord(row: RuleRow): RecurringExpenseRecord {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    amount_paise: Number(row.amount_paise),
    frequency: row.frequency,
    interval_count: Number(row.interval_count),
    next_due_date: row.next_due_date,
    active: Number(row.active) === 1,
    created_at: row.created_at,
  };
}

function parseIntervalCount(value: unknown, field = "interval_count"): number {
  let n: number;
  if (typeof value === "number") n = value;
  else if (typeof value === "string" && /^\d+$/.test(value.trim())) n = Number(value.trim());
  else throw validationError(`${field} must be a positive integer`, { field });
  if (!Number.isInteger(n) || n < 1) {
    throw validationError(`${field} must be a positive integer`, { field });
  }
  return n;
}

function parseActiveFlag(value: unknown, field = "active"): number {
  if (value === true || value === 1 || value === "1") return 1;
  if (value === false || value === 0 || value === "0") return 0;
  throw validationError(`${field} must be a boolean`, { field });
}

/** Loads one recurring expense in the workspace, or throws NOT_FOUND. */
export function getRecurringExpense(
  db: DatabaseSync,
  ws: string,
  id: string,
): RecurringExpenseRecord {
  const row = dbGet<RuleRow>(
    db,
    `SELECT ${RULE_COLUMNS} FROM recurring_expenses WHERE workspace_id = ? AND id = ?`,
    [ws, id],
  );
  if (!row) throw notFound("Recurring expense not found");
  return toRecord(row);
}

/** Lists recurring expenses for the workspace (active and inactive). */
export function listRecurringExpenses(
  db: DatabaseSync,
  ws: string,
): RecurringExpenseRecord[] {
  return dbAll<RuleRow>(
    db,
    `SELECT ${RULE_COLUMNS} FROM recurring_expenses
     WHERE workspace_id = ? ORDER BY next_due_date, created_at`,
    [ws],
  ).map(toRecord);
}

/** Creates a recurring expense rule. Amount is accepted in rupees at the boundary. */
export function createRecurringExpense(
  db: DatabaseSync,
  ws: string,
  input: unknown,
): RecurringExpenseRecord {
  const body = requireObject(input);
  const title = parseNonEmptyString(body.title, "title", 200);
  const category = parseNonEmptyString(body.category, "category", 100);
  const amountPaise = parseMoneyRupees(body.amount, "amount");
  const frequency = parseEnum(body.frequency, "frequency", RECURRENCE_FREQUENCIES);
  const intervalCount =
    body.interval_count === undefined ? 1 : parseIntervalCount(body.interval_count);
  const nextDueDate = parseIsoDate(body.next_due_date, "next_due_date", true)!;
  const active =
    body.active === undefined ? 1 : parseActiveFlag(body.active);

  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO recurring_expenses
       (id, workspace_id, title, category, amount_paise, frequency, interval_count,
        next_due_date, active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, ws, title, category, amountPaise, frequency, intervalCount, nextDueDate, active, now);

  return getRecurringExpense(db, ws, id);
}

/** Updates editable fields on a recurring expense rule. */
export function updateRecurringExpense(
  db: DatabaseSync,
  ws: string,
  id: string,
  patch: unknown,
): RecurringExpenseRecord {
  const body = requireObject(patch);
  const unknown = Object.keys(body).filter((k) => !UPDATABLE_FIELDS.has(k));
  if (unknown.length > 0) {
    throw validationError(`Unknown field(s): ${unknown.join(", ")}`, { fields: unknown });
  }
  if (Object.keys(body).length === 0) {
    throw validationError("No fields to update");
  }

  const current = getRecurringExpense(db, ws, id);
  const next = {
    title: current.title,
    category: current.category,
    amount_paise: current.amount_paise,
    frequency: current.frequency,
    interval_count: current.interval_count,
    next_due_date: current.next_due_date,
    active: current.active ? 1 : 0,
  };

  if ("title" in body) next.title = parseNonEmptyString(body.title, "title", 200);
  if ("category" in body) next.category = parseNonEmptyString(body.category, "category", 100);
  if ("amount" in body) next.amount_paise = parseMoneyRupees(body.amount, "amount");
  if ("frequency" in body) {
    next.frequency = parseEnum(body.frequency, "frequency", RECURRENCE_FREQUENCIES);
  }
  if ("interval_count" in body) next.interval_count = parseIntervalCount(body.interval_count);
  if ("next_due_date" in body) {
    next.next_due_date = parseIsoDate(body.next_due_date, "next_due_date", true)!;
  }
  if ("active" in body) next.active = parseActiveFlag(body.active);

  db.prepare(
    `UPDATE recurring_expenses
     SET title = ?, category = ?, amount_paise = ?, frequency = ?, interval_count = ?,
         next_due_date = ?, active = ?
     WHERE workspace_id = ? AND id = ?`,
  ).run(
    next.title,
    next.category,
    next.amount_paise,
    next.frequency,
    next.interval_count,
    next.next_due_date,
    next.active,
    ws,
    id,
  );

  return getRecurringExpense(db, ws, id);
}

/**
 * Ensures a scheduled_outflows row exists for (rule, due_date), then marks it paid.
 * Idempotent materialization via UNIQUE(recurring_expense_id, due_date).
 * Forecast will skip that occurrence once status is paid.
 */
export function payRecurringOccurrence(
  db: DatabaseSync,
  ws: string,
  ruleId: string,
  input: unknown,
): PayBillResult & { rule: RecurringExpenseRecord; materialized: boolean } {
  const body = requireObject(input);
  const dueDate = parseIsoDate(body.due_date, "due_date", true)!;
  const paidOn = parseBillPaidOn(body);

  return withTransaction(db, () => {
    const rule = getRecurringExpense(db, ws, ruleId);

    // due_date must be a real occurrence of this rule (allow a wide window around it).
    const occurrences = expandOccurrences(
      {
        anchorDate: rule.next_due_date,
        frequency: rule.frequency,
        intervalCount: rule.interval_count,
      },
      dueDate,
      dueDate,
    );
    if (!occurrences.includes(dueDate)) {
      throw businessRule(
        `due_date ${dueDate} is not an occurrence of this recurring expense`,
      );
    }

    const existing = dbGet<BillRecord>(
      db,
      `SELECT id, title, payee, category, amount_paise, due_date, source_type,
              recurring_expense_id, status, paid_at, created_at
       FROM scheduled_outflows
       WHERE workspace_id = ? AND recurring_expense_id = ? AND due_date = ?`,
      [ws, ruleId, dueDate],
    );

    let billId: string;
    let materialized = false;

    if (existing) {
      if (existing.status === "paid") {
        throw businessRule("This occurrence is already paid");
      }
      if (existing.status === "cancelled") {
        throw businessRule("Cannot pay a cancelled occurrence");
      }
      billId = existing.id;
    } else {
      billId = randomUUID();
      const now = new Date().toISOString();
      db.prepare(
        `INSERT INTO scheduled_outflows
           (id, workspace_id, title, payee, category, amount_paise, due_date, source_type,
            recurring_expense_id, status, paid_at, created_at)
         VALUES (?, ?, ?, NULL, ?, ?, ?, 'recurring', ?, 'scheduled', NULL, ?)`,
      ).run(
        billId,
        ws,
        rule.title,
        rule.category,
        rule.amount_paise,
        dueDate,
        ruleId,
        now,
      );
      materialized = true;
    }

    // Re-read through getBill for consistent shape / workspace guard.
    getBill(db, ws, billId);
    const paid = payBillInTransaction(db, ws, billId, paidOn);

    return {
      ...paid,
      rule: getRecurringExpense(db, ws, ruleId),
      materialized,
    };
  });
}
