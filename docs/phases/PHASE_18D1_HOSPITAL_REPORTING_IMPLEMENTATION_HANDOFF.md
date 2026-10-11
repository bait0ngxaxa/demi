# Phase 18D.1 — Hospital Reporting Implementation Handoff

**Status:** Runtime implemented for explicitly enabled synthetic/demo use. Production exposure remains separately controlled. No real Patient records were queried and no production rollout was performed.

## Delivery

- Starting HEAD: `3806bc541e584c3695e7e57d0ff0fd3ec0bb79a4` on `main`; starting worktree was clean.
- Ending HEAD: `3806bc541e584c3695e7e57d0ff0fd3ec0bb79a4`; no commit or PR was created.
- Dashboard route: `/app/hospitals/reporting` — Thai-first `Dashboard ภาพรวม` and `รายงานการจัดบริการ` views, responsive Program cards, summary counts by relationship/Program grain, source-gap states, exact Program links, paging, Hospital selector, loading/error states, and export progress/error feedback.
- Export endpoint: `GET /api/v1/hospital/reporting/export?hospitalId=<uuid>` — on-demand XLSX, private/no-store response, safe error handling, and bounded-size failure (`413`). Workbook generation uses the same reporting dataset and projection as the Dashboard.
- Runtime code is under `src/modules/reporting/{policies,schemas,projections,services,transport}`, with the page and endpoint under `app/app/hospitals/reporting` and `app/api/v1/hospital/reporting/export`.

The export workbook contains exactly `Dashboard ภาพรวม` and `รายงานการจัดบริการ`. To retain every persisted Follow-up while keeping the two-sheet limit, Programs continue onto deterministic additional rows when they exceed the template's six Dashboard or four Service Process slots. The Service Process sheet also appends a normalized Goal Plan/activity-progress detail table. This is the layout difference from the customer sample; the business worksheets and original headings remain intact.

## Access, consistency, and release control

Reporting uses three distinct capabilities: `hospital:report:dashboard:read`, `hospital:report:row:read`, and `hospital:report:export`. Server-side access requires an ACTIVE `Role.HOSPITAL` user, direct ACTIVE OWNER membership in the exact ACTIVE Hospital, and no parent/child inheritance. MEMBER, OSM, PATIENT, ADMIN-only, other-Hospital OWNER, inactive user/membership/Hospital, and related-Hospital-only scopes are denied. Page and export requests resolve current database authority; export checks again after workbook generation. Unauthorized resource responses are deliberately generic.

The export source set, counts, and linked records are collected in one bounded PostgreSQL `RepeatableRead` transaction, then rendered after the read transaction. The response timestamp is generated after rendering; neither it nor request time is presented as `dataAsOf`. A minimized `hospital_reporting.export.prepared` audit event records actor, Hospital resource, capability, Program count, preparation time, and prepared outcome; it contains no Patient identifiers or clinical values. Audit failure prevents file release.

`DEMI_HOSPITAL_REPORTING_ENABLED` is an explicit server-side opt-in. `.env.example` keeps it `false`; production also requires `DEMI_HOSPITAL_REPORTING_PRODUCTION_APPROVED=true`. Synthetic local verification enables the feature in the test process only. This handoff does not authorize enabling either switch for production Patient data.

## Workbook field coverage

| Worksheet | Source-backed values shown | Unavailable or qualified values |
| --- | --- | --- |
| `Dashboard ภาพรวม` | Hospital identity; Patient name and Hospital-local ID; current relationship OSM assignment; Program start/status/completion date; Baseline and Final Assessment DTX, weight, waist, blood pressure, and Baseline height; all Follow-up DTX and weight values, including recorded zero. | DM/Pre-DM totals have no accepted classification mapping or denominator; illness duration and CVD Risk have no source; BMI and achievement scores have no approved formula; Baseline HbA1c has source data but its context/unit are unapproved; missing Baseline/Follow-up/Final records are labeled and not treated as zero or failure. OSM is labeled as the current assignment, not historical attribution. |
| `รายงานการจัดบริการ` | Patient/Hospital context; Before/After measurements; Service 1 record presence; exact-Program Goal Plans and targets; Follow-up dates, measurements, and recorded activity-progress statuses; all Goal Plan and activity-progress detail within export bounds. | PAM/PROM and weekly exercise are not Program-scoped; Final Assessment has no HbA1c or height; CVD Risk and structured outcome/plan-adjustment/obstacle sources are absent; achievement-day/rate/>70% formulas are unapproved; Baseline confidence score semantics are unapproved. A record's presence/status does not claim service delivery or treatment success. |

The DTO distinguishes `RECORDED` (including numeric zero), `NOT_RECORDED`, `UNAVAILABLE`, and missing records. A relationship without a Program contributes to relationship counts but does not get a fabricated Program row. The Dashboard paginates 20 Programs by default (maximum 50) and previews up to six Follow-ups and three Goal Plans per Program with totals and a link to the existing exact-Program report. Excel retains all source rows up to 1,000 Programs, 10,000 Follow-ups, 5,000 Goal Plans, 50,000 activity-progress records, and 20,000 Goal Plan items; an oversized export fails rather than truncating.

## Verification

- `npm run test -- src/modules/reporting/policies/hospital-report-policy.test.ts src/modules/reporting/services/hospital-report-access-service.test.ts src/modules/reporting/services/hospital-report-query-service.test.ts src/modules/reporting/services/hospital-report-release-control.test.ts src/modules/reporting/services/hospital-report-workbook-service.test.ts src/modules/reporting/schemas/hospital-report-schemas.test.ts src/modules/reporting/transport/hospital-report-page-context.test.ts app/api/v1/hospital/reporting/export/route.test.ts app/app/hospitals/reporting/hospital-report-workspace.test.tsx src/components/app-shell/application-navigation.test.ts` — **10 files, 63 tests passed**.
- `npm run test:integration:focused -- tests/integration/hospital-reporting.integration.test.ts` — **1 file, 2 tests passed** against local synthetic PostgreSQL `demi_test`; verified exact-Hospital denials, revocation, exact-Program regression, pagination, zero/missing distinction, seven Follow-ups, audit minimization, and a concurrent insert isolated by the RepeatableRead snapshot.
- `npm run typecheck` — passed.
- `npm run lint` — passed with no warnings after cleanup.
- Impeccable detector on the Hospital reporting page — returned no findings.
- `npm run build` — passed; Next listed both reporting routes as dynamic and the export route trace included `docs/Dashboard App Demi.xlsx`.
- The full repository test suite was not run; this change used focused feature and integration verification.

## Phase 18D.2 reuse and remaining limits

Phase 18D.2 can reuse `HospitalReportProgramRow`, `HospitalReportingDataset`, the factual source projection, workbook renderer, bounds, and two-sheet layout. It must add its own Global Admin authorization and selected-Hospital query entry point; it must not widen the Hospital OWNER policy or treat `Role.ADMIN` as Hospital reporting authority. Global comparison and cross-Hospital aggregation are not implemented here.

Remaining source gaps are limited to the fields called out above; no clinical formulas, capture flows, schema columns, or migrations were added. The production release switch, real-data disclosure approval, and any new clinical definitions remain outside this implementation authorization.
