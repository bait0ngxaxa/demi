# Phase 18D.2 — Global Admin Reporting Implementation Handoff

> **Current requirement update:** See [Reporting Access Canonical](../requirements/REPORTING_ACCESS_CANONICAL.md). This handoff verifies the required Global ADMIN per-selected-Hospital report and XLSX export. It is not Global Aggregation; merged summaries/comparisons are not initial requirements. Preserve the implemented selected-Hospital behavior without inferring arbitrary external sharing.

**Status: HOSTING-AGNOSTIC MVP IMPLEMENTED.** The selected-Hospital Global Admin reporting feature follows normal database-backed application authorization on every compatible host. The project-wide delivery contract is recorded in [ADR-0010](../adr/0010-production-ready-mvp-and-deployment-neutral-runtime.md). No deployment was performed by this implementation.

## Delivery

- Repository: `bait0ngxaxa/demi`, branch `main`.
- Starting HEAD for this hosting-agnostic correction: `46134a395201558dcac114ffe5c629725be34825`.
- Runtime correction commit: `bebf2684fae0bd1684327d1e12e1987c5ad4273e`.
- Earlier Reporting Configuration Simplification baseline: `a3e7c7d0643c5d44cd1426ce5269e0f439b8920b`.
- Hospital OWNER route: `/app/hospitals/reporting`; existing exact-Hospital Dashboard, Service Process report, direct-owned-Hospital selector, and two-sheet XLSX remain intact.
- Global ADMIN route: `/app/admin/reporting`; the directory, Thai name/code search, status filtering, main/subordinate grouping, selected-Hospital Dashboard, Service Process report, and one-Hospital XLSX remain intact.
- Global export: `GET /api/v1/admin/reporting/export?hospitalId=<uuid>`. It reuses the shared exact-Hospital query, RepeatableRead dataset collection, bounds, and workbook renderer. The workbook still contains exactly `Dashboard ภาพรวม` and `รายงานการจัดบริการ`.
- Removed the five old runtime configuration requirements: `DEMI_HOSPITAL_REPORTING_ENABLED`, `DEMI_HOSPITAL_REPORTING_PRODUCTION_APPROVED`, `DEMI_GLOBAL_REPORTING_DEMO_ENABLED`, `DEMI_GLOBAL_REPORTING_DEMO_ADMIN_USER_IDS`, and `DEMI_GLOBAL_REPORTING_SYNTHETIC_DATABASE_URL`. `.env.example` retains the genuine cursor signing secret.
- Removed the prominent Global UI message about demo authorization and internal database setup. The page still states that Patient/Program reports cover only the selected Hospital.

## Hosting-independent authorization

- Reporting authorization does not inspect the hosting provider, `NODE_ENV`, Vercel deployment labels, project IDs, database URLs, or UAT/demo identity.
- Hospital Reporting requires an authenticated ACTIVE user, current `Role.HOSPITAL`, a direct ACTIVE OWNER membership, an ACTIVE target Hospital, and the requested Hospital reporting capability.
- Global Reporting requires an authenticated ACTIVE user and current database `Role.ADMIN`. The workspace/directory, selected-Hospital report read, and selected-Hospital export use separate Global operation capabilities. Report and export operations require an ACTIVE selected Hospital.
- These checks are revalidated from the database for each protected request, pagination continuation, and export. Hospital OWNER and Platform ADMIN policies remain separate.
- `DEMI_HOSPITAL_REPORTING_CURSOR_SECRET` remains server-only and needs at least 32 random bytes to sign/verify continuation cursors. No reporting feature flags, deployment allowlists, or demo identities are required.

## Authorization and data scope

- Hospital Reporting still requires an authenticated ACTIVE user, current `Role.HOSPITAL`, direct ACTIVE OWNER membership in the exact ACTIVE Hospital, and the operation-specific capability. MEMBER, OSM, PATIENT, ADMIN-only, unrelated OWNER, suspended user/membership/Hospital, and hierarchy-only relationships do not qualify.
- Global Reporting independently requires an authenticated ACTIVE user and current database `Role.ADMIN`. Hospital membership is not required. No per-user UUID allowlist or Hospital role spoofing remains. Current role and selected-Hospital eligibility are revalidated on report pagination and export.
- Navigation reflects the current actor's application roles and direct Hospital ownership context. Server access remains authoritative; menu visibility is not the authorization boundary.
- Global report queries remain exact-Hospital scoped. Choosing a main Hospital never adds child records; choosing a child never adds parent or sibling records. Global ADMIN receives no exact-Program detail navigation, bulk export, Network export, or cross-Hospital Patient totals.
- Existing HMAC cursors remain actor-, Hospital-, page-size-, ordering-, expiry-, and operation-bound. Hospital and Global operations cannot reuse one another's cursor. Audit, no-store handling, export limits, and snapshot behavior are unchanged.

## Verification

- Focused reporting and regression tests: `npm run test -- src/modules/reporting/policies/global-reporting-policy.test.ts src/modules/reporting/policies/hospital-report-policy.test.ts src/modules/reporting/services/global-reporting-access-service.test.ts src/modules/reporting/services/hospital-report-access-service.test.ts src/modules/reporting/services/hospital-report-query-service.test.ts src/modules/reporting/services/hospital-report-workbook-service.test.ts src/modules/reporting/transport/global-reporting-page-context.test.ts src/modules/reporting/transport/hospital-report-page-context.test.ts src/modules/reporting/transport/program-report-page.test.ts app/api/v1/admin/reporting/export/route.test.ts app/api/v1/hospital/reporting/export/route.test.ts app/app/admin/reporting/global-admin-reporting-workspace.test.tsx app/app/hospitals/reporting/hospital-report-workspace.test.tsx src/components/app-shell/application-navigation.test.ts` — **14 files, 128 tests passed**. This includes six runtime-environment cases (local, Vercel Preview/Production, VPS, Docker, and non-Vercel production) for both report access surfaces and navigation.
- `npm run test:integration:focused -- tests/integration/hospital-reporting.integration.test.ts` — **6 tests passed** against synthetic PostgreSQL `demi_test` on loopback (`127.0.0.1:55432`); no pending migrations.
- `npm run test:integration:focused -- tests/integration/hospital-hierarchy.integration.test.ts` — **4 tests passed** against the same synthetic PostgreSQL database; no pending migrations.
- `npm run typecheck` — passed.
- `npx eslint` over all changed TypeScript/TSX files — passed with no output.
- `npm run architecture:check` — not available; `package.json` defines no script with that name.
- `git diff --check` — passed. Source scan found no reporting-specific Vercel, NODE_ENV, deployment-classification, or demo authorization references. Unrelated infrastructure/authentication environment handling remains outside Reporting.
- No full repository suite or production build was run.
- Authenticated browser acceptance remains **unverified** because no authenticated browser session tied to a verified application database was available.

## Remaining gates

- Authenticated browser acceptance remains unverified. Infrastructure isolation, database connectivity, authentication configuration, and release operations remain deployment-owner responsibilities; they do not alter application authorization.
- This MVP permits an ADMIN to inspect the organizational directory, select an ACTIVE Hospital, view its exact-Hospital report, and export that Hospital's workbook under the Product Owner-confirmed role contract. It does not grant unrestricted Global Patient search, exact-Program detail routes, merged cross-Hospital Patient reports, cross-Hospital aggregates/comparisons, Network reports/exports, or historical hierarchy disclosure.
- HN-M07 and historical disclosure gates remain open for future Network aggregates. No independent Security, Privacy, Data Controller, or clinical approval is claimed for other scopes.
