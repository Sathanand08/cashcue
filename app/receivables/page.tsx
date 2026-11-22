import { ReceivablesClient } from "@/components/ReceivablesClient";
import { Money, Num } from "@/components/ui/Money";
import { PageHeader } from "@/components/ui/PageHeader";
import { getDb } from "@/lib/db/client";
import { getDemoWorkspaceId } from "@/lib/db/workspace";
import { getBootstrap } from "@/lib/services/bootstrap";
import { listReceivables } from "@/lib/services/invoices";
import { todayIST } from "@/lib/time";

export const dynamic = "force-dynamic";

export default function ReceivablesPage() {
  const db = getDb();
  const ws = getDemoWorkspaceId();
  const boot = getBootstrap(db, ws);
  const rows = listReceivables(db, ws);
  const outstandingPaise = rows
    .filter((r) => r.workflow_status === "sent")
    .reduce((sum, r) => sum + r.outstanding_paise, 0);

  return (
    <section className="space-y-8">
      <PageHeader
        eyebrow="Receivables"
        title="Money coming in"
        description={
          <>
            Outstanding invoices for {boot.workspace.name} as of{" "}
            <Num className="text-cc-ink">{boot.as_of}</Num>. Record payments against live workspace
            data — they persist after refresh.
          </>
        }
      >
        <p className="text-sm text-cc-muted">
          Total outstanding: <Money paise={outstandingPaise} className="font-medium text-cc-ink" />
        </p>
      </PageHeader>

      <ReceivablesClient rows={rows} calendarToday={todayIST()} />
    </section>
  );
}
