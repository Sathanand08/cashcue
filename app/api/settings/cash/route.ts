import { getDb } from "@/lib/db/client";
import { getDemoWorkspaceId } from "@/lib/db/workspace";
import { readJsonBody, withApi } from "@/lib/api/respond";
import { getCashSettings, updateCashSettings } from "@/lib/services/cash";

export const dynamic = "force-dynamic";

export async function GET() {
  return withApi(() => getCashSettings(getDb(), getDemoWorkspaceId()));
}

export async function PATCH(req: Request) {
  return withApi(
    async () => {
      const body = await readJsonBody(req);
      return updateCashSettings(getDb(), getDemoWorkspaceId(), body);
    },
    200,
    { revalidateMoney: true },
  );
}
