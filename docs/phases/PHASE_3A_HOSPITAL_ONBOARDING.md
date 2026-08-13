# Phase 3A — Hospital Onboarding Requirement Closure and Architecture Contract

- Status: Accepted implementation contract for Phase 3B
- Date: 2026-08-13
- Scope: Hospital organization onboarding only; no Phase 3B feature code or migration is part of this phase

เอกสารนี้แปลง requirement ที่ยืนยันแล้วและ [ADR-0003](../adr/0003-hospital-led-onboarding.md) ให้เป็น contract สำหรับ vertical slice ของ Phase 3B โดยไม่ทำสำเนาเหตุผลทางสถาปัตยกรรมทั้งหมด Source of truth ยังคงเรียงตาม [Project Context](../CONTEXT.md#source-of-truth)

## 1. Phase 3B Outcome

Phase 3B ต้องส่งมอบ flow เดียวที่ครบวงจร:

```text
/hospital/onboarding
        ↓
submit HospitalOnboardingApplication
        ↓
PENDING
        ↓
Platform ADMIN review
        ↓
APPROVED หรือ REJECTED
        ↓ APPROVED
Hospital ACTIVE
+ applicant User มี HOSPITAL role
+ applicant มี ACTIVE OWNER membership ของ Hospital นั้น
+ User ACTIVE เมื่อ credential preconditions ครบ
        ↓
เข้าใช้งานผ่าน National ID/password และ /app boundary เดิม
```

Public applicant สร้างได้เฉพาะ onboarding application และ identity/account prerequisites ที่ service อนุญาตเท่านั้น ผู้สมัครห้ามกำหนด role, membership type, application decision, Hospital status หรือ User status เอง

## 2. Accepted Contract

| Question | Contract |
| --- | --- |
| ใครสมัครได้ | Public Hospital applicant ผ่าน operation `hospital:onboard` ที่จำกัดเฉพาะ flow นี้ ไม่มี generic public signup หรือ role-selection signup |
| โรงพยาบาลใดสมัครได้ | ต้อง select/match canonical Hospital Master entry ที่ระบบควบคุม โดยใช้ `hospitalCode` เป็น stable business identifier; ชื่อ free text จาก browser ไม่ใช่ authority |
| ใครอนุมัติ/ปฏิเสธ | เฉพาะ authenticated Platform `ADMIN` ที่ผ่าน server-side policy สำหรับ `hospital:approve` หรือ `hospital:reject` ใน global governance scope |
| ใครเป็น Owner | applicant คนแรกของ application ที่อนุมัติแล้วได้รับ top-level role `HOSPITAL` และ `HospitalMembership.membershipType = OWNER` สำหรับ Hospital นั้น |
| Owner เป็น ADMIN หรือไม่ | ไม่เป็น; OWNER เป็น hospital-scoped membership และไม่ให้ platform-wide `ADMIN` authority |
| ใช้ identity อย่างไร | validate Thai National ID ฝั่ง server แล้ว resolve HMAC identity ผ่าน `Person → User` เดิมก่อนสร้าง record ใหม่เสมอ; National ID เป็น lookup input ไม่ใช่ ownership proof |
| ใช้ authentication อย่างไร | reuse Phase 2.1 National-ID/password adapter, opaque Supabase alias และ `User.authSubject`; ไม่มี parallel login system และไม่มี mandatory email login |
| อะไรต้อง atomic | การ approve/reject และ PostgreSQL writes ที่เป็นผลของ decision ต้องเป็น cohesive transaction พร้อม audit event |
| อะไรยังไม่ทราบ | external Hospital Master provider, real-world verification evidence, future automation และ ownership/network/invitation rules ตามหัวข้อ Open Requirements |

## 3. Hospital Master Boundary

Phase 3B ต้องมี canonical Hospital Master concept ที่ application service เรียกผ่าน boundary ที่เปลี่ยน adapter ได้ เช่น `HospitalMasterResolver` หรือชื่อที่สอดคล้องกับ conventions ตอน implement

MVP adapter อาจอ่าน controlled development/test master data จาก PostgreSQL โดยมีข้อมูลขั้นต่ำ:

```text
hospitalCode  stable + unique
name          canonical display name
```

ข้อกำหนดของ boundary:

- `hospitalCode` เป็น canonical business identity ของ organization และต้อง unique ใน master data และ `Hospital`
- Application Service รับผล match ที่เชื่อถือได้จาก boundary ไม่ bind กับ API/provider ภายนอกโดยตรง
- ผู้สมัครเลือก code ที่มีอยู่ได้ แต่ค่าจาก browser ไม่พิสูจน์ว่า organization นั้นผ่าน verification
- ชื่อและ metadata ที่ผู้สมัครกรอกเองห้าม overwrite canonical master data
- ไม่สร้าง external integration, generic master-data platform หรือ provider-specific field ใน Phase 3B
- production data ownership/import process ยังต้องยืนยันก่อนนำข้อมูลจริงขึ้น production

## 4. Application Lifecycle and Persistence

Phase 3B ควรเพิ่ม `HospitalOnboardingApplication` หรือชื่อเทียบเท่า แยกจาก `Hospital` โดยมี lifecycle เล็กที่สุด:

```text
PENDING → APPROVED
        └→ REJECTED
```

เหตุผลที่ต้องแยก application:

- เก็บ rejected application และผู้ตัดสินไว้ตรวจสอบย้อนหลังได้
- ไม่ overload `Hospital.status` ให้แทนทั้งคำขอและ organization lifecycle
- ไม่ต้องสร้าง Hospital domain record ก่อน approval
- รองรับการ deny duplicate/conflicting claim โดยไม่ silently merge organization

ข้อมูลขั้นต่ำที่ Phase 3B schema ต้องรองรับ:

| Concept | Required invariant |
| --- | --- |
| application ID | stable internal identifier |
| Hospital Master reference/code | ชี้ canonical entry; ห้ามใช้ applicant-controlled name เป็น identity |
| applicant User | relation ไป User เดิมหรือ User ที่ resolve/create แล้ว จึงเชื่อม Person ได้โดยไม่เก็บ raw National ID |
| status | `PENDING`, `APPROVED`, `REJECTED` เท่านั้น |
| submission timestamps | บันทึกเวลาสร้าง/แก้ไขตาม convention |
| review attribution | reviewer User และ review timestamp สำหรับ terminal state |
| decision note | optional, bounded, sanitized; exact operator-facing evidence/reason requirement ยังเปิดอยู่ |

ข้อกำหนดด้าน duplicate/concurrency:

- Hospital ที่สร้างจาก approval ต้องมี unique `hospitalCode`
- เมื่อ code มี Hospital อยู่แล้วหรือมี competing `PENDING` application ระบบต้อง fail closed และส่งให้ Platform Admin reconciliation
- exact self-service reapplication หลัง `REJECTED` ยังไม่ยืนยัน จึงไม่อยู่ใน Phase 3B happy path และห้ามลบ/เขียนทับ application เดิม
- retry ต้องไม่สร้าง application, Hospital, role หรือ membership ซ้ำ; exact idempotency key/constraint ให้เลือกใน Phase 3B จาก transport และ Prisma/PostgreSQL capability ที่ใช้จริง

`HospitalStatus.PENDING_VERIFICATION` ที่มีอยู่เป็น organization lifecycle foundation แต่ไม่ใช้แทน application `PENDING` ใน flow ใหม่นี้ Phase 3B ไม่ต้องสร้าง Hospital จนกว่าจะ approve และสร้างเป็น `ACTIVE`

## 5. Applicant Identity Cases

ทุกกรณีเริ่มจาก server validation ของ Thai National ID และ HMAC lookup ผ่าน identity service เดิม ห้าม persist หรือ log raw National ID

### Case A — Completely new applicant

- resolve identity ก่อน; เมื่อไม่พบจึงสร้าง `Person`
- สร้าง `User` ที่เชื่อม Person เดิมเพียงหนึ่งรายและคง `PROVISIONED` ระหว่างรออนุมัติ
- ถ้าต้อง establish credential ให้รับ user-owned password ใน trusted onboarding workflow และเรียก `provisionPasswordAuthIdentity()` หลังตรวจ policy/business preconditions
- สร้าง application `PENDING`; ยังไม่สร้าง `HOSPITAL` role, OWNER membership หรือ ACTIVE Hospital

### Case B — Existing Person and/or User

- reuse Person เดิมเสมอ และ reuse User เดิมเมื่อมีอยู่; existing Person ที่ยังไม่มี User อาจได้เพียง `PROVISIONED` User ตาม trusted workflow โดยยังห้าม activate จาก National ID เพียงอย่างเดียว
- ถ้ามี provider identity อยู่แล้ว ห้าม overwrite หรือ provision ซ้ำ; ต้องพิสูจน์ ownership ผ่าน authentication/session boundary เดิม
- approval เพิ่มเฉพาะ business relationship ที่ขาดและเปลี่ยน lifecycle ตาม transaction contract
- identity/account conflict ที่พิสูจน์ไม่ได้ต้อง fail closed ไป trusted recovery/reconciliation

### Case C — Existing HOSPITAL member applies for another hospital

- reuse Person/User และ `HOSPITAL` role เดิม
- approval เพิ่ม OWNER membership ของ Hospital ใหม่เท่านั้น
- `HospitalMembership` แยกตาม Hospital ทำให้ multi-hospital membership ยังคงเป็น first-class behavior

### Case D — Duplicate or conflicting onboarding

- ห้ามสร้าง Person/User/Hospital ซ้ำหรือ silently merge
- same hospital code ที่มี Hospital หรือ competing pending claim, provider alias conflict, identity ambiguity และ concurrent decision ต้องจบด้วย conflict/deny และ trusted review
- Phase 3B ต้องทดสอบ concurrent/retry paths ที่เสี่ยงสร้าง duplicate record

กรณี existing non-active User ที่มี provider mapping แต่ไม่สามารถพิสูจน์ credential ownership ผ่าน flow เดิมได้ ยังไม่มี recovery requirement ที่ยืนยันแล้ว จึงต้องเข้าสู่ trusted reconciliation ไม่ใช่ overwrite account หรือสร้าง User ใหม่

## 6. Authentication and Credential Ownership

```text
National ID
  → validate + HMAC
  → Person → User
  → opaque provider alias
  → Supabase password auth
  → User.authSubject
  → ACTIVE ActorContext หลัง approval
```

- password เป็น secret ของ applicant; Admin ห้ามอ่าน กำหนด สร้างจาก National ID/วันเกิด หรือ log
- National ID/password input ห้ามถูกตีความว่าเป็น organization verification หรือ automatic proof ของ existing DEMI identity; existing account ownership ต้องมาจาก valid current authentication/session หรือ trusted reconciliation
- onboarding transport ห้าม expose opaque provider alias, `identityKeyHash`, provider subject หรือ password
- provisioning primitive เป็น server-only dependency ของ higher-level workflow ไม่ใช่ public account-creation API
- prefer credential establishment ระหว่าง applicant-controlled submission ก่อน approval เพื่อให้ Admin decision ไม่ต้องจัดการ password
- application ห้ามถูก mark `APPROVED` หาก account effect ที่ operation รับรองว่าสำเร็จยังอยู่ในสถานะคลุมเครือ
- PostgreSQL กับ Supabase Auth ไม่มี distributed transaction หาก flow ต้องสร้าง provider account ให้ใช้ compensation/reconciliation pattern ของ Phase 2.1 และห้ามรายงาน success เมื่อ cleanup/reconciliation ยังไม่ชัด

การ reject application ไม่ลบ Person/User/provider identity อัตโนมัติ เพราะ identity อาจมี role หรือ relationship อื่น Applicant User ที่ยังไม่ผ่านเงื่อนไข activation ต้องไม่ถูกทำให้ `ACTIVE`

## 7. Authorization Capabilities

Phase 3B ใช้ vocabulary เท่าที่ onboarding slice ต้องใช้:

| Capability | Caller and scope |
| --- | --- |
| `hospital:onboard` | public applicant admission policy; จำกัดเป็นการ submit application ของตนและไม่มี authority เพื่อ assign role/status |
| `hospital:review` | Platform `ADMIN`, global governance scope; อ่านเฉพาะข้อมูล review ที่จำเป็น |
| `hospital:approve` | Platform `ADMIN`, global governance scope; pending application เท่านั้น |
| `hospital:reject` | Platform `ADMIN`, global governance scope; pending application เท่านั้น |

`hospital:onboard` เป็นชื่อ business operation ไม่ใช่การมอบ Role ให้ anonymous caller Public transport ต้องใช้ abuse controls, bounded schema validation และ policy เฉพาะ operation นี้ ส่วน `HOSPITAL + OWNER` ไม่มี capability ของ Platform Admin โดยนัย

## 8. Consistency-Critical Operations

### Submit application

Application Service ต้อง orchestrate master match, identity resolution, duplicate checks, Person/User prerequisites, optional provider provisioning และ application creation ห้ามวาง orchestration ทั้งหมดใน Server Action

PostgreSQL writes ที่รวมกันเป็น successful submission ต้อง atomic เท่าที่ฐานข้อมูลรองรับ External Supabase effect ต้องแยกเป็น explicit step พร้อม compensation/reconciliation; password ห้ามถูก persist เพื่อรอ Admin

### Approve application

ภายใน Prisma/PostgreSQL transaction เดียว:

```text
authenticate + authorize Platform ADMIN
+ re-read and lock/guard PENDING application
+ verify canonical Hospital Master match is still valid
+ verify manual identity/organization review preconditions are satisfied without trusting browser assertions
+ ensure hospitalCode is not already claimed
+ activate the existing canonical Hospital Master row as `ACTIVE`
+ reuse applicant User/Person
+ upsert HOSPITAL role
+ create ACTIVE OWNER HospitalMembership
+ set User ACTIVE when credential preconditions are satisfied
+ set application APPROVED with reviewer/timestamp
+ record approval AuditEvent
= commit all or rollback all
```

ถ้า credential/provider effect ยังต้องเกิดตอน approval ให้วางนอก PostgreSQL transaction และใช้ compensation/reconciliation แบบ Phase 2.1; ห้ามจำลองว่าเป็น distributed transaction และห้าม commit approval เมื่อ precondition ที่จำเป็นยังไม่สำเร็จ

### Reject application

ภายใน transaction เดียวต้อง guard `PENDING`, เปลี่ยนเป็น `REJECTED`, บันทึก reviewer/timestamp/optional bounded reason และ AuditEvent โดยไม่สร้างหรือ activate Hospital, role หรือ membership

## 9. Transport and UI Contract

- `/hospital/onboarding` เป็น responsive public web flow และใช้ Server Action เป็น web adapter ได้
- Admin review UI ใช้ authenticated server boundary และแสดง canonical hospital/application data ที่จำเป็นเท่านั้น
- Server Action รับ request, validate transport input, resolve actor/session, เรียก Application Service และ map sanitized result/error
- Application Service และ policy ห้าม depend on `FormData`, cookies, React, LIFF SDK, `NextRequest` หรือ `NextResponse`
- ไม่สร้าง `/api/v1/*`, LIFF integration หรือ native client ใน Phase 3B หากยังไม่มี consumer requirement

## 10. Security and Privacy Checklist

- validate และ bound public inputs ก่อน identity/database/provider work
- เพิ่ม request-size, abuse protection และ deployment-appropriate rate limiting ก่อน production public exposure
- derive reviewer identity, role และ scope จาก server-side `ActorContext`; ไม่รับ authority จาก browser
- ห้าม arbitrary role assignment, OWNER creation, Hospital activation หรือ application decision
- ห้าม log/return raw National ID, password, `identityKeyHash`, provider alias, subject, token หรือ internal errors
- client-facing errors ต้อง generic เมื่อการบอกรายละเอียดทำให้ enumerate identity, hospital claim หรือ provider state ได้
- audit submission outcome และ governance state changes โดย metadata ไม่มี secrets/identity values
- authorization ambiguity, stale decision และ conflict ต้อง default เป็น deny
- production approval rollout ต้องมี confirmed operational evidence/reviewer procedure; controlled development/test master data และ review fixtures ใช้ implement/test MVP flow ได้โดยไม่ invent evidence fields

## 11. Phase 3B Schema Recommendation

Existing models ที่ reuse ได้:

- `Person`, `User`, `UserRole`, `HospitalMembership`, `AuditEvent`
- `Hospital.status` สำหรับ active/suspended organization lifecycle
- `User.authSubject` และ `Person.identityKeyHash` ตาม Phase 2.1

Schema gap ที่ Phase 3B ควรเพิ่มผ่าน migration:

- canonical Hospital Master data ใช้ `Hospital` rows เป็น controlled MVP store โดยมี replaceable source boundary ที่ seed/import layer; ไม่ parse XLSX runtime
- unique stable `Hospital.hospitalCode` หรือ relation ที่ enforce identity เดียวกันได้ที่ database layer
- `HospitalOnboardingApplication` พร้อม applicant relation, canonical hospital reference, three-state lifecycle และ review attribution
- database constraints/concurrency guard ที่ป้องกัน duplicate Hospital code, duplicate pending claim และ repeated approval side effects

Phase 3A ไม่แก้ Prisma schema; Phase 3B implementation เพิ่ม fields/model เหล่านี้ผ่าน migration และใช้ committed JSON fixture เป็น seed input เท่านั้น ไม่ parse Excel ใน runtime และไม่ใช้ free-text เป็น master identity

## 12. Intentionally Open Requirements

- authoritative external Hospital Master source/provider และ production import/update ownership
- exact real-world evidence, contact proof, reviewer checklist และ SLA สำหรับ manual verification
- future automated verification mechanism
- self-service reapplication policy หลัง rejection และ exception handling ที่เกี่ยวข้อง
- Hospital Owner transfer, additional/multiple owner rules
- parent/main hospital authority ต่อ child hospitals
- staff/OSM invitation และ activation mechanism
- recovery path สำหรับ existing non-active/conflicting provider identity

ประเด็นเหล่านี้ห้ามถูกแปลงเป็น implementation assumption Phase 3B MVP ใช้ controlled development/test Hospital Master, manual Platform Admin decision และ safe reconciliation path ได้

## 13. Explicitly Out of Phase 3B

Staff/OSM invitation implementation, patient provisioning/activation UI, clinical workflows, screening, care plans, appointments, follow-up, reporting, LIFF/LINE linking, ThaID, native authentication, password recovery, complete capability matrix, OSM scope, hospital network authority, owner transfer/multi-owner workflow, external Hospital Master integration และ automated verification

## 14. Phase 3B Acceptance Checklist

- public caller submit ได้เฉพาะ bounded onboarding application และเลือก role/status เองไม่ได้
- canonical master code ถูก resolve ฝั่ง server และ duplicate/conflict fail closed
- identity cases A–D reuse Person/User ตาม contract
- password/provider alias/identity hash ไม่ถูก persist ใน application, log หรือ response
- only Platform `ADMIN` review/approve/reject ได้
- approval/rejection transaction ทดสอบ happy path, rollback, retry และ concurrent decision
- approved result มี ACTIVE Hospital, `HOSPITAL` role, ACTIVE OWNER membership และ account lifecycle ที่สอดคล้อง
- rejected result ไม่มี Hospital/role/membership activation และ history ยังคงอยู่
- existing HOSPITAL User เป็น Owner ของ Hospital ที่สองได้โดยไม่ duplicate identity
- web transport เรียก transport-agnostic Application Service และไม่มี speculative API
- documentation/open requirements ไม่ถูกปิดโดย implementation assumption

## 15. Phase 3B Implementation Record

สัญญานี้ถูกนำไป implement เป็น MVP vertical slice แล้ว:

- `prisma/seed/hospital-master-v2.json` มี 78 records, canonical codes ไม่ซ้ำ, ไม่มี `HH`, มี `KANG`/`KHON` ตาม approved artifact และ seed script ทำงานแบบ idempotent เฉพาะ development/test
- `Hospital.hospitalCode` เป็น unique canonical key; `parentHospitalId` เก็บ hierarchy reference เท่านั้นและไม่ถูกใช้ใน authorization
- `HospitalOnboardingApplication` เก็บ `PENDING`, `APPROVED`, `REJECTED`, reviewer/timestamps และ bounded rejection reason; partial unique index ป้องกัน pending claim ซ้ำต่อ Hospital โดยไม่ลบ history
- Public submit จะ fail closed เมื่อ Hospital มี application history อยู่แล้ว (รวม `REJECTED`) เพื่อไม่เดา reapplication policy; การเปิด reapply ต้องเป็น requirement/follow-up แยกต่างหาก
- `/hospital/onboarding` สร้างเฉพาะ `Person` + `User(PROVISIONED)` + provider mapping + `PENDING` application หลัง identity ไม่พบ existing Person; existing identity fail closed
- Multi-hospital identity model ยังรองรับหลาย membership ใน schema และ approval operation แต่ anonymous public submit ที่ resolve existing Person/User จะหยุดที่ safe existing-account path; authenticated reuse flow ถูกเลื่อนไป follow-up เพื่อไม่สร้าง unproven identity claim
- `/app/admin/hospital-onboarding` ใช้ session/ActorContext เดิมและ server-side Platform `ADMIN` capability checks
- approve/reject อยู่ใน Application Service; approval transaction guard/claim, activate Hospital/User, upsert `HOSPITAL`, create `OWNER`, audit และ rollback เมื่อ precondition/side effect ใดไม่ผ่าน
- Supabase provider provisioning อยู่ข้าม PostgreSQL transaction; failure ที่ cleanup ไม่พิสูจน์ได้ถูกยกระดับเป็น reconciliation error และไม่สร้าง application ที่อนุมัติได้
- shared/deployment-level rate limiting ยังเป็น release prerequisite ก่อนเปิด public traffic กว้าง ๆ; Phase 3B ไม่เพิ่ม paid infrastructure ใหม่

## 16. Evidence Classification

### Confirmed current requirement

- [ADR-0001](../adr/0001-person-and-user-identity.md): Person/User separation, identity reuse และ multi-role/multi-hospital identity
- [ADR-0002](../adr/0002-role-capability-scope-authorization.md): server-side fail-closed Role + Capability + Scope policy
- [ADR-0003](../adr/0003-hospital-led-onboarding.md): hospital-led public onboarding, Platform Admin verification และ `HOSPITAL + OWNER`
- [ADR-0005](../adr/0005-server-side-application-boundary.md), [ADR-0006](../adr/0006-transactional-business-operations.md) และ [ADR-0007](../adr/0007-client-transport-and-mobile-ready-architecture.md): service, transaction และ transport boundaries
- current Prisma schema และ Phase 2.1 identity/auth/audit services: models/primitives ที่ reuse ได้และ schema gaps ที่ระบุในเอกสารนี้

### Legacy behavior worth preserving

ไม่มี legacy repository อยู่ใน workspace นี้และ Phase 3A ไม่ได้ใช้ legacy implementation เป็นหลักฐาน จึงไม่มี legacy behavior ที่ยกขึ้นเป็น current requirement

### Legacy behavior intentionally rejected

Generic role-selection signup, applicant-controlled organization identity, Hospital Owner ที่ได้ Platform Admin, parallel authentication system และ business logic ที่อยู่ใน transport ถูกปฏิเสธโดย accepted architecture ปัจจุบัน ไม่ว่า legacy เคยทำอย่างไร

### Still unresolved

ใช้รายการใน [Intentionally Open Requirements](#12-intentionally-open-requirements) เท่านั้น ห้ามใช้ legacy detail หรือ developer assumption ปิดคำถามเหล่านั้น
