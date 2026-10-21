# DEMI — Patient Import v3: Complete Initial Health Data

- **สถานะ:** IMPLEMENTED
- **วันที่:** 2026-10-21 (Asia/Bangkok)
- **Supersedes (เฉพาะประเด็นเวอร์ชัน template และคอลัมน์):** template `patient-import-template-v2` ใน
  [Phase 16F](./PHASE_16F_PATIENT_IMPORT_STRICT_TEMPLATE_V2_DECISION.md) และ 26-field mapping ใน
  [Profile persistence handoff](./PATIENT_IMPORT_PROFILE_PERSISTENCE_HANDOFF.md)
- **ไม่เปลี่ยน:** pipeline stateless preview + HMAC binding + re-validate + per-row Serializable
  transaction, การยืนยันตัวตน/relationship, create-only semantics, สิทธิ์ OWNER-only
  ([ADR-0019](../adr/0019-owner-administration-and-import-only-roster.md)), schema/migration

ลูกค้ายืนยันว่า 13 รายการในหน้า Health Information ของ Canva คือ "โครงสร้างข้อมูลที่ผู้ป่วยต้องมี"
ไม่ใช่ 13 หน้าที่ของ import การนำเข้าจึงขยายเฉพาะข้อมูลตั้งต้นที่ยังขาด (ประวัติโรคและประวัติ
ครอบครัว) เพื่อให้ OWNER อัปโหลด Excel ไฟล์เดียว ตรวจ preview แล้วยืนยันครั้งเดียว โดยไม่ต้องเปิด
โปรไฟล์ผู้ป่วยทีละรายเพื่อกรอกข้อมูลที่มีในไฟล์อยู่แล้ว

## 1. Template v2 → v3

| รายการ | v2 | v3 |
| --- | --- | --- |
| `templateVersion` (`_demi_meta!B1`) | `patient-import-template-v2` | `patient-import-template-v3` |
| `PATIENT_IMPORT_CONTRACT_VERSION` (HMAC binding) | `patient-import-v2-hospital-template` | `patient-import-v3-initial-health-data` |
| คอลัมน์ | A–Z (26) | A–Z เหมือนเดิมทุกคอลัมน์ + AA–AG (33) |
| คอลัมน์ "เหตุผล" ของไฟล์แถวที่ไม่ผ่าน | AA | AH |
| ชื่อไฟล์ | `DEMI_<รพ.>_patient_import_v2.xlsx` | `DEMI_<รพ.>_patient_import_v3.xlsx` |
| ชีต "ข้อมูลโรงพยาบาล" | 4 แถว | +1 แถวอธิบายค่า มี/ไม่มี/ไม่ทราบ |

- เพิ่มคอลัมน์ต่อท้าย (ไม่แทรก) เพื่อให้ตำแหน่ง A–Z เดิมไม่เลื่อน — ผู้ใช้เลือกตัวเลือกนี้ในการคุยงาน
- ไฟล์ v2 (metadata v2 หรือ layout 26 คอลัมน์) ถูกปฏิเสธทั้งไฟล์ด้วยข้อความ "รูปแบบไฟล์ไม่ตรงกับ
  ไฟล์ตัวอย่าง…" ไม่มี alias หรือ fallback parsing
- preview ที่ bind ด้วย contract v2 ยืนยันเป็น v3 ไม่ได้ เพราะ `importContractVersion` อยู่ใน HMAC
  binding และ `normalizeImportOptions` ตรวจค่า literal
- คงเดิม: template แยกตามโรงพยาบาล, `hospitalCode` ใน `_demi_meta` (veryHidden + protected),
  strict header ทั้งสองแถว, ไม่เกิน 500 ผู้ป่วย, 5 MB, XLSX resource preflight (template v3 เปล่า
  มี 16,580 cell element จากเพดาน 65,536), failed-rows export, duplicate/conflict handling

## 2. คอลัมน์ใหม่และค่าที่รับ

| คอลัมน์ | หัวตาราง (แถว 1) | คำอธิบาย (แถว 2) | Field | ปลายทาง `PatientHospitalHealthHistory` |
| --- | --- | --- | --- | --- |
| AA | โรคประจำตัว: เบาหวาน | มี / ไม่มี / ไม่ทราบ (เว้นว่าง = ไม่ทราบ) | `historyDiabetes` | `diabetes` |
| AB | โรคประจำตัว: ความดันโลหิตสูง | 〃 | `historyHypertension` | `hypertension` |
| AC | โรคประจำตัวอื่น ๆ | ระบุชื่อโรค (ถ้ามี) | `otherConditions` | `otherConditions` (ข้อความ ≤ 1,000 ตัวอักษร, null ได้) |
| AD | ญาติสายตรง: ความดันโลหิตสูง | 〃 | `familyHypertension` | `familyHypertension` |
| AE | ญาติสายตรง: เบาหวาน | 〃 | `familyDiabetes` | `familyDiabetes` |
| AF | ญาติสายตรง: โรคหัวใจ | 〃 | `familyHeartDisease` | `familyHeartDisease` |
| AG | ญาติสายตรง: หลอดเลือดสมอง / อัมพาต | 〃 | `familyStroke` | `familyStroke` |

ทุกคอลัมน์คำตอบมี dropdown (Excel data validation แบบ list, `allowBlank`) และรูปแบบเซลล์เป็นข้อความ

### การแปลงค่า (strict)

| ค่าในเซลล์ (หลังตัดช่องว่าง/NFC) | Enum |
| --- | --- |
| `มี` | `YES` |
| `ไม่มี` | `NO` |
| `ไม่ทราบ` | `UNKNOWN` |
| ว่าง หรือ `-` | `UNKNOWN` (**ไม่ใช่** `NO`) |
| ค่าอื่นใด (`ใช่`, `YES`, `Y/N`, ตัวเลข, boolean, วันที่, สูตร, error) | `HEALTH_HISTORY_DATA_INVALID` → แถว INVALID |

- `โรคประจำตัวอื่น ๆ` ว่าง = `null`; ระบบไม่สร้างข้อความ "ไม่มีโรคอื่น" ให้เอง
- `diagnosisYear` ไม่มีคอลัมน์ใน template (อยู่นอก scope) → `null`
- ประวัติโรคไม่ถูกอนุมานจาก classification (`RISK`/`DIABETES`) และ classification ไม่ถูกอนุมานจาก
  ประวัติโรค ทั้งสองเก็บแยกกันตามที่ไฟล์ระบุ

## 3. ปลายทางของทุก field (แถวผู้ป่วยใหม่)

| กลุ่ม | คอลัมน์ | ปลายทาง |
| --- | --- | --- |
| ตัวตน | เลขบัตรประชาชน, ชื่อ, นามสกุล | `Person` (identity HMAC), `User` (PROVISIONED), `UserRole` PATIENT, `PatientProfile` |
| Relationship | HN | `PatientHospitalRelationship.hospitalNumber` |
| วันเกิด (อายุคำนวณ) | วันเกิด | `PatientProfile.dateOfBirth` (global; ไม่ทับค่าที่มีอยู่) |
| ข้อมูลโรงพยาบาล | เพศ, เบอร์โทร, ที่อยู่ (O–W), ผู้ติดต่อฉุกเฉิน (X–Z) | `PatientHospitalProfile` |
| ข้อมูลตั้งต้น | น้ำหนัก, ส่วนสูง, รอบเอว, DTX, HbA1c | `PatientBaseline` (`ROSTER_IMPORT`, วันที่จากตัวเลือก effective date); BMI คำนวณตามนโยบายเดิม ไม่ import |
| สถานะผู้ป่วย | ประเภทเบาหวาน | `PatientClassification` (+ history) เมื่อโปรไฟล์ยังไม่มี |
| ประวัติสุขภาพ | AA–AG | `PatientHospitalHealthHistory` (version 1) ของ relationship ที่สร้างในแถวนั้น |
| Metadata | ที่ | provenance เท่านั้น ไม่บันทึก |

`PatientHospitalHealthHistory` ถูกสร้าง **เฉพาะเมื่อมีข้อมูลที่มีความหมาย** (อย่างน้อยหนึ่งคำตอบไม่ใช่
`UNKNOWN` หรือมีโรคอื่น) ถ้าไม่มี ระบบไม่สร้างแถว และ read model เดิมแสดง
"โรงพยาบาลยังไม่ได้บันทึกประวัติสุขภาพ" ซึ่งมีความหมายเท่ากับ UNKNOWN ทุกข้อ

## 4. Transaction boundary

ต่อผู้ป่วยหนึ่งแถว `importPatientRosterRow` ใช้ `runSerializableTransaction` ครั้งเดียว ลำดับการเขียน:

1. `provisionPatientInTransaction` — Person/User/Role/PatientProfile/Relationship + audit `patient.provisioned`
2. `PatientProfile.dateOfBirth` (ถ้ายังไม่มี) และ `PatientHospitalProfile`
3. `createPatientBaselineInTransaction` + audit `patient_baseline.created`
4. `setPatientClassificationInTransaction` + history/audit
5. **ใหม่:** `createImportedPatientHealthHistoryInTransaction`
   (`src/modules/patient-hospital-profile/services/patient-health-history-service.ts`) + audit
   `patient.health_history.imported` (`source: ROSTER_IMPORT`, `toVersion: 1`)

ฟังก์ชันใหม่ไม่เปิด transaction ของตัวเอง (ต่างจาก `updatePatientHealthHistory` ที่ใช้ `$transaction`)
ตรวจค่าด้วย `importedPatientHealthHistorySchema` ตรวจสิทธิ์ direct Hospital ซ้ำจากฐานข้อมูลผ่าน
`resolveAppointmentAccessContext` แบบเดียวกับการแก้ไขในหน้าโปรไฟล์ และเป็น create-only (ถ้ามีแถวอยู่แล้ว
`P2002` ทำให้ทั้ง transaction rollback) ความล้มเหลวที่ขั้นใดก็ตาม rollback ทุกการเขียนของแถวนั้น

## 5. การตรวจข้อมูล

- คำตอบที่ไม่รองรับหรือโรคอื่นยาวเกิน 1,000 ตัวอักษร → preview แถวเป็น `INVALID` พร้อมเหตุผลที่ระบุ
  ชื่อคอลัมน์ เช่น `ประวัติโรคหรือประวัติครอบครัวไม่ถูกต้อง (คอลัมน์ ญาติสายตรง: โรคหัวใจ) …` และ
  diagnostic `HEALTH_HISTORY_DATA_INVALID` (มี `field` + `sourceHeader`)
- confirm ตรวจซ้ำทั้งหมดฝั่ง server (ไม่เชื่อ preview ของ client); ถ้าไม่ถูกต้องจะไม่เขียนอะไรของผู้ป่วยรายนั้น
- ไม่บังคับให้กรอกช่องประวัติสุขภาพ; การตรวจวันเกิด/วันที่ข้อมูลตั้งต้นคงเดิม
- ข้อผิดพลาดของประวัติสุขภาพไม่ถูกนับเป็นข้อผิดพลาดโปรไฟล์ (`hasInvalidPatientImportProfile`) เพื่อให้เหตุผลตรงประเด็น

## 6. ผู้ป่วยเดิมและโรงพยาบาลที่สอง

- ผู้ป่วยที่มี relationship กับโรงพยาบาลนี้แล้ว: `ALREADY_EXISTS` / `CONFLICT` จากการตรวจตัวตนเท่านั้น
  ค่าประวัติสุขภาพในไฟล์ (รวมค่าที่ไม่ถูกต้อง) ถูกเพิกเฉยและไม่เขียนทับข้อมูลใด ๆ
- relationship ที่เกิดขึ้นหลัง preview (กดซ้ำ, ผู้ใช้อื่น) → ตรวจตัวตนอย่างเดียว ไม่เขียนประวัติสุขภาพ
- ผู้ป่วยที่รู้จักในโรงพยาบาลอื่น: ได้ relationship ใหม่ตามกฎตัวตนเดิม ประวัติสุขภาพที่บันทึกเป็นของ
  relationship ใหม่เท่านั้น ไม่คัดลอกประวัติของโรงพยาบาลอื่นเป็นค่าเริ่มต้น และแต่ละโรงพยาบาลอ่าน
  ประวัติของอีกฝ่ายไม่ได้

## 7. สิ่งที่ตั้งใจไม่ทำ

ไม่ import หรือสร้าง: การมอบหมาย อสม., ยา, นัดหมาย, Health/Goal Plan, Patient Program, Service round,
Follow-up ไม่สร้าง placeholder ใด ๆ และไม่แก้ flow เดิมของโดเมนเหล่านี้ ไม่แก้ UI ประวัติสุขภาพ, navigation,
LINE workflow และไม่มี deployment UI ที่เปลี่ยนมีเพียงป้ายชื่อ field 7 รายการใน
`patient-provisioning-workspace.tsx` (ต้องมีเพราะ record ต้องครบทุก field key)

## 8. Health Information readback และช่องว่างการแสดงผล

ตรวจแล้วว่าข้อมูลที่นำเข้าอ่านกลับได้ผ่าน service ที่มีการตรวจสิทธิ์:

| # | รายการลูกค้า | อ่านจาก | สถานะหลัง v3 |
| --- | --- | --- | --- |
| 1 | ชื่อ-นามสกุล | `getPatientDirectoryDetail` | นำเข้าแล้ว |
| 2 | อายุ | `getPatientHealthInformation().dateOfBirth` | นำเข้าแล้ว (คำนวณจากวันเกิด) |
| 3–4, 6 | น้ำหนัก ส่วนสูง รอบเอว | `getPatientBaseline` | นำเข้าแล้ว |
| 5 | BMI | คำนวณจาก baseline ตามนโยบายเดิม | ไม่ import |
| 7 | โรคประจำตัว | `getPatientHealthInformation().history` | **ใหม่ใน v3** |
| 8 | ประวัติครอบครัว | `getPatientHealthInformation().history` | **ใหม่ใน v3** |
| 9 | ผู้ติดต่อฉุกเฉิน | `getPatientDirectoryDetail().profile` | นำเข้าแล้ว |
| 10–13 | ยา นัดหมาย อสม. แผนสุขภาพ | workflow แยกของแต่ละโดเมน | นอก scope import |

**ช่องว่างการแสดงผล (สำหรับ phase customer journey alignment):** หน้าโปรไฟล์ผู้ป่วยแสดงข้อมูลเหล่านี้
แยกเป็นหลาย section (`PatientHealthHistorySection` แสดงอายุ + ประวัติสุขภาพ, baseline และผู้ติดต่อฉุกเฉิน
อยู่คนละส่วน, ยา/นัด/อสม./แผนอยู่คนละหน้า) ยังไม่มีมุมมองเดียวครบ 13 รายการแบบหน้า Canva
phase นี้ไม่ได้ออกแบบ UI ใหม่

## 9. การทดสอบ

| คำสั่ง | ผล |
| --- | --- |
| `npm run lint` | ผ่าน (0 error; 2 warning `<img>` เดิมในไฟล์ที่ไม่เกี่ยวข้อง) |
| `npm run typecheck` | ผ่าน |
| `npx vitest run src/modules/patient-provisioning src/modules/patient-hospital-profile app/api/v1/hospital/patient-import app/app/patients` | ผ่าน 55 ไฟล์ / 620 tests |
| `npm test` (ทั้งชุด) | 469/472 ไฟล์ผ่าน; 5 tests ล้มเหลว **ก่อนการเปลี่ยนแปลงนี้** ใน `app/app/page.test.ts`, `app/app/more/page.test.tsx`, `src/modules/line/adapters/line-messaging-client.test.ts` (คาดหวังลิงก์ `/app/patients/provision` สำหรับ MEMBER/OSM ซึ่งถูกถอดใน `11ddf91`/`10299d5`) |
| `npm run test:integration:focused -- tests/integration/patient-import-v3-health-history.integration.test.ts` | ผ่าน 8/8 (PostgreSQL จริง) |
| focused integration: `patient-roster-baseline-import` (31), `patient-import-domain-transaction` (2), `patient-provisioning` (15), `ops-phase-b` (10) | ผ่านทั้งหมด |
| focused integration: `patient-classification` | 11/12; 1 ล้มเหลว **ก่อนการเปลี่ยนแปลงนี้** — fixture provision ผู้ป่วยด้วย MEMBER ซึ่ง `11ddf91` ทำให้เป็น OWNER-only |

ครอบคลุม: header/คอลัมน์/คำอธิบาย/dropdown ของ template v3, metadata และการปฏิเสธไฟล์ของโรงพยาบาลอื่น,
ปฏิเสธ metadata v1/v2 และ layout v2, การแปลง มี/ไม่มี/ไม่ทราบ/ว่าง/`-`, diagnostic รายคอลัมน์ (`ใช่`, `YES`,
`N`, ตัวเลข, boolean), preview INVALID พร้อมชื่อคอลัมน์, import 1 รายและหลายราย, persistence + readback ของ
โปรไฟล์/baseline/classification/ประวัติสุขภาพ, ไม่สร้างแถวเมื่อไม่มีข้อมูล, rollback ทั้งแถวเมื่อเขียนประวัติ
สุขภาพล้มเหลว, `ALREADY_EXISTS` ไม่เขียนทับประวัติที่แก้ไขภายหลัง, การยืนยันพร้อมกัน (สร้างประวัติ 1 แถว),
โรงพยาบาลที่สองได้ประวัติของตัวเองและอ่านข้ามโรงพยาบาลไม่ได้, failed-rows export คอลัมน์ AH และอ่านกลับเป็น
v3, binding ของ contract v2 ใช้ไม่ได้, MEMBER และ OWNER ของโรงพยาบาลอื่นนำเข้าไม่ได้

## 10. เรื่องที่ยังต้องให้ลูกค้าตัดสินใจ

- ต้องการคอลัมน์ "ปี พ.ศ. ที่ได้รับการวินิจฉัย" (`diagnosisYear`) ใน template หรือไม่ (ตอนนี้ไม่มี)
- ถ้าต้องการให้ไฟล์ที่ตอบ "ไม่ทราบ" ทุกข้อแสดงเป็น "บันทึกแล้ว: ไม่ทราบ" แทน "ยังไม่ได้บันทึก" ต้องตัดสินใจ
  เพิ่มเติม (ปัจจุบันถือว่าเทียบเท่ากันและไม่สร้างแถว)
- รูปแบบหน้า Health Information แบบรวม 13 รายการ (ดูหัวข้อ 8)
