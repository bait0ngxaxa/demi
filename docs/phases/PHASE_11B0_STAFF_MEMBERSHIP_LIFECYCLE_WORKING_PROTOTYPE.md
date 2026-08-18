# Phase 11B.0 Staff Membership Lifecycle Working Prototype

## Status

Implemented as a narrowly scoped MVP-grade requirement-validation prototype. This slice does not start Phase 11C or define a general workforce, HR, IAM, RBAC, ACL, or Hospital-governance platform.

## Implemented scope

- Existing `/app/workforce` remains the Hospital Owner workspace.
- Staff and OSM rows link to the relationship-scoped route `/app/workforce/[kind]/[relationshipId]`.
- `kind=staff` provides the interactive Staff membership detail.
- `kind=osm` provides a read-only OSM detail when the existing read boundary allows it.
- The detail projection contains only Hospital context, display name, profession when applicable, separate account and relationship statuses, safe activation state/expiry/mode information, and server-derived lifecycle affordances.
- National ID, identity hashes, password or password hash, activation token, `authSubject`, provider identifiers, credentials, and cross-Hospital membership lists are not projected.

## Actor and target rules

Every read and mutation derives the actor from the authenticated server context. The actor must be an active `HOSPITAL` User with a direct active `OWNER` membership in the exact active target Hospital. Platform `ADMIN`, `MEMBER`, OSM, PATIENT, and hierarchy-only relationships do not authorize the operation. Parent, child, sibling, and other Hospital metadata are not used as authority.

The target must be an exact `HospitalMembership` row with `membershipType=MEMBER`. OWNER rows are never mutated. The linked User must have `status=ACTIVE` for all three operations. `PROVISIONED`, `INVITED`, and `SUSPENDED` target accounts are rejected; no activation, recovery, credential, `authSubject`, User status, or provider operation is attempted.

## Supported mutations

1. Profession update: changes only `HospitalMembership.profession` while the target membership is `ACTIVE`.
2. Suspend: changes only `HospitalMembership.status` from `ACTIVE` to `SUSPENDED`.
3. Restore: changes only `HospitalMembership.status` from `SUSPENDED` to `ACTIVE`.

Restoring a membership never restores the User account. Other Hospital memberships, OSM relationships, Patient roles/relationships, activation records, credentials, and clinical records remain outside the mutation.

## Authorization, transaction, and concurrency boundary

The new capabilities are `membership:update`, `membership:suspend`, and `membership:restore`. Bounded detail reads reuse `membership:read`. The existing direct active Hospital Owner policy is extended rather than replaced.

Each mutation runs one serializable local transaction. The transaction re-checks the actor, exact Hospital, target User, target membership type/status, and the expected `updatedAt` value before conditionally updating exactly one membership field and writing its audit event. A stale or already-transitioned record returns a safe conflict; the UI can refresh the detail. No provider I/O is used.

## Audit events

- `hospital_membership.profession_changed` with bounded old/new profession metadata.
- `hospital_membership.suspended` with bounded old/new membership status metadata.
- `hospital_membership.restored` with bounded old/new membership status metadata.

Audit creation is inside the same transaction as the membership update, so a failed transaction does not leave a successful lifecycle audit event.

## Tests and validation

Focused policy and transport tests cover the new capabilities, bounded form inputs, and server-action boundary. PostgreSQL integration coverage verifies direct-scope authorization, hierarchy denial, inactive actor/Hospital denial, OWNER and OSM read-only behavior, target User account-state rejection, profession isolation, membership transitions, stale conflicts, audit events, and safe detail projection.

## Schema and migration status

No Prisma schema change or migration was required. Phase 11B.0 reuses the existing `HospitalMembership.profession/status`, `User.status`, Hospital status, `AuditEvent`, and activation models.

## Explicit non-goals

OSM lifecycle, Patient reassignment, assignment resolution, geographic scope, Staff removal/delete/transfer, Owner or Hospital governance, hierarchy authorization, cross-Hospital disclosure, User account suspension/recovery, password reset, activation redesign, profile/contact editing, licensing, HR/payroll, reporting, dashboards, ThaID, LIFF, mobile implementation, generic IAM/RBAC/ACL, and workflow engines are not implemented.

## Remaining open requirements and suggested next phase

Field ownership and visibility beyond profession, OSM lifecycle and Patient-assignment consequences, Hospital governance, Owner recovery/transfer, and account-recovery semantics remain open requirements. The suggested next step is a separate requirements review for the next approved slice; no later phase is started by this implementation.
