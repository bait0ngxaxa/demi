# ADR-0026: MEMBER operational parity

- Status: Accepted (Product Owner, 2026-11-01)
- Date: 2026-11-01
- Supersedes: [ADR-0019](./0019-owner-administration-and-import-only-roster.md) "OWNER is the Hospital administrative control plane" for every OPERATIONAL row below, and its 2026-10-21 amendment that kept the dashboard, row reads, `INCLUDE_ENDED`, network and Parent→Child reports OWNER-only; [ADR-0016](./0016-network-patient-read.md) "a Parent MEMBER only with an OWNER-issued per-membership grant"; [ADR-0023](./0023-service-request-appointments.md) "Both stay with an ACTIVE direct OWNER" (confirm/reject). Builds on [ADR-0025](./0025-network-report-export.md), which already gave the network export to OWNER and MEMBER.
- Inventory: [Authorization capability inventory](../requirements/AUTHZ_CAPABILITY_INVENTORY.md) classifies every OWNER gate and is enforced by a guard test.

## Context

ADR-0019 split the Hospital into an OWNER administrative plane and a MEMBER/OSM care plane. In practice the Hospital's staff (MEMBER) do the daily operational work: they read and export the reports, confirm patients' visit requests, assign อสม. to patients and read the network's patients. Each of these was OWNER-only or needed an OWNER-issued grant, so an OWNER had to do the work or hand out grants one by one.

## Decision

An ACTIVE OWNER and an ACTIVE MEMBER of an ACTIVE Hospital have the same rights, except **Hospital management** and **user management**, which stay OWNER-only. OSM, PATIENT, CAREGIVER, Platform ADMIN and the Child/Parent boundaries are unchanged.

| Capability | Class | Who |
| --- | --- | --- |
| Hospital settings, contact info edit, self-registration switch, service catalog (`HospitalServiceOffering`) | HOSPITAL_MANAGEMENT | OWNER |
| Hospital news/content composer (create/edit/publish/images) | HOSPITAL_MANAGEMENT | OWNER |
| Network: create/attach/end Child, rename/cancel Child, Child OWNER invitation (network-read grant management is retired below) | HOSPITAL_MANAGEMENT | OWNER |
| Workforce staff/OSM: provision, lifecycle, promote/demote, activation links/slips, credential reset/recovery issuance, account-misuse report (UM-1), staff/OSM name correction | USER_MANAGEMENT | OWNER |
| Patient Excel import (roster creation) | USER_MANAGEMENT | OWNER |
| Patient account invitations, activation links, slips, regeneration | USER_MANAGEMENT | OWNER |
| Patient account recovery/reset | USER_MANAGEMENT | OWNER |
| End patient–Hospital care relationship (Phase F ก-18) | USER_MANAGEMENT | OWNER |
| Reports: dashboard, row reads, `INCLUDE_ENDED` cohort, export, Parent→Child summary read/export (RPT-32), network export (ADR-0025) | OPERATIONAL | OWNER + MEMBER |
| Service requests: confirm ("ยืนยันนัด") / reject (ADR-0023) | OPERATIONAL | OWNER + MEMBER |
| OSM ↔ Patient assignment (single and bulk), and the Patient list of one OSM | OPERATIONAL | OWNER + MEMBER |
| Network Patient read (ADR-0016) | OPERATIONAL | OWNER + MEMBER of the Parent, no grant |
| Patient name correction (E3) | OPERATIONAL | OWNER + MEMBER |
| Care tracking "รวมผู้ที่สิ้นสุดการดูแล" (`includeEnded`) | OPERATIONAL | OWNER + MEMBER |
| Everything already PATIENT_CARE or personal self-service | — | unchanged |

The last two OPERATIONAL rows that the original decision table did not name (the Patient list of one OSM and care tracking `includeEnded`) were classified by the Product Owner on 2026-11-01. The report dashboard's network summary (`getHospitalHierarchyContext`, used only by the report pages) follows the reports.

### One source of authority

`src/modules/identity/services/hospital-authority.ts` is the only definition:

- `hospitalOperatorMembershipWhere(userId, hospitalId?)` — ACTIVE OWNER or MEMBER membership, ACTIVE User with the HOSPITAL role, ACTIVE Hospital; `isActiveHospitalOperator(actor, hospitalId)` is the matching context check.
- `hospitalAdministratorMembershipWhere(userId, hospitalId?)` — the same with OWNER only; `isActiveHospitalAdministrator(actor, hospitalId)`.
- `accessBasisForMembershipType` maps the persisted membership to the audit `accessBasis` (`OWNER` | `MEMBER`).

Every OPERATIONAL gate uses the operator pair; no switched gate keeps an inline OWNER/MEMBER list. As before, the context check runs first and the persisted predicate decides, so a SUSPENDED or ENDED membership, a suspended User or Hospital, or another Hospital's membership is refused whatever the session claims.

### Specific consequences

- **Reports.** `decideHospitalReportPolicy` allows every capability and both cohorts for the operator; `listHospitalReportingHospitals` lists MEMBER Hospitals; audits keep `accessBasis`. `reportExportGrantedAt` stays ignored. The Parent→Child policy and resolver use the operator check and the network `REPORT` authority (renamed from ADR-0025's `REPORT_EXPORT`, now covering RPT-32 too).
- **Service requests.** `review` (inbox, confirm, reject) uses the operator; confirmation keeps every ADR-0023 rule: one serializable transaction, one-off visit OSM scope, the appointment nonce and the audit actor (now the MEMBER when a MEMBER confirms). `manageCatalog` stays administrator-only.
- **OSM assignment.** Policy, single and bulk transactions accept the operator; OSM eligibility and the no-self-assignment rule are unchanged.
- **Network Patient read.** `PATIENT_READ` is OWNER or MEMBER of the Parent; `networkPatientReadGrantedAt` no longer matters. The column and its MEMBER-only SQL CHECK stay (no destructive migration; promotion still clears it). The grant issue/revoke service, server action, workforce control and `ActorHospitalMembership.networkPatientReadGranted` are removed; the policy capability is kept only to reject stale callers. Every `patient.network_read` audit records `accessBasis`, re-read from the reader's ACTIVE Parent membership; a reader who no longer operates the Parent is refused. Writes never take the network path.
- **Name correction.** The Patient variant (E3) uses the operator and records `basis: HOSPITAL_MEMBER_SINGLE_HOSPITAL` for a MEMBER; the staff/OSM variant (UM-1) stays administrator-only. The single-Hospital rule and the ADMIN path are unchanged.
- **Navigation.** Menus follow the policies: a MEMBER sees reports and export (both cohorts), network reports and export, the service-request inbox, OSM assignment, network patients and Patient name correction; OWNER-only actions stay hidden. Reports are no longer an "administration" action on the Home grid. The generic HOSPITAL LINE rich menu still links only to the Work workspace.

## Consequences

- A MEMBER can see and export every Patient row of its Hospital and its network's Children, as the OWNER could. Reads stay audited; network reads now say whether the reader was an OWNER or a MEMBER.
- Hospitals no longer need OWNERs to hand out network-read grants; existing grant values are inert history.
- A future OWNER gate must be classified in the inventory before the guard test passes; an OPERATIONAL gate must use the operator predicates.
