# CashCue — User Personas & User Journeys

## Product framing

CashCue is a financial operations and cash-flow forecasting application for freelancers, small web agencies, design studios, and service-based businesses.

It is **not** a generic invoicing app. It helps owners answer:

1. How much cash do I have now?
2. Will I stay above my minimum buffer over 30 / 60 / 90 days?
3. Which bills break if clients pay late?
4. What should I chase today?
5. What reminder should I send (English or Telugu)?

**Core differentiators**

- Promised-date vs invoice-due-date forecasting
- Minimum cash buffer monitoring and bill-risk detection
- +15-day invoice delay simulation
- Financial impact-ranked action queue
- Reviewable English and Telugu WhatsApp reminder drafts (nothing auto-sent)

**Primary demo workspace:** PixelCraft Studio (synthetic Hyderabad-style agency).

**30-second pitch:** CashCue shows your real cash position, forecasts the next 30–90 days against a minimum buffer, flags risky bills, simulates delayed payments, and ranks what to chase first — with English/Telugu WhatsApp reminder drafts.

---

## Personas

### Persona 1 — Primary: Studio owner / operator

| Field | Detail |
|-------|--------|
| **Name** | Ananya Rao |
| **Role** | Founder, PixelCraft Studio (web + design, 3–8 people) |
| **Location** | Hyderabad; Telugu–English bilingual clients |
| **Tech comfort** | High enough for SaaS tools; hates spreadsheet gymnastics |

**Goals**

- Know if rent, contractors, and SaaS can be paid on time
- Prioritize which client to follow up with first
- Avoid surprise shortfalls from delayed milestone payments

**Pain points**

- Spreadsheets mix hard due dates with verbal “I’ll pay Friday”
- Overdue clients and contractor payouts collide in the same week
- Reminder messages feel awkward; Telugu clients prefer Telugu WhatsApp

**Jobs to be done**

- Check cash safety daily
- Forecast before committing to a payout
- Simulate “what if Aster pays 15 days late?”
- Send a reviewable reminder (not auto-send)

**Success looks like**

Opens Overview → sees buffer status + cash chart → runs What-If → acts from ranked Actions with a Telugu or English draft.

---

### Persona 2 — Secondary: Solo freelancer

| Field | Detail |
|-------|--------|
| **Name** | Karthik Menon |
| **Role** | Independent designer / developer |
| **Location** | Tier-1 or Tier-2 Indian city |
| **Scale** | 3–8 active clients; no bookkeeper |

**Goals**

- One screen that says “safe / at risk” for the month
- Track promised payment dates, not only invoice due dates
- Keep a personal minimum cash buffer (e.g. rent + living float)

**Pain points**

- Partial payments confuse “how much is left”
- Recurring tools (hosting, Figma, phone) are easy to forget in forecasts
- No time to build a custom spreadsheet model

**Jobs to be done**

- Record a payment when money lands
- See which week dips below buffer
- Get a polite English reminder draft without rewriting from scratch

**Success looks like**

Receivables → record payment → Forecast still green → Settings buffer still trusted.

---

### Persona 3 — Occasional: Operations / office partner

| Field | Detail |
|-------|--------|
| **Name** | Priya Shah |
| **Role** | Studio ops / accounts partner (not a full-time accountant) |
| **Focus** | Bills, recurring expenses, customer records |

**Goals**

- Keep contractor payouts and rent on the calendar
- Maintain customer WhatsApp numbers for reminders
- Mark bills paid so forecast stops double-counting them

**Pain points**

- Paying a bill in the bank but forgetting to update the forecast
- Recurring rules that create duplicate “ghost” outflows if handled poorly

**Jobs to be done**

- Add / pay one-time bills
- Manage recurring rules
- Keep Settings (opening cash, as-of date, buffer) accurate

**Success looks like**

Bills → Mark paid → Forecast outflows drop → Overview risk updates.

---

### Non-personas (out of scope for MVP)

- Enterprise multi-tenant finance teams with SSO
- Full accounting / GST / ledger replacement users
- Users who need automatic WhatsApp sending (CashCue drafts only)

---

## Demo cast (PixelCraft seed)

Use these names in walkthroughs so the story feels concrete.

| Entity | Role in story |
|--------|----------------|
| **PixelCraft Studio** | Demo workspace |
| **Aster Dental Clinic (INV-001)** | ₹45,000 milestone; promised ~25 Nov — primary what-if delay |
| **Deccan Interiors (INV-002)** | ₹30,000; promised later than due |
| **Nizam Foods (INV-003)** | Overdue receivable — chase candidate |
| **Urban Nest Studio (INV-005)** | Partial payment already recorded |
| **Contractor / designer payouts** | Buffer-threatening bills |
| **Rent, SaaS, cloud, internet** | Recurring outflows |

---

## User journeys

### Journey A — “Am I safe this month?” (happy path / daily check)

**Persona:** Ananya  
**Trigger:** Morning coffee; before approving a contractor payout  
**Goal:** Know cash safety at a glance

| Step | Screen | User action | System response |
|------|--------|-------------|-----------------|
| 1 | Overview | Opens app | Shows cash now, buffer, min balance, buffer OK / breach badges |
| 2 | Overview | Scans cash curve | Indigo balance vs amber buffer; crimson if below buffer |
| 3 | Overview | Reviews overdue / at-risk lists | Sees who/what threatens cash |
| 4 | Cash Forecast | Opens 30 / 60 / 90 | Horizon pills + chart + movement days |
| 5 | (Optional) Bills | Checks upcoming payouts | Scheduled vs recurring clarity |

**Outcome:** Confidence to pay — or decision to delay a payout / chase a client first.

**Emotions:** Anxiety → clarity → control.

---

### Journey B — “What if they pay 15 days late?” (core differentiator)

**Persona:** Ananya  
**Trigger:** Aster Dental says payment may slip  
**Goal:** Quantify delay risk without changing real records

| Step | Screen | User action | System response |
|------|--------|-------------|-----------------|
| 1 | Overview / Forecast | Notices buffer pressure near Aster receipt | Chart / breach hint |
| 2 | What-If Simulator | Selects INV-001 (Aster) | Invoice list with outstanding + expected date |
| 3 | What-If Simulator | Sets +15 days, horizon 30 | Params ready |
| 4 | What-If Simulator | Runs simulation | Baseline vs delayed: min balance, shortfall delta, first breach, threatened bills |
| 5 | Today’s Actions | Opens ranked queue | Aster / high-impact invoices prioritized |
| 6 | Today’s Actions | Generates EN or TE reminder | Reviewable draft; copy for WhatsApp — not auto-sent |

**Outcome:** Clear shortfall cost of delay + a message ready to send manually.

**Emotions:** Uncertainty → evidence → decisive follow-up.

**Demo tip:** Emphasize *read-only* simulation — invoices and cash rows do not change.

---

### Journey C — “Money just arrived” (record payment)

**Persona:** Karthik or Ananya  
**Trigger:** UPI / bank credit for a sent invoice  
**Goal:** Update outstanding and cash story correctly

| Step | Screen | User action | System response |
|------|--------|-------------|-----------------|
| 1 | Receivables | Finds outstanding invoice | Amount, due/promised, overdue badge if any |
| 2 | Receivables | Record payment (amount, date, method) | Validates; writes payment + cash inflow |
| 3 | Overview / Forecast | Refreshes | Cash now and series update; risk may clear |

**Outcome:** Books and forecast stay in sync after real money movement.

**Edge cases:** Partial payment; idempotent replay of same payment key; draft invoices cannot be paid.

---

### Journey D — “Pay the contractor without double-counting”

**Persona:** Priya  
**Trigger:** Contractor payout due today  
**Goal:** Mark bill paid so forecast stops showing it as a future outflow

| Step | Screen | User action | System response |
|------|--------|-------------|-----------------|
| 1 | Bills → Scheduled | Locates contractor payout | Amount + due date |
| 2 | Bills | Mark paid | Status paid; cash outflow recorded |
| 3 | Forecast | Re-checks horizon | Bill no longer a future scheduled outflow |

**Outcome:** No ghost double-count of the same expense.

---

### Journey E — “First-time setup / demo reset mental model”

**Persona:** Ananya (or hackathon judge)  
**Trigger:** First open or Settings tweak  
**Goal:** Trust the as-of snapshot and buffer

| Step | Screen | User action | System response |
|------|--------|-------------|-----------------|
| 1 | Settings | Reviews opening cash, as-of, buffer | Explains aging + forecast anchor |
| 2 | Settings | Adds / confirms customers | Ready for invoices |
| 3 | Invoices | Creates draft → Send | Appears in receivables / forecast when sent |
| 4 | Overview | Returns | Full cash story from live workspace data |

**Outcome:** Understands that **as-of date** drives forecast and aging for the demo.

---

## Six-step demo script (hackathon / walkthrough)

Use this as the spoken path for PixelCraft Studio:

1. **Overview** — “Here’s cash now vs minimum buffer; the curve is indigo, buffer is amber.”
2. **Cash Forecast** — “30-day outlook; days below buffer highlighted in crimson.”
3. **Receivables** — “Nizam Foods is overdue; Urban Nest already paid part of INV-005.”
4. **What-If** — “Delay Aster INV-001 by +15 days — shortfall gets worse; records stay untouched.”
5. **Today’s Actions** — “Ranked by financial impact; generate Telugu or English WhatsApp draft.”
6. **Bills / Settings** — “Pay a bill or tweak buffer — forecast updates from the same live data.”

---

## Journey → screen map

| Need | Primary screen | Supporting screens |
|------|----------------|--------------------|
| Am I safe? | Overview | Forecast |
| See cash over time | Forecast | Overview |
| Feel delay cost | What-If Simulator | Actions |
| Chase clients | Today’s Actions | Receivables |
| Record money in | Receivables | Invoices |
| Record money out | Bills | Forecast |
| Configure snapshot | Settings | Overview |

---

## Messaging do’s and don’ts

**Do say**

- Cash position, buffer, forecast, what-if, ranked actions, reminder drafts
- Promised date vs due date
- Indian rupee formatting (₹80,000)

**Don’t say**

- “Invoicing SaaS” as the primary identity
- API endpoints in user-facing demos
- “We auto-send WhatsApp” (drafts only)

---

## Related docs

- Product brief and roadmap: `docs/info.md`
- Demo seed data: `lib/db/seed.ts` (PixelCraft Studio)
