# T-13.5 Reports API Test Results

**Tested:** 2026-05-09  
**Tester Model:** Haiku  
**Auth:** `docs/test/auth.txt`

---

## Test Results

### GET /api/v1/reports/trial-balance (json)
- **Status:** 200
- **Expected:** 200 with JSON response containing account data
- **Result:** PASS
- **Error:** N/A
- **Severity:** N/A
- **Notes:** Returns `{success: true, data: {...}}` with account rows including debit_total, credit_total, balance

### GET /api/v1/reports/profit-loss (json)
- **Status:** 200
- **Expected:** 200 with JSON response
- **Result:** PASS
- **Error:** N/A
- **Severity:** N/A
- **Notes:** Uses `period_from` and `period_to` with YYYY-MM format (not `from`/`to` as in task spec). Returns revenue, cogs, expenses, net income structure.

### GET /api/v1/reports/profit-loss (comparative)
- **Status:** 200
- **Expected:** 200 with JSON response including comparative amounts
- **Result:** PASS
- **Error:** N/A
- **Severity:** N/A
- **Notes:** Uses `comparative=true` query param (not separate `compare_from`/`compare_to` as in task spec). Returns comparative_amount fields alongside current amounts.

### GET /api/v1/reports/balance-sheet (json)
- **Status:** 200
- **Expected:** 200 with JSON response
- **Result:** PASS
- **Error:** N/A
- **Severity:** N/A
- **Notes:** Returns assets (current/fixed), liabilities (current/long-term), equity sections

### GET /api/v1/reports/cash-flow (json)
- **Status:** 200
- **Expected:** 200 with JSON response
- **Result:** PASS
- **Error:** N/A
- **Severity:** N/A
- **Notes:** Uses `period_from` and `period_to` with YYYY-MM format (not `from`/`to`). Returns operating, investing, financing sections.

### GET /api/v1/reports/general-ledger (json)
- **Status:** 500
- **Expected:** 200 with JSON response
- **Result:** FAIL
- **Error:** `{"success": false, "error": {"code": "INTERNAL_ERROR", "message": "เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่อีกครั้ง"}}`
- **Severity:** Critical
- **Notes:** Internal server error when calling `/api/v1/reports/general-ledger?account=1000&period_from=2026-01&period_to=2026-05&branch=ALL&format=json`. The endpoint accepts `account` param (not `account_code`), but throws 500. Needs investigation in the general-ledger service/handler.

### GET /api/v1/reports/ar-aging (json)
- **Status:** 200
- **Expected:** 200 with JSON response
- **Result:** PASS
- **Error:** N/A
- **Severity:** N/A
- **Notes:** Returns per-customer aging data with current, 1-30, 31-60, 61-90, 90+ buckets. Includes invoice details.

### GET /api/v1/reports/ap-aging (json)
- **Status:** 200
- **Expected:** 200 with JSON response
- **Result:** PASS
- **Error:** N/A
- **Severity:** N/A
- **Notes:** Returns empty rows array (no outstanding payables in seed data). Structure matches ar-aging format.

### GET /api/v1/reports/vat-summary (json)
- **Status:** 200
- **Expected:** 200 with JSON response
- **Result:** PASS
- **Error:** N/A
- **Severity:** N/A
- **Notes:** Uses `period_from` and `period_to` with YYYY-MM format. Returns per-period output VAT, input VAT, vat_payable, status.

### GET /api/v1/reports/branch-pnl (json)
- **Status:** 200
- **Expected:** 200 with JSON response
- **Result:** PASS
- **Error:** N/A
- **Severity:** N/A
- **Notes:** Uses `period_from` and `period_to` with YYYY-MM format (not `from`/`to`). Returns revenue, expenses with per-branch columns (tl, ek, rama9).

### GET /api/v1/reports/cash-position (json)
- **Status:** 200
- **Expected:** 200 with JSON response
- **Result:** PASS
- **Error:** N/A
- **Severity:** N/A
- **Notes:** Returns bank account cash positions with opening/closing balances, inflows/outflows.

### GET /api/v1/reports/trial-balance (csv format)
- **Status:** 200
- **Expected:** 200 with Content-Type: text/csv
- **Result:** PASS
- **Error:** N/A
- **Severity:** N/A
- **Notes:** Correct Content-Type header: `text/csv; charset=utf-8`

### GET /api/v1/reports/trial-balance (xlsx format)
- **Status:** 200
- **Expected:** 200 with Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
- **Result:** PASS
- **Error:** N/A
- **Severity:** N/A
- **Notes:** Correct Content-Type header for XLSX format

---

## Summary

**Total Endpoints Tested:** 13  
**Passing:** 12  
**Failing:** 1  

### Critical Issues Found:
1. **General-Ledger 500 Error:** The `/api/v1/reports/general-ledger` endpoint returns a 500 Internal Server Error for valid requests. This is a Critical blocking issue that must be fixed.

### Parameter Discrepancies (Task Spec vs Implementation):
- Profit-Loss: Uses `period_from`/`period_to` (YYYY-MM), not `from`/`to` (YYYY-MM-DD)
- Profit-Loss Comparative: Uses `comparative=true` param, not separate `compare_from`/`compare_to` params
- Cash-Flow: Uses `period_from`/`period_to` (YYYY-MM), not `from`/`to` (YYYY-MM-DD)
- General-Ledger: Uses `account` param, not `account_code`; uses `period_from`/`period_to` (YYYY-MM)
- VAT-Summary: Uses `period_from`/`period_to`, not `from`/`to`
- Branch-PnL: Uses `period_from`/`period_to` (YYYY-MM), not `from`/`to` (YYYY-MM-DD)
