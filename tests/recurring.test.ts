import { test } from "node:test";
import assert from "node:assert/strict";
import { expandOccurrences } from "../lib/finance/recurring-expenses";

test("monthly anchor 31 Jan clamps to month-end and never drifts", () => {
  const dates = expandOccurrences(
    { anchorDate: "2027-01-31", frequency: "monthly", intervalCount: 1 },
    "2027-01-01",
    "2027-04-30",
  );
  assert.deepEqual(dates, ["2027-01-31", "2027-02-28", "2027-03-31", "2027-04-30"]);
});

test("monthly clamping respects leap years", () => {
  const dates = expandOccurrences(
    { anchorDate: "2028-01-31", frequency: "monthly", intervalCount: 1 },
    "2028-02-01",
    "2028-03-31",
  );
  assert.deepEqual(dates, ["2028-02-29", "2028-03-31"]);
});

test("monthly over a year has no duplicates and is ascending", () => {
  const dates = expandOccurrences(
    { anchorDate: "2026-11-28", frequency: "monthly", intervalCount: 1 },
    "2026-11-01",
    "2027-10-31",
  );
  assert.equal(dates.length, 12);
  assert.equal(new Set(dates).size, 12);
  assert.deepEqual([...dates].sort(), dates);
});

test("occurrences before the range start are excluded and range end is inclusive", () => {
  const dates = expandOccurrences(
    { anchorDate: "2026-11-28", frequency: "monthly", intervalCount: 1 },
    "2026-11-21",
    "2026-12-20",
  );
  assert.deepEqual(dates, ["2026-11-28"]);
  const inclusive = expandOccurrences(
    { anchorDate: "2026-11-28", frequency: "monthly", intervalCount: 1 },
    "2026-11-28",
    "2026-12-28",
  );
  assert.deepEqual(inclusive, ["2026-11-28", "2026-12-28"]);
});

test("weekly steps by 7 days per interval from the anchor", () => {
  const dates = expandOccurrences(
    { anchorDate: "2026-11-21", frequency: "weekly", intervalCount: 1 },
    "2026-11-21",
    "2026-12-19",
  );
  assert.deepEqual(dates, ["2026-11-21", "2026-11-28", "2026-12-05", "2026-12-12", "2026-12-19"]);
});

test("quarterly steps by 3 months from the anchor with month-end clamping", () => {
  const plain = expandOccurrences(
    { anchorDate: "2026-11-01", frequency: "quarterly", intervalCount: 1 },
    "2026-11-01",
    "2027-08-31",
  );
  assert.deepEqual(plain, ["2026-11-01", "2027-02-01", "2027-05-01", "2027-08-01"]);

  const clamped = expandOccurrences(
    { anchorDate: "2026-11-30", frequency: "quarterly", intervalCount: 1 },
    "2026-11-01",
    "2027-05-31",
  );
  assert.deepEqual(clamped, ["2026-11-30", "2027-02-28", "2027-05-30"]);
});

test("empty when the range is inverted or the anchor is after the range", () => {
  assert.deepEqual(
    expandOccurrences({ anchorDate: "2027-01-01", frequency: "monthly", intervalCount: 1 }, "2026-01-01", "2026-12-31"),
    [],
  );
  assert.deepEqual(
    expandOccurrences({ anchorDate: "2026-11-01", frequency: "monthly", intervalCount: 1 }, "2026-12-01", "2026-11-01"),
    [],
  );
});
