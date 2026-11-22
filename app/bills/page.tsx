import { BillsClient } from "@/components/BillsClient";
import { Money, Num } from "@/components/ui/Money";
import { PageHeader } from "@/components/ui/PageHeader";
import { getDb } from "@/lib/db/client";
import { getDemoWorkspaceId } from "@/lib/db/workspace";
import { listBills } from "@/lib/services/bills";
import { getBootstrap } from "@/lib/services/bootstrap";
import { listRecurringExpenses } from "@/lib/services/recurring";
import { todayIST } from "@/lib/time";

export const dynamic = "force-dynamic";

export default function BillsPage() {
  const db = getDb();
  const ws = getDemoWorkspaceId();
  const boot = getBootstrap(db, ws);
  const bills = listBills(db, ws);
  const recurring = listRecurringExpenses(db, ws);
  const scheduledPaise = bills
    .filter((b) => b.status === "scheduled")
    .reduce((sum, b) => sum + b.amount_paise, 0);
  const activeRecurring = recurring.filter((r) => r.active).length;

  return (
    <section className="space-y-8">
      <PageHeader
        eyebrow="Bills and Expenses"
        title="Money going out"
        description={`One-time bills and recurring rules for ${boot.workspace.name}. Paying a bill writes a cash outflow and drops it from the forecast.`}
      >
        <p className="text-sm text-cc-muted">
          Scheduled total: <Money paise={scheduledPaise} className="font-medium text-cc-ink" />
          {" · "}
          <Num>{activeRecurring}</Num> active recurring
        </p>
      </PageHeader>

      <BillsClient bills={bills} recurring={recurring} calendarToday={todayIST()} />
    </section>
  );
}
