# Phase 15D.3 — Final / Outcome UI Integration

## Scope

Phase 15D.3 connects the accepted `PatientFinalAssessment` domain to the
Program Detail journey. It adds a factual create/read workspace for the
existing five nullable raw fields without changing the Prisma contract,
Program lifecycle contract, or Final immutability rules.

## UI integration

The workspace is rendered at:

```text
/app/patients/:relationshipId/programs/:programId
```

It appears after Service 1, Service 2 / Goal Plan, and Follow-up history, and
before the existing Program completion controls. The page loads the exact
Program Final projection and passes it to the workspace; completion remains an
independent operation and does not require or create a Final Assessment.

## State matrix

| Program | Final | Actor | UI behavior |
| --- | --- | --- | --- |
| `ACTIVE` | absent | can manage | Shows the factual explanation, five-field raw form, pending state, validation/error feedback, and one create action. |
| `ACTIVE` | present | any authorized reader | Shows the saved record read-only; no create, edit, or delete controls. |
| `ACTIVE` | absent | read-only | Shows an explicit factual absence and no mutation controls. |
| `COMPLETED` | present | any authorized reader | Shows the historical Final read-only, including recorder, Program status, raw values, and system recording time. |
| `COMPLETED` | absent | any authorized reader | Shows a neutral factual absence; no create control and no success/failure interpretation. |

The form accepts only `weight`, `waistCircumference`,
`systolicBloodPressure`, `diastolicBloodPressure`, and `bloodSugar`, plus the
two exact ownership IDs. At least one raw value is required. Existing unit
suffixes are presented only as current prototype labels.

## Nested ownership hardening

Final reads require both:

```text
patientHospitalRelationshipId + patientProgramId
```

The nested route first resolves the relationship-scoped Program. The Final
query then receives the route relationship ID explicitly and the access
boundary normalizes and compares it with the relationship derived from the
exact Program before selecting Final data. A mismatch fails closed as not
found, and no Final is loaded or created. Final creation also carries both IDs
through strict transport validation and the existing service/database
ownership checks.

## Transport boundary

```text
UI form
  → Final Assessment Server Action
  → existing Final Assessment service
  → existing Program policy/access boundary
  → Prisma transaction and audit
```

The Server Action parses a narrow `FormData` payload, derives the actor from
the protected server context, maps application errors to bounded UX states,
and revalidates the relationship and exact Program routes after successful
creation. Actor identity and recording timestamps are never accepted from the
browser.

## Factual-only semantics

- The UI displays raw values only and does not calculate or classify them.
- No BMI, CVD risk, HbA1c, threshold, achievement, improvement, success, or
  failure result is shown.
- No Baseline/Follow-up/Final comparison or inferred Before/After stage is
  introduced.
- Current `kg`, `cm`, `mmHg`, and `DTX / mg%` labels remain provisional/current
  implementation labels, not approved clinical unit claims.
- `recordedAt` is shown as `บันทึกในระบบเมื่อ`; it is server application
  recording/persistence time, not clinical observation time.

## Explicit exclusions

This phase does not add schema or migration changes, new measurements, unit
conversion, clinical thresholds, clinical calculations, reporting projections,
dashboards, exports, correction/amendment/version workflows, Final edit/delete,
approval/reopen, historical backfill, Program A/B inheritance, or any
relationship-wide Final fallback.

## Verification

Executed checks and results are recorded here at handoff:

- `npx tsc --noEmit` — passed.
- `npm run lint` — passed.
- `npm test -- src/modules/patient-final-assessment` — passed (6 files, 38
  tests).
- `npm test` — passed (114 files, 737 tests).
- `npm run test:integration` — passed (18 files, 156 tests).
- `git diff --check` — passed (exit code 0; Git emitted only existing
  line-ending normalization warnings for LF-tracked source files).

No changes were made to `prisma/schema.prisma` or `prisma/migrations/**`.
