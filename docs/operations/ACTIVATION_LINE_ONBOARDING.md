# การเปิดใช้งานบัญชีและเริ่มใช้ LINE (UX-A + UX-B)

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
