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

  const [resetConfirm, setResetConfirm] = useState("");
  const [resetOpen, setResetOpen] = useState(false);

  function refresh(msg: string) {
    setOkMsg(msg);
    setError(null);
    router.refresh();
  }

  function resetDemo() {
    if (resetConfirm.trim() !== "RESET") {
      setError('Type RESET to confirm wiping and reseeding the demo workspace');
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const data = await apiJson<{
          opening_cash_paise: number;
          opening_cash_as_of: string;
          minimum_cash_buffer_paise: number;
          primary_demo_invoice: string;
        }>("/api/settings/reset-demo", {
          method: "POST",
          body: JSON.stringify({ confirm: "RESET" }),
        });
        setOpeningCash(String(data.opening_cash_paise / 100));
        setAsOf(data.opening_cash_as_of);
        setBuffer(String(data.minimum_cash_buffer_paise / 100));
        setResetConfirm("");
        setResetOpen(false);
        setOkMsg(
          `Demo reset. Opening cash restored; primary what-if is ${data.primary_demo_invoice} (Aster Dental).`,
        );
        setError(null);
        router.refresh();
        router.push("/");
      } catch (err) {
        setError(err instanceof ApiRequestError ? err.message : "Could not reset demo");
      }
    });
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

      <Card className="space-y-3 border-cc-danger/30 p-4 sm:p-5">
        <h2 className="font-display text-xl text-cc-ink">Reset demo data</h2>
        <p className="text-sm text-cc-muted">
          Wipes PixelCraft Studio and reseeds the hackathon demo: opening cash ₹80,000, Aster Dental
          (INV-001) unpaid for what-if, bills and recurring expenses restored. Use this before a live
          presentation if you have been clicking around.
        </p>
        {!resetOpen ? (
          <Button variant="danger" disabled={pending} onClick={() => setResetOpen(true)}>
            Reset demo…
          </Button>
        ) : (
          <div className="space-y-3 rounded-md border border-cc-border bg-cc-bg/60 p-3">
            <p className="text-sm text-cc-ink">
              This cannot be undone. Type <span className="font-medium">RESET</span> to confirm.
            </p>
            <label className="block text-sm">
              <span className={labelMuted}>Confirmation</span>
              <input
                className={fieldClass}
                value={resetConfirm}
                onChange={(e) => setResetConfirm(e.target.value)}
                placeholder="RESET"
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="danger"
                disabled={pending || resetConfirm.trim() !== "RESET"}
                onClick={resetDemo}
              >
                Wipe and reseed
              </Button>
              <Button
                variant="secondary"
                disabled={pending}
                onClick={() => {
                  setResetOpen(false);
                  setResetConfirm("");
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
