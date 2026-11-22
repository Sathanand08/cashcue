import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { withTransaction } from "@/lib/db/client";
import {
  daysOverdue,
  deriveInvoiceStatus,
  expectedReceiptDate,
  outstandingPaise,
} from "@/lib/finance/invoice-balance";
import { suggestNextInvoiceNumber } from "@/lib/invoices/next-number";
import { formatINR } from "@/lib/money";
import { todayIST } from "@/lib/time";
import { getWorkspaceAsOf } from "./cash";
import { businessRule, conflict, notFound, validationError } from "./errors";
import {
  parseEnum,
  parseIsoDate,
  parseMoneyRupees,
  parseNonEmptyString,
  parseOptionalString,
  requireObject,
} from "./validators";

export const INVOICE_TYPES = ["project_milestone", "retainer"] as const;
export type WorkflowStatus = "draft" | "sent";

type SqlParam = string | number | null;

/** Single-row query helper; node:sqlite rows are cast to the expected shape. */
export function dbGet<T>(db: DatabaseSync, sql: string, params: SqlParam[]): T | undefined {
  return db.prepare(sql).get(...params) as unknown as T | undefined;
}

/** Multi-row query helper. */
export function dbAll<T>(db: DatabaseSync, sql: string, params: SqlParam[]): T[] {
  return db.prepare(sql).all(...params) as unknown as T[];
}

interface InvoiceRow {
  id: string;
  invoice_number: string;
  customer_id: string;
  customer_name: string;
  title: string;
  invoice_type: string;
  amount_paise: number;
  issue_date: string;
  due_date: string;
  promised_date: string | null;
  workflow_status: WorkflowStatus;
}

interface CustomerRow {
  id: string;
  name: string;
  whatsapp_number: string | null;
  notes: string | null;
  created_at: string;
}

const INVOICE_SELECT = `
  SELECT i.id, i.invoice_number, i.customer_id, c.name AS customer_name, i.title,
         i.invoice_type, i.amount_paise, i.issue_date, i.due_date, i.promised_date,
         i.workflow_status
  FROM invoices i
  JOIN customers c ON c.id = i.customer_id AND c.workspace_id = i.workspace_id`;

/** Loads one invoice in the workspace, or throws NOT_FOUND. */
function findInvoiceRow(db: DatabaseSync, ws: string, id: string): InvoiceRow {
  const row = dbGet<InvoiceRow>(
    db,
    `${INVOICE_SELECT} WHERE i.workspace_id = ? AND i.id = ?`,
    [ws, id],
  );
  if (!row) throw notFound("Invoice not found");
  return row;
}

/** Amounts of all payments recorded against one invoice. */
function paymentAmountsFor(db: DatabaseSync, ws: string, invoiceId: string): number[] {
  return dbAll<{ amount_paise: number }>(
    db,
    "SELECT amount_paise FROM payments WHERE workspace_id = ? AND invoice_id = ?",
    [ws, invoiceId],
  ).map((r) => Number(r.amount_paise));
}

/** Builds the API shape: balances and derived status computed from payments. */
function toBalance(row: InvoiceRow, paymentAmounts: number[], today: string) {
  const paid = paymentAmounts.reduce((sum, p) => sum + p, 0);
  const outstanding = outstandingPaise(row.amount_paise, paymentAmounts);
  const status = deriveInvoiceStatus({
    workflowStatus: row.workflow_status,
    outstandingPaise: outstanding,
    paidPaise: paid,
    dueDate: row.due_date,
    today,
  });
  return {
    id: row.id,
    invoice_number: row.invoice_number,
    customer_id: row.customer_id,
    customer_name: row.customer_name,
    title: row.title,
    invoice_type: row.invoice_type,
    amount_paise: row.amount_paise,
    issue_date: row.issue_date,
    due_date: row.due_date,
    promised_date: row.promised_date,
    expected_receipt_date: expectedReceiptDate(row),
    workflow_status: row.workflow_status,
    paid_paise: paid,
    outstanding_paise: outstanding,
    status,
    days_overdue: status === "overdue" ? daysOverdue(row.due_date, today, outstanding) : 0,
  };
}

/** A promised date may not fall before the issue date. */
function checkPromisedDate(promised: string | null, issue: string): void {
  if (promised !== null && promised < issue) {
    throw businessRule("Promised date cannot be before issue date");
  }
}

function requireCustomer(db: DatabaseSync, ws: string, customerId: string): void {
  const row = dbGet<{ id: string }>(
    db,
    "SELECT id FROM customers WHERE workspace_id = ? AND id = ?",
    [ws, customerId],
  );
  if (!row) throw notFound("Customer not found");
}

function invoiceNumberTaken(db: DatabaseSync, ws: string, number: string, exceptId?: string): boolean {
  const row = dbGet<{ id: string }>(
    db,
    "SELECT id FROM invoices WHERE workspace_id = ? AND invoice_number = ? AND id != ?",
    [ws, number, exceptId ?? ""],
  );
  return row !== undefined;
}

/** Existing invoice numbers in the workspace (for UI suggestions). */
export function listInvoiceNumbers(db: DatabaseSync, ws: string): string[] {
  return dbAll<{ invoice_number: string }>(
    db,
    "SELECT invoice_number FROM invoices WHERE workspace_id = ?",
    [ws],
  ).map((r) => r.invoice_number);
}

/** Next suggested INV-### for the workspace; still unique if collisions exist. */
export function nextInvoiceNumberForWorkspace(db: DatabaseSync, ws: string): string {
  const existing = listInvoiceNumbers(db, ws);
  let candidate = suggestNextInvoiceNumber(existing);
  let guard = 0;
  while (invoiceNumberTaken(db, ws, candidate) && guard < 1000) {
    existing.push(candidate);
    candidate = suggestNextInvoiceNumber(existing);
    guard += 1;
  }
  return candidate;
}

function resolveInvoiceNumber(db: DatabaseSync, ws: string, body: Record<string, unknown>): string {
  const raw = parseOptionalString(body.invoice_number, "invoice_number", 50);
  if (raw !== null && raw.trim() !== "") {
    return raw.trim();
  }
  return nextInvoiceNumberForWorkspace(db, ws);
}

/** Whatsapp: optional; digits with optional leading +, 10-15 digits. */
function parseWhatsapp(value: unknown): string | null {
  const number = parseOptionalString(value, "whatsapp_number", 20);
  if (number === null) return null;
  if (!/^\+?\d{10,15}$/.test(number)) {
    throw validationError("whatsapp_number must be 10-15 digits, optionally starting with +", {
      field: "whatsapp_number",
    });
  }
  return number;
}

export function listCustomers(db: DatabaseSync, ws: string): CustomerRow[] {
  return dbAll<CustomerRow>(
    db,
    "SELECT id, name, whatsapp_number, notes, created_at FROM customers WHERE workspace_id = ? ORDER BY name COLLATE NOCASE",
    [ws],
  ).map((c) => ({
    id: c.id,
    name: c.name,
    whatsapp_number: c.whatsapp_number,
    notes: c.notes,
    created_at: c.created_at,
  }));
}

export function createCustomer(db: DatabaseSync, ws: string, input: unknown): CustomerRow {
  const body = requireObject(input);
  const name = parseNonEmptyString(body.name, "name", 120);
  const whatsapp = parseWhatsapp(body.whatsapp_number);
  const notes = parseOptionalString(body.notes, "notes", 1000);
  const id = randomUUID();
  const createdAt = new Date().toISOString();

  db.prepare(
    "INSERT INTO customers (id, workspace_id, name, whatsapp_number, notes, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(id, ws, name, whatsapp, notes, createdAt);

  return { id, name, whatsapp_number: whatsapp, notes, created_at: createdAt };
}

export function createInvoice(db: DatabaseSync, ws: string, input: unknown) {
  const body = requireObject(input);
  const customerId = parseNonEmptyString(body.customer_id, "customer_id", 64);
  const invoiceType = parseEnum(body.invoice_type, "invoice_type", INVOICE_TYPES);
  const amountPaise = parseMoneyRupees(body.amount, "amount");
  const issueDate = parseIsoDate(body.issue_date, "issue_date", false) ?? todayIST();
  // Required, so parseIsoDate never returns null here.
  const dueDate = parseIsoDate(body.due_date, "due_date", true) as string;
  const promisedDate = parseIsoDate(body.promised_date, "promised_date", false);
  const workflowStatus = parseEnum(body.workflow_status ?? "draft", "workflow_status", [
    "draft",
    "sent",
  ] as const);
  checkPromisedDate(promisedDate, issueDate);

  return withTransaction(db, () => {
    requireCustomer(db, ws, customerId);
    const invoiceNumber = resolveInvoiceNumber(db, ws, body);
    const title = parseOptionalString(body.title, "title", 200) ?? invoiceNumber;
    if (invoiceNumberTaken(db, ws, invoiceNumber)) {
      throw conflict(`Invoice number ${invoiceNumber} already exists`);
    }

    const id = randomUUID();
    const now = new Date().toISOString();
    // promised_date is stored separately; due_date is never overwritten by it.
    db.prepare(
      `INSERT INTO invoices (id, workspace_id, customer_id, invoice_number, title, invoice_type,
         amount_paise, issue_date, due_date, promised_date, workflow_status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      ws,
      customerId,
      invoiceNumber,
      title,
      invoiceType,
      amountPaise,
      issueDate,
      dueDate,
      promisedDate,
      workflowStatus,
      now,
      now,
    );

    return getInvoiceWithBalance(db, ws, id);
  });
}

const UPDATABLE_FIELDS = new Set([
  "customer_id",
  "invoice_number",
  "title",
  "invoice_type",
  "amount",
  "issue_date",
  "due_date",
  "promised_date",
]);

interface EditableInvoice {
  customer_id: string;
  invoice_number: string;
  title: string;
  invoice_type: string;
  amount_paise: number;
  issue_date: string;
  due_date: string;
  promised_date: string | null;
}

export function updateInvoice(db: DatabaseSync, ws: string, id: string, patch: unknown) {
  const body = requireObject(patch);
  const unknown = Object.keys(body).filter((k) => !UPDATABLE_FIELDS.has(k));
  if (unknown.length > 0) {
    throw validationError(`Unknown field(s): ${unknown.join(", ")}`, { fields: unknown });
  }
  if (Object.keys(body).length === 0) {
    throw validationError("No fields to update");
  }

  return withTransaction(db, () => {
    const current = findInvoiceRow(db, ws, id);
    const next: EditableInvoice = {
      customer_id: current.customer_id,
      invoice_number: current.invoice_number,
      title: current.title,
      invoice_type: current.invoice_type,
      amount_paise: current.amount_paise,
      issue_date: current.issue_date,
      due_date: current.due_date,
      promised_date: current.promised_date,
    };

    if ("customer_id" in body) {
      next.customer_id = parseNonEmptyString(body.customer_id, "customer_id", 64);
      requireCustomer(db, ws, next.customer_id);
    }
    if ("invoice_number" in body) {
      next.invoice_number = parseNonEmptyString(body.invoice_number, "invoice_number", 50);
      if (invoiceNumberTaken(db, ws, next.invoice_number, id)) {
        throw conflict(`Invoice number ${next.invoice_number} already exists`);
      }
    }
    if ("title" in body) {
      next.title = parseOptionalString(body.title, "title", 200) ?? next.invoice_number;
    }
    if ("invoice_type" in body) {
      next.invoice_type = parseEnum(body.invoice_type, "invoice_type", INVOICE_TYPES);
    }
    if ("amount" in body) {
      const amount = parseMoneyRupees(body.amount, "amount");
      const paid = paymentAmountsFor(db, ws, id).reduce((sum, p) => sum + p, 0);
      if (amount < paid) {
        throw businessRule(`Amount cannot be less than payments already recorded (${formatINR(paid)})`);
      }
      next.amount_paise = amount;
    }
    if ("issue_date" in body) {
      next.issue_date = parseIsoDate(body.issue_date, "issue_date", true) as string;
    }
    if ("due_date" in body) {
      next.due_date = parseIsoDate(body.due_date, "due_date", true) as string;
    }
    if ("promised_date" in body) {
      // null (or blank) clears the promised date.
      next.promised_date = parseIsoDate(body.promised_date, "promised_date", false);
    }
    // Re-check against the merged values, not just the changed field.
    checkPromisedDate(next.promised_date, next.issue_date);

    db.prepare(
      `UPDATE invoices SET customer_id = ?, invoice_number = ?, title = ?, invoice_type = ?,
         amount_paise = ?, issue_date = ?, due_date = ?, promised_date = ?, updated_at = ?
       WHERE workspace_id = ? AND id = ?`,
    ).run(
      next.customer_id,
      next.invoice_number,
      next.title,
      next.invoice_type,
      next.amount_paise,
      next.issue_date,
      next.due_date,
      next.promised_date,
      new Date().toISOString(),
      ws,
      id,
    );

    return getInvoiceWithBalance(db, ws, id);
  });
}

export function sendInvoice(db: DatabaseSync, ws: string, id: string) {
  return withTransaction(db, () => {
    const row = findInvoiceRow(db, ws, id);
    if (row.workflow_status === "sent") {
      throw conflict("Invoice already sent");
    }
    db.prepare(
      "UPDATE invoices SET workflow_status = 'sent', updated_at = ? WHERE workspace_id = ? AND id = ?",
    ).run(new Date().toISOString(), ws, id);
    return getInvoiceWithBalance(db, ws, id);
  });
}

export function getInvoiceWithBalance(db: DatabaseSync, ws: string, id: string) {
  const row = findInvoiceRow(db, ws, id);
  // Age against workspace as-of (same date forecast uses), not wall-clock today.
  return toBalance(row, paymentAmountsFor(db, ws, id), getWorkspaceAsOf(db, ws));
}

/** All invoices in the workspace with balances and their payments, by customer then invoice number. */
export function listReceivables(db: DatabaseSync, ws: string) {
  const today = getWorkspaceAsOf(db, ws);
  const rows = dbAll<InvoiceRow>(
    db,
    `${INVOICE_SELECT} WHERE i.workspace_id = ? ORDER BY c.name, i.invoice_number`,
    [ws],
  );
  const payments = dbAll<{
    invoice_id: string;
    id: string;
    amount_paise: number;
    received_on: string;
    payment_method: string;
    reference: string | null;
  }>(
    db,
    `SELECT invoice_id, id, amount_paise, received_on, payment_method, reference
     FROM payments WHERE workspace_id = ? ORDER BY received_on, created_at`,
    [ws],
  );

  const byInvoice = new Map<string, typeof payments>();
  for (const p of payments) {
    const list = byInvoice.get(p.invoice_id) ?? [];
    list.push(p);
    byInvoice.set(p.invoice_id, list);
  }

  return rows.map((row) => {
    const list = byInvoice.get(row.id) ?? [];
    return {
      ...toBalance(row, list.map((p) => Number(p.amount_paise)), today),
      payments: list.map((p) => ({
        id: p.id,
        amount_paise: Number(p.amount_paise),
        received_on: p.received_on,
        payment_method: p.payment_method,
        reference: p.reference,
      })),
    };
  });
}
