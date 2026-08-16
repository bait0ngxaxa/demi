# Phase 9A — Appointment & Follow-up Requirement Analysis

- Status: **ANALYSIS COMPLETE; PROTOTYPE CONTRACT DOCUMENTED**
- Date: 2026-08-16
- Inspection mode: Existing System Mapping — Full Mode
- Scope: Appointment, Follow-up, Goal Plan provenance, authorization boundaries, persistence integrity, privacy, and the smallest future prototype contract.
- Implementation: None. This phase adds no Prisma model, migration, UI, Server Action, Route Handler, application service, policy, upload/storage flow, notification, or product feature.

This document prepares the next working-prototype slices:

~~~text
Phase 9B.0 — Appointment Working Prototype
Phase 9C.0 — Follow-up / Progress Working Prototype
~~~

The proposed behavior below is a requirement-validation contract. A prototype
implementation of a provisional item is not customer approval, a clinical rule,
or a final production data model.

## 1. Status and scope

Phase 9A extends the current journey:

~~~text
Patient
  ↓
Screening
  ↓
Goal / Activity Plan
  ↓
Appointment
  ↓
Follow-up / Progress
  ↓
future Goal review / next Goal round
~~~

The purpose is to establish a small executable contract for later prototypes,
not to model a complete clinical system. The analysis therefore:

- uses the current rewrite architecture as the primary authority;
- uses legacy DEMI only for observed behavior and terminology;
- keeps business, clinical, authority, visibility, and correction questions
  explicitly open;
- avoids a generic scheduling, workflow, adherence, rules, care-plan, or
  attachment platform;
- keeps appointment and follow-up as separate concepts.

No Appointment or Follow-up implementation was added in Phase 9A.

## 2. Source hierarchy and classification

The source-of-truth order used in this phase is:

1. Confirmed current business requirements.
2. Accepted ADRs.
3. docs/architecture/DEMI_ARCHITECTURE_BASELINE.md.
4. docs/CONTEXT.md.
5. Accepted and implemented Phase documents.
6. Current schema, source, and tests as implementation evidence.
7. Legacy DEMI as behavioral and terminology reference only.

The required classifications are used literally:

| Classification | Meaning in this document |
| --- | --- |
| **CONFIRMED** | A current rewrite architecture or product boundary already accepted or implemented and inherited by Phase 9. |
| **LEGACY REFERENCE** | Behavior observed in the pinned legacy source. It describes what existed, not what the rewrite must do. |
| **PROTOTYPE ASSUMPTION / OPEN REQUIREMENT** | A temporary proposal needed to make Phase 9B.0/9C.0 executable, or a requirement that needs customer/business/clinical confirmation. |

Where a legacy behavior conflicts with the rewrite, the observation remains
LEGACY REFERENCE and the rewrite rule is stated separately as CONFIRMED.

## 3. Evidence inspected

### 3.1 Rewritten DEMI

The following product and architecture sources were inspected:

- [PRODUCT.md](../../PRODUCT.md)
- [DESIGN.md](../../DESIGN.md)
- [README.md](../../README.md)
- [Project context](../CONTEXT.md)
- [Architecture baseline](../architecture/DEMI_ARCHITECTURE_BASELINE.md)
- [ADR index](../adr/README.md)
- [ADR-0001 — Person and User Identity](../adr/0001-person-and-user-identity.md)
- [ADR-0002 — Role, Capability and Scope Authorization](../adr/0002-role-capability-scope-authorization.md)
- [ADR-0003 — Hospital-led Onboarding](../adr/0003-hospital-led-onboarding.md)
- [ADR-0004 — Patient Provisioning and Activation](../adr/0004-patient-provisioning-and-activation.md)
- [ADR-0005 — Server-Side Application Boundary](../adr/0005-server-side-application-boundary.md)
- [ADR-0006 — Transactional Business Operations](../adr/0006-transactional-business-operations.md)
- [ADR-0007 — Client Transport and Mobile-Ready Architecture](../adr/0007-client-transport-and-mobile-ready-architecture.md)
- [ADR-0008 — Workforce Provisioning and Activation](../adr/0008-workforce-provisioning-and-activation.md)
- [Phase 6A — Patient Access and Assignment](./PHASE_6A_PATIENT_ACCESS_AND_ASSIGNMENT.md)
- [Phase 6B.1 — Patient Directory](./PHASE_6B1_PATIENT_DIRECTORY.md)
- [Phase 6B.2 — Patient OSM Assignment](./PHASE_6B2_PATIENT_OSM_ASSIGNMENT.md)
- [Phase 7A — Screening Requirements](./PHASE_7A_SCREENING_REQUIREMENTS.md)
- [Phase 7B.0 — Screening Working Prototype](./PHASE_7B0_SCREENING_WORKING_PROTOTYPE.md)
- [Phase 8A — Goals and Activity Plan Requirements](./PHASE_8A_GOALS_AND_ACTIVITY_PLAN_REQUIREMENTS.md)
- [Phase 8B.0 — Goals and Activity Plan Working Prototype](./PHASE_8B0_GOALS_AND_ACTIVITY_PLAN_WORKING_PROTOTYPE.md)
- [Prisma schema](../../prisma/schema.prisma)

The current implementation and test evidence inspected included:

- [Patient Detail page](../../app/app/patients/%5BrelationshipId%5D/page.tsx)
- [Screening pages](../../app/app/patients/%5BrelationshipId%5D/screenings/page.tsx) and [new Screening page](../../app/app/patients/%5BrelationshipId%5D/screenings/new/page.tsx)
- [Goal overview page](../../app/app/patients/%5BrelationshipId%5D/goals/page.tsx), [new Goal page](../../app/app/patients/%5BrelationshipId%5D/goals/new/page.tsx), and [Goal detail page](../../app/app/patients/%5BrelationshipId%5D/goals/%5BgoalPlanId%5D/page.tsx)
- Patient directory policy/query and Patient OSM assignment policy/query boundaries under src/modules/patient-directory/ and src/modules/patient-assignment/
- Screening policy, access/query/service/transport and source-defined question/scoring definitions under src/modules/screening/
- Goal policy, access/query/service/transport and source-defined Goal definitions under src/modules/goals/
- [ActorContext](../../src/modules/auth/types/actor-context.ts)
- [Audit schema](../../src/modules/audit/schemas/audit-schemas.ts) and [audit service](../../src/modules/audit/services/audit-service.ts)
- [Screening integration tests](../../tests/integration/screening.integration.test.ts)
- [Goals integration tests](../../tests/integration/goals.integration.test.ts)
- Screening, Goals, Patient directory, Patient assignment, authorization, service, transport, and page tests under src/ and tests/
- package scripts in [package.json](../../package.json)

The current schema contains Person, User, roles, Hospital memberships,
OsmHospitalRelationship, PatientProfile, PatientHospitalRelationship,
PatientOsmAssignment, ScreeningAssessment, PatientGoalPlan,
PatientGoalItem, activation records, and AuditEvent. It contains no
Appointment or Follow-up persistence model.

### 3.2 Legacy DEMI

The local legacy checkout is:

~~~text
C:\Users\Bait0ng\Desktop\legacy-demi\demi-plus-web-v2
~~~

It is clean at the pinned commit:

~~~text
Repository: raviut-max/demi-plus-web-v2
Commit:     7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e
Date:       2026-07-12T14:40:12+07:00
~~~

Relevant legacy source inspected:

- [Appointments index](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/app/admin/appointments/page.tsx)
- [Global appointment list/actions](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/app/admin/appointments/view/page.tsx)
- [New appointment page](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/app/admin/appointments/new/page.tsx)
- [Appointment edit page](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/app/admin/appointments/edit/%5Bid%5D/page.tsx)
- [Appointment detail page](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/app/admin/appointments/%5Bid%5D/page.tsx)
- [Patient appointment history](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/app/admin/patients/%5Bid%5D/appointments/page.tsx)
- [Follow-up form](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/app/admin/appointments/followup/%5Bid%5D/page.tsx)
- [Follow-up detail](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/app/admin/appointments/followup/%5Bid%5D/view/page.tsx)
- [Patient Follow-up history](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/app/admin/patients/%5Bid%5D/followup-history/page.tsx)
- [Legacy Patient detail](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/app/admin/patients/%5Bid%5D/page.tsx)
- [Legacy Supabase queries](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/lib/supabase/queries.ts)
- [Legacy browser Supabase client](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/lib/supabase/client.ts)
- [Legacy Follow-up test page](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/app/admin/appointments/followup-test/page.tsx)

Inspection limitations:

- The legacy checkout does not contain a committed SQL schema or migration for
  the relevant tables. Column existence and database constraints are therefore
  reported only where the application source reads or writes them.
- Storage bucket policies and retention settings are not in the checkout.
- Several legacy routes, helper signatures, and status/type labels disagree.
  Those disagreements are recorded as risks instead of being silently
  normalized.

## 4. Current journey and Phase 9 starting point

The current rewrite has an executable journey through Goal Plan:

~~~text
Patient Detail
  → Screening history / new Screening
  → Goal Plan history / new Goal Plan / immutable detail
~~~

Phase 7B.0 establishes a relationship-scoped Screening assessment:

- one assessment belongs to one PatientHospitalRelationship;
- raw responses are validated and the result is calculated server-side;
- submitted history retains source question/scoring versions;
- the submission, result snapshot, and successful audit event are atomic;
- a UUID submission nonce protects retry/double-submit behavior;
- Screening does not automatically create or mutate a Goal Plan.

Phase 8B.0 establishes an immutable Goal Plan prototype:

- one Goal Plan belongs to one PatientHospitalRelationship;
- a source Screening reference is optional context and is not a hidden
  treatment rule;
- a source-defined Goal template/version and activity snapshots preserve
  historical meaning;
- each deliberate submission receives a relationship-scoped immutable round;
- serializable allocation, a unique relationship/round constraint, a submission
  nonce, and atomic audit protect the write;
- adherence/progress, appointments, follow-up, correction, care plans, and
  clinical recommendations remain deferred.

Phase 9 begins at the missing link between the current Goal Plan and future
progress history. The Patient Detail page currently links to Screening and
Goals, but no Appointment or Follow-up link/model/module exists in the rewrite.

## 5. CONFIRMED inherited boundaries

The following are inherited by both future prototypes. They are not reopened by
the legacy analysis.

### 5.1 Resource scope

**CONFIRMED:** Clinical and operational Patient work is scoped to one
PatientHospitalRelationship:

~~~text
PatientHospitalRelationship
  ↓
Appointment / Follow-up / Progress history
~~~

An operation must not use a raw Person ID, raw User ID, global Patient record,
or browser-selected Hospital as its authority key. A Person may have multiple
Hospital relationships and therefore separate workflow histories.

### 5.2 Identity

**CONFIRMED:** Person is the human identity and User is the application
account. Appointment or Follow-up operations must resolve and reuse existing
identity/relationship records and must never create duplicate Person or User
records.

### 5.3 Hospital authorization

**CONFIRMED:** Direct active Hospital membership in the target Hospital is the
Hospital actor boundary. Parent, child, sibling, and network metadata do not
widen Patient authorization. Hospital hierarchy may be displayed as reference
data but is not a Patient resource predicate.

### 5.4 OSM authorization

**CONFIRMED:** An OSM–Hospital relationship alone is not Patient authorization.
When an OSM is allowed to operate on a Patient-specific resource, the exact
active PatientOsmAssignment for the same PatientHospitalRelationship remains
the required scope boundary.

An Appointment or Follow-up capability must not turn active OSM–Hospital
association into Hospital-wide or hierarchy-wide access.

### 5.5 Server authority and application boundary

**CONFIRMED:** The application boundary remains:

~~~text
UI
  ↓
Server Action / Route Handler
  ↓
Application Service
  ↓
Policy / Authorization
  ↓
Prisma
  ↓
PostgreSQL
~~~

The server resolves ActorContext and authoritative role, capability, Hospital,
Patient relationship, assignment, creator, responsible staff, Appointment
status, Goal Plan context, Follow-up round, and derived values. Browser state
is never authority.

### 5.6 Role, capability, and profession

**CONFIRMED:** Authorization is evaluated as Role + Capability + Scope +
target resource and fails closed when resolution is missing, inactive,
ambiguous, or conflicting.

DOCTOR and NURSE remain profession classifications under Hospital membership.
They are not new top-level roles and profession does not independently grant
Appointment or Follow-up authority unless a later requirement explicitly adds
that rule.

Existing Screening and Goal prototypes have provisional actor policies, but
those policies do not automatically settle Appointment or Follow-up authority.

### 5.7 Platform ADMIN

**CONFIRMED:** Platform ADMIN is primarily a governance, audit, recovery,
reconciliation, and exceptional-case actor. Platform ADMIN does not receive
routine clinical Appointment or Follow-up access simply because legacy Admin
could open those pages.

### 5.8 Privacy and audit

**CONFIRMED:** Sensitive clinical free text, measurements, National ID,
identity hashes, credentials, provider identifiers, secrets, names, HN, and
unnecessary Patient data must not be copied into audit metadata. Projections
must be minimal and resource-scoped.

### 5.9 Transactional integrity

**CONFIRMED:** A consistency-critical local business operation and its
successful audit event commit or roll back together in a Prisma/PostgreSQL
transaction. External authentication or storage I/O must not be placed inside
a long database transaction without an explicitly accepted consistency
boundary.

## 6. LEGACY REFERENCE — Appointment

All findings in this section are observations from the pinned legacy source.
They are not rewrite requirements.

### 6.1 Observed routes and entry points

| Legacy route | Observed purpose |
| --- | --- |
| /admin/appointments | Client redirect to the global appointment list. |
| /admin/appointments/view | Global patient/appointment list, filters, detail modal, status actions, and links to create/edit/follow-up. |
| /admin/appointments/new | Global create form with Patient, staff, type, date/time, duration, location, and notes. |
| /admin/appointments/edit/[id] | Appointment edit/reschedule form. |
| /admin/appointments/[id] | Separate appointment detail page with a different field vocabulary and Follow-up display logic. |
| /admin/patients/[id]/appointments | Patient-specific appointment history, create/edit modal, cancel/complete actions, and Follow-up link. |
| /admin/appointments/followup/[id] | Follow-up form; the same dynamic route is used ambiguously for an appointment ID and a Follow-up ID. |
| /admin/appointments/followup/[id]/view | Follow-up detail/read page. |
| /admin/patients/[id]/followup-history | Patient-scoped Follow-up history and progress display, with a standalone new Follow-up path. |

### 6.2 Appointment ownership and legacy fields

**LEGACY REFERENCE:** The main query helper reads appointments by:

~~~text
appointments.user_id = Patient/profile ID
~~~

The observed appointment row is conceptually associated with:

| Concept | Legacy evidence |
| --- | --- |
| Patient | user_id in lib/supabase/queries.ts and patient_id/user_id in UI state. |
| Responsible person | doctor_id in the query helper and patient-specific form; the global create form uses staff_id in its state. |
| Creator | created_by supplied from client session state. |
| Hospital | Not an explicit appointment field in the inspected source. Patient Hospital and doctor user Hospital are inferred through related profile/user records. |
| Date/time | appointment_date; the forms combine date and time and store an ISO timestamp. |
| Duration | duration_minutes; the helper defaults to 30 and forms show 15, 30, 45, and 60-minute choices. |
| Location | location_type/location_detail in the patient-specific and edit forms; another create form uses location. |
| Classification | appointment_type. |
| State | status. |
| Free text | notes. |
| Timestamps | updated_at is written by direct UI updates; created_at is not consistently handled in the inspected write paths. |

The rewrite prototype boundary should therefore be:

~~~text
PatientHospitalRelationship
  ↓
PatientAppointment
~~~

This is **PROTOTYPE ASSUMPTION / OPEN REQUIREMENT**, not a legacy fact. It
prevents a global Patient or raw profile ID from becoming the workflow owner and
lets the same Person have separate Hospital appointment histories.

The exact field responsibleUserId? remains unresolved in Phase 9A. A future
prototype may represent a responsible application User, but must validate the
target User's active direct membership in the same Hospital. Creator and
responsible person are separate concepts.

### 6.3 Appointment types

**LEGACY REFERENCE:** The source contains inconsistent type vocabularies:

| Source location | Values observed |
| --- | --- |
| Global new form | follow_up, consultation, checkup, lab |
| Patient appointment form | followup, consultation, screening, education |
| Edit form | followup, consultation, checkup, treatment, other |
| Appointment detail display | followup and appointment have special labels; other values are displayed as-is. |

No source evidence shows meaningful persistence or authorization behavior
different by type. Types are primarily classification/display metadata in the
inspected code.

**PROTOTYPE ASSUMPTION / OPEN REQUIREMENT:** Phase 9B.0 should start with only
two provisional classifications:

~~~text
FOLLOW_UP
CONSULTATION
~~~

Neither type creates an implicit downstream operation. SCREENING, EDUCATION,
LAB, CHECKUP, TREATMENT, OTHER, and spelling variants remain customer
questions. A source-defined appointment prototype definition may hold labels
and versions, but it must not become a type-specific workflow engine.

### 6.4 Appointment statuses and observed transitions

**LEGACY REFERENCE:** Status tokens observed in source include:

| Token | Evidence and observed behavior |
| --- | --- |
| scheduled | Created by the query helper; the main list treats it as the editable/waiting state. |
| confirmed | Included by getNextAppointment filters, but no clear transition UI was found. |
| completed | Set by direct browser update; enables the Follow-up action in the main list. |
| cancelled | Set by direct browser update; the main list treats it as terminal. |
| no_show | Set by direct browser update from the global list, generally only offered after the scheduled time. |
| pending | Included by a next-appointment query, with no corresponding appointment workflow transition found. |
| in_progress | Rendered by the separate detail page, with no matching transition found in the inspected appointment flow. |

There is no explicit transition service or shared state machine. Different
pages directly update status, and the UI rules disagree:

- the global list allows Complete from scheduled, including a warning for a
  future appointment, and offers No-show only when the time has passed;
- the patient appointment page allows Complete and Cancel from scheduled but
  does not expose No-show;
- the separate detail page displays in_progress but does not define how to
  enter it;
- one patient page can still expose Edit for a non-completed terminal record,
  while the global list says cancelled/no_show records cannot be edited.

**PROTOTYPE ASSUMPTION / OPEN REQUIREMENT:** The smallest useful Phase 9B.0
lifecycle is:

| Operation | Provisional transition |
| --- | --- |
| Create | none → SCHEDULED |
| Reschedule | SCHEDULED → SCHEDULED with date/time and allowed details changed |
| Cancel | SCHEDULED → CANCELLED |
| Complete | SCHEDULED → COMPLETED |
| Mark no-show | SCHEDULED → NO_SHOW, with a server-time guard that the scheduled time has passed unless the customer explicitly chooses another rule |

COMPLETED, CANCELLED, and NO_SHOW are terminal in this prototype. There is no
automatic time transition, reminder transition, or implicit completion from
opening a Follow-up form. CONFIRMED, PENDING, and IN_PROGRESS are excluded
until their business meaning is confirmed.

The status names above are conceptual prototype vocabulary. Exact Prisma enum
names and migration shape are intentionally not finalized in Phase 9A.

### 6.5 Responsible person and Hospital filtering

**LEGACY REFERENCE:**

- The patient-specific create form requires a Doctor selection.
- The global create form validates a staff_id and labels the field
  Doctor/staff.
- The query helper writes doctor_id.
- Staff discovery reads a doctors table, joins a user record, and filters by a
  singular users.hospital_id in several paths.
- The global list filters staff to doctor/helper in one path; another path
  reads active doctors without applying the same role filter.
- Patient and staff lists are expanded using getAccessibleHospitalIds and
  parent/child/sibling Hospital hierarchy.
- The inspected legacy user shape exposes one hospital_id; no multi-Hospital
  membership model was found in these Appointment sources.

The source therefore proves that a responsible person was operationally
important in the UI, but it does not prove that the person must be a Doctor,
that a Doctor is a distinct authorization role, or that all pages enforce the
same staff filter.

**PROTOTYPE ASSUMPTION / OPEN REQUIREMENT:**

- Use a conceptually nullable responsibleUserId? until the customer confirms
  that every Appointment must have a responsible person.
- If selected, resolve the user server-side and require an active direct
  Hospital membership in the Appointment's Hospital.
- Do not require profession = DOCTOR or NURSE in the first policy.
- Do not discover staff through parent, child, sibling, or network Hospitals.
- Keep createdByUserId separate from responsibleUserId.
- Whether a responsible person can belong to multiple Hospitals follows the
  rewrite's multi-membership model, but the selected membership must be direct
  and active for this target Hospital.

### 6.6 Legacy Appointment actions

| Action | Observed legacy behavior | Phase 9B.0 treatment |
| --- | --- | --- |
| Create | Browser checks a local role, loads Patient/staff/Hospital network data, then inserts an appointment with client-supplied Patient, doctor, creator, type, date/time, location, notes, and scheduled status. | **PROTOTYPE ASSUMPTION / OPEN REQUIREMENT:** Include create within direct PatientHospitalRelationship scope. Derive actor/creator and Hospital on the server. |
| View | Global and Patient-specific list/detail pages read appointments; the global page joins appointments to filtered Patients and shows one latest appointment per Patient in its main projection. | Include relationship-scoped history and detail with minimal Patient projection. |
| Edit/reschedule | Direct update of Patient, doctor, type, date/time, duration, location, notes. No shared business service or optimistic transition check. | Include only for SCHEDULED. Make the update a server-authorized, audited operation. |
| Cancel | Direct status update to cancelled from the UI, with a confirmation dialog. | Include from SCHEDULED only. |
| Complete | Direct status update to completed; global UI permits an explicit early completion after a warning. | Include as an explicit status action. Do not couple it to Follow-up submission. |
| No-show | Direct status update to no_show in the global list, usually gated by past time; not available consistently on the Patient page. | Include as an explicit action only after customer confirms timing/authority. |
| Delete | No normal Appointment delete action was found. Patient permanent-delete code can delete related rows as part of destructive Patient cleanup. | Exclude. No hard delete or Patient cascade is part of Phase 9B.0. |
| Start Follow-up | A completed Appointment with no detected Follow-up exposes a link/button. | Include as navigation to the Follow-up contract; it is not a persistence side effect. |

### 6.7 Appointment-specific legacy risks

**LEGACY REFERENCE:** The following inconsistencies matter to the rewrite
contract:

- The global new form sends patient_id, staff_id, appointment_datetime, and
  location in one path, while the shared createAppointment helper accepts
  user_id, doctor_id, appointment_date, and location_type. This is evidence of
  field drift, not a reliable schema contract.
- The global list filters Patients by a Hospital network, then reads all
  appointments without applying the same Hospital predicate to the
  appointments query. Hospital ownership is inferred rather than explicit.
- The main list selects a latest appointment per Patient for display, while
  the Patient page exposes appointment history. These are different projections,
  not a defined current/latest invariant.
- Direct browser updates can race, repeat, or update an Appointment without
  checking its prior status.
- Role arrays and Hospital context are supplied from local session/browser
  state.

These risks are explicitly rejected for the rewrite in Section 8.

## 7. LEGACY REFERENCE — Follow-up

All findings in this section are observed legacy behavior only.

### 7.1 Follow-up entry points

The source shows both entry points:

| Entry point | Observed behavior |
| --- | --- |
| Appointment → Follow-up | The global appointment list and Patient appointment history offer a Follow-up action after an Appointment is completed and no Follow-up is found. |
| Patient Detail → Follow-up | Patient Follow-up history can navigate to a new form for a Patient with no Appointment. The form permits appointment_id = null. |
| Follow-up history → Follow-up | Patient history offers “new Follow-up”; when a completed Appointment is detected it attempts to pass that Appointment ID, otherwise it offers standalone recording. |

**LEGACY REFERENCE:** Follow-up is not identical to Appointment, and the source
allows a standalone Follow-up.

### 7.2 Patient, Appointment, Hospital, and actor relationships

The main form writes these concepts:

~~~text
appointment_followups.user_id
appointment_followups.appointment_id?
appointment_followups.conducted_by
~~~

The row is therefore linked to a legacy Patient/profile ID, optionally to an
Appointment, and to a client-supplied conducting user ID. No
PatientHospitalRelationship or explicit Hospital context is used in the
Follow-up query/write path.

History is loaded with user_id and ordered by followup_date and
followup_round. The detail view joins the optional Appointment date/type and
Patient profile. This is Patient-global behavior, not Hospital-scoped
history.

### 7.3 Follow-up round calculation

**LEGACY REFERENCE:** The source calculates the next round as:

~~~text
count(appointment_followups where user_id = Patient) + 1
~~~

This is used by both getFollowupRoundCount and the Follow-up form. The round
is therefore:

- per legacy Patient/profile ID;
- global across Hospitals;
- not per Appointment;
- not explicitly per Hospital;
- not based on a stored round counter;
- not protected by a transaction, row lock, or server idempotency nonce;
- not manually edited in the normal form, although edit mode preserves the
  existing number.

The count + 1 approach can allocate the same round to concurrent submissions.
It can also become inconsistent after deletion or other legacy cleanup. The
source does not establish a safe database invariant for standalone
appointment_id = null rows.

### 7.4 Follow-up fields observed

The current Follow-up form and write helper expose these groups:

| Group | Observed fields and values | Rewrite interpretation |
| --- | --- | --- |
| Measurement | weight, waist_circumference, blood_pressure_sys, blood_pressure_dia, blood_sugar_dtx. An older helper also mentions pulse, but the complete form does not render or write it. | LEGACY REFERENCE only. Candidate validation fields require customer/clinical confirmation. |
| Measurement display units | kg, cm, mmHg, and mg%/DTX are shown in the UI. | Observed labels, not confirmed units or clinical semantics. |
| Adaptation/progress | adaptation_summary with obstacles, opportunities, or other; adaptation_obstacles, adaptation_opportunities, adaptation_other. | Evidence for a reflection/obstacle note group, not a clinical classification. |
| Life artifact | life_schedule_image_url for an uploaded image/work sheet. | Attachment behavior is deferred for the rewrite. |
| Floating chart | floating_chart_image_url and floating_chart_summary. | Legacy artifact/text pair; meaning and requirement are unconfirmed. |
| Dream card | dream_card_image_url and dream_card_description. | Legacy artifact/text pair; meaning and requirement are unconfirmed. |
| Activity adherence | food_amount_status, food_type_status, movement_status; each has completed, not_completed, or not_in_plan plus a note field. | Three coarse legacy categories do not map one-to-one to the thirteen Goal activity codes. |
| Confidence | confidence_score from 0 to 10, default 5, plus confidence_improvement_plan. | The score range and labels are legacy UI behavior, not a confirmed clinical instrument. |
| Summary | summary is auto-generated from the three coarse activity statuses and remains editable in the form. | No automatic advice or derived clinical claim should be copied. |
| Recommendation | recommendations is free text for advice to the Patient. | Whether this is clinical data and who owns it is open. |
| Follow-up status | excellent, good, fair, needs_improvement, monitoring; default fair. | No source rule defines the meaning or transition of these labels. |
| Dates/actor | followup_date is user-editable; created_at/updated_at are written by the client path; conducted_by comes from client session state. | The rewrite should derive actor and recording time on the server. Arbitrary backdating is open. |

The complete form uses direct Supabase insert/update rather than consistently
calling the shared saveAppointmentFollowupComplete helper. The helper itself
has an older, smaller field shape and a separate upsert path.

### 7.5 Activity progress does not cleanly map to Goal Plan activities

**LEGACY REFERENCE:** The legacy Follow-up tracks exactly three coarse labels:

~~~text
food amount
food type
movement
~~~

Phase 8B.0 Goal Plans contain source-defined activity codes, target days,
optional target values/units, and immutable Plan items. The three legacy labels
cannot reliably identify which Goal activity was intended, what target was
met, or whether a different activity was substituted.

**PROTOTYPE ASSUMPTION / OPEN REQUIREMENT:** Phase 9C.0 should not force the
three legacy fields into Goal activities. If a Goal Plan context is selected,
use a small domain-specific structure:

~~~text
FollowupActivityProgress
- goalActivityCode
- status
- note?
~~~

Provisional status vocabulary:

~~~text
DONE
PARTIAL
NOT_DONE
NOT_APPLICABLE
~~~

DONE, NOT_DONE, and NOT_APPLICABLE are supported by the legacy idea; PARTIAL
is a deliberate prototype extension because the legacy binary status is too
coarse. PARTIAL has no clinical meaning until confirmed.

Progress rows must be limited to activities in the selected immutable Goal
Plan. This is a small within-domain structure, not a generic adherence or
workflow engine. If no Goal Plan is selected, the prototype should omit the
activity-progress section or record only a general note; it should not silently
reinterpret current activities.

### 7.6 Follow-up history and progress display

**LEGACY REFERENCE:**

- Patient history reads all Follow-ups for the legacy user_id and orders newest
  first by followup_date and followup_round.
- The form shows the three most recent prior rows while recording a new row.
- Patient history displays a table with round, date, measurements, confidence,
  three coarse activity indicators, status, detail, and edit actions.
- Patient history calculates first-to-latest changes for weight, waist, DTX, and
  confidence and displays simple graphs.

The source does not define clinical thresholds for “improved.” For example,
lower weight/waist/DTX and higher confidence are treated as improvement in the
UI. The rewrite must not copy those derived claims without confirmed rules.

### 7.7 Follow-up status and side effects

**LEGACY REFERENCE:** Creating a Follow-up through the appointment-linked form
can update the related Appointment to completed after the Follow-up insert.
The observed order is:

~~~text
insert appointment_followups
  → update appointments.status = completed
~~~

These are separate browser Supabase calls. A successful first write followed by
a failed second write can leave partial business state. A Follow-up created
without an Appointment has no Appointment status side effect.

The route has additional inconsistencies:

- isEditMode becomes true for any non-new dynamic route ID, so the same route
  can treat an Appointment ID as a Follow-up ID and query
  appointment_followups.id first;
- Patient appointment history links to followup/new with appointment_id in the
  query string, but the form's appointment-loading branch reads the dynamic
  route ID and does not consistently bind that query-string Appointment;
- the main form uses direct insert/update while saveAppointmentFollowup offers
  an upsert on appointment_id + followup_round.

These source-level inconsistencies mean that the existence of
appointment_id in a row is evidence of an intended link, not proof that every
legacy entry point created the link correctly.

### 7.8 Follow-up mutability

**LEGACY REFERENCE:** The Follow-up history exposes an Edit action. The form
loads an existing row and updates it in place. There is no correction,
amendment, revision, reviewer, or audit-history concept for the edit.

The options are:

| Option | Assessment |
| --- | --- |
| A. Mutable Follow-up rows | Matches legacy UX but allows submitted history and provenance to change without a preserved correction reason. |
| B. Immutable rounds | Smallest safe Phase 9C.0 contract, consistent with immutable Screening submissions and Goal Plan rounds. |
| C. Immutable records plus correction/amendment | Stronger long-term clinical/operational history, but the amendment authority, visibility, linkage, and UI are not confirmed. |

**PROTOTYPE ASSUMPTION / OPEN REQUIREMENT:** Use option B for Phase 9C.0:
submit one immutable Follow-up round, do not expose edit/delete, and defer
correction/amendment semantics. Option C is the likely future direction if
correction is required; it must be designed and accepted before implementation.

### 7.9 Attachments and images

**LEGACY REFERENCE:** The Follow-up form accepts image/* files, rejects files
over 5 MB in client code, uploads to a bucket named followup-images, then stores
a one-year signed URL in the Follow-up row. The file name contains a
Patient-like ID, round, field name, timestamp, and random suffix. The detail
page renders and opens the URL directly.

The inspected source does not show:

- a committed bucket policy;
- server-side MIME/content validation;
- a stable attachment/file-record abstraction;
- retention/deletion behavior;
- cleanup of replaced images;
- a non-expiring object reference;
- a shared privacy/authorization boundary for signed URL generation.

Persisting an expiring signed URL as the permanent clinical reference is
unsafe: the row can remain while the URL later expires, and the URL itself is
an access-bearing value. This behavior is rejected for the rewrite.

**PROTOTYPE ASSUMPTION / OPEN REQUIREMENT:** Defer attachment implementation
from Phase 9B.0/9C.0. Keep the three legacy artifact questions visible for
customer validation. If an image is essential to the customer demonstration,
design a shared server-owned attachment boundary first; do not add a generic
file-management or DAM platform.

## 8. Legacy behavior explicitly rejected

The following behavior must not be copied into rewritten DEMI:

| Legacy behavior | Classification for rewrite | Reason |
| --- | --- | --- |
| Browser local-storage role checks and client-only session gates | **CONFIRMED** rejection | Authorization must resolve server-side ActorContext, capability, scope, and target resource. |
| Direct browser Supabase reads/writes for Appointment and Follow-up | **CONFIRMED** rejection | The accepted UI → transport → service → policy → Prisma boundary owns business and authorization behavior. |
| Client-supplied raw Patient/User/creator/conductor IDs as authority | **CONFIRMED** rejection | Resolve Person/User, actor, PatientHospitalRelationship, creator, and responsible staff on the server. |
| Parent/child/sibling Hospital expansion for Patient access | **CONFIRMED** rejection | Direct Hospital relationship is authoritative; hierarchy metadata must not widen Patient scope. |
| Treating Doctor or helper as a top-level authorization role | **CONFIRMED** rejection | DOCTOR/NURSE remain profession classifications; authority comes from Role + Capability + Scope. |
| Count + 1 Follow-up round allocation without concurrency protection | **CONFIRMED** rejection | Use relationship-scoped database uniqueness, serializable allocation, bounded retry, and duplicate-submit protection. |
| Mutable clinical/operational history without correction semantics | **CONFIRMED** rejection | Phase 9C.0 should use immutable submitted history; correction/amendment must be explicit later. |
| Storing one-year signed URLs as permanent image references | **CONFIRMED** rejection | Use a future shared attachment boundary with stable references and server-controlled access, or defer attachments. |
| Automatic Appointment completion as an implicit Follow-up side effect | **CONFIRMED** rejection | Appointment status and Follow-up submission are separate business actions until an explicit atomic contract is accepted. |
| Sequential writes with partial success and no shared transaction | **CONFIRMED** rejection | Follow-up, progress, Appointment linkage/status if ever coupled, and audit must share the accepted transaction boundary. |
| Raw measurement, notes, names, HN, or recommendations in audit metadata | **CONFIRMED** rejection | Audit metadata must remain bounded, opaque, and privacy-safe. |
| Hard delete of Patient-related clinical history as normal Appointment behavior | **CONFIRMED** rejection | Retention, closure, correction, and recovery requirements are not defined. |

## 9. PROPOSED Phase 9B.0 Appointment Prototype Contract

Everything in this section is **PROTOTYPE ASSUMPTION / OPEN REQUIREMENT** unless
it repeats an inherited CONFIRMED boundary.

### 9.1 Smallest demonstrable workflow

~~~text
Patient Detail
  → Appointments
  → Appointment history
  → Create
  → Appointment detail
  → Reschedule
  → Cancel
  → Complete / No-show
  → Start Follow-up
~~~

The first prototype should demonstrate one Hospital-scoped Patient workflow,
not a calendar or availability system:

1. Open a Patient relationship from the existing Patient Detail page.
2. Read relationship-scoped Appointment history.
3. Create an Appointment with a date/time and the smallest provisional fields.
4. View its detail and current status.
5. Reschedule while it is SCHEDULED.
6. Cancel, complete, or mark no-show through explicit actions.
7. From a COMPLETED Appointment, navigate to the Follow-up form.

The UI should show a clear prototype notice that appointment types, responsible
staff authority, patient visibility, and status rules are provisional.

### 9.2 Resource and input boundary

Proposed resource:

~~~text
PatientHospitalRelationship
  ↓
PatientAppointment
~~~

The transport may accept an opaque relationship ID, submission nonce, and
allowed Appointment fields. It must reject or ignore client authority fields
such as actor user ID, Hospital ID, Patient ID, creator ID, assignment ID,
status override, or responsible-user authority. The service re-resolves:

- the authenticated ActorContext;
- the active direct Hospital context;
- the PatientHospitalRelationship;
- exact OSM assignment if the actor is OSM;
- the selected responsible User and same-Hospital membership, if supplied.

### 9.3 Provisional Appointment fields

These are conceptual fields, not a finalized Prisma schema:

| Field | Phase 9B.0 proposal |
| --- | --- |
| patientHospitalRelationshipId | Required resource owner; server-authoritative. |
| scheduledAt | Required exact date/time for the first prototype. Whether a date/window is enough remains open. |
| type | Required provisional FOLLOW_UP or CONSULTATION classification; no type-specific automation. |
| responsibleUserId? | Optional until the customer confirms that every Appointment requires a responsible person. If present, server validates direct active membership in the same Hospital. |
| durationMinutes? | Optional with the legacy 30-minute default as a visible provisional value; exact choices remain open. |
| locationType? | Optional prototype classification such as CLINIC, ONLINE, HOME_VISIT, or OTHER; actual required locations remain open. |
| locationDetail? | Optional bounded operational detail; no external calendar or meeting integration. |
| note? | Optional free text stored in the Appointment projection but never copied to audit metadata. |
| status | Server-controlled lifecycle state. |
| createdByUserId | Derived from server ActorContext. |
| createdAt/updatedAt | Server timestamps. |
| submissionNonce | Recommended for create retry/double-submit protection. |

The exact names, nullability, limits, time zone policy, and schema constraints
remain unresolved.

### 9.4 Provisional status contract

Phase 9B.0 should implement only:

~~~text
SCHEDULED
COMPLETED
CANCELLED
NO_SHOW
~~~

No automatic time transition is proposed. The operator explicitly chooses
Complete or No-show. No-show should use server time rather than browser time;
the initial prototype may require the scheduled time to have passed. Whether
early completion/no-show exceptions are permitted is a customer question.

Terminal status behavior:

- COMPLETED cannot be rescheduled or cancelled in this slice.
- CANCELLED cannot be silently reopened; a new Appointment is the safe
  prototype path.
- NO_SHOW cannot be silently reopened; a new Appointment is the safe prototype
  path.
- A Follow-up does not mutate status automatically.

### 9.5 Provisional actions included

Include in Phase 9B.0:

- relationship-scoped history/read;
- create;
- detail;
- reschedule while SCHEDULED;
- cancel while SCHEDULED;
- explicit complete while SCHEDULED;
- explicit no-show while SCHEDULED, subject to the confirmed time rule;
- Start Follow-up navigation from a COMPLETED Appointment.

Intentionally exclude from this slice:

- delete;
- recurring appointments;
- doctor availability or booking conflict engine;
- reminders and notifications;
- Patient self-booking;
- calendar synchronization;
- cross-Hospital appointment creation;
- automatic Appointment creation from Goal Plan or Screening;
- automatic Follow-up creation or completion.

### 9.6 Responsible staff proposal

The prototype may display a responsible-person selector, but it must not call
the selected person a top-level Doctor role. A future server query should:

1. load active users with an active direct membership in the Appointment's
   Hospital;
2. display only a minimal name/profession projection;
3. validate the selected opaque User ID again in the mutation service;
4. keep creator and responsible person separate.

Whether OSM can be selected as responsible, whether only selected professions
are eligible, whether a Patient can choose the person, and whether the field
is required are open requirements.

## 10. PROPOSED Phase 9C.0 Follow-up / Progress Prototype Contract

Everything in this section is **PROTOTYPE ASSUMPTION / OPEN REQUIREMENT** unless
it repeats an inherited CONFIRMED boundary.

### 10.1 Smallest demonstrable flow

~~~text
Completed Appointment or Patient Detail
  → New Follow-up
  → choose/reference Goal Plan context
  → measurements
  → Goal activity progress
  → confidence / notes
  → review
  → submit
  → immutable Follow-up detail/history
~~~

The flow supports both:

- an optional Appointment-linked Follow-up from a COMPLETED Appointment; and
- a standalone Follow-up from Patient Detail when no Appointment is available.

If an Appointment ID is supplied, the service must verify that it belongs to
the exact same PatientHospitalRelationship and is in the accepted precondition
state. The first prototype should require COMPLETED rather than silently
completing it as part of Follow-up submission. If the business later requires a
single “complete and record Follow-up” action, it must be defined as one
explicit transactional operation.

### 10.2 Goal Plan provenance

The Follow-up should conceptually contain an optional:

~~~text
sourceGoalPlanId?
~~~

When supplied:

- it must belong to the exact PatientHospitalRelationship;
- it must refer to the historical immutable Goal Plan selected by the user;
- the service must verify access through the Goal-owned server boundary rather
  than trusting a browser ID;
- progress codes must be members of that Plan's immutable items;
- historical detail must continue to reference that same Plan and must not
  reinterpret progress against the latest Goal Plan;
- if the source Plan definition/version is unavailable, the detail should fail
  closed rather than silently substitute the current Plan.

When no Goal Plan exists or the user chooses standalone recording, the
Follow-up may still record measurements and reflection notes. The prototype
must not invent activities or silently attach the latest Plan.

This provenance requirement is more important than the exact future field name.
Whether an actor must have goal:read to select a Goal Plan, and what minimal
Goal summary is visible in the Follow-up form, are open requirements.

### 10.3 Provisional Follow-up round behavior

The first prototype should use immutable submitted rounds scoped to:

~~~text
PatientHospitalRelationship
~~~

Provisional rules:

- round allocation is server-side and relationship-scoped;
- the database must enforce unique relationship + round;
- serializable transaction plus bounded retry handles concurrent submissions;
- a UUID submission nonce makes a repeated form submission idempotent;
- same nonce + same accepted payload/scope returns the existing Follow-up;
- same nonce + changed payload/scope is rejected as a conflict;
- a new nonce creates a deliberate later round;
- no edit/delete route is included;
- correction/amendment is deferred and must not be hidden in an overwrite.

The round is not per Appointment and not global across Hospitals. The exact
display numbering and whether rounds can be skipped are open but must not rely
on an unprotected count + 1 calculation.

### 10.4 Provisional measurements

For requirement validation, the first form may show these optional fields:

| Conceptual field | Legacy label/unit evidence | Semantics still open |
| --- | --- | --- |
| weight? | weight, displayed as kg | unit source, precision, context, valid range, and who may submit. |
| waistCircumference? | waist_circumference, displayed as cm | measurement procedure, position, precision, valid range, and who may submit. |
| systolicBloodPressure? | blood_pressure_sys, displayed with mmHg | measurement procedure, device/context, pairing with diastolic value, precision, range, and who may submit. |
| diastolicBloodPressure? | blood_pressure_dia, displayed with mmHg | Same unresolved semantics as systolic value. |
| bloodSugar? | blood_sugar_dtx, displayed as mg% | DTX meaning, fasting/post-meal/context, unit, precision, valid range, and who may submit. |

No clinical ranges, alert thresholds, BMI, improvement formula, or
recommendation is invented in Phase 9A. The first prototype may validate
presence, finite numeric shape, and request bounds, but clinical validation
rules require confirmation.

Whether Patient can submit a measurement directly, whether a Hospital or OSM
actor can submit it, and whether a measurement is observation data or a
self-report are open requirements.

### 10.5 Goal activity progress

When sourceGoalPlanId is selected, the form may render one row per selected
Goal Plan activity:

~~~text
PatientFollowupActivityProgress
- goalActivityCode
- status
- note?
~~~

The first provisional statuses are:

~~~text
DONE
PARTIAL
NOT_DONE
NOT_APPLICABLE
~~~

No percentage, score, adherence rate, clinical conclusion, or automatic next
Goal Plan is calculated. The prototype only records the user's selected
status/note against the historical activity context.

The legacy food amount/food type/movement fields may be shown in the analysis
workshop as terminology evidence, but they should not be persisted as the
canonical new progress structure when a Goal Plan is selected.

### 10.6 Reflection, confidence, and notes

The smallest proposed reflection group is:

- one bounded reflection/obstacle note, based on the legacy adaptation group;
- optional confidenceScore, with the legacy 0–10 scale labeled as provisional;
- optional confidence improvement note/plan;
- optional general Follow-up note.

The legacy separate summary and recommendations fields should not be copied
blindly. A future prototype may include a bounded summary note, but
recommendations need explicit confirmation of ownership, visibility, and
clinical meaning. No automatic advice is generated.

The legacy five Follow-up status values may be retained as a visual workshop
question, but they are excluded from the smallest persistence contract until
their meaning and authority are confirmed. Appointment status is not a
Follow-up clinical status.

### 10.7 Prototype definition strategy

**PROTOTYPE ASSUMPTION / OPEN REQUIREMENT:** A small source-defined definition
is useful if the prototype needs stable field labels, legacy category
terminology, and progress status vocabulary. The future implementation may use:

~~~text
definitionKey:   demi-followup
definitionVersion: followup-prototype-v1
~~~

It may contain only:

- display labels and field groups;
- provisional observed units;
- provisional progress statuses;
- the mapping/display rules needed by this prototype.

It must not contain clinical thresholds, treatment rules, recommendations,
generic templates, or a template editor. Persisting the definition key/version
is a future implementation choice to be justified by historical display needs;
Phase 9A does not add the registry.

### 10.8 Privacy and history projection

Follow-up detail/history should show only fields authorized for the actor and
the exact relationship. It must not expose authentication/provider data or
unrelated Patient relationships. Clinical free text and measurements remain
data fields, not audit metadata.

Routine reads are not proposed for audit in the first slice. If read auditing
is later required, it should be a separately named, bounded event rather than
logging every page load.

## 11. Proposed persistence concepts

These concepts communicate the future contract without finalizing Prisma
schema, enum names, foreign-key actions, or migrations.

### 11.1 PatientAppointment

~~~text
PatientAppointment
  id
  patientHospitalRelationshipId
  responsibleUserId?
  createdByUserId
  type
  scheduledAt
  durationMinutes?
  locationType?
  locationDetail?
  note?
  status
  submissionNonce
  createdAt
  updatedAt
~~~

The relationship is the resource owner. Hospital ID is derived from that
relationship rather than accepted as a parallel client authority field.

### 11.2 PatientFollowup

~~~text
PatientFollowup
  id
  patientHospitalRelationshipId
  appointmentId?
  sourceGoalPlanId?
  createdByUserId
  roundNumber
  submissionNonce
  recordedAt
  prototypeDefinitionKey?
  prototypeDefinitionVersion?
  weight?
  waistCircumference?
  systolicBloodPressure?
  diastolicBloodPressure?
  bloodSugar?
  confidenceScore?
  reflectionNote?
  confidencePlan?
  createdAt
~~~

Exact measurement representation, unit storage, date/backdating semantics,
status field, free-text groups, and correction linkage remain open. The
conceptual record is immutable after submit in Phase 9C.0.

### 11.3 PatientFollowupActivityProgress

~~~text
PatientFollowupActivityProgress
  id
  followupId
  goalActivityCode
  status
  note?
  createdAt
~~~

The row is intentionally small and scoped to the Follow-up/Goal Plan
relationship. It is not a reusable adherence engine. Whether it should also
store a GoalPlanItem ID or a copied label is a future persistence decision; the
source Goal Plan ID and historical version must remain authoritative.

## 12. Proposed capability vocabulary and actor matrix

### 12.1 Minimal provisional capabilities

**PROTOTYPE ASSUMPTION / OPEN REQUIREMENT:** Start with four broad
capabilities:

~~~text
appointment:read
appointment:manage
followup:read
followup:record
~~~

appointment:manage covers create, reschedule, cancel, complete, and no-show
for the first prototype. Separate capabilities such as
appointment:complete, appointment:cancel, followup:correct, or
followup:approve are intentionally not added before actual authority
differences are confirmed.

**CONFIRMED source note:** The Architecture Baseline also lists
`appointment:create`, `appointment:update`, `followup:read`, and
`followup:create` as a potential starting vocabulary, while explicitly saying
that the list is not a final permission matrix. The `manage`/`record` grouping
above is therefore a Phase 9 prototype naming proposal, not an override of
that baseline. The implementation slice must choose one consistent vocabulary
before adding capability constants or policies.

The vocabulary is provisional. It does not establish final role-to-capability
assignment.

### 12.2 Provisional actor matrix

The following table is a prototype operating assumption for requirement
validation, not a confirmed authority matrix. “Exact assignment” means an
active OSM–Hospital relationship plus the exact active PatientOsmAssignment
for the target PatientHospitalRelationship.

| Operation | Hospital OWNER | Hospital MEMBER | OSM exact active assignment | OSM without assignment | PATIENT | Platform ADMIN |
| --- | --- | --- | --- | --- | --- | --- |
| Read Appointment history/detail | Allow in direct Hospital scope | Allow in direct Hospital scope | Allow for assigned relationship | Deny | Deny in first prototype; SELF read is open | Deny routine clinical read |
| Create Appointment | Allow in direct Hospital scope | Allow for MVP; authority equality is open | Deny by default; OSM creation is open | Deny | Deny; self-request is open | Deny routine operation |
| Reschedule | Allow while SCHEDULED | Allow while SCHEDULED for MVP; open | Deny by default; open | Deny | Deny; self-reschedule is open | Deny routine operation |
| Cancel | Allow while SCHEDULED | Allow while SCHEDULED for MVP; open | Deny by default; open | Deny | Deny; self-cancel is open | Deny routine operation |
| Complete | Allow explicit transition | Allow explicit transition for MVP; profession does not change it | Deny by default; OSM completion is open | Deny | Deny | Deny routine operation |
| Mark no-show | Allow explicit transition | Allow explicit transition for MVP; open | Deny by default; open | Deny | Deny | Deny routine operation |
| Read Follow-up history/detail | Allow in direct Hospital scope | Allow in direct Hospital scope | Allow for assigned relationship | Deny | Deny in first prototype; SELF read is open | Deny routine clinical read |
| Record Follow-up | Allow in direct Hospital scope | Allow for MVP; profession rule is open | Allow as a provisional assigned-Patient operation, subject to customer confirmation | Deny | Deny; self-record is open | Deny routine operation |
| Correct/amend submitted Follow-up | No operation in 9C.0 | No operation in 9C.0 | No operation in 9C.0 | Deny | Deny | No routine bypass |

Important open authority questions include whether Hospital MEMBER and OWNER
should differ, whether profession matters, whether OSM can create or complete
Appointments, whether OSM can record Follow-up, what Patients can see or
request, and whether Platform ADMIN needs an separately approved support
projection. No row above grants authority merely from navigation visibility.

## 13. Transaction boundaries, retry, and audit

### 13.1 Appointment create

The conceptual local transaction is:

~~~text
resolve server ActorContext
  → parse/validate request
  → resolve PatientHospitalRelationship and direct Hospital scope
  → resolve exact OSM assignment when applicable
  → validate responsibleUserId? in the same Hospital
  → allocate/check submission nonce
  → create PatientAppointment as SCHEDULED
  → record appointment.created audit
~~~

The Appointment row and successful audit must not partially succeed. The
creator is always the resolved actor, not a request field.

### 13.2 Appointment state mutation

Reschedule, cancel, complete, and no-show are separate explicit operations.
Each should:

- re-resolve actor and target relationship;
- check the current server status and expected transition;
- update only allowed fields;
- record the corresponding audit event in the same local transaction.

Conditional current-status checks prevent a stale browser from overwriting a
newer transition. Repeating an already-applied idempotent terminal action may
return the existing state; a conflicting transition should return a safe
conflict rather than silently overwrite history.

### 13.3 Follow-up submit

The recommended Phase 9C.0 boundary is:

~~~text
resolve actor and PatientHospitalRelationship scope
  → validate optional Appointment relationship/status
  → validate optional source Goal Plan through the Goal-owned boundary
  → validate provisional measurement/reflection/progress input
  → allocate relationship-scoped immutable round
  → create PatientFollowup
  → create PatientFollowupActivityProgress rows
  → record followup.created audit
~~~

All local writes above commit or roll back together. Appointment completion is
not included because the first contract requires an Appointment-linked
Follow-up to refer to an already COMPLETED Appointment. If the customer later
chooses a coupled action, it must be a new explicit transaction contract.

### 13.4 Retry and concurrency

Follow-up and Appointment creation are side-effecting submissions and should
use an opaque UUID nonce. The service must compare the accepted scope and
payload before returning an existing result. It must reject the same nonce
with changed Patient relationship, actor, source Goal Plan, Appointment, or
payload.

Round allocation must use a unique relationship/round database constraint and
serializable transaction with bounded retry for serialization/unique conflicts.
The existing Screening and Goal nonce/retry tests are implementation evidence
for this pattern; Phase 9 must apply it only where duplicate submission and
round allocation make it useful.

### 13.5 Minimal audit events

The smallest proposed mutation event vocabulary is:

~~~text
appointment.created
appointment.rescheduled
appointment.cancelled
appointment.completed
appointment.no_show
followup.created
~~~

Audit metadata may include only bounded opaque IDs and low-risk state:

~~~text
patientHospitalRelationshipId
appointmentId
followupId
sourceGoalPlanId
hospitalId
fromStatus
toStatus
roundNumber
prototypeDefinitionVersion
~~~

Do not include free-text notes, recommendations, measurement values, Patient
names, HN, National ID, identity hashes, credentials, auth provider data,
tokens, or signed URLs. Routine reads are not audited by default.

## 14. Explicitly deferred

Unless later source analysis and customer requirements prove an item essential,
keep the following outside Phase 9B.0/9C.0:

- notifications;
- LINE / LIFF;
- SMS / email reminders;
- calendar sync;
- recurring appointment engine;
- doctor availability engine;
- patient self-booking;
- offline sync;
- native mobile API expansion;
- generic workflow engine;
- generic rules engine;
- care-plan engine;
- clinical recommendation engine;
- attachment implementation;
- dashboard metrics;
- reporting;
- referrals;
- FHIR / HL7;
- queues/workers;
- real-time push;
- correction/amendment UI and authority;
- Appointment deletion or Patient clinical hard delete;
- automatic Goal Plan creation or next-round recommendation;
- clinical measurement thresholds and derived progress claims;
- review/approval workflow unless a customer explicitly requires it;
- generic template editor or generic adherence engine.

## 15. Customer validation checklist

All questions below are **PROTOTYPE ASSUMPTION / OPEN REQUIREMENT** until
explicitly confirmed.

### Appointment

1. Who can create an appointment?
2. Can OSM create appointments?
3. Must an appointment have a Doctor/responsible staff member?
4. Can any Hospital MEMBER be responsible, or only selected professions?
5. Can appointments be created for another Hospital?
6. What appointment types are actually required?
7. Which statuses are needed?
8. Who may reschedule?
9. Who may cancel?
10. Who may mark completed/no-show?
11. Can Patients view appointments?
12. Can Patients request/reschedule/cancel appointments?
13. Is an appointment time exact or can it be a date/window?
14. Do appointments need locations other than clinic/free-text?
15. Are reminders required?

### Follow-up

16. Must Follow-up always originate from an Appointment?
17. Can Follow-up be recorded directly from Patient Detail?
18. Who may record Follow-up?
19. Can OSM record it for assigned Patients?
20. Should Follow-up automatically complete an Appointment?
21. Which measurements are required?
22. What are the units and validation rules?
23. Which Goal Plan should Follow-up compare against?
24. Can the user choose an older Goal Plan?
25. What does progress against an activity mean?
26. What activity statuses are required?
27. Is Confidence score required?
28. Are recommendations clinical data?
29. Can submitted Follow-up be edited?
30. If not, what correction/amendment process is required?
31. Are images/artifacts still used?
32. Are life schedule / floating chart / dream card still required?
33. What event triggers creating a new Goal Plan after Follow-up?
34. What Follow-up information should Patients see?
35. Should Follow-up reads be audited?

### Additional questions from source evidence

36. Is the Appointment responsible person required, optional, or selected after
    creation?
37. Is the responsible person a DEMI User, a Hospital membership, or another
    business resource?
38. Can one Appointment have more than one responsible person?
39. Can the responsible person belong to multiple Hospitals, and which
    membership is authoritative for this Appointment?
40. Are FOLLOW_UP and CONSULTATION enough for the first customer prototype?
41. Do SCREENING, EDUCATION, LAB, CHECKUP, TREATMENT, and OTHER change behavior
    or only display labels?
42. Can an Appointment be rescheduled after cancellation or no-show, or must a
    new Appointment be created?
43. Can a future Appointment be completed early or marked no-show?
44. What time zone and daylight-saving/locale rules apply to scheduledAt?
45. Can two active Appointments overlap for one Patient or responsible person?
46. Is duration operationally meaningful or display-only?
47. Are location type and location detail required, and which values are valid?
48. Should a standalone Follow-up with no Goal Plan be allowed after a
    PatientHospitalRelationship has no current Goal?
49. Should the user select a historical Goal Plan explicitly, or should the
    latest accessible Plan be the default only?
50. Does sourceGoalPlanId require goal:read, or can Follow-up use a narrower
    Goal-owned provenance check?
51. Are the legacy three activity categories still used anywhere, and how are
    they related to configured Goal activities?
52. Should PARTIAL exist, and what does it mean operationally?
53. Is confidence a Patient self-report, staff observation, or both?
54. What are the semantics and valid precision for each measurement?
55. Are measurement values required together, such as both blood-pressure
    components?
56. Are fasting/post-meal status, measurement device, or measurement context
    required?
57. Are summary and recommendations written by the same actor, and who may see
    them?
58. What retention and correction rules apply to Follow-up notes and
    measurements?
59. If attachments return, are the three legacy artifacts required or merely
    historical workflow aids?
60. Does customer support require any separate, audited break-glass clinical
    projection for Platform ADMIN?

## 16. Handoff and safe next steps

### What is safe to implement after review

1. Implement 9B.0 as a direct relationship-scoped Appointment slice using the
   existing server-side ActorContext/policy/service/Prisma conventions.
2. Confirm the Appointment status/type and actor decisions before adding
   migrations.
3. Implement 9C.0 only after the optional Appointment link and Goal Plan
   provenance rule are accepted.
4. Keep Follow-up records immutable in the first prototype and record
   correction/amendment as a separate future decision.
5. Add targeted authorization, transaction, retry, privacy, and integration
   tests before treating either prototype as a stable contract.

### Do not do before requirements are confirmed

- Do not add Doctor or Nurse as top-level roles.
- Do not use Hospital hierarchy to widen Patient access.
- Do not use OSM–Hospital association without exact PatientOsmAssignment.
- Do not grant Platform ADMIN routine clinical access.
- Do not add attachments merely because legacy has image fields.
- Do not use the current/latest Goal Plan to reinterpret an older Follow-up.
- Do not add clinical ranges, scoring, recommendations, or automatic Goal
  transitions from legacy labels.
- Do not create a generic workflow, adherence, rules, care-plan, or template
  engine.

No ADR change is required by this analysis. The document adds no accepted
architecture decision; all new Appointment/Follow-up authority, clinical,
visibility, and correction behavior remains provisional/open.
