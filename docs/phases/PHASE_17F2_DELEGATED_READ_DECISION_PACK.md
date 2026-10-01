# Phase 17F.2A — Family / Caregiver Delegated Read Decision Pack

วันที่: 2026-10-01

สถานะ: **DECISION PENDING / NOT IMPLEMENTED**

**P17F-L01 = OPEN; P17F-L02 = OPEN; P17F-L06 = OPEN**

ข้อเสนอทั้งหมดในเอกสารนี้: **PROPOSED / RECOMMENDED — NOT OWNER APPROVED — DO NOT IMPLEMENT YET**

## 1. Baseline และขอบเขตงาน

ตรวจ actual HEAD `24f4a2b4d79dd2bc0bc3a92c7ad8c69d816b4540` (`fix(phase-17f1): bind relationship source pairs and identify management participants`) ตรงกับ expected baseline; working tree สะอาดก่อนเริ่ม ไม่มี reset/revert/commit หรือแก้ runtime/schema ในงานนี้

นี่คือ requirement analysis, authorization/privacy review และ owner decision pack เท่านั้น Phase 17F.0 CLOSED / G01..G08 CLOSED; Phase 17F.1 IMPLEMENTED / CLOSED สำหรับ relationship-security foundation เท่านั้น **current Patient-resource delegated capability allowlist = EMPTY** ไม่มี decision ใดใน L01/L02/L06 ถูกปิดโดยเอกสารนี้

ลำดับหลักฐาน: [AGENTS.md](../../AGENTS.md) → requirements/accepted invariants และ ADR → implementation ปัจจุบันสำหรับข้อเท็จจริง runtime → customer-flow สำหรับเจตนา UX → recommendation ซึ่งยังไม่อนุมัติ อ่านและเทียบ [Context](../CONTEXT.md), [17A](./PHASE_17A_CUSTOMER_FLOW_CANONICALIZATION_UAT_CONTRACT.md), [17F.0](./PHASE_17F0_FAMILY_CAREGIVER_DELEGATED_ACCESS_CONTRACT.md), [17F.1](./PHASE_17F1_FAMILY_CAREGIVER_RELATIONSHIP_SECURITY_FOUNDATION.md), [Backlog](./PHASE_17_UAT_BACKLOG.md), [Architecture baseline](../architecture/DEMI_ARCHITECTURE_BASELINE.md) และ [17C](./PHASE_17C_PATIENT_CARE_JOURNEY_APPOINTMENT_READ.md)/[17D.1](./PHASE_17D1_APPOINTMENT_INTERACTION_IMPLEMENTATION.md)

17A/17F.0 บางข้อความเป็นประวัติ ณ เวลาก่อน implementation; ใช้ 17F.1/current HEAD ยืนยัน foundation ปัจจุบัน ไม่ย้อนแก้ประวัติ ข้อมูลนัดหมายใน 17C ที่เคยไม่แสดงผู้รับผิดชอบถูกขยายใน 17D.1 สำหรับ SELF เท่านั้น ไม่ใช่ caregiver approval

## 2. Current 17F.1 security foundation

[Schema](../../prisma/schema.prisma), [Family service](../../src/modules/family/services/caregiver-relationship-service.ts), [Family policy](../../src/modules/family/policies/caregiver-relationship-policy.ts), [management query](../../src/modules/family/services/caregiver-relationship-query-service.ts) ยืนยัน:

- CaregiverInvitation/CaregiverRelationship ผูก exact Patient/caregiver pair; source-pair FK ตรวจ equality ส่วน ACCEPTED source status เป็น service transaction invariant
- Patient SELF เชิญ existing ACTIVE User/Person ผ่าน server-side canonical/hash National-ID lookup; exact authenticated recipient เท่านั้นที่ accept/reject ได้ ไม่สร้าง account/role
- opaque 256-bit invitation, digest-at-rest, 24-hour DB-clock expiry; explicit accept บันทึก `family-delegation-v1` ซึ่งให้ ZERO Patient-resource capabilities
- pending reject/revoke แยกจาก ACTIVE Patient revoke/caregiver own withdrawal; terminal relationship ไม่กลับ ACTIVE ต้อง invite/accept lifecycle ใหม่
- many-to-many exact pair, conditional writes/Serializable transaction และ transactional audit; ACTIVE relationship ไม่มี auto-expiry/renewal
- management แสดง opposite-party `givenName`, `familyName` (nullable) กับ invitation/relationship lifecycle และ opaque locators เท่านั้น ไม่เปิด Patient-resource data
- inactive caregiver account ถูก deny โดยไม่เปลี่ยน relationship; account กลับ ACTIVE ขณะ relationship ยัง ACTIVE ใช้ foundation management ได้อีก ไม่ใช่ data-sharing acceptance

## 3. Customer-flow evidence และข้อจำกัด

17A/17F.0 บันทึกแนวคิด “ครอบครัวของฉัน”, “ผู้ที่คุณดูแล”, “ผู้ที่ดูแลคุณ”, member selection และ navigation ไปข้อมูลสุขภาพ/การดูแล แผนสุขภาพ นัดหมาย ยา งานนี้ไม่มี whiteboard ภาพใหม่ให้ตรวจ จึงใช้ข้อความในสัญญาและ governing request เป็น UX evidence เท่านั้น

หลักฐานนี้ไม่กำหนด fields, ทุก Hospital, history, future records, clinical notes, contact, mutation, consent, kinship, legal representation หรือ cross-Hospital authority ยาเป็น Phase 17G และไม่เป็น candidate ของ 17F.2 ชื่อสมาชิกและหนึ่งเส้นทางอ่านที่ใช้งานได้สามารถสาธิต Family journey บางส่วนได้ โดยไม่อ้างว่าส่งมอบทุก customer domain แล้ว

## 4. Implementation evidence inventory

| Evidence | Path/function ที่ตรวจจริง | Policy / query / route / UI / test chain |
| --- | --- | --- |
| S1 SELF context | [self query](../../src/modules/patient-self/services/patient-self-query-service.ts): `resolveOwnPatientContext`, `resolveOwnPatientRelationshipContext`, `listOwnPatientRelationshipNavigation` | [SELF policy](../../src/modules/patient-self/policies/patient-self-policy.ts) → Person scoped query → [page context](../../src/modules/patient-self/transport/patient-self-page-context.ts) → [profile route](../../app/app/personal/profile/page.tsx), [profile view](../../app/app/personal/patient-self-profile-view.tsx), [relationship list](../../app/app/personal/patient-self-relationship-list.tsx) → [query tests](../../src/modules/patient-self/services/patient-self-query-service.test.ts), [policy tests](../../src/modules/patient-self/policies/patient-self-policy.test.ts), [page tests](../../app/app/personal/personal-pages.test.ts) |
| S2 Hospital-local profile | [profile service](../../src/modules/patient-hospital-profile/services/patient-hospital-profile-service.ts): `getOwnPatientHospitalProfile`, `patientHospitalProfileSelect`, `ownRelationshipWhere` | Read ใช้ inline PATIENT/identity guard + persisted ACTIVE own User ไม่ใช่ update policy; [values/fallback](../../src/modules/patient-hospital-profile/domain/patient-hospital-profile-values.ts) → [exact profile route](../../app/app/personal/profile/[relationshipId]/page.tsx) → [editor](../../app/app/personal/profile/[relationshipId]/profile-editor.tsx) → [service tests](../../src/modules/patient-hospital-profile/services/patient-hospital-profile-service.test.ts) |
| S3 Care journey | [care query](../../src/modules/patient-self/services/patient-self-care-query-service.ts): `getOwnPatientCareJourney` | SELF capability checks + S1 exact relationship → explicit selects → [care page context](../../src/modules/patient-self/transport/patient-self-care-page-context.ts) → [care route](../../app/app/personal/care/[relationshipId]/page.tsx) → [journey view](../../app/app/personal/patient-self-care-journey-view.tsx) |
| S4 Program / Service 1 / Final | care query: `getOwnPatientProgramDetail` | exact relationship + `id` → Program detail select, children scoped by both relationship and Program → [Program route](../../app/app/personal/care/[relationshipId]/programs/[programId]/page.tsx) → [Program view](../../app/app/personal/patient-self-program-detail-view.tsx) |
| S5 Goal / Follow-up | care query: `getOwnPatientGoalPlanDetail`, `getOwnPatientFollowupDetail` | SELF + exact relationship/resource; [template resolver](../../src/modules/goals/domain/goal-templates/index.ts) with persisted key/version → [Goal route](../../app/app/personal/care/[relationshipId]/goal-plans/[goalPlanId]/page.tsx), [Follow-up route](../../app/app/personal/care/[relationshipId]/followups/[followupId]/page.tsx) → [detail views](../../app/app/personal/patient-self-record-detail-views.tsx) |
| S6 Appointments | care query: `getOwnPatientAppointmentHistory`, `getOwnPatientAppointmentDetail`, `appointmentPatientSelect`, `toAppointmentItem` | SELF + exact relationship; detail `id` AND relationship → [list route](../../app/app/personal/appointments/[relationshipId]/page.tsx), [detail route](../../app/app/personal/appointments/[relationshipId]/[appointmentId]/page.tsx) → detail views + [SELF interaction controls](../../app/app/personal/appointments/patient-appointment-interaction-controls.tsx), which MUST NOT be reused as caregiver actions |
| S3–S6 tests | [care query tests](../../src/modules/patient-self/services/patient-self-care-query-service.test.ts), [view tests](../../app/app/personal/patient-self-care-views.test.tsx) | Assert bounded selects/DTO, foreign relationship/resource denial, 50-row pagination, round 7+, template failure, excluded clinical/contact fields, exact-Hospital profession and factual UI; inspected, not executed in this documentation task |
| S7 Family | [query tests](../../src/modules/family/services/caregiver-relationship-query-service.test.ts), [Family integration](../../tests/integration/family-caregiver-relationship.integration.test.ts) | Current management-only select/lifecycle and exact pair evidence; exact integration path verified against repository inventory |

S1 `ownPatientWhere`: Person.id = actor.personId AND User.id = actor.userId AND persisted User.status ACTIVE AND persisted PATIENT role. SELF policy accepts only current `patient:read`, `screening:read`, `program:read`, `goal:read`, `followup:read`, `appointment:read`; actual constants remain in their domain policies. Care functions independently resolve exact relationship and detail ID; they do not implement delegation.

PatientHospitalRelationship has **no lifecycle status column**. S1/S3–S6 SELF reads do not require Hospital ACTIVE: tests intentionally include SUSPENDED/PENDING_VERIFICATION Hospital. A stricter delegated Hospital eligibility rule would be a new owner decision, not a statement of existing SELF behavior. Program children retain canonical relationship/Program ownership; names/profile/classification are not all Hospital-local.

Appendix A records the exact current Prisma selects, including ordering/limits inside nested selections. Those are evidence, never a delegated allowlist.

## 5. P17F-L01 resource matrix

| Candidate capability meaning (conceptual, no constants added) | Source / SELF policy / service / select | Exact current SELF output | Ownership and history | Sensitivity / UX necessity / narrower option | Proposed caregiver allowlist / exclusions / recommendation |
| --- | --- | --- | --- | --- | --- |
| A Basic Patient context | Person/PatientProfile/PHR/Hospital; `patient:read + SELF`; S1 and appendix A1. S2 separate inline SELF read, appendix A2 | S1 `person.{givenName,familyName}`, relationships `relationshipId,hospitalCode,hospitalName,hospitalNumber,hospitalStatus`; S2 `relationshipId,hospitalName,person.{givenName,familyName},profile.{gender,phoneNumber,addressText,emergencyContactName,emergencyContactPhone,occupation,educationLevel},source,version` | Names person-wide; legacy profile Patient-wide; local profile/HN exact PHR; current snapshot only | Names necessary for choosing recipient; profile/contact not needed to read appointments. Hospital association itself is sensitive context. Narrow names already exist in management | Reuse existing names only; no new profile capability. Appointment context only selected `hospitalName`. DENY additional basic/profile fields in first slice |
| B Appointment schedule read | PatientAppointment/PHR/Hospital; `appointment:read + SELF`; S6 / appendix A3 | `appointmentId,type,scheduledAt,durationMinutes,locationType,locationDetail,status,updatedAt,responsibleDisplayName,responsibleProfession,osmAtCreationDisplayName,acknowledgement.{source,acknowledgedAt},cancellationRequests[].{source,status,submittedAt}` plus S1 relationship and pagination | Exact PHR; current SELF all past/future row states, descending scheduledAt/id, 50/page (fetch 51); detail one exact row; no full status-event history | Health-service schedule is Patient-resource data. Upcoming timing/Hospital/type/status useful; detail/people/free text can be narrowed | INCLUDE proposed B1: `hospitalName,type,scheduledAt,durationMinutes,locationType,status` only, same list/detail; appendix-derived locators only for links, never display identifiers. Deny locationDetail/people/interactions/notes/audit/contact/HN |
| C Selected care-status summary | ScreeningAssessment/PatientBaseline/PatientProgram/Service 1/PatientFollowup/PatientFinalAssessment; S3/S4/S5; appendix A4–A9 | Exact output listed in section 8; not whole records | All care sources exact PHR; Service 1/Final exact Program; Goal/Follow-up may have nullable Program; 50/page histories, Baseline single current row, Final under Program | Persisted workflow facts can be summarized but still reveal care participation; measurements highly sensitive. Not necessary for appointment-first UX | DEFER entire C for first slice. Viable separately approved C1 = latest Screening `submittedAt,status:RECORDED` and latest Program `status,startedAt,completedAt`, selected Hospital name only; all raw measurements/Service 1/Goal/Follow-up/Final details excluded |
| D Goal Plan read | PatientGoalPlan/PatientGoalItem, persisted template key/version + canonical labels, optional Program; `goal:read + SELF`; S5 / appendix A7/A8 | `goalPlanId,roundNumber,createdAt,primaryGoalLabel,program.{status,startedAt,completedAt},primaryGoalNote,weeklyNote,items[].{activityLabel,targetDays,targetValue,targetUnit}` plus S1 relationship | Exact PHR, optional Program; history 50/page descending createdAt/id; one exact detail; no goal-state/effective-date field in this projection | Targets/labels express health goals; notes can contain clinical/third-party content. PAT-05 Health Plan meaning OPEN; CARE-02 prototype semantics OPEN | DEFER first slice. If later approved as “แผนเป้าหมาย” only: explicit `roundNumber,createdAt,primaryGoalLabel,items[].{activityLabel,targetDays,targetValue,targetUnit}`, no notes/author/Program join; would need its own history/contract decision |

`C1`/narrow D are viable choices for review, **not** part of the recommended package and not approved disclosure. Default deny applies to unlisted fields too.

หากเลือก C1 ต้องตัดสินแยกจาก Q3 ของนัดหมาย: proposed history คือ latest one Screening และ latest one Program ต่อ exact granted PHR ณ request (รวม record ที่มีอยู่ก่อน accept; ไม่ให้ browse older history) และต้องอนุมัติว่าจะเปลี่ยนไปเห็น latest record ที่ถูกบันทึกภายหลังใน PHR เดิมหรือ snapshot exact records ณ acceptance. หากเลือก narrow D ต้องระบุ latest-only vs exact accepted Goal Plan vs bounded historical rounds และ future-plan behavior ด้วย การเลือกกลุ่มอย่างเดียวไม่พอปิด L01/L02; ไม่มี policy ของ C/D ถูกเลือกแทน owner ในงานนี้

## 6. Basic profile / identity field analysis

| Current field | Current actual SELF exposure / source | Classification and necessity | First-slice recommendation |
| --- | --- | --- | --- |
| givenName / familyName | S1/S2 Person; already Family management | Management identity metadata; distinguish selected participant | Existing management names only, no new profile route/capability |
| gender | S2 local profile or whole legacy fallback; nullable string | Personal/free-text profile; not needed for schedule | DENY |
| dateOfBirth (DOB) | PatientProfile; S1/S2 do not select | Identity/sensitive age context; no need, no derived age/adult proof | DENY |
| phoneNumber | S2 profile | Contact; not needed, does not verify delegation | DENY |
| addressText | S2 profile | Sensitive free text/location, could include third parties | DENY |
| occupation / educationLevel | S2 profile | Personal/free text; not needed | DENY |
| classification | PatientClassification/History on PatientProfile; S1/S2 not select | RISK/DIABETES classification is not diagnosis; no schedule need | DENY |
| Hospital-local profile / source / version | S2 seven profile fields; `HOSPITAL_LOCAL` or `LEGACY_FALLBACK` / optimistic version | Hospital-local content; source/version internal editing context | DENY all; do not pass through S2 DTO |
| hospitalNumber (HN) | PHR selected/returned in S1 care/appointment context | Hospital-local identifier; not necessary to distinguish Family member | DENY |
| emergencyContactName / Phone | S2 local or legacy | Third-party personal data; emergency contact is not caregiver proof | DENY |
| National ID / identityKeyHash | National ID transient canonical input; Person hash not SELF output | Identity/security locator; no delegated UX purpose | DENY |
| email/auth subject/credentials/memberships/internal IDs | Not SELF identity output | Security/contact/organizational data; no delegated need | DENY disclosure; allow only minimal opaque route locator if necessary after separate authorization |

S2 fallback is whole-profile: when local row exists, cleared local fields remain null; no individual fallback. Neither existing Patient edit approval nor fallback authorizes Family disclosure. Minimal identity context is sufficient; no need to manufacture a profile page.

## 7. Appointment field-by-field review

| Field / feature | Current SELF behavior | Classification for caregiver UX | First proposed B1 |
| --- | --- | --- | --- |
| Upcoming list | No separate upcoming query currently; SELF history includes every time/state | Necessary schedule use case but new bounded filter required | Include upcoming only as section 15; not reuse history unfiltered |
| Detail | Exact appointment+relationship, same DTO as list plus context | Optional navigation convenience | Include only same B1 allowlist; no extra detail disclosure |
| Historical appointments | All older pages accessible SELF | Sensitive/unnecessary for first scheduling demonstration | DENY past rows, no older-history path |
| hospitalName | Relationship.Hospital.name | Necessary: know exact care organization | Include only approved selected scope; no all-Hospital listing |
| hospitalCode / hospitalStatus / HN | In SELF context | Unnecessary display/internal eligibility/Hospital-local identifier | Exclude display; status used server-side only |
| scheduledAt | PatientAppointment timestamp | Necessary timing | Include, display existing Thai/Bangkok convention |
| type | FOLLOW_UP / CONSULTATION | Necessary purpose label; still health data | Include exact persisted type, no inferred specialty/diagnosis |
| durationMinutes | Nullable current fact | Optional in general, useful for planning attendance time | Include nullable, no invented default |
| locationType | CLINIC / ONLINE / HOME_VISIT / OTHER, nullable | Necessary broad mode for organizing help | Include; null stays unspecified |
| locationDetail | Nullable free-text field | Sensitive/unnecessary: may contain home address, access URL, phone or clinical context; not guaranteed sanitized by SELF select | DENY. First UX must state precise venue/link is not shared; otherwise owner must separately approve structured safe location before implementation |
| responsibleDisplayName / responsibleProfession | Person names and first exact-Hospital membership profession; historical COORDINATOR/OTHER/null shown truthfully, not relabelled doctor | Optional third-party information, not required for minimal schedule | DEFER; no User/membership join |
| osmAtCreationDisplayName | Historical snapshot relation names or null, no backfill | Sensitive/unnecessary third-party identity; not current authority | DENY first slice |
| status | Current SCHEDULED/COMPLETED/CANCELLED/NO_SHOW | Necessary to avoid presenting cancelled schedule as active | Include only eligible SCHEDULED/CANCELLED rows within window; not attendance interpretation |
| acknowledgement.{source,acknowledgedAt} | Latest selected acknowledgement only if sourceAppointmentUpdatedAt equals appointment.updatedAt | Optional receipt fact, not attendance; reveals Patient/OSM interaction | DEFER whole object |
| cancellationRequests[].{source,status,submittedAt} | Latest five, descending submittedAt/id | Optional request fact; pending request does not cancel canonical status | DEFER; show only canonical status, never imply pending means cancelled |
| appointmentId / relationshipId | UUID link locators | Necessary only to locate exact resource; no authority in ID | Minimal opaque locators only for link plumbing, no IDs as user-facing data; never creator/Patient/actor IDs |
| updatedAt / sourceAppointmentUpdatedAt | SELF DTO version and acknowledgement matching select | Internal version/coordination context | DENY output; query may use current version internally if needed |
| creator/responsible/assignment IDs, note, contact, resolver, coordination/audit | Excluded from SELF select/DTO; richer Work domain exists separately | Must remain denied | DENY; no operator DTO reuse |

Every appointment field not expressly in B1 remains denied. **READ ONLY**: no acknowledgement, cancellation request, reschedule, create/edit/cancel, attendance confirmation, operator coordination or PatientServiceRequest mutation. Existing SELF actions are separate authoritative capabilities and cannot be copied into Family controls.

## 8. Care journey exact facts, history and sensitivity

All rows below use care query/SELF policy/S1 exact ownership; selectors are copied in Appendix A. `relationship` in every SELF output is S1's five navigation fields, including HN; a future delegated query must replace that context too.

| Source / select | Current SELF returned fields | History / ownership | Sensitivity / possible narrow summary / first decision |
| --- | --- | --- | --- |
| ScreeningAssessment / screeningPatientSelect | `screenings[].{submittedAt,status:RECORDED}`; status is neutral derived existence label | 50/page, submittedAt/id desc, exact PHR | Existence/date already reveals screening participation; no responses/results/PAM/PROM. C1 could share only latest event; DEFER first slice |
| PatientBaseline / baselinePatientSelect | `baseline.{recordedOn,measurements.{weight,heightCm,waistCircumference,systolicBloodPressure,diastolicBloodPressure,bloodSugarDtx,hba1c}}` or null; BP renamed from bloodPressureSystolic/Diastolic | One current Baseline per PHR, no baseline revision history through SELF | Raw measurements sensitive; DTX has confirmed mg/dL context, not permission for Family. Optional existence/date summary possible; DEFER all Baseline |
| PatientProgram / programHistorySelect | `programs[].{programId,status,startedAt,completedAt}` | 50/page startedAt/id desc, exact PHR; ACTIVE/COMPLETED workflow state | C1 latest Program lifecycle is factual, not health success/recovery; DEFER first slice |
| Program detail / programDetailSelect | Above + `serviceOne[].{label,recordedAt}`, `goalPlans`, `followups`, `historyPages`, `finalAssessment` | Exact Program+PHR; child Goal/Follow-up additionally filtered both IDs | Do not expose whole detail to share workflow summary |
| Service 1 Routine/FloatingChart/DreamCard/Confidence | Fixed labels Routine/Floating Chart/Dream Card/Confidence and each persisted `recordedAt` or null | Each child belongs exact Program; no scores/text/artifact selected | “Recorded” only; not validated empowerment outcome; CARE-02 remains OPEN. DEFER |
| PatientGoalPlan history / goalPlanHistorySelect | `goalPlanId,roundNumber,createdAt,primaryGoalLabel,program.{status,startedAt,completedAt}` | 50/page createdAt/id desc, exact PHR; nullable linked Program | Label resolved by exact persisted template; still health goals. DEFER |
| PatientFollowup history / followupHistorySelect | `followupId,roundNumber,recordedAt,program.{status,startedAt,completedAt}` | 50/page recordedAt/id desc; round 7+ allowed, exact PHR | Date/round fact can be summarized separately; no first need; DEFER |
| PatientFollowup detail / followupDetailSelect | History + `measurements.{weight,waistCircumference,systolicBloodPressure,diastolicBloodPressure}`, `activityProgress[].{activityLabel,status}` | One exact row; sourceGoalPlan template joins labels, no six-round cap | Raw values/progress sensitive; bloodSugar unit unresolved and omitted; notes/confidence/reflection/plans omitted. DEFER |
| PatientFinalAssessment under Program | `recordedAt,measurements.{weight,waistCircumference,systolicBloodPressure,diastolicBloodPressure}` or null | One current Final child in exact Program detail; no independent SELF full-final export | Raw clinical facts; bloodSugar withheld. No derived before/after, control, diagnosis or recommendation. DEFER |
| PatientEvidenceArtifact / Service 1 artifact association | No SELF select, DTO, download route in this canonical path | Canonical PHR/Program associations remain authoritative | Uploaded files/content/metadata may reveal identity/third parties; DENY first delegated slice |

SELF history uses `take:51`, returns 50, offset pages with `page,hasMore`; this is per-request bounded, not a lifetime-history cap. Records inserted between pages may shift boundaries. Do not misstate “50” as approval to disclose latest 50 to caregivers. Clinical notes omitted from most SELF views remain omitted; Goal notes are the exception below.

## 9. Goal Plan versus unresolved Health Plan

S5 selects persisted `primaryGoalCode,templateKey,templateVersion` and resolves `primaryGoalLabel`; items select `activityCode,targetDays,targetValue,targetUnit`, sorted sortOrder/id and resolve activityLabel. Missing historical template/goal/activity fails safely, no invented labels. SELF detail actually returns `primaryGoalNote` and `weeklyNote`: both free text, therefore **not** safe to copy into delegated output.

| Existing candidate field | Assessment | First-slice disposition |
| --- | --- | --- |
| primaryGoalLabel / activityLabel | Historical prototype template text; factual selected goal/activity, may imply clinical purpose | DEFER |
| roundNumber / createdAt | Factual round/record time, not an effective prescription date | DEFER |
| targetDays / targetValue / targetUnit | Persisted planned targets, not actual adherence or completed exercise | DEFER; if later approved, display exact units/nulls, no invented target |
| primaryGoalNote / weeklyNote | Sensitive free text, may include clinical/third-party details | DENY first slice |
| program.status / startedAt / completedAt | Program context, **not Goal state** | DEFER; not silently add to narrow Goal projection |
| goal state / effective date / author / creator / clinical notes | No such output fields in current SELF projection; `createdByUserId`/`createdByUser` exist in model but not SELF output; selected Goal notes assessed separately above | Do not invent or join; DENY first slice |

PAT-05 still requires deciding Health Plan = existing Goal Plan vs clinician plan vs another summary. CARE-02 and PAT-03 meanings remain OPEN. A separately labelled bounded “แผนเป้าหมาย” could technically serve a prototype subflow after explicit product/clinical review; it cannot truthfully be presented as final “แผนสุขภาพ” from current evidence. Deferral avoids implying that unresolved product/clinical model is final.

## 10. P17F-L02 scope alternatives

The authoritative Family relationship is person-level; it grants no PHR by itself. Every data record keeps canonical PHR (and Program where applicable) ownership. Options require a separate accepted field/capability contract.

| Factor | A Exact current PHR selection | B All current PHRs | C Person-wide relationship + per-request discovery |
| --- | --- | --- | --- |
| Least privilege / cross-Hospital privacy | Patient chooses exact scope; strongest minimization | Broad disclosure across selected acceptance-time inventory, even sensitive Hospital participation | Discovery alone is insufficient authorization; only explicitly granted resources can be returned |
| UX | One explicit Hospital selection per grant for bounded UAT; more selections add effort | Easy one choice, harder informed disclosure; must show complete inventory before accept | Convenient server filtering, but can hide scope and acceptance meaning |
| Persistence | Purpose-specific grant to exact PHR + contract version/evidence | Snapshot exact PHR IDs at acceptance; a live “all” predicate would auto-widen and is not recommended | Still needs persisted approved semantics/IDs/resource/time boundary; no schema-free bypass |
| Future Hospitals | Never auto-join | Acceptance-time snapshot excludes later PHRs; automatic future inclusion is a distinct high-risk option | Never infer new scope from discovery; explicit new grant required |
| History / future same-Hospital resources | Exact accepted resource/time selector, not all history | Same explicit per-resource selector needed for every snapshotted PHR | Discovery must apply grant's history/time selector to every record |
| Shrink/revoke | Revoke exact grant; other scopes independent | Revoke/remove one scope needs explicit durable exclusion or immutable replacement; not silently re-evaluate all | Remove grant eligibility, not merely hide UI |
| Expansion | New scope/field contract and exact acceptance | Adding PHR to snapshot/new capabilities needs new acceptance, never live widening | A newly discovered resource type does not inherit rights |
| Acceptance / audit | Exact Patient/caregiver, PHR, fields, window/future rule, version | Complete snapshot inventory and terms; audit larger disclosure | Human-readable exact scope must match persisted acceptance, not opaque “discovery” wording |
| Concurrent changes | Recheck scope at issue/accept/read; conditional writes | Snapshot must be consistent, newly added PHR cannot slip in | Same current-state checks; discovery cannot race past revoke |
| Stale cache | Current active grant+pair on every read, no authority cache | Cached snapshot still needs current validity/revocation check | Discovery result cannot be reused as authority |

**RECOMMENDATION — NOT OWNER APPROVED: A**, with one purpose-specific grant per exact PHR for the single approved appointment projection. Multiple Hospitals can have separate explicitly accepted grants later without granting Hospital hierarchy/membership authority. C is a useful query technique under A, not an independent policy grant. B snapshot is viable if expressly chosen, but discloses more than first UAT needs. B live-current/future inheritance is not recommended.

## 11. Scope change / expansion / reacceptance alternatives

| Event | Viable choice(s) | Recommendation — NOT OWNER APPROVED |
| --- | --- | --- |
| A Initial establishment | Data grant after ACTIVE relationship + exact caregiver acceptance; or revoke/reinvite with an approved data contract | Separate new data grant; existing v1 relationship remains management-only until grant explicitly accepted |
| B Add Hospital/resource scope | New grant+accept; immutable replacement+accept; revoke+new relationship lifecycle | New exact grant+accept; existing other grants retain their unchanged scope |
| C Remove Hospital/resource scope | Immediate exact grant revoke; immutable narrower replacement; relationship revoke | Revoke that whole single-PHR grant immediately, no caregiver approval needed; no dormant scope that can be re-enabled silently |
| D PHR invalid/missing; Hospital non-ACTIVE | Fail closed; permanently terminate grant vs temporary suspension with explicit restoration semantics | Exact current PHR must still belong same Patient and Hospital ACTIVE; otherwise deny. Missing/deleted/replaced PHR does not transfer a grant to another row. Hospital non-ACTIVE temporarily denies an unchanged grant under explicit terms; no invented PHR status |
| E Eligible Hospital becomes ACTIVE again | Auto-resume unchanged unrevoked grant; require new acceptance | Resume only the same accepted, unrevoked scope if owner explicitly chooses Q14B; no new Hospital/fields/capabilities. A terminated grant never resumes |
| E Terminal Family relationship | Reactivation is not an allowed current lifecycle | Never reactivate REVOKED/WITHDRAWN; new invite+accept, old grants remain terminal and cannot attach to new relationship |
| F Patient gains new Hospital later | Explicit grant; automatic joining (high-risk separate choice) | NO auto-join; no discovery of ungranted Hospital to caregiver |
| G Patient revokes caregiver relationship | Parent deny alone vs atomic child termination too | Parent ACTIVE check immediately denies all grants after commit; atomic terminal child updates/audit if required for durable lifecycle evidence |
| H Caregiver withdraws | Same parent authority boundary | Immediate deny after commit, grants cannot survive under replacement relationship |
| I Capability/version/field expansion | New grant+accept; revoke/new relationship; rewrite existing grants | New immutable approved contract + new explicit acceptance. Unknown/new versions deny; never upgrade old v1 or data grant through deploy |

Hospital eligibility recommendation is stricter than SELF. Recommend temporary deny + restoration of the **same unchanged scope** on Hospital ACTIVE for the smallest bounded UAT, with explicit acceptance wording; this never restores a revoked grant or expands scope. Owner may instead require new acceptance after Hospital reactivation. That alternative cannot be guaranteed just by checking current Hospital.status on reads: suspension may occur and revert between reads, so it needs reliable grant invalidation coordinated with Hospital status changes (or equivalent persisted lifecycle/version evidence). This is decision Q14, not a silent implementation guess. No new PHR lifecycle is proposed.

For caregiver account inactivity choose temporary denial, matching foundation: unchanged accepted grant may resume when same User becomes ACTIVE if parent/grant/scope remain valid; permanent revoke/shrink never resumes. Patient account ineligibility is distinct: recommended fail closed for delegated data when originating Patient User is not ACTIVE/PATIENT; restoration only for unchanged unrevoked authority with explicit terms (Q15). Do not treat relationship/account/Hospital status as interchangeable.

Compare L02 acceptance approaches:

- **A Post-relationship data grant + explicit caregiver acceptance:** preserves v1 history, keeps relationship management separate; new data contract shows exact fields/PHR/window/future rule. Recommended.
- **B Revoke + new delegation invitation lifecycle:** simpler unified lifecycle if all-or-nothing desired; interrupts existing management and requires new invitation. Reinvite without new data evidence is insufficient; current invitation still v1/zero reads.
- **C Purpose-specific immutable grant/version record:** recommended persistence mechanism for A; can have proposal/accepted/terminal evidence and exact scope. C is not an alternative to consent evidence and does not authorize generic ACL.

Expansion never needs a new invitation token merely to change data scope under an ACTIVE exact-pair relationship if owner chooses A/C; it always needs a new accepted data grant. Shrink/revoke never waits for recipient agreement.

### Appointment visibility window versus data-grant lifetime — Q3 / Q17

**Resource visibility/history window (Q3)** กำหนดว่านัดหมายใดมองเห็นในแต่ละ request เช่น `scheduledAt >= serverNow AND scheduledAt < serverNow + 90 days`; rolling 90-day window ไม่ทำให้ authority หมดอายุหลัง 90 วัน **Data-grant lifetime (Q17 / P17F-L02)** กำหนดว่าผู้ดูแลมีสิทธิ์ส่ง request เหล่านี้ได้นานเท่าใด เป็น owner decision แยกต่างหากที่ยัง UNANSWERED

17F.1 อนุมัติเพียง ACTIVE CaregiverRelationship ไม่มี automatic expiry และ relationship นั้นให้ ZERO Patient-resource capabilities จึงไม่อนุมัติหรือกำหนดอายุของ delegated-data grant โดยปริยาย หากเลือก Q3A ร่วมกับ Q17A (no independent data-grant expiry) ผู้ดูแลจะเห็นนัดหมายใหม่/ที่ถูกแก้ไขซึ่งเข้าเกณฑ์ใน exact accepted PHR ผ่าน rolling 90-day window ได้อย่างต่อเนื่องไม่มีกำหนดสิ้นสุด ตราบใดที่ parent/grant ยัง ACTIVE ไม่ถูก revoke และ current account/Hospital/resource eligibility ผ่าน; revoke/parent termination ยุติ authority ทันทีหลัง commit

Q17B ต้องระบุ fixed duration นับจาก acceptance, expiry boundary, renewal/reacceptance และ notification semantics (รวม explicit no-notification choice หากเหมาะสม) ก่อน implementation; expiry ต้อง deny delegated Patient-resource requests ทันทีแม้ parent relationship ยัง ACTIVE การกลับมา eligible ตาม Q14/Q15 ไม่ต่ออายุหรือคืนสิทธิ์ให้ expired grant

Q17C ใช้ snapshot behavior เดียวกับ Q3B ไม่สร้าง scope rule ชุดที่สอง: ระบุ exact captured appointments ณ acceptance; นัดใหม่ไม่ auto-join แม้เป็น PHR เดิม Snapshot จำกัด records ไม่ใช่อายุ authority จึงยังต้องเลือก Q17A หรือ Q17B สำหรับอายุสิทธิ์ของ snapshot นั้น ห้ามถือว่า snapshot ทำให้ grant หมดอายุเอง

**P17F-L05 boundary:** หาก owner เลือก no independent expiry อย่างชัดเจน L05 อาจคงเป็น future gate สำหรับการเพิ่ม automatic expiry/renewal ภายหลัง หากเลือก expiring grant ใน first slice ต้อง resolve ส่วนของ L05 ที่จำเป็นต่อ duration/expiry, renewal/reacceptance และ notification semantics ตอนนี้ก่อน implementation ไม่สามารถ implement expiry แล้วทิ้ง semantics เหล่านี้เป็น future-only ได้ งานนี้ไม่เลือกอายุ grant หรือปิด L02/L05 แทน owner

## 12. P17F-L06 eligibility / kinship alternatives

| Choice | Enforceability / evidence | Privacy, legal and false assurance | UX / model / UAT |
| --- | --- | --- | --- |
| A Relative/family required | No current kinship model/verification; must define family (spouse, partner, blood/adopted/in-law etc.), claimant, verifier, proof, correction and retention before enforceable | Surname/emergency contact/Hospital/OSM prove nothing. A self-attested “relative” is not verified kinship; collecting proof creates more personal/third-party data | Highest decision/model/proofing burden; bounded known relatives may test UX but cannot truthfully claim generalized verified-relative policy |
| B Patient-designated trusted caregiver | Existing exact Patient designation + authenticated bound recipient acceptance is technically enforceable; no kinship condition | Explicit designation supports voluntary authorization, not legal representation or proof of capacity; controller must still approve data disclosure | Smallest adult voluntary UAT option; existing ACTIVE accounts only, no extra kinship persistence needed |
| C Hybrid descriptive type | Authorization still B; optional relationship label requires defined vocabulary/source/edit/privacy terms | UI must state unverified/informational. Risk that label implies guardian authority or verified relationship | Extra field and UX; useful only if owner shows actual need. Avoid free-text kinship/proof by default |

**RECOMMENDATION — NOT OWNER APPROVED: B**, bounded competent-adult voluntary UAT with explicitly designated existing ACTIVE recipient and accepted data grant. Relationship type not eligibility-bearing, no new type field or kinship verification in this slice. This recommendation does not establish current non-relative eligibility; L06 is still OPEN.

Parent for minor, guardian, incapacity, power of attorney and legal representative require separate verified basis and remain deferred. Adult voluntary UAT is a scenario constraint, not runtime legal-age/capacity verification; do not derive or disclose DOB to manufacture proof.

## 13. Privacy / controller gates

| Proposed disclosed field | Classification | Specific necessary purpose / minimization |
| --- | --- | --- |
| existing givenName / familyName | Management identity metadata | Select correct participant already identified by 17F.1; no contact/identifier fallback |
| hospitalName | Patient-resource context revealing care association | Know which explicitly selected care organization hosts appointment; no other Hospital inventory/code/HN/membership |
| scheduledAt | Patient-resource health-service fact | Organize accompaniment/reminder outside DEMI; no past service history |
| type | Clinical-service fact (FOLLOW_UP/CONSULTATION only) | Distinguish broad schedule purpose without diagnosis/interpretation |
| durationMinutes | Patient-resource logistical fact | Plan time needed; nullable, optional medically, included only for scheduling utility |
| locationType | Patient-resource logistical fact | Distinguish clinic/online/home visit/other mode; home-visit label still sensitive, no address/link |
| status | Patient-resource workflow fact | Avoid attending an already CANCELLED future appointment; no receipt/attendance or full status history |
| opaque link locator | Technical Patient-resource locator | Exact list→detail navigation only; not shown as identity, never authorizes access alone |

Hospital-local identifiers (HN), clinical/free-text notes, raw measurements/artifacts, contact data and third-party identities are not needed for B1 and excluded. Proposed duration/mode/type still need affirmative owner/controller acceptance; “nonclinical schedule” is not a claim that appointments are nonsensitive.

**EXTERNAL APPROVAL GATE:** repository evidence does not establish which controller(s) may permit delegated disclosure of Hospital records, legal/privacy basis, notice/retention terms, cross-Hospital arrangements or verified capacity policy. Owner must identify responsible privacy/controller reviewer and provide approval for exact B1 fields, selected Hospital(s), adult voluntary audience, future-record/window terms and revocation limits before real-data UAT disclosure. If not available, continue only synthetic-data decision review; no real Patient delegated read implementation follows from this pack. No Thai legal requirement or compliance conclusion is invented; technical acceptance is not a general legal consent determination. Phase 17E.2 stays parked, no consent signing domain introduced.

Read audit disclosure/retention and notification obligations are also not established. Recommend transactional proposal/accept/shrink/revoke audit with bounded IDs/contract versions, never field contents; explicit owner decision whether each successful/denied read needs durable audit, its retention and access. Avoid raw names, location, clinical payload, tokens or National ID in logs. No broad read-audit system is proposed.

## 14. Future authorization shape / persistence / cache boundary

Conceptual equation (no code):

```text
authenticated current ACTIVE caregiver User with exact persisted Person binding
+ ACTIVE CaregiverRelationship bound to same caregiver and exact PatientProfile
+ approved L06 eligibility and originating Patient eligibility
+ recognized approved delegated-read capability AND accepted immutable contract version
+ current ACTIVE purpose-specific grant for that exact relationship and PHR
+ grant lifetime valid under explicitly accepted Q17 terms (not expired if fixed expiry chosen)
+ exact current PHR → same PatientProfile / Hospital
+ exact appointment → that PHR (and Program ownership for any future Program child)
+ current Hospital/resource status and accepted time/history/future-record eligibility
= ALLOW only separately allowlisted projection
otherwise DENY
```

Server derives authority; IDs in URL/client select resources only. No spoofed Patient ActorContext, no PATIENT role inheritance, no OSM assignment/membership shortcut, no ADMIN bypass. Persisted-state errors/missing grant/unknown version fail closed with non-enumerating not-found/denied behavior.

| Persistence approach | Merits / limitations | Assessment |
| --- | --- | --- |
| Put capability/scope columns on CaregiverRelationship | Few entities but mixes v1 zero-data relationship acceptance with independent multi-PHR/data versions; mutable fields may erase evidence | Possible only with explicit all-or-nothing lifecycle contract; not preferred |
| Separate Family-specific data grant for exact parent relationship + PHR + approved contract | Keeps relationship history; one narrow capability contract can avoid per-field ACL; durable issuer/recipient/version/scope/accept/terminal evidence | Recommended; exact schema/constraints/TTL not designed or added here |
| Separate grant header + scope children | Handles multiple PHR in one acceptance snapshot and version replacement | Only if B/multi-scope atomic acceptance selected; unnecessary for one-PHR grant |
| Audit-only scope or query-time live discovery | Audit does not establish authoritative current permission; no durable version/acceptance boundary | Reject as authority |
| Generic delegation/ACL framework | Unneeded broad abstraction | Excluded |

Recommended grant concept must preserve exact parent pair, exact PHR same Patient, immutable approved disclosure version/time rules, separately approved data-grant lifetime (Q17), Patient grant evidence and exact caregiver acceptance, current/terminal state, actor/timestamps and safe audit. Constraints and transactional updates would be required if implemented; no Prisma entity name/columns are finalized. Contract versions identify immutable allowlists; code must not change old version meaning. Existing ACTIVE v1 relationships with no new accepted grant continue to deny all resources.

### Request/cache/revocation/download review

Repository Next.js is `16.3.0`; [configuration](../../next.config.ts) does not enable Cache Components. Current SELF routes call `connection()` and page contexts resolve protected actor before Prisma reads; inspected SELF/Family queries do not wrap authorized results in shared `use cache`/`unstable_cache`. These observations are source evidence, not proof of future cache safety.

Checked installed `node_modules/next/dist/docs/01-app/02-guides/caching-without-cache-components.md` and authentication/request-time guides plus Context7 primary Next.js docs. [Next.js caching guide](https://nextjs.org/docs/app/guides/caching-without-cache-components) and [connection reference](https://nextjs.org/docs/app/api-reference/functions/connection) establish database-cache and request-time rendering boundaries; [navigation guide](https://nextjs.org/docs/app/getting-started/linking-and-navigating) describes client transitions/partial prefetch. Assess browser/Router retained state separately; do not apply fetch no-store mechanically to Prisma or assume server dynamic rendering recalls browser content. Online docs/Context7 may track newer 16.x/canary; installed 16.3.0 guides and current configuration are the version-specific evidence, with no dependency upgrade.

- Future data request and deep link must re-resolve ACTIVE actor, exact parent/grant and resource eligibility. Use an authorization-scoped query/current-state predicate and a documented concurrency boundary; a separate stale precheck must not authorize a later unscoped fetch.
- No shared persisted authority/Patient DTO cache in first slice; no static prerender of delegated data, no stale-while-revalidate serving after revocation, no CDN public caching. Verify full HTML/RSC/any future transport, not just fetch defaults. Revalidation is UX invalidation, never a substitute for current DB authorization.
- Immediate after **committed** revoke/withdraw/shrink: new authoritative reads deny. Race tests must establish a clear ordering: a read authorized before commit may already be in flight/rendered; no read authorized after commit may serve fresh data. If stronger “no response finishing after revoke” semantics is required, owner must explicitly choose and engineering review locking/ordering implications; no such guarantee is claimed here.
- Browser tab/back-forward/prefetched Router Cache can retain already rendered information. Clear/refresh local view after own lifecycle actions and on revisit/focus as appropriate; no offline persistence/export feature. Other tabs/devices cannot be instantly scrubbed without additional mechanisms; no promise of recall.
- Deep links are not bearer permissions; stale/foreign/ungranted/out-of-window IDs deny without confirming record existence. Disable unnecessary prefetch of sensitive detail and verify browser reuse during L04 UAT.
- **Recommend exclude downloads/exports** (including generated print/PDF/data export), bulk history, evidence downloads. Screenshots/manual browser copy cannot be recalled or technically prevented by server policy; explain this in acceptance/privacy notice.

## 15. ONE proposed bounded 17F.2 UAT package

**PROPOSED / RECOMMENDED — NOT OWNER APPROVED — DO NOT IMPLEMENT YET**

Family management → select exact recipient by existing givenName/familyName → accepted appointment grant for one exact Patient-selected current PHR → upcoming appointment list / optional same-field detail. This demonstrates a bounded Family journey; no profile/health-plan/care/medication placeholder suggests completed functionality.

| Capability / source | Exact disclosed fields | Scope / history / future behavior | No-mutation boundary |
| --- | --- | --- | --- |
| Existing management identity (no new Patient-resource capability) / Person through Family query | `givenName,familyName` only | Existing management participation scope; no DOB/HN/contact/Hospital inventory | Existing relationship lifecycle only, unchanged |
| B1 read upcoming appointment schedule / PatientAppointment + exact PHR.Hospital | `hospitalName,type,scheduledAt,durationMinutes,locationType,status`; nullable values remain null | One exact PHR per grant, Hospital ACTIVE; `scheduledAt >= serverNow AND < serverNow + 90×24h`, `status IN (SCHEDULED,CANCELLED)`. Include current eligible existing rows and future created/updated appointments in that same approved PHR/window **only if owner expressly selects Q3A**; never new PHR. Asc scheduledAt/id, max 50/page with bounded continuation; no past history, completed/no-show, outside-window list/detail | READ ONLY; no Patient/OSM/operator action reuse |

90 days is a proposed product boundary, not current SELF behavior or prior approval. Server window is an elapsed UTC interval; display Asia/Bangkok. Detail eligibility rechecked at access, so past/out-of-window/changed terminal records become unavailable even if an old link exists. CANCELLED stays visible while its scheduledAt remains in the upcoming window; status is factual and no longer a valid appointment to attend. If owner instead wants scheduled-only, Q3 alternatives must be adjusted explicitly, not silently widened. Opaque appointment/grant locators may support routing but are not additional display fields; no raw Patient/actor/Hospital/assignment IDs.

ช่วง 90 วันนี้เป็น **query-time appointment visibility** เท่านั้น ไม่ใช่ grant expiration หรือ duration นับจาก acceptance อายุ authority ยังรอ Q17: Q3A + Q17A ทำให้เกิด ongoing future-record feed ใน PHR เดิมได้ไม่มีกำหนดจน revoke/parent termination หรือ eligibility ไม่ผ่าน; Q3A + Q17B ให้ feed ได้เฉพาะก่อน fixed grant expiry ที่ owner กำหนด ส่วน Q3B/Q17C จำกัด exact captured resources และยังต้องกำหนดอายุ authority แยกตาม Q17A/B ชุด B1 จึงยังมี lifetime decision pending ไม่สืบทอด no-auto-expiry จาก 17F.1

Precise venue/link is deliberately excluded because current locationDetail is free text; this package supports schedule awareness, not complete attendance logistics. If that limitation makes UAT unhelpful, stop at owner field decision for a structured safe location projection, not automatic locationDetail sharing.

Excluded candidates: A extra profile (no purpose), C care/measurements (sensitive, unnecessary for chosen journey), D Goal Plan (Health Plan meaning unresolved and prototype/text risk), historical appointment/people/interactions (more disclosure than first purpose needs). Recommendations need coordinated L01+L02+L06 decisions and external gate, not piecemeal code work.

## 16. Explicit excluded scope

National ID/hash, credentials/security/recovery, HN, arbitrary DOB/derived age, phone/email/address, emergency contacts, occupation/education/gender/classification, raw/free-text clinical/profile/location notes, artifacts/evidence, internal audit/IDs as display data, Hospital memberships/hierarchy authority, OSM permissions/snapshots, PatientServiceRequest read/mutation, all Patient mutations, acknowledgement/cancel/reschedule/coordination, consent signing, medication (17G), Wellness, minors/legal representatives, impersonation, new caregiver onboarding, generic ACL and QR (17F.3). Absence from this list never grants access.

## 17. Implementation impact map and ADR assessment

| Area | Future impact if recommended A+B1 grant package approved | Requirement level |
| --- | --- | --- |
| Prisma/persistence / migration | Family-specific exact-PHR grant/version/acceptance/terminal evidence + pair/scope constraints; existing published migrations unchanged | Definitely for recommended persistence; exact design after decision. Grant header/children only for multi-scope choice |
| Family delegated policy | Current ACTIVE actor/relationship/grant/exact ownership/time/status/version; no SELF impersonation | Definitely for any delegated read |
| Resource query / Prisma projection | New explicit B1 selector/context and bounded upcoming filter; no SELF/Work DTO pass-through | Definitely |
| Routes/UI/page context | Exact participant/scope selection and data acceptance, list/detail loading/empty/denied/revoked states; no mutation controls | Definitely; actual route design after approval |
| Transactional audit | Grant proposal/accept/revoke/shrink, parent termination consistency, idempotency/races | Definitely; per-read durable audit only if controller/owner requires |
| Hospital governance invalidation | Coordinate status transitions if restoration must require fresh acceptance | Only for Q14A; recommended Q14B rechecks current eligibility and resumes unchanged unrevoked scope under explicit terms |
| Data-grant expiry / renewal | Persist/enforce an accepted deadline, expiry denial, renewal/reacceptance evidence and any approved notification behavior | Only if Q17B chosen; required L05 semantics must be resolved before implementation. Q17A does not add independent expiry; neither option is selected |
| Tests | Projection deny fields, cross-Patient/Hospital, foreign locators, no grant/v1-only, new PHR/unknown version, filter edges, concurrent accept/shrink/revoke/read, inactive accounts/Hospital, cache/browser stale views | Definitely; unit/query/UI and focused PostgreSQL plus L04 UAT after implementation |
| C1 / Goal / kinship / exports | Extra contract, projections/model/validation/UI if expressly approved | Only under other owner choice, not recommended first package |

[ADR-0001](../adr/0001-person-and-user-identity.md), [ADR-0002](../adr/0002-role-capability-scope-authorization.md), [ADR-0004](../adr/0004-patient-provisioning-and-activation.md), [ADR-0005](../adr/0005-server-side-application-boundary.md), [ADR-0006](../adr/0006-transactional-business-operations.md), [ADR-0007](../adr/0007-client-transport-and-mobile-ready-architecture.md) remain compatible with purpose-specific explicit delegated scope, existing identity, no new role and server authority. A new capability/grant does not itself require ADR. No ADR created in this task. Broad inherited cross-Hospital authority, legal-representative identity, impersonation, generic delegation platform or new core identity would require architectural review/possible ADR after accepted requirements; none is recommended or implemented.

## 18. Remaining future gates / validation boundary

17F.1 remains IMPLEMENTED / CLOSED; **Patient-resource delegated allowlist EMPTY**. 17F.2 **DECISION PENDING / NOT IMPLEMENTED**. L01/L02/L06 OPEN; Q17 data-grant lifetime UNANSWERED. L03 QR only 17F.3; L04 re-audit/UAT closure. P17F-L05 remains future for later automatic expiry/renewal only if owner explicitly chooses no independent first-slice data-grant expiry; choosing fixed expiry now requires the necessary L05 duration/expiry, renewal/reacceptance and notification semantics resolved before implementation (section 11). Neither direction is selected. Minors/legal representation deferred, medication 17G, Phase 17E.2 consent parked; CARE-02/06, PAT-03/05, notifications/Wellness and external controller gates unchanged.

Documentation-only validation: inspect complete diff/changed paths, check local Markdown targets, UTF-8 without BOM for new file and unchanged byte encoding/line endings outside inserted paragraphs, no Thai replacement characters, `git diff --check`. No tests/integration/build/dev server/Prisma migration executed; source/test inspection is evidence review, not test success. No approval/closure/implementation-ready claim follows from this pack.

Original 17F.2A validation results (before this lifetime correction): 59 local Markdown links in this pack resolve; both new Context/backlog references resolve. All 13 TypeScript select snapshots exactly match inspected source text. Strict UTF-8 decode/no replacement characters passed; new file has no BOM. Removing only the inserted paragraphs reproduces original Context/backlog HEAD bytes exactly, preserving Thai text/encoding/line endings. Changed-path check confirms only these three documentation files, no runtime/schema/migration changes. `git diff --check` passed (exit 0). New-file `git diff --no-index --check -- /dev/null docs/phases/PHASE_17F2_DELEGATED_READ_DECISION_PACK.md` reported no whitespace errors (exit 1 for the new-file difference); independent trailing-whitespace/final-newline check passed. Phase-boundary assertions passed and HEAD is unchanged.

## Appendix A — Exact current SELF Prisma select snapshots

Copied from inspected HEAD; snippets are current SELF evidence only, not proposed implementation. All `true` leaves and nested selection ordering/limits are preserved. Top-level scope/order/page clauses are recorded in sections 4–8.

### A1 SELF context / relationship navigation

Source: [query source](../../src/modules/patient-self/services/patient-self-query-service.ts)

```ts
const patientSelfRelationshipNavigationSelect = {
  id: true,
  hospitalNumber: true,
  hospital: {
    select: {
      hospitalCode: true,
      name: true,
      status: true,
    },
  },
} satisfies Prisma.PatientHospitalRelationshipSelect;
```

```ts
export const patientSelfContextSelect = {
  givenName: true,
  familyName: true,
  patientProfile: {
    select: {
      hospitalRelationships: {
        orderBy: [{ hospital: { name: "asc" } }, { id: "asc" }],
        select: patientSelfRelationshipNavigationSelect,
      },
    },
  },
} satisfies Prisma.PersonSelect;
```

```ts
const patientSelfRelationshipListSelect = {
  givenName: true,
  familyName: true,
  patientProfile: {
    select: {
      hospitalRelationships: {
        orderBy: [{ hospital: { name: "asc" } }, { id: "asc" }],
        select: patientSelfRelationshipNavigationSelect,
      },
    },
  },
} satisfies Prisma.PersonSelect;
```

### A2 Hospital-local SELF profile

Source: [query source](../../src/modules/patient-hospital-profile/services/patient-hospital-profile-service.ts)

```ts
export const patientHospitalProfileSelect = {
  id: true,
  hospital: { select: { name: true } },
  hospitalProfile: {
    select: {
      gender: true,
      phoneNumber: true,
      addressText: true,
      emergencyContactName: true,
      emergencyContactPhone: true,
      occupation: true,
      educationLevel: true,
      version: true,
    },
  },
  patientProfile: {
    select: {
      gender: true,
      phoneNumber: true,
      addressText: true,
      emergencyContactName: true,
      emergencyContactPhone: true,
      occupation: true,
      educationLevel: true,
      person: {
        select: {
          givenName: true,
          familyName: true,
        },
      },
    },
  },
} satisfies Prisma.PatientHospitalRelationshipSelect;
```

### A3 SELF appointment list/detail

Source: [query source](../../src/modules/patient-self/services/patient-self-care-query-service.ts)

```ts
function appointmentPatientSelect(relationshipId: string) {
  return {
  id: true,
  type: true,
  scheduledAt: true,
  durationMinutes: true,
  locationType: true,
  locationDetail: true,
  status: true,
  updatedAt: true,
  responsibleUser: {
    select: {
      person: { select: { givenName: true, familyName: true } },
      memberships: {
        where: {
          hospital: {
            is: {
              patientRelationships: { some: { id: relationshipId } },
            },
          },
        },
        select: { profession: true },
      },
    },
  },
  osmAssignmentAtCreation: {
    select: {
      osmUser: { select: { person: { select: { givenName: true, familyName: true } } } },
    },
  },
  acknowledgements: {
    orderBy: [{ sourceAppointmentUpdatedAt: "desc" }, { id: "desc" }],
    take: 1,
    select: {
      sourceAppointmentUpdatedAt: true,
      source: true,
      acknowledgedAt: true,
    },
  },
  cancellationRequests: {
    orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
    take: 5,
    select: {
      source: true,
      status: true,
      submittedAt: true,
    },
  },
  } satisfies Prisma.PatientAppointmentSelect;
}
```

### A4 Screening / Baseline

Source: [query source](../../src/modules/patient-self/services/patient-self-care-query-service.ts)

```ts
const screeningPatientSelect = {
  submittedAt: true,
} satisfies Prisma.ScreeningAssessmentSelect;
```

```ts
const baselinePatientSelect = {
  recordedOn: true,
  weight: true,
  heightCm: true,
  waistCircumference: true,
  bloodPressureSystolic: true,
  bloodPressureDiastolic: true,
  bloodSugarDtx: true,
  hba1c: true,
} satisfies Prisma.PatientBaselineSelect;
```

### A5 Program / Service 1 / Final

Source: [query source](../../src/modules/patient-self/services/patient-self-care-query-service.ts)

```ts
const programHistorySelect = {
  id: true,
  status: true,
  startedAt: true,
  completedAt: true,
} satisfies Prisma.PatientProgramSelect;
```

```ts
const programDetailSelect = {
  id: true,
  status: true,
  startedAt: true,
  completedAt: true,
  serviceOneRoutine: { select: { recordedAt: true } },
  serviceOneFloatingChart: { select: { recordedAt: true } },
  serviceOneDreamCard: { select: { recordedAt: true } },
  serviceOneConfidence: { select: { recordedAt: true } },
  finalAssessment: {
    select: {
      recordedAt: true,
      weight: true,
      waistCircumference: true,
      systolicBloodPressure: true,
      diastolicBloodPressure: true,
    },
  },
} satisfies Prisma.PatientProgramSelect;
```

### A6 Follow-up

Source: [query source](../../src/modules/patient-self/services/patient-self-care-query-service.ts)

```ts
const followupHistorySelect = {
  id: true,
  roundNumber: true,
  recordedAt: true,
  patientProgram: {
    select: {
      status: true,
      startedAt: true,
      completedAt: true,
    },
  },
} satisfies Prisma.PatientFollowupSelect;
```

```ts
const followupDetailSelect = {
  id: true,
  roundNumber: true,
  recordedAt: true,
  weight: true,
  waistCircumference: true,
  systolicBloodPressure: true,
  diastolicBloodPressure: true,
  patientProgram: {
    select: {
      status: true,
      startedAt: true,
      completedAt: true,
    },
  },
  sourceGoalPlan: {
    select: {
      templateKey: true,
      templateVersion: true,
    },
  },
  activityProgress: {
    orderBy: [{ goalActivityCode: "asc" }, { id: "asc" }],
    select: {
      goalActivityCode: true,
      status: true,
    },
  },
} satisfies Prisma.PatientFollowupSelect;
```

### A7 Goal history

Source: [query source](../../src/modules/patient-self/services/patient-self-care-query-service.ts)

```ts
const goalPlanHistorySelect = {
  id: true,
  roundNumber: true,
  createdAt: true,
  primaryGoalCode: true,
  templateKey: true,
  templateVersion: true,
  patientProgram: {
    select: {
      status: true,
      startedAt: true,
      completedAt: true,
    },
  },
} satisfies Prisma.PatientGoalPlanSelect;
```

### A8 Goal detail

Source: [query source](../../src/modules/patient-self/services/patient-self-care-query-service.ts)

```ts
const goalPlanDetailSelect = {
  id: true,
  roundNumber: true,
  createdAt: true,
  primaryGoalCode: true,
  primaryGoalNote: true,
  weeklyNote: true,
  templateKey: true,
  templateVersion: true,
  patientProgram: {
    select: {
      status: true,
      startedAt: true,
      completedAt: true,
    },
  },
  items: {
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    select: {
      activityCode: true,
      targetDays: true,
      targetValue: true,
      targetUnit: true,
    },
  },
} satisfies Prisma.PatientGoalPlanSelect;
```

### A9 Select-to-DTO differences

Screening adds neutral constant `RECORDED`; Baseline renames `bloodPressureSystolic/Diastolic` to `systolicBloodPressure/diastolicBloodPressure`. Goal/Follow-up code+template fields resolve labels server-side and are not exposed as fields. Program Service 1 adds fixed labels to recorded dates; Final maps the four raw measurements. Appointment maps selected Person names to display strings, uses first exact-Hospital profession, drops acknowledgement version metadata and retains acknowledgement only for current `updatedAt`. Internal IDs used for sorting/filtering are not automatically returned; see exact DTO inventories in sections 5–9.

## 19. Owner decision checklist — ทุกข้อ UNANSWERED

เลือก A/B/C เป็นรายข้อได้ เช่น `Q1=A, Q2=A, ...`; หากต้องการเปลี่ยน field ระบุชื่อเพิ่ม/ตัดตรง ๆ ห้ามถือ recommended column เป็นคำตอบของ owner ข้อที่ต้องการ privacy evidence ให้ระบุผู้อนุมัติ/เอกสารด้วย การตอบบางข้อไม่ปิด L01/L02/L06 โดยอัตโนมัติ

| # / gate | Option A | Option B | Option C | Recommended / impact |
| --- | --- | --- | --- | --- |
| Q1 L01 groups | B1 appointments only + existing management names | B1 + C1 latest Screening/Program status (section 5) | Defer all data reads / ระบุ package อื่น | A; coherent smallest schedule journey |
| Q2 L01 exact fields | B1 six fields section 15, no extra profile | A plus specifically reviewed additional fields; supply exact names/purpose/controller approval | Reject/replace allowlist explicitly | A; names stay management metadata; detail has same fields |
| Q3 L01 history / future records (not grant lifetime) | Rolling 90 days, SCHEDULED/CANCELLED; current+future same-PHR eligible rows, no past. With Q17A, ongoing future-record feed until revoke/parent termination or eligibility failure | Acceptance-time exact appointment-ID snapshot, same field/time limits; new rows need new acceptance; aligned with Q17C | Other exact days/status/history selector; must specify | A remains record-behavior recommendation only; future SAME scope, not future Hospital. Lifetime independently requires Q17 |
| Q4 L01 download/export | Excluded | Separate approval for specified format/fields/scope/retention before adding | Defer decision, keep denied | A; no generated export/print/bulk file |
| Q5 L01 privacy/controller | External reviewer approves exact package before real-data UAT; identify reviewer/evidence | Synthetic-data review only until approval | Existing approval evidence provided; identify exact authority/coverage | A; current evidence does not establish legal/controller basis; no real-data disclosure until evidence |
| Q6 L02 Hospital/resource scope | Exact Patient-selected current PHR per grant | All acceptance-time PHR snapshot, explicit approved type/window | Per-request discovery under explicitly specified persisted grants | A; discovery alone never grants authority |
| Q7 L02 future Hospital | NO auto-join, new grant+accept | Explicitly approve future inheritance with privacy/ADR review (not recommended) | Snapshot-only approach with same NO default | A; no hidden expansion |
| Q8 L02 shrink | Immediate revoke exact single-PHR grant; others unchanged | Revoke entire relationship/all grants | Immutable narrower replacement; no enlargement before accept | A; no caregiver agreement needed to remove authority |
| Q9 L02 expansion | New grant/version + explicit caregiver accept before added scope/fields | Revoke + new relationship invitation/data lifecycle | Defer all expansion | A; old acceptance never silently upgraded |
| Q10 L02 v1→data acceptance / persistence | Separate purpose-specific immutable data grant to ACTIVE pair + exact PHR, Patient proposal and caregiver accept | Revoke+new delegation lifecycle with approved data contract | No data sharing until different concrete mechanism approved | A; preserve ZERO-data v1 history, no migration auto-grants |
| Q11 L06 recipient | Patient-designated trusted caregiver, non-relative permitted | Relative-only; define eligible family/assertion/verification | Hybrid; authorization by designation, type descriptive | A; bounded adult voluntary existing-account UAT only |
| Q12 L06 relationship type | No new type field, not eligibility-bearing | Optional informational type (explicit unverified wording/vocabulary required) | Eligibility-bearing type (define truthful proof/rules) | A; no extra personal data or false assurance |
| Q13 L06 kinship verification | None; exact designation/account acceptance is basis, no kinship claim | Self-attestation (define semantics, never verified label) | Verified kinship (define verifier/proof/storage/retention) | A with Q11A; cannot call current system kinship-verified |
| Q14 L02 Hospital invalid/reactivated | Deny on invalid/non-ACTIVE; durably invalidate grant so restoration requires new grant+accept | Temporary deny while non-ACTIVE; resume unchanged accepted scope on ACTIVE, explicit terms | Keep historical reads independent of Hospital status (different privacy review) | B smallest bounded UAT; A stricter and adds Hospital-transition integration. Missing/wrong PHR always denies; no PHR lifecycle invented |
| Q15 L02 Patient/caregiver account eligibility | Both ACTIVE; originating Patient remains PATIENT; temporary account deny, unchanged unrevoked grant may resume | Caregiver ACTIVE only; parent/grant validity independent of Patient account status | Any account ineligibility terminates grant; fresh accept required | A fail closed; distinguish account suspension from terminal revoke/Hospital invalidation |
| Q16 Privacy read audit | Lifecycle transactional audit; controller must define if reads need durable audit before real-data UAT | Lifecycle + per-read success/denial audit with approved retention/access | Synthetic-only while audit policy pending | A; no invented compliance guarantee or sensitive payload logs |
| Q17 P17F-L02 delegated-data grant lifetime | No independent expiry: accepted grant remains ACTIVE while parent ACTIVE, grant unrevoked and current account/Hospital/resource eligibility valid. With Q3A, continuous newly eligible same-PHR appointments in rolling 90-day window indefinitely while authority remains valid | Fixed expiry from acceptance: owner specifies duration; expiry immediately removes Patient-resource authority. Resolve required L05 renewal/reacceptance and notification semantics before implementation | Snapshot / no continuous future feed: use Q3B exact acceptance-time resources, no new appointments automatically visible; also select A or B for snapshot authority lifetime | UNANSWERED; no lifetime option recommended/selected in this correction. A does not mean access ends after 90 days; B requires complete expiry terms now; C alone does not settle whether authority expires |

คำตอบ Q1–Q5 ใช้ resolve L01, Q6–Q10/Q14–Q15/Q17 ใช้ resolve L02, Q11–Q13 ใช้ resolve L06; Q5/Q16 external privacy evidence ประกอบทั้งชุด ต้องตอบ record behavior (Q3) และ authority lifetime (Q17) แยกกันอย่างสอดคล้อง หาก Q17=C ต้องตอบ Q3=B และระบุ Q17 lifetime=A หรือ B เพิ่มด้วย หากเลือก fixed expiry ต้องระบุ duration และ resolve ส่วน L05 ที่จำเป็นก่อน implementation ทุกคำตอบยังว่าง จึง **ห้ามเริ่ม implementation จาก recommendation เพียงอย่างเดียว**
