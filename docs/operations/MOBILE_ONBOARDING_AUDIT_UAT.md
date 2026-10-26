# UX-C.0 — Mobile onboarding audit and UAT

Audit date: 2026-10-26. Base: `main`, `0393bad79bd47459580ec31747bf147da212b119`; clean working tree. Code inspection only, no device or real LINE account was used. UX-C.2 session handoff is deferred.

## Transition audit

| Transition / action | Authoritative state and feedback | Failure, fallback, destination / boundary |
| --- | --- | --- |
| Invitation → preview | Server validates fragment token, expiry, consumption and purpose; loading precedes masked identity/form | Expired/consumed invalid invitation is terminal for that token; request replacement. Unknown/provider error can retry; no success CTA. Patient/workforce forms and services own eligibility |
| Preview → set password | Existing validated server action; pending disables submit; only SUCCESS displays activation completion | Failed/uncertain action must not authenticate or offer success. Fragment is cleared by existing lifecycle, never used as LINE proof |
| Activation → choice | First-time SUCCESS offers configured LIFF entry or `/login`; missing config retains web fallback | RESET has its own completion, no first-time journey. Child OWNER uses purpose-specific server rules; invitations confer no LINE roles |
| LIFF entry → DEMI login | Account summary derives current session; UNAUTHENTICATED offers `/login?returnTo=%2Fline%2Faccount` | Cookie contexts can differ. Allowlist controls return; safe `/app` fallback. App launch/cookie sharing not guaranteed |
| DEMI login → account | Auth validates credentials and current authority; contextual explanation; existing pending/errors | No automatic binding. Existing DEMI session may belong to someone else on shared devices |
| Account → LINE login | LIFF init determines actual environment/logged-in state; loading blocks linking | Explicit LIFF login, unavailable retry and website fallback. Only full LIFF supports friendship prompt; close only in-client |
| Link → confirmation | Server creates session-bound intent/challenge; current password required | Back discards intent locally. Existing account switch ends DEMI session and returns via allowlisted login; no principal from client |
| Confirmation → binding | Server rechecks intent/session, password, verified LINE identity, uniqueness, retained history and relink eligibility | Privacy-safe conflicts/recovery, no silent cross-account transfer. Local commit remains true even if provider work fails |
| Binding → friendship | Verified friendship observation is version fenced; UNKNOWN is distinct from NOT_FRIEND | Add/unblock OA when supported, manual verification otherwise. Provider failure cannot negate binding |
| Friendship → menu | Reconciler projects persisted roles, leases and version fences provider writes; summary reads persisted outcome | Page/reachability routes schedule via `after()`, so response is not completion. Existing reload can display stale summary |
| Menu → completion | Full readiness requires LINKED + FRIEND + APPLIED | Unavailable/mismatch need recovery, UNKNOWN pending. In-client close; outside use OA chat instructions or `/app` |
| Optional notifications | Existing domain eligibility and persisted preference; explicit save/pending/error | OFF unless persisted ON. Binding/activation do not consent; delivery not guaranteed |

Evidence: `app/activate/{patient,workforce}/*`, `src/components/activation/activation-onboarding.tsx`, `app/login/*`, `src/modules/auth/{schemas,transport,services}`, `app/line/account/*`, `app/app/line/account/page.tsx`, `app/api/line/account/{link,unlink,reachability}/route.ts`, `src/modules/line/services/{line-account-service,line-menu-reconciler,line-entry-reconciliation}.ts`, `src/modules/line/transport/line-reconciliation-scheduler.ts`, and their tests. Architecture baseline, ADR-0012 (independent credential recovery proof), ADR-0018 (Child onboarding), ADR-0019 (authority), ADR-0021 (caregiver) and activation/LINE operations documents reviewed. Caregiver claim and existing ACTIVE Child OWNER acceptance remain structurally separate.

## Confirmed findings at base

| ID | Severity | Evidence / consequence | C.1 resolution target |
| --- | --- | --- | --- |
| C01 | P2 | `LineAccountScreen` menu button calls reload; page reads summary before scheduling `after()`. Repeated clicks can show unchanged state without feedback | Authorized one-shot check, immediate busy, duplicate guard; report lease busy honestly |
| C02 | P2 | FRIEND + UNKNOWN/MISMATCH/UNAVAILABLE all say normal provisioning | Distinct pending, unavailable/mismatch, unknown friendship and verified ready copy |
| C03 | P2 | LINK_CONFIRM also renders initial link CTA; account switch only available after Back, long shared-device warning | One confirmation action, direct safe switch, explicit cancellation wording |
| C04 | P3 | Confirmation focus targets disabled confirm button while password empty | Focus confirmation heading; retain password and field errors |
| C05 | P3 | Success and existing-linked branches repeat completion/next actions; some errors only visible in existing-linked branch | One readiness message; refresh feedback in both branches; primary return only when ready |

No confirmed P1 found within this bounded audit. This is not proof that all security defects are absent. `ActorContext` has opaque IDs/roles/scopes, no suitable disambiguating display identity; role alone cannot identify an individual. C.1 uses explicit wording and existing account switch without new identity disclosure. Existing mutation-boundary password/session checks remain essential.

## Device-dependent hypotheses (unverified)

LIFF deep link app launch, external/in-app cookie boundaries, return/close behavior, OA prompt availability, keyboard/viewport movement, screen-reader announcements, 200% zoom and provider latency require real-device UAT. No hypothesis below is a reported device defect.

## Reproducible manual UAT record

Use synthetic accounts in an isolated authorized environment. Never use production Patient data. Capture only redacted state labels, browser/OS/LINE version and timings; exclude invitations, tokens, passwords, IDs and personal/clinical information. Provider operations require the operator's authorized test OA/accounts. For every row record actual result, PASS/FAIL/NOT EXECUTED, evidence reference, severity and follow-up. All rows currently **NOT EXECUTED**, actual/evidence/severity/follow-up **pending**.

| # | Preconditions | Actions | Expected result |
| --- | --- | --- | --- |
| 1 | Android Chrome, fresh invitation | Activate → choose LINE | Confirmed activation only; configured LIFF entry, explained login, web fallback |
| 2 | Android LINE, fresh invitation | Activate → link | No automatic linking; actual LIFF environment determines supported actions |
| 3 | iPhone Safari, fresh invitation | Activate → LINE | Same journey; separate session explained |
| 4 | iPhone LINE, unlinked account | Login → confirm password → link | One explicit confirmation; binding vs readiness distinguished |
| 5 | Desktop without LINE app | Open LIFF and attempt login | No unsupported close; OA instructions and website usable |
| 6 | DEMI authenticated, unlinked | Open account | Existing session preserved; explicit link/password required |
| 7 | LINE browser lacks DEMI session | Login from account | Context explained; only allowlisted `/line/account` return |
| 8 | Different DEMI account authenticated | Begin link → use another account | Confirmation cancellation explained, sign-out then login; no binding created |
| 9 | LINE already linked | Open account; try duplicate request in controlled test | Actual readiness; no duplicate binding; conflict privacy preserved |
| 10 | OA not friend | Link → add friend → check | Binding retained; no ready claim until FRIEND + APPLIED |
| 11 | OA blocked | Use supported add/unblock prompt → verify | NOT_FRIEND guidance; no delivery/readiness promise |
| 12 | Provider unavailable via controlled double | Check status | Recoverable warning, binding retained, web fallback |
| 13 | Another reconciliation lease active | Check menu | Immediate busy, then still-pending feedback; no success inferred from scheduling |
| 14 | Persisted menu MISMATCH | Check again | Neutral not-ready state; update only from server result |
| 15 | Check can be slow | Rapidly click check | One operation while busy; switch/unlink disabled until resolved |
| 16 | Slow/offline network | Start check → navigate away; retry after timeout | Bounded request, no polling/stale update; clear retry and website fallback |
| 17 | Workforce RESET token | Complete password reset | Reset completion only; binding and preference unchanged |
| 18 | First-time activation succeeds | Choose website | Normal `/login` → authorized workspace, LINE remains optional |
| 19 | Patient, OSM, MEMBER, OWNER, Child OWNER, multi-role fixtures | Repeat activation/link | Persisted role/menu authority; eligible Patient-only opt-in; no scope expansion |
| 20 | 320px viewport, 200% zoom, keyboard/screen reader | Full flow incl error and check | No lost controls/overflow, readable Thai, focus and status feedback, large targets |

## Security and asynchronous boundary

No session bridge, passwordless entry, token reuse, provider configuration change or persistent onboarding progress. Existing single-use activation, session-bound intent, password verification, LINE token validation, ownership, relink/history, lease/version fencing and preference consent remain authoritative. Status refresh must not accept principal/binding IDs. HTTP scheduling acceptance cannot imply provider completion; provider failure after binding commit is a readiness problem, not failed binding.

References: installed Next.js `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md` (16.3.0); [official LIFF environment guidance](https://developers.line.biz/en/tips/2026/08/06/between-liff-browser-and-external-browser/), [LIFF API](https://developers.line.biz/en/reference/liff/) (closeWindow, requestFriendship). UX-C.2 needs a separate approved security design; no session transport is introduced here.

## C.1 implementation disposition

C01–C05 are addressed by the explicit `/api/line/account/status` check and LINE screen changes described in [the journey runbook](./ACTIVATION_LINE_ONBOARDING.md). Server checks existing session/LINE ownership, awaits the existing reconciler once and returns persisted summary plus CHECKED/PENDING. BUSY is never treated as completed; no new lease semantics or polling. A 25-second browser timeout can occur before server/provider completion; local binding remains valid, retry may report PENDING. No new provider permission, migration or identity disclosure.

Additional confirmed P2 finding C06 during regression: `startLineLogin()` previously created a LINK intent whenever disconnection status existed, including already-linked users who only needed LINE authentication for status. This added a rate-limited/relink-fenced operation unrelated to the user's action. C.1 retains preflight for UNLINKED and removes it for existing bindings; the actual linking mutation still enforces all existing checks. A focused interaction test covers this case.

Real-device evidence remains absent. All 20 manual scenarios remain NOT EXECUTED after implementation; automated React/jsdom/route tests and local integration tests do not replace UAT. Deferred UX-C.2 requires independent threat modeling and product approval; this change introduces no cross-browser session transport or passwordless authentication.

## Automated verification — 2026-10-26

| Check actually executed | Result |
| --- | --- |
| Focused regression command below | 27 files / 282 tests PASS |
| Final interaction command after the local concurrent-check guard | 4 files / 70 tests PASS (overlaps the preceding set; one added interaction) |
| Local integration command below | 7 files / 192 tests PASS |
| `npm run test:db:status` | disposable local PostgreSQL healthy at 127.0.0.1:55432 |
| `npm run typecheck` | PASS |
| ESLint command below | PASS, zero warnings |
| Diff/UTF-8 check | PASS; existing CRLF preserved, UTF-8 without replacement characters/BOM |

Initial focused iterations exposed outdated copy expectations and the C06 extra LINK intent; both were corrected with behavioral regressions. No remaining deterministic failure in the commands above. No full repository suite, global lint, production build, development server, browser screenshots or device/provider UAT was run. Integration uses the existing isolated test database and provider doubles, not a live OA. No schema, credentials, provider configuration, scheduler or delivery behavior changed. Static review checked origin/body/schema boundaries, session-derived ownership, proof validation before provider work, no client principal, no tokens/PII in URLs/logs, unchanged password/intent/conflict contracts and unchanged lease/version fencing. This is scoped regression verification, not an exhaustive security scan.

Reproducible commands from repository root (PowerShell; `.env.integration` must point only to the disposable test database):

```powershell
npm run test -- app/activate/activation-interactions.test.tsx app/activate/activation-pages.test.tsx app/activate/workforce/workforce-activation-form.test.tsx app/line/account app/api/line/account app/login/login-page.test.tsx src/modules/auth/schemas/login-schema.test.ts src/modules/auth/transport/login-return.test.ts src/modules/line/services/line-deep-link-builder.test.ts src/modules/line/services/line-account-service.test.ts src/modules/line/services/line-menu-reconciler.test.ts src/modules/line/services/line-reachability-service.test.ts src/modules/line/transport/account-http.test.ts src/modules/line/transport/line-reconciliation-scheduler.test.ts src/modules/appointments/services/appointment-line-notification-preference-service.test.ts src/modules/appointments/transport/appointment-line-notification-actions.test.ts
npm run test -- app/line/account/line-onboarding-continuity.test.tsx app/line/account/line-account-client.test.tsx app/line/account/line-friendship-refresh.test.tsx app/api/line/account/status/route.test.ts
node --env-file=.env.integration node_modules/vitest/vitest.mjs run --config vitest.integration.config.mts tests/integration/line-account-linking.integration.test.ts tests/integration/patient-activation.integration.test.ts tests/integration/workforce.integration.test.ts tests/integration/line-authorization-lifecycle.integration.test.ts tests/integration/line-disconnection-orchestration.integration.test.ts tests/integration/parent-led-child-onboarding.integration.test.ts tests/integration/appointments.integration.test.ts
node node_modules/eslint/bin/eslint.js app/line/account/line-account-client.tsx app/line/account/line-account-client.test.tsx app/line/account/line-onboarding-continuity.test.tsx app/api/line/account/status/route.ts app/api/line/account/status/route.test.ts --max-warnings=0
npm run typecheck
git diff --check
```

Regression coverage includes Patient/workforce/Child OWNER first-time activation, expired/consumed/uncertain outcomes, RESET, configured optional LINE entry, login return allowlist, explicit persisted notification opt-in, current-password/intent verification, binding conflict/idempotency/unlink/relink/recovery, role-specific menus and lease/version fencing. New tests cover status UNKNOWN/MISMATCH/UNAVAILABLE/FRIEND/APPLIED/NOT_FRIEND, unknown reachability, pending leases, provider failure, duplicate clicks, bounded timeout, unmount/pagehide cancellation, competing unlink confirmation, LINE login for existing bindings and shared-device confirmation/account switch. Physical viewport/zoom/assistive-technology behavior remains pending in the matrix above.
