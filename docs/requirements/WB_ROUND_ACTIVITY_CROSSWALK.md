# WB Round Activity Crosswalk (A-01)

แก้ A-01: รายการแนะนำของครั้งที่ 1–6 ใน `ROUND_RECOMMENDED_TOOLS` (`src/modules/patient-program-rounds/domain/round-catalog.ts`) ให้ตรงกับกล่องบน Canva Whiteboard ของ Product Owner ไม่ใช่ตามสมมติฐานของ Workbook เดิม. `source` PLANNED/EXTRA ของ ledger derive จากตารางนี้ที่ server ผ่าน `roundActivitySourceFor`.

## หลักฐาน

- Canva "ร่าง DEMI App ใหม่" (`DAHSvdQ3gvU`) อ่านข้อความ design ผ่าน Canva connector เมื่อ 2026-10-14: กล่อง "การจัดบริการ" ครั้งที่ 1–6 ใน flow อสม. / เจ้าหน้าที่ / แอดมิน ซ้ำกันตรงกันทุก flow และตรงกับ [§3.1 ของ BF_GAP_WB_00](../phases/BF_GAP_WB_00_WORKBOOK_DOD_CLOSURE_PLAN.md) (ตรวจ visual 2026-10-12).
- ข้อจำกัด: อ่านได้เฉพาะ **ข้อความ** ในกล่อง การผูกลูกศร-กล่องกับครั้งที่ยืนยันจากภาพ export ใน §3.1 เท่านั้น ไม่ได้ตรวจภาพซ้ำในงานนี้.
- Flow ผู้ป่วยมีกล่องรอบ 1 สั้นกว่า (ตัวฉันในตอนนี้, PAM, PROM, กราฟชีวิต, บรรทัดวัดใจ, ตารางชีวิตของฉัน, ทบทวนแผนสุขภาพ) และสะกดต่างจาก flow อสม.; ถือ flow อสม. เป็นหลักตาม §3.1.

## Crosswalk ชื่อบน Whiteboard → รหัสในระบบ

| Whiteboard | รหัส | สถานะ |
| --- | --- | --- |
| รู้จักตัวเอง / รู้จักตัวฉันเอง | `KNOW_SELF` | ยืนยัน — ไม่มีแบบฟอร์ม (WB-PD-01) |
| PAM / แบบประเมิน PAM | `PAM` | ยืนยัน |
| PROMs / แบบประเมิน PROMs | `PROMS` | ยืนยัน |
| กราฟวัดลอยจม | `FLOATING_CHART` | ยืนยัน (label ปรับเป็น "กราฟวัดลอยจม") |
| ไม้บรรทัดวัดใจ ("ผลไม้บรรทัดวัดใจ" คือคำพิมพ์ผิด) | `CONFIDENCE_RULER` | ยืนยัน |
| ตารางชีวิตของฉัน | `LIFE_TABLE` | ยืนยัน — ไม่มีแบบฟอร์ม |
| เส้นทางสุขภาพ (ครั้งที่ 1) | `HEALTH_PATH` | ยืนยัน — ไม่มีแบบฟอร์ม |
| ทบทวนเส้นทางสุขภาพ (ครั้งที่ 6) | `HEALTH_PATH` (label ต่อครั้ง) | **ไม่ได้เพิ่ม enum** ใช้รหัสเดียวกันเพราะ ledger unique ต่อ (program, ครั้ง, tool) และยังไม่มีแบบฟอร์ม — ดู U-3 |
| ทบทวนแผนสุขภาพ | `HEALTH_PLAN_REVIEW` | ยืนยันชื่อ; ผูกกับ Follow-up เฉพาะครั้งที่ 3–6 — ดู U-4 |
| ความฝันของฉัน (ครั้งที่ 3) | `DREAM_CARD` | **ชั่วคราว** ตามคำตอบของผู้ใช้งานนี้ — ดู U-1 |
| แผนสุขภาพดีของฉัน (ครั้งที่ 4) | `HEALTHY_PLAN` | ชื่อตรง; ตำแหน่งขัดกับ Goal Plan ครั้งที่ 2 — ดู U-2 |
| ตารางกิจวัตร | `ROUTINE` | **ไม่มีบน Whiteboard** (ไม่อยู่ทั้งในกล่องครั้งที่ 1–6 และรายการ Add) ไม่ถือเป็นเครื่องมือเดียวกับ "ตารางชีวิตของฉัน" |

## รายการแนะนำที่ใช้ (ตรวจกับ Whiteboard)

| ครั้งที่ | Whiteboard (ลำดับตามกล่อง) | `ROUND_RECOMMENDED_TOOLS` |
| --- | --- | --- |
| 1 | รู้จักตัวเอง, PAM, PROMs, กราฟวัดลอยจม, ไม้บรรทัดวัดใจ, ตารางชีวิตของฉัน, เส้นทางสุขภาพ | `KNOW_SELF, PAM, PROMS, FLOATING_CHART, CONFIDENCE_RULER, LIFE_TABLE, HEALTH_PATH` |
| 2 | ทบทวนแผนสุขภาพ, ไม้บรรทัดวัดใจ, ตารางชีวิตของฉัน | `HEALTH_PLAN_REVIEW, CONFIDENCE_RULER, LIFE_TABLE` |
| 3 | ทบทวนแผนสุขภาพ, ไม้บรรทัดวัดใจ, ความฝันของฉัน | `HEALTH_PLAN_REVIEW, CONFIDENCE_RULER, DREAM_CARD` |
| 4 | ทบทวนแผนสุขภาพ, กราฟวัดลอยจม, ไม้บรรทัดวัดใจ, ตารางชีวิตของฉัน, แผนสุขภาพดีของฉัน | `HEALTH_PLAN_REVIEW, FLOATING_CHART, CONFIDENCE_RULER, LIFE_TABLE, HEALTHY_PLAN` |
| 5 | ทบทวนแผนสุขภาพ, ตารางชีวิตของฉัน | `HEALTH_PLAN_REVIEW, LIFE_TABLE` |
| 6 | ทบทวนเส้นทางสุขภาพ, ทบทวนแผนสุขภาพ, ไม้บรรทัดวัดใจ | `HEALTH_PATH, HEALTH_PLAN_REVIEW, CONFIDENCE_RULER` |

ผลต่างจาก Phase A: ถอด `DREAM_CARD`/`ROUTINE` ออกจากครั้งที่ 1, ถอด `HEALTHY_PLAN` ออกจากครั้งที่ 2, ถอด `DREAM_CARD`/`FLOATING_CHART` ที่เคยเดาไว้ในครั้งที่ 4–5, ถอด `LIFE_TABLE` ออกจากครั้งที่ 3, ย้าย `HEALTH_PATH` จากครั้งที่ 4 ไปครั้งที่ 6 และเพิ่มกล่องที่ขาด (ครั้งที่ 2, 4, 5).

## ผลต่อพฤติกรรม

- ledger ที่เขียนตอนบันทึกผลระดับ Program (PAM/PROMs, Service 1) ใช้ `roundActivitySourceFor` แทน `"PLANNED"` ตายตัว: ตารางกิจวัตรและการ์ดความฝันที่บันทึกในครั้งที่ 1 จึงเป็น **EXTRA** (ยังบันทึกและมองเห็นในประวัติครั้งที่ 1 ตามเดิม).
- แถวที่ derive ตอนอ่านโดยไม่มี ledger (ผลก่อนมี ledger, Goal Plan ครั้งที่ 2, Follow-up) ใช้ catalog เดียวกัน: Goal Plan ในครั้งที่ 2 แสดงเป็น EXTRA.
- เครื่องมือที่ไม่มีแบบฟอร์ม (`KNOW_SELF`, `LIFE_TABLE`, `HEALTH_PATH`) เป็น "รอแบบฟอร์มจากหน่วยงาน" ทุกครั้งที่ปรากฏ ไม่เคยเป็น DONE และไม่ถูกทบทวนได้.
- การทบทวน (WB-DF-03) ไม่เขียนผลเดิมทับ; ครั้งที่ 1 ยังปฏิเสธการทบทวนซ้ำ.
- ไม่เปลี่ยน schema, migration, Goal Plan, Follow-up, เลขรอบ (ครั้งที่ N = Follow-up N−2), สูตรคะแนนหรือ report mapping.

## Historical data

- แถว `PatientProgramRoundActivity` ที่บันทึกแล้วเก็บ `source` ณ เวลานั้นและ **ไม่ถูกเขียนใหม่** (ไม่มี migration/backfill). แถวเดิมของ `ROUTINE`/`DREAM_CARD` ในครั้งที่ 1 ที่เป็น PLANNED จึงคงเดิม ส่วนแถวใหม่หลังการแก้จะเป็น EXTRA — ระบบจึงมี 2 ค่าในประวัติชุดเดียวกันได้.
- การจัดประเภทที่ derive ตอนอ่านเป็นการแสดงผลจาก catalog ปัจจุบัน ไม่ใช่เหตุการณ์ที่ persist.
- Phase A (`12d5607`) และ Phase C อยู่บน branch `feat/engagement-phase-c` โดยยังไม่ได้ merge เข้า `main` จึงยังไม่ตรวจข้อมูล production. ถ้ามีข้อมูล PLANNED เดิมที่ต้องการนับเป็น EXTRA ต้องมี remediation rule แยกที่ Product Owner อนุมัติก่อน.
- ไม่มี report ที่อ่าน `source` ของ ledger ในปัจจุบัน (ตรวจด้วย grep ใน `src/` และ `app/`); report mapping จึงไม่เปลี่ยน.

## ยังไม่ปิด — ต้องให้ Product Owner ตัดสิน

| ID | เรื่อง |
| --- | --- |
| U-1 | "ความฝันของฉัน" (ครั้งที่ 3) = "การ์ดความฝัน" Service 1 จริงหรือไม่ (ตอนนี้แมปชั่วคราว). ถ้าใช่ ควรให้ครั้งที่ 1 ที่บันทึกการ์ดเป็น EXTRA ต่อไปหรือย้ายเข้ากล่องครั้งที่ 1? |
| U-2 | Whiteboard วาง "แผนสุขภาพดีของฉัน" ที่ครั้งที่ 4 และ "ทบทวนแผนสุขภาพ" ที่ครั้งที่ 2 ขณะที่ WB-DF-01/Workbook สร้าง Goal Plan ครั้งที่ 2 — ขัดกัน (WB-D01/P-16). ระบบคง Goal Plan ที่ครั้งที่ 2 แต่ติดป้าย EXTRA และหัวข้อ "ครั้งที่ 2 · ทำแผนสุขภาพ" ยังเป็นไปตาม WB-DF-01 |
| U-3 | "ทบทวนเส้นทางสุขภาพ" ต้องมี identity แยกจาก "เส้นทางสุขภาพ" หรือไม่ (ไม่มีแบบฟอร์ม; เส้นทางสุขภาพไม่อยู่ในรายการ Add ของ Whiteboard) |
| U-4 | "ทบทวนแผนสุขภาพ" ในครั้งที่ 2 และ 5: ครั้งที่ 2 ไม่มี Follow-up ให้ผูก (ยังไม่มีผลที่บันทึกได้); ครั้งที่ 5 ผูกกับ Follow-up 3 ตามปกติ |
| U-5 | ตารางกิจวัตรไม่อยู่บน Whiteboard — คงเป็น EXTRA-only หรือถอดออกจากระบบ |
| U-6 | แบบฟอร์มของ `KNOW_SELF`, `LIFE_TABLE`, `HEALTH_PATH` (WB-PD-01) |

**สรุป:** กล่องรายครั้งถูกถอดความตรงกับ Whiteboard แล้ว แต่ **ยังไม่ถือว่า align เต็มรูปแบบ** จนกว่า U-1..U-6 จะถูกตัดสิน.
