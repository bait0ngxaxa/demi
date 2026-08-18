# DEMI Phase 12C — Hospital Owner Governance + Account Recovery Detailed Contract

## 1. Document status and purpose

**Status:** Analysis and contract definition complete. This document is not a customer-approved production policy and does not implement product behavior.

**Implementation scope:** Documentation only. Phase 12C adds no Prisma schema, migration, route, Server Action, service, UI, authentication-provider integration, password-reset flow, session-revocation infrastructure, Owner mutation, or new product-behavior test.

This contract translates the evidence available after Phase 12A analysis and the Phase 12B.0 Hospital lifecycle prototype into a bounded, implementation-ready candidate for Phase 12D.0. It keeps Hospital Owner governance, account recovery, User account lifecycle, first-time activation, identity reconciliation, and authentication-provider/session consequences as separate domains.

The recommended Owner behavior below is explicitly a **provisional Phase 12D.0 requirement-validation behavior**. It is not a final customer requirement. Recovery remains deferred where identity/control proof, delivery, provider, or session semantics are not accepted.

## 2. Evidence classification

The following labels are used throughout this document.

| Label | Meaning |
| --- | --- |
| **Current accepted contract** | An accepted architecture or requirement already established by current DEMI documentation or ADRs. |
| **Direct current implementation evidence** | Behavior observed in the current schema, source, tests, or runtime-facing implementation. |
| **Direct legacy evidence** | Behavior observed in the pinned legacy repository. It is evidence of terminology or prior operator expectation only. |
| **Inference** | A conclusion derived from more than one evidence source, not itself an accepted requirement. |
| **Provisional proposal** | A bounded candidate behavior recommended for validation in a future prototype. |
| **Open requirement** | A customer, security, integration, policy, or operational decision that is not resolved by current evidence. |
| **Rejected legacy architecture** | A legacy pattern explicitly unsuitable for the current DEMI architecture. |

No schema permissiveness, prototype behavior, legacy behavior, or implementation convenience is silently promoted to a customer requirement.

## 3. Sources inspected

### 3.1 Current DEMI sources

The contract was prepared after inspecting:

- [Project Context](../CONTEXT.md)
- [Architecture Baseline](../architecture/DEMI_ARCHITECTURE_BASELINE.md)
- [Phase 12A requirements analysis](./PHASE_12A_HOSPITAL_GOVERNANCE_ACCOUNT_RECOVERY_REQUIREMENTS.md)
- [Phase 12B.0 Hospital lifecycle prototype](./PHASE_12B0_HOSPITAL_LIFECYCLE_WORKING_PROTOTYPE.md)
- [ADR-0001 Person and User identity](../adr/0001-person-and-user-identity.md)
- [ADR-0002 Role, Capability, and Scope authorization](../adr/0002-role-capability-scope-authorization.md)
- [ADR-0003 Hospital-led onboarding](../adr/0003-hospital-led-onboarding.md)
- [ADR-0004 Patient provisioning and first-time activation](../adr/0004-patient-provisioning-and-activation.md)
- [ADR-0005 Server-side application boundary](../adr/0005-server-side-application-boundary.md)
- [ADR-0006 Transactional business operations](../adr/0006-transactional-business-operations.md)
- [ADR-0007 Client transport and mobile-ready architecture](../adr/0007-client-transport-and-mobile-ready-architecture.md)
- [ADR-0008 Workforce provisioning and first-time activation](../adr/0008-workforce-provisioning-and-activation.md)
- `prisma/schema.prisma` and the current migrations
- `src/modules/auth/`
- `src/modules/identity/`
- `src/modules/hospital-onboarding/`
- `src/modules/hospital-governance/`
- `src/modules/workforce/`
- `src/modules/patient-activation/`
- `src/modules/audit/`
- relevant integration and unit tests under `tests/`

The current implementation inspection included ActorContext construction, application access resolution, login identity resolution, password authentication, provider alias generation, password-identity provisioning, sign-out, activation issuance/reissue/claim/completion, HospitalMembership lifecycle operations, OSM relationship lifecycle operations, Phase 11B.0 transaction patterns, Phase 12B.0 transaction patterns, and bounded audit validation.

### 3.2 Legacy source

The locally available legacy checkout was inspected at:

`C:\Users\Bait0ng\Desktop\legacy-demi\demi-plus-web-v2`

Pinned legacy commit:

`7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e`

The legacy review focused on Hospital administration, staff administration, account disable/restore/delete, password reset or creation, settings password gates, and browser-direct authentication/account mutation. Legacy behavior is not target architecture.

The inspected legacy evidence included `app/admin/hospitals/page.tsx`, `app/admin/staff/page.tsx`, `lib/supabase/queries.ts`, and `app/admin/settings/page.tsx` at the pinned commit.

## 4. Preserved identity and authorization contract

The following is **Current accepted contract** and is not reopened by Phase 12C:

- `Person != User`. `Person` is the durable human identity; `User` is the application account, credential, session, and account-lifecycle subject.
- `Role != HospitalMembership`. A top-level role expresses an application capability family; a Hospital membership expresses a relationship to one exact Hospital.
- The top-level roles remain `ADMIN`, `HOSPITAL`, `OSM`, and `PATIENT`. `OWNER` is not a new top-level role.
- A Hospital Owner is represented as:

  ```text
  User
    + Role.HOSPITAL
    + HospitalMembership
        membershipType = OWNER
  ```

- Owner authority is the combination of role, capability, and exact Hospital scope. A parent Hospital, hierarchy relation, `admin_type`, or global manager concept does not grant Owner authority.
- Platform `ADMIN` is the control-plane Hospital lifecycle and governance role. It is not automatically a Hospital’s operational Owner.
- Server-side ActorContext and policy checks are authoritative. Browser input may select a target and carry stale-write expectations, but it does not establish role, ownership, or scope.
- Provider identity is an authentication adapter. It is not a source of Hospital authority, role, Person identity, or a user-owned contact mailbox.

### 4.1 Current ActorContext and application access

**Direct current implementation evidence:** `ActorContext` contains the resolved `userId` and `personId`, the User’s top-level roles, exact Hospital memberships, and exact Hospital OSM relationships. Each membership projection includes the Hospital ID, membership type, profession, membership status, and current Hospital status. ActorContext is built server-side after provider subject resolution and database re-read; it is not accepted from the browser.

Application access requires a resolved authenticated User and denies a User whose account status is not `ACTIVE`. Domain policies then apply capability and exact-scope checks, including active Hospital and active membership conditions where the operation requires them. This is why a provider-authenticated session alone does not establish Owner authority.

## 5. Current Hospital Owner representation

### 5.1 Schema facts

The following is **Direct current implementation evidence** from `prisma/schema.prisma` and the current migration history:

- `HospitalMembership` has one row per `(userId, hospitalId)` through `@@unique([userId, hospitalId])`.
- `HospitalMembership.membershipType` is an enum with `OWNER` and `MEMBER`.
- `HospitalMembership.status` is separate from `membershipType` and supports `PROVISIONED`, `INVITED`, `ACTIVE`, and `SUSPENDED`.
- `User.status` is separate from membership status and supports `PROVISIONED`, `INVITED`, `ACTIVE`, and `SUSPENDED`.
- `Hospital.status` is separate from both and supports `PENDING_VERIFICATION`, `ACTIVE`, and `SUSPENDED`.
- There is no database uniqueness constraint restricting one `OWNER` membership per Hospital.
- There is no database constraint requiring one or more active Owners for an ACTIVE Hospital.
- The uniqueness constraint is per user/Hospital pair, not per membership type. A user cannot have both a MEMBER row and an OWNER row for the same Hospital; the existing row’s `membershipType` would change in a future governance operation.

Therefore, the schema **permits multiple Users with `membershipType = OWNER` in one Hospital**. That is schema permissiveness, not evidence that the customer has accepted a multiple-Owner policy.

### 5.2 Current creation and mutation behavior

The following is **Direct current implementation evidence**:

- Hospital onboarding approval requires an active Platform `ADMIN`, transitions the exact Hospital from `PENDING_VERIFICATION` to `ACTIVE`, activates the applicant User, upserts `Role.HOSPITAL`, creates the applicant’s exact `ACTIVE OWNER` membership, and writes an atomic onboarding audit event.
- Onboarding rejects approval when an active `OWNER` membership already exists in the exact Hospital. This is a guard for initial onboarding approval and does not prove a permanent exactly-one-Owner rule.
- Workforce provisioning requires an eligible Owner of the exact active Hospital. It creates or reuses workforce relationships and refuses to downgrade an existing Owner membership to `MEMBER` as a side effect of provisioning.
- The Phase 11B.0 staff membership lifecycle deliberately excludes Owner rows from ordinary profession and membership suspend/restore mutations.
- No current reviewed application service implements Owner promotion, demotion, transfer, deletion, or replacement.
- Phase 12B.0 implements only Platform `ADMIN` Hospital `ACTIVE <-> SUSPENDED` status changes. It deliberately excludes Owner governance and account recovery.
- Current code has no supported `User` account suspend/restore workflow. `UserStatus.SUSPENDED` exists in the schema and is enforced by ActorContext, but normal product services do not provide `suspendUser()` or `restoreUser()`.

### 5.3 `Role.HOSPITAL` consistency

The following is **Direct current implementation evidence** plus an **Inference**:

- Current onboarding and workforce provisioning establish `Role.HOSPITAL` for Hospital workforce Users. The accepted Owner representation includes this role.
- The current code has no supported cleanup rule that removes `Role.HOSPITAL` when a User loses one specific Hospital membership. It also has no Owner governance service that repairs a missing role.
- A future Owner governance prototype should validate that the target User has `Role.HOSPITAL` as a consistency condition, but should not add or delete the role as an incidental side effect of an Owner membership transition.
- A missing `Role.HOSPITAL` for an otherwise candidate target is an invalid or reconciliation-required state for the prototype. It should be rejected with a safe domain conflict rather than silently repaired.
- Demoting a membership in Hospital A must never remove `Role.HOSPITAL` when the User still has a valid Hospital relationship in Hospital B. More generally, global role cleanup semantics remain **Open requirement**.

## 6. Owner policy models

The following comparison is an **Inference** based on the current schema, accepted architecture, recovery gaps, and operational constraints. It is not a customer decision.

| Model | Definition | Current schema compatibility | Operational simplicity | Recovery implications | Concurrency and support risks | Future flexibility | Premature concepts introduced |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **A — Owner Set** | Multiple operational Owners may exist. Governance changes an exact membership between `MEMBER` and `OWNER`, while an ACTIVE Hospital cannot commit with zero eligible Owners. | Fits the existing `HospitalMembership` model. No migration is expected for the bounded prototype. | Bounded and familiar. Redundancy helps ordinary availability. | A final inaccessible Owner may still require assisted recovery or replacement, but there is no single primary credential to protect. | Concurrent demotions can violate the at-least-one invariant unless the transaction enforces it. Support must understand multiple Owners. | Leaves room for a later primary or recovery concept if requirements justify it. | None beyond a provisional policy over the existing model. |
| **B — Exactly One Owner** | Each active Hospital has one authoritative Owner; transfer replaces the current Owner. | Not enforced by the schema. A unique or equivalent invariant and explicit transfer/recovery exceptions would be needed. | Clear accountability, but every transfer and final-owner outage becomes a critical operation. | A lost single Owner can block routine governance. Recovery and dispute handling become mandatory earlier. | Transfer, demotion, suspension, and concurrent replacement require stronger invariants and more exceptional support paths. | Less flexible for redundancy and ordinary delegation. | “Exactly one” and transfer semantics not accepted by current evidence. |
| **C — Owner Set + Primary/Recovery Owner** | Multiple operational Owners exist, with one distinguished primary or recovery Owner. | Requires a new field or relation and new authorization/recovery rules. | More expressive but more policy and UI complexity. | Creates a high-value primary/recovery target and new dispute/fallback semantics. | Primary changes, outages, notifications, and conflicting claims require additional concurrency and support rules. | Broadest future policy space if the customer actually needs it. | `PRIMARY_OWNER`, `RECOVERY_OWNER`, and related authority concepts are not present today. |

### 6.1 Provisional model selection

**Provisional proposal:** Use **Model A — Owner Set** as the candidate policy for the bounded Phase 12D.0 working prototype.

Reasons:

- It fits the current `(userId, hospitalId)` membership representation.
- It avoids inventing `PRIMARY_OWNER`, `RECOVERY_OWNER`, or a new top-level `OWNER` role.
- It permits redundant operational ownership while active-account recovery remains unresolved.
- It can be validated without a schema migration.
- It keeps the final customer policy open rather than making a difficult-to-reverse single-owner decision.

This selection is **not customer-approved**. A future product decision may select Model B or Model C after customer, support, recovery, and dispute requirements are accepted.

## 7. Eligible Owner and last-Owner invariant

### 7.1 Provisional eligible Owner definition

For the bounded prototype, an **eligible Owner** is a User satisfying all conditions below for the same exact Hospital:

```text
Hospital.status = ACTIVE
AND User.status = ACTIVE
AND HospitalMembership.hospitalId = exact Hospital
AND HospitalMembership.membershipType = OWNER
AND HospitalMembership.status = ACTIVE
AND User has Role.HOSPITAL
```

This is a **Provisional proposal** derived from the accepted Owner representation and current ActorContext/policy behavior. `Role.HOSPITAL` is included as a consistency validation, not as a new source of ownership and not as a role-repair instruction.

The definition intentionally excludes:

- an Owner whose User is `PROVISIONED`, `INVITED`, or `SUSPENDED`;
- an Owner whose exact membership is not `ACTIVE`;
- an Owner relationship to another Hospital;
- a User who has only `Role.HOSPITAL` without an exact Owner membership;
- a Platform `ADMIN` who has no eligible Owner relationship in that Hospital;
- a parent or child Hospital relationship.

### 7.2 Last-eligible-Owner invariant

**Provisional proposal:**

> An `ACTIVE` Hospital must not commit a successful Owner-governance transaction with zero eligible Owners.

This is an **at-least-one eligible Owner invariant**, not an exactly-one-Owner rule. It protects against:

- an Owner demoting themselves while no other active Owner remains;
- an Owner demoting another Owner and accidentally removing the last operational authority;
- two concurrent demotions each observing the other Owner before either mutation commits;
- future interactions where account or relationship suspension removes an Owner from eligibility.

The invariant applies provisionally only when `Hospital.status = ACTIVE`. A `SUSPENDED` Hospital may preserve Owner relationships without requiring an immediately operational Owner because routine Hospital authority is already disabled. This does not decide whether Hospital restoration should require an eligible Owner; that restoration rule is an **Open requirement**.

The invariant must be evaluated from authoritative state inside the same mutation boundary. A directory count or client-side check is not sufficient.

## 8. Hospital Owner governance candidate operations

The operations in this section are not implemented in Phase 12C. They define the recommended candidate behavior for Phase 12D.0.

### 8.1 Promotion: `MEMBER -> OWNER`

**Provisional proposal:** A future operation equivalent to `promoteHospitalOwner()` may change one existing exact-Hospital active membership as follows:

```text
ACTIVE Hospital
  + eligible Owner actor in the same exact Hospital
  + existing target ACTIVE HospitalMembership in the same exact Hospital
  + target membershipType = MEMBER
  + target User.status = ACTIVE
  + target User has Role.HOSPITAL
        ↓
target membershipType = OWNER
```

Required constraints:

- Re-read and authorize the actor as an eligible Owner of the exact Hospital on the server.
- Require the target membership to already exist in that exact Hospital.
- Require the target membership to be `ACTIVE` and `MEMBER`.
- Require the target User to be `ACTIVE` and role-consistent.
- Require the Hospital to be `ACTIVE` at the mutation boundary.
- Address only the exact target membership. No hierarchy or parent-Hospital authority is valid.
- Change `membershipType` only. Do not create a User, Person, Hospital, membership in another Hospital, role repair, credential, activation, provider identity, session, OSM relationship, Patient relationship, or clinical record.
- Use stale-write expectations for the selected target membership, such as the current `updatedAt` value used by existing lifecycle services.
- Write a bounded audit event atomically with the membership change.
- Reject stale or conflicting state rather than silently applying a different target or transition.

Promotion does not require a last-Owner count because it cannot reduce the set of eligible Owners. It still requires the same transaction-safe actor, Hospital, target, and exact-scope checks.

### 8.2 Demotion: `OWNER -> MEMBER`

**Provisional proposal:** A future operation equivalent to `demoteHospitalOwner()` may change one existing exact-Hospital active Owner membership as follows:

```text
ACTIVE Hospital
  + eligible Owner actor in the same exact Hospital
  + existing target ACTIVE HospitalMembership in the same exact Hospital
  + target membershipType = OWNER
  + target User.status = ACTIVE
  + at least one other eligible Owner remains after the change
        ↓
target membershipType = MEMBER
```

Required conceptual checks:

- exact Hospital identity;
- active eligible Owner actor authority;
- target membership existence and exact-Hospital scope;
- target membership status is `ACTIVE`;
- target membership type is `OWNER`;
- target User state is still valid for the provisional eligible-Owner calculation;
- Hospital state is still `ACTIVE`;
- target stale-write expectation is still current;
- the last-eligible-Owner invariant remains true after the proposed change;
- concurrent Owner changes are handled by the transaction strategy, not a UI pre-check;
- membership transition and bounded audit succeed or fail together.

Demotion changes `membershipType`. It does not suspend or delete the membership, suspend or delete the User, remove a global role, revoke credentials, regenerate activation, mutate the provider, revoke sessions, change OSM relationships, or alter Patient/clinical data.

### 8.3 Self-demotion

**Provisional proposal:** Self-demotion follows exactly the same last-eligible-Owner invariant as demoting another Owner. There is no separate permanent prohibition against self-demotion.

For Hospital A:

```text
Owner Alice
Owner Bob
```

Alice may demote herself. The result is:

```text
Member Alice
Owner Bob
```

For Hospital A:

```text
Owner Alice only
```

Alice’s self-demotion must be rejected because the successful transaction would leave zero eligible Owners. The rejection must not partially change the membership or create an account-recovery side effect.

### 8.4 Platform ADMIN boundary

**Provisional proposal:** Routine Owner promotion and demotion are performed by an eligible Owner of the exact Hospital. A Platform `ADMIN` does not receive routine Owner-management authority merely because Phase 12B.0 allows that role to suspend or restore a Hospital.

This preserves the accepted **Role + Capability + Scope** separation:

- Platform `ADMIN`: control-plane Hospital lifecycle governance;
- Hospital Owner: exact-Hospital operational ownership governance.

The case where no functioning Owner remains is not merged into routine Owner management. **Final Owner recovery** is a separate high-risk open requirement that may eventually require a Platform `ADMIN` assisted process, recovery of the existing Owner, or manual identity reconciliation.

### 8.5 Multi-Hospital isolation

**Current accepted contract:** A User may have relationships with multiple Hospitals. Authority is evaluated per exact relationship.

For example:

```text
User X
  Hospital A: OWNER
  Hospital B: MEMBER
```

Promoting or demoting User X in Hospital A must not:

- change the membership in Hospital B;
- remove `Role.HOSPITAL` because of the Hospital A change;
- suspend or restore the User account;
- change OSM relationships;
- change Patient relationships or clinical state;
- change credentials or provider identity;
- change Hospital B state.

Promotion in Hospital A must not create authority in Hospital B. Every query, policy check, update predicate, audit resource, and concurrency check must carry the exact Hospital scope.

### 8.6 Bounded audit

**Provisional proposal:** Use repository-consistent bounded events such as:

- `hospital_owner.promoted`
- `hospital_owner.demoted`

The final event names remain an implementation detail until the prototype is built. The audit should contain only safe identifiers and the membership transition, for example:

```text
hospitalId
targetMembershipId
targetUserId
fromMembershipType
toMembershipType
```

The event must not contain a national ID, password, activation token, recovery token, OTP, provider secret, clinical data, arbitrary browser payload, or free-text identity evidence. Audit creation must be inside the same local transaction as the successful membership mutation. This is a **Provisional proposal** aligned with the accepted transactional audit boundary, not a final enterprise audit taxonomy.

## 9. Owner governance concurrency contract

### 9.1 The failure scenario

There is a real invariant race:

```text
Hospital A
  Owner Alice
  Owner Bob

Request 1: demote Alice
Request 2: demote Bob
```

If both requests independently observe the other Owner before either write commits, both can succeed and leave zero eligible Owners. This is **Inference** from the current multi-Owner-permitted schema and the proposed invariant.

### 9.2 Required future strategy

The Phase 12D.0 implementation must, at minimum:

- re-read authoritative actor, Hospital, target membership, target User, and relevant Owner state inside the transaction;
- require the Hospital to be `ACTIVE` inside the mutation boundary;
- count or otherwise verify eligible Owners inside the same mutation boundary before committing a demotion;
- use PostgreSQL `SERIALIZABLE` isolation or an equivalent concurrency-safe strategy already consistent with current service patterns;
- use conditional update predicates with an expected target version such as `updatedAt`;
- atomically persist the membership transition and audit event;
- retry only bounded transient serialization/unique conflicts using the existing repository pattern, then return a safe conflict when the invariant cannot be proven;
- reject one of two conflicting demotions rather than allowing both to commit.

The current `workforce` and `hospital-governance` services use serializable transactions, conditional writes, and bounded retry handling for relevant conflicts. That is **Direct current implementation evidence** and a suitable pattern to evaluate for Owner governance. It does not justify inventing a generic locking framework.

A client-side Owner count, disabled button, or preflight API response is not sufficient. The authoritative invariant must be enforced by the server transaction.

### 9.3 Interaction with Hospital suspension

**Provisional proposal:** A future Owner mutation requires the exact Hospital to be `ACTIVE` at authorization and transaction re-read time. If a Hospital lifecycle mutation serializes first and suspends the Hospital, a concurrent Owner mutation must fail. If the Owner mutation serializes first, the Hospital lifecycle operation must see the resulting authoritative state and apply its own accepted contract.

Phase 12B.0 does not cascade Hospital suspension into Owner memberships or Users. No Owner transaction may add such a cascade. Whether Hospital restore requires an eligible Owner remains open.

## 10. Account-access problem taxonomy

The following taxonomy is intended to prevent every access problem from being called “password reset.” Classifications combine **Current accepted contract**, **Direct current implementation evidence**, and **Open requirement** as indicated.

| Case | Actual domain | Current state | Correct boundary |
| --- | --- | --- | --- |
| First-time workforce activation expired or was lost | Activation | Known Person/User, normally `PROVISIONED`, no established provider identity | Issue or reissue the purpose-specific workforce activation capability. This is not account recovery. |
| First-time Patient activation expired or was lost | Activation | Known Person/User, normally `PROVISIONED`, patient activation state is bounded to an exact Hospital/patient relationship | Issue or reissue the purpose-specific Patient activation capability. This is not account recovery. |
| ACTIVE User forgot a credential | Active-account credential recovery | Existing `ACTIVE` User with an established provider identity | Requires a new recovery contract. Current DEMI does not implement it. |
| `User.status = SUSPENDED` | Account governance and possible account restoration | Account-wide lifecycle state; ActorContext denies normal access | Requires an explicit User governance decision. It is not membership restore and recovery must not silently activate the User. |
| Hospital membership is suspended | Relationship lifecycle | Exact Hospital relationship is `SUSPENDED`; Phase 11B.0 supports exact Owner suspend/restore | Use membership lifecycle policy. It is not account recovery. |
| OSM relationship is suspended | Relationship lifecycle | Exact Hospital OSM relationship is separate from membership; Phase 11D.0 handles it | Use OSM relationship lifecycle policy. It is not account recovery. |
| `authSubject` or provider identity changed | Provider reconciliation and possibly recovery | Known User may no longer map to the expected provider subject | Preserve the known User when safely possible; reconcile or escalate. Do not silently create a replacement User. |
| Wrong Person/User mapping | Identity reconciliation | Identity graph is incorrect or disputed | Reconcile identity under a dedicated process. Do not automate as password recovery. |
| Duplicate Person/User | Identity reconciliation | More than one durable identity/account may represent one human | Resolve duplicate/conflicting identity evidence under a dedicated process. Do not merge automatically during recovery. |
| Final Hospital Owner is inaccessible | Combined governance, recovery, identity proof, and escalation | Routine Owner action may be impossible | Treat as a high-risk special case. It is not a generic reset shortcut and is excluded from Phase 12D.0. |

Hospital `ACTIVE <-> SUSPENDED` is also a Hospital lifecycle operation, not account recovery. Restoring a membership or an OSM relationship is not a credential operation.

## 11. Current authentication reality

### 11.1 Application login path

The following is **Direct current implementation evidence** from the current auth and identity modules and is consistent with ADR-0001:

1. The normal application login identifier is the Thai National ID value used to resolve a Person. The shared login input is bounded; strict National ID validation is used at appropriate identity-establishment boundaries rather than being treated as a provider email.
2. DEMI normalizes and HMAC-hashes the identity under the Thai-national-ID namespace.
3. DEMI resolves `Person.identityKeyHash` to a `Person`, then resolves the related `User`.
4. The resolved User must have an `authSubject` for password login.
5. DEMI derives an opaque provider login alias from the stable `User.id`, currently shaped like `User.id@auth.demi.internal`.
6. DEMI calls Supabase password authentication using that internal alias and the password supplied by the claimant.
7. After provider authentication, DEMI verifies the provider subject against the mapped User and constructs the server-side ActorContext from current database state.
8. A User who is not `ACTIVE` is denied normal application access even if provider authentication itself succeeds.

The provider alias is an email-shaped adapter identifier. **It is not evidence that the User has an email mailbox, owns that alias, or can receive recovery mail at that address.** It must not be used as a user-facing recovery destination.

### 11.2 Current provider and session boundaries

The following is **Direct current implementation evidence**:

- Supabase SSR cookies and provider sessions are used for the current authenticated browser flow.
- `User.authSubject` is the provider subject mapping used to resolve the application User.
- The current trusted provider integration provisions a password identity using server-side provider administration, confirms it, and persists the provider subject with compensation/reconciliation handling. It does not implement a credential reset for an existing User.
- Current sign-out calls the provider with local scope. It terminates the current browser/device session, not every session for the User.
- DEMI currently has no local session table, session-version field, refresh-token registry, or provider-independent “revoke all sessions” abstraction.
- Current ActorContext status checks protect new application requests, but the repository does not claim that changing `User.status` revokes every already-issued provider session.

## 12. Current activation and credential establishment

### 12.1 Activation is purpose-specific

The following is **Current accepted contract** and **Direct current implementation evidence**:

- Workforce and Patient activation are separate, purpose-bound domains.
- Activation capabilities are generated from cryptographically random bytes, persisted as hashes rather than raw values, expire, have one-time claim/use semantics, and can be revoked or superseded on supported reissue.
- Workforce activation is issued for a provisioned workforce User and exact Hospital relationship. Current remote activation uses a bounded lifetime, and assisted activation uses a shorter bounded lifetime.
- Patient activation is scoped to the exact Patient/Hospital relationship and has a bounded claim lease.
- The claimant establishes the first password. Staff, Owners, and Platform `ADMIN` do not receive or choose the claimant’s final password.
- Provider I/O is performed outside an unnecessarily long database transaction, with compensation or reconciliation when local and provider states diverge.
- Activation completion changes the relevant User/relationship state only after the bounded claim and provider mapping checks succeed.

### 12.2 Activation is not recovery

The following distinction is **Current accepted contract**:

> Reissuing activation for a `PROVISIONED` User is not credential recovery for an `ACTIVE` User.

Activation proves or relies on the purpose-specific provisioning workflow and establishes a first credential. Active-account recovery must address a User who already has an established identity and credential relationship. Activation tokens must not be reused as generic recovery tokens.

The current repository contains no active-account recovery capability model, recovery-token domain, existing-password replacement service, or recovery route. This is **Direct current implementation evidence**.

## 13. Recovery security contract and current blocker

### 13.1 Provisional security principles

The following are **Provisional proposals** for any future recovery design:

1. Recover the existing User when identity and control can be sufficiently proven.
2. Never reveal an existing password.
3. A Hospital Owner or Platform `ADMIN` must not know or choose another User’s final password.
4. Do not use predictable operator-generated passwords.
5. Thai National ID alone is not sufficient proof of account control.
6. Never log recovery capability secrets.
7. Recovery capabilities must be purpose-specific, random and unguessable, one-time, expiring, and revoked after successful use. If DEMI persists them, it should store only a hash. Reissue should safely supersede or revoke the prior unused capability.
8. Provider integration must not be performed inside an unnecessarily long database transaction.
9. Credential establishment belongs to the target User or verified recovery claimant.
10. Recovery must not silently repair Person/User/authSubject conflicts.
11. A successful recovery should invalidate the used or superseded recovery capability and apply an explicitly accepted session policy.

These principles do not select a provider, delivery channel, proof method, expiry, retry policy, or support process.

### 13.2 Recovery actors

Recovery must keep the following concepts separate:

| Concept | Meaning | Current/provisional boundary |
| --- | --- | --- |
| Requester | Starts or asks for recovery | May be the target User, an Owner, Platform `ADMIN`, or an assisted process; no final authority is accepted. |
| Authorizer | Permits the recovery process to proceed | Hospital relationship authority does not automatically authorize another User’s credential change. Platform governance-assisted authority is open. |
| Identity/control prover | Demonstrates sufficient control of an accepted identity or recovery channel | Must be defined and accepted; National ID alone is insufficient. |
| Credential establisher | Sets the replacement credential | Preferably the target User or verified recovery claimant; operators must not receive the final password. |
| Provider | Delivers or verifies a capability and/or establishes provider state | Provider and integration model are not selected. |

Possible actors include the target User, an exact-Hospital Owner, a Platform `ADMIN`, an automated identity/provider system, and an assisted support/governance process. This is an **Open requirement** authority matrix, not permission to merge these roles into one operator role.

### 13.3 Missing identity/control proof and delivery channel

The following is a **Direct current implementation conclusion** from the schema and modules:

- DEMI currently stores the HMAC identity key for Person lookup, but that is an application lookup identifier, not proof that the claimant controls an account recovery channel.
- No accepted verified User email channel was found.
- No accepted verified User phone channel was found.
- The current schema’s patient phone field has no accepted verification state and is not a general workforce recovery contract.
- No provider-managed recovery mailbox or phone binding is established by current DEMI code.
- No external identity binding or ThaID recovery binding is established.
- The internal provider alias is not a delivery channel.

Therefore:

> **Active-account recovery is currently blocked from safe implementation by the absence of an accepted identity/control proof and delivery channel.**

The blocker is strengthened by the absence of an accepted provider recovery model and global session consequence. It must not be “solved” by sending to an arbitrary profile field, treating raw National ID as proof, asking an Owner or Platform `ADMIN` to choose a password, displaying a temporary password, or creating a replacement User.

### 13.4 Provider-independent future recovery shape

The following is a **Provisional proposal** that deliberately does not select a provider:

```text
known existing User
        ↓
recovery request
        ↓
authorize initiation
        ↓
verify approved identity/control evidence
        ↓
issue or verify bounded recovery capability
        ↓
target claimant establishes replacement credential
        ↓
invalidate recovery capability
        ↓
apply accepted session policy
        ↓
bounded security audit
```

Open integration choices include email, SMS, OTP, a provider-native recovery flow, ThaID, an external IAM, an assisted verification process, capability expiry, retry and resend limits, proof strength, and escalation rules. None is selected by Phase 12C.

## 14. User account lifecycle and relationship lifecycle

### 14.1 User account suspension and restore

The following is **Direct current implementation evidence**:

- `UserStatus.SUSPENDED` exists in the schema.
- ActorContext denies normal application access for Users whose status is not `ACTIVE`.
- Current product services do not expose a supported User account suspend/restore workflow comparable to HospitalMembership or OSM relationship lifecycle services.
- Existing tests and fixtures may set User status to exercise denial behavior; that is not evidence of a customer-facing governance operation.

**Provisional boundary:** User account governance remains separate from Owner governance and credential recovery. A User account suspension is account-wide across the User’s Hospitals, while membership suspension is scoped to one Hospital relationship. A future User suspension/restore contract must decide authority, reason, security versus operational intent, cross-Hospital effect, session handling, and restore authority.

Credential recovery must not silently change `User.status` from `SUSPENDED` to `ACTIVE`. Restoration is an explicit governance decision unless a later accepted contract says otherwise.

### 14.2 Relationship lifecycle

**Current accepted contract:**

- HospitalMembership suspension/restoration is an exact Hospital relationship operation and is already bounded by Phase 11B.0.
- OSM relationship suspension/restoration is a separate exact Hospital relationship operation bounded by Phase 11D.0.
- Hospital suspension/restoration is a Hospital lifecycle operation bounded by Phase 12B.0.

None of these operations is a password reset or active-account recovery operation. Owner governance must not call them implicitly.

## 15. Identity reconciliation boundary

The following is **Current accepted contract**, **Direct current implementation evidence**, and **Provisional security guidance**:

- A wrong Person/User mapping is an identity-reconciliation problem.
- Duplicate Person or User records are an identity-reconciliation problem.
- A changed, conflicting, or missing `authSubject` is a provider-mapping/reconciliation problem that may require recovery, but is not automatically solved by recovery.
- A national-ID mismatch or disputed ownership claim requires identity evidence and an explicit reconciliation process.
- A known User should be preserved when it can be safely identified. Recovery must not create a replacement User merely because the existing one is inconvenient to access.
- Person/User merge, provider-subject repair, and ownership dispute resolution are not automatic password-recovery side effects.

The current repository has conflict and reconciliation signals around identity and provider provisioning, but no accepted general identity-reconciliation workflow. These matters remain **Open requirements**.

## 16. Session consequences

### 16.1 Current capability

The following is **Direct current implementation evidence**:

- Current sign-out uses the Supabase local scope and only addresses the current browser/device session.
- DEMI has no local session table, session version, refresh-token registry, or provider-independent revoke-all abstraction.
- ActorContext re-resolves User state for application access, but this does not establish a claim that all provider refresh tokens or sessions are invalidated after a database status change.

### 16.2 Recovery consequence

**Provisional security direction:** Successful active-account recovery should eventually consider invalidating existing sessions and should definitely invalidate used or superseded recovery capabilities.

The exact “all devices” behavior is **Open requirement** until the provider and session architecture are selected. Phase 12C must not claim that DEMI can revoke every session. A Hospital-scoped membership or Hospital lifecycle action also must not be described as an account-wide session revocation operation.

## 17. Final Owner recovery

Final Owner recovery is a special high-risk case, not routine Owner management.

Example:

```text
Hospital A
  only eligible Owner = User X
  User X cannot authenticate
```

Normal self-demotion cannot solve this. Normal Owner-managed promotion may also be impossible because no functioning Owner remains.

Candidate future models include:

- **A. Platform ADMIN-assisted Owner replacement:** a separately authorized governance process appoints a replacement after accepted proof and review.
- **B. Recover the existing Owner first:** active-account recovery restores User X without changing ownership.
- **C. Manual identity reconciliation/support process:** an assisted process resolves identity and ownership evidence before changing either account or membership.
- **D. Temporary governance exception:** an explicitly bounded emergency process with audit, dispute handling, expiry, and review.

No model is selected by Phase 12C. **Open requirement:** final Owner recovery needs identity proof, escalation authority, claimant protection, dispute handling, account-recovery semantics, session policy, and support/governance responsibility. It is excluded from Phase 12D.0.

## 18. Recommended Phase 12D.0 boundary

### 18.1 Scope

Unless new evidence contradicts this contract, Phase 12D.0 should implement only:

```text
eligible Owner of an ACTIVE exact Hospital
        ↓
bounded Owner/Member governance view
        ↓
promote existing ACTIVE MEMBER -> OWNER
        ↓
demote existing ACTIVE OWNER -> MEMBER
        ↓
last eligible Owner guard
```

This is a **Provisional Phase 12D.0 requirement-validation boundary**, not production customer semantics.

### 18.2 Deterministic handoff contract

The future implementation must satisfy all of the following:

| Boundary | Required behavior |
| --- | --- |
| Actor | Actor is re-resolved server-side as `User.status = ACTIVE`, `Role.HOSPITAL`, exact `HospitalMembership.membershipType = OWNER`, exact membership `status = ACTIVE`, and exact Hospital `status = ACTIVE`. |
| Target | Target already has a membership in the exact Hospital, target User is `ACTIVE`, target membership is `ACTIVE`, and target has `Role.HOSPITAL` as a consistency check. Missing role is rejected/reconciled; it is not repaired by this slice. |
| Promotion | Only `MEMBER -> OWNER`; no new User, Person, membership, role repair, credential, activation, provider identity, session, OSM, Patient, or clinical mutation. |
| Demotion | Only `OWNER -> MEMBER`; membership remains active and is not deleted or suspended. |
| Self-demotion | Allowed when another eligible Owner remains; rejected when the target is the last eligible Owner. No special blanket self-demotion ban. |
| Hospital state | Hospital must be `ACTIVE` at server authorization and inside the transaction. |
| Owner policy | Multiple Owners are provisionally allowed under Model A. The successful transaction must leave at least one eligible Owner for an ACTIVE Hospital. |
| Scope | Exact Hospital ID and exact membership/target identifiers only. No hierarchy or inherited Hospital authority. |
| Platform ADMIN | No routine Owner promote/demote override merely because the actor is Platform `ADMIN`. Final Owner recovery is separate and deferred. |
| Stale writes | Require an expected target membership version such as `updatedAt`; reject stale target state. |
| Concurrency | Re-read authoritative state inside a serializable or equivalent transaction; enforce the last-Owner invariant there; use bounded conflict retry consistent with current services; reject one conflicting operation when necessary. |
| Audit | Persist a bounded Owner promotion/demotion event atomically with the membership transition. Do not log secrets, tokens, passwords, national IDs, contact details, clinical data, or arbitrary payloads. |
| No cascade | Do not change any other Hospital membership, User status, global role, activation state, credential, provider identity, session, OSM relation, Patient relation, or clinical state. |
| Schema | No schema migration is expected for this Owner Set prototype. A migration would require a new evidence-backed invariant and must not be added speculatively. |
| Recovery | No active-account recovery capability, password reset, provider recovery, final-Owner recovery, or session revocation is in scope. |
| Account governance | No User suspension or restore is in scope. |

If an implementation detail cannot meet this deterministic contract with current evidence, it is a blocker to the slice and must be reported rather than filled with an invented business rule.

## 19. Active-account recovery recommendation

**Decision for Phase 12D.0: defer active-account recovery.**

Current DEMI does not yet establish all of the minimum contract needed for a safe implementation:

- an accepted trusted identity/control proof;
- an accepted delivery or verification channel;
- a selected provider recovery model;
- credential-establishment ownership;
- retry, expiry, resend, and lost-channel behavior;
- accepted handling of suspicious or disputed recovery;
- a global session-revocation or session-consequence policy;
- an assisted/final-Owner recovery authority.

Implementing a fake reset-password prototype, an operator-set password, an emailed internal alias, a National-ID-only reset, or a temporary predictable password would obscure these blockers and violate the current security boundary. Existing first-time activation remains available as its separate purpose-specific flow.

## 20. Open requirements

All items below remain **Open requirements** unless a future source explicitly accepts them.

### 20.1 Owner policy

- Whether the final policy is an Owner Set, exactly one Owner, or an Owner Set with a distinguished primary/recovery Owner.
- Whether multiple active Owners are customer-approved.
- Whether self-demotion is accepted and what user-facing warning/confirmation is required.
- Who may promote, demote, transfer, or replace an Owner.
- Whether Platform `ADMIN` may use a separate emergency override.
- Whether Owner governance is allowed for a suspended Hospital, and what Hospital restore requires.
- Owner visibility and directory disclosure rules.
- Whether an Owner change requires a reason, approval, dual control, notification, or effective time.
- Whether Owner changes notify affected Users or other Owners.
- Final Owner recovery and disputed ownership handling.

### 20.2 Account governance

- Who may suspend or restore a User account.
- Whether suspension is security-driven, operational, or both.
- Required suspension reason and audit detail.
- Account-wide consequences across all Hospitals.
- Session and provider consequences of account suspension or restore.
- Whether a suspended User may be an Owner relationship retained for later restoration.
- Whether restoring a User or Hospital requires an eligible Owner.

### 20.3 Active-account recovery

- Recovery requester and approver.
- Identity/control proof strength and accepted evidence.
- Delivery or verification channel.
- Provider and provider-native recovery versus DEMI-owned capability.
- Capability expiry, retry, resend, claim, and rate-limit rules.
- Lost-channel escalation and assisted verification.
- Replacement credential policy.
- Session revocation or reauthentication behavior.
- Suspicious recovery detection, hold, notification, and dispute process.
- Final Owner recovery authority and process.

### 20.4 Identity reconciliation

- Duplicate Person resolution.
- Duplicate User resolution.
- Wrong Person/User mapping correction.
- Provider subject change or conflict handling.
- Disputed ownership evidence.
- National-ID mismatch and identity correction.
- Whether and how a verified external identity such as ThaID or an external IAM participates.

The following are specifically not decided without evidence: permanent exactly-one Owner, Primary Owner, Recovery Owner, routine Platform `ADMIN` override, arbitrary staff promotion, password reset by an Owner, password setting by Platform `ADMIN`, National ID as sole account-control proof, verified email or phone assumptions, Supabase email recovery as the DEMI user flow, automatic restoration of suspended Users, all-session revocation, final Owner replacement, ThaID, SSO, external IAM, support SLA, dispute resolution, or destructive User deletion.

## 21. Rejected architecture

The following are **Rejected legacy architecture** or rejected speculative shortcuts for current DEMI:

- browser-authoritative Owner mutation;
- browser-provided role, Owner identity, actor authority, or Hospital scope;
- Hospital hierarchy as a source of Owner authority;
- `OWNER` as a generic global administration role;
- `admin_type`, `hospital_id`, or legacy hierarchy access as a replacement for current Role + Capability + Scope policy;
- predictable temporary passwords;
- operator-visible passwords or emailing an existing password;
- hardcoded recovery passwords;
- client-side password gates for privileged mutation;
- direct browser-to-Supabase account mutation;
- Hospital Owner or Platform `ADMIN` choosing another User’s final password;
- recovery using raw National ID alone;
- sending recovery to an arbitrary or unverified profile contact;
- replacing a known User because recovery is inconvenient;
- automatic Person/User merge or provider-subject repair during recovery;
- a generic IAM/RBAC engine or generic support console without accepted requirements;
- destructive User deletion as an account-recovery mechanism;
- treating Hospital suspension as account recovery;
- treating membership restore as account recovery;
- treating OSM relationship restore as account recovery.

The pinned legacy checkout directly demonstrated browser-direct writes, legacy hierarchy/admin-type access, operator-created and displayed passwords, client-side password gates, account disable/restore/delete, and direct password data handling. Those observations are **Direct legacy evidence** and are retained only as terminology/operator-expectation evidence and negative architecture evidence.

## 22. ADR decision

**No ADR is created by Phase 12C.**

This phase does not introduce an accepted, difficult-to-reverse architectural decision:

- the Owner Set is only a provisional validation candidate;
- no new role, Owner field, primary/recovery concept, or schema invariant is accepted;
- no recovery provider, proof channel, or delivery channel is selected;
- no session-revocation mechanism is selected;
- final customer governance and recovery requirements remain open.

The existing accepted ADRs and architecture baseline remain the source of truth. A future ADR may be appropriate after a customer-approved Owner/recovery architecture changes a cross-module boundary or introduces a durable invariant.

## 23. Validation and scope result

The Phase 12C validation activity is documentation analysis only:

- current repository instructions and project context were inspected;
- current schema, migrations, source modules, and relevant tests were inspected as implementation evidence;
- the pinned legacy checkout and relevant legacy behavior were inspected;
- Owner governance and account recovery were kept separate;
- activation and recovery were kept separate;
- User account suspension and relationship suspension were kept separate;
- identity reconciliation was kept separate from recovery;
- current login identifier, Person/User resolution, provider alias, `authSubject`, and local sign-out behavior were traced;
- the absence of an accepted verified recovery proof/channel and global session-revocation contract was recorded as a blocker;
- the Phase 12D.0 Owner Governance boundary was made deterministic;
- no product implementation, schema, migration, route, service, UI, or new behavior test was added.

No development server, production server, build, database migration, or integration suite is required for this documentation phase and none is part of the validation claim. The final repository diff must remain limited to this contract and the minimal Context update.

## 24. Deterministic conclusion

Phase 12C defines a deterministic provisional Hospital Owner Governance contract suitable for a bounded Phase 12D.0 prototype while keeping account-recovery security boundaries explicit.

The recommended provisional Owner model is an exact-Hospital Owner Set using existing `HospitalMembership` semantics. The candidate prototype supports `MEMBER -> OWNER` promotion and `OWNER -> MEMBER` demotion, permits self-demotion only when another eligible Owner remains, and enforces a transaction-safe invariant that an `ACTIVE` Hospital cannot commit with zero eligible Owners. Platform `ADMIN` Hospital lifecycle governance does not automatically grant routine Owner-management authority.

Active-account recovery remains distinct from first-time activation, User account lifecycle, HospitalMembership lifecycle, OSM relationship lifecycle, and identity reconciliation. Because DEMI currently lacks an accepted trusted identity/control proof, recovery delivery channel, provider recovery model, and session-consequence contract, active-account recovery must remain deferred rather than implemented as a fake or operator-set password flow.

