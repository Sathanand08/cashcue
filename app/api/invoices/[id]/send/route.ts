import { getDb } from "@/lib/db/client";
import { getDemoWorkspaceId } from "@/lib/db/workspace";
import { withApi } from "@/lib/api/respond";
import { sendInvoice } from "@/lib/services/invoices";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withApi(async () => {
    const { id } = await ctx.params;
    return sendInvoice(getDb(), getDemoWorkspaceId(), id);
  }, 200, { revalidateMoney: true });
}
