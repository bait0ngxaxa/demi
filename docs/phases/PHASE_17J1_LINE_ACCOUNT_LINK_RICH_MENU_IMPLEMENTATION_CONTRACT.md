# Phase 17J.1 — LINE Account Linking + Role-Aware Rich Menu Implementation Contract

- สถานะ: **COMPLETE / CLEARED FOR IMPLEMENTATION**
- วันที่ทบทวนเอกสาร LINE: 2026-10-06
- ขอบเขตงานนี้: สัญญา implementation เท่านั้น
- Phase 17J.1 runtime: **NOT IMPLEMENTED**
- Identity-history retention/erasure and future cross-account correction/reconciliation semantics: **OPEN**; this does not block v1 if active-binding constraints and cross-user fail-closed checks below are implemented.
- v1 never treats a LINE subject as permanently owned. Raw subject is required only while a binding is ACTIVE; unlink clears the raw value and keeps only a privacy-minimized fingerprint as current conflict evidence. Exact fingerprint/owner-history retention remains OPEN.
- สถานะ architecture: [ADR-0009](../adr/0009-demi-line-oa-liff-identity-and-messaging.md) ยัง Accepted; owner closeout ของ multi-role อยู่ใน [Phase 17J.0B](./PHASE_17J0B_MULTI_ROLE_RICH_MENU_DECISION_CLOSEOUT.md)

เอกสารนี้เป็นข้อกำหนดผูกพันของ implementation Phase 17J.1 ถ้าพฤติกรรม runtime หรือ provider API ไม่ตรงกับสัญญานี้ ให้หยุดและแก้สัญญาด้วยหลักฐานก่อน implement ห้ามเดา policy หรือแก้ authority เพื่อให้เมนูทำงาน

## 1. ผลตรวจ repo และขอบเขตที่รับช่วง

HEAD ที่ตรวจคือ `cd60e1acadee1f725d7679654406fcf9e66e5c0e`; ก่อนเริ่มงาน working tree สะอาด. ขณะร่างสัญญานี้ `PHASE_17J0B_MULTI_ROLE_RICH_MENU_DECISION_CLOSEOUT.md` เป็นไฟล์ใหม่จากงานเดียวกันที่ถูกสร้างก่อนแล้ว

จากการตรวจ source ปัจจุบัน:

- User authentication ใช้ Supabase server session; [actor-context-service.ts](../../src/modules/auth/services/actor-context-service.ts) ใช้ `auth.getUser()` แล้ว resolve `User.authSubject` และ deny User ที่ไม่ใช่ ACTIVE. Proxy มีการตรวจ claims อยู่แล้ว
- `User`, `UserRole`, `HospitalMembership`, `OsmHospitalRelationship`, Person และ Patient SELF policy เป็น source ปัจจุบันของ identity/authority. `User` มี status PROVISIONED, INVITED, ACTIVE, SUSPENDED; activation ที่ยังไม่ ACTIVE จึงไม่มีสิทธิ์ link
- [application-navigation.ts](../../src/components/app-shell/application-navigation.ts) เป็น navigation projection จาก actor/policy ไม่ใช่ LINE deep-link allowlist. Work root `/app` และ Personal root `/app/personal` มีอยู่; server resolve เนื้อหาและ resource scope
- มี transactional services และ [AuditEvent service](../../src/modules/audit/services/audit-service.ts); ใช้สำหรับ lifecycle audit โดยห้ามใส่ LINE token, subject หรือ payload ลับลง audit
- Env validation อยู่ใน server/client env modules และมี convention ชัดเจน; ไม่มี LINE env, LINE SDK, LIFF page, webhook, LINE persistence หรือ provider code
- ไม่มี generic integration framework, outbox/event bus หรือ LINE menu reconciliation runtime. ไม่สร้าง framework ดังกล่าวเพื่อ 17J.1
- `Person.identityKeyHash` ที่มีอยู่ไม่ใช่ LINE identity schema และห้ามใช้แทน LINE subject

ไฟล์เส้นทางใหม่ด้านล่างเป็นข้อเสนอขอบเขตที่เล็กที่สุดตามโครงสร้างจริง; ก่อน implement ต้องตรวจ AGENTS.md อีกครั้ง และอ่าน Next.js guide ใน `node_modules/next/dist/docs/` ที่ตรงกับ Route Handler, request body และ cookies/session ของเวอร์ชันติดตั้ง

## 2. 17J.1 ขอบเขตและสิ่งที่ไม่อยู่ในงาน

17J.1 ทำเฉพาะ integration foundation, LIFF link/unlink, persistence, reachability, webhook, static Rich Menu provisioning/projection/switching/reconciliation และ focused automated verification

ไม่ทำ appointment/medication/follow-up chat, clinical response, reminders/Push delivery/retry worker, chatbot/NLU, conversation state, Email/SMTP/SMS/browser/native push, adherence, policy/authority ใหม่, Family authority expansion, consent Phase 17E.2, MED-02 หรือ native/mobile API architecture. ห้ามเก็บหรือขอ National ID ผ่าน LINE chat หรือ LIFF account-link flow

การทำ 17J.1 ไม่ปิด event, recipient, timing, content, consent, quiet hours หรือ retry semantics ของ notification ที่ยังมี gate แยกอยู่

## 3. J1-01 — เจ้าของ module

สร้าง module เดียวที่เป็นเจ้าของ boundary LINE เท่านั้น:

- `src/modules/line/adapters/` — typed LINE Login และ Messaging API HTTP clients; ID-token verify, access-token/friendship check, webhook signature verify, menu link/read/provision calls
- `src/modules/line/domain/` — binding lifecycle, eligibility projection contract, menu projection, typed result/error definitions; ห้าม import UI หรือ Next
- `src/modules/line/schemas/` — input/provider/webhook schema validation
- `src/modules/line/services/` — link/unlink transaction, reachability update, webhook ingestion, menu reconcile orchestration
- `src/modules/line/transport/` — server actions/handlers และ LIFF boundary; reuse existing auth/session/error patterns
- `src/modules/line/rich-menu/` — code-owned alias/catalog and versioned image assets
- `app/api/line/webhook/route.ts` — public webhook entry only; delegates raw bytes/signature/event handling to module
- `app/line/account/` — LIFF account-link/account-management presentation boundary; use existing DEMI session and module services

ไม่สร้าง generic Integration Framework หรือ LINE-specific auth/authorization policy แทนของเดิม Role eligibility ต้องอ่าน authority ปัจจุบันผ่าน existing ActorContext/domain policy; LINE module ไม่มีสิทธิ์เป็นเจ้าของ Patient, Hospital, OSM, appointment, medication หรือ follow-up rules

## 4. Operational workspace eligibility ที่ใช้ทำ menu projection

ก่อนฉายเมนู ให้ resolve current persisted DEMI state ของ User ที่ผูกอยู่ การมี role row เพียงอย่างเดียวไม่พอ:

- **PATIENT** eligible เมื่อ User ACTIVE, มี Role.PATIENT และ exact User/Person/Patient SELF chain ผ่าน existing Patient SELF policy/query ในขณะ reconcile. ห้ามใช้ scope ของ Patient คนอื่นหรือ Family grant
- **OSM** eligible เมื่อ User ACTIVE, มี Role.OSM และมีอย่างน้อยหนึ่ง OsmHospitalRelationship ACTIVE กับ Hospital ACTIVE ตาม current OSM policy
- **HOSPITAL** eligible เมื่อ User ACTIVE, มี Role.HOSPITAL และมีอย่างน้อยหนึ่ง HospitalMembership ACTIVE กับ Hospital ACTIVE. OWNER และ MEMBER ใช้ operational workspace เดียว; เมนูไม่ encode Hospital ใด
- **ADMIN** ไม่ใช่ operational workspace. ADMIN-only ได้ LINKED_INELIGIBLE. ADMIN + role อื่นแสดงเฉพาะ role อื่นที่ eligible ตามกฎข้างต้น
- User status ไม่ ACTIVE, User unmapped, authority query ล้มเหลวหรือกำกวม → fail closed; ห้ามเดาสิทธิ์จาก LINE identity หรือ menu เก่า

หลาย Hospital ภายใต้ HOSPITAL/OSM ยังคงเป็น resource scope แยกต่างหาก เลือก Hospital/Patient ผ่าน existing authorized DEMI workspace/server selector เท่านั้น

## 5. J1-02 — Persistence ขั้นต่ำและ invariants

เพิ่มเฉพาะตาราง/field ที่ runtime จำเป็นจริง ผ่าน Prisma schema และ additive migration ใน implementation phase:

| Durable state | Fields / invariant ที่ต้องมี | เหตุผล |
| --- | --- | --- |
| LineAccountBinding | exact verified LINE subject while ACTIVE; owner User FK; linkedAt/lastLinkedAt; nullable unlinkedAt; nullable presentationRole/presentationRoleSelectedAt; reachability and menu-sync state; inactive lifecycle fingerprint without raw LINE subject | active binding, UX preference, reachability, projection and v1 conflict guard |
| `LineAccountActionIntent` | opaque id; User FK; LINK/UNLINK action; createdAt; hash ของ challenge; hash ของ verified Supabase session_id; expiresAt; nullable consumedAt/outcome | single-use CSRF/replay defense ที่อยู่ข้าม request |
| `LineWebhookEventReceipt` | unique webhookEventId, allowlisted event type, event occurredAt, acceptedAt และ bounded outcome enum เท่านั้น | durable dedupe และ atomic event effect |

ข้อบังคับ DB:

1. DB uniqueness covers ACTIVE bindings only: partial UNIQUE on lineSubjectFingerprint WHERE unlinkedAt IS NULL, and partial UNIQUE on userId WHERE unlinkedAt IS NULL. These are the only subject/User uniqueness invariants; do not add global uniqueness over inactive history.
2. A new link transaction checks active bindings and retained identity-history fingerprints. An active conflict or a retained fingerprint associated with another User is denied generically because no cross-user recovery/transfer flow is approved. This is a v1 application rule while evidence is retained, not permanent legal/business ownership.
3. While ACTIVE, the binding holds the exact verified LINE subject needed to identify the principal and call LINE APIs. On unlink, clear the raw subject and retain only a domain-separated HMAC fingerprint plus minimal User/lifecycle evidence needed for same-User relink and the current cross-user deny guard. Use the existing server-only IDENTITY_HASH_SECRET with a dedicated line-subject namespace; never store the fingerprint in Person.identityKeyHash.
4. The fingerprint is privacy-sensitive identity-history evidence, not authority and not a permanent tombstone. Do not impose a global historical UNIQUE constraint or immutable-owner-forever rule. A separately approved correction, duplicate/reconciliation, merge, transfer or erasure flow must be able to supersede, anonymize or delete historical evidence.
5. Exact retention and erasure duration for the fingerprint and associated User/lifecycle evidence remains OPEN. 17J.1 defines no permanent retention period and no automatic expiry/purge. The v1 unlink flow clears raw LINE subject; any future cleanup/erasure behavior requires its own approved lifecycle contract.
6. Binding creation is concurrency-safe through the two ACTIVE-only database constraints, not application pre-checks alone. Unlink itself never authorizes transfer; active binding replacement is never automatic.
7. Intent challenge uses CSPRNG >=256 bits, stores only SHA-256 hash, expires in 5 minutes, and is bound to User/session/action, consumed once.
8. Webhook receipt stores only ULID/event type/time/outcome, without raw body, subject, message, profile or token; dedupe receipts follow the separately approved operational retention policy.
9. Lifecycle audit uses existing AuditEvent minimized to event kind, actor/User id required by current audit convention, and outcome; never record LINE subject or request/provider body.

ห้าม persist raw ID token, LINE Login access token/refresh token, Messaging API access token/secret, National ID, HN, clinical content, profile/display name, webhook request body หรือ client-supplied authority
Raw LINE subject is allowed only on an ACTIVE binding row. Unlink clears it; inactive history uses only the privacy-minimized fingerprint described above, whose exact retention period remains OPEN.

ไม่เพิ่ม event outbox, queue หรือแยก reconciliation table ใน v1; sync diagnostics อยู่กับ binding row และ log ที่ปลอด PII พอสำหรับ lazy/operator repair

## 6. J1-03 — LIFF account-link transaction แบบแน่นอน

ขั้นตอนก่อน transaction:

1. DEMI User เปิด LIFF account page โดยมี existing authenticated Supabase session; หากไม่มี session ให้ไป DEMI sign-in ปัจจุบันก่อน ห้ามสร้าง DEMI identity จาก LINE
2. Server ออก LINK intent อายุ 5 นาทีและ challenge สุ่ม 256-bit; intent ผูกกับ exact UserId และ hash ของ session_id จาก verified Supabase claims
3. UI แสดงข้อความยืนยันว่าผู้ใช้กำลังเชื่อม LINE account ที่เปิดอยู่กับ DEMI account ที่ลงชื่อเข้าใช้ แล้วให้ผู้ใช้กด confirm อย่างชัดเจน
4. จาก click handler ส่ง raw value จาก `liff.getIDToken()`, intent id/challenge และ confirmation ไปยัง same-origin server mutation. สำหรับ friendship check ส่ง raw LINE access token ได้เฉพาะใน request body ชั่วคราว. ห้ามส่ง decoded profile, client lineUserId, userId, PersonId, role, Hospital id หรือข้อมูลใน localStorage
5. Server ตรวจ Origin เท่ากับ configured DEMI public origin, SameSite/Secure session cookie, schema/size และ authenticated session; เปรียบเทียบ Supabase getUser subject กับ verified claims subject/session_id. ก่อนเรียก LINE ต้อง preflight ตรวจ intent id/challenge/action/User/session/expiry/unconsumed และ User ACTIVE จาก DB; transaction ด้านล่างตรวจซ้ำหลังการ verify
6. ก่อนเปิด DB transaction server ส่ง raw ID token ด้วย HTTPS form body ไปยัง POST https://api.line.me/oauth2/v2.1/verify โดยให้ client_id เป็น expected DEMI LINE Login channel ID; รับเฉพาะ verify response ที่ signature/issuer, aud, exp และ sub ถูกต้อง. ส่ง nonce สำหรับ verification เฉพาะเมื่อ authorization request ใช้ nonce. ไม่ใช้ client decode/profile เป็น proof

Transaction ใน PostgreSQL:

1. Lock User row ก่อน แล้ว lock intent row ตามลำดับเดียวกันทุก mutation
2. ตรวจ intent action=LINK, challenge hash, UserId, session hash, expiry ปัจจุบัน และ consumedAt เป็น null
3. ตรวจ User.authSubject ตรงกับ verified current DEMI session และ User.status = ACTIVE. ถ้า User ไม่ ACTIVE ให้ consume intent แบบ terminally และห้าม bind; ไม่บังคับ operational role เพราะการผูก identity ไม่ใช่การให้ role
4. ตรวจ ACTIVE binding และ retained fingerprint history:
   - ACTIVE binding ของ User เดียวกันและ LINE subject เดียวกัน → consume intent และคืน idempotent “linked already”; ห้ามสร้าง lifecycle/audit ซ้ำ
   - User เดียวกันมี ACTIVE binding คนละ subject → consume intent แล้ว conflict แบบ privacy-safe; ห้ามแทนที่อัตโนมัติ
   - subject มี ACTIVE binding ของ User อื่น → consume intent แล้ว generic conflict
   - ไม่มี ACTIVE binding แต่ retained fingerprint เดิมชี้ไป User อื่น → consume intent แล้ว generic conflict; ห้าม cross-user rebind หากไม่มี approved recovery/reconciliation flow
   - retained fingerprint เดิมเป็นของ User เดียวกัน → reactivate lifecycle record เดิมหลัง explicit confirmation; set raw verified subject, update linkedAt/lastLinkedAt และ reset reachability UNKNOWN
   - ไม่มี active/history conflict → create ACTIVE binding ใหม่
   ทุก conflict ข้างต้นเป็นกฎ fail-closed ของ v1 ขณะมี evidence; ไม่มี permanent historical uniqueness หรือ owner-forever invariant.
5. Consume intent, update/create binding และ append minimized AuditEvent ใน transaction เดียว
6. DB ACTIVE-only unique constraints are the final concurrency guard. On unique violation, rollback and re-read current ACTIVE binding plus retained fingerprint history in a new transaction, then consume intent terminally. Same User + same subject is idempotent; active or retained cross-user conflict returns generic conflict. Never overwrite an active binding.
7. Commit local binding ก่อนเรียก LINE API. การ reconcile เมนูล้มเหลวไม่ rollback binding

Responses ภายนอกแยกได้เพียง success, invalid/expired flow, DEMI account ineligible หรือ generic “เชื่อมบัญชีนี้ไม่ได้”; ห้ามบอกว่า LINE subject ผูกกับ User อื่นหรือเปิดเผย id ใด

## 7. J1-04 — Unlink / relink / recovery

- ผู้ใช้ unlink ตัวเองได้จาก authenticated DEMI account/LIFF settings ด้วย confirmation และ UNLINK intent แบบ session-bound single-use. LINE ID token เก่าไม่จำเป็นเมื่อผู้ใช้ยืนยันตัวด้วย existing DEMI session แล้ว
- Optional LIFF unlink ที่ตรวจ LINE token ได้ ต้องตรวจว่า subject ตรงกับ ACTIVE binding ของ DEMI User คนเดิม และยังต้องใช้ DEMI session/explicit confirmation; LIFF identity เดี่ยว ๆ unlink ไม่ได้
- Transaction lock User + intent + ACTIVE binding, ตรวจ exact owner/status/intent, set unlinkedAt, clear raw LINE subject และ presentationRole, retain เฉพาะ domain-separated HMAC fingerprint กับ minimal lifecycle evidence เพื่อรองรับ same-User relink และ v1 cross-user denial, write AuditEvent แล้ว commit
- Fingerprint และ owner/lifecycle evidence เป็นข้อมูล identity-history ที่ privacy-sensitive; ไม่ใช่ authority และไม่ใช่ permanent reservation. Exact retention/erasure period remains OPEN. 17J.1 ไม่เพิ่ม purge/erasure endpoint หรือ background cleanup
- ACTIVE เป็นเงื่อนไข link ใหม่และ self-service unlink. SUSPENDED/PROVISIONED/INVITED ไม่มี self-service mutation; binding คงสถานะที่มีอยู่แต่ menu projection เป็น neutral, server auth deny ทันที. ใช้ account restore/recovery และ operator repair ตาม existing DEMI governance; suspension ไม่แอบ unlink
- ผู้ใช้เดิม relink subject เดิมได้ผ่าน current explicit flow เมื่อ authenticated และ ACTIVE; subject ใหม่ที่ยังไม่มี active/history conflict ก็ link ได้หลัง unlink. ถ้า retained history ผูก subject เดิมกับ User อื่น ให้ generic deny จนมี separately approved recovery/reconciliation flow. Unlink อย่างเดียวไม่อนุญาต transfer
- การเข้า LINE account เก่าไม่ได้ไม่เปิดทาง takeover; existing DEMI account recovery ยังคงเป็น authority. ห้าม takeover ผ่านข้อความ/chat, ADMIN menu หรือ Messaging API accountLink event
- ไม่มี immutable historical-owner rule หรือ DB constraint ที่ห้าม future approved account correction, duplicate/reconciliation, account merge, identity transfer หรือ privacy/erasure lifecycle
## 8. J1-05 — LIFF trust boundary และ CSRF/session

Request flow:

LIFF page ที่ allowlisted → liff.getIDToken raw token → same-origin DEMI server → LINE Verify API → verified subject → authenticated current DEMI User → one-time explicit confirmation → local transaction

Rules:

- Server เชื่อเฉพาะ verified ID token response และ fresh existing DEMI session เท่านั้น
- ตรวจ Supabase user.id ด้วย auth.getUser และ verified claims; session intent ผูกกับ claims session_id เพื่อให้ session เปลี่ยนหลังออก intent แล้วใช้ intent เดิมไม่ได้
- Mutation เป็น POST และตรวจ exact Origin; ใช้ Secure/HttpOnly/SameSite cookies ตาม existing server session policy; ปิด cross-origin mutation/CORS
- Challenge ส่งผ่านหน่วยความจำ/form ของหน้า LIFF เท่านั้น; ห้าม localStorage/sessionStorage และห้าม URL/query string
- ID token ส่งผ่าน HTTPS ใน request body ไม่ใช่ URL; จัดการใน memory เท่าที่จำเป็น, ไม่ log, ไม่ persist, ไม่ส่งไป analytics/error tracker
- Raw ID token จาก LIFF คือ identity proof; client-decoded sub/profile มีไว้แสดงใน browser ได้เท่านั้นและห้ามส่งมาให้ server เพื่อยืนยัน. ขอเฉพาะ scope openid และ profile (profile จำเป็นต่อ friendship-status API); ไม่ขอ email
- server สร้าง UserId/PersonId/role/workspace/resource scope จาก session และ DB; query parameter ไม่มี authority
- ถ้ session หาย/หมดอายุ/เปลี่ยน, Origin ไม่ตรง, claims ไม่ครบ, verify API ล้มเหลว หรือ token channel ไม่ตรง ให้ fail closed และออก intent ใหม่หลังผู้ใช้กลับมาลงชื่อเข้าใช้

ก่อน implement ต้องตรวจ current Next.js guide เรื่อง raw request, cookie mutation, Server Actions/Route Handlers และ CSRF ตามคำสั่ง root AGENTS.md; ห้ามอนุมานจาก Next รุ่นเดิม

## 9. J1-06 — OA friendship/reachability แยกจาก identity

สถานะ local มีเพียง UNKNOWN, FRIEND และ NOT_FRIEND:

- Binding ใหม่เริ่ม UNKNOWN
- ตอน LIFF link/reconcile ให้พยายามตรวจ friendship เมื่อมี LINE Login access token scope profile: ตรวจ access token ด้วย GET https://api.line.me/oauth2/v2.1/verify แล้วเช็ก client_id, scope และ expires_in; เรียก GET https://api.line.me/v2/profile เพียงเพื่อเทียบ userId กับ verified ID-token sub แล้วทิ้ง displayName/picture/statusMessage; จากนั้นเรียก GET https://api.line.me/friendship/v1/status ด้วย Bearer access token และอ่านเฉพาะ friendFlag. ห้าม log URL/query/access token. หาก access token/scope ใช้ไม่ได้หรือไม่มี ให้สถานะ UNKNOWN และห้ามเดา
- LINE Login Friendship Status ต้องใช้ access token ที่มี profile scope และ LINE OA ต้อง link กับ LINE Login Channel เดียวกันใน DEMI Provider. Persist เฉพาะ friendFlag/status/time ไม่เก็บ token/profile
- friendFlag=true หมายถึงผู้ใช้เพิ่ม OA และไม่ได้ block; false หมายถึงไม่ friend หรือ blocked ตาม LINE response เท่านั้น ห้ามอ้างว่าแยก deleted account ออกจาก block ได้
- signed follow หมายถึงเพิ่ม OA หรือ unblock; unfollow หมายถึง block. บันทึก observation ตาม event timestamp เพื่อไม่ให้ redelivery เก่าทับ state ใหม่. Friendship API check เก็บ checkStartedAt; transaction ใช้ observation ที่ใหม่กว่าเท่านั้น จึงไม่ให้ response จาก query เก่าที่กลับมาช้าทับ follow/unfollow ใหม่. ถ้า timestamp เท่ากันแต่ผลขัดกัน ให้เป็น UNKNOWN
- check/token/provider failure, missing scope, webhook gap หรือ conflicting observation → UNKNOWN จน successful check/event ใหม่
- Follow/unfollow/block/deleted-account observation ไม่สร้าง, เปลี่ยน หรือยกเลิก DEMI identity binding. ไม่มี automatic unlink
- 17J.1 ไม่มี Push. Push eligibility ต้อง false เมื่อ NOT_FRIEND หรือ UNKNOWN; future Push ต้อง re-evaluate server-owned state และกฎ notification แยก

## 10. J1-07 — Webhook route, allowlist และ durable acceptance

Entry: public POST /api/line/webhook. DEMI ใช้ raw-body byte cap 1 MiB เป็น local DoS/resource-protection limit เท่านั้น ไม่ใช่ LINE platform maximum. ไม่มี event-count cap; ห้ามปฏิเสธ webhook เพราะมีเกิน 100 events

ลำดับบังคับ:

1. อ่าน exact raw UTF-8 bytes โดยใช้ DEMI byte cap ก่อน JSON parse; reverse proxy/body middleware ต้องไม่ rewrite bytes
2. ตรวจ x-line-signature ด้วย HMAC-SHA256(channel secret, raw body) และ constant-time compare ก่อน parse; signature หาย/ผิด = ไม่ process
3. Parse envelope แบบ forward-compatible: validate destination ให้ตรง DEMI Messaging API bot user ID และ validate events เป็น array; strip/ignore unknown additive object fields. ห้าม strict-object schema ที่ reject unknown fields หรือ fixed enum schema ที่ reject event type ใหม่
4. events: [] เป็น valid signed envelope. หลัง signature และ destination/envelope ผ่าน ให้ตอบ 2xx ทันทีโดยไม่ทำ business mutation และไม่ต้องสร้าง event receipt เพื่อรองรับ LINE webhook URL communication verification
5. เมื่อมี events ให้ตรวจแต่ละ element เป็น event object ที่มี type เป็น string แล้ว dispatch ด้วย open-string discriminator; non-object หรือ type ที่ขาด/ไม่ใช่ string ให้ sanitized-ignore เฉพาะ element. Unknown/unsupported event type หลัง valid signature/envelope ให้ sanitized-ignore แล้วทำ event ถัดไปต่อ; ไม่ปฏิเสธทั้ง request. Unsupported event ไม่สร้าง business state หรือ receipt. Unsupported business messages ยังคงเป็น no-op ใน 17J.1
6. สำหรับ event type ที่รองรับ ให้ validate อย่างเข้มเฉพาะค่าที่ DEMI เชื่อ/ใช้:
   - follow/unfollow: type ที่ตรง, source.type ต้อง user, source.userId ต้องตรง LINE user ID format, webhookEventId ต้องเป็น ULID, timestamp ต้องเป็น integer millisecond ที่ valid; ไม่ require field ที่ DEMI ไม่ได้ใช้
   - postback สำหรับ workspace switch เท่านั้น: source.type=user, source.userId, webhookEventId และ timestamp ตามกฎเดียวกัน; postback.data ต้องเป็น string. ถ้าไม่ตรง marker คงที่ DEMI_LINE_WORKSPACE_SWITCH_V1 ให้ sanitized-ignore postback นี้; postback.params.status ต้องเป็น string แต่ห้าม fixed-enum rejection. เฉพาะ exact SUCCESS จึงต้องมี newRichMenuAliasId ซึ่งต้องเป็น alias ใน current manifest; known failure หรือ unknown future status ไม่เปลี่ยน preference
   Unknown fields ใน envelope/event/source/postback/params ถูก strip หรือ ignore. Unknown event type, additive fields หรือ enum values ไม่ทำให้ supported sibling event ถูก reject. หาก trusted field ของ supported event ขาด/ผิด ให้ skip เฉพาะ event นั้นโดยไม่มี mutation และบันทึก sanitized outcome; ทำ event อื่นต่อ
7. ตรวจ destination กับ configured DEMI bot user ID ก่อนรับ mutation. ไม่ trust client/User/Person/role/resource identifiers; source LINE subject ใช้เพียง resolve active binding สำหรับ reachability/preference
8. สำหรับ supported event ที่ valid ให้บันทึก unique webhookEventId และ effect (reachability/preference) ใน per-event transaction เดียว. Duplicate ID = no-op + 2xx. Transaction failure = 5xx; event ที่ commit ไปแล้วจะ dedupe เมื่อ redelivery. ห้าม provider/business HTTP call ใน DB transaction
9. Timestamp ใช้เป็นเวลาเกิด event ไม่ใช่เวลาส่งซ้ำ; ใช้ guard กับ reachability และ presentationRoleSelectedAt. Receipt unique ป้องกัน event ID ซ้ำ. ตอบ 2xx หลังทุก valid supported event durable accepted/duplicate และ event ที่ไม่รองรับ/invalid ถูก sanitized-ignore แล้วเท่านั้น

LINE ระบุว่า webhook body มี destination และ events array; array ว่างใช้ยืนยันการสื่อสารได้ และหนึ่ง request อาจมีหลาย event. LINE ไม่ระบุ maximum event count ในเอกสารปัจจุบัน จึงไม่มี local count cap. [Webhook request/event reference](https://developers.line.biz/en/reference/messaging-api/nojs/), [webhook guide](https://developers.line.biz/en/docs/messaging-api/receiving-messages/)

Rich Menu switch ต้องใช้ webhook อย่างแคบ: richmenuswitch success postback ใช้ marker ที่กำหนดใน action data พร้อม status=SUCCESS และ newRichMenuAliasId. Event ใช้ update UX preference/reconcile menu เท่านั้น ไม่ใช่สิทธิ์/คำสั่ง. ไม่เพิ่ม generic postback processing

## 11. J1-08 — Rich Menu catalog และการ provision

เจ้าของ static images, action manifest, logical menu key และ alias อยู่ใน repo ภายใต้ `src/modules/line/rich-menu/`. เพิ่ม idempotent operator command `npm run line:rich-menu:reconcile` ที่เรียก `jiti scripts/line-rich-menu-reconcile.ts` สำหรับ create/update/reconcile Rich Menu assets และ aliases ผ่าน DEMI Messaging API; ใช้ jiti ที่มีอยู่แล้ว ไม่มี dependency ใหม่

- External DEMI Provider, OA, Messaging API Channel, LINE Login Channel/LIFF และการ link OA กับ Login Channel เป็น operator setup ใน LINE Developers Console; ใช้ DEMI Provider เดียวกันตาม ADR-0009 และห้าม reuse NHFapp
- ไม่มีการ create menu ตอน app start/deploy request; app runtime อ่าน manifest/API-resolved IDs เท่านั้น
- Shared resources เท่านั้น; ห้ามสร้าง Rich Menu ต่อ User หรือ resource
- Operator command ต้องอ่านสถานะ remote ก่อน mutate; stable alias ชี้ไปยัง shared richMenu ID, อัปเดตซ้ำต้องไม่สร้างสำเนา/alias ซ้ำ และการ retire ต้องไม่ลบเมนูที่ยังอ้างอิงโดย user โดยไม่ผ่านการตรวจ
- Set global default เป็น UNLINKED menu ที่แสดงเพียงทางเข้า account linking ที่มีจริง; linked user ใช้ per-user menu
- ใช้ aliases/code-owned manifest ไม่เอา opaque menu IDs จาก client/config ไปเป็นสิทธิ์. จำกัด alias ให้รูปแบบ/ความยาวที่ LINE รองรับปัจจุบัน
- Provisioning result ต้อง verify richMenu image/resource และ alias mapping จาก provider readback; ไม่สร้างผลสำเร็จปลอมใน test

จำนวน finite reusable menu resources เพื่อให้เห็นเฉพาะ workspace ที่ eligible:

| Class | Count | เหตุผล |
| --- | ---: | --- |
| UNLINKED / global default | 1 | ทางเข้าผูกบัญชีที่ truthful |
| LINKED_INELIGIBLE / neutral | 1 | linked แต่ไม่มี operational role ที่ eligible |
| ROLE_CHOOSER | 4 | role set หลาย-role ที่เป็นไปได้ 3 คู่ + 1 ชุดสาม role |
| Role workspace menus | 12 | ทุกชุด eligible 1–3 role × role ที่เลือกอยู่ในชุดนั้น; รวม single-role direct 3 และ multi-role selected-role variant 9 |
| **รวม** | **18** | ใช้ซ้ำได้กับทุก user |

Alias ต้องไม่เกิน current LINE per-channel length/character/uniqueness/quantity limits. Role menu ของ eligible set {PATIENT, OSM} มี switch ไปได้เฉพาะ PATIENT หรือ OSM menu variant ของชุดเดียวกัน; ไม่มี action ไป HOSPITAL. HOSPITAL menus ไม่มี hospital-specific copy/resource ID

## 12. J1-09 — Deterministic initial menu projection

คำนวณจาก persisted binding + current DEMI eligibility เท่านั้น:

| Binding / authority | Menu ที่ต้องเลือก |
| --- | --- |
| ไม่มี binding | UNLINKED (global default; เมื่อ user เป็น friend สามารถ link UNLINKED ต่อ-user เพื่อ readback ได้) |
| Binding unlinked | UNLINKED |
| Active binding แต่ User ไม่ ACTIVE หรือ query fail | LINKED_INELIGIBLE / neutral |
| Active binding + 0 eligible operational roles (รวม ADMIN-only) | LINKED_INELIGIBLE / neutral |
| Exactly 1 eligible operational role | menu ของ role เดียวนั้น โดยตรง; preference ที่ไม่ตรงถูก clear |
| มากกว่า 1 eligible role + remembered presentationRole ยัง eligible | menu variant ของ eligible set + remembered role |
| มากกว่า 1 eligible role + ไม่มี remembered role หรือ role เดิมไม่ eligible | ROLE_CHOOSER ที่มีเฉพาะ eligible roles |

ไม่มี role precedence หรือ implicit sort-to-winner. ถ้าคำนวณ current role set ไม่ได้ ให้คง neutral/last safe menu และ mark reconcile UNKNOWN; ห้ามเดาจากเมนูที่เห็นอยู่

## 13. J1-10 — presentation-role preference

ชื่อ field: `presentationRole` ใน LINE binding (หรือ `selectedLineWorkspace` หาก naming review ของ implementation เลือกชื่อที่ตรง repo มากกว่า). ค่าที่อนุญาต PATIENT, OSM, HOSPITAL หรือ null เท่านั้น

ก่อนใช้ค่าทุกครั้ง: อ่าน persisted preference → resolve current DEMI actor/policy → สร้าง eligible set → ยอมรับ preference เฉพาะถ้าอยู่ในชุดนั้น. ค่านอกชุดถูก clear แล้วใช้ fallback ตามหัวข้อ 12.

ห้าม:

- ตั้งชื่อ `activeRole`, `authorizationRole`, `currentAuthority` หรือ `impersonatedRole`
- ส่งค่า preference ให้ domain service/policy เพื่ออนุญาต resource operation
- ใช้ preference filter Patient/Hospital/Program/appointment/medication/Family/clinical result
- รับ client-supplied preference เป็น binding truth โดยไม่ผ่าน verified switch event/current eligibility

## 14. J1-11 — Option C native switching และ preference sync

- Initial linked user ที่มีหลาย eligible operational roles ได้ ROLE_CHOOSER
- ทุก chooser button เป็น LINE-native richmenuswitch target ไปยัง shared role menu alias ของ exact eligible-role set
- แต่ละ multi-role role menu มีตำแหน่ง/label “สลับพื้นที่” ที่เดิมเสมอ; actions ปลายทางมีเฉพาะ workspace อื่นใน eligible set เดิม
- LINE ทำ menu presentation switch เองและส่ง postback. App ตรวจ signed event, source LINE subject ↔ active binding, known target alias, status SUCCESS แล้ว re-evaluate current eligible roles; ถ้า target ยัง eligible จึง persist presentationRole พร้อม event occurredAt จาก timestamp. รับเฉพาะ timestamp ที่ใหม่กว่า presentationRoleSelectedAt; event เก่าถูก ignore, timestamp เท่ากันแต่ target ต่างกันให้ clear preference แล้ว reconcile ตาม eligible-set fallback โดยไม่เดาลำดับ
- Webhook event เป็น UX persistence trigger ไม่ใช่ authority. API/browser ไม่มี endpoint ที่เปลี่ยน DEMI role
- LINE อาจเปลี่ยนจอแสดงผลก่อน webhook รับ/commit preference. นี่เป็น eventual UX state ที่ยอมรับได้: failure ไม่เปลี่ยน authorization; next readback/reconcile กลับไป expected menu
- ถ้า postback ขาดหาย ให้ reconcile อ่าน per-user linked richMenuId แล้ว map ผ่าน code-owned catalog/verified alias manifest. Adopt เป็น preference ได้เฉพาะเมื่อ richMenuId ตรงกับ role-menu variant ของ eligible set ปัจจุบันแบบ exact match; ถ้าไม่ตรงหรือ map ไม่ได้ ให้ละทิ้งและใช้ fallback. ถ้ารับ preference จาก exact readback ให้ตั้ง presentationRoleSelectedAt เป็นเวลาที่ readback สำเร็จ เพื่อไม่ให้ webhook เก่าทับ state นี้. Readback เป็น UX evidence เท่านั้น
- Switch failure status, unknown alias, event ซ้ำ, source ที่ไม่ใช่ user หรือ role ที่หมดสิทธิ์: ไม่ persist preference; reconcile current menu แบบ fail-closed

## 15. J1-12 — Reconciliation strategy

ใช้ post-commit + lazy reconciliation + operator repair; ไม่เพิ่ม event bus/queue:

1. หลัง link/unlink transaction commit ให้เรียก LINE menu reconcile แยกต่างหาก
2. เมื่อ LIFF account page/workspace entry เปิดด้วย authenticated session ให้ resolve authority ใหม่และ reconcile
3. follow event อัปเดต reachability; ถ้า FRIEND ให้ reconcile เมนู; unfollow อัปเดต NOT_FRIEND และ suppress provider operations ที่ต้อง friendship
4. successful richmenuswitch postback ทำ preference update จาก authority ล่าสุดแล้ว reconcile
5. Role/UserStatus/HospitalMembership/OSM relationship/Patient SELF mutations ไม่เรียก LINE network ภายในหรือท้าย transaction โดยอัตโนมัติ. Server authorization เปลี่ยนทันที; menu จะ lazy-reconcile ครั้งต่อไปหรือผ่าน bounded operator repair command ที่ไล่ active binding ด้วย cursor
6. operator repair รองรับตรวจ/reconcile binding เมื่อ role/membership เปลี่ยนหรือ provider outage ฟื้น; แสดง outcome/status โดยไม่ print LINE subject/token

LINE failure ไม่ทำให้ business/authority mutation fail. User ที่ suspended หรือหมดสิทธิ์ถูก deny แม้ยังเห็น stale Rich Menu อยู่

## 16. J1-13 — Rich Menu readback semantics

หลัง per-user link/switch reconciliation ที่ต้องยืนยันผล ให้เรียก LINE Get rich menu linked to user และเทียบ expected provider richMenuId จาก alias/catalog. HTTP success ของ link API ไม่ถือว่า applied; LINE อาจคืน 200 ทั้งที่ไม่ link เมื่อ user ไม่ friend/blocked หรือข้อมูลไม่ valid.

เก็บ internal status:

- **APPLIED** — successful readback ID เท่ากับ expected ID
- **MISMATCH** — readback มี ID ต่างจาก expected
- **UNAVAILABLE** — friendship known false หรือ provider ตอบ transient/permanent error ซึ่งยังยืนยัน projection ไม่ได้
- **UNKNOWN** — missing config, no definitive response, identity/alias mapping ไม่ครบ หรือยังไม่เคย verify

404 จาก Get linked menu แปลว่าไม่มี per-user linked menu/user ไม่ friend/user unknown ตาม LINE response; map เป็น UNAVAILABLE เมื่อ friendship false/unknown และเป็น MISMATCH เมื่อคาดว่า friend + menu ควรถูก link. No status is an authorization result.

## 17. J1-14 — Initial truthful menu actions

17J.1 menus แสดงเฉพาะ:

- **UNLINKED:** เปิด LIFF account-link page เพื่อเชื่อมบัญชีที่มีอยู่
- **LINKED_INELIGIBLE:** เปิด LIFF account management; แสดงสถานะกลาง ไม่มีปุ่ม operational task
- **PATIENT:** เปิด existing authorized Personal root `/app/personal`; account management; workspace switch ถ้าเป็น multi-role variant
- **OSM / HOSPITAL:** เปิด existing authorized Work root `/app` ซึ่งเลือก/ฉาย resource ผ่าน server ที่มีอยู่; account management; workspace switch ถ้าเป็น multi-role variant
- **ROLE_CHOOSER:** เลือก operational workspace ที่ eligible ผ่าน richmenuswitch เท่านั้น; account management เป็นทางเข้าที่มีจริง

ห้ามเพิ่ม “ตรวจสอบนัดหมาย” chat command, medication/reminder/follow-up button, clinical action หรือ admin label. เมนูไม่ประกาศว่าทำสิ่งที่ runtime 17J.2+ ยังไม่มี

## 18. J1-15 — Deep-link/navigation ownership

เพิ่ม LINE intent builder กลางใน LINE module ที่รับ finite internal intent เช่น LINK_ACCOUNT, MANAGE_ACCOUNT, OPEN_PATIENT_WORKSPACE, OPEN_WORK_WORKSPACE และ SWITCH_WORKSPACE. Builder คืนเฉพาะเส้นทาง DEMI/LIFF ที่ allowlist, จาก config origin/LIFF ID ที่ validate แล้ว.

- อย่ากระจาย literal external URLs ใน image manifest, action data, React component หรือ server action
- workspace root ไม่ encode hospital/patient/resource id; Work selector ใช้ existing server policy
- ไม่ encode National ID, HN, subject, User/Person ID, role authority, capability, session/access token, clinical data หรือ family grant ใน URL/action payload
- Resource ID ที่มีใน URL ภายหลังเป็น locator เท่านั้นและทุก page/action ตรวจ current server authorization
- richmenuswitch postback data เป็น versioned static marker ไม่มี personal data; target role ได้จาก known alias mapping + current policy ไม่ใช่ client field
- LIFF link มาจาก validated `NEXT_PUBLIC_DEMI_LINE_LIFF_ID`; DEMI origin มาจาก allowlist config ไม่รับ return URL จาก client

## 19. J1-16 — Configuration/secrets ownership

Server-side env names ที่เสนอให้เพิ่มตอน implementation (ปรับเฉพาะให้ตรง env schema pattern โดยคงความหมายเดิม):

| Name | ใช้ | เปิดเผยใน browser ได้ |
| --- | --- | --- |
| `DEMI_LINE_MESSAGING_CHANNEL_SECRET` | verify webhook HMAC | ไม่ |
| `DEMI_LINE_MESSAGING_CHANNEL_ACCESS_TOKEN` | Messaging API Rich Menu link/read/provision | ไม่ |
| `DEMI_LINE_MESSAGING_BOT_USER_ID` | validate webhook destination | ไม่จำเป็น/เก็บ server-side |
| `DEMI_LINE_LOGIN_CHANNEL_ID` | expected audience สำหรับ Verify ID token/access token | ไม่จำเป็น/เก็บ server-side |
| `NEXT_PUBLIC_DEMI_LINE_LIFF_ID` | เปิด LIFF client | ได้; เป็น public identifier ไม่ใช่ secret |
| `DEMI_LINE_PUBLIC_ORIGIN` | expected origin/allowlist สำหรับ LIFF callback/mutations | ไม่; server authoritative |

Rich Menu alias/logical key อยู่ใน code manifest; resolved menu IDs อ่านจาก LINE API และไม่จำเป็นต้องเป็น env. ห้ามตั้งค่า NEXT_PUBLIC_ ให้ channel secret/access token. ห้าม copy NHFapp variable/token/provider. ยังไม่มี credential, variable หรือ config ถูกสร้าง/commit ในงานนี้

Operator ต้องสร้าง DEMI channel/token และตั้ง linked OA ผ่าน DEMI Provider ตาม official console flow ก่อน live UAT. Login Channel ID ที่ใช้ Verify ต้องตรง audience ของ LIFF token; Messaging token/secret ต้องเป็นของ DEMI Messaging API channel ที่ webhook รับ

Existing server-only IDENTITY_HASH_SECRET may support the domain-separated LINE subject HMAC fingerprint using a dedicated line-subject namespace; never store it in client config or reuse Person.identityKeyHash as the LINE binding. Preserve hash comparability across key rotation; unresolved key lifecycle must fail closed.

## 20. J1-17 — LINE client boundary

มี typed server-only adapters แยกความรับผิดชอบ:

- Identity client: verify raw LIFF ID token กับ LINE Login API; parse verified sub/aud/exp/iss result
- Friendship client: validate access token, เรียก Profile API เฉพาะเพื่อเทียบ userId กับ verified sub แล้วทิ้งข้อมูล profile ทั้งหมด, query friendship
- Messaging client: signed webhook verification, per-user rich menu link/get/unlink, alias/menu provisioning/readback calls ที่จำเป็นใน 17J.1
- Menu catalog adapter: logical key → alias → richMenuId/provider IDs; ไม่อ่าน menuId จาก client

Service/route/React UI ห้ามกระจาย raw fetch calls หรือ credentials. ใช้ native fetch และ existing schema/error patterns เว้นแต่ code inspection รอบ implementation พบเหตุผลจริงให้เพิ่ม dependency. ห้ามทำ multi-provider abstraction

## 21. J1-18 — Error semantics / privacy-safe responses

Typed internal outcome อย่างน้อย:

- INVALID_LINE_IDENTITY
- LINE_TOKEN_INVALID_OR_EXPIRED
- LINK_INTENT_INVALID_EXPIRED_OR_REPLAYED
- DEMI_ACCOUNT_INELIGIBLE
- LINE_BINDING_CONFLICT
- UNLINK_UNAUTHORIZED
- FRIENDSHIP_UNKNOWN_OR_UNAVAILABLE
- LINE_PROVIDER_TRANSIENT
- LINE_PROVIDER_PERMANENT
- RICH_MENU_MISMATCH
- LINE_CONFIGURATION_MISSING

Client copy ใช้ generic safe explanation และ correlation ID เท่านั้น. ห้ามเปิดเผย LINE subject ownership, existence of another DEMI User, UserId/PersonId, account mapping, roles/memberships/authorization detail, HN/National ID หรือ provider response/error body. แยก retryable provider error ภายในจาก invalid identity/conflict; retry ได้เฉพาะ safe idempotent menu read/write outside transaction

## 22. J1-19 — Logging/observability

Log ได้: opaque correlation ID, operation/event type, outcome enum, duration, provider status class, duplicate/redelivery marker, reconcile status และ retry/repair count.

ห้าม log: raw webhook bytes/body, ID/access token, channel secret/access token, line subject, profile/display name/photo, National ID, HN, clinical data, message content, link challenge, session id หรือ provider body. Audit lifecycle event ใช้ actor/outcome เท่าที่ existing AuditEvent convention ต้องการ ไม่บันทึก external identity.

Operational trace ต้องตามได้จาก webhook operation/event kind → sanitized binding result → reconcile status โดยไม่ต้อง log PII. Metrics ห้าม tag ด้วย subject/UserId

## 23. J1-20 — Authority mutation/reconcile coupling

ตรวจ service mutation points ของ User suspend/restore, UserRole, HospitalMembership, OSM relationship และ Patient SELF authority. Implementation ห้ามสอด LINE API call เข้า transaction หรือทำให้ business mutation fail เพราะ LINE ล่ม

เลือก **lazy reconcile + explicit operator repair** ตามหัวข้อ 15 เพราะ code ปัจจุบันไม่มี post-commit integration event/outbox shared boundary; การเพิ่ม event bus เพื่อ sync menu ไม่คุ้มกับ presentation-only state. หากในอนาคตต้องการ near-real-time menu ต้องเป็น phase/decision แยกพร้อม failure semantics; authorization ยังคง request-time current

## 24. J1-21 — Database / external side-effect boundary

Account link:

external LINE identity verify → PostgreSQL transaction (binding + consume intent + minimized audit) → commit → LINE friendship/menu API → readback/status update

Unlink:

PostgreSQL transaction (soft unlink + consume intent + audit) → commit → LINE menu reconcile/readback

Webhook:

verify raw signature/schema → PostgreSQL transaction (unique receipt + reachability/preference mutation) → commit → 2xx; schedule no external calls inside transaction. Any follow-triggered menu reconciliation starts only after event transaction commits.

If LINE is down after successful local commit, binding/unlink/authority remains authoritative and correct; report pending/UNAVAILABLE, retry only on next lazy reconciliation or operator repair. Never hold DB transaction open across provider HTTP.

## 25. J1-22 — Focused automated verification contract

ก่อน verification ให้ตรวจ package scripts. Implementation must add focused behavioral tests with fake LINE adapters, DB transaction integration tests only where uniqueness/locking matters, and route signature tests against exact raw bytes. Do not fake successful external provisioning or claim LINE Console/device behavior from mocks.

**Account link**

- valid exact LINE subject + exact active DEMI User
- invalid/expired token, wrong issuer/audience/channel, malformed verify response
- same ID token but no DEMI session; client-submitted different User/Person/role ignored
- intent expired, altered challenge, consumed/replayed, action mismatch, stale/different Supabase session
- User changed to suspended/non-active before commit; PROVISIONED/INVITED not eligible; activation incomplete
- same User concurrent different LINE subjects: one wins, no silent replacement
- same LINE subject concurrent different Users: one binding only; other generic conflict
- exact same binding via new valid intent is idempotent; old intent replay denied
- subject unlinked by original owner can relink by explicit flow; cross-user attempt with retained fingerprint is denied; no permanent historical ownership constraint

**Unlink/recovery**

- exact owner self-unlink clears raw LINE subject, preserves only minimized lifecycle/fingerprint evidence for current v1 conflict guard, and does not choose a retention duration
- unrelated authenticated actor cannot unlink; generic failure
- suspended/ineligible owner cannot self-service mutate; binding retained and menu neutral
- valid unlink then same owner relink
- unlink then link a different unowned subject; retained history for another User stays denied; no historical UNIQUE constraint prevents a future approved correction/transfer/erasure flow
- inaccessible old LINE cannot authorize takeover; DEMI account recovery remains separate
- menu provider failure after commit does not roll back link/unlink

**Menu projection/switch**

- unlinked; PATIENT only; OSM only; HOSPITAL only
- ADMIN only; ADMIN + operational role
- PATIENT+OSM; PATIENT+HOSPITAL; OSM+HOSPITAL; all three
- chooser includes exact eligible set; no precedence; singleton direct menu
- valid remembered role; remembered role becomes ineligible; one role remains; zero roles remain
- role menu switch actions target only roles in that eligible set
- native switch webhook success persists UX preference; old/out-of-order/equal-timestamp-conflicting event, failure/unknown alias/role revoked does not
- missing webhook recovered only from exact current-set menu readback; stale-set menu discarded
- stale visible menu cannot authorize protected operation
- APPLIED/MISMATCH/UNAVAILABLE/UNKNOWN readback cases

**Reachability/webhook**

- friendFlag true/false; invalid token/scope/channel and LINE timeout produce UNKNOWN
- follow/add/unblock, unfollow/block, out-of-order timestamps, delayed friendship-query response, webhook gap
- identity binding survives unfollow; Push eligibility false for NOT_FRIEND and UNKNOWN
- valid signature/raw bytes; empty events array returns 2xx with no receipt/mutation; invalid/missing signature; local body cap; >100 events is not rejected by count alone
- malformed envelope/destination; additive unknown fields; unknown event type ignored; unsupported event mixed with supported event; malformed trusted fields skipped per-event; duplicate webhookEventId and redelivery
- richmenuswitch postback validates static marker/status/alias; wrong marker is ignored, SUCCESS with alias updates UX only, failure/unknown status does not; unsupported messages/group/room ignored safely
- durable state + receipt atomic; DB failure returns non-2xx; duplicates safely acknowledge
- safe logs contain no token, body, subject, profile, session, National ID/HN or clinical data

**UI/integration/privacy**

- no client-supplied lineUserId/UserId/PersonId/role/resource id used as proof
- no preference reaches authorization policy
- National ID is never requested, stored in LINE intent/webhook/menu state, or present in logs
- deep links are allowlisted and contain no identity/session/clinical data
- LINKED_INELIGIBLE and UNLINKED labels/actions truthful
- Thai text and Rich Menu assets are mobile-first, accessible/readable and UTF-8; workspace position is predictable; use the project Impeccable skill for the actual LIFF/Rich Menu UI work

Run focused tests first, then affected architecture/lint/typecheck commands; broad suite only once near completion when repo policy and regression risk justify it. No LINE OA real-device UAT is implied by automated tests.

## 26. Official LINE behavior rechecked

ตรวจ official LINE Developers docs วันที่ 2026-10-06; no contradiction with accepted Phase 17J.0/ADR-0009 or Option C was found:

- Messaging API และ LINE Login channels ที่ link identity ต้องอยู่ under same Provider; same person receives same provider-scoped user ID. [Get user IDs](https://developers.line.biz/en/docs/messaging-api/getting-user-ids/), [provider/channel management best practices](https://developers.line.biz/en/docs/line-developers-console/best-practices-for-provider-and-channel-management/), [link a bot to LINE Login](https://developers.line.biz/en/docs/line-login/link-a-bot/)
- LIFF server identity uses raw ID token from liff.getIDToken(); server verifies through LINE Verify ID token API with expected client/channel ID; do not send decoded profile from client. [LIFF user data](https://developers.line.biz/en/docs/liff/using-user-profile/), [LINE Login API reference](https://developers.line.biz/en/reference/line-login/)
- richmenuswitch is a Rich Menu-only action with a richMenuAliasId target and static data marker; LINE switches the displayed menu and returns a postback webhook. The postback includes postback.data and params.status; on success status is SUCCESS and params.newRichMenuAliasId identifies the selected alias. newRichMenuAliasId may be absent when switching fails. This confirms the narrow Option C preference-sync handler. [Switch between rich menus](https://developers.line.biz/en/docs/messaging-api/switch-rich-menus/), [Messaging API action/postback reference](https://developers.line.biz/en/reference/messaging-api/nojs/)
- Webhook request envelope has destination and events array; LINE permits events: [] for communication verification and documents one request with multiple event objects. Current official docs specify no maximum event count, so the 100-event cap is removed. The 1 MiB raw-body cap is DEMI local resource protection only. [Messaging API request/event reference](https://developers.line.biz/en/reference/messaging-api/nojs/), [receive messages](https://developers.line.biz/en/docs/messaging-api/receiving-messages/)
- LINE advises servers to tolerate added webhook properties; Messaging API development guidance also describes compatible additions including enum values. Parse event discriminator as an open string, validate trusted consumed fields, strip unknown additive properties, ignore unknown types/enum values safely, and continue processing supported events independently. [Corporate development guidelines](https://developers.line.biz/en/docs/partner-docs/development-guidelines/), [Messaging API development guidelines](https://developers.line.biz/en/docs/messaging-api/development-guidelines/)
- Per-user menu link is POST /v2/bot/user/{userId}/richmenu/{richMenuId}; readback is GET /v2/bot/user/{userId}/richmenu. A 200 link response is not sufficient evidence; only friends can be linked and some unlinked cases still return 200. [Per-user rich menus](https://developers.line.biz/en/docs/messaging-api/use-per-user-rich-menus/), [Messaging API reference](https://developers.line.biz/en/reference/messaging-api/nojs/)
- Alias is channel-scoped, max 32 characters with alphanumeric/underscore/hyphen, unique per channel, with a documented maximum of 1,000 per OA; alias updates may be cache-delayed. Use stable aliases and provider readback. [Messaging API Rich Menu alias reference](https://developers.line.biz/en/reference/messaging-api/nojs/)
- Follow means added or unblocked; unfollow means blocked. Redelivery may reorder events and has no guaranteed count/interval; use event timestamp + webhookEventId. [Webhook events/redelivery](https://developers.line.biz/en/docs/messaging-api/receiving-messages/), [Messaging API event reference](https://developers.line.biz/en/reference/messaging-api/nojs/)
- Webhook signature is HMAC-SHA256 over unchanged received raw body bytes with the Messaging API channel secret and x-line-signature. [Verify webhook signature](https://developers.line.biz/en/docs/messaging-api/verify-webhook-signature/)
- Friendship Status API returns friendFlag and requires a LINE Login access token with profile scope; true means friend/not blocked, false only establishes otherwise. [Friendship status API](https://developers.line.biz/en/reference/line-login/)

LINE channel access token is a channel-scoped credential: the DEMI Messaging API token belongs to the DEMI Messaging API channel and powers its menu APIs; the webhook signature secret belongs to that same channel. LINE Login verification uses the DEMI LINE Login channel ID as expected audience, not a Messaging API token. Operators use/revoke only DEMI-owned credentials. [Channel access token](https://developers.line.biz/en/docs/basics/channel-access-token/). No NHFapp credential/Provider is reused.

## 27. Go/no-go evaluation

**17J.1 runtime implementation: GO — contract complete.** No security-critical item blocks the v1 scope when implementation enforces active-only DB uniqueness, denies cross-user rebinds against retained identity-history evidence, clears raw LINE subject on unlink, and never uses presentation state as authority.

**OPEN, non-blocking for v1:** exact LINE identity-history fingerprint/owner retention and erasure duration, and future cross-account correction/duplicate reconciliation/merge/transfer semantics. No permanent subject-owner invariant, historical UNIQUE constraint, permanent tombstone, or purge schedule is approved. v1 does not implement a history-erasure or transfer operation; any future flow requires explicit owner/privacy approval and must safely supersede or erase evidence.

Phase 17J.0 remains CLOSED; Phase 17J.0B and Option C remain CLOSED / OWNER APPROVED; Phase 17J.1 runtime remains NOT IMPLEMENTED. Runtime implementation must still re-read current source/Next guide and LINE docs before coding, complete Console/provider configuration outside the repo, and verify actual display on LINE devices later. None of that implementation, provisioning, device UAT or deployment occurred.
