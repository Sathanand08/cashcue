import { getDb } from "@/lib/db/client";
import { getDemoWorkspaceId } from "@/lib/db/workspace";
import { readJsonBody, withApi } from "@/lib/api/respond";
import { getReminderDraft, updateReminderDraft } from "@/lib/services/reminders";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: RouteContext) {
  return withApi(async () => {
    const { id } = await ctx.params;
    return getReminderDraft(getDb(), getDemoWorkspaceId(), id);
  });
}

export async function PATCH(req: Request, ctx: RouteContext) {
  return withApi(async () => {
    const { id } = await ctx.params;
    const body = await readJsonBody(req);
    return updateReminderDraft(getDb(), getDemoWorkspaceId(), id, body);
  });
}
