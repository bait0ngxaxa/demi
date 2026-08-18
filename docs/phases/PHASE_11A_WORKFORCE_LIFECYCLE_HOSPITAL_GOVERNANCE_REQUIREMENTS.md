# Phase 11A — Workforce Lifecycle & Hospital Governance Requirements

## 1. Status / Objective

**Status:** Analysis complete; Phase 11B.0 is not implemented.

**Objective:** Close the smallest coherent Workforce Lifecycle and Hospital Governance boundary that can support the DEMI working prototype while preserving the existing identity, authorization, transaction, audit, and relationship-scoping decisions.

This artifact is a requirement and domain-boundary analysis only. It adds no product code, Prisma model, migration, Server Action, Route Handler, or new UI workflow.

The analysis uses the following evidence labels:

| Label | Meaning |
| --- | --- |
| **Current accepted contract** | A decision already established by an accepted ADR, architecture baseline, or phase contract. |
| **Direct implementation evidence** | Behavior verified in the current rewrite. It is not automatically a customer-approved requirement. |
| **Direct legacy evidence** | Behavior verified in the pinned legacy repository. It is terminology/behavior evidence only. |
| **Inference** | A reasoned interpretation of multiple sources, not a confirmed requirement. |
| **Provisional proposal** | A deliberately narrow, reversible choice recommended for the prototype. |
| **Open requirement** | A customer or governance decision that remains unresolved. |
| **Rejected legacy architecture** | Legacy behavior that must not be copied into DEMI. |

The priority remains:

```text
Correctness > Security > Performance > Maintainability > Speed
```

## 2. Sources inspected

### Current DEMI documentation and architecture

- [Project context](../CONTEXT.md)
- [DEMI Architecture Baseline](../architecture/DEMI_ARCHITECTURE_BASELINE.md)
- [ADR-0001 Person and User Identity](../adr/0001-person-and-user-identity.md)
- [ADR-0002 Role, Capability, Scope Authorization](../adr/0002-role-capability-scope-authorization.md)
- [ADR-0003 Hospital-Led Onboarding](../adr/0003-hospital-led-onboarding.md)
- [ADR-0005 Server-Side Application Boundary](../adr/0005-server-side-application-boundary.md)
- [ADR-0006 Transactional Business Operations](../adr/0006-transactional-business-operations.md)
- [ADR-0007 Client Transport and Mobile-Ready Architecture](../adr/0007-client-transport-and-mobile-ready-architecture.md)
- [ADR-0008 Workforce Provisioning and Activation](../adr/0008-workforce-provisioning-and-activation.md)
- [Phase 3A Hospital Onboarding](PHASE_3A_HOSPITAL_ONBOARDING.md)
- [Phase 4A Workforce Provisioning](PHASE_4A_WORKFORCE_PROVISIONING.md)
- [Phase 4B Workforce Provisioning](PHASE_4B_WORKFORCE_PROVISIONING.md)

### Current implementation and tests

- [`prisma/schema.prisma`](../../prisma/schema.prisma)
- [`src/modules/workforce/`](../../src/modules/workforce/)
- [`src/modules/hospital-onboarding/`](../../src/modules/hospital-onboarding/)
- [`src/modules/auth/`](../../src/modules/auth/)
- [`src/modules/audit/`](../../src/modules/audit/)
- [`app/app/workforce/`](../../app/app/workforce/)
- [`app/app/`](../../app/app/)
- Workforce policy, page transport, provisioning, activation, and authorization tests under [`src/modules/workforce/`](../../src/modules/workforce/)
- Workforce integration tests under [`tests/integration/workforce.integration.test.ts`](../../tests/integration/workforce.integration.test.ts)
- Patient–OSM assignment tests under [`tests/integration/patient-osm-assignment.integration.test.ts`](../../tests/integration/patient-osm-assignment.integration.test.ts)

The implementation was read directly rather than treating the phase documents as a substitute for the current code.

### Pinned legacy repository

The legacy evidence below is pinned to commit [`7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e`](https://github.com/raviut-max/demi-plus-web-v2/tree/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e), the commit referenced by the Phase 4 documents.

Inspected legacy paths:

- [`app/admin/staff/page.tsx`](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/app/admin/staff/page.tsx)
- [`app/admin/staff/[id]/verify-id/page.tsx`](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/app/admin/staff/%5Bid%5D/verify-id/page.tsx)
- [`app/admin/staff/add/page.tsx`](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/app/admin/staff/add/page.tsx)
- [`app/admin/staff/register/page.tsx`](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/app/admin/staff/register/page.tsx)
- [`app/admin/staff/add-temporary/page.tsx`](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/app/admin/staff/add-temporary/page.tsx)
- [`app/admin/staff/verify-temporary/page.tsx`](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/app/admin/staff/verify-temporary/page.tsx)
- [`app/admin/staff/emergency-register/page.tsx`](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/app/admin/staff/emergency-register/page.tsx)
- [`app/admin/staff/assignments/page.tsx`](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/app/admin/staff/assignments/page.tsx)
- [`app/admin/hospitals/page.tsx`](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/app/admin/hospitals/page.tsx)
- [`app/admin/hospitals/[id]/edit/page.tsx`](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/app/admin/hospitals/%5Bid%5D/edit/page.tsx)
- [`app/admin/settings/page.tsx`](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/app/admin/settings/page.tsx)
- [`lib/supabase/queries.ts`](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/lib/supabase/queries.ts)

At this pinned commit, `app/admin/staff/[id]/` contains the `verify-id` route; there is no generic staff detail page at that exact path.

## 3. Current DEMI contract

The following are **current accepted contracts** and remain unchanged by Phase 11A:

1. `Person` is the human identity. `User` is the application account. They are not interchangeable.
2. One human reuses one core `Person`/`User` identity across roles and Hospitals.
3. One `User` may have multiple top-level roles and multiple Hospital memberships.
4. `HOSPITAL`, `OSM`, `PATIENT`, and `ADMIN` are top-level roles. `Doctor` and `Nurse` are profession classifications, not automatic authorization roles.
5. A Hospital Owner is `HOSPITAL` plus `HospitalMembership.membershipType = OWNER`. A Hospital Owner is not a Platform `ADMIN`.
6. Hospital workforce staff use `HOSPITAL` plus `HospitalMembership(MEMBER)`; OSM uses `OSM` plus a separate `OsmHospitalRelationship`.
7. `OsmHospitalRelationship` means an OSM–Hospital association only. It is not automatically an area, village, patient, geographic, or clinical scope.
8. Routine workforce provisioning and the existing workforce read projection require an active `HOSPITAL` actor with a direct active `OWNER` membership in the selected active Hospital.
9. Authorization is `Role + Capability + Scope`, evaluated on the server and fail-closed. Client state, hierarchy metadata, request parameters, and legacy role values are not authority.
10. Cross-record consistency-critical operations use a transaction and write their audit event in the same local transaction. Provider I/O is outside the local transaction.
11. Hospital hierarchy metadata does not grant inherited access. Patient and clinical scope remains direct Hospital or exact active OSM assignment as already established by Phase 6A and later phases.
12. Historical Screening, Goal, Appointment, Follow-up, Baseline, and Evidence records must not be silently deleted or rewritten by workforce or Hospital governance actions.

The following are **current implementation facts** rather than newly accepted requirements:

- The schema has `Hospital.status = PENDING_VERIFICATION | ACTIVE | SUSPENDED`.
- `HospitalMembership.status = PROVISIONED | INVITED | ACTIVE | SUSPENDED` and `OsmHospitalRelationship.status = PROVISIONED | ACTIVE | SUSPENDED` already exist.
- `User.status = PROVISIONED | INVITED | ACTIVE | SUSPENDED` is account-level state.
- The current workforce policy exposes only `membership:read`, `membership:create`, and `osm:provision`.
- The current workforce service implements provisioning, identity reuse, first-time activation, activation regeneration/revocation, and bounded workforce listing. It does not implement general staff lifecycle management, OSM relationship lifecycle management, ownership governance, or Hospital suspend/restore.

## 4. Existing implementation inventory

| Area | Verified current behavior | Gap relevant to Phase 11A | Classification |
| --- | --- | --- | --- |
| Hospital onboarding | Platform Admin approval creates an active Hospital, an active User, `HOSPITAL` role, active `OWNER` membership, and audit in one local operation. Rejection changes only the application state. | No Hospital suspend/restore application service. | Direct implementation evidence; current accepted onboarding contract |
| Workforce policy | `decideWorkforcePolicy` accepts an authenticated `HOSPITAL` actor only when the actor has a direct active `OWNER` membership in the target active Hospital. Ordinary members, Platform Admin alone, suspended memberships, and suspended Hospitals are denied. | No lifecycle capability or policy for member update/suspend/restore, OSM suspend/restore, or owner management. | Direct implementation evidence |
| Workforce list | `/app/workforce` lets an authorized Owner select one of their active Hospitals and see bounded Staff and OSM projections. The projection contains display name, kind, profession for Staff, relationship status, User account status, and activation state/expiry/mode. | No detail workspace, no other-Hospital membership summary, no profession edit, no relationship lifecycle mutation. | Direct implementation evidence |
| Staff provisioning | Staff is a `HOSPITAL` role plus `HospitalMembership(MEMBER)`. Existing Users are reused. Existing active Users can receive an active relationship without a second activation. Existing OWNER rows are not silently downgraded. | Staff transfer, remove, owner transitions, and general lifecycle were explicitly deferred. | Direct implementation evidence; current accepted Phase 4 contract |
| OSM provisioning | OSM is an `OSM` role plus an `OsmHospitalRelationship`; the relationship is unique per User/Hospital. No Hospital membership or clinical scope is created automatically. | Relationship edit/suspend/restore/remove/move semantics are not implemented. | Direct implementation evidence; current accepted Phase 4 contract |
| Activation | New workforce Users are `PROVISIONED` and receive a one-time hashed activation capability. The target user sets the password. Existing active mapped Users reuse credentials. | No new activation semantics are needed for lifecycle management. Membership suspension must not be used to revoke or regenerate account credentials automatically. | Direct implementation evidence |
| Auth context | A User must be `ACTIVE` to resolve normal application access. ActorContext loads roles, memberships, OSM relationships, and Hospital status from the server. | Account state and relationship state need an explicit lifecycle contract so a relationship action does not disable a User. | Direct implementation evidence |
| Patient–OSM assignment | Assignments are Hospital-specific, append-only history. Only the current assignment has `endedAt = null`; reassigning ends the prior row and creates a new row. | No OSM relationship lifecycle operation decides what to do with an active assignment. | Direct implementation evidence; open requirement |
| Clinical access | Patient directory, Screening, Goals, Appointments, Follow-ups, Baseline, and Evidence use active Hospital and exact active relationship/assignment predicates. | Hospital or OSM relationship suspension behavior is observable as access denial, but no mutation flow defines operational expectations. | Direct implementation evidence |
| Audit | `AuditEvent` is bounded, accepts transaction-compatible Prisma clients, and rejects credential/identity-secret metadata. User deletion is constrained by audit history. | No lifecycle event names have been accepted for Phase 11 yet. | Direct implementation evidence |

## 5. Legacy behavior inventory

The legacy repository contains useful workflow vocabulary and evidence that operators expected a staff directory with detail, status, and recovery actions. It also contains architecture and security behavior that DEMI must reject.

| Legacy behavior | Evidence inspected | Classification and DEMI interpretation |
| --- | --- | --- |
| Staff list with active/deactivated tabs, search, sorting, role, Hospital, ID Card, name, and specialization | [`app/admin/staff/page.tsx`](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/app/admin/staff/page.tsx), `getStaffList`/`getDeactivatedStaff` in [`lib/supabase/queries.ts`](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/lib/supabase/queries.ts) | **Direct legacy evidence:** a workforce directory and status view are meaningful operator needs. The exact fields and scope are not accepted for DEMI. |
| Staff edit modal changes name, specialization, phone, email, birth date, Hospital, ID Card, and optionally resets password | [`app/admin/staff/page.tsx`](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/app/admin/staff/page.tsx), `updateStaff` in [`lib/supabase/queries.ts`](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55ad62b0d49bbaa8295d228e/lib/supabase/queries.ts) | **Direct legacy evidence:** staff correction/edit behavior exists. **Open requirement:** DEMI field ownership, visibility, and which fields Hospital Owners may edit. Password and raw identity editing are rejected for the rewrite. |
| Staff deactivate and restore update `users.is_active` and `doctors.is_active` | `deactivateStaff` and `restoreStaff` in [`lib/supabase/queries.ts`](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/lib/supabase/queries.ts) and handlers in [`app/admin/staff/page.tsx`](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/app/admin/staff/page.tsx) | **Direct legacy evidence:** operators expect disable/restore controls. **Rejected legacy architecture:** one account-level boolean is not a Hospital membership lifecycle. |
| Permanent staff deletion deletes the `doctors` and `users` rows | `permanentlyDeleteStaff` in [`lib/supabase/queries.ts`](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/lib/supabase/queries.ts) | **Direct legacy evidence:** hard deletion was exposed. **Rejected legacy architecture / open requirement:** DEMI must preserve identity and historical records unless a confirmed deletion policy exists. |
| Standard add-staff flow accepts ID Card, birth date, name, role, specialization, phone/email, Hospital, and admin type | [`app/admin/staff/add/page.tsx`](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/app/admin/staff/add/page.tsx), `addStaff` in [`lib/supabase/queries.ts`](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/lib/supabase/queries.ts) | **Direct legacy evidence:** these are historical operator-entered fields and role labels. **Rejected legacy architecture:** `users.role`, `users.hospital_id`, direct browser writes, plaintext passwords, and immediate active accounts. |
| Public registration writes `pending_staff`; Admin later approves it by inserting active `users`/`doctors` rows | [`app/admin/staff/register/page.tsx`](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/app/admin/staff/register/page.tsx), approval code in [`app/admin/staff/page.tsx`](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/app/admin/staff/page.tsx) | **Direct legacy evidence:** a pending request flow existed. **Open requirement:** whether DEMI needs self-requested staff registration. Trusted Hospital provisioning plus activation already covers the current prototype need. |
| Temporary account uses a generated checksum-valid ID beginning with `99`, can log in immediately, and is later converted to a real ID | [`app/admin/staff/add-temporary/page.tsx`](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/app/admin/staff/add-temporary/page.tsx), [`app/admin/staff/verify-temporary/page.tsx`](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/app/admin/staff/verify-temporary/page.tsx), and `updateTemporaryOSMIdCard` in [`lib/supabase/queries.ts`](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/lib/supabase/queries.ts) | **Direct legacy evidence:** missing-ID/urgent OSM registration was a real-shaped workflow. **Open requirement:** whether it represents current business need or an old workaround. It is not ported automatically. |
| Emergency registration generates/reserves an ID, derives a password from the ID, directly inserts an active User/doctor, and records an ID-card assignment | [`app/admin/staff/emergency-register/page.tsx`](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/app/admin/staff/emergency-register/page.tsx) | **Direct legacy evidence:** an urgent path existed. **Rejected legacy architecture:** predictable credentials, immediate activation, client-side writes, and multi-step non-atomic writes. |
| Staff assignments page assigns pending ID Cards to a Hospital | [`app/admin/staff/assignments/page.tsx`](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/app/admin/staff/assignments/page.tsx) | **Direct legacy evidence:** this is ID-card placement/provisioning support, not the current Patient–OSM assignment model. **Inference:** current trusted provisioning and activation removes much of the workaround. |
| Excel patient import resolves a coach by name and writes `profiles.coach_id`; no inspected logic automatically reassigns work when a coach becomes inactive | Related batch query in [`lib/supabase/queries.ts`](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/lib/supabase/queries.ts) | **Direct legacy evidence / maintenance behavior:** this is another old assignment mechanism, not proof of an OSM relationship lifecycle rule. It supports leaving Patient reassignment open rather than inventing automation. |
| Hospital list groups `main` and `sub` Hospitals and filters `is_active` | [`app/admin/hospitals/page.tsx`](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/app/admin/hospitals/page.tsx), `getHospitalsWithHierarchy` in [`lib/supabase/queries.ts`](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/lib/supabase/queries.ts) | **Direct legacy evidence:** hierarchy-shaped Hospital administration and active/inactive presentation existed. **Open requirement:** whether it represents governance authority. |
| Legacy access helper gives a main Hospital itself plus active children, and a child Hospital its parent, siblings, and itself | `getAccessibleHospitalIds` in [`lib/supabase/queries.ts`](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/lib/supabase/queries.ts) | **Direct legacy evidence:** inherited/network-shaped query scope existed. **Rejected legacy architecture:** hierarchy metadata must not grant DEMI authorization. |
| Hospital edit and delete controls change `is_active`; edit also changes parent/type metadata | [`app/admin/hospitals/[id]/edit/page.tsx`](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/app/admin/hospitals/%5Bid%5D/edit/page.tsx), [`app/admin/hospitals/page.tsx`](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/app/admin/hospitals/page.tsx) | **Direct legacy evidence:** operators expected Hospital enable/disable and metadata editing. **Open requirement:** exact suspension effect, recovery actor, and governance scope in DEMI. |
| Settings page links staff, temporary, verification, Hospital, and maintenance tools; it also uses a hardcoded password gate | [`app/admin/settings/page.tsx`](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/app/admin/settings/page.tsx) | **Direct legacy evidence:** these workflows were grouped as administration. **Rejected legacy architecture:** client-side role/session checks and hardcoded settings credentials are not authority. |
| Temporary-ID verification UI claims an audit record, but no corresponding audit service/table write was found in the inspected target paths | [`app/admin/staff/[id]/verify-id/page.tsx`](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/app/admin/staff/%5Bid%5D/verify-id/page.tsx), `updateIdCard` in [`lib/supabase/queries.ts`](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55ad62b0d49bbaa8295d228e/lib/supabase/queries.ts) | **Inference:** the UI text is not evidence that audit persistence existed. DEMI should use its existing server-side atomic audit boundary for future lifecycle events. |

Legacy paths consistently use a single `users.role` and `users.hospital_id` model, direct browser Supabase operations, or broad client-derived Hospital ID lists. These are **rejected legacy architecture**, not requirements.

## 6. Workforce lifecycle analysis

### 6.1 What the current Hospital Owner directory provides

The current `/app/workforce` projection already covers the minimum read needed for a broad provisioning demo:

- selected active Hospital context;
- display name from the reused `Person` identity;
- workforce kind (`STAFF` or `OSM`);
- staff profession classification where applicable;
- `HospitalMembership.status` or `OsmHospitalRelationship.status`;
- `User.status` as an account-state label;
- activation required, expiry, and presentation mode where an activation exists.

It deliberately does not expose National ID, password, activation token, `authSubject`, identity HMAC, provider identifiers, or other authentication internals. This is the correct direction.

The legacy directory provides evidence for a clearer detail/lifecycle workspace, but not for exposing authentication internals. A reused User's other Hospital memberships are not shown by the current rewrite. Showing every Hospital that a human belongs to would create cross-Hospital disclosure and scope questions that have not been answered.

**Conclusion:** The list is sufficient for Phase 4 provisioning, but a Phase 11B.0 detail/lifecycle workspace would make status and relationship ownership clearer. The detail projection should remain target-Hospital-scoped. A cross-Hospital membership summary is an **open requirement**, not part of the first lifecycle slice.

### 6.2 HospitalMembership operation matrix

| Candidate operation | Legacy evidence | Current DEMI support | State owner and User/other-relationship effect | Actor/capability and audit if proposed | Prototype assessment |
| --- | --- | --- | --- | --- | --- |
| Edit profession | Legacy edits role-specific text such as specialization, but does not prove the current `Profession` enum semantics. Current schema has `HospitalMembership.profession`; no mutation service exists. | Row exists, but no update policy/service. | `HospitalMembership.profession` only. It must not change `User.status`, `UserRole`, another Hospital membership, OSM relationship, or clinical record. | Direct active Owner in the same Hospital; provisional `membership:update`; `hospital_membership.profession_changed`. | **Provisional proposal:** allow only `MEMBER` + `ACTIVE` in 11B.0, with a narrow enum update and audit. Owner profession remains out of scope. |
| Suspend membership | Legacy “deactivate staff” changes account-wide `is_active` and a doctor row. Current architecture has relationship-level `SUSPENDED` and active-scope predicates. | Enum and predicates exist; no mutation service. | `HospitalMembership.status` for one User/Hospital pair. It must not disable the User or any other membership/role. | Direct active Owner in the same Hospital; provisional `membership:suspend`; `hospital_membership.suspended`. | **Provisional proposal:** allow only a non-Owner `MEMBER` transition `ACTIVE → SUSPENDED`, scoped to the selected active Hospital. |
| Restore/reactivate membership | Legacy has a restore action for deactivated staff. Current status enum exists. | No mutation service. | Same relationship row, `SUSPENDED → ACTIVE`; it must not activate a User or issue a credential. | Direct active Owner in the same Hospital; provisional `membership:restore`; `hospital_membership.restored`. | **Provisional proposal:** allow only a non-Owner `MEMBER` transition `SUSPENDED → ACTIVE`. |
| Remove membership | Legacy hard-deletes the User and doctor row, not a membership. Current membership is unique per User/Hospital and is referenced by ongoing identity and historical operations. | No relationship-removal service. | Meaning is unresolved: end this Hospital relationship, retain a historical membership, or delete a person/account. It may affect other roles/memberships if implemented incorrectly. | Actor, capability, record-end semantics, and audit action are all open. | **Open requirement:** exclude from 11B.0; do not hard-delete. |
| Transfer between Hospitals | Legacy edits a single `users.hospital_id`. Current architecture explicitly supports multiple memberships and does not model transfer as a single-column move. | No transfer service or invariant. | Would affect source membership, target membership, possible Owner state, role reuse, OSM relation, and active work. It must not change the User identity. | Source/target authority, likely separate capabilities, and audit semantics are open. | **Open requirement:** exclude. A transfer must not be approximated by editing a target ID. |
| Promote `MEMBER → OWNER` | Legacy has admin types but no accepted DEMI Owner appointment contract. Current onboarding creates the first Owner only. | No owner-management capability/service or database rule for multiple Owners. | `HospitalMembership.membershipType` for one relationship, with last-Owner and recovery implications. User account and Person remain the same, but governance changes materially. | Owner-governance actor/capability and `hospital_owner.promoted` audit are open. | **Open requirement:** exclude. |
| Demote `OWNER → MEMBER` | No accepted legacy equivalent for the new membership model. | Existing provisioning explicitly avoids silently downgrading an Owner. | Owner membership type; may make a Hospital unrecoverable if it is the last usable Owner. | Owner-governance actor/capability and `hospital_owner.demoted` audit are open. | **Open requirement:** exclude. |
| Owner self-demotion | No current support or accepted requirement. | No policy. | Same Owner governance risk, plus actor/session consequences. It must not disable the User account. | Actor/capability and audit are open; last-Owner protection would be mandatory. | **Open requirement:** exclude. |

### 6.3 User/account effects for a membership action

The following are **provisional safety invariants** for any future staff membership lifecycle mutation:

1. A membership suspend/restore changes exactly the selected `HospitalMembership` row.
2. It does not change `User.status`, password, `authSubject`, `UserRole`, Person data, activation state, or any other Hospital membership.
3. If the same User is also an OSM in the same Hospital, the OSM relationship is unchanged. OSM access is governed by its own relationship and assignment predicates.
4. If the same User has another active Hospital membership, that other relationship remains active and usable under its own scope.
5. If the same User is also a Patient, the Patient identity and PatientHospitalRelationship remain unchanged.
6. A membership restore does not activate a `PROVISIONED`, `INVITED`, or `SUSPENDED` User. Account recovery/activation remains a separate workflow.
7. An account suspension does not substitute for suspending one Hospital membership.

These rules preserve the existing `Person != User` and multi-role/multi-Hospital invariants.

## 7. OSM–Hospital relationship lifecycle analysis

### 7.1 Current boundary

The current rewrite treats `OsmHospitalRelationship` as a first-class User/Hospital association with a unique `(userId, hospitalId)` pair and a relationship status. Provisioning may reuse a User who already has other roles or Hospital relationships. The row does not assign an area, village, Patient, or clinical authority.

The current Patient–OSM implementation is separate:

- `PatientOsmAssignment` is attached to a specific `PatientHospitalRelationship`.
- Reassignment ends the prior assignment and appends a new row.
- Assignment candidates require an active User, OSM role, active OSM–Hospital relationship, and active Hospital.
- OSM Patient reads require an active current assignment.
- Existing tests show that changing an OSM User or OSM–Hospital relationship to `SUSPENDED` immediately removes assigned-directory access without rewriting assignment history.

This is **direct implementation evidence**, not a complete customer-approved relationship lifecycle contract.

### 7.2 Candidate relationship operations

| Candidate operation | Current/legacy evidence | Effect on Patient assignments | Actor/audit if proposed | Assessment |
| --- | --- | --- | --- | --- |
| Suspend relationship | Relationship status exists; current access predicates deny suspended relations. Legacy inspected staff flows use account-wide inactive state and do not expose an independent OSM–Hospital relationship. | Current reads become inaccessible; assignment rows remain. Whether the active assignment should be blocked, resolved first, expired, or retained as an inactive dependency is unresolved. | Direct active Owner is a possible actor, but `osm:suspend` and `osm_relationship.suspended` remain open. | **Open requirement:** no 11B.0 mutation. |
| Restore relationship | Status enum and predicates support an active relationship, but there is no service or customer rule for restoration. | Existing assignments could become usable again if still current, which may or may not be intended. | Direct active Owner is a possible actor, but `osm:restore` and `osm_relationship.restored` remain open. | **Open requirement:** no 11B.0 mutation. |
| Remove relationship | No current service. Database deletion can conflict with `PatientOsmAssignment` history and does not express a business end date. | Deletion could destroy or orphan relationship history; automatic assignment handling is not defined. | Actor, capability, end-state, and audit action are open. | **Open requirement:** no hard delete or relationship removal. |
| Move/reassign OSM to another Hospital | Provisioning supports adding a second relationship for a reused User; current contract allows multi-Hospital relationships but leaves cross-Hospital semantics open. | Existing source-Hospital assignments must not be silently moved to the target Hospital. | Source/target authority and transfer audit are open. | **Open requirement:** no transfer mutation. |
| Associate one OSM with multiple Hospitals | The schema and provisioning path can represent one User with multiple unique OSM relationships. | It does not imply shared Patient scope or cross-Hospital assignments. | Existing `osm:provision` covers creation in an exact target Hospital; broader multi-Hospital semantics remain open. | **Current accepted data capability; workflow semantics remain open.** |

### 7.3 Required non-invention rule

Phase 11A does not choose automatic reassignment, automatic unassignment, automatic expiration, or automatic transfer of Patient–OSM assignments. Any future OSM relationship lifecycle feature must first decide whether an operation is:

- blocked while active assignments exist;
- allowed only after an explicit assignment-resolution step;
- allowed while preserving inactive assignment history but denying future access; or
- handled through another customer-confirmed rule.

Until that requirement exists, the safest prototype behavior is to show relationship status and preserve the existing fail-closed read predicates, without adding a lifecycle button.

## 8. Hospital Owner governance analysis

### 8.1 Evidence and current state

The onboarding contract creates the first approved applicant as an active Owner. Phase 4 provisioning requires a direct active Owner and explicitly deferred additional Owner appointment, transfer, and recovery. The current schema has a unique User/Hospital membership, but it does not encode a customer decision about how many active Owners a Hospital may have or guarantee at least one active Owner.

No current route, service, capability, or test authorizes Owner promotion/demotion.

### 8.2 Governance question matrix

| Question | Evidence | Current decision | Prototype treatment |
| --- | --- | --- | --- |
| Can a Hospital have multiple active Owners? | No accepted rule; no current owner-management flow or cardinality constraint. | **Open requirement.** | Do not create or expose additional Owners in 11B.0. |
| Can an Owner appoint another Owner? | Explicitly deferred by onboarding/Phase 4 documents. | **Open requirement.** | Exclude. |
| Can an Owner demote another Owner? | No accepted policy or last-Owner rule. | **Open requirement.** | Exclude. |
| Can an Owner demote themselves? | No accepted policy; can strand a Hospital. | **Open requirement.** | Exclude. |
| Can the last active Owner be removed or suspended? | No current service. A Hospital with no usable Owner has no established recovery path. | **Provisional safety invariant:** never permit a future Owner mutation that leaves zero usable active Owners. | No Owner mutation in 11B.0; if later implemented, block the last usable Owner before persistence. |
| Who recovers a Hospital with no usable Owner? | Platform Admin is a governance/recovery actor in the architecture, but no owner-recovery capability or workflow is accepted. | **Open requirement.** | Do not invent `ADMIN` owner management now. Consider a future separately named, audited recovery capability only after customer confirmation. |
| Which actions are normal Hospital operation? | Current direct Owner provisioning/listing is normal Hospital operation. | **Current accepted contract:** direct active Owner, selected active Hospital. | 11B.0 may remain in this boundary. |
| Which actions are Platform Admin governance? | Onboarding approval/rejection is current Admin governance; owner recovery and Hospital suspension are not implemented. | **Open requirement** for workforce governance beyond onboarding. | Keep Platform Admin out of routine workforce lifecycle in 11B.0. |

The “last active Owner” guard is a minimum data-integrity precaution, not a decision that a Hospital must have exactly one Owner or that multiple Owners are forbidden.

## 9. Hospital organization lifecycle analysis

### 9.1 Current states

The current schema and onboarding implementation distinguish:

```text
Hospital: PENDING_VERIFICATION → ACTIVE → SUSPENDED
HospitalMembership: PROVISIONED | INVITED | ACTIVE | SUSPENDED
OsmHospitalRelationship: PROVISIONED | ACTIVE | SUSPENDED
User: PROVISIONED | INVITED | ACTIVE | SUSPENDED
```

Only the onboarding transition to `ACTIVE` is currently implemented as a governance operation. Hospital suspension/restoration is not implemented.

### 9.2 Effect of Hospital suspension under current predicates

If a Hospital row is set to `SUSPENDED` by a future operation, current direct implementation predicates would make the Hospital unavailable to active operational scopes:

| Area | Current expected effect | What must not happen automatically |
| --- | --- | --- |
| Hospital Owner access | Direct Owner workforce policy for that Hospital denies the target because the Hospital is not active. | Do not disable the human User or remove the Owner membership. |
| Staff memberships | Membership rows remain stored; active operational authorization requiring an active Hospital fails. | Do not rewrite every membership status or delete staff identities. |
| OSM relationships | Active OSM relation is ineffective while its Hospital is inactive. | Do not delete the relationship or alter OSM role. |
| PatientHospitalRelationship | The relationship remains historical data; direct active-Hospital access predicates deny routine access. | Do not delete HN, relationship records, or clinical records. |
| Patient access | Hospital directory and relationship-scoped reads fail closed/return no accessible rows. | Do not reassign Patients or change Patient identities. |
| Screening and Goals | Existing scope checks require active Hospital/relationship context, so operational access is blocked. | Do not delete or rewrite Screening/Goal history. |
| Appointments and Follow-ups | Existing active relationship predicates prevent routine access while the Hospital is suspended. | Do not cancel, complete, edit, or delete historical records as a side effect. |
| Baseline and Evidence | Existing relationship access is blocked; stored snapshots and artifact metadata remain. | Do not remove binaries, metadata, or evidence history. |

This table describes **direct implementation behavior/inference from current predicates**, not a complete business suspension policy. It does not decide whether read-only reporting, recovery, or data export should remain available.

### 9.3 Prototype recommendation

Hospital suspend/restore is excluded from Phase 11B.0. It has a larger blast radius than a single workforce membership and requires a confirmed operational contract, recovery actor, audit policy, and UX for blocked clinical work. If later approved, the smallest safe first operation is an organization-state update plus audit in one transaction, with no destructive cascade.

## 10. Parent/child Hospital hierarchy evidence

### Current rewrite

- `Hospital.parentHospitalId`/the parent relation exists as nullable metadata in the schema.
- The current onboarding contract permits the metadata but explicitly rejects inherited authority.
- Current patient-assignment integration tests deny parent/child cross-access.
- Current workforce policy checks the selected Hospital's direct active Owner membership and active status; it does not use `parentHospitalId` to grant access.

### Legacy behavior

- Legacy Hospital pages label Hospitals as `main` or `sub`, join `parent_hospital`, group children under parents, and allow editing the parent.
- Legacy `getAccessibleHospitalIds` gives a main Hospital itself plus active children, and a child Hospital its parent, siblings, and itself.
- Staff, Hospital, and other admin pages use those IDs for client-side filtering.

### Boundary conclusion

The legacy behavior is **direct legacy evidence** for hierarchy-shaped data and network-shaped operator expectations. It is not enough to show that inherited Patient, workforce, report, or clinical authority is a real customer requirement. It may be an old query implementation workaround for a single `users.hospital_id` model.

The current DEMI rule remains:

```text
Hospital hierarchy metadata != authorization
```

No Phase 11B.0 read or mutation may widen scope through a parent, child, sibling, or network relationship. A confirmed hierarchy authority model would require a new/superseding architectural decision before implementation; Phase 11A does not edit accepted ADRs.

## 11. Account vs membership vs relationship lifecycle matrix

| State | Owns the state | Meaning | Current/known changes | Must not imply automatically |
| --- | --- | --- | --- | --- |
| `User.status` / account status | `User` account and authentication boundary | Whether the application account is provisioned, invited, active, or suspended. | First-time activation can make a provisioned workforce account active; auth context denies non-active accounts. Other account suspension/recovery rules are not implemented here. | It must not be changed merely because one Hospital membership is suspended, restored, removed, or transferred. It does not decide a specific Hospital relationship's scope. |
| `Hospital.status` | Hospital organization | Whether the organization is pending verification, active, or suspended. | Onboarding approval creates `ACTIVE`; suspension/restoration is not implemented. | It must not delete or rewrite memberships, OSM relations, Patients, assignments, clinical records, or artifacts. |
| `HospitalMembership.status` | One User–Hospital staff relationship | Whether this specific staff relationship is provisioned, invited, active, or suspended. | Provisioning/activation creates or activates the row; general lifecycle mutation is not implemented. | It must not disable the User, change other Hospital memberships, change OSM relations, or change Patient assignments. |
| `OsmHospitalRelationship.status` | One User–Hospital OSM relationship | Whether this specific OSM association is provisioned, active, or suspended. | OSM provisioning/activation creates or activates it; general lifecycle mutation is not implemented. | It must not change the User account, HospitalMembership, OSM geographic scope, or automatically reassign Patients. |
| `WorkforceActivation` state | One activation capability for a target User | Whether a first-time workforce activation has been issued, claimed, completed, revoked, expired, or requires reconciliation. | The activation service issues, claims, completes, regenerates, and revokes within its own contract. | It must not be used as a staff membership suspension mechanism or as proof that a User's business relationship is active. |

The distinction is a **current accepted architectural boundary**. Phase 11B.0 must not collapse any of these states into one “active/inactive” flag.

## 12. Authorization / capability analysis

### 12.1 Existing capability vocabulary

The current workforce policy has exactly:

```text
membership:read
membership:create
osm:provision
```

All three are currently restricted to an active `HOSPITAL` actor with a direct active `OWNER` membership in the selected active Hospital. The current policy denies ordinary Hospital members, Platform Admin-only actors, OSM, Patient, wrong-Hospital targets, suspended memberships, and suspended Hospitals.

### 12.2 Minimal provisional vocabulary for 11B.0

The following is a **provisional proposal**, not an authoritative implementation matrix:

| Capability | Use | Scope | Actor allowed in proposed 11B.0 |
| --- | --- | --- | --- |
| `membership:read` | Read the bounded Staff/OSM list and target relationship detail. | Exact selected active Hospital and exact target relationship. | Active direct Hospital Owner. Reuse the existing current policy. |
| `membership:create` | Existing staff provisioning. | Exact selected active Hospital. | Active direct Hospital Owner. Already current. |
| `osm:provision` | Existing OSM provisioning. | Exact selected active Hospital. | Active direct Hospital Owner. Already current. |
| `membership:update` | Change `HospitalMembership.profession` for a non-Owner active staff membership. | Exact target membership in the Owner's active Hospital. | Active direct Hospital Owner. Provisional. |
| `membership:suspend` | Suspend a non-Owner active staff membership. | Exact target membership in the Owner's active Hospital. | Active direct Hospital Owner. Provisional. |
| `membership:restore` | Restore a suspended non-Owner staff membership. | Exact target membership in the Owner's active Hospital. | Active direct Hospital Owner. Provisional. |

No new OSM lifecycle or Hospital governance capability is recommended for 11B.0. The following remain **open candidates only**: `osm:update`, `osm:suspend`, `osm:restore`, `hospital:manage`, `hospital:suspend`, `hospital:restore`, and `hospital-owner:manage`.

### 12.3 Provisional actor matrix

| Actor path | `membership:read` | `membership:create` | `osm:provision` | `membership:update` | `membership:suspend` / `restore` | Hospital/Owner governance |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Platform `ADMIN` only | Deny | Deny | Deny | Deny | Deny | Open future governance/recovery path; no routine workforce access now. |
| `HOSPITAL` + direct active `OWNER` in target active Hospital | Allow | Allow | Allow | Provisional allow for non-Owner active staff membership | Provisional allow for non-Owner staff membership | No Owner or Hospital-state mutation in 11B.0. |
| `HOSPITAL` + direct active `MEMBER` | Deny in the workforce workspace | Deny | Deny | Deny | Deny | Deny. Patient capabilities remain separate. |
| `OSM` | Deny | Deny | Deny | Deny | Deny | No governance authority. |
| `PATIENT` | Deny | Deny | Deny | Deny | Deny | No governance authority. |

For a multi-role User, a valid direct `HOSPITAL` Owner path may authorize the operation even if that User also has `ADMIN`, `OSM`, or `PATIENT` roles. An `ADMIN` role alone must not grant routine workforce access.

### 12.4 Scope rules

- The server must derive the actor from authenticated server context.
- The server must re-check the target Hospital and target relationship; a client-selected Hospital ID is only a selector, never proof of authority.
- Scope is the exact target Hospital, not a parent, child, sibling, network, or global scope.
- A selected target User's other Hospital memberships are not automatically readable by the current Hospital Owner.
- Policy ambiguity, missing relationship, inactive Hospital, inactive Owner membership, or missing target row fails closed.

## 13. Data integrity and transaction boundaries

### Current database invariants

- `HospitalMembership` is unique per `(userId, hospitalId)`.
- `OsmHospitalRelationship` is unique per `(userId, hospitalId)`.
- `PatientOsmAssignment` preserves assignment history and restricts unsafe relationship deletion through its foreign keys.
- Audit actor references and other historical relations make physical User deletion unsafe as a normal lifecycle operation.
- Schema `onDelete` behavior is persistence mechanics, not permission to expose a business delete operation.

### Provisional boundaries for 11B.0 staff membership mutations

Each profession update, membership suspend, or membership restore should be one application-service transaction:

1. Resolve the authenticated actor server-side.
2. Validate the capability and exact selected Hospital scope.
3. Re-read the actor's direct active Owner membership and target active Hospital inside the operation.
4. Re-read the target `HospitalMembership` with an expected current state and require a non-Owner `MEMBER` row.
5. Update only the target `profession` or `status` field.
6. Create the bounded audit event in the same transaction.
7. Commit or return a safe conflict/error; do not report success after a partial write.

No provider I/O is needed. No User, role, OSM relation, Patient assignment, clinical record, or activation record is mutated by these operations. A serializable transaction and stale-state check are appropriate because two Owners could otherwise act on a changed row concurrently.

### Deferred boundaries

- An OSM relationship mutation cannot be specified until the active Patient assignment consequence is decided.
- Hospital suspension/restoration needs an organization-governance transaction and explicit operational policy; it must not be implemented as a loop that rewrites every dependent row.
- Owner promotion/demotion/recovery needs a governance transaction with last-Owner protection and a confirmed recovery authority.
- Transfer needs a dedicated invariant and transaction; it must not be implemented as a single `hospitalId` update.

## 14. Audit requirements

The existing `AuditEvent` model and bounded audit service are sufficient for the narrow prototype. A generic event-sourcing or full row-versioning subsystem is not needed.

### Provisional 11B.0 events

| Event action | Resource | When | Safe metadata |
| --- | --- | --- | --- |
| `hospital_membership.profession_changed` | `HospitalMembership` | Profession update commits. | Old/new enum values only if needed; target resource ID is already in the audit row. |
| `hospital_membership.suspended` | `HospitalMembership` | Staff membership suspend commits. | Optional reason code from a bounded non-sensitive enum, if a reason is later confirmed. |
| `hospital_membership.restored` | `HospitalMembership` | Staff membership restore commits. | No extra identity or clinical data needed. |

These event names are **provisional** until the implementation contract is approved. The actor must be derived server-side and the event must commit atomically with the state change.

### Deferred events to evaluate later

- `osm_relationship.suspended` / `osm_relationship.restored`
- `hospital.suspended` / `hospital.restored`
- `hospital_owner.promoted` / `hospital_owner.demoted`
- relationship removal/transfer events once their semantics are confirmed

Audit must not include Thai National ID, raw identity values, password, activation token, `authSubject`, identity HMAC, provider credentials, phone/email, or unnecessary Patient/clinical content. Existing metadata validation already rejects the main credential and identity-secret categories.

## 15. Legacy temporary/emergency flow disposition

| Flow | What it appears to solve | DEMI disposition |
| --- | --- | --- |
| Standard direct staff add | Trusted operator needs to create staff/OSM and give them access. | The current trusted provisioning + one-time activation model solves this need with better identity reuse, credential ownership, transaction, and audit boundaries. Do not port the legacy direct-active/password behavior. |
| Public `pending_staff` registration | Staff self-request or an operator workflow that needs an approval queue. | **Open requirement.** Not needed for the current Hospital-led trusted provisioning demo; do not add a second onboarding path without customer confirmation. |
| Temporary ID account | An OSM/staff member is available before a real National ID is recorded. | **Open requirement.** Could be a real field constraint or legacy workaround. A future identity-proofing flow must not be inferred from the old fake-ID behavior. |
| Temporary verification | Replace a generated ID with a real ID and mark the profile verified. | **Open requirement.** This is identity correction/proofing, not ordinary membership lifecycle. Exclude from 11B.0. |
| Emergency registration | Urgent account creation without waiting for normal approval. | **Recovery/maintenance-shaped legacy flow; open requirement.** Do not port predictable credentials or immediate activation. If real urgency is confirmed later, design a separate audited break-glass workflow. |
| Staff assignments page | Allocate/reserve a pending ID Card to a Hospital. | **Direct legacy evidence, not current Patient–OSM assignment.** Current trusted Hospital provisioning and activation remove the need for this exact workaround. Do not conflate the two assignment domains. |

The legacy `birth date → password`, ID suffix password, plaintext password storage, fake/checksum ID generation, direct browser writes, and “active immediately” behavior are **rejected legacy architecture**.

## 16. Confirmed behavior

The following conclusions are sufficiently supported to carry forward as current contract or current implementation boundary:

1. A human may be reused across roles and Hospitals; no duplicate Person/User may be created for a staff move, Owner change, OSM role, or Patient role.
2. Hospital staff membership and OSM–Hospital relationship remain separate records with separate lifecycle state.
3. Current routine workforce authority is direct active Hospital Owner authority in the selected active Hospital. Platform Admin is not a routine Hospital workforce operator.
4. The current workforce workspace is a bounded status/provisioning list, not a full lifecycle manager.
5. The current rewrite has no supported membership suspend/restore, OSM relationship lifecycle, Owner governance, or Hospital suspend/restore mutation.
6. Current access predicates fail closed when a Hospital, User, membership, OSM relationship, or assignment is inactive as applicable; they do not delete historical records.
7. Parent/child metadata does not grant inherited authorization.
8. Patient–OSM assignment history is append-only and must not be automatically reassigned by an unconfirmed OSM relationship action.
9. Existing bounded audit persistence is enough for a small set of transactional lifecycle events.
10. Hard deletion is not a safe default for workforce, Hospital, or identity governance.

## 17. Provisional prototype decisions

These decisions are deliberately narrow and are not customer-approved requirements:

1. Keep `/app/workforce` as the entry workspace and add one bounded detail/lifecycle surface in the future implementation, preferably `/app/workforce/[kind]/[relationshipId]` where `kind` is `staff` or `osm`. Do not create an admin-only parallel workforce architecture.
2. Keep the detail read projection target-Hospital-scoped. Do not display all Hospitals belonging to a reused User until cross-Hospital visibility is confirmed. If a workshop needs this question, show it as an explicit unresolved state rather than silently exposing it.
3. In the first lifecycle slice, support only Staff `HospitalMembership` actions: change profession, suspend, and restore for non-Owner `MEMBER` rows. Restrict transitions to `ACTIVE ↔ SUSPENDED` for lifecycle actions; leave `PROVISIONED`/`INVITED` to activation/provisioning workflows.
4. Do not expose OSM relationship suspend/restore/remove/transfer in the first slice. Show relationship status read-only and retain the current assignment-dependent fail-closed access behavior.
5. Do not expose Owner promotion, demotion, self-demotion, transfer, last-Owner removal, or Hospital suspension/restoration.
6. Use the existing direct active Owner policy and the provisional capability names in Section 12; do not authorize by legacy role labels, localStorage, parent/child metadata, or a client-selected list.
7. Persist each staff membership mutation and its audit event atomically. Do not call an external provider and do not mutate User account state as a side effect.
8. Preserve all other memberships, roles, OSM relationships, assignments, and historical business records exactly as they are.

## 18. Explicitly open customer requirements

The following questions must remain visible for requirement workshops:

### Workforce and visibility

- Which staff fields are authoritative in DEMI beyond display name and profession: phone, email, date of birth, specialization, license, contact data, or other fields?
- May a Hospital Owner edit a shared Person field, or only a Hospital-local membership field?
- Should a Hospital Owner see that a reused User belongs to other Hospitals? If yes, which Hospitals and under what disclosure/scope rule?
- Should Hospital Members have read-only workforce directory access, or is Owner-only appropriate?
- Should a suspended staff member retain any read-only or handoff access?

### Membership lifecycle

- Is “suspend” the canonical reversible relationship state, or is there a separate “deactivate”/“remove” business meaning?
- Can a membership be permanently ended while retaining history? What should the historical state be called?
- What is the supported transfer workflow between Hospitals, including source/target approval and active work?
- Can a membership be restored after the User account is suspended, and who separately restores the account?
- Are profession changes allowed for suspended/provisioned rows or only active members?

### OSM and assignment lifecycle

- Can an OSM belong to multiple Hospitals operationally, and what does that mean for visibility and work queues?
- Can an OSM–Hospital relationship be suspended while active Patient assignments exist?
- If it can, should the action block, require explicit resolution, end assignments, or preserve them as inaccessible history?
- What does “remove” mean for an OSM relationship, and how are assignment history and audit retained?
- Is moving an OSM a new association, a transfer, or a source relationship end plus target relationship creation?
- Is any geographic/area/village scope required, and if so, how is it authorized without using hierarchy metadata?

### Owner and Platform governance

- May a Hospital have multiple active Owners?
- Who appoints, demotes, or removes an Owner?
- Can the last usable Owner be suspended or removed under any emergency process?
- Who recovers a Hospital with no usable Owner: Platform Admin, a support process, or another confirmed actor?
- What governance operations may Platform Admin perform without becoming a routine Hospital operator?

### Hospital lifecycle and hierarchy

- What does Hospital suspension block: login, new operational writes, reads, reporting, integrations, or only routine care workflows?
- Is restoration automatic, Platform Admin-controlled, or Hospital-requested?
- Should suspension block all dependent relationships immediately, as current predicates do, or require an explicit migration/recovery step?
- Is parent/child metadata merely organizational display, or does the customer require a formal Hospital network authority model?
- If network authority is required, what exact capabilities and scopes are inherited, and which are explicitly not inherited?

### Identity, temporary, and deletion policy

- Is temporary/emergency workforce registration a real current workflow or legacy workaround?
- What proof is required to replace a temporary identity with a real identity, and who may perform it?
- Is any customer-approved data retention, relationship end, anonymization, or hard deletion policy required?
- How long must lifecycle and governance audit history remain available, and to whom?

## 19. Recommended Phase 11B.0 working prototype

### Slice objective

Build a small, reversible **Staff Membership Lifecycle** slice around the existing `/app/workforce` workspace. Keep OSM relationship lifecycle, Owner governance, Hospital suspension, hierarchy authority, and deletion semantics outside the slice until the open requirements are answered.

### Exact actors

- Active authenticated `HOSPITAL` User.
- Direct active `OWNER` membership in the selected active Hospital.
- A multi-role User may use this path only because of the valid direct Hospital Owner path; `ADMIN` alone is not enough.

All other actors are denied: Platform Admin alone, Hospital Member, OSM, and Patient.

### Exact routes/workspaces

- Existing `/app/workforce` list and Hospital selector.
- Proposed bounded detail/lifecycle route: `/app/workforce/[kind]/[relationshipId]`, with `kind = staff` for `HospitalMembership` and `kind = osm` for read-only OSM detail.
- No new `/admin` workforce route, generic IAM screen, or speculative HTTP API. A future transport should be added only when a current consumer requires it.

### Exact read projection

For the selected Hospital and target relationship, expose only:

- Hospital code/name and current organization status;
- workforce kind;
- display name from `Person`;
- staff profession, when the target is Staff;
- target membership/relationship status;
- User account status as a separate label;
- existing activation required/expiry/mode projection where relevant;
- safe lifecycle affordances derived from server policy.

Do not expose raw National ID, password, activation token, `authSubject`, identity HMAC, provider identifiers, or hidden credential state. Do not expose the target User's complete cross-Hospital membership list. Phone, email, date of birth, specialization, and license fields remain open until field ownership and visibility are confirmed.

### Exact supported mutations

1. `HospitalMembership.profession`: update an active non-Owner `MEMBER` row to another supported profession enum.
2. `HospitalMembership.status`: suspend an active non-Owner `MEMBER` row.
3. `HospitalMembership.status`: restore a suspended non-Owner `MEMBER` row.

The slice does not mutate `User.status`, `UserRole`, Person data, activation, OSM relationships, Patient assignments, or clinical records. Existing provisioning and activation controls remain separate.

### Capability checks

- Reuse `membership:read` for the bounded list/detail read.
- Add/use `membership:update`, `membership:suspend`, and `membership:restore` only as provisional capability names after this scope is approved.
- Require exact selected active Hospital scope and direct active Owner membership on every mutation.
- Re-check authorization and target state inside the transaction; UI visibility is not authorization.

### Lifecycle invariants

- Never mutate an Owner row through this slice.
- Never disable or activate the entire User because one Hospital relationship changes.
- Never rewrite another Hospital membership or OSM relationship for the same User.
- Never use parent/child metadata to widen access.
- Never silently transfer, delete, or reassign Patient work.
- Only `ACTIVE → SUSPENDED` and `SUSPENDED → ACTIVE` are lifecycle transitions in this slice.
- The operation is safe to retry only with expected-state/stale-update protection; no blind duplicate write should be reported as success.

### Audit events

- `hospital_membership.profession_changed`
- `hospital_membership.suspended`
- `hospital_membership.restored`

Each event is written in the same transaction as the state change and uses only bounded, non-sensitive metadata.

### Transaction boundary

One serializable local transaction per mutation:

```text
server ActorContext
  → exact Owner + Hospital policy re-check
  → target MEMBER row/state re-check
  → one membership field update
  → one bounded AuditEvent
  → commit
```

No provider I/O, activation issuance, assignment update, relationship cascade, or historical-record rewrite is part of the transaction.

### Required UX states

- Loading and empty list.
- Target not found or not in the selected Hospital.
- Actor not authorized, rendered as a safe denied state.
- Hospital suspended, with lifecycle actions unavailable.
- Target already suspended/restored by another operator, with a stale-state conflict and reload path.
- Owner row or non-member row, with no lifecycle controls.
- Successful mutation with the resulting relationship status and no secret values.
- OSM detail shown as read-only with an explicit note that OSM lifecycle and Patient-assignment consequences are not yet part of the prototype.

### Required tests before implementation is approved

- Policy tests for direct active Owner allow and Member/Admin/OSM/Patient/hierarchy-only deny.
- Scope tests for wrong Hospital and parent/child Hospital denial.
- Profession update changes only the target membership and writes one audit event.
- Suspend/restore changes only the target membership and writes one audit event.
- A User with another active Hospital membership remains active there.
- A User with an OSM relationship or Patient role retains those relationships unchanged.
- User account status, activation state, roles, Patient assignments, and clinical history remain unchanged.
- Owner rows cannot be mutated; the future last-Owner guard remains unbroken.
- Stale concurrent mutation returns a conflict without an incorrect audit event.
- Transaction rollback removes both the state change and its audit event.
- No raw National ID, password, token, authSubject, HMAC, or provider credential enters projection or audit metadata.

### Explicit non-goals for 11B.0

- OSM relationship suspend/restore/remove/transfer.
- Patient reassignment automation or assignment-resolution workflow.
- Owner appointment, demotion, transfer, self-demotion, or recovery.
- Hospital suspend/restore or cascade policy.
- Parent/child inherited authorization.
- Cross-Hospital User membership disclosure.
- Hard delete, generic soft-delete, anonymization, or retention framework.
- Temporary/emergency identity proofing.
- New profile field ownership or clinical profession licensing.

This recommendation is intentionally smaller than a general workforce-management system and should be revised after the requirement workshop.

## 20. Explicit Phase 11 non-goals

Phase 11A and the recommended 11B.0 slice do not implement or define detailed contracts for:

- OSM geographic Area/Village scope;
- Patient reassignment automation;
- Hospital network authorization;
- Dashboard, Statistics, or Reporting;
- Knowledge/content management;
- Hospital master external integration;
- email/SMS/LINE notification delivery;
- ThaID;
- LIFF;
- native mobile app;
- generic IAM;
- generic RBAC/ACL platform;
- generic workflow engine;
- generic organization-management framework;
- generic soft-delete framework;
- bulk staff import;
- payroll/HR functionality;
- clinical profession licensing verification.

These remain later-phase or confirmed-requirement work. No accepted ADR needs to change as a result of this analysis.
