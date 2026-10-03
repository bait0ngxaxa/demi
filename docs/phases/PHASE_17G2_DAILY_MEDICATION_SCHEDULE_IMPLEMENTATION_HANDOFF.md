# Phase 17G.2B — Personal Medication Daily Schedule Implementation Handoff

**Phase 17G.2 IMPLEMENTED / CLOSED — bounded Daily Medication Schedule domain and automated evidence only.**

Date: 2026-10-03. Authority: [approved 17G.2 contract](./PHASE_17G2_DAILY_MEDICATION_SCHEDULE_CONTRACT.md). G2-OD01/G2-OD02 remain CLOSED / OWNER APPROVED. No approved product decision was reopened.

## Repository boundary

Repository: `bait0ngxaxa/demi`. Starting and final HEAD: `8748282c2b6a20697a88313adfb8c80cb0a587c2`. Starting tree clean; matches the owner-observed main commit, without an independent remote-head fetch. Final working tree: **17 modified tracked files + 10 new files**, all listed below. No commit, push, reset, rebase or unrelated work.

Modified:

- `prisma/schema.prisma`
- `src/modules/medications/domain/personal-medication-definitions.ts`
- `src/modules/medications/schemas/personal-medication-schemas.ts`
- `src/modules/medications/services/personal-medication-query-service.ts`
- `src/modules/medications/services/personal-medication-service.ts`
- `src/modules/medications/services/personal-medication-services.test.ts`
- `src/modules/medications/transport/action-state.ts`
- `src/modules/medications/transport/server-actions.ts`
- `src/modules/medications/transport/server-actions.test.ts`
- `app/app/personal/medications/personal-medication-controls.tsx`
- `app/app/personal/medications/personal-medication-workspace.tsx`
- `app/app/personal/medications/personal-medication-workspace.test.tsx`
- `app/app/personal/medications/page.test.tsx`
- `tests/integration/personal-medication.integration.test.ts`
- `docs/CONTEXT.md`
- `docs/phases/PHASE_17_UAT_BACKLOG.md`
- `docs/phases/PHASE_17G2_DAILY_MEDICATION_SCHEDULE_CONTRACT.md` — small current-status addendum; historical contract retained.

Created:

- `prisma/migrations/20261003120000_daily_medication_schedules/migration.sql`
- `src/modules/medications/domain/medication-local-time.ts`
- `src/modules/medications/domain/medication-local-time.test.ts`
- `src/modules/medications/schemas/medication-schedule-schemas.test.ts`
- `src/modules/medications/services/medication-schedule-services.test.ts`
- `src/modules/medications/transport/schedule-form.ts`
- `src/modules/medications/transport/schedule-form.test.ts`
- `src/modules/medications/transport/schedule-actions.test.ts`
- `app/app/personal/medications/medication-schedule-editor.test.tsx`
- This handoff.

No package/lockfile/environment/configuration/global request-size change. Generated Prisma Client exists only under ignored `node_modules`. Existing stop/text services, SELF policy/resolver, audit service and shared transaction retry helper retain their server-side behavior. No new route/navigation entry or parallel medication stack.

## Schema, migration and exact database invariants

One forward migration, later than every migration present at coding start: **`20261003120000_daily_medication_schedules`**. All 32 published migrations remain unchanged, particularly `20261002120000_personal_medication_foundation` and its terminal parent trigger.

`MedicationSchedule`: UUID id; required parent UUID; `localTime TIME(6) WITHOUT TIME ZONE NOT NULL`; `createdAt TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`. Prisma `@default(uuid())` generates child UUIDs. The parent receives only the reverse `schedules MedicationSchedule[]` relation. Ownership remains through PersonalMedication.

| Name | Invariant |
| --- | --- |
| `MedicationSchedule_pkey` | UUID primary key |
| `MedicationSchedule_personalMedicationId_fkey` | Parent FK, ON DELETE RESTRICT / ON UPDATE RESTRICT |
| `MedicationSchedule_medication_time_key` | Unique `(personalMedicationId, localTime)`; different parents may share a time; also supports ordered parent lookup |
| `MedicationSchedule_localTime_minute_check` | `localTime >= TIME '00:00:00' AND localTime < TIME '24:00:00' AND EXTRACT(SECOND FROM localTime) = 0` |
| `medication_schedule_guard_write` | Reject every UPDATE including no-op, reparent, id/time/createdAt changes. INSERT/DELETE lock the referenced parent with FOR UPDATE before requiring its existence and ACTIVE status; content-free SQLSTATE 23514 failure otherwise |
| `MedicationSchedule_guard_write_trigger` | BEFORE INSERT OR UPDATE OR DELETE, FOR EACH ROW |

Parent lock lasts until transaction completion. Trigger does not change parent.updatedAt or write audits. No application TRUNCATE/DDL/trigger-disabling grants were introduced. No child version/status/owner/timezone/frequency/clinical/reminder fields.

## HH:mm, bounds and actual PostgreSQL evidence

Canonical application/DTO time is exactly five ASCII characters, `HH:mm`; valid range 00:00–23:59. No trimming, coercion, offsets, second/fraction syntax, locale digits, rounding or silent deduplication. Explicit length plus the approved regex also excludes the JavaScript regex end-anchor's trailing-newline case.

The narrow ORM adapter constructs `new Date(Date.UTC(1970, 0, 1, hour, minute, 0, 0))` and reads UTC hours/minutes. Date is solely a Prisma TIME carrier, never recurrence date/occurrence/UTC scheduling authority. No local/browser Date getters, seven-hour subtraction or carrier serialization to clients.

**Installed Prisma Client 6.19.3 + real PostgreSQL 17:** inserted `08:00`, raw native read `08:00:00` of type `time without time zone`, DTO `08:00`. Both DB-session `UTC` and `Asia/Bangkok` pass. A separate process with `TZ=America/Los_Angeles` ran the two native TIME tests: **2 PASS / 36 intentionally filtered out** at the then-current 38-test integration state. No process-global timezone was mutated inside parallel tests. The later whitespace-only rejection guard does not change valid-time mapping.

Collection is required 0..1,440 unique minutes; [] clears; unsorted input canonicalizes ascending. Real PostgreSQL also persists/returns the full 1,440-minute set without truncation. Central domain constants are reused by schemas, UI, transport and tests.

FormData: exactly the three application fields medicationId/expectedUpdatedAt/times, one JSON array for times. Before JSON.parse: max 3 fields, UUID max 36 UTF-16 units, incumbent ISO version max 40, JSON max 12,000 units, aggregate names/values max 16 KiB UTF-8. Duplicate fields, Files, unknown keys, missing times, malformed JSON and strict schema failures reject. Only incumbent `$ACTION_` framework fields are ignored. Exact JSON and UTF-8 boundaries are tested. Transport validates; service revalidates inside its transaction.

## Authorization and consistent DTOs

Every detail/replacement resolves the incumbent persisted exact ACTIVE User/PATIENT role/Person/PatientProfile SELF binding. Owner never comes from the client. Foreign and missing parents use identical safe NotFound errors; own STOPPED/stale versions conflict. Identity mismatch, removed persisted role, inactive account and missing profile fail closed.

| Actual persisted actor fixture | PostgreSQL result |
| --- | --- |
| Patient own ACTIVE | Detail + replace permitted |
| Patient own STOPPED | Detail/history permitted; replace conflicts |
| Other Patient | Foreign detail + replace denied without existence disclosure |
| OSM / assigned OSM | Denied |
| Hospital MEMBER / OWNER | Denied |
| Routine ADMIN | Denied |
| Family relationship / active appointment-caregiver grant | Denied |
| Independently eligible PATIENT + OSM/HOSPITAL/ADMIN/caregiver | Own SELF only; foreign access denied |

Detail uses the existing Serializable helper: persisted SELF resolution, owner-scoped parent and nested ascending localTime projection in one consistent snapshot. A real integration test commits replacement after detail's authorization read and proves the detail still returns a coherent old snapshot; a fresh read returns the new set.

Detail adds required `schedules: { localTime: string }[]` only, including [] for none and the same projection for STOPPED. Child IDs/timestamps/ownership are excluded. Base DTO mapping is explicit so relation data cannot leak through record spread. List/create/text-edit/stop DTOs remain minimal; lists retain 50 + lookahead, existing owner/status cursors and createdAt/stoppedAt ordering. No list schedule preload/N+1, read audit or shared result/authorization cache.

## Aggregate mutation, concurrency and STOPPED lifecycle

`replacePersonalMedicationSchedules` reuses `runSerializableTransaction`. Validate → resolve SELF → scoped parent → ACTIVE/exact version check → conditional updateMany with id/owner/ACTIVE/persisted updatedAt → require count=1 → load children → delete removed values → insert new values → one audit → fresh detail, all on the same tx client. Dependent writes are sequential. Unchanged child rows retain id/createdAt. No medication text/status/stoppedAt/createdAt change.

Version is solely parent.updatedAt, advancing `max(authoritative now, previous + 1ms)`, including accepted identical/empty replacements. Text edit, schedule replacement and stop invalidate each other's old tokens. No rebase/merge/idempotency key or browser replay. Existing bounded two-retry helper is unchanged; only its known confirmed-abort P2002/P2034 paths retry with the original request/token.

Real same-token replacement/replacement, replacement/text-edit and replacement/stop races have exactly one winner. Both overlapping replacement/stop winner orders are deterministically exercised with a held parent claim and observed PostgreSQL lock wait: stop-first retains old rows; replacement-first rejects old stop, and explicit refreshed stop preserves new rows. Raw child INSERT/DELETE versus stop runs in **ReadCommitted and Serializable, both lock orders**, with observed database lock waits; stop-first child writes reject. Serialization abort is acceptable; no post-stop child write succeeds.

Stop retains the exact committed schedule rows, writes only its incumbent stopped audit and remains terminal. Ordinary STOPPED child writes fail at DB level, including no-op/reparent UPDATE. Retracking creates a new medication with zero schedules; no copy/snapshot/backfill.

## Audit/privacy and UI

One committed replacement creates exactly one **`personal_medication.schedule_updated`**, resourceType PersonalMedication, parent UUID resourceId, authenticated server actorUserId, metadata omitted/persisted null. No schedule times, arrays, counters, child IDs, medication/instruction text or Patient PII in audit/log/error dumps. Reads do not audit. Real audit failure and injected real child uniqueness failure roll back parent version, child deletes and inserts; stale failures add no audit.

Only `/app/personal/medications` changes. ACTIVE editor uses existing primitives/tokens, vertical rows, native time inputs step=60, local add/remove, complete-set save and cancel-to-loaded-set. Required Thai copy names personal daily Asia/Bangkok times and explicitly states no notification behavior. Empty/duplicate/validation/pending/success/conflict/ambiguous states are covered. Full large sets remain reachable in contained scroll regions. Persisted/detail order is ascending; drafts do not reorder while typing.

STOPPED shows **เวลาที่บันทึกไว้ก่อนหยุดติดตามรายการนี้**, retained HH:mm values/empty state and no mutation controls. Existing **หยุดติดตามรายการนี้ใน DEMI** wording and explanation about tracking rather than medication intake remain intact.

Small local selected-item coordinator blocks sibling text/schedule/stop submissions while pending and on conflict/unknown outcome. Action results report to the surviving workspace before returning, including safe browser-network failure requiring refresh. Successful path revalidation supplies fresh detail; shared id:updatedAt subtree key initializes all forms from the new aggregate together. Actor presentation-key changes remount all drafts. No browser-persisted drafts or global state framework.

UI evidence is static rendering plus controlled hook/event tests, not a real DOM/browser/device UAT. Impeccable Operate guidance and incumbent design were inspected; no design-system rewrite.

## Executed verification

| Command / evidence | Exact result |
| --- | --- |
| `npx prisma validate` | PASS |
| `npm run prisma:generate` | PASS, Prisma Client 6.19.3 |
| `npm run test:db:status` | PASS; healthy pre-existing local disposable PostgreSQL 17 container at localhost:55432; credentials suppressed |
| `npm run prisma:migrate:test` | PASS; current disposable DB happened to have empty history, applied all 33 migrations; not misrepresented as existing-data upgrade |
| Owned temporary clean DB → Prisma migrate deploy | PASS, separate empty DB, all 33 migrations and child trigger verified |
| Owned temporary current-history/existing-data DB → Prisma migrate deploy | PASS, first all 32 incumbent migrations; seed representative ACTIVE/STOPPED with instruction text containing a clock; apply new migration; 32→33; both parent records exactly unchanged and zero children |
| `npm run test -- src/modules/medications app/app/personal/medications` | PASS, **12 files / 162 tests / 0 failed** |
| `npx vitest run --config vitest.integration.config.mts tests/integration/personal-medication.integration.test.ts` via temporary safe environment launcher | PASS, **1 file / 39 tests / 0 failed**; DATABASE_URL = DIRECT_URL = DEMI_TEST_DATABASE_URL; local nonproduction disposable environment |
| Separate `TZ=America/Los_Angeles` process, same targeted runner with `-t 'native TIME'` | PASS, **2 tests / 0 failed**, 36 deliberately filtered at that iteration |
| `npm run lint` | Final full lint PASS, **0 errors / 0 warnings**; subsequent local client wrapper/annotation changes checked by focused `npx eslint` = PASS |
| `npm run typecheck` | Final PASS, **0 errors**; production-build TypeScript also PASS |
| Stable diff/security/privacy/encoding/module-boundary review | PASS before broad verification; explicit callback annotation correction has no runtime effect |
| `git diff --check` | PASS; final documentation/UTF-8 review also performed |
| ONE `npm run test` | PASS, **192 files / 1,447 tests / 0 failed** |
| ONE `npm run test:integration` | PASS, **28 files / 352 tests / 0 failed**; runner also regenerated Prisma Client and confirmed no pending migrations |
| ONE `npm run build` | PASS, Next.js 16.3.0 compilation, TypeScript, page generation; medication route **ƒ dynamic** |

Iteration issues were resolved without weakened checks: first event-harness run 7 PASS / 4 FAIL lacked requestAnimationFrame in Node (bounded test stub added); subsequent page/UI run 14 PASS / 2 FAIL exposed undefined===undefined feedback rendering (selected guard fixed); a typecheck found 2 implicit callback parameter errors (explicit types added); initial lint found 0 errors / 1 warning in the temporary migration helper (helper removed). No pre-existing or unresolved automated failure. The sole broad unit run overlapped the annotation-only correction; runtime behavior was unchanged, so no redundant full rerun. Final typecheck and production build cover the corrected types.

All owned temporary databases/staging/launchers were removed. The pre-existing disposable container was retained. Test cleanup verifies the disposable environment before child-table TRUNCATE; this bypass is isolated test infrastructure, never an application endpoint or production-trigger weakening. Published migrations unchanged; Thai UTF-8/new-file no-BOM review passed; existing schema CRLF and incumbent source/document line endings preserved.

No `architecture:check` script exists; dependency direction was reviewed directly. No browser/device UAT or production deployment was executed. No UAT/deployment PASS is inferred from build/tests.

## Explicit non-goals and remaining gates

No occurrence generation, reminders, adherence/taken/missed, delivery/channels/jobs/cron, notification preferences, clinical dose/unit/prescription/provider semantics, Hospital/OSM/Family medication authority, weekdays/every-N-hours/PRN/date ranges/timezone selection, import/export/share, generic recurrence/ACL/version framework, or Goal Plan coupling.

**Exact final status: Phase 17G.2 IMPLEMENTED / CLOSED**, only this bounded Daily Medication Schedule domain and automated evidence. **17G.1 IMPLEMENTED / CLOSED; MED-02 REQUIREMENT-GATED; 17G.3 NOT IMPLEMENTED; 17J future; P17F-L04 unchanged; Q5 unchanged.** Browser/device UAT and production deployment remain separately unperformed; no other open implementation issue identified.
