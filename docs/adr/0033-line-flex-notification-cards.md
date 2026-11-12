# ADR-0033: LINE Flex notification cards

- Status: Accepted (Product Owner, 2026-11-12)
- Date: 2026-11-12
- Supersedes: the generic-copy rule J4A-OD06 of the [17J.4A proactive notification decision pack](../phases/PHASE_17J4A_PROACTIVE_NOTIFICATION_DECISION_PACK.md) and the "no patient detail" sentence of [ADR-0023](./0023-service-request-appointments.md) "Notifications (SR-B)" for the card body only.
- Provides: the explicit content/privacy approval that [ADR-0009](./0009-demi-line-oa-liff-identity-and-messaging.md) "Trade-offs / Risks" requires before detailed patient information is sent in chat.
- Does not change: who is notified, when, eligibility and staleness checks, opt-in, retry/idempotency semantics, the outbox schema, the Rich Menu, DEMI authentication or authorization. Reactive replies are unchanged except the next-appointment reply (amendment below).

## Context

Proactive LINE Push notifications (appointment events, service requests, medication reminders, password notices) were plain text that only said "something changed, log in to DEMI". Users could not tell what happened or where to go. LINE Flex Messages can show a short structured card with one button, and the Workspace LIFF ([ADR-0031](./0031-workspace-liff-for-operational-line-entries.md)) can open a fixed DEMI page in the Full LIFF browser.

Two surfaces show a Flex Message differently: the card body is visible only inside the chat, while `altText` is shown in OS notifications (including the lock screen), the chat list and quoted replies ([Messaging API reference, Flex Message](https://developers.line.biz/en/reference/messaging-api/#flex-message)).

## Decision

### D1 — Content (Product Owner, 2026-11-12)

Cards may show appointment details: the event kind, the appointment type, the date and time (Asia/Bangkok, Thai), the location (Hospital name, or home visit) and, for recipients other than the Patient, the Patient's display name. A recipient never sees more than their existing DEMI access already shows them:

- A caregiver sees only fields their appointment grant already allows (Hospital name, appointment type, date and time, location kind, the Patient's name — every grant contract version includes these).
- An อสม. sees the Patient's name only when they currently have access to that Patient (assigned อสม., or the appointment's own อสม.). A preferred อสม. who is not the Patient's assigned อสม. does not see the Patient's name on a new service request card, because a pending request gives them no access to the Patient.
- Never shown anywhere in a card: national ID, phone number, notes, free-text reasons, location detail text, staff names, clinical detail.

Medication reminders may list the scheduled medication's name in the card body (the Patient is the only recipient and the name is their own entry). Password notices show only the time and fixed copy.

### Lock-screen rule (engineering default inside D1)

`altText` may contain only the event kind, the appointment type and the date (or, for a medication reminder, the time). It never contains the Patient's name, a national ID, a phone number, free text, a medication name or any URL. Everything else goes in the card body only. The card builder rejects an `altText` containing a URL; per-family copy tests prove the rest.

### D2 — Destinations

Every Flex button opens a LIFF URL. Operational and Patient pages use the Workspace LIFF (`buildNotificationLiffUrl`, which wraps `buildWorkspaceLiffUrl`); password recovery keeps the Account LIFF recovery URL. A notification never falls back to an ordinary web URL: without a valid Workspace LIFF, building a card fails and the delivery is recorded as a permanent failure instead of sending a degraded link. Destinations are fixed list pages from `LINE_WEB_NAVIGATION_PATHS`; no record ID is put in a URL, and every new destination is in the same exact allowlists (Workspace LIFF `liff.state`, login return) as the existing ones (ADR-0031 decisions 7 and 9).

LIFF does not sign the user in to DEMI (ADR-0031 decision 6). A user without a DEMI session in the LIFF browser sees the DEMI login once and then returns to the button's page through the existing login-return allowlist.

### D3 — Visual

Header tint by tone from the DESIGN.md colour tokens (`info`, `warning`, `danger`, `success` with their `-soft` backgrounds); brand green for the button. No images or logos. Bubble size `kilo` or `mega` only. No `deca`/`hecto`, `scaling`, `maxWidth`, `maxHeight`, `lineSpacing` or video, which need newer LINE versions. Tone: cancelled = danger, reschedule and request = warning, others = info.

### Determinism and retries

`notificationCard` is a pure function: it reads no clock, environment or database. Delivery renders the card at send time from the claimed row's current data; any source change that would change the card (a reschedule, a medication edit) already makes the row stale (`STALE_SOURCE`) before the next attempt, so one row keeps one payload across retries and the same `X-Line-Retry-Key`. Password-change time is computed once before building.

The builder enforces: non-empty `altText` of at most 400 characters (LINE allows 1,500), at most 6 fields, bounded label/value/title/note/button lengths, a LIFF button URL, and a serialized message of at most 10 KB (LINE's bubble limit is 30 KB). A violation is a programming error.

### Rollback flag

`DEMI_LINE_FLEX_MESSAGES_ENABLED` (server-only, default off; only exact `true` enables) selects Flex cards over the existing text, which stays byte-for-byte unchanged. It is read in one place (`isLineFlexMessagesEnabled`). With it on, `npm run env:check` fails unless a valid `NEXT_PUBLIC_DEMI_LINE_WORKSPACE_LIFF_ID` is configured.

This is a narrow, Product-Owner-directed provider-format switch for rollback while the cards are checked on real LINE clients. It changes only the shape of the message sent to LINE: the same people are notified about the same events with the same access. It is not a rollout framework and does not grant or remove business authority, so it is consistent with the production-code-first rule of AGENTS.md and ADR-0010. Remove it once the cards are accepted on real devices.

## Amendment — follow-ups (2026-11-12)

- **Service request button.** A PENDING request has no appointment and its list is staff-only, so only the Patient's assigned อสม. gets a button ("ดูผู้ป่วยที่ดูแล" → `/app/patients/assigned`). A preferred อสม. who is not assigned gets the card without a button and without the Patient's name.
- **Destination follows the matched authority.** Appointment event rows re-resolve อสม. and caregiver recipients with OR semantics (E6), so the card's destination and fields come from the check that passed at send time (assigned อสม. first, then an active caregiver appointment grant), not from the row's `recipientKind`.
- **Next-appointment reply.** With the flag on, the Patient's "ตรวจสอบนัดหมาย" reply for a found appointment is one card (type, date and time, location, Hospital; button "ดูนัดหมายทั้งหมด" → `/app/personal/appointments`; `altText` title, type and date only). EMPTY, INELIGIBLE and INFRASTRUCTURE_FAILURE stay text. Unlike Push, a Reply token is single-use and short-lived and the user asked for the answer, so a card that cannot be built falls back to the text reply; this is the only text fallback. The field formatting is shared through the leaf `appointments/domain/appointment-card-fields.ts`.

## Consequences

- Recipients see what happened and open the right page in one tap; healthcare activity is visible in the chat history of a recipient's LINE, as the Product Owner accepted.
- Lock screens and chat lists still show no names, identifiers or URLs.
- Notifications depend on the Workspace LIFF when the flag is on; `env:check` guards this.
- `npm run line:flex:validate` checks one synthetic sample of every card against LINE's validate endpoint. Real-device checks (iOS, Android, PC: layout, Thai wrapping, button opens the Workspace LIFF, login shown once) remain manual.
