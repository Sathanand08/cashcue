import { getDb } from "@/lib/db/client";
import { getDemoWorkspaceId } from "@/lib/db/workspace";
import { withApi, readJsonBody } from "@/lib/api/respond";
import { runWorkspaceDelayScenario } from "@/lib/services/scenarios";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return withApi(async () => {
    const body = await readJsonBody(req);
    return runWorkspaceDelayScenario(getDb(), getDemoWorkspaceId(), body);
  });
}
