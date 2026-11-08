# ADR-0031: Workspace LIFF for operational LINE entries

- Status: Accepted (Product Owner direction, 2026-11-08)
- Date: 2026-11-08
- Supersedes in part: the "ลิงก์เมนูงานเปิด **เว็บ DEMI ปกติ** … ไม่ใช่ LIFF" decision of [Phase LINE-QA.A — Hybrid Quick Action Rich Menu](../phases/PHASE_LINE_QA_A_HYBRID_QUICK_ACTION_RICH_MENU.md), for operational entries launched from LINE only.
- Amends: [ADR-0009](./0009-demi-line-oa-liff-identity-and-messaging.md) decision 1 (one more LIFF app in the same DEMI LINE Login channel). Every other ADR-0009 decision is unchanged.
- Does not change: DEMI authentication, login-return allowlist, Role + Capability + Scope authorization, Account LIFF, Account Link/Unlink/Full Disconnection/Recovery, the MINI App channel and its scoped routes, Rich Menu catalog/role presentation (Option C), notifications, database schema.

## Context

The hybrid Quick Action design opened Patient, OSM and Hospital work from the Rich Menu and HELP Quick Reply as ordinary HTTPS URLs. LINE opens such URLs in its ordinary in-app browser, which shows LINE's browser footer, while the Account LIFF opens in the Full LIFF browser without it. The Product Owner directed that every supported operational workflow launched from the DEMI OA open and stay in a Full-size LIFF browser. This is browser-container behavior chosen by LINE from the URL type; it cannot be fixed with CSS.

Verified platform behavior (LINE LIFF documentation and `@line/liff` 2.31.1 source):

- `https://liff.line.me/<liffId>/<path>?<query>` opens the Endpoint URL (primary redirect) with `liff.state=/<path>?<query>`; `liff.init()` then calls `location.replace()` to Endpoint path + `<path>?<query>` (secondary redirect) and its promise does not settle.
- A bare `https://liff.line.me/<liffId>` primary redirect carries credentials only in the URL **fragment** (`#access_token=…&context_token=…`), which the server cannot see. LINE warns that changing the URL or answering 301/302 before `liff.init()` resolves can break opening, and that the primary redirect URL holds the user's access token.
- With an Endpoint URL that has no path or query, the secondary redirect URL is the origin plus the LIFF URL's additional path, so no second `liff.init()` is required at the secondary URL.

## Decision

1. **One new LIFF app, "DEMI Workspace"**, in the existing DEMI LINE Login channel of the existing DEMI Provider. Size **Full**, Endpoint URL `<DEMI_LINE_PUBLIC_ORIGIN>/`, scopes `openid profile`. Its public ID is `NEXT_PUBLIC_DEMI_LINE_WORKSPACE_LIFF_ID`. `NEXT_PUBLIC_DEMI_LINE_LIFF_ID` remains the Account LIFF only.
2. **Configuration is validated, never substituted.** The Workspace LIFF ID must match the LIFF ID format, start with `DEMI_LINE_LOGIN_CHANNEL_ID-` (a LIFF ID is `<channelId>-<suffix>`) and differ from the Account and MINI LIFF IDs. Otherwise it is unavailable; no code path falls back to another LIFF identity. `env:check` validates it once set.
3. **`/` is the Workspace LIFF entry.** It no longer answers with a server redirect. A small client entry loads the LIFF SDK only when LIFF query parameters or LIFF credential fragments are present, lets `liff.init()` consume them first, and otherwise continues ordinary browsers immediately to `/app` (authorized) or `/login`. `liff.state` is accepted only for the fixed destinations derived from `LINE_WEB_NAVIGATION_PATHS`; anything else is rejected before initialization. Init is single-flight and bounded (10 s); LINE Login returns have a loop latch; external browsers are never sent to LINE Login (`withLoginOnExternalBrowser: false`). `/` responses are `private, no-store` and `no-referrer`.
4. **Deep links.** `buildLineIntentUrl()` routes operational intents to `https://liff.line.me/<WORKSPACE_LIFF_ID><fixed path>` (Rich Menu URI areas and HELP Quick Reply). Account intents stay on the Account LIFF. `message` and `richmenuswitch` actions are unchanged. Until a valid Workspace LIFF is configured the builder keeps the previous ordinary web URL; this is technical provider configuration, not a business feature switch.
5. **No second application.** The Workspace LIFF is transport only. The secondary redirect opens the existing `/app/...` routes; internal Next.js navigation, server-action redirects and full-document same-origin navigation stay in the same LIFF browser. No `/liff` route tree is added.
6. **LINE identity is not DEMI authentication.** The Workspace entry sends no LIFF token to DEMI and creates no session. Unauthenticated users get the existing DEMI login and the existing exact login-return allowlist; every page keeps its server authorization.

## Alternatives considered

- **Dedicated gateway Endpoint (e.g. `/line/workspace`)**: rejected. LIFF prepends the Endpoint path to the deep-link path (`/line/workspace/app/...`), so either every route moves or destinations travel as query intents to a client router. The root Endpoint keeps the existing routes and their login returns exactly.
- **Keep the server redirect on `/` and only add a gateway when `liff.state` is present**: rejected. A bare LIFF launch has no query; a 307 would bypass `liff.init()` and carry the credential fragment into `/app`'s URL.
- **Authenticate DEMI from the LIFF ID token**: rejected by ADR-0009 and by owner direction.
- **CSS to hide the footer**: impossible; the footer belongs to LINE's browser.

## Consequences

- Ordinary visits to `/` take one client-side hop instead of a 307; a no-JavaScript continue link is rendered. Other routes are unchanged.
- Opening the Workspace LIFF in LINE grants the existing DEMI LINE Login channel's `openid profile` consent, the same channel the Account LIFF already uses. Full Disconnection already deauthorizes that channel; reopening the Workspace LIFF afterwards can grant consent again. The unlinked Rich Menu has no Workspace entries, so this requires an old message or a typed LIFF URL.
- Messages and user-bound Rich Menus issued before rollout keep ordinary web URLs and still open in the ordinary in-app browser until Rich Menus are reconciled and repaired; past chat messages cannot be changed.
- `NEXT_PUBLIC_DEMI_LINE_WORKSPACE_LIFF_ID` is inlined at build time; the deployed build and the reconcile script must use the same value.
- Real-device behavior (footer absence, cross-LIFF transitions, cookie persistence) is verified only by the UAT in [LINE_WORKSPACE_LIFF_UAT](../operations/LINE_WORKSPACE_LIFF_UAT.md); automated tests mock the SDK.

## Open questions for UAT

- Navigating from inside the Workspace LIFF to `/line/account` (an Account LIFF page opened by URL rather than by `https://liff.line.me/<accountId>`) relies on the SDK's subsequent-LIFF-app login. If UAT shows it fails, switch the in-app Account links to the Account LIFF URL.
- `target="_blank"` links (legal documents, evidence images, workforce slips) may open outside the LIFF browser; they are document views, not workflow steps, and are left unchanged unless UAT shows a broken return.
- After a LIFF-forced LINE Login in LINE, the SDK appends `liff.hback` to the secondary redirect URL, so the exact-match login return does not apply and an unauthenticated user returns to `/app` after DEMI login.
