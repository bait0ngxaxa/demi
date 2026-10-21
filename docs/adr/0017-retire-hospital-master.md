# ADR-0017: Retire Hospital Master and the Canonical Parent Link

- Status: Accepted (Product Owner, 2026-10-20)
- Date: 2026-10-20
- Supersedes: the Hospital Master seed/reconciliation decisions of Phase 3B and ADR-0013 §1 (canonical Master owns placement). Completes [ADR-0015](./0015-admin-governed-hospital-network.md) and [ADR-0016](./0016-network-patient-read.md).

## Context

After ADR-0016 the canonical `Hospital.parentHospitalId` granted nothing, but the approved 78-record Master dataset, its seed/reconcile scripts, the canonical hierarchy service and several screens still read it. The customer will not use Hospital Master data: every Hospital is registered anew.

## Decision

- Platform ADMIN registers every Hospital (`createHospital`: name, network role, optional code — a blank code is generated as `H-XXXXXX` from an unambiguous alphabet) and edits name/role; onboarding activates it and creates the first OWNER.
- Removed: `prisma/seed/hospital-master-v2.json`, `scripts/seed-hospital-master.mjs`, `npm run db:seed`, `hospital-master-reconciliation-service`, the service-area adoption report, and the Master reference view on the governance screen.
- `Hospital.parentHospitalId` is dropped (migration `20261030140000_drop_canonical_hospital_parent`).
- `hospital-hierarchy-service` is now a read-only projection of the network for reporting/governance screens: classification `MAIN` (role PARENT) / `SUBORDINATE` (role CHILD) / `UNASSIGNED`, network Parent and active network Children; Hospitals in no network group are listed as `outsideNetwork`. There are no canonical-integrity diagnostics any more; database constraints protect the network.
- Onboarding lists pending Hospitals grouped by network role (Parent, Child, other).
- The synthetic demo seed creates its own `DEMO`, `DEMO-A`, `DEMO-B` Hospitals with roles when missing.

## Consequences

- Fresh environments start with no Hospitals; ADMIN registration is the only path.
- Existing environments keep their Hospital rows, roles and history; only the canonical link is dropped. Existing data is never deleted by this change.
- Historical migrations that reference `parentHospitalId` stay unchanged (they ran before the drop).
