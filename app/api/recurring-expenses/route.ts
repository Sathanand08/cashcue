import { getDb } from "@/lib/db/client";
import { getDemoWorkspaceId } from "@/lib/db/workspace";
import { readJsonBody, withApi } from "@/lib/api/respond";
import {
  createRecurringExpense,
  listRecurringExpenses,
} from "@/lib/services/recurring";

export const dynamic = "force-dynamic";

export async function GET() {
  return withApi(() => listRecurringExpenses(getDb(), getDemoWorkspaceId()));
}

export async function POST(req: Request) {
  return withApi(async () => {
    const body = await readJsonBody(req);
    return createRecurringExpense(getDb(), getDemoWorkspaceId(), body);
  }, 201);
}
