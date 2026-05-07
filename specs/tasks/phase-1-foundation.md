# Phase 1 — Foundation

**Goal:** Skeleton app that runs, has the database with full schema, mock auth, and a base layout.
**Reads:** specs/01-domain-model.md, specs/06-ui-design-system.md, specs/10-seed-data.md, specs/11-build-phases.md §Phase 1
**Acceptance:** specs/11-build-phases.md §Phase 1 — Foundation

## Conventions

- **Language:** All generated code, file content, identifiers, comments, and commit messages MUST be written in **English**. Thai is permitted ONLY in: (a) user-facing UI strings, (b) PDF templates for Thai tax forms / invoices / WHT certs, (c) seeded `name_th` columns, (d) i18n message catalogs.
- **Status checkbox:** Each task has `- [ ] **Status:** Not started`. On pickup change to `- [~] **Status:** In progress (owner: {name})`. When finished AND `Done when` verified, change to `- [x] **Status:** Done ({YYYY-MM-DD})`. NEVER mark `[x]` unless `Done when` has actually been checked.
- **Phase progress:** When all tasks in this file are `[x]`, mark this phase done in `specs/tasks/PROGRESS.md` (root tracker).

## Dependency Graph

```
T-1.1 (monorepo)
  ├─ T-1.2 (tailwind/shadcn) ─┬─ T-1.6 (design tokens) ─┬─ T-1.7 (UI primitives) ─┬─ T-1.8 (layout)
  │                            │                          │                         └─ T-1.9 (theme toggle)
  │                            │                          └─ T-1.14 (login UI) ─────┘
  ├─ T-1.3 (prisma schema) ─┬─ T-1.4 (CHECK constraints)
  │                          ├─ T-1.10 (CoA seed)
  │                          ├─ T-1.11 (other seeds) ──── T-1.13 (auth API)
  │                          └─ T-1.5 (decimal helpers)
  └─ T-1.16 (env config) ─── T-1.13
                              └─ T-1.12 (JWT middleware) ─ T-1.14 (login UI) ─ T-1.15 (shell + dashboard)
```

## Parallel Lanes

- **Lane A (foundation, sequential):** T-1.1 → T-1.3 → T-1.4
- **Lane B (frontend chrome, parallel after T-1.2):** T-1.6 → T-1.7 → T-1.8 + T-1.9
- **Lane C (data, parallel after T-1.3):** T-1.10, T-1.11, T-1.5
- **Lane D (auth, sequential after T-1.11 + T-1.16):** T-1.12 → T-1.13 → T-1.14 → T-1.15

## Cross-Phase Anchors Produced

- `prisma/schema.prisma` complete — blocks every service in phases 2–8
- `lib/money.ts` (Decimal config) — blocks every monetary calc in phases 2–8
- Account map seeded (`Setting` rows) — blocks Phase 8 webhook handlers
- 24 FiscalPeriod rows (current year ± 1) seeded — blocks Phase 2 period flow
- 5 seeded users (1 ADMIN, 2 ACCOUNTANT, 2 VIEWER) — blocks every authenticated test

---

## Tasks

### T-1.1 — Monorepo scaffold (Bun workspaces)
- [x] **Status:** Done (2026-05-07)
- **Model:** DeepSeek
- **Files:** `package.json`, `bun.lockb`, `apps/api/package.json`, `apps/web/package.json`, `tsconfig.base.json`, `.gitignore` (NEW)
- **Reads:** CLAUDE.md §Tech Stack, specs/11 §Phase 1 task 1
- **Spec:**
  - Root `package.json` with `workspaces: ["apps/*", "packages/*"]`
  - `apps/api`: `bun create elysia`, port 3001
  - `apps/web`: `bunx create-next-app@latest --app --ts --tailwind --src-dir --import-alias "@/*"`, port 3000
  - Shared `tsconfig.base.json` extended by both
  - Root scripts: `bun run dev` (concurrently both), `bun run db:migrate`, `bun run db:seed`
- **Depends on:** —
- **Blocks:** All other Phase 1 tasks
- **Done when:** `bun install` succeeds, `bun run dev` starts both apps, `curl localhost:3001` returns 200, `localhost:3000` shows Next default page

### T-1.2 — Tailwind v4 + shadcn/ui setup
- [x] **Status:** Done (2026-05-07)
- **Model:** DeepSeek
- **Files:** `apps/web/tailwind.config.ts`, `apps/web/src/app/globals.css`, `apps/web/components.json`, `apps/web/src/components/ui/*` (initial: button, input, dialog, dropdown-menu, table, badge, toast)
- **Reads:** specs/06 §Components
- **Spec:**
  - Tailwind v4 PostCSS config
  - `bunx shadcn@latest init` with neutral base
  - Install ~8 base components needed for Phase 1 layout
  - Lucide icons via `lucide-react`
- **Depends on:** T-1.1
- **Blocks:** T-1.6, T-1.7, T-1.14
- **Done when:** `<Button>` from `@/components/ui/button` renders, `npx shadcn add` works

### T-1.3 — Prisma schema (all 29 models)
- [ ] **Status:** Not started
- **Model:** Sonnet
- **Files:** `apps/api/prisma/schema.prisma` (NEW)
- **Reads:** specs/01-domain-model.md (full)
- **Spec:**
  - Translate all 29 models from spec 01: `Account`, `FiscalPeriod`, `JournalEntry`, `JournalLine`, `Customer`, `Vendor`, `SalesInvoice`, `SalesInvoiceLine`, `Receipt`, `ReceiptApplication`, `Bill`, `BillLine`, `Payment`, `PaymentApplication`, `BankAccount`, `BankTransaction`, `TaxFiling`, `VatRegister`, `WithholdingRecord`, `User`, `AuditLog`, `Setting`, `WebhookProcessed`, plus enums
  - Money fields: `Decimal @db.Decimal(15, 2)` (never Float)
  - Timestamps: `@db.Timestamptz(6)`
  - `@@map` snake_case, `@map` per column
  - All indexes from spec 01 (composite indexes on `(period_code, branch_code)`, `(account_code, je_id)`, etc.)
  - Soft-delete: `deleted_at DateTime?` on master entities (Account, Customer, Vendor)
  - Optimistic lock: `updated_at` on every transactional table
- **Depends on:** T-1.1
- **Blocks:** T-1.4, T-1.5, T-1.10, T-1.11, every service in phases 2–8
- **Done when:** `bunx prisma migrate dev --name init` succeeds against fresh Postgres, `bunx prisma studio` shows all 29 tables

### T-1.4 — DB CHECK constraints (raw SQL migration)
- [ ] **Status:** Not started
- **Model:** Opus
- **Files:** `apps/api/prisma/migrations/0001_add_check_constraints/migration.sql` (NEW)
- **Reads:** specs/01 §Constraints, specs/02 §1 (double-entry)
- **Spec:** Write raw SQL `ALTER TABLE ... ADD CONSTRAINT ... CHECK (...)`:
  - `journal_entries.total_debit = journal_entries.total_credit` (balance backstop)
  - `journal_lines`: `(debit > 0 AND credit = 0) OR (debit = 0 AND credit > 0)` (xor)
  - `journal_lines.debit >= 0 AND journal_lines.credit >= 0`
  - `sales_invoices.total >= 0`, `bills.total >= 0`
  - `receipts.total_amount > 0`, `payments.total_amount > 0`
  - `accounts.code ~ '^[0-9]{4,5}$'` (numeric code regex)
  - `fiscal_periods.code ~ '^[0-9]{4}-[0-9]{2}$'`
  - All money columns: `>= 0` where applicable (debit, credit, vat, withholding)
- **Depends on:** T-1.3
- **Blocks:** All posting in phases 2–8 (these constraints are the safety net)
- **Done when:** Migration applies cleanly; manual INSERT of unbalanced JE fails with constraint violation

### T-1.5 — Decimal.js config + money helpers
- [ ] **Status:** Not started
- **Model:** DeepSeek
- **Files:** `packages/shared/src/money.ts`, `packages/shared/package.json` (NEW)
- **Reads:** CLAUDE.md §Money Handling, specs/02 §13
- **Spec:**
  - `Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP })` once
  - Export: `D(v: string | number | Decimal): Decimal`
  - Export: `sumD(arr: Decimal[]): Decimal`
  - Export: `formatTHB(d: Decimal): string` (e.g., `1,234.56`, em-dash for zero, `(1,234.56)` for negative)
  - Export: `parseTHB(s: string): Decimal`
  - Re-export Decimal type
- **Depends on:** T-1.1
- **Blocks:** T-1.7 (MoneyInput uses these), every monetary path in phases 2–8
- **Done when:** Unit test `D('1.005').times(D('1.005')).toFixed(2) === '1.01'` passes

### T-1.6 — Design tokens (CSS variables)
- [ ] **Status:** Not started
- **Model:** DeepSeek
- **Files:** `apps/web/src/app/globals.css` (EDIT — extend Tailwind base)
- **Reads:** specs/06 §Tokens (colors, spacing, typography), wireframes/_styles.css
- **Spec:** Define CSS custom properties for:
  - Colors: `--bg-base`, `--bg-elevated`, `--surface`, `--border`, `--text-primary`, `--text-muted`, `--accent` (rose-gold), `--success`, `--warning`, `--error`, `--info`
  - Both `:root` (dark default) and `.light` variants
  - Fonts: import Sarabun (UI) + Cormorant (numeric/heading) via `next/font`
  - Tabular figures class `.tabular-nums`
  - Spacing scale per spec 06
- **Depends on:** T-1.2
- **Blocks:** T-1.7, T-1.8
- **Done when:** Theme tokens visible in DevTools; `font-family: 'Sarabun'` applied to body

### T-1.7 — Reusable UI components scaffold
- [ ] **Status:** Not started
- **Model:** Sonnet
- **Files:** `apps/web/src/components/ui/money-input.tsx`, `money-display.tsx`, `status-badge.tsx`, `data-table.tsx`, `confirm-dialog.tsx`, `empty-state.tsx`, `page-header.tsx`, `filter-bar.tsx` (NEW)
- **Reads:** specs/04 §Component Inventory, specs/06 §Components
- **Spec:**
  - `<MoneyInput>` — controlled string, validates on blur, displays formatted, emits Decimal on change
  - `<MoneyDisplay>` — accepts `Decimal | string`, applies `formatTHB`, em-dash for zero, parens for negative, `tabular-nums` class
  - `<StatusBadge>` — variants: DRAFT (gray), POSTED (green), VOID (red), PAID (blue), PARTIAL_PAID (amber), CLOSED/LOCKED (slate)
  - `<DataTable>` — generic table with sort, pagination, row actions; built on TanStack Table
  - Other components: minimal scaffold (will gain logic in later phases)
- **Depends on:** T-1.5, T-1.6
- **Blocks:** T-1.8, every UI page in phases 2–8
- **Done when:** Storybook-style demo page at `/dev/components` renders all 8 with sample data

### T-1.8 — Base layout (sidebar + topbar)
- [ ] **Status:** Not started
- **Model:** Sonnet
- **Files:** `apps/web/src/app/(authenticated)/layout.tsx`, `apps/web/src/components/layout/sidebar.tsx`, `topbar.tsx` (NEW)
- **Reads:** specs/06 §Layout patterns, specs/04 §Module Overview, wireframes/01-dashboard.html
- **Spec:**
  - Sidebar groups: Dashboard, GL, AR, AP, Tax, Bank, Reports, Integrations, Settings (9 groups)
  - Each group has nested route links per spec 04 module pages — most will 404 until those phases ship; render greyed/disabled with tooltip "ยังไม่พร้อมใช้งาน"
  - Topbar: branch picker (TL/EK/RAMA9), period indicator, user menu (name + role badge + logout)
  - Active route highlight, collapsible sidebar for ≥1280px+
  - `(authenticated)` route group wraps all post-login routes
- **Depends on:** T-1.7
- **Blocks:** T-1.15, every page in phases 2–8
- **Done when:** Layout renders at any `/(authenticated)/*` route; 9 sidebar groups visible; clicking unimplemented links is a no-op or 404 placeholder

### T-1.9 — Theme toggle (dark/light)
- [ ] **Status:** Not started
- **Model:** Sonnet
- **Files:** `apps/web/src/components/theme-toggle.tsx`, `apps/web/src/lib/theme.ts` (NEW)
- **Reads:** specs/06 §Theme
- **Spec:**
  - `next-themes` provider wrapping app
  - Toggle button in topbar
  - Persists to `localStorage`
  - Default: dark (matches WIND CLINIC brand)
- **Depends on:** T-1.6
- **Blocks:** T-1.8 (topbar embeds toggle)
- **Done when:** Click toggle → instant theme swap, persists across reload

### T-1.10 — Seed: Chart of Accounts
- [ ] **Status:** Not started
- **Model:** DeepSeek
- **Files:** `apps/api/prisma/seed/accounts.ts` (NEW)
- **Reads:** specs/10-seed-data.md §Chart of Accounts
- **Spec:** Static array of all CoA rows from spec 10 — ASSET (1xxxx), LIABILITY (2xxxx), EQUITY (3xxxx), REVENUE (4xxxx), EXPENSE (5xxxx, 6xxxx). Hierarchical with `parent_code`. Header accounts: `is_postable=false`. Postable leaves: `is_postable=true`.
- **Depends on:** T-1.3
- **Blocks:** Every JE post anywhere in phases 2–8
- **Done when:** `bun run db:seed` inserts ~80–120 accounts; tree query shows correct hierarchy; all required postable accounts referenced in spec 02 §4 exist (12010, 21110, 14010, 14020, 21120, 21210, 31030, 31020, etc.)

### T-1.11 — Seed: periods, users, branches, bank accounts, settings
- [ ] **Status:** Not started
- **Model:** DeepSeek
- **Files:** `apps/api/prisma/seed/periods.ts`, `users.ts`, `bank-accounts.ts`, `settings.ts`, `apps/api/prisma/seed.ts` (orchestrator) (NEW)
- **Reads:** specs/10 §Periods, Users, Bank, Settings; specs/04 §1.2 (roles)
- **Spec:**
  - **Periods:** 24 FiscalPeriod rows (current year ± 1), all status=OPEN
  - **Users:** 5 seeded — `admin@wind` (ADMIN), `aow@wind` (ACCOUNTANT), `nim@wind` (ACCOUNTANT), `viewer1@wind` (VIEWER), `viewer2@wind` (VIEWER)
  - **Bank accounts:** 3 — KBank current (11020), KBank ภพ.30 (11020 sub), Cash (11010)
  - **Settings:** account_map JSON per spec 04 §9.2 (service→revenue, payment→bank, card_fee, default_ar/ap)
  - Orchestrator `seed.ts` runs all in correct order (accounts must precede settings that reference accounts)
- **Depends on:** T-1.3, T-1.10
- **Blocks:** T-1.13 (auth needs users), Phase 8 (webhooks need account map)
- **Done when:** `bun run db:seed` is idempotent (uses upsert); login dropdown shows 5 users; account_map JSON returns all required keys

### T-1.12 — JWT cookie middleware (Elysia)
- [ ] **Status:** Not started
- **Model:** Sonnet
- **Files:** `apps/api/src/lib/auth.ts`, `apps/api/src/middleware/auth-guard.ts` (NEW)
- **Reads:** specs/04 §1.1, specs/05 §Authentication
- **Spec:**
  - `signSession({ user_id, role }): string` — JWT signed with `JWT_SECRET`, exp 7d
  - `verifySession(token: string): { user_id, role } | null`
  - Elysia plugin `authGuard` — reads `wind-acc-session` cookie, verifies, attaches `ctx.user`, returns 401 if invalid/missing
  - Role-checking helper `requireRole(roles: Role[])` returns 403
- **Depends on:** T-1.16, T-1.11
- **Blocks:** T-1.13, every authenticated endpoint in phases 2–8
- **Done when:** Unit test: valid token → ctx.user populated; invalid → 401; wrong role → 403

### T-1.13 — Auth API endpoints
- [ ] **Status:** Not started
- **Model:** Sonnet
- **Files:** `apps/api/src/routes/auth.ts` (NEW)
- **Reads:** specs/05 §Auth Endpoints
- **Spec:**
  - `POST /api/v1/auth/login` — body `{ user_id }` (no password), looks up user, signs JWT, sets HTTP-only cookie `wind-acc-session` (Secure in prod, SameSite=Lax), returns `{ user }`
  - `POST /api/v1/auth/logout` — clears cookie, 204
  - `GET /api/v1/auth/me` — returns `{ user }` from `ctx.user`
  - All wrapped in standard response envelope (`success: true, data: ...` per spec 05)
- **Depends on:** T-1.12
- **Blocks:** T-1.14
- **Done when:** `curl -X POST .../auth/login -d '{"user_id":"<seeded-id>"}'` sets cookie; subsequent `/auth/me` returns the user

### T-1.14 — Login page + useUser hook
- [ ] **Status:** Not started
- **Model:** Sonnet
- **Files:** `apps/web/src/app/login/page.tsx`, `apps/web/src/lib/use-user.ts`, `apps/web/src/lib/api-client.ts` (NEW)
- **Reads:** specs/04 §1.1, specs/06 §Login
- **Spec:**
  - `/login` page (outside `(authenticated)` group): fetches user list from API or hardcoded for dev, shows dropdown with role badges, on select POSTs to `/api/v1/auth/login`, redirects to `/dashboard`
  - `useUser()` hook — calls `/api/v1/auth/me`, returns `{ user, loading }`, redirects to `/login` on 401 (when used in authenticated routes)
  - `apiClient` — fetch wrapper that handles cookies, parses envelope, throws typed errors
- **Depends on:** T-1.7, T-1.13
- **Blocks:** T-1.15
- **Done when:** Manual flow: visit `/login` → select user → land on `/dashboard` → `useUser()` returns the user

### T-1.15 — Dashboard placeholder + routing shell
- [ ] **Status:** Not started
- **Model:** DeepSeek
- **Files:** `apps/web/src/app/(authenticated)/dashboard/page.tsx`, `apps/web/src/middleware.ts` (NEW)
- **Reads:** specs/06 §Dashboard, wireframes/01-dashboard.html (skeleton only — full dashboard is a later phase)
- **Spec:**
  - Dashboard page: H1 "WIND Accounting", subtitle "Welcome, {user.name}", 4 placeholder cards (period, AR, AP, cash) showing "—" pending Phase 2+
  - Next.js middleware: redirects unauthenticated requests on `/(authenticated)/*` to `/login`
  - Root `/` redirects to `/dashboard`
- **Depends on:** T-1.8, T-1.14
- **Blocks:** Phase 2 dashboard polish
- **Done when:** Logged-in user lands on dashboard; logged-out user is redirected to `/login`

### T-1.16 — Env config + dev/deploy setup
- [x] **Status:** Done (2026-05-07)
- **Model:** DeepSeek
- **Files:** `.env.example`, `apps/api/.env.example`, `apps/web/.env.example`, `docker-compose.yml`, `README.md` (EDIT) (NEW where listed)
- **Reads:** CLAUDE.md §Tech Stack, specs/11 §Phase 1 task 9
- **Spec:**
  - Required env: `DATABASE_URL`, `JWT_SECRET`, `WEBHOOK_SECRET_WIND_CLINIC`, `WEBHOOK_SECRET_WIND_STOCK`, `BANK_PROVIDER=mock`, `NEXT_PUBLIC_API_URL`
  - Docker Compose: postgres 16 + pgadmin
  - README sections: Local setup (clone, install, db, seed, run), Deploy (Vercel for web, Railway/Supabase for db, separate API host)
- **Depends on:** T-1.1
- **Blocks:** T-1.12
- **Done when:** Fresh clone + `cp .env.example .env` + `docker compose up -d` + `bun run db:migrate && bun run db:seed && bun run dev` brings up the full stack

---

## Acceptance Criteria → Sub-task Mapping

| Spec 11 Acceptance | Sub-task |
|---|---|
| `bun run dev` starts API and web | T-1.1 |
| Prisma migrate succeeds against fresh DB | T-1.3, T-1.4 |
| `bun run db:seed` populates Account, FiscalPeriod, BankAccount, User, default settings | T-1.10, T-1.11 |
| Login page lists 5 seeded users | T-1.14 |
| Authenticated requests succeed; unauthenticated return 401 | T-1.12, T-1.15 |
| Sidebar renders all 9 module groups | T-1.8 |
| Theme toggle works | T-1.9 |
| Color tokens, fonts, base components match spec 06 | T-1.6, T-1.7 |
