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
