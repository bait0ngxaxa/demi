# DEMI Phase 17 — RPT-24 On-demand As-of Excel Export Requirement Contract

- **สถานะ:** RPT-24 AS-OF EXPORT REQUIREMENT RECORDED — FIELD / AUTHORIZATION CONTRACT PENDING — IMPLEMENTATION NOT AUTHORIZED
- **ประเภทงาน:** Documentation-only requirement consolidation และ technical contract preparation
- **ประวัติการจัดทำ (historical provenance):** สร้างบน branch **docs/rpt-24-on-demand-asof-excel-export** สืบทอดจาก **docs/hn-c1-security-disclosure-contract** ณ commit **5c4e509cca5306631014d88fb0918deff077674e**; current repository location แยกบันทึกใน §2
- **ข้อจำกัด:** ไม่อนุมัติการเปิดเผยข้อมูลผู้ป่วยจริง, Product Owner, clinical, security, privacy, data-controller หรือ production use และไม่อนุญาตเริ่ม implementation

## 1. Requirement ที่ผู้ร้องขอยืนยัน

**RPT-24 — On-demand Current Progress Excel Export** คือการส่งออก Excel ตามคำขอของผู้ใช้ เพื่อแสดงความคืบหน้าการดูแลใน Patient Program ตามข้อมูลจริงที่ระบบบันทึกและผู้ใช้มีสิทธิ์เห็นจาก server-side data snapshot ที่ระบุขอบเขตได้ด้วยกลไก consistency ที่อนุมัติ

รายงานหนึ่งชุดอาจมีผู้ป่วยอยู่ในสถานะต่างกัน เช่น ทำ Service 1 แล้วแต่ยังไม่เริ่ม Service 2, ทำ Services 1–4 แล้ว, จบ Program และมี Final Assessment, หรือยังมี Program สถานะ ACTIVE และไม่มี Final Assessment ได้ทั้งหมดเมื่ออยู่ในประชากรและ scope ที่อนุมัติแล้ว ไม่ต้องรอให้ทุก Program เป็น COMPLETED ไม่สร้างค่าบริการหรือผลลัพธ์ที่ไม่มี source และไม่แสดง Program ที่ยังไม่จบเสมือนจบแล้ว

การขอ export ครั้งหลังอาจได้ค่าต่างจากไฟล์เดิม หากมีการบันทึกหรือแก้ไข source เพิ่ม ไฟล์ XLSX ที่ดาวน์โหลดแล้วเป็นสำเนาข้อมูลที่ส่งออกในเวลานั้นเท่านั้น จะไม่รับรอง historical reproducibility หรือการสร้างไฟล์เดิมซ้ำ เว้นแต่มี snapshot/versioning mechanism ที่อนุมัติแยกต่างหาก

ต้องแยกเวลา/ขอบเขตสามชนิดให้ชัด และห้ามใช้แทนกัน:

| ชื่อ | ความหมายที่เสนอ | สิ่งที่ห้ามสรุป |
| --- | --- | --- |
| `requestedAt` | authoritative server timestamp เมื่อรับคำขอ export | ไม่ใช่ database state time และไม่รับรอง source snapshot ที่ query ภายหลังอ่านได้ |
| `dataAsOf` / snapshot boundary | ขอบเขตหรือ identity ของ database read ตามกลไก consistency ที่ยอมรับ; ทุกชีต, cohort count, pagination และ source lookup ต้องอ่านจาก snapshot เดียวกัน | ห้ามตั้งเท่ากับ `requestedAt` หากไม่มีหลักฐานว่า timestamp นั้นตรงกับ database snapshot; ถ้าระบุ wall-clock instant ที่แน่นอนไม่ได้ ให้รายงาน snapshot boundary/identity เท่าที่พิสูจน์ได้ ไม่สร้าง timestamp ปลอม |
| `generatedAt` | authoritative server timestamp เมื่อสร้าง XLSX เสร็จ | ไม่ใช่ `requestedAt` หรือ `dataAsOf`; อาจเกิดภายหลังทั้งสองค่า |

กลไก snapshot, ขอบเขตการได้มาของ snapshot และความสัมพันธ์ระหว่าง `requestedAt` กับ `dataAsOf` ยังเป็น technical design/release gate; ห้ามเลือก PostgreSQL isolation strategy โดยไม่มีหลักฐาน รองรับ concurrent updates, permission revocation และ long-running export เป็น security decisions แยกต่างหาก ทั้งนี้ snapshot ของฐานข้อมูลไม่ได้ระบุว่า clinical event ในโลกจริงเกิดเมื่อใด

ไม่มีการกำหนดรายเดือน รายไตรมาส schedule หรือ publication cycle สำหรับ RPT-24 การจำกัดรอบเวลาที่คิดขึ้นเพื่อแก้ HN-M07 ไม่ถูกนำมาใช้กับ Excel นี้

## 2. ขอบเขตสอง reporting domains

| Domain | วัตถุประสงค์ / grain | ขอบเขตและสถานะ |
| --- | --- | --- |
| Patient Program Operational Excel Export | ทบทวน Before, During, After, การให้บริการและ Follow-up ในระดับ Patient / Hospital relationship / Program; อาจมี PII และข้อมูลสุขภาพรายบุคคล | ต้องมี dedicated export authorization, exact-Hospital cohort contract, field allowlist และ privacy/security acceptance ของตนเอง ทุกเรื่องเหล่านี้ยังเปิด |
| Hospital Network Aggregate Reporting | P = Parent, C = eligible ACTIVE direct children, N = P ∪ C; aggregate เท่านั้นตาม HN-C0/HN-C1 | ไม่ให้ patient-level scope จาก hierarchy; HN-M07 และ historical reparent disclosure ยังเป็น release gates; HN-M08 Network Export คง DEFERRED / NOT AUTHORIZED |

การอนุมัติ exact-Hospital patient/program export ในอนาคตจะไม่ทำให้ Parent OWNER อ่าน Child Hospital roster ได้ ไม่ขยายสิทธิ์จาก Person ที่มีหลาย Hospital relationship และไม่อนุญาต Network Export โดยปริยาย **report:program:read** ที่ติดตั้งอยู่เป็น exact-Program factual read เท่านั้น ไม่ใช่ cohort หรือ export permission

ประวัติเอกสาร: HN-C1 ถูกจัดทำบน `docs/hn-c1-security-disclosure-contract` (security contract commit `7ef8c3d`, decision direction commit `5c4e509`); เอกสาร RPT-24 นี้ถูกจัดทำบน `docs/rpt-24-on-demand-asof-excel-export` และ commit `ba49040` ณ preflight ของ RPT-24A, HN-C1 และ RPT-24 commit เป็น ancestors ของ `main` ที่ `ba49040c7a674008a10493ae5cf5c7a99b7e6bfc` เอกสารปัจจุบันอยู่ใน repository history ของ `main`; branch ข้างต้นเป็น historical development provenance ไม่ใช่สถานะการ merge ปัจจุบัน

Git merge ระบุเพียง repository location ไม่ใช่ Product Owner, security, privacy, clinical, data-controller หรือ implementation approval สถานะ HN-C1 ยังคง security/privacy acceptance pending, HN-M06-T01–T09 ไม่เปลี่ยน, HN-M07 และ historical reparent disclosure ยังเป็น release gates, HN-M08 ยังคง DEFERRED / NOT AUTHORIZED, HN-C1-D07 ยัง OPEN และไม่มี Controlled Reporting Release ของ Network aggregates ได้รับอนุมัติจาก RPT-24

สำหรับข้อเสนอด้านประชากร, row grain, identity และ workbook field ให้ดู [RPT-24A Customer Workbook Decision Pack](./PHASE_17_RPT24A_CUSTOMER_WORKBOOK_DECISION_PACK.md); เป็นข้อเสนอรอ requester/customer acceptance ไม่ใช่การปิด gate หรืออนุมัติ implementation

## 3. หลักฐานและสถานะการตัดสินใจ

เอกสารนี้แยกแหล่งข้อมูลดังนี้:

- **REQUESTER-CONFIRMED REQUIREMENT** — ยืนยันเฉพาะวัตถุประสงค์และเวลา on-demand As-of ของ RPT-24
- **VERIFIED CURRENT IMPLEMENTATION** — พฤติกรรมที่ตรวจพบใน schema, service, policy, projection และ test source ณ baseline ข้างต้น
- **SOURCE AVAILABLE / SEMANTICS OPEN** — มี field หรือ record จริง แต่ยังไม่มีสัญญาความหมาย หน่วย ช่วงเวลา หรือการแสดงผลที่อนุมัติ
- **PROPOSED TECHNICAL CONTRACT** — ข้อเสนอเพื่อ review; ยังไม่ใช่ permission, accepted design หรือ implementation authorization
- **OPEN REQUIREMENT / RELEASE GATE** — ต้องได้ decision/evidence จาก authority ที่ระบุ ก่อนพัฒนา/เปิดเผย

### 3.1 ตรวจ customer workbook จริง

ไฟล์ [Dashboard App Demi.xlsx](../Dashboard%20App%20Demi.xlsx) มี 2 worksheet และเป็น template ว่าง:

| Worksheet (ชื่อตาม workbook) | Used range | สิ่งที่แสดง |
| --- | --- | --- |
| Dashboard ภาพรวม | A1:AQ29 | ข้อมูล Hospital/cohort, แถวผู้ป่วย, Before, Follow-up ตำแหน่งที่มองเห็น 1–6 และ After |
| รายงานการจัดบริการ | A1:BM37 | Hospital/patient context, Before/After, Service 1, Service 2, Service 3–6 และหมายเหตุเรื่อง service completeness |

Workbook SHA-256 ที่ตรวจ: **f70b4fc42d31b5ca5fb9b9f8f915a91709b376a31839fa420a62f8103efe7d43**; ไม่มี cell formula ในสอง sheet นี้ ณ baseline เป็นหลักฐานรูปแบบนำเสนอ ไม่ใช่ source of truth, schema, clinical formula หรือ permission contract

ใน worksheet ที่สองมีข้อความคาดหวัง Follow-up ประมาณ 2–4 ครั้งต่อ Program และระบุว่ารายงานสรุปความครบถ้วนของการจัดบริการ หากต้องการรายละเอียดให้ดูบันทึกรายบุคคล ให้รักษาความหมายนี้ไว้: **2–4 เป็นความคาดหวัง ไม่ใช่ขั้นต่ำ/ขั้นสูงสุดหรือ completion rule** และ workbook summary ไม่แทน detailed patient record

รายการ field ของสอง worksheet ต่างกัน ต้องคง field set ตามแต่ละ sheet ห้ามเติม PAM/PROM หรือ exercise fields ของ Sheet 2 ลง Sheet 1 หรือย้าย field ข้าม sheet โดยไม่มี customer decision

### 3.2 Reconcile กับเอกสารเก่าและโค้ดปัจจุบัน

Phase 15A และ 15E เป็นหลักฐานการตัดสินใจและสภาพระบบในเวลานั้น ไม่ใช่สถานะ implementation ปัจจุบันโดยอัตโนมัติ การตรวจ source ณ baseline นี้พบว่า:

- **PatientBaseline** ปัจจุบันมี nullable **hba1c** และ **heightCm** จริง และ Baseline schema, service, query และ UI helper รองรับ field เหล่านี้ แต่ Program reporting projection ยังไม่ select หรือ expose สอง field นี้
- **PatientClassification** ปัจจุบันมี **RISK** และ **DIABETES** พร้อม history แต่เป็น current state ระดับ PatientProfile ไม่ใช่ค่า **Pre-DM/DM** ที่เทียบความหมายทางคลินิกได้ และไม่เป็น Program-stage snapshot
- GoalPlan และ Follow-up มี normalized Program linkage และ structured target/progress data; Follow-up progress เป็นสถานะ **DONE**, **PARTIAL**, **NOT_DONE**, **NOT_APPLICABLE** ไม่ใช่จำนวนวันที่ทำได้หรือ achievement percentage
- Final Assessment เป็น record 0..1 ที่ผูก Program โดยตรงและมี raw measurement บางรายการ; Program completion ไม่ได้พิสูจน์ว่ามี Final Assessment
- ไม่พบ Excel export endpoint, export capability หรือ cohort report service; มีเฉพาะ exact-Program reporting projection/read UI ส่วน Excel implementation ที่พบเป็น Patient import/template tooling

## 4. Source และ authorization audit ปัจจุบัน

| ความรับผิดชอบ | หลักฐานปัจจุบัน | ความหมายต่อ RPT-24 |
| --- | --- | --- |
| Exact Program | **PatientProgram** ผูกกับ **PatientHospitalRelationship**, มี ACTIVE/COMPLETED, startedAt, completedAt, optional initialBaselineId; report query รับ exact relationship ID และ Program ID | Source รองรับรายงานหนึ่ง Program ต่อคำขอ; ยังไม่มี cohort export query |
| Before / Baseline | Baseline หนึ่งรายการต่อ Hospital relationship; Program link ผ่าน initialBaselineId; source มี recordedOn, createdAt, weight, heightCm, waist, BP, DTX, HbA1c, confidence และ note fields | ใช้เฉพาะ Baseline ที่ Program link ระบุได้; ห้ามเลือก Baseline อื่นหรืออนุมานจากเวลา; current Program report projection ไม่รวม height/HbA1c/confidence |
| Service 1 | Routine, Floating Chart, Dream Card, Confidence เป็น record แยกต่อ Program; บางรายการมี text/evidence association | record ยืนยันว่ามีข้อมูลกิจกรรมถูกบันทึกใน DEMI เท่านั้น ไม่พิสูจน์การให้บริการหรือ completion; ไม่มี overall Service 1 completion rule; record absence ไม่ได้พิสูจน์ว่าไม่ได้ให้บริการ; content/attachment disclosure ต้องตัดสินใจแยก |
| Service 2 | GoalPlan 0..N ต่อ relationship และอาจ link exact Program; GoalPlan มี template/version, goal codes, notes และ GoalItem มี target days/value/unit | มี target facts ไม่เท่ากับ achieved days/outcome; GoalPlan ที่ patientProgramId = null เป็น legacy/unlinked และห้ามโยงเข้ากับ Program เอง |
| Follow-up | Follow-up 0..N; patientProgramId nullable; มี round, server recordedAt, createdAt, measurements, notes และ ActivityProgress status/note | ใช้เฉพาะ exact Program-linked records; recordedAt ไม่ใช่ clinical observation/encounter date; 0..N ไม่ใช่หก |
| Final | Final Assessment 0..1 ต่อ Program; exact Program/relationship foreign key; raw DTX, weight, waist, BP และ recordedAt | แยก Program.status จากการมี Final; missing Final ไม่ใช่ zero และไม่ลบความจริงว่า Program อาจ COMPLETED |
| Patient identity | Person.givenName/familyName, PatientProfile และ PatientHospitalRelationship.hospitalNumber nullable | ชื่อและ ID เป็น PII; HN เป็น candidate ไม่ใช่ approved customer-facing ID; internal UUID ห้ามแสดงแทน |
| Classification | Current PatientProfile classification RISK/DIABETES และ Patient-global history; current count query จำกัด Hospital แล้วนับ PatientHospitalRelationship rows | ไม่ยืนยันว่า RISK = Pre-DM; นับ relationship ไม่ใช่ unique Person; cohort grain, deduplication และ historical state ยังต้องตัดสินใจ |
| OSM | PatientOsmAssignment ผูกกับ exact Hospital relationship และเก็บ created/ended timestamp; OSM identity เป็น User/Person; policy ปัจจุบันตรวจ exact active assignment และ ACTIVE OSM-Hospital relationship | current assignment หาได้ แต่การแสดง current ณ export เทียบกับผู้รับผิดชอบช่วง Program/Follow-up ยังไม่อนุมัติ |
| Program report access | report:program:read ใช้ direct ACTIVE HOSPITAL OWNER/MEMBER ต่อ exact Hospital หรือ OSM ที่มี exact active assignment; ADMIN-only/PATIENT-only ไม่มีสิทธิ์; access service re-read active User/roles/membership จาก DB | อนุญาตเฉพาะ exact Program read ปัจจุบัน ไม่ได้อนุญาต roster/cohort/XLSX; export capability ยังไม่มี |
| Read consistency | Program report API รับ optional Prisma transaction client แต่ไม่ได้เปิด transaction เอง; อ่าน access, Program, Baseline, Final, GoalPlan และ Follow-up หลาย query และ query page/count บางส่วนทำพร้อมกัน | การแยก `requestedAt` ไม่ทำให้ข้อมูลหลาย query เป็น snapshot เดียว; coherent `dataAsOf`/snapshot boundary สำหรับทั้ง workbook, counts, pagination และ source lookup รวมถึง revocation behavior เป็น release gate |

source paths ที่ตรวจจริงระบุไว้ใน [evidence index](#14-evidence-index) เอกสารเก่าอ้าง field ที่ยังไม่มีในเวลานั้นได้ถูกเก็บไว้เป็น historical observation; mapping ด้านล่างยึด current implementation

## 5. Field-to-source mapping — Sheet 1

สัญลักษณ์ในคอลัมน์ readiness เป็นสถานะหลักของ field; ทุกแถวที่เป็น patient/program data ยังต้องผ่าน dedicated export authorization และ exact-Hospital scope ก่อนแสดง Readiness ไม่ใช่การอนุมัติให้เปิดเผย

| Cell / header และ label | ความหมาย / candidate source / grain | Current source, time และ missing behavior | Readiness / sensitivity / ปลอดภัยพอจะ project หรือไม่ |
| --- | --- | --- | --- |
| A1 — Hospital / รพ.สต. | Hospital context; Hospital, grain = Hospital | มี Hospital.name; ไม่ใช่ข้อมูลผู้ป่วย | VERIFIED_FACTUAL_SOURCE; organizational; แสดงได้ต่อเมื่อ exact scope/actor อนุมัติ |
| A2, C2, C3 — จำนวนเคส, เบาหวาน, กลุ่มเสี่ยง (Pre-DM) | Cohort counts; grain และ denominator ต้องระบุว่าเป็น Patient หรือ Hospital relationship | ปัจจุบันมี RISK/DIABETES current classification; RISK ไม่ยืนยัน Pre-DM; Patient-global state อาจปรากฏผ่านหลาย Hospital relationships | DERIVED_RULE_NOT_APPROVED; sensitive aggregate; ยัง project ไม่ได้จนปิด RPT-06/RPT-28 |
| A4:A7 — ลำดับ | แถวลำดับการนำเสนอ; presentation grain | ไม่มี domain source; ลำดับขึ้นกับ sort ที่ยังไม่ตัดสินใจ | PRESENTATION_ONLY; ไม่ใช่ clinical fact; ต้องกำหนด stable ordering ก่อนสร้างไฟล์ |
| B4:C7 — รายชื่อ / ชื่อ / สกุล | Patient identity; Person/PatientProfile, grain = Patient relationship row | ชื่อ nullable; ไม่มี approved cohort projection หรือ missing-name rule | AUTHORIZATION_REQUIRED; direct PII; ยังไม่ปลอดภัยจนอนุมัติ actor, population และ display rule |
| D4:D7 — ID | Customer-facing Patient identifier; candidate = exact relationship hospitalNumber | Nullable, Hospital-local candidate; internal UUID ไม่ใช่ display ID | CUSTOMER_DECISION_REQUIRED; direct identifier; ห้าม project จน RPT-03 อนุมัติ label, uniqueness, null/fallback และ visibility |
| E4:E7 — ระยะเวลาการเจ็บป่วย | Illness duration; grain = Patient/Program ยังไม่ชัด | ไม่พบ authoritative field หรือ start date ใน PatientProfile/relationship/Program ที่กำหนดความหมายนี้ | NO_AUTHORITATIVE_SOURCE; sensitive health inference; ห้ามคำนวณ/ประมาณ |
| F4:F7 — อสม.ที่ดูแล | OSM assigned to Patient; exact relationship and OSM User | ปัจจุบันมี active assignment และประวัติ created/ended; timestamp เป็น lifecycle assignment ไม่ใช่หลักฐานว่าดูแลทุกจุดใน Program | SOURCE_AVAILABLE_SEMANTICS_OPEN; workforce PII; ห้ามระบุอดีต/ข้าม Hospital จน RPT-05 และ disclosure decision อนุมัติ |
| G5 — วันที่เริ่มโปรแกรม | Program lifecycle start; PatientProgram.startedAt, grain = Program | Current factual timestamp มี; ไม่ใช่วันเริ่มบริการ/clinical observation โดยปริยาย | VERIFIED_FACTUAL_SOURCE; sensitive Program context; project ได้เฉพาะหลัง auth และอนุมัติ label/timezone |
| H5 และ AJ5 — CVD risk score | Clinical risk score; derived/imported field | ไม่พบ authoritative source, algorithm หรือ version | NO_AUTHORITATIVE_SOURCE; sensitive clinical/derived; ห้ามคำนวณหรือ project |
| I5 และ AK5 — HbA1C | Before/After HbA1c; Baseline/Final grain | Baseline field hba1c มี nullable และใช้บันทึกได้; Final ไม่มี HbA1c; reporting projection ยังไม่ select Baseline field; unit/context/observation source unresolved | SOURCE_AVAILABLE_SEMANTICS_OPEN; clinical; ไม่พร้อม project จน clinical/data authority รับรอง measurement semantics, stage และ display |
| J5 — Before DTX | Baseline bloodSugarDtx, grain = linked Baseline | Raw nullable field มีและอยู่ใน exact-Program report projection; recordedOn เป็น business DATE, createdAt เป็น persistence timestamp; fasting/random/unit ไม่กำหนด | SOURCE_AVAILABLE_SEMANTICS_OPEN; clinical; project ได้หลัง unit/context/Before wording และ auth อนุมัติ; null ต้องไม่กลายเป็น 0 |
| K5 — Before BW | Baseline weight | Raw nullable field มีและ report projection select; schema ไม่กำหนด report unit/clinical observation semantics | SOURCE_AVAILABLE_SEMANTICS_OPEN; clinical; ยังไม่แสดงจน unit/date/context และ missing format อนุมัติ |
| L5 และ AN5 — BMI | Derived BMI at Before/After | ไม่มี stored BMI หรือสูตรที่อนุมัติ; height กับ weight ต้องจับคู่ช่วงเวลาถูกต้อง | DERIVED_RULE_NOT_APPROVED; clinical; ห้ามคำนวณ |
| M5 — ส่วนสูง | Baseline heightCm, grain = relationship/Baseline | Nullable source และ Baseline query/schema มี; ไม่ใช่ height at every Program stage; Program report projection ไม่ select | SOURCE_AVAILABLE_SEMANTICS_OPEN; clinical; ชื่อ field ระบุ cm แต่ validation, timing, reuse และ output semantics ยังต้องยืนยัน |
| N5 และ AO5 — รอบเอว | Baseline/Final waistCircumference | Raw nullable source และ Program projection มี; ไม่มี unit/clinical observation date ที่ผูกกับทุก stage | SOURCE_AVAILABLE_SEMANTICS_OPEN; clinical; ต้องยืนยัน unit/stage/missing semantics ก่อน |
| O5:P7 และ AP5:AQ7 — BP ตัวบน/ตัวล่าง | Systolic/diastolic Baseline/Final | Raw nullable source และ report projection มี; ไม่มี unit/measurement context contract | SOURCE_AVAILABLE_SEMANTICS_OPEN; clinical; ห้ามเติมค่าคู่ที่ขาดหรือสร้างผลสรุป |
| G4:P4 — ข้อมูลเริ่มต้น (Before) | กลุ่มเริ่มต้นของ Program | Group label จาก workbook; ไม่ใช่ source record หรือเวลา | PRESENTATION_ONLY; mapping ของค่าราย field อยู่ด้านล่าง |
| Q4:AH4 — ระหว่างอยู่ในโปรแกรม; Q:S, T:V, W:Y, Z:AB, AC:AE, AF:AH | Follow-up positions 1–6; Program → Follow-up | Source normalized เป็น 0..N; exact Program query เรียง roundNumber/id และแบ่งหน้า ไม่ได้มีคอลัมน์ slot ถาวร | CUSTOMER_DECISION_REQUIRED; patient/clinical; ห้ามตัด records ที่เกิน 6; layout/overflow gate ยังเปิด |
| Q6/R6, T6/U6, W6/X6, Z6/AA6, AC6/AD6, AF6/AG6 — DTX/BW ต่อ slot | Raw Follow-up measurements | Nullable bloodSugar/weight ต่อ Follow-up; report projection มี; recordedAt/createdAt เป็น application/persistence times ไม่ใช่ observation date โดยยืนยัน | SOURCE_AVAILABLE_SEMANTICS_OPEN; clinical; ต้องยืนยัน units/context/time labels และ slot mapping |
| S6, V6, Y6, AB6, AE6, AH6 — Achieve score ต่อ slot | Achievement rate/score | ไม่มี rate field; goal targets และ categorical ActivityProgress ไม่ได้บันทึก achieved-day numerator/denominator | DERIVED_RULE_NOT_APPROVED; clinical; ห้าม derive จากจำนวนสถานะ, targetDays หรือจำนวน Follow-up |
| AI4:AQ4 — After; AI5:AI7 — วันที่สิ้นสุดโปรแกรม | After group heading และ Program lifecycle completion; completedAt | Group label เป็น presentation; completedAt nullable exact Program field; ACTIVE อาจไม่มีวันสิ้นสุด; COMPLETED และ Final Assessment เป็นคนละสถานะ | VERIFIED_FACTUAL_SOURCE เฉพาะ completedAt; patient/program-sensitive; project หลัง auth; null ไม่ใช่วันที่หรือ completion value |
| AL5/AM5 — After DTX/BW; AO5 — After waist; AP7:AQ7 — After BP | Final Assessment fields | Final raw nullable source และ report projection มีเมื่อ record exists; Final 0..1 และแยกจาก Program status | SOURCE_AVAILABLE_SEMANTICS_OPEN; clinical; แสดงเฉพาะ fact ที่มีจริงหลัง stage/unit/auth approval |

ช่องว่างใน template และค่าที่ไม่มี linked source ต้องยังแยกจาก recorded zero, ไม่มี Final, ไม่มี Baseline, ไม่มี Follow-up และข้อมูลที่ export ไม่ได้รับอนุญาตให้เห็น นโยบาย Excel blank/label ยังเป็น RPT-22 decision

## 6. Field-to-source mapping — Sheet 2

| Cell / header และ label | ความหมาย / candidate source / grain | Current source, time และ missing behavior | Readiness / sensitivity / ปลอดภัยพอจะ project หรือไม่ |
| --- | --- | --- | --- |
| A1 — Service Process record | Sheet title | Text คงที่ใน workbook; ไม่ใช่ domain field | PRESENTATION_ONLY; ไม่ต้องอ่าน source |
| A2 — Hospital / รพ.สต. | Hospital context; Hospital grain | Hospital.name มี; exact Hospital export authorization ยังไม่มี | VERIFIED_FACTUAL_SOURCE; organizational; ขึ้นกับ scope/auth |
| A3, C3:C4 — จำนวนเคส / เบาหวาน / กลุ่มเสี่ยง (Pre-DM) | Cohort counts | ใช้ classification ปัจจุบันไม่ได้แทน DM/Pre-DM; no accepted denominator | DERIVED_RULE_NOT_APPROVED; sensitive aggregate; ห้าม project จน RPT-06/RPT-28 ปิด |
| A5:A8 — ลำดับ; B5:C8 — ชื่อ/สกุล | Row ordering และ Patient identity | ลำดับเป็น presentation; ชื่อมาจาก Person nullable; ไม่มี export cohort permission | PRESENTATION_ONLY สำหรับลำดับ; AUTHORIZATION_REQUIRED สำหรับชื่อ/PII |
| D5:D8 — ID | Customer-facing Patient ID | Candidate nullable PatientHospitalRelationship.hospitalNumber; UUID ไม่ใช่ substitute | CUSTOMER_DECISION_REQUIRED; ห้าม project ก่อน RPT-03 |
| E5:E8 — ระยะเวลาการเจ็บป่วย | Illness duration | ไม่มี authoritative source/definition | NO_AUTHORITATIVE_SOURCE; ห้ามคำนวณ |
| F5:F8 — อสม.ที่ดูแล | OSM name/context | Assignment current/history source มี แต่เวลารับผิดชอบ Program และการเปิดเผยชื่อยังไม่อนุมัติ | SOURCE_AVAILABLE_SEMANTICS_OPEN; workforce PII; RPT-05 open |
| G5:G8 — วันที่เริ่มเข้าโปรแกรม; H5:H8 — วันที่สิ้นสุด | Program startedAt/completedAt; grain = Program | Lifecycle timestamps มี; ไม่ได้ยืนยันวันบริการ/observation; completedAt nullable | VERIFIED_FACTUAL_SOURCE; project หลัง auth และ timezone/label decision |
| I5:N5 — Before | Assessment group heading | Presentation only; ไม่สร้าง semantic stage | PRESENTATION_ONLY; RPT-07/10–16 |
| I6:I8 — DTX; J6:J8 — BW | Linked Baseline bloodSugarDtx/weight | Nullable raw values; Program report selects both; Baseline link exact; units/context/time basis open | SOURCE_AVAILABLE_SEMANTICS_OPEN; sensitive clinical; ไม่แปลง unit/เติม null |
| K6:K8 — PAM score; L6:L8 — PROMs score | Screening/assessment candidate, grain = relationship assessment | Screening source เก็บ versioned responses/result ใน JSON; เป็น prototype และไม่มี Program-linked Before selection ใน report projection | SOURCE_AVAILABLE_SEMANTICS_OPEN; sensitive assessment; ยัง project ไม่ได้จนยืนยัน instrument, scoring, version, stage, linkage และ authorization |
| M6:M8 — คะแนนไม้บรรทัดวัดใจ | Baseline confidence / Service 1 confidence candidate | Nullable Baseline confidenceScore และ per-Program ServiceOneConfidence.score มี; same meaning/stage ไม่ยืนยัน | SOURCE_AVAILABLE_SEMANTICS_OPEN; sensitive assessment; ห้ามเลือกแทนกันโดยไม่มี decision |
| N6:N8 — เวลาออกกำลังกาย/สัปดาห์ | Observed weekly exercise time | Baseline ไม่มี observed weekly-time field; GoalPlan target ไม่ใช่ performed activity | NO_AUTHORITATIVE_SOURCE; ห้ามนำ target มาแสดงเป็นผลจริง |
| O5:R5 — After | Assessment group heading | Presentation only; official After linkage/timing ต้องอนุมัติ | PRESENTATION_ONLY; RPT-09 |
| O6:O8 — DTX; P6:P8 — BW | Program Final Assessment bloodSugar/weight | Nullable raw source; Final 0..1; ไม่มี HbA1c, height, BMI หรือ official stage rule ใน Final | SOURCE_AVAILABLE_SEMANTICS_OPEN; clinical; แสดงได้เมื่อ Final/stage/unit/auth rules ผ่าน |
| Q6:Q8 — เวลาออกกำลังกาย/สัปดาห์ | Observed weekly exercise time after Program | ไม่มี authoritative observation source | NO_AUTHORITATIVE_SOURCE; ห้ามแทนด้วย GoalPlan target |
| R6:R8 — จำนวนครั้งที่อัตราความสำเร็จตามเป้าหมาย >70% | Count of Follow-ups over threshold | ไม่พบ accepted achievement rate, threshold population, denominator หรือ formula | DERIVED_RULE_NOT_APPROVED; clinical aggregate; ห้ามคำนวณ |
| S5:X5 — บริการครั้งที่ 1: รู้จักตัวเอง; S6:T8 — กราฟวัดลอยจม ทำ/ไม่ทำ | Service 1 Floating Chart record state | Per-Program record และ optional Evidence association มี; projection แสดง presence/metadata ไม่ใช่รายละเอียดไฟล์; no record means not recorded in DEMI | SOURCE_AVAILABLE_SEMANTICS_OPEN; patient/evidence-sensitive; project only as “มี/ไม่มีบันทึก” or after customer accepts workbook yes/no mapping; no inference about real-world delivery; no attachment by default |
| U6:V8 — การ์ดความฝัน ทำ/ไม่ทำ | Service 1 Dream Card record state | Per-Program record/evidence association มี; description เป็น content; no record means not recorded in DEMI | SOURCE_AVAILABLE_SEMANTICS_OPEN; free text/image sensitive; same recorded-versus-delivered distinction; content needs separate allowlist |
| W6:X8 — ตารางกิจวัตร ทำ/ไม่ทำ | Service 1 Routine record state | Per-Program routine record/optional artifact association มี; no record means not recorded in DEMI | SOURCE_AVAILABLE_SEMANTICS_OPEN; evidence-sensitive; may report record presence only after auth and accepted wording; absence is not proof of non-delivery |
| Y5:AG5 — บริการครั้งที่ 2: ทำแผนสุขภาพ เป้าหมายเล็กๆที่ตั้งไว้ | Goal Plan heading | Program GoalPlan/GoalItem 0..N; legacy unlinked records แยกอยู่; presence records a documented plan, not achievement or delivery | PRESENTATION_ONLY; ต้องใช้ exact Program-linked plans เท่านั้น |
| Y6:Z8 — การลดมื้ออาหาร มี/ไม่มี; AA6:AB8 — การเปลี่ยนอาหาร มี/ไม่มี | Food goal categories | Candidate GoalItem activityCode, versioned template และ target; ไม่มี fixed workbook boolean source | SOURCE_AVAILABLE_SEMANTICS_OPEN; sensitive behavior; ห้าม infer label/presence จาก code จน mapping/version อนุมัติ |
| AC6:AC8 — จำนวนมื้อ/สัปดาห์ | Food frequency target | Candidate GoalItem targetDays/targetValue/targetUnit; no accepted mapping to this cell | SOURCE_AVAILABLE_SEMANTICS_OPEN; target ไม่ใช่ achievement; ห้าม aggregate/convert |
| AD6:AE8 — มีการตั้งเป้าออกกำลัง; AF6:AF8 — จำนวนวัน/สัปดาห์; AG6:AG8 — รวมเวลา/สัปดาห์ | Exercise goal/frequency/duration target | GoalItem target fields มีแบบ normalized; unit/code/templateVersion ต้องตีความตาม template; no observed completion total | SOURCE_AVAILABLE_SEMANTICS_OPEN; behavior/health-sensitive; display as target only after customer mapping and units approval |
| AH5:AO5, AP5:AW5, AX5:BE5, BF5:BM5 — บริการครั้งที่ 3, 4, 5, 6: ติดตามการฝึกซ้อมพฤติกรรม | Visible Follow-up positions | Source Follow-up 0..N; Service 3–6 เป็น workbook positions ไม่ใช่ DB service cardinality | CUSTOMER_DECISION_REQUIRED; ห้ามละ Follow-up เกินตำแหน่ง |
| AH6, AP6, AX6, BF6 — วันที่ติดตาม | Follow-up time | PatientFollowup.recordedAt เป็น server-controlled recording time; ไม่มี generic observation/visit date; optional appointment link ไม่ได้ยืนยันวันเกิดข้อมูล | SOURCE_AVAILABLE_SEMANTICS_OPEN; sensitive timeline; ห้ามติดป้ายเป็น clinical date ก่อนอนุมัติ |
| AI6, AQ6, AY6, BG6 — จำนวนวันที่ทำได้ | Completed days | Follow-up มี categorical status ต่อ activity แต่ไม่มี numeric achieved-day count | NO_AUTHORITATIVE_SOURCE; ห้ามคำนวณจากจำนวนสถานะหรือ target |
| AJ6, AR6, AZ6, BH6 — อัตราความสำเร็จตามเป้า | Achievement rate | ไม่มี stored rate/numerator; target days/value ไม่พอระบุช่วงเวลาและ achieved count | DERIVED_RULE_NOT_APPROVED; ห้ามคำนวณ |
| AK6, AS6, BA6, BI6 — ผลลัพธ์ที่ได้ | Outcome phrase/code | Follow-up มี free-text note fields; ไม่มี structured outcome vocabulary; reporting projection ไม่ได้อนุมัติ note disclosure | NO_AUTHORITATIVE_SOURCE สำหรับ controlled outcome; ห้ามจัด text เป็น success/improved/failure |
| AL6:AM8, AT6:AU8, BB6:BC8, BJ6:BK8 — ปรับแผน/ไม่ปรับ | Plan adjustment | GoalPlan rounds มี แต่การมี Plan ใหม่ไม่ได้พิสูจน์ว่าเป็นการปรับจาก Follow-up นั้น | NO_AUTHORITATIVE_SOURCE; ห้าม infer จากจำนวน Plan หรือแก้ไขข้อมูล |
| AN6:AO8, AV6:AW8, BD6:BE8, BL6:BM8 — มี/ไม่มีอุปสรรค | Obstacle flag | Baseline adaptationObstacles และ Follow-up free text ไม่ใช่ structured Follow-up obstacle flag | NO_AUTHORITATIVE_SOURCE; ห้ามตีความ null/ไม่มี note เป็น “ไม่มีอุปสรรค” |
| AI31:BM37 — หมายเหตุและ 2–4 Follow-ups โดยคาดหวัง | Workbook instruction/completeness note | ไม่มี persistence cardinality constraint ที่ 2 หรือ 4; source เป็น 0..N | PRESENTATION_ONLY; รักษาเป็นความคาดหวัง ไม่ทำเป็น validation หรือ completion rule |

### 6.1 สถานะการแสดงผลร่วม

Current Program report projection ใช้ state แยกสำหรับ recorded value, nullable/missing source, missing linked Baseline, missing Final และ missing Service 1 record ค่า 0 ที่บันทึกไว้ต้องคงเป็น factual zero ต่างจาก null, ไม่มี row, ไม่มี linkage, withheld หรือ unauthorized ห้ามยุบสถานะเหล่านี้เป็นช่องศูนย์ใน Excel

แม้ field readiness ระบุว่ามี factual source ก็ยังต้องพิจารณาว่าอนุมัติให้ใช้กับ export นี้หรือไม่ โดยเฉพาะ free text, ชื่อ, HN, ภาพ/evidence, PAM/PROM, clinical measurement และ current/historical OSM

## 7. Report grain, Program isolation และ Follow-up overflow

### 7.1 Candidate row-granularity

1. **แนะนำให้พิจารณา 1 row ต่อ 1 Patient Program** โดย exact patientHospitalRelationshipId + patientProgramId เป็น internal row key; Patient ที่มีหลาย Program จะมีหลาย row และห้ามรวม before/follow-up/final ข้าม Program
2. **1 row ต่อ Patient relationship** แล้วอัดหลาย Program ลงช่องเดียว เป็นทางเลือกที่เสี่ยงต่อความกำกวมของ lifecycle และ stage; ไม่ควรเลือกโดยไม่เห็นตัวอย่าง customer และ acceptance
3. **1 row ต่อ Follow-up** อาจใช้เป็น detail table/sheet เพิ่ม แต่ไม่ใช่ workbook สองชีตปัจจุบันโดยอัตโนมัติ และต้องอนุมัติ layout/การเชื่อมกับ Program row

ยังไม่ปิดการตัดสินใจว่าประชากรประกอบด้วยทุก Program ของ exact Hospital relationship หรือ filter status/date/assignment แบบใด ผู้ป่วยหนึ่งคนที่มีหลาย Hospital relationships ต้องถูกประมวลผลเป็นคนละ relationship scope; ห้าม join/deduplicate ด้วย Person ID เพื่อเปิดเผย record ของ Hospital อื่น

### 7.2 การเลือก source ต่อ Program

- **ACTIVE และ COMPLETED** เป็น lifecycle ที่ต้องรองรับในการพิจารณา export; completion ไม่ใช่เงื่อนไขให้ row ปรากฏ
- **Before** ใช้เฉพาะ initialBaselineId ของ Program; ถ้าไม่มี link ให้รายงานว่าไม่มี linked Baseline ตาม presentation rule ที่อนุมัติ ไม่เลือก Baseline ล่าสุดเอง
- **Service 1** ใช้ record ที่ผูกกับ Program นั้น; สรุปการมี record ไม่ใช่การอ่าน/แนบ detailed evidence
- **Service 2** ใช้ GoalPlan ที่ผูก exact Program เท่านั้น; GoalPlan เก่าที่ patientProgramId เป็น null ไม่ถูก backfill/infer
- **Follow-up** ใช้รายการที่ patientProgramId และ patientHospitalRelationshipId ตรงกับ Program; 0..N; query ปัจจุบันเรียงตาม roundNumber/id และแบ่งหน้า
- **Final** ใช้ Final ที่ผูก exact Program; อาจไม่มีทั้งใน ACTIVE หรือ COMPLETED Program; ห้ามสร้าง Final จาก Follow-up ล่าสุด
- **OSM** ต้องตัดสินใจว่าจะ report current assignment ณ export As-of หรือ attribution ณ Program/Follow-up time; ห้ามใช้ current assignment มาอ้างย้อนหลังโดยปริยาย
- **ลำดับแถว** ต้อง deterministic และมี unique tie-breaker; customer order, Thai collation, null identifier และ privacy ของ sort key ยังต้องกำหนด

Current report query รองรับ GoalPlan/Follow-up page size 20 โดย default และสูงสุด 50 ต่อหน้า ไม่ใช่ XLSX row cap และไม่รับประกันว่าการอ่านหลายหน้าจะเป็น snapshot เดียว

### 7.3 หกตำแหน่ง Follow-up ใน workbook

หกตำแหน่งเป็น presentation choice เท่านั้น ไม่ใช่ข้อจำกัดฐานข้อมูล และไม่ขัดกับความคาดหวัง 2–4 ครั้ง:

- ทางเลือก A: ทำซ้ำ Program row/กลุ่มบริการในแนวตั้งโดยแสดง Follow-up ทุก record
- ทางเลือก B: คง Summary sheet และเพิ่ม detail Follow-up sheet ที่มี record ครบ
- ทางเลือก C: ออก workbook เฉพาะเมื่อไม่เกินหกและปฏิเสธ/แจ้ง unavailable อย่างชัดเจนเมื่อเกิน

ยังไม่เลือกทางเลือกใด ห้าม truncate รายการที่เกินหกหรือบอกว่าข้อมูลครบหากมี Follow-up ที่ไม่แสดง

## 8. As-of export และ data correctness

กระบวนการต่อไปนี้เป็น **PROPOSED TECHNICAL PROCESS** ไม่ใช่ implementation approval:

1. ผู้ใช้เริ่ม XLSX export; server บันทึก `requestedAt` เป็นเวลารับคำขอเท่านั้น
2. Resolve authenticated User จาก server session; ไม่รับ role/scope จาก client
3. ตรวจ dedicated export capability และ exact Hospital reporting scope ตาม policy ที่อนุมัติ
4. ได้มาซึ่ง coherent database snapshot ตาม approved consistency contract แล้วระบุ `dataAsOf` เป็น wall-clock boundary หรือ snapshot identity เท่าที่ระบบพิสูจน์ได้; ระบุความสัมพันธ์กับ `requestedAt` อย่างตรงไปตรงมา
5. เลือก exact-Hospital Patient relationship และ Program population ตาม approved filters; ห้ามข้าม Hospital ผ่าน shared Person
6. อ่าน Program, counts, linked source records และทุก page ที่ต้องใช้ รวมถึงข้อมูลของทั้งสอง worksheet จาก snapshot เดียวกัน
7. project เฉพาะ factual allowlist ของ Before/During/After และ service completeness; รักษา null/zero/absent/withheld states แยกกัน
8. ตรวจ policy สำหรับ output fields, missing presentation, row limits, formula injection และ safe workbook formatting
9. สร้าง XLSX จาก projection ของ snapshot ที่ authorize แล้ว; บันทึก `generatedAt` เมื่อ generation เสร็จ
10. reauthorize/ตรวจการเพิกถอนก่อนส่งไฟล์ตาม accepted delivery contract และเขียน minimized audit event

ขั้นตอนนี้เป็น **candidate process**; การได้ snapshot ก่อนหรือหลัง authorization checks และ concurrency/revocation linearization point ต้องออกแบบร่วมกันโดย engineering/security โดยไม่กล่าวว่า `requestedAt` คือ snapshot time และไม่เลือก isolation strategy โดยไม่มีหลักฐาน

ความหมายเวลา:

| เวลา | Source ปัจจุบัน / semantics |
| --- | --- |
| Program start/completion | startedAt/completedAt เป็น Program lifecycle timestamp ไม่ใช่ observation |
| Baseline date | recordedOn เป็น business DATE; createdAt เป็น persistence timestamp |
| Follow-up / Final recordedAt | application/server record time ตาม model/write path; ไม่ใช่ generic clinical observation date หรือช่วงเวลาที่วัด |
| GoalPlan / Service 1 / evidence timestamps | created/recorded/associated/uploaded timestamps คนละเหตุการณ์; ห้ามใช้แทนกัน |
| `requestedAt` | เวลา server รับคำขอ export; ไม่ใช่เวลาของ source state |
| `dataAsOf` / snapshot boundary | ขอบเขต/identity ของ database snapshot ที่ approved consistency mechanism ใช้อ่าน source ทั้งชุด; timestamp แสดงได้เฉพาะเมื่อพิสูจน์ความสัมพันธ์กับ boundary ได้ |
| `generatedAt` | เวลาไฟล์ถูกสร้างเสร็จ; แยกจาก request และ source snapshot และอาจเกิดภายหลัง |

Timestamp แบบ absolute ต้องเก็บอย่างไม่กำกวม; วันที่/เวลาที่แสดงให้ผู้ใช้ใช้ Asia/Bangkok ตาม customer locale contract โดยไม่ timezone-shift DATE fields เอง Customer-facing metadata ต้องแยก request received, data snapshot boundary และ generation completion ตามค่าที่มีหลักฐานจริง; หาก snapshot มี identity/boundary แต่ไม่มี wall-clock time ที่พิสูจน์ได้ ห้ามแสดง request time แทน `dataAsOf` การเลือก label และการแสดง `requestedAt`/`dataAsOf`/`generatedAt` เป็น customer presentation decision ส่วนวิธีพิสูจน์ boundary เป็น engineering/security decision

ห้ามใช้ `requestedAt`, `dataAsOf`/snapshot identity, `generatedAt`, `createdAt`, `recordedAt` และ `completedAt` แทนกัน และไม่กล่าวว่า clinical event จริงเกิดก่อน data snapshot เพียงเพราะ persistence timestamp อยู่ก่อนเวลา

### 8.1 Consistency และ revocation gate

การทำหลาย query โดยไม่มี snapshot boundary ร่วมอาจเห็น source คนละ state หากมี concurrent update ระหว่าง query การรับ transaction client เป็น optional input ใน exact Program projection ปัจจุบันยังไม่ใช่คำรับรองว่า export ทั้งชุดอ่าน snapshot เดียว

ก่อน implementation ต้องกำหนดและทดสอบอย่างน้อย:

- กลไกการได้ snapshot และ `dataAsOf`/snapshot identity ที่ตรวจสอบได้; ครอบคลุมทั้งสอง worksheet, cohort count, pagination และทุก source lookup ใน boundary เดียวกัน
- ความสัมพันธ์ของ `requestedAt` กับเวลาหรือ identity ของ snapshot; หาก map เป็น wall-clock time ไม่ได้ ให้ระบุ snapshot boundary ที่มีจริงและห้ามประดิษฐ์ timestamp
- semantics เมื่อ Program, GoalPlan, Follow-up, assignment หรือ Hospital/Patient relationship เปลี่ยนระหว่าง read
- revocation linearization point สำหรับ User suspension, membership demotion/revocation, OSM reassignment, Hospital suspension และ scope change ระหว่าง long-running export
- การตรวจ authority ซ้ำก่อน file delivery, การ cancel job/response และข้อจำกัดหลังเริ่มส่ง bytes ให้ผู้ใช้
- transaction/snapshot isolation, locks/version checks และ bounded retry ที่เหมาะสม โดยไม่ตั้งสมมติฐานว่า SERIALIZABLE อย่างเดียวแก้ revocation race
- handling เมื่ออ่าน snapshot ไม่ครบ: ห้ามส่ง workbook บางส่วนโดยทำให้ดูเหมือนข้อมูลครบ

## 9. Authorization, privacy และ export security

### 9.1 Dedicated authorization proposal

เสนอให้มี capability แยก เช่น **report:program:export** เป็น candidate name เท่านั้น ปัจจุบันยังไม่มี capability นี้และยังไม่มีผู้ใช้กลุ่มใดได้รับอนุญาตให้ส่งออก cohort

ข้อเสนอเบื้องต้นสำหรับ cohort export คือ authenticated ACTIVE User, มี Role.HOSPITAL, ACTIVE direct HospitalMembership ที่ตรงกับ exact target Hospital และ Hospital ต้อง ACTIVE โดยต้องผ่าน dedicated export capability เพิ่มอีกชั้น; นี่เป็น safety proposal ไม่ใช่ accepted actor matrix OWNER กับ MEMBER ว่าจะต่างกันหรือไม่, OSM export แบบ assigned-Patient, multi-role และทุก population-status predicate ยังคงต้องมี decision แยก

กำหนด target เป็น exact Hospital และ exact PatientHospitalRelationship/Program ที่อยู่ใน Hospital นั้น; Hospital ID ที่ส่งจาก client เป็นเพียง locator ต้อง re-resolve จากข้อมูล authoritative ไม่ใช่หลักฐาน permission ไม่อนุญาต hierarchy inheritance, Parent-to-Child, sibling, cross-Hospital shared Person, report:program:read เป็น export grant, patient row outside allowlist หรือ generic Patient record read

คำว่า “authorized Hospital operators” ยังไม่ตัดสินว่า OWNER, MEMBER, OSM หรือ ADMIN มีสิทธิ์ใด:

- HOSPITAL role หรือ direct membership อย่างเดียวไม่อนุญาต export โดยอัตโนมัติ
- Parent OWNER ไม่ได้รับ roster ของ Child Hospital จาก ownership/hierarchy
- OSM ไม่ได้รับ cohort export เพราะมี assigned-Patient read; อาจพิจารณาเฉพาะ assigned patients เมื่อมี decision ใหม่
- ADMIN-only ไม่ได้รับสิทธิ์ patient report/export โดยอัตโนมัติ
- multi-role actor ผ่านได้เฉพาะ combination ที่ policy อนุมัติและ current exact scope ยืนยัน

ทุกคำขอต้อง fail closed เมื่อ current authenticated User, role, status, capability, exact Hospital membership/assignment, population predicate, policy หรือ consistency check ใดไม่สำเร็จ

### 9.2 Acceptance criteria ด้าน security

- query เฉพาะ approved typed projection; ห้าม serialize raw Patient/Person/Prisma records
- ระบุชัดว่าจะแสดงชื่อ, hospitalNumber, OSM name/history, clinical measurements, notes และ Patient/Program counts ใดบ้าง
- ใช้ private/no-store cache เป็น default; reauthorize ทุก request และทุก future cache/file retrieval; invalidation/in-flight revocation behavior ต้องตกลง
- ส่งผ่าน authenticated response ที่มี safe XLSX content type, Content-Disposition ปลอดภัยและ X-Content-Type-Options: nosniff; ห้าม public/predictable download URL
- ถ้ามี temporary storage ต้อง private, access-controlled, bounded และมี retention/expiry ที่อนุมัติ; direct secure delivery เป็น candidate ไม่ใช่ข้อสรุป
- ข้อความ/ชื่อ/notes ที่ผู้ใช้ป้อนต้องเขียนเป็น string cell แบบปลอดภัย ป้องกัน formula injection โดยเฉพาะค่าเริ่มต้นด้วย =, +, -, @ และ control prefixes; ต้องมี malicious-text fixtures
- ใช้ row/file size limits, bounded batching, timeout, rate/abuse controls และ safe failure; ค่าตัวเลขยังรอ product/operations/security decision
- audit แบบ minimized; ห้าม log Patient ID, national ID, clinical details, suppressed/raw value, raw query payload หรือ workbook body
- ดาวน์โหลดแล้วเป็นสำเนาที่ผู้ใช้ควบคุมได้ ไม่มี remote revoke สำหรับไฟล์ที่บันทึกหรือ screenshot แล้ว; warnings/operational controls ต้องกำหนดก่อนใช้งานจริง
- ห้ามให้หลาย Hospital relationships ของ Person เดียวกันรวมเป็นสิทธิ์อ่านข้าม Hospital

## 10. การ reconcile กับ RPT-01–RPT-30

RPT-24 ได้รับการยืนยัน requirement เฉพาะ purpose/timing เท่านั้น ส่วนอื่นยังเปิดตามสถานะต่อไปนี้:

| RPT | สิ่งที่ยืนยัน/พบปัจจุบัน | สิ่งที่ยังเปิด |
| --- | --- | --- |
| RPT-01 | Exact-Program factual report มีและใช้ report:program:read | ประชากร cohort, exact-Hospital batch scope, filters และ actor ของ export |
| RPT-02 | ไม่มี Hospital cohort export implementation | dedicated export grant, download controls และการแยกจาก HN aggregate |
| RPT-03 | hospitalNumber nullable มีเป็น Hospital relationship field | ID label, display, uniqueness, masking และ null fallback |
| RPT-04 | ไม่พบ illness-duration source | authoritative start event, unit และ correction semantics |
| RPT-05 | assignment ปัจจุบัน/ช่วง created-ended มี | current vs historical assignment projection และ OSM name permission |
| RPT-06 | RISK/DIABETES state/history มีจริง | mapping กับ DM/Pre-DM, effective time, denominator และ cross-Hospital counting |
| RPT-07–09 | linked Baseline, During records, Final และ Program lifecycle มี | official Before/During/After semantics และ timing/units |
| RPT-10 | nullable Baseline hba1c source มี; Final ไม่มี | unit, source/provenance, clinical meaning, timing และ export allowlist |
| RPT-11 | nullable Baseline heightCm source มี | clinical semantics, time binding และ permission |
| RPT-12–13 | BMI/CVD risk source/formula ไม่พบ | clinical formula, version, input compatibility, null/rounding |
| RPT-14–16 | DTX/weight/BP/waist raw values กับหลาย timestamp มี | units/context, observation date, late entry และ stage |
| RPT-17–18 | Goal target และ qualitative ActivityProgress มี | achieved numerator, denominator, achievement %, >70% count |
| RPT-19–21 | free-text notes/GoalPlan rounds บางส่วนมี | controlled outcome, plan-adjustment event, obstacle vocabulary/source |
| RPT-22 | current report DTO แยก recorded/missing states | Excel cell rendering และ withheld/absent distinction |
| RPT-23 | workbook มีหก Follow-up slots; DB เป็น 0..N | exact layout, overflow behavior, supplementary sheet |
| RPT-24 | REQUESTER-CONFIRMED REQUIREMENT: on-demand current progress from a defined server-side data snapshot | field allowlist, exact cohort, ID, permission, complete template fidelity, snapshot/dataAsOf consistency, output/delivery decisions |
| RPT-25 | PDF requirement อยู่ใน Phase 15E register แต่ไม่ใช่ requirement ที่ยืนยันใน RPT-24 | PDF purpose/layout/PII contract แยกต่างหาก; RPT-24 ไม่อนุมัติ PDF |
| RPT-26 | export audit contract ยังไม่มี | event types, access, purpose, retention และ failure logging |
| RPT-27 | generated export ไม่มี version/snapshot mechanism | projection/template version, reproducibility และ correction expectations |
| RPT-28 | Classification count query ปัจจุบันมี แต่ยังไม่ใช่ approved workbook counts | cohort population, unique Patient vs relationship, statuses, filters และ privacy |
| RPT-29 | Screening เก็บ versioned JSON; current Program projection ไม่เลือก PAM/PROM | clinical/instrument authority, scoring, Program linkage, stage และ visibility |
| RPT-30 | Appointment เป็น relationship-owned และอาจ link Follow-up | appointment fields/status ไม่ได้ถูกรวมเป็น workbook requirement; inclusion ต้องมี customer decision แยก |

เอกสาร Phase 15E เดิมที่ระบุ RPT-24 เป็น OPEN REQUIREMENT ไม่ถูกลบ แต่ได้รับการปรับความหมายเฉพาะส่วนที่ผู้ร้องขอยืนยันแล้ว ส่วน layout/fields/permissions และ operational gates ไม่ได้ปิดตาม

## 11. RPT-24 open-decision register

| ID | คำถาม / สถานะ | ผู้มีอำนาจตัดสินใจ | ข้อเสนอเพื่อความปลอดภัย (ยังไม่ accepted) | ผลหากยังเปิด |
| --- | --- | --- | --- | --- |
| R24-AUTH-01 | ผู้ใด export ได้: OWNER/MEMBER/OSM/ADMIN และจำกัด role combination อย่างไร — OPEN | Product Owner + Security/privacy authority | dedicated capability แยกจาก read; exact-Hospital scope | BLOCKS export |
| R24-SCOPE-01 | cohort, Patient/relationship status, Program statuses และ filter ใดบ้าง — OPEN | Product Owner + Hospital operations + Security | one exact Hospital relationship per row; ห้าม hierarchy/cross-Hospital | BLOCKS cohort selection |
| R24-ID-01 | ชื่อ, Hospital-local ID/HN และ fallback ที่แสดง — OPEN | Customer/Product Owner + Hospital data owner | omit direct ID จน RPT-03 accepted | BLOCKS identity columns |
| R24-CLASS-01 | Workbook DM/Pre-DM counts จะใช้ authority/denominator ไหน — OPEN | Clinical owner + Product/data owner | ไม่ map RISK เป็น Pre-DM และไม่เผย count | BLOCKS count fields |
| R24-STAGE-01 | Before/During/After labels, linked Baseline, Follow-up และ Final meaning — OPEN | Clinical owner + Product Owner | label lifecycle/source facts อย่างตรงตัว; no clinical inference | BLOCKS official stage presentation |
| R24-MEAS-01 | HbA1c, DTX, weight, height, waist, BP units/context/date/missing rules — OPEN | Clinical/data authority | raw value only หลัง allowlist; no convert/calculate | BLOCKS affected clinical cells |
| R24-DERIVED-01 | BMI, CVD risk, achievement, >70% count — OPEN | Clinical owner + data owner | omit จนสูตร/version/denominator accepted | BLOCKS derived cells |
| R24-OSM-01 | OSM ที่แสดงเป็น current ณ As-of หรือ historical owner — OPEN | Product/Hospital operations + Security | omit historical attribution ที่พิสูจน์ไม่ได้ | BLOCKS OSM field |
| R24-SVC-01 | Service 1 evidence/text และ GoalPlan/free-text output — OPEN | Product + clinical/privacy | เริ่มจาก completeness facts; default exclude free text and binary evidence | BLOCKS content-rich cells |
| R24-FU-01 | หก slots, overflow, order, 2–4 expectation — OPEN | Customer/Product Owner | แสดงครบ; no truncation; expectation ไม่เป็น limit | BLOCKS final workbook layout |
| R24-MISSING-01 | Excel blank/label สำหรับ null, no record, no link, withheld, denied — OPEN | Product + data owner + Security | preserve distinctions internally; no zero substitution | BLOCKS output mapping |
| R24-ASOF-01 | coherent snapshot/dataAsOf, ความสัมพันธ์กับ requestedAt และ generatedAt สำหรับหลาย query — OPEN | Architecture/DB owner + Security | database snapshot ที่พิสูจน์ได้; หาก wall-clock mapping ไม่ชัดให้แสดง boundary/identity จริง; no timestamp-only claim | BLOCKS implementation |
| R24-REVOKE-01 | membership/status revocation ระหว่าง long export และก่อนส่งไฟล์ — OPEN | Security + Architecture | define linearization point, revalidation and cancellation | BLOCKS secure delivery |
| R24-LIMIT-01 | row/byte/page/time/rate/resource limits — OPEN | Product + Operations + Security | explicit bounded export; no silent truncation | BLOCKS production operation |
| R24-AUDIT-01 | audit event, log access, purpose และ retention — OPEN | Security/privacy governance | minimal actor/capability/scope/time/correlation/outcome only | BLOCKS real patient export |
| R24-DELIVERY-01 | response vs private temporary storage, expiry, warnings — OPEN | Security + Operations + Product | private/no-store; no public URL | BLOCKS delivery mechanism |
| R24-REPRO-01 | template/projection versioning, correction และ file reproducibility — OPEN | Product + Architecture + Data governance | label export As-of; no claim of historical rebuild | BLOCKS reproducibility claims |
| R24-LAYOUT-01 | exact workbook fidelity, sheet order/format, metadata และ display rules — OPEN | Customer + Product Owner | workbook เป็น evidence; approve final template version | BLOCKS exact-template acceptance |
| R24-NET-01 | การแยกจาก Network/Child patient data — OPEN as release invariant | Security/privacy + Product Owner | exact-Hospital only; HN-M08 stays deferred | BLOCKS any network scope/export |

การปิด requirement direction ในเอกสารนี้ไม่ใช่การปิด R24 decision register

## 12. Conditional implementation phases

ขั้นตอนเหล่านี้เป็นแผนเสนอแบบมีเงื่อนไข ไม่ใช่การเริ่มงานหรืออนุญาต feature:

1. **RPT-24A — Customer field, population และ workbook closeout:** อนุมัติ row grain, cohort, identifier, two-sheet allowlist, field labels, missing cells และ Follow-up overflow
2. **RPT-24B — Clinical/data semantics closeout:** อนุมัติ Before/During/After, measurements, classification, PAM/PROM, OSM time, derived values และ source provenance
3. **RPT-24C — Security/privacy/consistency acceptance:** อนุมัติ actor/capability, exact Hospital scope, PII, As-of snapshot, revocation, resource bounds, audit และ file delivery
4. **RPT-24D — Implementation authorization review:** เสนอ scoped implementation plan, migrations/dependencies (ถ้าจำเป็น), test evidence และ synthetic-only acceptance เพื่อขออนุมัติแยกก่อนแก้ runtime

ห้ามเริ่ม RPT-24 implementation จน decisions ที่จำเป็นต่อ field และ scope ปิด, security/privacy/clinical authorities ให้ acceptance ตามหน้าที่ และมี explicit implementation authorization แยกต่างหาก

## 13. Focused future test matrix — DESIGN ONLY

ทุกกรณีด้านล่างเป็น test ที่ต้องเขียน/รันใน phase ที่ได้รับอนุมัติภายหลัง ไม่ได้รันหรือผ่านในเอกสารนี้ กรณีที่ต้องพึ่ง decision ให้ผล CONDITIONAL/OPEN จนกว่า acceptance rule จะถูกอนุมัติ

| Test ID | Fixture / adversarial case | Expected acceptance |
| --- | --- | --- |
| R24-PROG-01 | ACTIVE Program; Service 1 complete, Service 2 partial | รวมได้เมื่อ cohort/auth อนุมัติ; แสดง factual partial state; ห้าม mark complete |
| R24-PROG-02 | COMPLETED Program มี Final | แยก Program completion กับ Final facts; As-of/provenance ตรงกัน |
| R24-PROG-03 | COMPLETED Program ไม่มี Final | Program status ยัง COMPLETED; Final แสดง missing ตาม rule ไม่สร้างค่าทดแทน |
| R24-PROG-04 | ACTIVE Program ไม่มี Final และไม่มี Follow-up | row inclusion ตาม population decision; ไม่มี follow-up/Final ไม่เป็น zero หรือ complete |
| R24-BASE-01 | Program ไม่มี linked Baseline หรือมี Baseline ของ relationship แต่ไม่ link | ห้ามเลือก Baseline เอง; distinguish no link กับ null measurement |
| R24-ISO-01 | Patient มี Program A และ Program B พร้อม data ต่างกัน | แต่ละ output row/section ผูก exact Program; ไม่มี cross-episode join |
| R24-ISO-02 | PatientProfile เดียวมีหลาย Hospital relationships | exact Hospital เท่านั้น; ห้าม identity join เปิดเผยอีก Hospital |
| R24-OSM-01 | Unassigned, reassigned, ended และ OSM actor inactive | current/historical output ตาม approved policy; ไม่มี stale attribution |
| R24-FU-01 | 0 Follow-up | ไม่มี Follow-up แสดงเป็นศูนย์ ไม่สรุปว่าผู้ป่วยทำไม่ได้ |
| R24-FU-02 | น้อยกว่าหก Follow-ups | missing positions แสดงตาม rule ไม่เป็น fabricated zero |
| R24-FU-03 | เท่ากับหก Follow-ups | ทุก record อยู่ในตำแหน่งที่ deterministic |
| R24-FU-04 | มากกว่าหก Follow-ups | ทุก record แสดงผ่าน approved overflow หรือ export fail ชัดเจน; ห้าม truncate เงียบ |
| R24-SVC-01 | Service 1 และ Service 2 บาง record/GoalItem ไม่ครบ | completeness ไม่สรุป outcome; ไม่เปิด evidence/text ที่ไม่ allowlist |
| R24-FIELD-01 | BMI/CVD/HbA1c without approved mapping, PAM/PROM result, >70% | unsupported/blocked field omitted/withheld; ไม่มีสูตรหรือชื่อ diagnosis ที่สร้างเอง |
| R24-MISS-01 | nullable source, absent row, factual 0, withheld | แสดงเป็นคนละ state; factual zero คงเป็น zero; ไม่ใช้ zero แทน unknown |
| R24-DATE-01 | Baseline DATE, Program lifecycle timestamps, Follow-up recordedAt และ Generated at ต่างกัน | คง semantics แยก; แสดง Bangkok time เฉพาะ timestamp ตาม rule; no timestamp substitution |
| R24-SNAP-01 | Follow-up/Program update ระหว่าง multi-query export; ทั้งสอง sheet ใช้ source ชุดเดียว | coherent snapshot ตาม approved mechanism หรือ abort safely; ห้ามสร้าง sheet ที่เห็นคนละ state |
| R24-REVOKE-01 | OWNER/MEMBER demotion, suspension, Hospital status change ระหว่าง export | deny/cancel ตาม revocation contract; ไม่ส่งไฟล์หลังจุดที่ policy กำหนด |
| R24-AUTH-01 | ADMIN-only, PATIENT-only, OSM-only, Parent OWNER, Child/other Hospital | default deny; เฉพาะ actor matrix ที่อนุมัติและ exact scope เท่านั้นผ่าน |
| R24-AUTH-02 | Forged client Hospital/relationship/Program ID | re-resolve target server-side; no cross-Hospital disclosure or existence oracle |
| R24-RESOURCE-01 | Large result, timeout, page/batch failure, oversized workbook | bounded memory/work/time; safe failure, no partial-success claim |
| R24-XLSX-01 | Patient/OSM/GoalPlan text begins with formula/control characters | stored as inert text; no executable formula; workbook parser verifies |
| R24-PRIV-01 | Audit/logging and download header/cache checks | no sensitive rows/values in logs; private/no-store; no public URL |
| R24-NET-01 | HN Parent owner requests Child patient roster or Network XLSX | denied; no implicit HN-M08 or clinical Patient authority |

## 14. Evidence index

### Customer workbook / historical reporting decisions

- [Customer workbook](../Dashboard%20App%20Demi.xlsx)
- [Phase 15A Reporting Data Map](./PHASE_15A_REPORTING_DATA_MAP.md)
- [Phase 15E.0 Reporting Dashboard and Export Contract](./PHASE_15E0_REPORTING_DASHBOARD_EXPORT_CONTRACT_CONSOLIDATION.md)
- [Phase 15E.1 Program Reporting Projection Foundation](./PHASE_15E1_PROGRAM_REPORTING_PROJECTION_FOUNDATION.md)
- [Phase 15E.2 Program Factual Report UI Integration](./PHASE_15E2_PROGRAM_FACTUAL_REPORT_UI_INTEGRATION.md)
- [Phase 15E.3 Demo Closeout and Reporting Audit](./PHASE_15E3_DEMO_CLOSEOUT_FULL_JOURNEY_REAUDIT_RELEASE_READINESS.md)
- [Phase 15B.0 Program Workflow Foundation](./PHASE_15B0_PROGRAM_WORKFLOW_FOUNDATION.md)
- [Phase 15B.1 Service One Domain Persistence](./PHASE_15B1_SERVICE_ONE_DOMAIN_PERSISTENCE.md)
- [Phase 15C.1 Program-linked Service 2 Persistence](./PHASE_15C1_SERVICE_TWO_PROGRAM_LINKAGE_DOMAIN_PERSISTENCE.md)
- [Phase 15C.2 Structured Follow-up Data](./PHASE_15C2_STRUCTURED_BEHAVIORAL_FOLLOWUP_DATA.md)
- [Phase 15D.0 Final Outcome Contract](./PHASE_15D0_FINAL_OUTCOME_CONTRACT_CONSOLIDATION.md)
- [Phase 15D.1 Final Assessment Persistence](./PHASE_15D1_FINAL_ASSESSMENT_DOMAIN_PERSISTENCE.md)
- [Phase 15D.2 Measurement Semantics](./PHASE_15D2_MEASUREMENT_SEMANTICS_CONSOLIDATION.md)
- [Phase 16D.3 Patient Classification](./PHASE_16D3_PATIENT_CLASSIFICATION_PERSISTENCE_HISTORY_RECONCILIATION.md)

### Current source, policy, projection and test evidence

- [Prisma schema](../../prisma/schema.prisma)
- [Program reporting policy](../../src/modules/reporting/policies/program-report-policy.ts)
- [Program report access](../../src/modules/reporting/services/program-report-access-service.ts)
- [Program report query](../../src/modules/reporting/services/program-report-query-service.ts)
- [Program report projection](../../src/modules/reporting/projections/program-report-projection.ts)
- [Program access resolver](../../src/modules/patient-program/services/patient-program-access-service.ts) · [policy](../../src/modules/patient-program/policies/patient-program-policy.ts)
- [Baseline query](../../src/modules/patient-baseline/services/patient-baseline-query-service.ts) · [service](../../src/modules/patient-baseline/services/patient-baseline-service.ts) · [schema](../../src/modules/patient-baseline/schemas/patient-baseline-schemas.ts)
- [Follow-up query/service](../../src/modules/followups/services/followup-query-service.ts) · [write service](../../src/modules/followups/services/followup-service.ts)
- [Final Assessment query/service](../../src/modules/patient-final-assessment/services/patient-final-assessment-query-service.ts) · [write service](../../src/modules/patient-final-assessment/services/patient-final-assessment-service.ts)
- [Patient classification query](../../src/modules/patient-classification/services/patient-classification-query-service.ts)
- [OSM assignment query](../../src/modules/patient-assignment/services/patient-osm-assignment-query-service.ts) · [policy](../../src/modules/patient-assignment/policies/patient-osm-assignment-policy.ts)
- [Reporting policy tests](../../src/modules/reporting/policies/program-report-policy.test.ts), [access tests](../../src/modules/reporting/services/program-report-access-service.test.ts), [projection query tests](../../src/modules/reporting/services/program-report-query-service.test.ts) and [PostgreSQL integration tests](../../tests/integration/program-reporting.integration.test.ts)

### Authorization, architecture and current phase status

- [ADR-0002 Role-Capability-Scope Authorization](../adr/0002-role-capability-scope-authorization.md)
- [DEMI Architecture Baseline](../architecture/DEMI_ARCHITECTURE_BASELINE.md)
- [Phase 17 UAT Backlog](./PHASE_17_UAT_BACKLOG.md)
- [HN-C1 Security & Disclosure Contract](./PHASE_17K_HNC1_SECURITY_DISCLOSURE_CONTRACT.md)
- [HN-C1 Decision Direction Record](./PHASE_17K_HNC1_DECISION_DIRECTION_RECORD.md)

## 15. Exit criteria

**RPT-24 requirement recorded** เมื่อบันทึก purpose และ on-demand As-of behavior ตามผู้ร้องขอ พร้อมแยก source evidence และ unresolved decisions แล้ว

**Field / authorization contract complete** ยังทำไม่ได้จนกว่า exact-Hospital population, row grain, workbook fields/overflow, patient identifier, clinical semantics, export actor/capability, As-of consistency/revocation, privacy, audit, file delivery และ limits จะถูกตัดสินโดย authority ที่เหมาะสมและมี acceptance criteria ที่ทดสอบได้

ไม่มี Network aggregate real-data exposure, Network Export หรือ exact-Hospital patient/program Excel implementation ใดได้รับอนุญาตจากเอกสารนี้

**RPT-24 AS-OF EXPORT REQUIREMENT RECORDED — FIELD / AUTHORIZATION CONTRACT PENDING — IMPLEMENTATION NOT AUTHORIZED**
