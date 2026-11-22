"use client";

import { useMemo, useState, useTransition } from "react";
import { apiJson, ApiRequestError } from "@/lib/api/browser";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { fieldClass, labelMuted } from "@/components/ui/field";
import { Metric } from "@/components/ui/Metric";
import { Money, Num } from "@/components/ui/Money";
import { ScenarioCurveChart } from "@/components/ui/ScenarioCurveChart";

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
                        Expected <Num>{expected}</Num>
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
        <Card className="space-y-6 p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-xl text-cc-ink">Baseline vs delayed</h2>
            {shortfallWorse ? (
              <Badge variant="danger">
                +<Num>{shiftDays}</Num>d shortfall{" "}
                <Money paise={result.comparison.shortfallDeltaPaise} />
              </Badge>
            ) : (
              <Badge variant="ok">No extra shortfall</Badge>
            )}
          </div>

          {result.shifted.length > 0 ? (
            <ul className="space-y-1 text-sm text-cc-muted">
              {result.shifted.map((s) => (
                <li key={s.invoiceId}>
                  {s.invoiceNumber}: <Num>{s.from}</Num> → <Num>{s.to}</Num>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-cc-muted">
              No receipt dates were shifted (overdue invoices keep their current expected timing).
            </p>
          )}

          <ScenarioCurveChart
            baselineSeries={result.baseline.series}
            scenarioSeries={result.scenario.series}
            bufferPaise={result.baseline.bufferPaise}
            baselineFirstBreach={result.comparison.baselineFirstBreach}
            scenarioFirstBreach={result.comparison.scenarioFirstBreach}
            shiftDays={shiftDays}
          />

          <div className="grid gap-6 sm:grid-cols-2">
            <Metric
              label="Min balance"
              value={<Money paise={result.comparison.scenarioMinPaise} />}
              hint={
                <>
                  Baseline <Money paise={result.comparison.baselineMinPaise} /> · Change{" "}
                  <Money paise={result.comparison.changeInMinPaise} />
                </>
              }
              tone={result.comparison.changeInMinPaise < 0 ? "danger" : "default"}
            />
            <Metric
              label="Buffer shortfall delta"
              value={<Money paise={result.comparison.shortfallDeltaPaise} />}
              hint={
                <>
                  Max gap <Money paise={result.comparison.baselineMaxGapPaise} /> →{" "}
                  <Money paise={result.comparison.scenarioMaxGapPaise} />
                </>
              }
              tone={shortfallWorse ? "danger" : "ok"}
            />
            <Metric
              label="First buffer breach"
              value={
                <Num>{result.comparison.scenarioFirstBreach ?? "none"}</Num>
              }
              hint={
                <>
                  Baseline <Num>{result.comparison.baselineFirstBreach ?? "none"}</Num>
                </>
              }
              tone={result.comparison.scenarioFirstBreach ? "danger" : "ok"}
            />
            <Metric
              label="Worst date"
              value={<Num>{result.comparison.scenarioWorstDate ?? "—"}</Num>}
              hint={
                <>
                  Baseline <Num>{result.comparison.baselineWorstDate ?? "—"}</Num>
                </>
              }
            />
          </div>

          {result.comparison.newlyThreatenedBills.length > 0 ? (
            <div className="space-y-2">
              <h3 className="font-medium text-cc-ink">Newly threatened bills</h3>
              <ul className="space-y-1 text-sm text-cc-muted">
                {result.comparison.newlyThreatenedBills.map((title) => (
                  <li key={title}>
                    {title} <Badge variant="danger">At risk</Badge>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {result.comparison.worsenedBills.length > 0 ? (
            <div className="space-y-2">
              <h3 className="font-medium text-cc-ink">Worsened bill gaps</h3>
              <ul className="space-y-1 text-sm text-cc-muted">
                {result.comparison.worsenedBills.map((b) => (
                  <li key={b.outflowId}>
                    {b.title}: <Money paise={b.baselineGapPaise} /> →{" "}
                    <Money paise={b.scenarioGapPaise} className="text-cc-danger-fg" />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}
