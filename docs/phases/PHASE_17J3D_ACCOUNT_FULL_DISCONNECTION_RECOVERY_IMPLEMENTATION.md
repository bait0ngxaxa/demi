# Phase 17J.3D — Account Full Disconnection and Bounded Recovery

Date: 2026-10-09. Baseline HEAD: `1dea19b09af8b7a9a02267be8b03d6de7d8ae9ec` (17J.3C), branch `main`. Implementation handoff snapshot before the owner's subsequent commit/push request: 19 tracked files modified and 17 new files (36 total). Initial working tree was clean. No production operation was performed.

**GO classification: FOUNDATION + ACCOUNT ORCHESTRATION IMPLEMENTED / ACTIVATION STAGED.**

**NO-GO for ACCOUNT FULL DISCONNECTION ACTIVATED / VERIFIED.** No real provider revocation, production migration, deployment, actual channel inventory acceptance or browser/device UAT was performed. Automated provider mocks establish classification and request construction, not undocumented LINE behavior. Account termination is not MINI termination.

## 1. Scope and authority

Reuse the [17J.3B contract](./PHASE_17J3B_MINI_APP_WORKFLOW_TECHNICAL_CONTRACT.md), [17J.3C persistence foundation](./PHASE_17J3C_FULL_LINE_DISCONNECTION_LIFECYCLE_FOUNDATION_IMPLEMENTATION.md), [owner closeout](./PHASE_17J3A_LIFF_WORKFLOW_SESSION_DECISION_CLOSEOUT.md) and [ADR-0009](../adr/0009-demi-line-oa-liff-identity-and-messaging.md). No duplicate lifecycle schema, auth mechanism, DEMI session table, dependency, migration, background worker or Patient business rule was introduced.

Local binding revocation is immediately authoritative. Provider confirmation and bounded Recovery release are independent persisted facts. Recovery never creates/reactivates a binding, DEMI session, workflow context, role or Patient capability. Relink is a separate normal operation with fresh proof and current authority checks.

## 2. Changed files

| Area | Added or modified files |
| --- | --- |
| Configuration | `.env.example`; `src/modules/line/services/line-disconnection-configuration.ts` and `.test.ts` |
| Account provider | `src/modules/line/adapters/line-deauthorization-client.ts` and `.test.ts`; `line-login-client.ts` |
| Auth exact session | `src/modules/auth/services/exact-session-service.ts` and `.test.ts`; `src/lib/auth/supabase-server.ts`, `.test.ts`, `supabase-proxy.ts`, `.test.ts` |
| Orchestration/guards | `src/modules/line/services/line-disconnection-service.ts`, `line-account-service.ts`, `line-authorization-lifecycle-service.ts` |
| HTTP contracts | `src/modules/line/schemas/line-schemas.ts`, `.test.ts`; `domain/line-errors.ts`; `transport/account-http.ts` |
| Existing endpoints | `app/api/line/account/intents/route.ts`, new `intents/route.test.ts`, `link/route.ts`, `unlink/route.ts` |
| New endpoints/tests | `app/api/line/account/disconnection/route.ts`; `recovery/prepare/route.ts`; `recovery/route.ts`; `recovery/recovery-routes.test.ts` |
| Account experience | `app/line/account/page.tsx`, `line-account-client.tsx`, `line-friendship-refresh.test.tsx`; new `line-recovery-panel.tsx`, `line-recovery-panel.test.tsx`, `line-recovery-flow.test.tsx` |
| PostgreSQL evidence | `tests/integration/line-disconnection-orchestration.integration.test.ts` |
| Handoff | This document and `docs/CONTEXT.md` |

No Prisma schema, lockfile, generated source, Rich Menu asset, Family service or Patient service changed.

## 3. Server inventory and activation configuration

`DEMI_LINE_DISCONNECTION_ENABLED` defaults to `false`; unset also stages this slice. Explicit `true` requires strict server-owned JSON in `DEMI_LINE_DISCONNECTION_MANIFEST`. Invalid enabled configuration fails closed for Link/Recovery. The manifest is never accepted from a request.

Required manifest fields:

- `inventory.revision`: reviewed evidence/revision reference.
- `inventory.channels`: exactly one ACCOUNT tuple plus known MINI internal tuples. Each tuple has `kind`, `providerReference`, numeric `channelId`, `environment` (ACCOUNT or MINI DEVELOPING/REVIEW/PUBLISHED), `deploymentReference`; MINI may carry reviewed `exclusionReference`.
- If no MINI tuple is configured, `inventory.miniExclusionReference` must explicitly reference reviewed non-provisioning evidence. Missing configuration does not establish absence.
- `accountLiffId`: reviewed existing Account LIFF ID; exact match with current configured LIFF ID. Do not infer a channel ID from the LIFF ID prefix.
- `appNames`: trusted Thai/display app names keyed by `lineChannelTupleKey(channel)`. The existing SHA-256 tuple definition includes provider, kind, channel ID, environment and deployment. Current configured tuples require names; retained historical unknown labels use a safe generic Thai label and remain review obligations.
- `deploymentReference`, `migrationEvidence`, `recoveryUatEvidence`, `providerCredentialEvidence`, `exactSessionEvidence`: operator-reviewed references. References attest external review; their presence is not independent provider/UAT proof.

Existing `DEMI_LINE_LOGIN_CHANNEL_ID`, `NEXT_PUBLIC_DEMI_LINE_LIFF_ID` and trusted HTTPS `DEMI_LINE_PUBLIC_ORIGIN` remain authoritative. Account channel and deployment must match the manifest. Supply only this Login channel's secret as server-only `DEMI_LINE_LOGIN_CHANNEL_SECRET`. Never use Messaging or MINI secrets. Credentials are not persisted or returned.

`DEMI_LINE_PROVIDER_TOKEN_VERIFY_QUERY_ENABLED` defaults to `false`. The owner explicitly approved, during this implementation session, the narrowly scoped exception for the official server-to-LINE HTTPS access-token-verification query. An operator must still configure this gate only after reviewing outbound request logging/telemetry. No browser/redirect URL, analytics or application log may contain a token. With the gate disabled, no verification query or deauthorization is sent and local unlink remains successful.

Readiness checks the existing `20261008120000_line_authorization_lifecycle` migration is finished and not rolled back in `_prisma_migrations`. There is no new migration. All 41 existing migrations were applied to a fresh disposable PostgreSQL test database; populated migration evidence remains the 17J.3C evidence, not a new production claim.

**Coordinated rollout:** verify target migration, reviewed inventory/exclusions, Account secret and LIFF mapping, exact-session policy, complete Recovery/device UAT, Origin/cookie behavior and outbound token privacy before enabling. A flag or filled evidence references alone cannot satisfy these gates. Keep Recovery operational after activation; disabling configuration does not waive durable unresolved obligations. Repair configuration rather than clearing pending history.

## 4. Account provider boundary

Official API contract checked against the [LINE Login reference](https://developers.line.biz/en/reference/line-login/): access-token verification establishes the fixed Login audience and remaining lifetime; supported userinfo establishes the token's subject. The adapter requires openid and matching retained subject. Only verified user access tokens target deauthorization; ID tokens and raw subjects do not target it.

The adapter obtains a transient stateless channel token from the Account Login ID/secret and sends `POST /user/v1/deauthorize` with bearer channel authorization and JSON `userAccessToken`. Only HTTP 204 produces verified provider success. 400/401/403 never imply removal. 429/5xx, malformed/unexpected or timed-out submitted requests remain possibly dispatched/unconfirmed. Failure before submission is known not dispatched. One shared ten-second deadline covers verification, credential acquisition and termination; redirects are rejected and no retry occurs. See [stateless channel tokens](https://developers.line.biz/en/reference/messaging-api/#issue-stateless-channel-access-token) for the channel-token request contract.

No token is stored in database, cookies, sessionStorage, audit, redirects or return payload. Sensitive requests use POST bodies, strict schemas, the existing streamed 32 KiB body limit, exact trusted Origin and private/no-store responses. Provider payloads are not logged. The sole approved URL exception is the provider's required verification query; operator egress logging must redact/omit it.

## 5. Authoritative Unlink and historical attempts

The client asks for full-disconnection confirmation in Thai and submits the existing session-bound intent/challenge, with a transient current access token only if LIFF is already initialized. Ordinary Unlink never launches fresh consent. Outside LIFF, missing/expired/wrong-channel/mismatched proof does not prevent local revocation.

Inside the existing Serializable transaction: lock User, validate/lock intent, lock Binding, revoke local binding, advance generation, initialize channel-specific obligations, consume intent and commit audit. No provider request runs under locks. Token verification is deliberately after this commit, together with the optional remote attempt; an unavailable verifier cannot delay or veto local revocation.

After commit, reserve the Account obligation against its exact old binding version and tuple. Before actual remote send, recheck reservation/generation/release. Record only that attempt's outcome. Post-commit errors never restore local authority. A reservation survives process failure conservatively; no worker or repeat invocation redispatches it. Existing menu reconciliation remains separate and safe. Readiness loss still allows legacy local unlink; Link/Recovery fail closed until repaired configuration, and missing-generation history is initialized during Recovery.

MINI observations/unknown applicability and independent historical tuple obligations survive inventory revisions. This phase never sends an Account token to MINI or confirms MINI removal. A configured applicable MINI obligation stays unconfirmed until authorized bounded Recovery or a future channel-correct runtime adapter satisfies it.

## 6. Auth-owned Recovery authority

`getLiveExactSession()` creates a bounded SSR client, captures one current access JWT from cookie transport, and uses that exact JWT for `getClaims(jwt)` and `getUser(jwt)`. `getSession()` alone is never trusted. Require verified signature/expiry, expected project issuer and authenticated audience, UUID subject/session ID, matching provider User, ACTIVE canonical DEMI owner, intent's exact session hash and retained binding ownership. No positive liveness cache is introduced. See [Supabase getClaims](https://supabase.com/docs/reference/javascript/auth-getclaims) and [getUser](https://supabase.com/docs/reference/javascript/auth-getuser).

Recovery endpoints bypass ordinary proxy refresh, and their client blocks token-refresh transport rather than silently replacing a rejected JWT. Ordinary Auth/Family refresh behavior remains unchanged. An expired or near-expiry session needing refresh must use ordinary DEMI refresh/login and prepare a new intent; it cannot substitute a new session during an attempt. Provider denial, outage and timeout fail closed with sanitized errors. Auth/LINE network work occurs before database locks.

Production Recovery evidence is composed in a private server-only closure after real Auth and LINE verification. No route permits caller-supplied provider outcomes, subjects, session IDs, channel selectors or authority objects. Dependency seams used by synthetic tests are server-only; they are not an external authorization API.

## 7. Intent, proof and Recovery commit

Preparation requires live exact-session owner authentication and server-selects the oldest relevant revoked binding. Five-minute, single-use challenge/session hashing and existing per-owner intent rate limit are reused. Persist target binding ID/version and reviewed full unsatisfied set digest. Legacy obligations initialize under locks. The intent INSERT supplies valid target/digest fields required by the foundation database constraints; its digest is transactionally updated after the locked reviewed set is established.

Recovery requires every reviewed obligation decision (`REMOVED`, `NOT_LISTED`, or `UNDETERMINED` for genuinely unknown applicability), explicit risk acknowledgement, unconsumed exact-session challenge and freshly server-verified Account identity matching retained fingerprint/key. Verification is after intent creation and within five minutes, proof remains unexpired, and current Auth liveness is checked again after LINE verification. Freshness refers to new supported server verification, not a guarantee LIFF minted a new JWT; client profile/decoded payload is never evidence.

The existing lifecycle release revalidates User → Intent → Binding → lifecycle rows under Serializable ordering, inventory/set digest, generation, manual reviews, expiry and eligibility. Consume intent once; write immutable recovery audit and release fields atomically. Audit includes intent, review/policy/copy, proof tuple/time, session check, explicit risk time and renewed-grant provenance. Provider attempt status is not rewritten. Return only `RECOVERY_RELEASED_UNVERIFIED`.

## 8. Thai Account experience and Relink

Server-backed status distinguishes local unlink, pending removal, channel-confirmed removal, Recovery needed and recovery-released unverified history. Partial completion lists trusted apps without implying complete MINI removal. Refresh/back navigation re-resolves server state; a restored BFCache view hides stale management content before reload.

Recovery is one continuation: prepare intent → review apps at LINE Settings / Account / Authorized apps → acknowledge an old request may disrupt a later connection → recovery-only fresh Account LIFF proof → explicit submit. The [supported LINE settings link](https://developers.line.biz/en/docs/line-login/managing-authorized-apps/) is `https://line.me/R/nv/connectedApps`. Do not authorize a never-used MINI app to review/remove it.

The UI warns fresh proof may renew Account permission. External LIFF login or in-client restart uses the fixed Account LIFF; the non-authoritative `recovery=1` marker contains no secret. Only the expiring intent/challenge and review/risk decisions cross the handoff in sessionStorage. Tokens, subjects, session IDs and Recovery receipts do not. After return the user explicitly submits; no automatic link occurs. SDK initialization is bounded to ten seconds and transport to 25 seconds; accessible status/error feedback and duplicate-submission guards prevent permanent loading.

Ordinary LINK intent preparation checks historical eligibility before controlled authorization launch. The final linking transaction checks owner/history/generation/current obligations before both completion and `ALREADY_LINKED`. Fresh identity and intent expiry are rechecked after provider work. Different-user retained-history conflicts are unchanged. Staged inventory injection alone does not activate restrictions; durable pending rows from an earlier activation remain guarded even if the switch is later disabled.

Legacy revoked bindings with no lifecycle rows are conservatively fenced only in activated inventory mode and recover through deterministic lazy initialization, including history whose raw cleanup locator is gone. Recovery uses fresh fingerprint association, not the historical access token. Neither legacy initialization nor manual review fabricates provider success.

## 9. Late-response and concurrency safety

An old reserved/submitted A can time out, then be recovery-released, followed by new grant/binding B. A late 204 may update only A's immutable historical attempt and old lifecycle outcome; it cannot mutate B, overwrite generation, remove the release audit, restore workflow authority or mint Patient access. Historical display continues to distinguish Recovery release even after late confirmation. No automatic second dispatch exists.

DEMI cannot prevent LINE from eventually applying A to provider-side permission B. Temporary reconnect disruption is the accepted availability risk. Lost permission causes proof/entry failure and explicit reconnect; no account switching or silent Patient access.

## 10. Automated verification

Final implementation checks:

- Targeted new adapter, exact-session, configuration, SSR, Recovery presentation/interaction: **6 files / 53 tests PASS**; Recovery route transport: **1 file / 9 tests PASS**.
- PostgreSQL 17 disposable integration: new orchestration/concurrency **34 PASS**, existing lifecycle **30 PASS**, existing Account linking **26 PASS**. Final focused runs: **2 files / 64 tests PASS** and **1 file / 26 tests PASS** (90 total). Earlier combined stable three-file run also passed 90; later affected checks followed Auth/audit refinements.
- `npm run typecheck`: **PASS**.
- `npm run lint -- --max-warnings 0`: **PASS**, no warnings. Repository does not define `lint:strict` or `architecture:check`; no fabricated execution is claimed.
- `git diff --check`: **PASS**. Sensitive route/source review completed.
- UTF-8 strict decode, no BOM and no replacement character: **36 changed files PASS**. Existing Thai text preserved; no repository-wide formatting was performed.
- One broad `npm run test`: **273 files; 2,350 tests PASS / 4 FAIL**. One LINE schema regression expected stripping extra fields; the requested strict boundary now rejects them. Updated behavior test plus intent/transport regressions: **4 files / 19 tests PASS**. The other three failures were unchanged Patient-import tests exceeding five seconds under broad parallel load. Isolated entire import file: **16/16 PASS twice** (20.34 seconds and 5.72 seconds total); no Patient code, timeout or test expectation was weakened. Treat these as broad-run resource-sensitive failures, not demonstrated product regressions. **The full suite is not claimed green.** No second broad run was made; the final surgical intent-route/test change passed focused checks, typecheck and targeted ESLint without invalidating unrelated broad-run results.

Coverage includes local commit before network, channel/subject/token rejection, missing/expired proof, 204 versus ambiguous400/429/5xx/timeout, no token persistence, duplicate/crash/no redispatch, stale session/generation/inventory/set/intent, inactive owner, unavailable provider, wrong identity, reviews/risk, legacy history, unknown MINI, no Patient authority, before-launch/final/idempotent Relink guards, concurrent unlink/recovery/relink/reservation/completion, late outcome and no provider I/O under locks. Existing Serializable retry tests and lock-order foundation remain in regression scope.

The standard local harness initially failed P1001 because Windows could not reach WSL's published port55432; Windows also excluded that bind. A temporary loopback25432→WSL relay reached the same official disposable container. No real database was used. Early focused failures exposed a Recovery INSERT missing constrained target fields and an unintended inventory-seam guard activation; root causes were corrected without weakening constraints/tests. A hook-test duplicate-click simulation and missing browser mock were corrected. Source review additionally fixed Unlink-intent preparation to tolerate readiness loss while Link remains closed. Final focused checks are green; broad-run resource-sensitive failures remain explicitly separated above.

No build/dev server, full PostgreSQL suite, real provider experiment or hour-long disposable Supabase session experiment was repeated. Prior B17J3-03 evidence remains valid only for its tested configuration.

Disposable PostgreSQL cleanup: `npm run test:db:down` **PASS**; both task-created temporary relays were stopped. No temporary source/debug artifact remains.

## 11. Operator provisioning and UAT acceptance

Perform only with separate authorization for real provider settings/mutations and disposable users:

1. Review existing Account Provider/Login channel/LIFF mapping, target deployment/origin and all MINI DEVELOPING/REVIEW/PUBLISHED tuples. Record actual evidence and app names; never fill an exclusion because MINI config is missing. Preserve historical inventory references.
2. Verify target's foundation migration and schema constraints via approved migration process; do not run production migration as part of this handoff. Keep actual credentials in the server secret manager, redact outbound verification URLs and request bodies, and configure the owner-approved query exception gate.
3. Verify exact project JWT issuer/audience and live same-session provider checks. Reuse prior evidence when environment/policy is unchanged; test changed configurations with disposable sessions. Validate cookie propagation, no implicit Recovery refresh, denial, outage and normal-login recovery.
4. In an isolated acceptance environment, configure the full reviewed manifest/bundle together. Test Account-only and applicable/unknown MINI inventories without forcing MINI consent. Flag changes alone do not constitute activation acceptance.
5. Disposable Account tests: same-channel204; missing/expired/wrong-subject proof; provider rejection/outage; local access denied immediately; ordinary DEMI login and records intact; truthful pending/partial status across reload. Inspect redacted transport/audit/database evidence for no token persistence.
6. Recovery tests on mobile LINE and external browser: manual review/risk before identity handoff; revoked/expired/different DEMI session; wrong LINE account; cached SDK token and fresh provider verification; timeout; tab/back/refresh/storage/cookie behavior; accessible focus/status; one-submit intent; no automatic Relink. Then perform explicit separate Relink and retained-history conflict tests.
7. Simulate delayed A in a controlled test harness, release Recovery and link B; deliver late historical response. Check local generation/audit/Patient invariants. Document provider-side availability limits; mocks cannot prove live race behavior.
8. Record signed migration/inventory/credential/exact-session/UI/provider evidence and reviewed rollback plan. After first activation, maintain Recovery configuration for existing pending users. Credential loss should leave local unlink/Recovery available and remote status unconfirmed.

Until these steps have evidence, source implementation is staged and no user-facing GO is claimed. Real Account provider behavior and device/browser UAT remain pending. MINI deauthorization transport, MINI Gateway/scoped Appointment workflow, Rich Menu changes, notifications and Phase17J.4 remain outside this slice.

Recommended next work is Account environment readiness and authorized disposable-user LINE/device UAT. A later separately approved slice may implement independent MINI termination transport; do not automatically start it.
