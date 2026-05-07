# 06 — UI Design System

This spec defines the visual language. Match WIND CLINIC's existing brand (the clinic management mockups already produced). Goal: dense, professional, accountant-friendly. Not flashy.

## Design Principles

1. **Density over whitespace** — accountants work with lots of data on screen. Compact rows, small fonts (12-13px body), tight padding.
2. **Numbers are first-class citizens** — right-aligned, tabular figures, monospace digits, color-coded debit/credit.
3. **Thai-first, but bilingual** — Thai is default; English label appears in muted color where useful (e.g., "ใบกำกับภาษี / Tax Invoice").
4. **Dark mode default** — like the existing WIND CLINIC mockups. Light mode toggle in topbar.
5. **No decorative graphics** — this is a tool, not a marketing site. Iconography only, sparse.
6. **Reduced motion** — accountants don't want sliding animations. Instant transitions, fade for modals only.

## Color Tokens

Mirror the WIND CLINIC brand. Add accounting-specific semantic tokens.

```css
:root {
  /* Brand */
  --rose:        #c8967a;
  --rose-light:  #dbb09a;
  --rose-dim:    #a07560;
  --blush:       #e8d5c8;
  
  /* Semantic — accounting */
  --debit:       #c8967a;     /* Use rose for debit (warm) */
  --credit:      #6b8e7f;     /* Sage green for credit (cool) */
  --balance-pos: #6b8e7f;     /* Positive balance = sage */
  --balance-neg: #b85c50;     /* Negative balance = muted red */
  
  /* Status */
  --status-draft:    #8b7d6f;  /* Muted brown */
  --status-posted:   #6b8e7f;  /* Sage */
  --status-paid:     #4a7a8c;  /* Steel blue */
  --status-void:     #6b6068;  /* Gray */
  --status-overdue:  #b85c50;  /* Muted red */
  
  /* Typography */
  --font-display:  'Cormorant Garamond', serif;
  --font-body:     'Sarabun', system-ui, sans-serif;
  --font-mono:     'IBM Plex Mono', 'JetBrains Mono', monospace;
  
  --transition: .15s ease;
}

[data-theme="dark"] {
  --bg:        #1e1c1f;
  --bg2:       #252328;
  --bg3:       #2d2a31;
  --bg-hover:  #322f36;
  --border:    rgba(255,255,255,.07);
  --border2:   rgba(255,255,255,.12);
  --text:      #ede8e3;
  --text2:     #9e9898;
  --text3:     #5c5860;
  --shadow:    0 4px 24px rgba(0,0,0,.4);
  --modal-bg:  rgba(0,0,0,.65);
}

[data-theme="light"] {
  --bg:        #f5f0ec;
  --bg2:       #ffffff;
  --bg3:       #ede8e3;
  --bg-hover:  #e0d8d0;
  --border:    rgba(0,0,0,.08);
  --border2:   rgba(0,0,0,.15);
  --text:      #1e1c1f;
  --text2:     #6b6068;
  --text3:     #a8a0a0;
  --shadow:    0 4px 24px rgba(0,0,0,.12);
  --modal-bg:  rgba(0,0,0,.45);
}
```

## Typography Scale

```css
/* Display (page titles, hero numbers) */
.t-display     { font-family: var(--font-display); font-size: 28px; font-weight: 400; letter-spacing: -.02em; }
.t-display-lg  { font-family: var(--font-display); font-size: 40px; font-weight: 400; letter-spacing: -.02em; }

/* Body */
.t-body-lg     { font-size: 14px; line-height: 1.5; }
.t-body        { font-size: 13px; line-height: 1.5; }
.t-body-sm     { font-size: 12px; line-height: 1.4; }
.t-caption     { font-size: 11px; line-height: 1.3; color: var(--text2); }
.t-label       { font-size: 11px; font-weight: 500; text-transform: uppercase; letter-spacing: .08em; color: var(--text2); }

/* Numeric */
.t-num         { font-family: var(--font-mono); font-variant-numeric: tabular-nums; text-align: right; }
.t-num-lg      { font-family: var(--font-mono); font-variant-numeric: tabular-nums; font-size: 16px; text-align: right; }
.t-num-display { font-family: var(--font-mono); font-variant-numeric: tabular-nums; font-size: 24px; text-align: right; letter-spacing: -.01em; }
```

Body default: 13px Sarabun. Numbers: IBM Plex Mono with tabular figures.

## Spacing Scale

```css
:root {
  --s-1: 4px;
  --s-2: 8px;
  --s-3: 12px;
  --s-4: 16px;
  --s-5: 24px;
  --s-6: 32px;
  --s-7: 48px;
  --s-8: 64px;
}
```

Density rules:
- Form fields: 8-12px vertical padding
- Table cells: 6-8px vertical, 10-12px horizontal
- Section gap: 16-24px
- Page padding: 24px

## Layout

### Shell

```
┌──────────────────────────────────────────────────────┐
│ Topbar  [logo] [breadcrumb]   [period] [user] [theme]│  56px
├────────┬─────────────────────────────────────────────┤
│        │                                             │
│  Side  │  Page content                               │
│  bar   │                                             │
│ 240px  │                                             │
│        │                                             │
└────────┴─────────────────────────────────────────────┘
```

Sidebar collapsible to 56px (icons only). Topbar fixed, 56px height.

### Sidebar groups

```
DASHBOARD
  Overview

GENERAL LEDGER
  Chart of Accounts
  Journal Entries
  Periods

ACCOUNTS RECEIVABLE
  Customers
  Sales Invoices
  Receipts
  AR Aging

ACCOUNTS PAYABLE
  Vendors
  Bills
  Payments
  AP Aging

TAX
  VAT Register
  ภพ.30
  ภงด.3 / 53
  Withholding Certs

BANK
  Accounts
  Reconciliation
  Import

REPORTS
  Trial Balance
  P&L
  Balance Sheet
  Cash Flow
  General Ledger
  Branch P&L

SETTINGS
  Company
  Account Map
  Users
  Audit Log
```

Group labels in `--text3` color, smaller. Items hover → `--bg-hover`. Active item has `--rose` left-border (3px).

## Tables

The dominant component. Optimize for accountants.

```css
.acc-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.acc-table th {
  background: var(--bg2);
  border-bottom: 1px solid var(--border);
  padding: 8px 12px;
  text-align: left;
  font-weight: 500;
  color: var(--text2);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: .04em;
  position: sticky;
  top: 0;
}
.acc-table td {
  padding: 6px 12px;
  border-bottom: 1px solid var(--border);
}
.acc-table tr:hover td {
  background: var(--bg-hover);
}
.acc-table .num {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  text-align: right;
}
.acc-table .num.dr { color: var(--debit); }
.acc-table .num.cr { color: var(--credit); }
.acc-table .num.zero { color: var(--text3); }

/* Subtotal / total rows */
.acc-table tr.subtotal td {
  background: var(--bg2);
  font-weight: 500;
  border-top: 1px solid var(--border2);
}
.acc-table tr.total td {
  background: var(--bg3);
  font-weight: 600;
  border-top: 2px solid var(--rose);
  border-bottom: 2px solid var(--rose);
}
```

## Buttons

```css
.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  font-size: 12px;
  font-weight: 500;
  border-radius: 4px;
  border: 1px solid transparent;
  cursor: pointer;
  transition: var(--transition);
  white-space: nowrap;
}

/* Primary (rose) */
.btn-primary {
  background: var(--rose);
  color: #fff;
}
.btn-primary:hover {
  background: var(--rose-dim);
}

/* Secondary (outline) */
.btn-secondary {
  background: transparent;
  color: var(--text);
  border-color: var(--border2);
}
.btn-secondary:hover {
  background: var(--bg-hover);
}

/* Ghost */
.btn-ghost {
  background: transparent;
  color: var(--text2);
  border-color: transparent;
}
.btn-ghost:hover {
  color: var(--text);
  background: var(--bg-hover);
}

/* Destructive */
.btn-danger {
  background: var(--balance-neg);
  color: #fff;
}

/* Sizes */
.btn-sm { padding: 4px 10px; font-size: 11px; }
.btn-lg { padding: 8px 18px; font-size: 13px; }
```

## Form Controls

```css
.input,
.select,
.textarea {
  width: 100%;
  padding: 8px 12px;
  font-size: 13px;
  border-radius: 4px;
  border: 1px solid var(--border2);
  background: var(--bg2);
  color: var(--text);
  font-family: inherit;
  transition: var(--transition);
}
.input:focus {
  outline: none;
  border-color: var(--rose);
  box-shadow: 0 0 0 3px rgba(200, 150, 122, 0.15);
}
.input.num {
  text-align: right;
  font-family: var(--font-mono);
}

.label {
  font-size: 11px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: .04em;
  color: var(--text2);
  margin-bottom: 4px;
  display: block;
}
```

## Status Badges

```css
.badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: .05em;
  border-radius: 3px;
  border: 1px solid;
}
.badge-draft    { color: var(--status-draft);   border-color: var(--status-draft);   background: rgba(139, 125, 111, .1); }
.badge-posted   { color: var(--status-posted);  border-color: var(--status-posted);  background: rgba(107, 142, 127, .1); }
.badge-paid     { color: var(--status-paid);    border-color: var(--status-paid);    background: rgba(74, 122, 140, .1); }
.badge-overdue  { color: var(--status-overdue); border-color: var(--status-overdue); background: rgba(184, 92, 80, .1); }
.badge-void     { color: var(--status-void);    border-color: var(--status-void);    background: rgba(107, 96, 104, .1); }
```

## Modals

```css
.modal-overlay {
  position: fixed;
  inset: 0;
  background: var(--modal-bg);
  display: none;
  align-items: center;
  justify-content: center;
  z-index: 100;
}
.modal-overlay.show { display: flex; }
.modal {
  background: var(--bg);
  border: 1px solid var(--border2);
  border-radius: 6px;
  box-shadow: var(--shadow);
  width: 600px;
  max-width: 95vw;
  max-height: 90vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.modal-header { padding: 16px 24px; border-bottom: 1px solid var(--border); }
.modal-body   { padding: 16px 24px; overflow-y: auto; }
.modal-footer { padding: 12px 24px; border-top: 1px solid var(--border); display: flex; justify-content: flex-end; gap: 8px; }
```

## Number Formatting

Always use `Intl.NumberFormat('th-TH')` with grouping. Convention:

```ts
function formatMoney(value: Decimal | string, opts?: { showZero?: boolean, dim?: boolean }): string {
  const d = new Decimal(value);
  if (d.eq(0) && !opts?.showZero) return '—';
  return d.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
```

- Display: `1,234,567.89`
- Zero: show as `—` (em-dash) by default to reduce visual noise
- Negative: parens (accounting style) — `(1,234.56)` — colored `--balance-neg`
- Currency symbol: usually omitted in tables (column header says "THB"). Show in headlines as `฿1,234.56`.

## Date Formatting

- Tables: `dd/MM/yy` (e.g., `07/05/26`) — compact
- Headers/details: `7 พฤษภาคม 2569` (Buddhist Era, full month)
- API/system: ISO 8601 `2026-05-07`

```ts
function fmtDateTH(d: Date | string, opts?: { long?: boolean }): string {
  const date = new Date(d);
  if (opts?.long) {
    return date.toLocaleDateString('th-TH-u-ca-buddhist', {
      day: 'numeric', month: 'long', year: 'numeric'
    });
  }
  // 07/05/69
  return date.toLocaleDateString('th-TH-u-ca-buddhist', {
    day: '2-digit', month: '2-digit', year: '2-digit'
  });
}
```

## Page Layouts

### List page pattern

```
┌─────────────────────────────────────────────────────┐
│ Page Title                       [Action button]    │  PageHeader
│ Breadcrumb · description                            │
├─────────────────────────────────────────────────────┤
│ [Filter] [Filter] [Filter]    [Search] [Export]    │  FilterBar
├─────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────┐ │
│ │  Table                                          │ │
│ │                                                 │ │
│ │                                                 │ │
│ └─────────────────────────────────────────────────┘ │
│                                                     │
│  Pagination · 1-20 of 124                          │
└─────────────────────────────────────────────────────┘
```

### Detail page pattern

```
┌─────────────────────────────────────────────────────┐
│ Doc # / status                  [actions: post,...] │
├─────────────────────────────────────────────────────┤
│ Header info (3-column grid)                         │
├─────────────────────────────────────────────────────┤
│ Lines table (full width)                            │
├─────────────────────────────────────────────────────┤
│ Totals (right-aligned, 30% width)                   │
├─────────────────────────────────────────────────────┤
│ Related: JE preview, applied receipts, audit log    │
└─────────────────────────────────────────────────────┘
```

### Form page pattern

Same as detail but inputs instead of read-only. "Save Draft" + "Post" + "Cancel" sticky at bottom.

## Iconography

Use **Lucide** icons. Stroke 1.5px, size 14-16px. No filled icons.

Common:
- File: invoice/bill/document
- Receipt: receipts
- Check: posted/paid
- X: void
- Edit: edit draft
- Eye: view
- Plus: add new
- Filter, Search, Download
- ChevronDown for dropdowns
- AlertCircle for warnings

## Responsive

Desktop-first. Min supported width: 1280px. Below 1024px, switch sidebar to drawer.

The accountant uses this on a desktop or large laptop. No mobile optimization needed for prototype.

## Accessibility Minimums

- All buttons keyboard accessible
- Focus visible with `--rose` outline
- Form labels associated with inputs
- Color-coded info also has text/icon (don't rely on color alone)
- Modal traps focus
- Esc closes modal

## What Not to Do

- ❌ No purple gradients on white
- ❌ No huge whitespace ("breathing room")
- ❌ No big call-to-action cards on every page
- ❌ No animated illustrations
- ❌ No giant dashboard tiles with single numbers (use tables)
- ❌ No emoji icons (keep professional)
- ❌ No skeuomorphic styling
