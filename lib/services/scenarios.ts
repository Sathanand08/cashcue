import type { DatabaseSync } from "node:sqlite";
import { runDelayScenario, type DelayScenarioResult } from "@/lib/finance/scenario-engine";
import { buildForecastInput, parseForecastDays } from "./forecast";
import { businessRule, notFound, validationError } from "./errors";
import { dbGet } from "./invoices";
import { requireObject } from "./validators";

const MAX_SCENARIO_INVOICES = 20;
const DEFAULT_SHIFT_DAYS = 15;

/** Parses invoice_ids: 1-20 unique, non-empty strings. */
function parseInvoiceIds(value: unknown): string[] {
  const invalid = () =>
    validationError("invoice_ids must be an array of 1-20 unique ids", { field: "invoice_ids" });
  if (!Array.isArray(value)) throw invalid();
  if (value.length < 1 || value.length > MAX_SCENARIO_INVOICES) throw invalid();
  const ids: string[] = [];
  for (const id of value) {
    if (typeof id !== "string" || id.trim() === "") throw invalid();
    ids.push(id);
  }
  if (new Set(ids).size !== ids.length) throw invalid();
  return ids;
}

/** Parses shift_days: optional integer 1..90, default 15. */
function parseShiftDays(value: unknown): number {
  if (value === undefined) return DEFAULT_SHIFT_DAYS;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 90) {
    throw validationError("shift_days must be an integer between 1 and 90", { field: "shift_days" });
  }
  return value;
}

/**
 * Read-only delay scenario for invoices in one workspace.
 * Performs SELECTs only; never writes and never opens a transaction.
 */
export function runWorkspaceDelayScenario(
  db: DatabaseSync,
  ws: string,
  input: unknown,
): DelayScenarioResult {
  const body = requireObject(input);
  const ids = parseInvoiceIds(body.invoice_ids);
  const shiftDays = parseShiftDays(body.shift_days);
  const days = body.days === undefined ? 30 : parseForecastDays(String(body.days));

  for (const id of ids) {
    const row = dbGet<{ id: string; invoice_number: string; workflow_status: string; amount_paise: number }>(
      db,
      "SELECT id, invoice_number, workflow_status, amount_paise FROM invoices WHERE workspace_id = ? AND id = ?",
      [ws, id],
    );
    if (!row) throw notFound("Invoice not found");
    if (row.workflow_status === "draft") {
      throw businessRule("Draft invoices cannot be included in a delay scenario");
    }
    const paid = dbGet<{ paid: number }>(
      db,
      "SELECT COALESCE(SUM(amount_paise), 0) AS paid FROM payments WHERE workspace_id = ? AND invoice_id = ?",
      [ws, id],
    );
    const outstanding = Number(row.amount_paise) - Number(paid?.paid ?? 0);
    if (outstanding <= 0) {
      throw businessRule(`Paid invoices cannot be delayed: ${row.invoice_number}`);
    }
  }

  const forecastInput = buildForecastInput(db, ws, days);
  return runDelayScenario({ ...forecastInput, invoiceIds: ids, shiftDays });
}
