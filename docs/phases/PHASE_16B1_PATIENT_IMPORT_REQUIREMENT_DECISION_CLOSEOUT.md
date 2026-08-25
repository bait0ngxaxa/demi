# DEMI Phase 16B.1 — Patient Import Requirement Decision Closeout

- **สถานะ:** CLOSED — requirement decision closeout / documentation-only handoff
- **Starting HEAD:** `b4d6fd0be1963e0bf59f259d18343e7c6749fa93` (`feat(patient-import): add V2 compatibility foundation`)
- **วันที่:** 2026-08-25 (Asia/Bangkok)
- **Previous authoritative phases:** [Phase 16A — Canonical Patient Import Contract](./PHASE_16A_CANONICAL_PATIENT_IMPORT_CONTRACT.md) และ [Phase 16B.0 — Patient Import Adapter V2 Compatibility Foundation](./PHASE_16B0_PATIENT_IMPORT_ADAPTER_V2_COMPATIBILITY_FOUNDATION.md)

เอกสารนี้เป็น authoritative handoff จาก customer requirement evidence ไปสู่
Phase 16C DOMAIN/PERSISTENCE DESIGN. จุดประสงค์คือปิดความหมายของข้อกำหนดที่
ลูกค้ายืนยันแล้ว และรักษาข้อกำหนดที่ยังไม่ยืนยันให้เป็น gate ที่ตรวจสอบได้

Phase 16B.1 **ไม่มี implementation หรือ schema change**: ไม่แก้ Prisma schema,
migration, parser, service, route, UI, configuration, database หรือ test และไม่
เริ่ม Phase 16C implementation.

## 1. Status and purpose

### Phase status

Phase 16B.1 เสร็จในฐานะเอกสารตัดสิน requirement เท่านั้น โดยผลลัพธ์หลักคือ
decision register ห้ารายการ, import journey ที่ยืนยันแล้ว, engineering
recommendations ที่แยกจาก customer wording และ Phase 16C entry gate.

### Purpose

เอกสารนี้ต้องทำให้ Phase 16C ออกแบบ domain/persistence ต่อได้โดยไม่ตีความใหม่ว่า

- ค่าคลินิกใน roster เป็นข้อมูลล่าสุดหรือข้อมูลติดตาม;
- label `ประเภทเบาหวาน` เป็น Diabetes Type หรือ diagnosis;
- ข้อความ Hospital/รพ.สต. เป็น authorization หรือ hierarchy;
- ชื่อผู้ดูแลเป็น UUID ที่เชื่อถือได้;
- วันที่เดียวต่อ workbook เป็นกติกาถาวร.

ข้อกำหนดใหม่มีอำนาจเหนือ prototype behavior เมื่อไม่ขัดกับ accepted
architecture/security boundary. Persistence ที่ยังไม่ได้รับการออกแบบและอนุมัติ
ยังคงเป็นงานของ Phase 16C.

## 2. Evidence hierarchy

การตัดสินและการตีความในเอกสารนี้ใช้ลำดับอำนาจดังนี้:

1. latest confirmed customer requirement;
2. accepted ADRs;
3. architecture baseline;
4. current implementation;
5. Phase 16A/16B.0 evidence;
6. legacy behavior ใช้เป็น reference เท่านั้น.

หลักฐานจาก roster และ behavior เดิมอาจยืนยันรูปแบบ header หรือ compatibility
need ได้ แต่ไม่สามารถยกระดับตัวเองเป็น domain meaning, ownership, authorization,
identity หรือ persistence authority.

เอกสารและ implementation ที่ตรวจเพื่อ handoff นี้รวมถึง:

- [`docs/CONTEXT.md`](../CONTEXT.md) และ architecture/ADR baseline ที่เกี่ยวข้อง;
- [`prisma/schema.prisma`](../../prisma/schema.prisma);
- current patient provisioning/import adapter และ Phase 16A/16B.0 documents;
- [`patient-osm-assignment-service.ts`](../../src/modules/patient-assignment/services/patient-osm-assignment-service.ts) และ policy ที่เกี่ยวข้อง;
- current PatientBaseline service/schema และ tests ที่เกี่ยวข้อง.

## 3. Decision register

| ID | Decision | Status |
| --- | --- | --- |
| `IMP-REQ-01` | Clinical values are initial pre-program patient data and must be imported in the same roster workflow | **CONFIRMED** |
| `IMP-REQ-02` | Risk/diabetes source field is a patient status/classification label | **CONFIRMED** |
| `IMP-REQ-03` | Hospital / รพ.สต. parent-child hierarchy and ownership semantics | **OPEN** |
| `IMP-REQ-04` | OSM / Coach source field represents actual caregiver assignment | **CONFIRMED** |
| `IMP-REQ-05` | One shared effective date per roster import batch | **PROVISIONAL — FINAL CONFIRMATION REQUIRED** |

### IMP-REQ-01 — Initial clinical data

**Customer answer (สรุป):** ข้อมูลใน roster เป็นข้อมูลตั้งต้นของคนไข้ก่อนเข้า
โปรแกรม และต้องนำเข้าไปพร้อมกับ template เดิมในครั้งเดียว ไม่บังคับให้กรอกซ้ำ
ภายหลัง.

**Normalized requirement:** Roster clinical values are **INITIAL PRE-PROGRAM
PATIENT DATA**. The product must support one logical import workflow that
provisions Patient core and ingests the initial pre-program data that is present
and approved for that row.

**Status:** **CONFIRMED**

**Now confirmed**

- ค่าคลินิกที่ส่งมาใน roster เป็น initial state ก่อนเริ่ม Program ไม่ใช่ latest
  arbitrary medical-record value, follow-up value หรือ final value.
- ต้องรวมการ ingest นี้ใน user-facing workflow เดียวกับ patient provisioning:
  `Upload roster → Preview → Resolve conflicts → Confirm`.
- Backend อาจ fan out เป็นหลาย domain operation หรือหลาย service ได้ แต่ผู้ใช้
  ต้องไม่ถูกบังคับให้ import roster แล้วกรอก baseline เดิมซ้ำใน workflow อื่น.
- การมีค่าคลินิกใน source ไม่ได้ทำให้ทุก field พร้อม persist โดยอัตโนมัติ.

**ยังไม่ยืนยัน**

- field ใดมี semantics ตรงกับ current `PatientBaseline` และ field ใดต้องมี
  destination ใหม่;
- height และ HbA1c ซึ่งยังไม่มี current rewrite persistence source;
- patient status/classification ซึ่งเป็นคนละ decision กับ measurement baseline;
- measurement effective-date contract, unit contract, correction/history และ
  provenance;
- ความหมายและปลายทางของ field อื่นที่อยู่ใน roster เช่น BP, DTX, BMI หรือข้อมูล
  profile.

**Architecture consequence**

- Canonical row ยังคงเป็น transient import candidate ไม่ใช่ persistence model.
- Current `PatientBaseline` เป็น **strongest existing candidate destination**
  เฉพาะเมื่อ field semantics, units, date และ ownership ตรงกัน. ห้ามประกาศว่า
  ทุก source field map เข้า `PatientBaseline`.
- Core provisioning, initial-state ingestion และ assignment อาจเป็นคนละ domain
  operation แต่ต้องอยู่ใต้ server-authorized import boundary และออกแบบ atomicity
  ระดับ patient ให้ชัดเจน.
- ห้ามสร้าง mandatory second workflow สำหรับข้อมูลตั้งต้นที่มีอยู่แล้วใน roster.

**Phase 16C consequence**

- ทำ field-by-field mapping ไปยัง `PatientBaseline` อย่างมีหลักฐาน และบันทึก gap
  ของ height, HbA1c, classification และ effective date แยกกัน.
- ตรวจ current Baseline cardinality/immutability/correction policy ก่อน reuse;
  ไม่ใช้การมีชื่อ field ใกล้เคียงเป็นเหตุผลพอสำหรับ persistence.
- ออกแบบ confirm ให้ผู้ใช้เห็น gated values และผล reconciliation ก่อนการ
  persist แต่ละ patient.

**Prohibited assumptions**

- ค่าทุกคอลัมน์ทางคลินิกต้องลง Baseline;
- roster date, upload time หรือ `createdAt` เป็น observation/effective date โดย
  ไม่ผ่าน Decision 5;
- DTX เท่ากับ blood sugar ในทุก context;
- BP parsing, threshold, diagnosis หรือ clinical interpretation ได้รับการยืนยัน;
- การยืนยัน Decision 1 ทำให้ `dateOfBirth`, gender, phone, address หรือ
  emergency contact พร้อม persist โดยอัตโนมัติ.

### IMP-REQ-02 — Diabetes/risk field

**Customer answer (สรุป):** ค่าในช่องนี้เป็น label ที่บอกว่าผู้ป่วยมีสถานะใด.

**Normalized requirement:** Source values under headers such as `ประเภทเบาหวาน`,
`กลุ่มเสี่ยง`, `เบาหวาน` หรือ `กลุ่มเสี่ยง หรือ เบาหวาน` are a **PATIENT STATUS /
CLASSIFICATION LABEL**.

**Status:** **CONFIRMED**

**Now confirmed**

- semantics ขั้นต่ำคือ label/classification ของผู้ป่วยตาม source requirement;
- ยังไม่มีหลักฐานให้ถือว่าเป็น `DiabetesType`, formal diagnosis code, ICD,
  Screening result, Program lifecycle state หรือ clinical rule-engine result;
- ค่า label นี้ต้องไม่ถูกใช้เป็น authorization authority หรือสร้าง Program state
  โดยการเดา.

**ยังไม่ยืนยัน**

- exact domain name; ตัวอย่าง `PatientStatusLabel`,
  `PatientRiskClassification` และ `PatientClinicalClassification` เป็นเพียง
  conceptual candidates ไม่ใช่ vocabulary ที่ authoritative;
- allowed vocabulary และ controlled vocabulary เทียบกับ free text;
- ผู้มีสิทธิ์เปลี่ยน label;
- ต้องเก็บ history หรือไม่;
- scope ว่า Hospital-specific หรือ patient-global;
- เป็น initial state เท่านั้นหรือเปลี่ยนระหว่าง Program ได้;
- reports/filtering ใดต้องใช้ label นี้.

**Architecture consequence**

- ห้ามสร้างหรือเลือก domain ชื่อ `DiabetesType` ใน Phase 16B.1.
- ห้าม map เป็น diagnosis, ICD, Screening หรือ Program lifecycle โดยอาศัยชื่อ
  header.
- จนกว่า Phase 16C จะปิด vocabulary/owner/lifecycle ให้รักษาค่าเป็น transient
  candidate และ reconciliation evidence ตาม boundary ของ importer.

**Phase 16C consequence**

Phase 16C ต้องตัดสิน exact domain name, vocabulary, lifecycle, scope, edit
authority, history และ report/filter contract ก่อนเลือก persistence destination
หรือสร้าง mutation. ต้องตรวจว่ามี accepted domain เดิมที่กำหนดศัพท์นี้แล้วหรือไม่
ก่อนสร้างศัพท์ใหม่.

**Prohibited assumptions**

- `ประเภทเบาหวาน` หมายถึง Type 1/Type 2;
- label เป็น diagnosis, ICD, screening outcome หรือ clinical threshold result;
- label เป็น Program status หรือเปลี่ยน Patient authorization;
- label เป็น free text หรือ enum โดยไม่มี requirement/owner decision;
- label ต้องอยู่ใน `PatientBaseline` เพียงเพราะนำเข้าพร้อมข้อมูลตั้งต้น.

### IMP-REQ-03 — Hospital / รพ.สต. hierarchy

**Customer answer (สรุป):** ความสัมพันธ์ของโรงพยาบาลแม่ข่ายและลูกข่ายยังไม่ชัดเจน.

**Normalized requirement:** Hospital / รพ.สต. parent-child, ownership,
tenant, visibility และ management semantics remain unresolved.

**Status:** **OPEN**

**Now confirmed**

- target Hospital ของ import ต้องมาจาก server-authorized actor scope;
- text `โรงพยาบาล`, `รพ.สต.` หรือ equivalent ใน spreadsheet เป็น source
  evidence และ reconciliation information เท่านั้น;
- spreadsheet text ไม่ใช่ Hospital ID, tenant authority หรือ permission grant;
- Phase 16C ทำ exact-Hospital patient import ต่อได้ โดยไม่ต้องรอ hierarchy
  decision ตราบใดที่ไม่เพิ่ม parent-child behavior.

**ยังไม่ยืนยัน**

- parent Hospital ownership ของ child Hospital;
- child ownership, tenant inheritance, visibility inheritance หรือ management
  inheritance;
- cross-Hospital authorization, shared access, transfer และ reporting scope.

**Architecture consequence**

คง current direct Hospital boundary และ fail closed เมื่อ source organization ไม่
ตรงกับ target ที่ server เลือก. ห้าม infer hierarchy จากชื่อใน roster และห้าม
ขยาย actor scope เพื่อ resolve organization text.

**Phase 16C consequence**

ออกแบบและ implement ได้เฉพาะ exact target Hospital ที่ actor มีสิทธิ์อยู่แล้ว;
Hospital mismatch เป็น reconciliation state. หากต้องการ hierarchy ให้แยกเป็น
future requirement slice ไม่รวมใน patient import persistence.

**Prohibited assumptions**

- parent Hospital เป็น owner ของ child โดยอัตโนมัติ;
- child Hospital มองเห็นหรือจัดการ patient ของ parent/พี่น้องได้;
- tenant หรือ permission inheritance เกิดจาก spreadsheet text;
- source Hospital/รพ.สต. เป็น authority เหนือ server-authorized target Hospital;
- import สามารถทำ cross-Hospital lookup, transfer หรือ shared ownership.

### IMP-REQ-04 — OSM / Coach caregiver assignment

**Customer answer (สรุป):** ช่องนี้ใช้ assign ผู้ดูแล อสม. หรือโค้ช.

**Normalized requirement:** Roster caregiver text such as `ชื่อผู้ดูแล (อสม.)`,
`โค้ช` หรือ accepted equivalent aliases represents the intended actual
**Patient–OSM caregiver assignment**.

**Status:** **CONFIRMED**

**Now confirmed**

- logical intent คือ `import row → resolve referenced OSM/Coach → create or
  reconcile Patient–OSM caregiver assignment`;
- source file มี display/name reference ไม่ใช่ authoritative User UUID;
- exact authorized Hospital scope เป็น boundary ของ candidate lookup;
- exact unique candidate จึงเป็นเพียง candidate ที่พร้อมให้ confirmation/import;
  ไม่ใช่ใบอนุญาตให้ match ด้วยชื่อแบบ fuzzy;
- ศูนย์ หนึ่ง หรือหลาย candidate ต้องนำไปสู่ explicit reconciliation.

**Safe conceptual contract**

```text
source caregiver display text
  ↓
Hospital-scoped candidate resolution
  ↓
zero / one / many candidates
  ↓
explicit reconciliation
  ↓
confirmed User/OSM identity
  ↓
PatientOsmAssignment mutation
```

Expected outcomes:

```text
exact unique candidate → eligible for confirmation/import
multiple candidates     → OSM_AMBIGUOUS / NEEDS_REVIEW
no candidate            → OSM_NOT_FOUND / NEEDS_REVIEW
```

**Current architecture verification**

ณ starting HEAD, `prisma/schema.prisma` ยังคงมี `PatientOsmAssignment` ที่ผูก
`PatientHospitalRelationship` กับ `osmUserId`, ผู้ assign และประวัติการสิ้นสุด
assignment. Current
[`patient-osm-assignment-service.ts`](../../src/modules/patient-assignment/services/patient-osm-assignment-service.ts)
และ policy ตรวจ active Hospital Owner scope, active OSM role/OSM–Hospital
relationship, exact relationship และใช้ serializable transaction สำหรับ
assign/reassign/unassign. ดังนั้น domain/service นี้ยังเป็น current authoritative
assignment boundary ที่ Phase 16C ต้อง reuse หรือเปรียบเทียบก่อนตัดสินใจเปลี่ยน
implementation; ไม่ใช่เหตุผลให้เพิ่ม schema ใน Phase 16B.1.

**ยังไม่ยืนยัน**

- exact search/display fields และ duplicate-name disambiguation contract;
- behavior ของ existing assignment เมื่อ import ระบุ caregiver คนใหม่;
- importer เปลี่ยน assignment เดิมได้อัตโนมัติหรือจำเป็นต้องมี reconciliation;
- correction/history และ user-facing audit/provenance ของ import-originated
  assignment.

**Architecture consequence**

- ชื่อใช้ค้นหาและแสดงผลเท่านั้น; identity ที่ mutation ต้องเป็น server-confirmed
  User/OSM ID.
- ห้ามใช้ raw name เป็น identity key, ห้าม fuzzy auto-assignment, ห้าม lookup ข้าม
  Hospital และห้ามให้ spreadsheet เป็น authority.
- Assignment mutation ต้องผ่าน accepted assignment service/policy และ exact
  Hospital relationship boundary ไม่เขียน persistence ตรงจาก adapter.

**Phase 16C consequence**

ออกแบบ resolver และ preview ให้แสดง zero/one/many candidates, safe reason และ
explicit confirmation. ตรวจ current service/schema/authorization ซ้ำในช่วง design
และกำหนด not-found, ambiguity, existing-assignment, reassignment และ correction
behavior โดยไม่ assume ว่า replacement อนุญาต.

**Prohibited assumptions**

- ชื่อใน spreadsheet เท่ากับ User UUID;
- ชื่อซ้ำเลือกคนแรกหรือเลือกด้วย fuzzy score;
- OSM ที่อยู่ใน Hospital อื่นถูกนำมาเป็น candidate;
- source caregiver text grant scope หรือ bypass server authorization;
- import replace assignment เดิมได้โดยไม่ให้ผู้ใช้ reconcile.

### IMP-REQ-05 — Effective date

**Customer answer:** “น่าจะเป็นเช่นนั้น” ซึ่งยังไม่ final พอสำหรับกติกา persistence
ถาวร.

**Normalized requirement:** A shared effective date for all initial clinical data in
one roster batch is a **working hypothesis only**.

**Status:** **PROVISIONAL — FINAL CONFIRMATION REQUIRED**

**Now confirmed**

- คำตอบปัจจุบันยังไม่ใช่ approval ให้ persist หรือ migrate ไปสู่ batch-date model;
- Phase 16C ออกแบบทางเลือกและประเมิน schema/service impact แบบมีเงื่อนไขได้;
- ห้ามเลือกทางใดเป็น permanent contract โดยปิดบังว่าเป็น customer-confirmed.

**Working proposal (ยังไม่ใช่ requirement)**

```text
Import batch
  └── effectiveDate
```

อาจใช้กับ initial clinical data ทุก row ใน batch หากลูกค้ายืนยันว่า “ข้อมูลตั้งต้น
ณ วันที่เดียวกัน” เป็นความหมายที่ถูกต้องจริง.

**Exact follow-up question ที่ต้องเก็บไว้**

> ข้อมูลน้ำหนัก รอบเอว น้ำตาล HbA1c และข้อมูลสุขภาพตั้งต้นอื่น ๆ ที่ส่งมาใน roster หนึ่งไฟล์ สามารถถือว่าเป็นข้อมูลตั้งต้น ณ วันที่เดียวกันทั้งไฟล์ได้หรือไม่?

**ยังไม่ยืนยัน**

- YES → ใช้ shared import effective date ได้หรือไม่ในทุก field/context;
- NO → ต้องใช้ row-level หรือ measurement-level date;
- date-only หรือ timestamp, timezone/date semantics, provenance และ correction
  policy.

**Architecture consequence**

- ห้าม persist หรือสร้าง migration ที่ผูกถาวรกับ shared batch date ใน Phase 16B.1.
- ต้องแยก source observation/effective date ออกจาก upload time, transaction time,
  `PatientBaseline.recordedOn` และ `createdAt` จนกว่าจะมี decision ที่ชัดเจน.

**Phase 16C consequence**

Phase 16C อาจออกแบบ Alternative A และ Alternative B, ทำ impact analysis และ
เตรียม preferred option แบบ conditional แต่ final implementation ต้องรอคำตอบ
ยืนยัน.

| Alternative | ข้อดี | เงื่อนไข/ต้นทุน |
| --- | --- | --- |
| **A — shared import effective date** | template และ UX ง่าย, เข้าใจง่ายในระดับ batch | ใช้ได้เฉพาะเมื่อค่าทั้งหมดมีผล ณ วันเดียวกันจริง |
| **B — row-level / measurement-level dates** | แม่นยำกว่าเมื่อค่ามาจากต่างวัน | template, validation, preview และ persistence ซับซ้อนขึ้น |

**Prohibited assumptions**

- “น่าจะ” เท่ากับ confirmed YES;
- upload date, file name, row order หรือ database `createdAt` เป็น clinical date;
- ทุก measurement ใน workbook มีวันเดียวกัน;
- `PatientBaseline.recordedOn` ปัจจุบันปิด Decision 5 แล้ว;
- สามารถ backfill/migrate date model ถาวรโดยไม่ยืนยัน customer semantics.

## 4. Updated import journey

นี่คือ target **logical import journey** ที่ยืนยันตามข้อกำหนดใหม่ โดย exact
persistence implementation ยังเป็น Phase 16C:

```text
Hospital user
  ↓
Upload patient roster
  ↓
Server-authorized target Hospital
  ↓
Parse / normalize
  ↓
Preview
  ↓
Resolve:
    identity conflicts
    Hospital mismatch
    OSM caregiver resolution
    malformed source data
  ↓
Confirm
  ↓
Per-patient transaction (Phase 16C design)
    ├── Patient core
    ├── Hospital relationship / HN
    ├── initial pre-program data
    ├── status/classification label
    └── OSM caregiver assignment
  ↓
Import summary
```

กติกาประกอบ:

- Initial pre-program values, classification label และ OSM assignment เป็นส่วน
  ของ logical journey ที่ยืนยันแล้ว ไม่ใช่การรับรองว่ามี table หรือ service เดียว
  ต้องรองรับทั้งหมด.
- Target Hospital มาจาก server-authorized actor scope. Browser input และ
  spreadsheet organization text ไม่สามารถเปลี่ยน target scope.
- Hospital hierarchy/parent-child behavior อยู่นอก journey จนกว่า
  `IMP-REQ-03` จะถูกปิด.
- Effective-date implementation เป็น conditional ตาม `IMP-REQ-05`.
- Preview ต้องแยก current core result, gated clinical/classification result,
  caregiver candidate result และ unresolved reconciliation ให้ผู้ใช้ตัดสินใจได้
  ก่อน confirm.

## 5. Transaction semantics

### Engineering recommendation for Phase 16C

นี่เป็น **ENGINEERING RECOMMENDATION FOR PHASE 16C** ไม่ใช่ customer wording ที่
ยืนยันเพิ่มเติม:

- รักษา **per-patient atomicity**. เมื่อ persistence design พร้อมแล้ว สำหรับ
  field ที่ยืนยันและตั้งใจ apply ให้ row เดียวกัน ควร commit พร้อมกันเป็นชุด:

  ```text
  Patient core
    + baseline/initial state
    + classification
    + OSM assignment
  ```

- ไม่ควรปล่อยให้สร้าง Patient สำเร็จ แต่ baseline ล้มเหลวหรือ assignment หายไป
  เงียบ ๆ โดยไม่มี explicit partial-state design และ safe reconciliation result.
- ไม่ใช้ transaction เดียวครอบทั้ง workbook. Patient ที่ invalid หรือ conflict
  หนึ่งรายไม่ควร rollback patient ที่ valid และไม่เกี่ยวข้อง.
- ให้ recheck actor, target Hospital, identity, relationship, classification/date
  decision และ assignment candidate ใน authoritative server transaction ตาม
  invariant ของแต่ละ domain.

Phase 16C ต้องระบุ partial failure/ retry / idempotency behavior อย่างชัดเจนก่อน
เปิด persistence จริง แต่ห้ามยกระดับ recommendation นี้เป็น business requirement
โดยไม่มีการตัดสินเพิ่มเติม.

## 6. Import reconciliation requirements

สถานะต่อไปนี้เป็น **design inputs สำหรับ Phase 16C/16D เท่านั้น** ยังไม่มีการ
implement ใน Phase 16B.1:

| State | ความหมายขั้นต่ำ |
| --- | --- |
| `READY` | โครงสร้าง, identity, scope และ required decisions พร้อมให้ผู้ใช้ confirm |
| `ALREADY_EXISTS` | exact identity + target relationship มีอยู่แล้ว; recheck server-side และกำหนด idempotent outcome |
| `DUPLICATE_IN_FILE` | normalized identity ซ้ำในไฟล์เดียวกัน |
| `INVALID` | header, shape, value, date หรือ source validation ไม่ผ่าน |
| `CONFLICT` | source identity/HN/relationship หรือ authoritative state ขัดแย้ง |
| `HOSPITAL_MISMATCH` | organization text ไม่สอดคล้องกับ server-selected target Hospital |
| `NEEDS_REVIEW` | ต้องให้คนเลือกหรือแก้ เพราะ ambiguity/gated decision/uncertain reconciliation |

OSM-specific reconciliation อาจมีรายละเอียดประกอบ:

- `OSM_MATCHED` — มี exact unique candidate ใน authorized Hospital scope;
- `OSM_NOT_FOUND` — ไม่มี eligible candidate;
- `OSM_AMBIGUOUS` — มีหลาย candidate หรือชื่อชนกัน.

Clinical/date reconciliation อาจมีรายละเอียดประกอบ:

- `BASELINE_DATE_REQUIRED`;
- `BASELINE_DATA_INVALID`.

สถานะ OSM และ clinical/date ควรเป็น row/field reconciliation details ที่อ่านได้
ร่วมกับ bounded row status ไม่ใช่เหตุผลให้สร้าง giant generalized workflow state
machine. ห้าม discard gated source values หรือ auto-resolve ambiguity แบบเงียบ ๆ.

## 7. Phase 16C design checklist

### Initial clinical state

- [ ] `PatientBaseline` ปัจจุบันสามารถแทน confirmed pre-program initial data ได้
     แค่ไหน โดยไม่เปลี่ยนความหมายของ snapshot เดิม.
- [ ] ระบุ source field ที่ map ได้ตรงกับ current Baseline ทีละ field; ห้าม map
     ทุก field โดย default.
- [ ] ตัดสิน destination ของ height และ HbA1c ซึ่งยังเป็น gap.
- [ ] ยืนยันหน่วยและ conversion/rounding contract โดยเฉพาะค่าที่ header ระบุ
     ต่างกัน.
- [ ] กำหนด correction/history/provenance rule.
- [ ] ตรวจว่า Baseline immutable หรือ correctable ภายใต้ current architecture
     และการแก้ไขต้องสร้าง history หรือ amendment หรือไม่.
- [ ] ปิด effective-date contract ก่อน persist measurement เป็น clinical initial
     state.

### Patient classification

- [ ] exact domain name และตรวจ accepted vocabulary เดิมก่อนสร้างศัพท์ใหม่;
- [ ] allowed vocabulary: controlled, free text หรือ hybrid;
- [ ] lifecycle: initial-only หรือเปลี่ยนระหว่าง Program ได้;
- [ ] scope: Hospital-specific หรือ patient-global;
- [ ] edit authority และ server policy;
- [ ] history/correction/retention;
- [ ] report/filter/search use;
- [ ] ห้ามใช้เป็น diagnosis, Screening, Program state หรือ authorization จนกว่าจะ
     มี requirement แยก.

### OSM caregiver assignment

- [ ] ยืนยัน `PatientOsmAssignment` และ current assignment service/policy เป็น
     authoritative model/service ก่อนเลือก implementation ใหม่;
- [ ] Hospital-scoped candidate lookup และ exact authorized scope;
- [ ] duplicate-name behavior และข้อมูลที่ใช้แสดงเพื่อ disambiguate;
- [ ] not-found behavior และ explicit `OSM_NOT_FOUND` reconciliation;
- [ ] ambiguous behavior และ explicit `OSM_AMBIGUOUS` reconciliation;
- [ ] reassignment, correction และ assignment history;
- [ ] กำหนดว่า importer เปลี่ยน assignment เดิมได้หรือไม่ หรือทุกกรณีต้อง
     reconcile ก่อน. **ห้าม assume ว่า replacement permitted.**
- [ ] ใช้ confirmed User/OSM identity ใน mutation เท่านั้น; ห้ามเขียนด้วย raw
     display name.

### Effective date

- [ ] ได้ final customer confirmation จาก exact follow-up question ของ
     `IMP-REQ-05`;
- [ ] เลือก batch-level date หรือ row/measurement-level dates ตามคำตอบเท่านั้น;
- [ ] กำหนด provenance ว่าวันที่มาจากใคร/source ไหน และ correction/history;
- [ ] กำหนด date-only vs timestamp และ timezone semantics;
- [ ] แยก clinical effective date จาก upload/transaction/database timestamps.

### Patient profile candidates

`dateOfBirth`, gender, phone, address และ emergency contact เป็น candidate
questions แยกต่างหาก. Decision 1 ยืนยันเฉพาะความหมายของ **clinical initial
data** และไม่ยืนยันว่า non-clinical profile/contact fields เหล่านี้พร้อม persist.

- [ ] field ownership และ source authority;
- [ ] visibility, edit authority, correction/history และ retention;
- [ ] PatientProfile vs Person vs relationship destination;
- [ ] emergency-contact relationship persistence semantics;
- [ ] import conflict/idempotency behavior.

## 8. Explicit non-decisions

Phase 16B.1 **ไม่ยืนยัน** สิ่งต่อไปนี้ และห้ามอนุมานเป็น requirement ใหม่:

- Hospital parent-child hierarchy;
- cross-Hospital visibility;
- profile/contact/address ownership;
- emergency-contact relationship persistence;
- PID semantics;
- BMI persistence;
- BP parsing semantics;
- DTX equivalence with blood sugar;
- clinical thresholds;
- diagnoses;
- Screening behavior;
- Program lifecycle behavior;
- final effective-date model;
- automatic OSM replacement;
- fuzzy OSM matching.

นอกจากนี้ยังไม่ยืนยันว่า source field ทุกตัวต้อง persist, ว่า current prototype
field name เท่ากับ approved clinical semantics หรือว่า legacy import behavior เป็น
authority.

## 9. Phase 16C entry gate

Phase 16C DOMAIN/PERSISTENCE DESIGN **เริ่มได้ทันทีหลัง closeout นี้** และไม่ต้อง
รอ `IMP-REQ-03` ตราบใดที่ scope ยังคงเป็น exact current Hospital และไม่มี
parent-child hierarchy behavior.

### READY NOW

- Baseline domain mapping/design;
- height/HbA1c gap analysis;
- patient classification domain design โดยยังไม่ตั้งชื่อ/enum เป็น authoritative
  ก่อนตอบ checklist;
- OSM assignment reconciliation/persistence design ภายใต้ current assignment
  boundary;
- per-patient transaction design;
- profile-field gap inventory;
- schema/service impact analysis.

### BLOCKED FROM FINAL IMPLEMENTATION

- permanent effective-date design/persistence ที่ขึ้นกับ `IMP-REQ-05`;
- Hospital hierarchy behavior, ownership, inherited visibility หรือ cross-Hospital
  authorization ที่ขึ้นกับ `IMP-REQ-03`;
- mutation ของ gated field ใด ๆ ก่อนมี destination, authority, validation และ
  correction/history contract ที่เพียงพอ.

Phase 16C อาจออกแบบทั้ง Alternative A/B ของ date model แบบ conditional และอาจ
เตรียม preferred option เพื่อประหยัดงาน แต่ห้ามสร้าง migration หรือ implement
permanent date model ก่อน final confirmation.

## 10. No-code scope and documentation hygiene

การเปลี่ยนแปลงที่อนุญาตใน phase นี้คือเอกสารนี้เท่านั้น. `docs/CONTEXT.md` ไม่ได้
แก้ เพราะ decision register นี้เป็น handoff เฉพาะ import และไม่จำเป็นต้องเปลี่ยน
architecture context ใน phase documentation-only นี้.

ห้ามแก้หรือสร้าง:

```text
src/**          app/**          tests/**
prisma/**       package.json    package-lock.json
configuration   database        UI
```

ไม่มี TypeScript type ใหม่, migration, parser/service change หรือ persistence
change. เอกสารนี้ไม่เก็บ real patient PII, ไม่ฝัง screenshot/source workbook และ
ไม่ reintroduce sensitive patient roster.

## 11. Closeout verification record

ผลตรวจ ณ closeout:

- `git status --short` แสดงเฉพาะ `?? docs/phases/PHASE_16B1_PATIENT_IMPORT_REQUIREMENT_DECISION_CLOSEOUT.md`;
- `git diff --check` ผ่านโดยไม่มี output หรือ whitespace error;
- `git diff --stat` และ `git diff --cached --stat` ไม่มี tracked/staged change;
  เนื่องจาก deliverable ใหม่ยังไม่ staged จึงตรวจการมีอยู่ของไฟล์ผ่าน
  `git status --short` แทน;
- scope scan ยืนยันว่าไม่มี source, app, tests, Prisma/schema, migration,
  package/configuration หรือไฟล์ `.xlsx` ใหม่ใน status;
- ไฟล์ใหม่เป็น UTF-8 without BOM, UTF-8 decode ผ่าน, ไม่มี `U+FFFD`, mojibake
  หรือ trailing whitespace;
- ตรวจ target links ที่ใช้ในเอกสารด้วย `Test-Path` แล้วพบครบ; repository ไม่มี
  lightweight Markdown/link validation script ใน `package.json`;
- ไม่พบ real patient PII, screenshot หรือ source workbook contents ใน diff/file
  ใหม่;
- decision register ตรวจแล้ว: `IMP-REQ-01/02/04` เป็น `CONFIRMED`,
  `IMP-REQ-03` เป็น `OPEN`, `IMP-REQ-05` เป็น
  `PROVISIONAL — FINAL CONFIRMATION REQUIRED`;
- ไม่รัน full lint/typecheck/integration suite เพราะไม่มี source-code change.

ผลตรวจนี้เป็น documentation verification เท่านั้น และไม่ถือเป็นการเริ่ม
Phase 16C.
