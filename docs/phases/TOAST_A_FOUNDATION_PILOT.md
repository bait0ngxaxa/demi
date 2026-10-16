# DEMI Phase A — Toast Foundation and Pilot

## 1. Library

ใช้ Sonner `2.0.8` เป็น transient notification สำหรับ React โดยไม่มี state framework หรือ dependency ด้าน toast เพิ่มเติม Sonner รองรับ Toaster เดียวที่ root, typed status methods, ปุ่มปิด, visible-toast limit, responsive offsets และ reduced-motion behavior

## 2. Provider และ responsive behavior

`app/layout.tsx` ยังคงเป็น Server Component และ render `<AppToaster />` หนึ่งครั้งภายใน `<body>` ทุก public และ protected route ใช้ root layout ร่วมกัน; `app/app/layout.tsx` ไม่เพิ่ม provider ซ้ำ

`src/components/ui/app-toaster.tsx` เป็น client boundary สำหรับ Sonner เท่านั้น Desktop ใช้ตำแหน่ง Sonner `top-right`; `(max-width: 600px)` ใช้ `useSyncExternalStore` เพื่อเปลี่ยน Toaster instance เดิมเป็นตำแหน่งจริง `bottom-center` โดยมี server/hydration snapshot แบบ desktop แล้วอ่าน `matchMedia` หลัง hydration Sonner จัด responsive width ให้ตาม `mobileOffset`; mobile เว้น horizontal gutter 1rem และ bottom safe area + 5rem สำหรับ mobile navigation

ไม่มีการรับประกัน keyboard avoidance แบบครอบคลุมทุก browser: `keyboard-inset-height` เป็นส่วนหนึ่งของ VirtualKeyboard API ที่รองรับจำกัด และแอปไม่ได้เปิด `navigator.virtualKeyboard.overlaysContent` จึงไม่นำค่านี้มาอ้างเป็น offset ที่เชื่อถือได้

แสดงได้สูงสุด 3 รายการ เปิดปุ่มปิด ตั้ง duration ของ status ใน `notify` และให้ผู้ใช้ปิดเองได้ Sonner รองรับ `prefers-reduced-motion`; focus-visible ใช้ `--focus-ring` ของ DEMI

## 3. Notification contract

เรียก `notify.success(message)`, `notify.error(message)`, `notify.warning(message)` หรือ `notify.info(message)` จาก `src/components/ui/notify.ts` เท่านั้นใน UI code ส่งข้อความสั้นที่กำหนดใน UI และผ่านการตรวจ privacy; ห้ามส่งค่าที่ผู้ใช้กรอก, raw exception, stack trace หรือ server response message ที่ยังไม่ผ่านการตรวจ

| ผลลัพธ์ที่ยืนยันแล้ว | Toast |
| --- | --- |
| SUCCESS | success, 3.5 วินาที |
| Validation | ไม่มี Toast; คงข้อความและ field feedback ในหน้า |
| Conflict / ต้องตรวจข้อมูลล่าสุด | warning, 5 วินาที |
| ความล้มเหลวที่ยืนยันแล้ว | error, 5.5 วินาที |
| UNAVAILABLE / ผล persistence ยังไม่ยืนยัน | ไม่มี Toast; คง UnknownOutcomeAlert และ recovery |
| Info | info, 4 วินาที |
| Unknown / request โยน error | ไม่มี Toast; คง `UnknownOutcomeAlert` และ recovery เดิม |

Toast สรุปผลชั่วคราว ส่วน Alert ยังคงเป็น feedback ถาวรสำหรับรายละเอียด, validation, conflict และ recovery การที่ request จบหรือ promise fulfilled เพียงอย่างเดียวไม่ถือว่า SUCCESS; ส่ง Toast หลังตรวจ `result.status` และ `result.code` เท่านั้น

## 4. Privacy และ accessibility

Toast ใช้ status icon พร้อมสีจาก `--success`, `--warning`, `--danger`, `--info` และพื้นผิว soft ของ DEMI สีไม่ใช่สัญญาณเพียงอย่างเดียว Sonner ประกาศผ่าน `aria-live="polite"` และ `aria-relevant="additions text"`; ปุ่มปิดมี accessible name ภาษาไทยและใช้คีย์บอร์ดได้ ไม่ย้าย focus เมื่อ Toast แสดง

Inline Alert ของ workflow ยังคง role เดิม ดังนั้น screen reader อาจประกาศทั้งสรุปสั้นจาก Toast และรายละเอียดจาก Alert ข้อความ Toast ถูกทำให้สั้นเพื่อไม่อ่านรายละเอียดซ้ำ; Phase ถัดไปควรตรวจพฤติกรรมกับ assistive technology ก่อนเปลี่ยนบทบาทของ Alert

## 5. Pilot workflows

### Support Report

- SUCCESS: Toast “ส่งรายงานแล้ว” พร้อม inline success และ reset รายละเอียดตามพฤติกรรมเดิม
- VALIDATION: แสดง inline เท่านั้น; RATE_LIMIT และ CONFLICT ใช้ warning; FORBIDDEN ใช้ error โดย Alert เดิมยังอยู่
- UNAVAILABLE, IDLE หรือ thrown request: ไม่มี Toast หรือข้อความยืนยันว่าล้มเหลว; คง draft, UnknownOutcomeAlert และ recovery ให้ตรวจสอบกับเจ้าของโรงพยาบาลก่อนส่งใหม่ โดยไม่ retry อัตโนมัติ
- synchronous in-flight guard ป้องกัน double submit; selector ถูกปิดระหว่าง pending/unknown; ผลจาก context ที่ถูกแทนที่หรือหลัง unmount ไม่แก้ form ปัจจุบันหรือสร้าง Toast เก่า และ success จะไม่ล้าง draft ใหม่ที่ผู้ใช้แก้ระหว่างรอ

### Contact Email Settings

- SUCCESS: Toast “บันทึกอีเมลแล้ว”; inline success และการ sync email/version จากผลยืนยันยังคงเดิม
- VALIDATION แสดง inline เท่านั้น; CONFLICT ใช้ warning; FORBIDDEN ใช้ error; UNAVAILABLE และ IDLE ถือว่ายังไม่ยืนยัน ไม่มี Toast และไม่เปลี่ยน email/version
- UNAVAILABLE หรือ thrown request: คง `UnknownOutcomeAlert` พร้อมทางโหลด/ตรวจข้อมูลตั้งค่าปัจจุบัน; ไม่ retry อัตโนมัติ
- LINE notification preferences ไม่ได้ย้ายมาใช้ Toast ใน Phase A

Toast ถูกเรียกจาก event handler หลัง result ที่ยืนยันแล้ว ไม่ได้ยิงจาก effect ของ result state จึงไม่ replay เมื่อ rerender; ref lock จำกัดหนึ่ง mutation ต่อการ submit และการ submit ครั้งใหม่ของผู้ใช้ยังสร้าง Toast ใหม่ได้

## 6. Test evidence

รันคำสั่ง:

```bash
npm run test -- src/components/ui/app-toaster.test.ts src/components/ui/notify.test.ts app/app/support/support-report-form.test.tsx app/app/settings/contact-settings-form.test.tsx
```

ผลหลัง Phase A.1: 4 test files ผ่าน, 27 tests ผ่าน ครอบคลุม root provider/server boundary, responsive position และ media-query transition, stable server snapshot/hydration, listener cleanup, safe-area offsets, token/status API, pilot success/error/validation/unknown, inline feedback, version synchronization, duplicate submit, Hospital context replacement, draft preservation และ unmount

`npm run lint` ผ่านด้วย 0 errors และมี 2 warnings เดิมเกี่ยวกับ `<img>` ใน `hospital-content-image-list.tsx` และ `hospital-content-image-manager.tsx`; `npm run typecheck` ผ่าน Full test suite และ production build ไม่ได้รัน เพราะ Phase A จำกัดที่ provider และสอง client forms

## 7. Handoff สำหรับ Phases B–E

- **Phase B:** สำรวจ workflows และแบ่งผลเป็น confirmed success, validation, conflict, definitive error และ unknown ก่อนเลือก pilot; ระบุ copy ที่ไม่มีข้อมูลผู้ป่วย
- **Phase C:** ย้าย workflows แบบเป็นชุดเล็ก ๆ โดยคง inline Alert ที่ต้องใช้เพื่ออธิบาย field error, conflict หรือ recovery; เพิ่ม focused tests ทุก workflow
- **Phase D:** ตรวจ concurrency, unknown outcomes, retries, user/workspace transitions และ accessibility announcement ก่อนเปลี่ยน interaction ของ mutation ที่มีผลสำคัญ
- **Phase E:** ทบทวนการลด Alert เฉพาะข้อความชั่วคราวที่ไม่มีหน้าที่ด้าน persistence/recovery หลังทดสอบ UX และ screen reader; ไม่ย้ายข้อความทางคลินิกหรือรายละเอียดอ่อนไหวเข้า Toast

Phase A ไม่ migrate Alert ส่วนอื่น ไม่แตะ Server Actions, persistence, schema, permissions, LINE/appointment preferences หรือ backend mutation behavior

## 8. Post-review remediation (Phase A.1)

### A-01 — Responsive position

Root cause: CSS moved a `top-right` Sonner list to the bottom on narrow screens, leaving Sonner's `data-y-position` and `data-x-position` semantics, stack direction, and swipe direction unchanged.

Fix: `AppToaster` now subscribes to `(max-width: 600px)` with `useSyncExternalStore`. Its stable server snapshot is desktop (`top-right`) for both SSR and hydration; the browser snapshot then selects the actual `bottom-center` position on mobile. Sonner 2.0.8 derives position attributes and default swipe directions from its `position` prop ([source](https://github.com/emilkowalski/sonner/blob/v2.0.8/src/index.tsx), [types](https://github.com/emilkowalski/sonner/blob/v2.0.8/src/types.ts)). One Toaster remains at the root. Custom CSS that simulated position and width was removed; Sonner's responsive layout uses the retained 1rem horizontal offsets and safe-area-aware bottom offset (`safe area + 5rem`) for the mobile navigation clearance.

The prior `keyboard-inset-height` offset was removed. That variable belongs to the VirtualKeyboard API, which MDN marks as limited availability; using it for overlays also requires opting into `navigator.virtualKeyboard.overlaysContent`. DEMI does not opt into that API, so this value was not a reliable keyboard-avoidance guarantee ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/VirtualKeyboard_API)). Browser-native viewport resizing and input scrolling remain in effect; universal keyboard avoidance is not claimed.

### A-02 — Support Report context safety

Root cause: a pending request could still update the message, inline feedback, or recovery state after the user changed the selected Hospital, even though its Toast was suppressed.

Fix: the Hospital selector is disabled while the request is pending or its result is unconfirmed, and its handler also rejects changes while the synchronous in-flight guard is held. Each request captures its Hospital ID, category, and message. Results are applied only while the selected Hospital still matches the submitted context; a confirmed result from a context replaced by authoritative Hospital props is discarded without a stale Toast or form reset. An uncertain result in that case retains the Unknown Outcome recovery Alert. Component unmount still suppresses all result updates. Success clears the message only when category and message still match the submitted draft, so edits made during the request survive.

### A-03 — `UNAVAILABLE` outcome semantics

Inspection of the support and contact Server Actions and services found that validation, access rejection, rate limiting, and version conflict have typed rejection paths. Their transaction work occurs before writes or inside a transaction that rejects on those typed conditions. In contrast, `UNAVAILABLE` wraps unexpected infrastructure or transaction/response errors; the current contracts do not prove that the operation rolled back or that its result reached the client. No backend action, transaction, or result schema was changed.

Both pilots now treat returned `UNAVAILABLE` and non-authoritative `IDLE` results as unconfirmed: no success/failure Toast, no false failure copy, and no automatic retry. Support Report preserves its draft and locks resubmission behind the existing recovery Alert, which instructs the user to verify with the Hospital owner before sending again because report creation has no idempotency key. Contact Email preserves the entered value and current version and offers the existing reload path to read current authorized settings; it does not infer which write occurred or resend the mutation. Validation remains inline-only; conflict/rate limit remain warnings; confirmed access denial remains an error.

### Regression tests and verification

Focused tests now cover runtime desktop/mobile position selection, breakpoint changes, one mounted Toaster, listener cleanup, stable server snapshot/hydration, accessibility configuration, Support Report pending context lock, authoritative context replacement, draft preservation, unmount, confirmed/unknown outcomes, and Contact Email confirmed/unknown outcomes and version-safe recovery.

Verified commands:

```bash
npm run test -- src/components/ui/app-toaster.test.ts src/components/ui/notify.test.ts app/app/support/support-report-form.test.tsx app/app/settings/contact-settings-form.test.tsx
npm run lint
npm run typecheck
```

Results: 4 focused test files passed (27 tests); typecheck passed; lint passed with 0 errors and 2 existing `<img>` optimization warnings in the Hospital content image components. The Impeccable detector returned no findings. Responsive behavior was tested in jsdom, but no real-browser visual/mobile test was run.

### Remaining limitations

- Keyboard avoidance varies by browser; the app does not enable the limited VirtualKeyboard overlay API. Safe-area spacing and the mobile-navigation offset are applied.
- Support Report is not idempotent. After an unconfirmed outcome, users must verify with the Hospital owner before creating another report.
- Phases B–E and other notification workflows remain out of scope.
