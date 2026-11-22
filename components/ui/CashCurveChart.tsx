"use client";

import { useId } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatINR } from "@/lib/money";
import { CHART, chartMargin } from "@/components/ui/chartTheme";
import { ChartFrame } from "@/components/ui/ChartFrame";

export type CashCurvePoint = {
  date: string;
  balancePaise: number;
};

type Props = {
  series: CashCurvePoint[];
  bufferPaise: number;
  firstBreachDate?: string | null;
  className?: string;
  /** Soft draw-in for hero overview; off by default for denser screens. */
  animated?: boolean;
};

function shortINR(paise: number): string {
  const rupees = Math.round(paise / 100);
  const abs = Math.abs(rupees);
  const sign = rupees < 0 ? "−" : "";
  if (abs >= 10000000) return `${sign}₹${(abs / 10000000).toFixed(1)}Cr`;
  if (abs >= 100000) return `${sign}₹${(abs / 100000).toFixed(1)}L`;
  if (abs >= 1000) return `${sign}₹${(abs / 1000).toFixed(1)}k`;
  return `${sign}₹${abs}`;
}

function tickDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${Number(m[3])} ${months[Number(m[2]) - 1]}`;
}

/** Presentational cash forecast chart (Recharts) — uses precomputed series only. */
export function CashCurveChart({
  series,
  bufferPaise,
  firstBreachDate,
  className = "",
  animated = false,
}: Props) {
  const fillId = `cashFill-${useId().replace(/:/g, "")}`;

  if (series.length === 0) {
    return (
      <div className={`rounded-lg border border-cc-border bg-cc-card p-6 text-sm text-cc-muted ${className}`.trim()}>
        No forecast series to chart.
      </div>
    );
  }

  const data = series.map((p) => ({
    date: p.date,
    balance: p.balancePaise,
  }));

  const breach = firstBreachDate ? data.find((d) => d.date === firstBreachDate) : undefined;

  return (
    <div className={`rounded-lg border border-cc-border bg-cc-card p-4 sm:p-5 ${className}`.trim()}>
      <div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-cc-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 rounded-full bg-cc-primary" aria-hidden />
          Cash balance
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 border-t-2 border-dashed border-cc-amber" aria-hidden />
          Min buffer
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-cc-danger" aria-hidden />
          Buffer breach
        </span>
      </div>

      <ChartFrame>
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={200}>
          <ComposedChart data={data} margin={chartMargin}>
            <defs>
              <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={CHART.primary} stopOpacity={0.22} />
                <stop offset="100%" stopColor={CHART.primary} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={tickDate}
              tick={{ fill: CHART.muted, fontSize: 11 }}
              axisLine={{ stroke: CHART.grid }}
              tickLine={false}
              minTickGap={28}
            />
            <YAxis
              tickFormatter={shortINR}
              tick={{ fill: CHART.muted, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={56}
              domain={["auto", "auto"]}
            />
            <Tooltip
              contentStyle={{
                background: CHART.card,
                border: `1px solid ${CHART.tooltipBorder}`,
                borderRadius: 8,
                fontSize: 12,
                color: CHART.ink,
              }}
              labelFormatter={(label) => String(label)}
              formatter={(value, name) => {
                const n = typeof value === "number" ? value : Number(value);
                return [
                  Number.isFinite(n) ? formatINR(n) : "—",
                  name === "balance" ? "Cash balance" : String(name),
                ];
              }}
            />
            <ReferenceLine
              y={bufferPaise}
              stroke={CHART.amber}
              strokeDasharray="6 4"
              strokeWidth={2}
              ifOverflow="extendDomain"
            />
            <Area
              type="monotone"
              dataKey="balance"
              stroke="none"
              fill={`url(#${fillId})`}
              isAnimationActive={animated}
              animationDuration={900}
            />
            <Line
              type="monotone"
              dataKey="balance"
              name="balance"
              stroke={CHART.primary}
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 4, fill: CHART.primary, stroke: "#fff", strokeWidth: 2 }}
              isAnimationActive={animated}
              animationDuration={900}
            />
            {breach ? (
              <ReferenceDot
                x={breach.date}
                y={breach.balance}
                r={5}
                fill={CHART.danger}
                stroke="#FFE4E6"
                strokeWidth={2}
              />
            ) : null}
          </ComposedChart>
        </ResponsiveContainer>
      </ChartFrame>
    </div>
  );
}
