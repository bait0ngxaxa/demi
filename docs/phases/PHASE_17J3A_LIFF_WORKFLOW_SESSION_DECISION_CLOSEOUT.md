# Phase 17J.3A — LIFF Workflow / Session Decision Closeout

- **Phase 17J.3A — CLOSED / OWNER DECISION COMPLETE**
- Owner decision date: **2026-10-08**
- Repository/source baseline: `6e70b38f01e67cdb3b4f15f3cc1d996f247e34d7`
- Repository: `bait0ngxaxa/demi`
- This document records product decisions and the handoff boundary. It does not claim runtime implementation, provider provisioning, or device UAT.

## 1. Status and source baseline

### Owner-directed target and care-navigation clarification — 2026-10-08

The owner explicitly authorizes these two narrow revisions for the 17J.3B remediation. For LINE-launched OPEN_PATIENT_APPOINTMENTS only, the initial root is now **/line/workflow/appointments**, with history/detail and the existing interactions inside a mandatory LINE-scoped namespace. **/app/personal/appointments remains the unchanged ordinary DEMI route.** Both entry paths reuse existing Appointment presentation, application/domain services, policies and persistence. This is an integration boundary, not a second Appointment application.

Broader care/personal navigation is an **explicit exit** from that scoped workflow. The UI must identify the destination as ordinary DEMI before navigation; ordinary authentication/domain authorization applies there and no LINE authority transfers. Returning to scoped routes requires a currently valid scoped context and all current checks; exit does not grant or extend it.

This dated clarification supersedes only the historical ordinary-path initial target in Q01/Q04 and the previously unresolved care-navigation continuity boundary. Root-only first entry, all remaining Q01–Q16 restrictions, Q07=C, normal DEMI credentials, wrong-account denial, Q16 lifetime enforcement and ordinary-web independence remain binding. Historical tables/flow below record the original closeout unchanged. It grants neither technical clearance nor runtime implementation. See the [remediated 17J.3B contract](./PHASE_17J3B_MINI_APP_WORKFLOW_TECHNICAL_CONTRACT.md) for current mechanics, evidence limits and NO-GO gates.

### Owner-directed Full LINE Integration Disconnection clarification — 2026-10-08

The owner now explicitly defines **“Unlink LINE from DEMI” as FULL LINE INTEGRATION DISCONNECTION**: one operation immediately revokes local binding/advances lifecycle and initiates removal of all applicable DEMI Account LIFF/Login and MINI internal-channel permissions. Local and external completion are separate; unconfirmed removal must remain visible with identity-verified recovery. A new grant/binding must not be exposed to unresolved older termination. Temporary affected-operation restrictions are accepted when necessary; indefinite blocking without recovery is not.

This supersedes only the historical assumption that local unlink/menu cleanup is full completion, unchanged-Account wording that excludes necessary termination/status/recovery/fences, unconditional relink during unresolved termination, and the MINI-only lifecycle draft as sole product model. Existing Account channel/LIFF/audience, Q07=C same-Provider MINI topology, explicit ownership/conflict policy, normal credentials, SELF/domain rules, Family/J2/menu boundaries and the scoped route/care clarification remain authoritative. No User/Patient/appointment/history deletion, ordinary session revocation solely from unlink, OA unfriending, unrelated LINE logout, account transfer or old workflow-session restoration is approved.

The owner decides product behavior, **not a database schema, operator release authority, provider recovery guarantee or indefinite relink restriction**. The [17J.3B lifecycle contract](./PHASE_17J3B_MINI_APP_WORKFLOW_TECHNICAL_CONTRACT.md#231-full-line-integration-disconnection--final-lifecycle-contract) selects a narrow engineering proposal and retains **NO-GO** pending verifiable absence/removal and safe release after ambiguous provider submission. [ADR-0009](../adr/0009-demi-line-oa-liff-identity-and-messaging.md#full-disconnection-amendment--2026-10-08) records this narrow later exception. Earlier closeout tables/status/validation below are phase-time history; no runtime is authorized or changed by this clarification.

The owner explicitly approved J3-Q01 through J3-Q12 and J3-Q15 through J3-Q16 on 2026-10-08. J3-Q13 preserves the already-closed multi-role authorization architecture. J3-Q14 preserves the accepted first-slice URL/privacy boundary. These decisions close Phase 17J.3A product scope; they do not approve technical mechanics or runtime work.

The reviewed baseline was clean at commit `6e70b38f01e67cdb3b4f15f3cc1d996f247e34d7`, which includes the 2026-10-08 decision-pack topology correction. No material conflict with accepted ADR-0009 was found: a new MINI App channel remains under DEMI's existing Provider, while LINE identity remains separate from DEMI authentication and authorization. ADR-0009 is unchanged.

Current phase statuses:

- Phase 17J.2: **CLOSED / IMPLEMENTED / AUTOMATED VERIFICATION COMPLETE**.
- Phase 17J.3A: **CLOSED / OWNER DECISION COMPLETE**.
- Phase 17J.3B: **NOT STARTED / TECHNICAL CONTRACT REQUIRED**.
- Phase 17J.3 runtime: **NOT IMPLEMENTED**.
- Phase 17J.4: **NOT STARTED**.
- P17D-NOTIF-01: **OPEN**.

## 2. Explicit owner approval

The project owner explicitly approved the product decisions recorded below on 2026-10-08. The approved scope is the first bounded Patient Appointment workflow launched through a new LINE MINI App channel under the existing DEMI Provider, while retaining normal DEMI authentication, current server authorization, and ongoing LINE-binding consistency for the LINE-scoped workflow.

The approval does not select the exact channel ID, LIFF ID, endpoint environment, Developing/Review/Published configuration, session-context mechanism, redirect encoding, or other technical mechanics. Those are required topics for Phase 17J.3B. No runtime GO is granted by this closeout.

## 3. Authoritative sources

This closeout is the current owner-decision authority for Phase 17J.3A. The [decision pack](./PHASE_17J3A_LIFF_WORKFLOW_SESSION_DECISION_PACK.md) retains its alternatives, repository evidence, platform evidence, and pre-closeout recommendation history.

The decision boundary was checked against:

- [ADR-0009 — DEMI LINE OA, LIFF Identity and Messaging Boundary](../adr/0009-demi-line-oa-liff-identity-and-messaging.md)
- [Phase 17J.0 — LINE OA / LIFF Architecture and Identity Contract](./PHASE_17J0_LINE_OA_LIFF_ARCHITECTURE_IDENTITY_CONTRACT.md)
- [Phase 17J.0B — Multi-role Rich Menu Decision Closeout](./PHASE_17J0B_MULTI_ROLE_RICH_MENU_DECISION_CLOSEOUT.md)
- [Phase 17J.1 — Account Linking / Rich Menu Implementation Contract](./PHASE_17J1_LINE_ACCOUNT_LINK_RICH_MENU_IMPLEMENTATION_CONTRACT.md)
- [Phase 17J.1 — Account Linking / Rich Menu Implementation Handoff](./PHASE_17J1_LINE_ACCOUNT_LINK_RICH_MENU_IMPLEMENTATION.md)
- [Phase 17J.2A — Reactive Messaging Decision Closeout](./PHASE_17J2A_REACTIVE_MESSAGING_DECISION_CLOSEOUT.md)
- [Phase 17J.2B — Deterministic Reactive Messaging Technical Contract](./PHASE_17J2B_DETERMINISTIC_REACTIVE_MESSAGING_TECHNICAL_CONTRACT.md)
- [Phase 17J.2 — Deterministic Reactive Messaging Implementation Handoff](./PHASE_17J2_DETERMINISTIC_REACTIVE_MESSAGING_IMPLEMENTATION.md)
- [Project Context](../CONTEXT.md)

Historical status labels in earlier phase documents remain evidence of their status at the time. This closeout and the current-status summary in CONTEXT record the current Phase 17J.3A disposition.

## 4. J3-Q01–Q16 decision closeout

| ID | Final decision | Final status |
| --- | --- | --- |
| J3-Q01 | **A** — Patient Appointment list/detail is the first bounded LINE MINI App workflow. Initial target: /app/personal/appointments. Relationship history and detail navigation remain inside the authenticated DEMI application. No new Appointment domain model. | **CLOSED / OWNER APPROVED — 2026-10-08** |
| J3-Q02 | **A — NO.** LINE identity, MINI App identity, verified ID tokens, and an ACTIVE LINE binding do not create a DEMI/Supabase application session. No passwordless DEMI login from LINE and no Supabase session minting from LINE identity or binding. Existing DEMI authentication remains authoritative. ADR-0009 remains accepted and unchanged. | **CLOSED / OWNER APPROVED — 2026-10-08** |
| J3-Q03 | **B** — Use normal DEMI credential authentication. After successful login, return through a bounded, allowlisted workflow navigation lifecycle. No Patient data before authentication and current authorization. No session credentials in URLs. | **CLOSED / OWNER APPROVED — 2026-10-08** |
| J3-Q04 | **B** — Use a server-owned named navigation intent: OPEN_PATIENT_APPOINTMENTS, resolved to /app/personal/appointments. Never accept arbitrary return URLs or client-selected resource targets. Exact encoding and transport are deferred to 17J.3B. | **CLOSED / OWNER APPROVED — 2026-10-08** |
| J3-Q05 | **A** — Initial LINE entry opens the Appointment root only. No relationship ID or appointment ID in the initial entry, Rich Menu data, URL state, or login-return intent. Existing authenticated DEMI navigation handles relationship/detail selection. Existing internal DEMI resource routes remain valid. | **CLOSED / OWNER APPROVED — 2026-10-08** |
| J3-Q06 | **A** — Reuse the existing authenticated Appointment UI. Its already-approved Patient acknowledgement and cancellation-request controls remain available under existing authorization, nonce, version, idempotency, and transactional business rules. This includes the current UI's already-authorized Hospital/relationship information, HN, appointment details, clinician/location presentation, and existing care navigation. Cancellation request is not direct cancellation. No new reschedule/create/cancel workflow or Appointment mutation is approved. | **CLOSED / OWNER APPROVED — 2026-10-08** |
| J3-Q07 | **C** — Create a **new LINE MINI App channel under the same existing DEMI Provider** for the first bounded business workflow. Preserve the existing Account LIFF. Same-Provider subject consistency does not make channel token audiences interchangeable; verify the MINI App identity token against the correct server-owned expected MINI App channel/audience. Exact IDs and environment configuration remain open for 17J.3B and later operator provisioning. | **CLOSED / OWNER APPROVED — 2026-10-08** |
| J3-Q08 | **A** — Add a dedicated Patient Rich Menu action labeled “ดูนัดหมายทั้งหมด” in a future runtime slice. It is eligible only for PATIENT_DIRECT, PATIENT_PATIENT_OSM, PATIENT_PATIENT_HOSPITAL, and PATIENT_PATIENT_OSM_HOSPITAL. It is absent from UNLINKED, LINKED_INELIGIBLE, ROLE_CHOOSER, and OSM-selected menus. Menu presence remains presentation only. | **CLOSED / OWNER APPROVED — 2026-10-08** |
| J3-Q09 | **A** — Preserve “ข้อมูลของฉัน” with its broad Personal workspace meaning and ordinary DEMI web destination. Preserve the 17J.2 “ตรวจสอบนัดหมาย” command. The new detailed-workflow action is separate from both. | **CLOSED / OWNER APPROVED — 2026-10-08** |
| J3-Q10 | **B** — Use a thin LINE MINI App entry/session/navigation gateway and reuse the responsive DEMI Appointment pages. No duplicate Appointment React pages, separate Patient domain API, duplicated authorization, iframe, second business application, or generic workflow framework. DEMI remains the owner of business UI, domain logic, and authorization. | **CLOSED / OWNER APPROVED — 2026-10-08** |
| J3-Q11 | **B** — For LINE-launched workflows, return through the bounded workflow gateway after normal DEMI login. Re-evaluate fresh LINE proof, current ACTIVE binding, current DEMI session, binding User/session User equality, and current PATIENT SELF authority. Exact browser redirect, session-context, and return-state mechanics remain for 17J.3B. Preserve Account LIFF and Family invitation login-return behavior. | **CLOSED / OWNER APPROVED — 2026-10-08** |
| J3-Q12 | **Normal application navigation**, with an optional return/close affordance only where supported by the initialized MINI App/LIFF context. Do not assume closeWindow works in every browser or make completion depend on closing LINE. Do not auto-close after acknowledgement or cancellation request. External browser fallback remains usable. | **CLOSED / OWNER APPROVED — 2026-10-08** |
| J3-Q13 | Preserve the existing closed architecture. Single-role and multi-role Patient users use the same Patient SELF workflow. No presentationRole in Patient authorization and no role-switch/role-authority URL parameters. Current ActorContext and persisted SELF policy remain authoritative. | **CLOSED BY EXISTING ARCHITECTURE** |
| J3-Q14 | Preserve the accepted first-slice security boundary. Application-authored navigation state contains only the finite named workflow intent and minimum non-authoritative navigation-control data needed by supported platform mechanics. No resource, identity, or clinical information in initial LINE state; no application token in URL/query/fragment/referrer; no LINE subject or DEMI user identity in navigation state. Platform-supplied LIFF redirect parameters are untrusted and require careful handling under official SDK behavior. | **CLOSED / ACCEPTED FIRST-SLICE SECURITY BOUNDARY** |
| J3-Q15 | **FAIL CLOSED.** If current ACTIVE binding resolves verified LINE identity to DEMI User A while the authenticated browser session belongs to User B, deny the LINE-launched Patient workflow and disclose no Patient data from either account through that mismatched workflow. Show a generic mismatch/account-management state; allow explicit logout and normal login to the intended account, then require fresh verification. No automatic account switching, relinking, merging, role, or session impersonation; do not reveal User A's identity. | **CLOSED / OWNER APPROVED — 2026-10-08** |
| J3-Q16 | Require verified current LINE identity, current ACTIVE binding, binding User equal to the current authenticated DEMI User, current canonical ActorContext, and current domain authorization for a LINE-launched scoped workflow. The consistency requirement continues for the workflow lifecycle, including subsequent reads/actions, through a server-verifiable mechanism to be designed in 17J.3B. Ordinary DEMI web access stays independent of LINE. No query flag, referrer, or client-only state as authority; no second DEMI application session. | **CLOSED / OWNER APPROVED — 2026-10-08** |

## 5. MINI App topology and rationale

The owner selected Q07=C: a new LINE MINI App channel under DEMI's existing Provider. The existing LINE Login channel and Account LIFF remain the account-management surface; the conceptual future business entry is /line/workflow.

The selection follows the platform direction for a new business entry while retaining the same Provider-scoped LINE subject namespace and avoiding a second classic LIFF that would carry migration debt. The owner accepts the additional channel configuration and provisioning burden. The alternatives and trade-offs for reusing the Account LIFF, adding a second classic LIFF, using a MINI App channel, or ordinary DEMI web remain in the decision pack as historical rationale. The final selection is MINI App channel C; a second classic LIFF is not approved, and the Account LIFF is not migrated.

Same-Provider userId consistency is not audience equivalence. MINI App proof must be verified server-side against the expected audience for the MINI App channel used by the selected environment. The existing Account LIFF verifier/audience must not be reused blindly. No exact MINI App channel ID, LIFF ID, endpoint environment, internal Developing/Review/Published configuration, or verifier mapping is decided here. A MINI App selection does not approve service-message delivery or proactive notification capability.

## 6. Existing Account LIFF preservation contract

The existing Account LIFF stays unchanged:

- Current LINE Login channel and existing account-management LIFF ID.
- Existing /line/account endpoint and account link/unlink behavior.
- Existing Login-channel token-verification audience and configuration remain dedicated to Account LIFF.
- Existing account and Family invitation login-return behavior remains compatible.

The new MINI App channel serves the first bounded business workflow. Its route, ID, environment relationships, expected audience, and configuration ownership are Phase 17J.3B/operator decisions. No account migration or classic-LIFF-to-MINI-App migration is part of this closeout.

## 7. Identity and session invariants

- A verified LINE identity proves the LINE principal only. It does not authenticate to DEMI, create a DEMI User/Person, or grant a DEMI role, membership, capability, scope, or domain access.
- The current ACTIVE LINE binding locates an existing DEMI User. It does not create a Supabase Auth session or replace ordinary DEMI credentials.
- Normal DEMI authentication and the current server-resolved DEMI actor remain required before Patient data is available.
- Every business read/action still resolves the current canonical ActorContext and current domain authorization. The LINE-scoped consistency check is an additional requirement for this entry lifecycle, not a replacement for domain authorization.
- The MINI App token audience is channel-specific. Same Provider identity namespace does not allow token audience substitution across the MINI App and existing Login channels.
- No automatic account switching, relinking, merging, session minting, or impersonation is allowed.

## 8. Approved first workflow

The owner-approved conceptual flow is:

```text
Patient
  → DEMI LINE Official Account
  → eligible Patient Rich Menu
  → “ดูนัดหมายทั้งหมด”
  → DEMI LINE MINI App (new MINI App channel under existing DEMI Provider)
  → bounded /line/workflow gateway
  → initialize MINI App/LIFF context
  → obtain LINE identity proof
  → verify server-side against expected MINI App channel/audience
  → resolve current ACTIVE LINE binding
  → require normal DEMI authenticated session
      absent: normal credential login → bounded gateway return → fresh checks
      present: compare binding User and DEMI browser User
      mismatch: generic no-data mismatch → explicit account correction
  → current canonical ActorContext
  → persisted PATIENT SELF authorization
  → authorized Appointment root: /app/personal/appointments
  → existing Hospital relationship chooser, history, and detail UI
  → existing authorized acknowledgement/cancellation-request controls
  → maintain LINE-scoped consistency on subsequent requests per 17J.3B

Normal DEMI web workflows remain independent of LINE.
```

This records approved behavior and boundaries; it is not an implementation claim. No provider/resource, endpoint, app ID, Rich Menu, or session mechanism is created by this flow description.

## 9. Existing Appointment UI, data, and mutation boundary

The initial LINE entry is root-only. After authentication and current PATIENT SELF authorization, the existing /app/personal/appointments page handles relationship selection and existing history/detail navigation. Reuse retains the current authorized presentation breadth, including Hospital/relationship context, HN, appointment details, clinician and location presentation, existing care navigation, and the current Patient controls.

The existing Patient actions remain governed by their current domain services and policies:

- Appointment acknowledgement records acknowledgement for the current appointment version; it is not attendance and does not change canonical AppointmentStatus.
- Cancellation request submits the existing request and does not cancel the appointment. Existing nonce, version, idempotency, transaction, and review rules remain authoritative.

This decision creates no new Appointment domain model or mutation and does not approve create, reschedule, direct cancellation, or a new LINE chat action. The separate 17J.2 “ตรวจสอบนัดหมาย” chat command remains its existing narrow text-only result; no new clinical disclosure is added to LINE chat.

## 10. Rich Menu presentation boundary

The future runtime slice may add exactly the dedicated Patient action “ดูนัดหมายทั้งหมด” to these eligible presentation variants only: PATIENT_DIRECT, PATIENT_PATIENT_OSM, PATIENT_PATIENT_HOSPITAL, and PATIENT_PATIENT_OSM_HOSPITAL. It must not appear in UNLINKED, LINKED_INELIGIBLE, ROLE_CHOOSER, or OSM-selected menus.

The action is presentation only and grants no authority. “ข้อมูลของฉัน” retains its broad Personal workspace meaning and ordinary DEMI web destination. “ตรวจสอบนัดหมาย” remains the 17J.2 command. Menu catalog/layout/PNG changes and provider menu updates are deferred to a future runtime slice and are not authorized or performed here.

## 11. Wrong-account and binding-consistency guarantees

For Q15, if the verified LINE identity currently binds to User A and the authenticated DEMI session is User B, the LINE-launched Patient workflow fails closed. It discloses no Patient data from A or B through the mismatched entry and does not reveal User A's identity. The user receives a generic mismatch/account-management state and may explicitly log out and authenticate normally as the intended account. Fresh LINE, binding, session, and authorization checks are required after correction. There is no automatic account switching, relinking, account merge, role impersonation, or session impersonation.

For Q16, a launch-time comparison alone is insufficient. The technical contract must preserve a server-verifiable, session-bound LINE execution scope through subsequent workflow reads and Appointment Server Action submissions, and address page reload, multiple tabs, navigation, BFCache/back restore, expiry, account switch, unlink/binding lifecycle change, and role revocation. Every request still uses current DEMI actor and domain policy.

Ordinary DEMI web traffic remains independent of LINE binding. It must not receive a global LINE dependency. If a safe lifetime boundary cannot coexist with the thin gateway and reused routes, Phase 17J.3B must stop and surface that architecture conflict; it must not weaken Q16 to a launch-only check.

## 12. Navigation and URL privacy constraints

The only approved first business intent is OPEN_PATIENT_APPOINTMENTS, resolved by the server to /app/personal/appointments. The initial entry carries no relationship ID, appointment ID, resource target, identity, or clinical data. Arbitrary return URLs and client-selected resource targets are forbidden.

Application-authored URL/query/fragment/referrer/navigation state must contain no tokens, LINE subject, DEMI user identity, resource ID, or clinical information. It may contain only the finite named intent and the minimum non-authoritative navigation-control data required by the supported platform mechanics. Raw LINE proof is transient in memory and sent only in an HTTPS request body for server verification; it is not persisted. Platform-supplied LIFF redirect parameters are untrusted and must be handled according to the official SDK lifecycle in the future technical contract.

Existing resource routes inside authenticated DEMI navigation remain subject to current server authorization. No initial LINE deep link, Rich Menu data, or login-return intent selects a relationship or appointment.

## 13. Phase 17J.3B technical contract required

The owner decisions are closed; the following mechanics remain technical decisions and must be documented before any 17J.3 runtime work.

**A. MINI App channel and audience**

- Define the server-owned expected MINI App channel/audience and its integration with the existing Login-channel token verifier.
- Map Developing/Review/Published internal channels and environments, verified subject, and Provider namespace consistency.
- Define separate configuration ownership. Do not substitute the existing Account LIFF/Login-channel audience for MINI App tokens.
- Do not infer exact IDs, endpoint, environment, or publication configuration from this closeout.

**B. MINI App gateway**

- Define the exact route and finite intent classifier, MINI App/LIFF initialization, primary/secondary redirect handling, and external-browser behavior.
- Specify safe error and unauthenticated states and the bounded server-verification endpoint.
- Keep identity proof transient; define response, referrer, and cache behavior without token persistence.

**C. Authentication and login return**

- Specify behavior with existing Supabase SSR sessions and normal DEMI credential login.
- Define one authoritative named-intent return allowlist and compatibility with /line/account and Family invitation fragment handling.
- Cover already-authenticated login, post-login return, safe redirects/errors, and loop prevention.

**D. LINE-scoped consistency lifetime — security-critical gate**

- Specify session-bound context and a server-verifiable execution scope; a launch-time check alone is insufficient.
- Cover revocation/unlink after entry, account switch, role revocation, binding lifecycle change, expiry, subsequent reads, Appointment Server Action submissions, reload, multiple tabs, navigation to other DEMI pages, and BFCache/back restore.
- Show how the scope remains enforceable while normal DEMI web access stays independent of LINE.
- Do not rely on a query flag, referrer, or client-only state as authority, and do not silently create a second DEMI application session.
- If the approved thin gateway plus reused routes cannot safely meet this lifetime boundary without a significant architecture change, stop and surface the conflict instead of weakening Q16.

**E. Existing Appointment UI reuse**

- Preserve root-only initial entry, current Patient SELF policy, the already-approved data breadth, acknowledgement semantics, and cancellation-request semantics.
- Add no Appointment mutation, duplicate Patient UI, or second domain authorization path.

**F. Rich Menu integration**

- Specify the one dedicated Patient action, existing command/workspace preservation, finite current catalog, layout geometry, and generated PNG implications.
- Do not change unrelated role menus.

**G. Privacy and browser lifecycle**

- Cover application-token URL exclusion, transient raw LINE proof in HTTPS request bodies, response/referrer/cache behavior, effective Supabase SSR cookie attributes, CSRF, same-origin assumptions, sanitized logs, and hidden identity in analytics.
- Cover external-browser/cookie isolation, logout, and account switching.

**H. Verification and UAT**

- Define focused unit tests and gateway/auth integration tests, including wrong-account and stale/revoked-binding cases.
- Cover navigation allowlists and current Appointment authorization regression behavior.
- Require explicit real iOS/Android LINE MINI App and external-browser UAT gates; automated tests or documentation do not count as device evidence.

## 14. Unchanged governance and notification gates

P17D-NOTIF-01 remains **OPEN**. Appointment proactive event, timing, recipient, stale/cancellation, content, privacy, preference, consent, quiet-hours, retry, and Push semantics remain separately gated. Selecting a LINE MINI App does not approve MINI App service messages or proactive delivery.

J2's narrow “ตรวจสอบนัดหมาย” Reply remains unchanged; no new clinical data is sent in LINE chat. Family LINE access is not approved. P17F-L04 remains **OPEN**, P17F-L05 remains **OPEN / FUTURE**, Q5 real-data governance remains **BLOCKED**, and the parked Phase 17E.2 consent gate remains unchanged. MED-02, medication reminders/adherence, Follow-up reminder source, identity-history retention/erasure, real provider provisioning, real-device UAT, and production deployment remain open or deferred under their existing governance.

## 15. Implementation restrictions

This is a documentation-only owner closeout. Do not treat it as permission to implement runtime behavior, provision LINE resources, update Rich Menu catalog/layout/assets, create a schema/migration, change environment configuration, or start Phase 17J.3B implementation. Do not claim a MINI App channel/ID exists, provider credentials were verified, device UAT completed, scoped lifetime enforcement implemented, menus updated, Appointment LIFF navigation implemented, or production deployed.

## 16. Validation

Documentation validation completed: Q01–Q16 and phase statuses were checked against the owner instruction; Q07=C is consistent across the closeout, decision pack, and CONTEXT; all 184 local link targets in those three Markdown documents resolve, including the in-scope section anchor; files remain UTF-8 without BOM and LF line endings; Thai text is preserved and no mojibake marker was found; and the final documentation-only diff passed `git diff --check`. Unit/integration/database tests, migrations, build, and development server were not run. No runtime, schema, migration, environment, menu, asset, provider, or provisioning change is included.

## 17. Final phase status and next step

- Phase 17J.2: **CLOSED / IMPLEMENTED / AUTOMATED VERIFICATION COMPLETE**.
- Phase 17J.3A: **CLOSED / OWNER DECISION COMPLETE**.
- Phase 17J.3B: **NOT STARTED / TECHNICAL CONTRACT REQUIRED**.
- Phase 17J.3 runtime: **NOT IMPLEMENTED**.
- Phase 17J.4: **NOT STARTED**.
- P17D-NOTIF-01: **OPEN**.

Exact next step: **Draft Phase 17J.3B MINI App Workflow Technical Contract.** Stop after this owner closeout and documentation validation; do not begin 17J.3B or runtime implementation in this task.
