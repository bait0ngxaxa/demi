# Phase 17J.3A — LIFF Workflow & Session Decision Pack

## 1. Status / baseline

- **Phase 17J.3A — DECISION PACK COMPLETE / OWNER DECISIONS REQUIRED**
- Source audit / official-document check date: **2026-10-07**
- Targeted Q07 topology correction checked **2026-10-08** against documentation HEAD `f2a7b23b0a60977af6abfc249e62bae63e8a6ede`; original runtime source-audit baseline below remains unchanged.
- Reviewed repository: `bait0ngxaxa/demi`; HEAD `3a85a7a33f60cec27834e85f5ba33a8ab85e09ed` — `fix(line): select first eligible same-envelope reactive event`.
- Working tree was clean before this documentation task.
- **Phase 17J.0 — CLOSED / ARCHITECTURE CONTRACT COMPLETE**; **17J.0B — CLOSED / OWNER DECISION CLOSED**; Option C remains approved.
- **Phase 17J.1 — IMPLEMENTED / AUTOMATED VERIFICATION COMPLETE**; **17J.2A — CLOSED / OWNER DECISION COMPLETE**; **17J.2B — TECHNICAL CONTRACT COMPLETE / REVIEWED**.
- **Phase 17J.2 — CLOSED / IMPLEMENTED / AUTOMATED VERIFICATION COMPLETE**.
- **Phase 17J.3 runtime — NOT IMPLEMENTED**; **Phase 17J.4 — NOT STARTED**.

Recommendation is not approval. This pack adds no runtime, authentication behavior, schema/migration, environment configuration, Rich Menu catalog/layout/assets, provider configuration or resources. No new ADR. Previous documents retain phase-time status/history; this baseline and the latest implementation handoffs govern current status.

## 2. Purpose

เตรียม owner ตัดสินใจว่า workflow แรกคืออะไร, LINE context จะเข้ากับ DEMI session อย่างไร, login-return/entry จะถูก allowlist อย่างไร, ใช้ LIFF app เดิมหรือ app แยก และยอมรับการใช้ controls เดิมในเว็บผ่าน LIFF หรือไม่. Source audit supports **Patient Appointment list/detail** as the first bounded workflow; every new product choice remains **OPEN / OWNER DECISION REQUIRED**.

## 3. Prior accepted architecture

[ADR-0009](../adr/0009-demi-line-oa-liff-identity-and-messaging.md), [17J.0](./PHASE_17J0_LINE_OA_LIFF_ARCHITECTURE_IDENTITY_CONTRACT.md), [17J.0B](./PHASE_17J0B_MULTI_ROLE_RICH_MENU_DECISION_CLOSEOUT.md), [17J.1 contract](./PHASE_17J1_LINE_ACCOUNT_LINK_RICH_MENU_IMPLEMENTATION_CONTRACT.md) and [17J.1 handoff](./PHASE_17J1_LINE_ACCOUNT_LINK_RICH_MENU_IMPLEMENTATION.md) remain authoritative:

- LINE identity and LIFF ID token prove LINE identity; neither is DEMI authentication, password, activation or a Supabase session.
- ACTIVE binding locates an existing DEMI User; it creates no User, Person, Patient relationship, role or session.
- Current canonical ActorContext and server domain authorization govern every business operation. Client role/resource/identity and menu `presentationRole` are never authority.
- Multi-role Option C changes presentation only. Sensitive detail belongs in authenticated DEMI UI; LINE chat stays bounded.
- No generic chatbot/conversation state. 17J.4 remains separate and gated by approved reminder semantics.

[17J.2A closeout](./PHASE_17J2A_REACTIVE_MESSAGING_DECISION_CLOSEOUT.md) J2-Q06 explicitly chooses no embedded list/detail navigation and defers authenticated LIFF to 17J.3. [17J.2B](./PHASE_17J2B_DETERMINISTIC_REACTIVE_MESSAGING_TECHNICAL_CONTRACT.md) and [17J.2 implementation](./PHASE_17J2_DETERMINISTIC_REACTIVE_MESSAGING_IMPLEMENTATION.md) preserve narrow text-only Reply. This pack does not reopen those decisions.

## 4. Current source audit

The following sources were inspected at the reviewed HEAD. Tests are source evidence only; **no tests were run**. Existing test reports are historical evidence, not newly executed verification.

| Evidence | Source inspected | Current fact / consequence |
| --- | --- | --- |
| E01 architecture/status | [CONTEXT](../CONTEXT.md), ADR-0009 and all 17J.0/0B/1/2A/2B/2 handoffs/contracts linked above | Identity binding, presentation and business authority are separate. J2-Q06 supplies the explicit appointment-navigation handoff. Earlier NOT IMPLEMENTED statements are historical. |
| E02 account entry | [page](../../app/line/account/page.tsx), [client](../../app/line/account/line-account-client.tsx), [client tests](../../app/line/account/line-account-client.test.tsx) | Request-time summary from DEMI session; LIFF init/login/identity is additional context. Unauthenticated state links normal login with bounded account return. Tests cover safe UI states, confirmations, account login link and in-client-only close dispatch; they do not prove cookies on devices. |
| E03 navigation/menu | [builder](../../src/modules/line/services/line-deep-link-builder.ts), [builder tests](../../src/modules/line/services/line-deep-link-builder.test.ts), [catalog](../../src/modules/line/rich-menu/catalog.ts), [layout](../../src/modules/line/rich-menu/layout.ts) | Account intents use LIFF root; business workspace intents use ordinary public-origin URLs. Four Patient variants have appointment postback, broad workspace URI, account management and applicable switches. No business-workflow LIFF intent exists. |
| E04 verified binding | [LINE Login adapter](../../src/modules/line/adapters/line-login-client.ts), [account service](../../src/modules/line/services/line-account-service.ts), [LINE session service](../../src/modules/line/services/line-session-service.ts) | Server verifies raw ID token with expected Login channel, issuer/subject/audience/expiry. Account intents bind exact DEMI User and verified Supabase session hash; explicit confirmation and transactional lifecycle govern link/unlink. Inactive cleanup locator/history is not ACTIVE authority. |
| E05 env/packages | [server env](../../src/lib/env/server.ts), [package.json](../../package.json) | `getLineLiffId()` validates `NEXT_PUBLIC_DEMI_LINE_LIFF_ID`, returns string/null, server passes public ID as client prop. Canonical public origin validated separately. LIFF 2.31.1; Next 16.3.0; installed SSR 0.12.4 and supabase-js 2.112.3 agree with package files. No workflow LIFF env exists. |
| E06 login | [page](../../app/login/page.tsx), [form](../../app/login/login-form.tsx), [schema](../../src/modules/auth/schemas/login-schema.ts), [actions](../../src/modules/auth/transport/server-actions.ts), [authentication service](../../src/modules/auth/services/authentication-service.ts) | Credential login uses current identifier/password boundary and provider alias; successful provider auth is insufficient until current DEMI actor passes. Exact return targets and local sign-out described in §6–7. |
| E07 session/actor | [actor service](../../src/modules/auth/services/actor-context-service.ts), [proxy](../../proxy.ts), [SSR server](../../src/lib/auth/supabase-server.ts), [SSR proxy](../../src/lib/auth/supabase-proxy.ts) | Proxy refreshes/verifies claims; application resolves provider user via `getUser()` and current ACTIVE mapped User with canonical roles/memberships. No first-party `createBrowserClient` usage found in app/src; browser credential submission is Server Action, not a separate browser Supabase login flow. |
| E08 appointment pages | [root](../../app/app/personal/appointments/page.tsx), [relationship history](../../app/app/personal/appointments/[relationshipId]/page.tsx), [detail](../../app/app/personal/appointments/[relationshipId]/[appointmentId]/page.tsx), [controls](../../app/app/personal/appointments/patient-appointment-interaction-controls.tsx) | Existing request-time SELF pages and two approved Patient interactions; detail generates cancellation nonce. Root includes links into care as well as appointment history. |
| E09 appointment reads | [page context](../../src/modules/patient-self/transport/patient-self-care-page-context.ts), [care query](../../src/modules/patient-self/services/patient-self-care-query-service.ts), [SELF policy](../../src/modules/patient-self/policies/patient-self-policy.ts), [SELF query](../../src/modules/patient-self/services/patient-self-query-service.ts), [views](../../app/app/personal/patient-self-record-detail-views.tsx), [chooser](../../app/app/personal/patient-self-relationship-navigation.tsx) | Exact persisted SELF ownership, bounded histories and allowlisted projections; current fields are in §8. No LINE consistency check on ordinary business pages. |
| E10 mutation authority | [actions](../../src/modules/appointments/transport/server-actions.ts), [service](../../src/modules/appointments/services/appointment-service.ts), [access service](../../src/modules/appointments/services/appointment-access-service.ts) | Form/schema validation, current actor, persisted capability/scope checks, same-relationship appointment lookup, serializable version/nonce/idempotency guards and existing audits/revalidation. UI visibility alone grants nothing. |
| E11 domain contracts | [17C](./PHASE_17C_PATIENT_CARE_JOURNEY_APPOINTMENT_READ.md), [17D.0](./PHASE_17D0_APPOINTMENT_INTERACTION_CONTRACT_CONSOLIDATION.md), [17D.1](./PHASE_17D1_APPOINTMENT_INTERACTION_IMPLEMENTATION.md) | 17D.1 supersedes 17C's earlier appointment read-only/name exclusions. Acknowledgement/cancellation-request semantics approved independently. P17D-NOTIF-01 remains OPEN. |
| E12 alternatives | [Personal root](../../app/app/personal/page.tsx), [Medication page](../../app/app/personal/medications/page.tsx), [Medication workspace](../../app/app/personal/medications/personal-medication-workspace.tsx), [Family root](../../app/app/family/page.tsx), [Family page context](../../src/modules/family/transport/appointment-grant-page-context.ts), [Work root](../../app/app/page.tsx), CONTEXT Family/open-requirement sections | Implemented web routes do not equal approved LINE entry. Medication SELF, Family delegated grants and Work scopes have different requirements/gates (§10). |

## 5. Current LIFF / account-link behavior

Existing Account LIFF endpoint is `/line/account`; builder returns `https://liff.line.me/{NEXT_PUBLIC_DEMI_LINE_LIFF_ID}` for `LINK_ACCOUNT`, `MANAGE_ACCOUNT`, `SWITCH_WORKSPACE`. It intentionally does not append `/line/account` a second time. The page resolves the current DEMI-owned summary before client initialization; it is not a general verification of whichever LINE subject opened the browser.

Client calls `liff.init({ liffId })`, then `isLoggedIn()` and `isInClient()`. External LINE login is explicit with canonical `${publicOrigin}/line/account` redirect. Missing ID/config or SDK failure has safe unavailable states. Unauthenticated DEMI state offers `/login?returnTo=%2Fline%2Faccount` independently of LINE login. Linking obtains a session-bound intent, shows confirmation, sends raw `getIDToken()` only in same-origin POST body and server verifies it. Optional access token is transient friendship evidence. Unlink requires current DEMI ownership/session and confirmation; it does not require a LINE token to revoke the owner's binding.

Account intent lifetime is five minutes, challenge is 256 bits, hash binds verified Supabase `session_id`; `getCurrentLineSession()` requires claims subject and `getUser()` subject to match before DEMI mapping. Transactions recheck ACTIVE User and action/session/challenge/lifecycle. No LINE-based Supabase login is present. Local unlink commits before provider cleanup; an unlinked raw cleanup locator grants zero business authority.

**Implemented source is not proof of live provider deployment or successful real-device operation.** Prior handoffs say external provisioning/UAT/deployment not claimed; this task does not inspect provider console, credentials or production.

## 6. Current DEMI authentication/session behavior

Normal login takes bounded National ID/admin identifier and password in form data, resolves the server-owned provider alias, calls `signInWithPassword`, then `resolveCurrentActorAccess(..., expectedAuthSubject)`. Unmapped, inactive or subject-mismatched accounts are denied and the resulting session is signed out. Activation/account recovery remain existing DEMI processes. LINE cannot bypass them.

`resolveCurrentActorAccess()` calls provider `getUser()`, maps authSubject to current DEMI User, requires ACTIVE status and projects canonical Person/roles/Hospital memberships/OSM relationships. Provider absence/expiry is unauthenticated; infrastructure errors are not treated as successful empty/authorized results. `resolveActorAccessByUserId()` used by J2 is an auth-owned actor resolver, **not session creation**.

`proxy.ts` calls `updateSupabaseSession()` for matched requests, which uses SSR `getAll/setAll`, `getClaims()` and propagates refreshed cookies to request/response plus SSR headers. Proxy is session maintenance; pages/actions must still enforce application/domain authority. Server client reads async Next cookies; cookie writes unavailable during Server Component rendering are caught, while login/logout require writable cookies.

**Cookie source precision:** wrappers do not pass explicit `cookieOptions`. Installed `@supabase/ssr/src/utils/constants.ts` defaults to `path=/`, `sameSite=lax`, `httpOnly=false`, and a long cookie maxAge; it does not specify `secure`. Thus this audit cannot claim all current auth cookies are HttpOnly/Secure or that cookie lifetime equals authenticated session lifetime. Historical contract intentions are not measured browser attributes. Record effective production cookie attributes and verify appropriate HTTPS/CSRF/cache protections in the later technical review; do not change authentication here or silently treat a cookie-policy change as navigation work.

Logout calls `signOut({ scope: "local" })`, revalidates layout and redirects `/login`. This ends the current provider session rather than promising all-device logout. `liff.logout()` and `liff.closeWindow()` are not DEMI logout; unlink is not DEMI logout. Rendered data already delivered to a browser cannot be retroactively erased by a subsequent server check.

## 7. Current deep-link / returnTo behavior

| Boundary | Accepted destinations / actual result |
| --- | --- |
| `loginReturnToSchema` | Exactly `/line/account`, or `/app/family/invitations#` followed by exactly 43 ASCII `[A-Za-z0-9_-]` characters. No arbitrary relative path, `/app/personal/appointments`, gateway, absolute URL or query variation. |
| `/login` with already AUTHORIZED actor | Redirect to `/line/account` only when that exact safe target is present; otherwise `/app`, including a Family-shaped safe target. |
| Login form | Family invitation is recovered from decoded browser fragment, checked by Family-only schema, removed from visible URL with `replaceState`, then takes precedence over safe page prop in hidden field. It is a specialized invitation transport, not a general workflow return mechanism. |
| Successful `loginAction` | Revalidates layout, independently validates submitted `returnTo`, redirects exact accepted destination or defaults `/app`. Hidden field is never trusted without server validation. |
| Unauthenticated appointment pages | Page context redirects plain `/login`; no appointment return intent is preserved. Forbidden actor/read goes `/app`; unavailable/foreign resource uses not-found behavior. |
| Business LINE builder | `OPEN_PATIENT_WORKSPACE` → canonical public-origin `/app/personal`; `OPEN_WORK_WORKSPACE` → `/app`. These are ordinary web URLs, not business LIFF URLs. |

Central gap: **opening LIFF does not imply DEMI/Supabase session**. Current account return is bounded, but no Appointment LIFF/login-return lifecycle or binding/browser mismatch guard is implemented. Family's accepted fragment is not precedent to put appointment IDs, tokens or arbitrary destinations into URL state. Future allowlist work must preserve existing account/Family semantics and cover both already-authenticated and newly-authenticated login paths.

## 8. Existing Patient Appointment UI / capabilities

Opening `/app/personal/appointments` provides these existing capabilities after DEMI authorization:

| Surface | Data/navigation actually available |
| --- | --- |
| Root chooser | Own relationship cards: Hospital name/code/status and HN (`hospitalNumber`, or missing label). Each card links **ข้อมูลการดูแล** (`/app/personal/care/[relationshipId]`) and **นัดหมาย** history. This is not a strictly isolated appointment-only screen. No relationship is selected from LINE. |
| Relationship history | Hospital context; scheduled date/time, type, status, duration if present, location type/detail, responsible clinician display name/profession presentation, appointment-time OSM name when present, current-version acknowledgement/source and latest cancellation-request status. Links to detail and older pages. |
| Detail | Same approved schedule/type/status/duration/location and Hospital context, clinician and appointment-time OSM presentation, acknowledgement, cancellation-request state/history/source, plus controls below. No creator identity, internal notes, phone/contact fields, raw actor/assignment IDs or audit payload. Resource locators/version/nonce exist internally in authorized route/form data. |
| Acknowledgement | “รับทราบนัดหมาย” only for SCHEDULED, unacknowledged current version. Records receipt, not attendance; never changes canonical AppointmentStatus. Existing current acknowledgement renders instead. Stale version conflicts; current-version retry returns canonical fact. |
| Cancellation request | SCHEDULED and no pending request: “ขอยกเลิกนัด”. Creates/returns bounded request; **does not cancel appointment**. Hospital reviews; request lifecycle PENDING/APPROVED/REJECTED/SUPERSEDED. Nonce/version checks and one-pending constraint govern retries/concurrency. No Patient withdrawal. |
| Other navigation/actions | Breadcrumbs return detail → relationship history → root/Personal. Existing care links remain. No Patient direct create/cancel/reschedule/reschedule-request/complete/no-show/proxy/coordination/Hospital review action is added by Personal pages. |

History uses validated page-number offset pagination, **50 items + 1 lookahead**, `scheduledAt DESC, id DESC`; older-page link preserves relationship scope. This is existing behavior, not a cursor redesign in 17J.3A. Acknowledgement projection matches current appointment `updatedAt`; cancellation history is bounded (query takes 5 most recent). Detail creates a fresh cancellation submission nonce, controls carry expected version and refresh after success; loading/disabled/error/conflict/success/empty states remain existing Thai UI.

Read authority chain: current browser actor → policy capability/PATIENT → exact persisted User/Person with ACTIVE User and PATIENT role → that Person's PatientProfile → exact own relationship → record constrained by relationship and appointment ID. SELF historical read does **not** filter Hospital operational status; cards may show suspended/pending Hospitals. Mutation access independently requires Hospital ACTIVE, reloads authoritative actor/relationship, action-specific capability and SELF scope inside the service transaction. A visible SCHEDULED control can still be denied at submission; do not equate read permission with mutation permission.

Server Actions `acknowledgeOwnPatientAppointmentAction` / `requestOwnPatientAppointmentCancellationAction` validate allowlisted fields/schema, resolve current protected actor, call existing services, sanitize errors and revalidate Patient paths. Services require SELF interaction source, same-relationship record, status/version constraints, serializable persistence, idempotency and existing atomic audits. A multi-role actor is still restricted to SELF when using these actions.

**J2 disclosure date/time + Hospital name does not cap authenticated web projections.** HN, location, names and request history already appear only in DEMI UI under its policy; opening UI does not send them into LINE chat. Accepting Q06/Q10 also accepts existing care/breadcrumb navigation, not only the two appointment controls. A more restricted product would require an explicit later UX decision, not silent UI duplication.

## 9. Official platform evidence

Original P01–P10 URLs checked **2026-10-07**; Q07 topology sources P05/P11–P13 checked **2026-10-08**. These are platform guarantees/documented constraints, not DEMI session proof or device UAT.

| ID / official source | What it supports | What it does not establish |
| --- | --- | --- |
| P01 [Opening a LIFF app](https://developers.line.biz/en/docs/liff/opening-liff-app/) | Permanent root `https://liff.line.me/{liffId}` resolves configured endpoint. Extra path/query/fragment enters primary `liff.state`, then concatenates with endpoint path/query in secondary redirect. Browser opening depends on OS/app-link/WebView behavior. `liff.referrer` can carry prior URL on LIFF-to-LIFF transition. | No DEMI session, allowlist, privacy-safe input or guaranteed LINE-client launch. Do not append endpoint path twice or interpret state/referrer as trusted callbacks. |
| P02 [LIFF API reference](https://developers.line.biz/en/reference/liff/) | `init` at endpoint/descendant only; wait before URL changes and handle both redirects. `isInClient` distinguishes LIFF browser; `isLoggedIn` checks LINE login. `login` is for external/LINE in-app browser, with endpoint-bounded redirectUri; LIFF browser login happens during init. `getIDToken` requires granted `openid`. `closeWindow` is not guaranteed externally. | No browser actor, role, binding or SDK guarantee on sibling `/app` paths. Primary URL may contain platform access token; SDK removes credentials after init resolves. Never log/referrer-forward that transient URL. |
| P03 [Developing LIFF apps](https://developers.line.biz/en/docs/liff/developing-liff-apps/) | Init per page using SDK features; preserve SDK query machinery until resolved. Non-LIFF external-page transition may show warning. Close behavior depends on LINE version/settings. | Full-page navigation does not preserve JavaScript memory or guarantee SDK scope/close on destination. A gateway does not automatically extend endpoint scope. |
| P04 [Using user data](https://developers.line.biz/en/docs/liff/using-user-profile/) and [Verify ID token](https://developers.line.biz/en/reference/line-login/#verify-id-token) | Send raw identity proof to server for provider verification with expected client_id; decoded profile is not server proof. | Token proves LINE principal, not which LIFF button/menu launched it or which DEMI session exists. Same Login-channel audience cannot distinguish Account vs Workflow LIFF app. |
| P05 [Registering LIFF apps](https://developers.line.biz/en/docs/liff/registering-liff-apps/) | Up to **30 LIFF apps per channel**, distinct IDs/endpoints; HTTPS endpoint with no fragment; openid scope available. Current page recommends LINE MINI App for new apps as a platform direction. | No deployed app inventory/capacity was checked. Vendor guidance makes MINI App a first-class new-app alternative in Q07, not owner approval. A second classic LIFF remains supported; capacity/config requires later verification. |
| P06 [Provider/channel management](https://developers.line.biz/en/docs/line-developers-console/best-practices-for-provider-and-channel-management/) and [LINE Login setup](https://developers.line.biz/en/docs/line-login/getting-started/) | Same Provider assigns same user's namespace across channels; different Providers differ; channels cannot move between Providers. | Namespace consistency is not DEMI authorization or permission to combine unrelated services. Preserve dedicated DEMI Provider and existing Account Login channel; a same-Provider MINI App channel is a distinct Q07 alternative. |
| P07 [LIFF overview](https://developers.line.biz/en/docs/liff/overview/) | iOS WKWebView / Android WebView; external browsers have different API support; HTTP headers govern applicable cache behavior. | No guarantee of sharing DEMI cookies with Safari/Chrome, another WebView or device; no promise that delivered page/cache is instantly erased after revocation. |
| P08 [Supabase SSR Next.js guide](https://supabase.com/docs/guides/auth/server-side/creating-a-client?queryGroups=framework&framework=nextjs) | Cookie-based SSR, server/browser responsibilities, proxy refresh because Server Components cannot write cookies; verified auth rather than trusting raw getSession data. | No LIFF cookie sharing, DEMI account mapping, PATIENT scope or LINE-to-Supabase login. |
| P09 [Supabase advanced guide](https://supabase.com/docs/guides/auth/server-side/advanced-guide) | Refresh cookies/headers must be delivered safely; cache/prefetch timing matters. getClaims verification differs from current auth-server session check via getUser. Local vs global sign-out and browser-readable SSR cookies are explicit. | Cookie expiry is not session validity; cross-tab/device revocation is not instantaneous UI erasure. No device behavior verified. |
| P10 [Supabase SSR source via Context7](https://github.com/supabase/ssr/blob/main/_autodocs/api-reference/createServerClient.md), [types](https://github.com/supabase/ssr/blob/main/src/types.ts), [changelog](https://supabase.com/changelog) | Context7 `/supabase/ssr` resolved/queried for cookie propagation; current setAll delivers response cache headers. Installed source 0.12.4 inspected to anchor repository behavior. | Main docs are current upstream, not a guarantee of all installed defaults. Changelog `.md` fetch failed; HTML index used as fallback, not an exhaustive upgrade audit. No upgrade requested. |
| P11 [LINE FAQ — web/LIFF migration to MINI App](https://developers.line.biz/en/faq/) | A web app can be implemented as MINI App, but a LIFF app created under a LINE Login channel cannot be migrated to a MINI App channel as either unverified or verified MINI App. LINE recommends unverified MINI App when unsure or considering future verification. | Reusing web code is not channel migration; no guarantee of retaining classic app IDs, URLs or configuration. |
| P12 [MINI App Console guide](https://developers.line.biz/en/docs/line-mini-app/discover/console-guide/) | One web app per MINI App channel, represented by Developing/Review/Published internal channels, each with its own LIFF ID/endpoint; multiple apps cannot be added to an internal channel. | Not the 30-app Login-channel topology. Console lifecycle/configuration, service-region eligibility and publication requirements need later review; no deployed MINI App verified here. |
| P13 [Provider design basics](https://developers.line.biz/en/tips/2026/06/25/provider-design-basics/) | Same Provider gives the same user ID across LINE Login, Messaging API and LINE MINI App channel types. Channels cannot move to another Provider. | Same user ID is neither DEMI authentication nor interchangeable token audience. No permission to combine unrelated services. |

Installed **Next 16.3.0** guides read: `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/cookies.md`, `redirect.md`, `01-app/03-api-reference/03-file-conventions/proxy.md`, and `01-app/02-guides/authentication.md`. Official counterparts: [cookies](https://nextjs.org/docs/app/api-reference/functions/cookies), [redirect](https://nextjs.org/docs/app/api-reference/functions/redirect), [proxy](https://nextjs.org/docs/app/api-reference/file-conventions/proxy), [authentication](https://nextjs.org/docs/app/guides/authentication). Installed guidance: async cookies read in Server Components, writes in Server Functions/Route Handlers before streaming; redirects support external URLs so application allowlisting remains necessary; Server Action redirect navigates client-side with JavaScript or serves 303 for progressive-enhancement submissions, normally pushing history, while other redirect contexts normally replace; middleware convention is renamed/deprecated in favor of proxy. None establishes LIFF session transfer or replaces domain checks.

Permanent-link helpers are not navigation authorization: [LIFF permanentLink API](https://developers.line.biz/en/reference/liff/) documents endpoint-prefix restrictions; `createUrlBy(url)` is preferred over potentially deprecated `createUrl()` / `setExtraQueryParam()`. No helper may turn authorized detail routes into resource-bearing LINE links in this first slice. P03 also documents recent-services restart retaining access token/history/scroll in qualifying LINE versions/settings; closing a window is not a logout or fresh-consistency guarantee.

**Endpoint consequence (repository inference from P02/P03):** future `/line/workflow` is a valid narrow SDK gateway, but `/login` and `/app/personal/appointments` are siblings, outside its guaranteed init scope. Recommend return to gateway after credential login for fresh LINE/binding/session comparison, then ordinary internal DEMI navigation. Do not widen Account endpoint, run SDK everywhere or promise close support on appointment pages solely to preserve a cosmetic affordance.

## 10. Candidate workflow comparison

Existing-route maturity is evidence for reuse, **not LINE-entry approval**. All candidates need the missing session/consistency/return boundary.

| Candidate | Approved semantics / authorization / UI | Sensitivity / mutations | Unresolved requirements / governance | LINE value / additional architecture / risk |
| --- | --- | --- | --- | --- |
| A Patient Appointment list/detail | 17C + closed 17D.0/1; exact persisted SELF; mature root/history/detail and scoped services | Healthcare timing/Hospital/HN/location/names; acknowledgement and request-cancel exist | Owner must accept UI controls and breadth; J3 session/lifecycle required; reminders stay P17D-NOTIF-01 | Direct complement to J2-Q06; no new domain/projection. Lowest relative business change; nontrivial auth/cookie risk remains. **Recommended, OPEN.** |
| B General Personal `/app/personal` | Current Patient SELF home, relationship navigation and several implemented features | Broad health/account/navigation surface; downstream pages include independent writes | Scope of first LINE entry less precise; acceptance of breadth needed | Convenient home but repeats “ข้อมูลของฉัน” and offers weaker single-task evidence. Same gateway plus broader review; medium risk. |
| C Personal Medication `/app/personal/medications` | Approved 17G bounded SELF medication/schedule/occurrence source; active/stopped lists and detail/editor | Medication names/dose/instructions/times; create/edit/stop/schedule controls | MED-02 remains requirement-gated; reminders/delivery/adherence not inferred; manual UAT separate | Valuable later structured entry; require separate LINE scope/control acceptance, no new clinical model for existing features. Medium risk and more mutable payload. |
| D OSM Work | `/app` Work projection and assigned-Patient routes already use operational authority and exact active assignment | Other persons' records, proxy acknowledgement/request, coordination/create where approved | No area/geographic scope inference; choose exact workflow/Patient selection and stale assignment UX | Field access value, but not one bounded task yet. More resource scoping/third-party privacy review; high first-tranche risk. |
| E Hospital Work | `/app` Hospital workspaces and patient routes; direct ACTIVE membership/Hospital action scope | Multi-Patient operational data; create/reschedule/cancel/review/terminal actions vary by capability | Need named workflow and operational role/scope; no parent authority/ADMIN bypass | Useful operational entry but larger consequences, Hospital selection and write surface. High first-tranche risk. |
| F Family/caregiver | Relationship/invitation and bounded delegated appointment read exist; grant authority is separate from Patient SELF | Another person's approved six-field appointment projection; relationship/grant management writes, no delegated appointment mutation | **Q5 real-data GOVERNANCE BLOCKED; P17F-L04 OPEN, L05 OPEN / FUTURE**; no LINE Family approval, minors/legal representation deferred | Potential later value, but requires independent governance/consent/delegation and LIFF review. Not eligible for first tranche. |

Later candidates: care journey (existing SELF factual projections; separate entry/breadth approval), profile (17E.1 approved bounded edits; identity correction not implied), service requests (existing purpose-specific SELF/Work services; separate mutation/entry review), Family (gates above), OSM assigned workflows, Hospital work, account security/recovery (existing credential/recovery authority; no LINE takeover). None is approved here. Medication schedule/occurrence source is not medication reminder or adherence approval.

## 11. Recommended first workflow

**A — Patient Appointment list/detail; OPEN / OWNER DECISION REQUIRED.** J2-Q06 expressly hands detailed/list navigation to 17J.3. Existing SELF pages/policies and separately approved interactions remove the need for new clinical/domain rules. Pair deterministic “ตรวจสอบนัดหมาย” narrow chat result with separate “ดูนัดหมายทั้งหมด” authenticated UI entry.

First entry resolves only appointment root; relationship/detail navigation happens inside existing authorized UI. This reduces transport locators, not the sensitivity of the rendered UI or the need for a correct session/binding lifecycle.

## 12. Session/authentication model alternatives

| Model | Assessment |
| --- | --- |
| Existing DEMI authentication remains required (Q02=A) | **Recommended.** LINE proof supplements identity consistency. Preserve activation, credentials, recovery and canonical server actor. More login friction where LIFF lacks DEMI cookies. ADR-0009 remains sufficient. |
| Verified binding bootstraps DEMI/Supabase session (Q02=B) | Material authentication-architecture change, outside accepted baseline. Requires explicit separate auth/security decision and new/superseding ADR review, recovery/threat analysis, revocation/unlink consequences, session lifecycle and cross-account reconciliation before implementation. Not a navigation optimization authorized by this pack. |

Q03: recommend normal credential login plus bounded return. Dead-end “open separately” and immediate close do not complete the task; an ordinary-web alternative may be offered deliberately when LINE/SDK is unavailable, but cannot be advertised as having passed LIFF consistency. No credential or token in URL/referrer/chat.

## 13. Binding/session consistency model

Three concepts must remain distinct:

1. **LINE context:** SDK initialized / LINE Login state / browser environment; transport and presentation evidence, never server business authority. Client `isInClient` cannot prove genuine entry provenance to server.
2. **LINE binding:** exact verified LINE subject resolves **current ACTIVE** mapping to DEMI User; lifecycle consistency evidence, not credentials or domain permission.
3. **DEMI browser actor:** verified current DEMI session resolves canonical current ActorContext; domain policy supplies business authority.

Recommendation for LINE-launched sensitive workflow: usable initialized context + server-verified subject + exactly one current ACTIVE binding + current authenticated DEMI User **equal to binding User** + current PATIENT SELF authority. External LIFF browser is still a LIFF workflow entry and must meet proof/consistency checks; do not require `isInClient=true` to permit external fallback. Unlinked/ambiguous binding or provider failure gives generic account-management/retry state, no Patient projection.

**Security-critical mismatch:** LINE binds User A while DEMI browser actor is User B → no Patient data from A **or B through that mismatched workflow entry**. Generic mismatch state; offer account management/return and explicit logout then normal login to correct account. Do not reveal A's name/IDs, auto-switch session, use LINE's A as actor, merge, replace binding or relink automatically. Re-enter gateway with fresh proof after explicit correction; account page remains its existing management flow, not an automatic correction.

Normal copied **ordinary DEMI routes** retain DEMI session + domain policy and never acquire a global LINE requirement. A copied LIFF URL rechecks the recipient's current proof/binding/browser actor, not the sender's identity. No URL carries authority.

**Lifetime gap requiring later technical contract:** entry verification alone cannot enforce unlink/account switch after redirect. Existing appointment pages/actions reauthorize DEMI but do not track LINE-launched provenance or recheck binding. Recommend fail closed on subsequent LINE-scoped server requests after unlink/mismatch/expiry, without blocking unrelated normal web sessions. Later design must specify minimal server-verifiable, session-bound navigation context, current binding/lifecycle checks, invalidation and coexistence across tabs, including action submissions and BFCache restoration. A client flag/query/referrer cannot opt out or grant access; no persisted raw LINE token, second application session, domain API, generic router or new clinical projection is implied. Exact mechanism/expiry/race handling is **TECHNICAL CONTRACT REQUIRED**, not implemented or silently selected here. If UI reuse unchanged cannot meet this scoped lifetime requirement, surface the conflict before implementation; do not quietly downgrade to launch-only checks.

## 14. Login-return alternatives

- **Q11=A direct Appointment root:** fewer hops; suitable for ordinary web or if fresh consistency and lineage are independently enforced before navigation. Current root cannot perform LINE proof check; redirect alone skips post-login account reconciliation.
- **Q11=B bounded workflow gateway: recommended for LINE-origin login.** Return to conceptual `/line/workflow` with only server-allowlisted `OPEN_PATIENT_APPOINTMENTS`; initialize afresh, obtain new raw proof in memory, verify server-side, resolve current binding/session/SELF again, then resolve `/app/personal/appointments`. Tokens do not survive login via URL/storage.
- **Q11=C always `/app`:** current generic fallback is safe but loses workflow intent and cannot be called task completion.

Recommend B because login can change the browser account and invalidates pre-login comparison; gateway is the scoped SDK location. It does **not** guarantee preserving a LIFF window or cookies across the handoff. Login must use the DEMI credential boundary in the actual browser; if another browser opens, it must authenticate independently and re-enter the bounded gateway or deliberately continue ordinary authenticated web. Do not transfer session/token through URLs. No automatic redirect loop if cookies are rejected, login fails or provider is unavailable; show retry/account-management/ordinary-web choices with generic copy.

Both `/login` already-authorized redirect and post-submit action must eventually use the same server-owned allowlist while preserving account/Family returns. Exact encoding/transport and collision with Family fragment hydration need technical review; do not insert a workflow into Family invitation syntax. No implementation in this pack.

## 15. Return target / deep-link alternatives

Recommend **named navigation intent (Q04=B)**: `OPEN_PATIENT_APPOINTMENTS` resolves server-side to exact `/app/personal/appointments`. This is conceptual vocabulary only, absent from current builder/schema. First tranche has one workflow, not a generic router. Unknown/duplicate/malformed intent, alternate path, encoded traversal, protocol-relative/absolute URL or extra resource locator must be refused or return a generic bounded entry state, never reflected as a redirect.

Arbitrary relative returnTo (A) has broad unintended route/encoding surface; signed arbitrary URL (C) signs an overly broad target and does not make it appropriate. Existing exact return allowlist is a useful pattern; extend through one authoritative model, not independent competing client/server maps.

Q05=A root-only avoids relationship/appointment IDs in LINE URL/state/menu. B direct relationship and C direct detail reduce clicks but increase locator/privacy/copy/staleness complexity; later proposals need opaque bounded locators and exact server reauthorization. Normal detail routes already contain locators within DEMI; root-only recommendation is about **LINE entry/login-return**, not removing internal web navigation.

## 16. LIFF app topology alternatives

| Topology | Value / costs / recommendation |
| --- | --- |
| Q07=A reuse existing Account LIFF / multi-intent | Fewer configured apps. Changes working `/line/account` endpoint/SDK scope and login-return assumptions; requires exact backward compatibility and finite intents. Highest regression exposure to the stable account foundation; no evidence makes it safer. |
| Q07=B second classic LIFF app under existing DEMI LINE Login channel | Preserves Account endpoint and existing expected Login audience; fits established integration and documented 30-app capacity. Adds app ID/endpoint/config/runbook/UAT and future provisioning, with live capacity still unchecked. Operationally simpler than another channel (repository inference), but choosing classic now does **not** provide a later direct MINI App channel migration. |
| Q07=C new LINE MINI App channel under the same DEMI Provider | First-class alternative favored by current vendor guidance for new apps (P05/P11). Same-Provider subject namespace remains consistent (P13); existing Account LIFF can stay unchanged. Adds channel provisioning, expected-audience configuration and internal-channel endpoint/LIFF-ID lifecycle. One web app per MINI App channel, not 30 independent apps (P12). Eligibility, publication/verification choice and operational readiness remain unverified. |
| Q07=D ordinary DEMI web | Least provider/configuration work; existing browser authentication applies. Loses LIFF identity-consistency/close context; valid if owner rejects platform costs. Current workspace URLs remain ordinary web. |
| Q07=E other | Requires a bounded, evidence-backed proposal and explicit review before adoption. No generic router or new authentication authority is implied. |

**Q07 remains genuinely OPEN / OWNER DECISION REQUIRED**, particularly between B and C. Current LINE guidance favors MINI App for newly created apps; DEMI must weigh that against its established Login/LIFF foundation and operational simplicity. Neither B nor C is selected by this pack. Both preserve the Account LIFF and dedicated DEMI Provider. The inability to directly migrate a classic Login-channel LIFF to MINI App is a topology commitment, not a routine future migration (P11).

Conceptual future config only: existing `NEXT_PUBLIC_DEMI_LINE_LIFF_ID` remains Account; possible `NEXT_PUBLIC_DEMI_LINE_WORKFLOW_LIFF_ID` identifies the selected business entry. B retains the existing expected `DEMI_LINE_LOGIN_CHANNEL_ID`. C requires explicit server-owned expected MINI App channel/audience configuration appropriate to the selected internal environment, separate from Account verification; exact names/mapping belong in the later technical contract. Same-Provider user ID must never justify accepting an arbitrary channel audience. Raw verified token audience identifies a channel, not an individual LIFF app; B's app separation is a purpose/regression boundary, not cryptographic app isolation (P04). Both options retain server proof verification, ACTIVE binding/session consistency, domain authorization and navigation allowlisting.

No app/channel is created and no env/provider/runtime configuration changes here. MINI App selection does not approve service messages, Push, native authentication, new business semantics or owner closeout. Later technical/operator review must establish the selected topology's IDs, audiences, endpoints, scope/consent, regional eligibility and publication lifecycle before provisioning.

## 17. Entry-surface alternatives

Recommend **Q08=A dedicated Patient Rich Menu URI “ดูนัดหมายทั้งหมด”**. Scope if approved: `PATIENT_DIRECT`, `PATIENT_PATIENT_OSM`, `PATIENT_PATIENT_HOSPITAL`, `PATIENT_PATIENT_OSM_HOSPITAL` only. No chooser/OSM/Hospital/unlinked variant. Existing two top actions plus bottom management/switch layout means a new dedicated action requires an intentional later geometry/asset review; there is no free placeholder action to reuse silently.

Q08=B button in reactive Reply changes J2's intentionally narrow text-only contract; useful later but requires separate explicit extension. C convert “ข้อมูลของฉัน” changes a broad action's meaning; D multiple surfaces broadens first implementation and test/operational scope. Menu labels/visibility still grant no authority.

**Q09=A preserve “ข้อมูลของฉัน” ordinary Personal workspace URL unchanged.** Keep “ตรวจสอบนัดหมาย” narrow postback unchanged. No menu/action/catalog/layout/asset or Reply changes in 17J.3A.

## 18. Existing mutations / UI reuse decision

**Q06=A and Q10=B recommended:** thin LIFF entry/session/navigation shell, reuse existing responsive Appointment pages/controls. No duplicate read-only React UI, iframe, parallel projection or LIFF domain API. Owner must explicitly accept existing acknowledgement and request-cancel controls usable when the same authorized UI is reached through LIFF, including HN/names/location and care navigation described in §8. This is not approval of a new mutation, clinical behavior or LINE chat action.

Read-only LIFF UI alternative would reduce visible controls but not replace server authorization; duplication risks drift. If required later, choose bounded product restrictions explicitly. Preserve existing action source `PATIENT_SELF`; “LIFF” is transport/presentation, not a new delegated source or capability. Current web actions must remain available independently of LINE binding.

## 19. Back / close behavior

Recommend Q12: normal breadcrumbs/links work in all browsers; optional “กลับ LINE” / close affordance only in genuinely supported initialized LIFF context. SDK location matters: gateway supports close; appointment sibling pages do not have guaranteed SDK initialization under `/line/workflow`. First tranche can rely on LINE/browser native close and normal DEMI navigation after handoff; if adding an explicit close UI, return to bounded gateway to initialize/check environment rather than assuming SDK memory survived.

External browser and LINE in-app browser (`isInClient=false`) need valid ordinary navigation/account-management fallback. Back from detail/history/root follows existing UI; browser back after login may revisit entry or login because redirect contexts differ. Refresh must reauthorize; returning to stale entry reruns bounded resolution, not old token replay. Do not close automatically after acknowledgement/request or make business success depend on `closeWindow`. Device evidence must verify actual handoff, history and close behavior; no promise that an optional button can close every browser.

## 20. Privacy / URL-state contract

**J3-Q14 — CLOSED security recommendation for first-slice boundary; not broader deep-link approval.** Application-authored LIFF/login-return state contains only named workflow intent and bounded non-authoritative navigation-control data required by the platform. Unknown inputs remain untrusted.

Never include User/Person/Patient/Hospital IDs, first-slice relationship/appointment IDs, National ID, HN, full name, role/authority claim, LINE subject, clinical data, access/ID token, Supabase token/session in application URL/query/fragment/Rich Menu data/referrer. No tokens in telemetry, analytics, persisted workflow state or client storage. Raw LINE proof goes only in memory → HTTPS same-origin server body → provider verification; discard afterward.

Platform machinery may temporarily add credentials to the primary redirect URL (P02); this is not permission for DEMI-authored token parameters. Do not log complete entry URL, send early analytics, load unnecessary third-party resources or perform premature URL rewriting/redirect before init resolves. Preserve `liff.*` until SDK completes, then classify only approved intent through server allowlist; platform state/referrer is not a callback target. Later technical review must specify response/referrer/cache handling and sanitized failure logs, including hosting/proxy logs; client JS alone cannot control all leakage.

Normal authorized DEMI detail routes/form locators remain internal to that UI; no export into LINE permalink/share state. LIFF server rendering is not chat disclosure. Q14 must be reviewed again if owner later requests broader resource deep-linking.

## 21. Authentication threat model

Recommended future behavior, **not current runtime guarantees**. “Device” identifies evidence still needed in integrated UAT; server cases also need later automated verification. Each server business read/action continues current DEMI/domain reauthorization. Additional LINE-scoped checks require §13 lifetime contract; launch-only checks cannot satisfy the ongoing cases.

| Case | Identity evidence / what is not authority | Reauthorization point | Safe fallback | Device evidence |
| --- | --- | --- | --- | --- |
| Linked LINE, no DEMI session | Verified subject/binding may exist; LINE login ≠ DEMI credentials | Gateway after normal login: proof + ACTIVE binding + current actor equality + SELF | Normal login/bounded gateway return, no data before completion | Yes: iOS/Android and external cookies |
| Binding A, browser B | Two independently verified principals; binding/menu cannot replace B | Gateway before any Patient projection; subsequent LINE-scoped requests | Generic mismatch, explicit account management/logout/login; no A/B Patient data through entry | Yes: wrong-account correction |
| Inactive/suspended User | Provider session/binding may remain; ACTIVE eligibility absent | Actor resolver and persisted SELF / action access | Generic denial/account support; no session bootstrap or automatic unlink | Yes: stale displayed state |
| PATIENT removed | Session still identifies User; menu not role authority | Current actor and persisted SELF before read/action | Denial/bounded app fallback, no historical role reuse | Yes: open page then revoke |
| Unlink while open | Former proof/cleanup locator is not ACTIVE mapping | Future scoped-request binding check and re-entry; existing domain check independently | Generic account management; normal web still usable | Yes; lifetime mechanism not implemented |
| Copied LIFF URL outside LINE | Intent alone; fresh external LINE login can yield valid proof | Gateway in actual browser, both identity checks + domain policy | LINE login then DEMI login as needed, or deliberate ordinary web option | Yes: OS/app links/browser |
| Copied LIFF URL by another person | No sender principal carried; recipient proof/session only | Fresh gateway and target policy | Recipient's own authorized route or generic mismatch/denial | Yes: separate browser/account |
| Copied ordinary DEMI URL | DEMI session/domain scope only; no LINE claim | Existing target page/action | Normal login/deny/not-found; never display sender's resources | Yes for browser behavior; source authority exists |
| Stale page after account/role change | Cached/rendered screen not live authority | Next request/action with current actor and scoped consistency; restore refresh | Stop/revalidate stale presentation; generic denial, no cached replay as current | Yes: reload/restore/change |
| Multi-role presentation mismatch | Role chooser records UX intent only | Target resolves current PATIENT SELF independent of preference | Same SELF workflow or deny; no role parameter | Yes: Patient+OSM/Hospital |
| Tampered/unknown intent | Untrusted state; not a capability | Gateway server-owned finite allowlist | Generic bounded entry/error, no redirect reflection | Device optional; automated required |
| Arbitrary returnTo / open redirect | Relative/absolute client string not trusted | Login page, login action and gateway same allowlist | Safe internal fallback; never arbitrary external redirect | Device optional; automated required |
| Resource-ID injection | Locator never ownership; first entry accepts none | Entry parser rejects; internal detail/action validates exact ownership | Generic error/not-found, no foreign data | Device optional; automated required |
| Manipulated liff.state/referrer | Platform navigation carrier can be copied/modified | After init, server intent resolution; no state-derived authority | Reject extra destinations/locators, bounded retry | Yes: primary/secondary redirect |
| External browser cookies absent/blocked | LINE login not DEMI cookie; another browser may own session | Current request server actor after login/handoff | Login in actual browser; bounded error if cookie fails, no loop/token transfer | Yes |
| LIFF WebView cookie isolation | Same origin does not prove shared cookie jar | Gateway/login and target request check actual cookie-backed actor | Normal credential login and re-entry; never copy tokens from Safari/Chrome | Yes: both OS |
| Logout in another tab/device | UI and valid-looking claims may outlive change; local logout is not all devices | getUser/current actor on next business request; future scoped context invalidation | Login/deny when session invalid; independent other-device session may remain valid | Yes: actual session scopes |
| Session expiry during use | Old page/LINE token not fresh DEMI session | Read/action actor resolution; gateway on bounded re-login | Sanitized failure/login and fresh comparison; no replayed mutation | Yes |
| Back/refresh/BFCache | Restored page/memory not current account/binding evidence | Restore/re-entry refresh plus next read/action server checks | Revalidate or generic denial; no claim of erasing prior pixels | Yes; current pages lack LIFF lifecycle |
| Account switching | New actor invalidates old session-bound consistency; LINE login may also change | Fresh raw proof/binding + current session comparison; reject stale context | Explicit correction then restart; no merge/rebind | Yes |
| Provider outage / SDK missing | Client/URL/profile is not substitute for verified proof | Gateway must not mark LINE-scoped verification successful | Generic retry/account management; deliberate ordinary DEMI web entry remains separately authorized | Yes: failure UI; automated provider faults later |

No instant global revocation or cache erasure claim. A response authorized before unlink/role change may already be delivered; later contract must bound check-to-navigation/action races and freshness without holding DB transactions across LINE network verification. Existing domain transaction guards remain separate from LINE presentation state.

## 22. Real-device / UAT limits

Automated tests cannot prove LIFF/mobile browser cookie/session behavior. **No manual UAT executed in 17J.3A.** Eventual matrix must cover LINE iOS, LINE Android, external-browser fallback, existing DEMI session, no session, expiry, wrong DEMI account, LINE mismatch, link then open, unlink while open, back/reload/BFCache, close, copied LIFF and ordinary URL, and multi-role Patient. Include blocked cookies, browser handoff, provider/SDK failure, stale action/version, role revocation and explicit account switching.

Sequence remains **17J.3 implementation → 17J.4 (separate approved semantics) → 17J.5A integrated automated re-audit → 17J.5B real LINE/mobile/device UAT**. Recording this sequence neither starts Push nor closes its gates. Real device PASS cannot be inferred from mock SDK tests or platform documentation.

## 23. Owner decision table J3-Q01..Q14+

Every OPEN row below requires explicit owner decision; recommendations/preparation do not count as approval. Q13 preserves existing approved authority; Q14 records the requested first-slice security boundary only. Technical review of §13/§14/§20 remains required after product closeout.

| ID / question | Evidence | Alternatives | Recommendation | Trade-off | Security/privacy implication | Status |
| --- | --- | --- | --- | --- | --- | --- |
| J3-Q01 first workflow | E01/E08–11; J2-Q06 | A Appointment; B Personal; C Medication; D OSM; E Hospital; F Family; G bounded other | A Appointment list/detail | Focused value; still session work | Existing SELF only; no new domain authority | **OPEN / OWNER DECISION REQUIRED** |
| J3-Q02 LINE creates DEMI session? | ADR/E04/E06–07 | A NO; B bootstrap | A NO | Credential friction when cookies absent | B requires separate auth/security ADR review, recovery/revoke lifecycle | **OPEN / OWNER DECISION REQUIRED** |
| J3-Q03 no browser session | E02/E06–07 | A dead-end; B normal login+return; C close; D other | B | Extra login/handoff | Fail closed before data; no URL credentials | **OPEN / OWNER DECISION REQUIRED** |
| J3-Q04 return target | E03/E06; §7 | A arbitrary relative; B named intent; C signed arbitrary; D other | B `OPEN_PATIENT_APPOINTMENTS` server resolved | Finite extension per approved task | Reject arbitrary redirects/authority/state | **OPEN / OWNER DECISION REQUIRED** |
| J3-Q05 deep-link granularity | E08–09; P01 | A root; B relationship; C appointment detail | A root only | More UI clicks | No first-entry resource IDs/health locator in LINE state | **OPEN / OWNER DECISION REQUIRED** |
| J3-Q06 existing mutations in LIFF | E08/E10–11; §8 | A existing UI controls; B duplicate read-only; C other | A explicit acceptance of acknowledgement/request-cancel | Retains writes and wider existing navigation | Same server authority; no new mutation/LINE action | **OPEN / OWNER DECISION REQUIRED** |
| J3-Q07 app topology | E02–05; P04–06/P11–13; §16 | A Account multi-intent; B second classic same-Login LIFF; C new MINI App channel/same Provider; D ordinary web; E other | Genuinely open B vs C: vendor favors C for new apps; weigh established foundation/simplicity of B | B: app/config cost, no direct MINI migration; C: extra channel/internal lifecycle, one web app | Same Provider preserves subject namespace, not audience/auth authority; preserve Account app and explicit proof validation | **OPEN / OWNER DECISION REQUIRED** |
| J3-Q08 entry surface | E01/E03; J2 narrow Reply | A dedicated menu; B Reply button; C convert workspace; D multiple | A “ดูนัดหมายทั้งหมด”, four Patient variants | Later layout/assets work | Menu is UX; preserve J2 text-only/privacy boundary | **OPEN / OWNER DECISION REQUIRED** |
| J3-Q09 “ข้อมูลของฉัน” | E03/E12 | A preserve/add; B Personal LIFF; C Appointment; D remove | A preserve unchanged | Additional dedicated action | Do not repurpose broad ordinary web meaning | **OPEN / OWNER DECISION REQUIRED** |
| J3-Q10 presentation | E08–11; P02/P03 | A duplicate React; B shell+reuse; C iframe; D other | B | Existing UI breadth; lifetime integration review | One domain UI/policy; no iframe/new auth layer | **OPEN / OWNER DECISION REQUIRED** |
| J3-Q11 login-return lifecycle | E06–07; P02/P08–10 | A direct root; B gateway; C always `/app`; D other | B for LINE-origin login, then server-resolved root | Extra hop; no guarantee of window preservation | Fresh binding/session match after account login change; one allowlist | **OPEN / OWNER DECISION REQUIRED** |
| J3-Q12 back/close | E02/E08; P02/P03/P07 | Normal nav+optional supported close; auto-close; assume universal close | Normal navigation; optional gateway close; no auto-close | Destination may use native/browser close | No SDK promise on sibling route, external valid fallback | **OPEN / OWNER DECISION REQUIRED** |
| J3-Q13 multi-role | ADR/17J.0B/E09–11 | Same SELF; client role-switch authority (incompatible) | Same workflow, no role parameter | Menu may be stale | Current actor/SELF rechecked; presentationRole excluded | **CLOSED BY EXISTING ARCHITECTURE** |
| J3-Q14 URL/privacy | ADR/E03–04; P01–04 | Named intent/control only; resource/identity/token state (outside first slice) | Only named intent + bounded navigation control | No direct resource entry | No PII/clinical/role/token/LINE subject; state/referrer untrusted | **CLOSED security recommendation — first-slice boundary** |
| J3-Q15 binding/browser mismatch | E04/E06–07; §13 | Fail closed; silently switch/use A; show B through mismatched entry | Generic no-data mismatch; explicit account management/logout/login | Corrective login friction | No cross-account data/merge/auto-relink; security-critical | **OPEN / OWNER DECISION REQUIRED** |
| J3-Q16 ACTIVE consistency for LINE-launched workflow | ADR/E04/E09; §13/§21 | Require current proof/binding match; launch-only check; require LINE globally | Require current ACTIVE match for LINE-scoped flow; normal web independent | Needs scoped lifetime contract beyond entry redirect | Unlink/stale scope fail closed; no global LINE dependency | **OPEN / OWNER DECISION REQUIRED** |

Q15's unsafe alternatives are listed to clarify the boundary, not offered as implementation permission. Choosing an architecture-incompatible alternative requires separate explicit review; this documentation task does not reopen ADR-0009.

## 24. Recommended first tranche — not approved

```text
Patient opens DEMI LINE OA
  → eligible Patient Rich Menu “ดูนัดหมายทั้งหมด” (new dedicated URI if approved)
  → business entry per Q07 owner choice: classic LIFF (B) or MINI App (C)
    under the same DEMI Provider; existing Account LIFF stays unchanged
  → conceptual /line/workflow initializes LIFF before navigation
  → server allowlists OPEN_PATIENT_APPOINTMENTS and verifies raw LINE proof
  → resolve CURRENT ACTIVE binding
  → require current normal DEMI authenticated session
       absent → normal credential login → bounded gateway return
                → fresh initialization/proof and binding/session comparison
  → binding User == DEMI browser User, otherwise generic no-data mismatch
  → current canonical ActorContext / persisted PATIENT SELF authorization
  → internal /app/personal/appointments
  → existing Hospital chooser / history / detail / care links
  → existing 17D actions under existing domain services/policies
  → current LINE-scoped consistency on later requests per reviewed lifetime contract
  → normal app/back navigation; optional supported gateway return/close
```

Gateway responsibilities stay narrow: init, classify known intent, transient proof acquisition/body submission, server verification/current ACTIVE consistency/current authorization and internal target resolution. No resource fetch, Patient domain API, account/session creation, arbitrary callback, token persistence, conversation storage or decoded client profile authority. `/line/workflow` and config names are conceptual, **not files/endpoints created by this phase**.

## 25. Explicit non-goals

No runtime implementation or approval of LINE passwordless DEMI login, Supabase session minting from binding, account merge/reconciliation/transfer, identity-history erasure, arbitrary return URLs/resource deep links, resource IDs in menu/state, National ID/HN lookup, clinical URL/state, Family expansion, medication reminder/adherence, proactive appointment notification, P17D-NOTIF-01 semantics, Push API, notification preferences/consent/quiet hours, generic workflow router/chatbot/conversation state, native auth, offline sync, provider/app provisioning, deployment or real-device UAT. No new Patient mutation/duplicate Appointment UI/iframe. No new ADR in 17J.3A.

## 26. Unchanged gates

**P17D-NOTIF-01 — OPEN**; appointment event/timing/recipient/stale/cancel/content/privacy/reminder semantics, preferences/consent/quiet hours/proactive retry/Push remain separately gated. MED-02 remains requirement-gated, medication delivery timing and adherence unresolved/deferred; Follow-up has no accepted prospective reminder source. Family LINE access unapproved; **P17F-L04 OPEN, L05 OPEN / FUTURE, Q5 real-data GOVERNANCE BLOCKED**, minors/legal representation and parked **17E.2 consent** unchanged.

Exact LINE identity-history retention/erasure, future cross-account reconciliation and J2 receipt retention/purge remain unresolved production-readiness items. Dedicated Provider/channel/resource operations, deployment, actual production cookie attributes and real LINE/mobile UAT remain external evidence, not performed here. 17G.4A/17H.4A automated status and separate manual tracking remain unchanged; no prior owner decisions reopened.

## 27. Decision closeout prerequisites / validation

Owner closeout must explicitly record Q01–Q12 and Q15–Q16, including UI/control/data breadth and scoped consistency lifetime; preserve Q13/Q14 unless an explicit new architecture/privacy decision is requested. If Q02=B is requested, stop for separate authentication-security/ADR review before implementation. Recommended Q02=A preserves ADR-0009.

After owner approval, a separate technical contract must settle gateway init/secondary redirect, one authoritative named-intent/login allowlist, existing Family/account compatibility, scoped post-entry binding checks/invalidation/account switching, effective cookie/CSRF/cache/referrer behavior, exact request authorization/error semantics and proportional automated/UAT plan. No provider provisioning or runtime clearance is inferred from completing this pack.

Documentation validation: source evidence and official URLs reviewed; final diff restricted to this file and short CONTEXT addendum; relative Markdown file targets checked; UTF-8 without BOM for new pack, original CONTEXT BOM/line endings preserved; no replacement characters/mojibake; decision statuses checked; `git diff --check` executed. No runtime/auth/Prisma/menu/env/provider changes. Unit/integration/migration tests, build and dev server **NOT RUN**, as required for this documentation-only phase. Real-device evidence **NOT EXECUTED**.

## 28. Next step / final disposition

**Phase 17J.2 — CLOSED / IMPLEMENTED / AUTOMATED VERIFICATION COMPLETE**.
**Phase 17J.3A — DECISION PACK COMPLETE / OWNER DECISIONS REQUIRED**.
**Phase 17J.3 runtime — NOT IMPLEMENTED**.
**Phase 17J.4 — NOT STARTED**.

Exact next step: **Review Phase 17J.3A owner decision pack.** Stop here; do not begin Phase 17J.3 implementation.
