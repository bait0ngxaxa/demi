# Pending action indicators

Indicators are a projection of current business queues, not notifications. Opening a page is read-only and does not clear an indicator. No notification storage, read state, history, subscription, worker, migration or external service is added.

## Verified action-source matrix

| Actor / authority | Business predicate | Existing destination | Authority / query evidence |
| --- | --- | --- | --- |
| Platform ADMIN | `HospitalOnboardingApplication.status = PENDING` | `/app/admin/hospital-onboarding` | `hospital-onboarding-policy.ts`, `listPendingHospitalOnboardingApplications` |
| Platform ADMIN | `SupportReport.status = NEW` | `/app/admin/support?status=NEW` | `listAdminSupportReports`, `assertPlatformAdminInDatabase` |
| Direct ACTIVE Hospital OWNER or MEMBER, ACTIVE Hospital | `PatientServiceRequest.status = PENDING`, non-ended Patient relationship | `/app/patients/service-requests?group=PENDING` | `decidePatientServiceRequestPolicy`, `hospitalOperatedByWhere`, `listHospitalPatientServiceRequests` |
| Direct Hospital operator with the same authority | Appointment with any PENDING reschedule or cancellation request, visible active Patient relationship and PATIENT role | `/app/appointments?tab=PENDING_REQUESTS&hospitalId=…` | `buildAppointmentWhere`, `appointmentRelationshipReadWhere`, `listWorkAppointments` |
| Current ACTIVE OSM in ACTIVE Hospital | Assigned to this OSM, future SCHEDULED appointment, non-ended Patient relationship with PATIENT role, no acceptance or pending reschedule request for the current appointment version | `/app/appointments?tab=AWAITING_MY_ACCEPTANCE&hospitalId=…` | Shared `awaitingOsmAcceptanceQuery`, existing acceptance queue and `countWorkAppointmentsAwaitingMyAcceptance` |

The Hospital appointment queue retains its existing stale-request semantics. It counts appointments once even when both request types exist. Network read access alone does not confer review authority. ADMIN exits through its two platform queues and never inherits Hospital queues, including on a mixed-role account. Personal PATIENT/CAREGIVER roles receive no additional indicators.

## Scope, privacy and query costs

`calculatePendingActions` accepts only the server-authenticated user ID. It re-resolves the persisted active actor through the existing recovery-aware actor store and applies existing capability and relationship predicates. Counts carry no Patient identity or medical details. Navigation decorates only items already admitted by the existing policies; destination pages and mutations retain authoritative authorization.

Counts cover every authorized direct Hospital. The service-request list already covers those Hospitals together. Appointment lists are Hospital-specific: the navigation's accessible label describes the aggregate scope, the link selects a Hospital with pending work, and the existing Hospital selector reaches the other authorized queues. The count is not the current page size. Rows receive a dot only for the viewer's action, including an OSM's own assignment rather than another OSM's appointment they can read.

The request-local React cache deduplicates the layout and More page for the same user; no results persist between requests. One actor read is followed by independent aggregates: two for ADMIN; one service-request count plus one appointment count per authorized direct Hospital for Hospital operators; one SQL aggregate grouped by Hospital for OSM. Queue size does not determine the number of queries or returned IDs. The OSM counter no longer loads all appointment IDs. The existing destination-list implementation itself is otherwise unchanged.

Authorization errors propagate. Unexpected database failures are logged through the existing sanitized error reporter and propagate as InfrastructureError to the existing error boundary; they are never presented as a successful empty queue.

## Presentation and consistency

Desktop expanded/collapsed navigation, mobile tabs, More and review rows share `ActionRequiredDot`. Zero counts produce no dot or zero badge. Thai accessible labels describe the action. The solid token-based dot uses a decorative pulse only under `prefers-reduced-motion: no-preference`; reduced motion disables animation. The generic legacy `badgeCount` adapter has neutral action wording and remains supported; production OSM navigation now leads directly to the actionable appointment queue.

Successful appointment, reschedule-request, patient-service-request, onboarding-review and support-report Server Actions revalidate `/app` as a layout alongside existing destination paths. Existing mutation conflict/idempotency/transaction rules are unchanged. Service-request conflicts also revalidate current data. A client return-to-window listener calls `router.refresh()` on focus/visibility restoration, at most once per 30 seconds, skipping in-flight/unknown-outcome form guards. It has no timer, polling, WebSocket or local optimistic decrement. An idle, continuously focused screen may remain unchanged until a mutation, navigation that reloads server data, or a later focus refresh; this is intentional without mandatory realtime.

## Verification

Focused tests cover source selection, OWNER/MEMBER authority, duplicate Hospital scopes, ADMIN separation, errors, aggregate-only OSM counts, navigation/More parity, zero hiding, reduced-motion classes, return-to-window refresh, mutation revalidation, PostgreSQL cross-Hospital isolation, membership revocation, Hospital suspension, viewing without clearing, persisted completion and versioned OSM acceptance. Existing appointment and mutation tests remain regression coverage. Full unit, full PostgreSQL integration and production build are delegated to hosted CI.

Local execution on this implementation:

- `npm run prisma:generate`: passed.
- Targeted ESLint over every changed TypeScript/TSX file: passed.
- `npm run lint:find-many`: passed, no new unbounded reads.
- `npm run typecheck`: passed.
- The following focused unit/component command: **35 files, 411 tests passed**.

```powershell
npm run test -- src/components/app-shell src/components/legal/legal-ui.test.tsx src/modules/pending-actions src/modules/appointments/services/work-appointment-projection.test.ts src/modules/appointments/services/work-appointment-count.test.ts src/modules/appointments/transport src/modules/patient-service-requests/transport/server-actions.test.ts src/modules/hospital-onboarding/transport/server-actions.test.ts src/modules/support/transport/server-actions.test.ts app/app/more/page.test.tsx app/app/admin/support app/app/admin/hospital-onboarding app/app/appointments/appointment-assignee-surfaces.test.tsx app/app/appointments/service-source-surfaces.test.tsx app/app/patients/service-requests/hospital-service-requests-workspace.test.tsx app/app/patients/service-requests/hospital-service-request-dialogs.test.tsx
```

- `npm run test:db:up` → `npm run test:integration:focused -- tests/integration/pending-actions.integration.test.ts` → `npm run test:db:down` in a shell `finally`: **5 tests passed**, cleanup passed. The focused runner validated disposable database identity and applied existing migrations. No shared or production database was used.
- CI follow-up: the login-flow fixture initially lacked the new layout dependency mock; the appointment integration projection assertion initially omitted the intentional `canAcceptAssignment` boolean. Assertions were updated at those seams while retaining the complete field/privacy allowlist and authorization/error assertions. Focused login/service/More tests: **22 passed**. `npm run test:integration:focused -- tests/integration/appointments.integration.test.ts`: **38 passed**, with process-only `DEMI_LINE_FLEX_MESSAGES_ENABLED=false` matching the existing text-push mocks and CI default; the prior environment-sensitive run failed LINE delivery mocks when local Flex configuration selected a different path. No LINE production code or persisted configuration changed, no tests were skipped, and the disposable database was cleaned up. Hosted CI results and original failures are recorded on the PR.

Browser visual QA was attempted using static markup from actual components and compiled project CSS. The connected browser inventory was empty, so rendered screenshots and browser-level reduced-motion execution could not be verified locally. Temporary visual fixtures and the local fixture server were removed. Automated markup tests verify the motion variants; they do not claim browser/E2E or screen-reader execution.
