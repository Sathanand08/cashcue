import { getDb } from "@/lib/db/client";
import { getDemoWorkspaceId } from "@/lib/db/workspace";
import { withApi } from "@/lib/api/respond";
import { validationError } from "@/lib/services/errors";
import { payBill } from "@/lib/services/bills";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withApi(async () => {
    const { id } = await ctx.params;
    const text = await req.text();
    let body: unknown = {};
    if (text.trim() !== "") {
      try {
        body = JSON.parse(text);
      } catch {
        throw validationError("Request body must be valid JSON");
      }
    }
    return payBill(getDb(), getDemoWorkspaceId(), id, body);
  }, 201);
}
