import { getDb } from "@/lib/db/client";
import { getDemoWorkspaceId } from "@/lib/db/workspace";
import { readJsonBody, withApi } from "@/lib/api/respond";
import { createInvoice } from "@/lib/services/invoices";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return withApi(async () => {
    const body = await readJsonBody(req);
    return createInvoice(getDb(), getDemoWorkspaceId(), body);
  }, 201);
}
