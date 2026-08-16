# Phase 8B.0 — Goals & Activity Plan Working Prototype

- **Status:** `IMPLEMENTED — REQUIREMENT-VALIDATION PROTOTYPE`
- **Date:** 2026-08-16
- **Preceded by:** [Phase 8A Goals & Activity Plan Requirements](./PHASE_8A_GOALS_AND_ACTIVITY_PLAN_REQUIREMENTS.md)

This handoff describes the working prototype only. Implemented behavior is not
customer acceptance of the provisional clinical definitions, authority rules,
PAM mappings, target values, or future Goal lifecycle.

## 1. Demonstrable flow

An authorized Hospital user or an OSM with an exact active Patient assignment
can now perform this flow:

```text
Patient Detail
  → Goals / Activity Plan
  → latest Screening context, if available
  → Goal Plan history
  → Create Goal Plan
  → explicitly choose Primary Goal (no default selection)
  → select/configure weekly activities
  → review
  → submit
  → persisted Goal Plan detail
  → create a later round
  → earlier round remains readable and unchanged
```

The UI shows the Thai prototype notice:

> ต้นแบบเพื่อเก็บ Requirement
>
> เป้าหมาย กิจกรรม ค่าเริ่มต้น และความสัมพันธ์กับผล Screening ในหน้านี้เป็นต้นแบบอ้างอิงรูปแบบจากระบบ DEMI เดิม และยังไม่ใช่ข้อกำหนดทางคลินิกฉบับสุดท้าย

Screening is never submitted as a side effect of Goal creation, and Goal
creation is never a side effect of Screening submission.

When the latest Screening is used for prototype activity suggestions, the form
automatically preserves that assessment ID as source context. The operator can
freely change, add, or remove suggested activities before submission; this is
provenance retention, not clinical enforcement. If no Screening exists, the
form starts with no suggested activities and persists a null source.

## 2. Inherited architecture and security boundaries

- `PatientHospitalRelationship` is the resource boundary. Goal routes do not
  use a raw Person/User ID as the clinical resource key.
- Server-resolved `ActorContext`, capability, authoritative Hospital state, and
  relationship/assignment scope are required for every Goal read and mutation.
- Direct active Hospital `OWNER` and `MEMBER` memberships are allowed for the
  exact Hospital. Profession does not independently alter prototype authority.
- OSM requires the `OSM` role, an active OSM–Hospital relationship, and an exact
  active `PatientOsmAssignment` for the same Patient–Hospital relationship.
- `PATIENT` and Platform `ADMIN` are denied routine Goal access in this
  prototype. Parent/child Hospital hierarchy never widens scope.
- Browser role, Hospital, Patient, assignment, creator, Screening, template,
  PAM, level, Zone, and derived values are not authoritative.
- Screening context shown in Goals is requested through the Screening-owned
  `screening:read` query boundary. Goal capability alone does not authorize
  Screening context, and only a minimal level/Zone summary crosses the module
  boundary.
- UI → Server Action → application service → policy/access resolution → Prisma
  remains the implementation boundary. Prisma is not an authorization engine.

The provisional capabilities are:

```text
goal:read
goal:plan
```

These names and the actor matrix are requirement-validation assumptions, not
final business authorization.

## 3. Source-defined prototype template

The registry is deliberately small and first-class:

```text
src/modules/goals/domain/goal-templates/
├── types.ts
├── legacy-prototype-v1.ts
└── index.ts
```

The current source key/version is:

```text
templateKey: demi-goals
templateVersion: legacy-prototype-v1
```

It contains the four legacy reference Primary Goal codes, thirteen legacy
activity codes, Thai display labels, categories, provisional target rules, and
L1–L4 suggestion mappings. The legacy checkout did not include the activity
database seed/metadata rows, and the source contains a target-day conflict
(the helper writes 5 for L2/L3 while UI constants show L2=3, L3=4, L4=5).
The prototype chooses the UI mapping for defaults and records this as an
unresolved requirement in the Phase 8A contract.

The observed `exercise_walk` default is 15 minutes and the observed
`water_intake` default is 1 liter. The shared exercise range and the water
range/step used by this prototype are bounded executable assumptions; activity
labels, categories, and those bounds are not claimed to be verified clinical
metadata.

Persisted plans retain `templateKey` and `templateVersion`. Historical detail
fails closed if the referenced version or activity definition is unavailable;
it does not silently substitute the current template. During the current
requirement-validation period, wording corrections may follow the existing
Screening prototype policy only while the meaning is not yet accepted as
historical customer evidence. Meaningful historical changes require a new
version once that evidence must be preserved.

## 4. Persistence model

The Prisma schema and migration add two first-class models:

```text
PatientGoalPlan
  id
  patientHospitalRelationshipId
  createdByUserId
  sourceScreeningAssessmentId?
  submissionNonce
  templateKey
  templateVersion
  roundNumber
  primaryGoalCode
  primaryGoalNote?
  weeklyNote?
  createdAt

PatientGoalItem
  id
  goalPlanId
  activityCode
  targetDays
  targetValue?
  targetUnit?
  sortOrder
  createdAt
```

Database constraints include:

- unique `PatientGoalPlan.submissionNonce`;
- unique `(patientHospitalRelationshipId, roundNumber)`;
- unique `(goalPlanId, activityCode)`;
- relationship/creator/source foreign keys with restrictive deletion;
- item-to-plan foreign key with cascade deletion only as an internal plan
  cleanup invariant.

The migration is:

```text
prisma/migrations/20260816160000_goals_activity_plan_working_prototype/migration.sql
```

There is no `isCurrent`, mutable archive flag, same-day replacement, or edit
operation. The current/latest projection is newest immutable `roundNumber`.
Previous rounds remain readable.

## 5. Validation and transaction

`goalPlanSubmitRequestSchema` is strict and accepts only relationship/nonce
references, optional source Screening reference, Primary Goal code, bounded
notes, and item configuration. The application service then revalidates all
accepted values against the source template:

- known Primary Goal code;
- known, duplicate-free activity codes;
- `targetDays` in `1..7`;
- required value/unit for activities with a target rule;
- exact unit, finite value, range, and step alignment;
- no value/unit for activities without a target rule;
- source Screening belongs to the same relationship when supplied;
- source Screening is accessible under the Screening module's `screening:read`
  policy when supplied;
- active actor/relationship/Hospital/assignment policy.

Creation executes as one serializable operation:

```text
resolve authoritative actor and relationship scope
  → resolve source Screening relationship, if supplied
  → resolve source template
  → validate Primary Goal and items
  → find latest round
  → create PatientGoalPlan + PatientGoalItems
  → create bounded goal_plan.created audit event
```

The service retries bounded PostgreSQL serialization/unique conflicts. A
database failure or audit failure cannot produce a successful partial result;
Prisma transaction semantics roll the local operation back.

## 6. Retry and duplicate-submission behavior

Every form gets an opaque UUID `submissionNonce`.

```text
same nonce + same accepted payload and scope → return existing plan
same nonce + changed payload/scope           → reject with conflict
new nonce                                    → create a new deliberate round
```

Round allocation is protected by serializable isolation and the unique
relationship/round constraint. The service does not rely on an unprotected
`max(roundNumber) + 1` calculation.

## 7. Audit and privacy

Successful creation records:

```text
action:       goal_plan.created
resourceType: PatientGoalPlan
```

Metadata is bounded to opaque IDs, Hospital ID, round number, template version,
and optional source Screening ID. It does not contain Patient name, HN, notes,
health narrative, National ID, identity hash, credential, provider subject,
password, token, or authentication data. Routine Goal reads are not audited in
this slice.

## 8. Routes and projections

```text
/app/patients/[relationshipId]/goals
/app/patients/[relationshipId]/goals/new
/app/patients/[relationshipId]/goals/[goalPlanId]
```

The overview displays Patient/Hospital context, latest Screening level/Zone if
available, latest Goal Plan, and bounded newest-first history. History includes
round, created date, Primary Goal label, creator display name, item count,
template version, and source Screening summary.

History is bounded to the newest 50 rows in this prototype; the UI says
“แสดงล่าสุดไม่เกิน 50 รอบ” and does not claim that the returned row count is the
complete historical total. Any displayed Screening context still requires the
Screening module's `screening:read` boundary.

Detail displays Patient/Hospital, round/date/creator, Primary Goal and notes,
activities with target days/value/unit, template key/version, and the optional
historical Screening context. Unknown template/activity history fails closed.
No Patient identity provider/authentication fields are projected.

The existing Patient detail page now links to both Screening and Goals. No
dashboard, progress percentage, health metric, appointment, or clinical claim
was added.

## 9. Tests

Focused tests are under `src/modules/goals/`:

- source template key/version, Primary Goals, activity definitions, mappings,
  and unknown-version behavior;
- strict input, unknown/duplicate values, target-day/value/unit rules,
  unexpected fields, including empty Primary Goal selection;
- Hospital OWNER/MEMBER, profession neutrality, wrong/inactive Hospital or
  membership, exact OSM assignment, wrong Hospital assignment, PATIENT, and
  ADMIN policy behavior;
- transactional service orchestration, immutable round allocation, retry
  deduplication, changed-payload conflict, deliberate new round, and bounded
  audit metadata;
- relationship-scoped newest-first history, minimal projection, detail source
  context, Screening read-boundary enforcement, unknown historical definitions,
  and cross-relationship denial;
- Server Action transport allow-list, safe errors, and no client authority
  fields.

PostgreSQL integration coverage is in
`tests/integration/goals.integration.test.ts` and covers:

- no automatic Goal creation from Screening;
- Screening-derived source retention with edited activities, null source when no
  Screening exists, and cross-relationship source rejection;
- first round, same-nonce retry, changed-payload rejection, second round,
  historical detail, and newest-first history;
- exact active OSM assignment and denial for another Hospital, unassigned OSM,
  PATIENT, and ADMIN;
- concurrent deliberate submissions producing unique rounds;
- invalid source reference rejected without a persisted plan;
- bounded audit count and no sensitive values in returned projections.

## 10. Explicitly deferred

This phase does not implement Patient self-service, approval/review workflow,
editing, deletion, correction/amendment/revision, backdating, activity
completion, adherence/progress, weight/BMI/waist/HbA1c/blood-pressure/blood
sugar/medication tracking, treatment recommendations, Care Plans, clinical or
generic rules/workflow/template engines, appointments, follow-up, referrals,
notifications, LINE/LIFF, ThaID, native API, offline sync, workers/queues,
FHIR/HL7, clinical reporting, dashboards, or a generic template editor.

## 11. Customer validation checklist

All answers below remain unresolved until explicitly confirmed:

1. Are the current four Primary Goals correct?
2. Are any Primary Goals missing?
3. Should activities depend on PAM/Screening level?
4. Are the legacy activity definitions still correct?
5. Are the default days/week correct?
6. Which target values and units are needed for each activity?
7. Can Hospital MEMBER create plans, or only OWNER/selected professions?
8. Can OSM create plans for assigned Patients?
9. Does an OSM-created plan require Hospital approval?
10. Should Doctor/Nurse professions differ?
11. Can Patient create or edit their own Goals?
12. Must a Screening exist before a Goal Plan?
13. Should latest Screening only suggest defaults or enforce them?
14. When should a new Goal round be created?
15. Can an existing submitted round ever be edited?
16. If correction is needed, what revision/amendment semantics are required?
17. What Goal information can Hospital users see?
18. What Goal information can OSM see?
19. What Goal information should Patient eventually see?
20. Should Goal reads be audited?
21. What future Follow-up/Progress data should be measured against each activity?
22. What event means a Goal is completed, failed, cancelled, or superseded?

## 12. Validation commands

Run the repository-equivalent checks:

```text
npx prisma validate
npx prisma generate
npm run typecheck
npm run lint
npx vitest run src/modules/goals
npm run test:integration
```

The integration command requires the repository's disposable local PostgreSQL
environment from `.env.integration`/Docker-enabled WSL. If unavailable, the
focused checks remain useful but PostgreSQL isolation/foreign-key behavior must
still be run before treating this handoff as fully verified.
