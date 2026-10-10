# Phase 18C.1 — ทะเบียนทบทวน Business และ Clinical Decisions

- **ผล Phase:** PHASE 18C.1 — DECISION REVIEW READY / CUSTOMER & CLINICAL SIGN-OFF PENDING
- **Source HEAD ที่ตรวจ:** main / 302acaec724ca14e60a9243a333bf235241ebb42
- **สถานะเอกสาร:** เตรียมทะเบียนและหลักฐานสำหรับการทบทวน ไม่ใช่การอนุมัติ requirements หรือ implementation
- **วันที่ตรวจ:** 2026-10-10

ทะเบียนนี้ใช้ R24A-D01–D15 เป็น Decision ID เดิมตาม [RPT-24A](./PHASE_17_RPT24A_CUSTOMER_WORKBOOK_DECISION_PACK.md) ไม่สร้าง namespace ซ้ำ ส่วน BR-01–BR-08 และ CL-01–CL-07 เป็น topic references และ G18-01–G18-14 เป็น gap references เท่านั้น

## 1. สถานะและหลักเกณฑ์การบันทึก

| สถานะที่ใช้ | ความหมาย |
| --- | --- |
| OPEN | ยังไม่มีคำตอบที่จำเป็นจากผู้มีอำนาจ |
| PROPOSED | มีตัวเลือกหรือ candidate direction แต่ยังไม่มี approval ที่ผูกพัน |
| PARTIALLY_CONFIRMED | มีผู้มีอำนาจยืนยันบางส่วน แต่ยังขาด authority, scope, condition หรือหลักฐานที่ต้องมี |
| OWNER_RECEIVED | ได้รับทิศทางจาก Product Owner/requester แล้ว แต่ยังไม่ครบ clinical, privacy, security หรือ authority อื่นที่ต้องอนุมัติ |
| ACCEPTED | อนุมัติถ้อยคำเฉพาะโดย authority ครบ พร้อมผู้อนุมัติ วันที่ ขอบเขต รุ่น/วันที่มีผล และหลักฐานอ้างอิง |
| DEFERRED | authority เลื่อนการตัดสินใจโดยชัดแจ้ง พร้อมบันทึกผลและ release gate |
| BLOCKED | dependency หรือความขัดแย้งระหว่าง authority ทำให้ตัดสินต่อไม่ได้ |

RPT-24A ใช้คำเดิมว่า **PROPOSED FOR REQUESTER / CUSTOMER REVIEW** สำหรับ D01–D15; ตารางด้านล่าง map เป็น **PROPOSED** โดยคงคำเดิมเป็น canonical provenance และไม่แก้ RPT-24A. ณ HEAD ที่ตรวจ ไม่พบหลักฐานอนุมัติใหม่หรือบันทึกคำตอบจาก workshop; D01–D15 จึงยัง PROPOSED ไม่ใช่ ACCEPTED. ข้อเท็จจริงจาก source, test PASS, คำแนะนำของ Phase 18C.0 หรือเอกสารพร้อมประชุมไม่ใช่ approval.

การปิด decision ต้องบันทึกใน [แบบลงนาม](./PHASE_18C1_CUSTOMER_CLINICAL_SIGNOFF.md) อย่างน้อย: ID, ถ้อยคำที่อนุมัติ, ตัวเลือก, authority และผู้อนุมัติ, วันที่, evidence reference, scope, version/effective date, conditions และ dependencies. หากมีคำตอบจาก authority เดียวแต่ยังต้องมีอีก authority ให้ใช้ OWNER_RECEIVED หรือ PARTIALLY_CONFIRMED ตามหลักฐาน; ห้ามยกระดับเป็น ACCEPTED.

สถานะ ACCEPTED ไม่ได้อนุมัติ implementation. การอนุมัติ clinical/business ไม่ได้ปิด RPT-24C security/privacy, authorization, snapshot, revocation, audit หรือ delivery gates.

## 2. สรุป approval evidence และ provenance

- [RPT-24A §13](./PHASE_17_RPT24A_CUSTOMER_WORKBOOK_DECISION_PACK.md) ระบุ D01–D15 เป็น PROPOSED FOR REQUESTER / CUSTOMER REVIEW; ไม่พบ closure record ที่ใหม่กว่ามาแทนสถานะนี้.
- RPT-24A ระบุ header source HEAD เป็น ba49040c7a674008a10493ae5cf5c7a99b7e6bfc ซึ่งเป็น historical preflight provenance. ปัจจุบัน main อยู่ที่ 302acaec724ca14e60a9243a333bf235241ebb42 และมี Phase 18A+B, Phase 18C.0 รวมถึงการแก้ mapping AK32 แล้ว. สถานะ proposal ของ D01–D15 ได้รับการตรวจซ้ำจาก RPT-24A และ Phase 18C.0 ที่ใหม่กว่า; ไม่ได้ตีความ header เก่าว่าเป็น current HEAD และไม่เขียนทับประวัติเดิม.
- [Phase 18C.0](./PHASE_18C0_BUSINESS_CLINICAL_DECISION_PACK.md), [Data Capture Matrix](./PHASE_18C0_DATA_CAPTURE_READINESS_MATRIX.md), [Workshop & Acceptance](./PHASE_18C0_CUSTOMER_WORKSHOP_AND_ACCEPTANCE.md) ให้ข้อเสนอและคำถาม แต่ไม่ได้บันทึกผลประชุมหรือ approval.
- [RPT-24](./PHASE_17_RPT24_ON_DEMAND_ASOF_EXCEL_EXPORT_CONTRACT.md) ยืนยัน on-demand factual progress reporting requirement; นั่นไม่เท่ากับอนุมัติ population, row grain, field disclosure หรือ export authorization.
- CARE-07 ใน [Phase 17E3](./PHASE_17E3_PATIENT_CORE_FLOW_GAP_CLOSURE.md) ยืนยัน bounded Patient Service Request lifecycle; ไม่กำหนด downstream automatic Program/OSM assignment.
- Accepted authorization boundaries ยังคงตาม [ADR-0002](../adr/0002-role-capability-scope-authorization.md), Hospital verification ตาม [ADR-0003](../adr/0003-hospital-led-onboarding.md), และ transaction invariant ตาม [ADR-0006](../adr/0006-transactional-business-operations.md).
- [RPT-24C gates](./PHASE_17_RPT24_ON_DEMAND_ASOF_EXCEL_EXPORT_CONTRACT.md) ยังต้องมี Security/privacy/Architecture review แยก. HN-M08 Network Export คง DEFERRED / NOT AUTHORIZED.

### Evidence index สำหรับ current source behavior

| ขอบเขต | Current source ที่ตรวจ |
| --- | --- |
| Population, Program lifecycle และ report readback | [Prisma schema](../../prisma/schema.prisma): PatientHospitalRelationship, PatientProgram; [Program report query](../../src/modules/reporting/services/program-report-query-service.ts): getProgramReportingProjection; [projection](../../src/modules/reporting/projections/program-report-projection.ts); [report access service](../../src/modules/reporting/services/program-report-access-service.ts) |
| Baseline / Final | [Baseline service](../../src/modules/patient-baseline/services/patient-baseline-service.ts), [Baseline query](../../src/modules/patient-baseline/services/patient-baseline-query-service.ts), [Final Assessment service](../../src/modules/patient-final-assessment/services/patient-final-assessment-service.ts), schema models PatientBaseline / PatientFinalAssessment |
| Goal Plan / Follow-up / activity progress | [Goal service](../../src/modules/goals/services/goal-service.ts), [Follow-up service](../../src/modules/followups/services/followup-service.ts), schema models PatientGoalPlan, PatientGoalItem, PatientFollowup, PatientFollowupActivityProgress |
| Screening / personal exercise | [Screening service](../../src/modules/screening/services/screening-service.ts), [Personal exercise service](../../src/modules/exercises/services/personal-exercise-service.ts), [SELF policy](../../src/modules/exercises/policies/personal-exercise-policy.ts) |
| Classification / Hospital counts | [Classification service](../../src/modules/patient-classification/services/patient-classification-service.ts), [classification query/count service](../../src/modules/patient-classification/services/patient-classification-query-service.ts) |
| Mapping ที่ยืนยันจาก workbook | [RPT-24A §6 และ §13](./PHASE_17_RPT24A_CUSTOMER_WORKBOOK_DECISION_PACK.md), [customer workbook](../Dashboard%20App%20Demi.xlsx), [Phase 18B source index](./PHASE_18B_EXCEL_DATA_GAP_VERIFICATION.md) |

## 3. Decision register

### A. Workbook population และ identity — D01–D05

#### R24A-D01 — Hospital population และ eligibility

- **คำถาม / workbook:** Hospital และ Patient Program ใดเข้า Dashboard counts และทั้งสอง worksheets; relationship ที่มีสิทธิ์เข้า population หมายถึงอะไร?
- **BR/CL/G18:** CL-04; G18-01, G18-07. **Current source:** Hospital relationship มี Hospital scope; Program มี ACTIVE/COMPLETED lifecycle; count query ปัจจุบันนับ relationship rows. ไม่มี export population contract.
- **ขอบเขตที่รับรองแล้ว:** RPT-24 เป็น on-demand factual progress requirement. **ยังไม่รับรอง:** inclusion, relationship eligibility, date filter หรือ denominator.
- **ตัวเลือก:** exact Hospital ที่ผู้ใช้มีสิทธิ์และเกณฑ์ relationship ที่ยืนยัน; จำกัดเฉพาะ relationship ปัจจุบัน; หรือรวม historical relationship ภายใต้เกณฑ์ที่ระบุ. Candidate ใน RPT-24A คือ exact Hospital และไม่ตั้ง date cycle โดยปริยาย; ต้องให้ customer/operations ยืนยัน.
- **Approver / status / evidence:** Customer/Requester + Product Owner + Hospital operations; Security/privacy ทบทวน scope. **PROPOSED** (canonical: PROPOSED FOR REQUESTER / CUSTOMER REVIEW); approval evidence: NOT PROVIDED.
- **ยังขาด / dependency:** eligibility, ACTIVE/COMPLETED inclusion, date boundary, denominator; ต้องแยก authorization/snapshot ใน RPT-24C.
- **ผล / fallback / next action:** หากไม่ปิด ห้ามสร้าง cohort count/export; ใช้ exact Hospital boundary กับข้อมูลที่มีสิทธิ์ตามระบบเท่านั้นและไม่แสดงยอด workbook. ขอคำตอบเรื่อง population ก่อนออกแบบ report population.

#### R24A-D02 — Row grain

- **คำถาม / workbook:** หนึ่งแถวแทน Patient, Patient Program หรือ Follow-up เมื่อคนหนึ่งมีหลาย Program?
- **BR/CL/G18:** BR-01; G18-01, G18-10. **Current source:** Program/Follow-up ผูก Hospital relationship/Program และมีหลาย Program ได้.
- **ขอบเขตที่รับรองแล้ว:** records มี exact Program linkage; ไม่มี customer-approved workbook row grain.
- **ตัวเลือก:** หนึ่งแถวต่อ Patient Program (candidate RPT-24A); หนึ่งแถวต่อ Patient พร้อมการรวมข้อมูล; หรือรายละเอียดระดับ Follow-up ซึ่งเปลี่ยนรูปแบบรายงาน.
- **Approver / status / evidence:** Customer + Product Owner; **PROPOSED**; evidence NOT PROVIDED.
- **ยังขาด / dependency:** วิธีแยกหลาย Program ในแถว/ชีต; D01 และ D03.
- **ผล / fallback / next action:** การรวมหลาย Program เสี่ยงเอา stage/ผลมาปะปน; ไม่อนุมัติการรวมข้อมูลจนกำหนด grain. ให้ customer เลือกแถวตัวอย่างแบบ synthetic.

#### R24A-D03 — Program/Hospital isolation

- **คำถาม / workbook:** เมื่อ Patient เดียวมีหลาย Program หรือมีความสัมพันธ์กับหลาย Hospital แต่ละ report แสดงข้อมูลใดได้?
- **BR/CL/G18:** BR-01, CL-04; G18-01, G18-07. **Current source:** report access ใช้ Program/relationship scope; Patient relationship เป็น Hospital-local.
- **ขอบเขตที่รับรองแล้ว:** Parent/child Hospital relationship ไม่ให้ clinical Patient access; global Person join ไม่ทำให้ Hospital หนึ่งอ่านอีก Hospital ได้ ตาม ADR-0002 และ architecture baseline.
- **ตัวเลือก:** แยกข้อมูลทุก Hospital relationship และ Program ตาม scope; ไม่ deduplicate ข้าม Hospital. Candidate นี้สอดคล้อง boundary เดิม; customer ยืนยัน row handling, Security ยืนยัน disclosure.
- **Approver / status / evidence:** Product Owner + Hospital operations + Security/privacy; **PROPOSED**; evidence NOT PROVIDED.
- **ยังขาด / dependency:** row grain และ authorization ของ report ต้องแยกจากกัน; D01/D02 และ RPT-24C.
- **ผล / fallback / next action:** ห้าม cross-Hospital aggregation หรือเปิด Patient-level data จาก Network; ยืนยันตัวอย่าง multi-Hospital ก่อน design.

#### R24A-D04 — Patient identifier ที่แสดง

- **คำถาม / workbook:** ช่อง Patient ID ต้องใช้รหัสใด และถ้าไม่มีรหัสให้แสดงอย่างไร?
- **BR/CL/G18:** ไม่มี BR/CL โดยตรง; G18-02. **Current source:** hospitalNumber เป็น Hospital-local และ nullable; UUID เป็น internal identifier.
- **ขอบเขตที่รับรองแล้ว:** ไม่มี UUID fallback หรือการสร้าง display ID โดยอนุมาน.
- **ตัวเลือก:** hospitalNumber เมื่อ data owner ยืนยันความหมาย; blank/approved label เมื่อไม่มีค่า; omit ID field หรือกำหนด customer-facing identifier ใหม่ผ่าน requirement แยก.
- **Approver / status / evidence:** Customer + Product Owner + Hospital data owner; Security/privacy อนุมัติ disclosure. **PROPOSED**; evidence NOT PROVIDED.
- **ยังขาด / dependency:** ความหมาย business ID, uniqueness และ missing presentation; D01/D02/D12 และ RPT-24C.
- **ผล / fallback / next action:** ID column ยังไม่พร้อม; ขอ Hospital data owner ยืนยันความหมายและ customer ยืนยันการใช้งาน.

#### R24A-D05 — Patient name และ OSM attribution

- **คำถาม / workbook:** จะแสดงชื่อ Patient หรือ OSM หรือไม่; ชื่อ OSM หมายถึงผู้รับผิดชอบปัจจุบัน, ผู้ได้รับมอบหมายในอดีต, ผู้บันทึก หรือผู้ให้บริการ?
- **BR/CL/G18:** BR-08; G18-02, G18-08. **Current source:** Patient/OSM identity มี; PatientOsmAssignment บันทึกช่วง assignment แต่ Program/service ไม่ผูก historical care responsibility. ผู้บันทึกเป็นอีก actor.
- **ขอบเขตที่รับรองแล้ว:** current assignment ≠ historical care attribution; Hospital OWNER ≠ Platform ADMIN; OSM assignment เป็น access boundary ไม่ใช่ข้อพิสูจน์ว่าให้บริการ.
- **ตัวเลือก:** แสดงชื่อที่อนุมัติ; แสดง OSM current-at-report พร้อม label; omit OSM จนมี historical provenance; หรือเก็บ historical responsibility เมื่อ customer ยืนยันว่าจำเป็นและมี authoritative source.
- **Approver / status / evidence:** Customer + Product Owner + Hospital operations/data owner; Security/privacy แยก. **PROPOSED**; evidence NOT PROVIDED.
- **ยังขาด / dependency:** ความหมาย, effective-time, provenance, disclosure. BR-08 และ RPT-24C.
- **ผล / fallback / next action:** ห้าม attribution ย้อนหลังจาก assignment ปัจจุบันหรือ recorder; ทบทวนตัวอย่างการ reassignment แบบ synthetic.

### B. Clinical / business meaning — D06–D10

#### R24A-D06 — Before / During / After และเวลา

- **คำถาม / workbook:** Before, During และ After สื่อถึงการวัด/บริการช่วงใด; ใช้วันใดเป็นวันสังเกตการณ์?
- **BR/CL/G18:** BR-01, BR-03; CL-01, CL-02, CL-06, CL-07; G18-03, G18-04, G18-09. **Current source:** Baseline.recordedOn เป็นวันที่ที่จัดเก็บแต่ยังต้องยืนยันว่าเป็นวันวัดจริง; Program.startedAt/completedAt เป็น lifecycle; Appointment.scheduledAt เป็นเวลานัด; Follow-up/FinalAssessment.recordedAt และ createdAt เป็นเวลาบันทึก/สร้าง record; ยังไม่มีหลักฐานว่า timestamp เหล่านี้คือวัน encounter หรือวันส่งมอบ service.
- **ขอบเขตที่รับรองแล้ว:** Program completion ไม่ใช่ clinical success; Final Assessment ไม่เท่ากับ completion; recordedAt/createdAt ไม่พิสูจน์ encounter date.
- **ตัวเลือก:** คงชื่อ Baseline/Follow-up/Final ตาม source; ใช้ Before/During/After หลัง clinical mapping; หรือใช้ field subset ที่มี observation date ชัดและ omit ที่เหลือ.
- **Approver / status / evidence:** Customer/Product + Clinical authority + Data owner. **PROPOSED**; evidence NOT PROVIDED.
- **ยังขาด / dependency:** stage mapping, encounter date source, requiredness ต่อ field, per-Program linkage; D07/D09/D12.
- **ผล / fallback / next action:** แสดงเฉพาะ stage/source ที่ไม่ทำให้เข้าใจผิด; ไม่แทนวันตรวจด้วย Program start หรือ record timestamp. ขอ timeline ที่ clinical authority อนุมัติ.

#### R24A-D07 — Field coverage และการยอมรับ omission

- **คำถาม / workbook:** รายงานรุ่นแรกต้องครบทุก field หรือยอมรับ omission ที่ระบุชัดได้; field ใดเป็น mandatory ต่อแต่ละ worksheet?
- **BR/CL/G18:** BR-01/04; CL-01–CL-07; G18-03/G18-09. **Current source:** มีบาง raw facts แต่ projection/clinical semantics ไม่ครบ; HbA1c After, CVD, illness onset และ BMI facts ที่ยืนยันแล้วไม่ครบ.
- **ขอบเขตที่รับรองแล้ว:** ห้ามแทนค่า missing ด้วยข้อมูลข้าม stage/สูตรที่ไม่อนุมัติ; RPT-24A ไม่อ้าง full coverage.
- **ตัวเลือก:** bounded factual subset พร้อมระบุ omission; รอทุก mandatory field; หรือแยก version ตาม worksheet/field ที่ได้รับอนุมัติ.
- **Approver / status / evidence:** Customer + Product Owner; Clinical/Data authority อนุมัติ field semantics. **PROPOSED**; evidence NOT PROVIDED.
- **ยังขาด / dependency:** mandatory field list ต่อ worksheet, clinical owner/source, missing presentation; D06/D09/D12.
- **ผล / fallback / next action:** ห้ามอ้าง report ครบเทียบ workbook จนปิด scope; review รายการต่อ worksheet จาก RPT-24A mapping.

#### R24A-D08 — DM/Pre-DM และ cohort denominator

- **คำถาม / workbook:** DM/Pre-DM ใช้นิยาม/source ใด; จำนวนเป็นราย Patient, Hospital relationship หรือ Program และนับ ณ เวลาใด?
- **BR/CL/G18:** CL-04; G18-07. **Current source:** PatientClassification current enum เป็น RISK/DIABETES พร้อม history; query นับ Hospital relationship rows.
- **ขอบเขตที่รับรองแล้ว:** RISK ≠ Pre-DM และ DIABETES ≠ DM โดยอัตโนมัติ; current classification ไม่ใช่ Program-time clinical diagnosis.
- **ตัวเลือก:** งดแสดงจนมีนิยาม; แสดง raw classification ด้วยชื่อ source เดิมหากลูกค้ารับรองว่าใช่; หรือกำหนด clinical vocabulary, effective time และ denominator ที่ clinical/data authority รับรอง.
- **Approver / status / evidence:** Clinical authority + Product/Data owner + Hospital operations; Security/privacy ทบทวน aggregate disclosure. **PROPOSED**; evidence NOT PROVIDED.
- **ยังขาด / dependency:** นิยาม, authority, effective date, unclassified/correction, dedup, scope; D01/D03/D12/D14.
- **ผล / fallback / next action:** ไม่แสดง DM/Pre-DM counts. รับรองคำจำกัดความและ denominator ใน workshop; ห้ามใช้เป็น dependency ของ achievement score (D09/G18-04).

#### R24A-D09 — Derived scores, Achievement และ >70%

- **คำถาม / workbook:** ต้องการ BMI, CVD Risk, Achieve Score, Achieved Days, Achievement Rate และจำนวน Follow-up ที่เกิน 70% ตามนิยามใด?
- **Workbook mapping:** Dashboard ภาพรวมมี Achieve Score ใน During 1–6; รายงานการจัดบริการมี Achieved Days และ Achievement Rate ใน Service 3–6 และ count of Follow-ups >70%; คำอธิบาย Achieve Score อยู่ที่ รายงานการจัดบริการ!AK32.
- **BR/CL/G18:** BR-04; CL-02/03/07; G18-03/G18-04. **Current source:** GoalPlan เก็บ targets; Follow-up activity progress เป็น DONE/PARTIAL/NOT_DONE/NOT_APPLICABLE; ไม่มี achieved-day numeric observation, denominator หรือ accepted score.
- **ขอบเขตที่รับรองแล้ว:** target ≠ actual; categorical status ≠ achieved day/rate. D08/G18-07 ไม่ใช่ prerequisite ของ achievement.
- **ตัวเลือก:** งดตัวเลขจน approved source/rule; เก็บ factual observation ที่ authority ยืนยันแล้วและคำนวณภายหลังจาก signed formula; หรือยอมรับ score ที่ authoritative external source ส่งมา.
- **Approver / status / evidence:** Clinical authority + Data owner + Product Owner; Customer ยืนยันความหมาย/threshold. **PROPOSED**; evidence NOT PROVIDED.
- **ยังขาด / dependency:** activity day, period, numerator/denominator, partial/NA/zero/null, revision, rounding, >70 strictness/population/time boundary; D06/D10/D12, D01–D03 เฉพาะเมื่อจำเป็นต่อ population.
- **ผล / fallback / next action:** ไม่คำนวณ Achieved Days/Rate/>70 หรือ BMI/CVD; ตัดสิน data collection และ formula แยกกันโดยเริ่มจากคำถาม W6.

#### R24A-D10 — Service completeness และ outcome meaning

- **คำถาม / workbook:** “ทำแล้ว/ครบ”, ผลลัพธ์, ปรับแผน และอุปสรรค หมายถึงบันทึก, เริ่มบริการ, ส่งมอบ, เข้าร่วม หรือ outcome ใด?
- **BR/CL/G18:** BR-02–BR-07; CL-06; G18-05/G18-06. **Current source:** Service 1 records, GoalPlan and Follow-up exist; Follow-up has notes/status; no authoritative service-delivery/completeness, structured outcome, adjustment-decision or obstacle event.
- **ขอบเขตที่รับรองแล้ว:** record presence ≠ delivered/completed; PatientServiceRequest.STARTED เป็น request state; Program COMPLETED ไม่ใช่ clinical success.
- **ตัวเลือก:** report only source-record presence; approve a controlled service status/event; separate operational from clinical outcome; omit unstructured fields.
- **Approver / status / evidence:** Customer/Product + Hospital operations + Clinical authority. **PROPOSED**; evidence NOT PROVIDED.
- **ยังขาด / dependency:** vocabulary, event owner, timing, exact Program/Follow-up linkage, correction, unknown/NA; D07/D12.
- **ผล / fallback / next action:** ห้าม infer จาก free text, Plan round, note absence หรือ status; ให้ operations/clinical authority กำหนดคำที่รายงานสื่อ.

### C. Missing values, workbook behavior และ timing — D11–D15

#### R24A-D11 — Follow-up overflow

- **คำถาม / workbook:** เมื่อมี Follow-up มากกว่า 6 รายการจะคงครบทุก record อย่างไร?
- **BR/CL/G18:** BR-04; G18-04/G18-10. **Current source:** persistence เป็น 0..N; workbook แสดง 6 positions.
- **ขอบเขตที่รับรองแล้ว:** หกช่องไม่ใช่ persistence limit; ห้าม truncate เงียบ.
- **ตัวเลือก:** summary สองชีตพร้อม detail sheet (candidate ใน RPT-24A); ขยาย rows; หรือปฏิเสธรายงานเมื่อเกินขีดจำกัดที่ตกลง.
- **Approver / status / evidence:** Customer + Product Owner. **PROPOSED**; evidence NOT PROVIDED.
- **ยังขาด / dependency:** วิธีครบถ้วน, correlation, ordering, formula count unit; D02/D09/D13/D15 และ RPT-24C snapshot.
- **ผล / fallback / next action:** ยังไม่มี export/layout; ทำ synthetic review 0, 1, 6, 7+ หลังเลือก option.

#### R24A-D12 — Missing, zero, unknown, NA และ withheld

- **คำถาม / workbook:** แยกค่าศูนย์จริง, ไม่มี record, null, unknown, not applicable และ withheld อย่างไรโดยไม่เปิดเผยข้อมูลที่ไม่มีสิทธิ์?
- **BR/CL/G18:** BR-04/05/07; CL-01–CL-07; G18-02/G18-03/G18-04/G18-05/G18-10.
- **ขอบเขตที่รับรองแล้ว:** ห้ามแทน missing ด้วย zero, ค่าเดิม หรืออนุมาน; ห้ามใช้ข้อความที่เปิดเผยการมีอยู่ของข้อมูล withheld.
- **ตัวเลือก:** blank; approved Thai marker สำหรับ missing ที่เปิดเผยได้; หรือ omit column เมื่อไม่ปลอดภัย.
- **Approver / status / evidence:** Customer/Product + Data owner; Security/privacy ต้องอนุมัติ disclosure. **PROPOSED**; evidence NOT PROVIDED.
- **ยังขาด / dependency:** per-field state semantics และ disclosure-safe labels; D07/D09 และ RPT-24C.
- **ผล / fallback / next action:** ไม่สร้าง presentation rule; อนุมัติ label matrix ต่อ source state และ privacy review ก่อนออกแบบ.

#### R24A-D13 — Workbook compatibility

- **คำถาม / workbook:** ต้องรักษาแบบเดิมแค่ไหน; ยอมรับเพิ่ม worksheet/เปลี่ยน layout หรือ version ได้หรือไม่?
- **BR/CL/G18:** ไม่มี BR/CL โดยตรง; G18-10.
- **ขอบเขตที่รับรองแล้ว:** workbook ปัจจุบันเป็น customer evidence; ไม่ได้อนุมัติการแก้ template หรือ export implementation.
- **ตัวเลือก:** versioned workbook ที่ใช้งานเทียบเท่าและคงสองชีต; ทำซ้ำให้เหมือนเดิม; หรือเปลี่ยน layout/เพิ่ม Follow-up detail sheet เมื่อจำเป็น.
- **Approver / status / evidence:** Customer + Product Owner. **PROPOSED**; evidence NOT PROVIDED.
- **ยังขาด / dependency:** ความเข้ากันได้, consumer/downstream macros, versioning; D11/D12/D15.
- **ผล / fallback / next action:** ไม่แก้ workbook; ขอผู้ใช้จริงระบุสิ่งที่ต้องคงไว้และตรวจตัวอย่างก่อนยอมรับ.

#### R24A-D14 — Requested, snapshot และ generated time

- **คำถาม / workbook:** ต้องแสดงเวลาใดและใช้ label ใด?
- **BR/CL/G18:** BR-01; G18-01/G18-07. **Current source:** ไม่มี export snapshot record/endpoint; source reads หลายชุด.
- **ขอบเขตที่รับรองแล้ว:** requestedAt, dataAsOf/snapshot boundary และ generatedAt เป็นคนละแนวคิด; request time ไม่พิสูจน์ data snapshot.
- **ตัวเลือก:** แสดง Data As-of เมื่อพิสูจน์ boundary; แสดง request/generated time แยก; หรือละ metadata ที่ไม่มีหลักฐาน.
- **Approver / status / evidence:** Customer/Product สำหรับ label; Architecture/DB + Security/privacy สำหรับกลไก/หลักฐาน. **PROPOSED**; evidence NOT PROVIDED.
- **ยังขาด / dependency:** coherent snapshot contract, revocation, multi-sheet/count consistency; RPT-24C; D01/D02.
- **ผล / fallback / next action:** ห้ามส่ง real export หรือแสดง timestamp ที่สื่อ snapshot โดยไม่มี proof; ให้ Architecture/Security ทำ review แยกหลัง business label ชัด.

#### R24A-D15 — Stable ordering

- **คำถาม / workbook:** เรียง rows และจับคู่ข้าม worksheets อย่างไรเมื่อชื่อซ้ำหรือไม่มี ID?
- **BR/CL/G18:** ไม่มี BR/CL โดยตรง; G18-01/G18-10. **Current source:** query มี deterministic Program/Follow-up order สำหรับ source read; customer-facing order ยังไม่ตกลง.
- **ขอบเขตที่รับรองแล้ว:** internal UUID ไม่ใช่ display ID; stable output ต้องไม่พึ่งชื่อเพียงอย่างเดียว.
- **ตัวเลือก:** customer-friendly name/ID + Program date; chronological Program ordering; หรือ customer-defined order. Engineering เพิ่ม deterministic tie-breaker ได้เมื่อ semantic order ได้รับอนุมัติ.
- **Approver / status / evidence:** Customer + Product Owner; Engineering ยืนยัน stable mechanism. **PROPOSED**; evidence NOT PROVIDED.
- **ยังขาด / dependency:** D01/D02/D04/D11/D13; RPT-24C snapshot.
- **ผล / fallback / next action:** ไม่ประกาศ customer ordering; ขอ customer จัดลำดับตัวอย่าง synthetic แล้วตรวจ stable rerun ภายหลัง.

## 4. Business rule review — BR-01–BR-08

รายละเอียดตัวเลือกอยู่ใน [Phase 18C.0 Decision Pack](./PHASE_18C0_BUSINESS_CLINICAL_DECISION_PACK.md); ตารางนี้บันทึกสิ่งที่ต้องปิดเพื่อให้คำตอบตรวจสอบได้.

| Topic | ข้อเท็จจริงปัจจุบัน | คำถาม / minimal closure | Authority | Data capture / reporting impact | หลักฐานปิด |
| --- | --- | --- | --- | --- | --- |
| BR-01 Program stages / event dates | Baseline recordedOn เป็น stored date; Program startedAt/completedAt เป็น lifecycle; Appointment.scheduledAt เป็นเวลานัด; Follow-up/Final recordedAt และ createdAt เป็นเวลาบันทึก/สร้าง. ยังไม่มีวัน encounter/service delivery ที่รับรองจากสิ่งเหล่านี้โดยอัตโนมัติ | กำหนด stage mapping และวันสังเกตการณ์ต่อ field โดยห้ามใช้ lifecycle, appointment schedule หรือ record time แทน encounter date | Customer/Product + Clinical/Data owner | ใช้ source เดิมได้บาง field; field ที่ไม่มี observed date ต้องคง unavailable | approved stage/date table; synthetic case ที่ Program complete แต่ไม่มี Final และ record time/scheduled appointment ต่างจาก encounter time |
| BR-02 Service delivery / completeness | มี Service 1 records, GoalPlan และ Follow-up; ไม่พบ event ยืนยัน delivery/attendance/completion | เลือกว่ารายงานนับ record presence, started, delivered, participated, completed, NA หรือ missing อย่างใดบ้าง | Customer/Product + Hospital operations + Clinical authority | อาจต้องมี operation/factual event ใหม่เฉพาะสิ่งที่ยืนยันว่าต้องเก็บ; ห้าม label จาก row existence | approved vocabulary, recorder, event/evidence/timing, scenario แยก request STARTED กับ delivered |
| BR-03 Goal Plan target / revision | PatientGoalItem มี activityCode, targetDays, targetValue, targetUnit; plan มี roundNumber และ Follow-up อ้าง sourceGoalPlan ได้ | ระบุ target period, weekly/calendar/rolling/service interval, plan revision/effective date และ activity no longer applicable | Hospital operations + Clinical/data owner + Product | ใช้ target เดิมได้เมื่อเข้าใจ period; target ห้ามถูกแสดงเป็น actual | approved target-period/version rule, cases changed target before/after Follow-up |
| BR-04 Actual activity / score | Follow-up เก็บ categorical progress; ไม่เก็บ achieved-day numeric source/rate; personal exercise เป็น SELF | กำหนด observation method/actor/period, numerator/denominator, partial/NA/zero/missing, per-activity vs Follow-up, precision/revision และ >70 threshold/population/window | Clinical authority + Data owner; Customer/Product ยืนยัน label/threshold | หากเก็บตัวเลขใหม่ ต้องเป็น factual input ที่ link exact Program/Follow-up; formula หลังอนุมัติเท่านั้น | signed rule + approved synthetic test vectors รวม >70 boundary และ corrected Goal Plan; R24A-D09 เป็นหลัก, D10/D12 secondary |
| BR-05 Structured outcome | Follow-up narrative/status มี; runtime controlled overall outcome vocabulary ไม่พบ | กำหนด vocabulary, owner/version, cardinality, clinical vs operational, requiredness, event time, actor, correction และ linkage | Clinical authority + Hospital operations + Product | ต้องมี structured fact เฉพาะเมื่อยืนยัน requirement; ห้าม derive จาก free text | controlled vocabulary version + record/readback/correction scenarios |
| BR-06 Health Plan adjustment | GoalPlan rounds และ Follow-up sourceGoalPlan มี; ไม่มี adjustment decision/applied event link | แยก edit, new round, decision to adjust และ adjustment applied; กำหนด prior/result Plan, date/actor/reason, No/Yes/Unknown/NA | Clinical authority + Hospital operations + Product | ไม่จำเป็นต้องสร้าง field ใหม่ก่อนตัดสิน semantics; ปัจจุบัน Plan count ไม่ใช่ adjustment indicator | approved event meaning/linkage/correction + unchanged/decided/applied synthetic cases |
| BR-07 Obstacle | มี Baseline/Follow-up free text; ไม่มี Follow-up structured obstacle flag | Boolean หรือ reason; Follow-up/activity; mandatory; Unknown vs No vs NA; correction; reason privacy | Customer/Product + Hospital operations + Clinical/Data; Security/privacy สำหรับรายละเอียด | เริ่มจาก field ต่ำสุดที่ยืนยัน; ห้าม infer จาก note/NOT_DONE | approved state vocabulary, actor, linkage, correction and privacy review |
| BR-08 Historical OSM | Assignment มี createdAt/endedAt; Program/service records have recorder; no historical responsible OSM link | ชื่อ OSM หมายถึง current assignment, Program-period assignment, recorder หรือ care deliverer? | Hospital operations + Product + Hospital data owner; Security/privacy สำหรับ disclosure | หากต้อง historical responsibility อาจต้อง source/linkage; อย่าใช้ current assignment/recorder แทน | signed role semantics and reassignment cases proving past attribution does not move |

## 5. Clinical / measurement review — CL-01–CL-07

ไม่มี clinical formula, diagnosis mapping หรือ instrument ที่เอกสารนี้อนุมัติ. การทบทวนต้องเป็น authority ที่เหมาะสมตามหัวข้อ; ข้อมูลใน schema เป็น evidence ว่าเก็บอะไรได้ ไม่ใช่หลักฐาน clinical validity.

| Topic | Source และช่องว่าง | คำถามทาง clinical/data | Authority และหลักฐานปิด | Data capture / reporting gate |
| --- | --- | --- | --- | --- |
| CL-01 HbA1c | Baseline.hba1c nullable และยังไม่อยู่ Program projection; FinalAssessment ไม่มี HbA1c | Before/After ใช้ source, วันตรวจ, unit, stage, provenance, requiredness และ correction ใด? | Clinical authority + Hospital lab/data owner; signed source/unit/stage/correction rule และ synthetic Before/After examples | Before ต้อง semantic approval/projection; After ไม่มี source; ห้าม copy Before |
| CL-02 BMI | Baseline height/weight; Final Assessment มี weight แต่ไม่มี height/BMI; stored BMI ไม่พบ | จับคู่ height/weight ต่อ stage อย่างไร; formula/version, unit, reuse, rounding, missing, validation/history? | Clinical authority + Data owner; approved method/version, unit/range/rounding and test vectors | ไม่คำนวณจน approved; After ที่ขาด height เป็น source gap ได้เมื่อยืนยัน mandatory |
| CL-03 CVD Risk | ไม่พบ authoritative score, input set หรือ algorithm/version | ใช้ instrument ใด; calculated หรือ supplied; inputs, version, time, range, validation, missing, reproducibility? | Clinical authority + source/data owner; official approval reference and versioned fixtures | ไม่แสดง/สร้าง score และไม่เลือก algorithm แทน |
| CL-04 DM/Pre-DM | Current Patient-level RISK/DIABETES + history; Hospital counts นับ relationship rows | นิยาม classification, authority, effective time, corrections, unclassified, grain/dedup/denominator อย่างไร? | Clinical authority + Product/Data owner + Hospital operations; approved terminology and denominator rule; Security reviews aggregate exposure separately | ห้าม map RISK→Pre-DM หรือ DIABETES→DM; count remains blocked |
| CL-05 Illness duration | ไม่พบ onset/diagnosis date/duration fact; Program start ไม่ใช่ onset | จุดเริ่ม, source reported/verified, unit, as-of, correction/history และ mandatory status? | Clinical authority + Hospital data owner; approved source/date/unit/correction policy | ไม่คำนวณจาก Program start; source capture candidate only after decision |
| CL-06 PAM/PROMs | ScreeningAssessment มี versioned JSON แต่ไม่มี Program FK; ไม่ยืนยัน clinical instrument/scoring | instrument/version, scoring owner/range/interpretation, Before/After, linkage, reassessment, validation? | Clinical authority + Data owner + Product; signed instrument/scoring/version and accepted examples | ห้าม promote prototype JSON หรือ confidence fields เป็น score ที่อนุมัติ |
| CL-07 Weekly exercise | PersonalExerciseEntry มี self-report activity/date/optional duration; ไม่มี Program link/clinical observation | self-report vs observed, exercise definition, week boundary, aggregation/overlap, Program linkage, reuse/privacy/approval? | Clinical/Data authority + Product + privacy authority; approved source/period/linkage/actor and disclosure scope | รักษา Personal SELF boundary; ไม่แสดงเป็น Program clinical fact |

## 6. Dependency and implementation consequence

| Work package | Decisions / topics | Current gate | Safe next action |
| --- | --- | --- | --- |
| Clinical source/measurement fields | D06–D09/D12; CL-01–CL-07; G18-03/G18-04/G18-09 | CLINICAL_APPROVAL_BLOCKED and/or DATA_SOURCE_BLOCKED | เก็บคำตอบ source, stage, units, authority, timing และ correction ก่อนออกแบบ schema/calculation |
| Service/outcome/adjustment/obstacle | D07/D09/D10/D12; BR-02–BR-07; G18-05/G18-06 | REQUIREMENT_BLOCKED; DATA_SOURCE_BLOCKED เมื่อยืนยันว่าต้องมี fact ที่ไม่มี source | Hospital operations + Clinical authority แยกความหมายและ event evidence |
| Population/identity/export | D01–D05, D14–D15; G18-01/G18-02/G18-07/G18-10 | REQUIREMENT_BLOCKED และ SECURITY_PRIVACY_BLOCKED | ตัดสิน business population/display แยก แล้วส่ง RPT-24C ให้ Security/Architecture |
| Layout/missing/overflow | D11–D13/D15; G18-10 | REQUIREMENT_BLOCKED | ทบทวน synthetic workbook; ห้ามแก้ customer workbook ใน Phase นี้ |
| Optional request orchestration | CARE-07 / G18-12 | Requirement not confirmed; ไม่ใช่ defect ของ bounded request flow | ไม่เริ่มงานจน Customer/Product + Hospital operations ยืนยัน scope เพิ่ม |
| Network/Family/UAT | G18-11/G18-13/G18-14; existing Phase 17 / HN gates | แยก requirement, privacy/governance และ acceptance gates; HN-M08 DEFERRED / NOT AUTHORIZED | ยึด gate เดิม ไม่ขยาย Patient access หรือ real-data use |

### Phase 18C.2 entry conditions

Phase 18C.2 เริ่มได้เมื่อระบุขอบเขตงานที่จะ design ได้จากคำตอบที่มีหลักฐาน ไม่จำเป็นต้องรอ decisions ที่ไม่เกี่ยวกับ scope นั้น แต่สำหรับแต่ละ field/flow ที่จะรวมต้องมี:

1. Decision ID เดิมและ exact wording ที่ถูกต้อง; status, authority, approver, evidence, scope และ effective version ครบตาม [Sign-off record](./PHASE_18C1_CUSTOMER_CLINICAL_SIGNOFF.md).
2. Business และ clinical semantics ที่เป็น dependency ได้รับการยืนยันโดย authority ที่เหมาะสม; partial answers ยังคงเป็น blocker.
3. Source owner, exact Patient/Hospital/Program/Follow-up linkage, actor, timestamp meaning, units, missing/correction/history ถูกกำหนด หรือบันทึกอย่างชัดว่าต้องมี authoritative capture ใหม่หลัง approval.
4. Synthetic acceptance scenarios สำหรับ boundary/correction/missing cases สอดคล้องกับกฎที่อนุมัติ; ยังไม่ถือว่า UAT เกิดขึ้น.
5. RPT-24C security/privacy/authorization/snapshot gates ถูกติดตามแยก. หากงานเป็น report/export ต้องปิด gates ที่เกี่ยวข้องและมี implementation authorization แยกก่อนสร้างความสามารถหรือเปิดข้อมูลจริง.
6. Scope แยก design review, implementation authorization, implementation และ acceptance/UAT ออกจากกัน. Decision ACCEPTED ไม่อนุญาต runtime change โดยตัวมันเอง.

## 7. สถานะ review closeout

- D01–D15: **PROPOSED / PROPOSED FOR REQUESTER / CUSTOMER REVIEW**; ไม่มี approval evidence ที่ตรวจยืนยันได้ใน repository ณ HEAD นี้.
- BR-01–BR-08 และ CL-01–CL-07: topics ยัง OPEN ตาม Phase 18C.0; candidate direction ไม่ใช่ accepted rule.
- การอนุมัติ RPT-24C, export/privacy/access, snapshot, audit, revocation และ delivery: **OPEN** และอยู่นอกการปิด Phase 18C.1.
- HN-M08: **DEFERRED / NOT AUTHORIZED**.
- Phase 18A+B closure และ Phase 18C.0 artifacts ยังคง intact.
- **ผลที่ปิดได้:** DOCUMENTATION REVIEW COMPLETE — DECISION REVIEW READY.
- **ผลที่ยังปิดไม่ได้:** CUSTOMER/CLINICAL DECISIONS APPROVED.

เอกสารนี้เตรียมพร้อมสำหรับ Phase 18C.2 decision closure/design readiness หลังได้รับหลักฐานจริง; ไม่เริ่ม implementation หรือ Phase 18C.2 โดยอัตโนมัติ.
