# Phase 12D.0 Hospital Owner Governance Working Prototype

สถานะ: implemented working prototype สำหรับ requirement validation

Phase 12D.0 implements only the bounded Hospital Owner Governance behavior accepted as the provisional direction in the Phase 12C contract. This is not customer-approved final policy.

## Implemented scope

- The existing `/app/workforce` workspace now includes the bounded Owner/Member governance view for the exact active Hospital of the current eligible Owner.
- Staff detail routes under `/app/workforce/staff/[relationshipId]` expose server-derived Owner Governance affordances without creating a second administration console.
- The existing `HospitalMembership` row is the only ownership state. No new Owner entity or Prisma migration was added.
- The provisional Owner Set model is used: multiple eligible Owners may exist in one Hospital.

## Actor and target rules

The actor must be authenticated and must satisfy all of these server-side predicates for the exact target Hospital:

1. `User.status = ACTIVE`.
2. The User has `Role.HOSPITAL`.
3. The User has an exact `HospitalMembership` with `status = ACTIVE` and `membershipType = OWNER`.
4. The exact Hospital has `status = ACTIVE`.

The mutation transaction re-reads the actor User, Role, exact Owner membership, and Hospital. A stale `ActorContext` cannot authorize a mutation. Platform `ADMIN` authority, Hospital hierarchy, OSM relationships, Patient relationships, and unrelated Hospital memberships do not expand this scope.

Targets are also re-read inside the same serializable transaction. A target must be in the exact Hospital, have an active membership, have an active User with `Role.HOSPITAL`, have the expected current membership type, and match the submitted `expectedUpdatedAt`.

## Capabilities and policy

The workforce authorization architecture now includes these narrowly scoped capabilities:

- `hospital-owner:read-governance`
- `hospital-owner:promote`
- `hospital-owner:demote`

The policy fails closed for unauthenticated actors, `MEMBER`, `OSM`, `PATIENT`, `ADMIN`-only, inactive, unrelated, and hierarchy-only actors. A User with both `ADMIN` and an independently eligible Owner relationship may act only through the Owner relationship.

## Promotion

`promoteHospitalOwner()` is a distinct service operation and `promoteHospitalOwnerAction()` is its bounded Server Action. The only accepted transition is:

```text
ACTIVE MEMBER + active User + Role.HOSPITAL -> OWNER
```

The operation changes only `HospitalMembership.membershipType` and writes `hospital_owner.promoted` in the same transaction. Missing `Role.HOSPITAL`, inactive state, already-Owner state, cross-Hospital targets, and stale versions are rejected; the role is never repaired automatically.

## Demotion and self-demotion

`demoteHospitalOwner()` is a distinct service operation and `demoteHospitalOwnerAction()` is its bounded Server Action. The only accepted transition is:

```text
ACTIVE OWNER + active User + Role.HOSPITAL -> MEMBER
```

The membership remains `ACTIVE`; User status, UserRole, credentials, sessions, activation, other relationships, and clinical state are not changed. Self-demotion is allowed when another eligible Owner remains. It is rejected when the actor is the final eligible Owner.

## Last eligible Owner invariant and concurrency

An `ACTIVE` Hospital must never commit an Owner Governance mutation that leaves zero eligible Owners. The invariant is checked in the authoritative service transaction, not by the UI count or a preflight request.

Both promotion and demotion use the existing PostgreSQL `SERIALIZABLE` Prisma transaction pattern. Demotion re-reads/counts eligible Owners, conditionally updates the exact target row, writes the bounded audit, and commits atomically. Transient serialization conflicts use the existing bounded retry behavior; after a retry, all authoritative predicates are re-read. The PostgreSQL integration suite issues two genuinely overlapping final-owner demotions and asserts that only one can commit.

## Stale-write protection

Both mutations require the target membership ID, exact Hospital ID, and current `expectedUpdatedAt`. The update is conditional on the exact target row, expected membership type, active membership status, and expected version. A changed `membershipType`, membership status, or `updatedAt` returns a bounded conflict and does not apply the action to newer state.

## Read projection and UI boundary

The existing workforce directory now includes both `MEMBER` and `OWNER` rows within the exact authorized Hospital. The projection is limited to the existing safe workforce fields and server-derived governance affordances. It does not expose national IDs, identity hashes, auth subjects, provider identifiers, credentials, activation/recovery tokens, sessions, Patient data, or clinical data.

The UI is convenience only. It offers promotion for an eligible active Member and demotion for an eligible active Owner when the read projection sees another eligible Owner. The final-Owner message explicitly states that the server re-checks the invariant; the server remains authoritative. No recovery or password action is displayed.

## Audit and no-cascade boundary

Successful transitions write exactly one bounded audit event atomically with the membership update:

- `hospital_owner.promoted`
- `hospital_owner.demoted`

Metadata is limited to `hospitalId`, `targetMembershipId`, `targetUserId`, `fromMembershipType`, and `toMembershipType`. Failed authorization, stale-write, invalid-state, and final-Owner operations do not emit a successful transition audit.

The implementation does not mutate `User.status`, `UserRole`, `Hospital.status`, `HospitalMembership.status`, profession, other Hospital memberships, activation records, credentials, provider identity, sessions, OSM relationships, Patient relationships, Patient–OSM assignments, appointments, or clinical records. It does not create background workflows or notifications.

## Exact-Hospital and multi-Hospital isolation

Every read and mutation carries an exact Hospital predicate. A user may have different membership types in different Hospitals; changing one membership changes no other membership or global role. Parent, child, sibling, and related Hospital metadata do not grant Owner authority.

## Tests and validation

Focused unit coverage was added for the Owner policy, service transitions, stale actor/version behavior, final-Owner protection, and bounded Server Actions. The PostgreSQL integration suite covers:

- bounded promotion and atomic audit;
- demotion and self-demotion;
- final eligible Owner protection;
- inactive, inconsistent, unauthorized, hierarchy-only, and stale states;
- suspended Hospital behavior;
- exact-Hospital/multi-Hospital isolation;
- no-cascade state preservation across account, role, membership, OSM, Patient, assignment, appointment, and clinical-adjacent records;
- a genuinely concurrent demotion race using `Promise.allSettled` against PostgreSQL.

The repository's lint, typecheck, focused unit tests, and integration command remain the validation entry points. The integration command requires the repository-supported PostgreSQL/Docker environment.

## Schema and migration status

No change was made to `prisma/schema.prisma`. No migration was added. The existing `HospitalMembership.membershipType`, `updatedAt`, and transaction infrastructure are sufficient for this bounded prototype.

## Explicit non-goals and remaining requirements

This phase does not implement:

- active-account recovery of any kind;
- password reset, recovery delivery, OTP, recovery tokens, provider recovery, session revocation, or temporary credentials;
- final-Owner rescue, emergency appointment, break-glass, or replacement Owner workflow;
- `suspendUser()` or `restoreUser()`;
- Platform `ADMIN` routine Owner-management bypass;
- primary/recovery Owner concepts, ownership ordering, transfer entities, approval workflow, or generic IAM/RBAC/ACL;
- Hospital restore requirements tied to eligible Owner presence;
- notifications, background cascades, or customer-approved production policy.

Customer requirements still need to resolve the final Owner recovery path, trusted identity/control proof, recovery channel and provider/session semantics, account-level suspension/restoration, Hospital restore behavior when no eligible Owner remains, and final visibility/editability rules.
