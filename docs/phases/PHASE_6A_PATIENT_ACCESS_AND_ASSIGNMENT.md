# Phase 6A — Patient Access and Assignment Requirement Closure

**Status:** Architecture and requirements handoff. No Phase 6B product code is implemented by this document.

**Date:** 2026-08-15

**Scope:** Define the smallest safe contract for Patient read access, operational assignment, and future Patient management before implementing Patient operations. Clinical workflows, lifecycle mutations, and speculative transport infrastructure remain outside this phase.

**Result:** Phase 6B is not implementation-ready until the blocking owner decisions in Section 17 are accepted. The proposed defaults below are engineering recommendations, not confirmed product requirements.

## 1. Phase status and objective

Phase 5 closed Patient provisioning and optional first-time account activation. It did not define the authority to read, update, assign, transfer, deactivate, or restore a Patient. Phase 6A closes those requirements or keeps them explicitly open.

The classification used throughout this document is:

| Classification | Meaning |
| --- | --- |
| **CONFIRMED CURRENT REQUIREMENT** | Directly supported by current requirements, accepted ADRs, or the current architecture baseline. |
| **LEGACY BEHAVIOR ONLY** | Observed in the pinned legacy repository; useful domain evidence, but not accepted for the rewrite. |
| **ARCHITECTURE-CONFLICTING LEGACY BEHAVIOR** | Legacy behavior that the accepted rewrite architecture prohibits. It must not be copied. |
| **PROPOSED MVP CONTRACT** | A minimal, fail-closed engineering recommendation awaiting product acceptance. |
| **OWNER CONFIRMATION REQUIRED** | A business, privacy, or authority decision that cannot be inferred safely. |
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

| Actor | Current evidence | Proposed minimum read scope | Classification and blocker |
| --- | --- | --- | --- |
| `HOSPITAL` | Current provisioning and activation revalidate a direct active `OWNER`/`MEMBER` relationship. No Patient read capability exists. Profession is only classification. | `patient:read` over Patient–Hospital relationships whose `hospitalId` equals an active Hospital directly related to the actor. Start with direct active `OWNER`/`MEMBER`; do not use profession or parent/child metadata as authority. | **PROPOSED MVP CONTRACT**; Hospital read-scope acceptance blocks B6.1. |
| `OSM` | `OsmHospitalRelationship` is only OSM–Hospital association. Current implementation has no assignment model or post-provision read scope. Legacy coach/network filtering is not authoritative. | Deny routine Patient read until an active first-class Patient–OSM assignment exists. If assignment is accepted, use `ASSIGNED_PATIENTS` scoped to the same Patient–Hospital relationship and active OSM–Hospital association; do not grant Hospital-wide, area-wide, or clinical access by role. | **OWNER CONFIRMATION REQUIRED**; blocks OSM read and B6.2. The deny default is **PROPOSED MVP CONTRACT**. |
| `PATIENT` | The accepted architecture defines Patient scope as normally `SELF`. Patient activation establishes interactive account access but no Patient portal exists. | `SELF` only: the actor's server-resolved `personId` and explicitly approved Patient projection. Do not expose another Patient or a cross-Hospital relationship by changing request parameters. | `SELF` is **CONFIRMED CURRENT REQUIREMENT**; the minimum self projection is **OWNER CONFIRMATION REQUIRED** and blocks self-detail implementation. |
| `ADMIN` | The baseline positions Platform Admin in governance/control-plane work and outside normal Patient operations. | Deny routine operational `patient:read`. A future governance/reconciliation projection or break-glass operation must be separately named, scoped, audited, and approved. | The governance boundary is **CONFIRMED CURRENT REQUIREMENT**; routine-deny is **PROPOSED MVP CONTRACT**. It blocks an Admin roster branch, not Hospital/Patient B6.1 if accepted separately. |

### Hospital owner/member and profession

**PROPOSED MVP CONTRACT:** Use the same direct active `OWNER`/`MEMBER` relationship boundary already used by the reversible provisioning and activation MVPs, because it is the smallest existing server-resolved Hospital scope. Do not infer a broader read permission from the fact that an actor is a Hospital `OWNER`, and do not infer a narrower or broader permission from `DOCTOR`, `NURSE`, `COORDINATOR`, or `OTHER` without a confirmed requirement.

If product requirements distinguish owner/member or profession, that is a new capability-policy decision; it must not be hidden in UI filtering.

## 7. Patient directory and read-model contract

### 7.1 Proposed minimal projection

The first directory/detail slice should be a bounded operational projection, not a copy of the legacy profile or clinical dashboard.

| Projection field | Phase 6A position |
| --- | --- |
| Opaque PatientProfile/relationship identifier | **PROPOSED MVP CONTRACT**, only where needed for navigation or a subsequent server command. |
| Display name from the resolved Person | **PROPOSED MVP CONTRACT**, subject to the normal Person data policy. |
| Hospital identity and Hospital-local HN for the authorized relationship | **PROPOSED MVP CONTRACT**; HN belongs to the relationship context, not Person. |
| Account status / activation summary | **PROPOSED MVP CONTRACT** only when needed for operational activation support; reuse the existing safe status projection. Never expose provider identifiers or tokens. |
| Assignment summary | **DEFERRED** until B6.2 defines assignment and read authority. |
| Phone, email, address, birth date, emergency contact, or other demographics | **OWNER CONFIRMATION REQUIRED**; omit from the first roster/detail projection unless a concrete workflow requires each field. |
| Screening, measurements, PAM, HbA1c, goals, appointments, follow-up, notes, or clinical summaries | **DEFERRED** to future clinical modules. |
| Raw National ID, `identityKeyHash`, provider subject, provider alias, password, activation token, or secret | **ARCHITECTURE-CONFLICTING** to expose; never return. |

### 7.2 Query behavior

**PROPOSED MVP CONTRACT:**

- Resolve the actor and authorized Hospital context on the server. Revalidate the target Hospital and relationship before the query is executed.
- Filter through `PatientHospitalRelationship.hospitalId`; do not use a browser-selected Hospital as authority and do not expand through parent/child metadata.
- Support bounded server-side name search and Hospital-local HN lookup. The safest first default is name search plus exact HN lookup; partial HN search is not identity resolution and should not be added without a concrete UX need.
- Use bounded cursor/keyset pagination with a stable order. Do not load the Patient table into application memory or use an unbounded `findMany` for the directory.
- Keep sorting to an allow-list of safe operational fields. A sort choice must not alter the authorization predicate.
- Do not include deleted/archived records until a lifecycle contract defines what those states mean.
- Do not add an OSM/coach filter until a first-class assignment relationship exists and its visibility semantics are accepted.
- Return safe empty/error states without revealing whether an unauthorized Patient exists.

The legacy list's name/HN search, Hospital filter, coach filter, sorting, and pagination are **LEGACY BEHAVIOR ONLY**. The bounded server-side shape above is a **PROPOSED MVP CONTRACT**.

## 8. Exact identity lookup

Identity resolution and directory search are different operations.

**CONFIRMED CURRENT REQUIREMENT:** The existing identity service uses server-only HMAC lookup with the `thai-national-id` namespace. `Person.identityKeyHash` is unique, and raw Thai National ID is not persisted, logged, sent to the provider, or returned to the browser.

**PROPOSED MVP CONTRACT:** When an authorized operator must locate an exact identity, use a dedicated exact National ID input that:

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

### 9.2 Conceptual contract if assignment is accepted

**PROPOSED MVP CONTRACT:** Model assignment as a first-class relationship associated with a specific `PatientHospitalRelationship` and an OSM User. Do not add a `coach_id` to `PatientProfile` and do not overload `OsmHospitalRelationship`.

The conceptual relationship may need, subject to owner decisions:

```text
Patient–Hospital relationship
OSM User
assignment lifecycle / active state
effective timestamps
created/changed attribution
history or closure information
```

This is a conceptual evaluation only. Phase 6A does not finalize table names, columns, indexes, or migrations.

### 9.3 Questions that remain owner decisions

| Question | Evidence and recommended default |
| --- | --- |
| Is assignment required? | Current Phase 5 does not require it. **PROPOSED:** Patient provisioning remains valid without assignment; assignment is a later optional operation. **OWNER CONFIRMATION REQUIRED** for B6.2. |
| Who may assign, unassign, or reassign? | No current capability exists. **PROPOSED:** a directly scoped active Hospital actor with an explicit assignment capability; use Hospital `OWNER` as the conservative first default until delegation is confirmed. OSM must not grant assignment authority to itself by role alone. **OWNER CONFIRMATION REQUIRED.** |
| May one Patient have multiple OSMs? | Legacy shows one current `coach_id`, but that is weak evidence. **PROPOSED:** at most one active OSM per Patient–Hospital relationship for the first slice; one OSM may have many Patients; preserve ended assignment history. **OWNER CONFIRMATION REQUIRED.** |
| Is assignment Hospital-specific? | Multiple Patient–Hospital relationships are supported today. **PROPOSED:** yes; assignment attaches to the Patient–Hospital relationship, so the same human may have different OSM assignments at different Hospitals. **OWNER CONFIRMATION REQUIRED.** |
| Is historical assignment required? | Audit is already a current boundary, but assignment history is not modeled. **PROPOSED:** close the previous assignment and create a new state; do not overwrite history if reassignment is accepted. **OWNER CONFIRMATION REQUIRED.** |
| Does assignment grant OSM read/update access? | Current association does not. **PROPOSED:** active assignment is necessary for `ASSIGNED_PATIENTS` read/update, but never grants clinical authority by itself. **OWNER CONFIRMATION REQUIRED.** |
| What happens when an OSM is suspended or leaves? | No current lifecycle operation exists. **PROPOSED:** deny access immediately from active server state; do not silently transfer Patients or invent a reassignment job. An explicit reassign/closure workflow is required. **OWNER CONFIRMATION REQUIRED.** |
| What happens when a Patient–Hospital relationship changes? | Relationship has no lifecycle/status today. **PROPOSED:** do not silently preserve or move an assignment across Hospitals; resolve assignment state explicitly when a relationship is closed or added. **OWNER CONFIRMATION REQUIRED.** |

Until these decisions are accepted, `Role.OSM + OsmHospitalRelationship` must not authorize Patient read, update, assignment, or clinical work.

## 10. Patient update and field ownership

There is no safe generic `patient:update` payload in the current model. The future operation must be command/field-specific and must not accept an arbitrary object patch.

| Data area | Current schema/evidence | Phase 6 position |
| --- | --- | --- |
| Core identity | `Person.identityKeyHash`, `givenName`, and `familyName`; provisioning fills missing names and rejects conflicting names. | Identity hash is never edited by a normal Patient update. Name correction needs an explicit identity/reconciliation policy. **OWNER CONFIRMATION REQUIRED.** |
| Demographic/contact information | `PatientProfile` currently has no demographic/contact columns. Legacy has many fields, but they are not accepted. | Do not invent editable fields. Approve an explicit allow-list and owner per field before B6.3. **OWNER CONFIRMATION REQUIRED.** |
| Hospital-local information | `PatientHospitalRelationship.hospitalNumber` is optional and scoped to Hospital. Provisioning may fill a missing value and rejects a conflicting value. | Treat HN as a separate Hospital-local operation with explicit normalization/uniqueness semantics. **PROPOSED:** directly scoped Hospital authority only; no generic Patient self-edit or OSM edit by default. **OWNER CONFIRMATION REQUIRED.** |
| Operational assignment | No current field/model. | Assignment must be a separate operation and audit boundary; it must not be a Patient profile field. **DEFERRED** until B6.2. |
| Clinical data | No current Patient clinical model; Phase 5 explicitly excludes it. | Screening, measurement, care-plan, appointment, follow-up, note, and reporting updates are **DEFERRED** to future clinical modules. |

Actor defaults, pending explicit field decisions:

- `HOSPITAL`: may update only approved fields within a directly authorized Hospital relationship. Existing membership does not authorize every future field.
- `OSM`: no update until assignment scope and field ownership are accepted; assignment must not be treated as clinical authority.
- `PATIENT`: no self-edit fields are accepted in Phase 6A. If approved later, use an explicit self-scoped allow-list and keep identity, HN, assignment, and clinical fields separate.
- `ADMIN`: no routine Patient update. Governance or reconciliation changes require a separately named, audited operation.

`patient:update` is therefore a **PROPOSED MVP CONTRACT** vocabulary item only. It is not implementation-ready until the field allow-list, actor ownership, scope, conflict behavior, and audit metadata are accepted.

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

**PROPOSED MVP CONTRACT:** Do not add Patient delete, restore, permanent-delete, or generic deactivation in Phase 6. Do not add `patient:delete` or `patient:restore` capabilities. Prefer a future explicit relationship-close/archive/suspend model only after retention, audit, authentication, clinical-history, and multi-Hospital semantics are confirmed.

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

**OWNER CONFIRMATION REQUIRED:** Define the business meaning, relationship lifecycle, HN effect, assignment effect, audit event, and historical retention before a transfer operation exists. **PROPOSED MVP CONTRACT:** no transfer service, schema, UI, or capability in Phase 6; this is **DEFERRED**.

## 13. Parent/child Hospital authority

| Layer | Finding |
| --- | --- |
| Legacy behavior | Parent/child metadata expands the visible/selected Hospital network and therefore expands Patient filtering. This is **LEGACY BEHAVIOR ONLY**. |
| Current accepted architecture | `parentHospitalId` is metadata. Current workforce, Patient provisioning, and Patient activation policies use direct active relationships and do not grant hierarchy bypass. This is **CONFIRMED CURRENT REQUIREMENT**. |
| Phase 6 default | A Hospital may read or mutate Patients only through its own accepted direct scope. A parent Hospital does not automatically see or manage child-Hospital Patients, and a child does not automatically see its parent or siblings. This is a **PROPOSED MVP CONTRACT** consistent with fail-closed behavior. |
| Unresolved decision | If a Hospital network must be an authority scope, the owner must define direction, depth, operations, and data projection separately from metadata. This is **OWNER CONFIRMATION REQUIRED**. |

Do not update accepted ADR history or the architecture baseline with a proposed network rule. If an owner later accepts hierarchy as authority and that decision materially changes the accepted boundary, record a new/superseding ADR and then synchronize current-state documentation before implementation.

## 14. Capability and authorization proposal

### 14.1 Minimum vocabulary

Existing capabilities are not expanded by this document:

| Capability | Status | Existing meaning |
| --- | --- | --- |
| `patient:provision` | **CONFIRMED CURRENT REQUIREMENT** *(implemented)* | Create/reuse the minimum Patient identity, role, profile, and Hospital relationship under the Phase 5B provisioning policy. |
| `patient:activation:issue` | **CONFIRMED CURRENT REQUIREMENT** *(implemented)* | Issue a Patient activation credential for an eligible Patient in a direct Hospital scope. |

Only the following future vocabulary is proposed:

| Capability | Status | Boundary |
| --- | --- | --- |
| `patient:read` | **PROPOSED MVP CONTRACT** | B6.1 bounded directory/detail projection under an actor-specific scope. |
| `patient:update` | **PROPOSED MVP CONTRACT** | B6.3 explicit field commands only; no unrestricted patch. |
| `patient:assign-osm` | **PROPOSED MVP CONTRACT** | B6.2 assignment command only if assignment semantics are accepted. It may cover reassign/close only if that lifecycle is explicitly approved. |

Do not add clinical, appointment, screening, measurement, reporting, referral, transfer, delete, restore, or generic RBAC capabilities in Phase 6A. A separate `patient:unassign-osm` capability is not needed until the product proves that unassignment has a different authority boundary from assignment.

### 14.2 Proposed policy matrix

| Actor | `patient:read` default | `patient:update` default | Assignment default |
| --- | --- | --- | --- |
| `HOSPITAL` | Direct active Hospital relationship only; no hierarchy. | Explicitly approved Hospital-local/demographic fields only. | Conservative default: direct Hospital `OWNER` with explicit capability; member delegation requires confirmation. |
| `OSM` | Deny until active first-class assignment; then assigned Patient–Hospital relationship only. | Deny until assignment and field ownership are approved; never clinical authority by role alone. | OSM cannot assign itself by role. |
| `PATIENT` | `SELF` only, minimal approved projection. | No fields until self-edit allow-list is approved. | Deny. |
| `ADMIN` | Deny routine operational read; future governance projection only. | Deny routine operational update; future reconciliation operation only. | Deny routine assignment. |

Every future operation must resolve the authenticated actor server-side, parse input, re-read authoritative relationships and target state immediately before persistence, apply the capability and scope policy, and return a sanitized result. Missing, inactive, ambiguous, or conflicting state must deny or enter explicit reconciliation.

## 15. Audit and data-integrity boundaries

### 15.1 Reads

Routine directory reads do not need a transaction or an audit row merely because they are reads. They do need a scoped database query whose authorization predicate cannot be widened by client input. Read auditing is an owner/product decision and is not added by Phase 6A.

### 15.2 Assignment mutations

If B6.2 is approved, an assignment operation should conceptually be:

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

Potential minimum events, pending owner acceptance:

- `patient.osm_assigned`
- `patient.osm_unassigned` only if unassignment is a distinct supported operation
- `patient.updated` for approved Patient field commands

Minimum safe metadata should be limited to server-resolved actor ID, resource type/opaque resource ID, Hospital/relationship IDs, OSM User ID where needed, outcome, and a bounded field/category marker. Do not log raw National ID, `identityKeyHash`, HN value, phone, email, password, activation token, provider alias/subject, provider secret, or clinical payload.

The existing [audit service](../../src/modules/audit/services/audit-service.ts) accepts a transaction-compatible Prisma client, and the [audit schema](../../src/modules/audit/schemas/audit-schemas.ts) rejects sensitive metadata keys. A future Patient mutation must still choose safe values; schema validation is not permission to log sensitive data.

### 15.3 Update mutations

An approved Patient update should keep the local field write and its success audit event atomic. Identity/provider changes are not part of Patient profile management; if a future operation crosses the provider boundary, keep provider I/O outside the local transaction and use the established compensation/reconciliation contract.

## 16. Proposed Phase 6B slices

| Slice | Smallest proposed scope | Status |
| --- | --- | --- |
| **Phase 6B.1 — Patient Directory / Detail** | Server-authorized Hospital/Patient read projections; bounded name/HN search; exact identity lookup only through HMAC boundary; Hospital-local HN context; cursor pagination; no clinical data, raw identity, deletion view, hierarchy expansion, or assignment filter. | **BLOCKED BY OWNER DECISION** on read scopes and minimum projection. The query/data boundary is otherwise mapped. |
| **Phase 6B.2 — OSM ↔ Patient Assignment** | First-class Hospital-specific assignment; assign/unassign/reassign only as confirmed; server policy, transaction, audit, and bounded assignment projection. | **BLOCKED BY OWNER DECISION** on requiredness, authority, cardinality, lifecycle/history, and OSM read consequence. |
| **Phase 6B.3 — Patient Profile Management** | Only explicitly approved identity-adjacent/demographic/contact/HN field commands, with actor-specific ownership and audit. | **BLOCKED BY OWNER DECISION** on editable fields, HN semantics, self-edit, and conflict behavior. |
| Delete/restore/deactivation | No implementation in Phase 6. | **DEFERRED** until lifecycle and retention semantics are confirmed. |
| Transfer/Hospital change | No implementation in Phase 6. | **DEFERRED**; a future transfer slice requires **OWNER CONFIRMATION REQUIRED** semantics. |

No Phase 6B slice includes screening, measurements, PAM, HbA1c, care plans, goals, appointments, visits, follow-up, notes, referrals, clinical reporting, queues, workers, Redis, or background jobs.

## 17. Owner decision table

| Decision | Evidence | Recommended MVP Default | Risk if Wrong | Blocking? |
| --- | --- | --- | --- | --- |
| Hospital Patient read scope | Current provisioning/activation use direct active `OWNER`/`MEMBER`; no read capability exists; hierarchy is metadata. | Direct active `HOSPITAL` `OWNER`/`MEMBER` may read only Patient relationships in that same Hospital; profession does not change scope. | Overexposure if Hospital membership is broader than intended, or unusable workflow if member access should be narrower. | **YES — B6.1** |
| OSM Patient read scope | OSM–Hospital association is not Patient scope; no assignment model exists; legacy coach/network behavior is unverified. | Deny until first-class active assignment; then `ASSIGNED_PATIENTS` within a Hospital-specific relationship. | Hospital-wide or area-wide exposure, or an OSM workflow that cannot operate. | **YES — OSM B6.1/B6.2** |
| OSM assignment semantics | No current model; legacy optional `coach_id`/name mapping does not prove meaning. | Optional after provisioning; use a separate Hospital-specific assignment operation and do not use assignment as clinical authority. | Circular provisioning rules, wrong ownership, lost or cross-Hospital assignments. | **YES — B6.2** |
| Assignment cardinality | Legacy shows one current coach, but current architecture supports multiple Hospital relationships and no assignment constraints. | At most one active OSM per Patient–Hospital relationship; one OSM may have many Patients; retain reassignment history. | Cannot represent multi-OSM care or creates accidental shared access. | **YES — B6.2** |
| Hospital hierarchy authority | Legacy expands parent/child visibility; current schema/policies treat hierarchy as metadata. | No hierarchy authority in Phase 6; require direct scope. | Cross-Hospital disclosure or unauthorized mutation. | **YES — B6.1/B6.2** |
| Patient self-edit fields | Baseline allows self-service where appropriate; current `PatientProfile` has no editable fields and Phase 5 defers profile editing. | No self-edit in the first B6.3 implementation; later use an explicit allow-list under `SELF`. | Patient changes identity, HN, assignment, or clinical data without an approved policy. | **YES — B6.3** |
| Patient delete/restore/deactivation | Legacy conflates soft delete, restore, account flag, and hard deletion; current schema has no Patient lifecycle. | Defer all delete/restore/deactivation operations; keep Person/User/clinical/audit history intact by default. | Irreversible data loss, broken multi-role identity, lost audit history, or unsafe account state. | **NO for B6.1/B6.2; YES for lifecycle work** |
| Patient transfer semantics | Current Patient–Hospital relationship is many-capable and has no status/primary/transfer model. | Defer; never implement transfer as implicit delete-old/add-new. | Loss of relationship history, HN confusion, and accidental assignment movement. | **NO for B6.1/B6.2; YES for transfer work** |
| Admin routine Patient read | Baseline places Admin outside normal Patient operations. | Deny routine operational read; define a separate governance/reconciliation projection if needed. | Platform-wide sensitive-data exposure or an accidental Admin happy path. | **YES for Admin roster branch** |
| Minimum directory/detail projection | Current activation projection is narrow; legacy detail is clinical and broad; current PatientProfile has minimal data. | Name, opaque resource identifiers, authorized Hospital relationship, Hospital-local HN, and operational account summary only when needed. | Privacy overexposure or a projection that cannot support the workflow. | **YES — B6.1** |
| HN update and uniqueness semantics | HN is optional and not unique globally or per Hospital in the current schema; provisioning detects only same-relationship conflicts. | Treat HN as Hospital-local; require explicit normalization/uniqueness decision before editing or enforcing new constraints. | Duplicate/misassigned HN or cross-Hospital identity confusion. | **YES — B6.3/HN mutation** |

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

## 19. Acceptance criteria for starting Phase 6B

Phase 6B may start only when the relevant owner decisions above are accepted and recorded. At minimum:

- The Hospital `patient:read` scope and whether direct `OWNER`/`MEMBER` access is correct are accepted.
- The OSM read model is either explicitly denied for B6.1 or assignment-based scope is accepted with a first-class assignment contract.
- Assignment requiredness, authority, Hospital context, cardinality, lifecycle/history, suspension behavior, and effect on OSM read/update are accepted before B6.2.
- Parent/child Hospital authority is explicitly denied or accepted; no hierarchy behavior is inferred from legacy UI.
- The minimum B6.1 projection, search fields, exact identity lookup behavior, pagination/sort bounds, and raw-identity exclusions are accepted.
- HN requiredness, normalization, uniqueness, and update ownership are accepted before HN mutation or a new database invariant is introduced.
- Patient self-edit fields and actor ownership are explicitly listed before B6.3. No generic update payload is permitted.
- Delete/restore/deactivation and transfer are either explicitly out of scope for the planned slice or have separate approved lifecycle contracts.
- The capability vocabulary is limited to the selected slice; no clinical capabilities are introduced.
- Each consistency-critical mutation has a local transaction boundary, idempotency/concurrency behavior, safe audit metadata, and server-side revalidation plan.
- Tests cover allow and deny paths for each actor/scope, cross-Hospital isolation, inactive relationships, ambiguous identity, duplicate/HN conflicts, concurrent mutation, audit atomicity, and projection redaction.
- If an accepted owner decision materially changes an accepted ADR or the architecture baseline, a new/superseding ADR is drafted and current-state documentation is updated before implementation. Phase 6A itself does not rewrite accepted ADR history.

**Handoff conclusion:** The safe implementation shape is mapped, but Phase 6B is not declared implementation-ready. The first actionable next step is to resolve the blocking read-scope and assignment decisions, then record the accepted contract before adding Patient directory, assignment, or profile-management code.
