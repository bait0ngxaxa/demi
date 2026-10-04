# Phase 17H.3 — Personal Weight Goal Implementation

## Current status — Phase 17H.4A automated re-audit (2026-10-04)

[Wellness re-audit report](./PHASE_17H4A_WELLNESS_REAUDIT_UAT_READINESS.md): **PASS / AUTOMATED RE-AUDIT COMPLETE.** WELL-01 and WELL-02 remain IMPLEMENTED; WELL-03 remains IMPLEMENTED / TARGET-ONLY. The approved bounded automated scope is complete. Manual browser/mobile/device/BFCache UAT is NOT EXECUTED / tracked separately. Personal Weight Observation remains DEFERRED / NOT APPROVED FOR FIRST 17H SCOPE. 17G.4A, Family P17F-L04/L05, Q5 governance, parked 17E.2 consent, MED-02, and 17J remain unchanged.

## Historical delivery status — Phase 17H.3 implementation (2026-10-04, Asia/Bangkok)

**Phase 17H.3 — IMPLEMENTED / CLOSED. WELL-03 — IMPLEMENTED / TARGET-ONLY.** The runtime implements one current Patient-selected personal target in kg. Personal Weight Observation remains **DEFERRED / NOT APPROVED FOR FIRST 17H SCOPE**. Manual browser/mobile/device/BFCache UAT and production deployment were not performed.

### Follow-up UI correction — 2026-10-04

After `CREATE_CONSUMED`, a separate `requiresCurrentGoalReview` gate stays set until an authorized successful get-current returns an explicit Goal or null. Failed, unconfirmed, thrown, or incomplete reads keep the refresh/review UI and cannot expose an empty-state create action. An authoritative null permits an explicit new intent; only that action generates a fresh nonce. An authoritative Goal renders the current target instead.

Cancelling remove now marks focus restoration as pending; a post-commit effect focuses the remove opener after it mounts again, subject to the shared private authority still being active.

Regression tests reproduced both defects before the correction. Focused Weight/Wellness UI tests passed: **5 files / 25 tests**, including six new lifecycle cases. `npm run typecheck`, targeted ESLint, and `git diff --check` passed. The lifecycle harness models hook updates and ref attachment before effects; it does not claim browser/device focus UAT. Schema, migration, services, and PostgreSQL race architecture were unchanged, so PostgreSQL and broad suites were not rerun for this correction.

## Baseline and reconciliation

The actual starting HEAD was `9ae94e87955592fd462ba597d63db38778dd6533`, matching the expected baseline and containing the terminal-create-intent/owner-lock contract correction. No newer commits were present. The working tree contained in-progress 17H.3 implementation changes from this task; they were preserved and completed. No unrelated changes were intentionally included. The initial runtime was subsequently committed and pushed as `2bd58a4437415ae823a8cb37037df487b386c39a`. The follow-up UI correction started from that commit with a clean working tree.

## Scope and implementation

Implemented only the approved target-only capability under `/app/personal/wellness`:

- Patient-selected personal target: `targetWeightKg` required and `targetDate` optional.
- One current target per `PatientProfile`; explicit create, edit, and physical remove.
- No current-weight observation, measurement history, progress, BMI, advice, care/Goal Plan/Program linkage, or visibility outside exact Patient SELF.
- Wellness still has one shell item and three independent in-page sections: อาหาร, การออกกำลังกาย, เป้าหมายน้ำหนัก; Weight uses `#weight-goal`.

The dedicated `src/modules/weight-goals/` module contains strict decimal/date schemas, exact SELF resolution, read and mutation services, bounded FormData transport, action state, and Server Actions. The Wellness server page performs request-time reads for all three domains and renders no sibling private payload if any domain denies. Weight uses the existing parent `WellnessPrivateAuthority`, generation checks, mounted/request guards, actor remount key, pagehide invalidation, and BFCache reload behavior; it adds no independent privacy lifetime.

### Persistence

Added Prisma models `PersonalWeightGoal` and `PersonalWeightGoalCreateReceipt`, the optional `PatientProfile.personalWeightGoal` relation, and one forward migration: `20261004120000_personal_weight_goal`.

`PersonalWeightGoal` stores UUID id, unique immutable `patientProfileId` with Restrict ownership FK, Decimal(10,3) target, optional PostgreSQL DATE, and TIMESTAMPTZ(3) created/updated instants. Database checks enforce target `> 0` and `<= 1,000,000`, plus the DATE carrier range `0001-01-01..9999-12-31`. The unique owner constraint enforces 0..1 structurally.

`PersonalWeightGoalCreateReceipt` stores exactly owner UUID, submission nonce UUID, intended target UUID scalar locator, and created timestamp. Owner+nonce is the primary key; intended target ID is unique; owner FK is Restrict. There is deliberately no Goal FK, target payload, payload hash, rejection reason, status, or receipt TTL/pruning.

### Numeric and transport contract

`targetWeightKg` transport is a required string of 1..11 UTF-16 code units, with no trimming. The complete string must be ASCII `[0-9]{1,7}(?:\.[0-9]{1,3})?`; the implementation checks the matched substring equals the entire input so a final newline cannot pass JavaScript `$` behavior. Only `.` is accepted. Leading zeroes are allowed; `070` becomes `70`, `070.5` becomes `70.5`, `70.500` becomes `70.5`, and `000.001` becomes `0.001`. Fractional trailing zeroes and an empty decimal point are removed. No rounding or truncation occurs.

Accepted canonical range is **0.001..1,000,000 kg inclusive**, with at most three fractional digits. Zero, negatives, plus signs, `.5`, `70.`, exponent notation, commas, Unicode digits, overlong integer/fraction parts, trailing text, whitespace, Infinity, NaN, hexadecimal, and values above the maximum are rejected. The 1,000,000 cap is defensive storage/application hardening consistent with DEMI's structural-number convention; it is not a medically meaningful or UI-described weight limit.

The domain, action DTO, and client use canonical decimal strings. The server constructs `Prisma.Decimal` from the validated string and persists PostgreSQL `NUMERIC(10,3)`; Decimal instances never cross the client boundary. Equality compares canonical strings, and display uses the canonical value plus `กก.` without rounding, grouping, exponent notation, or forced fractional padding.

Strict FormData allowlists reject duplicate, unknown, File, owner, care, current-weight, progress, and other unapproved fields. Weight/date field limits are 11/10 UTF-16 code units; UUID is exactly 36; version token is at most 40; accepted business-field UTF-8 key/value total is at most 16 KiB. Framework `$ACTION_` fields follow the existing Meal/Exercise parser convention. Raw FormData and target content are not logged.

### targetDate

The optional date is a Gregorian `YYYY-MM-DD` civil date persisted as PostgreSQL DATE and interpreted against the server's Asia/Bangkok today. Missing/blank create date is null. Create permits today/future and rejects past. Edit checks owner and `expectedUpdatedAt` first. If the submitted date equals the persisted date, it is retained even if naturally past; a different non-null date must be today/future; blank explicitly clears it. The edit date control has no static `min`, so browser-local time or an existing passed date cannot block a valid weight-only edit. A passed date stays neutral and creates no lifecycle, reminder, progress, or authorization change.

### Authorization and transaction/concurrency design

Every read/mutation derives authority from authenticated actor to persisted ACTIVE User, persisted PATIENT role, exact Person binding, and exact PatientProfile. The client never supplies owner identity. Work roles do not widen SELF authority. Hospital MEMBER/OWNER, OSM/assigned OSM, Family/caregiver including appointment grants, routine ADMIN, inactive/suspended, revoked-role, invalid-binding, missing-profile, and other-Patient actors are denied.

Create, replay/reconciliation, edit, and remove use a Weight-local Prisma interactive transaction at explicit **ReadCommitted**, without automatic retry and without the Meal/Exercise Serializable helper. In that same transaction the service resolves SELF, locks exactly the derived PatientProfile row with typed parameterized `Prisma.sql` `SELECT "id" ... FOR UPDATE`, re-resolves SELF after lock acquisition, checks the same locked owner, then reads/writes receipt or target and audit. The owner lock is held through commit/rollback. Lock order is owner → receipt/goal → audit. Get-current freshly resolves persisted SELF and returns the current DTO or null.

### Terminal create receipts

Strict input/schema validation precedes business decisions. For an existing owner+nonce receipt, the service first looks up the receipt's intended Goal: if it still exists for that owner, the result is `REPLAY` with its current persisted DTO; if absent, it is `CREATE_CONSUMED`. Submitted replacement values and the new-create date rule are ignored for a valid replay.

For a new valid intent, the service checks create date against Bangkok today, generates an intended UUID, inserts a payload-free receipt while holding the owner lock, then checks slot occupancy. If occupied, receipt-only commit yields `CREATE_CONSUMED` and no Weight mutation audit. If empty, receipt, Goal with that intended ID, and one minimized created audit commit atomically as `CREATED`.

Same-nonce retries serialize to one receipt/at most one Goal. Different nonces racing for an empty slot yield one Goal, two receipts, and one created audit. The losing nonce remains consumed after the winner is removed and can never recreate a Goal; a fresh explicit intent after removal can create. Create/removal ordering follows the owner lock.

Only a committed decision is definitive. Transaction rollback, unique/deadlock/serialization or lock/timeout failures, receipt/audit failure, and commit acknowledgement ambiguity return `UNCONFIRMED`; the UI keeps the same nonce and original submitted draft for explicit same-intent retry. It does not rotate the nonce or automatically resubmit. A retry reconciles the committed receipt or evaluates the intent if the transaction truly rolled back.

### Edit, remove, and audit

Edit/remove require goal ID plus timezone-offset ISO `expectedUpdatedAt` with exactly three fractional digits. Owner-scoped lookup checks version before NOOP/date business validation. Current version plus canonical-identical values returns NOOP without version or audit change; stale identical input conflicts. Actual edit uses a guarded id+owner+version update and advances TIMESTAMPTZ(3) to at least previous+1ms; remove uses the same guarded predicate and physically deletes the one target. No upsert, target history, archive, undo, or restore path exists.

Audit actions are `personal_weight_goal.created`, `.updated`, `.deleted`, resource type `PersonalWeightGoal`. Audit writes use the transaction client and commit atomically with target mutation. Metadata omits all target content and PII. Reads, replay, NOOP, occupied rejection, and failed operations produce no Weight mutation audit. A receipt is technical terminal-intent state, not target history.

## Verification evidence

- Focused Weight/Wellness/Meal/Exercise unit and UI regression: **18 files / 225 tests PASS**. After the explicit unconfirmed-create hidden-field retry fix, Weight UI plus shared privacy tests: **2 files / 11 tests PASS**.
- Focused Weight PostgreSQL integration: **1 file / 24 tests PASS**. Focused Meal + Exercise PostgreSQL regression: **2 files / 55 tests PASS**.
- Full unit suite: `npm run test` — **214 files / 1,794 tests PASS**.
- Full disposable PostgreSQL verification: `node scripts/integration.mjs verify` — generated Prisma Client 6.19.3, dropped/recreated the repository's local disposable integration database, applied all **36 migrations** from an empty database including the Weight migration, ran **31 integration files / 445 tests PASS**, then shut down and removed the disposable container/network.
- `node_modules/.bin/prisma.cmd validate` — PASS. `npm run prisma:generate` — PASS; generation also passed within full disposable verification.
- `npm run typecheck` — PASS. `npm run lint` — PASS after a lint-discovered ref-safe props adjustment.
- Impeccable `detect` over the changed Wellness UI targets — PASS, no findings. Local Next.js 16.3.0 Server Actions/revalidation guide and Context7 Next/Prisma API references were reviewed; installed Prisma is 6.19.3.
- After the final naming-only comparison variable clarification, focused Weight unit tests (4 files / 54 tests), Weight PostgreSQL integration (1 file / 24 tests), typecheck, and targeted ESLint passed. The disposable DB was explicitly brought up, migrated, and shut down around this focused rerun.
- `git diff --check` — PASS.

The tests include decimal grammar/full consumption/canonicalization, Decimal/NUMERIC exact round-trip and DB checks, DATE and process-timezone handling, Bangkok midnight boundaries, passed-date retention, receipt persistence/replay/removal/rejected-nonce behavior, deterministic PostgreSQL owner-lock races and lock visibility, edit/remove stale races, SELF denial matrix/revocation, audit and receipt rollback, and shared three-domain Wellness invalidation/delayed-response protection.

## UAT, deployment, and deferred boundaries

Manual browser, real mobile/device, and physical BFCache UAT were **NOT EXECUTED**. Automated UI/lifecycle tests are not device certification. No production database was accessed; no production migration or deployment is claimed. Operational backup/restore and retention policy are not changed here.

Q69–Q74 semantics remain intact: personal target only; kg only; required target plus optional date; 0..1 current target without target history; no automatic current-weight source/progress; no Personal Weight Observation. BMI, scoring/advice, clinical review, sharing/export, Family/Hospital/OSM visibility, notifications/reminders, reporting, and Goal Plan/Program/care synchronization remain excluded. 17G.4A, Family P17F-L04/L05, Q5, parked 17E.2 consent, MED-02, and 17J statuses were not changed. Next: **Phase 17H.4A — Wellness automated re-audit / UAT readiness**.
