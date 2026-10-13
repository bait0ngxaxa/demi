# DEMI Phase 16F — Strict Per-Hospital Patient Import Template v2

- **สถานะ:** IMPLEMENTED — decision record + implementation handoff
- **วันที่:** 2026-10-13 (Asia/Bangkok)
- **Supersedes (เฉพาะประเด็นที่ระบุในหัวข้อ 3):** [Phase 16B.1](./PHASE_16B1_PATIENT_IMPORT_REQUIREMENT_DECISION_CLOSEOUT.md) `IMP-REQ-04` และการอ่านค่า `IMP-REQ-01/02` ว่าเป็น "assertion ที่ import ใช้แก้ข้อมูลเดิม", [Phase 16D.3](./PHASE_16D3_PATIENT_CLASSIFICATION_PERSISTENCE_HISTORY_RECONCILIATION.md) ส่วน roster reconciliation, [Phase 16D.4](./PHASE_16D4_OSM_ROSTER_RESOLUTION_RECONCILIATION_ASSIGNMENT.md) ทั้งฉบับ, [Phase 16D.4A](./PHASE_16D4A_CANONICAL_PATIENT_IMPORT_TEMPLATE.md) (template v1) และ compatibility/alias layer ของ [Phase 16B.0](./PHASE_16B0_PATIENT_IMPORT_ADAPTER_V2_COMPATIBILITY_FOUNDATION.md)
- **ไม่เปลี่ยน:** pipeline ของ [Phase 16D.5](./PHASE_16D5_FULL_ROSTER_IMPORT_ORCHESTRATION_HARDENING.md)/[16E.1](./PHASE_16E1_XLSX_PARSER_RESOURCE_BOUNDARY_REMEDIATION.md) (ดูหัวข้อ 4), `IMP-REQ-03` (ยัง **OPEN**), schema/migration

เอกสารนี้บันทึกการออกแบบ "สัญญา" (contract) ของ Patient import ใหม่ ประวัติเดิมใน
phase เอกสารก่อนหน้าไม่ถูกเขียนทับ — แต่ละฉบับมี banner ชี้มาที่เอกสารนี้ และคำสั่งใน
เอกสารเก่าที่ขัดกับหัวข้อ 2 ให้ถือว่าถูกแทนที่

## 1. ทำไมต้องเปลี่ยน

Pipeline ของ import ถูกต้องอยู่แล้ว แต่ **contract layer** พยายามรับ spreadsheet ได้ทุกรูปแบบ
(alias, layout เดิม) และพยายามเป็น "UI ตัวที่สอง" (ตรวจชื่อโรงพยาบาล, กำหนด อสม.,
เปลี่ยนสถานะผู้ป่วย, เติมข้อมูลตั้งต้นย้อนหลัง) ผลคือ

- คอลัมน์ `โรงพยาบาล` (ข้อความอิสระ) ถูกเทียบกับ `Hospital.name` ด้วยการตัด `.` และ `-`
  เท่านั้น "รพ.กระนวน", "รพกระนวน", "โรงพยาบาล กระนวน" จึงกลายเป็น `HOSPITAL_MISMATCH`
  สำหรับ "โรงพยาบาลกระนวน" และบล็อกแถวที่ถูกต้อง
- Template เป็นไฟล์ static เดียวสำหรับทุกโรงพยาบาล ผู้ใช้ที่มีหลาย membership เลือก
  โรงพยาบาลปลายทางเอง คอลัมน์ข้อความจึงเป็น guard เดียวที่กันการอัปโหลดไฟล์ของ B เข้า A
- `osmCaregiverName` จับคู่ด้วยชื่อ เมื่อมีการ reassign ใน app ภายหลัง แถวเก่าจะกลายเป็น
  `OSM_ASSIGNMENT_CONFLICT` → `NEEDS_REVIEW` เมื่อ import ซ้ำ
- แถวของผู้ป่วยเดิมยังเปลี่ยนข้อมูลได้ผ่าน import (classification change, baseline backfill)

## 2. การตัดสินใจ (final)

1. **Greenfield.** ระบบยังไม่ใช้งานจริง ไม่มีไฟล์ v1 หรือไฟล์ roster ของลูกค้า จึงตัด legacy
   และ heuristic path ทั้งหมด ไม่มี backward compatibility
2. **หนึ่ง template ต่อหนึ่งโรงพยาบาล หนึ่งไฟล์ต่อหนึ่งโรงพยาบาล.** ตัวตนโรงพยาบาลมาจาก
   server context + metadata ที่ฝังใน template เท่านั้น โดยใช้ `Hospital.hospitalCode`
   (unique ใน schema อยู่แล้ว) ไม่ใช้รหัส MOPH H-Code
3. **Import สร้างเฉพาะผู้ป่วยใหม่.** ผู้ป่วยที่มี relationship กับโรงพยาบาลปลายทางอยู่แล้ว
   ถูกตรวจ *identity เท่านั้น* → `ALREADY_EXISTS` (ตรง) หรือ `CONFLICT` (ชื่อ/HN ไม่ตรง,
   บัญชีใช้ไม่ได้, ไม่มี role ผู้ป่วย) Import ไม่เปลี่ยน classification, baseline, HN, อสม.
   หรือข้อมูลอื่นของผู้ป่วยเดิม ค่าในไฟล์ของแถวเหล่านี้ถูกเพิกเฉย (ไม่ตรวจ ไม่ต้องมีวันที่
   ข้อมูลตั้งต้นสำหรับแถวเหล่านี้)
4. **Re-import แบบต่อท้าย.** import 100 → เพิ่ม 30 ในไฟล์เดิม → import 130 = 30 รายการ
   `IMPORTED`, 100 รายการ `ALREADY_EXISTS`
5. **OSM ไม่อยู่ใน import.** กำหนด อสม. ใน app เท่านั้น: รายคน (เดิม) และหลายคน (ใหม่)

## 3. สิ่งที่ถูกแทนที่อย่างชัดเจน

| เอกสารเดิม | ข้อความเดิม | สถานะหลัง Phase 16F |
| --- | --- | --- |
| 16B.1 `IMP-REQ-04` | คอลัมน์ OSM/โค้ชคือ actual Patient–OSM assignment ที่ import ต้อง resolve/reconcile | **SUPERSEDED** — requirement ที่ลูกค้ายืนยัน (ใครคือผู้ดูแล) ยังจริง แต่ช่องทางคือ app (รายคน + bulk) ไม่ใช่ import |
| 16B.1 `IMP-REQ-01/02` | ค่าคลินิกและ label ของ roster เป็น assertion | ยังจริงสำหรับผู้ป่วย **ใหม่**; สำหรับผู้ป่วยเดิมไม่ถูกนำไปใช้ |
| 16B.1 `IMP-REQ-05` | วันที่ข้อมูลตั้งต้นร่วมต่อ batch | คงเดิม แต่บังคับเฉพาะเมื่อมีผู้ป่วยใหม่ที่มีค่า baseline |
| 16B.1 `IMP-REQ-03` | ลำดับชั้น Hospital / รพ.สต. | **OPEN ต่อไป** — ไม่ใช่ขอบเขตงานนี้ (ไฟล์เดียวหนึ่งโรงพยาบาล) |
| 16D.3 | classification reconcile ผ่าน roster (`classificationReconciliationChoices`, `CLASSIFICATION_CHANGE_REQUIRES_CONFIRMATION`) | **REMOVED** จาก import; classification ของผู้ป่วยเดิมเปลี่ยนได้ใน app เท่านั้น. import ตั้งค่าได้เฉพาะเมื่อ profile ของผู้ป่วยยัง *ไม่มี* classification |
| 16D.4 | OSM roster resolution/reconciliation/assignment ทั้งหมด (`OSM_*`, `osmAssignmentChoices`, bindings, resolver) | **REMOVED** |
| 16D.4A | template v1 (28 คอลัมน์ A:AB, ไฟล์ static `public/templates/…v1.xlsx`) | **REPLACED** ด้วย template v2 ที่สร้างตามโรงพยาบาล |
| 16B.0 | layouts `OPERATIONAL_ROSTER`/`EXTENDED_ROSTER`/`COMBINED_NAME_REVIEW`, header aliases, compatibility mode | **REMOVED** |
| 16D.2 | existing-patient baseline backfill / `BASELINE_ALREADY_EXISTS` / `BASELINE_CONFLICT` | **REMOVED** สำหรับ import |
| (ทุกฉบับ) | `HOSPITAL_MISMATCH` / การเทียบชื่อโรงพยาบาลจากไฟล์ | **REMOVED** — แทนที่ด้วย `hospitalCode` ใน metadata |

## 4. สิ่งที่คงไว้โดยตั้งใจ (pipeline)

- Preview แบบ stateless ผูกด้วย HMAC ของ (actor, โรงพยาบาลปลายทาง, SHA-256 ของไฟล์,
  contract version, effective date) — `transport/patient-import-file-binding.ts`
- ตอน confirm ส่งไฟล์ซ้ำ server parse + validate ใหม่ทั้งหมด ไม่เชื่อ preview ของ client
- commit ทีละแถว (Serializable transaction ต่อแถว) และ idempotent ด้วยเลขบัตรประชาชน
  ภายใน transaction ของแถวมีการตรวจอีกครั้งว่า relationship ไม่ได้ถูกสร้างหลัง preview; ถ้าถูกสร้างแล้วจะ
  ตรวจ identity (เหมือนแถวเดิมใน preview) และไม่เขียนอะไร
- ไม่มี background job, staging/batch table, migration; `PATIENT_IMPORT_CONTRACT_VERSION`
  ถูกเปลี่ยนเป็น `patient-import-v2-hospital-template` เพื่อให้ binding เดิม confirm ไม่ได้
- ข้อจำกัดไฟล์: 5 MB, 500 แถว, resource preflight ของ XLSX (16E.1) ไม่เปลี่ยน

## 5. Template v2

### โครงสร้าง

- ดาวน์โหลดผ่าน `GET /api/v1/hospital/patient-import/template?hospitalId=<id>` สร้างตามคำขอ
  ตามสิทธิ์เดียวกับ import (`validateRosterImportTarget` + ตรวจ membership จริงใน DB) ถ้า
  โรงพยาบาลอยู่นอกขอบเขต → 403 และไม่มี workbook
- ชื่อไฟล์ `DEMI_patient_import_<hospitalCode>_v2.xlsx`
- Sheet ข้อมูล `รายชื่อผู้ป่วย`: คอลัมน์ v1 ลบ `โรงพยาบาล` (เดิม O) และ `ชื่อผู้ดูแล (อสม.)`
  (เดิม AB) เหลือ 26 คอลัมน์ A:Z คงรูปแบบข้อมูล, list validation ของสถานะ, ความจุ 500 แถว,
  freeze header และ header 2 แถว (แถว 1-2) / ข้อมูลเริ่มแถว 3
- แสดงชื่อ/รหัสโรงพยาบาลให้คนอ่านแบบ read-only **โดยไม่แตะ contract ของ header row**:
  (ก) sheet `ข้อมูลโรงพยาบาล` (visible, protected) ซึ่งตัวอ่านไม่เคยสแกน และ (ข) header ของการพิมพ์
  (`oddHeader`) ของ sheet ข้อมูล — เลือกวิธีนี้เพราะ cell ข้างตารางหรือแถวเหนือ header จะเปลี่ยน
  `actualColumnCount`/ตำแหน่ง header ที่ parser ตรวจแบบ exact
- sheet `_demi_meta` (`veryHidden` + protected): `templateVersion = patient-import-template-v2`,
  `hospitalCode = <Hospital.hospitalCode>`

### Parser (strict)

ปฏิเสธทั้งไฟล์ ไม่เขียนแถวใดเลย เมื่อ: ไม่มี metadata sheet, version ไม่ใช่ v2, `hospitalCode`
ไม่ตรงกับโรงพยาบาลที่เลือก (ข้อความระบุเฉพาะโรงพยาบาลที่เลือก ไม่เปิดเผยโรงพยาบาลอื่น),
หรือ header ไม่ตรง exact (ลำดับและข้อความ, แถวที่ 2 ตามที่กำหนด, ไม่มีคอลัมน์เกิน) หา sheet ข้อมูลด้วยชื่อ
`รายชื่อผู้ป่วย` เท่านั้น จึงไม่มีทางเลือก metadata sheet เป็นข้อมูลผู้ป่วย

### Failed-rows export

`POST /api/v1/hospital/patient-import/failed-rows` ส่งไฟล์เดิม + binding เดิม (stateless, ไม่เก็บไฟล์)
Server ตรวจสิทธิ์/binding, parse ใหม่, preview ใหม่ แล้วสร้าง workbook v2 เดียวกัน (metadata เดียวกัน)
เฉพาะแถว `INVALID`, `CONFLICT`, `DUPLICATE_IN_FILE` และแถวที่ client รายงานว่า `FAILED` ตอน commit
(ต้องยังเป็น `READY` ตอนตรวจใหม่) พร้อมค่าเดิมและคอลัมน์ท้าย `เหตุผล` ไม่ส่งออก `ALREADY_EXISTS`
parser ยอมรับคอลัมน์ท้าย `เหตุผล` ได้ **หนึ่งคอลัมน์** และไม่นำไปใช้; คอลัมน์อื่นเพิ่มเติม = header mismatch

## 6. Bulk OSM assignment

- หน้า `/app/patients/assign-osm?hospitalId=…` (OWNER ของโรงพยาบาลนั้นเท่านั้น) เชื่อมจากรายชื่อผู้ป่วยและหน้าผลการนำเข้า
  แสดงผู้ป่วยที่ **ยังไม่มี อสม. ปัจจุบัน** (สูงสุด 500) เลือกหลายคน เลือก อสม. หนึ่งคนจาก อสม. ที่ eligible ของโรงพยาบาล แล้วมีขั้นยืนยัน
- Server action `bulkAssignOsmToPatientsAction` → `assignOsmToPatients` → `assignOsmToPatientsInTransaction`
  นโยบายเดียวกับ `assignOsmToPatient` (OWNER-only), ทุกผู้ป่วยผ่าน `assignOsmToPatientInTransaction` (ตรวจ policy/DB ซ้ำรายคน), all-or-nothing ใน
  Serializable transaction เดียว, ไม่เกิน 500, audit ต่อการมอบหมายหนึ่งรายการ (`patient.osm_assigned`) + marker ของ batch
- ผู้ป่วยที่มี อสม. อยู่แล้วถูกปฏิเสธทั้ง batch (ไม่ reassign เงียบๆ; reassign ยังเป็นรายคน)
- Double submit: `submissionNonce` ถูกบันทึกเป็น audit marker (`PatientOsmBulkAssignment`) ใน transaction เดียวกัน ส่งซ้ำ
  ได้ผล `REPLAYED` ไม่มอบหมายซ้ำ — เลือกวิธีนี้แทนตาราง nonce เพราะห้ามทำ migration; partial unique index
  ของ active assignment เป็นเกราะชั้นที่สองของ DB

## 7. ผลต่อ test และ docs อื่น

- test ของพฤติกรรมที่ลบถูกลบหรือเขียนใหม่ (ไม่มี skipped test)
- `docs/CONTEXT.md` มี pointer ถึงเอกสารนี้
- ADR 0004 (patient provisioning) ไม่เปลี่ยน — single-patient provisioning ไม่ถูกแตะ

## 8. Open questions

1. Template ผูกกับ `hospitalCode` ที่ฝังในไฟล์ ไม่มีลายเซ็น (HMAC) ของ metadata การแก้ไฟล์ด้วยเครื่องมือ zip ทำได้แต่ได้ผลเฉพาะ
   โรงพยาบาลที่ผู้ใช้มีสิทธิ์อยู่แล้ว (สิทธิ์ตัดสินที่ server) — ต้องการลายเซ็นหรือไม่
2. ผู้ป่วยที่รู้จักในโรงพยาบาลอื่น (profile มี classification แล้ว) ที่ถูก import เข้าโรงพยาบาลใหม่ จะ **ไม่** ถูกเปลี่ยน classification
   (ตามข้อ 3) preview แสดงข้อความ "ผู้ป่วยมีสถานะอยู่แล้ว" — ยืนยันว่าพฤติกรรมนี้ตรงความต้องการ
3. Bulk assignment ใช้ `assignOsmToPatientInTransaction` ตรงๆ (ถูกเรียกต่อผู้ป่วยซ้ำพร้อม query ตรวจสิทธิ์) ที่ 500 รายการ transaction
   ถูกขยาย timeout เป็น 60 วินาที; ถ้า latency ของ DB สูงมากอาจต้องปรับ batch size หรือรวมการตรวจที่ซ้ำกัน
