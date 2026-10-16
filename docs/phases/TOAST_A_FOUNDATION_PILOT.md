# DEMI Phase A — Toast Foundation and Pilot

## 1. Library

ใช้ Sonner `2.0.8` เป็น transient notification สำหรับ React โดยไม่มี state framework หรือ dependency ด้าน toast เพิ่มเติม Sonner รองรับ Toaster เดียวที่ root, typed status methods, ปุ่มปิด, visible-toast limit, responsive offsets และ reduced-motion behavior

## 2. Provider และ responsive behavior

`app/layout.tsx` ยังคงเป็น Server Component และ render `<AppToaster />` หนึ่งครั้งภายใน `<body>` ทุก public และ protected route ใช้ root layout ร่วมกัน; `app/app/layout.tsx` ไม่เพิ่ม provider ซ้ำ

`src/components/ui/app-toaster.tsx` เป็น client boundary สำหรับ Sonner เท่านั้น Desktop ใช้ top-right โดยเว้นระยะจาก app header ส่วน viewport กว้างไม่เกิน 600px ใช้ CSS จัด Toaster instance เดิมให้อยู่ bottom-center พร้อม horizontal gutter, safe-area inset และ `keyboard-inset-height` fallback ใช้ได้โดยไม่อ่าน browser API ระหว่าง server render

แสดงได้สูงสุด 3 รายการ เปิดปุ่มปิด ตั้ง duration ของ status ใน `notify` และให้ผู้ใช้ปิดเองได้ Sonner รองรับ `prefers-reduced-motion`; focus-visible ใช้ `--focus-ring` ของ DEMI

## 3. Notification contract

เรียก `notify.success(message)`, `notify.error(message)`, `notify.warning(message)` หรือ `notify.info(message)` จาก `src/components/ui/notify.ts` เท่านั้นใน UI code ส่งข้อความสั้นที่กำหนดใน UI และผ่านการตรวจ privacy; ห้ามส่งค่าที่ผู้ใช้กรอก, raw exception, stack trace หรือ server response message ที่ยังไม่ผ่านการตรวจ

| ผลลัพธ์ที่ยืนยันแล้ว | Toast |
| --- | --- |
| SUCCESS | success, 3.5 วินาที |
| Validation | ไม่มี Toast; คงข้อความและ field feedback ในหน้า |
| Conflict / ต้องตรวจข้อมูลล่าสุด | warning, 5 วินาที |
| ความล้มเหลวที่ยืนยันแล้ว | error, 5.5 วินาที |
| Info | info, 4 วินาที |
| Unknown / request โยน error | ไม่มี Toast; คง `UnknownOutcomeAlert` และ recovery เดิม |

Toast สรุปผลชั่วคราว ส่วน Alert ยังคงเป็น feedback ถาวรสำหรับรายละเอียด, validation, conflict และ recovery การที่ request จบหรือ promise fulfilled เพียงอย่างเดียวไม่ถือว่า SUCCESS; ส่ง Toast หลังตรวจ `result.status` และ `result.code` เท่านั้น

## 4. Privacy และ accessibility

Toast ใช้ status icon พร้อมสีจาก `--success`, `--warning`, `--danger`, `--info` และพื้นผิว soft ของ DEMI สีไม่ใช่สัญญาณเพียงอย่างเดียว Sonner ประกาศผ่าน `aria-live="polite"` และ `aria-relevant="additions text"`; ปุ่มปิดมี accessible name ภาษาไทยและใช้คีย์บอร์ดได้ ไม่ย้าย focus เมื่อ Toast แสดง

Inline Alert ของ workflow ยังคง role เดิม ดังนั้น screen reader อาจประกาศทั้งสรุปสั้นจาก Toast และรายละเอียดจาก Alert ข้อความ Toast ถูกทำให้สั้นเพื่อไม่อ่านรายละเอียดซ้ำ; Phase ถัดไปควรตรวจพฤติกรรมกับ assistive technology ก่อนเปลี่ยนบทบาทของ Alert

## 5. Pilot workflows

### Support Report

- SUCCESS: Toast “ส่งรายงานแล้ว” พร้อม inline success และ reset รายละเอียดตามพฤติกรรมเดิม
- VALIDATION: แสดง inline เท่านั้น; RATE_LIMIT และ CONFLICT ใช้ warning; FORBIDDEN และ UNAVAILABLE ใช้ error โดย Alert เดิมยังอยู่
- thrown request: ไม่มี Toast, ไม่ส่งซ้ำอัตโนมัติ, คง recovery note และปิด submit ตามเดิม
- synchronous in-flight guard ป้องกัน double submit; ผลที่มาถึงหลัง unmount หรือหลังเปลี่ยนโรงพยาบาลจะไม่สร้าง Toast เก่า

### Contact Email Settings

- SUCCESS: Toast “บันทึกอีเมลแล้ว”; inline success และการ sync email/version จากผลยืนยันยังคงเดิม
- VALIDATION แสดง inline เท่านั้น; CONFLICT ใช้ warning; FORBIDDEN และ UNAVAILABLE ใช้ error; ค่า email และ version ไม่เปลี่ยนจากผล error
- thrown request: ไม่มี Toast และไม่เปลี่ยน email/version; คง `UnknownOutcomeAlert` และไม่ retry อัตโนมัติ
- LINE notification preferences ไม่ได้ย้ายมาใช้ Toast ใน Phase A

Toast ถูกเรียกจาก event handler หลัง result ที่ยืนยันแล้ว ไม่ได้ยิงจาก effect ของ result state จึงไม่ replay เมื่อ rerender; ref lock จำกัดหนึ่ง mutation ต่อการ submit และการ submit ครั้งใหม่ของผู้ใช้ยังสร้าง Toast ใหม่ได้

## 6. Test evidence

รันคำสั่ง:

```bash
npm run test -- src/components/ui/app-toaster.test.ts src/components/ui/notify.test.ts app/app/support/support-report-form.test.tsx app/app/settings/contact-settings-form.test.tsx
```

ผล: 4 test files ผ่าน, 22 tests ผ่าน ครอบคลุม root provider/server boundary, responsive offsets, token/status API, pilot success/error/validation/unknown, inline feedback, version synchronization, duplicate submit, rerender, hospital-context change และ page unmount

`npm run lint` ผ่านด้วย 0 errors และมี 2 warnings เดิมเกี่ยวกับ `<img>` ใน `hospital-content-image-list.tsx` และ `hospital-content-image-manager.tsx`; `npm run typecheck` ผ่าน Full test suite และ production build ไม่ได้รัน เพราะ Phase A จำกัดที่ provider และสอง client forms

## 7. Handoff สำหรับ Phases B–E

- **Phase B:** สำรวจ workflows และแบ่งผลเป็น confirmed success, validation, conflict, definitive error และ unknown ก่อนเลือก pilot; ระบุ copy ที่ไม่มีข้อมูลผู้ป่วย
- **Phase C:** ย้าย workflows แบบเป็นชุดเล็ก ๆ โดยคง inline Alert ที่ต้องใช้เพื่ออธิบาย field error, conflict หรือ recovery; เพิ่ม focused tests ทุก workflow
- **Phase D:** ตรวจ concurrency, unknown outcomes, retries, user/workspace transitions และ accessibility announcement ก่อนเปลี่ยน interaction ของ mutation ที่มีผลสำคัญ
- **Phase E:** ทบทวนการลด Alert เฉพาะข้อความชั่วคราวที่ไม่มีหน้าที่ด้าน persistence/recovery หลังทดสอบ UX และ screen reader; ไม่ย้ายข้อความทางคลินิกหรือรายละเอียดอ่อนไหวเข้า Toast

Phase A ไม่ migrate Alert ส่วนอื่น ไม่แตะ Server Actions, persistence, schema, permissions, LINE/appointment preferences หรือ backend mutation behavior
