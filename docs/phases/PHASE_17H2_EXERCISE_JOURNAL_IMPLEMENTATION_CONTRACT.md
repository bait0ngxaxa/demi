# Phase 17H.2 — Personal Exercise Journal Implementation Contract

## CURRENT status — 2026-10-04 (Asia/Bangkok)

**WELL-02 — CLEARED FOR IMPLEMENTATION. Phase 17H.2 — CLEARED FOR IMPLEMENTATION / NOT IMPLEMENTED.** This document closes technical choices only; Exercise runtime does not exist. Q54–Q83 remain **CLOSED / OWNER APPROVED — Option A** in the [decision pack](./PHASE_17H0_WELLNESS_DECISION_PACK.md) and [owner closeout](./PHASE_17H0B_WELLNESS_DECISION_CLOSEOUT.md). Technical bounds below are engineering choices, not new owner-approved clinical/product rules.

**17H.1 IMPLEMENTED / CLOSED; WELL-01 IMPLEMENTED** remains intact, including corrected consumed-create recovery and Bangkok-midnight date behavior. WELL-03 OWNER DECISIONS CLOSED / TARGET-ONLY PLANNED 17H.3 / NOT IMPLEMENTED; Personal Weight Observation DEFERRED / NOT APPROVED FOR FIRST 17H SCOPE. No blocker remains for this bounded contract; runtime, database verification and manual UAT remain later work.

## 1. Baseline and reviewed evidence

Actual starting HEAD: `2642adc75ead0a14070b35987cd317a2dd0f6359`, `fix(phase-17h1): correct consumed create recovery and date constraint`; matches expected HEAD. Initial working tree clean; no newer commits to reconcile. No commit/push/reset/revert/amend.

Reviewed AGENTS.md, [CONTEXT](../CONTEXT.md), [UAT backlog](./PHASE_17_UAT_BACKLOG.md), the decision pack/closeout, [Meal contract](./PHASE_17H1_MEAL_JOURNAL_IMPLEMENTATION_CONTRACT.md), [Meal implementation/correction](./PHASE_17H1_MEAL_JOURNAL_IMPLEMENTATION.md), [Prisma schema](../../prisma/schema.prisma), Meal domain/schemas/policy/access/mutation/query/cursor/transport, current Wellness page/workspace/controls/loading/error states, authentication actor resolution, audit, Serializable helper, numeric validation conventions, navigation and UI foundation before choosing this contract.

| Source evidence | Responsibility that may be reused |
| --- | --- |
| [Meal owner resolver](../../src/modules/meals/services/personal-meal-access-service.ts), [authentication](../../src/modules/auth/services/application-access-service.ts) | Fresh authenticated persisted identity chain; Exercise owns its own policy/resolver, never calls Meal policy as Exercise authority. |
| [Meal mutation](../../src/modules/meals/services/personal-meal-service.ts), [schema](../../prisma/schema.prisma) | Surviving payload-free receipt, guarded millisecond version, physical delete and transactional audit technique; no Meal category/description product fields. |
| [Serializable helper](../../src/lib/db/serializable-transaction.ts), [audit](../../src/modules/audit/services/audit-service.ts) | Existing responsibility-neutral transaction helper and transaction-client audit writer. Helper defaults to two immediate retries; Exercise explicitly passes zero, like Meal. |
| [Meal query](../../src/modules/meals/services/personal-meal-query-service.ts), [cursor](../../src/modules/meals/services/personal-meal-cursor.ts), [form transport](../../src/modules/meals/transport/meal-form.ts) | Fixed 50/fetch51 history, authenticated cursor technique, UTF-16 text limits and bounded strict FormData technique; dedicated Exercise codec/envelopes. |
| [Numeric validation](../../src/modules/followups/schemas/followup-schemas.ts), [Goal schemas](../../src/modules/goals/schemas/goal-schemas.ts) | Explicit finite/positive/bounded numeric validation and integer checks; care target ranges are not Exercise-session limits. Existing Prisma Int fields support ordinary integer representation. |
| [Current page](../../app/app/personal/wellness/page.tsx), [workspace](../../app/app/personal/wellness/personal-meal-workspace.tsx), [navigation](../../src/components/app-shell/application-navigation.ts), [UI foundation](../ui/DEMI_UI_FOUNDATION.md), PRODUCT.md / DESIGN.md | Existing request-time Personal workspace, single prefix-matched สุขภาพ destination, mobile controls/tokens and actor-state protection. Impeccable Operate planning only; no UI edits. |

Legacy evidence is limited to the historical source analysis in the decision pack: `saveExerciseRecord` offered optional exercise_minutes in generic Goal-linked records, with no verified Patient UI caller; care Goal target ranges are targets, not actual sessions. This provides no defensible clinical maximum or authority/schema to import. No live legacy database or deployment claim. Later implementation must inspect installed `node_modules/next/dist/docs/` and official/Context7 API documentation before writing framework code; this contract adds no new framework API or configuration.

## 2. Binding Exercise semantic and product fields

Q64–Q68 Option A mean **ONE actually performed Patient-reported exercise session**: what the Patient says they did. It is not a prescription, clinician-verified fact, Goal Plan activity, adherence proof, fitness score, clinical measurement, recommended exercise, future schedule/reminder or wearable/device event.

Multiple intentional sessions are legal with the same date, activity name, date + activity, or identical date + activity + duration + note. No activity/date/content uniqueness or content deduplication. Absence of entries means neither no exercise nor non-adherence nor incomplete Goal Plan.

Character counts use **UTF-16 code units**, the established Meal/JavaScript string-length convention, not grapheme counts. Reject oversize rather than truncate. Bounds apply before normalization in services as well as transport. Preserve Thai/Unicode, case and meaningful internal whitespace; no transliteration, whitespace collapse or Unicode rewriting. Reject U+0000 in text because PostgreSQL text cannot persist it; return a safe validation error.

| Field | Requiredness and exact normalization |
| --- | --- |
| activityName | REQUIRED Patient-entered free text. Raw ≤240 UTF-16 units; trim leading/trailing whitespace; normalized length 1..120. Empty rejected. Preserve internal whitespace. No controlled vocabulary, taxonomy, clinical autocomplete, inferred exercise type/intensity or Goal activity-code mapping. |
| occurredOn | REQUIRED valid Gregorian YYYY-MM-DD, exactly 10 units, year 0001..9999, Asia/Bangkok civil date; section 4. |
| durationMinutes | OPTIONAL; omitted/null/blank input becomes null; supplied value is finite positive integer 1..1,000,000 minutes; section 3. No default/inference. |
| note | OPTIONAL single plain-text field. Raw ≤2,000 UTF-16 units; trim exterior whitespace; normalized ≤1,000; omitted/null/normalized-empty → null. Preserve meaningful interior whitespace/newlines/Thai/Unicode. No extra description/comment field. |

Render activityName/note as escaped literal text; no HTML or Markdown execution. Full-field edit clears omitted optional fields to null, rather than patching hidden old values. Only these four product fields are authorized.

## 3. Duration technical bound — CLOSED

Choose **maximum 1,000,000 minutes inclusive**, persisted as nullable **Prisma Int / PostgreSQL INTEGER (`@db.Integer`)**. This is a **defensive structural validation bound** following DEMI's existing `FOLLOWUP_STRUCTURAL_NUMBER_MAX = 1_000_000` convention in [Follow-up schemas](../../src/modules/followups/schemas/followup-schemas.ts). It is an application-level hardening limit, not merely the datatype ceiling. The value fits ordinary INTEGER and is exactly representable by JavaScript number; no bigint, floating-point, arbitrary precision, unit-conversion framework or additional dependency is needed.

This bound is not a clinical recommendation, healthy maximum, fitness rule or claim that a longer session is medically invalid or impossible. No reviewed customer/legacy evidence supports a clinical session maximum; choosing 120 or 1,440 would import care-target/day-length meaning into a date-only event. Reuse the structural-bound convention as evidence, not Follow-up domain rules or a runtime dependency on its schema. Exercise must own its duration constant and enforce the same 1..1,000,000 range in validation, UI hints and the later database CHECK. Do not constrain duration to the occurrence day's length or derive start/end times.

Transport raw duration ≤20 UTF-16 units before trim. Omitted or trimmed-empty → null; otherwise accept only 1..10 ASCII decimal digits (leading zeros allowed within that length), convert exactly, then validate finite integer and range. Reject zero, negative, decimal notation (including `1.0`), NaN, infinity, non-numeric, exponent/hex/sign syntax and over-limit values; never parse a valid numeric prefix from invalid text or silently round. Direct typed service input accepts only null/omitted or actual finite integer numbers in range; reject strings/booleans/arrays except through the explicit transport parser. A numeric value 1 is an integer regardless of its caller's source notation. UI duration is visibly optional, integer step 1, minimum 1, maximum 1,000,000; native controls remain hints, server validation authoritative.

## 4. Occurrence civil date

Patient explicitly chooses/reviews a **Gregorian YYYY-MM-DD civil date interpreted under Asia/Bangkok**. Past/today allowed; future denied on both create and edit against authoritative server Bangkok today evaluated for that transaction attempt. Validate real dates/leap days and exact round trip, not only regex. Fresh request re-evaluates today, including across Bangkok midnight.

Persist PostgreSQL **DATE**; no occurrence timestamp, clock time, startAt/endAt or fake midnight UTC business semantic. A Prisma Date carrier is a persistence adapter only; return date-only DTO strings and display civil components directly without browser-timezone shifts or Buddhist-year reinterpretation. createdAt/updatedAt are system persistence/version instants only. Duration remains separate from date.

Reuse the corrected Meal lesson: **do not set a page-rendered static browser max=today** that becomes stale across Bangkok midnight. Initial today can be a reviewed default, never validation authority. An existing consumed receipt is replay, not a new occurrence; structural validation still precedes receipt lookup, but replay must not newly apply create-date business rules to replacement values.

## 5. Exact ownership / authorization

Every operation freshly validates **authenticated ACTIVE User → persisted PATIENT role → exact Person → exact PatientProfile**. Authentication resolves current provider subject/application actor; Exercise policy checks actor shape and resolver queries persisted exact user/person/role/profile binding. Browser authority is never trusted. Resolve persisted eligibility in the same Serializable transaction as list/detail/create/replay/edit/delete/continuation, with owner predicates on all entry/receipt/anchor reads and writes.

Fail closed for inactive/suspended User, removed PATIENT role, invalid User↔Person, missing PatientProfile, stale actor/session or another Patient's entry. Deny Hospital MEMBER/OWNER, OSM/assigned OSM, Family/caregiver, family appointment grant, routine ADMIN and every other Patient. Eligible PATIENT + Work role has own SELF Exercise only; no Work authority union. Navigation visibility is not authorization.

Resource ID, nonce and cursor are locators only. Owner is immutable and derived server-side; reject supplied patientProfileId/personId/userId, Hospital/relationship/role/Goal/Program authority fields. Ineligible actors are denied before resource lookup; well-formed foreign/missing entries share safe not-found handling without existence/version disclosure. No owner transfer or provider-authored data.

## 6. Dedicated persistence boundary (conceptual only)

Use dedicated **PersonalExerciseEntry**, owned by exact PatientProfile. Do not store under PersonalMealEntry, PatientGoalPlan/PatientGoalItem, PatientFollowup/PatientBaseline, generic records, WellnessEntry/EAV or metadata JSON.

| Field | Exact conceptual persistence type/invariant |
| --- | --- |
| id | Server-generated UUID primary key (`@db.Uuid`), immutable, never reused. |
| patientProfileId | UUID FK to PatientProfile, Restrict update/delete like Meal, server-derived and immutable in service; no transfer. |
| activityName | Required VARCHAR(120), normalized nonempty plain text. |
| occurredOn | Required DATE; structural Gregorian year 0001..9999. |
| durationMinutes | Nullable INTEGER; CHECK null or 1..1,000,000. |
| note | Nullable VARCHAR(1000), normalized empty absent. |
| createdAt | Immutable system TIMESTAMPTZ(3). |
| updatedAt | System TIMESTAMPTZ(3), monotonic optimistic version on actual edits. |

History index: `(patientProfileId, occurredOn DESC, createdAt DESC, id DESC)`, conceptually `PersonalExerciseEntry_history_order_idx`. No uniqueness on activity/date/content. PostgreSQL VARCHAR counts database characters; UTF-16 validation remains authoritative at application boundaries and must not be replaced with DB length checks. A later forward migration supplies structural date/nonempty/duration checks as appropriate; no schema/migration is written here.

**PersonalExerciseCreateReceipt** contains exactly patientProfileId UUID owner FK (Restrict), submissionNonce UUID, exerciseEntryId unique UUID scalar locator, createdAt TIMESTAMPTZ(3). Composite primary key `(patientProfileId, submissionNonce)`; one receipt per entry. **No entry FK** that cascades away replay memory or prevents physical deletion. No activityName/note/date/duration/payload hash/Patient PII. Technical owner linkage is necessary, not a copied Patient identity snapshot.

## 7. Create retry / receipt / transaction

Choose Exercise-specific **owner-bound opaque submissionNonce + payload-free persistent receipt**. Multiple identical intentional sessions need different nonces; one retry needs the same nonce. No content hash, content deduplication or global generic idempotency subsystem.

1. Generate random UUID once per create intent; retain submitted draft/nonce in actor-specific memory across pending/ambiguous retries. Never automatically replace nonce after failure or timeout. Explicit new intent (including a second identical session) creates a new nonce.
2. Bound transport, freshly authenticate, strictly parse; inside Serializable transaction re-resolve SELF and query receipt by derived owner + nonce, never global nonce lookup.
3. Existing receipt + surviving owner-scoped entry → **REPLAY** with current persisted readback, even after later edit. Ignore replacement values; no overwrite/content comparison/hash. UI explains already processed and requires edit/new intent for changes; do not claim replacement draft was saved.
4. Existing receipt + physically deleted entry → distinct safe **CREATE_CONSUMED** recovery outcome, no payload/recreation/audit. Block ordinary same-request submit and offer explicit **“เริ่มบันทึกใหม่”**. Only this deliberate intent generates a new nonce; do not send the user into an endless retry loop.
5. No receipt → validate product/current Bangkok date rules, create entry + receipt + `personal_exercise.created` audit atomically. Validation/rollback does not consume nonce. Audit failure rolls all back.
6. Same nonce under another owner is a separate namespace, never disclosure or authority. Malformed structural input may fail even for a consumed nonce. Receipt survives delete with no payload and **no automatic TTL/pruning** while owner namespace exists, because pruning permits old replay to create again. Account erasure/disposal needs operational policy.

Use existing `runSerializableTransaction` with **retryLimit = 0** for mutations and private reads, matching Meal. No hidden duplicate business mutation, automatic new nonce, automatic authorization/business retry or immediate helper retry. Normalize recognized **P2002/P2034** to safe conflict without raw Prisma details; a fresh same-nonce request rechecks current authority and reconciles the winner. Losing concurrent create may first conflict but cannot commit a second entry/receipt/audit. Unexpected network/infrastructure ambiguity is **UNCONFIRMED**, not fabricated success/failure; retain nonce and retry same intent to reconcile. Consumed-after-delete stays consumed. Exercise has no external side effect requiring different retry mechanics.

## 8. Edit / delete / optimistic concurrency

Lifecycle **CREATE → editable current session → physical delete**. Editable activityName/occurredOn/durationMinutes/note only; id/owner/createdAt immutable. No upsert, revision history, archive, soft delete, restore or lifecycle enum.

Require **expectedUpdatedAt** bounded ≤40 units, valid timezone-offset ISO instant with exactly three fractional millisecond digits, matching Meal convention. Compare instant to persisted TIMESTAMPTZ(3) version after fresh owner-scoped lookup; token is expectation, not authority or browser time. Conditional updateMany/deleteMany predicate includes id + derived owner + exact current updatedAt; affected count must be one. All mutation/audit steps share Serializable transaction.

Current version + changed normalized values → UPDATED with updatedAt **max(authoritative server now, prior updatedAt + 1ms)**. Matching version + all normalized fields identical → **NOOP**, no version change/audit. Check version before NOOP: stale identical request still conflicts. Date validation also applies to edits. Never automatically apply a stale draft using a refreshed token; reload/review first.

| Race | Required outcome |
| --- | --- |
| Edit/edit | At most one old-version actual winner; stale loser conflicts, no lost update. |
| Edit/delete | Edit winner invalidates old delete token; delete winner prevents edit resurrection. |
| Delete/delete | One successful physical deletion/audit; later missing safe outcome, no second success audit. |
| Create replay after edit | Current own entry readback, no mutation/audit. |
| Create replay after delete | CREATE_CONSUMED, never resurrection. |
| Receipt/audit/business failure | Entire transaction rollback, no orphan success audit or consumed nonce from failed create. |

Delete returns opaque deleted ID/result and refreshes surviving history, no deleted payload readback. Foreign/missing safely equivalent; never reveal foreign version conflicts. Later runtime requires actual PostgreSQL race evidence, not only mocks.

## 9. Minimized audit

Use existing `recordAuditEvent` with **transaction client**. Exact actions **personal_exercise.created / personal_exercise.updated / personal_exercise.deleted**; resourceType **PersonalExerciseEntry**, opaque resourceId, authenticated server actorUserId, system audit time; metadata omitted.

No activityName/note/date/duration, Patient name/National ID/HN, payload hash, exercise classification or raw request. No ordinary read audit and no duplicate audit for replay/NOOP/failed mutation. Mutation + receipt where applicable + audit atomic; audit failure rolls back business mutation. Audit is not revision history or payload recovery. Access/retention remain operational follow-ups.

## 10. Read model / private pagination / cursor

Patient can list surviving own sessions, read exact own entry if needed, create/edit/delete. Minimal DTO selects id/activityName/occurredOn/durationMinutes/note/createdAt/updatedAt; owner/receipt stay internal. History means **surviving current events**, not revisions.

Order **occurredOn DESC → createdAt DESC → id DESC**. Fixed page size **50**, fetch at most **51** for hasMore/nextCursor. No activity/date filters in this slice. Live list, not snapshot/export guarantee; concurrent edits can move entries and require refresh.

Dedicated Exercise codec, not Meal codec or generic cross-domain framework:

- Prefix **exercisecur_v1_**; HMAC-SHA256 with existing **IDENTITY_HASH_SECRET**, no env change. Domain separator **demi.personal-exercise.cursor.v1**; bind lowercase current actor userId/personId with unambiguous separators and fixed scope `occurredOn-createdAt-id-desc:50:no-filter`.
- Canonical strict JSON field order: version=1, patientProfileId, id, occurredOn, createdAt, updatedAt. Owner in signed payload, actor/domain/sort/page/filter scope in MAC context. Base64url payload + 32-byte signature, canonical round-trip checks; max **2,048 encoded UTF-16 units / 1,024 decoded payload bytes**. Reject unknown fields/noncanonical representations and invalid dates/UUIDs/version/timestamps. Timing-safe comparison after signature length check.
- Position/version/technical owner metadata only, no activityName/note/duration. Cursor is authenticated, **not encrypted** and never authority; occurredOn is anchor position metadata, not an Exercise payload snapshot. Keep in private action/state transport, not URL/query strings or telemetry.
- Every continuation freshly re-resolves SELF, verifies actor/owner/scope/signature, looks up anchor within exact owner scope and compares date/createdAt/updatedAt. Changed own anchor → safe conflict/restart; deleted/missing/foreign anchor → equivalent safe not-found/restart. Malformed/tampered/cross-actor/cross-owner rejected without unscoped existence probe.
- Seek lexicographically older tuples with owner predicate on every query. New pages never inherit authority from a cursor; no cross-actor cache.

## 11. Strict bounded transport

Server Action FormData envelopes; no public API/export endpoint. Parse before authentication/schema to bound user payload, then fresh authentication → strict schema → resource authorization → business/date/version/receipt rules → transactional persistence/audit → scoped revalidation/readback → sanitized result. Direct service callers receive equivalent validation/authorization; no unchecked transport trust.

| Operation | Exact allowed business keys |
| --- | --- |
| Create | submissionNonce, activityName, occurredOn, optional durationMinutes, optional note |
| Edit (full replacement) | entryId, expectedUpdatedAt, activityName, occurredOn, optional durationMinutes, optional note |
| Delete | entryId, expectedUpdatedAt |
| List | optional cursor |

UUID fields exactly 36 units, validated/canonicalized lowercase. Version ≤40, date exactly 10, activityName raw ≤240/normalized 1..120, note raw ≤2,000/normalized ≤1,000, duration raw ≤20 with section 3 grammar/range, cursor nonempty ≤2,048/decoded ≤1,024 bytes. Total user-field **UTF-8 key + value bytes ≤16 KiB (16,384)**, matching Meal transport accounting; enforce tighter per-field limits first and reject over-limit, never truncate. This parsed FormData accounting is not a claim that multipart/network overhead is 16 KiB; existing deployment/framework request/abuse controls remain required, no config change authorized here. Optional blank values normalize null; required fields cannot be omitted. If detail transport is introduced, allow entryId only with same UUID/request bounds.

Reject duplicate keys (including optional keys), File values, unknown business fields, owner fields and Goal/Program/Hospital/relationship fields. Ignore only verified framework-owned `$ACTION_` metadata under current convention; it must never become domain input/authority. Later implementation verifies installed framework metadata behavior. No raw FormData/schema input logging. Safe Thai field/errors/outcomes only; no stack/SQL/internal path/submitted content in errors/logs/telemetry. Never expose raw Prisma messages or pretend an ambiguous mutation is confirmed.

## 12. Route / mobile UX / truthful copy

Choose **two live inline sections coexisting at `/app/personal/wellness`**, under Personal → สุขภาพ → อาหาร / การออกกำลังกาย. Keep existing Meal route and workspace behavior; add an independent Exercise workspace after Meal, with local anchor links/section headings for quick access. No nested route migration, duplicate top-level shell items or new shell navigation source. Existing prefix-matched สุขภาพ is sufficient. Separate session lists/editors/nonces/cursors/state; no generic Wellness framework and no Meal product-field changes. Meal's consumed-create and non-static date-max behavior remain unchanged. Do not show Weight label/action until 17H.3; it must not appear usable.

Rationale: current page already hosts a bounded inline Meal form/history and shell already owns the Wellness destination. Two named sections preserve that contract with the smallest route change; independent pagination bounds each list. No combined mixed-domain history, new detail route or hidden future action is needed. A neutral Wellness PageHeader and existing Meal content hierarchy may be composed during implementation; preserve Meal form/history semantics and accessible headings.

Use existing PageHeader/Panel/Button/Input/Alert/tokens/native form patterns, single-column mobile layout, wrapping Thai/long text, touch targets, associated labels/errors, keyboard/focus restoration and status announcements. No new design system. Labels **“ข้อมูลที่คุณบันทึก”**, **“บันทึกการออกกำลังกาย”**, **“กิจกรรมที่ทำ”**, **“ระยะเวลา (นาที, ไม่บังคับ)”**, **“บันทึกเพิ่มเติม (ไม่บังคับ)”** communicate Patient-entered personal information.

| State | Contract |
| --- | --- |
| Empty | “ยังไม่มีบันทึกการออกกำลังกาย” and working create; no inference of inactivity/non-adherence. |
| Loading | Neutral loading state, no previous actor content. |
| Create | Explicit activity/date; optional duration/note visibly optional, no inferred data. |
| Edit | Own current values/version, preserve actor's in-memory draft after validation failure. |
| Delete confirmation | Explain deleting this current DEMI record; cancel restores focus, no archive promise. |
| Saving | Pending label and duplicate-submit control; success only after confirmed persistence. |
| Success/readback | Persisted data; clearly distinguish CREATED/UPDATED/REPLAY/NOOP; no claim replacement values saved on replay. |
| Validation | Safe Thai field feedback/error focus, no raw internal errors. |
| Stale/conflict | Reload latest and require review; no silent overwrite or deleted-payload recovery. |
| Consumed create | Distinct CREATE_CONSUMED, explicit “เริ่มบันทึกใหม่”; no endless same-nonce retry or automatic nonce renewal. |
| Denied/not-found | Safe generic state; remove inaccessible payload/controls, no other owner's existence disclosure. |
| Paginated history | “ดูรายการก่อนหน้า”, independent pending/error/restart handling and reachable older pages. |

No healthy/unhealthy, enough/not enough, Goal achieved, clinician approved/prescribed/recommended, calories burned, fitness improvement or medical outcome claims. No scores/streaks/badges/adherence percentages/motivational clinical interpretation. UI/device behavior requires later manual UAT; documentation is not UX PASS evidence.

## 13. Privacy / cache / logging / deletion

Activity/note may expose sensitive lifestyle/health information. Require authenticated private request-time reads, no public/static Exercise payload, shared/cross-actor result cache, activity/note in URL/query/log/error/telemetry, or default durable localStorage/IndexedDB journal/draft. Reuse request-time/private response technique from Meal after checking installed framework guidance; no new environment/config or cache framework. Scoped revalidation is freshness, never authorization.

Actor change/logout invalidates both domains' actor-specific in-memory view/draft/nonce/cursor state. Actor-derived remount keys and active/generation guards must prevent delayed old responses repopulating a new actor's content; denied responses clear inaccessible state. Maintain Meal lifecycle protections and independently protect Exercise. Browser back/forward/BFCache/device behavior is later manual UAT; do not promise cryptographic memory erasure or that all browser snapshots can be recalled.

Physical delete means Exercise payload disappears from **active application persistence/read paths after successful commit**. Receipt remains consumed-operation memory with no payload; minimized audit remains operation evidence, not journal history. No immediate backup/device-memory erasure promise, legal retention period or regulatory compliance claim. Operational follow-ups: backup retention/restore handling, account erasure, receipt disposal, audit access/retention and deployment privacy controls. These do not silently block synthetic/demo implementation under existing governance; Q5 real-data delegated-use gate remains unchanged.

## 14. Goal boundary / no secondary use / non-goals

**Personal Exercise Journal:** “What the Patient reports they actually did.” **Goal Plan:** “What the care/program workflow targets or asks for.” They are different records/authorities. Never store Exercise under PatientGoalItem, reuse Goal activity identifiers, mark Goal complete from an entry, derive adherence from name/date/duration similarity, or copy Goal targets into Exercise automatically.

No automatic feed to PatientGoalPlan/item completion, PatientFollowup, PatientBaseline, Final Assessment, Hospital dashboards, Program reporting, adherence/population/cohort analytics, Family projections or notification source/delivery. Any future projection needs a new explicit contract.

First scope excludes/deferments remain binding: Weight Goal runtime, Personal Weight Observation, BMI, prescription/recommended/scheduled activity, controlled taxonomy, Goal Plan integration, distance/unit, repetitions/sets, weight lifted, speed/pace, intensity, calories, steps, heart rate, GPS/location, device identifier/wearable source/Apple Health/Google Fit/Health Connect, photo/video, Goal/Program/Hospital/OSM/provider references, source verification, score/adherence/completion flags, scoring/advice/reporting, Family/Hospital/OSM visibility, share/export/public API, reminders/delivery and generic WellnessEntry/EAV/metadata JSON. These are not unfinished Exercise requirements.

## 15. Implementation boundaries and decisions closed

**Client/UI → Server Action boundary → Exercise Application Service → Exercise SELF policy/access resolver → Prisma → PostgreSQL.** Keep Exercise domain constants/types, schemas, policy/resolver, mutation/query service, cursor, bounded transport and UI where useful; do not create empty layers for symmetry. Lower layers never import UI. Reuse neutral transaction/audit/auth/UI primitives only where responsibility truly matches. A small local implementation is preferable to wrong Meal coupling or speculative shared framework solely to deduplicate two modules. No Meal behavior change authorized.

| Technical decision | Closed choice |
| --- | --- |
| Duration max / persistence | 1,000,000, nullable INTEGER, no clinical interpretation (§3/6). |
| Activity bounds | Raw 240; trimmed required 1..120 UTF-16 (§2). |
| Note bounds | Raw 2,000; trimmed optional ≤1,000 UTF-16, empty null (§2). |
| Receipt shape / deletion | Owner + nonce + unique scalar Exercise ID + createdAt; no payload/entry FK/TTL; survives delete (§6/7). |
| Transaction retries | Existing Serializable helper, retryLimit=0, safe P2002/P2034 (§7). |
| Concurrency | expectedUpdatedAt millisecond token, guarded count=1, monotonic +1ms, stale before NOOP (§8). |
| History page | 50/fetch51, date/createdAt/id descending, no filters (§10). |
| Cursor | Dedicated canonical HMAC, actor/owner/domain/scope binding, 2,048 units/1,024 payload bytes (§10). |
| Route | Coexisting independent Meal/Exercise sections at existing Wellness route (§12). |
| Transport | Strict envelopes, exact field bounds and 16 KiB UTF-8 user-field budget (§11). |
| Audit | personal_exercise.created/updated/deleted; PersonalExerciseEntry; no payload (§9). |
| Privacy/cache | Private request-time/no cross-actor result cache; actor-state invalidation/delayed-response guards (§13). |

## 16. Documentation validation and later acceptance

This task performed HEAD/tree/source review, Q64–Q68 cross-check against approved Option A, current-status/reference reconciliation, local link and strict UTF-8/Thai integrity checks, scope review and final diff/status inspection. Duration/note remain OPTIONAL, activity remains required free text ≤120, civil Bangkok date past/today only, identical intentional sessions legal, no Goal linkage/future fields/expanded authority. Contract explicitly closes retry/delete resurrection/concurrency/minimized audit/private history/cursor/transport/privacy boundaries.

**No runtime/schema/migration/test/env/config files changed. No unit/integration tests, Prisma generate/validate/migrations, lint/typecheck/build/dev server run. No Exercise implementation, database evidence, manual browser/mobile/device/BFCache UAT or production deployment claimed.** Historical Meal test results are not rerun or attributed to this task.

Later runtime acceptance must establish focused behavioral evidence for text/null/integer bounds and hostile transport; date leap-day/Bangkok midnight/process-timezone behavior; exact persisted SELF deny matrix/revocation; duplicate intentional sessions versus same-nonce races/replay-after-edit/consumed-after-delete; real PostgreSQL edit/edit/edit-delete/delete-delete races and audit rollback; deterministic multi-page history/cursor tampering/anchor changes; truthful accessible mobile states and actor/delayed-response privacy. Use staged repository checks and a stable diff before justified broad verification; manual device/BFCache UAT remains separate.

Final sequence: **17H.1 IMPLEMENTED / CLOSED; WELL-01 IMPLEMENTED → 17H.2 CLEARED FOR IMPLEMENTATION / NOT IMPLEMENTED; WELL-02 CLEARED FOR IMPLEMENTATION → 17H.3 PLANNED / NOT IMPLEMENTED; WELL-03 OWNER DECISIONS CLOSED / TARGET-ONLY / NOT IMPLEMENTED → 17H.4A re-audit/UAT readiness**. Personal Weight Observation DEFERRED / NOT APPROVED FOR FIRST 17H SCOPE. Corrected Q71 unchanged-past targetDate edit exception preserved. **17G.4A PASS / AUTOMATED RE-AUDIT COMPLETE**, Family P17F-L04 OPEN/device UAT pending, P17F-L05 OPEN/FUTURE, Q5 GOVERNANCE BLOCKED, parked 17E.2 consent, MED-02 REQUIREMENT-GATED and 17J delivery/system authority REQUIREMENT-GATED unchanged.
