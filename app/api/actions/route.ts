import { getDb } from "@/lib/db/client";
import { getDemoWorkspaceId } from "@/lib/db/workspace";
import { withApi } from "@/lib/api/respond";
import { getActionQueue, parseActionDays } from "@/lib/services/actions";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return withApi(() => {
    const days = parseActionDays(new URL(req.url).searchParams.get("days"));
    return getActionQueue(getDb(), getDemoWorkspaceId(), days);
  });
}
