# Phase LINE-QA.E1 — Notification Scheduler Tick, Worker Secret Split, Medication Reminder Kill Switch

**Date:** 2026-10-19
**Starting HEAD:** `a8189bd7f18d3bc79b39dafc0319b03b0ead3837` (main after C3)
**Branch:** `feat/line-qa-e1-notification-operations`
**Final commit:** `feat(ops): notification scheduler tick, worker secret split, medication reminder kill switch` (the single E1 commit that adds this file)
**Status:** Implemented with unit and PostgreSQL integration evidence. Two forward-only migrations. No scheduler is wired, and no LINE Console, Vercel, Supabase or environment change was made (plan-dependent wiring is E2).

## 1. Scope

| # | Item | Result |
| --- | --- | --- |
| 1 | Scheduler tick | `GET /api/internal/scheduler/tick` runs both drains and both terminal purges in-process |
| 2 | Secrets | Medication HMAC route reads `DEMI_LINE_MEDICATION_REMINDERS_WORKER_SECRET`; transition fallback to the shared secret |
| 3 | Kill switch | `DEMI_LINE_MEDICATION_REMINDERS_DISABLED` |
| 4 | Observability | Aggregate tick/drain log lines; `GET /api/internal/scheduler/readiness` |
| 5 | C3 follow-up | Workforce-only binding + next-appointment keyword → role-aware HELP |
| 6 | Cron examples | §7 (commented; no `vercel.json`) |
| 7 | DB hardening | Every `public` function pins `search_path` (Supabase advisor `function_search_path_mutable`) |

The HMAC drain routes (`POST /api/internal/line/{appointment-notifications,medication-reminders}/drain`) keep their contract.

## 2. Scheduler tick

The following table records the original E1 implementation. Current outcomes, bounds, cadence and readiness are in §15, which supersedes the older implementation snapshots in §§2, 5 and 14.

Source: `src/modules/notification-scheduler/services/notification-scheduler-{auth,tick-service,readiness-service}.ts`, `app/api/internal/scheduler/{tick,readiness}/route.ts`.

| Aspect | Behavior |
| --- | --- |
| Route | `GET`, `runtime = "nodejs"`, `dynamic = "force-dynamic"`, `maxDuration = 300`, every response `cache-control: no-store` |
| Auth | The whole `Authorization` header must equal `Bearer <secret>`, compared with `timingSafeEqual` over SHA-256 digests (no length leak). Secret = `DEMI_SCHEDULER_SECRET`; only when that is unset/blank, `CRON_SECRET`. 32–1024 characters. A set-but-invalid `DEMI_SCHEDULER_SECRET` does **not** fall back. Missing secret, missing or wrong header → `404` (fail closed). |
| Exclusion | One `ReadCommitted` interactive transaction takes `pg_try_advisory_xact_lock(4201028001)`. Busy → `200 {"status":"SKIPPED","reason":"LOCK_BUSY"}`. Transaction-scoped, so it is safe behind the Supabase transaction-mode pooler and is released on commit, rollback or a dropped connection. |
| Cadence gate | Inside the lock, `NotificationSchedulerState.lastTickCompletedAt` (singleton, new table) within the last 60 s → `200 {"status":"SKIPPED","reason":"TOO_SOON"}`. A completion time in the future (clock moved back) does not block. The completion time is written in the same transaction, after the steps, even if a step failed. |
| Steps | Round-robin batches: medication drain, then appointment drain (medication first because it expires 15 minutes after its occurrence). A drain gets another batch only while its last batch was full (`claimed ≥ 20`). Then one bounded batch each of the appointment purge and the medication purge. Each step is in its own `try/catch`: a failing step is reported `FAILED` and stops only itself. |
| Gates | The appointment drain still applies `DEMI_LINE_APPOINTMENT_NOTIFICATIONS_ENABLED` / `_GENERATION` per claim (closed rollout → `ROLLOUT_CLOSED` suppression, as through the HMAC route). The medication drain applies the kill switch (§4). |
| Runtime bound | No new batch starts after 90 s. One batch is at most 20 pushes × 8 s LINE timeout, so a batch started just before 90 s still ends before 300 s. The lock transaction times out at 290 s. |
| Response | `{"status":"COMPLETED","durationMs":…,"steps":{"medicationDrain"|"appointmentDrain"|"appointmentPurge"|"medicationPurge":{"status":"COMPLETED"|"FAILED"|"NOT_STARTED","batches":n,"counts":{…}}}}`. Counts only. Failure of the lock transaction itself → generic `503`. |
| Connections | The steps use their own pooled connections while the lock transaction holds one, so the Prisma pool needs **at least 2** connections (the default is more; do not set `connection_limit=1`). |

### Purge bounds

- Appointment notifications: existing `purgeTerminalAppointmentLineNotifications` — terminal states only, `terminalAt` older than 30 days, oldest first, at most 100 rows per call, `FOR UPDATE SKIP LOCKED`.
- Medication reminders: a purge already existed (`purgeTerminalMedicationLineReminderNotifications`, same 100-row bound and `SKIP LOCKED`), so per the scope it is scheduled as is. **Its retention is the existing `MEDICATION_LINE_REMINDER_TERMINAL_RETENTION_MS` = 365 days, not 30 days**; E1 does not change it. Owner question Q1.

## 3. Worker secrets and rotation

| Route | Secret |
| --- | --- |
| `POST …/appointment-notifications/drain` | `DEMI_LINE_APPOINTMENT_NOTIFICATIONS_WORKER_SECRET` (unchanged) |
| `POST …/medication-reminders/drain` | `DEMI_LINE_MEDICATION_REMINDERS_WORKER_SECRET`; while that is unset/blank only, the appointment secret is accepted and `console.warn("medication_line_reminder_worker_config", { warning: "LEGACY_SHARED_WORKER_SECRET_IN_USE" })` is logged once per process (no secret material). A set-but-invalid dedicated secret fails closed. |
| `GET /api/internal/scheduler/{tick,readiness}` | `DEMI_SCHEDULER_SECRET`, else `CRON_SECRET` |

Rotation (operator; not executed in this phase):

1. Generate a new random value (≥ 32 characters, e.g. `openssl rand -base64 48`).
2. **Medication split:** set `DEMI_LINE_MEDICATION_REMINDERS_WORKER_SECRET`, redeploy, switch the medication caller to sign with it, confirm `200`, then confirm the warning no longer appears. From that point the shared secret no longer opens the medication route.
3. **Rotating any HMAC secret:** there is one active value per route, so set the new value and update the caller together (a short window of `404` is expected; the outboxes are durable and the next run catches up within the lateness rules). Replay protection is unaffected: each route keeps its own persisted monotonic invocation time.
4. **Scheduler secret:** with Vercel Cron, rotate `CRON_SECRET` in Vercel (Vercel sends it automatically). With pg_cron, update the Vault secret (§7) and `DEMI_SCHEDULER_SECRET` together.
5. Never reuse one value for two purposes after the transition.

## 4. Medication reminder kill switch

`isMedicationLineRemindersDisabled()` (`src/lib/env/server.ts`) parses `DEMI_LINE_MEDICATION_REMINDERS_DISABLED` like `DEMI_LINE_MINI_APP_DISABLED`: only unset, empty or `"false"` (after trim) leaves reminders on; any other value (`true`, `1`, `TRUE`, `False`, …) disables them. It is evaluated:

1. before materialization — nothing is materialized;
2. right after each claim — the row is `SUPPRESSED` with the new outcome **`REMINDERS_DISABLED`** (also covers a row claimed before the switch flipped whose lease expired);
3. immediately before the LINE push — the reserved attempt is released (attempt fields restored, as the existing deadline release does) and the row is `SUPPRESSED`/`REMINDERS_DISABLED`.

Preferences are not touched. Housekeeping (late first-attempt expiry, exhausted-lease close) still runs. Turning the switch off does not resend suppressed rows; only occurrences still inside the 15-minute window are materialized afterwards.

## 5. Observability

- `console.info("notification_scheduler_tick", result)` once per tick (the response object; `{status:"FAILED"}` when the lock transaction fails).
- Existing per-batch `medication_line_reminder_drain` / `appointment_line_notification_drain` lines with counts by outcome (`materialized`, `claimed`, `providerAccepted`, `retryScheduled`, `suppressed`, `permanentFailure`, `unknownOutcome`).
- No user, binding, appointment, medication, schedule, retry-key or LINE identifiers and no message text appear in any of them (integration test scans every `console.*` call of a real tick).
- `GET /api/internal/scheduler/readiness` (scheduler bearer, 404 otherwise):

  ```json
  { "lastTickCompletedAt": "2026-10-19T08:00:00.000Z",
    "outboxes": {
      "appointmentLineNotifications": { "pending": 0, "oldestPendingAgeSeconds": null },
      "medicationLineReminders": { "pending": 2, "oldestPendingAgeSeconds": 61 } } }
  ```

  `pending` = rows in `PENDING`, `RETRY_SCHEDULED` or `CLAIMED`; the age is measured from the oldest such row's `createdAt`. Suggested alerting (E2): `lastTickCompletedAt` older than 15 minutes, or a medication `oldestPendingAgeSeconds` above 900.

## 6. C3 follow-up — workforce keyword reply

`executeLineReactiveAppointment` (`src/modules/line/services/line-reactive-appointment-service.ts`): when the Patient read for the single active binding is ineligible, the same RepeatableRead transaction resolves `resolveEligibleLineRoles` (the HELP/Rich Menu eligibility). Non-empty roles without `PATIENT` → reply `buildLineHelpReply(roles)` via `replyMessages`, outcome `COMPLETED_HELP`. No eligible role (unbound, multiple bindings, inactive user, no active membership) → the existing INELIGIBLE copy, unchanged. Patient and Patient+workforce accounts are unchanged. The work item does not record whether it came from the keyword or the postback (same intent, same receipt type since C3), so a workforce-only account pressing a stale Patient postback also gets HELP.

## 7. Scheduler wiring examples (not applied — E2)

Production (E2) uses neither example: a systemd timer on the VPS calls the tick on `127.0.0.1` (see [DEPLOY_VPS](../operations/DEPLOY_VPS.md) §1.11). The examples remain valid for other hosts.

Vercel Cron (Pro; Hobby runs at most once a day, which cannot meet the 15-minute medication window). Vercel sends `GET` with `Authorization: Bearer $CRON_SECRET`, does not retry, and may skip or duplicate runs — the lock and the 60 s gate absorb duplicates; the outboxes absorb a skipped run.

```jsonc
// vercel.json — EXAMPLE ONLY, not committed in E1
// {
//   "crons": [
//     { "path": "/api/internal/scheduler/tick", "schedule": "*/5 * * * *" }
//   ]
// }
```

Supabase pg_cron + pg_net (any plan with the extensions enabled; secret kept in Vault, never in the job text):

```sql
-- EXAMPLE ONLY, not executed in E1
-- create extension if not exists pg_cron;
-- create extension if not exists pg_net;
-- select vault.create_secret('<same value as DEMI_SCHEDULER_SECRET>', 'demi_scheduler_secret');
-- select cron.schedule(
--   'demi-notification-scheduler-tick',
--   '*/5 * * * *',
--   $$
--   select net.http_get(
--     url := 'https://<DEMI origin>/api/internal/scheduler/tick',
--     headers := jsonb_build_object(
--       'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'demi_scheduler_secret')
--     ),
--     timeout_milliseconds := 300000
--   );
--   $$
-- );
```

## 8. Database hardening (`function_search_path_mutable`)

Migration `20261028110000_function_search_path` runs `ALTER FUNCTION public.<name>() SET search_path = pg_catalog, public` for `guard_caregiver_appointment_grant_update`, `personal_medication_guard_update`, `medication_schedule_guard_write`, `prevent_workforce_ended_restore`, `enforce_support_report_status_transition` and `guard_patient_hospital_relationship_end` — the six functions in `public` without one on the migrated test database (`line_lifecycle_evidence_guard` already had it). Function bodies and triggers are untouched; unqualified names still resolve in `public` exactly as before. `tests/integration/database-function-search-path.integration.test.ts` fails if any non-extension function in `public` lacks a `search_path` setting.

## 9. Migrations

| Migration | Change |
| --- | --- |
| `20261028100000_notification_scheduler_operations` | `MedicationLineReminderOutcome` + `REMINDERS_DISABLED`; singleton `NotificationSchedulerState(id = 1, lastTickCompletedAt NULL)` with RLS enabled and no PUBLIC grant |
| `20261028110000_function_search_path` | §8 |

## 10. Tests executed

| Check | Result |
| --- | --- |
| New unit tests | `notification-scheduler-auth.test.ts` (exact bearer, `CRON_SECRET` fallback, no fallback from an invalid dedicated secret, 32-character minimum), `notification-scheduler-tick-service.test.ts` (xact try-lock and bounded transaction, `LOCK_BUSY`, 60 s gate at −1 ms / exactly 60 s, future completion, aggregate counts, each of the four steps failing in isolation, round-robin continuation, launch budget, failure log), `app/api/internal/scheduler/{tick,readiness}/route.test.ts` (404 for missing/wrong/raw/unconfigured bearer, no-store, generic 503, `maxDuration`), `medication-line-reminder-invocation-service.test.ts` (dedicated secret verifies and the shared one is rejected while it is set; shared accepted only when the dedicated one is unset/empty, one warning, no secret in the log; invalid dedicated fails closed), `src/lib/env/server.test.ts` (kill-switch parsing), `line-reactive-appointment-service.test.ts` (+8: OSM/HOSPITAL/both get HELP; no role, inactive, Patient+OSM keep INELIGIBLE; no role lookup on success; deadline) |
| PostgreSQL integration (focused) | `notification-scheduler` 5/5 (6 contenders during a held lock → all `LOCK_BUSY`; 8 simultaneous → exactly 1 run; 60 s gate; failing step isolated with completion recorded; readiness); `phase-c-engagement` 21/21 (+5: kill switch blocks materialization and leaves the preference on; a row claimed before the flip is suppressed `REMINDERS_DISABLED` without LINE; flip immediately before the push releases the attempt; readiness pending/age; real tick + drains log scan for user/person/profile/relationship/medication/schedule/binding/row IDs, retry key, LINE user ID, medication name and reminder text); `appointments` 25/25 (+1: purge only terminal rows older than 30 days, oldest first, batch 2 then 1, bound 100 → `RangeError` at 101); `line-webhook-conversation` 6/6 (+1: “นัด” from a workforce-only binding → HELP with OSM+HOSPITAL buttons; suspended and unbound keep INELIGIBLE); `database-function-search-path` 1/1 (the six functions had `proconfig = NULL` before the migration) |
| Final checks | `tsc --noEmit` clean; `npm run lint` 0 errors (2 pre-existing `<img>` warnings in `app/app/hospitals/*`, untouched); `npm run test` 444 files / 4615 tests passed; `npm run test:integration` 53 files / 933 tests passed (includes every guard's existing tests after the `search_path` migration); `npm run build` passed (both scheduler routes dynamic); `npm run prisma:migrations:check` OK (68 migrations) |

## 11. Not verified

- No real Vercel Cron, pg_cron or LINE Push run; no deployed environment variable was read or changed.
- Behavior under a `connection_limit=1` pool (documented as unsupported in §2).
- Supabase advisor re-run on a real project after the migration.

## 12. Owner questions

- **Q1 — Medication terminal retention** is 365 days (existing constant) while appointment rows use 30 days. Keep, or align to 30 days?
- **Q2 — Alert thresholds** in §5 are suggestions for E2.

## 13. Files changed

- Schema/migrations: `prisma/schema.prisma`, the two migrations in §9
- Scheduler: `src/modules/notification-scheduler/services/*`, `app/api/internal/scheduler/{tick,readiness}/route.ts`
- Medication: `medication-line-reminder-delivery-service.ts` (kill switch), `medication-line-reminder-invocation-service.ts` (secret split), `src/lib/env/server.ts`
- LINE: `src/modules/line/services/line-reactive-appointment-service.ts`
- Tests: unit tests beside each changed source; `tests/integration/{notification-scheduler,database-function-search-path}.integration.test.ts` (new), `phase-c-engagement`, `appointments`, `line-webhook-conversation` (extended)
- Docs/config: this file, `docs/CONTEXT.md` addendum, `.env.example`

## 14. Historical correction (superseded by §15) — scheduler health and bounded queue turns (2026-10-20)

This section supersedes the earlier scheduler outcome/readiness statements above where they conflict. A tick is `COMPLETED` only when both notification drains and both purges complete. A failed step makes the tick `FAILED`; a full per-queue batch or a step skipped at the execution budget is explicitly `DEFERRED`. `NOT_STARTED` is not success. `lastTickCompletedAt` records the last fully completed tick and does not advance after a failed or deferred attempt. The additive `NotificationSchedulerTickStatus` field records the latest locked tick result so readiness becomes unhealthy immediately after `FAILED` or `DEFERRED`, even when the last success is recent; stale readiness also returns HTTP 503. This required one forward-only migration and stores only an aggregate enum, with no patient/provider data.

The tick gives medication and appointment queues one sequential batch each, up to 10 rows per queue, medication first to preserve its 15-minute delivery window. The 180-second launch budget is below the 290-second advisory-lock transaction and 300-second route limit. A full batch is conservatively reported deferred even if the queue happened to empty at exactly the batch boundary; the next tick confirms it. Persistent deferral/failure is visible through systemd nonzero exit and readiness, and requires operational investigation. Transaction lock, leases, idempotency, provider outcomes, retries, generation fencing and kill switches are unchanged.

This code correction has not been activated or observed on a production VPS or LINE provider. See `operations/RELEASE_GATE.md`: code verification, operational verification and business approval remain separate.

## 15. CURRENT throughput and fairness remediation (2026-10-20)

Starting HEAD: `1c90cd819bd7db0b2268956186499cb3dcf7f3db`. Work is on existing `main`; the final SHA is supplied in the delivery report (the commit containing this section). No migration, dependency or infrastructure is added. Unrelated concurrent reporting/UI changes and existing `.tmp-*` files are excluded from this remediation commit.

### Root cause and selected policy

At the starting HEAD, `runSteps()` called each drain only once with 10 claims. A five-minute timer provided only about 30 opportunities per queue over three ticks, even with spare CPU, healthy DB and fast provider. The reproduction failed for 50/100/200 items (only 10 accepted per queue); 10 items exactly also incorrectly reported DEFERRED after emptying the queue.

Repeated deterministic fair rounds now run medication then appointment, at most 5 sequential claims per turn. A nonempty queue receives another turn; an empty or failed queue leaves the rotation. First-attempt medication rows precede retry rows; each group remains ordered by due time, creation time and ID. This gives finite due first attempts priority without changing the retry window. Appointment work retains its due-time order. No new provider concurrency is introduced. We considered parallel lanes but rejected the extra connection/lease ownership complexity because repeated sequential turns meet the supported burst envelope. Increasing batch size alone would lengthen the wait for the other queue.

Bounds:

- 180 seconds for launching new work, checked before each claim, before reservation, and immediately before dispatch. An owned in-flight call is awaited and settled. A budget stop after revalidation returns only the owned lease and restores an unused attempt reservation; no detached promise or speculative retry is created.
- 80 turns / 400 claims per queue, 800 claims globally. Medication materialization remains 200 rows per SQL page, at most two pages (400) per tick. Maintenance runs on the first medication turn; first-attempt deadline checks still run on each claim and immediately before dispatch. Due-work counts are queried at the end of each batch, so a full final batch is not falsely deferred. Empty queues are not repeatedly polled. Unmaterialized work above the cap is outside the supported envelope and is not included in remainingDue.
- Global and per-queue provider concurrency = 1. Scheduler connection demand remains one lock connection plus one work connection. The documented Prisma pool remains 5, leaving capacity for ordinary application work, subject to actual contention. No pool increase is needed.
- LINE push timeout remains 8 s; lease remains 30 s; at most 3 attempts; medication retry window remains 23 hours with the existing jittered 60/240 s backoff. Provider calls remain outside delivery transactions. Existing query transaction defaults and the lock transaction 290 s timeout are unchanged; lock maxWait is 5 s, route metadata 300 s, CLI 320 s and systemd 330 s.
- The calendar timer activates every minute with 1 s accuracy. An active service is not duplicated; the advisory lock also protects independent callers. The existing 60 s gate since the last *completed* tick may skip a calendar activation. Failed/deferred ticks do not advance the successful-completion timestamp. The simulation conservatively waits until the next calendar minute after an active invocation settles; actual systemd versions may reactivate sooner after an elapsed activation.

At bounded latency, the other queue waits at most one five-item turn plus its DB overhead before its next opportunity. One timeout does not block indefinitely. At the 8 s timeout and a total 150 ms DB overhead per item, a turn takes 40.75 s; a last owned attempt may settle after 180 s (synthetic maximum 187.45 s), still below the lock cap under those assumptions. Database stalls are not safely cancelled by abandoning a Promise or by assuming Prisma's outer transaction timeout cancels the callback. Operational acceptance must measure DB/pool waits and settlement headroom; unbounded database/network latency is outside the capacity claim.

### Capacity model and reproducible benchmark

These are **synthetic policy measurements**, not LINE production measurements or proof of device receipt. Run:

```sh
npm run test -- src/modules/notification-scheduler/services/notification-scheduler-capacity.test.ts
npm run test:integration:focused -- tests/integration/phase-c-engagement.integration.test.ts
```

The policy benchmark starts 60 s after all occurrences become due, simulates every claim/settlement, conservatively schedules nonoverlapping calendar invocations, persists successful-completion timing across ticks, and prints aggregate accounting. Total item cost includes provider latency plus all DB/revalidation/settlement cost, not just the HTTP call. A separate single-tick test adds 20 ms per batch. PostgreSQL tests use real synthetic eligible patients, materialization, claim, revalidation and settlement with a mocked provider; provider time is advanced deterministically. Their printed tick wall time measures local PostgreSQL only; fixture creation is excluded. The final local run measured 770 / 3,440 / 9,331 / 27,035 ms for 10 / 50 / 100 / 200 medication rows, while the synthetic clock advanced 4 / 20 / 40 / 80 s. These wall times include local machine contention and are not remote DB bounds.

| Burst in **each** queue | Immediate HTTP + DB 150 ms/item: active time | HTTP 250 ms + DB 150 ms/item: active time | HTTP 250 ms + DB 950 ms/item: ticks / max first wait | Medication first-attempt misses in these three profiles |
| --- | --- | --- | --- | --- |
| 10 + 10 | 3 s | 8 s | 1 / 82.8 s | 0 |
| 50 + 50 | 15 s | 40 s | 1 / 178.8 s | 0 |
| 100 + 100 | 30 s | 80 s | 2 / 358.8 s | 0 |
| 200 + 200 | 60 s | 160 s | 3 / 658.8 s | 0 |

Rates while active are respectively 6.67, 2.5 and 0.83 total items/s before batch overhead. The first single-tick 400 ms/item profile includes batch overhead: 200 + 200 takes 161.6 s. For total item cost L, active capacity is bounded approximately by min(800, floor(180/L)), shared fairly while both queues remain nonempty; a last started operation can finish after the launch cutoff. With no competing queue, medication uses the available turns directly. Calendar delay, the successful-completion guard, retries and DB contention must also be included in end-to-end waiting time.

**Supported synthetic burst envelope:** up to 200 synchronized medication occurrences plus 200 appointments, aggregate item cost at most 1.2 s, no continuing arrivals or persistent provider failure, no extended scheduler outage, with the minute timer, under the modeled DB cost and settlement bounds. The last first attempt starts at 658.8 s from due time (under 15 minutes). The 400 ms profile has headroom for 20 ms/batch. Target-environment acceptance must replay the full burst including real aggregate DB costs and timer jitter; these assumed budgets are not p95 measurements. A burst arriving just after a recently completed empty tick can wait an extra cadence skip; the modeled 1.2 s envelope still has over 3 minutes of deadline headroom; a separate cadenceSkip scenario verifies that warm-start skip at every burst size.

The explicit adverse profile (8 s provider + 150 ms DB per item, an ambiguous first response followed by same-key acceptance) **does not support 200 reminders inside 15 minutes**. With both queues loaded, the simulation accepts 49 medication first attempts and expires 151; all 200 appointments eventually progress, with no pending row lost. For 50 and 100, medication accepts 49 and expires 1 and 51 respectively; 10 completes without misses. Maximum active tick time is 187.45 s. This is visible saturation, not a delivery guarantee. If measured target latency/arrival load is outside the envelope, keep proactive rollout blocked, reduce the enabled cohort/load within the measured capacity, investigate DB locality/queries/provider/quota and rerun the gate. Increasing concurrency requires a separate pool/lease safety review; do not silently relax the deadline or replay expired reminders.

For 200 per queue at 400 ms/item: partial transient failures (one in five first attempts) produce 80 retried attempts, 400 accepted and zero expiration over two invocations. First-attempt 429 or ambiguous transport outcomes for all rows produce 400 retries, 400 accepted and zero expiration; due-time/first-attempt ordering completes them over two invocations. Ambiguous acceptance uses a stable modeled retry key, so one accepted business delivery per key is counted. Opt-out/unlink simulations suppress one row per queue; restart simulation defers the first partial tick and later completes all 400. Each scenario accounts for accepted + expired + suppressed + pending + retry = original rows. These policy simulations complement the real PostgreSQL lifecycle/race and LINE adapter tests; they do not replace those checks.

### Outcomes, health and escalation

COMPLETED means both drains have no claimable due work at their final snapshots and both purges finished. Future retries or another worker's unexpired lease can remain durable. FAILED means an internal step failed. DEFERRED means due work or a step remains at the time/work cap; BATCH_LIMIT now means the per-tick 80-turn ceiling, not merely one full batch. SKIPPED is only LOCK_BUSY/TOO_SOON. CLI accepts the new aggregate fields and remains nonzero for failure/deferral, including actual process exit-code tests.

Readiness uses existing durable outbox/state data; no new persistence is needed. A brief DEFERRED may be healthy only after a fully completed tick no more than 600 s ago, and only with medication oldest due age <300 s, appointment <600 s, zero delivery-window expirations and zero permanent/unknown terminal outcomes in the last 10 minutes. FAILED, stale/future/missing completion, aged due work or those outcomes fail closed. A feasible but slow burst may temporarily trigger this conservative capacity warning before missing a deadline; it is not a permanent failure once work clears. A first deployment stays unhealthy until a full tick completes.

All responses/logs remain aggregate-only: per-step claimed, accepted, retries, suppressed, unknown/permanent failures, batches, final remainingDue, duration and medication deliveryWindowExpired; readiness adds oldestDueAgeSeconds, deliveryWindowExpiredLast10Minutes and terminalDeliveryFailuresLast10Minutes. Capture minute snapshots to derive durable settlement/rescheduling progress and backlog trends. Claimed is a processing opportunity, not proof of settlement or delivery; returned leases can be claimed again. deliveryWindowExpired is a subset of suppressed in real drain logs: subtract it to calculate other suppression, rather than adding it twice. The synthetic accounting table separates those categories. Investigate zero progress with eligible work, growth over three ticks or prolonged deferral; any delivery-window expiration invalidates notification acceptance until investigated. Recent incident counts are rolling windows, not a permanent incident-acknowledgment store. Retain and triage journal evidence beyond the window. The 15-minute first-attempt boundary remains inclusive; genuine attempted retries retain their existing retry semantics and key.

### Provider and correctness references

Reviewed official [LINE push/rate-limit reference](https://developers.line.biz/en/reference/messaging-api/nojs/#send-push-message) and [retry guidance](https://developers.line.biz/en/docs/messaging-api/retrying-api-request/): push rate limit is 2,000 requests/s per channel, 429 may indicate rate or quota exhaustion, same retry-key acceptance yields 409, and timeouts/5xx do not prove rejection. Retry keys are valid 24 hours; the existing 23-hour medication window is retained. Acceptance is not device delivery. The 800-claim tick cap and sequential requests do not authorize other callers to exceed shared channel limits.

Reviewed [Prisma v6 pool behavior](https://www.prisma.io/docs/orm/v6/prisma-client/setup-and-configuration/databases-connections/connection-pool), [PostgreSQL advisory locks](https://www.postgresql.org/docs/17/explicit-locking.html#ADVISORY-LOCKS), [systemd timer semantics](https://www.freedesktop.org/software/systemd/man/latest/systemd.timer.html) and the installed Next.js route-segment documentation. No new identity, authorization, preference, content, source event, provider setup or production configuration is changed.

### Verification and external boundary

The final delivery report records executed commands/results and final SHA. The benchmark is reproducible from the test commands above and prints accepted, retries, deferrals, expiration, pending, duration, waiting time and maximum in-flight requests. PostgreSQL includes 10/50/100/200 eligible patient bursts; budget stops before/after reservation; in-flight settlement/restart; deadline/opt-out/unlink/concurrent lease regression checks. Scheduler tests cover sustained backlog, slow queues, resource caps, exact-full empty completion, independent failures, process exit codes and readiness recovery/saturation.

Deployment must install the new versioned timer while stopped and after owned service work settles, daemon-reload, then resume; rollback installs the previous units. No production action is performed here. Production latency/pool/timeout evidence, quota/provider setup, target monitoring, real-device UAT and business/privacy approval remain external open gates in RELEASE_GATE. Local code closure never marks them passed.

Verification note: the first full repository run exposed three pre-existing Windows CRLF fixture failures in `scripts/env-check.test.mjs` (4,756 passed / 3 failed). The missing-variable regexes did not remove CRLF lines. They now accept LF/CRLF; the original rejection assertions are unchanged and the focused eight tests pass. This is a test-portability correction only; runtime environment validation is unchanged. Final confirmation/build results follow.

#### Executed closure checks

| Check | Actual result |
| --- | --- |
| Focused scheduler/CLI/routes/deploy/medication/appointment/LINE adapter command (`npm run test -- src/modules/notification-scheduler app/api/internal/scheduler scripts/scheduler-tick.test.mjs deploy/deploy-artifacts.test.mjs src/modules/medications src/modules/appointments src/modules/line/adapters/line-messaging-client.test.ts --testTimeout=20000`) | 526 passed at that point; subsequent benchmark additions passed as the final 48-case capacity file and in the full confirmation |
| `npm run test` (final full confirmation) | 456 files / 4,765 tests passed; first run's three CRLF fixture failures are documented above |
| `npm run test:integration:focused -- tests/integration/phase-c-engagement.integration.test.ts` | 29 passed, including actual 10/50/100/200-patient bursts and default scheduler wiring |
| Additional focused PostgreSQL retry-reservation test (`node --env-file=.env.integration node_modules/vitest/vitest.mjs run --config vitest.integration.config.mts tests/integration/phase-c-engagement.integration.test.ts -t 'restores a retry reservation'`) | 1 passed / 29 intentionally skipped; preserves ambiguous outcome, retry key and prior reservation fields |
| PostgreSQL selected regression (`node --env-file=.env.integration node_modules/vitest/vitest.mjs run --config vitest.integration.config.mts tests/integration/notification-scheduler.integration.test.ts tests/integration/appointments.integration.test.ts tests/integration/phase-e-access.integration.test.ts tests/integration/patient-care-end.integration.test.ts`) | 59 passed in 4 files; 89 distinct PostgreSQL tests passed across these commands |
| `npm run typecheck` | Passed; `npm --prefix <snapshot> run typecheck` also passed, and the staged-snapshot production build passed its TypeScript phase |
| `npm run lint` + focused eslint after test-only edits | Passed, 0 errors; 2 existing next/no-img-element warnings in untouched hospital content/knowledge files |
| `npm run prisma:migrations:check` | Passed, 69 migrations; zero new migrations |
| Production build | `npm run build` compiled in the shared worktree, then failed on three newly added, unrelated `scripts/demo/demo-scenario.ts` TS2561 errors (812/813/816). No unrelated file was changed to hide this. Exported the staged index with `git checkout-index` to an owned temporary snapshot and ran `npm --prefix <snapshot> run build` with synthetic configuration/local disposable DB: passed compilation, TypeScript and all 47 static pages. Snapshot contains the commit's tracked source and excludes concurrent uncommitted UI/demo/reporting work. |
| Diff/security/encoding review | Reviewed the scoped diff; no credential, patient data, LINE recipient ID, message-content change, dependency, schema migration or production action introduced. Thai UTF-8 preserved. |

Files in this remediation commit:

- Runtime: `src/modules/notification-scheduler/services/notification-scheduler-{tick-service,readiness-service}.ts`, `src/modules/medications/services/medication-line-reminder-delivery-service.ts`, `src/modules/appointments/services/appointment-line-notification-delivery-service.ts`.
- Caller/deploy: `scripts/scheduler-tick.mjs`, `deploy/systemd/demi-scheduler.timer`.
- Tests: the scheduler tick/readiness/capacity tests, `scripts/{scheduler-tick,env-check}.test.mjs`, `deploy/deploy-artifacts.test.mjs`, `tests/integration/{notification-scheduler,phase-c-engagement,appointments}.integration.test.ts`.
- Documentation: `docs/CONTEXT.md`, `docs/operations/{DEPLOY_VPS,LINE_PRODUCTION_SETUP,RELEASE_GATE}.md`, this phase handoff.

Disposition for the scoped staged source: **PASS — LINE CODE IMPLEMENTATION READY FOR CLOSURE**. No LINE code blocker remains within the documented capacity envelope. The concurrent uncommitted demo TypeScript failures remain outside this commit. T-16 target capacity/monitoring, provider/device UAT and business/privacy gates remain open. No deploy, production DB migration, provider reconciliation or LINE Console change was performed.
