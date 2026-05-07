---
id: 001
title: API ตอบ 404 NOT_FOUND แบบ unhandled + Next.js middleware deprecation warning
status: open
severity: medium
created: 2026-05-08
branch: phase-1-foundation
---

# Issue 001 — API 404 unhandled + middleware deprecation

## Symptoms (จากล็อก dev server)

```
[api] wind-accounting-api running on :3001
[web] ⚠ The "middleware" file convention is deprecated. Please use "proxy" instead.
[web]      Learn more: https://nextjs.org/docs/messages/middleware-to-proxy
[web]  GET /login?next=%2Fdashboard 200 in 184ms (next.js: 93ms, application-code: 91ms)
[api] [unhandled] error: NOT_FOUND
[api]  status: 404,
[api]    code: "NOT_FOUND"
```

## ปัญหาที่ 1 — API ยิง 404 NOT_FOUND แบบ unhandled

### สิ่งที่เห็น
- API server (`:3001`) มี request เข้ามาที่ path ที่ไม่มี route รองรับ → Elysia โยน 404
- ป้าย `[unhandled]` แปลว่า [errorHandler middleware](apps/api/src/middleware/) ไม่ได้จับ 404 case นี้
- ล็อกไม่ได้พิมพ์ `path` / `method` ออกมา → ไม่รู้ว่า frontend เรียกอะไร

### Trigger sequence (สมมติฐาน)
1. Browser เข้า `/dashboard`
2. [middleware.ts:13-17](apps/web/src/middleware.ts#L13-L17) redirect → `/login?next=/dashboard`
3. หน้า login render, แต่มี component (root layout / login page) เรียก `useUser()` → fetch `/api/v1/auth/me`
4. Auth guard ปฏิเสธเพราะไม่มี cookie → **น่าจะตอบ 401** แต่ล็อกบอก 404

### จุดที่ต้องสืบ
- ทำไม `/api/v1/auth/me` (มีอยู่ใน [apps/api/src/routes/auth.ts:70](apps/api/src/routes/auth.ts#L70)) ตอบ 404 แทน 401?
  - เช็ค auth guard ใน [apps/api/src/middleware/](apps/api/src/middleware/) — มันทำ `set.status = 404` หรือ throw NOT_FOUND error เมื่อ cookie missing/invalid?
  - หรือ frontend เรียก path ที่ไม่ตรง เช่น `/auth/me` (ลืม `/api/v1`) — เช็ค [apps/web/src/lib/use-user.ts:21](apps/web/src/lib/use-user.ts#L21)
  - หรือ Next.js login page โหลด resource บางอย่าง (favicon? OG image? RSC fetch?) ที่ proxy ไป :3001
- เพิ่ม path/method log ใน error handler เพื่อ debug ครั้งหน้า

### การแก้ที่เสนอ
1. เพิ่มข้อมูล `request.method` + `request.url` ใน error handler log (ลด debug pain ในอนาคต)
2. ทำให้ unauthenticated request ตอบ 401 อย่างชัดเจน (ไม่ใช่ 404)
3. ตอบ 404 ด้วย JSON envelope `{ success: false, error: { code, message } }` ตามมาตรฐานใน [api-client.ts:24](apps/web/src/lib/api-client.ts#L24) — ถ้าตอบ raw 404 จะ parse error ฝั่ง client

## ปัญหาที่ 2 — Next.js middleware deprecation

### สิ่งที่เห็น
- Next.js 15 deprecate `middleware.ts` แล้ว ต้องเปลี่ยนเป็น `proxy.ts`
- [apps/web/src/middleware.ts](apps/web/src/middleware.ts) ที่ T-1.x สร้างไว้ ทำให้ขึ้น warning

### การแก้ที่เสนอ
- Rename `apps/web/src/middleware.ts` → `apps/web/src/proxy.ts`
- ตรวจว่า export function ต้องเปลี่ยนชื่อหรือ signature ไหม (ดู link: https://nextjs.org/docs/messages/middleware-to-proxy)
- ปัจจุบันยังใช้งานได้ — ไม่ blocker แต่ควรแก้ก่อน Next.js 16

## Acceptance criteria

- [ ] เพิ่ม method/path ใน error handler log
- [ ] `/api/v1/auth/me` ตอบ 401 (ไม่ใช่ 404) เมื่อไม่มี session cookie
- [ ] 404 response เป็น JSON envelope ตามมาตรฐาน
- [ ] เปลี่ยน `middleware.ts` → `proxy.ts` (warning หาย)
- [ ] ทำซ้ำการเข้า `/dashboard` แบบไม่มี cookie แล้วล็อกทั้งสองฝั่งสะอาด

## Related files

- [apps/web/src/middleware.ts](apps/web/src/middleware.ts) — Next.js auth gate
- [apps/web/src/lib/use-user.ts](apps/web/src/lib/use-user.ts) — hook ที่ fetch `/auth/me`
- [apps/web/src/lib/api-client.ts](apps/web/src/lib/api-client.ts) — fetch wrapper
- [apps/api/src/routes/auth.ts](apps/api/src/routes/auth.ts) — `/auth/me` route
- [apps/api/src/middleware/](apps/api/src/middleware/) — auth guard + error handler
- [apps/api/src/index.ts](apps/api/src/index.ts) — Elysia bootstrap
