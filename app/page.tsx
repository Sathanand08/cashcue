import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { CashCurveChart } from "@/components/ui/CashCurveChart";
import { Money, Num } from "@/components/ui/Money";
import { PageHeader } from "@/components/ui/PageHeader";
import { getDb } from "@/lib/db/client";
import { getDemoWorkspaceId } from "@/lib/db/workspace";
import { formatDisplayDate } from "@/lib/format-date";
import { getBootstrap } from "@/lib/services/bootstrap";
import { getForecast } from "@/lib/services/forecast";

export const dynamic = "force-dynamic";

export default function OverviewPage() {
  const db = getDb();
  const ws = getDemoWorkspaceId();
  const boot = getBootstrap(db, ws);
  const forecast = getForecast(db, ws, 30);

  const cashAboveBuffer = forecast.cashNowPaise >= forecast.bufferPaise;
  const hasBreach = Boolean(forecast.firstBreachDate);
  const minBelowBuffer = forecast.minBalancePaise < forecast.bufferPaise;
  const safetyMarginPaise = forecast.cashNowPaise - forecast.bufferPaise;

  const health: "safe" | "attention" | "risk" = hasBreach || !cashAboveBuffer
    ? "risk"
    : minBelowBuffer
      ? "attention"
      : "safe";

  const healthCopy =
    health === "safe"
      ? {
          label: "Safe for 30 days",
          detail: "Cash stays above your minimum buffer in this outlook.",
          heroClass: "border-cc-ok-fg/20 bg-gradient-to-br from-cc-ok-bg/80 via-cc-card to-cc-card",
          glowClass: "bg-[radial-gradient(600px_280px_at_0%_0%,rgba(21,128,61,0.12),transparent_60%)]",
          statusClass: "bg-cc-ok-bg text-cc-ok-fg",
          amountClass: "text-cc-ok-fg",
        }
      : health === "attention"
        ? {
            label: "Watch closely",
            detail: "You are above buffer today, but the 30-day path gets tight.",
            heroClass: "border-cc-amber/30 bg-gradient-to-br from-cc-amber-bg/90 via-cc-card to-cc-card",
            glowClass: "bg-[radial-gradient(600px_280px_at_0%_0%,rgba(217,119,6,0.14),transparent_60%)]",
            statusClass: "bg-cc-amber-bg text-cc-amber-fg",
            amountClass: "text-cc-amber-fg",
          }
        : {
            label: "Cash at risk",
            detail: forecast.firstBreachDate
              ? `Buffer breach expected on ${formatDisplayDate(forecast.firstBreachDate)}.`
              : "Cash is already below your minimum buffer.",
            heroClass: "border-cc-danger/25 bg-gradient-to-br from-cc-danger-bg/90 via-cc-card to-cc-card",
            glowClass: "bg-[radial-gradient(600px_280px_at_0%_0%,rgba(225,29,72,0.12),transparent_60%)]",
            statusClass: "bg-cc-danger-bg text-cc-danger-fg",
            amountClass: "text-cc-danger-fg",
          };

  return (
    <section className="space-y-8">
      <div className="cc-rise">
        <PageHeader
          eyebrow="Overview"
          title={boot.workspace.name}
          description={
            <>
              One question for {formatDisplayDate(boot.as_of)}: are you financially safe over the next
              30 days?
            </>
          }
        />
      </div>

      <div
        className={`cc-rise cc-rise-delay-1 relative overflow-hidden rounded-xl border p-5 sm:p-7 ${healthCopy.heroClass}`}
      >
        <div className={`pointer-events-none absolute inset-0 ${healthCopy.glowClass}`} aria-hidden />
        <div className="relative grid gap-6 lg:grid-cols-[1.4fr_auto] lg:items-end">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center gap-2 rounded-md px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.12em] ${healthCopy.statusClass}`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
                {healthCopy.label}
              </span>
              {forecast.firstBreachDate ? (
                <Badge variant="danger">
                  Breach {formatDisplayDate(forecast.firstBreachDate)}
                </Badge>
              ) : (
                <Badge variant="ok">No breach in 30 days</Badge>
              )}
            </div>

            <div>
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-cc-muted">Cash now</p>
              <p
                className={`mt-1 font-numeric text-4xl tabular-nums tracking-tight sm:text-5xl ${healthCopy.amountClass}`}
              >
                <Money paise={forecast.cashNowPaise} />
              </p>
              <p className="mt-2 max-w-xl text-sm text-cc-muted">{healthCopy.detail}</p>
            </div>

            <div className="flex flex-wrap gap-x-6 gap-y-2 border-t border-cc-border/70 pt-4 text-sm">
              <p className="text-cc-muted">
                Safety margin{" "}
                <span
                  className={`font-numeric font-medium tabular-nums ${
                    safetyMarginPaise >= 0 ? "text-cc-ok-fg" : "text-cc-danger-fg"
                  }`}
                >
                  <Money paise={safetyMarginPaise} />
                </span>
              </p>
              <p className="text-cc-muted">
                Minimum buffer{" "}
                <span className="font-numeric font-medium tabular-nums text-cc-ink">
                  <Money paise={forecast.bufferPaise} />
                </span>
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row lg:flex-col">
            <Link
              href="/actions"
              className="inline-flex items-center justify-center rounded-md bg-cc-primary px-4 py-2.5 text-sm font-medium text-white transition hover:bg-cc-primary-hover"
            >
              Today&apos;s actions
            </Link>
            <Link
              href="/simulator"
              className="inline-flex items-center justify-center rounded-md border border-cc-border bg-cc-card/80 px-4 py-2.5 text-sm font-medium text-cc-ink transition hover:bg-cc-bg"
            >
              Run what-if
            </Link>
          </div>
        </div>
      </div>

      <div className="cc-rise cc-rise-delay-2 grid gap-4 sm:grid-cols-3">
        <Card className="p-4 sm:p-5">
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-cc-muted">Minimum buffer</p>
          <p className="mt-2 font-numeric text-2xl tabular-nums text-cc-amber-fg sm:text-3xl">
            <Money paise={forecast.bufferPaise} />
          </p>
          <p className="mt-1 text-sm text-cc-muted">Floor you want to stay above</p>
        </Card>
        <Card className="p-4 sm:p-5">
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-cc-muted">
            30-day low
          </p>
          <p
            className={`mt-2 font-numeric text-2xl tabular-nums sm:text-3xl ${
              minBelowBuffer ? "text-cc-danger-fg" : "text-cc-ink"
            }`}
          >
            <Money paise={forecast.minBalancePaise} />
          </p>
          <p className="mt-1 text-sm text-cc-muted">
            {forecast.minBalanceDate ? (
              <>
                Lowest on <Num>{formatDisplayDate(forecast.minBalanceDate)}</Num>
              </>
            ) : (
              "Projected minimum in this window"
            )}
          </p>
        </Card>
        <Card className="p-4 sm:p-5">
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-cc-muted">
            In / out (30d)
          </p>
          <p className="mt-2 font-numeric text-2xl tabular-nums text-cc-ink sm:text-3xl">
            <Money paise={forecast.receiptsInPeriodPaise} />
            <span className="mx-1 text-cc-muted">/</span>
            <Money paise={forecast.outflowsInPeriodPaise} />
          </p>
          <p className="mt-1 text-sm text-cc-muted">Expected receipts vs scheduled outflows</p>
        </Card>
      </div>

      <div className="cc-rise cc-rise-delay-3 space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-xl text-cc-ink sm:text-2xl">30-day cash path</h2>
            <p className="mt-1 text-sm text-cc-muted">
              Indigo is running cash; amber is your buffer line.
            </p>
          </div>
          <Link
            href="/forecast"
            className="text-sm font-medium text-cc-primary underline-offset-4 hover:underline"
          >
            Full forecast
          </Link>
        </div>
        <CashCurveChart
          series={forecast.series}
          bufferPaise={forecast.bufferPaise}
          firstBreachDate={forecast.firstBreachDate}
          animated
        />
      </div>

      {forecast.overdueReceivables.length > 0 ? (
        <Card className="space-y-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="font-display text-xl text-cc-ink">Needs follow-up</h2>
              <p className="mt-1 text-sm text-cc-muted">Overdue receivables pulling on your cash path.</p>
            </div>
            <Link
              href="/actions"
              className="text-sm font-medium text-cc-primary underline-offset-4 hover:underline"
            >
              Ranked actions
            </Link>
          </div>
          <ul className="divide-y divide-cc-border border-y border-cc-border">
            {forecast.overdueReceivables.map((r) => (
              <li
                key={r.invoiceId}
                className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
              >
                <div className="min-w-0 space-y-1">
                  <p className="font-medium text-cc-ink">
                    {r.invoiceNumber}
                    <span className="font-normal text-cc-muted"> · {r.customerName}</span>
                  </p>
                  <Badge variant="warn">
                    <Num>{r.daysOverdue}</Num>d overdue
                  </Badge>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Money paise={r.outstandingPaise} className="font-medium text-cc-ink" />
                  <Link
                    href="/actions"
                    className="rounded-md border border-cc-border px-2.5 py-1.5 text-xs font-medium text-cc-ink transition hover:bg-cc-bg"
                  >
                    Follow up
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <Card className="p-4 text-sm text-cc-muted sm:p-5">
          No overdue receivables —{" "}
          <Link href="/receivables" className="font-medium text-cc-primary hover:underline">
            review receivables
          </Link>
          .
        </Card>
      )}

      {forecast.threatenedBills.length > 0 ? (
        <Card className="space-y-3 p-4 sm:p-5">
          <h2 className="font-display text-xl text-cc-ink">Bills at buffer risk</h2>
          <ul className="space-y-2">
            {forecast.threatenedBills.slice(0, 5).map((b) => (
              <li
                key={b.outflowId}
                className="flex flex-wrap items-baseline justify-between gap-2 text-sm"
              >
                <span className="text-cc-ink">
                  {b.title}
                  <span className="text-cc-muted">
                    {" "}
                    · due <Num>{formatDisplayDate(b.dueDate)}</Num>
                  </span>{" "}
                  <Badge variant="danger">At risk</Badge>
                </span>
                <Money paise={b.amountPaise} className="font-medium text-cc-ink" />
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <p className="text-xs text-cc-muted">{forecast.assumption}</p>

      <div className="flex flex-wrap gap-3 border-t border-cc-border pt-6 text-sm">
        <Link href="/forecast" className="font-medium text-cc-primary underline-offset-4 hover:underline">
          Open cash forecast
        </Link>
        <Link href="/simulator" className="font-medium text-cc-primary underline-offset-4 hover:underline">
          What-if simulator
        </Link>
        <Link href="/receivables" className="font-medium text-cc-primary underline-offset-4 hover:underline">
          Receivables
        </Link>
      </div>
    </section>
  );
}
