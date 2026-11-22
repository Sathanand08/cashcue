import { getDb } from "@/lib/db/client";
import { getDemoWorkspaceId } from "@/lib/db/workspace";
import { readJsonBody, withApi } from "@/lib/api/respond";
import { recordPayment } from "@/lib/services/payments";
import { requireObject } from "@/lib/services/validators";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withApi(async () => {
    const { id } = await ctx.params;
    const raw = await readJsonBody(req);

    // Idempotency-Key header fills in idempotency_key when the body does not set one.
    const headerKey = req.headers.get("Idempotency-Key");
    const body =
      headerKey && requireObject(raw).idempotency_key == null
        ? { ...requireObject(raw), idempotency_key: headerKey }
        : raw;

    return recordPayment(getDb(), getDemoWorkspaceId(), id, body);
  }, 201, { revalidateMoney: true });
}
