import { getDb } from "@/lib/db/client";
import { getDemoWorkspaceId } from "@/lib/db/workspace";
import { withApi } from "@/lib/api/respond";
import { listReceivables } from "@/lib/services/invoices";

export const dynamic = "force-dynamic";

export async function GET() {
  return withApi(() => listReceivables(getDb(), getDemoWorkspaceId()));
}
