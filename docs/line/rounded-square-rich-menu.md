# DEMI LINE Rich Menu: Healthcare Illustration Grid and Utility Footer

Rich Menu ทั้ง 18 variants ใช้ภาพประกอบ editorial ที่สื่อกิจกรรมสุขภาพจริงในพื้นที่หลัก และแยก “จัดการบัญชี” เป็น utility footer ด้านล่าง ขนาด canvas 2500 × 1686 พิกเซล การจัดวางภาพและ LINE tappable areas ใช้ geometry จาก layout definition เดียวกัน

## ภาพตัวอย่างบนมือถือ

แต่ละ contact sheet มี Rich Menu ครบทั้ง 18 variants ที่ขนาดแสดงผลตามชื่อไฟล์

| ความกว้าง | Preview |
| --- | --- |
| 360 px | [rich-menu-contact-360.png](rich-menu-previews/rich-menu-contact-360.png) |
| 390 px | [rich-menu-contact-390.png](rich-menu-previews/rich-menu-contact-390.png) |
| 430 px | [rich-menu-contact-430.png](rich-menu-previews/rich-menu-contact-430.png) |

[ตัวอย่างตัวอักษรไทย](rich-menu-previews/thai-glyph-samples.png) ใช้ตรวจการจัดรูปอักษรจาก Noto Sans Thai ด้วย Pango และ HarfBuzz

## ระบบภาพประกอบและลำดับชั้น

ใช้ภาพประกอบ editorial แบบ cut-paper และ gouache ที่มีมิติอ่อน ๆ รูปทรงอ่านง่าย และใช้ผู้ใหญ่กำลังทำกิจกรรมสุขภาพเป็นจุดเด่น ภาพไม่มีข้อความหรือชื่อเมนูในตัวอักษรไทย renderer เป็นผู้วาง label แยก จึงคงการจัดบรรทัดและการสะกดจาก catalog ได้แน่นอน

การกระทำหลักคงภาพประกอบเดิมครบทุก action: นัดหมายและประวัตินัดหมาย, บันทึกสุขภาพ, ยา, ข้อมูลการดูแล, พื้นที่ทำงานผู้ป่วย, งานชุมชนและคัดกรองของ อสม., การประสานงานโรงพยาบาล และการเชื่อมบัญชี ภาพต้นฉบับอยู่ใน [scripts/illustrations/line-rich-menu](../../scripts/illustrations/line-rich-menu); renderer ใช้ Sharp ครอปฉากและประกอบภาพในเครื่อง โดยไม่ดาวน์โหลดหรือเรียก image-generation service ระหว่างสร้างเมนู

ฉากจัดการบัญชีเดิมยังอยู่ใน identity atlas ที่ใช้ร่วมกับฉากเชื่อมบัญชีและ workspace อื่น แต่ไม่มี illustration mapping หรือถูก render แล้ว จึงไม่ต้องสร้าง artwork ที่ไม่เกี่ยวข้องขึ้นใหม่

เฉพาะ action intent `MANAGE_ACCOUNT` แสดงใน utility footer ด้านล่างเป็นแถบแนวนอนพื้นเขียวเทาหม่น เส้นขอบบาง ไอคอนเฟือง SVG แบบเรขาคณิต และข้อความ “จัดการบัญชี” บรรทัดเดียว ไม่มีภาพประกอบบุคคลใน footer แถบสูง 320 source pixels คิดเป็นประมาณ 46 px ที่ความกว้างแสดง 360 px เว้นระยะจากกริดหลัก 40 source pixels และไม่ใช้เงาหรือ gradient

กรณี `LINKED_INELIGIBLE` ใช้ข้อความสถานะจาก catalog ในแผงข้อมูลแบบไม่โต้ตอบที่พื้นที่หลัก และมี action จัดการบัญชีเพียงรายการเดียวใน footer ส่วน `UNLINKED` คง action เชื่อมบัญชี DEMI เป็นภาพหลักและไม่มี footer ใหม่

สีหลักคงตาม DEMI: brand deep `#0E3C35`, canvas `#F3F7F5`, ink `#102620`, white `#FFFFFF` และ brand soft `#DCEEE9` เพิ่มสีรองอย่างจำกัดเพื่อแยกบริบท: coral อ่อนสำหรับผู้ป่วย, sage/mint สำหรับ อสม., sky blue สำหรับโรงพยาบาล และ warm yellow สำหรับการเชื่อมบัญชี

## Action และตำแหน่งกด

`src/modules/line/rich-menu/catalog.ts` ยังคงเป็น source of truth สำหรับ menu keys, aliases, labels, action ordering และ semantics ส่วน [layout.ts](../../src/modules/line/rich-menu/layout.ts) ใน `getLineMenuLayout()` แบ่ง action areas เป็น primary grid กับ utility footer โดยพิจารณา intent `MANAGE_ACCOUNT` ไม่เทียบ label ฟังก์ชัน `getLineMenuAreaBounds()` เป็น compatibility projection ของ action areas เดียวกันตามลำดับ catalog

Manifest renderer และ LINE payload builder อ่าน layout definition นี้ร่วมกัน จึงไม่มี coordinate calculation แยกระหว่างภาพกับ tappable areas พื้นภาพของ action หลักอยู่ใน bounds ของ action นั้น ส่วน footer มี LINE URI area ของตัวเอง สถานะใน `LINKED_INELIGIBLE` ไม่มี tappable area เพิ่ม

Footer ใช้ bounds `{ x: 80, y: 1366, width: 2340, height: 320 }` บน canvas 2500 × 1686 ส่วนกริดหลักคำนวณจากจำนวน action ที่ไม่ใช่ `MANAGE_ACCOUNT`:

| Primary actions | คอลัมน์ × แถว |
| --- | --- |
| 1–3 | จำนวนคอลัมน์เท่ากับจำนวน action |
| 4 | 2 × 2 |
| 5–6 | 3 × 2 |
| 7–8 | 4 × 2 |
| 9 | 3 × 3 |

การจัดวางบน menu ที่ไม่มี footer ใช้พื้นที่หลักได้เต็มความสูงที่เหลือ เช่น `UNLINKED` ส่วน `LINKED_INELIGIBLE` มี status region ที่วาดภาพได้แต่ไม่ส่งไปเป็น LINE action area

LINE รับ Rich Menu image แบบ JPEG หรือ PNG, กว้าง 800–2500 px, สูงอย่างน้อย 250 px, aspect ratio อย่างน้อย 1.45 และขนาดไม่เกิน 1 MB ตาม [Messaging API reference](https://developers.line.biz/en/reference/messaging-api/nojs/). Canvas 2500 × 1686 มี aspect ratio ประมาณ 1.48; asset generator ตรวจ PNG, มิติ และขนาดไฟล์ก่อนเขียนทุกครั้ง

## ไฟล์และการสร้างซ้ำ

- [line-rich-menu-illustrations.ts](../../scripts/line-rich-menu-illustrations.ts): จับคู่ action หลักกับภาพประกอบและโทนตามบทบาท; `MANAGE_ACCOUNT` ไม่มี illustration mapping
- [layout.ts](../../src/modules/line/rich-menu/layout.ts): คำนวณกริดหลัก, footer hit area และ status region แบบ non-interactive
- [line-rich-menu-asset-manifest.ts](../../scripts/line-rich-menu-asset-manifest.ts): รวม catalog, visual assignment และ bounds จาก layout
- [line-rich-menu-renderer.ts](../../scripts/line-rich-menu-renderer.ts): ประกอบฉาก, label ภาษาไทย, utility footer และส่วนหัว
- [generate-line-rich-menu-assets.ts](../../scripts/generate-line-rich-menu-assets.ts): สร้างหรือเช็ก PNG ทั้ง 18 variants
- [generate-line-rich-menu-previews.ts](../../scripts/generate-line-rich-menu-previews.ts): สร้าง contact sheet 360, 390, 430 px และตัวอย่าง glyph ไทย
- [public/line/rich-menus](../../public/line/rich-menus): PNG ที่ LINE ใช้
- [rich-menu-previews](rich-menu-previews): ภาพ preview สำหรับ QA

```powershell
npm run line:rich-menu:assets
npm run line:rich-menu:assets -- --check
npm run line:rich-menu:previews
```

การเปลี่ยนครั้งนี้คง catalog, alias, action identity/order/type/destination, workspace switching, account linking, role eligibility, authorization และ LINE webhook behavior ไว้ ไม่มีการเรียก LINE provider หรือ provision Rich Menu การเผยแพร่ภาพและ tappable areas ที่เปลี่ยนต้องสร้าง Rich Menu provider resources ชุดใหม่ในขั้นตอน rollout ที่ได้รับอนุมัติแยกต่างหาก
