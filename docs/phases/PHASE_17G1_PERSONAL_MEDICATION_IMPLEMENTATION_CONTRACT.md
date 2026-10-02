# Phase 17G.1 — Personal Medication Implementation Contract

**CLEARED FOR IMPLEMENTATION / NOT IMPLEMENTED**

## 1. Baseline, governing decisions and handoff

Repository: bait0ngxaxa/demi. Actual starting HEAD: `9e00f065ca61d669b721d41b8df41d3050c386fb` — `docs(phase-17g0): tighten medication recommendations`; matches expected HEAD; initial working tree clean. Current source is authoritative; AGENTS.md read before edits. Documentation/contract only: no runtime changes.

Governing decisions: [corrected Q30–Q53 package](./PHASE_17G0_MEDICATION_DECISION_PACK.md), now **CLOSED / OWNER APPROVED** through [17G.0B closeout](./PHASE_17G0B_MEDICATION_DECISION_CLOSEOUT.md). Earlier OPEN recommendations are historical. Technical choices below follow approved semantics; technical limits are not customer-approved medical/product numbers.

Next-task handoff: reread current source/AGENTS.md, implement only this bounded MED-01 contract, record chosen text limits and actual validation evidence. Material new clinical/sharing/schedule requirements need a separate contract. Do not infer scope from old navigation wording.

## 2. Exact scope

Patient SELF → Personal → **ยาของฉัน** → list own items → create → view own item → edit own ACTIVE item → explicitly stop own ACTIVE item → view STOPPED history/items. STOPPED cannot reactivate; tracking again creates a new row/lifecycle. Patient-entered data consists solely of medicationName and optional instructionText; status and timestamps are system-controlled.

MED-01 is Patient-maintained personal medication tracking: not prescription, clinically reconciled, Hospital verified, physician approved or clinical source of truth. MED-02 is clinical/provider medication and remains **REQUIREMENT-GATED**. Never reinterpret historical MED-01 rows as clinical records. Future coexistence requires explicit provenance/source semantics and a separate clinical authority boundary.

## 3. Non-goals and additive evolution

No structured dose, dose unit, drug strength, route, dosage form, structured SIG, schedule, recurrence, meal timing enum, reminder occurrence, notification delivery, adherence, prescription, medication order, reconciliation, prescriber, Hospital/OSM access, caregiver access, provider verification, drug catalog/master, external terminology, pharmacy/dispensing, administration, external prescription import, authoritative clinical medication list, refill, allergy/interaction checking, dose/treatment recommendations, Goal Plan integration, export, PDF/CSV, print, QR/share/public link, external API sharing, STOPPED reactivation or Patient hard delete.

Stable bounded semantics now + clean boundaries + additive expansion. PersonalMedication may later gain a separate MedicationSchedule, approved reminder source or catalog mapping. Do not prebuild unused columns/abstractions or a generic medication, ACL, workflow, terminology or notification framework. MED-02 remains a separate clinical authority domain.

## 4. Actor eligibility and authorization matrix

Every query/mutation requires authenticated current ACTIVE User, current PATIENT role, exact User↔Person binding and exact PatientProfile belonging to that Person. Missing/inconsistent binding/profile fails closed; no implicit profile provisioning. Hospital relationship is not required.

| Actor / resource | List/detail/create/update/stop |
| --- | --- |
| Eligible Patient SELF → own medication | ALLOW; update/stop require ACTIVE |
| Patient SELF → another Patient | DENY |
| OSM | DENY |
| Assigned OSM | DENY |
| Hospital MEMBER | DENY |
| Hospital OWNER | DENY |
| Platform ADMIN routine operation | DENY |
| Family caregiver | DENY |
| Caregiver with family-appointment-read-v1 | DENY |
| PATIENT + OSM / HOSPITAL / Family caregiver | Own only through SELF; work/delegated roles do not widen scope |

An ADMIN who also independently satisfies Patient SELF eligibility likewise receives no ADMIN bypass and can access only own items through SELF. Resource ID is a locator only, never authority. Guessed UUID, profession, assignment, Hospital membership or Family grant never authorizes medication. Existing Patient SELF read policy is evidence of identity conventions, not an implicit medication write grant; use a focused medication SELF policy, no generic role fallback.

## 5. Owner derivation

Authenticated User → exact Person → exact PatientProfile → PersonalMedication.patientProfileId. Patient/Profile-level personal data, not Hospital/PHR/OSM/Family/Program/GoalPlan-specific.

Follow persisted binding conditions in [Patient SELF query service](../../src/modules/patient-self/services/patient-self-query-service.ts): exact actor.personId, exact actor.userId, ACTIVE persisted User and persisted PATIENT role; internally select exact PatientProfile ID. Recheck current identity eligibility inside mutation transactions. Do not require Hospital relationship navigation or return its broader projection.

Reject client-selected PatientProfile/Person/User owner, Hospital, PHR, creator/source. Never transfer owner in normal workflow. Server actor is trusted only after current persisted eligibility is checked.

## 6. Conceptual model and projection

One model concept only: **PersonalMedication**; final Prisma naming may follow conventions while preserving semantics.

| Field | Meaning |
| --- | --- |
| id | Opaque UUID locator |
| patientProfileId | Required exact PatientProfile FK; internal owner |
| medicationName | Required bounded human text |
| instructionText | Nullable bounded human text |
| status | ACTIVE / STOPPED only |
| stoppedAt | Nullable authoritative lifecycle instant |
| createdAt | System creation instant, immutable |
| updatedAt | System mutation/version instant |

No source/provenance enum; source implicit from Patient SELF/audit. No hospitalId, patientHospitalRelationshipId, prescriberId, osmId, caregiverId, drugCode, doseAmount, doseUnit, dosageForm, route, schedule, nextReminderAt, adherence or prescription fields. No medication-name or name+instruction uniqueness/merge/replacement.

Explicit Patient DTO select: id, medicationName, instructionText, status, stoppedAt, createdAt, updatedAt only. ID is routing metadata; updatedAt is also the concurrency token. No PatientProfile/Person/User/audit IDs, unrelated profile/PII, Hospital/Family data or clinical facts. Serialize instants consistently with existing transport; these are not schedule time-of-day semantics.

## 7. Lifecycle and database invariants

Only ACTIVE→STOPPED. ACTIVE means currently tracked in DEMI; STOPPED means tracking ended. No PAUSED, REOPENED, ARCHIVED→ACTIVE, restart or automatic reactivation. Tracking same name again creates a new row; duplicates valid.

Selected defense in depth:

1. Required valid PatientProfile FK and status enum/check restricted to ACTIVE/STOPPED.
2. CHECK enforcing ACTIVE with stoppedAt IS NULL and STOPPED with stoppedAt IS NOT NULL, in both directions.
3. Forward-only BEFORE UPDATE trigger: OLD.status = STOPPED rejects every ordinary UPDATE, including no-op updates. Terminal state/name/instruction/owner/timestamps cannot be changed by trusted/direct ordinary writes.
4. Trigger also rejects id/owner/createdAt changes on ACTIVE rows; ACTIVE→STOPPED preserves medicationName/instructionText, matching the separate stop action.
5. Normal create inserts ACTIVE with stoppedAt null. PostgreSQL tests exercise invalid state combinations and terminal UPDATE directly.

A CHECK cannot inspect OLD status; service-only terminal enforcement leaves direct writes mutable. Therefore CHECK + terminal trigger are required by this contract, rather than leaving terminal defense optional. No trigger prohibition on DELETE or new retention mandate: administrative/legal deletion is separate. Assess FK delete behavior against existing PatientProfile governance during implementation; do not create a new profile-purge flow. Database integrity defenses do not replace application authorization or require a generic ACL/RLS framework.

No Patient-facing delete action/button/DELETE route/cascading purge. Normal removal is stop. Do not edit published migrations; record exact SQL mapping/constraint names in implementation.

## 8. Normalization and technical validation

Evidence: [Appointment schemas](../../src/modules/appointments/schemas/appointment-schemas.ts) use strict objects, bounded trimmed text, ISO expectedUpdatedAt; [Service One schemas](../../src/modules/patient-program/schemas/patient-program-service-one-schemas.ts) trim optional text and convert blank→null. Examples use 500 for location detail and 2,000 for note/reflection, but no directly comparable medication-name convention was found.

**Exact medicationName/instructionText maxima are technical decisions to select and record during 17G.1 implementation**, before finalizing schemas/UI/tests. Do not claim owner approval of arbitrary numbers. Choose conservative bounded values and explicit consistent character-count semantics. Bound raw input/request size before normalization/parsing too: the current global 6mb Server Action limit alone is insufficient for medication fields.

- Name: trim outer whitespace; collapse repeated whitespace runs to one space for the single-line name, per corrected Q33 convention; reject normalized empty. Preserve Thai/Unicode, case/script. No lowercase identity, transliteration, semantic parsing or uniqueness key.
- Instruction: optional/nullable; trim outer whitespace; omitted/null/blank→null per project convention. Preserve meaningful interior text/newlines/whitespace. No dose extraction or meal ontology.
- Strict server schemas reject unknown/authority fields. medicationId and expectedUpdatedAt are transport metadata, not additional Patient-entered medication fields; validate UUID/ISO timestamp.
- Render safely as text. Client validation is UX only; server authoritative. Safe bounded errors, no raw SQL/internal paths/stack traces or sensitive text logging.

## 9. Create contract

Business input only medicationName and optional instructionText. Resolve current SELF in transaction; derive PatientProfile; normalize/validate; insert ACTIVE, stoppedAt null and system timestamps; record personal_medication.created with transaction client; return bounded DTO after commit.

Reject patientProfileId, userId, personId, status, stoppedAt, createdBy, source, Hospital/PHR ID, timestamps and unknown fields.

Create retry semantics: non-idempotent; each successfully committed intentional submission creates a new lifecycle and duplicates are valid. Disable duplicate pending submit; do not automatically replay after an ambiguous network result. Refresh own list before offering an explicit new submission. No name deduplication or medication-specific nonce framework. Only bounded DB retries for confirmed rolled-back transactions may rerun create; one committed create has one audit.

## 10. Update contract

Full current-value replacement of name/instruction on own ACTIVE item. Input: medicationId, expectedUpdatedAt, medicationName, optional instructionText; omission clears instruction to null, consistently with create. No owner/status/stoppedAt/createdAt/audit identity edits.

Resolve SELF, fetch owner-scoped row, require ACTIVE and exact version. Conditional updateMany predicate includes id + patientProfileId + ACTIVE + expected persisted updatedAt; count must equal 1, otherwise safe ConflictError. Follow Appointment nextUpdatedAt: max(current updatedAt + 1ms, authoritative now). Do not import Appointment business logic just to share a small timestamp convention.

Record personal_medication.updated atomically and return scoped DTO. Accepted no-op text update advances version/audits once; stale replay conflicts. Foreign/missing uses identical safe NotFoundError before revealing status/version. STOPPED update denied with no mutation/success audit.

## 11. Stop contract

Separate explicit action accepts medicationId + expectedUpdatedAt only. Resolve current SELF in transaction; scoped ACTIVE row with matching version; guarded updateMany transitions ACTIVE→STOPPED, sets stoppedAt from authoritative server/database now, advances updatedAt monotonically and preserves other fields.

Record personal_medication.stopped atomically. Repeated stop, including replay after prior success, returns safe ConflictError, performs no UPDATE, preserves terminal timestamps and adds no success audit; follows [Appointment terminal-transition convention](../../src/modules/appointments/services/appointment-service.ts). Refresh own item after conflict. No client stoppedAt or clinician discontinuation language.

## 12. Transaction and concurrency

Use Prisma interactive Serializable transactions consistent with Appointment; current ownership check, state mutation and recordAuditEvent share the same transaction client. Either mutation+audit both commit or neither commits. Never pass root client to audit from inside transaction.

Exact optimistic mechanism: expectedUpdatedAt ISO equals persisted updatedAt; conditional mutation includes owner/id/ACTIVE/version; count = 1; successful updatedAt increases at least 1ms. Client token is an expected version, not authoritative time. No new medication-specific version field.

Update/update: one winner; stale loser conflicts. Update/stop: stop winner prevents later edit; update winner makes stop's old token stale until refreshed. Stop/update behaves symmetrically. Stop/stop: at most one transition/audit. Foreign actors never mutate. Actual PostgreSQL evidence required, not only Prisma mocks.

Retry only confirmed rollback/serialization failures, with bounded retry count and backoff/jitter if a retry loop is used. No retries of business conflicts/authorization errors/ambiguous committed creates. Exhaustion yields safe conflict/infrastructure error, never fake success.

## 13. Queries, ordering and projection

Every query derives exact current SELF. Present ACTIVE current items and STOPPED history distinctly. Choose bounded cursor pages of **50 items per requested status**, matching existing bounded-history scale while allowing older history to remain reachable. Fetch at most 51 for hasMore; no unbounded preload or permanent silent truncation.

ACTIVE: createdAt DESC, id DESC. STOPPED: stoppedAt DESC, id DESC. Deterministic recent tracking/history order; no clinical priority. Add owner/status/sort indexes only as justified by these paths. Cursor is bounded validated position metadata, never authority; seek predicates remain owner+status-scoped, no unscoped lookup disclosing another cursor owner. Concurrent lists are live views, not snapshot/export guarantees.

Detail predicate: exact current owner + medicationId. Missing/foreign share safe bounded not-found response; ineligible actor denied without resource disclosure. Explicit DTO selects only; no per-read AuditEvent or provider/caregiver counterpart query.

## 14. Audit

Use [existing recordAuditEvent](../../src/modules/audit/services/audit-service.ts) with the transaction client. Consistent namespace: personal_medication.created, personal_medication.updated, personal_medication.stopped.

actorUserId is server actor; resourceType PersonalMedication; resourceId opaque item ID. Default metadata omitted; only explicitly allowlisted lifecycle status facts if infrastructure requires them. Never copy request/DTO into metadata. No medicationName, instructionText/dose text, National ID, HN, Patient name/contact/PII. No per-read audit/user-visible revision browser.

Audit failure rolls back mutation; mutation failure leaves no orphan success audit. Rolled-back retries leave no duplicate committed audit. Test failure injection for all three operations and exact metadata absence/minimization.

## 15. Server/cache/security/privacy

Follow [protected Personal services page](../../app/app/personal/services/page.tsx): await connection(), getProtectedApplicationActor(), server-only authorized query/service, safe unauthenticated/forbidden handling. Baseline Next.js 16.3 config does not enable cacheComponents. Installed server-actions.md and caching.md guides were inspected; implementation must reread applicable node_modules/next/dist/docs/ guidance, including caching-without-cache-components and data-security.

Authorize every page/query/Server Action from current persisted eligibility; nav/shell/client checks insufficient. Server inputs untrusted. No shared/static Patient cache, use cache/unstable_cache wrapper, cross-user client store or work/generic projection. Refresh/revalidate only Personal medication workspace after commit using incumbent transport; revalidation is not authority. Clear/replace actor-specific presentation on session/account change. Client sequential action dispatch does not prevent independent requests racing.

Use existing boundary abuse protection and safe application errors; no new public external API, credentials/env or runtime infrastructure. Do not log sensitive user text in errors/audit metadata.

## 16. Routes, UI and wording

Approved `/app/personal/medications`, **ยาของฉัน**, Personal only. Choose inline workspace list/create/edit/detail panels with current/history sections; no `[medicationId]` route required for this slice. Optional future detail route only if established Personal UX benefits; no scope expansion/generic work context.

Reuse current shell, tokens/primitives and DEMI UI foundation. Impeccable planning principles applied in Operate mode; no UI edits. Mobile-first responsive layout, accessible labels, keyboard/focus management, pending/disabled actions, associated errors and status labels without color-only distinction.

Required states: loading/empty; create success/error; edit success/error; explicit stop confirmation; stop success/error; stale conflict with refresh; safe inaccessible/foreign item; distinguish ACTIVE/STOPPED history. Preserve drafts on validation failure; never silently overwrite newer versions. No delete, schedule/reminder, provider/caregiver controls.

Provenance: **รายการยาที่คุณบันทึก**. ACTIVE “กำลังติดตาม”; STOPPED “หยุดติดตามแล้ว”. Stop action/confirmation **หยุดติดตามรายการนี้ใน DEMI**; explain that DEMI tracking changes, not medication intake. Never “หยุดยาแล้ว” or imply “หยุดรับประทานยา”. Do not claim “แพทย์สั่ง”, “ยาที่ได้รับการรับรอง” or “รายการยาจากโรงพยาบาล”. Instruction is user text, not DEMI treatment advice. Preserve Thai UTF-8 exactly.

## 17. Family separation

ZERO medication access through Family management/invitation previews, family-delegation-v1, family-appointment-read-v1 or CaregiverAppointmentGrant. No caregiver route reuses SELF medication queries. PATIENT caregiver accesses only own SELF items. Future sharing requires separate explicit medication contract/grant with recipient/purpose/fields/lifecycle.

## 18. Hospital/OSM separation

No MED-01 in Patient work detail, assigned OSM detail, Hospital directory/profile, care journey, Program, Goal Plan, appointment or service request. Existing work Patient authority does not confer medication access. Hospital MEMBER/OWNER, assigned OSM and routine ADMIN deny. Provider semantics belong to separately gated MED-02.

## 19. Goal Plan separation

No coupling to PatientGoalPlan, goal code medication or Medication De-escalation. No STOPPED→goal complete event; fewer active items is not medication reduction success. No sync/shared domain rules.

## 20. Future 17G.2

PersonalMedication 1→N MedicationSchedule, 0..N daily local times, Asia/Bangkok local time-of-day bounded current convention; no complex recurrence. Not global configurable timezone or Patient-specific timezone policy; multi-timezone deferred. No UTC-instant recurrence shortcut or schedule tables/columns/controls in 17G.1. 17G.2 NOT IMPLEMENTED; needs its own implementation contract.

## 21. Future 17G.3 / 17J

17G.3 may define approved reminder occurrence source and adherence only after separate adherence approval. No adherence events in 17G.1/17G.2. Delivery/open/missed reminder is not taken/missed medication or clinical non-adherence evidence.

17G owns approved schedule/reminder source; **17J owns delivery**: recipient, opt-in/preferences, consent, quiet hours, channel, retry, delivery status. 17G.1 zero delivery integration. 17G.3 NOT IMPLEMENTED; 17J future.

## 22. Migration strategy

Forward-only migration; never edit published migrations. Prisma model/enum/FK/indexes; CHECK/trigger SQL in new migration where Prisma cannot express them. Verify clean disposable PostgreSQL and current integration migration history; Prisma validate/generate succeeds. Assess FK/delete governance without a Patient purge flow.

No medication model/module/route found at baseline; no backfill expected. Goal Plan terminology is not legacy medication data. No schema/migration generated now.

## 23. Likely file impact map — do not create now

Current modules place queries under services/, so preserve that convention rather than adding an empty queries/ layer.

| Area | Likely files/responsibility |
| --- | --- |
| Persistence | prisma/schema.prisma; prisma/migrations/<forward migration>/migration.sql |
| Domain | src/modules/medications/domain/personal-medication-definitions.ts; focused tests if domain logic warrants |
| Policy | src/modules/medications/policies/personal-medication-policy.ts and .test.ts |
| Validation | src/modules/medications/schemas/personal-medication-schemas.ts and .test.ts |
| Services | src/modules/medications/services/personal-medication-access-service.ts, personal-medication-service.ts, personal-medication-query-service.ts with focused tests; split actual responsibilities only |
| Transport | src/modules/medications/transport/server-actions.ts, action-state.ts and tests |
| Personal UI | app/app/personal/medications/page.tsx, personal-medication-workspace.tsx, controls as needed, loading.tsx; inherited Personal error/not-found conventions; focused page/UI tests |
| Navigation | Minimal ยาของฉัน addition to current Patient Personal navigation owner, identified at implementation; no work-context/grant expansion |
| PostgreSQL | tests/integration/personal-medication.integration.test.ts |

Reuse shared auth/audit/errors/DB/UI; focused medication services own medication operations. Reuse identity conventions without widening grants or duplicating generic infrastructure. Adjust final filenames to current source while preserving boundaries.

## 24. Feature flag assessment

**NO feature flag recommended.** New isolated Patient SELF feature, unlike externally governed Family delegated disclosure. No concrete existing architectural reason for a medication env flag; eligibility and migration/deployment order suffice. No ceremonial flag/env change.

## 25. ADR assessment

**NO new ADR.** Bounded MED-01 follows existing identity, SELF authorization, server, transaction, audit and Personal workspace conventions. MED-02 may later trigger clinical source-of-truth/master/pharmacy/prescribing/interoperability ADR. None created now.

## 26. Numbered implementation acceptance criteria

1. Authenticated current ACTIVE PATIENT with exact persisted binding only.
2. Exact Person→PatientProfile ownership derived server-side every operation.
3. Client owner/creator/source/status/lifecycle timestamp fields rejected.
4. Documented bounded medicationName; normalized empty rejected.
5. Bounded optional instructionText; omitted/null/blank→null.
6. Thai/Unicode, meaningful text, script/case preserved.
7. Duplicate names allowed; no name uniqueness/merge/replacement.
8. Create ACTIVE with stoppedAt null and system timestamps.
9. Edit only own ACTIVE name/instruction; immutable fields fixed.
10. Separate explicit confirmed stop; authoritative stoppedAt.
11. STOPPED terminal; retracking creates new lifecycle.
12. No Patient delete action/button/DELETE route/purge.
13. No schedule persistence/controls/complex recurrence.
14. No adherence fields/events/scoring.
15. No reminder occurrence/delivery integration.
16. Family/caregiver/appointment grants give zero medication access.
17. Hospital MEMBER/OWNER denied.
18. OSM/assigned OSM denied.
19. No ADMIN bypass; eligible multi-role Patient own SELF only.
20. No prescription/reconciliation/provider verification/clinical authority.
21. No Goal Plan coupling/completion/reduction inference.
22. Safe identical foreign/missing not-found; no enumeration.
23. expectedUpdatedAt + owner/ACTIVE/version guarded update; increasing version.
24. PostgreSQL FK/status/CHECK/trigger enforce terminal lifecycle.
25. Successful create/update/stop atomically commits one AuditEvent each.
26. Audit excludes medication text/Patient PII; server actor/resource.
27. No per-read AuditEvent.
28. Every server boundary authorizes; no shared/static Patient cache/cross-user stale store.
29. Responsive mobile Personal UI, reused tokens/shell, accessible focus/labels/status.
30. Thai wording distinguishes stopping DEMI tracking from medication intake.
31. PostgreSQL negative tests: Patient A list excludes B; A cannot detail/update/stop B; guessed UUID, OSM/assigned OSM, Hospital MEMBER/OWNER, ADMIN, caregiver/appointment-sharing caregiver denied; multi-role own-only.
32. PostgreSQL update/update, update/stop, stop/update, stop/stop races; repeated stop preserves terminal timestamps with no extra success audit.
33. Focused tests/lint/typecheck pass; final unit/integration evidence recorded honestly.
34. Clean/current-history migration, Prisma validate/generate and final build pass.
35. No MED-02 creep or reinterpretation of MED-01 history.
36. Actual PostgreSQL rejects ACTIVE+stoppedAt, STOPPED without stoppedAt, STOPPED→ACTIVE, terminal UPDATE; valid create/stop/duplicates pass.
37. Audit failure injection proves atomic rollback/no orphan success audit for all mutations.
38. UI/transport tests cover normalization/optional text/validation/create/ACTIVE edit/terminal denial/stop confirmation and outcomes/stale conflict/empty/loading/safe foreign error.
39. UI tests distinguish ACTIVE/STOPPED without color alone; exclude clinical claims/delete/schedule/reminder/provider/caregiver controls.
40. Bounded deterministic owner-scoped cursor history and minimal DTO; older STOPPED items reachable.
41. Non-idempotent create has no ambiguous automatic replay; rolled-back retry leaves one committed mutation/audit.
42. Final diff scoped, no unrelated user work overwritten, unused abstractions/placeholders or published migration edits.

**Acceptance criteria count: 42.**

## 27. Staged implementation validation plan — not run now

Use package.json scripts. Baseline has npm run lint, no lint:strict/architecture:check script; review module boundaries directly unless current source later adds those commands. Inspect scripts/integration.mjs for safe disposable targets/argument forwarding first.

A. npx prisma validate; npm run prisma:generate.
B. Disposable PostgreSQL clean/current-history migration through established test:db:* / prisma:migrate:test workflow; never reset real/shared data.
C. Focused domain/schema/policy/access/service/query/transport tests: npm run test -- <explicit paths>.
D. Focused Personal medication page/workspace/controls tests with explicit paths.
E. Targeted PostgreSQL: npx vitest run --config vitest.integration.config.mts tests/integration/personal-medication.integration.test.ts, with validated disposable integration environment loaded into the process (DATABASE_URL = DIRECT_URL = DEMI_TEST_DATABASE_URL, local PostgreSQL, non-production). The current scripts/integration.mjs does not forward test paths; npm run test:integration -- <path> would run the full suite and must not be used for focused feedback. Follow its environment safety checks without displaying credentials; generate/migrate once before focused runs.
F. npm run lint.
G. npm run typecheck.
H. Stable full diff/security review, authorization/SQL/audit privacy/Thai encoding and git diff --check before broad checks.
I. One final full unit suite: npm run test.
J. One final full integration suite: npm run test:integration, justified by new DB/security domain.
K. One final npm run build, explicitly required for this implementation handoff's protected route/runtime compatibility.

Actual PostgreSQL invariants/races/security evidence required, not only mocks. No redundant broad loops; reproduce isolated failures and distinguish pre-existing/resource failures. Device UAT remains separate; automation does not close P17F-L04.

## 28. Exact final status

Documentation validation only: diff/content/links/UTF-8 and git diff --check. No Prisma/unit/integration/build/dev server run in this task. Runtime/database evidence remains next-task work.

- **17G.0 CLOSED**
- **Q30–Q53 CLOSED / OWNER APPROVED**
- **MED-01 contract approved for bounded 17G.1**
- **17G.1 CLEARED FOR IMPLEMENTATION / NOT IMPLEMENTED**
- **MED-02 REQUIREMENT-GATED**
- **17G.2 future schedule implementation / NOT IMPLEMENTED**
- **17G.3 future reminder/adherence decision/implementation / NOT IMPLEMENTED**
- **17J notification delivery future**
- **P17F-L04 OPEN / deferred**
- **Q5 unchanged: real Patient delegated-data use GOVERNANCE BLOCKED**
- **No runtime/schema/migration/routes/modules/tests/env/packages/roles/capabilities changed.**
