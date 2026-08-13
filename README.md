# DEMI Rewrite

DEMI is being rewritten on the architecture documented in [`docs/CONTEXT.md`](docs/CONTEXT.md), the [architecture baseline](docs/architecture/DEMI_ARCHITECTURE_BASELINE.md), and the [ADR index](docs/adr/README.md).

โปรเจกต์ปิด **Phase 3A: Hospital Onboarding Requirement Closure and Architecture Contract** แล้ว โดยยังไม่ implement Hospital Onboarding feature หรือ migration ของ Phase 3B ระบบที่ทำงานอยู่ยังเป็น Phase 2.1 ซึ่งให้ผู้ใช้ที่ได้รับการ provision และมีสถานะ `ACTIVE` เข้าสู่ระบบด้วยเลขบัตรประชาชนไทยและรหัสผ่านของตนเองได้

## Phase 3A Hospital onboarding contract

[Phase 3A implementation contract](docs/phases/PHASE_3A_HOSPITAL_ONBOARDING.md) กำหนด vertical slice สำหรับ Phase 3B ดังนี้:

```text
/hospital/onboarding
  → canonical Hospital Master match by hospitalCode
  → identity resolution / Person + User reuse
  → HospitalOnboardingApplication PENDING
  → manual Platform ADMIN approve or reject
  → APPROVED: Hospital ACTIVE + HOSPITAL role + ACTIVE OWNER membership
  → existing National ID/password login and /app boundary
```

- ไม่มี generic public signup หรือหน้าที่ให้ผู้สมัครเลือก role
- Hospital Owner เป็น hospital-scoped `HOSPITAL + OWNER` และไม่ใช่ Platform `ADMIN`
- application history แยกจาก Hospital lifecycle ด้วย `PENDING → APPROVED | REJECTED`
- Phase 3B ต้อง reuse HMAC identity resolution, opaque Supabase alias, `User.authSubject` และ trusted password-auth provisioning ของ Phase 2.1
- approval/rejection เป็น consistency-critical Application Service operation; PostgreSQL writes และ audit ที่รับรองผลต้อง atomic
- authoritative external Hospital Master provider และ exact real-world verification evidence ยัง unresolved; controlled development/test master data ใช้ผ่าน replaceable boundary ได้
- Phase 3A ไม่แก้ `prisma/schema.prisma`; phase contract ระบุ schema gaps และ Phase 3B acceptance checklist ไว้แล้ว

## Development setup

1. Copy `.env.example` to `.env` (or export the same variables in the shell) and provide a development PostgreSQL/Supabase connection and Supabase Auth public configuration. Set `DEMI_DATABASE_TARGET` to the non-production database target. Generate a server-only `IDENTITY_HASH_SECRET` with at least 32 characters. Set `SUPABASE_SERVICE_ROLE_KEY` only in the trusted server environment that invokes provider-account provisioning; it must never be exposed to the browser. Never use production credentials for local development.
2. Apply the migration and generate Prisma Client:

```bash
npm run prisma:migrate:deploy
npm run prisma:generate
```

Use `npm run prisma:migrate:dev -- --name <migration_name>` only when creating a new migration after a confirmed schema change.

The Prisma migration scripts run a safety preflight before invoking Prisma. Development migration commands refuse `DEMI_DATABASE_TARGET=production`; production deployment requires an explicit production target and `NODE_ENV=production`.

3. Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser. `/` จะส่งผู้ใช้ที่มี ACTIVE DEMI actor ไป `/app` และส่งผู้ใช้อื่นไป `/login`

The server-only health check is available at `/api/health`. It returns only `ok` or `unavailable` and never exposes credentials or stack traces.

## Verification commands

```bash
npm run lint
npm run typecheck
npm test
```

For database integration tests, the repository includes a disposable PostgreSQL container bound only to `127.0.0.1:55432`. Its committed local-only configuration is in `.env.integration`; never put Supabase or production credentials in that file.

Run the complete clean-database verification and automatic cleanup with one command:

```powershell
npm run test:integration:local
```

To keep the database open and run each step manually:

```powershell
npm run test:db:reset
npm run test:db:status
npm run prisma:migrate:test
npm run test:integration
npm run test:db:down
```

The container uses temporary storage, fixed test-only credentials, and a localhost-only published port. `npm run test:db:reset` recreates an empty database; `npm run test:db:down` removes the Compose resources. The command wrapper uses Docker from the current shell when available. On Windows it falls back to Docker in the WSL distribution configured by `DEMI_DOCKER_WSL_DISTRO` (default `Ubuntu`) and keeps that distribution alive until `test:db:down` so the container does not stop unexpectedly.

To use another dedicated local PostgreSQL test database instead, export the same safety variables before running:

```bash
export DEMI_DATABASE_TARGET=test
export DEMI_TEST_DATABASE_URL=postgresql://test-user:test-password@localhost:5432/demi_test
export DATABASE_URL=$DEMI_TEST_DATABASE_URL
export DIRECT_URL=$DEMI_TEST_DATABASE_URL
npm run prisma:migrate:test
npm run test:integration
```

On Windows PowerShell, use `$env:...` assignments instead. Integration commands refuse to run unless `DEMI_DATABASE_TARGET=test`, both `DATABASE_URL` and `DIRECT_URL` equal `DEMI_TEST_DATABASE_URL`, and the target is explicitly non-production.

The application boundary is `Client → Server Action/HTTP API → Application Service → Policy → Prisma → PostgreSQL/Supabase`. No speculative `/api/v1` endpoints, LIFF SDK, native app, or clinical business modules are implemented in this phase.

## Phase 2.1 National ID login and application access

Phase 2.1 implements the following web flow:

```text
/login
  ↓ Thai National ID validation
server-side HMAC identity resolution
  ↓ Person → User → opaque provider login alias
Supabase password authentication
validated provider identity
  ↓ User.authSubject
ACTIVE DEMI User + ActorContext
  ↓
/app
  ↓ logout
/login
```

- Login ใช้ Server Action รับเลขบัตรประชาชนไทยและ user-owned password โดย validate เลข 13 หลักและ checksum ฝั่ง server พร้อมจำกัดความยาว input
- เลขบัตรประชาชนใช้เพื่อ identity resolution เท่านั้น: server คำนวณ HMAC ด้วย namespace `thai-national-id` แล้วค้น `Person.identityKeyHash`; ไม่เพิ่มหรือ query plaintext National ID
- Supabase รับ opaque internal alias ที่ derive จาก stable `User.id` เช่น `<user-uuid>@auth.demi.internal`; alias เป็น authentication adapter detail ไม่ใช่อีเมลจริง contact method หรือ authorization source
- หลัง `signInWithPassword()` สำเร็จ ระบบเรียก provider `getUser()` เพื่อยืนยันตัวตนอีกครั้งก่อน resolve `ActorContext`
- provider subject ต้องตรงกับ `User.authSubject` ที่ resolve จาก National ID และยังต้อง map กลับเป็น DEMI User เดิม มิฉะนั้นระบบ fail closed และจบ current session
- เฉพาะ provider subject ที่ map กับ `User.status = ACTIVE` เท่านั้นที่เข้า `/app` ได้
- `PROVISIONED`, `INVITED`, `SUSPENDED` และ unmapped provider user ถูกปฏิเสธโดยไม่มี automatic Person/User/role provisioning
- `/app` ตรวจสิทธิ์ฝั่ง server; browser state, Supabase metadata, role หรือ hospital ID จาก client ไม่ถูกใช้เป็น authority
- Logout ใช้ Supabase Auth server client ด้วย `scope: "local"` เพื่อจบเฉพาะ current session; auth mutations ใช้ writable cookie context ส่วน read-only Server Components ยังคงมี defensive cookie handling
- invalid/expired session แยกจาก provider, configuration และ database infrastructure failure อย่างชัดเจน
- UI ภาษาไทยเป็น responsive shared shell สำหรับทุก ACTIVE actor และแสดง role จาก server-resolved `ActorContext`
- National ID ไม่ใช่ credential secret แต่ห้าม log, ส่งกลับใน error หรือเปิดเผย identity HMAC/provider alias ต่อ browser; password ยังคงเป็น secret ที่ผู้ใช้เป็นเจ้าของและ Supabase จัดการ
- Supabase metadata ไม่ใช่ authority; `User`, roles และ memberships ฝั่ง DEMI ยังคงเป็น source of truth
- Trusted password-auth provisioning ใช้ dedicated server-only Supabase Admin client สร้าง provider user ด้วย opaque alias และ `email_confirm: true` ก่อน persist provider user ID ลง `User.authSubject`
- Provisioning primitive รับเฉพาะ existing DEMI `User` และ user-owned password จาก trusted higher-level workflow; ไม่สร้าง Person, assign role/membership หรือเปลี่ยน `User.status`
- `User.authSubject` ที่มีอยู่แล้วและ provider alias conflict จะ fail closed โดยไม่สร้าง/attach identity เพิ่ม; ownership ที่พิสูจน์ไม่ได้ต้องเข้าสู่ trusted recovery
- หาก provider creation สำเร็จแต่การ persist `authSubject` ล้มเหลว ระบบจะ hard-delete provider user ที่เพิ่งสร้างเป็น compensation และไม่รายงาน success; cleanup failure คืน infrastructure/reconciliation error
- Repository ยังไม่มี shared distributed login rate limiter; Phase 2.1 ใช้ bounded schema validation และ Supabase Auth safeguards ปัจจุบัน โดยต้องเพิ่ม deployment-level rate limiting ก่อนขยาย public exposure ตาม traffic/risk จริง

Phase 2.1 ไม่ได้เพิ่ม Hospital onboarding, staff/OSM invitation, patient activation/provisioning UI, password recovery, LIFF, ThaID, native authentication, role capability matrix หรือ operational business workflows Higher-level trusted workflow ที่ตัดสิน lifecycle และรับ user-owned password ยังคงต้อง implement ภายหลัง; primitive นี้ไม่ใช่ public signup และไม่มี public account-creation endpoint

### Trusted provider provisioning smoke test

ใช้เฉพาะ Supabase development project และ DEMI User สำหรับทดสอบ ห้ามใช้ production identity/credential และ repository ไม่มี debug route หรือ public provisioning action

1. สร้าง/resolve development `Person` และ `User` ที่ยังไม่มี `authSubject` ผ่าน trusted test setup
2. เรียก `provisionPasswordAuthIdentity()` จาก trusted server-side test harness ด้วย password ที่ผู้ทดสอบเป็นเจ้าของ
3. ตรวจว่า Supabase Auth user ใช้ `<User.id>@auth.demi.internal` และ confirmed โดยไม่ต้องรับอีเมล
4. ตรวจว่า `User.authSubject` เท่ากับ Supabase user ID และ `User.status` ไม่ถูกเปลี่ยน
5. จัดสถานะ test User เป็น `ACTIVE` ผ่าน setup ที่มีสิทธิ์ แล้วทดสอบ National-ID login, refresh `/app` และ local-session logout ตาม checklist ด้านล่าง

### Manual authentication smoke test

ใช้เฉพาะ Supabase development account ที่มี opaque internal alias, map กับ `User.authSubject`, เชื่อมกับ Person ผ่าน HMAC ของ National ID และมีสถานะ `ACTIVE`; ห้ามใช้ production credentials

1. เปิด `/login`
2. กรอกเลขบัตรประชาชนไทยที่ provision แล้วและรหัสผ่านที่ถูกต้อง
3. ยืนยันว่า redirect ไป `/app`
4. Refresh `/app`
5. ยืนยันว่า session ยังคงอยู่
6. Logout แล้วตรวจว่า `/app` เข้าไม่ได้
7. Login ด้วยเลขบัตรเดิมและรหัสผ่านผิด แล้วตรวจว่าแสดงข้อความ credentials แบบ generic
8. Login ด้วยเลขบัตรที่ checksum ถูกต้องแต่ไม่มีในระบบ แล้วตรวจว่าได้ข้อความ generic เดียวกัน
9. ตรวจใน browser ว่าไม่พบ internal alias, `identityKeyHash` หรือ raw provider error

สำหรับ local-session logout ให้เปิด browser/device ที่สองด้วยบัญชีเดียวกันก่อน logout session แรก แล้วตรวจว่า session ที่สองยังใช้งานได้

## Implementation structure

```text
app/api/health/route.ts                 server infrastructure transport
app/login/                              Thai National ID/password login UI
app/app/                                protected authenticated application shell
proxy.ts                                Supabase SSR session refresh boundary
prisma/schema.prisma                    stable persistence model
prisma/migrations/                      reproducible PostgreSQL migrations
scripts/prisma-preflight.mjs            Prisma CLI database-target safety guard
src/lib/env/                            server environment validation
src/lib/auth/                           Supabase Auth server adapter
src/lib/db/                             Prisma server singleton
src/modules/identity/                   identity resolution service
src/modules/auth/                       authentication service, ActorContext and policy kernel
src/modules/audit/                      bounded audit input/persistence service
src/shared/errors/                      predictable application errors
tests/integration/                      focused PostgreSQL/Prisma constraint tests
```

## Learn more

- [Next.js Documentation](https://nextjs.org/docs)
- [Next.js Learn](https://nextjs.org/learn)
- [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying)
