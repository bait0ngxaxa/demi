# Phase 17J.5A — LINE Integration Automated Re-audit and Synthetic UAT Readiness

**Status: PASS — AUTOMATED RE-AUDIT COMPLETE**

**Reviewed starting HEAD:** `1fcc038ea2bd9f0e10eba48d88671984cde49a2f` (`main`)

## 1. HEAD and scope

The starting working tree was clean and HEAD matched the last reviewed commit. This review covered the integrated Phase 17J.1 Link/Rich Menu, 17J.2 reactive messaging, 17J.3D staged disconnection boundary, and 17J.4B appointment notification implementation. It followed the accepted [ADR-0009](../adr/0009-demi-line-oa-liff-identity-and-messaging.md) and [17J.4A owner decisions](./PHASE_17J4A_OWNER_DECISION_CLOSEOUT.md).

The review stayed within the approved synthetic/demo boundary. No production/shared database was used. PostgreSQL tests used the repository's local disposable `demi_test` container, backed by an ephemeral container filesystem. No LINE request, real Patient data, provider/device UAT, credential or environment mutation, migration change, channel provisioning, deployment, or release was made. The local `.env` keeps `DEMI_LINE_DISCONNECTION_ENABLED=false`; the appointment notification flag is unset and therefore defaults OFF. Process-level rollout flags were unset.

The correction below changes only provider-outcome settlement and synthetic regression coverage. It adds no schema, enum, migration, role, or permission framework.

## 2. Findings by implementation boundary

### Phase 17J.1 — Account Link, Unlink, Rich Menu

- Link remains behind the authenticated DEMI session. The server verifies the LIFF identity against the configured LINE Login channel, binds the intent to the current DEMI user/session, and applies uniqueness/conflict checks transactionally. LINE identity does not create a DEMI session or grant a role.
- Role-aware Rich Menu projection is built from current eligible DEMI roles and active Hospital/OSM relationships. The neutral multi-role chooser changes presentation only; every operation still resolves server-side DEMI authority.
- Legacy Unlink commits local revocation and advances the binding lifecycle generation before post-commit provider Rich Menu cleanup. Cleanup failure leaves the binding revoked. A new Link cannot reuse the previous notification preference or retarget an old intent.
- Existing lifecycle-history and readiness-fallback fences still guard relink when the disconnection feature flag is OFF. Account Summary, reconciliation, and disconnection readiness have separate failure boundaries, so a readiness failure leaves ordinary local Unlink available for a loaded active binding.
- With disconnection disabled, the Account route takes the legacy local Unlink path. It does not invoke staged Full Disconnection/deauthorization. Rich Menu cleanup remains the existing legacy behavior. Recovery is not made available by a failed readiness check.

### Phase 17J.2 — Reactive messaging

- The webhook boundary validates LINE's signature against the raw request body before processing; durable receipts make duplicate event IDs idempotent.
- A reactive appointment request resolves one current binding from the LINE subject, then resolves that binding's DEMI user through current persisted roles and the Patient SELF query. A wrong/ambiguous binding or ineligible Patient receives no appointment projection.
- The Patient query is canonical and allowlisted. Reactive copy is limited to that user's approved appointment projection; infrastructure and provider failures do not fall back to a broader data path. Reply uses the short-lived Reply token once and enforces the local execution deadline.
- Hospital/OSM operational roles do not establish Patient SELF authority. The integration regression added in this phase removes the Patient role in PostgreSQL and confirms both reactive refusal and proactive suppression.

### Phase 17J.3D — staged disconnection boundary

- `DEMI_LINE_DISCONNECTION_ENABLED=false` remains the configured default and was not changed. The configuration service returns no active disconnection inventory while disabled.
- Legacy local Unlink remains usable, and lifecycle-history restrictions remain active independently of the flag. The focused Account UI and PostgreSQL lifecycle/orchestration checks pass.
- No MINI App channel/runtime/provisioning was introduced. No ordinary Link, Rich Menu, Account, or legacy Unlink action triggered staged provider deauthorization.
- The known S01 token-egress/privacy review remains open for real-provider UAT; no leak or external privacy approval is asserted here.

### Phase 17J.4B — Appointment notifications

- Only canonical appointment creation, actual scheduled date/time reschedule, and canonical cancellation write notification intents. Hospital-approved cancellation uses the same canonical path. Acknowledgement, cancellation-request, rejection, no-op cancellation, and creation-nonce replay do not create duplicate deliverable events.
- Appointment state and its intent share a serializable transaction. Database uniqueness fences duplicate source versions. With rollout OFF, source mutations create no notification rows; an enabled generation is explicit, and older generations are suppressed rather than replayed.
- Patient SELF opt-in defaults OFF and is tied to the current binding generation and preference version. At source and send time, the worker checks the exact appointment/source version, exact Patient-Hospital relationship, active Hospital, same active Patient User and PATIENT role, current binding, current opt-in, fresh FRIEND observation, and current rollout generation.
- The worker claims with `FOR UPDATE SKIP LOCKED`, bounded leases, and lease-token compare-and-set settlement. Provider I/O runs outside database transactions. Retry attempts keep the same recipient, exact generic copy, and retry key. In-flight external requests cannot be recalled.
- Worker invocation uses a signed, time-bounded request with persisted replay protection. The route accepts no payload and returns aggregate counts; logs contain only the same summary. Outbox rows contain only identifiers/versions needed to validate and deliver, not LINE subjects/tokens, appointment content, Hospital names, or rendered message payload.
- The approved proactive copy remains exactly: **“มีข้อมูลใน DEMI อัปเดตแล้ว กรุณาเข้าสู่ระบบ DEMI เพื่อตรวจสอบ”**. The separate reactive-message privacy approval does not expand proactive content.

## 3. Integrated authorization and data-flow assessment

Supabase Auth remains DEMI's authentication authority. Link intents are bound to that authenticated user/session; LINE IDs are only lookup/binding data. Reactive appointment access proceeds from a current LINE binding to the existing DEMI actor resolver and Patient SELF query. Proactive recipient IDs are captured from the exact appointment's Patient relationship and revalidated at dispatch. Current User status, PATIENT role, Hospital status, binding generation, preference, friendship observation, and appointment source version are checked before each attempt.

Cross-user replacement and suspended-Hospital integration cases suppress delivery. The added Patient-role-revocation case exercises both reactive and proactive paths against PostgreSQL. The Patient-Hospital relationship table has no separate active/suspended status field; appointments reference the exact relationship with restrictive referential integrity. No new relationship lifecycle semantics were inferred or added.

Hospital/OSM membership and assignment are only used to project eligible operational menus and authorize their existing operations. They are not consulted as substitutes for Patient SELF authority. Rich Menu state, LINE friendship, and LINE identity do not grant data access.

## 4. Transactional outbox, cutover, and concurrency assessment

The outbox is written with the source appointment transaction and has one unique source version. Nonce replay exits before another intent, and a failed intent insert rolls back the appointment change. Opt-out, Unlink, relink, source reschedule, identity replacement, inactive Hospital, stale friendship, disabled rollout, and generation change all prevent a later unauthorized Push. Previously captured recipient/binding generations cannot be reassigned.

`SKIP LOCKED` bounds ordinary concurrent claims. Lease expiry allows recovery; a stale worker cannot settle after a replacement lease because settlement compares the original token. Provider I/O is not held inside a database transaction. The worker rechecks authority after attempt reservation and just before provider invocation. The existing concurrency test covers an expired claim and stale-worker fencing; another covers a generation cutover while one provider call is already in flight.

The default rollout remains OFF, and a disabled period creates no deliverable outbox work. Each activation requires a new UUID generation; old-generation work is suppressed. There is no scheduled worker or automatic terminal purge. The existing purge remains an explicit operation capped at 100 terminal rows older than 30 days.

## 5. HTTP 429 and terminal outcome finding

**Finding confirmed and corrected.** Before this correction, three observed retryable HTTP failures (including three HTTP 429 responses) settled as `OUTCOME_UNKNOWN / PROCESS_OUTCOME_UNKNOWN`. That state implied uncertainty even though each provider response had been received.

Settlement now reuses the existing state/outcome values:

| Situation | Stored state | Stored outcome |
| --- | --- | --- |
| Bounded retries exhausted after known retryable HTTP responses, with no unresolved ambiguous attempt | `PERMANENT_FAILURE` | `TRANSIENT_HTTP_FAILURE` |
| Permanent provider 4xx rejection | `PERMANENT_FAILURE` | `PERMANENT_HTTP_FAILURE` |
| HTTP 2xx acceptance | `PROVIDER_ACCEPTED` | `ACCEPTED` |
| HTTP 409 for the same retry key | `PROVIDER_ACCEPTED` | `DUPLICATE_ACCEPTED` |
| Timeout/transport ambiguity that remains unresolved | `OUTCOME_UNKNOWN` | `AMBIGUOUS_TRANSPORT_FAILURE` |
| Provider attempt reserved but not yet settled | `CLAIMED` | `PROCESS_OUTCOME_UNKNOWN` |
| Worker/process outcome cannot be established after an expired final lease | `OUTCOME_UNKNOWN` | `PROCESS_OUTCOME_UNKNOWN` |

When an earlier attempt was already ambiguous, later 429/5xx responses preserve that ambiguity through retry and exhaustion; they cannot rewrite it as known retry exhaustion. The retry cap, retry-key identity, payload, delay policy, and provider attempt identity remain unchanged. `PERMANENT_FAILURE` means no further application retry will occur; `safeOutcome` distinguishes exhausted transient responses from provider rejection. No enum or migration was needed.

The adapter continues to retry HTTP 429 under the owner-approved bounded application policy, despite LINE's general retry guidance saying not to retry 4xx. The policy is not a provider delivery guarantee. LINE documents 429 for multiple quota/rate-limit situations and 409 as acceptance of the same retry key; see [LINE retry guidance](https://developers.line.biz/en/docs/messaging-api/retrying-api-request/) and the [Messaging API reference](https://developers.line.biz/en/reference/messaging-api/nojs/).

## 6. Corrections and new regression evidence

- Updated attempt reservation and `finishProviderOutcome` so a crash after reservation remains unresolved through lease recovery; known retry exhaustion is terminal failure, and recorded ambiguity cannot be overwritten by later retryable/permanent HTTP responses.
- Updated the existing three-response 429 PostgreSQL case to assert `PERMANENT_FAILURE / TRANSIENT_HTTP_FAILURE` and bounded attempts with one stable key/payload.
- Added PostgreSQL coverage that preserves an earlier ambiguous outcome through later rate-limit exhaustion; it remains `OUTCOME_UNKNOWN / AMBIGUOUS_TRANSPORT_FAILURE`.
- Added PostgreSQL coverage that leaves a reserved provider attempt unsettled, recovers its expired lease, and confirms later 429 responses cannot erase that ambiguity or let the stale worker settle.
- Added PostgreSQL coverage that distinguishes a permanent provider rejection from exhausted transient retries.
- Added PostgreSQL coverage that removes the current PATIENT role and verifies reactive refusal plus proactive suppression.
- No Prisma schema or migration was changed.

## 6.1 Cross-slice matrix evidence locator

The requested 38 checks reuse the following focused suites; this is a locator, not a claim that each scenario has a separate test case:

| Matrix cases | Focused evidence |
| --- | --- |
| 01–05, 22–23 | `tests/integration/line-account-linking.integration.test.ts` (authenticated Link, uniqueness, local-first Unlink, cleanup/relink lifecycle); `tests/integration/appointments.integration.test.ts` (opt-in, Unlink/relink fences); `src/modules/line/domain/line-projection.test.ts` and `src/modules/line/adapters/line-messaging-client.test.ts` (role projection and menu); `src/modules/appointments/domain/appointment-line-notifications.test.ts` (stale FRIEND, UNKNOWN and NOT_FRIEND fail eligibility). |
| 06–12 | `tests/integration/appointments.integration.test.ts` (current Patient role revocation, replacement identity, suspended Hospital); `tests/integration/line-account-linking.integration.test.ts` (mismatched LINE identity and absent DEMI session); `src/modules/line/adapters/line-webhook-security.test.ts`, `src/modules/line/services/line-webhook-service.test.ts`, and `src/modules/line/services/line-reactive-appointment-service.test.ts` (signed bytes, durable duplicate receipt, current binding, exact Patient query, deadline and one-reply failure handling). |
| 13–18 | `tests/integration/appointments.integration.test.ts` cases “persists only canonical appointment events…”, “keeps disabled-period mutations silent…”, and “rolls back an appointment when its enabled outbox intent cannot be persisted” (canonical create/reschedule/cancel, Hospital approval, nonce replay, rollback and uniqueness). |
| 19–25 | `tests/integration/appointments.integration.test.ts` cases “keeps disabled-period mutations silent…”, “suppresses stale, opted-out, unlinked, and relinked intents”, “suppresses an appointment intent when its Hospital is no longer active”, “suppresses a superseded source version…”, and “suppresses pending old-generation work…”; domain policy test above covers default OFF and reachability freshness. |
| 26–35 | `tests/integration/appointments.integration.test.ts` cases “allows only one active worker claim…”, “retries ambiguous Push outcomes…”, “bounds repeated temporary Push rate limits…”, “records a permanent provider rejection…”, “preserves an ambiguous Push outcome…”, “preserves an unobserved reserved attempt…”, and “authenticates internal worker invocations…”; `src/modules/line/adapters/line-messaging-client.test.ts` classifies 2xx, 409, 400, 429, 5xx and transport timeout. |
| 36–38 | `tests/integration/line-authorization-lifecycle.integration.test.ts`, `tests/integration/line-disconnection-orchestration.integration.test.ts`, `app/line/account/page.test.tsx`, and `app/line/account/line-account-client.test.tsx` cover disabled/staged lifecycle boundaries, local Account Unlink despite readiness failure, and fail-closed readiness presentation. All exercised Push/Reply dependencies in automated tests are fakes; no default configuration test called a live provider. |

The affected reachability policy test was rerun after adding the explicit `NOT_FRIEND` assertion; the 37-file aggregate suite was run before that test-only assertion, with the affected file then verified separately.

## 7. Automated verification at the reviewed source state

Passed:

- `npm run test -- src/modules/line src/modules/appointments app/line/account` — **37 files / 316 tests passed**.
- Focused original Phase 17J.4B unit set, including the post-`1fcc038` 429 adapter tests: `npm run test -- src/modules/appointments/domain/appointment-line-notifications.test.ts src/modules/appointments/services/appointment-line-notification-preference-service.test.ts src/modules/appointments/transport/appointment-line-notification-actions.test.ts src/modules/appointments/services/appointment-service.test.ts src/modules/line/adapters/line-messaging-client.test.ts app/line/account/page.test.tsx app/line/account/line-account-client.test.tsx` — **7 files / 79 tests passed**.
- `npm run test:integration:focused -- tests/integration/appointments.integration.test.ts` — **1 file / 24 tests passed** on the disposable local PostgreSQL target; 42 migrations found, no pending migrations.
- `npm run test:integration:focused -- tests/integration/line-account-linking.integration.test.ts` — **1 file / 26 tests passed**.
- `npm run test:integration:focused -- tests/integration/line-authorization-lifecycle.integration.test.ts` — **1 file / 30 tests passed**.
- `npm run test:integration:focused -- tests/integration/line-disconnection-orchestration.integration.test.ts` — **1 file / 34 tests passed**.
- `npm run test -- src/modules/appointments/domain/appointment-line-notifications.test.ts` — **1 file / 4 tests passed** after the explicit `NOT_FRIEND` fail-eligibility assertion was added to an existing test.
- `npm run typecheck` — passed.
- `npx eslint src/modules/appointments/services/appointment-line-notification-delivery-service.ts tests/integration/appointments.integration.test.ts` — passed.
- `npm run test:db:status` — confirmed the local `demi-integration` PostgreSQL 17 container was healthy before focused integration runs.

The combined focused evidence is 37 unit-test files / 316 tests and four PostgreSQL integration files / 114 tests. The 7-file unit set is a subset of the 37-file run and is recorded separately because it answers the original 17J.4B latest-HEAD evidence question.

Not run: full repository suite, production build, development server, browser/device UAT, live LINE, production/shared database, deployment, migration application outside the disposable container, or environment mutation.

## 8. Residual risks and separately gated work

- S01 remains a separate privacy/security gate: legacy LINE friendship verification places its access token in an outbound query. Runtime/APM/proxy/egress handling has not been externally verified here. No leak is claimed or disproved, and no privacy-controller sign-off is manufactured.
- Real LINE Push, real-provider/device UAT, deployed flag/generation activation, provider authorization mutation, and production use remain **NOT AUTHORIZED / NOT EXECUTED**. Synthetic fakes cannot establish provider/device behavior.
- A crash or timeout after dispatch can leave a genuinely ambiguous external outcome. Retry keys reduce duplicate execution within their provider window but do not guarantee visible delivery or recall.
- Terminal-row deletion is manual, not scheduled. Fingerprint retention/erasure, cross-account reconciliation, and Full Disconnection/Recovery activation remain separate nonblocking production/UAT work.
- Medication/follow-up reminders, request-decision notifications, Family/OSM/Hospital recipients, and broader consent remain outside this approved appointment-only slice. P17D-NOTIF-01 stays open for those unresolved requirements and gates.

## 9. Synthetic readiness conclusion

**PASS — AUTOMATED RE-AUDIT COMPLETE.** No unresolved BLOCKER or MAJOR finding remains in this bounded source and synthetic-test review. Existing Link/Unlink, scoped reactive messaging, default-OFF proactive delivery, transactional source capture, current Patient SELF checks, bounded retry, and staged disconnection isolation have current automated evidence.

This is automated/synthetic readiness only. Manual synthetic browser walkthrough, real-provider/device UAT, production readiness, and confirmed user delivery are not claimed.

## 10. Deferred UAT and next roadmap phase

- **Phase 17J.5B — Real LINE/device UAT:** separate, unexecuted, approval-gated activity. Do not start automatically. It first requires explicit authorization and resolution of the applicable operator, privacy, target-isolation, credential, and device gates, including S01.
- **Next planned development phase: Phase 17K — Responsibility areas and hospital operational extensions.** This is the roadmap successor after 17J.5A; implementation is not yet clear to start. `OWNER-01` requires owner decisions on editable workforce fields and whether responsibility-area assignment belongs in the slice. `AREA-01` requires an approved taxonomy, owner, relationship, hierarchy/inheritance, authorization impact, and reporting use. Until those decisions exist, limit work to recording/closing those requirements; do not invent or approve Hospital governance rules.
- Continue the existing delivery strategy: finish decision-cleared development phases before beginning the comprehensive customer requirement gap review. That gap review was not started in 17J.5A.
