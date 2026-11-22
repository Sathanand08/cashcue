/**
 * Suggests the next invoice number from existing labels.
 * Prefers INV-### sequences (case-insensitive); pads to at least 3 digits.
 * Falls back to INV-001 when none match.
 */
export function suggestNextInvoiceNumber(existingNumbers: string[]): string {
  let max = 0;
  for (const raw of existingNumbers) {
    const m = /^INV-(\d+)$/i.exec(raw.trim());
    if (!m) continue;
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > max) max = n;
  }
  const next = max + 1;
  const width = Math.max(3, String(max).length, String(next).length);
  return `INV-${String(next).padStart(width, "0")}`;
}
