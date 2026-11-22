import type { DatabaseSync } from "node:sqlite";
import { todayIST } from "@/lib/time";
import { notFound } from "./errors";
import { dbGet } from "./invoices";
import { getCashSettings, getWorkspaceAsOf } from "./cash";

/**
 * Small startup payload: workspace, cash settings, business as-of date, and record counts.
 * `today` / `as_of` are the workspace opening_cash_as_of (aligned with forecast + aging).
 * `calendar_today` is wall-clock IST for operational UI if needed.
 */
export function getBootstrap(db: DatabaseSync, ws: string) {
  const workspace = dbGet<{ id: string; name: string }>(
    db,
    "SELECT id, name FROM workspaces WHERE id = ?",
    [ws],
  );
  if (!workspace) throw notFound("Workspace not found");

  const customers = dbGet<{ n: number }>(
    db,
    "SELECT COUNT(*) AS n FROM customers WHERE workspace_id = ?",
    [ws],
  );
  const invoices = dbGet<{ n: number }>(
    db,
    "SELECT COUNT(*) AS n FROM invoices WHERE workspace_id = ?",
    [ws],
  );

  const asOf = getWorkspaceAsOf(db, ws);
  return {
    workspace: { id: workspace.id, name: workspace.name },
    settings: getCashSettings(db, ws),
    today: asOf,
    as_of: asOf,
    calendar_today: todayIST(),
    counts: {
      customers: Number(customers?.n ?? 0),
      invoices: Number(invoices?.n ?? 0),
    },
  };
}
