import type { DatabaseSync } from "node:sqlite";
import {
  DEMO_RESET_CONFIRM,
  resetDemoWorkspace,
  type DemoResetResult,
} from "@/lib/db/seed";
import { validationError } from "./errors";
import { requireObject } from "./validators";

/**
 * Resets the single demo workspace after the caller confirms with the exact phrase RESET.
 */
export function resetDemo(db: DatabaseSync, input: unknown): DemoResetResult {
  const body = requireObject(input);
  const confirm = body.confirm;
  if (typeof confirm !== "string" || confirm.trim() !== DEMO_RESET_CONFIRM) {
    throw validationError(`Type ${DEMO_RESET_CONFIRM} to confirm demo reset`, {
      field: "confirm",
      expected: DEMO_RESET_CONFIRM,
    });
  }
  return resetDemoWorkspace(db);
}
