# Phase 17J.0 — DEMI LINE OA / LIFF Architecture & Identity Contract

- สถานะ: **CLOSED / ARCHITECTURE CONTRACT COMPLETE**
- วันที่: 2026-10-06
- ขอบเขต: เอกสารและสัญญาสถาปัตยกรรมเท่านั้น
- 17J.1 identity/account-link foundation: **GO**; single-role Rich Menu foundation: **GO**; multi-role Rich Menu UX: **OPEN / OWNER DECISION REQUIRED**. งาน Phase 17J.1 ยังไม่เริ่ม
- ADR ที่บันทึก boundary: [ADR-0009](../adr/0009-demi-line-oa-liff-identity-and-messaging.md)

## 1. Disposition

Phase 17J.0 ปิดทิศทาง LINE, identity binding, authorization boundary, interaction boundary และ notification transport สำหรับ DEMI แล้ว โดยอาศัยหลักฐานจาก runtime ปัจจุบันและเอกสาร LINE Developers ปัจจุบัน สัญญานี้มีผลกับ DEMI เท่านั้น

การปิด architecture/transport **ไม่ได้** ปิด event, timing, recipient, stale/cancel, content, preference หรือ retry policy ของ reminder แต่ละ domain และไม่ได้เริ่ม runtime LINE

## 2. มติที่เจ้าของอนุมัติแล้ว

- DEMI เชื่อม LINE โดยตรงและใช้ LINE Official Account เฉพาะของ DEMI พร้อม LINE integration ที่แยกขาดจาก NHFapp และแอปอื่น
- ใช้ DEMI LINE Provider เดียวที่มี DEMI Messaging API Channel และ DEMI LINE Login Channel สำหรับ LIFF อยู่ภายใต้ Provider เดียวกัน เพื่อใช้ LINE userId ใน namespace เดียวกันตามกติกาของ LINE
- ใช้ LINE Messaging API สำหรับ Reply และ Push, ใช้ Flex Message เมื่อเหมาะสม, ใช้ Rich Menu แบบแปรตาม authority และใช้ LIFF สำหรับ workflow ที่ต้องการ UI มากกว่า chat
- LINE เป็น proactive notification channel ของ architecture นี้เพียงช่องทางเดียว ไม่มี DEMI Email notification, SMTP, SMS, browser/native push หรือ NHFapp runtime dependency; channel อื่นในอนาคตต้องผ่าน requirement และ architecture decision แยกที่ owner อนุมัติ
- งานสั้นและมีขอบเขตควรทำใน chat; งานซับซ้อน มีหลาย input อ่อนไหว หรือเสี่ยงต่อการยืนยันผิด ให้เปิด DEMI LIFF
- LINE identity เป็น external identity binding เท่านั้น ไม่ให้ DEMI role, membership, capability, scope หรือสิทธิ์ข้อมูล
- Multi-role Rich Menu เป็น OPEN / OWNER DECISION REQUIRED. ยังไม่มีการเลือกเมนูรวม, selector หรือการสลับเมนู
- ADMIN ไม่ได้ operational LINE menu โดยอัตโนมัติ
- ไม่เก็บ National ID ผ่าน LINE chat และไม่ขอ National ID ซ้ำเป็นวิธีปกติหลังผูกบัญชีแล้ว

## 3. สิ่งที่ phase นี้ไม่ทำ

ไม่มีการติดตั้ง SDK/dependency, เปลี่ยน lockfile, เพิ่ม Prisma model/migration, route, LIFF page, webhook, Rich Menu API call, secret/environment variable, Reply/Push handler, scheduler, retry engine, conversation state, reminder delivery, Email/SMTP/SMS, adherence tracking หรือการแก้ไข Patient/OSM/Hospital authorization

ไม่มีการเปลี่ยนสถานะที่ปิดแล้วใน 17I และไม่ปิด gate ที่ไม่เกี่ยวข้อง ได้แก่ P17F-L04/L05, Q5 real-data governance, Phase 17E.2 consent, MED-02, medication adherence, manual browser/device UAT และ production deployment

## 4. หลักฐานจาก repository ปัจจุบัน

อ่าน root AGENTS.md; docs/CONTEXT.md; Phase 17 backlog; 17I.4A; Phase 17A, 17B, 17C, 17D.0/17D.1, 17E.0/17E.1/17E.3, 17F.0/17F.1/17F.2B, 17G.2/17G.3/17G.4A, 17H.4A และ 17I.0B/17I.1/17I.2/17I.3; ADR rules/ADR-0001/0002/0004/0008; Architecture Baseline; และตรวจ runtime authentication/session, activation, schema, route/navigation, Appointment, Medication, Follow-up. เมื่อ historical phase docs ขัดกับ runtime evidence ปัจจุบัน ให้ใช้ implementation ปัจจุบันเป็น source fact และคงถ้อยคำเดิมไว้เฉพาะประวัติ

ณ commit ก่อนเริ่มงาน 17J.0 working tree สะอาดและ HEAD คือ a2315a3. Repo-wide search ครอบคลุม LINE, LIFF, notification, reminder, appointment, medication schedule/occurrence, follow-up, Patient activation, User, Person, Role, membership, capability, scope, route SSOT, National ID และ account linking โดยแยก historical docs ออกจาก implementation. ตรวจ package.json, .env.example, Prisma schema และ route tree เพิ่มเติมแล้วไม่พบ LINE/LIFF runtime, LINE dependency, LINE environment key/credential, webhook route, LIFF page, LINE mapping schema, Rich Menu integration, notification/outbox/queue/scheduler/delivery implementation ปัจจุบันมีเพียงเอกสารเก่าที่กล่าวถึง LINE/LIFF เป็นเรื่องอนาคต และข้อความทดสอบที่ยืนยันว่าไม่มีการส่ง LINE

### DEMI identity และ authentication ที่มีอยู่

- Authentication ใช้ Supabase Auth server boundary; login ปัจจุบัน resolve National ID ไปยัง Person/User ที่มีอยู่ แล้วใช้ password authentication ของ DEMI. อ้างอิง: [authentication-service.ts](../../src/modules/auth/services/authentication-service.ts), [password-login-identity-service.ts](../../src/modules/auth/services/password-login-identity-service.ts)
- Actor context ใช้ server-verified Supabase user, resolve จาก User.authSubject, require User status ACTIVE, แล้วโหลด role/membership ปัจจุบันจาก DEMI. อ้างอิง: [actor-context-service.ts](../../src/modules/auth/services/actor-context-service.ts)
- Schema ปัจจุบันให้ Person เชื่อมกับ User แบบ optional one-to-one; User.authSubject เป็น external auth subject; UserRole รองรับหลาย role. HospitalMembership และ OsmHospitalRelationship แยกกัน. ไม่มี LINE identity model และ User status ไม่มี DELETED; SUSPENDED คือสถานะไม่พร้อมใช้งานที่มีอยู่. อ้างอิง: [schema.prisma](../../prisma/schema.prisma), ADR-0001 และ ADR-0002
- Patient และ workforce มี existing one-time activation capability แล้ว. LINE ต้องไม่สร้าง credential/activation ระบบที่สอง; activation ที่ยังไม่เสร็จต้องผ่าน flow เดิมก่อน binding. อ้างอิง Phase 17E และ [ADR-0008](../adr/0008-workforce-provisioning-and-activation.md)
- Route navigation ปัจจุบันรวมอยู่ที่ [application-navigation.ts](../../src/components/app-shell/application-navigation.ts) แต่ยังไม่มี canonical route/deep-link registry ครอบคลุม LINE

### Domain source ปัจจุบัน

- Appointment: canonical source คือ PatientAppointment และ persisted authority ([schema](../../prisma/schema.prisma)); Phase 17D-NOTIF-01 ยังไม่ตัดสิน event, เวลา, recipient, cancellation/stale, content, preference/consent หรือ retry
- Medication: Phase 17G.2 มี Daily Medication Schedule; Phase 17G.3C มี server-only derived occurrence source ([implementation source](../../src/modules/medications/domain/medication-reminder-occurrence.ts)) จาก schedule ปัจจุบัน. Source นี้ไม่ใช่ delivery, ไม่มี adherence ledger และไม่อนุญาต backfill/delivery ด้วยตัวเอง. MED-02 ยัง requirement-gated และ adherence deferred
- Follow-up: PatientFollowup ที่มีอยู่ ([schema](../../prisma/schema.prisma), [query service](../../src/modules/followups/services/followup-query-service.ts)) คือข้อมูล follow-up ที่บันทึกแล้ว เช่น recordedAt พร้อม optional appointment/program linkage; ยังไม่มี due/reminder schedule ที่อนุมัติ
- ไม่มี notification transport, queue/outbox, delivery intent หรือ scheduler กลางใน runtime ปัจจุบัน

## 5. หลักฐาน official LINE Developers

ตรวจเอกสาร official LINE Developers วันที่ 2026-10-06. ใช้เอกสารเหล่านี้เป็น authority สำหรับพฤติกรรมแพลตฟอร์ม ไม่ใช้ third-party blog เป็นแหล่งตัดสิน:

| ประเด็น | ข้อเท็จจริงที่ใช้ในสัญญา | เอกสารทางการ |
| --- | --- | --- |
| Provider และ userId | LINE userId อยู่ในขอบเขต Provider; LINE Login และ Messaging API channel ภายใต้ Provider เดียวกันได้ userId เดียวกัน; ข้าม Provider ได้คนละ ID. channel ย้าย Provider ภายหลังไม่ได้. การได้ ID เดียวกันไม่ใช่สิทธิ์ใช้ข้อมูลข้ามบริการโดยอัตโนมัติ | [User IDs](https://developers.line.biz/en/docs/messaging-api/getting-user-ids/), [Provider/channel best practices](https://developers.line.biz/en/docs/line-developers-console/best-practices-for-provider-and-channel-management/), [Provider design basics](https://developers.line.biz/en/tips/2026/06/25/provider-design-basics/) |
| OA กับ LINE Login | การ link OA กับ LINE Login channel ต้องใช้ Provider เดียวกัน. Messaging API เองไม่มี per-user friendship status endpoint; LINE Login Friendship status API ตรวจ friendFlag ได้เมื่อ OA ผูกกับ Login channel และต้องใช้ access token ที่มี profile scope. Messaging API มี follow/unfollow events | [Add OA as friend when logged in](https://developers.line.biz/en/docs/line-login/link-a-bot/), [Friendship status API](https://developers.line.biz/en/reference/line-login/), [Messaging API FAQ](https://developers.line.biz/en/faq/tags/messaging-api/), [Receive messages](https://developers.line.biz/en/docs/messaging-api/receiving-messages/) |
| วิธีเชื่อม LINE identity กับ service account | LINE Developers ระบุ LINE Login, Messaging API account linking และ LIFF เป็นวิธีแยกกันซึ่งเลือกตาม entry flow. LIFF flow รับ ID/access token แล้ว service เชื่อม verified LINE user ID กับ service user ID เอง; LINE Platform ไม่เก็บ/จัดการ mapping ระหว่าง LINE ID กับ service ID. DEMI เลือก LIFF เพราะทางเข้าที่อนุมัติคือ OA/Rich Menu → LIFF และผู้ใช้มี DEMI authentication เดิม; Messaging API account-link flow เป็นทางเลือกสำหรับการเชื่อมจาก OA chat โดยตรง ไม่ใช่ขั้นตอนเสริมของ LIFF | [How to link user IDs on the LINE Platform](https://developers.line.biz/en/tips/2026/04/09/user-id-linking/), [User account linking](https://developers.line.biz/en/docs/messaging-api/linking-accounts/) |
| LIFF identity | server ต้องรับ raw ID token หรือ access token แล้วตรวจผ่าน LINE Platform; ห้ามส่ง profile ที่ client อ่าน/ถอดรหัสแล้วไปใช้เป็นหลักฐาน server. ตรวจ ID token กับ expected LINE Login channel ID/audience และใช้ subject จากผล verify เท่านั้น. LIFF access token อาจถูก revoke เมื่อปิด LIFF | [Using user data in LIFF apps and servers](https://developers.line.biz/en/docs/liff/using-user-profile/), [Verify ID token](https://developers.line.biz/en/reference/line-login/) |
| LIFF lifecycle/deep state | LIFF อาจเปิดใน LIFF browser หรือ external browser; ต้อง init ตาม lifecycle ของ LIFF; path/query ที่ส่งผ่าน LIFF URL/state เป็น input ไม่ใช่ authority | [Developing LIFF apps](https://developers.line.biz/en/docs/liff/developing-liff-apps/), [Opening LIFF apps](https://developers.line.biz/en/docs/liff/opening-liff-app/), [LIFF development guidelines](https://developers.line.biz/en/docs/liff/development-guidelines/) |
| Webhook signature | ตรวจ HMAC-SHA256 ของ request body bytes เดิมโดยใช้ Messaging channel secret เทียบกับ x-line-signature ก่อน parse; LINE ส่ง body เป็น UTF-8; ห้ามแปลง body/header ก่อน verify; IP allowlist ใช้แทน signature ไม่ได้ | [Verify webhook signature](https://developers.line.biz/en/docs/messaging-api/verify-webhook-signature/) |
| Webhook delivery | webhookEventId ใช้แยก event ซ้ำ; deliveryContext.isRedelivery แจ้ง redelivery; event อาจมาถึงสลับลำดับ; redelivery ปิดโดย default และการส่งซ้ำไม่รับประกัน จึงห้ามพึ่งพา redelivery เพื่อความถูกต้อง | [Receiving messages](https://developers.line.biz/en/docs/messaging-api/receiving-messages/), [Webhook error statistics](https://developers.line.biz/en/docs/messaging-api/check-webhook-error-statistics/) |
| Reply semantics | replyToken ใช้ได้ครั้งเดียวและควรใช้ทันที; LINE ระบุไม่ควรเกินหนึ่งนาทีหลังรับ webhook และ token อาจไม่มีในบาง event/channel state | [Sending messages](https://developers.line.biz/en/docs/messaging-api/sending-messages/), [Messaging API reference](https://developers.line.biz/en/reference/messaging-api/nojs/) |
| Push retry | X-Line-Retry-Key รองรับ Push API; ใช้ key เดิมเมื่อ retry คำขอเดิมเพื่อกันการ execute ซ้ำและอาจได้ 409 เมื่อคำขอแรก accepted; provider เก็บ retry key 24 ชั่วโมงเท่านั้น; ไม่รับประกันการส่งถึงผู้ใช้ และ HTTP 200 ไม่ยืนยันว่าผู้ใช้ได้รับ | [Retry failed API requests](https://developers.line.biz/en/docs/messaging-api/retrying-api-request), [Messaging API retry reference](https://developers.line.biz/en/reference/messaging-api/nojs/) |
| OA reachability และ Rich Menu | follow event เกิดเมื่อ add/unblock; unfollow เกิดเมื่อ block. Per-user menu link API อาจตอบ HTTP 200 แม้ menu ไม่ถูกผูก; GET user rich menu readback ต้องตรงกับ richMenuId ที่คาดไว้ก่อนถือว่า applied. Rich menu aliases/switch action รองรับการสลับเมนู | [Receive messages / follow and unfollow events](https://developers.line.biz/en/docs/messaging-api/receiving-messages/), [Friendship status API](https://developers.line.biz/en/reference/line-login/), [Use per-user rich menus](https://developers.line.biz/en/docs/messaging-api/use-per-user-rich-menus/), [Messaging API Rich Menu reference](https://developers.line.biz/en/reference/messaging-api/nojs/), [Switch between tabs on rich menus](https://developers.line.biz/en/docs/messaging-api/switch-rich-menus/) |
| API acceptance vs user delivery | Push ไปยัง user ที่ block/unfriend/ลบบัญชีอาจได้ HTTP 200 แต่ไม่ได้รับข้อความ; Rich Menu link ก็อาจไม่ถูกผูกแม้ endpoint ตอบสำเร็จ. HTTP success อย่างเดียวไม่ยืนยัน delivery หรือ menu state | [Messaging API reference](https://developers.line.biz/en/reference/messaging-api/nojs/), [Rich Menu overview](https://developers.line.biz/en/docs/messaging-api/rich-menus-overview/) |
| Flex | Flex ให้ layout/card ที่ยืดหยุ่น แต่ผลแสดงอาจแตกต่างตาม LINE client/device; ไม่ควรใช้แทน UI ที่ต้องมี layout/confirmation รับประกัน | [Flex Messages](https://developers.line.biz/en/docs/messaging-api/using-flex-messages/) |
| API limits | ณ วันที่ตรวจ API reference แสดง Reply และ Push สูงสุด 2,000 requests/second ต่อ endpoint/channel; Reply/Push request มี message objects ได้สูงสุด 5 รายการ; Push นับ monthly OA message quota ต่อ recipient แต่ Reply ไม่นับ; quota/ราคาแตกต่างตาม region/plan. Limits เปลี่ยนได้ จึงตรวจค่าจริงตอน provision/deploy และไม่ฝังค่าใน architecture | [Messaging API reference and rate limits](https://developers.line.biz/en/reference/messaging-api/nojs/), [Messaging API pricing](https://developers.line.biz/en/docs/messaging-api/pricing/) |
| กลุ่ม chat | ข้อความใน group/room มองเห็นโดยสมาชิกคนอื่น จึงไม่ใช่ interaction boundary ที่เหมาะกับข้อมูลผู้ป่วย | [Group chats](https://developers.line.biz/en/docs/messaging-api/group-chats/) |

## 6. Target architecture

~~~mermaid
flowchart TB
  subgraph LINE[DEMI-only LINE identity ecosystem]
    P[DEMI LINE Provider]
    M[DEMI Messaging API Channel]
    OA[DEMI LINE Official Account]
    L[DEMI LINE Login Channel]
    LIFF[DEMI LIFF application(s)]
    P --> M --> OA
    P --> L --> LIFF
  end
  M <--> B[DEMI Backend: LINE boundary]
  L <--> B
  B --> ID[Verified LINE identity binding]
  B --> S[Existing DEMI User/session]
  S --> AUTH[Current Role + Membership + Capability + Scope]
  AUTH --> POLICY[Server-side policy decision]
  POLICY --> DOMAIN[Patient / Appointment / Medication / Follow-up / OSM / Hospital services]
~~~

Provider, OA, Messaging API, LINE Login/LIFF และ credentials ทั้งหมดเป็นของ DEMI โดยเฉพาะ ไม่ใช้ channel/provider/LIFF/mapping/environment/notification ของ NHFapp หรือระบบอื่น

## 7. Provider / Channel / LIFF topology

- สร้าง DEMI Provider เพียงหนึ่งอันสำหรับบริการ DEMI นี้
- สร้าง DEMI Messaging API Channel ที่เชื่อมกับ DEMI LINE OA
- สร้าง DEMI LINE Login Channel และผูก LIFF application(s) ไว้กับ channel นี้
- ทั้งสอง channel อยู่ใต้ DEMI Provider เดียวกัน; เชื่อม DEMI OA กับ DEMI LINE Login Channel ใน Console เพื่อให้ใช้ LINE userId namespace เดียวกันและตรวจ friendship status ผ่าน LINE Login API ได้
- ห้ามนำ Provider เดียวกันนี้ไปเป็น shared identity/data namespace ให้แอปอื่น และห้ามนำ channel ของ NHFapp มาใช้ การมี userId เดียวกันไม่ลบข้อกำหนดตาม LINE User Data Policy
- ไม่สร้าง Provider/channel หลายชุดใน 17J.1 เว้นแต่มีข้อจำกัดแพลตฟอร์มที่ยืนยันได้และมี decision ใหม่ก่อนเปลี่ยน topology
- การเลือก Provider ย้อนกลับยากเพราะ channel ย้าย Provider ไม่ได้ จึงต้องตรวจชื่อ/ผู้ควบคุม/สิทธิ์ admin และ ownership ก่อน provision จริง

## 8. LINE identity ↔ DEMI identity model

ความสัมพันธ์เชิงแนวคิดสำหรับขอบเขตแรก:

~~~text
DEMI Provider namespace + verified LINE userId   0..1 ↔ 0..1   active DEMI User
                                                                │
                                                                └─ exact existing User.personId → Person
~~~

- Binding เป็น external identity association ของ User ที่มีอยู่แล้ว ไม่ผูก LINE userId เข้ากับ Person โดยตรง
- หนึ่ง LINE identity bind กับ DEMI User ที่ active ได้ไม่เกินหนึ่งราย และหนึ่ง DEMI User มี active LINE identity ได้ไม่เกินหนึ่งรายใน v1
- ผู้มีหลาย Role ยังเป็น User เดียวและ Person เดียว; ไม่สร้าง LINE binding แยกตาม role, Hospital, Patient relationship หรือ workspace
- เก็บ provider identity ที่ verified โดย LINE เท่านั้น. Browser supplied lineUserId, DEMI userId, PersonId, HN, National ID หรือ role ใช้สร้าง binding ไม่ได้
- Account linking เป็น explicit opt-in. unique collision, existing binding, stale intent, session/subject mismatch หรือ DEMI user ineligible ต้อง fail closed; ห้าม reassign, merge, replace หรือ takeover เงียบ ๆ
- ไม่กำหนด Prisma table/field/constraint ใน 17J.0. Schema, unique constraints และ transaction design เป็นงาน 17J.1 ตาม invariant นี้

## 9. Secure account-linking flow

### ผู้ใช้ที่มี DEMI User อยู่แล้ว

~~~text
DEMI OA / Rich Menu: เชื่อมบัญชี DEMI
  → เปิด DEMI LIFF
  → ผู้ใช้ยืนยัน LINE ใน LIFF; LIFF ส่ง raw ID token ไป DEMI server ผ่าน HTTPS
  → server ส่ง raw token ไป LINE ID-token verify endpoint พร้อม expected DEMI LINE Login channel ID
  → server ใช้ subject/userId จากผล verify; ไม่ใช้ lineUserId หรือ decoded profile ที่ client ส่งมา
  → existing DEMI authenticated session/login พิสูจน์ exact DEMI User; หากยังไม่ active ให้ทำ activation เดิมก่อน
  → server แสดงผลยืนยันการผูกบัญชีและรับ explicit user confirmation
  → server ออก/ตรวจ single-use link intent + anti-CSRF state ที่อายุสั้นและผูกกับ session, DEMI User และ verified LINE subject
  → transaction ตรวจสถานะและ unique binding ทั้งสองด้าน แล้ว consume intent และสร้าง verified LINE identity ↔ DEMI User binding
  → server resolve current Role/Membership/Capability/Scope และ project เฉพาะ menu mapping ที่ปิดแล้ว
  → หากมีหลาย operational role ให้หยุดก่อนเลือก/assign operational menu จนกว่า owner จะตัดสินใจ
  → ตรวจ OA friendship และยืนยัน per-user Rich Menu ด้วย read-back ก่อนถือว่าเมนูพร้อม
~~~

LINE Developers อธิบาย LINE Login, Messaging API account linking และ LIFF เป็นทางเลือกตาม entry flow. Messaging API account linking มี flow เฉพาะที่ใช้ linkToken + accountLink webhook เพื่อยืนยันผู้ใช้ที่เริ่มจาก OA chat. DEMI เลือก LIFF ตาม product entry flow; ไม่ต่อสองวิธีเข้าด้วยกัน. ความเสี่ยงการทำ custom link flow ที่ LINE เตือนลดด้วยการ verify raw LINE ID token ที่ server, existing DEMI authentication, explicit confirmation, session-bound single-use CSRF/link intent และ transactional unique constraints. LINE subject มาจาก ID token ที่ LINE ตรวจแล้วเท่านั้น.

Link intent เป็น bounded security transaction state ไม่ใช่ conversation state. ใช้ค่าที่คาดเดายาก อายุสั้น ผูกกับ DEMI session และใช้ครั้งเดียว; ปฏิเสธ CSRF, replay, stale session, binding conflict และการเปลี่ยน subject/user หลัง intent ถูกยืนยัน. LINE OIDC nonce ตรวจเฉพาะเมื่อ authorization flow ส่ง nonce มา; ไม่มี Messaging API linkToken, accountLink nonce หรือ accountLink webhook ใน flow นี้.

### OA friendship และ delivery reachability

LINE identity binding และ OA friendship เป็นคนละสถานะ. Binding ที่สำเร็จไม่ยืนยันว่า user ยังเป็นเพื่อนหรือรับข้อความจาก DEMI OA ได้:

- DEMI LINE Login Channel ต้อง link กับ DEMI OA และอยู่ใต้ DEMI Provider เดียวกัน. ระหว่าง LIFF link flow ให้ server ตรวจ friendship ปัจจุบันผ่าน LINE Login `GET /friendship/v1/status` ด้วย access token ชั่วคราวที่มี `profile` scope. ตรวจ access token ผ่าน `GET /oauth2/v2.1/verify` ว่าเป็นของ expected channel, ยังไม่หมดอายุ และมี scope ที่ต้องใช้; ยืนยัน userId จาก `/v2/profile` ตรงกับ subject จาก ID token ก่อนใช้ `friendFlag`. ใช้ token เพื่อตรวจเท่านั้นแล้วทิ้ง; ไม่เก็บ access token, display name, picture หรือ profile fields.
- `friendFlag=true` หมายถึง user เพิ่ม OA เป็นเพื่อนและไม่ได้ block; `false`, scope ไม่พอ, token ไม่ valid หรือ API ตรวจไม่ได้ ให้ถือว่า OA reachability เป็น FALSE/UNKNOWN. การ link DEMI↔LINE อาจคงอยู่ แต่ไม่ assign operational Rich Menu และไม่ enqueue proactive Push จนกว่าจะมีหลักฐาน friend ที่ใช้ได้.
- เก็บ follow/unfollow จาก signed webhook เป็นสถานะ reachability แยกจาก binding. `unfollow` หมายถึง user block OA: suppress Push และอย่าลบ DEMI↔LINE binding. `follow` (add หรือ unblock) เป็นสัญญาณให้ตรวจ friendship/current DEMI authority และ reconcile menu ใหม่; อย่าใช้ `follow.isUnblocked` เป็นหลักฐานแยก add กับ unblock.
- Per-user Rich Menu `POST` อาจตอบ HTTP 200 แม้ user ลบบัญชี, block OA, ไม่เคย add OA หรือ ID มาจาก Provider อื่น. หลัง link/relink ให้ `GET /bot/user/{userId}/richmenu` และต้องได้ richMenuId ที่คาดไว้; 404, mismatch, timeout หรือ API error หมายถึง menu state NOT CONFIRMED และห้ามรายงานว่า applied.
- Push ไปยัง user ที่ block OA หรือ LINE account ที่ไม่มีอยู่อาจตอบ HTTP 200 โดยไม่มีข้อความส่งถึง. ห้ามนับ provider HTTP success เป็น friend status หรือ delivery receipt. เมื่อ reachability เป็น FALSE/UNKNOWN หรือมี webhook processing gap ที่ทำให้ state ไม่น่าเชื่อถือ ให้ระงับ proactive Push; recheck ได้เมื่อ user กลับเข้า LIFF หรือมีเหตุการณ์ follow ที่ verify/reconcile ได้.
- Webhook redelivery ไม่รับประกันครบถ้วน จึงระบุไม่ได้ว่าทุกการ block จะมี server-side signal เสมอ. 17J.1 ต้องเก็บ failure/reachability ให้ fail closed เมื่อทราบว่า unavailable และทำให้ webhook ingestion outage ทำให้สถานะที่ได้รับผลกระทบเป็น UNKNOWN; freshness window สำหรับ Push ต้องกำหนดก่อน 17J.4.

### ผู้ใช้ที่ยังไม่ผ่าน activation

ต้องทำ Patient หรือ workforce activation เดิมให้สำเร็จ แล้ว authenticate เป็น DEMI User ACTIVE ก่อนผูก LINE. ใช้ existing one-time activation capability และ password flow ตาม domain เดิม; ห้ามสร้าง credential, public account creation, identity proofing shortcut หรือ national-ID lookup ทาง chat ขึ้นใหม่

### Unlink / relink / recovery

- ผู้ใช้ต้องมีวิธี unlink ได้ตลอดตามข้อกำหนด LINE. ใช้ LIFF link-management screen ที่ตรวจ LINE ID token ฝั่ง server, ยืนยันว่าผู้ใช้ตรงกับ binding ปัจจุบัน และรับ explicit confirmation ก่อนถอน binding
- LIFF unlink เป็น restricted deauthorization path: ผู้ถือ LINE identity ที่ bind อยู่ถอน binding ของตัวเองได้ แม้ DEMI User ถูก suspend/temporarily ineligible; operation นี้ไม่ต้องผ่าน ACTIVE business policy gate และเปิดได้เฉพาะการถอน binding ไม่เปิด Patient/OSM/Hospital data. หากผู้ใช้มี DEMI authenticated session ก็ใช้ account setting เดิมได้เช่นกัน
- Commit การถอน binding ก่อนหยุดเมนู/Push
- หลัง unlink ค่อยกลับสู่ bounded UNLINKED experience; relink ต้องพิสูจน์ LINE และ DEMI ใหม่ ไม่ยึด UI state เก่า
- หากผู้ใช้เข้า LINE account เดิมไม่ได้ การให้ LINE account ใหม่เข้าถึง DEMI User ต้องผ่าน DEMI account recovery/identity proofing ที่มีอยู่หรือได้รับอนุมัติแยก ห้ามโอน binding ด้วยคำขอใน chat
- exact copy, support escalation และ recovery UX เมื่อ LINE inaccessible ยังเปิด; ไม่เปิดช่องข้าม account proof

## 10. Binding lifecycle กับ authorization eligibility

| สถานะ/เหตุการณ์ | Binding | Business permission / menu / delivery |
| --- | --- | --- |
| ยังไม่เคย link (UNLINKED) | ไม่มี | pre-link menu เท่านั้น; ไม่มี DEMI lookup หรือ push |
| กำลัง link (PENDING) | ยังไม่มี active binding; มีเพียง short-lived DEMI session-bound link intent | intent ใช้ครั้งเดียวและไม่มี authority; stale/replayed intent fail closed |
| link สำเร็จ (LINKED) | verified LINE identity ↔ exact DEMI User | อ่าน role/membership/capability/scope ปัจจุบันทุกครั้งที่ทำ protected action |
| User SUSPENDED / disabled / ineligible | เก็บ binding เพื่อรักษา identity history เว้นแต่ policy erasure ที่อนุมัติเป็นอย่างอื่น | deny business operation และ suppress push; ใช้ neutral linked/ineligible menu |
| role, membership, Patient relationship หรือ capability เปลี่ยน | binding ไม่เปลี่ยน | menu projection reconcile; server policy ใช้สถานะล่าสุดและ deny ทันทีเมื่อ authority หาย |
| conflict, replay, CSRF/session/subject mismatch | ไม่สร้าง/ไม่แก้ binding | fail closed; เก็บเฉพาะ security correlation ที่ไม่บรรจุ PII/token |
| ผู้ใช้ unlink | deactivate/revoke binding หลัง authenticated explicit action | หยุด proactive delivery; กลับสู่ UNLINKED menu หลัง state commit |
| OA friendship TRUE | binding ไม่เปลี่ยน; เก็บ reachability แยก | อาจประเมิน menu และ delivery eligibility หลัง resolve current DEMI authority |
| OA unfollow/block, deleted LINE account, friendship UNKNOWN หรือ menu read-back ไม่ตรง | ไม่ถือว่า DEMI unlink อัตโนมัติ; คง binding | suppress Push และไม่ถือว่า Rich Menu applied; binding ไม่ให้ permission เพิ่ม |
| OA follow/add/unblock | binding ไม่เปลี่ยน | recheck friendship/current DEMI state; reconcile menu แล้วอ่านกลับ expected menu ID |
| relink | สร้าง intent ใหม่หลัง unlink/verified recovery | ตรวจ uniqueness ใหม่; ไม่ย้าย binding ที่ยัง active |
| deleted/erased DEMI account ในอนาคต | schema ปัจจุบันไม่มี User DELETED status | การถอน binding/erasure ต้องตาม policy ที่อนุมัติ; ห้ามตีความการลบเป็นการสร้างสิทธิ์ใหม่ |

Binding validity และ authorization eligibility เป็นคนละแกน. ทุก command, read และ push ที่มี target data ต้อง resolve current DEMI state/policy; menu เป็น UX projection ที่อาจล้าหลังและไม่มีอำนาจอนุญาต

## 11. Authorization trust boundary

~~~text
LINE userId (external identity only)
  → verified server-side binding
  → existing DEMI User / exact Person relation
  → current Role + Membership + Capability + Scope
  → server-side Policy Decision
  → business service / scoped data access
~~~

- LINE ID ไม่ให้ PATIENT, OSM, HOSPITAL หรือ ADMIN authority และไม่สร้าง Hospital membership, Patient relationship, clinical scope หรือ actor impersonation
- Rich Menu, button, postback, LIFF hidden state และ route visibility เป็น presentation/input เท่านั้น
- ทุก mutation/read ใช้ DEMI application service และ policy เดิม; policy fail closed และตรวจ resource relationship แบบ exact ตาม flow นั้น
- Patient command ใช้ existing Patient SELF authority; OSM/Hospital action ใช้ current relationship, membership, capability และ scope ที่ระบบรองรับจริง
- ห้ามใส่ UserId/PersonId/role/scope ใน postback เพื่อให้ client เลือก actor; identifier ของ resource เป็น locator ที่ server ต้อง authorize ใหม่

## 12. Rich Menu policy และ lifecycle

Rich Menu มีผลต่อ presentation ของ user ที่เป็น OA friend; server authorization ยังคงเป็น authority

| สถานะปัจจุบัน | Menu contract |
| --- | --- |
| UNLINKED | default/pre-link menu ที่มีขอบเขตแคบ; primary action คือ เชื่อมบัญชี/ทำ activation ผ่าน LIFF. ห้ามแสดง Patient/OSM/Hospital operation |
| Linked + eligible PATIENT only | แสดงเฉพาะ Patient actions ที่ผ่าน current authority; ไม่มี delegated/family action เว้นแต่ capability นั้นผ่าน gate ของตัวเอง |
| Linked + eligible OSM only | แสดง OSM actions ที่ policy ปัจจุบันรองรับ; ห้ามเดา scope ที่ยังเปิด |
| Linked + eligible HOSPITAL only | แสดง Hospital actions ที่ membership/capability ปัจจุบันรองรับ |
| Linked + หลาย operational roles | **OPEN / OWNER DECISION REQUIRED.** ยังไม่กำหนด operational menu, role precedence หรือวิธีเลือก context; ต้องไม่แสดง menu ของ role เดียวโดยการเดา |
| ADMIN only | ไม่มี operational Rich Menu อัตโนมัติ; ADMIN ที่มี operational role อื่นเห็นได้เฉพาะ actions ของ operational role นั้น |
| Linked แต่ User/role/membership/relationship ไม่พร้อม | ถอน operational actions และใช้ neutral linked/ineligible menu ซึ่งไม่ชวนให้ relink และไม่มี business operation |

### ทางเลือกสำหรับ multi-role UX

| ทางเลือก | Trade-off |
| --- | --- |
| A. Combined role-aware menu | เข้าถึง action ของหลาย role ได้โดยไม่เลือกก่อน; พื้นที่จำกัดและผู้ใช้อาจสับสนว่ากำลังทำงานใน context ใด |
| B. Workspace/role selector | ระบุ context ชัดและไม่กำหนด precedence; เพิ่มขั้นตอนก่อนงานสั้นและต้องออกแบบ selection เมื่อมีหลาย membership/relationship |
| C. Rich Menu tabs / switching | แยก action ตาม role และ LINE รองรับ rich menu switch action/alias; เพิ่มการสลับและเสี่ยง context/menu state เก่าหลัง authority เปลี่ยน |

ทั้งสามข้อเป็นทางเลือกที่ยังไม่ถูกเลือกโดยเจ้าของ. ไม่มี role precedence หรือ default multi-role UX ที่อนุมัติแล้ว. ทุกทางเลือกยังต้อง authorize action บน server.

เมื่อ link สำเร็จหรือ unlink commit แล้ว, role/membership/relationship เปลี่ยน หรือ User ถูก suspend ให้ reconcile menu กับ current DEMI state. หาก LINE API/menu sync ล่าช้าหรือ fail, UI ที่ stale ต้องยังถูก deny โดย server. อย่าถือ HTTP success ว่าผูก menu สำเร็จ; หลัง per-user menu link ต้อง GET read-back และยืนยัน richMenuId ที่คาดไว้. เมื่อ friendship เปลี่ยนให้ recheck/reconcile จาก binding + current eligibility ใหม่. ไม่ถือว่าการเห็น/กดเมนูเป็นหลักฐานสิทธิ์

ทุก linked menu variant ต้องมี bounded ทางเข้าจัดการบัญชี/unlink ไป LIFF; action นี้ไม่ใช่ business role. Multi-role presentation ยังเป็น product decision ไม่ใช่ UI implementation detail.

## 13. Reactive interaction — Reply

~~~text
User action
  → LINE webhook
  → verify signature over original raw body
  → allowlist event + deduplicate
  → resolve verified LINE binding to current DEMI actor
  → authorize current operation
  → call existing business service/query
  → Reply Message / bounded Flex Message using that event's replyToken
~~~

ใช้สำหรับ action ที่ผู้ใช้เริ่ม เช่นกด postback ตรวจสถานะ เลือก bounded action หรือรับผลทันที. replyToken เป็น single-use, อายุสั้น (LINE ระบุให้ใช้ภายในหนึ่งนาที) และอาจไม่มีในบาง event; ห้ามเก็บไว้ทำงานภายหลังหรือใช้แทน push. LINE ระบุ retry key สำหรับ Push/Multicast/Narrowcast/Broadcast ไม่ใช่ Reply; ห้ามอ้างว่า Reply มี provider idempotency key หรือ exactly-once visible response

Deduplicate business effect ด้วย webhookEventId และบังคับ domain-level idempotency สำหรับ mutation ที่อนุมัติให้สั่งจาก chat. Duplicate event ห้ามรัน business side effect ซ้ำ; Reply เป็นผลส่งแยกและ best-effort ภายใน token window. การไม่มี/หมดอายุของ replyToken ไม่สร้างสิทธิ์ให้ส่ง push ทดแทนโดยอัตโนมัติ

เริ่มด้วย deterministic menu/postback intents และ explicit server command. Free-form text อาจให้คำแนะนำทั่วไป แต่ไม่มี generic chatbot/NLU framework และไม่ใช้ข้อความเป็น identity, role, scope หรือ resource authorization

## 14. Proactive interaction — Push

~~~text
Approved DEMI source event
  → durable LINE delivery intent (future implementation)
  → resolve eligible verified linked recipient
  → recheck current source validity + recipient binding/authority where required
  → Messaging API Push / bounded Flex Message
~~~

ใช้เฉพาะ notification/reminder ที่ business requirement อนุมัติแล้ว. Push เป็น API call ที่ DEMI เริ่มเอง ไม่มี replyToken. Appointment/Medication/Follow-up เป็นเจ้าของ source fact; LINE เป็น delivery boundary. ห้ามย้าย business schedule/state เข้า transport module

## 15. Chat หรือ LIFF: decision rubric

ให้ใช้ chat เมื่อ interaction ง่ายกว่าการเปิด UI และตอบได้ด้วย bounded intent/response. ใช้ LIFF เมื่อ interaction ต้องมี UI จริง

| เกณฑ์ | Chat ได้เมื่อ… | เปิด LIFF เมื่อ… |
| --- | --- | --- |
| จำนวน input | ไม่มีหรือมีค่าที่เลือกจาก bounded buttons | หลายช่อง, free-form หรือมี dependency ระหว่าง input |
| ความอ่อนไหว | คำตอบทั่วไป/minimal status ที่อนุมัติแล้ว | identity, account, clinical detail หรือข้อมูลผู้ป่วยละเอียด |
| การยืนยัน | ผลลัพธ์ย้อนกลับได้และอธิบายสั้น | mutation เสี่ยง, ต้อง review ค่า/ผู้ป่วย/ผลก่อน commit |
| ความซับซ้อนภาพ | ปุ่มไม่กี่ตัวหรือ bounded card | ตาราง, form, timeline, clinical context หรือหลาย section |
| จำนวนรายการ | สรุปสั้น/ตัวเลือกจำกัด | list ยาว, pagination, filter หรือ compare |
| navigation depth | action เดียวแล้วจบ | หลายขั้น, branching, save/resume หรือ recovery ที่ซับซ้อน |
| error recovery | retry ได้อย่างปลอดภัยในครั้งเดียว | ต้องแก้หลาย field, แสดง validation หรือป้องกัน partial transaction |

ตัวอย่าง chat: ตรวจ status ที่เปิดเผยได้, ตรวจข้อมูลนัดแบบสรุปที่อนุมัติ, เลือก action ด้วย postback, รับผล/confirmation. ตัวอย่าง LIFF: account linking/login, forms, appointment detail ที่มี sensitive data, medication list/workflow, clinical detail, workspace selection และ mutation ที่ต้องทบทวน. กรณีใดเปิดเผยข้อมูลนัดใน chat ได้บ้างยังต้องมี content decision

## 16. Webhook trust/security contract

- รับเฉพาะ HTTPS ที่ route จำกัดขนาด body ก่อน buffer/parse; ปฏิเสธ body ใหญ่เกิน, missing signature, malformed UTF-8/JSON หรือ signature ไม่ผ่าน
- verify HMAC-SHA256 โดยใช้ Messaging API channel secret และ raw UTF-8 request body bytes เดิม เทียบ x-line-signature ก่อน JSON deserialization; proxy/middleware ต้องไม่ rewrite body/header ก่อน verify
- parse แล้ว validate event schema/field types; ใช้ event allowlist แยกตาม phase. 17J.1 รับเฉพาะ follow/unfollow เพื่อดูแล OA availability; ไม่มี accountLink event ใน flow ที่เลือก. 17J.2 จึงเพิ่ม known business postback/message intents ตาม contract. Unlink ใช้ LIFF/account workflow ไม่ใช้ free-form chat command
- reject หรือ safely ignore group/room event ใน slice ที่มีข้อมูล Patient; ไม่ตอบข้อมูลผู้ป่วยใน group
- ห้ามใช้ role, DEMI id, Patient/Hospital id, National ID หรือ operation permission ที่มากับ text/postback; ทุก identity resolve server-side จาก LINE source ID และ binding ที่ verify แล้ว
- ใช้ webhookEventId เป็น deduplication identity เมื่อมี. ออกแบบให้ duplicate และ reordered follow/unfollow events ไม่ทำธุรกรรมซ้ำ และให้ current observed friendship/business state เป็นตัวตัดสิน
- LINE redelivery ปิด default; interval/จำนวนครั้งไม่รับประกัน. Persist verified/allowed event receipt ก่อน asynchronous processing และตอบ 2xx เฉพาะเมื่อ durable accept สำเร็จหรือยืนยัน duplicate ที่เคย accept แล้ว. หาก persistence fail ต้องไม่ตอบ success, ต้อง alert/reconcile ด้วย operational evidence; ห้ามถือ webhook retry เป็น queue/delivery guarantee
- กำหนด request timeout/body caps/rate/abuse limits ให้ endpoint จบ signature verification + durable accept ภายใน bounded time; ห้ามรอ business/provider call หรือ LINE Reply/Push ใน request/long DB transaction. Implement operational recovery ให้เข้ากับ webhook redelivery setting และ LINE webhook error statistics
- log ได้เฉพาะ correlation ID, webhookEventId, event type, outcome, duration และ safe error category; ห้าม log raw body/text, profile, ID/access/channel token, nonce, national ID, HN หรือ clinical payload
- observability ต้องตาม event→command/delivery intent ได้ด้วย opaque correlation identity ที่ไม่ encode PII

## 17. LIFF trust/security contract

~~~text
LIFF client
  → raw LINE ID token over HTTPS
  → DEMI server verifies token with LINE using expected DEMI LINE Login channel ID
  → server takes subject from verified result
  → existing DEMI authenticated session proves exact DEMI User
  → explicit confirmation + single-use session-bound anti-CSRF link intent
  → transactional unique LINE identity ↔ DEMI User binding
  → current DEMI authorization resolution for each operation
~~~

- ใช้ LINE ID token verify endpoint ฝั่ง server; ตรวจ expected channel ID/audience และ expiry; ตรวจ OIDC nonce เมื่อ LINE authorization flow ส่ง nonce มา. LINE subject มาจากผล verify ไม่ใช่ decoded client profile
- LIFF client supplied lineUserId, DEMI userId/PersonId, role, query parameter, liff.state, local storage, hidden UI หรือ client-selected Patient/Hospital/OSM identity ไม่ใช่ authority
- LIFF API route ใช้ DEMI authentication ที่มีอยู่และ current policy; LINE token ไม่แปลงเป็น DEMI session โดยอัตโนมัติและไม่แทน DEMI password/activation
- ใช้ LIFF scope `openid` สำหรับ ID token. ขอ `profile` เฉพาะถ้าใช้ LINE Login friendship status API; scope นี้ใช้เฉพาะตรวจ friendFlag และไม่เก็บ profile fields. ไม่ขอ email scope
- หลีกเลี่ยง token/PII ใน URL, fragment, analytics, browser history, referrer และ logs. ไม่ persist raw ID/access token; ใช้เฉพาะตรวจ server-side แล้วทิ้ง. Access token ที่ใช้เช็ค friendship ต้อง verify กับ LINE, ยืนยัน profile userId ตรงกับ ID token subject, ใช้ชั่วคราวและไม่เก็บ. LIFF access token ไม่ใช่ durable DEMI session
- LIFF ไม่สร้าง User/Person, activation หรือ business relationship เอง; หน้า/route ทุกตัวตรวจ actor และ resource ซ้ำที่ server

## 18. Privacy และ sensitive data ใน LINE

- ใช้ minimum data ที่ตอบ intent ได้. ตัวอย่าง proactive copy: “คุณมีนัดหมาย” หรือ “มีข้อมูลใหม่” พร้อมปุ่มเปิด DEMI LIFF หลัง server authorization
- ไม่ใส่ National ID, HN, ชื่อเต็ม, diagnosis, clinical note, medication detail, appointment detail/location หรือ token ลง Rich Menu data, postback data, Flex payload, push text, webhook logs, delivery key หรือ telemetry เว้นแต่ owner อนุมัติ disclosure เฉพาะรายการ
- ห้ามเก็บ National ID ใน LINE chat และห้ามใช้เป็น normal lookup factor หลัง link. Anonymous National-ID lookup เป็น privacy/identity-proofing requirement แยกที่ยังไม่อนุมัติ
- ใช้ LIFF เพื่อเปิดข้อมูลละเอียดจาก DEMI server หลัง resolve actor และ policy. Flex คือ presentation ของ message ไม่ใช่ privacy boundary
- Chat เป็น 1:1 กับ user ที่ verified เท่านั้นสำหรับข้อมูลเกี่ยวกับผู้ป่วย; ห้าม group/room delivery
- DEMI กำหนดให้ unlink ได้ตลอดและต้องแจ้งผู้ใช้ก่อน/ขณะ link แม้จะเลือก LIFF linking แทน Messaging API account-link feature. 17J.1 ต้องมีเส้นทาง unlink ที่ใช้ existing DEMI authentication ได้ แม้ OA จะ blocked/unfollowed. Exact notice, retention of link/security records และ allowed fields in reactive appointment replies ยังต้องยืนยัน; safe default คือไม่เปิดเผย detail

## 19. Route / deep-link authority

`application-navigation.ts` เป็น application navigation source ปัจจุบัน แต่ไม่ได้เป็น route/deep-link registry แบบ canonical. 17J.1/17J.2 ต้องกำหนด shared allowlisted intent-to-link builder หนึ่งจุดก่อนสร้าง Rich Menu/postback/LIFF links; ห้าม scatter literal external URLs ใน modules

| Intent | Existing route evidence / contract |
| --- | --- |
| LIFF home | future DEMI LIFF entry; route ต้อง resolve ภายใน allowlist |
| Patient workflow | current Personal appointment list `/app/personal/appointments` ([page](../../app/app/personal/appointments/page.tsx)); detail `/app/personal/appointments/[relationshipId]/[appointmentId]`; each locator must authorize exact SELF again |
| Medication | current Personal workflow `/app/personal/medications` ([page](../../app/app/personal/medications/page.tsx)); no reminder transport inferred |
| OSM/work | current work entry `/app/workforce` ([page](../../app/app/workforce/page.tsx)); every OSM action rechecks supported scope |
| Hospital/work | current eligible routes include `/app/hospitals/contact` ([page](../../app/app/hospitals/contact/page.tsx)) and `/app/hospitals/knowledge` ([page](../../app/app/hospitals/knowledge/page.tsx)); membership/policy must permit access; no inferred authority from path |
| Follow-up | current relationship-scoped history/detail routes `/app/patients/[relationshipId]/followups[/[followupId]]` ([history](../../app/app/patients/[relationshipId]/followups/page.tsx)); Patient personal detail route `/app/personal/care/[relationshipId]/followups/[followupId]` ([detail](../../app/app/personal/care/[relationshipId]/followups/[followupId]/page.tsx)); these records do not imply a future due/reminder source |

Deep link may carry only an allowlisted intent and minimum opaque resource locator; it must never carry DEMI role, authority claim, National ID, HN, Patient identity, session/token, or consent. Missing/invalid locator falls back to the relevant LIFF home/workspace resolver; server must authorize route target on load. 17J.0 defines this ownership contract but does not implement the builder.

## 20. Source ownership inventory: domain facts ≠ delivery

| Domain | Current approved source fact | Delivery status / remaining gate |
| --- | --- | --- |
| Appointment | Existing canonical PatientAppointment with scheduledAt/status and existing DEMI authorization | P17D-NOTIF-01 remains open for event/timing/time zone/recipient/cancel/stale/content/preferences/consent/quiet hours/retry. This phase closes LINE as transport only |
| Medication | 17G.2 saved daily schedule and 17G.3C bounded server-only derived occurrence source from current ACTIVE schedules, local schedule time and Asia/Bangkok date | Source is not a message, persistent notification event, intake/adherence fact, or authorization to send at dueAt. Exact reminder delivery time/preferences need approved requirement; MED-02 requirement-gated; adherence deferred |
| Follow-up | Existing PatientFollowup records historical follow-up with recordedAt and optional appointment/program linkage | No prospective due date, recurrence, reminder schedule or approved LINE event source found |

17G owns medication schedule/occurrence source; 17D/Appointment owns appointment source semantics; Follow-up owns any future follow-up source. 17J owns LINE identity boundary and transport/delivery policy only. No domain module imports LINE transport to calculate business time or mutate source state.

## 21. Proactive delivery failure, retry และ idempotency

- Appointment/Medication/Follow-up transaction completes according to its own business rule; LINE provider success/failure must not decide or roll back that transaction
- Future delivery requires durable intent handoff outside the source transaction boundary or another documented recoverable pattern; no generic multi-channel notification framework is needed
- Before send, recheck current event/source validity, cancellation/staleness, current linked recipient and relevant DEMI eligibility; do not send stale actionable events
- Classify transient vs permanent provider/recipient failures; retry transient failures only, with bounded attempt count, exponential backoff and jitter; stop after permanent errors or limit. Exact limit/backoff and operator handling remain open
- Persist a deterministic local delivery identity for the approved source event/revision + recipient binding + purpose without PII. Reuse one persisted X-Line-Retry-Key UUID for retries of the same supported Push request
- LINE retry key can prevent duplicate API execution for supported requests; it does not guarantee exactly-once visible delivery or successful receipt. On timeout/5xx the request may already have been accepted; resolve ambiguity with same retry key and local state, do not claim exactly once. Provider retains retry-key identity for 24 hours; automatic retry must stay within that window because the same key after 24 hours may execute as a new request. Exact attempt/backoff count remains open
- Reply token is not a push idempotency key and is not reused for proactive delivery
- API rate/quota are per channel/endpoint and may vary by account/region; implementation must read current official limits/quota at provisioning and monitor channel usage

## 22. Conversation state

Initial approved UX is stateless: Rich Menu → known postback → immediate authorized operation/result. No persistent conversation session, pending question table, generic chatbot engine, free-form NLU or state machine is required.

The LIFF link intent / anti-CSRF state is bounded security transaction state, not conversation state. It is session-bound and single-use; no Messaging API account-link nonce, pending accountLink row, persistent conversation session, pending question table, generic chatbot engine, free-form NLU or state machine is needed. If a future approved chat flow needs multiple messages, name its exact steps, expiration, replay behavior, sensitive fields and recovery before adding narrowly scoped state.

## 23. Decisions still open

รายการต่อไปนี้ไม่ block การเริ่ม identity/single-role tranche ที่ระบุใน section 24; แต่ block การส่งมอบ behavior ที่เกี่ยวข้อง:
- Multi-role Rich Menu UX: owner must choose among A. combined role-aware menu, B. workspace/role selector, or C. Rich Menu tabs/switching. No alternative or role precedence is approved. Until then, multi-role users do not receive a selected operational menu and 17J.1 cannot be declared complete for them.

- P17D-NOTIF-01: exact appointment events and timing, recipient authority, time zone, cancellation/stale handling, content, preference/consent and quiet hours
- Medication: explicit approval of reminder delivery, exact due time/content/preferences, and relation to MED-02; no adherence tracking is implied
- Follow-up: whether there is a prospective due/reminder source, its owner, timing and recipient; current historical Followup records do not answer this
- Message disclosure: exact fields allowed in reactive appointment/status messages and privacy notice/retention language for LINE account linking
- Unlink/relink: exact copy and support/recovery workflow if a person cannot access the old LINE account; security proof must remain DEMI-controlled
- Push operations: bounded retry count/backoff, permanent error handling, quota alarms and quiet-hour behavior if required
- Any future notification preference/consent requirement by purpose; no preferences or consent are invented in this contract

No unresolved security-critical decision blocks the bounded identity/account-link and single-role menu foundation. Multi-role Rich Menu UX remains OPEN / OWNER DECISION REQUIRED and blocks complete 17J.1 menu delivery. Proactive Push friendship freshness policy remains a prerequisite for 17J.4. Unrelated gates listed in section 3 remain unchanged.

## 24. Phase 17J.1 implementation prerequisites and scope

### ลำดับ phase ที่คงไว้

17J.0 architecture/identity contract → 17J.1 account linking + role-aware Rich Menu foundation → 17J.2 deterministic reactive commands → 17J.3 LIFF workflows สำหรับงานซับซ้อน → 17J.4 Push สำหรับ approved reminder events → 17J.5A integrated automated re-audit/UAT readiness → 17J.5B real LINE OA/mobile/device manual UAT. ไม่รวม delivery กับ domain source และไม่เพิ่ม generic chatbot layer

### Entry contract

The following prerequisites are closed for the bounded identity/single-role tranche:

- topology/provider/channel relation resolved;
- LIFF ID-token verification uses the expected DEMI LINE Login channel plus existing DEMI authentication/activation;
- uniqueness/conflict/replay fail-closed behavior for a verified identity binding resolved;
- current DEMI authorization remains authoritative;
- UNLINKED and single operational-role menu mapping plus ADMIN-only behavior resolved;
- OA friendship state is separate from binding; follow/unfollow processing and per-user Rich Menu read-back verification are specified;
- DEMI-only credential ownership resolved;
- webhook raw-body signature, event allowlist, deduplication and redaction requirements resolved.

Multi-role UX remains open and is not a prerequisite to begin this bounded tranche. It is a prerequisite to assigning operational Rich Menus to multi-role users and to closing the full 17J.1 deliverable.

### Exact 17J.1 scope

Bounded 17J.1 tranche: provision DEMI-owned Provider/OA/Messaging API/LINE Login+LIFF configuration; choose DEMI-scoped secret/config ownership; implement verified LINE identity ↔ existing DEMI User persistence with unique constraints and transactional fail-closed conflict handling; verify LIFF ID tokens server-side and bind only from the existing authenticated DEMI session after explicit confirmation using a short-lived single-use session-bound anti-CSRF intent; implement self-service unlink through existing DEMI authentication; handle follow/unfollow as OA reachability events only; check friendship with the supported LINE Login endpoint when the required transient token/scope is available; apply and read back the expected per-user Rich Menu; implement UNLINKED, ineligible, ADMIN-only and single-operational-role menu projection; centralize approved LINE intent/deep-link construction; add focused checks for identity conflict/replay, unlink, authority change, friendship loss and menu read-back mismatch.

Do not create/use a Messaging API linkToken, accountLink webhook, or account-link-only pending nonce/state. Detect multi-role users but do not assign or claim a final role-specific operational menu for them before the owner decision. This tranche can prove identity binding and single-role menu behavior; the multi-role experience is excluded from its acceptance and release claim.

17J.1 does not include conversational business commands, notification scheduling/delivery, Appointment/Medication/Follow-up reminders, sensitive clinical replies, new authorization policy, Email/SMS/native push, or generic conversation state. Provision real credentials only in DEMI-owned configuration after the environment/security setup is reviewed; never reuse NHFapp assets.

## 25. Phase 17J.1 GO / NO-GO

**IDENTITY / ACCOUNT-LINK FOUNDATION: GO.** LIFF ID-token verification plus the existing DEMI authenticated session, explicit confirmation, session-bound anti-CSRF intent and transactional uniqueness define the binding authority.

**SINGLE-ROLE RICH MENU FOUNDATION: GO.** UNLINKED behavior, PATIENT-only, OSM-only, HOSPITAL-only, ADMIN-only and current server authorization are specified. OA reachability and Rich Menu API read-back are separate requirements.

**MULTI-ROLE RICH MENU PRODUCT DECISION: OPEN / OWNER DECISION REQUIRED.** A, B and C remain alternatives; none is selected.

**OVERALL 17J.1: CONDITIONAL GO for the bounded identity + single-role tranche only.** Implementation can begin without choosing multi-role presentation only if the scope and acceptance explicitly exclude assigning an operational role menu to multi-role users. **Full 17J.1 completion/release for multi-role users is NO-GO** until the owner chooses A, B or C and the corresponding role-change behavior is specified.

This is a gate decision only. Phase 17J.1 has not been started by this change. Stop after Phase 17J.0.
