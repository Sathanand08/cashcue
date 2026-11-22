import { getDb } from "@/lib/db/client";
import { readJsonBody, withApi } from "@/lib/api/respond";
import { resetDemo } from "@/lib/services/demo";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return withApi(
    async () => {
      const body = await readJsonBody(req);
      return resetDemo(getDb(), body);
    },
    200,
    { revalidateMoney: true },
  );
}
