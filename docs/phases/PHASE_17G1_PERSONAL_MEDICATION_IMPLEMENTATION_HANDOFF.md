# Phase 17G.1 — Personal Medication Foundation Implementation Handoff

**17G.1 IMPLEMENTED / CLOSED — bounded MED-01 implementation and automated evidence.**

Date: 2026-10-02. Authoritative scope: [17G.1 contract](./PHASE_17G1_PERSONAL_MEDICATION_IMPLEMENTATION_CONTRACT.md), governed by [17G.0B owner closeout](./PHASE_17G0B_MEDICATION_DECISION_CLOSEOUT.md). Q30–Q53 remain CLOSED / OWNER APPROVED; historical decision documents are unchanged.

## Repository and file boundary

Starting and final HEAD: `4423da0caf9cdc6b4e6eda515e4156551c360c69`. Starting working tree clean. Final tree contains only this implementation, tests and handoff/status documentation; no commit/push/reset/rebase or unrelated user changes.

Modified:

- `prisma/schema.prisma`
- `src/components/app-shell/application-navigation.ts` and `.test.ts`
- `app/app/personal/patient-personal-home.tsx`
- `docs/CONTEXT.md`
- `docs/phases/PHASE_17G1_PERSONAL_MEDICATION_IMPLEMENTATION_CONTRACT.md` (current-status addendum only)
- `docs/phases/PHASE_17_UAT_BACKLOG.md` (current MED-01 status only)

Created:

- `prisma/migrations/20261002120000_personal_medication_foundation/migration.sql`
- `src/modules/medications/domain/personal-medication-definitions.ts`
- `src/modules/medications/policies/personal-medication-policy.ts` and `.test.ts`
- `src/modules/medications/schemas/personal-medication-schemas.ts` and `.test.ts`
- `src/modules/medications/services/personal-medication-access-service.ts`
- `src/modules/medications/services/personal-medication-query-service.ts`
- `src/modules/medications/services/personal-medication-service.ts`
- `src/modules/medications/services/personal-medication-services.test.ts`
- `src/modules/medications/transport/action-state.ts`, `server-actions.ts` and `server-actions.test.ts`
- `app/app/personal/medications/page.tsx`, `page.test.tsx`, `loading.tsx`, `personal-medication-workspace.tsx`, `personal-medication-workspace.test.tsx`, `personal-medication-controls.tsx`
- `tests/integration/personal-medication.integration.test.ts`
- This handoff.

No package, lockfile, environment, infrastructure, generated source, published migration, Family/work module or clinical domain change.

## Persistence and database names

Prisma model/table: `PersonalMedication`. Enum: `PersonalMedicationStatus` = ACTIVE / STOPPED. Required PatientProfile owner, name, nullable instruction, status, nullable stoppedAt, createdAt and updatedAt; UUID locator, TIMESTAMPTZ(3) instants, VARCHAR(200)/VARCHAR(2000) text. No uniqueness on text; no future schedule/reminder/provider columns.

Migration: `20261002120000_personal_medication_foundation` (new forward-only SQL).

Exact names:

- Primary key: `PersonalMedication_pkey`
- FK: `PersonalMedication_patientProfileId_fkey`
- CHECK: `PersonalMedication_status_stoppedAt_check`
- Function: `personal_medication_guard_update`
- BEFORE UPDATE trigger: `PersonalMedication_guard_update_trigger`
- Indexes: `PersonalMedication_active_order_idx`, `PersonalMedication_stopped_order_idx`

FK uses ON DELETE RESTRICT / ON UPDATE RESTRICT, consistent with protected PatientProfile-owned records and existing profile/person governance. No purge flow or medication cascade introduced. Ordinary DELETE is not prohibited by this lifecycle trigger; no Patient delete transport/UI exists.

CHECK enforces ACTIVE iff stoppedAt is null and STOPPED iff stoppedAt is non-null. Trigger rejects **all** ordinary UPDATEs of STOPPED rows, including no-op; rejects ACTIVE id/owner/createdAt changes; stop must preserve name/instruction using IS DISTINCT FROM comparisons. Service normal creation is ACTIVE/null.

Two composite indexes follow actual owner + status equality then ordering: createdAt DESC/id DESC for ACTIVE, stoppedAt DESC/id DESC for STOPPED. The closeout-tightened PostgreSQL EXPLAIN tests join the QUERY PLAN rows into readable plan text, assert the expected ordered index appears, and reject an explicit PostgreSQL Sort plan node with `/^\s*(?:->\s*)?Sort\b/m`. Those plan tests retain SET LOCAL enable_seqscan = off because tiny fixtures can otherwise prefer a sequential scan; this is ordered-index usability evidence, not a production performance benchmark or a guarantee of production planner index choice.

## Authorization, transactions and privacy

Every list/detail/mutation resolves exact persisted Person→User ACTIVE + persisted PATIENT role→exact PatientProfile. Initial focused SELF policy also requires a nonempty authenticated actor with PATIENT role. Missing profile, stale role, inactive account or inconsistent actor binding fails closed. No implicit provisioning or Hospital relationship requirement.

All resource reads and cursor lookups include the derived owner; cursor also includes requested status. Foreign/missing medication or cursor gets the same NotFoundError. UUID never grants authority. OSM/assigned OSM, Hospital MEMBER/OWNER, routine ADMIN and caregiver/appointment-sharing grants grant zero medication access. Independently eligible multi-role Patient, Patient ADMIN and Patient caregiver get own SELF only.

Serializable mutations reuse `runSerializableTransaction`: persisted eligibility, resource read, conditional mutation and `recordAuditEvent` share the same transaction client. Shared helper has at most two retries after the initial attempt for its known rolled-back P2034/P2002 errors; existing helper retry behavior is preserved, with no new framework. Application conflicts/forbidden/not-found/ambiguous infrastructure failures are not retried.

Update/stop guard id + patientProfileId + ACTIVE + persisted expected updatedAt; count must equal 1. Version equality is checked before writing. Next updatedAt = max(authoritative now, previous updatedAt + 1ms). Accepted no-op text edit advances version and audits once. Stop uses authoritative stoppedAt, preserves text, and is terminal; replay conflicts without another UPDATE/audit or changed terminal timestamps.

Create is intentionally non-idempotent; duplicates/new explicit submissions create separate lifecycles. UI prevents pending duplicate submission. Unknown create outcome blocks further submission until explicit reload/readback; no ambiguous automatic replay or nonce/deduplication scheme.

Audit actions: `personal_medication.created`, `.updated`, `.stopped`; resourceType `PersonalMedication`, opaque resource ID, authenticated actorUserId, metadata omitted/null. Exactly one committed audit per committed mutation; all three audit-failure injections prove rollback. No medication text/Patient PII logging, request serialization into metadata or per-read audit.

Only explicit DTO fields: id, medicationName, instructionText, status, stoppedAt, createdAt, updatedAt. Instants serialize as ISO strings. List pages contain at most 50 items, fetch at most 51, and expose an owner/status-scoped cursor for older records. Both ACTIVE/STOPPED >50 pagination and duplicate-date ID tie ordering verified.

## Text limits and normalization

Technical implementation limits, **not owner-approved clinical/product limits**, measured in JavaScript UTF-16 code units:

| Field | Raw input maximum | Normalized maximum | Rationale |
| --- | ---: | ---: | --- |
| medicationName | 1,000 | 200 | Focused single-line personal label; consistent with existing 200-character profile text bounds; raw allowance accommodates pasted outer/repeated whitespace while remaining bounded |
| instructionText | 4,000 | 2,000 | Same conservative normalized size as existing Appointment note / program reflection text; separately bounded raw whitespace allowance |

Name trims outer whitespace and collapses whitespace runs (including newlines) to a single space; rejects normalized empty; preserves Thai/Unicode/script/case. Instruction omission/null/blank → null; trims outer whitespace only, preserving meaningful interior whitespace/newlines. Omitted update instruction clears it. No parsing, identity normalization, transliteration, clinical interpretation or deduplication. Exact raw/normalized boundaries and surrogate-pair counting tested.

Strict Zod objects reject all unknown fields, including client ownership/status/source/timestamps. Only UUID medicationId and ISO expectedUpdatedAt are mutation transport metadata. Action transport retains unexpected form fields for rejection and rejects duplicate fields; framework `$ACTION_` transport metadata is ignored. Existing Next.js body-size boundary retained; field-specific bounds do not rely on its 6mb global limit.

## Personal UI and cache boundary

Only `/app/personal/medications`, Thai label **ยาของฉัน**, added to existing Patient Personal navigation and home shortcuts. Inline create, selected ACTIVE edit, stop confirmation, readonly STOPPED history/detail, loading/empty/pending/success/error/conflict and safe-not-found states. Existing PageHeader/Panel/Input/Button/Alert/StatusBadge and semantic tokens; mobile stacked layout, associated labels/errors, textual statuses, feedback focus and stop confirmation Escape/cancel focus restoration.

Provenance **รายการยาที่คุณบันทึก**; status **กำลังติดตาม** / **หยุดติดตามแล้ว**; stop **หยุดติดตามรายการนี้ใน DEMI** explicitly changes tracking only, not medication intake. Instruction is Patient-entered text, not DEMI medical advice. No clinical claims/delete/schedule/reminder/provider/caregiver controls.

Controlled drafts survive validation failures. Draft version remains the originally loaded token; a newer prop cannot silently substitute a new token. Conflict blocks resubmission and offers reload. Actor-specific opaque presentation key remounts client drafts across account changes; existing login/logout root revalidation also remains intact. No cross-user result store.

Page awaits `connection()` before protected actor/query resolution, catches safe errors and redirects unauthenticated/forbidden requests. Server-only protected modules, no result/authorization cache wrappers, no cacheComponents change. Action revalidation affects only the Personal medication path after commit. Build reports this route as `ƒ` dynamic. Installed Next.js 16.3 Server Actions/data-security/caching-without-cache-components/connection guides and current Prisma transaction docs inspected.

Impeccable source/static review found no material UI issue. Existing DESIGN.md and tokens remain unchanged: existing brand/surface palette, heading/body hierarchy, native controls, mobile stacked layout, semantic status/feedback. **No browser/screenshots/device UAT was executed; no visual/device PASS is claimed.**

## Executed verification

| Command/evidence | Result |
| --- | --- |
| `npx prisma validate` | PASS |
| `npm run prisma:generate` | PASS; Prisma Client 6.19.3 |
| `npm run test:db:status` | Verified healthy local disposable PostgreSQL 17 container, localhost port 55432; credentials not printed |
| `npm run prisma:migrate:test` | PASS, current 31-migration history advanced to 32 |
| Temporary local clean-history helper → `prisma migrate deploy` | PASS, all 32 migrations from empty separately created `demi_medication_clean_17g1` database; medication trigger verified; owned temporary database dropped and helper removed |
| `npm run test -- src/modules/medications/schemas/personal-medication-schemas.test.ts src/modules/medications/policies/personal-medication-policy.test.ts src/modules/medications/services/personal-medication-services.test.ts src/modules/medications/transport/server-actions.test.ts app/app/personal/medications/page.test.tsx app/app/personal/medications/personal-medication-workspace.test.tsx` | PASS, 6 files / 61 tests; later policy/page corrections also PASS in focused 13-test run |
| `npx vitest run --config vitest.integration.config.mts tests/integration/personal-medication.integration.test.ts` | PASS, 15 tests, with verified local `.env.integration` loaded and all three DB URLs equal; latest run includes Patient caregiver own-only regression |
| `npm run lint` | PASS on stable runtime/test source; subsequent navigation-test-only edit checked with `npx eslint src/components/app-shell/application-navigation.test.ts` = PASS |
| `npm run typecheck` | PASS on stable runtime and focused tests; production build TypeScript also PASS after navigation expectation correction |
| Complete diff/source review + `git diff --check` | PASS; authorization/owner scope/trigger/audit privacy/cache/Thai/no scope creep reviewed before broad runs; final documentation/encoding review repeated without broad rebuild |
| **One** `npm run test` | 186 files: 185 PASS / 1 FAIL; 1,345 tests PASS / 1 FAIL. Sole failure was existing exact Personal navigation expectation omitting approved new medication entry. Isolated failure reproduced, expectation updated to requested behavior, and OSM/Hospital medication-navigation exclusion asserted. No production code changed after this run. |
| `npm run test -- src/components/app-shell/application-navigation.test.ts app/app/personal/personal-pages.test.ts` | PASS, 2 files / 20 tests, including corrected sole broad-run failure. At the initial implementation closeout, full unit suite was not rerun after this isolated test-only correction, per staged-verification policy; no known unresolved unit failure. Final broad confirmation is recorded in the review-closeout addendum below. |
| **One** `npm run test:integration` | PASS, 28 files / 328 tests, including PersonalMedication |
| **One** `npm run build` | PASS, Next.js 16.3.0 production compile, TypeScript and page generation; medications route dynamic |

Iteration failures were resolved: schema-union TypeScript narrowing; incomplete assigned-OSM fixture; UI escaping assertion initially matching React's own legitimate form-replay script; navigation expectation described above. No pre-existing/resource failure encountered. No checks were weakened; no full-suite loop or repeated production build.

## Review-closeout cleanup — 2026-10-02

Starting and final HEAD for this cleanup: `68f4e346e9401f5b52f84571c41c7d940bc95494`; starting working tree clean. Only `docs/CONTEXT.md`, this handoff and `tests/integration/personal-medication.integration.test.ts` changed; no commit/push in this cleanup.

The current Open Requirements medication statement now matches the current-status addendum: MED-01 / 17G.1 IMPLEMENTED / CLOSED, bounded Patient SELF Personal Medication only, linked implementation evidence, no inferred browser/device-UAT PASS. Removed obsolete CLEARED / NOT IMPLEMENTED and documentation-only/no-runtime wording; owner decisions, historical phase sections and future gates remain unchanged. Remaining NOT IMPLEMENTED references were inspected: medication references concern only future 17G.2/17G.3; older phase-specific history and deferred notification wording do not declare 17G.1 unimplemented.

The PostgreSQL test now checks joined plan text for both the expected ordered index and absence of an explicit Sort node, replacing the unreliable JSON-prefix assertion. Query SQL, SET LOCAL enable_seqscan = off, indexes, schema, migration and runtime behavior are unchanged.

| Final cleanup command/evidence | Actual result |
| --- | --- |
| `npx vitest run --config vitest.integration.config.mts tests/integration/personal-medication.integration.test.ts` | PASS: 1 file / 15 tests; 0 failed, including ACTIVE/STOPPED ordered-index and explicit no-Sort-node assertions. Existing disposable local integration environment loaded; DATABASE_URL = DIRECT_URL = DEMI_TEST_DATABASE_URL; credentials suppressed. |
| **One final complete** `npm run test` | PASS: 186 files / 1,346 tests; 0 failed. Previously missing final broad unit confirmation is now satisfied. Initial broad-run navigation failure and its focused correction remain recorded above. |
| `git diff --check` and final diff/UTF-8/status review | PASS; changes restricted to the two documentation files and integration assertion; Thai preserved, no unrelated formatting or scope expansion. |

Migration deployment confirmed externally by the owner; this cleanup ran no migration/deployment verification command. No full integration suite, production build, lint or typecheck was repeated: only documentation and a test assertion changed, so existing runtime/static/build evidence remains valid. No new regression or unresolved cleanup finding discovered. Browser/device UAT remains unexecuted; no PASS inferred. **Phase 17G.1 remains IMPLEMENTED / CLOSED.**

## Acceptance coverage and remaining gates

| Contract criteria | Implementation / evidence |
| --- | --- |
| 1–8 | Persisted exact SELF; strict normalized raw-bounded schemas; Unicode/nullable semantics; duplicate ACTIVE creation |
| 9–11 | Own ACTIVE full edit, explicit stop, terminal service + DB lifecycle |
| 12–21 | Source/UI/schema boundary review: no delete/schedule/adherence/reminder/delegated/provider/Goal coupling; role deny/own-only matrix |
| 22–28 | Safe not-found, optimistic predicate/version, PostgreSQL defenses, atomic private audits/no read audit, request-time uncached authorization |
| 29–30 | Responsive existing UI primitives, keyboard/focus/labels/states, exact Thai tracking wording; source/static evidence only |
| 31–32 | Actual persisted negative role/grant/foreign tests and four PostgreSQL races; terminal replay preserved |
| 33–34 | Focused/lint/typecheck, honest broad unit result + isolated correction, full integration, clean/current migrations, Prisma and build evidence above |
| 35 | MED-02 authority remains excluded/gated |
| 36–37 | Direct PostgreSQL invalid-state/terminal/identity/text defenses; all three audit failures rollback |
| 38–39 | Transport/component/page states, strict validation, status text/wording exclusions and no non-goal controls |
| 40 | Minimal DTO, owner/status-scoped deterministic cursors and reachable older >50 history |
| 41 | Non-idempotent explicit create, pending/unknown-outcome block, shared bounded rollback retries with one committed audit |
| 42 | Scoped diff/UTF-8 review, clean starting tree preserved, no published migration edit/unused layer/debug artifact |

**Exact status:** 17G.0 CLOSED; Q30–Q53 CLOSED / OWNER APPROVED; **17G.1 IMPLEMENTED / CLOSED** for this bounded implementation and automated closeout. No deployment was performed by this agent during implementation. Migration deployment confirmed externally by the owner during review closeout; no deployment command output is attributed to this agent. Real-browser/device review remains separate and unexecuted.

Unchanged: **MED-02 REQUIREMENT-GATED; 17G.2 NOT IMPLEMENTED; 17G.3 NOT IMPLEMENTED; 17J future; P17F-L04 OPEN / deferred; Q5 real delegated-data use GOVERNANCE BLOCKED.** No medical/provider authority or Family medication access is inferred from this closeout.
