# งานที่ยังเหลือของ DEMI

- **ปรับปรุง:** 2026-11-07 — current-HEAD reconciliation หลัง engineering query cleanup
- **หลักฐาน:** [canonical register](./BUSINESS_FLOW_GAP_CANONICAL.md), [decision register §EC-2026-11-07](./WB_ALIGNMENT_DECISIONS.md#ec-2026-11-07), source/tests ที่อ้างในแต่ละแถว และคำยืนยัน Product Owner ในงาน Final Engineering Cleanup
- **วิธีอ่าน:** implementation, เนื้อหาภายนอก, หลักฐาน operations และ governance เป็นคนละเรื่อง คำยืนยัน Product Owner ไม่ใช่ผล automated tests หรือหลักฐาน production

## Product implementation / reporting content gap

ช่องว่าง reporting ที่ยืนยันว่ายังเหลือเพียงรายการเดียวคือ **“ผลลัพธ์ที่ได้” — รายการประโยค/วลี/ค่าจากลูกค้า** (`CARE-15`, `WB-PD-02`, `RELEASE_GATE C-02`). ยังไม่ได้รับรายการ ห้ามสร้างค่า dropdown หรือเกณฑ์ขึ้นเอง งานนี้ไม่เพิ่มหรือออกแบบ feature ดังกล่าวใหม่ รายงานยังแสดงสถานะไม่มีแหล่งข้อมูลตาม implementation ปัจจุบัน

Work navigation และโครงสร้าง UI ตาม role ปัจจุบันได้รับการยอมรับ ไม่ค้างงานออกแบบให้เหมือน Canva เดิม แนวทาง clinical/defaults ปัจจุบันได้รับการยอมรับเช่นกัน ไม่ค้างการออกแบบ PAM/PROMs หรือ health path ใหม่ Product Owner รายงานว่า cross-role และ mobile/LINE ผ่านการทดสอบ/ใช้งาน แต่ยังไม่มี logs, อุปกรณ์, environment หรือ artifacts รายกรณีในหลักฐานที่ส่งมาครั้งนี้

## เนื้อหาภายนอกที่ยังไม่ยืนยันว่าได้รับ

| รายการ | รหัส / เจ้าของ | ขอบเขตที่ยังเหลือ |
| --- | --- | --- |
| ถ้อยคำ/เกณฑ์ PAM/PROMs ฉบับทางการและคำแนะนำผู้ประเมิน | CARE-01/02, C-03 · ลูกค้า/ผู้รับผิดชอบ clinical | คง CONTENT_PENDING เฉพาะ official source content ที่ยังไม่มีหลักฐานรับมอบ การยอมรับ behavior/defaults รวม Q1/Q6 ไม่ใช่การส่งมอบข้อความ/เกณฑ์ใหม่ ห้ามแต่งหรือเปลี่ยน scoring ใน cleanup นี้ |
| รายการคำ “ผลลัพธ์ที่ได้” | CARE-15, WB-PD-02, C-02 · ลูกค้า | ช่องว่าง reporting ข้างต้น ไม่ปิดรายการนี้ |
| Terms, Privacy และข้อความความยินยอมฉบับจริง | ACCOUNT-01/02/05/09/10, G-01 · หน่วยงาน/DPO | Software มีแล้วตาม ADR-0028; ฉบับปัจจุบันยังเป็น placeholder ที่ระบุชัด การรับ acceptance/consent ไม่ใช่การอนุมัติฐานกฎหมายหรือ disclosure |

C-01 / WB-PD-01 เดิมที่รอแบบฟอร์มเส้นทางสุขภาพถูกแทนที่สำหรับ behavior ที่ใช้อยู่ด้วย SR-D9 และ CARE-25: timeline สัญญาณชีพครั้งที่ 1–6 และการยืนยันทบทวน ไม่ได้อ้างว่าได้รับเอกสารทางการใหม่ หากลูกค้าจะส่งเอกสารเพิ่มเติมให้เก็บเป็น external input แยกจาก implementation ที่ยอมรับแล้ว ไม่สร้างฟอร์มหรือ scoring ทดแทนเอง

## Operational / deployment evidence

T-01..T-21 และหลักฐาน production/provider ใน [RELEASE_GATE.md](../operations/RELEASE_GATE.md) ยังต้องตรวจตามรายการ: configuration, scheduler/queues, backup/restore, rollback, monitoring/security, LINE provider และ device UAT ที่ระบุรายละเอียดจริง คำรายงาน Product Owner ไม่ปิด checklist เหล่านี้โดยอัตโนมัติ ผล automated checks ของ cleanup จะบันทึกใน [FINAL_ENGINEERING_CLOSURE.md](../engineering/FINAL_ENGINEERING_CLOSURE.md) เมื่อรันจริง

## Agency governance (ไม่ใช่ runtime feature gate)

| รหัส | เรื่องที่ผู้รับผิดชอบภายนอกต้องตัดสิน/บันทึก |
| --- | --- |
| G-01 | PDPA/ฐานกฎหมาย/ผู้ควบคุมข้อมูล, Terms/Privacy/consent, self-registration disclosure และการใช้ข้อมูลจริง; ADR-0028 ส่งมอบ software แล้วแต่ไม่แทนคำตัดสินหน่วยงาน |
| G-02 | Data residency ของฐานข้อมูล, edge/provider และ backup |
| G-03 | Record-time disclosure ใน Parent summary ซึ่งใช้ operational association ปัจจุบัน |
| G-04 | Small-count suppression: ยังไม่มีเกณฑ์ที่รับมอบ ห้ามตั้ง threshold เอง |
| G-05 | ผู้รับ ชุดข้อมูลและกระบวนการส่งต่อ export; audit ไม่ใช่ blanket disclosure approval |
| G-06 | ข้อเสนอแนะข้อความ generic LINE recovery; ไม่ใช่ activation condition |
| WB-PD-07 / FAM-04/05 | Governance การใช้ข้อมูลญาติ; runtime ต้องมี valid relationship และ resource-specific grant ของผู้ป่วยที่ผู้ดูแลยอมรับเสมอ |

## รายการเดิมที่ปิดหรือ superseded พร้อมหลักฐาน

| รายการในฉบับเดิม | ข้อสรุปปัจจุบัน |
| --- | --- |
| หน้าจอ/บันทึก Terms, Privacy, consent (เดิม product ข้อ 1) | IMPLEMENTED โดย [ADR-0028](../adr/0028-legal-documents-and-consent-records.md), `src/modules/legal/**`, migration `20261204100000_legal_documents_and_consents`, `tests/integration/legal-consent.integration.test.ts`; G-01 ยังคงเปิด |
| Program report สัญญาณชีพและ PAM/PROMs (เดิม product ข้อ 2) | RPT-01 VERIFIED_COMPLETE ตาม RD-1/RD-2: `program-report-projection.ts`, `program-screening-report.ts`; `tests/integration/program-reporting.integration.test.ts` และ `src/modules/reporting/transport/program-report-page.test.ts` ไม่ใช่ช่องว่างปัจจุบัน |
| Hospital Network Phase A ที่ระบุ AREA-02..05 เป็น PARTIAL | Superseded โดย ADR-0015/0016/0017/0018/0026 และ canonical AREA-02..05 VERIFIED_COMPLETE: operational associations, ADMIN classification/transfer, Parent-led Child onboarding และ scoped Patient read; ไม่มี Hospital Master ใหม่ |
| CVD risk score / WB-PD-03 / C-04 | ปิดแล้วตาม D7 → WB-DF-17 และคำตอบ จ-8: เจ้าหน้าที่กรอก % ไม่คำนวณ ไม่ขอ confirmation ซ้ำ |
| P-19 ปรับแผน / WB-PD-11 เวลานัด | เก็บเป็นประวัติคำถาม: ยอมรับ behavior ปัจจุบัน แผนใหม่ยังสร้างแยกได้; WB-PD-11 ปิดโดย Phase D ก-23 (§ง/B-01 ใน decision register) ไม่ใช่งาน redesign ค้าง |
| NOTIF-03 ค่า lateness 15 นาที | ยังเป็น provisional engineering default ตาม register การรายงาน mobile/LINE ผ่านไม่ได้ยืนยัน threshold นี้โดยเฉพาะ เก็บเป็น technical decision follow-up ไม่เปลี่ยน runtime และไม่อ้างว่า production deadline ผ่าน |

Technical query debt ที่เลื่อนพร้อมเหตุผลอยู่ใน [QUERY_HARDENING_AUDIT.md](../engineering/QUERY_HARDENING_AUDIT.md) ไม่ใช่ product redesign backlog ประวัติ phase/ADRs เดิมยังคงไว้และต้องอ่านร่วมกับ amendments ที่ใหม่กว่า
