# Phase 4B — Workforce Provisioning and First-Time Activation MVP

- Status: Implemented MVP vertical slice
- Contract: [Phase 4A Workforce Provisioning](./PHASE_4A_WORKFORCE_PROVISIONING.md)
- Durable decisions: [ADR-0008](../adr/0008-workforce-provisioning-and-activation.md)

เอกสารนี้เป็น implementation handoff ของ Phase 4B ไม่ได้เพิ่ม business rule
เหนือ Phase 4A หรือ ADR-0008 โดยสรุปสิ่งที่ implement แล้ว ขอบเขตที่ตรวจสอบได้
และ reconciliation path ที่ implementation agent/reviewer ต้องใช้เป็น reference

## 1. Implemented Outcome

ผู้ใช้ที่เป็น `HOSPITAL` Owner และมี direct `ACTIVE OWNER` membership ใน Hospital
ที่เป็น `ACTIVE` สามารถเปิด `/app/workforce` เพื่อ:

- เพิ่ม Hospital staff ด้วย Thai National ID, ชื่อ, นามสกุล และ profession
- เพิ่ม OSM ด้วย Thai National ID, ชื่อ, นามสกุล
- เลือกได้เฉพาะ Hospital ที่ server ยืนยันว่าเป็น direct active Owner scope
- เห็นรายการ staff/OSM แบบ bounded และสถานะ activation
- ออก activation link/QR ใหม่ หรือเริ่ม assisted activation สำหรับบัญชีที่ยัง
  `PROVISIONED`

การ provision จะ resolve/reuse `Person` และ `User` ก่อนเสมอ staff ใช้
`HOSPITAL + HospitalMembership(MEMBER)` ส่วน OSM ใช้ `OSM +
OsmHospitalRelationship` แยกกัน บัญชีใหม่เริ่ม `PROVISIONED` และผู้ใช้เป้าหมาย
เป็นผู้ตั้ง password เองผ่าน existing `/login` boundary หลัง activation สำเร็จ

Existing `ACTIVE` User ที่มี UUID `authSubject` mapping ถูกต้องจะ reuse credential
เดิม เพิ่มเฉพาะ role/relationship ที่ขาด และ relationship ใหม่เป็น `ACTIVE` โดยไม่
สร้าง activation record หรือเรียก provider ซ้ำ

## 2. Authority and Scope

ทุก mutation และ read ที่รับ Hospital จาก browser ตรวจซ้ำฝั่ง server โดย policy
ต้องผ่านเงื่อนไขครบ:

```text
Role.HOSPITAL
+ direct HospitalMembership(targetHospital)
    membershipType = OWNER
    status = ACTIVE
+ target Hospital.status = ACTIVE
```

ordinary Hospital member, Platform `ADMIN`, parent/child Hospital relation และ
browser-selected Hospital ที่ไม่ผ่าน direct lookup ถูกปฏิเสธ fail closed

Capability vocabulary ของ module มีเฉพาะ:

```text
membership:read
membership:create
osm:provision
```

Profession เป็น classification เท่านั้น ไม่มี policy แยกตาม Doctor/Nurse และ
browser ไม่ได้กำหนด role, membership type, status, authSubject หรือ scope

## 3. Persistence Changes

### `OsmHospitalRelationship`

เพิ่ม model และ migration ที่มี:

```text
id
userId
hospitalId
status: MembershipStatus
createdAt
updatedAt
```

Database invariants:

- `unique(userId, hospitalId)`
- index `(hospitalId, status)` และ `(userId, status)`
- foreign key ไป `User` และ `Hospital` พร้อม `ON DELETE CASCADE`
- OSM-only operation ไม่สร้าง `HospitalMembership`

Row นี้หมายถึง OSM ↔ Hospital association เท่านั้น ไม่มี area, district,
subdistrict, village, assigned patient, patient ownership, care-team หรือ
clinical/resource scope

### `WorkforceActivation`

เพิ่ม purpose-specific model สำหรับ workforce activation เท่านั้น:

```text
id
userId
tokenHash
mode: REMOTE | ASSISTED
expiresAt
claimedAt
usedAt
revokedAt
createdByUserId
createdAt
updatedAt
```

Database invariants:

- `tokenHash` unique และเก็บ SHA-256 digest เท่านั้น
- partial unique index ทำให้ User หนึ่งคนมี activation ที่ยังไม่ consumed และ
  ไม่ revoked ได้ไม่เกินหนึ่งรายการ
- foreign key target User เป็น `CASCADE`; creator เป็น `RESTRICT`
- activation record ไม่เก็บ raw National ID, `identityKeyHash`, password,
  provider alias, provider subject, access token หรือ service credential

Token ใช้ CSPRNG 32 bytes (อย่างน้อย 256 bits) และส่ง plaintext กลับได้เฉพาะ
หลัง local provisioning transaction commit สำเร็จเท่านั้น

Migration/schema files:

- `prisma/schema.prisma`
- `prisma/migrations/20260814100000_workforce_provisioning/migration.sql`

## 4. Workforce Domain and Transport

Module ใหม่อยู่ที่ `src/modules/workforce/`:

- `schemas/` — strict input schemas สำหรับ staff, OSM, list, regeneration และ
  activation completion
- `policies/` — Phase 4-specific owner/capability policy; ไม่ใช่ generic RBAC
- `services/workforce-service.ts` — provisioning, scoped read, regeneration,
  revocation, activation claim/completion และ provider compensation orchestration
- `services/activation-token-service.ts` — entropy, hashing และ expiry defaults
- `transport/` — Server Actions เป็น transport adapters และคืน bounded action state

Application Services รับ `ActorContext` ที่ server resolve แล้วและมี DB guard ซ้ำ
ใน serializable transaction จึงไม่ถือ action input หรือ UI state เป็น authority

Implemented operations:

```text
provisionHospitalMember()
provisionOsm()
listWorkforceOwnerHospitals()
listWorkforce()
regenerateWorkforceActivation()
revokeWorkforceActivation()
completeWorkforceActivation()
```

## 5. Hospital Staff Flow

```text
ACTIVE direct Hospital Owner
        ↓
validate + authorize target Hospital
        ↓
resolve Person by existing Thai National ID HMAC namespace
        ↓
reuse/create User
        ↓
upsert UserRole.HOSPITAL
        ↓
create/reuse HospitalMembership(MEMBER, profession)
        ↓
new User: PROVISIONED + initial REMOTE activation (24 hours)
existing ACTIVE User: relationship ACTIVE, no activation/provider call
```

Exact duplicate เป็น idempotent success/no-op และไม่ rotate activation token
อัตโนมัติ Profession ที่ต่างจาก membership เดิม, suspended/invited state และ
การ downgrade `OWNER` เป็น `MEMBER` เป็น conflict

## 6. OSM Flow

```text
ACTIVE direct Hospital Owner
        ↓
validate + authorize osm:provision
        ↓
resolve/reuse Person/User
        ↓
upsert UserRole.OSM
        ↓
create/reuse OsmHospitalRelationship
        ↓
new User: PROVISIONED + activation
existing ACTIVE User: relationship ACTIVE, no activation/provider call
```

OSM ไม่ได้รับ profession และไม่สร้าง HospitalMembership จาก OSM operation
Identity เดิมและ role อื่นของ User ยังคงอยู่ การมีหลาย relationship ใน schema
รองรับ identity reuse แต่ Phase 4B ไม่มี cross-Hospital OSM workflow หรือ clinical
scope semantics

## 7. Activation Lifecycle

### Issuance and presentation

Initial provisioning ของ non-active User สร้าง activation record ใน transaction
เดียวกับ Person/User/role/relationship/audit และคืน plaintext token หนึ่งครั้ง
หลัง commit:

```text
REMOTE copy link / QR: 24 hours
ASSISTED handoff: 15 minutes (explicit regeneration)
```

URL ใช้ fragment:

```text
/activate/workforce#<activation-token>
```

หน้า activation อ่าน fragment ครั้งเดียว ลบออกจาก visible URL/history ทันที และ
เก็บ token เฉพาะ ephemeral component memory ไม่ใช้ `localStorage` หรือ
`sessionStorage` และไม่ส่ง token เป็น normal server request URL

QR เป็นการ encode URL เดียวกันด้วย maintained `qrcode` dependency ไม่ใช่
credential format ใหม่ และไม่มี National ID/password/provider data อยู่ใน QR

### Target-owned password

Target user กรอก password และ confirmation ด้วยตนเองบน `/activate/workforce`
โดยใช้ password schema เดิมของ auth module ฝั่ง server Hospital staff ไม่สร้าง,
รู้, เห็น, ส่งต่อ หรือ derive password

Activation claim เป็น short conditional serializable operation ที่ตรวจ expiry,
revocation, used/claimed state, User lifecycle และ provisioned workforce
relationship ก่อน claim สำเร็จ จากนั้นเรียก `provisionPasswordAuthIdentity()`
นอก PostgreSQL transaction แล้วจึง finalise local activation ใน transaction ใหม่

เมื่อ finalization สำเร็จ User และ workforce relationships ที่ยัง
`PROVISIONED` และอยู่กับ Hospital ที่ยัง `ACTIVE` ของ User เป้าหมายจะเป็น
`ACTIVE`, activation จะมี `usedAt` และ audit completion จะถูกเขียนใน transaction
เดียวกัน บัญชีที่ `PROVISIONED` ยังเข้า `/app` ไม่ได้

### Assisted handoff

การเริ่ม assisted activation จะ explicit regenerate เป็น 15 นาที แล้วเรียก
server-side `signOutCurrentSession()` ก่อนส่งผลลัพธ์กลับ browser เดิม ถ้า sign-out
ล้มเหลว ระบบพยายาม revoke credential ใหม่และไม่คืน token ให้ owner

เมื่อ sign-out สำเร็จ browser เดิม redirect ด้วย fragment ไป public activation
page เพื่อ handoff ให้ target user ตั้ง passwordเอง หลังสำเร็จ clear temporary UI
state และ redirect ไป `/login` โดยไม่ auto-login target และไม่คง Owner session ไว้

## 8. Provider Consistency and Reconciliation

Supabase Auth/provider กับ PostgreSQL ไม่ใช่ distributed transaction:

- ไม่เรียก provider ขณะถือ long PostgreSQL transaction lock
- provider creation ใช้ existing trusted password-auth provisioning boundary
- provider failure ทำให้ local User/relationship ยังคง non-authoritative
- ordinary provider failure ปล่อย claim เพื่อ retry ได้อย่างปลอดภัย
- ถ้า provider สำเร็จแต่ local finalization ล้มเหลว ระบบ detach `authSubject` แบบ
  guarded แล้วพยายามลบ provider identity ที่เพิ่งสร้าง
- ถ้า ownership/state ไม่พิสูจน์ได้ หรือ compensation ล้มเหลว จะคืน
  reconciliation-required failure และไม่สร้าง provider identity ซ้ำ
- local User ที่ยัง `PROVISIONED` หรือมี partial/ambiguous provider state ถูก deny
  application access ตาม existing boundary; ต้องใช้ trusted reconciliation ก่อน

Activation credential ที่ใช้แล้วหรืออยู่ใน reconciliation state ไม่ถูกปลดล็อกโดย
การ retry แบบเงียบ ๆ Owner ต้อง regenerate อย่าง explicit เมื่อจำเป็น

## 9. Audit Contract

ใช้ repository audit boundary และเขียน event ใน local transaction ที่รับรอง state:

```text
hospital_membership.provisioned
osm_relationship.provisioned
workforce_activation.issued
workforce_activation.revoked
workforce_activation.completed
```

Idempotent no-op ไม่สร้าง success event ซ้ำ Metadata ถูกจำกัดเป็น role,
profession/status และ source ที่ bounded เท่านั้น ไม่เก็บ National ID, HMAC,
password, activation token/digest, authSubject, provider alias, phone, email หรือ
access/service credential

## 10. Routes and UI

Implemented routes:

- `/app/workforce` — owner-scoped workforce workspace, Hospital selector, staff/OSM
  forms, bounded lists, copy link, QR, regeneration และ assisted handoff
- `/activate/workforce` — public first-time activation page; ใช้คำว่า
  “เปิดใช้งานครั้งแรก” ไม่ใช่สมัครสมาชิก
- existing `/login` — unchanged authentication boundary after activation

`/app` แสดง workforce navigation เฉพาะเมื่อ ActorContext มี active Owner scope
ที่ active Hospital แต่ destination ตรวจ authorization ซ้ำเองเสมอ

UI ไม่ให้กรอกหรือเลือก `role`, `membershipType`, `status`, `OWNER`, `ACTIVE`,
`authSubject` หรือ OSM scope

## 11. Tests and Verification

เพิ่ม focused tests สำหรับ policy, token properties, ActorContext OSM relationship,
PostgreSQL workforce invariants, identity reuse, active-account reuse, OSM
separation, regeneration, provider failure, duplicate provisioning และ concurrent
activation claim ใน:

- `src/modules/workforce/policies/workforce-policy.test.ts`
- `src/modules/workforce/services/activation-token-service.test.ts`
- `src/modules/auth/services/actor-context-service.test.ts`
- `tests/integration/workforce.integration.test.ts`

Validation commands ที่ผ่านใน working environment:

```text
npx prisma generate
npx prisma validate
npm ci --dry-run --ignore-scripts --no-audit --no-fund
npx tsc --noEmit
npm run lint
npm test
```

`npm run test:integration:local` ถูกเรียกแล้วแต่ environment นี้ไม่มี Docker
Engine ใน WSL (`Docker Engine is unavailable in WSL distribution Ubuntu`) จึงยัง
ไม่สามารถ execute PostgreSQL integration suite จริงได้ การทดสอบ integration จะ
ต้องรันใน Docker-enabled environment และ apply migration ด้วย
`npm run test:integration`

## 12. Explicitly Deferred

ยังไม่ implement และไม่เพิ่ม schema/permission เพื่อเตรียมล่วงหน้า:

- Patient provisioning หรือ Patient activation (ADR-0004 ยังคง open)
- Patient/OSM assignment, patient ownership และ OSM geographic/clinical scope
- Screening, Care Plan, Goal, Appointment, Home Visit, Follow-up และ Reports
- staff edit, suspend, restore, delete, transfer หรือ ownership transfer
- multiple-owner governance และ parent/child inherited authority
- generic RBAC/ACL, password recovery และ provider-account recovery dashboard
- email, SMS, LINE/LIFF delivery integrations, ThaID และ native application

Open profile fields นอกเหนือจาก Thai National ID, given/family name, target
Hospital และ staff profession ก็ยังต้องมี requirement ยืนยันก่อนเพิ่ม

## 13. Reviewer Security Checklist

- raw National ID และ identity HMAC ไม่ถูก persist/log/คืน client
- password ไม่ถูก persist/log และไม่ถูก Hospital staff เป็นผู้กำหนด
- activation plaintext ไม่ถูก persist/log และไม่อยู่ใน normal request URL
- token ไม่มีใน `localStorage`/`sessionStorage` และ regeneration revoke credential เดิม
- browser ไม่เป็น authority สำหรับ role/status/membership/scope
- OSM ไม่ใช้ HospitalMembership และไม่มี clinical/area fields
- provisioned user เข้า `/app` ไม่ได้
- existing ACTIVE user ไม่ re-activate และไม่เรียก provider ซ้ำ
- assisted handoff ล้าง Owner auth session ก่อน handoff
- provider I/O อยู่นอก long local transaction และ failure ไม่สร้าง ACTIVE จาก
  uncertain state
