import { test } from "node:test";
import assert from "node:assert/strict";
import type { ForecastInput } from "../lib/finance/forecast-engine";
import { runDelayScenario } from "../lib/finance/scenario-engine";

// Same demo input as tests/forecast.test.ts (copied, not imported).
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

test("Aster delay: INV-001 shift, breach date, shortfall and input immutability", () => {
  // Snapshot before the call, so the mutation check compares against the original state.
  const inv001Before = structuredClone(demoInput.invoices[0]);
  const invoicesBefore = structuredClone(demoInput.invoices);

  const r = runDelayScenario({ ...demoInput, invoiceIds: ["inv1"], shiftDays: 15 });

  // (a) INV-001 moves from 2026-11-25 to 2026-12-10.
  assert.ok(r.shifted.some((s) => s.invoiceNumber === "INV-001" && s.from === "2026-11-25" && s.to === "2026-12-10"));
  assert.deepEqual(r.shifted, [
    { invoiceId: "inv1", invoiceNumber: "INV-001", from: "2026-11-25", to: "2026-12-10" },
  ]);

  // (b) First breach under the delay.
  assert.equal(r.scenario.firstBreachDate, "2026-11-28");

  // (c) Scenario minimum and balance on 2026-12-05.
  assert.equal(r.comparison.scenarioMinPaise, 2300000);
  assert.equal(r.scenario.series.find((p) => p.date === "2026-12-05")?.balancePaise, 2300000);

  // (d) Shortfall delta.
  assert.equal(r.comparison.shortfallDeltaPaise, 2700000);

  // (e) Input invoice data is not mutated.
  assert.deepEqual(demoInput.invoices[0], inv001Before);
  assert.deepEqual(demoInput.invoices, invoicesBefore);
});
