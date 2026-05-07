# 03 — Thai Tax Rules

This spec defines all Thai tax handling: VAT (ภาษีมูลค่าเพิ่ม), Withholding Tax (ภาษีหัก ณ ที่จ่าย), and the related filing forms ภพ.30, ภงด.3, and ภงด.53.

## 1. VAT (Value-Added Tax)

### 1.1 Rates

| Rate | Use Case |
|---|---|
| **7%** | Standard rate for most goods and services |
| **0%** | Exports, certain medical services, certain education |
| **VAT-exempt** | Pure medical services (some treatments may qualify), educational services |

For WIND CLINIC's beauty/aesthetic services, the default is **7%**. Some treatments classified as medical (e.g., a doctor's consultation) may be exempt — this is a per-line decision and the accountant configures the service catalog.

### 1.2 VAT registration threshold

Businesses with annual revenue > 1.8M THB **must** register for VAT. WIND CLINIC is assumed to be VAT-registered for this prototype.

### 1.3 Tax invoice (ใบกำกับภาษี) requirements

A full tax invoice must contain:
- The phrase **"ใบกำกับภาษี"** prominently displayed
- Tax invoice number (separate sequential number, prefix `TAX-`)
- Issue date
- Seller's full name, address, **13-digit tax ID**
- Seller's branch office code (e.g., `00000` for head office, `00001` for branch)
- Buyer's full name, address, tax ID (if any), branch office
- Description of goods/services with quantity and value
- Net amount (excluding VAT)
- VAT amount (separate line)
- Total amount (including VAT)

The prototype generates two PDFs:
- **Regular invoice (ใบแจ้งหนี้)** — default for B2C cash patients
- **Full tax invoice (ใบกำกับภาษี)** — when customer requests, requires tax_id and address

Both can also be combined into "ใบกำกับภาษี/ใบเสร็จรับเงิน" (tax invoice + receipt) when paid immediately at point of sale.

### 1.4 Sale "abridged" tax invoice (ใบกำกับภาษีอย่างย่อ)

For retail sales below 500 THB, an abridged tax invoice is allowed. The clinic likely doesn't need this. Skip in prototype.

### 1.5 Tax invoice amendments and credit notes

- **Cannot edit** a posted tax invoice. Must issue a credit note (ใบลดหนี้) or a debit note (ใบเพิ่มหนี้).
- Credit note flow: same fields as tax invoice, with reference to the original tax invoice number.
- For prototype: implement Credit Note as a special SalesInvoice with negative amounts and `source_ref` pointing to the original.
- Phase 4 feature.

## 2. VAT Posting (Output VAT — Sales)

When a SalesInvoice is posted with VAT > 0:

```
Dr. AR (or Cash on direct sales)            gross_amount
   Cr. Service Revenue (4xxxx)              net_amount
   Cr. VAT Payable (21110)                  vat_amount
```

`VAT Payable (21110)` accumulates output VAT through the period.

A `VatRegister` row is inserted with `vat_type = OUTPUT`:
- `tax_invoice_no`: from the invoice
- `txn_date`: invoice issue date
- `period_code`: derived from issue date
- `counterparty_*`: from customer
- `net_amount`, `vat_amount`, `gross_amount`, `vat_rate`

## 3. VAT Posting (Input VAT — Purchases)

When a Bill is posted with VAT > 0:

```
Dr. Expense (5xxxx / 6xxxx)                  net_amount
Dr. VAT Receivable (14010)                   vat_amount
   Cr. AP                                    gross - withholding
   Cr. WHT Payable                           withholding
```

`VAT Receivable (14010)` accumulates input VAT.

A `VatRegister` row is inserted with `vat_type = INPUT`:
- `tax_invoice_no`: vendor's tax invoice number
- `counterparty_tax_id`: vendor's tax ID
- All other fields as above

**Important:** Input VAT is only claimable if the vendor's tax invoice is valid. Validation rules:
- Vendor must have a tax_id (13 digits)
- Vendor's tax invoice number is required (not blank)
- Date within the same fiscal year (Revenue Department allows up to 6 months back)

If any check fails, system warns the user but still allows posting. The accountant can flag the line as "non-claimable" later.

## 4. ภพ.30 — Monthly VAT Filing

### 4.1 What it is

Monthly VAT return filed with the Revenue Department by the **15th of the following month** (paper) or **23rd** (e-filing).

### 4.2 Calculation

```
Output VAT (sales)               = SUM(vat_register.vat_amount WHERE vat_type=OUTPUT, period=YYYY-MM)
Input VAT (purchases)            = SUM(vat_register.vat_amount WHERE vat_type=INPUT, period=YYYY-MM, claimable=true)
VAT Payable (or refundable)      = Output VAT - Input VAT
```

If `VAT Payable > 0`: pay to RD.
If `VAT Payable < 0`: claim refund OR carry forward to next period (default: carry forward).

### 4.3 Generating ภพ.30

User flow:
1. Navigate to "ภพ.30" → select period (e.g., May 2026)
2. System aggregates VatRegister rows
3. Show preview with totals + breakdown by tax invoice
4. User confirms → status = `FINALIZED`
5. Optional: download PDF (form ภพ.30 layout)
6. After paying RD: user enters payment date and reference → status = `SUBMITTED`, system posts the closing JE (see §4.4)

### 4.4 Closing JE for ภพ.30

```
Dr. VAT Payable (21110)              output_vat
   Cr. VAT Receivable (14010)        input_vat
   Cr. Cash/Bank                     vat_payable      (if positive)
   Dr. VAT Refundable (14020)        |vat_payable|    (if negative — refund situation)
```

This zeroes out both 21110 and 14010 for the period.

### 4.5 ภพ.30 PDF format

The official RD form (ภพ.30) has a specific layout. Generate using `@react-pdf/renderer` or use a stamped PDF template. The prototype can use a simplified printable version with all required fields:

- Company info, tax ID, branch code
- Filing period (month/year, Thai Buddhist Era)
- Section 1: Output VAT (sales) summary
- Section 2: Input VAT (purchases) summary
- Section 3: VAT Payable / Refundable
- Section 4: Carry-forward credit (if any)
- Authorized signatory line

Required attachment: list of tax invoices issued/received in the period (auto-generated from VatRegister).

## 5. Withholding Tax (ภาษีหัก ณ ที่จ่าย)

### 5.1 What it is

When we pay vendors for certain expense categories, we withhold a portion and remit it to RD on their behalf. We give them a withholding certificate (ใบรับรองหัก ณ ที่จ่าย, form 50 ทวิ).

### 5.2 Standard rates

| Expense Type | Rate (Individual) | Rate (Juristic) | Notes |
|---|---|---|---|
| Hire of work / freelance services | 3% | 3% | Most common for clinic vendors (cleaning, IT, etc.) |
| Service fees (general) | 3% | 3% | Same as above |
| Goods purchases | 0% | 0% | No WHT on goods (VAT applies but not WHT) |
| Rent | 5% | 5% | Real estate rent |
| Transportation | 1% | 1% | Logistics |
| Professional fees (lawyer, accountant) | 3% | 3% | |
| Interest | 1% | 1% | Bank loans, etc. |
| Royalties | 3% | 3% | |
| Advertising | 2% | 2% | Marketing agency fees |

Each Vendor record has a default `withholding_rates` JSON. Each BillLine can override.

**Threshold:** WHT applies only to payments **≥ 1,000 THB per transaction** to a single recipient. Below 1,000, no WHT.

For Individual vendors: file with **ภงด.3** (PND3)
For Juristic (company) vendors: file with **ภงด.53** (PND53)

The system distinguishes by vendor type — Vendor table needs a `vendor_type` field (`INDIVIDUAL | JURISTIC`). Add to schema if missing.

### 5.3 Withholding posting

When a Bill is posted (incurring liability):

```
Dr. Expense                             net amount
Dr. VAT Receivable                      vat amount
   Cr. AP                               gross - withholding
   Cr. WHT Payable                      withholding
```

When the Payment is posted (paying the vendor):

```
Dr. AP                                  gross - withholding
   Cr. Cash/Bank                        gross - withholding
```

Note: WHT Payable doesn't move on payment. It moves when we file ภงด.3/53 and remit to RD.

### 5.4 Withholding certificate (50 ทวิ)

Issued to vendor when payment is made. Contains:
- Issuer info (us): name, address, tax ID, branch code
- Recipient info (vendor): name, address, tax ID
- Type of income (corresponds to RD code, e.g., "(2) ค่าธรรมเนียม ค่านายหน้า") 
- Date of payment
- Gross amount, WHT rate, WHT amount
- Cumulative amount for the year
- Issuer's signature

Generate PDF on Payment post. Each WithholdingRecord gets a unique `cert_no` (e.g., `WHT-2026-0001`).

### 5.5 ภงด.3 / ภงด.53

Filed monthly by the 7th of the following month.

- **ภงด.3:** WHT on payments to **individuals** (people, not companies)
- **ภงด.53:** WHT on payments to **juristic persons** (companies, partnerships)

Each is a separate filing.

### 5.6 Generating ภงด.3/53

User flow:
1. Navigate to "ภงด.3" or "ภงด.53" → select period
2. System aggregates WithholdingRecord by vendor type (INDIVIDUAL → PND3, JURISTIC → PND53)
3. Show list: vendor, tax_id, gross, wht_amount, count of certs
4. Confirm → status = FINALIZED
5. After paying: status = SUBMITTED, post closing JE:

```
Dr. WHT Payable (21120)                  withholding_total
   Cr. Cash/Bank                          withholding_total
```

### 5.7 PDF format

The RD provides official ภงด.3 and ภงด.53 forms. Each row in the form represents one WithholdingRecord. The header has summary totals. Generate using `@react-pdf/renderer`.

## 6. Tax Invoice & Receipt Combination Document

In Thailand, when a customer pays at the time of service, you can issue a single document that serves as both tax invoice and receipt (ใบกำกับภาษี/ใบเสร็จรับเงิน). The prototype supports this:

- When a SalesInvoice is created with `payment_method` set (paid immediately), and `request_full_tax_invoice = true`:
  - One PDF document, header reads "ใบกำกับภาษี / ใบเสร็จรับเงิน"
  - Both the invoice number and receipt number on the document
  - Single posting: AR and Cash both touched in same JE (combined)

For separate invoice → later receipt flow:
- Invoice PDF: "ใบกำกับภาษี" only
- When paid: Receipt PDF: "ใบเสร็จรับเงิน" only
- Two separate JEs

## 7. VAT-Inclusive vs VAT-Exclusive

### 7.1 Default behavior

Service prices in WIND CLINIC's catalog are typically **VAT-inclusive** (the displayed price already includes 7%). When creating an invoice line:

- User enters the catalog price (gross including VAT)
- System back-calculates: `net = gross / 1.07`, `vat = gross - net`
- Both are stored on the line

`SalesInvoiceLine` has `vat_inclusive: Boolean` field (default `true`). Add to schema if missing.

### 7.2 For B2B invoices

When invoicing a corporate client, often prices are quoted **VAT-exclusive** (price + VAT). Toggle on the invoice header. All lines on the same invoice should use the same flag.

### 7.3 Math reference

```ts
// VAT inclusive (price includes VAT)
const gross = new Decimal(price);
const net = gross.div(1.07).toDecimalPlaces(2);
const vat = gross.minus(net);

// VAT exclusive (price excludes VAT)
const net = new Decimal(price);
const vat = net.times(0.07).toDecimalPlaces(2);
const gross = net.plus(vat);
```

Note: due to rounding, `net + vat` may differ from `gross` by 0.01 in inclusive math. The displayed `total` is always `subtotal + vat_amount`, which may differ from `SUM(line.gross)` by a few satang. Reconcile by adjusting the largest line's net by the rounding difference. Implement in `lib/tax/calculate-line-amounts.ts`.

## 8. Branch Office in Tax Invoices

Thai Revenue Department requires the branch office code on every tax invoice. WIND CLINIC's main location is `00000` (head office). Each additional branch is registered with RD and gets a code like `00001`, `00002`, etc.

For the prototype, hardcode:
- TL → 00000 (head office)
- EK → 00001
- RAMA9 → 00002

Real config later.

## 9. Year-End Tax Reporting

Beyond monthly filings, year-end requires:
- **ภงด.50** (corporate income tax return) — filed within 150 days of year end
- **ภงด.51** (mid-year corporate tax estimate) — within 2 months of mid-year

These are out of scope for prototype. The prototype's reports (P&L, Balance Sheet) provide the data the accountant uses to prepare these forms externally.

## 10. Compliance & Audit

### 10.1 Required retention

Thai law: keep all tax invoices and receipts for **at least 5 years**. The system never hard-deletes — voids and audit logs preserve everything.

### 10.2 Sequential numbering enforcement

RD requires tax invoice numbers to be sequential without gaps. Voids are allowed but must be auditable. The prototype:
- Numbers never reset within a year
- Voided invoices keep their number (don't reuse)
- Gap report generated on demand: lists all "missing" numbers between MIN and MAX, each labeled VOID/MISSING — there should be no MISSING entries

### 10.3 Branch office on receipt

Receipts also require branch office. Inherit from the issuing branch.

## 11. Implementation Checklist

For Phase 5 (Tax module), implement in this order:

1. ✅ VatRegister auto-insert on every Bill/Invoice post (Phase 3-4 prep)
2. ✅ WithholdingRecord auto-insert on every Payment post (Phase 4 prep)
3. ✅ Tax invoice PDF generator (`lib/pdf/tax-invoice.tsx`)
4. ✅ ภพ.30 aggregation query + preview UI
5. ✅ ภพ.30 finalize → status change + lock all VatRegister rows in the period
6. ✅ ภพ.30 mark-as-submitted → post closing JE
7. ✅ ภพ.30 PDF generator
8. ✅ ภงด.3/53 split logic by vendor_type
9. ✅ ภงด.3/53 PDF generators
10. ✅ Withholding certificate PDF generator (50 ทวิ)
11. ✅ Tax dashboard: this period's running output/input VAT and WHT
