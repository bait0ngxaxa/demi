# Phase LINE-QA.B2.3 — MINI Activation Readiness

**Status:** Code implementation complete for isolated synthetic UAT preparation. This is not production activation and does not verify real LINE devices or Provider behavior.

## 1. Starting revision

- Starting HEAD: `d4b727871420f272375df6fbe1dc9f1021a61114` (`main`).
- Code implementation commit (source and tests): `135991e14240f0725f2d530d7693dc70d842a9a4`. The documentation handoff is a follow-up commit so this file can reference the reviewed code revision; its final HEAD is also returned in the delivery report.
- No production deployment, LINE Provider mutation, real-user binding change, Rich Menu change, or production secret change was performed.

## 2. Status labels

| Label | B2.3 status |
| --- | --- |
| **IMPLEMENTED** | Finite verify-to-scope issuance, final transaction revalidation, PostgreSQL shared limiter, fixed gateway continuation, secure response handling, and MINI-specific deauthorization transport. |
| **VERIFIED LOCALLY** | Unit, focused PostgreSQL, Next production-build/header, and local responsive-width evidence listed below. LINE Provider calls were mocked where noted. |
| **STAGED** | Selected MINI tuple, issuance gates, keyring, provider-token privacy exception, and deployment-owned DB access remain operator-controlled. |
| **NOT CONFIGURED** | No selected production MINI tuple, MINI channel secret, production keyring, or issuance activation was configured by this phase. |
| **NOT VERIFIED EXTERNALLY** | LINE Android/iOS, external-browser cookie sharing, consent screens, and actual LINE deauthorization were not exercised. |
| **BLOCKED** | Production activation is blocked until the deployment tuple, shared limiter permissions, keys, lifecycle inventory, and evidence below are approved and configured. |
| **OWNER APPROVAL REQUIRED** | Stage 2 enablement, real-device UAT, production decision, and any future Rich Menu switch. |

## 3. Trust boundaries and end-to-end flow

Existing DEMI authentication remains authoritative. A LINE ID token proves an additional identity against exactly one server-selected MINI channel audience; it cannot create a DEMI account, session, role, or Patient authority. Account LIFF and MINI audiences remain separate.

```mermaid
sequenceDiagram
    participant P as Patient browser / LINE MINI
    participant G as DEMI gateway
    participant V as Verify Route Handler
    participant L as LINE Login verifier
    participant A as DEMI Auth + exact session
    participant D as PostgreSQL / lifecycle
    participant W as Scoped Appointment routes

    P->>G: GET /line/workflow
    G->>G: Initialize only the selected LIFF; initialization is not authorization
    P->>V: POST finite intent + transient ID token, exact Origin
    V->>D: Consume shared global verification quota
    V->>L: Verify ID token once against selected MINI channel ID
    V->>A: Verify current exact DEMI session and Auth subject mapping
    V->>D: Resolve exactly one current ACTIVE binding and Patient SELF authority
    V->>D: Serializable: lock User → binding → lifecycle rows; revalidate and observe MINI
    D-->>V: Commit observation or deny after fresh retry
    V-->>P: Finite SCOPE_GRANTED + HttpOnly encrypted workflow cookie
    P->>W: Navigate to fixed /line/workflow/appointments
    W->>A: Recheck exact current DEMI session
    W->>D: Recheck binding generation, role, Patient SELF and resource authorization
    W-->>P: Scoped read or fixed acknowledgement/cancellation-request outcome
```

The verify request accepts only `{ intent: "OPEN_PATIENT_APPOINTMENTS", idToken }`. No client-supplied User, LINE subject, hospital, Patient, role, session, binding, audience, LIFF/channel selector, resource, or redirect is used.

## 4. Issuance activation contract

Issuance is enabled only when **all** of the following server-owned conditions hold:

1. `DEMI_LINE_MINI_APP_WORKFLOW_ENABLED=true` and the independent `DEMI_LINE_MINI_APP_ISSUANCE_ENABLED=true` (exact lowercase literal). Missing or any other value is disabled. Neither gate is client-controlled or inferred from `NODE_ENV`.
2. The selected deployment tuple validates: `DEMI_LINE_MINI_APP_ENVIRONMENT`, `DEMI_LINE_MINI_APP_CHANNEL_ID`, `DEMI_LINE_MINI_APP_LIFF_ID`, `DEMI_LINE_MINI_APP_ENDPOINT_URL`, the trusted public HTTPS origin, and `DEMI_LINE_MINI_APP_DEPLOYMENT_REFERENCE`. The endpoint must equal the trusted origin plus `/line/workflow`; Account and MINI IDs must differ. No token-audience fallback or automatic `PUBLISHED` selection exists.
3. The Full Disconnection manifest is enabled and valid, its migration readiness is present, and the reviewed inventory contains exactly one matching non-excluded MINI tuple and one Account tuple under the same Provider/deployment. Unknown applicability or tuple mismatch denies issuance.
4. The exact current DEMI session, Auth subject-to-User mapping, active binding, canonical ACTIVE actor, PATIENT role, Patient SELF profile, and current authorized hospital relationship checks succeed.
5. The PostgreSQL shared limiter migration is applied and the runtime DB role can execute its operations. Limiter failures fail closed.
6. `DEMI_LINE_MINI_APP_CONTEXT_KEYRING` has one current issuance key and only explicitly permitted decrypt keys, with separate 32-byte encryption and session-HMAC material.
7. The request has the exact configured Origin, a bounded strict JSON body, and a valid ID token for the selected MINI audience. The token proof and exact DEMI session are revalidated before a cookie can be returned.

`DEMI_LINE_MINI_APP_CHANNEL_SECRET` is required only for an explicitly supplied MINI access token's remote deauthorization attempt. `DEMI_LINE_PROVIDER_TOKEN_VERIFY_QUERY_ENABLED=true` is a separate privacy exception for the LINE-mandated access-token verification request; it is not required for local unlink or ordinary MINI issuance.

The implementation does not set any of these production values. An isolated environment can exercise positive issuance by setting approved synthetic values and injecting synthetic LINE/Auth proof plus a disposable PostgreSQL database.

## 5. Context and cookie contract

- Cookie name: `__Secure-DEMI_LINE_WORKFLOW`.
- Attributes: `HttpOnly; Secure; SameSite=Lax; Path=/line/workflow; Max-Age=<remaining exact lifetime>`. No `Domain` is emitted; `__Host-` is not used because the selected Path is not `/`.
- Context: AES-256-GCM; 12-byte fresh nonce; 16-byte tag; existing purpose-separated keyring and current key ID; fixed deployment tuple authenticated as associated data.
- Finite claims: fixed intent, binding ID and lifecycle version, DEMI User ID, keyed exact-session hash, trusted tuple binding, `issuedAt`, `expiresAt`, and `proofExpiresAt`.
- Lifetime is absolute `min(issuedAt + 900 seconds, verified proof expiry)`. GET/RSC rendering never issues or refreshes it.
- Excluded: raw LINE token/subject, national identifier, Patient/Hospital record, Supabase token, and raw session ID. The encrypted value is never returned in JSON.
- Success JSON is exactly `{ code: "SCOPE_GRANTED", continuation: "/line/workflow/appointments" }`. No arbitrary or external destination is accepted.
- Missing, tampered, expired, unknown-key, retired-key, wrong-tuple, changed-session, unlinked, relinked, or ineligible contexts deny access. Every scoped read and mutation repeats current authorization checks.

## 6. Observation versus Unlink/Relink ordering

The external LINE verification and exact DEMI liveness checks run before locks. Issuance then opens one bounded Serializable transaction (5 seconds; existing bounded retry policy):

1. Lock current `User`.
2. Lock the exact `LineAccountBinding`.
3. Revalidate owner, `lineUserId`, fingerprint/key, ACTIVE/unlinked state, and lifecycle generation.
4. Revalidate Auth subject mapping, canonical actor, PATIENT role, Patient SELF profile, and current expiry.
5. Call the existing lifecycle observer, which locks lifecycle rows in deterministic tuple/ID order, then commit.
6. Only after commit, seal the context and create the response cookie.

There is no LINE Provider or Supabase I/O under locks and no nested transaction. If Unlink commits first, issuance retries with a fresh snapshot and denies without a current-generation observation. If issuance commits first, Unlink subsequently revokes the binding, increments the generation, and captures the MINI obligation. A late cookie cannot authorize after a generation change. A late provider result can update only its reserved historical attempt; it cannot restore authority.

## 7. Full Disconnection integration

Local binding revocation remains atomic and authoritative. Remote failure, missing MINI token, credential failure, or provider outage never rolls back local revocation. Existing lifecycle rows, attempts, recovery provenance, and generation fences remain the source of truth.

| Case | Local action | Remote result / UI meaning |
| --- | --- | --- |
| Account token + Account grant | Revoke locally; reserve existing Account attempt | Account channel credentials only; only provider `204` is `REMOTE_CONFIRMED`. |
| MINI token + observed selected MINI grant | Revoke locally; reserve exact MINI tuple/generation attempt | MINI audience/secret only; only provider `204` is confirmed. |
| Ordinary Account LIFF unlink without MINI token | Revoke locally; retain the applicable MINI obligation | `TOKEN_UNAVAILABLE` / `REMOTE_UNCONFIRMED`; no forced MINI consent. |
| MINI token absent, wrong audience, wrong subject, or invalid | Revoke locally; keep durable attempt/obligation where applicable | No false success; failed/ambiguous result remains unconfirmed. |
| Provider timeout or ambiguous non-204 after dispatch | Revoke locally; preserve attempt history | `REMOTE_UNCONFIRMED`; no automatic retry. |
| Recovery release | Existing single-use exact-session challenge and review policy | Release is not evidence of remote deauthorization. Relink advances lifecycle generation. |
| Excluded or unknown tuple | Preserve existing inventory semantics | Never fabricate a MINI observation or `PROVEN_ABSENT`; status remains partial/unknown as the contract defines. |

## 8. MINI deauthorization capability and limits

The adapter uses LINE's documented `POST https://api.line.me/user/v1/deauthorize`, which accepts a channel access token and a target user's access token, and documents `204` as success. LINE documents that the operation can revoke grants for LIFF apps and LINE MINI Apps. It also requires an access token with `openid` scope for the documented identity association. The implementation verifies the transient user access token against the exact selected MINI channel, verifies its `sub` equals the retained binding subject, mints a stateless channel token from that MINI channel's own credentials, checks the existing attempt/generation/tuple fence immediately before deauthorization, and sends the Provider request outside DB locks. [LINE Login API reference](https://developers.line.biz/en/reference/line-login/)

Account user tokens and Account secrets cannot enter the MINI adapter. Messaging API credentials and LINE ID tokens are not accepted as MINI deauthorization credentials. Raw user/channel tokens are neither logged nor persisted. `204` alone confirms remote removal; non-204 and ambiguous outcomes do not. The provider adapter was tested with synthetic mocked responses only. A real LINE MINI access token and actual Provider acceptance remain external UAT evidence.

## 9. Shared abuse control

The former process-local limiter is replaced with an atomic PostgreSQL fixed-window limiter shared by app instances. Migration: `20261026100000_line_workflow_shared_rate_limit`.

| Category | Limit per fixed 5-minute window |
| --- | ---: |
| Global verification attempts (before LINE verification) | 600 |
| Verified DEMI User verification attempts | 10 |
| Scoped acknowledgements | 60 |
| Scoped cancellation requests | 20 |

Rows expire after 10 minutes and are pruned in batches of at most 100. `INSERT ... ON CONFLICT ... DO UPDATE` caps counters atomically under concurrency. Stored keys are SHA-256 purpose/category hashes; no raw token, LINE subject, Patient ID, national ID, or raw DEMI User ID is stored. Limiter/database failures deny with a generic infrastructure-unavailable response. Appointment idempotency remains independent.

The integration suite tested two limiter instances with 40 simultaneous synthetic calls: exactly 10 were allowed and the counter saturated at 11. Production UAT must confirm the deployed DB role owns or has explicit permission to use the migration table; RLS is enabled and `PUBLIC` privileges are revoked. No new paid infrastructure was introduced.

## 10. Gateway continuation and recovery

The gateway keeps the established primary/secondary LIFF redirect handling, SDK initialization before cleanup, exact login-return classifier, Family return precedence, normal DEMI/Auth cookies, account-management links, external-browser guidance, and BFCache re-entry reload. LIFF initialization does not grant authority. A successful verify body is accepted only when it is the exact finite success object and HTTP 200; navigation is hard-coded to `/line/workflow/appointments` with no identifiers in the URL.

The scoped root still requires the workflow cookie and exact session. Missing or unavailable cookies render a bounded failure/recovery state; there is no silent fallback to ordinary `/app` Appointment authority. The gateway may show a deliberate DEMI web exit link for the user, but it never auto-redirects there after a failed scope.

Scoped POST handlers remain the only actions: `/line/workflow/appointments/acknowledge` and `/line/workflow/appointments/cancellation-request`. No Server Action is imported or dispatched through scoped rendering pages. Cancellation remains a **request**, not immediate cancellation. Reschedule History stays read-only, with no reschedule mutation control.

## 11. Sensitive response, cookie merging, and headers

Workflow HTML, RSC, verify, scoped-read, scoped-mutation, proxy-rejection, and recovery responses use effective `private, no-store`, `no-referrer`, `nosniff`, and `frame-ancestors 'none'` policy, with no wildcard CORS. No clinical data is rendered on an unauthorized scope. GET/RSC never mints or refreshes authority.

The verify handler normalizes header names and applies the workflow cache/security policy over forwarded Auth headers while preserving unrelated Supabase SSR headers. Next's Route Handler cookie store and response were exercised with two synthetic Auth cookies plus the workflow cookie; all three `Set-Cookie` values coexisted. No Supabase cookie attributes were changed globally. Failure responses never return the workflow cookie value.

## 12. Key management

The existing keyring parser is reused. It allows one current issuance `kid`, up to two additional explicitly present decrypt-only keys, distinct encryption/session-HMAC material, strict unknown/retired-key rejection, and default-disabled behavior if malformed or unavailable. No deployed keys were generated, printed, rotated, or stored by this phase.

Normal rotation:

1. Provision new key material through the approved secret manager to every instance.
2. Select the new issuance `kid` while retaining the former key as decrypt-only.
3. Wait at most 900 seconds after the last issuance under the old key.
4. Remove the old decrypt key and verify that old contexts are denied.

Emergency revocation: remove the compromised key from every accepted keyring immediately and deploy; this invalidates contexts sealed with that `kid`. If a deployment cannot converge promptly, disable the workflow guard as well. Do not confuse key retirement with remote LINE deauthorization or local binding revocation.

## 13. Failure matrix

| Condition | Expected result |
| --- | --- |
| Either activation gate missing/invalid | Safe unavailable; no LINE verification and no cookie. |
| Wrong Origin, content type, duplicate/extra fields, malformed/oversized body | Generic deny; no provider call or cookie. |
| Account token, wrong MINI environment/audience, missing/expired proof | Deny; no cookie. No fallback audience. |
| DEMI login/session missing, changed, or Auth/LINE binding mismatch | Deny with finite state; no identity detail or Patient data. |
| Unlink wins issuance race, role/profile/hospital eligibility changes, or User is inactive | Deny; no scope cookie or current-generation MINI observation. |
| Unlink/relink after issuance | Scoped read and mutation deny by generation/session recheck. |
| Expired/tampered cookie, wrong tuple, unknown/retired key | Deny; no refresh or fallback. |
| Auth/LINE/PostgreSQL/limiter outage | Fail closed with bounded generic response; no clinical content. |
| External browser blocks or does not share cookie | Bounded recovery state; user may restart from LINE or explicitly open ordinary DEMI. |
| Provider deauthorization not submitted/ambiguous/non-204 | Local unlink stands; remote state remains unconfirmed. |
| Duplicate concurrent Appointment mutation | Existing locked authorization, version/nonce, and idempotency behavior remains authoritative. |

## 14. Executed test evidence

Evidence is limited to synthetic users and disposable local PostgreSQL. Mocked Provider responses are simulated, not real UAT.

- `npm run test`: **4,432 passed / 2 failed / 4,434 total**, 426 files. The two failures were stale assertions in `src/lib/auth/line-workflow-proxy.test.ts` that expected the previous shorter cache header; the implementation now adds required `must-revalidate`, CSP, and `nosniff`. After updating those assertions, `npm run test -- src/lib/auth/line-workflow-proxy.test.ts`: **7/7 passed**. The full suite was not repeated because only those expected-header assertions changed.
- Earlier focused B2.3 unit run: **245 passed** across 9 files.
- `npm run test:integration:focused -- tests/integration/line-workflow-issuance.integration.test.ts`: **4/4 passed** on disposable local PostgreSQL.
- `npm run test:integration:focused -- tests/integration/line-workflow-scoped-read.integration.test.ts`: **9/9 passed**.
- `npm run test:integration:focused -- tests/integration/line-workflow-scoped-mutation.integration.test.ts`: **19/19 passed**.
- `npm run test:integration:focused -- tests/integration/line-disconnection-orchestration.integration.test.ts`: **34/34 passed**.
- `npm run typecheck`: passed during implementation; final production build also completed its TypeScript check.
- `npx eslint` on changed source/test files: zero errors. The first pass reported two unused declarations in the new integration test; they were removed, and `npx eslint tests/integration/line-workflow-issuance.integration.test.ts` passed without warnings.
- `npm run prisma:migrations:check`: passed, 65 migrations in order.
- `npx prisma validate`: passed.
- `npm run build`: passed on Next.js 16.3.0 with issuance gates left disabled.

## 15. PostgreSQL concurrency evidence

Disposable local database only (`127.0.0.1:55432`, database `demi_test`); the integration harness applied the additive limiter migration locally. No production migration was run.

- Issuance-first barrier: actual issuance-order locks and lifecycle observation commit before Unlink proceeds; Unlink captures the MINI obligation, revokes the generation, and the sealed stale context is denied.
- Unlink-first barrier: Unlink holds User then Binding and commits; issuance blocks, the existing bounded Serializable helper retries against a fresh snapshot, denies the stale generation, records no MINI observation for it, and emits no scope.
- Shared limiter: 40 concurrent calls alternating two instances allow exactly 10; counter saturates at 11; the next window allows a fresh request.
- MINI termination: mocked MINI token/credential path records only the selected MINI attempt as confirmed when the simulated result is `204`; Account obligation stays unconfirmed without an Account token. This is simulated evidence only.
- Existing scoped read/mutation and Full Disconnection integration suites were run for regression evidence; details appear in the final verification list.

## 16. Running Next.js verification

`npm run build` completed against Next.js 16.3.0 after confirming the required local Next route/cookie documentation. Issuance and workflow gates remained unset/false. The built app was started locally on `127.0.0.1:3100`; the test process was stopped after the smoke checks.

Observed production responses:

- `/line/workflow`: HTTP 200 HTML; private/no-store, no-referrer, frame-ancestors none, nosniff; only unavailable copy.
- `/line/workflow/appointments` without a workflow cookie: safe scope-failure rendering; no Patient marker/data.
- RSC request to the gateway: `text/x-component` with the same secure headers.
- `GET /api/line/workflow/verify`: 405 method fence with secure headers.
- `POST /api/line/workflow/verify`: 503 `WORKFLOW_DISABLED`, JSON type, secure headers, no `Set-Cookie`.
- A temporary local-only route wrote two synthetic Supabase-like cookies through Next's cookie store and the workflow cookie; the response contained all three cookie names. The temporary route/script were deleted before build and are not in the diff.

This smoke verifies local Next dispatch/header/cookie behavior only, not LINE browser behavior or production proxy configuration.

## 17. Responsive/accessibility review

The production gateway and no-cookie scoped route were opened in Chrome under browser viewport overrides of 360, 390, and 430 CSS pixels; overrides were reset afterward. At all six route/width combinations, document/body width matched the viewport, the main content remained visible, and the unauthenticated scoped route had no Patient/Appointment content. Gateway controls retain the existing `min-h-12` touch target, semantic status/live regions, visible focus styles, and responsive single-column layout. Thai copy was preserved; clinical copy and the existing Quick Action/Rich Menu design were not changed.

This browser review did not simulate an authorized real Patient's clinical data flow. Component and route tests cover the finite UI states with synthetic data.

## 18. External UAT runbook

### Stage 1 — Operator inventory (prepare only)

- Confirm the DEMI-owned LINE Provider and Account Login channel.
- Confirm the exact target MINI channel, environment (`DEVELOPING`, `REVIEW`, or `PUBLISHED`), LIFF ID, endpoint URL, channel ID, scopes, consent/display copy, and channel credentials owner.
- Confirm the exact deployment/environment mapping and trusted public Origin.
- Confirm the Full Disconnection inventory, exclusions, provider references, lifecycle migration readiness, recovery evidence, and app names.
- Obtain security/owner approval for the purpose-separated keyring, limiter table access, and provider-token verification privacy exception.

### Stage 2 — Isolated internal test environment (after approval)

- Provision reviewed synthetic configuration and keys in a non-production environment only.
- Use synthetic/disposable DEMI users and a disposable database; apply the additive migration there.
- Enable both workflow and issuance gates only through an approved server-side setup.
- Verify exact Origin, response headers, cookie attributes, Auth-cookie coexistence, selected audience, lifecycle inventory, and shared limiter across replicas.
- Exercise failure, expiry, unlink/relink, session/role change, recovery, and duplicate mutation cases.

### Stage 3 — Real-device acceptance (not performed)

- LINE Android and LINE iOS: launch/redirect/login/return, correct and wrong account, consent, expiry, back navigation/BFCache, Unlink/relink, acknowledgement, cancellation request, network loss/retry, and recovery.
- External browser: missing/non-shared workflow cookie, DEMI login in the same browser, explicit recovery, and ordinary DEMI exit.
- Provider/lifecycle: verify actual MINI access-token audience/scope, deauthorization consent/grant behavior, timeout/late result handling, and user-facing partial/unconfirmed state.
- Collect sanitized evidence; no token, patient, or clinical record belongs in screenshots/logs.

### Stage 4 — Production decision (separate approval)

- Collect owner acceptance, security sign-off, operator evidence, migration/DB-role confirmation, and rollback rehearsal.
- Decide production activation separately from code review.
- Approve any Rich Menu destination switch separately; this phase leaves aliases, postback markers, assets, and `OPEN_PATIENT_APPOINTMENTS` destination unchanged.

No item in Stages 3–4 is marked PASS by this local implementation.

## 19. Rollback and recovery controls

| Control | Effect |
| --- | --- |
| Set issuance gate false/unset | Stops new contexts; already-issued contexts remain bounded and are still subject to normal scoped rechecks while the workflow guard is on. |
| Set workflow gate false | Denies new verify and scoped workflow access, including existing contexts. Ordinary DEMI and Account LIFF remain separate. |
| Emergency key retirement | Denies contexts under the retired `kid`; does not revoke a LINE grant or local binding. |
| LINE deauthorization | Attempts remote grant removal; only provider `204` is confirmed. |
| Local Unlink | Immediately revokes local binding/generation and records durable obligations; remote failure cannot reverse it. |
| Rich Menu rollback | Changes future navigation only; it is not a revocation mechanism for a cookie or binding. |

No destructive rollback script was added. Preserve lifecycle history and unresolved obligations through rollback/recovery.

## 20. Production blockers and required approvals

- **BLOCKED — NOT CONFIGURED:** actual selected MINI environment/channel/LIFF/endpoint and exact Provider inventory have not been operator-confirmed for deployment.
- **BLOCKED — NOT CONFIGURED:** workflow and issuance activation gates, purpose-separated keyring, and MINI channel secret were not set by this task.
- **BLOCKED — OWNER APPROVAL REQUIRED:** production DB role permissions for the new RLS-enabled limiter table and shared cross-replica behavior must be confirmed in the intended environment.
- **BLOCKED — NOT VERIFIED EXTERNALLY:** real LINE MINI ID/access-token behavior, real deauthorization, Android/iOS, external browser cookies, provider outage, and consent/recovery behavior remain untested.
- **OWNER APPROVAL REQUIRED:** isolated Stage 2 setup and real-device Stage 3 UAT must be explicitly scheduled and reviewed. Production activation and any Rich Menu switch require separate approvals.

**Recommendation:** CODE READY FOR ISOLATED UAT after the Stage 1 operator inventory and Stage 2 owner approval. Not production-ready; do not enable production issuance from this handoff.
