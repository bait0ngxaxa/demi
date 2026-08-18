# Phase 11D.0 OSM Relationship Lifecycle Working Prototype

## Status / objective

Implemented as a narrowly scoped working prototype for requirement validation. An authorized Hospital Owner can inspect one OSM relationship and suspend or restore that relationship only when the exact Hospital has no current Patient assignments for the OSM. This slice does not start Phase 12 or convert any provisional customer requirement into a final governance policy.

## Files and components implemented

- Workforce capability policy and OSM transition input schema.
- Focused exact-Hospital current-assignment count query helper.
- Workforce application services for `suspendOsmRelationship` and `restoreOsmRelationship`.
- Thin Server Action adapters with bounded input and safe result/error mapping.
- Bounded OSM detail projection and lifecycle controls.
- Policy, transport, and PostgreSQL integration coverage, including multi-Hospital and concurrency scenarios.

## Routes and UI surface

The existing `/app/workforce/osm/[relationshipId]` detail surface is reused. It displays the account status, OSM relationship status, exact-Hospital current Patient assignment count, and server-derived Suspend/Restore availability. Blocked states explain the current assignment or reconciliation condition without exposing Patient data. No parallel OSM admin module or assignment-resolution wizard was added.

## Capabilities

This slice adds exactly these distinct lifecycle capabilities:

- `osm:suspend`
- `osm:restore`

Staff membership capabilities remain unchanged and continue to use the separate `membership:*` vocabulary.

## Authorization contract

Routine OSM lifecycle authority requires an authenticated active User with `Role.HOSPITAL`, a direct `HospitalMembership` for the exact target Hospital, `membershipType=OWNER`, membership status `ACTIVE`, and an exact target Hospital with status `ACTIVE`. Platform `ADMIN` alone, OSM, PATIENT, ordinary Hospital MEMBER, wrong-Hospital ownership, and hierarchy-only parent/child relationships are denied. The policy check is followed by an authoritative actor and target re-read inside the transaction.

The target User must be `ACTIVE`, and `Role.OSM` must already exist. Missing or invalid state fails closed; the service does not repair roles, accounts, credentials, activation records, or relationships.

## Exact-Hospital assignment-count rule

The lifecycle count includes only rows where `PatientOsmAssignment.osmUserId` equals the target OSM User, `endedAt IS NULL`, and the related `PatientHospitalRelationship.hospitalId` equals the exact target Hospital. Assignments in another Hospital do not block the operation. The count is reused by the detail projection and is re-read inside the lifecycle transaction.

## Suspend semantics

`ACTIVE → SUSPENDED` is conditionally applied to one exact `OsmHospitalRelationship` only when the target User and Hospital are active, the OSM role exists, the expected `updatedAt` is current, and the exact-Hospital current assignment count is zero. A positive count returns a safe conflict and performs no write, including no assignment mutation and no success audit.

## Restore semantics

`SUSPENDED → ACTIVE` uses the same authorization, account, role, Hospital, stale-state, and exact-Hospital count checks. Restore does not reactivate the User account or recreate assignments; ended assignment history remains ended. A positive current-assignment count returns a safe reconciliation/lifecycle conflict and performs no write.

## Defensive reconciliation guard

The restore count check protects against legacy, manual, or out-of-band data in which a suspended relationship still has a current assignment. The prototype fails closed rather than silently making that assignment effective again.

## Transaction and concurrency strategy

Each transition runs in the existing serializable local transaction/retry pattern. The transaction re-reads actor Owner scope, target Hospital status, target User status, `Role.OSM`, relationship state/version, and the exact-Hospital current assignment count before the conditional relationship update. Only internal serialization/deadlock conflicts are retried with the bounded repository convention. Business conflicts, authorization failures, invalid state, missing role, and stale client state are surfaced safely.

The assignment path remains responsible for its own active relationship checks. The supported concurrent assignment-versus-suspension test verifies that the persisted result cannot be a successfully suspended relationship with a newly committed current assignment through the supported path.

## Stale-write protection

Requests carry the bounded relationship version `expectedUpdatedAt`. The final conditional update requires the exact relationship ID and Hospital, expected source status, and expected `updatedAt`; an affected-row mismatch returns a safe conflict. No generic optimistic-locking framework was introduced.

## Audit events

Successful transitions write exactly one audit event in the same transaction as the relationship mutation:

- `osm_relationship.suspended`
- `osm_relationship.restored`

Metadata is limited to bounded status transition values. Patient identifiers, names, HN, National ID, identity hashes, auth subjects, provider identifiers, credentials, and tokens are not written. Blocked transitions do not create success, assignment, or fake reconciliation audits.

## Multi-Hospital isolation

The relationship ID and Hospital ID are always paired. A User may have OSM relationships in multiple Hospitals; lifecycle operations affect only the selected relationship. Assignments, memberships, relationship status, User status, and `Role.OSM` in another Hospital remain unchanged, and another Hospital's assignments are not counted as blockers.

## Tests

Focused policy and transport tests cover the two new capabilities, denial matrix, bounded transport inputs, and safe result mapping. PostgreSQL integration coverage covers successful and blocked suspend/restore, account and role separation, stale state, inactive Hospital, hierarchy denial, exact-Hospital counting, multi-Hospital isolation, audit bounds, and the assignment-versus-suspension concurrency race.

Validation for this handoff passed: `npm run lint`, `npm run typecheck`, focused workforce/patient-assignment/authorization unit tests (123 tests), focused workforce policy/transport tests (21 tests), and the PostgreSQL integration suite (119 tests).

## Schema and migration status

No Prisma schema change or migration was required. The implementation reuses `OsmHospitalRelationship.status/updatedAt`, `PatientOsmAssignment.osmUserId/endedAt`, `PatientHospitalRelationship.hospitalId`, and the existing `AuditEvent` model.

## Explicit non-goals

Automatic Patient unassignment, reassignment, transfer, replacement selection, assignment-resolution workflows, relationship transfer or deletion, `ENDED`/`TERMINATED` status, emergency or break-glass suspension, Platform ADMIN override, User account suspension or recovery, role deletion/recreation, Staff lifecycle changes, Hospital lifecycle or ownership governance, hierarchy inheritance, geography, dashboards, reporting, notifications, ThaID, LIFF, native mobile, generic IAM/RBAC/ACL, and workflow engines are not implemented.

## Remaining open customer requirements

Emergency suspension, OSM transfer/deletion, assignment-resolution and reassignment policy, Hospital/Owner governance, ownership transfer, geography, account recovery, notifications, and other requirements listed in the Phase 11A/11C documents remain open. This prototype does not mark those requirements resolved.
