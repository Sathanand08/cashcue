/**
 * Pure recurrence expansion for recurring expenses. No database access.
 * All arithmetic is UTC. Monthly and quarterly occurrences are computed from the
 * anchor (never cumulatively) and clamped to the last day of the target month.
 */

export type RecurrenceFrequency = "weekly" | "monthly" | "quarterly";

export interface RecurrenceRule {
  anchorDate: string;
  frequency: RecurrenceFrequency;
  intervalCount: number;
}

const MS_PER_DAY = 86_400_000;

function parseIso(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m, d };
}

function formatIso(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Last day of a 1-based month, UTC. */
function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function daysBetweenUtc(fromIso: string, toIso: string): number {
  const a = parseIso(fromIso);
  const b = parseIso(toIso);
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / MS_PER_DAY);
}

/**
 * Returns every due date of the rule that falls within [fromIso, toIso], inclusive,
 * in ascending order. Returns [] when toIso is before fromIso.
 */
export function expandOccurrences(rule: RecurrenceRule, fromIso: string, toIso: string): string[] {
  if (toIso < fromIso) return [];
  const step = Math.max(1, Math.floor(rule.intervalCount));
  const anchor = parseIso(rule.anchorDate);
  const out: string[] = [];

  if (rule.frequency === "weekly") {
    const stepDays = 7 * step;
    // Start a little before the window so the first in-range occurrence is never missed.
    const kStart = Math.max(0, Math.floor(daysBetweenUtc(rule.anchorDate, fromIso) / stepDays) - 1);
    for (let k = kStart; ; k++) {
      const date = new Date(Date.UTC(anchor.y, anchor.m - 1, anchor.d + stepDays * k))
        .toISOString()
        .slice(0, 10);
      if (date > toIso) break;
      if (date >= fromIso) out.push(date);
    }
    return out;
  }

  // Monthly (step 1) or quarterly (step 3), each multiplied by intervalCount.
  const monthsStep = (rule.frequency === "quarterly" ? 3 : 1) * step;
  const anchorMonthIndex = anchor.y * 12 + (anchor.m - 1);
  const from = parseIso(fromIso);
  const fromMonthIndex = from.y * 12 + (from.m - 1);
  const kStart = Math.max(0, Math.floor((fromMonthIndex - anchorMonthIndex) / monthsStep) - 1);

  for (let k = kStart; ; k++) {
    const monthIndex = anchorMonthIndex + monthsStep * k;
    const y = Math.floor(monthIndex / 12);
    const m = (monthIndex % 12) + 1;
    const d = Math.min(anchor.d, daysInMonth(y, m));
    const date = formatIso(y, m, d);
    if (date > toIso) break;
    if (date >= fromIso) out.push(date);
  }
  return out;
}
