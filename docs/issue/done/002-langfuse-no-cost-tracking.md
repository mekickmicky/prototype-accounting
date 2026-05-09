---
id: 02
title: Langfuse ไม่แสดง total cost ต่อ trace — orchestrator log เป็น SPAN/EVENT แทน GENERATION
opened: 2026-05-08
phase: 0
related-tasks: orchestrator-safeguards
severity: medium
status: done
---

## Symptom

เปิด trace ใน Langfuse UI (local, `wind-acc-langfuse` @ port 3030) ไม่เห็นช่อง **Total cost** ในแต่ละงานเลย ทั้งที่ orchestrator มีการสั่ง trace ทำงานอยู่จริง

ตรวจ DB (`wind-acc-langfuse-db`) พบว่า:

```
SELECT type, COUNT(*) FROM observations GROUP BY type;
 type  | count
-------+-------
 EVENT |   701
 SPAN  |    89
(GENERATION = 0 rows)

SELECT name, model, prompt_tokens, completion_tokens FROM observations LIMIT 10;
    name     | type  | model | prompt_tokens | completion_tokens
-------------+-------+-------+---------------+-------------------
 cycle:idle  | EVENT | NULL  |             0 |                 0
 T-5.11      | SPAN  | NULL  |             0 |                 0
 cycle:spawn | EVENT | NULL  |             0 |                 0
 ...
```

Trace ที่มีอยู่เป็น orchestration events (`cycle:idle`, `cycle:spawn`, `T-5.11`) ไม่มี:
- `type = 'GENERATION'` แม้แต่ row เดียว
- `model` ที่ระบุ
- `prompt_tokens` / `completion_tokens` (เป็น 0 ทั้งหมด)

## Expected

Langfuse คำนวณ cost จากสูตร: `generation.usage (tokens) × models.input_price/output_price` โดย match ผ่าน `generation.model` กับ `models.match_pattern`

ดังนั้น**ทุกครั้งที่ orchestrator เรียก LLM** (Claude / DeepSeek / etc.) ควรมี observation `type: GENERATION` ที่มี:
- `model` — ชื่อ model ที่ใช้ (เช่น `claude-opus-4-7`, `claude-sonnet-4-6`, `deepseek-chat`)
- `usage.input` / `usage.output` — token counts จาก response ของ provider
- `unit: TOKENS`

เมื่อ logged ครบ + มี model definition ที่ match — Langfuse UI จะแสดง Total cost อัตโนมัติทั้งระดับ trace, session, และ dashboard

## Root cause

ยืนยันแล้ว — `scripts/orchestrate.ts` log แค่ `trace.span()` lifecycle ของ task (open บน spawn, close บน done) และ `trace.event()` สำหรับ cycle ticks ไม่ได้ log LLM call เลย ตัวที่เรียก LLM จริงคือ `claude` CLI ที่ถูก spawn เป็น child process ใน zellij tab — orchestrator มองไม่เห็น token usage โดยตรง

Worker logs (`/tmp/wind-acc-orchestrator/<id>.log`) เก็บแค่ final assistant text ที่ tee จาก stdout ไม่มี structured usage info

## Fix

Implement แล้ว 2026-05-08 — 3 ส่วน:

**1. Worker wrapper — `scripts/claude-worker.ts` (ใหม่)**

Wrap claude CLI invocation ใน bun process. Append `--output-format stream-json --verbose` ให้ claude แล้ว parse NDJSON stream:
- `assistant` events → เขียน text ไป stdout (tee เก็บ log human-readable เหมือนเดิม)
- `result` event (final) → write sidecar `<id>.meta.json` — เก็บ `model`, `session_id`, `usage` (input/output/cache tokens), `total_cost_usd`, `duration_ms`, `num_turns`

**2. Orchestrator ingestion — `scripts/orchestrate.ts`**
- `metaPathFor(id)` helper ที่ `LOG_DIR/<id>.meta.json`
- `buildLaunchCommand` route call ผ่าน `bun scripts/claude-worker.ts $METAPATH -- $CLAUDE_FLAGS $PROMPT` (env `TASK_ID` ใช้บน meta payload)
- `closeSpanWithCost(taskId, status)` helper — อ่าน meta, สร้าง child `generation` ใต้ task span ด้วย `model + usage { input, output, unit: 'TOKENS' }`, แล้ว end span. ไม่มี meta ก็ closes ปกติ
- เรียก `closeSpanWithCost` ทั้งใน `cmdDone` และใน auto-loop ตรง done/blocked transition detection
- `rotateLogs` ครอบคลุม `.meta.json` ด้วย

**3. Langfuse model definitions — `scripts/langfuse-add-models.sh` (ใหม่, idempotent)**

Insert/update 2 entries ใน `models` table ของ `wind-acc-langfuse-db`:
| Model | Pattern | Input/Output (USD/token) |
|---|---|---|
| `claude-opus-4-7` | `(?i)^claude-opus-4-7(-.*)?$` | 0.000015 / 0.000075 |
| `claude-sonnet-4-6` | `(?i)^claude-sonnet-4-6(-.*)?$` | 0.000003 / 0.000015 |

Pattern กว้าง — จับ bare alias (`claude-opus-4-7`) และ dated API IDs (`claude-opus-4-7-20260101`) ที่ Anthropic อาจ return

ON CONFLICT (id) DO UPDATE — รัน script ใหม่อัปเดตราคาให้ ไม่สร้างซ้ำ

**Verify**

Smoke test ด้วย fake claude binary ที่ emit stream-json ตามจริง — wrapper:
- ✅ stream `hello world` ออก stdout
- ✅ เขียน meta ครบ (model, session, usage tokens including cache, total_cost_usd, duration)

Type check `tsc --noEmit` — error count ใน orchestrate.ts ไม่เพิ่ม (28 → 28, ทั้งหมด pre-existing strict-mode warnings)

**Prerequisite**

Claude CLI ≥ **1.0.88** (รุ่น 1.0.64 ปฏิเสธ `-p` ทั้งหมดด้วยข้อความ "needs an update") — รัน `claude update` ก่อน orchestrate รอบถัดไป

## Notes

- **อย่ายืม entry เก่า** เช่น `claude-3-opus-20240229` (ราคาเท่ากันบังเอิญ) แม้ราคาตรง — ชื่อคนละรุ่น จะปนใน report
- ถ้าใช้ context 1M (prompt > 200K) Anthropic คิด 2x → model definition เดียวจัดการไม่ได้ ต้องสร้าง entry แยก หรือยอม underestimate
- Langfuse v2 (image `langfuse/langfuse:2`) — observations เก็บใน Postgres; v3 ย้ายไป ClickHouse, schema ต่างกัน

## ข้อมูลอ้างอิง

- Langfuse docs — Token & cost tracking: https://langfuse.com/docs/observability/features/token-and-cost-tracking
- Container: `wind-acc-langfuse` (UI :3030), `wind-acc-langfuse-db` (Postgres internal)
- Default Claude model definitions ที่มีในระบบแล้ว (15 entries) — query ด้วย:
  ```bash
  docker exec wind-acc-langfuse-db psql -U langfuse -d langfuse \
    -c "SELECT model_name, match_pattern, input_price, output_price FROM models WHERE model_name ILIKE '%claude%';"
  ```
