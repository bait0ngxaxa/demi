# Phase 10B.0 — Patient Profile Working Prototype

- **Status:** Implemented
- **Date:** 2026-08-17
- **Scope:** Bounded, read-only Patient Profile projection in the existing relationship-scoped Patient Detail workspace

## 1. Status

Phase 10B.0 is a requirement-validation prototype. It extends the existing
Patient Detail route and does not claim that the selected fields or their
ownership are customer-approved permanent domain semantics.

## 2. Goal

The goal is to validate which small set of Patient Profile information should
be visible and how it should be presented before deciding who may edit each
field, under what authority, with what correction/history and audit behavior.
The prototype deliberately keeps mutation behavior deferred and reversible.

## 3. Selected provisional field subset

The prototype displays these eight nullable fields:

1. Date of birth (`dateOfBirth`)
2. Gender (`gender`)
3. Phone number (`phoneNumber`)
4. Address (`addressText`)
5. Emergency contact name (`emergencyContactName`)
6. Emergency contact phone (`emergencyContactPhone`)
7. Occupation (`occupation`)
8. Education level (`educationLevel`)

They remain bounded strings/date values. No controlled vocabulary or final
`gender`, `educationLevel`, or `occupation` enum was introduced. Stored text is
displayed as-is after the UI's missing-value handling.

## 4. Persistence changes

`PatientProfile` now has eight nullable PostgreSQL columns:

- `dateOfBirth DateTime? @db.Date`
- `gender String? @db.VarChar(64)`
- `phoneNumber String? @db.VarChar(32)`
- `addressText String? @db.VarChar(500)`
- `emergencyContactName String? @db.VarChar(200)`
- `emergencyContactPhone String? @db.VarChar(32)`
- `occupation String? @db.VarChar(200)`
- `educationLevel String? @db.VarChar(200)`

Migration `20260817120000_patient_profile_working_prototype` only adds nullable
columns. It performs no backfill, has no defaults, and keeps existing
`PatientProfile` rows and Patient provisioning valid when all fields are absent.
No production/demo seed semantics were changed and no runtime fallback values
are generated.

## 5. Ownership caveat

Persisting these values in `PatientProfile` is intentionally provisional. In
particular, date of birth and gender may later be stable `Person` attributes;
this phase does not permanently resolve that question and does not update
ADR-0001 or move either field to `Person`.

Phone, address, emergency-contact, occupation, and education ownership is also
open. They may eventually be globally shared patient data, Hospital-specific
data, Patient-maintained data, or another explicitly approved resource.

## 6. Patient Detail projection

The existing `getPatientDirectoryDetail` query/service remains the single
relationship detail boundary. It resolves the exact
`PatientHospitalRelationship.id`, applies the existing authorization predicate,
and then returns a bounded detail projection:

```ts
{
  patientHospitalRelationshipId,
  patientProfileId,
  displayName,
  hospitalNumber,
  hospital: { id, name },
  profile: {
    dateOfBirth,
    gender,
    phoneNumber,
    addressText,
    emergencyContactName,
    emergencyContactPhone,
    occupation,
    educationLevel,
  },
}
```

The directory and assigned-directory queries retain their existing minimal
`patientDirectorySelect` and mapper. They do not load or return the eight
profile fields.

## 7. Authorization boundary

No new authorization model or capability was added. The existing
`patient:read` relationship boundary remains server-side and fail-closed:

- active direct Hospital `OWNER`/`MEMBER` access reads the target Hospital's
  relationships;
- an OSM can read only an exact active assigned Patient relationship through
  the existing assignment predicate;
- an unassigned OSM remains denied;
- an ADMIN-only actor has no routine Patient access;
- an actor with `ADMIN` plus a valid direct Hospital/OSM path keeps that valid
  scoped path;
- Hospital hierarchy and profession do not widen access.

The UI is only a rendering of the server-authorized projection and is not an
authorization boundary.

## 8. Cross-Hospital privacy caveat

`PatientProfile` is one-to-one with `Person`, while
`PatientHospitalRelationship` is Hospital-specific. Therefore these
provisional fields may currently be shared when the same Patient participates
with multiple Hospitals. This is an explicit unresolved Phase 10 requirement.

For this prototype, every read still originates through an authorized exact
relationship. There is no global `PatientProfile` lookup, global Patient
directory, cross-Hospital search, or direct Profile-ID read path. The fields
were not moved into `PatientHospitalRelationship` merely to hide this open
ownership/privacy question.

## 9. UI workflow

The existing `/app/patients/[relationshipId]` workspace now shows a separated
read-only `ข้อมูลผู้ป่วย` area below the existing display name, Hospital-local
HN, and Hospital context panel. It uses the existing `PageHeader`, `Panel`,
semantic Tailwind tokens, Thai-first typography, and responsive shell.

The fields are grouped as:

- `ข้อมูลทั่วไป`: วันเกิด, เพศ
- `ข้อมูลติดต่อ`: เบอร์โทรศัพท์, ที่อยู่
- `ผู้ติดต่อกรณีฉุกเฉิน`: ชื่อผู้ติดต่อ, เบอร์โทรศัพท์
- `ข้อมูลพื้นฐาน`: อาชีพ, ระดับการศึกษา

Every missing field renders `ไม่ระบุ`; sections remain visible even when all
values are missing. Date of birth is formatted as a calendar date using UTC
date parts, avoiding timestamp timezone shifts. The mobile layout stacks fields
and wraps long phone/address values safely; larger screens use a two-column
information grid.

## 10. Minimum projection and privacy boundary

The detail projection excludes auth subjects, roles, credentials, identity
hashes, unrelated memberships, unrelated Hospital relationships, complete
Screening/Goal/Appointment/Follow-up payloads, assignments, and audit history.
The eight fields are not placed in URL query strings, logs, audit metadata,
analytics payloads, localStorage, or unnecessary client state. No read audit
event was added because the existing architecture does not require one for
this read-only prototype.

## 11. Explicit non-goals

This phase does not implement:

- profile editing, inline editing, update actions, mutation services, or API
  mutation endpoints;
- Patient self-service, Hospital profile-edit workflow, registration redesign,
  import changes, or bulk profile update;
- final field ownership, editability, correction, history, audit, or
  cross-Hospital sharing semantics;
- controlled vocabularies or generic Patient Profile/custom-field frameworks;
- `PersonDetails`, `Contact`, `Address`, `EmergencyContact`, metadata JSON, or
  EAV abstractions;
- clinical measurements, Screening/Goal/Appointment/Follow-up changes,
  Baseline, Status Tracking, artifacts, storage, uploads, or attachments;
- global Patient search, Dashboard, Statistics, Reports, transfer, HN
  mutation, notifications, or Hospital governance changes.

No generic Patient Profile framework was introduced. No clinical data was added
to `PatientProfile`.

## 12. Tests and validation

Focused coverage verifies:

- detail projection of populated and nullable profile values;
- directory and assigned-directory minimum projection privacy;
- direct Hospital access through the exact relationship;
- exact-assigned OSM access and unassigned OSM denial;
- ADMIN-only denial and preservation of a valid multi-role scoped path;
- read-only UI field structure, missing-value rendering, and profile labels.

The existing Patient provisioning, assignment, Screening, Goals/Activity Plan,
Appointments, Follow-ups, and directory test paths remain unchanged except for
the focused profile assertions described above.

## 13. Remaining owner requirements

The following remain open and must be confirmed before mutation or permanent
ownership is designed:

- whether date of birth and gender belong to `Person`, `PatientProfile`, or a
  relationship;
- whether each contact/background field is global, Hospital-specific,
  Patient-maintained, or another resource;
- which actors may read or update each field, including Patient self-service;
- correction/version/history and audit semantics;
- whether profile data must be independently maintained per Hospital;
- terminology and any future controlled vocabularies.

## 14. Phase 10C.0 handoff boundary

Phase 10C.0 remains the next planned slice: Baseline / Initial State. It must
define its own relationship-owned snapshot, field set, validation, cardinality,
recorder/date semantics, correction policy, and capability contract. This phase
does not add a Baseline model, migration, service, route, form, or UI, and it
does not derive Baseline from Profile, Screening, or Follow-up.

Profile editing remains deferred, Patient self-service remains deferred, and
Phase 10D.0 artifact/upload behavior remains outside this implementation.
