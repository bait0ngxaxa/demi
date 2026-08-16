# Phase 8A — Goals & Activity Plan Prototype Requirement Contract

- **Status:** `ANALYSIS COMPLETE; PROTOTYPE CONTRACT DOCUMENTED`
- **Date:** 2026-08-16
- **Scope:** Goals and weekly Activity Plan requirement analysis and the smallest
  executable contract for Phase 8B.0
- **Authority:** This document separates accepted rewrite constraints from legacy
  evidence and temporary prototype decisions. Prototype implementation does not
  make unresolved clinical or business behavior production-approved.

Phase 8 continues from the relationship-scoped Screening working prototype. It
adds an explicit Goal Plan operation after Screening, but it does not turn
Screening submission into a Goal mutation.

## 1. Classification and source hierarchy

The source-of-truth order remains:

1. Confirmed current business requirements.
2. Accepted ADRs.
3. Architecture baseline and `docs/CONTEXT.md`.
4. Accepted/implemented phase contracts.
5. Current schema, source code, and tests as implementation evidence.
6. Legacy DEMI only as business-behavior and terminology reference.

The three categories required for this phase are used literally:

| Category | Meaning |
| --- | --- |
| **CONFIRMED** | An inherited architectural or product constraint already accepted in rewritten DEMI. |
| **LEGACY REFERENCE** | Behavior observed in the legacy checkout. It is useful evidence, not authority for the rewrite. |
| **PROTOTYPE ASSUMPTION / OPEN REQUIREMENT** | A temporary choice needed to make the working prototype executable, or a question that still needs customer confirmation. |

No item in the last category becomes a production clinical contract merely
because the Phase 8B.0 UI or database can execute it.

## 2. Evidence inspected

### 2.1 Rewritten DEMI

The analysis inspected:

- `PRODUCT.md`, `DESIGN.md`, `README.md`, and `docs/CONTEXT.md`.
- Accepted ADR-0001, ADR-0002, ADR-0004, ADR-0005, ADR-0006, ADR-0007, and
  ADR-0008.
- `docs/phases/PHASE_6A_PATIENT_ACCESS_AND_ASSIGNMENT.md`.
- `docs/phases/PHASE_6B1_PATIENT_DIRECTORY.md`.
- `docs/phases/PHASE_6B2_PATIENT_OSM_ASSIGNMENT.md`.
- `docs/phases/PHASE_7A_SCREENING_REQUIREMENTS.md`.
- `docs/phases/PHASE_7B0_SCREENING_WORKING_PROTOTYPE.md`.
- The current Prisma schema, Patient detail routes, Screening domain registry,
  Screening policy/services/queries/actions, audit service, UI primitives, and
  focused/integration tests.

### 2.2 Legacy DEMI

The local legacy checkout is:

```text
C:\Users\Bait0ng\Desktop\legacy-demi\demi-plus-web-v2
```

It corresponds to the pinned legacy reference commit used by previous phase
documents:
`7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e`.

The relevant implementation inspected was:

- `app/admin/goals/page.tsx`
- `app/admin/goals-history/page.tsx`
- `app/admin/patients/[id]/goals/page.tsx`
- `app/admin/patients/[id]/goals/setup/page.tsx`
- `lib/supabase/queries.ts`, especially `createDefaultGoals`,
  `getPatientGoals`, `getGoalRoundCount`, `getLatestGoalRound`, and
  `saveGoalsNewRound`.

The checkout contains no committed SQL schema, activity seed, or activity
metadata source that would allow every displayed activity label, target, unit,
or PAM mapping to be independently verified. That limitation is recorded below
instead of being hidden behind an invented “legacy” definition.

## 3. CONFIRMED — inherited rewrite constraints

These constraints are already accepted or implemented in rewritten DEMI. Phase
8 does not reopen them.

### 3.1 Resource and identity boundary

- A Goal Plan belongs to one `PatientHospitalRelationship`, not to a raw
  Person/User ID or a global Patient record.
- `Person` and `User` remain separate. Existing identity and role relationships
  must be reused; Goal creation must not create a new identity or credential.
- The same person may have separate Hospital relationships and therefore
  separate Goal Plan histories in different Hospitals.
- The direct Hospital relationship is the resource boundary. Parent, child,
  sibling, or network Hospital metadata does not widen visibility.
- An OSM–Hospital relationship proves only OSM association. Patient access still
  requires the exact active `PatientOsmAssignment` for the target relationship.

### 3.2 Server authority and application boundary

The accepted boundary remains:

```text
UI
  → Server Action / Route Handler
  → Application Service
  → Policy / Authorization
  → Prisma
  → PostgreSQL
```

- Browser role, Hospital, Patient, assignment, creator, profession, Screening,
  template, and derived values are not authority.
- Every protected Goal read and mutation resolves the authenticated actor and
  target relationship on the server and fails closed on missing, inactive,
  ambiguous, or conflicting state.
- Business orchestration and persistence do not live in pages or Server
  Actions. Server Actions are transport adapters.
- Profession remains a classification, not an authority source, unless a later
  accepted requirement explicitly introduces a profession-specific rule.
- Platform `ADMIN` is a governance actor and has no routine clinical Goal
  access in the current Patient/Screening boundary.

### 3.3 Screening boundary

- Screening is an assessment event with its own capability, history, scoring,
  version, and audit boundary.
- `patient:read` and Patient assignment do not automatically become a Goal or
  clinical capability.
- Screening submission does **not** automatically create, archive, replace, or
  mutate a Goal Plan.
- A Goal Plan may use a server-validated Screening result as context or a
  default suggestion only. It is a separate explicit user-reviewed submission.
- Goal creation must not become an automatic treatment recommendation or a
  hidden clinical rules engine.

### 3.4 Privacy, integrity, and UI foundation

- Goal projections must not expose raw National ID, identity hashes, provider
  subjects/aliases, credentials, activation secrets, or unrelated Patient data.
- Notes are free text and may be sensitive. They are shown only in the
  authorized Goal Plan projection and are not copied into audit metadata.
- A consistency-critical Goal Plan write and its success audit event are one
  local transaction. A partial plan is not a successful business result.
- The protected `/app` shell, Thai-first UI, existing DEMI primitives, semantic
  form controls, visible focus state, and mobile-first responsive behavior are
  the current UI constraints.
- The prototype does not add a generic care-plan engine, workflow engine,
  questionnaire engine, rules engine, template editor, or speculative API.

## 4. LEGACY REFERENCE — observed Goals behavior

The following is a behavioral reading of source code only. It is not accepted
as the rewritten system's authorization, schema, or clinical contract.

### 4.1 Primary Goal

Legacy declares four long-term goal codes in both the global Goals page and the
Patient setup page:

| Code | Legacy label observed |
| --- | --- |
| `weight` | `น้ำหนักลด (Weight Reduction)` |
| `glucose` | `น้ำตาลลง (Glucose Control)` |
| `medication` | `ลดยาได้ (Medication De-escalation)` |
| `remission` | `ภาวะเบาหวานสงบ (Remission)` |

The legacy UI presents these as a single-choice selection. The selected code is
written to `profiles.primary_goal_code` by a separate client-side update. The
legacy labels also contain clinical descriptions, but the current rewrite has
no accepted requirement for those descriptions or for the four-code set.

### 4.2 Weekly activities and PAM mapping

The legacy `createDefaultGoals` helper selects activity codes as follows:

| Legacy PAM grouping | Activity codes observed in source | Default `target_days` observed |
| --- | --- | --- |
| `L2` or `L3` | `stop_sweet`, `reduce_rice`, `protein_vegetable`, `exercise_walk`, `record_weight_sugar` | `5` in `lib/supabase/queries.ts` |
| `L4` | `carb_control`, `protein_intake`, `water_intake`, `stretching`, `cardio`, `strengthening`, `hiit`, `sleep` | `5` in `lib/supabase/queries.ts` |

The Goals page and setup page separately declare a UI default mapping:

```text
L2 → 3 days/week
L3 → 4 days/week
L4 → 5 days/week
```

This is a real legacy inconsistency, not a value that can safely be resolved by
guessing. The code also loads active `activities` rows by `pam_level` or
`ALL`, orders them by `sort_order`, and renders them in activity-type sections.
The committed checkout does not contain the database rows that define the
activity names, descriptions, all target values, units, or exact `sort_order`.

### 4.3 Target values, units, and activity editing

The source provides only a few explicit target facts:

- `exercise_walk` receives a default `15` with unit `minutes` in
  `createDefaultGoals`.
- `water_intake` receives a default `1` with unit `liters` in
  `createDefaultGoals`.
- The prototype's shared exercise range (`5–120`, step `5`, fallback default
  `10`) follows the legacy UI. The water range (`0.1–10`, step `0.1`) and the
  Thai activity labels/categories are prototype data added because the
  committed legacy checkout does not contain the underlying `activities` rows;
  they are not verified clinical or legacy facts.
- The global/setup UI allows `target_days` values from `1` through `7`.
- The exercise UI allows a numeric target between `5` and `120`, step `5`, and
  uses `minutes`; it falls back to `10` when a database target is absent.
- Other target values and units are read from the unavailable `activities` table
  or remain null.

The legacy form displays the selected activity set and lets the operator change
days and, where the UI exposes it, a target value. It does not provide a
clear, explicit per-item add/remove model. The default activity list is
implicitly selected by PAM-level queries. This is evidence for configurable
weekly items, not a confirmed rule about manual add/remove behavior.

### 4.4 Rounds and history

Legacy stores each weekly activity as a row in `goals` with fields including
`round_number`, `is_current`, `status`, `created_at`, `target_days`,
`target_value`, `target_unit`, and notes. Current rows are identified by
`is_current = true` and active status; prior rows are archived by setting
`is_current = false` and `status = archived`.

The observed save flow:

1. Detects active rows created on the current day.
2. Deletes same-day current rows before writing replacements.
3. Otherwise archives old current rows.
4. Calculates a round from distinct dates or existing rows.
5. Inserts the new rows.

The history pages show round/date/activity/target/note information, but one
history page maps individual activity rows to “rounds” rather than grouping
reliably. The legacy strategy has no database concurrency protection around
round allocation and mutates/deletes prior state. It is therefore reference
evidence only and is not copied.

### 4.5 Relationship with Screening

The legacy Screening flow calls `createDefaultGoals()` after a successful
Screening save. The helper creates no defaults for `L1`, five activities for
`L2`/`L3`, and eight activities for `L4`; it can archive active goals when the
level group changes. These are separate client/database operations, so a
successful Screening can coexist with failed or partial Goal writes.

This behavior is explicitly rejected as a Phase 8 side effect. The rewritten
prototype requires an explicit Goal Plan review and submission.

### 4.6 Legacy architecture conflicts

Legacy Goal pages use client-side session/role checks, browser-callable
Supabase queries, client-provided creator and Patient IDs, sequential writes,
deletion/archive replacement, and broad Hospital-network filtering. These are
architecture-conflicting behaviors and are not implementation patterns for the
rewrite.

## 5. PROTOTYPE ASSUMPTION / OPEN REQUIREMENT — Phase 8B.0 contract

### 5.1 Prototype domain model

The working prototype uses two first-class records:

```text
PatientGoalPlan
  id
  patientHospitalRelationshipId
  createdByUserId
  sourceScreeningAssessmentId? 
  templateKey
  templateVersion
  submissionNonce
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
```

Names and exact columns are implementation choices under this prototype
contract. The important invariants are that the plan belongs to one
Patient–Hospital relationship, preserves creator/source/version attribution,
contains one or more item snapshots, and remains readable after later rounds.

### 5.2 Source-defined template

The prototype uses a source-defined immutable registry under
`src/modules/goals/domain/goal-templates/`:

```text
types.ts
legacy-prototype-v1.ts
index.ts
```

The prototype key/version is `demi-goals` / `legacy-prototype-v1`. It contains:

- the four legacy primary-goal codes as provisional reference data;
- the thirteen activity codes observed in legacy source;
- activity category/name/target metadata needed by the form;
- L1–L4 suggestion mappings and provisional target-day defaults;
- bounded target-value and unit rules for the few values supported by the
  source evidence.

The source definition is not a clinical recommendation. A persisted plan stores
the key and version used. Detail/history resolution fails closed if that source
version is unavailable rather than substituting the current definition.

Because the repository is still in requirement-validation stage, a correction
to prototype wording may be made in the existing version only while persisted
data is not yet accepted as customer/production evidence. Once historical
customer evidence must be preserved, wording/meaning changes require a new
immutable version, following the Phase 7B.0 policy.

### 5.3 Screening context and default behavior

- The Goals page reads the latest relationship-scoped Screening summary when
  one exists.
- The latest result is context/default input only. It never creates, edits,
  archives, or invalidates a Goal Plan.
- The form may attach the selected/latest Screening assessment ID as a
  historical source reference; the service rechecks that it belongs to the
  same relationship. A browser cannot attach a Screening from another Patient
  or Hospital.
- A Goal Plan may be created without any Screening. This follows the legacy
  Patient Goals entry point and keeps the prototype demonstrable when no
  assessment exists. Without Screening context, no PAM-based default set is
  asserted; the operator selects from the source-defined activity list.
- When a Screening exists, L1–L4 mappings are displayed as provisional
  suggestions. The operator explicitly reviews the selected primary goal and
  activity configuration before submission.

### 5.4 Capability and prototype authorization policy

The prototype introduces only:

```text
goal:read
goal:plan
```

| Actor | Prototype authority | Scope predicate |
| --- | --- | --- |
| Active direct Hospital `OWNER` | Read + create | `HOSPITAL` role, active direct OWNER membership, active target Hospital, matching relationship |
| Active direct Hospital `MEMBER` | Read + create | Same as OWNER; profession has no independent effect |
| Active assigned OSM | Read + create | `OSM` role, active OSM–Hospital relationship, active exact assignment, matching active Hospital relationship |
| `PATIENT` | Denied | Patient self-service is deferred |
| Platform `ADMIN` | Denied | No routine clinical access or bypass |

This is a **prototype policy assumption** for requirement validation, aligned
with the requested Phase 8 recommendation. Customer authority, review, and
profession decisions remain open.

### 5.5 Immutable rounds and retry semantics

The prototype stores each deliberate submission as a new round. It does not
use `isCurrent`, archive flags, same-day deletion, or edit/delete UX.

- Latest/current means the highest immutable `roundNumber` for the relationship.
- The database enforces unique `(patientHospitalRelationshipId,
  roundNumber)`.
- Serializable transactions plus bounded retry handle concurrent round
  allocation. A unique/serialization conflict is retried; the application does
  not trust `max(roundNumber) + 1` without database protection.
- A per-form UUID `submissionNonce` is unique. Same nonce plus identical
  accepted payload/scope returns the existing plan. Same nonce with changed
  payload, actor, source, or relationship is rejected. A new nonce creates a
  deliberate later round.

### 5.6 Validation and persistence boundary

The Server Action accepts only opaque relationship/nonce references, primary
goal code, notes, source Screening reference, and item configuration. It rejects
unexpected fields and does not accept creator, Hospital, Patient, PAM, level,
Zone, or template authority fields.

The service revalidates:

- primary goal membership in the source template;
- activity membership and duplicate-free item codes;
- `targetDays` range `1–7`;
- target-value range, step, and exact unit where the template allows a value;
- no target value/unit for activities that do not support one;
- source Screening relationship, if supplied;
- active actor/relationship/Hospital/assignment policy.

Plan, items, and `goal_plan.created` audit event commit or roll back together.
Audit metadata contains only bounded opaque IDs and template/round values; it
does not contain Patient name, HN, notes, or health narrative.

### 5.7 Explicitly deferred

Phase 8B.0 does not implement:

- Patient Goal self-service;
- Goal approval/review workflow;
- editing, deletion, correction, amendment, or revision UX;
- automatic Goal creation from Screening;
- treatment recommendations, Care Plans, clinical rules, or generic workflow;
- activity completion/adherence/progress/weight/BMI/blood pressure/glucose/
  HbA1c/medication tracking;
- appointments, follow-up, referral, notification, LINE/LIFF, ThaID, native
  API, offline sync, queues, workers, FHIR/HL7, reporting, dashboards, or
  template editor;
- arbitrary backdating or a separate business “occurred at” field;
- routine Goal read audit unless a later requirement requires it.

## 6. Open requirements

The following must remain unresolved unless the customer explicitly confirms
them:

1. Who may create a Goal Plan?
2. Should Hospital OWNER and MEMBER have identical authority?
3. Can an assigned OSM create Goals or only suggest them?
4. Does Doctor/Nurse/another profession affect authority?
5. Should a Hospital review/approve an OSM-created plan?
6. Can a Patient create or modify their own Goals?
7. Are `weight`, `glucose`, `medication`, and `remission` still the correct primary goals?
8. Are weekly activities still determined by PAM/Screening level?
9. Are the default target days clinically/product-correct?
10. Can activities be manually removed or added, and by whom?
11. What exactly does `targetValue` mean for each activity?
12. Which units and precision/ranges are valid?
13. Can an existing submitted Goal Plan be edited?
14. If correction is needed, must it be an amendment/revision?
15. Is a submitted Goal Plan immediately final?
16. Can Goal Plans be backdated?
17. Should routine Goal reads be audited?
18. Should Goal creation require a Screening?
19. Can a Goal Plan exist without Screening?
20. Should a new Screening suggest, require, or invalidate a Goal Plan?
21. Which fields are visible to Hospital OWNER/MEMBER, OSM, and Patient?
22. What follow-up/progress information should reference a Goal Plan?

Until these are confirmed, Phase 8B.0 behavior is demo/reference behavior only.

## 7. Phase 8A conclusion

The smallest coherent prototype is an explicit, relationship-scoped,
server-authorized Goal Plan submission with source-defined provisional
templates, optional Screening context, immutable rounds, atomic items/audit,
bounded retry protection, and a history/detail projection. It preserves the
Screening boundary and leaves clinical authority, definitions, visibility,
review, and correction decisions visible for customer validation.
