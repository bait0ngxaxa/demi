# ADR-0009: DEMI LINE OA, LIFF Identity and Messaging Boundary

- Status: Accepted
- Date: 2026-10-06

## Context

DEMI มี Patient และ health information จึงต้องปิด boundary ระหว่าง external chat identity, DEMI account, current authorization และการส่งข้อความก่อนสร้าง LINE runtime. LINE userId แปรตาม Provider; channel ที่เชื่อมกันข้าม Provider อาจไม่ resolve เป็น identity เดียวกัน และ LINE ระบุว่า channel ย้าย Provider ภายหลังไม่ได้

LINE Developers documents LINE Login, Messaging API account linking, and LIFF as distinct ID-linking methods selected according to entry flow. DEMI enters linking from the LINE OA Rich Menu into LIFF and already has an authenticated DEMI account/session, so the chosen boundary should verify LINE identity from LIFF and bind it to the existing DEMI User on the server.

DEMI มี Supabase-backed authentication, Person/User, one-time Patient/workforce activation, หลาย Role, Hospital membership และ resource-scoped policy อยู่แล้ว. LINE จึงต้องเป็น identity binding/access/delivery boundary โดยไม่สร้างระบบ credential หรือ authorization คู่ขนาน

## Decision

1. DEMI ใช้ Provider เฉพาะบริการ DEMI หนึ่งชุด มี DEMI Messaging API Channel/OA และ DEMI LINE Login Channel/LIFF อยู่ใต้ Provider เดียวกัน. ห้ามนำ NHFapp หรือแอปอื่นเข้า Provider/data/config/runtime ของ DEMI
2. Verified LINE identity จับคู่กับ existing DEMI User แบบ conceptually 0..1 ต่อด้านใน v1; User เชื่อมไปยัง Person ด้วย relation เดิม. Binding ต้อง explicit, server-verified, unique, single-use/conflict-safe; ไม่กำหนด persistence schema ใน ADR นี้
3. Account link ใช้ LIFF ID token ที่ DEMI server ตรวจด้วย expected DEMI LINE Login channel/audience ร่วมกับ existing DEMI authenticated session/login ที่พิสูจน์ exact User. Explicit confirmation และ single-use session-bound anti-CSRF intent ป้องกันการผูกข้าม session/replay; unique transactional binding fail closed. Messaging API account-link feature ไม่ถูกต่อเป็น second proof step. LINE identity ไม่สร้างหรือเปลี่ยน DEMI User และไม่ให้ role, membership, capability, scope หรือ data access
4. ทุก operation resolve current DEMI role/membership/capability/scope แล้วผ่าน server policy. Rich Menu แปรตาม current eligible operational role; mapping สำหรับผู้ใช้ operational role เดียวและ ADMIN-only เป็นข้อกำหนด. ณ เวลารับรอง ADR นี้ UX สำหรับหลาย operational roles ยัง OPEN; owner ปิดภายหลังด้วย Option C ตาม addendum ใน [Phase 17J.0B](../phases/PHASE_17J0B_MULTI_ROLE_RICH_MENU_DECISION_CLOSEOUT.md)
5. การตอบ action ของ user ใช้ webhook → server authorize → business service → Reply API เมื่อ replyToken ยังใช้ได้. การสื่อสารเชิงรุกใช้ approved source event → LINE Push. Reply token ไม่ใช่ push token และห้ามอธิบาย provider delivery ว่า exactly-once
6. ใช้ LINE chat สำหรับ bounded/simple interactions และ LIFF สำหรับ sensitive, multi-input, visually complex หรือ high-risk workflow. ไม่มี generic chatbot/NLU framework
7. LINE Messaging API เป็น proactive notification channel เดียวของ architecture ปัจจุบัน. ไม่เพิ่ม Email, SMTP, SMS, browser/native push, NHFapp dependency หรือ generic multi-channel framework
8. Appointment, Medication และ Follow-up เป็นเจ้าของ business source facts; LINE เป็น delivery only. Event/time/recipient/content/preferences ของแต่ละ reminder ยังคงเป็น domain requirement แยก

Implementation contract and current source inventory are recorded in [Phase 17J.0](../phases/PHASE_17J0_LINE_OA_LIFF_ARCHITECTURE_IDENTITY_CONTRACT.md).

## Owner decision addendum — 2026-10-06

The multi-role presentation question left open at ADR acceptance is now **CLOSED / OWNER APPROVED — OPTION C**. Eligible single-role users see that role menu directly. Multi-role users enter a neutral chooser and switch between only their currently eligible operational workspaces through LINE-native Rich Menu aliases. This changes presentation context only; it does not grant/switch DEMI authority, select a resource scope, or supersede existing server authorization.

The detailed decision is recorded in [Phase 17J.0B](../phases/PHASE_17J0B_MULTI_ROLE_RICH_MENU_DECISION_CLOSEOUT.md). The binding, LIFF, reachability, webhook and role-aware menu implementation contract is [Phase 17J.1](../phases/PHASE_17J1_LINE_ACCOUNT_LINK_RICH_MENU_IMPLEMENTATION_CONTRACT.md), complete and cleared for implementation. ADR-0009 remains Accepted; no new ADR is required. Runtime remains NOT IMPLEMENTED.

Current identity-lifecycle contract: v1 uniqueness applies only to ACTIVE LINE bindings; active replacement is never automatic and cross-user rebind is denied when retained lifecycle evidence conflicts. Unlink alone does not authorize transfer, same-User relink requires the explicit flow, inaccessible LINE does not permit takeover, and existing DEMI account recovery remains authoritative. No permanent LINE-subject ownership or non-transfer tombstone is owner-approved.

Authoritative unlink takes effect in DEMI at local transaction commit and is independent of LINE availability. Raw LINE subject may remain only as a temporary provider Rich Menu cleanup locator on an already-unlinked binding while cleanup is unresolved; it grants no authority and is cleared after cleanup is confirmed. A retained HMAC fingerprint remains governed by the v1 conflict guard. This temporary locator is not permanent identity ownership; exact identity-history retention/erasure remains OPEN.

Exact LINE identity-history fingerprint/owner retention and erasure duration, and future cross-account correction/reconciliation/merge/transfer semantics remain OPEN. This open item does not block v1 if runtime remains fail-closed while retained evidence conflicts; it does not reopen Option C.

## Full Disconnection amendment — 2026-10-08

**Owner-decided product exception; bounded recovery contract cleared for implementation review.** “Unlink LINE from DEMI” now means one Full LINE Integration Disconnection operation: immediately revoke local binding and advance lifecycle, then terminate every applicable DEMI Account Login/LIFF and MINI internal-channel permission with independent honest status. Local authority and availability independence above remain Accepted. The older assumption that local unlink/Rich Menu cleanup is sufficient product completion, and unconditional same-User relink during unresolved remote termination, are superseded. Q07's same-Provider MINI addition retains separate audiences; unchanged-Account wording yields only to necessary termination/status/recovery/pending fences.

The [17J.3B contract section 23.1](../phases/PHASE_17J3B_MINI_APP_WORKFLOW_TECHNICAL_CONTRACT.md#231-full-line-integration-disconnection--final-lifecycle-contract) selects one narrow LINE-owned channel-scoped lifecycle record proposal. Existing binding version/menu cleanup cannot express independent consent outcomes or ambiguous remote submissions. Conceptual persistence is selected for implementation review; no new authentication system, generic framework, token persistence, physical schema/migration or worker is approved in this task. The binding remains the sole local access authority; channel records would own external obligation/settlement only. User-first lock order and existing transaction retry/composition are retained, with provider I/O outside locks.

**Later owner decision — 2026-10-08, Option 2: Bounded Recovery Policy with Accepted Availability Risk.** Authenticated retained owner, live exact DEMI session, manual app review/explicit risk acknowledgement and fresh correct-channel LINE identity verification may release affected obligations for explicit relink without provider absence/drain proof. The owner accepts late ambiguous deauthorization disrupting new permission; no authorization/privacy relaxation. This replaces the absolute pending-release rule and closes **B17J3-LIFECYCLE-RELEASE at design level**.

REMOTE_CONFIRMED and RECOVERY_RELEASED_UNVERIFIED remain distinct. Audit release provenance without rewriting remote outcome/deleting old attempts; late exact-attempt evidence updates historical settlement only, never current binding/scope. No automatic redispatch. No arbitrary drain cooldown/permanent lock; selected bounded attempts/self-service manual review/fresh proof permit recovery without the old access token. Recovery creates no binding/Patient authority. Account-only users need no MINI authorization; unknown applicability stays unknown.

Local fences cannot protect new external permission from an accepted old request. Absolute min(15 minutes, verified proof expiry) context and current binding/session/canonical SELF checks remain unchanged, with no immediate withdrawal-detection guarantee. Account channel/LIFF/audience, retained-history conflicts, ordinary credentials/data, OA friendship, Family/J2/menu architecture remain authoritative. No physical schema/migration, operator force-clear, provider mutation or deployment is authorized here. [17J.3B](../phases/PHASE_17J3B_MINI_APP_WORKFLOW_TECHNICAL_CONTRACT.md) is technically cleared; runtime/API/concurrency/device validation and deployment gates remain separate. Historical v1 handoff is unchanged.

## Rationale

- Provider identity namespace is a platform-level decision that is costly to reverse after channel creation.
- Explicit account linking joins two separately verified identities, while current DEMI policy prevents a chat identity from turning into business authorization.
- LIFF matches the approved OA Rich Menu → LIFF entry and returns to the existing DEMI account flow without a parallel credential system.
- Existing DEMI authentication and activation avoid parallel credential and proofing systems.
- Separate Reply and Push paths preserve LINE token semantics and separate user initiated work from proactive delivery.
- LINE-first delivery closes the approved transport direction without prematurely deciding domain-specific notification semantics.

## Alternatives Considered

- Separate Provider for Messaging API and LINE Login: rejected because same-user IDs would differ and OA/linking integration has same-Provider requirements.
- Reuse NHFapp Provider/channel/LIFF or notification infrastructure: rejected because DEMI must have a dedicated, isolated LINE identity ecosystem.
- Trust a client supplied LINE userId or decoded LIFF profile: rejected because the client is not a trusted identity verifier.
- Use LINE identity itself as a DEMI role/account: rejected because a LINE userId does not prove DEMI identity, role, membership or scope.
- Ask for National ID in chat for each query: rejected because sensitive data should not become the routine post-link identity factor.
- At ADR acceptance, multi-role menu choices A. combined role-aware menu, B. workspace/role selector, and C. Rich Menu tabs/switching remained alternatives with no precedence; the owner later closed this question with Option C in Phase 17J.0B.
- Compose Messaging API account-link tokens/webhook confirmation with LIFF ID-token linking: rejected for v1 because LINE documents these as alternative flows and the LIFF entry already obtains a verifiable LINE subject. The Messaging API flow is suitable when linking starts in OA chat without LINE Login; it is not an additional security layer for the LIFF flow.
- Implement LIFF linking by trusting a client profile or unbound token request: rejected. LINE warns custom linking needs safeguards; DEMI requires server verification of the raw ID token, existing DEMI authentication, explicit confirmation, session-bound single-use CSRF intent and transactional uniqueness.
- Add email or generic multi-channel notification abstraction: rejected; the current approved proactive channel is LINE Messaging API.

## Consequences

### Positive

- LINE login/LIFF and Messaging API identity can be correlated within one DEMI-owned Provider namespace.
- Existing DEMI authentication, activation, role and policy sources remain authoritative.
- Linking conflicts and current ineligibility have explicit fail-closed behavior.
- OA friendship and business identity stay separate; a valid binding does not imply a reachable OA recipient or applied Rich Menu.
- Chat remains a fast path for bounded actions, while detailed or risky operations have a richer authenticated UI.
- Domain source semantics remain independent from provider delivery failures.

### Trade-offs / Risks

- Provider/channel provisioning and administrator ownership must be correct before production use; channel movement is unavailable later.
- LINE event delivery/order and Push receipt are not exactly-once guarantees; future runtime needs durable deduplication and bounded retries.
- Rich Menu state can become stale after an authorization change; every action must recheck server policy.
- Sending detailed patient information in chat is intentionally constrained and requires explicit content/privacy approval.
- At ADR acceptance, a single user-specific Rich Menu could represent only one effective menu at a time and multi-role presentation remained an owner decision; Phase 17J.0B later selected Option C, with current eligible-set projection defined by Phase 17J.1.

## Owner decision — LINE identity transfer after explicit Unlink (2026-10-19)

Supersedes "cross-user rebind is denied" and "Unlink alone does not authorize transfer" above for this one case. A LINE identity may be linked to a different DEMI User only when no ACTIVE binding exists for it, i.e. the previous owner explicitly unlinked, and the new User completes the ordinary Link flow (own exact DEMI session, single-use intent, fresh LINE ID-token proof, Relink policy over the new User's own history). The new User always gets a new binding; the previous owner's binding, lifecycle generations, unresolved remote obligations and audit history stay on the previous owner and are never moved, confirmed or released by the transfer. Only the previous binding's raw Rich Menu cleanup locator is retired (`CONFIRMED_CLEAN`, audit `line.account.cleanup.superseded`) so its cleanup cannot remove the new owner's menu; while that cleanup holds its reconcile lease the transfer is refused as retryable. An ACTIVE foreign binding, including an inaccessible-LINE takeover attempt, remains a conflict. Signing out of DEMI does not unlink LINE. Accepted risk (same class as Recovery Option 2): a late remote deauthorization from the previous owner's Unlink may disconnect the new owner's LINE consent; this affects availability only.

## Owner decision — Unified LINE Disconnection UX (2026-10-27)

Refines the Full Disconnection amendment and the 2026-10-19 transfer decision; it does not change their security rules. The linked `/line/account` screen offers exactly one action, “ยกเลิกการเชื่อมต่อ LINE”, with one confirmation. Separate “unlink and use another DEMI account” and session-only “ออกจากระบบ DEMI” choices on the linked screen are retired. The session-only “ใช้บัญชี DEMI อื่น” remains on the unlinked screen and in the Link confirmation for shared devices.

One confirmed operation runs in this order: (1) the existing authenticated, session-bound, single-use UNLINK intent revokes the binding at local commit; (2) deauthorization is attempted only per channel with valid channel-specific proof (an Account LIFF access token never substitutes for a MINI-channel token); (3) every permission not proven revoked keeps its honest remote status (`REMOTE_UNCONFIRMED`, never inferred `REMOTE_CONFIRMED`/`PROVEN_ABSENT`); (4) after the confirmed local unlink the client awaits `POST /api/line/account/sign-out` with the same UNLINK intent proof; the server ends the DEMI session only when that intent was consumed as `SUCCEEDED` within 15 minutes by the exact current User and session, and refuses (`SESSION_CHANGED`) without signing anyone out when another tab or account replaced that session. Client-supplied User identifiers are rejected; (5) the browser goes to `/login?returnTo=/line/account`. If sign-out fails after the commit, the screen reports partial success and retries sign-out only; no second intent or deauthorization is sent. A lost or failed Unlink response is resolved by the same read-only server check: a committed unlink then signs out, an uncommitted one keeps the session, and Unlink is never resent. Normal website logout (`logoutAction`) is unchanged and session-only.

Recovery isolation: lifecycle obligations, Recovery state and audit stay on the binding of the user who unlinked. A new User links through the ordinary Link flow when no active foreign binding exists; Relink policy evaluates only that User's own history, so B never sees or settles A's obligations and cannot use A's Recovery intent. The browser Recovery handoff is advisory transport only: it carries an HMAC scope of the exact DEMI User and session, resumes only while that same session still has the same outstanding obligation set, and is otherwise cleared. Server intent, live session and fresh LINE-proof checks remain the only authority.

Accepted trade-offs, documented rather than bypassed (each needs a further owner/ADR decision to change):

- Same-User relink keeps bounded Recovery. Without a MINI-channel user token, each generation's MINI obligation (applicability `UNKNOWN`) stays unconfirmed, so the same owner reviews it again after every Disconnection. Treating a never-observed MINI grant as absent would weaken “unknown applicability stays unknown”.
- Recovery proof is per LINE subject. A User with revoked bindings for several different LINE accounts completes one Recovery per binding, oldest first.
- A late remote deauthorization from A's attempt may disconnect B's new LINE consent (availability only, as accepted on 2026-10-19). It never changes B's binding, lifecycle rows or Rich Menu ownership.

## Configuration note — Phase LINE-QA.B2.4 (2026-10-19)

Runtime configuration describes only how to connect: Account Login/LIFF, Messaging API, public origin and, optionally, the selected MINI internal channel (environment, Channel ID, LIFF ID, Channel Secret) plus a DEMI-owned workflow keyring. Full Disconnection is permanent; its channel inventory is derived from that configuration, not an operator manifest, and operator evidence strings are not runtime authority. Same-Provider placement (decision 1) is verified by the owner in LINE Console and enforced at runtime by MINI subject = Account binding subject; it is not asserted by a configuration value. The single `DEMI_LINE_MINI_APP_DISABLED` switch is an emergency stop, never an activation approval. See [Phase LINE-QA.B2.4](../phases/PHASE_LINE_QA_B2_4_CONFIGURATION_SIMPLIFICATION.md).

### Production-code-first clarification (2026-10-25)

The legacy `DEMI_LINE_MINI_APP_DISABLED` application switch is removed. Provider connection credentials, exact channel audience, signed context, scope checks, and provider-defined channel status remain authoritative. An unconfigured optional MINI integration fails closed for MINI operations only; release documents and application deployment labels do not activate it.

## Open Questions at initial ADR acceptance (historical)

- Appointment reminder event/timing/recipient/cancellation/staleness/content/preferences/consent and retry policy remain P17D-NOTIF-01.
- Medication reminder delivery timing/content/preferences require a separate approved requirement; adherence remains deferred and MED-02 remains gated.
- Follow-up has no current prospective due/reminder source.
- Multi-role Rich Menu UX remains OPEN / OWNER DECISION REQUIRED among combined menu, workspace/role selector and Rich Menu tabs/switching; no option or precedence is approved.
- OA friendship/reachability after the last signed follow/unfollow event can become unknown; Push must fail closed on known false/unknown status and 17J.4 must set the freshness/reconciliation policy.
- Exact privacy disclosure for reactive appointment messages, unlink notice/retention copy, inaccessible-LINE recovery UX, and operational push retry limits remain open in Phase 17J.0.

## REC-2B cross-reference — forgot-password recovery (2026-10-25)

LINE may deliver a DEMI password-recovery link to the user's existing active LINE binding and provide a fresh ID token that DEMI verifies against the configured Account Login channel audience. The server accepts recovery only when that verified LINE subject matches the binding already attached to the target DEMI User. This is a credential-recovery proof and delivery path only: LINE does not sign the User in to DEMI, create or switch a DEMI identity, grant roles/memberships/capabilities, select data scope, or authorize access to data. Reset eligibility and credential replacement continue to follow [ADR-0012 REC-2B](0012-global-credential-recovery-proof.md) and the REC-1 state machine. ADMIN self-service is excluded.
