# Phase LINE-QA.B1 — Secure LINE MINI App Gateway and Workflow Foundation

- Date: **2026-10-18**. Branch `main`.
- Starting HEAD: **934d5a3b2475993532a8e789ba0c9960a5bd39a0** (`fix(line): preserve quick-action returns and readable menus`, LINE-QA.A). Verified before any change.
- Initial working tree: only untracked `.tmp-*` Rich Menu font/preview scratch artifacts from earlier work; untouched by this phase.
- Status: **FOUNDATION IMPLEMENTED / AUTOMATED VERIFICATION COMPLETE / DISABLED BY DEFAULT / NON-ISSUING**.
- **The MINI App is not production-ready, not activated, and issues no workflow context to any caller.**

Authoritative sources: [17J.3B technical contract](./PHASE_17J3B_MINI_APP_WORKFLOW_TECHNICAL_CONTRACT.md) (sections 6–12, 17–19, 23.1), [17J.3A closeout](./PHASE_17J3A_LIFF_WORKFLOW_SESSION_DECISION_CLOSEOUT.md), [17J.3C](./PHASE_17J3C_FULL_LINE_DISCONNECTION_LIFECYCLE_FOUNDATION_IMPLEMENTATION.md), [17J.3D](./PHASE_17J3D_ACCOUNT_FULL_DISCONNECTION_RECOVERY_IMPLEMENTATION.md), [LINE-QA.A](./PHASE_LINE_QA_A_HYBRID_QUICK_ACTION_RICH_MENU.md), [ADR-0009](../adr/0009-demi-line-oa-liff-identity-and-messaging.md).

## 1. Status legend

| Label | Meaning in this document |
| --- | --- |
| IMPLEMENTED | Source exists in the repository at the end of this phase. |
| TESTED | Covered by automated unit/route tests executed in this phase with synthetic data and mocked LINE/Auth providers. |
| STAGED | Implemented but unreachable by real users because the default-disabled gate and the B1 non-issuing fence stop it. |
| NOT IMPLEMENTED | Deliberately deferred to B2 or later. |
| NOT VERIFIED EXTERNALLY | No LINE Provider, Console, device, browser, deployed-header or real Supabase evidence was produced. |

## 2. Owner decisions taken during this phase

| Question | Selected option |
| --- | --- |
| Behaviour when `DEMI_LINE_MINI_APP_WORKFLOW_ENABLED=true` in B1 | **Run checks, never issue.** Orchestration runs and returns its normal denials; a fully eligible request still ends with `503 WORKFLOW_NOT_ACTIVATED`, no cookie, no success body. Unset/any other value returns `503 WORKFLOW_DISABLED` before Origin, body, Auth or LINE work. |
| Local abuse control | **In-process, per DEMI User**, applied after the live DEMI session check and before LINE verification, with a per-instance cap. No migration. |

## 3. Implemented trust boundaries

| Layer | Owner / file | Trust established | Cannot substitute for |
| --- | --- | --- | --- |
| Selected MINI tuple | `src/modules/line/services/line-mini-app-configuration.ts` | Server-owned single deployment tuple | Identity, session, authority |
| Activation gate | same file, `isLineMiniAppWorkflowEnabled()` | Operator decision to run the B1 orchestration | Any issuance (none exists in B1) |
| MINI ID-token verifier | `src/modules/line/adapters/line-login-client.ts`, `verifyMiniAppWorkflowIdToken()` | Verified LINE subject + proof expiry for the selected MINI audience | DEMI session, binding, Patient authority |
| Exact DEMI session | existing `getLiveExactSession()` (17J.3D, Auth-owned) | Same captured JWT claims + provider User, ACTIVE mapped DEMI User | LINE binding or Patient access |
| Binding / lifecycle | `src/modules/line/services/line-workflow-service.ts` | Exactly one current ACTIVE binding; MINI tuple present in reviewed Full Disconnection inventory | Authentication or role |
| Canonical actor + SELF | existing `resolveActorAccessByUserId()` and `hasOwnPatientAppointmentIdentity()` | Current ACTIVE actor, PATIENT role, own PatientProfile and Hospital relationship | Resource-level access (B2 domain reads) |
| Scoped context primitives | `src/modules/line/services/line-workflow-context.ts` | Integrity, tuple binding, exact-session hash, absolute expiry | Current binding/lifecycle/SELF (rechecked by `checkLineWorkflowContext`) |

A LINE binding never creates a DEMI session, never logs anyone in, and never grants Patient authority.

## 4. Configuration contract — IMPLEMENTED / TESTED

Server-only environment (synthetic examples in `.env.example`; no deployment variables were changed):

| Variable | Rule |
| --- | --- |
| `DEMI_LINE_MINI_APP_WORKFLOW_ENABLED` | Only literal `true` enables the orchestration. Default/unset/other = disabled. |
| `DEMI_LINE_MINI_APP_ENVIRONMENT` | Exactly `DEVELOPING`, `REVIEW` or `PUBLISHED`. Never derived from `NODE_ENV`. |
| `DEMI_LINE_MINI_APP_CHANNEL_ID` | Numeric 4–20 digits; the only accepted ID-token audience. Never derived from the LIFF ID prefix. |
| `DEMI_LINE_MINI_APP_LIFF_ID` | Existing LIFF ID syntax. Exposed to the client only as the selected public LIFF ID prop. |
| `DEMI_LINE_MINI_APP_ENDPOINT_URL` | Must equal `DEMI_LINE_PUBLIC_ORIGIN + "/line/workflow"` exactly (no slash, query, fragment). |
| `DEMI_LINE_MINI_APP_DEPLOYMENT_REFERENCE` | Bounded reviewed deployment reference; must match the MINI inventory entry. |
| `DEMI_LINE_PUBLIC_ORIGIN` | Existing canonical origin, reused; MINI additionally requires `https://` (no local HTTP exception). |
| `DEMI_LINE_MINI_APP_CONTEXT_KEYRING` | Server-only JSON keyring (section 7). Not consumed by any route in B1. |

Additional fail-closed checks: MINI channel ID must differ from `DEMI_LINE_LOGIN_CHANNEL_ID`, and MINI LIFF ID must differ from `NEXT_PUBLIC_DEMI_LINE_LIFF_ID`. Every failure collapses to `MINI_CONFIGURATION_UNAVAILABLE`. Account LIFF, `/line/account`, Messaging API configuration and ordinary DEMI web never read these variables, so missing MINI configuration cannot break them.

Ownership: the gate and tuple are LINE-integration configuration owned by the deployment operator. B2 must keep the gate default-disabled until the scoped workflow is complete and reviewed.

## 5. Identity verification — IMPLEMENTED / TESTED

The previous Account verification body became a private `verifyIdTokenForAudience()` helper; it is not exported, so no caller can select an audience. `verifyFreshLineIdToken()` / `verifyLineIdToken()` keep the Account audience and their exact previous classifications (`LINE_PROVIDER_TRANSIENT` for network/429/5xx, `LINE_TOKEN_INVALID_OR_EXPIRED` otherwise).

`verifyMiniAppWorkflowIdToken(idToken, configuration)` posts the raw proof to `https://api.line.me/oauth2/v2.1/verify` with the selected MINI channel ID (10-second abort, `no-store`, `redirect: "error"`, one request, no fallback audience), validates issuer, `U`+32-hex subject, exact audience and integer `exp > now`, and returns only `{ subject, expiresAt, verifiedAt }`.

| Provider outcome | Classification |
| --- | --- |
| Network failure / timeout / 429 / 5xx | `LINE_PROVIDER_UNAVAILABLE` |
| Non-success 4xx (invalid, expired, channel mismatch reported by LINE) | `LINE_IDENTITY_INVALID` |
| 2xx with non-JSON, missing fields, wrong issuer or malformed subject | `LINE_PROVIDER_RESPONSE_INVALID` |
| 2xx with another audience (Account LIFF token, other MINI environment) | `LINE_WRONG_AUDIENCE` (externally reported as `LINE_IDENTITY_INVALID`) |
| 2xx already expired | `LINE_IDENTITY_INVALID` |

`liff.getDecodedIDToken()`, client-supplied LINE user IDs and profiles are never used. Raw tokens are not persisted, logged, put in URLs or telemetry, and provider bodies never reach errors or responses.

## 6. Endpoint and request contracts

### GET `/line/workflow` — IMPLEMENTED / TESTED (shell); STAGED (live use)

- `app/line/workflow/page.tsx` server shell: `connection()`, no Prisma/Patient/Appointment calls, `referrer: no-referrer` metadata, `robots: noindex`.
- `classifyLineWorkflowEntry()` (`src/modules/line/domain/line-navigation-intents.ts`): bare launch or exactly one `intent=OPEN_PATIENT_APPOINTMENTS` maps to the only intent. Only LIFF SDK parameters (`liff.state`, `liff.referrer`, `liff.hback`, `liffClientId`, `liffRedirectUri`, `liffIsEscapedFromApp`, `code`, `state`, `error`, `error_description`) may coexist, each single-valued and ≤ 2048 characters. Any other parameter (Patient/Appointment/Hospital IDs, role, return target), duplicates or other intent values → `NAVIGATION_INVALID`.
- `liff.state` is untrusted: only absent, empty or exactly `?intent=OPEN_PATIENT_APPOINTMENTS` is allowed; anything else → `PLATFORM_STATE_INVALID` rendered **before** LIFF could initialize and follow it. `liff.referrer` is accepted but ignored.
- If the gate is disabled or MINI configuration is invalid, the shell renders the Thai unavailable state and never initializes LIFF.
- Client (`line-workflow-client.tsx`, `line-workflow-gateway.ts`): `liff.init({ liffId })` bounded to 10 seconds on every primary/secondary load; SDK parameters are preserved until init resolves, then `history.replaceState` cleans the URL to `/line/workflow`. No analytics or third-party script is loaded. Not logged in (external browser) → explicit "เข้าสู่ระบบด้วย LINE" button using `liff.login({ redirectUri: <origin>/line/workflow?intent=OPEN_PATIENT_APPOINTMENTS })`. Missing ID token/consent → retryable `LINE_PROOF_UNAVAILABLE`. External browser shows an honest limitation notice. BFCache restore reloads for fresh checks.
- Successful initialization is UI state only; it is never authorization.

### POST `/api/line/workflow/verify` — IMPLEMENTED / TESTED; STAGED / NON-ISSUING

Order in `src/modules/line/transport/workflow-http.ts`:

1. Gate disabled → `503 WORKFLOW_DISABLED` (no other work).
2. MINI configuration → else `503 MINI_CONFIGURATION_UNAVAILABLE`.
3. Exact `Origin` equal to the configured canonical origin (missing, `null`, foreign, path-suffixed or HTTP rejected) → else `403 ORIGIN_DENIED`.
4. `Content-Type: application/json`, streamed actual 32 KiB cap and fatal UTF-8 (reused `readAccountJson`), strict schema `{ intent: "OPEN_PATIENT_APPOINTMENTS", idToken: string(20..16384) }` → else `400 REQUEST_INVALID`. Identity, channel, target and resource fields are rejected as unknown keys.
5. `evaluateLineWorkflowEligibility()` (section 8).
6. **B1 fence:** every fully eligible request ends as `503 WORKFLOW_NOT_ACTIVATED`.

Responses are `{ "code": <enum> }` only — no claims, User/binding/session/Patient data. Headers: `Cache-Control: private, no-cache, no-store, must-revalidate, max-age=0`, `Expires: 0`, `Pragma: no-cache`, `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`. No CORS headers; non-POST methods receive Next.js 405. No `Set-Cookie` is produced by this route.

Bounded processing: Auth live check (10-second deadline) + LINE verify (10-second abort) + bounded DB reads; no retries, polling or loops.

## 7. Scoped context contract — IMPLEMENTED / TESTED primitives; NOT ISSUED

`src/modules/line/services/line-workflow-context.ts` implements 17J.3B section 12.1:

- AES-256-GCM, 32-byte purpose-specific encryption key and an independent 32-byte session-HMAC key per key ID, 96-bit CSPRNG nonce and 128-bit tag per issuance.
- Envelope `v1.<kid>.<nonce>.<ciphertext>.<tag>` (base64url), ≤ 3 KiB, strict regex; no algorithm or key choice from input.
- Associated data binds format version, kid, purpose `DEMI_LINE_WORKFLOW_CONTEXT_V1`, canonical origin, environment, MINI channel ID, MINI LIFF ID and deployment reference. A context presented to another environment/deployment is rejected even if keys were mistakenly shared.
- Strict decrypted claims: intent, tuple digest, bindingId (UUID), bindingVersion, userId (UUID), session hash = HMAC-SHA256(sessionKey, `DEMI_MINI_WORKFLOW_SESSION_V1:<session_id>`), issuedAt, expiresAt, proofExpiresAt. No raw session ID, subject or tokens.
- Lifetime exactly `min(issuedAt + 900, proofExpiresAt)`, absolute, no sliding renewal, no grace; future `issuedAt` rejected; sealing refuses an already-expired proof.
- Keyring JSON: `{ currentKid, keys: [{ kid, encryptionKey, sessionKey }] }`, 1–3 keys, unique kids and unique key material, current key must exist. Rotation: new current kid, prior key decrypt-only ≤ 900 seconds after its last issuance, then removed; unknown/retired kids are rejected. Invalid keyring → `MINI_CONFIGURATION_UNAVAILABLE`.
- Cookie contract constants: `__Secure-DEMI_LINE_WORKFLOW`, HttpOnly, Secure, SameSite=Lax, Path=`/line/workflow`, host-only (no Domain), never `__Host-`.
- `checkLineWorkflowContext()` composes decryption with live exact session, constant-time session-hash equality, current ACTIVE binding with the captured generation and raw locator, lifecycle tuple, ACTIVE actor and Patient SELF. **Not wired to any route.**

**No production code path calls `sealLineWorkflowContext()` or sets this cookie in B1.**

## 8. Eligibility orchestration and lifecycle dependencies — IMPLEMENTED / TESTED

`evaluateLineWorkflowEligibility()` order:

1. Selected MINI tuple.
2. **Lifecycle:** `requireLineDisconnectionReadiness()` must return the reviewed 17J.3D manifest (`DEMI_LINE_DISCONNECTION_ENABLED=true`, migration present) whose inventory contains a non-excluded `MINI` entry with the same channel ID, environment and deployment reference. Otherwise `LIFECYCLE_UNAVAILABLE`. This prevents MINI authorization in a deployment where Unlink would not record a MINI obligation — Account-only termination is never treated as MINI termination.
3. Live exact DEMI session (`getLiveExactSession`): Unauthenticated → `LOGIN_REQUIRED`; inactive/unmapped/unreconciled → `WORKFLOW_INELIGIBLE`; provider outage → `SESSION_UNAVAILABLE`. Anonymous callers never reach LINE.
4. Local abuse control (`line-workflow-rate-limit.ts`): 10 attempts per DEMI User per 5 minutes, 600 per instance per 5 minutes, ≤ 10,000 tracked Users; → `RATE_LIMITED` (429). In-memory and per instance only.
5. MINI ID-token verification (section 5).
6. Bindings by HMAC fingerprint + current key ID with `unlinkedAt = null`, `take: 2`: none → `LINE_NOT_LINKED`; more than one, missing or different raw locator → `BINDING_INCONSISTENT` (never "choose first", no history/cleanup fallback).
7. Exact binding User = live session User, before any Patient query → else `ACCOUNT_MISMATCH` (generic; neither account's identity disclosed).
8. ACTIVE canonical actor and `hasOwnPatientAppointmentIdentity()` → else `WORKFLOW_INELIGIBLE`.

Reused, not duplicated: `LineAccountBinding`, `LineAuthorizationLifecycle` inventory/tuple key, 17J.3D readiness, Auth exact-session service, actor resolver, Patient SELF predicate. **No schema, migration, binding table, session table or second recovery system was added.**

## 9. Login return behavior — IMPLEMENTED / TESTED

- `loginReturnToSchema` (single authoritative classifier) accepts exactly one new value: `/line/workflow?intent=OPEN_PATIENT_APPOINTMENTS` (`LINE_WORKFLOW_LOGIN_RETURN_PATH`). No other `/line/*` value, encoded alternate, traversal, protocol-relative/absolute URL, extra resource parameter or duplicate is accepted.
- Gateway login link: `/login?returnTo=%2Fline%2Fworkflow%3Fintent%3DOPEN_PATIENT_APPOINTMENTS`.
- Successful `loginAction` and already-authorized `LoginPage` both return to the fixed gateway only. The gateway then re-initializes LIFF and re-runs every server check; no pre-login token, proof or session state is carried.
- Preserved: `/line/account`, all LINE-QA.A quick-action returns, Family fragment hydration/cleanup/precedence, already-authorized Family fallback to `/app`, invalid → `/app`.
- Cookie loss / different browser: never auto-redirects. A non-authoritative `sessionStorage` latch (`demi.line.workflow.loginAttempted`, value `1`, no secrets) detects a repeated `LOGIN_REQUIRED` and shows Thai same-browser guidance plus an explicit retry. Deleting it can only cause another prompt.

## 10. Privacy and response security review

| Item | Result |
| --- | --- |
| Cache | Verify route sets the full SSR-equivalent private/no-store set; proxy marks `/line/workflow`, `/line/workflow/*`, `/api/line/workflow/*` `private, no-store`, and Supabase SSR cache headers still override with their stricter value when cookies are refreshed. |
| Referrer | `Referrer-Policy: no-referrer` from proxy and route; page metadata `referrer=no-referrer`; client fetch `referrerPolicy: "no-referrer"`. |
| Framing | `Content-Security-Policy: frame-ancestors 'none'` on workflow paths only. Device/LINE compatibility NOT VERIFIED EXTERNALLY. |
| SSR header seam | `src/lib/auth/supabase-server.ts` still ignores SSR `setAll`'s header argument (app-wide, unchanged). The B1 verify route is unaffected because it always emits a superset of those headers itself; the scoped Route Handlers in B2 must do the same or add the narrow collector described in 17J.3B section 17. |
| Auth cookies | Unchanged; no app-wide Supabase cookie rewrite. Proxy refresh retained for workflow paths (17J.3B 12.2 allows capture after normal SSR refresh). |
| CSRF/Origin | Exact canonical Origin enforced by the route itself, independent of Next.js checks. No CORS. |
| Redirects | Only fixed internal destinations; platform state never followed server-side. |
| URL cleanup | After LIFF init the URL becomes `/line/workflow`; no early analytics. Host/CDN query-log suppression NOT VERIFIED EXTERNALLY. |
| Logging | No new logging. Errors carry enum codes only; tests assert no token/subject/exception text in responses. |
| Cross-account cache | No result cache; responses private/no-store; rate-limit state keyed by internal User UUID in memory only. |
| Back/refresh | BFCache restore reloads; refresh reruns all checks. Delivered pixels cannot be retroactively erased (none are sensitive in B1). |

## 11. Failure matrix (B1 transport)

| Condition | Detection | HTTP / UI |
| --- | --- | --- |
| Gate unset/false/other | `isLineMiniAppWorkflowEnabled` | 503 `WORKFLOW_DISABLED` / ยังไม่เปิดให้บริการ |
| Fully eligible request in B1 | fence | 503 `WORKFLOW_NOT_ACTIVATED` / ยังไม่เปิดให้บริการ |
| Missing/mismatched MINI tuple | configuration | 503 `MINI_CONFIGURATION_UNAVAILABLE` |
| Lifecycle bundle inactive, Account-only, excluded/mismatched MINI tuple | lifecycle check | 503 `LIFECYCLE_UNAVAILABLE` |
| Missing/null/foreign Origin | transport | 403 `ORIGIN_DENIED` |
| Wrong content type, oversized, malformed JSON, unknown/duplicate/unsupported field | transport | 400 `REQUEST_INVALID` |
| No DEMI session / expired / revoked | exact session | 401 `LOGIN_REQUIRED` / เข้าสู่ระบบ DEMI |
| Inactive/unmapped DEMI User | exact session / actor | 403 `WORKFLOW_INELIGIBLE` |
| Auth provider unavailable | exact session | 503 `SESSION_UNAVAILABLE` |
| Local limit | rate limiter | 429 `RATE_LIMITED` |
| Invalid/expired proof, wrong audience | verifier | 400 `LINE_IDENTITY_INVALID` |
| LINE timeout/network/429/5xx | verifier | 503 `LINE_PROVIDER_UNAVAILABLE` |
| Malformed provider success | verifier | 503 `LINE_PROVIDER_RESPONSE_INVALID` |
| No ACTIVE binding | binding query | 403 `LINE_NOT_LINKED` / ไปที่บัญชี LINE |
| Ambiguous/inconsistent binding | binding query | 403 `WORKFLOW_INELIGIBLE` (internal `BINDING_INCONSISTENT`) |
| LINE A / DEMI B | equality | 403 `ACCOUNT_MISMATCH` / บัญชีไม่ตรงกัน |
| No PATIENT role / profile / own relationship | actor + SELF | 403 `WORKFLOW_INELIGIBLE` |
| Unexpected exception / DB failure | transport catch-all | 503 `INFRASTRUCTURE_UNAVAILABLE` |

No row returns Patient data or an empty-appointments fiction.

## 12. Test evidence (executed 2026-10-18)

| Command | Result |
| --- | --- |
| `npx vitest run src/modules/line/adapters/line-login-client.test.ts src/modules/line/services/line-mini-app-configuration.test.ts` | 2 files / 52 tests PASS |
| `npx vitest run src/modules/line/services/line-workflow-context.test.ts` | 1 file / 31 tests PASS |
| `npx vitest run src/modules/line/services/line-workflow-service.test.ts` | 1 file / 36 tests PASS |
| `npx vitest run app/api/line/workflow` | 1 file / 38 tests PASS |
| `npx vitest run src/modules/line/domain/line-navigation-intents.test.ts src/modules/auth app/login` | 14 files / 202 tests PASS (includes the Phase A quick-action login flow, Family and Account return regressions) |
| `npx vitest run app/line/workflow src/lib/auth/supabase-proxy.test.ts` | 3 files / 58 tests PASS |
| Final focused regression: `npx vitest run src/modules/line src/modules/auth src/lib/auth app/line app/api/line app/login src/modules/patient-self/services/patient-self-query-service.test.ts` | **58 files / 713 tests PASS** (counts above overlap; not additive) |
| `npm run typecheck` | PASS |
| `npm run lint` | 0 errors; 2 pre-existing `@next/next/no-img-element` warnings in untouched `app/app/hospitals/content/hospital-content-image-list.tsx` and `app/app/hospitals/knowledge/hospital-content-image-manager.tsx`, so `--max-warnings 0` fails for reasons outside this phase |

Not run: full repository suite, production build/dev server, PostgreSQL integration (B1 adds no persisted invariant, transaction or lock — reads only), real Supabase session experiment, real LINE verify, device/browser UAT. B17J3-03 evidence is unchanged and was not rerun.

## 13. Phase A and existing LINE regression protection

Unchanged: the 18 Rich Menu layouts/catalog/assets/PNGs, Patient/OSM quick links (`OPEN_PATIENT_APPOINTMENTS` still `/app/personal/appointments`), the `DEMI_LINE_PATIENT_NEXT_APPOINTMENT_V1` postback and Reply orchestration, native role switching, `/line/account` linking/Recovery UI and routes, Account verifier audience, ordinary Patient/OSM workflows and Appointment services. No Rich Menu action points at the MINI App.

## 14. B2 dependency list (must all be complete before any activation)

1. Issue `__Secure-DEMI_LINE_WORKFLOW` only from the verify POST after all checks, using `sealLineWorkflowContext()`; replace the B1 fence deliberately; keep the gate default-disabled until review.
2. Scoped routes `/line/workflow/appointments`, `/[relationshipId]`, `/[relationshipId]/[appointmentId]` with mandatory per-read guard (`checkLineWorkflowContext` + RepeatableRead snapshot recheck, 2 s maxWait / 5 s timeout) before any sensitive query; no ordinary fallback; no-data recovery shell.
3. Fixed POST Route Handlers `/line/workflow/appointments/acknowledge` and `/cancellation-request` with the `beforeInteractionInTransaction` precondition (User → binding `FOR UPDATE`) as the first operation inside the existing Serializable callbacks; PostgreSQL concurrency evidence.
4. Proxy finite receiving-route filter rejecting POST/Server Action dispatch to scoped rendering pages, encoded/ambiguous paths and unsupported methods.
5. Scoped link/action adapters in shared Appointment views; explicit Thai care exit; no prefetch of sensitive links.
6. MINI-specific deauthorization/termination transport (17J.3D sends Account tokens only); MINI observation (`observeLineAuthorization`) at issuance; MINI Recovery handling. Until then MINI obligations stay REMOTE_UNCONFIRMED except via bounded Recovery.
7. Operator: real Console inventory/Provider pairing for DEVELOPING/REVIEW/PUBLISHED tuples, endpoint registration, openid scope/consent, deployed headers/CDN query-log suppression, keyring provisioning and rotation runbook, distributed rate-limit decision for multi-instance hosting.
8. Response-header seam for scoped Route Handlers (superset headers or the narrow SSR header collector).
9. Device/browser UAT (iOS/Android LINE, external browser, cookie rejection, A/B mismatch, back/BFCache, `frame-ancestors` compatibility, LIFF parameter allowlist completeness).
10. Rich Menu switch of `OPEN_PATIENT_APPOINTMENTS` to the MINI permalink only after all of the above, reconciling with the LINE-QA.A catalog rather than the historical 17J.3B action counts.

## 15. Security findings and residual risks

- **Rate limit is per instance.** Serverless scale-out multiplies the effective limit; acceptable only while the endpoint is non-issuing. B2/operator must decide on a shared limiter before activation.
- **Auth call precedes the limiter.** Anonymous requests return 401 without any network call (no JWT); authenticated requests make one bounded Supabase `getUser` before the limiter, as every protected DEMI page already does.
- **Fingerprint coupling.** Binding lookup reuses `createLineSubjectFingerprint`, which reads Account LINE configuration. The lifecycle readiness check already requires that configuration, so a missing Account config fails MINI closed, never open.
- **LIFF parameter allowlist** was derived from the installed SDK 2.31.1 source and official redirect docs; an undocumented platform parameter would produce a safe invalid-entry shell, not access. Device UAT required.
- **`ACCOUNT_MISMATCH` is distinguishable from `LINE_NOT_LINKED`** to support correct recovery UX, as specified by the 17J.3B failure matrix; it is visible only to a caller holding both a valid MINI proof and a DEMI session, and reveals no identity.
- No new exploitable defect in existing ordinary-web or Account flows was identified.

## 16. Files changed

New: `app/line/workflow/{page.tsx,line-workflow-client.tsx,line-workflow-gateway.ts,page.test.tsx,line-workflow-gateway.test.ts}`, `app/api/line/workflow/verify/{route.ts,route.test.ts}`, `src/modules/line/domain/line-workflow-errors.ts`, `src/modules/line/services/{line-mini-app-configuration,line-workflow-context,line-workflow-rate-limit,line-workflow-service}.ts` (+ tests for configuration, context and service), `src/modules/line/transport/workflow-http.ts`, this handoff.

Modified: `src/modules/line/adapters/line-login-client.ts` (+test), `src/modules/line/domain/line-navigation-intents.ts` (+test), `src/modules/line/schemas/line-schemas.ts`, `src/modules/auth/schemas/login-schema.ts` (+test), `app/login/page.tsx` (+test), `src/modules/auth/transport/server-actions.test.ts`, `src/lib/auth/supabase-proxy.ts` (+test), `.env.example`, `docs/CONTEXT.md`.

No dependency, lockfile, Prisma schema, migration, Rich Menu asset, provider mutation or environment change. Phase B2/B3/B4 were not started.
