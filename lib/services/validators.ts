import { isValidIsoDate } from "@/lib/time";
import { AppError, validationError } from "./errors";

const MAX_RUPEES = 100_000_000;

/** Narrows an unknown body to a plain object, or throws VALIDATION_ERROR. */
export function requireObject(value: unknown, what = "Request body"): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw validationError(`${what} must be a JSON object`);
  }
  return value as Record<string, unknown>;
}

/**
 * Parses a rupee amount (number or numeric string) into integer paise.
 * Must be finite, > 0 (or >= 0 with allowZero), at most 2 decimals, <= 1 crore.
 */
export function parseMoneyRupees(
  value: unknown,
  field: string,
  options: { allowZero?: boolean } = {},
): number {
  let rupees: number;
  if (typeof value === "number") {
    rupees = value;
  } else if (typeof value === "string" && /^[+-]?(\d+\.?\d*|\.\d+)$/.test(value.trim())) {
    rupees = Number(value.trim());
  } else {
    throw validationError(`${field} must be a number`, { field });
  }

  if (!Number.isFinite(rupees)) {
    throw validationError(`${field} must be a finite number`, { field });
  }
  const minOk = options.allowZero ? rupees >= 0 : rupees > 0;
  if (!minOk) {
    throw validationError(
      options.allowZero ? `${field} must not be negative` : `${field} must be greater than zero`,
      { field },
    );
  }
  if (rupees > MAX_RUPEES) {
    throw validationError(`${field} must be at most ${MAX_RUPEES}`, { field });
  }
  const scaled = rupees * 100;
  if (Math.abs(scaled - Math.round(scaled)) > 1e-6) {
    throw validationError(`${field} may have at most 2 decimal places`, { field });
  }
  return Math.round(scaled);
}

/**
 * Parses an ISO date. Returns null when optional and absent (null, undefined or "").
 */
export function parseIsoDate(value: unknown, field: string, required: boolean): string | null {
  if (value === undefined || value === null || value === "") {
    if (required) throw validationError(`${field} is required`, { field });
    return null;
  }
  if (!isValidIsoDate(value)) {
    throw validationError(`${field} must be a valid date (YYYY-MM-DD)`, { field });
  }
  return value as string;
}

/** Trimmed, non-empty string up to maxLen characters. */
export function parseNonEmptyString(value: unknown, field: string, maxLen: number): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw validationError(`${field} is required`, { field });
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLen) {
    throw validationError(`${field} must be at most ${maxLen} characters`, { field });
  }
  return trimmed;
}

/** Optional string: null when absent/blank, otherwise trimmed and length-checked. */
export function parseOptionalString(value: unknown, field: string, maxLen: number): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    throw validationError(`${field} must be a string`, { field });
  }
  const trimmed = value.trim();
  if (trimmed === "") return null;
  if (trimmed.length > maxLen) {
    throw validationError(`${field} must be at most ${maxLen} characters`, { field });
  }
  return trimmed;
}

/** Value must be one of the allowed options. */
export function parseEnum<T extends string>(
  value: unknown,
  field: string,
  allowed: readonly T[],
): T {
  if (typeof value === "string" && (allowed as readonly string[]).includes(value)) {
    return value as T;
  }
  throw validationError(`${field} must be one of: ${allowed.join(", ")}`, { field });
}

export { AppError };
