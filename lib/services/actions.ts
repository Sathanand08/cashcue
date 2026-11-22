import type { DatabaseSync } from "node:sqlite";
import type { RankedAction } from "@/lib/finance/action-ranking";
import { rankActions } from "@/lib/finance/action-ranking";
import { buildForecastInput, parseForecastDays, type ForecastHorizon } from "./forecast";

/** Returns the impact-ranked action queue for a workspace. No calculations happen here. */
export function getActionQueue(db: DatabaseSync, ws: string, days: 30 | 60 | 90 = 30): RankedAction[] {
  return rankActions(buildForecastInput(db, ws, days));
}

/** Parses the ?days= query value for the action queue. Missing means 30. */
export function parseActionDays(value: string | null): ForecastHorizon {
  if (value === null) return 30;
  return parseForecastDays(value);
}
