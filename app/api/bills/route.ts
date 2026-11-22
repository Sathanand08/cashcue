import { getDb } from "@/lib/db/client";
import { getDemoWorkspaceId } from "@/lib/db/workspace";
import { readJsonBody, withApi } from "@/lib/api/respond";
import { createBill, listBills } from "@/lib/services/bills";

export const dynamic = "force-dynamic";

export async function GET() {
  return withApi(() => listBills(getDb(), getDemoWorkspaceId()));
}

export async function POST(req: Request) {
  return withApi(async () => {
    const body = await readJsonBody(req);
    return createBill(getDb(), getDemoWorkspaceId(), body);
  }, 201);
}
