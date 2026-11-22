import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { withTransaction } from "./client";
import { rupeesToPaise } from "../money";

// All seed data is synthetic (PixelCraft Studio is a demo workspace, not a real business).

export const DEMO_WORKSPACE_NAME = "PixelCraft Studio";
export const DEMO_RESET_CONFIRM = "RESET";

const WORKSPACE_CREATED_AT = "2026-11-21T00:00:00+05:30";

type InvoiceSeed = {
  customerName: string;
  invoiceNumber: string;
  invoiceType: "project_milestone" | "retainer";
  amountRupees: number;
  issueDate: string;
  dueDate: string;
  promisedDate: string | null;
  workflowStatus: "sent";
};

const INVOICE_SEEDS: InvoiceSeed[] = [
  { customerName: "Aster Dental Clinic", invoiceNumber: "INV-001", invoiceType: "project_milestone", amountRupees: 45000, issueDate: "2026-11-20", dueDate: "2026-11-24", promisedDate: "2026-11-25", workflowStatus: "sent" },
  { customerName: "Deccan Interiors", invoiceNumber: "INV-002", invoiceType: "project_milestone", amountRupees: 30000, issueDate: "2026-11-20", dueDate: "2026-11-26", promisedDate: "2026-11-29", workflowStatus: "sent" },
  { customerName: "Nizam Foods", invoiceNumber: "INV-003", invoiceType: "project_milestone", amountRupees: 18000, issueDate: "2026-11-10", dueDate: "2026-11-18", promisedDate: null, workflowStatus: "sent" },
  { customerName: "Hitec Legal Associates", invoiceNumber: "INV-004", invoiceType: "retainer", amountRupees: 15000, issueDate: "2026-11-20", dueDate: "2026-12-07", promisedDate: null, workflowStatus: "sent" },
  { customerName: "Urban Nest Studio", invoiceNumber: "INV-005", invoiceType: "project_milestone", amountRupees: 50000, issueDate: "2026-11-20", dueDate: "2026-12-05", promisedDate: "2026-12-10", workflowStatus: "sent" },
  { customerName: "Green Bowl Café", invoiceNumber: "INV-006", invoiceType: "project_milestone", amountRupees: 22000, issueDate: "2026-11-20", dueDate: "2026-12-18", promisedDate: "2026-12-22", workflowStatus: "sent" },
  // Corrected: issue date was 2026-12-20, after the 2026-11-21 snapshot, which is inconsistent with status 'sent'.
  { customerName: "Sapphire Property Studio", invoiceNumber: "INV-007", invoiceType: "retainer", amountRupees: 35000, issueDate: "2026-11-20", dueDate: "2027-01-05", promisedDate: null, workflowStatus: "sent" },
];

type OneTimeOutflowSeed = {
  title: string;
  category: string;
  amountRupees: number;
  dueDate: string;
};

const ONE_TIME_OUTFLOW_SEEDS: OneTimeOutflowSeed[] = [
  { title: "Contractor payout — landing page", category: "Contractor", amountRupees: 25000, dueDate: "2026-11-24" },
  { title: "Freelance designer payout", category: "Contractor", amountRupees: 20000, dueDate: "2026-12-03" },
];

type RecurringExpenseSeed = {
  title: string;
  category: string;
  amountRupees: number;
  anchorDate: string;
};

const RECURRING_EXPENSE_SEEDS: RecurringExpenseSeed[] = [
  { title: "SaaS and hosting tools", category: "Software", amountRupees: 8000, anchorDate: "2026-11-28" },
  { title: "Office rent", category: "Rent", amountRupees: 30000, anchorDate: "2026-12-01" },
  { title: "Cloud services", category: "Software", amountRupees: 4000, anchorDate: "2026-12-05" },
  { title: "Internet and phone", category: "Utilities", amountRupees: 3000, anchorDate: "2026-12-10" },
];

export type DemoResetResult = {
  workspace_id: string;
  workspace_name: string;
  opening_cash_paise: number;
  opening_cash_as_of: string;
  minimum_cash_buffer_paise: number;
  invoice_count: number;
  primary_demo_invoice: string;
};

/** Deletes all rows. Caller must run inside a transaction when combining with insert. */
function clearAllTables(db: DatabaseSync): void {
  // Child tables first — schema FKs have no ON DELETE CASCADE.
  db.exec(`
    DELETE FROM reminder_drafts;
    DELETE FROM payments;
    DELETE FROM cash_transactions;
    DELETE FROM scheduled_outflows;
    DELETE FROM invoices;
    DELETE FROM recurring_expenses;
    DELETE FROM customers;
    DELETE FROM workspace_settings;
    DELETE FROM workspaces;
  `);
}

/**
 * Inserts a fresh PixelCraft Studio demo. Does not open a transaction —
 * callers wrap with withTransaction when needed.
 */
function insertDemoWorkspace(db: DatabaseSync): string {
  const workspaceId = randomUUID();

  db.prepare("INSERT INTO workspaces (id, name, created_at) VALUES (?, ?, ?)").run(
    workspaceId,
    DEMO_WORKSPACE_NAME,
    WORKSPACE_CREATED_AT,
  );

  db.prepare(
    `INSERT INTO workspace_settings
      (id, workspace_id, opening_cash_paise, opening_cash_as_of, minimum_cash_buffer_paise, currency, timezone, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(),
    workspaceId,
    rupeesToPaise(80000), // opening cash ₹80,000
    "2026-11-21",
    rupeesToPaise(50000), // minimum buffer ₹50,000
    "INR",
    "Asia/Kolkata",
    WORKSPACE_CREATED_AT,
  );

  const insertCustomer = db.prepare(
    `INSERT INTO customers (id, workspace_id, name, whatsapp_number, notes, created_at)
     VALUES (?, ?, ?, NULL, NULL, ?)`,
  );
  const insertInvoice = db.prepare(
    `INSERT INTO invoices
      (id, workspace_id, customer_id, invoice_number, title, invoice_type, amount_paise,
       issue_date, due_date, promised_date, workflow_status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  const invoiceIdByNumber = new Map<string, string>();

  for (const seed of INVOICE_SEEDS) {
    const customerId = randomUUID();
    insertCustomer.run(customerId, workspaceId, seed.customerName, WORKSPACE_CREATED_AT);

    const invoiceId = randomUUID();
    invoiceIdByNumber.set(seed.invoiceNumber, invoiceId);
    insertInvoice.run(
      invoiceId,
      workspaceId,
      customerId,
      seed.invoiceNumber,
      seed.invoiceType === "retainer" ? "Retainer" : "Project milestone",
      seed.invoiceType,
      rupeesToPaise(seed.amountRupees),
      seed.issueDate,
      seed.dueDate,
      seed.promisedDate,
      seed.workflowStatus,
      WORKSPACE_CREATED_AT,
      WORKSPACE_CREATED_AT,
    );
  }

  // INV-005 partial payment of ₹20,000 received 2026-11-20, which is before the
  // opening-cash snapshot date (2026-11-21). It is therefore already part of the
  // opening balance, so NO cash_transactions row is created for it.
  const inv005Id = invoiceIdByNumber.get("INV-005");
  if (!inv005Id) {
    throw new Error("insertDemoWorkspace: INV-005 missing from seed set");
  }
  db.prepare(
    `INSERT INTO payments
      (id, workspace_id, invoice_id, amount_paise, received_on, payment_method, reference, idempotency_key, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
  ).run(
    randomUUID(),
    workspaceId,
    inv005Id,
    rupeesToPaise(20000),
    "2026-11-20",
    "UPI",
    "DEMO-UPI-001",
    "2026-11-20T00:00:00+05:30",
  );

  const insertOutflow = db.prepare(
    `INSERT INTO scheduled_outflows
      (id, workspace_id, title, payee, category, amount_paise, due_date, source_type,
       recurring_expense_id, status, paid_at, created_at)
     VALUES (?, ?, ?, NULL, ?, ?, ?, 'one_time', NULL, 'scheduled', NULL, ?)`,
  );
  for (const seed of ONE_TIME_OUTFLOW_SEEDS) {
    insertOutflow.run(
      randomUUID(),
      workspaceId,
      seed.title,
      seed.category,
      rupeesToPaise(seed.amountRupees),
      seed.dueDate,
      WORKSPACE_CREATED_AT,
    );
  }

  const insertRecurring = db.prepare(
    `INSERT INTO recurring_expenses
      (id, workspace_id, title, category, amount_paise, frequency, interval_count, next_due_date, active, created_at)
     VALUES (?, ?, ?, ?, ?, 'monthly', 1, ?, 1, ?)`,
  );
  for (const seed of RECURRING_EXPENSE_SEEDS) {
    insertRecurring.run(
      randomUUID(),
      workspaceId,
      seed.title,
      seed.category,
      rupeesToPaise(seed.amountRupees),
      seed.anchorDate,
      WORKSPACE_CREATED_AT,
    );
  }

  return workspaceId;
}

function summarizeDemo(db: DatabaseSync, workspaceId: string): DemoResetResult {
  const settings = db
    .prepare(
      `SELECT opening_cash_paise, opening_cash_as_of, minimum_cash_buffer_paise
       FROM workspace_settings WHERE workspace_id = ?`,
    )
    .get(workspaceId) as {
    opening_cash_paise: number;
    opening_cash_as_of: string;
    minimum_cash_buffer_paise: number;
  };

  const invoiceCount = (
    db.prepare("SELECT COUNT(*) AS n FROM invoices WHERE workspace_id = ?").get(workspaceId) as {
      n: number;
    }
  ).n;

  return {
    workspace_id: workspaceId,
    workspace_name: DEMO_WORKSPACE_NAME,
    opening_cash_paise: Number(settings.opening_cash_paise),
    opening_cash_as_of: settings.opening_cash_as_of,
    minimum_cash_buffer_paise: Number(settings.minimum_cash_buffer_paise),
    invoice_count: invoiceCount,
    primary_demo_invoice: "INV-001",
  };
}

/**
 * Seeds the synthetic PixelCraft Studio demo workspace. Idempotent: if a
 * workspace with that name already exists its id is returned unchanged.
 * Returns the workspace id.
 */
export function seedDemoWorkspace(db: DatabaseSync): string {
  const existing = db
    .prepare("SELECT id FROM workspaces WHERE name = ?")
    .get(DEMO_WORKSPACE_NAME) as { id: string } | undefined;
  if (existing) {
    return existing.id;
  }

  return withTransaction(db, () => insertDemoWorkspace(db));
}

/**
 * Wipes all demo data and reseeds PixelCraft Studio in one transaction.
 * Restores Aster Dental (INV-001) as the primary what-if invoice and opening cash ₹80,000.
 */
export function resetDemoWorkspace(db: DatabaseSync): DemoResetResult {
  return withTransaction(db, () => {
    clearAllTables(db);
    const workspaceId = insertDemoWorkspace(db);
    return summarizeDemo(db, workspaceId);
  });
}
