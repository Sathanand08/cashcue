-- Postgres row-level security is not available in this embedded store; workspace isolation is enforced by the repository layer, which filters every query by workspace_id.
--
-- CashCue embedded schema (node:sqlite).
-- Money: INTEGER paise (1 rupee = 100 paise). Dates: TEXT 'YYYY-MM-DD'. Ids: TEXT (crypto.randomUUID()).
-- Idempotent: every statement uses IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workspace_settings (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  opening_cash_paise INTEGER NOT NULL,
  opening_cash_as_of TEXT NOT NULL,
  minimum_cash_buffer_paise INTEGER NOT NULL CHECK (minimum_cash_buffer_paise >= 0),
  currency TEXT NOT NULL DEFAULT 'INR',
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  updated_at TEXT NOT NULL,
  UNIQUE(workspace_id)
);

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  name TEXT NOT NULL,
  whatsapp_number TEXT NULL,
  notes TEXT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  customer_id TEXT NOT NULL REFERENCES customers(id),
  invoice_number TEXT NOT NULL,
  title TEXT NOT NULL,
  invoice_type TEXT NOT NULL CHECK (invoice_type IN ('project_milestone','retainer')),
  amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
  issue_date TEXT NOT NULL,
  due_date TEXT NOT NULL,
  promised_date TEXT NULL,
  workflow_status TEXT NOT NULL CHECK (workflow_status IN ('draft','sent')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(workspace_id, invoice_number)
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  invoice_id TEXT NOT NULL REFERENCES invoices(id),
  amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
  received_on TEXT NOT NULL,
  payment_method TEXT NOT NULL,
  reference TEXT NULL,
  idempotency_key TEXT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(workspace_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS recurring_expenses (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
  frequency TEXT NOT NULL CHECK (frequency IN ('weekly','monthly','quarterly')),
  interval_count INTEGER NOT NULL CHECK (interval_count >= 1),
  next_due_date TEXT NOT NULL, -- anchor / first due date; the expansion engine uses it as the anchor
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS scheduled_outflows (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  title TEXT NOT NULL,
  payee TEXT NULL,
  category TEXT NOT NULL,
  amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
  due_date TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('one_time','recurring')),
  recurring_expense_id TEXT NULL REFERENCES recurring_expenses(id),
  status TEXT NOT NULL CHECK (status IN ('scheduled','paid','cancelled')),
  paid_at TEXT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(recurring_expense_id, due_date)
);

CREATE TABLE IF NOT EXISTS cash_transactions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  direction TEXT NOT NULL CHECK (direction IN ('inflow','outflow','adjustment')),
  amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
  occurred_on TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NULL,
  note TEXT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reminder_drafts (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  invoice_id TEXT NOT NULL REFERENCES invoices(id),
  language TEXT NOT NULL CHECK (language IN ('en','te')),
  tone TEXT NOT NULL CHECK (tone IN ('friendly','professional','firm')),
  content TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  copied_at TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_workspace_settings_workspace ON workspace_settings(workspace_id);
CREATE INDEX IF NOT EXISTS idx_customers_workspace ON customers(workspace_id);
CREATE INDEX IF NOT EXISTS idx_invoices_workspace ON invoices(workspace_id);
CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_payments_workspace ON payments(workspace_id);
CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_recurring_expenses_workspace ON recurring_expenses(workspace_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_outflows_workspace ON scheduled_outflows(workspace_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_outflows_workspace_due ON scheduled_outflows(workspace_id, due_date);
CREATE INDEX IF NOT EXISTS idx_cash_transactions_workspace ON cash_transactions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_cash_transactions_workspace_occurred ON cash_transactions(workspace_id, occurred_on);
CREATE INDEX IF NOT EXISTS idx_reminder_drafts_workspace ON reminder_drafts(workspace_id);
CREATE INDEX IF NOT EXISTS idx_reminder_drafts_invoice ON reminder_drafts(invoice_id);
