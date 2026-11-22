"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { apiJson, ApiRequestError } from "@/lib/api/browser";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { fieldClass, labelMuted } from "@/components/ui/field";
import { Money, Num } from "@/components/ui/Money";
import { ScenarioCurveChart } from "@/components/ui/ScenarioCurveChart";
import { formatDisplayDate } from "@/lib/format-date";

export type SimulatorInvoice = {
  id: string;
  invoice_number: string;
  customer_name: string;
  outstanding_paise: number;
  due_date: string;
  promised_date: string | null;
  status: string;
  days_overdue: number;
};

type ForecastSeriesPoint = {
  date: string;
  balancePaise: number;
};

type DelayScenarioResult = {
  baseline: {
    bufferPaise: number;
    series: ForecastSeriesPoint[];
    firstBreachDate: string | null;
  };
  scenario: {
    bufferPaise: number;
    series: ForecastSeriesPoint[];
    firstBreachDate: string | null;
  };
  comparison: {
    baselineMinPaise: number;
    scenarioMinPaise: number;
    changeInMinPaise: number;
    baselineFirstBreach: string | null;
    scenarioFirstBreach: string | null;
    baselineMaxGapPaise: number;
    scenarioMaxGapPaise: number;
    shortfallDeltaPaise: number;
    baselineWorstDate: string | null;
    scenarioWorstDate: string | null;
    newlyThreatenedBills: string[];
    worsenedBills: {
      outflowId: string;
      title: string;
      baselineGapPaise: number;
      scenarioGapPaise: number;
    }[];
  };
  shifted: { invoiceId: string; invoiceNumber: string; from: string; to: string }[];
};

const HORIZONS = [30, 60, 90] as const;

export function SimulatorClient({ invoices }: { invoices: SimulatorInvoice[] }) {
  const defaultSelected = useMemo(() => {
    const aster = invoices.find((i) => i.invoice_number === "INV-001");
    return aster ? [aster.id] : invoices[0] ? [invoices[0].id] : [];
  }, [invoices]);

  const [selected, setSelected] = useState<string[]>(defaultSelected);
  const [shiftDays, setShiftDays] = useState(15);
  const [days, setDays] = useState<(typeof HORIZONS)[number]>(30);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DelayScenarioResult | null>(null);

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    setResult(null);
  }

  function run() {
    setError(null);
    if (selected.length === 0) {
      setError("Select at least one outstanding invoice");
      return;
    }
    if (!Number.isInteger(shiftDays) || shiftDays < 1 || shiftDays > 90) {
      setError("Delay must be an integer between 1 and 90 days");
      return;
    }

    startTransition(async () => {
      try {
        const data = await apiJson<DelayScenarioResult>("/api/forecast/scenarios/delay", {
          method: "POST",
          body: JSON.stringify({
            invoice_ids: selected,
            shift_days: shiftDays,
            days,
          }),
        });
        setResult(data);
      } catch (err) {
        setResult(null);
        setError(err instanceof ApiRequestError ? err.message : "Simulation failed");
      }
    });
  }

  const shortfallWorse = (result?.comparison.shortfallDeltaPaise ?? 0) > 0;

  return (
    <div className="space-y-8">
      <Card className="space-y-4 p-4 sm:p-5">
        <h2 className="font-display text-xl text-cc-ink">Choose invoices to delay</h2>
        {invoices.length === 0 ? (
          <p className="text-sm text-cc-muted">No outstanding sent invoices available to simulate.</p>
        ) : (
          <ul className="divide-y divide-cc-border border-y border-cc-border">
            {invoices.map((inv) => {
              const checked = selected.includes(inv.id);
              const expected = inv.promised_date ?? inv.due_date;
              return (
                <li key={inv.id} className="py-3">
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-1 accent-cc-primary"
                      checked={checked}
                      onChange={() => toggle(inv.id)}
                    />
                    <span className="min-w-0">
                      <span className="block font-medium text-cc-ink">
                        {inv.invoice_number}
                        <span className="font-normal text-cc-muted"> · {inv.customer_name}</span>
                      </span>
                      <span className="mt-1 block text-sm text-cc-muted">
                        Expected <Num>{formatDisplayDate(expected)}</Num>
                        {inv.status === "overdue" ? (
                          <>
                            {" "}
                            <Badge variant="warn">
                              overdue <Num>{inv.days_overdue}</Num>d
                            </Badge>
                          </>
                        ) : null}
                        {" · "}
                        <Money paise={inv.outstanding_paise} /> outstanding
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className={labelMuted}>Delay by (days)</span>
          <input
            type="number"
            min={1}
            max={90}
            className={fieldClass}
            value={shiftDays}
            onChange={(e) => {
              setShiftDays(Number(e.target.value));
              setResult(null);
            }}
          />
        </label>
        <div className="block text-sm">
          <span className={labelMuted}>Forecast horizon</span>
          <div className="mt-1 flex flex-wrap gap-2" role="group" aria-label="Simulator horizon">
            {HORIZONS.map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => {
                  setDays(h);
                  setResult(null);
                }}
                className={
                  days === h
                    ? "rounded-md bg-cc-primary px-3 py-1.5 text-sm font-medium font-numeric tabular-nums text-white"
                    : "rounded-md border border-cc-border bg-cc-card px-3 py-1.5 text-sm font-numeric tabular-nums text-cc-ink hover:bg-cc-bg"
                }
              >
                {h} days
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={run} disabled={pending || invoices.length === 0}>
          {pending ? (
            "Running…"
          ) : (
            <>
              Simulate +<Num>{shiftDays}</Num>-day delay
            </>
          )}
        </Button>
        <p className="text-sm text-cc-muted">Read-only — invoices and cash records are not changed.</p>
      </div>

      {error ? <Alert>{error}</Alert> : null}

      {result ? (
        <div className="cc-rise space-y-6">
          <div
            className={`relative overflow-hidden rounded-xl border p-5 sm:p-7 ${
              shortfallWorse
                ? "border-cc-danger/25 bg-gradient-to-br from-cc-danger-bg/90 via-cc-card to-cc-card"
                : "border-cc-ok-fg/20 bg-gradient-to-br from-cc-ok-bg/80 via-cc-card to-cc-card"
            }`}
          >
            <div
              className={`pointer-events-none absolute inset-0 ${
                shortfallWorse
                  ? "bg-[radial-gradient(600px_280px_at_0%_0%,rgba(225,29,72,0.12),transparent_60%)]"
                  : "bg-[radial-gradient(600px_280px_at_0%_0%,rgba(21,128,61,0.12),transparent_60%)]"
              }`}
              aria-hidden
            />
            <div className="relative grid gap-6 lg:grid-cols-[1.4fr_auto] lg:items-end">
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-2 rounded-md px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.12em] ${
                      shortfallWorse
                        ? "bg-cc-danger-bg text-cc-danger-fg"
                        : "bg-cc-ok-bg text-cc-ok-fg"
                    }`}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
                    {shortfallWorse ? "Extra shortfall" : "Still safe"}
                  </span>
                  <Badge variant={shortfallWorse ? "danger" : "ok"}>
                    +<Num>{shiftDays}</Num> day delay
                  </Badge>
                </div>

                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.14em] text-cc-muted">
                    {shortfallWorse ? "Added buffer shortfall" : "Buffer shortfall change"}
                  </p>
                  <p
                    className={`mt-1 font-numeric text-4xl tabular-nums tracking-tight sm:text-5xl ${
                      shortfallWorse ? "text-cc-danger-fg" : "text-cc-ok-fg"
                    }`}
                  >
                    {shortfallWorse ? "+" : ""}
                    <Money paise={result.comparison.shortfallDeltaPaise} />
                  </p>
                  <p className="mt-2 max-w-xl text-sm text-cc-muted">
                    {result.shifted.length > 0 ? (
                      <>
                        If {result.shifted.map((s) => s.invoiceNumber).join(", ")} slip{" "}
                        <Num>{shiftDays}</Num> days, lowest cash falls from{" "}
                        <Money paise={result.comparison.baselineMinPaise} className="text-cc-ink" /> to{" "}
                        <Money paise={result.comparison.scenarioMinPaise} className="text-cc-ink" />.
                      </>
                    ) : (
                      <>
                        No receipt dates shifted (overdue invoices keep current timing). Lowest cash:{" "}
                        <Money paise={result.comparison.baselineMinPaise} className="text-cc-ink" /> →{" "}
                        <Money paise={result.comparison.scenarioMinPaise} className="text-cc-ink" />.
                      </>
                    )}
                  </p>
                </div>

                <div className="flex flex-wrap gap-x-6 gap-y-2 border-t border-cc-border/70 pt-4 text-sm text-cc-muted">
                  <p>
                    Baseline min{" "}
                    <span className="font-numeric font-medium text-cc-ink">
                      <Money paise={result.comparison.baselineMinPaise} />
                    </span>
                  </p>
                  <p>
                    Delayed min{" "}
                    <span
                      className={`font-numeric font-medium ${
                        result.comparison.changeInMinPaise < 0 ? "text-cc-danger-fg" : "text-cc-ink"
                      }`}
                    >
                      <Money paise={result.comparison.scenarioMinPaise} />
                    </span>
                  </p>
                  <p>
                    First breach{" "}
                    <span className="font-numeric font-medium text-cc-ink">
                      {result.comparison.scenarioFirstBreach
                        ? formatDisplayDate(result.comparison.scenarioFirstBreach)
                        : "none"}
                    </span>
                    <span className="text-cc-muted">
                      {" "}
                      (was{" "}
                      {result.comparison.baselineFirstBreach
                        ? formatDisplayDate(result.comparison.baselineFirstBreach)
                        : "none"}
                      )
                    </span>
                  </p>
                </div>

                {result.shifted.length > 0 ? (
                  <ul className="space-y-1 text-sm text-cc-muted">
                    {result.shifted.map((s) => (
                      <li key={s.invoiceId}>
                        {s.invoiceNumber}: <Num>{formatDisplayDate(s.from)}</Num> →{" "}
                        <Num>{formatDisplayDate(s.to)}</Num>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>

              <div className="flex flex-col gap-2 sm:flex-row lg:flex-col">
                <Link
                  href="/actions"
                  className="inline-flex items-center justify-center rounded-md bg-cc-primary px-4 py-2.5 text-sm font-medium text-white transition hover:bg-cc-primary-hover"
                >
                  Today&apos;s actions
                </Link>
                <Link
                  href="/forecast"
                  className="inline-flex items-center justify-center rounded-md border border-cc-border bg-cc-card/80 px-4 py-2.5 text-sm font-medium text-cc-ink transition hover:bg-cc-bg"
                >
                  Open forecast
                </Link>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <h2 className="font-display text-xl text-cc-ink sm:text-2xl">Baseline vs delayed</h2>
              <p className="mt-1 text-sm text-cc-muted">
                Indigo is baseline cash; rose is the delayed path. Amber is your buffer.
              </p>
            </div>
            <ScenarioCurveChart
              baselineSeries={result.baseline.series}
              scenarioSeries={result.scenario.series}
              bufferPaise={result.baseline.bufferPaise}
              baselineFirstBreach={result.comparison.baselineFirstBreach}
              scenarioFirstBreach={result.comparison.scenarioFirstBreach}
              shiftDays={shiftDays}
            />
            <p className="text-xs text-cc-muted">
              Worst day {result.comparison.scenarioWorstDate
                ? formatDisplayDate(result.comparison.scenarioWorstDate)
                : "—"}
              {" · "}
              Max gap <Money paise={result.comparison.baselineMaxGapPaise} /> →{" "}
              <Money paise={result.comparison.scenarioMaxGapPaise} />
            </p>
          </div>

          {result.comparison.newlyThreatenedBills.length > 0 ? (
            <Card className="space-y-2 p-4 sm:p-5">
              <h3 className="font-display text-lg text-cc-ink">Newly threatened bills</h3>
              <ul className="space-y-1 text-sm text-cc-muted">
                {result.comparison.newlyThreatenedBills.map((title) => (
                  <li key={title}>
                    {title} <Badge variant="danger">At risk</Badge>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {result.comparison.worsenedBills.length > 0 ? (
            <Card className="space-y-2 p-4 sm:p-5">
              <h3 className="font-display text-lg text-cc-ink">Worsened bill gaps</h3>
              <ul className="space-y-1 text-sm text-cc-muted">
                {result.comparison.worsenedBills.map((b) => (
                  <li key={b.outflowId}>
                    {b.title}: <Money paise={b.baselineGapPaise} /> →{" "}
                    <Money paise={b.scenarioGapPaise} className="text-cc-danger-fg" />
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
