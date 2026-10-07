# Phase 17J.1 — External DEMI LINE Setup Runbook

This checklist is for an operator configuring real provider resources. The repository implementation and fake-adapter tests do not perform these external operations.

## Provider and channels

1. Create or select a dedicated DEMI LINE Provider.
2. Create/link the DEMI Official Account and its Messaging API channel under that Provider.
3. Create the dedicated DEMI LINE Login channel and LIFF app under the same DEMI Provider. Do not reuse NHFapp provider/channel credentials or configuration.
4. Set the LIFF endpoint to `https://<DEMI-origin>/line/account`, using the same canonical HTTPS origin configured as `DEMI_LINE_PUBLIC_ORIGIN`.
   The account-management and account-link Rich Menu URI is `https://liff.line.me/<LIFF_ID>` with no extra path. LINE combines a path added after the LIFF ID with the configured endpoint path, so appending `/line/account` again would duplicate the route. See [Opening a LIFF app](https://developers.line.biz/en/docs/liff/opening-liff-app/).
5. Enable LIFF `openid` and `profile` scopes. `openid` is used to obtain the ID token; `profile` is needed only for the optional server-verified friendship check.
6. Set the Messaging API webhook URL to `https://<DEMI-origin>/api/line/webhook`, enable webhook delivery in LINE Console, and confirm the configured bot destination matches `DEMI_LINE_MESSAGING_BOT_USER_ID`.

## LINE OA friendship prompt for UAT/demo

Link the DEMI LINE Official Account to the same LINE Login channel that hosts the LIFF app. Set the LIFF app's Add friend option (`botPrompt`) to **Normal** for UAT/demo. LINE displays the add/unblock option on the consent screen; `Aggressive` adds a separate screen after consent and therefore adds another step. Normal is the shorter first-login path. This prompt may not appear again after consent, so use the account page's explicit **「เพิ่ม DEMI เป็นเพื่อน」** action for users who are still not friends or have blocked the OA.

Keep the LIFF app screen size set to **Full**. The in-client `liff.requestFriendship()` action is available only in a Full LIFF browser. The app checks this environment before showing the action. The server-verified friendship check remains available through the existing account page flow.

These are manual LINE Console settings. Do not infer that they are configured from application code. See LINE's [Add friend option for LINE Login](https://developers.line.biz/en/docs/line-login/link-a-bot/) and [LIFF `requestFriendship()` reference](https://developers.line.biz/en/reference/liff/#requestfriendship).

## Protected environment values

Set these in the server environment through the existing secret-management process:

- `DEMI_LINE_MESSAGING_CHANNEL_SECRET`
- `DEMI_LINE_MESSAGING_CHANNEL_ACCESS_TOKEN`
- `DEMI_LINE_MESSAGING_BOT_USER_ID`
- `DEMI_LINE_LOGIN_CHANNEL_ID`
- `DEMI_LINE_PUBLIC_ORIGIN`
- `NEXT_PUBLIC_DEMI_LINE_LIFF_ID`
- existing `IDENTITY_HASH_SECRET`

Never put server credentials in `NEXT_PUBLIC_*`, source control, LIFF URLs, analytics, or logs. Do not rotate `IDENTITY_HASH_SECRET` without a separately approved comparison-preserving migration plan.

## Shared Rich Menu provisioning

1. Review the read-only plan: `npm run line:rich-menu:reconcile`.
2. Apply explicitly: `npm run line:rich-menu:reconcile -- --apply`.
3. Verify 18 shared resources, image read-back, stable aliases, and the UNLINKED default menu in provider state/LINE Console. The command must be rerun safely; it does not provision on application startup or during builds/migrations.
4. For bounded binding repair, first review `npm run line:rich-menu:reconcile -- --repair --limit=50`; apply only when ready with `--apply`. Continue with the UUID cursor printed by the command using `--after=<UUID>`.

## Real account and device UAT prerequisites

Prepare non-production DEMI users and real LINE accounts for unlinked and ineligible accounts; PATIENT, OSM, and HOSPITAL; each two-role combination; and all three operational roles. Verify authenticated LIFF linking, same-user relink, unlink cleanup/read-back, recovery after provider interruption, follow/unfollow reachability, current-role switching, stale preference behavior, and mobile rendering in supported LINE clients. Record provider-side setup and device results separately from automated test results. Never use National ID, HN, clinical content, or delegated authority in LINE account-link state.

**No provider creation, channel configuration, credential installation, asset upload, alias creation, default-menu mutation, account link, block/unblock test, or mobile rendering check is claimed by this runbook.**
