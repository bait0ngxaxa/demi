# Phase 17H.2 — Personal Exercise Journal Implementation

## Delivery status

**Phase 17H.2 IMPLEMENTED / CLOSED; WELL-02 IMPLEMENTED.** Implementation started from `f7654ec8cc2061475196a8fe969ea522dbd9b048` (`docs(phase-17h2): align duration cap with structural bound`). HEAD matched the expected baseline and the working tree was clean. No newer commits required reconciliation.

Q64–Q68 remain CLOSED / OWNER APPROVED — Option A. One entry records one actually performed session reported by the Patient. `activityName` is required free text (raw ≤240 and trimmed 1..120 UTF-16 code units); `occurredOn` is a chosen Gregorian Asia/Bangkok civil date (past/today allowed, future denied); `durationMinutes` and `note` remain optional. Duration is an integer 1..1,000,000 minutes. The upper bound is DEMI's defensive structural validation convention, not a medical maximum. Note is optional plain text (raw ≤2,000 and trimmed ≤1,000 UTF-16 units). Text is escaped when rendered. Multiple identical sessions remain legal when created with separate intent nonces.

## Runtime and persistence

Added the independent `src/modules/exercises/` module for Exercise domain types/date handling, strict Zod validation, its own exact SELF policy and persisted owner resolver, mutation/query services, HMAC cursor, bounded FormData transport, Server Actions and consumed-create error. Exact current authority is authenticated ACTIVE User → persisted PATIENT role → exact Person → exact PatientProfile on every operation, including list, detail, replay, edit, delete and continuation. Work, Family, Hospital, OSM, routine ADMIN and other Patient authority do not grant access.

Added Prisma `PersonalExerciseEntry` and `PersonalExerciseCreateReceipt`, with one forward migration: `20261004100000_personal_exercise_journal`. The entry stores required `VARCHAR(120)` activity and PostgreSQL `DATE`, nullable PostgreSQL `INTEGER` duration and `VARCHAR(1000)` note, and `TIMESTAMPTZ(3)` persistence/version instants. Checks enforce date range, non-empty trimmed activity/note and duration null or 1..1,000,000. Owner history index is `(patientProfileId, occurredOn DESC, createdAt DESC, id DESC)`; content uniqueness is absent. Receipt stores only owner, nonce, unique scalar entry locator and creation instant. It has no Exercise-entry FK, so physical deletion leaves consumed-operation memory without any Exercise payload.

Create, receipt and `personal_exercise.created` audit commit atomically. Same-nonce replay returns current surviving readback; after deletion it returns safe CREATE_CONSUMED and never recreates the entry. A fresh nonce is generated only by explicit new intent. Serializable transactions use retryLimit 0. P2002/P2034 become safe conflicts. Edit/delete require expected updatedAt and owner-scoped guarded count-one writes. Current identical edits are NOOP; stale identical edits conflict; actual edits advance by at least 1ms at TIMESTAMPTZ(3). Physical delete emits one minimized audit. Audit actions are `personal_exercise.created/updated/deleted`, resourceType `PersonalExerciseEntry`; metadata contains no Exercise payload. Replay, NOOP, failed operations and reads add no success/read audit.

Private history returns only the active event DTO, ordered by occurredOn, createdAt and id descending, 50 rows at a time (fetch 51). The dedicated `exercisecur_v1_` HMAC-SHA256 cursor uses `IDENTITY_HASH_SECRET`, domain `demi.personal-exercise.cursor.v1`, canonical actor/person/owner/scope bindings and timing-safe verification. It contains order/version position only and no activity, note or duration.

## Wellness UI and privacy

`/app/personal/wellness` now has one neutral สุขภาพ header and local anchor navigation to two independent live sections: อาหาร and การออกกำลังกาย. Meal and Exercise retain separate editors, selected records, nonce, cursor, list, feedback and mutation actions. Meal behavior was kept intact; its prior tests ran as part of focused and full checks. No Weight interface or extra top-level navigation item was added.

Exercise UI uses existing DEMI controls and Thai copy for Patient-entered personal data. It supports create/edit/delete confirmation, empty/loading/readback/validation/conflict, transient same-nonce retry, consumed-create explicit recovery, denied-state clearing and paginated history. Date defaults to today without a stale static max. Exercise state is kept in memory; pagehide clears payload and delayed responses, BFCache restoration reloads, and account changes receive an opaque server-rendered remount key. Reads remain authenticated request-time reads with no cross-actor result cache, sensitive URL, log or telemetry payload. Code tests are not browser/device certification.

No Goal Plan, Goal completion, Follow-up, baseline, assessment, reporting, adherence, Family projection, reminder/notification or generic Wellness/EAV linkage was added. Weight Goal and Personal Weight Observation, richer measurements, taxonomy, wearables, sharing/export, scores and advice remain deferred/excluded. Successful delete removes active persistence/read payload; backup erasure, account erasure, receipt disposal and audit retention remain operational policy work.

## Verification evidence

| Check | Result |
| --- | --- |
| Focused `npm run test -- src/modules/exercises app/app/personal/wellness src/modules/meals src/components/app-shell/application-navigation.test.ts` | PASS, 13 files / 171 tests. Covers validation, actions/cursor, UI/lifecycle/composition/page and Meal regression. |
| Focused PostgreSQL Exercise + Meal integration tests | PASS, 2 files / 55 tests against local disposable PostgreSQL. Includes create/replay/edit/NOOP/delete/receipt, identical-content new nonce, SELF matrix/revocation, Bangkok midnight/process TZ, multi-page history/cursor anchors, same-nonce race, edit/edit, edit/delete, delete/delete races and transactional audit rollback. |
| `npm run prisma:generate` | PASS, Prisma Client 6.19.3. |
| `npx prisma validate` | PASS. |
| `npm run prisma:migrate:test` | PASS, forward Exercise migration applied to local disposable `demi_test`; no production DB. |
| Clean-database migration path | PASS, uniquely named temporary local disposable PostgreSQL database applied all 35 migrations; catalog count confirmed and only that temporary database dropped. |
| `npm run typecheck` | PASS. |
| `npm run lint` | PASS. |
| Full `npm run test` | PASS once after stable implementation, 208 files / 1,725 tests. |
| `node scripts/integration.mjs test` | PASS once after stable implementation, 30 files / 421 PostgreSQL tests; generated client, confirmed no pending migrations, applied suite against verified local integration DB. |
| Final duration parser refinement: targeted schema/action tests | PASS, 2 files / 79 tests after enforcing the 20-character raw bound and valid leading-zero conversion. |
| Final Exercise PostgreSQL focused integration | PASS, 28 tests after the final parser implementation. |
| Impeccable detector on `app/app/personal/wellness` | PASS, `[]`. |
| `git diff --check`, Thai/UTF-8 and final scope/status review | PASS; no mojibake found. |

An initial Exercise page test exposed an incomplete page mock after the page began loading both domains; the test was corrected to verify fail-closed behavior for either read. Focused and full suites then passed. The first clean-database tooling attempt could not find the Windows `docker` executable; it did not mutate a database. The configured WSL Docker runtime was used for successful clean migration verification.

The full unit and full PostgreSQL suites were not repeated after the final localized duration-string boundary refinement. The affected schema/action tests and the Exercise PostgreSQL integration suite were rerun and passed after that change.

Manual browser/mobile/device/keyboard/BFCache UAT is **NOT EXECUTED**. No production migration/deployment, backup-erasure, regulatory compliance or cryptographic device-memory-erasure claim is made.

## Phase boundary

- Phase 17H.1 — IMPLEMENTED / CLOSED; WELL-01 IMPLEMENTED.
- Phase 17H.2 — IMPLEMENTED / CLOSED; WELL-02 IMPLEMENTED.
- Phase 17H.3 — PLANNED / NOT IMPLEMENTED; WELL-03 OWNER DECISIONS CLOSED / TARGET-ONLY; its technical contract is required before runtime.
- Personal Weight Observation — DEFERRED / NOT APPROVED FOR FIRST 17H SCOPE.
- 17H.4A automated re-audit/UAT readiness remains future.

17G.4A, Family P17F-L04/L05, Q5 governance, parked 17E.2 consent, MED-02 and 17J statuses remain unchanged. No commit or push was made.

## Corrective patch — 2026-10-04

The Wellness client now owns one local private-authority generation shared by Meal and Exercise. A DENIED result from either domain invalidates that generation before scheduling the parent state replacement and removes the stored session seed (including both create nonces). Both workspaces are replaced by one safe re-authentication state. List callbacks and mutation action-state callbacks compare their captured shared generation before applying a result, so delayed sibling responses are discarded. The parent pagehide handler invalidates both domains; persisted pageshow requests a fresh reload. Strict Mode cleanup/setup suspends and resumes the boundary with a fresh generation.

Exercise duration text is trimmed and accepts only 1–10 ASCII digits. The raw transport limit remains 20 UTF-16 code units and the optional numeric value range remains 1..1,000,000. No Prisma schema or migration changed, and authorization, audit, cursor, or idempotency semantics were not changed.

Correction checks: focused privacy/duration tests **8 files / 112 tests PASS**; broader Meal/Exercise/UI regression **14 files / 177 tests PASS**; `npm run typecheck` PASS; `npm run lint` PASS. PostgreSQL integration was not rerun because this patch changes no persistence or database behavior.
