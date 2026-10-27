# การเปิดใช้งานบัญชีและเริ่มใช้ LINE (UX-A + UX-B)

## ความพร้อมกู้คืนของ Hospital OWNER (2026-10-26)

หน้า **ตั้งค่าบัญชีส่วนตัว → บัญชี LINE** แสดงคำแนะนำแบบปิดได้สำหรับผู้มีบทบาท Hospital OWNER และ active OWNER membership ใน Hospital ที่ยัง active เท่านั้น การผูก LINE เป็นทางเลือก; หาก OWNER ใช้ LINE ไม่ได้ Platform ADMIN ยังช่วยกู้คืนได้ และ Hospital ที่มี OWNER ใช้งานได้เพียงคนเดียวจะแสดงจำนวน Hospital ที่ตรวจพบโดย query จาก active OWNER membership ปัจจุบัน

สถานะ “พร้อม” เป็นเพียงข้อมูลประกอบ UI: ต้องมี active binding, มี observation ที่ยืนยันว่าเป็นเพื่อนกับ DEMI และ observation ต้องมีอายุไม่เกิน 24 ชั่วโมง พร้อม configuration สำหรับคำขอกู้คืน LINE ระบบไม่ตีความ LINKED, observation ที่หายไป, timestamp ในอนาคต, สถานะ UNKNOWN/NOT_FRIEND หรือ observation ที่เก่ากว่า 24 ชั่วโมงว่าใช้รับลิงก์ได้ Rich Menu readiness ไม่ถูกใช้แทนสถานะการส่ง recovery ระบบไม่เรียก LINE provider ระหว่าง render; ผู้ใช้เปิดหน้าจัดการ LINE เพื่อใช้ status-check ที่มีอยู่ได้ สถานะนี้ไม่ preflight การส่ง LINE Push และไม่รับประกันว่าคำขอถัดไปจะส่งถึง หาก Push ล้มเหลว ระบบเดิมจะยกเลิก capability ที่ใช้ไม่ได้; ให้ใช้การกู้คืนแบบมีผู้ช่วย หาก configuration ไม่พร้อมหรือ status-check พบข้อผิดพลาด

## UX-C.1 final hardening — ข้อกำหนดปัจจุบัน (2026-10-26)

เพิ่มเติมจาก implementation `73d2860` ด้านล่าง:

- Status request ต้องผ่าน exact same-origin / bounded strict schema → verified DEMI session → PostgreSQL quota → LINE token/subject/friendship verification → leased reconciliation → persisted summary ใช้ session ที่ server ตรวจแล้วซ้ำภายใน request ไม่รับ principal จาก client
- ใช้ `LineWorkflowRateLimitBucket` เดิมและ atomic capped upsert เพิ่ม category `ACCOUNT_STATUS_USER` **6 ครั้งต่อผู้ใช้ / bucket 5 นาที** และ `ACCOUNT_STATUS_GLOBAL` **600 ครั้งรวม / bucket 5 นาที** แยกจาก workflow quotas ทั้งหมด เก็บ key hash ตาม purpose/category เดิม ไม่มี raw identity, table หรือ migration ใหม่ สอง bucket ไม่ได้เป็น transaction เดียว: user quota ที่ใช้แล้วไม่คืนเมื่อ global ปฏิเสธ ช่วยจำกัดการยิงซ้ำขณะ global เต็ม Fixed-window อาจมี burst ข้ามขอบ bucket ตาม convention เดิม
- ปฏิเสธก่อน LINE provider calls ด้วย **429**, ข้อความ “ตรวจสอบสถานะบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่”, `Retry-After` จำนวนวินาทีถึง bucket ถัดไป และ `Cache-Control: private, no-store` ทุกผลตอบกลับ หาก shared storage ล้มเหลวส่ง sanitized 503 แบบ fail closed
- เลือก **Option A**: LINE verification + Messaging API ทุก call ใช้ **AbortSignal deadline รวม 12 วินาที** เริ่มก่อน resolve session/quota ไม่ใช่ timeout ใหม่ 12 วินาทีต่อ call ใช้ injected fetcher เดิมของ adapters และรอ reconciler จัดการ error/persistence/finally คืน lease ไม่มี `Promise.race()`, floating background promise หรือ async continuation ใหม่ เมื่อ budget หมดส่ง error ไม่ส่ง CHECKED/PENDING ปลอม
- Route ประกาศ `maxDuration = 20` วินาที; client คง 25 วินาที มี 8 วินาทีเผื่อ auth/DB/cleanup นอก provider budget และ 5 วินาทีระหว่าง host cap กับ client deadline Platform ต้องรองรับ config นี้ตาม [Next.js/Vercel duration](https://vercel.com/docs/functions/configuring-functions/duration); ยังไม่ได้ deploy หรือยืนยัน effective dashboard configuration ในงานนี้ Host kill/storage outage อาจขัดการคืน lease ต้องรอ lease เดิม 90 วินาทีหมดอายุ การเชื่อมบัญชีไม่ถูกล้าง
- CHECKED = attempt จบและอ่าน persisted summary หลังจากนั้น; ยังต้อง LINKED + FRIEND + APPLIED จึงพร้อม PENDING = BUSY/MISSING ที่ยังยืนยัน completion ไม่ได้ ค่า APPLIED เก่าไม่แสดงพร้อมในกรณีนี้ Provider UNAVAILABLE, invalid identity/auth, storage failure หรือ deadline เป็น error ไม่เปลี่ยน binding เป็น unlinked
- Abort ของ HTTP write ไม่รับประกัน provider ย้อนผลที่อาจรับไปแล้ว หาก timeout หลังส่ง write ถือผลไม่แน่นอน ใช้ UNAVAILABLE/ไม่มี confirmed read-back และ version-fenced persistence เดิม ไม่ลด lease หรือข้าม read-back ผู้ใช้ตรวจซ้ำภายหลังผ่าน quota และ lease ได้ ไม่มี automatic retry/polling Page/link/friendship `after()` เดิมยังแยกจาก endpoint นี้และไม่รับรอง completion
- UI แสดง 429 และปิดปุ่มตรวจตาม `Retry-After` timer ไม่เรียก provider เองเมื่อครบเวลา Timeout แสดง “ยังตรวจสอบสถานะ LINE ไม่สำเร็จ กรุณาลองใหม่ภายหลัง” และแยกข้อมูล binding ที่เคยตรวจได้ออกจากสถานะปัจจุบันที่ยังไม่ยืนยัน ไม่อ้างว่ายัง linked จาก timeout เพียงอย่างเดียว มีเว็บ fallback และไม่ opt-in notification

ติดตาม aggregate counts ของ 429/503, latency ของ status route, provider-budget abort, BUSY และ persisted UNAVAILABLE เพื่อหาความผิดปกติและปรับ capacity ตามหลักฐาน ห้าม log request body, credentials, invitation URL, principal/LINE subject, appointment หรือ clinical data การยืนยันบน Vercel และ real-device UAT ยัง pending ดู [audit/verification](./MOBILE_ONBOARDING_AUDIT_UAT.md)

## LINE Disconnection แบบรวมขั้นตอน (2026-10-27)

- หน้าบัญชี LINE ที่เชื่อมอยู่มีปุ่มเดียว “ยกเลิกการเชื่อมต่อ LINE” และยืนยันครั้งเดียว ระบบยกเลิก binding ทันที พยายามถอนสิทธิ์เฉพาะช่องทางที่มี token ของช่องทางนั้น แสดงสถานะการถอนสิทธิ์ตามจริง แล้วออกจากระบบ DEMI และไปหน้าเข้าสู่ระบบ `/login?returnTo=/line/account`
- หากออกจากระบบไม่สำเร็จหลังยกเลิกการเชื่อมต่อแล้ว หน้าจอจะแจ้งว่ายกเลิกการเชื่อมต่อแล้วแต่ยังออกจากระบบไม่สำเร็จ และปุ่ม “ลองออกจากระบบอีกครั้ง” จะเรียกเฉพาะ `POST /api/line/account/sign-out` ไม่ unlink หรือถอนสิทธิ์ซ้ำ
- Sign-out ใช้หลักฐานจาก UNLINK intent เดิม server จะออกจากระบบเฉพาะเมื่อ intent นั้นสำเร็จแล้วโดย User และ session เดียวกับคำขอปัจจุบัน หากอีกแท็บเปลี่ยนเป็นบัญชีอื่นหรือ session ใหม่ ระบบจะไม่ออกจากระบบให้และแจ้งให้โหลดหน้าใหม่
- หาก response ของการยกเลิกหายไป ระบบจะถาม server ก่อนว่าการยกเลิกสำเร็จหรือยัง ถ้าสำเร็จจึงออกจากระบบ ถ้ายังไม่สำเร็จจะคง session ไว้ และไม่ส่งคำขอยกเลิกซ้ำ
- MINI App: Account LIFF token ใช้แทน MINI token ไม่ได้ สถานะ MINI จึงยังเป็น “ยังไม่ยืนยันถอนสิทธิ์” เจ้าของเดิมจะต้องผ่าน Recovery เมื่อจะเชื่อมกลับ ส่วนบัญชี DEMI อื่นเชื่อม LINE เดียวกันได้ตามปกติโดยไม่เห็น Recovery ของเจ้าของเดิม
- ข้อมูล Recovery ใน localStorage ใช้ได้เฉพาะ User/session ที่เริ่มไว้ ข้อมูลของ session อื่น ข้อมูลที่หมดอายุ หรือชุดรายการที่จัดการแล้ว จะถูกล้างทิ้งและไม่ถูกแสดง
- การออกจากระบบปกติบนเว็บยังเป็นการออกจาก session เท่านั้น ไม่ยกเลิกการเชื่อมต่อ LINE

UAT บนอุปกรณ์จริงของ flow นี้**ยังไม่ได้ทำ** รายการตรวจ (ใช้ LINE ทดสอบและฐานข้อมูลทดสอบเท่านั้น) ดูการตัดสินใจใน [ADR-0009](../adr/0009-demi-line-oa-liff-identity-and-messaging.md):

1. A เชื่อม LINE แล้วกด “ยกเลิกการเชื่อมต่อ LINE” → ยืนยัน → หน้าจอแสดงยกเลิกแล้ว สถานะ LINE Login/MINI ตามจริง และไปหน้าเข้าสู่ระบบ
2. เข้าสู่ระบบเป็น B ใน LINE เดิม → เห็นปุ่ม “เชื่อมบัญชี LINE นี้” ตามปกติ ไม่มีส่วน “ตรวจสอบสิทธิ์ LINE” หรือ dropdown
3. B เชื่อมสำเร็จด้วยรหัสผ่านของ B → Rich Menu เป็นของ B และ A ยังเข้าเว็บ DEMI ได้ตามปกติ
4. ขณะ A ยังเชื่อมอยู่ B เชื่อม LINE เดียวกันไม่ได้
5. A เข้าสู่ระบบอีกครั้งแล้วจะเชื่อมกลับ → ต้องผ่าน Recovery เฉพาะรายการของ A ครั้งเดียวต่อการยกเลิกหนึ่งครั้ง
6. เริ่ม Recovery ของ A ค้างไว้ แล้วออกจากระบบ และเข้าสู่ระบบเป็นบัญชีอื่นที่มี Recovery ของตัวเอง → ไม่เห็นรายการของ A ที่ค้างไว้
7. ตัดเน็ตหลังกดยืนยันยกเลิก → ระบบตรวจผลจาก server แล้วออกจากระบบเมื่อยกเลิกสำเร็จจริง ไม่ยกเลิกซ้ำ ส่วนการออกจากระบบที่ล้มเหลวให้ลองเฉพาะการออกจากระบบ
9. เริ่มยกเลิกในแท็บหนึ่ง แล้วเปลี่ยนเป็นบัญชี B ในอีกแท็บก่อนผลกลับมา → B ต้องไม่ถูกออกจากระบบ
8. ทดสอบทั้งใน LINE app (in-client) และเบราว์เซอร์ภายนอก รวมถึงการกดปุ่มยืนยันซ้ำเร็ว ๆ

## UX-C.1 — ความต่อเนื่องบนมือถือ (2026-10-26)

เส้นทาง activation → เลือก LINE/เว็บ → login เมื่อจำเป็น → ยืนยัน password → binding → friendship → menu → optional opt-in ยังคงเดิม ดู [audit และ UAT 20 สถานการณ์](./MOBILE_ONBOARDING_AUDIT_UAT.md) สำหรับหลักฐานและรายการที่ยังไม่ได้ทดสอบบนอุปกรณ์จริง

- ปุ่มตรวจเมนูไม่ reload หน้าแล้ว แต่ส่ง POST `/api/line/account/status` พร้อม LINE proof ใน body เท่านั้น ใช้ exact same-origin, bounded JSON, strict schema และ `refreshLineAccountReachability()` เดิมเพื่อยืนยัน session/LINE subject/ownership ก่อนเรียก reconciler กับ binding ที่ server resolve
- Endpoint รอ `reconcileLineBinding()` เดิมหนึ่งครั้ง แล้วอ่าน summary ที่ persisted ใหม่ `CHECKED` หมายถึงการเรียกจบ ไม่ได้รับรองว่า menu พร้อม; ต้องตรวจ `LINKED + FRIEND + APPLIED` อีกชั้น `BUSY`/`MISSING` ส่ง `PENDING` และ UI ไม่ใช้ APPLIED เก่ามาประกาศพร้อมในครั้งนั้น ไม่วนตรวจเอง
- Page load, link และ friendship refresh เดิมยังใช้ `after()` ไม่ได้หมายความว่างานเสร็จพร้อม response ปุ่ม explicit check ใช้ lease/version fencing และ bounded stale reconciliation เดิม ไม่สร้าง queue, table หรือ provider retry loop ใหม่
- ขณะตรวจ แสดง busy ทันที ปิดปุ่มซ้ำและการ unlink; client timeout 25 วินาที และ abort เมื่อ unmount/pagehide ผลล่าช้าไม่เปลี่ยนหน้าที่ออกไปแล้ว Browser abort **ไม่ได้ยกเลิกงาน server/provider ที่เริ่มแล้ว** งานนั้นยังถูกจำกัดด้วย timeout ของ provider และ lease/fencing เดิม ผู้ใช้ retry ภายหลังได้ หากติด lease จะแสดงว่ายังตรวจไม่เสร็จ
- UNKNOWN menu แสดงกำลังตรวจ, MISMATCH/UNAVAILABLE แสดงเมนูยังไม่พร้อม, UNKNOWN friendship แสดงยังยืนยันสถานะ LINE ไม่ได้; NOT_FRIEND ให้เพิ่ม/ปลดบล็อก OA และตรวจด้วยตนเอง ทั้ง binding success และ already-linked แสดง readiness จริง แยกจากการเชื่อมสำเร็จ
- Confirmation มีการยืนยันเพียงจุดเดียว ใช้ heading ที่รับ focus ได้แทนปุ่ม disabled และ Back คืน focus ส่วนสถานะ มีปุ่ม “ใช้บัญชี DEMI อื่น” โดยตรงพร้อมแจ้งว่าการออกจากระบบยกเลิก confirmation ใช้ sign-out/login เดิม ไม่มี principal selector หรือข้อมูลระบุตัวตนใหม่ ActorContext ปัจจุบันไม่มีชื่อที่เหมาะให้แยกบัญชี; หากไม่แน่ใจให้ login ใหม่ด้วยบัญชีที่ต้องการ
- บัญชี linked ที่ต้อง login LINE เพื่อตรวจสถานะไม่สร้าง LINK intent เพิ่ม ส่วน unlinked ยังคง preflight และ link confirmation ตามเดิม การ login LINE ไม่สร้าง binding
- กลับ LINE ด้วย closeWindow เฉพาะ in-client; ปุ่มกลับเด่นเมื่อพร้อมจริง ภายนอกให้กลับแชต OA ด้วยตนเองและมี `/app` เสมอ ไม่มีการรับประกัน deep link จะเปิดแอป
- Activation/RESET, credentials/session ownership, notification preference และ scheduler/delivery ไม่เปลี่ยน การเชื่อมและการตั้งรหัสผ่านไม่ opt-in อัตโนมัติ UX-C.2 session handoff ยังไม่ทำ

ผล verification ของ C.1 บันทึกใน audit/UAT document; ผล UX-A/B ด้านล่างเป็นหลักฐานของ commit เดิม ไม่ใช่การอ้างว่าทดสอบอุปกรณ์จริง

วันที่: 2026-10-26 · ฐานก่อนแก้: `0c7fbc111136c98997dc4652eeda4c33533a5b54`

เดิมหน้าสำเร็จมีเพียงปุ่มเข้าสู่ระบบ ผู้ใช้ไม่ทราบว่าการตั้งรหัสผ่านยังไม่ได้เชื่อม LINE และอาจต้องเข้าสู่ระบบใหม่เมื่อเปิด LINE คนละเบราว์เซอร์ การปรับนี้เปลี่ยนคำแนะนำและทางเลือกบน flow เดิม ไม่เปลี่ยนวิธียืนยันตัวตน

## เส้นทางที่ใช้งาน

```text
Invitation Link (token ใน fragment ตามเดิม)
  → Account Activation
  → Activation Success (เมื่อ server ยืนยันสำเร็จเท่านั้น)
      ├── เข้าสู่ระบบผ่านเว็บก่อน → DEMI Login → Authorized Workspace
      └── เชื่อม LINE เพื่อเริ่มใช้งาน
            → Configured LIFF Entry
            → DEMI Login หากยังไม่มี session → /line/account
            → LINE Login หาก LIFF ต้องการ
            → Existing Secure Link Confirmation + รหัสผ่านปัจจุบัน
            → Binding Success
            → Friendship / Rich Menu Readiness
            → Optional Appointment Notification Opt-in
            → LINE Ready
```

ก่อนตั้งรหัสผ่านแสดง “ตั้งรหัสผ่าน → เชื่อม LINE (เลือกได้) → เริ่มใช้งาน” หลังสำเร็จแสดง “เปิดใช้งานบัญชีสำเร็จ!” พร้อมปุ่ม LINE และเว็บ ผู้ใช้เลือกข้าม LINE ได้เสมอ การเปิดบัญชีไม่ได้สร้าง DEMI session หรือผูก LINE ให้เอง

Patient ใช้ flow เดิมของตนเอง ส่วน OSM, Hospital MEMBER/OWNER และ Child OWNER ใช้ workforce form ร่วมกัน ข้อความ onboarding ของ workforce แสดงหลัง preview purpose สำเร็จและเฉพาะ `ACTIVATION` / `CHILD_OWNER_ONBOARDING` ส่วน `RESET` ยังคงข้อความตั้งรหัสผ่านใหม่และปุ่ม login โดยไม่มีคำชวนเชื่อม LINE ซ้ำ ไม่มีการแก้ binding หรือ notification preference จาก activation

Public Hospital application/approval, `/register`, การรับคำเชิญของ OWNER ที่มีบัญชี ACTIVE แล้ว และ caregiver invitation claim เป็นคนละ contract ไม่ได้เปลี่ยนในงานนี้ โดยเฉพาะ caregiver-only ไม่มีสิทธิ์ LINE binding จากการเพิ่ม UI นี้

## Configuration และขอบเขต session

- Server pages เรียก `getPublicLineAccountEntryUrl()` ซึ่งใช้ `buildLineIntentUrl("LINK_ACCOUNT")` และตัวตรวจ environment เดิม ไม่อ่านปลายทางจาก query ของผู้ใช้
- LIFF root ชี้ไป endpoint `/line/account` ตาม configuration เดิม ไม่ต่อ path ซ้ำ ไม่ใส่ activation token ลง URL ภายนอก และไม่ redirect อัตโนมัติ
- หาก config ขาดหรือไม่ผ่าน validation ไม่แสดงปุ่ม LINE ที่ใช้ไม่ได้ และให้เข้าสู่เว็บพร้อมคำแนะนำเชื่อมภายหลัง
- Chrome/Safari, LINE in-app browser และ LIFF browser อาจใช้ cookie storage คนละชุด ผู้ใช้จึงอาจต้อง login DEMI ใหม่ ไม่มี cookie/session/token/password handoff (UX-C)
- Login แสดงคำอธิบายเฉพาะ `returnTo` ที่ผ่าน allowlist และเท่ากับ `/line/account` การยืนยันบัญชีและรหัสผ่านบนหน้าเชื่อมยังจำเป็น
- ใช้การ init, `isInClient()`, `isLoggedIn()` และ `liff.login()` เดิม ไม่รับประกันว่า LIFF URL จะเปิดแอป LINE ทุกอุปกรณ์ หากไม่มี LINE ให้ใช้เว็บ หรือเปิดแชต OA และเมนูบัญชีด้วยตนเอง
- ปุ่มกลับ LINE ใช้ `closeWindow()` เฉพาะใน LIFF client; external browser มีคำแนะนำและลิงก์เว็บ ปุ่มเพิ่มเพื่อนใช้กลไกเดิมเฉพาะ LIFF Full ที่รองรับ

อ้างอิง LINE: [execution environments](https://developers.line.biz/en/tips/2026/08/06/between-liff-browser-and-external-browser/), [LIFF development/login](https://developers.line.biz/en/docs/liff/developing-liff-apps/), [friendship prompt](https://developers.line.biz/en/tips/2026/05/21/line-request-friendship/), [opening LIFF](https://developers.line.biz/en/docs/liff/opening-liff-app/)

## สถานะ LINE และการแจ้งเตือน

ใช้ account summary, LIFF state และ lifecycle readiness เดิม ไม่มี onboarding state machine หรือ persistence ใหม่

| สถานะจริง | คำแนะนำ/การทำต่อ |
| --- | --- |
| ไม่มี DEMI session | เหตุผลที่ต้อง login + ปุ่มกลับ `/line/account` หลัง login |
| LINE ต้อง login | อธิบายว่าต้องระบุ LINE ที่จะผูก ไม่ใช่การผูกอัตโนมัติ |
| ยังไม่เชื่อม | สร้าง intent เดิมหลังผู้ใช้กด แล้วแสดง confirmation และรหัสผ่านปัจจุบัน; มีทางสลับบัญชี DEMI |
| เชื่อมแล้ว | แสดงว่าเชื่อมแล้ว ไม่ขอสร้าง binding ซ้ำ |
| NOT_FRIEND | แจ้งว่าต้องเพิ่ม DEMI เป็นเพื่อน; เพิ่มเพื่อนใน LIFF ที่รองรับ หรือทำจากแชตแล้วตรวจอีกครั้ง |
| UNKNOWN/null friendship | บอกว่ายังตรวจสถานะเพื่อนและเมนู ไม่กล่าวว่าพร้อม; ตรวจอีกครั้งเมื่อมี LINE proof |
| FRIEND แต่เมนูไม่ APPLIED | บอกว่ากำลังเตรียมเมนู มีปุ่มตรวจสถานะเมนูอีกครั้ง |
| FRIEND + APPLIED + LINKED | “พร้อมใช้งานผ่าน LINE แล้ว”; เมนูขึ้นกับบทบาท/สิทธิ์ปัจจุบัน |
| Provider/config/error | คำอธิบายที่ไม่เผยข้อมูลส่วนตัว ทาง retry เดิม และเว็บ fallback |

ปุ่มตรวจเมนูโหลด account page ใหม่ ซึ่งอ่านสถานะและใช้ reconciliation scheduler เดิมหลัง response; ไม่ polling ไม่เพิ่ม loop หรือเรียก provider ใหม่โดยตรงจาก UI การตรวจครั้งถัดไปอาจยังเห็นสถานะเดิมเพราะงานทำแบบ asynchronous การเชื่อมและ Rich Menu readiness เป็นคนละผลลัพธ์ ไม่มีการเปลี่ยน retry/lease/idempotency ของ service

หัวข้อ “รับแจ้งเตือนนัดหมายผ่าน LINE” ยังคงใช้ preference service เดิม แสดงเฉพาะเมื่อ service ให้ eligible view (รวม workforce ที่มีสิทธิ์ตาม domain เดิม ไม่ใช่ Patient-only) ค่าเริ่มต้นปิด เว้นแต่ persisted preference สำหรับ binding lifecycle ปัจจุบันเปิดอยู่ ผู้ใช้ต้องกดเปิดและรอผลบันทึกสำเร็จ ไม่มี opt-in จาก activation หรือ link CTA การตรวจนัดแบบ reactive แยกจากข้อความ proactive และไม่รับประกัน delivery

## Manual UAT — ต้องทดสอบกับอุปกรณ์จริง

ใช้บัญชีสังเคราะห์และ provider/database ทดสอบเท่านั้น ไม่บันทึก screenshot/log ที่มี credentials หรือข้อมูลสุขภาพ เก็บผลว่า pass/fail พร้อมรุ่นอุปกรณ์และเบราว์เซอร์ โดยไม่แนบ invitation URL

| Scenario / ขั้นตอน | ผลที่คาดหวัง |
| --- | --- |
| Android Chrome: เปิด invitation ตั้งรหัสผ่าน | เห็น success, LINE CTA และเว็บ fallback; ไม่มี auto redirect |
| iPhone Safari: ทำแบบเดียวกัน | ข้อความ/ปุ่มอ่านได้ ไม่มี overflow และเลือกเว็บได้ |
| เปิด activation ภายใน LINE | ล้าง fragment ตามเดิม ต้องกด CTA เอง; ไม่ auto-link |
| LINE browser ไม่มี DEMI session | อธิบาย login; login แล้วกลับ `/line/account`; ยืนยัน password ก่อนผูก |
| มี DEMI session แล้ว | เห็นขั้นตอน LINE login หรือ confirmation ตามสภาพจริง |
| DEMI เป็นบัญชีที่ไม่ต้องการผูก | กดกลับ/ใช้บัญชีอื่นแล้ว login ใหม่; ไม่มีการผูกเงียบ |
| LINE ต้อง login / ยกเลิก consent | ไม่มี success หลอก มีทางลองใหม่หรือใช้เว็บ |
| ไม่มี LINE บนเครื่อง / desktop | LIFF ตาม capability จริง มีคำแนะนำ OA และเว็บที่ใช้ต่อได้ |
| LINE ผูกอยู่แล้ว / กดย้ำ | ไม่ขอผูกซ้ำ ไม่เกิด binding ซ้ำ |
| ยังไม่เพิ่ม OA เป็นเพื่อน / เคย block | เห็นเพิ่มเพื่อนเมื่อรองรับ; หากเพิ่มจากแชตให้กลับมาตรวจอีกครั้ง |
| friendship UNKNOWN หรือ provider ล่ม | ไม่รายงานว่าพร้อม มี safe retry/fallback และไม่ polling |
| FRIEND แต่ menu UNKNOWN/MISMATCH/UNAVAILABLE | เห็นกำลังเตรียมเมนู; กดตรวจสถานะใช้ scheduler เดิม |
| FRIEND และ menu APPLIED | เห็นพร้อม; กลับ LINE เฉพาะใน client |
| ผูก LINE แล้วเปิด/ปิด notification | ไม่เปิดให้อัตโนมัติ; เปลี่ยนสถานะหลัง persisted success; refresh แล้วยังคงค่า |
| บัญชีไม่มี notification eligibility | ไม่แสดง preference และ server ปฏิเสธการเปิดนอกสิทธิ์ |
| ข้าม LINE | login เว็บและเข้าเฉพาะ workspace ที่มีสิทธิ์ได้ |
| RESET | ข้อความเปลี่ยนรหัสผ่าน ไม่มี onboarding, binding และ preference เดิมไม่ถูกแก้ |
| Patient / OSM / MEMBER / OWNER / Child OWNER | success เหมือนกันสำหรับ first activation; role/menu มาจาก persisted eligibility |
| หลายบทบาท | เมนูตามสิทธิ์จริง/การเลือก workspace เดิม ไม่อิง invitation |
| token หมดอายุ/ใช้แล้ว/ผลไม่ยืนยัน | ไม่มี LINE success CTA; ให้ติดต่อโรงพยาบาลหรือ login ตามคำแนะนำเดิม |
| keyboard / screen reader / 320px / zoom 200% | heading, status focus, ลำดับอ่าน, focus ring, touch target และปุ่ม fallback ใช้ได้ |

Automated component/service tests ไม่ยืนยัน app launching, LINE provider state, screen-reader output หรือภาพจริงบนอุปกรณ์ ต้องทำ UAT ข้างต้นก่อนกล่าวอ้างผลเหล่านี้ ไม่มีการ deploy, push, provider configuration หรือ operator menu reconciliation ในงานนี้

## ไฟล์และหลักฐานส่งมอบ

- `src/components/activation/activation-onboarding.tsx`: introduction, progression และ success panel ที่ใช้ร่วมกัน
- `app/activate/{patient,workforce}/page.tsx` และ activation forms: ส่งเฉพาะ LIFF URL สาธารณะจาก server, ย่อส่วนหัวมือถือ, แสดง heading ตามสถานะและแยก RESET
- `app/login/page.tsx`: คำอธิบาย login-to-LINE หลังตรวจ allowlist
- `app/line/account/line-account-client.tsx`: progression และคำแนะนำตามสถานะจริง, menu refresh, external/web fallback, focus ผลสำเร็จ/ผิดพลาด
- `app/line/account/appointment-notification-preference.tsx`: ทำหัวข้อ opt-in ให้ค้นพบง่ายขึ้น โดยไม่เปลี่ยน service หรือ consent semantics
- `src/modules/line/services/line-deep-link-builder.ts`: nullable public helper บน builder เดิม ไม่สร้าง URL ซ้ำ
- Tests เพิ่ม/ปรับใน activation interactions/pages, LINE screen/preference, login page และ deep-link builder; บันทึกบริบทใน `docs/CONTEXT.md` และ LINE production runbook

ผลตรวจจริง ณ วันที่ข้างต้น:

| คำสั่ง/ขอบเขต | ผล |
| --- | --- |
| `npm run test -- app/activate/activation-interactions.test.tsx app/activate/activation-pages.test.tsx app/activate/workforce/workforce-activation-form.test.tsx app/line/account app/login/login-page.test.tsx src/modules/line/services/line-deep-link-builder.test.ts` | 14 files / 149 tests ผ่าน |
| `npm run test --` พร้อม path ของ patient-activation, workforce server actions/reset/recovery policies, Child service-area operation, LINE services/domain/presentation/transport, auth login schema/return/quick-action flow และ appointment notification preference service/actions | 44 files / 625 tests ผ่าน (deep-link suite ซ้ำกับชุด UI) |
| `npm run test:db:status` | local disposable PostgreSQL healthy |
| `npm run test:integration:focused -- tests/integration/line-account-linking.integration.test.ts` | 1 file / 27 tests ผ่าน; ไม่มี pending migration |
| `node --env-file=.env.integration node_modules/vitest/vitest.mjs run --config vitest.integration.config.mts tests/integration/patient-activation.integration.test.ts tests/integration/workforce.integration.test.ts tests/integration/line-authorization-lifecycle.integration.test.ts tests/integration/line-disconnection-orchestration.integration.test.ts` | 4 files / 111 tests ผ่าน |
| `node --env-file=.env.integration node_modules/vitest/vitest.mjs run --config vitest.integration.config.mts tests/integration/parent-led-child-onboarding.integration.test.ts tests/integration/appointments.integration.test.ts` | 2 files / 54 tests ผ่าน |
| `npm run typecheck` | ผ่าน |
| `npm run lint -- --max-warnings=0` | ไม่ผ่าน warning threshold: 0 errors, 5 warnings เดิมเรื่อง `<img>` ใน Hospital knowledge/content (4 ไฟล์ที่ไม่เปลี่ยนจาก HEAD) |
| ESLint `--max-warnings=0` เฉพาะ `.ts`/`.tsx` ที่แก้และเพิ่ม | ผ่าน ไม่มี warning |
| `git diff --check` และตรวจ UTF-8/line endings | ผ่าน; ไฟล์เดิมคง CRLF ไม่มี replacement character |

Integration ใช้ฐานทดสอบ local และ provider doubles เท่านั้น ไม่ได้แก้บัญชีหรือ provider จริง ไม่มี script `lint:strict` หรือ `architecture:check` ใน `package.json` ปัจจุบัน จึงใช้ ESLint threshold ข้างต้นและทบทวน dependency boundary โดยตรง ไม่รัน full repository suite, production build หรือ development server เพราะไม่มีการเปลี่ยน auth/domain implementation, schema, bundler หรือ runtime configuration ที่ต้องอาศัยการตรวจเหล่านั้น
