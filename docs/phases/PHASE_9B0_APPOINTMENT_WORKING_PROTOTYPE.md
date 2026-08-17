# Phase 9B.0 — Appointment Working Prototype

- Status: **IMPLEMENTED — REQUIREMENT-VALIDATION PROTOTYPE**
- Date: 2026-08-17
- Scope: relationship-scoped Appointment workflow only
- Follow-up: **not implemented**

This handoff turns the Phase 9A Appointment proposal into a small executable
prototype. Implementation does not convert provisional Appointment behavior
into customer-approved requirements, clinical rules, or a final production
specification.

## 1. Demonstrated workflow

An authorized Hospital user can use the existing Patient relationship context
to:

```text
Patient Detail
  → Appointments
  → Appointment History
  → Create Appointment
  → Appointment Detail
  → Reschedule
  → Cancel / Complete / No-show
```

Implemented routes:

- `/app/patients/[relationshipId]/appointments`
- `/app/patients/[relationshipId]/appointments/new`
- `/app/patients/[relationshipId]/appointments/[appointmentId]`
- `/app/patients/[relationshipId]/appointments/[appointmentId]/edit`

History is newest-first and bounded to the latest 50 records. The UI states
this honestly as `แสดงรายการล่าสุดไม่เกิน 50 รายการ`. Appointment pages show
`ต้นแบบเพื่อเก็บ Requirement` and explain that types, status rules,
responsible-person rules, and actor authority are provisional.

## 2. Architecture and resource boundary

The module follows the existing application boundary:

```text
UI
  → Server Action
  → Appointment application service
  → Appointment access policy
  → Prisma
  → PostgreSQL
```

Appointment ownership is the exact `PatientHospitalRelationship`. The module
does not use raw Person/User IDs, a browser-selected Hospital, a global Patient
ID, or Hospital hierarchy as a resource key. Appointment operations consume
existing identity and relationship records only.

The main module files are under:

```text
src/modules/appointments/
  domain/
  policies/
  schemas/
  services/
  transport/
```

## 3. Persistence model

Migration: `20260817090000_appointment_working_prototype`.

`PatientAppointment` contains:

| Field | Behavior |
| --- | --- |
| `id` | UUID primary key |
| `patientHospitalRelationshipId` | Required foreign key and authoritative owner; restrictive delete behavior |
| `responsibleUserId` | Nullable existing User reference; validated against a direct active membership in the same Hospital |
| `createdByUserId` | Required existing User reference derived from server ActorContext |
| `type` | `FOLLOW_UP` or `CONSULTATION` |
| `scheduledAt` | PostgreSQL `TIMESTAMPTZ(3)` |
| `durationMinutes` | Optional bounded prototype value |
| `locationType` | Optional `CLINIC`, `ONLINE`, `HOME_VISIT`, or `OTHER` |
| `locationDetail` | Optional bounded free text |
| `note` | Optional bounded free text |
| `status` | `SCHEDULED`, `COMPLETED`, `CANCELLED`, or `NO_SHOW` |
| `submissionNonce` | Required unique UUID used for create retry semantics |
| `createdAt`, `updatedAt` | Timestamp metadata |

Indexes support relationship/time history, responsible-user lookup, and
status lookup. No Follow-up, Goal, or Screening persistence was added or
coupled to this model.

## 4. Provisional choices

These are implementation choices for requirement validation, not customer
decisions:

- Initial creation always uses `SCHEDULED`.
- `FOLLOW_UP` and `CONSULTATION` are display/classification values only.
- Duration is optional; the form defaults to 30 minutes as a provisional UX
  convenience, with a structural 5–480 minute bound.
- Location uses the small classification vocabulary above plus optional
  bounded detail text. There is no map, room, provider, GPS, or availability
  integration.
- The form interprets `datetime-local` input in `Asia/Bangkok` and submits an
  explicit `+07:00` ISO offset. The database stores a real timestamp and the
  UI displays it in `Asia/Bangkok`. Lifecycle decisions use server time, not
  browser time. A broader product timezone/DST policy remains open.

## 5. Provisional capability and actor matrix

The only Appointment capabilities are `appointment:read` and
`appointment:manage`.

| Actor | Read | Manage | Prototype scope |
| --- | --- | --- | --- |
| Active direct Hospital OWNER | Allow | Allow | Same active Hospital relationship |
| Active direct Hospital MEMBER | Allow | Allow | Same active Hospital relationship |
| Active OSM with exact active PatientOsmAssignment | Allow | Deny | Same exact `PatientHospitalRelationship` only |
| OSM without exact active assignment | Deny | Deny | An OSM–Hospital relationship alone is insufficient |
| PATIENT | Deny | Deny | Patient self-service is deferred |
| Platform ADMIN | Deny | Deny | No routine Appointment access |

Profession does not change this decision. Parent, child, sibling, and network
Hospitals do not widen access. All reads and mutations resolve the
authoritative server-side ActorContext and re-check relationship scope.

## 6. Responsible person

The create/reschedule form offers only a minimal projection of active Users
with an active direct `HospitalMembership` in the exact Patient relationship's
Hospital. The projection contains User ID, display name, profession, and
membership type only.

When a responsible User is supplied, the service revalidates that User is
active and has an active direct membership in the same Hospital. It does not
require `DOCTOR`, does not use profession as authority, and does not accept a
browser-supplied Hospital or membership as proof.

## 7. Lifecycle and concurrency

```text
              ┌→ COMPLETED
SCHEDULED ────┼→ CANCELLED
              └→ NO_SHOW
```

- Complete is an explicit server-authorized action and is not time-triggered.
- No-show is explicit, allowed only from `SCHEDULED`, and requires
  `scheduledAt <= server now`.
- Cancel is explicit and only supports `SCHEDULED → CANCELLED`.
- Reschedule is allowed only for `SCHEDULED` and keeps the status
  `SCHEDULED`.
- Terminal states remain terminal. There is no reopening, approval,
  confirmation, or `RESCHEDULED` status.
- Reschedule and terminal mutations include an expected `updatedAt` value and
  use conditional updates. A stale operation returns a safe conflict. A
  repeated request for the exact already-applied terminal action is treated as
  idempotent; a different terminal action conflicts.

## 8. Transaction and retry behavior

Create, reschedule, and terminal transitions run their consistency-critical
database work in a serializable transaction. The successful mutation and its
audit event commit together. If the audit write fails, the Appointment write
does not remain successful.

Create accepts only the strict form fields defined by the schema. The browser
cannot submit creator, status, actor, role, Patient, Hospital, assignment, or
other authority fields. `submissionNonce` is an opaque UUID:

```text
same nonce + same accepted actor/scope/payload → existing Appointment
same nonce + changed accepted scope/payload    → conflict
new nonce                                      → new Appointment
```

The unique database constraint protects the retry boundary; serializable
retry handling covers transient transaction conflicts without introducing a
generic idempotency framework.

## 9. Audit and privacy

The bounded mutation events are:

```text
appointment.created
appointment.rescheduled
appointment.cancelled
appointment.completed
appointment.no_show
```

Metadata contains only bounded opaque identifiers and status values such as
Appointment ID, PatientHospitalRelationship ID, Hospital ID, and transition
states. It excludes Patient names, HN, National ID, notes, location detail,
credentials, provider subjects, and identity hashes.

Routine reads are not audited. History and detail projections contain only
relationship context and Appointment fields needed by the UI; unrelated
Hospital memberships, provider data, credentials, and identity data are not
returned.

## 10. Tests

Focused tests cover:

- policy matrix for direct Hospital OWNER/MEMBER, wrong/inactive membership,
  exact/unassigned/wrong-Hospital OSM assignment, PATIENT, ADMIN, and
  profession neutrality;
- strict schema allow-lists, unknown/authority fields, UUIDs, timestamp
  offsets, enum values, optional bounds, and transition inputs;
- service create, responsible-person validation, creator/status derivation,
  nonce retry/conflict, atomic audit, reschedule stale protection, terminal
  transitions, idempotency/conflict, and server-time no-show behavior;
- Server Action field filtering, safe error mapping, relationship-scoped
  revalidation, and transition transport;
- query projections, bounded history, exact OSM read behavior, safe cross-
  relationship detail denial, and direct responsible-member query;
- PostgreSQL migration, relationship scope, OSM assignment, responsible
  membership, retry uniqueness, audit persistence, reschedule, terminal
  transitions, server-time no-show, competing updates, and absence of Goal or
  Screening side effects.

## 11. Explicitly deferred

Phase 9B.0 does not implement Follow-up persistence, forms, activity progress,
measurements, Goal mutation, Screening mutation, automatic Follow-up creation,
Patient self-booking or Patient access, OSM mutation, approval/confirmation,
recurring appointments, calendar/availability/conflict engines, reminders or
notifications, attachments, referrals, care plans, dashboards/reporting,
automatic status workers, generic scheduling/workflow/rules engines, FHIR/HL7,
mobile-specific APIs, or offline sync.

A completed Appointment displays the neutral message
`พร้อมสำหรับการบันทึก Follow-up ในขั้นตอนถัดไป` only. It does not create a
Follow-up record or link to an unimplemented route.

## 12. Phase 9A validation checklist carried forward

The full inherited checklist remains in [Phase 9A Section 15](./PHASE_9A_APPOINTMENT_AND_FOLLOWUP_REQUIREMENTS.md#15-customer-validation-checklist).
The implementation intentionally leaves these Appointment questions open:

1. Who may create, reschedule, cancel, complete, or mark no-show?
2. May OSM create, and must every Appointment have a responsible staff member?
3. Is any Hospital MEMBER eligible, or are profession restrictions required?
4. Are the two provisional types sufficient, and are additional types display
   only or behavior-changing?
5. Can Patients view, request, reschedule, or cancel Appointments?
6. Is scheduling an exact time or a date/window, and what timezone policy is
   required?
7. Are location, duration, reminders, overlap rules, or availability actually
   needed?
8. Can future Appointments be completed early or marked no-show?
9. Can a cancelled/no-show Appointment be rescheduled, or must a new one be
   created?
10. Is the responsible person a User, membership, or another business
    resource, and can there be more than one?

Follow-up questions 16–35 and source-evidence questions 48–60 remain
deferred to Phase 9C.0/customer review. This prototype did not change any
Phase 9A assumption; it selected the explicitly proposed smallest provisional
choices so the workflow could be demonstrated safely.

