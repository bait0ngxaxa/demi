# Phase 17J.3B — LINE MINI App Workflow Technical Contract

- Document: **TECHNICAL CONTRACT COMPLETE / REVIEWED / CLEARED FOR IMPLEMENTATION**.
- Phase 17J.3B: **TECHNICAL DESIGN CLEARED — B17J3-LIFECYCLE-RELEASE CLOSED BY BOUNDED RECOVERY**.
- Recommendation: **GO at technical-contract level**; Full Disconnection and bounded recovery with residual availability risk are owner-decided. Runtime/deployment evidence remains separate.
- Reviewed main HEAD: **64149de90501b0854fe1634b0fcc4a71f2e62654** — local HEAD and origin main verified equal using git ls-remote on 2026-10-08. Earlier section 12.2 measurements retain their original baseline.
- Source and official-document verification date: **2026-10-08**.
- Initial working tree: clean. Repository: bait0ngxaxa/demi.
- Documentation only. No runtime implementation, provider provisioning, database change, or device evidence is delivered.

## 1. Status and interpretation

Bounded recovery review dated **2026-10-08**: **GO — TECHNICAL CONTRACT COMPLETE / REVIEWED / CLEARED FOR IMPLEMENTATION**. The owner selects **Option 2 — Bounded Recovery Policy with Accepted Availability Risk**. Full Disconnection still covers immediate local revocation and every applicable Account/MINI termination obligation. Section 23.1 selects authenticated recovery release without claiming remote confirmation or provider drain. Late old deauthorization may disrupt a newly authorized LINE connection; accepted risk is availability, never expanded Patient authority. B17J3-LIFECYCLE-RELEASE is closed at design level by this later decision. Conceptual persistence is selected for implementation review; no migration/runtime work is authorized in this task.

**B17J3-01 remains resolved at design level**, dedicated **/line/workflow/appointments** and explicit care exit retained. **B17J3-02 retains the existing Appointment Serializable composition**. **B17J3-03 remains VERIFIED / CLOSED** for measured Demi-dev/Auth v2.197.0 and policies in section 12.2; the historical same-token expiry/cleanup evidence is preserved and was not rerun. Normal credentials, ordinary **/app/personal/appointments**, exact-session encrypted context, absolute min(15 minutes, proof expiry), Patient SELF, channel audiences, Family boundaries, J2 reactive messaging and Rich Menu architecture remain closed decisions.

17J.2 remains **CLOSED / IMPLEMENTED / AUTOMATED VERIFICATION COMPLETE**; 17J.3A **CLOSED / OWNER DECISION COMPLETE**; 17J.3 runtime **NOT IMPLEMENTED**; 17J.4 **NOT STARTED**; P17D-NOTIF-01 **OPEN**. The dated [ADR-0009 amendment](../adr/0009-demi-line-oa-liff-identity-and-messaging.md#full-disconnection-amendment--2026-10-08) preserves immediate authoritative local unlink and supersedes local-only product completion and unconditional relink availability, with a later bounded recovery exception to absolute pending release. No runtime, schema, migration, credentials or channel configuration changes are made.

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
| J3-Q07 | **C — new LINE MINI App channel under the same existing DEMI Provider**; Account LIFF/channel/audience retained; dated Full Disconnection lifecycle exception applies; audiences separate. |
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

**Feasible request isolation; B17J3-03 verified for the measured configuration, overall technical-contract GO under bounded recovery in sections 23.1 and 24.** Current main contains none of these runtime mechanisms. Design clearance follows section 26; future runtime/device acceptance is separate. Re-attest session evidence only for materially different environment/version/policies.

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

Findings are design risks, not claims of newly discovered exploitable defects in existing ordinary-web access. B17J3-01 is resolved at design level; B17J3-02 composition is selected with future concurrency evidence required. Full Disconnection bounded recovery closes the release design; B17J3-03 provider verification is closed for the measured configuration. No domain authorization expansion is proposed.

## 20. Proposed code-change inventory — selected for implementation review, no edits now

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
| CANDIDATE narrow LINE lifecycle persistence/termination transport; existing account intent and audit seams | Section 23.1 selected engineering proposal: LINE-owned per-binding/generation/channel records, Account + MINI obligations, pending checks and bounded recovery release. No raw token storage or generic session/sync framework. |
| NEW MINI external setup/UAT runbook; CONTEXT/runtime handoff | Operator tuple proof, publication/channel ownership, real-device evidence, truthful implementation status. |

The conceptual LineAuthorizationLifecycle candidate in section 23.1 is selected for implementation review; physical Prisma fields/constraints and migration require runtime-phase review. No schema change is made here. LINE owns integration; Auth owns credential/session; Patient SELF owns personal read authority; Appointment owns business mutations. Shared finite navigation values must not create cyclic service imports or a generic router. Review security composition seam before accepting inventory as implementation instructions.

## 21. Proposed implementation sequence — cleared contract, not begun

0. B17J3-01/02/03 remain closed at their recorded evidence levels; B17J3-LIFECYCLE-RELEASE is resolved by dated Option 2. Preserve dispatch/context/transaction design. **This task stops at documentation; runtime requires a separate implementation instruction.**
1. Confirm explicit deployment/environment/audience tuple and operator ownership contract, including applicable and unknown historical grants.
   Implement section 23.1 lifecycle/atomic unlink/status/bounded recovery gates before enabling new channel authorization or workflow issuance; retain runtime/provider/device acceptance gates.
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

### 23.1 Full LINE Integration Disconnection — final lifecycle contract

#### Dated owner clarification — 2026-10-08

**“Unlink LINE from DEMI” means FULL LINE INTEGRATION DISCONNECTION.** One user-facing operation initiates immediate local binding revocation and permission removal for every applicable DEMI LINE grant. Advance binding lifecycleVersion at the local commit; deny subsequent LINE-scoped authority under the established request/transaction guards. Account Login/LIFF and MINI obligations are independently tracked. Local success never proves remote success. Incomplete termination must have an identity-verified recovery path. The original prohibition on new-grant exposure to unresolved older termination is superseded only by the later Option 2 decision below.

This decision supersedes: (1) the historical assumption that local unlink plus Rich Menu cleanup completes product disconnection; (2) Q07/Account-preservation wording only insofar as it excludes required channel termination, status/recovery and necessary relink fences; (3) the former MINI-only LineMiniAppAuthorizationLifecycle as the sole lifecycle proposal; (4) unconditional immediate same-User relink while external termination is unresolved. It does **not** supersede the Account channel/LIFF/audience, explicit linking ownership/conflict policy, local authority, normal credentials or any closed section 1 decision. The earlier owner-accepted undetected remote-withdrawal window remains bounded by min(15 minutes, verified proof expiry), with no renewal or notification guarantee.

Unlink does not delete User, Patient, appointments or medical history; revoke ordinary credential sessions solely because of unlink; remove OA friendship; delete the global LINE account; sign out unrelated services; transfer identity ownership; or reactivate old workflow sessions. Ordinary DEMI access remains subject to normal authentication/authorization. The owner accepts temporary affected-operation restrictions when required for correctness, **not indefinite blocking without recovery**. Schema, manual evidence verification and provider drain semantics are not owner-approved by this clarification.

#### Later owner clarification — Option 2, 2026-10-08

The owner approves **Bounded Recovery Policy with Accepted Availability Risk**: controlled, explicitly authenticated recovery may permit reauthorization/relink when grant absence or settlement of an older remote request cannot be established. An earlier deauthorization may revoke newly granted permission later. This is accepted **availability/reconnection disruption**, not permission to weaken DEMI authentication, exact-session checks, identity ownership, Patient SELF or scope lifetime.

This supersedes the absolute two-predicate provider absence/drain prerequisite at baseline 64149de and the earlier no-new-grant exposure rule only for the reviewed recovery flow. **REMOTE_CONFIRMED** and **RECOVERY_RELEASED_UNVERIFIED** are distinct; the latter must never be presented as provider-confirmed FULLY_DISCONNECTED. Keep unresolved historical evidence. No cancellation, idempotency, grant-generation or introspection API is assumed. No physical schema/migration, operator force-clear or indefinite restriction is owner-approved.

#### Channel obligations and evidence boundaries

Official facts below were checked **2026-10-08**. Proposed DEMI orchestration is engineering interpretation. Actual Console inventory/credentials and device results are unverified; no live deauthorize call was made.

| Channel | Grant / transient user credential | Exact server credential and termination obligation | Unavailable token / absence |
| --- | --- | --- | --- |
| Account LINE Login / LIFF | User permissions for the existing Login channel; initialized/logged-in Account LIFF can supply its user access token. Current source verifies ID token for binding; optional access token is used for friendship. Current unlink sends only intent/challenge. | Use that **Login channel's** channel credential; selected stateless token, issued with its own channel ID/secret. Terminate the Account grant, not only its bearer token. No Messaging/MINI credential substitution. | Closed LIFF may have no usable token; no refresh token is stored. Guide the same verified owner to channel-specific recovery or LINE Authorized Apps. Do not make local revocation depend on reopening LIFF. |
| MINI App | Independent grant for each applicable Developing/Review/Published internal channel. Same Provider subject does not imply shared permission or token. | Selected **stateless channel credential for the exact internal channel** and that channel's user token. Account grant removal is not MINI grant removal. Termination/disclosure applies when unlink ends this integration. | Proven never-authorized channel has no removal obligation; do not open MINI just to manufacture a token/grant. Unobserved is UNKNOWN, not absent. Previously authorized/inaccessible grants require recovery and remain unconfirmed. |
| Messaging API / OA | OA friendship/reachability and per-user Rich Menu are separate from Login permission and DEMI binding. | Existing Messaging channel token/secret remain solely for messaging, webhook and menu operations. DEMI suppresses binding-based business access and requests existing menu cleanup; no user permission deauthorize with an OA token. | User controls friendship/blocking. DEMI cannot equate block/unfriend, friendFlag=false, follow/unfollow or menu cleanup with consent removal. OA friendship is outside Full Disconnection completion obligations. |

[Deauthorize API](https://developers.line.biz/en/reference/line-login/#deauthorize): POST /user/v1/deauthorize takes channel Bearer credential (v2.1 or stateless) and body userAccessToken; 204/empty confirms removal for the targeted app. 400 is invalid target token and can include already-withdrawn permission; it does not prove absence. Token revoke /oauth2/v2.1/revoke and SDK logout are different operations. Verify access-token validity/client_id/expiry plus provider-backed userinfo subject against retained binding fingerprint, and fresh ID-token expected audience/subject when available. ID token alone is not a deauthorize credential. No API request may target a client-selected channel/User/subject. Invalid/wrong-channel proof prevents dispatch, not local unlink.

[Account Login guidelines](https://developers.line.biz/en/docs/line-login/development-guidelines/#deauthorize-your-app-when-a-user-unregisters-from-your-app), [LIFF guidelines](https://developers.line.biz/en/docs/liff/development-guidelines/#deauthorize-your-app-when-a-user-unregisters-from-your-app) and [MINI guidelines](https://developers.line.biz/en/docs/line-mini-app/development-guidelines/#deauthorize-your-app-when-a-user-unregisters-from-your-app) require permission removal and disclosure near termination or agreed terms. The owner now explicitly makes DEMI unlink such a termination; no non-applicability exemption is claimed. Disclose removal of DEMI-related LINE permissions before confirmation, while reporting incomplete remote work honestly.

[LIFF token availability](https://developers.line.biz/en/reference/liff/#get-access-token) is bounded and may end on close/user action. [MINI Console topology](https://developers.line.biz/en/docs/line-mini-app/discover/console-guide/#issuing-a-channel-access-token) requires per-internal-channel credentials; MINI long-lived/v2.1 channel tokens are unavailable, so choose stateless. No tokens/secrets are provisioned here. [MINI consent flow](https://developers.line.biz/en/docs/line-mini-app/develop/channel-consent-simplification/) can grant openid on opening without the ordinary consent screen; opening a recovery app can therefore authorize again. No visible screen or absent server observation proves no grant.

[Authorized Apps](https://developers.line.biz/en/docs/line-login/managing-authorized-apps/) permits user withdrawal in LINE Settings > Account > Authorized apps; access/refresh tokens deactivate and subsequent use requires consent again, while Provider subject remains the same. [Supported settings link](https://developers.line.biz/en/docs/line-login/using-line-url-scheme/) https://line.me/R/nv/connectedApps opens that screen. It supplies no documented DEMI callback, machine-verifiable channel inventory or settlement of an earlier HTTP request. Client assertion, screenshot/display name alone, invalid token, ID-token verify, SDK permission query and OA webhook are not authoritative absence/drain evidence. [OA events](https://developers.line.biz/en/docs/messaging-api/receiving-messages/) describe follow/unfollow separately; they do not establish Login permission withdrawal.

#### Minimum persistence decision — engineering proposal, no migration

Select a narrow generalization: **LineAuthorizationLifecycle**, LINE-owned, covering Account and applicable MINI tuples under one existing unlink service operation. Do not add a generic authorization framework, shared auth table, worker or separate persisted global state machine. Keeping MINI-only tracking plus a separate Account authority duplicates the same responsibility. Existing binding data alone cannot represent Account confirmed + MINI pending, grant applicability UNKNOWN, dispatch crash/ambiguous submission, or independent channel settlement; lifecycleVersion measures local changes only. providerCleanupState/reconcile leases measure Rich Menu cleanup, not consent or provider HTTP settlement. Five-minute intents/receipts are not durable authorization lifecycle records.

Conceptual minimum fields (not approved Prisma schema):

| Field group | Purpose / constraint |
| --- | --- |
| id; bindingId FK | Opaque record; User/subject authority derived from retained binding, no duplicate owner or raw subject. Restrict deletion while unresolved. |
| tupleKey | Server-allowlisted immutable Provider/channel/environment configuration reference; one Account tuple and finite applicable MINI internal-channel tuples. Credential references only, never credential values. |
| bindingVersion (operation generation) | Local generation at observation or disconnection; no separate redundant operation-generation field. Unique (bindingId, bindingVersion, tupleKey); pending grouping derives from committed unlink version. Do not erase historical channel obligations when config changes. |
| applicability + evidenceKind/reference; observedAt | OBSERVED, UNKNOWN, or PROVEN_ABSENT; bounded sanitized evidence identifier. Absence must have reviewable authority, not default from missing rows. |
| remoteOutcome; requestedAt; confirmedAt; recoveryReason | OBSERVED before unlink; PENDING / REMOTE_UNCONFIRMED / REMOTE_CONFIRMED after unlink. PROVEN_ABSENT satisfies non-applicability without a call. Sanitized reasons: unavailable token, unknown applicability, definitive failure, known not dispatched or possibly dispatched. Local revocation derives from binding/unlink generation, not a duplicate authority flag. |
| attemptId; submittedAt; settledAt; settlementKind | At most one provider submission per channel/disconnection generation; reserve before call. Crash there is possibly dispatched. Definitive result or unresolved outcome with sanitized HTTP class/request correlation; no body. Late response settles only this historical attempt. |
| recoveryReleasedAt; recoveryDecisionAuditId | Nullable durable release separate from remoteOutcome: release of an unconfirmed row means RECOVERY_RELEASED_UNVERIFIED. Transactional audit records retained owner User, policy/copy version, exact-session authorization evidence, verified proof tuple/time/expiry/matched-fingerprint result, covered generation/tuple set, manual-review outcome and explicit risk confirmation. No raw proof/credentials or duplicate subject/session values in this row. |

No raw access/refresh/ID tokens, citizen IDs, patient data, display names, new personal identifiers or Supabase sessions are persisted or logged. Transient token verify URLs must be redacted from infrastructure logs. Existing HMAC history/key policy remains authoritative; recover subject by matching fresh verified provider proof to retained fingerprint even after menu cleanup clears raw locator. No raw locator retention extension is proposed. Old records cannot grant application access; their release/evidence only participates in the relink eligibility check. Retention remains existing governance scope; unresolved records must not be purged to fabricate release. Do not reuse the attempt slot for another send in this generation, even after definitive failure; explicit manual recovery avoids retry amplification. A separately confirmed unlink of a new binding generation is a new obligation, not old-work retry. Preserve minimized transitions/recovery provenance in existing audit; never overwrite unresolved evidence.

Recovery uses the existing short-lived LineAccountActionIntent responsibility, not a second durable authority table. The future minimal extension is a RECOVERY action with trusted target bindingId/version and a digest of the finite reviewed tuple set; LINK/UNLINK behavior and challenge/session/expiry rules remain. These selectors bind preparation, acknowledgement and proof to the same operation and are rechecked against lifecycle rows at commit. This is a conceptual schema candidate only. RecoveryDecisionAuditId references the existing transactional AuditEvent; add a narrow event-ID return seam because recordAuditEvent currently returns void, without bypassing audit validation. Keep existing metadata constraints (at most 20 scalar fields, strings at most 256 characters, no sensitive keys): store covered-set digest/count and per-row manualReview category, proof tuple/time/expiry, sessionCheckedAt/sessionMatched and policy/copy version, not an array/raw session/proof. The related lifecycle rows reconstruct the covered set. Require matching owner/resource/version and immutable decision provenance. Index the binding FK via the composite unique key; enforce paired release timestamp/audit reference and one immutable reservation per row. No cascade/cleanup may silently delete unresolved evidence. Physical types/constraints remain implementation review work.

#### Grant discovery and transactional composition

Use reviewed server channel inventory plus provider-backed observations for the **same retained LINE identity**. Existing/legacy linked accounts imply Account authorization was once present; initialize an Account obligation, not a claim that it is still live. Register future Account and matched MINI observations coherently with the current binding version; MINI observation must commit before scope issuance. At unlink, snapshot applicable observations into rows for the incremented unlink version; unresolved historical obligations remain discoverable and cannot be dropped or dispatched twice. Observation rows themselves never authorize termination dispatch without a current requested generation. A proof obtained before a successful binding match is not evidence that no authorization exists. Grants can occur at LINE before server observation, outside DEMI, or in another deployed internal channel; observation coverage cannot be certified from the gateway alone.

If a MINI channel was never provisioned/exposed for this identity population, an audited deployment/inventory exclusion can establish non-applicability. For a provisioned/exposed channel, missing observation is UNKNOWN until a supported, reviewed absence-verification path resolves it. A user who truly never authorized MINI must not need a MINI token, consent or app launch. Account-only deployment can finish with Account 204 and proven MINI exclusions. Current repository has no MINI runtime; that does not prove actual Console grants absent. Unknown applicability is eligible for bounded recovery without claiming absence or forcing MINI consent. Review named applicable/unknown apps from trusted inventory; no impossible absence oracle is required for recovery release.

Local transaction preserves **User -> existing action intent -> binding UPDATE/lock -> lifecycle rows ordered by tupleKey/id**, consumes intent, advances version, records audit and commits all discovered PENDING/UNKNOWN obligations atomically. Invalid/missing LINE token or network outage never prevents this local commit. Database failure is a local failure: report it honestly and do not send remote calls first. Repeated authenticated status/recovery requests refer to the same committed disconnection generation; do not create additional generations or remote submissions. Existing intent replay protection remains unchanged.

Use runSerializableTransaction's current P2002/P2034 retry behavior (two retries); reread binding and lifecycle on every callback. No nested transaction. Every new link/relink, MINI observation/scope issuance and recovery reservation uses User-first serialization and current generation checks. Historical provider completion instead checks the exact old row/attempt under its original owner lock, even after current binding version advanced; it is never a current-binding write. Scoped Appointment retains section 12.4 User -> binding precondition inside its existing transaction; no intent lock added there. Channel lifecycle service is the single pending authority; local binding remains the single access authority. Menu reconciliation has separate existing locks/state and is not consent authority.

After local commit, transiently validate channel/subject proof outside locks, then reserve a currently pending attempt transactionally. Execute provider HTTP outside database locks. Late response updates only the matching historical row bindingVersion/attemptId with compare-and-set and audit, without requiring or changing the current binding version. A reservation prevents another process from launching the same obligation; it is not provider idempotency. Never automatically retry an ambiguous submitted call. Process loss after reservation requires recovery rather than presumed no-send. At most one provider submission per tuple/disconnection generation; no automatic retry even for uncertain 429/5xx. Reuse the existing five-per-five-minute per-User intent issuance bound across recovery/link management, not a separate quota per channel. Reject duplicate submissions. Bound interactive provider I/O to the existing 10-second adapter budget; abort does not guarantee remote cancellation. No background token-dependent retry is promised.

#### Derived state machine and terminal condition

| Transition | Authority, observable result and next action |
| --- | --- |
| CONNECTED -> DISCONNECTION_REQUESTED | Authenticated owner confirms single-use exact-session intent. Failure before local commit leaves binding connected; no remote call first. |
| Requested -> LOCAL_REVOKED + REMOTE_PENDING | Atomic unlink/version + channel rows commit. New LINE-scoped authorization points deny; ordinary login works. In-flight/rendered-data limits in sections 12.3/12.4 remain. |
| Channel pending -> REMOTE_CONFIRMED | Matching definitive correct-channel 204 settles the reserved attempt. Other channels stay independent; partial completion is derived. |
| Channel pending -> REMOTE_UNCONFIRMED / recovery available | Missing/invalid token, unknown applicability, non-success, timeout/lost response or crash; distinguish known-not-dispatched and possibly dispatched. No success or automatic redispatch. |
| Unconfirmed -> RECOVERY_RELEASED_UNVERIFIED | Owner completes selected checks; transaction writes audit/release marker for explicit affected rows. remoteOutcome/unresolved attempt stay unchanged. Recovery grants no binding/session/Patient scope. |
| All applicable confirmed + justified exclusions -> FULLY_DISCONNECTED | Binding remains revoked, all submissions definitively settled, no unknown obligation or intervening recovery reauthorization undermining evidence. Derived confirmed completion of this generation only. |
| All affected rows confirmed/excluded OR recovery-released -> relink permitted | Existing explicit linking with fresh correct-channel proof, live exact DEMI session, ownership/conflict checks and new lifecycleVersion. Mixed confirmed/released outcomes permit relink but remain unverified aggregate, never full confirmed completion. |
| Late response after release/relink -> historical update only | CAS exact attempt/generation may append definitive status to old evidence; release provenance retained. Cannot change current binding/version/scope or claim new permission removed/protected. |

No persisted global connected/local/partial/full enum. Remote result and recovery release are orthogonal facts: release never overwrites confirmation/uncertainty. With a new binding, current connection and prior unconfirmed disconnection remain separately visible. Late 204 establishes historical attempt success, but after recovery reauthorization cannot establish current grant absence or rewrite recovery as fully confirmed completion.

#### Selected bounded recovery and relink rule

**Normal release:** all applicable obligations confirmed/proven absent, all submissions settled, binding still revoked; permit immediate explicit relink. Fresh identity/session/ownership checks remain mandatory.

**Pending gate:** Account LINK intent/launch, final link/reactivation transaction, affected MINI launch where DEMI controls it, matched MINI observation and scope issuance check retained identity obligations. Until confirmed/recovery-released, block affected normal reauthorization/entry and shared same-subject reactivation. Allow recovery-only proof interaction below; ordinary DEMI/unrelated workflows remain available. Public LINE permalink consent cannot be fenced. A distinct unowned subject follows existing explicit policy without erasing old recovery; different-User history conflicts still deny. Account proof cannot substitute for MINI audience proof.

**Recovery is available immediately when the interactive call returns failure/timeout or cannot be made.** No provider-drain cooldown is selected: no operational duration evidence supports one, and waiting cannot prove settlement. The 10-second interactive budget bounds response, not remote processing. A crashed/reserved request is eligible at the next authenticated interaction after that same recorded budget, conservatively possibly submitted. Recovery atomically disables further dispatch of released old rows. Every sender rechecks reservation/release before beginning I/O; an already-started or boundary-racing original call remains accepted external risk. Never redispatch after timeout/restart/release/relink.

One continuation in existing account management, with ordered safeguards:

1. Authenticate the ACTIVE retained DEMI owner using normal credentials/live exact-session verification. Issue an existing-pattern single-use five-minute session-bound recovery intent with exact Origin/body/CSRF/abuse checks and server-selected binding/generation/finite tuple set. GET/checkbox/screenshot alone cannot release anything. Preparation creates no binding/Patient authority.
2. Show relevant named DEMI apps from trusted channel/environment inventory, including unknown applicability. Guide LINE Settings > Account > Authorized apps via supported link above: review/remove listed permissions **where present**. User reports removed/not listed/could not determine; persist only these sanitized categories, no screenshot. These are recovery provenance, not provider absence evidence. Account-only users need no MINI token/consent/launch; unknown MINI obligations can be explicitly covered by recovery.
3. Disclose that renewed identity checking may grant permission anew and an old unresolved removal may interrupt it. Require explicit non-preselected risk confirmation. This permits only recovery-specific proof launch under that intent, not automatic relink/workflow. Failed proof leaves unlink/history intact.
4. Obtain fresh LINE identity through server-selected **Account channel for Account relink**, or selected **MINI internal channel for MINI-only recovery/entry**. Provider-verify ID token issuer/expected audience/subject/expiry and retained HMAC fingerprint; ignore decoded profile/client identity. Same-Provider equality may support the reviewed list of old obligations; it proves neither absence nor cross-channel token authority. Recheck live exact DEMI session, ACTIVE owner and revoked binding/version. Proof-only interaction creates no binding/scope. Subsequent MINI entry still obtains its own expected-audience proof.
5. Commit explicit old-row release markers + sanitized audit, consume intent, under User -> intent -> binding -> ordered lifecycle locks. All obligations blocking same-identity reactivation must be confirmed/excluded or included in this reviewed release. Concurrent lifecycle/session change denies/restarts; replay follows existing rejection without double audit/dispatch. No client User/tuple/generation authority. A tuple inventory/covered-set change invalidates the preparation; start a fresh intent rather than releasing unseen obligations.
6. Offer explicit Relink next. Existing fresh LINK intent/proof/session/conflict transaction independently checks release/current version and advances binding version; recovery receipt is never a credential. Verify fresh proof in that link request, never stored recovery token. Issue workflow context only after fresh MINI proof/current ACTIVE binding/live exact session/canonical SELF checks. User may stop after recovery; local access stays revoked and remote uncertainty remains visible. Record recovery proof/possible new consent in the audit even if no relink follows; never label it absent or fully disconnected. When relink commits, record new-generation channel observation; historical release does not waive a future unlink obligation.

**No old access token:** manual review then intentionally reacquire current LINE identity in the correct recovery-only LIFF/MINI interaction. Restart/reinitialize the selected proof-only SDK/login flow after risk acknowledgement; do not use a captured old proof or decoded profile. Server verification establishes the accepted recent identity proof, not a grant-introspection guarantee. Fresh ID proof, not the old deauthorize token, supplies identity checking; access token is required only for actual termination API calls. If current LINE identity cannot be verified (outage/lost account/declined consent), offer retry and ordinary DEMI use; never release/relink on DEMI login alone. This is a current authentication prerequisite, not a permanent historical pending lock. Ordinary DEMI credential recovery handles unavailable DEMI login. Support guides app/account recovery; no operator force-clear or identity substitute.

**Attempt limits/support:** one deauthorization send per old tuple/generation, zero automated retries; one consumed release per row via decision CAS; existing five intents per five minutes per User shared management limit; one bounded verification per submitted proof, no background loop. Rate-limited users retry when the rolling window permits, no permanent attempt exhaustion. Expired intent/proof requires fresh intent. Persistent failure offers optional support on every failed interaction with sanitized correlation/reason; routine timeout does not require an administrator. Support never waives identity checks. After late permission loss, offer fresh verification/explicit reconnect without old-call redispatch/history deletion. New deliberate unlink starts a new generation/obligation.

#### Late provider effects and security boundary

Request A may time out, recovery may authorize B, then A may revoke B. Locks, versions, aborts, timers, manual removal and acknowledgement cannot prevent/prove away that external effect. **Accepted residual risk is availability disruption.** Late matching evidence may update only A's historical attempt under original owner lock and bindingId/version/tuple/attemptId CAS; it cannot alter current binding/roles/Patient/scope. No old-call retry even if historical status stays unconfirmed indefinitely; evidence may remain unresolved, the relink lock may not.

Revoked/unavailable permission at fresh verify/entry denies safely and offers reconnect/ordinary DEMI login. No account switching, transfer, decoded-identity fallback, old-context revival or automatic relink. Discard a context when server-verified permission failure is associated with that exact current context; untrusted reports must not revoke another generation. Permission failure does not sign out ordinary DEMI. Already-issued context has no immediate remote-withdrawal detection guarantee: current binding/session/SELF checks and absolute min(15 minutes, verified proof expiry), no sliding renewal, remain authoritative. Recovery expands neither lifetime nor clinical breadth. Reinitialization/new MINI entry requires fresh proof; outage never weakens verification. A's effect within the previously accepted context window creates no new clinical authority.

**B17J3-LIFECYCLE-RELEASE — CLOSED AT DESIGN LEVEL:** dated Option 2 replaces absence-plus-drain prerequisites. Supported manual review and provider-backed fresh identity proof implement recovery; acknowledgement is risk acceptance, never provider evidence. No undocumented API is required. Runtime/API/concurrency/device UAT remain implementation/deployment gates, not open architectural predicates.

#### Minimal Thai UX contract — future copy, no UI implementation

| Event | User-facing wording |
| --- | --- |
| Full Disconnection confirmation | “ยกเลิกการเชื่อมต่อ LINE กับ DEMI ทั้งหมด? การเข้าถึง DEMI ผ่าน LINE จะหยุดทันที และระบบจะดำเนินการถอนสิทธิ์ของ DEMI ใน LINE บัญชี DEMI และข้อมูลผู้ป่วยยังอยู่ และเข้าใช้งานด้วยบัญชี DEMI ได้ตามสิทธิ์เดิม” Action: “ยกเลิกการเชื่อมต่อ”; cancel: “กลับ”. |
| Local revoked | “ปิดการเข้าถึง DEMI ผ่าน LINE แล้ว บัญชี DEMI และข้อมูลผู้ป่วยยังอยู่” |
| Remote pending/partial | “กำลังถอนสิทธิ์ของ DEMI ใน LINE ยังยืนยันผลไม่ครบ คุณยังเข้าใช้งานด้วยบัญชี DEMI ได้” |
| Remote confirmed / full completion | Per app: “ยืนยันการถอนสิทธิ์ของ DEMI ใน LINE สำหรับแอปนี้แล้ว”; only all confirmed: “ยกเลิกการเชื่อมต่อ LINE กับ DEMI ครบแล้ว บัญชี DEMI และข้อมูลผู้ป่วยยังอยู่”. |
| Unconfirmed / recovery available | “ยังยืนยันการถอนสิทธิ์ใน LINE ไม่ครบ คุณตรวจสิทธิ์และเชื่อมต่อใหม่ได้ตามขั้นตอนต่อไป” Action: “ดำเนินการต่อ”. |
| Renewed LINE verification | “ตรวจแอปที่อนุญาตใน LINE แล้ว จากนั้นยืนยัน LINE บัญชีเดิมอีกครั้ง ขั้นตอนนี้อาจขอสิทธิ์ใหม่ และยังไม่เชื่อมต่อกับ DEMI จนกว่าคุณจะยืนยันการเชื่อมต่อ” |
| Risk acknowledgement | “คำขอยกเลิกครั้งก่อนอาจทำให้การเชื่อมต่อใหม่หยุดภายหลัง หากเกิดขึ้น คุณยืนยัน LINE และเชื่อมต่อใหม่ได้ บัญชี DEMI และข้อมูลผู้ป่วยยังอยู่” Checkbox: “เข้าใจและต้องการดำเนินการต่อ”. |
| Recovery completed / relink available | “พร้อมให้คุณยืนยันการเชื่อมต่อ LINE ใหม่แล้ว แต่ยังยืนยันการถอนสิทธิ์ครั้งก่อนไม่ครบ การเชื่อมต่อใหม่อาจหยุดภายหลัง” Action: “เชื่อมต่อ LINE ใหม่”. |
| Normal relink available | “เชื่อมต่อ LINE ใหม่ได้แล้ว กรุณายืนยันการเชื่อมต่ออีกครั้ง” |
| Permission invalidated after relink | “LINE ยังไม่อนุญาตให้เชื่อมต่อครั้งนี้ กรุณายืนยัน LINE และเชื่อมต่อใหม่ คุณยังเข้าใช้งานด้วยบัญชี DEMI ได้” |
| Temporary gate / retry | “กรุณาดำเนินการตรวจสิทธิ์และยืนยัน LINE ก่อนเชื่อมต่อใหม่”; proof unavailable: “ยังยืนยัน LINE ไม่ได้ ลองอีกครั้งภายหลัง หรือเข้าใช้งานด้วยบัญชี DEMI”. |

One account-management continuation/status page with trusted app names/settings navigation, no unrelated channel unlink buttons. Preserve existing design tokens/mobile layout, accessible status/focus and text rather than color alone. Reload/duplicate submission retains accurate status. No technical jargon/invented countdown/full success for recovery release/compulsory administrator contact after ordinary timeout.

#### Executable future acceptance specification — all NOT RUN

Implement focused unit tests against a controllable provider adapter and PostgreSQL integration tests with barriers/crash hooks. The candidate new test paths below are planned files, not existing executable evidence:

```text
npm run test -- src/modules/line/services/line-authorization-lifecycle-service.test.ts
npm run test:integration:focused -- tests/integration/line-authorization-lifecycle.integration.test.ts
npm run test:integration:focused -- tests/integration/line-account-linking.integration.test.ts
```

The integration runner generates/migrates only the committed test target; do not run it in this documentation task. Future scoped route/session regression files follow sections 20–22. Mocks test the selected recovery policy, not invented provider drain; external evidence stays separate.

| ID / layer | Arrange -> action -> required assertions |
| --- | --- |
| FD-01 unit + DB | Account observed, MINI proven excluded -> unlink -> version advances/local denied before provider; Account 204 yields full completion with no MINI init/token/request. |
| FD-02 unit + DB | MINI observed, Account independently confirmed absent -> unlink -> only applicable MINI removal; absence must have evidence, not missing Account row. Legacy linked source alone cannot construct this fixture as Account-absent. |
| FD-03 unit + DB | Account + MINI observed -> unlink -> independently addressed tokens/credentials; one 204 is partial, both settled 204s full. Multiple internal tuples stay independent. |
| FD-04 unit + DB | No MINI observation -> unlink -> proven inventory exclusion requires no MINI; exposed/unknown tuple stays recovery-required, no false absent/full and no forced MINI consent. |
| FD-05 DB + future route integration | Capture old scoped context -> commit unlink -> every scoped Patient read/action starting after its authorization boundary denies, nonce/replay included; normal credential login/ordinary authorized SELF remains functional; no data/User deletion or signout. |
| PC-01 unit | Exact valid channel/subject -> provider 204 -> matching attempt settled/confirmed; wrong channel/subject -> no dispatch. Verify correct server credential selection. |
| PC-02 unit + DB | Timeout, lost response, network outage before/after possible dispatch -> local remains revoked; ambiguous reserved attempt unsettled; no success or automatic retry. |
| PC-03 unit | Missing/expired/invalid token, 400 already-withdrawn candidate -> recovery-required; no generic error/SDK logout/token revoke/menu cleanup accepted as consent evidence. |
| PC-04 DB | Process crash before local commit -> no remote call; crash after reservation/before send or after send -> conservative unresolved recovery; no duplicate dispatch across processes. |
| RR-01 DB | All obligations satisfied + no unsettled request -> immediate same-User explicit relink advances version; old scope denied. Different-User retained history conflict remains denied; no transfer. |
| RR-02 DB | Pending -> affected normal launch/link/entry denied; recovery-only proof launch allowed after owner intent/disclosure. Reviewed confirmed/released set permits same-subject relink; ordinary login unaffected. Distinct unowned identity preserves old recovery. |
| RR-03 unit + DB | Replay unlink/recovery intent and concurrent unlink/relink/reservation -> single current operation, normal replay rejection, generation checks on each Serializable retry, no deadlock/nested transaction/provider call under lock. |
| RR-04 unit + DB | Pause A, recover/relink B -> late matching 204 settles only historical A; cannot alter B/version/context or claim current absence/full completion. Unconfirmed attempt retained, no redispatch after restart/release. |
| RR-05 unit + DB | No old access token -> manual review + risk acknowledgement + fresh correct-channel ID proof + exact owner session -> release/audit, remoteOutcome unchanged, no binding/scope. Checkbox alone/wrong owner/LINE/audience/screenshot/operator override denies. Account-only never initializes MINI; unknown MINI release never means absent. |
| RR-06 unit + future UX integration | Timeout/crash/unknown status survives reload -> bounded recovery after local budget, no permanent historical lock/fixed drain wait/full-success claim. Failed proof offers retry/support/ordinary login. Concurrent release/replay -> single decision or denial; version/session change denies. Rolling five-intent limit expires, no permanent exhaustion. |
| RR-07 DB concurrency | Release while sender paused at reservation -> recheck prevents unsent old work; boundary/in-flight call may finish as accepted risk. Concurrent unlink/relink -> ordered locks/retry reread preserve unique ACTIVE ownership, covered row set and historical audit. |
| LP-01 unit + scoped integration | Simulated A revokes B after relink -> fresh MINI entry denies/recovery, no identity fallback; A cannot alter current binding. New valid proof yields only bounded exact-session SELF context, clinical breadth unchanged. |
| LP-02 unit + scoped integration | Issued scope during simulated withdrawal -> existing min(15m, proof expiry), binding/session/SELF checks, no renewal/immediate-detection claim; expiry/unlink denies. Simulation proves local behavior only. |
| PC-05 unit | Malformed response/definitive failure -> remote unconfirmed, sanitized category, no success/auto retry; known pre-dispatch timeout differs from possible dispatch. |
| RG-01 focused regressions | Existing Account link/audience/CSRF; DEMI login/logout/return; SELF policy/Appointment actions; MINI exact-session/channel isolation; J2 Reply; Rich Menu catalog/cleanup; Family and other roles remain isolated. |

**External provider/device UAT, separately NOT RUN:** disposable Account-only, MINI-only applicable-grant, both-grant and never-MINI users; each internal environment's tuple/consent/settings display; valid 204, wrong-channel, invalid/expired/already-withdrawn token; channel-specific manual withdrawal without app reopen; no-token owner recovery; partial outage; LINE iOS/Android/external-browser flow; reconsent and public permalink during pending; late response/lost-permission recovery with explicit risk confirmation and renewed ID proof without old access token. Mock scheduling cannot establish LINE old-request targeting behavior. Record sanitized request correlation/status/versions and witnessed consent changes, never tokens/subjects/patient data. UAT can verify supplied capabilities; it cannot manufacture a provider guarantee from one race experiment. Preserve section 12.2 evidence; no Supabase disposable tests rerun without material environment/version/policy change.

## 24. Residual risks and explicit review items

| Item | Required resolution / disposition |
| --- | --- |
| B17J3-01 route/provenance and care navigation | **RESOLVED AT DESIGN LEVEL** by dated owner namespace/explicit-exit direction; endpoint guards, POST dispatch rejection and UI adapters specified. Not implemented/runtime-tested. |
| B17J3-02 mutation serialization | **DESIGN SELECTED**: first-callback User-then-binding lock/recheck inside existing Serializable interaction transaction, including retries/idempotent returns. Future PostgreSQL concurrency/deadlock verification required, no current PASS. |
| B17J3-03 exact-session liveness/logout replay | **VERIFIED / CLOSED** for measured Demi-dev/Auth v2.197.0 with disabled inactivity/time-box policies: real local revocation/replay, new-session/cross-User distinction, refresh continuity, signature rejection and natural JWT expiry pass. Installed signOut delegates to the same admin.signOut/local endpoint; no separate privileged mutation PASS. Strict nominal policy deadlines and future Auth seam/runtime are not certified. See section 12.2; no new session witness required. |
| Full Disconnection pending release — B17J3-LIFECYCLE-RELEASE | **CLOSED AT DESIGN LEVEL** by dated Option 2: authenticated bounded recovery releases affected operations with unverified history; late removal of a new grant is owner-accepted availability disruption. No absence/drain guarantee; physical schema/runtime/device evidence remains future work. |
| Context/key/TTL/replay/cross-tab policy | Selected 15-minute authenticated encrypted restriction, independent keys/rotation and shared-cookie behavior explicit. Matching credential theft can replay while session/binding/authority live; no individual scope-revocation or single-use claim. |
| Cookie/cache/host security | Existing effective attributes and missing server-wrapper header forwarding recorded; deployment measurements/remediation review required, no automatic app-wide cookie/CSP rewrite. |
| Provider proof versus continuous SDK user | Context proves recent verified launch identity for accepted bounded lifetime; every request checks binding/session/domain. LINE-account switch itself is not a server-pushed event; require gateway reentry/fresh proof on reinitialization. If continuous current SDK identity beyond bounded launch context is required, specify fresh proof transport and availability before GO; do not promise instantaneous detection. |
| Data already rendered / in-flight revocation | No erasure of prior browser data/screenshots; snapshot-to-response/browser-cookie races acknowledged. Current checks must be as late/coherent as practical; no impossible atomicity with LINE/Supabase/network. |

No owner target/care decision remains open. B17J3-03 is closed for the tested configuration; Full Disconnection bounded recovery is selected/testable; runtime/device verification remains required before deployment. Focused consistency review found no new contradiction in mandatory scoped GET/RSC/POST classification, root/history/detail adapters, cookie-removal denial, ordinary-route independence, AES-256-GCM/purpose keys/session hash/lifecycle/absolute 15-minute cap, or User-before-binding Serializable precondition before every idempotent return/retry. No nested transaction/provider I/O under locks is introduced. Patient SELF/domain/nonce/version/audit, Account and Family return, J2 Reply/menu behavior and explicit care exit remain accepted design constraints. This is source/design review, not runtime PASS.

## 25. Explicit non-goals and unchanged governance

No LINE passwordless login, LINE-to-Supabase bootstrap, second authentication/session system, automatic switch/relink/merge/transfer, identity-history erasure, arbitrary deep link/resource first-entry, Family/caregiver/OSM/Hospital expansion, new Patient mutation, generic chatbot/NLU/conversation/workflow framework, iframe/second business app, medication reminders/adherence, native auth/app, offline sync, Push, service messages, notification consent/preferences/quiet hours, provider automation, real-device UAT claim or deployment.

Preserve existing Account LIFF/Login channel/audience and explicit linking policy, OA/Messaging configuration, Option C menus and J2 deterministic narrow Reply. Only Full Disconnection remote termination/status/recovery and necessary pending fences supersede historical unchanged-unlink wording; runtime is untouched in this task. P17D-NOTIF-01 remains **OPEN**; exact identity-history retention/erasure and receipt retention/purge remain open under existing governance. Family Q5 real-data use remains **GOVERNANCE BLOCKED**, P17F-L04 **OPEN**, P17F-L05 **OPEN / FUTURE**, Phase 17E.2 consent parked, MED-02 requirement-gated, Follow-up prospective reminder source and medication delivery/adherence gates unchanged. No reminder/event/content authority follows from choosing MINI App.

## 26. GO / NO-GO and documentation validation

**GO — TECHNICAL CONTRACT COMPLETE / REVIEWED / CLEARED FOR IMPLEMENTATION.** Dated Option 2 acceptance, Full Disconnection, channel-specific evidence, minimum persistence, atomic unlink, explicit recovery/relink checks, bounded attempts, no-token identity route and late-result fencing are selected. B17J3-01/02/03 remain closed at recorded levels. No unsupported absence/drain API is needed; only reconnection availability risk is accepted. No material lifecycle architecture decision remains open.

Clearance covers the implementation contract, not runtime acceptance/provisioning/deployment. Focused unit/DB concurrency/route tests and live LINE API/device/operator UAT are **NOT RUN** here. Trusted inventory/app names/environment credentials are operator inputs validated before enabling each environment; uncertainty stays UNKNOWN and may follow recovery without forced MINI consent. Re-attest B17J3-03 only for material environment/provider/session-policy change. Other governance gates remain unchanged.

This review checks current main/source/owner/ADR consistency, official LINE documentation, changed Markdown links/anchors, UTF-8/BOM/line endings/Thai preservation and git diff --check. Section 12.2 results are **historical executed evidence**, not tests performed again here. No application/full suite, build, dev server, Supabase session experiment, Prisma command/migration, provider mutation or deployment was run. Four documentation files change; runtime/schema/credentials/configuration remain unchanged. Final executed documentation validation is reported in the completion report.

## 27. Final phase status and next step

- Phase 17J.2: **CLOSED / IMPLEMENTED / AUTOMATED VERIFICATION COMPLETE**.
- Phase 17J.3A: **CLOSED / OWNER DECISION COMPLETE**, with dated Full Disconnection clarification; Q07=C topology retained.
- Phase 17J.3B: **TECHNICAL DESIGN CLEARED — B17J3-LIFECYCLE-RELEASE CLOSED BY BOUNDED RECOVERY**.
- Contract: **TECHNICAL CONTRACT COMPLETE / REVIEWED / CLEARED FOR IMPLEMENTATION**, conceptual persistence and bounded recovery selected for implementation review; no runtime changes delivered.
- Phase 17J.3 runtime: **NOT IMPLEMENTED**.
- Phase 17J.4: **NOT STARTED**.
- P17D-NOTIF-01: **OPEN**.

Exact next implementation phase: **Phase 17J.3 — bounded MINI App workflow runtime implementation, including Full Disconnection lifecycle and approved bounded recovery exception**; not 17J.4. Begin only on a separate implementation instruction. This task does not implement, migrate, provision, mutate LINE or deploy.
