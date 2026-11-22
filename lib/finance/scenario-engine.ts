import { addDaysUtc, runForecast, type ForecastInput, type ForecastOutput } from "./forecast-engine";

export interface DelayScenarioResult {
  baseline: ForecastOutput;
  scenario: ForecastOutput;
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
}

/**
 * Compares a baseline forecast with one where the given invoices are delayed.
 * Read-only: the input is never mutated.
 */
export function runDelayScenario(
  input: ForecastInput & { invoiceIds: string[]; shiftDays?: number },
): DelayScenarioResult {
  const { invoiceIds, shiftDays = 15, ...rest } = input;
  const forecastInput: ForecastInput = rest;

  const baseline = runForecast({ ...forecastInput, scenario: undefined });
  const scenario = runForecast({
    ...forecastInput,
    scenario: { shiftInvoiceIds: invoiceIds, shiftDays },
  });

  const shifted: DelayScenarioResult["shifted"] = [];
  for (const inv of forecastInput.invoices) {
    if (!invoiceIds.includes(inv.id)) continue;
    if (inv.workflowStatus === "draft") continue;
    if (inv.amountPaise - inv.paidPaise <= 0) continue;
    const effective = inv.promisedDate ?? inv.dueDate;
    if (effective < forecastInput.asOf) continue; // overdue: not shifted
    shifted.push({
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      from: effective,
      to: addDaysUtc(effective > forecastInput.asOf ? effective : forecastInput.asOf, shiftDays),
    });
  }

  const baselineBilled = new Map<string, number>();
  for (const t of baseline.threatenedBills) {
    if (t.outflowId !== null) baselineBilled.set(t.outflowId, t.bufferGapPaise);
  }

  const newlyThreatenedBills: string[] = [];
  const worsenedBills: DelayScenarioResult["comparison"]["worsenedBills"] = [];
  for (const t of scenario.threatenedBills) {
    const baselineGap = t.outflowId !== null ? baselineBilled.get(t.outflowId) : undefined;
    if (baselineGap === undefined) {
      newlyThreatenedBills.push(t.title);
    } else if (t.bufferGapPaise > baselineGap && t.outflowId !== null) {
      worsenedBills.push({
        outflowId: t.outflowId,
        title: t.title,
        baselineGapPaise: baselineGap,
        scenarioGapPaise: t.bufferGapPaise,
      });
    }
  }

  return {
    baseline,
    scenario,
    comparison: {
      baselineMinPaise: baseline.minBalancePaise,
      scenarioMinPaise: scenario.minBalancePaise,
      changeInMinPaise: scenario.minBalancePaise - baseline.minBalancePaise,
      baselineFirstBreach: baseline.firstBreachDate,
      scenarioFirstBreach: scenario.firstBreachDate,
      baselineMaxGapPaise: baseline.maxGapPaise,
      scenarioMaxGapPaise: scenario.maxGapPaise,
      shortfallDeltaPaise: scenario.maxGapPaise - baseline.maxGapPaise,
      baselineWorstDate: baseline.maxGapDate ?? baseline.minBalanceDate,
      scenarioWorstDate: scenario.maxGapDate ?? scenario.minBalanceDate,
      newlyThreatenedBills,
      worsenedBills,
    },
    shifted,
  };
}
