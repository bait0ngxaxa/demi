# Phase 17J.4B — Appointment LINE Notification Implementation

- **Owner decisions:** J4A-OD01–OD10, Cutover Safety, and Honest Idempotency are approved for isolated synthetic/demo implementation in the [owner closeout](./PHASE_17J4A_OWNER_DECISION_CLOSEOUT.md).
- **Runtime state:** **Phase 17J.4B — IMPLEMENTED / AUTOMATED VERIFICATION COMPLETE** for the approved synthetic/demo scope. Focused unit and PostgreSQL integration tests pass. This does not complete or approve overall Phase 17J.4, close P17D-NOTIF-01, or establish real-provider/device UAT.
- **Activation:** `DEMI_LINE_APPOINTMENT_NOTIFICATIONS_ENABLED` defaults to `false`; no deployed flag, environment, LINE resource, or scheduler was changed.
- **Provider boundary:** Push is injectable and no real LINE API request was made.
- **No real Patient data, real-provider UAT, production readiness, or delivery is claimed.**

## Delivered bounded runtime

### Canonical source transitions and transactional outbox

`createAppointment`, an actual scheduled date/time change in `rescheduleAppointment`, and the canonical `SCHEDULED → CANCELLED` transition in `cancelAppointment` write their intent through `appointment-service.ts` and `appointment-line-notification-outbox-service.ts` in the same serializable transaction as the appointment state and its existing audit event. Hospital approval calls that same canonical cancellation path; approval does not create a second request-decision notification. No intent is created for acknowledgement, request submission/rejection, completion, no-show, a no-op cancellation, or unchanged schedule fields.

Creation nonce replay returns before creating another intent. Reschedule uses the committed `updatedAt` source version, and database uniqueness is `(appointmentId, sourceUpdatedAt)`. Serializable retries roll back the losing transaction; an intent cannot survive without its source change. When the rollout is OFF or its generation is invalid, appointment changes proceed without creating an outbox row. If production is ever separately approved, every activation/cutover must supply a fresh `DEMI_LINE_APPOINTMENT_NOTIFICATIONS_GENERATION` UUID. The worker compares that generation on every claim/attempt/retry; an old-generation row is suppressed. Reusing a prior generation when re-enabling would defeat the cutover boundary and is not an approved operation.

When the rollout is ON, each canonical source version gets one due-now row. If the Patient was not eligible for explicit opt-in/current Patient/binding at source time, the row is terminally `SUPPRESSED` with a coarse reason and no recipient/binding identifiers. If opted in, the row captures the intended User ID, binding ID/lifecycle version, and preference version so a later identity or consent change cannot retarget it.

### Patient SELF preference

`LineAppointmentNotificationPreference` stores only the purpose-specific opt-in state, current binding generation, preference version, and timestamps. No row means OFF. The Patient SELF action uses the existing Supabase-authenticated `getProtectedApplicationActor`; the service rechecks active DEMI User, PATIENT role, Patient-Hospital relationship, and active Hospital. Enabling requires exactly one active LINE binding with a LINE subject. Preference writes lock the User before the binding, matching existing Link/Unlink transaction ordering. Opt-out increments the version and is audited with minimal metadata. Unlink makes the previous binding generation ineligible; a relink must explicitly opt in again.

The existing LINE Account page presents a purpose-specific Thai ON/OFF control, exact approved generic copy, link prerequisite, loading/error/success feedback, and no delivery promise. Non-Patient or unavailable sessions do not receive this control. LINE identity remains separate from DEMI authentication and authorization.

### Send-time authority and bounded delivery

`appointment-line-notification-delivery-service.ts` drains batches of at most 20. It claims due rows with `FOR UPDATE SKIP LOCKED`, a 30-second lease, and a unique lease token. It validates current appointment identity, exact relationship, exact source version and expected status, active Hospital, same active Patient User and PATIENT role, captured binding and lifecycle version, current opt-in/preference version, FRIEND reachability observed within 30 days, and current rollout generation. It performs another authority check after reserving a provider attempt. Provider I/O is outside database transactions; settlement is a short compare-and-set on the lease token.

The same stored LINE retry key and exact generic text are used for all attempts. There is one initial attempt and at most two retries after approximately one and four minutes, each with bounded ±10% jitter. LINE currently documents the Push retry-key validity window as 24 hours; this implementation stops retrying at 23 hours to leave a safety margin. It classifies 2xx as `PROVIDER_ACCEPTED`, 409 for the same retry key as `DUPLICATE_ACCEPTED`, 429 and 5xx as retryable HTTP failures, network timeout as ambiguous, and other 4xx as permanent. After the approved retry cap, known retryable HTTP responses settle as `PERMANENT_FAILURE / TRANSIENT_HTTP_FAILURE`; permanent provider rejection remains `PERMANENT_FAILURE / PERMANENT_HTTP_FAILURE`. An unresolved transport ambiguity remains `OUTCOME_UNKNOWN / AMBIGUOUS_TRANSPORT_FAILURE`, including when later retryable HTTP responses cannot resolve it. Reserving a provider attempt sets `PROCESS_OUTCOME_UNKNOWN` until settlement; an expired lease after an unsettled reservation carries that uncertainty into recovery instead of letting a later 429 erase it. LINE documents 429 for multiple rate-limit/quota cases, so this bounded application policy does not infer permanent quota exhaustion from the response body and does not parse or log it. LINE's generic retry guidance says not to retry 4xx; retrying 429 here follows the approved bounded application policy and is not a LINE delivery guarantee. Provider acceptance does not mean user-visible delivery. A crash or timeout after dispatch, or after reserving an attempt when dispatch outcome cannot be established, can leave an uncertain external outcome. No exactly-once HTTP, exactly-once visible delivery, or in-flight recall guarantee is made. See the [Phase 17J.5A integrated re-audit](./PHASE_17J5A_LINE_INTEGRATION_REAUDIT_UAT_READINESS.md) for latest outcome and current-HEAD verification evidence. Sources: [LINE retrying API requests](https://developers.line.biz/en/docs/messaging-api/retrying-api-request/), [LINE Messaging API reference](https://developers.line.biz/en/reference/messaging-api/nojs/), and [LINE monthly-limit FAQ](https://developers.line.biz/en/faq/).

The internal POST drain route requires an HMAC signature over method/path/timestamp/nonce, a minimum-length server secret, a ±60-second clock window, and a monotonic persisted invocation timestamp. It accepts no body and returns only aggregate counts or safe errors. No Vercel cron or other scheduler is configured. The terminal-row purge service only deletes up to 100 terminal rows older than 30 days when explicitly invoked; it is not scheduled and was not run.

## Persistence

The additive migration `prisma/migrations/20261009120000_appointment_line_notifications/migration.sql` adds the purpose-specific preference, durable outbox, worker invocation singleton, enum values, uniqueness/FK/index/check constraints, and RLS enablement. Operational rows contain no access token, rendered message, LINE user subject, medical payload, appointment content, or unnecessary personal data. The disposable PostgreSQL target reported 42 migrations with no pending migrations, and the focused integration tests exercised the new schema. No shared or production database was migrated.

## Verification evidence

The 7-file / 77-test and 1-file / 19-test counts below are the implementation handoff-time evidence. Latest-HEAD cross-slice evidence after the 429 settlement correction is recorded in [Phase 17J.5A](./PHASE_17J5A_LINE_INTEGRATION_REAUDIT_UAT_READINESS.md).

Passed:

- `npm run prisma:generate`
- `npx prisma validate`
- `npm run typecheck`
- `npm run test -- src/modules/appointments/domain/appointment-line-notifications.test.ts src/modules/appointments/services/appointment-line-notification-preference-service.test.ts src/modules/appointments/transport/appointment-line-notification-actions.test.ts src/modules/appointments/services/appointment-service.test.ts src/modules/line/adapters/line-messaging-client.test.ts app/line/account/page.test.tsx app/line/account/line-account-client.test.tsx` — **7 files / 77 tests passed**, using fake provider responses only.
- `npm run test:integration:focused -- tests/integration/appointments.integration.test.ts` — **1 file / 19 tests passed** against the repository’s disposable PostgreSQL target, using synthetic fixtures and a fake Push dependency.

Earlier connection attempts failed with `P1001` before test discovery. After connectivity became available, the first integration run exposed an overlong synthetic Hospital code in five cases; the fixture was shortened, and the final run connected, found no pending migrations, and passed all 19 tests.

Not run:

- No full test suite, Next.js build, dev server, live LINE call, provider/device UAT, deployment, or environment mutation was performed.

Also passed: targeted ESLint, Impeccable UI mechanical detection, strict UTF-8 scan, `git diff --check`, and static Prisma migration/schema consistency review.

## Acceptance state

| Criterion | Current evidence |
| --- | --- |
| Approved three appointment events and same-transaction outbox; no disabled-period replay | Implemented; focused PostgreSQL integration passed, including event selection, rollback, nonce replay, and cutover cases. |
| Patient SELF opt-in, current identity/relationship, binding generation, and opt-out/unlink revalidation | Authenticated preference service/UI and send-time checks are implemented; unit and PostgreSQL identity/race tests passed. |
| Default-OFF gate, fresh-generation cutover, bounded lease/retry, and honest provider outcome | Implemented; policy/adapter unit tests and PostgreSQL cutover/fencing tests passed. |
| No real Push, real Patient data, deployed activation, or production release | Preserved. All provider tests inject fake fetch/provider dependencies; no environment or deployment mutation was made. |
| Phase 17J.4B automated verification complete | **SATISFIED** for the approved synthetic/demo slice. Overall Phase 17J.4 and P17D-NOTIF-01 remain open. |
| Real-provider/device UAT and production/privacy readiness | **Not executed / not authorized by this task.** These remain separate gates after automated re-audit readiness. |

## Required focused PostgreSQL matrix

The checked-in integration cases use the repository’s synthetic fixture factory and ran only against its disposable PostgreSQL target. All 19 tests passed. They cover canonical event selection and Hospital-approved cancellation; nonce replay; OFF-period silence, generation cutover, and a concurrent cutover with one request already in flight; invalid outbox insertion rollback; source-event uniqueness; exact retry-key/payload reuse and provider acceptance semantics; stale source suppression; Patient identity replacement and inactive-Hospital suppression; opt-out and unlink/relink invalidation, including changes made while a provider attempt is in flight; competing claims, expired leases, and stale-worker fencing. Existing appointment integration cases continue to cover versioned reschedule, Patient/Hospital scope, and competing appointment transitions.

## Deferred and separately gated

- No scheduler is installed or activated; no deployed feature flag or generation is set.
- No real Patient data, LINE Push, LINE resource/authorization mutation, real-provider/device UAT, external privacy approval, production deployment, or production readiness is claimed.
- Full LINE Disconnection/Recovery, MINI App/Gateway, medication reminders, follow-up reminders without a due-event contract, cancellation request notices, other recipient roles, Family/Caregiver access, generic notifications, generic chatbot/conversation, and broad consent remain separate backlog items.
- The LINE retry-key contract does not guarantee a visible message. A process crash after dispatch can leave an uncertain external result; a provider request already in flight cannot be recalled.

## Next phase

With the bounded implementation’s focused PostgreSQL integration, unit tests, typecheck, targeted lint, and diff review passed, the next roadmap slice is **Phase 17J.5A — Automated Integrated Re-audit / UAT Readiness**. Keep any real-device/provider UAT as a separate later gate requiring explicit authorization and external privacy/governance review. Overall Phase 17J.4, P17D-NOTIF-01, and Phase 17J as a whole remain open.
