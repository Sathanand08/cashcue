import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { CashCurveChart } from "@/components/ui/CashCurveChart";
import { Metric } from "@/components/ui/Metric";
import { Money, Num } from "@/components/ui/Money";
import { PageHeader } from "@/components/ui/PageHeader";
import { getDb } from "@/lib/db/client";
import { getDemoWorkspaceId } from "@/lib/db/workspace";
import { getBootstrap } from "@/lib/services/bootstrap";
import { getForecast } from "@/lib/services/forecast";

export const dynamic = "force-dynamic";

export default function OverviewPage() {
  const db = getDb();
  const ws = getDemoWorkspaceId();
  const boot = getBootstrap(db, ws);
  const forecast = getForecast(db, ws, 30);
  const bufferOk = forecast.cashNowPaise >= forecast.bufferPaise;
  const breachHint = forecast.firstBreachDate
    ? `First buffer breach ${forecast.firstBreachDate}`
    : "No buffer breach in the next 30 days";

  return (
    <section className="space-y-8">
      <PageHeader
        eyebrow="Overview"
        title={boot.workspace.name}
        description={
          <>
            Cash position and 30-day outlook as of{" "}
            <Num className="text-cc-ink">{boot.as_of}</Num>. See whether you stay above your
            minimum buffer — and what needs attention first.
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          {bufferOk ? (
            <Badge variant="ok">Above minimum buffer</Badge>
          ) : (
            <Badge variant="danger">Below minimum buffer</Badge>
          )}
          {forecast.firstBreachDate ? (
            <Badge variant="danger">
              Breach on <Num>{forecast.firstBreachDate}</Num>
            </Badge>
          ) : (
            <Badge variant="ok">No breach in 30 days</Badge>
          )}
        </div>
      </PageHeader>

      <div className="grid gap-6 sm:grid-cols-2">
        <Card className="p-4 sm:p-5">
          <Metric
            label="Cash now"
            value={<Money paise={forecast.cashNowPaise} />}
            hint={bufferOk ? "Above minimum buffer" : "Below minimum buffer"}
            tone={bufferOk ? "ok" : "danger"}
          />
        </Card>
        <Card className="p-4 sm:p-5">
          <Metric
            label="Minimum buffer"
            value={<Money paise={forecast.bufferPaise} />}
            hint={breachHint}
            tone="warn"
          />
        </Card>
        <Card className="p-4 sm:p-5">
          <Metric
            label="30-day min balance"
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
            label="Workspace"
            value={
              <>
                <Num>{boot.counts.invoices}</Num> invoices
              </>
            }
            hint={
              <>
                <Num>{boot.counts.customers}</Num> customers · as of <Num>{boot.as_of}</Num>
              </>
            }
          />
        </Card>
      </div>

      <CashCurveChart
        series={forecast.series}
        bufferPaise={forecast.bufferPaise}
        firstBreachDate={forecast.firstBreachDate}
      />

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
              <li key={b.outflowId} className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span className="text-cc-ink">
                  {b.title}
                  <span className="text-cc-muted">
                    {" "}
                    · due <Num>{b.dueDate}</Num>
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
        <Link href="/actions" className="font-medium text-cc-primary underline-offset-4 hover:underline">
          Today&apos;s actions
        </Link>
        <Link href="/receivables" className="font-medium text-cc-primary underline-offset-4 hover:underline">
          Receivables
        </Link>
      </div>
    </section>
  );
}
