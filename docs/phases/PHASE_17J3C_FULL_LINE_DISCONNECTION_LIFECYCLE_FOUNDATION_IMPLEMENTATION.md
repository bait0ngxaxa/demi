# Phase 17J.3C — Full LINE Disconnection Lifecycle Foundation

- Date: **2026-10-08**. Baseline main/origin: **9af86fb3ee0dcdabe62cade1a68545bf657cf054**; initially clean.
- Verdict: **GO — FOUNDATION IMPLEMENTED / AUTOMATED VERIFICATION COMPLETE / USER-FACING ACTIVATION STAGED**.
- [17J.3B](./PHASE_17J3B_MINI_APP_WORKFLOW_TECHNICAL_CONTRACT.md) remains **TECHNICAL CONTRACT COMPLETE / REVIEWED / CLEARED FOR IMPLEMENTATION**. Its [section 23.1](./PHASE_17J3B_MINI_APP_WORKFLOW_TECHNICAL_CONTRACT.md#231-full-line-integration-disconnection--final-lifecycle-contract), [owner closeout](./PHASE_17J3A_LIFF_WORKFLOW_SESSION_DECISION_CLOSEOUT.md) and [ADR-0009 amendment](../adr/0009-demi-line-oa-liff-identity-and-messaging.md#full-disconnection-amendment--2026-10-08) remain authoritative.
- This implements durable domain/transaction foundations. **Complete Full Disconnection, remote LINE removal, Recovery UI, MINI gateway/scoped Appointment workflow, device UAT and production deployment are NOT implemented/executed.**

## 1. Implemented persistence

[Prisma schema](../../prisma/schema.prisma) and additive [migration](../../prisma/migrations/20261008120000_line_authorization_lifecycle/migration.sql) introduce one LINE-owned `LineAuthorizationLifecycle` table. Binding remains local access authority; lifecycle rows represent external evidence and release eligibility only.

| Persisted group | Implemented boundary |
| --- | --- |
| `id`, `bindingId`, `bindingVersion` | UUID; binding FK RESTRICT; positive generation; composite uniqueness `(bindingId, bindingVersion, tupleKey)`. No second owner/subject/session model. |
| `tupleKey`, `tupleDefinition` | SHA-256 key plus canonical immutable JSON string containing only Provider reference, Account/MINI kind, channel ID, internal environment and deployment reference. PostgreSQL checks format, tuple/key consistency and channel/environment pairing. The definition remains interpretable when configuration changes; no credential values. |
| `applicability`, `evidenceReference`, `observedAt` | OBSERVED / UNKNOWN / PROVEN_ABSENT with bounded sanitized reference. Observed grants have an observation timestamp. Unknown historical grants never become absent from missing rows. |
| `remoteOutcome`, `requestedAt`, `confirmedAt`, `reason` | OBSERVED / PENDING / REMOTE_UNCONFIRMED / REMOTE_CONFIRMED. Requested generation is separate from connected observation. Foundation initializes unavailable-provider work as REMOTE_UNCONFIRMED/TOKEN_UNAVAILABLE. |
| `attemptId`, `reservedAt`, `settledAt` | One unique immutable reservation, created before any future dispatch. ATTEMPT_RESERVED is conservatively possibly submitted; explicit ambiguous results remain unsettled. Definitive results retain their reason/time. No slot reuse. |
| `recoveryReleasedAt`, `recoveryDecisionAuditId` | Paired release timestamp and RESTRICT AuditEvent FK. Orthogonal to provider outcome; immutable after release. Indexed audit FK; binding FK lookup covered by composite index. |

CHECK constraints enforce nullable pairs, confirmation evidence and timing. A narrow SECURITY INVOKER trigger fences generation/tuple/request identity, attempt reuse, settled outcomes and release provenance. A new reservation on a released/historical generation is rejected; late results on an existing old attempt remain possible. RLS has no Data API policy; no public function EXECUTE or new client grants. Existing public-schema hardening remains applicable.

Existing `LineAccountActionIntent` adds RECOVERY plus optional target binding/version/set digest with an all-or-none action-specific constraint and RESTRICT target FK. Legacy LINK/UNLINK rows stay unchanged and readable. No data backfill, credential persistence, destructive migration or live provider call occurs during migration. A new `recordAuditEventWithId()` seam shares the existing audit validation/persistence; `recordAuditEvent()` retains its `Promise<void>` API.

## 2. Trusted inventory and legacy applicability

[Inventory/domain rules](../../src/modules/line/domain/line-authorization-lifecycle.ts) require one Account tuple, at most eight configured tuples per reviewed manifest, valid independent Account/MINI environments, unique tuples and an explicit reviewed exclusion reference if no MINI is listed. This is server/operator configuration, never end-user authority. **No production inventory or real channel IDs are introduced in this slice.** Test tuples are synthetic. Actual Console inventory, Provider ownership and exclusions require operator verification in the next slice.

Legacy binding without observation creates Account UNKNOWN: historical authorization may exist, current grant activity is not asserted. A provisioned MINI tuple without observation is UNKNOWN. An explicit never-exposed deployment exclusion can create PROVEN_ABSENT; historical observed/unknown evidence cannot be erased by a later configuration exclusion. Account-only manifests require no MINI token/consent/launch; the exclusion reference is audited without inventing a MINI channel row.

Initialization selects one latest historical row per retained tuple and creates only missing current-generation obligations, in tuple order. Old tuple definitions/history survive inventory changes. Repetition creates neither duplicate obligations nor duplicate initialization audit. There is no lifetime history-count cutoff that permanently prevents unlink. Legacy revoked bindings can initialize deterministically in recovery preparation, under owner/binding locks, without another lifecycle increment or provider I/O.

## 3. Local unlink composition and state transitions

[Account service](../../src/modules/line/services/line-account-service.ts) accepts an optional **server-only dependency** `authorizationInventory`; no HTTP transport or environment flag supplies it today. With reviewed inventory, the existing Serializable unlink callback performs User lock -> intent lock/validation -> binding UPDATE/version increment -> ordered lifecycle initialization -> intent consumption -> unlink audit -> atomic commit. User eligibility/session-bound challenge/expiry/replay and retained ownership policy remain unchanged. Any database/audit/validation failure rolls back local binding, obligations, intent and audit. No provider I/O occurs in this callback.

The staged link seam records Account observation after verified binding match, including ALREADY_LINKED; matched new links/relinks keep existing version/conflict semantics. MINI observation requires current ACTIVE owner and exact current ACTIVE binding generation. It does not create a workflow context or Patient authority.

| Domain transition | Observable result |
| --- | --- |
| Verified matched observation | OBSERVED in current connected generation; no external removal claim. |
| Local unlink | Binding revoked/version advanced; new obligations REMOTE_UNCONFIRMED when adapter/token unavailable. Previous LINE authority cannot reuse that version; ordinary credentials remain independent. |
| Attempt reservation | Unique attempt plus ATTEMPT_RESERVED/REMOTE_UNCONFIRMED; restart/crash is uncertain, not a no-send guarantee. |
| Explicit ambiguous result | POSSIBLY_DISPATCHED/INVALID_RESPONSE remains REMOTE_UNCONFIRMED, unsettled; recovery eligible immediately, no redispatch. |
| Definitive failure/no-send | PROVIDER_REJECTED/KNOWN_NOT_DISPATCHED settles that attempt but remains REMOTE_UNCONFIRMED; slot still cannot be reused. Invalid token is not success. |
| Correct adapter evidence | PROVIDER_204 with exact binding/version/tuple/attempt settles REMOTE_CONFIRMED. No live adapter supplies this evidence here; tests simulate it. |
| Authorized recovery release | Separate release/audit markers; remote evidence remains unchanged. Derived status RECOVERY_RELEASED_UNVERIFIED, including after a late 204. |

No global/full/partial status enum is persisted. PENDING is representable for subsequent orchestration; foundation does not claim a running external operation. A `true` pre-dispatch recheck is only for the original reservation holder, never permission to redispatch a saved attempt. Only a future channel-correct adapter can execute the single send, after transaction close.

## 4. Recovery authorization foundation and Relink evaluator

[Lifecycle service](../../src/modules/line/services/line-authorization-lifecycle-service.ts) exposes transaction-compatible preparation/release/evaluation, not an HTTP endpoint. Preparation binds all unsatisfied requested rows across retained generations to the current revoked binding and reviewed inventory digest. Fresh inventory/new rows/current generation changes invalidate an old preparation. Confirmed/excluded/released rows do not need another release.

`authorizeLineRecoveryDecision()` requires an explicit trusted server authority implementation. It runs **outside the database transaction** and returns a process-local opaque capability held in a WeakMap. There is no default permissive verifier; serialized/forged `{verified:true}` cannot release anything. The future LINE orchestrator must combine Auth-owned captured same-JWT live-session assertion, challenge verification, explicit risk acknowledgement, manual review and fresh correct-channel LINE proof. **The existing `getCurrentLineSession()` is not upgraded or treated as that liveness assertion.** Legacy intent creation explicitly rejects RECOVERY; existing HTTP input continues to allow only LINK/UNLINK.

Release rechecks ACTIVE retained owner, revoked/current binding generation, exact RECOVERY intent/expiry/unused state, inventory/complete row-set digest, manual-review coverage/categories, existing session/challenge hashes, retained fingerprint/key ID, expected proof tuple, fresh verification after intent creation, unexpired proof and acknowledgement timestamp. Live-session capture must be no more than the existing ten-second interactive budget old at commit; proof/acknowledgement stay within the existing five-minute intent bound. This bounds local authorization evidence, not LINE request settlement. Expired capture requires another live assertion.

The same transaction records bounded scalar audit provenance (policy/copy version, set digest/count, matched proof/session times/results, acknowledged risk and per-row manual-review category), writes release markers and consumes intent. No binding/session/Patient scope is created. No old access token is required at this persistence boundary; a future recovery interaction must still obtain fresh current identity proof. Tests supply explicit trusted fixtures only. Production proof/liveness/acknowledgement orchestration is deliberately absent, so this method is unreachable from a client.

`evaluateLineRelinkEligibility()` checks all requested generations of the retained binding. Applicable rows must be remotely confirmed with settlement, PROVEN_ABSENT, or explicitly recovery-released. Missing current-generation records on a legacy revoked binding deny the final-policy evaluator until lazy initialization/recovery. An active binding with unresolved older rows is also ineligible: future activation must check **before** LINK intent/controlled launch and **before ALREADY_LINKED or final reactivation** inside the linking transaction. Caller must own User/binding locks. These restrictions are **not activated** in this slice.

Recovery is immediate after explicit failure/unavailability. A reservation with no observed result becomes eligible after its recorded ten-second interactive budget; this is a crash-recovery bound, not a provider drain cooldown. Attempt slot remains immutable; no automatic retry/worker. Intent issuance rate/Origin/body limits and complete self-service UI must be composed in the next slice using existing five-per-five-minute management rules; preparation alone does not issue an intent or bypass those gates.

## 5. Concurrency and late-provider safety

Mutation ordering remains **User -> existing intent when applicable -> binding -> lifecycle rows ordered tupleKey/id -> audit**. Initialization creates sorted missing rows under the existing owner/binding locks; prior tuple evidence is immutable. Historical completion locks the original owner/binding and matches old binding/version/tuple/attempt, without a current-generation write. Menu reconciliation uses its existing separate leases/locks and never acquires User locks after lifecycle locks. No new service opens a nested transaction or performs network I/O under locks.

Real PostgreSQL interleavings revealed Prisma 6.19.3 surfaces raw-lock serialization failure as **P2010/meta.code=40001**, rather than P2034. [Serializable helper](../../src/lib/db/serializable-transaction.ts) now recognizes only that additional rollback-safe SQLSTATE, preserving the existing P2002/P2034 behavior and two-retry limit. Other raw-query/validation failures are not retried. Each callback rereads state; stale generation reservation/observation/release denies after retry.

Old ambiguous request A can still invalidate a new external grant B after recovery. DB fences, timers, acknowledgement and local retry cancellation cannot prevent that LINE effect. Foundation preserves the old attempt/release audit, rejects local authority mutation and future redispatch, and retains RECOVERY_RELEASED_UNVERIFIED after late 204. Current proof failure/safe reconnect UX and the unchanged absolute `min(15 minutes, verified proof expiry)` scope bound belong to the next runtime slices; no immediate external-withdrawal detection or expanded clinical access is claimed here.

## 6. Activation boundary

| Surface | Current result |
| --- | --- |
| Existing Account LIFF/link/unlink routes | Legacy local binding behavior remains active, including same-owner Relink, normal credentials and existing Rich Menu cleanup. No new pending lock or remote-success message. |
| Optional Account transaction seam | Implemented and exercised on PostgreSQL via trusted dependencies; no production route/config consumer. |
| Lifecycle observation/attempt/recovery/evaluator | Implemented/tested server-only domain APIs; no public endpoint, dispatcher or production authority implementation. |
| Complete Full Disconnection/status/Recovery | STAGED / NOT ACTIVE. Existing product path is still legacy local-only until next activation slice; this handoff is not a full-feature completion claim. |
| MINI/Appointment/Rich Menu/Family/J2 | No new gateway, audience verifier, scope, Appointment integration, menu asset/action, Family authority or messaging behavior. |

**Removal point:** recommended **Phase 17J.3D — Account Full Disconnection orchestration, channel inventory/provider adapter, live exact-session Recovery and user-facing activation**. Enable the inventory seam, pending guards and truthful status together only after executable self-service recovery exists and its authorization/provider tests pass. Do not allow an environment switch to enable guards ahead of that flow. No runtime activation, provisioning or deployment is authorized by this completion report; no subsequent phase starts automatically.

## 7. Verification executed

| Check | Actual evidence |
| --- | --- |
| Schema/client | Prisma 6.19.3 generate and validate PASS. Installed version retained; no package/lockfile changes. |
| Populated migration | Fresh disposable PostgreSQL 17: apply previous 40 migrations, seed synthetic legacy Account binding/LINK intent, apply migration 41, compare full binding and legacy intent fields exactly, confirm zero fabricated lifecycle grants: PASS. Temporary harness removed after verification. No production/unidentified DB. |
| Focused unit/regression | `npm run test -- src/modules/line src/lib/db/serializable-transaction.test.ts src/modules/audit/services/audit-service.test.ts src/modules/auth/services/password-login-identity-service.test.ts src/modules/auth/schemas/login-schema.test.ts src/lib/auth/supabase-server.test.ts src/modules/patient-self/policies/patient-self-policy.test.ts`: **25 files / 196 tests PASS**. |
| Final recovery boundary | `npm run test -- src/modules/line/services/line-authorization-lifecycle-service.test.ts`: **5 tests PASS**, including current-revoked-only recovery availability after the final evaluator correction. These overlap the broader regression set; counts are not added together. |
| New PostgreSQL foundation | `npm run test:integration:focused -- tests/integration/line-authorization-lifecycle.integration.test.ts`: **30 tests PASS**; database constraints, per-channel/legacy applicability, atomic unlink/replay/rollback, reservation/no-retry/crash, correct/failure/ambiguous results, recovery authority/session/fingerprint/challenge/coverage/expiry/replay, retained history/new generations and deterministic concurrency. |
| Existing Account PostgreSQL | `npm run test:integration:focused -- tests/integration/line-account-linking.integration.test.ts`: **26 tests PASS**; retained ownership conflicts, existing intents/session/audit and menu cleanup/relink behavior. |
| Static checks | `npm run typecheck`, `npm run lint`, final affected ESLint, documentation links/UTF-8 and `git diff --check`: PASS. |
| Not executed | Full repository suite, production build/dev server, Supabase disposable-session reattestation, live LINE deauthorization, real device/provider UAT, production migration/deployment. |

Windows reserved TCP range prevented the committed integration port 55432 from reaching WSL. A temporary loopback bridge at 45432 forwarded only to the newly created disposable `demi_test` container; DATABASE_URL/DIRECT_URL/DEMI_TEST_DATABASE_URL all matched that local target and existing harness safeguards stayed intact. No repository environment/configuration changed. Bridge, temporary scripts and disposable container/network were removed at completion.

The initial deterministic concurrency tests failed on the real raw-lock serialization mapping, corrected above; final tests pass. Simulated 204/late effects verify DEMI state fencing, **not undocumented LINE guarantees**. No unresolved foundation defect remains. External inventory/credential verification, complete Auth/session/LINE Recovery orchestration, status UI, safe late-permission-loss UX, real provider/device tests and retention/deployment governance remain activation gates. B17J3-01/02/03 remain closed at their prior evidence levels; no reattestation need or expanded Patient authority was introduced.

## 8. Delivery scope

Changed schema/migration, LINE lifecycle domain/service/tests, narrow Account composition, audit-ID seam/tests and Serializable raw-conflict handling/tests; updated [CONTEXT](../CONTEXT.md) and this handoff. No runtime endpoint, credentials, raw proof/session persistence, Patient domain change, new dependencies, worker, provider mutation or deployment. Git delivery does not activate the staged user-facing workflow or apply the migration to a deployed database.
