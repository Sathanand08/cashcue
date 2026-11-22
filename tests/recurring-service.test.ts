import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TMP_DB = path.join(
  os.tmpdir(),
  `cashcue-recurring-svc-test-${process.pid}-${Date.now()}.db`,
);
process.env.CASHCUE_DB_PATH = TMP_DB;

type Db = import("node:sqlite").DatabaseSync;
type RecurringModule = typeof import("../lib/services/recurring");
type ForecastModule = typeof import("../lib/services/forecast");

let db: Db;
let ws: string;
let recurring: RecurringModule;
let forecast: ForecastModule;
const seededRuleIds = new Set<string>();

before(async () => {
  const client = await import("../lib/db/client");
  const workspace = await import("../lib/db/workspace");
  recurring = await import("../lib/services/recurring");
  forecast = await import("../lib/services/forecast");

  db = client.getDb();
  ws = workspace.getDemoWorkspaceId();

  for (const row of db
    .prepare("SELECT id FROM recurring_expenses WHERE workspace_id = ?")
    .all(ws) as { id: string }[]) {
    seededRuleIds.add(row.id);
  }
});

beforeEach(() => {
  db.prepare(
    `DELETE FROM cash_transactions WHERE workspace_id = ? AND source_type = 'bill_payment'`,
  ).run(ws);
  db.prepare(
    `DELETE FROM scheduled_outflows
     WHERE workspace_id = ? AND source_type = 'recurring'`,
  ).run(ws);

  const ids = [...seededRuleIds];
  if (ids.length > 0) {
    db.prepare(
      `DELETE FROM recurring_expenses WHERE workspace_id = ? AND id NOT IN (${ids
        .map(() => "?")
        .join(",")})`,
    ).run(ws, ...ids);
    db.prepare(
      `UPDATE recurring_expenses SET active = 1 WHERE workspace_id = ?`,
    ).run(ws);
  } else {
    db.prepare(`DELETE FROM recurring_expenses WHERE workspace_id = ?`).run(ws);
  }
});

after(() => {
  try {
    db?.close();
  } catch {
    // ignore
  }
  for (const f of [TMP_DB, `${TMP_DB}-wal`, `${TMP_DB}-shm`]) {
    try {
      fs.rmSync(f, { force: true });
    } catch {
      // ignore
    }
  }
});

function countOutflowsForRule(ruleId: string): number {
  return (
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM scheduled_outflows
         WHERE workspace_id = ? AND recurring_expense_id = ?`,
      )
      .get(ws, ruleId) as { n: number }
  ).n;
}

function forecastHasRecOccurrence(ruleId: string, dueDate: string): boolean {
  const f = forecast.getForecast(db, ws, 90);
  const id = `rec:${ruleId}:${dueDate}`;
  return f.series.flatMap((p) => p.events).some((e) => e.type === "bill" && e.outflowId === id);
}

test("listRecurringExpenses returns seeded monthly rules", () => {
  const list = recurring.listRecurringExpenses(db, ws);
  assert.ok(list.length >= 4);
  assert.ok(list.some((r) => r.title.includes("Office rent")));
  assert.ok(list.every((r) => r.active === true || r.active === false));
});

test("createRecurringExpense appears in forecast occurrences", () => {
  const rule = recurring.createRecurringExpense(db, ws, {
    title: "Test weekly cleaner",
    category: "Ops",
    amount: 2500,
    frequency: "weekly",
    interval_count: 1,
    next_due_date: "2026-11-28",
  });

  assert.equal(rule.frequency, "weekly");
  assert.equal(rule.amount_paise, 250000);
  assert.equal(rule.active, true);
  assert.equal(forecastHasRecOccurrence(rule.id, "2026-11-28"), true);
});

test("updateRecurringExpense can deactivate and hide from forecast", () => {
  const rule = recurring.createRecurringExpense(db, ws, {
    title: "Deactivate me",
    category: "Test",
    amount: 1000,
    frequency: "monthly",
    next_due_date: "2026-12-01",
  });
  assert.equal(forecastHasRecOccurrence(rule.id, "2026-12-01"), true);

  const updated = recurring.updateRecurringExpense(db, ws, rule.id, { active: false });
  assert.equal(updated.active, false);
  assert.equal(forecastHasRecOccurrence(rule.id, "2026-12-01"), false);
});

test("payRecurringOccurrence materializes once, pays, and removes from forecast", () => {
  const rule = recurring.createRecurringExpense(db, ws, {
    title: "Pay occurrence",
    category: "Test",
    amount: 8000,
    frequency: "monthly",
    next_due_date: "2026-11-28",
  });

  assert.equal(forecastHasRecOccurrence(rule.id, "2026-11-28"), true);
  const beforeCash = forecast.getForecast(db, ws, 30).cashNowPaise;

  const first = recurring.payRecurringOccurrence(db, ws, rule.id, {
    due_date: "2026-11-28",
    paid_on: "2026-11-22",
  });

  assert.equal(first.materialized, true);
  assert.equal(first.bill.status, "paid");
  assert.equal(first.bill.source_type, "recurring");
  assert.equal(first.bill.recurring_expense_id, rule.id);
  assert.equal(first.bill.due_date, "2026-11-28");
  assert.equal(countOutflowsForRule(rule.id), 1);
  assert.equal(forecastHasRecOccurrence(rule.id, "2026-11-28"), false);

  const afterCash = forecast.getForecast(db, ws, 30).cashNowPaise;
  assert.equal(afterCash, beforeCash - 800000);

  // Next month occurrence still forecast.
  assert.equal(forecastHasRecOccurrence(rule.id, "2026-12-28"), true);

  // Double-pay same occurrence is rejected; still one row.
  assert.throws(
    () =>
      recurring.payRecurringOccurrence(db, ws, rule.id, {
        due_date: "2026-11-28",
        paid_on: "2026-11-22",
      }),
    { code: "BUSINESS_RULE" },
  );
  assert.equal(countOutflowsForRule(rule.id), 1);
});

test("payRecurringOccurrence is idempotent on materialization for scheduled rows", () => {
  const rule = recurring.createRecurringExpense(db, ws, {
    title: "Pre-materialized",
    category: "Test",
    amount: 3000,
    frequency: "monthly",
    next_due_date: "2026-12-05",
  });

  const billId = "pre-mat-bill";
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO scheduled_outflows
       (id, workspace_id, title, payee, category, amount_paise, due_date, source_type,
        recurring_expense_id, status, paid_at, created_at)
     VALUES (?, ?, ?, NULL, ?, ?, ?, 'recurring', ?, 'scheduled', NULL, ?)`,
  ).run(
    billId,
    ws,
    rule.title,
    rule.category,
    rule.amount_paise,
    "2026-12-05",
    rule.id,
    now,
  );

  const result = recurring.payRecurringOccurrence(db, ws, rule.id, {
    due_date: "2026-12-05",
    paid_on: "2026-11-22",
  });

  assert.equal(result.materialized, false);
  assert.equal(result.bill.id, billId);
  assert.equal(result.bill.status, "paid");
  assert.equal(countOutflowsForRule(rule.id), 1);
});

test("payRecurringOccurrence rejects dates that are not occurrences", () => {
  const rule = recurring.createRecurringExpense(db, ws, {
    title: "Bad date",
    category: "Test",
    amount: 1000,
    frequency: "monthly",
    next_due_date: "2026-11-28",
  });

  assert.throws(
    () =>
      recurring.payRecurringOccurrence(db, ws, rule.id, {
        due_date: "2026-11-27",
        paid_on: "2026-11-22",
      }),
    { code: "BUSINESS_RULE" },
  );
  assert.equal(countOutflowsForRule(rule.id), 0);
});

test("workspace isolation: recurring rules and pay are scoped", () => {
  const otherWs = "ws-recurring-iso";
  const now = new Date().toISOString();
  db.prepare("INSERT INTO workspaces (id, name, created_at) VALUES (?, ?, ?)").run(
    otherWs,
    "Other Recurring",
    now,
  );

  try {
    const mine = recurring.createRecurringExpense(db, ws, {
      title: "Mine",
      category: "Test",
      amount: 500,
      frequency: "monthly",
      next_due_date: "2026-12-15",
    });
    db.prepare(
      `INSERT INTO recurring_expenses
         (id, workspace_id, title, category, amount_paise, frequency, interval_count,
          next_due_date, active, created_at)
       VALUES (?, ?, 'Other', 'Test', 60000, 'monthly', 1, '2026-12-15', 1, ?)`,
    ).run("other-rule-1", otherWs, now);

    assert.equal(
      recurring.listRecurringExpenses(db, ws).some((r) => r.id === "other-rule-1"),
      false,
    );
    assert.throws(() => recurring.getRecurringExpense(db, ws, "other-rule-1"), {
      code: "NOT_FOUND",
    });
    assert.throws(
      () =>
        recurring.payRecurringOccurrence(db, ws, "other-rule-1", {
          due_date: "2026-12-15",
          paid_on: "2026-11-22",
        }),
      { code: "NOT_FOUND" },
    );
    assert.ok(recurring.getRecurringExpense(db, ws, mine.id));
  } finally {
    db.prepare("DELETE FROM scheduled_outflows WHERE workspace_id = ?").run(otherWs);
    db.prepare("DELETE FROM recurring_expenses WHERE workspace_id = ?").run(otherWs);
    db.prepare("DELETE FROM workspaces WHERE id = ?").run(otherWs);
  }
});
