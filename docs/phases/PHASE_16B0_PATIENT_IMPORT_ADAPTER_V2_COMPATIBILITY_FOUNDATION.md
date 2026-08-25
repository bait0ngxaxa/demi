# DEMI Phase 16B.0 — Patient Import Adapter V2 Compatibility Foundation

- **Status:** Implemented compatibility foundation
- **Starting HEAD:** `4bb6a35966ce7f7319577defaf59e9c7a6ea3ff4`
- **Implementation commit:** see Git history for the Phase 16B.0 change; this document intentionally does not embed a self-referential amended SHA
- **Authoritative contract:** [Phase 16A Canonical Patient Import Contract](./PHASE_16A_CANONICAL_PATIENT_IMPORT_CONTRACT.md)

เอกสารนี้เป็น implementation handoff ของ Phase 16B.0 เท่านั้น ไม่ตอบแทน
customer decisions 1–5 และไม่เพิ่ม persistence domain สำหรับข้อมูลที่ยัง
requirement-gated

## 1. Outcome and scope

Phase 16B.0 ทำให้ `.xlsx` adapter เข้าใจโครงสร้าง patient-roster ที่กว้างขึ้น
โดยแยก ingestion representation ออกจาก `ProvisionPatientInput`:

```text
Workbook
  ↓
bounded worksheet/header discovery
  ↓
explicit alias resolution
  ↓
CanonicalPatientImportRow (transient)
  ↓
value normalization
  ↓
structural validation and diagnostics
  ↓
preview/reconciliation
  ↓
existing PatientProvisioningService for current core only
```

ส่วนที่ implement แล้ว:

- รองรับ known operational workbook shapes ที่มี 4 ถึงประมาณ 36 คอลัมน์ และ
  bounded limit 64 คอลัมน์;
- ค้นหา worksheet และ header row แบบ deterministic ภายในขอบเขตที่กำหนด;
- ใช้ explicit aliases และ explicit repeated-column patterns เท่านั้น;
- คงค่าที่ parse ได้ของ field requirement-gated ไว้ใน transient row และแสดง
  file/row diagnostics ใน preview;
- คง `.xlsx` เป็น runtime format เดียว และคง 5 MB / 500 non-empty patient rows;
- ส่งเฉพาะ National ID, given name, family name และ HN ให้ provisioning service;
- ไม่แก้ `prisma/schema.prisma`, migration, authentication, authorization หรือ
  current Patient persistence semantics.

นอกขอบเขตตาม Phase 16A ยังคงเป็น full profile mutation, clinical persistence,
Baseline/Follow-up/Screening/Program creation, Hospital hierarchy authority,
OSM assignment และ customer decisions 1–5

## 1.1 Corrective privacy and compatibility pass

ใน reviewed Phase 16B.0 tip มีการ commit workbook จริงไว้ที่
`docs/รายชื่อคนไข้ Demiรพ.สต.เกาะสะท้อน.xlsx` โดยไม่ตั้งใจ. Corrective pass นี้
ลบไฟล์ออกจาก repository tree และแทนที่ tip เดิมด้วย amended commit ไม่ใช่
follow-up deletion commit. Local และ remote `main` ถูกตรวจแล้วว่า path นี้ไม่อยู่
ใน reachable history/ordinary refs หลัง remediation.

เนื่องจากไฟล์เคยอยู่ใน public GitHub history ผู้ดูแล repository ควรประสาน
GitHub Support เพื่อขอ cached/unreachable sensitive-content cleanup เพิ่มเติม.
History rewrite ไม่รับประกันการลบสำเนาที่ GitHub หรือผู้ clone ก่อนหน้าอาจ cache
ไว้ และเอกสารนี้ไม่เก็บข้อมูลผู้ป่วยจาก workbook.

## 2. Files and architecture boundary

การเปลี่ยนแปลงอยู่ในขอบเขตต่อไปนี้:

| File / area | Responsibility |
| --- | --- |
| [`patient-import-contract.ts`](../../src/modules/patient-provisioning/import/patient-import-contract.ts) | typed transient canonical row, field status, diagnostic และ candidate contract |
| [`patient-import-header-aliases.ts`](../../src/modules/patient-provisioning/import/patient-import-header-aliases.ts) | explicit normalized alias registry และ known repeated-header recognizers |
| [`patient-import-layouts.ts`](../../src/modules/patient-provisioning/import/patient-import-layouts.ts) | bounded layout/header resolution, layout/date-format classification และ file metadata |
| [`patient-import-normalization.ts`](../../src/modules/patient-provisioning/import/patient-import-normalization.ts) | pure cell/text/number/National ID/phone/date normalization |
| [`excel-patient-import-adapter.ts`](../../src/modules/patient-provisioning/adapters/excel-patient-import-adapter.ts) | `.xlsx` upload boundary, workbook discovery และ canonical row construction |
| [`patient-provisioning-service.ts`](../../src/modules/patient-provisioning/services/patient-provisioning-service.ts) | current authorization, identity resolution, preview classification และ current-core mutation |
| [`patient-provisioning-workspace.tsx`](../../app/app/patients/provision/patient-provisioning-workspace.tsx) | Thai preview transparency และ bounded reconciliation summary |
| [`server-actions.ts`](../../src/modules/patient-provisioning/transport/server-actions.ts) | transport validation, actor resolution, exact file/context binding และ server-side reparse |

Boundary ยังคงเป็น:

```text
Client / UI
    ↓
Server Action / transport
    ↓
Excel import adapter
    ↓
PatientProvisioningService
    ↓
policy / database authorization
    ↓
Prisma transaction
    ↓
PostgreSQL
```

Adapter ไม่มี Prisma import และไม่เขียน database โดยตรง

## 3. Canonical transient row

`CanonicalPatientImportRow` เป็น typed, transient representation ที่แบ่งเป็น:

```text
provenance
  sourceSheetName / sourceRowNumber / sourceSequenceNumber

identity
  nationalId / externalPatientId / givenName / familyName
  combinedNameText / ageAtRoster

demographics
  dateOfBirth / gender

contact
  phoneNumber / emergencyContactName / emergencyContactPhone
  emergencyContactRelationship

address
  addressText / houseNumber / villageNumber / villageName / soi / road
  province / district / subdistrict / postalCode

clinicalCandidates
  weight / height / heightUnit / waistCircumference
  diabetesClassification / bloodSugar / hba1c
  bloodPressureText / pulseRate / bmi / dtxReading / riskFactorText
  serviceVisitDate / extendedMeasurementSeries

organizationCandidates
  hospitalNumber / hospitalName / subHospitalName / organizationCombinedText

caregiverCandidates
  osmCaregiverName

fieldAssessments / diagnostics
```

Known fieldsมี type เฉพาะ ไม่มี `Record<string, unknown>`, `metadata: any`,
generic JSON bag, EAV หรือ custom-field persistence. Unknown headersเก็บเฉพาะ
bounded header names ใน transient file metadata; ไม่เก็บ raw unknown cell values

ทุก canonical fieldที่มี headerจะมี `fieldAssessment` ระบุ `present`, source
header, status และ diagnostic codes โดย status ที่ใช้ใน adapter boundary คือ:

```text
NOT_PRESENT
SUPPORTED_FOR_CURRENT_PROVISIONING
PARSED_REQUIREMENT_GATED
UNKNOWN_SOURCE_HEADER
INVALID
AMBIGUOUS
```

ข้อมูล requirement-gated ที่ไม่ว่างจึงไม่หายระหว่าง parse กับ preview แม้จะไม่
ถูกส่งเข้า persistence input

## 4. Header aliases and layouts

### 4.1 Normalization

Header resolver ทำเฉพาะการเปลี่ยนรูปที่ไม่เปลี่ยนความหมาย:

- ตัด UTF-8 BOM ที่ต้น header;
- trim และ collapse Unicode whitespace;
- normalize Unicode เป็น NFC;
- normalize spacing รอบ punctuation ที่รู้จัก;
- case-fold English ด้วย lower-case;
- lookup จาก explicit alias registry เท่านั้น.

ไม่มี edit distance, Levenshtein, semantic inference, AI header mapping หรือการ
เดาความหมายจากคอลัมน์ข้างเคียง

Alias registryครอบคลุมหลักฐาน Phase 16A เช่น:

```text
givenName
  ชื่อ / ชื่อคนไข้ / ชื่อผู้ป่วย / first name / given name

familyName
  นามสกุล / สกุล / last name / family name

nationalId
  เลขบัตรประชาชน / เลขประจำตัวประชาชน / Thai National ID / National ID

hospitalNumber
  HN / HN รพ / เลข HN / hospital number / hospitalnumber

osmCaregiverName
  ชื่อผู้ดูแล (อสม.) / ชื่อผู้ดูแล(อสม) / ผู้ดูแล(อสม.)
  โค้ช / โค้ชผู้ดูแล / coach
```

รวมถึง aliases ของวันเกิด เพศ โทรศัพท์ น้ำหนัก ส่วนสูง รอบเอว HbA1c องค์กร
ที่อยู่ ผู้ติดต่อ PID BP P BMI DTX และ risk-factor fields ตาม source evidence

Unknown headersไม่ถูกทิ้งเงียบ: file metadataระบุ recognized, unknown และ
ambiguous headers ใน preview

### 4.2 Duplicate/ambiguous headers

การมี `เบอร์โทร` ซ้ำสองคอลัมน์จะถูก resolve เป็น `phoneNumber` และ
`emergencyContactPhone` เฉพาะเมื่อพบ exact known operational signature ที่ generic
phone แรกอยู่ก่อน `emergencyContactName`, generic phone ที่สองอยู่ถัดจากชื่อ
ผู้ติดต่อ และอยู่ก่อน `emergencyContactRelationship`. วิธีนี้อาศัย canonical
neighboring bindings ไม่ใช่ global first/second position guess และทั้งสองค่าก็ยัง
เป็น requirement-gated ไม่ใช่ persistence input.

ถ้าไม่มี emergency anchors, anchors ซ้ำ/กำกวม หรือ column order ไม่ตรง signature
ทั้งสอง source headersยังถูกเก็บเป็น `AMBIGUOUS_HEADER`; current coreยังสามารถ
ตรวจสอบ/นำเข้าได้ถ้า National ID, given name, family name และ HN ถูกต้อง แต่
phone candidateจะไม่ถูกเลือกเป็นค่า authoritative

Explicit labels เช่น `เบอร์โทร ผู้รับบริการ` และ `เบอร์ผู้ติดต่อ` ถูก mapได้
เมื่อไม่ซ้ำกัน. Alternate `ชื่อผู้ติดต่อ` ใช้เป็น emergency anchor ได้เช่นกัน
และ unknown duplicate layouts ยังคง ambiguous.

### 4.3 Layout and worksheet discovery

มี bounded layout keys:

```text
CURRENT_MINIMAL
OPERATIONAL_ROSTER
EXTENDED_ROSTER
COMBINED_NAME_REVIEW
UNKNOWN
```

Layout ใช้ resolve source-header shape และ date interpretation เท่านั้น ไม่ได้
กำหนด clinical destination, Hospital authority หรือ persistence semantics

Workbook discovery:

1. ตรวจ worksheet สูงสุด 12 แผ่นแรก;
2. scan header สูงสุด 8 แถวแรกของแต่ละ worksheet;
3. ต้องพบ National ID และอย่างน้อยหนึ่งชื่อ header หรือ combined-name header
   เพื่อเป็น patient identity candidate;
4. ตรวจ patient candidate rows จาก resolved core signal เท่านั้น: อย่างน้อยหนึ่ง
   ค่าใน `nationalId`, `givenName`, `familyName` หรือ `combinedNameText` ต้องมี
   ความหมาย. Clinical/contact/address-only hint ไม่ทำให้ template เป็น populated;
5. template-only sheet ที่มี explanatory hint แต่ไม่มี patient-core signal ไม่ถูก
   นับเป็น populated;
6. ถ้ามี candidate ที่ populated เพียงหนึ่งแผ่น ให้เลือกแผ่นนั้น;
7. template-only sheet แรกกับ populated sheet ถัดไปจึงทำงานได้;
8. ถ้ามีหลาย populated patient sheets ให้ reject ด้วย validation message ที่
   ปลอดภัย และไม่ concatenate อัตโนมัติ;
9. combined nameเก็บเป็น review candidateและไม่ split เป็น given/family.

การยืนยัน import จะส่งไฟล์เดิมกลับมาและ server จะคำนวณ discovery/parse ใหม่จาก
exact bytes ไม่เชื่อ canonical rows ที่ browserส่งกลับ

## 5. Normalization and validation rules

### 5.1 Missing and cell shape

blank, whitespace-only และ `-` ถูก normalize เป็น absence โดยไม่สร้าง default
value. Formula/error cellsไม่ถูกใช้เป็น authoritative input. Numeric/text HN
ถูกเก็บเป็น string โดยไม่ padding หรือบังคับ global uniqueness

### 5.2 National ID

- text ID ที่มี hyphen/whitespace ถูก canonicalize เฉพาะเพื่อ validation;
- numeric Excel cellถูกยอมรับเมื่อเป็น safe integer ที่ยัง recover ได้ตรง ๆ;
- textual scientific notationและ numeric valueที่ไม่ safeถูกจัดเป็น
  `LOSSY_EXCEL_VALUE`/invalid และไม่มีการเติมเลขที่หาย;
- ไม่มีการเติม leading zero ให้ numeric cell;
- หลัง normalizationยังใช้ `thaiNationalIdSchema` boundary เดิม รวมถึง
  development/test checksum bypass behavior เดิมโดยไม่ weaken production;
- previewแสดงเฉพาะ masked identity.

### 5.3 Phone

Text phone trimและลบเฉพาะ formatting whitespace/parentheses/hyphenที่ชัดเจน
โดยยังรักษา leading zero. Numeric Excel phoneถูกคงเป็น string ชั่วคราวพร้อม
`LOSSY_EXCEL_VALUE` และ `AMBIGUOUS_VALUE`; ไม่มีการเติม `0` หรือแปลง `+66`
และไม่มี phone persistenceจาก importใน phaseนี้

### 5.4 Date

Canonical dateเป็น date-only `YYYY-MM-DD`:

- Excel Date cellถูกอ่านเป็น calendar date โดยไม่สร้าง timestamp domain;
- numeric Excel serialถูกอ่านเฉพาะเมื่อ cell formatบ่งชี้ว่าเป็น date;
- Thai Buddhist Era และ Gregorian yearใน known DMY shapeถูกแปลงแบบ deterministic;
- DD/MM/YYYY textรับเฉพาะเมื่อ matched known DMY layout;
- ISO dateและ Thai month textที่ระบุเดือนชัดเจนรับได้;
- `DOB` ที่ไม่ matched known date shapeกับ `04/05/2568` เป็น ambiguous;
- invalid/ปีอย่างเดียว/รูปแบบกำกวมไม่มี fallback date และไม่ใช้ upload time.

### 5.5 Numeric clinical candidates

weight, height, waist, blood sugar, HbA1c, BMI, pulse และ DTX parseได้เพียง
finite numeric shape. ไม่คำนวณ BMI, ไม่แปลงหน่วย, ไม่ใช้ threshold, ไม่ตัดสิน
healthy/risk/diagnosis และไม่สร้าง Baseline, Follow-up, Screening, Program หรือ
Final Assessment

`heightUnit` เก็บเฉพาะ cm/m เมื่อ headerระบุชัด; ถ้าไม่ชัดจะมี
`UNIT_NOT_CONFIRMED`. Repeated visit/summary columnsเป็น typed transient
`extendedMeasurementSeries` และไม่ถูกแปลงเป็น Follow-up rounds

## 6. Classification and preview

Row classifications ที่ service รองรับ:

```text
READY
ALREADY_EXISTS
DUPLICATE_IN_FILE
INVALID
CONFLICT
NEEDS_REVIEW
HOSPITAL_MISMATCH
UNSUPPORTED_REQUIREMENT
```

ใน implementationนี้:

- current-core invalid/identity lossinessเป็น `INVALID`;
- duplicate identityในไฟล์ยังเป็น `DUPLICATE_IN_FILE`;
- current database identity/name/HN conflictsยังผ่าน logic เดิม;
- source `hospitalName` ที่ไม่ตรงกับ target Hospital name แบบ normalized exact
  เป็น `HOSPITAL_MISMATCH` และไม่ถูก persist;
- ambiguityใน field requirement-gatedถูกแสดงผ่าน field/file diagnostics และ
  ไม่ทำให้ค่าถูกเลือกเป็น authoritative; core importยังทำได้เมื่อ core พร้อม;
- OSM textยังไม่ทำ database lookup และไม่สร้าง assignment;
- state อื่นใน vocabularyถูกเก็บไว้สำหรับ bounded reconciliation contract
  โดยไม่สร้าง generalized workflow state machine.

Preview แสดงภาษา business-facing สามกลุ่ม:

```text
A. ข้อมูลที่จะนำเข้าในขั้นตอนนี้
B. ข้อมูลที่ตรวจพบ แต่ยังไม่ถูกบันทึกเนื่องจากรอยืนยัน Requirement
C. ข้อมูลที่ระบบไม่สามารถตีความได้ / ต้องตรวจสอบ
```

File summary แสดงจำนวนแถวที่พบ, พร้อมนำเข้า, มีอยู่แล้ว, invalid, conflict,
ต้องตรวจสอบ, worksheet/header ที่เลือก, recognized headers, gated fields,
unknown headers และ ambiguous headers. Row detailแสดง row number, masked ID,
ชื่อที่มีใน core/combined review, HN, status, safe reason และชื่อ field ที่ยัง
ไม่ถูกบันทึก โดยไม่แสดง raw clinical candidate values

หลัง confirm summaryระบุเสมอว่าระยะนี้บันทึกเฉพาะ National ID, ชื่อ, นามสกุล
และ HN ผ่าน current provisioning behavior; ไม่ใช้ข้อความทั่วไปว่า import สำเร็จ
ทั้งหมดเมื่อมี field เพิ่มเติมที่ยังไม่ persist

## 7. Persistence and security boundary

### 7.1 Fields actually persisted

ผ่าน `PatientProvisioningService` เดิมเท่านั้น:

| Source field | Current result |
| --- | --- |
| `nationalId` | server identity resolution / HMAC lookup ของ `Person`; raw ID ไม่อยู่ใน PatientProfile |
| `givenName`, `familyName` | Person name ตาม existing conflict/reuse rules |
| `hospitalNumber` | `PatientHospitalRelationship.hospitalNumber` ของ server-selected target Hospital |
| current Patient core | existing User/PATIENT role/Profile/relationship/idempotency/audit/serializable transaction behavior |

ไม่ persistจาก rosterใน Phase 16B.0:

- date of birth, gender, phone, address และ emergency contact;
- weight, height, waist, blood sugar, HbA1c, BP, pulse, BMI, DTX และ risk text;
- diabetes/risk label;
- Hospital/รพ.สต. textเป็น tenant/authority;
- PID, age-at-roster และ source sequenceเป็น patient identity;
- OSM/coach textเป็น `PatientOsmAssignment`;
- unknown columns หรือ arbitrary source values;
- password, credential, token หรือ activation state.

### 7.2 Existing confirmation and authorization

Preview/confirm mechanismเดิมยัง binding กับ:

```text
exact uploaded file SHA-256
  + authenticated server actor
  + target Hospital
  + server HMAC preview binding
  → confirmation server-side revalidation
  → exact file reparse
  → current database preview/classification
  → per-patient provisioning transaction
```

Browser-selected Hospitalไม่ใช่ authority. Serverยัง resolve actor, revalidate
Hospital scope และ bulk policy. Spreadsheet Hospital textไม่ grant scope,
visibility หรือ tenant ID. Adapterไม่เรียก Prisma. OSM assignmentไม่เกิดจาก
spreadsheet text. Raw National ID/identity hashไม่ถูกส่งใน preview และไม่มี raw
clinical payloadใน audit metadata

Per-row transaction semanticsเดิมคงอยู่: row ที่สำเร็จ commitได้แม้ row อื่น
invalid/conflict/review และไม่มี workbook-wide transaction

## 8. Compatibility tests and synthetic fixtures

ไม่มี customer workbook หรือ patient row ถูกเพิ่มเป็น fixture. Test workbookสร้าง
ใน memoryด้วย ExcelJS และใช้ค่าที่ระบุชัดว่า synthetic

### 8.1 Adapter tests

[`excel-patient-import-adapter.test.ts`](../../src/modules/patient-provisioning/adapters/excel-patient-import-adapter.test.ts)
ครอบคลุม:

- current four-column core และ wide operational 34-column shape;
- alias/BOM/whitespace/punctuation และ column order/header row ที่ไม่ใช่ row 1;
- template-only Sheet 1 ที่มี explanatory hint + populated Sheet 2;
- multiple populated patient sheets rejection;
- unknown extra header และ bounded 64-column behavior;
- known duplicate generic `เบอร์โทร` resolution with both contact-name aliases;
- unknown duplicate generic `เบอร์โทร` remains ambiguous;
- explicit `เบอร์ผู้ติดต่อ` alias remains separate;
- hyphenated National ID, exact numeric ID, scientific text lossiness;
- textual phone formatting และ numeric phone leading-zero loss;
- BE/Thai-month/Excel date และ unknown ambiguous date;
- combined name preservation without split;
- 500-row limit.

### 8.2 Integration tests

Existing Patient provisioning integration testsยังทำงานกับ current four-column
workbook และมี synthetic assertionsเพิ่มสำหรับ:

- wide roster gated fields remain transient and do not create Profile expansion,
  Baseline หรือ OSM assignment;
- source Hospital mismatch yields `HOSPITAL_MISMATCH` and zero mutation.

Regression pathsยังครอบ identity reuse, duplicate/conflict classification,
role preservation, changed-file/Hospital binding, server-side reparse, bulk
authorization และ per-row partial success

## 9. Limits and DoS posture

```text
MAX_PATIENT_IMPORT_BYTES              5 MB
MAX_PATIENT_IMPORT_ROWS               500 non-empty patient rows
MAX_PATIENT_IMPORT_COLUMNS            64
MAX_PATIENT_IMPORT_WORKSHEETS_SCANNED 12
MAX_PATIENT_IMPORT_HEADER_SCAN_ROWS   8
runtime file format                    .xlsx only
```

ไม่เพิ่ม CSV dependency, queue, worker, Redis หรือ background job. Parserไม่
ทำ unbounded fuzzy matching, ไม่สะสม raw unknown cellsทั้ง workbook และไม่สร้าง
large diagnostics payloadจากทุก cell

## 10. Deviations and limitations from Phase 16A

การ implementยังยึด Phase 16A แต่ pin พฤติกรรมที่ต้อง reviewได้ดังนี้:

1. เลือก 64 columnsจาก evidenceสูงสุดประมาณ 36 columns พร้อม bounded headroom;
2. current coreยังใช้ required separate given/family names. `combinedNameText`
   ถูกเก็บเพื่อ reviewและ rowจะไม่ provisionจนกว่าชื่อแยกจะได้รับการยืนยัน;
3. exact `hospitalName` mismatchถูกนำเสนอเป็น `HOSPITAL_MISMATCH` โดยใช้ target
   Hospital nameที่ serviceอ่านจาก server. `subHospitalName` และ combined
   organization textยังไม่ถูกตีความเป็น hierarchy;
4. OSM/coach field parseและแสดงเป็น gated เท่านั้น; ไม่มี non-mutating OSM lookup
   ใน phaseนี้เพื่อลด scopeและไม่สร้าง false authority;
5. requirement-gated ambiguityถูกแสดงเป็น diagnostics โดยยังอนุญาต current-core
   provisioningเมื่อ identity core ปลอดภัย. จึงไม่มีข้อมูล gated ใดถูก persist
   แต่ row statusไม่ได้บังคับ human decision สำหรับ core-only import ทุกกรณี;
6. file metadataและ field assessmentเป็น transient resultเท่านั้น ไม่มีการ
   serializeลง database หรือ audit metadata.
7. template population detectionใช้เฉพาะ patient-core signal ไม่ใช่ non-empty
   cell ใด ๆ เพื่อไม่ให้ explanatory clinical hint ถูกนับเป็นผู้ป่วย;
8. duplicate generic phone ถูก resolve เฉพาะ known emergency-contact anchor
   signature; unknown layoutsยังคง `AMBIGUOUS_HEADER`.

ข้อจำกัดที่ยังเปิดคือ source measurement semantics, unit/ownership, shared date,
Hospital/รพ.สต. relationship, OSM identity และ profile/contact mutation authority

## 11. Five unresolved customer decisions

Phase 16B.0 ไม่ตอบแทนลูกค้า:

1. ความหมายของ weight, height, waist, blood sugar และ HbA1c: initial, latest ณ
   submission, latest จาก medical record ต่างวัน หรือ definition อื่น;
2. ความหมายของ `ประเภทเบาหวาน / กลุ่มเสี่ยง หรือ เบาหวาน` และผลต่อ workflow/reporting;
3. Hospital vs รพ.สต. ownership, tenant/hierarchy, visibility, management และ
   authoritative submitting organization;
4. `ชื่อผู้ดูแล (อสม.) / โค้ช` เป็น authoritative Patient–OSM assignmentหรือไม่;
5. health valuesใน rosterใช้ shared effective dateเดียวได้หรือไม่ หรือจำเป็นต้อง
   row/measurement-level dates.

คำตอบต้องระบุ owner, source/provenance, value/unit semantics, effective date,
correction/history, visibility, authorization และ persistence destinationก่อน
ออกแบบ full-field mutation

## 12. Phase 16B.1 handoff

### Ready without customer decisions

ระบบพร้อมที่จะ:

- รับ known full operational `.xlsx` structuresภายใน bounds;
- locate populated patient worksheet แบบ deterministic;
- resolve explicit aliasesและ column order differences;
- normalize supported cell shapesและรายงาน lossiness/ambiguity;
- retain requirement-gated values transiently;
- แสดง preview/reconciliation ที่แยก core, gated และ unresolved data;
- provision current Patient core ผ่าน secure existing service;
- รัน synthetic compatibility/regression tests.

### Still blocked

ยังห้าม full persistence สำหรับ clinical measurements/effective dates,
diabetes/risk semantics, Hospital/รพ.สต. ownership/hierarchy, OSM assignment,
profile/contact/address ownershipที่ยังไม่ approved และ PID/unsupported identifiers

### Exact Phase 16B.1 entry condition

เริ่ม Phase 16B.1ได้เมื่อมี customer decision record ที่ตอบครบทั้งห้าข้อ,
ระบุ owner/source/unit/date/correction/visibility/authorization/destination
อย่างชัดเจน, ไม่มี conflictกับ accepted ADR, และมีการอนุมัติว่าจะสร้างหรือใช้
domain service ใดเป็น persistence destination. ก่อน gate นี้ Phase 16B.1ทำได้
เฉพาะ decision reconciliation และ contract preparation; ห้ามเริ่ม full-field
persistence implementation

## 13. Verification record

ระหว่าง implementationได้ตรวจ:

```text
npm run lint                 passed
npm run typecheck            passed
npm test                     passed (124 files / 829 tests)
focused adapter tests        passed (15 tests)
focused transport/UI tests   passed (13 tests)
npm run test:integration     passed (19 files / 160 tests)
```

`npm run test:integration` ผ่านบน local PostgreSQL test database หลัง migration
check ไม่มี pending migration.

ตรวจเพิ่มเติมก่อนส่งมอบ:

- `prisma/schema.prisma` และ `prisma/migrations/**` ไม่ถูกแก้;
- ไม่มี customer workbook หรือ real patient row เหลือใน corrected tree/history;
  synthetic testsเท่านั้นที่มีค่าตัวอย่างสำหรับ regression;
- ไม่มี direct Prisma writeใน adapter;
- ไม่ย้าย authorization ไป client;
- ไม่มี raw National ID ใน preview output;
- gated dataไม่ถูก persistและไม่ถูกทิ้งเงียบ;
- Thai textเป็น UTF-8 และไม่มี known mojibake;
- current minimal import behaviorและ exact preview bindingยังผ่าน regression tests;
- หลัง history rewrite ให้ตรวจ `git log origin/main -- <sensitive path>` และ
  `git rev-list --objects --all | grep -F <sensitive path>` ต้องไม่มี output;
- GitHub Support cached-content cleanupยังเป็นขั้นตอนที่ repository ownerควร
  พิจารณา เพราะเคยมีข้อมูลอยู่ใน public history.
