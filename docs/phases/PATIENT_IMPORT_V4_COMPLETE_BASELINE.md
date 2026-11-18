# DEMI — Patient Import v4: ข้อมูลตั้งต้นครบจากไฟล์เดียว

- **สถานะ:** IMPLEMENTED
- **วันที่:** 2026-11-18 (Asia/Bangkok)
- **Authority:** Product Owner decision 2026-11-17 (ผ่านนักพัฒนา): "ไฟล์ Excel ที่นำเข้าคือข้อมูลตั้งต้น
  (Baseline) ของผู้ป่วย การนำเข้าครั้งเดียวต้องกรอกค่าวัดตั้งต้นได้ครบ รวม CVD risk score และความดันโลหิต
  และต้องไม่มีขั้นตอนที่สองที่ซ้ำกัน"
- **Supersedes (เฉพาะประเด็นเวอร์ชัน template และตำแหน่งคอลัมน์):** template `patient-import-template-v3`
  ใน [Patient Import v3](./PATIENT_IMPORT_V3_COMPLETE_INITIAL_HEALTH_DATA.md)
- **ไม่เปลี่ยน:** stateless preview + HMAC binding + re-validate, per-row Serializable transaction,
  create-only สำหรับผู้ป่วยใหม่, สิทธิ์ OWNER-only, กฎวันที่ข้อมูลตั้งต้น (`baselineDateRequired` /
  effective date), ประวัติสุขภาพ, schema ของ `PatientBaseline` (คอลัมน์ทั้งหมดมีอยู่แล้ว)

## เหตุผล

template v3 มีค่าตั้งต้นเพียง 5 ค่า (น้ำหนัก ส่วนสูง รอบเอว ค่าน้ำตาล HbA1c) และ Baseline เป็นแบบสร้างครั้งเดียว
ผู้ป่วยที่นำเข้าจึงไม่มีทางได้ CVD risk score (customer decision D7, WB-DF-17) หรือความดันโลหิตตั้งต้นเลย
ผลคือคอลัมน์ CVD Before ในรายงานโรงพยาบาลว่างเสมอสำหรับผู้ป่วยกลุ่มนี้

## 1. Template v3 → v4

| รายการ | v3 | v4 |
| --- | --- | --- |
| `templateVersion` (`_demi_meta!B1`) | `patient-import-template-v3` | `patient-import-template-v4` |
| `PATIENT_IMPORT_CONTRACT_VERSION` (HMAC binding) | `patient-import-v3-initial-health-data` | `patient-import-v4-complete-baseline` |
| คอลัมน์ | A–AG (33) | A–AJ (36) |
| คอลัมน์ข้อมูลตั้งต้น | I–K, M, N | I–K, M–Q (ติดกันทั้งหมดหลัง HbA1c) |
| คอลัมน์ "เหตุผล" ของไฟล์แถวที่ไม่ผ่าน | AH | AK |
| ชื่อไฟล์ | `DEMI_<รพ.>_patient_import_v3.xlsx` | `DEMI_<รพ.>_patient_import_v4.xlsx` |

- ไฟล์ v3 (metadata v3 หรือ layout 33 คอลัมน์) ถูกปฏิเสธทั้งไฟล์ด้วยข้อความเดิม "รูปแบบไฟล์ไม่ตรงกับไฟล์ตัวอย่าง
  Excel ของระบบ กรุณาดาวน์โหลดไฟล์ตัวอย่างล่าสุดแล้วกรอกข้อมูลใหม่" ข้อความนี้ไม่ระบุเวอร์ชันจึงไม่ต้องแก้
  **ผู้ใช้ต้องดาวน์โหลด template ใหม่** แล้วกรอกข้อมูลใหม่ ไม่มี alias หรือ fallback parsing
- preview ที่ bind ด้วย contract v3 ยืนยันเป็น v4 ไม่ได้ (contract version อยู่ใน HMAC binding)
- ตัวอักษรคอลัมน์ไม่ถูกเขียนตายตัวอีกต่อไป: `PATIENT_IMPORT_TEMPLATE_COLUMNS` คำนวณตัวอักษรจากลำดับใน array
  (`patientImportTemplateColumnLetter`) และ caption แถว 2, merge, binding ของ parser และคอลัมน์เหตุผล
  ล้วนคำนวณจาก array เดียวกัน
- XLSX resource preflight: template v4 เปล่ามี 18,096 cell element (เพดาน 65,536), 28 merge (เพดาน 64)

## 2. คอลัมน์ใหม่

| คอลัมน์ | หัวตาราง | Field | ปลายทาง | กฎ (shared) |
| --- | --- | --- | --- | --- |
| O | ความดันตัวบน (mmHg) | `bloodPressureSystolic` | `PatientBaseline.bloodPressureSystolic` | N3 `systolicBloodPressure` 40–300 |
| P | ความดันตัวล่าง (mmHg) | `bloodPressureDiastolic` | `PatientBaseline.bloodPressureDiastolic` | N3 `diastolicBloodPressure` 20–200 |
| Q | CVD risk score (%) | `cvdRiskScore` | `PatientBaseline.cvdRiskScore` | `cvdRiskScoreSchema` 0–100 ทศนิยมไม่เกิน 1 ตำแหน่ง |

- ความดันตัวบนต้องมากกว่าความดันตัวล่างเมื่อกรอกทั้งสองช่อง (`isBloodPressureOrderValid`)
- ไม่มีเพดานใหม่: ทุกค่าใช้ `src/shared/clinical/clinical-value-limits.ts` และ `src/shared/clinical/cvd-risk-score.ts`
- ค่าที่ไม่ผ่านทำให้แถวเป็น `INVALID` / `BASELINE_DATA_INVALID` พร้อมเหตุผลระดับช่องแบบเดียวกับคอลัมน์ตั้งต้นเดิม
  เช่น `ความดันตัวบนต้องอยู่ระหว่าง 40–300 มม.ปรอท`, `CVD risk score ต้องอยู่ระหว่าง 0–100% และมีทศนิยมไม่เกิน
  1 ตำแหน่ง`, `ความดันตัวบนต้องมากกว่าความดันตัวล่าง`; failed-rows export เก็บค่าเดิมของคอลัมน์ใหม่ไว้
- แถวที่มีค่าตั้งต้นอย่างน้อยหนึ่งค่า (รวมกรณีมีแค่ค่าใหม่ค่าเดียว เช่น CVD อย่างเดียว) สร้าง Baseline เหมือนเดิม
- ชีต "ข้อมูลโรงพยาบาล" อธิบายคอลัมน์ข้อมูลตั้งต้น หน่วย และช่วงค่าของคอลัมน์ใหม่

## 3. สิ่งที่ไม่นำเข้า

ข้อความการปรับตัว ความมั่นใจ สรุป และคำแนะนำ ไม่นำเข้าจากไฟล์ เจ้าหน้าที่กรอกผ่านฟอร์มแก้ไขข้อมูลตั้งต้น
ซึ่งใช้ได้จนกว่าจะเปิดโปรแกรม (ดู [Phase 10C.0 addendum 2026-11-18](./PHASE_10C0_BASELINE_INITIAL_STATE_WORKING_PROTOTYPE.md))
ชีตคำแนะนำในไฟล์ระบุเรื่องนี้ไว้ ระบบไม่คำนวณ CVD risk (D7: เจ้าหน้าที่กรอกเอง)
