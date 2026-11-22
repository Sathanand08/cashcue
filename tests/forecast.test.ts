import { test } from "node:test";
import assert from "node:assert/strict";
import type { ForecastInput } from "../lib/finance/forecast-engine";
import { runForecast } from "../lib/finance/forecast-engine";
import { runDelayScenario } from "../lib/finance/scenario-engine";
import { rankActions } from "../lib/finance/action-ranking";

const demoInput: ForecastInput = {
  asOf: "2026-11-21",
  horizonDays: 30,
  openingCashPaise: 8000000,
  openingCashAsOf: "2026-11-21",
  bufferPaise: 5000000,
  cashTransactions: [],
  invoices: [
    { id: "inv1", invoiceNumber: "INV-001", customerName: "Aster Dental Clinic", amountPaise: 4500000, paidPaise: 0, dueDate: "2026-11-24", promisedDate: "2026-11-25", workflowStatus: "sent" },
    { id: "inv2", invoiceNumber: "INV-002", customerName: "Deccan Interiors", amountPaise: 3000000, paidPaise: 0, dueDate: "2026-11-26", promisedDate: "2026-11-29", workflowStatus: "sent" },
    { id: "inv3", invoiceNumber: "INV-003", customerName: "Nizam Foods", amountPaise: 1800000, paidPaise: 0, dueDate: "2026-11-18", promisedDate: null, workflowStatus: "sent" },
    { id: "inv4", invoiceNumber: "INV-004", customerName: "Hitec Legal Associates", amountPaise: 1500000, paidPaise: 0, dueDate: "2026-12-07", promisedDate: null, workflowStatus: "sent" },
    { id: "inv5", invoiceNumber: "INV-005", customerName: "Urban Nest Studio", amountPaise: 5000000, paidPaise: 2000000, dueDate: "2026-12-05", promisedDate: "2026-12-10", workflowStatus: "sent" },
    { id: "inv6", invoiceNumber: "INV-006", customerName: "Green Bowl Café", amountPaise: 2200000, paidPaise: 0, dueDate: "2026-12-18", promisedDate: "2026-12-22", workflowStatus: "sent" },
    { id: "inv7", invoiceNumber: "INV-007", customerName: "Sapphire Property Studio", amountPaise: 3500000, paidPaise: 0, dueDate: "2027-01-05", promisedDate: null, workflowStatus: "sent" },
  ],
  outflows: [
    { id: "b1", title: "Contractor payout — landing page", dueDate: "2026-11-24", amountPaise: 2500000, status: "scheduled", sourceType: "one_time", recurringExpenseId: null },
    { id: "b2", title: "Freelance designer payout", dueDate: "2026-12-03", amountPaise: 2000000, status: "scheduled", sourceType: "one_time", recurringExpenseId: null },
  ],
  recurringRules: [
    { id: "r1", title: "SaaS and hosting tools", amountPaise: 800000, frequency: "monthly", intervalCount: 1, anchorDate: "2026-11-28", active: true },
    { id: "r2", title: "Office rent", amountPaise: 3000000, frequency: "monthly", intervalCount: 1, anchorDate: "2026-12-01", active: true },
    { id: "r3", title: "Cloud services", amountPaise: 400000, frequency: "monthly", intervalCount: 1, anchorDate: "2026-12-05", active: true },
    { id: "r4", title: "Internet and phone", amountPaise: 300000, frequency: "monthly", intervalCount: 1, anchorDate: "2026-12-10", active: true },
  ],
};

test("TEST F: baseline minimum balance and delayed scenario shortfall", () => {
  const baseline = runForecast(demoInput);
  // Hand-calculated: the 2,500,000 contractor payout on 2026-11-24 falls before the Aster receipt.
  assert.equal(baseline.series.find((p) => p.date === "2026-11-24")?.balancePaise, 5500000);
  assert.equal(baseline.minBalancePaise, 5500000);
  assert.equal(baseline.minBalanceDate, "2026-11-24");
  assert.equal(baseline.series.find((p) => p.date === "2026-12-05")?.balancePaise, 6800000);

  const r = runDelayScenario({ ...demoInput, invoiceIds: ["inv1"], shiftDays: 15 });
  assert.equal(r.scenario.firstBreachDate, "2026-11-28");
  assert.equal(r.scenario.minBalancePaise, 2300000);
  assert.equal(r.scenario.minBalanceDate, "2026-12-05");
  assert.equal(r.comparison.scenarioMaxGapPaise, 2700000);
  assert.equal(r.comparison.shortfallDeltaPaise, 2700000);
});

test("TEST D: shifted invoice moves its receipt and input is not mutated", () => {
  const snapshot = structuredClone(demoInput);
  const r = runDelayScenario({ ...demoInput, invoiceIds: ["inv1"], shiftDays: 15 });
  assert.deepEqual(r.shifted, [
    { invoiceId: "inv1", invoiceNumber: "INV-001", from: "2026-11-25", to: "2026-12-10" },
  ]);
  const at1125 = r.scenario.series.find((p) => p.date === "2026-11-25");
  const at1210 = r.scenario.series.find((p) => p.date === "2026-12-10");
  assert.ok(!at1125?.events.some((e) => e.invoiceId === "inv1"));
  assert.ok(at1210?.events.some((e) => e.invoiceId === "inv1"));
  assert.deepEqual(demoInput, snapshot);
});

test("TEST G: ranked actions for the demo invoices", () => {
  const actions = rankActions(demoInput);

  const inv1 = actions.find((a) => a.invoiceNumber === "INV-001");
  assert.ok(inv1);
  assert.equal(inv1.stressShortfallIncreasePaise, 2700000);

  const inv3 = actions.find((a) => a.invoiceNumber === "INV-003");
  assert.ok(inv3);
  assert.equal(inv3.impactValuePaise, 1800000);
  assert.equal(inv3.overdue, true);
  assert.equal(inv3.outstandingPaise, 1800000);

  const inv2 = actions.find((a) => a.invoiceNumber === "INV-002");
  assert.ok(inv2);
  assert.ok(inv2.stressShortfallIncreasePaise > 0);

  for (let i = 0; i + 1 < actions.length; i++) {
    assert.ok(actions[i].impactValuePaise >= actions[i + 1].impactValuePaise);
  }
});
