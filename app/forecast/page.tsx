import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { CashCurveChart } from "@/components/ui/CashCurveChart";
import { HorizonPills } from "@/components/ui/HorizonPills";
import { Money, Num } from "@/components/ui/Money";
import { PageHeader } from "@/components/ui/PageHeader";
import { formatDisplayDate } from "@/lib/format-date";
import { getDb } from "@/lib/db/client";
import { getDemoWorkspaceId } from "@/lib/db/workspace";
import { getBootstrap } from "@/lib/services/bootstrap";
import { getForecast, type ForecastHorizon } from "@/lib/services/forecast";

export const dynamic = "force-dynamic";

function parseDays(raw: string | string[] | undefined): ForecastHorizon {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === "60") return 60;
  if (value === "90") return 90;
  return 30;
}

export default async function ForecastPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string | string[] }>;
}) {
  const params = await searchParams;
  const days = parseDays(params.days);
  const db = getDb();
  const ws = getDemoWorkspaceId();
  const boot = getBootstrap(db, ws);
  const forecast = getForecast(db, ws, days);
  const eventDays = forecast.series.filter((p) => p.events.length > 0);
  const belowBuffer = forecast.series.filter((p) => p.balancePaise < forecast.bufferPaise);
  const atRisk = forecast.minBalancePaise < forecast.bufferPaise || Boolean(forecast.firstBreachDate);

  const focusDate = forecast.firstBreachDate ?? forecast.minBalanceDate;
  const focusPoint = focusDate ? forecast.series.find((p) => p.date === focusDate) : undefined;

  const whyEvents = (() => {
    if (!focusPoint || focusPoint.events.length === 0) {
      // Fall back to largest absolute moves near the focus window.
      const nearby = forecast.series
        .filter((p) => p.events.length > 0)
        .flatMap((p) => p.events.map((e) => ({ ...e, date: p.date })))
        .sort((a, b) => Math.abs(b.amountPaise) - Math.abs(a.amountPaise))
        .slice(0, 3);
      return nearby;
    }
    return [...focusPoint.events]
      .sort((a, b) => Math.abs(b.amountPaise) - Math.abs(a.amountPaise))
      .slice(0, 3)
      .map((e) => ({ ...e, date: focusPoint.date }));
  })();

  return (
    <section className="space-y-8">
      <div className="cc-rise">
        <PageHeader
          eyebrow="Cash Forecast"
          title={
            <>
              <Num>{days}</Num>-day outlook
            </>
          }
          description={
            <>
              Projected cash for {boot.workspace.name} as of{" "}
              <Num className="text-cc-ink">{formatDisplayDate(boot.as_of)}</Num>. See when cash dips —
              and which receipts or bills cause it.
            </>
          }
        >
          <HorizonPills basePath="/forecast" active={days} ariaLabel="Forecast horizon" />
        </PageHeader>
      </div>

      <div className="cc-rise cc-rise-delay-1 space-y-3">
        <CashCurveChart
          series={forecast.series}
          bufferPaise={forecast.bufferPaise}
          firstBreachDate={forecast.firstBreachDate}
          animated
        />
      </div>

      <div
        className={`cc-rise cc-rise-delay-2 relative overflow-hidden rounded-xl border p-5 sm:p-6 ${
          atRisk
            ? "border-cc-danger/25 bg-gradient-to-br from-cc-danger-bg/90 via-cc-card to-cc-card"
            : "border-cc-ok-fg/20 bg-gradient-to-br from-cc-ok-bg/70 via-cc-card to-cc-card"
        }`}
      >
        <div
          className={`pointer-events-none absolute inset-0 ${
            atRisk
              ? "bg-[radial-gradient(560px_240px_at_0%_0%,rgba(225,29,72,0.1),transparent_60%)]"
              : "bg-[radial-gradient(560px_240px_at_0%_0%,rgba(21,128,61,0.1),transparent_60%)]"
          }`}
          aria-hidden
        />
        <div className="relative space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-2 rounded-md px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.12em] ${
                atRisk ? "bg-cc-danger-bg text-cc-danger-fg" : "bg-cc-ok-bg text-cc-ok-fg"
              }`}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
              Why cash moves
            </span>
            {forecast.firstBreachDate ? (
              <Badge variant="danger">Breach {formatDisplayDate(forecast.firstBreachDate)}</Badge>
            ) : (
              <Badge variant="ok">Above buffer in window</Badge>
            )}
          </div>

          <div>
            <p className="text-sm text-cc-muted">
              {forecast.firstBreachDate ? (
                <>
                  Risk day <Num className="text-cc-ink">{formatDisplayDate(forecast.firstBreachDate)}</Num>
                  : balance dips to{" "}
                  <Money paise={forecast.minBalancePaise} className="font-medium text-cc-danger-fg" />{" "}
                  below your{" "}
                  <Money paise={forecast.bufferPaise} className="font-medium text-cc-ink" /> buffer.
                </>
              ) : (
                <>
                  Lowest point{" "}
                  <Money paise={forecast.minBalancePaise} className="font-medium text-cc-ink" />
                  {forecast.minBalanceDate ? (
                    <>
                      {" "}
                      on <Num className="text-cc-ink">{formatDisplayDate(forecast.minBalanceDate)}</Num>
                    </>
                  ) : null}{" "}
                  — still above your{" "}
                  <Money paise={forecast.bufferPaise} className="font-medium text-cc-ink" /> buffer.
                </>
              )}
            </p>
          </div>

          {whyEvents.length > 0 ? (
            <div className="space-y-2 border-t border-cc-border/70 pt-4">
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-cc-muted">
                Main drivers
              </p>
              <ul className="space-y-1.5 text-sm text-cc-ink">
                {whyEvents.map((e, idx) => (
                  <li key={`${e.type}-${e.label}-${e.date}-${idx}`} className="flex flex-wrap gap-x-2">
                    <span className="text-cc-muted">
                      {formatDisplayDate(e.date)} · {e.type === "receipt" ? "In" : "Out"}
                    </span>
                    <span>{e.label}</span>
                    <Money paise={e.amountPaise} className="font-medium" />
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="border-t border-cc-border/70 pt-4 text-sm text-cc-muted">
              No scheduled receipts or bills land on the focus day in this horizon.
            </p>
          )}

          <p className="text-xs text-cc-muted">
            Opening cash <Money paise={forecast.cashNowPaise} /> · receipts assumed on expected dates ·
            same-day bills applied before receipts.
          </p>

          <div className="flex flex-wrap gap-2 pt-1">
            <Link
              href="/simulator"
              className="inline-flex items-center justify-center rounded-md bg-cc-primary px-3 py-2 text-sm font-medium text-white transition hover:bg-cc-primary-hover"
            >
              Run what-if
            </Link>
            <Link
              href="/actions"
              className="inline-flex items-center justify-center rounded-md border border-cc-border bg-cc-card/80 px-3 py-2 text-sm font-medium text-cc-ink transition hover:bg-cc-bg"
            >
              Today&apos;s actions
            </Link>
          </div>
        </div>
      </div>

      <div className="cc-rise cc-rise-delay-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4 sm:p-5">
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-cc-muted">Cash now</p>
          <p className="mt-2 font-numeric text-2xl tabular-nums text-cc-ink">
            <Money paise={forecast.cashNowPaise} />
          </p>
        </Card>
        <Card className="p-4 sm:p-5">
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-cc-muted">Minimum buffer</p>
          <p className="mt-2 font-numeric text-2xl tabular-nums text-cc-amber-fg">
            <Money paise={forecast.bufferPaise} />
          </p>
          <p className="mt-1 text-sm text-cc-muted">
            {forecast.firstBreachDate ? (
              <>First breach {formatDisplayDate(forecast.firstBreachDate)}</>
            ) : (
              <>No breach in {days} days</>
            )}
          </p>
        </Card>
        <Card className="p-4 sm:p-5">
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-cc-muted">Period low</p>
          <p
            className={`mt-2 font-numeric text-2xl tabular-nums ${
              forecast.minBalancePaise < forecast.bufferPaise ? "text-cc-danger-fg" : "text-cc-ink"
            }`}
          >
            <Money paise={forecast.minBalancePaise} />
          </p>
          <p className="mt-1 text-sm text-cc-muted">
            {forecast.minBalanceDate ? formatDisplayDate(forecast.minBalanceDate) : "—"}
          </p>
        </Card>
        <Card className="p-4 sm:p-5">
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-cc-muted">In / out</p>
          <p className="mt-2 font-numeric text-2xl tabular-nums text-cc-ink">
            <Money paise={forecast.receiptsInPeriodPaise} />
            <span className="mx-1 text-cc-muted">/</span>
            <Money paise={forecast.outflowsInPeriodPaise} />
          </p>
          <p className="mt-1 text-sm text-cc-muted">
            {forecast.maxGapDate ? (
              <>
                Max gap <Money paise={forecast.maxGapPaise} /> on{" "}
                {formatDisplayDate(forecast.maxGapDate)}
              </>
            ) : (
              <>
                <Num>{belowBuffer.length}</Num> day(s) below buffer
              </>
            )}
          </p>
        </Card>
      </div>

      <Card className="space-y-3 p-4 sm:p-5">
        <h2 className="font-display text-xl text-cc-ink">Cash movement days</h2>
        <p className="text-sm text-cc-muted">
          Showing <Num>{eventDays.length}</Num> day(s) with receipts or bills (of{" "}
          <Num>{forecast.series.length}</Num> in the series).
          {focusDate ? (
            <>
              {" "}
              Focus day highlighted: <Num>{formatDisplayDate(focusDate)}</Num>.
            </>
          ) : null}
        </p>
        {eventDays.length === 0 ? (
          <p className="text-sm text-cc-muted">No scheduled cash events in this horizon.</p>
        ) : (
          <ul className="divide-y divide-cc-border border-y border-cc-border">
            {eventDays.map((point) => {
              const under = point.balancePaise < forecast.bufferPaise;
              const isFocus = focusDate === point.date;
              return (
                <li
                  key={point.date}
                  className={`py-3 ${isFocus ? "bg-cc-amber-bg/40 px-3 sm:-mx-1 sm:rounded-md" : ""}`}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-medium font-numeric tabular-nums text-cc-ink">
                      {formatDisplayDate(point.date)}
                      {isFocus ? (
                        <>
                          {" "}
                          <Badge variant="warn">Focus</Badge>
                        </>
                      ) : null}
                    </p>
                    <p className={`text-sm font-medium ${under ? "text-cc-danger-fg" : "text-cc-ink"}`}>
                      Balance <Money paise={point.balancePaise} />
                      {under ? (
                        <>
                          {" "}
                          <Badge variant="danger">Below buffer</Badge>
                        </>
                      ) : null}
                    </p>
                  </div>
                  <ul className="mt-2 space-y-1 text-sm text-cc-muted">
                    {point.events.map((e, idx) => (
                      <li key={`${e.type}-${e.label}-${idx}`}>
                        {e.type === "receipt" ? "In" : "Out"} · {e.label} ·{" "}
                        <Money paise={e.amountPaise} />
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {forecast.threatenedBills.length > 0 ? (
        <Card className="space-y-3 p-4 sm:p-5">
          <h2 className="font-display text-xl text-cc-ink">Bills at buffer risk</h2>
          <ul className="space-y-2">
            {forecast.threatenedBills.map((b) => (
              <li
                key={`${b.outflowId ?? b.title}-${b.dueDate}`}
                className="flex flex-wrap items-baseline justify-between gap-2 text-sm"
              >
                <span className="text-cc-ink">
                  {b.title}
                  <span className="text-cc-muted">
                    {" "}
                    · due <Num>{formatDisplayDate(b.dueDate)}</Num> · gap{" "}
                    <Money paise={b.bufferGapPaise} />
                  </span>{" "}
                  <Badge variant="danger">Shortfall</Badge>
                </span>
                <Money paise={b.amountPaise} className="font-medium text-cc-ink" />
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {forecast.overdueReceivables.length > 0 ? (
        <Card className="space-y-3 p-4 sm:p-5">
          <h2 className="font-display text-xl text-cc-ink">Overdue receivables</h2>
          <ul className="space-y-2">
            {forecast.overdueReceivables.map((r) => (
              <li key={r.invoiceId} className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span className="text-cc-ink">
                  {r.invoiceNumber} · {r.customerName}{" "}
                  <Badge variant="warn">
                    <Num>{r.daysOverdue}</Num>d overdue
                  </Badge>
                </span>
                <Money paise={r.outstandingPaise} className="font-medium text-cc-ink" />
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <p className="text-xs text-cc-muted">{forecast.assumption}</p>
    </section>
  );
}
