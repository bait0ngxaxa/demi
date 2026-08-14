# DEMI Rewrite

DEMI is being rewritten on the architecture documented in [`docs/CONTEXT.md`](docs/CONTEXT.md), the [architecture baseline](docs/architecture/DEMI_ARCHITECTURE_BASELINE.md), and the [ADR index](docs/adr/README.md).

โปรเจกต์ปิด **Phase 3B: Hospital Onboarding & Governance — MVP Vertical Slice** แล้ว โดยต่อยอดจาก contract ของ Phase 3A และยังคงใช้ authentication foundation ของ Phase 2.1 ระบบมี public hospital onboarding, manual Platform `ADMIN` review และการอนุมัติแบบ transactional ครบตาม MVP ส่วน **Phase 4A: Workforce Provisioning Requirement Closure and Architecture Synchronization** ปิด decision contract แล้ว และงานถัดไปคือ Phase 4B implementation

## Phase 4A Workforce provisioning and activation contract

[Phase 4A decision contract](docs/phases/PHASE_4A_WORKFORCE_PROVISIONING.md) และ [ADR-0008](docs/adr/0008-workforce-provisioning-and-activation.md) กำหนด next vertical slice:

- เฉพาะ active Hospital Owner ที่มี direct membership ใน target Hospital จึง provision workforce ได้; ordinary Hospital member, Platform `ADMIN` และ parent/child hierarchy ไม่ bypass policy
- Hospital staff ใช้ `HOSPITAL + HospitalMembership(MEMBER) + Profession`; OSM ใช้ `OSM + OsmHospitalRelationship` แยก โดยไม่สร้าง patient/area/clinical scope
- Person/User และ role เดิมต้องถูก reuse; existing `ACTIVE` user ที่ provider mapping ถูกต้องเพิ่ม relationship ได้ทันทีโดยไม่ activate credential หรือเรียก provider ซ้ำ
- New workforce user เริ่ม `PROVISIONED` และ activate ด้วย opaque one-time activation URL; QR และ assisted in-person เป็น presentation ของ capability เดียวกัน ผู้ใช้ตั้ง password ของตนเอง
- Copy link/QR ใช้ expiry 24 ชั่วโมง และ assisted activation ใช้ 15 นาที; email, SMS, LINE/LIFF, ThaID และ external identity ไม่ใช่ core activation dependency

Phase 4B จะ implement workforce provisioning + activation MVP ตาม contract นี้ โดย Phase 4A ยังไม่มี feature code, token generation code, Prisma schema หรือ migration ใหม่

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
- authoritative external Hospital Master provider/update process และ exact real-world verification evidence ยัง unresolved; approved v2 seed data ใช้ผ่าน replaceable boundary ได้
- Hospital Master เริ่มต้นมาจาก `demi_hospital_master_v2.xlsx` ที่ normalize แล้วเป็น approved seed dataset 78 records; `HH` ถูก exclude และ `KANG`/`KHON` เป็น canonical codes ตาม decision ที่ยืนยันแล้ว
- Phase 3B เพิ่ม `Hospital.hospitalCode`, parent reference แบบ metadata เท่านั้น และ `HospitalOnboardingApplication` lifecycle `PENDING → APPROVED | REJECTED` พร้อม migration และ idempotent seed script
- Public submit ทำให้ applicant เป็น `User.PROVISIONED` และ application เป็น `PENDING`; approve จึงเปลี่ยน Hospital/User เป็น `ACTIVE`, ให้ `HOSPITAL` + `OWNER` และเขียน audit ใน PostgreSQL transaction เดียว

## Phase 3B implementation

- Public route: `/hospital/onboarding` — เลือก Hospital Master จากรายการที่ควบคุม, Thai National ID, ชื่อ และ user-owned password โดยไม่มี role/status input
- Platform review: `/app/admin/hospital-onboarding` และรายละเอียด application — ใช้ existing session/ActorContext และ server-side `ADMIN` capability checks
- Application Service อยู่ใน `src/modules/hospital-onboarding/`; Server Actions เป็น transport adapter เท่านั้น และใช้ Phase 2.1 HMAC identity resolution กับ trusted password provisioning
- `npm run db:seed` เป็น production-safe entrypoint ที่ import `prisma/seed/hospital-master-v2.json` ไปยัง database ตาม `DATABASE_URL` และ `DIRECT_URL` ด้วย stable `hospitalCode` upsert; ไม่ลบ record อื่นและไม่ reset `ACTIVE` status
- ก่อนเปิด public traffic ต้องมี shared/deployment-level rate limiting และ production owner/process สำหรับ master data กับ verification evidence; ยังไม่มีการเพิ่ม Redis หรือ provider integration ใน slice นี้

## Phase 3C Platform Admin bootstrap

Fresh DEMI environment ที่ยังไม่มี Platform `ADMIN` ต้องสร้างผู้ดูแลระบบคนแรกผ่าน trusted server/developer environment เท่านั้น:

```bash
npm run admin:bootstrap
```

คำสั่งนี้เป็น interactive CLI ภาษาไทย รับ Thai National ID/ตัวระบุ Admin ที่ตั้งเอง, ชื่อ และ user-owned password โดยไม่รับข้อมูลตัวตนหรือ password ผ่าน command-line arguments และไม่ echo password บน terminal เมื่อ terminal รองรับ โครงการไม่มี public “Create Admin”, admin signup page, anonymous Server Action หรือ HTTP endpoint สำหรับ bootstrap

- bootstrap จะหยุดด้วย conflict ทันทีเมื่อมี `UserRole.ADMIN` อยู่แล้ว ไม่ว่าสถานะ User จะเป็น `ACTIVE`, `SUSPENDED`, `PROVISIONED` หรือ `INVITED`
- Admin ใช้ตัวระบุในช่องเดียวกับ National ID ได้อย่างอิสระภายใน bounded login schema โดยไม่ตรวจ category/checksum; Hospital onboarding และ role อื่นยังตรวจ Thai National ID แบบ strict เดิม
- ทั้ง Admin identifier และ Thai National ID ใช้ HMAC namespace `thai-national-id` เดิม; ไม่ persist raw identifier
- provider password identity ใช้ `provisionPasswordAuthIdentity()` และ opaque `User.id`-derived alias เดิม; operator จะไม่เห็น alias หรือ secret
- final authority grant ใช้ PostgreSQL `Serializable` transaction ตรวจ guard ซ้ำ แล้วจึงสร้าง `UserRole.ADMIN`, เปลี่ยน User เป็น `ACTIVE` และเขียน audit event
- การสร้าง admin จะไม่สร้าง HOSPITAL role หรือ HospitalMembership; admin login ใช้ `/login` ด้วยตัวระบุที่ตั้งตอน bootstrap + password ส่วน Hospital applicant ใช้ Thai National ID + password ตาม flow เดิม
- `DATABASE_URL`, `DIRECT_URL` และ Supabase credentials เป็นตัวกำหนด environment target ปัจจุบันเหมือนคำสั่งอื่น ผู้ปฏิบัติงานต้องตรวจ credentials ก่อนรัน และห้ามใช้ production credentials ใน local development

Additional Platform Admin management, invitation, recovery, removal และ password reset ยังไม่อยู่ใน scope ของ Phase 3C ดู contract ได้ที่ [Phase 3C document](docs/phases/PHASE_3C_PLATFORM_ADMIN_BOOTSTRAP.md)

## Development setup

1. Copy `.env.example` to `.env` (or export the same variables in the shell). For local development, `DATABASE_URL`, `DIRECT_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` must belong to the same Supabase development project. Production supplies the same variable names with credentials for the Supabase production project. Generate a server-only `IDENTITY_HASH_SECRET` with at least 32 characters. `SUPABASE_SERVICE_ROLE_KEY` must only be used in the trusted server environment and must never be exposed to the browser. Never use production credentials for local development.
2. For local schema development, use standard Prisma migration and generation commands:

```bash
npm run prisma:migrate:dev
npm run prisma:generate
```

Use `npm run prisma:migrate:dev -- --name <migration_name>` when creating a new migration after a confirmed schema change. Production deployment uses `npm run prisma:migrate:deploy` against the production credentials supplied by the deployment environment.

These scripts invoke standard Prisma commands; the configured `DATABASE_URL` and `DIRECT_URL` determine the actual database project. No application-level database target selector is required.

The environment-agnostic seed entrypoint is:

```bash
npm run db:seed
```

It validates the approved 78-record Hospital Master dataset and imports it idempotently into the database selected by the current environment credentials. The external provider and long-term update ownership remain replaceable/open requirements, but the committed v2 dataset is the current seed input.

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

The integration test runner expects the disposable PostgreSQL container to already be running. Start it from a Docker-enabled WSL terminal and leave it running:

```bash
docker compose --env-file .env.integration -f compose.integration.yaml up -d --wait --wait-timeout 60
```

Then run the complete integration verification with one command:

```powershell
npm run test:integration
```

`npm run test:integration` validates the local integration environment, runs `prisma generate`, applies migrations with `prisma migrate deploy`, and runs Vitest. It does not invoke Docker or WSL, so an agent can run it while the container remains available.

When finished, stop and remove the disposable container from WSL:

```bash
docker compose --env-file .env.integration -f compose.integration.yaml down --volumes --remove-orphans
```

The container uses temporary storage, fixed test-only credentials, and a localhost-only published port. The optional `npm run test:integration:local` command still manages the full Docker lifecycle automatically through the repository wrapper; use the manual WSL workflow above when the test runner must avoid Docker/WSL discovery.

To use another dedicated local PostgreSQL test database instead, export these local connection variables before running:

```bash
export DEMI_TEST_DATABASE_URL=postgresql://test-user:test-password@localhost:5432/demi_test
export DATABASE_URL=$DEMI_TEST_DATABASE_URL
export DIRECT_URL=$DEMI_TEST_DATABASE_URL
npm run prisma:migrate:test
npm run test:integration
```

On Windows PowerShell, use `$env:...` assignments instead. Integration commands refuse to run with `NODE_ENV=production`, require both `DATABASE_URL` and `DIRECT_URL` to equal `DEMI_TEST_DATABASE_URL`, and validate that the resulting PostgreSQL host is local/disposable.

The application boundary is `Client → Server Action/HTTP API → Application Service → Policy → Prisma → PostgreSQL/Supabase`. No speculative `/api/v1` endpoints, LIFF SDK, native app, or clinical business modules are implemented in this phase.

## Phase 2.1 National ID login and application access

Phase 2.1 implements the following web flow:

```text
/login
  ↓ login identifier validation (Thai National ID หรือ Admin identifier)
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

- Login ใช้ Server Action รับ Thai National ID หรือ bounded Admin identifier และ user-owned password โดย trim/validate ความยาวฝั่ง server
- Thai National ID ของ Hospital applicant ยังคง validate เลข 13 หลักและ checksum ใน onboarding; Admin identifier ที่ trusted bootstrap ตั้งได้ไม่ต้องผ่าน strict Thai National ID validation
- ตัวระบุใช้เพื่อ identity resolution เท่านั้น: server คำนวณ HMAC ด้วย namespace `thai-national-id` แล้วค้น `Person.identityKeyHash`; ไม่เพิ่มหรือ query plaintext identifier
- Supabase รับ opaque internal alias ที่ derive จาก stable `User.id` เช่น `<user-uuid>@auth.demi.internal`; alias เป็น authentication adapter detail ไม่ใช่อีเมลจริง contact method หรือ authorization source
- หลัง `signInWithPassword()` สำเร็จ ระบบเรียก provider `getUser()` เพื่อยืนยันตัวตนอีกครั้งก่อน resolve `ActorContext`
- provider subject ต้องตรงกับ `User.authSubject` ที่ resolve จาก login identifier และยังต้อง map กลับเป็น DEMI User เดิม มิฉะนั้นระบบ fail closed และจบ current session
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
2. กรอก Thai National ID ที่ provision แล้ว หรือ Admin identifier ที่ bootstrap ไว้ และรหัสผ่านที่ถูกต้อง
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
app/hospital/onboarding/                public hospital onboarding UI
app/app/admin/hospital-onboarding/      protected Platform Admin review UI
app/app/                                protected authenticated application shell
proxy.ts                                Supabase SSR session refresh boundary
prisma/schema.prisma                    stable persistence model
prisma/migrations/                      reproducible PostgreSQL migrations
prisma/seed/hospital-master-v2.json     approved 78-record Hospital Master seed data
scripts/seed-hospital-master.mjs        environment-agnostic idempotent Hospital Master seed
scripts/admin-bootstrap.mjs             trusted interactive first Platform Admin CLI
src/lib/env/                            server environment validation
src/lib/auth/                           Supabase Auth server adapter
src/lib/db/                             Prisma server singleton
src/modules/identity/                   identity resolution service
src/modules/auth/                       authentication service, ActorContext and policy kernel
src/modules/hospital-onboarding/        onboarding service, policy, transport and master lookup
src/modules/platform-admin-bootstrap/   trusted first-admin Application Service and schemas
src/modules/audit/                      bounded audit input/persistence service
src/shared/errors/                      predictable application errors
tests/integration/                      focused PostgreSQL/Prisma constraint tests
```

## Learn more

- [Next.js Documentation](https://nextjs.org/docs)
- [Next.js Learn](https://nextjs.org/learn)
- [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying)
