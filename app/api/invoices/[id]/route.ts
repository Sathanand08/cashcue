import { getDb } from "@/lib/db/client";
import { getDemoWorkspaceId } from "@/lib/db/workspace";
import { readJsonBody, withApi } from "@/lib/api/respond";
import { getInvoiceWithBalance, updateInvoice } from "@/lib/services/invoices";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, ctx: RouteContext) {
  return withApi(async () => {
    const { id } = await ctx.params;
    return getInvoiceWithBalance(getDb(), getDemoWorkspaceId(), id);
  });
}

export async function PATCH(req: Request, ctx: RouteContext) {
  return withApi(
    async () => {
      const { id } = await ctx.params;
      const body = await readJsonBody(req);
      return updateInvoice(getDb(), getDemoWorkspaceId(), id, body);
    },
    200,
    { revalidateMoney: true },
  );
}
