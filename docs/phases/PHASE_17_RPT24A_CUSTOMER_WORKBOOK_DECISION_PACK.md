# DEMI Phase 17 — RPT-24A Customer Workbook Decision Pack

- **สถานะ:** RPT-24A DECISION PACK PREPARED — REQUESTER / CUSTOMER ACCEPTANCE PENDING — EXPORT IMPLEMENTATION NOT AUTHORIZED
- **ประเภทงาน:** Documentation-only decision package
- **ฐานตรวจสอบ:** `main` ณ `ba49040c7a674008a10493ae5cf5c7a99b7e6bfc`; HN-C1 และ RPT-24 อยู่ในประวัติ `main` แล้ว
- **ข้อจำกัด:** ข้อเสนอด้านล่างยังไม่ใช่การอนุมัติจาก Product Owner, ลูกค้า, clinical, privacy, security หรือ data controller และไม่อนุญาตการเปิดเผยข้อมูลผู้ป่วยหรือเริ่ม implementation

## 1. สรุปสำหรับการทบทวนและตอบคำถามลูกค้า

ข้อกำหนด RPT-24 ที่ผู้ร้องขอยืนยันแล้ว **คงเดิมและไม่เปิดให้ตีความใหม่**: ผู้ใช้ที่ได้รับอนุญาตเป็นผู้ขอ Excel ตามต้องการ เพื่อดูความคืบหน้า Patient Program ที่บันทึกจริงใน DEMI จาก server-side data snapshot ที่ระบุขอบเขตได้ ไม่ใช่รายงานรายเดือน/ไตรมาส และไม่จำกัดเฉพาะ Program ที่ COMPLETED

ตารางนี้สรุปคำถามทางธุรกิจให้ตอบได้โดยไม่ต้องเลือกวิธีเขียนฐานข้อมูล/API ทุกข้อยังเป็น **PROPOSED FOR REQUESTER / CUSTOMER REVIEW**:

| ID | ขอให้ยืนยัน | ข้อเสนอสำหรับ review (ยังไม่ accepted) |
| --- | --- | --- |
| R24A-D01 | รายงานของโรงพยาบาลและ Program กลุ่มใด | โรงพยาบาลเดียวที่ผู้ส่งออกมีสิทธิ์; รวมทุก eligible ACTIVE และ COMPLETED Program; ไม่กำหนด monthly/quarterly/date filter เป็นค่าเริ่มต้น; ยืนยันเกณฑ์ความสัมพันธ์ผู้ป่วยที่ยังมีสิทธิ์อยู่ |
| R24A-D02 | หนึ่งแถวแทนอะไร และระบุหลาย Program อย่างไร | หนึ่งแถวต่อ Patient Program ในแต่ละชีต; ใช้วันที่เริ่ม/สถานะ Program ที่มีอยู่ช่วยแยกแถวก่อนพิจารณา identifier ที่แสดงได้ |
| R24A-D03 | ผู้ป่วยที่มีหลาย Program/หลายโรงพยาบาลแสดงอย่างไร | Program แยกแถว; แต่ละโรงพยาบาลเห็นเฉพาะ relationship และ Program ใน scope ของตน; ห้ามนำข้อมูลข้ามโรงพยาบาลมารวม |
| R24A-D04 | ช่อง ID หมายถึงรหัสใด | ใช้เลขผู้ป่วยประจำโรงพยาบาล (`hospitalNumber`) เฉพาะเมื่อยืนยันว่าเป็น ID ที่ลูกค้าต้องการ; ถ้าไม่มีให้ใช้กฎที่ตกลง ไม่ใช้ UUID เติมช่อง |
| R24A-D05 | จะแสดงชื่อผู้ป่วยและชื่อ อสม. อย่างไร | ยืนยันว่าต้องแสดงชื่อใดบ้างและขอบเขตใด; สำหรับ อสม. ให้เลือก current assignment ณ การส่งออก หรือไม่แสดง จนกว่าจะพิสูจน์ประวัติการดูแลได้ |
| R24A-D06 | จะเรียก Before / During / After อย่างไร | ใช้เฉพาะ Baseline, Service/GoalPlan/Follow-up และ Final ที่ link กับ Program นั้น; ยืนยันถ้อยคำให้ไม่กล่าวเกิน source |
| R24A-D07 | ยอมรับรายงานรุ่นแรกที่เว้น field ซึ่งไม่มี source ได้หรือไม่ | อนุญาต bounded factual fields ที่ผ่านอนุมัติ; field ที่ไม่มี source/semantics แสดง unavailable ตามกติกา; ถ้าต้องครบทุกช่องต้องรอ source/decision เพิ่ม |
| R24A-D08 | จะนับเคส/DM/Pre-DM ด้วยนิยามใด | ยังไม่แสดงยอด DM/Pre-DM จนยืนยันนิยาม กลุ่มตัวหาร และแหล่งจำแนก; ไม่ถือว่า RISK = Pre-DM หรือ DIABETES = DM โดยอัตโนมัติ |
| R24A-D09 | จะจัดการ BMI, CVD และคะแนนคำนวณอย่างไร | เว้นไว้ก่อน เว้นแต่มีแหล่ง/formula, หน่วย, รุ่น, ตัวหารและ validation ที่ผู้มีอำนาจรับรอง |
| R24A-D10 | “ทำ/ไม่ทำ” และ service completeness หมายถึงอะไร | แนะนำให้ยืนยันเพียง “มี/ไม่มีบันทึกใน DEMI” เมื่อ source record มี; ไม่แปลว่าให้บริการสำเร็จหรือผู้ป่วยทำได้ |
| R24A-D11 | Follow-up เกิน 6 ตำแหน่งทำอย่างไร | เก็บสองชีตเดิมเป็น summary และเพิ่มชีตรายละเอียด Follow-up ที่แสดงครบ (Option B) หากลูกค้ายอมรับ; ห้าม truncate เงียบ |
| R24A-D12 | ช่องว่างและข้อมูลที่ไม่มีค่าจะแสดงอย่างไร | ศูนย์ใช้เฉพาะค่าศูนย์ที่บันทึกจริง; ค่า null/ไม่มี record ใช้ blank หรือ label ไทยที่ตกลง; withheld ห้ามมี label ที่เปิดเผยข้อมูลต้นทาง |
| R24A-D13 | ต้องเหมือน workbook เดิมแค่ไหน | ใช้ XLSX แบบ versioned และใช้งานเทียบเท่า โดยคงโครงสร้างสองชีตที่คุ้นเคย; การเปลี่ยนคอลัมน์/เพิ่มชีตต้องให้ลูกค้ารับรอง |
| R24A-D14 | ต้องแสดงเวลาใดในไฟล์ | แยกเวลารับคำขอ, ขอบเขตข้อมูล snapshot และเวลาสร้างไฟล์; แสดง Data As-of เฉพาะเมื่อระบบพิสูจน์ความหมายได้ |
| R24A-D15 | เรียงแถวอย่างไร | เลือกลำดับที่ผู้ใช้เข้าใจ เช่น ชื่อ/ID แล้ว Program start date; ระบบใช้ stable tie-breaker ภายในโดยไม่แสดง UUID |

การยืนยันในตารางนี้ยังต้องบันทึกผู้มีอำนาจและเงื่อนไขให้ครบ โดยเฉพาะ field ทางคลินิกและสิทธิ์เปิดเผยข้อมูล การตอบรับ decision pack ไม่ได้อนุมัติ export access หรือ implementation

## 2. ข้อกำหนดที่ยืนยันแล้วและสถานะ repository

### 2.1 RPT-24 ที่ยืนยันแล้ว

- Export เป็น on-demand เพื่อทบทวน factual Patient Program progress ที่ DEMI บันทึกไว้จาก server-side data snapshot ที่กำหนดขอบเขตได้
- Program ในรายงานอาจอยู่คนละ lifecycle stage รวมถึง ACTIVE, COMPLETED, มีหรือไม่มี Final Assessment ตามประชากรและสิทธิ์ที่อนุมัติ
- ไม่บังคับให้ทุก Program COMPLETED; ไม่สร้าง service result หรือ progress ที่ไม่มี source
- Export ครั้งใหม่อาจเปลี่ยนตาม source ที่เพิ่ม/แก้ไข; ไฟล์เก่าเป็นสำเนา ณ snapshot ของครั้งนั้น ไม่รับรองสร้างซ้ำได้หากไม่มี versioning/snapshot mechanism ที่อนุมัติ
- ไม่กำหนดรอบเดือน ไตรมาส หรือ publication schedule และไม่เปลี่ยน HN-M06-T01–T09

### 2.2 Provenance และ approval status

| เหตุการณ์ | Evidence / สถานะปัจจุบัน |
| --- | --- |
| HN-C1 Security Contract | จัดทำบน branch ประวัติ `docs/hn-c1-security-disclosure-contract`; source commit `7ef8c3d`; ปัจจุบันอยู่ใน `main` |
| HN-C1 Decision Direction Record | จัดทำต่อบน branch ดังกล่าว; commit `5c4e509`; ปัจจุบันอยู่ใน `main` |
| RPT-24 Contract | จัดทำบน branch ประวัติ `docs/rpt-24-on-demand-asof-excel-export`; commit `ba49040`; ปัจจุบันอยู่ใน `main` |
| RPT-24A Decision Pack | จัดทำจาก baseline `main` ที่ `ba49040c7a674008a10493ae5cf5c7a99b7e6bfc` บน branch เอกสาร RPT-24A นี้; ยังไม่ merge ตาม scope ปัจจุบัน |

ณ preflight, `5c4e509` และ `ba49040` เป็น ancestors ของ `main` ที่ระบุข้างต้น การที่เอกสารถูก merge เข้า `main` เป็นเพียง Git/repository location; **ไม่ได้**ทำให้เกิด Product Owner, customer, security, privacy, clinical, data-controller หรือ implementation approval

เอกสารที่เป็นฐาน: [RPT-24 As-of Export Contract](./PHASE_17_RPT24_ON_DEMAND_ASOF_EXCEL_EXPORT_CONTRACT.md), [Phase 15A Reporting Data Map](./PHASE_15A_REPORTING_DATA_MAP.md), [Phase 15E.0 Reporting Contract](./PHASE_15E0_REPORTING_DASHBOARD_EXPORT_CONTRACT_CONSOLIDATION.md), [Phase 15E.1 Projection Foundation](./PHASE_15E1_PROGRAM_REPORTING_PROJECTION_FOUNDATION.md), [Phase 15E.2 Factual Report UI](./PHASE_15E2_PROGRAM_FACTUAL_REPORT_UI_INTEGRATION.md), [Phase 17 UAT Backlog](./PHASE_17_UAT_BACKLOG.md) และ [Project Context](../CONTEXT.md)

## 3. หลักฐาน workbook และข้อจำกัดของหลักฐาน

ตรวจไฟล์จริง [Dashboard App Demi.xlsx](../Dashboard%20App%20Demi.xlsx): มี worksheet `Dashboard ภาพรวม` (A1:AQ29) และ `รายงานการจัดบริการ` (A1:BM37); เป็น formatted blank template และไม่มีสูตรในสองชีต ณ baseline นี้ SHA-256 `f70b4fc42d31b5ca5fb9b9f8f915a91709b376a31839fa420a62f8103efe7d43`

workbook เป็นหลักฐานของหัวข้อและวิธีนำเสนอที่ลูกค้าเคยให้ดู ไม่ใช่หลักฐานยืนยัน database source, สูตรทางคลินิก, หน่วย, นิยามหรือ permission การยอมรับ label ในไฟล์ไม่ได้แปลว่าอนุมัติ clinical interpretation

- Sheet 1 มี Hospital/cohort headings, ผู้ป่วย/ID/อสม., Before, During slots 1–6 (DTX/BW/Achieve score) และ After
- Sheet 2 มี Hospital/patient context, Before/After, PAM/PROM/confidence/exercise fields, Service 1, Service 2 และ Service 3–6 Follow-up fields
- หมายเหตุใน Sheet 2 ระบุความคาดหวัง Follow-up ประมาณ 2–4 ครั้งต่อ Program และรายงานสรุป service completeness; จำนวนนี้ไม่ใช่ min/max, persistence cardinality หรือ completion rule และรายงานไม่แทน detailed patient record
- field set ของสองชีตไม่เหมือนกัน ห้ามย้าย/เติม field จากอีกชีตโดยไม่ให้ลูกค้าตัดสินใจ

## 4. ประชากรและ row grain ที่เสนอ

### 4.1 Reporting population — R24A-D01

**ข้อเสนอ:** หนึ่ง export ครอบคลุม exact Hospital เดียวที่ผู้ส่งออกได้รับอนุญาต; ใช้ `PatientHospitalRelationship` ของ Hospital นั้นเป็น organizational boundary; รวมทุก eligible ACTIVE และ COMPLETED Program โดยค่าเริ่มต้น โดยไม่บังคับวันเริ่ม/สิ้นสุดแบบเดือนหรือไตรมาส การเลือก subset เพิ่มเติมต้องมาจาก filter ที่ลูกค้าอนุมัติชัดเจน

ทางเลือกที่ต้องให้ Product Owner/ลูกค้ายืนยัน:

1. รวม Program ทุกสถานะที่มีใน exact Hospital scope (เฉพาะ `ACTIVE`/`COMPLETED` ที่มีใน current enum) หรือจำกัดเป็น subset ที่เลือกได้
2. ใช้เฉพาะ relationships ที่ปัจจุบันยังถือว่า eligible หรือรวม historical records ที่เคยอยู่ใน scope
3. เลือก Program ตามสถานะ/วันที่หรือไม่; ถ้ามี filter ต้องนิยามเพิ่มและไม่ถือว่า RPT-24 ยืนยัน filter นั้น
4. การยกเว้น relationship ที่ถูก archive, suspend หรือไม่ eligible ต้องอ้างแหล่งสถานะที่ชัดเจน

หลักฐานปัจจุบัน: `PatientHospitalRelationship` ใน Prisma มี `id`, `patientProfileId`, `hospitalId`, nullable `hospitalNumber` และ timestamps แต่ไม่มี relationship `status`/archive/suspend field; `PatientProgramStatus` ปัจจุบันมี `ACTIVE` และ `COMPLETED` เท่านั้น ดังนั้นห้ามสมมติว่ามีตัวกรอง relationship lifecycle หรืออนุมานจาก `updatedAt`/การไม่มีข้อมูล ผู้มีอำนาจต้องยืนยัน business eligibility และ engineering ต้องชี้ authoritative source ก่อนทำ filter

**Trade-off:** exact Hospital ป้องกัน hierarchy/shared-Person scope expansion แต่ population เก่า/ไม่ active จะยังไม่ปลอดภัยพอให้รวมจนกว่า relationship eligibility จะมีนิยามและหลักฐาน

### 4.2 Row grain — R24A-D02 และ separation — R24A-D03

**ข้อเสนอ:** หนึ่งแถวต่อหนึ่ง Patient Program ใน Sheet 1 และหนึ่งแถวต่อ Program ใน Sheet 2; correlation ภายในใช้ exact PatientHospitalRelationship + PatientProgram แต่ internal IDs ไม่ใช่ displayed ID โดยปริยาย ผู้ป่วยที่มีสอง Program อาจมีสองแถว โปรแกรมเดียวกันต้องแสดง Baseline, Service 1, GoalPlan, Follow-up และ Final ที่ link กับ Program นั้นเท่านั้น

ผู้ป่วยคนเดียวที่มี relationship กับหลาย Hospital ต้องแยก scope โดย `PatientHospitalRelationship`; ห้าม join ผ่าน shared `Person` เพื่อดึงข้ามโรงพยาบาล และห้ามรวมข้อมูลข้าม Program เพื่อเติม field ที่ว่าง โปรแกรม ACTIVE อาจไม่มี `completedAt`/Final; Program COMPLETED ก็อาจไม่มี Final; ทั้งคู่ต้องแสดงตาม lifecycle fact จริง ส่วน service ที่ไม่มี record ไม่ถือว่าทำเสร็จ

หากผู้ป่วยหลาย Program ปรากฏซ้ำ Customer ควรยืนยันว่าจะใช้ Program start/status ที่มีใน workbook เพื่อแยกแถว หรือจำเป็นต้องเพิ่ม visible Program identifier ใหม่ การเพิ่ม identifier เป็น display/business decision; ห้ามแสดง UUID เพื่อแก้ความกำกวมโดยพลการ

## 5. Patient และ OSM identity — R24A-D04/D05

| Field | Evidence | ตัวเลือกให้พิจารณา / ข้อเสนอ |
| --- | --- | --- |
| Patient given/family name | Person names เป็น PII และอาจ nullable; exact cohort export authorization ยังไม่มี | ยืนยันว่าจำเป็นต่อการติดตามงานใน workbook หรือควร mask/omit; หากแสดงต้องอยู่ใน exact-Hospital authorized projection |
| Workbook `ID` | `PatientHospitalRelationship.hospitalNumber` เป็น nullable Hospital-local candidate | A: ใช้เมื่อลูกค้ายืนยันว่าเป็น ID ที่ต้องการ; B: อนุมัติ customer-facing Program identifier ใหม่ในอนาคต; C: ไม่แสดง direct identifier จนกว่าจะตัดสินใจ; ห้ามใช้ internal UUID แทน |
| Missing `hospitalNumber` | ไม่มี fallback ที่อนุมัติ | ใช้ blank/approved label หรือ omit field ตาม customer template decision; ห้ามใส่ UUID หรือสร้างเลขทดแทน |
| Responsible OSM | Exact relationship assignment ปัจจุบันและ assignment history มี; เวลา assignment ไม่พิสูจน์ผู้รับผิดชอบ ณ ทุก Program/Follow-up | เลือกแสดง current assignment ณ snapshot, แสดง historical assignment เฉพาะเมื่อ attribution พิสูจน์ได้, หรือ omit; OSM name เป็น workforce PII และยังต้องผ่าน security/privacy authorization |

การเลือก field ไม่อนุมัติ actor, scope, export capability หรือ access to Patient rows; รายละเอียดเหล่านี้ยังเป็น RPT-24C gate

## 6. Field coverage และ readiness แยกตาม worksheet

### 6.1 วิธีอ่าน readiness

- `CUSTOMER_PRESENTATION_ONLY` — มี label/ช่องใน template แต่ยังไม่ยืนยันความหมายหรือการนำออกใช้
- `VERIFIED_FACTUAL_SOURCE` — source fact ปัจจุบันตรวจพบ ไม่ได้แปลว่าอนุญาตให้ export
- `SOURCE_AVAILABLE_SEMANTICS_OPEN` — source มี แต่ stage, unit, linkage, meaning หรือ display ยังต้องตัดสินใจ
- `NO_AUTHORITATIVE_SOURCE` — ไม่พบ source ที่ยืนยันสำหรับ field นั้น
- `DERIVED_RULE_NOT_APPROVED` — ต้องมี formula/rule/inputs/version/validation ที่รับรองก่อน
- `DISCLOSURE_AUTHORIZATION_OPEN` — field เป็น PII/ข้อมูลสุขภาพ/ข้อมูลผู้ปฏิบัติงาน และยังไม่มี export permission
- `FUTURE_IMPLEMENTATION_GATED` — อาจพิจารณาในอนาคตหลัง requirement, clinical/privacy/security และ implementation approvals

ทุก field ที่เกี่ยวกับบุคคล/Program ต้องผ่าน dedicated exact-Hospital export authorization ที่ยังไม่มี การมี source เป็นเพียง evidence ไม่ใช่ Export Authorized

ทุก data-field row ด้านล่างยังมีสถานะ `FUTURE_IMPLEMENTATION_GATED`; ไม่มี field ใดได้รับอนุมัติให้ export หรือพร้อม implement จาก source evidence เพียงอย่างเดียว

### 6.2 Sheet 1 — `Dashboard ภาพรวม`

| Workbook field / cells | Customer presentation | Current source/readiness | Proposed bounded disposition และ gate |
| --- | --- | --- | --- |
| Hospital header A1 | ชื่อ Hospital | `Hospital.name` เป็น organizational source: `VERIFIED_FACTUAL_SOURCE`; scope ยังต้องตรวจ | แสดงเฉพาะ exact authorized Hospital; `FUTURE_IMPLEMENTATION_GATED` |
| Cohort counts A2/C2/C3 | จำนวนเคส, เบาหวาน, กลุ่มเสี่ยง (Pre-DM) | มี Patient classification `RISK`/`DIABETES` และ query count ที่นับ relationship rows; ไม่ยืนยัน DM/Pre-DM หรือ unique-person denominator: `DERIVED_RULE_NOT_APPROVED`, `DISCLOSURE_AUTHORIZATION_OPEN` | แนะนำเว้นยอดไว้ จนยืนยัน classification authority, denominator, cross-Hospital handling และ count privacy |
| ชื่อ/สกุล B4:C7 | Patient identity | Person name เป็น PII/nullable: source มี แต่ permission และ missing-name behavior เปิด | Customer ยืนยันความจำเป็น; security/privacy อนุมัติการแสดงก่อน |
| ID D4:D7 | Patient identifier | `hospitalNumber` nullable exact Hospital relationship candidate: `SOURCE_AVAILABLE_SEMANTICS_OPEN` | ตามตัวเลือก R24A-D04; ไม่มี UUID fallback |
| Illness duration E4:E7 | ระยะเวลาการเจ็บป่วย | ไม่พบ source/definition ที่ authoritative: `NO_AUTHORITATIVE_SOURCE` | เว้น field หรือกำหนด future authoritative source; ห้ามคำนวณ/ประมาณจาก Program start |
| Responsible OSM F4:F7 | อสม.ที่ดูแล | Current/history assignment มี แต่ attribution และชื่อที่เปิดเผยไม่รับรอง: `SOURCE_AVAILABLE_SEMANTICS_OPEN`, `DISCLOSURE_AUTHORIZATION_OPEN` | ตัดสินใจ current-at-snapshot vs verified historical vs omit; ห้ามอ้าง current assignment ย้อนหลัง |
| Before G5:P7 | Program start, CVD, HbA1c, DTX, BW, BMI, height, waist, BP | `startedAt` เป็น lifecycle fact; Baseline link exact ผ่าน `initialBaselineId`; raw DTX/BW/waist/BP มีใน projection; nullable Baseline `hba1c`/`heightCm` มีใน current schema/service แต่ projection ไม่ expose; Final ไม่มี HbA1c/height equivalent; CVD source/formula ไม่มี; BMI rule ไม่อนุมัติ | เริ่มพิจารณาเฉพาะ exact-linked factual values หลัง clinical stage/unit/display approval; HbA1c/height ต้องเพิ่ม projection ภายหลังหากอนุมัติ; CVD/BMI เว้นไว้จน source/rule ผ่าน |
| During positions Q4:AH6 (1–6) | DTX, BW, Achieve score ใน 6 slot | Program-linked Follow-up เป็น normalized 0..N; DTX/BW source มี; achieved numerator/denominator/rate ไม่มี: raw `SOURCE_AVAILABLE_SEMANTICS_OPEN`, score `DERIVED_RULE_NOT_APPROVED` | แสดง raw fact เฉพาะเมื่อ unit/time/slot wording อนุมัติ; ห้ามสร้าง score; overflow ตาม D11 |
| After AI5:AQ7 | Program end, CVD, HbA1c, DTX, BW, BMI, waist, BP | `completedAt` lifecycle fact; Final 0..1 มี nullable DTX/BW/waist/BP; ไม่มี Final HbA1c/height; CVD ไม่มี; BMI formula ไม่อนุมัติ | แยก Program completion จาก Final existence; แสดงเฉพาะ exact Final facts ที่อนุมัติ; ช่อง unsupported ไม่กลายเป็น zero |

### 6.3 Sheet 2 — `รายงานการจัดบริการ`

| Workbook field / cells | Customer presentation | Current source/readiness | Proposed bounded disposition และ gate |
| --- | --- | --- | --- |
| Hospital header A2 | Hospital | `Hospital.name`: `VERIFIED_FACTUAL_SOURCE`; scope/auth เปิด | exact authorized Hospital เท่านั้น |
| Counts A3/C3/C4 | จำนวนเคส/เบาหวาน/กลุ่มเสี่ยง | same classification/denominator issue as Sheet 1: `DERIVED_RULE_NOT_APPROVED` | defer until R24A-D08; no unapproved DM/Pre-DM mapping |
| Patient name/ID/illness/OSM A5:F8 | Context ต่อ Program row | name/HN/OSM มีความเสี่ยง PII; illness duration ไม่มี source: `DISCLOSURE_AUTHORIZATION_OPEN` / `NO_AUTHORITATIVE_SOURCE` | ใช้การตัดสินใจร่วมกับ Sheet 1; ห้ามให้ Sheet 2 กว้างกว่า scope |
| Program start/end G5:H8 | Program lifecycle dates | `startedAt`/`completedAt` factual Program facts; ไม่ใช่ service/clinical observation time: `VERIFIED_FACTUAL_SOURCE` | แสดง lifecycle wording ที่ customer/clinical owner อนุมัติ; end date ว่างเมื่อยังไม่จบ/ไม่มีค่า |
| Before I6:N8 | DTX, BW, PAM, PROMs, confidence, weekly exercise | Baseline DTX/BW source; Screening PAM/PROM JSON เป็น prototype และไม่ link Program ใน report; Baseline confidence กับ Service 1 confidence ความหมาย/ช่วงไม่ยืนยัน; actual weekly exercise time ไม่มี source | `SOURCE_AVAILABLE_SEMANTICS_OPEN` สำหรับ DTX/BW/confidence/PAM/PROM; `NO_AUTHORITATIVE_SOURCE` สำหรับ weekly exercise; display หลัง stage/unit/instrument/auth decision เท่านั้น |
| After O6:R8 | DTX/BW, weekly exercise, >70% count | Final DTX/BW nullable raw source; weekly exercise actual ไม่มี source; achievement rate/denominator/threshold count ไม่มี rule | DTX/BW พิจารณาหลัง approval; weekly exercise `NO_AUTHORITATIVE_SOURCE`; >70% `DERIVED_RULE_NOT_APPROVED`; ไม่คำนวณ |
| Service 1 S5:X8 | Floating Chart, Dream Card, Routine ทำ/ไม่ทำ | per-Program records/evidence association มี; record presence พิสูจน์ว่ามีข้อมูลใน DEMI ไม่ได้พิสูจน์การส่งมอบ/สำเร็จ; content/attachment sensitive | อนุมัติว่าจะใช้ “มี/ไม่มีบันทึกใน DEMI”; default ไม่ export free text/image/evidence body |
| Service 2 Y5:AG8 | Food goals, exercise goals, frequency/duration targets | GoalPlan/GoalItem exact Program linkage และ target facts มี; activityCode/template version/unit ต้อง map; target ไม่ใช่ performed activity | ใช้เฉพาะ linked plan; แสดง target wording หลัง customer/clinical approval; ไม่แปลง target เป็น achievement |
| Services 3–6 AH5:BM8 | Follow-up date, achieved days/rate, outcome, plan adjustment, obstacles | Follow-up 0..N; `recordedAt` เป็นเวลา app บันทึก ไม่ใช่ encounter/observation date; categorical progress มีแต่ไม่มี achieved-day count/rate; outcome free text ไม่มี approved vocabulary; plan adjustment/obstacle flag ไม่มี structured source | แสดงได้เพียง source fact ที่ได้รับอนุมัติ; ห้ามคำนวณวัน/rate, แปล notes เป็น outcome/obstacle หรืออนุมาน plan adjustment |
| Workbook notes AH31:BM37 | Achieve score note, outcome/obstacle guidance, 2–4 Follow-up expectation, summary caveat | Template guidance เท่านั้น: `CUSTOMER_PRESENTATION_ONLY`; ไม่มีสูตร/จำนวนบังคับ | รักษา 2–4 เป็น expectation; summary completeness ไม่แทน detailed patient record; ลูกค้ายืนยันถ้อยคำ/เวอร์ชัน |

รายการ field-to-source ราย cell, source path, timestamp และ missing behavior ที่ละเอียดกว่าอยู่ใน [RPT-24 contract §§5–6](./PHASE_17_RPT24_ON_DEMAND_ASOF_EXCEL_EXPORT_CONTRACT.md) และยึด current implementation ที่ตรวจใน repository ไม่ใช่ Phase 15A/15E historical snapshot เพียงอย่างเดียว

## 7. Unsupported fields และ coverage ระยะแรก — R24A-D07/D08/D09

สำหรับ field ที่ยังไม่พร้อม มี disposition ทั่วไปสามแบบ:

- **A — Defer:** เว้น/แสดง unavailable ตาม label ที่อนุมัติ; ไม่ block factual fields ที่ปลอดภัยกว่า แต่ห้ามอ้าง full-template acceptance
- **B — Authoritative source:** อนุมัติและสร้าง source ที่รับผิดชอบใน phase ต่อไป ก่อน report field นั้น
- **C — Approved derived rule:** ใช้เฉพาะเมื่อ source, สูตร, units, denominator, version, missing behavior และ validation ได้รับการรับรอง; ใช้ไม่ได้กับ field ที่ไม่มี input/meaning เพียงพอ

ต้องแยกผลลัพธ์สามระดับ:

| ระดับ | หมายถึง | เงื่อนไข |
| --- | --- | --- |
| Minimal factual export candidate | ส่งเฉพาะ factual fields ที่อนุมัติแล้ว; unsupported fields คง unavailable/omit ตาม presentation ที่ตกลง | ลูกค้ายอมรับ partial field coverage; security/privacy/export authorization ผ่าน |
| Full workbook compatibility | ครบทุก field/column ที่ลูกค้าระบุว่าจำเป็น และ layout/overflow/missing rules ที่รับรอง | ทุก required field มี source/semantics และ template behavior ที่อนุมัติ; ห้ามลบ mandatory column เงียบ ๆ |
| Official clinical reporting readiness | ข้อมูลใช้สื่อความหมาย clinical stage/classification/derived result อย่างเป็นทางการ | Clinical/data authority รับรอง source, timing, units, formulas/version, validation และ disclosure |

| Field | Evidence ปัจจุบัน | ข้อเสนอเริ่มต้น | ทางเลือกเพิ่มเติม / dependency |
| --- | --- | --- | --- |
| Illness duration | ไม่มี start event/definition source | A | B: อนุมัติ source, unit, onset/correction semantics; C ทำได้ต่อเมื่อ formula/event ถูกกำหนดโดย authority |
| HbA1c Before/After | Baseline nullable field มีแต่ exact report projection ไม่เลือก; Final ไม่มีเทียบเท่า | A: omit จน semantics/allowlist อนุมัติ | B: เพิ่ม/เลือก source ที่ authoritative โดยเฉพาะ After; C ไม่ใช่สูตรคำนวณทั่วไป |
| CVD risk score | ไม่พบ source, algorithm หรือ version | A | B: accepted authoritative result; C: clinical approval ของ algorithm, input, unit, version, timing, missing/range rules |
| BMI | heightCm และ weight บาง stage มี; stored BMI/สูตรที่รับรองไม่มี | A | B: authoritative BMI source; C: clinical acceptance ของ inputs ที่ stage-compatible, units, formula, rounding, version, validation |
| DM / Pre-DM case counts | Current `RISK`/`DIABETES` ไม่เท่ากับ DM/Pre-DM; denominator/deduplication เปิด | A: omit counts | B/C: approved clinical classification, effective-time/correction, Patient vs relationship denominator และ cross-Hospital policy |
| PAM / PROMs | versioned JSON prototype; report ไม่มี Program stage/link ที่อนุมัติ | A | B: approved instrument result, stage/link/version/scoring source; C เฉพาะ scoring ที่ clinical authority กำหนด |
| Actual weekly exercise time | ไม่มี observed-duration source; GoalPlan เป็น target | A | B: authoritative observation source; C ไม่ใช้ target หรือ Follow-up count แทน actual time |
| Achieved activity days | Follow-up มี categorical progress; ไม่มี numeric achieved-day count | A | B: authoritative field; C: accepted period/denominator and handling for PARTIAL/NOT_APPLICABLE/zero-target |
| Achievement score/rate | ไม่มี stored rate/numerator/denominator rule | A | B: approved persisted score; C: accepted formula, window, denominator, statuses and rounding |
| `>70%` achievement count | ไม่มี accepted achievement rate/threshold population | A | B/C: ต้องมี approved rate source, strict/inclusive threshold, population and missing handling |
| Structured Follow-up outcome | มี note text แต่ไม่มี controlled outcome vocabulary | A: omit outcome label; do not classify note | B: approved structured vocabulary/source; C ไม่ derive clinical outcome จาก free text |
| Plan adjustment | GoalPlan rounds มี แต่ไม่มี event linking an adjustment to a Follow-up | A | B: authoritative adjustment event; C ห้าม infer จาก plan count/edit |
| Follow-up obstacle flag | ไม่มี structured Follow-up flag; note/source อื่นไม่เทียบได้ | A | B: approved source/vocabulary and disclosure rules; C ห้าม infer จาก missing note/status |

การเลื่อน derived/unsupported field ไม่จำเป็นต้อง block แนวคิด minimal factual export โดยรวม หากลูกค้ายอมรับ partial coverage และ privacy/clinical gates ผ่าน แต่ห้ามเรียกผลลัพธ์ว่า workbook ครบหรือ official clinical report เมื่อ field ที่ลูกค้าถือเป็น mandatory ยังขาดอยู่

## 8. Service completeness และข้อมูลที่ไม่ครบ — R24A-D10/D12

**ข้อเสนอ:** service completeness ในขอบเขตที่มี record source ให้หมายถึง “มี/ไม่มีข้อมูลกิจกรรมที่บันทึกใน DEMI” เท่านั้น ห้ามแปลเป็นส่งมอบบริการ, ทำสำเร็จ, ผู้ป่วยทำได้, clinical outcome หรือ completion ของ Program โดยไม่มี rule และ event source ที่อนุมัติ การไม่มี record แปลได้เพียง “ไม่มี record ใน source ที่อ่านได้” ไม่ได้พิสูจน์ว่าไม่มีบริการในโลกจริง

| Source state ภายใน | ความหมาย | Presentation direction (รอลูกค้ายืนยัน) |
| --- | --- | --- |
| บันทึกเลขศูนย์จริง | factual zero | แสดง `0` ได้เมื่อ source มี numeric zero จริง |
| field nullable | ไม่มีค่าที่บันทึกใน field นั้น | blank หรือ Thai label ที่ตกลง; ห้ามเติม `0` |
| linked source record ไม่มี | ไม่มี record/link สำหรับ Program นั้น | label ที่เป็นกลางตาม stage เช่น “ไม่มีข้อมูลที่บันทึก” เฉพาะเมื่อ disclosure policy อนุญาต; ไม่สรุปว่าไม่ให้บริการ |
| ไม่มี Baseline link / ไม่มี Final / ไม่มี Follow-up | source absence คนละชนิด | รักษาความแตกต่างภายใน projection; customer labels ยังเปิด |
| not applicable | ใช้ได้เมื่อมี rule ที่รับรองเท่านั้น | ห้ามใช้แทน unknown/missing หรือสร้างขึ้นเอง |
| withheld/unauthorized | การเปิดเผยถูกห้ามหรือ access ไม่ผ่าน | ห้ามใช้ label/จำนวนที่เปิดเผย source existence; ใช้ safe unavailable/deny ตาม RPT-24C |

การตัดสิน missing presentation ต้องไม่ลบ state distinctions ใน source contract; security/privacy authority ต้องพิจารณาว่าการแสดง “ไม่มี record” เปิดเผยข้อมูลใดหรือไม่ โดยเฉพาะเมื่อ field นั้นถูก withheld

## 9. Follow-up positions และ overflow — R24A-D11

Current workbook มีหก visible slots ส่วน persistence เป็น normalized 0..N; 2–4 ครั้งเป็น expectation เท่านั้น ไม่ใช่ maximum ห้ามเงียบ ๆ แสดงแค่หกแล้วเรียกว่า complete

| Option | วิธี | ข้อดี | Trade-off |
| --- | --- | --- | --- |
| A — Expand rows | ทำซ้ำ Program context ในแถว/ส่วนขยายเพื่อแสดง Follow-up ทั้งหมด | เก็บ history ไว้ใน logical sheet เดียว | เปลี่ยน wide workbook และอาจทำซ้ำ Patient/Program context |
| B — Summary + details **(แนะนำแบบมีเงื่อนไข)** | คงสองชีตเป็น summary; เพิ่มชีต Follow-up detail หนึ่งแถวต่อ Follow-up และแสดง history ครบ พร้อมตัวบ่งชี้ว่ามีรายละเอียด | รักษาโครงสร้างที่คุ้นเคยและไม่ทิ้ง history | เพิ่มชีตที่ 3; ต้องมี customer approval, row correlation และการยืนยันว่ารายละเอียดครบ |
| C — Reject overflow | ปฏิเสธ exact-template export เมื่อเกินจำนวน slot ที่ลูกค้ารับรอง | คงรูปแบบเดิมโดยไม่ truncate | ใช้งานไม่ได้กับบาง Program และต้องแจ้ง failure ชัดเจน |

Option B เป็นข้อเสนอ ไม่ได้สร้างชีตหรือปิด workbook layout decision โดยอัตโนมัติ; แนวทางที่แนะนำคือให้ชีตรายละเอียดแสดง Follow-up **ครบทุก record** และ summary มี overflow indicator พร้อม Program correlation หากเลือก A/B ต้องกำหนด deterministic mapping ตาม Follow-up round/order และ tie-breaker; ส่วน C ต้องไม่มี partial workbook ที่ทำให้เข้าใจว่าครบ

## 10. Workbook compatibility — R24A-D13

| ทางเลือก | ขอบเขต | Trade-off |
| --- | --- | --- |
| Exact reproduction | จำลอง workbook เดิมอย่างเที่ยงตรง รวม merged cells, dimensions, labels และ fixed positions | ต้องระบุ template/version, dynamic row behavior และ overflow; workbook ไม่มีสูตรแต่ยังมี field ที่ไม่มี source |
| Functionally equivalent XLSX **(แนะนำ)** | คงชื่อ/ลำดับสองชีตและโครงสร้างที่ลูกค้าจำได้ ปรับ technical layout ให้รองรับ dynamic rows/missing values | ไม่รับรอง pixel-perfect; แก้ required column/format ต้องให้ลูกค้ารับรอง |
| Versioned revised template | อนุมัติรูปแบบรุ่นใหม่ เช่น เพิ่ม Follow-up detail worksheet, metadata หรือแก้ label/column | ให้ความชัดเจน/ติดตามเวอร์ชัน แต่เป็นการเปลี่ยน customer deliverable ต้องรับรองก่อน |

ข้อเสนอคือใช้ versioned, functionally equivalent XLSX ที่รักษา recognizable two-sheet structure; ทุกการเพิ่มชีต เปลี่ยน field บังคับ สูตร หรือความหมายต้องเป็น customer-acceptance item ไม่ใช่ implementation discretion

มิติที่ต้องรวมใน template acceptance:

| มิติ | ข้อเสนอ/สถานะ |
| --- | --- |
| ชื่อและลำดับ worksheet | คง `Dashboard ภาพรวม` และ `รายงานการจัดบริการ` เป็นสองชีตหลัก; ลำดับเดิมเป็น candidate |
| Thai header และ encoding | คงถ้อยคำภาษาไทยที่ลูกค้ายืนยันและ UTF-8; การเปลี่ยน label เป็น acceptance item |
| Merged cells / รูปแบบเดิม | เป็นหลักฐานการจัดหน้า; ไม่ promise pixel-perfect จนลูกค้าระบุเป็น requirement |
| Patient/Program rows | ต้องรองรับจำนวนแถวตาม approved population โดยไม่ตัดข้อมูลเงียบ; ordering ตาม D15 |
| Follow-up wide columns | หกตำแหน่งเป็น presentation; overflow ตาม D11 ไม่ใช่ cardinality |
| Missing indicators / metadata | ตาม D12/D14; แยกเวลาและ missing semantics โดยไม่เปิดเผย withheld state |
| Program disambiguation | ใช้ field ที่ลูกค้ารับรอง; internal UUID ไม่ใช่ displayed identifier |
| File size, runtime, row limits | ต้องมี bounded operational contract ใน RPT-24C; ตัวเลขยังไม่กำหนดใน RPT-24A |

## 11. Timing และ Program stages — R24A-D06/D14

| Source | ความหมายที่ตรวจพบ | ขอบเขตการใช้ที่เสนอ |
| --- | --- | --- |
| `PatientProgram.startedAt` / `completedAt` | Program lifecycle | แสดงเป็นวันเริ่ม/จบ Program; ไม่เรียกเป็นวันเริ่ม/สิ้นสุดบริการหรือวันตรวจ |
| `PatientProgram.initialBaselineId` | exact Program → Baseline link | Before ใช้ Baseline ที่ link นี้เท่านั้น; ห้ามเลือก Baseline ล่าสุดหรือ relationship-wide value มาแทน |
| Service 1 records / Program-linked GoalPlan / Follow-up | During factual records/targets/history | ใช้เฉพาะ record ของ exact Program; GoalPlan target ไม่ใช่ achievement; Follow-up `recordedAt` เป็นเวลา app บันทึก ไม่ใช่ observation/visit time |
| Program-linked Final Assessment | Final source 0..1 | การมี/ไม่มี Final แยกจาก `Program.status`; Final `recordedAt` ไม่ใช่วันตรวจโดยอัตโนมัติ |
| source-specific times | `recordedOn`, `recordedAt`, `createdAt`, lifecycle times เป็นคนละชนิด | label ตามความหมายต้นทาง; ห้ามใช้แทนกัน; timestamp ไม่ยืนยันว่า clinical event เกิดในเวลานั้น |

### 11.1 `requestedAt`, `dataAsOf` และ `generatedAt`

- `requestedAt`: server รับ request; ใช้บันทึกเวลา request เท่านั้น
- `dataAsOf` / snapshot boundary: database source state ที่ใช้ทั้งสองชีต, population/counts, pagination และ source lookups จาก coherent approved snapshot เดียวกัน; เป็น wall-clock time ได้เฉพาะเมื่อ correspondence พิสูจน์ได้
- ถ้า exact wall-clock time ของ snapshot พิสูจน์ไม่ได้ ให้ระบุ snapshot identity/boundary ที่มีจริงหรือไม่แสดงเวลาที่อ้างผิด; ห้ามเอา `requestedAt` มาแทน
- `generatedAt`: server time เมื่อ XLSX generation จบ

การได้ snapshot และความสัมพันธ์กับการตรวจสิทธิ์, concurrent updates, revocation และ long-running export เป็น RPT-24C/engineering gate ไม่ใช่ customer decision เรื่อง isolation level การเลือก label แสดงใน workbook เป็น presentation decision; ข้อกำหนด on-demand และการมี data snapshot ไม่เปลี่ยนเป็น monthly/quarterly export และไม่เปิดใช้ HN-M06 date filters

## 12. Authorization และขอบเขตระยะ RPT-24A

RPT-24A เตรียม decision ด้าน population, identity, field, presentation และ workbook behavior เท่านั้น ไม่อนุมัติ patient-data export access:

- `report:program:read` ปัจจุบันเป็น exact-Program factual read ไม่ใช่ Hospital cohort หรือ export permission
- dedicated cohort/export capability ยังไม่มีและยังไม่อนุมัติ
- ทุกการเปิดเผย PII/clinical/OSM ต้องมี server-side exact-Hospital authorization, field allowlist และ privacy/security approval แยกใน RPT-24C
- ห้าม Parent OWNER ได้สิทธิ์อ่าน Child patient roster จาก hierarchy; HN-M08 Network Export คง **DEFERRED / NOT AUTHORIZED**
- ยังต้องตัดสิน actor, OWNER/MEMBER/OSM/ADMIN scope, rate/resource limits, snapshot/revocation, audit/retention, caching/file delivery และ logging ก่อน real-data exposure

การยืนยัน field/population จากลูกค้าไม่ปิด authorization, clinical interpretation, privacy review หรือ implementation release gate

## 13. Decision Register — R24A-D01–D15

สถานะของทั้ง 15 รายการ ณ เอกสารนี้คือ **PROPOSED FOR REQUESTER / CUSTOMER REVIEW** ไม่มีรายการใด CLOSED/ACCEPTED จากการเตรียมเอกสาร

| ID | Evidence | Proposed recommendation | Alternatives / trade-offs | Required decision authority | Status | Impact if unresolved |
| --- | --- | --- | --- | --- | --- | --- |
| R24A-D01 — Hospital population | `PatientHospitalRelationship.hospitalId` เป็น exact boundary; model ไม่มี status; Program enum มี ACTIVE/COMPLETED | exact Hospital หนึ่งแห่ง; รวมทุก Program ที่ผ่าน relationship eligibility ในสอง status ที่มี; ไม่ตั้ง date cycle เริ่มต้น; ต้องตกลง relationship eligibility | รวม historical relationship ทั้งหมดง่ายแต่เสี่ยง stale scope; จำกัด current eligible ปลอดภัยกว่าแต่ต้องมี authoritative criterion | Requester/customer + Product Owner + Hospital operations; Security ทบทวน scope | PROPOSED FOR REQUESTER / CUSTOMER REVIEW | BLOCKS population/filter selection; ห้าม export cohort |
| R24A-D02 — Row grain | Workbook เป็น patient rows; Program/child sources ผูก Program; multiple Program possible | หนึ่ง row ต่อ Patient Program ต่อชีต; Program identity ภายในไม่แสดง UUID; ให้ลูกค้าตัดสิน visible disambiguation | หนึ่ง row/Patient เสี่ยงผสม lifecycle; row/Follow-up เปลี่ยน workbook grain | Customer + Product Owner | PROPOSED FOR REQUESTER / CUSTOMER REVIEW | BLOCKS final workbook row/layout contract |
| R24A-D03 — Program/Hospital isolation | Relationship unique ต่อ PatientProfile+Hospital; report projection scopes Program/relationship | แยกทุก Program และทุก Hospital relationship; ห้าม shared Person join ข้าม Hospital | รวม Program ต่อคนสะดวกแต่สูญเสีย isolation; cross-Hospital dedup เสี่ยง disclosure | Product Owner + Hospital operations + Security | PROPOSED FOR REQUESTER / CUSTOMER REVIEW | BLOCKS safe population/source joins |
| R24A-D04 — Displayed Patient ID | `hospitalNumber` nullable และ Hospital-local; UUID เป็น internal | ใช้ `hospitalNumber` หากยืนยันว่าเป็น customer ID; ถ้า missing ใช้ approved blank/label; ห้าม UUID fallback | approved new customer-facing Program identifier ต้องมี requirement/source แยก; omit ID ลด PII แต่ลดประโยชน์ | Customer + Product Owner + Hospital data owner + Security/privacy | PROPOSED FOR REQUESTER / CUSTOMER REVIEW | BLOCKS ID column decision |
| R24A-D05 — Names and OSM | Patient/OSM names เป็น PII; OSM current/history ไม่ยืนยัน attribution ย้อนหลัง | ตัดสินใจชื่อ patient; current OSM ณ snapshot หรือ omit จน historical attribution พิสูจน์ได้ | mask/omit ลด disclosure แต่อาจลด usability; historical display ต้องมี provenance | Customer + Product Owner + Hospital operations + Security/privacy | PROPOSED FOR REQUESTER / CUSTOMER REVIEW | BLOCKS identity/OSM fields and requires RPT-24C |
| R24A-D06 — Before/During/After | Exact Baseline link, Program Service/GoalPlan/Follow-up, Final source มี; timestamps เป็นคนละ semantics | ยืนยัน stage labels ที่สะท้อน source; ไม่ใช้ lifecycle time เป็น clinical observation | ใช้ technical labels (Baseline/Follow-up/Final) ซื่อตรงแต่ต่าง workbook; clinical labels คุ้นเคยแต่ต้อง clinical validation | Customer/Product + Clinical authority + data owner | PROPOSED FOR REQUESTER / CUSTOMER REVIEW | BLOCKS official stage and clinical presentation |
| R24A-D07 — Missing clinical fields / phased coverage | บาง raw sources มี; HbA1c/height ไม่อยู่ใน report projection; หลาย field ไม่มี source | พิจารณา bounded factual subsetและยอมรับ omission อย่างเปิดเผย; ห้ามอ้าง full compatibility | รอครบทุก field ช้ากว่าแต่ตรง template; เพิ่ม source ต้องผ่าน governance | Customer + Product Owner + Clinical/data authority | PROPOSED FOR REQUESTER / CUSTOMER REVIEW | Blocks minimal-vs-full scope and release claim |
| R24A-D08 — DM/Pre-DM and denominator | RISK/DIABETES ≠ accepted DM/Pre-DM; current query counts relationship rows | เว้น counts จน classification, denominator, unique person/relationship และ cross-Hospital rules รับรอง | แสดง counts ที่นิยามใหม่ต้อง clinical/product acceptance; no counts loses dashboard summary | Clinical authority + Product/data owner + Security/privacy | PROPOSED FOR REQUESTER / CUSTOMER REVIEW | BLOCKS cohort count fields |
| R24A-D09 — Derived scores | BMI/CVD/achievement/>70% lacks accepted rule or complete inputs | defer derived values | create approved source or accept formula only with version, units, denominator, validation | Clinical authority + data owner + Product Owner | PROPOSED FOR REQUESTER / CUSTOMER REVIEW | BLOCKS those derived columns, not necessarily factual subset |
| R24A-D10 — Service completeness | Service 1 records, linked GoalPlan and Follow-up status are factual; no overall completion/outcome rule | define “recorded in DEMI” presence separately from service delivery, completion, patient achievement | structured completion contract could be future source; no label avoids overclaim but loses completeness view | Customer + Product Owner + Clinical/operations authority | PROPOSED FOR REQUESTER / CUSTOMER REVIEW | BLOCKS completeness labels |
| R24A-D11 — Follow-up overflow | Workbook six positions; persistence 0..N; 2–4 note is expectation | Option B: two-sheet summary plus customer-approved Follow-up detail sheet; no truncation | A expands rows and changes format; C rejects >6 exports and limits use | Customer + Product Owner | PROPOSED FOR REQUESTER / CUSTOMER REVIEW | BLOCKS complete history/layout |
| R24A-D12 — Missing-value format | Nullable facts, absent links, absent records, zero and withheld differ | preserve zero; agree blank/Thai label for allowed missing; never reveal withheld source existence | blank is compact but ambiguous; explicit labels clearer but may leak source state | Customer/Product + data owner + Security/privacy | PROPOSED FOR REQUESTER / CUSTOMER REVIEW | BLOCKS final cell mapping and safe disclosure |
| R24A-D13 — Workbook compatibility | Original is a blank formatted two-sheet template without formulas | versioned functionally equivalent XLSX preserving recognizable two-sheet structure | exact reproduction costly/rigid; revised template supports needed fields but changes customer deliverable | Customer + Product Owner | PROPOSED FOR REQUESTER / CUSTOMER REVIEW | BLOCKS template acceptance |
| R24A-D14 — As-of metadata | `requestedAt`, snapshot boundary and `generatedAt` are distinct; current reporting reads are multi-query and no coherent export snapshot contract exists | show Data As-of only when meaning/boundary is supportable; separate request/generated times; never relabel request time | show concise verified snapshot label or omit unverifiable time; engineering owns proof mechanism | Customer/Product for wording; Architecture/DB + Security for technical evidence | PROPOSED FOR REQUESTER / CUSTOMER REVIEW | BLOCKS accurate metadata and implementation |
| R24A-D15 — Ordering | Workbook has sequence column; source supports Program and Follow-up sort keys but customer order is unspecified | define human-understandable order; use deterministic hidden tie-breaker internally, never display UUID | name/ID ordering can be ambiguous/missing; chronology groups Programs but may be less familiar | Customer + Product Owner; Engineering specifies stable implementation | PROPOSED FOR REQUESTER / CUSTOMER REVIEW | BLOCKS stable workbook and cross-sheet matching |

## 14. Acceptance criteria และ conditional implementation impact

### 14.1 Decision pack acceptance

- Requester-confirmed on-demand/data-snapshot requirement remains unchanged.
- Requester/customer records an answer or explicit OPEN state for each R24A-D01–D15; no inferred approvals.
- Exact Hospital population, relationship eligibility, Program statuses/date filters, row grain and cross-Hospital isolation are explicit.
- ID/name/OSM visibility and partial-vs-full workbook scope are explicit, including null/missing behavior.
- Every field is linked to current evidence and marked with source/semantics/derived/disclosure status; no unsupported score or formula is invented.
- Follow-up overflow, summary completeness meaning, missing-value labels, workbook compatibility and metadata presentation are accepted or remain visible blockers.
- HN-M08 stays DEFERRED / NOT AUTHORIZED; no capability, data access or implementation clearance is granted.

### 14.2 Future work (conditional; not authorized by this document)

1. **RPT-24B — Clinical and source semantics:** clinical authority confirms stage, units, identifiers/classification, assessment, score/outcome fields, dates and missing rules.
2. **RPT-24C — Authorization/privacy/consistency:** approve actor/capability, exact scope, privacy, coherent snapshot boundary, revocation, audit, limits and file delivery.
3. **RPT-24D — Implementation authorization review:** only after decisions/gates close, request separate explicit implementation authorization and present bounded design/test plan.

Preparing this package does not close D01–D15, authorize export, or start RPT-24B/C/D implementation.

## 15. Open questions for requester/customer review

กรุณาตอบหรือทำเครื่องหมาย OPEN สำหรับข้อที่ต้องรอผู้มีอำนาจ:

1. จะรวม Program ACTIVE และ COMPLETED ทั้งหมดของ exact Hospital หรือมี status/date/assignment filter ที่ต้องการ?
2. จะถือ PatientHospitalRelationship ใดว่า eligible ในเมื่อ current relationship model ไม่มี status/archive/suspend field?
3. ยืนยันหนึ่งแถวต่อ Program ในสองชีตหรือไม่; ต้องเพิ่ม field ใดที่ลูกค้าอนุมัติเพื่อแยกหลาย Program ของคนเดียว?
4. ช่อง ID หมายถึง Hospital-local `hospitalNumber` หรือไม่ และถ้าไม่มีค่าให้แสดงอย่างไร?
5. ต้องแสดงชื่อ Patient และ OSM หรือไม่; OSM หมายถึง assignment ปัจจุบันหรือผู้ดูแลในช่วง Program?
6. ยอมรับ minimal factual subset ที่บางช่อง unavailable ได้หรือจำเป็นต้องรอ full workbook coverage?
7. ยืนยันว่า service completeness หมายถึงการมี/ไม่มี record ใน DEMI ไม่ใช่การยืนยันว่าให้บริการ/สำเร็จ ได้หรือไม่?
8. ยอมรับ Follow-up detail worksheet เพิ่มเติมสำหรับข้อมูลเกินหกตำแหน่งหรือไม่?
9. ต้องการ blank หรือ Thai label สำหรับค่าที่ไม่มี; เข้าใจความต่างจาก factual zero และข้อมูลที่ระบบไม่มีสิทธิ์เปิดเผยอย่างไร?
10. XLSX ต้อง pixel-perfect หรือยอมรับ versioned workbook ที่คงสองชีตหลักและปรับรูปแบบเพื่อแสดงข้อมูลครบ?
11. ต้องการให้ผู้ใช้เห็น request time, data snapshot label และ generation time ช่องใดบ้าง โดยยังแยกความหมายจริง?
12. ต้องการเรียง Patient/Program ตามชื่อ, Hospital ID ที่อนุมัติ, Program start date หรือ grouping แบบใด?

Clinical formula/source decisions ต้องตอบโดย clinical/data authority; export actor, privacy, snapshot consistency, audit และ file delivery ต้องได้รับ security/privacy/architecture review แยกจาก customer workbook choices

## 16. References

- [RPT-24 On-demand As-of Excel Export Contract](./PHASE_17_RPT24_ON_DEMAND_ASOF_EXCEL_EXPORT_CONTRACT.md)
- [Customer workbook — Dashboard App Demi.xlsx](../Dashboard%20App%20Demi.xlsx)
- [Phase 15A Reporting Data Map](./PHASE_15A_REPORTING_DATA_MAP.md)
- [Phase 15E.0 Reporting Dashboard and Export Contract](./PHASE_15E0_REPORTING_DASHBOARD_EXPORT_CONTRACT_CONSOLIDATION.md)
- [Phase 15E.1 Program Reporting Projection Foundation](./PHASE_15E1_PROGRAM_REPORTING_PROJECTION_FOUNDATION.md)
- [Phase 15E.2 Program Factual Report UI Integration](./PHASE_15E2_PROGRAM_FACTUAL_REPORT_UI_INTEGRATION.md)
- [Phase 17 UAT Backlog](./PHASE_17_UAT_BACKLOG.md)
- [Project Context](../CONTEXT.md)

**RPT-24A DECISION PACK PREPARED — REQUESTER / CUSTOMER ACCEPTANCE PENDING — EXPORT IMPLEMENTATION NOT AUTHORIZED**
