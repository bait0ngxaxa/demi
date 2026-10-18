# Phase LINE-QA.A — Hybrid Quick Action Rich Menu

สถานะ: **implemented locally; no LINE Provider changes**
ฐานที่ตรวจสอบก่อนเริ่ม: `6322901e53f0a7166bfbf16f761430a5713f8632`
ขอบเขต: ปรับเมนู LINE ของ Patient และ OSM ให้เข้าเวิร์กโฟลว์เดิมได้ตรงขึ้น โดยคงเมนูหลายบทบาท, สิทธิ์ฝั่งเซิร์ฟเวอร์ และบริการโดเมนเดิม

## การตัดสินใจและสถาปัตยกรรม

- คง Option C จาก Phase 17J.0B: ผู้มีบทบาทเดียวเห็นเมนูบทบาทนั้น; ผู้มีหลายบทบาทเห็น chooser ที่เป็นกลางเมื่อไม่มี presentation preference ที่ยังใช้ได้; การสลับใช้ LINE `richmenuswitch` และ alias ที่มีอยู่
- role ที่เลือกเป็นเพียงการนำเสนอเมนู ไม่ใช่สิทธิ์ การเปิดทุกปลายทางยังตรวจ DEMI session, บทบาท, ความสัมพันธ์ และ policy ปัจจุบันจากฝั่งเซิร์ฟเวอร์
- URI ของ quick action ใช้ path แบบกำหนดไว้ล่วงหน้าจาก `DEMI_LINE_PUBLIC_ORIGIN` ไม่มี URL ปลายทาง, token, patient ID หรือ Hospital ID ที่มาจากผู้ใช้หรือเมนู
- ลิงก์เมนูงานเปิด **เว็บ DEMI ปกติ** ผ่าน URI action ใน LINE ไม่ใช่ LIFF หรือ MINI App ส่วนจัดการ/เชื่อมบัญชียังคงใช้ LIFF URL ที่ตั้งค่าไว้
- ยังคง catalog 18 variants, alias เสถียร, Sharp/Pango/HarfBuzz และฟอนต์ Noto Sans Thai ที่ pin ไว้

## ตารางเมนูและปลายทาง

### Patient

| ปุ่ม | LINE action | ปลายทาง/พฤติกรรม Phase A | ขอบเขตปัจจุบัน |
| --- | --- | --- | --- |
| นัดหมายถัดไป | `postback` เดิม | marker `DEMI_LINE_PATIENT_NEXT_APPOINTMENT_V1` | ใช้ webhook, การตรวจสิทธิ์, reply และ privacy contract เดิม ไม่มี query นัดหมายซ้ำหรือรายละเอียดทางคลินิกในแชต |
| นัดหมายทั้งหมด | URI — เว็บปกติ | `/app/personal/appointments` | ใช้หน้าและ authorization สำหรับ Patient SELF เดิม; ยังไม่ใช่ scoped MINI App |
| บันทึกสุขภาพ | URI — เว็บปกติ | `/app/personal/wellness` | ใช้ meal, exercise และ weight-goal ปัจจุบัน ไม่เพิ่ม persistence สำหรับการวัดสุขภาพแบบใหม่ |
| ยาของฉัน | URI — เว็บปกติ | `/app/personal/medications` | ใช้ authorization และหน้ารายการยาเดิม; ไม่ส่งข้อมูลยาใน LINE chat |
| ข้อมูลการดูแล | URI — เว็บปกติ | `/app/personal/care` | คงการเลือก Hospital relationship และ scoped reads ของ Patient SELF |
| เพิ่มเติม | URI — เว็บปกติ | `/app/personal` | หน้า Patient personal home เดิม |
| จัดการบัญชี | URI ไป LIFF | `https://liff.line.me/{configured LIFF ID}` | ใช้ flow จัดการบัญชีเดิม |
| สลับพื้นที่ | native `richmenuswitch` | alias ของ role อื่นที่ eligible ในชุดเมนูเดียวกัน | แสดงเฉพาะผู้ใช้หลายบทบาทที่มีสิทธิ์ปัจจุบัน |

นัดหมายถัดไปยังใช้ marker เดิมและการตอบกลับเดิมโดยไม่แก้ `line-webhook-service` หรือเพิ่มคำสั่งตอบในแชต

### OSM

| ปุ่ม | LINE action | ปลายทาง/พฤติกรรม Phase A | ขอบเขตปัจจุบัน |
| --- | --- | --- | --- |
| ผู้ป่วยที่ดูแล | URI — เว็บปกติ | `/app/patients/assigned` | directory ใช้ OSM assignment และ Hospital scope ที่ใช้งานได้ในปัจจุบัน |
| คัดกรองผู้ป่วย | URI — เว็บปกติ | `/app/patients/assigned?task=screening` | เลือกจาก directory ที่อนุญาต; แถวผู้ป่วยเปิด `/app/patients/{relationshipId}/screenings/new`; workflow ตรวจ relationship และ screening policy ซ้ำ |
| บันทึกติดตาม | URI — เว็บปกติ | `/app/patients/assigned?task=followup` | เลือกจาก directory ที่อนุญาต; แถวผู้ป่วยเปิด `/app/patients/{relationshipId}/followups/new`; workflow ตรวจ exact relationship และสิทธิ์ปัจจุบันก่อนอ่าน/บันทึก |
| เพิ่มผู้ป่วย | URI — เว็บปกติ | `/app/patients/provision` | ใช้ provisioning UI และ policy เดิม; OSM ใช้ได้เฉพาะขอบเขต Hospital ปัจจุบันที่ผ่าน policy ไม่ถือว่า OSM ทุกคนมีสิทธิ์ |
| งานทั้งหมด | URI — เว็บปกติ | `/app` | หน้า work home เดิม |
| จัดการบัญชี | URI ไป LIFF | `https://liff.line.me/{configured LIFF ID}` | ใช้ flow จัดการบัญชีเดิม |
| สลับพื้นที่ | native `richmenuswitch` | alias ของ role อื่นที่ eligible ในชุดเมนูเดียวกัน | ไม่เปลี่ยน role, membership หรือ authorization |

โหมด `screening` และ `followup` เป็นค่า query ที่จำกัดไว้เพียงสองค่า ใช้เปลี่ยนข้อความและปลายทางหลังเลือกแถวเท่านั้น ไม่รับ patient/resource ID จาก Rich Menu และไม่ส่งโหมดไปแทน policy หากมี Hospital scope ที่สร้างผู้ป่วยไม่ได้ หน้าเดิมแสดงข้อความว่าไม่มีขอบเขตที่ใช้งานได้; หลาย scope ใช้ selector เดิมและตรวจ scope ปัจจุบันก่อนเลือก

### HOSPITAL และเมนูสถานะบัญชี

- HOSPITAL คง action เดิม: `งานโรงพยาบาล` ไป `/app`, สลับ native ไป role อื่นที่ eligible และจัดการบัญชีผ่าน LIFF
- คง context `เมนูสำหรับคุณ` และ layout/action ของ HOSPITAL; การเปลี่ยน task layout จำกัดเฉพาะ Patient/OSM
- `UNLINKED` ยังคงปุ่มเชื่อมบัญชี; `LINKED_INELIGIBLE` ยังคงปุ่มจัดการบัญชี
- chooser, alias และการเลือก presentation role ยังคง Option C; ไม่สร้างเมนูเฉพาะผู้ใช้

## การกลับจากล็อกอินและการตรวจสิทธิ์

`loginReturnToSchema` อนุญาตเฉพาะ `/line/account`, Family invitation fragment ที่มีรูปแบบเดิม และ path quick action ที่กำหนดตรงตัวใน `LINE_QUICK_ACTION_RETURN_PATHS` เท่านั้น รวมถึง task mode `screening` หรือ `followup` ที่กำหนดไว้ ไม่มี external origin, arbitrary path หรือการต่อ path ผ่าน encoding การเข้าถึงที่ไม่มี session จะกลับไปยังปลายทาง quick action เดิมหลังล็อกอินสำเร็จ ส่วน return ที่ไม่ผ่าน allowlist จะใช้ `/login` หรือ fallback เดิมตามจุดเรียก

Proxy อ่านเฉพาะ request URL ที่ตรงกับ quick action แบบ exact, ลบ header ชื่อเดียวกันที่ผู้เรียกส่งมา แล้วส่งค่าที่ผ่าน allowlist ต่อให้ parent layout ใช้เลือกปลายทาง login header นี้เป็น navigation hint เท่านั้น; layout และปลายทางยังตรวจ session, account, relationship และ policy ฝั่งเซิร์ฟเวอร์ตามเดิม Page-level fallback ของ workflow ใช้ allowlist เดียวกัน จึงกลับไปยัง task mode เดียวกับ parent guard

การกลับจากล็อกอินไม่ได้ยืนยันสิทธิ์ ผู้ใช้ที่ role, membership, assignment หรือ Hospital status เปลี่ยนไปจะถูกปลายทางตรวจใหม่ทุกครั้ง Directory แสดงเฉพาะความสัมพันธ์ที่ query service อนุญาต และ screening/follow-up/provisioning เรียกบริการและ policy เดิมอีกครั้ง เมนูที่ LINE ยังแสดงหลังถอนสิทธิ์จึงไม่ให้สิทธิ์คงค้าง

## รูปแบบภาพและ preview

Patient ใช้กริดงานหลัก 2×2 และวาง “ข้อมูลการดูแล” เป็นแถบงานหลักเต็มความกว้างถัดลงมาเพราะมีงานหลักทั้งหมดห้ารายการ OSM ใช้กริดงานหลัก 2×2 สำหรับสี่งาน fieldwork; งานทั้งหมด, บัญชี และ workspace switch อยู่แถบรอง ขอบเขตที่วาดและ LINE tappable areas มาจาก `getLineMenuAreaBounds` ชุดเดียวกันและมีช่องไฟระหว่างปุ่ม

แก้ mobile readability เพิ่มเติมโดยใช้ฟอนต์งานหลัก 112px และงานรอง 104px ในเมนู Patient/OSM; footer ที่มีสี่ action จัดเป็น 2×2 แทนสี่ช่องแคบในแถวเดียว ปุ่มรองสามรายการยังเรียงสามช่องขนาดเต็มและข้อความใช้บรรทัดเดียวเมื่อพื้นที่รองรับ

สร้างครบ 18 ภาพ ขนาด `2500×1686` PNG และตรวจไม่เกิน 1 MiB ต่อภาพ ภาพใช้ Noto Sans Thai ผ่าน Pango/HarfBuzz; generator ปฏิเสธข้อความที่ล้นกรอบแทนการย่อหรือ clip

| ความกว้าง preview | ก่อน | หลัง |
| --- | --- | --- |
| 360px | [contact sheet ก่อน](assets/line-qa-a/before/rich-menu-contact-360.png) | [contact sheet หลัง](assets/line-qa-a/after/rich-menu-contact-360.png) |
| 390px | [contact sheet ก่อน](assets/line-qa-a/before/rich-menu-contact-390.png) | [contact sheet หลัง](assets/line-qa-a/after/rich-menu-contact-390.png) |
| 430px | [contact sheet ก่อน](assets/line-qa-a/before/rich-menu-contact-430.png) | [contact sheet หลัง](assets/line-qa-a/after/rich-menu-contact-430.png) |

ตัวอย่าง glyph ภาษาไทยหลังสร้างอยู่ที่ [thai-glyph-samples.png](assets/line-qa-a/after/thai-glyph-samples.png)

## Phase A ที่ทำแล้วและงาน Phase B ที่ยังไม่ทำ

Phase A เปิดใช้ workflow เว็บเดิมตาม matrix ด้านบน ไม่ได้ทำ LINE workflow session, scoped endpoint, MINI App authorization หรือหน้า MINI App ข้อตกลง Phase 17J.3A/17J.3B สำหรับ scoped MINI App โดยเฉพาะงานนัดหมายยังคงเป็นขอบเขต Phase B; เปลี่ยนจาก ordinary `/app/personal/appointments` ได้เมื่อ runtime, scoped reads/actions, session checks, cache/header controls และอุปกรณ์จริงผ่านเกณฑ์ที่กำหนดไว้เท่านั้น

การแยก entry point สำหรับ self-measurements อาจพิจารณาภายหลังหากมีความต้องการแยกจาก workflow wellness ปัจจุบัน; Phase A ไม่เพิ่มชนิดการวัดหรือ persistence ใหม่

## Verification และไฟล์ที่เปลี่ยน

- `npm run line:rich-menu:assets` และ `npm run line:rich-menu:assets -- --check` — สร้างและยืนยันครบ 18 PNG ตาม deterministic generator
- `npm run line:rich-menu:previews -- --output docs/phases/assets/line-qa-a/after` — สร้าง contact sheets 360/390/430 และ Thai glyph sample ครบ
- ชุดทดสอบ redirect flow, allowlist, LINE menu geometry, Proxy, login และสินทรัพย์ภาพ 10 ไฟล์ — ผ่าน 65 tests
- Browser smoke บน localhost โดยใช้ Supabase/PostgreSQL dummy ที่ชี้ localhost เท่านั้น: เปิด `/app/patients/assigned?task=screening` แบบไม่มี session แล้ว browser ไป `/login?returnTo=%2Fapp%2Fpatients%2Fassigned%3Ftask%3Dscreening`; หลังล็อกอินสำเร็จทดสอบเป้าหมายด้วย mocked auth ใน integration test แทนการใช้บัญชีจริง
- `npm run typecheck` — ผ่าน
- `npx eslint` บนไฟล์ TypeScript/TSX ที่เปลี่ยน — ผ่าน
- Impeccable UI detector — ไม่พบรายการตรวจจับ (`[]`)
- ตรวจภาพ contact sheets ทั้ง 18 variants ที่ 360/390/430 และ Thai glyph sample ด้วยตา; footer 2×2 อ่านชัดขึ้น, ไม่พบ glyph เสีย, clipped text หรือ tappable-area overlap
- ไม่เรียก LINE Provider, ไม่ใช้ `--apply`, ไม่ทำ production change และไม่มี database migration

ไฟล์ source หลักที่เปลี่ยน: `src/modules/line/domain/line-navigation-intents.ts`, `src/modules/line/rich-menu/catalog.ts`, `src/modules/line/rich-menu/layout.ts`, `src/modules/line/services/line-deep-link-builder.ts`, `scripts/line-rich-menu-renderer.ts`, `scripts/line-rich-menu-asset-manifest.ts`, `scripts/generate-line-rich-menu-previews.ts`, auth login-return/schema, assigned-patient directory/provisioning page, Patient SELF page contexts และ regression tests ของแต่ละส่วน ภาพ 18 ไฟล์อยู่ใน `public/line/rich-menus/`; preview ก่อน/หลังอยู่ใน `docs/phases/assets/line-qa-a/`

## ขั้นตอน rollout แบบปลอดภัย

งานนี้ยังไม่ได้ทำ rollout ขั้นตอนต่อไปต้องทำในงาน rollout ที่ได้รับอนุญาต:

1. ตรวจ environment ให้ชี้ DEMI LINE Messaging API channel/provider และ LIFF ID ที่ถูกต้อง พร้อมตั้ง `DEMI_LINE_PUBLIC_ORIGIN` เป็น canonical HTTPS origin
2. ตรวจ asset ด้วย `npm run line:rich-menu:assets -- --check`
3. รัน `npm run line:rich-menu:reconcile` โดยไม่มี `--apply` เพื่ออ่าน provider state และทบทวนแผนของ 18 เมนู, alias และ default menu ก่อน (คำสั่งนี้เป็น read-only แต่ติดต่อ LINE Provider)
4. หลังทบทวนภาพ, payload, alias และผล dry-run แล้วเท่านั้น จึงขออนุมัติ rollout แยกต่างหากและใช้ `npm run line:rich-menu:reconcile -- --apply`

Provisioning เดิมตั้ง version จาก payload และ SHA-256 ของภาพ, reuse alias เดิม, update alias ไป menu version ใหม่ และตรวจ read-back; การเปลี่ยน action/bounds หรือภาพจึงได้ provider menu version ใหม่โดยไม่สร้าง alias ต่อผู้ใช้ Phase นี้ไม่ได้รันทั้ง dry-run หรือ apply และไม่ได้ใช้คำสั่ง repair ราย binding

## เอกสาร LINE ทางการที่อ้างอิง

- [Messaging API action objects](https://developers.line.biz/en/docs/messaging-api/actions/) — URI, postback และ rich menu switch actions
- [Switch between rich menus](https://developers.line.biz/en/docs/messaging-api/switch-rich-menus/) — alias และการสลับเมนูด้วย LINE
- [Opening a LIFF app](https://developers.line.biz/en/docs/liff/opening-liff-app/) — URL ที่ใช้เปิด LIFF; ordinary HTTPS URI ไม่ได้กลายเป็น LIFF โดยอัตโนมัติ
- [Messaging API reference](https://developers.line.biz/en/reference/messaging-api/nojs/) — ขนาด Rich Menu, จำนวนพื้นที่กด, ขนาดไฟล์ และข้อจำกัด alias
- [Rich menus overview](https://developers.line.biz/en/docs/messaging-api/rich-menus-overview/) — ขอบเขตการแสดง Rich Menu บน LINE clients
