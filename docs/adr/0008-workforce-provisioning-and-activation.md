# ADR-0008: Workforce Provisioning and First-Time Activation

- Status: Accepted
- Date: 2026-08-14

## Context

DEMI workforce provisioning เป็น trusted Hospital operation ที่สร้างหรือเชื่อม
identity และ business relationship ให้บุคลากรหรือ OSM แต่การมี record ใน DEMI
ไม่ใช่หลักฐานว่า target user เป็นเจ้าของ interactive credential แล้ว

การแยกสองเรื่องนี้จำเป็นเพราะ:

- `Person` และ `User` ต้องถูก resolve/reuse ก่อนสร้าง identity ใหม่ เพื่อรองรับ
  multi-role และ multi-Hospital โดยไม่สร้างบัญชีซ้ำ
- Hospital personnel มี semantics เป็น `HOSPITAL` role กับ
  `HospitalMembership` ซึ่งมี `membershipType` และ `profession`
- OSM มีเพียง `OSM` role ในปัจจุบัน การใช้ `HospitalMembership` ร่วมกับ staff
  จะทำให้ `profession`/`membershipType` มีความหมายปะปนและปิดทางให้กำหนด
  OSM scope อย่างปลอดภัยในภายหลัง
- กลุ่มผู้ใช้เป้าหมายอาจไม่มี email, phone หรือ smartphone ที่ใช้รับ OTP ได้
  จึงห้ามผูก core activation กับ delivery channel ใด channel หนึ่ง
- Phase 2.1 มี provider provisioning primitive แบบ server-only แต่ Supabase
  Auth และ PostgreSQL ไม่มี distributed transaction ร่วมกัน

## Decision

### Trusted workforce authority

Phase 4B workforce provisioning อนุญาตเฉพาะ actor ที่มีเงื่อนไขครบทั้งหมด:

```text
Role = HOSPITAL
HospitalMembership.membershipType = OWNER
HospitalMembership.status = ACTIVE
direct membership in target Hospital
target Hospital.status = ACTIVE
```

Ordinary `HOSPITAL` members และ Platform `ADMIN` ที่มี global role เพียงอย่าง
เดียวไม่สามารถ provision workforce ใน routine Phase 4B ได้ `parentHospitalId`
ไม่สืบทอด authority ไปยัง parent หรือ child Hospital และ target Hospital จาก
browser เป็น input ที่ต้อง re-authorize ฝั่ง server ทุกครั้ง

### Workforce relationships

- Hospital personnel ใช้ `UserRole = HOSPITAL` และ
  `HospitalMembership(membershipType = MEMBER)` โดย `profession` เป็น
  `DOCTOR`, `NURSE`, `COORDINATOR` หรือ `OTHER` เท่านั้น
- Profession เป็น classification ไม่ใช่ top-level role หรือ authorization
  authority ด้วยตัวเอง
- OSM ใช้ `UserRole = OSM` และ model แยกชื่อเชิงแนวคิดว่า
  `OsmHospitalRelationship` โดยมี `id`, `userId`, `hospitalId`, `status`,
  `createdAt` และ `updatedAt`
- `OsmHospitalRelationship` บังคับ `unique(userId, hospitalId)` และใช้
  lifecycle enum ที่มีอยู่แล้วเมื่อเหมาะสม
- OSM relationship ยืนยันเฉพาะ `OSM ↔ Hospital association` เท่านั้น ไม่ใช่
  geographic area, village/subdistrict/district, assigned patients, patient
  ownership, care-team assignment หรือ clinical resource access
- `Role.OSM` หรือ active OSM relationship เพียงอย่างเดียวไม่ grant access ต่อ
  patient หรือ clinical resource
- schema อาจเก็บ relationship หลาย Hospital ต่อ User เพื่อรักษา identity reuse
  แต่ Phase 4B ไม่เปิด cross-Hospital OSM workflow semantics นอกเหนือจาก
  relationship ที่ actor มีสิทธิ์โดยตรง

### Identity and lifecycle

- ทุก operation ต้อง resolve `Person` ก่อนสร้าง Person ใหม่ และ reuse `User`
  เดิมเมื่อมีอยู่
- New workforce user ได้ Person/User/required role/relationship ในสถานะ
  `PROVISIONED`; ยังเข้า `/app` ไม่ได้
- ถ้า existing `User` เป็น `ACTIVE`, `authSubject` map ถูกต้อง และ credential
  ownership ถูก establish แล้ว การเพิ่ม role/relationship ที่ trusted operation
  รับรองไม่ต้อง activate credential ซ้ำ relationship ใหม่เปลี่ยนเป็น `ACTIVE`
  ได้ทันทีเมื่อ invariant ของ relationship และ Hospital ผ่าน
- Existing `PROVISIONED`, `INVITED`, `SUSPENDED` User หรือ provider mapping ที่
  คลุมเครือห้ามถูก activate โดย implicit และต้อง fail closed หรือเข้า
  reconciliation ตาม architecture เดิม
- Existing role และ relationship เดิมต้องถูกคงไว้ การ provision เพิ่มเฉพาะ
  role/relationship ที่ขาดและไม่เรียก provider ซ้ำ

### First-time activation capability

ผู้ใช้ใหม่ activate ผ่าน **opaque one-time activation credential** เท่านั้น:

```text
Provisioned Person/User/role/relationship
        ↓
one-time activation credential
        ↓
target user establishes their own password
        ↓
existing server-only password-auth provisioning boundary
        ↓
local activation finalization
        ↓
User and relevant relationship ACTIVE
```

Activation URL, QR code และ assisted in-person flow เป็น presentation/delivery
ของ capability เดียวกัน ไม่ใช่ authentication mechanisms คนละชุด

การส่งแบบ copy link/QR มี default expiry `24 hours` ส่วน assisted in-person
activation มี default expiry `15 minutes` โดยใช้ activation model เดียวกันและ
กำหนด `expiresAt` ตาม mode ที่เริ่ม ceremony ไม่สร้าง token framework หลายชุด
โดยไม่จำเป็น

Assisted activation เป็น trust model ที่ Hospital ยืนยันตัวบุคคลจริงต่อหน้า
จากนั้น target user เป็นผู้กรอกรหัสผ่านเองบน dedicated activation mode อุปกรณ์
อาจเป็นของ Hospital ได้ แต่ staff ห้ามพิมพ์หรือเห็น password เป็น normal flow
เมื่อสำเร็จต้อง clear temporary activation state/session และส่ง target กลับไปยัง
existing login boundary โดยไม่คง password ไว้บนอุปกรณ์ Hospital และ assisted
flow ไม่ใช่หลักฐานจากการครอบครอง email/SMS

Email, SMS และ LINE/LIFF ไม่ใช่ dependency ของ core activation แต่อาจเป็น
future delivery channels ของ URL ได้ ส่วน external identity provider และ ThaID
ไม่ใช่ core activation dependency หรือข้อกำหนดของ Phase 4B และต้องมี decision
แยกหากนำมาใช้ในอนาคต

### Provider and consistency boundary

หลัง target พิสูจน์ possession ของ activation capability และตั้ง password เอง
แล้ว ให้ reuse existing trusted password-auth provisioning boundary โดยไม่ expose
primitive ให้ browser หรือ Hospital staff

Provider I/O อยู่นอก PostgreSQL transaction ที่ถือ lock นาน PostgreSQL และ
Supabase Auth ต้องใช้ compensation/reconciliation ตาม ownership และ expected
state เดิม หาก provider สำเร็จแต่ local finalization ล้มเหลว ห้ามรายงาน success
หรือสร้าง provider identity ซ้ำเพื่อกลบความไม่แน่นอน

## Security Properties

Activation credential ต้องเป็น temporary bearer capability ที่มีคุณสมบัติขั้นต่ำ:

- ใช้ cryptographically secure random token ที่มี entropy อย่างน้อย 256 bits
- plaintext token อยู่เฉพาะช่วง issuance/presentation ที่จำเป็น และไม่เก็บลง DB
- DB เก็บ deterministic secure hash/digest เท่านั้น
- bind กับ User เป้าหมายและ purpose ของ workforce activation โดยเฉพาะ
- single-use, revocable และมี expiry
- regeneration ต้อง revoke activation credential เดิมก่อนใช้ credential ใหม่
- consumption ต้อง concurrency-safe; used/revoked/expired หรือ state ที่ ambiguous
  ต้อง fail closed
- activation record ห้ามเก็บ raw National ID, `identityKeyHash`, password,
  provider alias, provider subject, access token หรือ service credential
- audit ระบุ actor, User/relationship และ state change ได้ แต่ไม่เก็บ secret

Conceptual persistence ไม่ใช่ generic token framework และอาจใช้ model purpose-
specific เช่น:

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

Exact schema, migration และ implementation เป็น Phase 4B work ที่ต้องคง
invariants เหล่านี้

## Consequences

### Positive

- Trusted Hospital context ยังคงเป็น authority สำหรับ role และ relationship
- Target user เป็นเจ้าของ password เอง โดยไม่บังคับ email, SMS หรือ smartphone
- QR, copy link และ assisted flow รองรับผู้ใช้ที่มีข้อจำกัดด้านเทคโนโลยีโดยไม่
  แยก authentication architecture
- Existing ACTIVE user reuse ได้ทันทีโดยไม่ reset credential หรือสร้าง provider
  identity ใหม่
- OSM association มี boundary แยกจาก Hospital personnel และไม่บังคับ scope ที่
  ยังไม่รู้
- Token security และ provider/local consistency มี invariant ที่ตรวจสอบได้

### Trade-offs and risks

- ผู้ที่ถือ activation link ได้มี bearer capability จึงต้องจำกัด expiry,
  revocation, regeneration และ abuse protection
- Assisted activation พึ่งพาความถูกต้องของ Hospital ในการยืนยันตัวบุคคลจริง
  ไม่ใช่ remote identity proof
- ผู้ใช้ที่ไม่ activate จะค้างอยู่ใน `PROVISIONED` และไม่สามารถเข้า `/app` ได้
- Provider compensation/reconciliation ยังจำเป็นเพราะไม่มี distributed
  transaction
- OSM cross-Hospital usage และ clinical scope ยังไม่สามารถสรุปจาก relationship
  นี้ได้

## Deferred

ADR นี้ไม่ตัดสิน:

- Patient activation mechanism หรือการเปลี่ยนความหมายของ ADR-0004
- OSM geographic scope, assigned-patient scope หรือ clinical/resource scope
- Patient assignment ให้ OSM
- parent/child Hospital authority
- staff transfer/movement ระหว่าง Hospital
- การสร้าง OWNER เพิ่ม, multiple-owner governance หรือ ownership transfer
- generic RBAC/ACL framework
- LIFF, ThaID, native application และ SMS/email provider integration

## References

- [ADR-0001: Person and User Identity](./0001-person-and-user-identity.md)
- [ADR-0002: Role, Capability and Scope Authorization](./0002-role-capability-scope-authorization.md)
- [ADR-0004: Patient Provisioning and First-Time Activation](./0004-patient-provisioning-and-activation.md)
- [ADR-0005: Server-Side Application Boundary](./0005-server-side-application-boundary.md)
- [ADR-0006: Transactional Business Operations](./0006-transactional-business-operations.md)
- [Phase 4A Workforce Provisioning Contract](../phases/PHASE_4A_WORKFORCE_PROVISIONING.md)
