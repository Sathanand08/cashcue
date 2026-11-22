import { InvoicesClient } from "@/components/InvoicesClient";
import { PageHeader } from "@/components/ui/PageHeader";
import { getDb } from "@/lib/db/client";
import { getDemoWorkspaceId } from "@/lib/db/workspace";
import { getBootstrap } from "@/lib/services/bootstrap";
import {
  listCustomers,
  listReceivables,
  nextInvoiceNumberForWorkspace,
} from "@/lib/services/invoices";
import { todayIST } from "@/lib/time";

export const dynamic = "force-dynamic";

export default function InvoicesPage() {
  const db = getDb();
  const ws = getDemoWorkspaceId();
  const boot = getBootstrap(db, ws);
  const invoices = listReceivables(db, ws);
  const customers = listCustomers(db, ws);
  const suggestedInvoiceNumber = nextInvoiceNumberForWorkspace(db, ws);

  return (
    <section className="space-y-8">
      <PageHeader
        eyebrow="Invoices"
        title="Create and send"
        description={`Draft and sent invoices for ${boot.workspace.name}. Promised dates feed the cash forecast.`}
      />

      <InvoicesClient
        invoices={invoices.map((i) => ({
          id: i.id,
          invoice_number: i.invoice_number,
          customer_id: i.customer_id,
          customer_name: i.customer_name,
          title: i.title,
          invoice_type: i.invoice_type,
          amount_paise: i.amount_paise,
          issue_date: i.issue_date,
          due_date: i.due_date,
          promised_date: i.promised_date,
          workflow_status: i.workflow_status,
          outstanding_paise: i.outstanding_paise,
          status: i.status,
        }))}
        customers={customers.map((c) => ({ id: c.id, name: c.name }))}
        suggestedInvoiceNumber={suggestedInvoiceNumber}
        calendarToday={todayIST()}
      />
    </section>
  );
}
