# Phase LINE-QA.C3 — Conversational LINE Replies on the Reactive Pipeline

**Date:** 2026-10-19
**Starting HEAD:** `f43ad31f402ab69872dd4fbd2e95e353dfac35cb` (main after D.1)
**Branch:** `feat/line-qa-c3-conversational-replies`
**Final commit:** `feat(line): keyword next-appointment and role-aware help replies` (the single C3 commit that adds this file)
**Status:** Implemented with unit and PostgreSQL integration evidence. No authorization semantics, Rich Menu catalog/asset, LIFF, MINI App, LINE Console, environment or production data change. One forward-only migration.

## 1. Scope

Text messages in the DEMI OA 1:1 chat now get a reply on the existing reactive pipeline (receipt → `after()` → Reply API), the same path the Phase 17J.2 "ตรวจสอบนัดหมาย" postback uses. Two intents:

| Intent | Trigger | Reply |
| --- | --- | --- |
| `PATIENT_NEXT_APPOINTMENT` | the existing postback, or the exact keywords “นัด”, “นัดหมาย”, “นัดถัดไป” | the existing next-appointment reply, unchanged (`executeLineReactiveAppointment`; date/time + Hospital name only) |
| `HELP` | the exact keywords “เมนู”, “ช่วยเหลือ”, “help”, and any other text | short Thai text + Quick Reply buttons chosen by the binding's current eligible roles |

Out of scope: free-text understanding, health-data replies beyond the existing appointment reply (PDPA decision ก-25), push messages, Rich Menu/catalog changes, LINE Console changes.

## 2. Decisions — WB-DF-18 (default, awaiting customer confirmation)

Recorded in [WB_ALIGNMENT_DECISIONS.md](../requirements/WB_ALIGNMENT_DECISIONS.md) §ก.

1. **Matching.** Exact match after NFKC normalization, whitespace collapse, trim and lower-casing Latin `A–Z` (`src/modules/line/domain/line-conversation-keywords.ts`). No substring, fuzzy or NLU: “ตรวจสอบนัดหมาย”, “นัด หมาย”, “นัดหมายพรุ่งนี้” and “helpme” are unmatched. Full-width “ＨＥＬＰ” matches through NFKC.
2. **No new health data.** HELP contains only fixed navigation; NEXT_APPOINTMENT reuses the existing reply.
3. **HELP text.** Accounts with an eligible PATIENT role: “เลือกเมนูที่ต้องการด้านล่าง หรือพิมพ์ “นัด” เพื่อดูนัดหมายถัดไป”. OSM/Hospital-only accounts: “เลือกเมนูที่ต้องการด้านล่าง” (no “นัด” hint, since that keyword would only return INELIGIBLE for them). Owner choice in this phase.
4. **Quick Reply buttons** (labels match the Rich Menu catalog; URIs only from `buildLineIntentUrl` with fixed intents, no IDs):

   | Eligible role | Buttons |
   | --- | --- |
   | PATIENT | postback “ตรวจสอบนัดหมาย” (`DEMI_LINE_PATIENT_NEXT_APPOINTMENT_V1`), “นัดหมายทั้งหมด” `OPEN_PATIENT_APPOINTMENTS`, “บันทึกสุขภาพ” `OPEN_PATIENT_WELLNESS`, “ยาของฉัน” `OPEN_PATIENT_MEDICATIONS`, “ข้อมูลการดูแล” `OPEN_PATIENT_CARE` |
   | OSM | “ผู้ป่วยที่ดูแล” `OPEN_OSM_ASSIGNED_PATIENTS`, “คัดกรองผู้ป่วย” `START_OSM_SCREENING`, “บันทึกติดตาม” `START_OSM_FOLLOWUP` |
   | HOSPITAL | “งานโรงพยาบาล” `OPEN_WORK_WORKSPACE` |
   | none (unbound, multiple bindings, inactive user, no eligible role) | the existing INELIGIBLE copy “ยังไม่สามารถตรวจสอบนัดหมายผ่าน LINE ได้ กรุณาเปิด “จัดการบัญชี DEMI” จากเมนู” + one button “จัดการบัญชี DEMI” `MANAGE_ACCOUNT` (Account LIFF) |

   Multi-role accounts get the union in canonical order PATIENT, OSM, HOSPITAL (at most 9 items; LINE allows 13).
5. **Throttle.** HELP for unmatched text: one reply per LINE user per 10 minutes, measured from the last reply (not fixed windows). Explicit HELP keywords and NEXT_APPOINTMENT are never throttled. NEXT_APPOINTMENT by keyword has the same eligibility as the postback.
6. **Receipts.** Keyword next-appointment is stored with the existing `PATIENT_NEXT_APPOINTMENT` event type (same intent as the postback); every HELP (keyword or unmatched) uses the new `HELP` value. Owner choice in this phase.

## 3. Design

| Step | Source | Behavior |
| --- | --- | --- |
| Accept | `line-webhook-service.ts` `selectReactiveIntent` | `message` events with `message.type === "text"` from `source.type === "user"` only. Group/room sources, non-text messages and text without a string body are ignored (no receipt). Text is classified and discarded. |
| Validate | `classifyReactiveEvent` (shared with the postback) | Same 17J.2B rules: valid LINE user ID, representable timestamp, `mode` active/standby, boolean `deliveryContext.isRedelivery`. Standby or a missing/blank reply token → receipt only, no reply. |
| Receipt | `persistReactiveReceipt` | One `LineWebhookEventReceipt` row per `webhookEventId` with `eventType` = classified intent, `outcome` ACCEPTED. A matching duplicate (same type and time) is a duplicate; a type or time mismatch is an event-ID conflict and fails closed. |
| Work item | `line-reactive-types.ts` | `LineReactiveWorkItem` is now a discriminated union: `LinePatientNextAppointmentWorkItem` / `LineHelpWorkItem` (`throttled: boolean`). Memory only. |
| Schedule | `line-reactive-scheduler.ts` | Unchanged semantics: `after()`, 45-second local deadline, 4 workers per request, no durable retry. Dispatch by `intent`. |
| NEXT_APPOINTMENT | `executeLineReactiveAppointment` | Unchanged. |
| HELP | `line-reactive-help-service.ts` | Deadline check → (unmatched only) atomic throttle claim → RepeatableRead read of active bindings for the LINE user; exactly one → `resolveEligibleLineRoles` (the same eligibility as the Rich Menu projection: ACTIVE user, ACTIVE membership/relationship in an ACTIVE Hospital, own Patient context) → build reply → deadline check → `replyMessages`. |
| Reply | `LineMessagingClient.replyMessages` | Same request, 12-second timeout and error mapping as `replyText` (which now delegates to it). |
| Throttle store | `LineConversationReplyThrottle` + `line-help-reply-throttle.ts` | `keyHash` = SHA-256 of a purpose string and the LINE user ID; `lastRepliedAt`, `expiresAt`. One conditional `INSERT … ON CONFLICT … DO UPDATE … WHERE expiresAt <= now RETURNING` decides the claim, so one concurrent claim wins across replicas. Expired rows are pruned in batches of 100 (`FOR UPDATE SKIP LOCKED`). RLS enabled, no PUBLIC grant. |

Quick Reply links are navigation only. Every destination re-reads the session and re-authorizes on the server (Phase A / D), so a stale or forwarded HELP message grants nothing.

### Failure behavior

| Case | Result |
| --- | --- |
| Throttle window used | `THROTTLED`, no read, no reply |
| Throttle store unavailable | fail closed: `INFRASTRUCTURE_FAILURE`, no reply (the text was unsolicited) |
| Role read fails | plain text “ขณะนี้ยังแสดงเมนูไม่ได้ กรุณาลองใหม่ภายหลัง”, no buttons |
| A Quick Reply URL cannot be built (e.g. LIFF ID missing) | same plain failure text |
| Deadline passed before the read / before the reply | no reply |
| Reply API 4xx / 5xx / 429 / network | `LINE_PROVIDER_PERMANENT` / `LINE_PROVIDER_TRANSIENT`, no retry |

A throttle claim made just before a deadline or provider failure still counts; that user gets no HELP for unmatched text for 10 minutes (best effort, as in 17J.2A J2-Q10). Explicit keywords still work.

### Duplicates and redelivery

Same-envelope duplicates collapse to one job, and a sibling with a different intent or timestamp is ignored. A redelivery in a new request reuses the receipt (matching duplicate) and, as for the postback since 17J.2B §18, may schedule a fresh attempt with the delivered token. LINE reply tokens are single-use and redelivery carries the original token, so at most one reply becomes visible. A redelivered unmatched text also meets the throttle row its first delivery claimed.

## 4. Privacy and observability

- Message text, quote tokens, message IDs, reply tokens and LINE user IDs are never written to a receipt, the throttle table or a log. Receipts hold only event ID, intent type, occurrence time, accepted time and outcome.
- One aggregate log line per `after()` batch: `console.info("line_reactive_reply_summary", { <intent>: { <outcome>: count } })`. No identifiers or content. New outcomes: `COMPLETED_HELP`, `THROTTLED`. A job that throws is counted as `INFRASTRUCTURE_FAILURE`; a job that expires in the queue is counted as `EXPIRED_BEFORE_QUERY`.
- Integration test `line-webhook-conversation` scans the stored rows (`row_to_json`) and every `console.*` call for the private text, keyword, LINE user ID, reply token and reply copy.

## 5. Required LINE Official Account Manager settings (not changed by this phase)

DEMI does not change LINE Console settings. Before C3 is used, the OA owner sets:

| Setting | Location | Value | Why |
| --- | --- | --- | --- |
| Webhook | LINE Official Account Manager → Settings → Response settings (or LINE Developers → Messaging API → Webhook settings) | **On**, URL `https://<DEMI origin>/api/line/webhook` (already required by 17J.1) | text events must reach DEMI |
| Auto-response messages | Response settings | **Off** | otherwise LINE also answers keywords with its own auto-response, giving two replies |
| Greeting message | Response settings | unchanged (owner choice) | not used by C3 |
| Chat (manual chat) | Response settings | owner choice | if staff also chat manually, both humans and DEMI may answer the same text; standby-mode events (when another channel is active) get a receipt only |

Not verified on the real OA Console in this phase (no Console access was used).

## 6. Tests executed

| Check | Result |
| --- | --- |
| `npx vitest run src/modules/line` | 36 files / 548 tests passed (before the doc step) |
| New unit tests | `line-help-reply.test.ts` (payload per role, allowlisted URIs only, ineligible, failure), `line-reactive-help-service.test.ts` (throttle, ineligible cases, transaction, deadlines, provider errors), `line-webhook-service.test.ts` (+4: exact keywords, non-text/group/room ignored, standby/token-less receipt only, duplicate/intent conflict), `line-reactive-scheduler.test.ts` (+2: dispatch, aggregate summary), `line-messaging-client.test.ts` (+3: `replyMessages` body and error mapping) |
| PostgreSQL integration | `line-webhook-conversation` 5/5 (receipts + no-content scan, 10-minute window, 8 concurrent claims → 1, pruning, real eligibility for active/suspended/unbound); `line-account-linking` 27/27 (reactive receipt test now also checks a HELP/next-appointment type conflict) |
| Migration order | `npm run prisma:migrations:check` OK |
| Final checks | `tsc --noEmit` clean; `npm run lint` 0 errors (2 pre-existing `<img>` warnings in `app/app/hospitals/*`, untouched); `npm run test` 438 files / 4561 tests passed; `npm run build` passed |

## 7. Not verified

- Real LINE app delivery of Quick Reply buttons (iOS/Android), LINE's echo of postback buttons, and Console auto-response behavior.
- `npm run test:db:migrate:line-reactive-populated` (populated-database replay) was not rerun; the migration only adds an enum value and a new empty table.

## 8. Owner / customer questions

- **Q1 — INELIGIBLE wording for HELP.** The reused copy mentions appointments (“ยังไม่สามารถตรวจสอบนัดหมายผ่าน LINE ได้…”) even when the user typed “เมนู”. Kept as specified; confirm under WB-DF-18 or provide neutral copy.
- **Q2 — HELP failure copy** “ขณะนี้ยังแสดงเมนูไม่ได้ กรุณาลองใหม่ภายหลัง” is new and needs confirmation.
- **Q3 — OSM provisioning** (“เพิ่มผู้ป่วย”) is in the OSM Rich Menu but not in HELP, per the specified button list.
- **Q4 — Health-data intents** (medications, measurements) stay out until the PDPA decision ก-25.

## 9. Files changed

- Schema: `prisma/schema.prisma`, `prisma/migrations/20261027100000_line_conversational_help_replies/migration.sql`
- Domain: `src/modules/line/domain/line-reactive-types.ts`, `line-conversation-keywords.ts`
- Services/adapters: `line-webhook-service.ts`, `line-reactive-help-service.ts`, `line-help-reply-throttle.ts`, `adapters/line-messaging-client.ts`, `transport/line-reactive-scheduler.ts`, `presentation/line-help-reply.ts`
- Tests: the unit files above, `tests/integration/line-webhook-conversation.integration.test.ts`, `tests/integration/line-account-linking.integration.test.ts`
- Docs: this file, `docs/requirements/WB_ALIGNMENT_DECISIONS.md` (WB-DF-18), `docs/CONTEXT.md` addendum
