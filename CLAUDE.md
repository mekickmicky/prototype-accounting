# WIND CLINIC — Accounting System Prototype

> **Read this file first.** It defines mission, stack, conventions, and reading order for the entire spec pack.

## Project Identity

| Field | Value |
|---|---|
| **Name** | `wind-accounting` |
| **Purpose** | Production-grade prototype of a full double-entry accounting system for WIND CLINIC, a multi-branch beauty/aesthetic clinic in Thailand. |
| **Status** | Prototype — single-tenant, single-company (WIND CLINIC only). Bank integration is **mocked**, structured to be swapped for real KBank/SCB APIs later. |
| **Owner** | MEKICK / Aow D Tech Group |
| **Sister project** | `wind-stock` (separate inventory module). This system **receives** journal entries from `wind-stock` via the Accounting Export contract. |

## Mission for Claude Code

Build a working accounting system prototype that:

1. **Implements full double-entry bookkeeping** with an immutable journal entry ledger, period close, and trial balance that always balances.
2. **Covers the complete Thai SME accounting flow**: GL + AR + AP + Tax (VAT/WHT) + Bank Reconciliation + Financial Reports.
3. **Demonstrates real-world flow integrity** — every business event (sale, purchase, payment, receipt) auto-posts a balanced journal entry. No "orphan" transactions.
4. **Uses production-grade patterns** (immutable JE ledger, period locking, document numbering with reset, posted-vs-draft state, void-by-reversal) so the prototype can graduate to real product without rewriting core logic.
5. **Mocks bank integration cleanly** — bank transactions, slip verification, and webhooks are all behind a `BankProvider` interface with a `MockBankProvider` implementation. Swapping to real KBank API = changing one line of config.
6. **Is deployable to Vercel** with PostgreSQL (Supabase or Railway).
7. **Has a clean, dense, professional UI** matching WIND CLINIC's existing brand (dark theme with rose-gold accent, Sarabun + Cormorant fonts).
8. **Integrates with WIND CLINIC's clinic management system** via webhook (`visit.completed` → auto-create invoice + receipt + JE).

## Non-Goals (Explicitly Out of Scope)

- Multi-tenant / multi-company support (single-tenant only)
- Payroll module (handled by WIND CLINIC HR system, integration via webhook later)
- Inventory module (handled by `wind-stock`, which exports JEs to this system)
- Real bank API integration (mocked — see `07-bank-integration.md`)
- DBD e-Filing direct submission (export the file format, but don't auto-submit)
- Mobile app (web-responsive only)
- Approval workflows beyond "draft → posted" (e.g., multi-level approval is out)

## How to Read This Spec Pack

Read in this exact order. Each spec is self-contained but cross-references the others.

| # | File | Read when |
|---|------|-----------|
| 0 | `CLAUDE.md` (this file) | First. Mission, stack, conventions. |
| 1 | `specs/01-domain-model.md` | Building Prisma schema or understanding data shape. |
| 2 | `specs/02-business-rules.md` | Implementing posting, period close, double-entry, voiding. |
| 3 | `specs/03-thai-tax.md` | Anything involving VAT 7%, withholding tax, ภพ.30, ภงด.3/53. |
| 4 | `specs/04-modules.md` | Per-module feature spec (GL, AR, AP, Bank, Reports). |
| 5 | `specs/05-api-contracts.md` | Implementing or calling REST endpoints. |
| 6 | `specs/06-ui-design-system.md` | Building any UI page. Tokens, density, components. |
| 7 | `specs/07-bank-integration.md` | Bank import, slip verify, webhook, mock provider. |
| 8 | `specs/08-reports.md` | Trial Balance, P&L, Balance Sheet, Cash Flow, GL detail. |
| 9 | `specs/09-integrations.md` | Webhooks from `wind-clinic` and `wind-stock`. |
| 10 | `specs/10-seed-data.md` | Bootstrapping the prototype with realistic data. |
| 11 | `specs/11-build-phases.md` | Build order, acceptance criteria per phase. |

Wireframes in `wireframes/` are HTML mockups — open in browser to see the actual visual target.

## Tech Stack (Locked)

| Layer | Choice | Rationale |
|---|---|---|
| Runtime | **Bun** | Standard across MEKICK projects |
| API framework | **Elysia** | Standard; Pattern 2 (direct Prisma in service layer) |
| ORM | **Prisma** | Locked across MEKICK projects |
| Database | **PostgreSQL** | Supabase or Railway. Numeric type for money (never Float). |
| Frontend | **Next.js 15 (App Router)** | Locked |
| UI | **Tailwind v4 + shadcn/ui** | Standard |
| Auth | Mock cookie-based | Real SSO later. See spec 04 §Auth. |
| Money type | **Prisma `Decimal` → app `Decimal.js`** | Never use JS `number` for money. |
| Date | **`date-fns` + `Asia/Bangkok` TZ** | Buddhist Era display, Gregorian storage. |
| Validation | **Zod** | Both Elysia route schemas and frontend forms. |
| Charts | **Recharts** | For dashboards. |
| PDF | **`@react-pdf/renderer`** | Tax forms (ภพ.30, withholding cert) and invoices. |

## Naming & Code Conventions

- **Files:** `kebab-case.ts`, `kebab-case.tsx`
- **Folders:** `kebab-case/`
- **DB tables:** `snake_case` (Prisma `@@map`)
- **DB columns:** `snake_case` (Prisma `@map`)
- **TS variables:** `camelCase`
- **Types/Interfaces:** `PascalCase`
- **Enums:** `UPPER_SNAKE` values, `PascalCase` name
- **Money columns:** Always `Decimal(15, 2)` — never `Float`, never integer cents
- **All amounts in code:** Use `Decimal.js`, never `number`. Compare with `.eq()`, add with `.plus()`.
- **Document numbers:** `{TYPE}-{YYYY}-{NNNN}` — e.g., `JE-2026-0001`, `INV-2026-0042`
- **Period codes:** `YYYY-MM` — e.g., `2026-05`
- **Account codes:** Numeric strings, hierarchical (see spec 01)
- **API base:** `/api/v1/...`

## Money Handling (Critical)

> **Use `Decimal` everywhere. Never `Float`. Never `parseFloat`.**

```ts
// ✅ Correct
import Decimal from 'decimal.js';
const total = new Decimal(price).times(qty);
if (total.eq(otherAmount)) { ... }

// ❌ NEVER
const total = price * qty;
if (total === otherAmount) { ... }
```

Prisma maps `Decimal(15, 2)` to `Prisma.Decimal` which is JSON-serialized as a string. Frontend re-parses with `new Decimal(str)`. Never round mid-calculation; round only at display.

## Date & Period Handling

- **Storage:** UTC ISO 8601 in DB (`timestamptz`)
- **Display:** `Asia/Bangkok` timezone, Buddhist Era year (e.g., 7 พฤษภาคม 2569)
- **Period code:** `YYYY-MM` always in Gregorian for system use
- **Fiscal year:** January–December (configurable per system, but locked to calendar year for prototype)

## Multi-Branch (Within Single Company)

WIND CLINIC has multiple branches. The system is single-tenant but **branch-aware**:

- Every transaction has a `branch_code` field
- Reports can filter by branch or roll up to company-wide
- Branch codes: `TL` (Thonglor), `EK` (Ekkamai), `RAMA9` (Rama 9) — extendable
- This is **NOT** multi-tenant. All branches share the same chart of accounts, same fiscal periods, same database row-level access.

## Build Phases (Summary — full detail in `11-build-phases.md`)

1. **Phase 1 — Foundation:** Prisma schema, seed data, mock auth, base layout.
2. **Phase 2 — GL Core:** Chart of Accounts, Journal Entry CRUD + post/void, Period management, Trial Balance.
3. **Phase 3 — AR:** Customers, Sales Invoice, Receipt, AR Aging.
4. **Phase 4 — AP:** Vendors, Bills, Payment, AP Aging.
5. **Phase 5 — Tax:** VAT register, ภพ.30, withholding tax, ภงด.3/53.
6. **Phase 6 — Bank:** Bank accounts, mock import, reconciliation, slip mock-verify.
7. **Phase 7 — Reports:** P&L, Balance Sheet, Cash Flow, GL detail with drill-down.
8. **Phase 8 — Integrations:** Webhook receivers from `wind-clinic` and `wind-stock`.

Each phase has acceptance criteria. **Do not advance to the next phase until criteria are met.**

## Critical Invariants (Never Break These)

1. **Every posted JE must balance** — `SUM(debit) = SUM(credit)` to the cent. Enforced at DB level via CHECK constraint.
2. **Posted JEs are immutable** — to "edit", void and re-post. Voiding creates a reversing JE.
3. **Closed periods reject postings** — JEs into a closed period must fail at the service layer, not silently skip.
4. **Document numbers are sequential per type per year** — gaps allowed only via voided documents, never by deletion.
5. **No raw deletes** — soft delete (`deleted_at`) for masters; voids for transactions.
6. **Trial balance must balance** at all times — if it doesn't, something is corrupt.
7. **Branch + Account combination determines which sub-ledger a transaction touches** — never bypass this.

## When in Doubt

- **Domain question** → spec 01 + spec 02
- **"How should this look?"** → spec 06 + open the relevant wireframe
- **"What endpoint do I call?"** → spec 05
- **"What does the accountant care about?"** → spec 03 (tax) + spec 08 (reports)
- **"How does this integrate with WIND CLINIC visits?"** → spec 09

If the spec is ambiguous, prefer the option that matches **Peak Account / Express Accounting / FlowAccount** behavior — these are the established Thai accounting SaaS that WIND CLINIC's accountant will compare us to.
