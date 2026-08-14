# Phase 4A — Hospital Workforce Provisioning Requirement Closure and Architecture Contract

- สถานะ: Accepted requirement/architecture contract สำหรับ Phase 4B; Phase 4A เองไม่มี feature code หรือ migration
- วันที่: 2026-08-14
- ขอบเขต: Hospital personnel/OSM provisioning และ first-time activation contract
- Implementation handoff: [Phase 4B Workforce Provisioning](./PHASE_4B_WORKFORCE_PROVISIONING.md)
- Decision closure: Owner-confirmed workforce authority, OSM persistence และ first-time activation ถูกบันทึกใน [ADR-0008](../adr/0008-workforce-provisioning-and-activation.md)

เอกสารนี้ปิดขอบเขตและกติกาที่ Phase 4B implementation ใช้ โดยแยกสิ่งที่ยืนยันแล้วออกจากข้อเสนอและ open requirement อย่างชัดเจน ไม่ขยายไปยัง patient หรือ clinical workflow

## หลักฐานและระดับความแน่นอน

แหล่งอำนาจยังเรียงตาม [Project Context](../CONTEXT.md#source-of-truth): confirmed business requirements, accepted ADRs, architecture baseline, context และ legacy code ตามลำดับ Legacy ใช้เป็น behavioral reference เท่านั้น

หลักฐานที่ตรวจใน Phase 4A:

- [Prisma schema](../../prisma/schema.prisma)
- [Architecture baseline](../architecture/DEMI_ARCHITECTURE_BASELINE.md)
- [ADR-0001: Person and User Identity](../adr/0001-person-and-user-identity.md)
- [ADR-0002: Role, Capability and Scope Authorization](../adr/0002-role-capability-scope-authorization.md)
- [ADR-0003: Hospital-Led Onboarding](../adr/0003-hospital-led-onboarding.md)
- [ADR-0005: Server-Side Application Boundary](../adr/0005-server-side-application-boundary.md)
- [ADR-0006: Transactional Business Operations](../adr/0006-transactional-business-operations.md)
- [ADR-0008: Workforce Provisioning and First-Time Activation](../adr/0008-workforce-provisioning-and-activation.md)
- [Phase 3A Hospital Onboarding contract](./PHASE_3A_HOSPITAL_ONBOARDING.md)
- [Phase 3C Platform Admin Bootstrap contract](./PHASE_3C_PLATFORM_ADMIN_BOOTSTRAP.md)
- Current identity, authentication, authorization, hospital-onboarding และ audit services/tests ใน `src/modules/` และ `tests/`
- Legacy repository [raviut-max/demi-plus-web-v2](https://github.com/raviut-max/demi-plus-web-v2) ที่ commit `7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e`

การใช้คำในเอกสาร:

- **ยืนยันแล้ว** — สอดคล้องกับ user requirement, accepted ADR หรือ implementation ปัจจุบัน
- **ข้อเสนอ Phase 4B** — โครงสร้างขั้นต่ำที่เสนอให้ implement ต่อ; ไม่อ้างว่าเป็น schema/requirement ที่มีอยู่แล้ว
- **Open requirement** — ต้องมี owner confirmation หากมีผลต่อ full slice หรือเปลี่ยน invariant
- **Safe default** — ค่าเริ่มต้นที่ fail closed และใช้ได้เฉพาะเมื่อ owner ยังไม่เลือกพฤติกรรมที่กว้างกว่า

## 1. Phase 4B Target Outcome

ผลลัพธ์ที่ต้องการคือ Hospital context ที่ trusted actor ใช้สร้าง workforce relationship โดยไม่สร้าง identity ซ้ำ:

```text
ACTIVE Hospital Owner
        ↓ server-side policy + target Hospital scope
Provision Hospital personnel หรือ OSM
        ↓ Thai National ID + bounded profile data
Resolve existing Person → existing User เมื่อมีอยู่
        ↓
Add only missing role + relationship
        ↓
User-owned credential establishment / activation boundary
        ↓
ACTIVE Hospital staff หรือ OSM
        ↓
existing /login + server-resolved ActorContext
```

### Smallest safe vertical slice

Phase 4B ควรส่งมอบ service operations แยกกันอย่างชัดเจน:

1. `provisionHospitalMember` สำหรับบุคลากรปกติ
2. `provisionOsm` สำหรับ OSM
3. อ่านรายการ workforce ภายใน Hospital scope เท่าที่จำเป็นต่อการยืนยันผลและ UI โดยไม่เปิดเผย raw National ID หรือ provider data
4. identity resolution, duplicate/concurrency handling, transactional persistence และ audit
5. activation capability issuance/claim, target-owned password establishment และ final activation ตาม ADR-0008
6. การต่อ ActorContext ให้รู้จัก OSM–Hospital relationship ขั้นต่ำ

การเลือก `DOCTOR`, `NURSE`, `COORDINATOR` หรือ `OTHER` ในกรณีบุคลากรเป็นการตัดสินของ trusted Hospital actor ผ่าน operation ที่ server กำหนด ไม่ใช่การเลือก role ของ target user เอง และไม่ใช้ generic public role-selection flow

### Confirmed activation gate

Phase 4B ใช้ **opaque one-time activation credential** สำหรับผู้ใช้ใหม่ โดย
Activation URL, QR code และ assisted in-person flow เป็น presentation/delivery
ของ capability เดียวกัน ไม่ใช่ authentication mechanisms คนละชุด

```text
Person/User/role/relationship = PROVISIONED
        ↓
one-time activation credential
        ↓
target user sets their own password
        ↓
existing trusted password-auth provisioning boundary
        ↓
local finalization
        ↓
User + relevant relationship = ACTIVE
```

Copy link/QR ใช้ default expiry `24 hours`; assisted in-person activation ใช้
default expiry `15 minutes` โดยใช้ purpose-specific activation model เดียวกันและ
กำหนด `expiresAt` ตาม presentation mode ที่เริ่ม ceremony ไม่สร้าง token system
หลายชุดโดยไม่จำเป็น

Hospital staff ห้ามสร้าง, รู้, เห็น หรือส่งต่อ **password** ของ target user และ
ห้ามกรอก password แทนเป็น normal flow แต่สามารถนำเสนอ activation URL/QR ตาม
delivery flow ที่ได้รับอนุมัติ ผู้ใช้ที่ยัง activate ไม่สำเร็จคงสถานะ
`PROVISIONED` และเข้า `/app` ไม่ได้

## 2. Actors and Trust Boundary

| Actor | ขอบเขตความไว้วางใจและหน้าที่ |
| --- | --- |
| Platform `ADMIN` | Platform governance, recovery และ reconciliation ตาม Phase 3; ไม่ใช่ routine workforce provisioner ใน Phase 4B |
| Hospital Owner | `UserRole = HOSPITAL` และมี `HospitalMembership.membershipType = OWNER`, `status = ACTIVE` ใน target Hospital ที่ `status = ACTIVE`; เป็น trusted actor หลักของ Phase 4B |
| Authorized Hospital actor | Phase 4B จำกัดที่ Hospital Owner ตาม policy ด้านล่าง; ordinary `HOSPITAL` member ไม่มีสิทธิ์ provision |
| Target Hospital personnel | ผู้รับ `HOSPITAL` role และ `HospitalMembership` แบบ `MEMBER`; ไม่มี authority จากข้อมูลที่ส่งเข้ามา |
| Target OSM | ผู้รับ `OSM` role และ `OsmHospitalRelationship`; ไม่ได้รับ area/patient/clinical scope จากการ provision นี้ |
| Supabase Auth/provider | Authentication adapter เท่านั้น; provider subject, alias และ metadata ไม่ใช่ DEMI authorization |

Trust boundary ที่ต้องรักษา:

```text
Platform ADMIN
      ↓ governance / Hospital activation
Hospital
      ↓ active OWNER membership + capability + direct Hospital scope
Hospital Owner
      ↓ server-side provisioning service
Person/User + trusted role + Hospital relationship
        ↓ target-owned one-time activation
ACTIVE ActorContext
```

สิ่งที่ browser ห้ามเป็น authority ได้แก่ role, membership type, profession, status, target Hospital scope, provider subject, identity hash และสิทธิ์ของ actor การมีปุ่มหรือ field ใน UI ใช้เพื่อ UX เท่านั้น

## 3. Hospital Personnel Provisioning Contract

### 3.1 Definition

Hospital personnel ปกติใช้ abstraction ที่มีอยู่แล้ว:

```text
UserRole.role = HOSPITAL
HospitalMembership:
  membershipType = MEMBER
  profession = DOCTOR | NURSE | COORDINATOR | OTHER
```

ห้ามเพิ่ม `DOCTOR`, `NURSE`, `COORDINATOR`, `OWNER` หรือ `STAFF` เป็น top-level role และห้ามใช้ `HospitalMembership.membershipType = OWNER` ใน operation บุคลากรปกติ

### 3.2 Minimum input

Input ที่ service ต้อง validate ฝั่ง serverมีอย่างน้อย:

- Thai National ID ที่ผ่าน `thaiNationalIdSchema` และใช้ HMAC namespace `thai-national-id` สำหรับ lookup เท่านั้น
- `givenName` และ `familyName` แบบ bounded ตาม Person convention
- target Hospital ที่ operation ระบุได้ แต่ต้อง re-resolve และ authorize ฝั่ง server
- profession ที่ trusted Hospital actor เลือกจาก existing `Profession` enum

`birthDate`, phone, email, specialization และข้อมูล profile อื่นจาก legacy ยังไม่ใช่ field ที่มี authoritative persistence ใน current schema จึงไม่บังคับใน Phase 4B โดยปริยาย หาก owner ยืนยันว่าจำเป็นต้องใช้ ต้องกำหนด field, validation, PII policy และ migration แยกก่อน

### 3.3 Successful state

สำหรับ target ใหม่:

1. resolve Person ก่อนสร้าง identity ใหม่
2. ถ้าไม่พบ Person ให้สร้าง Person หนึ่งราย
3. สร้างหรือ reuse User หนึ่งรายต่อ Person โดยเริ่มที่ `UserStatus.PROVISIONED`
4. upsert `UserRole(HOSPITAL)` โดยไม่ลบ role เดิม
5. สร้าง `HospitalMembership` ของ target Hospital ด้วย `MEMBER` และ profession ที่ validated
6. ใช้ `MembershipStatus.PROVISIONED` จนกว่า activation precondition จะครบ
7. เขียน audit ใน transaction เดียวกับ PostgreSQL writes

สำหรับ existing `User` ที่มี `status = ACTIVE`, มี `authSubject` ที่ map ถูกต้อง
และมี account credential ownership อยู่แล้ว ให้สร้าง relationship ใหม่เป็น
`ACTIVE` ใน transaction เดียว โดยไม่เรียก provider, ไม่เปลี่ยน credential เดิม
และไม่สร้าง activation token ใหม่

### 3.4 Profession rules

- `DOCTOR` → `HOSPITAL + HospitalMembership(MEMBER, DOCTOR)`
- `NURSE` → `HOSPITAL + HospitalMembership(MEMBER, NURSE)`
- `COORDINATOR` หรือ `OTHER` ใช้ตาม classification ที่ trusted actor เลือก
- profession เป็นข้อมูล classification ไม่ใช่ authorization authority ด้วยตัวเอง
- ห้ามสร้าง permission แยกตาม profession จนกว่าจะมี requirement ว่า behavior ต่างกัน
- หากมี membership เดิมของ user/hospital ที่เป็น `OWNER`, Phase 4B ห้าม downgrade เป็น `MEMBER` หรือแก้ profession ของ OWNER โดย implicit; ให้ conflict และส่งเข้ากระบวนการที่ยืนยันภายหลัง

## 4. OSM Provisioning Contract

### 4.1 Identity and role

OSM ใช้ top-level `Role.OSM` เท่านั้น ไม่ใช้ `Profession` และไม่ถูกแปลงเป็น `HOSPITAL` role โดยอัตโนมัติ:

```text
UserRole.role = OSM
OsmHospitalRelationship:
  hospital = target Hospital
  status = PROVISIONED | ACTIVE | SUSPENDED
```

ถ้า target เป็น `PATIENT` หรือ `HOSPITAL` อยู่แล้ว ให้ reuse Person/User และเพิ่มเฉพาะ `OSM` role กับ relationship ที่ขาด ห้ามลบหรือแทนที่ role เดิม คนเดียวกันจึงเป็นทั้ง OSM และ PATIENT หรือเป็น HOSPITAL และ OSM ได้ตาม identity model แต่ทุก relationship ต้องมาจาก trusted operation แยกกัน

### 4.2 Minimum Hospital relationship

Phase 4B ต้องเก็บความสัมพันธ์ขั้นต่ำว่า OSM ถูก provision/associated โดย
Hospital ใดและสถานะของความสัมพันธ์เป็นอะไร ความสัมพันธ์นี้เป็น tenant
association ที่ยอมรับแล้ว ไม่ใช่การตัดสิน clinical/resource scope โมเดลและ
invariants อยู่ในข้อ 8:

- ไม่มี `profession`
- ไม่มี `membershipType = OWNER/MEMBER`
- ไม่มี `area`, `assignedPatients`, district, subdistrict, village หรือ patient ownership
- ไม่มีการสร้าง assignment ใด ๆ จากการ provision OSM

### 4.3 OSM scope boundary

ยังไม่ยืนยันว่า OSM scope ทางธุรกิจในอนาคตเป็น Hospital, area, assigned
patients, geographic hierarchy หรือการผสมกัน ดังนั้น:

- Phase 4B ห้ามสร้างหรืออ่าน patient/area scope เป็นผลจาก relationship นี้
- `Role.OSM` เพียงอย่างเดียวไม่ให้สิทธิ์ต่อ patient หรือ clinical resource
- relationship ที่ active ใช้ยืนยันได้เพียง Hospital association ที่ตรง row และสถานะเท่านั้น
- หาก scope resolution ไม่มีข้อมูลหรือไม่ชัดเจน policy ต้อง `DENY`
- `OsmHospitalRelationship` อาจมีหลาย row ต่อ User เพื่อรองรับ identity reuse
  แต่ Phase 4B ไม่เปิด cross-Hospital OSM workflow semantics โดย implicit

product behavior ว่า OSM หนึ่งคน “ควร” อยู่ได้หลาย Hospital หรือไม่ยังเป็น
open requirement; การมี row หลายรายการใน persistence ไม่ได้ grant cross-Hospital
authority

## 5. Identity Cases

ทุก case ใช้ลำดับเดียวกัน:

```text
validate input
  ↓
HMAC Thai National ID → find Person
  ↓
reuse Person/User หรือสร้างเฉพาะที่ยังไม่มี
  ↓
server-side policy + target Hospital verification
  ↓
upsert missing role/relationship in one local transaction
```

### Case 1 — New Hospital Staff

```text
Hospital Owner
  ↓
provisionHospitalMember
  ↓
Thai National ID + names + profession
  ↓
Person not found → create Person
  ↓
create User(PROVISIONED)
  ↓
upsert HOSPITAL role
  ↓
create HospitalMembership(MEMBER, profession, PROVISIONED)
  ↓
one-time activation remains separate until target completes it
```

ไม่สร้าง duplicate Person/User และไม่ mark `ACTIVE` เพียงเพราะ owner เป็นผู้กรอกข้อมูล

### Case 2 — Existing DEMI User Added to Another Hospital

ถ้า User เดิมอยู่ Hospital A แล้ว Hospital B provision คนเดียวกัน:

- reuse Person และ User เดิม
- reuse `HOSPITAL` role หากมีอยู่ หรือสร้าง role ที่ขาด
- เพิ่ม `HospitalMembership` ของ Hospital B เท่านั้น
- ไม่แก้หรือลบ membership ของ Hospital A
- target Hospital B ต้องเป็น Hospital ที่ active และ actor ต้องมี owner scope ของ B โดยตรง
- ถ้า User เดิม `ACTIVE` และ auth mapping ถูกต้อง membership ใหม่เป็น `ACTIVE`
  ทันทีโดยไม่ต้อง activation ซ้ำ; ถ้า User ยังไม่ active ให้ relationship ใหม่
  เป็น `PROVISIONED` และห้าม auto-reactivate

ไม่มี active workspace หรือ hospital context ใดที่ browser เลือกแล้วจะขยาย scope ให้เอง หาก actor มี owner membership หลาย Hospital ต้องระบุ target Hospital ต่อ operation และ server ต้องตรวจซ้ำทุกครั้ง

### Case 3 — Existing User Gains HOSPITAL Role

ถ้า Person/User เดิมเป็น `PATIENT` หรือ `OSM` แล้วถูก provision เป็น hospital personnel:

- คง `PATIENT`/`OSM` role และ relationship เดิม
- เพิ่ม `HOSPITAL` role ที่ขาด
- สร้าง `HospitalMembership(MEMBER, profession)` ของ target Hospital
- ไม่สร้าง Person/User ใหม่ และไม่เปลี่ยน existing OSM scope หรือ patient relationship
- หาก User เป็น `SUSPENDED`, provider mapping ขัดแย้ง หรือ account state พิสูจน์ไม่ได้ ให้ conflict/reconciliation; ห้าม auto-reactivate

### Case 4 — New OSM

```text
Hospital Owner
  ↓
provisionOsm
  ↓
resolve Person/User
  ↓
upsert OSM role
  ↓
create OsmHospitalRelationship(target Hospital)
  ↓
PROVISIONED หรือ ACTIVE ตาม account precondition
```

ห้ามเพิ่ม area/patient assignment เพียงเพื่อทำให้ OSM flow ดูสมบูรณ์

### Case 5 — Existing User Gains OSM Role

ถ้า existing `PATIENT` หรือ `HOSPITAL` User ถูก provision เป็น OSM:

- reuse Person/User
- upsert `UserRole(OSM)` โดยไม่ replace roles เดิม
- create/reuse OSM–Hospital relationship ของ target Hospital
- ไม่สร้าง `HospitalMembership` เพื่อแทน OSM relationship
- ไม่สร้าง patient ownership, village/area assignment หรือ clinical permission

### Case 6 — Existing identity and relationship conflicts

- `Person` มีอยู่แต่ `User` ไม่มี: สร้าง User หนึ่งรายแบบ `PROVISIONED` ภายใน transaction; หาก concurrent create ชนะให้ re-read และ reuse
- User มี role แต่ไม่มี relationship ของ target Hospital: role เดิมไม่ใช่ relationship; operation เติม relationship ที่ขาดได้ถ้า policy/invariant อื่นผ่าน
- User มี relationship เดิมแบบเดียวกันและ classification/status เดียวกัน: idempotent success/no-op และไม่สร้าง audit ซ้ำสำหรับ state change เดิม
- User มี relationship เดิมแต่ profession, membership type หรือ target relationship kind ขัดกัน: conflict; ห้าม silently update/downgrade
- User มี `ADMIN` อยู่แล้ว: Hospital operation ห้ามสร้าง/แก้/ลบ `ADMIN`; หาก cross-role target ไม่อยู่ใน policy ที่ยืนยันแล้วให้ deny/reconciliation
- Provider subject/authSubject map ไป User เดิม: reuse และไม่ provision provider ซ้ำ
- Provider alias/subject มีอยู่แต่พิสูจน์ mapping ไม่ได้ หรือ map ไป User อื่น: fail closed; ห้าม attach/overwrite/delete อัตโนมัติ

## 6. Credential Ownership and Activation

### 6.1 แยก business concepts

| Concept | ความหมายใน Phase 4A/4B |
| --- | --- |
| Person provisioning | resolve หรือสร้างบุคคลจริงจาก identity reference; ไม่ใช่การสร้าง credential |
| User provisioning | สร้างหรือ reuse application account ที่ผูกกับ Person หนึ่งราย; สถานะเริ่มต้นอาจเป็น `PROVISIONED` |
| Role/membership assignment | trusted Hospital actor และ server policy รับรอง `HOSPITAL`/`OSM` relationship; ไม่ใช่การพิสูจน์ว่า target ถือ password |
| Credential establishment | target user ต้องเป็นผู้ครอบครองและเป็นผู้ตั้ง/รับ credential ผ่านวิธีที่ owner อนุมัติ; Hospital Owner ห้ามรู้ secret |
| Account activation | หลัง ownership proof สำเร็จจึงเปลี่ยน `User` และ relationship ที่เกี่ยวข้องเป็น `ACTIVE`; `/login` และ ActorContext เดิมจึงใช้งานได้ |

### 6.2 สิ่งที่ current authentication architecture รองรับ

Current Phase 2.1 มี `provisionPasswordAuthIdentity()` ซึ่ง:

- รับ existing DEMI User กับ password ที่ user เป็นเจ้าของจาก trusted higher-level workflow
- สร้าง provider account ด้วย opaque alias ที่ derive จาก `User.id`
- persist provider subject ลง `User.authSubject`
- ไม่สร้าง Person, role, membership และไม่เปลี่ยน `User.status`
- ใช้ compensation/reconciliation เมื่อ provider และ PostgreSQL สำเร็จไม่พร้อมกัน

Primitive นี้ไม่ใช่ staff/OSM activation requirement โดยตัวมันเอง และห้าม expose ให้ browser หรือ Hospital Owner ใช้สร้าง password แทน target user

### 6.3 Accepted one-time activation capability

สำหรับ new staff/OSM ให้สร้าง activation credential หลัง provisioning สำเร็จ
โดยมี purpose เฉพาะ workforce activation ผู้ใช้ใหม่เริ่มที่ `PROVISIONED` และ
ยังเข้า `/app` ไม่ได้จนกว่า target user จะใช้ credential นี้ตั้ง password ของ
ตัวเองและ local activation finalization สำเร็จ

Presentation/delivery ที่ยอมรับแล้วมีสามรูปแบบของ capability เดียวกัน:

- copy activation link
- QR code ที่ encode activation link
- assisted in-person activation บน dedicated activation mode

Copy link/QR ใช้ expiry default `24 hours`; assisted in-person ใช้ `15 minutes`
โดยใช้ activation model เดียวกันและตั้ง `expiresAt` ตาม mode ที่เริ่ม ceremony
ไม่สร้าง authentication/token architecture แยกกัน

Activation record มีขั้นต่ำเชิงแนวคิดดังนี้:

```text
WorkforceActivation
  id
  userId
  tokenHash
  expiresAt
  claimedAt
  usedAt
  revokedAt
  createdByUserId
  createdAt
```

กติกาความปลอดภัย:

- token ต้องเป็น cryptographically secure random ที่มี entropy อย่างน้อย 256 bits
- plaintext token อยู่เฉพาะช่วง issuance/presentation ที่จำเป็น และไม่เก็บใน DB
- DB เก็บ deterministic secure hash/digest เท่านั้น และ record ผูกกับ User เดียว
  กับ workforce activation purpose เดียว
- token เป็น single-use, revocable, มี expiry และ consumption ต้อง
  concurrency-safe; `claimedAt`/`usedAt` หรือ state ที่ ambiguous ต้อง fail closed
- regeneration ต้อง revoke credential เดิมก่อนออก credential ใหม่
- used/revoked/expired token ใช้ establish credential ไม่ได้
- activation record/audit ห้ามมี raw National ID, `identityKeyHash`, password, provider alias,
  provider subject, access token หรือ service credential

Assisted activation เป็น trust model ที่ Hospital ยืนยันตัวบุคคลจริงต่อหน้า
จากนั้นอุปกรณ์ถูกส่งให้ target user กรอกและยืนยัน password เอง Staff ห้าม
พิมพ์หรือเห็น password เป็น normal flow เมื่อสำเร็จต้อง clear temporary
activation state/session และส่ง target กลับไปยัง existing `/login` boundary โดย
ไม่คง password ไว้บนอุปกรณ์ Hospital Assisted activation ไม่ใช่ proof จาก
email/SMS possession

Email, SMS และ LINE/LIFF ไม่ใช่ dependency ของ core activation แต่อาจเป็น
future delivery channels ของ activation URL ได้ ส่วน external identity provider
และ ThaID ไม่ใช่ core activation dependency หรือข้อกำหนดของ Phase 4B และต้องมี
decision แยกหากนำมาใช้ในอนาคต

เมื่อ provider หรือ local finalization ล้มเหลว ห้ามรายงาน success และห้ามสร้าง
provider identity ซ้ำ ให้ใช้ compensation/reconciliation boundary เดิมตาม
ownership และ expected state

## 7. Authorization and Scope

### 7.1 Minimum Phase 4B capability vocabulary

Phase 4B ใช้ operation capability ขั้นต่ำตาม convention `resource:action` นี้
โดยรวม policy ไว้จุดเดียว ไม่สร้าง generic RBAC/ACL หรือ final global capability
matrix:

| Capability | ใช้กับ | เงื่อนไขขั้นต่ำ |
| --- | --- | --- |
| `membership:read` | อ่าน Hospital personnel และ OSM relationships ที่จำเป็นต่อ workforce view | actor เป็น active Hospital Owner ของ target Hospital; response ไม่เปิด raw identity/provider data |
| `membership:create` | provision ordinary Hospital personnel | actor เป็น active Hospital Owner ของ target Hospital; target Hospital active |
| `osm:provision` | provision OSM–Hospital relationship | actor เป็น active Hospital Owner ของ target Hospital; target Hospital active |

`membership:update`, `membership:disable`, owner-management และ clinical capabilities ไม่อยู่ใน Phase 4B เพราะยังไม่มี behavior ที่ยืนยันแล้ว ห้ามสร้าง generic RBAC/ACL framework เพื่อรองรับชื่อเหล่านี้ล่วงหน้า

### 7.2 Policy decision

สำหรับ Phase 4B ให้ใช้:

```text
ActorContext
  + required capability
  + Role.HOSPITAL
  + active HospitalMembership.membershipType = OWNER
  + target Hospital id
  + Hospital.status = ACTIVE
      ↓
server-side policy decision
```

กติกา:

- `OWNER` เป็น requirement ของ MVP ไม่ใช่แค่มี `Role.HOSPITAL`
- capability ยังต้องถูกประเมินแยกจาก role เพื่อไม่ให้ทุก Hospital member ได้สิทธิ์โดยนัย
- ordinary `HOSPITAL` member ไม่มีสิทธิ์ provision ใน Phase 4B แม้มี `HOSPITAL`
  role หรือ capability อื่น
- Platform `ADMIN` ไม่ได้ bypass เป็น routine workforce provisioner จากการมี global role เพียงอย่างเดียว
- target Hospital ที่ส่งจาก browser เป็นเพียง input; service ต้อง load record จริง ตรวจ `ACTIVE` และตรวจ owner membership ของ actor ใน transaction boundary อีกครั้ง
- actor ที่มีหลาย Hospital ต้องส่ง target ต่อ operation; ห้ามเลือก membership แรก, ใช้ localStorage หรือใช้ parent Hospital เป็น implicit scope
- `parentHospitalId` ปัจจุบันเป็น metadata เท่านั้น ไม่สืบทอด authority ไป child/parent
- policy input ไม่ครบ, actor/session stale, membership ไม่ active, Hospital ไม่ active หรือ scope resolve ไม่ได้ → `DENY`

## 8. Persistence Model

### 8.1 Existing concepts ที่ต้อง reuse

| Model | ใช้ใน Phase 4B |
| --- | --- |
| `Person` | identity record เดียวต่อ human; lookup ด้วย unique `identityKeyHash` |
| `User` | account เดียวต่อ Person; `personId` unique, `authSubject` unique, lifecycle จาก `UserStatus` |
| `UserRole` | many-to-many role assignment; composite key `(userId, role)` ทำให้ role ซ้ำไม่ได้ |
| `Hospital` | target organization; ต้อง `ACTIVE` และ resolve ด้วย internal id/controlled identity |
| `HospitalMembership` | ordinary hospital personnel; existing unique `(userId, hospitalId)` และ fields `membershipType`, `profession`, `status` |
| `AuditEvent` | actor/resource/state-change evidence; รองรับ `Prisma.TransactionClient` อยู่แล้ว |

สำหรับ Hospital staff ไม่ควรสร้าง profile/membership abstraction ใหม่มาแทน `HospitalMembership`

### 8.2 Accepted OSM relationship

Current schema มี `Role.OSM` แต่ยังไม่มี relationship model ที่ระบุว่า OSM associated กับ Hospital ใด การใช้ `HospitalMembership` แทนจะ overload `membershipType` และ `profession` ซึ่งมีความหมายเฉพาะ Hospital personnel/Owner และจะทำให้ future OSM scope ถูกผูกกับ staff membership โดยไม่ได้ตั้งใจ

ดังนั้น Phase 4B ใช้ model แยกเชิงแนวคิดชื่อ `OsmHospitalRelationship` หรือชื่อ
ที่ตรงกับ repository convention โดยมีขั้นต่ำ:

```text
OsmHospitalRelationship
  id
  userId
  hospitalId
  status: MembershipStatus
  createdAt
  updatedAt
```

Invariants:

- `userId` ต้องอ้าง `User` ที่มี `Person` อยู่จริง
- `hospitalId` ต้องอ้าง Hospital จริง; provisioning ต้องใช้ Hospital ที่ `ACTIVE`
- unique `(userId, hospitalId)` เพื่อให้ retry และ concurrent provision ไม่สร้าง relationship ซ้ำ
- index `(hospitalId, status)` สำหรับ scoped read/policy
- relationship `ACTIVE` ใช้ได้เฉพาะเมื่อ account precondition และ Hospital status ผ่าน
- `UserRole(OSM)` และ relationship ที่ operation รับรองต้อง commit ร่วมกัน; ไม่สร้าง active OSM relationship แบบไม่มี role
- ห้ามใช้ row นี้เป็นหลักฐานของ area, assigned patient หรือ clinical access
- ใช้ existing `MembershipStatus` เพื่อลด enum/state ใหม่; `INVITED` ใช้เมื่อมี invitation semantics จริงเท่านั้น
- ไม่เพิ่ม `membershipType`, `profession`, `area`, patient assignment, geographic hierarchy, ownership หรือ provider field

Multi-hospital implications:

- database model ไม่ควร unique `userId` เพียงตัวเดียว เพราะขัดกับ Person/User multi-hospital principle
- แต่ละ Hospital relationship ต้องถูก authorize แยกตาม target Hospital
- Phase 4B ไม่ expose behavior ว่า OSM สามารถใช้งานหลาย Hospital พร้อมกัน
  นอกเหนือจาก direct relationship ที่ policy อนุญาต

การสร้าง model นี้เป็น schema change ที่ต้องผ่าน migration ใน Phase 4B ไม่ใช่การ
แก้ schema ใน Phase 4A โมเดลแยกนี้เป็น accepted decision; implementation ต้อง
คง relation invariant, ActorContext และ policy query ตามข้อ 4 และ ADR-0008

### 8.3 Workforce activation persistence

Phase 4B ต้องมี purpose-specific activation persistence ตามข้อ 6.3 โดยห้ามเพิ่ม
generic token framework ฟิลด์ขั้นต่ำเชิงแนวคิดคือ `userId`, `tokenHash`,
`expiresAt`, `claimedAt`, `usedAt`, `revokedAt`, `createdByUserId` และ
`createdAt` พร้อม invariants ต่อไปนี้:

- token hash ผูกกับ User เดียวและ workforce activation purpose เดียว
- valid token มีได้ตาม lifecycle ที่กำหนด และ regeneration ต้อง revoke record เดิม
- claim/consume เป็น conditional, concurrency-safe และ state ambiguous เป็น deny
- raw token มีเฉพาะ issuance/presentation boundary ไม่อยู่ใน DB, log หรือ audit
- activation record ใหม่สำหรับ existing ACTIVE User ไม่จำเป็นและห้ามสร้างโดย implicit

Exact schema/migration เป็น Phase 4B implementation work; Phase 4A ไม่แก้
`prisma/schema.prisma`

### 8.4 ActorContext boundary

เมื่อมี `OsmHospitalRelationship` แล้ว server-resolved `ActorContext` ต้องรับรู้ minimum relationship/status ของ OSM เช่น `osmHospitalRelationships: readonly ...` เพื่อให้ login/application boundary รู้ association ที่มาจาก DEMI database ไม่ใช่ provider metadata

ActorContext รุ่นนี้ไม่ควรเพิ่ม patient, area หรือ geographic assignment fields ใน Phase 4B การเพิ่มข้อมูลดังกล่าวต้องรอ OSM scope requirement

## 9. Consistency-Critical Operations

### 9.1 Local provisioning transaction

`provisionHospitalMember` และ `provisionOsm` เป็น consistency-critical PostgreSQL operations เดียวต่อคำขอ:

```text
authenticate actor
  ↓
validate input
  ↓
authorize capability + direct target Hospital owner scope
  ↓
Serializable PostgreSQL transaction
  ├─ re-check actor, target Hospital และ existing state
  ├─ resolve/create Person
  ├─ resolve/create User
  ├─ upsert required UserRole
  ├─ create/reuse exactly one target relationship
  ├─ create WorkforceActivation hash for a new non-active User
  └─ record provisioning AuditEvent
  ↓
commit all or rollback all
```

ภายใน transaction เดียวต้องไม่เหลือ state ต่อไปนี้จาก operation ที่รายงานว่าสำเร็จ:

- Person ใหม่ที่ไม่มี User ตามที่ operation รับรอง
- User ใหม่ที่ไม่มี role/relationship ที่ operation รับรอง
- role ถูกสร้างแต่ relationship ของ target ไม่สำเร็จ
- relationship ถูกสร้างแต่ User resolve ไม่ได้
- relationship state เปลี่ยนแต่ audit success เขียนไม่ได้
- activation hash ถูกสร้างแต่ User/relationship provisioning ไม่สำเร็จ

สำหรับ new User, plaintext activation credential ต้องถูกสร้างและส่งผ่าน
issuance/presentation boundary เท่านั้น ส่วน hash และ expiry อยู่ใน transaction
เดียวกับ provisioning หาก transaction rollback credential ที่ยังไม่ถูก persist
ต้องใช้ไม่ได้

ใช้ database uniqueness, conditional update/claim และ PostgreSQL `Serializable` isolation ตามความเหมาะสม พร้อม bounded retry เฉพาะ serialization conflict ที่ retry ได้อย่างปลอดภัย ห้าม retry แบบไม่จำกัดและห้ามแก้ conflict ด้วยการสร้าง identity ใหม่

### 9.2 Activation transaction หลัง credential proof

Activation เป็น operation ที่แยกจาก provisioning และมี boundary ของตัวเอง:

1. target เปิด activation URL/QR หรือเข้าสู่ assisted activation และ server
   resolve token digest กับ `WorkforceActivation`
2. short PostgreSQL transaction claim token แบบ conditional โดยตรวจ User,
   expiry, revocation และ `claimedAt`/`usedAt`; request เดียวเท่านั้นจึงได้สิทธิ์
   ดำเนิน ceremony ต่อ
3. target เป็นผู้ตั้ง password เองผ่าน trusted activation boundary; provider/Auth
   effect ทำผ่าน existing server-only adapter นอก PostgreSQL transaction
4. ตรวจ `User.authSubject` mapping และ expected User/relationship state แล้วใช้
   transaction ใหม่เปลี่ยน `User.PROVISIONED` และ relationship ที่เกี่ยวข้องเป็น
   `ACTIVE`, บันทึก `usedAt`/final activation state และเขียน activation audit
5. ถ้า provider สำเร็จแต่ final PostgreSQL write ล้มเหลว ให้ใช้
   compensation/reconciliation ของ Phase 2.1; ห้ามสร้าง success จาก partial state

หาก provider หรือ local finalization ล้มเหลว ห้ามรายงาน success และห้ามยอมรับ
token เดิมซ้ำ การออก credential ใหม่ต้อง revoke record เดิมก่อน การ provision ที่
จบใน `PROVISIONED` เป็น valid non-authoritative state และต้องไม่เข้า `/app`

### 9.3 Provider consistency

Supabase Auth และ PostgreSQL ไม่มี distributed transaction:

- ไม่เรียก provider จากใน Prisma transaction ที่ต้องรักษา lock นาน
- ไม่สร้าง provider identity ใหม่ถ้า User มี `authSubject` แล้ว
- provider conflict หรือ mapping ที่พิสูจน์ไม่ได้ต้อง fail closed
- หาก operation เป็นเจ้าของ provider identity ใหม่และ local finalization ล้มเหลว ให้ชดเชยเฉพาะเมื่อ expected state/ownership ตรงกัน
- cleanup ที่พิสูจน์ไม่ได้ต้องยกระดับ reconciliation และไม่รายงาน activation success

## 10. Duplicate, Retry และ Concurrency Rules

| สถานการณ์ | ผลลัพธ์ที่กำหนด |
| --- | --- |
| Thai National ID เดิมถูกส่งซ้ำแบบ operation เดิม | resolve Person/User เดิม; ถ้า target relationship และ classification ตรงกันให้ idempotent success/no-op; ห้ามสร้าง identity/audit state ซ้ำ |
| Thai National ID เดิมแต่ profession หรือ relationship kind ต่างกันใน Hospital เดิม | conflict; ห้าม overwrite profession, เปลี่ยน MEMBER/OWNER หรือแทน HOSPITAL ด้วย OSM |
| Owner สองคน provision คนเดียวกันพร้อมกันใน Hospital เดียวกัน | database unique + transaction guard ให้มีผลสำเร็จหนึ่ง logical relationship; loser re-read แล้วคืน idempotent success เมื่อ request เทียบเท่า หรือ conflict เมื่อข้อมูลต่างกัน |
| User เดิมถูกเพิ่ม Hospital เดิมซ้ำ | existing `(userId, hospitalId)` relationship เป็น idempotent; ห้ามสร้าง row ที่สอง |
| User เดิมถูกเพิ่มคนละ Hospital | อนุญาตสำหรับ `HospitalMembership` โดย reuse Person/User และสร้าง row แยก; actor ต้องมี direct owner scope ของแต่ละ Hospital |
| OSM relationship เดิมถูกสร้างซ้ำ | unique `(userId, hospitalId)` และ same-kind request เป็น idempotent; ไม่สร้าง area/patient assignment เพิ่ม |
| `HOSPITAL` role มีอยู่แล้ว | reuse/upsert role; เติมเฉพาะ missing HospitalMembership |
| `OSM` role มีอยู่แล้ว | reuse/upsert role; เติมเฉพาะ missing OSM relationship |
| User มี role เดิมอื่น เช่น PATIENT/OSM/HOSPITAL | คง role เดิมทั้งหมดและเพิ่ม role ที่ขาด; ห้ามสร้าง Person/User ที่สอง |
| retry ของ provisioning ที่มี activation record valid อยู่แล้ว | identity/role/relationship เป็น idempotent no-op และไม่ออก token/revoke token ใหม่โดย implicit; ถ้าต้องการ link ใหม่ต้องใช้ explicit regeneration ที่ revoke record เดิม |
| concurrent activation issuance สำหรับ User เดียวกัน | ต้องมี active activation credential ได้ตาม lifecycle ที่กำหนดเพียงรายการเดียว; loser ไม่สร้าง token เพิ่มและ plaintext เดิมไม่ถูก recover จาก DB |
| activation token ถูก submit ซ้ำหรือมีสอง request consume พร้อมกัน | short conditional claim ให้สำเร็จเพียง request เดียว; request อื่น fail closed และ token เดิมใช้ซ้ำไม่ได้ |
| User หรือ relationship เป็น `SUSPENDED` | fail closed; ห้าม auto-reactivate, downgrade หรือสร้าง active relationship เพื่อหลบ state เดิม |
| provider identity มีอยู่แล้วและ map กับ User เดิม | reuse mapping; ไม่เรียก create provider ซ้ำและไม่ overwrite password |
| provider alias/subject มีอยู่แต่ map ไม่ได้หรือ map ไป User อื่น | conflict/reconciliation; ห้าม attach, delete หรือย้าย provider identity อัตโนมัติ |
| provider creation สำเร็จแต่ local finalization ล้มเหลว | ไม่รายงาน success; ใช้ captured ownership/expected-state compensation ถ้าปลอดภัย มิฉะนั้นคง non-authoritative state และ reconciliation |
| retry หลัง provider failure แบบ error ชัดเจน | resolve identity/current mapping ก่อน; ไม่สร้าง Person/User/provider ใหม่โดยอัตโนมัติ |
| retry หลัง provider result ไม่ชัดเจน | หยุดที่ reconciliation; ห้ามเดาว่า provider ไม่มี identity แล้วสร้างซ้ำ |

ความแตกต่างของชื่อหรือ profile input ไม่ใช่เหตุให้สร้าง Person ใหม่ Current identity resolver ไม่ overwrite ชื่อของ Person เดิมโดย implicit; การแก้ profile ต้องเป็น operation แยกที่มี requirement และ audit ของตัวเอง

## 11. Audit Contract

Audit event names ด้านล่างเป็น Phase 4B semantic contract ตาม convention
ปัจจุบัน (`entity.operation`) และควรรวมเป็น constants/validation กลาง หาก
repository ตั้งชื่อที่ต่างแต่ความหมายเท่ากัน ให้เปลี่ยนชื่อในจุดเดียวโดยไม่เปลี่ยน
invariant

### Required state-change events

| Event | Resource | Actor | เกิดเมื่อ |
| --- | --- | --- | --- |
| `hospital_membership.provisioned` | `HospitalMembership` | trusted Hospital Owner | staff relationship ถูกสร้างหรือเกิด state change ที่รับรองโดย operation |
| `osm_relationship.provisioned` | `OsmHospitalRelationship` | trusted Hospital Owner | OSM relationship ถูกสร้างหรือเกิด state change ที่รับรองโดย operation |
| `workforce_activation.issued` | `WorkforceActivation`/`User` | trusted Hospital Owner | activation credential ถูกสร้างและ hash ถูก commit สำเร็จ |
| `workforce_activation.revoked` | `WorkforceActivation`/`User` | trusted Hospital Owner หรือ server workflow | credential ถูก revoke หรือถูก invalidate ก่อน regeneration |
| `workforce_activation.completed` | `User`/relationship | target/session/system ตาม activation contract | credential ownership proof และ ACTIVE transition สำเร็จ |
| `membership.suspended` | relationship | authorized actor ที่ได้รับอนุมัติ | ไม่อยู่ใน Phase 4B จนกว่าจะมี suspend requirement |

Provisioning และ activation-credential events ต้องถูกเขียนใน transaction เดียวกับ
state changes ที่รับรอง และไม่เขียน event ซ้ำเมื่อ retry เป็น idempotent no-op
`workforce_activation.completed` ต้องไม่เขียนก่อน final active state commit

Metadata ขั้นต่ำควรเป็น bounded และไม่เป็น secret เช่น:

```text
{
  role: "HOSPITAL" | "OSM",
  profession: "DOCTOR" | "NURSE" | "COORDINATOR" | "OTHER" | null,
  status: "PROVISIONED" | "ACTIVE"
}
```

`actorUserId` ต้องเป็น trusted actor ที่ server resolve ได้ และ `resourceId` ต้องชี้ relationship ที่เปลี่ยนจริงเมื่อมี resource id แล้ว ห้ามใส่ raw National ID, `identityKeyHash`, password, provider alias, provider subject, access token, service credential, phone หรือ email ใน metadata

## 12. Phase 4B Implementation Scope

Implementation agent ต้องทำตาม checklist นี้โดยไม่ invent business rule:

### Contract and schema

- [ ] ใช้ accepted decisions ใน ADR-0008 และเอกสารนี้เป็น contract ก่อนเริ่ม implementation
- [ ] ใช้ `Person`, `User`, `UserRole`, `Hospital`, `HospitalMembership` และ `AuditEvent` เดิมสำหรับ staff
- [ ] เพิ่ม migration สำหรับ accepted `OsmHospitalRelationship`; ห้ามเพิ่ม area/patient/geographic fields
- [ ] enforce unique `(userId, hospitalId)` ของ OSM relationship และใช้ foreign keys/indexes ที่สอดคล้องกับ current schema
- [ ] ไม่แก้ generated code, provider schema หรือ auth architecture เพื่อหลบ requirement

### Input and transport

- [ ] สร้าง bounded schemas สำหรับ staff และ OSM แยก operation; ไม่เปิด generic role-selection signup
- [ ] validate strict Thai National ID, names, profession และ identifiers ก่อน identity/provider/database work ตามลำดับ mutation standard
- [ ] Server Action/Route Handler รับ transport input และเรียก Application Service เท่านั้น
- [ ] ห้ามรับ `role`, `membershipType`, `status`, `ACTIVE` flag, provider subject หรือ scope จาก clientเป็น authority
- [ ] target Hospital จาก UI ต้องผ่าน server-side target lookup และ direct owner policy ทุกครั้ง

### Policy and service

- [ ] resolve current actor/session จาก server-side `ActorContext`; fail closed เมื่อ unauthenticated, inactive หรือ scope ambiguous
- [ ] Phase 4B MVP require active Hospital Owner ของ target Hospital; ordinary Hospital member และ Platform Admin ไม่ bypass policy โดย implicit
- [ ] ใช้ `membership:read`, `membership:create`, `osm:provision` เป็น operation vocabulary และรวม policy ไว้จุดเดียว
- [ ] `provisionHospitalMember` กำหนด `HOSPITAL + MEMBER + profession` จาก trusted operation
- [ ] `provisionOsm` กำหนด `OSM + OsmHospitalRelationship` และไม่สร้าง scope อื่น
- [ ] identity resolution เกิดก่อน Person/User creation และทุก identity case reuse core identity
- [ ] ไม่แก้ชื่อ Person เดิมหรือ role/membership เดิมแบบ implicit เมื่อ input ต่างกัน

### Persistence and reliability

- [ ] ครอบ Person/User/role/relationship/provisioning audit ที่จำเป็นด้วย transaction เดียว
- [ ] ใช้ uniqueness/serializable/conditional guards และ bounded retry เพื่อให้ same-target concurrent requests deterministic
- [ ] กำหนด idempotent no-op สำหรับ exact duplicate และ conflict สำหรับ classification/relationship mismatch
- [ ] ไม่ทำ provider I/O ใน local transaction; ถ้าภายหลังมี activation ให้ reuse compensation/reconciliation ของ Phase 2.1
- [ ] สำหรับ new User ให้สร้าง purpose-specific activation hash ใน transaction เดียวกับ provisioning และจบที่ `PROVISIONED` จน target ใช้ one-time credential
- [ ] enforce token entropy อย่างน้อย 256 bits, hash-at-rest, expiry, single-use, revocation/regeneration และ concurrency-safe claim
- [ ] ใช้ expiry `24 hours` สำหรับ copy/QR และ `15 minutes` สำหรับ assisted โดยไม่สร้าง token system แยกกัน
- [ ] ไม่ทำ provider I/O ใน transaction ที่ถือ PostgreSQL lock; activation ใช้ compensation/reconciliation boundary เดิม

### ActorContext and login boundary

- [ ] เพิ่ม OSM relationship ขั้นต่ำใน server-resolved ActorContext โดยไม่เพิ่ม patient/area scope
- [ ] `/login` ยังคง resolve National ID → HMAC Person → User → opaque provider alias และตรวจ `User.authSubject`
- [ ] เฉพาะ `User.ACTIVE` ที่ provider subject map ถูกต้องเท่านั้นจึงเข้า `/app`; role/relationship ที่ `PROVISIONED` เข้าไม่ได้
- [ ] ห้ามใช้ provider metadata, browser state, localStorage หรือ request parameter เป็น DEMI authority

### Tests and acceptance

- [ ] new staff: one Person, one User, HOSPITAL role, MEMBER membership, correct profession, no duplicate
- [ ] existing Person/User: reuse identity; PATIENT/OSM/HOSPITAL roles remain intact
- [ ] multi-hospital staff: same User, separate memberships, direct scope per Hospital
- [ ] new OSM: one OSM role and one minimum Hospital relationship; no scope/patient fields
- [ ] existing user gains OSM: role/relationship added without replacing existing roles
- [ ] exact duplicate, conflicting duplicate, same Hospital duplicate, different Hospital, role already exists
- [ ] concurrent same-target provisioning and serialization retry
- [ ] provider subject already exists, provider conflict, partial provider failure และ reconciliation path ของ activation
- [ ] new activation: one-time claim, expired/revoked/used rejection, concurrent claim, regeneration invalidation และ target-owned password
- [ ] existing ACTIVE user: relationship ACTIVE immediately, no provider call, no new activation token, credentials unchanged
- [ ] no browser-controlled role/membership/profession/status/scope authority
- [ ] audit metadata ไม่มี sensitive values และ audit success rollback เมื่อ business transaction rollback
- [ ] `/login`/ActorContext acceptance ของ ACTIVE staff/OSM หลัง activation สำเร็จ และ provisioned user เข้า `/app` ไม่ได้

## 13. Explicitly Deferred

หัวข้อต่อไปนี้อยู่นอก Phase 4B เว้นแต่มี requirement และ contract แยกต่างหาก:

- Patient provisioning
- Patient account activation
- Patient assignment ให้ OSM
- OSM area/geographic scope
- Screening
- Care Plan / Goal
- Appointments
- Home Visit / Follow-up
- Reports
- LIFF
- ThaID
- native application
- parent/child hospital authority
- Hospital ownership transfer
- generic Admin management
- owner creation/multiple-owner governance
- staff movement/transfer ระหว่าง Hospital
- OSM patient/resource assignment
- Email/SMS/LINE delivery-provider integration for activation URLs
- password recovery หรือ provider-account recovery สำหรับ workforce ที่ยังไม่มี requirement

การที่หัวข้อเหล่านี้ถูก deferred ไม่อนุญาตให้ implementation เพิ่ม field, capability หรือ relationship เพื่อเตรียมไว้ล่วงหน้า

## 14. Open Requirements Remaining

ตารางนี้เก็บเฉพาะคำถามที่ยังเปลี่ยน invariant, policy หรือ scope ของงานในอนาคต
อย่างมีนัยสำคัญ การปิดคำถามเหล่านี้ไม่ใช่เงื่อนไขของ direct Hospital-only
workforce provisioning MVP เว้นแต่ implementation จะขยายไปยัง behavior ดังกล่าว:

| Question | Why it matters | Safe default / ต้องรอหรือไม่ |
| --- | --- | --- |
| OSM หนึ่งคนควร belong/operate ได้หลาย Hospital หรือไม่ | เปลี่ยน uniqueness/policy/workspace semantics แม้ schema จะรองรับหลาย relationship เพื่อ identity reuse | เก็บ direct relationship ได้ แต่ไม่เปิด cross-Hospital workflow semantics จนกว่าจะยืนยัน |
| OSM scope เป็น Hospital, area, assigned patients หรือ combination ใด | เปลี่ยน authorization และ future clinical data model | ห้ามเพิ่ม scope ใน Phase 4B; minimum association ทำได้ แต่ scope-enabled workflow ต้องรอ |
| Hospital Owner สร้าง OWNER เพิ่ม, มีหลาย OWNER หรือ transfer ownership ได้หรือไม่ | เปลี่ยน membership invariant และ governance/audit | Deny/defer ทั้งหมดใน Phase 4B |
| Parent/main Hospital มีสิทธิ์จัดการ child Hospital หรือไม่ | `parentHospitalId` อาจกลายเป็น authorization scope แทน metadata | ไม่มี inherited authority; direct Hospital-only policy ใช้ต่อได้ |
| Staff สามารถย้าย/ผูกหลาย Hospitalผ่าน workforce operation หรือไม่ | เปลี่ยนจาก add relationship เป็น transfer/update และต้องกำหนด audit/status | เพิ่ม relationship ตาม direct target ได้ แต่ไม่มี move/downgrade/transfer operation |
| Required staff/OSM profile fields นอกจาก National ID, given/family name, target Hospital และ profession มีอะไรบ้าง | อาจต้องเพิ่ม Person/profile schema, validation และ PII handling; legacy มี birth date/contact/specialization แต่ current schema ยังไม่มี | ใช้ minimum fields ในข้อ 3.2; เพิ่มฟิลด์เมื่อเป็น acceptance criterion ที่ยืนยันแล้ว |
| Patient activation และ patient identity-proofing จะใช้กลไกใด | Patient มี risk/profile และ trust model แยกจาก workforce | คง ADR-0004 ไว้เป็น open; ห้าม reuse workforce activation โดย implicit |

คำถามเหล่านี้ไม่ควรถูกปิดด้วย legacy behavior หรือ implementation convenience

## 15. Legacy Behavior Review

### 15.1 Business evidence ที่นำมาใช้เป็น requirement evidence

จาก [legacy staff add flow](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/app/admin/staff/add/page.tsx), [legacy staff registration flow](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/app/admin/staff/register/page.tsx), [legacy staff management](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/app/admin/staff/page.tsx) และ [legacy Supabase queries](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/lib/supabase/queries.ts) พบพฤติกรรม/คำศัพท์ที่เป็น evidence ได้:

- domain ใช้คำว่า แพทย์, เจ้าหน้าที่, อสม. และแยก OSM เป็น workforce classification ที่ต้องสังกัด Hospital
- staff/OSM input ที่ legacy เก็บ ได้แก่ Thai National ID, ชื่อ, วันเกิด, โรงพยาบาล, specialization และ contact fields
- มีทั้ง direct staff creation โดยผู้ดูแล และ pending staff registration ที่รอการ approve
- duplicate check ใช้ National ID และมีการหยุดเมื่อพบ staff/pending record เดิม
- OSM มี Hospital association และมี temporary-ID verification behavior ใน legacy
- หลัง approval/direct creation legacy คาดหวังให้ staff ใช้งานได้และ login ด้วย identity ของ staff

หลักฐานเหล่านี้ช่วยยืนยันศัพท์และ candidate acceptance scenarios เท่านั้น ไม่ยืนยันว่า Phase 4B ต้องเก็บทุก field, ใช้ temporary ID, เปิด self-registration หรือใช้ approval flow แบบเดิม

### 15.2 Legacy technical behavior ที่ห้ามคัดลอก

- `users.role` เป็น single role และ `users.hospital_id` เป็น single hospital field; ไม่รองรับ Person/User reuse, multi-role หรือ multi-hospital relationship
- `doctors` ถูกใช้เป็น profile table รวม doctor/helper/OSM และบาง flowสร้าง rows แยกจาก user โดยไม่มี local transaction ที่รับรองทั้งชุด
- browser เรียก Supabase queries โดยตรงและใช้ client-side `checkSession`, role/hospital filtering และ state เป็น authority
- password ถูกเก็บ/ส่งใน field `password_hash` แบบ plaintext และบาง flow derive จากวันเกิดหรือเลขท้าย ID; Admin แสดง password ให้ operator/target เห็น
- emergency/direct registration mark account active ทันที และ pending approval ทำหลาย writes (`users`, `doctors`, `pending_staff`) โดยไม่มี transaction boundary ที่เทียบเท่า Phase 4 contract
- role names `admin`, `doctor`, `helper`, `osm` และ `admin_type = super/hospital` เป็น legacy technical model ไม่ใช่ DEMI top-level role contract
- parent/main/sub hospital hierarchy ถูกใช้เป็น inherited access scope ใน client/query code; current DEMI ยืนยันแล้วว่า `parentHospitalId` เป็น metadata และไม่ grant authority
- direct duplicate handling อาศัย client checks หรือ database error ที่ไม่ให้ deterministic identity reuse ข้าม role/hospital

สิ่งที่เป็น business requirement ต้องผ่าน current `Person/User`, `Role + Capability + Scope`, server-side policy, Prisma transaction และ provider compensation architecture เสมอ

## 16. Validation and Documentation Synchronization

### Validation gate

- Claim สำคัญในเอกสารนี้ผูกกับ current schema, ADR, Phase 3 contract, source/tests หรือ legacy links และถูกทำเครื่องหมายเป็นข้อเสนอ/open เมื่อยังไม่ยืนยัน
- Scope ตรงกับ Phase 4A decision closure; Phase 4A ไม่ได้เพิ่ม UI, Server Action,
  route, migration, token generation code, provider integration หรือ product code
- Handoff แยก accepted activation/OSM model/owner policy ออกจาก remaining OSM
  scope, governance และ profile-field questions
- Contract ยืนยันว่า browser ไม่สามารถกำหนด role, membership, profession, status หรือ scope เป็น authority
- Contract ยืนยันว่า duplicate Person/User ไม่ถูกสร้างจาก multi-role, multi-hospital, retry หรือ concurrent provisioning
- Contract ไม่สร้าง OSM clinical/resource scope และไม่ใช้ legacy password/authorization behavior
- Activation contract ยืนยัน token entropy, hash-at-rest, expiry, single-use,
  revocation/regeneration, concurrency-safe claim, user-owned password และ
  provider compensation boundary
- Markdown links ใช้ relative repository paths หรือ fixed legacy commit links;
  ไฟล์ใหม่ต้องเป็น UTF-8 without BOM

### Documentation synchronization decision

ADR-0008 ถูกสร้างเป็น Accepted cross-module decision และเอกสารต่อไปนี้ต้อง
สะท้อน decision แบบย่อให้สอดคล้องกัน:

- `docs/adr/README.md` เพิ่ม ADR-0008 ใน index
- `README.md` ระบุ Phase 4A closure และ next step เป็น Phase 4B
- `PRODUCT.md`, `docs/CONTEXT.md` และ Architecture Baseline ระบุ staff
  membership, OSM association, provisioning/activation boundary, existing
  ACTIVE reuse และ delivery-channel independence

รายละเอียด implementation, schema/migration และ feature code อยู่ใน [Phase 4B
implementation handoff](./PHASE_4B_WORKFORCE_PROVISIONING.md)
