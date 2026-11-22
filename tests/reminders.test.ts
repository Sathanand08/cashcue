import { test } from "node:test";
import assert from "node:assert/strict";
import { generateReminder } from "../lib/reminders/templates";

const base = {
  clientName: "Aster Dental Clinic",
  invoiceNumber: "INV-001",
  remainingPaise: 4500000,
  dueDate: "2026-11-24",
  promisedDate: "2026-11-25",
};

test("English reminders contain client, invoice and amount", () => {
  for (const tone of ["friendly", "professional", "firm"] as const) {
    const text = generateReminder({ ...base, language: "en", tone });
    assert.ok(text.includes("Aster Dental Clinic"), tone);
    assert.ok(text.includes("INV-001"), tone);
    assert.ok(text.includes("₹45,000"), tone);
  }
});

test("Telugu reminders contain client, invoice, amount and Telugu script", () => {
  for (const tone of ["friendly", "professional", "firm"] as const) {
    const text = generateReminder({ ...base, language: "te", tone });
    assert.ok(text.includes("Aster Dental Clinic"), tone);
    assert.ok(text.includes("INV-001"), tone);
    assert.ok(text.includes("45,000"), tone);
    assert.match(text, /[\u0C00-\u0C7F]/, tone);
  }
});

test("English friendly reminder with no promised date never states a promise", () => {
  const text = generateReminder({ ...base, promisedDate: null, language: "en", tone: "friendly" });
  assert.ok(!text.includes("expected payment date"));
});
