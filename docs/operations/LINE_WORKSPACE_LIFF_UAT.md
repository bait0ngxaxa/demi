# LINE_WORKSPACE_LIFF_UAT — ตรวจ Workspace LIFF บนอุปกรณ์จริง

สถานะ: **NOT EXECUTED** — ยังไม่มีหลักฐานจากอุปกรณ์จริง ห้ามรายงานว่าผ่านจนกว่าจะกรอกผลด้านล่างครบ
อ้างอิง: [ADR-0031](../adr/0031-workspace-liff-for-operational-line-entries.md), [LINE_PRODUCTION_SETUP §3.1 และ §6.6](./LINE_PRODUCTION_SETUP.md)

## เกณฑ์ผ่านหลัก

ทุก workflow ที่เปิดผ่าน Workspace LIFF ต้อง**ไม่มี footer ของ in-app browser ปกติของ LINE** (แถบล่างที่มีปุ่มย้อนกลับ/ไปข้างหน้า/แชร์/เปิดในเบราว์เซอร์)

ไม่ใช่ footer ที่ต้องตรวจ:

- Bottom Navigation ของ DEMI เอง (แท็บล่างของแอป) — ต้องยังอยู่ตามปกติ
- header ของ LIFF browser (ชื่อแอป, ปุ่มปิด, เมนู ⋯ ด้านบน) — เป็นของ LINE และควรมี

CSS ซ่อน footer ไม่ได้ footer ขึ้นกับว่า LINE เปิด URL เป็น LIFF หรือเป็นเว็บธรรมดา

## เตรียมก่อนทดสอบ

- [ ] release ที่มี ADR-0031 build ด้วย `NEXT_PUBLIC_DEMI_LINE_WORKSPACE_LIFF_ID` จริงและ deploy แล้ว
- [ ] Workspace LIFF ตั้งค่าตาม LINE_PRODUCTION_SETUP §3.1 (Full, Endpoint `<ORIGIN>/`, `openid profile`)
- [ ] `npm run line:rich-menu:uris` แสดง Workspace LIFF สำหรับปุ่มงานทุกปุ่ม (ก่อน apply Rich Menu ใช้ลิงก์ทดสอบด้านล่างแทน)
- [ ] บัญชีทดสอบ: Patient, OSM, Hospital staff (MEMBER), ผู้ใช้หลายบทบาท (Patient+OSM), บัญชีที่ยังไม่เชื่อม LINE
- [ ] อุปกรณ์: Android + LINE ล่าสุด, iOS + LINE ล่าสุด, Chrome (Android/desktop), Safari (iOS)

ทดสอบก่อนเปลี่ยน Rich Menu: ส่งลิงก์ต่อไปนี้ให้ตัวเองในแชต LINE (เช่น Keep memo) แล้วแตะ — ลิงก์ `liff.line.me` จะเปิดใน LIFF browser

```text
https://liff.line.me/<WORKSPACE_LIFF_ID>/app
https://liff.line.me/<WORKSPACE_LIFF_ID>/app/personal
https://liff.line.me/<WORKSPACE_LIFF_ID>/app/personal/wellness
https://liff.line.me/<WORKSPACE_LIFF_ID>/app/patients/assigned?task=screening
https://liff.line.me/<WORKSPACE_LIFF_ID>
```

## ตารางทดสอบ (ทำทั้ง Android และ iOS)

บันทึก: วันที่, อุปกรณ์/OS, เวอร์ชัน LINE, ผล (ผ่าน/ไม่ผ่าน), ภาพหน้าจอ

| # | กรณี | ขั้นตอน | ผลที่คาดไว้ | Android | iOS |
| --- | --- | --- | --- | --- | --- |
| 1 | Patient → บันทึกสุขภาพ | แตะปุ่มใน Rich Menu | เปิด `/app/personal/wellness` ใน LIFF ไม่มี footer | | |
| 2 | Patient → ยาของฉัน | Rich Menu | `/app/personal/medications` ใน LIFF | | |
| 3 | Patient → นัดหมายทั้งหมด | Rich Menu | `/app/personal/appointments` ใน LIFF | | |
| 4 | Patient → ข้อมูลการดูแล / เพิ่มเติม | Rich Menu | `/app/personal/care`, `/app/personal` ใน LIFF | | |
| 5 | OSM → ผู้ป่วยที่ดูแล | Rich Menu | `/app/patients/assigned` เฉพาะผู้ป่วยที่ได้รับมอบหมาย | | |
| 6 | OSM → คัดกรอง / บันทึกติดตาม | Rich Menu | `?task=screening` และ `/app/services` ตาม scope เดิม | | |
| 7 | Hospital → งานทั้งหมด | Rich Menu | `/app` งานโรงพยาบาลใน LIFF | | |
| 8 | Quick Reply | พิมพ์ข้อความอื่นให้ได้ HELP แล้วแตะปุ่มงาน | เปิดใน LIFF เหมือน Rich Menu | | |
| 9 | ผู้ใช้หลายบทบาท | สลับพื้นที่ด้วยปุ่มสลับ แล้วแตะปุ่มงาน | richmenuswitch ทำงานเดิม ปลายทางเปิดใน LIFF | | |
| 10 | จัดการบัญชี | Rich Menu “จัดการบัญชี” | เปิด Account LIFF `/line/account` เหมือนเดิม | | |
| 11 | MINI นัดหมาย (ถ้าเปิดใช้) | ลิงก์ MINI เดิม | เปิด MINI App เดิม ไม่ใช่ Workspace | | |
| 12 | ยังไม่ login DEMI | ออกจากระบบใน LIFF แล้วแตะ “ยาของฉัน” | หน้า login DEMI ปกติ → login → กลับ `/app/personal/medications` ใน LIFF (แม้ URL จะมี `liff.hback` หรือ `lineAppVersion`) | | |
| 13 | session หมดอายุ | เปิดหน้า LIFF ค้างไว้จน session หมด แล้วกดเมนูในแอป | ไปหน้า login ปกติ ไม่มี loop | | |
| 14 | เปิดใน Chrome/Safari | เปิด `<ORIGIN>/` และ `<ORIGIN>/app` ตรง ๆ | ไป `/app` หรือ `/login` ทันที ไม่โหลด LIFF | | |
| 15 | ลิงก์ LIFF ใน Chrome/Safari | เปิดลิงก์ทดสอบข้อ “เตรียม” ในเบราว์เซอร์นอก LINE | ไปหน้าเป้าหมาย/หน้า login DEMI ไม่บังคับ login LINE | | |
| 16 | ทรัพยากรที่ไม่มีสิทธิ์ | ใน LIFF เปิดผู้ป่วยที่ไม่ได้รับมอบหมายด้วย URL ภายใน | server ปฏิเสธเหมือนบนเว็บ | | |
| 17 | ลิงก์เว็บเก่าจากแชต | แตะลิงก์ `<ORIGIN>/app/...` ที่ส่งไว้ก่อน rollout | เปิดใน in-app browser ปกติ (มี footer) — เป็นพฤติกรรมที่คาดไว้ ไม่ใช่ LIFF | | |
| 18 | ลิงก์ LIFF ที่ไม่อนุญาต | `https://liff.line.me/<WORKSPACE_LIFF_ID>/line/account` | หน้า “ลิงก์นี้ไม่ถูกต้อง” พร้อมปุ่มไปที่ DEMI | | |
| 19 | bare LIFF URL | `https://liff.line.me/<WORKSPACE_LIFF_ID>` | ไป `/app` หรือ `/login` ใน LIFF; URL bar/แชร์ลิงก์ต้องไม่มี `access_token` | | |
| 20 | นำทางภายในหลัง login | ใช้แท็บล่าง, เมนูเพิ่มเติม, ส่งฟอร์ม, สลับ workspace | ยังอยู่ใน LIFF ไม่มี footer | | |
| 21 | ย้อนกลับ / รีเฟรช | กด back ของ LIFF และ reload จากเมนู ⋯ | ไม่วนกลับไปหน้า “กำลังเปิด DEMI ผ่าน LINE” ไม่มี loop | | |
| 22 | ข้าม LIFF ไป Account | จาก Workspace เปิด ตั้งค่า → บัญชี LINE → “จัดการการเชื่อมต่อ LINE” | เปิดผ่าน Account LIFF URL (LIFF-to-LIFF) หน้า `/line/account` โหลดสถานะได้ ไม่มี footer; ปุ่มย้อนกลับของ LIFF กลับมาหน้า Workspace เดิม | | |
| 23 | เอกสาร `_blank` | เปิดเอกสารกฎหมาย/รูปหลักฐาน แล้วกลับ | กลับมาที่งานเดิมได้ | | |
| 24 | LIFF ไม่ได้ตั้งค่า (staging เท่านั้น) | build โดยไม่ใส่ Workspace ID แล้วเปิดลิงก์ LIFF | หน้า “ยังเปิด DEMI ผ่าน LINE ไม่ได้” ไม่ใช้ LIFF ID อื่น | | |
| 25 | พารามิเตอร์ของ Android | Android: แตะลิงก์ทดสอบทุกลิงก์ | ไม่เจอหน้า “ลิงก์นี้ไม่ถูกต้อง” แม้ LINE จะเติม `lineAppVersion` | | — |
| 26 | init ทุกหน้า | ใน `/app` reload จากเมนู ⋯ แล้วเปิดหน้าอื่นด้วยลิงก์เต็มหน้า | ยังอยู่ใน LIFF ไม่มี loop; (ถ้าใช้ LIFF Inspector) `liff.id` คือ Workspace LIFF ID | | |
| 27 | กลับจาก Account LIFF | จากข้อ 22 กดย้อนกลับ แล้วแตะเมนูงาน | หน้า Workspace ทำงานต่อได้ ไม่วนไปหน้า “กำลังเปิด DEMI ผ่าน LINE” | | |
| 28 | MINI ออกไป `/app` (ถ้าเปิดใช้) | ใน MINI แตะ “ออกจากหน้านัดหมายใน LINE ไปยัง DEMI” แล้วเปิด บัญชี LINE | ลิงก์ยังเป็น `/line/account` แบบเดิม ไม่ init Workspace LIFF ใน MINI | | |
| 29 | storage ข้าม LIFF | หลังข้อ 22 และ 27 ใช้ LIFF Inspector ดู `sessionStorage["demi.line.liff.context"]` | บนหน้า Account เป็น `current: ACCOUNT` กลับมาหน้า Workspace แล้วเป็น `current: WORKSPACE, workspace: READY` หากค่าหายหลังข้ามแอป ให้บันทึกไว้ (ลิงก์จะกลับไปใช้เส้นทางเว็บเดิม) | | |
| 30 | Account → Workspace | เปิด “จัดการบัญชี” จาก Rich Menu แล้วแตะ “ใช้งาน DEMI ผ่านเว็บ” และแยกทดสอบโลโก้ “DEMI” ด้านบน | ทั้งสองเปิด Workspace LIFF (`liff.line.me/<WORKSPACE_LIFF_ID>/app`) ไป `/app` ไม่มี footer; ใน Chrome/Safari ปุ่มไป `/app` และโลโก้ไป `/` แบบเดิม | | |
| 31 | ยังไม่ login แล้วแตะปุ่มงาน | ออกจากระบบ DEMI แล้วแตะ “ยาของฉัน”, “บันทึกสุขภาพ”, “คัดกรอง” และ “งานทั้งหมด” (ถ้าใช้ LIFF Inspector ให้ดูลำดับ `liff.init()` กับการเปลี่ยนไป `/login` และจำนวนครั้งที่เข้า LINE Login) | ไปหน้า login ใน LIFF → login → กลับหน้าเดิม (งานทั้งหมดกลับ `/app`) ไม่มี footer ไม่มี loop ไม่เข้า LINE Login ซ้ำ หากพบ ให้บันทึกตาม ADR-0031 “Known race” | | |
| 32 | init ไม่สำเร็จ | (staging) ทำให้ LINE ตอบช้า/ปิดเน็ตชั่วคราวระหว่างเปิดหน้า `/app` | เห็นข้อความ “เชื่อมต่อกับ LINE ไม่สำเร็จ” พร้อมปุ่ม “ลองเชื่อมต่ออีกครั้ง” DEMI ยังใช้งานได้ ไม่ลองซ้ำเอง | | |
| 33 | MINI → บัญชี → DEMI (ถ้าเปิดใช้) | ใน MINI เปิดบัญชี LINE แล้วแตะ “ใช้งาน DEMI ผ่านเว็บ” | ยังเป็น `/app` แบบเดิม ไม่เปิด Workspace LIFF จาก MINI | | |
| 34 | MINI แล้วเปิด Workspace | หลังใช้ MINI แตะปุ่มงานจาก Rich Menu (และลองเปิดลิงก์ Workspace LIFF จากในแชตเดียวกัน) | Workspace LIFF เปิดและ init ตามปกติ ลิงก์บัญชีเป็น Account LIFF; MINI ยังทำงานเดิมเมื่อกลับไปเปิด | | |

ผลจาก unit test ที่ mock SDK (เช่น `app/workspace-liff-bootstrap.test.tsx`) และ `npm run test:workspace-liff:next-smoke` (Next.js จริงแต่ไม่มี LINE) ไม่ใช่หลักฐานจากอุปกรณ์จริง และใช้แทนตารางนี้ไม่ได้

หลักฐานวินิจฉัยเพิ่มเติม (ไม่บังคับ): ใช้ [LIFF Inspector](https://github.com/line/liff-inspector) บน build ทดสอบ แล้วเรียก `liff.isInClient()` หลัง `liff.init()` — `true` = LIFF browser; `liff.isInClient()` ไม่ใช่การยืนยันตัวตนหรือสิทธิ์

## ผลลัพธ์

| อุปกรณ์ | LINE version | ผู้ทดสอบ | วันที่ | ผลรวม | หมายเหตุ |
| --- | --- | --- | --- | --- | --- |
| Android | | | | NOT EXECUTED | |
| iOS | | | | NOT EXECUTED | |
| Chrome | — | | | NOT EXECUTED | |
| Safari | — | | | NOT EXECUTED | |
