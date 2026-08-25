# DEMI Phase 16A — Canonical Patient Import Contract v1

**สถานะ:** Documentation-only requirement consolidation / implementation handoff
**วันที่ตรวจ:** 2026-08-25 (Asia/Bangkok)
**ขอบเขต:** patient roster/import evidence, canonical normalization, current-domain mapping และ requirement gates
**สิ่งที่เอกสารนี้ไม่ทำ:** ไม่แก้ Prisma schema, migration, adapter, service, policy, route, UI หรือ persistence semantics

เอกสารนี้จัดทำขึ้นหลังพบหลักฐานจาก workbook คนไข้จริงและไฟล์ roster ใน legacy
หลายแหล่งที่มีโครงสร้างซ้ำกันอย่างมีนัยสำคัญ หลักฐานใหม่นี้เพิ่มความมั่นใจว่า
DEMI ต้องรองรับ spreadsheet family สำหรับ patient intake ในอนาคต แต่ยังไม่ใช่
customer approval ให้เก็บทุกคอลัมน์ลง domain ใด domain หนึ่ง

**ข้อจำกัดด้านข้อมูลส่วนบุคคล:** การตรวจไฟล์ทำแบบ read-only และเอกสารนี้บันทึก
เฉพาะชื่อ header, รูปแบบคอลัมน์, ขนาดเชิงโครงสร้าง และสถิติที่ไม่เปิดเผยค่าแถว
ไม่มี National ID, ชื่อ, HN, โทรศัพท์, ที่อยู่, ค่าคลินิก หรือแถวคนไข้จริงใน
repository, fixture, log, screenshot หรือเอกสารนี้

## 1. ผลสรุปที่ต้องถือเป็น handoff

1. มี **STRONG OPERATIONAL EVIDENCE** ว่า roster family เดียวกันถูกใช้กับหลาย
   Hospital/รพ.สต. โดยชุดหลักมีประมาณ 27–29 คอลัมน์ และมี workbook แบบขยาย
   ถึง 36 คอลัมน์ที่เพิ่ม PID, visit dates และค่าติดตามหลายครั้ง
2. **CURRENT IMPLEMENTATION** รองรับเฉพาะ `.xlsx`, 5 MB, 500 แถว และสูงสุด
   16 คอลัมน์ โดยอ่านเฉพาะ National ID, given name, family name และ HN
   ดังนั้นการรับไฟล์ operational family เต็มรูปแบบยังมี **CONFIRMED
   COMPATIBILITY GAP**
3. `nationalId`, `givenName`, `familyName` และ `hospitalNumber` มี boundary
   ปัจจุบันที่ชัดเจนสำหรับ provisioning แต่ field อื่นที่เห็นใน workbook ต้อง
   แยก parse/normalize/classify ออกจาก persist
4. `dateOfBirth`, `gender`, contact และ address มีคอลัมน์ใน `PatientProfile`
   ปัจจุบัน แต่ ownership/mutation ยังเป็น **PROVISIONAL CURRENT DOMAIN** ไม่ใช่
   business decision ถาวร
5. Weight, waist และ blood sugar/DTX มี raw prototype fields ใน Baseline,
   Follow-up หรือ Final บาง domain แต่ความหมายของค่าจาก roster, source,
   observation date และการผูกเข้ากับ workflow ยังเป็น **REQUIREMENT-GATED**
6. Height และ HbA1c ยังไม่มี current rewrite persistence source; diabetes/risk
   classification ยังไม่มี enum หรือ authoritative domain ที่รับรองแล้ว
7. ไฟล์ควรถูกพิจารณาเป็น candidate ตามลำดับ:

   ```text
   PARSE → NORMALIZE → VALIDATE → CLASSIFY → PREVIEW/RECONCILE → PERSIST
   ```

   Phase 16A ปิดเฉพาะ contract และ decision gate ไม่ได้เปิด full persistence

## 2. Source-of-truth และ classification

ลำดับอำนาจยังเหมือนเดิม:

1. confirmed current business requirements;
2. accepted ADRs;
3. current authoritative phase contracts และ current implementation;
4. architecture baseline / `CONTEXT.md`;
5. new real operational workbook evidence;
6. legacy behavior และ data files;
7. engineering recommendations.

คำต่อไปนี้ใช้ตลอดเอกสารนี้:

| Classification | ความหมายใน Phase 16A |
| --- | --- |
| **CONFIRMED ARCHITECTURE** | Boundary จาก accepted ADR/architecture ที่ห้ามถูกเปลี่ยนเพียงเพื่อให้ legacy import ง่ายขึ้น |
| **CURRENT IMPLEMENTATION** | สิ่งที่ schema, service, adapter, policy, query หรือ test ปัจจุบันทำจริง |
| **STRONG OPERATIONAL EVIDENCE** | โครงสร้าง header/shape ที่ปรากฏซ้ำใน operational files หลาย source; ยังไม่เท่ากับ approved semantics |
| **LEGACY BEHAVIOR ONLY** | พฤติกรรม, field default, authorization หรือ persistence ของ legacy ที่ใช้เป็น behavioral evidence เท่านั้น |
| **REQUIREMENT-GATED** | ต้องรอ customer/business/clinical decision ก่อนเลือก domain, persistence, workflow หรือ authority |
| **ENGINEERING RECOMMENDATION** | แนวทางที่เสนอเพื่อให้ implementation ปลอดภัยและ reversible; ไม่ใช่ requirement ที่ตอบแทนลูกค้า |

ห้ามเลื่อนสถานะจาก evidence เป็น accepted semantics โดยอัตโนมัติ เช่น การมี
header `ประเภทเบาหวาน` ไม่ได้แปลว่าต้องสร้าง enum หรือการมีค่าคลินิกในแถว
ไม่ได้แปลว่าค่านั้นเป็น Baseline

## 3. Inspection record

### 3.1 Current rewritten repository

ตรวจ branch และ main แล้วพบ:

| รายการ | ผลตรวจ |
| --- | --- |
| Current branch | `demidemo` |
| Current `HEAD` | `b0efb3926f48294d30270017ff67103f6221b927` |
| Current `HEAD` message | `fix(patient-evidence): preserve caption during image optimization` |
| `main` | ชี้ไปที่ `b0efb3926f48294d30270017ff67103f6221b927` เดียวกัน |
| Working tree ก่อน Phase 16A | สะอาด |
| Current schema | มี `Person`, `User`, `PatientProfile`, `PatientHospitalRelationship`, `PatientOsmAssignment`, `ScreeningAssessment`, `PatientBaseline`, `PatientProgram`, `PatientFollowup`, `PatientFinalAssessment` และ related models |

**Historical contradiction:** Phase 15E.3 บันทึก starting HEAD เก่า
`5e8c02c5...` และ Phase 5A บางส่วนบรรยาย schema ก่อน PatientProfile/
relationship ถูก implement แล้ว เอกสารเหล่านั้นยังคงเป็น historical record
ตาม scope เดิม; current schema/service ที่ HEAD นี้มีอำนาจเหนือข้อความ snapshot
เหล่านั้น และ Phase 16A ไม่ rewrite history.

### 3.2 Current documents and implementation inspected

- [`docs/CONTEXT.md`](../CONTEXT.md)
- [`docs/architecture/DEMI_ARCHITECTURE_BASELINE.md`](../architecture/DEMI_ARCHITECTURE_BASELINE.md)
- [`docs/adr/0001-person-and-user-identity.md`](../adr/0001-person-and-user-identity.md)
- [`docs/adr/0002-role-capability-scope-authorization.md`](../adr/0002-role-capability-scope-authorization.md)
- [`docs/adr/0004-patient-provisioning-and-activation.md`](../adr/0004-patient-provisioning-and-activation.md)
- [`docs/adr/0005-server-side-application-boundary.md`](../adr/0005-server-side-application-boundary.md)
- [`docs/adr/0006-transactional-business-operations.md`](../adr/0006-transactional-business-operations.md)
- [`docs/phases/PHASE_5A_PATIENT_PROVISIONING.md`](PHASE_5A_PATIENT_PROVISIONING.md)
- [`docs/phases/PHASE_5B1_PATIENT_PROVISIONING_CORE.md`](PHASE_5B1_PATIENT_PROVISIONING_CORE.md)
- [`docs/phases/PHASE_5B2_PATIENT_FIRST_TIME_ACTIVATION.md`](PHASE_5B2_PATIENT_FIRST_TIME_ACTIVATION.md)
- [`docs/phases/PHASE_10A_PATIENT_PROFILE_BASELINE_STATUS_REQUIREMENTS.md`](PHASE_10A_PATIENT_PROFILE_BASELINE_STATUS_REQUIREMENTS.md)
- [`docs/phases/PHASE_10B0_PATIENT_PROFILE_WORKING_PROTOTYPE.md`](PHASE_10B0_PATIENT_PROFILE_WORKING_PROTOTYPE.md)
- [`docs/phases/PHASE_10C0_BASELINE_INITIAL_STATE_WORKING_PROTOTYPE.md`](PHASE_10C0_BASELINE_INITIAL_STATE_WORKING_PROTOTYPE.md)
- [`docs/phases/PHASE_10D0_PATIENT_STATUS_ARTIFACTS_WORKING_PROTOTYPE.md`](PHASE_10D0_PATIENT_STATUS_ARTIFACTS_WORKING_PROTOTYPE.md)
- [`docs/phases/PHASE_15D1_FINAL_ASSESSMENT_DOMAIN_PERSISTENCE.md`](PHASE_15D1_FINAL_ASSESSMENT_DOMAIN_PERSISTENCE.md)
- [`docs/phases/PHASE_15D2_MEASUREMENT_SEMANTICS_CONSOLIDATION.md`](PHASE_15D2_MEASUREMENT_SEMANTICS_CONSOLIDATION.md)
- [`docs/phases/PHASE_15E3_DEMO_CLOSEOUT_FULL_JOURNEY_REAUDIT_RELEASE_READINESS.md`](PHASE_15E3_DEMO_CLOSEOUT_FULL_JOURNEY_REAUDIT_RELEASE_READINESS.md)
- [`prisma/schema.prisma`](../../prisma/schema.prisma)
- [`excel-patient-import-adapter.ts`](../../src/modules/patient-provisioning/adapters/excel-patient-import-adapter.ts)
- [`patient-provisioning-service.ts`](../../src/modules/patient-provisioning/services/patient-provisioning-service.ts)
- [`patient-provisioning-policy.ts`](../../src/modules/patient-provisioning/policies/patient-provisioning-policy.ts)
- [`patient-provisioning-schemas.ts`](../../src/modules/patient-provisioning/schemas/patient-provisioning-schemas.ts)
- [`patient-import-file-binding.ts`](../../src/modules/patient-provisioning/transport/patient-import-file-binding.ts)
- [`identity-service.ts`](../../src/modules/identity/services/identity-service.ts)
- [`patient-directory-query-service.ts`](../../src/modules/patient-directory/services/patient-directory-query-service.ts)
- [`patient-osm-assignment-service.ts`](../../src/modules/patient-assignment/services/patient-osm-assignment-service.ts)
- Baseline, Screening, Follow-up, Patient Program และ Final Assessment services,
  schemas, policies, queries และ integration tests ที่อยู่ใต้ `src/modules/**`

### 3.3 Operational evidence inspected read-only

Legacy checkout ที่อ่านคือ commit `7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e`
ของ `raviut-max/demi-plus-web-v2` จาก local checkout ที่แยกจาก rewritten
repository.

ไฟล์ที่ตรวจโดยตรง:

- `file/เทมเพลตมีตัวอย่าง.csv`
- `file/ตัวอย่างจากเทมเพลต.csv`
- `file/De-mi ตัวอย่างลงรายชื่อ.csv`
- `file/De-mi ตัวอย่างลงรายชื่อ (รพ.เมตตาธรรม).xlsx`
- `file/DATA/กาบัง.xlsx` และ `file/กาบัง.csv`
- `file/DATA/รายชื่อคนไข้ Demiรพ.สต.เกาะสะท้อน.xlsx`
- ไฟล์ `.xlsx` อื่นใน `file/DATA/` ที่มี header family เดียวกันหรือเป็น
  extended roster เช่น workbook ที่มี `PID`, `BP`, `P`, `A1C` และ visit columns
- `file/Qwen_csv_20260510_n4dkgfzwt.txt` เฉพาะ header/shape description

ตรวจ workbook จริงที่ผู้ใช้ระบุแบบ read-only และสำเนาใน legacy `DATA` โดยไม่
คัดลอก ไม่ extract แถว และไม่เพิ่มไฟล์ใดลง repository.

### 3.4 Legacy behavior boundary

การใช้ legacy แยกเป็นสองชั้นอย่างชัดเจน:

| Legacy material | Classification | ขอบเขตการใช้ใน Phase 16A |
| --- | --- | --- |
| header, column shape, file naming และ terminology ที่ปรากฏซ้ำ | **STRONG OPERATIONAL EVIDENCE** เมื่อยืนยันข้ามหลาย source | ใช้สร้าง candidate contract และ compatibility matrix เท่านั้น |
| authentication, authorization, direct Supabase access, credential/password behavior, tenant hierarchy หรือ persistence pattern ของ legacy implementation | **LEGACY BEHAVIOR ONLY** | ไม่ใช่ target behavior, ไม่ใช่ source of truth และห้ามนำมาแก้ ADR/current server-side boundaries |

ดังนั้นเอกสารนี้ไม่คัดลอก code หรือความปลอดภัยของ legacy และไม่อนุมานว่า
พฤติกรรมเดิมเป็น permission, tenant ownership, identity resolution หรือ
persistence semantics ของ rewritten DEMI.

### 3.5 Structural evidence summary

ผลจาก header/shape scan โดยไม่แสดง cell values:

| ข้อค้นพบ | หลักฐานเชิงโครงสร้าง | สถานะ |
| --- | --- | --- |
| Full roster family | ชุดหลักมี 27 หรือ 28 headers; มี variant 29 columns เมื่อมี sequence/trailing column | **STRONG OPERATIONAL EVIDENCE** |
| Hospital split | บางไฟล์แยก `โรงพยาบาล` + `รพ.สต.`; บางไฟล์ใช้ `โรงพยาบาล หรือ รพสต`; บางไฟล์ไม่มี `รพ.สต.` | **STRONG OPERATIONAL EVIDENCE** |
| Caregiver label | พบ `ชื่อผู้ดูแล (อสม.)`, `ชื่อผู้ดูแล(อสม)`, `โค้ช`, และ long-form coach label | **STRONG OPERATIONAL EVIDENCE** |
| Identity/name aliases | พบ `ชื่อ`, `ชื่อคนไข้`, `ชื่อ สกุล`, `นามสกุล`, `สกุล`; `ชื่อ สกุล` เป็น combined field ไม่ควร split โดยเดา | **STRONG OPERATIONAL EVIDENCE** |
| Extended roster | มี workbook 36 columns ที่เพิ่ม `PID`, อายุ, BP/P, A1C, DTX และ visit-date/measurement columns หลายครั้ง | **STRONG OPERATIONAL EVIDENCE** |
| Multi-sheet workbook | Workbook ที่ตรวจมี 2 sheets โดย sheet หนึ่งเป็น 27-column shape และอีก sheet เป็น 28-column shape | **STRONG OPERATIONAL EVIDENCE** |
| CSV support in evidence | มีทั้ง `.csv` และ `.xlsx` ใน family เดียวกัน | **STRONG OPERATIONAL EVIDENCE** |
| Duplicate identity evidence | มีไฟล์ชื่อ `รายชื่อที่มีปัญหา.xlsx` ที่พบ National ID ซ้ำในโครงสร้างที่อ่านได้; exact duplicate full rows ไม่ใช่สิ่งที่ยืนยันจากทุกไฟล์ | **STRONG OPERATIONAL EVIDENCE** |
| Malformed file evidence | มีไฟล์ที่ลงท้าย `.xlsx` แต่ไม่สามารถอ่านเป็น valid ZIP workbook ได้ | **STRONG OPERATIONAL EVIDENCE** ของ input rejection path ไม่ใช่ business semantics |

ชื่อไฟล์หรือจำนวนแถวที่ปรากฏข้างต้นเป็น metadata ของหลักฐานเท่านั้น ไม่ใช่
การเปิดเผย patient rows.

## 4. Canonical Patient Import Contract v1

### 4.1 Boundary และ responsibility

**ENGINEERING RECOMMENDATION:** Canonical row เป็น transient import candidate
ที่มี typed field family ชัดเจน ไม่ใช่ persistence model และไม่ใช่ generic
metadata bag. ทุก field ใช้ `null`/missing เมื่อไม่มีข้อมูล ห้ามใช้ default
ปลอม เช่น วันเกิดสมมติ เพศ `unknown` หรือ HN สังเคราะห์

```text
Workbook / CSV
  ↓
source sheet + source row number
  ↓
normalized headers + explicit alias resolution
  ↓
CanonicalPatientImportRowV1 (transient)
  ├─ identity
  ├─ relationship candidate
  ├─ provisional profile candidate
  ├─ clinical candidate (requirement-gated where applicable)
  ├─ organization text candidate (never tenant authority)
  └─ unknown/ambiguous header diagnostics
```

Canonical row ต้องเก็บ `sourceSheetName`, `sourceRowNumber`, source header
diagnostics และ file fingerprint เพื่อ preview/reconciliation ได้ แต่สิ่งนี้
เป็น ingestion provenance ชั่วคราว ไม่ใช่การอนุญาตให้สร้าง `patient_import_data`
JSON, EAV หรือ custom-field store ถาวร

### 4.2 Normalized representation

ชื่อ canonical key เป็นภาษาอังกฤษตาม domain vocabulary ปัจจุบัน:

```text
identity:
  nationalId: string | null
  givenName: string | null
  familyName: string | null

relationship:
  hospitalNumber: string | null
  hospitalNameText: string | null
  subHospitalNameText: string | null

sourceCandidates:
  combinedNameText: string | null
  organizationCombinedText: string | null
  riskFactorText: string | null

profileCandidate:
  dateOfBirth: date | null
  gender: string | null
  phoneNumber: string | null
  address: {
    houseNumber: string | null
    villageNumber: string | null
    villageName: string | null
    soi: string | null
    road: string | null
    province: string | null
    district: string | null
    subdistrict: string | null
    postalCode: string | null
  }
  emergencyContact: {
    name: string | null
    phone: string | null
    relationship: string | null
  }

clinicalCandidate:
  weight: number | null
  height: number | null
  waistCircumference: number | null
  bloodSugar: number | null
  hba1c: number | null
  diabetesClassification: string | null

careCandidate:
  osmCaregiverName: string | null

transientDiagnostics:
  sourceSheetName: string
  sourceRowNumber: number
  unknownHeaders: string[]
  ambiguousHeaders: string[]
  unsupportedRequirementFields: string[]
```

`combinedNameText`, `organizationCombinedText` และ `riskFactorText` เป็น typed
source candidates สำหรับ review เท่านั้น ไม่ใช่การอนุญาตให้ split หรือสร้าง
domain ใหม่. `hospitalNameText` และ `subHospitalNameText` เป็น source text
เท่านั้น ไม่ใช่ `hospitalId`. `clinicalCandidate` ไม่ได้หมายความว่าจะ persist ลง Baseline,
Follow-up, Screening หรือ Profile. Field เพิ่มเติมจาก extended roster เช่น
`PID`, BP, P, BMI และ repeated visit values จะอยู่ใน typed review candidate
เฉพาะเมื่อมี contract รองรับ; ไม่ใช้ JSON เพื่อหลบการตัดสินใจ

`dateOfBirth: date` ใน canonical row หมายถึง date-only ที่ผ่าน calendar/locale
contract แล้ว (เป้าหมายคือ Gregorian date) พร้อม diagnostics ของ source shape;
ไม่ใช่การเปลี่ยนปี พ.ศ. เป็น ค.ศ. หรือเลือก day/month โดยอัตโนมัติ.

### 4.3 Requiredness contract

- **CURRENT IMPLEMENTATION:** provisioning path ต้องมี valid `nationalId`,
  `givenName` และ `familyName`; `hospitalNumber` optional.
- **STRONG OPERATIONAL EVIDENCE:** full roster มักมี headers เหล่านี้และมี
  field อื่นจำนวนมาก แต่ header presence ไม่พิสูจน์ว่า cell ทุกแถว required.
- **REQUIREMENT-GATED:** requiredness ของวันเกิด เพศ ที่อยู่ โทรศัพท์ HN,
  clinical values, Hospital/รพ.สต. text และ caregiver ยังห้ามสรุปจาก form หรือ
  populated-cell frequency.
- **ENGINEERING RECOMMENDATION:** แยก `required header`, `required value`,
  และ `required for a selected persistence action` ออกจากกันใน preview.

## 5. Field / header evidence matrix

คอลัมน์ `Current DEMI domain candidate` เป็นการชี้ boundary ที่ควรตรวจต่อ
ไม่ใช่การอนุมัติให้ persist. `Current persistence support` อ้างอิง schema/
service ปัจจุบัน; `Requirement status` อ้างอิงความหมายที่ยังต้องปิด.

| Canonical key | Observed header aliases | Required/optional behavior ที่พบ | Example value shape (synthetic) | Current DEMI domain candidate | Current persistence support | Requirement status | Implementation implication |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `nationalId` | `เลขบัตรประชาชน`, `เลขประจำตัวประชาชน`, `Thai National ID`, `National ID`, `national id` | Header อยู่ใน full roster เกือบทุก variant; current provisioning required | `<synthetic-national-id>` หรือ text 13 หลัก | `Person` identity boundary | HMAC `Person.identityKeyHash`; raw value ไม่ใช่ profile field | **CONFIRMED ARCHITECTURE** boundary; input normalization still gated | resolve ผ่าน identity service; ห้ามใช้ชื่อ/วันเกิด/โทร/HN เป็น weak match |
| `dateOfBirth` | `วันเกิด`, `วันเกิด(พ.ศ.)`, `วันเดือน ปีเกิด พศ.`, `วัน เดือน ปีเกิด พ.ศ.`, `date of birth`, `DOB` | Header มักมี; cell พบทั้ง blank, text และ Excel date | `<synthetic-date-shape>`, `<excel-date-cell>` | `PatientProfile` ปัจจุบัน; อาจเป็น `Person`/relationship ในอนาคต | `PatientProfile.dateOfBirth` nullable; read-only prototype | **REQUIREMENT-GATED** ownership/calendar semantics | parse เป็น date ได้เมื่อรูปแบบชัด; ห้ามเติมวัน/เดือนที่หาย |
| `givenName` | `ชื่อ`, `ชื่อคนไข้`, `ชื่อผู้ป่วย`, `first name`, `given name` | Current provisioning required; evidence aliases vary | `<synthetic-given-name>` | `Person.givenName` | Supported by provisioning and identity conflict check | **CURRENT IMPLEMENTATION** | explicit alias; `ชื่อ สกุล` ไม่ใช่ alias ที่ split อัตโนมัติ |
| `familyName` | `นามสกุล`, `สกุล`, `last name`, `family name` | Current provisioning required; `สกุล` appears in variant | `<synthetic-family-name>` | `Person.familyName` | Supported by provisioning and identity conflict check | **CURRENT IMPLEMENTATION** | explicit alias; combined name ต้อง review |
| `combinedNameText` | `ชื่อ สกุล` | Appears in an alternate layout instead of separate given/family headers | `<synthetic-combined-name>` | No direct identity mapping | No persistence support as a combined field | **REQUIREMENT-GATED** identity parsing | preserve as review candidate; ห้าม split first/last name โดยเดา |
| `hospitalNumber` | `HN`, `HN รพ`, `hospital number`, `hospitalnumber`, `เลข HN` | Header often present; cells numeric/text/blank; current field optional | `HN-SAMPLE-001` | `PatientHospitalRelationship.hospitalNumber` | Supported, optional, not unique in current phase | **CURRENT IMPLEMENTATION** field boundary; uniqueness still open | preserve as string; compare only within exact Hospital relationship |
| `gender` | `เพศ`, `gender`, `sex` | Header common; requiredness not proven; values are text labels | `<synthetic-gender-label>` | `PatientProfile.gender` provisional | Nullable string column/read projection exists | **REQUIREMENT-GATED** vocabulary/ownership | no `unknown` default, no enum invention |
| `phoneNumber` | `เบอร์โทร`, `เบอร์โทรศัพท์`, `เบอร์โทร ผู้รับบริการ`, `โทรศัพท์`, `phone`, `phone number`, `mobile` | Often present but mixed blank/numeric/text; generic `เบอร์โทร` can occur twice | `<synthetic-phone-as-text>` | `PatientProfile.phoneNumber` provisional | Nullable string column/read projection exists | **REQUIREMENT-GATED** ownership/format/activation use | keep as text; duplicate generic headers require explicit layout rule or review |
| `weight` | `น้ำหนัก`, `น้ำหนัก KG`, `น้ำหนัก (kg)`, `weight`, `BW.` | Present in full roster; often blank in some rows; extended files repeat it by visit | `72.5` | Baseline/Follow-up/Final raw fields | Provisional raw fields exist in relationship/Program domains | **REQUIREMENT-GATED** meaning, unit, date, destination | never write to `PatientProfile`; do not assume Baseline |
| `height` | `ส่วนสูง`, `ส่วนสูง (เมตร)`, `ส่วนสูง(cm)`, `height` | Present in main roster but unit labels differ; not in current raw domains | `165` or `1.65` | No current clinical source | No current Prisma field/service source | **REQUIREMENT-GATED** unit/owner/timing | preserve unit evidence; reject/hold ambiguous conversion |
| `waistCircumference` | `รอบเอว(ซม.)`, `รอบเอว (ซม.)`, `รอบเอว`, `waist circumference`, `waist (cm)` | Present in full roster; extended variant includes `รอบเอว 2` | `88.0` | Baseline/Follow-up/Final raw fields | Provisional raw fields exist | **REQUIREMENT-GATED** stage/date/source | `รอบเอว 2` is not automatically the same observation |
| `diabetesClassification` | `ประเภทเบาหวาน`, `ประเภทเบาหวาน กลุ่มเสี่ยง หรือเบาหวาน (ไม่ต้องมี Type)`, `กลุ่มเสี่ยง หรือ เบาหวาน`, `diabetes type`, `risk group` | Header common; labels include at least risk/diabetes concepts; enum semantics absent | `<synthetic-classification-label>` | No current authoritative domain; possible Screening/cohort/report label | No enum or accepted persistence source | **REQUIREMENT-GATED** Decision 2 | retain in candidate/preview; never create enum or workflow side effect |
| `bloodSugar` | `ค่าน้ำตาลในเลือด`, `ค่าน้ำตาล`, `blood sugar`, `blood glucose` | Common; numeric or blank; `-` may appear in related data | `126` | Baseline `bloodSugarDtx`, Follow-up/Final `bloodSugar` | Provisional raw fields exist, names differ | **REQUIREMENT-GATED** DTX equivalence/context/date | do not silently equate `ค่า DTX` with official blood sugar |
| `hba1c` | `ค่า HbA1c ล่าสุด (ถ้ามี)`, `HbA1c`, `HbA1C`, `A1C`, `hba1c` | Header often present; blank/`-`/numeric mixed; “ล่าสุด” is source wording only | `6.5` | No current domain | No current Prisma field | **REQUIREMENT-GATED** source/unit/timing/authority | do not add field or map to blood sugar |
| `hospitalName` | `โรงพยาบาล`, `hospital` | Present in some variants; absent in others; text | `<synthetic-hospital-text>` | Server-selected target Hospital only | No file-to-tenant mapping support by design | **CONFIRMED ARCHITECTURE** authority; business ownership pending | use for reconciliation/display only; never trust as tenant ID |
| `subHospitalName` | `รพ.สต.`, `รพสต.`, `รพ.สต`, `รพสต`, `sub-hospital` | Present in split variants; absent in combined/no-subHospital variants | `<synthetic-subhospital-text>` | No accepted child/tenant import domain | No persistence mapping | **REQUIREMENT-GATED** Decision 3 | do not infer parent/child authorization |
| `organizationCombinedText` | `โรงพยาบาล หรือ รพสต.`, `โรงพยาบาล หรือ รพ.สต`, `โรงพยาบาล หรือ รพสต` | Appears where Hospital and รพ.สต. are combined; cannot prove which level the value names | `<synthetic-organization-text>` | No current tenant/hierarchy import domain | No persistence mapping | **REQUIREMENT-GATED** Decision 3 | preserve one source text; do not split or map to `hospitalId` |
| `houseNumber` | `บ้านเลขที่`, `house number` | Common in main roster; may be blank; sometimes numeric-like | `<synthetic-house-number>` | Part of `PatientProfile.addressText` only as provisional candidate | No structured column | **REQUIREMENT-GATED** address ownership/format | do not concatenate into authoritative address without rule |
| `villageNumber` | `หมู่ที่/ชุมชน`, `หมู่ที่`, `หมู่` | Common in main roster; optional-looking; text/numeric-like | `7` | No structured current field | No current column | **REQUIREMENT-GATED** | preserve as separate candidate; no address flattening by guess |
| `villageName` | `หมู่บ้าน`, `village` | Common in main roster; may be blank | `<synthetic-village>` | No structured current field | No current column | **REQUIREMENT-GATED** | explicit field only; no geography authorization |
| `soi` | `ซอย`, `soi` | Common in main roster; optional-looking | `<synthetic-soi>` | No structured current field | No current column | **REQUIREMENT-GATED** | keep transient until address contract exists |
| `road` | `ถนน`, `road` | Common in main roster; optional-looking | `<synthetic-road>` | No structured current field | No current column | **REQUIREMENT-GATED** | keep transient until address contract exists |
| `province` | `จังหวัด`, `province` | Common; not proof of Hospital scope | `<synthetic-province>` | No current authorization domain | No current column | **REQUIREMENT-GATED** ownership/normalization | never use geography as authorization |
| `district` | `อำเภอ`, `district` | Common; may be blank in variants | `<synthetic-district>` | No structured current field | No current column | **REQUIREMENT-GATED** | no master-data match by fuzzy text |
| `subdistrict` | `ตำบล`, `subdistrict` | Common; may be blank in variants | `<synthetic-subdistrict>` | No structured current field | No current column | **REQUIREMENT-GATED** | no scope expansion from location |
| `postalCode` | `รหัสไปรษณีย์`, `postcode`, `postal code` | Common; numeric-like/text; requiredness not proven | `00000` | No current field | No current column | **REQUIREMENT-GATED** | preserve as text to retain leading zeros |
| `emergencyContactName` | `ชื่อผู้ติดต่อ(ญาติ)`, `ชื่อผู้ติดต่อ`, `ผู้ติดต่อฉุกเฉิน`, `ชื่อผู้ติดต่อฉุกเฉิน` | Present in main roster; blank/`-` in some variants | `<synthetic-contact-name>` | `PatientProfile.emergencyContactName` provisional | Nullable column/read projection exists | **REQUIREMENT-GATED** owner/relationship | no automatic notification/activation implication |
| `emergencyContactPhone` | `เบอร์ผู้ติดต่อ`, `เบอร์โทรผู้ติดต่อ`, `เบอร์โทรฉุกเฉิน`; generic second `เบอร์โทร` only with explicit template context | Often paired with contact name; duplicate generic header is ambiguous | `<synthetic-contact-phone>` | `PatientProfile.emergencyContactPhone` provisional | Nullable column/read projection exists | **REQUIREMENT-GATED** alias disambiguation/ownership | no positional guess unless an explicit approved layout profile exists |
| `emergencyContactRelationship` | `ความสัมพันธ์`, `ความสัมพันธ์กับผู้ติดต่อ`, `relationship` | Common in main roster; may be blank/`-` | `<synthetic-relationship>` | No current PatientProfile relationship column | No persistence support | **REQUIREMENT-GATED** | retain transient; do not drop silently |
| `osmCaregiverName` | `ชื่อผู้ดูแล (อสม.)`, `ชื่อผู้ดูแล(อสม)`, `ผู้ดูแล(อสม.)`, `ผู้ดูแล(อสม)`, `โค้ช`, `โค้ชผู้ดูแล`, `coach` | Present in many roster variants; exact identity/authority not proven | `<synthetic-osm-display-name>` | `PatientOsmAssignment` only after server lookup | Assignment service accepts an OSM UUID, not text | **REQUIREMENT-GATED** Decision 4 | exact unique server match + human confirmation; no fuzzy auto-assignment |
| `sourceSequenceNumber` | `ที่`, `ลำดับ`, `ลำดับที่` | Appears in some workbooks; source row marker | `12` | Adapter provenance only | No patient-domain persistence | **MUST NOT MAP HERE** | keep as row metadata for errors; never identity or HN |
| `externalPatientId` | `PID` | Appears in an extended roster and alongside National ID; semantics unknown | `<synthetic-external-id>` | No current domain | No persistence support | **REQUIREMENT-GATED** | never alias to National ID/HN; show unsupported field |
| `addressText` | `ที่อยู่`, `รายละเอียดที่อยู่` | Appears in alternate layout instead of structured address columns | `<synthetic-address-text>` | `PatientProfile.addressText` provisional | Nullable flattened column exists | **REQUIREMENT-GATED** source/ownership | do not merge with structured parts without explicit policy |
| `ageAtRoster` | `อายุ(ปี)`, `age` | Appears in extended file; derived/time-dependent | `54` | No current source of truth; DOB is more stable candidate | No persistence support | **MUST NOT MAP HERE** as authoritative patient fact | use only for discrepancy review against DOB, never persist as age |
| `bloodPressureText` | `BP`, `ความดัน`, `blood pressure` | Appears in extended file as combined text; no clear pair grammar | `<synthetic-bp-text>` | Current domains have separate systolic/diastolic fields | Baseline/Follow-up/Final support separate values | **REQUIREMENT-GATED** parsing/context | no split on punctuation unless exact format contract exists |
| `pulseRate` | `P`, `ชีพจร`, `pulse` | Appears in extended file; not in main roster | `78` | No current persistence source | No current field | **REQUIREMENT-GATED** | preserve as unsupported candidate; no invented domain |
| `dtxReading` | `ค่า DTX`, `ค่า DTX2`, `สรุป DTX`, `DTX` | Appears in extended/follow-up layout; multiple occurrence meanings | `126` | Related to prototype `bloodSugarDtx` but not proven equivalent | Provisional related field exists under other names | **REQUIREMENT-GATED** | occurrence/date/source must be explicit; do not collapse to `bloodSugar` |
| `riskFactorText` | `ปัญหา/ปัจจัยเสี่ยง` | Appears in extended roster; may be a free-text operational/clinical note | `<synthetic-risk-factor-text>` | No current authoritative domain | No persistence support | **REQUIREMENT-GATED** meaning/owner/visibility | retain as bounded review candidate; do not convert to diagnosis, Screening result or workflow |
| `bmi` | `BMI` | Appears in extended file; also report evidence; derived value | `24.5` | No current BMI field/calculation | No persistence support | **MUST NOT MAP HERE** until formula/source contract | never persist or recompute from roster by assumption |
| `serviceVisitDate` / extended observation date | `วัน เดือน ปี ที่รับบริการ ครั้งที่ 1`, `...ครั้งที่ 4`, `...ครั้งที่ 5`, `...ครั้งที่ 6`, `...ครั้งที่ 7` | Repeated numbered columns in an extended workbook; not present in main roster | `<explicit-date>` | PatientFollowup/other clinical domain only after contract | No generic import observation source | **REQUIREMENT-GATED** Decision 5 and clinical provenance | typed review candidate only; no fixed six-round mapping |
| `extendedMeasurementSeries` | repeated `น้ำหนัก`, `รอบเอว 2`, `ค่า DTX2`, `สรุป น้ำหนัก`, `ผลสรุป` | Appears in one extended family; includes later/summary values | typed array of explicitly dated observations, if ever approved | No current generic observation model | No persistence support | **REQUIREMENT-GATED** | do not create EAV/JSON shortcut; block or preserve for review |

### 5.1 What the matrix does and does not establish

- Repeated headers establish a strong candidate import contract, not requiredness,
  clinical meaning, ownership, or authorization.
- Existing nullable columns establish **CURRENT IMPLEMENTATION** support, not
  permission for a new importer to mutate them.
- A field with no current column is not a reason to add a generic metadata blob.
- `hospitalName`, `subHospitalName`, `osmCaregiverName` และ `diabetesClassification`
  are especially dangerous to map by text because they can affect scope,
  assignment, workflow หรือ clinical interpretation.

## 6. Header alias contract

### 6.1 Header normalization rules

**ENGINEERING RECOMMENDATION:** resolver ใช้ explicit alias registry และ
explicit layout profiles เท่านั้น:

1. ตัด BOM `U+FEFF` ที่ต้น header;
2. trim Unicode whitespace และ collapse whitespace ภายในที่ไม่ใช่ข้อมูล;
3. case-fold เฉพาะตัวอักษร English;
4. normalize spacing รอบ punctuation ที่รู้จัก เช่น `.`, `(`, `)`, `/`, `-`
   เพื่อการ lookup alias เท่านั้น;
5. เปรียบเทียบกับ alias ที่ระบุใน contract; ไม่ทำ edit distance, semantic
   guessing หรือ AI fuzzy-header matching;
6. ถ้า alias ไม่รู้จัก ให้คง header ไว้ใน `unknownHeaders` และแสดงใน preview;
7. ถ้า alias หนึ่งชนหลาย field หรือ header ซ้ำ ให้เป็น `NEEDS_REVIEW` เว้นแต่
   explicit layout profile ที่ได้รับการยอมรับระบุ mapping ได้แน่ชัด.

### 6.2 Explicit alias examples

```text
givenName:
  - ชื่อ
  - ชื่อคนไข้
  - ชื่อผู้ป่วย
  - first name
  - given name

familyName:
  - นามสกุล
  - สกุล
  - last name
  - family name

combinedNameText:
  - ชื่อ สกุล

organizationCombinedText:
  - โรงพยาบาล หรือ รพสต.
  - โรงพยาบาล หรือ รพ.สต
  - โรงพยาบาล หรือ รพสต

osmCaregiverName:
  - ชื่อผู้ดูแล (อสม.)
  - ชื่อผู้ดูแล(อสม)
  - ผู้ดูแล(อสม.)
  - ผู้ดูแล(อสม)
  - โค้ช
  - โค้ชผู้ดูแล
  - coach

riskFactorText:
  - ปัญหา/ปัจจัยเสี่ยง
```

Alias ที่มี punctuation หรือ spacing ต่างกันถือเป็นรูปแบบที่ explicit ใน
registry ไม่ใช่การลบคำทุกคำเพื่อสร้าง fuzzy match.

### 6.3 Ambiguous duplicate headers

หลาย template มี `เบอร์โทร` สองคอลัมน์: เบอร์ผู้ป่วย และเบอร์ผู้ติดต่อ
ฉุกเฉิน หาก header เหมือนกันทั้งคู่ resolver ห้ามเลือกจากตำแหน่งแบบ generic
โดยไม่มี contract. ทางเลือกที่ปลอดภัยคือ:

- รับ explicit labels เช่น `เบอร์โทร ผู้รับบริการ` และ `เบอร์ผู้ติดต่อ`;
- หรือใช้ named layout profile ที่ตรวจทั้งลำดับและ header context ของ template
  family ที่ได้รับการอนุมัติ;
- ถ้ายังแยกไม่ได้ ให้คงทั้งสองคอลัมน์เป็น ambiguous และไม่ persist ค่าใดลง
  field ที่ผิด.

`โรงพยาบาล หรือ รพสต` เป็น combined organization text ไม่ใช่ alias ที่
resolver แยกเป็น `hospitalName` และ `subHospitalName` โดยเดา separator.

## 7. Excel/CSV normalization findings

ตารางนี้บันทึกสิ่งที่พบจาก shape/type scan และ behavior ที่ต้องป้องกันใน
future adapter. ค่าจริงไม่ถูกนำมาแสดง.

| Hazard | Finding จาก evidence | Classification | Safe normalization/validation rule |
| --- | --- | --- | --- |
| Thai National ID มี hyphens | พบ National ID แบบ text ที่มีขีดในหลาย workbook | **STRONG OPERATIONAL EVIDENCE** | ลบ separator ได้เฉพาะตอน normalize เพื่อ validate length/checksum; เก็บ raw ที่จำเป็นไว้ใน memory เท่านั้น; ถ้าเหลือเลขไม่ครบให้ `INVALID`/`NEEDS_REVIEW` |
| National ID เป็น numeric/scientific notation | พบ identity column ที่เป็น numeric ใน Excel และมี scientific-looking shape ใน CSV evidence | **STRONG OPERATIONAL EVIDENCE** | ห้ามแปลง scientific number เป็นเลข 13 หลักด้วยการเติมศูนย์หรือเดา; ถ้า original digits recover ไม่ได้ให้ `INVALID`/`NEEDS_REVIEW` และให้ผู้ส่งแก้ cell เป็น text |
| Phone leading zero หายจาก Excel | phone cells มีทั้ง numeric และ text; text บางส่วนมี leading zero ขณะที่ numeric cell ไม่สามารถยืนยันศูนย์นำหน้าเดิมได้ | **STRONG OPERATIONAL EVIDENCE** + engineering risk | parse phone เป็น text; ห้ามเติม `0` หรือ `+66` เอง; numeric-looking phone ที่อาจสูญเสียข้อมูลต้อง `NEEDS_REVIEW` |
| Buddhist Era dates | CSV/text และ workbook พบปี พ.ศ. ใน date-like column | **STRONG OPERATIONAL EVIDENCE** | ยอมรับ BE conversion เฉพาะรูปแบบ/locale ที่ contract ระบุและตรวจวันจริง; ห้ามใช้ `01/01/2511` หรือ date fallback |
| Excel date cells | workbook หลายไฟล์เก็บวันเกิดเป็น Excel date cell | **STRONG OPERATIONAL EVIDENCE** | อ่าน serial/date cell เป็น date-only ตาม workbook calendar; ไม่ใช้ timezone timestamp และไม่ตีความ upload time เป็น observation time |
| Text-formatted dates | พบ text date ที่มี slash, ปีอย่างเดียว และข้อความที่มี weekday | **STRONG OPERATIONAL EVIDENCE** | รองรับเฉพาะ grammar ที่ explicit; year-only, weekday-only หรือ text ที่ตีความได้หลายแบบเป็น `INVALID`/`NEEDS_REVIEW` |
| Mixed date formats | family เดียวกันมี text พ.ศ., Excel date, numeric/year-only และรูปแบบข้อความหลายแบบ | **STRONG OPERATIONAL EVIDENCE** | แยก parser ตาม shape แล้วรายงาน source format; ห้ามเลือก locale หรือ day/month โดยเดา |
| Thai month text จาก formatting | ไม่พบเป็น pattern หลักใน scan ที่ใช้ทำ contract แต่เป็น hazard ที่ parser ต้องตรวจ | **ENGINEERING RECOMMENDATION** | ถ้าพบชื่อเดือนภาษาไทยให้ parse ผ่าน explicit month table และ calendar rule; ถ้าไม่ชัดให้ review ไม่ใช่ fallback |
| Blank cells | มี blank จำนวนมาก โดยเฉพาะ optional clinical/contact columns และ formatted blank tails | **STRONG OPERATIONAL EVIDENCE** | blank = missing; ไม่สร้างค่า default; นับ non-empty data rows แยกจาก worksheet dimension |
| `-` as missing | พบ `-` ใน HbA1c, phone/contact และ summary-related columns | **STRONG OPERATIONAL EVIDENCE** | normalize เป็น `null` พร้อมคง diagnostics ว่า source ใช้ missing marker; ห้ามตีความเป็นศูนย์/ข้อความจริง |
| Numeric/text HN | HN ในหลายไฟล์เป็น numeric-looking; extended file มี `HN รพ`; problem file มีทั้ง text/numeric | **STRONG OPERATIONAL EVIDENCE** | HN เป็น string; ห้าม number coercion, padding หรือ global uniqueness assumption |
| Unexpected whitespace | ไม่ใช่ pattern หลักที่ยืนยันจาก sample scan แต่ whitespace รอบ header/value เป็น input risk ปกติ | **ENGINEERING RECOMMENDATION** | trim outer whitespace, normalize line breaks ตาม field; ไม่ลบ whitespace ภายในชื่อ/ที่อยู่โดยเดา |
| Column order differences | มีทั้ง header เริ่มด้วย sequence, ไม่มี sequence, combined Hospital และ header row ที่ไม่ใช่ row 1 | **STRONG OPERATIONAL EVIDENCE** | alias resolver ไม่ผูก column index; header row detection ต้อง bounded และ explicit; header row ที่ ambiguous เป็น review |
| Extra columns | พบ 27–29 column main variants และ 36-column extended variant; มี trailing blank/header, PID และ visit series | **STRONG OPERATIONAL EVIDENCE** | unknown/extended columns ต้อง visible ใน preview; ห้ามทิ้งเงียบและห้าม persist generic JSON |
| Missing optional columns | บางไฟล์ไม่มี `รพ.สต.`, emergency fields, caregiver หรือ HN; combined field ใช้แทน split fields | **STRONG OPERATIONAL EVIDENCE** | แยก missing header ออกจาก missing value; requiredness ต้องมาจาก contract ไม่ใช่ file frequency |
| Duplicate rows / identities | problem workbook มี duplicate National ID evidence; exact full-row duplicate ไม่ใช่สิ่งที่ยืนยันจากทุก source | **STRONG OPERATIONAL EVIDENCE** | detect duplicate normalized identity และ exact row fingerprint; ไม่เลือก row ใดโดยอัตโนมัติ |
| Height unit variation | main roster ใช้ `ส่วนสูง`; extended roster ระบุ `(เมตร)` ขณะที่ source อื่นใช้ cm-like label | **STRONG OPERATIONAL EVIDENCE** | ต้องเก็บ source unit/flag; ห้ามคูณ 100 หรือแปลงโดยไม่มี decision |
| Repeated visit columns | extended roster มี visit dates และ measurement columns หมายเลขครั้ง | **STRONG OPERATIONAL EVIDENCE** | ไม่ map เป็น fixed six Follow-up rows; ต้องมี row/measurement timing contract ก่อน |
| Invalid workbook container | มีไฟล์ `.xlsx` บางรายการที่เปิดเป็น valid workbook ไม่ได้ | **STRONG OPERATIONAL EVIDENCE** | reject เป็น safe file validation error; ไม่พยายามอ่าน binary ด้วย fallback ที่ไม่ชัดเจน |

### 7.1 Missing data rule

ค่าที่หายต้องยังหายอยู่:

```text
blank / explicit missing marker → null / missing
ambiguous or lossy cell       → review state
unsupported meaning           → requirement-gated state
```

ห้ามแนะนำหรือสร้าง authoritative fallback เช่น:

```text
01/01/2511
unknown gender
synthetic HN
```

## 8. Current architecture mapping

### 8.1 Confirmed domain boundaries

**CONFIRMED ARCHITECTURE** จาก ADR และ current implementation:

- `Person` เป็น real-human identity; `User` เป็น account/credential/role
  lifecycle. Person/User ห้ามซ้ำเพราะ roster มาจากหลาย Hospital หรือมีหลาย role.
- National ID ใช้ผ่าน server-side identity boundary/HMAC; raw National ID ไม่ใช่
  `PatientProfile` field และไม่ใช่ข้อมูลที่ต้องแสดงใน preview.
- `PatientHospitalRelationship` เป็น owner ของ Hospital-local HN และเป็น
  boundary ของ patient care access; Hospital hierarchy ไม่ขยาย authority.
- `PatientOsmAssignment` ต้องผูก exact relationship กับ active OSM UUID;
  `OsmHospitalRelationship` อย่างเดียวไม่ใช่ assigned-patient access.
- Patient provisioning/activation แยกกัน; import ห้าม import password, token หรือ
  credential และห้ามทำให้ Patient ACTIVE โดยการเดา.
- Screening, Baseline, Follow-up, Program และ Final เป็น domain แยกกัน;
  proximity ของคอลัมน์ใน roster ไม่รวม ownership.
- หลาย-record mutation ที่เป็น business operation ต้องผ่าน application service
  และ transaction; adapter ห้ามเขียน Prisma โดยตรง.

### 8.2 Field-to-domain mapping classification

| Field / family | Classification | Current boundary | Mapping decision for Phase 16A |
| --- | --- | --- | --- |
| `nationalId` | **SAFE CURRENT DOMAIN** | `Person` ผ่าน identity service / identity hash | ใช้ resolve identity เท่านั้น; raw value server-only; ไม่เพิ่ม profile column |
| `givenName`, `familyName` | **SAFE CURRENT DOMAIN** | `Person.givenName`, `Person.familyName` | ใช้ current provisioning conflict rules; ห้ามสร้าง Person ซ้ำ |
| `combinedNameText` | **MUST NOT MAP HERE** | ไม่มี safe split identity boundary | เก็บเป็น review candidate เท่านั้น; ห้ามเดา given/family name |
| `hospitalNumber` | **SAFE CURRENT DOMAIN** | `PatientHospitalRelationship.hospitalNumber` | map ได้ใน current provisioning path; optional และไม่สรุป uniqueness |
| `dateOfBirth`, `gender` | **PROVISIONAL CURRENT DOMAIN** | nullable `PatientProfile` columns/read projection | schema รองรับ แต่ ownership/mutation/import authority ยังไม่ปิด; ไม่ถือเป็น permanent Person decision |
| `phoneNumber` | **PROVISIONAL CURRENT DOMAIN** | nullable `PatientProfile.phoneNumber` | parse/preview ได้; persistence จาก import ต้องรอ profile ownership/import mutation contract |
| `addressText` | **PROVISIONAL CURRENT DOMAIN** | nullable flattened `PatientProfile.addressText` | ไม่รวม structured address โดยเดา; import mutation ยังไม่มี |
| `houseNumber` ถึง `postalCode` | **NO CURRENT DOMAIN** | ไม่มี structured PatientProfile columns | เก็บ typed transient candidate ได้ แต่ห้าม flatten/เพิ่ม JSON เพื่อหลบ decision |
| `emergencyContactName`, `emergencyContactPhone` | **PROVISIONAL CURRENT DOMAIN** | nullable `PatientProfile` columns | current read support มี แต่ relationship/owner/correction/import semantics ยัง gated |
| `emergencyContactRelationship` | **NO CURRENT DOMAIN** | ไม่มี current column | preserve as gated candidate; ไม่ทิ้งเงียบ |
| `hospitalName`, `subHospitalName` | **MUST NOT MAP HERE** | target Hospital มาจาก server-authorized scope | text เป็น reconciliation/display evidence เท่านั้น; ไม่ map เป็น `hospitalId` หรือ hierarchy |
| `organizationCombinedText` | **MUST NOT MAP HERE** | ไม่มี current combined Hospital/รพ.สต. authority | เก็บ source text เพื่อ review; ห้าม split หรือขยาย tenant scope |
| `osmCaregiverName` | **REQUIREMENT-GATED** | future candidate คือ `PatientOsmAssignment` | ห้าม map text → UUID โดย fuzzy match; ต้อง Decision 4 + exact server lookup + confirmation |
| `weight`, `waistCircumference`, `bloodSugar` | **PROVISIONAL CURRENT DOMAIN** | Baseline/Follow-up/Final raw fieldsบางส่วน | ห้าม map ลง Profile; import destination, source, effective date และ meaning รอ Decision 1/5 |
| `height`, `hba1c` | **NO CURRENT DOMAIN** | ไม่มี current persistence source | parse/validate shape ได้ แต่ full persistence ต้องรอ clinical contract; ไม่เพิ่ม schema ใน 16A |
| `diabetesClassification` | **MUST NOT MAP HERE** | ไม่มี accepted enum/domain | ห้ามสร้าง enum, update Screening, create Program หรือ change workflow จาก label |
| `bloodPressureText`, `pulseRate`, `bmi`, `dtxReading` | **REQUIREMENT-GATED** | บาง related raw fieldsมีเฉพาะ BP components/DTX-like fields | ไม่ split/derive/normalize official meaning จาก source label โดยเดา |
| `riskFactorText` | **REQUIREMENT-GATED** | ไม่มี current authoritative clinical/risk-note domain | ไม่แปลงเป็น diagnosis, Screening result หรือ workflow side effect |
| `externalPatientId` / `PID` | **NO CURRENT DOMAIN** | ไม่มี current model field | ไม่ alias เป็น National ID/HN; ต้อง business decision และ ownership ก่อน |
| `ageAtRoster` | **MUST NOT MAP HERE** | age เป็น derived/time-dependent, ไม่ใช่ stable identity | ใช้ตรวจ discrepancy กับ DOB ได้เท่านั้น; ไม่ persist เป็น patient fact |
| `sourceSequenceNumber` | **MUST NOT MAP HERE** | ingestion row metadata | เก็บ source row number/sequence ใน transient preview เพื่อ trace error เท่านั้น |
| repeated visit/summary series | **MUST NOT MAP HERE** | ไม่มี generic observation domain; Follow-up ต้องมี own provenance/nonce/round | ไม่สร้าง Follow-up, Baseline, Final หรือ EAV จาก column order |

### 8.3 Boundary-by-boundary persistence decision

| Current boundary | สิ่งที่ import อาจส่งให้ service ในอนาคต | สิ่งที่ห้ามทำจาก roster โดยอัตโนมัติ |
| --- | --- | --- |
| `Person` / `User(PATIENT)` | identity resolution + current patient provisioning input | ไม่สร้าง duplicate User/Person, ไม่ import password/activation, ไม่เปลี่ยน role อื่น |
| `PatientProfile` | explicit profile mutation input หลัง ownership/edit authority ถูกยืนยัน | ไม่ย้าย HN, clinical values, OSM, Hospital หรือ structured address มาไว้ใน Profile |
| `PatientHospitalRelationship` | server-selected Hospital + optional string HN | ไม่ใช้ Hospital text/PID/geography เป็น tenant ID; ไม่ทำ global HN uniqueness |
| `PatientOsmAssignment` | exact OSM UUID หลัง lookup/confirmation ตาม Decision 4 | ไม่ auto-assign จากชื่อ, ไม่รับ OSM ID จาก workbook เป็น authority |
| `PatientBaseline` | future candidate เฉพาะเมื่อ Decision 1 ระบุ initial-state meaning และ Decision 5 ระบุ date semantics | ไม่ใช้คำว่า “initial-looking” หรือ column order เป็นเหตุผลสร้าง Baseline; ไม่ overwrite one-per-relationship record |
| `ScreeningAssessment` | ไม่มี direct import mapping ใน 16A | ไม่แปลง `กลุ่มเสี่ยง`/`เบาหวาน` เป็น screening result หรือ score |
| `PatientProgram` | ไม่มี direct import mapping | ไม่สร้าง/activate Program, cohort หรือ Goal จาก roster |
| `PatientFollowup` | future dated observation only if explicit clinical/import contract | ไม่แปลง repeated visit columns เป็น Follow-up rounds และไม่ใช้ upload time เป็น recordedAt meaning |
| `PatientFinalAssessment` | ไม่มี direct import mapping | ไม่ใช้ roster values เป็น Final/After หรือ infer completion/outcome |

## 9. Five blocking customer decisions

Phase 16A ไม่ตอบแทนลูกค้า คำถามด้านล่างเป็น entry condition ของ full-field
persistence ใน Phase 16B.

### Decision 1 — Meaning of clinical measurements

ต้องตัดสินใจว่า `weight`, `height`, `waist circumference`, `blood sugar` และ
`HbA1c` ใน roster หมายถึงข้อใด:

```text
A. Initial values before entering the DEMI program
B. Latest known values as of preparation/submission of the roster
C. Latest available values from the medical record, potentially measured on different dates
D. Another explicitly defined meaning
```

ผลทางสถาปัตยกรรมของคำตอบ:

| คำตอบ | ผลกระทบที่ต้องออกแบบต่อ | สิ่งที่ยังห้ามสรุป |
| --- | --- | --- |
| A | อาจเป็น candidate ของ relationship-owned initial-state/Baseline flow แต่ต้องกำหนดว่า import สร้าง Baseline หรือเพียงส่ง candidate, ผู้บันทึก, source และ correction อย่างไร | ห้ามถือว่า column `initial` หรือไฟล์ชื่อ roster ทำให้เป็น Baseline โดยอัตโนมัติ |
| B | ต้องมี current/latest observation contract, source, effective date และ correction/replace semantics; ไม่ใช่ PatientProfile โดยอัตโนมัติ | ห้ามใช้ Baseline เป็น current-health snapshot โดยไม่มี decision |
| C | ต้องรองรับ measurement-level provenance/date หรือ typed clinical observation source เพราะแต่ละค่าคนละวันได้ | ห้ามใช้ shared roster date หรือ upload time แทนทุกค่า |
| D | ต้องบันทึกนิยาม, owner, unit, source, date, validation, visibility และ destination ให้ชัดก่อน schema/service | ห้ามเริ่มจากการสร้าง generic metadata หรือ enum |

คำตอบนี้ต้องแยก **ความหมายของค่า** ออกจาก **วันที่มีผล** ใน Decision 5.

### Decision 2 — Meaning of “Diabetes Type / Risk Group”

ถามลูกค้าตามข้อความนี้:

> What does the “ประเภทเบาหวาน / กลุ่มเสี่ยง หรือ เบาหวาน” field represent in DEMI, and does it affect workflow/reporting or is it informational only?

หลักฐานปัจจุบันมีเพียง label ที่คล้าย `กลุ่มเสี่ยง` และ `เบาหวาน` ไม่พิสูจน์ว่า
เป็น:

- clinical diagnosis;
- program cohort classification;
- screening classification;
- operational/reporting label.

ผลทางสถาปัตยกรรม:

- diagnosis ต้องมี clinical authority, vocabulary/version, source, effective
  date, correction และ visibility;
- cohort classification ต้องเป็น program/cohort concern ไม่ใช่ Person/Profile
  enum โดยอัตโนมัติ;
- screening classification ต้องผูก source/version ของ Screening และไม่ควรถูก
  สร้างจาก label ใน roster เพียงอย่างเดียว;
- informational-only อาจแสดงเป็น gated source label หรือ candidate แต่ต้องไม่
  grant workflow, assignment, diagnosis หรือ report authority.

### Decision 3 — Hospital vs รพ.สต. ownership

ลูกค้าต้องยืนยัน:

1. องค์กรใดเป็นเจ้าของ `PatientHospitalRelationship`;
2. `รพ.สต.` เป็น DEMI Hospital/tenant unit เองหรือไม่;
3. ถ้าไม่ใช่ เป็น parent/network organization แบบใด;
4. Hospital hierarchy มีผลต่อ visibility หรือ management อย่างไร;
5. submitting organization เป็น authoritative relationship หรือ source text
   ใน workbook มีอำนาจมากกว่า.

ผลทางสถาปัตยกรรม:

- จนกว่าจะตอบ ผู้ส่งเลือกได้เพียง target Hospital ที่ server resolve และ
  authorize แล้ว;
- `โรงพยาบาล`/`รพ.สต.` ใน workbook เป็น text สำหรับ reconciliation เท่านั้น;
- หากต้องมี parent/network scope ต้องมี decision/ADR/policy ใหม่ ไม่ใช้ legacy
  hierarchy หรือ spreadsheet text เป็น authorization bypass;
- mismatch ระหว่าง target scope กับ file text ต้องหยุดหรือให้คนตรวจ ไม่ map
  organization name เป็น tenant UUID.

### Decision 4 — Meaning of OSM / Coach column

ถามลูกค้าตามข้อความนี้:

> Does “ชื่อผู้ดูแล (อสม.) / โค้ช” identify the currently responsible OSM for that Patient, such that importing the roster should establish a Patient–OSM assignment?

ถ้าคำตอบคือ YES พฤติกรรมในอนาคตที่เสนอคือ:

```text
Excel caregiver text
    ↓
server-side OSM lookup within authorized Hospital scope
    ↓
exact unique match → candidate assignment
ambiguous match    → NEEDS_REVIEW
not found          → OSM_NOT_FOUND
    ↓
human confirmation
    ↓
PatientOsmAssignment
```

การ match ต้องใช้ explicit exact identity/organization-scoped rule ที่ business
ยอมรับแล้วเท่านั้น ห้าม auto-assign จาก fuzzy similarity. Fuzzy matching หาก
อนุญาตในอนาคตทำได้เพียงสร้าง review candidate และห้ามสร้าง assignment.

ถ้าคำตอบคือ NO ค่าใน column ต้องไม่กลายเป็น assignment; อาจเป็น informational
source field ใน transient preview ได้เมื่อมี governance รองรับ แต่ยังห้ามเพิ่ม
generic patient metadata เพื่อเก็บไว้ถาวร.

### Decision 5 — Effective date of clinical data

ถามลูกค้าตามข้อความนี้:

> Can the health values contained in one submitted roster be treated as values effective “as of” one shared roster date?

ถ้า YES ให้เสนอ field ระดับ upload ในอนาคต:

```text
ข้อมูลสุขภาพในไฟล์นี้เป็นข้อมูล ณ วันที่:
[ date ]
```

วันที่ต้องเป็น user input ที่ชัดเจนหรือ authoritative source metadata และต้อง
ถูกแยกจาก upload timestamp. ถ้า NO future input ต้องรองรับ row-level หรือ
measurement-level dates/observation provenance. ห้ามใช้เวลารับไฟล์เป็น clinical
measurement date โดยเงียบ ๆ.

## 10. Requirement-gated parsing strategy

### 10.1 Five separate stages

**ENGINEERING RECOMMENDATION:** adapter และ service ในอนาคตแยกหน้าที่ดังนี้:

1. **PARSE** — อ่าน sheet/row/cell และตรวจ container/file size;
2. **NORMALIZE** — canonicalize header, missing marker, text, numeric/date shape;
3. **VALIDATE** — ตรวจ structural validity, required current identity fields,
   duplicate header, duplicate row และ lossiness;
4. **CLASSIFY** — map field ไป current domain, provisional domain หรือ
   requirement-gated state และสร้าง preview diagnostics;
5. **PERSIST** — เรียก domain service ที่ได้รับอนุมัติเท่านั้น.

ตัวอย่าง state ที่ถูกต้อง:

```text
PARSED + KNOWN DOMAIN
PARSED + REQUIREMENT-GATED
PARSED + UNKNOWN HEADER
PARSED + LOSSY/AMBIGUOUS VALUE
```

Requirement-gated field ต้องถูกคงไว้ใน transient candidate/preview นานพอให้
ผู้ส่งเห็นและตัดสินใจได้ แต่ห้ามถูกทิ้งเงียบ และห้าม persist ลง invented domain
เพื่อให้ import ดูเหมือนสำเร็จ.

### 10.2 Proposed future import pipeline

```text
Workbook
  ↓
Header normalization
  ↓
Explicit alias resolution
  ↓
Canonical Patient Import Row
  ↓
Value normalization
  ↓
Structural validation
  ↓
Domain classification
  ↓
Preview / reconciliation
  ↓
Human confirmation
  ↓
Domain services
  ↓
Per-patient transaction
```

Adapter เป็น ingestion boundary เท่านั้นและห้าม import Prisma, query database,
เลือก actor, เลือก tenant หรือเขียน record โดยตรง. Application service ต้อง
re-authorize scope และ resolve current state ซ้ำก่อน mutation.

## 11. Proposed preview / reconciliation vocabulary

คำต่อไปนี้เป็น bounded future vocabulary ไม่ใช่ enum ที่ต้องเพิ่มใน Phase 16A:

| State | Auto-resolve ได้หรือไม่ | ความหมาย/การดำเนินการ |
| --- | --- | --- |
| `READY` | ได้ เมื่อ identity/structure/scope พร้อมและไม่มี gated field ที่ขัดขวาง | แสดงว่า candidate พร้อมให้ human confirm; ไม่ใช่ persistence success |
| `ALREADY_EXISTS` | ได้เป็น idempotent no-op candidate | exact identity + target relationship มีอยู่แล้ว; recheck server-side |
| `DUPLICATE_IN_FILE` | ตรวจพบอัตโนมัติ แต่แก้เองไม่ได้ | normalized identity ซ้ำในไฟล์; คนต้องเลือก/แก้ source |
| `INVALID` | ตรวจพบ structural invalid ได้ | value/date/header/file shape ผิด; แก้ไฟล์หรือข้อมูล |
| `CONFLICT` | ตรวจพบชนกับ authoritative state ได้ | ชื่อ/HN/account/relationship/identity state ขัดแย้ง; ต้อง review |
| `NEEDS_REVIEW` | ไม่ควร auto-resolve | ambiguous alias, lossy numeric value หรือ uncertain reconciliation |
| `HOSPITAL_MISMATCH` | ตรวจพบจาก scope/text ได้ แต่ไม่แก้เอง | source organization ไม่สอดคล้อง target; ห้าม map เป็น tenant ใหม่ |
| `OSM_NOT_FOUND` | ตรวจ exact lookup ได้ แต่ต้องคนตัดสินใจ | caregiver text ไม่มี active unique OSM ใน authorized scope |
| `OSM_AMBIGUOUS` | ตรวจพบ candidate ได้ แต่ต้องคนตัดสินใจ | มีหลาย exact/approved candidates หรือ alias collision |
| `UNSUPPORTED_REQUIREMENT` | ไม่ได้ | field มีความหมาย/ปลายทางที่ยังไม่มี approved contract เช่น HbA1c/PID/classification |

Unknown headers ต้องปรากฏใน preview/reconciliation และควรถูกผูกกับ
`UNSUPPORTED_REQUIREMENT` หรือ diagnostic ที่เทียบเท่า ไม่ใช่ discard silently.

## 12. Security, privacy และ data-integrity requirements

กติกาที่มีอยู่ยัง binding และต้องถูกยกไป future importer:

- actor ต้อง resolve จาก server-side authenticated context;
- target Hospital ที่ browser ส่งมาเป็นเพียง request input และต้อง revalidate
  membership/status/scope ฝั่ง server;
- browser-selected Hospital และข้อความ Hospital ใน workbook ไม่ใช่ authority;
- raw National ID ใช้เฉพาะ identity boundary ที่จำเป็น; preview แสดง masked
  identity และไม่ส่ง raw ID หรือ identity hash;
- identity lookup ใช้ current identity service; ห้ามใช้ชื่อ วันเกิด โทร หรือ HN
  เป็น weak identity match;
- ห้ามสร้าง Person/User ซ้ำ และต้อง preserve existing User roles;
- patient provisioning ต้อง idempotent และใช้ existing relationship constraints;
- OSM assignment ห้ามรับรองโดย spreadsheet text; ต้อง exact server lookup และ
  assignment policy;
- ห้าม import credential, password, activation token, provider subject หรือ
  predictable password;
- audit/log ห้ามใส่ raw patient data หรือ raw clinical payload เว้นแต่ future
  governance requirement อนุมัติโดยชัดเจน;
- errors ฝั่ง client ต้องเป็น safe category ไม่ส่ง SQL, Prisma, stack trace,
  filesystem path หรือ provider details;
- mutation ที่สร้าง Person/User/profile/relationship/assignment ตาม business
  invariant ต้องอยู่ใน application service และ transaction ที่เหมาะสม;
- preview/confirm binding ต้องผูก actor, target scope และ exact file bytes เพื่อ
  ป้องกัน stale/mismatched confirmation แบบ current importer.

## 13. Compatibility test matrix (future, synthetic only)

ยังไม่สร้าง fixture ใน Phase 16A. เมื่อเริ่ม implementation ให้สร้าง synthetic
fixtures ที่มีเฉพาะ placeholder values และตรวจทั้ง happy/error paths:

| Synthetic fixture | โครงสร้างที่ต้องครอบคลุม |
| --- | --- |
| `synthetic-island-style-workbook.xlsx` | 27-column/28-column sheets, separate/absent subHospital, Excel date cells, numeric identity/phone shapes, blank optional cells |
| `synthetic-gabung-style.csv` | sequence column, `ชื่อคนไข้`, long diabetes/risk header, coach alias, CSV UTF-8 BOM |
| `synthetic-template-full.csv` | separate `โรงพยาบาล` + `รพ.สต.`, structured address, duplicate generic phone context, `-` missing marker |
| `synthetic-template-combined.csv` | combined `โรงพยาบาล หรือ รพสต`, 27 columns, no split subHospital |
| `synthetic-demi-roster.xlsx` | Excel date cells, numeric/text HN, caregiver aliases, optional blank clinical fields |
| `synthetic-extended-roster.xlsx` | 36-column shape, `PID`, `HN รพ`, `A1C`, `BP`, `P`, numbered service dates and repeated measurements |
| `synthetic-current-minimal.xlsx` | current rewritten four-column contract: National ID, given name, family name, optional HN |

Edge-case rows/fixtures:

- National ID with hyphens;
- National ID scientific notation or unrecoverable numeric cell;
- phone numeric cell that may have lost leading zero;
- Buddhist Era date;
- Excel date cell;
- text date and mixed date format;
- explicit header aliases and different column order;
- duplicate alias/header and unknown extra column;
- blank clinical values and `-` markers;
- numeric/text HN;
- duplicate patient identity and duplicate full row in same file;
- existing Patient in target Hospital;
- existing Patient in another Hospital;
- OSM not found and OSM ambiguous;
- Hospital mismatch;
- missing optional column;
- malformed workbook container;
- over-limit file/rows/columns and multi-sheet handling.

Assertions ต้องตรวจ behavior เช่น canonical output, state, safe preview และ
absence of persistence side effects ไม่ผูกกับ internal implementation detail.

## 14. Current Excel adapter gap analysis

ตรวจจาก [`excel-patient-import-adapter.ts`](../../src/modules/patient-provisioning/adapters/excel-patient-import-adapter.ts), service,
transport binding และ current tests ได้ผลดังนี้:

| Concern | Current implementation | Gap/status |
| --- | --- | --- |
| Supported fields | `nationalId`, `givenName`, `familyName`, optional `hospitalNumber` | **CONFIRMED COMPATIBILITY GAP:** ไม่รองรับ full roster fields |
| Header aliases | explicit map ขนาดเล็ก: Thai/English National ID, first/given, last/family, HN | **CONFIRMED COMPATIBILITY GAP:** ไม่รู้จัก `ชื่อคนไข้`, `ชื่อผู้ป่วย`, `สกุล`, address/clinical/caregiver aliases |
| Header normalization | ตัด BOM/trim/lowercase/collapse spaces | **CURRENT IMPLEMENTATION LIMIT:** ยังไม่มี punctuation variants, duplicate context, unknown-header preview |
| Max columns | `MAX_PATIENT_IMPORT_COLUMNS = 16`; header row เกิน limit ถูก reject | **CONFIRMED GAP:** evidence มี 27–29 และ 36 columns |
| Max rows | `MAX_PATIENT_IMPORT_ROWS = 500` | limit เองยังเป็น current constraint; evidence non-empty data ส่วนใหญ่ต่ำกว่า แต่บาง workbook มี formatted worksheet dimension ถึงประมาณ 999/1000 rows |
| Row counting | ใช้ `worksheet.rowCount - 1`, ไม่ได้กำหนด non-empty row semantics | **COMPATIBILITY RISK:** formatted blank tail อาจถูกนับเกิน limit; V2 ต้องตัดสินใจและทดสอบ explicit |
| Max file size | 5 MB ใน adapter; Next Server Action body limit 6 MB | **CURRENT IMPLEMENTATION LIMIT:** future operational policy ต้องยืนยันอีกครั้ง |
| File formats | `.xlsx` เท่านั้น ผ่าน ExcelJS; invalid workbook ถูก reject | **CONFIRMED GAP:** evidence family มี CSV; malformed `.xlsx` rejection path ยังต้องคงไว้ |
| Worksheet handling | อ่าน `workbook.worksheets[0]` เท่านั้น; header ต้องอยู่ row 1 | **CONFIRMED GAP:** evidence มี multi-sheet และ header row ที่ไม่ใช่ row 1 |
| Cell normalization | ใช้ `cell.text.trim()`; ไม่มี explicit BE/date/numeric/scientific/phone-loss validation | **CONFIRMED GAP:** ไม่ปลอดภัยต่อ spreadsheet hazards ที่พบ |
| Masking | `identityDisplay` mask National ID; preview แสดงชื่อ/HN ที่ normalized | **CURRENT SECURITY BEHAVIOR:** ห้ามลด boundary นี้; future preview ต้อง minimize PII เพิ่มตาม need |
| Unknown columns | unknown headers ถูกข้าม (`continue`) และไม่คืน diagnostic | **CONFIRMED GAP:** Phase 16 contract ต้องให้ unknown visible/reconcilable |
| Preview/confirm binding | SHA-256 exact file bytes + HMAC actor/Hospital/fingerprint; confirm rehashes/reparses | **SAFE CURRENT DOMAIN:** preserve and extend to canonical header/shape contract |
| Duplicate handling | duplicate normalized identity ใน file → `DUPLICATE_IN_FILE`; existing identity/relationship → `READY`/`ALREADY_EXISTS`/`CONFLICT` | **PARTIAL SUPPORT:** add bounded future states, no auto resolution of gated fields |
| Hospital resolution | target Hospital comes from authorized server scope; file Hospital text ignored | **CONFIRMED ARCHITECTURE:** preserve; do not accept source name as tenant ID |
| Authorization | preview/bulk requires active direct Hospital scope; OSM bulk is denied; service rechecks DB | **CONFIRMED ARCHITECTURE/CURRENT IMPLEMENTATION:** preserve fail-closed behavior |
| Persistence | adapter parses candidates; service provisions one row at a time through serializable transaction; errors return partial summary | **SAFE CURRENT DOMAIN:** future full row must call domain services, never adapter-to-Prisma |
| Per-row transaction | sequential `importPatientProvisioning` call; each patient operation has own transaction | **CURRENT IMPLEMENTATION:** preserve unless a new approved batch invariant changes it |
| Clinical/profile persistence | none in current importer; import is provisioning-only | **CONFIRMED SAFETY BOUNDARY:** do not expand before five decisions |
| OSM assignment | none in current importer | **REQUIREMENT-GATED:** Decision 4 required; no fuzzy auto-assignment |

ดังนั้น Phase 16A **ไม่แก้ gap เหล่านี้**. Gap เหล่านี้เป็น input สำหรับ Phase
16B Import Adapter V2 design/implementation หลัง decision gate.

## 15. Proposed Phase 16B entry condition

### 15.1 CAN PROCEED BEFORE CUSTOMER ANSWERS

งานต่อไปนี้ทำได้โดยไม่ persist full dataset:

- header alias contract และ explicit layout profiles;
- workbook normalization design;
- parser compatibility design สำหรับ `.xlsx`, CSV และ multi-sheet policy;
- structural validation (BOM, blank/`-`, duplicate headers, size/row/column
  limits, malformed container);
- synthetic compatibility fixtures และ privacy-safe test helpers;
- preview UX design สำหรับ unknown/ambiguous/requirement-gated fields;
- canonical row type design และ transient diagnostics;
- masking/redaction contract และ exact file/actor/Hospital preview binding;
- duplicate detection/reconciliation design ที่ไม่สร้าง invented domain.

### 15.2 MUST WAIT FOR CUSTOMER ANSWERS

ห้ามเริ่ม full persistence work จนกว่าห้าคำตอบจะถูกบันทึกและได้รับการยอมรับ:

- clinical persistence destination และ meaning ของค่าคลินิก;
- diabetes/risk domain semantics และ authority;
- Hospital/รพ.สต. ownership/hierarchy/visibility semantics;
- automatic/confirmed OSM assignment semantics;
- clinical effective-date / observation-date persistence semantics.

**Exact gate:** Phase 16B เริ่มได้เมื่อ Decision 1–5 มีคำตอบที่ระบุ owner,
allowed values/units เมื่อจำเป็น, source/provenance, effective date, correction,
visibility, authorization และ persistence destination แล้ว และคำตอบนั้นไม่
ขัดกับ ADR/current architecture. ถ้าคำตอบยังไม่ครบ ให้ทำเฉพาะ parse,
normalize, validate, classify, preview และ synthetic compatibility work.

## 16. Explicit non-goals

Phase 16A ไม่ทำสิ่งต่อไปนี้:

- แก้ `prisma/schema.prisma` หรือสร้าง migration;
- เพิ่ม PatientProfile mutation semantics;
- เปลี่ยน Baseline semantics หรือสร้าง clinical observation model;
- สร้าง diabetes/risk enum;
- สร้าง Hospital hierarchy authorization หรือ import tenant จากชื่อ;
- implement automatic OSM assignment;
- เพิ่ม generic metadata JSON, EAV หรือ custom-field store;
- implement background worker/queue;
- redesign authentication, activation หรือ patient status;
- implement full Import Adapter V2;
- commit real customer Patient data หรือ extracted patient rows;
- rewrite historical phase documents ให้เหมือนหลักฐานใหม่นี้มีอยู่ตั้งแต่ต้น.

## 17. Contradictions, limitations และ unresolved questions

### 17.1 Contradictions discovered

1. Historical Phase 15E.3 ระบุ starting HEAD เก่า ขณะที่ current main/demidemo
   อยู่ที่ `b0efb392...`; ใช้ current repository เป็น authority และไม่แก้
   historical closeout.
2. Phase 5A บางข้อความบรรยาย schema ก่อน PatientProfile และ relationship ถูก
   implement; current schema/Phase 10/15 implementation supersede statement นั้น
   สำหรับ current mapping.
3. Legacy/roster family มีทั้งแยก Hospital/รพ.สต. และ combined field รวมทั้ง
   workbook ที่ไม่มี subHospital; จึงยังสรุป ownership/hierarchy จาก header ไม่ได้.
4. `เบอร์โทร` ซ้ำใน template family แต่บาง variant มี label ที่ contextual กว่า;
   alias-only resolution จึงอาจ ambiguous.
5. `ค่า DTX`, `ค่าน้ำตาลในเลือด`, `A1C/HbA1c`, `BMI` และ repeated visit fields
   ปรากฏใน operational evidence แต่ Phase 15D.2/current rewrite ยังไม่รับรอง
   ว่าเป็น interchangeable official domains.

### 17.2 Inspection limitations

- บาง legacy workbook มี invalid container และบาง workbook มี formatted blank
  tail; รายงานนี้จึงยึด headers, non-empty shape และ cell type ที่อ่านได้ ไม่
  พยายามกู้ binary ที่เสียหาย.
- การอ่าน workbook จริงไม่เปิดเผยค่า rows และไม่ได้ใช้เป็น fixture. ความหมาย
  ทางธุรกิจของค่าที่มีอยู่จริงยังไม่ถูกยืนยันจากตัวไฟล์เพียงอย่างเดียว.
- Phase 16A ไม่ได้เรียก customer/clinical owner เพื่อให้คำตอบห้าข้อ; จึงตั้งใจ
  ปิดเป็น handoff gate ไม่ใช่ implementation approval.

## 18. Verification record for this documentation phase

ตรวจแบบ read-only ก่อน/หลังการเขียน:

- current `git status`, current HEAD, branch และ `main` pointer;
- UTF-8 reads ของ instructions, CONTEXT, ADRs, Phase 5/10/15 contracts;
- Prisma schema และ relevant service/policy/adapter/query boundaries;
- legacy checkout HEAD/status และ evidence filenames/headers/shapes;
- real workbook Desktop/legacy copiesแบบ read-only;
- final diff, Thai encoding, accidental PII patterns และ file scope.

เนื่องจาก Phase 16A แตะเฉพาะ Markdown จึงไม่ต้องรัน source lint/typecheck/test
ตาม repository rule; ให้รันเฉพาะ Markdown/link checks หาก repository มี script
สำหรับงานนี้ และรายงานผลใน completion handoff.
