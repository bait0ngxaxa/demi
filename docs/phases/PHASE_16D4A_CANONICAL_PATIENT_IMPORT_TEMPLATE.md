# Phase 16D.4A Canonical Patient Import Template v1

สถานะ: implement แล้วสำหรับ re-audit ก่อนเริ่ม Phase 16D.5

เอกสารนี้กำหนดขอบเขตของ Canonical Patient Import Template v1 ซึ่งเป็น workbook
มาตรฐานอย่างเป็นทางการสำหรับการนำเข้า Patient roster ใหม่ของ DEMI งานในเอกสารนี้
ไม่เริ่ม Phase 16D.5 และไม่เปลี่ยน ownership ของข้อมูลที่ยังเป็น requirement-gated

## Product decision

DEMI มี Patient Import Template มาตรฐานเพียงหนึ่งแบบ ผู้ใช้ดาวน์โหลดจาก Patient
import workspace กรอกข้อมูล Patient แล้วอัปโหลดไฟล์นั้นกลับเข้าสู่ระบบ:

- ไฟล์ดาวน์โหลด: `public/templates/demi-patient-import-template-v1.xlsx`
- URL ดาวน์โหลด: `/templates/demi-patient-import-template-v1.xlsx`
- worksheet เดียว: `รายชื่อผู้ป่วย`
- version: `patient-import-template-v1`
- รองรับข้อมูลสูงสุด 500 รายการต่อไฟล์

`PATIENT_IMPORT_TEMPLATE_VERSION` เป็น version ของโครงสร้าง workbook ส่วน
`PATIENT_IMPORT_CONTRACT_VERSION` (`phase-16d4-osm-assignment-v2`) เป็น version ของ
runtime preview/confirm reconciliation semantics ทั้งสอง version จึงแยกกันและ
ห้ามใช้แทนกัน

## Canonical workbook structure

Template มี header สองแถว ข้อมูลเริ่มที่แถว 3 และมีคอลัมน์ A ถึง AB รวม 28 คอลัมน์
ตามลำดับเดียวกันดังนี้:

| คอลัมน์ | field | header |
| --- | --- | --- |
| A | `sourceSequenceNumber` | ที่ |
| B | `nationalId` | เลขบัตรประชาชน |
| C | `dateOfBirth` | วันเกิด |
| D | `givenName` | ชื่อ |
| E | `familyName` | นามสกุล |
| F | `hospitalNumber` | HN |
| G | `gender` | เพศ |
| H | `phoneNumber` | เบอร์โทร |
| I | `weight` | น้ำหนัก |
| J | `height` | ส่วนสูง |
| K | `waistCircumference` | รอบเอว(ซม.) |
| L | `diabetesClassification` | ประเภทเบาหวาน |
| M | `bloodSugarDtx` | ค่าน้ำตาลในเลือด |
| N | `hba1c` | ค่า HbA1c ล่าสุด (ถ้ามี) |
| O | `hospitalName` | โรงพยาบาล |
| P | `houseNumber` | บ้านเลขที่ |
| Q | `villageNumber` | หมู่ที่/ชุมชน |
| R | `villageName` | หมู่บ้าน |
| S | `soi` | ซอย |
| T | `road` | ถนน |
| U | `province` | จังหวัด |
| V | `district` | อำเภอ |
| W | `subdistrict` | ตำบล |
| X | `postalCode` | รหัสไปรษณีย์ |
| Y | `emergencyContactName` | ชื่อผู้ติดต่อ(ญาติ) |
| Z | `emergencyContactPhone` | เบอร์โทร |
| AA | `emergencyContactRelationship` | ความสัมพันธ์ |
| AB | `osmCaregiverName` | ชื่อผู้ดูแล (อสม.) |

`L2` มีข้อความ `กลุ่มเสี่ยง หรือ เบาหวาน (ไม่ต้องมี Type)` ส่วน cell อื่นในแถว 2
เป็น continuation ของ presentation หรือว่างตาม semantics ของ header สองแถว

Template ใช้ vertical merge ตาม operational presentation ที่ A1:A2 ถึง K1:K2
และ M1:M2 ถึง AB1:AB2 โดยไม่ merge `L1:L2` เพราะ L2 เป็นคำแนะนำค่า accepted

การ merge เป็น presentation เท่านั้น ไม่ใช่ semantic authority ของ parser ผู้ใช้จึง
สามารถ unmerge โดยยังคง header text/order/meaning เดิมได้

## Source of truth and generation

คำจำกัดความเดียวของ version, worksheet, columns, secondary header, merge layout,
data range และ formatting metadata อยู่ที่:

`src/modules/patient-provisioning/import/patient-import-template-contract.ts`

ตัวสร้าง workbook อยู่ที่:

`src/modules/patient-provisioning/import/patient-import-template.ts`

และสร้างไฟล์ release artifact ด้วย:

```text
npm run generate:patient-import-template
```

คำสั่งนี้สร้าง `public/templates/demi-patient-import-template-v1.xlsx` จาก source
code contract โดยตรง ไม่อ่านหรือคัดลอกจาก workbook อ้างอิงที่มีข้อมูลจริง

Parser canonical path ใช้ contract เดียวกันเพื่อ validate primary header, secondary
header, column count/order/meaning และสร้าง field binding โดยตำแหน่ง canonical ดังนั้น
H คือ Patient phone และ Z คือ emergency contact phone อย่างชัดเจน

## Parser boundary and merged-header fix

Production preview/confirm เรียก adapter ด้วย `mode: "CANONICAL"` ซึ่งรับเฉพาะ
canonical two-row structure ภายใน bounded header scan และคืนข้อความเดียวเมื่อ
โครงสร้างไม่ตรง template:

`รูปแบบไฟล์ไม่ตรงกับ Template รายชื่อผู้ป่วยของระบบ กรุณาดาวน์โหลด Template ล่าสุดและกรอกข้อมูลใหม่`

อนุญาตเฉพาะการ normalize แบบ conservative ได้แก่ BOM, Unicode NFC, whitespace รอบ
นอก และ repeated whitespace ไม่ fuzzy-match, edit distance หรือยอมรับการเปลี่ยนชื่อ
semantic column

Root cause ของ bug เดิมคือ ExcelJS แสดง master cell text ซ้ำใน merged continuation
cell เมื่อ adapter สแกนแต่ละ header row แยกกัน ทำให้แถว 2 ดูเหมือนเป็น Patient
header อีกแถวหนึ่งและเกิด duplicate-header error

Adapter ใหม่ตรวจ `Cell.isMerged`, `Cell.master` และ public `fullAddress`: merge master
ใช้ข้อความของ master ส่วน continuation ที่ master อยู่คนละตำแหน่งจะถูกอ่านเป็นว่าง
จึงไม่ทำซ้ำข้อความในแถว 2 ทั้ง canonical และ compatibility scanner ขณะเดียวกัน
header rows ที่เป็น independent rows จริงยังถูกเก็บเป็น candidates และถูก reject
ตามเดิม

Legacy alias/layout infrastructure ยังคงอยู่สำหรับ historical compatibility และ
explicit `mode: "COMPATIBILITY"` ของ regression/integration fixtures เท่านั้น ไม่ใช่
production-facing normal path และไม่สามารถนิยาม Canonical Template v1 ใหม่ได้

## Formatting and validation

Template data rows เป็น blank rows เท่านั้น โดยไม่มี Patient example หรือ PII และใช้
format `Text` กับ National ID (B), HN (F), Patient phone (H), postal code (X) และ
emergency contact phone (Z) เพื่อป้องกัน scientific notation และการตัด leading zero
จาก Excel การ format นี้เป็น UX prevention; server parser ยังคง normalize และ validate
ค่าที่อ่านได้เอง

วันที่เกิดใช้ date-friendly format, ordinal เป็น integer และ measurement/DTX/HbA1c
เป็น numeric-friendly format โดยไม่มี clinical range validation

Column L มี dropdown validation เฉพาะ:

- `กลุ่มเสี่ยง` → `RISK`
- `เบาหวาน` → `DIABETES`

Server-side validation ยังคง authoritative และไม่รับ `กลุ่มเสี่ยงเบาหวาน`, `Type 1`,
`Type 2`, `อื่นๆ` หรือ `UNKNOWN`

## Template input versus persistence

การมี field ใน template ไม่ได้อนุญาตให้ persist field นั้นโดยอัตโนมัติ Current
persistence ยังคงเหมือนเดิม:

- Patient core: National ID, given name, family name, HN
- Initial Baseline: weight, height, waist, DTX และ HbA1c
- Patient classification: `RISK` / `DIABETES`
- OSM assignment: กฎ Phase 16D.4 เดิม รวม exact target-Hospital resolution และ
  OWNER-only assignment mutation

ยังไม่ persist DOB, gender, phone, address และ emergency contact จาก template เพียง
เพราะมีคอลัมน์เหล่านี้อยู่ และ `โรงพยาบาล` ใน column O ไม่สามารถเปลี่ยน target
Hospital ที่ server เลือกไว้ได้

`IMP-REQ-03` Hospital / รพ.สต. hierarchy และ `P16C-PROFILE-01` profile/contact/address
persistence ownership ยังคง OPEN ห้ามปิดจากการเพิ่ม template นี้

## Privacy and verification

ห้าม commit workbook อ้างอิงที่มีข้อมูลจริง ห้ามคัดลอก Patient rows, National IDs,
ชื่อ, เบอร์โทร, ที่อยู่ หรือ caregiver names เข้า repository ตัว artifact ที่ commit
ได้ต้องมีเฉพาะ headers, formatting, blank data rows, validation และไม่มี PII

Regression coverage ครอบคลุม:

- generated blank template validation และ semantic equivalence กับ committed artifact
- generated template เติม synthetic row แล้ว parse ผ่าน public canonical adapter
- merged และ unmerged canonical header
- bounded title row, wrong order, missing/renamed/extra column
- accepted classification vocabulary และ H/Z field disambiguation
- independent duplicate Patient header rows
- blank template sheet กับ populated canonical sheet, multiple populated sheets
- 500-row, 5 MiB และ 64-column limits
- generator/parser contract, critical text formats, dropdown และ blank data area
- UI download action และ server action canonical mode

ตรวจสอบด้วย generator, Prisma validation/generate, lint, typecheck, unit tests และ
integration tests ตาม scripts ของ repository โดยไม่มี schema หรือ migration change

## Phase 16D.5 handoff

Phase 16D.5 ยังไม่เริ่ม งานนี้ยังไม่ extract `PatientRosterImportService`, ไม่ขยาย
persistence, ไม่ทำ Hospital hierarchy/profile ownership และไม่เปลี่ยน OSM authority
หรือ fuzzy matching ต้อง re-audit contract, parser, persistence gates และ regression
ทั้งหมดก่อนจึงพิจารณาเริ่ม phase ถัดไป
