# DEMI Phase 15C.1 — Service 2 Program Linkage & Domain Persistence

## 1. Objective

Phase 15C.1 adds the minimum persistence and application-service foundation for using the existing `PatientGoalPlan` and `PatientFollowup` domains inside multiple `PatientProgram` episodes.

The authoritative workflow boundary is now:

```text
PatientHospitalRelationship
  └─ PatientProgram
       ├─ PatientGoalPlan ── PatientGoalItem
       └─ PatientFollowup ── PatientFollowupActivityProgress
```

No duplicate Service 2 models were introduced. Appointment remains an optional, relationship-scoped operational record.

## 2. Schema changes

`PatientGoalPlan` and `PatientFollowup` now each have:

```prisma
patientProgramId String? @db.Uuid
```

They have composite optional relations to `PatientProgram` using `(patientProgramId, patientHospitalRelationshipId)`. `PatientProgram` exposes inverse `goalPlans` and `followups` relations.

`PatientGoalItem` and `PatientFollowupActivityProgress` do not receive duplicated Program IDs; their ownership is inherited from the parent.

Goal Plan keeps its existing single-column Follow-up source relation for historical rows. A second composite relation is present for the database backstop on Program-linked Follow-ups.

No Appointment Program relation or new Service 2 completion state was added.

## 3. Migration strategy

Migration:

```text
prisma/migrations/20260821120000_patient_program_service_two_linkage/migration.sql
```

The migration is additive and:

1. adds nullable Program IDs;
2. leaves existing values `NULL`;
3. replaces relationship-wide round indexes with linked `Program + roundNumber` unique indexes;
4. adds narrow partial unique indexes for the historical `NULL` Program namespace;
5. adds composite Program/relationship foreign keys;
6. adds a composite Follow-up → Goal Plan source foreign key;
7. adds Program/time lookup indexes.

All workflow-history foreign keys use `ON DELETE RESTRICT`. The partial historical indexes are intentional manual SQL because Prisma schema declarations do not express this PostgreSQL predicate precisely.

The migration contains no data update and no guessed relationship-to-Program assignment.

## 4. Historical NULL-record strategy

Existing Goal Plan and Follow-up rows remain explicitly unlinked:

```text
patientProgramId = NULL
```

No old Goal Plan/Follow-up rows were backfilled by guess. They represent pre-Program relationship history.

The existing relationship-level reads and legacy/prototype create paths remain for compatibility. Their behavior is provisional compatibility history only; they are not the current state of a Program workflow. New Program actions require `patientProgramId`, and Program query functions filter by the exact Program ID.

History/detail/reference projections expose nullable `patientProgramId` so callers can distinguish legacy history from Program A and Program B records.

## 5. Goal Plan Program contract

`createGoalPlanForProgram` and `submitGoalPlanForProgramAction` accept a strict Program-oriented request. The browser supplies only `patientProgramId` and the existing Goal Plan payload.

The service:

1. validates the Program ID;
2. resolves the Program and authoritative relationship server-side;
3. resolves the current authoritative actor and scope;
4. requires `PatientProgram.status = ACTIVE`;
5. reuses the existing Goal template and validation;
6. validates optional Screening provenance against the derived relationship;
7. allocates the next round in the exact Program namespace;
8. creates the Goal Plan, items, and audit event in one serializable transaction;
9. preserves submission nonce idempotency and includes Program identity in the comparison.

The browser cannot choose the relationship, hospital, actor, role, or round as authoritative values.

## 6. Follow-up Program contract

`createFollowupForProgram` and `createFollowupForProgramAction` accept `patientProgramId` plus the existing optional Appointment, source Goal Plan, measurements, confidence, notes, activity progress, and nonce fields.

The service:

1. resolves the Program and exact relationship server-side;
2. authorizes the current actor against the current scope;
3. requires an ACTIVE Program;
4. validates an optional Appointment against the exact relationship and requires `COMPLETED` status;
5. validates an optional source Goal Plan against the same Program and relationship;
6. validates activity codes against that selected Goal Plan;
7. allocates the next round in the exact Program namespace;
8. creates Follow-up, activity progress, and audit data atomically;
9. preserves nonce/hash idempotency with Program identity included.

Follow-up without a Goal Plan remains valid. Empty activity progress remains valid when no Goal Plan is selected.

## 7. Round namespace behavior

Linked rows use:

```text
patientProgramId + roundNumber
```

Therefore Program A and Program B may both have Goal Plan round 1 and Follow-up round 1. Historical rows use:

```text
patientHospitalRelationshipId + roundNumber
WHERE patientProgramId IS NULL
```

No fixed round columns were introduced.

## 8. Same-Program source Goal Plan invariant

For a Program-linked Follow-up, `sourceGoalPlanId`, `patientProgramId`, and `patientHospitalRelationshipId` must resolve to the same Goal Plan namespace.

The application validates this through the Program-scoped Goal query before writing activity progress. PostgreSQL also enforces the composite source foreign key. The historical nullable path retains the existing single-column source relation and compatibility behavior for pre-Program rows.

## 9. Authorization behavior

Program linkage is not authorization. Current authorization remains server-side and is evaluated at the time of each read or mutation.

- HOSPITAL requires an active direct membership, an active hospital, and the exact relationship scope.
- OSM requires an active OSM–Hospital relationship and an exact active Patient assignment.
- ADMIN-only has no care authority through Platform Admin role alone.
- PATIENT has no Goal Plan or Follow-up self-service in this phase.
- `createdByUserId` remains provenance, not permanent access.

Program-specific paths reuse the existing Program scope policy and Goal/Follow-up record policy boundaries. Stale OSM assignments are rechecked on submit.

## 10. Program lifecycle behavior

New Program-linked Goal Plan and Follow-up writes require `ACTIVE` status. Completed Programs remain readable through Program-scoped queries and reject new writes with a normalized conflict.

Program completion remains independent of Service 2 completion. No Goal Plan, Follow-up, activity, achievement, outcome, or threshold gate was added.

The shared lifecycle helper uses the Phase 15B conditional Program-row update. The mutation and Program completion serialize on the same row, so a committed child write is followed by completion, or completion commits first and the child write is rejected.

## 11. Concurrency and idempotency

Both Program-scoped services retain:

```text
Serializable transaction
unique database namespace
bounded P2034/P2002 retry
```

Round lookup is performed in the exact Program namespace after the lifecycle guard.

Goal Plan nonce comparison includes Program ID. Follow-up canonical request identity and comparison include Program ID. Reusing a nonce across Program A and Program B conflicts instead of replaying or moving the original record.

Audit events remain inside the consistency-critical transaction and include non-sensitive resource context: resource ID, Program ID when linked, relationship ID, hospital ID, and round number. Clinical values and free text are excluded.

## 12. Query/read separation

Program-scoped primitives are available through the existing domain services:

```text
getGoalPlanCreateContextForProgram(...)
getGoalPlanOverviewForProgram(...)
getGoalPlanDetailForProgram(...)
getAccessibleGoalPlanOptionsForProgram(...)
getAccessibleGoalPlanActivityContextForProgram(...)
createGoalPlanForProgram(...)

getFollowupCreateContextForProgram(...)
getFollowupHistoryForProgram(...)
getFollowupDetailForProgram(...)
createFollowupForProgram(...)
```

Program reads never use relationship-level latest Goal Plan or latest Follow-up as Program state. Existing relationship history reads remain available and expose nullable Program ownership for separation. No Program-detail UI was added in this phase.

## 13. Integration tests

The Program integration suite covers:

- Program ownership and exact relationship derivation;
- independent Goal Plan and Follow-up rounds across Program A and B;
- legacy `NULL` rows and relationship-history separation;
- Program query isolation and completed-history reads;
- cross-Program source Goal Plan rejection;
- cross-relationship composite FK rejection;
- linked and historical uniqueness constraints;
- completed Program write rejection;
- Goal Plan and Follow-up nonce isolation;
- concurrent round allocation;
- Goal/Follow-up versus Program completion serialization;
- stale OSM assignment rejection;
- PostgreSQL constraint/index introspection.

Existing Goal, Follow-up, authorization, Appointment, Service 1, Program lifecycle, Evidence, and other integration coverage remains in place.

## 14. Verification results

The final verification run completed with:

```text
npx prisma validate                         PASS
npx prisma generate                         PASS (Prisma Client v6.19.3)
npx prisma migrate reset --force --skip-seed PASS on the disposable local database
npm run prisma:migrate:test                 PASS (no pending migrations)
npm test -- src/modules/goals src/modules/followups src/modules/patient-program
                                             PASS (20 files, 166 tests)
npm test                                    PASS (107 files, 689 tests)
npx tsc --noEmit                            PASS
npm run lint                                PASS
npm run test:integration                    PASS (18 files, 151 tests)
git diff --check                            PASS
```

The reset target was verified from `.env.integration` as the disposable PostgreSQL instance at `127.0.0.1:55432`, database `demi_test`. The final 15C.1 migration was applied from a clean local database before the integration run. Required checks were:

```text
npx prisma validate
npx prisma generate
npm run prisma:migrate:test
npm test -- src/modules/goals src/modules/followups src/modules/patient-program
npm test
npx tsc --noEmit
npm run lint
npm run test:integration
git diff --check
```

Migration verification must inspect the actual disposable PostgreSQL indexes and constraints, including both partial historical unique indexes, both Program round indexes, the two Program/relationship foreign keys, and the composite source Goal Plan foreign key.

One earlier full integration attempt exposed an intermittent pre-existing Phase 15B Baseline/open race: `recordAuditEvent` normalizes a transient serialization failure as `InfrastructureError`, so the Baseline retry loop cannot classify that particular failure. The affected test passes in isolation and subsequent full integration runs passed; 15C.1 did not weaken the assertion or change the unrelated audit behavior.

## 15. Remaining 15C.2 decisions

15C.1 intentionally does not add or infer:

```text
achievedCount
measurementPeriod
achievementRate
achievementPercent
over70Percent
outcomeCode
outcomeStatus
planAdjusted
hasObstacle
obstacleDetails
```

The customer contract still needs to define achieved-count semantics, measurement period, obstacle ownership, outcome representation, and plan-adjustment observation before structured Follow-up fields are added. Official achievement rate, `>70%`, and reporting aggregation remain deferred.

## 16. Recommended Phase 15C.2 handoff

Start 15C.2 with a contract review for structured behavioral Follow-up data only. Confirm field ownership, allowed values, measurement period, amendment/history expectations, and privacy/audit rules first. Keep the Program linkage, lifecycle guard, round namespace, authorization boundaries, and query separation from 15C.1 as fixed foundations.

## Compatibility and scope note

Implemented invariants are database-backed Program/relationship ownership, Program-scoped linked rounds, historical nullable uniqueness, same-Program linked source validation, ACTIVE-only new Program writes, serialized Program completion, Program-aware idempotency, and exact Program queries.

Provisional compatibility behavior is the continued relationship-level Goal Plan/Follow-up history and standalone prototype create paths. They must not be used as the current state of a Program workflow.

Unresolved customer requirements are the structured 15C.2 behavioral fields and all achievement/outcome/reporting semantics. Service 2 UI integration and reporting remain explicitly out of scope.
