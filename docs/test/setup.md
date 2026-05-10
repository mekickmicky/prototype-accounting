# T-13.0 — Environment Setup Report

**Date:** 2026-05-09  
**Task:** T-13.0 — Environment setup, auth, seed verification

---

## Step 1 — Environment Verification

| Check | Result |
|---|---|
| `NEXT_PUBLIC_API_URL` in `.env` | `http://localhost:3001` ✅ |
| API health `GET /health` | `{"status":"healthy","ts":"2026-05-09T11:27:19.247Z"}` ✅ |
| Web server `GET http://localhost:3000` | HTTP 307 (redirect to login) ✅ |

Both servers are running and healthy.

---

## Step 2 — Cookie Name Consistency Check

| Location | Cookie Name | Value |
|---|---|---|
| `apps/api/src/lib/auth.ts` | `COOKIE_NAME` | `wind-acc-session` |
| `apps/api/src/middleware/auth-guard.ts` | Uses `COOKIE_NAME` import | `wind-acc-session` |
| `apps/web/src/proxy.ts` | `SESSION_COOKIE` | `wind-acc-session` |
| `apps/web/src/lib/api-client.ts` | `credentials` | `'include'` ✅ |

**Note:** `apps/web/src/middleware.ts` does not exist. The web app uses `apps/web/src/proxy.ts` instead, which correctly uses `wind-acc-session`.

**Cookie name consistency: PASS** — All layers use `wind-acc-session`. No mismatch.

---

## Step 3 — Seed Verification

**Unauthenticated request to `/api/v1/accounts`:**
```
HTTP 401 ✅ (auth guard is active)
```

**Seed data counts (via authenticated API):**

| Resource | Count | Status |
|---|---|---|
| Accounts | 91 | ✅ Seeded |
| Fiscal Periods | 60 | ✅ Seeded (36+ months) |
| Journal Entries | 7 | ✅ Some test data present |
| Customers | 3 | ✅ Seeded |
| Vendors | 0 | ⚠️ No vendors seeded |
| Bank Accounts | 3 | ✅ Seeded |
| Users | 11 | ✅ Seeded |

**Note:** Vendors table is empty. AP tests (T-13.3) will need to create vendors during testing.

---

## Step 4 — Login and Session Cookie Capture

**Auth mechanism:** The login endpoint uses `user_id` (not email+password). The system is mock cookie-based auth — no passwords stored.

**Users list endpoint:** `GET /api/v1/auth/users` (public — no auth required)

**Admin user used:**
- Email: `admin@wind`
- ID: `cmovqxlom0003qcxjr4mgojjt`
- Role: `ADMIN`

**Login request:**
```bash
curl -s -c /tmp/wind-cookies.txt -X POST http://localhost:3001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"user_id":"cmovqxlom0003qcxjr4mgojjt"}'
```

**Response:** `{"success":true,"data":{"user":{"id":"cmovqxlom0003qcxjr4mgojjt","email":"admin@wind","name":"Admin User","role":"ADMIN"}}}` ✅

**Cookie extracted and written to `docs/test/auth.txt`.**

---

## Step 5 — Verify Authenticated Request Works

```bash
curl -s -H "Cookie: $(cat docs/test/auth.txt)" http://localhost:3001/api/v1/accounts
```

**Result:** HTTP 200 with 91 accounts returned ✅

Cookie is accepted and auth guard passes for ADMIN role.

---

## Summary

| Check | Status |
|---|---|
| API server up | ✅ PASS |
| Web server up | ✅ PASS |
| Cookie name consistent across all layers | ✅ PASS |
| `credentials: 'include'` in api-client | ✅ PASS |
| Unauthenticated request returns 401 | ✅ PASS |
| Login with admin user_id succeeds | ✅ PASS |
| Authenticated request returns 200 | ✅ PASS |
| Core seed data present | ✅ PASS |
| Vendors seed data | ⚠️ Empty — AP tests must create vendors |

**Overall: READY for T-13.1 through T-13.5**

---

## Cookie for Downstream Workers

All T-13.1–T-13.5 workers should use:
```bash
AUTH=$(cat docs/test/auth.txt)
curl -H "Cookie: $AUTH" ...
```

The cookie is a JWT signed with the API secret. It expires in 7 days (set at login time ~2026-05-09).
