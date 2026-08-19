# Phase 14A — DEMI Requirement Workshop Decision Pack

## 1. Phase Status

| Field | Value |
| --- | --- |
| Status | Complete — analysis/documentation only |
| Phase | 14A |
| Purpose | Customer requirement workshop preparation |
| Rewrite HEAD inspected | 980b624ea0b8ddfbf71ef217323ff833f6686966 |
| Implementation HEAD audited by Phase 13C | c3054107fa066000120906855b6078bb4308ce2e |
| Legacy reference | C:\Users\Bait0ng\Desktop\legacy-demi\demi-plus-web-v2, as behavioral evidence only |

The current HEAD is the Phase 13C documentation commit. The product
implementation is unchanged from the implementation HEAD audited by Phase 13C;
the difference between those commits contains documentation only. Phase 13C
concluded that Golden Journeys A–E are sufficiently connected for a customer
workshop and found no current DEMO_BLOCKER.

This document is a decision pack, not an implementation contract. It does not
authorize implementation of any unresolved requirement, and it does not
supersede an accepted ADR or phase contract.

## 2. Executive Summary

The prototype is ready for requirement discovery because it demonstrates a
connected narrative from Hospital onboarding through workforce provisioning,
Patient provisioning and activation, OSM assignment, Screening, Goal Plan,
Appointment, Follow-up, Patient profile, Baseline, Evidence, and governance
boundaries. Phase 13C found no current DEMO_BLOCKER.

The remaining uncertainty is primarily business semantics: who may see or
change what, how responsibility moves, what history must be retained, how
correction works, and what proof is trusted for recovery or governance. Several
surfaces are intentionally bounded prototype behavior rather than customer-
approved clinical or operational policy.

The next step is a customer workshop using the existing journeys. Implementation
should resume only after the customer decisions needed by the relevant domain
are captured and classified. Phase 14A itself makes no such decisions.

## 3. Workshop Principles

### Demonstrate current behavior first

Show the current route and outcome before asking whether it is correct. Name the
actor, Hospital context, and Patient–Hospital relationship at each handoff.
Where a manual login, activation-link handoff, Owner assignment, or storage
configuration is required, show that as a known demo prerequisite.

### Keep three categories separate

Use these labels while speaking and while recording notes:

1. **Accepted architecture** — a boundary already established by an accepted
   ADR or explicit current requirement. It is not reopened as an implementation
   preference.
2. **Current provisional prototype behavior** — an executable behavior added to
   validate a workflow. It may be changed after a customer decision.
3. **Customer-approved business requirement** — a decision captured during the
   workshop or in a later accepted requirement record. Phase 14A contains none
   of these new decisions.

### Ask business questions in operational language

Do not ask the customer to design a capability enum, table, or authorization
scope. Ask what the person should be able to do and what should happen to the
history.

For example:

> เมื่อ OSM หยุดทำงานกับผู้ป่วยรายหนึ่ง ใครยังควรเห็นประวัติการเยี่ยมเดิมได้
> บ้าง และใครควรเป็นผู้รับผิดชอบรายใหม่

The facilitator can map the answer to policy and data consequences after the
customer has answered.

### Record uncertainty explicitly

If the customer cannot decide, record the item as OPEN or DEFERRED with an
owner/follow-up. Do not convert silence, agreement that the demo is useful, or
legacy behavior into approval.

### Preserve safe boundaries during discovery

Do not use a requested screen, a legacy report, or a visible profession label as
proof that a new authority exists. A customer may request a business outcome
without selecting its technical architecture; Phase 14B will translate a
confirmed decision into the smallest safe implementation change.

## 4. Accepted Architecture and Boundary Card

The following boundaries are already accepted and should be treated as
constraints during the workshop:

- Person is different from User. One human should not receive duplicate core
  identities merely because they have multiple roles or Hospital relationships.
- Registration/provisioning is different from account activation.
- The only top-level roles are ADMIN, HOSPITAL, OSM, and PATIENT.
- Role, capability, and scope are separate. The policy decision is evaluated
  server-side and fails closed. Browser state, hidden UI, role parameters, and
  selected Hospital values are never authority.
- Platform ADMIN is not Hospital Owner. Hospital Owner is HOSPITAL plus exact
  Owner membership in the Hospital.
- Hospital staff and OSM are provisioned from trusted Hospital context. They do
  not self-select a role. Doctor and Nurse are profession classifications, not
  top-level roles.
- There is no generic public role-selection signup. Hospital onboarding is
  organization-led and manually verified by Platform ADMIN for the current MVP.
- Patient provisioning does not imply Patient account activation, OSM assignment,
  or Patient self-service.
- Staff/OSM must not know or set a Patient's secret credential. Target-owned
  first-time activation is separate from recovery.
- OSM–Hospital association is not by itself geographic scope, Patient scope,
  ownership, or clinical authority. Current OSM Patient access is exact
  assignment-scoped.
- Hospital hierarchy does not currently widen Patient access. Parent, child,
  sibling, or network metadata is not an authorization shortcut.
- Multi-record consistency-critical operations are transactional. Provider I/O
  remains behind the server boundary and is not treated as a fake distributed
  transaction.
- Platform ADMIN is primarily a governance, verification, recovery,
  reconciliation, and exception actor, not the routine Patient-care operator.
- Patient self-service, account recovery, final-Owner recovery, reconciliation,
  clinical correction, geography, hierarchy authorization, and reporting
  semantics remain unresolved unless explicitly marked otherwise below.

Reference authority: [Architecture Baseline](../architecture/DEMI_ARCHITECTURE_BASELINE.md),
[ADR index](../adr/README.md), [ADR-0001](../adr/0001-person-and-user-identity.md),
[ADR-0002](../adr/0002-role-capability-scope-authorization.md),
[ADR-0003](../adr/0003-hospital-led-onboarding.md),
[ADR-0004](../adr/0004-patient-provisioning-and-activation.md),
[ADR-0005](../adr/0005-server-side-application-boundary.md),
[ADR-0006](../adr/0006-transactional-business-operations.md), and
[ADR-0008](../adr/0008-workforce-provisioning-and-activation.md).

## 5. Current Demo Boundary

Phase 13C is the current demo-readiness authority:

- Journeys A–E are PASS_WITH_WORKSHOP_NOTE.
- There is no current DEMO_BLOCKER.
- The prototype is broad enough for requirement discovery, subject to prepared
  data, manual actor handoffs, and private storage configuration for Evidence.
- Screening, Goals, Appointments, Follow-up, Baseline, and Evidence show
  bounded requirement-validation behavior. They are not automatically final
  clinical policy.

### Journey A — Platform Admin / Hospital onboarding

~~~text
Hospital application
→ Admin review
→ approval/rejection
→ Hospital Owner login/workspace
~~~

Current behavior: a canonical Hospital application is reviewed by Platform
ADMIN; approval establishes the active Hospital, applicant account, HOSPITAL
role, and exact active Owner membership. The applicant then uses a separate
login. Verification evidence, rejection communication, reapplication, and
delivery are not defined.

### Journey B — Hospital Owner / Workforce

~~~text
Owner
→ workforce provisioning
→ activation handoff
→ target activation/login
→ role-appropriate workspace
~~~

Current behavior: an exact active Hospital Owner provisions a staff member or
OSM. A target user sets their own password through the purpose-specific
activation flow. Copy link, QR, and assisted activation are presentations of
the same activation capability. Profession-specific authority, OSM geography,
transfer, and account recovery remain open.

### Journey C — Hospital / OSM Patient Care

~~~text
Patient provisioning
→ Patient relationship
→ OSM assignment
→ Screening
→ Goal Plan
→ Appointment
→ Follow-up
→ Profile / Baseline / Evidence / History
~~~

Current behavior: the care chain uses the exact Patient–Hospital relationship.
Hospital actors use direct Hospital scope; OSM access requires the exact active
OSM relationship and assignment. Screening does not automatically create a
Goal Plan. Goal Plan, Appointment, Follow-up, Baseline, and Evidence behavior is
bounded and provisional. Evidence upload additionally needs the configured
private storage bucket.

### Journey D — Patient

~~~text
Provisioned Patient
→ first-time activation
→ login
→ bounded current landing
~~~

Current behavior: the Patient can establish a first credential and reach the
bounded Patient landing. Patient self-service is intentionally not defined:
there is no accepted Patient portal, self-editing, Patient measurement
submission, appointment management, or clinical-history visibility contract.

### Journey E — Governance / Lifecycle

~~~text
Staff membership lifecycle
OSM relationship lifecycle
Hospital lifecycle
Hospital Owner governance
~~~

Current behavior: the prototype demonstrates bounded profession update and
ordinary staff membership suspend/restore, OSM suspend/restore with an
exact-Hospital assignment guard, Hospital ACTIVE/SUSPENDED status-only
governance, and provisional Owner promotion/demotion with a final eligible Owner
guard. These are separate relationship, organization, and account boundaries.
User recovery, emergency suspension, transfer, final-Owner rescue, notification,
appeal, and cascade semantics remain open.

### Material handoffs and prerequisites

The workshop facilitator should prepare, without redesigning the flow:

- a Platform ADMIN, canonical active Hospital master data, pending application,
  approved Owner, ordinary Member, OSM, and a second eligible Owner/Member;
- one provisioned Patient, one activated Patient, one exact OSM assignment, and
  representative Screening, Goal Plan, Appointment, Follow-up, Baseline, and
  Evidence records;
- separate login ceremonies for Admin approval, target activation, and Patient
  activation;
- an Owner handoff for OSM assignment;
- a private Evidence storage bucket when showing upload/view;
- disposable or pre-staged data because activation credentials are one-time and
  histories accumulate by design.

These are workshop setup requirements, not new product requirements.

## 6. Requirement Decision Register

### 6.1 How to use this register

The register contains open decisions and the constraints that frame them. The
Customer decision field is intentionally empty. A status of DECISION_REQUIRED
means the relevant future implementation would otherwise invent security,
privacy, lifecycle, integrity, or clinical behavior. It does not mean the
current demo is blocked.

Allowed statuses:

- OPEN — a real question is recorded but not yet prioritized for a slice.
- DECISION_REQUIRED — answer before implementing the relevant behavior.
- CAN_DEFER — safe to leave unresolved while the current prototype and other
  confirmed flows continue.
- CONFIRMED — only for an explicit existing requirement, not a workshop
  assumption.
- REJECTED — explicitly rejected by an accepted source.
- DEFERRED — explicitly deferred by an accepted source.

### P14A-R01 — OSM Patient scope and geography

- **Domain:** OSM scope and assignment
- **Business question:** Is OSM Patient access based only on explicit assignment,
  or also on Hospital membership, village/area/geography, or a combination?
  If geography matters, which operational data and authority establish it?
- **Why the decision matters:** A broader scope changes privacy exposure,
  assignment workflows, search projections, and every Patient-care policy.
- **Current prototype behavior:** OSM Patient read and care routes require the
  exact active OSM–Hospital relationship and exact active Patient assignment.
  Geography is not implemented.
- **Accepted architectural constraint:** OSM–Hospital association alone is not
  Patient or clinical scope; current Patient access is assignment-scoped and
  server-authorized.
- **Legacy evidence, if relevant:** Legacy village/coach screens and
  hierarchy-shaped filters show operational concepts but do not prove
  geography-based authorization.
- **Possible business options:** Keep assignment-only; add geography as a
  second constraint; use Hospital scope plus assignment; or define separate
  read and care scopes.
- **Customer decision:** Not captured during Phase 14A.
- **Decision status:** DECISION_REQUIRED
- **Downstream impact:** OSM policy, Patient directory, assignment model,
  transfer/reassignment, reporting, and possibly data model/indexes.
- **Implementation blocker?:** Yes for any scope expansion; no current demo
  blocker.
- **Notes:** Do not infer geography from village records.

### P14A-R02 — Multiple OSM responsibility and reassignment history

- **Domain:** OSM scope and assignment
- **Business question:** Can multiple OSMs work with one Patient–Hospital
  relationship at the same time? Who may assign, unassign, or reassign? What
  happens to active work and historical visibility after responsibility ends?
- **Why the decision matters:** Cardinality and history affect privacy,
  concurrency, work queues, audit, and the meaning of “current responsible OSM.”
- **Current prototype behavior:** One active assignment is allowed per
  Patient–Hospital relationship. Reassignment closes the prior state and
  preserves history; current OSM access ends when the assignment or relationship
  is inactive.
- **Accepted architectural constraint:** Assignment is a separate,
  Hospital-specific relationship; Patient provisioning does not imply it and
  assignment does not grant unrestricted clinical authority.
- **Legacy evidence, if relevant:** Legacy coach fields suggest a single current
  label but do not establish team, ownership, or history semantics.
- **Possible business options:** One active OSM; an ordered primary plus support
  OSMs; a concurrent care team; or explicit time-bounded handoffs.
- **Customer decision:** Not captured during Phase 14A.
- **Decision status:** DECISION_REQUIRED
- **Downstream impact:** Assignment schema/invariants, OSM directory, lifecycle
  actions, historical projections, Patient visibility, and reporting.
- **Implementation blocker?:** Yes before changing assignment cardinality or
  historical visibility; no current demo blocker.
- **Notes:** The current one-active-assignment rule is the accepted Phase 6
  contract for the current slice, not proof that future team semantics are
  settled.

### P14A-R03 — OSM relationship suspension, transfer, and ending

- **Domain:** OSM relationship lifecycle
- **Business question:** What should happen when an OSM stops working, changes
  Hospital, or must be suspended urgently? Should current assignments block the
  action, remain historical but inaccessible, require explicit resolution, or
  be reassigned?
- **Why the decision matters:** A lifecycle choice directly changes access,
  responsibility, safety, audit, and the Patient's operational continuity.
- **Current prototype behavior:** Exact Owner-only OSM suspend/restore is
  allowed only with zero current assignments in the exact Hospital. No automatic
  reassignment, transfer, deletion, or emergency override exists.
- **Accepted architectural constraint:** Relationship lifecycle is separate from
  User account recovery, Patient assignment, and role deletion.
- **Legacy evidence, if relevant:** Legacy inactive staff/coach behavior mixes
  account and relationship state and is not safe rewrite semantics.
- **Possible business options:** Block until assignments are resolved; allow
  suspension and preserve inaccessible history; end assignments explicitly;
  support a separately audited emergency override; or create a terminated state.
- **Customer decision:** Not captured during Phase 14A.
- **Decision status:** DECISION_REQUIRED
- **Downstream impact:** OSM lifecycle service/policy, assignment history,
  notifications, support procedures, reporting, and retention.
- **Implementation blocker?:** Yes before adding emergency, transfer, or
  termination behavior; no current demo blocker.
- **Notes:** The current zero-assignment guard is provisional prototype behavior,
  not a final answer to the emergency question.

### P14A-R04 — Parent/child Hospital network semantics

- **Domain:** Hospital hierarchy / network
- **Business question:** Does a parent/child Hospital relationship affect only
  organization display, or may a parent see Patients, manage workforce,
  configure a child, or read reports? Which actions, if any, cross the boundary?
- **Why the decision matters:** Network semantics can create cross-Hospital
  privacy exposure and inherited authority.
- **Current prototype behavior:** Hierarchy is visible as metadata where
  relevant, but current Patient, workforce, assignment, and governance policies
  require exact direct scope.
- **Accepted architectural constraint:** Hospital hierarchy does not currently
  widen Patient access and cannot silently grant authority.
- **Legacy evidence, if relevant:** Legacy accessible-Hospital filters broadened
  parent/child visibility; that is rejected as rewrite authorization.
- **Possible business options:** Display-only hierarchy; parent reporting only;
  parent configuration only; explicit per-capability network scope; or no
  cross-Hospital operations.
- **Customer decision:** Not captured during Phase 14A.
- **Decision status:** DECISION_REQUIRED
- **Downstream impact:** Policy scope vocabulary, Hospital administration,
  reporting, workforce provisioning, Patient projections, and audit.
- **Implementation blocker?:** Yes before any network-wide operation; no current
  demo blocker.
- **Notes:** Any accepted network authority that changes the boundary needs its
  own explicit policy and possibly ADR review.

### P14A-R05 — Hospital suspension consequences and communication

- **Domain:** Hospital governance and lifecycle
- **Business question:** During Hospital suspension, should existing sessions,
  reads, scheduled Appointments, reporting, or recovery remain available? Is
  restoration immediate, request-based, or conditional? Are reason, appeal,
  notification, or continuity steps required?
- **Why the decision matters:** Suspension affects every dependent relationship
  and may interrupt care without deleting data.
- **Current prototype behavior:** Platform ADMIN can change Hospital status
  ACTIVE ↔ SUSPENDED. The prototype is status-only, no-cascade, and existing
  Hospital-scoped policies fail closed; no reason, appeal, notification, or
  global session revocation is implemented.
- **Accepted architectural constraint:** Hospital lifecycle is separate from
  User, membership, OSM relationship, assignment, and clinical history
  lifecycles.
- **Legacy evidence, if relevant:** Legacy inactive flags do not define safe
  suspension or scheduling continuity.
- **Possible business options:** Keep status-only blocking; add a reason and
  appeal process; preserve read-only continuity; require operational
  rescheduling; or define emergency/recovery exceptions.
- **Customer decision:** Not captured during Phase 14A.
- **Decision status:** DECISION_REQUIRED
- **Downstream impact:** Hospital governance, session/account policy,
  Appointment operations, notifications, reporting, support, and audit.
- **Implementation blocker?:** Yes before changing lifecycle consequences; no
  current demo blocker.
- **Notes:** The current status-only behavior is a safe demonstration boundary,
  not final production policy.

### P14A-R06 — Hospital Owner appointment and final eligible Owner

- **Domain:** Hospital Owner governance
- **Business question:** May an Owner appoint or demote another Owner? May an
  Owner self-demote? What happens to the final remaining Owner, and who may
  intervene when no usable Owner remains?
- **Why the decision matters:** Owner changes control workforce provisioning and
  can strand a Hospital or create an unsafe global override.
- **Current prototype behavior:** A provisional Owner Set permits promotion and
  demotion of active exact-Hospital memberships and blocks a mutation that would
  leave an active Hospital with zero eligible Owners.
- **Accepted architectural constraint:** Hospital Owner is HOSPITAL plus exact
  Owner membership; Platform ADMIN is not a routine Owner-management shortcut.
- **Legacy evidence, if relevant:** Legacy admin-type fields do not establish
  multiple-Owner or final-Owner rules.
- **Possible business options:** Multiple co-Owners; one Owner only; a primary/
  recovery Owner; Owner approval or dual control; or separate emergency
  governance.
- **Customer decision:** Not captured during Phase 14A.
- **Decision status:** DECISION_REQUIRED
- **Downstream impact:** Owner policy, workforce provisioning, Hospital
  recovery, notifications, audit, and possibly schema invariants.
- **Implementation blocker?:** Yes before changing Owner governance or recovery;
  no current demo blocker.
- **Notes:** Phase 12D.0 is a provisional requirement-validation behavior, not
  customer approval of the long-term Owner model.

### P14A-R07 — Doctor, Nurse, and profession semantics

- **Domain:** Doctor / Nurse / profession
- **Business question:** Are Doctor and Nurse only profile/profession labels, or
  do they require different capabilities? Which actions require clinical
  responsibility or review attribution?
- **Why the decision matters:** Profession-sensitive rules change policy,
  workflow ownership, audit, and possibly clinical safety.
- **Current prototype behavior:** DOCTOR, NURSE, COORDINATOR, and OTHER are
  classifications. The prototype does not give them independent authority.
- **Accepted architectural constraint:** Profession is not a top-level role and
  must not become authorization merely because the value exists.
- **Legacy evidence, if relevant:** Legacy role labels and staff screens mix
  staff classification with access checks.
- **Possible business options:** Keep profession descriptive; restrict selected
  clinical actions; add review responsibility without new top-level roles; or
  define a separate confirmed capability matrix.
- **Customer decision:** Not captured during Phase 14A.
- **Decision status:** DECISION_REQUIRED
- **Downstream impact:** Screening, Goal Plan, Appointment, Follow-up,
  correction, audit, staff profile, and policy tests.
- **Implementation blocker?:** Yes before profession-sensitive behavior; no
  current demo blocker.
- **Notes:** Do not create Doctor/Nurse authorization roles during the workshop.

### P14A-R08 — Patient self-service visibility and actions

- **Domain:** Patient self-service
- **Business question:** After activation, what should a Patient see and do?
  May the Patient view Profile, Screening, Goal Plans, Appointments, Follow-up,
  Baseline, Evidence, or only an account-ready landing?
- **Why the decision matters:** Patient visibility is privacy-sensitive and
  cannot be safely inferred from the conceptual SELF scope.
- **Current prototype behavior:** Patient activation and login end at a bounded
  Patient landing with no Patient data links or self-service workflow.
- **Accepted architectural constraint:** PATIENT is a valid top-level actor, but
  self-service requires explicit capability, scope, projection, and mutation
  rules. It is not currently accepted.
- **Legacy evidence, if relevant:** No Patient portal was found in the inspected
  legacy app tree.
- **Possible business options:** No portal in MVP; read-only selected panels;
  full self-service; or staged visibility by domain and Hospital context.
- **Customer decision:** Not captured during Phase 14A.
- **Decision status:** DECISION_REQUIRED
- **Downstream impact:** Patient routes, policy, privacy projections, mobile/
  LIFF requirements, notifications, measurement ownership, and recovery.
- **Implementation blocker?:** Yes before implementing Patient-facing data; no
  current demo blocker.
- **Notes:** The current bounded landing is intentional, not an incomplete
  accidental portal.

### P14A-R09 — Patient field ownership and self-submitted measurements

- **Domain:** Patient self-service / Profile / clinical data
- **Business question:** Which personal fields may a Patient edit? Which are
  immutable or Hospital-owned? May a Patient submit health measurements,
  complete Screening, update Goal progress, acknowledge an Appointment, or
  correct their own data?
- **Why the decision matters:** Field-level authority affects identity integrity,
  clinical provenance, privacy, correction, and audit.
- **Current prototype behavior:** Profile is read-only; Baseline, Screening,
  Goals, Follow-up, and Evidence are not Patient self-service operations.
- **Accepted architectural constraint:** Identity, HN, assignment, and clinical
  records remain separate concerns; no generic Patient patch is accepted.
- **Legacy evidence, if relevant:** Legacy broad Patient forms show fields and
  edits but do not establish ownership or safe self-service.
- **Possible business options:** Patient edits only contact fields; Patient
  submits self-reported measurements separately; Hospital confirms changes; or
  no Patient mutation in MVP.
- **Customer decision:** Not captured during Phase 14A.
- **Decision status:** DECISION_REQUIRED
- **Downstream impact:** Profile schema/commands, clinical records, audit,
  conflict handling, Patient portal, and support workflows.
- **Implementation blocker?:** Yes before any Patient edit or submission flow;
  no current demo blocker.
- **Notes:** Do not treat the eight displayed profile fields as final ownership.

### P14A-R10 — Patient–Hospital relationship lifecycle

- **Domain:** Patient–Hospital relationship
- **Business question:** Can a Patient change Hospital, add another active
  relationship, transfer operational responsibility, or close an old
  relationship? Who authorizes it, and what happens to HN, OSM assignments,
  historical care records, and responsibility for past records?
- **Why the decision matters:** A transfer changes scope, privacy, assignment,
  history, and potentially primary operational responsibility.
- **Current prototype behavior:** Multiple Hospital relationships are supported
  by the identity model, but no transfer/change/close workflow exists. Existing
  records stay in their relationship.
- **Accepted architectural constraint:** Never implement transfer as
  delete-old-relationship plus add-new-relationship; preserve identity and
  historical records unless an explicit decision says otherwise.
- **Legacy evidence, if relevant:** Legacy largely assumed one Hospital and
  used broad filters; that does not override the rewrite model.
- **Possible business options:** Add a relationship; close the old one; formal
  transfer with source/target approval; referral without affiliation change; or
  allow multiple active relationships with explicit context.
- **Customer decision:** Not captured during Phase 14A.
- **Decision status:** DECISION_REQUIRED
- **Downstream impact:** Relationship lifecycle, HN, OSM assignment, all
  relationship-scoped clinical modules, Patient visibility, and reporting.
- **Implementation blocker?:** Yes before implementing transfer or closure; no
  current demo blocker.
- **Notes:** No destructive migration is implied.

### P14A-R11 — Screening questions, scoring, and version meaning

- **Domain:** Screening
- **Business question:** What is the final question wording/source, answer
  scale, scoring method, result interpretation, versioning, and requiredness?
  Are the current PAM/PROMs-style results clinical, operational, or only
  workshop labels?
- **Why the decision matters:** Incorrect scoring or wording can create unsafe
  clinical interpretation and makes historical results irreproducible.
- **Current prototype behavior:** A source-defined versioned questionnaire is
  validated and scored server-side using temporary legacy-style definitions.
  Results are historical and explicitly provisional.
- **Accepted architectural constraint:** Browser-calculated totals and labels
  are not authoritative; Screening is separate from Goals and does not create
  recommendations automatically.
- **Legacy evidence, if relevant:** Legacy question/scoring code contains
  wording and threshold inconsistencies and is not a clinical source of truth.
- **Possible business options:** Approve the current set as a named version;
  replace the set and scoring; use Screening only as an assessment record; or
  defer clinical interpretation while retaining a neutral submission.
- **Customer decision:** Not captured during Phase 14A.
- **Decision status:** DECISION_REQUIRED
- **Downstream impact:** Question registry, scoring service, historical data,
  result projections, Goal suggestions, clinical review, and tests.
- **Implementation blocker?:** Yes before production clinical semantics; no
  current demo blocker.
- **Notes:** Do not turn legacy formulas into accepted clinical rules by parity.

### P14A-R12 — Screening authority, review, correction, and side effects

- **Domain:** Screening
- **Business question:** Who may submit or review Screening? Is submission
  immediately final? May an OSM submit or only collect? May a Patient
  self-screen? How are corrections made, and may any result trigger a
  downstream workflow?
- **Why the decision matters:** This determines clinical responsibility,
  amendment history, privacy, and whether one mutation can create hidden
  downstream records.
- **Current prototype behavior:** Direct Hospital actors and exact-assigned OSM
  actors may read/submit for validation; Patient and ADMIN-only are denied.
  There is no review or amendment workflow, and no automatic Goal creation.
- **Accepted architectural constraint:** Assignment is not automatically
  clinical authority; unresolved authority defaults to deny. Screening does not
  automatically create or mutate Goals.
- **Legacy evidence, if relevant:** Legacy is staff-facing and has no reliable
  review/amendment contract; its post-save Goal behavior is explicitly not
  accepted.
- **Possible business options:** Immediate submitted record; Hospital review
  gate; OSM collection plus Hospital confirmation; Patient self-screening;
  append-only amendment; or no correction after submission.
- **Customer decision:** Not captured during Phase 14A.
- **Decision status:** DECISION_REQUIRED
- **Downstream impact:** Screening policy/lifecycle, clinical audit, Goal Plan
  coupling, Patient visibility, and correction services.
- **Implementation blocker?:** Yes before adding review, amendment, or automatic
  side effects; no current demo blocker.
- **Notes:** Current OSM capability is a validation prototype assumption.

### P14A-R13 — Goal Plan definition, ownership, and approval

- **Domain:** Goals / activity planning
- **Business question:** What is a Goal Plan? Are Primary Goals and activities
  customer-approved? Who creates, edits, or approves a plan? Can OSM create
  one, and does a Hospital reviewer or clinical profession have authority?
- **Why the decision matters:** Goal ownership controls care planning,
  accountability, templates, and any future clinical recommendation boundary.
- **Current prototype behavior:** An explicit immutable Goal Plan round is
  created from a source-defined provisional template. Direct Hospital and exact-
  assigned OSM actors may create/read for validation; no approval exists.
- **Accepted architectural constraint:** Goal Plan creation is explicit and
  separate from Screening. No automatic recommendation or hidden Goal write is
  accepted.
- **Legacy evidence, if relevant:** Legacy primary goals and PAM mappings are
  inconsistent and include destructive/archive behavior that is not copied.
- **Possible business options:** Hospital-only creation; OSM suggestion plus
  Hospital approval; shared creation; Patient participation; or a neutral
  activity plan with no clinical recommendation.
- **Customer decision:** Not captured during Phase 14A.
- **Decision status:** DECISION_REQUIRED
- **Downstream impact:** Goal templates/versioning, capability policy, Screening
  context, approval workflow, progress, Patient portal, and audit.
- **Implementation blocker?:** Yes before changing Goal authority or adding
  approval; no current demo blocker.
- **Notes:** Current template is requirement-validation data, not a clinical
  recommendation.

### P14A-R14 — Goal progress, participation, and amendment

- **Domain:** Goals / activity planning
- **Business question:** How is progress recorded? What does each activity
  status mean? Can a Patient contribute? Is adherence calculated? May a
  submitted plan or progress record be corrected, amended, or superseded?
- **Why the decision matters:** Progress semantics affect longitudinal history,
  measurement ownership, Patient visibility, and clinical interpretation.
- **Current prototype behavior:** Goal Plan rounds are immutable. Follow-up may
  record optional progress against the exact historical Plan; there is no
  approval, adherence engine, Patient edit, or correction workflow.
- **Accepted architectural constraint:** Historical plans must not be silently
  rewritten or reinterpreted against the latest Plan; cross-domain context is
  explicit and relationship-scoped.
- **Legacy evidence, if relevant:** Legacy weekly rows are mutable/deletable,
  and duplicate cleanup is evidence of repair pressure, not a delete contract.
- **Possible business options:** Staff-recorded progress; OSM-recorded
  progress; Patient self-report with confirmation; immutable amendments; or
  defer adherence and retain only observations.
- **Customer decision:** Not captured during Phase 14A.
- **Decision status:** DECISION_REQUIRED
- **Downstream impact:** Goal/Follow-up data, progress vocabulary, Patient
  portal, reporting, correction, and audit.
- **Implementation blocker?:** Yes before adding progress meaning or correction;
  no current demo blocker.
- **Notes:** Do not create clinical recommendation logic from current fields.

### P14A-R15 — Appointment authority and lifecycle

- **Domain:** Appointments
- **Business question:** Who creates, reschedules, cancels, completes, and
  marks no-show? Is a responsible staff member required? May OSM or Patient
  manage, request, or only view? Which statuses, times, locations,
  notifications, and cross-Hospital rules apply?
- **Why the decision matters:** Appointment authority affects scheduling
  responsibility, patient communication, and Follow-up entry conditions.
- **Current prototype behavior:** Relationship-scoped Appointments support
  create/reschedule/cancel/complete/no-show. Direct Hospital actors manage;
  exact-assigned OSM is read-only; Patient and ADMIN-only are denied. The
  completed Appointment → Follow-up link is explicit.
- **Accepted architectural constraint:** Appointment remains separate from
  Follow-up; completion does not automatically create a Follow-up or hidden
  clinical record.
- **Legacy evidence, if relevant:** Legacy forms show broader fields and
  global filtering but do not settle authority, timezone, or notifications.
- **Possible business options:** Hospital-only management; OSM management for
  assigned Patients; Patient request-only; responsible-person approval; or
  explicit scheduling states without provider/calendar integration.
- **Customer decision:** Not captured during Phase 14A.
- **Decision status:** DECISION_REQUIRED
- **Downstream impact:** Appointment policy/schema, staff responsibility,
  notifications, Patient self-service, Follow-up, and reporting.
- **Implementation blocker?:** Yes before changing lifecycle authority; no
  current demo blocker.
- **Notes:** Current statuses and fields are provisional demonstration behavior.

### P14A-R16 — Follow-up, progress, and measurement ownership

- **Domain:** Follow-up / progress / measurement ownership
- **Business question:** What constitutes a Follow-up? Must it link to an
  Appointment or Goal Plan? Who records it? Who owns measurements, confidence,
  notes, and activity progress? Which values can a Patient submit or see?
- **Why the decision matters:** These records may become clinical history and
  need clear provenance, units, correction, privacy, and responsibility.
- **Current prototype behavior:** Follow-up is an immutable relationship-scoped
  round. It may be standalone or explicitly linked to a completed Appointment
  and/or historical Goal Plan. Direct Hospital and exact-assigned OSM actors
  may record for validation; measurements and progress are provisional.
- **Accepted architectural constraint:** No hidden Appointment completion,
  Goal creation, Screening side effect, or fabricated progress rows. Historical
  Goal context must remain the exact selected Plan.
- **Legacy evidence, if relevant:** Legacy fields expose measurements,
  confidence, notes, recommendations, and images but do not define their
  ownership or clinical meaning.
- **Possible business options:** Staff-only record; OSM field record with
  Hospital review; Patient self-report; required measurement sets; or
  relationship-level observations without derived clinical claims.
- **Customer decision:** Not captured during Phase 14A.
- **Decision status:** DECISION_REQUIRED
- **Downstream impact:** Follow-up fields/validation, Goal progress, Baseline
  comparison, Patient visibility, correction, audit, and reporting.
- **Implementation blocker?:** Yes before changing measurement or progress
  semantics; no current demo blocker.
- **Notes:** Do not turn current units or numeric bounds into clinical ranges.

### P14A-R17 — Patient Profile ownership and visibility

- **Domain:** Patient Profile
- **Business question:** Who owns each profile field? Are fields shared across
  Hospitals or relationship-specific? Which actors may read or edit birth date,
  gender, contact, address, emergency contact, occupation, and education?
- **Why the decision matters:** A single Profile can be shared by a human with
  multiple Hospital relationships, so field ownership affects privacy and
  conflict resolution.
- **Current prototype behavior:** Eight selected fields are shown read-only in
  an authorized relationship detail. Directory projections remain minimal and
  no edit operation exists.
- **Accepted architectural constraint:** Person identity, PatientProfile, and
  PatientHospitalRelationship have separate ownership concerns; no generic
  arbitrary patch is accepted.
- **Legacy evidence, if relevant:** Legacy Patient forms combine profile,
  Hospital-local, and clinical fields in one broad edit surface.
- **Possible business options:** Shared Person-level fields; Hospital-local
  fields; Patient-owned contact fields; controlled field-by-field ownership;
  or read-only MVP.
- **Customer decision:** Not captured during Phase 14A.
- **Decision status:** DECISION_REQUIRED
- **Downstream impact:** Profile schema/commands, cross-Hospital privacy,
  Patient self-service, identity reconciliation, and audit.
- **Implementation blocker?:** Yes before profile mutation or ownership change;
  no current demo blocker.
- **Notes:** Current eight-field projection is a provisional read subset.

### P14A-R18 — Baseline meaning, cardinality, and participation

- **Domain:** Patient Baseline
- **Business question:** What does Baseline mean operationally and clinically?
  Is one snapshot enough, or is it per care episode? Which fields, units,
  recorder/date, review, correction, and Patient participation rules apply?
- **Why the decision matters:** Baseline may become the reference for progress
  and comparison; wrong cardinality or meaning would corrupt later history.
- **Current prototype behavior:** One immutable relationship-owned Baseline is
  allowed. It is separate from Profile, Screening, Goal, Appointment, and
  Follow-up, and is not compared automatically.
- **Accepted architectural constraint:** Baseline is not Follow-up round zero,
  a fabricated current status, or an automatic side effect of another record.
- **Legacy evidence, if relevant:** Legacy Baseline-like fields are mixed with
  Follow-up and image behavior, which the rewrite intentionally separates.
- **Possible business options:** One relationship snapshot; one per care
  episode; multiple dated baselines; Hospital/OSM recording; Patient
  contribution with confirmation; or defer comparison semantics.
- **Customer decision:** Not captured during Phase 14A.
- **Decision status:** DECISION_REQUIRED
- **Downstream impact:** Baseline cardinality/schema, validation, measurement
  ownership, comparison, correction, Patient visibility, and evidence.
- **Implementation blocker?:** Yes before changing Baseline cardinality or
  clinical meaning; no current demo blocker.
- **Notes:** Current fields, units, and confidence scale are provisional.

### P14A-R19 — Evidence ownership and artifact lifecycle

- **Domain:** Patient Evidence / artifacts
- **Business question:** Are relationship-level images sufficient? Are Baseline-
  or Follow-up-owned evidence and documents required? Who may view, add,
  replace, supersede, or delete artifacts, and how long are they retained?
- **Why the decision matters:** Artifact ownership controls privacy, storage,
  retention, correction, and access-log obligations.
- **Current prototype behavior:** Private relationship-level JPEG/PNG/WEBP
  Evidence supports create/list/view only, with bounded metadata and short-lived
  signed access. Delete, replace, supersede, documents, and Patient access are
  not implemented.
- **Accepted architectural constraint:** One artifact has one concrete business
  owner; metadata and binary storage are separate; server authorization precedes
  access.
- **Legacy evidence, if relevant:** Legacy status, Baseline, and Follow-up
  images use inconsistent owners and embedded URLs; this is evidence of demand,
  not a final attachment model.
- **Possible business options:** Relationship-level images only; event-owned
  evidence; documents/PDFs; append-only supersession; controlled deletion; or
  no artifact beyond the current prototype.
- **Customer decision:** Not captured during Phase 14A.
- **Decision status:** DECISION_REQUIRED
- **Downstream impact:** Storage policy, artifact schema/lifecycle, upload
  authorization, retention, malware/privacy controls, Patient portal, and audit.
- **Implementation blocker?:** Yes before adding deletion, documents, or
  Patient artifact access; no current demo blocker.
- **Notes:** Do not create a generic attachment platform from legacy URLs.

### P14A-R20 — Clinical correction, amendment, and audit

- **Domain:** Clinical correction / amendment / audit
- **Business question:** Which records may be edited directly? Which require an
  amendment that retains the original? Who may correct them, is a reason
  required, is approval required, and what do Patients see after correction?
- **Why the decision matters:** Correction semantics protect clinical history,
  trust, auditability, and data integrity across Screening, Goals, Appointments,
  Follow-up, Baseline, Profile, and Evidence.
- **Current prototype behavior:** Care records are immutable or append-only in
  the current slices; no general correction/amendment workflow exists.
- **Accepted architectural constraint:** Do not assume hard delete or silent
  overwrite. Multi-record changes and successful audit events must remain
  atomic.
- **Legacy evidence, if relevant:** correct-data and cleanup-goals expose direct
  edit/delete utilities. They motivate the responsibility but their destructive
  mechanics are rejected.
- **Possible business options:** No correction; field-specific direct edit;
  append-only amendment/supersession; approval-gated correction; or a separate
  audited reconciliation process.
- **Customer decision:** Not captured during Phase 14A.
- **Decision status:** DECISION_REQUIRED
- **Downstream impact:** Every clinical service, history projection, audit,
  retention, Patient visibility, reconciliation, and tests.
- **Implementation blocker?:** Yes before implementing correction, merge, or
  delete; no current demo blocker.
- **Notes:** This is not ordinary CRUD. Do not copy legacy hard-delete behavior.

### P14A-R21 — Hospital signup verification evidence

- **Domain:** Hospital signup verification
- **Business question:** What proves that an applicant represents the selected
  Hospital? Which documents, contacts, reviewer checks, duplicate handling,
  rejection/appeal/reapplication, and evidence retention are required?
- **Why the decision matters:** Approval establishes a trusted organization and
  Owner, so weak evidence can create a platform-wide trust failure.
- **Current prototype behavior:** Applicant matches canonical Hospital master
  data and Platform ADMIN manually approves or rejects. No document/evidence
  upload or appeal contract exists.
- **Accepted architectural constraint:** No generic public role selection;
  canonical Hospital identity and manual Platform ADMIN verification remain the
  current MVP boundary.
- **Legacy evidence, if relevant:** Legacy registration paths do not define
  reliable verification evidence or safe approval authority.
- **Possible business options:** Master-data match plus contact verification;
  document review; trusted external registry; manual checklist; or staged
  resubmission with retained application history.
- **Customer decision:** Not captured during Phase 14A.
- **Decision status:** DECISION_REQUIRED
- **Downstream impact:** Onboarding service, reviewer UI, evidence retention,
  duplicate/competing claims, audit, and operational support.
- **Implementation blocker?:** Yes before production verification evidence or
  automated approval; no current demo blocker.
- **Notes:** Do not implement document upload merely because evidence may be
  needed.

### P14A-R22 — Activation delivery and operational handoff

- **Domain:** Activation delivery
- **Business question:** Which channels are operationally realistic for each
  actor: copy link, QR, email, SMS, LINE/LIFF, or another channel? Is assisted
  activation acceptable? What expiry, retry, regeneration, notification, and
  audit behavior is required?
- **Why the decision matters:** Delivery affects access, usability, bearer-token
  risk, support operations, and provider integration, but should not redefine
  activation itself.
- **Current prototype behavior:** Copy link, QR, and assisted activation share
  one purpose-specific capability. Workforce defaults are 24 hours for copy/QR
  and 15 minutes for assisted activation. Patient activation is separately
  scoped; there is no delivery provider.
- **Accepted architectural constraint:** Activation is separate from recovery;
  target users establish their own passwords; core activation is not coupled to
  email, SMS, LINE/LIFF, ThaID, or another provider.
- **Legacy evidence, if relevant:** Legacy temporary/predictable passwords are
  rejected and are not delivery requirements.
- **Possible business options:** Keep assisted/copy/QR only; add one or more
  verified channels; let channel vary by actor; or defer provider delivery.
- **Customer decision:** Not captured during Phase 14A.
- **Decision status:** CAN_DEFER
- **Downstream impact:** Only when selected: delivery adapters, notification,
  retry/rate limits, support tooling, activation copy, and audit.
- **Implementation blocker?:** No for the current demo or core activation
  model; yes before integrating a provider.
- **Notes:** Do not reuse activation semantics as account recovery.

### P14A-R23 — Account recovery authority and proof

- **Domain:** Account recovery
- **Business question:** For Hospital Owner, Hospital Member, OSM, Patient, and
  Platform ADMIN separately: who may request or authorize recovery, what proves
  control of the person/account, which channel is trusted, who establishes the
  replacement credential, how are sessions handled, and what audit is required?
- **Why the decision matters:** Recovery is an account-takeover and identity
  reconciliation boundary. Hospital relationship authority must not silently
  become authority to change another person's credential.
- **Current prototype behavior:** No active-account recovery route, service,
  capability model, provider recovery contract, or session-revocation contract
  exists. First-time activation is available only for provisioned accounts.
- **Accepted architectural constraint:** Activation != Recovery. National ID
  lookup alone is not control proof; do not reveal or operator-set passwords,
  create replacement Users, or silently repair identity conflicts.
- **Legacy evidence, if relevant:** Legacy reset/temporary-password behavior is
  unsafe and does not define proof, delivery, or session semantics.
- **Possible business options:** Self-service verified channel; assisted
  recovery; provider-native recovery; ThaID/external IAM; role-specific proof;
  or a deliberately deferred actor.
- **Customer decision:** Not captured during Phase 14A.
- **Decision status:** DECISION_REQUIRED
- **Downstream impact:** Authentication boundary, recovery capability, provider
  integration, session behavior, identity reconciliation, support, and audit.
- **Implementation blocker?:** Yes before any password-reset or recovery flow;
  no current demo blocker with prepared credentials.
- **Notes:** Capture each actor's answer separately; do not use one policy for
  all five actors by default.

### P14A-R24 — Final Hospital Owner recovery

- **Domain:** Hospital Owner governance / account recovery
- **Business question:** If the final usable Owner loses access, who proves the
  claimant's authority, who may recover the existing Owner or appoint a
  replacement, what dispute/appeal safeguards apply, and what happens to
  sessions and audit history?
- **Why the decision matters:** This is the intersection of tenant governance,
  identity proof, account recovery, and high-impact administrative authority.
- **Current prototype behavior:** Final Owner governance prevents routine
  demotion to zero eligible Owners. No rescue, replacement, emergency, or
  Platform ADMIN override workflow exists.
- **Accepted architectural constraint:** Final-Owner recovery is not routine
  Owner management and cannot be solved by impersonation, a global reset, or
  destructive identity replacement.
- **Legacy evidence, if relevant:** No safe final-Owner recovery flow was found
  in the legacy checkout.
- **Possible business options:** Recover the existing Owner; Platform ADMIN-
  assisted replacement; manual identity reconciliation; time-bounded emergency
  governance; or a support escalation with explicit review.
- **Customer decision:** Not captured during Phase 14A.
- **Decision status:** DECISION_REQUIRED
- **Downstream impact:** Owner policy, account recovery, identity reconciliation,
  session revocation, support controls, audit, and legal/privacy review.
- **Implementation blocker?:** Yes before any final-Owner recovery or override;
  no current demo blocker.
- **Notes:** Do not invent final-Owner recovery from the current last-Owner guard.

### P14A-R25 — Admin reconciliation and data repair

- **Domain:** Admin reconciliation / data repair
- **Business question:** Which inconsistencies are expected and who may
  investigate, link, merge, correct, or delete? Are duplicate Person/User,
  wrong Hospital relationship, missing Profile, duplicate clinical record,
  dry-run, approval, rollback, retention, or non-mergeable data rules required?
- **Why the decision matters:** Repair authority can alter identity, privacy,
  clinical history, and every downstream relationship. It is not ordinary CRUD.
- **Current prototype behavior:** No Admin repair route, queue, merge, delete, or
  reconciliation service exists. Provisioning/import detects some conflicts but
  does not resolve post-hoc records.
- **Accepted architectural constraint:** Platform ADMIN is a governance actor,
  but no routine clinical access or repair authority is implied without a named,
  scoped, audited operation. Known identities should be preserved where safe.
- **Legacy evidence, if relevant:** correct-data and cleanup-goals show missing
  data, duplicate identity/HN, and duplicate Goal rows, but use destructive
  service-role/browser operations that are not accepted rewrite behavior.
- **Possible business options:** Detection-only queue; audited link/merge;
  correction/amendment commands; approval-gated repair; dry-run plus rollback;
  or no hard delete.
- **Customer decision:** Not captured during Phase 14A.
- **Decision status:** DECISION_REQUIRED
- **Downstream impact:** Identity graph, relationship history, clinical records,
  audit, retention, support tooling, and database constraints.
- **Implementation blocker?:** Yes before reconciliation implementation; no
  current demo blocker on clean prepared data.
- **Notes:** Do not copy legacy correct-data or duplicate-cleanup behavior.

### P14A-R26 — Reporting, dashboard, and export contract

- **Domain:** Reporting
- **Business question:** Who are the report consumers? Which Patient,
  Screening, Goal/progress, Appointment, Follow-up, workforce, and Hospital
  metrics are needed? What scope, date range, aggregation, freshness, privacy,
  drill-down, and export formats apply?
- **Why the decision matters:** Reporting can create a new cross-Hospital
  disclosure path and needs a stable metric/data contract.
- **Current prototype behavior:** The actor-aware workspace shows operational
  scope but has no reporting service, aggregate dashboard, or export module.
- **Accepted architectural constraint:** Platform governance visibility does
  not imply Patient-level clinical access; hierarchy cannot widen scope without
  an explicit decision.
- **Legacy evidence, if relevant:** Legacy dashboard/statistics pages suggest
  counts and Excel/PDF demand, but statistics is marked in development and is
  not a final contract.
- **Possible business options:** Defer reporting; operational Hospital-only
  counts; Platform governance aggregates; Hospital-network reporting with
  explicit scope; or separate management and clinical reports.
- **Customer decision:** Not captured during Phase 14A.
- **Decision status:** CAN_DEFER
- **Downstream impact:** Aggregate query services, authorization, privacy,
  hierarchy policy, exports, performance, and data freshness expectations.
- **Implementation blocker?:** No current demo blocker; yes before a reporting
  or export slice.
- **Notes:** Decide the business question each report supports before choosing
  Excel, PDF, CSV, or another format.

## 7. Decision Priority

Priority is based on the consequence of guessing, not implementation effort.
The current demo remains usable while these decisions are pending.

### A — Must decide before implementing the relevant slice

These items would otherwise invent security, privacy, data-integrity,
relationship-lifecycle, or clinical behavior:

P14A-R01, P14A-R02, P14A-R03, P14A-R04, P14A-R06, P14A-R07,
P14A-R08, P14A-R09, P14A-R10, P14A-R11, P14A-R12, P14A-R13,
P14A-R14, P14A-R15, P14A-R16, P14A-R17, P14A-R18, P14A-R19,
P14A-R20, P14A-R21, P14A-R23, P14A-R24, and P14A-R25.

### B — Important, but the current prototype can be used during the workshop

P14A-R05 can be demonstrated as the current status-only/no-cascade
prototype while the customer discusses communication, appeal, continuity, and
session consequences. The workshop should record those answers before changing
Hospital lifecycle behavior.

P14A-R11 through P14A-R19 can likewise be demonstrated as provisional
validation surfaces. Their presence is useful for discovery, but it is not
approval of their clinical meaning or final authority.

### C — Can safely defer

P14A-R22 can defer provider-specific delivery while the channel-independent
activation capability remains usable through copy, QR, or assisted handoff.
P14A-R26 can defer until a concrete management or operational reporting need is
confirmed. Optional export formats and provider integrations must not drive the
next product slice.

## 8. Workshop Walkthrough Plan

Use the prototype as a sequence of scenarios. For every scenario:

~~~text
Demo → Observe → Ask → Record decision → Identify downstream impact
~~~

### Scenario A — Hospital onboarding

- **Demo:** Submit or open a pending Hospital application; review it as
  Platform ADMIN; approve or reject; show the separate applicant login and
  resulting Owner workspace.
- **Observe:** Canonical Hospital matching, approval state, exact Owner
  membership, separate login, and what evidence the current UI does not show.
- **Ask:** What proves the applicant represents the Hospital? Who verifies it?
  What happens on rejection, appeal, duplicate claim, or reapplication? Which
  activation channel is realistic?
- **ตัวอย่างคำถามภาษาไทย:** “หลักฐานอะไรทำให้มั่นใจว่าผู้สมัครเป็นตัวแทนของ
  โรงพยาบาล และใครเป็นผู้ตรวจสอบหลักฐานนั้น”
- **Record:** P14A-R21 and, if channel delivery is discussed, P14A-R22.
- **Downstream impact:** Onboarding review, evidence retention, competing claims,
  application lifecycle, activation delivery, and audit.

### Scenario B — Workforce

- **Demo:** As Owner, provision a Member and an OSM; show profession label,
  activation handoff, target-owned password, relationship detail, suspend/
  restore guards, and Owner promotion/demotion with a second eligible Owner.
- **Observe:** Exact Hospital scope, separate account/relationship status,
  target activation, no credential exposure, and current provisional Owner
  guard.
- **Ask:** Are Doctor/Nurse labels enough? Who may perform clinical actions?
  Can Owners delegate ownership? What happens when a Member/OSM leaves,
  changes Hospital, or loses access?
- **ตัวอย่างคำถามภาษาไทย:** “ถ้า OSM หยุดทำงานกับผู้ป่วย ใครต้องเป็นผู้มอบหมาย
  ผู้รับผิดชอบคนใหม่ และประวัติเดิมควรแสดงต่อใครบ้าง”
- **Record:** P14A-R03, P14A-R06, P14A-R07, P14A-R22, P14A-R23, and
  P14A-R24 as applicable.
- **Downstream impact:** Workforce lifecycle, Owner policy, assignment history,
  profession-sensitive policy, recovery, notifications, and audit.

### Scenario C — Patient care

- **Demo:** Provision a Patient; open the authoritative relationship; assign an
  OSM; switch to the assigned OSM; submit Screening; create an explicit Goal
  Plan; create/complete an Appointment; record Follow-up; inspect Profile,
  Baseline, Evidence, and history.
- **Observe:** Relationship-scoped continuity, assignment handoff, provisional
  clinical labels, explicit cross-domain links, immutable/history behavior,
  and the absence of hidden Goal or Follow-up side effects.
- **Ask:** What is the OSM scope? Who owns Screening, Goals, Appointments,
  Follow-up, measurements, Baseline, and Evidence? Which actions require review?
  How are corrections made? What happens when the Patient changes Hospital?
- **ตัวอย่างคำถามภาษาไทย:** “เมื่อผู้ป่วยย้ายหรือมีความสัมพันธ์กับโรงพยาบาลใหม่
  ใครยังรับผิดชอบข้อมูลเดิม และการมอบหมาย OSM เดิมควรสิ้นสุดอย่างไร”
- **Record:** P14A-R01 through P14A-R03 and P14A-R10 through P14A-R20 as
  relevant to the demonstrated record.
- **Downstream impact:** All relationship-scoped care modules, policy,
  provenance, correction, retention, Patient visibility, and reporting.

### Scenario D — Patient account

- **Demo:** Activate a provisioned Patient with the one-time Patient capability;
  log in as Patient; show the bounded current landing.
- **Observe:** The Patient owns first-time credential establishment, while no
  clinical or profile projection is currently exposed.
- **Ask:** What should Patients see? Which fields may they edit? May they
  self-report measurements, complete Screening, view Plans, manage
  Appointments, see Evidence, or use self-service across multiple Hospitals?
  What proof is trusted for later recovery?
- **ตัวอย่างคำถามภาษาไทย:** “หลังจากเปิดใช้งานบัญชีแล้ว ผู้ป่วยควรเห็นข้อมูลอะไร
  และข้อมูลใดที่ผู้ป่วยแก้ไขเองได้”
- **Record:** P14A-R08, P14A-R09, P14A-R17, P14A-R18, P14A-R19, and P14A-R23.
- **Downstream impact:** Patient portal, field ownership, privacy projections,
  measurement provenance, activation/recovery, and mobile/LIFF planning.

### Scenario E — Governance and exception handling

- **Demo:** Show Hospital ACTIVE/SUSPENDED governance, workforce and OSM
  lifecycle guards, Owner final-eligible guard, and the absence of Admin
  routine Patient-care access or legacy destructive repair tools.
- **Observe:** Status-only/no-cascade behavior, exact governance scope, audit
  boundaries, and the point where the prototype intentionally stops.
- **Ask:** Who recovers a lost final Owner? What may Platform ADMIN repair?
  Which records may be linked, merged, amended, or deleted? Which reports are
  required, for whom, and with what Patient-level drill-down?
- **ตัวอย่างคำถามภาษาไทย:** “ถ้า Owner คนสุดท้ายเข้าใช้งานไม่ได้ ใครมีอำนาจกู้
  Hospital และต้องใช้หลักฐานอะไรเพื่อป้องกันการสวมสิทธิ์”
- **Record:** P14A-R05, P14A-R06, P14A-R20, P14A-R23, P14A-R24,
  P14A-R25, and P14A-R26.
- **Downstream impact:** Governance, recovery, reconciliation, clinical audit,
  retention, reporting, support operations, and possible ADR/policy changes.

## 9. Customer Decision Capture Template

Use one copy of this template for each item discussed in the workshop. Do not
require signatures or an enterprise approval ceremony.

~~~text
Decision ID:
Decision:
Status: CONFIRMED | REJECTED | DEFERRED | STILL_OPEN
Approved by:
Date:
Affected actors:
Affected modules:
Security/privacy implication:
Data integrity implication:
Open follow-up:
~~~

The facilitator may attach a short example or clarification below the template,
but should preserve the customer's wording and distinguish an answer from an
assumption.

## 10. Expected Phase 14B Handoff

Phase 14B must consume the actual workshop record and classify every register
item as:

CONFIRMED, REJECTED, DEFERRED, or STILL_OPEN.

For each confirmed or rejected decision, Phase 14B should determine whether the
consequence is:

- documentation update only;
- an ADR update or a new ADR;
- a policy/capability change;
- a domain or application-service change;
- a schema change or migration;
- a UI/workflow change;
- a test change; or
- a future implementation slice.

Phase 14B must preserve the accepted identity, authorization, activation, and
transaction boundaries unless a customer-approved decision genuinely changes a
cross-module architectural boundary and the required ADR process is followed.
Phase 14B is not performed by this document.

## 11. Explicit Non-Goals

Phase 14A does not:

- implement Patient self-service, a Patient portal, or Patient editing;
- implement password/account recovery or final-Owner recovery;
- implement Admin reconciliation, merge/delete tools, or legacy
  correct-data behavior;
- implement OSM geography, transfer, automatic reassignment, or expanded
  Patient authorization;
- implement Hospital hierarchy authorization or change the current Patient
  scope;
- create Doctor/Nurse permissions, care-plan approval, or clinical
  correction/amendment workflows;
- implement final Screening, Goal, Appointment, Follow-up, measurement,
  Baseline, Profile, Evidence, retention, or reporting semantics;
- implement reporting/export infrastructure, notifications, email, SMS, LINE,
  LIFF, ThaID, IAM, or provider integrations;
- build a knowledge CMS, legacy maintenance utility, or reset system;
- change Prisma schema, create migrations, or add seed data;
- create or modify routes, actions, services, policies, UI components, product
  behavior, or tests;
- create an ADR merely because a question exists;
- make the prototype prettier as a substitute for a business decision.

If a separate code or security regression is discovered later, record it as its
own finding. Do not silently fix it under Phase 14A.

## 12. Evidence, Contradictions, and Validation Notes

### Sources inspected

- [Project Context](../CONTEXT.md)
- [Architecture Baseline](../architecture/DEMI_ARCHITECTURE_BASELINE.md)
- [ADR README](../adr/README.md) and accepted ADRs 0001–0008
- [Phase 13A](./PHASE_13A_DEMO_FLOW_GAP_ANALYSIS.md)
- [Phase 13B.0](./PHASE_13B0_DEMO_CONTINUITY_WORKING_PROTOTYPE.md)
- [Phase 13C](./PHASE_13C_POST_INTEGRATION_BUSINESS_FLOW_REAUDIT.md)
- Phase 6A Patient access/assignment; Phase 7A/7B.0 Screening; Phase 8A/8B.0
  Goals; Phase 9A/9B.0/9C.0 Appointment and Follow-up; Phase 10A/10B.0/10C.0/
  10D.0 Profile, Baseline, and Evidence; Phase 11A/11B.0/11C/11D.0 workforce
  and OSM lifecycle; Phase 12A/12B.0/12C/12D.0 governance and recovery.
- The pinned local legacy checkout named above, only where Phase 13C evidence
  materially explains a workshop question.

### Consistency notes

No accepted ADR conflict was found. The following distinctions must remain
visible during the workshop:

1. The current HEAD is a documentation commit after the Phase 13C audited
   implementation HEAD; no product-code difference was observed between them.
2. Phase 12D.0's Owner Set and last-eligible-Owner guard are provisional
   validation behavior. They do not settle the customer's final Owner,
   delegation, or recovery policy.
3. Phase 7B.0, 8B.0, 9B.0, and 9C.0 grant bounded direct Hospital and/or
   exact-assigned OSM prototype capabilities so the workflow can be tested.
   The earlier requirement analyses still leave final clinical authority,
   profession rules, and Patient visibility open. This is a provisional
   behavior distinction, not an ADR contradiction.
4. The architecture's conceptual PATIENT SELF scope describes a possible future
   boundary. The current accepted product behavior intentionally stops at a
   bounded Patient landing.
5. Phase 11D.0 blocks OSM relationship suspension with current assignments,
   while Phase 12B.0 preserves assignments when the Hospital itself is
   suspended. These are different lifecycle operations and do not conflict.

### Newly discovered issues

No new product regression or security finding was identified during this
documentation review. This phase was not a code or penetration audit; the
existing open recovery, reconciliation, clinical correction, and scope
questions remain the items requiring customer attention.

### Documentation validation performed for Phase 14A

- Current rewrite HEAD and the Phase 13C audited implementation HEAD were
  recorded above.
- Phase 13C was read completely before this pack was written.
- Accepted ADRs, the architecture baseline, CONTEXT, and relevant Phase 6–12
  requirements/handoffs were inspected.
- The register uses only P14A-Rxx identifiers; no Phase 13 IDs were reused.
- Unresolved behavior is labelled OPEN, DECISION_REQUIRED, or CAN_DEFER; no
  customer decision is asserted by this document.
- Prototype behavior is labelled provisional where its source is not an
  accepted requirement.
- Legacy destructive or client-authoritative behavior is labelled evidence or
  rejected parity, never a rewrite requirement.
- Markdown link and UTF-8/replacement-character checks are part of the
  completion validation after this file is written.
- No product implementation, schema, migration, route, action, service,
  policy, component, seed data, or test is authorized or performed by Phase
  14A.
