# Prompt for Coding Agents — Initialize DEMI Architecture Documentation

You are initializing the rewritten DEMI project.

Your task is to establish the project architecture documentation baseline before feature implementation.

## Primary source

Use the provided `DEMI_ARCHITECTURE_BASELINE.md` as the authoritative seed document for this task.

The legacy DEMI repository may be inspected only to understand existing business behavior, terminology, and reusable requirements. Do **not** copy its authentication, authorization, user-role, or data-access architecture into the new project merely for compatibility.

Do not invent unresolved business requirements.

## Goal

Create maintainable project documentation that allows future developers and coding agents to understand:

- what DEMI is being redesigned to solve
- the architectural boundaries already accepted
- which decisions are fixed for initialization
- which decisions are deliberately still open
- where future architecture changes must be recorded

Keep the documentation MVP/production-ready, clear, concise, and practical. Avoid enterprise ceremony and avoid over-engineering.

## Required files

Create this structure unless an equivalent `docs/` structure already exists:

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
    └── 0006-transactional-business-operations.md
```

Copy/adapt the supplied architecture baseline into:

```text
docs/architecture/DEMI_ARCHITECTURE_BASELINE.md
```

Preserve its meaning. Improve formatting only where useful.

---

# CONTEXT.md Requirements

`docs/CONTEXT.md` is the short operational context for developers and AI coding agents.

It must not become a duplicate 20-page architecture document.

Include:

## 1. Project purpose

State that DEMI is being rewritten/redesigned and the legacy repository is a behavior/reference source, not the target architecture.

## 2. Current phase

State that the project is in initialization + requirement discovery.

Business flows for each role/domain are still being refined.

## 3. Actors

List the accepted top-level roles:

```text
ADMIN
HOSPITAL
OSM
PATIENT
```

Summarize their responsibility in one or two sentences each.

## 4. Critical architecture rules

Include concise rules:

- Person is separate from User.
- One human must not receive duplicate identities simply because they have another role.
- Users may have multiple roles.
- Users may have multiple hospital memberships.
- Doctor/Nurse are initially profession classifications, not top-level roles.
- Hospital Owner is HOSPITAL + owner membership, not Platform ADMIN.
- No public role-selection signup.
- Public signup is hospital onboarding.
- Staff/OSM are provisioned/invited by trusted hospital context.
- Patients provisioned by Hospital/OSM do not register again; they activate their account.
- Authorization = Role + Capability + Scope.
- Authorization is server-side and fail-closed.
- Client/browser state is never authoritative for permission.
- Multi-record consistency-critical operations must be transactional.
- Admin is primarily governance/recovery, not routine operational workflow.

## 5. Application boundary

Document:

```text
Client / UI
    ↓
Server Action / Route Handler
    ↓
Application Service
    ↓
Policy / Authorization
    ↓
Prisma
    ↓
PostgreSQL / Supabase
```

Explain each layer briefly.

## 6. Open requirements

Link to or list the unresolved requirements from the architecture baseline.

Explicitly tell agents:

> If a required business rule is not documented, do not guess it. Mark it as an open requirement or ask for clarification.

## 7. Source-of-truth hierarchy

Document:

1. Confirmed current business requirements
2. Accepted ADRs
3. Architecture baseline
4. CONTEXT.md
5. Legacy code only as behavioral reference

If a newer accepted ADR changes the baseline, update the baseline/context accordingly.

## 8. Agent working rules

Include:

- Preserve Thai UTF-8 content; do not introduce mojibake.
- Prefer correctness and simple maintainable implementation over abstraction.
- Do not create generic RBAC frameworks before actual requirements need them.
- Do not encode authorization only in UI.
- Do not add business permissions merely because a profession exists.
- Do not invent patient/hospital/OSM scope semantics.
- Keep docs synchronized when an architectural decision changes.

---

# ADR Requirements

Use a lightweight ADR format.

Every ADR should contain:

```markdown
# ADR-NNNN: Title

- Status: Accepted
- Date: YYYY-MM-DD

## Context

## Decision

## Rationale

## Alternatives Considered

## Consequences

### Positive

### Trade-offs / Risks

## Open Questions

## References
```

Do not pad ADRs with generic theory. Write specifically for DEMI.

---

# ADR-0001 — Person and User Identity

Document the decision that:

- Person represents the real human.
- User represents the application account.
- A Person may exist without an activated User account.
- One human should have one core identity.
- A user/person may participate in multiple roles.
- Do not create duplicate users for OSM + Patient or multi-hospital membership.
- Identity resolution must occur before creating a new Person.

Explain why a single `users.role` + `hospital_id` model is rejected.

Mention consequences such as identity-linking logic and duplicate resolution requirements.

Do not finalize exact database columns unless the implementation has already established them.

---

# ADR-0002 — Role, Capability, and Scope Authorization

Document:

```text
Role + Capability + Scope → Policy Decision
```

Accepted top-level roles:

```text
ADMIN
HOSPITAL
OSM
PATIENT
```

Clarify:

- role is not equivalent to permission
- scope is first-class
- server is authoritative
- authorization fails closed
- client/local state cannot grant authority
- Doctor/Nurse are not automatically top-level authorization roles
- exact capability matrix is still requirement-driven

Potential scope vocabulary may be documented as conceptual:

```text
GLOBAL
HOSPITAL
HOSPITAL_NETWORK
AREA
ASSIGNED_PATIENTS
SELF
DENIED
```

Do not claim unresolved scope semantics are final.

---

# ADR-0003 — Hospital-Led Onboarding

Document:

- no generic public signup where users choose roles
- public signup is hospital organization onboarding
- hospital must be verified before activation
- first approved applicant becomes `HOSPITAL` + owner membership
- Hospital Owner is not Platform ADMIN
- Hospital Owner provisions/invites hospital staff and OSM
- Doctor/Nurse are initially profession classifications under hospital membership
- use trusted hospital master where feasible instead of uncontrolled free-text hospital creation

Keep the exact hospital verification process open.

---

# ADR-0004 — Patient Provisioning and First-Time Activation

Document:

- Hospital/OSM may register/provision a patient where policy permits
- identity lookup occurs before creating Person
- patient does not perform a second registration
- patient performs first-time account activation instead
- provisioning and credential ownership are separate
- staff/OSM must not know/set predictable patient passwords
- account activation mechanism remains configurable/open pending requirement, e.g. OTP/external identity

Make clear:

```text
Registration ≠ Account Activation
```

---

# ADR-0005 — Server-Side Application Boundary

Document the accepted architecture:

```text
Client / UI
    ↓
Server Action / Route Handler
    ↓
Application Service
    ↓
Policy / Authorization
    ↓
Prisma
    ↓
PostgreSQL / Supabase
```

Decision details:

- UI handles rendering/forms, not final authorization
- server boundary authenticates and validates input
- application services own business orchestration
- policy layer centralizes authorization logic
- Prisma handles typed persistence/transactions
- avoid business rules/query logic scattered through page components
- avoid turning Server Actions into another god layer
- Supabase may provide PostgreSQL and related managed services, but database provider does not replace application authorization

Do not create unnecessary repository layers unless they provide a concrete benefit.

---

# ADR-0006 — Transactional Business Operations

Document:

- operations that must maintain consistency across multiple records must be atomic
- partial success is considered invalid business state
- patient provisioning is a representative example
- transactions belong around a business operation, not arbitrarily around every query
- audit events related to successful state changes should be coordinated consistently
- error handling must preserve data integrity

Example conceptual operation:

```text
resolve/create Person
+
provision User when needed
+
assign PATIENT role
+
create Patient Profile
+
create hospital relationship
+
create OSM assignment when applicable
=
one consistency-critical business operation
```

Do not prematurely decide exact transaction boundaries for modules whose requirements are unknown.

---

# ADR Index

Create `docs/adr/README.md` containing:

- what an ADR is in this project
- status values used: `Proposed`, `Accepted`, `Superseded`, `Deprecated`
- file naming convention
- index/table linking all ADRs
- rule: do not rewrite accepted ADR history silently; supersede an ADR when the decision materially changes
- lightweight guidance for when a new ADR is needed

A new ADR is warranted for decisions that are:

- architectural
- difficult/costly to reverse
- cross-module
- security/data-integrity boundaries
- likely to be questioned later

Do not create ADRs for routine implementation details.

---

# Validation Before Finishing

Before completing the task:

1. Inspect existing repo/docs structure.
2. Avoid overwriting meaningful existing project documentation without merging intentionally.
3. Verify all Markdown links.
4. Ensure all files are UTF-8.
5. Ensure Thai text is preserved correctly.
6. Search for contradictions among `CONTEXT.md`, baseline, and ADRs.
7. Ensure unresolved business rules remain explicitly unresolved.
8. Do not implement product features as part of this documentation task.
9. Do not design a full database schema yet unless a separate approved task requires it.
10. Do not add speculative Doctor/Nurse/OSM permissions.

Return a concise summary of:

- files created/updated
- ADR decisions captured
- unresolved decisions intentionally left open
- any existing documentation conflicts found
