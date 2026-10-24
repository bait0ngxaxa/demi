# LINE Rich Menu: การ์ดสี่เหลี่ยมจัตุรัสมุมโค้ง

ปรับภาพ Rich Menu ครบ 18 แบบให้เป็นการ์ดสี่เหลี่ยมจัตุรัสมุมโค้ง พร้อมไอคอนและหัวเมนูที่กระชับ บนผืนภาพเดิม 2500 × 1686 พิกเซล ขอบเขตงานนี้คือภาพและตำแหน่งพื้นที่กดของ LINE Rich Menu

## ภาพก่อนและหลัง

ภาพรวมแต่ละไฟล์แสดงครบ 18 เมนู ความกว้างระบุขนาดภาพเมนูที่จำลองบนมือถือ ภาพก่อนปรับมาจาก commit `a3e70dee82ac80e84df64d7c28030333637b9d98`

| ความกว้าง | ก่อนปรับ | หลังปรับ |
| --- | --- | --- |
| 360 px | [ภาพก่อน](rounded-square-before/rich-menu-contact-360.png) | [ภาพหลัง](rich-menu-previews/rich-menu-contact-360.png) |
| 390 px | [ภาพก่อน](rounded-square-before/rich-menu-contact-390.png) | [ภาพหลัง](rich-menu-previews/rich-menu-contact-390.png) |
| 430 px | [ภาพก่อน](rounded-square-before/rich-menu-contact-430.png) | [ภาพหลัง](rich-menu-previews/rich-menu-contact-430.png) |

ใช้ key บนภาพเพื่อตรวจตามกลุ่ม: `PATIENT_DIRECT` และ `PATIENT_*` สำหรับผู้ป่วย, `OSM_DIRECT` และ `OSM_*` สำหรับ อสม., `HOSPITAL_DIRECT` และ `HOSPITAL_*` สำหรับโรงพยาบาล, `CHOOSER_*` สำหรับเลือกบทบาท รวมถึง `UNLINKED` สำหรับเชื่อมบัญชีและ `LINKED_INELIGIBLE` สำหรับบัญชีที่ยังไม่มีเมนูให้ใช้งาน รุ่นหลายบทบาทใช้ suffix `PATIENT_OSM`, `PATIENT_HOSPITAL`, `OSM_HOSPITAL` หรือ `PATIENT_OSM_HOSPITAL` ตามชุดบทบาทที่มี

## การตัดสินใจด้านภาพและการทำงาน

ยึดอัตลักษณ์ “Quiet Clinical Access” จาก [DESIGN.md](../../DESIGN.md) และบริบทผู้ใช้ภาษาไทยจาก [PRODUCT.md](../../PRODUCT.md) โดยคง palette เดิมของ renderer ทุกค่า: พื้น `#F3F7F5`, ข้อความ `#102620`, เขียวเข้ม `#0E3C35`, เส้นขอบ `#AEBFBA`, พื้นการ์ด `#FFFFFF` และเขียวอ่อน `#DCEEE9` ค่าเหล่านี้ตรงกับ token `canvas`, `ink`, `brand-deep`, `line-strong`, `surface` และ `brand-soft` ของระบบเดิม ฟอนต์ยังเป็น Noto Sans Thai ที่ตรึงไฟล์ไว้ใน repository จึงต่อยอดสี ตัวอักษร และพื้นผิวเรียบของผลิตภัณฑ์เดิม โดยไม่ได้เปลี่ยน DESIGN.md หรือไฟล์ `.impeccable`

| จำนวน action | การจัดวาง |
| --- | --- |
| 1–3 | จำนวนคอลัมน์เท่ากับ action, หนึ่งแถว |
| 4 | 2 × 2 |
| 5–6 | 3 × 2 |
| 7–8 | 4 × 2 |
| 9 | 3 × 3 |

ทุกการ์ดกว้างเท่ากับสูง แถวที่ไม่เต็มจัดกึ่งกลาง ขนาดเล็กสุด 467 px บนภาพต้นฉบับ หรือประมาณ 67 px เมื่อแสดงกว้าง 360 px ตัวอักษร action ใช้ 104, 112 หรือ 144 px ตามขนาดการ์ด หัวเมนูใช้พื้นที่กระชับเพื่อเหลือพื้นที่ให้การ์ด อ่านข้อความไทยด้วย Sharp/Pango/HarfBuzz และวัดก่อนวาง หากข้อความล้นจะหยุดสร้างภาพด้วย error โดยไม่ย่อฟอนต์หรือตัดข้อความ

ไอคอนเลือกตาม intent ของ action และบทบาทใน chooser ส่วนปุ่มสลับพื้นที่ใช้ `arrow-left-right` ไฟล์ Lucide SVG ถูกตรึงไว้ใน repository และมี [ที่มา](../../scripts/icons/line-rich-menu/SOURCE.md) กับ [ใบอนุญาต](../../scripts/icons/line-rich-menu/LICENSE) กำกับ; `pills.svg` เป็นภาพแคปซูลที่วาดสำหรับ DEMI

`getLineMenuAreaBounds` เป็นแหล่งเดียวของขอบเขตการ์ดและพื้นที่กดแบบสี่เหลี่ยมของ LINE มุมโค้งเป็นรูปแบบภาพ ส่วน catalog, action, alias, label, ปลายทาง, postback, กฎธุรกิจ, authorization, การเชื่อมบัญชี และพฤติกรรมหลายบทบาทคงเดิม

## ไฟล์และการสร้างซ้ำ

- [layout.ts](../../src/modules/line/rich-menu/layout.ts): คำนวณกริดและพื้นที่กด
- [line-rich-menu-renderer.ts](../../scripts/line-rich-menu-renderer.ts): รูปการ์ด หัวเมนู และข้อความไทย
- [line-rich-menu-icons.ts](../../scripts/line-rich-menu-icons.ts): เลือกและอ่าน SVG
- [line-rich-menu-asset-manifest.ts](../../scripts/line-rich-menu-asset-manifest.ts): รวมข้อมูลจาก catalog, layout และไอคอน
- [public/line/rich-menus](../../public/line/rich-menus): PNG ที่สร้างใหม่ทั้ง 18 ภาพ

```powershell
npm run line:rich-menu:assets
npm run line:rich-menu:assets -- --check
npm run line:rich-menu:previews
```

## ผลตรวจที่ดำเนินการแล้ว

- สร้าง PNG ครบ 18 ภาพ ขนาดไฟล์ 79,409–190,396 bytes และ `--check` ผ่านครบ 18 ภาพ
- สร้าง preview ครบ 360, 390 และ 430 px; ตรวจภาพทั้ง 18 เมนูที่ทุกความกว้างแล้ว ไม่พบปัญหาสำคัญ ตัวตรวจ Impeccable ให้ผล `[]` และผู้ตรวจรอบสุดท้ายให้ผล `ship`
- Vitest แบบเจาะจงผ่าน 5 ไฟล์ รวม 69 tests: `catalog.test.ts`, `assets.test.ts`, `adapters/line-messaging-client.test.ts`, `services/line-deep-link-builder.test.ts` และ `rich-menu/line-menu-provisioning-service.test.ts` ภายใต้ `src/modules/line`
- `npm run typecheck`, ESLint เฉพาะ TypeScript ที่เปลี่ยน 6 ไฟล์ และ `git diff --check` ผ่าน

ผลนี้ยืนยัน asset และพฤติกรรมที่ครอบคลุมด้วยการตรวจใน repository ยังไม่ได้ทดสอบในแอป LINE จริง ไม่มีการเรียก provider, reconcile, deploy หรือเปลี่ยนฐานข้อมูล ไม่ได้รัน full suite หรือ production build เนื่องจากขอบเขตนี้ตรวจด้วยคำสั่งเฉพาะได้
