# Phase 15E.1 — Program Reporting Projection Foundation

## 1. Scope

Phase 15E.1 adds the first typed, read-only factual reporting projection for
one exact Patient Program. The projection is an application/query boundary
over the existing transactional domains. It is not a clinical report, a
Before/After analysis, a dashboard, an export, or a second source of truth.

This phase does not add transport or UI files, persistence, Prisma models,
migrations, clinical calculations, unit conversion, cohort analytics, or
export adapters.

## 2. Starting branch and HEAD

Implementation started from branch `main` at:

```text
025af677e8a79294a54577167e87bfbc935aa538
docs(phase-15e0): gate HN exposure on RPT-03
```

The working tree was clean before implementation. Existing Thai text and
repository encoding conventions were preserved.

## 3. Exact-Program reporting authorization adopted in this phase

Phase 15E.1 adopts only the narrow capability:

```text
report:program:read
```

The capability applies to one exact Program under one exact
`patientHospitalRelationshipId`.

Allowed scope:

- HOSPITAL with an active direct OWNER or MEMBER membership and an ACTIVE
  Hospital.
- OSM with an active OSM-Hospital relationship and the exact active
  `PatientOsmAssignment` for the target relationship and Hospital.

Denied by default:

- ADMIN-only and PATIENT actors.
- Unrelated Hospital users.
- OSM actors without the exact active assignment.
- Ended assignments, inactive memberships, inactive OSM-Hospital
  relationships, inactive Hospitals, and inactive users.

The reporting policy is separate from `program:read`, but delegates the
accepted exact Program scope semantics to the existing Program policy after
the existing access service has resolved current authoritative actor state.
This prevents future cohort or export rules from inheriting ordinary Program
read behavior accidentally.

The broader RPT-01 decision remains open. This phase does not authorize
Hospital cohort reporting, assigned-patient list reports, multi-Hospital or
platform-wide reports, ADMIN reporting, PATIENT self-reporting, or exports.

## 4. RPT-03 and patient identity

RPT-03 remains gated. `hospitalNumber`, HN, customer-facing Patient ID, and
any substitute customer-facing identifier are absent from the projection.

The DTO contains only technical identifiers needed for ownership, routing,
correlation, and pagination:

```text
patientProgramId
patientHospitalRelationshipId
hospitalId
```

It also contains factual display context: `hospital.id`, `hospital.name`, and
`patient.displayName`. The underlying access context may contain
`hospitalNumber` for existing authorization behavior, but the reporting
mapper does not copy it into the report DTO.

## 5. Reporting module architecture

The implementation is intentionally application-layer only:

```text
Future Server Component / Route
    ↓
getProgramReportingProjection()
    ↓
Program reporting access service and report policy
    ↓
Existing exact Program access policy/context
    ↓
Scoped Prisma reads and typed projection mappers
    ↓
Existing transactional PostgreSQL records
```

Files added:

```text
src/modules/reporting/policies/program-report-policy.ts
src/modules/reporting/projections/program-report-projection.ts
src/modules/reporting/services/program-report-access-service.ts
src/modules/reporting/services/program-report-query-service.ts
```

Focused policy, access, and query tests live beside these modules. The
PostgreSQL boundary test is:

```text
tests/integration/program-reporting.integration.test.ts
```

The primary query requires both relationship and Program identifiers:

```ts
getProgramReportingProjection(actor, patientHospitalRelationshipId, patientProgramId, options?)
```

Both identifiers are validated and normalized before access resolution. The
authoritative Program access context is resolved first, then its relationship
is compared with the requested relationship. A mismatch fails with
`NotFoundError`; it never returns the Program under the wrong relationship.

## 6. Program Report DTO structure

`ProgramReportingProjection` is a read-only typed DTO with this high-level
shape:

```text
identity / scope
  technical Program, relationship, and Hospital IDs
  Hospital name
  Patient display name

lifecycle
  status
  startedAt
  completedAt
  creation provenance

linkedBaseline
serviceOne
goalPlans: bounded normalized page
followups: bounded normalized page
finalAssessment
```

The DTO does not contain clinical interpretation, derived deltas, outcome
labels, achievement calculations, or customer-facing identifiers.

## 7. Missing-state model

Nullable source facts use the discriminated union:

```ts
type ReportFact<T> =
  | { state: "RECORDED"; value: T }
  | { state: "NOT_RECORDED" };
```

Therefore an existing record with a null raw measurement is different from an
absent source record. Zero is preserved as `RECORDED` and is never coerced to
missing.

Source-level absence is also explicit:

```text
linkedBaseline.state = MISSING
  reason = PROGRAM_HAS_NO_LINKED_BASELINE

finalAssessment.state = MISSING
  reason = PROGRAM_HAS_NO_FINAL

missing Service 1 activity
  reason = PROGRAM_HAS_NO_SERVICE_ONE_RECORD
```

These neutral states do not mean failure, poor outcome, treatment failure,
non-achievement, or a clinical negative.

## 8. Linked Baseline source rule

The only Baseline source for a Program report is:

```text
PatientProgram.initialBaselineId → exact PatientBaseline
```

The query additionally constrains the Baseline to the exact relationship. If
`initialBaselineId` is null, the projection returns
`PROGRAM_HAS_NO_LINKED_BASELINE`. There is no relationship-wide latest
Baseline fallback and no cross-Program fallback.

The present source exposes the Baseline ID, `recordedOn`, `createdAt`, recorder
display/provenance, and raw fields:

```text
weight
waistCircumference
bloodPressureSystolic
bloodPressureDiastolic
bloodSugarDtx
```

Raw values remain raw; official units and clinical labels are not attached.
The object is named `linkedBaseline`, not `clinicalBefore`.

## 9. Service 1 factual projection

The projection uses the existing Program-owned Service 1 records for Routine,
Floating Chart, Dream Card, and Confidence. It reuses the existing safe
Service 1 select/mapper semantics, then retains only factual presence,
recording time, recorder display name, and bounded evidence metadata where
available:

```text
artifactId
mediaType
byteSize
uploadedAt
associatedAt
```

Storage object keys, signed URLs, private URLs, and download capabilities are
not projected. Existing Service 1 free-text/content values are not included
in this foundation. Presence is not converted into success, treatment
completion, or clinical achievement.

## 10. Goal Plan factual projection and pagination

Goal Plans are queried only with both:

```text
patientProgramId = exact Program
patientHospitalRelationshipId = exact relationship
```

Pre-Program records with a null Program ID, records from another Program, and
relationship-wide latest fallbacks are excluded by the query boundary and
ownership mapper.

Each normalized item retains source facts such as the plan ID, local round,
creation provenance, primary goal code/notes, template key/version, activity
code, target days, raw target value/unit, and sort order. Stored target units
are not normalized or reinterpreted. No goal success, achievement percentage,
or outcome is generated.

Goal Plans use bounded cursor pagination with a default page size of 20 and a
maximum of 50. The DTO returns `items`, `totalCount`, `pageSize`, `hasMore`,
and an opaque `nextCursor`; history is never silently collapsed to the latest
plan.

## 11. Follow-up normalized and paginated projection

Follow-ups are queried only with both exact Program and relationship IDs. They
remain normalized `0..N` history; the projection has no fixed six-round
assumption and does not silently truncate history.

Each row retains its factual ID, local `roundNumber`, `recordedAt`, `createdAt`,
recorder display name, nullable raw measurements, and raw activity progress
(`goalActivityCode`, stored status, and note). Stored statuses remain
`DONE`, `PARTIAL`, `NOT_DONE`, or `NOT_APPLICABLE` as applicable. Notes are not
reinterpreted as obstacles, outcomes, or plan adjustments.

Follow-ups use bounded cursor pagination with the same default 20 and maximum
50. Ordering is deterministic: `roundNumber ASC`, then record ID ascending.
The DTO exposes `totalCount`, `hasMore`, and `nextCursor` so additional rows
are explicit. `recordedAt` remains the source recording timestamp; no
observation-time meaning is fabricated.

## 12. Final factual projection

Final Assessment is read from the exact Program and relationship as a `0..1`
source. It is never derived from Program completion, the latest Follow-up,
relationship-wide values, or another Program.

If absent, the projection returns `PROGRAM_HAS_NO_FINAL`, including for a
completed Program. If present, it exposes the Final ID, `recordedAt`,
`createdAt`, recorder display/provenance, and raw nullable fields:

```text
weight
waistCircumference
systolicBloodPressure
diastolicBloodPressure
bloodSugar
```

Null fields become `NOT_RECORDED`; an absent Final record remains a separate
neutral source state. The object is named `finalAssessment`, not
`clinicalAfter`.

## 13. Program A / Program B isolation

Every Program-owned child read is scoped by both Program and relationship IDs:

```text
Program core       exact id + relationship
linked Baseline    exact initialBaselineId + relationship
Goal Plans         exact programId + relationship
Follow-ups         exact programId + relationship
Final Assessment   exact programId + relationship
Service 1          loaded from exact Program core
```

The integration test creates two Programs under one relationship with
distinguishable Baseline, Service 1, Goal Plan, Follow-up, and Final data. It
also creates pre-Program Goal Plan/Follow-up records and more than six
Follow-ups. The assertions verify that Program B never receives Program A
facts, pre-Program records are excluded, and the full normalized history is
represented through explicit pagination.

## 14. Timestamp semantics

The projection preserves source field names and meanings:

- `startedAt` and `completedAt` are Program lifecycle timestamps.
- Baseline `recordedOn` remains the Baseline source recording date.
- Service 1 `recordedAt`, Follow-up `recordedAt`, and Final `recordedAt` remain
  recording timestamps.
- `createdAt` remains creation/provenance metadata.

No source timestamp is relabeled as a clinical observation timestamp.

## 15. Explicitly excluded clinical and derived fields

This phase intentionally contains no fields or calculations for DM or Pre-DM
classification, HbA1c, Height, BMI, CVD risk, Before/After deltas, change
percentages, improvement/worsening, trends, achievement rates or counts,
success/failure, clinical outcome, risk category, threshold category, or unit
conversion such as DTX mg% to mg/dL.

## 16. Persistence and transport boundary

No changes were made to `prisma/schema.prisma` or `prisma/migrations/**`.
There is no report table, snapshot, JSON blob, materialized view, cache, or
new persistence model. There is no report page, Server Action, Route Handler,
download endpoint, or Excel/PDF/CSV adapter.

## 17. Verification results

The final verification run completed successfully:

```text
npx tsc --noEmit                         PASS
npm run lint                             PASS
npm test -- src/modules/reporting        PASS — 3 files, 18 tests
npm run test:integration                 PASS — 19 files, 158 tests
npm test                                 PASS — 117 files, 755 tests
git diff --check                         PASS
```

The integration runner also generated the existing Prisma client and reported
22 migrations with no pending migrations. No Prisma schema or migration file
was changed by this phase.

## 18. Phase 15E.2 handoff

If this projection remains stable, the next narrow slice is:

```text
Phase 15E.2 — Program Factual Report UI Integration
```

That slice may add a nested Program factual report page/workspace with
read-only display, explicit missing states, and separate Baseline, Follow-up,
and Final source sections. It should continue to avoid clinical comparisons,
exports, and HN/customer-facing identity until the relevant requirements are
accepted. Phase 15E.2 is not implemented here.
