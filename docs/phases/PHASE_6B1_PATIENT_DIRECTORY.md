# Phase 6B.1 — Patient Directory / Minimal Detail

- **Status:** Implemented
- **Scope:** Hospital-focused Patient read-only directory and minimal detail
- **Capability:** `patient:read`
- **Schema migration:** None

เอกสารนี้เป็น implementation handoff ของ Phase 6B.1 ตาม accepted Phase 6A contract
และไม่ขยายขอบเขตไป Phase 6B.2 หรือ clinical workflow

## Implemented scope

ผู้ใช้งาน Hospital สามารถ:

- เปิดรายชื่อผู้ป่วยใน Hospital ที่ตนมีสิทธิ์โดยตรง
- ค้นหาชื่อผู้ป่วยแบบ server-side และ bounded
- ค้นหา HN แบบตรงตัวภายใน Hospital ที่เลือก
- เปลี่ยน Hospital context ระหว่าง direct active Hospital scopes ของตน
- paginate ผลลัพธ์แบบ bounded และ deterministic
- เปิด minimal Patient detail ผ่าน opaque `PatientHospitalRelationship.id`

ไม่มี Patient write operation ใน slice นี้ และไม่มี schema/read-model table ใหม่

## Authorization contract

`patient:read` อนุญาตเฉพาะ actor ที่มีเงื่อนไขครบทุกข้อ:

```text
active application User
+ HOSPITAL role
+ active direct OWNER or MEMBER HospitalMembership
+ active target Hospital
+ PatientHospitalRelationship.hospitalId == authorized Hospital
```

ทั้ง `OWNER` และ `MEMBER` อ่านได้ และ `Profession` ไม่มีผลต่อ visibility

การอนุญาตที่เป็น authoritative ถูกบังคับใน Prisma predicate ผ่าน `Hospital` relation
ที่ตรวจ `User.status`, `HOSPITAL` role, membership type/status และ Hospital status
พร้อมกับ `PatientHospitalRelationship.hospitalId` เดียวกันทุก query

ไม่ขยาย scope ผ่าน `parentHospitalId`, child, sibling หรือ Hospital network
และไม่รับ Hospital ID จาก browser เป็น proof ของ authority

`OSM` ถูก deny generic directory/detail read จนกว่า B6.2 จะมี first-class assignment
ส่วน `ADMIN` ถูก deny routine operational Patient read

## Route and UI shape

```text
/app/patients
/app/patients/[relationshipId]
```

`/app/patients` ใช้ Hospital เป็น local screen context ผ่าน query parameter ที่ถูก
เลือกใหม่จาก server-resolved scopes เท่านั้น หากมี forged/unknown Hospital ID ระบบจะ
กลับไปใช้ scope ที่อนุญาต ไม่ใช้ค่าดังกล่าว query Patient

UI เป็น Thai-first, responsive และอยู่ใน application shell เดิม มี:

- Hospital context selector
- bounded name/HN search form แบบ GET
- clear result, empty และ validation state
- route loading skeleton
- keyboard-accessible links, labels และ pagination controls

Detail route authorize relationship ID แยกจาก directory list เสมอ ถ้า relationship
ไม่มีอยู่หรืออยู่นอก authorized Hospital จะใช้ safe not-found response เดียวกัน

## Read projection

Directory และ detail ใช้ projection เดียวกันและคืนเฉพาะ:

```ts
type PatientDirectoryItem = {
  patientProfileId: string
  patientHospitalRelationshipId: string
  displayName: string
  hospital: {
    id: string
    name: string
  }
  hospitalNumber: string | null
}
```

Prisma `select` ไม่ join หรือคืน `identityKeyHash`, raw National ID, auth/provider
ข้อมูล, account/activation state, demographics/contact fields หรือ clinical data

## Search and pagination

- ชื่อ: ค้นหา substring ของ `Person.givenName` และ `Person.familyName`; ถ้ามีหลายคำ
  ทุกคำต้อง match อย่างน้อยหนึ่ง field
- HN: exact match ของ `PatientHospitalRelationship.hospitalNumber` และอยู่ใน
  authorized Hospital เสมอ; duplicate HN คืนได้หลาย candidate โดยไม่เดา identity
- Input search สูงสุด 120 ตัวอักษร; HN สูงสุด 64 ตัวอักษร
- page size คงที่ 25 รายการ และ page number bounded สูงสุด 1,000
- ใช้ offset pagination เพราะเหมาะกับ bounded MVP UI และไม่ต้องเพิ่ม cursor state หรือ
  schema ใหม่
- ordering คงที่ด้วย `givenName ASC`, `familyName ASC`, `PatientHospitalRelationship.id ASC`
- ไม่มี sort control ใน B6.1 จึงไม่มี browser sort value ให้ผ่านเข้า Prisma

ทุก query filter และ pagination ทำใน database ไม่โหลด Patient ทั้งชุดเข้า memory และ
ไม่ใช้ N+1 query loop

## Security boundaries

- Directory query ใช้ authorization predicate เป็นส่วนหนึ่งของ database query ไม่ใช่
  load broad Patient แล้ว filter ใน React
- Detail query ใช้ opaque relationship ID และตรวจ authorization ใหม่ทุก request
- unauthorized Hospital, nonexistent relationship และ cross-Hospital relationship ใช้
  safe behavior ที่ไม่ยืนยันว่าทรัพยากรอีก Hospital มีอยู่จริง
- projection ไม่ส่ง raw identity, provider/authentication secret, activation information,
  demographics หรือ clinical information
- ไม่มี raw National ID lookup, logging หรือ persistence เพิ่มใน B6.1
- ไม่มี Patient mutation, HN editing, assignment, transfer, delete/restore หรือ lifecycle
  operation

## Tests

มี unit coverage สำหรับ:

- OWNER/MEMBER allow และ unrelated/inactive/hierarchy/profession deny behavior
- OSM generic read deny และ ADMIN routine read deny
- bounded query input, exact HN/name filter และ rejected arbitrary sort input
- stable ordering, fixed page size และ minimal projection redaction
- navigation visibility และ forged Hospital context handling
- detail not-found/forbidden transport behavior

มี PostgreSQL integration coverage สำหรับ OWNER/MEMBER access, cross-Hospital isolation,
parent/child/sibling denial, inactive scope denial, name/HN search, duplicate local HN,
bounded pagination, empty result, minimal projection และ direct detail authorization

Validation commands ที่ใช้สำหรับ handoff ทั้งหมดผ่าน:

```text
npx tsc --noEmit                         PASS
npm run lint                             PASS
npm test -- src/modules/patient-directory src/components/app-shell/application-navigation.test.ts
  5 files / 31 tests                    PASS
npm test                                 42 files / 212 tests PASS
npx prisma validate                      PASS
npm run test:integration                 7 files / 79 tests PASS
```

## Explicitly deferred

ยังไม่ implement:

- Phase 6B.2 Patient ↔ OSM assignment และ OSM assigned-Patient read
- Phase 6B.3 Patient profile editing, demographics/contact expansion และ HN mutation
- Patient lifecycle, delete/restore, transfer/Hospital change
- Patient self-service portal
- screening, PAM, HbA1c, measurements, appointments, care plans, goals, follow-up,
  notes, referrals และ clinical reporting
- notifications, LIFF, ThaID, native API, `/api/v1`, queues, Redis, workers หรือ search infrastructure

หลัง B6.1 ปิดแล้ว slice ถัดไปตาม accepted contract คือ
**Phase 6B.2 — OSM ↔ Patient Assignment**
