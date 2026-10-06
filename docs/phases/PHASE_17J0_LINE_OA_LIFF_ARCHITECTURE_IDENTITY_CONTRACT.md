# Phase 17J.0 — DEMI LINE OA / LIFF Architecture & Identity Contract

- สถานะ: **CLOSED / ARCHITECTURE CONTRACT COMPLETE**
- วันที่: 2026-10-06
- ขอบเขต: เอกสารและสัญญาสถาปัตยกรรมเท่านั้น
- Phase 17J.1: **GO — เริ่มได้ตามสัญญานี้; ยังไม่ได้เริ่มในงานนี้**
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
- ผู้ใช้หลายบทบาทใช้ **เมนูรวมเฉพาะบทบาท/การทำงานที่ปัจจุบันมีสิทธิ์ใช้** ไม่มี role precedence ที่ซ่อนอยู่; มตินี้เจ้าของตอบยืนยันใน Phase 17J.0
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
| OA กับ LINE Login | การ link OA กับ LINE Login channel และ add-friend option ต้องอยู่ใต้ Provider เดียวกัน | [Add OA as friend when logged in](https://developers.line.biz/en/docs/line-login/link-a-bot/) |
| Secure account linking | Messaging API ออก one-time linkToken อายุ 10 นาที; LINE account-link endpoint ตรวจว่า user ที่เปิด token คือ owner ที่ token ผูกไว้; nonce ต้อง random/single-use ยาว 10–255 chars และ LINE แนะนำอย่างน้อย 128 bits; webhook มี accountLink result/nonce และ source เมื่อสำเร็จ; expired/used token ไม่ส่ง webhook. LINE กำหนดให้ unlink ได้ตลอดและแจ้งผู้ใช้ตอน link | [User account linking](https://developers.line.biz/en/docs/messaging-api/linking-accounts/), [Account link event reference](https://developers.line.biz/en/reference/messaging-api/nojs/) |
| LIFF identity | server ต้องรับ raw ID token หรือ access token แล้วตรวจผ่าน LINE Platform; ห้ามส่ง profile ที่ client อ่าน/ถอดรหัสแล้วไปใช้เป็นหลักฐาน server. ID token verification คืนข้อมูล identity ที่ตรวจแล้ว; LIFF access token อาจถูก revoke เมื่อปิด LIFF | [Using user data in LIFF apps and servers](https://developers.line.biz/en/docs/liff/using-user-profile/), [LINE Login ID token verification](https://developers.line.biz/en/reference/line-login/) |
| LIFF lifecycle/deep state | LIFF อาจเปิดใน LIFF browser หรือ external browser; ต้อง init ตาม lifecycle ของ LIFF; path/query ที่ส่งผ่าน LIFF URL/state เป็น input ไม่ใช่ authority | [Developing LIFF apps](https://developers.line.biz/en/docs/liff/developing-liff-apps/), [Opening LIFF apps](https://developers.line.biz/en/docs/liff/opening-liff-app/), [LIFF development guidelines](https://developers.line.biz/en/docs/liff/development-guidelines/) |
| Webhook signature | ตรวจ HMAC-SHA256 ของ request body bytes เดิมโดยใช้ Messaging channel secret เทียบกับ x-line-signature ก่อน parse; LINE ส่ง body เป็น UTF-8; ห้ามแปลง body/header ก่อน verify; IP allowlist ใช้แทน signature ไม่ได้ | [Verify webhook signature](https://developers.line.biz/en/docs/messaging-api/verify-webhook-signature/) |
| Webhook delivery | webhookEventId ใช้แยก event ซ้ำ; deliveryContext.isRedelivery แจ้ง redelivery; event อาจมาถึงสลับลำดับ; redelivery ปิดโดย default และการส่งซ้ำไม่รับประกัน จึงห้ามพึ่งพา redelivery เพื่อความถูกต้อง | [Receiving messages](https://developers.line.biz/en/docs/messaging-api/receiving-messages/), [Webhook error statistics](https://developers.line.biz/en/docs/messaging-api/check-webhook-error-statistics/) |
| Reply semantics | replyToken ใช้ได้ครั้งเดียวและควรใช้ทันที; LINE ระบุไม่ควรเกินหนึ่งนาทีหลังรับ webhook และ token อาจไม่มีในบาง event/channel state | [Sending messages](https://developers.line.biz/en/docs/messaging-api/sending-messages/), [Messaging API reference](https://developers.line.biz/en/reference/messaging-api/nojs/) |
| Push retry | X-Line-Retry-Key รองรับ Push API; ใช้ key เดิมเมื่อ retry คำขอเดิมเพื่อกันการ execute ซ้ำและอาจได้ 409 เมื่อคำขอแรก accepted; provider เก็บ retry key 24 ชั่วโมงเท่านั้น; ไม่รับประกันการส่งถึงผู้ใช้ และ HTTP 200 ไม่ยืนยันว่าผู้ใช้ได้รับ | [Retry failed API requests](https://developers.line.biz/en/docs/messaging-api/retrying-api-request), [Messaging API retry reference](https://developers.line.biz/en/reference/messaging-api/nojs/) |
| Rich Menu | per-user menu หนึ่งอันต่อ user ใช้แทน default menu และเปลี่ยนมีผลทันที; link ได้กับ user ที่เป็น OA friend; เมื่อ unlink per-user menu, default menu จะแสดงหากตั้งไว้ | [Per-user Rich Menus](https://developers.line.biz/en/docs/messaging-api/use-per-user-rich-menus/), [Rich Menu overview](https://developers.line.biz/en/docs/messaging-api/rich-menus-overview/) |
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
- ทั้งสอง channel อยู่ใต้ DEMI Provider เดียวกัน จึงได้ LINE userId เดียวกันของ user เดียวกันตาม namespace ของ LINE และใช้ OA add-friend/linking behavior ที่เกี่ยวข้องได้
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
- Account linking เป็น explicit opt-in. unique collision, existing binding, stale intent, mismatched line user/nonce หรือ DEMI user ineligible ต้อง fail closed; ห้าม reassign, merge, replace หรือ takeover เงียบ ๆ
- ไม่กำหนด Prisma table/field/constraint ใน 17J.0. Schema, unique constraints และ transaction design เป็นงาน 17J.1 ตาม invariant นี้

## 9. Secure account-linking flow

### ผู้ใช้ที่มี DEMI User อยู่แล้ว

~~~text
เพิ่ม/เปิด DEMI LINE OA
  → เมนู UNLINKED แสดงเฉพาะปุ่มเชื่อมบัญชี
  → เปิด DEMI LIFF
  → LIFF ส่ง LINE ID token ไป DEMI server ผ่าน HTTPS
  → DEMI server ขอ LINE ตรวจ token และอ่าน subject จากผล verify
  → ผู้ใช้พิสูจน์ DEMI account ผ่าน existing authenticated session/login
  → server resolve exact ACTIVE DEMI User จาก DEMI session
  → server สร้าง pending link intent + nonce อายุสั้น ผูกกับ User และ verified LINE subject
  → server ขอ Messaging API linkToken ของ LINE subject ที่ตรวจแล้ว
  → เปิด LINE account-linking endpoint ตาม documented flow
  → signed accountLink webhook สำเร็จต้อง match result=ok, source LINE userId, nonce และ pending intent
  → transaction สร้าง binding เฉพาะเมื่อทั้งสอง identity ยัง valid และ unique slots ว่าง
  → resolve current DEMI authority, reconcile per-user Rich Menu
~~~

LINE account-link token เป็น one-time และหมดอายุใน 10 นาทีตาม official docs. Pending DEMI intent/nonce ต้อง single-use, unpredictable, อายุไม่เกิน token และไม่สามารถเปลี่ยน User หรือ LINE subject หลังสร้างได้. Nonce ต้องอยู่ในข้อกำหนด LINE 10–255 characters; ใช้ random secure อย่างน้อย 128 bits ตามคำแนะนำ LINE. ค่า token/nonce ไม่ลง log.

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
| กำลัง link (PENDING) | ยังไม่มี active binding | pending intent อายุสั้น ใช้ครั้งเดียว; ไม่มี authority |
| link สำเร็จ (LINKED) | verified LINE identity ↔ exact DEMI User | อ่าน role/membership/capability/scope ปัจจุบันทุกครั้งที่ทำ protected action |
| User SUSPENDED / disabled / ineligible | เก็บ binding เพื่อรักษา identity history เว้นแต่ policy erasure ที่อนุมัติเป็นอย่างอื่น | deny business operation และ suppress push; ใช้ neutral linked/ineligible menu |
| role, membership, Patient relationship หรือ capability เปลี่ยน | binding ไม่เปลี่ยน | menu projection reconcile; server policy ใช้สถานะล่าสุดและ deny ทันทีเมื่อ authority หาย |
| conflict, replay, nonce/user mismatch | ไม่สร้าง/ไม่แก้ binding | fail closed; เก็บเฉพาะ security correlation ที่ไม่บรรจุ PII/token |
| ผู้ใช้ unlink | deactivate/revoke binding หลัง authenticated explicit action | หยุด proactive delivery; กลับสู่ UNLINKED menu หลัง state commit |
| LINE block/unfollow หรือ OA access หาย | ไม่ถือว่า DEMI unlink อัตโนมัติ | หยุด/ลดการส่งและ reconcile menu ตามสถานะที่ LINE รายงาน; binding ไม่ให้ permission เพิ่ม |
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
| Linked + หลาย operational roles | ใช้ **combined role-aware menu** รวมเฉพาะ section/action ของบทบาทที่ปัจจุบันใช้ได้. ไม่มี HOSPITAL > OSM > PATIENT precedence. หากต้องเลือก Hospital/Patient workspace ให้เข้า selector/workflow ที่ตรวจ authority แยก |
| ADMIN only | ไม่มี operational Rich Menu อัตโนมัติ; ADMIN ที่มี operational role อื่นเห็นได้เฉพาะ actions ของ operational role นั้น |
| Linked แต่ User/role/membership/relationship ไม่พร้อม | ถอน operational actions และใช้ neutral linked/ineligible menu ซึ่งไม่ชวนให้ relink และไม่มี business operation |

### ทางเลือกสำหรับ multi-role UX

| ทางเลือก | Trade-off |
| --- | --- |
| A. Combined role-aware menu — **เลือกแล้วโดยเจ้าของ** | ทำ action ของหลาย role ได้ตรงจาก chat โดยไม่เลือก role ก่อน; พื้นที่เมนูมีจำกัด จึงรวมเฉพาะ action ที่ผู้ใช้ eligible จริงและส่ง form/detail ไป LIFF |
| B. Role/workspace selector เป็นจุดเริ่มทุกครั้ง | แยก context ชัดและไม่จัดลำดับ role; เพิ่ม tap และภาระการเลือกก่อนงานสั้น ๆ จึงไม่ใช้เป็น default menu strategy |
| C. สลับ Rich Menu เป็น tabs แยกตาม role | ลดจำนวนปุ่มที่แสดงพร้อมกัน; เพิ่มขั้นตอนและเสี่ยงให้ user อยู่บน tab ที่ไม่ตรงกับ role/current eligibility. LINE รองรับการสลับ menu แต่ยังไม่จำเป็นสำหรับ initial experience |

ใช้ B เป็น bounded LIFF workspace selector เฉพาะ workflow ที่ต้องเลือกหนึ่งในหลาย Hospital/relationship/resource scopes. คำแนะนำตาม owner decision คือ A สำหรับ default multi-role menu; ทุกทางเลือกยังต้อง authorize action บน server.

เมื่อ link สำเร็จหรือ unlink commit แล้ว, role/membership/relationship เปลี่ยน หรือ User ถูก suspend ให้ reconcile menu กับ current DEMI state. หาก LINE API/menu sync ล่าช้าหรือ fail, UI ที่ stale ต้องยังถูก deny โดย server. อย่าถือ HTTP success ว่าผูก menu สำเร็จ; เมื่อตรวจพบ OA follow ใหม่หรือ menu per-user หาย ให้คำนวณและ reconcile จาก binding + current eligibility ใหม่. ไม่ถือว่าการเห็น/กดเมนูเป็นหลักฐานสิทธิ์

ทุก linked menu variant ต้องมี bounded ทางเข้าจัดการบัญชี/unlink ไป LIFF; action นี้ไม่ใช่ business role. รายละเอียด layout, จำนวนพื้นที่, label/copy และวิธีแสดง multi-membership selector ยังเป็น UI implementation detail ของ 17J.1; การใช้ combined menu และไม่มี role precedence ปิดแล้ว

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
- parse แล้ว validate event schema/field types; ใช้ event allowlist แยกตาม phase. 17J.1 รับเฉพาะ follow/unfollow/accountLink; 17J.2 จึงเพิ่ม known business postback/message intents ตาม contract. Unlink ใช้ LIFF account workflow ไม่ใช้ free-form chat command
- reject หรือ safely ignore group/room event ใน slice ที่มีข้อมูล Patient; ไม่ตอบข้อมูลผู้ป่วยใน group
- ห้ามใช้ role, DEMI id, Patient/Hospital id, National ID หรือ operation permission ที่มากับ text/postback; ทุก identity resolve server-side จาก LINE source ID และ binding ที่ verify แล้ว
- ใช้ webhookEventId เป็น deduplication identity เมื่อมี; accountLink ต้อง consume nonce แบบ single-use. ออกแบบให้ duplicate และ reordered events ไม่ทำธุรกรรมซ้ำ และให้ current business state เป็นตัวตัดสิน
- LINE redelivery ปิด default; interval/จำนวนครั้งไม่รับประกัน. Persist verified/allowed event receipt ก่อน asynchronous processing และตอบ 2xx เฉพาะเมื่อ durable accept สำเร็จหรือยืนยัน duplicate ที่เคย accept แล้ว. หาก persistence fail ต้องไม่ตอบ success, ต้อง alert/reconcile ด้วย operational evidence; ห้ามถือ webhook retry เป็น queue/delivery guarantee
- กำหนด request timeout/body caps/rate/abuse limits ให้ endpoint จบ signature verification + durable accept ภายใน bounded time; ห้ามรอ business/provider call หรือ LINE Reply/Push ใน request/long DB transaction. Implement operational recovery ให้เข้ากับ webhook redelivery setting และ LINE webhook error statistics
- log ได้เฉพาะ correlation ID, webhookEventId, event type, outcome, duration และ safe error category; ห้าม log raw body/text, profile, ID/access/channel token, nonce, national ID, HN หรือ clinical payload
- observability ต้องตาม event→command/delivery intent ได้ด้วย opaque correlation identity ที่ไม่ encode PII

## 17. LIFF trust/security contract

~~~text
LIFF client
  → raw LINE ID token over HTTPS
  → DEMI server verifies token with LINE using expected DEMI Login channel ID
  → server takes subject from verified result
  → existing DEMI authentication/session proves exact DEMI User
  → resolve current authorization and invoke business service
~~~

- ใช้ server verification ของ ID token ผ่าน LINE verify endpoint; ตรวจ expected audience/channel ID, expiry และ nonce เมื่อ flow ส่ง nonce; LINE subject มาจาก verify result ไม่ใช่ decoded client profile
- LIFF client supplied lineUserId, DEMI userId/PersonId, role, query parameter, liff.state, local storage, hidden UI หรือ client-selected Patient/Hospital/OSM identity ไม่ใช่ authority
- LIFF API route ใช้ DEMI authentication ที่มีอยู่และ current policy; LINE token ไม่แปลงเป็น DEMI session โดยอัตโนมัติและไม่แทน DEMI password/activation
- ใช้ LIFF scopes เท่าที่จำเป็น; link proof เริ่มจาก openid/ID token. ไม่ขอ profile/email scope หาก workflow ไม่ต้องใช้
- หลีกเลี่ยง token/PII ใน URL, fragment, analytics, browser history, referrer และ logs. LIFF access token ไม่ใช่ durable DEMI session; token ที่ client ส่งต้องตรวจที่ server
- LIFF ไม่สร้าง User/Person, activation หรือ business relationship เอง; หน้า/route ทุกตัวตรวจ actor และ resource ซ้ำที่ server

## 18. Privacy และ sensitive data ใน LINE

- ใช้ minimum data ที่ตอบ intent ได้. ตัวอย่าง proactive copy: “คุณมีนัดหมาย” หรือ “มีข้อมูลใหม่” พร้อมปุ่มเปิด DEMI LIFF หลัง server authorization
- ไม่ใส่ National ID, HN, ชื่อเต็ม, diagnosis, clinical note, medication detail, appointment detail/location หรือ token ลง Rich Menu data, postback data, Flex payload, push text, webhook logs, delivery key หรือ telemetry เว้นแต่ owner อนุมัติ disclosure เฉพาะรายการ
- ห้ามเก็บ National ID ใน LINE chat และห้ามใช้เป็น normal lookup factor หลัง link. Anonymous National-ID lookup เป็น privacy/identity-proofing requirement แยกที่ยังไม่อนุมัติ
- ใช้ LIFF เพื่อเปิดข้อมูลละเอียดจาก DEMI server หลัง resolve actor และ policy. Flex คือ presentation ของ message ไม่ใช่ privacy boundary
- Chat เป็น 1:1 กับ user ที่ verified เท่านั้นสำหรับข้อมูลเกี่ยวกับผู้ป่วย; ห้าม group/room delivery
- ก่อน complete account link ต้องแจ้งผู้ใช้ว่า unlink ได้ตลอดตามข้อกำหนด LINE; 17J.1 อาจสร้าง technical foundation แต่ไม่เปิด flow ให้ real users จน notice/purpose/retention copy ผ่าน review. Exact notice, retention of link/security records และ allowed fields in reactive appointment replies ยังต้องยืนยัน; safe default คือไม่เปิดเผย detail

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

Account-link pending intent/nonce is bounded security transaction state, not conversation state. If a future approved chat flow needs multiple messages, name its exact steps, expiration, replay behavior, sensitive fields and recovery before adding narrowly scoped state.

## 23. Decisions still open

These decisions do not block 17J.1 foundation, but block the matching user-facing delivery behavior:

- P17D-NOTIF-01: exact appointment events and timing, recipient authority, time zone, cancellation/stale handling, content, preference/consent and quiet hours
- Medication: explicit approval of reminder delivery, exact due time/content/preferences, and relation to MED-02; no adherence tracking is implied
- Follow-up: whether there is a prospective due/reminder source, its owner, timing and recipient; current historical Followup records do not answer this
- Message disclosure: exact fields allowed in reactive appointment/status messages and privacy notice/retention language for LINE account linking
- Unlink/relink: exact copy and support/recovery workflow if a person cannot access the old LINE account; security proof must remain DEMI-controlled
- Push operations: bounded retry count/backoff, permanent error handling, quota alarms and quiet-hour behavior if required
- Any future notification preference/consent requirement by purpose; no preferences or consent are invented in this contract

No open security-critical decision remains for the 17J.1 contract gate. Unrelated gates listed in section 3 remain unchanged.

## 24. Phase 17J.1 implementation prerequisites and scope

### ลำดับ phase ที่คงไว้

17J.0 architecture/identity contract → 17J.1 account linking + role-aware Rich Menu foundation → 17J.2 deterministic reactive commands → 17J.3 LIFF workflows สำหรับงานซับซ้อน → 17J.4 Push สำหรับ approved reminder events → 17J.5A integrated automated re-audit/UAT readiness → 17J.5B real LINE OA/mobile/device manual UAT. ไม่รวม delivery กับ domain source และไม่เพิ่ม generic chatbot layer

### Entry contract

17J.1 prerequisites are closed:

- topology/provider/channel relation resolved;
- binding authority uses verified LINE identity plus existing DEMI auth/activation;
- uniqueness/conflict/replay fail-closed behavior resolved;
- current DEMI authorization remains authoritative;
- unlinked, linked role menu, ineligible menu, ADMIN-only behavior and multi-role combined menu resolved;
- LIFF ID-token verification boundary resolved;
- DEMI-only credential ownership resolved;
- webhook raw-body signature, allowlist, deduplication and redaction requirements resolved.

### Exact 17J.1 scope

Implement only the account-linking and role-aware Rich Menu foundation under this contract: provision DEMI-owned Provider/OA/Messaging API/LINE Login+LIFF channel configuration; choose DEMI-scoped secret/config ownership; implement minimal identity-binding and pending-link persistence with database uniqueness and transactional conflict handling; implement server-verified LIFF + existing DEMI proof + LINE account-link webhook completion and restricted LIFF self-unlink; implement signature/idempotency boundary for follow/unfollow/accountLink; implement UNLINKED, eligible role and neutral ineligible per-user menu projection including owner-approved combined multi-role menu and a common account-management entry; centralize approved LINE intent/deep-link construction; add focused tests and automation for identity conflict, replay, unlink, authority change and menu staleness.

17J.1 does not include conversational business commands, notification scheduling/delivery, Appointment/Medication/Follow-up reminders, sensitive clinical replies, new authorization policy, Email/SMS/native push, or generic conversation state. Provision real credentials only in DEMI-owned configuration after the environment/security setup is reviewed; never reuse NHFapp assets.

## 25. Phase 17J.1 GO / NO-GO

**GO.** Owner selection of “เมนูรวมเฉพาะบทบาทที่ใช้ได้” resolved the multi-role Rich Menu decision. The security-critical architecture prerequisites above are now explicit and no remaining open business-event semantics are needed to build account linking/menu foundation.

This is a gate decision only. Phase 17J.1 has not been started by this change. Stop after Phase 17J.0.
