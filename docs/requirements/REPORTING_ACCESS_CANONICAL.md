# ข้อกำหนดปัจจุบัน: Reporting Access

- **สถานะ:** `CONFIRMED_OWNER_REQUIREMENT` สำหรับ OR-RPT-01–05; เอกสารนี้เป็นแหล่งความจริงปัจจุบันด้าน product intent
- **ปรับปรุง:** 2026-10-11
- **ขอบเขต:** การอ่านและส่งออกผลรายงานของ Hospital; ไม่อนุมัติ runtime changes หรือการเปิดเผย field ที่ยังไม่ยืนยัน

เอกสารนี้กำหนดว่า reporting ต้องรองรับงานใด ส่วน [ADR-0002](../adr/0002-role-capability-scope-authorization.md), [ADR-0005](../adr/0005-server-side-application-boundary.md) และ [ADR-0010](../adr/0010-production-ready-mvp-and-deployment-neutral-runtime.md) กำหนดขอบเขตสถาปัตยกรรมและความปลอดภัย โค้ดและการทดสอบปัจจุบันเป็นหลักฐานว่าอะไรทำงานแล้ว ไม่ใช่เพดานของ product scope เอกสาร Phase 17K–19 เป็นหลักฐานทางประวัติศาสตร์เมื่อขัดกับข้อกำหนดที่ยืนยันในที่นี้

## สถานะที่ใช้

| สถานะ | ความหมาย |
| --- | --- |
| `CONFIRMED_OWNER_REQUIREMENT` | Owner ยืนยัน business flow แล้ว; ไม่ได้หมายถึง runtime เสร็จหรือ field disclosure ทุกชนิดได้รับอนุญาต |
| `VERIFIED_IMPLEMENTED` | พฤติกรรมตรวจสอบแล้วใน runtime source; ระบุ scope จริงไว้ด้วย |
| `IMPLEMENTATION_GAP` | Product flow ยืนยันแล้ว แต่ runtime ยังไม่รองรับครบ |
| `OPEN_REQUIREMENT` | Product behavior หรือ field-level choice ยังไม่ได้ระบุ |
| `FUTURE_NOT_PRIORITIZED` | ไม่อยู่ใน initial delivery; เริ่มเมื่อมีการจัดลำดับงานใหม่ |
| `SUPERSEDED_PRODUCT_ASSUMPTION` | การตีความเก่าที่ห้ามใช้กำหนด current product intent |
| `SECURITY_OR_GOVERNANCE_DECISION_PENDING` | ข้อกำหนด security/privacy/audit หรือ disclosure เฉพาะ operation/field ยังต้องตัดสิน |

## 1. Owner-confirmed business objectives

### OR-RPT-01 — Parent Hospital อ่านรายงาน Child Hospital เป็นรายแห่ง

สถานะ `CONFIRMED_OWNER_REQUIREMENT` — Parent Hospital ที่มี qualifying OWNER ต้องเปิดรายงานของ Hospital ตนเอง ระบุและเลือก eligible direct Child Hospital เปิดดูผลรายงานของ Child นั้น และสลับไปดู Child อื่นใน network ได้ทีละ Hospital นี่คือการอ่าน **per-Hospital report**; Network total เพียงค่าเดียวไม่ตอบโจทย์นี้

Parent OWNER ไม่ต้องมี direct OWNER membership ที่ Child เพื่ออ่านรายงานตาม network relationship ที่ server ยืนยัน Parent/Child reporting grant ไม่เปลี่ยน Parent ให้เป็นผู้จัดการ Child และไม่เพิ่มสิทธิ์ workforce, configuration หรือ Patient mutation โดยอัตโนมัติ

สิทธิ์อ่าน report ไม่ได้ตัดสินเองว่า report จะแสดง Patient identifiers, clinical measurements หรือ exact Program details ใดบ้าง รายละเอียด field ที่ยังไม่มีข้อกำหนดชัดเจนอยู่ใน §5

### OR-RPT-02 — Global ADMIN อ่าน/ส่งออกรายงาน Hospital ที่เลือก

สถานะ `CONFIRMED_OWNER_REQUIREMENT` — authenticated ACTIVE Platform ADMIN เลือก eligible Hospital ใดก็ได้ ไม่ว่ามี Parent/Child affiliation แบบใด แล้วดูและส่งออกรายงานของ Hospital นั้นโดยไม่ต้องเป็น Hospital OWNER การเปลี่ยน Hospital คือการเปิดรายงานอีกแห่งแยกกัน ไม่ใช่การรวมผลหลาย Hospital

วัตถุประสงค์รวมถึงการจัดทำรายงานเพื่อส่งต่อแก่หน่วยงานที่เกี่ยวข้อง แต่ recipient, data set สำหรับส่งต่อ และวิธีส่งยังต้องกำหนดแยก การดาวน์โหลดไม่ใช่ blanket authorization สำหรับ disclosure ภายนอก

### OR-RPT-03 — Global Aggregation ไม่ใช่ initial requirement

สถานะ `CONFIRMED_OWNER_REQUIREMENT` — ไม่มีข้อกำหนด initial ให้รวมหลาย Hospital เป็น dashboard, metric, comparison หรือ workbook เดียว ชื่อ `GLOBAL ADMIN` ไม่สร้าง aggregation entitlement

### OR-RPT-04 — Network Aggregation ไม่ใช่เงื่อนไขของ per-Hospital Child report

สถานะ `CONFIRMED_OWNER_REQUIREMENT` — N-only Network Summary ไม่ใช่ acceptance target หลักของ Parent reporting และไม่ใช่ prerequisite สำหรับอ่าน exact report ของ Child Hospital ทีละแห่ง

HN-A01–A06 และ HN-M01–M06 ยังคง traceable เป็น historical aggregate contracts; HN-M07 ยังคงเปิดสำหรับ aggregate disclosure; HN-M08 ยังคง deferred สำหรับ Network Export การตัดสินเหล่านี้ไม่ปิดหรือยกเลิก per-Hospital Child reporting

### OR-RPT-05 — Authorization และการคุ้มครองข้อมูล

สถานะ `CONFIRMED_OWNER_REQUIREMENT` สำหรับขอบเขตต่อไปนี้:

- Parent reporting ต้องมาจาก authenticated ACTIVE User, current `Role.HOSPITAL`, direct ACTIVE OWNER membership ที่ exact ACTIVE Parent Hospital และ current direct-child relationship ที่ server resolve จาก authoritative database state
- อ่านเฉพาะ eligible direct Child Hospital ตาม current hierarchy และ accepted lifecycle status; ห้ามขยายเป็น sibling, grandchild หรือ unrelated Hospital
- Child-only OWNER, MEMBER-only, ADMIN-only ที่ไม่มี qualifying HOSPITAL/Parent OWNER, OSM-only, PATIENT-only, inactive user หรือ stale/revoked scope ไม่ให้ Parent reporting authority
- ADMIN reporting แยกจาก Parent reporting: authenticated ACTIVE User ที่มี current database `Role.ADMIN` อ่าน/ส่งออก exact report ของ eligible selected Hospital โดยไม่ต้องมี OWNER membership
- ตรวจ authorization ซ้ำใน protected operations, ลด field ที่ส่งคืน, ใช้ safe errors และ audit ตาม operation ที่อนุมัติ
- Parent network reporting ไม่ให้ Patient mutation, workforce management, Hospital configuration หรือ unrestricted clinical access

ข้อกำหนดเหล่านี้กำหนด HOW ให้ปลอดภัย แต่ไม่เปลี่ยน business flow ใน OR-RPT-01/02

## 2. Role / operation / scope matrix

| Actor และ operation | Scope | สถานะปัจจุบัน / ขอบเขต |
| --- | --- | --- |
| Hospital OWNER — view report | Hospital ที่มี direct ACTIVE OWNER membership; ACTIVE Hospital | `VERIFIED_IMPLEMENTED`; exact-Hospital report |
| Hospital OWNER — export report | Hospital เดียวกัน | `VERIFIED_IMPLEMENTED`; exact-Hospital XLSX |
| Parent OWNER — list/select Child for report | Current eligible direct children ของ exact ACTIVE Parent ที่ผู้ใช้เป็น ACTIVE OWNER | รายชื่อเด็กบางส่วนมีใน hierarchy view; reporting selection scope ยัง `IMPLEMENTATION_GAP` |
| Parent OWNER — view selected Child report | exact ACTIVE direct Child Hospital ใน Parent scope; ไม่ต้องมี Child OWNER membership | `IMPLEMENTATION_GAP`; ต้องเพิ่ม server-side Parent-to-Child reporting authorization |
| Parent OWNER — export selected Child report | exact selected eligible Child | `OPEN_REQUIREMENT`; อย่าอนุญาตหรือปฏิเสธโดยอนุมานจาก OR-RPT-01 |
| Platform ADMIN — select/view Hospital report | eligible ACTIVE Hospital ใดก็ได้ในระบบ | `VERIFIED_IMPLEMENTED`; current database ACTIVE `Role.ADMIN`, exact-Hospital query |
| Platform ADMIN — export selected Hospital report | exact selected eligible ACTIVE Hospital | `VERIFIED_IMPLEMENTED`; XLSX ของ Hospital ที่เลือกเท่านั้น |
| Global ADMIN — merged multi-Hospital report | ระบบหรือชุด Hospital | `FUTURE_NOT_PRIORITIZED`; ไม่อยู่ใน initial scope |
| Network — merged P/C/N aggregate | ตาม historical HN scopes | `FUTURE_NOT_PRIORITIZED`; HN-M07 และ temporal gates ใช้กับ aggregate ตามขอบเขตของมัน |

Multi-role actor ใช้เฉพาะ authorization path ของ operation ที่เรียก: `ADMIN` เพียงอย่างเดียวไม่ grant Parent scope; `HOSPITAL + ADMIN` ใช้ Parent path ได้ต่อเมื่อผ่าน current HOSPITAL + direct Parent OWNER checks และใช้ Global path ได้เมื่อผ่าน current ADMIN checks

## 3. ตรวจสอบ baseline จาก runtime ปัจจุบัน

| Capability | Classification | Source evidence |
| --- | --- | --- |
| Direct Hospital OWNER report view | `VERIFIED_IMPLEMENTED` | [Hospital report access](../../src/modules/reporting/services/hospital-report-access-service.ts) จำกัด ACTIVE User/Role.HOSPITAL, direct ACTIVE OWNER และ ACTIVE exact Hospital; [Phase 18D.1 handoff](../phases/PHASE_18D1_HOSPITAL_REPORTING_IMPLEMENTATION_HANDOFF.md) |
| Direct Hospital OWNER XLSX | `VERIFIED_IMPLEMENTED` | `/api/v1/hospital/reporting/export`, shared exact-Hospital workbook projection; [Phase 18D.1 handoff](../phases/PHASE_18D1_HOSPITAL_REPORTING_IMPLEMENTATION_HANDOFF.md) |
| Global ADMIN selected-Hospital report view | `VERIFIED_IMPLEMENTED` | [Global reporting policy](../../src/modules/reporting/policies/global-reporting-policy.ts), access service และ `/app/admin/reporting`; ไม่ต้องมี Hospital membership; [Phase 18D.2 handoff](../phases/PHASE_18D2_GLOBAL_ADMIN_REPORTING_IMPLEMENTATION_HANDOFF.md) |
| Global ADMIN selected-Hospital XLSX | `VERIFIED_IMPLEMENTED` | `/api/v1/admin/reporting/export` revalidates current ADMIN และ selected ACTIVE Hospital; [Phase 18D.2 handoff](../phases/PHASE_18D2_GLOBAL_ADMIN_REPORTING_IMPLEMENTATION_HANDOFF.md) |
| Parent OWNER structural hierarchy context | `VERIFIED_IMPLEMENTED` บางส่วน | [Hospital hierarchy service](../../src/modules/hospital-hierarchy/services/hospital-hierarchy-service.ts) มี owner context และ `resolveHospitalNetworkScope()`; resolver ไม่ใช่ report capability |
| Parent OWNER report selection and exact Child report view | `IMPLEMENTATION_GAP` | `listHospitalReportingHospitals()` แสดงเฉพาะ direct OWNER Hospital; current report access ยืนยัน membership ที่ target Hospital เอง จึงยังไม่มี inherited Parent-to-Child reporting path |
| Global merged aggregation / comparison | `FUTURE_NOT_PRIORITIZED` | ไม่มี initial product requirement; ไม่ใช่ dependency ของ selected-Hospital ADMIN reporting |
| N-only Network aggregate as next primary slice | `SUPERSEDED_PRODUCT_ASSUMPTION` | ถูกแทนที่เป็น primary target ด้วย OR-RPT-01; aggregate contracts ยังคง historical/future |

ในปัจจุบันหน้า Hospital Reporting แสดง hierarchy ของ direct children แต่ reporting selector/access path ยังจำกัดอยู่ที่ Hospital ที่ actor เป็น OWNER โดยตรง การมี directory หรือ structural resolver จึงไม่เท่ากับการอ่าน report ของ Child ได้

## 4. ขอบเขต initial และ implementation priorities

1. **RPT-NET-01 — Parent-to-Child Reporting Authorization:** เพิ่ม server-side reporting path ให้ Parent OWNER เลือกและอ่าน eligible direct Child report โดยใช้ current Parent relationship; ไม่จำลอง Child OWNER membership และไม่เปลี่ยน direct OWNER หรือ Global ADMIN policy เดิม
2. **RPT-NET-02 — Parent Child-Hospital Reporting Consumer:** เพิ่ม/ปรับ selector และหน้าอ่าน exact report ของ Child ที่เลือก โดย reuse query/projection/UI ปัจจุบันเฉพาะส่วนที่ field disclosure อนุญาต; ไม่สร้าง reporting platform หรือ directory ซ้ำโดยไม่จำเป็น
3. **RPT-GLOBAL-01 — Global ADMIN Per-Hospital Reporting:** ตรวจสอบและรักษา Phase 18D.2 implementation; ไม่ทำซ้ำ
4. **RPT-GLOBAL-02 — Global ADMIN Single-Hospital Export:** ตรวจสอบและรักษา XLSX ของ selected eligible Hospital; ไม่เปลี่ยนเป็น combined workbook
5. **RPT-FUTURE-01 — Optional Network Aggregation:** เก็บ P/C/N และ HN metric/privacy/history work เป็น future scope; ไม่เป็น dependency ของ RPT-NET-01/02
6. **RPT-FUTURE-02 — Optional Global Aggregation:** defer merged metrics, multi-Hospital comparison และ combined exports จนกว่าจะจัด priority ใหม่

รายการ tracking ใหม่นี้ไม่แทน HN/GR/RPT-24 decision IDs และไม่ใช่ runtime authorization จากเอกสารนี้

## 5. OPEN requirements และ governance questions

ข้อกำหนดการเข้าถึง per-Hospital ของ Parent และ Global ADMIN **ยืนยันแล้ว**; คำถามต่อไปนี้เป็น field/output decisions ที่ยังเปิด:

| Open requirement | ขอบเขตที่ต้องตัดสิน |
| --- | --- |
| Parent OWNER ดู Patient-identifying rows หรือเฉพาะ non-identifying view | อนุมัติ field allowlist สำหรับ exact Child report; อย่าสันนิษฐานว่า projection เดิมทั้งหมดเหมาะกับ Parent audience |
| Parent OWNER export selected Child report | ยืนยันว่า export อยู่ในสิทธิ์ของ Parent reporting หรือไม่; OR-RPT-01 ยืนยัน report viewing เท่านั้น |
| Child report export fields/formats | ถ้าอนุญาต export ให้กำหนด columns/format และข้อมูลที่ต้องตัดออก; ห้ามขยายจาก direct OWNER XLSX หรือ Global XLSX โดยอัตโนมัติ |
| Clinical measurements และ exact Program details | ยืนยันทีละ field/section ว่าจะแสดงใน Parent-to-Child view หรือไม่ และจาก source/projection ใด |
| Audit, minimization และ disclosure safeguards | กำหนด operation/event, allowed metadata, readers/retention และ safe unavailable behavior สำหรับ Parent entitlement; ไม่ log Patient IDs, clinical values หรือ suppressed values |
| Global ADMIN onward distribution | ระบุ intended recipient, dataset และ transfer process; selected-Hospital download ไม่อนุมัติ arbitrary external sharing |
| Child selector display fields | ใช้ minimum field ที่จำเป็นต่อการระบุ eligible Child; `hospitalCode` หรือ metadata เพิ่มเติมต้องมีเหตุผลและ disclosure review |

หาก field ใดไม่มีการตัดสิน ให้คง field นั้นนอก projection จนกว่าจะมีข้อกำหนด; อย่าให้ field ที่เปิดค้างหยุดการออกแบบ/ทดสอบ Parent authorization ที่ไม่เปิดเผย field ดังกล่าว

## 6. Security และ technical acceptance boundaries

- ใช้ current server-resolved actor, operation และ Hospital scope; browser IDs เป็น locators เท่านั้น
- Parent target ต้องอยู่ใน current direct-child set ของ qualifying Parent และผ่าน eligibility/status ที่ exact-Hospital report ใช้อยู่; revalidate account, role, membership, Parent/Child status และ relationship ใน protected request
- Query ต้อง bind exact selected Hospital ID หลัง authorization; ห้ามใช้ hierarchy scope เพื่ออ่าน sibling, grandchild หรือ unrelated Hospital
- รักษา report field projection แบบ allowlist ต่อ audience; ไม่คัดลอก Patient/clinical fields ไป Parent path เพียงเพราะ exact OWNER viewer ใช้อยู่
- Global ADMIN ยังคงเป็น operation-specific selected-Hospital read/export; ไม่เปิด mutation, Patient workspace ทั่วระบบ หรือ merged aggregate
- HN-M07 และ historical Parent attribution เป็น privacy gates สำหรับ Network aggregates; ไม่ใช่ blanket block ของ exact-Hospital Child report. Field-specific disclosure decisions ยังมีผลเฉพาะ field/operation ที่เกี่ยวข้อง
- Audit, revocation, cache, read consistency และ safe error controls ให้ตัดสิน/ทดสอบตาม operation; ห้ามอ้างว่า open aggregate decisions อนุมัติหรือปิด controls สำหรับ Parent report

## 7. Historical assumptions และ traceability

| Historical source/ID | Current interpretation |
| --- | --- |
| Phase 17K HN-A01 | ใช้เป็น actor boundary: ACTIVE HOSPITAL user + direct ACTIVE OWNER ที่ exact Parent; ไม่ต้องเป็น OWNER ของ Child ตาม OR-RPT-01 |
| HN-A02/A03 และ HN-M01–M06 | คงนิยาม hierarchy/P/C/N/metrics สำหรับ aggregate track `RPT-FUTURE-01`; ไม่ใช่ข้อกำหนดทดแทน per-Hospital Child reporting |
| HN-M07, HN-C1-D03/D04/D05–D07 | `OPEN` สำหรับ aggregate disclosure, historical attribution และ differencing; ไม่ block exact-Hospital Child read ทั้งหมด |
| HN-C1-D01/D02 | Historical capability/directory proposals สำหรับ Network scope; ไม่ใช่ Parent-to-Child report capability acceptance |
| HN-C1-D08/D09/D11 | Security/consistency/audit questions ต้องประเมินตาม operation; ไม่ขยายเป็น blanket product veto |
| HN-M08 | Network aggregate export `DEFERRED / NOT AUTHORIZED`; แยกจาก Parent selected-Child export ซึ่ง `OPEN_REQUIREMENT` |
| Phase 18C.1A GR-REQ-01 และ GR-SEC registers | Broad Global summary/comparison/discovery proposals ไม่ใช่ initial requirement; คง security questions ไว้เฉพาะ scope ที่ยังอาจพิจารณา |
| Phase 19A / 19B.0 N-only หรือ directory-only first-slice recommendations | `SUPERSEDED_PRODUCT_ASSUMPTION` สำหรับลำดับงานปัจจุบัน; OR-RPT-01 เป็น next business target |
| Phase 18D.1 / 18D.2 | หลักฐาน implementation ปัจจุบันสำหรับ direct OWNER report/XLSX และ Global ADMIN selected-Hospital report/XLSX ตาม scope ใน §3 |
| RPT-24 / R24A-D01–D15 / RPT-24C | แยกจาก Dashboard/Service Process XLSX ที่ยืนยันว่ามีใน Phase 18D.1/18D.2; on-demand Patient Program workbook contract และ field/snapshot/export gates ใช้กับ workbook นั้น ไม่ได้ยกเลิก selected-Hospital ADMIN export หรืออนุมัติ Parent Child export |
| Phase 17 backlog RPT-02 | map เป็น RPT-NET-01/02 พร้อมคง RPT-GLOBAL-01/02 และ RPT-FUTURE-01/02 แยกตาม §4 |

เอกสารนี้ไม่เปลี่ยน status ของ historical decision IDs, ไม่รับรอง independent legal/security sign-off ที่ไม่มีหลักฐาน และไม่อนุญาต runtime implementation ด้วยตัวเอง
