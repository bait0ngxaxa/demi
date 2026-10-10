# Phase 18C.1 — Implementation Gate Matrix

- **ผล Phase:** DECISION REVIEW READY — ไม่มี implementation authorization
- **Source HEAD ที่ตรวจ:** main / 302acaec724ca14e60a9243a333bf235241ebb42
- **จุดประสงค์:** แสดง decision/data/security dependencies ของ G18-01–G18-14 และเกณฑ์ก่อน Phase 18C.2

ตารางนี้นำ gap เดิมจาก [Phase 18AB Verified Gap Backlog](./PHASE_18AB_VERIFIED_GAP_BACKLOG.md) มาเชื่อมกับคำตอบใน [Decision Review Register](./PHASE_18C1_DECISION_REVIEW_REGISTER.md). ไม่สร้าง Gap ID หรือ Decision ID ใหม่ และไม่อนุมัติ implementation.

## 1. Readiness semantics

| Readiness | การใช้ |
| --- | --- |
| READY_FOR_DESIGN_REVIEW | business/clinical requirement สำหรับ design ของ scope นั้นชัดพอแล้ว; ไม่ได้แปลว่า implementation, security/privacy หรือ release ได้รับอนุมัติ |
| REQUIREMENT_BLOCKED | business requirement, population, field meaning หรือ customer acceptance ยังไม่ชัด |
| CLINICAL_APPROVAL_BLOCKED | clinical definition, formula, instrument, unit หรือ interpretation ยังไม่มี approval |
| DATA_SOURCE_BLOCKED | ไม่มี authoritative stored source/linkage/timestamp ที่จำเป็น หรือยังไม่มีหลักฐานว่า source candidate ใช้แทนได้ |
| SECURITY_PRIVACY_BLOCKED | ต้องมี authorization, exact scope, field disclosure, privacy, snapshot, revocation/audit หรือ delivery approval เพิ่ม |
| DEFERRED | ใช้เมื่อมีเอกสารยืนยันว่าเลื่อน/defer แล้ว เช่น HN-M08; ไม่ใช้แทน “ยังไม่มีคำตอบ” |

หนึ่ง gap อาจมีหลาย readiness blockers. สถานะ D01–D15 ใน RPT-24A ยังคง PROPOSED FOR REQUESTER / CUSTOMER REVIEW. BR/CL เป็นหัวข้อเปิด ไม่ใช่ decision IDs. Design readiness, implementation authorization, runtime implementation และ customer UAT เป็นคนละผล.

## 2. Gap-by-gap gates

### G18-01 — Exact-Hospital population, row grain และ snapshot

- **Linked decisions / rules:** R24A-D01–D03, D11, D14–D15; BR-01; CL-04 เฉพาะเมื่อสรุป cohort.
- **Source ปัจจุบัน:** PatientHospitalRelationship ผูก Hospital; PatientProgram มี exact relationship และ ACTIVE/COMPLETED; Program report อ่านตาม Program; classification count เป็น query แยก. ดู [schema](../../prisma/schema.prisma), [Program report query](../../src/modules/reporting/services/program-report-query-service.ts), [Phase 18B §10](./PHASE_18B_EXCEL_DATA_GAP_VERIFICATION.md).
- **สิ่งที่ยังขาด:** eligibility/population, row grain, relationship history, join ให้สองชีต/counts/pages สอดคล้อง และ export snapshot/permission contract.
- **ชั้นงานเมื่ออนุมัติ:** AUTHORIZATION, REPORTING_PROJECTION, EXPORT.
- **Authority:** Customer/Product + Hospital operations สำหรับ population/grain; Security/privacy + Architecture/DB สำหรับ access/snapshot.
- **Security/privacy แยก:** RPT-24C actor/capability, exact-Hospital field allowlist, cross-Hospital denial, revocation/audit, coherent snapshot, bounded delivery.
- **Readiness:** REQUIREMENT_BLOCKED + SECURITY_PRIVACY_BLOCKED. D01–D03/D14/D15 ยัง PROPOSED.
- **Safe next action:** ให้ customer ตัดสิน population/row examples; ส่งกลไกและ access ไป RPT-24C แยก. ห้าม export cohort จน gates ของ scope นั้นปิด.

### G18-02 — Patient identity, OSM identity และ missing display

- **Linked decisions / rules:** R24A-D04–D05, D12; BR-08.
- **Source ปัจจุบัน:** Person name และ Hospital-local nullable hospitalNumber; OSM assignment ผูก exact PatientHospitalRelationship แต่ไม่ผูก historical care responsibility กับ Program/service. ดู [schema](../../prisma/schema.prisma), [assignment service](../../src/modules/patient-assignment/services/patient-osm-assignment-service.ts).
- **สิ่งที่ยังขาด:** customer meaning ของ ID/name/OSM, historical responsibility provenance, null/withheld display และ field disclosure.
- **ชั้นงานเมื่ออนุมัติ:** AUTHORIZATION, REPORTING_PROJECTION, EXPORT, UI_UX.
- **Authority:** Customer/Product + Hospital data owner/operations; Security/privacy อนุมัติการเปิดเผย.
- **Security/privacy แยก:** PII allowlist, exact Hospital, safe withheld behavior, workforce identity disclosure.
- **Readiness:** REQUIREMENT_BLOCKED + SECURITY_PRIVACY_BLOCKED; PROPOSED.
- **Safe next action:** ระบุว่าจะใช้ current assignment, omit หรือ authoritative historical source; ห้ามแสดง UUID หรือใช้ current assignment แทน historical attribution.

### G18-03 — Missing authoritative clinical fields

- **Linked decisions / rules:** R24A-D06–D09, D12; CL-01–CL-05.
- **Source ปัจจุบัน:** Baseline มี nullable HbA1c และ height/weight; Final Assessment ไม่มี HbA1c/height; ไม่พบ authoritative CVD score, illness onset หรือ stored BMI. ดู [schema](../../prisma/schema.prisma), [Baseline service](../../src/modules/patient-baseline/services/patient-baseline-service.ts), [Final Assessment service](../../src/modules/patient-final-assessment/services/patient-final-assessment-service.ts), [Phase 18B high-risk fields](./PHASE_18B_EXCEL_DATA_GAP_VERIFICATION.md).
- **สิ่งที่ยังขาด:** mandatory status ต่อ worksheet, source owner, clinical stage/date/unit, source provenance/correction; After HbA1c/CVD/onset sources; BMI method/compatible inputs.
- **ชั้นงานเมื่ออนุมัติ:** DATA_CAPTURE เฉพาะ source gap ที่ยืนยัน, DOMAIN_MODEL, REPORTING_PROJECTION, CALCULATION เมื่ออนุมัติสูตรแล้ว.
- **Authority:** Clinical authority + Hospital lab/data owner + Customer/Product สำหรับ requiredness.
- **Security/privacy แยก:** clinical field allowlist, role and exact-scope disclosure.
- **Readiness:** CLINICAL_APPROVAL_BLOCKED + DATA_SOURCE_BLOCKED + REQUIREMENT_BLOCKED.
- **Safe next action:** เลือก mandatory fields และ source semantics ก่อน; ห้าม copy Before เป็น After หรือคำนวณ BMI/CVD.

### G18-04 — Actual activity observation และ Achievement

- **Linked decisions / rules:** R24A-D09 เป็นหลัก; D10/D12 รองรับความหมาย/missing; D06 สำหรับ period/stage; D11 สำหรับ overflow; D01–D03 เฉพาะเมื่อ population/grain ของ count จำเป็น. BR-03/04; CL-07.
- **Workbook mapping:** Dashboard ภาพรวม — Achieve Score, During 1–6. รายงานการจัดบริการ — Achieved Days และ Achievement Rate, Service 3–6; จำนวน Follow-up >70%. คำอธิบาย workbook อยู่ที่ รายงานการจัดบริการ!AK32.
- **Source ปัจจุบัน:** GoalPlan เก็บ targetDays/targetValue/targetUnit; Follow-up เก็บ categorical progress DONE/PARTIAL/NOT_DONE/NOT_APPLICABLE; PersonalExerciseEntry เป็น self-report ไม่มี Program linkage. ดู [schema](../../prisma/schema.prisma), [Goal service](../../src/modules/goals/services/goal-service.ts), [Follow-up service](../../src/modules/followups/services/followup-service.ts), [Exercise service](../../src/modules/exercises/services/personal-exercise-service.ts).
- **สิ่งที่ยังขาด:** authoritative actual achieved-day input, recorder/observer, observation period, GoalPlan version applicability, numerator/denominator, partial/NA/zero/null, rounding/revision และ >70 strictness/population/time boundary.
- **ชั้นงานเมื่ออนุมัติ:** DATA_CAPTURE, DOMAIN_MODEL, APPLICATION_SERVICE, CALCULATION, REPORTING_PROJECTION.
- **Authority:** Clinical authority + Data owner; Customer/Product อนุมัติ label/threshold และ use case.
- **Security/privacy แยก:** Program linkage/actor access, source provenance, self-vs-care disclosure.
- **Readiness:** REQUIREMENT_BLOCKED + CLINICAL_APPROVAL_BLOCKED + DATA_SOURCE_BLOCKED.
- **Safe next action:** ตอบ BR-04 เป็นข้อ ๆ และแยก fact collection จากสูตร; ห้าม derive จาก target/status หรือใช้ D08/G18-07 เป็น prerequisite.

### G18-05 — Structured outcome, plan adjustment และ obstacle

- **Linked decisions / rules:** R24A-D07/D09/D10/D12; BR-05–BR-07.
- **Source ปัจจุบัน:** Follow-up มี notes และ activity progress; GoalPlan มี round/source references; ไม่พบ controlled overall outcome, adjustment decision/applied event หรือ structured obstacle. ดู [schema](../../prisma/schema.prisma), [Follow-up service](../../src/modules/followups/services/followup-service.ts), [Goal service](../../src/modules/goals/services/goal-service.ts).
- **สิ่งที่ยังขาด:** vocabulary/owner/version, event meaning, actor, exact Follow-up/Plan linkage, timing, correction, unknown/no/NA; ยืนยันก่อนว่าทุก field เป็น customer requirement.
- **ชั้นงานเมื่ออนุมัติ:** DOMAIN_MODEL, DATA_CAPTURE, APPLICATION_SERVICE, REPORTING_PROJECTION.
- **Authority:** Clinical authority + Hospital operations + Product; Security/privacy หากเก็บ/แสดง narrative.
- **Security/privacy แยก:** free-text disclosure และ field access.
- **Readiness:** REQUIREMENT_BLOCKED + DATA_SOURCE_BLOCKED; CLINICAL_APPROVAL_BLOCKED สำหรับ clinical outcomes.
- **Safe next action:** แยก outcome, decision to adjust, applied Plan และ obstacle; ไม่ infer จาก free text, missing note หรือ Plan round.

### G18-06 — Service delivery เทียบกับ record presence

- **Linked decisions / rules:** R24A-D10; BR-02.
- **Source ปัจจุบัน:** มี Service 1/Goal/Follow-up records แต่ record presence ไม่พิสูจน์การส่งมอบ/เข้าร่วม/complete; PatientServiceRequest ใช้สถานะ request PENDING, APPROVED, REJECTED, STARTED, WITHDRAWN. ดู [schema](../../prisma/schema.prisma), [Service 1 service](../../src/modules/patient-program/services/patient-program-service-one-service.ts), [Phase 17E3](./PHASE_17E3_PATIENT_CORE_FLOW_GAP_CLOSURE.md).
- **สิ่งที่ยังขาด:** นิยามคำใน workbook, recorder/evidence/time ของ planned/started/delivered/participated/completed/NA/missing.
- **ชั้นงานเมื่ออนุมัติ:** DATA_CAPTURE, DOMAIN_MODEL, APPLICATION_SERVICE, REPORTING_PROJECTION.
- **Authority:** Customer/Product + Hospital operations + Clinical authority.
- **Security/privacy แยก:** actor authorization and access to resulting field.
- **Readiness:** REQUIREMENT_BLOCKED + DATA_SOURCE_BLOCKED.
- **Safe next action:** เลือกคำที่รายงานสื่อ; STARTED ของ PatientServiceRequest ไม่สร้าง Program และไม่พิสูจน์ Program service delivery.

### G18-07 — Classification และ cohort denominator

- **Linked decisions / rules:** R24A-D01/D03/D08/D14; CL-04.
- **Source ปัจจุบัน:** PatientClassification ปัจจุบันเป็น Patient-level RISK/DIABETES พร้อม history; getPatientClassificationCounts ตรวจ Hospital access และนับ PatientHospitalRelationship rows. ดู [schema](../../prisma/schema.prisma), [classification query](../../src/modules/patient-classification/services/patient-classification-query-service.ts).
- **สิ่งที่ยังขาด:** clinical definition/effective time, denominator, dedup, unclassified/correction, exact-Hospital population, snapshot/disclosure.
- **ชั้นงานเมื่ออนุมัติ:** DOMAIN_MODEL, APPLICATION_SERVICE, CALCULATION, REPORTING_PROJECTION, AUTHORIZATION.
- **Authority:** Clinical authority + Product/Data owner + Hospital operations; Security/privacy ทบทวน aggregate.
- **Security/privacy แยก:** exact scope, cross-Hospital isolation, small-count/aggregate disclosure, consistent snapshot.
- **Readiness:** CLINICAL_APPROVAL_BLOCKED + REQUIREMENT_BLOCKED + SECURITY_PRIVACY_BLOCKED.
- **Safe next action:** ตัดสิน clinical vocabulary และ denominator แยก; ห้ามใช้ RISK=Pre-DM หรือใช้ classification decision เป็น dependency ของ Achievement.

### G18-08 — Historical OSM responsibility attribution

- **Linked decisions / rules:** R24A-D05; BR-08.
- **Source ปัจจุบัน:** PatientOsmAssignment มี createdAt/endedAt; Appointment เก็บ assignment snapshot ตอนสร้าง; Program/Baseline/GoalPlan/Follow-up/Final เก็บ creator/recorder. ไม่มี Program/service responsibility link. ดู [schema](../../prisma/schema.prisma), [OSM assignment service](../../src/modules/patient-assignment/services/patient-osm-assignment-service.ts), [Phase 18B](./PHASE_18B_EXCEL_DATA_GAP_VERIFICATION.md).
- **สิ่งที่ยังขาด:** customer meaning ของ OSM, time window, responsibility vs recorder/deliverer และแหล่งข้อมูลย้อนหลัง.
- **ชั้นงานเมื่ออนุมัติ:** DOMAIN_MODEL, DATA_CAPTURE หากจำเป็น, APPLICATION_SERVICE, AUTHORIZATION, REPORTING_PROJECTION.
- **Authority:** Hospital operations + Product + Hospital data owner; Security/privacy สำหรับ disclosure.
- **Security/privacy แยก:** workforce PII และ exact-Hospital scope.
- **Readiness:** REQUIREMENT_BLOCKED + DATA_SOURCE_BLOCKED + SECURITY_PRIVACY_BLOCKED.
- **Safe next action:** ตัดสินก่อนว่าต้องแสดง OSM หรือไม่; อย่าสร้าง responsibility model จน requirement ยืนยัน.

### G18-09 — Existing source omitted from report projection

- **Linked decisions / rules:** R24A-D06/D07/D09/D12; CL-01/CL-06/CL-07.
- **Source ปัจจุบัน:** Baseline HbA1c/height/confidence, versioned ScreeningAssessment และ personal exercise duration มีบางส่วน แต่ไม่ครบ stage/linkage/clinical semantics; Program projection เป็น allowlist. ดู [Program report query](../../src/modules/reporting/services/program-report-query-service.ts), [Screening service](../../src/modules/screening/services/screening-service.ts), [Exercise service](../../src/modules/exercises/services/personal-exercise-service.ts).
- **สิ่งที่ยังขาด:** source-to-Program relation, stage, unit, actor, clinical interpretation และ permission ต่อ field; projection gap ไม่เท่ากับอนุญาตให้นำ field ออก.
- **ชั้นงานเมื่ออนุมัติ:** REPORTING_PROJECTION, AUTHORIZATION.
- **Authority:** Clinical/Data owner + Product; Security/privacy อนุมัติ field disclosure.
- **Security/privacy แยก:** field allowlist, SELF-vs-care boundary, exact scope.
- **Readiness:** REQUIREMENT_BLOCKED + CLINICAL_APPROVAL_BLOCKED + SECURITY_PRIVACY_BLOCKED.
- **Safe next action:** ยืนยันแต่ละ field จาก source เดิมก่อนเสนอ capture ใหม่; ไม่ promote Personal Wellness หรือ prototype screening JSON โดยอัตโนมัติ.

### G18-10 — Follow-up overflow และ workbook presentation

- **Linked decisions / rules:** R24A-D02/D11/D12/D13/D15; BR-04; G18-01 dependency for same population/snapshot.
- **Source ปัจจุบัน:** Follow-up persistence เป็น 0..N; workbook มีหก positions; report query มี pagination แต่ไม่มี approved XLSX layout/order.
- **สิ่งที่ยังขาด:** overflow option, missing labels, workbook compatibility/version, stable visible order/correlation.
- **ชั้นงานเมื่ออนุมัติ:** REPORTING_PROJECTION, UI_UX, EXPORT.
- **Authority:** Customer + Product Owner; Engineering เสนอ stable implementation ภายหลัง; Security/privacy สำหรับ withheld labels.
- **Security/privacy แยก:** safe missing presentation and shared snapshot across both worksheets/pages.
- **Readiness:** REQUIREMENT_BLOCKED + SECURITY_PRIVACY_BLOCKED.
- **Safe next action:** ตัดสินจาก synthetic workbook scenarios 0/1/6/7+; ห้ามแก้ customer workbookหรือ truncate records.

### G18-11 — Family delegated health data และ caregiver acceptance

- **Linked decisions / rules:** ไม่มี R24A-Dxx สำหรับ scope นี้; ใช้ Phase 17F decisions/gates เดิม.
- **Source ปัจจุบัน:** bounded family relationship และ appointment-read capability แยกเป็น exact PHR; ไม่ได้อนุมัติ broad health-plan/medication/care read. Real-data delegated deployment/UAT ยัง governance blocked. ดู [Phase 17F.1](./PHASE_17F1_FAMILY_CAREGIVER_RELATIONSHIP_SECURITY_FOUNDATION.md), [Phase 17F.2B](./PHASE_17F2B_DELEGATED_APPOINTMENT_READ_CONTRACT.md), [CONTEXT](../CONTEXT.md).
- **สิ่งที่ยังขาด:** resource-specific consent/capability, legal-representative/minor policy ที่อาจเกี่ยวข้อง, real-data governance และ device/UAT evidence.
- **ชั้นงานเมื่ออนุมัติ:** AUTHORIZATION, APPLICATION_SERVICE, UI_UX, UAT.
- **Authority:** Patient/privacy/security/Product; external controller ตาม governance.
- **Security/privacy แยก:** grant scope, revoke/expiry, PII, real-data approval.
- **Readiness:** REQUIREMENT_BLOCKED + SECURITY_PRIVACY_BLOCKED; external real-data use remains governance blocked.
- **Safe next action:** รักษา existing appointment-only boundary; ห้ามขยายให้ Family เห็น clinical report หรือใช้ OSM permission แทน.

### G18-12 — Optional Patient Service Request downstream orchestration

- **Linked decisions / rules:** CARE-07 bounded contract in Phase 17E3; ไม่มี R24A-Dxx หรือ BR/CL ที่กำหนด auto-transition.
- **Source ปัจจุบัน:** PatientServiceRequest มี PENDING, APPROVED, REJECTED, STARTED, WITHDRAWN; bounded request operations ไม่สร้าง PatientProgram หรือ PatientOsmAssignment; preferred OSM เป็น preference.
- **สิ่งที่ยังขาด:** หลักฐานว่าลูกค้าต้องการ orchestration; หากยืนยัน ต้องระบุ trigger, target operation, actor, idempotency, error/retry และ authorization.
- **ชั้นงานเมื่อยืนยัน requirement ภายหลัง:** APPLICATION_SERVICE, DOMAIN_MODEL, AUTHORIZATION, UAT.
- **Authority:** Customer/Product + Hospital operations.
- **Security/privacy แยก:** exact Hospital, Program creation authority, OSM assignment authority.
- **Readiness:** REQUIREMENT_BLOCKED (ยังไม่ใช่ confirmed runtime gap; ไม่ใช่ P0 obligation).
- **Safe next action:** คง bounded lifecycle ที่ยอมรับแล้ว; ไม่สร้าง transition หรือ decision ID จนมีคำขอที่ผูกพัน.

### G18-13 — Hospital responsibility area / Network reporting separation

- **Linked decisions / rules:** OWNER-01/AREA-01, HN-M07, HN-M08 และ RPT-24C; R24A-D01–D03 ไม่อนุญาต Network scope.
- **Source ปัจจุบัน:** Hospital parentHospitalId ไม่ใช่ responsibility-area domain; Network aggregate/report gates แยกจาก exact-Hospital patient access.
- **สิ่งที่ยังขาด:** responsibility-area semantics, historical reparent behavior, separate Network reporting/access/privacy approval.
- **ชั้นงานเมื่ออนุมัติ:** DOMAIN_MODEL, AUTHORIZATION, REPORTING_PROJECTION.
- **Authority:** Hospital/network governance + Product; Security/privacy/data controller.
- **Security/privacy แยก:** Network aggregation/disclosure, parent-child scope, HN-M07 and HN-M08 authorization.
- **Readiness:** REQUIREMENT_BLOCKED + SECURITY_PRIVACY_BLOCKED; HN-M08 remains DEFERRED / NOT AUTHORIZED.
- **Safe next action:** เก็บ semantics แยกจาก workbook ราย Hospital; ห้ามให้ parent Hospital อ่าน Patient ของ child จาก hierarchy.

### G18-14 — Manual acceptance / external verification evidence

- **Linked decisions / rules:** Phase 17 UAT handoffs และ existing accepted contracts; ไม่ใช่ R24A field decision.
- **Source ปัจจุบัน:** automated test/source evidence มีบางส่วนใน historical handoffs; ไม่มีหลักฐาน customer UAT หรือ real-world Hospital/provider/device verification สำหรับ flows ที่ระบุใน backlog.
- **สิ่งที่ยังขาด:** approved synthetic UAT environment, representative accounts/devices/provider setup ตาม flow, dated actor/result/readback evidence; customer sign-off.
- **ชั้นงาน:** UAT, EXTERNAL_INTEGRATION.
- **Authority:** Customer/Hospital operations สำหรับ manual acceptance; platform/provider owners สำหรับ external verification; privacy/security สำหรับ environment/data governance.
- **Security/privacy แยก:** synthetic data first; real patient data ห้ามใช้หากไม่มี governance approval.
- **Readiness:** READY_FOR_DESIGN_REVIEW สำหรับวาง evidence checklist เท่านั้น; **Acceptance:** MANUAL_UAT_PENDING / EXTERNAL_VERIFICATION_NOT_VERIFIED.
- **Safe next action:** ทำรายการ scenario/evidence ต่อ flow หลัง scope ได้รับอนุมัติ; automated PASS ห้ามแทน customer acceptance และไม่มีข้อสรุป production readiness.

## 3. วิธีคำนวณ readiness หลังมีคำตอบ

หลังได้รับ approval จริง ให้ประเมินเฉพาะ gap ที่ scope นั้นใช้:

- ย้ายจาก REQUIREMENT_BLOCKED เมื่อคำถามที่จำเป็นถูกตอบโดย authority ที่ถูกต้องและหลักฐานครบ.
- ย้ายจาก CLINICAL_APPROVAL_BLOCKED เมื่อ clinical meaning/formula/instrument/source version ได้รับอนุมัติพร้อม effective version และ validation examples.
- ย้ายจาก DATA_SOURCE_BLOCKED เมื่อ authoritative fact, ownership, actor, scope, event time, correction/history และ readback มีหลักฐาน; หาก source ใหม่จำเป็นต้องบันทึกเป็น approved capture requirement ก่อน design.
- ย้ายจาก SECURITY_PRIVACY_BLOCKED เมื่อ RPT-24C หรือ gate ที่เกี่ยวข้องอนุมัติ exact capability/scope/fields, snapshot, revocation/audit และ delivery ที่จำเป็น.
- ใช้ READY_FOR_DESIGN_REVIEW เฉพาะเมื่อ requirement สำหรับ design ของ gap นั้นครบแล้ว. ไม่ได้อนุมัติ migration, code, export หรือ production.
- ใช้ DEFERRED เฉพาะเมื่อ authority บันทึกการ defer จริง; requirement ที่ยังไม่มีคำตอบให้คง blocked.

อย่าทำให้ source gap กลายเป็น field ใหม่ก่อนถามว่า source เดิมเพียงพอหรือไม่. อย่าเริ่มสูตรก่อนมี approved inputs และ formula. ใช้ existing module operations เมื่อเหมาะสม; ไม่สร้าง generic reporting framework.

## 4. เกณฑ์เข้าสู่ Phase 18C.2

Phase 18C.2 สามารถรับช่วง decision closure และจัด design scope ราย gap ได้เมื่อ:

1. มี meeting responses จริงใน [Sign-off form](./PHASE_18C1_CUSTOMER_CLINICAL_SIGNOFF.md), ไม่ใช่เพียง candidate recommendation.
2. R24A-Dxx ที่ scope ต้องพึ่งมี exact approved wording, required authority ทั้งหมด, approver/evidence/date/scope/version/conditions; canonical status ได้รับการ update อย่างมีอำนาจ.
3. BR/CL dependencies ถูกปิดหรือแยกออกจาก scope อย่างชัดเจน; answer บางส่วนยังไม่ปลด blocker ที่เหลือ.
4. ทุก field ใน scope ระบุ source, owner, actor, Hospital/Program/Follow-up linkage, event-time meaning, unit, missing/correction expectations และรายงานว่า reuse/projection/capture/approved derivation แบบใด.
5. Security/privacy gates ที่จำเป็นต่อ design/export ถูกจัดเป็น dependency แยก; ไม่มี approval ทางธุรกิจหรือ clinical ที่ใช้แทนได้. HN-M08 ยังคง DEFERRED / NOT AUTHORIZED.
6. ระบุ acceptance scenarios และ evidence ที่ต้องเก็บหลัง implementation; ไม่ถือว่า UAT ได้ทำแล้ว.
7. มี implementation authorization แยกก่อนแก้ runtime/schema หรือสร้าง report/export. Decision ACCEPTED เพียงอย่างเดียวไม่ใช่การอนุญาตดังกล่าว.

การตัดสินใจที่ไม่เกี่ยวกับ work package หนึ่งไม่จำเป็นต้องขวาง design ของอีก package หากไม่มี dependency แต่ห้าม package ใดข้าม authorization/privacy gate ที่เกี่ยวข้อง. สถานะปัจจุบันยังไม่มี G18 item ใดได้รับการอนุมัติให้ implement.

## 5. สรุป gate ณ HEAD ที่ตรวจ

- **Business/clinical decisions:** D01–D15 ยัง PROPOSED; BR-01–BR-08 และ CL-01–CL-07 ยัง OPEN.
- **Data-source / projection:** G18-03–G18-09 มี source gaps, semantic gates หรือ projection work ที่ต้องประเมินหลัง decisions; ไม่มีการอนุมัติ data capture.
- **Export/security/privacy:** G18-01/G18-02/G18-07/G18-10 และ RPT-24C ยังคง blocked; ไม่มี export authorization.
- **Optional / deferred:** G18-12 downstream automation ไม่ใช่ confirmed requirement; G18-13 HN-M08 DEFERRED / NOT AUTHORIZED.
- **Acceptance:** G18-14 checklist design may proceed after scope confirmation; manual UAT pending, external provider/device verification not verified.
- **Implementation:** ไม่มี runtime, schema, migration, API, calculation, UI, export, deployment หรือ provider change ใน Phase 18C.1.

## Addendum — Phase 18C.1A Global Reporting dependencies

- **Source HEAD ที่ตรวจ:** main / 23dd09356db3c06e70507c0800b70f7923fcbfda
- **Product direction:** OWNER_RECEIVED ตามคำขอ 2026-10-10; อ้างอิง GR-REQ-01 (requirement reference only)
- **Global Patient access / export:** OPEN / SECURITY_PRIVACY_BLOCKED
- **Implementation:** NOT AUTHORIZED

ส่วนนี้ map Global reporting ไปยัง G18 ที่มีอยู่แล้ว. ไม่สร้าง G18-15, ไม่เปลี่ยน decision IDs และไม่แทน accepted boundary ด้วย dashboard requirement.

| Scope / existing gap | Current factual source / query | Missing projection or source | Required decisions / approvals | Readiness |
| --- | --- | --- | --- | --- |
| Hospital dashboard — G18-01, G18-02, G18-03, G18-04, G18-05, G18-06, G18-07, G18-08, G18-09, G18-10 | PatientHospitalRelationship, PatientProgram, Baseline, Classification, OSM assignment, Service 1, Goal Plan, Follow-up, Final; exact Program report projection | ไม่มี Hospital cohort dashboard; fields และ metric semantics ไม่ครบ; exact Program read ไม่ใช่ population query | R24A-D01–D15 คง PROPOSED; BR/CL ตาม fields; Hospital dashboard capability/field allowlist และ separate export gate | REQUIREMENT_BLOCKED + SECURITY_PRIVACY_BLOCKED; field-specific CLINICAL_APPROVAL_BLOCKED / DATA_SOURCE_BLOCKED |
| Global Level A overview — G18-01, G18-03, G18-04, G18-06, G18-07, G18-09 | Hospital.status, PatientHospitalRelationship, PatientProgram และ domain facts เป็น raw authoritative sources | ไม่มี Global aggregate projection; eligible Hospitals, dedup, denominator, time semantics, suppression และ freshness ยังไม่กำหนด | Global aggregate capability/scope + Product/Operations population decision + Privacy/Security review; clinical metrics ต้องผ่าน D06–D10/CL gates | REQUIREMENT_BLOCKED + SECURITY_PRIVACY_BLOCKED; DATA_SOURCE_BLOCKED เฉพาะ metric ที่ไม่มี source |
| Global Level B per-Hospital summary — G18-01, G18-07, G18-09 | Hospital governance directory และ exact-Hospital classification count query มีอยู่แต่ทำหน้าที่คนละอย่างกับ report | ไม่มี summary projection/compare query; current classification count เป็น relationship rows และไม่ใช่ approved DM/Pre-DM count | Hospital eligibility/status, common metric definitions, cross-Hospital dedup, suppression/differencing, field-free output | REQUIREMENT_BLOCKED + SECURITY_PRIVACY_BLOCKED; CLINICAL_APPROVAL_BLOCKED สำหรับ classification/achievement |
| Global Level C Patient discovery — G18-02, G18-08, G18-09 | Hospital Patient directory จำกัด exact Hospital; OSM directory จำกัด assigned relationships; Person identity อาจเชื่อมหลาย Hospital | ไม่มี Global directory policy/query; identity and discovery field allowlist, Hospital subset, purpose, audit, rate/resource bounds | Separate report:global:patient-directory:read candidate; Security/Privacy/Data Controller approval; R24A-D04–D05 ไม่ได้ปิด global grant | SECURITY_PRIVACY_BLOCKED + REQUIREMENT_BLOCKED |
| Global Level C Patient/Program detail — G18-02, G18-03, G18-05, G18-06, G18-08, G18-09 | Program report reads one exact Program using existing Program scope; policy test denies ADMIN-only | ไม่มี Global access resolver/policy; existing projection is limited; several clinical fields are missing/not projected | Separate detail capability, exact Hospital+relationship+Program grant, minimum fields, purpose, revocation, audit, privacy/Data Controller and clinical approval where applicable | SECURITY_PRIVACY_BLOCKED + CLINICAL_APPROVAL_BLOCKED + DATA_SOURCE_BLOCKED as applicable |
| Global export / download — existing G18-01/G18-10 and RPT-24C | No export endpoint/capability or coherent cross-sheet snapshot | No approved Global export contract | Separate scope/actor/field/snapshot/delivery/audit approvals; RPT-24 D01 exact-Hospital scope unchanged | SECURITY_PRIVACY_BLOCKED; NOT AUTHORIZED |
| Hospital Network separation — G18-13 | HN-C0/HN-C1 documentation defines Parent Owner aggregate scope; implementation not authorized | No Patient-level Network scope | HN-M07/history gates remain open; HN-M08 remains DEFERRED / NOT AUTHORIZED | DEFERRED for HN-M08; no dependency transfer to Global |
| Manual acceptance — G18-14 | Current source/test files provide implementation evidence for existing modules | No customer Global/Hospital dashboard UAT or access-policy approval | After requirements and security scope close, prepare synthetic acceptance evidence and customer/Hospital review | READY_FOR_DESIGN_REVIEW for checklist preparation only; MANUAL_UAT_PENDING |

### Global design review vs implementation gate

การเตรียม **แยก architecture scope** เป็น READY_FOR_DESIGN_REVIEW ได้: Global aggregate, per-Hospital summary และ Patient detail ต้องเป็น capability/scope คนละระดับ และ Patient detail เป็น entitlement แยก. สถานะนี้อนุญาตให้ review ตัวเลือก policy เท่านั้น.

ไม่มี Global summary, Hospital dashboard หรือ Patient drill-down ใด READY_FOR_IMPLEMENTATION. Role.ADMIN alone ยังคง DENY. ห้ามนำ source availability, existing exact-Program permission, Parent Hospital ownership หรือ HN Network scope มาแทน Global authorization approval.

### Dependency sequencing

1. ใช้ GR-REQ-01 เป็น product-direction evidence; เก็บ customer answers ของ R24A-D01–D15 โดยไม่สร้าง D16.
2. ปิด BR/CL ที่เป็น dependency ของแต่ละ metric; ห้ามคำนวณเมื่อ formula, units, denominator หรือ event meaning ยัง open.
3. ทำ Global Reporting security/privacy contract แยกจาก RPT-24 exact-Hospital export และ HN-C0/HN-C1. เก็บ explicit field allowlist, purpose, grant, scope, revocation, audit, cache/search และ Data Controller evidence.
4. จึงออกแบบ projection/query ตาม authoritative existing sources; เสนอ capture ใหม่เฉพาะ field ที่ยืนยันแล้วว่าขาดจริง.
5. ขอ implementation authorization แยกก่อน runtime/schema/UI/export work. UAT ต้อง synthetic-first; ไม่มี production access จากเอกสารนี้.
