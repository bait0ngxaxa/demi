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
| Canva whiteboard `DAHSvdQ3gvU` | วันที่ 2026-10-12 อ่านข้อความของ design ได้โดยตรงผ่าน Canva connector (ตอน BF-GAP-01R ถูกปฏิเสธสิทธิ์) ใช้เป็น intent evidence เท่านั้น และ export PNG 16000×9000 เพื่อตรวจ visual layout (ลูกศร/การผูกกล่อง) ของ flow ผู้ป่วยและ อสม. ผลอยู่ใน §3.1 |

## 3. ข้อค้นพบหลัก

1. **โครงรายงานมีอยู่แล้ว ช่องว่างเกิดจาก source/semantics ไม่ใช่จาก export** — export ปัจจุบันวาง layout ตาม workbook ครบ และติด label ตรงไปตรงมาในช่องที่ยังไม่มีข้อมูลที่อนุมัติ
2. **Workbook ยืนยันโครง care model ปัจจุบัน** — workbook นิยาม ครั้งที่ 1 = รู้จักตัวเอง (กราฟวัดลอยจม, การ์ดความฝัน, ตารางกิจวัตร → Service 1), ครั้งที่ 2 = ทำแผนสุขภาพ เป้าหมายเล็กๆ (เป้าหมายอาหาร/ออกกำลัง → Goal Plan), ครั้งที่ 3–6 = ติดตามการฝึกซ้อมพฤติกรรม (→ Follow-up) และหมายเหตุ AI35 ระบุ “ติดตามกี่ครั้งก็ลงไปตามนั้น คาดหวัง 2–4 ครั้ง/โปรแกรม” ซึ่งสอดคล้องกับ Follow-up 0..N ที่มีอยู่ แต่ **ชุดกิจกรรมรายรอบบน whiteboard ไม่ตรงกับ workbook** (ดู §3.1 ข้อ 1 และ decision WB-D01)
3. **Gate หลักคือ decision** — 15 decision (BR-01..08, CL-01..07) ยัง OPEN ทุกข้อ ทำให้ช่องประมาณครึ่งหนึ่งของ workbook ยังเติมอย่างปลอดภัยไม่ได้
4. **ไม่มี numeric achievement source** — Follow-up เก็บเพียง DONE/PARTIAL/NOT_DONE/NOT_APPLICABLE ต่อกิจกรรม จึงคำนวณ “จำนวนวันที่ทำได้/อัตราความสำเร็จ/Achieve score” ไม่ได้โดยไม่เพิ่ม source

### 3.1 ผลตรวจ visual layout ของ whiteboard (2026-10-12)

ตรวจจากภาพ export ความละเอียดสูงของ design `DAHSvdQ3gvU` ครบทั้ง 4 flow: ผู้ป่วย/ญาติ, อสม., เจ้าหน้าที่สาธารณสุข (รพ./รพ.สต.) และแอดมิน รพ.

1. **กิจกรรมรายรอบ (ยืนยันการผูกกล่องกับรอบแล้ว)** — แต่ละ “ครั้งที่ N” มีกล่องผลการจัดบริการที่ลูกศรผูกตรง: ทุกรอบมีฟอร์มอัตโนมัติ (ชื่อ-สกุล, อาชีพ, น้ำหนัก, ส่วนสูง, รอบเอว, ค่าน้ำตาล, ความดัน) และเพิ่ม: ครั้งที่ 1 = รู้จักตัวเอง, PAM, PROMs, กราฟวัดลอยจม, ผลไม้บรรทัดวัดใจ, ตารางชีวิตของฉัน, เส้นทางสุขภาพ; ครั้งที่ 2 = ทบทวนแผนสุขภาพ, ผลไม้บรรทัดวัดใจ, ตารางชีวิตของฉัน; ครั้งที่ 3 = ทบทวนแผนสุขภาพ, ผลไม้บรรทัดวัดใจ, ความฝันของฉัน; ครั้งที่ 4 = ทบทวนแผนสุขภาพ, กราฟวัดลอยจม, ผลไม้บรรทัดวัดใจ, ตารางชีวิตของฉัน, แผนสุขภาพดีของฉัน; ครั้งที่ 5 = ทบทวนแผนสุขภาพ, ตารางชีวิตของฉัน; ครั้งที่ 6 = ทบทวนเส้นทางสุขภาพ, ทบทวนแผนสุขภาพ, ไม้บรรทัดวัดใจ; “การติดตามที่ Add เพิ่ม” = ฟอร์มอัตโนมัติ. **ขัดกับ workbook** ซึ่งวางการ์ดความฝันไว้ครั้งที่ 1 และ “ทำแผนสุขภาพ” ไว้ครั้งที่ 2 → decision WB-D01
2. **ทุกรอบมีค่าวัด** — ฟอร์มอัตโนมัติของทุกรอบมีน้ำหนักและค่าน้ำตาล จึงสอดคล้องกับ Dashboard “ระหว่างโปรแกรม 1–6” ที่มี DTX/BW/Achieve ทุกช่อง หมายความว่าช่อง 1–6 น่าจะเป็น **รอบบริการที่ 1–6** ไม่ใช่ Follow-up ลำดับที่ 1–6 แต่ Service 1 และ Goal Plan ใน runtime ไม่มีค่าวัด → ค่าแนะนำ R24A-D11 ใน §5 ถูกแก้ตามนี้
3. **แจ้งเตือนตามช่วงเวลา (เช้า/กลางวัน/เย็น/ก่อนนอน) ผูกกับ “ยา”** — ลูกศรจากเมนู ยา → หน้ารายการยา → หน้าเพิ่มยา → กล่องแจ้งเตือน ทั้งใน flow ผู้ป่วยและ อสม. เป็นหลักฐานให้ BF-GAP-02 ทบทวน NOTIF-01/MED-03 (BF-GAP-01R ระบุว่ายังผูก domain ไม่ได้เพราะไม่มี visual evidence)
4. **ตอบรับ/เลื่อนนัดอยู่ใน flow อสม.** — flow อสม.: ตอบรับนัดหมาย → เลือกผู้ป่วยสำหรับจัดบริการ → รายละเอียดนัด → Popup ยืนยัน/เลื่อนนัด → กรณีขอเลื่อนนัด → หน้ากรอกวันใหม่; ส่วนสร้างนัด: นัดหมาย → ตนเอง/สมาชิกครอบครัว (เลือกสมาชิก/เลือกผู้ป่วย) → ประเภท ติดตาม/ประเมิน/ให้ความรู้ → เลือกแพทย์/พยาบาล/อสม. ใน flow ผู้ป่วยไม่พบกล่องตอบรับนัด เป็นหลักฐานให้ BF-GAP-02 ทบทวน actor ของ APT-03/04/07

5. **Workbook คือผลลัพธ์ของ “ดาวน์โหลดข้อมูลการจัดบริการ”** — ทั้ง flow เจ้าหน้าที่และแอดมิน รพ. มีลูกศร การจัดบริการ → ดาวน์โหลดข้อมูลการจัดบริการ → “ทั้งหมด” หรือ “เลือกเขตความรับผิดชอบ” → ภาพ sheet Dashboard ภาพรวม และ รายงานการจัดบริการ ดังนั้น DoD ตาม whiteboard ไม่ได้มีแค่คอลัมน์ แต่รวม **ผู้ดาวน์โหลด (เจ้าหน้าที่และแอดมิน รพ.)** และ **ขอบเขตข้อมูล (ทั้งหมด / ตามเขตความรับผิดชอบ)** ด้วย
6. **จัดการผู้ใช้งานและเขตความรับผิดชอบ** — แอดมิน รพ.: Add/ลบ/แก้ไข ผู้ใช้งานทั่วไป, อสม., เจ้าหน้าที่ รพ./รพ.สต. และตั้งค่าผู้ใช้ให้อยู่ในเขตความรับผิดชอบ (รพ./รพ.สต.) รวมถึง Add/ลบ/แก้ไข เขตความรับผิดชอบ; เจ้าหน้าที่: Add ผู้ใช้งานทั่วไปและ อสม. (ตรงกับ OWNER-03..13, STAFF-03/07, AREA-01..05 ใน canonical)

ข้อ 3–4 และ 6 ไม่อยู่ใน DoD workbook โดยตรงจึงไม่เปลี่ยนแผน slice แต่ต้องส่งต่อให้ canonical register แก้ใน BF-GAP-02 ส่วนข้อ 5 เปลี่ยนขอบเขต DoD → decision WB-D02/WB-D03 และ slice S6

**ขัดกับ reporting ที่ยืนยันแล้ว:** ปัจจุบัน export ทำได้เฉพาะ direct Hospital OWNER (exact Hospital) และ Global ADMIN (selected Hospital); MEMBER ไม่มีสิทธิ์ export (RPT-31 = INTENT_CONFLICT) และ [OR-RPT-03](../requirements/REPORTING_ACCESS_CANONICAL.md) ยืนยันว่าไม่มี requirement ให้รวมหลาย Hospital เป็น workbook เดียว ถ้า “ทั้งหมด” หรือเขตความรับผิดชอบหมายถึง รพ. รวม รพ.สต. หลายแห่ง จะขัดกับข้อนี้ และ Area ยังไม่มี model (AREA-01..05, RPT-32 = REQUIREMENT_GATED) ห้าม implement จนกว่า Owner จะตัดสิน

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

ทุกข้อเป็น **OPEN** ยกเว้นข้อที่ระบุว่า **CONFIRMED** ใน §5.1 คอลัมน์ “ค่าแนะนำ” เป็น engineering recommendation ไม่ใช่การอนุมัติ Owner ตอบได้ 3 แบบ: ยอมรับ / แก้ไข / เลื่อน (ช่องนั้นจะแสดง label “ยังไม่พร้อมใช้งาน” ต่อไป)

| ID | คำถาม | ค่าแนะนำ | ผู้อนุมัติ | ปลดล็อกคอลัมน์ |
| --- | --- | --- | --- | --- |
| BR-01 | Before / ระหว่าง / After และวันที่ หมายถึงอะไร | Before = Baseline ที่ผูกกับ Program (`initialBaselineId`); ระหว่าง = Follow-up ตาม roundNumber; After = Final Assessment ของ Program; วันเริ่ม/สิ้นสุด = lifecycle ของ Program; เพิ่ม “วันที่ให้บริการ” (date) แยกจาก recordedAt ใน Follow-up และ Final | Owner + Clinical + Data owner | G, AI, H/วันที่ติดตาม, Before/After ทั้งหมด |
| R24A-D11 | “ระหว่างโปรแกรม 1–6” ใน Dashboard จับคู่อย่างไร และ Follow-up เกินช่องทำอย่างไร | ช่อง 1–6 = รอบบริการที่ 1–6 (ตาม §3.1 ข้อ 2): ครั้งที่ 1 = Service 1, ครั้งที่ 2 = Goal Plan, ครั้งที่ 3–6 = Follow-up ลำดับที่ 1–4 จึงต้องเพิ่มค่าวัด (DTX/BW) ให้ Service 1 และ Goal Plan หรือ Owner ยอมให้ช่อง 1–2 ว่าง; Follow-up ที่เกินลงแถวต่อเนื่อง (มีใน export แล้ว) ไม่ตัดทิ้ง | Owner | Q–AH, AH–BM |
| WB-D01 | กิจกรรมแต่ละรอบยึด whiteboard หรือ workbook (เช่น การ์ดความฝัน ครั้งที่ 1 หรือ 3, ทำแผนสุขภาพ ครั้งที่ 2 หรือ แผนสุขภาพดีของฉัน ครั้งที่ 4) | ใช้ workbook เป็นนิยามรอบสำหรับรายงาน (เพราะเป็น DoD) และให้ Owner ยืนยันว่าลำดับกิจกรรมใน whiteboard เป็นแนวทาง UI ที่ยืดหยุ่นได้; ถ้า Owner ยึด whiteboard ต้องแก้ header ของ workbook ให้ตรงก่อน | Owner + Clinical | S–AG, Q–AH, CARE-11/12 |
| WB-D02 | ใครดาวน์โหลด workbook ได้ | whiteboard ให้ทั้งเจ้าหน้าที่ (MEMBER) และแอดมิน รพ. (OWNER); แนะนำให้ Owner ยืนยันว่า MEMBER ดาวน์โหลดได้เฉพาะ Hospital ที่ตนเป็นสมาชิกโดยตรง พร้อม audit เหมือน OWNER และกำหนดว่าข้อมูลระบุตัวบุคคล (ชื่อ, HN) แสดงให้ MEMBER ได้หรือไม่ (privacy review) | Owner + Security/Privacy | ทั้ง workbook (RPT-31) |
| WB-D03 | “ทั้งหมด” และ “เขตความรับผิดชอบ” หมายถึงอะไร | แนะนำเริ่มจาก “ทั้งหมด” = Hospital เดียวที่ผู้ใช้สังกัดโดยตรง (ตรงกับ runtime และ OR-RPT-03); เขตความรับผิดชอบเลื่อนไปทำหลัง AREA-01..05 ได้นิยาม ถ้า Owner ต้องการรวม รพ.สต. หลายแห่งใน workbook เดียว ต้องแก้ OR-RPT-03 อย่างเป็นทางการก่อน | Owner + Security | ขอบเขตแถวทั้ง workbook (RPT-32, AREA-01..05) |
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

### 5.1 Product Owner decisions (2026-10-12)

Product Owner ตอบใน session นี้ โดยเลือกตามค่าแนะนำทุกข้อ:

| ID | สถานะ | ผลการตัดสินใจ |
| --- | --- | --- |
| WB-D01 | **CONFIRMED** | รายงานใช้นิยามรอบตาม workbook (ครั้งที่ 1 = รู้จักตัวเอง/Service 1, ครั้งที่ 2 = ทำแผนสุขภาพ/Goal Plan, ครั้งที่ 3–6 = ติดตาม/Follow-up); ลำดับกิจกรรมใน whiteboard เป็นแนวทาง UI ไม่ใช่นิยามรายงาน |
| R24A-D11 | **CONFIRMED** | Dashboard “ระหว่างโปรแกรม 1–6” = รอบบริการที่ 1–6: ช่อง 1 = Service 1, ช่อง 2 = Goal Plan, ช่อง 3–6 = Follow-up ลำดับที่ 1–4; Follow-up ที่เกินลงแถวต่อเนื่องในช่อง 3–6; ช่อง 1–2 แสดงว่ายังไม่มีแหล่งค่าวัดจนกว่า S2 จะเพิ่มการวัดในรอบนั้น |
| WB-D02 | **CONFIRMED (มีเงื่อนไข)** | OWNER และ MEMBER ดาวน์โหลดได้ โดย MEMBER จำกัดเฉพาะ Hospital ที่สังกัดโดยตรง มี audit และ **ต้องผ่าน privacy review เรื่องการแสดงชื่อ/HN ก่อนเปิดใช้** จึงยังไม่ implement จนกว่า review ผ่าน (S6) |
| WB-D03 | **CONFIRMED** | “ทั้งหมด” = Hospital เดียวที่ผู้ใช้สังกัดโดยตรง สอดคล้อง OR-RPT-03; ตัวกรองเขตความรับผิดชอบรอ AREA-01..05 |
| BR-02 | **CONFIRMED** | ครั้งที่ 1 “ทำ” = มีบันทึกกิจกรรม Service 1 นั้นใน Program; “ไม่ทำ” = ไม่มีบันทึก; ใช้หัวตาราง ทำ/ไม่ทำ ของ workbook และมีหมายเหตุว่าไม่ยืนยันผลการรักษา |
| BR-03 | **CONFIRMED** | ใช้ Goal Plan รอบแรก (roundNumber ต่ำสุด) ของ Program: การลดมื้ออาหาร = มีเป้าหมาย `reduce_rice`; การเปลี่ยนอาหาร = มีเป้าหมายหมวด FOOD อื่น; จำนวนมื้อ/สัปดาห์ = targetDays สูงสุดของหมวด FOOD; เป้าหมายออกกำลัง = มีหมวด EXERCISE; จำนวนวัน/สัปดาห์ = targetDays สูงสุดของ EXERCISE; รวมเวลา/สัปดาห์ = Σ(targetDays × นาทีต่อครั้ง) ของ EXERCISE และถ้ากิจกรรมใดไม่มีนาทีจะไม่รวมบางส่วน |
| BR-08 | **CONFIRMED** | อสม.ที่ดูแล = assignment ที่ active ณ วันออกรายงาน พร้อมป้าย “(มอบหมายปัจจุบัน)” (พฤติกรรมเดิม) |
| BR-01 | **CONFIRMED** | Before = Baseline ที่ผูก Program, ระหว่าง = รอบบริการ, After = Final; เพิ่ม “วันที่ให้บริการ” (date, ค่าเริ่มต้นวันนี้ตามเวลาไทย เลือกย้อนหลังได้ ห้ามอนาคต) ใน Follow-up และ Final; รายงานใช้วันนี้ และ record เก่าใช้วันที่บันทึกพร้อมหมายเหตุ |
| BR-04 | **CONFIRMED** | อสม./เจ้าหน้าที่บันทึก “จำนวนวันที่ทำได้” 0–7 ต่อกิจกรรมในช่วง 7 วันก่อนวันให้บริการ; อัตรา = Σวันที่ทำได้ ÷ Σวันเป้าหมายของ Goal Plan ที่ Follow-up อ้างอิง × 100 ปัดเป็นจำนวนเต็ม; ไม่นับกิจกรรมที่ไม่เกี่ยวข้อง; “>70%” = มากกว่า 70 อย่างเคร่งครัด (เทียบอัตราส่วนจริงก่อนปัด) |
| BR-05 | **CONFIRMED (รอข้อมูล)** | ใช้รายการคำ (controlled vocabulary พร้อม version) ที่ Owner จะส่งให้ เลือก 1 ค่าต่อ Follow-up; ระหว่างรอ ช่องผลลัพธ์แสดง “ไม่มีแหล่งข้อมูลในระบบ” |
| BR-06/BR-07 | **CONFIRMED** | ฟอร์มติดตามบังคับเลือก ปรับ/ไม่ปรับแผน และ มี/ไม่มีอุปสรรค (+ หมายเหตุอุปสรรคไม่บังคับ ไม่ออกในไฟล์รายงาน); ถ้าปรับแผนให้สร้าง Goal Plan รอบใหม่ |

ข้อที่ยัง OPEN: CL-01..CL-07 (ฝ่ายคลินิก) และรายการคำของ BR-05

**S2a (implemented):** migration `20261012120000_followup_workbook_facts` เพิ่ม `serviceDate`, `planAdjusted`, `hasObstacle`, `obstacleNote` ใน PatientFollowup และ `achievedDays` ใน PatientFollowupActivityProgress (nullable สำหรับ record เก่า; CHECK constraint ช่วง 0–7, NOT_APPLICABLE ต้องว่าง, obstacleNote ต้องมี hasObstacle = true) โดย application บังคับกรอกสำหรับ Follow-up ใหม่ ฟอร์ม/รายละเอียด/ประวัติแสดงค่าใหม่ สูตรอยู่ใน `src/modules/followups/domain/followup-achievement.ts` ใช้ร่วมกันทั้ง workbook และหน้ารายงานบนเว็บ

**S2 ที่เหลือ:** (1) ช่องผลลัพธ์ที่ได้ เมื่อได้รายการคำ BR-05; (2) “วันที่ให้บริการ” ของ Final Assessment (BR-01 ฝั่ง After); (3) ผูก Goal Plan รอบใหม่กับ Follow-up ที่เลือก “ปรับแผน” (ตอนนี้ฟอร์มแจ้งให้สร้างแผนใหม่ แต่ยังไม่มี link ใน schema)

**สถานะ implementation (golden test `hospital-report-workbook-golden.test.ts`):** R24A-D11, BR-01 (Follow-up), BR-02, BR-03, BR-04, BR-06, BR-07 และ BR-08 ถูก implement ใน workbook export แล้ว ความครอบคลุม 108 คอลัมน์ของแถวข้อมูล: SOURCE_READY 85 · DECISION_OPEN 2 · SOURCE_MISSING 21 (เริ่มต้น 27 · 35 · 46) ตาราง §4 เป็น baseline ก่อนการตัดสินใจ ให้ใช้ golden test เป็นสถานะปัจจุบัน

## 6. Implementation slices

ทุก slice ต้องเป็น vertical slice ครบตาม AGENTS.md (schema/migration → service + server-side policy → UI capture → readback/history → projection → workbook cell → tests) และเริ่มได้เฉพาะเมื่อ decision ที่ระบุผ่านแล้ว

| Slice | ขอบเขต | ต้องรอ decision | เปลี่ยน schema | ผลต่อ workbook |
| --- | --- | --- | --- | --- |
| **S0** | Workshop/sign-off decision sheet §5 และยืนยัน visual layout ของ whiteboard | — | ไม่ | เปิดทางทุก slice |
| **S1** | Projection-only: วาง Goal Plan ลง Y–AG, จับคู่ Follow-up กับช่องรอบ, legend อสม., Service 1 ทำ/ไม่ทำ, ไม้บรรทัดวัดใจ Before, HbA1c Before | BR-01, BR-02, BR-03, BR-08, R24A-D11, CL-01 (Before), CL-06 (ไม้บรรทัด) | ไม่ | ⚠️ ส่วนใหญ่ → ✅ |
| **S2** | Structured Follow-up: `serviceDate`, `achievedDays` ต่อกิจกรรม, outcome (vocabulary), planAdjusted + link Goal Plan ใหม่, obstacle; ฟอร์ม อสม./เจ้าหน้าที่; สูตร Achieve | BR-01, BR-04, BR-05, BR-06, BR-07 | ใช่ (additive migration) | Achieve, วันที่ทำได้, อัตรา, >70%, ผลลัพธ์, ปรับแผน, อุปสรรค |
| **S3** | Clinical measurement: HbA1c After, BMI, CVD risk, ปีที่วินิจฉัย, เวลาออกกำลังกาย Baseline/Final, DM/Pre-DM counts | CL-01..05, CL-07 | ใช่ (additive migration) | H, I, L, E, N, Q, AJ–AN, หัวรายงาน |
| **S4** | PAM/PROMs: instrument ที่อนุมัติ + ผูก Program stage | CL-06 | ใช่ | K, L |
| **S6** | Download access & scope: เปิด export ให้ MEMBER ตาม WB-D02 (policy + audit + UI) และตัวกรองเขตความรับผิดชอบตาม WB-D03 หลังมี Area model | WB-D02, WB-D03, AREA-01..05 | Area: ใช่ | ผู้ดาวน์โหลดและขอบเขตตาม whiteboard |
| **S5** | DoD acceptance: golden workbook test จาก synthetic fixture ที่ตรวจทุกคอลัมน์, Owner UAT บน workbook จริง | ทุก slice | ไม่ | ปิด DoD |

ลำดับแนะนำ: S0 → S1 → S2 → S3 → S4 → S6 → S5 โดย S1 ส่งมอบได้เร็วที่สุดเพราะไม่ต้องแก้ schema และ S2 มีผลต่อจำนวนคอลัมน์มากที่สุด

## 7. ข้อจำกัดที่ต้องคงไว้

- ห้ามเติมค่าที่ยังไม่มี decision: ไม่ map RISK → Pre-DM, ไม่แปลง DONE/PARTIAL เป็นจำนวนวัน, ไม่ใช้ recordedAt เป็นวันให้บริการ, ไม่ใช้ Personal Wellness เป็นค่าใน Program, ไม่คัดลอก Before เป็น After, ไม่แทน missing ด้วย 0
- Authorization ของ export คงเดิม: direct Hospital OWNER exact-Hospital และ Global ADMIN selected-Hospital เท่านั้น งานนี้ไม่เปิด export ให้ MEMBER, Area หรือ Parent (RPT-31/32 ยังเป็น gate แยก)
- Field ใหม่ทุกตัวต้องมี actor, เวลา, Program/Follow-up linkage, validation และ readback ในหน้า operational ก่อนขึ้นรายงาน รายงานยังคงเป็น projection ไม่ใช่ source of truth
- Privacy/security approval สำหรับ field ใหม่ที่เป็นข้อมูลสุขภาพเป็น gate แยกจาก decision ทางคลินิก

## 8. Verification

- อ่าน workbook ด้วย exceljs แบบ read-only (header rows 4–8 และหมายเหตุ AH31–AH37) และเทียบกับ export service, projection และ schema ที่ HEAD ข้างต้น
- อ่านข้อความ Canva whiteboard ผ่าน connector และตรวจ visual layout จากภาพ export ครบทั้ง 4 flow (§3.1)
- ไม่มีการเปลี่ยน runtime, schema, migration, policy, test หรือ reporting behavior ในเฟสนี้ จึงไม่ได้รัน test/typecheck/build

## 9. Next step

สถานะ implementation ล่าสุดและหลักฐานการตรวจ: [BF-GAP-WB-01 handoff](./BF_GAP_WB_01_WORKBOOK_S1_S2A_IMPLEMENTATION_HANDOFF.md)

1. Owner และ Clinical authority ตอบ decision sheet §5 (ยอมรับ / แก้ไข / เลื่อน) โดยเฉพาะ WB-D01 และ R24A-D11 ซึ่งกำหนดโครงรอบของทั้งรายงาน และ WB-D02/WB-D03 ซึ่งกำหนดผู้ดาวน์โหลดและขอบเขตข้อมูล
2. เมื่อ BR-01, BR-02, BR-03, BR-08 และ R24A-D11 ผ่าน → เริ่ม **S1**
3. เมื่อ BR-04..07 ผ่าน → เริ่ม **S2**
