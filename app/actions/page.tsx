import { ActionsClient } from "@/components/ActionsClient";
import { HorizonPills } from "@/components/ui/HorizonPills";
import { Num } from "@/components/ui/Money";
import { PageHeader } from "@/components/ui/PageHeader";
import { getDb } from "@/lib/db/client";
import { getDemoWorkspaceId } from "@/lib/db/workspace";
import { getActionQueue } from "@/lib/services/actions";
import { getBootstrap } from "@/lib/services/bootstrap";
import { type ForecastHorizon } from "@/lib/services/forecast";
import { listReminderDrafts } from "@/lib/services/reminders";

export const dynamic = "force-dynamic";

function parseDays(raw: string | string[] | undefined): ForecastHorizon {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === "60") return 60;
  if (value === "90") return 90;
  return 30;
}

export default async function ActionsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string | string[] }>;
}) {
  const params = await searchParams;
  const days = parseDays(params.days);
  const db = getDb();
  const ws = getDemoWorkspaceId();
  const boot = getBootstrap(db, ws);
  const actions = getActionQueue(db, ws, days);
  const drafts = listReminderDrafts(db, ws);

  return (
    <section className="space-y-8">
      <PageHeader
        eyebrow="Today's Actions"
        title="Impact-ranked follow-ups"
        description={
          <>
            Who to chase first for {boot.workspace.name} as of{" "}
            <Num className="text-cc-ink">{boot.as_of}</Num>. Ranked by buffer impact if payment slips —
            then draft a WhatsApp reminder (nothing is sent automatically).
          </>
        }
      >
        <HorizonPills basePath="/actions" active={days} ariaLabel="Action horizon" />
      </PageHeader>

      <ActionsClient actions={actions} drafts={drafts} />
    </section>
  );
}
