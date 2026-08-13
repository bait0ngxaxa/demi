# DEMI Rewrite

DEMI is being rewritten on the architecture documented in [`docs/CONTEXT.md`](docs/CONTEXT.md), the [architecture baseline](docs/architecture/DEMI_ARCHITECTURE_BASELINE.md), and the [ADR index](docs/adr/README.md).

โปรเจกต์อยู่ใน **Implementation Phase 2: Authentication & Application Access** โดยต่อยอดจาก core foundation ให้ผู้ใช้ที่ได้รับการ provision และมีสถานะ `ACTIVE` สามารถเข้าสู่ protected application shell ได้จริง Clinical และ operational domains ยังคงอยู่นอก scope จนกว่า requirement จะได้รับการยืนยัน

## Development setup

1. Copy `.env.example` to `.env` (or export the same variables in the shell) and provide a development PostgreSQL/Supabase connection and Supabase Auth public configuration. Set `DEMI_DATABASE_TARGET` to the non-production database target. Generate a server-only `IDENTITY_HASH_SECRET` with at least 32 characters. Never use production credentials for local development.
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

## Phase 2 authentication and application access

Phase 2 implements the following web flow:

```text
/login
  ↓ Supabase email/password authentication
validated provider identity
  ↓ User.authSubject
ACTIVE DEMI User + ActorContext
  ↓
/app
  ↓ logout
/login
```

- Login ใช้ Server Action และ Zod validation พร้อมจำกัดความยาว email/password
- หลัง `signInWithPassword()` สำเร็จ ระบบเรียก provider `getUser()` เพื่อยืนยันตัวตนอีกครั้งก่อน resolve `ActorContext`
- เฉพาะ provider subject ที่ map กับ `User.status = ACTIVE` เท่านั้นที่เข้า `/app` ได้
- `PROVISIONED`, `INVITED`, `SUSPENDED` และ unmapped provider user ถูกปฏิเสธโดยไม่มี automatic Person/User/role provisioning
- `/app` ตรวจสิทธิ์ฝั่ง server; browser state, Supabase metadata, role หรือ hospital ID จาก client ไม่ถูกใช้เป็น authority
- Logout ใช้ Supabase Auth server client และปล่อยให้ provider จัดการ session cookies
- invalid/expired session แยกจาก provider, configuration และ database infrastructure failure อย่างชัดเจน
- UI ภาษาไทยเป็น responsive shared shell สำหรับทุก ACTIVE actor และแสดง role จาก server-resolved `ActorContext`

Phase 2 ยังไม่กำหนด patient activation mechanism, Hospital onboarding verification, staff/OSM invitation mechanism, LIFF identity linking, ThaID, native authentication, role capability matrix หรือ operational business workflows

## Implementation structure

```text
app/api/health/route.ts                 server infrastructure transport
app/login/                              Thai email/password login UI
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
