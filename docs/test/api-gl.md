# GL + Periods API Test Report

**Date:** 2026-05-09
**Tester:** T-13.1 (Sonnet)
**Auth:** Cookie from docs/test/auth.txt (valid session, ADMIN role)

**Note:** This report is PARTIAL. Budget was exhausted before all endpoints could be tested. See BLOCKED items at bottom.

---

## GL Accounts

### [GET] /api/v1/accounts
- **Status:** 200
- **Expected:** 200
- **Result:** PASS
- **Error:** N/A
- **Severity:** N/A
- **Notes:** Returns array of accounts with `code`, `name_en`, `name_th`, `type`, `parent_code`, `is_postable`, `is_active`, `current_balance` fields.

### [GET] /api/v1/accounts?type=ASSET
- **Status:** 200
- **Expected:** 200
- **Result:** PASS
- **Error:** N/A
- **Severity:** N/A
- **Notes:** Filter works correctly. Returns only ASSET type accounts.

### [GET] /api/v1/accounts/11000
- **Status:** 200
- **Expected:** 200
- **Result:** PASS
- **Error:** N/A
- **Severity:** N/A
- **Notes:** Returns account detail with `children` array included.

### [POST] /api/v1/accounts (first attempt — wrong parent_code)
- **Status:** 404
- **Expected:** 201
- **Result:** FAIL
- **Error:** `{"code":"NOT_FOUND","context":{"parent_code":"90000"}}` — parent account 90000 does not exist in seed data.
- **Severity:** Low
- **Notes:** This is a test data issue, not a bug. The endpoint correctly rejects a non-existent parent_code.

### [POST] /api/v1/accounts (with valid parent_code=50000)
- **Status:** 201
- **Expected:** 201
- **Result:** PASS
- **Error:** N/A
- **Severity:** N/A
- **Notes:** Created account code 99901 successfully.

### [PATCH] /api/v1/accounts/99901
- **Status:** 200
- **Expected:** 200
- **Result:** PASS
- **Error:** N/A
- **Severity:** N/A
- **Notes:** Successfully updated `name_en` field.

### [DELETE] /api/v1/accounts/99901
- **Status:** 500
- **Expected:** 200 or 204 (soft delete)
- **Result:** FAIL
- **Error:** `{"code":"INTERNAL_ERROR","message":"เกิดข้อผิดพลาดในระบบ"}` — 500 server error on DELETE
- **Severity:** Critical
- **Notes:** The route file (`apps/api/src/routes/accounts.ts`) does NOT define a DELETE handler. Elysia returns 500 for unhandled methods. Either the route is missing or Elysia is routing to an unexpected handler. The spec lists DELETE as an endpoint to test ("if endpoint exists") — this endpoint does NOT exist in the accounts router.

---

## Journal Entries

### [GET] /api/v1/journal-entries
- **Status:** 200
- **Expected:** 200
- **Result:** PASS
- **Error:** N/A
- **Severity:** N/A
- **Notes:** Returns paginated list with `id`, `je_no`, `entry_date`, `period_code`, `branch_code`, `description`, `source_type`, `source_id`, `status`, `pos...` (truncated). Has `meta` with `total`, `page`, `page_size`.

### [GET] /api/v1/journal-entries?status=POSTED
- **Status:** 200
- **Expected:** 200
- **Result:** PASS
- **Error:** N/A
- **Severity:** N/A
- **Notes:** Filter works correctly.

### [POST] /api/v1/journal-entries (first attempt — missing source_type)
- **Status:** 400
- **Expected:** 201
- **Result:** FAIL
- **Error:** `{"code":"VALIDATION_ERROR","context":{"issues":[{"path":["source_type"],"message":"Required"}]}}` — `source_type` is required by the Zod schema but NOT documented in the spec's example body.
- **Severity:** Medium
- **Notes:** The CreateJEBody schema requires `source_type`. This is a spec/contract discrepancy — the spec examples should document `source_type` as required.

### [POST] /api/v1/journal-entries (second attempt — non-postable account)
- **Status:** 422
- **Expected:** 201
- **Result:** FAIL (test data issue)
- **Error:** `{"code":"ACCOUNT_NOT_POSTABLE","context":{"account_code":"30000"}}` — account 30000 is a header account, not postable.
- **Severity:** Low
- **Notes:** Correct business rule enforcement. Test used wrong account code. Test was aborted at this point due to budget constraint.

### [POST] /api/v1/journal-entries (BUDGET EXHAUSTED — NOT TESTED)
- **Status:** NOT TESTED
- **Expected:** 201
- **Result:** NOT TESTED
- **Error:** Budget exhausted before completing this test with correct postable accounts (11010/equity).
- **Severity:** N/A

### [POST] /api/v1/journal-entries/:id/post
- **Status:** NOT TESTED
- **Expected:** 200
- **Result:** NOT TESTED
- **Error:** Depends on draft JE creation which was not completed.
- **Severity:** N/A

### [POST] /api/v1/journal-entries/:id/void
- **Status:** NOT TESTED
- **Expected:** 200
- **Result:** NOT TESTED
- **Error:** Depends on posted JE.
- **Severity:** N/A

---

## Periods

### [GET] /api/v1/periods
- **Status:** NOT TESTED
- **Expected:** 200
- **Result:** NOT TESTED
- **Error:** Budget exhausted.
- **Severity:** N/A

### [POST] /api/v1/periods/:code/close
- **Status:** NOT TESTED
- **Expected:** 200
- **Result:** NOT TESTED
- **Error:** Budget exhausted.
- **Severity:** N/A

### [POST] /api/v1/periods/:code/reopen
- **Status:** NOT TESTED
- **Expected:** 200
- **Result:** NOT TESTED
- **Error:** Budget exhausted.
- **Severity:** N/A

---

## Summary

| Endpoint | Result | Severity |
|---|---|---|
| GET /api/v1/accounts | PASS | N/A |
| GET /api/v1/accounts?type=ASSET | PASS | N/A |
| GET /api/v1/accounts/11000 | PASS | N/A |
| POST /api/v1/accounts | PASS | N/A |
| PATCH /api/v1/accounts/99901 | PASS | N/A |
| DELETE /api/v1/accounts/99901 | FAIL | Critical |
| GET /api/v1/journal-entries | PASS | N/A |
| GET /api/v1/journal-entries?status=POSTED | PASS | N/A |
| POST /api/v1/journal-entries | FAIL | Medium |
| POST /api/v1/journal-entries/:id/post | NOT TESTED | — |
| POST /api/v1/journal-entries/:id/void | NOT TESTED | — |
| GET /api/v1/periods | NOT TESTED | — |
| POST /api/v1/periods/:code/close | NOT TESTED | — |
| POST /api/v1/periods/:code/reopen | NOT TESTED | — |

### Key Findings

1. **CRITICAL: DELETE /api/v1/accounts returns 500** — The accounts router has no DELETE handler. The endpoint returns 500 (not 404/405). Root cause: missing route in `apps/api/src/routes/accounts.ts`. Fix: add soft-delete handler or return 405 Method Not Allowed.

2. **MEDIUM: POST /api/v1/journal-entries requires `source_type`** — The field is required by Zod schema but not shown in spec examples. Worker used body without `source_type` and received 400. This is a spec/contract gap; the API behavior is correct, but the spec example is misleading. Fix: add `source_type: "MANUAL"` to spec examples.

3. **NOT TESTED: JE post, void, and all Period endpoints** — Budget exhausted at $0.30 cap before completing these tests. A follow-up run is needed.
