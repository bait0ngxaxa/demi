# DEMI Phase 10C.0 — Baseline / Initial State Working Prototype

## 1. Status

Implemented as a small, reversible requirement-validation prototype. The behavior
described here is provisional and does not convert clinical, operational, or
customer requirements into a final product contract.

Phase 10C.0 does not start Phase 10D.0.

## 2. Goal

This phase records the initial state of a Patient within one Hospital
relationship so that later requirements can refer to a stable starting snapshot.
The ownership boundary is:

```text
Person
  ↓
PatientProfile
  ↓
PatientHospitalRelationship
  ↓
PatientBaseline
```

`PatientBaseline` is a concrete bounded-domain record. It is not a
`PatientProfile` field group, Screening round zero, Follow-up round zero, Goal
Plan state, Appointment state, generic Patient status, or mutable current-health
record.

## 3. Legacy evidence used

The pinned legacy Baseline UI and Follow-up terminology in
`raviut-max/demi-plus-web-v2` were used only as behavioral evidence for the
provisional labels: weight, waist circumference, blood pressure, DTX,
adaptation/context notes, confidence, summary, recommendations, and initial
information.

The legacy persistence and authorization behavior was deliberately not copied.
In particular, this implementation does not use `appointment_followups`,
`followup_round = 0`, `appointment_id = null`, `followup_status = fair`,
browser-side actor IDs, direct Supabase writes, or image upload behavior.

## 4. Dedicated Baseline domain decision

The forward-only migration
`prisma/migrations/20260817130000_baseline_initial_state_working_prototype`
adds the dedicated `PatientBaseline` model. Its required identity and history
fields are:

| Field | Provisional meaning |
| --- | --- |
| `id` | Baseline identifier |
| `patientHospitalRelationshipId` | Exact relationship owner; unique in this phase |
| `recordedOn` | User-visible business date of the initial-state observation |
| `recordedByUserId` | Authenticated server-side actor responsible for creation |
| `createdAt` | System persistence timestamp |

The relationship and recorder foreign keys use restrictive deletion behavior so
the Baseline cannot be silently orphaned or erased by a parent deletion.

## 5. Selected provisional field subset

The model and form currently store nullable observations and bounded text:

| Group | Fields |
| --- | --- |
| Measurement / health starting state | `weight`, `waistCircumference`, `bloodPressureSystolic`, `bloodPressureDiastolic`, `bloodSugarDtx` |
| Adaptation / starting context | `adaptationSummary`, `adaptationObstacles`, `adaptationOpportunities` |
| Confidence | `confidenceScore`, `confidenceImprovementPlan` |
| Summary | `summary`, `recommendations` |

The display units are provisional (`kg`, `cm`, `mmHg`, and `DTX / mg%`) and
remain open for confirmation. `confidenceScore` currently accepts nullable
integer values from 0 through 10 because the legacy UI clearly exposed that
scale. It is a requirement-validation scale, not a clinical score or scoring
engine.

All measurement fields are optional. When supplied, they must be finite,
positive technical values within the existing structural payload limit; zero,
negative values, and non-finite values are rejected. These are input-shape
guards only and do not represent clinical ranges or interpretation.

Missing optional values remain `NULL` and render as `ไม่ระบุ`. The service does
not copy values from PatientProfile, Screening, Follow-up, Goals, or
Appointments.

## 6. One Baseline per relationship

Phase 10C.0 permits exactly one Baseline for each
`PatientHospitalRelationship`:

```text
PatientHospitalRelationship 1 ─── 0..1 PatientBaseline
```

The database unique constraint on `patientHospitalRelationshipId` is the final
concurrency guard. The application pre-check gives a useful conflict before
insert where possible, and maps a concurrent PostgreSQL/Prisma uniqueness or
serialization conflict to the existing application `ConflictError` style. The
service never overwrites, versions, or silently converts a duplicate request
into a Follow-up.

## 7. Immutable prototype rule

After creation, the Baseline is read-only. There is no edit, update, delete,
replace, supersede, revision, correction, or amendment operation, and the UI
does not render an edit or delete control. Correction and replacement require
owner requirements about clinical history and are explicitly deferred.

## 8. Recorded-date semantics

`recordedOn` is a required date-only value in `YYYY-MM-DD` form. It means the
date the initial state was recorded or applies to. The form defaults it to the
current Bangkok calendar date for convenience, but the actor may select a
historical date. Conversion to persistence uses UTC midnight so display does
not shift the calendar day through a browser or server timezone.

`createdAt` is a separate system timestamp and is not used as the business
date. The date is not derived from Patient creation, Screening, Appointment, or
Follow-up.

## 9. Authorization and capability boundary

Reads use the existing relationship `patient:read` capability boundary. Creation
uses the narrow `patient:baseline:create` capability. Both paths first resolve
the exact `PatientHospitalRelationship` through an authorization-scoped query,
then re-check the active Hospital, Patient role, current assignment, and
authoritative actor from the database. Browser-supplied Hospital IDs, Patient
IDs, roles, professions, or recorder IDs are not authoritative.

The provisional policy matrix is:

| Actor / scope | Read | Create |
| --- | --- | --- |
| active direct Hospital OWNER | allow | allow |
| active direct Hospital MEMBER | allow | allow |
| exact active assigned OSM for the relationship | allow | allow |
| unassigned OSM or assignment to another relationship | deny | deny |
| inactive or wrong-Hospital membership | deny | deny |
| Platform ADMIN alone | deny | deny |
| ADMIN + valid direct Hospital scope | allow | allow |
| ADMIN + valid exact OSM scope | allow | allow |
| PATIENT self-service | deferred / deny in this prototype | deferred / deny in this prototype |

Profession alone and Hospital hierarchy do not grant access. Navigation is only
UX; the service and Server Action enforce authorization independently.

The access boundary preserves the Patient Detail anti-enumeration convention:
an actor with no possible Baseline role path, such as ADMIN-only or
PATIENT-only, receives `Forbidden`. A potentially valid Hospital/OSM actor who
cannot access the exact relationship receives `NotFound` whether the UUID is
inaccessible or nonexistent. The scoped query is applied before relationship
details are returned.

## 10. Creation transaction and audit

The web boundary is:

```text
UI
  ↓
Server Action
  ↓
Baseline application service
  ↓
exact relationship policy
  ↓
Prisma transaction
  ↓
PostgreSQL
```

The service validates the strict request, resolves the exact relationship,
derives `recordedByUserId` from the authoritative ActorContext, creates the
Baseline, and writes one `patient_baseline.created` audit event in the same
transaction. Audit metadata contains only bounded identifiers:

```text
patientBaselineId
patientHospitalRelationshipId
```

It does not contain weight, blood pressure, blood sugar, confidence,
adaptation notes, summary, recommendations, HN, credentials, or other clinical
values. If the audit write fails, the transaction fails and the Baseline is not
committed.

## 11. Read projection

The read service queries through the exact relationship and returns a bounded
projection only:

```ts
{
  id,
  patientHospitalRelationshipId,
  recordedOn,
  recorder: { id, displayName },
  measurements: {
    weight,
    waistCircumference,
    bloodPressureSystolic,
    bloodPressureDiastolic,
    bloodSugarDtx,
  },
  adaptation: { summary, obstacles, opportunities },
  confidence: { score, improvementPlan },
  summary,
  recommendations,
  createdAt,
}
```

It excludes auth subjects, roles, credentials, identity hashes, memberships,
unrelated relationships, assignments, audit history, and unrelated domain
payloads. Patient directory/list queries do not load Baseline data. Patient
Detail uses a separate small navigation projection containing only the
recorded date and `canCreate` state. `canCreate` means the actor can currently
create the missing Baseline; it is always `false` once the one allowed Baseline
already exists.

## 12. UI workflow

The route is:

```text
/app/patients/[relationshipId]/baseline
```

When no Baseline exists and the actor has create authority, the page shows one
responsive form using the existing `PageHeader`, `Panel`, controls, semantic
Tailwind tokens, and Thai-first error conventions. Numeric controls use mobile
input modes; text fields are bounded and stack on narrow screens.

Before the Server Action submits, the form shows a confirmation step explaining
that the record is an initial reference snapshot and cannot be edited in this
prototype. After successful creation it refreshes into the read-only view.

When a Baseline exists, the page shows grouped read-only sections for date,
recorder, measurements, adaptation/context, confidence, summary, and
recommendations. Empty values show `ไม่ระบุ`; no comparison, trend, percentage,
classification, or clinical interpretation is shown.

The existing Patient Detail route adds a clear Baseline card. It loads only the
small navigation projection and links to either `บันทึกข้อมูลตั้งต้น` or
`ดูข้อมูลตั้งต้น`.

## 13. Privacy and side-effect boundary

Baseline content is not put in URLs, query strings, logs, analytics,
localStorage, or error messages. The Server Action maps application failures to
safe Thai messages and does not expose Prisma errors, SQL, stack traces, or
internal paths.

Creating a Baseline changes only:

```text
PatientBaseline
+ one bounded audit event
```

It does not create or mutate Screening, Goal Plan, Appointment, Follow-up,
PatientProfile, OSM assignment, relationship status, Patient status, or any
clinical classification. No images, files, attachments, storage objects, or
artifact metadata are present in the model.

## 14. Explicit non-goals

This phase does not implement:

- Baseline editing, deletion, replacement, versioning, correction, or amendment
- multiple Baselines, care episodes, or Baseline history
- a generic observation, clinical-event, status, workflow, timeline, or EAV model
- clinical thresholds, diagnosis, risk/PAM zones, severity, healthy/unhealthy labels, or automatic recommendations
- Baseline/Follow-up comparison, trends, charts, dashboards, reports, or statistics
- Patient Profile editing, registration/import changes, or Patient self-service
- Screening, Goals, Appointments, Follow-ups, or Hospital governance changes
- image upload, file upload, attachments, artifact metadata, or storage integration
- notifications, global search, or a public API route

## 15. Tests and validation

Focused unit/transport/UI coverage verifies structural date and numeric
validation, strict authority-field rejection, provisional confidence behavior,
direct Hospital and exact OSM policy decisions, ADMIN-only and hierarchy denial,
multi-role scope preservation, server-derived recorder, duplicate conflict
translation, audit metadata minimization, transaction boundaries, bounded read
projections, missing-value rendering, Patient Detail navigation, create/read-only
route branching, and safe transport errors.

The PostgreSQL integration suite covers direct Hospital create/read, exact OSM
assignment create/read, unassigned OSM anti-enumeration, ADMIN-only denial, a
valid multi-role Hospital path, cross-Hospital and nonexistent-relationship
`NotFound` behavior, duplicate concurrency with one row, audit metadata
privacy, and unchanged Screening/Goal/Appointment/Follow-up counts.

The migration adds only `PatientBaseline`, its unique relationship constraint,
restrictive foreign keys, and the required model relations. It does not backfill
legacy Follow-up rows or alter existing clinical data.

## 16. Remaining owner requirements

Phase 10C.0 does not permanently settle:

- whether one Baseline is enough permanently or whether one is needed per care episode;
- which Baseline fields are actually required and what constitutes clinical completeness;
- who may correct a Baseline and whether correction must append amendments rather than mutate;
- whether OSM may create all Baseline fields;
- whether `recordedOn` remains date-only or needs exact timestamp semantics;
- the confirmed confidence-score scale and instrument;
- the expected units and contexts for every measurement, including DTX context and blood-pressure pairing;
- which Baseline values should later be compared with Follow-up;
- whether recommendations are clinical data with additional governance;
- whether Patient users may ever view or submit Baseline data;
- which images/artifacts belong to Baseline versus relationship-level Status/Evidence.

These questions must be confirmed before changing the immutable/cardinality or
clinical semantics of the prototype.

## 17. Phase 10D.0 handoff boundary

Phase 10D.0 is the separate **Patient Status Artifacts / Attachment Boundary**
slice. It may later define relationship-owned status/evidence images, artifact
metadata, storage object lifecycle, short-lived access, caption/provenance,
upload authorization, retention/deletion, and any confirmed Baseline/Follow-up
artifact ownership.

Phase 10C.0 intentionally does not add URLs, storage paths, upload fields,
attachments, or placeholder artifact relations to `PatientBaseline`.

No ADR-level architectural conflict was found; the implementation follows the
provisional dedicated relationship-owned Baseline direction selected in
Phase 10A.
