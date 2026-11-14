# Numeric pagination audit

## Scope and contract

Audited the current shared pagination consumers and searched application TSX for `totalPages`, `hasNextPage`, `nextCursor`, `previousCursor`, and Thai previous/next controls. This change is presentation only. No database schema, backend pagination contract, authorization, Hospital/Patient scope, environment configuration, or production data changes.

`PageNumberPagination` retains `label`, `page`, `totalPages`, `previous`, `next`, and `className`. Optional `getPageTarget(page)` resolves `{ href, disabled? }`, `{ onSelect, disabled? }`, or `null`. Previous/next props may be omitted to use the resolver; explicit `null` remains disabled. No resolver preserves the previous/next-only API. Keep this module free of a `use client` directive: server consumers resolve URLs during rendering, while client consumers import it into their existing client graph. A resolver must not be passed across a Server/Client Component boundary.

The pure UI token helper normalizes invalid inputs and clamps display positions without modifying the data-layer resolver. It generates at most nine tokens, always includes first/current/last, fills single-page gaps, and uses non-interactive ellipses. Desktop uses two neighbors on each side; mobile uses a compact current-page window (all numbers for up to five pages). CSS hides the inactive responsive list, including from the accessibility tree. Controls wrap, use semantic tokens, have 44px minimum dimensions, and retain Thai labels. The current page has an underline as well as color/border and `aria-current="page"`. Client controls preserve the focused numeric button when it becomes current. URL links use `prefetch={false}` to avoid fetching every numbered destination automatically. Zero/one-page results render no controls.

## Surfaces that gained numeric navigation

| Surface / implementation | Verified data access | State retained through existing builder |
| --- | --- | --- |
| Patients — `app/app/patients/patient-directory-view.tsx` | `findPatientDirectory`: count + bounded skip/take, clamped page | Hospital, lookup type/value, classification, self-registration |
| Hospital network — `app/app/admin/hospitals/hospital-network-directory.tsx` | `listHospitalNetworkDirectoryForAdmin`: `resolvePagePosition` + bounded skip/take | Directory filter, search, placement |
| Pending applications — `app/app/admin/hospital-onboarding/page.tsx` | `listPendingHospitalOnboardingApplications`: `resolvePagePosition` + bounded skip/take | Pending list context; clean page-one URL |
| Bulk Patient/OSM assignment — `app/app/patients/assign-osm/patient-osm-bulk-assignment-workspace.tsx` | `patient-osm-assignment-query-service`: counted, bounded page queries | Hospital and search; existing Hospital-keyed workspace preserves cross-page selections |
| Assignee pickers — `src/components/assignee/assignee-search-picker.tsx` | Existing paged assignee search actions, including appointment and Patient assignment services | Query, Hospital/excluded person, selected person independent of result page |
| Assigned Patients — `app/app/patients/assigned/assigned-patient-directory-view.tsx` | `findAssignedPatientDirectory`: count + bounded skip/take, clamped page | Hospital filter, lookup/value, classification, screening task |
| Care tracking — `app/app/services/care-tracking-workspace-view.tsx` | `care-tracking-query-service`: counted SQL page window, clamped requested page | Hospital/Child scope, stages, signals, search, ended filter |
| Appointment Patient picker — `app/app/appointments/new/patient-picker-view.tsx` | Existing `findPatientDirectory` / `findAssignedPatientDirectory` depending on authorized scope | Hospital, lookup type/value; existing Patient return link |
| Workforce OSM assigned Patients — `app/app/workforce/[kind]/[relationshipId]/workforce-osm-assigned-patients-section.tsx` | `findPatientsAssignedToOsmInHospital`: count + bounded skip/take | Exact OSM relationship; existing `patientsPage` query convention |

Search/filter GET forms and existing reset behavior were retained. Assignee navigation is disabled while the current request is unanswered; the existing latest-request gate ignores stale responses. Selection remains independent of visible results. No full-list fetching or local slicing was added.

## Cursor-only surfaces intentionally unchanged

| Implementation | Why numeric targets were excluded |
| --- | --- |
| `app/app/workforce/workforce-workspace.tsx` | Independent staff/OSM continuation cursors; service uses createdAt/id keyset predicates |
| `app/app/workforce/workforce-import-workspace.tsx` | Same staff/OSM continuation contract |
| `app/app/users/users-directory.tsx` | Hospital/kind/filter-bound cursor; user directory uses createdAt/id keyset predicates |
| `app/app/patients/service-requests/hospital-service-requests-workspace.tsx` | Group-specific continuation; service orders by a complete cursor tuple including null-date tail |
| `app/app/hospitals/reporting/hospital-report-workspace.tsx` | Signed, context-bound previous/next cursors; displayed page number is not a random-access contract |
| `app/app/appointments/work-appointment-view.tsx` | Context-bound cursor decoding and bounded keyset queries |
| `app/app/admin/support/page.tsx`, `app/app/support/reports/page.tsx` | Older-report continuation only |
| `app/app/family/appointment-sharing-workspace.tsx` | Separate Patient/caregiver grant cursors |
| `app/app/hospitals/content/page.tsx`, `app/app/hospitals/knowledge/hospital-content-list-workspace.tsx` | Content continuation cursors |
| `app/app/personal/knowledge/patient-content-feed.tsx` | Feed/category/context continuation cursor |
| `app/app/personal/medications/personal-medication-workspace.tsx` | Independent active/stopped continuation cursors |
| `app/app/personal/measurements/patient-self-measurement-workspace.tsx`, `app/app/patients/[relationshipId]/patient-self-measurement-section.tsx` | Measurement-history continuation cursors |
| `app/app/personal/appointments/personal-appointment-hub.tsx` | Self/family appointment continuation cursors |
| `app/app/personal/wellness/personal-meal-workspace.tsx`, `app/app/personal/wellness/personal-exercise-workspace.tsx` | Bounded cursor-based append actions |
| `app/app/patients/[relationshipId]/programs/[programId]/report/program-report-view.tsx` | Independent goal/followup evidence cursors |

These contracts do not expose arbitrary page access. No cursor simulation, signature changes, query widening, or all-record counting/fetching was introduced. Future numeric navigation requires its own data-access and performance design.

## Verification boundaries

Focused component/consumer/service tests cover numeric targets, context preservation, filter resets, server page clamping, authorization scope, selection persistence, stale responses, pending controls, and existing cursor flows. Existing assertions remain intact; the care-tracking previous/next test now selects `rel="prev"` / `rel="next"` instead of assuming they are the first two anchors.

A synthetic fixture was rendered with the real component and compiled project Tailwind CSS outside the repository. Visual inspection could not run: Computer Use returned `Browser is not available: iab` and an empty browser inventory. Mobile overflow, rendered contrast, and browser keyboard/zoom behavior still require visual QA at 320/390px and desktop. Component assertions establish responsive classes and focus behavior, not full WCAG conformance or E2E/UAT coverage. The temporary fixture test was removed.

Exact command results, commit inventory and the latest GitHub CI evidence are recorded in the PR. Hosted Code Quality, Unit Tests, Full PostgreSQL integration and Production Build must all pass for the latest HEAD before readiness. No deployment or automatic merge is part of this work.

## Local execution evidence

- `npm run prisma:generate` — passed (generated client under node_modules; no schema/migration change).
- Targeted `npx eslint` on every changed TS/TSX file — passed.
- `npm run typecheck` — passed after final implementation changes.
- `git diff --check` — passed.
- `npm run build` — passed, Next.js 16.4.5; compile, TypeScript, page collection and static generation completed. Run once because the task explicitly requested a local production build where supported.
- Final focused regression command below — **22 files / 290 tests passed**. The user-directory service filter matched no test file; cursor regressions exercised workforce, appointments, Hospital requests and reports. Full unit/PostgreSQL regression is delegated to hosted CI; no local database environment was started.

```powershell
npm run test -- src/components/ui/page-number-pagination.test.tsx src/components/assignee/assignee-search-picker.test.tsx src/components/search/server-search-paging.test.ts app/app/patients/patient-directory-view.test.tsx app/app/admin/hospitals/hospital-network-directory.test.tsx app/app/admin/hospital-onboarding/pagination.test.tsx app/app/patients/assign-osm/patient-osm-bulk-assignment-feedback.test.tsx app/app/patients/assigned/assigned-patient-directory-view.test.tsx app/app/services/care-tracking-workspace-view.test.tsx app/app/appointments/new/patient-picker-view.test.tsx 'app/app/workforce/[kind]/[relationshipId]/workforce-osm-assigned-patients-section.test.tsx' src/modules/patient-directory/services/patient-directory-query-service.test.ts src/modules/patient-directory/services/patient-assigned-directory-query-service.test.ts src/modules/patient-directory/transport/patient-directory-page.test.ts src/modules/patient-directory/transport/assigned-patient-directory-page.test.ts src/modules/patient-assignment/services/patient-osm-bulk-assignment-query-service.test.ts src/modules/patient-assignment/transport/bulk-assignment-page.test.ts app/app/workforce/workforce-workspace.test.tsx app/app/patients/service-requests/hospital-service-requests-workspace.test.tsx app/app/hospitals/reporting/hospital-report-workspace.test.tsx app/app/appointments/page.test.tsx src/modules/user-management/services/user-directory-service.test.ts src/modules/patient-service-requests/services/hospital-service-request-list.test.ts
```

During migration, focused tests caught leftover JSX and an ordinal anchor selector. Both were corrected; the final run above includes their regression coverage. A new bulk target assertion initially used `search` instead of the existing `value` parameter; the assertion was corrected to the verified URL contract without changing production behavior.
