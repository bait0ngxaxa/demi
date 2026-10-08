# Phase 17J.3B — LINE MINI App Workflow Technical Contract

- Document: **TECHNICAL CONTRACT DRAFT / REVIEW REQUIRED**.
- Phase 17J.3B: **TECHNICAL DESIGN BLOCKED / REVIEW REQUIRED**.
- Recommendation: **NO-GO / TECHNICAL BLOCKER / OWNER CLARIFICATION REQUIRED**.
- Reviewed HEAD: **bce95800deb026b35a5c4866c71b3027790f4b6a** — docs: close Phase 17J.3A owner decisions.
- Source and official-document verification date: **2026-10-08**.
- Initial working tree: clean. Repository: bait0ngxaxa/demi.
- Documentation only. No runtime implementation, provider provisioning, database change, or device evidence is delivered.

## 1. Status and interpretation

The source audit and feasibility review are complete. The approved same-origin Appointment URL, continuing LINE-scoped enforcement, and independent ordinary-web requests cannot all be demonstrated with the current request model. Section 12 records the blocker rather than treating a removable cookie as secure provenance. No lifetime mechanism is selected and this document is **not implementation-ready**. The unblocked integration boundaries below are draft technical requirements for review; conditional alternatives must not be implemented as if approved.

Phase 17J.2 remains **CLOSED / IMPLEMENTED / AUTOMATED VERIFICATION COMPLETE**; 17J.3A remains **CLOSED / OWNER DECISION COMPLETE**; 17J.3 runtime is **NOT IMPLEMENTED**; 17J.4 is **NOT STARTED**; P17D-NOTIF-01 is **OPEN**. Historical phase documents retain their original status labels. No accepted ADR contradiction was found in the product identity/authentication boundary; the unresolved issue is how to realize Q16 with Q01/Q04/Q10 in this repository. ADR-0009 is unchanged.

## 2. Authoritative owner decisions and sources

The [17J.3A owner closeout](./PHASE_17J3A_LIFF_WORKFLOW_SESSION_DECISION_CLOSEOUT.md) governs all Q01–Q16. The [decision pack](./PHASE_17J3A_LIFF_WORKFLOW_SESSION_DECISION_PACK.md) preserves alternatives and evidence; it does not override the final selection.

| Decision | Locked outcome retained by this draft |
| --- | --- |
| J3-Q01 | A — Patient Appointment list/detail; initial target /app/personal/appointments; no new domain model. |
| J3-Q02 | A — NO LINE-to-DEMI/Supabase session creation; existing credential authentication remains authoritative. |
| J3-Q03 | B — normal DEMI login, bounded authenticated return, no pre-auth Patient data or URL credentials. |
| J3-Q04 | B — server-owned OPEN_PATIENT_APPOINTMENTS resolves to /app/personal/appointments; no arbitrary target. |
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

All statements in this section describe source at the reviewed HEAD, not future behavior. Test source is evidence only; no tests were run.

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
| [LIFF API](https://developers.line.biz/en/reference/liff/) | O: init is guaranteed only at endpoint or descendants; initialize primary and secondary when applicable. getIDToken needs openid/grant and logged-in initialized context; external login differs; decoded profile is not server proof. closeWindow is not guaranteed externally. I: /app/personal/appointments is outside /line/workflow initialization hierarchy; no SDK/close guarantee there. |
| [Verify ID token](https://developers.line.biz/en/reference/line-login/#verify-id-token) | O: HTTPS POST form id_token + expected client_id; verified claims include iss/sub/aud/exp; wrong audience/expiry invalid. Nonce supplied only if used in authorization request. I: server config selects internal-channel audience, never caller input. |
| [Provider user IDs](https://developers.line.biz/en/docs/messaging-api/getting-user-ids/) | O: same Provider yields consistent user ID; different Provider differs. I: same subject is not cross-channel token authorization. |
| [MINI App external browser](https://developers.line.biz/en/docs/line-mini-app/develop/external-browser/) | O: external service supported; LINE login must be handled explicitly; init auto-login is an option, not DEMI login. Some LINE-only features unavailable. U: cookies, handoff, account switch and back/restore on actual iOS/Android. |
| [Next data security](https://nextjs.org/docs/app/guides/data-security), [cookies](https://nextjs.org/docs/app/api-reference/functions/cookies) | O/R: actions are callable server endpoints, need own authorization; POST Origin/Host checks; cookies async and writes in Action/Handler. Installed 16.3.0 guides checked under node_modules/next/dist/docs/01-app/{02-guides/data-security.md,03-api-reference/04-functions/cookies.md}. R: installed action-handler warns on missing Origin rather than uniformly rejecting it; explicit scoped Origin checks are required. |
| [Supabase SSR client](https://supabase.com/docs/guides/auth/server-side/creating-a-client?queryGroups=framework&framework=nextjs), [advanced SSR](https://supabase.com/docs/guides/auth/server-side/advanced-guide) | O: verify claims/user rather than trust getSession cookie contents; proxy refresh and response-cookie cache controls matter; prefetch/cookies can race. R: installed SSR source is the effective default evidence in section 17; current docs are not a measured production-cookie claim. |
| [Supabase sessions](https://supabase.com/docs/guides/auth/sessions) | O: session_id identifies session; access JWT can outlive sign-out; checking live session existence is stronger than signature-only validation. I/U: exact-session replay/logout behavior needs a supported auth-owned liveness boundary and deployed-provider evidence before GO. |
| [Supabase changelog](https://supabase.com/changelog), [SSR primary source](https://github.com/supabase/ssr/blob/main/src/types.ts) | Changelog markdown fetch failed; HTML fallback reviewed. No version upgrade proposed. Context7 /supabase/ssr primary-source documentation confirms getAll/setAll and cache-header argument; installed 0.12.4 source checked directly. Hosted/self-hosted version and Node compatibility must be recorded by operator, not inferred from package.json. |

## 5. Architectural feasibility verdict

**NO-GO for runtime under the exact current target/origin and full Q16.** There is no accepted server discriminator for a scope-free request to the ordinary Appointment route. This is an architectural inference from the source paths in section 3, not a claim that HTTP makes every possible design impossible.

For the current origin/session, consider two requests with the same method, path /app/personal/appointments, Supabase cookies and headers. One is an ordinary authorized web request; the other is a LINE workflow request after removing optional LINE state. The server observes the same input. Allowing the first without LINE necessarily allows the second under that classifier; denying both breaks ordinary-web independence. Server-side scope storage cannot identify which tab sent that indistinguishable request. Signing the removed state does not change this fact.

Mutations have an additional bypass: existing controls call ordinary SELF actions, which require DEMI/domain authorization only. An action ID, encrypted closure or hidden scope input is not a substitute for a mandatory server-selected scoped boundary. A forged call with the ordinary action is ordinary web unless a non-optional route/origin boundary distinguishes it.

The smallest credible alternative is a mandatory scoped pathname with reused UI/domain components plus a server-verifiable exact-session context. It requires explicit owner clarification of Q01/Q04 target and care-navigation exit semantics. This draft does not change /app/personal/appointments to that alternative.

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
8. Matched/authorized -> must establish a reviewed mandatory scope **before** navigation. Because section 12 is unresolved, no successful redirect into business pages is approved by this draft. A gateway-only successful comparison is insufficient.
9. Responses use safe enum/correlation ID, never raw claims/binding/User/Patient projections. Retry is explicit, one attempt; no polling/redirect loop.

Platform liff.state and liff.referrer are untrusted input. Reject off-origin/path/traversal/authority/resource targets; do not server-follow them. The SDK may process redirect state before application code, so reject invalid landing paths without business rendering, and test crafted primary/secondary permutations. Do not claim application sanitization controls every SDK redirect. Bare entry avoids needing a general liff.state path router.

## 10. Navigation intent and login return

Draft canonical transport: /line/workflow?intent=OPEN_PATIENT_APPOINTMENTS; login link /login?returnTo=%2Fline%2Fworkflow%3Fintent%3DOPEN_PATIENT_APPOINTMENTS. This string carries only non-authoritative intent. Server target map remains exactly OPEN_PATIENT_APPOINTMENTS -> /app/personal/appointments; the blocker prevents using that map as a complete lifetime solution.

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

## 11. LINE-scoped lifetime alternatives

| Alternative | Request distinction / coverage | Weakness / verdict |
| --- | --- | --- |
| Gateway-only verify -> ordinary target | Checks launch only | Unlink/mismatch/relink after redirect unobserved; ordinary reads/actions continue. Reject: violates Q16. |
| Optional signed/encrypted cookie on ordinary target | Presence selects extra guard | Removing cookie yields valid ordinary request; cookies shared across same-host tabs; signing proves integrity, not current binding or non-downgrade. Reject as lifetime proof. |
| Path=/app/personal/appointments cookie | Restricts cookie transmission to some paths | Both normal and LINE tabs use same paths; care leaves path; cookie deletion bypass; Server Actions may execute via another endpoint. Reject. |
| Server-side context keyed by Supabase session_id | Durable trusted scope remembers entry | No tab identifier on later ordinary GET. Requiring scope for that whole session makes ordinary tabs LINE-dependent; optional lookup recreates downgrade. Storage alone does not solve classifier. Reject for approved independence. |
| Query flag/header/sessionStorage/referrer/window.name/service-worker tagging | Client propagates marker | GET navigation/actions/reload/copied links can drop it; not trusted provenance. Credential in URL also violates Q14. Reject. |
| Dedicated scoped pathname + exact-session verifiable context + reused components | Server treats every scoped GET/RSC/action as mandatory scope, absent credential denied | Credible restriction, but changes approved initial URL and requires scoped links/action endpoints/care-exit decision. **Owner clarification required; not selected.** |
| Dedicated hostname, same /app/personal/appointments pathname | Trusted host distinguishes all requests; scope mandatory only there | Changes public origin/cookie/auth deployment; normal host cookie not assumed shared; no auth handoff tokens allowed. Larger operator/auth review, not smallest current-repo choice; not selected. |
| Invisible proxy rewrite/route group at same public URL | Internal destination differs | Route group is absent from URL; rewrite still needs discriminator. If based on optional cookie/query, same downgrade. If host-fixed, it is hostname option above. Reject as independent solution. |
| Restrict all Appointment access for User once LINE used | Persisted global enforcement | Violates ordinary-web independence and adds new domain restriction. Reject. |

Narrowing to reads or disabling controls would reopen Q06 and still leave read downgrade. Rechecking raw LINE proof on each client fetch cannot authenticate ordinary Server Component navigation with missing proof. No approved alternative adds an iframe, duplicate application, second Supabase session, or a generic workflow engine.

## 12. Exact blocker and conditional lifetime candidate

**B17J3-01 — TECHNICAL BLOCKER / OWNER CLARIFICATION REQUIRED.** Q01/Q04 require initial /app/personal/appointments; Q16 requires non-optional LINE checks on all scoped reads/actions while ordinary requests to that same URL remain independent. Current routes/actions have no non-client-removable request-class boundary. A secure context can restrict identified scoped traffic but cannot reconstruct missing provenance.

Required clarification: may the MINI App enter a dedicated scoped root, for example /line/workflow/appointments, while reusing the same Appointment components/services and keeping /app/personal/appointments as the ordinary destination? This is a material target exception, **not currently approved**. Also decide whether current care navigation stays inside a finite scoped care route set or explicitly ends scope and enters ordinary DEMI. Do not silently move care links out of scope. Until decided, the approved target remains unchanged and the whole runtime is NO-GO. Review ADR implications if choosing hostname/auth isolation or broader architectural change; no ADR rewrite here.

### Conditional route-bound candidate — analysis only

If owner approves pathname separation, classify scope by a fixed server route/action manifest, never cookie presence. Candidate root/history/detail are /line/workflow/appointments and descendants for relationship/detail; internal IDs only after authenticated entry. Use the same components with injected finite link/action adapters, not copied Appointment pages/query logic. Every child GET, RSC fetch, prefetch, reload, error recovery and action submission must remain within that manifest. Any unsupported child path has no business data. Layout checks alone are insufficient: each read and mutation entry must enforce the guard.

A bounded encrypted authenticated context in a host-only HttpOnly cookie is a candidate transport: Secure, SameSite=Lax, Path=/line/workflow, no Domain; mandatory under scoped namespace; missing/tampered/expired cookie -> deny, never ordinary fallback. A __Secure- name is compatible with the path; do not claim __Host- prefix with this non-root Path. Cookie is **not** a second auth session: no DEMI credentials, token refresh or authority creation. All tabs at that pathname share it; explicitly accept that a new scope can replace another, causing old tab denial/reverification. Path is transmission control, not isolation/security proof.

Minimum encrypted payload candidate: format version/keyId, finite intent, environment/audience discriminator, binding ID, captured binding lifecycleVersion, exact DEMI User ID, HMAC of verified Supabase session_id, issuedAt, expiresAt, verified LINE proof expiry. No raw subject, fingerprint, LINE/Supabase tokens, role, clinical/resource target or display data. Bind integrity to application purpose + expected host/environment; authenticated encryption avoids exposing identity fields. Separate bounded key lifecycle must be reviewed; do not blindly reuse existing hash key for encryption. These are candidate fields, not an approved schema/table.

Draft expiry proposal for review: absolute 15 minutes or verified proof exp, whichever earlier; session validity is checked independently on each request. No sliding renewal. Shorter than provider ID-token lifetime limits stale context/replay without pretending TTL solves binding revocation. Renewal requires explicit gateway restart/current proof verification; no stale client-only extension. Exact TTL/key management is unresolved until the route model is accepted.

Stateless encrypted context can enforce binding/lifecycle/version/session changes by current DB checks without a new workflow table. It cannot individually revoke a copied valid context before expiry without a durable revocation witness; removal alone does not revoke it. Auth-owned exact-session liveness after logout/replay must be demonstrated (supported provider live-session check or separately reviewed minimal revocation storage). Existing getClaims/getUser mapping is useful but is not asserted here to guarantee all deployed replay/revocation cases. No new table is justified or selected before demonstrating the missing invariant and assessing simpler alternatives. Never change Supabase-owned schema casually.

Guard order: mandatory scoped endpoint -> valid context/expiry/host/environment -> verified live exact DEMI session -> canonical ACTIVE actor -> current binding by context binding ID with unlinkedAt=null, current raw subject present, same User, same captured lifecycleVersion -> minimized persisted SELF -> existing domain read/mutation. The context represents successful verified proof bound to that binding lifecycle; subject equality alone cannot revive old version. Current binding ambiguity/DB failure denies. Session refresh with unchanged session_id can continue within absolute scope expiry; logout/new login (including same User) must require new scope.

### Read/action coverage gate

| Scoped request | Mandatory boundary needed if candidate accepted |
| --- | --- |
| Root/relationship/detail server render, RSC, prefetch, refresh | Guard before sensitive query; current SELF service via same short coherent DB snapshot for guard/read where supported. No cached actor or business projection across requests. |
| History pagination/detail/back link | Generated finite scoped paths; route classification always mandatory; no optional scope query. |
| Acknowledgement/cancellation request | Scoped server transport, exact Origin/CSRF + mandatory context/session guard; existing Appointment transaction/business functions; no dispatch to ordinary action selected by client. |
| Action called against ordinary URL / action forwarding | Must verify mandatory scope in the scoped action implementation itself, independent of receiving pathname; Path cookie may be absent -> deny. Do not assume Next action IDs constrain URL or prevent forwarding. Ordinary actions remain ordinary authority only. |
| Care navigation/breadcrumb/app shell | Finite scoped counterparts if lifetime continues; otherwise explicit owner-approved scope exit. No automatic downgrade when following current hardcoded links. |
| Reload/multiple tabs/restore | Same server guard; shared cookie may replace/expire; no implicit ordinary retry. Client conceal/reverify on BFCache restore is defense in depth, not authority. |

Appointment service opens its own serializable transactions and accepts PrismaClient, so an outer guard followed by ordinary service is not an atomic unlink fence. **B17J3-02 — TECHNICAL REVIEW REQUIRED:** specify a small transaction-owned guard composition seam before claiming revocation serialization. No LINE import into Appointment/domain policy. Candidate: an injected server-only precondition evaluated inside each existing mutation transaction, locking/rechecking binding in the consistent User-before-binding order shared with unlink; repeat on transaction retry, before idempotent-success returns as well as new writes. Review against lock ordering, suspension/relink and mutation concurrency; do not add a second transaction/business implementation. No such seam is accepted or implemented in this draft.

For reads, coherent snapshot authorization may race with revocation after snapshot/response; no retroactive erasure claim. For mutations, distinguish requests started after revocation commit (must deny) from in-flight work; define a DB serialization point under reviewed locks, not an impossible cross-provider atomicity promise. Session can change in another tab after request cookies are captured: next request uses new session and denies; already-running request cannot observe every later browser event atomically.

## 13. Ordinary-web independence proof and its limit

**No proof for the exact same-origin same-route design.** Section 5 gives the indistinguishable-request counterexample. This is why implementation GO is withheld.

For the conditional pathname candidate, proof obligations are: ordinary /app paths/actions never require or inspect a LINE credential for authority; mandatory scoped paths/actions never fall back when credential missing; scoped UI generates only scoped business paths/actions; no shared actor/domain policy altered; dropping scope cookie denies scoped request; concurrent ordinary tab still works without LINE after unlink. A person deliberately navigating directly to ordinary /app may use independent DEMI authority, as existing owner boundary allows; that is not continuity of the LINE workflow. Whether/how the UI offers that exit needs the owner clarification above. Browser cookies remain shared, and DEMI logout/account switch naturally affects ordinary tabs too; independence from LINE does not mean separate DEMI session per tab.

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

Approved initial route remains /app/personal/appointments, followed by current authenticated relationship chooser/history/detail. Existing UI exposes Hospital name/code/status/HN, schedule/type/status/duration/location, responsible clinician/profession, appointment-time OSM presentation and approved interaction history. This is authenticated web disclosure; J2 chat still exposes only approved Thai date/time + Hospital name. Nothing here permits HN/identity/detail in LINE chat, first-entry URLs or telemetry.

Keep existing domain services and DTOs. SELF historical read includes own relationships regardless of Hospital operational status; mutation access still requires Hospital ACTIVE and current existing policy. Do not flatten those distinct rules into a new LINE policy. Gateway uses minimized hasOwnPatientAppointmentIdentity to distinguish missing profile/relationship from successful empty; it must not load broad UI data while session/binding mismatched.

Acknowledgement records seen-current-version, not attendance and not status change; version-specific idempotent existing acknowledgement remains. Cancellation request uses existing nonce, exact owner/source/appointment/version, pending request/version and transactional audit rules; request is **not direct cancellation**. No create/reschedule/direct cancel/withdrawal/complete/no-show/coordination/Hospital review or new clinical mutation. Existing PATIENT_SELF source retained; MINI App is transport, not new authority/source.

Conditional UI reuse needs finite path/action injection into existing views/controls instead of hardcoded ordinary links/imports. LINE orchestration composes additional restriction with domain authority, never copies Appointment queries or policies. All business actions reauthorize on server. Domain regression and binding transaction composition are gates in sections 12/22.

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

Required controls:

- Raw LINE ID proof only in transient memory -> HTTPS same-origin POST body -> HTTPS LINE verify body. Never app-authored query/fragment/URL/referrer/storage/persistence/log. Do not use decoded profile/userId as proof. No access token is needed for this first workflow's ID verify.
- Initial URL/state/menu/login return: finite intent only; no HN/National ID, LINE subject, User/Person/Patient/Hospital/relationship/appointment locator, role authority or clinical data. Internal authorized DEMI links/form resource fields remain domain-validated; no permanent-link/share export of resource routes.
- Set Referrer-Policy: no-referrer on gateway/scoped sensitive pages and responses; no complete primary URL in ingress/CDN/APM/analytics/crash reporting. Suppress query capture at host before SDK cleanup. Exclude unnecessary third-party code before init; sanitize even after init; no identity-based analytics tags.
- POST endpoints require exact canonical Origin and body/schema/size/abuse limits; scoped actions add explicit Origin rejection when absent/null/mismatched alongside Next checks. Configure trusted proxy Host/X-Forwarded-Host; no permissive wildcard. HttpOnly/SameSite do not alone establish CSRF protection or current binding.
- Credential login and logout retain existing Supabase behavior; a login CSRF threat needs focused review of existing login Origin protections, not LINE bootstrap. Scope acquisition should use an explicit user continue/retry action; no linking side effect. If anti-CSRF challenge is introduced, bind it to exact session/action and keep it out of URLs, following account intent responsibility without changing binding semantics.
- Proposed scope cookie settings in section 12 apply only if accepted. Cookies are shared across tabs; no tab isolation promise. Missing cookies show recovery rather than weakening authentication. External browser login operates there independently; no credential handoff via URL.
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
| Tampered/duplicate/unknown intent | finite classifier/strict schema | 400 invalid entry | clean bare permalink | NAVIGATION_INVALID |
| Arbitrary returnTo attempt | Auth shared allowlist | safe /app default; gateway rejects | clean bounded login link | RETURN_INVALID |
| Unexpected liff.state | shell + post-init landing classifier | safe invalid entry, no business route | clean bare permalink | PLATFORM_STATE_INVALID |
| External cookie rejection | login-return/gateway session check | login-required recovery, no loop | same-browser cookie guidance/restart; deliberate ordinary access separate | COOKIE_CONTEXT_UNAVAILABLE |
| Malformed provider redirect | init failure/invalid landing | unavailable/400 shell | clean permalink/operator config | PLATFORM_REDIRECT_INVALID |
| Copied/replayed MINI permalink | fresh gateway proof/binding/session | authorized root only or generic deny | recipient's normal own checks | ENTRY_RECHECKED |
| Replayed context after logout | exact live-session/context check required | 401/403 deny | new credential session + gateway | SCOPE_SESSION_INVALID |
| Stale BFCache page | client restore recheck + mandatory server guard | conceal/retry; server denies invalid scope | fresh gateway/refresh | RESTORE_RECHECK_REQUIRED |
| Server Action after unlink | scoped action + transaction precondition | generic denied action state | account management; no write/replayed success | SCOPE_REVOKED |
| Server Action after account switch | action session/context equality | generic mismatch action state | fresh gateway; no A/B scoped write | ACCOUNT_MISMATCH |
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
| Cookie removal/downgrade/unsigned client state | **Unsolved at approved ordinary URL**; mandatory pathname/origin candidate requires clarification. Signing alone does not solve this. |
| Cross-tab contamination | Shared cookie acknowledged; mandatory scope namespace, ordinary namespace independent; session switch invalidates old scoped requests. |
| Resource-ID injection/unauthorized action | Root-only entry; internal domain schemas/current SELF; scoped action must guard itself, not trust UI/action ID/receiving route. |
| Copied links | No sender identity/credentials in link; recipient proves own LINE + DEMI + SELF, same checks. |
| Stale client rendering/BFCache | Conceal/reverify plus server request guards; no retroactive-erasure promise. |
| Analytics/referrer/cache leaks | no-referrer/no-store, ingress query suppression, no early analytics/token/body/raw exception capture. |
| External-browser isolation | Same browser normal login/reentry, no session transfer, unavailable recovery not authentication downgrade. |

Findings are design risks, not claims of newly discovered exploitable defects in existing ordinary-web access. B17J3-01 blocks implementation; B17J3-02 and session liveness/privacy deployment controls block completion of any replacement contract. No domain authorization expansion is proposed.

## 20. Proposed code-change inventory — conditional, no edits now

Paths marked NEW are future candidates written as plain text because they do not exist. Do not add every candidate automatically.

| File/seam | Responsibility / dependency boundary |
| --- | --- |
| src/lib/env/server.ts | Selected MINI tuple validation/public prop; lazy isolation from Account/ordinary web. |
| src/modules/line/adapters/line-login-client.ts; NEW line-mini-app-client.ts | Preserve Account verifier; private low-level verify reuse, separate MINI trusted entry point; no caller audience. |
| NEW app/line/workflow/page.tsx; line-workflow-client.tsx | Initialization shell, finite intent, explicit browser login/retry, no business data. |
| NEW app/api/line/workflow/verify/route.ts; src/modules/line/transport/workflow-http.ts | Strict POST/Origin/body/error/no-store boundary; bounded verify orchestration. |
| NEW src/modules/line/services/line-workflow-service.ts; line-workflow-context-service.ts | Provider proof/binding/session consistency orchestration; context integrity/lifecycle, only if classifier accepted. |
| src/modules/auth/schemas/login-schema.ts; NEW src/modules/auth/services/login-return-service.ts | One return classifier/resolver; preserve legacy Family/Account behavior; finite workflow intent imported from small server-safe navigation constant, no Auth -> LINE service import. |
| app/login/page.tsx; app/login/login-form.tsx; src/modules/auth/transport/server-actions.ts | Both workflow return paths, preserve Family precedence/cleanup, error/default/local logout. |
| Auth session boundary / existing line-session-service.ts | Reuse exact session hash; separately review supported session-liveness ownership; do not let getCurrentLineSession alone stand for ACTIVE actor. |
| app/app/personal/patient-self-relationship-navigation.tsx; patient-self-record-detail-views.tsx; appointments/patient-appointment-interaction-controls.tsx | Finite link/action injection for same UI under scoped adapters; ordinary defaults unchanged. |
| NEW scoped root/history/detail/care route adapters | Only if target/care boundary approved; reuse UI and domain reads; mandatory guard for every sensitive entry, no duplicate React business pages. |
| src/modules/patient-self/transport/patient-self-care-page-context.ts and query seams | Compose approved scoped guard with current domain read, reuse TransactionClient dependencies; domain must not import LINE integration. |
| src/modules/appointments/transport/server-actions.ts; NEW scoped action transport; appointment-service.ts | Scoped action implementation always guarded; reviewed transaction precondition seam, unchanged domain mutation rules. Existing ordinary actions remain independent. |
| src/modules/line/services/line-deep-link-builder.ts; rich-menu/catalog.ts; layout.ts | One MINI permalink intent; four eligible variants and three top hit areas only. |
| scripts/line-rich-menu-asset-manifest.ts; generate-line-rich-menu-assets.ps1; four public/line/rich-menus/patient*.png | Existing generator selective update; avoid changes if manifest already supports layout/labels. |
| Adjacent unit/UI tests; tests/integration/appointments.integration.test.ts; line-account-linking.integration.test.ts | Future audience/return/scope/action/domain/revocation regressions, DB only where actual transaction invariant needs it. |
| NEW MINI external setup/UAT runbook; CONTEXT/runtime handoff | Operator tuple proof, publication/channel ownership, real-device evidence, truthful implementation status. |

No schema/table candidate selected. LINE owns integration; Auth owns credential/session; Patient SELF owns personal read authority; Appointment owns business mutations. Shared finite navigation values must not create cyclic service imports or a generic router. Review security composition seam before accepting inventory as implementation instructions.

## 21. Proposed implementation sequence — held

0. Resolve B17J3-01 with owner/architecture review, then review route/action/care/session-liveness and transaction composition. **Stop here while blocked.**
1. Confirm explicit deployment/environment/audience tuple and operator ownership contract.
2. Implement separate bounded MINI server verifier, preserving Account audience tests.
3. Implement one finite intent/login-return model and both workflow return paths.
4. Implement/prove mandatory lifetime request classification and exact-session current binding checks, including action transaction seam. No gateway-to-ordinary-route fallback.
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
| E Lifetime | Every root/history/detail GET/RSC/prefetch/read; pagination/reload; both scoped actions including direct invocation, different receiving URL and action forwarding; unlink/account switch before submission; expiry/log-out/relogin; concurrent scoped + ordinary tabs; cookie deletion denies scoped and ordinary web still works; care boundary/exit as separately approved; BFCache restore conceal/recheck. |
| F Domain regression | Persisted SELF scope/data breadth/Hospital-history semantics unchanged; mutation Hospital ACTIVE/version/nonce/idempotency/audit/transaction behavior unchanged; no Family/caregiver leakage, new Patient mutation, OSM/Hospital workflow or J2 Reply changes. |
| G Rich Menu | Exactly four new URI variants, preserved existing actions/switches/postback; 18 count; correct selected MINI bare URL, no hardcoded live ID; integer positive in-bounds/non-overlapping areas; four PNG changes only, digest/readback compatibility. |
| H Concurrency/transaction | Revocation committed before scoped read/action denies; binding version changes during service retry rechecked; unlink/action lock serialization; no idempotent-success disclosure before scope check; no nested Prisma transaction/no provider I/O under DB lock; explicit permitted in-flight race. |
| I Privacy/cache/browser | No token/provider body/raw exception/primary URL/identity analytics; sensitive no-store/no-referrer/Set-Cookie propagation; exact Origin/null denial; no cached cross-user rendering; unsupported SDK state/error produces no Patient data. |

Use existing scripts when later authorized: npm run test -- <explicit affected paths>; npm run test:integration:focused -- <affected integration path> only where needed; npm run lint; npm run typecheck. package.json has no architecture:check or lint:strict scripts; do not invent PASS claims. Full suite/build only when risk and AGENTS.md justify them. No test code written or command executed now. Mocks cannot establish operator/device evidence.

## 23. External provisioning and manual UAT gates

Operator separately confirms same DEMI Provider for all channels, each internal channel ID/audience/LIFF ID/endpoint/deployment pairing, HTTPS/public origin, openid proof/consent behavior, tester/reviewer access, Console settings-copy lifecycle and publication/verification choice. No real IDs/tokens/resources verified or provisioned here; Published existence in platform topology is not a successful publication claim.

Manual UAT must cover LINE iOS and Android, Developing environment, external browser, existing/no DEMI session, LINE A/browser A and A/B, copied link, logout/relogin, unlink while open, session expiry, PATIENT authority removal, back/reload/BFCache, both current Appointment interactions, old Rich Menu compatibility, wrong channel/LIFF/endpoint and cookie rejection/handoff. Record OS/LINE/browser/SDK versions, environment and measured headers/cookies. Review/Published readiness evidence remains separate; mock PASS does not replace device results.

No MINI App service messages, Push, reminder preferences/consent/quiet hours, proactive notifications or provider load testing included.

## 24. Residual risks and explicit review items

| Item | Required resolution / disposition |
| --- | --- |
| B17J3-01 route/provenance and care navigation | Owner clarification before selecting lifetime mechanism; strongest blocker. No silent URL or Q16 change. |
| B17J3-02 mutation serialization | Architecture review of transaction precondition/lock order with existing unlink/domain rules; cannot claim outer guard is atomic. |
| Exact-session liveness/logout replay | Auth-owned supported live-session check or justified minimal revocation mechanism; deployed provider evidence. Current signature/session hash alone does not establish universal sign-out revocation. |
| MINI App deauthorization lifecycle | Official guidelines require deauthorization on unregistration/link termination; existing DEMI unlink remains local-authoritative and unchanged. Determine applicability to DEMI binding unlink versus MINI authorization and provide a compatible separately reviewed lifecycle/disclosure. The [deauthorize API](https://developers.line.biz/en/reference/line-login/#deauthorize), checked 2026-10-08, requires appropriate channel credential plus target user access token; do not persist tokens or claim existing Account unlink already performs it. If it requires changing preserved Account behavior, escalate scope/ADR review; no silent implementation. |
| Context/key/TTL/replay/cross-tab policy | Conditional proposal only; no independent early scope revocation proof without witness; review key rotation, absolute TTL, shared-cookie replacement and supported care exit. |
| Cookie/cache/host security | Existing effective attributes and missing server-wrapper header forwarding recorded; deployment measurements/remediation review required, no automatic app-wide cookie/CSP rewrite. |
| Provider proof versus continuous SDK user | Context proves recent verified launch identity for accepted bounded lifetime; every request checks binding/session/domain. LINE-account switch itself is not a server-pushed event; require gateway reentry/fresh proof on reinitialization. If continuous current SDK identity beyond bounded launch context is required, specify fresh proof transport and availability before GO; do not promise instantaneous detection. |
| Data already rendered / in-flight revocation | No erasure of prior browser data/screenshots; snapshot-to-response/browser-cookie races acknowledged. Current checks must be as late/coherent as practical; no impossible atomicity with LINE/Supabase/network. |

These are visible gates, not hidden implementation TODOs. No runtime GO may be recommended until security-critical items are resolved and contract reviewed.

## 25. Explicit non-goals and unchanged governance

No LINE passwordless login, LINE-to-Supabase bootstrap, second authentication/session system, automatic switch/relink/merge/transfer, identity-history erasure, arbitrary deep link/resource first-entry, Family/caregiver/OSM/Hospital expansion, new Patient mutation, generic chatbot/NLU/conversation/workflow framework, iframe/second business app, medication reminders/adherence, native auth/app, offline sync, Push, service messages, notification consent/preferences/quiet hours, provider automation, real-device UAT claim or deployment.

Preserve existing Account LIFF/Login channel/link/unlink, OA/Messaging configuration, Option C menus, J2 deterministic narrow Reply. P17D-NOTIF-01 remains **OPEN**; exact identity-history retention/erasure and receipt retention/purge remain open under existing governance. Family Q5 real-data use remains **GOVERNANCE BLOCKED**, P17F-L04 **OPEN**, P17F-L05 **OPEN / FUTURE**, Phase 17E.2 consent parked, MED-02 requirement-gated, Follow-up prospective reminder source and medication delivery/adherence gates unchanged. No reminder/event/content authority follows from choosing MINI App.

## 26. GO / NO-GO and documentation validation

**NO-GO / TECHNICAL BLOCKER** for the full runtime. Owner decisions are preserved, audience/gateway/return draft boundaries documented, but mandatory lifetime request classification and end-to-end ordinary-web independence are not proven for the approved target. Conditional scoped routing is not an owner-approved target. No partial verifier/menu implementation should be mistaken for resolution of the whole workflow contract.

GO can be reconsidered only after explicit target/care clarification, reviewed exact-session context/liveness/expiry, guarded reads and action transaction composition, normal-web independence including cookie-removal test, privacy/CSRF/cache controls, lifecycle applicability resolution and all owner boundaries preserved. Separate technical review is required even then; drafting is not implementation permission.

Documentation-only validation passed: source/owner consistency review; 183 local Markdown file links across this contract and CONTEXT resolve; 18 distinct official URLs checked through official documentation/primary-source retrieval; strict UTF-8 without BOM, Thai labels preserved, no replacement characters/mojibake or trailing whitespace; existing CONTEXT content preserved byte-for-byte after the inserted addendum, with LF unchanged. Final diff scope is only these two Markdown files; git diff --check and the new-file whitespace check passed. No unit/integration/database tests, migration, build, dev server, provider/operator command or resource changes performed; no automated runtime PASS inferred from this source audit.

## 27. Final phase status and next step

- Phase 17J.2: **CLOSED / IMPLEMENTED / AUTOMATED VERIFICATION COMPLETE**.
- Phase 17J.3A: **CLOSED / OWNER DECISION COMPLETE**; Q07=C preserved.
- Phase 17J.3B: **TECHNICAL DESIGN BLOCKED / REVIEW REQUIRED**.
- Contract document: **TECHNICAL CONTRACT DRAFT / REVIEW REQUIRED**, feasibility **NO-GO**.
- Phase 17J.3 runtime: **NOT IMPLEMENTED**.
- Phase 17J.4: **NOT STARTED**.
- P17D-NOTIF-01: **OPEN**.

Exact next step: **Review Phase 17J.3B technical contract before implementation.** That review must resolve B17J3-01 through explicit owner clarification of scoped entry target/care navigation, then complete the lifetime/transaction/session gates. Stop after this documentation task; do not start runtime automatically.
