# DEMI Phase 9C.0 — Follow-up / Progress Working Prototype

## Status

Implemented as a requirement-validation working prototype on top of the Phase 9B.0 Appointment implementation.

This document describes implemented prototype behavior. It does not convert provisional product, operational, or clinical behavior into confirmed customer requirements.

## Implemented workflow

The demonstrable patient journey is now:

```text
Patient Detail
  → Screening
  → Goals / Activity Plans
  → Appointments
  → Follow-up / Progress
```

The prototype supports both:

- Patient Detail → Follow-ups → New Follow-up
- a `COMPLETED` Appointment → `บันทึก Follow-up` → New Follow-up with the Appointment preselected

Opening the Follow-up form does not create a Follow-up and does not change Appointment status. Completing an Appointment and recording a Follow-up remain separate operations.

## Routes

```text
/app/patients/[relationshipId]/followups
/app/patients/[relationshipId]/followups/new
/app/patients/[relationshipId]/followups/[followupId]
```

Patient Detail exposes Screening, Goals / Activity Plans, Appointments, and Follow-ups navigation. The Completed Appointment detail links to the Follow-up form using an opaque Appointment ID.

All Follow-up pages display `ต้นแบบเพื่อเก็บ Requirement`. They explicitly describe provisional measurement semantics, progress statuses, confidence behavior, and actor authority. The pages also state that the prototype does not make clinical recommendations or conclusions.

## Resource boundary and authorization

The authoritative ownership boundary is:

```text
PatientHospitalRelationship
  ↓
PatientFollowup
```

Follow-up history and detail queries always resolve the exact relationship before reading data. A Person, User, PatientProfile, raw Patient ID, or browser-selected Hospital is not used as the Follow-up owner. Hospital hierarchy does not widen access.

The provisional capabilities are:

```text
followup:read
followup:record
```

The two capabilities are evaluated independently. The current provisional
policy happens to allow the same actor/scope combinations for both, but the
history read projection does not imply record authority and the New Follow-up
setup requires `followup:record` directly.

The current provisional matrix is:

| Actor | Read | Record |
| --- | --- | --- |
| active direct Hospital OWNER | allow | allow |
| active direct Hospital MEMBER | allow | allow |
| active OSM with exact active PatientOsmAssignment | allow | allow |
| OSM with only a Hospital relationship | deny | deny |
| OSM assigned to another relationship | deny | deny |
| inactive or wrong-Hospital membership | deny | deny |
| PATIENT | deny | deny |
| Platform ADMIN alone | deny | deny |

An `ADMIN` role does not grant routine clinical access and does not revoke
authority from another valid role/scope on the same actor. Therefore an
`ADMIN + HOSPITAL` actor with valid direct active membership is evaluated as a
Hospital actor, and an `ADMIN + OSM` actor with an exact active assignment is
evaluated as an OSM actor. Profession does not change authority. The server
reloads the actor, relationship, Hospital, and active assignment before policy
evaluation. Navigation visibility is not authorization.

## Persistence model

The forward-only migration is:

```text
prisma/migrations/20260817110000_followup_progress_working_prototype
```

It adds:

```text
PatientFollowup
  id
  patientHospitalRelationshipId
  appointmentId?
  sourceGoalPlanId?
  createdByUserId
  roundNumber
  submissionNonce
  submissionRequestHash
  recordedAt
  weight?
  waistCircumference?
  systolicBloodPressure?
  diastolicBloodPressure?
  bloodSugar?
  confidenceScore?
  reflectionNote?
  confidencePlan?
  generalNote?
  createdAt
```

and:

```text
PatientFollowupActivityProgress
  id
  followupId
  goalActivityCode
  status
  note?
  createdAt
```

Foreign keys to the relationship, Appointment, Goal Plan, creator, and Follow-up use restrictive delete behavior. A database uniqueness invariant protects both `submissionNonce` and `(patientHospitalRelationshipId, roundNumber)`. Activity codes are unique within one Follow-up.

## Immutable rounds and submission behavior

There is no Follow-up update, delete, edit, approval, correction, or amendment operation in this phase. A submitted round is historical and immutable. The database schema does not expose a mutable Follow-up history contract through the application.

The server allocates `roundNumber` inside a serializable transaction. It reads the latest round for the exact relationship, proposes the next value, and relies on the database unique constraint plus a bounded retry limit for serialization/uniqueness conflicts. There is no unprotected `COUNT(*) + 1` allocation and no unbounded retry loop.

The create form carries a UUID `submissionNonce`. The accepted normalized request is hashed server-side with SHA-256. The fingerprint includes the accepted actor, exact relationship, Appointment provenance, Goal Plan provenance, all measurements, confidence, notes, and normalized activity progress.

The same nonce is accepted only when all of the following match the immutable original request:

```text
actor
relationship
normalized request and provenance
```

An identical retry returns the existing Follow-up without another round or audit event. A changed actor, relationship, payload, Appointment, or Goal Plan provenance conflicts. A new nonce intentionally creates a new round. The fingerprint is not sent to the browser or audit metadata.

## Appointment linkage

`appointmentId` is optional. If supplied, the server resolves it by ID and exact relationship and requires `AppointmentStatus.COMPLETED`. An Appointment from another relationship or any non-completed Appointment is rejected. The Follow-up transaction never updates Appointment status and never creates or completes an Appointment.

The form can also select from server-resolved completed Appointment options. A URL query parameter is treated only as an untrusted request for initial context; the server validates it against the exact relationship before rendering the form.

## Goal Plan provenance and activity progress

`sourceGoalPlanId` is optional. The user explicitly chooses either no Goal Plan context or one accessible historical Goal Plan. The Goal-owned query boundary resolves the exact relationship and validates the historical template and activity definitions. Goal Plan options are optional enrichment for New Follow-up setup: if `goal:read` is denied, the setup returns no Goal Plan options and standalone recording remains usable. Infrastructure failures are propagated. A submitted Goal Plan ID still requires strict Goal-owned authorization and exact relationship validation.

When a Goal Plan is selected, the form renders the activities from that exact immutable plan. Activity progress is optional per activity: zero, one, some, or all activities may be submitted. A blank UI status produces no progress row. The server rejects every submitted activity code that is not present in the selected plan. When no Goal Plan is selected, no activity rows are fabricated and submitted activity progress is rejected.

The provisional progress vocabulary is:

```text
DONE
PARTIAL
NOT_DONE
NOT_APPLICABLE
```

These values are requirement-validation labels only. The detail page renders the exact selected historical Goal Plan context and does not reinterpret an old Follow-up against the latest plan. It does not calculate adherence, improved/worse, trend, or clinical result.

## Measurements, confidence, and notes

The prototype exposes optional requirement-validation fields:

| Field | Provisional display unit |
| --- | --- |
| weight | kg |
| waistCircumference | cm |
| systolicBloodPressure | mmHg |
| diastolicBloodPressure | mmHg |
| bloodSugar | DTX / mg% |

Input validation checks numeric shape, finiteness, non-negative structural values, and a broad structural maximum. It does not claim medically authoritative ranges and does not pair blood-pressure fields or add DTX context.

`confidenceScore` accepts the provisional integer range 0–10. `reflectionNote`, `confidencePlan`, `generalNote`, and activity notes are bounded text fields. No automatic recommendation, summary, threshold, BMI, alert, diagnosis, or treatment behavior is implemented.

## Transaction and audit behavior

Follow-up submit is one consistency-critical operation:

```text
resolve authoritative ActorContext
  → authorize exact relationship
  → resolve optional COMPLETED Appointment
  → resolve optional historical Goal Plan
  → validate activity membership and bounded input
  → resolve nonce/fingerprint retry
  → allocate relationship-scoped round
  → create Follow-up and activity progress rows
  → record followup.created audit
  → commit
```

The Follow-up, nested progress rows, and required `followup.created` audit event commit or roll back together. Audit metadata is limited to bounded low-risk identifiers/context: Follow-up ID, relationship ID, Hospital ID, round, and optional Appointment/Goal Plan IDs. Measurement values, confidence, notes, activity notes, names, HN, national ID, credentials, provider subjects, fingerprints, tokens, and signed URLs are excluded.

Routine Follow-up reads do not create audit events in this phase.

## Query projections

History is newest-first, relationship-scoped, minimal, and limited to the latest 50 rounds. The UI states that the displayed history is bounded. Detail reads only the selected Follow-up, exact relationship, minimal creator display name, optional Appointment context, exact Goal Plan context, measurements, activity progress, confidence, reflection, and notes.

## Tests and validation

Focused Follow-up tests cover independent read/record capability projections, strict input validation, duplicate activity codes, structural measurements, confidence range, transport allowlisting, safe errors, standalone creation, completed Appointment linkage, exact Goal Plan activity membership, optional Goal access, partial activity progress, no-plan behavior, server-derived creator/round, immutable request retry/conflict behavior, atomic audit failure handling, no Appointment/Goal/Screening side effects, bounded relationship-scoped queries, and historical Goal Plan rendering. Policy tests cover ADMIN-only denial and valid multi-role Hospital/OSM scope for both Follow-up and Appointment.

The PostgreSQL integration suite also covers concurrent distinct submissions receiving relationship rounds `{1, 2}`, concurrent identical nonce/request replaying one committed Follow-up and audit event, and concurrent changed-payload nonce reuse resolving to one accepted row plus a `ConflictError`. These tests exercise the real serializable transaction, database uniqueness constraints, and bounded retry behavior.

The migration is forward-only and does not modify the Phase 9B Appointment migrations or data.

## Explicitly deferred

- Follow-up edit, delete, correction, amendment, approval, and review workflow
- Patient self-recording and expanded Patient visibility
- Automatic Appointment completion/creation or automatic Goal Plan creation
- Next Goal Plan recommendations or triggers
- Clinical thresholds, scoring, interpretation, recommendations, BMI, alerts, diagnosis, and treatment behavior
- Final measurement set, units, contexts, ranges, blood-pressure pairing, and DTX fasting/post-meal context
- Validated meaning or instrument for confidence
- Final progress vocabulary and business meaning
- Images, artifacts, attachments, notifications, LINE, LIFF, SMS, email, and calendar integration
- Recurring appointments, availability, booking conflicts, dashboards, reports, referrals, FHIR, HL7, offline sync, and native-specific expansion
- Generic workflow, rule, adherence, clinical-observation, template-builder, or file/DAM frameworks

## Open customer questions

The following remain explicitly provisional and open:

- Must Follow-up always originate from an Appointment, or is standalone recording valid?
- What is the final actor authority? Should OSM remain allowed to record? Should OWNER and MEMBER differ?
- Is Patient self-service or Patient Follow-up visibility required later?
- What is the final measurement set, unit, context, and structural/domain validation policy?
- Must blood-pressure fields be paired? Does DTX need fasting/post-meal context?
- What does confidence mean, and is a validated instrument required?
- What are the final progress statuses and their business meaning?
- Are correction/amendment rules, ownership, and review/approval required?
- Who owns recommendations, if recommendations are ever required?
- Are image/artifact requirements needed?
- What is the final Patient visibility policy?
- What triggers the next Goal Plan?
- Do Follow-up reads require auditing?

The implementation choices in this document are requirement-validation defaults, not confirmed customer requirements.
