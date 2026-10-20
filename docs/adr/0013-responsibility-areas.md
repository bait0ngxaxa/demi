# ADR-0013: Responsibility Areas as Direct Child Hospitals

- Status: Accepted; H1 operational self-management restriction partially superseded by [ADR-0014](./0014-operational-hospital-service-areas.md) (2026-10-20)
- Date: 2026-10-16 (proposed); accepted 2026-10-17
- Customer decision: ก-14 (final); จ-1..จ-5 (2026-10-17, see “Customer decisions”)

## Current decision amendment (2026-10-20)

The Product Owner now authorizes active direct Parent OWNERs to attach/end eligible existing Child operational service-area associations. [ADR-0014](./0014-operational-hospital-service-areas.md) supersedes H1's prohibition of operational self-management and its single canonical-area equivalence; it adds a separate association, never OWNER writes to official identity or `parentHospitalId`. The historical decision and alternatives below are retained as the Phase H record. H2–H5, direct work authority, summary/reporting scope and all Patient/workforce restrictions remain unchanged. Current canonical reports continue to use canonical links; ending an operational association does not remove the independent canonical-report authority. Management UI, network Patient read, editable fields and cross-Parent approval are not delivered by Phase A.

## Context

The customer defines a responsibility area as a child รพ.สต. under a Parent Hospital, using the existing Hospital hierarchy. The Parent Hospital's admin defines the responsibility area. This ADR treats an area as the exact direct Child `Hospital`; it is not a geographic cohort, an OSM assignment, a Patient assignment, or a new authorization role.

The current `Hospital` model stores `parentHospitalId`. The hierarchy service accepts only a one-level main-to-direct-child structure. Hospital master reconciliation derives parent links from canonical master records; Hospital onboarding selects an existing pending-verification Hospital by `hospitalCode`, and Platform ADMIN approval activates that Hospital and grants the applicant a direct OWNER membership. The onboarding submission does not accept a parent Hospital ID or create an arbitrary Hospital row.

There is no general authorization inheritance through `parentHospitalId`. Current Parent OWNER reporting is an explicit exception: an active direct Parent OWNER may read an exact active direct Child's nine allowlisted aggregate values. It does not include Patient rows, clinical detail, workforce authority, mutation, or Child report export. See [REPORTING_ACCESS_CANONICAL.md](../requirements/REPORTING_ACCESS_CANONICAL.md).

## Decision summary

1. Area identity is `childHospitalId` where the current server-resolved hierarchy proves an active direct child of the selected active Parent. No separate Area entity or duplicate area assignment is proposed.
2. Staff and OSM work authority remains attached to the exact Child through existing `HospitalMembership` and `OsmHospitalRelationship` records. A Parent membership alone does not make a Child selectable for work.
3. Parent OWNER access remains aggregate-only. For RPT-32, the Parent OWNER may download an audited export of the same nine Child summary fields already approved for Parent OWNER viewing. Patient-level export and parent MEMBER access remain denied until separately approved.
4. Child users receive no parent or sibling data through hierarchy. Any direct membership or grant is evaluated independently for its exact Hospital.
5. Patient, OSM, appointment, and LINE operations remain bound to an exact Child relationship. No cross-Hospital copying or notification is implied.
6. Transfers preserve the source Child's history. Ending an area does not delete a Hospital or its records and does not preserve former-Parent access by implication.

## Customer decisions (2026-10-17)

The customer answered the §9 questions (จ-1..จ-5) with this ADR's recommendations; the ADR is accepted on that basis and implemented in Phase H. Recorded in [WB_ALIGNMENT_DECISIONS.md](../requirements/WB_ALIGNMENT_DECISIONS.md) §ซ (closes WB-PD-04).

| ID | Ref | Decision |
| --- | --- | --- |
| H1 (partially superseded by ADR-0014) | จ-1 | A Parent OWNER selects only active direct Children that the canonical Hospital Master already links. No Parent self-service attach/detach; hierarchy changes use the master data + Platform ADMIN reconciliation path (unchanged). §1 option C. |
| H2 | จ-2 | “ดาวน์โหลดตามเขต” (RPT-32) = export of the existing nine aggregate values of the exact Child summary only; no patient-level data. §3 option B. |
| H3 | จ-3 | Child OWNERs add their own staff/OSMs through the existing workforce flows. The Parent OWNER may view Child workforce membership only if this ADR allows a roster view; §8 denies it, so no roster view is added. ADR-0008 is unchanged. §2 option A. |
| H4 | จ-4 | Moving a Patient between Children = Phase F end at the source + normal provisioning/import at the target. No transfer workflow, no record copy. §6 option B. |
| H5 | จ-5 | Reports follow the current parent link only; no historical Parent attribution. §6. |

Implementation (Phase H): STAFF-04 work-area selector on the Work home built from the actor's active direct memberships/OSM relationships grouped by parent network; `/app/hospitals/areas` Parent area overview; capability `hospital-network:child-report:export` with `GET /api/v1/hospital/reporting/parent-child/export`; §8 matrix tests in `src/modules/reporting/policies/responsibility-area-matrix.test.ts` and `parent-child-hospital-report-workbook-service.test.ts`. No schema migration.

## 1. Create or attach a Child Hospital; onboarding and verification

### Options

- **A — Parent OWNER creates a Hospital and sets its parent link.** This is the fastest path, but it creates an organization and official hierarchy link from tenant input, bypasses the canonical Hospital Master and the existing verification trust chain. **Reject.**
- **B — Parent OWNER attaches an existing Hospital directly in the application.** This gives the Parent control over its operational network, but changes the current master-owned `parentHospitalId` relationship. A parent-link mutation can change who qualifies for the existing Child summary report and can conflict with later master reconciliation. **Do not enable as a direct write under the current source-of-truth contract.**
- **C — Hospital Master / Platform ADMIN establishes the canonical Parent–Child link; Parent OWNER selects an eligible Child from that verified direct-child list.** A new facility must first exist in the canonical Hospital Master, then use the existing onboarding application and manual Platform ADMIN approval. **Recommended.**

### Recommendation

Do not let a Parent OWNER create a `Hospital` row or change `parentHospitalId` directly. A responsibility area is selectable only when the database currently resolves the target as an active direct Child of the active Parent. The Parent OWNER defines the operational area by choosing that exact Child in the area/work/report selector. If the facility or parent link is missing or wrong, the Parent OWNER requests a canonical master correction; the approved master reconciliation or Platform ADMIN path applies it and audits the change.

The existing onboarding flow remains unchanged: the applicant applies for an existing `PENDING_VERIFICATION` Hospital identified by canonical `hospitalCode`; Platform ADMIN reviews and approves; approval activates the Hospital and creates the applicant's direct active OWNER membership. Parent-child placement is not an applicant-supplied value and onboarding does not grant Parent authority over the Child.

This option means each active direct Child is an eligible area; the application does not maintain a second Parent-specific subset flag. If the customer needs a Child to exist in the official hierarchy but be excluded from one Parent's operational areas, that is a different model and requires a new decision.

**Security trade-off:** keeping the canonical master as the authority prevents a compromised Parent account from claiming or reparenting another Hospital and unexpectedly gaining Child summary access. It adds an administrator/master-data step when the verified hierarchy is incomplete. Any later decision to permit self-service attachment must explicitly change the master/reconciliation ownership rule and audit the exact before/after Parent and Child IDs; it must not be treated as general permission inheritance.

## 2. Assign staff and OSMs; login context and STAFF-04 work selector

### Options

- **A — Use direct Child relationships.** Staff have a direct Child `HospitalMembership`; OSMs have a direct Child `OsmHospitalRelationship`. The Child OWNER uses the existing workforce flows. **Recommended.**
- **B — Add an area-assignment record on the Parent.** This would create a second relationship to resolve in every work, report, and mutation policy, while the existing Child membership/OSM relationship would still be needed to establish exact-Hospital authority. **Reject for this scope.**
- **C — Let Parent OWNERs administer Child workforce directly.** This would centralize staffing but override ADR-0008's exact-target OWNER requirement. It would need a new named capability, precise target Child checks, limited membership types, explicit delegation, and audit; the Parent link alone is insufficient. **Defer pending customer approval.**

### Recommendation

Keep the Child's existing membership models as the only work-scope source:

- A staff member assigned to an area must have an active direct `HospitalMembership` at that Child. The Child OWNER provisions or ends it under the existing workforce governance rules.
- An OSM assigned to an area must have an active direct `OsmHospitalRelationship` at that Child. Patient work still requires a separate active `PatientOsmAssignment` for the exact `PatientHospitalRelationship`.
- A Parent OWNER may nominate or coordinate a person, but Parent OWNER authority alone does not create a Child membership, OSM relationship, or Patient assignment. No Child OWNER role is created by Parent assignment.

For STAFF-04, the work-home selector must list only areas resolved from the signed-in User's current active direct Child memberships (staff) or OSM–Child relationships (OSM), as appropriate to the requested capability. A Parent OWNER may select a Child for the separately authorized Parent summary report. A Parent member who has only a Parent membership cannot select that Child as a work context. A browser-supplied Hospital ID is a locator; each request re-resolves the active relationship and capability server-side. The current home workspace is assembled from direct Hospital memberships and OSM–Hospital relationships; the workforce Hospital switcher is limited to direct active memberships.

**Security trade-off:** Child OWNER-managed workforce adds a local approval step and may slow centrally coordinated staffing. It preserves ADR-0002/0008's direct-scope boundary and avoids making an area-assignment row an alternate authorization authority. If direct Parent assignment is required, approve an exact-child delegation and audit it as a separate rule before implementation.

## 3. Parent OWNER/MEMBER access to a Child; RPT-32

### Options

- **A — Inherit all Parent permissions into every Child.** This would expose Patient and workforce operations without a Child-specific decision. **Reject.**
- **B — Parent OWNER reads and exports only the existing exact-Child aggregate summary; no Parent MEMBER Child access.** **Recommended for the initial RPT-32 design.**
- **C — Add patient-identifying rows or clinical records through a separate per-Child grant.** This could support more detailed oversight, but needs customer approval of purpose, actor, fields, row grain, time window, recipient, consent/governance, retention, revocation, and audit. **Defer.**

### Recommended access matrix

| Parent actor and Child scope | Patient list / identifiers | Individual care record or clinical detail | Child mutation | Report / RPT-32 export |
| --- | --- | --- | --- | --- |
| Active Parent OWNER; exact active direct Child | Deny | Deny | Deny | Read the current exact-Child summary; export of the same nine aggregate fields only, with an export audit (accepted, H2) |
| Active Parent MEMBER; Parent membership only | Deny | Deny | Deny | Deny Child summary and export |
| Parent MEMBER with a separate active direct Child membership | Use direct Child policy only | Use direct Child policy only | Use direct Child policy only | Child OWNER's ก-15 grant applies only to that Child's existing Hospital workbook; it is not Parent-derived access |

The RPT-32 export contains only the Parent Child report's existing allowlist plus the Child identity needed to label the selected report:

1. Patient–Hospital relationship count.
2. Relationships without a Program.
3. Total, ACTIVE, and COMPLETED Program counts.
4. Count of Programs with a Routine record.
5. Count of Programs with a Floating Chart record.
6. Count of Programs with a Dream Card record.
7. Count of Programs with a Confidence record.

These are nine values: five Hospital summary values and four record-presence counts at Program grain. The default cohort is active Patient–Hospital relationships; ended relationships are excluded. The export must not contain Patient name, HN, national identifier, contact/address, Patient/Program IDs, individual Program rows, measurements, Baseline/Final values, OSM names, or care-record details. It is one exact active Child per export, not a network aggregate or combined workbook.

The Parent OWNER's summary export is a new explicit RPT-32 capability (`hospital-network:child-report:export`, accepted as H2). It does not reuse `HospitalMembership.reportExportGrantedAt`. It must re-check current Parent OWNER, active Parent, current direct-child link, active Child, and exact report capability at export time, then audit actor, Parent, Child, operation, outcome, and timestamp without storing report values in audit metadata. Parent MEMBER access remains denied unless the person also has a separate direct Child relationship and acts through that Child's policy.

**Security trade-off:** aggregate-only export supports the requested “ดาวน์โหลดตามเขต” workflow with substantially less exposure than row-level health data, but a downloaded file can still be copied or redistributed and small counts may reveal information. No cell-suppression threshold or onward-sharing permission is invented here. If the customer expects patient-level service rows, RPT-32 stays gated until those fields and disclosure rules are explicitly approved.

**Current hierarchy authorization vs record-time disclosure (Phase H remediation):** H5 decides who may access a Child under the current Parent–Child link and requires the former Parent to lose access after reparenting. It does not decide whether the new Parent may see active-cohort aggregate values whose underlying Patient–Hospital relationship, Program, or Service Process record predates that current link. `Hospital.parentHospitalId` stores only the current Parent; the report query has no effective date or record-level Parent provenance and cannot enforce such a time boundary. H5 therefore remains unchanged, but it is not historical disclosure approval. Small aggregate counts may also reveal sensitive information; no suppression threshold or consent rule is inferred.

**Real-data release gate:** keep the approved nine-value aggregate-only demonstration available with synthetic fixtures in a controlled test database. No runtime mode distinguishes synthetic from real data. Do not treat implementation or tests as approval to disclose real Patient data through either the summary view or export until the Owner answers: (1) may the current Parent OWNER see the active Child cohort's nine values when source records may predate the current Parent link, or must those records be excluded using a separately identified authoritative timestamp/source; and (2) what disclosure review or safeguards, if any, are required for low aggregate counts? Until then, real-data use remains gated. No effective-dated hierarchy, schema migration, environment flag, consent rule, or suppression threshold is introduced by this ADR clarification.

**Export audit contract (Phase H remediation):** unauthenticated requests receive 401 and are not audited, avoiding anonymous audit-log amplification. A verified session denied DEMI application access before an `ActorContext` exists records one actorless `denied` event without request-supplied IDs; authenticated malformed requests record one actor-bound `denied` event. Once an actor is resolved, the export service owns exactly one `prepared`, `denied`, or `failed` event for the outcome, and the route must not duplicate it. Audit metadata contains no report values or Patient data. If a required export audit write fails, the file is not delivered and the request fails closed.

## 4. What Child staff can see about the Parent or siblings

### Options

- **A — No parent/sibling operational data by default.** **Recommended.**
- **B — Read-only network directory or aggregate reports for Child users.** This creates a separate disclosure path and is not part of ก-14.
- **C — Share care records across all linked facilities.** This is broad cross-Hospital access and is not approved.

### Recommendation

Child OWNER, Child MEMBER, and Child OSM see no Parent or sibling patient lists, care data, workforce rosters, reports, or operational records through `parentHospitalId`. A user who also has a separate direct membership or relationship at the Parent or a sibling may use only the capability and scope attached to that exact relationship. The existing Parent OWNER-to-Child summary path is directional and does not create a reverse Child-to-Parent permission.

**Security trade-off:** this limits network coordination and may require users to change context or ask another Hospital to share data. It prevents a Child account or a compromised Child credential from enumerating the full Parent network.

## 5. Patient import, OSM assignment, appointments, and LINE

### Options

- **A — Keep each operation bound to one exact Child Hospital and its own relationships.** **Recommended.**
- **B — Import or copy a Patient, OSM assignment, appointment, or notification into every Child in the Parent network.** This can duplicate identity, misattribute care, and notify the wrong facility/user. **Reject.**
- **C — Add a separate cross-Child transfer workflow.** This may be needed for a Patient or OSM move, but is covered by the explicit transfer rules in §6, not by ordinary import or hierarchy membership. **Use only for an approved transfer.**

### Recommendation

- Patient import names one target Child Hospital, resolves/reuses the existing Person/User identity, and creates or reports a relationship only for that Hospital. A `PatientHospitalRelationship` is the Patient's local cohort and HN/profile scope; import does not copy a sibling's local profile or auto-assign an OSM.
- OSM association and Patient assignment are separate. An OSM must have an active OSM–Child relationship, then be assigned to a Patient's active relationship at that exact Child. Parent membership or a sibling assignment does not qualify.
- Appointments and care records remain attached to the exact `PatientHospitalRelationship`. Parent or sibling staff are not appointment operators or recipients by virtue of the hierarchy.
- Appointment LINE recipient resolution remains the Patient, the currently assigned eligible OSM, and a caregiver with an active appointment grant. Parent staff, Child Owner, or a sibling OSM is not added as a recipient by area membership. Revalidate recipients at send time under the existing appointment rules.

**Security trade-off:** per-Child records and notification recipients require explicit setup and can leave duplicate local data when the same Person receives care from multiple Hospitals. They preserve facility attribution, prevent unrelated Child disclosure, and avoid cross-site LINE messages. Any approved transfer must not copy old clinical facts by default.

## 6. Moving a Patient or OSM; ending an area; history attribution

### Options

- **A — Change the existing relationship's Hospital ID and carry records forward.** This rewrites the facility that owns existing history and can revive an ended relationship. **Reject.**
- **B — Create a new exact Child relationship and retain the source relationship as history; require explicit end/assignment operations.** **Recommended.**
- **C — Keep the area open forever and remove users only.** This leaves a stale Parent–Child scope and does not define the end of the area. **Reject.**

### Recommendation

- **Patient move:** create a new Patient–Hospital relationship at the target Child through that Child's authorized provisioning/import path. Do not change the old relationship's `hospitalId` or copy its care records. If the move ends care at the source Child, use the Phase F terminal end operation: the source relationship stays for history, its active OSM assignment ends, future scheduled appointments are cancelled without a LINE message, open requests are closed, and pending activation for that Hospital is revoked. The target Child records new/local data. Re-admission to a Child whose relationship already ended remains blocked as `ENDED_RELATIONSHIP` pending the existing Platform ADMIN decision; an area move is not a bypass.
- **OSM move:** end the source OSM–Hospital relationship through its existing lifecycle and create a separate direct relationship at the target Child. Do not carry active Patient assignments across. The target Child OWNER assigns the OSM to its own Patient relationships. Past appointments and care history remain attributed to the original Child and OSM at the time of service.
- **End an area:** end/remove the current Parent–Child association through the authorized hierarchy process; do not hard-delete the Hospital, Patient relationships, care records, or assignment history. The Child can continue direct work if its own Hospital remains active. Current Parent access to that Child ends when the current direct-child relation ends. Existing records remain attributed to the Child Hospital that owns them.
- **Historical Parent attribution:** current `parentHospitalId` stores only the current parent. It is not an effective-dated history. Do not show a former Parent historical cohort after detach/reparenting. If the customer needs historical reports by the Parent responsible at the time, require an effective-dated hierarchy/area history and a separate authorization decision before implementation; `updatedAt` or the current parent link is not a substitute.

**Security trade-off:** requiring separate source-end and target-create steps is slower and may leave a period with no active OSM assignment. It prevents source history from being silently moved, preserves the Patient's right to read their own ended history, and avoids reactivating authority after Phase F.

## 7. ก-15 export grants and Phase F ended relationships

### Options

- **A — Reuse a Parent member's existing ก-15 grant for every Child in the hierarchy.** This expands a grant beyond its exact Hospital target. **Reject.**
- **B — Keep ก-15 exact-Hospital and give Parent OWNER only the proposed separately audited aggregate RPT-32 export.** **Recommended.**
- **C — Create per-Child export grants for Parent MEMBERS or row-level Child export.** This may be considered later but is not granted by either the Parent link or the existing `reportExportGrantedAt` field. **Defer for explicit customer approval.**

### Recommendation

ก-15 is an OWNER-granted export capability for an active MEMBER's existing Hospital workbook at the exact Hospital named by that `HospitalMembership`. A grant at the Parent applies only to the Parent workbook. It does not authorize a Child workbook or RPT-32 Child export. A Child-local MEMBER export requires that exact Child's active membership and Child OWNER's exact grant; suspension/end, grant revocation, or inactive Hospital status removes its effect. Promotion to OWNER clears the MEMBER grant under the existing flow.

The Parent OWNER RPT-32 summary export is a distinct capability, limited to the nine values in §3; the Parent-to-Child read path itself remains read-only. No Parent MEMBER receives this capability from ก-15.

Every area report uses the active cohort by default. Phase F `endedAt` is terminal for work access: it blocks staff/OSM/caregiver/notification scope and excludes the relationship from default report cohorts. The Patient may read their own ended history; an exact Child OWNER may use the existing include-ended report option in that Child's own report. The Parent RPT-32 summary contains active-cohort data only and provides no include-ended control. Neither reassigning an OSM nor changing an area's hierarchy reopens a Patient relationship.

**Security trade-off:** a separate Child grant would be more flexible but creates a new cross-Hospital disclosure authority and revocation surface. Keeping current ก-15 exact-Hospital prevents a familiar-looking Parent grant from silently authorizing Child data.

## 8. Implementation test matrix

Use the following matrix as the authorization contract for the implementation phase. “Allow” is capability-specific; all inputs must be re-resolved from current server state. The Parent summary export rows apply because this ADR is accepted (H2).

| Actor | Scope | Action | Expected |
| --- | --- | --- | --- |
| Active Parent OWNER | Own active Parent | View/manage own Hospital context under existing direct OWNER policies | Allow |
| Active Parent OWNER | Exact active direct Child | List/select Child as an Area and read the nine-field Child summary | Allow |
| Active Parent OWNER | Exact active direct Child | Export the same nine summary fields with export audit (RPT-32) | Allow |
| Active Parent OWNER | Child patient relationship | List Patient rows, open Patient/care details, or write care/appointments | Deny |
| Active Parent OWNER | Child workforce | Read Child workforce roster or add/end Child staff/OSM | Deny under current ADR-0008; requires separate delegation decision |
| Active Parent OWNER | Sibling, grandchild, unrelated, inactive, or reparented Child | Read/export Child summary | Deny |
| Active Parent MEMBER | Parent membership only; selected Child | Select Child as work scope, read Child summary, or export Child data | Deny |
| Active Parent MEMBER | Parent membership with ก-15 grant; selected Child | Export Child workbook or Child RPT-32 | Deny; Parent grant is exact-Parent only |
| Active Child OWNER | Own active Child | Use current direct Child patient/care, workforce, and report policies | Allow |
| Active Child OWNER | Parent or sibling | Read Parent/sibling patient, care, workforce, or report data | Deny |
| Active Child MEMBER | Own active Child | Use current direct Child capabilities | Allow where that operation's policy allows |
| Active Child MEMBER | Own Child | Export the existing Child Hospital workbook | Allow only with that exact Child's active ก-15 grant |
| Active Child MEMBER | Parent or sibling | Use their membership or report grant to read/export another Hospital | Deny |
| Active OSM | Exact active Child relationship and active assignment to exact Patient relationship | Read assigned Patient work permitted by OSM policy | Allow |
| Active OSM | Exact Child relationship but no active Patient assignment | Read Patient/care record | Deny |
| Active OSM | Parent, sibling, or another Child's Patient relationship | Read/assign Patient or appointment | Deny |
| Hospital staff or OSM | Ended Patient–Hospital relationship | Work, write, assign OSM, reschedule, notify, or include in default area export | Deny / exclude |
| Patient | Own ended Patient–Hospital relationship | Read own retained history | Allow read-only |
| Parent OWNER | Child with ended Patient relationships | RPT-32 export | Allow active cohort only; ended relationships excluded |
| Any actor with revoked/ended membership, OSM relationship, grant, or inactive Hospital | Former scope | Continue work/report/export | Deny |
| Platform ADMIN without qualifying Parent OWNER membership | Parent-to-Child report path | Read as Parent OWNER | Deny; use the separate Global ADMIN exact-Hospital policy where eligible |

## 9. Open questions for the customer (resolved 2026-10-17)

All five were answered with the recommendation; see “Customer decisions” (H1–H5). The original questions are kept for traceability.

1. Does “Parent Hospital admin defines it” mean the Parent OWNER may directly change the official `parentHospitalId`, or may they select/request only a Child already attached by the canonical Hospital Master? The current reconciliation treats the master mapping as canonical; allowing direct owner writes would change that source-of-truth contract. **Resolved (จ-1 / H1):** select only Children already attached by the canonical Hospital Master; no direct owner writes.
2. Does RPT-32 accept a per-Child export of the same nine aggregate fields as the current Parent report, or is patient-level service data required? If patient-level data is required, approve exact fields, row grain, time range, recipient/purpose, consent/governance, retention, and audit before implementation. **Resolved (จ-2 / H2):** per-Child export of the same nine aggregate fields; no patient-level data.
3. Must Parent OWNER directly assign staff/OSMs to a Child, or should the Child OWNER remain responsible for creating the direct Child membership/OSM relationship? Direct Parent assignment would be an explicit exception to ADR-0008 and needs a narrowly scoped, audited capability. **Resolved (จ-3 / H3):** the Child OWNER remains responsible; no Parent assignment exception to ADR-0008.
4. For a Patient moving between Child Hospitals, is source-end plus target-create sufficient, or is a two-Hospital transfer/acceptance workflow required? No clinical record copy is recommended without a separate approved data-sharing rule. **Resolved (จ-4 / H4):** source-end plus target-create is sufficient; no transfer workflow or record copy.
5. Does the customer require former-Parent historical reports after a Child is detached/reparented? Current hierarchy and Parent reporting use the current link only; historical Parent attribution would require effective-dated hierarchy history and a separate scope rule. **Resolved (จ-5 / H5):** no former-Parent historical reports; the current link only.

## Current implementation evidence

- `Hospital.parentHospitalId`, the parent/child relations, and Child-specific patient relationships are in [`prisma/schema.prisma`](../../prisma/schema.prisma).
- [`hospital-hierarchy-service.ts`](../../src/modules/hospital-hierarchy/services/hospital-hierarchy-service.ts) resolves a one-level hierarchy and requires an active direct Parent OWNER for the owner hierarchy context. [`hospital-master-reconciliation-service.ts`](../../src/modules/hospital-hierarchy/services/hospital-master-reconciliation-service.ts) compares and applies parent links from canonical master records.
- [`hospital-onboarding-service.ts`](../../src/modules/hospital-onboarding/services/hospital-onboarding-service.ts) looks up the existing Hospital by `hospitalCode`; only Platform ADMIN approval activates the Hospital and creates the first direct OWNER membership.
- [`parent-child-hospital-report-access-service.ts`](../../src/modules/reporting/services/parent-child-hospital-report-access-service.ts), [`hospital-network-child-report-policy.ts`](../../src/modules/reporting/policies/hospital-network-child-report-policy.ts), and [`hospital-report-query-service.ts`](../../src/modules/reporting/services/hospital-report-query-service.ts) revalidate the exact active Parent OWNER/direct Child scope and return only the nine summary values. [`parent-child-hospital-report-workbook-service.ts`](../../src/modules/reporting/services/parent-child-hospital-report-workbook-service.ts) is the RPT-32 export (Phase H).
- [`hospital-report-policy.ts`](../../src/modules/reporting/policies/hospital-report-policy.ts) and [`hospital-report-access-service.ts`](../../src/modules/reporting/services/hospital-report-access-service.ts) bind ก-15 export to an active direct MEMBER relationship and exact Hospital. [`workforce-service.ts`](../../src/modules/workforce/services/workforce-service.ts) records the OWNER grant/revocation audit.
- [`actor-workspace-service.ts`](../../src/modules/auth/services/actor-workspace-service.ts) builds workspaces from the actor's direct Hospital memberships and OSM relationships. [`app/app/workforce/page.tsx`](../../app/app/workforce/page.tsx) validates the selected Hospital against the direct-membership switcher list.
- [`patient-provisioning-policy.ts`](../../src/modules/patient-provisioning/policies/patient-provisioning-policy.ts), [`patient-osm-assignment-transaction.ts`](../../src/modules/patient-assignment/services/patient-osm-assignment-transaction.ts), and [`appointment-line-notification-recipient-service.ts`](../../src/modules/appointments/services/appointment-line-notification-recipient-service.ts) resolve exact Hospital/relationship scope; OSM assignment and notification recipients are relationship-specific.
- [`patient-hospital-relationship-end-service.ts`](../../src/modules/patient-hospital-relationship/services/patient-hospital-relationship-end-service.ts) ends one exact Hospital relationship transactionally, retains history, ends assignments, cancels future appointments without a LINE message, closes open requests, and revokes that Hospital's unclaimed activation.

## References

- [ADR-0002: Role, Capability and Scope Authorization](./0002-role-capability-scope-authorization.md)
- [ADR-0003: Hospital-Led Onboarding](./0003-hospital-led-onboarding.md)
- [ADR-0005: Server-Side Application Boundary](./0005-server-side-application-boundary.md)
- [ADR-0006: Transactional Business Operations](./0006-transactional-business-operations.md)
- [ADR-0008: Workforce Provisioning and First-Time Activation](./0008-workforce-provisioning-and-activation.md)
- [ADR-0011: Patient Import Profile Persistence and Hospital Ownership](./0011-patient-import-profile-persistence.md)
- [BUSINESS_FLOW_GAP_CANONICAL.md](../requirements/BUSINESS_FLOW_GAP_CANONICAL.md): AREA-01–05, STAFF-04/05, OWNER-13, RPT-32, Phase F ก-18
- [REPORTING_ACCESS_CANONICAL.md](../requirements/REPORTING_ACCESS_CANONICAL.md): OR-RPT-01–05, exact-Child summary and reporting gates

## สรุปสำหรับลูกค้า

ข้อตัดสินนี้ (ลูกค้ายืนยัน จ-1..จ-5 เมื่อ 2026-10-17) กำหนดให้ “เขตความรับผิดชอบ” คือ รพ.สต. ลูกข่ายที่เชื่อมกับแม่ข่ายในโครงสร้างโรงพยาบาลปัจจุบัน แม่ข่ายเลือกเขตได้จากลูกข่ายที่ผ่านการตรวจสอบแล้ว ส่วนการเพิ่มโรงพยาบาลและการยืนยันความสัมพันธ์ยังผ่านข้อมูลโรงพยาบาลกลางและผู้ดูแลระบบ

บุคลากรและ อสม. ต้องมีความสัมพันธ์กับ รพ.สต. นั้นโดยตรง จึงจะใช้พื้นที่ทำงานของลูกข่ายได้ แม่ข่ายเห็นและดาวน์โหลดได้เฉพาะรายงานสรุป 9 ค่าแบบไม่ระบุตัวผู้ป่วย (ลูกค้ายืนยัน 2026-10-17) และไม่มีสิทธิ์เปิดรายชื่อหรือแก้ไขข้อมูลผู้ป่วยของลูกข่ายโดยอัตโนมัติ

การนำเข้าผู้ป่วย การมอบหมาย อสม. นัดหมาย และ LINE ยังคงอยู่ในขอบเขตของ รพ.สต. ที่เกี่ยวข้อง การย้ายหรือปิดเขตจะเก็บประวัติเดิมไว้ และไม่เปิดความสัมพันธ์ที่สิ้นสุดแล้วกลับมาเอง
