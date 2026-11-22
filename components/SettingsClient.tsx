"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { apiJson, ApiRequestError } from "@/lib/api/browser";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { fieldClass, labelMuted } from "@/components/ui/field";
import { Money, Num } from "@/components/ui/Money";

export type CashSettingsView = {
  opening_cash_paise: number;
  opening_cash_as_of: string;
  minimum_cash_buffer_paise: number;
  currency: string;
  timezone: string;
};

export type CustomerRow = {
  id: string;
  name: string;
  whatsapp_number: string | null;
  notes: string | null;
};

export function SettingsClient({
  settings,
  customers,
  workspaceName,
}: {
  settings: CashSettingsView;
  customers: CustomerRow[];
  workspaceName: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const [openingCash, setOpeningCash] = useState(String(settings.opening_cash_paise / 100));
  const [asOf, setAsOf] = useState(settings.opening_cash_as_of);
  const [buffer, setBuffer] = useState(String(settings.minimum_cash_buffer_paise / 100));

  const [name, setName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [notes, setNotes] = useState("");

  function refresh(msg: string) {
    setOkMsg(msg);
    setError(null);
    router.refresh();
  }

  function saveCash() {
    const opening = Number(openingCash);
    const buf = Number(buffer);
    if (!Number.isFinite(opening) || opening < 0 || !Number.isFinite(buf) || buf < 0) {
      setError("Opening cash and buffer must be non-negative numbers");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await apiJson("/api/settings/cash", {
          method: "PATCH",
          body: JSON.stringify({
            opening_cash: opening,
            opening_cash_as_of: asOf,
            minimum_cash_buffer: buf,
          }),
        });
        refresh("Cash settings saved");
      } catch (err) {
        setError(err instanceof ApiRequestError ? err.message : "Could not save settings");
      }
    });
  }

  function createCustomer() {
    if (!name.trim()) {
      setError("Customer name is required");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await apiJson("/api/customers", {
          method: "POST",
          body: JSON.stringify({
            name: name.trim(),
            whatsapp_number: whatsapp.trim() || undefined,
            notes: notes.trim() || undefined,
          }),
        });
        setName("");
        setWhatsapp("");
        setNotes("");
        refresh("Customer created");
      } catch (err) {
        setError(err instanceof ApiRequestError ? err.message : "Could not create customer");
      }
    });
  }

  return (
    <div className="space-y-8">
      {error ? <Alert>{error}</Alert> : null}
      {okMsg ? <Alert tone="ok">{okMsg}</Alert> : null}

      <Card className="space-y-3 p-4 sm:p-5">
        <h2 className="font-display text-xl text-cc-ink">Workspace</h2>
        <p className="text-sm text-cc-muted">
          {workspaceName} · {settings.currency} · {settings.timezone}
        </p>
        <p className="text-sm text-cc-muted">
          Current opening cash <Money paise={settings.opening_cash_paise} />, buffer{" "}
          <Money paise={settings.minimum_cash_buffer_paise} />, as of{" "}
          <Num>{settings.opening_cash_as_of}</Num>.
        </p>
      </Card>

      <Card className="space-y-3 p-4 sm:p-5">
        <h2 className="font-display text-xl text-cc-ink">Cash settings</h2>
        <p className="text-sm text-cc-muted">
          As-of date drives forecast and receivables aging. Changing it updates the demo snapshot.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block text-sm">
            <span className={labelMuted}>Opening cash (₹)</span>
            <input
              className={fieldClass}
              value={openingCash}
              onChange={(e) => setOpeningCash(e.target.value)}
              inputMode="decimal"
            />
          </label>
          <label className="block text-sm">
            <span className={labelMuted}>As of</span>
            <input
              type="date"
              className={fieldClass}
              value={asOf}
              onChange={(e) => setAsOf(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className={labelMuted}>Minimum buffer (₹)</span>
            <input
              className={fieldClass}
              value={buffer}
              onChange={(e) => setBuffer(e.target.value)}
              inputMode="decimal"
            />
          </label>
        </div>
        <Button disabled={pending} onClick={saveCash}>
          Save cash settings
        </Button>
      </Card>

      <Card className="space-y-4 p-4 sm:p-5">
        <h2 className="font-display text-xl text-cc-ink">Customers</h2>
        {customers.length === 0 ? (
          <p className="text-sm text-cc-muted">
            No customers yet. Add one below, then{" "}
            <Link href="/invoices" className="font-medium text-cc-primary hover:underline">
              create an invoice
            </Link>
            .
          </p>
        ) : (
          <ul className="divide-y divide-cc-border border-y border-cc-border">
            {customers.map((c) => (
              <li key={c.id} className="py-3 text-sm">
                <p className="font-medium text-cc-ink">{c.name}</p>
                <p className="text-cc-muted">
                  {c.whatsapp_number ?? "No WhatsApp"}
                  {c.notes ? ` · ${c.notes}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="space-y-3 p-4 sm:p-5">
        <h2 className="font-display text-xl text-cc-ink">Add customer</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className={labelMuted}>Name</span>
            <input className={fieldClass} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="block text-sm">
            <span className={labelMuted}>WhatsApp (optional)</span>
            <input
              className={fieldClass}
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              placeholder="+9198…"
            />
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className={labelMuted}>Notes (optional)</span>
            <input className={fieldClass} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
        </div>
        <Button disabled={pending} onClick={createCustomer}>
          Create customer
        </Button>
      </Card>
    </div>
  );
}
