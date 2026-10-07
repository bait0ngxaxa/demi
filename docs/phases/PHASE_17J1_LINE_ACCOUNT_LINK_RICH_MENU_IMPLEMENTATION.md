# Phase 17J.1 — LINE Account Linking and Role-Aware Rich Menu Runtime

- **Runtime status:** IMPLEMENTED / automated verification complete.
- **External LINE provisioning:** NOT CLAIMED.
- **Real LINE account/mobile UAT:** NOT EXECUTED.
- **Production deployment:** NOT EXECUTED.

This implements the approved [17J.1 contract](./PHASE_17J1_LINE_ACCOUNT_LINK_RICH_MENU_IMPLEMENTATION_CONTRACT.md) under the dedicated DEMI LINE Provider architecture and Option C decision. It stops at the Phase 17J.1 foundation; it does not implement LINE chat commands, clinical replies, reminder scheduling, or Push delivery.

## Runtime delivered

- Additive PostgreSQL persistence for `LineAccountBinding`, `LineAccountActionIntent`, and `LineWebhookEventReceipt` in migration `20261006120000_line_account_linking_rich_menu`.
- Server-only LINE adapters for Login token verification, transient friendship checks, Messaging API Rich Menu operations, and raw-body webhook signature verification. The only client package added is the official `@line/liff` browser SDK, pinned to `2.31.1`.
- Authenticated LIFF account management at `/line/account` and server endpoints under `/api/line/account/` for intent creation, link, and unlink. The LIFF permanent URL is `https://liff.line.me/{LIFF_ID}` because the configured endpoint already contains `/line/account`. The public signed webhook is `POST /api/line/webhook`.
- Option C workspace projection, shared Rich Menu catalog/assets, per-user read-back reconciliation, safe unlink cleanup, and the `line:rich-menu:reconcile` operator command.
- Account linking and unlinking audit events use existing `AuditEvent` conventions. Provider work runs after local commits; provider failure cannot roll back DEMI authority changes.

Implementation is under `src/modules/line/{adapters,domain,schemas,services,transport,rich-menu}/`, `app/api/line/`, and `app/line/account/`. Existing authorized `/app`, Personal, Work, and account entry points resolve the binding in request context and schedule best-effort reconciliation after the response; no role or membership transaction calls LINE.

## Persistence and invariants

`LineAccountBinding` keeps the exact DEMI User FK, a raw verified LINE subject only while active or as an unresolved unlink-cleanup locator, a domain-separated `IDENTITY_HASH_SECRET` HMAC fingerprint plus key ID, lifecycle version, presentation preference, reachability observation, bounded menu/cleanup outcomes, cleanup attempt time/count, and an expiring reconciliation lease. The raw subject is not copied to audit metadata or logs.

`LineAccountActionIntent` stores only the exact User, LINK/UNLINK action, challenge hash, hash of the verified Supabase `session_id` claim, five-minute expiry, consumption time, and a bounded outcome. The challenge is generated with at least 256 bits of cryptographic randomness. Current user identity is obtained from `auth.getUser()` and mapped to the DEMI User; the exact per-session claim comes from the installed Supabase `auth.getClaims()` result. Client-provided LINE IDs, decoded profiles, roles, and resource IDs do not establish authority.

`LineWebhookEventReceipt` stores the provider event ID, allowlisted supported event type, provider event timestamp, acceptance time, and bounded outcome. Receipt insertion and the supported event effect commit atomically per event.

The migration adds PostgreSQL partial unique indexes `LineAccountBinding_active_subject_fingerprint_key` and `LineAccountBinding_active_user_key`, both restricted to rows where `unlinkedAt IS NULL`. Historical fingerprints are indexed but not globally unique. There is no permanent subject tombstone or owner-forever constraint. SQL checks constrain raw locator lifecycle, lease-field pairs, hashes, consumed intent outcomes, and provider event IDs.

## Account and cleanup lifecycle

1. A current authenticated DEMI session requests an opaque intent. The server binds it to the DEMI User, verified Supabase session, action, one-time challenge hash, and five-minute expiry.
2. The LIFF client obtains the raw ID token from the official LIFF SDK and posts it only in an HTTPS request body. The server verifies it with LINE against the configured DEMI LINE Login channel before opening a database transaction.
3. The serializable transaction locks the relevant User/intent/binding state, checks User ACTIVE and intent freshness/use/session/action, queries only for an incompatible retained fingerprint key version and the exact fingerprint being linked, lets database partial unique indexes arbitrate races, consumes the intent, updates the binding, and writes minimized audit metadata. This keeps memory use independent of total history while preserving fail-closed behavior across key versions. Same-user/same-subject relink is idempotent or explicit reactivation; cross-user retained-history conflicts fail closed.
4. Unlink is authoritative at local commit: the binding becomes inactive, its presentation preference clears, `lifecycleVersion` increments, and provider cleanup becomes PENDING. The raw subject remains only as a cleanup locator until trusted FRIEND state plus DELETE and read-back confirm there is no assigned per-user menu.
5. Link/unlink routes return after their authoritative local commit and register provider reconciliation for after the response. Link returns presentation UNKNOWN until readback; unlink returns cleanup PENDING until qualifying cleanup readback. A per-binding 90-second lease and lifecycle-version compare-and-set protect provider work without holding a DB transaction across network calls. Stale responses cannot clear a relinked subject or finalize a newer lifecycle; after an in-flight stale request settles, current state is re-read and reconciled. Expired leases can be reclaimed.
6. Provider cleanup has one network attempt per reconciliation invocation, durable attempt recording, an exponential delay from one minute capped at 24 hours, and stable per-binding jitter. Untrusted reachability never clears the locator; a later signed FRIEND observation can trigger cleanup again.

The v1 cross-user history guard fails closed while retained fingerprint evidence exists. Long-term identity-history retention/erasure and future cross-account reconciliation remain OPEN and are not invented here.

## Reachability, webhook, and Option C

Reachability is independent from identity and is one of UNKNOWN, FRIEND, or NOT_FRIEND. A transient LIFF access token is server-verified for the expected Login channel and `profile` scope; LINE profile `userId` must equal the verified ID-token subject before `friendFlag` is queried. Profile fields and access tokens are discarded. Signed `follow`/`unfollow` events update bounded reachability observations without linking or unlinking DEMI identity. Timestamp ordering rejects older observations; equal conflicting timestamps resolve to UNKNOWN. No Push worker or reminder eligibility is delivered in 17J.1.

The webhook reads exact raw bytes with a local 1 MiB DoS cap, verifies `x-line-signature` using HMAC-SHA256 and constant-time comparison before JSON parsing, validates the configured destination, accepts empty `events`, and does not impose an event-count cap. Additive fields and future event discriminator values are tolerated. It processes only valid user-sourced follow, unfollow, and Rich Menu switch postbacks; unsupported events are ignored and do not stop supported siblings. It does not process `accountLink`, generic postback commands, or group/room business messages. Duplicate durable event IDs safely return 2xx without replaying effects; a DB acceptance failure returns 5xx. After all event receipts/effects are durable, the service returns sanitized counters plus deduplicated opaque binding IDs. The Route Handler registers reconciliation through Next.js `after()` and returns 200 without awaiting Messaging API calls; a failed deferred reconcile leaves durable state for lazy/operator repair.

Workspace switching uses marker `DEMI_LINE_WORKSPACE_SWITCH_V1`, a known current-catalog alias, source type `user`, exact `SUCCESS` status, and freshly resolved current role eligibility. Only then is `presentationRole` updated. Old events are stale; equal-time conflicting preferences clear to the chooser. Missing switch webhooks may be recovered from provider read-back only when the exact current eligible menu alias proves the selected role. Presentation preference and visible menus are never authorization inputs.

## Rich Menu catalog and operator repair

The finite code-owned catalog has **18 reusable PNG assets** under `public/line/rich-menus/`: one UNLINKED, one LINKED_INELIGIBLE, four exact multi-role choosers, three direct single-role menus, and nine selected-role variants for the multi-role eligible sets. Each image is 2500×1686 PNG and below 1 MiB. The assets contain Thai labels and truthful actions only; they do not embed a user, patient, hospital, identity, token, session, or clinical locator.

The catalog uses stable aliases and aliases are presentation locators only. Provisioning is not automatic at startup, build, migration, or test. `npm run line:rich-menu:reconcile` performs a dry-run; `npm run line:rich-menu:reconcile -- --apply` applies the catalog, uploads assets when needed, reconciles aliases, reads back remote state, and establishes the UNLINKED default. For bounded account repair, use `npm run line:rich-menu:reconcile -- --repair --limit=50`; continue a scan with the opaque UUID cursor shown by the command, for example `--after=<UUID>`. Account repair is dry-run unless `--apply` is supplied and never prints LINE subjects or credentials.

Per-user menu state is APPLIED, MISMATCH, UNAVAILABLE, or UNKNOWN based on provider read-back. Unlink cleanup uses its separate CONFIRMED_CLEAN, MISMATCH, UNAVAILABLE, UNKNOWN, or PENDING state. Only CONFIRMED_CLEAN clears the temporary raw locator.

## Runtime review corrections

- LIFF Endpoint URL remains `https://<DEMI-origin>/line/account`; all account actions use the permanent LIFF root `https://liff.line.me/{LIFF_ID}`. The builder no longer repeats the endpoint path or encodes an intent query because the existing page derives the action from current server state. LINE carries additional LIFF URL paths together with the configured endpoint path, so repeating `/line/account` would have produced a duplicate route. See [LINE's LIFF URL behavior](https://developers.line.biz/en/docs/liff/opening-liff-app/).
- Webhook service processing is limited to signature/envelope validation and durable per-event receipt/effect transactions. It returns deduplicated binding IDs for successfully applied presentation effects. The Route Handler schedules those IDs with Next.js `after()` and returns the 2xx response without awaiting Messaging API reconciliation. Empty and duplicate-only webhook requests schedule no provider work.
- Normal `/app`, Personal, Work, and account page rendering resolves the current binding ID before calling `after()`. The deferred callback receives only that ID and does not read request cookies/session. Link and unlink endpoints likewise return immediately after local commit with presentation UNKNOWN or cleanup PENDING, then schedule provider convergence after the response.
- Deferred provider failures are contained without changing durable reachability, preference, binding, or webhook receipt state; lazy entry and operator repair remain available. Existing lifecycleVersion checks, per-binding leases, reachability/read-back rules, and local authority behavior are unchanged.

## Bounded friendship recovery correction (2026-10-07)

- After successful `liff.init()`, the account client attempts one authenticated friendship refresh per page load for an owned UNKNOWN or NOT_FRIEND binding, including unresolved unlinked cleanup. It obtains fresh `liff.getIDToken()` and `liff.getAccessToken()` values in memory and sends only those values in a same-origin POST body to `/api/line/account/reachability`. Missing tokens, provider errors, and failed initialization leave the current observation unchanged; there is no polling or automatic retry loop. Reopening the page creates a new bounded attempt. See the official [LIFF token APIs](https://developers.line.biz/en/reference/liff/) and [LINE Login verification/friendship APIs](https://developers.line.biz/en/reference/line-login/).
- The server requires the current authenticated ACTIVE DEMI User and verifies the raw ID token through the existing Login adapter. The verified subject must match that User's ACTIVE binding, or, when none is ACTIVE, the latest owned UNLINKED binding with unresolved cleanup and a retained raw locator. The access token is verified for the expected Login channel, validity and profile scope; the verified profile subject must match the ID-token subject before reading friendFlag. No tokens or profile fields are persisted or logged, and mismatches receive a generic error.
- `checkStartedAt` is captured before the friendship API sequence. A short row-lock transaction then verifies the captured lifecycleVersion and unresolved-cleanup eligibility before applying the existing observation ordering rule. A newer signed follow/unfollow wins over a late friendship result; equal conflicting observations remain UNKNOWN. Refresh never creates/reactivates a binding or changes presentationRole/authority. For a current unlinked FRIEND observation, only the cleanup backoff timestamp is cleared so the existing bounded cleanup can retry.
- The route schedules exact binding-ID reconciliation through the existing Next.js `after()` transport and returns a safe account summary without awaiting Messaging API calls. Account summary now exposes unresolved cleanup/reachability for the latest owned cleanup binding without returning its ID, lifecycleVersion, locator, fingerprint or provider response. Core pages, webhook acknowledgment, and link/unlink retain the previously corrected non-blocking presentation boundary.
- Cleanup mapping is corrected: NOT_FRIEND → UNAVAILABLE, UNKNOWN → UNKNOWN, with no DELETE in either case. A provider error without definitive readback is UNAVAILABLE, including permanent errors. MISMATCH requires actual linked richMenuId readback after a cleanup attempt. Only current trusted FRIEND plus qualifying clean readback clears the locator; lifecycleVersion and reconciliation leases remain intact.
- UI distinguishes FRIEND, NOT_FRIEND, and UNKNOWN in Thai, shows unresolved unlink cleanup, and gives a safe retry message when automatic checking fails. No new migration, dependency, Provider provisioning, Push, chat command, or Phase 17J.2 work is included.

## Environment and privacy

Server-only LINE configuration is validated lazily through `src/lib/env/server.ts`:

- `DEMI_LINE_MESSAGING_CHANNEL_SECRET`
- `DEMI_LINE_MESSAGING_CHANNEL_ACCESS_TOKEN`
- `DEMI_LINE_MESSAGING_BOT_USER_ID`
- `DEMI_LINE_LOGIN_CHANNEL_ID`
- `DEMI_LINE_PUBLIC_ORIGIN`
- `IDENTITY_HASH_SECRET` (existing server-only hash key)

The client-safe LIFF identifier is `NEXT_PUBLIC_DEMI_LINE_LIFF_ID`. `.env.example` has placeholders only; no provider credentials are committed. The dedicated setup steps are in the [external setup runbook](./PHASE_17J1_LINE_EXTERNAL_SETUP_RUNBOOK.md).

Logs, webhook receipts, and audit metadata exclude raw LINE IDs, fingerprints, tokens, channel secrets, profile fields, session IDs, challenges, National ID, HN, and clinical message content. Client errors are generic and privacy-safe. No authority is derived from the Rich Menu, alias, postback data, LIFF-decoded claims, client role, or resource locator.

## Verification evidence

Focused verification completed before the broad final confirmation:

- LINE unit/UI suite: **14 files / 75 tests PASS** (`npm run test -- src/modules/line app/line/account`).
- PostgreSQL LINE concurrency/invariant suite: **1 file / 16 tests PASS** (`npm run test:integration:focused -- tests/integration/line-account-linking.integration.test.ts`). This used the disposable local PostgreSQL database.
- Empty-schema migration: **PASS** (`npm run test:db:reset`, `npm run prisma:migrate:test`, `npm run test:db:down`); all 39 migrations applied to a fresh disposable PostgreSQL database and the container was removed afterward.
- Populated migration verification: **PASS** (`npm run test:db:migrate:line-populated`); the migration preserved existing User, Person, and role rows and verified both active-only partial indexes.
- Prisma schema validation: **PASS** (`npx prisma validate`); Prisma Client generation completed through the integration harness.
- Typecheck: **PASS** (`npm run typecheck`).
- Full lint: **PASS, exit 0**. The first full run reported four unused-symbol warnings; the symbols were removed and targeted ESLint on affected services/UI then passed with no warnings. Full lint was not repeated after that warning-only cleanup.
- Broad unit suite: **257 files / 2,165 tests PASS** (`npm run test`).
- Broad PostgreSQL integration suite: **36 files / 574 tests PASS** (`npm run test:integration`); 39 migrations were present and there were no pending migrations. The suite used the repository's disposable local PostgreSQL database.
- Production build: **PASS** (`npm run build`) after correcting a catch binding caught by the first build attempt; the successful build compiled the new `/line/account` and `/api/line/*` routes.
- Local viewport check: the built page rendered at **390×844** in Chrome; Thai text rendered correctly and `documentWidth = bodyWidth = viewportWidth = 390` (no horizontal overflow). The local page displayed the safe unavailable state, so link confirmation was covered by component tests rather than an authenticated browser interaction.

The broad unit and integration suites ran immediately before the final catch-binding correction. After that correction, the affected LINE unit/UI suite (14 files / 75 tests), focused PostgreSQL suite (1 file / 16 tests), typecheck, targeted ESLint, and final production build all passed. One focused PostgreSQL invocation initially could not regenerate Prisma Client because the local production server still held the Windows query-engine DLL; stopping that server resolved the lock, and the focused suite then passed. PostgreSQL integration and migration commands use the repository's disposable local test database and do not modify production data.

### Review-correction verification (2026-10-07)

- Focused correction suite: **8 files / 49 tests PASS** (`npm run test -- src/modules/line/services/line-deep-link-builder.test.ts src/modules/line/services/line-webhook-service.test.ts src/modules/line/services/line-account-service.test.ts src/modules/line/transport/line-reconciliation-scheduler.test.ts src/modules/line/rich-menu/catalog.test.ts app/api/line/webhook/route.test.ts app/api/line/account/presentation-routes.test.ts app/line/account/line-account-client.test.tsx`). This covers the non-duplicated LIFF root, durable webhook binding-ID results, post-response scheduling, empty/duplicate-only no-work behavior, deferred failure containment, and immediate link/unlink responses.
- `npm run lint`: **PASS**; `npm run typecheck`: **PASS**; `git diff --check`: **PASS**.
- Final broad unit suite after the correction: **260 files / 2,176 tests PASS** (`npm run test`).
- Final Next.js 16.3 production build after the correction: **PASS** (`npm run build`); webhook and account routes compiled with the `after()` scheduling boundary.
- PostgreSQL migrations and integration suites were **not rerun** for this correction. No schema, constraint, transaction, or lifecycle semantics changed; the account-link history lookup now performs targeted indexed `findFirst` checks with the same fail-closed key-version and exact-fingerprint predicates. Prior PostgreSQL evidence above remains applicable to the unchanged invariants.
- No external LINE Provider operation, real account link, real mobile rendering, block/unblock check, or production deployment was performed.

Fake adapters and local automated tests do **not** verify real LINE credentials, provider setup, real OA reachability, LINE Console configuration, real Rich Menu uploads, block/unblock behavior, or LINE mobile rendering. Those remain external UAT prerequisites.

### Friendship-recovery verification (2026-10-07)

- Focused unit/UI/transport verification: **8 files / 60 tests PASS** (`npm run test -- app/line/account app/api/line/account/presentation-routes.test.ts src/modules/line/services/line-account-service.test.ts src/modules/line/services/line-menu-reconciler.test.ts src/modules/line/adapters/line-login-client.test.ts src/modules/line/transport/line-reconciliation-scheduler.test.ts src/modules/line/transport/account-http.test.ts`). Includes fresh token acquisition after initialization, one attempt/no polling, Strict Mode effect restart, missing tokens, safe failure, no token URL/storage/log output, exact-origin rejection, forbidden identity fields, deferred reconciliation, reachability wording and visible unresolved cleanup. An initial new Strict Mode test exposed stale effect callbacks in the test harness; resetting the harness between tests fixed the fixture, and the focused suite passed.
- Focused disposable PostgreSQL verification: **1 file / 25 tests PASS** (`npm run test:db:up`, `npm run test:integration:focused -- tests/integration/line-account-linking.integration.test.ts`, `npm run test:db:down`). Rerun was proportionate because friendship observation persistence now supports unresolved UNLINKED cleanup and cleanup outcome mapping changed. Covers initial transient failure recovery, active UNKNOWN/NOT_FRIEND recovery, verified subject mismatch, missing session, provider failure, delayed/equal conflicting observations, lifecycle rejection, safe summary, non-reactivation, backoff reset, locator retention/clearance and cleanup outcomes. The harness generated Prisma Client and applied the existing 39 migrations to the local disposable test database; no new migration or invariant change was introduced. The container was removed afterward; broad integration and separate populated-migration verification were not rerun.
- `npm run lint`: **PASS**. After the last isolated UI/test edits, targeted ESLint for the four changed account UI/route test files also **PASS**. `npm run typecheck`: **PASS**. `git diff --check`: **PASS**. Impeccable mechanical detector returned no findings on the account UI; component tests verify Thai states, not real LINE rendering.
- Final broad unit confirmation: **261 files / 2,195 tests PASS** (`npm run test`), run once after reviewing the stable source/test diff.
- Final Next.js 16.3 production build: **PASS** (`npm run build`), run once; the new `/api/line/account/reachability` route compiled successfully. Phase 17J.1 runtime: **IMPLEMENTED / AUTOMATED VERIFICATION COMPLETE**.
- External DEMI LINE Provider setup, real LINE OA/LIFF/mobile UAT and production deployment: **NOT EXECUTED**. Identity-history fingerprint retention/erasure remains **OPEN / NON-BLOCKING**. Work stops at Phase 17J.1.

## External setup runbook

1. Create or select the dedicated DEMI LINE Provider. Under that same Provider, create/link the DEMI Official Account and Messaging API channel, then create the dedicated DEMI LINE Login channel and LIFF app. Do not reuse NHFapp providers, channels, secrets, tokens, or runtime.
2. Configure the LIFF endpoint URL to `https://<DEMI-origin>/line/account`; use the canonical HTTPS origin as `DEMI_LINE_PUBLIC_ORIGIN`. Enable the LIFF `openid` and `profile` scopes required for ID-token verification and the optional friendship check.
3. Configure the Messaging API webhook URL as `https://<DEMI-origin>/api/line/webhook`, enable webhook delivery in LINE Console, and configure the destination expected by `DEMI_LINE_MESSAGING_BOT_USER_ID`.
4. Store each channel credential in the server's protected environment: Messaging channel secret/access token, bot user ID, Login channel ID, public origin, and LIFF ID. Keep the existing server-only `IDENTITY_HASH_SECRET`; identity fingerprint key rotation is not part of this phase.
5. Review the provisioning dry-run, then explicitly apply with `npm run line:rich-menu:reconcile -- --apply`. Verify the 18 shared menu definitions/assets, aliases, image read-back, and UNLINKED default in LINE Console/provider read-back.
6. Prepare real LINE accounts and DEMI test users spanning unlinked, ineligible, PATIENT, OSM, HOSPITAL, all two-role combinations, and all three operational roles. Perform HTTPS LIFF link/unlink, follow/unfollow, cleanup recovery, role switching, and real mobile rendering checks. Record these separately from automated verification; do not use National ID in LINE state.

## Open and deferred work

- Identity-history fingerprint retention/erasure and future cross-account reconciliation: **OPEN / NON-BLOCKING**.
- Real DEMI LINE Provider/OA/LIFF setup, credential provisioning, provider assets/aliases/default, real account/mobile UAT, and production deployment: **NOT EXECUTED / NOT CLAIMED**.
- P17D-NOTIF-01 and all reminder, Push, consent, MED-02, adherence, Family-authority expansion, and later 17J conversational workflows: **UNCHANGED / OPEN or DEFERRED**. No 17J.2 work is included.

### LINE account UX correction: real-device checklist

**Real LINE mobile/device UAT: NOT EXECUTED.** Perform these checks after deployment with non-production accounts:

A. **New user / no DEMI session:** Rich Menu → LIFF → DEMI login → automatic return to `/line/account` → connect → clear success → tap **「กลับไปที่ LINE」**.
B. **Existing DEMI session:** Rich Menu → LIFF → connect directly → clear success → tap **「กลับไปที่ LINE」**.
C. **Not yet OA friend / blocked:** account stays connected → show clear add/unblock action → complete friendship recovery → one user-triggered refresh and existing menu reconciliation → no identity re-link.
D. **Already linked:** show **「พร้อมใช้งานผ่าน LINE แล้ว」** when friendship and menu are confirmed → return to LINE → keep unlink secondary.
E. **Unlink:** confirm explicitly → show immediate success → return to LINE → default menu may converge afterward.
F. **Failure:** use no system vocabulary, provide no dead end, and show one clear next action.

The finite Rich Menu catalog remains exactly 18 entries. Updated Thai role/chooser labels are generated from the catalog source of truth into `public/line/rich-menus/`; after deployment/review, the operator must rerun `npm run line:rich-menu:reconcile` and then `npm run line:rich-menu:reconcile -- --apply`. No real LINE Provider operation is part of this UX correction.
