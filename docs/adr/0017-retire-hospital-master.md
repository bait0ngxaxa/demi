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

## Amendment — 2026-10-21 (Phase N1, Product Owner approved defaults N1-D1..D5)

Corrections to the Decision and Consequences above:

- **Database constraints did not protect the network.** At acceptance, role consistency (an area's Parent has role PARENT, its Child role CHILD, and a role cannot change or be cleared while an active area uses it) was enforced only in application code. Migration `20261031110000_hospital_registry_hardening` adds the triggers `HospitalServiceArea_network_roles` (BEFORE INSERT; locks both role rows `FOR SHARE`) and `HospitalServiceAreaEligibility_in_use` (BEFORE UPDATE OR DELETE), both raising SQLSTATE 23514, which the service layer maps to a conflict. The application checks stay as the user-facing first line.
- **Existing data was not fully preserved.** Dropping `Hospital.parentHospitalId` irreversibly removed the canonical parent mappings; they cannot be reconstructed from the database. Hospital rows, network roles and service-area history were kept.

Additions:

- `HospitalStatus.RETIRED` (“ถอนออกจากรายชื่อ”, migration `20261031100000_hospital_status_retired`): Platform ADMIN withdraws an unclaimed `PENDING_VERIFICATION` Hospital from the public onboarding list with a reason, singly (optimistic `expectedUpdatedAt`) or up to 100 at once (all-or-nothing, one audit event each). Refused for ACTIVE/SUSPENDED Hospitals and while an onboarding application is pending. ADMIN can restore it to `PENDING_VERIFICATION` with a reason. `retiredAt`/`retiredByUserId`/`retiredReason` are set exactly while RETIRED (CHECK `Hospital_retirement_consistency`); every retire/restore reason is kept in append-only `HospitalRetirementEvent`. A RETIRED Hospital is never deleted, keeps its code, and is outside onboarding (list, submit, approval), the network (attach, transfer target, role changes) and reports. Audit: `hospital.retired`, `hospital.retired_restored`.
- Idempotent registration: `createHospital` requires a form submission nonce (`Hospital.registrationNonce`, unique, with `registeredByUserId`). Replaying it by the same ADMIN with the same name, role and code returns the existing Hospital; any other reuse is a conflict. Existing rows keep NULL.
- Onboarding re-reads the Hospital status inside a serializable transaction before creating an application, so a concurrent retire and submit cannot both commit.
- Pending, not decided here: replacing the public "choose a Hospital and apply" list with ADMIN-issued per-Hospital OWNER invitations (WB-PD-12).
