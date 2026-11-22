/**
 * Pure money helpers. Money is stored as INTEGER paise (1 rupee = 100 paise);
 * convert only at the boundary (input parsing and display).
 */

/**
 * Converts a rupee amount to integer paise.
 * Throws if the value is not finite, is negative, or has more than 2 decimals.
 */
export function rupeesToPaise(value: number): number {
  if (!Number.isFinite(value)) {
    throw new Error(`rupeesToPaise: value must be finite, got ${value}`);
  }
  if (value < 0) {
    throw new Error(`rupeesToPaise: negative amounts are not allowed, got ${value}`);
  }
  const scaled = value * 100;
  if (Math.abs(scaled - Math.round(scaled)) > 1e-6) {
    throw new Error(`rupeesToPaise: at most 2 decimal places allowed, got ${value}`);
  }
  return Math.round(scaled);
}

/** Converts integer paise to a rupee number (for display math only, never storage). */
export function paiseToRupees(paise: number): number {
  return paise / 100;
}

/**
 * Formats paise as an INR string with Indian digit grouping.
 * 8000000 -> "₹80,000"; 12000000 -> "₹1,20,000"; -50000 -> "−₹500".
 * Paise are shown only when non-zero (e.g. 12345 -> "₹123.45").
 */
export function formatINR(paise: number): string {
  const sign = paise < 0 ? "−" : "";
  const abs = Math.abs(Math.round(paise));
  const rupees = Math.floor(abs / 100);
  const fraction = abs % 100;

  const digits = String(rupees);
  let grouped: string;
  if (digits.length <= 3) {
    grouped = digits;
  } else {
    const last3 = digits.slice(-3);
    const head = digits.slice(0, -3);
    // Group the remaining digits in pairs from the right: 1,20,000 style.
    const headGrouped = head.replace(/\B(?=(\d{2})+(?!\d))/g, ",");
    grouped = `${headGrouped},${last3}`;
  }

  const suffix = fraction === 0 ? "" : `.${String(fraction).padStart(2, "0")}`;
  return `${sign}₹${grouped}${suffix}`;
}
