# DEMI Redesign Architecture Baseline

**Status:** Accepted as initial architecture baseline

**Version:** 0.2

**Date:** 2026-08-12

**Purpose:** Source document for the DEMI rewrite/init phase. This document captures architectural decisions already agreed during requirement discovery. It is not the final business requirement specification.

---

## 1. Context

DEMI is being redesigned from the existing application rather than preserving the existing architecture.

The previous system mixed several concerns in the same user model and application flow:

- identity and business role
- hospital affiliation
- authorization
- authentication/session state
- operational responsibility

The redesigned system intentionally separates these concerns.

The product direction also changes operational ownership:

- Hospital users and OSM are the main operational actors.
- Patients should be able to perform self-service actions where appropriate.
- Platform Admin should not be the normal operator for day-to-day patient workflows.
- Admin remains responsible for governance, verification, audit, recovery, reconciliation, and exceptional cases.

The business requirements for each module are still being collected. Therefore this document fixes only the architectural baseline and explicitly leaves unresolved business rules open.

---

# 2. Core Architecture Principles

## 2.1 Identity, role, permission, and scope are separate concepts

Authorization must not be implemented as a simple role comparison.

Conceptually:

```text
Identity
   ↓
Role / Membership
   ↓
Capability
   ↓
Scope
   ↓
Policy Decision
   ↓
Business Action
```

The model is:

```text
Role + Capability + Scope = Authorization Decision
```

Definitions:

- **Role** — what kind of actor the user is in DEMI.
- **Capability** — what action the actor may perform.
- **Scope** — which resources the actor may perform that action against.
- **Policy** — the server-side rule that evaluates the actor, capability, resource, and scope.

All authorization decisions must be evaluated on the server and fail closed.

---

# 3. Top-Level Roles

The initial system has exactly four top-level business roles:

```text
ADMIN
HOSPITAL
OSM
PATIENT
```

These roles are intentionally broad.

Doctor, nurse, coordinator, and similar classifications are not top-level roles in the initial design unless later business requirements prove that they need independent authorization behavior.

---

## 3.1 ADMIN

`ADMIN` means **DEMI Platform Admin**, not hospital administrator.

Primary responsibilities:

- hospital/organization governance
- approve or reject hospital onboarding
- system configuration
- user and membership governance
- audit inspection
- account recovery
- duplicate identity resolution
- data reconciliation
- exceptional/support cases

Admin should not be required for normal operational workflows such as:

- routine patient registration
- screening on behalf of OSM
- ordinary appointment creation
- normal hospital case management
- routine approval of every staff or patient action

Admin belongs primarily to the governance/control plane.

---

## 3.2 HOSPITAL

`HOSPITAL` represents users operating as members of a hospital or health service organization.

The hospital side is expected to be a primary case/business owner.

Potential responsibilities, pending detailed requirements:

- patient management
- patient verification
- assignment of OSM
- screening review
- care planning
- appointments
- follow-up
- progress monitoring
- hospital reporting

Example capability vocabulary:

```text
patient:create
patient:read
patient:update
patient:assign-osm

screening:read
screening:review

care-plan:create
care-plan:update

appointment:create
appointment:update

followup:read

report:read
```

Actual capability assignments remain subject to business requirements.

---

## 3.3 OSM

`OSM` represents อสม. and acts primarily as a field operator.

Potential responsibilities:

- patient registration/provisioning
- initial data collection
- screening
- home visit
- follow-up
- measurements
- progress updates
- referral/escalation to hospital

Example capability vocabulary:

```text
patient:provision
patient:read
patient:update

screening:create
screening:update

visit:create
visit:update

followup:create
measurement:create
referral:create
```

The final OSM scope is intentionally unresolved. Possible models include:

- assigned patients
- geographic area
- hospital + assignment
- another business-defined scope

This must be decided from real workflow requirements.

---

## 3.4 PATIENT

`PATIENT` is an active actor, not only a record managed by staff.

Potential self-service responsibilities:

- read own information
- update permitted personal data
- complete permitted self-assessments
- submit permitted measurements/health information
- view care plan
- view appointments
- view progress
- receive notifications
- request assistance

Patient scope is normally:

```text
SELF
```

A patient must never gain access to another patient's resource by modifying browser state or request parameters.

---

# 4. Person and User Are Different Concepts

A real-world person must be modeled independently from an application account.

Conceptually:

```text
PERSON
  │
  │ optional account relationship
  ▼
USER
```

## 4.1 Person

`Person` represents the real human identity known by DEMI.

Possible attributes include:

```text
id
national_id
first_name
last_name
birth_date
...
```

A Person may exist before that person has activated or even needs an interactive login account.

Example:

```text
OSM registers a patient
        ↓
Person exists
        ↓
Patient profile exists
        ↓
Patient has not activated login yet
```

This is a valid state.

## 4.2 User

`User` represents the application account/credential/session identity.

Conceptually:

```text
user.id
user.person_id
user.account_status
authentication credentials / external identity links
```

`Person` must not be duplicated merely because the same human has another business role.

---

# 5. One Human, One Core Identity, Multiple Roles

The system must support a person having multiple roles.

Example:

```text
Person A
  │
User A
  │
  ├── OSM
  └── PATIENT
```

If an existing OSM later becomes a patient:

```text
Before:
Person A
└── OSM

After:
Person A
├── OSM
└── PATIENT
```

Do not create a second person or a second independent identity just to represent another role.

Identity resolution must occur before provisioning a new person/account.

---

# 6. Roles Must Not Be a Single `users.role` Column

Avoid a model equivalent to:

```text
users
----------------
id
person_id
role
hospital_id
```

because it breaks down when:

- one person has multiple roles
- one user is affiliated with multiple hospitals
- profession and authorization evolve independently
- scope is more complex than one hospital ID

Conceptual entities should instead separate these concerns:

```text
persons
users
user_roles
hospital_memberships
osm_memberships
patient_profiles
```

Example:

```text
user_roles
----------------
U001 | OSM
U001 | PATIENT
```

The exact database schema remains an implementation decision to be finalized during project initialization.

---

# 7. Hospital Membership Model

Hospital affiliation is represented separately from the top-level role.

Conceptually:

```text
HospitalMembership
-------------------------
user_id
hospital_id
membership_type
profession
status
```

Example:

```text
User A
Role: HOSPITAL

HospitalMembership:
hospital = Hospital A
membership_type = MEMBER
profession = DOCTOR
```

and:

```text
User B
Role: HOSPITAL

HospitalMembership:
hospital = Hospital A
membership_type = MEMBER
profession = NURSE
```

## 7.1 Profession Is Not a Top-Level Role

Initial profession/staff types may include:

```text
DOCTOR
NURSE
COORDINATOR
OTHER
```

These describe what a hospital member is professionally.

They must not automatically become authorization roles unless business requirements require different permission behavior.

For example, if future requirements state that only doctors may approve a care plan, that policy can be introduced without changing the core identity model.

---

# 8. Hospital Owner Is Not Platform Admin

The first approved user for a hospital becomes a hospital owner.

Conceptually:

```text
Role = HOSPITAL

HospitalMembership:
  membership_type = OWNER
```

`OWNER` is a hospital membership level, not a new top-level role.

Trust boundary:

```text
DEMI Platform Admin
        ↓ governance / verify organization
Hospital
        ↓
Hospital Owner
        ↓
Hospital Members / OSM
```

The hospital owner is effectively the tenant administrator for that hospital but does not receive platform-wide `ADMIN` authority.

---

# 9. Signup and Onboarding Strategy

## 9.1 No General Public User Signup

The redesigned DEMI must not expose a generic signup flow where arbitrary users choose their own role.

Do not implement a screen such as:

```text
Choose your role:

[ ] Admin
[ ] Doctor
[ ] Nurse
[ ] OSM
[ ] Patient
```

This model caused avoidable user mistakes in the previous workflow and creates a weak trust chain.

## 9.2 Public Signup Is Hospital Organization Onboarding

The public signup flow is primarily for hospital/organization onboarding.

Conceptual flow:

```text
Hospital representative
        ↓
Hospital signup
        ↓
Select/match hospital from trusted hospital master
        ↓
Provide organization/contact information
        ↓
Verify contact method
        ↓
PENDING_VERIFICATION
        ↓
DEMI Platform Admin review
        ↓
APPROVED
        ↓
Hospital ACTIVE
        ↓
Applicant becomes HOSPITAL + OWNER
```

Where possible, hospital identity should come from a trusted hospital master instead of free-text organization creation.

Exact verification evidence/process is not yet defined.

---

# 10. Staff and OSM Are Provisioned, Not Self-Assigned

After hospital activation, the Hospital Owner manages relevant personnel.

Conceptual flow:

```text
Hospital Owner
       ↓
Add / Invite personnel
       ↓
Select trusted business classification
       ↓
Resolve existing Person
       ↓
Create Person only if no identity exists
       ↓
Create membership / role
       ↓
Provision account if required
       ↓
User activation
```

The target user does not choose their own role.

Examples:

### Doctor

```text
Role = HOSPITAL

HospitalMembership:
  hospital = A
  profession = DOCTOR
```

### Nurse

```text
Role = HOSPITAL

HospitalMembership:
  hospital = A
  profession = NURSE
```

### OSM

```text
Role = OSM

OSMMembership:
  hospital = A
  area/assignment = TBD
```

---

# 11. Patient Registration and Provisioning

A patient registered by a trusted actor must not be required to register again.

Hospital and OSM may provision a patient when permitted by policy.

Conceptual flow:

```text
Hospital / OSM
       ↓
Register Patient
       ↓
Resolve identity
       ↓
┌───────────────────────┐
│ Existing Person found? │
└───────────────────────┘
       ↓            ↓
      YES          NO
       ↓            ↓
     reuse        create
       └──────┬─────┘
              ↓
      Patient Profile
              ↓
        PATIENT role
              ↓
     Account provisioning
```

Identity resolution is mandatory before creating a new Person.

---

# 12. Patient First-Time Activation Instead of Re-Registration

Patient registration and account activation are separate operations.

```text
Registration ≠ Activation
```

Trusted actors may register/provision the patient.

The patient activates their own interactive account.

Conceptual UX:

```text
Patient already provisioned
       ↓
"เข้าใช้งานครั้งแรก"
       ↓
Identity verification
       ↓
OTP / approved verification mechanism
       ↓
Set credential if required
       ↓
Account ACTIVE
       ↓
Login
```

The UI should avoid asking the patient to "สมัครสมาชิก" again when the patient already exists in DEMI.

---

# 13. Staff Must Not Know Patient Credentials

Hospital/OSM may provision a patient identity, but they must not know or choose the patient's secret credential.

Do not create credentials from predictable data such as:

```text
birth date
last digits of national ID
phone number
123456
```

Provisioning capability and credential management are separate concerns.

Example:

```text
OSM:
  patient:provision        ALLOWED

OSM:
  credential:read          DENIED
  credential:set-password  DENIED
```

The patient owns account activation/credential establishment.

---

# 14. Account Lifecycle Baseline

Keep lifecycle states simple for MVP.

## Hospital

```text
PENDING_VERIFICATION
        ↓
ACTIVE
        ↓
SUSPENDED
```

## Staff / OSM

```text
PROVISIONED / INVITED
        ↓
ACTIVE
        ↓
SUSPENDED
```

## Patient

```text
PROVISIONED
        ↓
ACTIVE
        ↓
SUSPENDED
```

Additional states should only be introduced when a real business requirement requires them.

---

# 15. Capability-Based Authorization

The initial system should use a capability vocabulary rather than spread role checks throughout pages/actions.

Potential capability namespace:

```text
patient:create
patient:provision
patient:read
patient:update
patient:assign

screening:create
screening:update
screening:review

care-plan:create
care-plan:update
care-plan:approve

appointment:create
appointment:update

visit:create

followup:create

report:read

hospital:manage

membership:create
membership:update
membership:disable

audit:read

data:reconcile
```

This list is a starting vocabulary, not a final permission matrix.

Detailed role-to-capability mapping must be derived from business requirements.

---

# 16. Scope Is a First-Class Authorization Concept

Potential scope types:

```text
GLOBAL
HOSPITAL
HOSPITAL_NETWORK
AREA
ASSIGNED_PATIENTS
SELF
DENIED
```

Rules:

- authorization must be evaluated server side
- errors must default to `DENIED`
- ambiguous/failed scope resolution must not imply global access
- client state must never be authoritative for access scope

Example:

```text
Actor: OSM
Capability: patient:update
Scope: ASSIGNED_PATIENTS
Target: P100

P100 assigned to actor
→ ALLOW

P999 not assigned
→ DENY
```

Role alone is never sufficient proof of access.

---

# 17. Multi-Hospital Membership Must Be Supported

A user may belong to multiple hospitals.

Example:

```text
Person A
  │
User A
  │
  ├── HospitalMembership
  │      hospital = A
  │      profession = DOCTOR
  │
  └── HospitalMembership
         hospital = B
         profession = DOCTOR
```

Do not duplicate User or Person solely because the same person works in another hospital.

The product may later expose an active workspace/context selector when necessary.

---

# 18. Trust Chain

The intended trust model is:

```text
DEMI Platform Admin
        ↓
Hospital Owner
        ↓
Hospital Personnel / OSM
        ↓
Patient relationship and care workflows
```

This does not mean each lower actor is controlled manually for every action. It means identity, membership, and provisioning originate from a trusted upstream context rather than from arbitrary self-selection.

---

# 19. Application Architecture Baseline

Target client, transport, and server-side architecture:

```text
Responsive Web ──→ Server Action ─────────┐
                                          │
LIFF ────────────→ Server Action /        │
                    HTTP API? ────────────┼→ Application Service
                                          │           ↓
Native (future) ─→ HTTP API ──────────────┘  Policy / Authorization
                                                      ↓
                                                    Prisma
                                                      ↓
                                             PostgreSQL / Supabase
```

Server Actions and HTTP APIs are peer transport adapters above Application Service. The `?` indicates that LIFF does not automatically require a dedicated HTTP endpoint; the transport depends on an identified LIFF use case.

## 19.1 Client / UI

Responsible for:

- rendering
- form interaction
- client UX

Not responsible for final authorization decisions.

## 19.2 Server Action / Route Handler

Responsible for:

- transport boundary
- input validation
- authentication/session resolution
- invoking application services
- mapping application results/errors to the client transport

Server Actions are the web transport adapter. Route Handlers may expose versioned HTTP APIs when an identified non-Server-Action client requires them. Avoid placing business logic, authorization policy, or Prisma orchestration directly in either adapter.

## 19.3 Application Service

The application service is the source of truth for business operations.

Examples:

```text
registerPatient()
assignOsm()
activatePatientAccount()
inviteHospitalMember()
approveHospital()
```

Services coordinate domain rules, authorization policies, and persistence.

Application Services must accept application-level inputs rather than Next.js, LIFF, React, or browser-specific request objects so the same operation can be reused across transports.

## 19.4 Policy / Authorization

Centralizes rules such as:

```text
canUpdatePatient()
canAssignOsm()
canReviewScreening()
```

Avoid repeated role/scope checks across pages.

## 19.5 Prisma / Database

Responsible for:

- typed persistence
- queries
- transactions
- database interaction

Prisma does not replace authorization; authorization must occur before or as part of scoped data access.

## 19.6 Client and Transport Architecture

Current client/access channels:

```text
Responsive Web
LIFF
```

Future client:

```text
Native mobile application
```

Architectural relationship:

```text
Web → Server Action ─────────┐
                             │
LIFF → HTTP API? ────────────┼→ Application Service → Policy → Prisma
                             │
Native → HTTP API ───────────┘
```

Accepted rules:

- Responsive Web remains the primary implementation platform initially.
- Field UX is mobile-first; `OSM` and `PATIENT` are the primary mobile-first actor experiences.
- Platform `ADMIN` and Hospital management may use desktop-enhanced experiences where appropriate.
- LIFF is a client/access channel, not the source of Person/User identity, role, membership, capability, or scope.
- Native mobile development is deferred until product evidence justifies it.
- Business logic remains transport-independent in Application Services.
- Server Actions and HTTP APIs invoke the same Application Service and authorization policy.
- HTTP APIs are created incrementally for actual client/integration requirements under a versioned namespace such as `/api/v1`; an equivalent Server Action alone is not a reason to create an endpoint.
- Future native authentication remains unresolved. Do not introduce native token/OAuth architecture without an approved requirement and decision.

See [ADR-0007](../adr/0007-client-transport-and-mobile-ready-architecture.md) for the accepted decision and intentionally open questions.

### 19.6.1 Mobile UX Architectural Guidance

For field-oriented `OSM` and `PATIENT` experiences, prefer:

- responsive mobile-first layout with touch-friendly interaction targets
- workflows that do not rely on hover or desktop-only input
- mobile-appropriate list/card/detail patterns instead of desktop-width tables as the primary workflow
- long forms divided into understandable sections with clear progress/context
- predictable submission, loading, success, validation, and error states
- duplicate-submission protection for consequential operations
- graceful handling of slow or unstable field networks where practical
- mobile-friendly file/camera upload flows when an approved requirement introduces them

These principles guide future UI work but do not define a complete design system. Offline synchronization is not part of the current implementation scope and remains an open requirement.

---

## 19.7 Phase 1 Foundation Implementation Notes

Phase 1 concretizes the following implementation boundaries without closing the still-open product decisions:

- Prisma uses PostgreSQL through `DATABASE_URL` and the explicit `DIRECT_URL` connection; the schema contains only stable foundation entities and the migration is reproducible from an empty development database. Both values are server-side only and must never contain browser-exposed credentials.
- Supabase Auth is the current server authentication adapter. A Next.js 16 `proxy.ts` creates a request-scoped Supabase SSR client and calls `auth.getClaims()` early so refreshed cookies propagate to both the current request and outgoing response. The authenticated provider subject is then validated with `auth.getUser()`, mapped to `User.authSubject`, and used to load `Person`, roles, and memberships from Prisma.
- Supabase user metadata, browser state, and client-provided role or hospital values are not application authorization sources.
- `Person.identityKeyHash` is a deterministic HMAC-SHA-256 lookup key using the server-only `IDENTITY_HASH_SECRET`; it is not a finalized external-provider or LINE identity schema. Raw identity values and the secret are never logged.
- Prisma migration commands run through an explicit database-target preflight. Development/test operations cannot target production; production deployment requires explicit production classification.
- Audit persistence accepts either the global Prisma client or a transaction-compatible Prisma client, allowing a future consistency-critical Application Service to coordinate its audit write in the same transaction.
- `AuditEvent.actorUserId` uses a restrictive foreign key in the current foundation. A User with audit history cannot be hard-deleted; `SUSPENDED` is the available deactivation state until a deletion policy is confirmed.
- A focused integration suite verifies the PostgreSQL constraints against a dedicated test database. Local development uses the disposable PostgreSQL service in `compose.integration.yaml`, configured by `.env.integration` and bound only to `127.0.0.1:55432`. `npm run test:integration:local` recreates the empty database, applies migrations, runs integration tests, and removes the Compose resources; the manual commands are documented in the repository [README](../../README.md). Integration commands require `DEMI_DATABASE_TARGET=test` and require `DATABASE_URL`, `DIRECT_URL`, and `DEMI_TEST_DATABASE_URL` to identify the same test database.
- Future authentication providers may be added behind the authentication adapter boundary after a confirmed requirement and decision.

The implementation structure and environment commands are maintained in the repository [README](../../README.md). These notes describe the current foundation implementation; they do not add capability, scope, clinical, or onboarding semantics that remain unresolved.

## 19.8 Phase 2.1 National ID Login Adapter

The confirmed primary interactive login flow is:

```text
Thai National ID + user-owned password
        ↓
server validation + HMAC identity resolution
        ↓
Person.identityKeyHash → Person → User
        ↓
opaque provider alias derived from User.id
        ↓
Supabase password authentication
        ↓
validated provider subject = User.authSubject
        ↓
ACTIVE ActorContext
```

- National ID identifies the Person for login resolution; it is not the password or an authorization source.
- Raw National ID is not stored in a new login column, sent to Supabase, logged, or returned to the browser.
- The provider alias is a server-only adapter identifier, not a contact address or source of DEMI authority.
- `User.authSubject` retains its established provider-subject meaning.
- Provider success remains insufficient without matching the expected subject and resolving an ACTIVE DEMI actor.
- Supabase metadata and browser state remain non-authoritative; roles and memberships come from DEMI application data.
- Provider account creation, account transition, patient activation, onboarding, LIFF, ThaID, and native authentication remain separate future requirements.

---

# 20. Transaction and Data Integrity Baseline

Any business operation that changes multiple related records must be atomic where consistency requires it.

Example patient registration may involve:

```text
Person
+
User/account provisioning
+
PATIENT role
+
Patient Profile
+
Hospital relationship
+
OSM assignment
+
Audit event
```

Expected result:

```text
ALL SUCCESS
```

or:

```text
ALL ROLLBACK
```

Do not leave partial business state such as a Person without the required Patient profile because a later write failed.

---

# 21. Initial Business Ownership Model

The redesign emphasizes actions being performed by the actor closest to the real process.

Conceptually:

```text
Patient ──────────────┐
                      ├── Hospital / care workflow
OSM ──────────────────┘
```

Admin is primarily outside the happy path:

```text
Admin
  ↓
governance
verification
audit
recovery
reconciliation
exception handling
```

This is an intentional change from the legacy design where Admin carried too much operational work.

---

# 22. Architectural Decisions Marked as Baseline

The following decisions are accepted for project initialization:

1. Four top-level roles: `ADMIN`, `HOSPITAL`, `OSM`, `PATIENT`.
2. `Person` is separate from `User`.
3. A human should have one core identity rather than duplicate users for each role.
4. A User may have multiple roles.
5. A User may have multiple hospital memberships.
6. Doctor/Nurse are initially profession/staff classifications, not top-level roles.
7. Hospital Owner is `HOSPITAL` with owner membership, not Platform `ADMIN`.
8. No general public signup where users choose their own role.
9. Public signup is primarily hospital organization onboarding.
10. Hospital onboarding requires platform-side verification before activation.
11. Hospital Owner provisions/invites relevant hospital personnel and OSM.
12. Staff and OSM do not self-select their role.
13. Hospital/OSM may register/provision patients where policy allows.
14. A provisioned patient does not register again.
15. Patient uses first-time account activation.
16. Hospital/OSM must not know or assign patient secret credentials.
17. Authorization model is Role + Capability + Scope.
18. Authorization is server-side and fail-closed.
19. Scope is a first-class concept.
20. Multi-record consistency-critical operations use transactions.
21. Admin focuses on governance/recovery rather than normal operational work.
22. The application boundary is Client → Transport Adapter → Application Service → Policy → Prisma/DB.
23. Responsive Web is the primary initial implementation platform and field UX is mobile-first.
24. `OSM` and `PATIENT` are the primary mobile-first actor experiences; Admin/Hospital experiences may be desktop-enhanced.
25. LIFF is an initial client/access channel, not DEMI identity or authorization authority.
26. Server Actions and HTTP APIs are peer transport adapters; business logic belongs in transport-agnostic Application Services.
27. HTTP APIs are introduced incrementally for identified consumers rather than generated for every Server Action.
28. Native mobile applications are future clients and will use HTTP APIs without depending on Server Actions.
29. Future native authentication, offline behavior, synchronization, push notifications, and native framework choices remain unresolved.

---

# 23. Explicitly Unresolved Questions

Do not invent answers to these while initializing the project.

They require confirmed business requirements:

- Is OSM scope based on area, assigned patients, hospital, or a combination?
- What can a parent/main hospital see or manage in child hospitals?
- Can a Hospital Owner appoint other Owners?
- Do doctors and nurses need different permissions?
- Who may approve a care plan?
- Which patient fields may patients edit themselves?
- Which health measurements may patients submit themselves?
- Who creates/reschedules/cancels appointments?
- Can OSM transfer or reassign a patient?
- Can patients change their hospital affiliation?
- What evidence is required to verify a hospital signup?
- Which channel will be used for activation: phone OTP, email, external identity provider, ThaID, or another mechanism?
- What clinical data requires immutable/auditable history?
- What reports are required and what scope applies to each actor?

Mobile, LIFF, and API requirements that remain open:

- Which workflows will first be exposed through LIFF?
- Will LIFF primarily target OSM, Patient, or both?
- What exact LINE account-linking/activation flow will be used?
- Which future operations require `/api/v1`?
- What authentication scheme will future native clients use?
- Does field usage eventually require offline-first behavior?
- Is background synchronization needed?
- Are push notifications required from a future native app?
- Which device capabilities may eventually require a native client?
- When does product evidence justify creating the native application?

Until confirmed, represent these as open requirements rather than implementation assumptions.

---

# 24. Recommended Next Documentation

During repository initialization, create and maintain:

```text
docs/
├── CONTEXT.md
├── architecture/
│   └── DEMI_ARCHITECTURE_BASELINE.md
└── adr/
    ├── README.md
    ├── 0001-person-and-user-identity.md
    ├── 0002-role-capability-scope-authorization.md
    ├── 0003-hospital-led-onboarding.md
    ├── 0004-patient-provisioning-and-activation.md
    ├── 0005-server-side-application-boundary.md
    ├── 0006-transactional-business-operations.md
    └── 0007-client-transport-and-mobile-ready-architecture.md
```

`CONTEXT.md` should summarize the current project state and direct agents/developers to the ADRs rather than duplicating every decision.

ADRs should record why each decision exists, alternatives rejected, consequences, and unresolved follow-up questions.

Operational entry points:

- [Project context](../CONTEXT.md)
- [ADR index](../adr/README.md)

---

# 25. Source-of-Truth Rule

For the init phase:

1. Confirmed business requirements override assumptions.
2. Accepted ADRs are the source of truth for architectural decisions.
3. This baseline document is the accepted architecture seed/reference.
4. `CONTEXT.md` is the short operational orientation for humans/agents.
5. The legacy DEMI repository is a reference for existing behavior and reusable domain knowledge, not the architectural source of truth for the rewrite.
6. Do not copy legacy authorization/authentication patterns into the new project merely for behavioral parity.
7. When a newer accepted ADR materially changes this architecture, update this baseline and `CONTEXT.md` in the same change so the current guidance remains consistent.

---

## Baseline Summary

```text
                        PERSON
                           │
                         USER
                           │
            ┌──────────────┼──────────────┐
            │              │              │
          Roles        Memberships      Sessions
            │              │
    ┌───────┼───────┬──────┴───────┐
    │       │       │              │
  ADMIN  HOSPITAL  OSM          PATIENT
            │       │              │
        Hospital   Scope/          SELF
        Scope      Assignment
```

All important operations follow:

```text
Client
        ↓
Transport Adapter
        ↓
Application Service
        ↓
Policy / Authorization
  ├── Authenticated Actor
  ├── Role / Membership
  ├── Capability
  └── Resource Scope
        ↓
Transaction / Persistence
```

This is the accepted starting architecture for DEMI project initialization.
