import { getDb } from "@/lib/db/client";
import { getDemoWorkspaceId } from "@/lib/db/workspace";
import { withApi } from "@/lib/api/respond";
import { getBootstrap } from "@/lib/services/bootstrap";

export const dynamic = "force-dynamic";

export async function GET() {
  return withApi(() => getBootstrap(getDb(), getDemoWorkspaceId()));
}
