# ADR-0035: Retire the LINE MINI App

- Status: Accepted (Product Owner decision, 2026-11-17)
- Date: 2026-11-17
- Supersedes in part: [ADR-0009](./0009-demi-line-oa-liff-identity-and-messaging.md), every decision about the LINE MINI App channel, its workflow and its deauthorization; [ADR-0031](./0031-workspace-liff-for-operational-line-entries.md), the MINI parts of decisions 2, 8 and 11 and the MINI items under "Does not change".
- Does not change: the Account LIFF, the Workspace LIFF (ADR-0031), the Rich Menu and HELP intents, notifications (ADR-0033), Account Link/Unlink/Full Disconnection/Recovery, DEMI authentication, the login-return allowlist for `/line/account` and the quick-action paths, and Role + Capability + Scope authorization.

## Context

The LINE MINI App was an optional, separate LINE channel. It had a gateway at `/line/workflow`, a verify endpoint, signed scope cookies and scoped Patient appointment pages. When no `DEMI_LINE_MINI_APP_*` variable was set, DEMI ran Account-only and the workflow routes failed closed.

In real use, users reach DEMI only through the Rich Menu (Workspace LIFF and Account LIFF) and the ordinary web app. Nothing in a supported path linked to MINI: Rich Menu and HELP intents use `buildLineIntentUrl` (ADR-0031), notifications use `buildNotificationLiffUrl` (ADR-0033), the Account client never sent `miniAccessToken`, and no LINE service messages were built. Testing showed that the Workspace LIFF covers every operational need.

## Decision

The Product Owner retires the LINE MINI App (2026-11-17). The system is in development, so no data is kept and every environment can be reset.

### Removed

- Routes and UI: `app/line/workflow/**` (gateway, scoped appointment pages, interaction handlers) and `app/api/line/workflow/**`. Both paths now get the ordinary Next.js 404. No redirect is added, because no supported link targets them.
- Proxy: the workflow namespace filter and its cache, referrer and framing headers in `proxy.ts` and `src/lib/auth/supabase-proxy.ts`.
- Login: the workflow gateway return in `login-schema.ts`.
- Transport and services: the workflow transport, `line-workflow-service.ts`, the scope context and keyring (`line-workflow-context.ts`), and `line-mini-app-configuration.ts`.
- Domain: `line-workflow-routes.ts`, and `LINE_WORKFLOW_INTENT`, `LINE_WORKFLOW_GATEWAY_PATH`, `LINE_WORKFLOW_LOGIN_RETURN_PATH` and `classifyLineWorkflowEntry` from `line-navigation-intents.ts`.
- Adapters: `verifyMiniAppWorkflowIdToken`, `deauthorizeLineMiniApp` and `LineMiniAppDeauthorizationCredentials`.
- Full Disconnection: the `miniAccessToken` branch and request field, and the MINI channel in the server-derived inventory.
- Environment: `DEMI_LINE_MINI_APP_ENVIRONMENT`, `_CHANNEL_ID`, `_LIFF_ID`, `_CHANNEL_SECRET` and `_CONTEXT_KEYRING`, and the `SAME_AS_MINI_APP_LIFF` Workspace LIFF check.
- Scripts: `scripts/line-workflow-next-smoke.mjs`, its provider mock and package script, and the MINI scenario of `scripts/workspace-liff-browser.mjs`.

### Kept, and why

1. **`line-workflow-rate-limit.ts` and the `LineWorkflowRateLimitBucket` table.** The Account status check (`ACCOUNT_STATUS_*`) and the background reachability refresh (`REACHABILITY_REFRESH_*`) use them. Only the MINI categories (`VERIFY_*`, `ACKNOWLEDGE`, `CANCELLATION_REQUEST`) are removed. The table and module keep their names. `LineWorkflowFailure` stays with the one code the limiter raises, `INFRASTRUCTURE_UNAVAILABLE`.
2. **`LineAuthorizationLifecycle`.** The Account channel's Full Disconnection and Recovery use it. The inventory is now exactly one Account channel, and the `"MINI"` tuple kind is gone. The Account tuple definition and key are unchanged. No migration is needed: the tuple is stored as text and the databases are reset. A persisted row whose kind is not `ACCOUNT` still displays as "แอป DEMI ที่เคยเชื่อมต่อ" and stays enforceable history.
3. **The Workspace LIFF (ADR-0031).** The session presentation value is now `{ current, workspace }` with `current` = `WORKSPACE` | `ACCOUNT`. Every state reachable without MINI resolves the Account and Workspace links exactly as before. A value stored before the deploy that still has a `mini` field or `current: "MINI"` reads as no context, never as Workspace-ready, and the next real entry rewrites it. The handoff, history marking, LINE Login return latch, bounded init and RSC-failure latch are unchanged.
4. **The `liff.*` platform-parameter rules, `LIFF_PLATFORM_PARAMETERS` and the LINE Login return markers.** They belong to LINE entry handling, not to MINI.

### Leftover configuration fails loudly

`npm run env:check` (the deployment check's production profile) reports every variable whose name starts with `DEMI_LINE_MINI_APP_`, even an empty one, as `RETIRED` and fails. It prints only the name, never the value, so a forgotten channel secret or keyring cannot stay on a server unnoticed. The runtime readiness probe still checks only the CORE group, so a leftover variable does not take a running server out of service.

## Manual steps

The code cannot do these:

1. Remove every `DEMI_LINE_MINI_APP_*` variable from each server and environment file (including `/etc/demi/demi.env` and local `.env` files), then run `npm run env:check -- <env-file>`.
2. In LINE Developers, unpublish and delete the MINI App channel, or at least remove its Endpoint URL. Keep the Account LINE Login channel, both LIFF apps (Account and Workspace) and the Messaging API channel.
3. Reset the development databases as planned.

## Consequences

- Patients see appointments only through the ordinary pages (`/app/personal/appointments`), opened from the Workspace LIFF or a browser.
- An open tab from before the deploy may show the ordinary `/line/account` link until its next Workspace entry. This is presentation only and never grants access.
- Historical phase documents about MINI (Phase 17J.3A/3B, LINE-QA.B1–B2.4) stay as records; [docs/phases/README.md](../phases/README.md) points here.
