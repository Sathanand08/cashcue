"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { apiJson, ApiRequestError } from "@/lib/api/browser";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { fieldClass, labelMuted } from "@/components/ui/field";
import { Money, Num } from "@/components/ui/Money";
import { suggestNextInvoiceNumber } from "@/lib/invoices/next-number";

export type InvoiceCustomer = {
  id: string;
  name: string;
};

export type InvoiceRow = {
  id: string;
  invoice_number: string;
  customer_id: string;
  customer_name: string;
  title: string;
  invoice_type: string;
  amount_paise: number;
  issue_date: string;
  due_date: string;
  promised_date: string | null;
  workflow_status: "draft" | "sent";
  outstanding_paise: number;
  status: string;
};

type CreatedCustomer = {
  id: string;
  name: string;
  whatsapp_number: string | null;
  notes: string | null;
  created_at: string;
};

const TYPES = ["project_milestone", "retainer"] as const;

function typeLabel(t: string): string {
  if (t === "project_milestone") return "Milestone";
  if (t === "retainer") return "Retainer";
  return t;
}

function mergeCustomers(base: InvoiceCustomer[], extra: InvoiceCustomer[]): InvoiceCustomer[] {
  const map = new Map<string, InvoiceCustomer>();
  for (const c of base) map.set(c.id, c);
  for (const c of extra) map.set(c.id, c);
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

export function InvoicesClient({
  invoices,
  customers: customersProp,
  suggestedInvoiceNumber,
  calendarToday,
}: {
  invoices: InvoiceRow[];
  customers: InvoiceCustomer[];
  suggestedInvoiceNumber: string;
  calendarToday: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [promised, setPromised] = useState("");
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");

  const [customers, setCustomers] = useState(() => customersProp);
  const [customerId, setCustomerId] = useState(customersProp[0]?.id ?? "");
  const [addingClient, setAddingClient] = useState(customersProp.length === 0);
  const [clientName, setClientName] = useState("");
  const [clientWhatsapp, setClientWhatsapp] = useState("");

  const [number, setNumber] = useState(suggestedInvoiceNumber);
  const [numberTouched, setNumberTouched] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [type, setType] = useState<(typeof TYPES)[number]>("project_milestone");
  const [amount, setAmount] = useState("");
  const [issueDate, setIssueDate] = useState(calendarToday);
  const [newDue, setNewDue] = useState(calendarToday);
  const [newPromised, setNewPromised] = useState("");

  useEffect(() => {
    setCustomers((prev) => {
      const next = mergeCustomers(customersProp, prev);
      return next;
    });
  }, [customersProp]);

  useEffect(() => {
    if (!numberTouched) {
      setNumber(suggestedInvoiceNumber);
    }
  }, [suggestedInvoiceNumber, numberTouched]);

  useEffect(() => {
    if (!customerId && customers.length > 0) {
      setCustomerId(customers[0].id);
    }
    if (customers.length === 0) {
      setAddingClient(true);
      setCustomerId("");
    }
  }, [customers, customerId]);

  function refresh(msg: string) {
    setOkMsg(msg);
    setError(null);
    router.refresh();
  }

  function run(action: () => Promise<void>, success: string) {
    setError(null);
    startTransition(async () => {
      try {
        await action();
        refresh(success);
      } catch (err) {
        setError(err instanceof ApiRequestError ? err.message : "Request failed");
      }
    });
  }

  function openAddClient() {
    setAddingClient(true);
    setClientName("");
    setClientWhatsapp("");
    setError(null);
    setOkMsg(null);
  }

  function cancelAddClient() {
    if (customers.length === 0) return;
    setAddingClient(false);
    setClientName("");
    setClientWhatsapp("");
    setError(null);
  }

  function createClient() {
    const name = clientName.trim();
    if (!name) {
      setError("Client name is required");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const created = await apiJson<CreatedCustomer>("/api/customers", {
          method: "POST",
          body: JSON.stringify({
            name,
            whatsapp_number: clientWhatsapp.trim() || undefined,
          }),
        });
        const entry = { id: created.id, name: created.name };
        setCustomers((prev) => mergeCustomers(prev, [entry]));
        setCustomerId(created.id);
        setAddingClient(false);
        setClientName("");
        setClientWhatsapp("");
        setOkMsg(`Client “${created.name}” added — continue with the invoice`);
        router.refresh();
      } catch (err) {
        setError(err instanceof ApiRequestError ? err.message : "Could not create client");
      }
    });
  }

  function createInvoice() {
    const rupees = Number(amount);
    const invoiceNumber = number.trim() || suggestedInvoiceNumber;
    if (!customerId || !Number.isFinite(rupees) || rupees <= 0) {
      setError("Customer and amount are required");
      return;
    }
    startTransition(async () => {
      setError(null);
      try {
        await apiJson("/api/invoices", {
          method: "POST",
          body: JSON.stringify({
            customer_id: customerId,
            invoice_number: invoiceNumber,
            title: newTitle.trim() || invoiceNumber,
            invoice_type: type,
            amount: rupees,
            issue_date: issueDate,
            due_date: newDue,
            promised_date: newPromised || null,
            workflow_status: "draft",
          }),
        });
        const used = invoiceNumber;
        const nextSuggest = suggestNextInvoiceNumber([
          ...invoices.map((i) => i.invoice_number),
          used,
        ]);
        setNumber(nextSuggest);
        setNumberTouched(false);
        setNewTitle("");
        setAmount("");
        setNewPromised("");
        refresh(`Invoice ${used} created as draft`);
      } catch (err) {
        setError(err instanceof ApiRequestError ? err.message : "Request failed");
      }
    });
  }

  function openEdit(inv: InvoiceRow) {
    setEditId(inv.id);
    setPromised(inv.promised_date ?? "");
    setTitle(inv.title);
    setDueDate(inv.due_date);
    setOkMsg(null);
    setError(null);
  }

  function saveEdit(id: string) {
    run(
      () =>
        apiJson(`/api/invoices/${id}`, {
          method: "PATCH",
          body: JSON.stringify({
            title: title.trim() || undefined,
            due_date: dueDate,
            promised_date: promised.trim() === "" ? null : promised,
          }),
        }),
      "Invoice updated",
    );
    setEditId(null);
  }

  function sendInvoice(id: string) {
    run(
      () => apiJson(`/api/invoices/${id}/send`, { method: "POST", body: "{}" }),
      "Invoice marked sent",
    );
  }

  const canCreateInvoice = customers.length > 0 && Boolean(customerId);

  return (
    <div className="space-y-8">
      {error ? <Alert>{error}</Alert> : null}
      {okMsg ? <Alert tone="ok">{okMsg}</Alert> : null}

      <Card className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 className="font-display text-xl text-cc-ink">Create invoice</h2>
          <p className="text-xs text-cc-muted">
            Manage all clients anytime in{" "}
            <Link href="/settings" className="font-medium text-cc-primary hover:underline">
              Settings
            </Link>
            .
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <div className="flex flex-wrap items-end gap-2">
              <label className="block min-w-[12rem] flex-1 text-sm">
                <span className={labelMuted}>Customer</span>
                <select
                  className={fieldClass}
                  value={customerId}
                  disabled={customers.length === 0}
                  onChange={(e) => {
                    setCustomerId(e.target.value);
                    setAddingClient(false);
                  }}
                >
                  {customers.length === 0 ? (
                    <option value="">No clients yet — add one below</option>
                  ) : (
                    customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))
                  )}
                </select>
              </label>
              {!addingClient ? (
                <Button type="button" variant="secondary" onClick={openAddClient}>
                  New client
                </Button>
              ) : null}
            </div>

            {addingClient ? (
              <div className="grid gap-3 rounded-md border border-cc-border bg-cc-bg/60 p-3 sm:grid-cols-2">
                <p className="text-sm font-medium text-cc-ink sm:col-span-2">Add new client</p>
                <label className="block text-sm">
                  <span className={labelMuted}>Name</span>
                  <input
                    className={fieldClass}
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    placeholder="e.g. Aster Dental Clinic"
                    autoFocus
                  />
                </label>
                <label className="block text-sm">
                  <span className={labelMuted}>WhatsApp (optional)</span>
                  <input
                    className={fieldClass}
                    value={clientWhatsapp}
                    onChange={(e) => setClientWhatsapp(e.target.value)}
                    placeholder="+9198…"
                  />
                </label>
                <div className="flex flex-wrap gap-2 sm:col-span-2">
                  <Button type="button" disabled={pending} onClick={createClient}>
                    {pending ? "Saving…" : "Save client"}
                  </Button>
                  {customers.length > 0 ? (
                    <Button type="button" variant="ghost" onClick={cancelAddClient}>
                      Cancel
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>

          <label className="block text-sm">
            <span className={labelMuted}>Invoice number</span>
            <input
              className={fieldClass}
              value={number}
              onChange={(e) => {
                setNumberTouched(true);
                setNumber(e.target.value);
              }}
              disabled={!canCreateInvoice}
              placeholder={suggestedInvoiceNumber}
            />
          </label>
          <label className="block text-sm">
            <span className={labelMuted}>Title</span>
            <input
              className={fieldClass}
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              disabled={!canCreateInvoice}
            />
          </label>
          <label className="block text-sm">
            <span className={labelMuted}>Type</span>
            <select
              className={fieldClass}
              value={type}
              onChange={(e) => setType(e.target.value as (typeof TYPES)[number])}
              disabled={!canCreateInvoice}
            >
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {typeLabel(t)}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className={labelMuted}>Amount (₹)</span>
            <input
              className={fieldClass}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              disabled={!canCreateInvoice}
            />
          </label>
          <label className="block text-sm">
            <span className={labelMuted}>Issue date</span>
            <input
              type="date"
              className={fieldClass}
              value={issueDate}
              onChange={(e) => setIssueDate(e.target.value)}
              disabled={!canCreateInvoice}
            />
          </label>
          <label className="block text-sm">
            <span className={labelMuted}>Due date</span>
            <input
              type="date"
              className={fieldClass}
              value={newDue}
              onChange={(e) => setNewDue(e.target.value)}
              disabled={!canCreateInvoice}
            />
          </label>
          <label className="block text-sm">
            <span className={labelMuted}>Promised date (optional)</span>
            <input
              type="date"
              className={fieldClass}
              value={newPromised}
              onChange={(e) => setNewPromised(e.target.value)}
              disabled={!canCreateInvoice}
            />
          </label>
        </div>

        <Button disabled={pending || !canCreateInvoice} onClick={createInvoice}>
          Create draft
        </Button>
        {!canCreateInvoice ? (
          <p className="text-sm text-cc-muted">Add a client above before creating the invoice</p>
        ) : null}
      </Card>

      <Card className="space-y-4 p-4 sm:p-5">
        <h2 className="font-display text-xl text-cc-ink">All invoices</h2>
        {invoices.length === 0 ? (
          <p className="text-sm text-cc-muted">No invoices yet. Create a draft above.</p>
        ) : (
          <ul className="divide-y divide-cc-border border-y border-cc-border">
            {invoices.map((inv) => (
              <li key={inv.id} className="space-y-3 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <p className="font-medium text-cc-ink">
                      {inv.invoice_number}
                      <span className="font-normal text-cc-muted"> · {inv.customer_name}</span>
                    </p>
                    <p className="text-sm text-cc-muted">{inv.title}</p>
                    <p className="text-sm text-cc-muted">
                      <Badge variant={inv.workflow_status === "sent" ? "ok" : "neutral"}>
                        {inv.workflow_status === "sent" ? "Sent" : "Draft"}
                      </Badge>{" "}
                      · {typeLabel(inv.invoice_type)} · due <Num>{inv.due_date}</Num>
                      {inv.promised_date ? (
                        <>
                          {" · promised "}
                          <Num>{inv.promised_date}</Num>
                        </>
                      ) : null}
                    </p>
                    <p className="text-sm text-cc-ink">
                      <Money paise={inv.amount_paise} />
                      {inv.outstanding_paise < inv.amount_paise ? (
                        <>
                          {" · outstanding "}
                          <Money paise={inv.outstanding_paise} />
                        </>
                      ) : null}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" onClick={() => openEdit(inv)}>
                      Edit
                    </Button>
                    {inv.workflow_status === "draft" ? (
                      <Button disabled={pending} onClick={() => sendInvoice(inv.id)}>
                        Send
                      </Button>
                    ) : null}
                  </div>
                </div>

                {editId === inv.id ? (
                  <div className="grid gap-3 rounded-md border border-cc-border bg-cc-bg/60 p-3 sm:grid-cols-3">
                    <label className="block text-sm sm:col-span-3">
                      <span className={labelMuted}>Title</span>
                      <input
                        className={fieldClass}
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                      />
                    </label>
                    <label className="block text-sm">
                      <span className={labelMuted}>Due date</span>
                      <input
                        type="date"
                        className={fieldClass}
                        value={dueDate}
                        onChange={(e) => setDueDate(e.target.value)}
                      />
                    </label>
                    <label className="block text-sm">
                      <span className={labelMuted}>Promised date</span>
                      <input
                        type="date"
                        className={fieldClass}
                        value={promised}
                        onChange={(e) => setPromised(e.target.value)}
                      />
                    </label>
                    <div className="flex items-end gap-2">
                      <Button disabled={pending} onClick={() => saveEdit(inv.id)}>
                        Save
                      </Button>
                      <Button variant="ghost" onClick={() => setEditId(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
