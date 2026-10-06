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

Exact LINE identity-history fingerprint/owner retention and erasure duration, and future cross-account correction/reconciliation/merge/transfer semantics remain OPEN. This open item does not block v1 if runtime remains fail-closed while retained evidence conflicts; it does not reopen Option C.

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

## Open Questions at initial ADR acceptance (historical)

- Appointment reminder event/timing/recipient/cancellation/staleness/content/preferences/consent and retry policy remain P17D-NOTIF-01.
- Medication reminder delivery timing/content/preferences require a separate approved requirement; adherence remains deferred and MED-02 remains gated.
- Follow-up has no current prospective due/reminder source.
- Multi-role Rich Menu UX remains OPEN / OWNER DECISION REQUIRED among combined menu, workspace/role selector and Rich Menu tabs/switching; no option or precedence is approved.
- OA friendship/reachability after the last signed follow/unfollow event can become unknown; Push must fail closed on known false/unknown status and 17J.4 must set the freshness/reconciliation policy.
- Exact privacy disclosure for reactive appointment messages, unlink notice/retention copy, inaccessible-LINE recovery UX, and operational push retry limits remain open in Phase 17J.0.
