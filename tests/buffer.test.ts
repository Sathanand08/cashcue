import { test } from "node:test";
import assert from "node:assert/strict";
import { analyseBuffer } from "../lib/finance/buffer-analysis";

test("buffer: first breach, max gap and min are found on the known date", () => {
  const series = [
    { date: "2026-11-21", balancePaise: 8000000 },
    { date: "2026-11-22", balancePaise: 6000000 },
    { date: "2026-11-23", balancePaise: 4000000 },
    { date: "2026-11-24", balancePaise: 4500000 },
    { date: "2026-11-25", balancePaise: 7000000 },
  ];
  const r = analyseBuffer(series, 5000000);
  assert.equal(r.firstBreachDate, "2026-11-23");
  assert.equal(r.maxGapPaise, 1000000);
  assert.equal(r.maxGapDate, "2026-11-23");
  assert.equal(r.minBalancePaise, 4000000);
  assert.equal(r.minBalanceDate, "2026-11-23");
});

test("buffer: empty series returns zeros and nulls", () => {
  assert.deepEqual(analyseBuffer([], 5000000), {
    minBalancePaise: 0,
    minBalanceDate: null,
    firstBreachDate: null,
    maxGapPaise: 0,
    maxGapDate: null,
  });
});
