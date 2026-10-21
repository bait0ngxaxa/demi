# ADR-0016: Read-Only Network Patient Access and Network-Scoped Parent Reports

- Status: Accepted (Product Owner, 2026-10-20)
- Date: 2026-10-20
- Supersedes: [ADR-0013](./0013-responsibility-areas.md) H5 (Parent reports follow the canonical link) and §3 "Parent OWNER Patient list / clinical detail: Deny". Builds on [ADR-0015](./0015-admin-governed-hospital-network.md); supersedes ADR-0014's "an association grants no Patient/report authority" boundary.

## Customer decisions

| Topic | Decision |
| --- | --- |
| Parent reads Child Patients | Yes: after selecting a network Child, Parent readers see every Patient and everything the Child's own staff see on the Patient pages (profile, Programs, rounds, goals, follow-ups, screenings, Baseline, evidence, appointments, classification, self-measurements), **read-only**. |
| Who in the Parent | Parent OWNER by role; a Parent MEMBER only with an OWNER-issued per-membership grant (`HospitalMembership.networkPatientReadGrantedAt/ByUserId`, MEMBER-only SQL CHECK, cleared on promotion — same shape as E1 `reportExportGrantedAt`). |
| Child staff | Unchanged: only their own Hospital. |
| After end/transfer | The former Parent loses access immediately; no historical read. |
| Child eligibility | A Child must be onboarded (ACTIVE) before a Parent can attach it. |
| Parent reports (H5) | Follow the active network association, not canonical `parentHospitalId`. Areas overview, Parent report targets and work-area grouping use the network too. |
| Network roles | Chosen by Platform ADMIN when registering a Hospital (no reference text). Existing Master Hospitals were bootstrapped once by migration `20261030110000`: no canonical parent ⇒ PARENT, canonical parent ⇒ CHILD (`classifiedByUserId` NULL marks system origin). |

## Decision

`src/modules/hospital-service-areas/services/hospital-network-access.ts` is the only cross-Hospital authority. All predicates are persisted-state SQL evaluated per request: ACTIVE User with HOSPITAL role, ACTIVE Parent membership (OWNER, or MEMBER holding the grant), ACTIVE Parent with role PARENT, an active association, ACTIVE Child with role CHILD.

Patient read resolvers (directory list/detail, appointment, Program, Baseline, evidence, screening, classification, follow-up, goal and everything built on them) keep their direct policy first. Only when it denies a **READ** capability does `assertDirectOrNetworkPatientRead` apply the network grant, and every network read writes `patient.network_read` audit (actor, granting Parent, Child, scope, resource). Write capabilities never take the network path; write services that start from a READ resolver additionally require `scopes.directHospital` or a manage capability, which a network reader never holds. Integration tests assert that appointment create, profile update, Program completion, Patient provisioning and OSM assignment are refused.

Reports: `resolveParentChildHospitalReportAccessContext` and `listParentChildHospitalReportTargetGroups` resolve the exact Child through the active association (OWNER only; context check before any read). Canonical reparenting alone no longer changes report access.

## Consequences

- Platform ADMIN still has no Patient access through governing the network.
- Canonical `parentHospitalId` grants nothing anymore; [ADR-0017](./0017-retire-hospital-master.md) later removed it together with Hospital Master.
- Network reads are audited per page load, which grows `AuditEvent`; retention is unchanged.
- The synthetic demo seed fills missing roles for its Parent/Children and attaches them through the OWNER service; the demo reset purges only demo-user-attributed association history via a transaction-local `demi.service_area_purge = 'demo-reset'` setting honoured by the history trigger (migration `20261030130000`). Application code never sets it.
