# BF-GAP-WB-00 — Workbook DoD Crosswalk และแผนปิด Gap

**Program:** Business Flow Closure Program
**Date:** 2026-10-12 (Asia/Bangkok)
**Analyzed HEAD:** `8ea2f0b9f3aad9d92f5c90f170faa9ef4f22e953` (`main`, working tree สะอาดก่อนเริ่ม)
**Disposition:** BF-GAP-WB-00 — PLAN PREPARED / OWNER & CLINICAL DECISIONS PENDING
**Canonical register:** [Business Flow Gap Canonical](../requirements/BUSINESS_FLOW_GAP_CANONICAL.md)

## 1. Product Owner direction

วันที่ 2026-10-12 Product Owner กำหนดทิศทางว่า **Definition of Done (DoD) ของการปิด business flow gap คือรายงานตาม workbook [Dashboard App Demi.xlsx](../Dashboard%20App%20Demi.xlsx)** (sheet “Dashboard ภาพรวม” และ “รายงานการจัดบริการ”) ที่เติมได้จากข้อมูลปฏิบัติการจริงใน DEMI

ผลต่อ program:

- งานปิด gap จัดลำดับตามคอลัมน์ของ workbook (outcome-driven) แทนการไล่ตามลำดับ audit BF-GAP-02..10 แบบ inventory ทั้งหมด ลำดับ audit ใน canonical §12 ไม่ได้ล็อก implementation order อยู่แล้ว
- ทิศทางนี้เป็น explicit Product Owner requirement ที่ยกเว้น reporting freeze (canonical §5) **เฉพาะ** งานที่ทำให้ workbook เติมได้ตาม decision ที่อนุมัติแล้ว ไม่อนุมัติ report, export, aggregate, actor หรือ scope ใหม่อื่น
- Direct OWNER, Global ADMIN selected-Hospital, Parent exact-Child และ exact-Program reporting ที่มีอยู่ต้องคงไว้ตามเดิม
- เอกสารนี้ **ไม่ปิด** decision ใด ค่าที่ “แนะนำ” ใน §5 เป็นข้อเสนอทาง engineering ให้ Owner/Clinical authority ตอบรับหรือแก้ไข สถานะทุกข้อยังเป็น OPEN จนมีการยืนยัน

## 2. หลักฐานที่ใช้

| แหล่ง | สิ่งที่ยืนยันได้ |
| --- | --- |
| Workbook `docs/Dashboard App Demi.xlsx` | อ่านแบบ read-only: “Dashboard ภาพรวม” A1:AQ29 (43 คอลัมน์), “รายงานการจัดบริการ” A1:BM37 (65 คอลัมน์) พร้อมหมายเหตุ AH31–AH37 |
| Workbook export ปัจจุบัน | `src/modules/reporting/services/hospital-report-workbook-service.ts` สร้างทั้งสอง sheet จาก `HospitalReportProgramRow`; ช่องที่ไม่มี source แสดงเหตุผล (`SOURCE_MISSING`, `CLINICAL_SEMANTICS_UNAPPROVED`, `NOT_PROGRAM_SCOPED`, `DERIVATION_UNAPPROVED`) แทนการเติมค่า |
| Field coverage register ใน code | `HOSPITAL_REPORT_UNAVAILABLE_FIELDS` ใน `src/modules/reporting/projections/hospital-report-projection.ts` |
| Schema | `prisma/schema.prisma`: `PatientProgram`, `PatientBaseline`, `PatientProgramServiceOne*`, `PatientGoalPlan`/`PatientGoalItem`, `PatientFollowup`/`PatientFollowupActivityProgress`, `PatientFinalAssessment`, `ScreeningAssessment`, `PatientClassification`, `PatientOsmAssignment` |
| Goal template | `src/modules/goals/domain/goal-templates/legacy-prototype-v1.ts` (activity code และ category FOOD/EXERCISE/MEASUREMENT/REST) |
| Decision pack เดิม | [Phase 18C.0](./PHASE_18C0_BUSINESS_CLINICAL_DECISION_PACK.md): BR-01..08 และ CL-01..07 ทั้งหมด OPEN; [RPT-24A](./PHASE_17_RPT24A_CUSTOMER_WORKBOOK_DECISION_PACK.md): R24A-D01..D15 ยัง PROPOSED |
| Canva whiteboard `DAHSvdQ3gvU` | วันที่ 2026-10-12 อ่านข้อความของ design ได้โดยตรงผ่าน Canva connector (ตอน BF-GAP-01R ถูกปฏิเสธสิทธิ์) ใช้เป็น intent evidence เท่านั้น การผูกกล่องกับรอบยังต้องยืนยันจาก visual layout |

## 3. ข้อค้นพบหลัก

1. **โครงรายงานมีอยู่แล้ว ช่องว่างเกิดจาก source/semantics ไม่ใช่จาก export** — export ปัจจุบันวาง layout ตาม workbook ครบ และติด label ตรงไปตรงมาในช่องที่ยังไม่มีข้อมูลที่อนุมัติ
2. **Workbook ยืนยันโครง care model ปัจจุบัน** — workbook นิยาม ครั้งที่ 1 = รู้จักตัวเอง (กราฟวัดลอยจม, การ์ดความฝัน, ตารางกิจวัตร → Service 1), ครั้งที่ 2 = ทำแผนสุขภาพ เป้าหมายเล็กๆ (เป้าหมายอาหาร/ออกกำลัง → Goal Plan), ครั้งที่ 3–6 = ติดตามการฝึกซ้อมพฤติกรรม (→ Follow-up) และหมายเหตุ AI35 ระบุ “ติดตามกี่ครั้งก็ลงไปตามนั้น คาดหวัง 2–4 ครั้ง/โปรแกรม” ซึ่งสอดคล้องกับ Follow-up 0..N ที่มีอยู่ ชุดกิจกรรมรายรอบบน whiteboard (CARE-11/12) เป็น care choreography แยกจาก reporting DoD นี้
3. **Gate หลักคือ decision** — 15 decision (BR-01..08, CL-01..07) ยัง OPEN ทุกข้อ ทำให้ช่องประมาณครึ่งหนึ่งของ workbook ยังเติมอย่างปลอดภัยไม่ได้
4. **ไม่มี numeric achievement source** — Follow-up เก็บเพียง DONE/PARTIAL/NOT_DONE/NOT_APPLICABLE ต่อกิจกรรม จึงคำนวณ “จำนวนวันที่ทำได้/อัตราความสำเร็จ/Achieve score” ไม่ได้โดยไม่เพิ่ม source

## 4. Column crosswalk

สถานะ: ✅ SOURCE_READY (มี source และ projection แล้ว) · ⚠️ SOURCE_EXISTS_DECISION_OPEN (มี source แต่ mapping/semantics ยังไม่อนุมัติ หรือยังไม่ได้วางลงช่อง) · ❌ SOURCE_MISSING (ต้องเพิ่ม capture/persistence หลัง decision)

### 4.1 Sheet “Dashboard ภาพรวม”

| คอลัมน์ | Workbook field | Source ปัจจุบัน | สถานะ | Decision | Slice |
| --- | --- | --- | --- | --- | --- |
| C2/C3 | จำนวนเคส เบาหวาน / กลุ่มเสี่ยง (Pre-DM) | `PatientClassification` DIABETES/RISK (ไม่ใช่ diagnosis) | ⚠️ | CL-04, R24A-D08 | S3 |
| A | ลำดับ | ลำดับแถว | ✅ | R24A-D15 (ordering) | — |
| B–C | ชื่อ, สกุล | Person ผ่าน PatientHospitalRelationship | ✅ | — | — |
| D | ID | `PatientHospitalRelationship.hospitalNumber` | ✅ | R24A-D04 ยืนยัน identifier | — |
| E | ระยะเวลาการเจ็บป่วย | ไม่มี | ❌ | CL-05 | S3 |
| F | อสม.ที่ดูแล | `PatientOsmAssignment` ปัจจุบัน (endedAt null) | ⚠️ | BR-08 | S1 |
| G | วันที่เริ่มโปรแกรม | `PatientProgram.startedAt` | ✅ | BR-01 ยืนยันความหมาย | S1 |
| H | CVD risk score (Before) | ไม่มี | ❌ | CL-03 | S3 |
| I | HbA1C (Before) | `PatientBaseline.hba1c` (ยังไม่ project) | ⚠️ | CL-01 | S3 |
| J–K | DTX, BW (Before) | `PatientBaseline.bloodSugarDtx`, `weight` | ✅ | BR-01 | — |
| L | BMI (Before) | ไม่มี stored BMI; มี weight/height | ❌ | CL-02 | S3 |
| M–N | ส่วนสูง, รอบเอว (Before) | `PatientBaseline.heightCm`, `waistCircumference` | ✅ | — | — |
| O–P | BP ตัวบน/ตัวล่าง (Before) | `PatientBaseline.bloodPressureSystolic/Diastolic` | ✅ | — | — |
| Q–AH | ระหว่างโปรแกรม 1–6: DTX, BW | `PatientFollowup.bloodSugar`, `weight` ตาม roundNumber | ⚠️ | BR-01, R24A-D11 (การจับคู่ “1–6” กับ Service 1/2/Follow-up) | S1 |
| S, V, Y, AB, AE, AH | ระหว่างโปรแกรม 1–6: Achieve score | ไม่มี | ❌ | BR-04 | S2 |
| AI | วันที่สิ้นสุดโปรแกรม | `PatientProgram.completedAt` | ✅ | BR-01 | — |
| AJ | CVD risk score (After) | ไม่มี | ❌ | CL-03 | S3 |
| AK | HbA1C (After) | ไม่มี field ใน Final Assessment | ❌ | CL-01 | S3 |
| AL–AM | DTX, BW (After) | `PatientFinalAssessment.bloodSugar`, `weight` | ✅ | BR-01 | — |
| AN | BMI (After) | ไม่มี; Final ไม่มี height | ❌ | CL-02 | S3 |
| AO–AQ | รอบเอว, BP (After) | `PatientFinalAssessment` | ✅ | — | — |

### 4.2 Sheet “รายงานการจัดบริการ”

| คอลัมน์ | Workbook field | Source ปัจจุบัน | สถานะ | Decision | Slice |
| --- | --- | --- | --- | --- | --- |
| C3/C4 | จำนวนเคส เบาหวาน / Pre-DM | เหมือน Dashboard | ⚠️ | CL-04 | S3 |
| A–D | ลำดับ, ชื่อ, สกุล, ID | เหมือน Dashboard | ✅ | R24A-D04 | — |
| E | ระยะเวลาการเจ็บป่วย | ไม่มี | ❌ | CL-05 | S3 |
| F | อสม.ที่ดูแล | assignment ปัจจุบัน | ⚠️ | BR-08 | S1 |
| G–H | วันที่เริ่ม/สิ้นสุด | `PatientProgram.startedAt/completedAt` | ✅ | BR-01 | — |
| I–J | Before DTX, BW | Baseline | ✅ | — | — |
| K–L | Before PAM, PROMs score | `ScreeningAssessment` (prototype, ไม่มี Program link) | ❌ | CL-06 | S4 |
| M | Before คะแนนไม้บรรทัดวัดใจ | `PatientProgramServiceOneConfidence.score` / `PatientBaseline.confidenceScore` | ⚠️ | CL-06 (scale), BR-01 (เลือก source) | S1 |
| N | Before เวลาออกกำลังกาย/สัปดาห์ | `PersonalExerciseEntry` (self-report, ไม่มี Program link) | ❌ | CL-07 | S3 |
| O–P | After DTX, BW | Final Assessment | ✅ | — | — |
| Q | After เวลาออกกำลังกาย/สัปดาห์ | ไม่มี | ❌ | CL-07 | S3 |
| R | จำนวนครั้งที่อัตราความสำเร็จ >70% | ไม่มี | ❌ | BR-04 | S2 |
| S–X | ครั้งที่ 1: กราฟวัดลอยจม, การ์ดความฝัน, ตารางกิจวัตร (ทำ/ไม่ทำ) | `PatientProgramServiceOne*` record presence | ⚠️ | BR-02 (มี record = “ทำ” ได้หรือไม่) | S1 |
| Y–Z | ครั้งที่ 2: การลดมื้ออาหาร มี/ไม่มี | ไม่มี activity code ตรง | ⚠️/❌ | BR-03 | S1 (ถ้า map ได้) / S2 |
| AA–AB | ครั้งที่ 2: การเปลี่ยนอาหาร มี/ไม่มี | `PatientGoalItem` category FOOD | ⚠️ | BR-03 | S1 |
| AC | ครั้งที่ 2: จำนวนมื้อ/สัปดาห์ | `PatientGoalItem.targetDays` ของ FOOD (ความหมายยังไม่ตรง) | ⚠️ | BR-03 | S1 |
| AD–AE | ครั้งที่ 2: เป้าหมายออกกำลัง มี/ไม่มี | `PatientGoalItem` category EXERCISE | ⚠️ | BR-03 | S1 |
| AF | ครั้งที่ 2: จำนวนวัน/สัปดาห์ | `PatientGoalItem.targetDays` (EXERCISE) | ⚠️ | BR-03 | S1 |
| AG | ครั้งที่ 2: รวมเวลา/สัปดาห์ | `targetDays × targetValue` (minutes) | ⚠️ | BR-03 (สูตรรวม) | S1 |
| AH, AP, AX, BF | ครั้งที่ 3–6: วันที่ติดตาม | `PatientFollowup.recordedAt` (เวลาบันทึก ไม่ใช่วันให้บริการ) | ⚠️ | BR-01 | S2 (serviceDate) |
| AI, AQ, AY, BG | ครั้งที่ 3–6: จำนวนวันที่ทำได้ | ไม่มี (มีเพียง categorical status) | ❌ | BR-04 | S2 |
| AJ, AR, AZ, BH | ครั้งที่ 3–6: อัตราความสำเร็จตามเป้า | ไม่มี | ❌ | BR-04 | S2 |
| AK, AS, BA, BI | ครั้งที่ 3–6: ผลลัพธ์ที่ได้ | ไม่มี controlled vocabulary | ❌ | BR-05 | S2 |
| AL–AM, AT–AU, BB–BC, BJ–BK | ครั้งที่ 3–6: ปรับแผนใหม่ ปรับ/ไม่ปรับ | ไม่มี explicit adjustment fact | ❌ | BR-06 | S2 |
| AN–AO, AV–AW, BD–BE, BL–BM | ครั้งที่ 3–6: มีอุปสรรค มี/ไม่มี | ไม่มี structured flag (มีแต่ free text) | ❌ | BR-07 | S2 |

### 4.3 สรุป

| สถานะ | ความหมายต่อ DoD |
| --- | --- |
| ✅ SOURCE_READY | identity, วันเริ่ม/สิ้นสุด Program, Before/After DTX, BW, รอบเอว, BP, ส่วนสูง Before — เติมได้แล้วใน export ปัจจุบัน |
| ⚠️ SOURCE_EXISTS_DECISION_OPEN | อสม., HbA1c Before, ไม้บรรทัดวัดใจ, Service 1 ทำ/ไม่ทำ, เป้าหมายครั้งที่ 2, DTX/BW ระหว่างโปรแกรม, วันที่ติดตาม, DM/Pre-DM — ปิดได้ด้วย decision + งาน projection เป็นหลัก |
| ❌ SOURCE_MISSING | Achieve score/วันที่ทำได้/อัตราสำเร็จ/>70%, ผลลัพธ์, ปรับแผน, อุปสรรค, CVD, BMI, HbA1c After, ระยะเวลาเจ็บป่วย, PAM/PROMs, เวลาออกกำลังกาย — ต้องเพิ่ม capture ใน operational flow ก่อน |

## 5. Owner / Clinical decision sheet

ทุกข้อเป็น **OPEN** คอลัมน์ “ค่าแนะนำ” เป็น engineering recommendation ไม่ใช่การอนุมัติ Owner ตอบได้ 3 แบบ: ยอมรับ / แก้ไข / เลื่อน (ช่องนั้นจะแสดง label “ยังไม่พร้อมใช้งาน” ต่อไป)

| ID | คำถาม | ค่าแนะนำ | ผู้อนุมัติ | ปลดล็อกคอลัมน์ |
| --- | --- | --- | --- | --- |
| BR-01 | Before / ระหว่าง / After และวันที่ หมายถึงอะไร | Before = Baseline ที่ผูกกับ Program (`initialBaselineId`); ระหว่าง = Follow-up ตาม roundNumber; After = Final Assessment ของ Program; วันเริ่ม/สิ้นสุด = lifecycle ของ Program; เพิ่ม “วันที่ให้บริการ” (date) แยกจาก recordedAt ใน Follow-up และ Final | Owner + Clinical + Data owner | G, AI, H/วันที่ติดตาม, Before/After ทั้งหมด |
| R24A-D11 | “ระหว่างโปรแกรม 1–6” ใน Dashboard จับคู่อย่างไร และ Follow-up เกินช่องทำอย่างไร | Dashboard ช่อง 1–6 = Follow-up ลำดับที่ 1–6 ตามเวลาให้บริการ (Service 1/2 ไม่มีค่าวัด); sheet บริการ ครั้งที่ 3–6 = Follow-up ลำดับที่ 1–4; ส่วนเกินลงแถวต่อเนื่อง (มีใน export แล้ว) ไม่ตัดทิ้ง | Owner | Q–AH, AH–BM |
| BR-02 | “ทำ/ไม่ทำ” ของครั้งที่ 1 หมายถึงอะไร | “ทำ” = มี Service 1 record ของกิจกรรมนั้นใน Program; “ไม่ทำ” = ไม่มี record และระบุใน legend ว่าเป็นการบันทึกใน DEMI | Owner + Hospital operations | S–X |
| BR-03 | activity code ใดเข้าหมวด workbook | การเปลี่ยนอาหาร = มี GoalItem หมวด FOOD; การลดมื้ออาหาร = **ไม่มี code ตรง** (ให้ Owner เลือก: map `reduce_rice` หรือเพิ่ม activity ใหม่ใน template version ใหม่); จำนวนมื้อ/สัปดาห์ = ให้ Owner นิยาม; เป้าหมายออกกำลัง = มี GoalItem หมวด EXERCISE; จำนวนวัน/สัปดาห์ = targetDays สูงสุดของ EXERCISE; รวมเวลา/สัปดาห์ = Σ(targetDays × targetValue นาที); ใช้ Goal Plan รอบแรกของ Program | Owner + Clinical | Y–AG |
| BR-04 | Achieve score / วันที่ทำได้ / >70% | เพิ่ม `achievedDays` (0–7) ต่อกิจกรรมในแต่ละ Follow-up ซึ่ง อสม./เจ้าหน้าที่บันทึก; ช่วงนับ = 7 วันก่อนวันให้บริการ; อัตรา = Σ achievedDays ÷ Σ targetDays ของ Goal Plan ที่ Follow-up อ้าง (`sourceGoalPlanId`) ตามหมายเหตุ AK32; แสดงเป็น % ทศนิยม 0 ตำแหน่ง; NOT_APPLICABLE ไม่นับในตัวหาร; ไม่มีค่า = ว่าง ไม่ใช่ 0; “>70%” = มากกว่า 70 อย่างเคร่งครัด; R = จำนวน Follow-up ที่อัตรา >70% | Clinical + Data owner + Owner | S/V/Y/AB/AE/AH (Dashboard), R, AI/AJ ฯลฯ |
| BR-05 | ผลลัพธ์ที่ได้ | Owner ส่งรายการ “ประโยค/วลี” (controlled vocabulary พร้อม version) เลือกได้ 1 ค่าต่อ Follow-up; ห้ามจัดหมวดจาก free text | Clinical + Hospital operations | AK, AS, BA, BI |
| BR-06 | ปรับแผนใหม่ | บันทึก ปรับ/ไม่ปรับ ใน Follow-up; ถ้า “ปรับ” ต้องผูกกับ Goal Plan รอบใหม่ที่สร้างจาก Follow-up นั้น | Clinical + Owner | AL–AM, AT–AU, BB–BC, BJ–BK |
| BR-07 | มีอุปสรรค | มี/ไม่มี (ไม่ทราบ แยกจาก ไม่มี) ต่อ Follow-up พร้อม note ไม่บังคับที่ไม่ออก workbook | Owner + Clinical; Privacy ทบทวน note | AN–AO, AV–AW, BD–BE, BL–BM |
| BR-08 | อสม.ที่ดูแล | แสดง อสม. ที่ assignment active ณ วันออกรายงาน พร้อม legend “ณ วันออกรายงาน” (พฤติกรรมปัจจุบัน) | Owner + Hospital operations | F |
| CL-01 | HbA1c Before/After | Before = `PatientBaseline.hba1c`; เพิ่ม `hba1c` (%) ใน Final Assessment; หน่วย % ทศนิยม 1 ตำแหน่ง; ไม่คัดลอก Before เป็น After | Clinical | I, AK |
| CL-02 | BMI | คำนวณ weight(kg) ÷ height(m)² ทศนิยม 1 ตำแหน่ง; Before ใช้ Baseline; After ใช้น้ำหนัก Final กับส่วนสูง Baseline; ขาดค่าใดค่าหนึ่ง = ว่าง | Clinical | L, AN |
| CL-03 | CVD risk score | ไม่คำนวณใน DEMI; บันทึกผล (%) จากเครื่องมือที่คลินิกกำหนด (เช่น Thai CV risk score) พร้อมชื่อวิธี/version ใน Baseline และ Final | Clinical | H, AJ |
| CL-04 | DM / Pre-DM | ถ้าคลินิกยืนยันว่า DIABETES = DM และ RISK = Pre-DM ให้นับจาก classification ปัจจุบันของ relationship ใน Hospital นั้น (unit = PatientHospitalRelationship ที่มี Program); ไม่ยืนยัน = คง label ปัจจุบัน | Clinical + Data owner | C2/C3, C3/C4 |
| CL-05 | ระยะเวลาการเจ็บป่วย | เพิ่ม “ปีที่ได้รับการวินิจฉัย” ที่ Hospital บันทึก; แสดงเป็นจำนวนปี ณ วันเริ่ม Program | Clinical + Data owner | E |
| CL-06 | PAM / PROMs / ไม้บรรทัดวัดใจ | คลินิกระบุชื่อแบบประเมิน, version ภาษาไทย, วิธีให้คะแนน; ผูก assessment กับ Program stage (Before/After); ไม้บรรทัดวัดใจ Before = Service 1 Confidence (0–10) | Clinical | K, L, M |
| CL-07 | เวลาออกกำลังกาย/สัปดาห์ | เจ้าหน้าที่/อสม. บันทึก นาที/สัปดาห์ ใน Baseline และ Final (operational record) ไม่ดึงจาก Personal Wellness | Clinical + Owner; Privacy | N, Q |

## 6. Implementation slices

ทุก slice ต้องเป็น vertical slice ครบตาม AGENTS.md (schema/migration → service + server-side policy → UI capture → readback/history → projection → workbook cell → tests) และเริ่มได้เฉพาะเมื่อ decision ที่ระบุผ่านแล้ว

| Slice | ขอบเขต | ต้องรอ decision | เปลี่ยน schema | ผลต่อ workbook |
| --- | --- | --- | --- | --- |
| **S0** | Workshop/sign-off decision sheet §5 และยืนยัน visual layout ของ whiteboard | — | ไม่ | เปิดทางทุก slice |
| **S1** | Projection-only: วาง Goal Plan ลง Y–AG, จับคู่ Follow-up กับช่องรอบ, legend อสม., Service 1 ทำ/ไม่ทำ, ไม้บรรทัดวัดใจ Before, HbA1c Before | BR-01, BR-02, BR-03, BR-08, R24A-D11, CL-01 (Before), CL-06 (ไม้บรรทัด) | ไม่ | ⚠️ ส่วนใหญ่ → ✅ |
| **S2** | Structured Follow-up: `serviceDate`, `achievedDays` ต่อกิจกรรม, outcome (vocabulary), planAdjusted + link Goal Plan ใหม่, obstacle; ฟอร์ม อสม./เจ้าหน้าที่; สูตร Achieve | BR-01, BR-04, BR-05, BR-06, BR-07 | ใช่ (additive migration) | Achieve, วันที่ทำได้, อัตรา, >70%, ผลลัพธ์, ปรับแผน, อุปสรรค |
| **S3** | Clinical measurement: HbA1c After, BMI, CVD risk, ปีที่วินิจฉัย, เวลาออกกำลังกาย Baseline/Final, DM/Pre-DM counts | CL-01..05, CL-07 | ใช่ (additive migration) | H, I, L, E, N, Q, AJ–AN, หัวรายงาน |
| **S4** | PAM/PROMs: instrument ที่อนุมัติ + ผูก Program stage | CL-06 | ใช่ | K, L |
| **S5** | DoD acceptance: golden workbook test จาก synthetic fixture ที่ตรวจทุกคอลัมน์, Owner UAT บน workbook จริง | ทุก slice | ไม่ | ปิด DoD |

ลำดับแนะนำ: S0 → S1 → S2 → S3 → S4 → S5 โดย S1 ส่งมอบได้เร็วที่สุดเพราะไม่ต้องแก้ schema และ S2 มีผลต่อจำนวนคอลัมน์มากที่สุด

## 7. ข้อจำกัดที่ต้องคงไว้

- ห้ามเติมค่าที่ยังไม่มี decision: ไม่ map RISK → Pre-DM, ไม่แปลง DONE/PARTIAL เป็นจำนวนวัน, ไม่ใช้ recordedAt เป็นวันให้บริการ, ไม่ใช้ Personal Wellness เป็นค่าใน Program, ไม่คัดลอก Before เป็น After, ไม่แทน missing ด้วย 0
- Authorization ของ export คงเดิม: direct Hospital OWNER exact-Hospital และ Global ADMIN selected-Hospital เท่านั้น งานนี้ไม่เปิด export ให้ MEMBER, Area หรือ Parent (RPT-31/32 ยังเป็น gate แยก)
- Field ใหม่ทุกตัวต้องมี actor, เวลา, Program/Follow-up linkage, validation และ readback ในหน้า operational ก่อนขึ้นรายงาน รายงานยังคงเป็น projection ไม่ใช่ source of truth
- Privacy/security approval สำหรับ field ใหม่ที่เป็นข้อมูลสุขภาพเป็น gate แยกจาก decision ทางคลินิก

## 8. Verification

- อ่าน workbook ด้วย exceljs แบบ read-only (header rows 4–8 และหมายเหตุ AH31–AH37) และเทียบกับ export service, projection และ schema ที่ HEAD ข้างต้น
- อ่านข้อความ Canva whiteboard ผ่าน connector (ไม่ได้ตรวจ visual layout)
- ไม่มีการเปลี่ยน runtime, schema, migration, policy, test หรือ reporting behavior ในเฟสนี้ จึงไม่ได้รัน test/typecheck/build

## 9. Next step

1. Owner และ Clinical authority ตอบ decision sheet §5 (ยอมรับ / แก้ไข / เลื่อน)
2. เมื่อ BR-01, BR-02, BR-03, BR-08 และ R24A-D11 ผ่าน → เริ่ม **S1**
3. เมื่อ BR-04..07 ผ่าน → เริ่ม **S2**
