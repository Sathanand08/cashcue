"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { apiJson, ApiRequestError } from "@/lib/api/browser";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { fieldClass, labelMuted } from "@/components/ui/field";
import { Money, Num } from "@/components/ui/Money";

export type ReceivablePayment = {
  id: string;
  amount_paise: number;
  received_on: string;
  payment_method: string;
  reference: string | null;
};

export type ReceivableRow = {
  id: string;
  invoice_number: string;
  customer_name: string;
  title: string;
  amount_paise: number;
  due_date: string;
  promised_date: string | null;
  workflow_status: "draft" | "sent";
  paid_paise: number;
  outstanding_paise: number;
  status: string;
  days_overdue: number;
  payments: ReceivablePayment[];
};

/** Keep in sync with lib/services/payments.ts PAYMENT_METHODS. */
const METHODS = ["UPI", "Bank transfer", "Cash", "Cheque", "Other"] as const;

function StatusBadge({ row }: { row: ReceivableRow }) {
  if (row.workflow_status === "draft") return <Badge variant="neutral">Draft</Badge>;
  if (row.status === "overdue")
    return (
      <Badge variant="warn">
        Overdue <Num>{row.days_overdue}</Num>d
      </Badge>
    );
  if (row.status === "paid") return <Badge variant="ok">Paid</Badge>;
  if (row.status === "partial") return <Badge variant="warn">Partial</Badge>;
  return <Badge variant="neutral">{row.status}</Badge>;
}

export function ReceivablesClient({
  rows,
  calendarToday,
}: {
  rows: ReceivableRow[];
  calendarToday: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [openId, setOpenId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [receivedOn, setReceivedOn] = useState(calendarToday);
  const [method, setMethod] = useState<(typeof METHODS)[number]>("UPI");
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const outstanding = useMemo(
    () => rows.filter((r) => r.workflow_status === "sent" && r.outstanding_paise > 0),
    [rows],
  );
  const settled = useMemo(
    () => rows.filter((r) => r.outstanding_paise <= 0 || r.workflow_status === "draft"),
    [rows],
  );

  function openPay(row: ReceivableRow) {
    setOpenId(row.id);
    setAmount((row.outstanding_paise / 100).toFixed(row.outstanding_paise % 100 === 0 ? 0 : 2));
    setReceivedOn(calendarToday);
    setMethod("UPI");
    setReference("");
    setError(null);
    setOkMsg(null);
  }

  function submitPayment(invoiceId: string) {
    setError(null);
    setOkMsg(null);
    const rupees = Number(amount);
    if (!Number.isFinite(rupees) || rupees <= 0) {
      setError("Enter a payment amount greater than zero");
      return;
    }

    startTransition(async () => {
      try {
        await apiJson(`/api/invoices/${invoiceId}/payments`, {
          method: "POST",
          body: JSON.stringify({
            amount: rupees,
            payment_method: method,
            received_on: receivedOn || undefined,
            reference: reference.trim() || undefined,
            idempotency_key: crypto.randomUUID(),
          }),
        });
        setOkMsg("Payment recorded");
        setOpenId(null);
        router.refresh();
      } catch (err) {
        setError(err instanceof ApiRequestError ? err.message : "Payment failed");
      }
    });
  }

  return (
    <div className="space-y-8">
      {error ? <Alert>{error}</Alert> : null}
      {okMsg ? <Alert tone="ok">{okMsg}</Alert> : null}

      <Card className="space-y-4 p-4 sm:p-5">
        <h2 className="font-display text-xl text-cc-ink">Outstanding</h2>
        {outstanding.length === 0 ? (
          <p className="text-sm text-cc-muted">
            No outstanding receivables.{" "}
            <Link href="/invoices" className="font-medium text-cc-primary hover:underline">
              Create or send an invoice
            </Link>
            .
          </p>
        ) : (
          <ul className="divide-y divide-cc-border border-y border-cc-border">
            {outstanding.map((row) => (
              <li key={row.id} className="py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <p className="font-medium text-cc-ink">
                      {row.invoice_number}
                      <span className="font-normal text-cc-muted"> · {row.customer_name}</span>
                    </p>
                    <p className="text-sm text-cc-muted">{row.title}</p>
                    <p className="text-sm text-cc-muted">
                      Due <Num>{row.due_date}</Num>
                      {row.promised_date ? (
                        <>
                          {" · promised "}
                          <Num>{row.promised_date}</Num>
                        </>
                      ) : null}{" "}
                      <StatusBadge row={row} />
                    </p>
                    <p className="text-sm text-cc-ink">
                      Outstanding <Money paise={row.outstanding_paise} /> of{" "}
                      <Money paise={row.amount_paise} />
                    </p>
                  </div>
                  <Button onClick={() => (openId === row.id ? setOpenId(null) : openPay(row))}>
                    {openId === row.id ? "Close" : "Record payment"}
                  </Button>
                </div>

                {row.payments.length > 0 ? (
                  <ul className="mt-3 space-y-1 text-sm text-cc-muted">
                    {row.payments.map((p) => (
                      <li key={p.id}>
                        <Money paise={p.amount_paise} /> on <Num>{p.received_on}</Num> via{" "}
                        {p.payment_method}
                        {p.reference ? ` (${p.reference})` : ""}
                      </li>
                    ))}
                  </ul>
                ) : null}

                {openId === row.id ? (
                  <form
                    className="mt-4 grid gap-3 sm:grid-cols-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      submitPayment(row.id);
                    }}
                  >
                    <label className="block text-sm">
                      <span className={labelMuted}>Amount (₹)</span>
                      <input
                        className={fieldClass}
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        inputMode="decimal"
                        required
                      />
                    </label>
                    <label className="block text-sm">
                      <span className={labelMuted}>Received on</span>
                      <input
                        type="date"
                        className={fieldClass}
                        value={receivedOn}
                        max={calendarToday}
                        onChange={(e) => setReceivedOn(e.target.value)}
                        required
                      />
                    </label>
                    <label className="block text-sm">
                      <span className={labelMuted}>Method</span>
                      <select
                        className={fieldClass}
                        value={method}
                        onChange={(e) => setMethod(e.target.value as (typeof METHODS)[number])}
                      >
                        {METHODS.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-sm">
                      <span className={labelMuted}>Reference (optional)</span>
                      <input
                        className={fieldClass}
                        value={reference}
                        onChange={(e) => setReference(e.target.value)}
                        maxLength={100}
                      />
                    </label>
                    <div className="sm:col-span-2">
                      <Button type="submit" disabled={pending}>
                        {pending ? "Saving…" : "Save payment"}
                      </Button>
                    </div>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {settled.length > 0 ? (
        <Card className="space-y-3 p-4 sm:p-5">
          <h2 className="font-display text-xl text-cc-ink">Settled / draft</h2>
          <ul className="divide-y divide-cc-border border-y border-cc-border">
            {settled.map((row) => (
              <li key={row.id} className="flex flex-wrap items-baseline justify-between gap-2 py-3 text-sm">
                <span className="text-cc-ink">
                  {row.invoice_number} · {row.customer_name} <StatusBadge row={row} />
                </span>
                <Money paise={row.amount_paise} className="text-cc-ink" />
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
