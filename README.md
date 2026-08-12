# DEMI Rewrite

DEMI is being rewritten on the architecture documented in [`docs/CONTEXT.md`](docs/CONTEXT.md), the [architecture baseline](docs/architecture/DEMI_ARCHITECTURE_BASELINE.md), and the [ADR index](docs/adr/README.md).

The current implementation phase establishes only the core foundation: identity, application accounts, roles, hospital memberships, server-side authentication mapping, fail-closed authorization primitives, audit input validation, Prisma persistence, and a health check. Clinical and operational domains remain out of scope until their requirements are confirmed.

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

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

The server-only health check is available at `/api/health`. It returns only `ok` or `unavailable` and never exposes credentials or stack traces.

## Verification commands

```bash
npm run lint
npm run typecheck
npm test
```

For database integration tests, use a dedicated PostgreSQL test database and set all three values to the same test target before running:

```bash
export DEMI_DATABASE_TARGET=test
export DEMI_TEST_DATABASE_URL=postgresql://postgres:password@localhost:5432/demi_test
export DATABASE_URL=$DEMI_TEST_DATABASE_URL
npm run prisma:migrate:deploy
npm run test:integration
```

On Windows PowerShell, use `$env:...` assignments instead. The integration command refuses to run unless `DEMI_DATABASE_TARGET=test`, `DATABASE_URL` equals `DEMI_TEST_DATABASE_URL`, and the target is explicitly non-production.

The application boundary is `Client → Server Action/HTTP API → Application Service → Policy → Prisma → PostgreSQL/Supabase`. No speculative `/api/v1` endpoints, LIFF SDK, native app, or clinical business modules are implemented in this phase.

## Foundation structure

```text
app/api/health/route.ts                 server infrastructure transport
proxy.ts                                Supabase SSR session refresh boundary
prisma/schema.prisma                    stable persistence model
prisma/migrations/                      reproducible PostgreSQL migrations
scripts/prisma-preflight.mjs            Prisma CLI database-target safety guard
src/lib/env/                            server environment validation
src/lib/auth/                           Supabase Auth server adapter
src/lib/db/                             Prisma server singleton
src/modules/identity/                   identity resolution service
src/modules/auth/                       ActorContext and policy kernel
src/modules/audit/                      bounded audit input/persistence service
src/shared/errors/                      predictable application errors
tests/integration/                      focused PostgreSQL/Prisma constraint tests
```

## Learn more

- [Next.js Documentation](https://nextjs.org/docs)
- [Next.js Learn](https://nextjs.org/learn)
- [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying)
