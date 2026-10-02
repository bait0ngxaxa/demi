# Phase 17F.2B — Family / Caregiver Delegated Appointment Read Contract

วันที่: 2026-10-01

## 1. Historical owner-closeout baseline / current status

Actual starting HEAD: `484c9082603781dc6ead41a54fa0dc0b0c743a42` (`docs(phase-17f2a): make grant lifetime an independent owner decision`); clean working tree. This is a DOCUMENTATION / OWNER-DECISION CLOSEOUT only. Owner approval is the explicit Phase 17F.2B instruction, not an inference from earlier recommendations.

**P17F-L01 / P17F-L02 / P17F-L06 = CLOSED / OWNER APPROVED for this bounded slice only. Phase 17F.2 appointment-read v1 = IMPLEMENTED for synthetic/demo data. Delegated Patient-resource capability = `family-appointment-read-v1` only; operational deployment gate DEFAULT DISABLED. See the [implementation handoff](./PHASE_17F2_DELEGATED_APPOINTMENT_READ_IMPLEMENTATION.md). Future-work wording in the original impact map is historical 17F.2B planning evidence. Real-data delegated deployment/UAT = GOVERNANCE BLOCKED pending external Q5 approval.**

17F.0 and G01..G08 remain CLOSED; 17F.1 remains IMPLEMENTED / CLOSED for relationship-security foundation. Existing ACTIVE User/Person only, no CAREGIVER role, exact pair/source-invitation binding, secure invitation/digest-at-rest, explicit acceptance, 24-hour relationship invitation TTL, no automatic ACTIVE relationship expiry, many-to-many, audited terminal Patient revoke/caregiver withdrawal and management-only opposite-party names remain unchanged. The 24-hour invitation TTL does not define a data-grant lifetime or silently impose a data-grant proposal TTL.

Sources: [decision-pack implementation evidence](./PHASE_17F2_DELEGATED_READ_DECISION_PACK.md), [17F.0](./PHASE_17F0_FAMILY_CAREGIVER_DELEGATED_ACCESS_CONTRACT.md), [17F.1](./PHASE_17F1_FAMILY_CAREGIVER_RELATIONSHIP_SECURITY_FOUNDATION.md), [Context](../CONTEXT.md), [Backlog](./PHASE_17_UAT_BACKLOG.md), [current schema](../../prisma/schema.prisma), [Family policy](../../src/modules/family/policies/caregiver-relationship-policy.ts), [Family lifecycle service](../../src/modules/family/services/caregiver-relationship-service.ts), [Patient SELF query evidence](../../src/modules/patient-self/services/patient-self-care-query-service.ts). Historical 17F.0/17F.1 handoff statements describe those phases, not later decision status.

## 2. Owner-approved Q1–Q17 closeout

All decisions below are explicitly approved; none authorizes broader Family disclosure.

| Decision / gate | OWNER APPROVED first-slice meaning |
| --- | --- |
| Q1 / L01 | Appointment read only (B1); existing management givenName/familyName unchanged. No other Patient resource. |
| Q2 / L01 | Exactly hospitalName, type, scheduledAt, durationMinutes, locationType, status. Nullable source values stay nullable; opaque locators are server/router plumbing only. |
| Q3 / L01 | Rolling serverNow inclusive to serverNow + 90 days exclusive; SCHEDULED/CANCELLED only; no past/COMPLETED/NO_SHOW. Current and newly created/updated eligible records in the SAME accepted PHR may enter the window. Resource behavior, not lifetime. |
| Q4 / L01 | No delegated download/export: no PDF, generated print report, CSV/data/bulk-history export or evidence download. |
| Q5 / L01 + Privacy | Synthetic/demo implementation and UAT allowed now. Real Patient-data delegated disclosure blocked until external responsible controller/privacy approval evidence covers the exact package. No approval/legal basis claimed. |
| Q6 / L02 | Exactly ONE Patient-selected PatientHospitalRelationship per grant; bind exact relationship, Patient, caregiver, PHR and immutable contract/version. No all-Hospitals authority. |
| Q7 / L02 | Future PHR NEVER auto-joins; another PHR requires new explicit grant + caregiver acceptance. |
| Q8 / L02 | Patient may revoke exact PHR grant independently, immediate deny after commit, terminal; parent and other accepted grants unaffected, no caregiver agreement/re-enable. |
| Q9 / L02 | Expansion requires new immutable grant/version + explicit caregiver acceptance. Another Hospital/resource/field, wider history or materially changed future-record semantics cannot silently change old grants; old versions retain meaning forever. |
| Q10 / L02 | Separate purpose-specific immutable Family data grant attached to existing ACTIVE relationship and exact PHR. Patient proposes; exact intended caregiver accepts. family-delegation-v1 remains ZERO-data, no auto-upgrade/generic ACL. |
| Q11 / L06 | Adult voluntary Patient-designated trusted caregiver; relatives and non-relatives permitted. No guardian/minor/incapacity/legal-representative authority. |
| Q12 / L06 | No kinship/relationship-type field required or added, descriptive or authorization-bearing. Authority uses designation + exact account + acceptance + valid grant. |
| Q13 / L06 | No kinship verification/inference from surname/address/contact/Hospital/OSM/demographics; never label verified relative. Product wording: ผู้ดูแลที่คุณอนุญาต. |
| Q14 / L02 | Hospital non-ACTIVE = TEMPORARY DENY, not revoke. Same Hospital ACTIVE again may resume unchanged unrevoked grant if exact same PHR and all authority/eligibility remain valid. No invented PHR lifecycle status; Hospital.status is evidence. |
| Q15 / L02 | Caregiver User exists + ACTIVE + exact Person binding; originating Patient User exists + ACTIVE + PATIENT role + exact identity/profile binding. Temporary ineligibility denies only; same accounts may resume unchanged valid authority. |
| Q16 / Privacy | Transactional durable lifecycle audit: proposed/created, accepted, revoked/scope removed, replacement/expanded grant accepted; future expiry if added. No durable AuditEvent per ordinary successful/denied read in first slice. Existing operational/security logs exclude sensitive Patient payloads. |
| Q17 / L02 | NO independent automatic expiry. Authority requires ACTIVE parent, ACTIVE/unrevoked grant, eligible accounts, exact valid same-Patient PHR, ACTIVE Hospital and eligible requested record. Q3A ongoing rolling feed explicitly approved; 90 days is NOT grant duration. L05 future expiry/renewal/reacceptance/notification only. |

## 3. Gate closeout / implementation clearance

| Gate | Current disposition | Bound |
| --- | --- | --- |
| P17F-L01 | CLOSED / OWNER APPROVED | Appointment-only six-field B1, rolling window, no export; synthetic/demo allowed, real-data Q5 gate retained |
| P17F-L02 | CLOSED / OWNER APPROVED | Exact PHR, separate immutable grant, explicit acceptance, no inherited expansion, current eligibility, terminal revoke, no independent expiry |
| P17F-L06 | CLOSED / OWNER APPROVED | Adult voluntary designated trusted caregiver, relatives/non-relatives; no type/kinship verification |
| P17F-L03 | OPEN | QR only later 17F.3 |
| P17F-L04 | OPEN | Implementation re-audit / delivered-scope UAT closure |
| P17F-L05 | OPEN / FUTURE | Any later automatic expiry, renewal, periodic reacceptance or expiry notification requires its own approved semantics |

Implementation clearance is only for **Family delegated appointment read v1 using synthetic/demo data**. That documentation closeout left runtime unchanged; the subsequent [17F.2 implementation](./PHASE_17F2_DELEGATED_APPOINTMENT_READ_IMPLEMENTATION.md) now delivers this bounded slice behind a default-disabled server gate. Q5 is a real-data deployment/governance gate, not a synthetic implementation blocker.

## 4. Immutable contract / exact disclosed projection

Stable conceptual contract name: **`family-appointment-read-v1`**. It follows the existing purpose-specific `family-delegation-v1` naming style while preserving their different acceptance meanings. No capability constant is added in this task.

| Disclosed Patient-resource field | Persisted source | Purpose |
| --- | --- | --- |
| hospitalName | Granted PHR → Hospital.name | Identify only the selected care organization |
| type | PatientAppointment.type | Broad appointment purpose |
| scheduledAt | PatientAppointment.scheduledAt | Upcoming schedule timing |
| durationMinutes | PatientAppointment.durationMinutes | Time planning; nullable remains null |
| locationType | PatientAppointment.locationType | Broad attendance mode; nullable remains null |
| status | PatientAppointment.status | Distinguish scheduled from cancelled |

Exactly these six fields in list and any detail. Existing `givenName` / `familyName` remain management identity metadata for participant selection, not a new profile permission. Opaque locators and server authorization metadata may be used as plumbing; they are not additional user-visible disclosed fields. Use a separate explicit Prisma projection, not the full SELF selector/DTO. Do not fetch excluded payload merely to strip it later.

Immutable meaning: Appointment read only; exact accepted PHR; rolling upcoming 90-day SCHEDULED/CANCELLED records; no mutations; no export; no independent expiry. Newly deployed code cannot broaden existing accepted contract meaning. Scope/fields/resource/history/material future-record expansion requires new immutable grant/version and caregiver acceptance; preserve old meanings forever.

## 5. Exact scope and proposal / acceptance lifecycle

Each grant binds exactly one existing ACTIVE CaregiverRelationship, its exact Patient/PatientProfile, intended caregiver User/Person, ONE Patient-selected PHR belonging to that same Patient, and the immutable data contract/version. The person-level relationship supplies no Hospital-data authority by itself. Hospital inventory outside accepted scope is denied.

Conceptual lifecycle: ACTIVE parent → Patient explicitly proposes exact PHR + contract → intended caregiver explicitly accepts exact grant → ACTIVE accepted data grant → Patient exact-grant revoke (terminal). Proposed/unaccepted grants authorize no reads. Exact schema, entity names, indexes, pending-proposal transport and concurrency/idempotency mechanics belong to engineering in the next task; they cannot change these owner-approved semantics or introduce an accepted-grant expiry. No generic ACL/delegation platform.

Existing `family-delegation-v1` acceptance remains ZERO Patient-resource capabilities; never auto-activate grants for existing relationships. Future/new PHR and replacement Family relationships require new proposal + acceptance. No grant can reattach to a different parent or PHR.

### Acceptance meaning / required UI disclosure

Patient explicitly proposes sharing this bounded appointment scope. Intended caregiver must explicitly accept that exact data grant. Acceptance is voluntary delegated read authority, not legal consent, guardianship, representation or full medical-record access.

Suggested Thai wording (UI must identify Patient and Hospital, and the six data categories):

> คุณยอมรับสิทธิ์ดูข้อมูลนัดหมายของบุคคลนี้สำหรับหน่วยบริการที่ระบุ โดยเห็นเฉพาะชื่อหน่วยบริการ ประเภทนัด วันและเวลา ระยะเวลา รูปแบบสถานที่ และสถานะนัด สิทธิ์นี้เป็นการดูข้อมูลเท่านั้น ไม่อนุญาตให้แก้ไข ยกเลิก หรือดำเนินการแทนผู้ป่วย คุณจะเห็นนัดที่เข้าเกณฑ์ในช่วง 90 วันข้างหน้าอย่างต่อเนื่อง รวมถึงนัดใหม่ในหน่วยบริการและขอบเขตเดิม สิทธิ์ไม่มีวันหมดอายุอัตโนมัติ แต่ใช้ได้เมื่อความสัมพันธ์และเงื่อนไขสิทธิ์ยังถูกต้อง ผู้ป่วยสามารถยกเลิกสิทธิ์ได้

Use **ผู้ดูแลที่คุณอนุญาต**, never **ญาติที่ผ่านการยืนยัน**. No kinship field, proof or demographic inference. Adult voluntary UAT is a scenario constraint, not runtime legal-age/capacity verification; minors/legal representation remain separately deferred.

## 6. Approved server authorization equation

```text
authenticated current caregiver User
AND caregiver User.status = ACTIVE
AND exact persisted caregiver Person binding
AND ACTIVE CaregiverRelationship
AND exact Patient / PatientProfile match
AND originating Patient User exists AND User.status = ACTIVE
AND originating Patient still has PATIENT role and valid identity/profile binding
AND ACTIVE accepted family-appointment-read-v1 grant
AND grant belongs to exact CaregiverRelationship / Patient / caregiver
AND grant belongs to exact PatientHospitalRelationship
AND that PHR still belongs to exact Patient
AND Hospital.status = ACTIVE
AND requested Appointment belongs to exact granted PHR
AND Appointment.scheduledAt >= serverNow
AND Appointment.scheduledAt < serverNow + 90 days
AND Appointment.status IN {SCHEDULED, CANCELLED}
= ALLOW exact six-field projection
otherwise DENY
```

Recheck current persisted authority on every list/detail/deep-link request; unknown version, missing/foreign/wrong binding or invalid entity fails closed. IDs/URLs never create authority. No SELF ActorContext impersonation; no Hospital membership, OSM assignment or ADMIN fallback. PHR currently has no lifecycle status: do not invent one; exact persisted ownership and Hospital.status are current eligibility evidence.

## 7. Rolling resource window ≠ authority lifetime

Use one request-consistent serverNow. Window is elapsed UTC `90 × 24 hours`, inclusive lower / exclusive upper boundary; display Asia/Bangkok consistently with existing UI conventions. Suggested deterministic order `scheduledAt ASC, id ASC`, bounded pagination max 50 visible rows/page or equivalent established bounded mechanism. Detail rechecks the same predicates; stale links never grant out-of-window/past/foreign access.

SCHEDULED and CANCELLED only; CANCELLED may remain visible while scheduledAt is in the window but must not suggest an appointment to attend. Exclude COMPLETED/NO_SHOW and past records. Eligible current and newly created/updated records in SAME accepted PHR enter the rolling window without new acceptance under this exact contract; future Hospitals never auto-join.

Q3A = rolling record behavior; Q17A = NO independent automatic expiry. Their approved combination is an **ongoing rolling 90-day eligible appointment feed** for the same PHR while authority remains valid. **90 days is NOT grant duration**. No renewal, periodic reacceptance or expiry notification is part of v1. L05 stays OPEN / FUTURE for later addition of those mechanisms; a future expiring version must resolve duration, expiry boundary, renewal/reacceptance and notification/no-notification before implementation.

## 8. Revoke / parent termination / temporary denial

| Event | Effect |
| --- | --- |
| Patient revokes exact data grant / removes that PHR sharing scope | Terminal; immediate authority loss after commit; parent and other separately accepted grants unaffected; no caregiver agreement or re-enable |
| Patient revokes Family relationship | Terminal parent; immediately denies all child grants; old grants cannot attach to replacement relationship |
| Caregiver withdraws from Family relationship | Same parent termination/child denial; replacement lifecycle inherits nothing |
| Hospital temporarily non-ACTIVE | Temporary deny only; same Hospital ACTIVE again may resume unchanged unrevoked grant if SAME PHR, parent, accounts, version and scope remain valid |
| Patient/caregiver temporarily ineligible | Temporary deny only; same accounts becoming eligible may resume unchanged unrevoked authority; not automatic relationship/grant revoke |
| Missing/wrong PHR or binding; new PHR; replacement relationship | Deny; never remap, inherit, enlarge or reactivate revoked grant |

Caregiver must exist with ACTIVE User and exact Person binding; originating Patient must exist with ACTIVE User, PATIENT role and exact Patient identity/profile binding. Restoration adds no fields/Hospital/resource and never resurrects terminal authority. Engineering may choose persistence handling of parent termination, but every child read must immediately deny after parent commit.

## 9. Request/cache/browser/download boundary

No fresh data served on authority checked after committed revoke/withdraw. Queries must couple current authority with exact resource ownership; a stale precheck cannot authorize a later unscoped fetch. Do not cache shared delegated authority/Patient results or statically prerender them; inspect HTML/RSC/transport caching and browser reuse in implementation. Deep links deny foreign/ungranted/out-of-window resources without enumeration.

Previously rendered/in-flight information cannot be technically recalled. A read authorized before revoke commit may already be in flight; no promise that all prior responses disappear. Refresh/clear relevant local views after lifecycle actions and on revisit as appropriate; revalidation never replaces server authorization. No offline persistence feature, export/download, generated print/PDF/CSV report or evidence download; normal browser display only. Browser screenshots/manual copy are outside technical recall guarantees.

## 10. Audit boundary

Durable transactional business audit for grant proposed/created, accepted, revoked/scope removed, replacement/new expanded grant accepted, and expiry only if a future version introduces it. Successful lifecycle mutation and audit commit/rollback together, with exact actor/binding/version evidence and safe concurrency/idempotency. Parent lifecycle audit remains unchanged.

Do NOT add durable AuditEvent for every ordinary successful/denied delegated read in v1. Existing operational/security logging may continue without sensitive Patient payloads, names, tokens, identity/contact/clinical data. A future per-read durable audit requirement needs explicit retention/access terms; technical authorization/audit does not establish legal compliance.

## 11. Privacy / controller deployment gate

**Synthetic/demo implementation and UAT are cleared now; external approval is NOT their implementation blocker. REAL PATIENT delegated-data disclosure is a HARD DEPLOYMENT/UAT GATE.**

Before any real-data environment enables caregiver delegated reads, responsible controller/privacy reviewer must approve and record evidence covering: exact six-field B1 allowlist; exact-PHR scope; adult voluntary trusted-caregiver audience; ongoing rolling 90-day future-record behavior/no-independent-expiry; revocation/current eligibility/previously-rendered limits; relevant notice/governance terms. Identify reviewer, authority, exact coverage and approval evidence. This task supplies no such external approval and invents no legal basis or Thai legal requirement. Appointment facts remain sensitive even without clinical notes.

Q5 gate is separate from L01/L02/L06 requirement closeout. Existing distributed/shared abuse-protection/public-exposure hardening gates remain in force. Phase 17E.2 general consent remains parked; do not implement consent signing as data-grant acceptance.

## 12. Explicit denied / deferred scope

No profile beyond existing management names; National ID/identityKeyHash/security data, HN/hospitalNumber, DOB/derived age, phone/email/address/emergency contact, gender/occupation/education/classification; Hospital inventory outside accepted scope; locationDetail, staff names/profession, OSM identity/snapshot, creator/internal IDs as display, audit metadata, contact data, notes/free text, acknowledgement/cancellation-request history/actions.

No create/edit/reschedule/cancel/attendance/complete/no-show/operator coordination actions, PatientServiceRequest, Screening, Baseline, Program, Service 1, Follow-up, Final Assessment, Goal Plan/Health Plan, measurements, evidence/artifacts, medication (17G), Wellness, consent signing, export/download, QR (17F.3), new caregiver account onboarding, kinship model, minors/guardian/legal representative/incapacity/power of attorney, Patient impersonation or generic delegation framework. Default deny applies to anything not expressly approved.

## 13. Implementation impact map (next task only)

| Area | Required future work | Level |
| --- | --- | --- |
| Prisma/persistence + migration | Separate immutable exact-PHR grant, pair/same-Patient constraints, version/acceptance/terminal evidence; preserve published migrations | Definitely; exact schema is engineering decision |
| Family policy | Purpose-specific recognized contract/current identity/parent/grant/ownership/Hospital/time/status predicates | Definitely |
| Appointment query/projection | Separate six-field selector/DTO, scoped list/detail, stable bounded pagination; no full SELF DTO | Definitely |
| Services / routes / UI | Patient own-PHR proposal/revoke, intended caregiver acceptance/read, scoped context, safe empty/denied/revoked states and explicit disclosure | Definitely; route layout/transport engineering choice |
| Audit / concurrency | Transactional lifecycle evidence, idempotency and accept/revoke/parent-change race boundaries | Definitely; no per-read durable audit |
| Cache / tests / UAT | Current auth every request, no stale-authority serving; focused policy/query/UI/PostgreSQL checks and L04 re-audit scenarios | Definitely for implementation; none run in docs closeout |
| Hospital/account transition integration | Current eligibility predicate sufficient conceptually; any hooks only if implementation correctness requires them | Conditional engineering choice, no terminal invalidation on suspension |
| Expiry/renewal, QR, other resources | New owner-approved semantics / future gates | NOT part of v1 |

## 14. Phase 17F.2 implementation acceptance criteria

1. Existing ACTIVE Family relationship required.
2. Existing family-delegation-v1 relationship acceptance alone grants ZERO Patient-resource reads.
3. Separate purpose-specific data grant required; no auto-migration into sharing.
4. Patient may propose only for own exact PHR.
5. Exact intended caregiver explicit data-grant acceptance required.
6. Enforce grant exact Patient/caregiver/parent pair binding.
7. Enforce exact PHR / same-Patient binding.
8. Future PHR never auto-joins.
9. Only accepted family-appointment-read-v1 authorizes this read.
10. Unknown contract version fails closed.
11. Six-field explicit Prisma disclosure projection only; authorization fields/opaque locators remain server plumbing, never extra disclosed data.
12. Do not reuse full Patient SELF appointment DTO.
13. No locationDetail.
14. No staff/OSM identities or snapshots.
15. No acknowledgement/cancellation-request interaction state.
16. No Patient-resource mutation or acting for Patient.
17. Rolling 90-day filter uses server time; lower boundary inclusive, upper exclusive.
18. SCHEDULED/CANCELLED only.
19. No past rows; no COMPLETED/NO_SHOW.
20. Foreign/ungranted/out-of-window appointment detail denies without confirming existence.
21. Hospital must currently be ACTIVE.
22. Same Hospital reactivation may resume unchanged valid grant only.
23. Originating Patient User remains ACTIVE + PATIENT with exact identity/profile binding.
24. Caregiver User remains ACTIVE with exact persisted Person binding.
25. Temporary account ineligibility denies, does not terminally revoke.
26. Grant revoke immediately denies after commit.
27. Parent Patient revoke/caregiver withdrawal immediately denies all child authority.
28. Terminal revoked grant never reactivates.
29. New/replacement Family relationship never inherits old grants.
30. Expansion requires new immutable grant/version + explicit acceptance; published meanings never mutate.
31. No independent automatic grant expiry, renewal or periodic reacceptance.
32. No delegated download/export/generated print report.
33. Lifecycle transitions and successful-change audit commit/rollback atomically, with safe idempotency/concurrency handling.
34. No durable per-read AuditEvent required for ordinary success/denial in first slice.
35. No real-data delegated UAT/deployment until documented external Q5 approval.
36. No QR (17F.3 / L03 remains separate).
37. No CAREGIVER top-level role.
38. No Patient SELF ActorContext impersonation or ADMIN/Hospital/OSM fallback.
39. No kinship verification/type field or kinship authorization.
40. No non-appointment Patient-resource capability.

Additionally verify boundary timestamps, exact null preservation, deterministic max-50 bounded paging (or equivalent established bounded mechanism), server/cache revocation ordering and cross-Patient/Hospital enumeration resistance. No future Hospital inheritance. Real-data Q5 evidence must be reviewed before any real-data delegated use; synthetic UAT may proceed independently.

## 15. ADR assessment

**NO new ADR required** for approved bounded slice. [ADR-0001](../adr/0001-person-and-user-identity.md) identity stays unchanged; [ADR-0002](../adr/0002-role-capability-scope-authorization.md) already supports capability + exact resource scope; [ADR-0005](../adr/0005-server-side-application-boundary.md) server policy boundary and [ADR-0006](../adr/0006-transactional-business-operations.md) lifecycle transaction/audit remain intact. Separate grant persistence alone does not require ADR. No new core role, impersonation, inherited cross-Hospital authority, legal-representative identity or generic ACL system. No architectural conflict found; no ADR created.

## 16. Remaining gates / handoff and validation

17F.2 appointment-read v1 **IMPLEMENTED**, bounded synthetic/demo only; delegated capability **`family-appointment-read-v1` only**, server deployment gate **DEFAULT DISABLED**. L03 QR OPEN / 17F.3; L04 re-audit/UAT closure OPEN / 17F.4; L05 OPEN / FUTURE automatic expiry/renewal expansion. Medication 17G, minors/legal representation deferred, Phase 17E.2 parked; other care/Health Plan/notification/Wellness decisions untouched. Real-data delegated deployment/UAT remains externally governance-blocked.

Closeout validation passed: complete diff/path review confirms six intended documentation files only; Q1–Q17 match in both closeout tables, six approved fields and 40 criteria verified; 251 local Markdown links resolve; strict UTF-8/no replacement characters and no BOM, existing line-ending styles preserved; historical analysis, all 13 select snapshots and original 17A discovery unchanged; gate/status assertions and `git diff --check` passed. No runtime/schema/migration edits, no tests/integration/build/dev server/Prisma commands. Commit only intended documentation after review.
