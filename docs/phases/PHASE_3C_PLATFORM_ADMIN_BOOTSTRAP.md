# Phase 3C — Platform Admin Bootstrap

- Status: Implemented trusted bootstrap contract
- Scope: สร้าง Platform `ADMIN` คนแรกใน fresh DEMI environment เท่านั้น
- Authentication: shared password login with Thai National ID for normal users or a trusted custom Admin identifier

เอกสารนี้กำหนด operational bootstrap สำหรับกรณีที่ database ใหม่ยังไม่มี Platform Admin ซึ่งทำให้ Hospital onboarding application ไม่สามารถถูก review/approve ได้ โดยไม่ขยายเป็นระบบจัดการ Admin ทั่วไป

## 1. Trusted entry point

รันจาก developer/server environment ที่ตรวจสอบ credentials แล้ว:

```bash
npm run admin:bootstrap
```

CLI เป็น interactive ภาษาไทยและถาม:

```text
เลขบัตรประชาชน หรือรหัส Admin:
ชื่อ:
นามสกุล:
รหัสผ่าน:
ยืนยันรหัสผ่าน:
```

Admin identifier และ password ไม่ควรอยู่ใน shell history, process argv, logs หรือ exception message; password ถูกอ่านแบบไม่ echo เมื่อ terminal รองรับ คำสั่งไม่รองรับข้อมูล identity/password ผ่าน command-line arguments และไม่มี browser route, public signup, anonymous Server Action หรือ HTTP API สำหรับ operation นี้

Environment target ไม่ได้เลือกด้วย flag หรือ application selector ใหม่ `DATABASE_URL`, `DIRECT_URL`, `NEXT_PUBLIC_SUPABASE_URL` และ server-only Supabase credential ของ process เป็นตัวกำหนด target ปัจจุบัน ผู้ปฏิบัติงานต้องตรวจว่าเป็น development/staging/production environment ที่ตั้งใจไว้ก่อนรัน

## 2. Input and identity rules

Application Service validate ด้วย schema ฝั่ง server:

- Admin identifier ใช้ bounded login identifier schema เดียวกับ `/login` (trim, non-empty, maximum 32 characters) จึงตั้งค่าได้เองโดยไม่ต้องผ่าน category/checksum ของ `thaiNationalIdSchema`; Hospital onboarding และ role อื่นยังใช้ `thaiNationalIdSchema` เดิม
- ทั้ง Admin identifier และ Thai National ID ใช้ HMAC ผ่าน `hashIdentityReference()` ด้วย namespace `thai-national-id`
- given name และ family name ต้อง bounded ตาม Person name convention
- user-owned password ใช้ password schema เดียวกับ Hospital onboarding และไม่ persist ใน DEMI
- ห้าม persist raw identity value; `Person.identityKeyHash` เป็น opaque lookup key เดียว

ก่อนสร้าง identity ต้องตรวจ `UserRole` ว่ามี `Role.ADMIN` หรือไม่โดยไม่กรอง `User.status` หากพบแม้เพียงหนึ่งรายการให้ `ConflictError` deterministic และไม่สร้าง Person/User/provider identity ใหม่

ถ้า Admin identifier map ไปยัง Person/User เดิม ให้ fail closed ด้วย conflict เช่นกัน ห้าม overwrite password, `authSubject`, status, role หรือ membership และห้าม attach `ADMIN` ให้ existing Hospital applicant/Owner

## 3. Successful state

Application Service เป็นผู้ถือ business logic ส่วน CLI เป็น transport adapter เท่านั้น:

```text
validate input
    ↓
verify no ADMIN
    ↓
create Person + User(PROVISIONED)
    ↓
provisionPasswordAuthIdentity(userId, user-owned password)
    ↓
verify User.authSubject mapping and PROVISIONED state
    ↓
Serializable PostgreSQL transaction
    ├─ re-check no ADMIN
    ├─ guard target User/person/authSubject/status
    ├─ User.PROVISIONED → ACTIVE
    ├─ create UserRole.ADMIN
    └─ record platform_admin.bootstrapped audit
```

Successful state ต้องมีเพียง:

- Person ใหม่หนึ่งรายการ
- User ใหม่หนึ่งรายการที่ `ACTIVE` และมี `authSubject`
- `UserRole.ADMIN` หนึ่งรายการ
- AuditEvent ที่ `actorUserId = null`, `resourceType = User`, metadata bounded เป็น `{ role: "ADMIN", source: "trusted_cli" }`

ต้องไม่มี `HOSPITAL` role, `OSM` role, `PATIENT` role, HospitalMembership หรือ OWNER membership

Admin login ต่อผ่าน `/login` ด้วย Admin identifier ที่ตั้งตอน bootstrap + password และใช้ `User.authSubject` mapping/`ACTIVE` state เดิม ไม่มี authentication method ใหม่; ผู้ใช้ Hospital ยังคง login ด้วย Thai National ID + password

## 4. Cross-system failure handling

Supabase Auth และ PostgreSQL ไม่มี transaction ร่วมกัน:

- provider provisioning ล้มเหลวก่อนยืนยัน provider identity: ลบ Person/User ใหม่ใน expected `PROVISIONED`/unmapped state เมื่อพิสูจน์ได้ และไม่สร้าง role หรือ success audit
- provider primitive รายงาน reconciliation-required: คง state ที่ไม่เป็น authority ไว้เพื่อ reconciliation และไม่รายงาน success
- provider identity ถูกสร้างและ mapping ยืนยันแล้ว แต่ final PostgreSQL transaction ล้มเหลว: พยายามลบ provider identity ที่ operation นี้สร้าง แล้วลบเฉพาะ Person/User ที่ตรงกับ captured IDs, identity hash, auth subject, status และไม่มี role/membership/audit/application
- หาก provider/local cleanup พิสูจน์ไม่ได้ ให้ `PlatformAdminBootstrapReconciliationError` ที่มี reconciliation flag และไม่รายงาน success
- unexpected User state ก่อน finalization ถูกปฏิเสธแบบ fail closed; service ไม่ repair status/role ให้เอง

## 5. Concurrency and audit

การตรวจ initial `ADMIN` เป็นเพียง early rejection เพื่อ UX เท่านั้น final authority transaction ใช้ PostgreSQL `Serializable` isolation และ re-check `UserRole.ADMIN` ก่อน activate/create role หาก bootstrap อื่นชนะ concurrent operation ที่แพ้ต้องไม่สร้าง ADMIN และต้องเข้าสู่ compensation/reconciliation ตาม expected-state guard

Audit success event:

```text
action:       platform_admin.bootstrapped
resourceType: User
resourceId:   new User.id
actorUserId:  null
metadata:     { role: "ADMIN", source: "trusted_cli" }
```

ห้ามใส่ Admin identifier/National ID, identity hash, password, provider alias/subject, token หรือ service credential ใน metadata

## 6. Acceptance path

1. Apply migrations และ seed Hospital Master ใน environment ที่ตั้งใจ
2. รัน `npm run admin:bootstrap` แล้วกรอกข้อมูล Platform Admin ภาษาไทย
3. เปิด `/login` และ login ด้วย Admin identifier ที่ตั้งไว้ + password ของ Admin
4. ยืนยันว่า Admin เข้า `/app/admin/hospital-onboarding` ได้
5. เปิด browser/session anonymous อีกชุด แล้ว submit ที่ `/hospital/onboarding`
6. กลับมา login เป็น Admin และ approve application
7. ยืนยัน applicant เป็น `User.ACTIVE`, `Role.HOSPITAL`, `HospitalMembership.OWNER/ACTIVE` และไม่เป็น `ADMIN`
8. Login applicant ผ่าน `/login` ด้วย National ID + password เดิม และตรวจว่าเข้า application boundary ได้

## 7. Explicitly deferred

ไม่รวม additional Admin management, invitation, removal, recovery, password reset, generic signup, staff/OSM/patient provisioning, Hospital Owner workspace/transfer/multiple owners, OTP, ThaID, LIFF, rate-limiting changes หรือ Phase 4 workflows
