# Phase 15D.1 — Final Assessment Domain & Persistence

## Baseline and scope

Implementation baseline: `7a09c03abb222ff941055c90f0fa815fc34df198`

Phase 15D.1 introduces the first narrow persistence/domain boundary for an
explicit Final Assessment. The ownership chain is:

```text
PatientHospitalRelationship
  -> PatientProgram
    -> PatientFinalAssessment
```

This slice provides server-side create/read services, strict structural input
validation, exact Program-scoped authorization and reads, transactional audit,
database ownership constraints, and integration coverage. It does not add
Final Assessment UI, reporting, clinical calculations, or a generic clinical
record abstraction.

The implementation follows the accepted Phase 15D.1 SAFE PROTOTYPE DEFAULTS.
Those defaults are provisional and reversible if a later requirement-gated
phase changes them.

## Accepted MVP defaults

- Cardinality is zero or one Final Assessment for each PatientProgram.
- Final Assessment is immutable. Only `CREATE` and `READ` exist in this
  phase; there is no update, delete, replace, amend, version, approval, or
  reopen operation.
- A Final Assessment can be created only while its owning Program is
  `ACTIVE`.
- A Final Assessment remains historically readable after the Program becomes
  `COMPLETED`.
- Final recording and Program completion are independent. Neither operation
  automatically performs the other.
- The create authorization boundary reuses the existing `program:manage`
  capability. The read boundary reuses the existing `program:read`
  capability. No new role or clinical capability was introduced.
- A record must contain at least one provisional raw measurement.
- `recordedAt` is application persistence/recording time supplied by the
  server. It is not claimed to be the clinical observation time.

## Schema and ownership

The Prisma model is `PatientFinalAssessment` with the following provisional
raw fields:

- `weight`
- `waistCircumference`
- `systolicBloodPressure`
- `diastolicBloodPressure`
- `bloodSugar` (the repository-consistent DTX/blood-glucose-like factual
  field)

Structural metadata is limited to the record ID, exact Program and
relationship IDs, server-derived recorder ID, `recordedAt`, and `createdAt`.

The record stores both `patientProgramId` and
`patientHospitalRelationshipId`. A composite foreign key references the
existing unique Program identity:

```text
PatientFinalAssessment(patientProgramId, patientHospitalRelationshipId)
  -> PatientProgram(id, patientHospitalRelationshipId)
```

This makes a relationship mismatch a database-level failure as well as an
application-level authorization failure. A direct relationship foreign key
and the recorder foreign key are also required. Existing Programs receive no
backfilled rows; absence is represented by no Final Assessment record.

The database has a unique constraint on `patientProgramId`, enforcing the
zero-or-one cardinality. Prisma also requires the exact composite relation
fields to be unique for the composite relation, so the migration contains the
corresponding composite unique index. That index is an ownership-integrity
constraint, not a relationship-wide latest-record index.

The migration additionally enforces the minimum-content rule with a database
check requiring at least one of the five raw measurement columns to be
non-null.

## Validation and service boundary

`patientFinalAssessmentCreateRequestSchema` is a strict object schema. It:

- accepts only the exact Program/relationship IDs and five approved raw
  measurement fields;
- normalizes UUIDs consistently after schema validation;
- accepts finite, non-negative numbers up to the existing structural maximum
  of `1,000,000`;
- rejects NaN, infinities, negative values, over-bound values, unexpected
  fields, and an empty measurement payload;
- does not introduce clinical thresholds or interpretations.

The existing Baseline/Follow-up schemas do not require systolic and diastolic
blood pressure to be supplied as a pair, so this slice preserves that
repository convention and does not invent a new pairing rule.

`createPatientFinalAssessment` does not accept `recordedByUserId` or
`recordedAt` from the caller. It derives both from the authoritative server
actor and server time. It returns a sanitized structural result and exposes no
update/delete/amendment API.

`getPatientFinalAssessmentForProgram` resolves the exact Program and returns:

- owning Program ID and relationship ID;
- current Program status;
- explicit Final Assessment presence/absence;
- recorder identity and persistence timestamps;
- the five stored raw measurement values.

The query is Program-local. It does not search for a relationship-wide latest
Final, inspect Follow-ups, infer a Final from completion, or calculate any
clinical/reporting result.

## Authorization and fail-closed access

The Final Assessment access resolver delegates to the established exact
PatientProgram access boundary. That boundary re-reads authoritative User
status, Hospital status, Hospital membership, and applicable OSM assignment
inside the database context before applying the existing capability and scope
policy.

For create, the resolver uses the Program-management scope. For read, it uses
the Program-readable historical scope. A supplied relationship ID is checked
against the relationship derived from the exact Program; a mismatch fails
closed. Read access does not depend on the original recorder, so authorized
historical reads continue to work after completion.

## Lifecycle and concurrency invariants

Creation enters a Serializable transaction and uses the existing
`lockActivePatientProgram` lifecycle boundary. The transaction:

1. resolves exact actor/Program/relationship access;
2. re-reads and conditionally locks the authoritative Program row;
3. requires `status = ACTIVE` and `completedAt = null`;
4. checks the existing Program-local Final Assessment;
5. inserts the immutable record with server-derived provenance/time;
6. writes the bounded audit event before committing.

The same Program-row lock protocol is used by Program completion. Therefore a
Final-create versus completion race has only these valid serialized outcomes:

- Final creation commits first, then completion commits and the Final remains
  historically readable; or
- completion commits first, then the Final create is rejected as a completed
  Program.

Concurrent duplicate creates are additionally protected by the database
unique constraint. A duplicate or serialization conflict is normalized to a
safe application conflict result; raw Prisma details are not returned.

The transaction retry path follows the existing Phase 15C.4 convention:

- retry `P2002` and `P2034` within the bounded Serializable retry policy;
- normalize exhausted uniqueness/serialization conflicts safely;
- normalize `P2003` as an ownership/data-integrity conflict;
- preserve application errors;
- allow retryable audit errors to reach the enclosing retry layer.

If audit persistence fails, the Final row and audit event are part of the same
transaction and the Final insert is rolled back.

## Program A → Program B isolation

All writes and reads resolve an exact Program ID and its derived relationship.
The composite foreign key rejects attaching a Final from Program A with
Program B's relationship identity. Program B has no relationship-wide fallback
query and therefore observes only its own Final Assessment or explicit
absence. A completed Program A record is never used as Program B's current or
previous Final.

## Audit boundary

Creation writes the bounded action `patient_final_assessment.created` with
resource type `PatientFinalAssessment` in the same transaction as the Final
row. Metadata is limited to structural identifiers:

- `patientFinalAssessmentId`
- `patientProgramId`
- `patientHospitalRelationshipId`
- `hospitalId`

Raw clinical/provisional values, free text, and other sensitive measurement
payload are not copied into audit metadata. The Final row remains the source
of truth for those values.

## Migration

Migration:

`prisma/migrations/20260822100000_patient_final_assessment_domain_persistence/migration.sql`

The migration creates `PatientFinalAssessment`, its minimum-content check,
Program cardinality/index constraints, the exact composite Program foreign
key, the relationship foreign key, and the recorder foreign key. It performs
no historical backfill and does not convert Follow-ups or completed Programs
into Final Assessments.

## Verification

The following checks were run for this slice:

- `npx prisma validate`
- `npx prisma generate`
- `npx tsc --noEmit`
- `npm run lint`
- `npm test -- src/modules/patient-final-assessment`
- `npm test`
- `npm run test:integration`
- `git diff --check`

Targeted unit coverage covers strict validation, provenance, access
resolution, lifecycle rejection, duplicate conflicts, retry/error
normalization, exact Program reads, historical completion reads, and atomic
audit failure behavior. Integration coverage covers persistence, authorization
drift, ownership, Program A/B isolation, absence, completion independence,
duplicate concurrency, and the Final-versus-completion race.

## Requirement-gated exclusions

The following remain unresolved and were intentionally not implemented:

- HbA1c semantics;
- Height;
- BMI calculation or persistence;
- CVD risk calculation or persistence;
- clinical thresholds;
- DM/Pre-DM or other clinical classification;
- clinical success or achievement vocabulary/calculation;
- official outcome/report semantics;
- measurement observation timing beyond application `recordedAt`;
- device, source, and import-provider provenance;
- correction, amendment, replacement, versioning, approval, or reopen
  workflow;
- official reports, dashboards, exports, and reporting projections;
- historical Follow-up conversion or any data backfill;
- Final Assessment UI.

## Phase 15D.2 handoff

Phase 15D.2 may refine the domain only from explicit requirements. It should
first resolve the currently excluded clinical semantics and any observation
provenance/correction requirements before expanding the persistence contract.
Phase 15D.3 owns UI integration, and Phase 15E owns reporting, dashboard, and
export behavior.
