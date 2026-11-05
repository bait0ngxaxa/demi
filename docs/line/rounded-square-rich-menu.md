# DEMI LINE Rich Menu: Modern Healthcare Editorial Illustration

ปรับ visual asset ของ LINE Rich Menu ครบ 18 variants ให้ใช้ฉากภาพประกอบสุขภาพที่สื่อกิจกรรมจริง โดยคง catalog, alias, action, ลำดับ, ปลายทาง และ hit area เดิม ภาพทั้งหมดเรนเดอร์ลง canvas 2500 × 1686 พิกเซล

## ภาพตัวอย่างบนมือถือ

แต่ละ contact sheet มี Rich Menu ครบทั้ง 18 variants ที่ขนาดแสดงผลตามชื่อไฟล์

| ความกว้าง | Preview |
| --- | --- |
| 360 px | [rich-menu-contact-360.png](rich-menu-previews/rich-menu-contact-360.png) |
| 390 px | [rich-menu-contact-390.png](rich-menu-previews/rich-menu-contact-390.png) |
| 430 px | [rich-menu-contact-430.png](rich-menu-previews/rich-menu-contact-430.png) |

[ตัวอย่างตัวอักษรไทย](rich-menu-previews/thai-glyph-samples.png) ใช้ตรวจการจัดรูปอักษรจาก Noto Sans Thai ด้วย Pango และ HarfBuzz

## ระบบภาพประกอบ

ใช้ภาพประกอบ editorial แบบ cut-paper และ gouache ที่มีมิติอ่อน ๆ รูปทรงอ่านง่าย และใช้ผู้ใหญ่กำลังทำกิจกรรมสุขภาพเป็นจุดเด่น ภาพไม่มีข้อความหรือชื่อเมนูในตัวอักษรไทย renderer เป็นผู้วาง label แยก จึงคงการจัดบรรทัดและการสะกดจาก catalog ได้แน่นอน

ชุดภาพประกอบ 13 ฉากประกอบด้วย:

- นัดหมายกับบุคลากรสุขภาพ และทบทวนประวัตินัดหมาย
- บันทึกค่าวัดสุขภาพ และทบทวนยากับเภสัชกร
- รับข้อมูลการดูแลจากพยาบาล
- ผู้ป่วยใช้พื้นที่สุขภาพส่วนตัว
- อสม. คัดกรอง วางแผนติดตาม และเยี่ยมบ้าน
- ทีมโรงพยาบาลประสานงานบริการ
- เชื่อมบัญชี และจัดการข้อมูลบัญชี

ภาพต้นฉบับที่สร้างด้วย image generation อยู่ใน [scripts/illustrations/line-rich-menu](../../scripts/illustrations/line-rich-menu): 3 atlas และ 1 ฉากเดี่ยวสำหรับการประสานงานของทีม อสม. renderer ใช้ Sharp ครอปฉากจาก atlas และประกอบภาพในเครื่องระหว่าง build ไม่มีการเรียก image-generation service หรือดาวน์โหลด artwork ระหว่างสร้างเมนู

สีหลักคงตาม DEMI: brand deep `#0E3C35`, canvas `#F3F7F5`, ink `#102620`, white `#FFFFFF` และ brand soft `#DCEEE9` เพิ่มสีรองอย่างจำกัดเพื่อช่วยแยกบริบท: coral อ่อนสำหรับผู้ป่วย, sage/mint สำหรับ อสม., sky blue สำหรับโรงพยาบาล และ warm yellow สำหรับบัญชี

แถบหัวเมนูใช้ brand deep กับข้อความขาว พื้นที่ action เป็นสี่เหลี่ยมแบนสีอ่อนที่ขอบตรงกับพื้นที่ LINE โดยเว้น gutter ตาม layout ไม่มีกรอบมุมโค้งหรือไอคอนเส้นเป็นภาพหลัก การ์ดที่มี action หลายรายการใช้ภาพประกอบขนาดและสัดส่วนเดียวกัน ส่วน role switch ใช้ฉากที่สื่อบทบาทผู้ป่วย อสม. หรือโรงพยาบาลตามปลายทาง

## Action และตำแหน่งกด

`src/modules/line/rich-menu/catalog.ts` ยังคงเป็นแหล่งข้อมูล action และ label ส่วน `getLineMenuAreaBounds()` ใน [layout.ts](../../src/modules/line/rich-menu/layout.ts) เป็นแหล่งเดียวของตำแหน่งภาพกับ LINE tappable areas ภาพพื้นของแต่ละ action วางอยู่ในขอบเขตนั้นโดยไม่ขยาย hit area หรือสร้างพื้นที่คลิกเพิ่ม

คงการจัดวางเดิมตามจำนวน action:

| จำนวน action | คอลัมน์ × แถว |
| --- | --- |
| 1–3 | จำนวนคอลัมน์เท่ากับ action, 1 แถว |
| 4 | 2 × 2 |
| 5–6 | 3 × 2 |
| 7–8 | 4 × 2 |
| 9 | 3 × 3 |

LINE รับ Rich Menu image แบบ JPEG หรือ PNG, กว้าง 800–2500 px, สูงอย่างน้อย 250 px, aspect ratio อย่างน้อย 1.45 และขนาดไม่เกิน 1 MB ตาม [Messaging API reference](https://developers.line.biz/en/reference/messaging-api/nojs/). Canvas 2500 × 1686 มี aspect ratio ประมาณ 1.48; asset generator ตรวจ PNG, มิติ และขนาดไฟล์ก่อนเขียนทุกครั้ง

## ไฟล์และการสร้างซ้ำ

- [line-rich-menu-illustrations.ts](../../scripts/line-rich-menu-illustrations.ts): จับคู่ action กับฉากและสีตามบทบาท พร้อมอ่าน artwork ต้นฉบับในเครื่อง
- [line-rich-menu-asset-manifest.ts](../../scripts/line-rich-menu-asset-manifest.ts): รวม catalog, visual assignment และขอบเขตจาก layout
- [line-rich-menu-renderer.ts](../../scripts/line-rich-menu-renderer.ts): ประกอบภาพ ฉาก label ภาษาไทย และส่วนหัว
- [generate-line-rich-menu-assets.ts](../../scripts/generate-line-rich-menu-assets.ts): สร้างหรือเช็ก PNG ทั้ง 18 variants
- [generate-line-rich-menu-previews.ts](../../scripts/generate-line-rich-menu-previews.ts): สร้าง contact sheet 360, 390, 430 px และตัวอย่าง glyph ไทย
- [public/line/rich-menus](../../public/line/rich-menus): PNG ที่ LINE ใช้
- [rich-menu-previews](rich-menu-previews): ภาพ preview สำหรับ QA

```powershell
npm run line:rich-menu:assets
npm run line:rich-menu:assets -- --check
npm run line:rich-menu:previews
```

`--check` สร้างภาพในหน่วยความจำแล้วเทียบ byte กับไฟล์ที่บันทึกไว้ จึงตรวจความทำซ้ำได้โดยไม่แก้ asset

ไม่มีการแก้ `catalog.ts`, `layout.ts`, account linking, role eligibility, authorization หรือ LINE webhook และไม่มีการ provision Rich Menu หรือแก้ provider state จากงานนี้
