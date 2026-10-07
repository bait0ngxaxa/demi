# Phase 17J.2 — Deterministic Reactive Messaging Implementation

- **Phase 17J.2A — CLOSED / OWNER DECISION COMPLETE**
- **Phase 17J.2B — TECHNICAL CONTRACT COMPLETE / REVIEWED**
- **Phase 17J.2 runtime — IMPLEMENTED / AUTOMATED VERIFICATION COMPLETE**
- Reviewed source baseline: `0ce4fb462817405bb6853a97a18b9d7379a8d3c8`
- Implementation date: **2026-10-07**
- Technical authority: [Phase 17J.2B technical contract](./PHASE_17J2B_DETERMINISTIC_REACTIVE_MESSAGING_TECHNICAL_CONTRACT.md)
- Product/privacy decisions: [Phase 17J.2A decision closeout](./PHASE_17J2A_REACTIVE_MESSAGING_DECISION_CLOSEOUT.md)

## Delivered runtime

The implementation adds exactly one reactive business command: `PATIENT_NEXT_APPOINTMENT`, selected only by the exact deterministic postback marker `DEMI_LINE_PATIENT_NEXT_APPOINTMENT_V1` from the Patient Rich Menu action labeled `ตรวจสอบนัดหมาย`. It adds no typed command, alias, parser, conversation state, generic command bus, or additional reactive intent.

The signed webhook path retains raw-body signature and destination validation. Eligible active 1:1 events durably create a `LineWebhookEventReceipt` with `eventType = PATIENT_NEXT_APPOINTMENT` and `outcome = ACCEPTED`, register transient `after()` work, and return sanitized counters without waiting for the Patient query or LINE Reply. Standby and missing/blank-token events receive a durable receipt but no job. Group/room markers and unsupported inputs are ignored without Patient lookup or reply. Existing follow, unfollow, and workspace-switch processing remains on its existing path.

The receipt is transport deduplication state, not a clinical audit or delivery record. `ACCEPTED` means only that a supported event identity was durably accepted. It does not mean the binding or Patient was eligible, an appointment was found, a Reply was attempted or accepted, or the user visibly received a message. The existing five receipt fields remain unchanged; no LINE subject, reply token, appointment data, provider response, or delivery outcome is stored.

On a matching duplicate in a new request, the newly received transient token may create fresh work and the callback re-resolves current state. A same-envelope duplicate is counted once and cannot replace the first eligible occurrence. Conflicting existing event type/time is not overwritten and creates no job. No previous token or reply result is loaded or replayed.

Each callback checks a DEMI-local monotonic deadline before opening a single Prisma `RepeatableRead` transaction (`maxWait: 2s`, `timeout: 5s`). In that snapshot it requires exactly one current ACTIVE binding for the signed LINE user locator, resolves the canonical actor through the auth-owned User-ID resolver, and verifies current persisted PATIENT SELF identity, ACTIVE User status, PATIENT role, PatientProfile, and an own Patient-Hospital relationship. It captures one server `asOf`, then performs exactly one narrow appointment query for canonical `SCHEDULED` rows with `scheduledAt >= asOf`, ordered by `scheduledAt ASC, id ASC`, `take: 1`, across the patient's own relationships. No Hospital ACTIVE filter, Family window, OSM condition, acknowledgement state, or cancellation-request state is added. The projection contains only `scheduledAt` and `hospital.name`.

The local execution-age limit is fixed at **45 seconds** from DEMI's monotonic processing start, below LINE's documented normal one-minute reply-token window and with a 12-second provider request timeout ([LINE Reply API/token timing](https://developers.line.biz/en/reference/messaging-api/nojs/#send-reply-message)). It is checked before the database transaction and immediately before Reply. It is not provider-token authority and does not use `eventOccurredAt` or a 20-minute redelivery calculation. The Reply API remains the final token-validity authority.

After the transaction closes, the service formats the approved Thai Buddhist-calendar date/time in `Asia/Bangkok` and a normalized single-line Hospital name. The only success data disclosed are those two fields. Empty, ineligible, and infrastructure results use the exact accepted Thai copies. The Messaging API adapter makes one text-only `POST /v2/bot/message/reply` attempt with the received token, maps non-2xx/network/timeout failures to safe categories, and has no retry, Push fallback, or second error reply.

The dedicated `after()` scheduler awaits its callback work, runs at most four workers per webhook request, pulls jobs in envelope order, isolates job failures, and skips locally expired jobs. It has no queue, repair state, startup recovery, cron, global limiter, or new event-count cap. A synchronous scheduler registration failure after durable acceptance does not change the HTTP 200 acknowledgement.

The appointment postback is present only in `PATIENT_DIRECT`, `PATIENT_PATIENT_OSM`, `PATIENT_PATIENT_HOSPITAL`, and `PATIENT_PATIENT_OSM_HOSPITAL`. The existing workspace action remains beside it, with account management and role switches retained in the bottom row. The 18-menu catalog remains intact. Only the four affected Patient presentation PNGs were regenerated through `scripts/generate-line-rich-menu-assets.ps1`; no other menu asset changed. No provider menu was provisioned.

## Schema migration

Created exactly one additive migration: `20261007120000_line_reactive_patient_appointment_receipt`.

It adds only `PATIENT_NEXT_APPOINTMENT` to `LineWebhookEventType` and `ACCEPTED` to `LineWebhookEventOutcome`. No table, column, index, or historical migration changed. The new `test:db:migrate:line-reactive-populated` integration command applies the complete prior migration history, seeds an existing receipt, applies this migration, and verifies receipt preservation, all prior enum labels, both new enum values, the unchanged five-column receipt shape, and the unique `webhookEventId` constraint.

## Verification

Focused unit tests passed: **9 files, 92 tests** across webhook classification/receipt handling, route scheduling, ActorContext resolution, Patient SELF query, orchestration/timing, formatter, Messaging API adapter, Rich Menu catalog, and scheduler.

Real PostgreSQL checks passed against the repository's disposable local `demi_test` database:

- `npm run test:db:migrate:line-reactive-populated` — full fresh migration history plus populated upgrade passed; existing receipt and old enums survived, the new receipt enum pair worked, and schema/uniqueness invariants held.
- `npm run test:integration:focused -- tests/integration/appointments.integration.test.ts` — **6 tests passed**, including the live current binding → canonical actor → persisted Patient SELF → next-appointment query → post-transaction reply path.
- `npm run test:integration:focused -- tests/integration/line-account-linking.integration.test.ts` — **26 tests passed**, including matching duplicate and conflicting receipt behavior against PostgreSQL.
- `npm run test:db:up` and `npm run test:db:down` — disposable integration database lifecycle completed; the container was removed after verification.

`npm run typecheck` and `npm run lint` passed. `node --check scripts/integration.mjs`, the Impeccable layout detector, and `git diff --check` passed. The layout detector returned no findings. No production build was run because the change did not alter Next.js configuration or require build-only validation; the Route Handler and `after()` behavior were checked with the installed Next.js documentation and focused route/scheduler tests.

The one full unit-suite run reported **2,267 passed and 2 timeouts** in `src/modules/patient-provisioning/adapters/canonical-patient-import-adapter.test.ts` while Vitest ran files in parallel. The isolated file rerun passed **16/16**. These workbook timeouts are unrelated to changed files and were classified as resource-sensitive; no test timeout or static-analysis rule was weakened, and the full suite was not rerun.

## Privacy, security, and remaining gates

The postback marker conveys intent only. The LINE subject locates the current ACTIVE binding; current DEMI User/ActorContext and persisted PATIENT SELF authorization decide access. Presentation role grants no authority. Group/room events never enter Patient disclosure. No National ID/HN chat lookup, resource ID in the postback, whole appointment DTO, clinical content, raw LINE subject, reply token, or provider body is logged or persisted. No ordinary clinical-read audit event or Reply-attempt persistence was added.

The reviewed residual TOCTOU race remains: a binding, authorization, appointment, or Hospital change may commit after the coherent transaction closes and before or during the external Reply. The callback reads current state as late as practical, closes the transaction before provider I/O, sends without delay, and has no persistent sensitive payload or retry.

Exact webhook receipt retention/purge remains unresolved production-readiness work. External LINE provider/channel provisioning, real LINE Reply UAT, device/mobile UAT, and production deployment were **not executed**. Proactive reminders and P17D-NOTIF-01 remain unchanged. Phase 17J.3 was not started.

**Next step: Review Phase 17J.2 runtime implementation and automated verification.**
