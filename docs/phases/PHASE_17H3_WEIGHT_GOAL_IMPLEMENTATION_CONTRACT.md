# Phase 17H.3 — Personal Weight Goal Technical Implementation Contract

## CURRENT status — 2026-10-04 (Asia/Bangkok)

**Phase 17H.3 — CLEARED FOR IMPLEMENTATION / NOT IMPLEMENTED. WELL-03 — CLEARED FOR IMPLEMENTATION / TARGET-ONLY.** This contract closes technical implementation choices; it creates no runtime, schema, migration, action, UI or test implementation. Q54–Q83 remain **CLOSED / OWNER APPROVED — Option A**; the technical choices below are engineering decisions under that scope, not fabricated additional owner approval.

**17H.1 IMPLEMENTED / CLOSED; WELL-01 IMPLEMENTED. 17H.2 IMPLEMENTED / CLOSED; WELL-02 IMPLEMENTED. Personal Weight Observation DEFERRED / NOT APPROVED FOR FIRST 17H SCOPE.** 17H.4A automated Wellness re-audit/UAT readiness remains future. 17G.4A PASS / AUTOMATED RE-AUDIT COMPLETE, Family P17F-L04 OPEN/device UAT pending and P17F-L05 OPEN/FUTURE, Q5 GOVERNANCE BLOCKED, parked 17E.2 consent, MED-02 REQUIREMENT-GATED and 17J delivery/system authority REQUIREMENT-GATED remain unchanged.

## 1. Baseline, authority and evidence

Repository bait0ngxaxa/demi. Actual starting HEAD **`50eb448e6c6cc4c1c6cc0857d22b33d5a53d0f59`**, matching expected HEAD (`fix(phase-17h2): share wellness privacy invalidation`); initial working tree clean. There were no newer commits to reconcile. No commit/push/reset/revert/amend/rebase is authorized or performed.

Read [AGENTS.md](../../AGENTS.md), [CONTEXT](../CONTEXT.md), [UAT backlog](./PHASE_17_UAT_BACKLOG.md), [corrected decision pack](./PHASE_17H0_WELLNESS_DECISION_PACK.md), [owner closeout](./PHASE_17H0B_WELLNESS_DECISION_CLOSEOUT.md), [Meal contract](./PHASE_17H1_MEAL_JOURNAL_IMPLEMENTATION_CONTRACT.md), [Meal handoff](./PHASE_17H1_MEAL_JOURNAL_IMPLEMENTATION.md), [Exercise contract](./PHASE_17H2_EXERCISE_JOURNAL_IMPLEMENTATION_CONTRACT.md) and [Exercise handoff including privacy correction](./PHASE_17H2_EXERCISE_JOURNAL_IMPLEMENTATION.md).

| Source reviewed | Evidence and permitted use |
| --- | --- |
| [Prisma schema](../../prisma/schema.prisma) | Baseline/Followup/FinalAssessment weight is nullable Float (PostgreSQL double precision), owned by care relationships/programs; none is a personal current-weight source. Personal domains use UUID ownership, Restrict FK, DATE and TIMESTAMPTZ(3). No current PersonalWeightGoal/Decimal model. |
| [Baseline schema](../../src/modules/patient-baseline/schemas/patient-baseline-schemas.ts), [Follow-up schema](../../src/modules/followups/schemas/followup-schemas.ts), [Final schema](../../src/modules/patient-final-assessment/schemas/patient-final-assessment-schemas.ts) | All use structural maximum 1,000,000. Baseline uses positive; Follow-up/Final permit nonnegative. Weight Goal must independently require positive. These are defensive bounds, not clinical ranges. |
| [Baseline transport examples](../../src/modules/patient-baseline/transport/server-actions.test.ts), [Follow-up examples](../../src/modules/followups/transport/server-actions.test.ts), [Final examples](../../src/modules/patient-final-assessment/transport/server-actions.test.ts) | `72.5` text becomes a number; decimal kg exists. No evidence of approved exactly-one-decimal restriction. Care transport numeric parsing does not establish a sufficiently strict new Weight lexical contract. |
| [Import normalization](../../src/modules/patient-provisioning/import/patient-import-normalization.ts), [XLSX adapter](../../src/modules/patient-provisioning/adapters/excel-patient-import-adapter.ts), [import contract](../../src/modules/patient-provisioning/import/patient-import-contract.ts) | Import uses number/null; text normalization removes commas, accepts signs/leading-dot decimals before Number conversion. Roster labels establish kg representation evidence only; this grammar and observation semantics are not transferred. |
| [Exercise service](../../src/modules/exercises/services/personal-exercise-service.ts), [Meal service](../../src/modules/meals/services/personal-meal-service.ts), [transaction helper](../../src/lib/db/serializable-transaction.ts), [audit](../../src/modules/audit/services/audit-service.ts) | Owner-bound surviving receipt, Serializable retryLimit=0, guarded writes, stale-before-NOOP, monotonic milliseconds, atomic minimized audit. Reuse neutral mechanics; no event history/pagination in Weight. |
| [Exercise SELF resolver](../../src/modules/exercises/services/personal-exercise-access-service.ts), [Meal SELF resolver](../../src/modules/meals/services/personal-meal-access-service.ts) | Fresh ACTIVE persisted User/PATIENT/exact Person/PatientProfile chain, no Work or Family union. |
| [Exercise domain/date adapters](../../src/modules/exercises/domain/personal-exercise.ts), [schemas](../../src/modules/exercises/schemas/personal-exercise-schemas.ts), [bounded form](../../src/modules/exercises/transport/exercise-form.ts) | Gregorian date round-trip, explicit Bangkok today, millisecond version token, UTF-16 field bounds, UTF-8 request accounting, strict FormData. Weight date direction and retained-past semantics differ. |
| [Exercise migration](../../prisma/migrations/20261004100000_personal_exercise_journal/migration.sql), [Meal migration](../../prisma/migrations/20261003140000_personal_meal_journal/migration.sql) | Forward SQL migrations with named checks/unique constraints/FKs; payload-free scalar receipt locators survive physical removal. Future Weight migration follows this style, not edits to historical migrations. |
| [Wellness page](../../app/app/personal/wellness/page.tsx), [composition](../../app/app/personal/wellness/personal-wellness-workspace.tsx), [shared authority](../../app/app/personal/wellness/wellness-private-authority.ts), Meal/Exercise workspaces | Request-time authenticated reads, actor remount key, shared generation across domains, DENIED/pagehide clears parent session, guarded delayed callbacks and BFCache reload. Existing mobile wrap anchors and independent bounded lists. |
| package.json, installed Prisma package/runtime declarations | Declared Prisma/client ^6.19.2; installed CLI/client **6.19.3**. Decimal constructor accepts string. No first-party Decimal DTO convention found; define an explicit string mapping rather than sending a class to the client. No new dependency/upgrade needed. |

Official references checked: [Prisma v6 Decimal](https://www.prisma.io/docs/orm/v6/prisma-client/special-fields-and-types), [Prisma v6 PostgreSQL native mappings](https://www.prisma.io/docs/orm/v6/overview/databases/postgresql), [PostgreSQL numeric](https://www.postgresql.org/docs/current/datatype-numeric.html). Decimal supports exact decimal persistence; explicit native precision/scale is required here. NUMERIC can round over-scale inputs on assignment, so application validation must reject excess precision before persistence. Current default v7 documentation redirects were superseded by explicit v6 documentation; no framework/version upgrade inferred.

## 2. Meaning and binding product boundaries

One current **Patient-selected personal target weight**, answering only **“น้ำหนักเป้าหมายที่ฉันตั้งไว้”**. Q69: no clinician/Hospital/Program/Goal Plan target or required weight loss. A target may be lower/equal/higher relative to other numbers, but this slice never compares them. Q70: kg only, finite positive. Q71: required targetWeightKg, optional targetDate with corrected retain-past rule. Q72: 0..1 current target, explicit create/edit/replace/remove, no prior-target content history. Q73: no automatic current-weight source, hierarchy or progress. Q74: Personal Weight Observation deferred, not approved for first scope.

Never read/write/join PatientBaseline.weight, PatientFollowup.weight, PatientFinalAssessment.weight, PatientGoalPlan/PatientGoalItem or Program reports for this capability. A target is not a measurement, recommendation, ideal/healthy weight or outcome. Do not add currentWeight/startWeight/measuredWeight/recordedWeight/weightRecordedOn, desiredChange, observation date/source, note/reason/status, Program/Hospital/Goal Plan/clinician identifiers, progress/direction/delta/percentage/rate/time-to-target or completedAt/achievedAt.

BMI, automated nutrition/fitness/clinical scoring/advice, clinical review, reporting, sharing/export, Family/Hospital/OSM visibility, reminders/notification delivery and Goal Plan synchronization are excluded. No generic WellnessEntry, target framework, CRUD/idempotency engine, archive, revisions or restore.

## 3. Closed numeric contract

| Decision | Exact choice |
| --- | --- |
| Raw field | Required string, **1..11 UTF-16 code units**, no trimming or whitespace accepted. |
| ASCII grammar | Entire string must match `[0-9]{1,7}(?:\.[0-9]{1,3})?`; verify full consumed length (JavaScript `$` alone can accept a final newline). Only separator `.`. |
| Leading zeros | Allowed within seven raw integer digits. `070` → `70`; `070.5` → `70.5`; `70.50` / `70.500` → `70.5`. |
| Precision | At most **3 fractional digits**; excess digits rejected even if trailing zeros. No rounding/truncation. |
| Normal form | ASCII plain decimal string, strip integer leading zeros leaving one `0`; strip fractional trailing zeros and then empty decimal separator. Never exponent/comma/sign/hidden original formatting. |
| Range | **0.001..1,000,000 kg inclusive**. `1000000.000` → `1000000`; `1000000.001` rejected. All zero forms rejected. |
| Application type | Validated canonical **string** in domain input/DTO/client; **Prisma.Decimal** only within server persistence/comparison mapping, constructed directly from string. No target Number/parseFloat/parseInt/valueAsNumber/.toNumber() conversion. |
| Prisma / PostgreSQL | Required **Decimal @db.Decimal(10,3)** / **NUMERIC(10,3)**. Seven integer + three fractional digits accommodates exact maximum. |
| Equality | Canonical strings equal, or server Decimal exact equality after normalization; date equality is civil string/null equality. Never epsilon comparison or formatted browser value equality. Version checked first. |
| Display | Canonical plain string plus **กก.**; preserve every significant fraction digit, no forced padding, grouping, exponent or rounding. Edit field uses the same canonical text. `72.5` displays `72.5 กก.`. |

Reject empty, whitespace/newlines, zero, negative, plus sign, `.5`, trailing `70.`, exponent, Infinity/NaN, hex, Unicode digits, commas, trailing garbage, >7 raw integer digits and >3 fraction digits. Raw limits precede lexical validation; lexical validation precedes Decimal construction. Range comparisons are exact. Direct service callers must undergo equivalent strict string validation; accepting a JavaScript number would bypass the intentional lexical contract.

**Why three digits is an engineering bound:** whole-only loses demonstrated decimal kg; scale 1 is not established by `72.5`; scale 2 also has no owner precision evidence. Scale 3 permits those inputs and finer intentional decimals in an eleven-character bounded field while retaining small, explicit storage and exact round-trip. It is a representational ceiling, not weighing-device accuracy, prescribed increments, measurement precision, clinical significance or an owner-approved medical rule. Unbounded scale would require broader input/storage/equality limits with no need in this target-only scope. Values outside this representation are rejected with format feedback, never silently rounded. Changing precision later needs a new technical contract.

**1,000,000 kg is NOT a medically meaningful allowable weight.** It is defensive application/storage hardening consistent with existing structural-number conventions. Likewise 0.001 is solely the smallest positive representable value at scale 3. UI must never call either boundary healthy, realistic or recommended.

Float is smaller in terms of existing number DTO conventions and could work with carefully enforced scale and canonical formatting. It still stores decimal approximations and needs formatting/equality safeguards. Decimal provides exact stored intent with one local string mapper; Prisma already supplies it. Additional cost is dedicated schema migration, DTO mapping and PostgreSQL round-trip tests, all required for this new domain anyway. Choose Decimal, with no global serializer or changes to care measurements.

## 4. Civil targetDate and corrected Q71

Optional nullable Gregorian **YYYY-MM-DD**, exactly ten ASCII characters, valid calendar date in years **0001..9999**, including leap-day validation by strict round-trip. PostgreSQL DATE; Prisma `DateTime? @db.Date`. A UTC-midnight Date is an internal DATE carrier only; extract YYYY-MM-DD without process-local timezone reinterpretation. No time, timezone-bearing target instant or UTC business timestamp. Display civil date neutrally using the existing date-only convention; do not reinterpret year as Buddhist calendar.

Compute today on the server from authoritative now using explicit Asia/Bangkok, Gregorian calendar and Latin digits at business validation inside the transaction. Do not use browser clock/rendered today/process timezone as authority.

| Operation | Required rule |
| --- | --- |
| Create | null allowed; supplied date >= current Bangkok today, today/future allowed, past rejected. |
| Edit retaining persisted date | Submitted date equals persisted date → retain allowed, including naturally passed date, while changing weight. |
| Edit to different non-null date | Require replacement >= current Bangkok today; different past date rejected. |
| Clear | Explicit blank/null allowed from future/today/passed date. |

After owner-scoped lookup and version check, compare submitted normalized date to the **persisted** old date. Only a different non-null date gets the today lower-bound rule. Example: stored `2026-10-01`, today `2026-10-10`, changing weight with `2026-10-01` succeeds; changing to `2026-10-02` fails; changing to `2026-10-10`/future/null succeeds. A full edit envelope **requires targetDate key** (blank means explicit clear); omission fails, preventing accidental clearing or ambiguous retain semantics. Create may omit it or supply blank; both normalize null. Direct service edit uses explicit string|null.

No static `min={today}` on the edit field; it can browser-invalidate valid retained past dates. Also omit static min on create and rely on server plus optional refreshed hints; rendered dates may become stale across Bangkok midnight. Native date controls must permit old value retention/clear; client validation must follow the same conditional rule and cannot block a server-valid retained date.

A passing date stays stored/displayed and current until explicit mutation. It causes no overdue/expired/completed/failed/cancelled/achieved state, automatic delete/replacement, reminder, authorization change, review, scoring or progress. Date passage does not advance updatedAt.

## 5. Persistence and physical removal

Future dedicated **PersonalWeightGoal**, with only these fields:

| Field | Persistence contract |
| --- | --- |
| id | UUID primary key, server-generated opaque locator. |
| patientProfileId | UUID NOT NULL UNIQUE; PatientProfile FK onDelete/onUpdate Restrict. Immutable owner. |
| targetWeightKg | NOT NULL NUMERIC(10,3), as §3. |
| targetDate | Nullable DATE, as §4. |
| createdAt / updatedAt | NOT NULL TIMESTAMPTZ(3); createdAt immutable, authoritative server version for updatedAt. |

PatientProfile has optional single current target relation and separate receipt relation. Owner uniqueness structurally enforces **0..1**; no active flag/latest-target query/multiple target rows. Future forward migration adds named range check `targetWeightKg > 0 AND targetWeightKg <= 1000000` (also rejects PostgreSQL NaN via upper bound) and nullable DATE check within 0001-01-01..9999-12-31. Never persist a dynamic date >= today check: retained past dates are legal. Application rejects over-scale before NUMERIC assignment; SQL type/checks enforce stored invariants, not original text grammar. No trigger is needed for date passage.

Successful remove physically deletes current weight/date payload from normal application persistence/read paths. No archive/soft-delete/deletedAt/history table. Receipt/audit contain no target content. Later create is a new UUID/createdAt and fresh explicit intent, not restoration. No promise of immediate backup erasure, browser memory erasure or legal retention guarantees. Account erasure, receipt disposal, backup restore handling and audit access/retention remain operational governance work under existing Q5 gate.

## 6. Create intent, receipt and reconciliation

Select **A: dedicated owner-bound create nonce + payload-free surviving receipt**. Unique owner alone prevents simultaneous rows but forgets a successful create after remove; delayed retry could then recreate old intent. Read-current reconciliation alone also cannot tell old deleted intent from a new target. Receipt closes that ambiguity without target history/content dedup/hash. Do not reuse Meal/Exercise receipt tables or introduce a generic framework.

Future **PersonalWeightGoalCreateReceipt** has exactly patientProfileId UUID, submissionNonce UUID, weightGoalId UUID scalar UNIQUE, createdAt TIMESTAMPTZ(3); primary key (patientProfileId, submissionNonce), Restrict owner FK, **no FK to target**. No weight/date/payload/hash, status or deletion timestamp. It survives target removal; no automatic TTL/pruning while owner namespace exists, since pruning reopens resurrection.

One cryptographically random UUID nonce per explicit create intent, retained across ambiguous response/retry in private memory. Never replace nonce automatically after conflict/timeout, or silently reinterpret create as edit.

Within Serializable transaction, freshly resolve SELF then:

1. Validate bounded structure/lexical shape/positive range/calendar syntax; malformed input can fail even for consumed nonce.
2. Look up owner+nonce receipt **before new-intent date rule or owner occupancy**. If receipt exists, owner-scope lookup by its weightGoalId.
3. Original target still present → **REPLAY** with current target DTO, even if edited; no mutation/audit and no claim replacement submitted values were saved. Replay is allowed after original targetDate passes.
4. Original target absent → **CREATE_CONSUMED**, no create; even if a different new goal now exists, never substitute that new goal as replay of the old nonce. Offer fresh authorized get-current separately, without old deleted payload.
5. No receipt and current goal exists → safe **CONFLICT**, no overwrite/receipt/success audit. User must reload/review and explicitly edit current goal. This definitively rejected create is abandoned by UI; it is not queued for automatic retries after later removal.
6. No receipt/no current goal → validate create date against current Bangkok today, create target + receipt + created audit atomically. Validation/audit failure rolls all back and does not consume nonce.

Same nonce under another owner is separate namespace, never authority/disclosure. Same payload with distinct nonce while occupied conflicts; after remove, only explicit fresh create may create a new target. No content deduplication/hash.

Concurrent same-nonce creates: at most one target/receipt/audit; loser may initially conflict, same-nonce retry reconciles winner. Different-nonce creates: owner unique allows one winner, loser safely conflicts without payload leakage. If winner is then removed, its consumed nonce cannot resurrect it. Uncommitted/rejected requests are not successful consumed creates; UI must never automatically revive those abandoned intents. A read returning null does not prove an ambiguous create failed; same nonce reconciliation is required.

Use existing Serializable helper **retryLimit=0** for reads/mutations/replay, consistent with Meal/Exercise. Recognized P2002/P2034 → safe conflict without internal errors. No hidden automatic new nonce/authorization/business retry. Network/infrastructure ambiguity → **UNCONFIRMED**, retain same intent and permit explicit same-nonce retry. For consumed results, deliberate “ตั้งเป้าหมายใหม่” after authorized no-goal read generates a new nonce. An edit is explicit replacement of current values, not delete+create chaining.

## 7. Edit/remove, optimistic concurrency and races

Lifecycle: **NO GOAL → CREATE → EDIT CURRENT → REMOVE → NO GOAL**. Create when occupied conflicts. Replace means explicit edit of weight/date on same UUID, preserving createdAt; updatedAt changes only on actual change. No replacement record chain or special lifecycle/version ID.

Edit/remove require goalId and **expectedUpdatedAt**: ≤40 UTF-16 units, valid timezone-offset ISO instant with exactly three fractional millisecond digits. Normalize to instant for comparison to persisted TIMESTAMPTZ(3). Browser token is expectation, never authority. Fresh owner-scoped lookup: missing/foreign uniformly safe NOT_FOUND without unscoped existence/version probe. Removed goal cannot be recreated by edit; no upsert.

Check version **before NOOP** and business date comparison. Current version + canonical identical weight/date → **NOOP**, no version/audit. Stale identical edit → **CONFLICT**. Current version + actual change → **UPDATED**, updatedAt = max(authoritative server now, persisted updatedAt + 1ms). Conditional updateMany/deleteMany predicate includes id + derived owner + current updatedAt; require affected count=1. Target/receipt/audit consistency is within the transaction; use count guards plus Serializable, not read-then-unconditional-write. Explicit reload/review required after conflict; never auto-apply stale draft with fresh token.

| Race | Required result |
| --- | --- |
| Create/create | One row/receipt/created audit maximum; safe loser and §6 reconciliation. |
| Edit/edit with actual changes | One old-version winner; stale loser conflict, no lost update. |
| Edit/remove | One old-version winner; edit advances token or remove prevents recreation. |
| Remove/remove | One delete/audit; later missing safe result, no second success. |
| NOOP versus actual mutation | NOOP has no write/version; concurrent actual mutation may succeed or serialization conflict, never report draft changes saved. |
| Replay/remove | Replay may read before delete, or report consumed afterward, or serialization conflict; never write/recreate. Shared client generation and subsequent refresh prevent treating readback as permanent truth. |
| Old replay after new create | Old receipt remains consumed; new goal is not the old create replay. |
| Audit/receipt failure | Entire mutation rolls back, including version/removal/new row/receipt. |

## 8. Audit, exact authority and private read model

Use transactional `recordAuditEvent`: **personal_weight_goal.created / personal_weight_goal.updated / personal_weight_goal.deleted**, resourceType **PersonalWeightGoal**, opaque resourceId, authenticated server actorUserId, audit system time; omit metadata. No weight/date, Patient name/National ID/HN, payload hash, current weight/progress/clinical interpretation. No ordinary read audit or success audit on NOOP/replay/failed mutation. Required receipt/business mutation/audit atomic; audit is operation evidence, not target history.

Every get/create/edit/remove/replay derives owner server-side through **authenticated ACTIVE persisted User → persisted PATIENT role → exact Person binding → exact PatientProfile**, inside fresh transaction. Actor/session checks alone are insufficient. Fail closed for inactive/suspended user, removed role, mismatched/stale binding, missing profile and stale session. Dedicated Weight policy/resolver follows current Personal semantics without importing Meal/Exercise business policy. Never accept client owner identifiers.

Another Patient, Hospital MEMBER/OWNER, OSM/assigned OSM, Family/caregiver including active appointment grant, and routine ADMIN gain no Weight authority. PATIENT+Work may access own SELF only; Work membership/assignment/grant never expands scope. IDs/nonces/version tokens are locators/expectations, not access grants. Revocation after initial load is rechecked on every request.

Get-current takes **no owner input**, returns **PersonalWeightGoalDto | null**. DTO only id, canonical string targetWeightKg, targetDate string|null, createdAt/updatedAt ISO millisecond strings. Explicit select/map, no owner/receipt/Decimal class/care fields. No pagination, cursor, history, source lookup or extra DTO owner identifiers.

## 9. Strict transport and application boundaries

**Client/UI → Server Action → Weight Goal Application Service → Weight SELF Policy/Resolver → Prisma → PostgreSQL.** Keep numeric/date rules authoritative within local domain/schema/service, not copied across transport/UI. Reuse genuinely neutral auth/audit/transactions/shared Wellness authority/UI primitives. No new dependency/env/config or generic abstractions solely for Weight.

| Operation | Exact user-field envelope |
| --- | --- |
| Get-current | No fields. |
| Create / same-intent reconciliation | Required submissionNonce, targetWeightKg; optional targetDate (omitted/empty→null). |
| Edit full replacement | Required goalId, expectedUpdatedAt, targetWeightKg, **targetDate** (empty→explicit null). |
| Remove | Required goalId, expectedUpdatedAt. |

UUID id/nonce exactly **36 UTF-16 units**, strict UUID syntax, canonical lowercase; version ≤40 and §7 grammar; target raw 1..11 and §3 grammar; nonblank date exactly **10**, optional/clear date zero length. No trimming of target/date/UUID/version; reject whitespace. Domain edit targetDate explicit null/string, create omitted→null. Per-field limits first; total UTF-8 key+value bytes **≤16,384 (16 KiB)** consistent with bounded Personal forms. Max business fields create=3/edit=4/remove=2/get=0. Reject over-limit, no truncation.

Reject duplicates including optional fields, File values, unknown fields, patientProfileId/personId/userId, currentWeight/startWeight, Goal Plan/Program/Hospital IDs, status/progress. Ignore only verified framework-owned `$ACTION_` metadata following existing discipline; never domain authority. Parsed-field budget is not a promise about multipart/network overhead; existing framework/deployment request-size/abuse controls apply, no config changes. Later runtime checks installed Next.js guide for metadata/private request-time APIs before coding.

Bound request first → fresh authentication → strict schema parsing → resource authorization → version/receipt/business rules → transactional persistence/audit → scoped freshness revalidation → sanitized response. Equivalent validation for direct service calls. No raw FormData/schema payload, Decimal value, weight/date in logs/errors/telemetry. Safe Thai validation/conflict/denied/unconfirmed feedback; no SQL/stack/internal paths/raw Prisma messages. Successful removal returns ID/result only, no deleted payload. Revalidation is freshness, not authority.

## 10. Shared Wellness privacy lifetime

Authenticated request-time private reads; no public/static target data or cross-actor result cache. No weight/date in URL/query strings, audit metadata/log/error/telemetry or durable localStorage/IndexedDB by default. State/drafts/nonces remain actor-specific private memory; no promise of cryptographic memory erasure.

Extend existing **PersonalWellnessWorkspace + WellnessPrivateAuthority**, preserving the 17H.2 correction. Weight receives the **same authority instance**, never its own independent lifetime. Server initial read re-resolves each domain; any denied read renders no private sibling content. Include Weight seed/nonce in parent session and actor remount boundary.

Any Meal/Exercise/**Weight DENIED** invalidates shared generation synchronously, removes parent private session and all three domains' data/drafts/tokens/nonces, and shows safe re-authentication state. Every Weight read/mutation callback captures shared generation and applies results only when shared isCurrent plus local mounted/request-generation checks pass. Delayed Weight response after Meal/Exercise denial cannot repopulate; delayed Meal/Exercise response after Weight denial cannot repopulate. Do not reset private state from stale seed props. Pagehide invalidates all; persisted pageshow/BFCache requests fresh reload; Strict Mode cleanup/setup suspension/resumption advances generation. Scoped revalidation must not weaken this client boundary.

## 11. Route, mobile composition and truthful states

Choose **A: three independent anchored sections at `/app/personal/wellness`**, ordered **อาหาร → การออกกำลังกาย → เป้าหมายน้ำหนัก**, existing Personal สุขภาพ shell item. Add `#weight-goal` local anchor alongside current wrapping links; no new shell navigation or nested Weight route. This is future composition only; no usable Weight UI is delivered by this document.

Source review with Impeccable context confirms current page already has two inline forms plus up to 50 rows each and separate pagination. Mobile can therefore be long today; adding a single target/editor is bounded, unlike adding another history. Existing anchors allow direct reach without scrolling all history. Keep wrapping touch links and one-column primitives; do not load all history or introduce mixed feeds. No concrete browser/device evidence justifies routing complexity. Runtime must verify actual mobile reachability with populated lists; this source assessment is not visual/device UAT PASS.

Patient operates their own target, with existing PageHeader/Panel/Input/Button/Alert/tokens/native labels, touch targets ≥44px, keyboard/focus/error associations and live status announcements. Text decimal input with inputMode=decimal, label **“น้ำหนักเป้าหมาย (กก.)”**, format hint **“ทศนิยมได้ไม่เกิน 3 ตำแหน่ง”**; no type=number valueAsNumber or spinner interpretation. Date label **“วันที่เป้าหมาย (ไม่บังคับ)”**, allow clear and §4 retention.

| State | Required neutral behavior |
| --- | --- |
| No target | “ยังไม่ได้ตั้งเป้าหมายน้ำหนักส่วนตัว” plus “ตั้งเป้าหมายน้ำหนัก”; no implication a target is medically required. |
| Current target | Weight + optional date, “เป้าหมายส่วนตัวที่คุณตั้งไว้” / “ข้อมูลที่คุณบันทึก”, edit/remove actions only. |
| Passed date | Same neutral target date display, editable/retainable/clearable; no overdue badge/countdown. |
| Loading/pending | Neutral loading/saving, duplicate-submit guard, no previous actor data or premature success. |
| Validation | Preserve draft in authorized private memory, safe Thai field feedback and error focus. |
| Success/NOOP/replay | Show persisted values; distinguish actual save/no change/reconciled previous create, never claim replay submitted edits saved. |
| Conflict/unconfirmed | Reload/review or same-nonce reconcile as appropriate, no silent overwrite/automatic fresh create. |
| Remove confirmation | Explain removal of current target, cancel restores focus; no history/restore/backup-erasure claim. |
| Consumed intent | Safe no-resurrection feedback; explicit fresh intent only after get-current/review. |
| Authority loss | Clear all Wellness private state and show re-authentication path. |

No current/start weight, chart/trend/progress bar/%/remaining kg/BMI/days advice. Forbidden interpretation includes น้ำหนักที่เหมาะสม, น้ำหนักสุขภาพดี, เป้าหมายจากแพทย์, ควรลด/ควรเพิ่ม, เหลืออีก X กก., สำเร็จแล้ว/ล้มเหลว, ล่าช้า/เกินกำหนด/ไม่สำเร็จ, recommended/overdue/expired.

## 12. Required later runtime evidence (not executed here)

| Area | Acceptance evidence |
| --- | --- |
| Numeric | 0.001, 72.5, 72.55, 72.555 and exact maximum; zero/negative/>max rejected; excess fraction including 70.5000 rejected; exponent/comma/Unicode/Infinity/NaN/hex/sign/empty/whitespace/final newline/trailing garbage/leading-dot/trailing-dot/too many digits rejected. Leading zeros/trailing zeros normalize deterministically; Decimal persistence/readback exact; normalized NOOP and stale-identical conflict; no Number or Decimal class in DTO. |
| Create date | null/today/future accepted, past rejected; calendar bounds/leap days. |
| Edit date | Unchanged future/today/naturally passed retained; passed→today/future accepted; passed→different past rejected; future/passed→null accepted; omitted edit date rejected. Bangkok midnight and process timezone invariance; replay does not reapply new-date rule. |
| Cardinality/retry | Empty→null, one target, second create conflict, same/different nonce concurrent creates one row; edit/replace same ID, NOOP, physical remove, deliberate new create/new ID; old nonce after remove remains consumed, including after new goal; no overwrite/dedup; ambiguous create reconciliation; no automatic revival of definitively rejected intent. |
| Authorization | Own SELF; cross-Patient; inactive/suspended; removed PATIENT role; invalid binding/missing profile/stale actor; Hospital MEMBER/OWNER; OSM/assigned OSM; Family/caregiver + active appointment grant; ADMIN-only; PATIENT+Work own only; revocation after load for get/create/edit/remove/replay. |
| Real PostgreSQL concurrency | Create/create same/different nonce; edit/edit, edit/remove, remove/remove; stale identical edit, NOOP; replay/remove and old replay/new create interaction; audit failure rollback for create+receipt/update/delete; receipt failure rollback; one success audit per actual mutation. Mocks alone insufficient. |
| Privacy/UI | No current-weight/progress/BMI/overdue state; passed date neutral and weight-only edit succeeds without stale browser min; shared DENIED clears all three; delayed Weight after sibling denial and delayed siblings after Weight denial discarded; actor/logout/pagehide/BFCache/Strict Mode; no sensitive URLs/cache/durable storage/logging; mobile populated-history anchors, wrapping Thai copy, keyboard/focus/loading/error/success/empty/disabled/remove states. |
| Future migration | Generate/validate/client mapping and named constraints using established scripts; existing disposable and clean migration paths, numeric range/date/unique owner/receipt invariants and no historical payload retention. No production deploy or manual UAT inference. |

Later implementation uses staged focused repository verification and final stable diff before justified broad checks. This contract does not supply tests or claim PostgreSQL/runtime/browser evidence.

## 13. Documentation-task validation and closure

Performed HEAD/tree/source review, Q69–Q74 and corrected Q71 cross-check, official v6 Decimal/PostgreSQL type review, numeric/date/receipt/race/privacy/source assessment, current-status search/reconciliation, local Markdown reference checks, strict UTF-8/BOM/line-ending preservation and Thai integrity review, narrow scope review and final diff/status inspection. Historical pending-precision/clearance statements remain dated historical evidence, superseded by the newest 17H.3 addendum; technical choices are fully closed here.

**No runtime/schema/migration/test/env/config files changed. No unit/integration tests, Prisma generate/validate/migrations, lint/typecheck/build/dev server run. No commit/push.** Only documentation changed. No Weight runtime or manual mobile/device/BFCache UAT/production deployment is claimed. Operational retention/governance follow-ups do not invent new scope or lift Q5.

Final status: **17H.1 IMPLEMENTED / CLOSED; WELL-01 IMPLEMENTED → 17H.2 IMPLEMENTED / CLOSED; WELL-02 IMPLEMENTED → 17H.3 CLEARED FOR IMPLEMENTATION / NOT IMPLEMENTED; WELL-03 CLEARED FOR IMPLEMENTATION / TARGET-ONLY → future 17H.4A re-audit/UAT readiness**. **Personal Weight Observation DEFERRED / NOT APPROVED FOR FIRST 17H SCOPE.**
