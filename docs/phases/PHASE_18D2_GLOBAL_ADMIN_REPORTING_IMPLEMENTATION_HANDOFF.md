# Phase 18D.2 — Global Admin Reporting Implementation Handoff

**Status: IMPLEMENTED FOR EXPLICITLY AUTHORIZED SYNTHETIC DEMO ONLY.** Production Global Patient/Program reporting and real-data release remain disabled and unapproved.

## Delivered behavior

- `/app/admin/reporting` is a dedicated Platform Admin workspace. The navigation item appears only for an ADMIN identity explicitly listed in the demo allowlist while the demo release controls are enabled.
- The workspace reads the current Hospital database directory, groups direct subordinate facilities under their main Hospital, shows relationship diagnostics, reports actual organizational counts by status and classification, and supports Thai name/code search and status filters. It does not assume all 78 approved Master records are present and does not display system-wide Patient totals.
- An ACTIVE Hospital can be selected for exact-Hospital Dashboard and Service Process reporting. Pending or suspended Hospitals show an unavailable state without querying Patient/Program report rows. Parent, child and sibling Patient records are not merged.
- The selected-Hospital view reuses the Phase 18D.1 report projection and workbook renderer. Global ADMIN users do not receive exact-Program detail links; the existing detail policy remains unchanged. Hospital OWNER reporting and export still use the original policy.
- `GET /api/v1/admin/reporting/export?hospitalId=<uuid>` prepares one selected Hospital workbook with exactly `Dashboard ภาพรวม` and `รายงานการจัดบริการ`. It uses the existing export bounds and RepeatableRead dataset collection, returns private/no-store headers, and audits preparation or denial without clinical values.

## Authorization and release controls

Each server request requires an ACTIVE authenticated User, a current database `Role.ADMIN`, an explicitly allowlisted User ID, an enabled demo release control, and (for report/export) an ACTIVE target Hospital. Entitlement is checked again after report collection and before returning the workbook. Pagination cursors bind the actor, Hospital, page size, ordering, expiry, version and `GLOBAL_ADMIN_DEMO` operation.

The demo release control is fail-closed in Production. Local development or isolated Preview also requires a server-only designated synthetic database URL that exactly matches `DATABASE_URL`; the server additionally checks `SELECT current_database()` against the designated database name. Preview status alone does not enable access. The designated URL remains an operator assertion that the configured source is synthetic; the software does not inspect every record to prove synthetic provenance. No migration, Master seeding, membership spoofing or clinical grant was added.

Configure these server-only values for an isolated development/demo deployment:

```dotenv
DEMI_GLOBAL_REPORTING_DEMO_ENABLED=true
DEMI_GLOBAL_REPORTING_DEMO_ADMIN_USER_IDS=<comma-separated active ADMIN user UUIDs>
DEMI_GLOBAL_REPORTING_SYNTHETIC_DATABASE_URL=<same full URL as DATABASE_URL>
```

For Preview, set them in the Preview environment, verify that its database and authentication project contain synthetic demo data/accounts, then create or redeploy a Preview deployment. Do not configure the feature for Production. Runtime changes do not seed Hospitals; the directory reflects records actually present in the selected database.

## Verification

- `npm run test -- src/modules/reporting/policies/global-reporting-policy.test.ts src/modules/reporting/services/global-reporting-access-service.test.ts src/modules/reporting/services/global-reporting-demo-release-control.test.ts src/modules/reporting/services/hospital-report-query-service.test.ts src/modules/reporting/services/hospital-report-workbook-service.test.ts src/modules/reporting/services/hospital-report-access-service.test.ts src/modules/reporting/services/hospital-report-release-control.test.ts src/modules/reporting/transport/hospital-report-page-context.test.ts src/modules/reporting/transport/global-reporting-page-context.test.ts app/app/admin/reporting/global-admin-reporting-workspace.test.tsx app/app/hospitals/reporting/hospital-report-workspace.test.tsx app/api/v1/admin/reporting/export/route.test.ts src/components/app-shell/application-navigation.test.ts` — **13 files, 83 tests passed**.
- `npm run test:integration:focused -- tests/integration/hospital-reporting.integration.test.ts` — **1 file, 6 tests passed** against local synthetic PostgreSQL `demi_test` on loopback. This includes exact-Hospital isolation, owner/global projection equality, pending/suspended denials, entitlement/role revocation, Production denial, revocation before workbook release, and the two-sheet workbook.
- `npm run typecheck` — passed.
- Targeted `npx eslint` across all changed TypeScript/TSX source and test files — passed with no warnings.
- After the final scope-copy adjustment, `npm run test -- app/app/admin/reporting/global-admin-reporting-workspace.test.tsx` — **1 file, 2 tests passed**; typecheck and targeted ESLint for the same UI files also passed.
- `git diff --cached --check` — passed after final diff review.
- Authenticated browser smoke is unverified. No authenticated browser session tied to a certified synthetic database/account was available. The automated PostgreSQL integration test verifies active ADMIN access without Hospital membership, exact-Hospital isolation, owner/global projection equivalence, denied inactive targets, current-role/allowlist revocation, Production denial, and the two-sheet workbook.

## Remaining gates and integration points

- Production Global Patient/Program reporting remains disabled until the separate grant, Security, Privacy and Data Controller approvals/contracts in the existing Global Reporting decisions are completed. The demo allowlist is not that approval.
- Global Patient discovery, exact-Program detail, cross-Hospital aggregates, network export and any system-wide patient-derived totals remain unavailable. HN-M07 disclosure and historical reparenting gates remain open.
- The existing exact-Hospital query, signed cursor and workbook are the integration boundary for future approved Global reporting. Network aggregation requires a separate bounded scope/disclosure contract; Phase 18D.2 does not alter Phase 18D.1 authorization or authorize Phase 18D.2 production rollout.
