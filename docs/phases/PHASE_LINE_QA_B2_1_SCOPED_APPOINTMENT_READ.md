# Phase LINE-QA.B2.1 — Patient Appointment MINI App Secure Scoped Read Runtime

Status legend: **IMPLEMENTED** (source + automated evidence), **VERIFIED (automated)** (executed locally on synthetic data), **NOT VERIFIED** (needs real LINE/device/provider/operator evidence), **NOT IMPLEMENTED** (deferred to a later phase).

## 0. Phase status

**SCOPED READ RUNTIME IMPLEMENTED / AUTOMATED VERIFICATION COMPLETE / DISABLED BY DEFAULT / NON-ISSUING.**

The three read-only scoped Appointment routes exist and every sensitive read requires a valid workflow context **and** current DEMI authority in one RepeatableRead snapshot. No code path mints `__Secure-DEMI_LINE_WORKFLOW`. The B1 verification endpoint still ends every eligible request with `WORKFLOW_NOT_ACTIVATED`. Real MINI users therefore can't reach Patient data. The MINI App is **not production-ready**, and real LINE/device/provider UAT has **not** been performed.

## 1. Starting HEAD

`9caa7e1d2629c05519f2d56d960cea78163494e2` (`feat(line): add disabled MINI App gateway foundation`) on `main`.

## 2. Scoped route inventory

| Route | Methods admitted | Purpose | Data source (existing domain query) |
| --- | --- | --- | --- |
| `GET /line/workflow/appointments` | GET, HEAD | Own Hospital relationship selection | `listOwnPatientRelationshipNavigation()` |
| `GET /line/workflow/appointments/[relationshipId]` | GET, HEAD (`?page=` bounded) | Appointment history | `getOwnPatientAppointmentHistory()` |
| `GET /line/workflow/appointments/[relationshipId]/[appointmentId]` | GET, HEAD | Appointment detail, read-only interaction state | `getOwnPatientAppointmentDetail()` |
| `/line/workflow/appointments/acknowledge` | none (404 at proxy) | **Reserved** for the B2.2 POST handler | — |
| `/line/workflow/appointments/cancellation-request` | none (404 at proxy) | **Reserved** for the B2.2 POST handler | — |
| `/line/workflow` (B1 shell) | GET, HEAD (POST now rejected at proxy) | Unchanged initialization shell | none |
| `POST /api/line/workflow/verify` (B1) | unchanged | Non-issuing verification | unchanged |

All pages are `force-dynamic` and call `connection()`. A production build reports all three as dynamic (`ƒ`). Ordinary `/app/personal/appointments/**`, ordinary Patient SELF policy, login behaviour and the Phase A Rich Menu (`OPEN_PATIENT_APPOINTMENTS` → `/app/personal/appointments`) are unchanged.

## 3. Mandatory authorization flow

Pages never call domain services directly. They call `src/modules/line/transport/workflow-scoped-appointments.ts`, which always reads the `__Secure-DEMI_LINE_WORKFLOW` cookie and hands it to `runLineWorkflowScopedRead(credential, read, deps)` in `line-workflow-service.ts`. The credential is a **required** argument. There is no optional mode, no LINE-mode flag and no callback that can skip the guard. The reader receives only `{ actor, database: TransactionClient }`.

Order of checks:

1. Activation gate `DEMI_LINE_MINI_APP_WORKFLOW_ENABLED === "true"`, otherwise `WORKFLOW_DISABLED`.
2. Server-owned MINI tuple (`MINI_CONFIGURATION_UNAVAILABLE`) and context keyring.
3. Missing cookie → `SCOPE_MISSING`. A missing cookie never downgrades to ordinary DEMI authority.
4. B1 decoder `openLineWorkflowContext`: AES-256-GCM tag, strict schema, exact intent, tuple digest/AAD (origin, environment, channel, LIFF, deployment), known kid only, `issuedAt` not in the future, exact `min(issuedAt+900, proofExp)`, and `now < expiresAt`. Failures are `SCOPE_INVALID` or `SCOPE_EXPIRED`.
5. Reviewed lifecycle tuple with Provider pairing (§5), otherwise `LIFECYCLE_UNAVAILABLE`.
6. Auth-owned `getLiveExactSession()` (same captured JWT, `getClaims` + provider `getUser`, issuer/audience/expiry, mapped ACTIVE User). This runs **before** any transaction. Unauthenticated → `LOGIN_REQUIRED`; inactive → `WORKFLOW_INELIGIBLE`; outage → `SESSION_UNAVAILABLE`. No new Supabase session is created.
7. Exact User equality plus constant-time keyed session-hash equality, otherwise `SCOPE_SESSION_MISMATCH`.
8. The RepeatableRead transaction (§4).

`getLiveExactSession()` now also returns the verified `authSubject` (an additive field) so the mapping can be revalidated inside the snapshot.

## 4. In-transaction consistency model

`database.$transaction(callback, { isolationLevel: RepeatableRead, maxWait: 2000, timeout: 5000 })`. No network I/O runs inside it. Inside the callback, in this order:

1. Absolute expiry is rechecked with server time after any pool wait. Reading never renews or slides it.
2. `lineAccountBinding.findUnique(context.bindingId)`: same User, `unlinkedAt = null`, non-null `lineUserId`, exact `lifecycleVersion`. Otherwise `SCOPE_REVOKED`. This first query fixes the snapshot.
3. `user.findFirst({ id: context.userId, authSubject: verified sub })`, otherwise `SCOPE_SESSION_MISMATCH`.
4. Canonical actor through the Auth-owned `resolveActorAccessByUserId` with `createActorContextStore(transaction)`. This includes the ACTIVE status, roles and credential-recovery quarantine predicates. Otherwise `WORKFLOW_INELIGIBLE`.
5. Minimized persisted Patient SELF identity, `hasOwnPatientAppointmentIdentity(actor, transaction)`. Otherwise `WORKFLOW_INELIGIBLE`.
6. Only then does the reader run the existing domain query with the **same** TransactionClient. The query keeps its own resource-specific Patient SELF policy, ownership, historical Hospital semantics and bounded pagination.

Semantics, verified on PostgreSQL:

- A snapshot that begins after an unlink commit denies before any domain query.
- A read whose snapshot began before the unlink commit completes on that snapshot. The snapshot still sees the binding as ACTIVE. The next read then denies.
- No locks are taken for reads. The User → binding lock order in 17J.3B §12.4 is reserved for B2.2 mutations.

Not promised: retroactive erasure of delivered pages, or atomicity with remote Auth/LINE revocation.

Timeout, conflict and connection errors map to `INFRASTRUCTURE_UNAVAILABLE`, or to the domain `InfrastructureError`. Both render as temporarily unavailable and never as empty data. No nested transaction is possible: the snapshot client has no `$transaction`, which is verified. No global cache of actor, binding, SELF result or context authority exists.

## 5. Provider pairing remediation (B1 review finding)

`requireMiniLifecycleTuple()` now requires all of the following from the operator-reviewed Full Disconnection inventory. The inventory is the server manifest, never request input.

- The inventory has no inventory-wide `miniExclusionReference`.
- It has exactly one ACCOUNT tuple, and that tuple's channel equals `DEMI_LINE_LOGIN_CHANNEL_ID`.
- Exactly one MINI tuple matches the selected channel, environment and deployment reference. The code never picks one of several candidates.
- That MINI tuple has no `exclusionReference`.
- The MINI tuple's `providerReference` equals the Account tuple's `providerReference`.

Anything else fails closed as `LIFECYCLE_UNAVAILABLE`, both in B1 verification and in scoped reads. One regression case covers the previously accepted shape: the same MINI tuple listed under two Providers, one excluded and one not.

## 6. UI reuse strategy

- New `app/app/personal/patient-self-appointment-content.tsx` holds the mutation-free Appointment presentation: `PatientSelfAppointmentHistoryContent`, `PatientSelfAppointmentDetailContent` (with an `interactions` slot), `PatientAppointmentInteractionSummary` (read-only), the `PatientAppointmentLinks` adapter and `ORDINARY_PATIENT_APPOINTMENT_LINKS`. It imports no controls and no Server Actions.
- The ordinary `PatientSelfAppointmentHistoryView`/`DetailView` now compose that content and still mount `PatientAppointmentInteractionControls` and the reschedule section. Rendered ordinary markup across 21 status, relationship and pagination cases was compared byte-for-byte before and after the refactor and is **identical**.
- `PatientSelfRelationshipNavigation` gained an optional `hrefFor` adapter. Ordinary callers are unchanged. `PatientSelfHistoryMoreLink` gained an optional `prefetch={false}`.
- Scoped pages use the fixed `lineWorkflowAppointmentLinks` adapter (`src/modules/line/domain/line-workflow-routes.ts`). Every internal link stays under `/line/workflow/appointments`, and sensitive `Link`s use `prefetch={false}`. Scoped headers avoid `PageHeader` breadcrumbs, which prefetch by default.
- Detail shows acknowledgement and cancellation-request status and history read-only, with the notice "การรับทราบนัดหมายและคำขอยกเลิกผ่าน LINE ยังไม่เปิดใช้งาน".
- **Deferred implementation deviation — pending product acceptance:** the reschedule-request section is **not** rendered in B2.1. `getAppointmentRescheduleHistory()` cannot run on the guarded TransactionClient, and its section embeds Server Action forms. (Correction recorded in B2.2: this omission was an implementation choice confirmed only within the B2.1 session, not an explicit product-owner approval. B2.2 later added the read-only history; see `PHASE_LINE_QA_B2_2_SCOPED_APPOINTMENT_MUTATIONS.md`.)
- Explicit exit: the layout footer explains that the ordinary web is not LINE-scoped. It links "ออกจากหน้านัดหมายใน LINE ไปยัง DEMI" to `/app/personal` as a full-document `<a>`. No cookie, token or authority is carried, and there is no automatic fallback.
- BFCache and history restore: `LineWorkflowScopedGuard` in the layout conceals the content and does a full reload on `pageshow.persisted` and on `popstate`. Every recovery and exit is a full-document navigation, so the server re-runs all checks.

## 7. Route dispatch protection

`proxy.ts` runs `classifyLineWorkflowRequest()` before Supabase session refresh and before framework dispatch. The matcher additionally lists `/line/workflow/:path*` and `/api/line/workflow/:path*`, so asset-like final segments are filtered too.

- Rendering pages: only GET/HEAD are admitted. Any other method → 405 with `Allow: GET, HEAD`. A `Next-Action` header, even on GET → 400.
- Namespace detection decodes and normalizes the path (backslashes, repeated slashes, case). Anything in the namespace that is not an exact known path, with lowercase segments and canonical UUIDs, → 404. That covers `%2F`, `..%2F`, `%61ppointments`, `%6Cine`, `.png`, extra segments and non-UUIDs.
- The reserved B2.2 handler paths → 404 for every method. They can never reach the `[relationshipId]` page.
- Rejections have an empty body and carry `Cache-Control: private, no-store` and `Referrer-Policy: no-referrer`.
- `/api/line/workflow/verify` passes unchanged. Ordinary routes are untouched.

**Running-Next finding (production build, Next 16.3.0):** the build's action manifest registers **0** of 123 Server Actions for any `line/workflow` worker. However, a POST with the ordinary `acknowledgeOwnPatientAppointmentAction` ID to `/app/personal` or `/login`, pages that do not register that action, **was dispatched by the framework** (`text/x-component` response). So an action ID is reachable from any rendering route. The proxy filter is therefore a necessary control, and the smoke test confirms it rejects such requests to scoped routes before dispatch. Ordinary actions still enforce their own DEMI authorization, and none were executed against real data in this test.

## 8. Failure matrix

| Condition | Code | UI state (Thai) | Recovery |
| --- | --- | --- | --- |
| Gate disabled / MINI config / lifecycle unavailable | `WORKFLOW_DISABLED` / `MINI_CONFIGURATION_UNAVAILABLE` / `LIFECYCLE_UNAVAILABLE` | ยังไม่เปิดให้บริการ | exit only |
| No cookie; tampered, unknown-key or wrong-tuple context | `SCOPE_MISSING` / `SCOPE_INVALID` | กรุณาเปิดจากเมนู DEMI ใน LINE | gateway |
| Expired | `SCOPE_EXPIRED` | หมดเวลาการใช้งานแล้ว | gateway |
| Unlinked, relinked, moved or stale generation | `SCOPE_REVOKED` | การเชื่อมบัญชี LINE เปลี่ยนไป | `/line/account`, gateway |
| Other session/User; Auth subject remapped | `SCOPE_SESSION_MISMATCH` | การเข้าสู่ระบบเปลี่ยนไป | gateway |
| No DEMI session | `LOGIN_REQUIRED` | เข้าสู่ระบบ DEMI | `/login?returnTo=/line/workflow?intent=…` |
| Auth provider outage | `SESSION_UNAVAILABLE` | ตรวจสอบการเข้าสู่ระบบไม่ได้ชั่วคราว | retry same scoped page |
| Suspended, no PATIENT role, no SELF identity | `WORKFLOW_INELIGIBLE` / domain `ForbiddenError` | ยังใช้งานนัดหมายผ่าน LINE ไม่ได้ | exit only |
| Foreign or invalid relationship/appointment, bad page | domain `NotFoundError` | ไม่พบรายการนี้ | scoped root |
| Database, transaction or unknown failure | `INFRASTRUCTURE_UNAVAILABLE` / other | ระบบไม่พร้อมใช้งานชั่วคราว | retry same scoped page |

Denials render only finite copy. They never show Patient data or "ยังไม่มีรายการนัดหมาย", and they never silently redirect to `/app`. The empty state renders only after a fully authorized query returns zero rows.

## 9. Executed test evidence (2026-10-18, local, synthetic only)

| Command | Result |
| --- | --- |
| `npx vitest run src/modules/line/services/line-workflow-service.test.ts` | 59 passed (incl. 5 new Provider-pairing cases and 26 scoped-boundary cases) |
| `npx vitest run src/modules/line/domain/line-workflow-routes.test.ts src/lib/auth/line-workflow-proxy.test.ts src/lib/auth/quick-action-proxy.test.ts src/lib/auth/supabase-proxy.test.ts` | 55 passed |
| `npx vitest run src/modules/line/transport/workflow-scoped-appointments.test.ts` | 17 passed |
| `npx vitest run app/line/workflow/appointments/scoped-pages.test.tsx app/app/personal` | 166 passed (incl. module-graph check: no `"use server"`, server-actions, interaction-controls or reschedule module reachable from the scoped pages) |
| Ordinary view byte-identity harness (temporary, removed) | 21/21 cases identical |
| `npm run test:integration:focused -- tests/integration/line-workflow-scoped-read.integration.test.ts` | 9 passed on disposable PostgreSQL 17 |
| `npm run test:integration:focused -- tests/integration/line-disconnection-orchestration.integration.test.ts` | 34 passed (mock gained the additive `authSubject`) |
| `next build` (synthetic env, local DB) | succeeded; three scoped routes dynamic |
| `next start` smoke (28 requests + RSC follow-ups, see §7) | all matched the expected codes and headers |
| Mobile harness, headless Chrome iframes at 360/390/430 px | root/history/detail/denied: `scrollWidth` equals viewport, 0 overflowing elements; Thai renders correctly |
| `npm run typecheck`, `npm run lint`, full `npm test` | see §9.1 |

The PostgreSQL integration covers:

- Isolation is `repeatable read`.
- No `idle in transaction` connection exists during the Auth check.
- The nested-transaction API is absent from the snapshot client.
- Historical SUSPENDED-Hospital reads are retained.
- Pagination bounds and the legitimate empty state.
- Foreign relationship and appointment are denied.
- Snapshot-after-unlink is denied.
- An in-flight read completes on its snapshot, and the next read is denied.
- Relink invalidates the older generation.
- Removing the PATIENT role, removing the SELF relationship, or suspending the User denies.
- Another User, another session, or a remapped Auth subject denies.
- A transaction overrun returns no data.

Smoke highlights (production server, gate on, synthetic tuple and keyring, no cookie or a forged cookie):

- Scoped GET → 200 with the failure copy only, `private, no-store`, `no-referrer`.
- RSC (`rsc: 1`) → 307 for Next's `_rsc` hash check, then 200 `text/x-component` with failure copy only.
- POST with ordinary ack/cancel action IDs, no-JS `$ACTION_ID_` form POST, and PUT/PATCH/DELETE/OPTIONS → 405.
- GET with `next-action` → 400.
- Reserved, encoded, `.png` and non-UUID paths → 404.
- `..` is normalized by the HTTP layer to an ordinary 404 page with no scoped route reached. A trailing slash → Next's 308.
- B1 verify cross-origin POST → 403 as before.

### 9.1 Final broad verification

Run once, after the diff was reviewed and stable:

- `npm run typecheck` passed.
- `npm run lint` reported 0 errors and 2 warnings. Both warnings are pre-existing `<img>` warnings in untouched hospital-content files.
- Full `npx vitest run` passed: 420 files, 4294 tests.

## 10. Security findings and residual risks

1. **Framework action reachability (confirmed):** Next 16.3 dispatches action IDs from rendering routes that don't register them. Scoped safety relies on the proxy filter plus the absence of actions in the scoped graph. B2.2 must keep handlers as Route Handlers on the reserved paths and keep the filter. A deployment that bypasses `proxy.ts` (for example a CDN rewrite) would need equivalent filtering.
2. **Copied context:** a stateless context plus stolen matching Auth credentials can replay within the TTL while all authorities remain live (17J.3B §12.1). Unchanged.
3. **Delivered pages** are not erased by later revocation. BFCache and history restore are mitigated by conceal-and-reload, not prevented. Screenshots can't be retracted.
4. **Expired-JWT edge in RSC:** `getLiveExactSession` requires writable cookies. If the proxy refresh did not run and Supabase attempts a session cleanup during render, the result is `AUTH_UNAVAILABLE` rather than `LOGIN_REQUIRED`. This fails safe.
5. **Retry links** echo the requested scoped path, which contains the user's own URL IDs. No other identifier appears in failure HTML or RSC.
6. **Supabase server-wrapper header gap (17J.3B §17):** GET renders cannot write cookies. Refreshed cookies and SSR cache headers are applied by the proxy (`propagateSupabaseCookies`), and scoped responses carry `private, no-store` / `no-referrer` (verified on the running server). The Route-Handler response-header collector for writable responses remains a **B2.2** dependency. Supabase cookie settings are unchanged.
7. Deployed CDN/host header behaviour, `frame-ancestors`, and LINE in-app browser BFCache behaviour are **NOT VERIFIED**.

## 11. Activation-disabled status

- `DEMI_LINE_MINI_APP_WORKFLOW_ENABLED` defaults to disabled. Scoped pages then render "ยังไม่เปิดให้บริการ" without reading the cookie, session or database.
- `WORKFLOW_NOT_ACTIVATED` is retained. Nothing mints `__Secure-DEMI_LINE_WORKFLOW`. There is no public or test route that issues contexts. Contexts exist only inside automated tests.
- No Rich Menu, provider, environment, deployment, schema or migration change was made.

## 12. B2.2 / B2.3 dependencies

1. Context issuance on verify success: cookie set with identical attributes, `WORKFLOW_NOT_ACTIVATED` removed only after review, scoped navigation from the gateway.
2. Fixed POST Route Handlers at the two reserved paths. The proxy must change those two exact paths from 404 to POST-only. Handlers need exact Origin, body/schema/size limits and independent no-store/no-referrer headers.
3. The `beforeInteractionInTransaction` seam (17J.3B §12.4) for the two existing SELF mutation services, with User → binding `FOR UPDATE` lock order and Serializable retry, plus PostgreSQL concurrency/deadlock evidence.
4. Scoped mutation controls rendered in the `interactions` slot. The ordinary controls stay unchanged.
5. A writable-handler Supabase response-header collector in `supabase-server.ts`.
6. A reviewed writable path for clearing invalid contexts. GET never deletes them.
7. A decision on including the reschedule history read, via a TransactionClient seam.
8. B2.3: MINI termination transport and lifecycle, plus Rich Menu URI switching to the MINI root after approval.
9. Real LINE/device/provider UAT in DEVELOPING/REVIEW, deployed header and CDN evidence, and LINE in-app BFCache behaviour.
10. Operator evidence for the reviewed inventory carrying both Account and MINI tuples under one Provider reference.
