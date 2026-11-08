# PR #2: final Workspace LIFF lifecycle remediation

Scope: `feature/line-workspace-liff`, reviewed baseline `93f0ac1062425950cacff62d9b22fbbe9026b826`. No schema/migration, authorization, provider settings, Messaging channel or Rich Menu changes. Real Android/iOS UAT is still required before production rollout.

## Contract evidence and finding 1

Installed packages inspected: Next.js **16.3.0**, `@line/liff` and `@liff/init` **2.31.1**. Official sources:

- [Developing LIFF apps](https://developers.line.biz/en/docs/liff/developing-liff-apps/): primary/secondary initialization considerations and URL mutation ordering.
- [Opening LIFF apps](https://developers.line.biz/en/docs/liff/opening-liff-app/): SDK secondary redirect composition and LIFF-to-LIFF return behavior.
- [LIFF reference](https://developers.line.biz/en/reference/liff/): new-page initialization, pre-init `isInClient`, and `liff.id` as the ID supplied to init (null before init).
- [Additional URL information, 2026-07-16](https://developers.line.biz/en/tips/2026/07/16/liff-url-additional-info/): reserved platform parameters and SPA router timing.

**A — Root initialization:** the root entry correctly lets the SDK consume primary parameters/credentials. With `liff.state`, the SDK itself performs a secondary document navigation; that primary init promise deliberately remains unsettled. SDK-owned redirects are not application redirects that need to await that promise.

**B — New secondary document:** the root Endpoint has no extra path/query, so the special additional initialization required to construct redirects for endpoints with those parts is not the argument here. Independently, a new LIFF document initializes before using LIFF functionality. A same-document SPA route change after successful init shares that document's initialized SDK; it is not another primary/secondary redirect.

**C — Interruption is a confirmed defect:** B alone does not prove C. The developing/reference guides prohibit application URL changes ahead of init completion, and the July guidance explicitly covers SPA routers. The installed SDK still reads the current document's URL during initialization: LINE Login callback handling, `liff.hback` propagation and Android version discovery. Losing a callback `code`/`liffClientId` or killing that document before this work finishes is not justified by the primary document having cached tokens. The old executable ordering test demonstrates the mutation; the real Next baseline smoke establishes that an unauthenticated protected document can carry a streamed router redirect and a one-second meta-refresh. There is no documented general secondary-document exemption for these cases.

Relevant installed source (read-only):

- `node_modules/@liff/init/lib/index.es.js`: `HandleLiffState.invoke` reads `window.location.search`, calls `location.replace`, preserves `liff.hback` and awaits a never-settling promise; credential preparation builds LINE Login return URIs from `location.href`; Android version discovery reads URL/referrer `lineAppVersion`.
- `node_modules/@liff/core/lib/index.es.js`: `id` reads configured `liffId`; it is not native-container identity before initialization. DEMI retains it only as a negative conflict guard after another app configured the SDK.
- `node_modules/next/dist/server/app-render/make-get-server-inserted-html.js`: streamed redirect meta tag.
- `node_modules/next/dist/server/web/adapter.js`: Flight headers are saved/removed before Proxy, explaining why testing only `request.headers.get("rsc")` is insufficient.
- Installed Next docs: `01-app/03-api-reference/04-functions/{redirect,use-router}.md` and Proxy reference. `refresh()` retrieves RSC while preserving the document.

**Correction:** document requests receive a public transport shell via internal rewrite, preserving their original address. The protected route is requested as RSC only after this document's required init completes. Consequently neither a client redirect, HTTP redirect from the protected tree, nor a meta-refresh exists in the initial transport document. No protected data is supplied to the shell. All real reads/actions still execute existing session/resource/role checks on the server. Calling RSC directly can skip transport UI only; it cannot skip authorization.

The shell and root entry expose no application navigation controls while SDK work may be running. A ten-second timeout does not cancel SDK work. Rejection/timeout asks the user to close and reopen from LINE, and does not silently continue, race another init or reload the document. Ordinary browsers request RSC immediately without importing the SDK. The cost is one additional RSC request and a JavaScript requirement for initial app/login document loads.

## Lifecycle timeline after correction

`D1` and `D2` are different browser documents. Workspace is the configured Workspace LIFF ID; these labels describe transport, never DEMI identity.

| Step | Active document / owner | SDK status and redirect phase | URL / parameter handling | DEMI boundary |
| --- | --- | --- | --- | --- |
| 1. LINE opens Workspace deep link | LINE launcher, before DEMI document | Platform selects Workspace LIFF URL | LINE-managed navigation | No DEMI grant |
| 2. Primary reaches `/` | D1, Workspace entry signal | Not started; primary | `liff.state`, bookkeeping and possibly credential fragment untouched | Public transport only |
| 3. Root starts init | D1, Workspace | SDK load then primary init pending | Exact allowlisted one-shot handoff recorded; no app URL mutation | No session creation from LINE tokens |
| 4. SDK secondary redirect | D1 replaced by D2, Workspace | SDK owns redirect; D1 promise need not resolve | SDK consumes credentials/state and composes secondary URL, preserving its bookkeeping | No protected data |
| 5. `/app/...` loads | D2, matched Workspace handoff | New-document init required, then pending | Proxy internally rewrites to transport shell; visible path/query/fragment unchanged | Protected tree not requested yet |
| 6. Protected actor resolution | D2, Workspace | **Only after D2 init resolves**; RSC request | History marker recorded without changing URL; same-document refresh | Existing server actor resolver runs |
| 7. No DEMI session | D2, initialized Workspace | Ready | Allowlisted login return derived from original request | Server denies protected access |
| 8. Next emits streamed redirect | D2, initialized Workspace | Ready, no competing init | RSC redirect can now be consumed; no pre-init HTML meta-refresh exists | Existing server decision |
| 9. Hydration | D2 | Transport shell hydrated before steps 5–6; protected RSC merges after ready | No routing effect is used as an initialization barrier | No client auth authority |
| 10. Init starts/resumes | D2 | Starts at step 5; remount joins the actual document promise, not another init | Required URL remains intact until completion | Transport only |
| 11. Navigate `/login` | D2, initialized Workspace | Ready; ordinary SPA navigation | Next changes URL after init. Login form can then handle its own fragment | Login page reads current server access |
| 12. DEMI authenticates | D2 | Same initialized SDK; no re-init for SPA | Actual password server action + Supabase SSR cookie semantics | Server verifies credentials and mapped active actor |
| 13. Restore destination | D2 | Ready | Existing login allowlist restores exact approved destination; no arbitrary URL added | Destination services authorize again |

An existing session skips steps 7–12 and receives the authorized page. An expired session follows the same server reauthentication path. A full-document reload of a marked Workspace entry uses the gate again. BFCache reuses the initialized document; its context callback does not initialize again. A fresh ordinary navigation from Account/MINI is not a Workspace restoration.

## Finding 2: identity and restoration rules

The old `ACCOUNT + reload/back_forward` branch confused navigation mechanics with application identity. It is removed, along with all reads of `PerformanceNavigationTiming.type` for Workspace initialization.

| Concept | Evidence / lifetime | Use |
| --- | --- | --- |
| Last known LIFF app | Existing session `{ current, mini, workspace }` | Link presentation only; cannot select document initialization |
| Current navigation origin | Root entry writes a handoff for the exact approved destination; consumed once, expires after 60 seconds; invalidated by Account/MINI entry | Primary-to-secondary transport only |
| Current document app | In-memory observation recorded by that document's own app after `isInClient()` | Prevent history bookkeeping from another app; lost on a new document |
| Init status | Existing single-flight gateway slot in that document | Distinguishes pending/ready/timed out; remounts cannot race another init |
| Saved Workspace history entry | Marker written only after actual init succeeds, preserving Next-owned state and URL | Reload/non-BFCache restoration of that entry; never inferred from navigation type |
| Ordinary same-origin entry | No matching handoff or marked history entry | No Workspace SDK load, including later reload/back-forward |

Neither cookies, user IDs, LINE tokens, roles, Hospital scopes nor authorization grants are stored in these transport markers. No server authorization code reads them. Corrupted/unavailable storage and mismatched/expired handoffs fail to ordinary web behavior; they cannot create or extend sessions. LIFF feature availability when storage is lost remains a device limitation, not an inferred Workspace identity.

## Executable coverage and commands

The browser harness copies current repository source into a bounded OS temp directory, excludes `.env*`, links installed dependencies, and applies a compile-time SDK alias **only in that copy**. It runs Next dev with the actual production routes/layout/services/actions, a local synthetic Supabase provider with signed JWTs, and the existing disposable database. It does not mock the protected actor resolver, server action, route response or authorization services. The module fixture uses a deliberately delayed async module evaluation, independently delayed init and an SDK-owned simulated secondary redirect. Each scenario emits ordered events as JSON. Chrome dev tools controls are excluded when checking application recovery controls.

Install optional Playwright tooling outside the repository (no application dependency/lockfile change):

```powershell
npm install --prefix "$env:TEMP/demi-liff-browser-tools" --no-package-lock --no-audit --no-fund playwright@1.58.2
$env:DEMI_PLAYWRIGHT_MODULE="$env:TEMP/demi-liff-browser-tools/node_modules/playwright/index.mjs"
$env:DEMI_CHROMIUM_EXECUTABLE='C:/Program Files/Google/Chrome/Application/chrome.exe'
npm run test:db:up
try {
  npm run prisma:migrate:test
  if ($LASTEXITCODE -ne 0) { throw 'Migration failed' }
  npm run test:workspace-liff:browser
  if ($LASTEXITCODE -ne 0) { throw 'Browser test failed' }
} finally {
  npm run test:db:down
}
```

On systems without installed Chrome, install the matching Playwright Chromium in that temporary tooling directory and omit `DEMI_CHROMIUM_EXECUTABLE`. Production code has no mock flag or SDK-loader switch. The fixture's async module can cause webpack target warnings in this isolated development harness; it is never imported by production source.

Run `npm run test:workspace-liff:browser -- --baseline` with the same disposable environment to run against the reviewed `93f0ac1` production files in the isolated copy. **Expected result: failure**, catching the old unauthenticated navigation while module/init is delayed. The current working tree and git history are never switched or rewritten.

Executed baseline result: **FAIL as expected**. While the secondary SDK module was held, the real browser loaded `/login?returnTo=%2Fapp%2Fpersonal%2Fmedications`; the assertion expected `/app/personal/medications?liff.hback=2&lineAppVersion=14.19.1`. Event order was primary init → SDK secondary → secondary document → login document → secondary module start, with no secondary init completion. The same scenario passed on the remediated source.

| Required scenarios | Executable evidence |
| --- | --- |
| A: init finishes, destination opens without loop | Browser A/F |
| B: module load delayed; then init independently delayed | Browser B/E; protected RSC/URL mutation prohibited until ready |
| C: pending past timeout | Browser C; URL retained, no protected RSC/application navigation controls |
| D: rejects | Browser D; explicit close/reopen recovery |
| E: no DEMI session; login; exact return | Browser B/E, real password server action and destination services |
| F: existing session | Browser A/F, authorized medication page without login |
| G: session expires | Browser G, provider revokes current session; server requires exact reauthentication |
| H: ordinary browser and refresh | Browser H, no SDK module import |
| I: Account and MINI isolation | Browser I variants, real app endpoints with their own mocked SDK IDs |
| Workspace → Account → Workspace URL | Browser I; root/secondary init for new entry |
| Workspace → Account → Back | Browser I; marked original Workspace entry restored and reinitialized if a new document |
| Account → ordinary app → reload/back-forward | Browser I; Workspace init count does not increase |
| MINI → Account → ordinary app; MINI → Workspace | Browser I; MINI chain retained until actual new Workspace entry |
| Workspace refresh vs ordinary refresh | Browser A/F and H |
| Corrupted/unavailable storage, expiry, mismatch, re-encoded/conflicting query | `src/components/line/workspace-liff-document.test.ts` |
| StrictMode/remount, pending/rejection, no session identity authority | Gate/gateway unit tests |
| Production Next document vs protected RSC login return | `npm run test:workspace-liff:next-smoke` after `npm run build` |

Other required verification: `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`, and `npm run test:integration` using the disposable lifecycle. Exact executed results and hosted job conclusions are recorded in the PR delivery report; a command listed here is not a claim it passed.

## Verification limits

Source inspection establishes the implementation path; official SDK docs establish the supported contract; Vitest establishes local transport/allowlist invariants; the production Next HTTP/RSC smoke checks emitted responses; Playwright establishes real Chromium routing with synthetic providers and PostgreSQL. None establishes native Android/iOS LIFF behavior, live consent, footer appearance, OS LIFF-to-LIFF storage continuity or native BFCache behavior. There is no claim of real-device E2E/UAT. Run the existing [LINE UAT](../operations/LINE_WORKSPACE_LIFF_UAT.md) on Android and iOS before production rollout. Independent engineering review and owner merge approval remain required.
