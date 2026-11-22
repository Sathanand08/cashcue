import { getDb } from "@/lib/db/client";
import { getDemoWorkspaceId } from "@/lib/db/workspace";
import { withApi } from "@/lib/api/respond";
import { getForecast, parseForecastDays } from "@/lib/services/forecast";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return withApi(() => {
    const days = parseForecastDays(new URL(req.url).searchParams.get("days"));
    return getForecast(getDb(), getDemoWorkspaceId(), days);
  });
}
