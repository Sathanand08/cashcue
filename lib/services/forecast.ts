import type { DatabaseSync } from "node:sqlite";
import { getCashSettings } from "./cash";
import { validationError } from "./errors";
import { dbAll } from "./invoices";
import type { ForecastInput, ForecastOutput } from "@/lib/finance/forecast-engine";
import { runForecast } from "@/lib/finance/forecast-engine";

export const FORECAST_HORIZONS = [30, 60, 90] as const;
export type ForecastHorizon = (typeof FORECAST_HORIZONS)[number];

interface InvoiceForecastRow {
  id: string;
  invoice_number: string;
  customer_name: string;
  amount_paise: number;
  due_date: string;
  promised_date: string | null;
  workflow_status: "draft" | "sent";
  paid_paise: number;
}

interface CashTransactionRow {
  direction: "inflow" | "outflow" | "adjustment";
  amount_paise: number;
  occurred_on: string;
}

interface OutflowRow {
  id: string;
  title: string;
  due_date: string;
  amount_paise: number;
  status: "scheduled" | "paid" | "cancelled";
  source_type: "one_time" | "recurring";
  recurring_expense_id: string | null;
}

interface RecurringRuleRow {
  id: string;
  title: string;
  amount_paise: number;
  frequency: "weekly" | "monthly" | "quarterly";
  interval_count: number;
  next_due_date: string;
  active: number;
}

/** Loads and maps the raw rows the forecast engine needs. Computes no financial values. */
export function buildForecastInput(db: DatabaseSync, ws: string, horizonDays: number): ForecastInput {
  if (!(FORECAST_HORIZONS as readonly number[]).includes(horizonDays)) {
    throw validationError("days must be 30, 60 or 90", { field: "days" });
  }

  const settings = getCashSettings(db, ws);

  const invoices = dbAll<InvoiceForecastRow>(
    db,
    `SELECT i.id, i.invoice_number, c.name AS customer_name, i.amount_paise, i.due_date,
            i.promised_date, i.workflow_status,
            (SELECT COALESCE(SUM(p.amount_paise), 0) FROM payments p
              WHERE p.workspace_id = i.workspace_id AND p.invoice_id = i.id) AS paid_paise
     FROM invoices i
     JOIN customers c ON c.id = i.customer_id AND c.workspace_id = i.workspace_id
     WHERE i.workspace_id = ?`,
    [ws],
  );

  const cashTransactions = dbAll<CashTransactionRow>(
    db,
    "SELECT direction, amount_paise, occurred_on FROM cash_transactions WHERE workspace_id = ?",
    [ws],
  );

  const outflows = dbAll<OutflowRow>(
    db,
    `SELECT id, title, due_date, amount_paise, status, source_type, recurring_expense_id
     FROM scheduled_outflows WHERE workspace_id = ?`,
    [ws],
  );

  const recurringRules = dbAll<RecurringRuleRow>(
    db,
    `SELECT id, title, amount_paise, frequency, interval_count, next_due_date, active
     FROM recurring_expenses WHERE workspace_id = ?`,
    [ws],
  );

  return {
    asOf: settings.opening_cash_as_of,
    horizonDays,
    openingCashPaise: settings.opening_cash_paise,
    openingCashAsOf: settings.opening_cash_as_of,
    bufferPaise: settings.minimum_cash_buffer_paise,
    cashTransactions: cashTransactions.map((t) => ({
      direction: t.direction,
      amountPaise: Number(t.amount_paise),
      occurredOn: t.occurred_on,
    })),
    invoices: invoices.map((i) => ({
      id: i.id,
      invoiceNumber: i.invoice_number,
      customerName: i.customer_name,
      amountPaise: Number(i.amount_paise),
      paidPaise: Number(i.paid_paise),
      dueDate: i.due_date,
      promisedDate: i.promised_date ?? null,
      workflowStatus: i.workflow_status,
    })),
    outflows: outflows.map((o) => ({
      id: o.id,
      title: o.title,
      dueDate: o.due_date,
      amountPaise: Number(o.amount_paise),
      status: o.status,
      sourceType: o.source_type,
      recurringExpenseId: o.recurring_expense_id ?? null,
    })),
    recurringRules: recurringRules.map((r) => ({
      id: r.id,
      title: r.title,
      amountPaise: Number(r.amount_paise),
      frequency: r.frequency,
      intervalCount: Number(r.interval_count),
      anchorDate: r.next_due_date,
      active: r.active === 1,
    })),
  };
}

export function getForecast(db: DatabaseSync, ws: string, horizonDays: number): ForecastOutput {
  return runForecast(buildForecastInput(db, ws, horizonDays));
}

/** Parses the ?days= query value. Only "30", "60" and "90" are accepted. */
export function parseForecastDays(value: string | null): ForecastHorizon {
  if (value === "30") return 30;
  if (value === "60") return 60;
  if (value === "90") return 90;
  throw validationError("days must be 30, 60 or 90", { field: "days" });
}
