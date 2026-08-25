# DEMI Phase 16C — Patient Import Domain & Persistence Design

**สถานะ:** Documentation-only domain/persistence design handoff สำหรับ Phase 16D

**วันที่ตรวจ:** 2026-08-25 (Asia/Bangkok)

**Starting branch:** `demidemo`

**Starting HEAD:** `fddc8acc934e390083725240acf6723bc2e93da1`

**`origin/main` ณ เวลาเริ่มงาน:** `fddc8acc934e390083725240acf6723bc2e93da1`

**Previous authoritative phases:**

- [Phase 16A — Canonical Patient Import Contract](./PHASE_16A_CANONICAL_PATIENT_IMPORT_CONTRACT.md)
- [Phase 16B.0 — Patient Import Adapter V2 Compatibility Foundation](./PHASE_16B0_PATIENT_IMPORT_ADAPTER_V2_COMPATIBILITY_FOUNDATION.md)
- [Phase 16B.1 — Patient Import Requirement Decision Closeout](./PHASE_16B1_PATIENT_IMPORT_REQUIREMENT_DECISION_CLOSEOUT.md)

เอกสารนี้เป็น handoff จาก requirement ที่ยืนยันแล้วไปสู่ domain/persistence
design เท่านั้น ยังไม่มี schema change, migration, service, policy, importer,
UI หรือ test change และยังไม่เริ่ม Phase 16D implementation. ชื่อ model/field
ที่ระบุเป็น `PROPOSED DESIGN` จะยังไม่ถือเป็น architecture ที่ implement แล้ว
จนกว่า Phase 16D จะผ่าน gates ที่ระบุท้ายเอกสาร.

## 1. Purpose and design boundary

Phase 16C ต้องตอบ field-by-field ว่า:

```text
source field
  ↓
canonical import field
  ↓
business meaning
  ↓
domain owner
  ↓
persistence destination
  ↓
application service boundary
  ↓
authorization
  ↓
conflict / reconciliation
  ↓
correction / history
  ↓
transaction participation
```

จุดมุ่งหมายคือให้ Phase 16D ใช้ design นี้เป็น source เดียวโดยไม่ต้องตีความ
customer answers ใหม่. การที่ field อยู่ใน canonical row หรือปรากฏอยู่ใน
operational roster ไม่ได้แปลว่า field นั้นพร้อม persist.

### 1.1 No-code boundary

อนุญาตให้เปลี่ยนเฉพาะ:

- `docs/phases/PHASE_16C_PATIENT_IMPORT_DOMAIN_PERSISTENCE_DESIGN.md`
- `docs/CONTEXT.md` เฉพาะ glossary/phase handoff ที่จำเป็นจริงเท่านั้น

ห้ามเปลี่ยน `src/**`, `app/**`, `tests/**`, `prisma/schema.prisma`,
`prisma/migrations/**`, `package.json`, `package-lock.json`, configuration,
database หรือ UI. ห้ามสร้าง TypeScript type, migration SQL หรือ service ใหม่ใน
Phase 16C.

### 1.2 Decision status preserved from Phase 16B.1

| ID | Decision | Status |
| --- | --- | --- |
| `IMP-REQ-01` | Clinical roster values เป็น initial pre-program patient data และอยู่ใน logical roster import workflow เดียวกับ patient provisioning | **CONFIRMED** |
| `IMP-REQ-02` | Diabetes/risk source field เป็น patient status/classification label | **CONFIRMED** |
| `IMP-REQ-03` | Hospital / รพ.สต. parent-child hierarchy และ ownership semantics | **OPEN** |
| `IMP-REQ-04` | OSM / Coach source field เป็น intended Patient–OSM caregiver assignment | **CONFIRMED** |
| `IMP-REQ-05` | One shared effective date ต่อ roster import batch | **PROVISIONAL — FINAL CONFIRMATION REQUIRED** |

## 2. Evidence hierarchy

การตัดสินใจในเอกสารนี้ตีความตามลำดับอำนาจต่อไปนี้:

1. latest confirmed customer requirements;
2. accepted ADRs;
3. architecture baseline;
4. current domain, schema, services, policies และ tests;
5. Phase 16A / 16B.0 / 16B.1 evidence;
6. legacy DEMI เป็น behavioral/data-shape evidence เท่านั้น.

ถ้า prototype หรือ legacy behavior ขัดกับ customer requirement ใหม่ ให้
requirement เป็นผู้ชนะ ตราบใดที่ไม่ขัดกับ accepted architecture/security
boundary. Legacy persistence, direct browser writes, hierarchy-based access,
raw identity storage และ fuzzy matching ไม่สามารถยกระดับเป็น target behavior.

### 2.1 Inspection record

ตรวจจาก repository จริงแล้ว:

- `docs/CONTEXT.md`, architecture baseline และ ADR-0001/0002/0004/0005/0006;
- Phase 5B.1 patient provisioning, Phase 6A/6B.2 patient access/assignment,
  Phase 7A Screening, Phase 9C.0 Follow-up, Phase 10A/10B.0/10C.0/10D.0
  Patient Profile/Baseline/status boundary, Phase 15D.1 Final Assessment และ
  Phase 15D.2 Measurement Semantics;
- `prisma/schema.prisma` และ current migrations สำหรับ model/cardinality/index;
- `src/modules/patient-provisioning/**` สำหรับ canonical import, adapter,
  preview/confirm, provisioning และ policy;
- `src/modules/patient-directory/**` สำหรับ profile/detail projection และ
  relationship access;
- `src/modules/patient-baseline/**` สำหรับ Baseline service/query/policy;
- `src/modules/patient-assignment/**` สำหรับ OSM candidate query,
  assignment service และ policy;
- `src/modules/followups/**`, `src/modules/screening/**`,
  `src/modules/patient-program/**`, `src/modules/patient-final-assessment/**`
  สำหรับการแยก domain ที่มี field ดูคล้ายกัน;
- `src/modules/audit/**` สำหรับ audit schema และ transaction-aware audit write;
- `package.json` สำหรับ validation surface. Repository ไม่มี lightweight
  Markdown/link validation script ที่ใช้ได้โดยตรง.

### 2.2 Evidence labels used below

| Label | Meaning |
| --- | --- |
| **DIRECT** | เห็นตรงจาก current file, schema, service, policy, test หรือ customer answer |
| **INFERRED** | สรุปจากหลายหลักฐาน แต่ไม่ใช่ customer wording โดยตรง |
| **PROPOSED DESIGN** | ข้อเสนอสำหรับ Phase 16D ที่ยังไม่ใช่ implementation |
| **ENGINEERING RECOMMENDATION** | แนวทางเพื่อความปลอดภัย/atomicity ไม่ใช่ business requirement ใหม่ |
| **REQUIREMENT-GATED** | ต้องมี customer/owner/clinical decision ก่อน persist อย่างถาวร |
| **RECONCILIATION-ONLY** | เก็บไว้เป็น evidence/preview detail ได้ แต่ไม่ใช่ authority หรือ destination |

## 3. Decision register

รายการนี้เป็น normalized requirement register จาก customer evidence ล่าสุด
โดย `customer answer` เป็น evidence และ `normalized requirement` เป็นถ้อยคำที่
Phase 16D ต้องใช้. ข้อเสนอเชิง domain ที่ยังไม่ยืนยันใช้ป้าย
`PROPOSED DESIGN` และห้ามยกระดับเป็น customer requirement.

### IMP-REQ-01 — Initial clinical data

**Customer answer:**

> ข้อมูลพวกนี้จะถูกนำเป็นข้อมูลตั้งต้นของคนไข้ก่อนเข้าโปรแกรม ให้ใช้การอิมพอร์ตทีเดียวกับเทมเพลตเดิม ไม่แยกกันให้ต้องมากรอกภายหลัง

**Normalized requirement:** roster clinical values are **initial pre-program
patient data** and must be ingested in the same logical user-facing roster
import workflow as Patient provisioning.

**Status: CONFIRMED.** Confirmed is the business timing and one-flow UX, not a
single table, single service or automatic mapping of every source column.

- **Confirmed:** `Upload roster → Preview → Resolve conflicts → Confirm` is one
  logical workflow; backend may fan out into Patient core, initial clinical,
  classification and assignment domain operations.
- **Unconfirmed:** exact mapping/unit/date/history for every clinical field;
  `PatientBaseline` is the strongest existing candidate only where semantics
  match. Height, HbA1c, generic blood sugar/DTX and date semantics remain gated.
- **Architecture consequence:** do not model the source values as Follow-up
  round zero, Screening, Program state or Profile merely because a field name
  looks similar. Preserve domain boundaries and per-patient atomicity in the
  later application service.
- **Phase 16D consequence:** reuse current provisioning and evaluate
  `PatientBaseline` field by field; do not create a mandatory later baseline
  re-entry workflow for values already supplied in the roster.
- **Prohibited assumptions:** all roster fields map to Baseline; import opens a
  Program; source date is authoritative; a present value can be overwritten
  by last-write-wins.

### IMP-REQ-02 — Patient status/classification label

**Customer answer:**

> เป็น label บอกว่าผู้ป่วยคนนี้มีสถานะใด

**Normalized requirement:** wording such as `ประเภทเบาหวาน`, `กลุ่มเสี่ยง`,
`เบาหวาน` or `กลุ่มเสี่ยง หรือ เบาหวาน` represents a Patient
status/classification label.

**Status: CONFIRMED.** It is not confirmed as Diabetes Type 1/2, diagnosis,
ICD, Screening result, Program lifecycle state or clinical rule result.

- **Confirmed:** classification is a distinct business concept from clinical
  measurements and Screening/Program outcomes.
- **Unconfirmed:** exact domain name, controlled vocabulary, free-text policy,
  Hospital-vs-global scope, edit authority, lifecycle, history and
  report/filter use.
- **Architecture consequence:** do not use `DiabetesType`, diagnosis, ICD,
  `ScreeningResult`, a Program status or a generic profile/status shortcut.
- **Phase 16D consequence:** design a separate proposed
  `PatientClassification` domain and resolve the vocabulary/lifecycle gate
  before permanent persistence.
- **Prohibited assumptions:** Type 1/Type 2 meaning, diagnosis authority,
  automatic Screening/Program behavior, exhaustive enum, or silent unknown
  bucket.

### IMP-REQ-03 — Hospital / รพ.สต. hierarchy

**Customer answer:**

> ความสัมพันธ์ของโรงพยาบาลแม่ข่าย ลูกข่ายยังไม่ชัวร์

**Normalized requirement:** Hospital / รพ.สต. parent-child ownership,
visibility and authorization semantics remain unresolved.

**Status: OPEN.**

- **Confirmed:** the exact target Hospital comes from server-authorized actor
  scope. Spreadsheet organization text is source evidence and reconciliation
  information only.
- **Unconfirmed:** parent ownership, child ownership, tenant inheritance,
  visibility/management inheritance and cross-Hospital authorization.
- **Architecture consequence:** continue only within the current exact active
  Hospital scope; do not infer hierarchy from `Hospital.parentHospitalId` or
  spreadsheet text.
- **Phase 16D consequence:** exact-Hospital patient import design may proceed;
  hierarchy behavior is a separate future requirement slice.
- **Prohibited assumptions:** parent/child authorization, shared tenant access,
  automatic child visibility, ownership transfer or source-selected Hospital.

### IMP-REQ-04 — OSM / Coach caregiver assignment

**Customer answer:**

> ใช่ เป็นการ assign ผู้ดูแล อสม หรือ โค้ช

**Normalized requirement:** `ชื่อผู้ดูแล (อสม.)`, `โค้ช` and equivalent aliases
represent the intended Patient–OSM caregiver assignment.

**Status: CONFIRMED.** The roster contains a display/name reference, not an
authoritative User UUID.

- **Confirmed:** resolution must be exact-Hospital scoped and a confirmed
  identity may create/reconcile `PatientOsmAssignment`.
- **Unconfirmed:** whether a Hospital MEMBER may perform the assignment under
  the current OWNER-only mutation policy, and whether an explicit reassignment
  may be selected during import.
- **Architecture consequence:** source text → candidate set → explicit
  reconciliation → confirmed User/OSM identity → assignment mutation. Names
  are search/display values, never identity keys.
- **Phase 16D consequence:** implement safe resolver/reconciliation design with
  `OSM_MATCHED`, `OSM_NOT_FOUND` and `OSM_AMBIGUOUS`; same current assignment is
  a NOOP and a different one requires review.
- **Prohibited assumptions:** fuzzy auto-match, cross-Hospital lookup,
  spreadsheet authority, raw-name assignment or silent replacement.

### IMP-REQ-05 — Shared effective date

**Customer answer:**

> น่าจะเป็นเช่นนั้น

**Normalized requirement:** one shared effective date per roster batch is a
working hypothesis only.

**Status: PROVISIONAL — FINAL CONFIRMATION REQUIRED.** Preserve this exact
follow-up question for the customer:

> ข้อมูลน้ำหนัก รอบเอว น้ำตาล HbA1c และข้อมูลสุขภาพตั้งต้นอื่น ๆ ที่ส่งมาใน roster หนึ่งไฟล์ สามารถถือว่าเป็นข้อมูลตั้งต้น ณ วันที่เดียวกันทั้งไฟล์ได้หรือไม่?

- **Confirmed:** no permanent batch-date or row-date persistence choice may be
  made from `น่าจะเป็นเช่นนั้น`.
- **Unconfirmed:** shared batch date versus row/measurement-level dates,
  date-only/timezone semantics, provenance and correction behavior.
- **Architecture consequence:** design both alternatives and isolate the date
  decision from the current file fingerprint binding.
- **Phase 16D consequence:** if YES, a batch-level date may be bound into
  preview/confirm and used conditionally; if NO, use row/measurement dates and
  do not force a single `PatientBaseline.recordedOn`.
- **Prohibited assumptions:** treating upload time or `serviceVisitDate` as the
  effective date, silently choosing a batch date, or migrating before final
  confirmation.

## Current domain reality

### 3.1 Current patient graph

ปัจจุบันไม่มี `Patient` model เดี่ยวที่เป็นเจ้าของทุกอย่าง. Boundary จริงคือ:

```text
Person
  └── User (optional account; roles include PATIENT)
        └── PatientProfile (one-to-one with Person)
              └── PatientHospitalRelationship (one per PatientProfile + Hospital)
                    ├── PatientBaseline (0..1)
                    ├── PatientOsmAssignment (history; one active)
                    ├── ScreeningAssessment (many)
                    ├── PatientProgram (many, lifecycle)
                    │     ├── PatientFollowup (many)
                    │     └── PatientFinalAssessment (0..1 per Program)
                    └── PatientEvidenceArtifact (relationship-level evidence)
```

ชื่อ `Patient` ในเอกสารนี้จึงหมายถึง patient identity/business aggregate ที่
ประกอบด้วย boundary ข้างต้น ไม่ใช่การเพิ่ม table `Patient` ใหม่.

### 3.2 Person / User identity

**DIRECT:** `Person` ใน `prisma/schema.prisma:92` เก็บ
`identityKeyHash`, `givenName`, `familyName`; `User` ที่ line 106 ผูกกับ Person,
account status และหลาย `UserRole`. Current identity service ใช้ HMAC hash ของ
identity reference และ `PatientProvisioningService` resolve Person ก่อนสร้าง
หรือ reuse User/Profile/relationship.

ผลสำหรับ import:

- National ID เป็น identity reference ไม่ใช่ raw persistence column;
- ห้ามสร้าง Person/User ซ้ำเพราะ roster คนเดิมมีหลาย Hospital หรือหลาย role;
- ชื่อที่ต่างจาก authoritative Person เป็น conflict ไม่ใช่เหตุผลให้ overwrite;
- `givenName`/`familyName` เป็น Person-owned core data ไม่ใช่ Profile หรือ
  Hospital hierarchy data.

### 3.3 PatientProfile

**DIRECT:** `PatientProfile` ใน `prisma/schema.prisma:191` มี `personId` unique
และ nullable fields: `dateOfBirth`, `gender`, `phoneNumber`, `addressText`,
`emergencyContactName`, `emergencyContactPhone`, `occupation`,
`educationLevel`. Current `patient-directory-query-service.ts` อ่าน fields
เหล่านี้ผ่าน authorized relationship detail projection เท่านั้น.

Current reality:

- Profile เป็น one-to-one กับ Person จึงมีโอกาส shared ข้าม Hospital;
- ownership ของวันเกิด เพศ โทรศัพท์ ที่อยู่ และ emergency contact ยังเป็น
  provisional ตาม Phase 10A/10B.0;
- ไม่พบ current PatientProfile mutation application service ใน
  `src/modules/patient-directory/**`; current path เป็น read projection และ
  integration tests seed/update ตรงเพื่อทดสอบ projection;
- import จึงห้ามใช้ schema presence เป็น authorization หรือ source authority;
- Phase 16D ไม่ควรเขียน profile fields จน field ownership, actor authority,
  visibility และ correction contract แยกต่างหาก.

### 3.4 PatientHospitalRelationship

**DIRECT:** `PatientHospitalRelationship` ใน `prisma/schema.prisma:209` เป็น
Hospital-specific relationship ที่มี `hospitalId`, optional `hospitalNumber`
(HN), unique `(patientProfileId, hospitalId)` และ relation ไปยัง clinical/OSM
domains.

ผลสำหรับ import:

- HN เป็น relationship-owned และอยู่ใน exact target Hospital;
- server-authorized target Hospital เป็น authority เสมอ;
- source `hospitalName`, `subHospitalName` และ combined organization text ไม่มี
  อำนาจเปลี่ยน `hospitalId`;
- `Hospital.parentHospitalId` ที่ schema line 158 มีอยู่จริง แต่ current
  patient policies/queries ไม่ใช้ hierarchy ขยาย scope;
- `IMP-REQ-03` จึงยังไม่อนุญาต parent-child ownership, visibility หรือ tenant
  inheritance.

### 3.5 PatientBaseline

**DIRECT:** `PatientBaseline` ใน `prisma/schema.prisma:385` มี cardinality
`PatientHospitalRelationship 1 ─── 0..1 PatientBaseline` ผ่าน unique
`patientHospitalRelationshipId`. Current fields คือ:

```text
recordedOn                 Date-only business date
recordedByUserId           server-derived writer
weight                     nullable raw measurement
waistCircumference         nullable raw measurement
bloodPressureSystolic      nullable raw component
bloodPressureDiastolic     nullable raw component
bloodSugarDtx              nullable raw DTX-named field
adaptationSummary          nullable bounded text
adaptationObstacles        nullable bounded text
adaptationOpportunities    nullable bounded text
confidenceScore            nullable integer 0..10 prototype field
confidenceImprovementPlan  nullable bounded text
summary                    nullable bounded text
recommendations            nullable bounded text
createdAt                  system timestamp
```

Current service/policy facts:

- `createPatientBaseline` uses a serializable transaction and exact relationship
  access; create policy allows direct active Hospital OWNER/MEMBER or exact
  active assigned OSM under `patient:baseline:create`;
- `recordedByUserId` comes from server-authoritative actor;
- duplicate Baseline is a conflict; current service has no update, delete,
  replace, amendment หรือ versioning path;
- `patient_baseline.created` audit is written in the same transaction and does
  not include clinical payload;
- current service may link a newly created Baseline to an active Program that
  has no initial Baseline, but it does not create a Program;
- `recordedOn` is separate from `createdAt` and is currently a date-only value.

**Design consequence:** `PatientBaseline` is the strongest existing candidate
for confirmed initial pre-program clinical data, but field names alone do not
confirm unit, DTX equivalence, effective date, or correction semantics.

### 3.6 PatientFollowup

**DIRECT:** `PatientFollowup` in `prisma/schema.prisma:347` is a relationship-
scoped longitudinal record. It can optionally link to `PatientProgram`,
`PatientAppointment` and `PatientGoalPlan`, allocates a relationship/Program
round, records server `recordedAt`, and is created append-only through a
serializable service.

It has fields that look like Baseline (`weight`, `waistCircumference`, BP,
`bloodSugar`) but their meaning is follow-up observation/progress. Roster values
must not be inserted as Follow-up round zero, standalone Follow-up, or a hidden
Program event. `IMP-REQ-01` makes them initial pre-program state, not follow-up.

### 3.7 PatientOsmAssignment

**DIRECT:** `PatientOsmAssignment` in `prisma/schema.prisma:234` stores:

- exact `patientHospitalRelationshipId`;
- authoritative `osmUserId`;
- server-derived `assignedByUserId`;
- `createdAt`, `endedAt`, `endedByUserId` for history.

The migration enforces one active assignment per relationship with a partial
unique index where `endedAt IS NULL`. Current query candidate eligibility is:

```text
ACTIVE User
+ Role.OSM
+ active OsmHospitalRelationship in exact target Hospital
+ ACTIVE target Hospital
```

Current mutation service:

- requires `Role.HOSPITAL`, capability `patient:assign-osm`, direct active
  Hospital `OWNER`, and active target Hospital;
- rejects assigning the actor to themself;
- allows same active OSM as `NOOP`;
- currently ends an active assignment and creates a new one for a different
  OSM, recording history and audit;
- supports explicit unassignment and serializable retry.

This current replacement behavior is not automatic import authority. Phase 16D
must add an import guard/reconciliation decision before calling any reassignment
operation.

### 3.8 Screening, Program and Final domains

**ScreeningAssessment** (`schema.prisma:252`) is a relationship-scoped submitted
assessment with versioned question/scoring context, responses/result JSON and
server submission time. Its result labels do not become Patient classification
merely because both are called “status” or “level”. Screening is not an import
destination for `diabetesClassification`.

**PatientProgram** (`schema.prisma:412`) is a relationship-scoped lifecycle
episode with `ACTIVE`/`COMPLETED` status and optional `initialBaselineId`.
Roster import must not open, complete, mutate or infer a Program.

**PatientFinalAssessment** (`schema.prisma:440`) is an immutable 0..1 record per
exact Program, created only while the Program is active. Its weight/BP/blood
sugar fields are Final-stage values, not initial roster state.

**Same-looking field ≠ same business meaning.** The same numeric label can exist
in Baseline, Follow-up and Final because it is observed at different lifecycle
boundaries. Destination follows business meaning and owner, not spelling.

### 3.9 Current import reality

**DIRECT:** The V2 adapter creates a transient
`CanonicalPatientImportRow` (`src/modules/patient-provisioning/import/patient-import-contract.ts:122`)
with identity, profile, address, clinical, organization and caregiver candidate
families. It bounds `.xlsx` input to 5 MB/500 rows and performs header discovery,
normalization, diagnostics and explicit aliases.

Current persistence path:

```text
Excel adapter
  → canonical transient candidate
  → previewPatientProvisioning
  → confirm file fingerprint + actor + target Hospital
  → importPatientProvisioning
  → one public provisioning transaction per row
  → Person/User(PATIENT)/PatientProfile/PatientHospitalRelationship/HN only
```

Current `importPatientProvisioning` loops rows and calls the public provisioning
operation independently. Invalid/conflicting rows do not roll back unrelated
rows, but there is no cross-domain Baseline/classification/OSM atomicity yet.
The current preview binding includes file fingerprint, actor and target Hospital
but not an effective date or resolved domain choices. This is a known Phase 16D
security/contract gap, not something Phase 16C silently patches in code.

## Updated import journey

The confirmed target business journey is one logical import workflow:

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
    baseline/classification/date diagnostics
  ↓
Confirm
  ↓
Per-patient transaction (Phase 16D design)
    ├── Patient core
    ├── Hospital relationship / HN
    ├── initial pre-program data
    ├── status/classification label
    └── OSM caregiver assignment
  ↓
Import summary
```

Initial pre-program values, the classification label and the OSM assignment are
now confirmed parts of this **logical** journey. Their exact persistence
implementation, transaction-composable service seams and authorization
composition remain Phase 16D work. This does not require one database table or
one public service.

Hospital hierarchy behavior remains outside this journey until `IMP-REQ-03` is
confirmed. Effective-date behavior remains conditional on `IMP-REQ-05`.

## 4. Design gates and explicit terminology

The following gates are used in the field matrix and Phase 16D handoff:

| Gate ID | Gate | Impact |
| --- | --- | --- |
| `IMP-REQ-03` | Hospital / รพ.สต. hierarchy remains OPEN | Blocks hierarchy behavior only; does not block exact-Hospital import |
| `IMP-REQ-05` | Final effective-date semantics | Blocks permanent Baseline/date schema and any date-bound initial measurement write |
| `P16C-CLASS-01` | Classification vocabulary, lifecycle, edit authority, history and report use | Blocks permanent classification persistence; domain/scope recommendation can proceed |
| `P16C-CLINICAL-01` | Unit/protocol and DTX-vs-blood-sugar semantics | Blocks height/HbA1c/generic blood-sugar/DTX writes where exact meaning is not proven |
| `P16C-OSM-01` | OWNER vs MEMBER authority for caregiver mutation | Blocks full caregiver mutation for a MEMBER under current policy |
| `P16C-PROFILE-01` | Profile/contact/address ownership and mutation authority | Blocks automatic import of non-clinical profile data |
| `P16C-ADDRESS-01` | Deterministic structured-address formatting/ownership | Blocks concatenating roster components into authoritative `addressText` |
| `P16C-EMERGENCY-01` | Emergency-contact relationship semantics | Blocks partial name/phone persistence that drops relationship meaning |

Readiness values used below:

- `READY_FOR_PHASE_16D` — destination and current authority are sufficient for
  implementation, subject to ordinary code review;
- `DESIGN_READY_BUT_DATE_BLOCKED` — domain mapping is clear, but permanent write
  waits for `IMP-REQ-05`;
- `DESIGN_READY_BUT_AUTH_BLOCKED` — domain mapping is clear, but current
  authorization does not permit the intended actor path;
- `REQUIREMENT_GATED` — domain/persistence choice needs a missing requirement;
- `DEFERRED_PENDING_REQUIREMENT` — current support exists or is plausible, but
  automatic import is intentionally deferred;
- `RECONCILIATION_ONLY` — source evidence may appear in preview, never authority;
- `NOT_A_PERSISTED_FIELD` — derived/provenance/source shape must not be stored as
  a business field;
- `UNSUPPORTED` — no safe current destination or parsing contract exists.

## 5. Canonical field-to-domain matrix

The matrix is the implementation handoff. “Current support” means what the
repository can currently represent, not that the source is approved for import.
For persisted mutations, authorization is always server-side and exact target
Hospital scoped; a browser-provided UUID, source name or role is never authority.

### 5.1 Identity, relationship and source-name fields

| Field | Business meaning / requirement status | Current candidate and support | Recommended destination | Readiness | Authorization owner / scope | Conflict + correction/history | Phase 16D / blocker |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `nationalId` | Thai National ID identity reference; current Patient core is confirmed | `Person.identityKeyHash` via identity service; raw value is not stored | Reuse `Person` identity boundary and `PatientProvisioningService` | `READY_FOR_PHASE_16D` | Existing `patient:provision` bulk policy; active direct Hospital scope; server HMAC identity boundary | Duplicate normalized identity or name mismatch → `CONFLICT`; no silent identity re-key or overwrite; correction is separate audited identity workflow | Included; no blocker |
| `givenName` | Person given name; confirmed Patient core | `Person.givenName` nullable current column | Reuse `Person.givenName` | `READY_FOR_PHASE_16D` | `patient:provision`, exact target Hospital for provisioning | Existing non-empty conflicting name → `CONFLICT`; current service fills only missing name; correction is not import last-write-wins | Included; no blocker |
| `familyName` | Person family name; confirmed Patient core | `Person.familyName` nullable current column | Reuse `Person.familyName` | `READY_FOR_PHASE_16D` | Same as `givenName` | Existing conflict → `CONFLICT`; no silent overwrite or history loss | Included; no blocker |
| `hospitalNumber` | Hospital-local HN; confirmed Patient core/relationship data | `PatientHospitalRelationship.hospitalNumber` nullable VarChar(64) | Reuse exact target relationship HN | `READY_FOR_PHASE_16D` | `patient:provision` bulk; target Hospital is server-authorized | Missing existing HN may be filled; different existing HN → `RELATIONSHIP_CONFLICT`; transfer/reuse history is out of scope | Included; no blocker |
| `combinedNameText` | Source combined name; not safe to split by guess | Canonical transient field only | Preview/reconciliation evidence; no Person write | `RECONCILIATION_ONLY` | Display only to actor already authorized for target import | Do not split or overwrite Person names; source mismatch remains review detail | No persistence; no blocker |
| `sourceSequenceNumber` | Workbook row/order provenance, not patient identity | Canonical provenance candidate only | Transient import diagnostics; not a domain field | `NOT_A_PERSISTED_FIELD` | No domain authorization; never used for identity/scope | Row order is not identity, idempotency or clinical date; no correction history | No persistence; no blocker |
| `externalPatientId` / `PID` | External identifier candidate; semantics are not confirmed | No current accepted field; must not become raw National ID or HN | Defer until a namespaced external-identifier contract exists | `REQUIREMENT_GATED` | Future explicit identifier capability and exact relationship/organization scope | Unknown namespace/collision → review; never use as identity key by assumption; blocker `P16C-PID-01` | Not included; `P16C-PID-01` |

### 5.2 Profile and contact candidates

| Field | Business meaning / requirement status | Current candidate and support | Recommended destination | Readiness | Authorization owner / scope | Conflict + correction/history | Phase 16D / blocker |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `dateOfBirth` | Demographic profile candidate; not confirmed for import persistence | Nullable `PatientProfile.dateOfBirth`; current read-only detail projection | Defer automatic import; retain as canonical candidate only | `DEFERRED_PENDING_REQUIREMENT` | Future profile/Person authority must be explicit; target Hospital cannot silently mutate global Person data | Different existing value → review; correction/history/visibility unresolved | Not included; `P16C-PROFILE-01` |
| `gender` | Demographic/profile label; vocabulary and ownership not final | Nullable `PatientProfile.gender` string; no final enum | Defer automatic import; do not infer controlled values | `DEFERRED_PENDING_REQUIREMENT` | Future field-specific profile policy; exact relationship read scope does not establish write authority | Existing mismatch → review; no silent normalization or overwrite; history unresolved | Not included; `P16C-PROFILE-01` |
| `phoneNumber` | Contact data; potentially shared or Hospital-owned | Nullable `PatientProfile.phoneNumber`; parser normalizes candidate | Defer automatic import | `DEFERRED_PENDING_REQUIREMENT` | Future contact owner and visibility policy; no current profile write service | Existing mismatch → review; correction/retention and Patient visibility unresolved | Not included; `P16C-PROFILE-01` |

`dateOfBirth`, `gender`, `phoneNumber` remain unconfirmed even though the schema
can store them. `IMP-REQ-01` confirms initial clinical data, not every profile
field in the roster.

### 5.3 Initial clinical and classification fields

| Field | Business meaning / requirement status | Current candidate and support | Recommended destination | Readiness | Authorization owner / scope | Conflict + correction/history | Phase 16D / blocker |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `weight` | Pre-program initial clinical measurement; `IMP-REQ-01` confirmed | Exact current `PatientBaseline.weight`, nullable; current prototype unit label is kg but not owner-approved | Reuse `PatientBaseline.weight` in the relationship-owned initial snapshot | `DESIGN_READY_BUT_DATE_BLOCKED` | Component of initial-data write; exact Hospital relationship and approved baseline capability | Same existing Baseline value → `NOOP`/`ALREADY_EXISTS`; different → `BASELINE_CONFLICT`; current Baseline immutable, no overwrite | Include after `IMP-REQ-05`; date gate `IMP-REQ-05` |
| `height` | Pre-program initial clinical measurement; unit may be cm, m or unknown | No schema field; adapter carries `height` + `heightUnit` and flags `UNIT_NOT_CONFIRMED` | Add typed `PatientBaseline.heightCm` only after explicit unit contract; do not put height in Profile | `REQUIREMENT_GATED` | Same relationship-scoped initial-data authority | Explicit `cm` accepted; explicit `m` may convert to cm only under approved rule; unknown/ambiguous unit → review; correction follows Baseline rule | Design now, write after `P16C-CLINICAL-01` and `IMP-REQ-05` |
| `waistCircumference` | Pre-program initial clinical measurement; `IMP-REQ-01` confirmed | Exact current `PatientBaseline.waistCircumference`, nullable; current cm label is provisional | Reuse current Baseline field | `DESIGN_READY_BUT_DATE_BLOCKED` | Component of initial-data write; exact relationship scope | Same → `NOOP`; different → `BASELINE_CONFLICT`; no silent replacement; amendment/history remains open | Include after `IMP-REQ-05`; date gate `IMP-REQ-05` |
| `bloodSugar` | Generic blood-sugar candidate; not proven equivalent to DTX | Current Baseline field is specifically `bloodSugarDtx`; Follow-up/Final use a different field name | Do not map to `bloodSugarDtx` until semantics/unit/context are confirmed; if distinct, add a typed Baseline field later | `REQUIREMENT-GATED` | Future initial-clinical capability, exact relationship | Unknown DTX equivalence → `BASELINE_DATA_INVALID`/`NEEDS_REVIEW`; no correction until measurement contract exists | Not included now; `P16C-CLINICAL-01` |
| `hba1c` | Distinct pre-program clinical/lab measurement; `IMP-REQ-01` confirms initial intent | No accepted current rewrite field or service | Preferred: own typed `PatientBaseline.hba1c` field if unit, precision, date and history are confirmed; never map into blood sugar | `REQUIREMENT-GATED` | Initial-clinical capability; exact relationship | Same → `NOOP`; different → Baseline conflict; correction/history and lab/sample date must be explicit | Design gap analysis now; persistence blocked by `P16C-CLINICAL-01` + `IMP-REQ-05` |
| `diabetesClassification` | Patient status/classification label; `IMP-REQ-02` confirmed; not diagnosis/ICD/Screening/Program state | No current accepted field, enum or service | Preferred proposed owner: relationship-scoped `PatientClassification` record with bounded `label`; not `DiabetesType` | `REQUIREMENT-GATED` | Future classification write capability on exact `PatientHospitalRelationship`; no global assumption | Same → `NOOP`; different → `CLASSIFICATION_CONFLICT`; no silent overwrite; initial record immutable until lifecycle/history decision | Design now; persistence blocked by `P16C-CLASS-01` and date condition if applicable |

### 5.4 Hospital organization and caregiver candidates

| Field | Business meaning / requirement status | Current candidate and support | Recommended destination | Readiness | Authorization owner / scope | Conflict + correction/history | Phase 16D / blocker |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `hospitalName` | Source organization text; evidence for reconciliation, not authority | Canonical organization candidate; current preview compares normalized source Hospital text with selected Hospital name | No persistence; compare against server-selected target Hospital | `RECONCILIATION_ONLY` | Server-authorized target Hospital; source cannot select or widen scope | Mismatch → `HOSPITAL_MISMATCH`; no parent/child inference or ownership update | Included in preview only; `IMP-REQ-03` does not block exact scope |
| `subHospitalName` | Source รพ.สต./child-site text; parent-child semantics open | Canonical candidate only; no current relationship child-owner field | No persistence; reconciliation evidence only | `RECONCILIATION_ONLY` | Exact target Hospital only; no hierarchy lookup | Mismatch/unknown → `HOSPITAL_MISMATCH` or `NEEDS_REVIEW`; no inheritance | Preview only; `IMP-REQ-03` |
| `organizationCombinedText` | Combined source organization text; ambiguous organization evidence | Canonical candidate only | No persistence; bounded preview detail | `RECONCILIATION_ONLY` | Same exact target Hospital scope | Ambiguous organization → `HOSPITAL_MISMATCH`/`NEEDS_REVIEW`; no tenant authority | Preview only; `IMP-REQ-03` |
| `osmCaregiverName` | Intended actual Patient–OSM caregiver assignment; `IMP-REQ-04` confirmed | Current query can search eligible OSM candidates by display name; assignment model stores UUID, not name | Resolve to exact authorized `User`/OSM UUID, then mutate `PatientOsmAssignment` | `DESIGN_READY_BUT_AUTH_BLOCKED` | `patient:assign-osm` current policy requires active Hospital OWNER; exact target Hospital and active OSM–Hospital relationship | zero → `OSM_NOT_FOUND`; many → `OSM_AMBIGUOUS`; one → `OSM_MATCHED`; existing different assignment → `OSM_ASSIGNMENT_CONFLICT`; explicit reassignment only | Resolver design ready; full MEMBER one-flow blocked by `P16C-OSM-01` |

Safe caregiver contract:

```text
source display text
  ↓
exact target-Hospital candidate query
  ↓
zero / one / many eligible User candidates
  ↓
preview reconciliation
  ↓
confirmed User/OSM UUID
  ↓
PatientOsmAssignment mutation
```

Names are search/display aids only. There is no fuzzy auto-match, raw-name
write, cross-Hospital lookup or spreadsheet authority.

### 5.5 Address and emergency-contact candidates

| Field | Business meaning / requirement status | Current candidate and support | Recommended destination | Readiness | Authorization owner / scope | Conflict + correction/history | Phase 16D / blocker |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `houseNumber` | Structured address component; source evidence only | No structured PatientProfile column | Defer; do not concatenate automatically | `DEFERRED_PENDING_REQUIREMENT` | Future address owner and exact/global scope required | Existing address conflict → review; no component-level history contract | Not included; `P16C-ADDRESS-01` |
| `villageNumber` | Structured address component; source evidence only | No current field | Defer | `DEFERRED_PENDING_REQUIREMENT` | Future address policy | No silent overwrite or lossy formatting | Not included; `P16C-ADDRESS-01` |
| `villageName` | Structured address component; source evidence only | No current field | Defer | `DEFERRED_PENDING_REQUIREMENT` | Future address policy | Same as other structured components | Not included; `P16C-ADDRESS-01` |
| `soi` | Structured address component; source evidence only | No current field | Defer | `DEFERRED_PENDING_REQUIREMENT` | Future address policy | Same as other structured components | Not included; `P16C-ADDRESS-01` |
| `road` | Structured address component; source evidence only | No current field | Defer | `DEFERRED_PENDING_REQUIREMENT` | Future address policy | Same as other structured components | Not included; `P16C-ADDRESS-01` |
| `province` | Structured address component; source evidence only | No current structured field | Defer | `DEFERRED_PENDING_REQUIREMENT` | Future address policy | Geography vocabulary/authority unresolved | Not included; `P16C-ADDRESS-01` |
| `district` | Structured address component; source evidence only | No current structured field | Defer | `DEFERRED_PENDING_REQUIREMENT` | Future address policy | Geography vocabulary/authority unresolved | Not included; `P16C-ADDRESS-01` |
| `subdistrict` | Structured address component; source evidence only | No current structured field | Defer | `DEFERRED_PENDING_REQUIREMENT` | Future address policy | Geography vocabulary/authority unresolved | Not included; `P16C-ADDRESS-01` |
| `postalCode` | Address component; source evidence only | No current structured field | Defer | `DEFERRED_PENDING_REQUIREMENT` | Future address policy | Format/authority/history unresolved | Not included; `P16C-ADDRESS-01` |
| `addressText` | Human-readable address candidate | Nullable `PatientProfile.addressText` exists, but no confirmed formatting/ownership or mutation service | Do not build `addressText` from components without deterministic approved formatter; defer otherwise | `DEFERRED_PENDING_REQUIREMENT` | Future profile/address capability; global-vs-Hospital scope unresolved | Existing different text → review; no lossy concatenation or silent overwrite | Not included; `P16C-ADDRESS-01` + `P16C-PROFILE-01` |
| `emergencyContactName` | Contact person candidate | Nullable `PatientProfile.emergencyContactName` exists | Defer entire emergency-contact family until relationship semantics are accepted | `DEFERRED_PENDING_REQUIREMENT` | Future profile/contact authority; exact scope unresolved | Do not persist name without agreed phone/relationship semantics | Not included; `P16C-EMERGENCY-01` |
| `emergencyContactPhone` | Contact phone candidate | Nullable `PatientProfile.emergencyContactPhone` exists | Defer entire emergency-contact family | `DEFERRED_PENDING_REQUIREMENT` | Future contact authority | Do not partially persist or overwrite | Not included; `P16C-EMERGENCY-01` |
| `emergencyContactRelationship` | Relationship-to-patient meaning | No current persistence field | Preserve as transient evidence; do not discard silently, but do not persist partial family | `REQUIREMENT-GATED` | Future emergency-contact domain owner | Missing destination means `NEEDS_REVIEW`; blocker `P16C-EMERGENCY-01` | Not included; `P16C-EMERGENCY-01` |

The preferred MVP outcome for both address and emergency contact is **defer the
whole semantic family**, rather than store a lossy subset because two columns
happen to exist.

### 5.6 Clinical candidates without a safe initial destination

| Field | Business meaning / requirement status | Current candidate and support | Recommended destination | Readiness | Authorization owner / scope | Conflict + correction/history | Phase 16D / blocker |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `ageAtRoster` | Age derived at file preparation time; not stable identity data | Canonical numeric candidate only | Do not persist; validate/display only if useful | `NOT_A_PERSISTED_FIELD` | No mutation authority; preview under exact import scope | Never overwrite DOB or become authoritative age; no history | No persistence; no blocker |
| `bloodPressureText` | Combined BP source string; grammar/units/pairing not confirmed | Current Baseline requires separate systolic/diastolic numeric fields | Keep as diagnostic/reconciliation evidence; do not split by guess | `RECONCILIATION_ONLY` | No clinical mutation until parser/units contract | Unparseable/ambiguous → `BASELINE_DATA_INVALID`; no threshold/interpretation | No persistence; `P16C-CLINICAL-01` |
| `pulseRate` | Clinical measurement candidate; requirement not confirmed | No current Baseline field or accepted service contract | Defer; no new field in this phase | `REQUIREMENT-GATED` | Future clinical capability and exact relationship scope | Invalid/unknown → review; no silent loss once a future requirement exists | Not included; `P16C-PULSE-01` |
| `bmi` | Derived value, normally dependent on weight/height/date | No accepted current persistence owner; current report evidence is not authority | Do not store merely because source contains it; derive only under approved formula and source dates | `NOT_A_PERSISTED_FIELD` | No direct mutation authority | Never overwrite source measurements; no formula/threshold assumption | No persistence; no blocker |
| `dtxReading` | DTX-labelled clinical candidate; DTX equivalence remains open | Current `PatientBaseline.bloodSugarDtx` is the nearest raw field, but 15D.2 explicitly keeps semantics provisional | Do not map automatically; map only after DTX/unit/context decision | `REQUIREMENT-GATED` | Future initial-clinical capability and exact relationship | Unknown DTX/generic blood sugar relation → `BASELINE_DATA_INVALID`/`NEEDS_REVIEW` | Not included now; `P16C-CLINICAL-01` |
| `riskFactorText` | Free-text risk evidence; not confirmed diagnosis, Screening result or classification vocabulary | Canonical transient candidate only | Reconciliation/validation evidence; no diagnosis/status write | `RECONCILIATION_ONLY` | Preview under exact target Hospital only | Unknown text → `NEEDS_REVIEW`; never normalize to diagnosis or rule result | No persistence; no blocker |
| `serviceVisitDate` | Visit/measurement timing candidate for longitudinal data | Canonical candidate; current Baseline has separate `recordedOn` and Follow-up has server `recordedAt` | Do not treat as batch date or Baseline date; defer visit import | `RECONCILIATION_ONLY` | No mutation until a visit/follow-up import contract exists | Different dates imply row/measurement semantics; no last-write-wins | No persistence; `IMP-REQ-05` if reused as initial date |
| `extendedMeasurementSeries` | Repeated observations/visit series, not one initial snapshot | Canonical bounded transient candidates only | Future separate follow-up/observation import slice; not Baseline | `NOT_A_PERSISTED_FIELD` | No current import mutation authority | Must preserve occurrence/date/context before any future write | No persistence; separate future requirement |

## Phase 16C design checklist

This checklist makes the required design questions explicit. `[DESIGN ANSWER]`
means this phase has a recommendation; `[GATED]` means Phase 16D must not make
the permanent decision without the named requirement/owner evidence.

### Initial clinical state

- `[DESIGN ANSWER]` Can current `PatientBaseline` represent confirmed
  pre-program initial data? **Yes, preferred for the MVP where field semantics
  match; do not replace it with Follow-up, Screening or Program.**
- `[DESIGN ANSWER]` Which source fields map exactly? **`weight` and
  `waistCircumference` are the current exact-shape candidates; `bloodSugar` and
  `dtxReading` are not equivalent by name; height and HbA1c are gaps.**
- `[DESIGN ANSWER / GATED]` Where should height and HbA1c live? **Preferred
  typed fields on `PatientBaseline`; unit, date, precision and history gates
  remain open.**
- `[GATED]` Are units sufficiently explicit? **No; accept only an explicit
  approved unit and reject ambiguous values.**
- `[GATED]` What correction/history rule applies? **Current Baseline is
  immutable with no amendment path; owner must decide before adding new fields.**
- `[DESIGN ANSWER]` Is Baseline immutable or correctable? **Current behavior is
  immutable; re-import must conflict rather than overwrite until an explicit
  correction contract exists.**

### Patient classification

- `[DESIGN ANSWER]` Exact domain name? **Proposed `PatientClassification`, not
  `DiabetesType`.**
- `[GATED]` Allowed vocabulary and controlled-vs-free-text policy? **Evidence
  suggests `กลุ่มเสี่ยง` and `เบาหวาน`; confirm the exhaustive set before an
  enum. Until then use a bounded string with server validation and review
  unknown values.**
- `[GATED]` Who may change it, whether it can change during the Program, whether
  history is retained, and whether reports/filters depend on it? **Not
  confirmed; no write capability or lifecycle overwrite is implied.**
- `[DESIGN ANSWER / GATED]` Scope? **Proposed Hospital-relationship-scoped
  because intake context is Hospital-specific; owner confirmation is still
  required before persistence.**

### OSM assignment

- `[DESIGN ANSWER]` Authoritative model/service? **Reuse current
  `PatientOsmAssignment` and its policy/service after adding a transaction-
  composable import seam.**
- `[DESIGN ANSWER]` Lookup scope? **Exact target Hospital only, with ACTIVE User,
  OSM role and active OSM–Hospital relationship.**
- `[DESIGN ANSWER]` Duplicate-name behavior? **Many candidates →
  `OSM_AMBIGUOUS`; names are not identity.**
- `[DESIGN ANSWER]` Not-found behavior? **Zero candidates → `OSM_NOT_FOUND` and
  `NEEDS_REVIEW`.**
- `[DESIGN ANSWER]` Reassignment behavior? **Existing different assignment →
  `OSM_ASSIGNMENT_CONFLICT`; explicit confirmation and current assignment policy
  are required.**
- `[GATED]` Correction/history and whether import may replace an existing
  assignment? **Existing history is retained; automatic replacement is not
  allowed; OWNER/Member authority and explicit reassignment remain gates.**

### Effective date

- `[GATED]` Final customer confirmation? **Preserve the exact
  `IMP-REQ-05` question; `น่าจะเป็นเช่นนั้น` is not final.**
- `[DESIGN ANSWER]` Alternatives? **Alternative A: one batch-level date;
  Alternative B: row/measurement-level dates.**
- `[GATED]` Provenance and date-only/timezone semantics? **Must be specified
  with the selected alternative; current upload time is not a substitute.**

### Patient profile candidates

- `[GATED / DEFERRED]` Date of birth, gender, phone, address and emergency
  contact ownership, scope, edit authority, conflict and correction rules are
  not confirmed. They remain canonical candidates/reconciliation evidence and
  are not Phase 16D automatic persistence.

## 6. Patient core design

The current core remains unchanged:

```text
nationalId
  → HMAC identity reference
  → Person.identityKeyHash
  → reuse/create User when needed
  → ensure PATIENT role
  → ensure PatientProfile
  → ensure PatientHospitalRelationship(target Hospital)
  → fill/check HN
```

Phase 16D should reuse `PatientProvisioningService` semantics:

- resolve Person before create;
- preserve existing User/roles/profile;
- active direct Hospital OWNER/MEMBER can use current bulk provisioning policy;
- target Hospital is server-authorized and active;
- current HN conflict behavior remains;
- one invalid/conflicting row does not roll back unrelated rows.

No new `Patient` table, raw National ID field, PID alias, or global HN field is
proposed.

## 7. Initial clinical Baseline design

### 7.1 Domain owner decision

**PROPOSED DESIGN:** Current `PatientBaseline` remains the domain owner for the
confirmed pre-program initial snapshot. This is justified by:

- `IMP-REQ-01` explicitly gives the values initial pre-program meaning;
- current Baseline is already relationship-owned, 0..1 and date/writer-aware;
- current architecture explicitly excludes Follow-up round zero, Screening,
  Program state and Profile field-group substitution;
- the MVP needs a small durable snapshot, not a generic clinical data platform.

This decision does not mean every source field maps to Baseline. The initial
Baseline mutation is created only when at least one supported initial clinical
value is present and ready. Do not create an empty/fabricated Baseline solely
because a roster row exists.

### 7.2 Exact current mappings

| Source | Current Baseline field | Decision |
| --- | --- | --- |
| `weight` | `PatientBaseline.weight` | Exact enough for field shape; retain source unit validation and date gate |
| `waistCircumference` | `PatientBaseline.waistCircumference` | Exact enough for field shape; retain source unit validation and date gate |
| `bloodPressureText` | none | Do not parse combined text; source remains reconciliation-only |
| `bloodSugar` | not safely exact to `bloodSugarDtx` | Do not map until DTX/generic blood-sugar semantics are confirmed |
| `dtxReading` | nearest field `bloodSugarDtx` | Do not map automatically; DTX equivalence is explicitly non-decided |
| `height` | none | Preferred future `heightCm`; unit/date gate applies |
| `hba1c` | none | Preferred future typed `hba1c`; unit/date/history/date gate applies |
| `diabetesClassification` | none | Separate `PatientClassification`; never Baseline measurement |

### 7.3 Unit and validation boundary

Current numeric schemas provide finite/positive structural validation only. They
do not establish clinical ranges, device context, fasting/random context,
precision or official units. Phase 16D must therefore:

- accept a source unit only when it is explicit and in the accepted contract;
- normalize only through an explicit, tested conversion rule;
- send unknown/ambiguous unit to `BASELINE_DATA_INVALID` or `NEEDS_REVIEW`;
- never derive unit from magnitude, column order or Thai label guess;
- keep clinical thresholds and interpretation outside import persistence.

For `weight` and `waistCircumference`, current prototype labels provide a
reasonable engineering candidate of kg/cm, but owner confirmation of source
protocol remains required before treating them as official clinical units.

### 7.4 Baseline correction/history

Current Baseline is immutable after creation. Phase 16D must preserve that safe
property unless a separate correction contract is accepted. Re-import behavior:

```text
no Baseline + supported values       → create once
existing Baseline + same values     → NOOP / ALREADY_EXISTS
existing Baseline + different value → BASELINE_CONFLICT / NEEDS_REVIEW
```

No import path may update an existing Baseline because the public current service
would otherwise expose no amendment/history semantics. A future correction must
preserve the original or use an explicitly accepted amendment design.

### 7.5 Existing Program interaction

The current Baseline service may link a new Baseline to an active Program that
has no `initialBaselineId`. The import orchestrator must:

- never create or complete a Program;
- reuse the existing Baseline domain invariant if it remains accepted;
- make any Program-link side effect visible in code/tests and audit review;
- not reinterpret a roster row as a Program start or Follow-up.

If the customer later requires import to be forbidden once a Program exists,
that is a separate policy decision; Phase 16C does not silently choose it.

## 8. Height and HbA1c design

### 8.1 Alternative A — Extend `PatientBaseline` (preferred MVP)

Conceptually:

```text
PatientBaseline
  weight
  heightCm       nullable typed measurement
  waistCircumference
  bloodSugarDtx  only if DTX meaning is accepted
  hba1c          nullable typed measurement
  recordedOn
  recordedByUserId
```

Benefits:

- smallest durable change for confirmed initial pre-program semantics;
- one relationship-owned initial snapshot and one existing read/audit boundary;
- no duplicate Baseline/Follow-up/Screening meaning;
- `heightCm` avoids ambiguous stored unit naming;
- HbA1c remains a distinct typed field and cannot be mistaken for blood sugar.

Risks:

- a single snapshot assumes the selected initial values share the same business
  date once `IMP-REQ-05` is confirmed;
- Baseline can grow if every future spreadsheet column is added without review;
- one-per-relationship cardinality may be insufficient if care episodes need
  separate initial snapshots.

### 8.2 Alternative B — bounded typed initial observations

Conceptual shape only:

```text
PatientInitialObservation
  patientHospitalRelationshipId
  observationType   bounded known type, not arbitrary EAV
  typed value       per type
  unit              controlled per type
  effectiveOn
  recordedByUserId
  provenance
```

Benefits:

- supports different measurement dates and future typed additions;
- can preserve measurement-level provenance and history.

Costs:

- introduces a new cardinality/query/reporting surface before the MVP needs it;
- requires a bounded type registry, typed validation and projection design;
- becomes unsafe if implemented as generic JSON/EAV disguised as flexibility;
- does not remove the need to answer units, dates, correction and authority.

### 8.3 Recommendation

Use **Alternative A** for Phase 16D only if the customer confirms the shared-date
semantics and the source unit/measurement contracts. Do not introduce a generic
observation model now.

If the answer to `IMP-REQ-05` is NO and measurements can have different dates,
do not force them into one `PatientBaseline.recordedOn`. Pause the permanent
Baseline extension and design a bounded typed observation model as a separate
architecture slice. This is the only conditional promotion required by current
evidence; it is not permission to implement EAV in Phase 16D.

## 9. Patient classification domain

### 9.1 Domain and scope recommendation

`IMP-REQ-02` now fixes the business meaning at **patient status/classification
label**. The recommended domain name is:

```text
PatientClassification
```

This is a proposed domain term, not `DiabetesType`, `Diagnosis`, `ICD`,
`ScreeningResult` or `ProgramStatus`.

**PROPOSED DESIGN:** Make the classification Hospital-relationship-scoped,
because:

- the source roster is selected and reconciled within one Hospital;
- cohort membership (`กลุ่มเสี่ยง`, `เบาหวาน`) can be Hospital/program intake
  context rather than a globally shared Person fact;
- current patient clinical domains are relationship-scoped;
- global PatientProfile would leak/overwrite a value across Hospitals without
  confirmed ownership.

Conceptual MVP persistence:

```text
PatientHospitalRelationship 1 ─── 0..1 PatientClassification (initial record)
PatientClassification
  label
  recordedByUserId
  business date only after date decision
  createdAt
```

Do not use Profile, Baseline, Screening, Program or a generic relationship
status column as a shortcut.

### 9.2 Vocabulary recommendation

Operational/customer evidence strongly suggests labels such as:

- `กลุ่มเสี่ยง`;
- `เบาหวาน`;
- possibly a combined source expression such as `กลุ่มเสี่ยง หรือ เบาหวาน`.

The evidence does not prove that this is an exhaustive approved vocabulary.
Therefore the Phase 16D recommendation is:

- do not create a `DiabetesType` enum;
- do not invent Type 1/Type 2, `UNKNOWN` or `OTHER`;
- do not infer diagnosis, ICD, Screening result, threshold or Program state;
- use a bounded string plus server-owned validation only after the owner confirms
  the accepted labels;
- if the owner confirms exactly two controlled categories, a later enum such as
  `RISK` / `DIABETES` can be considered, but it is not authoritative now;
- an unrecognized source value is `INVALID`/`NEEDS_REVIEW`, not silently stored
  as an unknown bucket.

### 9.3 Lifecycle, authority and history

Phase 16D should implement only an **initial classification create** if the owner
answers `P16C-CLASS-01` sufficiently:

- initial import creates the record only when a validated label is present;
- later re-import with the same label is `NOOP`;
- later re-import with a different label is `CLASSIFICATION_CONFLICT`;
- no last-write-wins or automatic overwrite;
- no diagnosis or clinical rule-engine behavior;
- correction, reassignment of label, retained history, report/filter usage and
  lifecycle changes need an explicit owner policy;
- a classification write capability must be named before mutation. Existing
  `patient:provision` must not imply unrestricted classification management.

This makes the domain recommendation strong while keeping unresolved vocabulary
and lifecycle decisions visible.

## 10. OSM / Coach assignment design

### 10.1 Resolver contract

The source value is a display/name reference, not a User UUID. Phase 16D resolver
input is canonical display text plus the server target Hospital. Candidate
eligibility is reloaded from the database:

```text
User.status = ACTIVE
+ User has Role.OSM
+ active OsmHospitalRelationship for exact target Hospital
+ target Hospital.status = ACTIVE
```

Candidate search may use normalized exact name matching for discovery. It must
not use fuzzy matching to mutate an assignment. Preview should expose only
bounded safe context such as display name and opaque candidate selection state;
never National ID, phone, unrelated Hospital membership or cross-Hospital data.

Resolution details:

| Candidate result | Detail code | Mutation eligibility |
| --- | --- | --- |
| zero eligible candidates | `OSM_NOT_FOUND` | No assignment; row `NEEDS_REVIEW` when source caregiver is present |
| one eligible candidate | `OSM_MATCHED` | Eligible only after server revalidation and policy approval |
| multiple candidates | `OSM_AMBIGUOUS` | No auto-assignment; row `NEEDS_REVIEW` |

### 10.2 Existing assignment behavior

The importer must distinguish:

```text
no active assignment + exact candidate       → assignment candidate
active assignment == exact candidate         → NOOP
active assignment != candidate                → OSM_ASSIGNMENT_CONFLICT
```

The current assignment service can reassign a different OSM, but that behavior
is an explicit assignment mutation, not spreadsheet authority. Phase 16D must
require an explicit reconciliation choice and server authorization before
calling a guarded reassignment operation. The spreadsheet name alone cannot
replace a current assignment.

### 10.3 Persistence and history

Reuse `PatientOsmAssignment` and its history model. Do not add a raw caregiver
name column to Patient, Profile or relationship. Existing ended rows remain
queryable for assignment history. Assignment audit continues to use opaque IDs
and excludes source display text and clinical payload.

## 11. Authorization composition and OWNER/MEMBER mismatch

### 11.1 Current mismatch

Current code proves:

```text
Hospital MEMBER
  → active direct Hospital provisioning scope
  → can bulk import Patient core

PatientOsmAssignment mutation
  → HOSPITAL role
  → active direct OWNER membership required
```

The current candidate query is also protected by the assignment policy, so a
Member cannot currently use the existing assignment-management lookup path.
This is a real authorization mismatch with the one-flow logical requirement.

### 11.2 Options

**Option A — full caregiver import requires OWNER (preferred safe default)**

- MEMBER may use only operations currently allowed by confirmed policy;
- a roster row with caregiver assignment cannot fully confirm under MEMBER;
- OWNER must confirm the full row, or the row remains `NEEDS_REVIEW`;
- preserves current assignment policy and avoids permission expansion.

Tradeoff: a Member cannot complete every row in one confirmation, but no unsafe
authority is added and the customer did not confirm Member caregiver authority.

**Option B — explicit caregiver capability for authorized MEMBER**

- add or reuse a clearly named capability/policy for assignment mutation;
- grant it to a confirmed Hospital Member path only after owner/customer approval;
- keep exact Hospital, active OSM eligibility and reassignment reconciliation;
- never implement as an import-only bypass.

Tradeoff: preserves one-flow usability but changes the security policy and needs
an explicit decision and focused authorization tests.

**Option C — Member import then Owner approval later**

- Member commits core/baseline/classification and caregiver assignment remains
  pending;
- Owner completes assignment separately.

Tradeoff: adds a pending/approval workflow and breaks the confirmed one logical
import confirmation. It is not the default MVP recommendation.

### 11.3 Recommendation

Use **Option A as the Phase 16D safety default**. Treat Option B as the only
product-directed alternative if the customer explicitly requires Hospital
Members to finish caregiver assignment. Do not weaken `patient:assign-osm`, do
not treat `patient:provision` as a super-capability, and do not build Option C's
approval queue unless a real approval requirement arrives.

### 11.4 Capability composition

Do not create four capabilities automatically. Compose the smallest existing
boundaries:

| Domain operation | Current/recommended capability boundary |
| --- | --- |
| Patient core | existing `patient:provision`, BULK direct Hospital scope |
| Initial Baseline | existing `patient:baseline:create` semantics, but transaction-composable |
| Classification | new named classification write capability only after `P16C-CLASS-01`; no implicit reuse |
| OSM assignment | existing `patient:assign-osm`; current OWNER-only rule remains unless Option B is approved |

The orchestrator may offer one user-facing import flow, but it must evaluate
each domain operation under its own policy. “Import” is not a giant permission.

## 12. Effective-date design — `IMP-REQ-05`

The exact follow-up question remains:

> ข้อมูลน้ำหนัก รอบเอว น้ำตาล HbA1c และข้อมูลสุขภาพตั้งต้นอื่น ๆ ที่ส่งมาใน roster หนึ่งไฟล์ สามารถถือว่าเป็นข้อมูลตั้งต้น ณ วันที่เดียวกันทั้งไฟล์ได้หรือไม่?

The answer `น่าจะเป็นเช่นนั้น` is not final. No permanent date model is selected
by this phase.

### 12.1 Alternative A — shared import effective date

Conditional journey:

```text
Upload roster
  ↓
server parses and previews
  ↓
user supplies one date: ข้อมูลตั้งต้น ณ วันที่
  ↓
preview binds date to all applicable rows
  ↓
confirm revalidates date and actor/scope
  ↓
each Baseline/classification record stores the approved business date
```

Design requirements if customer answers YES:

- date is date-only, not upload time, transaction time or `createdAt`;
- server validates a real calendar date and applies one accepted date to every
  applicable row/field in the batch;
- current `PatientBaseline.recordedOn` is the closest existing date destination;
- `PatientClassification` must use the same business date only if classification
  is confirmed part of the same initial state date contract;
- source/provenance is represented as bounded audit metadata such as
  `source = ROSTER_IMPORT`; do not log the workbook payload;
- no `ImportBatch` model is required for the MVP solely to carry this date;
- if later reproducibility requires batch identity beyond the HMAC binding, add a
  small explicit provenance model in a separate design review.

Security binding requirement:

```text
file fingerprint
+ actor
+ target Hospital
+ effective date
+ server-bound import contract/version
```

Current `patient-import-file-binding.ts` binds only file fingerprint, actor and
target Hospital. The confirm schema also has no date. Phase 16D must extend the
server-bound context before accepting a batch date; a file fingerprint alone is
not sufficient.

### 12.2 Alternative B — row/measurement-level dates

If customer answers NO:

- current canonical contract must add an explicit row-level or measurement-level
  date field;
- the source template, normalization, validation and preview must show dates;
- `serviceVisitDate` must not be reused silently as initial effective date;
- one Baseline row must not contain measurements from different dates while
  claiming one `recordedOn`;
- if measurements truly have different dates, promote to a bounded typed
  observation design before persistence;
- preview must report missing/invalid dates as `BASELINE_DATE_REQUIRED` or
  `BASELINE_DATA_INVALID`.

This alternative is more precise but increases template complexity and query/
reporting cost.

### 12.3 Conditional preference

If customer confirms that all initial values in one roster share one date, choose
**Alternative A** for the MVP because it is simpler, matches the current
relationship snapshot and avoids a new observation framework. If not, choose
Alternative B and pause the single-snapshot extension until typed observation
semantics are designed. Neither alternative is permanent today.

## 13. Patient profile, address and emergency-contact disposition

### 13.1 Profile candidates

`dateOfBirth`, `gender`, `phoneNumber`, address and emergency contact remain
separate requirement/persistence-policy questions. The import workflow may parse
and preview them, but Phase 16D must not assume that a roster is authoritative
for a global `PatientProfile`.

For every future profile mutation, resolve:

- Person-global vs Hospital-relationship ownership;
- source authority and edit authority;
- direct Hospital/OSM/Patient visibility;
- conflict and correction/history;
- whether an import can fill only missing values or can request correction;
- audit and retention of contact data.

### 13.2 Address

Current schema supports only `PatientProfile.addressText`, while the roster has
structured components. Do not concatenate values into `addressText` without a
deterministic formatting/ordering/empty-value contract and ownership decision.

Preferred MVP disposition: **defer address persistence**. A future choice may
define deterministic formatting or a structured model, but Phase 16C does not
create address tables merely because columns exist.

### 13.3 Emergency contact

Current Profile supports name/phone but not
`emergencyContactRelationship`. Partial persistence would silently discard
meaning. Preferred MVP disposition: **defer the whole emergency-contact family**
until relationship, authority, correction and visibility are accepted. Do not
persist name/phone alone by default.

## 14. Re-import, idempotency, correction and history

### 14.1 Re-import matrix

| Domain | Same existing state | Different existing state | Default action |
| --- | --- | --- | --- |
| Patient core | `ALREADY_EXISTS` / idempotent reuse | identity/name/HN conflict | never last-write-wins; reuse current provisioning conflict semantics |
| Baseline | `NOOP` / `ALREADY_EXISTS` when supported values and date contract match | `BASELINE_CONFLICT` | do not overwrite immutable Baseline |
| Classification | `NOOP` | `CLASSIFICATION_CONFLICT` | no automatic replacement; explicit correction contract required |
| OSM assignment | `NOOP` when same UUID | `OSM_ASSIGNMENT_CONFLICT` | explicit reconciled reassignment only; source name is not authority |
| Organization text | no domain state | `HOSPITAL_MISMATCH`/review | never alter target Hospital or hierarchy |
| Deferred profile/contact/address | no import write | `NEEDS_REVIEW` | defer until field-specific policy exists |

### 14.2 Correction/history rule

For every new persisted domain:

- import is a create/reconcile operation, not an implicit correction operation;
- current values and authoritative IDs are reloaded at confirm time;
- the original Baseline/classification state is never silently destroyed;
- assignment history remains append-oriented through ended assignments;
- future corrections need actor, reason, timestamp, retained original and audit
  semantics appropriate to the domain;
- no generic event-sourcing/history framework is introduced just for this import.

## 15. Per-patient transaction and application-service design

**ENGINEERING RECOMMENDATION FOR PHASE 16C (not customer wording):** preserve
per-patient atomicity for the confirmed fields intended to be applied. A row
must not leave Patient core created while its intended initial data or caregiver
assignment silently disappears. This recommendation does not require one
transaction for the workbook.

### 15.1 Recommended boundary

**PROPOSED DESIGN:** introduce one future application boundary, conceptually:

```text
PatientRosterImportService
  or PatientImportApplicationService
```

Responsibilities:

- accept a server-parsed canonical row and server-resolved reconciliation
  choices;
- validate the canonical input again; client data is not authority;
- revalidate actor, target Hospital and all domain state;
- coordinate core, initial Baseline, classification and assignment mutations;
- enforce one transaction per patient row;
- return bounded row outcome and diagnostics;
- write bounded audit events.

It must not parse Excel, trust browser-supplied User/OSM IDs, implement Prisma
queries in UI, bypass existing policies, or become a generic import framework.

### 15.2 Transaction boundary

For a row whose required reconciliation is ready:

```text
confirm request
  ↓ server authentication and input validation
  ↓ authoritative actor/target-Hospital recheck
  ↓ serializable transaction for one row
      resolve/reuse Person
      provision/reuse User + PATIENT role + Profile + relationship/HN
      create initial Baseline if supported values are present
      create initial PatientClassification if validated label is present
      create/NOOP explicit PatientOsmAssignment if resolved and authorized
      record bounded audit events
  ↓ commit
row result
```

Patient core + initial clinical data + classification + caregiver assignment
should commit atomically for that row when all are intended and confirmed. A
present but unresolved caregiver must not silently disappear. By default, a row
with unresolved required caregiver reconciliation remains uncommitted and
`NEEDS_REVIEW`.

Do not wrap the entire workbook in one transaction. One invalid/conflicting row
must not roll back unrelated valid rows.

### 15.3 Current service composition constraint

Current public services each own their own serializable transaction:

- `provisionPatient` / bulk provisioning;
- `createPatientBaseline`;
- `assignOsmToPatient`.

Calling those public functions sequentially would not provide per-row atomicity.
Calling them inside another transaction would create nested/independent
transaction behavior that the application must not claim is atomic.

Phase 16D must use one of these minimal approaches:

1. expose transaction-aware domain operations that accept the current
   `Prisma.TransactionClient` and reuse existing policy/resolver logic; or
2. move cohesive orchestration into the import application service while
   preserving domain policy functions and avoiding duplicate invariants.

The existing private/in-module `createInTransaction` patterns show a compatible
direction, but they must not be imported from UI or copied into a second service
without a deliberate service-boundary review. `recordAuditEvent` already accepts
a Prisma transaction and can participate in the same row transaction.

### 15.4 Confirm-time authorization recheck

Preview is not authority. At confirm/mutation time, recheck:

- authenticated server actor and current active User;
- target Hospital identity and `ACTIVE` status;
- active direct Hospital membership/capability for core and each domain;
- Person identity/name and current patient role/profile/relationship;
- current HN and existing Baseline/classification;
- OSM candidate `ACTIVE` status, role, exact Hospital relationship;
- current active assignment and explicit reassignment choice;
- effective date and import binding when Alternative A is selected.

## 16. Preview/confirm and reconciliation contract

Use one bounded primary row status with detail diagnostics. Do not build a giant
generic workflow state machine.

### 16.1 Primary row statuses

At minimum:

```text
READY
ALREADY_EXISTS
DUPLICATE_IN_FILE
INVALID
CONFLICT
HOSPITAL_MISMATCH
NEEDS_REVIEW
```

`READY` means every field intended for the row has a valid destination, scope,
identity and required decision; it does not mean every source field was stored.

### 16.2 Detail diagnostics

OSM:

```text
OSM_MATCHED
OSM_NOT_FOUND
OSM_AMBIGUOUS
OSM_ASSIGNMENT_CONFLICT
```

Baseline/date:

```text
BASELINE_ALREADY_EXISTS
BASELINE_CONFLICT
BASELINE_DATE_REQUIRED
BASELINE_DATA_INVALID
```

Classification:

```text
CLASSIFICATION_ALREADY_EXISTS
CLASSIFICATION_CONFLICT
CLASSIFICATION_VALUE_INVALID
CLASSIFICATION_SCOPE_REQUIRED
```

Other bounded details may include `IDENTITY_CONFLICT`, `RELATIONSHIP_CONFLICT`,
`HOSPITAL_MISMATCH`, `UNIT_NOT_CONFIRMED`, `PID_UNSUPPORTED`,
`PROFILE_FIELD_DEFERRED` and `ADDRESS_FORMAT_REQUIRED`.

### 16.3 Confirm binding

At minimum the server-bound confirm context must cover:

```text
file fingerprint
+ actor
+ target Hospital
+ effective date when used
+ canonical/import contract version
+ server-resolved reconciliation choices or equivalent protected context
```

The server must reparse/re-normalize the file and re-resolve authorization at
confirm time. Browser-provided candidate UUIDs are selection hints only and must
be validated against the current exact Hospital candidate query.

## 17. Security, privacy and audit design

### 17.1 Security/privacy invariants

Preserve these current architecture boundaries:

- National ID remains masked in preview and HMAC-bound; raw National ID is not
  logged, audited or written to a new column;
- actor and target Hospital are server-derived/revalidated;
- source Hospital/รพ.สต. text never grants tenant or authorization scope;
- no parent/child visibility inheritance;
- no cross-Hospital OSM candidate lookup;
- no fuzzy caregiver matching;
- no raw workbook logging or source-row payload logging;
- clinical values, address, phone and emergency payload do not enter generic
  audit metadata;
- preview shows only safe bounded candidate context;
- import confirmation is protected against stale file/date/actor/scope context.

### 17.2 Audit events for one successful row

Reuse existing domain events where they exist:

| Event | Resource | Minimum safe metadata |
| --- | --- | --- |
| `patient.provisioned` | `PatientProfile` | outcome, opaque Hospital/relationship IDs, account status/role as current policy allows |
| `patient_baseline.created` | `PatientBaseline` | opaque Baseline/relationship IDs, `source = ROSTER_IMPORT` |
| `patient.classification.created` (new domain event) | `PatientClassification` | opaque classification/relationship IDs, label category only if policy explicitly permits; no raw clinical payload |
| `patient.osm_assigned` / `patient.osm_reassigned` | `PatientOsmAssignment` | opaque assignment/relationship/OSM IDs and operation outcome |

All successful write events use the server actor, exact Hospital/relationship,
operation outcome and timestamp. Do not put raw National ID, workbook row,
caregiver display name, clinical values, full address, phone, HbA1c, BP text or
source workbook contents in generic audit metadata. Audit failures must fail the
same local transaction for the state change they describe.

No new event-sourcing or complete imported-payload archive is proposed.

## 18. Design-only proposed schema delta

This is not executable Prisma or migration SQL. It is a review checklist for
Phase 16D.

| Current model | Proposed design-only delta | Reason | Requirement/gate | Nullable/cardinality | History | Migration risk / Phase 16D readiness |
| --- | --- | --- | --- | --- | --- | --- |
| `PatientBaseline` | Add nullable typed `heightCm` | Height is initial clinical data; Profile is wrong owner | `IMP-REQ-01`; unit + `IMP-REQ-05` gate | Nullable; still 0..1 per relationship | Preserve immutable snapshot; correction later | Moderate; ready only after `P16C-CLINICAL-01` + `IMP-REQ-05` |
| `PatientBaseline` | Add nullable typed `hba1c` | HbA1c is distinct initial measurement | `IMP-REQ-01`; unit/precision/date/history gate | Nullable; still 0..1 per relationship | Preserve own value; no blood-sugar alias | Moderate; blocked by `P16C-CLINICAL-01` + `IMP-REQ-05` |
| `PatientBaseline` | Keep existing `weight`, `waistCircumference`; do not rename `bloodSugarDtx` yet | Reuse exact current fields; avoid semantic/migration churn | `IMP-REQ-01`; DTX remains open | Existing nullable fields | Immutable current behavior; explicit conflict on re-import | Low for reuse; date write blocked by `IMP-REQ-05` |
| `PatientClassification` (new) | Relationship-scoped record with bounded `label`, server writer, business date conditional on date decision, system `createdAt` | Classification is not Profile, Baseline, Screening or Program | `IMP-REQ-02`; `P16C-CLASS-01`; date conditional | MVP 0..1 initial record per relationship; label required when row exists | Immutable create + conflict on different re-import; future history separate | Moderate; implementation blocked until vocabulary/lifecycle/authority decision |
| `PatientOsmAssignment` | No new field/model | Current UUID assignment/history is authoritative | `IMP-REQ-04`; `P16C-OSM-01` policy gate | Existing one active + ended history | Reuse current end/create behavior only after explicit reassignment | Low schema risk; service seam/policy gate remains |
| `PatientProfile` | No import schema change | Profile ownership and global-vs-Hospital scope unresolved | `P16C-PROFILE-01` | Existing nullable fields remain | Existing correction semantics not defined | No Phase 16D migration |
| `PatientHospitalRelationship` | No new hierarchy or classification scalar in Phase 16C recommendation | HN/target Hospital boundary is already clear; separate classification preserves ownership | `IMP-REQ-03` remains open | Existing unique PatientProfile + Hospital | Existing HN conflict/history remains | No hierarchy migration; exact scope ready |
| `Person` | No raw National ID/PID field | Preserve identity HMAC boundary | ADR-0001/0004 | Existing unique identity hash | Identity correction separate | No migration |
| `AuditEvent` | No schema change; use bounded source/outcome metadata | Existing audit service validates and accepts transaction client | ADR-0006; privacy boundary | Existing optional JSON metadata | Events remain append-only | No migration |
| Import batch | No new model for Alternative A MVP | HMAC-bound confirm context plus domain/audit source is enough initially | `IMP-REQ-05` conditional | N/A | Future provenance model only if required | Avoid new workflow framework |
| Typed observation model | Do not add now; revisit only if Alternative B requires different dates | Avoid generic EAV/JSON over-engineering | `IMP-REQ-05` NO answer | Future design decision | Must be typed/reportable if introduced | Separate architecture slice, not Phase 16D default |

### 18.1 Schema review rule

No schema delta becomes committed architecture merely because it appears in this
table. Phase 16D must first recheck current schema/service state, obtain gates,
write migration through the repository migration process, and add targeted
tests for cardinality, authorization, conflict and audit behavior.

## 19. Minimal durable design recommendation

The preferred design is:

1. Keep current Person/User/PatientProfile/PatientHospitalRelationship core and
   reuse `PatientProvisioningService` identity/HN semantics.
2. Extend current relationship-owned `PatientBaseline` only for exact initial
   fields: reuse weight/waist; add typed `heightCm` and typed `hba1c` only after
   unit/date/history gates; do not create generic observations for MVP.
3. Preserve `bloodSugarDtx` terminology until the DTX/generic blood-sugar
   decision is answered; never map `bloodSugar` or `dtxReading` by spelling.
4. Use a separate proposed relationship-scoped `PatientClassification` label,
   not `DiabetesType`, diagnosis, Screening, Program or Profile. Start with a
   bounded string only after the allowed vocabulary is confirmed; reject unknown
   labels into reconciliation.
5. Resolve `osmCaregiverName` only to an exact eligible User/OSM candidate in
   the target Hospital. Same assignment is NOOP; different assignment requires
   explicit reconciliation and current assignment policy.
6. Keep Option A (OWNER-required full caregiver mutation) as the safe default;
   Option B requires explicit permission decision; Option C is not default.
7. If the customer confirms one date per roster, use conditional batch-level
   date binding and current Baseline date-only semantics. If not, pause the
   single-snapshot extension and design typed initial observations.
8. Defer profile/contact/address/emergency fields and all derived/ambiguous
   clinical candidates instead of storing partial or lossy data.
9. Implement one `PatientRosterImportService` application boundary with one
   serializable transaction per patient row, transaction-composable domain
   operations, server reauthorization and bounded domain audit.
10. Keep one primary row status plus bounded domain detail codes; do not create a
    generalized workflow engine.

## 20. Explicit non-decisions

Phase 16C does **not** confirm or implement:

- Hospital parent-child hierarchy, ownership, tenant inheritance or visibility;
- cross-Hospital visibility or shared Hospital authorization;
- profile/contact/address ownership or automatic import mutation;
- emergency-contact relationship persistence;
- PID/externalPatientId semantics or identity authority;
- BMI persistence or calculation formula;
- BP text parsing, units, pairing or thresholds;
- DTX equivalence with generic blood sugar;
- clinical thresholds, diagnosis, ICD or treatment interpretation;
- Screening behavior, scoring or automatic Screening creation;
- Program lifecycle, Program creation or baseline-link policy changes;
- final effective-date model (`IMP-REQ-05` remains provisional);
- automatic OSM replacement from spreadsheet data;
- fuzzy OSM matching or cross-Hospital candidate lookup;
- classification exhaustive vocabulary, lifecycle, history, reports or future
  edit authority until `P16C-CLASS-01` is resolved;
- correction/amendment semantics for new clinical/classification records;
- generic ClinicalObservation EAV, JSON custom fields, workflow engine,
  approval queue, event sourcing, background jobs, distributed transaction or
  new tenant/IAM architecture.

## 21. Phase 16D implementation gate

### 21.1 READY FOR PHASE 16D

The following work may start without inventing Hospital hierarchy or silently
choosing the provisional date model:

- reuse/current-core provisioning design and service impact analysis;
- canonical-to-core reconciliation and exact target Hospital organization checks;
- baseline mapping for current weight/waist and height/HbA1c gap analysis;
- proposed relationship-scoped classification domain and bounded validation
  contract, provided unknown vocabulary remains review-only;
- Hospital-scoped OSM candidate resolver/read-only reconciliation design;
- transaction-composable service seam design and per-patient orchestrator
  skeleton, without final gated writes;
- preview/confirm row status/detail diagnostics and server-bound choice contract;
- re-import/idempotency test design;
- profile/contact/address/emergency gap inventory;
- schema/service impact analysis without applying migrations.

### 21.2 READY AFTER `IMP-REQ-05` CONFIRMATION

- permanent shared batch effective-date write and confirm binding;
- date-bound `PatientBaseline` extension for height/HbA1c and any accepted
  clinical fields;
- permanent classification business-date persistence if it is included in the
  same initial-state date contract;
- any migration that assumes one effective date for every applicable row.

If the answer is NO, replace this path with a separate bounded row/measurement
date design before final persistence.

### 21.3 REQUIRES CUSTOMER / OWNER DECISION

At minimum:

- `IMP-REQ-03` Hospital hierarchy, if hierarchy behavior is ever desired;
- `IMP-REQ-05` final shared-date vs row/measurement-date semantics;
- `P16C-OSM-01` whether authorized Hospital MEMBER may complete caregiver
  assignment, or OWNER remains required;
- `P16C-CLASS-01` exact classification vocabulary, scope, lifecycle, edit
  authority, history and report/filter usage;
- `P16C-CLINICAL-01` units/protocol and DTX vs generic blood sugar semantics;
- HbA1c unit/precision/lab date/history;
- profile/contact/address ownership, authority and correction;
- emergency-contact relationship and partial-persistence policy;
- PID/external identifier namespace and authority;
- whether Baseline cardinality remains one per Hospital relationship across
  future Programs and care episodes.

## 22. Expected Phase 16D decomposition

Recommended slices, still unimplemented here:

| Slice | Scope | Dependency |
| --- | --- | --- |
| `16D.1` | Core/domain foundation, transaction-composable service seams, design-only schema review | Current core and ADR-0005/0006 |
| `16D.2` | Initial Baseline persistence for approved fields, including conditional height/HbA1c | `IMP-REQ-05`, `P16C-CLINICAL-01` |
| `16D.3` | `PatientClassification` persistence and bounded vocabulary validation | `P16C-CLASS-01` |
| `16D.4` | OSM resolver, candidate preview and assignment reconciliation | `P16C-OSM-01` or explicit Option B decision |
| `16D.5` | Transactional per-patient roster import orchestration | 16D.1–16D.4 seams and policies |
| `16D.6` | Preview/confirm UI integration and protected binding | 16D.5; date/choice binding finalized |
| `16D.7` | Re-import/idempotency and integration hardening | All mutation slices |
| `16D.8` | Real-shape synthetic compatibility re-audit | No real roster/PII added |

## 23. Handoff notes for the next agent

### Confirmed facts

- Patient core and exact Hospital relationship/HN semantics already exist;
- roster clinical values are initial pre-program data in the same logical flow;
- the risk/diabetes field is a classification label, not a DiabetesType/diagnosis;
- caregiver text means actual Patient–OSM assignment, but name is not identity;
- Hospital hierarchy is open and cannot expand scope;
- shared effective date is provisional and must not be implemented permanently;
- current public domain services own separate transactions, so a new orchestrator
  must use transaction-aware operations for row atomicity.

### Proposed/inferred facts

- `PatientBaseline` extension is the smallest durable MVP for initial clinical
  data if date/unit gates close;
- `PatientClassification` should be relationship-scoped and label-oriented;
- OWNER-required full caregiver mutation is the safest current default;
- batch-level date is preferred only conditionally after a YES answer.

### Actions to avoid

- Do not add schema/migration before the listed gates are resolved;
- do not call public independently-committing services and claim one row is atomic;
- do not map all canonical fields to Baseline/Profile;
- do not use source Hospital text, PID, age, BMI, risk text or caregiver name as
  authority;
- do not derive DiabetesType, diagnosis, Screening result, Program state,
  clinical threshold or DTX equivalence;
- do not weaken OWNER-only assignment policy or build a pending approval queue
  without an explicit decision;
- do not reintroduce the sensitive patient workbook or real patient PII.

### Safe next actions

1. Confirm the gates in Section 21.3 with customer/owner.
2. Reinspect current schema/services at the exact Phase 16D starting HEAD.
3. Implement the smallest transaction-composable domain slice with focused
   schema, policy, service and integration tests.
4. Re-run synthetic real-shape compatibility checks without persisting real
   roster content.

## 24. Verification record

Verification completed on 2026-08-25:

- `git status --short` shows only `M docs/CONTEXT.md` and the new
  `docs/phases/PHASE_16C_PATIENT_IMPORT_DOMAIN_PERSISTENCE_DESIGN.md`;
- `git diff --check` passed; `git diff --stat` shows only the four-line
  `docs/CONTEXT.md` change because the Phase 16C document is untracked;
  `git diff --cached --stat` is empty;
- both changed documentation files decode as UTF-8 without BOM, with no
  replacement characters, mojibake markers or trailing whitespace;
- all five decision-register rows are present with `IMP-REQ-01`, `02` and `04`
  `CONFIRMED`, `IMP-REQ-03` `OPEN`, and `IMP-REQ-05` `PROVISIONAL — FINAL
  CONFIRMATION REQUIRED`;
- the matrix check found all 39 required source fields; no 13-digit National ID
  pattern, patient workbook, screenshot or source workbook contents were added;
- local relative Markdown links in the changed documentation have zero missing
  targets;
- OWNER vs MEMBER mismatch, OSM non-authoritative names, exact Hospital scope,
  date alternatives, transaction-composability gap and Phase 16D gates are all
  present;
- no full lint/typecheck/integration suite was run because this is a
  documentation-only change, and the repository has no lightweight Markdown or
  link validation script.

This record is a documentation verification, not Phase 16D implementation.
