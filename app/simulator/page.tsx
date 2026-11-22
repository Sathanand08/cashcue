import { SimulatorClient } from "@/components/SimulatorClient";
import { Num } from "@/components/ui/Money";
import { PageHeader } from "@/components/ui/PageHeader";
import { getDb } from "@/lib/db/client";
import { getDemoWorkspaceId } from "@/lib/db/workspace";
import { getBootstrap } from "@/lib/services/bootstrap";
import { listReceivables } from "@/lib/services/invoices";

export const dynamic = "force-dynamic";

export default function SimulatorPage() {
  const db = getDb();
  const ws = getDemoWorkspaceId();
  const boot = getBootstrap(db, ws);
  const invoices = listReceivables(db, ws)
    .filter((r) => r.workflow_status === "sent" && r.outstanding_paise > 0)
    .map((r) => ({
      id: r.id,
      invoice_number: r.invoice_number,
      customer_name: r.customer_name,
      outstanding_paise: r.outstanding_paise,
      due_date: r.due_date,
      promised_date: r.promised_date,
      status: r.status,
      days_overdue: r.days_overdue,
    }));

  return (
    <section className="space-y-8">
      <PageHeader
        eyebrow="What-If Simulator"
        title="What if payment slips?"
        description={
          <>
            Delay a customer receipt for {boot.workspace.name} and see the buffer shortfall instantly.
            Start with Aster Dental (+<Num className="text-cc-ink">15</Num> days). Simulations never
            change your records.
          </>
        }
      />

      <SimulatorClient invoices={invoices} />
    </section>
  );
}
