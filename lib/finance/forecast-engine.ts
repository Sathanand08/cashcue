import { formatINR } from "../money";
import { analyseBuffer } from "./buffer-analysis";
import { daysBetween } from "./invoice-balance";
import { expandOccurrences } from "./recurring-expenses";

export const FORECAST_ASSUMPTION =
  "Same-day cash events: scheduled outflows are applied before expected receipts on the same date. Forecasts are estimates from user-entered data and are not tax, accounting or financial advice.";

export type ForecastInput = {
  asOf: string;
  horizonDays: number;
  openingCashPaise: number;
  openingCashAsOf: string;
  bufferPaise: number;
  cashTransactions: {
    direction: "inflow" | "outflow" | "adjustment";
    amountPaise: number;
    occurredOn: string;
  }[];
  invoices: {
    id: string;
    invoiceNumber: string;
    customerName: string;
    amountPaise: number;
    paidPaise: number;
    dueDate: string;
    promisedDate: string | null;
    workflowStatus: "draft" | "sent";
  }[];
  outflows: {
    id: string;
    title: string;
    dueDate: string;
    amountPaise: number;
    status: "scheduled" | "paid" | "cancelled";
    sourceType: "one_time" | "recurring";
    recurringExpenseId: string | null;
  }[];
  recurringRules: {
    id: string;
    title: string;
    amountPaise: number;
    frequency: "weekly" | "monthly" | "quarterly";
    intervalCount: number;
    anchorDate: string;
    active: boolean;
  }[];
  scenario?: { shiftInvoiceIds: string[]; shiftDays: number };
};

export interface ForecastEvent {
  type: "receipt" | "bill";
  date: string;
  label: string;
  amountPaise: number;
  invoiceId?: string;
  outflowId?: string;
}

export interface ForecastPoint {
  date: string;
  balancePaise: number;
  outflowsPaise: number;
  receiptsPaise: number;
  events: ForecastEvent[];
}

export interface ThreatenedBill {
  outflowId: string | null;
  title: string;
  dueDate: string;
  amountPaise: number;
  balanceBeforePaise: number;
  balanceAfterPaise: number;
  bufferGapPaise: number;
  reason: string;
}

export interface OverdueReceivable {
  invoiceId: string;
  invoiceNumber: string;
  customerName: string;
  outstandingPaise: number;
  daysOverdue: number;
}

export interface ForecastOutput {
  assumption: string;
  cashNowPaise: number;
  bufferPaise: number;
  series: ForecastPoint[];
  minBalancePaise: number;
  minBalanceDate: string | null;
  firstBreachDate: string | null;
  maxGapPaise: number;
  maxGapDate: string | null;
  receiptsInPeriodPaise: number;
  outflowsInPeriodPaise: number;
  threatenedBills: ThreatenedBill[];
  overdueReceivables: OverdueReceivable[];
}

/** Adds whole days to a 'YYYY-MM-DD' string using UTC arithmetic only. */
export function addDaysUtc(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d + days);
  return new Date(t).toISOString().slice(0, 10);
}

interface BillItem {
  id: string;
  title: string;
  dueDate: string;
  date: string;
  amountPaise: number;
}

interface ReceiptItem {
  invoiceId: string;
  label: string;
  date: string;
  amountPaise: number;
}

function compareBills(a: BillItem, b: BillItem): number {
  if (a.amountPaise !== b.amountPaise) return b.amountPaise - a.amountPaise;
  if (a.title < b.title) return -1;
  if (a.title > b.title) return 1;
  return 0;
}

/**
 * Builds a daily cash forecast. Pure: never mutates input.
 * Same-day rule: bills are applied before receipts on the same date.
 */
export function runForecast(input: ForecastInput): ForecastOutput {
  const {
    asOf,
    horizonDays,
    openingCashPaise,
    openingCashAsOf,
    bufferPaise,
    cashTransactions,
    invoices,
    outflows,
    recurringRules,
    scenario,
  } = input;

  const horizonEnd = addDaysUtc(asOf, horizonDays);
  const inHorizon = (d: string) => d >= asOf && d <= horizonEnd;

  // Cash now: opening balance plus/minus transactions dated on or after the opening-cash date.
  // 'adjustment' transactions are ignored for now.
  let cashNow = openingCashPaise;
  for (const t of cashTransactions) {
    if (t.occurredOn < openingCashAsOf) continue;
    if (t.direction === "inflow") cashNow += t.amountPaise;
    else if (t.direction === "outflow") cashNow -= t.amountPaise;
  }

  const bills: BillItem[] = [];
  const receipts: ReceiptItem[] = [];
  const overdueReceivables: OverdueReceivable[] = [];
  const shiftIds = scenario?.shiftInvoiceIds ?? [];
  const shiftDays = scenario?.shiftDays ?? 0;

  // Receivables.
  for (const inv of invoices) {
    if (inv.workflowStatus === "draft") continue;
    const outstanding = inv.amountPaise - inv.paidPaise;
    if (outstanding <= 0) continue;

    const effectiveDate = inv.promisedDate ?? inv.dueDate;

    if (effectiveDate < asOf) {
      // Overdue: never scheduled, never shifted.
      overdueReceivables.push({
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        customerName: inv.customerName,
        outstandingPaise: outstanding,
        daysOverdue: daysBetween(effectiveDate, asOf),
      });
      continue;
    }

    let date = effectiveDate;
    if (shiftIds.includes(inv.id)) {
      date = addDaysUtc(effectiveDate > asOf ? effectiveDate : asOf, shiftDays);
    }

    if (inHorizon(date)) {
      receipts.push({
        invoiceId: inv.id,
        label: `Receipt: ${inv.customerName} ${inv.invoiceNumber}`,
        date,
        amountPaise: outstanding,
      });
    }
  }

  // One-time outflows (scheduled only).
  for (const o of outflows) {
    if (o.sourceType !== "one_time") continue;
    if (o.status !== "scheduled") continue;
    if (o.dueDate < asOf) {
      bills.push({
        id: o.id,
        title: `${o.title} (overdue)`,
        dueDate: o.dueDate,
        date: asOf,
        amountPaise: o.amountPaise,
      });
    } else if (inHorizon(o.dueDate)) {
      bills.push({
        id: o.id,
        title: o.title,
        dueDate: o.dueDate,
        date: o.dueDate,
        amountPaise: o.amountPaise,
      });
    }
  }

  // Recurring occurrences. Occurrences before asOf are assumed settled outside the app.
  for (const rule of recurringRules) {
    if (!rule.active) continue;
    const dates = expandOccurrences(
      { anchorDate: rule.anchorDate, frequency: rule.frequency, intervalCount: rule.intervalCount },
      asOf,
      horizonEnd,
    );
    for (const date of dates) {
      if (!inHorizon(date)) continue;
      const row = outflows.find(
        (o) => o.recurringExpenseId === rule.id && o.dueDate === date,
      );
      if (row) {
        if (row.status !== "scheduled") continue; // paid or cancelled
        bills.push({
          id: `rec:${rule.id}:${date}`,
          title: row.title,
          dueDate: date,
          date,
          amountPaise: row.amountPaise,
        });
      } else {
        bills.push({
          id: `rec:${rule.id}:${date}`,
          title: rule.title,
          dueDate: date,
          date,
          amountPaise: rule.amountPaise,
        });
      }
    }
  }

  // Index by date.
  const billsByDate = new Map<string, BillItem[]>();
  for (const b of bills) {
    const list = billsByDate.get(b.date) ?? [];
    list.push(b);
    billsByDate.set(b.date, list);
  }
  const receiptsByDate = new Map<string, ReceiptItem[]>();
  for (const r of receipts) {
    const list = receiptsByDate.get(r.date) ?? [];
    list.push(r);
    receiptsByDate.set(r.date, list);
  }

  // Daily series.
  const series: ForecastPoint[] = [];
  const threatenedBills: ThreatenedBill[] = [];
  let running = cashNow;
  let receiptsInPeriod = 0;
  let outflowsInPeriod = 0;

  for (let i = 0; i <= horizonDays; i++) {
    const date = addDaysUtc(asOf, i);
    const dayBills = (billsByDate.get(date) ?? []).slice().sort(compareBills);
    const dayReceipts = receiptsByDate.get(date) ?? [];
    const events: ForecastEvent[] = [];
    let outflowsPaise = 0;
    let receiptsPaise = 0;

    // Bills first (same-day rule).
    for (const b of dayBills) {
      const balanceBefore = running;
      running -= b.amountPaise;
      outflowsPaise += b.amountPaise;
      outflowsInPeriod += b.amountPaise;
      events.push({
        type: "bill",
        date,
        label: b.title,
        amountPaise: b.amountPaise,
        outflowId: b.id,
      });
      if (running < bufferPaise) {
        const gap = bufferPaise - running;
        threatenedBills.push({
          outflowId: b.id,
          title: b.title,
          dueDate: b.dueDate,
          amountPaise: b.amountPaise,
          balanceBeforePaise: balanceBefore,
          balanceAfterPaise: running,
          bufferGapPaise: gap,
          reason: `${b.title} is due on ${b.dueDate}. Projected cash falls to ${formatINR(running)} after it, ${formatINR(gap)} below the ${formatINR(bufferPaise)} buffer.`,
        });
      }
    }

    // Receipts after bills.
    for (const r of dayReceipts) {
      running += r.amountPaise;
      receiptsPaise += r.amountPaise;
      receiptsInPeriod += r.amountPaise;
      events.push({
        type: "receipt",
        date,
        label: r.label,
        amountPaise: r.amountPaise,
        invoiceId: r.invoiceId,
      });
    }

    series.push({
      date,
      balancePaise: running,
      outflowsPaise,
      receiptsPaise,
      events,
    });
  }

  const stats = analyseBuffer(
    series.map((p) => ({ date: p.date, balancePaise: p.balancePaise })),
    bufferPaise,
  );

  return {
    assumption: FORECAST_ASSUMPTION,
    cashNowPaise: cashNow,
    bufferPaise,
    series,
    minBalancePaise: stats.minBalancePaise,
    minBalanceDate: stats.minBalanceDate,
    firstBreachDate: stats.firstBreachDate,
    maxGapPaise: stats.maxGapPaise,
    maxGapDate: stats.maxGapDate,
    receiptsInPeriodPaise: receiptsInPeriod,
    outflowsInPeriodPaise: outflowsInPeriod,
    threatenedBills,
    overdueReceivables,
  };
}
