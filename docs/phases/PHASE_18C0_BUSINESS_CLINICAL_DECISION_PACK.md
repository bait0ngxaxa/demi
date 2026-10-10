# Phase 18C.0 — เตรียมการตัดสินใจกฎธุรกิจและคลินิก

**สถานะ:** PHASE 18C.0 — DECISION PACKAGE PREPARED / CUSTOMER & CLINICAL CONFIRMATION PENDING
**Source HEAD ที่ตรวจ:** main / ff6cfa7458183f43ca7b4ad1228700f33b6ba059 (2026-10-10)

**ขอบเขต:** เตรียมคำถามและตัวเลือกจากหลักฐานที่มี ไม่อนุมัติสูตร ไม่อนุมัติ export และไม่ให้สิทธิ์เริ่ม implementation

เอกสารนี้ใช้ผลตรวจจาก [Phase 18A](./PHASE_18A_CUSTOMER_FLOW_GAP_VERIFICATION.md), [Phase 18B](./PHASE_18B_EXCEL_DATA_GAP_VERIFICATION.md), [Phase 18AB Verified Gap Backlog](./PHASE_18AB_VERIFIED_GAP_BACKLOG.md), [RPT-24](./PHASE_17_RPT24_ON_DEMAND_ASOF_EXCEL_EXPORT_CONTRACT.md) และ [RPT-24A](./PHASE_17_RPT24A_CUSTOMER_WORKBOOK_DECISION_PACK.md) ต่อ ไม่ทำซ้ำ field mapping หรือสร้าง Decision Register แข่งขันกัน

BR-01–BR-08 และ CL-01–CL-07 เป็นหัวข้อทบทวนตามขอบเขต Phase นี้ ไม่ใช่ Decision ID ใหม่ การตัดสินใจที่เกี่ยวกับ workbook ยังคงอ้าง R24A-D01–D15 เดิม

## 1. แหล่งหลักฐานและข้อเท็จจริงที่แยกกัน

| ประเภท | สิ่งที่ยืนยันได้ใน HEAD นี้ | สิ่งที่ยังสรุปไม่ได้ |
| --- | --- | --- |
| Requirement ที่ผู้ร้องขอยืนยัน | RPT-24 บันทึกความต้องการ on-demand Patient Program progress Excel จาก factual data ตามสิทธิ์ | ไม่ได้อนุมัติประชากร, clinical meaning, field allowlist, cohort/export permission, snapshot implementation หรือ production use |
| Customer workbook | อ่านไฟล์ [Dashboard App Demi.xlsx](../Dashboard%20App%20Demi.xlsx) แบบ read-only; มี worksheet Dashboard ภาพรวม และ รายงานการจัดบริการ; ขนาดที่ระบุใน workbook คือ A1:AQ29 และ A1:BM37; ไม่พบ Excel formula cells หรือ data validation blocks | ข้อความในหมายเหตุไม่ได้ยืนยัน clinical formula หรือ runtime dropdown vocabulary |
| Canva | ใช้ customer-flow evidence ที่บันทึกและตรวจแล้วใน Phase 18A §2 และ mapping ใน Phase 17A; Canva/whiteboard เป็นหลักฐาน intent ไม่ใช่การอนุมัติ clinical rule | รายละเอียดที่ไม่ปรากฏใน mapping เดิมยังต้องตรวจตรงกับผู้ร้องขอ; ไม่อนุมานจาก mockup |
| Accepted architecture / workflow | ADR-0001/0002 และ CONTEXT กำหนด Person/User separation, server-side Role + Capability + Scope และ fail-closed authorization; Phase 17E3 อนุมัติ CARE-07 bounded Patient Service Request | สิ่งเหล่านี้ไม่ได้อนุมัติสูตร, clinical classification, completeness label หรือ export permission |
| Current implementation | Prisma/services บันทึก Baseline, Screening, Goal Plan targets, Follow-up, Final Assessment, classification และ Program lifecycle บางส่วน; Program report เป็น exact-Program projection | การมี field/operation ไม่พิสูจน์ความหมายทางคลินิก, report readiness, customer acceptance หรือการให้บริการจริง |
| Approval state | RPT-24A §13 ยังคง R24A-D01–D15 เป็น PROPOSED FOR REQUESTER / CUSTOMER REVIEW | ไม่มีหลักฐาน authoritative approval ที่ปิดรายการใด; ไม่มี clinical formula ที่ได้รับอนุมัติจากเอกสารที่ตรวจ |

### 1.1 Workbook evidence ที่จำเป็นต่อการคุย

- Dashboard ภาพรวมแสดง Hospital, จำนวนเคส, เบาหวาน/Pre-DM, Patient ID, ระยะเวลาการเจ็บป่วย, OSM, Before, ระหว่าง Program และ After; worksheet rows 4–7 ระบุ CVD risk, HbA1c, DTX, body weight, BMI, height, waist, BP และช่องติดตาม 1–6
- รายงานการจัดบริการแสดง Before/After PAM, PROMs, confidence, weekly exercise, Service 1–2, Follow-up 1–6, achieved days, achievement rate, outcome, plan adjustment และ obstacle; row 6 และช่วง row 31–35 มีข้อความหมายเหตุเพิ่มเติม
- หมายเหตุรายงานการจัดบริการ!AI32 ให้คำอธิบาย Achieve score เป็นจำนวนครั้งที่ทำตามเป้าหมายเทียบกับจำนวนครั้งที่ตั้งเป้าหมายต่อสัปดาห์ แต่ไม่ได้กำหนด observation window, ผู้บันทึก, วิธีแปลง PARTIAL, denominator เมื่อ target เปลี่ยน, missing/zero/NA, rounding หรือการแก้ไขข้อมูล
- หมายเหตุรายงานการจัดบริการ!AI33 ระบุว่า outcome มาจาก “ประโยค/วลี” ที่บันทึกในโปรแกรมและกล่าวถึง Drop down list; ใน workbook ที่ตรวจไม่พบ data validation list และ runtime ปัจจุบันยังไม่มี structured Follow-up outcome vocabulary ที่ยืนยันแล้ว
- หมายเหตุรายงานการจัดบริการ!AI34 ระบุ obstacle แบบมี/ไม่มี; เป็น requirement evidence สำหรับคำถาม ไม่ได้พิสูจน์ว่ามี field หรือ rule นี้ในระบบ
- หมายเหตุคาดหวัง Follow-up ประมาณ 2–4 ครั้งต่อ Program และ worksheet แสดง 6 ตำแหน่ง; เป็น expectation/presentation evidence ไม่ใช่ persistence limit เพราะ source รองรับ Follow-up 0..N

### 1.2 จุดตีความที่ยังไม่ตรงกัน

- Workbook note!AI33 กล่าวถึง phrase ที่ “บันทึกไว้ในโปรแกรม” และ dropdown; source/runtime ที่ตรวจยังไม่มี authoritative structured Follow-up outcome vocabulary และตัว workbook ไม่มี data validation list. ยังไม่รู้ว่า note อ้างถึงโปรแกรม/เครื่องมือรุ่นใด จึงต้องให้ customer ระบุ list, owner และ version ก่อน.
- Workbook note!AI32 ให้แนวคิดสัดส่วนการทำตาม target ต่อสัปดาห์ แต่ source เก็บ target และ categorical Follow-up progress; ไม่มี actual-day observation หรือ denominator ที่ตกลง. ข้อความนี้เป็น requirement clue ไม่ใช่สูตรที่พร้อมใช้.
- Workbook labels Before/During/After และ “วันที่สิ้นสุดโปรแกรม” ไม่กำหนดว่าเป็น observation date, service date หรือ Program lifecycle. Source timestamps จึงยัง map เข้าป้าย workbook โดยอัตโนมัติไม่ได้.
- “อสม.ที่ดูแล” ใน workbook ไม่ระบุว่า current assignment, historical responsible OSM, recorder หรือ care deliverer; source ปัจจุบันแยก facts เหล่านี้.

## 2. กฎที่มีหลักฐานรองรับแล้ว

### 2.1 Accepted contract และ authorization boundary

- CARE-07 ตาม [Phase 17E3 §Owner-approved CARE-07 contract](./PHASE_17E3_PATIENT_CORE_FLOW_GAP_CLOSURE.md) สร้าง PatientServiceRequest และมีสถานะ PENDING, APPROVED, REJECTED, STARTED, WITHDRAWN. STARTED เป็นคำยืนยันของ Hospital ว่าเริ่ม delivery ใน request domain; ไม่สร้าง PatientProgram, PatientOsmAssignment หรือ clinical record และไม่เท่ากับ service completion
- PATIENT SELF ทำงานบนตัวตน/relationship ที่ server resolve; Family access ต้องมี relationship และ grant เฉพาะ resource; OSM access ต้องมี exact active PatientOsmAssignment; Hospital parent/child ไม่สืบทอด clinical patient access; Hospital OWNER ไม่ใช่ Platform ADMIN. ดู Phase 18A §2.1 และ [ADR-0002](../adr/0002-role-capability-scope-authorization.md)
- RPT-24 ยืนยันเฉพาะ on-demand reporting requirement. report:program:read เป็น exact-Program read; ไม่ใช่ Hospital cohort/export authorization. Authorization, privacy, snapshot, revocation, audit และ file delivery ยังคงเป็น gate แยก
- ไม่มีสิทธิ์นำ Patient SELF PersonalExerciseEntry, current OSM assignment หรือ Person identity มาใช้ข้าม scope เพียงเพราะข้อมูลนั้นอ่านได้จากอีก module

### 2.2 ข้อเท็จจริงจาก source ไม่ใช่กฎคลินิกที่อนุมัติ

| ข้อเท็จจริงจาก source | ความหมายที่ปลอดภัย | ห้ามสรุป |
| --- | --- | --- |
| PatientProgram.status มี ACTIVE และ COMPLETED; startedAt/completedAt อยู่บน Program | Program lifecycle | COMPLETED = clinical success, มี Final Assessment หรือบริการครบ |
| PatientProgram.initialBaselineId เป็น nullable link ไป Baseline ของ PatientHospitalRelationship เดียวกัน | Program อาจอ้าง Baseline เฉพาะรายการ | ทุก Program มี Baseline หรือใช้ Baseline ล่าสุด/ข้าม Hospital แทนได้ |
| PatientBaseline เป็นหนึ่งรายการต่อ PatientHospitalRelationship; มี recordedOn, weight, heightCm, waist, BP, DTX, HbA1c | มี factual Baseline fields บางรายการ | Baseline เป็นค่าตรวจทุก Program หรือค่ามี unit/clinical stage ที่ตกลงครบแล้ว |
| ScreeningAssessment เก็บ questionSetKey/version, scoringVersion, responses/result JSON ใน scope relationship | มี versioned application submission | Prototype PAM/PROM เป็นคะแนนคลินิกที่อนุมัติหรือผูกกับ Program stage แล้ว |
| PatientGoalPlan มี roundNumber; PatientGoalItem มี targetDays, targetValue, targetUnit; Program FK อาจ nullable | เก็บเป้าหมายของ Plan round | target = observed achievement, เป้าหมายมีผลย้อนหลัง หรือ Program plan ปัจจุบันแทนทุก Follow-up |
| PatientFollowup เก็บ record ต่อรอบและ status ต่อ activity เป็น DONE/PARTIAL/NOT_DONE/NOT_APPLICABLE; มี recordedAt | มี operational record/progress category | status = จำนวนวันที่ทำได้, recordedAt = วันพบผู้ป่วย หรือ follow-up record = service delivered |
| PatientFollowup อาจอ้าง sourceGoalPlanId และมี patientProgramId แบบ nullable; Final Assessment เป็น 0..1 ต่อ Program | source linkage บางส่วนมี | การอ้าง Goal Plan = มีการปรับแผน; Program COMPLETED = Final/ผลสำเร็จ |
| PatientClassification เก็บ RISK/DIABETES พร้อม history; query counts exact Hospital relationship rows | มี current class/history และ query นับ relationship | RISK = Pre-DM, DIABETES = DM, count = unique Person หรือ Program cohort |
| PersonalExerciseEntry เก็บ activityName, occurredOn, durationMinutes? ใน Patient SELF profile | มี self-reported personal exercise facts | เป็น clinician-observed exercise, weekly total หรือ Program/Follow-up fact |
| PatientOsmAssignment เก็บช่วง assignment และผู้มอบหมาย; clinical records เก็บ actor/recorder | assignment, record creator และ care delivery เป็นคนละ fact | OSM ปัจจุบันคือผู้รับผิดชอบย้อนหลังหรือผู้ให้บริการจริง |

## 3. Business rule decisions

แต่ละหัวข้อด้านล่างเป็น OPEN จนมีการยืนยันจาก decision authority ตามบทบาท ไม่มีข้อเสนอใดปิด R24A decision หรืออนุญาต implementation

### BR-01 — Program Stage Semantics · OPEN · R24A-D06

- **Workbook asks:** Before, During, After; Program start/end; date ของ Follow-up และ Final Assessment.
- **Source / existing rule:** Baseline.recordedOn เป็น DATE ที่บันทึกกับ Baseline; Program.startedAt/completedAt เป็น lifecycle timestamps; Follow-up และ Final Assessment recordedAt เป็นเวลาที่ application บันทึก; ไม่พบ dedicated encounter/measurement date สำหรับ Follow-up/Final. Final Assessment ไม่เท่ากับ Program completion.
- **ยังต้องตัดสิน:** Before หมายถึง Baseline ที่ link กับ Program หรือผลตรวจล่าสุดก่อน start; During ใช้วันที่ service เกิดหรือวันที่บันทึก; After หมายถึง Final Assessment, ค่า observation หลังจบ หรือทั้งสอง; วันเริ่ม/สิ้นสุด Program ต้องแสดงแยกจากวันวัดหรือวันให้บริการหรือไม่.
- **ตัวเลือก:** (A) ใช้ชื่อ source ที่ตรง เช่น Baseline / Follow-up / Final และแสดง lifecycle date แยก; (B) ใช้ Before/During/After หลังยืนยัน source และ event-date mapping; (C) แสดงเฉพาะ factual fields ที่ระบุ source/date ได้และ omit stage ที่ยังจับคู่ไม่ได้. ตัวเลือก B สื่อสารง่ายกว่าแต่ต้องมี clinical validation และบางวันที่อาจต้องเก็บเพิ่ม.
- **ทิศทาง candidate:** คงศัพท์ lifecycle/event แยกกัน และไม่ใช้ recordedAt เป็น encounter date; ห้ามคัดลอกค่าข้าม stage.
- **Authority / impact:** Customer/Product Owner, Hospital operations และ Clinical/Data authority ร่วมอนุมัติ. หากไม่ปิด จะยังรับรอง Before/After comparison และวันที่ observation ไม่ได้.
- **หลังอนุมัติ / acceptance:** ระบุ source, linkage, event type, timezone/date precision, actor, correction/history ของทุก stage; synthetic case แสดงว่า Program, encounter และ record time ไม่ถูกสลับกัน. **Implementation gate:** decision binding และ privacy/export gate ที่เกี่ยวข้องต้องแยกผ่าน.

### BR-02 — Service Delivery and Completeness · OPEN · R24A-D10

- **Workbook asks:** Service 1–6 และตัวบ่งชี้ความครบถ้วน; worksheet แสดงกิจกรรมและ Follow-up record fields.
- **Source / existing rule:** Service 1, Goal Plan, Follow-up และ Final Assessment มี record sources ตาม Program; การมี record หมายถึงมีข้อมูลถูกบันทึก. CARE-07 STARTED เป็น request operation และไม่แทน Service 1–6 หรือ Program/clinical record.
- **ยังต้องตัดสิน:** คำว่า “ครบ/ทำแล้ว” หมายถึง planned, record exists, service started, service delivered, patient participated, activity completed, not applicable หรือ record missing อย่างใด; ใครเป็นผู้บันทึกและหลักฐานขั้นต่ำคืออะไร.
- **ตัวเลือก:** (A) รายงานเฉพาะ “มี/ไม่มี record ใน DEMI” — factual แต่ไม่ตอบว่าบริการเกิดจริง; (B) เพิ่ม/อนุมัติ explicit delivery/participation/completion fact — ตรง business outcome แต่ต้องกำหนด actor/evidence; (C) แสดงแยก source-record status กับ delivery status — ชัดที่สุดแต่เพิ่มช่อง/ภาระเก็บข้อมูล.
- **ทิศทาง candidate:** แยก planned / recorded / started / delivered / participated / completed; ใช้ status ที่มีอยู่ตามความหมายจริงและไม่เรียก record presence ว่าบริการครบ.
- **Authority / impact:** Customer/Product Owner + Hospital operations + Clinical authority. หากไม่ปิด workbook ห้ามสรุป service completeness หรือ actual delivery.
- **หลังอนุมัติ / acceptance:** แต่ละ label มีนิยาม, recorder, event time, evidence/correction rule และ exact Program scope; synthetic absent-vs-recorded-vs-delivered scenarios แสดงผลต่างกัน. **Implementation gate:** G18-06 เป็น proposal เท่านั้น.

### BR-03 — Goal Plan and Activity Targets · OPEN · R24A-D06/D10

- **Workbook asks:** เป้าหมายอาหารและออกกำลังของ Service 2 รวมจำนวนวัน/สัปดาห์, จำนวนมื้อ/สัปดาห์และเวลาเป้าหมาย.
- **Source / existing rule:** GoalPlan creation เก็บ round, template version, exact optional Program link; GoalItem เก็บ activityCode, targetDays, targetValue และ targetUnit. Follow-up อาจอ้าง sourceGoalPlanId. GoalPlan เป็น target record.
- **ยังต้องตัดสิน:** target เป็นรายวัน, calendar week, rolling week หรือช่วงระหว่าง service; “จำนวนครั้ง” นับอย่างไร; target ที่แก้ไขมีผลตั้งแต่วันใดและ retroactive หรือไม่; activity ที่หยุดใช้เป็น zero, not applicable หรือ retired; activityCode/template mapping ใดตรง workbook.
- **ตัวเลือก:** (A) target ต่อ calendar week; เทียบง่ายแต่ต้องกำหนด timezone/สัปดาห์; (B) target ต่อ rolling/Follow-up interval; ยืดหยุ่นแต่ต้องมีช่วงจริง; (C) แสดง target ที่บันทึกไว้โดยไม่เทียบ actual จนมี observation period. Candidate C ปลอดภัยที่สุดกับ source ปัจจุบัน.
- **ทิศทาง candidate:** เก็บความต่างระหว่าง Plan round และ actual observation; ใช้ sourceGoalPlanId ที่บันทึกไว้ต่อ Follow-up โดยไม่อนุมานว่าเป็นการปรับแผน.
- **Authority / impact:** Customer/Product Owner + Hospital operations + Clinical/Data authority. หากไม่ปิด การเทียบ achievement กับ target ยังไม่มี denominator/time window.
- **หลังอนุมัติ / acceptance:** มี mapping ของ activity, unit, period start/end, effective date, version และการแก้ target; test scenario เปลี่ยน Plan แล้วไม่เปลี่ยนความหมายของ Follow-up เก่า. **Implementation gate:** ไม่ปรับ schema หรือคำนวณใน Phase 18C.0.

### BR-04 — Actual Achievement and Achieve Score · OPEN · R24A-D09 (และ threshold dependency D08/D12)

- **Workbook asks:** จำนวนวันที่ทำได้, อัตราความสำเร็จตามเป้า, Achieve score และจำนวน Follow-up ที่เกิน 70%; worksheet note!AI32 ระบุแนวคิด “จำนวนครั้งที่ทำตามเป้าหมาย : จำนวนครั้งที่ตั้งเป้าหมาย/สัปดาห์”.
- **Source / existing rule:** FollowupActivityProgress มีเพียง DONE/PARTIAL/NOT_DONE/NOT_APPLICABLE ต่อ activity; ไม่มี numeric achieved-day observation, numerator, denominator, period หรือ persisted score. GoalPlan เก็บ target เท่านั้น. PersonalExerciseEntry เป็น self-report ที่ไม่มี Program link.
- **ยังต้องตัดสินก่อนคิดคะแนน:** นิยาม “ทำได้หนึ่งวัน/ครั้ง”; ผู้บันทึกและวิธีตรวจ; observation period; numerator; eligible denominator; การนับ PARTIAL; zero target; missing, unknown และ NA; score ระดับ activity, Follow-up หรือ Program; percent หรือคะแนนอื่น; precision/rounding; Plan revisions; correction history; >70% หมายถึง strictly greater หรือ at least; eligible Follow-up population; missing-score handling; counting unit และช่วงเวลาที่นับ.
- **ตัวเลือก:** (A) คง categorical status และไม่แสดง numeric achievement; ไม่มีการเดาแต่ลูกค้าจะไม่ได้ตัวเลข; (B) ตกลง collection of actual occurrences พร้อม period/authority แล้วจึงกำหนดสูตรและ version; มีภาระบันทึกแต่ตรวจสอบได้; (C) รับค่าคะแนนจาก source ที่ clinical/data authority อนุมัติ; ลดการคำนวณใน DEMI แต่ต้องพิสูจน์ provenance และ Program linkage.
- **ทิศทาง candidate:** ยังไม่เสนอ production formula และไม่แปลง DONE/PARTIAL เป็นวัน. Workbook note เป็น candidate intent ไม่ใช่ accepted denominator. นับ Follow-ups >70% ไม่ทำได้จนกว่าคะแนนและ eligible population จะได้รับอนุมัติ.
- **Authority / impact:** Clinical authority + Data owner + Product Owner/Hospital operations; Customer ยืนยันความหมายในรายงาน. กรณีนี้ block ตัวเลข achievement และ >70% โดยตรง.
- **หลังอนุมัติ / acceptance:** signed rule ครอบคลุมทุกประเด็นข้างต้น, test vectors ที่ clinical authority รับรองและ revision cases; numeric expected result จะเพิ่มได้หลังอนุมัติเท่านั้น. **Implementation gate:** G18-04 และ G18-07 คง REQUIREMENT_GATED.

### BR-05 — Structured Follow-up Outcomes · OPEN · R24A-D10/D12

- **Workbook asks:** “ผลลัพธ์ที่ได้” โดยหมายเหตุ worksheet!AI33 บอกว่ามาจากประโยค/วลีที่บันทึกในโปรแกรมและกล่าวถึง dropdown.
- **Source / existing rule:** Follow-up มี reflectionNote, confidencePlan, generalNote และ activity status; schema/service ปัจจุบันไม่พบ overall controlled outcome field/vocabulary. Workbook ที่ตรวจไม่มี validation list; historical note ไม่พิสูจน์ว่า runtime DEMI มี vocabulary นั้น.
- **ยังต้องตัดสิน:** รายการคำที่ยอมรับและแหล่งเจ้าของ; version/lifecycle ของรายการ; outcome เดียวหรือหลายค่า; clinical หรือ operational; required/optional; actor ที่บันทึก/แก้; event time; PatientProgram/Follow-up link; correction/history.
- **ตัวเลือก:** (A) customer/clinical authority ส่ง controlled list พร้อม owner/version; อ่านตรงกันแต่ต้องดูแลรุ่น; (B) แยก clinical outcome กับ operational outcome; ชัดกว่าแต่ต้องตกลงสองความหมาย; (C) ไม่ใส่ outcome column จนมี vocabulary. ห้ามจัดหมวดข้อความอิสระอัตโนมัติ.
- **ทิศทาง candidate:** หากต้องแสดง outcome ให้ใช้ vocabulary ที่ authority ระบุและผูกกับ Follow-up; ห้าม infer จาก free text, DONE/PARTIAL หรือ Program status.
- **Authority / impact:** Clinical authority + Hospital operations + Product Owner. หากไม่ปิด field ต้องเว้น/แสดงตาม missing rule ที่อนุมัติ.
- **หลังอนุมัติ / acceptance:** versioned vocabulary, field cardinality, actor, event date, exact linkage, correction rules และ UAT examples ได้รับ sign-off. **Implementation gate:** G18-05.

### BR-06 — Health Plan Adjustment · OPEN · R24A-D10

- **Workbook asks:** indicator “ปรับแผนใหม่/ไม่ปรับ” ต่อ Follow-up.
- **Source / existing rule:** GoalPlan มีหลาย round และ Follow-up อาจอ้าง sourceGoalPlanId; ไม่พบ explicit adjustment decision/event หรือ supersedes link ที่ผูกการตัดสินใจกับ Follow-up.
- **ยังต้องตัดสิน:** indicator หมายถึง (A) GoalPlan เดิมถูกแก้, (B) สร้าง GoalPlan round ใหม่, (C) Follow-up ตัดสินใจว่าจะปรับ, หรือ (D) ปรับแล้วและบันทึกผลจริง; ใครตัดสิน, วันตัดสิน/effective date, reason และ no/yes/unknown/not applicable อย่างไร.
- **ตัวเลือก:** แสดงเฉพาะการตัดสินใจ; แสดงเฉพาะการปรับที่เกิดจริง; หรือแยก decision กับ resulting plan. แบบแยกตรงความหมายที่สุดแต่ต้องเก็บความสัมพันธ์เพิ่ม.
- **ทิศทาง candidate:** อย่าอนุมานจาก Plan count, target ต่างกัน หรือ Follow-up มี sourceGoalPlanId; ถ้ารายงานถามว่าปรับจริง ต้องมีหลักฐานผลลัพธ์ที่อ้าง Plan ก่อน/หลัง.
- **Authority / impact:** Clinical authority + Hospital operations + Product Owner. หากไม่ปิด workbook adjustment indicator ยังตอบไม่ได้.
- **หลังอนุมัติ / acceptance:** decision actor/time, effective time, previous/resulting plan reference, required reason และ correction rules ยืนยันด้วย synthetic unchanged/decided/applied cases. **Implementation gate:** G18-05.

### BR-07 — Follow-up Obstacles · OPEN · R24A-D10/D12

- **Workbook asks:** worksheet!AI34 ระบุเพียงว่าลงบันทึก obstacle ว่ามีหรือไม่มี.
- **Source / existing rule:** Baseline adaptationObstacles และ Follow-up notes เป็น free text; ไม่มี structured Follow-up obstacle flag. Missing note หรือ NOT_DONE ไม่ใช่หลักฐานว่ามี/ไม่มี obstacle.
- **ยังต้องตัดสิน:** ต้องการ boolean เท่านั้นหรือเหตุผลด้วย; mandatory/optional; ทั้ง Follow-up หรือ activity-specific; Unknown ต่างจาก No อย่างไร; แก้ย้อนหลังได้ไหม; รายละเอียดมีข้อจำกัด privacy อย่างไร.
- **ตัวเลือก:** (A) Yes/No/Unknown; รองรับสรุปแต่ไม่อธิบายเหตุผล; (B) Yes/No/Unknown + controlled reason; มีข้อมูลมากขึ้นและต้องอนุมัติ disclosure; (C) ไม่เก็บ indicator จนยืนยันความจำเป็น. not applicable แยกจาก unknown หาก clinical/business authority กำหนด.
- **ทิศทาง candidate:** อย่าอ่านจาก note หรือ failure status; เริ่มจากข้อมูลน้อยที่สุดที่ลูกค้ายืนยันและไม่เปิดเผย narrative โดยไม่จำเป็น.
- **Authority / impact:** Customer/Product Owner + Hospital operations + Clinical/Data authority; Security/privacy ทบทวนหากเก็บเหตุผลหรือเปิดเผยข้อความ.
- **หลังอนุมัติ / acceptance:** authorized actor, exact Follow-up/activity linkage, no/unknown/NA handling, correction และ field-level disclosure rule. **Implementation gate:** G18-05.

### BR-08 — Historical Care Responsibility / OSM Attribution · OPEN · R24A-D05

- **Workbook asks:** ชื่อ OSM ที่ดูแลในทั้งสอง worksheet.
- **Source / existing rule:** PatientOsmAssignment ผูก OSM กับ exact PatientHospitalRelationship และมี createdAt/endedAt; appointment อาจเก็บ assignment ณ เวลาสร้าง; clinical record มีผู้บันทึก/ผู้สร้าง. ไม่มี Program/service attribution ที่ยืนยันว่าใครรับผิดชอบหรือส่งมอบ care ในอดีต.
- **ยังต้องตัดสิน:** หมายถึง OSM ปัจจุบัน ณ snapshot, OSM ที่รับมอบหมายตอน Program start, ผู้รับผิดชอบในช่วงวันของ service, ผู้กรอกข้อมูล หรือผู้ให้บริการจริง.
- **ตัวเลือก:** (A) แสดง OSM ปัจจุบันพร้อม label ว่า current-at-report; ใช้ได้กับงานปัจจุบันแต่ไม่ใช่ historical attribution; (B) แสดงผู้รับผิดชอบตามช่วงเวลา/Program; ต้องมี provenance ที่ตรง; (C) omit ชื่อ OSM จนพิสูจน์ไม่ได้.
- **ทิศทาง candidate:** แยก assignment, recorder และ care deliverer; ไม่ใช้ current assignment แทน attribution ย้อนหลัง.
- **Authority / impact:** Hospital operations + Product Owner + Hospital data owner; Security/privacy อนุมัติการเปิดเผย identity แยกตาม RPT-24C. หากไม่ปิด attribution ต้อง omit/label ตามทางเลือกที่อนุมัติ.
- **หลังอนุมัติ / acceptance:** time basis, assignment interval, Program/service linkage, actor semantics และ permission scope ผ่าน review; reassignment scenario ยืนยัน attribution ไม่ย้ายย้อนหลัง. **Implementation gate:** G18-08.

## 4. Clinical / measurement rule decisions

### CL-01 — HbA1c Before / After · OPEN · R24A-D06/D07/D09/D12

- **Source:** PatientBaseline.hba1c nullable; Program report ปัจจุบันไม่ project field นี้. PatientFinalAssessment ไม่มี HbA1c. ไม่พบ authoritative After source ใน current schema/service.
- **ต้องอนุมัติ:** source (Hospital/lab/external), stage/Program relation, observed date, unit, reference/validation range ที่เหมาะสม, required/optional, provenance, corrections และการเก็บ historical values.
- **ทางเลือก:** ใช้เฉพาะ Baseline Before แล้วแสดง After unavailable; เพิ่ม authoritative After capture ภายหลังจากอนุมัติ; หรือ omit ทั้งสองจน stage/unit/source ชัด. ห้ามใช้ Before ซ้ำเป็น After.
- **Candidate / authority:** หากเลือกเก็บ ต้องเป็นค่าที่ระบุ stage/date/source ได้; Clinical authority + Hospital data owner + Customer/Product Owner. Acceptance ต้องยืนยันค่าคนละ stage/คนละเวลาได้โดยไม่ copy.
- **Impact / gate:** ช่อง Before ต้อง projection และ semantic approval; After เป็น source gap. G18-03/G18-09; implementation ยัง gated.

### CL-02 — BMI Before / After · OPEN · R24A-D07/D09/D12

- **Source:** Baseline มี heightCm และ weight; Final Assessment มี weight แต่ไม่มี height/BMI. ไม่มี stored BMI ที่ยืนยัน.
- **ต้องอนุมัติ:** แหล่ง height/weight ที่จับคู่กับแต่ละ stage, units, formula/version owner, rounding, height reuse, missing-value behavior, clinical validation และ correction.
- **ทางเลือก:** ใช้ authoritative BMI result ที่มาจาก source owner; คำนวณจาก stage-matched inputs หลัง signed formula; หรือ omit. การคำนวณเป็นทางเลือกที่ต้องมี clinical approval ไม่ใช่ค่าเริ่มต้น engineering.
- **Candidate / authority:** ไม่แสดง BMI จาก incomplete/mismatched stage values. Clinical authority + Data owner + Product Owner.
- **Impact / gate:** BMI Before/After ห้ามเดา; G18-03. Acceptance ใช้ synthetic units/missing/stage fixtures หลัง rule ลงนามเท่านั้น.

### CL-03 — CVD Risk Score · OPEN · R24A-D07/D09

- **Source:** ไม่พบ persisted result, input set, algorithm หรือ versioned authoritative CVD risk source ใน schema/service/projection.
- **ต้องอนุมัติ:** ชื่อ assessment method, คำนวณหรือรับค่าจากภายนอก, variables, algorithm/instrument version, observation time, validation, output unit/range, missing behavior และ reproducibility/history.
- **ทางเลือก:** อ้างผลจาก clinical system ที่ระบุ provenance; ใช้ algorithm ที่ clinical authority เลือกและอนุมัติครบ; หรือ defer/omit score.
- **Candidate / authority:** ไม่มีการเลือก algorithm ใน Phase นี้. Clinical authority เป็นผู้อนุมัติวิธีและ test vectors; Hospital/data owner ระบุ source; Product Owner ยืนยันความจำเป็นของ workbook.
- **Impact / gate:** SOURCE_MISSING + DERIVATION_UNAPPROVED; G18-03. ห้ามเติมคะแนน.

### CL-04 — DM / Pre-DM Classification and Denominator · OPEN · R24A-D01/D03/D08/D12

- **Source:** PatientClassification เก็บ current RISK/DIABETES ต่อ PatientProfile และ history; classification counts นับ PatientHospitalRelationship rows ของ exact Hospital. ไม่มี Program-effective snapshot.
- **ต้องอนุมัติ:** นิยาม DM/Pre-DM, ผู้มีอำนาจจัดประเภท, source, effective date, corrections/history, unclassified handling, denominator เป็น unique Person, Hospital relationship หรือ PatientProgram, dedup และ cross-Hospital rules.
- **ทางเลือก:** (A) ไม่แสดงจำนวนจน vocabulary/denominator ผ่าน; (B) แสดง current relationship classification ด้วยชื่อ source เดิม โดยลูกค้ายืนยันว่าเพียงพอ; (C) สร้าง clinical classification semantics ที่อนุมัติ. B ยังไม่เท่ากับ DM/Pre-DM.
- **Candidate / authority:** ห้าม map RISK → Pre-DM หรือ DIABETES → DM โดยตรง. Clinical authority + Product/Data owner + Hospital operations; Security/privacy ทบทวน aggregate disclosure.
- **Impact / gate:** dashboard counts ไม่พร้อม; exact-Hospital population และ denominator ยังเปิด. G18-07; ห้ามขยาย scope ข้าม Hospital.

### CL-05 — Illness Duration · OPEN · R24A-D07/D09/D12

- **Source:** ไม่พบ authoritative onset/diagnosis date หรือ illness-duration field ที่ตรง workbook; Program.startedAt เป็นจุดเริ่ม Program ไม่ใช่ onset.
- **ต้องอนุมัติ:** event ที่เริ่มระยะเวลา, source authority (reported/clinically verified), unit, effective date, correction/history, mandatory/optional และถ้าค่าคำนวณได้ให้กำหนด as-of date.
- **ทางเลือก:** เก็บ onset date จากแหล่งที่ clinical/data authority รับรอง; รับ duration ที่ผู้ป่วย/ผู้ให้บริการรายงานพร้อม source label; หรือ omit.
- **Candidate / authority:** ไม่คำนวณจาก Program start. Clinical authority + Hospital data owner + Customer/Product Owner.
- **Impact / gate:** SOURCE_MISSING; G18-03. ต้องมี source/event semantics ก่อนจะพิจารณา derived duration.

### CL-06 — PAM / PROMs · OPEN · R24A-D06/D07/D09/D12

- **Source:** ScreeningAssessment เก็บ versioned JSON (question set/scoring version) ใน exact PatientHospitalRelationship; ไม่มี Program FK และ Program report ไม่เลือก score. Source version ที่พบเป็น prototype ไม่ใช่ customer/clinical sign-off.
- **ต้องอนุมัติ:** instrument names/version, scoring authority, valid range/interpretation, respondent, Before/After timing, Program linkage, reassessment/revision, clinical validation และ field disclosure.
- **ทางเลือก:** รับรอง prototype หลัง clinical review; map ไปยัง instrument/version อื่นที่ authority เลือก; หรือไม่แสดงคะแนน. การมี response/result JSON ไม่ทำให้ทางเลือกแรกเกิดขึ้นอัตโนมัติ.
- **Candidate / authority:** เก็บ/รายงานเฉพาะ approved instrument/version and stage; Clinical authority + Data owner + Product Owner.
- **Impact / gate:** SOURCE_AVAILABLE_SEMANTICS_OPEN + SOURCE_EXISTS_NOT_PROJECTED; G18-09. ไม่ promote prototype JSON เป็น official score.

### CL-07 — Weekly Exercise Duration · OPEN · R24A-D06/D07/D09/D12

- **Source:** PersonalExerciseEntry มี activityName, occurredOn, optional durationMinutes, createdAt/updatedAt; Patient SELF เป็นเจ้าของ; ไม่มี Program/Follow-up FK และไม่มี clinician observation.
- **ต้องอนุมัติ:** ต้องการ patient self-report หรือ clinician-observed; นิยาม exercise; สัปดาห์ calendar/rolling/Program interval; การรวมหลาย entries/overlap; Program linkage; ใช้ Personal Wellness ซ้ำได้หรือไม่; ผู้ดู/ผู้อนุมัติ และแก้ไขย้อนหลัง.
- **ทางเลือก:** (A) รายงานเป็น personal self-report แยกจาก service data; (B) เก็บ Program-linked reviewed observation; (C) omit. A ไม่ตอบ workbook หากลูกค้าต้องการ clinical observation.
- **Candidate / authority:** รักษา SELF vs care boundary; ห้าม project wellness เป็น Program value จน consent/authority/linkage ตกลง. Clinical/Data authority + Product Owner + Patient privacy/security authority.
- **Impact / gate:** source self-report มีแต่ semantics/linkage ไม่พร้อม; G18-04/G18-09. ไม่สร้าง source of truth ซ้ำเพื่อ dashboard.

## 5. Reconcile กับ R24A-D01–D15 และ implementation gates

ณ HEAD ที่ตรวจ R24A-D01–D15 ทั้งหมดคงสถานะ **PROPOSED FOR REQUESTER / CUSTOMER REVIEW** ตาม [RPT-24A §13](./PHASE_17_RPT24A_CUSTOMER_WORKBOOK_DECISION_PACK.md). Phase 18C.0 ไม่เปลี่ยน approval state และไม่มีหลักฐานให้ทำเครื่องหมาย ACCEPTED

| Existing ID | หัวข้อที่ยังเปิด / การอ้างอิงใน Phase 18C.0 | ผู้มีอำนาจตัดสินตาม register เดิม | สถานะ / ผลหากยังไม่ปิด |
| --- | --- | --- | --- |
| R24A-D01–D03 | Exact-Hospital population, row grain, Hospital/Program separation; dependency ของ BR/CL และ workshop | Customer/Product Owner, Hospital operations; Security สำหรับ scope | OPEN; ไม่อนุมัติ cohort/export หรือข้าม Hospital |
| R24A-D04 | Displayed Patient ID / identifier | Customer, Product Owner, Hospital data owner, Security/privacy | OPEN; ไม่มี UUID fallback |
| R24A-D05 | Patient/OSM identity and responsibility; BR-08 | Customer, Product Owner, Hospital operations, Security/privacy | OPEN; current OSM ไม่ใช่ historical attribution |
| R24A-D06 | Before/During/After and stage dates; BR-01/03, CL-01/06/07 | Customer/Product + Clinical authority + data owner | OPEN; ไม่ผูก stage/time โดยเดา |
| R24A-D07 | Missing clinical field / phased coverage; CL-01–CL-07 | Customer/Product + Clinical/data authority | OPEN; ไม่อ้าง full coverage |
| R24A-D08 | DM/Pre-DM classification and denominator; CL-04 | Clinical authority + Product/data owner + Security/privacy | OPEN; ไม่แปล enum หรือเลือก denominator เอง |
| R24A-D09 | Derived metrics; BR-04, CL-01–CL-07 | Clinical authority + data owner + Product Owner | OPEN; BMI/CVD/achievement/threshold calculations blocked |
| R24A-D10 | Service completeness and structured service facts; BR-02–BR-07 | Customer/Product + Clinical/operations authority | OPEN; record presence ≠ delivery/completion |
| R24A-D11 | Follow-up overflow; persistence 0..N vs workbook six slots | Customer + Product Owner | OPEN; no truncation or export layout decision here |
| R24A-D12 | Missing values, zero, unknown, NA, withheld; relevant to all clinical fields | Customer/Product + data owner + Security/privacy | OPEN; no replacement of missing with zero |
| R24A-D13 | Workbook compatibility/version | Customer + Product Owner | OPEN; no template change approved |
| R24A-D14 | requestedAt, snapshot boundary/dataAsOf, generatedAt | Customer/Product for labels; Architecture/DB + Security for mechanism | OPEN; no snapshot contract or implementation approved |
| R24A-D15 | Stable ordering/correlation | Customer + Product Owner; Engineering for deterministic implementation | OPEN; no customer ordering accepted |

### 5.1 กติกาที่ต้องคงไว้

- requestedAt, dataAsOf/snapshot boundary และ generatedAt มีความหมายคนละอย่าง; ทุกชีต, count, pagination และ related records ต้องมี approved coherent snapshot contract ก่อน export จริง
- exact-Program report permission ไม่ใช่ cohort/export permission; Hospital Network aggregation ไม่ให้ individual-patient access; HN-M08 Network Export คง DEFERRED / NOT AUTHORIZED
- ไม่สร้าง clinical result, completion rate หรือ service outcome จากข้อมูลที่ขาด; Follow-up มี 0..N records และหกตำแหน่งใน workbook ไม่จำกัด persistence
- Program completion ไม่เท่ากับ clinical outcome; current assignment ไม่เท่ากับ historical care attribution; no record ไม่เท่ากับ no service; free text ไม่ใช่ structured outcome
- Acceptance, manual UAT, external verification, clinical approval และ source implementation เป็นคนละสถานะ

## 6. สถานะการอนุมัติและการเริ่มงาน

ยังไม่มีรายชื่อบุคคลผู้มีอำนาจอนุมัติปรากฏในหลักฐาน repository; ก่อน workshop Customer/Product Owner ต้องระบุผู้แทนที่มีอำนาจ, Clinical authority และ Hospital/Data owner ตามหัวข้อ โดยไม่ถือว่าผู้เข้าร่วมทุกคนมี authority เท่ากัน

ต้องบันทึกการตัดสินใจในเอกสาร/ช่องทาง authoritative ที่มีอยู่ พร้อมตัวเลือกที่เลือก, เหตุผล, owner role, ชื่อผู้อนุมัติ, วันที่, version/effective time และ scope. จนกว่าจะมีหลักฐานนั้น:

- สถานะกฎ BR-01–BR-08 และ CL-01–CL-07 = **OPEN**
- R24A-D01–D15 = **PROPOSED FOR REQUESTER / CUSTOMER REVIEW**
- clinical formula และ classification = **NOT APPROVED**
- export permission, privacy, coherent snapshot, revocation, audit, delivery และ production acceptance = **OPEN / NOT AUTHORIZED** ตาม RPT-24/RPT-24C gates
- ไม่มี implementation authorization จาก Phase 18C.0

**Disposition:** PHASE 18C.0 — DECISION PACKAGE PREPARED / CUSTOMER & CLINICAL CONFIRMATION PENDING. ขั้นต่อไปคือ Phase 18C.1 decision review/closure เท่านั้น; ยังไม่เริ่มโดยอัตโนมัติ.
