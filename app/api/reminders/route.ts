import { getDb } from "@/lib/db/client";
import { getDemoWorkspaceId } from "@/lib/db/workspace";
import { readJsonBody, withApi } from "@/lib/api/respond";
import { createReminderDraft, listReminderDrafts } from "@/lib/services/reminders";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return withApi(() => {
    const invoiceId = new URL(req.url).searchParams.get("invoice_id");
    return listReminderDrafts(getDb(), getDemoWorkspaceId(), invoiceId);
  });
}

export async function POST(req: Request) {
  return withApi(async () => {
    const body = await readJsonBody(req);
    return createReminderDraft(getDb(), getDemoWorkspaceId(), body);
  }, 201);
}
