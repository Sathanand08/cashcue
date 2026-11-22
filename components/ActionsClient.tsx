"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { apiJson, ApiRequestError } from "@/lib/api/browser";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { fieldClass, labelMuted } from "@/components/ui/field";
import { Money, Num } from "@/components/ui/Money";
import { formatDisplayDate } from "@/lib/format-date";

export type ActionRow = {
  invoiceId: string;
  invoiceNumber: string;
  customerName: string;
  outstandingPaise: number;
  expectedReceiptDate: string;
  overdue: boolean;
  daysOverdue: number;
  impactValuePaise: number;
  stressShortfallIncreasePaise: number;
  daysUntilAffectedBill: number | null;
  priorityReason: string;
  financialImpact: string;
  recommendedAction: string;
};

export type ReminderDraftRow = {
  id: string;
  invoice_id: string;
  language: "en" | "te";
  tone: "friendly" | "professional" | "firm";
  content: string;
  generated_at: string;
  updated_at: string;
  copied_at: string | null;
};

const TONES = ["friendly", "professional", "firm"] as const;
const LANGS = [
  { value: "en" as const, label: "English" },
  { value: "te" as const, label: "Telugu" },
];

export function ActionsClient({
  actions,
  drafts,
}: {
  actions: ActionRow[];
  drafts: ReminderDraftRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [openId, setOpenId] = useState<string | null>(null);
  const [language, setLanguage] = useState<"en" | "te">("en");
  const [tone, setTone] = useState<(typeof TONES)[number]>("professional");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const draftsByInvoice = useMemo(() => {
    const map = new Map<string, ReminderDraftRow[]>();
    for (const d of drafts) {
      const list = map.get(d.invoice_id) ?? [];
      list.push(d);
      map.set(d.invoice_id, list);
    }
    return map;
  }, [drafts]);

  function refreshSoon(message: string) {
    setOkMsg(message);
    setError(null);
    router.refresh();
  }

  function generate(invoiceId: string) {
    setError(null);
    startTransition(async () => {
      try {
        await apiJson("/api/reminders", {
          method: "POST",
          body: JSON.stringify({
            invoice_id: invoiceId,
            language,
            tone,
          }),
        });
        refreshSoon("Reminder draft created");
      } catch (err) {
        setError(err instanceof ApiRequestError ? err.message : "Could not create draft");
      }
    });
  }

  function saveEdit(draftId: string) {
    setError(null);
    startTransition(async () => {
      try {
        await apiJson(`/api/reminders/${draftId}`, {
          method: "PATCH",
          body: JSON.stringify({ content: editContent }),
        });
        setEditingId(null);
        refreshSoon("Draft updated");
      } catch (err) {
        setError(err instanceof ApiRequestError ? err.message : "Could not update draft");
      }
    });
  }

  async function copyDraft(draft: ReminderDraftRow) {
    setError(null);
    try {
      await navigator.clipboard.writeText(draft.content);
      await apiJson(`/api/reminders/${draft.id}`, {
        method: "PATCH",
        body: JSON.stringify({ mark_copied: true }),
      });
      refreshSoon("Copied — mark saved");
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Copy failed");
    }
  }

  function toggleReminder(invoiceId: string) {
    setOpenId((prev) => (prev === invoiceId ? null : invoiceId));
    setOkMsg(null);
    setError(null);
  }

  function reminderPanel(action: ActionRow) {
    const invoiceDrafts = draftsByInvoice.get(action.invoiceId) ?? [];
    return (
      <div className="space-y-4 rounded-md border border-cc-border bg-cc-bg/60 p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block text-sm">
            <span className={labelMuted}>Language</span>
            <select
              className={fieldClass}
              value={language}
              onChange={(e) => setLanguage(e.target.value as "en" | "te")}
            >
              {LANGS.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className={labelMuted}>Tone</span>
            <select
              className={fieldClass}
              value={tone}
              onChange={(e) => setTone(e.target.value as (typeof TONES)[number])}
            >
              {TONES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end">
            <Button className="w-full" disabled={pending} onClick={() => generate(action.invoiceId)}>
              {pending ? "Working…" : "Generate draft"}
            </Button>
          </div>
        </div>
        <p className="text-xs text-cc-muted">Drafts are reviewable only — nothing is sent on WhatsApp.</p>

        {invoiceDrafts.length === 0 ? (
          <p className="text-sm text-cc-muted">No drafts yet for this invoice.</p>
        ) : (
          <ul className="space-y-4">
            {invoiceDrafts.map((draft) => (
              <li key={draft.id} className="space-y-2 border-t border-cc-border pt-3">
                <p className="text-xs uppercase tracking-[0.12em] text-cc-muted">
                  {draft.language}/{draft.tone}
                  {draft.copied_at ? " · copied" : ""}
                  {" · "}
                  <Num>{new Date(draft.generated_at).toLocaleString()}</Num>
                </p>
                {editingId === draft.id ? (
                  <>
                    <textarea
                      className={`min-h-28 ${fieldClass} font-telugu`}
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button disabled={pending} onClick={() => saveEdit(draft.id)}>
                        Save
                      </Button>
                      <Button variant="ghost" onClick={() => setEditingId(null)}>
                        Cancel
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <p
                      className={`whitespace-pre-wrap text-sm text-cc-ink ${
                        draft.language === "te" ? "font-telugu" : ""
                      }`}
                    >
                      {draft.content}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setEditingId(draft.id);
                          setEditContent(draft.content);
                        }}
                      >
                        Edit
                      </Button>
                      <Button variant="secondary" onClick={() => void copyDraft(draft)}>
                        Copy
                      </Button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  const top = actions[0];
  const rest = actions.slice(1);

  return (
    <div className="space-y-6">
      {error ? <Alert>{error}</Alert> : null}
      {okMsg ? <Alert tone="ok">{okMsg}</Alert> : null}

      <p className="text-sm text-cc-muted">
        Ranked by cash-buffer impact if payment slips. Impact = how much a delay worsens your buffer
        shortfall.
      </p>

      {actions.length === 0 ? (
        <Card className="p-4 text-sm text-cc-muted sm:p-5">No ranked actions for this horizon.</Card>
      ) : (
        <div className="space-y-4">
          {top ? (
            <div className="cc-rise relative overflow-hidden rounded-xl border border-cc-primary/25 bg-gradient-to-br from-cc-primary/5 via-cc-card to-cc-card p-5 sm:p-6">
              <div
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(520px_240px_at_0%_0%,rgba(67,56,202,0.1),transparent_60%)]"
                aria-hidden
              />
              <div className="relative space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-2 rounded-md bg-cc-primary/10 px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-cc-primary">
                        <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
                        Priority #1
                      </span>
                      {top.overdue ? (
                        <Badge variant="warn">
                          overdue <Num>{top.daysOverdue}</Num>d
                        </Badge>
                      ) : (
                        <Badge variant="neutral">
                          due <Num>{formatDisplayDate(top.expectedReceiptDate)}</Num>
                        </Badge>
                      )}
                    </div>
                    <h2 className="font-display text-2xl text-cc-ink">
                      {top.invoiceNumber}
                      <span className="font-sans text-lg font-normal text-cc-muted">
                        {" "}
                        · {top.customerName}
                      </span>
                    </h2>
                  </div>
                  <Button
                    onClick={() => toggleReminder(top.invoiceId)}
                  >
                    {openId === top.invoiceId ? "Close" : "Reminder draft"}
                  </Button>
                </div>

                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.14em] text-cc-muted">
                    Cash impact
                  </p>
                  <p className="mt-1 font-numeric text-3xl tabular-nums text-cc-ink sm:text-4xl">
                    <Money paise={top.impactValuePaise} />
                  </p>
                  <p className="mt-1 text-sm text-cc-muted">
                    <Money paise={top.outstandingPaise} /> outstanding
                  </p>
                </div>

                <div className="grid gap-3 border-t border-cc-border/70 pt-4 sm:grid-cols-3">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.12em] text-cc-muted">
                      Why #1
                    </p>
                    <p className="mt-1 text-sm text-cc-ink">{top.priorityReason}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.12em] text-cc-muted">
                      If delayed
                    </p>
                    <p className="mt-1 text-sm text-cc-ink">{top.financialImpact}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.12em] text-cc-muted">
                      Do this
                    </p>
                    <p className="mt-1 text-sm text-cc-ink">{top.recommendedAction}</p>
                  </div>
                </div>

                {openId === top.invoiceId ? reminderPanel(top) : null}
              </div>
            </div>
          ) : null}

          {rest.length > 0 ? (
            <ul className="space-y-3">
              {rest.map((action, index) => {
                const rank = index + 2;
                const open = openId === action.invoiceId;
                return (
                  <li key={action.invoiceId}>
                    <Card className="space-y-3 p-4 sm:p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 space-y-1">
                          <p className="font-medium text-cc-ink">
                            #<Num>{rank}</Num> · {action.invoiceNumber}
                            <span className="font-normal text-cc-muted"> · {action.customerName}</span>
                          </p>
                          <p className="text-sm text-cc-muted">{action.priorityReason}</p>
                          <p className="text-sm text-cc-muted">
                            Impact <Money paise={action.impactValuePaise} />
                            {action.overdue ? (
                              <>
                                {" "}
                                <Badge variant="warn">
                                  overdue <Num>{action.daysOverdue}</Num>d
                                </Badge>
                              </>
                            ) : (
                              <>
                                {" · expected "}
                                <Num>{formatDisplayDate(action.expectedReceiptDate)}</Num>
                              </>
                            )}
                            {" · "}
                            <Money paise={action.outstandingPaise} /> outstanding
                          </p>
                        </div>
                        <Button onClick={() => toggleReminder(action.invoiceId)}>
                          {open ? "Close" : "Reminder draft"}
                        </Button>
                      </div>
                      {open ? reminderPanel(action) : null}
                    </Card>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      )}
    </div>
  );
}
