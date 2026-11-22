import { SettingsClient } from "@/components/SettingsClient";
import { PageHeader } from "@/components/ui/PageHeader";
import { getDb } from "@/lib/db/client";
import { getDemoWorkspaceId } from "@/lib/db/workspace";
import { getBootstrap } from "@/lib/services/bootstrap";
import { getCashSettings } from "@/lib/services/cash";
import { listCustomers } from "@/lib/services/invoices";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  const db = getDb();
  const ws = getDemoWorkspaceId();
  const boot = getBootstrap(db, ws);
  const settings = getCashSettings(db, ws);
  const customers = listCustomers(db, ws);

  return (
    <section className="space-y-8">
      <PageHeader
        eyebrow="Settings"
        title="Business setup"
        description={`Cash snapshot and customers for ${boot.workspace.name}. Changes persist and affect forecast aging immediately.`}
      />

      <SettingsClient
        settings={settings}
        customers={customers}
        workspaceName={boot.workspace.name}
      />
    </section>
  );
}
