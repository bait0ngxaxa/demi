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
- `node_modules/next/dist/server/web/adapter.js`: default normalization removes Flight headers and reserializes rewrite destinations. The official `skipProxyUrlNormalize` option retains raw URL and headers. `NextURL` loopback hostname normalization combined with the server's raw init URL otherwise turns a local rewrite into an HTTP hop. [Official Proxy documentation](https://nextjs.org/docs/app/api-reference/file-conventions/proxy#advanced-proxy-flags) and installed `config-shared.d.ts` verify the option.
- Installed Next docs: `01-app/03-api-reference/04-functions/{redirect,use-router}.md` and Proxy reference. `refresh()` retrieves RSC while preserving the document.

**Correction:** Document requests are internally rewritten to a dedicated public transport shell, preserving the original address and excluding the protected route tree entirely. The documented Next `skipProxyUrlNormalize` setting preserves raw origins and Flight headers so the rewrite remains internal under loopback reverse proxy hosting. Only literal `_rsc` transport segments are removed from the derived RSC return-path lookup; application query bytes remain raw and ordered. This transport selection cannot authorize data. The protected route is requested as RSC only after this document's required init completes. Consequently neither a client redirect, HTTP redirect from the protected tree, nor a meta-refresh exists in the initial transport document. No protected data is supplied to the shell. All real reads/actions still execute existing session/resource/role checks on the server. Calling RSC directly can skip transport UI only; it cannot skip authorization.

The shell and root entry expose no application navigation controls while SDK work may be running. A ten-second timeout does not cancel SDK work. Rejection/timeout asks the user to close and reopen from LINE, and does not silently continue, race another init or reload the document. Ordinary browsers request RSC immediately without importing the SDK. The cost is one additional RSC request and a JavaScript requirement for initial app/login document loads.

## Lifecycle timeline after correction

`D1` and `D2` are different browser documents. Workspace is the configured Workspace LIFF ID; these labels describe transport, never DEMI identity.

| Step | Active document / owner | SDK status and redirect phase | URL / parameter handling | DEMI boundary |
| --- | --- | --- | --- | --- |
| 1. LINE opens Workspace deep link | LINE launcher, before DEMI document | Platform selects Workspace LIFF URL | LINE-managed navigation | No DEMI grant |
| 2. Primary reaches `/` | D1, Workspace entry signal | Not started; primary | `liff.state`, bookkeeping and possibly credential fragment untouched | Public transport only |
| 3. Root starts init | D1, Workspace | SDK load then primary init pending | Exact allowlisted one-shot handoff recorded; no app URL mutation | No session creation from LINE tokens |
| 4. SDK secondary redirect | D1 replaced by D2, Workspace | SDK owns redirect; D1 promise need not resolve | SDK consumes credentials/state and composes secondary URL, preserving its bookkeeping | No protected data |
| 5. `/app/...` loads | D2, matched Workspace handoff | New-document init required, then pending | Internal rewrite renders only the dedicated transport shell; visible path/query/fragment unchanged | Protected tree not requested yet |
| 6. Protected actor resolution | D2, Workspace | **Only after D2 init resolves**; RSC request | History marker recorded without changing URL; same-document refresh | Existing server actor resolver runs |
| 7. No DEMI session | D2, initialized Workspace | Ready | Allowlisted login return derived from original request | Server denies protected access |
| 8. Next emits streamed redirect | D2, initialized Workspace | Ready, no competing init | RSC redirect can now be consumed; no pre-init HTML meta-refresh exists | Existing server decision |
| 9. Hydration | D2 | Transport shell hydrated before steps 5–6; protected RSC merges after ready | No routing effect is used as an initialization barrier | No client auth authority |
| 10. Init starts/resumes | D2 | Starts at step 5; remount joins the actual document promise, not another init | Required URL remains intact until completion | Transport only |
| 11. Navigate `/login` | D2, initialized Workspace | Ready; ordinary SPA navigation | Next changes URL after init. Login form can then handle its own fragment | Login page reads current server access |
| 12. DEMI authenticates | D2 | Same initialized SDK; no re-init for SPA | Actual password server action + Supabase SSR cookie semantics | Server verifies credentials and mapped active actor |
| 13. Restore destination | D2 | Ready | Existing login allowlist restores exact approved destination; no arbitrary URL added | Destination services authorize again |

If the secondary SDK itself needs LINE Login, a pre-init one-shot match for that exact document allows the SDK-owned callback to open D3 and initialize afresh before step 6. This is independent of DEMI login and never reuses D2's promise in D3.

An existing session skips steps 7–12 and receives the authorized page. An expired session follows the same server reauthentication path. A full-document reload of a marked Workspace entry uses the gate again. BFCache reuses the initialized document; its context callback does not initialize again. A fresh ordinary navigation from Account/MINI is not a Workspace restoration.

## Finding 2: identity and restoration rules

The old `ACCOUNT + reload/back_forward` branch confused navigation mechanics with application identity. It is removed, along with all reads of `PerformanceNavigationTiming.type` for Workspace initialization.

| Concept | Evidence / lifetime | Use |
| --- | --- | --- |
| Last known LIFF app | Existing session `{ current, mini, workspace }` | Link presentation only; cannot select document initialization |
| Current navigation origin | Root entry writes a handoff for the exact approved destination; a proven Workspace document can separately prepare its own current URL for an SDK-owned LINE Login return. Consumed once, expires after 60 seconds; invalidated by Account/MINI entry; cleared on successful init or actual rejection | Primary/secondary and SDK callback transport only; stored paths are compared, never navigated or passed as DEMI `returnTo` |
| Current document app | In-memory observation recorded by that document's own app after `isInClient()` | Prevent history bookkeeping from another app; lost on a new document |
| Init status | Existing single-flight gateway slot in that document | Distinguishes pending/ready/timed out; remounts cannot race another init |
| Saved Workspace history entry | Marker written only after actual init succeeds, preserving Next-owned state and URL | Reload/non-BFCache restoration of that entry; never inferred from navigation type |
| Ordinary same-origin entry | No matching handoff or marked history entry | No Workspace SDK load, including later reload/back-forward |

The SDK-return writer reads only the proven document's current app/login URL (bounded to 4096 characters); it does not accept an arbitrary destination argument. Resource-page callback matching does not expand the separate DEMI login-return allowlist. A callback after handoff expiry or storage loss cannot imply Workspace identity. Platform-bearing URLs without ownership remain on explicit recovery without SDK initialization or navigation; clean ordinary URLs continue as web documents.

Neither cookies, user IDs, LINE tokens, roles, Hospital scopes nor authorization grants are stored in these transport markers. No server authorization code reads them. Corrupted/unavailable storage and mismatched/expired handoffs cannot create or extend sessions: clean ordinary URLs continue on the web, while unowned platform-bearing URLs require close/reopen recovery without discarding SDK parameters. LIFF feature availability when storage is lost remains a device limitation, not an inferred Workspace identity.

## Executable coverage and commands

The browser harness copies current repository source into a bounded OS temp directory, excludes `.env*`, links installed dependencies, and applies a compile-time SDK alias **only in that copy**. By default it runs Next dev; with `--production` it runs `next build` and `next start` (see Production browser mode). Both use the actual production routes/layout/services/actions, a local synthetic Supabase provider with signed JWTs, and the existing disposable database. It does not mock the protected actor resolver, server action, route response or authorization services. The module fixture uses a deliberately delayed async module evaluation, independently delayed init and an SDK-owned simulated secondary redirect. Each scenario emits ordered events as JSON. Chrome dev tools controls are excluded when checking application recovery controls.

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
  npm run test:workspace-liff:browser -- --production
  if ($LASTEXITCODE -ne 0) { throw 'Production browser test failed' }
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
| SDK independently requires LINE Login | Additional browser scenario: SDK-owned callback creates a third document with `code`/`liffClientId`; delayed callback init finishes before protected RSC and DEMI login; LINE Login does not establish a DEMI session |
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
| Query destination (`/app/patients/assigned?task=screening`): init → protected RSC → no session → login → exact return; existing session | Browser J, including `--production` |
| Single protected RSC network failure / 503 non-RSC response after init | Browser K: Next same-URL document fallback, one init per document, protected RSC only after recovery init, screening renders |
| Persistent protected RSC failure (LIFF and ordinary) | Browser L: three continuations, fourth document stops without init/RSC and shows no application controls; continuation latch unit tests |

### Production browser mode

`npm run test:workspace-liff:browser -- --production` runs the same scenarios against `next build` (default Turbopack, as the CI Production Build job) and `next start` in the disposable copy. Only that copy receives a Turbopack `resolveAlias` for `@line/liff`. Its `turbopack.root`/`outputFileTracingRoot` is the nearest directory containing both the copy and the linked repository `node_modules`, because Turbopack rejects symlinks outside its root. The canonical-host guard stays active. Chromium maps the configured public host `demi.example.org:80` to the loopback server, so requests carry the canonical `Host` header. The existing webpack production build in an isolated copy is not used: an unrelated client import of `node:crypto` fails under webpack. Before the latch, a persistent failure observation on production produced 131 documents and 130 `liff.init()` calls in 15 seconds.

The first hosted run at `3d043a75` passed quality, unit and integration, but failed Production Build at `/app/hospitals/settings`: `useSearchParams()` required Suspense. History observation was placed inside the existing protected Suspense boundary; initialization remains in the public gate. A local build also hit the default approximately 2 GB TypeScript heap limit; the subsequent build uses the existing CI setting `NODE_OPTIONS=--max-old-space-size=4096`, without changing repository build configuration. The production smoke also reproduced a loopback-host normalization failure of internal rewrite under the documented reverse-proxy topology: the rewrite became a canonical-host 308 before init. A same-route layout gate also failed executable smoke because Next renders child routes independently and emitted an auth redirect despite the parent omitting children. The final implementation retains the dedicated public shell and uses the documented raw-URL option; no host guard is weakened and no special internal-host bypass is added. The smoke sends Next 16's empty `_rsc` union key for its RSC requests, matching the installed fetch contract. The latest-HEAD hosted results must be checked independently of that earlier run.

Other required verification: `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`, and `npm run test:integration` using the disposable lifecycle. Exact executed results and hosted job conclusions are recorded in the PR delivery report; a command listed here is not a claim it passed.

## Verification limits

Source inspection establishes the implementation path; official SDK docs establish the supported contract; Vitest establishes local transport/allowlist invariants; the production Next HTTP/RSC smoke checks emitted responses; Playwright establishes real Chromium routing with synthetic providers and PostgreSQL. None establishes native Android/iOS LIFF behavior, live consent, footer appearance, OS LIFF-to-LIFF storage continuity or native BFCache behavior. There is no claim of real-device E2E/UAT. Run the existing [LINE UAT](../operations/LINE_WORKSPACE_LIFF_UAT.md) on Android and iOS before production rollout. Independent engineering review and owner merge approval remain required.
