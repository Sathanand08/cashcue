import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { CashCurveChart } from "@/components/ui/CashCurveChart";
import { HorizonPills } from "@/components/ui/HorizonPills";
import { Metric } from "@/components/ui/Metric";
import { Money, Num } from "@/components/ui/Money";
import { PageHeader } from "@/components/ui/PageHeader";
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

  return (
    <section className="space-y-8">
      <PageHeader
        eyebrow="Cash Forecast"
        title={
          <>
            <Num>{days}</Num>-day outlook
          </>
        }
        description={
          <>
            Projected cash for {boot.workspace.name} as of <Num className="text-cc-ink">{boot.as_of}</Num>.
            Indigo is your running balance; amber is the minimum buffer.
          </>
        }
      >
        <HorizonPills basePath="/forecast" active={days} ariaLabel="Forecast horizon" />
      </PageHeader>

      <CashCurveChart
        series={forecast.series}
        bufferPaise={forecast.bufferPaise}
        firstBreachDate={forecast.firstBreachDate}
      />

      <div className="grid gap-6 sm:grid-cols-2">
        <Card className="p-4 sm:p-5">
          <Metric label="Cash now" value={<Money paise={forecast.cashNowPaise} />} />
        </Card>
        <Card className="p-4 sm:p-5">
          <Metric
            label="Minimum buffer"
            value={<Money paise={forecast.bufferPaise} />}
            hint={
              forecast.firstBreachDate ? (
                <>
                  First breach <Num>{forecast.firstBreachDate}</Num>
                </>
              ) : (
                <>
                  No buffer breach in <Num>{days}</Num> days
                </>
              )
            }
            tone="warn"
          />
        </Card>
        <Card className="p-4 sm:p-5">
          <Metric
            label="Period min balance"
            value={<Money paise={forecast.minBalancePaise} />}
            hint={
              forecast.minBalanceDate ? (
                <>
                  On <Num>{forecast.minBalanceDate}</Num>
                </>
              ) : undefined
            }
            tone={forecast.minBalancePaise < forecast.bufferPaise ? "danger" : "default"}
          />
        </Card>
        <Card className="p-4 sm:p-5">
          <Metric
            label="In / out this period"
            value={
              <>
                <Money paise={forecast.receiptsInPeriodPaise} /> /{" "}
                <Money paise={forecast.outflowsInPeriodPaise} />
              </>
            }
            hint={
              forecast.maxGapDate ? (
                <>
                  Max buffer gap <Money paise={forecast.maxGapPaise} /> on{" "}
                  <Num>{forecast.maxGapDate}</Num>
                </>
              ) : (
                <>
                  <Num>{belowBuffer.length}</Num> day(s) below buffer
                </>
              )
            }
          />
        </Card>
      </div>

      <Card className="space-y-3 p-4 sm:p-5">
        <h2 className="font-display text-xl text-cc-ink">Cash movement days</h2>
        <p className="text-sm text-cc-muted">
          Showing <Num>{eventDays.length}</Num> day(s) with receipts or bills (of{" "}
          <Num>{forecast.series.length}</Num> in the series).
        </p>
        {eventDays.length === 0 ? (
          <p className="text-sm text-cc-muted">No scheduled cash events in this horizon.</p>
        ) : (
          <ul className="divide-y divide-cc-border border-y border-cc-border">
            {eventDays.map((point) => {
              const under = point.balancePaise < forecast.bufferPaise;
              return (
                <li key={point.date} className="py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-medium font-numeric tabular-nums text-cc-ink">{point.date}</p>
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
                        {e.type === "receipt" ? "In" : "Out"} · {e.label} · <Money paise={e.amountPaise} />
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
                    · due <Num>{b.dueDate}</Num> · gap <Money paise={b.bufferGapPaise} />
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
