# Phase LINE-QA.B2.2 — Patient Appointment MINI App Scoped Mutations and Transaction Safety

Date: 2026-10-18. Base branch `main`.

## 0. Phase status

**SCOPED MUTATIONS IMPLEMENTED / AUTOMATED + POSTGRESQL VERIFICATION COMPLETE / STAGED / DISABLED BY DEFAULT / NON-ISSUING.**

The status is limited to the following:

- No real LINE device, LIFF/MINI platform, Supabase Auth provider or deployed environment was used.
- All evidence is from unit tests, a disposable local PostgreSQL database and a local production build that received synthetic requests.
- Nothing mints `__Secure-DEMI_LINE_WORKFLOW`.
- B1 still ends eligible verification with `WORKFLOW_NOT_ACTIVATED`.
- B2.3 owns context issuance and the activation review.

## 1. Starting HEAD and resulting commit

- **Starting HEAD:** `0c0eafe3a9561b2f9edff11ed99645e9bc68d783`. LINE-QA.B2.1 was approved.
- **Resulting commit:** the commit that introduces this document, `feat(line): add disabled scoped Appointment mutations for MINI App`, made directly on top of `0c0eafe`.

## 2. Changed files

### New

- `app/line/workflow/appointments/acknowledge/route.ts` and `app/line/workflow/appointments/cancellation-request/route.ts`: the two fixed POST Route Handlers. Both use the Node.js runtime and `force-dynamic`.
- `src/modules/line/transport/workflow-scoped-interactions.ts`: the HTTP transport. It handles the gate, Origin, Content-Type, the bounded strict body, the cookie and the finite responses.
- `app/line/workflow/appointments/line-workflow-appointment-interactions.tsx`: the scoped client controls.
- `app/app/patients/[relationshipId]/appointments/reschedule-request-history.tsx`: read-only reschedule history (`RescheduleRequestDetails`, `RescheduleRequestHistory`).
- Tests:
  - `src/modules/appointments/services/appointment-interaction-precondition.test.ts`
  - `src/modules/line/services/line-workflow-scoped-interaction.test.ts`
  - `src/modules/line/transport/workflow-scoped-interactions.test.ts`
  - `app/line/workflow/appointments/line-workflow-appointment-interactions.test.tsx`
  - `tests/integration/line-workflow-scoped-mutation.integration.test.ts`

### Modified

- `src/modules/appointments/services/appointment-service.ts`:
  - Adds the precondition seam to the two Patient SELF entry points.
  - The retry classifier now reuses `isRetryableSerializableTransactionError`.
- `src/modules/appointments/services/appointment-reschedule-history-service.ts`: adds an optional `database` dependency.
- `src/modules/line/services/line-workflow-service.ts`:
  - Extracts the shared `openLineWorkflowScope` / `requireScopedAuthority`. The scoped-read behaviour is unchanged.
  - Adds the new `runLineWorkflowScopedInteraction`.
- `src/modules/line/transport/workflow-scoped-appointments.ts`: the detail loader also returns read-only reschedule history from the same snapshot.
- `src/modules/line/domain/line-workflow-routes.ts` and `proxy.ts`: the fixed handlers now admit POST only.
- `src/lib/auth/supabase-server.ts`: an `onResponseHeaders` collector.
- `src/modules/auth/services/exact-session-service.ts`: forwards the collector option.
- `src/modules/line/transport/account-http.ts`: the bounded reader is extracted as `readBoundedRequestText`. `readAccountJson` behaves identically.
- `app/line/workflow/appointments/[relationshipId]/[appointmentId]/page.tsx`: renders the scoped controls and the read-only reschedule history.
- `app/app/personal/patient-self-appointment-content.tsx`: removes the now-unused B2.1 `PatientAppointmentInteractionSummary`.
- `app/app/patients/[relationshipId]/appointments/reschedule-request-section.tsx`: composes `RescheduleRequestDetails`. The markup is unchanged.
- Updated tests:
  - `scoped-pages.test.tsx`
  - `line-workflow-routes.test.ts`
  - `line-workflow-proxy.test.ts`
  - `workflow-scoped-appointments.test.ts`
- Docs:
  - `docs/CONTEXT.md`
  - B2.1 handoff (wording correction, section 14).

There is no schema change, no migration, no new dependency and no environment, Rich Menu or provider change.

## 3. Fixed POST route contract

| Path | Method | Body (strict, existing domain schema) | Success body |
| --- | --- | --- | --- |
| `/line/workflow/appointments/acknowledge` | POST only | `appointmentAcknowledgementRequestSchema`: `patientHospitalRelationshipId`, `appointmentId`, `expectedUpdatedAt` | `{"status":"SUCCESS","operation":"ACKNOWLEDGED"}` |
| `/line/workflow/appointments/cancellation-request` | POST only | `appointmentCancellationRequestSchema`: the fields above plus `submissionNonce` | `{"status":"SUCCESS","operation":"CANCELLATION_REQUESTED"}` |

The handler applies its checks in this order. Each check is enforced by the handler itself, independently of the proxy.

1. **Default-disabled gate.** Failure returns 503 `NOT_ACTIVATED`.
2. **Trusted MINI tuple.**
3. **Exact canonical Origin.** The Origin must equal the configured HTTPS origin. A missing, `null`, malformed, foreign, other-scheme or trailing-slash Origin returns 403 `ORIGIN_DENIED`.
4. **No `Next-Action` header.**
5. **Content-Type is `application/json`.**
6. **Bounded body.** A streamed 2 KiB cap with fatal UTF-8 decoding.
7. **Strict JSON object.** No arrays. Duplicate keys, including escaped spellings of the same key, are detected by comparing the number of top-level members. Unexpected fields are rejected by the `.strict()` schema. Failures in steps 4–7 return 400 `REQUEST_INVALID`.
8. **Workflow context** from the HttpOnly cookie only.
9. **Mandatory scoped runner.**

There is no generic command endpoint. The payload never carries a destination, identity, role, binding, session, version-of-binding or context. Responses carry no identifiers, versions, Patient data or raw errors.

Error codes are a finite set. Each row lists the code with its HTTP status:

- **Scope and authentication:**
  - `NOT_ACTIVATED` 503
  - `SCOPE_MISSING` 403 (also covers tampered, unknown-key and wrong-tuple contexts)
  - `SCOPE_EXPIRED` 403
  - `SCOPE_REVOKED` 403
  - `SESSION_MISMATCH` 403
  - `LOGIN_REQUIRED` 401
  - `AUTH_UNAVAILABLE` 503
  - `INELIGIBLE` 403
- **Resource:** `RESOURCE_INVALID` 404.
- **Domain:** `CONFLICT` 409.
- **Request:** `REQUEST_INVALID` 400 and `ORIGIN_DENIED` 403.
- **Infrastructure:** `TEMPORARILY_UNAVAILABLE` 503.

## 4. Appointment dependency seam (17J.3B §12.4)

`appointment-service.ts` defines the server-only contract:

```ts
type AppointmentInteractionPrecondition = (transaction: Prisma.TransactionClient, actor: ActorContext) => Promise<void>;
```

Only `acknowledgeOwnPatientAppointment` and `requestOwnPatientAppointmentCancellation` accept it, as `dependencies.beforeInteractionInTransaction`.

- The private implementations take it as an explicit parameter.
- The OSM-proxy entry points never forward it. A unit test confirms that a precondition smuggled into an OSM call never runs.
- It is `await`ed as the **first statement of every Serializable callback attempt**. That is before `resolveAppointmentAccessContext`, any Appointment read, the existing-acknowledgement return, the nonce replay return, the pending-request return, and any write or audit.

Ordinary Server Actions call the services without it. Their behaviour, audit metadata, idempotency, nonce rules and conflict normalization are unchanged.

The Appointment domain imports nothing from LINE. There is no nested transaction and no copied algorithm.

**Retry classifier.** The Appointment retry classifier now delegates to the existing `isRetryableSerializableTransactionError`. That is P2034, P2002, plus P2010 with SQLSTATE 40001, which is how Prisma 6 surfaces a serialization failure from a raw `FOR UPDATE`.

- The retry limit is unchanged at 2.
- The ordinary paths issue no raw queries, so this widens nothing for them.
- An exhausted retry still normalizes to the existing `ConflictError`.

## 5. Scoped authorization boundary

`runLineWorkflowScopedInteraction(credential, "ACKNOWLEDGE" | "CANCELLATION_REQUEST", input, deps)` maps a finite key to the existing service, and the runner itself supplies the precondition. A handler therefore cannot call an ordinary entry point or omit the guard.

**Outside any transaction** (`openLineWorkflowScope`, shared with scoped reads):

1. Activation gate.
2. Trusted tuple and keyring.
3. Mandatory context, with AES-GCM integrity, exact intent, tuple and absolute expiry.
4. Reviewed lifecycle tuple, including the B1 provider pairing.
5. Live Auth exact session. This is the only provider network call.
6. The session User must equal the context User.
7. The session HMAC must match under the context's key generation.
8. An early unlocked canonical actor and Patient SELF check, using the injected client.

Expired, missing, tampered and mismatched contexts stop here: no service call and no database lock. There is no renewal and no downgrade to ordinary Patient SELF authority.

## 6. Exact lock order (inside the Appointment Serializable callback)

1. `SELECT "id" FROM "User" WHERE "id" = $1::uuid FOR UPDATE`, using the verified context User ID.
2. `SELECT "id" FROM "LineAccountBinding" WHERE "id" = $1::uuid FOR UPDATE`, using the authenticated binding ID from the context.
3. Revalidation on the same transaction (`requireScopedAuthority`):
   - Absolute expiry, checked after the lock wait.
   - The binding exists, has the same owner, `unlinkedAt` is null, the LINE locator is present and `lifecycleVersion` equals the context.
   - The `id` + `authSubject` mapping holds.
   - The canonical actor is ACTIVE and not under credential-recovery quarantine. This runs through the transaction-backed actor store.
   - Persisted Patient SELF still holds.
   - The actor passed to the hook must be the context User.
4. The existing business operations run. `resolveAppointmentAccessContext` reloads authority on the same transaction.
5. Commit. Row locks are held until commit.

The values are passed as Prisma tagged-template parameters; unit tests assert the SQL text contains only placeholders. There is no network call, cookie write or external effect in the callback.

This matches the existing Unlink order: User → intent → binding.

## 7. Serializable retry and idempotency semantics

- **Every attempt reruns the full precondition.** That includes the locks and every revalidation.
- **Denials are reported as themselves.** The runner records the last attempt's `LineWorkflowFailure` and rethrows it. Without that, the service's foreign-error normalization would report it as an infrastructure error. A denial is never an idempotent success.
- **Retries are bounded by the existing limit.**
- **Idempotent replays are unchanged.** That covers the same version acknowledgement, the same nonce and the same pending version. Each still runs only after the precondition, so a replay after Unlink denies.

## 8. Concurrent Unlink / Relink evidence (PostgreSQL)

These tests use the real `createLineAccountIntent` and `unlinkLineAccount` services. Ordering is controlled by row locks held on independent pooled connections and by polling `pg_stat_activity` for lock waiters. No sleep is the ordering evidence. A `FOR UPDATE NOWAIT` probe returning 55P03 proves a row is held.

| Case | Setup | Observed |
| --- | --- | --- |
| A — Unlink commits first | Unlink completes, then the mutation runs | `SCOPE_REVOKED`. No acknowledgement, request, audit or version change. |
| A′ / C — stale snapshot | Unlink holds User and is paused at its intent lock. The mutation starts, so its snapshot begins, and waits on User. Unlink is then released. | The mutation's attempt 1 hits the changed binding row (40001) and is retried. Exactly **2** `$transaction` attempts are counted. Attempt 2 reacquires both locks on a fresh snapshot and denies `SCOPE_REVOKED`. No write. |
| Retry exhaustion | Same as A′ with `transactionRetries: 0` | The existing `ConflictError`. No write. |
| B — mutation locks first | The mutation is paused at its acknowledgement INSERT, after the precondition, by an Appointment `FOR UPDATE` blocker | NOWAIT probes confirm User and binding are both held. Unlink then waits (2 lock waiters). On release the mutation commits first, then Unlink commits. Order is `["mutation","unlink"]` and `acknowledgedAt ≤ unlinkedAt`. The next mutation denies. |
| D — Relink | Unlink, then reactivation with the generation incremented | The old context is denied `SCOPE_REVOKED`. A context for the new generation succeeds. |
| E — replay after Unlink | An existing acknowledgement and request, then Unlink, then replay of the same inputs | Both `SCOPE_REVOKED`. The row counts are unchanged. |
| Stress | 4 rounds of {ack, cancellation request, Unlink, ack} run concurrently | No deadlock (40P01) and only allowed outcomes. Every committed write precedes `unlinkedAt`, and audits equal writes. |
| Concurrent duplicates | 2 acknowledgements plus 2 same-nonce requests in parallel | They converge to one acknowledgement and one request with 2 audits. The retry path ran. |

## 9. UI reuse and transport strategy

The scoped detail page renders `LineWorkflowAppointmentInteractions`. This client component:

- Posts JSON only to `lineWorkflowAppointmentHandlers`, with `credentials: same-origin`, `redirect: error`, `no-referrer` and `no-store`.
- Imports no Server Action. The module graph test walks both pages and handlers.
- Reuses `Panel`, `Button`, `Alert`, `ConfirmDialog`, `UnknownOutcomeAlert`, `useMutationActionState` and the existing Thai guidance and labels.

Behaviour:

- **Labels.** The buttons read รับทราบนัดหมาย and ส่งคำขอยกเลิกนัดหมาย, with `min-h-12` (48px) touch targets.
- **Cancellation.** It needs an explicit confirmation stating that the appointment is not cancelled immediately. The success copy says the request was sent and the Appointment is not cancelled until the Hospital acts.
- **Duplicate prevention.** Pending or unknown state disables both controls. The confirm dialog also has its own lock.
- **Uncertain network outcome.** This covers a fetch failure or an unrecognized reply. The UI shows an unknown outcome and offers **only** a resend of the identical payload: the same version and the same server-rendered nonce. It never generates a new nonce, and it warns before unload.
- **Domain conflict.** A warning with an explicit reload. It never resubmits.
- **Scope denials.** The UI states that nothing was saved, then `router.refresh()` re-renders from a fresh scoped read. That read renders the existing recovery state (gateway, Account or login).
- **Success.** `router.refresh()` is rerun under fresh scoped read authorization.
- **BFCache and history restore.** The B2.1 layout guard still conceals and reloads, which resets the client state.
- **Unchanged behaviour.** SUSPENDED Hospital, ended care, non-SCHEDULED status, an existing acknowledgement and a pending request keep the same visibility rules as the ordinary page. An acknowledged version can still receive a cancellation request.

Ordinary `/app` controls and pages are unchanged.

## 10. SSR cookie / header propagation

`getServerSupabaseClient` gained an optional `onResponseHeaders` collector, called from SSR `setAll(cookies, headers)`. `getLiveExactSession({ onResponseHeaders })` forwards it.

The interaction handler collects these headers and merges them under its own stricter superset (`LINE_WORKFLOW_RESPONSE_HEADERS`) on both success and failure. Next applies the cookie writes themselves.

Unchanged:

- Global cookie attributes.
- Ordinary callers.
- No CORS headers.
- The workflow cookie is never written or cleared, on GET or on POST.

**Observed on the production build.** On MINI paths the proxy's `NextResponse.next()` header `cache-control: private, no-store` takes precedence over the handler's longer value. The handler's own `expires: 0`, `pragma: no-cache` and `x-content-type-options: nosniff` survive, as do the proxy's `referrer-policy: no-referrer` and `frame-ancestors 'none'`. `no-store` governs, so the response is uncacheable. This was recorded rather than changing the global proxy.

## 11. Security failure matrix (interaction)

| Failure | Detection | Result | Writes |
| --- | --- | --- | --- |
| Gate disabled (default) | Handler, first | 503 `NOT_ACTIVATED` | none |
| Missing/null/foreign/malformed Origin | Handler | 403 `ORIGIN_DENIED` | none |
| Server Action header / wrong method / near-miss path | Proxy (400/405 `Allow: POST`/404) and handler (400) | no dispatch | none |
| Bad Content-Type, oversize, malformed, duplicate or extra field | Handler | 400 `REQUEST_INVALID` | none |
| Missing/tampered/wrong-tuple context | Runner, before session work | 403 `SCOPE_MISSING` | none |
| Expired context (before or during the lock wait) | Runner / precondition | 403 `SCOPE_EXPIRED` | none |
| Other User / other session / remapped authSubject | Runner / precondition | 403 `SESSION_MISMATCH` | none |
| Unlinked, relinked, foreign or cleared binding | Precondition, under locks | 403 `SCOPE_REVOKED` | none |
| Inactive, roleless, no Patient SELF, quarantined | Runner / precondition | 403 `INELIGIBLE` | none |
| Lifecycle tuple mismatch | Runner | 503 `NOT_ACTIVATED` | none |
| Foreign relationship / appointment, ended care, SUSPENDED Hospital | Existing domain policy | 403/404 | none |
| Stale version, non-SCHEDULED, conflicting nonce, exhausted retries | Existing domain | 409 `CONFLICT` | none |
| Database / host failure | Any | 503 `TEMPORARILY_UNAVAILABLE` (no raw text) | rolled back |

## 12. Verification actually executed (2026-10-18, local, synthetic only)

| Command | Result |
| --- | --- |
| `npx vitest run src/modules/appointments src/modules/line src/lib/auth src/modules/auth app/line app/app/personal "app/app/patients/[relationshipId]/appointments" app/api/line` (first run, before test updates) | 5 expected B2.1-behaviour failures, everything else passed |
| `npx vitest run src/modules/appointments/services/appointment-interaction-precondition.test.ts` | 13 passed |
| `npx vitest run src/modules/line/services/line-workflow-scoped-interaction.test.ts` | 18 passed |
| `npx vitest run src/modules/line/transport/workflow-scoped-interactions.test.ts` | 45 passed |
| `npx vitest run app/line/workflow/appointments/line-workflow-appointment-interactions.test.tsx` (jsdom) | 15 passed |
| `npx vitest run app/line/workflow/appointments/scoped-pages.test.tsx` | 23 passed |
| `npx vitest run src/lib/auth/line-workflow-proxy.test.ts src/modules/line/domain/line-workflow-routes.test.ts` | 46 passed |
| `npx vitest run src/modules/line/transport/workflow-scoped-appointments.test.ts` | 17 passed |
| `npm run test:integration:focused -- tests/integration/line-workflow-scoped-mutation.integration.test.ts` | 19 passed, then re-run 3 more times: 19/19 each time |
| Focused regression integration: `line-workflow-scoped-read`, `appointments`, `line-account-linking`, `line-disconnection-orchestration`, `patient-care-end`, `line-authorization-lifecycle` | 9, 24, 26, 34, 13 and 30 passed |
| `npx tsc --noEmit -p .` | pass (after typing one test tuple) |
| `npm run lint` | 0 errors, 2 pre-existing `<img>` warnings |
| `npx vitest run` (full, once, after diff review) | 424 files / 4397 tests passed |
| `next build` (synthetic environment, local disposable database) + `next start` on :3108 (gate unset) and :3109 (gate enabled, synthetic HTTPS tuple and keyring) | build passed. Smoke results below. |
| Headless Chrome iframe harness (production CSS) | 4 pages × 360/390/430 px: `scrollWidth` equals the viewport, 0 overflowing elements |

**Running-Next smoke.** Unauthenticated synthetic requests were sent with `curl --path-as-is`. The build's manifest has 0 of 123 Server Actions registered for any `line/workflow` worker. The ordinary acknowledgement and cancellation action IDs were the same as in B2.1.

- :3108, both handlers, same-origin valid JSON: 503 `NOT_ACTIVATED`. No Set-Cookie.
- Handlers with GET, HEAD, PUT, PATCH, DELETE or OPTIONS: 405 `Allow: POST`.
- POST to a handler with the ordinary action ID in `Next-Action`: 400 with an empty body.
- POST to a handler as a no-JS `$ACTION_ID_` multipart form: 400 `REQUEST_INVALID`. The action did not execute and nothing appeared in the server log.
- Near-miss paths `%61cknowledge` and `{rel}/acknowledge`: 404.
- `POST .../acknowledge/` gets Next's own 308 redirect to the exact handler path. The redirect is applied before the proxy; the target still enforces every check.
- :3109, missing, `null`, foreign or malformed Origin: 403 `ORIGIN_DENIED`.
- :3109, text/plain, malformed JSON, escaped duplicate key, extra field or oversized body: 400 `REQUEST_INVALID`.
- :3109, valid body with no cookie, or with a forged cookie: 403 `SCOPE_MISSING`.
- No probe returned `Access-Control-Allow-Origin` or Set-Cookie.
- Scoped rendering pages still reject the ordinary action IDs (405 `Allow: GET, HEAD`, or 400 for `Next-Action` on GET). This is the B2.1 finding reproduced and still blocked.
- B1 verify: disabled gives 503 `WORKFLOW_DISABLED`. Enabled with a foreign Origin gives 403. GET gives 405.
- The ordinary `/app/personal/appointments/{rel}/{appt}` acknowledgement action still dispatches: 200 RSC, returning its normal error state for an unauthenticated caller.

The integration database was stopped afterwards (`npm run test:db:down`). Both smoke servers were stopped. The pre-existing `next dev` on :3000 was not touched.

## 13. Remaining limitations

- No real LINE, LIFF/MINI, Supabase Auth or device testing. The browser checks are a static production-CSS render plus jsdom behaviour tests, not a LINE in-app browser.
- The precondition revalidates **local** state under locks. Provider-side session revocation is checked once, before the transaction (accepted 17J.3B race).
- The early unlocked actor check is a fail-fast only; the locked recheck is authoritative.
- A 503 from a non-JSON intermediary is shown as an unknown outcome and recovered by an identical resend. Exactly-once network delivery is not promised.
- The interaction handlers do not use the B1 verification rate limiter, and no new abuse limit was added. The session, scope, Origin, body-size and domain idempotency controls apply.
- `cache-control` precedence is as described in section 10.

## 14. Reschedule-history disposition

**Corrected B2.1 record.** The B2.1 omission is now recorded as a **"Deferred implementation deviation — pending product acceptance"**. It is not owner-approved: it was confirmed only within the implementation session.

**B2.2 adds a strictly read-only extraction:**

- `getAppointmentRescheduleHistory` accepts an optional `database`.
- The scoped detail loader calls it on the same guarded RepeatableRead snapshot.
- It exposes only the `requests` list. The `canRequest` and `canReview` flags never leave the loader.
- `RescheduleRequestHistory` renders the list without a form, link, `<details>` or Server Action.

The ordinary section composes the same `RescheduleRequestDetails`, with unchanged markup. No reschedule request or review capability is exposed in LINE.

## 15. Disabled / non-issuing status

- `DEMI_LINE_MINI_APP_WORKFLOW_ENABLED` is unset by default, which keeps the workflow disabled. Both handlers return 503 `NOT_ACTIVATED` before any other work.
- B1 verify still ends eligible requests with `WORKFLOW_NOT_ACTIVATED`.
- No code path mints the workflow cookie. Valid contexts exist only inside automated tests, sealed with synthetic keys.
- No public test or minting endpoint was added.
- Unchanged:
  - The Rich Menu: `OPEN_PATIENT_APPOINTMENTS` still points to `/app/personal/appointments`.
  - MINI Provider configuration, LINE aliases and channels.
  - The production environment.
  - The schema.

## 16. B2.3 prerequisites

1. Implement context issuance in B1 verify. That means sealing and setting the selected HttpOnly cookie, with the reviewed attributes and expiry.
2. Run the operational activation review: the reviewed channel inventory, the MINI tuple, the keyring rotation procedure, and environment acceptance.
3. Product acceptance of the reschedule-history display, and of the interaction copy.
4. Verify deployed headers. Confirm the effective `cache-control` and CSP on the real host and CDN.
5. Run real LINE MINI App and device UAT: entry, expiry and recovery, unlink and relink, account switch, uncertain network outcomes, and 360–430px in the LINE in-app browser.
6. Decide on a dedicated interaction abuse limit, if one is required.
7. The Rich Menu destination change remains a separate, explicitly approved step.
