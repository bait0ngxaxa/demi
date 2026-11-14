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

The request-local React cache deduplicates the layout and More page for the same user; no results persist between requests. One actor read is followed by independent aggregates: two for ADMIN; one service-request count plus one appointment-request SQL aggregate grouped by Hospital for Hospital operators; one SQL aggregate grouped by Hospital for OSM. Queue size does not determine the number of queries or returned IDs. The OSM counter no longer loads all appointment IDs. The existing destination-list implementation itself is otherwise unchanged.

## Failure isolation contract

Indicators are optional UX and are not an availability dependency of the protected shell. `loadPendingActions` (request-cached as `getPendingActions`) returns an explicit result:

| Result | Meaning | Presentation |
| --- | --- | --- |
| `READY` + `indicators` | Counts calculated from the authoritative queues for the re-resolved actor | Dots and Thai accessible labels for nonzero counts only |
| `UNAVAILABLE` | `InfrastructureError` while re-reading the actor or counting (e.g. a temporary query failure) | No dots; one quiet `role="status"` note in the shell: “ไม่สามารถตรวจสอบงานที่รอดำเนินการได้ในขณะนี้ …”. Never rendered as zero |

Only `InfrastructureError` is isolated. `UnauthenticatedError` and `ForbiddenError` — a missing session, or an actor revoked/suspended between the shell's session check and the indicator re-read — propagate; the layout and More page route them through the same protected-access redirect as the actor check, so a revoked role never sees stale or empty indicators. Any other unexpected error still propagates to the existing error boundary. There is no unscoped fallback query and no cross-request cache, so nothing stale can leak across users or Hospitals. The original failure is logged once per error object through the existing sanitized reporter (`toInfrastructureError`); request-local `cache` means the layout and More page share one evaluation and one log line per request. No cross-request log throttling exists in the codebase, so a persistent outage logs once per request that renders the shell.

## Count query performance evidence

`countWorkAppointmentRequestsByHospital` replaces one Prisma `count` per authorized Hospital. Prisma `groupBy` cannot group appointments by their relationship's Hospital, so it is a parameterized `Prisma.sql` aggregate (`pendingRequestCountByHospitalQuery`) that expresses the same predicate as the direct-read `PENDING_REQUESTS` queue (`buildAppointmentWhere` with a direct scope and no filters): ACTIVE Hospital in the requested IDs, non-ended relationship, a PATIENT-role patient, an ACTIVE OWNER/MEMBER membership of an ACTIVE `HOSPITAL` user (the actor), and any PENDING reschedule or cancellation request. Rows are appointments and the membership, patient and request conditions are `EXISTS`, so an appointment with both request types counts once. Hospital IDs and the actor ID are bound parameters; no identifier is interpolated. The function still rejects ADMIN and any Hospital not in the actor's ACTIVE direct operator scope (`ForbiddenError`), returns `0` for scopes with no row, deduplicates repeated scope IDs, and returns at most one row per Hospital — never appointment IDs. The database already rejects a second membership row for the same user and Hospital (unique `userId, hospitalId`). Count/list parity is asserted by `tests/integration/pending-actions.integration.test.ts`, which pages through the destination queue (including a 27-item queue larger than one page), covers mixed OWNER/MEMBER, an idle Hospital, an ended relationship, a no-request appointment, both request types on one appointment, a foreign Hospital, a revoked membership and a suspended Hospital under a stale session context. No index or migration was added.

Local measurement on the disposable PostgreSQL container (temporary benchmark, not committed; one interactive transaction, so the previous `Promise.all` counts were serialized on one connection; 30 appointments per Hospital, 20 with a PENDING request; median of 25 runs after `ANALYZE`):

| Authorized Hospitals | Round trips before → after | Median latency before → after |
| --- | --- | --- |
| 1 | 1 → 1 | 3.90 ms → 1.61 ms |
| 5 | 5 → 1 | 17.69 ms → 2.15 ms |
| 10 | 10 → 1 | 35.93 ms → 2.39 ms |

`EXPLAIN (ANALYZE, BUFFERS)` for 10 Hospitals: `GroupAggregate` over a sort of 200 rows (25 kB in memory), hash semi-joins for the membership and patient-role conditions, `Hospital_pkey` index scans memoized by Hospital, hashed sub-plan for pending reschedules; 59 shared buffer hits, 1.28 ms execution. With this small fixture the planner prefers sequential scans on the small tables. Production-scale plans depend on table sizes and are not claimed here; the existing `PatientAppointmentRescheduleRequest/CancellationRequest(status, submittedAt)` and `(appointmentId, submittedAt)` indexes are available to the planner.

## Presentation and consistency

Desktop expanded/collapsed navigation, mobile tabs, More and review rows share `ActionRequiredDot`. Zero counts produce no dot or zero badge. Thai accessible labels describe the action. The solid token-based dot uses a decorative pulse only under `prefers-reduced-motion: no-preference`; reduced motion disables animation. The generic legacy `badgeCount` adapter has neutral action wording and remains supported; production OSM navigation now leads directly to the actionable appointment queue.

Successful appointment, reschedule-request, patient-service-request, onboarding-review and support-report Server Actions revalidate `/app` as a layout alongside existing destination paths. Existing mutation conflict/idempotency/transaction rules are unchanged. Service-request conflicts also revalidate current data. ## Refresh lifecycle semantics

Verified against the bundled Next.js 16 docs: shared layouts are not re-rendered on client navigation (partial rendering); `router.refresh()` re-renders all Server Components for the current route; a Server Action that revalidates `/app` as a layout returns the re-rendered layout with its response. React `cache` is request-local only.

The layout passes the result's `checkedAt` to `PendingActionRefresh`. Every server render of the shell — initial load, `router.refresh()`, Server Action revalidation — delivers a new value, which marks the indicators fresh on receipt. Client signals call `router.refresh()` only when the indicators are at least 30 seconds old (`PENDING_ACTION_REFRESH_INTERVAL_MS`):

| Signal | Behavior |
| --- | --- |
| Window focus / `visibilitychange` to visible | Refresh if stale; the two events for one return coalesce into one refresh |
| Client pathname change (search-param-only changes excluded) | Refresh if stale; recent data suppresses it |
| Successful relevant mutation | Its existing `/app` layout revalidation already delivers fresh data and resets the timer, so no extra refresh follows |

Guards: a ref-based in-flight flag and the freshness stamp (also set when a refresh starts, bounding retries if one fails) prevent duplicate or concurrent refreshes. A refresh cannot loop: it does not change the pathname and its result is fresh. Effects order freshness before pathname evaluation, so a revalidation and redirect in the same commit do not trigger a second request. Refresh is skipped while `#application-main-content` contains an unknown-outcome navigation guard or a disabled `aria-busy` submit button. Listeners are removed on unmount; Strict Mode effect replay does not issue extra refreshes. There is no `setInterval`, polling, WebSocket, Realtime, worker or local optimistic decrement.

Known limitation: an idle, continuously focused screen without navigation does not receive changes made in another user's session until the next eligible signal. This is not realtime delivery.

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
