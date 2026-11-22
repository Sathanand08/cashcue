import type { DatabaseSync } from "node:sqlite";
import { notFound, validationError } from "./errors";
import { dbGet } from "./invoices";
import { parseIsoDate, parseMoneyRupees, requireObject } from "./validators";

export interface CashSettings {
  opening_cash_paise: number;
  opening_cash_as_of: string;
  minimum_cash_buffer_paise: number;
  currency: string;
  timezone: string;
}

const UPDATABLE_FIELDS = ["opening_cash", "opening_cash_as_of", "minimum_cash_buffer"];

export function getCashSettings(db: DatabaseSync, ws: string): CashSettings {
  const row = dbGet<{
    opening_cash_paise: number;
    opening_cash_as_of: string;
    minimum_cash_buffer_paise: number;
    currency: string;
    timezone: string;
  }>(
    db,
    `SELECT opening_cash_paise, opening_cash_as_of, minimum_cash_buffer_paise, currency, timezone
     FROM workspace_settings WHERE workspace_id = ?`,
    [ws],
  );
  if (!row) throw notFound("Workspace settings not found");
  return {
    opening_cash_paise: Number(row.opening_cash_paise),
    opening_cash_as_of: row.opening_cash_as_of,
    minimum_cash_buffer_paise: Number(row.minimum_cash_buffer_paise),
    currency: row.currency,
    timezone: row.timezone,
  };
}

/**
 * Business/demo "as of" date for forecast and invoice aging.
 * Always the workspace opening_cash_as_of so receivables status matches the forecast snapshot.
 * Operational defaults (payment/bill "cannot be in the future") still use todayIST().
 */
export function getWorkspaceAsOf(db: DatabaseSync, ws: string): string {
  return getCashSettings(db, ws).opening_cash_as_of;
}

/** Updates opening cash and/or buffer. Currency and timezone are not editable here. */
export function updateCashSettings(db: DatabaseSync, ws: string, input: unknown): CashSettings {
  const body = requireObject(input);
  const unknown = Object.keys(body).filter((k) => !UPDATABLE_FIELDS.includes(k));
  if (unknown.length > 0) {
    throw validationError(`Unknown field(s): ${unknown.join(", ")}`, { fields: unknown });
  }

  const sets: string[] = [];
  const params: (string | number)[] = [];
  if (body.opening_cash !== undefined) {
    sets.push("opening_cash_paise = ?");
    params.push(parseMoneyRupees(body.opening_cash, "opening_cash", { allowZero: true }));
  }
  if (body.opening_cash_as_of !== undefined) {
    sets.push("opening_cash_as_of = ?");
    params.push(parseIsoDate(body.opening_cash_as_of, "opening_cash_as_of", true) as string);
  }
  if (body.minimum_cash_buffer !== undefined) {
    sets.push("minimum_cash_buffer_paise = ?");
    params.push(parseMoneyRupees(body.minimum_cash_buffer, "minimum_cash_buffer", { allowZero: true }));
  }
  if (sets.length === 0) {
    throw validationError(
      "At least one of opening_cash, opening_cash_as_of, minimum_cash_buffer is required",
    );
  }

  getCashSettings(db, ws); // NOT_FOUND guard
  sets.push("updated_at = ?");
  params.push(new Date().toISOString());
  db.prepare(`UPDATE workspace_settings SET ${sets.join(", ")} WHERE workspace_id = ?`).run(
    ...params,
    ws,
  );
  return getCashSettings(db, ws);
}
