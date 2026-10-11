# Phase 18D.2 — Reporting Configuration Simplification & UAT Handoff

**Status: IMPLEMENTED FOR LOCAL DEVELOPMENT AND THE TRUSTED DEMI UAT VERCEL PROJECT.** Other Production projects and unknown deployments fail closed for both reporting surfaces. Global identifiable Patient/Program reporting in actual Production remains unapproved and unavailable.

## Delivery

- Repository: `bait0ngxaxa/demi`, branch `main`.
- Starting HEAD: `a3e7c7d0643c5d44cd1426ce5269e0f439b8920b`.
- Ending runtime implementation commit: `90684876179d28cf7433c0d8a5ec0d95cd615e26` (the follow-up commit records this SHA in the handoff).
- Hospital OWNER route: `/app/hospitals/reporting`; existing exact-Hospital Dashboard, Service Process report, direct-owned-Hospital selector, and two-sheet XLSX remain intact.
- Global ADMIN route: `/app/admin/reporting`; the directory, Thai name/code search, status filtering, main/subordinate grouping, selected-Hospital Dashboard, Service Process report, and one-Hospital XLSX remain intact.
- Global export: `GET /api/v1/admin/reporting/export?hospitalId=<uuid>`. It reuses the shared exact-Hospital query, RepeatableRead dataset collection, bounds, and workbook renderer. The workbook still contains exactly `Dashboard ภาพรวม` and `รายงานการจัดบริการ`.
- Removed the five old runtime configuration requirements: `DEMI_HOSPITAL_REPORTING_ENABLED`, `DEMI_HOSPITAL_REPORTING_PRODUCTION_APPROVED`, `DEMI_GLOBAL_REPORTING_DEMO_ENABLED`, `DEMI_GLOBAL_REPORTING_DEMO_ADMIN_USER_IDS`, and `DEMI_GLOBAL_REPORTING_SYNTHETIC_DATABASE_URL`. `.env.example` retains the genuine cursor signing secret.
- Removed the prominent Global UI message about demo authorization and internal database setup. The page still states that Patient/Program reports cover only the selected Hospital.

## Trusted deployment boundary

- Local development is available when `NODE_ENV=development` and Vercel system metadata is absent.
- The linked Vercel project was verified as `demi_demo` (`prj_QXcjnZaz0tqiaEJdWSlzy4yuk49p`). The server recognizes this exact project through the system-provided `VERCEL_PROJECT_ID`, with `VERCEL=1`. It remains UAT even when Vercel labels its deployment `VERCEL_ENV=production`.
- Vercel system environment variables must be exposed to the runtime. The implementation uses the project ID as the trust boundary; it does not infer UAT from a project/database name, host name, deployment label, or duplicate database URL.
- Other Vercel projects labeled Production are denied. Other Preview projects, missing project identity, partial Vercel metadata, and unknown deployment targets are untrusted and denied. The future actual Production deployment must use a separate Vercel project ID from this dedicated UAT project.
- Product confirmed that UAT uses a separate database. Runtime does not inspect database contents or certify synthetic provenance; the deployment must keep the UAT project connected only to the isolated UAT database and authentication project. No UAT/Production credentials, project settings, database, or seed data were changed.
- `DEMI_HOSPITAL_REPORTING_CURSOR_SECRET` remains server-only and needs at least 32 random bytes to sign/verify continuation cursors. No other reporting feature configuration is required.

## Authorization and data scope

- Hospital Reporting still requires an authenticated ACTIVE user, current `Role.HOSPITAL`, direct ACTIVE OWNER membership in the exact ACTIVE Hospital, and the operation-specific capability. MEMBER, OSM, PATIENT, ADMIN-only, unrelated OWNER, suspended user/membership/Hospital, and hierarchy-only relationships do not qualify.
- Global Reporting independently requires an authenticated ACTIVE user and current database `Role.ADMIN`. Hospital membership is not required. No per-user UUID allowlist or Hospital role spoofing remains. Current role and deployment eligibility are revalidated on report pagination and export.
- Navigation and server access use the same deployment classification. Authenticated users without the required reporting role are sent back to `/app`; invalid/missing resource contexts remain hidden. Menu visibility is not the authorization boundary.
- Global report queries remain exact-Hospital scoped. Choosing a main Hospital never adds child records; choosing a child never adds parent or sibling records. Global ADMIN receives no exact-Program detail navigation, bulk export, Network export, or cross-Hospital Patient totals.
- Existing HMAC cursors remain actor-, Hospital-, page-size-, ordering-, expiry-, and operation-bound. Hospital and Global operations cannot reuse one another's cursor. Audit, no-store handling, export limits, and snapshot behavior are unchanged.

## Verification

- Focused deployment/policy/access/navigation/page-context/UI tests: **8 files, 54 tests passed**.
- Query/cursor/workbook/Hospital and Global export-route/OWNER and Global workspace regression tests: **12 files, 85 tests passed**.
- `npm run test:integration:focused -- tests/integration/hospital-reporting.integration.test.ts`: **6 tests passed** against local synthetic PostgreSQL `demi_test` on loopback. Covers exact-Hospital isolation, Global ADMIN without membership, Owner/Global projection parity, role/suspension/target denials, current-role revocation, UAT project classification, export revocation, and two-sheet XLSX.
- `npm run test:integration:focused -- tests/integration/hospital-hierarchy.integration.test.ts`: **4 tests passed** against the same local synthetic PostgreSQL database.
- `npx next typegen` regenerated Next route types; `npm run typecheck` passed.
- Targeted ESLint over all modified TypeScript/TSX source and test files passed with no output. Impeccable detector on the changed Global Reporting workspace returned `[]`.
- No full repository suite or production build was run.
- Authenticated browser UAT remains **unverified**. The connected Vercel project's latest deployment was CANCELED at inspection time, and no authenticated browser session tied to the isolated UAT account/database was available.

## Remaining gates

- Confirm Vercel exposes `VERCEL` and `VERCEL_PROJECT_ID` at runtime, keep the identified project dedicated to UAT with its separate DB/Auth project, and deploy the committed code. No manual reporting flags or ADMIN identity allowlist are needed.
- Keep actual Production on a separate Vercel project. Global identifiable reporting there remains blocked pending the independent grant, Security, Privacy, and Data Controller approvals. Hospital Reporting Production release authorization remains separate and is not enabled by this UAT classification.
- Global Patient discovery/detail, cross-Hospital aggregates, system-wide Patient totals, Network exports, and historical hierarchy disclosure remain out of scope. HN-M07 and historical-disclosure gates remain open.
