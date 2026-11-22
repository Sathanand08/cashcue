import { formatINR } from "../money";
import { addDaysUtc, type ForecastInput } from "./forecast-engine";
import { daysBetween } from "./invoice-balance";
import { runDelayScenario } from "./scenario-engine";

export interface RankedAction {
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
}

/**
 * Ranks unpaid sent invoices that are overdue or have a scheduled receipt in the horizon,
 * by how much a delay would hurt the cash buffer.
 */
export function rankActions(input: ForecastInput, shiftDays = 15): RankedAction[] {
  const { asOf, horizonDays } = input;
  const horizonEnd = addDaysUtc(asOf, horizonDays);
  const actions: RankedAction[] = [];

  for (const inv of input.invoices) {
    if (inv.workflowStatus !== "sent") continue;
    const outstanding = inv.amountPaise - inv.paidPaise;
    if (outstanding <= 0) continue;

    const effective = inv.promisedDate ?? inv.dueDate;
    const overdue = effective < asOf;
    const scheduledInHorizon = !overdue && effective <= horizonEnd;
    if (!overdue && !scheduledInHorizon) continue;

    const result = runDelayScenario({ ...input, invoiceIds: [inv.id], shiftDays });
    const stress = result.comparison.shortfallDeltaPaise;
    const overdueOutstanding = overdue ? outstanding : 0;
    const impact = Math.max(stress, overdueOutstanding);

    let daysUntilAffectedBill: number | null = null;
    for (const b of result.scenario.threatenedBills) {
      const d = daysBetween(asOf, b.dueDate);
      if (daysUntilAffectedBill === null || d < daysUntilAffectedBill) daysUntilAffectedBill = d;
    }

    const daysOverdue = overdue ? daysBetween(effective, asOf) : 0;
    const outstandingText = formatINR(outstanding);
    const stressText = formatINR(stress);

    let priorityReason: string;
    let financialImpact: string;
    let recommendedAction: string;

    if (overdue) {
      priorityReason =
        inv.promisedDate === null
          ? `${daysOverdue} days overdue, no revised payment date.`
          : `${daysOverdue} days overdue.`;
      financialImpact = `${outstandingText} overdue cash to collect.`;
      recommendedAction = `Chase ${outstandingText} overdue receivable. ${daysOverdue} days overdue, no revised payment date.`;
    } else {
      priorityReason = `Expected ${effective}; delay exposure ${stressText}.`;
      financialImpact = `A ${shiftDays}-day delay creates a ${stressText} buffer shortfall.`;
      recommendedAction =
        stress > 0
          ? `Confirm ${outstandingText} payment. A ${shiftDays}-day delay creates a ${stressText} buffer shortfall.`
          : `Confirm ${outstandingText} payment on ${effective}.`;
    }

    actions.push({
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      customerName: inv.customerName,
      outstandingPaise: outstanding,
      expectedReceiptDate: effective,
      overdue,
      daysOverdue,
      impactValuePaise: impact,
      stressShortfallIncreasePaise: stress,
      daysUntilAffectedBill,
      priorityReason,
      financialImpact,
      recommendedAction,
    });
  }

  actions.sort((a, b) => {
    if (a.impactValuePaise !== b.impactValuePaise) return b.impactValuePaise - a.impactValuePaise;
    if (a.daysUntilAffectedBill !== b.daysUntilAffectedBill) {
      if (a.daysUntilAffectedBill === null) return 1;
      if (b.daysUntilAffectedBill === null) return -1;
      return a.daysUntilAffectedBill - b.daysUntilAffectedBill;
    }
    if (a.daysOverdue !== b.daysOverdue) return b.daysOverdue - a.daysOverdue;
    if (a.outstandingPaise !== b.outstandingPaise) return b.outstandingPaise - a.outstandingPaise;
    if (a.invoiceNumber < b.invoiceNumber) return -1;
    if (a.invoiceNumber > b.invoiceNumber) return 1;
    return 0;
  });

  return actions;
}
