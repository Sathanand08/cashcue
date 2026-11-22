import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  generateReminder,
  type Language,
  type Tone,
} from "@/lib/reminders/templates";
import { businessRule, notFound, validationError } from "./errors";
import { dbAll, dbGet, getInvoiceWithBalance } from "./invoices";
import { parseEnum, parseNonEmptyString, requireObject } from "./validators";

export const REMINDER_LANGUAGES = ["en", "te"] as const;
export const REMINDER_TONES = ["friendly", "professional", "firm"] as const;

export interface ReminderDraftRecord {
  id: string;
  invoice_id: string;
  language: Language;
  tone: Tone;
  content: string;
  generated_at: string;
  updated_at: string;
  copied_at: string | null;
}

const DRAFT_COLUMNS =
  "id, invoice_id, language, tone, content, generated_at, updated_at, copied_at";

const UPDATABLE_FIELDS = new Set(["content", "mark_copied"]);

function toRecord(row: ReminderDraftRecord): ReminderDraftRecord {
  return {
    id: row.id,
    invoice_id: row.invoice_id,
    language: row.language,
    tone: row.tone,
    content: row.content,
    generated_at: row.generated_at,
    updated_at: row.updated_at,
    copied_at: row.copied_at,
  };
}

/** Loads one reminder draft in the workspace, or throws NOT_FOUND. */
export function getReminderDraft(
  db: DatabaseSync,
  ws: string,
  id: string,
): ReminderDraftRecord {
  const row = dbGet<ReminderDraftRecord>(
    db,
    `SELECT ${DRAFT_COLUMNS} FROM reminder_drafts WHERE workspace_id = ? AND id = ?`,
    [ws, id],
  );
  if (!row) throw notFound("Reminder draft not found");
  return toRecord(row);
}

/**
 * Lists reminder drafts for the workspace, newest first.
 * Optional invoiceId filters to one invoice's history.
 */
export function listReminderDrafts(
  db: DatabaseSync,
  ws: string,
  invoiceId?: string | null,
): ReminderDraftRecord[] {
  if (invoiceId) {
    // Ensure the invoice belongs to this workspace (NOT_FOUND if not).
    getInvoiceWithBalance(db, ws, invoiceId);
    return dbAll<ReminderDraftRecord>(
      db,
      `SELECT ${DRAFT_COLUMNS} FROM reminder_drafts
       WHERE workspace_id = ? AND invoice_id = ?
       ORDER BY generated_at DESC, id DESC`,
      [ws, invoiceId],
    ).map(toRecord);
  }

  return dbAll<ReminderDraftRecord>(
    db,
    `SELECT ${DRAFT_COLUMNS} FROM reminder_drafts
     WHERE workspace_id = ?
     ORDER BY generated_at DESC, id DESC`,
    [ws],
  ).map(toRecord);
}

/**
 * Generates reminder text from the invoice balance and stores a reviewable draft.
 * Does not send WhatsApp or mutate invoice/payment rows.
 */
export function createReminderDraft(
  db: DatabaseSync,
  ws: string,
  input: unknown,
): ReminderDraftRecord {
  const body = requireObject(input);
  const invoiceId = parseNonEmptyString(body.invoice_id, "invoice_id", 64);
  const language = parseEnum(body.language, "language", REMINDER_LANGUAGES);
  const tone = parseEnum(body.tone, "tone", REMINDER_TONES);

  const invoice = getInvoiceWithBalance(db, ws, invoiceId);
  if (invoice.workflow_status === "draft") {
    throw businessRule("Cannot create a reminder for a draft invoice");
  }
  if (invoice.outstanding_paise <= 0) {
    throw businessRule("Cannot create a reminder for a fully paid invoice");
  }

  const content = generateReminder({
    language,
    tone,
    clientName: invoice.customer_name,
    invoiceNumber: invoice.invoice_number,
    remainingPaise: invoice.outstanding_paise,
    dueDate: invoice.due_date,
    promisedDate: invoice.promised_date,
  });

  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO reminder_drafts
       (id, workspace_id, invoice_id, language, tone, content, generated_at, updated_at, copied_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
  ).run(id, ws, invoiceId, language, tone, content, now, now);

  return getReminderDraft(db, ws, id);
}

/**
 * Updates draft content and/or sets copied_at when mark_copied is true.
 * Does not send WhatsApp.
 */
export function updateReminderDraft(
  db: DatabaseSync,
  ws: string,
  id: string,
  patch: unknown,
): ReminderDraftRecord {
  const body = requireObject(patch);
  const unknown = Object.keys(body).filter((k) => !UPDATABLE_FIELDS.has(k));
  if (unknown.length > 0) {
    throw validationError(`Unknown field(s): ${unknown.join(", ")}`, { fields: unknown });
  }
  if (Object.keys(body).length === 0) {
    throw validationError("No fields to update");
  }

  const current = getReminderDraft(db, ws, id);
  let content = current.content;
  let copiedAt = current.copied_at;

  if ("content" in body) {
    content = parseNonEmptyString(body.content, "content", 5000);
  }
  if ("mark_copied" in body) {
    if (body.mark_copied !== true && body.mark_copied !== false) {
      throw validationError("mark_copied must be a boolean", { field: "mark_copied" });
    }
    if (body.mark_copied === true) {
      copiedAt = new Date().toISOString();
    }
  }

  const now = new Date().toISOString();
  db.prepare(
    `UPDATE reminder_drafts
     SET content = ?, updated_at = ?, copied_at = ?
     WHERE workspace_id = ? AND id = ?`,
  ).run(content, now, copiedAt, ws, id);

  return getReminderDraft(db, ws, id);
}
