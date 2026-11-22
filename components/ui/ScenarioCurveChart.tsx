"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
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

export type ScenarioCurvePoint = {
  date: string;
  balancePaise: number;
};

type Props = {
  baselineSeries: ScenarioCurvePoint[];
  scenarioSeries: ScenarioCurvePoint[];
  bufferPaise: number;
  baselineFirstBreach?: string | null;
  scenarioFirstBreach?: string | null;
  shiftDays?: number;
  className?: string;
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

/** Dual cash curves via Recharts: baseline projection vs delayed simulation. */
export function ScenarioCurveChart({
  baselineSeries,
  scenarioSeries,
  bufferPaise,
  baselineFirstBreach,
  scenarioFirstBreach,
  shiftDays = 15,
  className = "",
}: Props) {
  if (baselineSeries.length === 0 && scenarioSeries.length === 0) {
    return (
      <div className={`rounded-lg border border-cc-border bg-cc-bg/60 p-6 text-sm text-cc-muted ${className}`.trim()}>
        No scenario series to chart.
      </div>
    );
  }

  const baselineByDate = new Map(baselineSeries.map((p) => [p.date, p.balancePaise]));
  const scenarioByDate = new Map(scenarioSeries.map((p) => [p.date, p.balancePaise]));
  const dates =
    baselineSeries.length >= scenarioSeries.length
      ? baselineSeries.map((p) => p.date)
      : scenarioSeries.map((p) => p.date);

  const data = dates.map((date) => ({
    date,
    baseline: baselineByDate.get(date) ?? null,
    scenario: scenarioByDate.get(date) ?? null,
  }));

  const baselineBreach = baselineFirstBreach
    ? data.find((d) => d.date === baselineFirstBreach && d.baseline != null)
    : undefined;
  const scenarioBreach = scenarioFirstBreach
    ? data.find((d) => d.date === scenarioFirstBreach && d.scenario != null)
    : undefined;

  return (
    <div className={`rounded-lg border border-cc-border bg-cc-bg/40 p-4 sm:p-5 ${className}`.trim()}>
      <div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-cc-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 rounded-full bg-cc-primary" aria-hidden />
          Baseline projection
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 border-t-2 border-dashed border-cc-danger" aria-hidden />
          +{shiftDays}d simulation
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 border-t-2 border-dashed border-cc-amber" aria-hidden />
          Min buffer
        </span>
      </div>

      <ChartFrame heightClass="h-72 sm:h-80">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={220}>
          <LineChart data={data} margin={chartMargin}>
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
                if (value == null || value === "") return ["—", String(name)];
                const n = typeof value === "number" ? value : Number(value);
                const label =
                  name === "baseline"
                    ? "Baseline"
                    : name === "scenario"
                      ? `+${shiftDays}d delayed`
                      : String(name);
                return [Number.isFinite(n) ? formatINR(n) : "—", label];
              }}
            />
            <ReferenceLine
              y={bufferPaise}
              stroke={CHART.amber}
              strokeDasharray="6 4"
              strokeWidth={2}
              ifOverflow="extendDomain"
            />
            <Line
              type="monotone"
              dataKey="baseline"
              name="baseline"
              stroke={CHART.primary}
              strokeWidth={2.5}
              dot={false}
              connectNulls
              activeDot={{ r: 4, fill: CHART.primary, stroke: "#fff", strokeWidth: 2 }}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="scenario"
              name="scenario"
              stroke={CHART.danger}
              strokeWidth={2.5}
              strokeDasharray="7 4"
              dot={false}
              connectNulls
              activeDot={{ r: 4, fill: CHART.danger, stroke: "#FFE4E6", strokeWidth: 2 }}
              isAnimationActive={false}
            />
            {baselineBreach && baselineBreach.baseline != null ? (
              <ReferenceDot
                x={baselineBreach.date}
                y={baselineBreach.baseline}
                r={4.5}
                fill={CHART.primary}
                stroke="#FFFFFF"
                strokeWidth={2}
              />
            ) : null}
            {scenarioBreach && scenarioBreach.scenario != null ? (
              <ReferenceDot
                x={scenarioBreach.date}
                y={scenarioBreach.scenario}
                r={5}
                fill={CHART.danger}
                stroke="#FFE4E6"
                strokeWidth={2}
              />
            ) : null}
          </LineChart>
        </ResponsiveContainer>
      </ChartFrame>
    </div>
  );
}
