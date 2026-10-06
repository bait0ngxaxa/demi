# ADR-0009: DEMI LINE OA, LIFF Identity and Messaging Boundary

- Status: Accepted
- Date: 2026-10-06

## Context

DEMI มี Patient และ health information จึงต้องปิด boundary ระหว่าง external chat identity, DEMI account, current authorization และการส่งข้อความก่อนสร้าง LINE runtime. LINE userId แปรตาม Provider; channel ที่เชื่อมกันข้าม Provider อาจไม่ resolve เป็น identity เดียวกัน และ LINE ระบุว่า channel ย้าย Provider ภายหลังไม่ได้

DEMI มี Supabase-backed authentication, Person/User, one-time Patient/workforce activation, หลาย Role, Hospital membership และ resource-scoped policy อยู่แล้ว. LINE จึงต้องเป็น identity binding/access/delivery boundary โดยไม่สร้างระบบ credential หรือ authorization คู่ขนาน

## Decision

1. DEMI ใช้ Provider เฉพาะบริการ DEMI หนึ่งชุด มี DEMI Messaging API Channel/OA และ DEMI LINE Login Channel/LIFF อยู่ใต้ Provider เดียวกัน. ห้ามนำ NHFapp หรือแอปอื่นเข้า Provider/data/config/runtime ของ DEMI
2. Verified LINE identity จับคู่กับ existing DEMI User แบบ conceptually 0..1 ต่อด้านใน v1; User เชื่อมไปยัง Person ด้วย relation เดิม. Binding ต้อง explicit, server-verified, unique, single-use/conflict-safe; ไม่กำหนด persistence schema ใน ADR นี้
3. Account link ใช้ existing DEMI login/activation proof ร่วมกับ LINE ID-token verification และ Messaging API account-link token/webhook confirmation. LINE identity ไม่สร้างหรือเปลี่ยน DEMI User และไม่ให้ role, membership, capability, scope หรือ data access
4. ทุก operation resolve current DEMI role/membership/capability/scope แล้วผ่าน server policy. Rich Menu เป็น role-aware presentation เท่านั้น. User หลายบทบาทได้เมนูรวมเฉพาะ action ที่ปัจจุบันมี authority; ADMIN-only ไม่มี operational menu โดยอัตโนมัติ
5. การตอบ action ของ user ใช้ webhook → server authorize → business service → Reply API เมื่อ replyToken ยังใช้ได้. การสื่อสารเชิงรุกใช้ approved source event → LINE Push. Reply token ไม่ใช่ push token และห้ามอธิบาย provider delivery ว่า exactly-once
6. ใช้ LINE chat สำหรับ bounded/simple interactions และ LIFF สำหรับ sensitive, multi-input, visually complex หรือ high-risk workflow. ไม่มี generic chatbot/NLU framework
7. LINE Messaging API เป็น proactive notification channel เดียวของ architecture ปัจจุบัน. ไม่เพิ่ม Email, SMTP, SMS, browser/native push, NHFapp dependency หรือ generic multi-channel framework
8. Appointment, Medication และ Follow-up เป็นเจ้าของ business source facts; LINE เป็น delivery only. Event/time/recipient/content/preferences ของแต่ละ reminder ยังคงเป็น domain requirement แยก

Implementation contract and current source inventory are recorded in [Phase 17J.0](../phases/PHASE_17J0_LINE_OA_LIFF_ARCHITECTURE_IDENTITY_CONTRACT.md).

## Rationale

- Provider identity namespace is a platform-level decision that is costly to reverse after channel creation.
- Explicit account linking joins two separately verified identities, while current DEMI policy prevents a chat identity from turning into business authorization.
- Existing DEMI authentication and activation avoid parallel credential and proofing systems.
- Separate Reply and Push paths preserve LINE token semantics and separate user initiated work from proactive delivery.
- LINE-first delivery closes the approved transport direction without prematurely deciding domain-specific notification semantics.

## Alternatives Considered

- Separate Provider for Messaging API and LINE Login: rejected because same-user IDs would differ and OA/linking integration has same-Provider requirements.
- Reuse NHFapp Provider/channel/LIFF or notification infrastructure: rejected because DEMI must have a dedicated, isolated LINE identity ecosystem.
- Trust a client supplied LINE userId or decoded LIFF profile: rejected because the client is not a trusted identity verifier.
- Use LINE identity itself as a DEMI role/account: rejected because a LINE userId does not prove DEMI identity, role, membership or scope.
- Ask for National ID in chat for each query: rejected because sensitive data should not become the routine post-link identity factor.
- Default to a single highest role menu: rejected; owner approved a combined menu containing only currently eligible roles.
- Add email or generic multi-channel notification abstraction: rejected; the current approved proactive channel is LINE Messaging API.

## Consequences

### Positive

- LINE login/LIFF and Messaging API identity can be correlated within one DEMI-owned Provider namespace.
- Existing DEMI authentication, activation, role and policy sources remain authoritative.
- Linking conflicts and current ineligibility have explicit fail-closed behavior.
- Chat remains a fast path for bounded actions, while detailed or risky operations have a richer authenticated UI.
- Domain source semantics remain independent from provider delivery failures.

### Trade-offs / Risks

- Provider/channel provisioning and administrator ownership must be correct before production use; channel movement is unavailable later.
- LINE event delivery/order and Push receipt are not exactly-once guarantees; future runtime needs durable deduplication and bounded retries.
- Rich Menu state can become stale after an authorization change; every action must recheck server policy.
- Sending detailed patient information in chat is intentionally constrained and requires explicit content/privacy approval.

## Open Questions

- Appointment reminder event/timing/recipient/cancellation/staleness/content/preferences/consent and retry policy remain P17D-NOTIF-01.
- Medication reminder delivery timing/content/preferences require a separate approved requirement; adherence remains deferred and MED-02 remains gated.
- Follow-up has no current prospective due/reminder source.
- Exact privacy disclosure for reactive appointment messages, LINE account-link notice/retention copy, inaccessible-LINE recovery UX, and operational push retry limits remain open in Phase 17J.0.
