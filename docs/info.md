# CASHCUE — MASTER PROJECT BRIEF

## Product

CashCue is a financial operations and cash-flow forecasting application for freelancers, small web agencies, design studios and service-based businesses.

Its purpose is to help business owners understand their actual cash position, forecast future cash availability, identify risky bills, simulate delayed payments and prioritize financial actions.

It is not a generic invoicing application.

## Core differentiators

1. Promised-date versus invoice-due-date forecasting.
2. Minimum cash buffer monitoring and bill-risk detection.
3. +15-day invoice delay simulation.
4. Financial impact-ranked action queue.
5. Reviewable English and Telugu WhatsApp reminder drafts.

## Technology

- Next.js 15
- TypeScript
- Tailwind CSS 3
- Node.js built-in SQLite
- Node.js 22.12
- Existing service and financial engine architecture

Do not replace this stack without a strong technical reason.

## Existing implementation

The reported existing code includes:

- SQLite schema, initialization and seed.
- Cash settings.
- Customers.
- Invoice creation, editing and sending.
- Payment recording and receivables.
- Payment validation and idempotency.
- Recurring expense expansion engine.
- Forecast and buffer analysis engines.
- Delay scenario engine.
- Action ranking engine.
- English/Telugu reminder templates.
- Automated tests.

Earlier reports showed 25/25 tests passing, TypeScript passing and production build compiling. These results must be reverified after the failed npm ci attempt.

## Current status

- Stage 1: Verified (engines, seed, invoice/payment APIs).
- SWC: Win32 native binary warning on build; build still succeeds. Non-blocking.
- npm ci: Earlier `Invalid Version:` failure; use `npm install` if needed. Non-blocking while install/test/build work.
- Current-session verification: typecheck pass; production build pass (SWC Win32 warning); `npm test` 77/77 pass; frontend shell builds.
- Workspace isolation: Covered by service tests (including bills, recurring, reminders); no auth / multi-tenant product yet (demo workspace only).
- Stage 2 APIs: Implemented: forecast (`/api/forecast`), delay scenario (`/api/forecast/scenarios/delay`), actions (`/api/actions`), invoices and payments (`/api/invoices`, `/api/invoices/[id]/payments`), receivables (`/api/receivables`), customers, settings/cash, bootstrap, invoice send (`/api/invoices/[id]/send`), bills (`/api/bills`, `/api/bills/[id]/pay`, `/api/bills/[id]/cancel`), recurring expenses (`/api/recurring-expenses`, `/api/recurring-expenses/[id]`, `/api/recurring-expenses/[id]/pay`), and reminder drafts (`/api/reminders`, `/api/reminders/[id]`). Stage 2 backend API surface complete.
- Demo date semantics: Forecast, receivables aging, and bootstrap `today`/`as_of` all use `workspace_settings.opening_cash_as_of`. Payment/bill future-date checks still use wall-clock `todayIST()`.
- Frontend: Full app shell wired — Overview, Receivables, Invoices, Bills/Expenses, Cash Forecast, What-If Simulator, Today's Actions, Settings. All screens use live DB/API data.
- Full end-to-end workflow: Ready for manual six-step demo verification.

A backup was reportedly created at `..\cashcue-backup-stage1`. It excludes node_modules, .next, reports and database files.

## Required development roadmap

### First: Stabilization

1. Inspect node_modules.
2. Run TypeScript check.
3. Run all tests.
4. Run production build.
5. Investigate SWC without unnecessary dependency upgrades.
6. Audit workspace isolation.

### Second: Backend APIs

Implement sequentially:

1. Forecast loader and 30/60/90-day forecast API.
2. Single/multiple invoice delay simulation API.
3. Impact-ranked action queue API.
4. One-time bills and actual payment tracking.
5. Recurring expense management.
6. Reminder draft creation, editing and history.

Reuse existing financial engines.

### Third: Frontend

Build a complete UI for:

1. Business setup.
2. Invoices and promised payment dates.
3. Receivables and payments.
4. Cash forecast and buffer analysis.
5. Delay simulation.
6. Action queue and reminders.

Also provide bills, recurring expenses, customer and settings management.

Connect all screens to real APIs and persisted database records.

### Fourth: Full verification

Test the complete six-step workflow using seeded business data.

Verify:
- Accurate cash calculations.
- Correct partial and full payments.
- No duplicate cash transactions.
- Correct bill-payment dates.
- Recurring occurrence idempotency.
- Correct scenario results.
- Invoice immutability during simulations.
- Reminder draft persistence.
- Workspace isolation.
- Persistence after refresh.
- Successful typecheck, tests and production build.

## Financial rules

- Expected receipt date uses promised date when available, otherwise invoice due date.
- Partial payments reduce outstanding receivables.
- Paid bills are recorded as actual cash outflows on their payment dates.
- Paid bills are excluded from future scheduled outflows.
- Recurring occurrences must be generated idempotently.
- What-if simulations must not modify actual financial records.
- No automatic WhatsApp sending.
- Forecast assumptions must be transparent.

## Working instructions

- Continue existing code; do not restart.
- Inspect before editing.
- Reuse existing engines and services.
- Keep financial calculations out of API route handlers.
- Preserve workspace isolation.
- Use database transactions for related financial operations.
- Write tests for each new capability.
- Complete and verify one component before starting the next.
- Do not use fake data to simulate completed functionality.
- Do not claim success without actual execution evidence.
- Keep the implementation maintainable and suitable for a production-oriented MVP.

## Final objective

Deliver a complete, usable CashCue application with a polished frontend, working backend, accurate financial calculations, persistent database operations, reliable error handling and a fully demonstrable six-step user journey.

The goal is not just a successful build. The goal is a complete, integrated and thoroughly tested application with no known blocking defects.

Always report completed work, remaining work, test results and unresolved issues honestly.