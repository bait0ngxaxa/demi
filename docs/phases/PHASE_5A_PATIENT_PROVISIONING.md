# Phase 5A — Patient Provisioning Requirement Closure and Architecture Contract

**Status:** Phase 5A contract draft. The architecture constraints inherited from the accepted ADRs remain binding. Patient business rules and the activation proof mechanism are not accepted by this document unless explicitly identified as already accepted elsewhere.

**Date:** 2026-08-14

**Scope:** Close the smallest safe requirement and architecture contract for Phase 5B Patient Provisioning and First-Time Activation. This document is analysis and handoff only. It does not add feature code, Prisma models, migrations, Server Actions, route handlers, UI, or an activation mechanism.

**Next phase:** Phase 5B is proposed but not implementation-ready until the blocking owner decisions in this document are answered.

## 1. Phase status and scope

Phase 5A answers three separate questions:

1. Which architecture decisions are already accepted and must not be reopened by patient work?
2. What patient behavior is evidenced by the legacy DEMI application, and which of that behavior conflicts with the rewritten system?
3. What is the smallest proposed Phase 5B vertical slice, and which requirements still need owner confirmation?

Phase 5A does not treat a legacy form field, a legacy authorization check, or an engineering recommendation as an accepted product requirement. Each item is classified as one of:

| Classification | Meaning |
| --- | --- |
| **CONFIRMED CURRENT REQUIREMENT** | Explicitly supported by current product, context, or an accepted ADR. |
| **LEGACY BEHAVIOR ONLY** | Observed in the pinned legacy application; useful evidence, but not accepted for the rewritten system. |
| **ARCHITECTURE-CONFLICTING LEGACY BEHAVIOR** | Observed legacy behavior that the accepted rewritten architecture prohibits. It must not be reused. |
| **PROPOSED MVP CONTRACT** | The smallest safe implementation recommendation for Phase 5B, pending owner confirmation where marked. |
| **OWNER CONFIRMATION REQUIRED** | A business rule or security decision that cannot be inferred safely from the existing sources. |
| **DEFERRED** | Intentionally outside the Phase 5B provisioning slice. |

## 2. Evidence and source hierarchy

The current repository source-of-truth hierarchy is:

1. Explicit owner/product requirements and decisions.
2. Accepted ADRs.
3. The architecture baseline and current phase contracts.
4. Current implementation and tests, as evidence of already-built boundaries.
5. Legacy DEMI code, as behavioral evidence only.
6. Engineering recommendations in this document, which are not accepted requirements until approved.

The inspected current sources include:

- [docs/CONTEXT.md](../CONTEXT.md)
- [PRODUCT.md](../../PRODUCT.md)
- [DEMI_ARCHITECTURE_BASELINE.md](../architecture/DEMI_ARCHITECTURE_BASELINE.md)
- [ADR-0001 — Person and User Identity](../adr/0001-person-and-user-identity.md)
- [ADR-0002 — Role, Capability, Scope Authorization](../adr/0002-role-capability-scope-authorization.md)
- [ADR-0004 — Patient Provisioning and Activation](../adr/0004-patient-provisioning-and-activation.md)
- [ADR-0005 — Server-Side Application Boundary](../adr/0005-server-side-application-boundary.md)
- [ADR-0006 — Transactional Business Operations](../adr/0006-transactional-business-operations.md)
- [ADR-0007 — Client Transport and Mobile-Ready Architecture](../adr/0007-client-transport-and-mobile-ready-architecture.md)
- [ADR-0008 — Workforce Provisioning and Activation](../adr/0008-workforce-provisioning-and-activation.md)
- [PHASE_4A_WORKFORCE_PROVISIONING.md](PHASE_4A_WORKFORCE_PROVISIONING.md)
- [PHASE_4B_WORKFORCE_PROVISIONING.md](PHASE_4B_WORKFORCE_PROVISIONING.md)
- [prisma/schema.prisma](../../prisma/schema.prisma)
- Current implementation evidence:
  - [identity-service.ts](../../src/modules/identity/services/identity-service.ts)
  - [actor-context-service.ts](../../src/modules/auth/services/actor-context-service.ts)
  - [authorization.ts](../../src/modules/auth/policies/authorization.ts)
  - [password-auth-provisioning-service.ts](../../src/modules/auth/services/password-auth-provisioning-service.ts)
  - [audit-service.ts](../../src/modules/audit/services/audit-service.ts)
  - [hospital-onboarding-service.ts](../../src/modules/hospital-onboarding/services/hospital-onboarding-service.ts)
  - [workforce-policy.ts](../../src/modules/workforce/policies/workforce-policy.ts)
  - [workforce-service.ts](../../src/modules/workforce/services/workforce-service.ts)
  - [workforce.integration.test.ts](../../tests/integration/workforce.integration.test.ts)
  - identity, authorization, authentication, hospital-onboarding, and audit tests under [tests](../../tests)

The legacy evidence is pinned to commit 7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e:

- [Legacy patient registration form](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/app/admin/patients/new/page.tsx)
- [Legacy patient queries and writes](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/lib/supabase/queries.ts)
- [Legacy patient list](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/app/admin/patients/page.tsx)
- [Legacy patient detail](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/app/admin/patients/[id]/page.tsx)
- [Legacy patient import flow](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/app/admin/patients/import-excel/page4-6-69.tsx)

## 3. Accepted architecture invariants

The following are binding constraints for Phase 5B. They are not reopened as patient-specific product choices.

### Identity and account

- Person and User are separate concepts. Person represents the human; User represents the application account, provider mapping, credential lifecycle, and roles.
- One human reuses one core Person/User identity. Adding PATIENT to an existing OSM or HOSPITAL user must not create a second Person or User.
- A Person may exist before a User. Identity resolution must happen before creating a new Person.
- A User may hold multiple roles. PATIENT is a top-level role and adding it must preserve existing roles.
- Provisioning is not activation. A trusted actor may create a provisioned patient account, but the patient owns credential establishment.
- An existing ACTIVE User with a valid authentication mapping and credential ownership is reused. Adding PATIENT must not force unnecessary credential reactivation or create a second provider account.
- A patient already provisioned by a trusted actor must not use a second public registration path.

### Credentials and activation

- Hospital personnel and OSM must never know, generate, derive, display, or set a patient password.
- Passwords must never be derived from Thai National ID, birth date, phone number, HN, or any predictable/default value.
- Activation must establish a patient-owned credential and must not persist a raw activation secret.
- The Phase 4B opaque activation pattern is a proven technical pattern, not automatically the patient business requirement.

### Authorization and trust

- Authorization is a server-side policy decision: Role + Capability + Scope.
- All authorization fails closed. Missing actor context, missing capability, inactive relationship, invalid target scope, ambiguous identity, and conflicting resource state deny or hold for reconciliation.
- Browser-selected Hospital, role, patient identifier, OSM assignment, creator identifier, or other scope data is never authoritative.
- Do not create a generic RBAC/ACL framework. Define only the domain capabilities required by the selected Phase 5B slice.
- Parent/child Hospital metadata does not grant authority unless an owner decision explicitly defines and accepts that policy. Current architecture does not treat hierarchy as an authorization bypass.
- HospitalMembership is a workforce membership concept. It must not be reused as a PATIENT relationship.
- OsmHospitalRelationship proves an OSM-to-Hospital association only. It must not be interpreted as patient ownership, assigned-patient scope, geographic scope, or clinical scope.

### Application boundary and data integrity

- The application boundary remains:

  Client/UI → Server Action or Route Handler → Application Service → Policy/Authorization → Prisma → PostgreSQL/Supabase

- Application Services remain transport-independent. Do not add speculative mobile APIs merely for a future consumer.
- UI must not access Prisma, provider credentials, or persistence directly.
- Multi-record business operations must be transactional at the local database boundary.
- Provider authentication and PostgreSQL are not a fake distributed transaction. Provider side effects remain outside the local transaction and use compensation/reconciliation as established by the authentication and Phase 4B patterns.
- Audit for a successful consistency-critical operation must be written inside the same local transaction.

## 4. Current implementation boundary and contradictions

The current Prisma schema intentionally contains Person, User, UserRole, Hospital, HospitalMembership, OsmHospitalRelationship, WorkforceActivation, HospitalOnboardingApplication, and AuditEvent. It does not yet contain PatientProfile, a patient-Hospital domain relationship, patient assignment, or patient-specific activation persistence.

The current authentication boundary already provides the relevant constraints:

- Login resolves a server-validated identity reference through a keyed hash, then maps Person to User and User to an opaque provider alias.
- Raw Thai National ID is not stored or sent to the provider.
- Only an ACTIVE User with a valid provider mapping resolves to an authorized ActorContext.
- PROVISIONED, INVITED, SUSPENDED, unmapped, provider-conflicted, and provider-error states fail closed.
- Login does not create identities, add roles, activate users, or create memberships.

Phase 4B provides a proven workforce pattern for identity reuse, local transactional persistence, one-time activation, provider compensation, reconciliation, and concurrency handling. Its workforce policy is not automatically the patient policy. In particular, the following remain patient decisions:

- who may provision a patient;
- what Hospital and OSM scope means;
- whether a patient may have one or multiple Hospital relationships;
- the minimum Patient Profile;
- the patient activation proof and channel;
- whether a patient-specific activation record is needed.

The legacy application contradicts the current architecture in several areas. Those contradictions are recorded below and are not a reason to weaken the accepted boundary.

## 5. Legacy patient workflow evidence

### 5.1 Registration entry point and actor behavior

The legacy patient registration page is a client component. It checks a local-storage session and permits the legacy roles admin, doctor, helper, and osm to open the page. It then loads Hospital/network data and coaches from client-callable Supabase query functions. This demonstrates that the legacy product supported operational staff and OSM-facing patient registration, but it does not establish the rewritten system's server-side authority policy.

The page selected a Hospital from a network-shaped list. The list was derived from users.hospital_id and parent/child relationships:

- a main Hospital saw itself and active children;
- a sub-Hospital saw its parent, siblings, and itself;
- an actor without a Hospital could see all Hospitals.

This is **LEGACY BEHAVIOR ONLY** and, when used as authority, **ARCHITECTURE-CONFLICTING LEGACY BEHAVIOR**. The rewritten system must not trust a browser-selected Hospital or infer patient authority from parent/child metadata without an explicit accepted policy.

### 5.2 Legacy field evidence and classification

| Legacy data or behavior | Observed behavior at the pinned commit | Classification for Phase 5A | Phase 5B implication |
| --- | --- | --- | --- |
| Registration actors | The page permits legacy admin, doctor, helper, and osm roles through a local-storage/client-side check. | LEGACY BEHAVIOR ONLY | Operational actors are evidenced, but the rewritten capability policy must be decided server-side. |
| Hospital selection | Hospital is required on the form and is selected from a network-shaped list. | LEGACY BEHAVIOR ONLY | A Hospital relationship is likely required, but cardinality and trusted scope need owner confirmation. |
| Parent/child network expansion | Main and sub-Hospital options are expanded through parent/child relationships and used to derive accessible Hospital IDs. | ARCHITECTURE-CONFLICTING LEGACY BEHAVIOR | Do not grant patient provisioning or visibility from hierarchy unless an owner explicitly accepts that policy. |
| HN | Required on the form and import; the UI says HN must not duplicate within the same Hospital; import handles a duplicate-HN error. | LEGACY BEHAVIOR ONLY | Do not place HN on Person. Confirm whether HN is mandatory and whether uniqueness is per Hospital or global. |
| Thai National ID | Required on the form and used as the legacy user identifier; the form checks length, while import performs a stronger validation path. | LEGACY BEHAVIOR ONLY | Identity input and matching policy must be confirmed. The rewritten login's server-side identity boundary remains binding. |
| Name | First name and last name are required. | LEGACY BEHAVIOR ONLY | A minimum authoritative name is likely needed, but exact fields and edit ownership need confirmation. |
| Birth date | Required and converted from Buddhist Era input to Gregorian storage. | LEGACY BEHAVIOR ONLY | Do not use birth date for a password or identity match. Whether it belongs in the minimum profile is open. |
| Gender | Required with a default selection. | LEGACY BEHAVIOR ONLY | Requiredness, vocabulary, and whether it belongs in Phase 5B are open. |
| Address | Province/district/subdistrict are required by the form; house number, address line, soi, road, village number, and village name are available. | LEGACY BEHAVIOR ONLY | Do not carry the full legacy address form into the MVP without confirming required fields. |
| Phone and email | Optional on the registration form. They are later displayed and used as patient contact data. | LEGACY BEHAVIOR ONLY | Do not assume either channel exists for activation. Contact requirements and privacy rules need confirmation. |
| Emergency contact | Optional name, phone, and relationship fields are available. | LEGACY BEHAVIOR ONLY | Defer unless patient safety or activation requirements prove it is needed at creation. |
| Occupation and education | Optional fields are available. | LEGACY BEHAVIOR ONLY | Defer unless an owner identifies a provisioning dependency. |
| Coach/OSM assignment | The form has an optional coach selector; the implementation resolves legacy doctors/coach records. CSV uses a Thai label for an OSM-like caregiver, but the code does not prove a current OsmHospitalRelationship or a patient assignment invariant. | LEGACY BEHAVIOR ONLY | Do not infer OSM assignment semantics. Confirm whether assignment is required, optional, and scoped. |
| Clinical and measurement fields | Weight, height, waist circumference, diabetes type, blood sugar, HbA1c, notes, PAM level/score, zone, and current step are initialized or collected. | LEGACY BEHAVIOR ONLY | Screening, measurements, care plans, goals, visits, appointments, follow-up, and clinical reporting are outside Phase 5B unless a strict creation dependency is confirmed. |
| Credential behavior | The form generates a password from the patient's birth date, places it in a read-only field, and displays it to the operator. Import uses the birth date as the password. | ARCHITECTURE-CONFLICTING LEGACY BEHAVIOR | Never reuse. Patient activation must be patient-owned and use no predictable secret. |
| User/account write | Client-callable logic inserts a user with raw id_card, password_hash, role patient, active status, and created_by. | ARCHITECTURE-CONFLICTING LEGACY BEHAVIOR | Replace with server-side identity resolution, User role addition, provider boundary, and explicit lifecycle. |
| Patient profile write | Client-callable logic inserts a profile separately and deletes the user if the profile write fails. | ARCHITECTURE-CONFLICTING LEGACY BEHAVIOR | Replace with one local transaction covering all authoritative patient records. |
| Authorization | Role checks and session state are client-side/local-storage checks; created_by and Hospital data are supplied by the caller. | ARCHITECTURE-CONFLICTING LEGACY BEHAVIOR | Derive actor, role, capability, and Hospital scope on the server. |
| Login | Legacy queries match raw id_card and password_hash in a users table and use a single legacy role model; the patient role is not handled by that login path. | ARCHITECTURE-CONFLICTING LEGACY BEHAVIOR | Use the current /login and ActorContext. Do not copy legacy password or role behavior. |
| List/detail | Legacy list and detail read profiles, Hospitals, raw id_card, coach records, contact data, and clinical data; filters include name, HN, raw ID, Hospital, coach, and PAM. | LEGACY BEHAVIOR ONLY | A future read contract is separate from provisioning. Do not make patient:provision imply unrestricted patient read or clinical access. |
| Delete/restore/import/export | Legacy supports direct patient delete/restore/permanent-delete, Excel import, exports, and operational clinical views. | LEGACY BEHAVIOR ONLY | These are not part of the Phase 5B creation and first-time activation slice. |

### 5.3 What the legacy evidence does not prove

The legacy code does not reliably establish:

- whether the product requires one or multiple Hospital relationships for a patient;
- whether HN is unique globally, per Hospital, or merely validated by convention;
- which modern Hospital actor policy is intended;
- whether an OSM assignment is an authority relationship, a care assignment, or a display-only coach link;
- which demographic fields are authoritative;
- what identity proof is acceptable when Thai National ID is unavailable or ambiguous;
- what activation channel is acceptable;
- whether the legacy clinical fields are needed at the moment of patient creation.

## 6. Legacy-versus-target gap analysis

| Concern | Legacy behavior | Accepted target boundary | Closure needed before Phase 5B |
| --- | --- | --- | --- |
| Identity | Raw id_card is the account identifier; no Person/User reuse. | Resolve the one core Person/User identity first; add PATIENT without duplication. | Confirm identifier and ambiguity handling. |
| Authentication | Plain/predictable credential behavior and client-facing password. | Patient-owned credential establishment; no predictable secret; current provider boundary. | Select proof/channel and lifecycle. |
| Authorization | Client/local-storage role checks and caller-supplied Hospital/creator. | Server-side Role + Capability + Scope, fail closed. | Confirm Hospital and OSM policy. |
| Hospital hierarchy | Parent/child expansion controls visible/selected Hospitals. | Hierarchy does not grant authority by default. | Explicitly decide whether any hierarchy authority exists. |
| Patient domain | One legacy profile is tied to one legacy user and Hospital. | Patient domain records are separate from Person and HospitalMembership. | Confirm profile minimum and relationship cardinality. |
| HN | Form/import requires HN and treats duplicates as per-Hospital conflicts. | Database invariant must match confirmed business scope. | Confirm mandatory status and uniqueness scope. |
| OSM/coach | Optional legacy coach lookup through doctors; no patient assignment model is proven. | OsmHospitalRelationship remains only OSM-Hospital association. | Decide assignment requirement and authority. |
| Consistency | Sequential direct writes with compensating delete. | Local transaction plus provider compensation/reconciliation. | Approve records in the consistency boundary. |
| Clinical workflows | Registration is combined with clinical initialization and later management. | Provisioning is distinct from clinical workflows. | Confirm any strict creation dependency. |

## 7. Proposed Phase 5B smallest vertical slice

The following is a **PROPOSED MVP CONTRACT**, not an accepted business rule. It is intentionally smaller than the legacy patient module.

- Trusted Hospital or OSM actor
- → server-side patient:provision authorization
- → resolve identity before creation
- → reuse or create Person
- → reuse or create User
- → add PATIENT role without removing existing roles
- → create the minimum Patient Profile
- → create the required Hospital relationship
- → create an OSM assignment only if that requirement and scope are confirmed
- → create patient activation persistence if activation is required
- → write the audit event atomically
- → new/non-active account remains PROVISIONED
- → patient-owned first-time activation
- → User becomes ACTIVE only after provider/local finalization
- → existing /login resolves the existing ActorContext

The slice should have these boundaries:

- No public patient registration. Provisioning is a trusted-actor operation.
- No patient password field on the provisioning form or import path.
- No raw activation token or password in the database, audit metadata, server logs, or durable client state. If an opaque bearer URL/QR is selected, the raw token exists only in the controlled one-time delivery artifact.
- No clinical screening, measurements, care plan, goals, visits, appointments, follow-up, reporting, or bulk clinical import.
- No inferred OSM geographic scope, assigned-patient scope, or parent/child authority.
- No account duplication when an existing Person/User is found.
- No forced credential reactivation for an existing ACTIVE User with a valid authentication mapping.
- No generic universal activation abstraction is selected merely to share code with WorkforceActivation.

### 7.1 Safe engineering default pending owner decisions

If the product owner wants a narrow implementation starting point, the safest proposed default is:

- a direct active Hospital OWNER may provision within that Hospital;
- an OSM may provision only after an explicit capability and exact active OsmHospitalRelationship scope are confirmed;
- ordinary Hospital members and ADMIN do not receive routine patient provisioning by implication;
- parent/child relationships do not expand authority;
- the provisioning request carries identity and patient data, but the server derives actor and scope;
- a patient Hospital relationship is created in the same local transaction as the identity and role changes;
- OSM assignment is omitted unless explicitly required;
- an activation mechanism is not chosen until the owner confirms the proofing/channel decision.

This is a risk-minimizing recommendation, not a replacement for the owner decisions.

## 8. Actor and trust-boundary analysis

| Actor or component | May be trusted for | Must not be trusted for | Phase 5A position |
| --- | --- | --- | --- |
| Hospital operator | Authenticated actor identity and server-resolved Hospital membership, subject to policy | Browser-selected Hospital, role, patient identity match, HN uniqueness, OSM assignment, or password | Hospital authority is open; direct OWNER is the safe proposed default. |
| OSM | Authenticated OSM role and a server-resolved active Hospital relationship | Patient scope, geographic area, assignment authority, or password | OSM provisioning and exact scope require owner confirmation. |
| Patient | Their own activation proof and credential choice | Provisioning authority or another person's identity | Patient owns activation, not registration. |
| ADMIN | Platform administration only where an explicit policy says so | Routine patient provisioning by role alone | Do not infer bypass; reconciliation/support authority is a separate future decision. |
| Browser/UI | User-entered form values and display intent | Actor, authorization, scope, identity resolution, lifecycle, or persistence truth | UI is a transport adapter only. |
| Server Action/Route Handler | Request size/shape validation, actor resolution, and service invocation | Business decisions duplicated outside the service | Thin adapter; no direct persistence. |
| Application Service | Orchestration and consistency boundary | Trust in client scope or provider as local transaction | Owns the patient provisioning operation. |
| Policy layer | Server-side Role + Capability + Scope decision | Client assertions | Fail closed on any missing/ambiguous input. |
| Provider authentication | Provider account creation/password verification | PostgreSQL transaction atomicity | Side effect outside local transaction; compensate/reconcile. |

## 9. Authorization and scope matrix

Only the capability needed by the selected provisioning mutation should be introduced initially.

| Proposed capability | Status | Use |
| --- | --- | --- |
| patient:provision | PROPOSED MVP CONTRACT; owner policy still open | Create or complete the minimum patient identity, role, profile, Hospital relationship, and activation state. |
| patient:read | Conditional proposal, not implied | Add only if the Phase 5B UI needs a bounded roster or confirmation view. It must be defined separately from create authority. |

Do not add clinical, appointment, transfer, reporting, geographic assignment, or complete patient-management capabilities in Phase 5A.

No patient:activate capability is added at this stage. Activation is a separate proofing and credential-establishment boundary; if it needs an explicit policy capability, that decision must be made with the activation mechanism rather than inferred from patient:provision.

| Actor | Required relationship or membership | Capability | Scope and target resource | Fail-closed behavior |
| --- | --- | --- | --- | --- |
| HOSPITAL | Proposed: direct active OWNER membership in the target active Hospital | patient:provision | Target Hospital is the server-resolved direct Hospital scope; patient identity and relationship are resolved server-side | Deny if role, direct active OWNER membership, target Hospital status, or target scope is missing or inactive. |
| HOSPITAL member | Active HospitalMembership MEMBER with profession | patient:provision | No authority is implied by membership or profession | Deny until an owner decision defines a narrower capability policy. |
| OSM | Active OSM role plus an active OsmHospitalRelationship to the target Hospital | patient:provision | Exact patient resource scope is unresolved: self-created, explicitly assigned, Hospital-wide, geographic, or another rule | Deny if the relationship or exact resource scope cannot be proven server-side. |
| ADMIN | ADMIN role alone | patient:provision | No routine patient scope is implied | Deny by default; any break-glass/reconciliation path needs a separate explicit policy and audit contract. |
| PATIENT | No provisioning relationship | patient:provision | No authority over another patient | Deny. Activation proof is not a general provisioning capability. |

Being allowed to provision a patient must not silently grant unrestricted patient:read, patient:update, clinical, appointment, export, delete, restore, or assignment authority.

The matrix is deliberately not an accepted final policy. The Hospital actor policy, OSM scope, hierarchy behavior, and ADMIN exception require owner confirmation.

## 10. Identity resolution contract

The identity contract should reuse the current identity service and login boundary, not the legacy user table behavior.

### 10.1 Resolution sequence

1. Validate the submitted identity reference on the server using the existing schema and namespace rules.
2. Hash the reference with the server-only HMAC namespace. Do not persist or log the raw reference.
3. Look up the Person by identityKeyHash.
4. If found, reuse that Person. Do not create another Person because the patient role is new.
5. If no Person is found, create one only after the trusted actor policy and identity requirements permit it.
6. Resolve User by the Person relation.
7. If no User exists, create the account in the correct non-active lifecycle state.
8. If User exists, preserve its existing roles and provider mapping.
9. Upsert the PATIENT role only as part of the same consistency-critical operation.
10. Resolve or create the Patient domain records and Hospital relationship under the same local transaction.

### 10.2 Required identity outcomes

| Existing state | Proposed outcome |
| --- | --- |
| No Person and no User | Create one Person and one non-active User if all identity requirements are satisfied. |
| Existing Person with no User | Reuse Person and create one User; never create a second Person. |
| Existing Person/User with no PATIENT role | Reuse both and add PATIENT while preserving every existing role. |
| Existing ACTIVE User with valid authSubject | Reuse account and credential ownership; add PATIENT and required domain records without reactivation or a second provider account. |
| Existing PROVISIONED User without authSubject | Reuse account; create or continue patient activation only according to the selected patient activation contract. |
| Existing INVITED, SUSPENDED, or otherwise ambiguous User | Do not silently reactivate, overwrite authSubject, or create a second User. Hold for an explicit reconciliation outcome. |
| Existing PATIENT role and matching domain state | An exact duplicate request may be an idempotent no-op. |
| Existing PATIENT role but missing or conflicting domain state | Complete only when the identity and relationship are unambiguous; otherwise fail/hold for reconciliation. |
| Existing ADMIN, HOSPITAL, or OSM role | Preserve the role. Whether routine patient provisioning may add PATIENT to a privileged or operational account needs owner confirmation and a conflict policy. |

Identity resolution must not silently overwrite names, contact fields, birth data, or other existing Person data merely because a provisioning request contains a new value. Conflicting identity evidence must be surfaced as a trusted reconciliation case.

### 10.3 Identity ambiguity

If Thai National ID is not available, fails validation, maps to conflicting records, or cannot be confidently resolved, the service must not guess from name, birth date, phone, HN, or a combination of weak attributes. The safe outcome is a denied or pending trusted reconciliation path. The exact assisted identity-proofing workflow is an owner decision.

## 11. Patient domain and persistence concepts

These are conceptual persistence recommendations only. No model is added in Phase 5A.

### 11.1 PatientProfile

**PROPOSED:** A PatientProfile should represent the patient's domain-specific profile and reference the resolved Person. It should not become a second identity record and should not put Hospital-specific HN data on Person.

The minimum profile fields are not accepted. At minimum, the design likely needs an explicit profile identifier, Person reference, lifecycle/status, timestamps, and only the demographic/contact fields that the owner confirms as authoritative. It should not include clinical measurement state merely because the legacy profile did.

If the product confirms one profile per human, the Person-to-PatientProfile relation can enforce that invariant. If the product permits multiple patient episodes or domain records per human, that is a different requirement and must be decided before schema design.

### 11.2 PatientHospitalRelationship

**PROPOSED:** Use a patient-specific relationship model, such as PatientHospitalRelationship, rather than HospitalMembership. It should represent the patient's relationship to a Hospital and carry an explicit lifecycle/status, timestamps, and any Hospital-local identifiers such as HN if that scope is confirmed.

This relationship must not grant the provisioning actor read or clinical authority by itself. Authorization remains a separate policy decision.

### 11.3 Optional OSM assignment

**PROPOSED:** If assignment is confirmed, use a separate patient-specific assignment concept referencing the OSM User and the relevant Hospital relationship. It must not overload OsmHospitalRelationship. Its status, assignment authority, uniqueness, reassignment, and visibility are all open requirements.

If assignment is not required to create a patient, omit it from the core transaction and defer assignment to a later workflow.

### 11.4 Patient activation persistence

**PROPOSED:** Patient activation should retain explicit patient purpose and policy semantics. It may share low-level primitives with WorkforceActivation, such as random opaque token generation, digest-at-rest storage, bounded expiry, single-use claims, revocation, and concurrency control. It should not turn WorkforceActivation into a universal activation table merely to avoid a second domain concept.

Whether patient activation needs its own persistence, can reuse an existing user activation state, or needs an external proof reference depends on the owner-selected mechanism. No universal activation model is accepted by Phase 5A.

## 12. Hospital relationship and HN analysis

### 12.1 Hospital cardinality

The current sources do not close whether a patient belongs to exactly one Hospital or may have active relationships with multiple Hospitals. The legacy form and profile look single-Hospital, but that is legacy behavior, not a safe invariant for the rewritten domain.

**OWNER CONFIRMATION REQUIRED:** choose one of:

- exactly one active Hospital relationship per patient;
- multiple active Hospital relationships;
- one primary relationship plus additional relationships;
- another explicit model.

Until this is decided, do not place hospitalId on Person and do not encode a global one-Hospital uniqueness assumption.

### 12.2 HN requirement and uniqueness

The legacy UI and import path treat HN as required and report duplicates within a Hospital. This is evidence, not confirmation.

**OWNER CONFIRMATION REQUIRED:**

- Is HN mandatory for every patient?
- Can a patient be created before HN is known?
- Is HN unique globally, per Hospital, per Hospital relationship, or only unique among active relationships?
- Is HN normalized before comparison, and what characters/forms are accepted?
- May one human have different HN values at different Hospitals?

If the owner confirms Hospital-local HN uniqueness, the safest database recommendation is a normalized HN field owned by the PatientHospitalRelationship with a uniqueness invariant on the Hospital scope and normalized HN, with the exact treatment of inactive/ended relationships explicitly defined. Do not put HN on Person. If global uniqueness is confirmed instead, the invariant belongs at the appropriate patient domain level. The database must enforce the chosen invariant; application checks alone are insufficient.

### 12.3 Hospital visibility is separate from relationship

Creating a PatientHospitalRelationship does not by itself define which Hospital users may read or update all patients. A future patient:read or patient:update policy must specify actor relationship, capability, target scope, and fail-closed behavior independently.

## 13. OSM assignment analysis

The legacy coach selector and doctors lookup do not establish the meaning of an OSM assignment. The current OsmHospitalRelationship is explicitly only an OSM-to-Hospital association.

The following are therefore open:

- May an OSM provision patients at all?
- What exact active relationship proves that authority?
- Is the OSM scope limited to patients created by that OSM, explicitly assigned patients, the whole Hospital, an area, or another resource set?
- Must an OSM-provisioned patient receive an OSM assignment immediately?
- Can a Hospital provision a patient without assigning an OSM?
- Can a patient have one or multiple OSM assignments?
- Who may assign, replace, end, or view an assignment?
- What status and history are required for assignment?

**Safe proposed default:** do not create an OSM assignment in the core Phase 5B slice unless the owner confirms both the requirement and its authority. If an OSM is eventually permitted to provision, the server must prove the exact target scope; an active Hospital relationship alone must not be treated as Hospital-wide patient ownership.

## 14. Account lifecycle and activation analysis

### 14.1 Lifecycle contract

The existing User lifecycle remains authoritative:

| Case | Proposed patient behavior |
| --- | --- |
| New User created by provisioning | User is PROVISIONED; the patient is not yet an active login actor. |
| Existing ACTIVE User with valid auth mapping | Reuse credential ownership and keep User ACTIVE; add PATIENT without reactivation. |
| Existing PROVISIONED User without credential | Reuse the User; patient-owned activation is required if the selected policy requires an account. |
| Existing INVITED/SUSPENDED/invalid mapping | Fail closed or hold for reconciliation; do not silently activate or overwrite. |
| Activation provider succeeds but local finalization fails | Compensate when safe; otherwise retain an explicit reconciliation state and never claim success. |
| Activation is replayed after use/revocation/expiry | Deny; do not create a second credential or silently issue a new one from the replay. |

The exact meaning of a Patient Profile status and PatientHospitalRelationship status is not yet accepted. They must not be conflated with User.status.

### 14.2 Activation options

ADR-0004 confirms that registration is different from activation and that the patient owns the credential. It intentionally leaves the mechanism open. The available options are:

| Option | Strengths | Dependencies and risks | Phase 5A status |
| --- | --- | --- | --- |
| One-time opaque URL, QR, or assisted handoff modeled on Phase 4B | Already proven technically in this repository; supports hash-at-rest, expiry, single-use, revocation, concurrency control, and field-assisted delivery; does not require the operator to know the password | The delivery/proof may be insufficient for patient identity assurance; no private contact channel does not by itself solve safe handoff; URL/QR handling needs abuse controls | Existing technical pattern only; **OWNER CONFIRMATION REQUIRED** as patient proof. |
| OTP through private phone or email | Familiar patient flow and can be patient-owned | Requires reliable private contact ownership, delivery provider, rate limits, recovery rules, and privacy decisions; legacy fields are optional and do not prove availability | **OWNER CONFIRMATION REQUIRED**. |
| ThaID or another external identity provider | Potentially stronger identity proof | Integration, availability, consent, fallback, and operational dependencies are not accepted | **OWNER CONFIRMATION REQUIRED**; not a Phase 5A implementation choice. |
| Assisted verification without a private channel | Supports field operation for patients without phone/email | Requires a precise proofing script, trusted actor boundary, fraud controls, audit, and recovery process | **OWNER CONFIRMATION REQUIRED**. |

No option is marked Accepted. The owner must select the acceptable proof, delivery channel, expiry, retry, recovery, and no-private-contact workflow before Phase 5B implementation.

Any selected mechanism must preserve:

- patient-owned credential establishment;
- no predictable or operator-known password;
- single-use and replay resistance where a bearer is used;
- bounded expiry;
- no raw activation secret persistence;
- safe retry, revocation, regeneration, and abuse protection;
- no account duplication;
- provider/local compensation and reconciliation;
- accessibility for field operation;
- a clear failure path when the patient cannot use the selected channel.

### 14.3 Reuse of activation primitives

The token generation, digest, claim, expiry, revocation, and concurrency primitives from Phase 4B may be reused as implementation techniques if the patient mechanism is an opaque bearer. The domain policy and persistence semantics must remain explicit. Do not rename WorkforceActivation into a generic universal model or silently make workforce and patient proofing equivalent.

## 15. Transaction, idempotency, concurrency, and reconciliation contract

### 15.1 Local consistency boundary

A successful patient provisioning operation should be one local consistency-critical business operation containing, as applicable:

- Person resolution or creation
- plus User resolution or creation
- plus PATIENT role
- plus minimum PatientProfile
- plus required PatientHospitalRelationship
- plus OSM assignment only when required and authorized
- plus patient activation persistence when required
- plus AuditEvent

The operation must not report success with partial authoritative patient state. A failure rolls back the local transaction. Provider authentication remains a separate side effect handled with compensation/reconciliation.

### 15.2 Idempotency and concurrency

The implementation should use the database's identity, relationship, and uniqueness constraints as the final concurrency guard, with a bounded serializable/retry strategy consistent with Phase 4B. The service must not rely on a read-then-create check alone.

Recommended behavior:

| Situation | Proposed contract |
| --- | --- |
| Exact duplicate request with the same resolved identity and same authoritative values | Idempotent success or an explicit already-provisioned result; no duplicate Person, User, role, relationship, activation, or audit event. |
| Concurrent duplicate provisioning | One transaction wins; the other rechecks committed state and returns the same idempotent outcome or a defined conflict. No duplicates. |
| Existing Person with no User | Reuse Person and create one User in the same local transaction. |
| Existing ACTIVE User | Reuse User, preserve roles and credential mapping, add PATIENT and domain records; do not call provider password creation. |
| Existing PROVISIONED User | Reuse User; create or continue the patient activation state only under the selected activation contract. |
| Existing PATIENT role | Treat as idempotent only when all relevant domain records and relationships match; otherwise hold for reconciliation. |
| Conflicting Hospital/HN relationship | Roll back or return a trusted conflict; never bypass the database invariant or attach the patient to a different Hospital based on client input. |
| Ambiguous identity | Deny or hold for trusted reconciliation; never guess from weak attributes. |
| Existing ADMIN/HOSPITAL/OSM roles | Preserve roles. Routine addition of PATIENT and any exceptional policy need explicit owner confirmation and audit. |
| Provider identity conflict | Do not overwrite authSubject or create a duplicate provider account. Hold for reconciliation. |
| Provider side effect followed by local failure | Compensate when the side effect is known and safe to reverse; if outcome is ambiguous, record reconciliation-required state and do not report a completed operation. |
| Retry after provider/local ambiguity | Reconcile the known provider and local state before retrying. Never blindly create another provider identity. |

Idempotency keys or request identifiers may be added only if the owner requires a retry contract beyond the database's natural identity/relationship constraints. If added, their scope, retention, actor binding, and audit behavior must be explicit rather than becoming a generic platform abstraction.

## 16. Audit contract

The audit contract is **PROPOSED** and must be finalized with the owner before implementation.

Potential events for the smallest slice:

- patient.provisioned
- patient_hospital_relationship.provisioned
- patient_activation.issued
- patient_activation.revoked
- patient_activation.completed
- patient.provisioning.reconciliation_required
- patient.provisioning.conflict, if security/audit policy requires a durable conflict event

Each event should record the server-resolved actor, action, resource type, resource identifier where available, outcome, and bounded non-sensitive metadata. Successful events must be written inside the same local transaction as the authoritative state.

Audit metadata must not contain raw Thai National ID, identityKeyHash, password, activation token, secret, provider credential, or other sensitive contact/verification material. HN, phone, and email must not be added casually; whether a redacted or scoped reference is permitted needs a privacy decision. An idempotent no-op should not create duplicate success events unless the owner explicitly wants an attempt log.

## 17. Proposed routes and UI at conceptual MVP level

No route or UI is implemented in Phase 5A. The conceptual boundary for Phase 5B is:

- A server-rendered or client form under an application patient-management area, such as a future /app/patients/provision entry point, available only after server-side policy permits it.
- A Server Action or Route Handler that validates request shape and invokes a transport-independent patient provisioning Application Service.
- The service derives the actor, target Hospital, capability, and scope server-side. The client may submit patient values but cannot choose authoritative actor, role, creator, Hospital scope, relationship ownership, or OSM assignment.
- The form contains no password, password confirmation, generated default secret, raw activation token, or provider credentials.
- The response exposes only a safe provisioning result and, if the selected activation contract permits it, a controlled one-time delivery artifact. It must not expose internal paths, provider errors, raw secrets, or database details.
- A future patient activation entry point, such as /activate/patient, is not selected until the proof/channel decision is made. It must ultimately converge on the existing /login and server-resolved ActorContext.
- No speculative versioned mobile API is required for this web slice. A future transport can call the same Application Service through an explicitly identified adapter.

## 18. Explicitly deferred workflows

The following remain outside Phase 5B unless a separate requirement proves a strict creation dependency:

- screening, measurements, diabetes care, PAM scoring, zones, notes, care plans, goals, visits, appointments, follow-up, and clinical reporting;
- patient update, delete, restore, permanent deletion, transfer, merge, or deduplication UI;
- patient self-editable profile policy;
- OSM geographic scope, assigned-patient scope, and care-team semantics;
- OSM assignment management, reassignment, and bulk assignment;
- Hospital parent/child authority and cross-Hospital visibility;
- multi-Hospital transfer and longitudinal patient identity policy;
- Excel/CSV patient import and export;
- public patient sign-up or a second patient registration path;
- password recovery, credential reset, and long-term account recovery;
- SMS, email, LINE/LIFF, ThaID, native mobile authentication, or another external identity integration;
- notification provider selection;
- complete patient read/update/clinical capability matrix;
- break-glass ADMIN workflows;
- patient-facing appointment or care features.

## 19. Blocking owner decisions

The following decisions are **OWNER CONFIRMATION REQUIRED**. They are not hidden behind the proposed safe defaults.

| Decision | Why it blocks Phase 5B |
| --- | --- |
| Which Hospital actors may provision: direct OWNER only, all authorized HOSPITAL members, selected professions, or another capability policy? | Determines the server policy and prevents legacy client role checks from becoming accidental authority. |
| May OSM provision patients? | Determines whether OSM is an actor for the core mutation at all. |
| If OSM may provision, what exact active Hospital/OSM relationship proves authority? | An OsmHospitalRelationship currently proves association only, not patient scope. |
| What is an OSM's patient resource scope: self-created, explicitly assigned, Hospital-wide, geographic, or another rule? | Without a target scope, fail-closed authorization cannot be implemented safely. |
| Does parent/child Hospital membership grant patient provisioning or visibility authority? | Current architecture does not grant it by implication; the legacy network expansion cannot be copied silently. |
| Must a patient belong to exactly one Hospital, or may relationships span multiple Hospitals? | Determines PatientHospitalRelationship cardinality and uniqueness. |
| Is HN mandatory? | Determines minimum profile/relationship data and whether a patient can be provisioned without HN. |
| Is HN unique globally, per Hospital, per relationship, or only among active relationships? | Determines the database invariant and conflict behavior. |
| Is Thai National ID mandatory for every patient? | Determines identity resolution and non-Thai-ID workflow. |
| What happens when there is no Thai National ID or identity cannot be confidently resolved? | A safe system must not guess from name, birth date, phone, or HN. |
| What is the minimum authoritative Patient Profile for Phase 5B? | Prevents legacy clinical and demographic fields from entering the MVP without need. |
| Which demographic/contact fields are required versus optional? | Determines validation, privacy, activation availability, and edit ownership. |
| Which legacy clinical fields must not be part of provisioning? | Keeps screening and care workflows outside this phase. |
| Is OSM assignment mandatory when an OSM provisions a patient? | Determines whether assignment is in the consistency boundary. |
| Can Hospital provision without immediately assigning an OSM? | Determines whether assignment is optional and whether an unassigned state exists. |
| What lifecycle/status is required for Patient Profile and Hospital relationships? | User.status cannot be overloaded for domain relationships. |
| What patient activation proof is acceptable for MVP? | Registration and activation are separate; proofing is the unresolved security/product decision. |
| Should the opaque one-time URL/QR/assisted pattern be used, or is OTP/phone/email/ThaID/assisted proof required? | Determines persistence, delivery, abuse, expiry, and recovery design. |
| What is the safe workflow when a patient has no private phone or email? | Legacy contact fields are optional; activation cannot assume a private channel. |
| What retry, expiry, regeneration, revocation, replay, and reconciliation behavior is required? | Determines whether the Phase 4B primitives fit and what patient policy must be explicit. |
| What should happen when the resolved User already has ADMIN, HOSPITAL, OSM, or PATIENT roles? | Must preserve one identity while preventing privilege or lifecycle surprises. |
| Which duplicate/conflict cases are idempotent and which require trusted reconciliation? | Determines transaction outcomes and safe retries. |
| Which audit events are required for provisioning, activation, denial, conflict, and reconciliation? | Determines the auditable consistency boundary and privacy-safe metadata. |

## 20. Non-blocking decisions that may safely wait

These details may wait until the blocking decisions are closed:

- final route pathname and exact form layout;
- copy, localization, and field label choices;
- whether the first post-provision screen is a confirmation page or a bounded roster;
- exact pagination and sorting for a future patient list, provided all reads are bounded and policy-controlled;
- the final event action spelling if no external consumer depends on it;
- notification template and delivery presentation after the proof/channel is chosen;
- future HTTP adapter details when an actual mobile or external consumer exists;
- patient list/detail polish that does not expand provisioning authority.

These are not permission to implement the deferred clinical or assignment workflows.

## 21. Phase 5B implementation readiness checklist

Phase 5B should not begin until the following are true:

- [ ] The owner has selected the Hospital provisioning authority and its exact server scope.
- [ ] The owner has decided whether OSM may provision and, if so, the exact relationship and resource scope.
- [ ] Parent/child Hospital authority is explicitly accepted or explicitly denied for patient work.
- [ ] Patient-Hospital cardinality and lifecycle are decided.
- [ ] HN requiredness, normalization, and uniqueness scope are decided.
- [ ] Thai National ID requirements and the no-ID/ambiguous-identity workflow are decided.
- [ ] The minimum Patient Profile and required/optional demographic/contact fields are approved.
- [ ] Legacy clinical fields excluded from Phase 5B are recorded as deferred.
- [ ] OSM assignment requiredness and Hospital-without-OSM behavior are decided.
- [ ] The activation proof/channel, no-private-contact path, expiry, retry, revocation, recovery, and reconciliation behavior are approved.
- [ ] Existing ACTIVE, PROVISIONED, privileged-role, PATIENT-role, duplicate, conflict, and provider-ambiguity outcomes are approved.
- [ ] The conceptual persistence invariants are approved without using HospitalMembership for patients or OsmHospitalRelationship as patient ownership.
- [ ] The minimum capability/policy matrix is approved and patient:provision does not imply unrestricted patient read/update/clinical access.
- [ ] The local transaction boundary, database uniqueness constraints, concurrency retry, and idempotency behavior are approved.
- [ ] Audit events and privacy-safe metadata are approved.
- [ ] The application service and current authentication/ActorContext boundary are mapped to the selected slice.
- [ ] Integration tests cover identity reuse, existing ACTIVE User reuse, exact duplicate, concurrent duplicate, HN/relationship conflict, ambiguous identity, provider/local inconsistency, activation replay, and audit atomicity.
- [ ] If the selected activation mechanism materially extends ADR-0004, a new ADR is drafted with Status: Proposed before any claim of architectural acceptance. No new ADR is silently accepted by Phase 5A.

## 22. Contradictions and validation gate

The proposed contract was compared against the current sources:

- It preserves ADR-0001 identity reuse and server-side identity resolution.
- It preserves ADR-0002 fail-closed Role + Capability + Scope authorization without a generic RBAC/ACL framework.
- It preserves ADR-0004 Registration ≠ Account Activation and patient-owned credential establishment. It does not choose an activation mechanism that ADR-0004 leaves open.
- It preserves ADR-0005's server-side application boundary and transport-independent services.
- It preserves ADR-0006's local transaction boundary and provider compensation/reconciliation.
- It preserves ADR-0007's current Server Action/Route Handler boundary and avoids speculative mobile APIs.
- It uses ADR-0008 and Phase 4B as a proven workforce implementation pattern while keeping patient policy and activation semantics explicit.
- It matches the current schema's deliberate absence of patient domain models; no schema change was made.
- It uses the current authentication and ActorContext states rather than the legacy raw credential flow.
- It identifies the legacy client-side authorization, hierarchy expansion, single-role/single-Hospital account shape, direct Supabase writes, predictable password, and sequential persistence as contradictions, not requirements.

No new architectural decision is silently marked Accepted here. If the owner later selects a patient activation mechanism or another decision that materially extends ADR-0004, that decision must be captured in a separate ADR with Status: Proposed before it is treated as accepted architecture.

**Phase 5A handoff result:** the smallest safe Phase 5B shape is clear, but implementation readiness is blocked by the owner decisions in Section 19. No Phase 5B feature code, Prisma model, migration, Server Action, route, or UI was implemented.
