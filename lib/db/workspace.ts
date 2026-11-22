import { getDb } from "./client";
import { seedDemoWorkspace } from "./seed";

/**
 * Returns the demo workspace id, seeding it on first use.
 *
 * There is no auth provider; the demo workspace is the only workspace.
 * All repositories accept workspaceId explicitly.
 */
export function getDemoWorkspaceId(): string {
  return seedDemoWorkspace(getDb());
}
