# ADR-0008: Workforce Provisioning and First-Time Activation

> **Current decision — 2026-10-21:** [ADR-0019](0019-owner-administration-and-import-only-roster.md) supersedes MEMBER/OSM Hospital administration, ADR-0008 2026-10-14 D1 OSM provisioning/read, delegated MEMBER report export and manual patient registration. ACTIVE direct OWNER administers the exact ACTIVE Hospital and imports strict Excel v2 (including one row). MEMBER/OSM retain resource-scoped care; personal self-service and separately authorized Platform ADMIN recovery remain. Earlier decisions below are historical where inconsistent.

- Status: Accepted (amended 2026-10-14)
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

## Amendment 2026-10-14: Workforce onboarding v2

ส่วนนี้แก้ไขและ supersede ข้อความเดิมของ ADR-0008 เฉพาะประเด็นที่ระบุด้านล่าง ข้อความเดิมด้านบนคงไว้เพื่อ
ประวัติการตัดสินใจ ส่วนที่ไม่ถูกกล่าวถึงที่นี่ยังมีผลตามเดิม (Person/User resolution และ reuse, multi-role,
multi-Hospital, opaque one-time token แบบ hash-only, concurrency-safe claim, provider I/O นอก lock พร้อม
compensation, Serializable retry, login ด้วยเลขบัตรประชาชนและรหัสผ่านที่ผู้ใช้เป็นเจ้าของ)

### D1: ACTIVE MEMBER เพิ่ม OSM ได้ (supersedes "Trusted workforce authority" เฉพาะ `osm:provision`)

ข้อความเดิมที่ว่า provisioning workforce เป็น OWNER เท่านั้นถูก supersede **เฉพาะ capability `osm:provision`**
รวมถึงการออกและ regenerate activation ของ OSM และการอ่านรายชื่อ/รายละเอียด OSM (`osm:read`) actor ที่ได้สิทธิ์ต้อง
เป็น `Role = HOSPITAL` ที่มี `HospitalMembership` โดยตรงแบบ `OWNER` หรือ `MEMBER`, `status = ACTIVE` ใน
Hospital ที่ `ACTIVE` เหตุผลที่อนุญาตของ MEMBER คือ `active_hospital_member_osm_access`

ทุก capability อื่นยังเป็น OWNER เท่านั้น: provision บุคลากร, suspend/restore/แก้วิชาชีพ, revoke activation
(`activation:revoke`), reset รหัสผ่าน, การจัดการ OWNER และการมอบหมายผู้ป่วย MEMBER เห็นรายการ OSM,
สถานะรอเปิดใช้งาน และหน้ารายละเอียด OSM แบบอ่านอย่างเดียว แต่ไม่เห็นรายชื่อบุคลากร UI ซ่อนปุ่มเพื่อความชัดเจน
เท่านั้น server re-check สิทธิ์จาก database ทุกครั้ง

การ revoke ที่เป็น compensation ของ assisted handoff (ผู้ออก token ปิด session ไม่สำเร็จ) ใช้ operation ภายใน
ที่ยกเลิกได้เฉพาะ credential ที่ actor คนเดียวกันเพิ่งออกและยังไม่ถูกใช้ จึงไม่เปิดสิทธิ์ revoke ทั่วไปให้ MEMBER

### D2: อายุลิงก์ REMOTE เป็น 72 ชั่วโมง (supersedes "24 hours")

copy link/QR/ใบเปิดใช้งานที่พิมพ์มี expiry 72 ชั่วโมง เพราะการส่งต่อจริงมักเปิดในวันถัดไป assisted ยังคง 15 นาที
ไม่มี token framework เพิ่ม

### Identity check ตอน activation และ reset

การถือ token อย่างเดียวไม่เพียงพออีกต่อไป (extends "Security Properties"):

- หน้า activation แสดงชื่อที่ถูก mask (เช่น `สม*** ใจ***`) ที่ server resolve จาก token ไม่แสดงชื่อเต็มหรือเลขบัตร
- ผู้ใช้ต้องกรอกเลขบัตรประชาชนเต็ม server ตรวจกับ Person ของ token ด้วย identity hashing เดิมและเทียบแบบ
  constant-time ไม่ตรงให้ error เดียวกับ token ใช้ไม่ได้ จึงไม่เปิดเผยว่าเลขบัตรมีอยู่ที่อื่นหรือไม่
- นับครั้งที่ผิดใน `WorkforceActivation.failedVerificationCount` ครบ 5 ครั้งให้ตั้ง `revokedAt` และ audit
  ผู้ใช้ต้องขอ token ใหม่ การนับอยู่ระดับ token ไม่เพิ่ม rate-limit infrastructure
- ผลที่ยอมรับ: ผู้ที่ได้ลิงก์ไปสุ่มเลขบัตรสามารถทำให้ token ของเจ้าตัวถูกยกเลิกได้ ผู้ดูแลออกลิงก์ใหม่เพื่อแก้

### D3: Workforce password reset แบบ assisted (ต่อหน้าเท่านั้น)

เพิ่ม `purpose` (`ACTIVATION` | `RESET`) ใน `WorkforceActivation` token ใช้ข้าม purpose ไม่ได้ทั้งสองทิศ
ไม่นับเป็นครั้งที่ผิด และไม่ consume token อีกฝั่ง

- ออกได้เฉพาะกับ User `ACTIVE` ที่มี `authSubject` และมี relationship `ACTIVE` ใน Hospital เป้าหมาย
  ประเภทเป้าหมายถูกอนุมานจาก database ไม่รับจาก client
- OWNER reset MEMBER staff และ OSM ของ Hospital เดียวกันได้; OWNER reset OWNER ไม่ได้; Platform `ADMIN`
  reset OWNER ของ Hospital ใดก็ได้ (ไม่ reset ประเภทอื่น); ไม่มีใคร reset บัญชีตัวเอง; MEMBER reset ไม่ได้
- mode เป็น ASSISTED เท่านั้น 15 นาที การออกใหม่ revoke token เดิมของ User เสมอ
- ผู้ใช้ทำตาม identity check เดียวกัน แล้ว server เรียก `replacePasswordAndRevokeRecoverySessions` เพื่อเปลี่ยน
  รหัสผ่านและยกเลิก session เดิมทั้งหมด provider I/O อยู่นอก lock ถ้า provider หรือ local finalization ล้มเหลว
  ไม่รายงานสำเร็จและคืน claim ให้ใช้ token เดิมได้ (การเปลี่ยนรหัสผ่านเป็น idempotent จึงไม่ต้องมี compensation
  แบบลบ identity) ถ้าคืน claim ไม่ได้ให้เข้า reconciliation
- audit: `workforce_password_reset.issued | completed | revoked | verification_failed` ระบุ actor/target
  ไม่มี secret
- ผลที่ยอมรับ: ความปลอดภัยพึ่งพาการยืนยันตัวบุคคลต่อหน้าของ OWNER/ADMIN เช่นเดียวกับ assisted activation
  ไม่มี self-service "forgot password" และไม่มี OTP

### การส่งมอบ activation

- ใบเปิดใช้งานแบบพิมพ์: server ออก REMOTE token ใหม่ (revoke ของเดิม) สูงสุด 50 คนต่อครั้ง และตอบเป็นหน้า HTML
  ที่ `Cache-Control: no-store` ซึ่ง plaintext token อยู่ใน QR ของตอบกลับนั้นเท่านั้น ไม่ persist ไม่ log
  ไม่ใส่ audit
- เพิ่มหลายคน: สูงสุด 50 แถวต่อครั้ง หนึ่งประเภทต่อครั้ง แต่ละแถวใช้ logic provisioning เดิมใน Serializable
  transaction ของตัวเอง เลขบัตรซ้ำภายในรายการเดียวกันถูกปฏิเสธก่อนเขียน ไม่คืน plaintext token

### Persistence / migration

`20261014100000_workforce_activation_purpose` เพิ่ม enum `WorkforceActivationPurpose`, คอลัมน์ `purpose`
(default `ACTIVATION`) และ `failedVerificationCount` (default 0, `CHECK >= 0`) แถวเดิมจึงเป็น activation ที่ยังไม่
มีความพยายามที่ผิด ไม่มีการเปลี่ยน schema อื่น และ partial unique index "หนึ่ง token ที่ใช้ได้ต่อ User" ครอบคลุมทั้ง
สอง purpose

## References

- [ADR-0001: Person and User Identity](./0001-person-and-user-identity.md)
- [ADR-0002: Role, Capability and Scope Authorization](./0002-role-capability-scope-authorization.md)
- [ADR-0004: Patient Provisioning and First-Time Activation](./0004-patient-provisioning-and-activation.md)
- [ADR-0005: Server-Side Application Boundary](./0005-server-side-application-boundary.md)
- [ADR-0006: Transactional Business Operations](./0006-transactional-business-operations.md)
- [Phase 4A Workforce Provisioning Contract](../phases/PHASE_4A_WORKFORCE_PROVISIONING.md)

## Remediation amendment — review `e61cd8638ca6be450cdc017fd2405475f059fc74`

This amendment supersedes D3, the recovery interpretation of the national-ID check, and the
unconditional claim-release/provider-retry statement above. Historical decisions remain visible.
D1 (MEMBER OSM provisioning/read) and D2 (72-hour remote activation) remain accepted.

### Global credential ownership

Hospital authority can establish a provisioning relationship or justify a recovery **request**;
it does not prove ownership of the global User credential. Supervising an in-person ceremony is
separate from approving credential replacement. OWNER and ADMIN have no independent ownership
proof merely by holding their roles, knowing National ID, or possessing an issuer-visible token.
A checkbox, birth date, masked name, or successful issuer sign-out cannot supply that proof.

**Implemented security restriction:** workforce RESET issuance, preview, and completion are
unavailable for all targets, including ordinary single-Hospital users. The replacement sink and
its retry/finalization implementation were removed. Old RESET tokens never reach the provider.
ADMIN cannot override this restriction. Normal authenticated password change still verifies the
current password against the authenticated provider subject. Activation establishes a first
credential only; it cannot replace a credential of an ACTIVE or mapped account.

PATIENT + workforce/ADMIN accounts cannot use Patient assisted recovery as an alternate entry
point. Workforce grants also reject an in-progress Patient recovery or ambiguous legacy RESET.
Patient-only assisted recovery is also server-gated: the same issuer-visible token and staff
attestation cannot authorize global credential replacement. This restriction supersedes the
Phase 17E.1 assisted-recovery trust rule, preserving its historical record. See
[ADR-0012](./0012-global-credential-recovery-proof.md).

**Pending product-owner/security decision:** approve an independent account-owner proof and
operational recovery process that works for users without universal email, phone, smartphone,
OTP, or external identity. No such fallback was invented. Future global recovery must bind exact
User, Hospital, relationship ID/type, purpose, issuer/current authority, issue/expiry times and
credential/recovery version; revalidate all facts before replacing the credential and use a
per-User durable concurrency/reconciliation protocol. This future reset workflow is NOT
VERIFIED_COMPLETE and is not enabled by the activation operation states below.

### Initial activation scope and provider consistency

New ACTIVATION records bind `hospitalId`, `relationshipId`, `relationshipKind`, target User,
creator, purpose and expiry. Claim and finalization both require the original relationship to
remain eligible and the original issuer to retain current direct authority. A pending staff
relationship requires OWNER authority even when the selected activation is OSM. An ADMIN role
or OWNER relationship anywhere disqualifies first-time workforce activation.

Pending relationships in another Hospital make first-time activation unavailable. The former
all-Hospital `updateMany` could silently expand one issuer's activation ceremony; the approved
cross-Hospital trust semantics are unresolved. Within one Hospital, eligible pending workforce
relationships retain the existing shared-account activation semantics, subject to OWNER
approval when staff is involved. ACTIVE accounts still reuse one Person/User/credential across
roles and Hospitals. Accounts are never split to work around recovery.

The operation is represented durably by `NOT_STARTED → CLAIMED → PROVIDER_STARTED →
PROVIDER_CONFIRMED → FINALIZED`, or `RECONCILIATION_REQUIRED`. Provider I/O stays outside database
locks. `PROVIDER_STARTED` means an effect may have happened; it is never automatically replayed
after an ambiguous outcome. A definitive provider rejection permits release. Local failure may
compensate only the newly created initial identity, with expected PROVISIONED User/subject
checks; release follows only confirmed compensation. A lost DB response is checked against a
committed finalization before any compensation. Existing Auth identities are never deleted as
password-reset compensation. Plaintext passwords and tokens are never durable operation data.

### Migration, quarantine and reconciliation

Forward migrations `20261015100000` through `20261015140000` retain original token hashes and
consumed history, revoke every outstanding legacy unbound credential, preserve ambiguous
claims, and add context/state checks. Unclaimed ACTIVATION tokens require reissuance. Claimed
legacy tokens require reconciliation; the migrations never assume provider rollback.

An unused claimed RESET or unfinished claimed AccountRecovery quarantines global application access at the auth-owned actor and
exact-session database boundaries, even if the token is revoked/expired and User is ACTIVE.
Token revocation alone cannot undo a password that may already have changed. Reconciliation
must not clear a claim simply to permit login. See the [remediation handoff and operator
runbook](../phases/WORKFORCE_ONBOARDING_V2_REMEDIATION.md). No production provider or data
operations were performed during implementation.

### Directory and bulk receipts

Directory pages use `(createdAt, id)` keyset ordering, bounded per-kind queries, server-side
name/status filters and context-checked cursors. MEMBER queries/projected metadata remain
OSM-only. Activation queries select only current-page Users and ACTIVATION credentials.

Each bulk submission has an actor-scoped, time-qualified random key and a domain-separated
HMAC of Hospital/kind/normalized rows/visible row mapping, using the existing server identity
secret. A row receipt commits with successful domain writes and audits. Replays retain
`created` results; changed payloads conflict. Unavailable rows resume with at most three
attempts; terminal invalid/conflict rows stay stable. Receipts contain no names, National IDs,
identity hashes, passwords or bearer tokens. Keys expire after 30 days and cannot be reused
by changing their embedded time (that creates a different key); bounded opportunistic pruning
removes expired metadata. No queue, worker, Redis or generic job framework is introduced.

### Session semantics

Supabase global sign-out revokes refresh sessions; existing access JWTs may remain valid until
expiry. DEMI does not claim immediate provider JWT invalidation. Issuer handoff closes its local
session and clears the authentication cookies before exposing an assisted activation link;
this is not target identity proof, nor a guarantee that a shared browser's entire history is
sanitized. Operators must use a clean target browser/profile/device rather than exposing the
issuer's prior application history. See [Supabase sign-out](https://supabase.com/docs/guides/auth/signout)
and [session semantics](https://supabase.com/docs/guides/auth/sessions).


## Amendment — identity ownership and single-Hospital pending scope (review `ff33a38`)

Historical decisions above are preserved; these rules are additive.

1. **Credential ownership is global, role assignment is not proof.** The first password belongs to
   the User. A workforce issuer knows the national ID and holds the activation capability, so it
   must never establish the first credential of a User that already owns the Patient domain
   (`PATIENT` role or `PatientProfile`) and is not yet `ACTIVE` with a provider mapping. Such
   provisioning, regeneration, preview, claim, provider start and finalization fail closed with a
   Thai conflict error. The Patient activates their own account first (ADR-0004); workforce
   authority is then added to the `ACTIVE` User without a new credential.
2. **ACTIVE reuse is unchanged.** An `ACTIVE`, correctly mapped User (any mix of PATIENT/OSM/HOSPITAL)
   keeps its identity and may gain relationships in any number of authorized Hospitals.
3. **A PROVISIONED User holds pending workforce state in one Hospital only.** Same-Hospital MEMBER +
   OSM remains one activation. A request that would add pending state in a different Hospital
   (including an unresolved activation row for another/unknown Hospital) is rejected before
   commit, preserving the first Hospital's token. This replaces a latent state in which
   provisioning succeeded but activation could never complete. It is a restriction until the
   cross-Hospital first-activation trust semantics are approved; it is not a one-Hospital-per-User rule.
4. **Stranded legacy rows are not auto-repaired.** See the operator procedure in the
   [remediation handoff](../phases/WORKFORCE_ONBOARDING_V2_REMEDIATION.md).

Status: SECURITY_GATED pending product/security owners (independent ownership proof for activating
workforce authority on an unactivated Patient; cross-Hospital first-activation semantics). Neither
is VERIFIED_COMPLETE.


## Amendment — Patient ownership resolved from the Person; bidirectional gate (review `6a68463`)

The Patient-ownership rule above is evaluated for **every** `PROVISIONED` User, including one created
in the same transaction, from the canonical Person (`PATIENT` role or `PatientProfile`); a Person with a
`PatientProfile` and no User is therefore rejected before anything is committed. The reverse direction
is enforced by Patient provisioning and Patient activation (ADR-0004 amendment): they refuse a
`PROVISIONED` User with pending workforce authority, so neither flow can invalidate or capture the other's
first credential. See the [remediation handoff](../phases/WORKFORCE_ONBOARDING_V2_REMEDIATION.md) for the
state table, evidence and open decisions.

## Cross-reference — ADR-0020 self-registration exception (2026-10-22)

[ADR-0020](0020-self-registration-by-national-id.md) adds one Product Owner risk-accepted public first-credential path for eligible pre-provisioned MEMBER, OSM and Patient relationships. It is implemented through purpose-bound activation capabilities and rechecks the existing ownership/quarantine gates at completion. This exception does not change invite or assisted activation, does not authorize general national-ID ownership proof, and does not change credential recovery.
