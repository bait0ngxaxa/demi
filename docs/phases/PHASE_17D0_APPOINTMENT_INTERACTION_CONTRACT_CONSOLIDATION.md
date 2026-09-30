# Phase 17D.0 — Appointment Interaction Contract Consolidation & Action Authority Matrix

- Status: **CLOSED — OWNER-APPROVED DECISIONS RECORDED**
- Baseline: **afbb1fae3ece64430c7fb8ddc6315aae4fa51b89**
- Scope: requirement and domain-contract analysis only
- Runtime, schema, capability, and migration changes: **none**
- Phase 17D.1: **approved to proceed under the recorded owner contract**

The analysis and candidate options below preserve the pre-decision workshop record. They are superseded wherever they conflict with the owner-approved contract recorded below; only P17D-NOTIF-01 remains open and outside Phase 17D.1.

## 1. Objective

This document makes the remaining appointment-interaction questions implementation-ready without treating customer-flow wording or engineering preference as runtime authority. It records current rewrite behavior, the requested flow as evidenced in Phase 17A, the gaps between them, an action/scope matrix, and the decisions owners must approve before Phase 17D.1.

It does not approve any product behavior. Every proposed state, capability, workflow, and data model below is a candidate for discussion. Current production behavior remains governed by the existing schema, policy, services, and tests.

## 2. Evidence hierarchy

The evidence was read in this order:

1. Confirmed product decisions and explicit owner decisions. No Phase 17D appointment-interaction decisions are recorded as approved.
2. Accepted architecture decisions: [ADR-0001 Person/User identity](../adr/0001-person-and-user-identity.md); [ADR-0002 Role, Capability and Scope authorization](../adr/0002-role-capability-scope-authorization.md); [ADR-0005 server-side application boundary](../adr/0005-server-side-application-boundary.md); [ADR-0006 transactional business operations](../adr/0006-transactional-business-operations.md); and [ADR-0008 workforce provisioning and Hospital authority](../adr/0008-workforce-provisioning-and-activation.md).
3. Architecture and project context: [DEMI architecture baseline](../architecture/DEMI_ARCHITECTURE_BASELINE.md) and [project context](../CONTEXT.md).
4. Accepted phase requirements and handoffs: [Phase 17A](./PHASE_17A_CUSTOMER_FLOW_CANONICALIZATION_UAT_CONTRACT.md), [Phase 17 backlog](./PHASE_17_UAT_BACKLOG.md), [Phase 17B](./PHASE_17B_PATIENT_WORKSPACE_OWN_SCOPE_FOUNDATION.md), [Phase 17C](./PHASE_17C_PATIENT_CARE_JOURNEY_APPOINTMENT_READ.md), and the historical [Phase 9A analysis](./PHASE_9A_APPOINTMENT_AND_FOLLOWUP_REQUIREMENTS.md) and [Phase 9B.0 working prototype](./PHASE_9B0_APPOINTMENT_WORKING_PROTOTYPE.md).
5. Current schema, implementation, and tests establish what the rewrite actually enforces. Implementation labels and provisional prototype choices are evidence of behavior, not proof of customer approval.
6. Legacy behavior and customer-flow labels provide terminology and observed intent only. They do not override accepted architecture or grant authority.

If sources conflict, current runtime facts are reported as facts, while unresolved product semantics remain decisions. Phase 9B.0 explicitly describes its choices as provisional requirement-validation behavior.

## 3. Current runtime facts verified

| Area | Current behavior |
| --- | --- |
| Operational status | Prisma and source define only SCHEDULED, COMPLETED, CANCELLED, and NO_SHOW. A scheduled appointment may be completed, cancelled, or marked no-show; reschedule edits its schedule and leaves it SCHEDULED. The last three outcomes are terminal in current service behavior. |
| Response state | There is no CONFIRMED, DECLINED, ACKNOWLEDGED, RESCHEDULE_REQUESTED, or CANCEL_REQUESTED state, response history, request entity, or appointment:respond capability. |
| Capabilities | The appointment policy defines appointment:read and appointment:manage. Current Work create, reschedule, cancel, complete, and no-show operations use appointment:manage. |
| Hospital Work | An active direct Hospital OWNER or MEMBER can read and manage appointments belonging to that same active Hospital relationship. The policy does not use parent Hospital membership or profession to widen scope. |
| OSM Work | An OSM with an exact active PatientOsmAssignment and active OSM–Hospital relationship can read that PatientHospitalRelationship. The OSM-only policy explicitly denies appointment:manage. An actor who also independently qualifies through an active direct HOSPITAL membership is evaluated through that Hospital authority; the OSM role itself does not grant manage. |
| Patient Personal | Phase 17C permits exact SELF read of the authenticated Patient’s own Hospital relationship and appointment. The allowlisted appointment projection includes type, scheduled time, duration, location type/detail, status, and relationship Hospital context. It omits note, responsible User, creator, and all mutation fields/actions. There is no Patient appointment mutation route or action. |
| Platform ADMIN | ADMIN-only does not grant Appointment read or manage. A multi-role actor may still be authorized through a separately valid HOSPITAL, exact OSM-read, or PATIENT-SELF path; ADMIN does not create that scope. |
| Appointment row | PatientAppointment is owned by patientHospitalRelationshipId and currently stores responsibleUserId, createdByUserId, type, scheduledAt, durationMinutes, locationType, locationDetail, note, status, submissionNonce, nullable creationRequestHash, createdAt, and updatedAt. It has no response or change-request fields. |
| Responsible User | A supplied responsibleUserId must reference an active User with an active direct HospitalMembership in the same Hospital. It is not required to be a doctor and is not validated as an OSM. Operator queries resolve the current linked User/Person name; the field has no approved customer meaning as scheduler, caregiver, provider, or contact. |
| Creator | createdByUserId is derived from the authenticated server ActorContext. Work detail resolves the linked current display name. It records who created the row, not necessarily who scheduled, provides care, or should be contacted. |
| OSM assignment | PatientOsmAssignment is a separate relationship with assignment/end timestamps and assigning actors. Appointment access checks the current active exact assignment; PatientAppointment does not contain an appointment-time OSM snapshot or assignment reference. |
| Hospital context/contact | Appointment resolves the relationship’s Hospital name and Hospital number. Hospital has parentHospitalId, but appointment policy does not traverse it. No accepted Hospital contact model or appointment-owned contact field exists. PatientProfile contact fields are a separate source and do not authorize disclosure to another actor. |
| Persistence discipline | Create, reschedule, and terminal changes run in serializable transactions with bounded retry handling and atomic audit writes. Create uses a unique submissionNonce and immutable request hash for retry identity. Reschedule and terminal actions use expected updatedAt plus conditional status/version updates. Repeating the same terminal action is idempotent; a conflicting terminal action fails. |
| Audit | Current mutation audit records actor, action, PatientHospitalRelationship/Hospital/Appointment identifiers, and status transitions. Audit validation rejects sensitive-key names and bounded metadata values. It does not store free-text notes or location details. Current reschedule audit does not record old/new scheduledAt values. |

The verified evidence includes [Prisma schema](../../prisma/schema.prisma), [appointment definitions](../../src/modules/appointments/domain/appointment-definitions.ts), [appointment policy](../../src/modules/appointments/policies/appointment-policy.ts), [appointment access](../../src/modules/appointments/services/appointment-access-service.ts), [appointment query service](../../src/modules/appointments/services/appointment-query-service.ts), [appointment mutation service](../../src/modules/appointments/services/appointment-service.ts), [Patient SELF policy](../../src/modules/patient-self/policies/patient-self-policy.ts), [Patient SELF care query](../../src/modules/patient-self/services/patient-self-care-query-service.ts), [ActorContext](../../src/modules/auth/types/actor-context.ts), [OSM assignment transaction](../../src/modules/patient-assignment/services/patient-osm-assignment-transaction.ts), and [audit service](../../src/modules/audit/services/audit-service.ts), plus appointment policy/service/query/action tests, Patient SELF query/view tests, and Patient Work/Personal routes. The Phase 17C normal suite passed after permanent TSX discovery was verified; its recorded result is in the [Phase 17C handoff](./PHASE_17C_PATIENT_CARE_JOURNEY_APPOINTMENT_READ.md).

## 4. Customer-flow evidence and limits

The canonical Phase 17A flow contains appointment list/history/detail concepts and wording about responding or confirming, rescheduling, responsible people, OSM, Hospital/sub-Hospital context, and contact information. Similar concepts appear under more than one actor’s journey. Phase 17A’s APT-03, APT-04, APT-05, APT-06, and OSM-03 rows explicitly leave those meanings requirement-gated.

This evidence supports the conclusion that stakeholders want appointment-related information and may want interactions. It does not establish which actor performs each interaction or what a visible label changes. It does not establish that “confirm” is an acknowledgement, an attendance commitment, or a status transition; that a reschedule is a direct edit or a request; that a Patient may decline or cancel; that an OSM may mutate a row; or that responsible means creator, scheduler, assignee, clinician, caregiver, or contact.

No actor’s authority, Appointment.status transition, notification, disclosure, or persistence model is inferred from a screen name or customer-flow phrase alone.

## 5. Gap analysis

| Requirement | Current rewrite | Unresolved contract |
| --- | --- | --- |
| APT-03 Patient response | Patient can read own appointment facts; no response state/action. | Meaning, actor, eligible source status, lifecycle, mutability, cutoff, history, audit, and operational effect. |
| APT-04 Patient reschedule/cancel | Hospital Work can directly reschedule/cancel; Patient has no mutation authority or request entity. | Patient proposal versus request versus direct change; cancellation and decline distinction; approval and conflict workflow. |
| APT-05 action capabilities | Two capabilities remain sufficient for current behavior. | Per-action actor/scope matrix after APT-03, APT-04, and OSM decisions. |
| APT-06 display/contact | Patient read is allowlisted; Work detail has current linked responsible/creator names and location/note fields. No accepted Hospital contact source. | Meaning and audience of each identity/contact field; whether an OSM display is current or historical. |
| OSM-03 | Exact-assigned OSM can read; OSM-only manage is denied. | Whether “interaction” means reading, coordination, proxy submission, scheduling, cancellation, response recording, or attendance recording. |

## 6. APT-03 — Patient appointment response

“Response” is not a domain meaning until the owners choose one of these models. In each model, actor, source status, deadline, mutability, event history, notification, and UI wording still require a decision.

### A. Acknowledgement

- Meaning: the Patient has seen the appointment information.
- Actor/source: candidate actor is the exact Patient SELF; candidate source is an existing SCHEDULED appointment. Both require approval.
- Result: candidate response event/value changes from UNANSWERED to ACKNOWLEDGED. Appointment.status remains SCHEDULED.
- Repeats/changes: the same acknowledgement can be idempotent. Whether the Patient may withdraw or revise it is unresolved.
- Deadline: owners must decide whether acknowledgement remains available until the appointment is terminal, until a cutoff, or indefinitely.
- Audit/history: record actor, Appointment, previous/new response, timestamp, and correlation/version; decide whether only latest value or every submission is retained.
- Notification/scheduling: acknowledgement need not change capacity or schedule. Whether it triggers a reminder/notice is a separate notification decision.
- UI/schema: wording must say “seen/acknowledged,” not promise attendance. A response field is enough only if history is not required; an event/history model is needed if changes must be reconstructed.

### B. Attendance confirmation

- Meaning: the Patient states an intention to attend; it is not proof of attendance or completion.
- Actor/source: candidate Patient SELF on SCHEDULED only; owner approval required.
- Result: candidate response becomes CONFIRMED while Appointment.status remains SCHEDULED.
- Repeats/changes: identical retry may be idempotent. Whether the Patient can change to DECLINED or withdraw, and by when, is unresolved.
- Deadline: owners must define response cutoff, late response, and behavior after a Hospital reschedule/cancel.
- Audit/history: record each accepted response change and actor attribution; do not equate confirmation with a completed visit.
- Notification/scheduling: may influence staff planning but must not silently reserve capacity or alter Appointment.status. Any notice is gated by NOTIF-01.
- UI/schema: copy must describe intent to attend. Separate response persistence is recommended if this state is approved; it is not a current field.

### C. Decline

- Meaning: the Patient says they cannot or will not attend. This is not automatically an appointment cancellation.
- Actor/source: candidate Patient SELF on SCHEDULED; proxy submission by OSM is separately unresolved.
- Result: candidate response becomes DECLINED. Appointment.status remains SCHEDULED unless a separately approved cancellation operation succeeds.
- Repeats/changes: same decline retry may be idempotent; whether it can be withdrawn or replaced with CONFIRMED is unresolved.
- Deadline: owners must define how late a decline is accepted and what happens after the scheduled time.
- Audit/history: record the Patient response and any later scheduler disposition as separate actors/events.
- Notification/scheduling: do not release the slot or cancel the appointment automatically without an explicit rule. Notify a scheduler only after event/channel requirements are decided.
- UI/schema: distinguish “cannot attend” from “request to cancel.” Retain enough history to explain subsequent staff action if the workflow needs it.

### D. Combined confirm/decline workflow

- Meaning: Patient chooses one of two attendance responses.
- Actor/source: candidate Patient SELF, initially on SCHEDULED; exact source-state and cutoff remain owner decisions.
- Result: UNANSWERED → CONFIRMED or DECLINED in a response lifecycle separate from Appointment.status.
- Repeats/changes: identical repeat can be idempotent; cross-response revision requires a policy, expected response version, and auditable history.
- Deadline: decide initial response deadline, revision cutoff, and stale/late behavior.
- Audit/history: preserve actor, old/new value, and timestamp for every accepted revision; decide retention and whether the Patient sees prior changes.
- Notification/scheduling: a decline can prompt staff review, but may not mutate the schedule by implication. Delivery rules remain gated.
- UI/schema: requires two explicitly defined controls, loading/error/conflict states, and server policy. A persisted latest response and immutable history are candidate separate records.

### E. No formal response state

- Meaning: the flow wording is navigation/information only, with no submitted response.
- Actor/source/result: Patient retains current SELF read only; no response action, event, state, audit mutation, notification, or schema change.
- Repeats/changes/deadline: not applicable.
- Scheduling/history: Appointment remains unchanged and there is no response history to retain.
- UI: show list/detail and only an approved contact path. Do not render a dead “confirm” action.

The current four-value AppointmentStatus is sufficient for the current operational lifecycle. It is not sufficient to represent a distinct Patient response without overloading its meaning. Adding a response workflow is a product decision; keeping response separate from operational status is an engineering recommendation below, not an accepted requirement.

## 7. APT-04 — Reschedule and cancellation semantics

The current Hospital workflow directly changes scheduledAt on the same SCHEDULED row. No Patient request/proposal or approval workflow exists.

| Model | Patient authority and scheduling ownership | Concurrency, approval, history | Patient cancellation semantics | Staff, notification, data and UAT impact |
| --- | --- | --- | --- |
| A. Direct Patient reschedule | Patient would need an explicitly approved SELF-scoped direct-reschedule capability. This transfers scheduling authority to the Patient for the allowed fields and appointment states. | Must compare current status/version in a transaction. A concurrent Hospital edit/cancel must make the Patient submission conflict. Audit actor and old/new schedule; decide whether historical schedule is retained. | Reschedule does not grant cancellation. Decide separately whether Patient may request or directly cancel. | Staff must understand changed capacity without approval. High operational coupling and UAT burden. Requires explicit approval, slot/capacity rules, and likely schedule history. Not recommended absent evidence that Patients control scheduling. |
| B. Reschedule request | Patient may submit a request/proposal; Hospital/scheduler remains authoritative. The Appointment row and current schedule remain authoritative until an authorized staff decision. | Request captures the source Appointment version. Approval must atomically verify it is still SCHEDULED and unchanged before updating the schedule and disposing the request. Rejection/withdrawal/expiry do not silently alter the Appointment. Preserve request and disposition history. | Patient cancellation is a separate request or action; an accepted cancellation request changes status only through an authorized staff operation. | Requires staff queue, disposition rules, safe conflict handling, and notifications only if approved. Adds a request domain and moderate UAT work. Recommended if in-app Patient rescheduling is required. |
| C. Limited Patient proposal | Patient submits one or more preferred dates/times but cannot alter the current appointment. A scheduler chooses or rejects a proposal. | A proposal must be bound to Appointment/version and expire or be disposed when that version changes. Preserve submitted choices and decision history. | A time proposal does not cancel. Define a separate cancellation request or contact path. | More scheduling and data complexity than one request; useful only if owners need alternatives. Requires staff workflow and communication rules. |
| D. Contact-only | Patient cannot change or request in the system and is directed to an approved Hospital contact channel. | No appointment write or request race. The displayed contact source, accuracy, disclosure, and fallback must be defined. | Patient contacts Hospital; an authorized Hospital actor performs any operational cancellation. | Lowest workflow/schema cost, but current schema has no accepted Hospital contact model. No dead submit button; UAT tests a real, approved contact path. |

Cancellation is a separate contract from both response and reschedule:

| Concept | Meaning | Current Appointment effect |
| --- | --- | --- |
| Patient declines attendance | Patient response that they cannot/will not attend. | No automatic status change. A staff cancellation is a separate action if approved. |
| Patient asks to cancel | Request that an authorized scheduler review. | Candidate request only; Appointment remains SCHEDULED until accepted. |
| Hospital cancels | Operational decision by an authorized Hospital actor. | Current Hospital manage operation changes SCHEDULED → CANCELLED. |
| Patient directly cancels | Patient changes operational appointment state. | Not currently authorized; requires explicit owner-approved semantics, capability, cutoff, and race rules. |

No decision may map decline, cancellation request, and Hospital cancellation to the same event or status by assumption. APT-04 owners must also decide who may approve/reject a request, whether cancellation requires a reason, whether Patient may withdraw a request, and how a request is resolved when the appointment becomes terminal.

## 8. APT-05 — Action-level capability and scope matrix

The matrix describes current authority separately from possible future authority. “Decision pending” is not an allow. Candidate capability names below describe actions only; scope remains a separate policy input in keeping with ADR-0002.

Scopes considered:

- SELF: authenticated Patient’s exact own PatientHospitalRelationship.
- EXACT_ASSIGNED_PATIENT: exact relationship with a current active assignment to this OSM and active OSM–Hospital relationship.
- DIRECT_HOSPITAL: exact relationship Hospital with active direct Hospital membership and active Hospital status.
- PLATFORM: platform-wide authority. No Appointment platform authority is currently accepted.

| Action | PATIENT SELF | Assigned OSM, EXACT_ASSIGNED_PATIENT | HOSPITAL MEMBER, DIRECT_HOSPITAL | HOSPITAL OWNER, DIRECT_HOSPITAL | Platform ADMIN, PLATFORM |
| --- | --- | --- | --- | --- | --- |
| Read | Current: allow through Phase 17C SELF path. | Current: allow through exact active assignment. | Current: allow. | Current: allow. | ADMIN-only: deny. Any separate valid role/scope is evaluated independently. |
| Create | Current: deny. Future: owner decision. | Current: deny under OSM-only authority. | Current: allow through appointment:manage. | Current: allow through appointment:manage. | ADMIN-only: deny; platform scope alone grants nothing. |
| Respond | Current: none. Future: candidate appointment:respond; actor/source state require approval. | Current: none. Future: decide whether OSM may record or proxy a response. | Current: none as a separate response action; Hospital manage does not define Patient response. | Same as member. | ADMIN-only: deny; no future authority implied. |
| Request reschedule | Current: none. Future: candidate appointment:request-reschedule only if request model is approved. | Current: none. Future: decide delegated/on-behalf submission. | Current: none as a request action; staff can directly reschedule. | Same as member. | ADMIN-only: deny; no future authority implied. |
| Reschedule directly | Current: deny. | Current: OSM-only manage denied. | Current: allow through appointment:manage from SCHEDULED with expected updatedAt. | Same as member. | ADMIN-only: deny; no future authority implied. |
| Request cancellation | Current: none. Future: separate request capability only if approved. | Current: none. Future: decide delegated/on-behalf submission. | Current: none as a separate request action. | Same as member. | ADMIN-only: deny; no future authority implied. |
| Cancel operationally | Current: deny. | Current: OSM-only manage denied. | Current: allow through appointment:manage from SCHEDULED. | Same as member. | ADMIN-only: deny; no future authority implied. |
| Complete | Current: deny. | Current: OSM-only manage denied. | Current: allow through appointment:manage from SCHEDULED. | Same as member. | ADMIN-only: deny; no future authority implied. |
| Mark no-show | Current: deny. | Current: OSM-only manage denied. | Current: allow through appointment:manage from SCHEDULED when scheduledAt is not in the future. | Same as member. | ADMIN-only: deny; no future authority implied. |

The Patient SELF row describes Phase 17C’s separate exact-identity read path; it does not make Patient eligible for the Work appointment policy. An OSM actor who also has HOSPITAL role and an active direct membership can be evaluated under the HOSPITAL column. An ADMIN who also has an independently valid role/scope can use that separate authority. If owners want different treatment for a multi-role person acting on their own appointment, that exception belongs in the approved action matrix and server policy; workspace selection alone is not authority.

Current and candidate capability vocabulary:

| Candidate action capability | Existing runtime | Decision |
| --- | --- | --- |
| appointment:read | Existing; Work scope and Patient SELF path are separately enforced. | Preserve. Confirm field visibility through APT-06. |
| appointment:create | Not separate; currently included in appointment:manage for Hospital Work. | Decide only if approved matrix needs a split. |
| appointment:respond | Does not exist. | Do not add until response meaning and actor are approved. |
| appointment:request-reschedule | Does not exist. | Do not add until request/delegation workflow is approved. |
| appointment:reschedule | Not separate; currently included in appointment:manage for Hospital Work. | Preserve current behavior until an approved matrix intentionally changes it. |
| appointment:request-cancel | Does not exist. | Do not add until cancellation-request semantics are approved. |
| appointment:cancel | Not separate; currently included in appointment:manage for Hospital Work. | Preserve current behavior until an approved matrix intentionally changes it. |
| appointment:complete | Not separate; currently included in appointment:manage for Hospital Work. | Decide only if the approved matrix requires a split. |
| appointment:no-show | Not separate; currently included in appointment:manage for Hospital Work. | Decide only if the approved matrix requires a split. |

No capability is being added, split, renamed, or assigned in this phase.

## 9. OSM-03 — OSM appointment interaction

Current behavior is read-only for OSM-only authority on the exact currently assigned PatientHospitalRelationship. Assignment and the active OSM–Hospital relationship are both checked. A Hospital association without exact Patient assignment is insufficient. The current app has no OSM appointment mutation action.

| Possible interaction | Customer-flow evidence | Current domain/policy | Authority, attribution and required owner |
| --- | --- | --- | --- |
| 1. Read | Appointment interaction appears in OSM journey. | Implemented only for exact active assignment. | Preserve current narrow read. Operations/Product confirm any additional field visibility under APT-06. |
| 2. Record coordination or acknowledgement | General interaction wording only; meaning unclear. | No coordination/response entity; OSM-only manage is denied. | Decide whether this records OSM’s own contact event or a Patient response. Require exact active assignment, actor attribution, history, and any delegation rule. Decision owners: Product, Hospital Operations, and OSM representative; include Privacy if contact data is recorded. |
| 3. Submit reschedule request for Patient | Reschedule concept appears; no proxy semantics confirmed. | No request domain or OSM write capability. | Does OSM act as submitter, witness, or representative? Require exact assignment at submission, auditable OSM attribution, and explicit permission to act on behalf of Patient. Hospital remains scheduler under request model. Decision owners: Product/Customer and Hospital Operations, with Patient/OSM representation on delegation. |
| 4. Create appointment | Appointment creation exists for Hospital Work only. | OSM-only manage is denied. | This grants scheduling authority. Require a Hospital operational owner to approve scope, capacity rules, exact assignment behavior, and audit. |
| 5. Directly reschedule | Reschedule wording exists, but actor authority is not settled. | OSM-only manage is denied; only Hospital direct scope changes schedule. | This transfers direct scheduling authority. Require explicit Hospital delegation and stale-version rules; exact assignment alone is not enough. |
| 6. Cancel | No confirmed OSM cancellation requirement. | OSM-only manage is denied. | This changes operational status and schedule capacity. Require explicit Hospital authority, cancellation meaning, cutoff, audit, and request-vs-direct decision. Decision owners: Product and Hospital Operations. |
| 7. Record Patient response | Response wording exists; source actor is unresolved. | No response lifecycle or OSM mutation path. | Decide whether OSM may record a Patient-stated response, how it is verified, whether Patient can correct it, and how OSM attribution differs from Patient action. Decision owners: Product/Customer, Hospital Operations, and Patient/OSM representatives. |
| 8. Mark attendance/no-show | No-show is an existing Hospital operational action. | OSM-only manage is denied. | This changes operational status. Require an attendance-observation rule, authorized recorder, exact assignment and Hospital scope, and audit; do not equate silence with no-show. Decision owners: Clinical and Hospital Operations. |

Engineering recommendation: keep OSM at exact-assignment read until a specific business action is approved. Any write must revalidate assignment and active Hospital relationship server-side in the same consistency boundary as the write. A Patient assignment does not by itself delegate Patient consent or Hospital scheduling authority.

## 10. APT-06 — Responsible person, creator, OSM and contact display

| Concept | Current canonical source and code-supported meaning | Customer-flow mismatch and privacy question |
| --- | --- | --- |
| Appointment creator | PatientAppointment.createdByUserId references the authenticated actor who created the row; Work detail joins the current User/Person name. | Creator is not necessarily scheduler, provider, caregiver, or contact. Decide whether a Patient or OSM should ever see creator identity. Phase 17C currently withholds it from Patient. |
| Appointment responsible User | PatientAppointment.responsibleUserId references an active User who must have an active direct membership in the same Hospital when selected. Work query returns current name, profession, and membership type for eligible responsible members. | Code does not establish what responsibility means or require OSM, clinician, scheduler, or provider profession. Decide role meaning, audience, null behavior, and whether assignment is per appointment. |
| Current assigned OSM | PatientOsmAssignment is a separate, time-bounded assignment relation. Appointment Work read authorization uses the current exact assignment. | It is not equivalent to responsibleUserId. Decide whether display means current OSM or OSM at appointment creation/scheduled time. |
| Hospital contact | No accepted Hospital-contact model or appointment-owned contact field is present. Hospital currently supplies canonical name/code/status and hierarchy reference. | Do not choose a random member’s phone or infer contact from responsibleUserId. Decide source, owner, fields, verification/update process, and disclosure. |
| Patient contact | PatientProfile owns Patient contact/profile fields separately from appointment. | A stored Patient phone or emergency contact is not automatically a Hospital-facing or OSM-facing contact. Decide source, intended audience, permission, and whether emergency contact is in scope. |
| Scheduler/coordinator | No distinct Appointment scheduler/coordinator domain is established. The creator is the actor who submitted creation; responsibleUser is separately selected. | Decide whether scheduler is a separate concept or a defined meaning of one existing field. Do not collapse creator and responsible person. |

### Current versus appointment-time OSM

If OSM X was assigned when an Appointment was created and the Patient is later reassigned to OSM Y, owners must choose whether the Appointment displays X, Y, both, or neither unless the Appointment has an explicit assignment. The current data can show the current assignment; the assignment relation retains createdAt/endedAt history. The Appointment query does not currently expose OSM identity.

A historical display requires a chosen reference time (creation time, scheduled time, or another event) and a retention/backfill rule. A current display can change when assignment changes. An appointment-owned immutable reference/snapshot would require a schema change. None is chosen here.

### Hospital and sub-Hospital display

The customer flow’s Hospital/sub-Hospital labels require a canonical display source and definition. The Hospital model has parentHospitalId, but current appointment authorization matches only the relationship’s direct Hospital ID. Display requirements must not imply parent/child, network, or inherited authorization. AREA/Hospital hierarchy remains a separate gated domain.

## 11. Multi-role and scope isolation

- OSM + PATIENT: Personal requests use exact SELF ownership; Work requests use exact active assignment and OSM policy. An assigned OSM cannot obtain manage authority from being a Patient, and Patient SELF read does not authorize actions on assigned Patients.
- HOSPITAL + PATIENT: Personal reads use exact SELF ownership; Work operations use active direct Hospital membership for the target Hospital. HOSPITAL membership does not become Patient SELF, and Patient SELF does not widen the Work target scope.
- ADMIN combined with another role: ADMIN alone grants no Appointment capability. Any additional valid role and exact scope is evaluated on its own.
- Context selector, route, hidden control, and client-supplied role are presentation/input only. Server-side ActorContext, resource ownership, assignment, membership, capability, and policy decide every read or mutation.
- If the same human’s own Patient appointment is also inside their direct Hospital Work scope, the current HOSPITAL policy can authorize a Work operation because it evaluates role and target scope. Owners must decide whether that ordinary direct-Hospital authority needs a special self-conflict restriction; neither SELF nor workspace selection supplies the answer.

## 12. Operational and interaction state machines

### Current Appointment operational lifecycle

SCHEDULED → COMPLETED
SCHEDULED → CANCELLED
SCHEDULED → NO_SHOW

Current reschedule changes scheduledAt while status remains SCHEDULED. The source status and optimistic version checks determine whether a mutation can proceed. No current transition reopens a terminal appointment.

### Candidate Patient response lifecycles

These are alternatives, not a combined or accepted state machine:

- Acknowledgement: UNANSWERED → ACKNOWLEDGED.
- Attendance response: UNANSWERED → CONFIRMED, or UNANSWERED → DECLINED.
- Combined mutable response: UNANSWERED → CONFIRMED/DECLINED, followed by explicitly allowed revisions.
- No formal response: no response state or event.

In the separated models, response state does not change Appointment.status. A reschedule/cancel request also may remain open while the Appointment is still SCHEDULED. Approval changes the operational appointment only through an authorized, version-checked operation. Do not add these candidate labels to AppointmentStatus.

## 13. Candidate data-model options

No option is selected and no migration is proposed.

| Option | Shape | History/concurrency | Cost and fit |
| --- | --- | --- | --- |
| 1. Reuse PatientAppointment fields/status only | No new state; suitable only for read-only/no-response behavior or an explicitly approved mapping into existing status. | Cannot distinguish response from operational state or retain multiple responses without another record. | Lowest migration cost; unsafe for acknowledgement/decline if represented as COMPLETED/CANCELLED/NO_SHOW. |
| 2. Add current response fields | Current response value, actor/time/version on Appointment or a one-to-one response record. | Simple latest-value read; prior changes are unavailable unless audit/history is separately sufficient and approved. | Low-to-medium migration cost; fit only if owners confirm one mutable current response and required history. |
| 3. Immutable AppointmentResponse history | One-to-many accepted response events with actor, value, event time, and version; current response derived from latest event. | Preserves revisions and attribution; requires uniqueness/idempotency and concurrency rules for latest state. | More work but good fit if Patient response revisions/audit/history are required. |
| 4. AppointmentChangeRequest / RescheduleRequest | One-to-many requests with proposed time(s), source Appointment version, submitter, status/disposition, decision actor/time. | Request history is separate from the authoritative Appointment row; acceptance must compare status/version and update both atomically. | Moderate cost; fit for Hospital-approved Patient proposals. Cardinality, withdrawal, expiry, and rejection rules remain decisions. |
| 5. Separate response and change-request domains | Response history and schedule/cancel requests have distinct state, authority, and audit. | Avoids conflating response with operational status or request disposition. | Highest cost; justified only if both independently approved workflows need history. Do not create it for speculative flexibility. |

A generic workflow framework is not indicated. Select the smallest model that satisfies the signed contract, history, audit, concurrency, and reporting needs.

## 14. Concurrency and idempotency contract for any future mutation

The following are implementation requirements to carry into Phase 17D.1 after decisions:

- Double-click/retry: define a stable idempotency identity for each new Patient response/request operation. The same accepted operation must not create duplicate history or duplicate staff work.
- Stale Patient page: submit an expected Appointment updatedAt/status or response/request version. UI disabling is not a correctness control.
- Hospital reschedules while Patient responds: a response may still be valid only if the approved source-state rules allow it; otherwise return a safe conflict. It must not overwrite schedule fields.
- Hospital reschedules while a Patient request is open: the request must be compared with its source version. A stale request must be re-evaluated or disposed according to the approved lifecycle.
- Hospital cancels while Patient submits a request: transactionally require the approved eligible Appointment state. Do not leave a newly actionable request attached to an already terminal appointment.
- OSM acts while assignment changes: resolve current assignment and active OSM–Hospital relationship within the same consistency boundary as any write; reject if exact assignment no longer holds.
- Request approval race: only one authorized decision may dispose an open request. Approval must atomically verify request state plus the Appointment source status/version.
- Terminal status race: retain conditional updates from SCHEDULED and current updatedAt. Competing cancel/complete/no-show operations must not both succeed.
- Repeated response submission: identical retry may be idempotent; a changed response is a new audited version only if mutability is approved.
- Repeated request decision: acceptance/rejection replay must return a safe current result or conflict without applying the schedule twice.
- Preserve serializable transaction discipline, bounded retries for known transient conflicts, safe conflict responses, and atomic audit writes from ADR-0006 and current Appointment service patterns. Do not create a generic retry framework.

## 15. Audit expectations

For each approved mutation, the domain/audit contract must record enough to answer who did what to which Appointment and when:

- Patient response: actor User, Appointment, prior/new response, timestamp, accepted version/correlation key, and whether the actor was Patient or an approved representative.
- Reschedule/cancel request: submitter and actor role, Appointment, request ID, bounded structured proposal, source version, and submission time. Approval/rejection/withdrawal/expiry records the disposition and the deciding actor/time.
- Operational reschedule: authorized scheduler actor, Appointment, prior/new schedule or a durable schedule revision, and status remaining SCHEDULED. Decide whether precise timestamps belong in the domain history, audit metadata, or both.
- Operational cancel/complete/no-show: actor, Appointment, prior/new operational status, timestamp, and approved reason category if required.
- Keep free text, notes, location detail, phone/email, National ID, credentials, identity hashes, and unnecessary PHI out of generic audit metadata. If a business reason is required, define its separate bounded domain field and audience.
- Continue writing the success audit event in the same transaction as the state change. A failed audit write must not report a successful mutation. Routine reads remain unaudited under the current prototype convention unless owners approve a separate access-audit requirement.

## 16. Notification dependency

NOTIF-01 remains requirement-gated. Possible future event sources include appointment creation, operational schedule change, Patient response, reschedule/cancel request, request disposition, and operational cancellation. Before notification implementation, owners must choose event meaning, recipient, channel, timing/time zone, preference/consent, quiet hours, retries, and duplicate suppression. Phase 17D.0 adds no jobs, LINE, email, push, reminders, or delivery preferences. The notification decision is tracked separately as P17D-NOTIF-01 and does not block a no-notification Phase 17D.1 implementation.

## 17. Privacy and disclosure

- Apply least disclosure separately to Patient, OSM, Hospital staff, and Hospital Owner. Current Phase 17C intentionally omits creator, responsible User, note, and management fields from Patient appointment reads.
- Do not expose a staff member’s personal phone/email because that User happens to be selected as responsible or creator.
- Do not expose Patient contact or emergency-contact fields to staff/OSM merely because the fields exist in PatientProfile.
- Confirm whether locationDetail and note are safe for Patient/OSM audiences; bounded free text can still contain sensitive information.
- Define the source, owner, freshness, and audience of Hospital contact information before display. No contact source should be inferred from a User profile.
- Keep audit metadata minimal and structured; do not copy free-text or unnecessary Patient data into generic audit events.
- Do not let Hospital hierarchy labels become access rules. The relationship’s direct Hospital remains the current target boundary.

## 18. UI/UX contract

No Patient or OSM appointment action buttons are added in Phase 17D.0. Phase 17C Patient Personal screens remain read-only, and current OSM Work remains exact-assignment read-only unless a separate valid Hospital authority applies.

After decisions, a button may appear only for an approved actor/action/scope and eligible source state. The server must repeat authentication, resource authorization, validation, business-state, and concurrency checks on submission. Button visibility is a usability projection, not authorization. Every action needs a real pending state, success result, safe validation/forbidden/not-found/conflict feedback, and an honest explanation of whether Appointment.status or a separate request/response changed.

| Candidate control | Required approved contract before display | Possible result if approved |
| --- | --- | --- |
| Respond/confirm/decline | Named actor and scope, approved response capability, allowed Appointment/response source state, and cutoff. | Writes only the approved response state/event; does not change Appointment.status unless the signed contract explicitly says so. |
| Request reschedule/cancel | Patient SELF or explicitly delegated OSM authority, request capability, eligible SCHEDULED Appointment, and request lifecycle rules. | Creates a request; current Appointment remains authoritative pending staff disposition. |
| Approve/reject request | Named Hospital actor and direct scope, approved decision capability, open request state, and unchanged Appointment version. | Disposes the request and changes schedule/status only when the approved decision permits it. A stale decision returns a conflict. |
| Directly reschedule/cancel | Explicitly approved actor/action/scope and source status, with expected version and transaction rules. | Applies the operational update only after server authorization and conditional persistence succeed. |

These are contract examples, not current buttons, routes, capabilities, or server actions. Do not add dead/fake actions or infer eligibility from a workspace, label, or hidden control.

## 19. Engineering recommendation — not yet product-approved

This section is engineering advice, not accepted product behavior.

1. Preserve appointment:read and appointment:manage and the current AppointmentStatus in Phase 17D.0.
2. If an appointment response is required, model it as a Patient response lifecycle separate from operational status. Do not use COMPLETED for confirmation, CANCELLED for decline, or NO_SHOW for silence.
3. If Patient rescheduling is required while Hospital controls capacity, prefer a request/proposal that leaves the current Appointment authoritative until a Hospital scheduler accepts it.
4. Keep direct schedule mutation and terminal operational actions within Hospital direct scope unless an owner explicitly approves delegated authority and its constraints.
5. Keep OSM at exact-assigned read until a named action and delegation rule are approved.
6. Give responsible, creator, current OSM, scheduler, Hospital contact, and Patient contact separate meanings and canonical sources. Do not select whichever User/contact happens to be available.
7. Add only action capabilities required by the approved matrix; keep action capability separate from SELF, EXACT_ASSIGNED_PATIENT, DIRECT_HOSPITAL, or PLATFORM scope.
8. Choose separate response/request persistence only where approved history and workflow require it; do not create schema speculatively.

## Owner-approved contract (2026-09-30)

### OWNER-APPROVED BUSINESS DECISIONS

- Patient response means acknowledgement that the appointment was received. It does not express attendance intent and does not change AppointmentStatus, which remains SCHEDULED, COMPLETED, CANCELLED, or NO_SHOW.
- A Patient may acknowledge their own scheduled appointment and submit a cancellation request. They may not directly cancel, reschedule, request a reschedule, create, complete, or mark no-show.
- Patient and OSM rescheduling is contact-the-Hospital-directly guidance. DEMI has no in-system reschedule request.
- A cancellation request leaves the appointment scheduled until an authorized Hospital actor approves it and performs the operational cancellation. Patients cannot withdraw a request.
- An exact, actively assigned OSM may read, coordinate, acknowledge on behalf of the Patient, request cancellation on the Patient's behalf, and create an appointment for that Patient. OSMs cannot manage, reschedule, cancel, complete, or mark no-show through OSM authority.
- Hospital care responsibility means a doctor or nurse in an active direct membership in the exact Hospital. It is separate from the OSM caregiver.
- Appointment-time OSM identity is captured by referencing the assignment at creation. Legacy appointments remain without a historical OSM reference; current assignment is never substituted.
- Appointment UI may show approved names, Hospital context, and location. It does not disclose phone numbers or create a Hospital contact model. Patient projections omit creator, internal identifiers, notes, and contact data.
- A person with both HOSPITAL and PATIENT roles may use valid Hospital Work authority on their own appointment; Personal or Work context does not grant authority. ADMIN-only access remains denied.
- P17D-NOTIF-01 remains open. No notification delivery is approved in this phase.

### ENGINEERING IMPLEMENTATION DETAIL

- Persist acknowledgement as an immutable fact bound to the appointment updatedAt version, with actor/source attribution and uniqueness per appointment version. A stale submission conflicts; a retry returns the original fact.
- Persist cancellation requests with PENDING, APPROVED, REJECTED, or SUPERSEDED lifecycle, source appointment version, submitter/source, resolver/time, and an idempotency token. A PostgreSQL partial unique index enforces one pending request per appointment.
- Approval checks current Hospital authority and the exact source version, then operationally cancels the appointment and resolves the request in one transaction. Rejection leaves the appointment unchanged. Appointment changes supersede pending requests in that same transaction.
- Persist OSM coordination as a bounded immutable event with a nonce and actor attribution; do not capture free text or infer acknowledgement/attendance.
- Add only appointment:create, appointment:acknowledge, appointment:request-cancel, and appointment:record-coordination beside existing appointment:read and appointment:manage. Keep Patient SELF and exact OSM assignment scope separate from capability. Do not add a reschedule-request capability.
- New responsible-person selections require an active same-Hospital DOCTOR/NURSE membership. Preserve historical assignments when unchanged. Snapshot the exact OSM assignment for new appointments only; do not backfill.
- Keep Patient/work projections allowlisted, histories bounded, mutations server-authorized, auditable, and concurrency-safe. Use an additive migration and preserve a notification-provider seam without implementing delivery.
## 20. Decision register

All 18 blocking APT decisions are **OWNER-APPROVED / RESOLVED** as recorded above. P17D-NOTIF-01 remains **PENDING** and blocks notification implementation only; it does not block Phase 17D.1.

### Decision-to-contract mapping

Each decision-register row below maps to the corresponding topic in the owner-approved contract above and the implementation record in [Phase 17D.1](./PHASE_17D1_APPOINTMENT_INTERACTION_IMPLEMENTATION.md).

| Decision | Owner-approved resolution recorded in the contract |
| --- | --- |
| P17D-APT-01 | Patient response: acknowledgement that the appointment was received only; no attendance intent. |
| P17D-APT-02 | Patient actions and OSM proxy actions: own scheduled appointment only; source and actor are recorded; acknowledgement is version-bound and immutable. |
| P17D-APT-03 | Patient response: acknowledgement is separate from the operational Appointment status. |
| P17D-APT-04 | Patient response and cancellation: acknowledgement is not attendance/decline; cancellation is a separate request and does not automatically change the schedule. |
| P17D-APT-05 | Patient cancellation: Patient may request cancellation; only an authorized Hospital actor may approve and operationally cancel it. |
| P17D-APT-06 | Rescheduling: Patient and OSM contact the Hospital directly; DEMI has no reschedule-request workflow and neither actor may directly reschedule. |
| P17D-APT-07 | Cancellation review: current direct Hospital Work authority reviews the request; OSM and Patient do not perform the operational cancellation. |
| P17D-APT-08 | Cancellation request lifecycle: one pending request per appointment, with retained pending/approved/rejected/superseded history; Patient cannot withdraw it. |
| P17D-APT-09 | OSM authority: exact active assignment permits read, coordination, proxy acknowledgement, proxy cancellation request, and appointment creation only. |
| P17D-APT-10 | Actor/capability matrix: Patient SELF, exact assigned OSM, and direct Hospital scopes remain separate; ADMIN-only and workspace selection grant no appointment authority. |
| P17D-APT-11 | Responsible person: Hospital-side care responsibility is an eligible active same-Hospital doctor or nurse; it is distinct from OSM caregiving. |
| P17D-APT-12 | Display/privacy: Patient view omits creator identity and internal data; Work views use only approved names and appointment context. |
| P17D-APT-13 | Historical OSM responsibility: reference the OSM assignment captured when the appointment was created; do not substitute the current assignment or backfill old rows. |
| P17D-APT-14 | Hospital context: display the owning Hospital context from the appointment’s Patient-Hospital relationship. |
| P17D-APT-15 | Hospital contact: do not add a Hospital contact model or fabricate a contact channel in this phase. |
| P17D-APT-16 | Patient contact: do not disclose Patient, emergency, staff, or OSM phone/contact details in appointment views. |
| P17D-APT-17 | Interaction history: retain acknowledgement, cancellation-request, coordination, attribution, and audit history with bounded read projections. |
| P17D-APT-18 | Multi-role behavior: a HOSPITAL + PATIENT actor may use valid direct Hospital Work authority on their own appointment; Personal/Work context itself grants none. |

| ID | Decision required | Why it matters / current evidence | Options to decide | Engineering recommendation | Decision owner | Blocks | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| P17D-APT-01 | What does Patient response mean? | Customer wording is ambiguous; runtime has no response state. | Acknowledge; attendance intent; confirm/decline; no formal response. | Choose one meaning and write user-facing semantics before schema/action design. | Product + Customer; Clinical/Operations if attendance meaning. | 17D.1 | OWNER-APPROVED / RESOLVED |
| P17D-APT-02 | Who may submit or revise a response, against which source states and cutoff? | Phase 17C grants exact SELF read only; no source-state or mutability rule exists. | Patient SELF only; approved representative/proxy; other. Choose SCHEDULED/other states, cutoff, and whether response is mutable. | Start with exact Patient SELF on SCHEDULED only if approved. | Product + Customer + Hospital Operations. | 17D.1 | OWNER-APPROVED / RESOLVED |
| P17D-APT-03 | Is response separate from Appointment.status? | Current enum is operational and has no response state. | Separate response lifecycle; approved mapping into operational status; no state. | Keep concepts separate. | Product + Clinical/Operations + domain owner. | 17D.1 | OWNER-APPROVED / RESOLVED |
| P17D-APT-04 | What does decline mean and what does it do? | No decline state exists; decline is not a current cancel operation. | Attendance response only; triggers staff review; another explicitly defined result. | Keep decline separate from cancellation and do not change schedule automatically. | Product + Customer + Hospital Operations. | 17D.1 | OWNER-APPROVED / RESOLVED |
| P17D-APT-05 | Can Patient ask to cancel or directly cancel? | Current cancel is Hospital manage only. | No Patient action; request; direct operational cancellation. Define cutoff and resulting state. | Prefer request if Patients need an in-app path and Hospital retains scheduling authority. | Product + Customer + Hospital Operations. | 17D.1 | OWNER-APPROVED / RESOLVED |
| P17D-APT-06 | Can Patient reschedule directly, request, propose alternatives, or contact Hospital? | Current direct update is Hospital-only; no request model. | Direct edit; one request; multiple proposals; contact-only. | Prefer request/proposal if scheduling capacity remains Hospital-owned. | Product + Customer + Scheduler/Operations. | 17D.1 | OWNER-APPROVED / RESOLVED |
| P17D-APT-07 | Who approves/rejects each reschedule or cancellation request? | No scheduler or approver role is defined; responsibleUser semantics are open. | Direct Hospital OWNER/MEMBER; designated scheduler; another approved role. Define who may act. | Use named server-side Hospital scope and explicit appointment action authority. | Hospital Operations + Product. | 17D.1 | OWNER-APPROVED / RESOLVED |
| P17D-APT-08 | What is the request lifecycle and cardinality? | No request entity or staff queue exists. | One open request per Appointment; multiple proposals/requests; replace/withdraw; expiry/rejection rules. | Keep one open request only if owners confirm it meets workflow. | Hospital Operations + Product + Customer. | 17D.1 | OWNER-APPROVED / RESOLVED |
| P17D-APT-09 | What may an assigned OSM do beyond read? | Current exact assignment allows read only and OSM manage is denied. | Read only; record coordination; proxy request; create; direct reschedule/cancel; response; attendance/no-show. | Preserve exact-assigned read until a specific action is approved. | Hospital Operations + OSM representative + Product. | 17D.1 | OWNER-APPROVED / RESOLVED |
| P17D-APT-10 | What is the final action/capability/scope matrix for all actors? | Current two capabilities are sufficient for current behavior; new action names are candidates only. | Decide PATIENT SELF, assigned OSM exact, Hospital member/owner direct, and ADMIN-only/platform scope for every action; decide multi-role same-person behavior. | Keep action capabilities separate from scope and grant no ADMIN-only clinical authority. | Product + Security/Architecture + Hospital Operations. | 17D.1 | OWNER-APPROVED / RESOLVED |
| P17D-APT-11 | What does responsibleUserId mean? | Code validates a same-Hospital active member but does not define the duty. | Scheduler; care coordinator; service-responsible person; provider; other; unused. | Define one concept or introduce a separate named field only if needed. | Product + Hospital Operations + Customer. | 17D.1 | OWNER-APPROVED / RESOLVED |
| P17D-APT-12 | Should creator identity be shown, and to whom? | Creator is stored and shown in Work detail, omitted from Patient SELF DTO. | Hospital only; Patient also; OSM; no actor; another policy. | Preserve Patient omission until disclosure is approved. | Product + Privacy + Hospital Operations. | 17D.1 | OWNER-APPROVED / RESOLVED |
| P17D-APT-13 | Which OSM is associated with an old Appointment? | Assignment history is separate; current read authorization uses current active assignment. | Current OSM; OSM at creation; OSM at scheduled time; both; neither absent explicit appointment assignment. | Choose an explicit reference time and source before display. | Product + Hospital Operations + OSM representative. | 17D.1 | OWNER-APPROVED / RESOLVED |
| P17D-APT-14 | What canonical Hospital/sub-Hospital names/context may be displayed? | Relationship Hospital name/number exist; parentHospitalId is not used for authorization. | Direct Hospital only; separately labeled parent; another canonical master source. | Display only sourced context and keep it separate from scope. | Hospital Master owner + Product + Hospital Operations. | 17D.1 | OWNER-APPROVED / RESOLVED |
| P17D-APT-15 | What is the Hospital contact source and disclosure? | No accepted Hospital contact model exists. | Canonical Hospital contact; explicitly designated role contact; approved external directory; no in-app contact. | Establish an owned, verified source; do not use a random member’s contact. | Hospital Operations + Product + Privacy. | 17D.1 | OWNER-APPROVED / RESOLVED |
| P17D-APT-16 | Which Patient contact fields, if any, may be disclosed? | Patient profile contact data is distinct from Appointment and audience permission. | None; Patient phone; a specific verified contact; emergency contact only with separate authority. | Minimize fields and require a defined purpose and audience. | Patient/Product owner + Privacy + Hospital Operations. | 17D.1 | OWNER-APPROVED / RESOLVED |
| P17D-APT-17 | What response/request history and retention are required? | Current schema has no response/request history; history affects schema, audit, privacy, and reporting. | Latest value only; immutable event history; bounded retention; applicable legal schedule. | Preserve accepted state changes when reversals/disputes need explanation; set retention explicitly. | Product + Privacy/Data Governance + Clinical/Operations. | 17D.1 | OWNER-APPROVED / RESOLVED |
| P17D-APT-18 | How do multi-role self and Work actions interact on the same Appointment? | SELF and direct Hospital are distinct scopes; current direct Hospital policy may independently authorize a multi-role actor. | Allow normal Hospital Work authority; prohibit own-record Work action; require another actor; other explicit rule. | Decide explicitly; do not infer from workspace. | Product + Security/Architecture + Hospital Operations. | 17D.1 | OWNER-APPROVED / RESOLVED |
| P17D-NOTIF-01 | Which approved appointment events, recipients, timing, and channels trigger notifications? | NOTIF-01 is requirement-gated; this phase creates no delivery system. | Define event/recipient/channel/time/preferences/retry later; no notifications. | Decide after event semantics; keep delivery separate from state mutation. | Product + Hospital Operations + Privacy. | Notification implementation only | PENDING |

## 21. Owner/customer workshop questions

Record the selected option, decision owner, date, rationale, and any required follow-up against the matching register ID.

1. **P17D-APT-01:** When a Patient uses the appointment response action, what are they saying: “I have seen it,” “I intend to attend,” “I cannot attend,” a choice between attend/cannot attend, or should no formal response be recorded?
2. **P17D-APT-02:** Who may submit or revise that response: only the Patient in their own Personal account, an explicitly authorized representative, an assigned OSM on the Patient’s behalf, or another named actor? Is it allowed only while the appointment is SCHEDULED, until what cutoff, and may the Patient withdraw or change an earlier response?
3. **P17D-APT-03:** Should the response be stored separately while the appointment remains SCHEDULED, change an operational status, or produce no stored state?
4. **P17D-APT-04:** If the Patient says they cannot attend, should that only record their response, notify a scheduler for review, or immediately cancel the appointment? The recommended default is no automatic cancellation.
5. **P17D-APT-05:** May a Patient do nothing, request cancellation for staff review, or cancel a SCHEDULED appointment directly? What is the cutoff, and does cancellation require staff approval?
6. **P17D-APT-06:** For rescheduling, should the Patient directly change the date/time, send one request, propose several preferred times, or contact the Hospital using an approved contact path?
7. **P17D-APT-07:** Who may approve/reject a Patient request: any active Hospital OWNER/MEMBER with direct scope, a designated scheduler, or another role? Can the creator/responsible person decide their own request?
8. **P17D-APT-08:** Can an appointment have one open request or several? May the Patient withdraw it? Should it expire or close automatically after an appointment change, cancellation, or scheduled time?
9. **P17D-APT-09:** Which OSM actions are required: read only, record their own coordination, submit a request for the Patient, create, directly reschedule/cancel, record the Patient’s response, or mark attendance/no-show? Must the exact active assignment exist at submission and approval?
10. **P17D-APT-10:** For each action—read, create, respond, request reschedule/cancel, directly reschedule/cancel, complete, and no-show—which of Patient SELF, exact assigned OSM, Hospital Member, Hospital Owner, or Platform ADMIN may act, and over which scope? Should ADMIN-only remain unable to perform clinical operations?
11. **P17D-APT-11:** In this product, what does the selected responsibleUser mean: scheduler, coordinator, provider, care-responsible person, contact, or another role? Can it be empty, and who may be selected?
12. **P17D-APT-12:** Should the person who created the appointment be displayed to Patient, OSM, Hospital staff, Hospital Owner, all, or none?
13. **P17D-APT-13:** If an OSM assignment changes from X to Y, should an old appointment show X at creation, the OSM assigned on the appointment date, current OSM Y, both, or neither?
14. **P17D-APT-14:** Which Hospital and sub-Hospital names should appear, and what canonical source defines that relationship? Should the parent ever be shown separately from the Hospital that owns the Patient relationship?
15. **P17D-APT-15:** What is the approved Hospital contact source, who maintains it, which fields are shown, and which actors can see them? Is no in-app contact preferable until a verified source exists?
16. **P17D-APT-16:** Which Patient contact details may Hospital staff or assigned OSM see for appointment coordination: none, a verified Patient phone, or a separately approved contact? Is emergency contact explicitly excluded unless separately authorized?
17. **P17D-APT-17:** Must the system retain only the latest Patient response/request or every change and decision? Who may see history, and what retention period applies?
18. **P17D-APT-18:** If a Hospital member is also a Patient and can access their own appointment in both contexts, may they use ordinary Hospital Work authority on that row, must another staff member act, or is there another conflict rule?
19. **P17D-NOTIF-01:** After response/request meanings are decided, which events should notify which recipients, through what channels, at what time zone and cutoff, and under what preference/consent and retry rules?

## 22. Explicitly rejected unsafe assumptions

This contract rejects the following as unsupported:

- Appointment response is the same as Appointment operational status.
- COMPLETED means the Patient confirmed attendance.
- CANCELLED means the Patient declined.
- NO_SHOW means the Patient did not respond.
- Declining, requesting cancellation, direct Patient cancellation, and Hospital cancellation are synonyms.
- Patient may directly reschedule merely because the customer flow says “reschedule.”
- An OSM may edit because an OSM screen mentions appointment interaction.
- Exact OSM assignment implies appointment:manage, delegation, or authority over the Patient’s response.
- responsibleUserId means creator, scheduler, clinician, caregiver, contact, or OSM without an approved definition.
- The current OSM must be shown on every historical appointment, or an appointment-time OSM can be reconstructed without an explicit reference-time rule.
- A Patient or staff phone number may serve as Hospital contact by convenience.
- A parentHospitalId or sub-Hospital label grants inherited appointment authority.
- An ADMIN role alone grants routine clinical/operational appointment authority.
- Hidden controls, context selection, or client state enforce authorization.
- A notification/reminder flow is implied by an appointment list or response label.

## 23. Phase 17D.1 readiness checklist

The owner-approved business contract and the engineering implementation contract are recorded above. All 18 blocking APT decisions are resolved, so Phase 17D.1 is authorized to proceed. The original workshop questions and analysis above remain historical evidence of the pre-decision state.

- [x] Patient acknowledgement is acknowledgement only, is separate from operational status, and is version-bound.
- [x] Patient SELF and exact assigned OSM acknowledgement/cancellation-request authority is defined.
- [x] Cancellation request approval/rejection, one-pending cardinality, immutable history, and no-withdraw rule are defined.
- [x] Patient and OSM reschedule behavior is contact-the-Hospital-directly; no in-system reschedule request is approved.
- [x] Hospital review authority is active direct Hospital OWNER/MEMBER with existing appointment:manage.
- [x] Exact OSM actions, assignment checks, proxy attribution, coordination, and appointment creation are defined without appointment:manage.
- [x] Appointment create, read, manage, SELF, exact-assignment, Hospital, ADMIN-only, and multi-role authority are distinguished.
- [x] Responsible Hospital person, appointment-time OSM snapshot, legacy-row behavior, and contact/privacy display are defined.
- [x] Version conflicts, idempotency, transaction boundaries, audit events, and bounded histories are defined.
- [x] Additive schema/migration expectations and Patient/OSM/Hospital UI requirements are defined.
- [ ] P17D-NOTIF-01 remains open and is not part of the Phase 17D.1 delivery.
## 24. Exact handoff

The original requirement-workshop handoff was superseded when the owner approved the 18 APT decisions on 2026-09-30. Phase 17D.1 may now implement the accepted contract recorded above. Keep P17D-NOTIF-01 open and outside notification delivery work. See [Phase 17D.1 implementation handoff](./PHASE_17D1_APPOINTMENT_INTERACTION_IMPLEMENTATION.md) for runtime scope and verification evidence.
