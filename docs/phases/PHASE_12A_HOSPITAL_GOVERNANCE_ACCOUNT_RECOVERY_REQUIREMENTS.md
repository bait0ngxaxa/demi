# Phase 12A — Hospital Governance & Account Recovery Requirements

## 1. Status / Objective

**Status:** Analysis complete; no Phase 12 product implementation has started.

This document defines the smallest coherent domain boundary for Hospital governance, Hospital lifecycle, Hospital Owner governance, and User account recovery after Hospital onboarding. It is a requirement and domain-boundary analysis for the current DEMI rewrite, not a product contract and not an implementation handoff for all of the domain.

The immediate objective is to establish whether a narrow Hospital lifecycle slice can safely precede Owner governance and account recovery. The analysis preserves the current separation between:

```text
Person
User
Role
HospitalMembership
OsmHospitalRelationship
PatientHospitalRelationship
PatientOsmAssignment
credentials / sessions
```

The selected architecture-review pass was **Existing System Mapping Mode, Full Mode**. The scope crosses authentication, authorization, workforce, patient access, assignment, audit, and legacy governance behavior, so a partial file-local review would not be sufficient. Claims below identify whether they are an accepted contract, direct implementation evidence, inference, provisional proposal, open requirement, or rejected legacy architecture.

## 2. Sources Inspected

### Current DEMI rewrite

- [Project context](../CONTEXT.md)
- [Architecture baseline](../architecture/DEMI_ARCHITECTURE_BASELINE.md)
- [ADR index](../adr/README.md) and the identity, authorization, onboarding, server boundary, transaction, transport, and workforce activation ADRs in [docs/adr](../adr/)
- [Phase 3A Hospital onboarding](./PHASE_3A_HOSPITAL_ONBOARDING.md)
- [Phase 4A workforce provisioning](./PHASE_4A_WORKFORCE_PROVISIONING.md)
- [Phase 4B workforce provisioning](./PHASE_4B_WORKFORCE_PROVISIONING.md)
- [Phase 5A Patient provisioning](./PHASE_5A_PATIENT_PROVISIONING.md)
- [Phase 6A Patient access and assignment](./PHASE_6A_PATIENT_ACCESS_AND_ASSIGNMENT.md)
- [Phase 11A workforce lifecycle and Hospital governance analysis](./PHASE_11A_WORKFORCE_LIFECYCLE_HOSPITAL_GOVERNANCE_REQUIREMENTS.md)
- [Phase 11B.0 Staff membership lifecycle](./PHASE_11B0_STAFF_MEMBERSHIP_LIFECYCLE_WORKING_PROTOTYPE.md)
- [Phase 11C OSM relationship and assignment consequence analysis](./PHASE_11C_OSM_RELATIONSHIP_LIFECYCLE_ASSIGNMENT_CONSEQUENCES.md)
- [Phase 11D.0 OSM relationship suspend/restore prototype](./PHASE_11D0_OSM_RELATIONSHIP_LIFECYCLE_WORKING_PROTOTYPE.md)
- [Current Prisma schema](../../prisma/schema.prisma)
- [Authentication policies and ActorContext](../../src/modules/auth/)
- [Workforce policy and service](../../src/modules/workforce/)
- [Patient directory access](../../src/modules/patient-directory/) and [patient assignment](../../src/modules/patient-assignment/)
- [Patient activation](../../src/modules/patient-activation/)
- [Audit module](../../src/modules/audit/)
- Hospital onboarding implementation under [src/modules/hospital-onboarding](../../src/modules/hospital-onboarding/)
- Protected application areas under [app/app/admin](../../app/app/admin/) and [app/app/workforce](../../app/app/workforce/)
- [Hospital onboarding integration tests](../../tests/integration/hospital-onboarding.integration.test.ts)
- [Workforce integration tests](../../tests/integration/workforce.integration.test.ts)
- [Patient–OSM assignment integration tests](../../tests/integration/patient-osm-assignment.integration.test.ts)
- Related integration tests for OSM relationship lifecycle, patient directory, activation, clinical access, and inactive Hospital behavior.

### Legacy DEMI evidence

The legacy repository was inspected from the local checkout `C:\Users\Bait0ng\Desktop\legacy-demi\demi-plus-web-v2` at the requested pinned commit:

```text
7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e
```

Relevant source paths were inspected directly:

- [`app/admin/hospitals/page.tsx`](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/app/admin/hospitals/page.tsx)
- [`app/admin/hospitals/[id]/edit/page.tsx`](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/app/admin/hospitals/%5Bid%5D/edit/page.tsx)
- [`app/admin/staff/page.tsx`](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/app/admin/staff/page.tsx)
- [`app/admin/settings/page.tsx`](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/app/admin/settings/page.tsx)
- [`lib/supabase/queries.ts`](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/lib/supabase/queries.ts)

The legacy checkout was clean at that commit. Legacy behavior is used only as behavioral and terminology evidence; it is not treated as a customer-approved requirement or as the target authorization architecture.

## 3. Evidence Classification

The following labels are used throughout this document.

| Label | Meaning |
| --- | --- |
| **Current accepted contract** | A decision established by the current DEMI architecture baseline or an accepted ADR that this phase must preserve. |
| **Direct current implementation evidence** | Behavior observed in current schema, services, policies, routes, or tests. It may be a prototype consequence rather than a confirmed customer requirement. |
| **Direct legacy evidence** | Behavior observed in the pinned legacy source. It informs terminology or prior operator expectations only. |
| **Inference** | A conclusion derived from multiple current facts, explicitly marked because no source states it as a requirement. |
| **Provisional proposal** | A deliberately narrow behavior proposed for validation or a future implementation slice. It is not customer-approved. |
| **Open requirement** | A customer, product, operational, or integration decision that the repository does not settle. |
| **Rejected legacy architecture** | A legacy pattern that DEMI must not copy because it conflicts with the accepted identity, authorization, security, or data-integrity direction. |

Two distinctions are important:

1. A status value in Prisma is not evidence that a product mutation or business policy exists.
2. A current predicate that rejects inactive Hospital access is an implementation consequence. It does not by itself answer whether customers want a suspended Hospital hidden, shown, notified, or operationally closed.

## 4. Current Accepted DEMI Contract

The following contracts are not reopened by Phase 12A.

| Boundary | Current contract | Evidence |
| --- | --- | --- |
| Human identity | `Person` is the human identity; `User` is the application/account identity. One human should reuse one core identity across roles and Hospitals. | **Current accepted contract** — ADR 0001, architecture baseline, `prisma/schema.prisma`. |
| Top-level roles | The platform roles are `ADMIN`, `HOSPITAL`, `OSM`, and `PATIENT`. Doctor/Nurse are profession classifications unless a separately confirmed requirement changes that. | **Current accepted contract** — ADR 0002, schema, Phase 4/6 contracts. |
| Hospital Owner | A Hospital Owner is `Role.HOSPITAL` plus `HospitalMembership.membershipType = OWNER`; Owner is not Platform `ADMIN`. | **Current accepted contract** — ADR 0002, Phase 3A, Phase 11A. |
| Authorization | `Role + Capability + Scope -> Policy Decision`; decisions are server-side, fail-closed, and based on authoritative current state. Browser state and Hospital hierarchy metadata do not grant authority. | **Current accepted contract** — ADR 0002, ADR 0005, current policies. |
| Hospital scope | Patient and clinical authority comes from direct Hospital relationships and exact OSM assignment where applicable. Parent/child metadata does not silently inherit authority. | **Current accepted contract** — Phase 6A, current patient-access and assignment policies. |
| Lifecycle separation | Hospital status, User status, membership status, OSM relationship status, Patient relationships/assignments, and credential/session state are distinct lifecycles. | **Current accepted contract** — architecture baseline, Phase 11A/11B/11C/11D.0. |
| Historical data | Governance actions must not silently delete or rewrite Screening, Goal Plans, Appointments, Follow-ups, Baseline, Evidence, or audit history. | **Current accepted contract** — architecture baseline and clinical phase contracts. |
| Atomic local state | Consistency-critical local state changes and their bounded audit event remain coordinated atomically where required. Provider I/O is not hidden inside an unbounded database transaction. | **Current accepted contract** — ADR 0006, current services. |
| Activation | Workforce and Patient activation are first-time account establishment flows using purpose-specific one-time activation records. They are not a general account-recovery mechanism. | **Current accepted contract** — ADR 0008, workforce/patient activation services. |

## 5. Current Implementation Inventory

### 5.1 Lifecycle state represented by the schema

| State or relationship | Current representation | Current writer or observed path | What is not present |
| --- | --- | --- | --- |
| Hospital | `HospitalStatus.PENDING_VERIFICATION`, `ACTIVE`, `SUSPENDED` | Onboarding approval conditionally changes `PENDING_VERIFICATION` to `ACTIVE`. A seeded/pending Hospital exists before approval. | No production Hospital suspend/restore service, action, route, or audit event was found. `SUSPENDED` is represented and exercised in tests/fixtures, but not given an operator workflow. |
| User account | `UserStatus.PROVISIONED`, `INVITED`, `ACTIVE`, `SUSPENDED` | Onboarding and activation move a provisioned User to `ACTIVE`; workforce provisioning creates `PROVISIONED` Users when needed. | No supported production User suspend/restore or password-recovery mutation was found. |
| Hospital membership | `MembershipType.OWNER` or `MEMBER`; status `PROVISIONED`, `INVITED`, `ACTIVE`, `SUSPENDED` | Onboarding creates the initial `ACTIVE OWNER`. Phase 11B.0 changes `MEMBER` profession or membership status; it does not target Owner rows. | No Owner promotion, demotion, transfer, or last-Owner rule exists. |
| OSM relationship | `OsmHospitalRelationship.status` with a unique User/Hospital relationship | Phase 11D.0 changes exact-Hospital OSM relationship `ACTIVE ↔ SUSPENDED` only when the relationship-specific assignment guard permits it. | It does not represent or mutate Hospital suspension and does not end assignments as a side effect. |
| Patient–Hospital relationship | `PatientHospitalRelationship` links one Patient profile to one Hospital | Patient provisioning creates the relationship; clinical records are relationship-scoped. | No Hospital suspension cascade or Patient transfer operation exists. |
| Patient–OSM assignment | `PatientOsmAssignment` preserves current/ended assignment history; at most one current assignment per Patient–Hospital relationship. | Assignment, reassignment, and unassignment are explicit relationship-scoped operations. | Hospital suspension does not currently end, recreate, or reassign assignment rows. |
| Activation | `WorkforceActivation` and `PatientActivation` hold hashed, one-time activation capabilities and lifecycle timestamps. | Activation issuance/reissue and first-time claim flows exist for their respective domains. | No generic reset-password, forgot-password, account-recovery, or recovery-capability service exists. |

### 5.2 Current onboarding transition

`approveHospitalOnboarding` in the Hospital onboarding service is the only reviewed production path that changes a Hospital lifecycle state. Inside a local transaction it:

1. verifies an active Platform `ADMIN` reviewer and a pending application;
2. claims the application as approved;
3. verifies the Hospital is still `PENDING_VERIFICATION` and the applicant User is provisioned;
4. conditionally changes the Hospital to `ACTIVE`;
5. conditionally changes the User to `ACTIVE`;
6. upserts the `HOSPITAL` role;
7. creates the initial `ACTIVE OWNER` membership; and
8. records the bounded onboarding audit event.

The service rejects approval when an active Owner already exists. That is an onboarding guard, not a complete multiple-Owner policy. **Direct current implementation evidence; the resulting initial-owner behavior is not a full customer-approved ownership contract.**

### 5.3 Current authorization and Hospital status checks

The reviewed current policies and services require an active Hospital for routine Hospital-scoped authority. The checked paths include:

- workforce list/detail, provisioning, membership lifecycle, and OSM lifecycle;
- Patient directory and Patient activation;
- Patient–OSM assignment management;
- Screening;
- Goal Plans;
- Appointments;
- Follow-ups;
- Baseline;
- Evidence; and
- the ActorContext/application-access boundary.

The main implementation anchors for this conclusion are the [workforce policy](../../src/modules/workforce/policies/workforce-policy.ts), [patient directory policy](../../src/modules/patient-directory/policies/patient-directory-policy.ts), [Patient–OSM assignment policy](../../src/modules/patient-assignment/policies/patient-osm-assignment-policy.ts), [Screening policy](../../src/modules/screening/policies/screening-policy.ts), [Goal policy](../../src/modules/goals/policies/goal-policy.ts), [Appointment policy](../../src/modules/appointments/policies/appointment-policy.ts), [Follow-up policy](../../src/modules/followups/policies/followup-policy.ts), [Baseline policy](../../src/modules/patient-baseline/policies/patient-baseline-policy.ts), [Evidence policy](../../src/modules/patient-evidence/policies/patient-evidence-policy.ts), and [ActorContext service](../../src/modules/auth/services/actor-context-service.ts). Their corresponding query/service files were also inspected where access is assembled or mutated.

The ActorContext loader includes each membership and OSM relationship with its joined Hospital status. A User whose account is not `ACTIVE` is denied application access. Scope-specific policies then require the direct membership or exact active OSM relationship and an active target Hospital. **Direct current implementation evidence.**

Within the reviewed modules, no path was found that intentionally treats a `SUSPENDED` Hospital as `ACTIVE`. This is a bounded review statement, not a guarantee about future modules that have not yet been written. **Direct current implementation evidence.**

### 5.4 Current account and session behavior

Current authentication uses the provider-backed `authSubject` and Supabase SSR cookies/JWTs. The repository has:

- server-side mapping from provider subject to the existing `User`;
- `ActorContext` resolution from authoritative database state;
- application-access rejection when the mapped User is not `ACTIVE`; and
- current-session sign-out behavior in the login failure path.

The repository does not have a local session table, session-version/revocation field, recovery-token domain, or global session-revocation service. A newly resolved request therefore observes current account and relationship state, while an already issued provider session is not independently represented in DEMI. **Direct current implementation evidence.**

The current activation flows are not password recovery. They establish a first credential for a provisioned User after claiming a purpose-specific one-time activation capability. Workforce activation may be reissued by an authorized Hospital Owner while the User is still provisioned; that is activation regeneration, not recovery for an already active account. **Direct current implementation evidence / current accepted contract.**

## 6. Legacy Behavior Inventory

The pinned legacy checkout supplied useful terminology and evidence of prior operator expectations, but it also demonstrates patterns explicitly rejected by the rewrite.

| Concern | Verified legacy behavior | Problem or limitation | DEMI direction | Classification |
| --- | --- | --- | --- | --- |
| Hospital status | `app/admin/hospitals/page.tsx` and the edit page read and write a boolean `hospitals.is_active`. The list filters active Hospitals. A UI action labelled delete sets `is_active` to false. | Status, visibility, edit, and “delete” semantics are collapsed. The mutation is direct browser-to-Supabase state. | Keep Hospital lifecycle explicit and server-authoritative. Do not call suspension deletion and do not infer hierarchy authority from the legacy list. | **Direct legacy evidence / Rejected legacy architecture** |
| Hospital edit | `app/admin/hospitals/[id]/edit/page.tsx` lets an operator edit name, code, type, parent, address, and `is_active`, with direct client database update. | It combines governance, hierarchy, and lifecycle without the DEMI exact-scope authorization boundary or atomic audit contract. | Phase 12B.0 should expose only a bounded governance projection and status mutation; Hospital field ownership/editing remains open. | **Direct legacy evidence / Rejected legacy architecture / Open requirement** |
| Hierarchy access | `lib/supabase/queries.ts:getAccessibleHospitalIds` expands main/sub-Hospital access through `parent_id`, siblings, and children. | Hierarchy metadata becomes authorization. This conflicts with direct Hospital scope. | Parent/child metadata remains descriptive only unless a separately accepted policy is established. | **Direct legacy evidence / Rejected legacy architecture** |
| Staff deactivate/restore | `lib/supabase/queries.ts:deactivateStaff` and `restoreStaff` update a staff profession row and the user account `is_active` flag. | Account status and workforce relationship status are coupled; the two writes are not the DEMI transactional lifecycle boundary. | Phase 11B.0 keeps User status, membership status, and OSM relationship status separate. | **Direct legacy evidence / Rejected legacy architecture** |
| Staff edit and password reset | `app/admin/staff/page.tsx` can change Hospital/account-like fields and offers a reset password generated from a predictable date format, then displays it in an alert. | Predictable credential material, password visibility, browser-authoritative account mutation, and identity/relationship conflation are unsafe. | Recovery must prove control and establish a new credential without revealing an existing secret or replacing a known User. | **Direct legacy evidence / Rejected legacy architecture** |
| Staff deletion | `permanentlyDeleteStaff` deletes profession and user records after clearing selected references. | Destructive deletion can remove identity, relationships, and history or create partial operational meaning. | Preserve identity and history; hard delete is rejected/deferred for the Hospital lifecycle. | **Direct legacy evidence / Rejected legacy architecture** |
| Admin semantics | Legacy pages use combinations of `role=admin`, `admin_type` such as super/Hospital, and `hospital_id`. | Admin type and hierarchy are an implicit authorization system that does not map to DEMI’s Role + Capability + Scope model. | Platform `ADMIN` is a governance actor; Hospital Owner is `HOSPITAL + OWNER` and is not Platform `ADMIN`. | **Direct legacy evidence / Rejected legacy architecture** |
| Settings/security | `app/admin/settings/page.tsx` uses a hardcoded password gate before showing aggregate counts. | A client-side hardcoded gate is not authentication or authorization and exposes a dangerous credential pattern. | Use server-side policy and bounded projections; no settings console or generic support console is implied. | **Direct legacy evidence / Rejected legacy architecture** |

Legacy evidence supports the existence of an operator need to see and disable Hospitals and to help staff with access problems. It does **not** establish the desired DEMI authority, recovery proof, ownership model, retention policy, or suspend/restore semantics. **Direct legacy evidence; customer requirements remain open.**

## 7. Hospital Lifecycle Model

### 7.1 Current model

| Status | Current observed meaning | Current transition evidence | Phase 12A conclusion |
| --- | --- | --- | --- |
| `PENDING_VERIFICATION` | A pending Hospital/master record can exist before onboarding approval. It is not the same as a pending User activation record. | Seed/setup and Phase 3A onboarding; approval guards this exact state. | Preserve as onboarding state. Do not use it as an account-recovery state. |
| `ACTIVE` | The Hospital is eligible for current Hospital-scoped policies when the actor also has the required direct membership/relationship. | Onboarding approval is the current production writer. | This is the only status from which the proposed governance prototype would suspend. |
| `SUSPENDED` | A schema state used by current predicates/tests as an inactive Hospital state. | No production mutation path was found. Tests set it directly to verify denial. | Semantics must be defined by a future governance service; a raw enum value is not an accepted business workflow. |

### 7.2 Suspension/restore candidate

The smallest coherent lifecycle candidate is:

```text
ACTIVE -> SUSPENDED
SUSPENDED -> ACTIVE
```

with the local mutation changing only:

```text
Hospital.status
```

This is a **provisional proposal**, not a confirmed customer requirement. It is the safest initial candidate because current access predicates already consume Hospital status as a boundary and because no current service requires a cascade to another lifecycle.

For the Phase 12B.0 requirement-validation prototype, the transition is immediate when the transaction commits. It does not require a suspension reason, a future effective time, a multi-step approval workflow, or automatic notification. It is a narrow synchronous state transition; it does not start an asynchronous cascade or workflow.

The proposal deliberately does **not** automatically change:

```text
User.status
HospitalMembership.status
OsmHospitalRelationship.status
PatientHospitalRelationship
PatientOsmAssignment
UserRole
credentials
activation records
provider identity
provider sessions
appointments
clinical records
historical records
```

Only an authenticated, active Platform `ADMIN` may execute this future governance transition. Hospital Owner, Hospital Member, OSM, Patient, hierarchy metadata, and browser-provided state do not authorize it. This is a **provisional governance contract for requirement validation**, not customer-approved authority.

The existing authorization architecture’s fail-closed behavior and the selected preservation of lower-level lifecycle rows have different evidence status: fail-closed denial is a **direct current implementation consequence**; preserving the lower-level rows without cascade is the **provisional Phase 12B.0 contract**.

### 7.3 Benefits and risks

Benefits of the status-only boundary:

- preserves the existing Person/User and all Hospital relationships;
- preserves current and ended assignments as history;
- avoids changing a User’s unrelated active Hospital or role;
- avoids silently ending appointments, clinical records, or OSM responsibility history;
- makes restore a reactivation of the same state rather than a reconstruction process; and
- limits concurrency to one exact Hospital state transition plus its audit event.

Risks that require customer or operational decisions:

- an issued provider session may exist until a later ActorContext/policy check rejects the suspended Hospital scope;
- an already open page may be stale and needs a safe conflict/error response;
- restoring a Hospital will make a previously preserved scope usable again only when its own existing predicates pass; whether production should add exceptions or require separate resumption remains open;
- stored appointments may become operationally inaccessible without being cancelled or rescheduled; Phase 12B.0 intentionally performs neither business-continuity action; and
- members may need a read-only explanation or may need the Hospital hidden from their routine navigation; and
- a status-only mutation does not repair pre-existing inconsistent rows, which is a reason to avoid silently adding reconciliation to this slice.

### 7.4 Restore behavior

The recommended conceptual behavior is:

> Restore changes `Hospital.status` from `SUSPENDED` to `ACTIVE`; it does not reconstruct relationships, accounts, credentials, assignments, or history because suspension did not destroy them.

For Phase 12B.0, restore is also immediate when the transaction commits. Once the Hospital becomes `ACTIVE`, any previously preserved scope that independently still satisfies all existing authorization and lifecycle predicates becomes usable again through those rules. For example, an active membership with an active User, an active OSM relationship, or a still-current valid Patient–OSM assignment may become usable again. An independently suspended membership, OSM relationship, User, invalid assignment, or otherwise invalid scope remains denied. Restore does not reconstruct, reactivate, regenerate, replace, reconcile, or otherwise mutate lower-level state.

This deterministic restore consequence is a **provisional Phase 12B.0 requirement-validation behavior**, not a confirmed production/customer policy. Final decisions about resumption, operational continuity, and exceptions remain open.

## 8. Hospital Suspension / Restore Consequence Analysis

### 8.1 Impact map

| Domain | Current dependency on Hospital `ACTIVE` | Expected consequence of Hospital suspension if only `Hospital.status` changes | Requirement status |
| --- | --- | --- | --- |
| Hospital workforce | Workforce policy and owner scope require an active exact Hospital; list/detail queries filter or reject inactive Hospitals. | Routine Staff list/detail, provisioning, profession, and membership lifecycle operations in that Hospital fail closed. Membership and User rows remain stored. | **Direct current implementation evidence** for denial; **provisional proposal** for preservation. |
| OSM relationship | OSM lifecycle policy requires an active exact Hospital and an active direct Hospital Owner actor. | OSM relationship operations in that Hospital fail closed. The relationship row remains at its prior status; no automatic relationship suspension is required by current code. | **Direct current implementation evidence / Provisional proposal** |
| Patient directory | Direct Hospital membership and exact OSM assigned reads require the target Hospital to be active. | Routine Hospital/OSM Patient directory access for that Hospital is denied. The Patient–Hospital relationship remains. | **Direct current implementation evidence / Provisional proposal** |
| Patient assignment | Assignment policy/service requires active exact Hospital, active Owner authority, active target OSM relationship, and the existing assignment invariant. | New, reassignment, unassignment, and routine assignment management are unavailable. Existing assignment rows are preserved and not automatically ended. | **Direct current implementation evidence / Provisional proposal** |
| Screening | Relationship-scoped access/service paths require an active Hospital and valid direct/assigned scope. | Screening reads and mutations in that Hospital fail closed; Screening history is preserved. | **Direct current implementation evidence / Provisional proposal** |
| Goals | Goal access requires the active exact relationship/Hospital boundary and applicable direct/assigned authority. | Goal history and operations are inaccessible through the suspended Hospital; Goal Plans are not deleted or rewritten. | **Direct current implementation evidence / Provisional proposal** |
| Appointments | Appointment access and management require the active relationship/Hospital boundary. | Routine Appointment access and mutations fail closed. Stored scheduled/terminal Appointment rows are not automatically cancelled, rescheduled, or completed. | **Direct current implementation evidence for access; Provisional prototype preservation; Open final scheduling requirement** |
| Follow-up | Follow-up access/recording requires active relationship/Hospital scope. | Follow-up reads and recording fail closed; existing Follow-up history is preserved. | **Direct current implementation evidence / Provisional proposal** |
| Baseline | Baseline access requires active direct/assigned Hospital scope. | Baseline reads/mutations fail closed; Baseline history remains. | **Direct current implementation evidence / Provisional proposal** |
| Evidence | Evidence access requires active direct/assigned Hospital scope. | Evidence reads/mutations fail closed; append-only evidence history remains. | **Direct current implementation evidence / Provisional proposal** |

Within these reviewed modules, the status-only effect is coherent: the Hospital boundary becomes unusable while the lower-level identity and historical rows remain intact. This conclusion does not approve customer-facing scheduling, Patient self-service, notification, retention, or visibility behavior. **Inference from direct current implementation evidence.**

#### Appointments and historical operations

For the Phase 12B.0 prototype, stored Appointments remain unchanged when a Hospital is suspended. Scheduled Appointments are not automatically cancelled, completed, rescheduled, or deleted. Routine Hospital-scoped Appointment access and management fail closed because the Hospital is inactive. After restore, the same persisted Appointments become accessible/manageable again only when their normal authorization and lifecycle predicates still permit it.

The same preservation-and-policy-gating rule applies to Screening, Goals, Follow-ups, Baseline, Evidence, assignments, and historical clinical records. Phase 12B.0 does not invent compensating clinical, scheduling, staffing, notification, or business-continuity workflows. The real-world operational handling of scheduled Appointments during a Hospital suspension remains an **open customer requirement**.

### 8.2 Hospital Owner and Staff

- An active Owner membership row should remain stored when its Hospital is suspended. It is a relationship that becomes unusable through the Hospital boundary, not an account deletion or membership suspension. **Provisional proposal.**
- A Staff member’s membership row and User account should remain stored. Phase 11B.0’s membership lifecycle remains independent. **Provisional proposal based on current accepted lifecycle separation.**
- A User who has another active direct membership in another Hospital should continue operating there, subject to that other Hospital’s policy. Suspending Hospital A must not change Hospital B’s membership, User status, role, or clinical access. **Inference strongly supported by current exact-Hospital predicates.**
- A multi-role User may retain unrelated OSM or PATIENT access elsewhere if those independent scopes remain active. Hospital suspension is not account suspension. **Inference; future actor-specific self-service behavior remains open.**

Whether suspended Hospitals remain visible to their members, and whether a member can see a non-clinical suspension explanation, are **open requirements**. Current routine list/detail paths usually require active scope and therefore do not provide that view.

### 8.3 OSM and current assignments

- The `OsmHospitalRelationship` row remains at its current status if Hospital status alone changes.
- A current `PatientOsmAssignment` remains a current historical/operational row; it is not silently ended or recreated.
- Existing OSM assigned access becomes unusable while the Hospital is inactive because the current access predicates require both the active Hospital and active exact relationship/assignment path.
- After restore, the preserved relationship and current assignment become usable again only if the Hospital is `ACTIVE`, the OSM relationship is independently `ACTIVE`, the assignment is still current, the target User/account state is valid, and all existing assignment/relationship policy predicates pass. This is the **provisional Phase 12B.0 behavior**, not a confirmed customer-approved assignment policy.
- The Phase 11D.0 rule that an OSM relationship cannot be suspended while it has current assignments is a relationship-specific working-prototype rule. It must not be incorrectly applied as a requirement that Hospital suspension end assignments.

Hospital suspension does not end an assignment, set `endedAt`, reassign the Patient, suspend the OSM relationship, or introduce a paused-assignment state. The assignment remains structurally current if it was current before suspension. Automatic reassignment, assignment expiry, emergency override, and paused-assignment semantics remain **open requirements**.

### 8.4 Patient

- A Patient–Hospital relationship remains preserved when its Hospital is suspended.
- The same Person/Patient can remain active through another Hospital relationship; Hospital A suspension must not change that other relationship.
- Current DEMI does not implement Patient self-service. Whether a future Patient can authenticate and see anything while one Hospital is suspended is therefore an **open requirement**, not a current behavior to copy.
- Current Appointment and clinical records remain stored. There is no observed Hospital-status trigger that cancels appointments, changes clinical status, or rewrites historical artifacts.

### 8.5 Platform ADMIN

Platform `ADMIN` is a governance actor in this boundary, not a routine clinical reader. The current code gives Platform ADMIN onboarding approval authority but denies routine Patient-directory authority unless a separate direct Hospital scope exists.

For a future governance prototype, the conceptual capabilities are equivalent to:

```text
hospital:read-governance
hospital:suspend
hospital:restore
```

These names are illustrative and **not final capability declarations**. For Phase 12B.0, the provisional actor and projection contract in Section 25 is sufficient; no suspension/reason field or multi-step approval workflow is required. Final capability names, business approval, reason, and audit requirements remain open. Platform ADMIN governance access must not imply Patient lists, clinical records, OSM assignment read authority, or Hospital hierarchy inheritance. **Provisional proposal / current accepted authorization direction.**

## 9. Hospital Governance Authorization Boundary

The smallest safe governance boundary is:

```text
active Platform ADMIN
        +
exact Hospital identifier
        +
governance capability
        ->
bounded Hospital projection or exact Hospital status transition
```

The future service must obtain actor authority from server-side ActorContext and re-check the exact Hospital inside the mutation boundary. It must not accept a browser-provided role, owner ID, accessible-Hospital list, hierarchy expansion, or target scope as proof of authority.

Hospital suspension/restore should be distinct from:

- Hospital Owner relationship management;
- Staff membership lifecycle;
- OSM relationship lifecycle;
- Patient assignment management;
- User account suspension or recovery; and
- clinical or scheduling operations.

This separation keeps a governance decision from becoming an accidental cascade across independently owned domains. **Current accepted contract / provisional boundary.**

## 10. Governance Read Model

### 10.1 Minimum projection

The smallest useful Platform Admin governance projection is:

| Field | Purpose | Decision |
| --- | --- | --- |
| opaque Hospital ID | Exact target selection and stale-write identity | Required. Never substitute a name or hierarchy path. |
| Hospital code | Operator recognition | Required if the code is already a non-sensitive governance identifier. |
| Hospital name | Operator recognition | Required. |
| Hospital lifecycle status | Current governance state and transition choice | Required. |
| `createdAt` / `updatedAt` | Context and stale-read diagnostics | Useful and bounded. |
| active Owner count | Optional future governance diagnostic | Not required by Phase 12B.0, not an authorization input, not an ownership invariant, and not evidence that a multiple-Owner or last-Owner policy is accepted. It may be considered later as a bounded diagnostic only. |

The projection does not need Patient lists, HN, names of Patients, clinical records, OSM assignments, Screening, Goal Plans, Appointments, Follow-ups, Baseline, Evidence, or free-text clinical data. Platform governance visibility and clinical read authority are separate. **Provisional proposal.**

### 10.2 Detail and operational counts

An exact Hospital detail view may show bounded governance metadata and status history only if that is needed to operate the prototype. Workforce, OSM, Patient, and clinical counts should not be added merely because they are available. If a count is later required, its owner, privacy impact, consistency expectation, and bounded query must be specified separately.

No dashboard, trend reporting, cross-Hospital analytics, or clinical aggregate platform is implied. **Open requirement / explicit non-goal.**

## 11. Hospital Deletion Boundary

Hard deletion should be rejected for the current prototype and deferred unless a concrete retention/legal requirement forces a separate design.

Current schema relationships include both cascading and restrictive foreign keys. Clinical relationships and assignments retain meaningful history, and `AuditEvent` uses a restrictive actor reference. This means a Hospital hard delete could fail on historical references, require destructive cascading, or create a misleading partial-deletion contract. **Direct current implementation evidence / inference.**

The legacy “delete Hospital” behavior was a direct `is_active = false` update, not evidence that DEMI should implement hard deletion. DEMI should use explicit non-destructive lifecycle states for this boundary and should not create a generic soft-delete framework as a substitute for deciding each lifecycle. **Rejected legacy architecture / provisional proposal.**

Deferred questions include legal retention, export, archival, anonymization, and any exceptional destruction process. None is implemented in Phase 12A.

## 12. Hospital Owner Governance

### 12.1 What the current schema permits

`HospitalMembership` is unique by `(userId, hospitalId)`, while `membershipType` is a separate field. The database therefore technically permits more than one User to have `membershipType = OWNER` for a Hospital. There is no database constraint for exactly one Owner or at least one active Owner.

Current application behavior is narrower:

- onboarding approval creates the initial Owner;
- approval rejects an existing active Owner;
- workforce provisioning refuses to downgrade an existing Owner membership to Member;
- Phase 11B.0 does not target Owner rows; and
- no reviewed service promotes, demotes, removes, or transfers an Owner.

Therefore, the schema’s permissiveness must not be treated as a customer decision, and the onboarding guard must not be treated as proof that exactly one Owner is the long-term policy. **Direct current implementation evidence / open requirement.**

### 12.2 Owner questions

The following are explicitly unresolved:

| Question | Current answer | Classification |
| --- | --- | --- |
| Can a Hospital have multiple Owners? | Schema permits it; onboarding currently blocks approval when an active Owner already exists; no ongoing rule exists. | **Open requirement** |
| Can an Owner appoint another Owner? | No current operation. | **Open requirement** |
| Can an Owner remove or demote another Owner? | No current operation; membership lifecycle intentionally excludes Owner rows. | **Open requirement** |
| Can an Owner demote themselves? | No current operation. | **Open requirement** |
| Can Platform ADMIN promote/demote or remove an Owner? | No current operation or accepted capability. | **Open requirement** |
| Can a Hospital temporarily have zero active Owners? | The schema permits it and current membership/account states can be changed independently in fixtures, but no business invariant is enforced. | **Open requirement** |
| What happens when the final Owner account is unavailable? | No recovery or governance process exists. | **Open requirement** |
| Does ownership transfer change User role? | Current contract says Owner is a membership type plus `HOSPITAL` role; no transfer operation settles role changes. | **Open requirement constrained by current accepted role model** |

### 12.3 Ownership is not Hospital lifecycle

Suspending a Hospital should not automatically remove or demote Owners. An Owner change should not suspend the Hospital. A User who owns Hospital A and is a Member of Hospital B must retain the B membership when A ownership changes. This is a **provisional multi-Hospital boundary** based on current lifecycle separation.

## 13. Last-Owner Invariant Analysis

A reasonable eventual invariant is:

```text
An ACTIVE Hospital has at least one ACTIVE OWNER membership
linked to an ACTIVE User.
```

This is an **inference and provisional proposal**, not a final requirement. It protects a Hospital from becoming operationally ownerless, but it may not be the right rule for a future Platform Admin or support-led recovery model.

### 13.1 Edge cases

| Case | Risk | Boundary question |
| --- | --- | --- |
| Owner User is `SUSPENDED` | The membership remains OWNER but the person cannot enter the application. | Does the invariant count the User as unavailable, and who must replace/recover the Owner? **Open.** |
| Owner membership is `SUSPENDED` | The User may be active elsewhere but has no authority in this Hospital. | Is the Hospital immediately invalid, or can Platform governance temporarily own the exception? **Open.** |
| Hospital is `SUSPENDED` | Routine authority is already disabled by Hospital status. | Does the invariant apply only to `ACTIVE` Hospitals? **Provisional proposal:** yes, but confirm with operations. |
| Multiple Owners | A demotion may be safe if another eligible Owner remains. | Is “Owner” a set, a primary/recovery designation, or exactly one relationship? **Open.** |
| Owner belongs to multiple Hospitals | Account suspension could affect multiple ownership relationships. | Recovery/ownership action must target the exact Hospital and must not mutate unrelated memberships. **Current isolation contract.** |
| Concurrent demotion/transfer | Two valid-looking requests can both observe another Owner and then leave zero eligible Owners. | Re-read and enforce the invariant inside one transaction. **Provisional implementation constraint.** |
| Final Owner recovery | Account recovery may be security-sensitive and may require evidence outside the Hospital membership row. | Who requests, approves, verifies, and establishes the new credential? **Open.** |

### 13.2 Eventual enforcement location

If the invariant is accepted, the likely enforcement is a combination of:

1. a service/policy check that defines “eligible active Owner”;
2. a transaction that locks or conditionally re-reads the exact Hospital and affected membership/User rows;
3. a conditional state transition that rejects a demotion/suspension which would leave an active Hospital without an eligible Owner; and
4. an audit event in the same local transaction.

A database uniqueness constraint can enforce “at most one” in some designs, but it cannot by itself express “at least one active Owner” safely for all concurrent transitions. The exact schema mechanism should wait for the customer decision about multiple Owners and primary/recovery ownership. **Provisional proposal; no implementation in Phase 12A.**

## 14. Owner Transfer Models

The future conceptual operation might be named `transferHospitalOwnership`, but its exact semantics are not accepted.

| Model | Semantics | Benefit | Risk / decision required |
| --- | --- | --- | --- |
| A — Owner set | Multiple Owners are allowed. Transfer means promote the target, then optionally demote the source. | Simple and compatible with the schema; supports redundancy. | “Transfer” is not atomic single-primary ownership. Need last-Owner and demotion policy. |
| B — Exactly one primary Owner | One membership is the authoritative Owner; transfer atomically replaces it. | Clear single accountable owner. | Requires exact uniqueness/invariant and a recovery exception when that Owner is unavailable. |
| C — Owner set plus primary/recovery Owner | Multiple Owners exist, with one distinguished primary or recovery Owner. | Separates operational redundancy from recovery authority. | Adds a new concept, ordering, and dispute rules; likely needs schema and customer policy. |

Any future transfer must conceptually:

```text
verify actor authority
verify exact Hospital
verify source and target identity/membership
verify Hospital and account states
promote/reassign safely
enforce the agreed last-Owner rule
write bounded audit
commit atomically
```

The customer decision required before schema or service design is: **Is Hospital ownership a set, a single primary relationship, or a set with a distinguished recovery relationship?** No model is selected in Phase 12A and no schema change is proposed.

## 15. Account Recovery Domain Boundary

Account Recovery is separate from every relationship and governance lifecycle:

```text
Account Recovery
!= Hospital Restore
!= Membership Restore
!= OSM Relationship Restore
!= Role Assignment
!= Person Identity Repair
```

Examples:

- Restoring a Hospital does not restore a suspended User account.
- Restoring a membership does not establish a missing credential.
- Restoring an OSM relationship does not recover the OSM’s account.
- Reissuing a first-time activation is not resetting an already active account.
- Recovering a known User does not repair a conflicting Person/User identity mapping.
- Adding a replacement User is not the normal response to a forgotten password or lost activation channel.

### 15.1 What account recovery means in current DEMI

Current DEMI can establish a first credential for a provisioned User through Workforce or Patient activation. It can reissue an unclaimed activation capability under the relevant Hospital-scoped authority. It cannot currently support:

- forgotten-password recovery for an active User;
- recovery after loss of the activation channel once the first-time activation path is no longer valid;
- recovery of an active account after an authentication-provider identity change;
- recovery of a suspended User account;
- global session revocation after credential change;
- final-Owner recovery; or
- manual resolution of duplicate or conflicting identity mappings.

These are **direct current implementation findings** and **open requirements**, not a reason to add a generic reset action.

## 16. Recovery Case Taxonomy

| Case | Identity known? | Account state | Relationship state | Appropriate domain | Current status |
| --- | --- | --- | --- | --- | --- |
| Expired first-time workforce activation | Yes, existing `Person`/`User` known | `PROVISIONED` | Valid provisioned relationship(s) | Activation regeneration/issuance | Supported in bounded workforce activation paths; not account recovery. |
| Expired first-time Patient activation | Yes, existing `Person`/`User` known | Usually `PROVISIONED` | Valid Patient–Hospital relationship | Patient activation regeneration/issuance | Supported under current Patient activation authority; not account recovery. |
| Forgotten password | Yes | `ACTIVE` | Relationship valid | Credential recovery | Not implemented; provider/channel requirement open. |
| Active User lost access to activation/contact channel | Usually yes | `PROVISIONED` or `ACTIVE`, depending on timing | Relationship may be valid | Activation recovery or credential recovery | Not one generic case; exact state transition and evidence are open. |
| User account suspended | Yes | `SUSPENDED` | Relationships preserved | Account governance plus recovery/restore decision | Schema/predicates exist; no supported User suspend/restore workflow. |
| Membership suspended | Yes | User may be `ACTIVE` | One selected Hospital membership suspended | Membership lifecycle | Phase 11B.0 domain; not account recovery. |
| OSM relationship suspended | Yes | User may be `ACTIVE` | One exact Hospital OSM relationship suspended | OSM relationship lifecycle | Phase 11D.0 domain; not account recovery. |
| Auth provider identity changed | Uncertain or partially known | Varies | Varies | Provider reconciliation and account recovery | Not implemented; must not silently create a replacement User. |
| Wrong Person ↔ User linkage | Uncertain | Varies | Varies | Identity reconciliation | Manual/governance boundary; not automated recovery. |
| Duplicate Person/User records | Conflicting | Varies | Varies | Identity reconciliation | Manual/governance boundary; not automated recovery. |
| Final Hospital Owner inaccessible | Yes or uncertain | Varies | OWNER relationship exists | Governance + account recovery + possible manual verification | No current process; high-risk open requirement. |

The taxonomy prevents future implementation from treating every access problem as “reset password” or “create a new User.” **Provisional domain boundary.**

## 17. Recovery Authority

Recovery must distinguish four actors in the operation:

```text
who requests recovery
who authorizes recovery
who proves identity/control
who establishes the new credential
```

No single role should automatically perform all four functions.

| Subject | Possible requester | Possible authorizer | Proof / credential boundary | Current or proposed status |
| --- | --- | --- | --- | --- |
| Hospital Owner | The User, or an authorized Hospital operator for a first-time provisioned account | Current activation authority can issue first activation; active-account recovery authority is not accepted | The target User should establish the new credential; Owner must not learn or set a secret for another User | Existing first activation is supported; active-account recovery is **open**. |
| Hospital Staff | The User; possibly a Hospital Owner for an unclaimed activation | Hospital Owner can manage bounded activation issuance under current policy; recovery approval is not defined | No password visibility or predictable operator-set password | **Open requirement** for active-account recovery and lost-channel cases. |
| OSM | The User; possibly the exact-Hospital Owner for first activation | Current OSM provisioning authority is Hospital-scoped | Relationship restore is not credential recovery; target User must establish credential | Separate lifecycle boundaries are accepted; recovery is **open**. |
| Patient | The User/self-service actor if implemented; possibly an authorized Hospital actor for first activation | Current Patient activation policy supports bounded issuance; ongoing recovery authority is not defined | Must use approved identity/control proof; clinical membership is not proof of password ownership by itself | **Open requirement**, with Patient self-service intentionally not implemented. |
| Platform ADMIN | May initiate governance-assisted recovery for a known account or final Owner case | Could be a governance approver if customer policy grants it | Must not receive a password, raw token, OTP, or provider secret; identity evidence and escalation policy are open | **Open requirement / provisional security principle**. |

The following principles are recommended for future validation:

- Hospital Owner manages Hospital relationships, not another User’s password.
- Platform ADMIN may have governance recovery authority only if explicitly granted and audited; governance authority must not become routine clinical read authority.
- Recovery proves control/identity and establishes a new credential; it never reveals an existing secret.
- If the existing Person/User is known with sufficient evidence, preserve it.
- A replacement User is an exception for reconciliation, not the normal password-recovery path.
- A security-sensitive recovery result is auditable with bounded metadata.

These are **provisional proposals**, not complete authority requirements.

## 18. Credential / Session Consequences

### 18.1 Provider-independent recovery shape

The future recovery domain should be able to express this sequence without deciding the delivery provider in Phase 12A:

```text
identify existing account
        ↓
authorize recovery initiation
        ↓
issue bounded, purpose-specific, one-time recovery capability
        ↓
verify capability and required identity/control evidence
        ↓
establish or replace credential
        ↓
revoke superseded sessions/capabilities as required
        ↓
audit the security-relevant result
```

The exact email, phone OTP, external identity provider, ThaID, assisted/manual process, expiry, retry count, and provider integration remain **open requirements**. The current activation token pattern may provide implementation conventions later, but activation and recovery capabilities must remain purpose-specific and must not be interchangeable.

### 18.2 Current and recommended session behavior

| Action | Current implementation consequence | Recommended future direction | Requirement status |
| --- | --- | --- | --- |
| Hospital suspended | No global sign-out. Subsequent ActorContext/policy checks should reject the Hospital scope; another active Hospital scope on the same User is not changed. | Do not globally revoke a User session solely because one Hospital is suspended. Provide stale-page/conflict handling in the governance UI. | **Direct current implementation evidence / Provisional proposal** |
| Membership suspended | No observed provider-session revocation. The selected Hospital scope fails later policy checks while unrelated memberships can remain. | Preserve other Hospital scopes; no global sign-out by default. | **Direct current implementation evidence / Provisional proposal** |
| OSM relationship suspended | Phase 11D.0 changes relationship state only; assigned access fails on later authorization. | Preserve unrelated relationships and sessions; no global account sign-out by default. | **Direct current implementation evidence / Provisional proposal** |
| User account suspended | Current schema and ActorContext would deny application access when freshly resolved, but there is no supported mutation or provider-session revocation workflow. | Account suspension should eventually have explicit global session behavior, because it is account-wide. | **Open requirement / Provisional security proposal** |
| Credential changed/recovered | No local session registry or global revocation implementation exists. | Prefer revoking superseded sessions and recovery capabilities, subject to provider support and an accepted risk policy. | **Open requirement / Provisional security proposal** |
| Activation capability reissued | Existing activation service revokes/replaces the current unclaimed activation capability for that purpose. | Keep this separate from active-account recovery. | **Direct current implementation evidence** |

For Phase 12B.0, Hospital suspension is Hospital-scoped. It does not mutate `User.status`, revoke unrelated access to another Hospital, and does not implement global provider-session revocation. The deterministic prototype sequence is:

```text
successful transaction commit
        ↓
Hospital.status changed
        ↓
subsequent server authorization observes the new Hospital state
        ↓
suspended Hospital scope is rejected
```

Account-level session revocation remains part of the future account-governance/recovery contract, not the Hospital lifecycle prototype.

The current `signOut` behavior is session/provider scoped, not a general global-revocation mechanism. Any future claim that credential recovery logs out all devices requires a provider-specific design or a DEMI session boundary that does not currently exist. **Direct current implementation evidence.**

## 19. Identity Reconciliation Boundary

The following cases must route to a future reconciliation/governance process rather than an automated account-recovery action:

- duplicate `Person` records;
- wrong `Person` ↔ `User` mapping;
- conflicting identity evidence or national-ID mismatch;
- duplicate or legacy User/provider mappings;
- an authentication provider subject that cannot be safely mapped to the existing User;
- an ownership dispute;
- an unknown account owner; or
- a request whose proof conflicts with the authoritative identity record.

Recovery may use a known identity as an input, but it must not silently repair identity mappings or merge records. No generic reconciliation console, impersonation flow, “login as user,” or support console is designed or implemented in Phase 12A. **Provisional boundary / deferred requirement.**

## 20. Multi-Hospital Isolation

The exact Hospital boundary is non-negotiable for this phase.

### Scenario A — one User, two Hospital memberships

```text
User A
  Hospital A -> OWNER
  Hospital B -> MEMBER
```

Suspending Hospital A must not:

- suspend User A;
- suspend or remove the Hospital B membership;
- change User A’s roles;
- end B’s OSM or Patient relationships; or
- revoke unrelated B-scoped authority by accident.

Hospital B may continue to operate if its own active scope and policies permit it. **Inference from current exact-Hospital predicates and accepted lifecycle separation.**

### Scenario B — one OSM, two Hospitals

```text
User B
  Hospital A -> OSM
  Hospital C -> OSM
```

Suspending Hospital A must not suspend the Hospital C relationship or assignments. A recovery of User B’s account is different: it potentially affects authentication globally, even though it must not mutate relationship rows. **Current accepted multi-Hospital boundary / provisional recovery consequence.**

### Scenario C — one Patient identity, multiple Hospital relationships

The Patient/Person may remain active through another Hospital relationship. Hospital A suspension must not delete or rewrite the other relationship or its clinical history. Current Patient self-service behavior is not implemented, so future visibility must be decided separately. **Current accepted history/scope boundary / open self-service requirement.**

Platform governance mutations must carry and authorize the exact Hospital ID. A Hospital name, parent, child, network, or list of “accessible” IDs must not broaden the target scope.

## 21. Transaction / Concurrency Risks

Phase 12A does not introduce a generic locking framework. The future implementation should use narrowly scoped conditional updates and transactions consistent with existing DEMI patterns.

| Area | Race | Required protection to evaluate | Classification |
| --- | --- | --- | --- |
| Hospital lifecycle | Two concurrent suspend/restore requests | Re-read exact Hospital state inside a serializable or otherwise appropriately isolated transaction; use expected current status/updated timestamp; emit one audit event only for the committed transition. | **Provisional implementation constraint** |
| Hospital lifecycle | Stale Admin UI submits after another governance mutation | Conditional update must reject stale expected state/version and return a safe conflict; do not apply an old decision to a changed Hospital. | **Provisional implementation constraint** |
| Hospital lifecycle | Restore races with another governance operation | Re-read the exact Hospital and do not reconstruct or cascade unrelated state. Any required approval/reason must be validated in the same mutation boundary. | **Open requirement / provisional constraint** |
| Ownership | Two Owners demote/transfer concurrently | Re-read source/target membership, User status, Hospital status, and the agreed Owner invariant in one transaction. | **Provisional implementation constraint** |
| Ownership | Two concurrent transfers both observe a valid remaining Owner | Enforce the accepted multiple/primary Owner rule in the transaction; do not rely on application reads outside it. | **Open requirement / provisional constraint** |
| Ownership | Final Owner is suspended while a transfer occurs | Serialize or conditionally update the exact membership/User/Hospital rows; reject a result that violates an accepted invariant. | **Open requirement / provisional constraint** |
| Ownership | Target Owner membership changes while transfer is pending | Require exact target membership and status at commit; no implicit new membership or identity replacement. | **Provisional implementation constraint** |
| Ownership | Hospital suspension races with Owner mutation | Decide whether Hospital suspension blocks Owner mutation, then check both states in one transaction. Do not invent cascade semantics. | **Open requirement** |
| Recovery | Multiple recovery requests are active | Use purpose-specific, one-time, bounded capabilities; define whether a newer request revokes older unclaimed capabilities. | **Open requirement / provisional security constraint** |
| Recovery | Recovery races with account suspension | Re-read User status and identity mapping at approval/completion; do not complete a stale recovery against an account whose governance state changed. | **Provisional implementation constraint** |
| Recovery | Recovery capability is replayed | Atomically claim/use/revoke the capability; never make completion idempotent by reusing credential material. | **Provisional security constraint** |
| Recovery | Activation regeneration races with recovery | Keep activation and recovery purposes distinct and use explicit state transitions; do not let one flow silently restore the other. | **Current lifecycle boundary / provisional constraint** |

The exact isolation level, retry policy, and provider compensation path should reuse the existing transaction conventions after the relevant Phase 12C contract is accepted. No broad distributed lock or workflow engine is justified by current evidence.

## 22. Audit Requirements

The following are future conceptual event categories, not final action constants.

| Category | Actor | Target | Bounded metadata that may be useful | Must not be logged |
| --- | --- | --- | --- | --- |
| `hospital.suspended` | Platform ADMIN | Exact Hospital | Phase 12B.0: from/to status and exact Hospital ID; no reason | Patients, clinical counts, raw reason free text, credentials, tokens, identity evidence |
| `hospital.restored` | Platform ADMIN | Exact Hospital | Phase 12B.0: from/to status and exact Hospital ID; no reason | Same sensitive data as above |
| `hospital_owner.added` | Authorized governance/Hospital actor | Exact membership/User/Hospital | Opaque IDs, from/to membership type/status, bounded policy reference | Passwords, recovery data, identity numbers |
| `hospital_owner.removed` | Authorized governance/Hospital actor | Exact membership/User/Hospital | Opaque IDs and bounded state transition | Same sensitive data |
| `hospital_owner.transferred` | Authorized actor | Exact Hospital and source/target membership IDs | Source/target opaque IDs, transition model/version | Identity documents, credentials, raw tokens |
| `account.recovery_requested` | Requesting actor or system | Exact User/recovery case | Opaque User/case IDs, purpose, bounded channel type if approved | Raw email/phone, OTP, recovery token, auth secret |
| `account.recovery_completed` | Completing actor/system | Exact User/recovery case | Opaque IDs, result category, provider-independent purpose | Password, hash, token, session token, provider secret |
| `account.suspended` / `account.restored` | Authorized governance actor | Exact User | From/to account status, bounded reason code if accepted | Credentials, national ID, identity hash, evidence contents |

The existing audit validator already bounds metadata and rejects sensitive key patterns. Future recovery and governance events should preserve that property. Passwords, password hashes, raw activation/recovery tokens, provider secrets, national IDs, identity hashes, OTPs, session tokens, and credential material are forbidden.

Successful state-transition audit should be coordinated with the committed local state transition. Unsuccessful attempts should not automatically become application audit events; whether security telemetry records them is a separate concrete security/operations requirement. **Current accepted transaction/audit contract / provisional event taxonomy.**

Phase 12B.0 does not establish a final reason vocabulary, reason visibility rule, or production audit taxonomy. Its bounded Hospital lifecycle audit contains only the committed state transition and safe identifiers unless an already-accepted convention requires otherwise.

## 23. Open Customer Requirements

The following questions remain open and must not be silently resolved by Phase 12B.0:

### Hospital lifecycle and governance

- What is the exact Hospital suspend/restore business approval process?
- Who may suspend or restore a Hospital, and is Platform ADMIN approval sufficient?
- Does a production suspension/restoration require one approval or multiple approvals?
- Should suspension require a reason, and what bounded reason vocabulary is acceptable?
- Should suspension take immediate operational effect, or is there a scheduled/effective time?
- Should a suspended Hospital remain visible to its members, and with what non-clinical explanation?
- Should a suspended Hospital remain visible in Platform Admin governance views?
- What, if anything, happens to scheduled Appointments while a Hospital is suspended?
- What happens to current OSM assignments while the Hospital is suspended?
- Should preserved assignments automatically resume after restore in the final production behavior?
- Should Patients retain any self-service access while a Hospital is suspended?
- Should users receive notifications, and are any export, retention, or legal-hold actions required?

### Ownership

- Can a Hospital have multiple Owners?
- Can an Owner appoint another Owner?
- Can an Owner remove/demote another Owner?
- Can an Owner demote themselves?
- Must an `ACTIVE` Hospital always have at least one `ACTIVE OWNER` linked to an active User?
- Who can recover the final Owner?
- Can Platform ADMIN change Hospital Owners?
- Is there one primary Owner, an Owner set, or an Owner set with a primary/recovery Owner?
- Does ownership change require source-owner confirmation, target confirmation, or another approval?
- What is the behavior when all Owners are unavailable but the Hospital remains active?

### Account recovery

- Who may initiate account recovery for a Hospital Owner, Staff member, OSM, or Patient?
- Who may authorize it, and can those actors differ?
- What evidence is required for each account type and risk level?
- Which delivery and identity-verification channel will be used: email, phone OTP, external provider, ThaID, assisted/manual verification, or another channel?
- Does credential recovery revoke all existing sessions, selected sessions, or only recovery capabilities?
- Who may suspend or restore a User account?
- What requires Platform ADMIN intervention versus Hospital Owner action?
- What is the exact final-Owner escalation path?
- Which identity conflicts require manual reconciliation rather than automated recovery?
- What is the policy for provider-subject changes, duplicate Users, and suspicious identity evidence?

These are **open requirements**, not omissions to fill with generic IAM behavior.

Phase 12B.0 intentionally selects immediate committed-state behavior, no reason field, no approval workflow, no notification delivery, preserved lower-level rows, and policy-gated resumption so that a prototype can be implemented without inventing semantics. These selections remain provisional and do not close the corresponding production/customer questions above.

## 24. Rejected Legacy Architecture

The following legacy patterns are explicitly rejected for DEMI:

- browser-authoritative Hospital or account mutation;
- hierarchy-derived Hospital authorization;
- `ADMIN`/`admin_type` as a substitute for Role + Capability + Scope;
- one account-level active flag as a substitute for membership and relationship lifecycle;
- direct non-transactional paired updates for User and profession/relationship state;
- destructive user deletion as normal account management;
- predictable or displayed operator-generated passwords;
- hardcoded client-side password gates;
- password visibility or “send the current password” recovery;
- replacing a known User to avoid identity reconciliation;
- treating Hospital disable as deletion or as automatic relationship cascade; and
- a generic admin dashboard/support console without a named capability, exact scope, data projection, and audit boundary.

## 25. Recommended Phase 12B.0 Slice

### 25.1 Recommendation

No blocker was found that prevents a status-only Hospital lifecycle prototype. The smallest safe next slice is:

```text
Phase 12B.0 — Hospital Lifecycle Working Prototype

active Platform ADMIN
        ↓
bounded Hospital governance directory
        ↓
exact Hospital detail
        ↓
ACTIVE -> SUSPENDED
SUSPENDED -> ACTIVE
```

This recommendation is a **provisional proposal for requirement validation**, not an accepted product feature.

### 25.2 Bounded contract to validate

For requirement validation, the prototype contract is:

- **Actor:** only an authenticated, active Platform `ADMIN` may execute the transition through the future governance capability. Hospital Owner, Hospital Member, OSM, Patient, hierarchy relationships, and browser-provided state do not authorize it.
- **Target:** use the exact Hospital opaque ID; do not target through a Hospital name, hierarchy path, or browser-provided accessible-Hospital list.
- **Projection:** expose only a bounded Hospital ID/code/name/status/timestamp projection. An active Owner count is not required to execute either transition, is not an authorization input, is not an ownership invariant, and is not evidence that a multiple-Owner or last-Owner policy is accepted. It may be considered later as a separate bounded diagnostic.
- **Transitions:** support only `ACTIVE -> SUSPENDED` and `SUSPENDED -> ACTIVE`.
- **Immediate effect:** a successful commit changes the state synchronously and immediately:

  ```text
  successful transaction commit
          ↓
  Hospital.status changed
          ↓
  subsequent server authorization observes the new Hospital state
  ```

- **Suspension:** do not require a reason, add a reason field, schedule a future effective time, run a multi-step approval workflow, notify users, or process an asynchronous cascade.
- **Restore:** do not reconstruct, reactivate, regenerate, replace, reconcile, or otherwise mutate lower-level state. A preserved scope becomes usable again only when its own existing authorization and lifecycle predicates still pass.
- **No lifecycle cascade:** the only domain state mutated is `Hospital.status`. Do not automatically change `User.status`, `HospitalMembership.status`, `OsmHospitalRelationship.status`, `PatientHospitalRelationship`, `PatientOsmAssignment`, `UserRole`, activation records, credentials, provider identity, provider sessions, appointments, clinical records, or historical records.
- **OSM assignments:** do not end an assignment, set `endedAt`, reassign the Patient, suspend the OSM relationship, or introduce a paused-assignment state. A structurally current assignment remains current while the Hospital is suspended and can authorize access after restore only when the Hospital, OSM relationship, assignment, User/account, and all existing policy predicates are valid.
- **Appointments:** leave stored Appointments unchanged. Do not cancel, complete, reschedule, or delete them. Routine Hospital-scoped Appointment access/management fails closed while the Hospital is suspended and becomes available after restore only when normal authorization and lifecycle predicates permit it.
- **Sessions:** do not mutate credentials or provider sessions and do not implement global session revocation. Suspending one Hospital must not revoke unrelated access to another Hospital.
- **Scope consequence:** the current authorization architecture’s existing Hospital-`ACTIVE` predicates cause reviewed Hospital-scoped workforce, OSM, Patient, assignment, and clinical operations to fail closed while the Hospital is `SUSPENDED`. Preserving the lower-level rows and allowing independently valid scopes to become usable again after restore is the provisional prototype contract.
- **Exclusions:** do not implement Owner governance, active-Owner invariants, Owner transfer, account suspension/restoration, account recovery, notifications, scheduling/business-continuity workflows, or generic IAM/RBAC.
- **Integrity:** require stale-write protection using the expected current state/version, exact-Hospital isolation, and an atomic bounded audit for a successful transition. Phase 12B.0 audit may record the lifecycle transition and safe identifiers only; it must not establish a final reason/audit taxonomy.

All of these rules are **provisional Phase 12B.0 requirement-validation behavior**, not customer-approved production semantics. The unresolved business questions listed in Section 23 remain open.

### 25.3 Why this order is safe

The current architecture already uses Hospital status as a fail-closed scope condition across the reviewed domains. A status-only prototype therefore exercises the governance boundary without requiring a new ownership model, recovery provider, credential lifecycle, assignment policy, or clinical scheduling decision. Restore can test whether preserved state naturally becomes available again without reconstructing it.

The prototype should not expose routine clinical data to Platform ADMIN. It should not implement Hospital hierarchy inheritance, hard delete, Owner transfer, account recovery, notifications, or generic RBAC/IAM.

### 25.4 Roadmap boundary

The recommended sequence remains:

```text
Phase 12A
Hospital Governance + Account Recovery analysis

        ↓

Phase 12B.0
Hospital Lifecycle working prototype

        ↓

Phase 12C
Owner Governance + Account Recovery detailed contract

        ↓

Phase 12D.0
Bounded Owner / Recovery working prototype
```

Keeping Owner governance and account recovery in Phase 12C avoids presenting an incomplete Owner invariant or an unapproved recovery mechanism as a consequence of the simpler Hospital status transition. If customer evidence later shows that a suspended Hospital cannot be safely restored without an Owner/recovery prerequisite, 12B.0 must be reduced to a read-only governance projection or preceded by that prerequisite. Current implementation evidence does not show that blocker.

## 26. Deferred / Non-Goals

The following remain outside Phase 12A and the recommended 12B.0 slice unless a separately confirmed requirement changes the boundary:

- hard delete Hospital;
- hard delete User;
- Hospital merge;
- Hospital hierarchy authorization inheritance;
- generic organization administration suite;
- generic IAM;
- generic RBAC/ACL engine;
- SSO implementation;
- ThaID integration;
- LIFF;
- native mobile;
- geographic management;
- workforce transfer engine;
- Patient transfer;
- automatic OSM reassignment;
- dashboard/reporting platform;
- notification platform;
- arbitrary account impersonation;
- “login as user”;
- password visibility;
- generic support console;
- workflow engine; and
- break-glass system without a concrete requirement.

Useful future requirements may be recorded, but their implementation is not designed here.

## 27. Implementation Handoff Constraints

When a future implementation begins, it must preserve these constraints:

1. Re-read and validate the accepted Phase 12B.0 contract before coding; do not treat this document’s provisional proposals as customer approval.
2. Use the existing `Hospital.status` source of truth; do not add duplicate active flags or generic soft-delete fields.
3. Authorize Platform ADMIN server-side through authoritative ActorContext and exact Hospital scope.
4. Do not derive authority from parent/child Hospital metadata or a browser-supplied accessible-Hospital list.
5. Use an exact target and stale-write/conditional transition inside an appropriately scoped transaction.
6. Coordinate successful status transition and bounded governance audit atomically.
7. Keep the mutation to `Hospital.status`; do not cascade into User, membership, OSM, Patient, assignment, role, activation, credential, appointment, or clinical lifecycles.
8. Treat the committed state transition as immediate and synchronous. Do not add a reason field, scheduled timing, grace period, multi-step approval, notification delivery, asynchronous cascade, or workflow processing.
9. Do not require or use active Owner count for authorization or transition safety; Owner governance remains Phase 12C.
10. Keep the read projection governance-only and bounded; do not expose Patient or clinical data to Platform ADMIN through this slice.
11. Do not add Owner transfer or account recovery as convenience actions in the Hospital status UI.
12. Do not log passwords, hashes, raw activation/recovery tokens, provider secrets, national IDs, identity hashes, OTPs, session tokens, or credential material.
13. Add integration coverage for exact Hospital targeting, Platform ADMIN/non-ADMIN authorization, stale transitions, multi-Hospital isolation, preservation of memberships/relationships/assignments/history, fail-closed suspended access, and predicate-gated restore behavior before broadening scope.
14. If implementation discovers an existing module that ignores Hospital status or a required side effect that contradicts status-only suspension, stop and revise the boundary rather than adding an unreviewed cascade.

No ADR is created by Phase 12A. The status-only slice, Owner models, recovery authority, and session policy remain provisional/open; no sufficiently supported, difficult-to-reverse architectural decision requires acceptance at this stage.

## 28. Analysis Result

The current DEMI architecture supports a clear separation:

```text
Hospital governance
    changes Hospital lifecycle state

Owner governance
    changes exact Hospital ownership relationships

Account recovery
    proves control and establishes credentials for an existing account

Identity reconciliation
    resolves conflicting identity records and mappings
```

The first two are related by governance authority but are not the same mutation. Account recovery is account-wide and may affect authentication globally, while Hospital and relationship restoration are exact-scope operations. The smallest safe next step is therefore the status-only Phase 12B.0 candidate above, with Owner governance and recovery kept for a separately contracted Phase 12C analysis.

**Phase 12B.0 has not started. No product implementation, migration, route, form, authorization capability, notification delivery, or authentication-provider integration was added in Phase 12A.**
