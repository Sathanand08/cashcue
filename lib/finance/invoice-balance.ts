import { businessRule } from "../services/errors";

/* Pure invoice balance and status rules. No database access. */

/** Promised date if set, otherwise the due date. Never mutates the input. */
export function expectedReceiptDate(invoice: { due_date: string; promised_date: string | null }): string {
  return invoice.promised_date ?? invoice.due_date;
}

/** Amount minus recorded payments, clamped at 0. Throws if payments exceed the amount (corrupt data). */
export function outstandingPaise(amountPaise: number, paymentsPaise: number[]): number {
  const paid = paymentsPaise.reduce((sum, p) => sum + p, 0);
  if (paid > amountPaise) {
    throw new Error(`Data corruption: payments (${paid}) exceed invoice amount (${amountPaise})`);
  }
  return Math.max(0, amountPaise - paid);
}

/** Validates a new payment against the remaining balance and returns what remains after it. */
export function remainingAfterPayment(
  amountPaise: number,
  existingPaymentsPaise: number[],
  newPaymentPaise: number,
): number {
  const remaining = outstandingPaise(amountPaise, existingPaymentsPaise);
  if (newPaymentPaise <= 0 || newPaymentPaise > remaining) {
    throw businessRule("Payment exceeds remaining balance");
  }
  return remaining - newPaymentPaise;
}

export type InvoiceStatus = "draft" | "sent" | "partial" | "paid" | "overdue";

/**
 * draft -> 'draft'; outstanding 0 -> 'paid'; due date before today -> 'overdue';
 * some paid -> 'partial'; otherwise 'sent'.
 */
export function deriveInvoiceStatus(input: {
  workflowStatus: "draft" | "sent";
  outstandingPaise: number;
  paidPaise: number;
  dueDate: string;
  today: string;
}): InvoiceStatus {
  if (input.workflowStatus === "draft") return "draft";
  if (input.outstandingPaise === 0) return "paid";
  if (input.dueDate < input.today) return "overdue";
  if (input.paidPaise > 0) return "partial";
  return "sent";
}

const MS_PER_DAY = 86_400_000;

/** Whole days from fromIso to toIso (to minus from), UTC arithmetic. */
export function daysBetween(fromIso: string, toIso: string): number {
  const [fy, fm, fd] = fromIso.split("-").map(Number);
  const [ty, tm, td] = toIso.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / MS_PER_DAY);
}

/** Days past due, only while money is still outstanding. */
export function daysOverdue(dueDate: string, today: string, outstanding: number): number {
  return outstanding > 0 ? Math.max(0, daysBetween(dueDate, today)) : 0;
}
