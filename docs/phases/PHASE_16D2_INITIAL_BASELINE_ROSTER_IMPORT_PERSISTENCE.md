# DEMI Phase 16D.2 — Initial Baseline Roster Import Persistence

**สถานะ:** Implemented

**Starting HEAD:** `519b2498ccbc80eacc86d08c1e8d0a2544883fb5`

## 1. Scope and outcome

Phase 16D.2 เปลี่ยน logical patient roster import จากการบันทึกเฉพาะ Patient core
เป็นการบันทึก Patient core และ initial PatientBaseline ที่ได้รับอนุมัติแล้วใน
workflow เดียวกัน โดยยังคงขอบเขต Hospital ที่ server เป็นผู้เลือกและยังไม่เพิ่ม
การ persist สำหรับ classification, OSM, profile, address หรือข้อมูล deferred อื่น

แต่ละแถวที่มีข้อมูล Baseline จะใช้หนึ่ง caller-owned PostgreSQL Serializable
transaction ซึ่งครอบคลุมการ provision/reuse Patient core, Baseline reconciliation
และ audit ที่เกี่ยวข้อง แถวอื่นจึงไม่ถูก rollback จากความขัดแย้งของแถวหนึ่ง

## 2. Decisions ที่ยืนยันหลัง Phase 16C

ข้อสรุปเหล่านี้เป็น customer confirmation ใหม่หลัง Phase 16C ไม่ใช่การแก้ไข
ประวัติข้อสรุปเดิม:

- `IMP-REQ-05 = CONFIRMED` สำหรับ operational roster: หนึ่งไฟล์ใช้
  `PatientBaseline.recordedOn` เดียวกันทั้ง batch
- `น้ำหนัก` = kg, `ส่วนสูง` = cm, `รอบเอว` = cm
- `ค่าน้ำตาลในเลือด` ของ operational roster = DTX, mg/dL
- `ค่า HbA1c ล่าสุด (ถ้ามี)` = HbA1c, percent (%)
- vocabulary classification `กลุ่มเสี่ยง` และ `เบาหวาน` ยืนยันแล้ว แต่ lifecycle,
  authority, correction, history และ reporting semantics ยังไม่ยืนยัน จึงยังไม่
  persist ใน phase นี้

## 3. Schema and migration

`PatientBaseline` เพิ่ม nullable typed columns โดยใช้ `Float` ตาม representation
ของ measurement เดิม:

```text
heightCm Float?
hba1c    Float?
```

Migration ที่เพิ่มมีเพียง:

```text
prisma/migrations/20260827032352_add_patient_baseline_height_hba1c/migration.sql
```

Migration เพิ่ม nullable PostgreSQL `DOUBLE PRECISION` columns เท่านั้น ไม่มี
classification model/enum, ImportBatch, hierarchy, JSON/EAV หรือ backfill และไม่
แก้ migration เก่า

## 4. Canonical import contract and mapping

เพิ่ม contract version ฝั่ง server:
`phase-16d2-baseline-v1` เพื่อผูก semantics ของ preview/confirm

| Operational source | Canonical field | Persisted Baseline field | Unit |
| --- | --- | --- | --- |
| `น้ำหนัก` และ aliases ที่รองรับ | `weight` | `weight` | kg |
| `ส่วนสูง`, `ส่วนสูง(cm)` และ aliases ที่รองรับ | `height` + `heightUnit: cm` | `heightCm` | cm |
| `รอบเอว` และ aliases ที่รองรับ | `waistCircumference` | `waistCircumference` | cm |
| `ค่าน้ำตาลในเลือด` | `bloodSugarDtx` | `bloodSugarDtx` | DTX mg/dL |
| `ค่า HbA1c ล่าสุด (ถ้ามี)`, `HbA1c` และ aliases ที่รองรับ | `hba1c` | `hba1c` | % |

ฟิลด์ canonical `bloodSugar` เดิมยังคงแยกไว้สำหรับ generic/deferred source
semantics; generic `blood sugar` และ `blood glucose` ไม่ถูกตีความเป็น DTX โดยอัตโนมัติ
เฉพาะ exact operational alias `ค่าน้ำตาลในเลือด` เท่านั้นที่เข้า `bloodSugarDtx`.
Unknown เช่น `Height (m)` ไม่ถูกแปลงหรือเดาหน่วย ส่วน known meter layout เดิมถูก
รายงานว่า unsupported และไม่ถูก persist โดยไม่มีการแปลงที่ได้รับอนุมัติ

Blank และ placeholder ที่ parser อนุมัติยังเป็น `null`/ไม่มี assertion ไม่ใช่ zero
ส่วนค่าที่ malformed, non-finite หรือไม่อยู่ใน structural validation จะเป็น
`BASELINE_DATA_INVALID` โดยไม่มี medical threshold เพิ่มเติม

## 5. Batch effective-date contract

Import UI เพิ่ม date-only input:
`ข้อมูลตั้งต้น ณ วันที่ (ใช้กับข้อมูลตั้งต้นทุกแถวในไฟล์)`

ค่าที่ส่ง server เป็น `YYYY-MM-DD` และ validate ด้วย Baseline date-only schema
โดยไม่ timezone-shift และไม่ใช้ upload time, server time, workbook modified time,
ชื่อไฟล์, row order หรือ inferred visit date เป็น `recordedOn`.

ถ้าแถวใดมี approved Baseline measurement อย่างน้อยหนึ่งค่า วันที่ต้องมีอยู่ก่อน
confirm ถ้าไม่มี approved Baseline values ทั้งไฟล์ core-only import ยังทำงานได้และ
จะไม่สร้าง empty Baseline row

## 6. Preview/confirm binding

HMAC preview binding ผูก context ต่อไปนี้:

```text
file fingerprint + actor user ID + target Hospital ID
+ effective date + import contract version
```

Preview parse/normalize exact uploaded file ก่อนสร้าง binding. Confirm validate
date, contract version, actor และ target Hospital, ตรวจ binding และ fingerprint
แล้วจึง reparse/re-normalize ไฟล์เดิมและเรียก import service ใหม่เพื่อ re-evaluate
DB state. การเปลี่ยนวันที่หลัง preview จึงใช้ binding เดิมยืนยันไม่ได้และต้อง
preview ใหม่

## 7. Baseline reconciliation

การ create ยังคง reuse `createPatientBaselineInTransaction(...)` และ policy เดิม
`patient:baseline:create`; ไม่มี parallel importer writer และไม่มี nested
`$transaction()`.

สำหรับแถวที่มี approved values:

1. ไม่พบ Baseline: สร้างหนึ่ง row ด้วย shared `recordedOn` และเฉพาะค่าที่ source มี
2. พบ Baseline และค่าที่ source-present รวมวันที่ตรงกัน: `BASELINE_ALREADY_EXISTS`
   / NOOP ไม่สร้างและไม่ update
3. พบ Baseline แต่ source-present value หรือวันที่ต่างกัน: `BASELINE_CONFLICT`
   / conflict ไม่ overwrite และไม่ partial update

การเปรียบเทียบใช้เฉพาะ import-authoritative fields ที่ source มีค่าจริง:
`recordedOn`, `weight`, `heightCm`, `waistCircumference`, `bloodSugarDtx` และ
`hba1c`. ใช้ exact numeric equality ตาม `Float`/JavaScript number ที่ persist
จริง ไม่มี tolerance หรือ string formatting. Source blank คือ no assertion จึงไม่
clear และไม่ conflict กับค่าที่มีอยู่เดิม. ฟิลด์ Baseline อื่น เช่น BP, summary และ
adaptation ไม่เข้าร่วม comparison.

## 8. Row transaction architecture

`importPatientRosterRow(...)` เป็น narrow row orchestrator และทำงานตามรูปแบบ:

```text
runSerializableTransaction(database, tx => {
  provisionPatientInTransaction(tx, actor, input, "BULK")
  reload current Baseline using tx
  create/reconcile approved Baseline using tx
  provisioning + Baseline audits use tx
})
```

การ parse Excel, bounded normalization และ preview อยู่นอก transaction. Workbook
ไม่ถูกครอบด้วย transaction เดียว และยังคง limits เดิม 5 MB, 500 patient rows,
bounded columns/worksheet inspection, deterministic sheet selection, duplicate
phone handling, National ID safety, HN leading-zero behavior และ PII masking.

หาก Baseline create/conflict/failure เกิดหลังการ provision ผู้ป่วยใหม่ transaction
เดียวกันจะ rollback Person, User, PATIENT role, PatientProfile,
PatientHospitalRelationship และ provisioning/Baseline audit ของแถวนั้นทั้งหมด.
Patient ที่มีอยู่แล้วจะไม่ถูกลบหรือแก้ไขเมื่อ Baseline conflict. Serializable retry
ยังคง retry เฉพาะ transient uniqueness/serialization conflicts และ exhaustion ถูก
map เป็น bounded row conflict/error semantics.

## 9. Audit and privacy

Baseline audit ใช้ `patient_baseline.created` เดิม และ roster create ระบุ bounded
`source: ROSTER_IMPORT` พร้อม opaque IDs ที่มีอยู่ใน audit convention. ไม่ใส่
น้ำหนัก ส่วนสูง รอบเอว DTX HbA1c, raw Excel row, raw National ID หรือ workbook
payload ใน generic audit metadata. Provisioning audit และ Baseline audit commit หรือ
rollback ไปพร้อมกันกับ row transaction.

## 10. Read projection and UI

Baseline query projection/select เพิ่ม `heightCm` และ `hba1c`. Baseline view แสดง
`ส่วนสูง (cm)`, `HbA1c (%)` และใช้หน่วย `DTX / mg/dL`; manual Baseline form รองรับ
สอง optional fields ด้วยการเปลี่ยนแปลงเล็กน้อย ไม่ได้ทำ broad redesign.

Roster import UI เพิ่ม shared date input, preview Baseline status/detail,
unit-explicit import explanation และ summary counters สำหรับ created/already
exists/conflict. Existing responsive layout, tokens และ primary row-status model
ยังคงเดิม. Date/file/Hospital/contract change invalidates local preview state.

## 11. Tests and verification

เพิ่ม synthetic tests ครอบคลุม:

- exact operational mapping, numeric/string/blank/dash/malformed values และ
  unsupported/unknown height units;
- valid/invalid/required/non-fabricated effective date และ HMAC binding ที่รวม
  effective date/contract version;
- new/partial/no Baseline, existing same subset, differing each approved field,
  different date, blank height no assertion และ immutable partial-update conflict;
- re-import ที่ existing BP/summary แต่ source ไม่ส่ง fields เหล่านั้นต้อง NOOP;
- successful row commit, intentional Baseline failure rollback และ independent
  rows; concurrent confirmation ไม่สร้าง Baseline หรือ relationship ซ้ำ;
- existing adapter, transport, provisioning และ Baseline regression behavior.

ผล verification ที่ทำกับ local PostgreSQL integration database:

```text
npm run lint                    PASS
npm run typecheck               PASS
npm test                        PASS — 126 files, 843 tests
npm run test:integration        PASS — 21 files, 178 tests
Phase 16D.2 integration         PASS — 16 tests
existing provisioning integ.    PASS — 15 tests
Prisma generate                 PASS
Prisma migrate deploy/status    PASS — 23 migrations, no pending migrations
```

ทุก test ใช้ข้อมูลสังเคราะห์ ไม่มี real workbook หรือ patient PII ใน repository.

## 12. Remaining gates

- `IMP-REQ-05`: **CONFIRMED/CLOSED สำหรับ roster Baseline**
- น้ำหนัก kg, ส่วนสูง cm, รอบเอว cm, DTX mg/dL และ HbA1c %: **CONFIRMED**
- classification vocabulary `กลุ่มเสี่ยง` / `เบาหวาน`: **CONFIRMED** แต่ lifecycle,
  authority, correction, history และ report/filter semantics ยังเป็น gate ของ
  Phase 16D.3; ไม่มี table/enum/row persistence ใน phase นี้
- `IMP-REQ-03` Hospital/รพ.สต. hierarchy: **OPEN**
- `P16C-OSM-01`: OWNER vs MEMBER assignment semantics ยัง unresolved; safe
  OWNER-only default เดิมไม่เปลี่ยน และ roster ไม่ resolve/assign OSM
- `P16C-PROFILE-01`: profile/contact/address ownership ยัง unresolved; DOB, gender,
  phone, address, emergency contact, PID/external ID, BMI, BP text, pulse,
  riskFactorText และ longitudinal observations ยัง deferred

## 13. Exact Phase 16D.3 handoff

ก่อนเริ่ม Phase 16D.3 ให้ customer ยืนยัน classification lifecycle, edit/correction
authority, history/versioning และ report/filter semantics สำหรับ `กลุ่มเสี่ยง` และ
`เบาหวาน` ให้ครบ แล้วออกแบบ canonical classification domain/persistence แยกจาก
Baseline. Phase 16D.3 ควร reuse row import/binding/transaction seams ที่มีอยู่ โดย
เพิ่มเฉพาะ behavior ที่ได้รับอนุมัติ และต้องไม่ขยายเป็น OSM assignment, Hospital
hierarchy หรือ profile/address persistence.
