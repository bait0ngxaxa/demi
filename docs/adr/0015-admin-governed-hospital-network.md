# ADR-0015: Platform-Governed Hospital Network Roles and Transfers

- Status: Accepted (Product Owner, 2026-10-20)
- Date: 2026-10-20
- Superseded in part by [ADR-0018](./0018-parent-led-child-onboarding.md) (2026-10-21): a Parent OWNER may also register CHILD facilities into its own network; ADMIN keeps every power listed here.
- Supersedes: [ADR-0014](./0014-operational-hospital-service-areas.md) only for (1) the offline trusted-source eligibility attestation, (2) the canonical-placement/root/leaf candidate boundary and (3) the self-service transfer block. Everything else in ADR-0014 is unchanged.

## Context

Phase A could not be used in practice. No writer existed for `HospitalServiceAreaEligibility`, so every candidate list was empty. Candidates also had to be canonical Children of the selected Parent, so every network change required editing `prisma/seed/hospital-master-v2.json` and re-running reconciliation. A Child once attached to another Parent was permanently blocked, so a future main Parent Hospital could never take over an existing area. Platform ADMIN could only suspend/restore Hospitals.

The Product Owner decided:

1. Platform ADMIN designates which Hospitals are network PARENT or CHILD facilities through the application.
2. A Parent OWNER may attach any free CHILD facility; canonical placement is not required.
3. Moving a Child that currently belongs to another Parent is a Platform ADMIN transfer with confirmation, reason and audit.

## Decision

**Network role.** `HospitalServiceAreaEligibility` becomes the Platform ADMIN-governed network role. Rows are written when ADMIN registers a Hospital (`createHospital` takes `networkRole`) or by `setHospitalNetworkRole` (capability `hospital-network:role:manage`, active persisted ADMIN). No reference text is required (the former `sourceReference` column is dropped); `verifiedAt` is the decision time and `classifiedByUserId` records the ADMIN. Migration `20261030110000` bootstrapped existing Hospitals once from canonical placement (no parent ⇒ PARENT, parent ⇒ CHILD) with `classifiedByUserId` NULL as system origin. One role per Hospital (PK `hospitalId`), so a facility is never both PARENT and CHILD and the network stays one level deep. Setting a role on a Hospital that participates in an active association with a different role, or clearing a role while active associations reference it, is a conflict. Changes are audited as `hospital_network_role.set` / `.cleared`.

**Eligibility.** A pair is eligible when the facilities differ, the Parent is ACTIVE with role PARENT and the Child is ACTIVE with role CHILD. `parentHospitalId`, root and leaf checks are removed: `HospitalServiceArea` is the source of truth for the operational network and canonical placement is reference data. Prior history with another Parent no longer blocks attachment of a free Child. One active Parent per Child remains enforced by the partial unique index.

**Transfer and governance.** Platform ADMIN (capability `hospital-network:area:govern`) can list any Parent's active associations, end an association (for example when the Parent has no OWNER) and transfer an active association to another eligible Parent. Transfer ends the existing row and inserts a new row in one Serializable transaction; both rows attribute the ADMIN. Audit events are `hospital_service_area.ended` (with `governance: true`) and `hospital_service_area.transferred`. History stays immutable.

**Hospital registry.** Platform ADMIN can register a Hospital (`hospital:create`; canonical code rule shared with Master reconciliation; always `PENDING_VERIFICATION`, so onboarding approval remains the only activation path) and rename it (`hospital:rename`, optimistic `expectedUpdatedAt`). Audit events are `hospital.created` / `hospital.renamed`. ADMIN cannot set `parentHospitalId`; canonical placement stays with Master reconciliation. After cutover the database is the source of truth for names and the registry list: reconciliation keeps adding missing Master records, while `UNEXPECTED_HOSPITAL` and `NAME_MISMATCH` remain report-only unless an operator explicitly passes the existing confirmation flag.

**Unchanged.** OWNER attach/end semantics and authority, immutable history trigger, Serializable transaction with audit and error codes. Platform ADMIN still has no Patient access through the network. Patient read and report scope are now defined by [ADR-0016](./0016-network-patient-read.md).

## Consequences

- New main Parent Hospitals need no code or JSON change: ADMIN sets the PARENT role, the existing onboarding flow creates the first OWNER, the OWNER attaches free Children and ADMIN transfers occupied ones.
- Parent reports follow the network (ADR-0016).
- A compromised ADMIN account can reshape the network and thereby which Parent reads which Child; every change is audited with actor and reason, and ADMIN itself never reads Patients.
- Hospital owners: the existing last-OWNER guard (`assertEligibleOwnerRemains`) and OWNER promote/demote stay as they are. Delegating area management or Child Patient reads to MEMBERs is deferred to Phase B, using a per-membership grant like E1 `reportExportGrantedAt`.
- UI: `/app/admin/hospitals` (register, role, rename, transfer, end) and `/app/hospitals/network` (OWNER attach/end); see ADR-0016 for Patient reads.
