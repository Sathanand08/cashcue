import { getDb } from "@/lib/db/client";
import { getDemoWorkspaceId } from "@/lib/db/workspace";
import { readJsonBody, withApi } from "@/lib/api/respond";
import { payRecurringOccurrence } from "@/lib/services/recurring";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withApi(async () => {
    const { id } = await ctx.params;
    const body = await readJsonBody(req);
    return payRecurringOccurrence(getDb(), getDemoWorkspaceId(), id, body);
  }, 201);
}
