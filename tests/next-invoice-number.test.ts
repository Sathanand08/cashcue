import assert from "node:assert/strict";
import { test } from "node:test";
import { suggestNextInvoiceNumber } from "../lib/invoices/next-number";

test("suggestNextInvoiceNumber starts at INV-001 when empty", () => {
  assert.equal(suggestNextInvoiceNumber([]), "INV-001");
});

test("suggestNextInvoiceNumber increments max INV-###", () => {
  assert.equal(
    suggestNextInvoiceNumber(["INV-001", "INV-007", "INV-003"]),
    "INV-008",
  );
});

test("suggestNextInvoiceNumber ignores non-INV labels when computing sequence", () => {
  assert.equal(
    suggestNextInvoiceNumber(["AST-01", "INV-002", "CUSTOM"]),
    "INV-003",
  );
});

test("suggestNextInvoiceNumber is case-insensitive", () => {
  assert.equal(suggestNextInvoiceNumber(["inv-009"]), "INV-010");
});
