/**
 * Date helpers. Dates are 'YYYY-MM-DD' strings. All arithmetic is done in UTC
 * so that the host timezone never shifts a calendar day.
 */

const IST_DATE_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Today's calendar date in Asia/Kolkata, as YYYY-MM-DD. */
export function todayIST(): string {
  const parts = IST_DATE_FORMAT.formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Adds n calendar days to an ISO date (n may be negative). */
export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const ms = Date.UTC(y, m - 1, d + n);
  return new Date(ms).toISOString().slice(0, 10);
}

/** True for YYYY-MM-DD strings that name a real calendar date. */
export function isValidIsoDate(s: unknown): boolean {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
}
