import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TMP_DB = path.join(
  os.tmpdir(),
  `cashcue-reminders-svc-test-${process.pid}-${Date.now()}.db`,
);
process.env.CASHCUE_DB_PATH = TMP_DB;

type Db = import("node:sqlite").DatabaseSync;
type RemindersModule = typeof import("../lib/services/reminders");
type InvoicesModule = typeof import("../lib/services/invoices");
type PaymentsModule = typeof import("../lib/services/payments");

let db: Db;
let ws: string;
let reminders: RemindersModule;
let invoices: InvoicesModule;
let payments: PaymentsModule;
let inv1Id: string;

before(async () => {
  const client = await import("../lib/db/client");
  const workspace = await import("../lib/db/workspace");
  reminders = await import("../lib/services/reminders");
  invoices = await import("../lib/services/invoices");
  payments = await import("../lib/services/payments");

  db = client.getDb();
  ws = workspace.getDemoWorkspaceId();
  inv1Id = (
    db
      .prepare("SELECT id FROM invoices WHERE workspace_id = ? AND invoice_number = ?")
      .get(ws, "INV-001") as { id: string }
  ).id;
});

beforeEach(() => {
  db.prepare("DELETE FROM reminder_drafts WHERE workspace_id = ?").run(ws);
  db.prepare(
    `DELETE FROM cash_transactions WHERE workspace_id = ? AND source_type = 'payment'
     AND source_id IN (
       SELECT id FROM payments WHERE workspace_id = ? AND invoice_id IN (
         SELECT id FROM invoices WHERE workspace_id = ? AND invoice_number LIKE 'TEST-REM-%'
       )
     )`,
  ).run(ws, ws, ws);
  db.prepare(
    `DELETE FROM payments WHERE workspace_id = ? AND invoice_id IN (
       SELECT id FROM invoices WHERE workspace_id = ? AND invoice_number LIKE 'TEST-REM-%'
     )`,
  ).run(ws, ws);
  db.prepare(
    `DELETE FROM invoices WHERE workspace_id = ? AND invoice_number LIKE 'TEST-REM-%'`,
  ).run(ws);
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

function countDrafts(): number {
  return (
    db.prepare("SELECT COUNT(*) AS n FROM reminder_drafts WHERE workspace_id = ?").get(ws) as {
      n: number;
    }
  ).n;
}

test("createReminderDraft stores EN and TE drafts for INV-001", () => {
  const en = reminders.createReminderDraft(db, ws, {
    invoice_id: inv1Id,
    language: "en",
    tone: "professional",
  });
  assert.equal(en.language, "en");
  assert.equal(en.tone, "professional");
  assert.equal(en.invoice_id, inv1Id);
  assert.ok(en.content.includes("INV-001"));
  assert.ok(en.content.includes("₹45,000") || en.content.includes("45,000"));
  assert.equal(en.copied_at, null);

  const te = reminders.createReminderDraft(db, ws, {
    invoice_id: inv1Id,
    language: "te",
    tone: "friendly",
  });
  assert.equal(te.language, "te");
  assert.match(te.content, /[\u0C00-\u0C7F]/);
  assert.equal(countDrafts(), 2);
});

test("createReminderDraft rejects draft invoices and fully paid invoices", () => {
  const customerId = invoices.listCustomers(db, ws)[0]!.id;
  const draft = invoices.createInvoice(db, ws, {
    customer_id: customerId,
    invoice_number: `TEST-REM-DRAFT-${Date.now()}`,
    title: "Draft reminder block",
    invoice_type: "project_milestone",
    amount: 1000,
    issue_date: "2026-11-20",
    due_date: "2026-12-01",
  });

  assert.throws(
    () =>
      reminders.createReminderDraft(db, ws, {
        invoice_id: draft.id,
        language: "en",
        tone: "friendly",
      }),
    { code: "BUSINESS_RULE" },
  );

  const paid = invoices.createInvoice(db, ws, {
    customer_id: customerId,
    invoice_number: `TEST-REM-PAID-${Date.now()}`,
    title: "Paid reminder block",
    invoice_type: "project_milestone",
    amount: 1000,
    issue_date: "2026-11-20",
    due_date: "2026-12-01",
    workflow_status: "sent",
  });
  payments.recordPayment(db, ws, paid.id, {
    amount: 1000,
    payment_method: "UPI",
    received_on: "2026-11-22",
  });

  assert.throws(
    () =>
      reminders.createReminderDraft(db, ws, {
        invoice_id: paid.id,
        language: "en",
        tone: "friendly",
      }),
    { code: "BUSINESS_RULE" },
  );
});

test("list and get persist edited content; mark_copied sets copied_at", () => {
  const created = reminders.createReminderDraft(db, ws, {
    invoice_id: inv1Id,
    language: "en",
    tone: "firm",
  });

  const edited = reminders.updateReminderDraft(db, ws, created.id, {
    content: "Custom WhatsApp draft — please pay INV-001 soon.",
  });
  assert.equal(edited.content, "Custom WhatsApp draft — please pay INV-001 soon.");
  assert.notEqual(edited.updated_at, created.updated_at);

  const listed = reminders.listReminderDrafts(db, ws, inv1Id);
  assert.equal(listed.length, 1);
  assert.equal(listed[0]!.content, edited.content);

  const again = reminders.getReminderDraft(db, ws, created.id);
  assert.equal(again.content, edited.content);
  assert.equal(again.copied_at, null);

  const copied = reminders.updateReminderDraft(db, ws, created.id, { mark_copied: true });
  assert.ok(copied.copied_at);
  assert.equal(reminders.getReminderDraft(db, ws, created.id).copied_at, copied.copied_at);
});

test("createReminderDraft does not mutate invoices or payments", () => {
  const invBefore = invoices.getInvoiceWithBalance(db, ws, inv1Id);
  const payCount = (
    db.prepare("SELECT COUNT(*) AS n FROM payments WHERE workspace_id = ?").get(ws) as {
      n: number;
    }
  ).n;

  reminders.createReminderDraft(db, ws, {
    invoice_id: inv1Id,
    language: "en",
    tone: "friendly",
  });

  const invAfter = invoices.getInvoiceWithBalance(db, ws, inv1Id);
  assert.equal(invAfter.amount_paise, invBefore.amount_paise);
  assert.equal(invAfter.paid_paise, invBefore.paid_paise);
  assert.equal(invAfter.outstanding_paise, invBefore.outstanding_paise);
  assert.equal(invAfter.workflow_status, invBefore.workflow_status);

  const payCountAfter = (
    db.prepare("SELECT COUNT(*) AS n FROM payments WHERE workspace_id = ?").get(ws) as {
      n: number;
    }
  ).n;
  assert.equal(payCountAfter, payCount);
});

test("workspace isolation: drafts from another workspace are invisible", () => {
  const otherWs = "ws-reminders-iso";
  const now = new Date().toISOString();
  db.prepare("INSERT INTO workspaces (id, name, created_at) VALUES (?, ?, ?)").run(
    otherWs,
    "Other Reminders",
    now,
  );

  try {
    const mine = reminders.createReminderDraft(db, ws, {
      invoice_id: inv1Id,
      language: "en",
      tone: "friendly",
    });

    db.prepare(
      `INSERT INTO customers (id, workspace_id, name, whatsapp_number, notes, created_at)
       VALUES (?, ?, 'Other Co', NULL, NULL, ?)`,
    ).run("other-cust-rem", otherWs, now);
    db.prepare(
      `INSERT INTO invoices
         (id, workspace_id, customer_id, invoice_number, title, invoice_type, amount_paise,
          issue_date, due_date, promised_date, workflow_status, created_at, updated_at)
       VALUES (?, ?, 'other-cust-rem', 'O-1', 'Other', 'retainer', 10000,
               '2026-11-01', '2026-11-30', NULL, 'sent', ?, ?)`,
    ).run("other-inv-rem", otherWs, now, now);
    db.prepare(
      `INSERT INTO reminder_drafts
         (id, workspace_id, invoice_id, language, tone, content, generated_at, updated_at, copied_at)
       VALUES (?, ?, 'other-inv-rem', 'en', 'friendly', 'secret', ?, ?, NULL)`,
    ).run("other-draft-1", otherWs, now, now);

    assert.equal(
      reminders.listReminderDrafts(db, ws).some((d) => d.id === "other-draft-1"),
      false,
    );
    assert.throws(() => reminders.getReminderDraft(db, ws, "other-draft-1"), {
      code: "NOT_FOUND",
    });
    assert.ok(reminders.getReminderDraft(db, ws, mine.id));
  } finally {
    db.prepare("DELETE FROM reminder_drafts WHERE workspace_id = ?").run(otherWs);
    db.prepare("DELETE FROM invoices WHERE workspace_id = ?").run(otherWs);
    db.prepare("DELETE FROM customers WHERE workspace_id = ?").run(otherWs);
    db.prepare("DELETE FROM workspaces WHERE id = ?").run(otherWs);
  }
});
