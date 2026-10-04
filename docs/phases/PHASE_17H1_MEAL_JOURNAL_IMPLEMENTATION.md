# Phase 17H.1 — Personal Meal Journal Implementation

## CURRENT-status addendum — Phase 17H.3 implementation (2026-10-04)

[Weight Goal implementation handoff](./PHASE_17H3_WEIGHT_GOAL_IMPLEMENTATION.md): **Phase 17H.3 — IMPLEMENTED / CLOSED; WELL-03 — IMPLEMENTED / TARGET-ONLY.** The target-only runtime, migration, SELF authorization, shared Wellness privacy integration, and automated evidence are complete; Observation remains deferred.

Full unit 214 files / 1,794 tests and PostgreSQL integration 31 files / 445 tests PASS, including fresh disposable migration through all 36 migrations. Prisma generate/validate, typecheck, lint and UI detector PASS. Manual browser/device UAT and production deployment remain unperformed; 17H.4A is next. Other status gates are unchanged.

## Historical-status addendum — Phase 17H.3 contract clearance (2026-10-04)

[Weight Goal technical contract](./PHASE_17H3_WEIGHT_GOAL_IMPLEMENTATION_CONTRACT.md): **Phase 17H.3 - CLEARED FOR IMPLEMENTATION / NOT IMPLEMENTED; WELL-03 - CLEARED FOR IMPLEMENTATION / TARGET-ONLY.** Patient-selected kg target only; 0..1 unique PatientProfile owner; canonical decimal string, scale 3, 0.001..1,000,000 structural bounds, Decimal/NUMERIC(10,3). Corrected Q71 permits unchanged naturally passed targetDate during weight edits; create/changed date >= Bangkok today, explicit clear allowed, no date lifecycle. Dedicated payload-free terminal create receipt consumes both created and occupied-goal rejected intents; intendedWeightGoalId survives removal, and ReadCommitted owner-row FOR UPDATE serialization prevents loser-receipt rollback races. Definitive create rejection requires receipt commit; aborted/ambiguous transactions stay UNCONFIRMED. expectedUpdatedAt and minimized atomic mutation audit (none for rejected create); exact persisted ACTIVE Patient SELF. Future Weight joins the existing shared Wellness private-authority generation and three anchored sections at `/app/personal/wellness`. No Weight runtime delivered.

**17H.1 IMPLEMENTED / CLOSED; WELL-01 IMPLEMENTED. 17H.2 IMPLEMENTED / CLOSED; WELL-02 IMPLEMENTED. Personal Weight Observation DEFERRED / NOT APPROVED FOR FIRST 17H SCOPE.** Q69-Q74 and all approved exclusions preserved; no current-weight source/progress/BMI/advice/history. 17H.4A re-audit/UAT readiness remains future. 17G.4A, Family P17F-L04/L05, Q5 governance, parked 17E.2 consent, MED-02 and 17J remain unchanged. Earlier dated planned/precision-pending statements are historical and superseded by this contract; prior runtime/test evidence is not rerun or extended here.

## Historical-status addendum — Phase 17H.2 (2026-10-04)

[Exercise implementation handoff](./PHASE_17H2_EXERCISE_JOURNAL_IMPLEMENTATION.md): **Phase 17H.2 IMPLEMENTED / CLOSED; WELL-02 IMPLEMENTED**. Runtime, dedicated schema/migration, exact persisted Patient SELF access, consumed-create receipt, optimistic concurrency, minimized audit, independent Wellness section and automated evidence are recorded there. Duration remains optional, INTEGER 1..1,000,000 structural bound; note optional; no Goal/care linkage. Full unit 208/1,725 and PostgreSQL integration 30/421 passed, along with focused regressions, Prisma generate/validation/migrations, lint/typecheck. Manual browser/device UAT and production deployment remain unclaimed.

**17H.1 IMPLEMENTED / CLOSED; WELL-01 IMPLEMENTED** unchanged. **17H.3 PLANNED / NOT IMPLEMENTED; WELL-03 OWNER DECISIONS CLOSED / TARGET-ONLY**; its technical contract remains required before runtime. **Personal Weight Observation DEFERRED / NOT APPROVED FOR FIRST 17H SCOPE.** 17H.4A re-audit/UAT readiness remains future; 17G.4A, Family P17F-L04/L05, Q5, parked 17E.2 consent, MED-02 and 17J remain unchanged.
## Historical status — 2026-10-03 (Asia/Bangkok)

**Phase 17H.1 IMPLEMENTED / CLOSED; WELL-01 IMPLEMENTED** for the bounded runtime and automated evidence below. [Implementation contract](./PHASE_17H1_MEAL_JOURNAL_IMPLEMENTATION_CONTRACT.md), [owner closeout](./PHASE_17H0B_WELLNESS_DECISION_CLOSEOUT.md) and corrected Q54–Q83 **CLOSED / OWNER APPROVED — Option A** remain authoritative. No browser/device UAT or production deployment claim.

## Baseline and changed boundary

Starting/final HEAD: `83e3e9741fd815491826bf42c8d54def6a97ab91`, matching the requested baseline. Initial working tree clean, no newer commits to reconcile. No commit/push/reset/rebase, unrelated work or historical migration edits.

Added `src/modules/meals/` domain, schemas, Meal SELF policy/access service, mutation/query services, dedicated signed cursor and bounded transport/actions; `app/app/personal/wellness/` page, inline editor/delete confirmation/current history, loading/error states and tests; PostgreSQL integration coverage and this handoff. Modified only schema, Personal navigation and its tests, and current phase/status documentation. Personal home remains unchanged: the existing shell navigation is the destination source; no duplicate shortcut source was added.

Meal = one Patient-reported consumed meal/snack occasion. Personal wellness data != clinical/program measurement != Goal Plan target. Required category/date; optional escaped plain-text description, raw ≤2,000 and normalized ≤1,000 UTF-16 units, trim exterior whitespace, preserve interior/Thai/Unicode, empty→null. Exactly BREAKFAST / LUNCH / DINNER / SNACK; Patient selects, no OTHER/time inference. Intentional duplicate date/category/content permitted with distinct create nonces.

## Persistence and migration

Correction (2026-10-04): consumed create requests whose Meal no longer exists return a distinct safe outcome directing explicit “เริ่มบันทึกใหม่”; same nonce cannot recreate, and only that user action generates a fresh nonce. Transient create conflicts/ambiguous outcomes retain same-request retry. The date input retains rendered today as its initial default but has no static maximum; current server-side Asia/Bangkok past/today validation remains authoritative across midnight. No schema, authorization, audit, cursor or phase-status change.

Forward migration: `20261003140000_personal_meal_journal`.

- `PersonalMealCategory`: four-value PostgreSQL enum.
- `PersonalMealEntry`: UUID id, exact immutable-in-service PatientProfile owner FK (Restrict delete/update), category, PostgreSQL DATE occurredOn, nullable VARCHAR(1000) description, TIMESTAMPTZ(3) createdAt/updatedAt. History index `PersonalMealEntry_history_order_idx`: owner, occurredOn DESC, createdAt DESC, id DESC. Calendar range check 0001..9999 and no nonempty-space payload. Application schema enforces UTF-16 limits and full whitespace normalization; PostgreSQL VARCHAR length is a character structural bound, not the UTF-16 validator.
- `PersonalMealCreateReceipt`: owner FK, UUID submissionNonce, unique UUID mealEntryId scalar, createdAt. Composite owner/nonce primary key; **no FK to Meal**. No Meal payload/hash/category/date and no TTL/pruning. Receipt survives physical Meal deletion. No date/category/content uniqueness, status/revision/archive/restore, future domain tables or speculative trigger.

DATE adapters strictly round-trip YYYY-MM-DD calendar components. Asia/Bangkok Gregorian today is explicit; past/today accepted, future denied for create/edit. Prisma carrier is confined to persistence, not presented as consumption time. UI displays civil date directly, with no Buddhist-year reinterpretation or clock-time field. Instants are persistence/version metadata only.

## Authorization, atomic mutation and concurrency

Every list/detail/create/edit/delete/replay/continuation re-resolves **ACTIVE User → persisted PATIENT role → exact Person → exact PatientProfile** within a Serializable transaction. Meal owns its policy/access boundary; no medication policy calls or Work scope union. Server-derived owner always scopes resource/receipt/anchor queries. IDs/nonces/cursors are locators only. Foreign and missing resource/anchor share safe not-found behavior.

Database tests cover own access, cross-Patient read/edit/delete, inactive/suspended accounts, removed role, invalid binding/missing profile, ADMIN/OSM/Hospital roles, actual Hospital MEMBER/OWNER memberships, actual assigned OSM, actual caregiver relationship + active appointment grant, and eligible PATIENT + Work own-only access. Every operation/replay/continuation is denied after persisted SELF eligibility loss.

Create uses one random opaque nonce per intent; same nonce retries. Entry + owner-bound receipt + `personal_meal.created` audit commit atomically. Consumed nonce returns **REPLAY** with current own record, even after edit, ignoring replacement values; after physical deletion it conflicts and cannot recreate. Distinct nonce plus identical content creates another valid event. Network ambiguity retains nonce/draft; explicit new intent generates another nonce. No Appointment request hash/content dedup/global idempotency subsystem.

All transactions use **retryLimit=0**. P2002/P2034 maps to safe conflict; no hidden retry/backoff loop. Fresh same-nonce request reconciles the winner. Concurrency tests synchronize two real PostgreSQL transaction snapshots before guarded writes; exactly one overlapping create/edit/edit-delete/delete-delete winner, one business audit, safe loser and no resurrection.

Edit/delete require expectedUpdatedAt, compare current version before NOOP, and conditional id + derived owner + exact updatedAt predicate/count=1. Actual edit advances `max(now, previous+1ms)`; fresh identical normalized edit returns NOOP without version/audit change; stale identical edit conflicts. No upsert. Delete physically removes active payload and emits one audit while preserving technical receipt. Injected transactional audit failure rolls back create/receipt, edit/version and deletion; rollback nonce can be used safely later.

## Reads, privacy, audit and Personal UX

Minimal DTO: id/category/occurredOn/description/createdAt/updatedAt. History is current surviving events, fixed 50/fetch51, order occurredOn DESC → createdAt DESC → id DESC; 103-row test proves three-page reachability. Meal-specific canonical HMAC cursor uses existing IDENTITY_HASH_SECRET, domain/sort/page/no-filter separation, user/person and owner binding, date/createdAt/id/updatedAt anchor, ≤2,048 chars/1,024 decoded bytes and timing-safe MAC verification. Fresh scoped anchor check rejects changed/deleted/foreign/tampered positions safely. No description/category in cursor; cursors stay in private Server Action state, not URLs.

`/app/personal/wellness` exposes สุขภาพ · อาหาร via existing Personal shell navigation, never Work-only navigation. Required empty/loading/create/edit/delete-confirmation/saving/readback/validation/conflict/denied/pagination states, native mobile form controls, associated labels/errors, focus/error announcements and cancel restoration use existing PageHeader/Panel/Alert/Button/Input/Select/tokens. Description visibly optional; source “ข้อมูลที่คุณบันทึก”; no clinical truth/intake/adherence/score claim or fake Exercise/Weight action.

Page uses installed Next.js `connection()` request-time rendering + fresh authenticated reads; no result cache/static content/global journal state. Installed Next server dynamic-response source uses private/no-cache/no-store cache control. No blanket route cache config or new env. Actions bound strict user FormData before authentication, allow only contract fields, reject duplicate/File/authority/oversize values (16 KiB and tighter field bounds), ignore only framework `$ACTION_` metadata, and sanitize errors without submitted text/SQL/stack details. No ordinary read audit or description in URL/log/telemetry/localStorage/IndexedDB.

Audit uses transaction client, actor/action/opaque resource/type/system time with metadata omitted: `personal_meal.created/updated/deleted`, resourceType PersonalMealEntry. Replay/NOOP/failed/read operations produce no extra success audit. No description/category/date/PII/hash retained in audit or receipt.

Actor-derived opaque page key remounts drafts after fresh account change. Pagehide purges parent payload/drafts, BFCache pageshow requests full reload; inactive/generation guards drop delayed action/list results after leaving or denied authority. Strict Mode setup/cleanup/setup and delayed mutation after pagehide/list-denial are covered by callback harness tests. **These are code-level evidence, not actual browser/BFCache/device certification.** Impeccable finish reviewer resolved two lifecycle findings; detector returned `[]`; documentation review confirms incumbent design context remains unchanged. Broader pre-existing PRODUCT/UI Foundation navigation prose drift is out of scope.

## Verification actually executed

| Check | Result |
| --- | --- |
| `npm run test:db:up` | Existing local disposable integration PostgreSQL healthy. No production connection or reset. |
| `npm run prisma:generate` | PASS, Prisma client 6.19.3 generated into ignored node_modules. |
| `npm run prisma:migrate:test` | PASS, new forward migration applied to local demi_test at 127.0.0.1:55432. |
| Existing integration migrate script against separately created empty local `demi_meal_migrationcheck_20261003` | PASS, all **34 migrations** applied and catalog count confirmed; only this temporary database dropped afterwards. Existing integration database was not reset. |
| `npm run test -- src/modules/meals app/app/personal/wellness src/components/app-shell/application-navigation.test.ts` | PASS, **7 files / 67 tests**. |
| `node --env-file=.env.integration node_modules/vitest/vitest.mjs run --config vitest.integration.config.mts tests/integration/personal-meal.integration.test.ts` | PASS, **1 file / 26 tests**, actual PostgreSQL. |
| `npm run typecheck` | PASS after correcting update-union narrowing. |
| `npm run lint` | PASS after moving JSX outside page try/catch. No lint:strict/architecture:check script exists in package.json; no invented command. Module import/dependency boundaries reviewed directly. |
| `npm run test` | PASS once at stable state, **202 files / 1,621 tests**, 31.07s. |
| `node --env-file=.env.integration node_modules/vitest/vitest.mjs run --config vitest.integration.config.mts` | PASS once at stable state, **29 files / 392 tests**, 91.96s. |
| Impeccable `detect --json app/app/personal/wellness` | `[]`; source/callback reviewer corrections resolved, no visual certification. |
| Final focused documentation/git/UTF-8/link/scope checks | PASS; no unexpected files, runtime future-scope coupling, sensitive logging or corrupted Thai found. |

Initial focused failures were new test-fixture defects (role parameterization, rejection handling and Hospital/Family constraint values) and the navigation expectation change; fixed using existing invariants. Initial lint/typecheck defects were fixed without weakening rules. No remaining failed check. Full suites were each run once; no broad-suite edit loop. Subsequent documentation/line-ending-only changes do not invalidate those code results.

No Next build/dev server was needed or run. Manual browser/mobile/device/BFCache/keyboard UAT, live focus behavior, computed layout/contrast, deployment/production migration remain **NOT EXECUTED**. No regulatory/privacy compliance or immediate backup/browser-memory erasure claim.

## Operational follow-ups and final phase boundary

Successful delete removes active persistence/read payload only. Backup retention/restore handling, account-erasure/receipt disposal, audit access/retention and deployment-level privacy/abuse protections remain operational follow-ups; no invented legal duration or synthetic/demo blocker. Receipt pruning would permit old create replay, so none is implemented. History remains live, not snapshot/export; stale anchors require refresh/review. Browser/device UAT and 17H.4A re-audit remain later evidence.

17H.0 CLOSED / DECISIONS CLOSED; Q54–Q83 CLOSED / OWNER APPROVED — A; 17H.0B CLOSED / CONTRACT COMPLETE; **17H.1 IMPLEMENTED / CLOSED; WELL-01 IMPLEMENTED**. WELL-02 DECISIONS CLOSED / PLANNED 17H.2 / NOT IMPLEMENTED (duration OPTIONAL); WELL-03 DECISIONS CLOSED / TARGET-ONLY PLANNED 17H.3 / NOT IMPLEMENTED. Personal Weight Observation DEFERRED / NOT APPROVED FOR FIRST 17H SCOPE. Q71 corrected unchanged-past-date edit exception preserved; passing targetDate never creates automatic progress/state.

No Exercise/Weight runtime, Observation, BMI, nutrition/photos/scoring/advice, Goal Plan/care synchronization, provider/Family visibility, share/export/API, reporting/analytics, reminder source/delivery or generic wellness framework. 17G.4A PASS / AUTOMATED RE-AUDIT COMPLETE, Family P17F-L04/L05, Q5 governance, parked 17E.2 consent, MED-02 and 17J delivery/system-authority gates unchanged.
