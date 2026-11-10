# LINE Account presentation

This presentation refactor leaves server authorization, lifecycle and notification policy unchanged. Thai copy names the task and next action; secondary explanation uses native `details`/`summary`. Blocking errors and logout exceptions remain visible. No provider confirmation is inferred from local unlink, menu cleanup or recovery release.

## Presentation mapping

| Authoritative input | Primary presentation / next action |
| --- | --- |
| Linked, friendship and menu confirmed | Connected / return to LINE |
| Linked, not friend | Connected / add DEMI as friend; external browsers receive chat instructions |
| Linked, menu pending | Connected, menu not ready / explicit supported status check or web access |
| Status lookup failed | Last observed connection, current status unconfirmed / supported check |
| Unlinked, relink allowed | Not connected / ordinary explicit link |
| Unlinked, relink blocked | Check LINE before reconnecting / server-authorized recovery or pending status check |
| Lifecycle unavailable | No link/recovery authorization inferred; existing local unlink remains available |
| Ineligible | Existing restriction; unlink remains available only when server permits |
| Local unlink committed | Old connection cannot access DEMI; data retained |
| Remote pending or recovery required | Secondary honest remote-status summary; recovery remains visible when blocking |
| Remote confirmed | Confirm removal only from server evidence |
| Recovery released unverified | Explicit relink allowed, remote removal still unconfirmed |
| Logout failed / changed session / expired proof | Visible exception and existing safe retry, reload or ordinary logout action |

`selectLineReadinessMessage` prioritizes failed current checks, missing friendship, confirmed readiness, pending menu and unknown reachability. It selects copy only and grants no authority. Server-derived relink eligibility continues to fence actions.

## Recovery sequence

1. Prepare the existing single-use five-minute intent. Show only the app names in the server-authorized review set and the existing LINE Authorized Apps link.
2. Require every REMOVED / NOT_LISTED / UNDETERMINED decision and explicit acknowledgement that delayed old deauthorization may temporarily disrupt the new connection. Returning to app review retains selections.
3. Explicitly request fresh LINE identity, preserve the existing LIFF cross-webview handoff, then explicitly submit recovery. Resume directly at identity confirmation only for the exact session scope, unexpired intent and unchanged outstanding set. Completion reloads authoritative status; it never creates a binding.

Focus moves to the heading on step or intent change, not on each field change. Local expiry stops identity/submission and offers a restart. Server checks remain authoritative, including expiry during network I/O. Other failures use safe generic copy and retain a restart action without automatic retries.

## Historical obligations and retained safeguards

The service still evaluates all historical bindings and generations. The overview uses its aggregate state and canRelink; no newest-generation filtering occurs. All historical rows remain available under “รายละเอียดการถอนสิทธิ์”, without raw identifiers. Active recovery uses only prepare's exact review set. Settled records, released-but-unverified records and unresolved historical blockers retain their distinct server statuses.

Retained: current-password verification; explicit link/unlink consent; account switching; server authentication and resource authorization; binding uniqueness/ownership; exact live session and LINE subject checks; single-use intent and five-minute recovery expiry; reviewed-set digest/integrity; all manual decisions and risk consent; relink fences; audit events; local revocation independent of LINE; per-channel deauthorization evidence; duplicate/replay protection; session-scoped expiring storage handoff without identity/access tokens or secrets in URLs. No schema, migration, notification recipients/events/types/content policy or provider configuration changes.

Notification preferences show persisted state and success only after confirmed mutation. Secondary details retain recipient, privacy, delivery and friendship prerequisites. Pending and unknown outcomes block resubmission.

## Before / after examples

| Before | After |
| --- | --- |
| Persistent four-item onboarding sequence plus connected/readiness messages | Connection heading plus one readiness explanation |
| Every historical permission row expanded | Aggregate status with collapsed permission history |
| App instructions, all decisions, risk and identity controls together | Three task steps with heading focus |
| All appointment-type examples in default settings | One sentence and a privacy/details disclosure |

## Local verification evidence (2026-11-10)

- Commit A: `npm run test -- app/line/account src/modules/line/services/line-account-service.test.ts`: 14 files / 157 tests passed. Typecheck and targeted ESLint passed.
- Commit B: focused recovery flow/panel, disconnection history and lifecycle service: 4 files / 29 tests passed; after adding local expiry coverage, recovery flow/panel: 2 files / 21 tests passed. Typecheck and targeted ESLint passed.
- Commit C: notification and wizard accessibility: 2 files / 10 tests passed. Latest `npm run test -- app/line/account`: 14 files / 145 tests passed. Typecheck and targeted ESLint passed.
- Broader `npm run test -- app/line/account src/modules/line`: 885 passed / 2 failed (887 total). One account test still asserted removed notification copy and was corrected, then passed in the latest account run. Rich Menu illustration mapping exceeded its existing 5000ms timeout in the concurrent run (total run 34.90s); the unchanged asset file passed when rerun with the account file (8 asset tests, combined run 26.52s). Resource contention is possible, not established. No deadline was raised and the broad suite was not rerun.
- `npm run build`: passed, including compilation, TypeScript and 61 static pages. A subsequent change updated only test assertions and does not invalidate that build.
- `git diff --check`: passed. No backend service/domain/adapter, schema, migration, lockfile or provider configuration changes.
- PostgreSQL integration not executed: `docker info --format '{{.ServerVersion}}'` failed because Docker is not installed/available as a command. No shared database substituted.
- Hosted CI not executed: user requested local commits only, with no push. No PR/run URL or hosted job conclusions exist for this branch.

## Verification limitations and manual device UAT

DOM tests cover wizard focus/control visibility, required decisions, handoff, expiry and notification outcomes. They do not establish mobile rendering, screen-reader speech, contrast or real LINE behavior. The expanded historical list can still be long; records are intentionally retained. LINE/provider availability and unknown MINI applicability still require honest pending/recovery states.

Manual checklist (not executed by these tests):

- On iOS and Android LINE WebView and an external browser, test 320/360/390px widths, Thai wrapping, zoom and absence of horizontal overflow.
- Verify keyboard tab order, visible focus, heading focus after wizard transitions and screen-reader labels/announcements; open/close disclosures using keyboard.
- Check contrast using computed theme colors, 48px action targets and reduced-motion settings.
- Test link confirmation, wrong password and switching DEMI accounts on a shared device.
- Test friend/missing-friend/menu-pending states and return navigation in LINE versus browser.
- In an isolated test account, test unlink, pending Account/MINI removal, logout failure, changed session and expired logout proof. Never use production deauthorization for automated verification.
- Review each required app, all decision choices and risk acknowledgement; navigate to LINE and resume in a new WebView.
- Reject stale/expired/other-session handoff; recover multiple old bindings in server-selected order; verify recovery completion requires a separate ordinary link.
- Enable/disable notifications; simulate validation failure, lost response and repeated clicks; confirm no unverified success.
