# Phase 17J.1 — LINE Account Linking and Role-Aware Rich Menu Runtime

- **Runtime status:** IMPLEMENTED / automated verification complete.
- **External LINE provisioning:** NOT CLAIMED.
- **Real LINE account/mobile UAT:** NOT EXECUTED.
- **Production deployment:** NOT EXECUTED.

This implements the approved [17J.1 contract](./PHASE_17J1_LINE_ACCOUNT_LINK_RICH_MENU_IMPLEMENTATION_CONTRACT.md) under the dedicated DEMI LINE Provider architecture and Option C decision. It stops at the Phase 17J.1 foundation; it does not implement LINE chat commands, clinical replies, reminder scheduling, or Push delivery.

## Runtime delivered

- Additive PostgreSQL persistence for `LineAccountBinding`, `LineAccountActionIntent`, and `LineWebhookEventReceipt` in migration `20261006120000_line_account_linking_rich_menu`.
- Server-only LINE adapters for Login token verification, transient friendship checks, Messaging API Rich Menu operations, and raw-body webhook signature verification. The only client package added is the official `@line/liff` browser SDK, pinned to `2.31.1`.
- Authenticated LIFF account management at `/line/account` and server endpoints under `/api/line/account/` for intent creation, link, and unlink. The public signed webhook is `POST /api/line/webhook`.
- Option C workspace projection, shared Rich Menu catalog/assets, per-user read-back reconciliation, safe unlink cleanup, and the `line:rich-menu:reconcile` operator command.
- Account linking and unlinking audit events use existing `AuditEvent` conventions. Provider work runs after local commits; provider failure cannot roll back DEMI authority changes.

Implementation is under `src/modules/line/{adapters,domain,schemas,services,transport,rich-menu}/`, `app/api/line/`, and `app/line/account/`. Existing authorized `/app`, Personal, and Work entry points request best-effort reconciliation; no role or membership transaction calls LINE.

## Persistence and invariants

`LineAccountBinding` keeps the exact DEMI User FK, a raw verified LINE subject only while active or as an unresolved unlink-cleanup locator, a domain-separated `IDENTITY_HASH_SECRET` HMAC fingerprint plus key ID, lifecycle version, presentation preference, reachability observation, bounded menu/cleanup outcomes, cleanup attempt time/count, and an expiring reconciliation lease. The raw subject is not copied to audit metadata or logs.

`LineAccountActionIntent` stores only the exact User, LINK/UNLINK action, challenge hash, hash of the verified Supabase `session_id` claim, five-minute expiry, consumption time, and a bounded outcome. The challenge is generated with at least 256 bits of cryptographic randomness. Current user identity is obtained from `auth.getUser()` and mapped to the DEMI User; the exact per-session claim comes from the installed Supabase `auth.getClaims()` result. Client-provided LINE IDs, decoded profiles, roles, and resource IDs do not establish authority.

`LineWebhookEventReceipt` stores the provider event ID, allowlisted supported event type, provider event timestamp, acceptance time, and bounded outcome. Receipt insertion and the supported event effect commit atomically per event.

The migration adds PostgreSQL partial unique indexes `LineAccountBinding_active_subject_fingerprint_key` and `LineAccountBinding_active_user_key`, both restricted to rows where `unlinkedAt IS NULL`. Historical fingerprints are indexed but not globally unique. There is no permanent subject tombstone or owner-forever constraint. SQL checks constrain raw locator lifecycle, lease-field pairs, hashes, consumed intent outcomes, and provider event IDs.

## Account and cleanup lifecycle

1. A current authenticated DEMI session requests an opaque intent. The server binds it to the DEMI User, verified Supabase session, action, one-time challenge hash, and five-minute expiry.
2. The LIFF client obtains the raw ID token from the official LIFF SDK and posts it only in an HTTPS request body. The server verifies it with LINE against the configured DEMI LINE Login channel before opening a database transaction.
3. The serializable transaction locks the relevant User/intent/binding state, checks User ACTIVE and intent freshness/use/session/action, verifies retained fingerprint history, lets database partial unique indexes arbitrate races, consumes the intent, updates the binding, and writes minimized audit metadata. Same-user/same-subject relink is idempotent or explicit reactivation; cross-user retained-history conflicts fail closed.
4. Unlink is authoritative at local commit: the binding becomes inactive, its presentation preference clears, `lifecycleVersion` increments, and provider cleanup becomes PENDING. The raw subject remains only as a cleanup locator until trusted FRIEND state plus DELETE and read-back confirm there is no assigned per-user menu.
5. A per-binding 90-second lease and lifecycle-version compare-and-set protect provider work without holding a DB transaction across network calls. Stale responses cannot clear a relinked subject or finalize a newer lifecycle; after an in-flight stale request settles, current state is re-read and reconciled. Expired leases can be reclaimed.
6. Provider cleanup has one network attempt per reconciliation invocation, durable attempt recording, an exponential delay from one minute capped at 24 hours, and stable per-binding jitter. Untrusted reachability never clears the locator; a later signed FRIEND observation can trigger cleanup again.

The v1 cross-user history guard fails closed while retained fingerprint evidence exists. Long-term identity-history retention/erasure and future cross-account reconciliation remain OPEN and are not invented here.

## Reachability, webhook, and Option C

Reachability is independent from identity and is one of UNKNOWN, FRIEND, or NOT_FRIEND. A transient LIFF access token is server-verified for the expected Login channel and `profile` scope; LINE profile `userId` must equal the verified ID-token subject before `friendFlag` is queried. Profile fields and access tokens are discarded. Signed `follow`/`unfollow` events update bounded reachability observations without linking or unlinking DEMI identity. Timestamp ordering rejects older observations; equal conflicting timestamps resolve to UNKNOWN. No Push worker or reminder eligibility is delivered in 17J.1.

The webhook reads exact raw bytes with a local 1 MiB DoS cap, verifies `x-line-signature` using HMAC-SHA256 and constant-time comparison before JSON parsing, validates the configured destination, accepts empty `events`, and does not impose an event-count cap. Additive fields and future event discriminator values are tolerated. It processes only valid user-sourced follow, unfollow, and Rich Menu switch postbacks; unsupported events are ignored and do not stop supported siblings. It does not process `accountLink`, generic postback commands, or group/room business messages. Duplicate durable event IDs safely return 2xx without replaying effects; a DB acceptance failure returns 5xx.

Workspace switching uses marker `DEMI_LINE_WORKSPACE_SWITCH_V1`, a known current-catalog alias, source type `user`, exact `SUCCESS` status, and freshly resolved current role eligibility. Only then is `presentationRole` updated. Old events are stale; equal-time conflicting preferences clear to the chooser. Missing switch webhooks may be recovered from provider read-back only when the exact current eligible menu alias proves the selected role. Presentation preference and visible menus are never authorization inputs.

## Rich Menu catalog and operator repair

The finite code-owned catalog has **18 reusable PNG assets** under `public/line/rich-menus/`: one UNLINKED, one LINKED_INELIGIBLE, four exact multi-role choosers, three direct single-role menus, and nine selected-role variants for the multi-role eligible sets. Each image is 2500×1686 PNG and below 1 MiB. The assets contain Thai labels and truthful actions only; they do not embed a user, patient, hospital, identity, token, session, or clinical locator.

The catalog uses stable aliases and aliases are presentation locators only. Provisioning is not automatic at startup, build, migration, or test. `npm run line:rich-menu:reconcile` performs a dry-run; `npm run line:rich-menu:reconcile -- --apply` applies the catalog, uploads assets when needed, reconciles aliases, reads back remote state, and establishes the UNLINKED default. For bounded account repair, use `npm run line:rich-menu:reconcile -- --repair --limit=50`; continue a scan with the opaque UUID cursor shown by the command, for example `--after=<UUID>`. Account repair is dry-run unless `--apply` is supplied and never prints LINE subjects or credentials.

Per-user menu state is APPLIED, MISMATCH, UNAVAILABLE, or UNKNOWN based on provider read-back. Unlink cleanup uses its separate CONFIRMED_CLEAN, MISMATCH, UNAVAILABLE, UNKNOWN, or PENDING state. Only CONFIRMED_CLEAN clears the temporary raw locator.

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

Fake adapters and local automated tests do **not** verify real LINE credentials, provider setup, real OA reachability, LINE Console configuration, real Rich Menu uploads, block/unblock behavior, or LINE mobile rendering. Those remain external UAT prerequisites.

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
