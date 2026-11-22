"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { apiJson, ApiRequestError } from "@/lib/api/browser";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { fieldClass, labelMuted } from "@/components/ui/field";
import { Money, Num } from "@/components/ui/Money";

export type BillRow = {
  id: string;
  title: string;
  payee: string | null;
  category: string;
  amount_paise: number;
  due_date: string;
  source_type: "one_time" | "recurring";
  recurring_expense_id: string | null;
  status: "scheduled" | "paid" | "cancelled";
  paid_at: string | null;
};

export type RecurringRow = {
  id: string;
  title: string;
  category: string;
  amount_paise: number;
  frequency: "weekly" | "monthly" | "quarterly";
  interval_count: number;
  next_due_date: string;
  active: boolean;
};

const FREQUENCIES = ["weekly", "monthly", "quarterly"] as const;

function freqLabel(f: string): string {
  if (f === "weekly") return "Weekly";
  if (f === "monthly") return "Monthly";
  if (f === "quarterly") return "Quarterly";
  return f;
}

export function BillsClient({
  bills,
  recurring,
  calendarToday,
}: {
  bills: BillRow[];
  recurring: RecurringRow[];
  calendarToday: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [tab, setTab] = useState<"scheduled" | "recurring" | "history">("scheduled");

  const [billTitle, setBillTitle] = useState("");
  const [billCategory, setBillCategory] = useState("Contractor");
  const [billAmount, setBillAmount] = useState("");
  const [billDue, setBillDue] = useState(calendarToday);
  const [billPayee, setBillPayee] = useState("");

  const [recTitle, setRecTitle] = useState("");
  const [recCategory, setRecCategory] = useState("Software");
  const [recAmount, setRecAmount] = useState("");
  const [recFreq, setRecFreq] = useState<(typeof FREQUENCIES)[number]>("monthly");
  const [recAnchor, setRecAnchor] = useState(calendarToday);

  const scheduled = bills.filter((b) => b.status === "scheduled");
  const otherBills = bills.filter((b) => b.status !== "scheduled");

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

  function createBill() {
    const amount = Number(billAmount);
    if (!billTitle.trim() || !Number.isFinite(amount) || amount <= 0) {
      setError("Enter a title and amount greater than zero");
      return;
    }
    run(
      () =>
        apiJson("/api/bills", {
          method: "POST",
          body: JSON.stringify({
            title: billTitle.trim(),
            category: billCategory.trim() || "General",
            amount,
            due_date: billDue,
            payee: billPayee.trim() || undefined,
          }),
        }),
      "Bill created",
    );
    setBillTitle("");
    setBillAmount("");
    setBillPayee("");
  }

  function payBill(id: string) {
    run(
      () =>
        apiJson(`/api/bills/${id}/pay`, {
          method: "POST",
          body: JSON.stringify({ paid_on: calendarToday }),
        }),
      "Bill marked paid",
    );
  }

  function cancelBill(id: string) {
    run(
      () => apiJson(`/api/bills/${id}/cancel`, { method: "POST", body: "{}" }),
      "Bill cancelled",
    );
  }

  function createRecurring() {
    const amount = Number(recAmount);
    if (!recTitle.trim() || !Number.isFinite(amount) || amount <= 0) {
      setError("Enter a recurring title and amount greater than zero");
      return;
    }
    run(
      () =>
        apiJson("/api/recurring-expenses", {
          method: "POST",
          body: JSON.stringify({
            title: recTitle.trim(),
            category: recCategory.trim() || "General",
            amount,
            frequency: recFreq,
            interval_count: 1,
            next_due_date: recAnchor,
          }),
        }),
      "Recurring expense created",
    );
    setRecTitle("");
    setRecAmount("");
  }

  function toggleActive(rule: RecurringRow) {
    run(
      () =>
        apiJson(`/api/recurring-expenses/${rule.id}`, {
          method: "PATCH",
          body: JSON.stringify({ active: !rule.active }),
        }),
      rule.active ? "Recurring expense deactivated" : "Recurring expense activated",
    );
  }

  function payOccurrence(rule: RecurringRow) {
    run(
      () =>
        apiJson(`/api/recurring-expenses/${rule.id}/pay`, {
          method: "POST",
          body: JSON.stringify({
            due_date: rule.next_due_date,
            paid_on: calendarToday,
          }),
        }),
      `Paid occurrence ${rule.next_due_date}`,
    );
  }

  const tabs = [
    { id: "scheduled" as const, label: "Scheduled" },
    { id: "recurring" as const, label: "Recurring" },
    { id: "history" as const, label: "History" },
  ];

  return (
    <div className="space-y-6">
      {error ? <Alert>{error}</Alert> : null}
      {okMsg ? <Alert tone="ok">{okMsg}</Alert> : null}

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Bills sections">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={
              tab === t.id
                ? "rounded-md bg-cc-primary px-3 py-1.5 text-sm font-medium text-white"
                : "rounded-md border border-cc-border bg-cc-card px-3 py-1.5 text-sm text-cc-ink hover:bg-cc-bg"
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "scheduled" ? (
        <div className="space-y-6">
          <Card className="space-y-4 p-4 sm:p-5">
            <h2 className="font-display text-xl text-cc-ink">Scheduled bills</h2>
            {scheduled.length === 0 ? (
              <p className="text-sm text-cc-muted">No scheduled bills.</p>
            ) : (
              <ul className="divide-y divide-cc-border border-y border-cc-border">
                {scheduled.map((b) => (
                  <li key={b.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                    <div className="min-w-0 space-y-1">
                      <p className="font-medium text-cc-ink">{b.title}</p>
                      <p className="text-sm text-cc-muted">
                        {b.category}
                        {b.payee ? ` · ${b.payee}` : ""}
                        {" · due "}
                        <Num>{b.due_date}</Num>{" "}
                        <Badge variant="neutral">
                          {b.source_type === "one_time" ? "One-time" : "Recurring"}
                        </Badge>
                      </p>
                      <p className="text-sm text-cc-ink">
                        <Money paise={b.amount_paise} />
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button disabled={pending} onClick={() => payBill(b.id)}>
                        Mark paid
                      </Button>
                      {b.source_type === "one_time" ? (
                        <Button variant="secondary" disabled={pending} onClick={() => cancelBill(b.id)}>
                          Cancel
                        </Button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="space-y-3 p-4 sm:p-5">
            <h2 className="font-display text-xl text-cc-ink">Add one-time bill</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className={labelMuted}>Title</span>
                <input
                  className={fieldClass}
                  value={billTitle}
                  onChange={(e) => setBillTitle(e.target.value)}
                />
              </label>
              <label className="block text-sm">
                <span className={labelMuted}>Category</span>
                <input
                  className={fieldClass}
                  value={billCategory}
                  onChange={(e) => setBillCategory(e.target.value)}
                />
              </label>
              <label className="block text-sm">
                <span className={labelMuted}>Amount (₹)</span>
                <input
                  className={fieldClass}
                  value={billAmount}
                  onChange={(e) => setBillAmount(e.target.value)}
                  inputMode="decimal"
                />
              </label>
              <label className="block text-sm">
                <span className={labelMuted}>Due date</span>
                <input
                  type="date"
                  className={fieldClass}
                  value={billDue}
                  onChange={(e) => setBillDue(e.target.value)}
                />
              </label>
              <label className="block text-sm sm:col-span-2">
                <span className={labelMuted}>Payee (optional)</span>
                <input
                  className={fieldClass}
                  value={billPayee}
                  onChange={(e) => setBillPayee(e.target.value)}
                />
              </label>
            </div>
            <Button disabled={pending} onClick={createBill}>
              Create bill
            </Button>
          </Card>
        </div>
      ) : null}

      {tab === "recurring" ? (
        <div className="space-y-6">
          <Card className="space-y-4 p-4 sm:p-5">
            <h2 className="font-display text-xl text-cc-ink">Recurring expenses</h2>
            {recurring.length === 0 ? (
              <p className="text-sm text-cc-muted">No recurring rules.</p>
            ) : (
              <ul className="divide-y divide-cc-border border-y border-cc-border">
                {recurring.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                    <div className="min-w-0 space-y-1">
                      <p className="font-medium text-cc-ink">
                        {r.title}{" "}
                        {!r.active ? <Badge variant="neutral">Inactive</Badge> : <Badge variant="ok">Active</Badge>}
                      </p>
                      <p className="text-sm text-cc-muted">
                        {r.category} · {freqLabel(r.frequency)} · next <Num>{r.next_due_date}</Num>
                      </p>
                      <p className="text-sm text-cc-ink">
                        <Money paise={r.amount_paise} />
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {r.active ? (
                        <Button disabled={pending} onClick={() => payOccurrence(r)}>
                          Pay <Num>{r.next_due_date}</Num>
                        </Button>
                      ) : null}
                      <Button variant="secondary" disabled={pending} onClick={() => toggleActive(r)}>
                        {r.active ? "Deactivate" : "Activate"}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="space-y-3 p-4 sm:p-5">
            <h2 className="font-display text-xl text-cc-ink">Add recurring expense</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className={labelMuted}>Title</span>
                <input
                  className={fieldClass}
                  value={recTitle}
                  onChange={(e) => setRecTitle(e.target.value)}
                />
              </label>
              <label className="block text-sm">
                <span className={labelMuted}>Category</span>
                <input
                  className={fieldClass}
                  value={recCategory}
                  onChange={(e) => setRecCategory(e.target.value)}
                />
              </label>
              <label className="block text-sm">
                <span className={labelMuted}>Amount (₹)</span>
                <input
                  className={fieldClass}
                  value={recAmount}
                  onChange={(e) => setRecAmount(e.target.value)}
                  inputMode="decimal"
                />
              </label>
              <label className="block text-sm">
                <span className={labelMuted}>Frequency</span>
                <select
                  className={fieldClass}
                  value={recFreq}
                  onChange={(e) => setRecFreq(e.target.value as (typeof FREQUENCIES)[number])}
                >
                  {FREQUENCIES.map((f) => (
                    <option key={f} value={f}>
                      {freqLabel(f)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm sm:col-span-2">
                <span className={labelMuted}>Next / anchor due date</span>
                <input
                  type="date"
                  className={fieldClass}
                  value={recAnchor}
                  onChange={(e) => setRecAnchor(e.target.value)}
                />
              </label>
            </div>
            <Button disabled={pending} onClick={createRecurring}>
              Create recurring
            </Button>
          </Card>
        </div>
      ) : null}

      {tab === "history" ? (
        <Card className="space-y-3 p-4 sm:p-5">
          <h2 className="font-display text-xl text-cc-ink">Paid / cancelled</h2>
          {otherBills.length === 0 ? (
            <p className="text-sm text-cc-muted">No paid or cancelled bills yet.</p>
          ) : (
            <ul className="divide-y divide-cc-border border-y border-cc-border">
              {otherBills.map((b) => (
                <li key={b.id} className="flex flex-wrap items-baseline justify-between gap-2 py-3 text-sm">
                  <span className="text-cc-ink">
                    {b.title}{" "}
                    <Badge variant={b.status === "paid" ? "ok" : "neutral"}>
                      {b.status === "paid" ? "Paid" : "Cancelled"}
                    </Badge>
                    <span className="text-cc-muted">
                      {b.paid_at ? (
                        <>
                          {" "}
                          <Num>{b.paid_at}</Num>
                        </>
                      ) : null}
                      {" · due "}
                      <Num>{b.due_date}</Num>
                    </span>
                  </span>
                  <Money paise={b.amount_paise} className="text-cc-ink" />
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}
    </div>
  );
}
