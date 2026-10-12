# RPT-CLOSE-01 — Reporting Integrated Re-audit & Handoff

## Baseline

- Starting HEAD: `cd6d25978fcd067fe8832054e5b4bbf55527e021`
- Ending HEAD: `cd6d25978fcd067fe8832054e5b4bbf55527e021`; scoped changes remain uncommitted in the working tree.
- Branch: `main`
- Date: 2026-10-12

## Reviewed reporting operations

- Direct Hospital OWNER Dashboard, Service Process report, pagination, and XLSX export.
- Global ADMIN selected-Hospital Dashboard, Service Process report, and XLSX export.
- Parent OWNER exact-Child summary report through the grouped Hospital selector.

## Confirmed boundaries

- **Direct OWNER:** current ACTIVE User and database `Role.HOSPITAL`, direct ACTIVE OWNER membership, and exact ACTIVE Hospital. Read and export remain on the direct-owner service/policy path; hierarchy membership does not authorize this operation.
- **Global ADMIN:** current ACTIVE User and database `Role.ADMIN`; an eligible ACTIVE Hospital may be selected without Hospital membership. Each read/export targets exactly that Hospital; no merged result or Patient-workspace authority is added.
- **Parent OWNER:** current ACTIVE User and `Role.HOSPITAL`, direct ACTIVE OWNER at the exact ACTIVE MAIN Parent, plus the current ACTIVE direct Child relationship. No Child OWNER membership is required. The page selector is a locator; the reporting service re-resolves current authority, reads in `RepeatableRead`, and revalidates before release. A user who directly owns the selected Child uses the direct OWNER operation.
- Parent source predicates use only the authorized Child ID. Parent, sibling, grandchild, and unrelated Hospital records do not enter the selected Child result. Former Parent access fails after reparenting; no historical Parent authority is inferred from timestamps.
- Direct OWNER and Global ADMIN cursors remain operation-bound to actor, Hospital, page size, ordering, and expiry. Parent summary has no pageable Patient/Program rows or cursor; Parent requests carrying pagination state are rejected.
- Parent audit records `read`, `denied`, and `failed` outcomes without report values, Patient/Program identifiers, clinical data, or raw infrastructure errors. Malformed, mixed, and out-of-group Parent locators rejected in Page Context now record a non-enumerating denied event.
- Direct OWNER and Global ADMIN export success and error responses set `private, no-store`; the Hospital reporting page is request-time rendered through Next.js `connection()`.

## Parent released fields

The Parent projection and UI expose only Parent/Child identity and these nine exact-Child summary values:

1. Patient–Hospital relationship count.
2. Patient–Hospital relationships without any Program.
3. Total eligible Programs (`ACTIVE + COMPLETED`).
4. ACTIVE Programs.
5. COMPLETED Programs.
6. Programs with a Routine record.
7. Programs with a Floating Chart record.
8. Programs with a Dream Card record.
9. Programs with a Confidence record.

Relationship measures use the `PatientHospitalRelationship` grain and exact `hospitalId`; “without Program” uses the existing `programs: { none: {} }` predicate. Program measures use `PatientProgram` rows joined to relationships at the exact selected Hospital and limited to `ACTIVE`/`COMPLETED`; total is the sum of those statuses. Service Process measures count the existing corresponding ServiceOne tables through their `patientProgram` relationship with the same exact-Hospital and status predicate. Each ServiceOne table has a unique `patientProgramId`, so each count is at Program grain without join fan-out. A record means record presence only; it does not mean service completion, treatment delivery, or outcome success. Zero is a real source value, not a fallback for unavailable data.

The current hierarchy grants access to the exact Child report; no effective-dated Parent-at-record-time attribution is available. The displayed exact-Child measures are not a claim that all source records were created during the current Parent relationship.

## Explicit exclusions

This closeout does not implement or authorize:

- Parent-selected Child XLSX export.
- Parent Patient-level rows, Patient identifiers, clinical fields, or individual Program details/links.
- Patient mutation, workforce mutation, or Hospital configuration mutation through Parent authority.
- Network aggregation or Global merged aggregation.
- Historical Parent attribution or unrestricted historical disclosure by former hierarchy.
- External onward disclosure of downloaded Global ADMIN reports.

## Verification evidence

Focused unit, UI, route, and service regression:

```text
npm run test -- src/modules/reporting/policies/hospital-network-child-report-policy.test.ts src/modules/reporting/services/parent-child-hospital-report-access-service.test.ts src/modules/reporting/services/parent-child-hospital-report-query-service.test.ts src/modules/reporting/transport/hospital-report-page-context.test.ts src/modules/reporting/schemas/hospital-report-schemas.test.ts app/app/hospitals/reporting/parent-child-hospital-report-workspace.test.tsx app/app/hospitals/reporting/hospital-report-workspace.test.tsx src/modules/reporting/services/hospital-report-access-service.test.ts src/modules/reporting/policies/hospital-report-policy.test.ts src/modules/reporting/services/hospital-report-query-service.test.ts src/modules/reporting/services/hospital-report-workbook-service.test.ts app/api/v1/hospital/reporting/export/route.test.ts src/modules/reporting/policies/global-reporting-policy.test.ts src/modules/reporting/services/global-reporting-access-service.test.ts src/modules/reporting/transport/global-reporting-page-context.test.ts app/app/admin/reporting/global-admin-reporting-workspace.test.tsx app/api/v1/admin/reporting/export/route.test.ts
```

Result: **17 files / 106 tests passed**.

Final assertions were also rerun after the combined pass:

```text
npm run test -- src/modules/reporting/transport/hospital-report-page-context.test.ts
```

Result: **1 file / 9 tests passed**.

```text
npm run test -- app/api/v1/hospital/reporting/export/route.test.ts
```

Result: **1 file / 7 tests passed**.

```text
npm run test:integration:focused -- tests/integration/hospital-reporting.integration.test.ts
```

Result: **1 file / 8 PostgreSQL tests passed**. This includes exact Child numeric values and isolation, Parent OWNER without Child OWNER membership, reparenting/revocation, ADMIN-only denial, and Direct OWNER/Global ADMIN report and export regression.

```text
npm run test:integration:focused -- tests/integration/hospital-hierarchy.integration.test.ts
```

Result: **1 file / 4 PostgreSQL tests passed**.

```text
npm run typecheck
```

Result: **passed** (`tsc --noEmit`).

```text
npx eslint src/modules/reporting/services/hospital-report-query-service.ts src/modules/reporting/transport/hospital-report-page-context.ts src/modules/reporting/transport/hospital-report-page-context.test.ts app/api/v1/hospital/reporting/export/route.ts app/api/v1/hospital/reporting/export/route.test.ts
```

Result: **passed**.

The repository-wide test suite, production build, manual browser/mobile UAT, and production deployment were not run.

## Findings/remediation

- Corrected the Parent cursor comment: current Parent output is an allowlisted exact-Child summary with no pageable Patient/Program rows or cursor.
- Updated canonical reporting metadata to 2026-10-12; no historical decision dates were changed.
- Bounded search found no other stale current Parent status in `PRODUCT.md`, `docs/CONTEXT.md`, the canonical requirements, or current reporting implementation comments. Dated phase records were preserved as historical evidence.
- Page Context had rejected malformed, mixed, out-of-group, and paginated Parent locators before the report service without recording a denied audit event. Those rejections now record the existing bounded `denied` event with a non-enumerating reason; reporting authorization and scope were not changed.
- Direct OWNER XLSX success responses already used `private, no-store`, while its JSON error responses did not. Error and validation responses now use the same cache controls; workbook and authorization behavior were not changed.
- No Direct OWNER or Global ADMIN authorization, data predicate, projection, or workbook content was changed.

## Residual open requirements

- Parent-selected Child export.
- Parent Patient-level, clinical, and individual Program detail.
- Effective-dated historical Parent attribution and any associated historical disclosure rule.
- Audit readership, retention, and broader governance.
- Global ADMIN onward distribution recipient/data/process.
- Optional Network and Global aggregation.

## Final disposition

**RPT-CLOSE-01 — PASS / INITIAL REPORTING MVP AUTOMATED RE-AUDIT COMPLETE**

This disposition closes the currently confirmed automated Reporting MVP scope. It does not claim production deployment, manual browser/mobile UAT, external privacy/legal approval, or approval of unresolved reporting requirements.
