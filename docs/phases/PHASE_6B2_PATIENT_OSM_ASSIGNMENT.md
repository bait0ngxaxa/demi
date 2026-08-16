# Phase 6B.2 — OSM ↔ Patient Assignment

- **Status:** Implemented / Closed
- **Scope:** Hospital-specific OSM assignment and assigned-Patient minimal read
- **Capabilities:** `patient:read`, `patient:assign-osm`
- **Migration:** `20260816100000_patient_osm_assignment`

เอกสารนี้เป็น implementation handoff ของ Phase 6B.2 ตาม accepted Phase 6A
และต่อจาก [Phase 6B.1](./PHASE_6B1_PATIENT_DIRECTORY.md) โดยไม่เพิ่ม clinical authority
หรือ Patient profile mutation

## Implemented scope

- เพิ่ม assignment แบบ first-class ระหว่าง `PatientHospitalRelationship` และ OSM `User`
- Assignment เป็น optional; Patient provisioning ไม่ต้องมี assignment
- Hospital `OWNER` ใน Hospital เดียวกันสามารถ assign, reassign และ unassign ได้
- Reassignment ปิดแถวเดิมและสร้างแถวใหม่ จึงตรวจสอบประวัติย้อนหลังได้
- OSM อ่านได้เฉพาะ Patient relationship ที่มี active assignment ของตนเอง
- Hospital `OWNER` และ `MEMBER` ยังคงอ่าน Hospital roster ตาม B6.1 โดยไม่ขึ้นกับ assignment
- เพิ่ม assigned-Patient directory สำหรับ OSM พร้อม bounded name/HN search และ offset pagination

## Schema and database invariant

Model `PatientOsmAssignment` มี field หลักดังนี้:

```text
id
patientHospitalRelationshipId
osmUserId
assignedByUserId
createdAt
endedAt
endedByUserId
```

`endedAt == null` หมายถึง assignment ปัจจุบัน และ `endedAt != null` หมายถึงประวัติที่ปิดแล้ว
ทุก foreign key ใช้ restrictive delete behavior เพื่อไม่ให้ลบ Patient relationship หรือ User
แล้วทำให้ assignment history หายไปโดยไม่ตั้งใจ

Migration เพิ่ม index สำหรับ relationship history และ OSM lookup พร้อม partial unique index:

```sql
UNIQUE (patientHospitalRelationshipId)
WHERE endedAt IS NULL
```

ดังนั้น PostgreSQL บังคับให้มี active OSM ได้ไม่เกินหนึ่งรายต่อ
`PatientHospitalRelationship` แม้มี concurrent request

## Assignment lifecycle

- **Assign:** ตรวจ target Patient และ target OSM แล้วสร้าง active assignment ใหม่
- **Repeat assign คนเดิม:** สำเร็จแบบ `NOOP` โดยไม่สร้างแถวหรือ audit ซ้ำ
- **Reassign:** ปิด assignment เดิมด้วย `endedAt`/`endedByUserId` แล้วสร้าง active row ใหม่
- **Unassign:** ปิด active row; ถ้าไม่มี active row จะเป็น `NOOP`

Mutation ใช้ Serializable transaction และ retry เมื่อพบ PostgreSQL serialization/unique conflict
จึงไม่ใช้ application-memory lock และไม่ให้ concurrent request สร้าง active row สองรายการ

## Authorization

Mutation ต้องมีครบ:

```text
active application User
+ HOSPITAL role
+ active direct OWNER HospitalMembership
+ active target Hospital
+ patient:assign-osm
```

`MEMBER`, `OSM`, `ADMIN`, parent/child/sibling Hospital และ profession อื่นไม่มีสิทธิ์ mutation
OSM ไม่สามารถ self-assign ได้

Service re-resolve actor, membership, Patient relationship และ target OSM ใน transaction ทุกครั้ง
target OSM ต้องมี:

```text
User.status == ACTIVE
+ Role.OSM
+ active OsmHospitalRelationship ใน Hospital เดียวกับ Patient relationship
+ active Hospital
```

Browser-provided IDs เป็น input เท่านั้น ไม่ใช่ proof ของ authority
Patient relationship ต่าง Hospital และ OSM ต่าง Hospital จะ fail closed

## OSM Patient read scope

Assigned directory/detail query ใช้ database predicate ที่ต้องมีพร้อมกัน:

```text
active OSM User
+ Role.OSM
+ active OsmHospitalRelationship ของ actor ใน Patient Hospital
+ active PatientOsmAssignment.osmUserId == actor User
+ PatientOsmAssignment.endedAt IS NULL
+ Hospital ACTIVE
+ PatientHospitalRelationship เป็น Patient relationship
```

จึงไม่ให้ OSM เห็น roster ทั้ง Hospital, Patient ที่ยังไม่ assign, assignment ที่จบแล้ว,
Patient relationship ของ OSM คนอื่น หรือ relationship ของมนุษย์คนเดียวกันในอีก Hospital
เมื่อ User ถูก suspend หรือ OSM–Hospital relationship ถูก suspend query จะ deny ทันทีจาก state ปัจจุบัน
โดยไม่ต้อง rewrite assignment history

Projection reuse B6.1 และคืนเฉพาะ display name, Hospital identity/context, Hospital-local HN
และ opaque Patient/Profile relationship IDs ไม่คืน raw National ID, authentication/provider data,
activation/account data, demographics หรือ clinical data

## Routes and UI

```text
/app/patients
    Hospital OWNER/MEMBER directory เดิมจาก B6.1

/app/patients/[relationshipId]
    minimal detail; รองรับ Hospital direct scope หรือ OSM active assignment

/app/patients/[relationshipId]/assignment
    Hospital OWNER assignment management

/app/patients/assigned
    OSM assigned-Patient directory
```

Assignment UI แสดงชื่อ Patient, HN, Hospital, assignment ปัจจุบัน, bounded OSM candidate search,
assign/reassign และ unassign การควบคุมใน UI เป็นเพียง UX projection; service ตรวจสิทธิ์ซ้ำเสมอ
OSM ไม่เห็น Hospital `/app/patients` directory และ ADMIN ไม่เห็น routine Patient navigation

## Transaction and audit

State mutation และ successful audit event อยู่ใน transaction เดียวกัน
ใช้ event vocabulary:

```text
patient.osm_assigned
patient.osm_reassigned
patient.osm_unassigned
```

Metadata จำกัดที่ opaque IDs เช่น Hospital, PatientHospitalRelationship, assignment และ OSM User ID
ไม่บันทึก HN, ชื่อผู้ป่วย, raw National ID, identity hash, provider subject, activation token หรือ clinical data
Audit failure ทำให้ mutation ไม่รายงาน success และ transaction rollback ตาม boundary ของ service

## Tests and validation

Coverage ครอบคลุม:

- policy OWNER allow, MEMBER/OSM/ADMIN/inactive/hierarchy/cross-Hospital deny
- initial/repeat/reassign/unassign และ history preservation
- one active assignment invariant และ one OSM to many Patients
- same human ต่าง Hospital ใช้ assignment แยกกัน
- active OSM/Hospital relationship validation และ immediate access loss เมื่อ suspend
- assigned directory/detail isolation, search, pagination และ minimal projection
- candidate query scope, opaque-ID Server Actions และ safe route behavior
- concurrent assignment และ atomic audit behavior

Validation ที่ใช้สำหรับ handoff:

```text
npx prisma validate                 PASS
npx prisma generate                 PASS
npx tsc --noEmit                    PASS
npm run lint                        PASS
npm test                            PASS
npm run test:integration            PASS
```

## Explicitly deferred

ยังไม่ implement:

- Phase 6B.3 Patient profile editing, demographics/contact expansion และ HN mutation
- Patient lifecycle, delete/restore/archive, transfer และ primary Hospital semantics
- OSM geographic/area scope, multi-OSM care teams และ automatic/background reassignment
- Patient self-service expansion
- screening, PAM, HbA1c, measurements, appointments, care plans, goals, follow-up,
  notes, referrals และ clinical reporting
- notifications, LIFF, ThaID, native API, `/api/v1`, Redis, queues, workers หรือ search infrastructure

Phase ถัดไปต้องเป็น requirements planning ของ Patient/clinical slice ที่ได้รับอนุมัติใหม่
ไม่เริ่ม B6.3 โดยอัตโนมัติ
