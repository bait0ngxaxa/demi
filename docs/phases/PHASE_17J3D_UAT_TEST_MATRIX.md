# Phase 17J.3D — Account LINE UAT execution matrix

Prepared 2026-10-09 against 53e0d0fa36254b3181b5e077d59e177f957f3e6d. **Preparation only: no provider/browser/device cases executed.** See [preflight entry gates](./PHASE_17J3D_UAT1_ACTIVATION_READINESS_PREFLIGHT.md) and [Thai operator guide](./PHASE_17J3D_UAT_OPERATOR_SETUP_GUIDE.md). CONDITIONAL GO for preparation does not authorize activation, deployment, migrations, consent or deauthorization.

## 1. Execution controls and evidence conventions

G0: all preflight entry gates plus explicit owner authorization must be satisfied. Every manual/provider/device case below is **BLOCKED (G0), NOT EXECUTED**, not PASS or observed FAIL. On actual execution replace status with PASS / FAIL / BLOCKED and record date, tester, deployment SHA, environment, evidence reference and disposition. Verify expected persistence through an approved read-only UAT evidence view/query; never expose a client endpoint accepting privileged outcomes.

Test identities: A/B are permitted disposable ACTIVE DEMI users; L-A/L-B are two owner-approved LINE identities. Only synthetic Patient fixtures. A maps to L-A through normal Link; different-owner conflicts use explicitly retained synthetic history. No real users, Patient records or non-test authorizations. G0 determines the actual targets; no IDs/credentials are embedded here.

Modes: REAL = authorized provider interaction; DEVICE = actual browser/device; HARNESS = existing mocked adapter/controlled disposable integration fixtures, never forced faults/load/races at LINE. Injected faults require a separately approved isolated harness; no runtime patch or external test is performed in this task. To check DB concurrency later, approve disposable DB setup/migrations/fixture mutation explicitly; the standard harness is not read-only.

Persisted evidence codes (use test aliases, not raw IDs):

- OBS: active Binding/current lifecycleVersion and Account OBSERVED row after successful enabled Link; no invented MINI observation.
- LR: Binding.unlinkedAt set, lifecycleVersion advanced once, roles/menu authority reset, UNLINK intent consumed and line.account.unlinked audit; current channel termination rows requested atomically.
- RS: exact old binding/version/tuple gets one immutable attemptId/reservedAt; no second dispatch/reservation slot reuse.
- RC: only adapter204 records old row REMOTE_CONFIRMED, PROVIDER_204, confirmedAt=settledAt, exact historical attempt result audit.
- UN: REMOTE_UNCONFIRMED, no confirmedAt; TOKEN_UNAVAILABLE when no attempt, KNOWN_NOT_DISPATCHED for failed pre-send verification, PROVIDER_REJECTED settled on400/401/403, POSSIBLY_DISPATCHED unsettled after submitted timeout/429/5xx/unexpected result. No local restore.
- RI: five-minute RECOVERY intent contains server-selected target/version, keyed exact-session hash, challenge hash and reviewed set digest. No token persistence.
- RR: recoveryReleasedAt + recoveryDecisionAuditId committed atomically, intent consumed, immutable line.lifecycle.recovery.released/per-row audit; prior remote attempt/outcome unchanged. No new Binding/session/Patient scope.
- NC: rejected request makes no successful transition/release; earlier LR/RS/history remains intact. Some denied operations can consume a conflict intent per existing contract; never interpret that as success.
- NB: separate explicit Link succeeds with fresh channel proof/current intent, advances/reactivates only same-owner retained history; accepted old outcome cannot overwrite it.

Sanitized proof codes: UI = redacted screenshot/accessibility/status transcript; HTTP = method/path/status/time only, no headers/body/query; DB = alias/version/state/timestamp/audit-type comparison without raw identity/session IDs; LINE = tester-witnessed Authorized apps/consent state, cropped private information; AUTH = same/different-session boolean + safe denial category, never JWT; PRIV = reviewed logging config/canary result, never raw HAR. Correlation handles stay private if needed; public evidence uses aliases. HTTP204 proves only the targeted channel; LINE screen alone does not prove provider settlement.

Retest instructions apply to every row through the final column:

- T1: use a fresh permitted test generation/intent after normal state review; follow explicit Recovery then separate Link if needed. Never redispatch the old attempt to reset a test.
- T2: recreate only the named fault in the isolated mock/disposable harness, then rerun the affected targeted test. No live outage/load/credential manipulation.
- T3: correct account/session through normal DEMI/LINE login, prepare a fresh intent and repeat the negative plus valid control; no account switching workaround.
- T4: repeat on the same recorded device/browser/version after closing stale views; verify refresh/back state from server. Also retest affected core flow on Android/iOS.
- T5: restore reviewed config/schema/privacy first under separate authorization; then run readiness inspection and affected core cases. Do not delete pending evidence.

Failed case severity: CRITICAL = wrong identity/owner/Patient authority, token disclosure, or old request mutating new local authority; HIGH = local revocation/integrity/recovery/guard failure or false confirmed removal; MEDIUM = availability/cookie/navigation/accessibility/UX defect without authority disclosure. Escalate if observed consequences exceed listed severity. Stop on CRITICAL/HIGH safety failure; sanitize evidence and leave gates/states under the approved incident plan, never clear rows to continue.

## 2. Automated evidence — separate from UAT

| ID | Coverage / execution source | Actual evidence | Result / limit |
| --- | --- | --- | --- |
| AUTO-01 | Account adapters/configuration/lifecycle/LINE unit tests | Current preflight focused command in report | PASS, included within 36 files/314; provider mocks only |
| AUTO-02 | Exact Auth JWT, SSR/proxy, Recovery HTTP strict schemas/Origin/error paths | Same current focused command | PASS, included within same 314, not additional count |
| AUTO-03 | Thai Account/Recovery rendering/interaction/duplicate/friendship UI | Same current focused command | PASS, source interaction mocks; no device evidence |
| AUTO-04 | Auth login/Family return and Patient SELF policy regression | Same current focused command | PASS, source tests; no real browser login |
| AUTO-05 | Orchestration + lifecycle + Account PostgreSQL/concurrency | 17J.3D handoff: 34 + 30 + 26 | DOCUMENTED 90 PASS; NOT RUN in preflight; container absent |
| AUTO-06 | Typecheck/full lint | npm run typecheck; npm run lint -- --max-warnings 0 | PASS, not provider/environment certification |
| AUTO-07 | Historical full repository suite | 17J.3D: 2,350 PASS / four FAIL | Full-green NOT VERIFIED; strict-schema focused now passes; historical Patient-import timeout classification retained |

## 3. Authorized provider happy path

Run H01–H08 first on one controlled target after G0; Account-only fixture requires reviewed MINI exclusion, not a missing configuration assumption.

| ID / mode | Preconditions | Operator action | Expected result | Persisted evidence | Sanitized proof | Result | Severity | Retest |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| H01 REAL/DEVICE | A ACTIVE, target approved | Ordinary DEMI credential login | Correct canonical A; no LINE-derived DEMI login | No new Binding/Patient authority | UI, AUTH, HTTP | BLOCKED G0 | CRITICAL | T3 |
| H02 REAL/DEVICE | H01; Account LIFF/scopes reviewed | Open Account LIFF and explicitly login L-A | Fixed channel proof available; no binding until Link confirmation | No OBS from LIFF login alone | UI, LINE | BLOCKED G0 | CRITICAL | T1 |
| H03 REAL/DEVICE | H02; no retained conflict/pending | Prepare LINK, confirm normally | A linked to L-A, fresh proof verified | OBS, LINK consumed/audit | UI, HTTP, DB | BLOCKED G0 | CRITICAL | T1 |
| H04 DEVICE | H03 | Reload Account and verify allowed entry | Current binding truth; Patient access only with persisted SELF | OBS unchanged; no new role from LINE | UI, DB | BLOCKED G0 | CRITICAL | T4 |
| H05 REAL/DEVICE | H03; valid transient same-channel token | Confirm Full Unlink notice | Explains records remain; local revoke commits before external send | LR then RS | UI, HTTP, DB | BLOCKED G0 | HIGH | T1 |
| H06 REAL | H05; target provider accepts request | Observe sanitized deauthorize status; inspect Account permission without reopening app | Real204 for Account only; old LINE local authority stopped | RC; LR remains | HTTP, DB, LINE | BLOCKED G0 | HIGH | T1 |
| H07 DEVICE | H06; reviewed no-MINI case | Reload status; normal DEMI login | Honest confirmed app status, records/ordinary authority intact | RC unchanged; no automatic Link | UI, DB, AUTH | BLOCKED G0 | HIGH | T4 |
| H08 REAL/DEVICE | All relevant rows satisfied | Initiate separate explicit Relink | Normal confirmation/identity/conflict checks; fresh consent possible | NB/OBS, old RC retained | UI, LINE, DB | BLOCKED G0 | CRITICAL | T1 |

## 4. Failure paths and transaction controls

Live-provider cases must not force LINE errors. Wrong-channel/expired tokens and HTTP error classes use synthetic harness fixtures; if an actual error occurs during permitted UAT, record it safely without retries. HARNESS rows are the planned next-phase reproducible checks, not a claim they ran live here.

| ID / mode | Preconditions | Operator action | Expected result | Persisted evidence | Sanitized proof | Result | Severity | Retest |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| F01 REAL/DEVICE | Active A binding; external browser without LIFF token | Confirm Unlink with intent/challenge only | Local success and Recovery continuation, no required fresh consent | LR + UN/TOKEN_UNAVAILABLE, no RS | UI, DB, HTTP | BLOCKED G0 | HIGH | T1 |
| F02 HARNESS | Active synthetic binding; expired token fixture | Submit valid Unlink intent with expired transient proof | Local success; no deauthorize | LR + RS/UN known-not-dispatched | DB, HTTP | BLOCKED G0 | HIGH | T2 |
| F03 HARNESS | Synthetic token for other audience | Submit Unlink; verifier returns wrong client_id | No deauthorize; no MINI consent required | LR + UN; no RC | DB, HTTP | BLOCKED G0 | CRITICAL | T2 |
| F04 HARNESS | Token subject L-B; retained L-A | Submit Unlink | Local revoke succeeds; targeting mismatch stops remote send | LR + UN; no RC | DB, HTTP | BLOCKED G0 | CRITICAL | T2 |
| F05 HARNESS | Post-send timeout fixture | Commit Unlink then delay provider beyond budget | Finite response/pending or Recovery; never undo local revoke or retry | LR + RS + UN/POSSIBLY_DISPATCHED, unsettled | HTTP timing, DB, UI | BLOCKED G0 | HIGH | T2 |
| F06 HARNESS | Deauthorize returns400 | Execute bounded attempt | Not remote-confirmed, even if already withdrawn | LR + UN/PROVIDER_REJECTED settled | DB, HTTP | BLOCKED G0 | HIGH | T2 |
| F07 HARNESS | Deauthorize returns401 | Execute bounded attempt | Credential failure sanitized; local revoke intact | LR + UN/PROVIDER_REJECTED, no RC | DB, HTTP | BLOCKED G0 | HIGH | T2 |
| F08 HARNESS | Deauthorize returns403 | Execute bounded attempt | Authorization failure, no success claim | LR + UN/PROVIDER_REJECTED | DB, HTTP | BLOCKED G0 | HIGH | T2 |
| F09 HARNESS | Deauthorize returns429 | Execute one attempt, no load generation | Unconfirmed; no auto retry | LR + UN/POSSIBLY_DISPATCHED unsettled | DB, HTTP | BLOCKED G0 | HIGH | T2 |
| F10 HARNESS | Deauthorize returns5xx | Execute one attempt | Unconfirmed; ordinary login/local revoke preserved | LR + UN/POSSIBLY_DISPATCHED | DB, HTTP | BLOCKED G0 | HIGH | T2 |
| F11 HARNESS | Malformed verification/credential or unexpected final response | Inject separately at named boundary | Pre-send failure does not dispatch; unexpected submitted response not success | UN known-not-dispatched before send; possibly-dispatched after | HTTP, DB | BLOCKED G0 | HIGH | T2 |
| F12 HARNESS | Secret absent fixture, healthy inventory/Auth | Unlink then run valid Recovery control | No deauthorize; Recovery not blocked by secret absence | LR + UN; RI/RR with correct proof | DB, UI | BLOCKED G0 | HIGH | T2 |
| F13 REAL/DEVICE | One valid Unlink already consumed | Repeat same form/request deliberately once | Safe error/reload; no duplicate local version or remote send | LR/RS count unchanged, no second audit success | HTTP, DB, UI | BLOCKED G0 | HIGH | T1 |
| F14 DEVICE/HARNESS | Valid Unlink confirmation | Double tap/send two concurrent same-intent requests | At most one success, stable status and finite feedback | One LR, at most one RS | UI, HTTP, DB | BLOCKED G0 | HIGH | T4 |
| F15 HARNESS | Reservation created; crash before outcome | Stop controlled invocation/restart, revisit status | Conservative pending; Recovery after bounded eligibility; no redispatch | RS preserved; original outcome not fabricated | DB, HTTP timing | BLOCKED G0 | HIGH | T2 |
| F16 HARNESS | Provider verification/credential unavailable before send | Unlink with token | Local commit does not depend on provider; no confirmation | LR + UN; no RC | DB, HTTP | BLOCKED G0 | HIGH | T2 |
| F17 HARNESS | Active owner; invalid Origin/oversized/extra fields | POST each boundary violation without valid authority | Deny exact-origin/body32KiB/strict schema; no reflected secret | NC | HTTP, PRIV | BLOCKED G0 | CRITICAL | T2 |
| F18 HARNESS | Link pending history, valid-looking idempotent active identity fixture | Prepare/complete LINK through normal endpoints | Guard before controlled launch and ALREADY_LINKED; deny pending | NC, no LINK success or observation bypass | DB, HTTP | BLOCKED G0 | CRITICAL | T2 |
| F19 HARNESS | Existing A retained identity; DEMI B | Attempt Link with correct proof but other owner | Conflict, no transfer/merge/account switch | NC; conflict intent disposition only | UI, DB, HTTP | BLOCKED G0 | CRITICAL | T2 |
| F20 HARNESS | Approved disposable DB fixtures | Interleave unlink/relink, Recovery/relink and reserve/complete; force serialization retry | User→Intent→Binding→rows order, reread current state, one permitted commit, no provider I/O under locks | LR/RR/NB consistent; RS unique; no deadlock/bypass | DB, sanitized schedule | BLOCKED G0 | CRITICAL | T2 |

## 5. Bounded Recovery — identity, intent and release

| ID / mode | Preconditions | Operator action | Expected result | Persisted evidence | Sanitized proof | Result | Severity | Retest |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R01 REAL/DEVICE | A logged in, revoked binding UN, no old token | Prepare Recovery through UI | Live exact session, server-selected retained binding, reviewed full set | RI | UI, HTTP, DB, AUTH | BLOCKED G0 | CRITICAL | T3 |
| R02 REAL/DEVICE | RI | Open LINE Settings → Account → Authorized apps; review named apps, acknowledge risk, explicitly renew Account proof L-A | Warning new grant possible; no mandatory never-used MINI login; no automatic Link | RI remains; no RR/OBS until submit | UI, LINE | BLOCKED G0 | HIGH | T4 |
| R03 REAL/DEVICE | R02, same DEMI session/current L-A | Explicitly confirm Recovery | Fresh server verification after intent, valid expiry/fingerprint; release only | RR, UN/RS unchanged, Binding still revoked | UI, AUTH, DB, HTTP | BLOCKED G0 | CRITICAL | T3 |
| R04 REAL/DEVICE | RR | Reload, then explicitly choose normal Relink | Release status remains unverified; distinct Link confirmation | RR persists; NB only after separate Link | UI, DB, LINE | BLOCKED G0 | CRITICAL | T1 |
| R05 REAL/DEVICE | RI for L-A | Supply fresh L-B proof in permitted test UI/harness | Wrong LINE rejected, no identity hint/transfer | NC, RI not successfully consumed/released | UI, HTTP, DB | BLOCKED G0 | CRITICAL | T3 |
| R06 HARNESS | RI, synthetic other-channel ID proof | Submit Recovery | Audience rejected, Account/MINI not interchangeable | NC | HTTP, DB | BLOCKED G0 | CRITICAL | T2 |
| R07 DEVICE/HARNESS | RI prepared in A session1 | Ordinary logout/login as same A in new session, then try old intent | Exact-session mismatch denied; fresh intent required | NC; no RR | AUTH, HTTP, DB | BLOCKED G0 | CRITICAL | T3 |
| R08 HARNESS/DEVICE | Expired JWT or provider-denied revoked disposable session | Attempt preparation/commit | Fail closed; no silent JWT refresh in same attempt; normal login then new intent | NC | AUTH, HTTP, UI | BLOCKED G0 | CRITICAL | T3 |
| R09 HARNESS | Auth network/5xx unavailable | Attempt preparation/commit | Safe unavailable, no cached-liveness success | NC | AUTH safe category, DB | BLOCKED G0 | CRITICAL | T2 |
| R10 HARNESS | LINE identity provider unavailable/expired proof/future verification time | Submit Recovery | Reject current proof, no old-token/profile fallback | NC | HTTP, DB | BLOCKED G0 | CRITICAL | T2 |
| R11 DEVICE/HARNESS | RI older than5min or already consumed | Submit/repeat Recovery | Expired/replayed denied; finite fresh-start UX | NC; original RR immutable if consumed | UI, DB, HTTP | BLOCKED G0 | HIGH | T3 |
| R12 HARNESS | RI current, one app review absent | Submit incomplete review map | Reject, review covers exact complete set | NC | HTTP, DB | BLOCKED G0 | HIGH | T2 |
| R13 HARNESS/DEVICE | RI, reviews complete, risk unchecked/false | Try continue/submit | UI prevents; server schema rejects missing/false acknowledgement | NC | UI, HTTP, DB | BLOCKED G0 | HIGH | T2 |
| R14 HARNESS | RI snapshot then approved fixture inventory revision/new obligation changes | Submit with old snapshot | Digest/set invalidated; prepare new decision | NC; historical rows retained | DB, HTTP | BLOCKED G0 | HIGH | T2 |
| R15 HARNESS | RI target generation changes concurrently | Submit old proof/intent | Current-generation check rejects old decision | NC; new generation untouched | DB, HTTP | BLOCKED G0 | CRITICAL | T2 |
| R16 HARNESS/DEVICE | A owns revoked legacy binding, no lifecycle rows/raw locator | Prepare/recover with correct current L-A proof | Lazy UNKNOWN rows, no historical token required, no fake provider success | RI then RR; UN remains distinguishable | UI, DB | BLOCKED G0 | HIGH | T2 |
| R17 HARNESS/DEVICE | Actual reviewed MINI unknown/applicable set | Review all relevant apps with Account identity | No compulsory MINI consent, no Account204 MINI confirmation | Independent MINI UN; RR only decision release | UI, DB, LINE if applicable | BLOCKED G0 | HIGH | T2 |
| R18 DEVICE/HARNESS | A with no Patient SELF authority completes RR | Attempt Patient entry/read/action normally | Recovery grants no Patient authority; standard domain denial | RR only; no Patient capability/context/session/binding | HTTP, DB, UI | BLOCKED G0 | CRITICAL | T3 |

## 6. Devices, navigation, security and ordinary regressions

Record OS/device/browser/LINE app versions privately. Repeat H01–H08 and R01–R04 on Android LINE and iOS LINE; external browsers must support missing-token local Unlink and explicit LIFF re-entry. Unsupported desktop SDK capability is BLOCKED/NOT APPLICABLE only with documented platform evidence and a working supported continuation, never silently PASS.

| ID / mode | Preconditions | Operator action | Expected result | Persisted evidence | Sanitized proof | Result | Severity | Retest |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| D01 DEVICE | Android LINE in-app, G0 | Execute core Link/Unlink/Recovery/Relink | Mobile readable Thai, bounded loading, correct in-client return/proof | OBS/LR/RC or UN/RR/NB as actual result | UI, DB, LINE | BLOCKED G0 | HIGH | T4 |
| D02 DEVICE | iOS LINE in-app, G0 | Same core sequence | Cookie/session handoff and safe explicit re-entry | Same independent lifecycle evidence | UI, DB, LINE | BLOCKED G0 | HIGH | T4 |
| D03 DEVICE | Android Chrome/iOS Safari external browser | Normal DEMI login, tokenless Unlink, Recovery LIFF handoff | No old token needed; external cookie isolation handled safely, no switch | LR/UN; RI/RR only correct same session | UI, AUTH, DB | BLOCKED G0 | HIGH | T4 |
| D04 DEVICE | Desktop supported Account browser | Explicit LINE login and supported recovery continuation | Correct return or clear supported-path error, no permanent spinner | No unauthorized transition on unsupported proof | UI, HTTP | BLOCKED G0 | MEDIUM | T4 |
| D05 DEVICE | LR/RS pending or RR | Refresh/back/BFCache/multiple tabs | Server truth persists; hidden stale view reloads; no duplicate release | Original generation/attempt/release unchanged | UI, HTTP, DB | BLOCKED G0 | HIGH | T4 |
| D06 DEVICE | RI in sessionStorage | Explicit LIFF logout/login/re-entry; browser close/storage unavailable variant | Only intent/review/risk transport; missing handoff offers safe fresh start | No token storage; RI expires; RR only valid flow | UI, AUTH, PRIV | BLOCKED G0 | CRITICAL | T4 |
| D07 DEVICE | DEMI session nearing expiry during Recovery | Attempt, then normal DEMI login/refresh and new intent | Sensitive attempt denies without replacement; ordinary login still works | NC then fresh RI/RR | AUTH, UI, HTTP | BLOCKED G0 | HIGH | T3 |
| D08 DEVICE | Same-origin/external return variants | Inspect cookies/options and return path with redacted tools | Fixed return URLs, no cookie sharing across accounts, private/no-store; no JWT/subject in URL | No cross-owner transition | HTTP metadata, PRIV, UI | BLOCKED G0 | CRITICAL | T4 |
| D09 DEVICE | Phone narrow viewport, keyboard/screen reader | Confirm/unlink/review/risk/submit; simulate finite error | Thai preserved, focus/status announced, controls usable, errors recoverable | No duplicate commit from assistive interaction | UI/accessibility transcript | BLOCKED G0 | MEDIUM | T4 |
| D10 DEVICE/HARNESS | RR or local Unlink completed | Ordinary DEMI login, Family login/return, Appointments/SELF and unrelated role controls | Existing credential/domain rules unchanged; no Family LINE expansion | No new role/Patient authority from recovery | UI, AUTH, synthetic authorization booleans | BLOCKED G0 | CRITICAL | T3 |
| D11 HARNESS/DEVICE | Existing synthetic J2/menu fixtures | Check reactive messaging authority and Rich Menu cleanup independently | Revoked binding denied; normal menu cleanup not mistaken for consent204 | LR/menu cleanup separate from RC/UN | UI, DB, sanitized mocked Reply | BLOCKED G0 | HIGH | T2 |
| D12 HARNESS | Reviewed logging canary plan, no real credentials | Verify fetch/runtime/APM/proxy/egress/browser/CI controls | No query/header/body/cookie secrets persisted/exported; both verifier paths covered | No user mutation needed | PRIV | BLOCKED G0 | CRITICAL | T5 |

## 7. Operational failures and accepted provider race

Use controlled disposable harness for X01–X05; no production setting changes and no repeated real-grant manipulation to manufacture a race.

| ID / mode | Preconditions | Operator action | Expected result | Persisted evidence | Sanitized proof | Result | Severity | Retest |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| X01 HARNESS | LR/RS pending | Simulate config disabled/manifest invalid then restore reviewed bundle | Relink remains denied; Recovery unavailable until restored; then fresh intent works | Pending rows unchanged, later legitimate RR only | UI, DB, HTTP | BLOCKED G0 | HIGH | T5 |
| X02 HARNESS | Missing target lifecycle migration fixture | Readiness/Link/Unlink/page checks only against approved disposable fixture | No activation; record Link schema dependency even false; API local fallback where prior schema supports it | No fake RC/RR; missing lifecycle not fabricated | HTTP, catalog metadata | BLOCKED G0 | HIGH | T5 |
| X03 HARNESS/DEVICE | Config-readiness failure, owner active binding | Inspect Account page and local Unlink path | Record known hidden-button limitation; user-facing local revocation unavailable is a FAIL against resilient UX goal until fixed/restored | Safe API does not imply UI PASS | UI, HTTP | BLOCKED G0 | MEDIUM | T5 |
| X04 HARNESS | Attempt A reserved/submitted, ambiguous timeout | Complete approved Recovery, Link B, then deliver A's delayed204 | A updates only old attempt; B/version/release audit/Patient authority unaffected | Historical RC with RR distinguishable; NB unchanged; no second A | DB before/after aliases, schedule | BLOCKED G0 | CRITICAL | T2 |
| X05 HARNESS/DEVICE | X04 or current LINE permission unavailable fixture | Fail fresh proof/new entry, offer reconnect | Safe denial, normal DEMI access independent, no automatic switch/Patient access | No old workflow revived/new Patient scope | UI, HTTP, DB | BLOCKED G0 | CRITICAL | T2 |
| X06 HARNESS | Historical tuple inventory revised or exclusion added | Re-prepare/review old obligations | Old obligations cannot disappear or become confirmed from revision/exclusion | Retained tuple definitions, set digest/UNKNOWN/UN preserved | DB, UI | BLOCKED G0 | HIGH | T2 |

X04 validates DEMI's local fence, not that LINE cancels old work or preserves B. The owner-accepted residual risk is temporary provider-side reconnection disruption; no documented immunity is claimed.

## 8. Completion and handoff for a later execution phase

Before starting: fill private target/deployed SHA, owner approval reference, test population, Console/inventory/migration/Auth/privacy references, device schedule and fault-harness scope. No unexecuted case can be PASS. Record Account204 only if actually observed; MINI provider removal remains outside this slice. Where real LINE cannot safely produce an error case, preserve HARNESS classification and record real capability NOT VERIFIED.

After execution: attach sanitized proofs per row, assess failures at their observed severity, retest only affected cases plus relevant controls, and reconcile durable pending/released history. Keep reviewed Recovery configuration available for test users with pending obligations. Cleanup consent/accounts/deployments is a separate authorized action; never erase lifecycle evidence or repeat old remote attempts as cleanup. UAT acceptance does not authorize production deployment or MINI workflow activation.
