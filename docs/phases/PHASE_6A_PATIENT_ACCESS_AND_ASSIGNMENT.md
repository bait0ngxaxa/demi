# Phase 6A — Patient Access and Assignment Requirement Closure

**Status:** Phase 6A owner decisions accepted. This is the accepted architecture and requirements handoff for Phase 6B; no Phase 6B product code is implemented by this document.

**Date:** 2026-08-15

**Scope:** Define the smallest safe contract for Patient read access, operational assignment, and future Patient management before implementing Patient operations. Clinical workflows, lifecycle mutations, and speculative transport infrastructure remain outside this phase.

**Phase status:** `Phase 6A — ACCEPTED`; `Phase 6B.1 — IMPLEMENTATION READY`; `Phase 6B.2 — IMPLEMENTATION READY after B6.1`; `Phase 6B.3 — DEFERRED / REQUIREMENTS REQUIRED`.

**Result:** The direct Hospital Patient read contract and the Hospital OWNER-controlled, Hospital-specific OSM assignment contract are accepted. B6.1 may start with the Hospital directory/minimal-detail slice; B6.2 follows it. Patient profile editing, lifecycle mutations, transfer, self-service expansion, and clinical workflows remain deferred.

## 1. Phase status and objective

Phase 5 closed Patient provisioning and optional first-time account activation. Phase 6A now closes the Patient read and assignment contract for the next operational slices, while keeping profile editing, lifecycle mutations, transfer, self-service expansion, and clinical workflows explicitly deferred.

The classification used throughout this document is:

| Classification | Meaning |
| --- | --- |
| **CONFIRMED CURRENT REQUIREMENT** | Directly supported by current requirements, accepted ADRs, or the current architecture baseline. |
| **LEGACY BEHAVIOR ONLY** | Observed in the pinned legacy repository; useful domain evidence, but not accepted for the rewrite. |
| **ARCHITECTURE-CONFLICTING LEGACY BEHAVIOR** | Legacy behavior that the accepted rewrite architecture prohibits. It must not be copied. |
| **PROPOSED MVP CONTRACT** | A minimal, fail-closed engineering recommendation for a decision not covered by the accepted Phase 6A contract. |
| **OWNER CONFIRMATION REQUIRED** | A business, privacy, or authority decision outside the accepted Phase 6A contract that cannot be inferred safely. |
| **DEFERRED** | Intentionally outside the Phase 6B operational access slice. |

The working rule is:

```text
Role + Capability + server-resolved Scope + target resource = authorization decision
```

Navigation remains a UX projection. It is never evidence of Patient authority.

## 2. Source hierarchy and inspected evidence

The source-of-truth order remains:

1. Confirmed current business requirements.
2. Accepted ADRs.
3. Architecture baseline.
4. `docs/CONTEXT.md`.
5. Current schema, implementation, and tests as supporting implementation evidence.
6. Legacy DEMI only as behavioral and terminology reference.

The owner-provided Phase 6A decision set in the current task is the accepted requirement input for this phase. It resolves the Patient access, assignment, B6.1 projection, and pagination decisions described below without rewriting accepted ADR history.

The following current sources were inspected:

- [PRODUCT.md](../../PRODUCT.md)
- [Project context](../CONTEXT.md)
- [Architecture baseline](../architecture/DEMI_ARCHITECTURE_BASELINE.md)
- [ADR-0001 — Person and User Identity](../adr/0001-person-and-user-identity.md)
- [ADR-0002 — Role, Capability, Scope Authorization](../adr/0002-role-capability-scope-authorization.md)
- [ADR-0004 — Patient Provisioning and Activation](../adr/0004-patient-provisioning-and-activation.md)
- [ADR-0005 — Server-Side Application Boundary](../adr/0005-server-side-application-boundary.md)
- [ADR-0006 — Transactional Business Operations](../adr/0006-transactional-business-operations.md)
- [ADR-0007 — Client Transport and Mobile-Ready Architecture](../adr/0007-client-transport-and-mobile-ready-architecture.md)
- [ADR-0008 — Workforce Provisioning and Activation](../adr/0008-workforce-provisioning-and-activation.md)
- [Phase 5A Patient Provisioning Contract](./PHASE_5A_PATIENT_PROVISIONING.md)
- [Phase 5B.1 Patient Provisioning Core](./PHASE_5B1_PATIENT_PROVISIONING_CORE.md)
- [Phase 5B.2 Patient First-Time Activation](./PHASE_5B2_PATIENT_FIRST_TIME_ACTIVATION.md)
- [Prisma schema](../../prisma/schema.prisma)

Relevant implementation and test evidence inspected:

- [ActorContext type](../../src/modules/auth/types/actor-context.ts), [ActorContext service](../../src/modules/auth/services/actor-context-service.ts), and [protected application access](../../src/modules/auth/services/application-access-service.ts)
- [Base authorization primitives](../../src/modules/auth/policies/authorization.ts)
- [Patient provisioning policy](../../src/modules/patient-provisioning/policies/patient-provisioning-policy.ts) and [PatientProvisioningService](../../src/modules/patient-provisioning/services/patient-provisioning-service.ts)
- [Patient activation policy](../../src/modules/patient-activation/policies/patient-activation-policy.ts), [activation query service](../../src/modules/patient-activation/services/patient-activation-query-service.ts), and activation transport/service
- [Application navigation projection](../../src/components/app-shell/application-navigation.ts)
- [Audit schema](../../src/modules/audit/schemas/audit-schemas.ts) and [audit service](../../src/modules/audit/services/audit-service.ts)
- [Patient provisioning integration tests](../../tests/integration/patient-provisioning.integration.test.ts) and [Patient activation integration tests](../../tests/integration/patient-activation.integration.test.ts)
- Patient provisioning, activation, policy, query projection, and navigation unit tests under `src/`.

Legacy evidence was inspected at commit `7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e` in `raviut-max/demi-plus-web-v2`:

- [Legacy Patient list](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/app/admin/patients/page.tsx)
- [Legacy Patient detail](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/app/admin/patients/%5Bid%5D/page.tsx)
- [Legacy Patient registration](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/app/admin/patients/new/page.tsx)
- [Legacy Patient import](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/app/admin/patients/import-excel/page4-6-69.tsx)
- [Legacy Patient queries and writes](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/lib/supabase/queries.ts)
- [Legacy coach update flow](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/app/admin/patients/update-coach/page.tsx)
- [Legacy Patient update route](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/app/api/admin/update-patient/route.ts)

## 3. Existing architecture invariants

The following are binding and are not reopened by Phase 6A:

- **CONFIRMED CURRENT REQUIREMENT:** `Person` represents the human and `User` represents the application account. Adding `PATIENT` to an existing OSM or Hospital user must preserve one core identity.
- **CONFIRMED CURRENT REQUIREMENT:** Patient provisioning and account activation are separate. A valid Patient domain record may remain usable by an authorized operational workflow while its User is `PROVISIONED` and cannot log in.
- **CONFIRMED CURRENT REQUIREMENT:** `PatientProfile` is separate from `Person`, and Hospital-local HN must not move to `Person`.
- **CONFIRMED CURRENT REQUIREMENT:** The current schema supports multiple `PatientHospitalRelationship` rows for one Patient. No one-Hospital invariant may be introduced implicitly.
- **CONFIRMED CURRENT REQUIREMENT:** `OsmHospitalRelationship` means only direct OSM–Hospital association. It does not mean assigned Patient scope, ownership, geographic scope, or clinical authority.
- **CONFIRMED CURRENT REQUIREMENT:** `Hospital.parentHospitalId` and child metadata are not authorization primitives. Parent/child hierarchy does not bypass direct relationship checks.
- **CONFIRMED CURRENT REQUIREMENT:** Authorization is evaluated server-side, fails closed, and does not trust browser role, Hospital, Patient, OSM, creator, or assignment identifiers.
- **CONFIRMED CURRENT REQUIREMENT:** The application boundary remains Client/UI → Server Action or Route Handler → Application Service → Policy/Authorization → Prisma → PostgreSQL/Supabase.
- **CONFIRMED CURRENT REQUIREMENT:** Local consistency-critical writes and their successful audit event belong in one Prisma/PostgreSQL transaction. Provider authentication I/O remains outside that transaction and uses compensation/reconciliation.
- **CONFIRMED CURRENT REQUIREMENT:** Platform `ADMIN` is primarily responsible for governance, audit, recovery, reconciliation, and exceptional cases, not normal day-to-day Patient operations.

## 4. Current Phase 5 implementation boundary

### 4.1 Current schema

The schema in [prisma/schema.prisma](../../prisma/schema.prisma) currently contains:

- `Person.identityKeyHash` with unique HMAC-derived identity lookup, optional given/family names, and one optional `PatientProfile`.
- `User` with one `Person`, multiple `UserRole` rows, account `status`, and provider `authSubject`.
- `PatientProfile` with a unique `personId` and timestamps only.
- `PatientHospitalRelationship` with `patientProfileId`, `hospitalId`, optional `hospitalNumber`, a unique `(patientProfileId, hospitalId)` constraint, and no patient-domain lifecycle enum.
- `PatientActivation`, scoped to a `User` and `Hospital`, with digest-at-rest token state, bounded claim/reconciliation fields, and creator attribution.
- `HospitalMembership`, `OsmHospitalRelationship`, `Hospital.parentHospitalId`, and `AuditEvent`.
- No `PatientOsmAssignment`, Patient roster read model, Patient update command, transfer model, PatientProfile deactivation state, or relationship closure state.

### 4.2 Phase 5B.1 provisioning

**CONFIRMED CURRENT REQUIREMENT** *(implemented):* [Phase 5B.1](./PHASE_5B1_PATIENT_PROVISIONING_CORE.md) implements `patient:provision` for single provisioning and Hospital bulk import.

- A Hospital actor currently needs an active direct `OWNER` or `MEMBER` membership in an active target Hospital.
- An OSM actor currently may single-provision through an active `OsmHospitalRelationship`; OSM is not allowed to use the Hospital-only bulk adapter.
- The service re-resolves actor and target Hospital state inside a serializable transaction.
- It resolves or creates one `Person`, reuses or creates one `User`, preserves existing roles, adds `PATIENT`, creates/reuses `PatientProfile`, and creates/reuses the target Hospital relationship.
- Exact repeats are idempotent, conflicts fail closed, and a successful `patient.provisioned` event is written in the same local transaction.
- Provisioning does not read a Patient roster, grant `patient:read`, create an assignment, activate credentials, or create clinical data.

The current Hospital `OWNER`/`MEMBER` and OSM provisioning rules are implementation evidence for those operations only. They do not silently become the Patient read or update policy.

### 4.3 Phase 5B.2 activation

**CONFIRMED CURRENT REQUIREMENT** *(implemented):* [Phase 5B.2](./PHASE_5B2_PATIENT_FIRST_TIME_ACTIVATION.md) implements optional Patient first-time activation.

- `patient:activation:issue` is available to an active `HOSPITAL` actor with a direct active `OWNER` or `MEMBER` membership in the target active Hospital.
- The target Patient must have the `PATIENT` role, `PatientProfile`, and a relationship to that Hospital.
- The dedicated activation query supports exact Thai National ID lookup through the existing HMAC service and exact HN lookup in the selected Hospital context.
- The query is bounded to 25 matches and returns a narrow activation projection: opaque application identifiers, display name, Hospital-local HN, account/activation status, expiry, and issue eligibility.
- It does not return raw National ID, `identityKeyHash`, provider subject/alias, password, activation token, or clinical data.
- Activation changes account/provider state only; it does not change `PatientProfile` or `PatientHospitalRelationship`.

This activation query is a narrow operational action boundary. It is not a general Patient directory or a settled `patient:read` contract.

### 4.4 Current navigation and tests

**CONFIRMED CURRENT REQUIREMENT** *(implemented):* The application shell projects only Patient provisioning and Patient activation navigation. The navigation tests verify that an OSM provisioning actor does not receive Hospital-only activation navigation. A visible item still does not authorize a request.

The integration tests verify identity reuse, role preservation, Hospital/OSM provisioning boundaries, idempotency, rollback, concurrency, activation claim/replay behavior, minimal activation projection, and audit secrecy. There are no tests for Patient roster read, Patient update, OSM assignment, delete/restore, or transfer because those operations do not exist.

## 5. Legacy Patient operational behavior

The pinned legacy code is useful evidence of historical workflow expectations, but it is not authority for the rewrite.

| Legacy behavior | Classification | Safe interpretation for Phase 6A |
| --- | --- | --- |
| `admin`, `doctor`, `helper`, and `osm` could open Patient pages through local-storage/client-side role checks. | **ARCHITECTURE-CONFLICTING LEGACY BEHAVIOR** | Operational Hospital/OSM involvement is evidenced. Current roles, capabilities, and scope must be resolved on the server. |
| Main Hospitals saw themselves and active children; sub-Hospitals saw their parent, siblings, and themselves. A user without a Hospital could receive all Hospitals. | **ARCHITECTURE-CONFLICTING LEGACY BEHAVIOR** | This explains historical network filtering. It does not authorize Hospital-network Patient access in the rewrite. |
| Patient list searched name/HN, searched raw National ID, filtered Hospital, coach, and PAM level, sorted columns, and used offset pagination with a nominal page size of 100. | **LEGACY BEHAVIOR ONLY** | Search/filter/pagination are useful UX evidence. Clinical/PAM and raw identity fields are not part of the proposed MVP projection. |
| The list showed name, phone, HN, raw ID card, Hospital, coach, and PAM level. | **LEGACY BEHAVIOR ONLY** | A future list should expose only approved minimal operational fields and must not expose raw identity secrets. |
| Patient detail loaded a broad profile, Hospital metadata, raw ID card, contact/address/emergency data, clinical values, screening/follow-up counts, appointments, goals, and links to clinical workflows. | **LEGACY BEHAVIOR ONLY** | The detail UX proves a list-to-detail workflow existed. Clinical and sensitive fields remain outside Phase 6. |
| Registration and import accepted an optional `coach_id`/`coach_name`, sometimes matched coach names flexibly, and wrote the value directly to the legacy profile. | **LEGACY BEHAVIOR ONLY** | This is evidence for an operational assignment concept, not proof of OSM semantics, authority, cardinality, or history. |
| The directory also loaded a separate deleted-Patient set, exposed an archive modal to non-OSM users, and offered restore/permanent-delete controls; deleted rows were filtered in the client using the legacy accessible-Hospital list. | **ARCHITECTURE-CONFLICTING LEGACY BEHAVIOR** | This is evidence that lifecycle and recovery were operational concerns. It does not define a rewritten deleted view, retention policy, or authorization boundary; B6.1 excludes it until those are decided. |
| Delete set legacy profile/user active flags to false; restore reversed them; permanent delete manually removed clinical rows, profile, and user. | **ARCHITECTURE-CONFLICTING LEGACY BEHAVIOR** | These operations conflate relationship closure, domain deactivation, account suspension, clinical retention, and hard deletion. They are deferred. |
| Legacy pages and API performed client-side checks and direct Supabase writes, including sequential writes and compensating deletes. | **ARCHITECTURE-CONFLICTING LEGACY BEHAVIOR** | Use the current server application boundary, policy, transaction, audit, and provider-reconciliation patterns instead. |
| Legacy registration/import generated or stored a Patient password from birth-date input and displayed it to an operator. | **ARCHITECTURE-CONFLICTING LEGACY BEHAVIOR** | Never reuse. Patient credentials remain Patient-owned under ADR-0004 and Phase 5B.2. |

## 6. Patient read-scope analysis

`patient:provision` and `patient:activation:issue` do not imply `patient:read`. A read policy must independently identify the capability, the actor relationship, the target Hospital context, the resource scope, and the projection.

| Actor | Current evidence | Accepted minimum read scope | Phase 6 status |
| --- | --- | --- | --- |
| `HOSPITAL` | Current provisioning and activation revalidate a direct active `OWNER`/`MEMBER` relationship. Profession is only classification. | `patient:read` over Patient–Hospital relationships whose `hospitalId` equals an active Hospital directly related to the actor. Require active `HOSPITAL` role, active direct `OWNER`/`MEMBER` membership, and an active target Hospital; do not use profession or parent/child metadata as authority. | **CONFIRMED CURRENT REQUIREMENT / ACCEPTED PHASE 6 CONTRACT.** This is the B6.1 implementation scope. |
| `OSM` | `OsmHospitalRelationship` is only OSM–Hospital association. Current implementation has no assignment model or post-provision read scope. Legacy coach/network filtering is not authoritative. | `ASSIGNED_PATIENTS` only: deny generic Patient-directory access until B6.2 creates the active first-class assignment. After B6.2, require active OSM role, active OSM–Hospital relationship, active assignment, and the same Patient–Hospital context; never grant Hospital-wide, area-wide, or clinical access by role. | **CONFIRMED CURRENT REQUIREMENT / ACCEPTED PHASE 6 CONTRACT.** OSM access is not part of the first B6.1 directory slice. |
| `PATIENT` | The accepted architecture defines Patient scope as normally `SELF`. Patient activation establishes interactive account access but no Patient portal exists. | `SELF` only: use the actor's server-resolved `personId` and an explicitly approved Patient projection. Do not expose another Patient or a cross-Hospital relationship by changing request parameters. | `SELF` is **CONFIRMED CURRENT REQUIREMENT**. Patient self-service UI/read projection is **DEFERRED** and is not required by B6.1. |
| `ADMIN` | The baseline positions Platform Admin in governance/control-plane work and outside normal Patient operations. | Deny routine operational `patient:read`. A future governance/reconciliation projection or break-glass operation must be separately named, scoped, audited, and approved. | **CONFIRMED CURRENT REQUIREMENT / ACCEPTED PHASE 6 CONTRACT.** No Admin roster branch is in B6.1. |

### Hospital owner/member and profession

**CONFIRMED CURRENT REQUIREMENT / ACCEPTED PHASE 6 CONTRACT:** Use the direct active `OWNER`/`MEMBER` relationship boundary already used by the current Patient provisioning and activation MVPs. An active `HOSPITAL` actor may read only the Patient–Hospital relationships for that same Hospital. `DOCTOR`, `NURSE`, `COORDINATOR`, and `OTHER` do not change Patient visibility. A future requirement may introduce narrower field or mutation rights, but it must not be hidden in UI filtering.

## 7. Patient directory and read-model contract

### 7.1 Accepted minimal projection

The first directory/detail slice should be a bounded operational projection, not a copy of the legacy profile or clinical dashboard.

| Projection field | Phase 6A position |
| --- | --- |
| Opaque `PatientProfile` identifier | **CONFIRMED CURRENT REQUIREMENT / ACCEPTED PHASE 6 CONTRACT**, only when required internally for navigation or a subsequent server command. |
| Opaque `PatientHospitalRelationship` identifier | **CONFIRMED CURRENT REQUIREMENT / ACCEPTED PHASE 6 CONTRACT**, only when required internally for navigation or a subsequent server command. |
| Display name from the resolved Person | **CONFIRMED CURRENT REQUIREMENT / ACCEPTED PHASE 6 CONTRACT**, subject to the normal Person data policy. |
| Hospital identity/context and Hospital-local HN for the authorized relationship | **CONFIRMED CURRENT REQUIREMENT / ACCEPTED PHASE 6 CONTRACT**; HN belongs to the relationship context, not Person. |
| Account status / activation summary / activation eligibility | **DEFERRED / EXCLUDED FROM B6.1**. Patient activation has a dedicated operational workflow; do not add these fields to the general directory by default. |
| Assignment summary | **DEFERRED** from B6.1; assignment scope is implemented in B6.2 and must not be a B6.1 dependency. |
| Phone, email, address, birth date, emergency contact, or other demographics | **DEFERRED / EXCLUDED FROM B6.1**. These fields are not rejected forever; each requires a concrete future operational workflow and field policy. |
| Screening, measurements, PAM, HbA1c, goals, appointments, follow-up, notes, or clinical summaries | **DEFERRED** to future clinical modules. |
| Raw National ID, `identityKeyHash`, provider subject, provider alias, password, activation token, or secret | **CONFIRMED CURRENT REQUIREMENT** to exclude; never return. |

### 7.2 Query behavior

**CONFIRMED CURRENT REQUIREMENT / ACCEPTED PHASE 6 CONTRACT:**

- Resolve the actor and authorized Hospital context on the server. Revalidate the target Hospital and relationship before the query is executed.
- Filter through `PatientHospitalRelationship.hospitalId`; do not use a browser-selected Hospital as authority and do not expand through parent/child metadata.
- Support bounded server-side name search and Hospital-local HN lookup. The B6.1 default is name search plus exact HN lookup; partial HN search is not identity resolution and is not required.
- Use bounded server-side pagination with stable deterministic ordering. Offset pagination or cursor/keyset pagination are both valid implementation choices for the MVP. Do not load the Patient table into application memory or use an unbounded `findMany` for the directory.
- Keep sorting to an explicit allow-list of safe operational fields. A sort choice must not alter or weaken the authorization predicate.
- Do not include deleted/archived records until a lifecycle contract defines what those states mean.
- B6.1 does not add an OSM/coach filter. Assignment filtering begins only in B6.2 through the accepted first-class assignment relationship and visibility predicate.
- Return safe empty/error states without revealing whether an unauthorized Patient exists.

The legacy list's name/HN search, Hospital filter, coach filter, sorting, and pagination are **LEGACY BEHAVIOR ONLY**. The bounded server-side shape above is the **CONFIRMED CURRENT REQUIREMENT / ACCEPTED PHASE 6 CONTRACT** for B6.1. The first implementation is Hospital-focused; it does not require a Patient self-service portal or an OSM assignment filter.

## 8. Exact identity lookup

Identity resolution and directory search are different operations.

**CONFIRMED CURRENT REQUIREMENT:** The existing identity service uses server-only HMAC lookup with the `thai-national-id` namespace. `Person.identityKeyHash` is unique, and raw Thai National ID is not persisted, logged, sent to the provider, or returned to the browser.

**CONFIRMED CURRENT REQUIREMENT / ACCEPTED PHASE 6 CONTRACT:** When an authorized B6.1 workflow must locate an exact identity, use a dedicated exact National ID input that:

1. validates the input on the server;
2. computes the existing HMAC lookup value;
3. applies the actor's already-authorized Patient/Hospital scope;
4. returns only the minimal operational projection; and
5. never uses name, birth date, phone, or HN as a substitute for exact identity resolution.

The current activation query is a working evidence pattern: exact HMAC National ID lookup, Hospital-scoped HN lookup, bounded results, and no raw identity in the projection. It must be reused carefully as infrastructure, not copied as a generic Patient roster policy.

If HN is not unique in the current schema, an HN lookup may return multiple candidates. That is a safe lookup result, not permission to guess the identity. A missing, invalid, or ambiguous identity must fail closed or enter an explicit trusted reconciliation workflow.

## 9. OSM ↔ Patient assignment analysis

### 9.1 Current state

**CONFIRMED CURRENT REQUIREMENT:** There is no Patient–OSM assignment model in the current schema or implementation. `OsmHospitalRelationship` has a unique `(userId, hospitalId)` pair and proves only direct association.

**LEGACY BEHAVIOR ONLY:** The legacy profile had an optional single `coach_id`; registration/import could select a coach, and a batch flow matched a coach by name and updated the profile directly. The code does not prove whether a coach was an OSM, doctor, care-team member, display label, or authorization boundary.

### 9.2 Accepted conceptual contract

**CONFIRMED CURRENT REQUIREMENT / ACCEPTED PHASE 6 CONTRACT:** Model assignment as a first-class relationship associated with a specific `PatientHospitalRelationship` and an OSM User. Do not add a `coach_id` to `PatientProfile` and do not overload `OsmHospitalRelationship`.

The conceptual relationship must preserve:

```text
Patient–Hospital relationship
OSM User
assignment lifecycle / active state
effective timestamps
created/changed attribution
history or closure information
```

This is an accepted domain contract, not a final schema design. Phase 6A does not finalize table names, columns, indexes, or migrations.

### 9.3 Accepted assignment invariants

| Invariant | Accepted Phase 6 contract |
| --- | --- |
| Requiredness | Patient provisioning remains valid without an OSM assignment. Assignment is a separate optional operational step; no circular provisioning dependency exists. |
| Assignment authority | Only an active `HOSPITAL` actor with direct active `OWNER` membership in the same Hospital and explicit `patient:assign-osm` capability may assign, unassign, or reassign. Hospital `MEMBER` is not authorized in the first slice. An OSM cannot self-assign by role or relationship alone. |
| Cardinality | At most one active OSM per `PatientHospitalRelationship`. One OSM may have many Patients. A Patient may have different active OSMs at different Hospitals. |
| Hospital context | Assignment attaches to the Hospital-specific Patient relationship, never globally to `PatientProfile`. The OSM must also have an active `OsmHospitalRelationship` to that same Hospital. |
| History | Reassignment/unassignment must preserve reconstructable history. The clean conceptual operation is to close/end the previous active assignment and create a new active state where appropriate; do not overwrite the previous OSM without retaining history. |
| Access effect | Active assignment grants only operational `ASSIGNED_PATIENTS` scope for the matching Patient–Hospital context. It does not grant Hospital-wide read, unrestricted Patient-field update, or clinical authority. |
| Suspension or relationship loss | If the OSM becomes inactive/suspended or loses the active Hospital relationship, Patient access fails immediately from authoritative server state. Do not auto-reassign, silently select another OSM, or introduce a speculative reassignment job. |
| Patient–Hospital relationship change | Do not silently move an assignment across Hospitals or make a new relationship inherit another Hospital's assignment. Assignment state must be handled explicitly by a future relationship/lifecycle operation. |

Until B6.2 is implemented, `Role.OSM + OsmHospitalRelationship` must not authorize generic Patient-directory read. After B6.2, only the accepted active-assignment predicate authorizes `ASSIGNED_PATIENTS` read; assignment never authorizes clinical work by itself.

## 10. Patient update and field ownership

There is no safe generic `patient:update` payload in the current model. The future operation must be command/field-specific and must not accept an arbitrary object patch.

| Data area | Current schema/evidence | Phase 6 position |
| --- | --- | --- |
| Core identity | `Person.identityKeyHash`, `givenName`, and `familyName`; provisioning fills missing names and rejects conflicting names. | Identity hash is never edited by a normal Patient update. Name correction requires a future explicit identity/reconciliation requirement. **DEFERRED / REQUIREMENTS REQUIRED.** |
| Demographic/contact information | `PatientProfile` currently has no demographic/contact columns. Legacy has many fields, but they are not accepted. | Do not invent editable fields. Field allow-list and ownership remain future B6.3 requirements. **DEFERRED / REQUIREMENTS REQUIRED.** |
| Hospital-local information | `PatientHospitalRelationship.hospitalNumber` is optional and scoped to Hospital. Provisioning may fill a missing value and rejects a conflicting value. | HN remains Hospital-local. Do not edit HN or introduce a new uniqueness invariant in B6.1; normalization, mutation ownership, and uniqueness remain future B6.3 requirements. **DEFERRED / REQUIREMENTS REQUIRED.** |
| Operational assignment | No current field/model. | Assignment is a separate first-class operation and audit boundary; it must not be a Patient profile field. **CONFIRMED CURRENT REQUIREMENT / ACCEPTED PHASE 6 CONTRACT** for B6.2. |
| Clinical data | No current Patient clinical model; Phase 5 explicitly excludes it. | Screening, measurement, care-plan, appointment, follow-up, note, and reporting updates are **DEFERRED** to future clinical modules. |

Actor defaults for the current Phase 6 scope:

- `HOSPITAL`: no Patient profile mutation is part of B6.1. Future B6.3 commands may update only explicitly approved fields within a directly authorized Hospital relationship.
- `OSM`: no Patient update is authorized by assignment; assignment is operational scope and not clinical or unrestricted field authority.
- `PATIENT`: no self-edit is part of the first implementation. If approved later, use an explicit self-scoped allow-list and keep identity, HN, assignment, and clinical fields separate.
- `ADMIN`: no routine Patient update. Governance or reconciliation changes require a separately named, audited operation.

`patient:update` remains **DEFERRED / REQUIREMENTS REQUIRED**. It is not implementation-ready until the field allow-list, actor ownership, scope, conflict behavior, and audit metadata are explicitly approved.

## 11. Patient delete, restore, and deactivation

**LEGACY BEHAVIOR ONLY:** Legacy "delete" set profile/user active flags false, "restore" reversed them, and "permanent delete" manually removed clinical rows and then profile/user rows. The UI excluded OSM using a client-side role check.

That behavior does not define one operation. It mixes at least:

- closing a Patient–Hospital relationship;
- deactivating or archiving a Patient domain record;
- suspending interactive User access;
- revoking or detaching provider authentication;
- retaining or removing clinical history;
- preserving Person identity and other roles; and
- retaining audit history.

The current rewrite makes these distinctions material: `Person` and `User` are reused across roles, `Person` and audit relationships restrict unsafe hard deletion, `PatientProfile` has no lifecycle enum, and `User.status` is account state rather than Patient domain state.

**CONFIRMED CURRENT REQUIREMENT / ACCEPTED PHASE 6 CONTRACT:** Do not add Patient delete, restore, permanent-delete, or generic deactivation in Phase 6. Do not add `patient:delete` or `patient:restore` capabilities. Future relationship-close/archive/suspend semantics remain a separate requirements decision.

This is **DEFERRED**, not an accepted statement that Patients can never be deactivated.

## 12. Patient transfer and Hospital change

**CONFIRMED CURRENT REQUIREMENT:** The current schema allows multiple Patient–Hospital relationships and does not define a primary Hospital, relationship status, or transfer operation.

Therefore:

```text
transfer ≠ delete old relationship + add new relationship
```

Possible business meanings include:

- add another Hospital relationship;
- close the previous relationship;
- change a primary/display relationship;
- refer the Patient without changing affiliation; or
- transfer operational ownership and separately resolve OSM assignment.

The legacy single-Hospital profile is **LEGACY BEHAVIOR ONLY** and cannot override the current multi-relationship schema.

The future business meaning, relationship lifecycle, HN effect, assignment effect, audit event, and historical retention still require explicit requirements before a transfer operation exists. **CONFIRMED CURRENT REQUIREMENT / ACCEPTED PHASE 6 CONTRACT:** no transfer service, schema, UI, or capability in Phase 6; this is **DEFERRED**.

## 13. Parent/child Hospital authority

| Layer | Finding |
| --- | --- |
| Legacy behavior | Parent/child metadata expands the visible/selected Hospital network and therefore expands Patient filtering. This is **LEGACY BEHAVIOR ONLY**. |
| Current accepted architecture | `parentHospitalId` is metadata. Current workforce, Patient provisioning, and Patient activation policies use direct active relationships and do not grant hierarchy bypass. This is **CONFIRMED CURRENT REQUIREMENT**. |
| Phase 6 accepted contract | A Hospital may read or mutate Patients only through its own accepted direct scope. A parent Hospital does not automatically see or manage child-Hospital Patients, and a child does not automatically see its parent or siblings. This is a **CONFIRMED CURRENT REQUIREMENT / ACCEPTED PHASE 6 CONTRACT**. |
| Scope outside Patient access | Any future non-Patient Hospital-network authority remains outside this contract and requires its own explicit requirement. It does not weaken the direct Patient scope. |

The owner decision resolves Patient authorization without rewriting accepted ADR history. If a future non-Patient hierarchy authority materially changes an accepted architectural boundary, record a new/superseding ADR before implementation.

## 14. Capability and authorization contract

### 14.1 Minimum vocabulary

Existing capabilities are not expanded by this document:

| Capability | Status | Existing meaning |
| --- | --- | --- |
| `patient:provision` | **CONFIRMED CURRENT REQUIREMENT** *(implemented)* | Create/reuse the minimum Patient identity, role, profile, and Hospital relationship under the Phase 5B provisioning policy. |
| `patient:activation:issue` | **CONFIRMED CURRENT REQUIREMENT** *(implemented)* | Issue a Patient activation credential for an eligible Patient in a direct Hospital scope. |

The next slices use the following accepted vocabulary:

| Capability | Status | Boundary |
| --- | --- | --- |
| `patient:read` | **CONFIRMED CURRENT REQUIREMENT / ACCEPTED PHASE 6 CONTRACT** | B6.1 direct Hospital directory/detail projection; later B6.2 assigned OSM scope. |
| `patient:assign-osm` | **CONFIRMED CURRENT REQUIREMENT / ACCEPTED PHASE 6 CONTRACT** | B6.2 assign, unassign, and reassign within the same Hospital under active Hospital `OWNER` authority. |
| `patient:update` | **DEFERRED / REQUIREMENTS REQUIRED** | Future B6.3 explicit field commands only; no unrestricted patch. |

Do not add clinical, appointment, screening, measurement, reporting, referral, transfer, delete, restore, or generic RBAC capabilities in Phase 6A. A separate `patient:unassign-osm` capability is not needed because the accepted B6.2 authority covers assign, unassign, and reassign in the same Hospital context.

### 14.2 Accepted policy matrix for Phase 6

| Actor | `patient:read` default | `patient:update` default | Assignment default |
| --- | --- | --- | --- |
| `HOSPITAL` | Direct active `OWNER`/`MEMBER` relationship to the same active Hospital only; no hierarchy or profession expansion. | No B6.1 profile update; future B6.3 fields require explicit requirements. | Active direct Hospital `OWNER` with `patient:assign-osm`; `MEMBER` is not authorized in B6.2. |
| `OSM` | Deny generic directory access in B6.1; after B6.2, active assignment in the matching Patient–Hospital context only. | Deny; assignment is not unrestricted field or clinical authority. | OSM cannot assign itself by role or relationship. |
| `PATIENT` | `SELF` only at the architecture level; Patient-facing projection/UI is deferred. | No fields in the first implementation. | Deny. |
| `ADMIN` | Deny routine operational read; future governance projection only. | Deny routine operational update; future reconciliation operation only. | Deny routine assignment. |

Every future operation must resolve the authenticated actor server-side, parse input, re-read authoritative relationships and target state immediately before persistence, apply the capability and scope policy, and return a sanitized result. Missing, inactive, ambiguous, or conflicting state must deny or enter explicit reconciliation.

## 15. Audit and data-integrity boundaries

### 15.1 Reads

Routine directory reads do not need a transaction or an audit row merely because they are reads. They do need a scoped database query whose authorization predicate cannot be widened by client input. Read auditing is an owner/product decision and is not added by Phase 6A.

### 15.2 Assignment mutations

The accepted B6.2 assignment operation should conceptually be:

```text
resolve actor
+ verify capability and direct scope
+ verify active Patient–Hospital relationship
+ verify active OSM–Hospital relationship
+ enforce assignment cardinality/lifecycle
+ create/close assignment state
+ write the success audit event
= one local consistency-critical operation
```

Provider authentication I/O is not part of this operation. Use a Prisma transaction only for the local records that must change together.

Every successful B6.2 assignment state change must be audited. The implementation may use the following bounded event vocabulary:

- `patient.osm_assigned`
- `patient.osm_unassigned`
- `patient.osm_reassigned`, or an equivalent bounded transition representation

Minimum safe metadata should be limited to server-resolved actor ID, resource type/opaque resource ID, Hospital/relationship IDs, OSM User ID where needed, outcome, and a bounded field/category marker. Do not log raw National ID, `identityKeyHash`, HN value, phone, email, password, activation token, provider alias/subject, provider secret, or clinical payload.

The existing [audit service](../../src/modules/audit/services/audit-service.ts) accepts a transaction-compatible Prisma client, and the [audit schema](../../src/modules/audit/schemas/audit-schemas.ts) rejects sensitive metadata keys. B6.2 must still choose safe values; schema validation is not permission to log sensitive data.

### 15.3 Update mutations

An approved Patient update should keep the local field write and its success audit event atomic. Identity/provider changes are not part of Patient profile management; if a future operation crosses the provider boundary, keep provider I/O outside the local transaction and use the established compensation/reconciliation contract.

## 16. Phase 6B slices and status

| Slice | Smallest accepted scope | Status |
| --- | --- | --- |
| **Phase 6B.1 — Patient Directory / Minimal Detail** | Hospital-focused, server-authorized Patient directory/detail projection; bounded name/HN search; exact identity lookup only through HMAC boundary when needed; Hospital-local HN context; bounded server-side pagination with stable deterministic ordering; offset or cursor/keyset allowed; no account/activation status, clinical data, raw identity, deletion view, hierarchy expansion, assignment filter, or Patient self-service portal. | **IMPLEMENTATION READY** |
| **Phase 6B.2 — OSM ↔ Patient Assignment** | Following B6.1: first-class Hospital-specific assignment; active Hospital `OWNER` only; assign/unassign/reassign with reconstructable history; server policy, transaction, audit, and assigned-Patient read scope. | **IMPLEMENTATION READY AFTER B6.1** |
| **Phase 6B.3 — Patient Profile Management** | Only explicitly approved identity-adjacent/demographic/contact/HN field commands, with actor-specific ownership and audit. | **DEFERRED / REQUIREMENTS REQUIRED** |
| Delete/restore/deactivation | No implementation in Phase 6. | **DEFERRED** until lifecycle and retention semantics are confirmed. |
| Transfer/Hospital change | No implementation in Phase 6. | **DEFERRED / REQUIREMENTS REQUIRED**; no implicit delete-old/add-new behavior. |

No Phase 6B slice includes screening, measurements, PAM, HbA1c, care plans, goals, appointments, visits, follow-up, notes, referrals, clinical reporting, queues, workers, Redis, or background jobs.

## 17. Accepted owner decisions and deferred boundaries

| Decision | Evidence | Accepted Phase 6 contract / deferred boundary | Risk if wrong | Status |
| --- | --- | --- | --- | --- |
| Hospital Patient read scope | Current provisioning/activation use direct active `OWNER`/`MEMBER`; no read capability exists; hierarchy is metadata. | Active `HOSPITAL` `OWNER`/`MEMBER` may read only Patient relationships in that same active Hospital. Profession does not change scope. | Overexposure if the predicate is widened beyond the direct Hospital relationship. | **ACCEPTED — B6.1** |
| OSM Patient read scope | OSM–Hospital association is not Patient scope; no assignment model exists; legacy coach/network behavior is not authoritative. | Generic OSM directory read is denied in B6.1. After B6.2, read is limited to `ASSIGNED_PATIENTS` in the matching Patient–Hospital context. | Hospital-wide, area-wide, or cross-Hospital exposure. | **ACCEPTED — B6.2** |
| OSM assignment requiredness and semantics | Phase 5 provisioning has no assignment model or requirement; legacy `coach_id` does not prove semantics. | Provisioning remains valid without assignment. B6.2 adds a separate first-class Hospital-specific assignment and never makes assignment clinical authority. | Circular provisioning, wrong ownership, or cross-Hospital assignment. | **ACCEPTED — B6.2** |
| Assignment authority | No current assignment capability exists; the owner accepted a conservative Hospital authority. | Active `HOSPITAL` `OWNER` with direct active membership in the same Hospital and `patient:assign-osm` may assign, unassign, and reassign. `MEMBER` and OSM self-assignment are denied. | Unauthorized assignment or privilege escalation. | **ACCEPTED — B6.2** |
| Assignment cardinality and history | Legacy shows one current coach, but the current schema permits multiple Hospital relationships. | At most one active OSM per `PatientHospitalRelationship`; one OSM may have many Patients; close/end prior states so history remains reconstructable. | Shared or lost assignments and irrecoverable operational history. | **ACCEPTED — B6.2** |
| OSM suspension or Hospital relationship loss | Current ActorContext already exposes authoritative active relationship state; no reassignment job exists. | Patient access fails immediately when OSM or its Hospital relationship is inactive. Do not auto-reassign or silently select another OSM. | Continued access after suspension or hidden reassignment. | **ACCEPTED — B6.2** |
| Hospital hierarchy authority | Legacy expands parent/child visibility; current schema/policies treat hierarchy as metadata. | Parent, child, sibling, and network relationships do not grant Patient authority. Phase 6 uses direct Hospital scope only. | Cross-Hospital disclosure or unauthorized mutation. | **ACCEPTED — B6.1/B6.2** |
| Patient self access | Baseline defines Patient scope as normally `SELF`; no Patient portal exists. | Preserve `SELF` as the architecture rule, but do not require Patient self-service UI or projection in B6.1. | Unintended cross-Patient access or unnecessary B6.1 expansion. | **ACCEPTED SCOPE; SELF UI DEFERRED** |
| Admin routine Patient read | Baseline places Admin outside normal Patient operations. | Deny routine operational read. Future governance/reconciliation access must use a separately named, scoped, audited operation. | Platform-wide sensitive-data exposure. | **ACCEPTED — NO ADMIN ROSTER** |
| Minimum B6.1 projection | Current activation projection is narrow; legacy detail is broad and clinical; current `PatientProfile` is minimal. | `displayName`, Hospital identity/context, Hospital-local HN, and opaque `PatientProfile`/`PatientHospitalRelationship` identifiers only when required internally. Exclude account/activation status by default. | Privacy overexposure or accidental coupling to activation workflow. | **ACCEPTED — B6.1** |
| B6.1 search and identity lookup | Existing activation query proves HMAC National-ID lookup and Hospital-scoped HN lookup; legacy search is broader and unsafe. | Bounded server-side name search and Hospital-local HN lookup. Exact National-ID resolution may reuse server-side HMAC when needed; no raw ID persistence/return or weak identity substitute. | Identity confusion or raw identity disclosure. | **ACCEPTED — B6.1** |
| B6.1 pagination and sorting | Legacy uses offset pagination; current architecture requires bounded server queries. | Use bounded server-side pagination with stable deterministic ordering; offset or cursor/keyset are both allowed. Sorting uses an explicit allow-list and cannot change authorization. | Unbounded memory/query cost or unstable page results. | **ACCEPTED — B6.1** |
| Patient self-edit/profile management | `PatientProfile` has no editable fields; Phase 5 deferred profile editing. | No self-edit or generic `patient:update` in the first implementation. B6.3 requires explicit field, ownership, conflict, and audit requirements. | Unauthorized identity, HN, demographic, or clinical changes. | **DEFERRED — B6.3 REQUIREMENTS** |
| HN mutation and uniqueness | HN is optional and not globally/per-Hospital unique in the current schema. | HN remains Hospital-local. Do not edit HN or add a new uniqueness invariant in B6.1; defer normalization/mutation/uniqueness to B6.3 requirements. | Duplicate or misassigned HN. | **DEFERRED — B6.3 REQUIREMENTS** |
| Patient delete/restore/deactivation | Legacy conflates soft delete, restore, account state, and hard deletion; current schema has no Patient lifecycle. | No delete, restore, permanent-delete, or generic deactivation capability in Phase 6. Future lifecycle semantics remain open. | Irreversible data loss or broken multi-role identity/audit history. | **DEFERRED** |
| Patient transfer/Hospital change | Current Patient–Hospital relationship is many-capable and has no status/primary/transfer model. | No transfer operation in Phase 6; never implement it as implicit delete-old/add-new. Future business semantics remain open. | Lost relationship history, HN confusion, or accidental assignment movement. | **DEFERRED** |

## 18. Explicitly deferred clinical and lifecycle requirements

The following are intentionally not specified as Phase 6 access requirements:

- screening and screening history;
- measurements, blood sugar, HbA1c, PAM, zones, and clinical summaries;
- care plans, goals, notes, visits, appointments, follow-up, referrals, and clinical reporting;
- clinical assignment or clinical authority;
- Patient self-assessment and health-data submission;
- Patient dashboard or clinical portal;
- delete, restore, permanent deletion, archival, merge, deduplication, and account recovery;
- Patient transfer, Hospital affiliation change, primary Hospital, referral, and operational ownership transfer;
- OSM geographic/area scope, multi-OSM care teams, and background reassignment;
- notification delivery, LIFF workflow, native client, speculative `/api/v1`, queues, workers, Redis, and background jobs.

Legacy evidence may inform future domain relationships, but it must not promote any of these items into Phase 6 requirements.

## 19. Acceptance criteria and safe next actions

Phase 6A is accepted. No owner decision blocks B6.1 or B6.2. The next agent may proceed with the following bounded implementation handoff:

### 19.1 B6.1 Patient Directory / Minimal Detail

- Enforce active `HOSPITAL` role, active direct `OWNER`/`MEMBER` membership, active Hospital, and `PatientHospitalRelationship.hospitalId` equality on the server.
- Do not expand the predicate through parent/child/sibling Hospital metadata or profession.
- Return only `displayName`, Hospital identity/context, Hospital-local HN, and opaque PatientProfile/relationship identifiers when internally required.
- Exclude account status, activation status/expiry/eligibility, raw identity/authentication data, demographics/contact data, clinical data, deleted views, assignment filters, and Patient self-service UI.
- Implement bounded server-side name search and Hospital-local HN lookup with explicit input bounds.
- Use bounded server-side pagination with stable deterministic ordering; offset or cursor/keyset are both acceptable. Sorting must use an explicit allow-list and never alter authorization.
- Reuse the existing server-only HMAC identity boundary for exact National-ID lookup only when a concrete B6.1 workflow needs it; never persist or return raw National ID.
- Cover allow/deny paths, cross-Hospital isolation, inactive actor/relationship states, ambiguous identity, projection redaction, and pagination/sort bounds.

### 19.2 B6.2 OSM ↔ Patient Assignment

B6.2 follows B6.1 and is implementation-ready under the accepted contract:

- Keep provisioning valid without assignment and keep assignment separate from Patient creation.
- Require active Hospital `OWNER`, direct active membership in the same Hospital, and `patient:assign-osm` for assign/unassign/reassign.
- Bind the first-class assignment to `PatientHospitalRelationship`, not `PatientProfile` or legacy `coach_id`.
- Enforce at most one active OSM per Patient–Hospital relationship, active OSM–Hospital association, and reconstructable assignment history.
- Deny OSM Patient access immediately when the OSM or its Hospital relationship becomes inactive; do not auto-reassign.
- Keep assignment operational only; it does not authorize unrestricted Patient updates or clinical work.
- Persist consistency-critical assignment state and its success audit event atomically with server-side revalidation and concurrency/idempotency behavior.
- Cover owner/member/OSM denial paths, cross-Hospital isolation, duplicate active assignment conflicts, reassignment history, suspension/relationship loss, concurrent mutation, audit atomicity, and safe metadata.

### 19.3 Deferred work

- B6.3 cannot start until explicit requirements define field ownership, name correction, demographics/contact fields, HN mutation/normalization/uniqueness, Patient self-edit, OSM edit rights, conflict behavior, and audit behavior. No generic update payload is permitted.
- Delete/restore/deactivation, transfer/Hospital change, Patient self-service expansion, and clinical modules remain outside the accepted Phase 6 implementation scope.
- If implementation exposes a material contradiction with an accepted ADR or architecture baseline, draft a new/superseding ADR before changing that boundary. Phase 6A itself does not rewrite accepted ADR history.

**Handoff conclusion:** Phase 6A is accepted. Phase 6B.1 is **IMPLEMENTATION READY** for the Hospital-focused Patient Directory / Minimal Detail slice. Phase 6B.2 is **IMPLEMENTATION READY AFTER B6.1** under the accepted first-class assignment contract. Phase 6B.3 is **DEFERRED / REQUIREMENTS REQUIRED**.
