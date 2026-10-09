# Phase 17J.3D-UAT.1 — Activation readiness preflight

Date: 2026-10-09. Repository: bait0ngxaxa/demi. Baseline/current source HEAD: **53e0d0fa36254b3181b5e077d59e177f957f3e6d**, branch **main**, initially clean. The preflight changed documentation only. This handoff snapshot preceded the owner's subsequent authorization to commit and push; Git delivery does not activate runtime gates or authorize UAT execution.

**CONDITIONAL GO — OPERATOR ACTION REQUIRED. Real-provider UAT must not begin yet.** Source and focused mocked tests support preparing UAT. An isolated deployed target, Console mapping/ownership, MINI inventory, target migration, current Auth policies, egress privacy and permitted test identities are not fully verified. No confirmed authentication/Recovery bypass was found in the reviewed paths; this is a bounded review, not a repository-wide security certification.

17J.3B remains technical contract complete; 17J.3C remains lifecycle foundation implemented; 17J.3D remains Account orchestration implemented / activation staged. UAT.1 is assessment/preparation only. Production readiness and MINI runtime acceptance are not claimed.

## 1. Scope, methodology and evidence

Read AGENTS.md, [CONTEXT](../CONTEXT.md), [17J.3B contract](./PHASE_17J3B_MINI_APP_WORKFLOW_TECHNICAL_CONTRACT.md), [17J.3C foundation](./PHASE_17J3C_FULL_LINE_DISCONNECTION_LIFECYCLE_FOUNDATION_IMPLEMENTATION.md), [17J.3D handoff](./PHASE_17J3D_ACCOUNT_FULL_DISCONNECTION_RECOVERY_IMPLEMENTATION.md), [17J.3A owner closeout](./PHASE_17J3A_LIFF_WORKFLOW_SESSION_DECISION_CLOSEOUT.md) and [ADR-0009](../adr/0009-demi-line-oa-liff-identity-and-messaging.md). Traced Account routes, services, adapters, lifecycle/schema/migration, Auth SSR/proxy, UI and corresponding tests. Inspected package scripts, integration harness, environment templates, ignored local configuration presence and deployment evidence.

Evidence classifications:

- VERIFIED: directly observed in this task; source verification does not imply deployed verification.
- DOCUMENTED: previous evidence or described configuration, not independently re-established here.
- MISSING: required artifact/configuration absent in the inspected surface.
- BLOCKED: access, approval or operator attestation still required.
- NOT APPLICABLE: explicit scope/evidence excludes the item, not inferred from missing configuration.

Local private values are represented by references: EWEB-01 = configured DEMI_LINE_PUBLIC_ORIGIN; EAUTH-01 = configured Supabase project matched to connector project Demi-dev; ELINE-01 = configured Account channel/LIFF identifiers. No actual IDs, URLs from private configuration, secrets, tokens, subjects or Patient data are reproduced. Operators resolve these references in their private configuration and consoles.

| Evidence | Observation | Classification / limit |
| --- | --- | --- |
| E01 | Git HEAD/branch/status above | VERIFIED local source; remote/deployed SHA not attested |
| E02 | Local .env gates both false, manifest empty, Login secret nonempty; existing channel/LIFF identifiers syntactically valid | VERIFIED local presence only; secret value not displayed or validated; deployed env unknown |
| E03 | DATABASE_URL, DIRECT_URL and Supabase Auth URL map to the same Demi-dev project reference | VERIFIED configuration pairing only, not database access or synthetic-data certification |
| E04 | Supabase connector lists one accessible project, Demi-dev, ACTIVE_HEALTHY, ap-southeast-1, Postgres 17 metadata | VERIFIED accessible project metadata; not proof no other projects/deployments exist |
| E05 | EWEB-01 HTTPS HEAD: 307, same-origin /login, Server Vercel, x-vercel-id present, private/no-store | VERIFIED unauthenticated reachability from this workstation; no deployed SHA, device, tenant/data or backend mapping verification |
| E06 | Demi-dev GET /auth/v1/health: without API key 401; with existing public API key 200, GoTrue v2.197.0 | VERIFIED reported health/version, no user session created; hosted build equivalence not established |
| E07 | npm run test:db:status exits 0, no containers listed | VERIFIED no running repository disposable integration DB |
| E08 | Focused mocked/source tests 36 files / 314 tests PASS; typecheck/lint PASS | VERIFIED automated source checks only |
| E09 | No tracked .github deployment workflows or Vercel project binding; no local .vercel binding found | VERIFIED inspected repository surface; external Vercel ownership/configuration BLOCKED |

Read-only network requests were unauthenticated HEAD to the configured application origin (no redirect following) and Auth health GET. The latter used the existing public API key in a header, never a JWT or privileged key. No LINE API was invoked, no console changed, and no database connection/query was made.

## 2. Environment readiness matrix

| Environment | Runtime / base URL evidence | DB / Auth isolation | LINE / LIFF mapping | Data / ownership / mobile | Readiness |
| --- | --- | --- | --- | --- | --- |
| Local development | VERIFIED source/dependencies; Next 16.3.0, Node 24.20.0; no dev server started | VERIFIED local config points to hosted Demi-dev, not a separate local DB | ELINE-01 present; Console association BLOCKED | Current data synthetic status BLOCKED; local machine alone is not mobile HTTPS deployment | Source tests ready; not approved real-provider target |
| Integration | VERIFIED compose.integration.yaml: postgres:17-alpine, loopback, tmpfs; .env.integration DB URLs loopback and separate from Demi-dev | Dedicated synthetic demi_test harness DOCUMENTED; container absent E07 | Synthetic test fixtures; no actual LINE mapping | NOT APPLICABLE for live provider/device UAT; no infrastructure started | Integration execution NOT RUN |
| Supabase Demi-dev | VERIFIED connector healthy project + Auth v2.197.0 health E04/E06; Supabase hosts DB/Auth, not DEMI frontend | Local URL pairing VERIFIED; prior disposable Auth A/B usage DOCUMENTED; current full data isolation/policies BLOCKED | Console mapping BLOCKED | Prior owner confirmation of nonproduction disposable Auth test scope preserved; does not certify all present Patient records | Candidate backend; not selected/approved UAT target |
| Existing public origin EWEB-01 | VERIFIED Vercel HTTPS HEAD 307 /login | Deployed DB/project/env not visible; BLOCKED | LIFF Endpoint/callback equality BLOCKED | Owner/access, deployed SHA, synthetic-only data and mobile reachability BLOCKED | Available endpoint, business environment classification UNKNOWN/BLOCKED |
| Separate staging/UAT | No separate tracked deployment definition or verified separate origin | MISSING verified isolation evidence | MISSING reviewed mapping | BLOCKED operator selection | Do not assume it exists; prepare/select only with separate approval |
| Production | README describes environment-supplied production credentials: DOCUMENTED | No positively identified production project/target | BLOCKED | No production resources queried | Metadata identification incomplete; no mutation/testing allowed |

EWEB-01 responding does not establish it runs 53e0d0f or points to Demi-dev. Vercel headers identify the serving edge, not project ownership or exact backend runtime settings. No claim that production is absent. If EWEB-01 shares real users/data/channel grants, it is unsuitable until a safe isolated target and permitted population are established.

## 3. LINE channel inventory findings

| Property | Expected source | Verified value or redacted reference | Status | Operator action |
| --- | --- | --- | --- | --- |
| Provider | LINE Developers Console Provider settings/roles | Intended shared DEMI Provider in ADR; no Console evidence | DOCUMENTED / BLOCKED | Verify Account and applicable MINI under intended Provider; retain private evidence |
| Account Channel | LINE Console Basic settings | ELINE-01 local channel ID has valid numeric syntax | VERIFIED config / BLOCKED mapping | Compare actual Login channel, owner and deployed channel ID |
| Account LIFF | Account channel LIFF tab | ELINE-01 local LIFF ID has valid syntax | VERIFIED config / BLOCKED mapping | Match LIFF to Account channel; do not derive channel ID from LIFF prefix |
| LIFF Endpoint | LIFF application detail | Not inspected | BLOCKED | Confirm exact intended HTTPS endpoint /line/account and UAT origin |
| Callback/redirect | LINE Login settings and LIFF SDK flow | App uses fixed origin /line/account; recovery adds non-authoritative recovery=1 | VERIFIED source / BLOCKED Console | Inspect configured redirects applicable to this SDK flow; no arbitrary return URL |
| Scopes | LIFF detail/consent settings | Source requires openid; existing friendship refresh requires profile | VERIFIED source / BLOCKED Console | Confirm scopes and test-user permissions; no unnecessary email/MINI consent |
| Account secret | Server secret store / Login channel | Local variable nonempty, value not examined | VERIFIED presence / BLOCKED correctness | Confirm belongs to this Login channel and is supplied only server-side |
| MINI Developing | MINI Console internal-channel detail | No reviewed tuple found in active manifest (empty) | MISSING / BLOCKED | Inspect actual Console; record tuple or reviewed non-provisioning evidence |
| MINI Review | MINI Console internal-channel detail | Unknown | BLOCKED | Inspect independently; do not reuse Developing credentials |
| MINI Published | MINI Console internal-channel detail | Unknown | BLOCKED | Inspect independently; no published mutation/test assumed |
| Deployment Mapping | DEMI deployment config + Console | EWEB-01 reachable; deployed inventory not inspected | BLOCKED | Match exact deployed origin, channel, LIFF, tier and SHA |
| Ownership/test permission | Provider/channel roles and owner approval | No current LINE permission evidence | BLOCKED | Authorize exact channel and two disposable LINE identities |

Absence of MINI code/env is not an exclusion. Account and MINI grant records remain separate; known applicable MINI obligations remain unconfirmed because MINI remote adapter/workflow is NOT IMPLEMENTED. Recovery may release them with reviewed decision/identity, without pretending Account 204 removed MINI permission. Never open a never-used MINI App to prove absence.

## 4. Configuration and fail-closed boundaries

See [configuration validator](../../src/modules/line/services/line-disconnection-configuration.ts), [inventory schema](../../src/modules/line/domain/line-authorization-lifecycle.ts) and [server env](../../src/lib/env/server.ts). The schema-valid synthetic example and field derivation are in the [Thai operator guide](./PHASE_17J3D_UAT_OPERATOR_SETUP_GUIDE.md).

| Setting | Required / visibility | Local observation | Agreement / effect |
| --- | --- | --- | --- |
| DEMI_LINE_DISCONNECTION_ENABLED | Server-only; true/false; absent defaults staged | false | Only literal true enables bundle; invalid enabled config fails closed |
| DEMI_LINE_DISCONNECTION_MANIFEST | Server-only JSON; required when enabled | EMPTY | Exactly one Account, up to eight tuples; required references/app names; MINI exclusion if no MINI |
| DEMI_LINE_PROVIDER_TOKEN_VERIFY_QUERY_ENABLED | Server-only; only true permits new adapter query | false | Controls termination verifier only; does not gate legacy friendship query |
| DEMI_LINE_LOGIN_CHANNEL_SECRET | Server-only secret; required for actual remote dispatch, not Recovery/local authority | SET, correctness unverified | Login secret only; adapter validates syntax/transient credential response; no Messaging substitution |
| DEMI_LINE_LOGIN_CHANNEL_ID | Server-owned non-secret channel selector, mandatory Account config | SET, syntax verified | Must equal manifest Account channel; caller cannot choose |
| NEXT_PUBLIC_DEMI_LINE_LIFF_ID | Public non-secret; required for LIFF proof handoff | SET, syntax verified | Exact manifest accountLiffId equality; must independently match Console |
| DEMI_LINE_PUBLIC_ORIGIN | Server-owned non-secret, used as public fixed redirect/Origin | SET, canonical HTTPS verified | Exact trusted Origin, Console endpoint and deployed origin must agree |

Manifest references use 1–128 ASCII characters matching [A-Za-z0-9._:/-]. They are operator attestations, not code-verified evidence of UAT/privacy completion. appNames keys are lowercase SHA-256 of JSON.stringify([providerReference, kind, channelId, environment, deploymentReference]); current configured tuples require labels. Historical tuple rows survive revisions. The validator verifies Account deploymentReference against the top-level value, not actual external deployment identity. MINI tuple deployment mappings require operator review.

Enabled readiness additionally queries Prisma's _prisma_migrations for finished/not-rolled-back 20261008120000_line_authorization_lifecycle. This is a marker check, not schema-drift/trigger/grant inspection. Gates were not changed. Once pending history exists, disabling configuration does not waive Relink fences and makes Recovery endpoints unavailable: maintain a recoverable reviewed manifest/deployment.

## 5. Migration assessment

Reviewed [migration 41](../../prisma/migrations/20261008120000_line_authorization_lifecycle/migration.sql) and [Prisma models](../../prisma/schema.prisma). It follows Account linking (20261006120000) and reactive receipt (20261007120000), relying on existing User/Binding/Intent/Audit tables. Adds enums, RECOVERY action, nullable intent selectors and lifecycle table; no destructive backfill or fabricated success. Existing LINK/UNLINK rows satisfy action-specific checks. Cast of the newly added enum to text avoids same-transaction enum-use restriction.

RESTRICT binding/audit/target FKs, unique binding-generation-tuple and attempt ID, paired attempt/release fields, positive generation, canonical tuple/hash checks, confirmed-204 settlement and timestamp constraints preserve evidence. The invoker trigger forbids identity/attempt reuse, settled-outcome rewriting, release provenance changes and new dispatch on old/released generations. Late outcome is intentionally historical. RLS is enabled without Data API policy; function PUBLIC execute is revoked. Actual target grants/RLS and schema drift remain unverified.

17J.3C documents empty/populated PostgreSQL 17 compatibility (previous 40 migrations + synthetic legacy rows → migration 41); 17J.3D documents all 41 applied on disposable DB plus 90 integration tests. These are DOCUMENTED historical test evidence, not target readiness.

**TARGET UAT MIGRATION STATE — NOT VERIFIED.** No target UAT DB was selected with approved read-only credentials. No database queries/tests/migrations were executed. The local .env points to hosted Demi-dev, not the absent integration container; do not run tests against it.

The disabled flag does not remove schema dependency: LINK routes always enable durable-history guards, and requireRelinkEligibility queries the lifecycle table even without inventory. Deploying this source on a DB missing migration 41 may break Account linking despite gates false. Verify schema before using this build, rather than treating false as migration compatibility.

Rollback is operationally constrained: older code/disabled config is not a safe way to serve pending users; additive columns/table must remain. Dropping lifecycle/intent evidence or clearing pending rows is forbidden. Preserve audit/release/history and restore a known compatible source/config. Retention duration remains prior governance scope. The [guide](./PHASE_17J3D_UAT_OPERATOR_SETUP_GUIDE.md) separates exact read-only SQL/commands from later migration/deployment actions.

## 6. Auth/session security

[Auth authority](../../src/modules/auth/services/exact-session-service.ts) captures one SSR JWT (getSession supplies transport only), then calls getClaims(jwt) and getUser(jwt) using that exact token. Requires verified UUID sub/session_id, project issuer + authenticated audience, expiry before/after provider work, matching provider User and ACTIVE canonical User. Ten-second request budget; no positive liveness cache. Denial/outage fails closed with safe errors.

[SSR client](../../src/lib/auth/supabase-server.ts) blocks /token refresh in this sensitive attempt; [proxy](../../src/lib/auth/supabase-proxy.ts) skips ordinary refresh for exact Recovery endpoints and marks Account responses private/no-store. Cookie writes are required in Recovery routes; normal Auth/Family paths retain existing behavior. Recovery checks exact-session hash before/after LINE work and transactionally at release; fresh LINE verification and Auth calls finish outside DB locks. No Patient capability/session/binding is created by release.

Installed SDK/SSR remain 2.112.3/0.12.4; current reported Auth v2.197.0 matches B17J3-03. Preserve its documented same-token revocation/replay, new-session distinction and natural expiry tests; do not repeat the hour-long experiment. Prior policies: time-box=0/never, inactivity=0/never, single-session disabled, JWT expiry=3600 seconds, refresh reuse=10 seconds. **Current policies are not reverified.** Name/version matching alone cannot attest policy/build equality. Owner must compare Dashboard settings; a material change requires focused policy validation before UAT.

Official [getUser](https://supabase.com/docs/reference/javascript/auth-getuser) documents provider-backed user retrieval; [session guidance](https://supabase.com/docs/guides/auth/sessions) distinguishes refresh enforcement/cleanup from nominal timeout. /user is not a newly claimed immediate inactivity/time-box deadline oracle. Browser/device UAT must check actual cookie options/propagation, origin isolation, expiry near refresh, logout, sessionStorage handoff and safe new-intent recovery. [SSR guidance](https://supabase.com/docs/guides/auth/server-side/advanced-guide) informs cookie/cache review; do not weaken policies or adopt client-decoded JWT authority.

## 7. Provider privacy and egress gate

Account adapter matches the official [LINE Login deauthorization contract](https://developers.line.biz/en/reference/line-login/#deauthorize): channel-authorized bearer credential and target userAccessToken; only 204 is confirmed. [Stateless credential issuance](https://developers.line.biz/en/reference/messaging-api/nojs/#issue-stateless-channel-access-token) uses channel ID/secret transiently. Verification checks fixed audience, expiry, openid and supported userinfo subject before dispatch; shared ten-second budget, redirects rejected and no retry. No live credential validity/provider behavior was tested.

| Outbound path | Observation | Status |
| --- | --- | --- |
| App → native fetch | New adapter catches without raw payload/URL logging; no token persistence, no-store and redirect:error | VERIFIED source; mocked tests |
| Existing friendship verifier | line-login-client.ts:84 sends access_token query without new gate; called by link and reachability refresh | VERIFIED control scope limitation, not demonstrated leak |
| Next/Node runtime | Local next.config has no explicit fetch URL logging/APM setup; selected local proxy/APM env names absent | VERIFIED local surface only; defaults/instrumentation outside inspected source not certified |
| Vercel runtime/APM/error reporting | EWEB-01 serves via Vercel; project settings/log drains/instrumentation inaccessible in this task | BLOCKED / redaction UNVERIFIED |
| Proxy/tunnel/egress/TLS tracing | Local configured origin is not a recognized temporary tunnel; outbound infrastructure path unknown | BLOCKED / redaction UNVERIFIED |
| Browser/analytics/CI artifacts | New tokens sent in POST body, intent-only sessionStorage; no tracked CI deployment/log controls | VERIFIED source minimization; actual capture/export settings BLOCKED |

**Overall token egress privacy: UNVERIFIED, UAT entry blocker.** HTTPS does not establish safe logging at TLS termination/APM. Disabled new gate is not assurance that ordinary Account linking sends no query token. Review/redact the common endpoint for BOTH adapter and legacy friendship calls before any token-bearing UAT. Use a non-secret synthetic canary against a controlled non-LINE sink in a separately authorized diagnostic environment; inspect every log layer without sending real tokens or enabling the LINE gate. Do not attach raw HAR, cookies, Authorization headers, provider bodies or query strings. Full checklist is in the guide.

No raw-token logging or actual disclosure was demonstrated in reviewed first-party paths. Do not label inaccessible infrastructure PASS. The narrowly approved verification exception remains limited to official server-to-LINE HTTPS; current task explicitly forbids enabling it.

## 8. Activation path trace and degraded behavior

| Path | Actual boundaries reviewed |
| --- | --- |
| LINK | Exact Origin/body/schema → normal session → controlled LINK intent, ACTIVE User and historical eligibility under User/ordered Binding locks → fixed-channel proof outside transaction → final User/Intent/Binding/rows revalidation before ALREADY_LINKED and link/relink completion; retained different-owner conflicts stay denied |
| UNLINK | Thai confirmation → normal owner session + single-use intent → Serializable local revoke/version/lifecycle/intent/audit commit → reserve historical Account attempt → recheck release/generation → optional provider request outside locks → exact-attempt result → truthful status; menu cleanup independent |
| RECOVERY | Exact Origin/strict body → reviewed readiness → uncached exact live session → server-selected revoked binding + five-minute challenge/set digest → app review/risk → verified Account proof/fingerprint and another exact live check outside locks → User/Intent/Binding/ordered rows revalidation → immutable release audit/intent consume; separate normal Relink required |

| Failure condition | Local unlink / status | Recovery / Relink | Operational response |
| --- | --- | --- | --- |
| Gates false, no earlier pending | Legacy local unlink, no new orchestration | Legacy history not stranded; Recovery unavailable | Keep staged; never describe as verified Full Disconnection |
| Enabled invalid/missing manifest or failed readiness | UNLINK intent/endpoint catch readiness and allow local service; fresh rows absent until lazy repair | Link and Recovery fail closed | Restore reviewed configuration/migration; retain history |
| Missing migration | Enabled readiness fails; legacy local endpoint may work if prior schema exists | New Link guard table dependency may fail even disabled | Confirm/apply only in later separately authorized target work |
| Missing Login secret or query gate false | Commit persists; remote unconfirmed/no deauthorize | Recovery still works with Account ID proof and healthy manifest/Auth/LIFF | Restore secret only if needed for future dispatch; do not retry old attempt |
| Provider outage / missing or invalid historical token | Local revocation commits; unconfirmed status | Ordinary timeout supports Recovery; current LINE/Auth proof outage denies | Retry explicit Recovery after current provider availability, no old dispatch retry |
| Legacy revoked binding without rows/raw cleanup locator | Enabled status blocks ordinary Relink | Preparation lazily creates UNKNOWN obligations; fresh fingerprint proof supports release | No historical access token needed |
| Existing pending and config later disabled/lost | History preserved; status/Recovery UI unavailable or omitted | Durable pending Relink guard remains; no Recovery until restored | Operator restore known reviewed bundle; flag-off is not rollback |
| LIFF inaccessible / current LINE identity unavailable | Normal DEMI login independent | No safe Recovery bypass; cannot obtain required current proof | Restore correct LIFF/origin/provider access; never switch accounts/force-clear |
| Unknown MINI | Independent unknown/unconfirmed rows | Reviewed bounded Recovery covers set; no MINI consent required | Record actual tuples/exclusions; no Account-token MINI confirmation |

Confirmed availability limitation: app/line/account/page.tsx calls readiness before summary in one try; enabled configuration failure returns UNAVAILABLE with canUnlink:false although UNLINK APIs tolerate that failure. This can hide the ordinary user's local unlink button. Recommended minimal follow-up, if separately requested: load owner summary/local unlink availability independently and show an honest configuration/Recovery unavailable state. No runtime patch made here. Until resolved, an operational restore procedure is required; do not claim API fallback equals resilient user-facing unlink.

Critical question answer: **credentials alone can be unavailable without blocking Recovery; inventory/configuration/Auth/LIFF cannot.** Existing pending users need an operator-maintained known-good reviewed manifest, compatible migration/source, stable Account LIFF/origin and exact-session provider access. Restore these, let users prepare new intents if revision/session changed, then follow ordinary identity-verified release. Never delete rows, rewrite outcomes, reuse attempt slots or bypass guards.

Late A after Recovery/new B remains accepted provider-side reconnection disruption. Source/previous PostgreSQL tests fence A to historical outcome, preserve release audit and B generation, and cannot mint Patient authority. Do not manufacture undocumented provider races on real grants.

## 9. Risk register

| ID / class | Severity | Component / confirmed evidence | Consequence | Mitigation / owner | UAT/release blocking | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| UAT-E01 environment evidence | HIGH | EWEB-01 reachable, no SHA/data/backend isolation attestation | Real-user data/grant exposure possible | Select synthetic isolated target; owner + platform | Blocks real UAT and activation | Deployed SHA/project/env attestation and synthetic-population review |
| UAT-E02 operator inventory | HIGH | Manifest empty, Console not inspected | Wrong channel/audience or false MINI exclusion | Inventory/roles/endpoints/exclusions; LINE owner | Blocks real UAT and activation | Private Console evidence vs server/public configuration |
| UAT-E03 DB evidence | HIGH | Target not selected/read-only verified; guard requires lifecycle table | Relink/readiness failure or missing integrity fences | Read-only migration/schema/grants review; DBA | Blocks use of UAT source/activation | Guide SQL plus actual migration checksum/catalog evidence |
| UAT-P01 privacy evidence | HIGH | Runtime/egress redaction inaccessible | Query/header/body credential leakage possible | End-to-end redaction review; platform/security | Blocks token-bearing UAT and activation | Controlled synthetic canary + approved log/config review |
| UAT-S01 source control scope | MEDIUM | line-login-client.ts:84 query not behind new gate; link/reachability invoke it | Mistaken belief false disables all query token egress | Document scope; include legacy in P01; if whole-app opt-in is required, minimal shared guard in separate task; backend/security | Blocks UAT until P01 covers legacy; no leak proven | Source trace and sanitized transport test |
| UAT-S02 source availability | MEDIUM | Original defect: page.tsx read readiness before Account Summary and one catch replaced a valid summary with UNAVAILABLE/canUnlink:false | Configuration/migration or reconciliation failure hid local Unlink; missing lifecycle status could show Relink | **FIXED in source by 17J.3D-UAT.1A:** load Account Summary independently, isolate readiness/status and reconciliation, record a sanitized fallback marker in the existing Unlink audit when readiness fails, inspect durable lifecycle/audit history, and keep server Relink guards active when the gate is disabled; backend/platform | Source regression closed; real UAT remains blocked by the independent environment, inventory and S01 privacy gates. Recovery/status require restored reviewed configuration and migration | Page composition + client rendered-state + lifecycle probe/Link guard tests; see exact run below; no device/provider evidence |
| UAT-E04 Auth policy evidence | HIGH | Health matches v2.197.0; current policies not inspected | Liveness semantics may differ from prior tested policy | Compare exact policy/build; Auth owner | Blocks exact-session UAT acceptance | Dashboard attestation; targeted changed-policy tests only if material difference |
| UAT-O01 operational continuity | HIGH | Pending survives flag-off; Recovery requires enabled config | Prolonged self-service loss on bad rollback | Named restore owner, backup manifest/secrets and recovery runbook; platform | Blocks activation/UAT rollout plan acceptance | Controlled isolated config-loss/restore drill |
| UAT-E05 test population/device | HIGH | Current permitted LINE A/B and device sessions not established | Real accounts affected; missing browser evidence | Owner-approved disposable identities, synthetic records, device matrix; owner/QA | Blocks real UAT | Account aliases/permission record and scheduled devices |
| UAT-L01 provider behavior | MEDIUM | Adapter documented/mocked, no live204 evidence | Actual channel credentials/API capability may differ | One controlled disposable happy path; LINE owner/QA | Required UAT evidence before activation | Sanitized status/correlation + witnessed permission removal |
| UAT-A01 accepted availability | LOW | Old submitted request may affect new remote grant | Temporary explicit reconnect required | Existing warning/fresh proof/ordinary login; owner accepts unchanged | Not a new architecture blocker | Controlled mock race + reconnect failure UX; no real race manufacture |
| UAT-T01 historical test limitation | LOW | Prior broad suite four failures; focused strict-schema test now passes | No full-green repository baseline claim | Retain original failures/resource classification; QA | Not demonstrated new blocker; broad green NOT VERIFIED | Targeted current checks; separate justified broad run later |

No CRITICAL or confirmed privilege/identity bypass was found in the bounded review. S01 remains an unresolved token-egress scope and infrastructure-verification gate; no leak is proven. S02 was a confirmed availability defect and is fixed in source by 17J.3D-UAT.1A as described above. Environmental unknowns are not reclassified as demonstrated vulnerabilities. The focused patch does not activate Full Disconnection or make a missing manifest, lifecycle migration, or provider credential harmless. Accepted late-provider availability risk does not waive privacy or Auth entry gates.

## 10. Verification executed and limitations

Windows PowerShell, local dependencies: Node 24.20.0, Next 16.3.0, Supabase JS 2.112.3, SSR 0.12.4, Prisma client 6.19.3, LIFF 2.31.1, Vitest 4.1.10. Unit files use synthetic provider/session/database mocks; integration files are excluded by the unit Vitest config.

Executed:

~~~powershell
npm run test -- src/modules/line src/modules/auth/services/exact-session-service.test.ts src/modules/auth/services/authentication-service.test.ts src/modules/auth/services/password-login-identity-service.test.ts src/modules/auth/schemas/login-schema.test.ts src/modules/auth/transport/server-actions.test.ts src/lib/auth/supabase-server.test.ts src/lib/auth/supabase-proxy.test.ts src/modules/patient-self/policies/patient-self-policy.test.ts app/api/line/account app/line/account/line-account-client.test.tsx app/line/account/line-friendship-refresh.test.tsx app/line/account/line-recovery-panel.test.tsx app/line/account/line-recovery-flow.test.tsx
npm run typecheck
npm run lint -- --max-warnings 0
npm run test:db:status
git diff --check
~~~

Results: focused **36 files / 314 PASS** (5.47s Vitest duration); typecheck **PASS**; lint **PASS**, zero warnings; DB status **PASS / no container**, not integration evidence; final documentation diff check PASS; 149 local Markdown link targets PASS; four documents UTF-8/no BOM/no replacement characters PASS; synthetic manifest validated against the actual Zod schema and tuple key PASS with isolated imports, no env/DB/provider calls. No architecture:check/lint:strict scripts exist. An attempted Patient-import follow-up used a nonexistent src/modules/patient-roster-baseline-import/services/patient-roster-baseline-import-service.test.ts path: **no files found, exit 1**, no tests executed. No production change followed; Patient-import historical timeout disposition is not claimed resolved by this task.

Historical 17J.3D broad run: 2,350 passed / four failed; one strict-schema expectation subsequently updated and targeted checks passed (current suite covers it). Three unchanged Patient-import load-sensitive timeouts passed twice in historical isolated testing. Full suite remains **NOT VERIFIED GREEN**; not repeated here. Historical PostgreSQL **34 orchestration + 30 foundation + 26 Account = 90 PASS** is DOCUMENTED, not rerun.

### 17J.3D-UAT.1A — S02 regression evidence

The original page-level catch conflated Account Summary, lifecycle readiness/status and Rich Menu reconciliation. The page now loads the authenticated Account Summary first; readiness/status and reconciliation have independent failure boundaries. A readiness failure leaves a successfully loaded active binding and its local Unlink action intact, while the Thai UI says remote LINE permission removal is unavailable or unconfirmed. Summary failure still returns the unauthenticated/unavailable view without binding details. Reconciliation failure does not replace the summary.

When the rollout gate is disabled, the page presents the normal staged Link/Relink path only after the server verifies that the owner has no durable lifecycle history or failed-readiness local-Unlink marker. If history exists or the lifecycle table cannot be read, Relink stays hidden and Recovery is not presented as operational. A local Unlink committed after readiness failed records a sanitized marker in the existing immutable `line.account.unlinked` audit row, in the same transaction; Link-intent and final transaction guards honor this marker after the feature flag is disabled. A revoked historical generation remains fenced. Never-activated legacy bindings with no lifecycle rows or marker keep their established path. Restoring readiness returns the server-derived status, including the distinction between `REMOTE_CONFIRMED` and `RECOVERY_RELEASED_UNVERIFIED`. No lifecycle evidence is deleted or rewritten.

The successful local Unlink fallback still depends on the deployed Account tables and columns used by the existing intent and binding transaction. This patch does not make an unapplied migration harmless: the lifecycle probe reports unknown when it cannot inspect required history; Relink remains unavailable, and the operator must restore the reviewed manifest and migration before status/Recovery can resume. S01 token-egress review remains a real-provider UAT blocker.

Executed after the focused source changes:

~~~powershell
npm run test -- app/line/account app/api/line/account src/modules/line/services/line-account-service.test.ts src/modules/line/services/line-disconnection-configuration.test.ts src/modules/line/services/line-authorization-lifecycle-service.test.ts src/modules/line/services/line-disconnection-history.test.ts
npm run typecheck
npm run lint -- --max-warnings 0
~~~

Results: **12 files / 105 tests PASS** (Vitest 2.16s); typecheck **PASS**; lint **PASS**, zero warnings. Impeccable detector for the two changed UI source files returned `[]`. PostgreSQL integration, device/browser fault drill, LINE provider testing, and live recovery/permission removal were **NOT RUN**; there is no approved disposable PostgreSQL target in this task context. These checks support the source-level S02 fix only and do not change the preflight UAT verdict or authorize provider testing.

PostgreSQL integration **NOT RUN**: container absent, current harness test/test:focused runs migrate deploy and test fixtures mutate data, both forbidden here. Target DB migration/catalog reads **NOT RUN** without selected approved read-only target. Production build/dev server, provider token verification/deauthorization, Console modification, disposable Auth session experiment, browser/device UAT, deployment, provisioning and activation **NOT RUN**.

## 11. UAT entry gates and verdict

All must have dated private evidence and a named responsible owner before real token-bearing execution:

1. Approved isolated HTTPS UAT target, deployed SHA, DB/Auth pairing and synthetic-only permitted population.
2. Reviewed Account Provider/channel/LIFF/scopes/ownership/endpoint; MINI tuples or justified reviewed exclusions.
3. Actual target migration, constraints/trigger/RLS/grants checked read-only; no staged-flag compatibility assumption.
4. Current exact-session policies equal prior tested configuration or material changes validated; cookie/return checks scheduled.
5. Runtime/proxy/APM/egress/browser/CI privacy controls cover ALL query token paths, including legacy friendship; no raw capture export.
6. Manifest derived from real reviewed sources, secret correctness/secure server storage, Recovery availability/rollback restoration plan.
7. Disposable DEMI/LINE accounts, synthetic Patient fixtures, operator permissions and Android/iOS/external-browser slots.
8. Explicit next-phase approval defining gate changes, test identities, provider mutations, deployment/migration actions if needed and stop conditions.

For first UAT, recoveryUatEvidence must reference an honest completed prerequisite record (mocked/automated Recovery evidence + reviewed executable test plan and UAT-only scope); it must not pretend real-device/provider UAT is already complete. Operator/security review must decide whether that prerequisite record satisfies activation policy for an isolated test target. If policy requires completed device results before any UAT gate change, source alone cannot satisfy that circular dependency: keep staged and resolve the evidence interpretation explicitly, never invent a PASS reference.

**Verdict: CONDITIONAL GO for operator readiness preparation; NOT authorized/ready to start real-provider UAT today.** Missing evidence is potentially resolvable; no evidence establishes a production-only/wrong-owner/unsafe-logging environment, so those are not fabricated NO-GO findings. If any is confirmed, change to NO-GO and stop. Production and cross-channel Full Disconnection remain NO-GO / activation staged.

Next: owner performs the safe inspection checklist in the [Thai operator guide](./PHASE_17J3D_UAT_OPERATOR_SETUP_GUIDE.md), supplies private attestation/reference outcomes, and reviews the [UAT matrix](./PHASE_17J3D_UAT_TEST_MATRIX.md). Reassess entry gates before requesting an explicitly authorized UAT execution phase. Stop here; no UAT-2 execution begins automatically.
