import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { withTransaction } from "@/lib/db/client";
import { remainingAfterPayment } from "@/lib/finance/invoice-balance";
import { formatINR } from "@/lib/money";
import { todayIST } from "@/lib/time";
import { businessRule, conflict } from "./errors";
import { dbAll, dbGet, getInvoiceWithBalance } from "./invoices";
import {
  parseEnum,
  parseIsoDate,
  parseMoneyRupees,
  parseOptionalString,
  requireObject,
} from "./validators";

export const PAYMENT_METHODS = ["UPI", "Bank transfer", "Cash", "Cheque", "Other"] as const;

export interface PaymentRecord {
  id: string;
  invoice_id: string;
  amount_paise: number;
  received_on: string;
  payment_method: string;
  reference: string | null;
  idempotency_key: string | null;
  created_at: string;
}

const PAYMENT_COLUMNS =
  "id, invoice_id, amount_paise, received_on, payment_method, reference, idempotency_key, created_at";

function toPaymentRecord(p: PaymentRecord): PaymentRecord {
  return {
    id: p.id,
    invoice_id: p.invoice_id,
    amount_paise: Number(p.amount_paise),
    received_on: p.received_on,
    payment_method: p.payment_method,
    reference: p.reference,
    idempotency_key: p.idempotency_key,
    created_at: p.created_at,
  };
}

export function listPaymentsForInvoice(
  db: DatabaseSync,
  ws: string,
  invoiceId: string,
): PaymentRecord[] {
  return dbAll<PaymentRecord>(
    db,
    `SELECT ${PAYMENT_COLUMNS} FROM payments
     WHERE workspace_id = ? AND invoice_id = ? ORDER BY received_on, created_at`,
    [ws, invoiceId],
  ).map(toPaymentRecord);
}

/**
 * Records a payment against an invoice and the matching cash inflow, atomically.
 * With an idempotency_key, a replay returns the original payment and changes nothing.
 */
export function recordPayment(db: DatabaseSync, ws: string, invoiceId: string, input: unknown) {
  const body = requireObject(input);
  const idempotencyKey = parseOptionalString(body.idempotency_key, "idempotency_key", 100);

  return withTransaction(db, () => {
    // Idempotent replay: return the original payment, write nothing.
    if (idempotencyKey !== null) {
      const existing = dbGet<PaymentRecord>(
        db,
        `SELECT ${PAYMENT_COLUMNS} FROM payments WHERE workspace_id = ? AND idempotency_key = ?`,
        [ws, idempotencyKey],
      );
      if (existing) {
        if (existing.invoice_id !== invoiceId) {
          throw conflict("Idempotency-Key was already used for a different invoice");
        }
        return {
          payment: toPaymentRecord(existing),
          invoice: getInvoiceWithBalance(db, ws, invoiceId),
        };
      }
    }

    // Loads the invoice in this workspace (NOT_FOUND if missing).
    const invoice = getInvoiceWithBalance(db, ws, invoiceId);
    if (invoice.workflow_status === "draft") {
      throw businessRule("Cannot record a payment against a draft invoice");
    }

    const amountPaise = parseMoneyRupees(body.amount, "amount");
    const today = todayIST();
    const receivedOn = parseIsoDate(body.received_on, "received_on", false) ?? today;
    // Future-dated receipts are not allowed.
    if (receivedOn > today) {
      throw businessRule("Payment date cannot be in the future");
    }
    const method = parseEnum(body.payment_method, "payment_method", PAYMENT_METHODS);
    const reference = parseOptionalString(body.reference, "reference", 100);

    // Reject overpayment against the remaining balance.
    const existingAmounts = listPaymentsForInvoice(db, ws, invoiceId).map((p) => p.amount_paise);
    try {
      remainingAfterPayment(invoice.amount_paise, existingAmounts, amountPaise);
    } catch {
      throw businessRule(
        `Payment exceeds remaining balance of ${formatINR(invoice.outstanding_paise)}`,
      );
    }

    const paymentId = randomUUID();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO payments (id, workspace_id, invoice_id, amount_paise, received_on,
         payment_method, reference, idempotency_key, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      paymentId,
      ws,
      invoiceId,
      amountPaise,
      receivedOn,
      method,
      reference,
      idempotencyKey,
      now,
    );

    // Matching cash inflow, dated by when the money was received.
    db.prepare(
      `INSERT INTO cash_transactions (id, workspace_id, direction, amount_paise, occurred_on,
         source_type, source_id, note, created_at)
       VALUES (?, ?, 'inflow', ?, ?, 'payment', ?, ?, ?)`,
    ).run(
      randomUUID(),
      ws,
      amountPaise,
      receivedOn,
      paymentId,
      `Payment for ${invoice.invoice_number}`,
      now,
    );

    return {
      payment: toPaymentRecord({
        id: paymentId,
        invoice_id: invoiceId,
        amount_paise: amountPaise,
        received_on: receivedOn,
        payment_method: method,
        reference,
        idempotency_key: idempotencyKey,
        created_at: now,
      }),
      invoice: getInvoiceWithBalance(db, ws, invoiceId),
    };
  });
}
