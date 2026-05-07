# WIND CLINIC — Accounting System Spec Pack

Production-grade prototype specification for a single-tenant, full-flow accounting system for WIND CLINIC, a multi-branch beauty/aesthetic clinic in Thailand.

## What's in this pack

```
wind-accounting-spec/
├── CLAUDE.md                            ← Read this first (entry point)
├── README.md                            ← You are here
├── specs/
│   ├── 01-domain-model.md              ← Full Prisma schema + entity rationale
│   ├── 02-business-rules.md            ← Posting, period close, voiding, double-entry
│   ├── 03-thai-tax.md                  ← VAT 7%, ภพ.30, ภงด.3/53, withholding
│   ├── 04-modules.md                   ← Per-module feature spec (GL/AR/AP/Bank/Tax/Reports)
│   ├── 05-api-contracts.md             ← All REST endpoints + Zod schemas
│   ├── 06-ui-design-system.md          ← Tokens, density, typography, components
│   ├── 07-bank-integration.md          ← Mock provider + swappable real KBank/SCB later
│   ├── 08-reports.md                   ← TB / P&L / BS / Cash Flow / GL / Aging
│   ├── 09-integrations.md              ← Webhooks from wind-clinic + wind-stock
│   ├── 10-seed-data.md                 ← Bootstrap CoA, periods, sample 3 months activity
│   └── 11-build-phases.md              ← 8 phases with acceptance criteria
└── wireframes/
    ├── _styles.css                     ← Shared design tokens (mirrors spec 06)
    ├── 01-dashboard.html
    ├── 02-journal-entry.html
    ├── 03-trial-balance.html
    ├── 04-sales-invoice.html
    ├── 05-pp30.html
    └── 06-bank-reconcile.html
```

## Scope

✅ **Included:**
- Double-entry general ledger with immutable JE, period close, void-by-reversal
- AR (Customers, Sales Invoices, Receipts, AR Aging)
- AP (Vendors, Bills, Payments with WHT, AP Aging)
- Thai tax: VAT 7%, ภพ.30 monthly filing, ภงด.3/53, 50 ทวิ certificates
- Bank reconciliation (mocked, swappable to real KBank/SCB)
- Full financial reports: Trial Balance, P&L, Balance Sheet, Cash Flow, GL detail
- Multi-branch within single company (TL / EK / RAMA9)
- Webhook integration with wind-clinic (auto invoice + receipt on visit completion)
- Webhook integration with wind-stock (period-end JE bulk import)

❌ **Excluded (non-goals):**
- Multi-tenant / multi-company
- Payroll module
- Inventory module (handled by wind-stock)
- Real bank API (mocked only — see spec 07)
- DBD e-Filing direct submission
- Mobile app (web-responsive only)

## Tech Stack

- **Backend:** Bun + Elysia + Prisma + PostgreSQL
- **Frontend:** Next.js 15 App Router + Tailwind v4 + shadcn/ui
- **Money:** `Decimal(15,2)` in DB, `decimal.js` everywhere else (NEVER Float)
- **Date:** `date-fns` + `Asia/Bangkok` TZ + Buddhist Era display
- **PDF:** `@react-pdf/renderer` (tax forms, invoices, certificates)
- **Charts:** Recharts

## Local Development

### Prerequisites
- **Bun** ≥ 1.1 (`curl -fsSL https://bun.sh/install | bash`)
- **Docker** + Docker Compose (for Postgres 16 and pgAdmin)
- **Node** ≥ 20 (only required by some tooling)

### First-time setup
```bash
# 1. Install workspace dependencies
bun install

# 2. Copy env templates
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local

# 3. Start Postgres + pgAdmin
docker compose up -d
#   Postgres → localhost:5432 (user: wind, pass: wind_dev, db: wind_accounting)
#   pgAdmin   → http://localhost:5050  (login: admin@wind.local / wind_dev)

# 4. Run migrations + seed
bun run db:migrate          # Phase 1: T-1.3
bun run db:seed             # Phase 1: T-1.10, T-1.11

# 5. Start dev servers (api on :3001, web on :3000)
bun run dev
```

### Useful scripts
| Command | What it does |
|---|---|
| `bun run dev` | Start API + Web concurrently |
| `bun run dev:api` | Start API only (`:3001`) |
| `bun run dev:web` | Start Web only (`:3000`) |
| `bun run typecheck` | Strict TS check on both apps |
| `bun run db:studio` | Open Prisma Studio |
| `bun run db:reset` | Drop, re-migrate, re-seed (destructive) |

### Repo layout
```
apps/
  api/    # Elysia API on :3001
  web/    # Next.js 16 App Router on :3000
packages/ # Shared (decimal helpers, types, etc.)
specs/    # Domain spec pack — read CLAUDE.md first
wireframes/ # HTML mockups — visual target
```

## Deployment (target)

- **Web** → Vercel (Next.js)
- **API** → Railway / Fly.io / Render (Bun runtime)
- **Postgres** → Supabase or Railway managed Postgres
- See `specs/11-build-phases.md` for production cut-over checklist.

## How to use this with Claude Code

1. Open Claude Code in this repo
2. Start your first session with:

   > "Read `CLAUDE.md`, then begin from the next un-checked task in `specs/tasks/phase-N-*.md` (current phase tracked in `specs/tasks/PROGRESS.md`)."

3. Open `wireframes/*.html` in a browser to see the actual visual target
4. Review at end of each phase using the acceptance criteria in `specs/11-build-phases.md`

## Build phases (summary)

| # | Phase | What it delivers |
|---|---|---|
| 1 | Foundation | Schema migrated, seed data loaded, mock auth, base layout |
| 2 | GL Core | Manual JE flow + Trial Balance + Period close |
| 3 | AR | Customer → Invoice → Receipt → AR Aging |
| 4 | AP | Vendor → Bill (with WHT) → Payment → 50 ทวิ cert |
| 5 | Tax | ภพ.30 monthly filing + ภงด.3/53 |
| 6 | Bank | Mock import + reconciliation workspace + slip verify |
| 7 | Reports | P&L / BS / Cash Flow / GL drill-down / Branch P&L |
| 8 | Integrations | Webhook receivers from wind-clinic + wind-stock |

## Critical invariants

The system enforces these at the DB constraint level + service layer + UI:

1. **Every posted JE must balance** (`SUM(debit) = SUM(credit)`)
2. **Posted JEs are immutable** — to "edit", void and re-post
3. **Closed periods reject postings**
4. **Document numbers are sequential per type per year** (gaps allowed only via voids)
5. **No raw deletes** — soft delete masters, void transactions
6. **Trial balance must balance at all times**
7. **Branch + Account combination determines which sub-ledger a transaction touches**

## Wireframes

The HTML files in `wireframes/` are the visual target. They use the exact design tokens from `specs/06-ui-design-system.md`. The actual implementation should match the look and density.

Open them in a browser:
```bash
# From the wireframes/ directory
python3 -m http.server 8080
# Then visit http://localhost:8080/01-dashboard.html
```

## Sister projects

- **`wind-stock`** — Inventory module. Pushes period-end JE bulk to this system via `POST /api/v1/webhooks/wind-stock/period-export`. Has its own spec pack.
- **`wind-clinic`** — Clinic management (patients, appointments, EMR, treatments). Pushes `visit.completed` events to this system, which auto-creates Invoice + Receipt + JE. Each visit becomes one accounting record set.

## Notes for Claude Code

- All specs in **English** for AI readability. Thai used in user-facing strings, account names (`name_th`), error messages.
- Money math: **always Decimal**. Never `Float`, never `parseFloat`, never `Number` for currency.
- Compliance reference: TFRS / GAAP for reporting format, Thai Revenue Department rules for tax invoice formatting and sequential numbering.
- Benchmark accounting SaaS to mirror behavior: **Peak Account, FlowAccount, Express Accounting** — when a spec is ambiguous, prefer what these established Thai SaaS do.
