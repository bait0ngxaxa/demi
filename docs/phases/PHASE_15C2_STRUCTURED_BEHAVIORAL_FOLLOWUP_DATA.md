# DEMI Phase 15C.2 — Structured Behavioral Follow-up Data

**Status:** `PARTIAL_COMPLETE_REQUIREMENT_GATED`  
**Baseline:** `aca77a549416186012a7891a517e5e59fbb5ae88`  
**Scope:** contract review; no new structured field passed the ownership gate

This phase preserves the Phase 15C.1 Program ownership, lifecycle, authorization,
round, idempotency, audit, and historical `NULL` foundations. It does not start
Phase 15C.3 UI integration.

## 1. Objective

Re-audit the accepted DEMI sources and implement only structured behavioral data
whose owner and meaning are sufficiently complete to persist without inventing a
calculation, clinical interpretation, workflow mutation, or report-only meaning.

The result is deliberately requirement-gated. The accepted sources support the
existing factual Follow-up contract, but they do not resolve ownership for any
new behavioral field. No new Prisma column, request field, service behavior, or
query projection is added in this phase.

## 2. Sources inspected

The source hierarchy used was:

1. `docs/Dashboard App Demi.xlsx` (read-only workbook inspection)
2. Accepted Phase 15C.0/15C.1 architecture and contracts
3. Current rewrite Prisma schema, migrations, services, queries, policies,
   transport, and tests
4. Legacy DEMI through the existing phase documents as behavioral evidence only
5. Engineering recommendation
6. Open customer requirement

Inspected documents:

- [Phase 15C.0](./PHASE_15C0_SERVICE_TWO_FOLLOWUP_CONTRACT_CONSOLIDATION.md)
- [Phase 15C.1](./PHASE_15C1_SERVICE_TWO_PROGRAM_LINKAGE_DOMAIN_PERSISTENCE.md)
- [Phase 15A business flow](./PHASE_15A_BUSINESS_FLOW_CONSOLIDATION.md)
- [Phase 15A reporting map](./PHASE_15A_REPORTING_DATA_MAP.md)
- [Phase 9A Follow-up requirements](./PHASE_9A_APPOINTMENT_AND_FOLLOWUP_REQUIREMENTS.md)
- [Phase 9C.0 Follow-up prototype](./PHASE_9C0_FOLLOWUP_PROGRESS_WORKING_PROTOTYPE.md)
- [Phase 8A Goal requirements](./PHASE_8A_GOALS_AND_ACTIVITY_PLAN_REQUIREMENTS.md)
- [Phase 8B.0 Goal prototype](./PHASE_8B0_GOALS_AND_ACTIVITY_PLAN_WORKING_PROTOTYPE.md)
- `prisma/schema.prisma`
- the Phase 15C.1 migration and Follow-up prototype migration
- `src/modules/followups/**`
- `src/modules/patient-program/**` lifecycle, access, policy, transport, and tests
- focused Follow-up tests and the Follow-up/Patient Program PostgreSQL suites

The workbook contains two formatted blank sheets:

| Sheet | Dimension | Relevant evidence | Workbook mechanics |
| --- | --- | --- | --- |
| `Dashboard ภาพรวม` | `A1:AQ29` | Before/during/after measurements and six visible `Achieve score` columns | No formulas or data validations |
| `รายงานการจัดบริการ` | `A1:BM37` | Follow-up groups with date, achieved days, rate, outcome, plan adjustment, and obstacle | No formulas or data validations |

The Follow-up sheet note states that `อุปสรรค` is recorded only as `มี` or
`ไม่มี`. It also describes `Achieve score` as achieved occurrences divided by
target occurrences per week, but it does not resolve the activity/round owner,
multi-goal aggregation, missing observations, or rate lifecycle. Phase 15A and
15C.0 explicitly warn that a report boolean does not prove its persistence
owner, and leave obstacle scope open.

## 3. Existing Follow-up factual contract

The accepted current rewrite already provides:

- immutable normalized `0..N` `PatientFollowup` records;
- Program-linked records through `PatientFollowup.patientProgramId`;
- child `PatientFollowupActivityProgress` rows with the existing
  `DONE`/`PARTIAL`/`NOT_DONE`/`NOT_APPLICABLE` status vocabulary and note;
- factual `weight`, `waistCircumference`, systolic/diastolic blood pressure,
  `bloodSugar`, `confidenceScore`, `reflectionNote`, `confidencePlan`, and
  `generalNote` fields;
- server-controlled `recordedAt`, actor, Program/relationship, Hospital, and
  round values;
- ACTIVE-only new Program writes and readable COMPLETED Program history;
- server-side HOSPITAL/OSM authorization and no care authority for ADMIN-only or
  PATIENT actors;
- serializable round allocation, nonce/request-hash conflict behavior, and
  transactionally coupled audit;
- no official achievement calculation, `>70%` metric, outcome enum, automatic
  plan adjustment, or correction/versioning framework.

These foundations are reused without redesign.

## 4. Field decision matrix

Decision values are deliberately limited to the Phase 15C.2 gate:
`IMPLEMENT_NOW`, `IMPLEMENT_AS_REVERSIBLE_PROTOTYPE`, `USE_EXISTING_FIELD`,
`DEFER_UNRESOLVED`, `BLOCKED_BY_CALCULATION`, and `REPORT_ONLY`.

| Concept | Source evidence | Source classification | Owner | Semantics complete? | Decision | Implementation |
| --- | --- | --- | --- | --- | --- | --- |
| Activity status | Current rewrite | `CURRENT_IMPLEMENTATION` | Progress row | Yes | `USE_EXISTING_FIELD` | Existing `status` |
| Activity note | Current rewrite | `CURRENT_IMPLEMENTATION` | Progress row | Yes | `USE_EXISTING_FIELD` | Existing `note` |
| Achieved count | Workbook `จำนวนวันที่ทำได้`; Phase 15A/15C.0 | `CUSTOMER_WORKBOOK` | TBD: activity or whole Follow-up | No | `DEFER_UNRESOLVED` | None |
| Measurement period | Workbook says `/สัปดาห์`; no complete owner/period contract | `CUSTOMER_WORKBOOK` | TBD | No | `DEFER_UNRESOLVED` | No generic period field |
| Obstacle presence | Workbook Follow-up group and note `มีหรือไม่มี`; Phase 15C.0 leaves scope open | `CUSTOMER_WORKBOOK` | TBD: Follow-up, activity, or Goal Plan | No | `DEFER_UNRESOLVED` | None |
| Obstacle detail | Workbook explicitly asks only presence; legacy text is non-authoritative | `CUSTOMER_WORKBOOK` | TBD | No | `DEFER_UNRESOLVED` | None; do not overload notes |
| Outcome/result | Workbook phrase/dropdown note; exact values absent | `CUSTOMER_WORKBOOK` | TBD: narrative, controlled assessment, or derived result | No | `DEFER_UNRESOLVED` | Existing notes remain narrative only |
| Plan adjusted | Workbook `ปรับ/ไม่ปรับ`; mutation/version meaning absent | `CUSTOMER_WORKBOOK` | TBD: Follow-up observation or Goal Plan event | No | `DEFER_UNRESOLVED` | No boolean or mutation |
| Weight | Current rewrite factual observation | `CURRENT_IMPLEMENTATION` | Follow-up | Yes within current prototype | `USE_EXISTING_FIELD` | Existing `weight` |
| DTX/blood sugar | Current rewrite factual observation | `CURRENT_IMPLEMENTATION` | Follow-up | Yes within current prototype | `USE_EXISTING_FIELD` | Existing `bloodSugar` |
| Waist/BP | Current rewrite factual observations | `CURRENT_IMPLEMENTATION` | Follow-up | Yes within current prototype | `USE_EXISTING_FIELD` | Existing fields |
| Confidence | Current rewrite provisional 0–10 observation | `CURRENT_IMPLEMENTATION` | Follow-up | Yes within prototype | `USE_EXISTING_FIELD` | Existing fields |
| Reflection/general notes | Current rewrite bounded narrative fields | `CURRENT_IMPLEMENTATION` | Follow-up | Yes as narrative | `USE_EXISTING_FIELD` | Existing fields; not outcome code or obstacle detail |
| Achievement rate | Workbook ratio is incomplete for production calculation | `CUSTOMER_WORKBOOK` | Derived | No | `BLOCKED_BY_CALCULATION` | None |
| `>70%` metric | Workbook report projection only; rate/aggregation unresolved | `CUSTOMER_WORKBOOK` | Derived/report | No | `REPORT_ONLY` | None |

The source classification identifies the strongest evidence available; it does
not convert workbook labels into accepted storage semantics.

## 5. Achieved-count analysis

The workbook provides useful but incomplete evidence:

```text
จำนวนครั้งที่ได้ทำตามเป้าหมาย : จำนวนครั้งที่ตั้งเป้าหมาย/สัปดาห์
```

This identifies a ratio-like concept and mentions a weekly target, but it does
not establish all facts needed for a safe stored integer:

- whether one count belongs to one Goal Item/activity or the whole Follow-up;
- whether “ครั้ง” means calendar days, sessions, or another occurrence;
- whether the count is since the previous Follow-up, a fixed calendar week, or a
  target period copied from the Goal Item;
- how multiple Goal Items are represented in one Follow-up/report group;
- whether a partial status contributes to the count;
- what the denominator is when a Goal Plan has different targets or no target;
- how missing observations and `NOT_APPLICABLE` are treated.

Therefore no `achievedCount` column is added. The narrow future candidate remains
an activity-progress field only if the customer confirms that one integer means
one activity's raw count over a named period. No value is derived from status,
target days, notes, or the number of rows.

## 6. Measurement-period analysis

`/สัปดาห์` appears in the workbook for Goal targets and in the Achieve score
note. It does not distinguish a fixed seven-day calendar week from a rolling
period or the interval between Follow-ups. It also does not establish whether
the period is owned by the Goal Item, the Follow-up, or the report calculation.

No generic `measurementPeriod: string`, date-range abstraction, start date, end
date, or backdated clinical occurrence field is added. `recordedAt` retains its
existing server-controlled meaning and is not reinterpreted as a period
boundary.

## 7. Obstacle analysis

The strongest direct evidence is the repeated Follow-up report group and the
note that obstacle data is recorded only as `มี` or `ไม่มี`. That establishes a
presence-like reporting need, but not the persistence owner. Phase 15C.0 says
the scope may be the Follow-up, activity/item, or Goal Plan and explicitly
defers a narrow boolean/detail pair until that is confirmed.

No obstacle field is added. Existing notes may continue to contain narrative
for their existing meanings, but an empty `reflectionNote` or `generalNote` is
not treated as `false`, and no note is promoted to structured obstacle detail.

## 8. Outcome analysis

The workbook says `ผลลัพธ์ที่ได้` comes from a recorded “ประโยค/วลี” and is a
dropdown in the application. The exact phrase list, versioning, ownership, and
whether the value is staff-entered or computed are not present in the workbook
or accepted rewrite contract.

Legacy values such as `excellent`, `good`, `fair`, `needs_improvement`, and
`monitoring` remain legacy-only. `reflectionNote` and `generalNote` can carry
provisional narrative but do not provide a controlled outcome contract. No
`outcomeCode`, `outcomeStatus`, or duplicate `outcomeNote` field is added.

## 9. Plan-adjustment analysis

The workbook contains `ปรับแผนใหม่` with `ปรับ`/`ไม่ปรับ`, but it does not answer
whether this is:

1. a staff observation that a plan was adjusted;
2. a command to mutate or replace the current Goal Plan; or
3. a signal to create a new immutable Goal Plan round/version.

Because current Goal Plans are immutable and no amendment/version semantics are
accepted, `planAdjusted` is deferred. No Follow-up write changes, archives,
replaces, versions, or creates a Goal Plan.

## 10. Fields implemented

No new structured field is implemented in this phase. The safe subset is the
existing factual Follow-up contract: measurements, confidence/notes, and
activity progress. No schema, migration, request schema, transport, service,
query projection, or UI change is required.

## 11. Fields intentionally deferred

- `achievedCount`: owner, occurrence semantics, period, and multi-goal behavior
  remain unresolved;
- `measurementPeriod`: no accepted period owner or range semantics;
- `obstacle presence`: ownership is unresolved between Follow-up, activity, and
  Goal Plan; `NULL`/`false` semantics cannot be accepted before that decision;
- `obstacleDetails`: workbook supports presence only; detail ownership and
  requiredness are not confirmed;
- `outcomeCode`/`outcomeStatus`: exact controlled phrases and authority are
  missing; existing notes are not silently overloaded;
- `planAdjusted`: observation versus actual Goal Plan mutation/versioning is
  unresolved;
- achievement rate and `>70%`: derived/report metrics remain outside
  persistence until a complete calculation and reporting contract exists;
- all clinical calculations and classifications listed in the phase scope
  exclusions.

## 12. Schema/migration changes

No schema or migration change is justified. There is no safe field to add
without first resolving ownership and meaning. Existing Program-linked and
pre-Program rows are untouched; no values are inferred or backfilled from
notes, status, Goal Plans, or legacy data. No enum, JSON field, EAV model,
foreign key, index, round constraint, or destructive operation is added.

## 13. Validation contract

No new validation contract is added. Existing measurement, confidence, note,
progress-status, relationship, Program, Appointment, Goal Plan, and nonce
validation remains unchanged.

## 14. Idempotency impact

The canonical Follow-up request identity/hash is unchanged because no new
persisted field was added. Existing nonce replay/conflict behavior remains
authoritative, and no new behavioral or clinical value is copied into audit
metadata.

## 15. Authorization/lifecycle impact

No policy or lifecycle changes were made. The existing server-side rules remain:

- HOSPITAL requires active direct membership, exact Hospital, and exact
  PatientHospitalRelationship;
- OSM requires active OSM–Hospital relationship and exact active Patient
  assignment;
- ADMIN-only has no care authority;
- PATIENT has no self-service;
- a Follow-up creator does not receive permanent access.

Program-linked Follow-up writes still require an ACTIVE Program. A COMPLETED
Program remains readable but rejects new Follow-up writes. No new field affects
Program completion and no amendment/correction path is created.

## 16. Query projections

No query projection changes were made. Existing Program-scoped detail and
relationship compatibility history remain unchanged, including chronological
relationship ordering and Program-local round ordering from Phase 15C.1.

## 17. Test coverage

No field-specific tests were added because no new field was implemented. Existing
tests continue to cover Program A/B isolation, completed-Program rejection,
pre-Program history, idempotency, authorization, lifecycle, query projections,
and audit boundaries.

Existing Phase 15C.1 regression tests remain unchanged and are run with the
focused and full suites.

## 18. Verification

Because this phase is documentation-only, verification is limited to the
existing regression and repository checks appropriate to the actual diff. The
executed commands and results are:

| Command | Result |
| --- | --- |
| `npm test -- src/modules/followups` | PASS — 5 files, 56 tests |
| `npm test -- src/modules/patient-program` | PASS — 9 files, 62 tests |
| `npx tsc --noEmit` | PASS |
| `npm run lint` | PASS |
| `git diff --check` | PASS |
| UTF-8/BOM and replacement-character check | PASS — UTF-8 without BOM; no replacement character |

`prisma validate`, `prisma generate`, `prisma:migrate:test`, the full test
suite, and the PostgreSQL integration suite were not rerun for the final
documentation-only diff because no schema or application behavior changed.
No live Supabase or production data is touched.

## 19. Customer decision questions

These questions are ready for the next requirement workshop:

1. For each activity in a Follow-up, does `จำนวนวันที่ทำได้` mean the number of
   occurrences completed since the previous Follow-up, or the number completed
   during a fixed seven-day week?
2. Is achieved count recorded separately for each Goal activity, or is one value
   an aggregate for the whole Follow-up? If aggregate, how are multiple Goal
   Items combined?
3. Does a partial activity count toward achieved count? How are missing and
   `ไม่เกี่ยวข้องในรอบนี้` observations handled?
4. Does the period use a fixed calendar week, a rolling seven-day period, or the
   interval between Follow-ups? Which source owns its start/end?
5. Is obstacle information recorded once for the entire Follow-up, separately
   for each Goal activity, or once for the whole Goal Plan?
6. If obstacle presence is Follow-up-level, should `NULL` mean not recorded and
   `false` mean explicitly no obstacle? Is detail required, optional, or not
   captured? If controlled categories are needed, provide the exact values.
7. Is `ผลลัพธ์ที่ได้` a free-text staff assessment, a fixed dropdown, or a
   computed result? If fixed, provide the exact allowed phrases and their
   versioning/owner.
8. Does `ปรับแผน` only record yes/no that a plan was adjusted, or must the system
   also save a new adjusted Goal Plan? If it saves one, define immutable round,
   amendment, linkage, and history semantics.
9. Does the customer require a separate Follow-up occurrence date or period
   start/end, distinct from server-controlled `recordedAt`?

## 20. Phase 15C.3 readiness

Phase 15C.3 may integrate only the accepted contract documented here:

- existing Goal Plan and Follow-up Program linkage;
- existing factual measurements, confidence, notes, and activity progress;
- no new obstacle field until its owner and `NULL`/false semantics are confirmed;
- no achievement percentage, `>70%` value, outcome enum, obstacle detail, or
  plan mutation UI.

The UI must not display an unresolved obstacle field or invent a calculation or
completion rule. A later customer decision can extend the contract through a
separate migration; this phase does not pre-create a generic observation or
amendment framework.

## Phase status

```text
PARTIAL_COMPLETE_REQUIREMENT_GATED
```

The safe existing Follow-up subset is preserved. Achieved-count period/owner,
obstacle ownership and detail, outcome vocabulary, and plan-adjustment semantics
remain customer-gated requirements rather than engineering defects.
