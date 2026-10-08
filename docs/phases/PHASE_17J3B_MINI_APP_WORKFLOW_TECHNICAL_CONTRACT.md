# Phase 17J.3B — LINE MINI App Workflow Technical Contract

- Document: **TECHNICAL CONTRACT DRAFT / REVIEW REQUIRED**.
- Phase 17J.3B: **TECHNICAL DESIGN BLOCKED / REVIEW REQUIRED**.
- Recommendation: **NO-GO / REVIEW REQUIRED**; LINE lifecycle exception also requires review.
- Reviewed HEAD: **6220c9c72790b8a9cc53358459a1dc5b2a4f9a2c** — baseline before the focused disposable-session verification.
- Source and official-document verification date: **2026-10-08**.
- Initial working tree: clean. Repository: bait0ngxaxa/demi.
- Documentation only. No runtime implementation, provider provisioning, database change, or device evidence is delivered.

## 1. Status and interpretation

Final security-gate review on **2026-10-08** at current main HEAD above, initially clean. The dated owner clarification authorizes dedicated LINE entry **/line/workflow/appointments** and explicit exit for broader care navigation; historical 17J.3A decisions remain preserved. **B17J3-01 remains resolved at design level**; **B17J3-02 retains its selected transaction-composition design**. Neither is implemented or runtime-tested. **B17J3-03: VERIFIED / CLOSED** for the same-JWT live-session assertion. Disposable-session tests on owner-confirmed Demi-dev establish same-JWT rejection after local logout, distinct new-login sessions and refresh continuity on reported Auth v2.197.0. The same-token natural-expiry experiment passed at 05:14:42 UTC and cleanup passed at 05:14:43 UTC; section 12.2 separates measured results from outstanding evidence. Native inactivity/time-box enforcement differs from immediate row deletion. LINE termination requirements are established, but their compatible application to unchanged Account unlink is now an **EXCEPTION DRAFT / REVIEW REQUIRED** after the dated owner clarification. Overall **NO-GO / REVIEW REQUIRED**; no owner target/care decision is reopened.

Phase 17J.2 remains **CLOSED / IMPLEMENTED / AUTOMATED VERIFICATION COMPLETE**; 17J.3A remains **CLOSED / OWNER DECISION COMPLETE**; 17J.3 runtime is **NOT IMPLEMENTED**; 17J.4 is **NOT STARTED**; P17D-NOTIF-01 is **OPEN**. Historical phase documents retain their original status labels. ADR-0009's local-authoritative unlink is compatible with a separate remote completion obligation; this review identifies the missing lifecycle contract rather than silently changing Account behavior. ADR-0009 is unchanged. CONTEXT's existing blocked/review-required overall phase status remains accurate. Its earlier B17J3-03 evidence-pending note is superseded by this contract's dated section 12.2 results; this focused task updates only the contract, without another CONTEXT status addendum.

## 2. Authoritative owner decisions and sources

The [17J.3A owner closeout](./PHASE_17J3A_LIFF_WORKFLOW_SESSION_DECISION_CLOSEOUT.md), including its 2026-10-08 owner-directed target/care clarification, governs all Q01–Q16. The table retains original selection letters and applies that dated Q01/Q04 LINE target exception. Ordinary /app/personal/appointments remains unchanged. Broader care/personal navigation explicitly exits scope; all other restrictions remain binding. The [decision pack](./PHASE_17J3A_LIFF_WORKFLOW_SESSION_DECISION_PACK.md) preserves historical alternatives/evidence and original target; the dated clarification is authoritative for current LINE entry.

| Decision | Locked outcome retained by this draft |
| --- | --- |
| J3-Q01 | A — Patient Appointment list/detail; LINE initial target /line/workflow/appointments under dated clarification; ordinary /app/personal/appointments retained; no new domain model. |
| J3-Q02 | A — NO LINE-to-DEMI/Supabase session creation; existing credential authentication remains authoritative. |
| J3-Q03 | B — normal DEMI login, bounded authenticated return, no pre-auth Patient data or URL credentials. |
| J3-Q04 | B — server-owned OPEN_PATIENT_APPOINTMENTS resolves to /line/workflow/appointments for LINE launch under dated clarification; no arbitrary target. |
| J3-Q05 | A — root-only entry; no initial relationship/appointment locator; internal DEMI resource navigation remains valid. |
| J3-Q06 | A — existing UI/data breadth and acknowledgement/cancellation-request controls; unchanged business rules; no new mutation. |
| J3-Q07 | **C — new LINE MINI App channel under the same existing DEMI Provider**; existing Account LIFF unchanged; audiences separate. |
| J3-Q08 | A — dedicated ดูนัดหมายทั้งหมด action in exactly four Patient presentation variants. |
| J3-Q09 | A — preserve ข้อมูลของฉัน, ตรวจสอบนัดหมาย, and their current destinations/semantics. |
| J3-Q10 | B — thin gateway, reused responsive UI/domain, no duplicate application/API/policy/iframe/framework. |
| J3-Q11 | B — return through gateway after login; fresh proof/binding/session/SELF checks; Account/Family behavior preserved. |
| J3-Q12 | Normal navigation; optional supported close/return only; no automatic close or completion dependency. |
| J3-Q13 | CLOSED BY EXISTING ARCHITECTURE — single/multi-role Patient SELF; no presentationRole authority or URL role switch. |
| J3-Q14 | Accepted first-slice security boundary — finite intent and minimal non-authoritative control state; no application tokens/identity/clinical/resource data in initial state. |
| J3-Q15 | FAIL CLOSED — A/B mismatch discloses neither account's Patient data through the workflow; explicit correction, no identity disclosure/switch/relink/merge. |
| J3-Q16 | Verified LINE identity, current ACTIVE binding, exact session User equality, canonical actor/current domain authority over scoped reads/actions; ordinary web independent. |

Also reviewed: [CONTEXT](../CONTEXT.md), [ADR-0009](../adr/0009-demi-line-oa-liff-identity-and-messaging.md), [17J.0](./PHASE_17J0_LINE_OA_LIFF_ARCHITECTURE_IDENTITY_CONTRACT.md), [17J.0B](./PHASE_17J0B_MULTI_ROLE_RICH_MENU_DECISION_CLOSEOUT.md), [17J.1 contract](./PHASE_17J1_LINE_ACCOUNT_LINK_RICH_MENU_IMPLEMENTATION_CONTRACT.md), [17J.1 implementation](./PHASE_17J1_LINE_ACCOUNT_LINK_RICH_MENU_IMPLEMENTATION.md), [17J.2A](./PHASE_17J2A_REACTIVE_MESSAGING_DECISION_CLOSEOUT.md), [17J.2B](./PHASE_17J2B_DETERMINISTIC_REACTIVE_MESSAGING_TECHNICAL_CONTRACT.md), and [17J.2 implementation](./PHASE_17J2_DETERMINISTIC_REACTIVE_MESSAGING_IMPLEMENTATION.md). These retain Provider identity, Option C presentation, authoritative local unlink, domain ownership, narrow reactive Reply, and notification/governance gates.

## 3. Current repository evidence

All statements in this section describe source at the reviewed HEAD, not future behavior. Final gate review rechecked Auth/session/SSR/proxy/login-return, LINE local unlink/token transport, and the existing Appointment transaction seams against the accepted design. Repository test source is evidence only; no application test suite or LINE workflow runtime test was run. Targeted real Supabase Auth tests, read-only policy inspection and a simulated network failure are separately recorded in section 12.2.

| Evidence / source | Actual behavior and consequence |
| --- | --- |
| [LINE Login adapter](../../src/modules/line/adapters/line-login-client.ts), [tests](../../src/modules/line/adapters/line-login-client.test.ts) | verifyLineIdToken posts raw proof and configured DEMI_LINE_LOGIN_CHANNEL_ID to LINE verify; 10-second timeout/no-store; validates issuer, U + 32 hex subject, matching audience, positive integer unexpired exp. Returns only subject. Network/429/5xx are transient; non-success/invalid schema/claims are invalid proof. No MINI App verifier. |
| [Session service](../../src/modules/line/services/line-session-service.ts), [tests](../../src/modules/line/services/line-session-service.test.ts) | getClaims validates sub/session_id; getUser must match sub; maps authSubject to DEMI User; HMACs exact session_id with DEMI_LINE_SESSION_V1 and timing-safe comparison. Mapping itself selects only id, so callers must separately enforce ACTIVE/current actor. No scope credential, live-session persistence, or second auth system. |
| [Account lifecycle](../../src/modules/line/services/line-account-service.ts), [fingerprint](../../src/modules/line/services/line-identity-fingerprint.ts), [integration tests](../../tests/integration/line-account-linking.integration.test.ts) | LINK/UNLINK intents: 256-bit challenge, five-minute expiry, User/session hash, single-use; User/intent locks and serializable lifecycle transaction. ACTIVE-only uniqueness and retained-history conflicts. Unlink sets unlinkedAt and increments lifecycleVersion at local commit; same-User reactivation increments version; ALREADY_LINKED does not. Raw unlinked locator is cleanup-only. Summary by session User is not a verified launch-subject comparison. |
| [Schema](../../prisma/schema.prisma), [binding migration](../../prisma/migrations/20261006120000_line_account_linking_rich_menu/migration.sql) | LineAccountBinding has User FK, nullable raw subject, HMAC fingerprint/keyId, lifecycleVersion, unlinkedAt, reachability/menu/cleanup/lease state. Partial unique indexes enforce one ACTIVE binding per fingerprint and User. No workflow scope table. Do not repurpose account intents/receipts as long-lived workflow authority. |
| [Account page](../../app/line/account/page.tsx), [client](../../app/line/account/line-account-client.tsx), [HTTP boundary](../../src/modules/line/transport/account-http.ts) | Request-time summary; liff.init, explicit external LINE login, transient raw proof in POST; normal /login?returnTo=%2Fline%2Faccount. Account JSON parser caps actual bytes at 32 KiB, fatal UTF-8, exact configured Origin; safe error responses. This is account management, not a generic workflow gateway. |
| [Login schema](../../src/modules/auth/schemas/login-schema.ts), [actions](../../src/modules/auth/transport/server-actions.ts), [page](../../app/login/page.tsx), [form](../../app/login/login-form.tsx) | Allowlist: exact /line/account or /app/family/invitations# plus 43 base64url characters. Successful loginAction uses either accepted return; default /app. Already-authorized LoginPage redirects only /line/account, otherwise /app, including Family-shaped targets. Family form hydrates/validates a decoded fragment, removes it from visible URL, and gives it precedence. No workflow return. |
| [Authentication](../../src/modules/auth/services/authentication-service.ts), [actor](../../src/modules/auth/services/actor-context-service.ts), [application access](../../src/modules/auth/services/application-access-service.ts) | Identifier/password resolves trusted provider alias; signInWithPassword followed by expected-subject/current ACTIVE User validation; unmapped/inactive denied and signed out. getUser/current DB roles, Person, memberships, OSM relationships produce canonical actor. User-ID resolver is not login. Local logout uses signOut(scope=local), revalidates layout, redirects /login. |
| [SSR server](../../src/lib/auth/supabase-server.ts), [SSR proxy](../../src/lib/auth/supabase-proxy.ts), [proxy](../../proxy.ts) | getAll/setAll; async Next cookies; read-only writes caught unless writable required. Proxy getClaims refreshes session, propagates cookies plus SSR cache headers. Server wrapper accepts only cookie list and does not forward SSR setAll's second headers argument. Neither is LINE lifetime enforcement. |
| [Env](../../src/lib/env/server.ts), [packages](../../package.json), [Next config](../../next.config.ts) | Existing Account Login channel, canonical public origin and public Account LIFF ID only; lazy LINE config. No separate client env module or first-party createBrowserClient in app/src found. Installed Next 16.3.0, LIFF 2.31.1, SSR 0.12.4, supabase-js 2.112.3. Server Action size override 6mb, no allowedOrigins override or security-header configuration here. |
| [Appointment root](../../app/app/personal/appointments/page.tsx), [history](../../app/app/personal/appointments/[relationshipId]/page.tsx), [detail](../../app/app/personal/appointments/[relationshipId]/[appointmentId]/page.tsx), [controls](../../app/app/personal/appointments/patient-appointment-interaction-controls.tsx) | Request-time connection; root relationship chooser; history page parameter; detail creates randomUUID cancellation nonce. Controls directly import ordinary SELF Server Actions; success router.refresh. No LINE context. |
| [SELF page context](../../src/modules/patient-self/transport/patient-self-care-page-context.ts), [SELF queries](../../src/modules/patient-self/services/patient-self-query-service.ts), [care queries](../../src/modules/patient-self/services/patient-self-care-query-service.ts), [policy](../../src/modules/patient-self/policies/patient-self-policy.ts) | DEMI actor then domain capability/current persisted User-Person-PATIENT ownership; PatientProfile/own relationship; detail constrained by both IDs. History 50 + lookahead, scheduledAt/id descending; cancellation history bounded. Root list returns [] for missing profile/relationships, so scoped gateway must distinguish ineligible from successful empty using existing hasOwnPatientAppointmentIdentity. SELF historical reads do not require Hospital ACTIVE. |
| [Views](../../app/app/personal/patient-self-record-detail-views.tsx), [relationship navigation](../../app/app/personal/patient-self-relationship-navigation.tsx) | Hospital/name/code/status/HN, appointment data, clinician/location and appointment-time OSM presentation; links hardcode ordinary Appointment and care URLs. Changing entry URL alone cannot preserve scope through those links. |
| [Appointment actions](../../src/modules/appointments/transport/server-actions.ts), [service](../../src/modules/appointments/services/appointment-service.ts), [access](../../src/modules/appointments/services/appointment-access-service.ts) | Strict fields/schema; getProtectedApplicationActor; existing serializable mutations re-read persisted actor/relationship/capability, Hospital ACTIVE, exact SELF source, version/idempotency/nonce rules, audit/revalidation. Service dependencies accept PrismaClient and open their own transactions; no injected scope guard/TransactionClient composition seam. No binding check. |
| [Builder](../../src/modules/line/services/line-deep-link-builder.ts), [eligibility](../../src/modules/line/services/line-eligibility-service.ts), [catalog](../../src/modules/line/rich-menu/catalog.ts), [layout](../../src/modules/line/rich-menu/layout.ts) | Account intents use https://liff.line.me/{AccountLIFF}; workspace intents ordinary /app/personal or /app. Eligibility is presentation, not canonical workflow actor. 18 menus; Patient action counts 3/4/4/5, no detailed MINI App action. Existing top split assumes two actions. |
| [Manifest](../../scripts/line-rich-menu-asset-manifest.ts), [generator](../../scripts/generate-line-rich-menu-assets.ps1), [provisioning](../../src/modules/line/rich-menu/line-menu-provisioning-service.ts), [operator](../../scripts/line-rich-menu-reconcile.mjs) | Catalog/layout drive PNG labels/bounds; selective four-file regeneration supported. Provider names hash payload + image; stable alias reconciliation/readback; catalog count remains 18. Dry-run still reads/validates remote catalog; no operator command was run here. |

Relevant behavioral tests also inspected: [login schema](../../src/modules/auth/schemas/login-schema.test.ts), [login page](../../app/login/login-page.test.tsx), [login/logout actions](../../src/modules/auth/transport/server-actions.test.ts), [SELF reads](../../src/modules/patient-self/services/patient-self-care-query-service.test.ts), [menu bounds](../../src/modules/line/rich-menu/catalog.test.ts), and [Appointment integration](../../tests/integration/appointments.integration.test.ts). Existing test results in handoffs are not new PASS claims.

## 4. Official documentation — verified 2026-10-08

Labels below distinguish official guarantee (O), repository source (R), design inference (I), and device/operator evidence required (U). Public documentation does not prove deployed credentials, cookie sharing, or successful device operation.

| Official source | Verified fact / consequence |
| --- | --- |
| [MINI App development overview](https://developers.line.biz/en/docs/line-mini-app/develop/develop-overview/) | O: select Provider when creating MINI App channel; deployment/Console prerequisites and regional configuration exist. U: actual DEMI ownership, region, scope/consent and review eligibility remain unverified. |
| [Console guide](https://developers.line.biz/en/docs/line-mini-app/discover/console-guide/) | O: Developing/Review/Published internal channels; each has a unique LIFF ID/endpoint. New URL https://miniapp.line.me/{liffId}; legacy liff URL still opens MINI App. Each internal channel has channel ID/secret. Settings copying differs for verified/unverified publication. I: deploy explicit tuples, never assume IDs or audiences equal. |
| [Operational web app integration](https://developers.line.biz/en/docs/line-mini-app/develop/web-to-mini-app/) | O: a MINI App uses LIFF with a hosted web app; SDK/init required. This does not guarantee that existing DEMI authentication cookies survive browser transitions. |
| [MINI App development guidelines](https://developers.line.biz/en/docs/line-mini-app/development-guidelines/) | O: follow LIFF guidelines; no mass platform load testing; deauthorization and disclosure required when unregistering/terminating link. Service-message examples do not approve service messages here. The lifecycle applicability issue is explicit in section 24. |
| [Opening LIFF](https://developers.line.biz/en/docs/liff/opening-liff-app/) | O: primary redirect uses configured endpoint; suffix becomes liff.state, secondary combines endpoint and suffix. Browser choice is not guaranteed. I: use bare MINI App permalink and one fixed endpoint, avoiding duplicated /line/workflow suffix. |
| [Developing LIFF](https://developers.line.biz/en/docs/liff/developing-liff-apps/) | O: initialize before URL manipulation; primary redirect can contain confidential platform access_token. Do not send complete primary URL to analytics. I: serve an initialization shell instead of server login redirects on primary entry. |
| [LIFF API](https://developers.line.biz/en/reference/liff/) | O: init is guaranteed only at endpoint or descendants; initialize primary and secondary when applicable. getIDToken needs openid/grant and logged-in initialized context; external login differs; decoded profile is not server proof. closeWindow is not guaranteed externally. I: selected scoped descendants lie inside /line/workflow endpoint hierarchy; ordinary /app routes remain outside, with no SDK/close guarantee. |
| [Verify ID token](https://developers.line.biz/en/reference/line-login/#verify-id-token) | O: HTTPS POST form id_token + expected client_id; verified claims include iss/sub/aud/exp; wrong audience/expiry invalid. Nonce supplied only if used in authorization request. I: server config selects internal-channel audience, never caller input. |
| [Provider user IDs](https://developers.line.biz/en/docs/messaging-api/getting-user-ids/) | O: same Provider yields consistent user ID; different Provider differs. I: same subject is not cross-channel token authorization. |
| [MINI App external browser](https://developers.line.biz/en/docs/line-mini-app/develop/external-browser/) | O: external service supported; LINE login must be handled explicitly; init auto-login is an option, not DEMI login. Some LINE-only features unavailable. U: cookies, handoff, account switch and back/restore on actual iOS/Android. |
| [Next data security](https://nextjs.org/docs/app/guides/data-security), [cookies](https://nextjs.org/docs/app/api-reference/functions/cookies) | O/R: actions are callable server endpoints, need own authorization; POST Origin/Host checks; cookies async and writes in Action/Handler. Installed 16.3.0 guides checked under node_modules/next/dist/docs/01-app/{02-guides/data-security.md,03-api-reference/04-functions/cookies.md}. R: installed action-handler warns on missing Origin rather than uniformly rejecting it; explicit scoped Origin checks are required. |
| [Supabase SSR client](https://supabase.com/docs/guides/auth/server-side/creating-a-client?queryGroups=framework&framework=nextjs), [advanced SSR](https://supabase.com/docs/guides/auth/server-side/advanced-guide) | O: verify claims/user rather than trust getSession cookie contents; proxy refresh and response-cookie cache controls matter; prefetch/cookies can race. R: installed SSR source is the effective default evidence in section 17; current docs are not a measured production-cookie claim. |
| [Supabase sessions](https://supabase.com/docs/guides/auth/sessions) | O: session_id identifies session; access JWT can outlive sign-out; checking live session existence is stronger than signature-only validation. I/U: exact-session replay/logout behavior needs a supported auth-owned liveness boundary and deployed-provider evidence before GO. |
| [Supabase changelog](https://supabase.com/changelog), [SSR primary source](https://github.com/supabase/ssr/blob/main/src/types.ts) | Changelog markdown fetch failed; HTML fallback reviewed. No version upgrade proposed. Context7 /supabase/ssr primary-source documentation confirms getAll/setAll and cache-header argument; installed 0.12.4 source checked directly. Hosted/self-hosted version and Node compatibility must be recorded by operator, not inferred from package.json. |
| [Prisma v6 transactions](https://www.prisma.io/docs/orm/v6/prisma-client/queries/transactions), [PostgreSQL isolation](https://www.postgresql.org/docs/current/transaction-iso.html), [row locks](https://www.postgresql.org/docs/18/explicit-locking.html) | O: callback/isolation/retry support, avoid network under locks; Serializable snapshot conflicts require full retry. R: repository Prisma Client 6.19.x callbacks and finite P2034/P2002 retry. Context7 v6 evidence checked; unversioned Prisma URL redirects to newer API, not this repository's interface contract. |
| [Node authenticated encryption](https://nodejs.org/api/crypto.html#class-cipheriv) | O: authenticated cipher/AAD/tag primitives. I: fixed AES-GCM envelope, purpose/host binding and rotation selected here; no deployed runtime/key claim. |

## 5. Architectural feasibility verdict

The owner's dated target clarification removes the indistinguishable-request conflict: ordinary /app/personal/appointments and scoped /line/workflow/appointments are different server destinations. Deleting optional state cannot rename a scoped request into an ordinary request. Original same-path alternatives failed for the reasons in section 11; they are no longer the selected architecture.

The server route/transport manifest, per-read guards, scoped Route Handlers and in-transaction precondition together enforce the extra restriction. No client flag, menu role, referrer, middleware-only check or action ID authorizes it. Scope is never inferred on ordinary routes, and existing DEMI authority can independently authorize ordinary access. UI reuse changes transport/link adapters rather than duplicating domain logic.

**Feasible request isolation; B17J3-03 verified for the measured configuration, overall NO-GO pending the lifecycle exception/recovery review gate in section 24.** Current main contains none of these runtime mechanisms. Deployment/session evidence and executable verification must satisfy section 26 before marking the contract cleared.

## 6. Trust boundaries

| Layer | Trust established | Cannot substitute for |
| --- | --- | --- |
| LIFF context / menu / URL | UI entry and non-authoritative finite intent | Identity, session, binding, SELF authority |
| Server LINE verifier | Current accepted channel's verified LINE subject and proof expiry | DEMI credentials/session or Patient authority |
| Supabase + Auth | Verified exact session, current mapped ACTIVE DEMI User/canonical actor | ACTIVE LINE binding or resource access |
| LINE binding/context | Exact bound User/lifecycle continuity, additional restriction | Authentication, role, domain ownership |
| Patient SELF/Appointment | Current persisted ownership/capability and business rules | Platform identity proof or session continuity |

Gateway must compose all required layers. No role/workspace selection enters authorization. No raw token or subject is sent to browser scope storage or telemetry.

## 7. MINI App topology and environment mapping

~~~text
Existing DEMI Provider
  + Existing Messaging API channel / OA
  + Existing LINE Login channel
  |   + Existing Account LIFF -> /line/account
  + NEW LINE MINI App channel (not provisioned)
      + Developing internal channel -> Developing LIFF ID / endpoint / audience
      + Review internal channel     -> Review LIFF ID / endpoint / audience
      + Published internal channel  -> Published LIFF ID / endpoint / audience
~~~

No unrelated Provider, second classic LIFF, or Account LIFF migration. Operator must attest Provider namespace pairing; ID-token verification does not supply a Provider ID that independently proves console ownership.

Draft configuration names (not added to env): DEMI_LINE_MINI_APP_ENVIRONMENT = DEVELOPING / REVIEW / PUBLISHED; DEMI_LINE_MINI_APP_CHANNEL_ID; DEMI_LINE_MINI_APP_LIFF_ID; DEMI_LINE_MINI_APP_ENDPOINT_URL. Reuse canonical DEMI_LINE_PUBLIC_ORIGIN for this same-origin proposal. Server exposes only selected public LIFF ID to client as prop, following existing Account pattern. Keep NEXT_PUBLIC_DEMI_LINE_LIFF_ID and DEMI_LINE_LOGIN_CHANNEL_ID unchanged. Public IDs are identifiers, not authority. No channel secret/access token is required just to verify ID tokens.

| Deployment pairing | Trusted tuple (symbolic; no real IDs) | Acceptance |
| --- | --- | --- |
| Development/test deployment | D_CHANNEL_ID = D_EXPECTED_AUD; D_LIFF_ID; D_ORIGIN + /line/workflow | Developing only; operator-enrolled testers; HTTPS for live LINE. |
| Review deployment | R_CHANNEL_ID = R_EXPECTED_AUD; R_LIFF_ID; R_ORIGIN + /line/workflow | Review only; reviewed endpoint/data readiness required. |
| Live deployment | P_CHANNEL_ID = P_EXPECTED_AUD; P_LIFF_ID; P_ORIGIN + /line/workflow | Published only; no Developing/Review audience fallback. |
| Account on each deployment | Existing Login audience and Account LIFF tuple | Retains existing verification, /line/account and explicit lifecycle. |

The server-owned audience allowlist is a **singleton selected deployment tuple**, not all three audiences by default. NODE_ENV=production can describe a built review server, so do not use it alone to select Published. Deployment ownership supplies explicit tier/environment pairing; no query/header/token-aud driven selection. Separate origins/builds are preferable for internal environments; simultaneous environments on one origin need a reviewed fixed route-to-tuple map and are not included in this candidate. Never try several audiences until one succeeds.

Validate numeric channel ID and LIFF ID syntax using existing patterns, canonical HTTPS origin, exact endpoint path/no credentials/query/fragment, and equality between server/public/deployed Console tuple. No derived channel ID from LIFF-ID prefix and no guessed equality between environments. Missing/mismatched tuple disables MINI App with 503 and leaves ordinary web/Account working. Real IDs, scopes and publication state remain operator gates.

## 8. Channel-specific identity verification

Keep existing verifyLineIdToken entry point bound to Account's DEMI_LINE_LOGIN_CHANNEL_ID. Add a separately named future verifyMiniAppWorkflowIdToken(idToken) selecting only the server MINI tuple. Both may call a private low-level verify helper; do not export a caller-selectable expectedAudience option. A client cannot submit client_id, channel/environment ID, LINE subject, decoded profile, or user-selected target.

Use existing native fetch/Zod/server-only pattern: HTTPS POST https://api.line.me/oauth2/v2.1/verify with form body, 10-second abort, cache=no-store, one request per explicit attempt. Parse unknown response; validate success, issuer https://access.line.me, structural subject, aud exact selected channel, integer exp > current server seconds. Keep verified expiry for scope lifetime cap, discard other profile fields. Nonce check only if the SDK authorization actually established a supported nonce; do not fabricate it. No local JWT decode as proof. Provider success without valid claims fails closed.

Draft categories: MINI_CONFIGURATION_UNAVAILABLE (503); LINE_IDENTITY_INVALID (400, generic invalid/expired/channel response); LINE_PROVIDER_UNAVAILABLE (503 for timeout/network/429/5xx); LINE_PROVIDER_RESPONSE_INVALID (503 for malformed successful provider response); WORKFLOW_FORBIDDEN (403). No provider body/exception text enters response or log. Provider 429 is upstream unavailable, distinct from local workflow rate limit 429. No retry fallback accepting old proof, Account token, profile, or arbitrary audience. Raw proof remains in memory and request body only.

## 9. Bounded gateway contract

Future candidates: GET /line/workflow (initialization shell) and POST /api/line/workflow/verify (same-origin bounded identity/session/eligibility transport). These are not implemented. A Route Handler is preferable to a generic domain API: body size and Origin checks are explicit; GET must not mutate binding or issue business data. Existing account parser patterns can be privately reused where responsibility matches, without requiring Account audience config for MINI trust selection.

1. Render no Patient data; use trusted tuple/LIFF ID, serve no-store/no-referrer shell. Do not redirect primary entry to login before SDK initialization.
2. Initialize LIFF at configured /line/workflow, including each applicable primary/secondary load. Preserve platform parameters until init resolves; then clean transient URL parameters. No early third-party analytics/scripts or complete URL logging.
3. Bare https://miniapp.line.me/{selectedLIFFID} maps to the only workflow intent on the server. Also accept exact normalized /line/workflow?intent=OPEN_PATIENT_APPOINTMENTS for login return. Unknown/duplicate/extra application fields rejected, not turned into default authorization.
4. Handle external LINE login explicitly after init/isLoggedIn, with fixed canonical gateway redirect. LINE login is distinct from DEMI login. Missing openid proof or SDK/consent failure -> generic recovery, no business continuation.
5. POST only idToken and the finite intent. Actual body cap 32 KiB, strict schema, exact Origin, no CORS credential wildcard; apply bounded abuse controls before provider I/O. Missing/invalid intent or attempted resource/role/channel fields -> 400. Rate policy requires review before runtime, not an unrestricted endpoint.
6. Server verify against MINI audience; resolve exactly one current ACTIVE binding for verified subject; enforce current session and ACTIVE mapped canonical actor. Compare exact binding User/current session User before calling business-data queries. Existing hasOwnPatientAppointmentIdentity supplies minimized persisted SELF/profile/own-relationship eligibility.
7. No session -> 401 LOGIN_REQUIRED with fixed allowlisted login destination; no pre-login business state retained. Binding missing/ineligible -> generic 403 account-management state. A/B mismatch -> generic 403; no User A identity/details.
8. Matched/authorized -> must establish a reviewed mandatory scope **before** navigation. Selected target is /line/workflow/appointments; runtime issuance and continuation remain disabled until the overall technical contract is cleared; closing B17J3-03 alone grants no runtime GO. A gateway-only successful comparison is insufficient.
9. Responses use safe enum/correlation ID, never raw claims/binding/User/Patient projections. Retry is explicit, one attempt; no polling/redirect loop.

Platform liff.state and liff.referrer are untrusted input. Reject off-origin/path/traversal/authority/resource targets; do not server-follow them. The SDK may process redirect state before application code, so reject invalid landing paths without business rendering, and test crafted primary/secondary permutations. Do not claim application sanitization controls every SDK redirect. Bare entry avoids needing a general liff.state path router.

## 10. Navigation intent and login return

Draft canonical transport: /line/workflow?intent=OPEN_PATIENT_APPOINTMENTS; login link /login?returnTo=%2Fline%2Fworkflow%3Fintent%3DOPEN_PATIENT_APPOINTMENTS. This string carries only non-authoritative intent. Server LINE target map is exactly OPEN_PATIENT_APPOINTMENTS -> /line/workflow/appointments under the dated owner clarification. No first-entry resource parameters. The ordinary route is not a workflow-return fallback.

Auth-owned loginReturnToSchema stays the single authoritative return classifier. Add only this exact gateway value; do not allow every /line/* or /app/* route. Both LoginPage and loginAction use the same shared classifier/resolver, independently validate input, and never accept arbitrary signed URLs. Unknown, array, duplicate, encoded alternate, absolute/protocol-relative/traversal/resource-bearing return defaults safely to /app or rejects at gateway. URL decoding must happen only at the established boundary, not repeated until a string matches.

Preserve current account behavior in both paths. Preserve Family credential-submit return/fragment hydration/cleanup and safe default /app. The current already-authenticated Family target falls back /app; do **not** silently change it while adding MINI return. A shared resolver may explicitly retain that legacy branch while treating new workflow return consistently. Tests must document that distinction. If Family fragment and workflow query coexist, do not let workflow consume the Family token; retain existing Family precedence for credential submit, reject ambiguous workflow continuation and require a clean gateway restart.

| Browser/auth state | Draft lifecycle |
| --- | --- |
| Existing DEMI session | Initialize and verify MINI proof, then compare current binding/session/SELF; no credential bootstrap. |
| No DEMI session | After initialized shell offers normal credential login, fixed return; no token/session/context carried across login. |
| Login succeeds | Return gateway; initialize/get proof again, server verify again, current binding/session equality/SELF again. Fresh verification is a new provider check of currently SDK-available valid proof, not a claim of newly issued token each time. |
| Already-authorized /login | Fixed workflow return goes gateway, never directly Appointment; Account remains /line/account. |
| Bad credentials/inactive/unmapped | Existing safe errors/denial, remain login; no scope minted. |
| Different browser handoff | Authenticate separately in that browser and restart gateway there; no cookie/session/token transfer; no assumption of shared cookie jar. |
| Cookies missing/rejected, repeated return | Stop on LOGIN_REQUIRED after return and show explicit same-browser login/retry/ordinary-web choices; never auto-bounce gateway-login indefinitely. |
| Refresh/stale return/copied link | Intent supplies no authority; rerun checks. No pre-login proof or binding comparison reused. |
| Mismatch/account correction | Explicit local DEMI logout then normal intended-account login; return gateway and fresh verify. No automatic LINE logout/relink/switch. |

Use a minimal non-authoritative browser retry latch if needed to suppress a repeat auto-attempt; deleting it can cause another prompt, never access. Prefer explicit login/retry buttons and no auto-login redirects for DEMI. Cleanup such control state on success/abandonment; do not persist ID/access tokens. Close/return optional only in initialized supported context; no auto-close after actions.

## 11. Lifetime alternatives and mandatory classification

| Alternative | Finding / disposition |
| --- | --- |
| Gateway-only -> ordinary route | Launch check loses Q16 on later reads/actions; rejected. |
| Optional signed/encrypted cookie or Path=/app cookie on ordinary route | Removal downgrades; same-host tabs share cookies; signature/path is not current binding proof; rejected. |
| Session-wide server context/global User restriction | Cannot classify tabs; affects ordinary web after LINE launch; rejected. |
| Query/referrer/header/client-storage/service-worker markers | Client can omit/forge; never authority; rejected. |
| Same-URL rewrite/route group | Still needs trusted discriminator; not a solution alone. |
| Dedicated hostname | Can classify but adds origin/auth/cookie/provisioning changes; unnecessary here. |
| Dedicated scoped routes, fixed transports, encrypted exact-session context | **Selected by new owner direction**, with reused components/services and mandatory guards. |

### Server-owned request manifest

- Initialization GET /line/workflow remains a no-data shell. POST /api/line/workflow/verify issues scope only after all current checks; it sets the cookie with explicit Path regardless of its own URL. This endpoint never performs Appointment mutations.
- Scoped sensitive GET routes are exactly /line/workflow/appointments, /line/workflow/appointments/{relationshipId}, /line/workflow/appointments/{relationshipId}/{appointmentId}. Parameter validation reuses domain schemas; history page pagination remains bounded. Unsupported descendants do not select arbitrary workflows.
- Select fixed POST Route Handlers **/line/workflow/appointments/acknowledge** and **/line/workflow/appointments/cancellation-request**, not new Next Server Actions. They adapt the same existing interaction services/result state. Strict body fields retain current resource/version/nonce schemas. Scope is mandatory in each handler and transaction callback; no optional LINE mode supplied by client.
- Receiving-route dispatch control must reject **all POSTs to scoped rendering pages**, before Next's Server Action dispatcher; allow only the two exact Route Handler POST paths in this namespace. Extend existing proxy with this finite method/path rejection, retaining Supabase refresh. Handler paths themselves reject Next-Action headers and malformed/unexpected form fields; never forward to an ordinary action. This dispatch filter is a required additional control, **not** the read/action authorization boundary: each page loader and POST handler independently enforces scope and domain checks. Source/integration tests must prove both before runtime clearance. An ordinary action ID must not execute through a scoped page POST. Do not assume imported action IDs or encrypted closures bind to a page URL.
- Ordinary /app GET/actions remain ordinary DEMI authentication/domain authorization. Calling an ordinary action at an ordinary URL is independent web use, not a continuation of the LINE workflow; this architecture does not forbid it.

Every root/history/detail GET, RSC request, prefetch, router.refresh, reload and direct URL invokes the server guard **before any sensitive query**. Layout/proxy visibility checks alone are insufficient. Shared loaders accept a server-owned scoped context/transaction adapter, not an optional request flag; ordinary redirecting page-context wrappers must not send scoped denial silently to /app. Missing/revoked/expired context produces a no-data recovery shell, never ordinary fallback. Errors and streaming boundaries must not flush Patient data before authorization. Disable sensitive link prefetch initially to reduce stale client payload, while still guarding every actual RSC request.

Allow GET/HEAD for rendering and exactly the fixed handler POSTs; unsupported methods deny without dispatch. Proxy/router must agree on canonical paths: reject ambiguous encoded separators, traversal and duplicate normalization, and do not add rewrites from ordinary URLs into scoped rendering. Integration cases cover encoded paths, internal action forwarding and framework form-action fields. If the deployed Next path/action dispatch cannot enforce this finite receiving-route filter, stop for transport review; never weaken handler guards or rely on action IDs.

## 12. Selected context, exact-session gate and transaction composition

### 12.1 Context integrity and lifetime

Select a single cookie **__Secure-DEMI_LINE_WORKFLOW**, host-only (no Domain), HttpOnly, Secure, SameSite=Lax, Path=/line/workflow. __Host- is invalid for this path. No tab-isolation claim. Set only through successful verification POST; GET rendering cannot issue/renew/delete cookies. Invalid context is denied; a safe writable POST may clear it using identical attributes. The context cannot log in, refresh Supabase, grant a role or replace DEMI authentication.

Select authenticated encryption **AES-256-GCM** with independent purpose-specific 32-byte keys, fresh CSPRNG 96-bit nonce and 128-bit tag per issuance. Envelope contains only bounded format/kid/nonce/ciphertext/tag. Authenticate fixed purpose, canonical origin and deployment tuple as associated data. Never reuse LINE fingerprint/HMAC secrets as an encryption key. Strictly cap encoded cookie to 3 KiB and validate strict decrypted schema; never deserialize arbitrary objects or choose algorithm/key from arbitrary input. Server-configured kid allowlist only; one current issuance key. Unknown/removed key or bad tag denies; missing server key configuration is unavailable, not an ordinary fallback. No raw exceptions/credential logging.

| Encrypted claim | Validation against authority |
| --- | --- |
| format version and kid | Fixed supported version and configured key ring; no downgrade. |
| intent | Exact OPEN_PATIENT_APPOINTMENTS only. |
| environment/audience tuple identifier | Equals sole trusted deployment tuple, including host-associated data. |
| bindingId, lifecycleVersion | UUID/positive integer; exact current ACTIVE row, same captured lifecycle, raw locator present; no history/cleanup fallback. |
| DEMI User ID | UUID; equals verified current session mapped User and binding User. |
| keyed exact-session hash | HMAC-SHA256 of verified Supabase session_id with purpose DEMI_MINI_WORKFLOW_SESSION_V1 and independent session-binding key; constant-time compare. Session hash key generation belongs to kid configuration; no raw session ID/subject/auth tokens in cookie. |
| issuedAt, expiresAt, proofExpiresAt | Integer epoch seconds; issuedAt not future; expiresAt > issuedAt and exactly min(issuedAt + 900, proofExpiresAt); now strictly before expiry. |

**Accept 15-minute absolute TTL capped by verified proof expiration** as the bounded first-tranche technical decision. It limits replay/stale launch-proof exposure while permitting Appointment browsing and existing actions; it is not a revocation substitute. No sliding renewal and no extension from browser state. On expiry, explicit gateway reentry verifies currently SDK-available proof and all authority again. Fresh provider verification need not mean a newly issued LINE JWT. Server time is authoritative; no positive expiry grace. Recheck time inside each mutation attempt after any lock wait.

Normal key rotation deploys new issuance kid with prior decrypt/session-hash keys for **at most 900 seconds after last old issuance**, then removes them. Coordinate instances atomically enough to avoid minting with retired keys; do not reencrypt/extend old contexts. Emergency key removal immediately denies that kid. Cross-environment contexts deny even if keys mistakenly shared. Missing key state disables MINI workflow only. Logout/new login, unlink/relink/lifecycle change, suspended User or removed SELF authority cannot be repaired by restoring a stale cookie.

Cookies are shared across tabs: issuing another scope for the same session/binding replaces the cookie; other tabs may continue using this **new valid context** until its expiry, not guaranteed denial. Different session/binding/environment fails equality or is replaced only after successful fresh gateway checks. Each request validates whichever credential it actually receives. Stateless context has no individual issuance revocation; copied context plus stolen matching Auth credentials can replay within TTL while all authorities remain live. Copy alone grants nothing. Scope exit does not revoke the cookie; back navigation must reauthorize, expiry never slides. No scope table is selected.

### 12.2 Auth-owned exact-session continuity — B17J3-03

**Disposition: B17J3-03 — VERIFIED / CLOSED for the measured Demi-dev provider/version/configuration.** Current getCurrentLineSession calls getClaims() and getUser() independently; it does not capture one JWT for both calls. Its hash proves session-ID equality, not revocation. Installed supabase-js/auth-js **2.112.3** and SSR **0.12.4** were read directly. [getClaims](https://supabase.com/docs/reference/javascript/auth-getclaims) verifies signature/expiry (asymmetric verification can be local); [getUser](https://supabase.com/docs/reference/javascript/auth-getuser) makes a provider request. [Signout](https://supabase.com/docs/guides/auth/signout) warns that access JWTs can remain valid after revocation. None of these layers independently grants DEMI authority.

Select the existing **Auth-owned, same-JWT provider assertion**, without a new session table. Capture one current access JWT from SSR transport after any normal SSR refresh; getSession supplies transport only, never trusted identity. Call getClaims(capturedJwt) with expired-token acceptance disabled, then getUser(capturedJwt). Installed SDK's explicit-JWT getUser branch calls GET /user directly without _useSession/refresh; explicit-JWT getClaims likewise does not obtain another session. Asymmetric JWKS validation and symmetric provider fallback both use that token. Do not repeat getSession between checks, replace a rejected JWT with a refreshed token, or retry against a different session in this authorization attempt. A later request may use refreshed credentials only after the same exact-session check.

Require verified UUID sub/session_id, valid exp and expected Auth project issuer/audience, provider user.id = sub, mapped ACTIVE DEMI User/current canonical actor, constant-time keyed session-hash equality, current binding/lifecycle and persisted SELF. Reject missing/zero session IDs even where the provider accepts legacy tokens. A trusted project-signed JWT associates sub/session_id; callers cannot choose either. Provider denial -> 401 safe authentication state; deadline/network/5xx -> 503 safe unavailable, not login success or stale fallback. Keep the existing 10-second deadline/one attempt, no successful-liveness cache, and no token/body/identity logging.

Read-only runtime discovery on 2026-10-08 found a development-named connected project matching the configured Auth hostname. **GET /auth/v1/health returned HTTP 200, GoTrue v2.197.0**; only name/version were retained. The [v2.197.0 source](https://github.com/supabase/auth/blob/4eee58f296d9698a1c2c0ae14d7a0b379c7622d3/internal/api/auth.go) (tag commit **4eee58f296d9698a1c2c0ae14d7a0b379c7622d3**) requires JWT verification and rejects a missing session row; [GET /user routing](https://github.com/supabase/auth/blob/4eee58f296d9698a1c2c0ae14d7a0b379c7622d3/internal/api/api.go) applies that middleware. [UserGet](https://github.com/supabase/auth/blob/4eee58f296d9698a1c2c0ae14d7a0b379c7622d3/internal/api/user.go) returns the loaded User after audience validation. The reported version is not attestation of hosted patch/config equivalence. The disposable-session experiment below additionally verifies rejection of an unexpired captured JWT after effective local logout; hosted policy behavior is not inferred from version alone.

**Expiry distinction:** the inspected /user middleware does not call Session.CheckValidity. [Session model](https://github.com/supabase/auth/blob/4eee58f296d9698a1c2c0ae14d7a0b379c7622d3/internal/models/sessions.go) distinguishes not_after, created-at time-box and last-refresh inactivity. [Official sessions guidance](https://supabase.com/docs/guides/auth/sessions) describes policy enforcement on refresh and delayed cleanup. Therefore /user row existence proves neither immediate nominal time-box nor inactivity expiry. This contract must not require /user to reject at a deadline the provider does not enforce there. Obtain operator evidence of enabled policies and their effective boundaries. Native refresh-based enforcement may be selected explicitly if that is the required policy; if immediate nominal deadlines are required, **/user alone is insufficient** and a separately reviewed Auth-owned validity predicate is required. Do not silently change Auth settings or describe the scope's 15-minute cap as a replacement for Auth expiry.

The supported fallback for post-signout existence is an Auth-owned read-only parameterized auth.sessions check for verified **(id = session_id, user_id = sub)**, returning boolean only. It is **not selected**: hostname matching does not establish Prisma's DB/project pairing, read permissions or timeout semantics. Row existence alone still misses nominal expiry. No privileged query, arbitrary session lookup API, managed-schema change or custom revocation witness is authorized. Local logout hooks would miss external revocation; they are not an evidence substitute.

#### Gate evidence — executed 2026-10-08

Owner explicitly confirmed disposable A/B accounts and authorized reading exactly their two Windows Credential Manager entries for **Demi-dev**. The configured Auth host matched the connected project. The Dashboard labels its primary branch **main / PRODUCTION**; this is a [Supabase branch classification](https://supabase.com/docs/guides/deployment/branching), not proof of the project's business use. Nonproduction classification rests on the owner's explicit development/disposable-account confirmation, not its name or branch label. No shared/real account or global/admin revocation was used.

Credentials were read through Credential Manager into process memory and delivered to a local Node harness over stdin. Installed SDK **2.112.3** used isolated A/B login and explicit-JWT verifier clients with **persistSession:false, autoRefreshToken:false, detectSessionInUrl:false**. The same captured JWT was passed to both verification methods; logout/refresh did not substitute the verifier's token. Passwords, JWTs, refresh tokens, subjects and session IDs were neither printed nor written to files; output contained only status/error categories and boolean comparisons. Network verification used a 10-second deadline. Newly created A/B sessions were cleaned up by local sign-out, both HTTP 204. No temporary verification artifact remains.

| Requirement | Evidence | Verification type | Result | Remaining risk |
| --- | --- | --- | --- | --- |
| Current session helper versus selected seam | line-session-service.ts and installed SDK explicit-JWT branches | Repository source | VERIFIED source behavior | Future same-JWT Auth seam is not implemented |
| JWT validity differs from live-session validity | Still-unexpired T1: getClaims succeeds after logout, getUser(T1) rejects | Executed nonproduction integration test | VERIFIED distinction | Does not test the future DEMI scoped endpoint |
| Provider build and deployment pairing | Matching configured host; health HTTP 200, reported Auth v2.197.0 | Executed provider HTTP check and owner confirmation | VERIFIED tested environment/version | Not hosted build attestation or production evidence |
| Local session deletion rejects captured JWT | Local logout HTTP 204; explicit getUser(T1) HTTP 403 AuthSessionMissingError | Executed nonproduction integration test; pinned [logout source](https://github.com/supabase/auth/blob/4eee58f296d9698a1c2c0ae14d7a0b379c7622d3/internal/api/logout.go) | PASS for local revocation/replay | Admin revocation path not executed |
| Effective session settings | Read-only Dashboard Sessions: time-box=0/never, inactivity=0/never, single-session disabled; JWT expiry=3600 seconds; refresh reuse interval=10 seconds | Operator-interface configuration evidence | VERIFIED current development settings | No active timeout deadline to exercise; re-attest other deployments/settings |
| Natural JWT expiration | Valid baseline 04:14:37 UTC; same JWT after natural expiry 05:14:42 UTC: getClaims invalid_jwt/400, getUser bad_jwt/403 | Executed nonproduction integration test | PASS; no refresh before denial | Future Auth seam/LINE runtime not tested |
| Application DB/Auth project pairing and auth.sessions read permission | Not established | Unverified assumption | Fallback not selected | No privileged database read or new session infrastructure |

#### Sanitized execution matrix

All timestamps are **2026-10-08 UTC**. PASS applies only to the assertion stated, never to an unimplemented workflow/context guard.

| Test / timestamp | Expected | Actual | PASS / FAIL / BLOCKED |
| --- | --- | --- | --- |
| Valid A/S1 — 04:06:23.233 | Same captured JWT claims and provider User agree | HTTP 200; claimsValid=true, userValid=true, sameUser=true; structurally valid session claim | PASS — real provider |
| Local logout and captured-JWT replay — 04:06:23.438 | Effective local revocation denies still-unexpired T1 | Logout 204; getUser(T1) 403/AuthSessionMissingError; JWT unexpired=true; getClaims(T1) valid=true | PASS — real provider revocation, not cookie removal |
| A logs in as new S2 — 04:06:23.711 | Same User, different exact session | HTTP 200; sameUser=true, sameSession=false | PASS — identity/session comparison; encrypted scope not tested |
| B login — 04:06:23.978 | B cannot equal A's User/session | HTTP 200; sameUser=false, sameSession=false | PASS — identity/session comparison; scoped mismatch UI not tested |
| Refresh active A/S2 — 04:06:24.163 | New access JWT retains exact session | HTTP 200; sameUser=true, sameSession=true | PASS — real provider; no scope TTL renewal tested |
| Tampered JWT signature — 04:06:24.243 | Both verifiers reject altered signature | getClaims invalid_jwt; getUser 403/bad_jwt | PASS — real provider plus SDK verification |
| Unavailable verifier — 04:06:24.244 | No authenticated User on transport failure | Isolated injected failing fetch; AuthRetryableFetchError; authorizationSuccess=false | PASS — simulated network failure only; no real outage or DEMI 503 test |
| Natural-expiry baseline — 04:14:37.113 | Same JWT claims/provider User agree before expiry | claimsValid=true, userValid=true, sameUser=true; automaticRefresh=false; waitSeconds=3605 | PASS — real provider/SDK |
| Naturally expired JWT — 05:14:42.627 | Exact minted token denied after natural exp without refresh | Same captured JWT; getClaims invalid_jwt/400, getUser bad_jwt/403; both valid=false | PASS — real provider/SDK |
| Natural-expiry cleanup — 05:14:43.423 | Locally sign out only this new disposable session | Refresh only after expired-token checks for cleanup; SDK local sign-out succeeds; harness exit 0 | PASS — no global sign-out |
| Separate privileged operator revocation | Old JWT denied once the exact session is removed | NOT EXECUTED separately; installed signOut(local) delegates to admin.signOut(T,local), using the tested /logout endpoint | Source-covered shared mechanism; no privileged-test PASS claimed |
| Inactivity / maximum lifetime deadline | Deny at applicable effective policy boundary | Current settings both 0/never; no effective configured boundary exists | NOT APPLICABLE to this fixture; enabled-policy behavior NOT TESTED |
| Cleanup A and B — 04:06:24.330 / 04:06:24.422 | Locally revoke only sessions created by this harness | Both local sign-outs HTTP 204 | PASS — real provider |

**Technical disposition: B17J3-03 — VERIFIED / CLOSED** for the measured development fixture: same captured JWT verification, effective local revocation/replay denial, same-User new-session distinction, cross-User distinction, refresh continuity, altered-signature denial and natural-expiry denial have executable evidence. Simulated transport failure additionally returns no authenticated User. Current timeout policies are disabled, so no enabled-policy deadline is silently certified. The selected provider-backed mechanism needs no custom session table or auth.sessions fallback. JWT/session comparisons establish the inputs for future scope binding; they do not test encryption, binding checks, Patient SELF authorization or any LINE runtime.

**Revocation-path disposition:** source recheck of installed GoTrueClient._signOut shows the executed local logout invokes **this.admin.signOut(accessToken, scope)**; GoTrueAdminApi sends POST /logout?scope=local with that JWT. Pinned provider logout source deletes that session through models.LogoutSession. Thus the SDK helper used by the proposed explicit session-specific sign-out is already exercised through the login client's local sign-out; it is not a second untested liveness primitive requiring privileged credentials. Separate operator-console/global/administrative mutations were not executed and have no PASS claim. The supported invariant is rejection after effective session removal, not proof that every possible operator command actually removes a session. Changes in project/provider build/policies or a different revocation mechanism require re-attestation; no production guarantee follows from the development fixture.

**Effective policy decision:** this fixture has no inactivity/time-box deadline. Do not describe /user as enforcing nominal disabled or enabled deadlines. If another deployment enables those policies, obtain its actual configuration and verify the selected effective enforcement boundary before relying on this result. Immediate nominal deadline enforcement is not established by /user row existence. The absolute 15-minute/proof-expiry LINE context bound remains an additional restriction, not a replacement for Auth expiry.

#### Reproduction and implementation evidence limits

The follow-up harness used a fresh disposable login, verified its baseline, retained the exact JWT only in process memory, waited to verified exp plus five seconds without refresh, then checked getClaims(T) and getUser(T). Both rejected that token. Only after collecting denial results did it refresh for cleanup and locally sign out. Sanitized output was collected at **05:58:54 UTC**; the process had already exited successfully. Tokens from both experiments are no longer retained. No temporary code/token files or Auth setting changes were made.

To reproduce expiry, repeat that same in-memory/no-refresh sequence; do not forge exp, persist tokens or change shared settings. If a separate privileged operator revocation path is to be exercised later, obtain explicit session-specific authorization and approved secret handling; never use global sign-out on shared accounts. Enabled inactivity/time-box policies require their own approved fixture and effective-boundary evidence. Future implementation acceptance must still test the Auth seam's project/issuer/audience/session/User checks, sanitized 401/503 behavior and mandatory scoped reads/actions. A simulated SDK failure is not a real provider outage or a tested DEMI endpoint. Deployment/device evidence remains separate.

On every scoped read/action, live-session check is immediately before the local DB boundary; no Auth/LINE network I/O under local locks. Refresh preserving S can continue within absolute expiry; new login S2 cannot reuse S even for same User. A logout committed after the provider check can race an already-running local transaction; subsequent requests deny. No distributed atomicity or guaranteed immediate erasure of already rendered data is promised.

### 12.3 Read boundary

After decrypt/expiry/live exact-session/current actor checks, LINE orchestration opens a short RepeatableRead transaction and rechecks expiry, current binding ID/User/lifecycle/ACTIVE state and minimized persisted SELF in that snapshot, then calls existing root/history/detail query service with its TransactionClient dependency. No broad business projection before this check. Domain queries retain current persisted ownership and historical Hospital semantics. Canonical actor resolution uses Auth-owned User-ID resolver with a transaction-backed store adapter; the verified session-to-User mapping is revalidated against persisted authSubject. No global actor/binding/result cache. Reads authorized before unlink commit may finish afterward; reads whose snapshot begins after commit deny. Use 2-second maxWait/5-second timeout initially, matching existing Prisma/J2 bounded-read conventions; no network under it. Current role/relationship authority is snapshot-based too, not instantaneous erasure of an in-flight response.

### 12.4 B17J3-02 — selected in-transaction precondition

Current acknowledgeOwnPatientAppointment and requestOwnPatientAppointmentCancellation share private service implementations, a Serializable callback and retries (P2034/P2002, default two retries). Existing acknowledgement/version success, nonce replay and pending-cancellation success return **inside** that callback. Select one server-only dependency seam for these two SELF entry points: **beforeInteractionInTransaction(transaction: Prisma.TransactionClient, actor: ActorContext): Promise<void>**. It is code supplied by trusted LINE orchestration, never request fields, exported client function, role/source parameter or callback selected by client. Appointment defines the small contract; LINE owns its implementation. No Appointment/policy import of LINE, nested transaction, duplicated business function or separate mutation algorithm.

Scoped handlers must construct the mandatory precondition from verified context/session, then invoke the same two existing SELF services. Evaluate precondition as **the first operation in every mutation callback before resolveAppointmentAccessContext, resource queries or any idempotent return**. Existing ordinary calls omit it and remain independent. Add a narrow server-only scoped runner that requires this dependency by type; tests/source review must prevent scoped handlers accidentally calling the ordinary transport or omitting the guard. Do not add it indiscriminately to unrelated mutations.

Lock order is precise: scoped precondition locks **User by verified actor.userId FOR UPDATE**, then **LineAccountBinding by authenticated bindingId FOR UPDATE**, with parameterized SQL selecting id only, then rereads both User/binding state and checks User ACTIVE/authSubject/session-mapped User, binding owner/ACTIVE/non-null subject/exact lifecycle, current expiry and minimized SELF. Existing unlink/link lock **User -> LineAccountActionIntent -> binding UPDATE (implicit row lock)**. The shared User-first gate orders lifecycle transitions for that User; scoped precondition has no intent lock. Never acquire User after binding/Appointment locks in this path. Appointment domain work follows these locks and rechecks current authoritative domain policy as before.

The successful binding lock/recheck is the **local authorization serialization point**, held through transaction commit, including idempotent returns. If unlink commits before that point, the mutation must see unlinked/version-changed state and deny; a transaction with an older Serializable snapshot encountering changed locked binding must abort/retry, never authorize from stale snapshot. If mutation locks first, unlink waits on User and may commit only after mutation completes; that in-flight mutation is permitted in this ordering. User lock alone is insufficient because unlink changes binding without necessarily updating User. Binding lock and current reread are mandatory. New relink/version invalidates old context even if subject/User identical.

On each full callback retry, reacquire locks and recompute local binding/expiry/SELF checks. Denial never retries as an empty/idempotent success. Keep existing finite P2034/P2002 retry/normalization; exhausted conflicts return current safe conflict, no partial audit/write. No Provider/Auth calls, cookie writes or irreversible effects in the callback. Cross-provider liveness is checked before the transaction and remains subject to the stated race; repeat external liveness before a new service invocation, not while holding locks.

Other existing LINE paths must not be misrepresented as globally User-first: menu reconciliation locks only binding then reads eligibility; webhook updates presentation/reachability. They do not implement unlink/relink or subsequently lock User in the inspected paths. They can contend and cause retries, so acceptance covers them; no unsolicited lock refactor. This design is resolved at architecture level, with actual PostgreSQL concurrency/deadlock verification required in the future runtime phase.

## 13. Ordinary-web independence and explicit exit proof

Scoped server routes/handlers always invoke additional scope guards. Ordinary /app loaders and ordinary actions do not invoke LINE binding/context guards. No global session/User marker is created. Cookie Path limits automatic transmission but is **not** the security proof: scope requirement comes from fixed server endpoints, so removal yields denied scoped traffic even when valid Supabase credentials exist. Ordinary /app still works after unlink without any LINE credential. DEMI logout/account switch affects shared DEMI tabs normally; LINE independence is not separate session jars.

Finite presentation adapters generate scoped root/history/detail/pagination/back links and the two fixed scoped transports; scoped composition requires them explicitly, with no ordinary default on missing scoped props. Reuse views, schemas, queries and domain services; extract small shared rendering/composition seams rather than copy pages. Controls call the selected Route Handler adapters and refresh the scoped page; ordinary controls retain their existing Server Actions. No accepting arbitrary path/action from a form or URL.

Broader care/personal links and app-shell breadcrumbs are **explicit exits**. Identify them before navigation with Thai copy such as **ออกจากหน้านัดหมายใน LINE ไปยัง DEMI**, retaining the existing care destination and ordinary resource authority. A short exit notice/action suffices; no second application/login system or forced reauthentication if the DEMI session is already valid. Do not label care as a protected LINE continuation. Exit carries no context/LINE identity in URL or new authority. No blanket scope transfer to all /app pages. A legitimate person independently choosing ordinary Appointment access is allowed under existing DEMI policy. Back/restore or reentry into scoped pages still requires valid context/current checks; expired scope returns gateway recovery, never silently ordinary pages.

## 14. Wrong-account and revocation model

These are required outcomes for any accepted mechanism; they are not delivered runtime behavior.

| Case | Server check | Safe response / recovery | Confidentiality / race |
| --- | --- | --- | --- |
| A: LINE A binding / session A | Current ACTIVE binding, exact session/lifecycle and current SELF | Proceed only inside accepted mandatory scope | Only existing authorized UI projection. |
| B: LINE A / session B | Compare exact User IDs before business read | Generic 403 mismatch; explicit logout/login or Account management; fresh gateway after correction | No A/B Patient data, no A identity/name/ID. |
| C: no ACTIVE binding | Exact current subject resolution, no cleanup/history fallback | Generic 403 account-management state | No Patient query/disclosure. |
| D: unlink after entry | Every scoped request rechecks unlinkedAt/version | 403 revoked; restart account-management/gateway | No later scoped read/write after reviewed denial point; delivered old data not erased. |
| E: role/profile/account authority removed | Canonical current actor + persisted SELF/domain | 403 generic ineligible, no empty-data fiction | Prior screen can be stale; current server denies. |
| F: relink/lifecycle changes | Binding ID and captured lifecycleVersion must match | 403 stale/revoked context; fresh proof/context | Same subject/User alone cannot reactivate old scope. |
| G: session A -> B in another tab | Verified claims/User/session hash vs context | 403 generic mismatch; explicit correction | Old scope cannot authorize B; in-flight A request has captured earlier cookies. |
| H: provider unavailable at verify | Timeout/network/status/schema classification | 503 safe unavailable; explicit later retry | No stale proof fallback, no business data. |

Account management stays its existing DEMI-session-owned flow; it may display its existing safe account summary, never a newly disclosed identity for User A. No automatic account switching, relinking, account merge, role impersonation or second Supabase session. OA friendship/menu state is not a workflow-authority requirement; no new freshness gate from reachability is invented.

## 15. Patient SELF and Appointment UI reuse

Owner-clarified LINE initial route is /line/workflow/appointments, followed by scoped relationship/history/detail links. Ordinary /app/personal/appointments remains unchanged. Existing UI exposes Hospital name/code/status/HN, schedule/type/status/duration/location, responsible clinician/profession, appointment-time OSM presentation and approved interaction history. This is authenticated web disclosure; J2 chat still exposes only approved Thai date/time + Hospital name. Nothing here permits HN/identity/detail in LINE chat, first-entry URLs or telemetry.

Keep existing domain services and DTOs. SELF historical read includes own relationships regardless of Hospital operational status; mutation access still requires Hospital ACTIVE and current existing policy. Do not flatten those distinct rules into a new LINE policy. Gateway uses minimized hasOwnPatientAppointmentIdentity to distinguish missing profile/relationship from successful empty; it must not load broad UI data while session/binding mismatched.

Acknowledgement records seen-current-version, not attendance and not status change; version-specific idempotent existing acknowledgement remains. Cancellation request uses existing nonce, exact owner/source/appointment/version, pending request/version and transactional audit rules; request is **not direct cancellation**. No create/reschedule/direct cancel/withdrawal/complete/no-show/coordination/Hospital review or new clinical mutation. Existing PATIENT_SELF source retained; MINI App is transport, not new authority/source.

Selected UI reuse needs finite path/transport injection into existing views/controls instead of hardcoded ordinary links/imports. LINE orchestration composes additional restriction with domain authority, never copies Appointment queries or policies. All business actions reauthorize on server. Domain regression and binding transaction composition are gates in sections 12/22.

## 16. Rich Menu integration and assets

Future one new URI action ดูนัดหมายทั้งหมด -> selected environment's **https://miniapp.line.me/{LIFF_ID}**, bare permanent root. No repeated /line/workflow path suffix, IDs, token, role claim or clinical data. Extend existing finite LineNavigationIntent/catalog mapping with OPEN_PATIENT_APPOINTMENTS; preserve Account root URL and workspace URLs and existing postback marker/Reply unchanged. MINI App config must fail closed if missing; never silently direct this action to an ordinary page.

| Eligible key / PNG | Current -> future action count |
| --- | --- |
| PATIENT_DIRECT / patient_direct.png | 3 -> 4 |
| PATIENT_PATIENT_OSM / patient_patient_osm.png | 4 -> 5 |
| PATIENT_PATIENT_HOSPITAL / patient_patient_hospital.png | 4 -> 5 |
| PATIENT_PATIENT_OSM_HOSPITAL / patient_patient_osm_hospital.png | 5 -> 6 |

All 14 other menus remain unchanged, including four CHOOSER keys (ROLE_CHOOSER projection), UNLINKED, LINKED_INELIGIBLE, OSM-selected and HOSPITAL-selected variants. Preserve ข้อมูลของฉัน, ตรวจสอบนัดหมาย, จัดการบัญชี and exact eligible workspace switches.

Draft smallest geometry: keep canvas 2500×1686, header and bottom management/switch row. Split top x=100..2400, y=560..1220 into three areas with 40px gaps: x=100 width=740, x=880 width=740, x=1660 width=740, each height=660. Bottom remains y=1300, height=286, management first then eligible switches; round existing fractional thirds to integer edges without overlap (e.g. widths 766/767/767). Existing top layout would overlap the new URI if left unchanged. These are geometry proposals for UI review; Thai label readability at mobile width may require typography/wrapping changes through existing generator conventions, not shrinking to unreadable text. Future UI work uses Impeccable per AGENTS.md.

Manifest uses catalog/layout automatically; regenerate only those four PNGs with existing AssetFiles option; preserve other file bytes, no unrelated redesign. Provider digest changes for those four payloads/images; stable aliases updated/read back through existing operator flow. Old visible menus remain safe because server authority cannot derive from menu presence. No PNG, manifest, layout, catalog or provider resource changed now.

## 17. Privacy, cookies, CSRF, cache and browser contract

**Effective source configuration:** installed SSR 0.12.4 DEFAULT_COOKIE_OPTIONS has Path=/, SameSite=Lax, HttpOnly=false, maxAge=400 days, no explicit Secure or Domain. Wrappers pass no cookieOptions. Do not describe current auth cookies as HttpOnly/Secure, or 400 days as authenticated session validity. Existing flow is server credential submission; no first-party browser Supabase client found. Actual Set-Cookie attributes/HTTPS/proxy behavior remain external evidence. Do not silently harden every auth cookie as MINI navigation work; any change requires a separate scoped Auth compatibility/remediation review.

SSR proxy forwards the second setAll headers parameter; server wrapper does not. Sensitive gateway/verification/scoped responses must explicitly set Cache-Control: private, no-store and avoid CDN/ISR/data caching; auth Set-Cookie responses must retain SSR private/no-cache/no-store headers, Expires: 0, Pragma: no-cache through hosting. Review server-wrapper header gap before production; do not claim source alone proves every response uncached. No cross-request actor/binding/business-result cache. GET/RSC/prefetch errors must not return previously cached Patient payloads.

Future dependency is precise: src/lib/auth/supabase-server.ts must expose the SSR setAll cache-header argument to writable scoped Route Handler response construction (a server-only response-header callback/collector), while preserving current cookie behavior. src/lib/auth/supabase-proxy.ts/proxy.ts must retain refreshed cookie/header propagation and apply scoped no-store/no-referrer to page/RSC/error responses and dispatch denials. The two interaction handlers and verification handler independently merge required auth headers onto their own success/error responses. No rendering-time cookie writes or middleware-only authorization; edge/CDN must respect these headers and exclude sensitive routes from cache. This bounded response seam is implementation work, not an already fixed header gap or an app-wide cookie change.

Required controls:

- Raw LINE ID proof only in transient memory -> HTTPS same-origin POST body -> HTTPS LINE verify body. Never app-authored query/fragment/URL/referrer/storage/persistence/log. Do not use decoded profile/userId as proof. No access token is needed for this first workflow's ID verify.
- Initial URL/state/menu/login return: finite intent only; no HN/National ID, LINE subject, User/Person/Patient/Hospital/relationship/appointment locator, role authority or clinical data. Internal authorized DEMI links/form resource fields remain domain-validated; no permanent-link/share export of resource routes.
- Set Referrer-Policy: no-referrer on gateway/scoped sensitive pages and responses; no complete primary URL in ingress/CDN/APM/analytics/crash reporting. Suppress query capture at host before SDK cleanup. Exclude unnecessary third-party code before init; sanitize even after init; no identity-based analytics tags.
- POST endpoints require exact canonical Origin and body/schema/size/abuse limits; scoped Route Handlers reject absent/null/mismatched Origin independently of Next checks. Configure trusted proxy Host/X-Forwarded-Host; no permissive wildcard. HttpOnly/SameSite do not alone establish CSRF protection or current binding.
- Credential login and logout retain existing Supabase behavior; a login CSRF threat needs focused review of existing login Origin protections, not LINE bootstrap. Scope acquisition should use an explicit user continue/retry action; no linking side effect. If anti-CSRF challenge is introduced, bind it to exact session/action and keep it out of URLs, following account intent responsibility without changing binding semantics.
- Selected scope cookie settings in section 12 require future implementation/operator verification. Cookies are shared across tabs; no tab isolation promise. Missing cookies show recovery rather than weakening authentication. External browser login operates there independently; no credential handoff via URL.
- Avoid iframe architecture. Require a reviewed frame-ancestors 'none' policy for gateway/scoped pages where hosting permits, with compatibility testing; record deployed headers instead of claiming a CSP exists. App-wide CSP/auth-cookie changes are separate review work.
- BFCache/back/visibility restore: conceal stale sensitive view, disable controls pending server reauthorization/refresh, remove stale client control state; no-store is not a universal BFCache prohibition. This cannot retroactively erase delivered pixels/screenshots or replace action guards.
- Logs: operation/finite intent/outcome/status class/duration/nonidentity correlation ID only. No provider response, raw exception, subject/fingerprint/session hash/ID, credential, challenge, raw postback/query, clinical content, IDs or hidden identity in analytics. Existing domain audit unchanged; no new routine clinical-read audit.

## 18. Failure matrix

HTTP below is the proposed transport result; pages may render a safe error shell with equivalent outcome. Future Server Action state must carry sanitized error rather than pretending every action response is HTTP 403. **All denial/unavailable rows disclose no new Patient data and must never map to empty appointments.** Only a fully authorized successful query with no records may use existing empty UI.

| Failure | Detection boundary | HTTP/UI | Recovery / retry | Safe telemetry |
| --- | --- | --- | --- | --- |
| Missing MINI configuration | trusted tuple parser | 503 unavailable | operator fix, explicit retry | CONFIG_UNAVAILABLE |
| Wrong environment LIFF ID | deployed tuple/SDK init + audience verify | unavailable/400 proof failure | fix deployment tuple | ENVIRONMENT_MISMATCH |
| Wrong token audience / cross-channel substitution | LINE adapter/provider + aud equality | 400 invalid proof | restart correct MINI app, never audience fallback | IDENTITY_INVALID |
| Invalid/expired ID token | provider + schema/exp | 400 invalid proof | fresh SDK proof/restart | IDENTITY_INVALID |
| LINE timeout/network/429/5xx | provider adapter | 503 unavailable | explicit bounded later retry | PROVIDER_UNAVAILABLE |
| Malformed success response | adapter schema | 503 unavailable | later retry/operator | PROVIDER_RESPONSE_INVALID |
| Missing DEMI session | Auth boundary | 401 login required | normal same-browser login -> gateway | AUTH_REQUIRED |
| Expired DEMI session | validated claims/user/session | 401 login required | normal login; fresh scope | AUTH_REQUIRED |
| Inactive/unmapped DEMI User | canonical actor/current DB | 403 generic ineligible | account/support correction | WORKFLOW_INELIGIBLE |
| Missing ACTIVE binding | exact verified subject/current binding query | 403 management state | explicit Account flow then restart | WORKFLOW_INELIGIBLE |
| Multiple/conflicting binding state | exact cardinality/constraints | 403 generic denial | operator investigates; never choose first | BINDING_INCONSISTENT |
| Binding User != session User | server equality before business read | 403 generic mismatch | explicit logout/login, fresh verification | ACCOUNT_MISMATCH |
| Missing PATIENT role | canonical + persisted SELF | 403 ineligible | normal authority correction | WORKFLOW_INELIGIBLE |
| Missing PatientProfile | minimized domain identity check | 403 ineligible | profile/activation correction | WORKFLOW_INELIGIBLE |
| No own Hospital relationship | existing identity helper | 403 ineligible | relationship correction | WORKFLOW_INELIGIBLE |
| Scope expired | mandatory scoped guard/server time | 403 restart required | fresh gateway, no sliding renewal | SCOPE_EXPIRED |
| Scope revoked/unlinked | current binding/version | 403 management/restart | explicit corrected binding, fresh proof | SCOPE_REVOKED |
| Scope another DEMI session | verified session hash match | 403 generic mismatch | fresh gateway in current session | SCOPE_SESSION_MISMATCH |
| Missing/tampered scope cookie | mandatory scoped guard | 403 restart | fresh gateway; never ordinary fallback | SCOPE_INVALID |
| POST/ordinary action ID on scoped rendering page | fixed receiving-route dispatch filter | 405 no-data | correct scoped UI, never forward | WORKFLOW_TRANSPORT_DENIED |
| Missing/null/mismatched Origin | scoped handler before verify/mutation | 403 no-data | same-origin UI only | WORKFLOW_ORIGIN_DENIED |
| Unavailable/unattested liveness capability | Auth-owned gate | 503 unavailable | evidence/operator recovery, no JWT-only fallback | SESSION_LIVENESS_UNAVAILABLE |
| Tampered/duplicate/unknown intent | finite classifier/strict schema | 400 invalid entry | clean bare permalink | NAVIGATION_INVALID |
| Arbitrary returnTo attempt | Auth shared allowlist | safe /app default; gateway rejects | clean bounded login link | RETURN_INVALID |
| Unexpected liff.state | shell + post-init landing classifier | safe invalid entry, no business route | clean bare permalink | PLATFORM_STATE_INVALID |
| External cookie rejection | login-return/gateway session check | login-required recovery, no loop | same-browser cookie guidance/restart; deliberate ordinary access separate | COOKIE_CONTEXT_UNAVAILABLE |
| Malformed provider redirect | init failure/invalid landing | unavailable/400 shell | clean permalink/operator config | PLATFORM_REDIRECT_INVALID |
| Copied/replayed MINI permalink | fresh gateway proof/binding/session | authorized root only or generic deny | recipient's normal own checks | ENTRY_RECHECKED |
| Replayed context after logout | exact live-session/context check required | 401/403 deny | new credential session + gateway | SCOPE_SESSION_INVALID |
| Stale BFCache page | client restore recheck + mandatory server guard | conceal/retry; server denies invalid scope | fresh gateway/refresh | RESTORE_RECHECK_REQUIRED |
| Scoped interaction after unlink | scoped POST handler + transaction precondition | generic denied action state | account management; no write/replayed success | SCOPE_REVOKED |
| Scoped interaction after account switch | handler session/context equality | generic mismatch action state | fresh gateway; no A/B scoped write | ACCOUNT_MISMATCH |
| Foreign/malformed internal resource | existing SELF/domain locator checks | not-found/current safe domain error | return authorized scoped root | RESOURCE_DENIED |
| Stale version / nonce conflict | existing Appointment transaction | existing conflict action state | reload/re-authorize; no blind resend | DOMAIN_CONFLICT |
| Transient DB/Auth/host failure | infrastructure boundary | 503 unavailable / safe action error | explicit later retry | INFRASTRUCTURE_UNAVAILABLE |
| Local abuse limit | bounded transport before costly verify | 429 wait state | bounded later retry | WORKFLOW_RATE_LIMITED |

## 19. Threat model

| Threat | Required mitigation / unresolved boundary |
| --- | --- |
| Spoofed subject, forged getProfile/decoded token | Only server-verified raw ID token; exact current binding. |
| Audience confusion/cross-channel substitution | Distinct Account/MINI entry points, server-selected singleton deployment tuple; aud/issuer/expiry validation. |
| Malicious LIFF URL/open redirect | Bare permanent root, trusted endpoint, finite intent/return classifier; platform state never target authority. |
| Login CSRF/post-login wrong account | Preserve credential flow, Origin checks, fresh gateway after login, exact A/A equality before Patient read; generic A/B deny. |
| Stale/removed binding/relink | Mandatory per-request current binding/lifecycle guard; previous version never resumes on subject equality. |
| Scope replay/session fixation/logout replay | Exact validated session_id hash, expiry/host/environment purpose, live-session/revocation gate; new login cannot reuse old context. |
| Cookie removal/downgrade/unsigned client state | Mandatory scoped namespace/handlers deny missing scope; ordinary routes remain independent. Dispatch filter rejects ordinary Server Action calls through scoped page POSTs. |
| Cross-tab contamination | Shared cookie acknowledged; mandatory scope namespace, ordinary namespace independent; session switch invalidates old scoped requests. |
| Resource-ID injection/unauthorized action | Root-only entry; internal domain schemas/current SELF; scoped action must guard itself, not trust UI/action ID/receiving route. |
| Copied links | No sender identity/credentials in link; recipient proves own LINE + DEMI + SELF, same checks. |
| Stale client rendering/BFCache | Conceal/reverify plus server request guards; no retroactive-erasure promise. |
| Analytics/referrer/cache leaks | no-referrer/no-store, ingress query suppression, no early analytics/token/body/raw exception capture. |
| External-browser isolation | Same browser normal login/reentry, no session transfer, unavailable recovery not authentication downgrade. |

Findings are design risks, not claims of newly discovered exploitable defects in existing ordinary-web access. B17J3-01 is resolved at design level; B17J3-02 composition is selected with future concurrency evidence required. MINI deauthorization exception/recovery review prevents clearance; B17J3-03 provider verification is closed for the measured configuration. No domain authorization expansion is proposed.

## 20. Proposed code-change inventory — held, no edits now

Paths marked NEW are future candidates written as plain text because they do not exist. Do not add every candidate automatically.

| File/seam | Responsibility / dependency boundary |
| --- | --- |
| src/lib/env/server.ts | Selected MINI tuple validation/public prop; lazy isolation from Account/ordinary web. |
| src/modules/line/adapters/line-login-client.ts; NEW line-mini-app-client.ts | Preserve Account verifier; private low-level verify reuse, separate MINI trusted entry point; no caller audience. |
| NEW app/line/workflow/page.tsx; line-workflow-client.tsx | Initialization shell, finite intent, explicit browser login/retry, no business data. |
| NEW app/api/line/workflow/verify/route.ts; src/modules/line/transport/workflow-http.ts | Strict POST/Origin/body/error/no-store boundary; bounded verify orchestration. |
| NEW src/modules/line/services/line-workflow-service.ts; line-workflow-context-service.ts | Provider proof/binding/session consistency orchestration; selected context integrity/lifecycle and mandatory scoped request boundary. |
| src/modules/auth/schemas/login-schema.ts; NEW src/modules/auth/services/login-return-service.ts | One return classifier/resolver; preserve legacy Family/Account behavior; finite workflow intent imported from small server-safe navigation constant, no Auth -> LINE service import. |
| app/login/page.tsx; app/login/login-form.tsx; src/modules/auth/transport/server-actions.ts | Both workflow return paths, preserve Family precedence/cleanup, error/default/local logout. |
| Auth session boundary / existing line-session-service.ts | Auth owns verified exact-session/liveness assertion. Existing Account HMAC remains unchanged; MINI uses independent purpose/key. Do not treat getCurrentLineSession alone as ACTIVE actor or liveness proof. |
| app/app/personal/patient-self-relationship-navigation.tsx; patient-self-record-detail-views.tsx; appointments/patient-appointment-interaction-controls.tsx | Finite link/action injection for same UI under scoped adapters; ordinary defaults unchanged. |
| NEW app/line/workflow/appointments/page.tsx and relationship/detail descendants | Reuse UI/domain loaders; mandatory per-read guard; broader care exits to ordinary routes, no scoped care adapters. |
| src/modules/patient-self/transport/patient-self-care-page-context.ts and query seams | Compose approved scoped guard with current domain read, reuse TransactionClient dependencies; domain must not import LINE integration. |
| NEW app/line/workflow/appointments/acknowledge/route.ts and cancellation-request/route.ts; appointment-service.ts | Fixed POST handlers with mandatory scope; precondition before every callback/idempotent return; ordinary Server Actions unchanged. Extract only shared strict parsing/result mapping as needed. |
| proxy.ts; scoped client transport adapter | Finite scoped method/path rejection before Next action dispatcher, retain Supabase refresh; client calls only fixed POST handlers. Does not replace server authorization. |
| NEW src/modules/auth/services/auth-session-continuity-service.ts | Capture/verify exact JWT/session; provider-backed liveness using the section 12.2 verified mechanism; no new session table. |
| src/modules/line/services/line-deep-link-builder.ts; rich-menu/catalog.ts; layout.ts | One MINI permalink intent; four eligible variants and three top hit areas only. |
| scripts/line-rich-menu-asset-manifest.ts; generate-line-rich-menu-assets.ps1; four public/line/rich-menus/patient*.png | Existing generator selective update; avoid changes if manifest already supports layout/labels. |
| Adjacent unit/UI tests; tests/integration/appointments.integration.test.ts; line-account-linking.integration.test.ts | Future audience/return/scope/action/domain/revocation regressions, DB only where actual transaction invariant needs it. |
| CANDIDATE narrow LINE lifecycle persistence/termination transport | Section 23.1 exception draft only: per-binding/channel pending generation, unlink/relink fence and explicit recovery; review required before any schema or Account behavior change. No raw token storage or generic session/sync framework. |
| NEW MINI external setup/UAT runbook; CONTEXT/runtime handoff | Operator tuple proof, publication/channel ownership, real-device evidence, truthful implementation status. |

No schema/table candidate selected. LINE owns integration; Auth owns credential/session; Patient SELF owns personal read authority; Appointment owns business mutations. Shared finite navigation values must not create cyclic service imports or a generic router. Review security composition seam before accepting inventory as implementation instructions.

## 21. Proposed implementation sequence — held

0. B17J3-03 evidence is complete for the measured configuration; resolve/review the MINI lifecycle exception and recovery release; review selected dispatch/context/transaction model. B17J3-01 owner clarification is recorded. **No runtime work while NO-GO.**
1. Confirm explicit deployment/environment/audience tuple and operator ownership contract.
2. Implement separate bounded MINI server verifier, preserving Account audience tests.
3. Implement one finite intent/login-return model and both workflow return paths.
4. Implement/prove mandatory lifetime request classification and exact-session current binding checks, including action transaction seam. No gateway-to-ordinary-route fallback; scoped Route Handler POSTs only and explicit care exit.
5. Integrate gateway with normal DEMI login and fresh post-login checks.
6. Reuse/protect existing UI/read/action entry; maintain domain rules/ordinary-web independence.
7. Add one Patient menu action/geometry/four PNGs only after security boundary works.
8. Focused behavioral tests and PostgreSQL checks only for actual guard/transaction invariants; source/layout/privacy checks; proportional lint/typecheck per package scripts.
9. Automated security regression review against section 22 before claiming runtime completion.
10. Prepare operator provisioning and device UAT runbook; perform external steps separately when authorized.

No step above is performed in this documentation phase. No automatic 17J.4 work.

## 22. Automated acceptance plan — future, not executed

| Area | Mandatory cases / observable acceptance |
| --- | --- |
| A Configuration/audience | Separate D/R/P tuples; wrong environment/channel rejected; no arbitrary client_id; Account audience unchanged; same-Provider subject never bypasses aud; missing MINI config leaves ordinary web/Account available. |
| B Identity proof | Valid server verify; wrong issuer/aud/expiry/subject; malformed provider success; timeout/429/5xx; forged profile/decoded claims ignored; no persistence/log/URL of proof; request limits/Origin. |
| C Login/return | No session normal login; existing session gateway; both already-authorized and successful-submit paths fresh gateway; Account exact return unchanged; Family submit/fragment precedence/cleanup and current already-authenticated fallback preserved; failed/inactive/unmapped; bad return default; no loops/cookie loss/different browser. |
| D Binding/session | A/A with persisted SELF accepted; A/B no data; no ACTIVE/ambiguous binding denied; unlink/relink/version/key/environment change; same User new session denied; role/profile/User revoked; expired/tampered/replayed context; no flags/referrer/profile grant. |
| E Lifetime | Every root/history/detail GET/RSC/prefetch/read; pagination/reload; both scoped POST handlers directly invoked; ordinary action IDs submitted to scoped pages rejected before dispatcher; unlink/account switch before submission; expiry/log-out/relogin; concurrent scoped + ordinary tabs; cookie deletion denies scoped and ordinary web still works; dated owner-approved explicit care exit; BFCache restore conceal/recheck. |
| F Domain regression | Persisted SELF scope/data breadth/Hospital-history semantics unchanged; mutation Hospital ACTIVE/version/nonce/idempotency/audit/transaction behavior unchanged; no Family/caregiver leakage, new Patient mutation, OSM/Hospital workflow or J2 Reply changes. |
| G Rich Menu | Exactly four new URI variants, preserved existing actions/switches/postback; 18 count; correct selected MINI bare URL, no hardcoded live ID; integer positive in-bounds/non-overlapping areas; four PNG changes only, digest/readback compatibility. |
| H Concurrency/transaction | Read snapshot after revocation commit denies; mutation authorization point after revocation denies; binding version changes during retry rechecked; unlink/action lock serialization; no idempotent-success disclosure before scope check; no nested transaction/provider I/O under locks; explicit in-flight race. |
| I Privacy/cache/browser | No token/provider body/raw exception/primary URL/identity analytics; sensitive no-store/no-referrer/Set-Cookie propagation; exact Origin/null denial; no cached cross-user rendering; unsupported SDK state/error produces no Patient data. |

Executable evidence classes:

| Category | Future case / appropriate evidence |
| --- | --- |
| A Request isolation | Unit handler denies missing/malformed scope; running Next integration GET/RSC/prefetch/reload has no unauthorized projection; POST ordinary action ID/form to each scoped render path rejected; direct handler lacks scope -> denial; concurrent ordinary tab works after unlink. Source checks every loader/handler guard and no ordinary adapter fallback. |
| B Identity/session | Unit A/A eligible and A/B generic denial; DB unlink/relink/User/role/profile regressions; section 12.2 operator matrix verifies same captured JWT after effective local/admin revocation, expired/tampered token, refresh retaining S1, same-User S2 denial and actual selected timeout-policy boundary. Health PASS is not revocation PASS; mocks cannot close B17J3-03. |
| C Concurrency | PostgreSQL barriers schedule unlink before/after User+binding authorization locks for both interactions; force retry with changed lifecycle; revoked nonce/idempotent replay denies; menu repair contention remains bounded without inconsistent order or committed partial write/audit. |
| D Navigation | Component/source root/history/detail/pagination/back links and fixed POST transports; Thai care exit visible before ordinary destination; Next integration invalid return/default/Account/Family; real iOS/Android/external-browser back/reload/BFCache/cookie failure has no downgrade. |
| E Regression | Existing focused SELF/Appointment/Account/Family/J2 tests preserve behavior; no new mutation/role/Hospital-history restriction; ordinary controls retain existing transports; four-menu catalog/layout/PNG checks later. |

Use existing scripts when later authorized: npm run test -- <explicit affected paths>; npm run test:integration:focused -- <affected integration path> only where needed; npm run lint; npm run typecheck. package.json has no architecture:check or lint:strict scripts; do not invent PASS claims. Full suite/build only when risk and AGENTS.md justify them. No repository test code or application test command was added/executed; the temporary targeted Auth harness results are recorded separately in section 12.2. Mocks cannot establish operator/device evidence.

## 23. External provisioning and manual UAT gates

Operator separately confirms same DEMI Provider for all channels, each internal channel ID/audience/LIFF ID/endpoint/deployment pairing, HTTPS/public origin, openid proof/consent behavior, tester/reviewer access, Console settings-copy lifecycle and publication/verification choice. No real IDs/tokens/resources verified or provisioned here; Published existence in platform topology is not a successful publication claim.

Manual UAT must cover LINE iOS and Android, Developing environment, external browser, existing/no DEMI session, LINE A/browser A and A/B, copied link, logout/relogin, unlink while open, session expiry, PATIENT authority removal, back/reload/BFCache, both current Appointment interactions, old Rich Menu compatibility, wrong channel/LIFF/endpoint and cookie rejection/handoff. Record OS/LINE/browser/SDK versions, environment and measured headers/cookies. Review/Published readiness evidence remains separate; mock PASS does not replace device results.

No MINI App service messages, Push, reminder preferences/consent/quiet hours, proactive notifications or provider load testing included.

### 23.1 MINI App deauthorization lifecycle — final gate disposition

#### Owner clarification and bounded exception draft — 2026-10-08

The owner now authorizes **drafting a narrowly scoped MINI App termination exception for review before implementation**, rather than seeking a LINE non-applicability exception. This is permission to prepare the design, not approval to change the existing Account runtime, provision channels or declare implementation GO. Historical Q07/Account-preservation decisions remain unchanged pending that review. Separately, the owner explicitly accepts that an undetected remote permission withdrawal may leave an already-issued context usable for **at most min(15 minutes, verified proof expiry)**, with current exact DEMI session, local binding/lifecycle and SELF checks on every scoped request. No sliding renewal or immediate remote-notification guarantee is introduced. Local unlink still invalidates scope at its local serialization boundary.

**Exception draft to review:** retain the existing Account LIFF/channel/audience, normal credential login and local unlink transaction. Extend only the MINI-grant termination obligation: disclose remote permission removal at the unlink/termination confirmation; immediately revoke the local binding even if no device/token/provider is available; show local revocation and remote completion as separate outcomes. When a valid selected-channel user access token is available, attempt the supported deauthorize call outside local locks. Without that token, leave remote completion pending and offer an explicit MINI termination-only recovery entry or operator-assisted removal through LINE Authorized apps. Recovery must never relink or create Patient access. Logging out, leaving the workflow and an ordinary navigation exit are not service termination and cause no deauthorization.

Minimal transient proof candidate: initialize the selected MINI tuple, send fresh ID token and user access token in the HTTPS request body, verify ID-token audience/subject server-side, and use supported [POST userinfo](https://developers.line.biz/en/reference/line-login/#userinfo) with the access token in its Bearer header to match its subject without adding profile scope. The remote deauthorize call must use that tuple's stateless channel credential; only successful same-channel provider validation can establish completion. An Account token, ID token alone, subject locator or generic 400 never substitutes for the required MINI user access token/channel pairing. No raw proof/token persistence or browser navigation token transport is authorized.

**Required concurrency consequence, not implemented:** in-memory locks or a lifecycle comparison followed by provider I/O cannot fence unlink/relink across processes. A narrowly scoped, durable LINE-owned per-binding/per-trusted-channel termination record is therefore a demonstrated requirement of this exception candidate. Proposed record seam **LineMiniAppAuthorizationLifecycle** stores only binding reference, server-allowlisted tuple identifier, binding lifecycle at observation/termination, operation generation, observed/pending/confirmed status, and sanitized timestamps/outcome. It stores no token, raw LINE subject, clinical data or Supabase session. Its uniqueness and finite channel/environment bounds must be reviewed against actual deployment isolation; a single deployment tuple must not erase obligations for previously observed other internal-channel grants. Existing Rich Menu providerCleanupState is not remote-authorization state and must not be repurposed. This proposed persistence is not a custom DEMI session table, general synchronization framework or schema change in this task.

Register observed MINI authorization coherently before issuing any scope. Compose local unlink and transition of all relevant observed grants to TERMINATION_PENDING in the existing User-before-binding Serializable transaction; include the same pending fence in explicit Account relink and MINI reentry transactions. While pending, local unlink remains complete and ordinary DEMI access remains independent, but automatic/new LINE relink or reentry must fail safely with an explicit termination-recovery state. This is the narrowly identified Account behavior exception requiring review. Remote recovery is authenticated/account-authorized and single-purpose; an unlinked subject is matched to retained server-owned evidence, never a client-selected target. Every provider attempt requires a current pending generation; retries recheck it and cannot be launched after relink or confirmed completion. No provider I/O under DB locks or nested transaction. A confirmed response changes only the matching still-pending generation; stale responses cannot modify a later local lifecycle. No background retry worker or retained tokens is proposed.

**Completion/recovery gate:** API 204 establishes remote completion for the verified tuple. Generic 400, missing/expired token, timeout or lost response remains unconfirmed; no automatic restoration, completion or relink. An audited operator-confirmed Authorized-app removal is a possible no-token recovery path to review; evidence must identify the correct internal channel, not only an app display name; a client checkbox alone is not provider evidence. Specify the authorized operator, evidence and release rule before exposing it. Remote calls and consent changes cannot be serialized atomically with the DEMI DB: a timed-out already-submitted call can finish late. A database fence prevents new stale retries and stale local updates, not late provider effects on reauthorization outside DEMI. No guaranteed cancellation/drain or cross-provider atomicity is claimed. Review must disposition this residual availability/reauthorization race and recovery before the pending fence may be released. Do not hide an unresolved release rule inside runtime TODOs.

**Current disposition: EXCEPTION DRAFT / REVIEW REQUIRED / NO-GO.** The bounded remote-withdrawal behavior is owner accepted; termination applicability and the transient provider capability are established. The exception's Account fence, narrow persistence, all-path recovery/relink release and residual late-provider effects still require an explicit technical/owner review. No live LINE call or device test was executed. This draft does not claim that every termination obligation is already resolved.

**EXCEPTION DRAFT / REVIEW REQUIRED.** Applicable platform duties are established; current integration cannot yet demonstrate completion for all termination paths. This is not a reason to reopen route/context/Appointment architecture or to weaken local unlink. Sources below were checked **2026-10-08**.

The [MINI App guidelines](https://developers.line.biz/en/docs/line-mini-app/development-guidelines/#deauthorize-your-app-when-a-user-unregisters-from-your-app) require remote permission removal and nearby/registration disclosure for unregistration or app-to-LINE link termination. They do not equate navigation exit, DEMI logout, binding removal and channel consent withdrawal. The conservative engineering interpretation is that a DEMI operation advertised as terminating its LINE connection must not silently retain the MINI grant; no official exception for a shared-Provider binding or thin presentation integration was found. Treating Account unlink as outside that duty would require a documented LINE provider determination, not merely relabeling the operation.

The [deauthorize API](https://developers.line.biz/en/reference/line-login/#deauthorize) supports MINI Apps but requires a channel access token and target **userAccessToken**. It returns 204 on success; 400 for invalid target tokens can include already-deauthorized cases, so a generic 400 is not proof of completion. This is distinct from access-token revocation and SDK logout. A subject/ID token/binding ID cannot replace userAccessToken. Same Provider does not authorize cross-channel credentials.

For MINI channel authentication, the [console guide](https://developers.line.biz/en/docs/line-mini-app/discover/console-guide/#issuing-a-channel-access-token) establishes per-internal-channel credentials: choose **stateless channel token**, not the Account or Messaging credential and not MINI v2.1/long-lived channel tokens. [LIFF getAccessToken](https://developers.line.biz/en/reference/liff/#get-access-token) supplies transient user proof after initialization/login; validity can end early, including close/permission changes. [Consent flow](https://developers.line.biz/en/docs/line-mini-app/develop/channel-consent-simplification/) can simplify openid consent but does not establish a deauthorization exemption. Region/configuration and actual token availability need operator evidence; no real IDs or grant settings are assumed.

The matrix below records current local behavior and platform duties. The dated exception draft above adds proposed MINI-only pending/relink restrictions; those restrictions are not historical Account approvals or current runtime behavior.

| Event / initiating actor | Authority and local effect | Remote duty / available credential / recovery | Account LIFF impact |
| --- | --- | --- | --- |
| Initial MINI authorization / LINE user | LINE owns channel grant; DEMI creates no User/session/binding | Authorization, not termination; no deauthorize. SDK token may be transiently available after init | None; separate grant |
| Existing binding / DEMI user | DEMI owns explicit binding/lifecycle; no implicit grant in new channel | Existing Account proof is not a MINI token; no termination call merely for existing binding | Existing behavior retained |
| Workflow entry / Patient | Fresh server MINI proof, current DEMI session/binding/SELF; issue bounded context | No deauthorize; no retained LINE tokens; proof failure denies entry | No verifier/audience change |
| Explicit DEMI Account unlink / DEMI user | Local commit immediately unlinks/increments lifecycle; stale scoped reads/actions deny under selected guards | Treat termination duty as applicable pending provider determination. Current unlink sends intent/challenge only; no MINI user token. Local success is not remote success; retain local denial on provider failure | Preserved local unlink; required remote completion path is an unresolved separate lifecycle decision |
| MINI permission withdrawal / LINE user | LINE owns remote grant; not automatically a DEMI binding mutation | Remote removal already performed; no duplicate call required solely for completed removal. [Authorized-apps guidance](https://developers.line.biz/en/docs/line-login/managing-authorized-apps/) invalidates access/refresh tokens; next proof/consent must be reacquired, not trusted from unchanged subject | Do not assume Account grant removed too |
| Service unregistration / user or operator | Local authority revocation must precede any remote dependency; no new deletion/retention operation approved | MINI duty applies when service unregisters/terminates link; token may be absent for offline/admin paths. Completion mechanism/disclosure must be decided before exposing such a path | Existing Account/LIFF guidelines also need separate applicability review, not silent changes |
| Reauthorization / LINE user | New channel permission only; cannot reactivate local binding or stale context | Obtain current proof; deauthorize not required for authorization itself | No automatic Account grant/binding change |
| Relink same DEMI User / DEMI user | Existing explicit Account policy/reactivation increments lifecycle; prior context remains invalid | Remote authorization and local relink are separate; gateway must recheck after both | Existing explicit flow unchanged |
| Relink other DEMI User / DEMI user | Only existing retained-history/conflict policy can permit; no transfer approved | New grant does not override conflict; no deauthorize-based bypass or automatic rebind | Existing policy remains authoritative |
| Channel consent/token expiry / LINE platform | Token expiry alone is not local unlink; invalid fresh proof denies | No deauthorize merely for expiring a token. Reauthorization/valid proof needed; wrong channel fails. Remote termination requires the separate duty above | No cross-channel inference |

**Supported bounded candidate, not an approved Account change:** on an explicitly authorized MINI termination interaction, obtain current MINI userAccessToken only in memory, send in HTTPS body, verify channel/subject association server-side against current trusted tuple/binding and Auth/CSRF authority, commit local revocation first, then call remote deauthorize outside DB locks with the correct stateless channel credential. Verify identity association using supported provider user-data verification; never trust getProfile client fields. Do not use a profile scope or an arbitrary token target without reviewing the actual required scope/API. No provider I/O under binding locks, token persistence, background worker or token table. A same-subject Account token cannot deauthorize MINI by substitution.

On remote timeout/error, report local revocation complete and remote completion unconfirmed separately; never restore local binding. Explicit user-assisted recovery may reacquire the correct channel token solely to terminate, or guide removal under LINE Authorized apps; do not automatically relink to recover. A retry after relink must never apply stale termination to a newer lifecycle. Because channel grant and DEMI DB cannot be committed atomically, overlapping relink/reauthorization needs an explicit lifecycle/retry decision; lifecycleVersion alone cannot undo remote effects. No unattended guaranteed retry is promised without retained credentials.

**Review still required:** the owner has authorized preparing the exception above; review must approve a channel-specific termination and disclosure path covering unchanged /line/account unlink, unavailable LINE devices, offline/service termination, concurrent relink and already-withdrawn grants, under the selected exception direction. No non-applicability exemption is asserted. The existing Account [LIFF guidelines](https://developers.line.biz/en/docs/liff/development-guidelines/) carry the same class of obligation; its lack of remote permission removal is a pre-existing applicability gap, not authority to migrate or alter Account LIFF in this task. No new ADR is created while that cross-channel product/provider disposition is unselected.

Remote withdrawal has **no inspected server notification guarantee** to mutate DEMI binding or erase an already-issued stateless context. ID-token verification is not documented as continuous grant introspection. An undetected withdrawal can leave a bounded context usable while DEMI session/binding/SELF remain live until absolute expiry; user data already rendered cannot be erased. Do not claim immediate remote-withdrawal denial from Q16's local-binding checks. The dated owner clarification accepts that bounded behavior; new gateway entry must still obtain fresh proof and no stale-context renewal is allowed; it must not be hidden as an implementation assumption. Local unlink remains immediately authoritative at the selected local serialization boundary.

| Requirement | Evidence | Verification type | Result | Remaining risk |
| --- | --- | --- | --- | --- |
| Termination requires deauthorization/disclosure | MINI guidelines above | Official documentation | VERIFIED obligation for qualifying events | Mapping all DEMI unlink/service paths unresolved |
| Channel and user credentials; response semantics | Deauthorize API, console guide and LIFF reference above | Official documentation | Supported transient interactive mechanism | No MINI provisioned/test credential or executed call |
| Local unlink / token availability | line-account-service.ts and line-account-client.tsx: unlink posts intent; link/reachability tokens transient | Repository source | VERIFIED local-only unlink, lifecycle invalidation | No MINI termination transport/current remote completion |
| Withdrawal invalidates access/refresh tokens; subject can remain same | Authorized-apps guidance | Official documentation | VERIFIED distinction | No instantaneous server notification/context invalidation demonstrated |
| Compatible termination exception | Dated owner direction above authorizes a draft; bounded remote-withdrawal lifetime accepted | Owner clarification / proposed design | EXCEPTION DRAFT / REVIEW REQUIRED | Persistence/fence/recovery release and late provider effects not yet approved or runtime-tested |

Future exception acceptance also requires unit/DB evidence for grant observation before scope issuance, atomic unlink-to-pending, all relevant channel obligations, relink/reentry denial while pending, stale-generation response/retry rejection, unauthorized/manual-release denial and unchanged ordinary-web access. Timeout followed by external reauthorization must explicitly exercise the documented late-provider-effect limitation. No test is marked PASS.

Future lifecycle acceptance requires real disposable LINE accounts/internal channel: same-channel 204, wrong-channel rejection, missing/expired user token, remote timeout after local commit, already-withdrawn ambiguous 400, withdrawal while workflow open, explicit recovery without relink, and concurrent relink versus retry. Record provider/API outcomes without tokens/subjects. Local lifecycle and no-restoration assertions need unit/DB integration tests; grant behavior requires device/operator evidence. **All are NOT RUN**; neither mocks nor successful Rich Menu cleanup prove deauthorization.

## 24. Residual risks and explicit review items

| Item | Required resolution / disposition |
| --- | --- |
| B17J3-01 route/provenance and care navigation | **RESOLVED AT DESIGN LEVEL** by dated owner namespace/explicit-exit direction; endpoint guards, POST dispatch rejection and UI adapters specified. Not implemented/runtime-tested. |
| B17J3-02 mutation serialization | **DESIGN SELECTED**: first-callback User-then-binding lock/recheck inside existing Serializable interaction transaction, including retries/idempotent returns. Future PostgreSQL concurrency/deadlock verification required, no current PASS. |
| B17J3-03 exact-session liveness/logout replay | **VERIFIED / CLOSED** for measured Demi-dev/Auth v2.197.0 with disabled inactivity/time-box policies: real local revocation/replay, new-session/cross-User distinction, refresh continuity, signature rejection and natural JWT expiry pass. Installed signOut delegates to the same admin.signOut/local endpoint; no separate privileged mutation PASS. Strict nominal policy deadlines and future Auth seam/runtime are not certified. See section 12.2; no new session witness required. |
| MINI App deauthorization lifecycle | **EXCEPTION DRAFT / REVIEW REQUIRED / NO-GO**: section 23.1 establishes termination/disclosure duty and channel-specific stateless/user-token mechanism. Current Account unlink lacks MINI token/completion; owner accepts bounded remote withdrawal and authorizes the termination exception draft; persistence/fence/recovery release and late remote effects remain subject to review. No Account behavior change or token persistence approved. |
| Context/key/TTL/replay/cross-tab policy | Selected 15-minute authenticated encrypted restriction, independent keys/rotation and shared-cookie behavior explicit. Matching credential theft can replay while session/binding/authority live; no individual scope-revocation or single-use claim. |
| Cookie/cache/host security | Existing effective attributes and missing server-wrapper header forwarding recorded; deployment measurements/remediation review required, no automatic app-wide cookie/CSP rewrite. |
| Provider proof versus continuous SDK user | Context proves recent verified launch identity for accepted bounded lifetime; every request checks binding/session/domain. LINE-account switch itself is not a server-pushed event; require gateway reentry/fresh proof on reinitialization. If continuous current SDK identity beyond bounded launch context is required, specify fresh proof transport and availability before GO; do not promise instantaneous detection. |
| Data already rendered / in-flight revocation | No erasure of prior browser data/screenshots; snapshot-to-response/browser-cookie races acknowledged. Current checks must be as late/coherent as practical; no impossible atomicity with LINE/Supabase/network. |

No owner target/care decision remains open. B17J3-03 is closed for the tested configuration; MINI termination/recovery review remains an explicit gate, not hidden runtime TODOs. Focused consistency review found no new contradiction in mandatory scoped GET/RSC/POST classification, root/history/detail adapters, cookie-removal denial, ordinary-route independence, AES-256-GCM/purpose keys/session hash/lifecycle/absolute 15-minute cap, or User-before-binding Serializable precondition before every idempotent return/retry. No nested transaction/provider I/O under locks is introduced. Patient SELF/domain/nonce/version/audit, Account and Family return, J2 Reply/menu behavior and explicit care exit remain accepted design constraints. This is source/design review, not runtime PASS.

## 25. Explicit non-goals and unchanged governance

No LINE passwordless login, LINE-to-Supabase bootstrap, second authentication/session system, automatic switch/relink/merge/transfer, identity-history erasure, arbitrary deep link/resource first-entry, Family/caregiver/OSM/Hospital expansion, new Patient mutation, generic chatbot/NLU/conversation/workflow framework, iframe/second business app, medication reminders/adherence, native auth/app, offline sync, Push, service messages, notification consent/preferences/quiet hours, provider automation, real-device UAT claim or deployment.

Preserve existing Account LIFF/Login channel/link/unlink, OA/Messaging configuration, Option C menus, J2 deterministic narrow Reply. P17D-NOTIF-01 remains **OPEN**; exact identity-history retention/erasure and receipt retention/purge remain open under existing governance. Family Q5 real-data use remains **GOVERNANCE BLOCKED**, P17F-L04 **OPEN**, P17F-L05 **OPEN / FUTURE**, Phase 17E.2 consent parked, MED-02 requirement-gated, Follow-up prospective reminder source and medication delivery/adherence gates unchanged. No reminder/event/content authority follows from choosing MINI App.

## 26. GO / NO-GO and documentation validation

**NO-GO / REVIEW REQUIRED**, with **EXCEPTION DRAFT / REVIEW REQUIRED** for MINI lifecycle. Mandatory scoped routing, ordinary-web independence, bounded context and in-transaction unlink ordering remain accepted. B17J3-03 is VERIFIED / CLOSED for the measured development configuration; MINI termination requirements are known but a compatible all-path completion/withdrawal disposition is not approved. **TECHNICAL CONTRACT COMPLETE / REVIEWED / CLEARED FOR IMPLEMENTATION is not claimed**.

Clearance now requires section 23.1 exception/recovery-release review; section 12.2 evidence must be re-attested if deployment/version/policies differ, without changing preserved Account behavior silently. Recheck reported Auth capability when deployment/project/version changes. Future runtime/security/device tests remain separate implementation/deployment evidence; the health result alone cannot clear B17J3-03.

Documentation validation: current main/source/owner/ADR consistency, changed Markdown references, UTF-8/Thai labels and final diff/whitespace reviewed. Only this contract changes; no CONTEXT phase change, historical owner/ADR rewrite, runtime/schema/env/menu/asset/provider edit or deployment. Read-only project discovery/Auth health/policy inspection and targeted disposable-session Auth tests were executed as specified in section 12.2; natural-expiry denial and follow-up cleanup passed; separate privileged operator revocation and all LINE workflow tests were NOT RUN. No Auth settings or shared sessions were changed; only sessions created for this verification were locally signed out. No full tests/build/dev server/migration was run. Final executed validation results are in the completion report.

## 27. Final phase status and next step

- Phase 17J.2: **CLOSED / IMPLEMENTED / AUTOMATED VERIFICATION COMPLETE**.
- Phase 17J.3A: **CLOSED / OWNER DECISION COMPLETE**; Q07=C preserved.
- Phase 17J.3B: **TECHNICAL DESIGN BLOCKED / REVIEW REQUIRED**.
- Contract document: **TECHNICAL CONTRACT DRAFT / REVIEW REQUIRED**, recommendation **NO-GO / REVIEW REQUIRED**; MINI lifecycle **EXCEPTION DRAFT / REVIEW REQUIRED**.
- Phase 17J.3 runtime: **NOT IMPLEMENTED**.
- Phase 17J.4: **NOT STARTED**.
- P17D-NOTIF-01: **OPEN**.

Exact next step: **B17J3-03 is closed for the measured configuration; re-attest Auth version/settings for a different intended deployment; review the section 23.1 owner-directed termination exception, pending/relink fence and recovery release; then review 17J.3B for clearance.** If separately cleared, next is bounded **Phase 17J.3 MINI App workflow runtime implementation**, not 17J.4. This final gate review does not start it.
