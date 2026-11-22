import { test } from "node:test";
import assert from "node:assert/strict";
import type { ForecastInput } from "../lib/finance/forecast-engine";
import { runDelayScenario } from "../lib/finance/scenario-engine";

const input: ForecastInput = {
  asOf: "2026-11-21",
  horizonDays: 30,
  openingCashPaise: 8000000,
  openingCashAsOf: "2026-11-21",
  bufferPaise: 5000000,
  cashTransactions: [],
  invoices: [
    { id: "inv1", invoiceNumber: "INV-001", customerName: "Aster Dental Clinic", amountPaise: 4500000, paidPaise: 0, dueDate: "2026-11-24", promisedDate: "2026-11-25", workflowStatus: "sent" },
    { id: "inv2", invoiceNumber: "INV-002", customerName: "Deccan Interiors", amountPaise: 3000000, paidPaise: 0, dueDate: "2026-11-26", promisedDate: "2026-11-29", workflowStatus: "sent" },
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

test("shifting inv1 and inv2 together is at least as bad as shifting inv1 alone", () => {
  const snapshot = structuredClone(input);
  const single = runDelayScenario({ ...input, invoiceIds: ["inv1"], shiftDays: 15 });
  const both = runDelayScenario({ ...input, invoiceIds: ["inv1", "inv2"], shiftDays: 15 });
  assert.ok(both.comparison.shortfallDeltaPaise >= single.comparison.shortfallDeltaPaise);
  assert.deepEqual(input, snapshot);
});
