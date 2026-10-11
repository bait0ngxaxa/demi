# Phase 18D.1 — Hospital Reporting Implementation Handoff

> **Current requirement update:** See [Reporting Access Canonical](../requirements/REPORTING_ACCESS_CANONICAL.md). This handoff verifies direct-Hospital OWNER reporting only. OR-RPT-01 additionally requires Parent OWNER access to eligible direct Child reports without Child OWNER membership; that path is not implemented here. HN-M07 does not block this exact-Hospital flow, while Parent-specific Patient/clinical field disclosure and Child export remain open.

**Status: HOSPITAL OWNER REPORTING MVP IMPLEMENTED / BROWSER FLOW HISTORICALLY UNVERIFIED.** This handoff records Phase 18D.1 behavior and verification at its implementation point. The current production-ready, deployment-neutral delivery standard is recorded in [ADR-0010](../adr/0010-production-ready-mvp-and-deployment-neutral-runtime.md); current hosting-agnostic authorization and Global Admin integration are recorded in the Phase 18D.2 runtime correction handoff. No production rollout or real Patient-data query was performed during Phase 18D.1.

## Delivery

- Repository: `bait0ngxaxa/demi`, branch `main`.
- Starting hardening HEAD: `d9fbe108378230b6018c972ab4adb42c9560c69d`; worktree was clean.
- Initial runtime implementation commit: `d9fbe108378230b6018c972ab4adb42c9560c69d`.
- Hardening runtime/tests commit: `f6e7af93d3f303e8d9df5c06fa37941e696247ff`.
- Code/test ending HEAD: `f6e7af93d3f303e8d9df5c06fa37941e696247ff`. This metadata update is a follow-up documentation commit.
- Dashboard route: `/app/hospitals/reporting`, with `Dashboard ภาพรวม` and `รายงานการจัดบริการ`, Hospital selection within direct active Owner scope, responsive patient/Program views, honest unavailable states, exact authorized detail links, pagination, and XLSX progress/error feedback.
- Export endpoint: `GET /api/v1/hospital/reporting/export?hospitalId=<uuid>`. It returns a private, non-cacheable XLSX with the two customer worksheets and safe errors. Dashboard and export use the same factual reporting dataset/projection.
- Reporting runtime lives under `src/modules/reporting/{policies,schemas,projections,services,transport}`, with the page and endpoint under `app/app/hospitals/reporting` and `app/api/v1/hospital/reporting/export`.

The workbook contains exactly `Dashboard ภาพรวม` and `รายงานการจัดบริการ`. Programs continue onto deterministic rows when they exceed the template's six Dashboard or four Service Process follow-up positions. The Service Process sheet appends a normalized Goal Plan/activity-progress detail table. These continuation rows preserve all Follow-ups while retaining the two worksheet names; they are the layout differences from the customer sample.

## Feature availability and operator setup

Hospital Reporting authorization is independent of hosting provider and deployment labels. An authenticated ACTIVE user requires current `Role.HOSPITAL`, a direct ACTIVE OWNER membership and an ACTIVE target Hospital for the requested reporting operation. The server revalidates membership and Hospital status for reads, continuation pages and exports.

The server-only `DEMI_HOSPITAL_REPORTING_CURSOR_SECRET`, with at least 32 random bytes, signs pagination cursors. Configure this genuine secret in each runtime that needs cursor continuation. If a cursor is required and the secret is missing or too short, the service fails with an explicit infrastructure error; it does not issue an unsigned cursor. Database and authentication connection configuration remain ordinary deployment-owned infrastructure settings.

## Access, consistency, and release control

Server-side reporting requires an ACTIVE user with `Role.HOSPITAL`, direct ACTIVE OWNER membership in the exact ACTIVE Hospital, and a valid server-resolved Hospital context. MEMBER, OSM, PATIENT, ADMIN-only, another Hospital's OWNER, parent/child-only relationships, and suspended user, membership, or Hospital are denied. Dashboard, row, and export use distinct capabilities; ordinary exact-Program authorization remains unchanged. Continuation and export requests independently revalidate current authority. Dashboard access is checked during the consistent data read and checked again against the root database after projection assembly, before release. This reduces the revocation window but cannot make authorization atomic with the later page render; a revocation after the final check remains the normal race boundary.

Cursors are HMAC-SHA256 signed with the server-only secret and bind version, actor, exact Hospital, page size, deterministic `startedAt DESC, id DESC` ordering, and a 15-minute expiry. Malformed, non-canonical, tampered, expired, and cross-context cursors fail with a generic not-found response. Query predicates remain exact-Hospital scoped.

Export source counts and linked rows are collected in a bounded PostgreSQL `RepeatableRead` transaction, then XLSX rendering occurs after the read transaction. The response exposes a generation timestamp, not a `dataAsOf` claim. A minimized `hospital_reporting.export.prepared` audit event records actor, Hospital, capability, Program count, preparation time, and outcome; it excludes Patient identifiers and clinical values. Audit failure prevents file release.

## Workbook field coverage

| Worksheet | Source-backed values shown | Unavailable or qualified values |
| --- | --- | --- |
| `Dashboard ภาพรวม` | Hospital identity; Patient name and Hospital-local ID; current relationship OSM assignment; Program start/status/completion date; Baseline and Final Assessment DTX, weight, waist, blood pressure, and Baseline height; all Follow-up DTX and weight values, including recorded zero. | DM/Pre-DM totals have no accepted classification mapping or denominator; illness duration and CVD Risk have no source; BMI and achievement scores have no approved formula; Baseline HbA1c has source data but its context/unit are unapproved; missing Baseline/Follow-up/Final records are shown without conversion to zero or failure. OSM is labeled as the current assignment, not historical attribution. |
| `รายงานการจัดบริการ` | Patient/Hospital context; Before/After measurements; Service 1 record presence; exact-Program Goal Plans and targets; Follow-up dates, measurements, human-readable activity labels and recorded progress statuses; all Goal Plan and activity-progress detail within export bounds. | PAM/PROM and weekly exercise are not Program-scoped; Final Assessment has no HbA1c or height; CVD Risk and structured outcome/plan-adjustment/obstacle sources are absent; achievement-day/rate/>70% formulas are unapproved; Baseline confidence-score semantics are unapproved. A record's presence/status does not claim service delivery or treatment success. |

The DTO distinguishes `RECORDED` (including numeric zero), `NOT_RECORDED`, `UNAVAILABLE`, and missing records. A relationship without a Program affects relationship counts but does not receive a fabricated Program row. Dashboard pages contain 20 Programs by default (maximum 50), with up to six Follow-ups and three Goal Plans previewed per Program and totals shown. Export supports up to 1,000 Programs, 10,000 Follow-ups, 5,000 Goal Plans, 50,000 activity-progress records, and 20,000 Goal Plan items; oversized requests fail rather than truncate.

## Verification

- `npm run test -- app/app/hospitals/reporting/hospital-report-workspace.test.tsx app/api/v1/hospital/reporting/export/route.test.ts src/components/app-shell/application-navigation.test.ts src/modules/reporting/services/hospital-report-access-service.test.ts src/modules/reporting/services/hospital-report-query-service.test.ts src/modules/reporting/services/hospital-report-release-control.test.ts src/modules/reporting/services/hospital-report-workbook-service.test.ts src/modules/reporting/transport/hospital-report-page-context.test.ts` — **8 files, 59 tests passed**.
- This is the original Phase 18D.1 verification record. The release-control service/test was later removed; current hosting-independent verification is recorded in the Phase 18D.2 handoff.
- `npm run test -- app/app/hospitals/reporting/hospital-report-workspace.test.tsx` — **1 file, 4 tests passed** after the final UI wording assertion.
- `npm run test:integration:focused -- tests/integration/hospital-reporting.integration.test.ts` — **1 file, 3 tests passed** against local synthetic PostgreSQL `demi_test` on loopback. It covers scoped denials, revocation on a subsequent cursor page, final Dashboard revalidation after membership suspension, exact-Program regression, source grain, seven Follow-ups, export workbook/audit, and a concurrent insert isolated by RepeatableRead.
- `npm run typecheck` — passed.
- Local installed ESLint on all changed TypeScript/TSX source and test files — passed; the final UI file/test lint rerun also passed.
- Impeccable detector on `hospital-report-workspace.tsx` — returned no findings (`[]`). `git diff --check` — clean.
- Full repository tests, production build, and authenticated browser smoke were not run. No authenticated browser session against a controlled test database was available, so the login → navigation → both views → downloaded two-sheet XLSX journey remains **unverified**. Automated synthetic integration verifies route services, authorization, XLSX generation, worksheet structure, scope, overflow, and snapshot behavior; it does not replace that browser smoke. This is a historical verification limitation, not a runtime restriction on Hospital Reporting.

## Phase 18D.2 reuse and remaining limits

Phase 18D.2 reuses `HospitalReportProgramRow`, `HospitalReportingDataset`, factual source projections, export bounds, and the workbook renderer. The selected-Hospital Global Admin report and export use a separate current-Role.ADMIN policy and never treat Platform ADMIN as Hospital OWNER authority. Cross-Hospital aggregates/comparisons, Global Patient discovery/identity/detail routes, and Network reporting are not implemented in this MVP.

Remaining source gaps are limited to the unavailable or unapproved fields above. No clinical formula, capture flow, schema column, or migration was added. Hospital OWNER production behavior follows the same direct ACTIVE OWNER policy; no deployment-specific release gate exists. Authenticated browser verification and any new clinical definitions remain separate work.
