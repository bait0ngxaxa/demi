# Phase 18C.2 — Reporting Architecture Blueprint

สถานะ: **REPORTING ARCHITECTURE BLUEPRINT PREPARED / IMPLEMENTATION READINESS ASSESSED**

เอกสารนี้เป็นแบบออกแบบจาก source ปัจจุบัน ไม่อนุมัติ metric, clinical meaning, disclosure, permission, API หรือ implementation. Baseline ที่ตรวจคือ main HEAD 99ab21c557def66406644845b639e8aa843ca9c1; working tree ก่อนแก้เอกสารสะอาด. ไม่ได้ตรวจหรือใช้ข้อมูล Patient จริง.

## 1. สถาปัตยกรรมที่เสนอ

ใช้ operational data ปัจจุบันเป็น authoritative source แล้วประกอบ read path ตามขอบเขต ไม่สร้าง workbook database, warehouse หรือ generic analytics platform:

Hospital Patient Import → PatientProfile / PatientHospitalRelationship → Initial Baseline, Patient Classification และ OSM Assignment → PatientProgram → Service 1, Goal Plan, Follow-up และ Final Assessment → scoped factual read → typed view projection → approved metric composition → Hospital หรือ Platform view

| ชั้น | หน้าที่ | ข้อบังคับ |
| --- | --- | --- |
| Source read | อ่าน authoritative facts จาก module เจ้าของข้อมูล | เลือกเฉพาะ fields ที่จำเป็น; ไม่ย้าย write ownership |
| Scope resolution | ยืนยัน actor, capability, grant และ Hospital/relationship/Program scope ที่ server | ใช้ scope เป็น query predicate ก่อนอ่าน Patient rows; browser locator ไม่ใช่สิทธิ์ |
| Factual projection | คืน shape แบบ typed, read-only, view-specific และแสดง state ของข้อมูลที่ไม่มี/ไม่บันทึก | ไม่เติม clinical derivation, ไม่ join Person ข้าม Hospital และไม่คืน field เกิน allowlist |
| Metric composition | รวม fact ด้วย population, grain, เวลา, denominator และ version ที่อนุมัติ | metric ที่นิยามไม่ครบต้อง withhold; ห้ามซ่อนสูตรใน UI |
| Presentation | แสดง approved projection ตาม Hospital หรือ Platform context | UI ไม่ใช่ authorization boundary; ไม่มี export ในขอบเขตนี้ |

ไม่แก้ accepted ADR-0002 ใน phase นี้. หาก implementation ต้องบันทึกความต่างระหว่าง Platform grant กับ Hospital membership ให้เสนอ ADR amendment แยกเพื่อ review.

## 2. บริบท authorization ที่ต้องคงแยกกัน

| บริบท | Actor และ scope | งานที่ออกแบบได้ | ข้อห้าม |
| --- | --- | --- | --- |
| Exact-Hospital operations/reporting | Role.HOSPITAL ที่มี direct active Hospital OWNER/MEMBER หรือ OSM ที่ผ่าน exact assignment ตาม domain policy; scope คือ Hospital, PatientHospitalRelationship และ Program ที่ policy อนุญาต | Hospital summary และ exact-Hospital reporting หลัง product, privacy และ security gates | Hospital membership ไม่สร้าง Global access; OWNER ไม่ใช่ Platform Admin |
| Global Platform reporting | Role.ADMIN คือ DEMI Platform/System Administrator ตาม GR-REQ-01; grant แยกตาม capability และ scope | non-identifying overview, per-Hospital aggregate; Patient discovery/detail หลัง grant, purpose, field set และ approvals แยก | ADMIN อย่างเดียวไม่ให้ Patient read; ไม่ต้องเป็น Hospital OWNER/MEMBER; governance directory ไม่ใช่ Patient endpoint |
| Hospital Network aggregates | Direct Parent Hospital OWNER ตาม HN-C0/HN-C1 เท่านั้น | aggregate ตาม Parent/direct-child contract หลัง independent gates | ไม่ใช่ Global reporting; hierarchy ไม่ให้ Patient detail; ADMIN อย่างเดียวไม่มี Network Owner capability; HN-M08 คง DEFERRED / NOT AUTHORIZED |

Global Patient drill-down ต้อง resolve Hospital → PatientHospitalRelationship → PatientProgram แล้วตรวจ grant ต่อ resource/field. PatientProfile/Person ที่สัมพันธ์กับ Hospital A และ B ไม่อนุญาตให้ query หรือแสดง relationship ของอีก Hospital โดยอัตโนมัติ.

## 3. Existing modules ที่ควร reuse

| ความรับผิดชอบ | Existing source | ขอบเขตที่ยืนยันได้ / แนวทาง reuse |
| --- | --- | --- |
| Actor และ current role | src/modules/auth/types/actor-context.ts; src/modules/auth/services/actor-context-service.ts; src/modules/auth/policies/authorization.ts | ActorContext resolve ฝั่ง server; Role.ADMIN เป็น platform role. โหลด context ครั้งเดียวไม่รับประกัน revocation ระหว่าง request |
| Hospital/Patient directory | src/modules/patient-directory/services/patient-directory-query-service.ts | direct Hospital/OSM-scoped list/detail; ไม่ใช่ Global directory และห้ามขยายสิทธิ์เพียงเปลี่ยน caller เป็น ADMIN |
| Hospital governance | src/modules/hospital-governance/services/hospital-governance-service.ts | ADMIN ใช้จัดการ Hospital directory/governance; ไม่ใช่ Patient reporting source |
| Patient import | src/modules/patient-provisioning/import/ และ services/patient-roster-import-service.ts, patient-provisioning-service.ts | canonical import รองรับ Patient core, Initial Baseline, RISK/DIABETES และ OSM assignment ตาม gates; template 28 columns ไม่ได้แปลว่าทุก field persist; import ไม่เปิด Program |
| Baseline/classification/OSM | src/modules/patient-baseline/services/patient-baseline-query-service.ts; src/modules/patient-classification/services/patient-classification-query-service.ts; src/modules/patient-assignment/services/patient-osm-assignment-query-service.ts | authoritative module reads; classification count เป็น exact-Hospital relationship rows ไม่ใช่ Global population หรือ Program count |
| Program และ Service 1 | src/modules/patient-program/services/patient-program-query-service.ts และ patient-program-service-one-query-service.ts | Program สร้างแยกจาก import; Service 1 เป็น factual record presence |
| Goal Plan/Follow-up/Final | src/modules/goals/services/goal-query-service.ts; src/modules/followups/services/followup-query-service.ts; src/modules/patient-final-assessment/services/patient-final-assessment-query-service.ts | authoritative reads ที่มี domain policies; ประกอบผ่าน reporting projection ไม่ query ซ้ำใน UI |
| Exact-Program report | src/modules/reporting/services/program-report-query-service.ts; projections/program-report-projection.ts; services/program-report-access-service.ts; policies/program-report-policy.ts | มี read-only ProgramReportingProjection, exact relationship + Program และ bounded pages. report:program:read ไม่ใช่ cohort, Global หรือ export permission |
| Audit | src/modules/audit/services/audit-service.ts; src/modules/audit/schemas/audit-schemas.ts | มี validated audit write seam; ยังไม่พบ Global reporting read-event implementation หรือ retention/access contract |

Reuse เฉพาะความรับผิดชอบที่ตรงกัน: ActorContext, domain queries/services และ exact Program projection. ห้าม reuse Hospital OWNER governance check หรือ exact Program capability เพื่อสร้าง Global patient access.

## 4. View/query contracts ที่เสนอ

ชื่อต่อไปนี้เป็น design contract เท่านั้น ไม่ได้สร้าง DTO หรือ endpoint.

| Consumer | Query contract | Projection boundary |
| --- | --- | --- |
| Hospital Summary | exact Hospital scope จาก server; approved population/count definitions และ freshness label | aggregate เท่านั้น; ไม่แอบคืน Patient rows |
| Hospital reporting list | Hospital predicate ก่อน query; approved row grain/status/time filters; stable pagination | สื่อชัดว่า row เป็น relationship หรือ Program; Patient fields/navigation ต้องมี disclosure approval |
| Exact Patient/Program report | reuse exact relationship + exact Program access และ factual semantics ของ projection ปัจจุบัน | แยก fact จาก MISSING/NOT_RECORDED; ไม่มี clinical score โดยนัย |
| Global Overview | Role.ADMIN และ explicit summary grant; approved eligible Hospital population | aggregate only; ห้าม Patient ID/name/raw row |
| Global Hospital Comparison | Hospital set จาก server-resolved grant; metric key/definition/version เดียวกับ Hospital Summary | aggregate ต่อ Hospital; ห้าม hierarchy inheritance หรือ dimension ที่ยังไม่อนุมัติ |
| Global Patient Discovery | แยก capability, Hospital set, identifier/search rule, limits, audit และ abuse controls | เฉพาะ directory fields ที่อนุมัติ; ambiguous identity ห้าม auto-join |
| Global Patient/Program Detail | Role.ADMIN + specific grant + purpose + exact resource ownership + field allowlist | exact scoped factual projection; ไม่ join Person เพื่อขยาย scope; no mutation/attachment/export |

Query ต้องเป็น server-side application/query service ที่รับ validated filters และ scope จาก authoritative actor/grant. Browser filter เป็น locator เท่านั้น. ใช้ Prisma/PostgreSQL patterns และ explicit selects; ไม่มี evidence ให้เสนอ warehouse, CQRS หรือ ORM replacement.

เมื่อนำไป implement ต้องตรวจ authorization ทุก future page/data loader และทุก server action/API boundary ที่เพิ่ม, application service, database scope predicate และ field projection/serialization. UI visibility ไม่ทดแทน server decision.

## 5. Dashboard information architecture

### Hospital Dashboard

Hospital Summary → Hospital Program/Patient Reporting List → Exact Patient/Program Factual Report

- Summary แสดงเฉพาะ approved population และ metric definitions.
- List ต้องมี row grain, inclusion/status, search fields, ordering, pagination, null/withheld display และ Patient disclosure ที่ตัดสินแล้ว.
- Detail reuse existing exact Program report semantics ได้ แต่ workbook compatibility ไม่ใช่ approval ให้แสดงทุก field.
- แยก readability/layout, source availability, metric meaning, disclosure, query bounds และ RPT-24 export authorization.

### Global Platform Admin Dashboard

Global Overview → Hospital Comparison → Hospital Context

Global Patient Discovery → exact Hospital/relationship → Patient/Program Detail

- Overview/comparison เป็น aggregate contracts และใช้ metric definition/version ร่วมกันเมื่อ population ที่อนุมัติเทียบกันได้.
- Hospital Context ไม่ขยาย scope เกิน server-resolved grant.
- Patient Discovery/Detail เป็น future navigation shape เท่านั้น; ยัง SECURITY_PRIVACY_BLOCKED.
- ก่อนสร้าง discovery ต้องตัดสิน exact/partial matching, name/National ID search, minimum identity fields, page/query bounds, rate/abuse control, ambiguity, cross-Hospital correlation และ audit. ห้ามสมมติ unrestricted free-text/National ID search, implicit Person correlation, governance-directory reuse หรือ Global download/export.

## 6. Query, pagination, consistency และ freshness

- Existing Program report page จำกัด Goal Plan/Follow-up เริ่มต้น 20, สูงสุด 50 และมี cursor ordering; เป็น precedent สำหรับ bounded reads ไม่ใช่ approved Hospital/global list contract.
- Hospital/Global lists ต้องกำหนด stable order และ cursor ที่ผูก scope/filter/version; reauthorize ทุก page. จำกัด scope ก่อน query ไม่ใช่อ่านทุก Patient แล้วค่อยกรอง.
- ป้องกัน N+1 ด้วย bounded relations/select; วัดจริงก่อนเปลี่ยน query strategy. ไม่กำหนด performance target โดยไม่มี baseline.
- Count/list อาจเห็น database คนละเวลา; กำหนด freshness/as-of semantics และ handling ของ reimport, correction, reassignment, status update.
- Program report อ่าน access, Program และ child sources หลาย operation; การรับ TransactionClient ไม่พิสูจน์ว่าผู้เรียกเปิด transaction หรือได้ coherent snapshot. ห้ามอ้างว่าเป็น atomic snapshot.
- Dashboard freshness timestamp ไม่เท่ากับ RPT-24 requestedAt, coherent dataAsOf/snapshot และ generatedAt. RPT-24C ต้องปิดก่อน export; ไม่มี XLSX/CSV/bulk response.
- Sensitive Patient responses ต้องไม่แชร์ cache ข้าม actor/grant/Hospital. ทบทวน private/no-store, cache key/invalidation, prefetch/back-forward และ stale-session behavior.
- Revoke อาจเกิดหลัง decision, ระหว่าง reads หรือก่อน delivery. Security/Architecture/DB ต้องกำหนด revalidation/read-boundary contract; phase นี้ไม่เลือก isolation level หรืออ้างว่ากำจัด TOCTOU.

## 7. Readiness และ decision gates

| หัวข้อ | สถานะ |
| --- | --- |
| Hospital Dashboard product direction | OWNER_RECEIVED; cohort และ Patient field disclosure ยัง open |
| Global Platform Admin direction | OWNER_RECEIVED; actor คือ Role.ADMIN แต่ Global policy ยัง proposed |
| Global summary/comparison | READY_FOR_DESIGN_REVIEW เท่านั้น; population, metric, small-cell และ authorization ยัง open |
| Global Patient discovery/identity/detail | SECURITY_PRIVACY_BLOCKED; GR-SEC-01–19 OPEN; Role.ADMIN alone denies Patient read |
| Workbook semantics | R24A-D01–D15 PROPOSED FOR REQUESTER / CUSTOMER REVIEW |
| Business/clinical meaning | BR-01–BR-08 และ CL-01–CL-07 pending/open; ไม่มี formula ที่อนุมัติ |
| Export | RPT-24C gates OPEN; ไม่มี export implementation |
| Network | HN-M07 และ historical reparent disclosure OPEN; HN-M08 DEFERRED / NOT AUTHORIZED |
| Runtime work | NOT AUTHORIZED |

ต้องมี decision evidence ตาม [readiness roadmap](./PHASE_18C2_IMPLEMENTATION_READINESS_ROADMAP.md), relevant R24A/BR/CL closure, independent Security/Privacy/Data Controller approval, architecture review และ implementation authorization. การปิด Phase นี้ไม่เปิด permission ใหม่.

## 8. References

- [DEMI architecture baseline](../architecture/DEMI_ARCHITECTURE_BASELINE.md), [ADR-0002](../adr/0002-role-capability-scope-authorization.md), [Prisma schema](../../prisma/schema.prisma)
- [Phase 15E.1 projection foundation](./PHASE_15E1_PROGRAM_REPORTING_PROJECTION_FOUNDATION.md), [Phase 15E.2 factual report integration](./PHASE_15E2_PROGRAM_FACTUAL_REPORT_UI_INTEGRATION.md)
- [Phase 18B field gap verification](./PHASE_18B_EXCEL_DATA_GAP_VERIFICATION.md), [Phase 18C.1A product reconciliation](./PHASE_18C1A_GLOBAL_REPORTING_REQUIREMENT_RECONCILIATION.md)
- [Phase 18C.1B security contract](./PHASE_18C1B_GLOBAL_REPORTING_SECURITY_CONTRACT.md), [decision register](./PHASE_18C1B_SECURITY_DECISION_REGISTER.md), [acceptance matrix](./PHASE_18C1B_SECURITY_ACCEPTANCE_MATRIX.md)
- [RPT-24 export contract](./PHASE_17_RPT24_ON_DEMAND_ASOF_EXCEL_EXPORT_CONTRACT.md), [RPT-24A workbook decisions](./PHASE_17_RPT24A_CUSTOMER_WORKBOOK_DECISION_PACK.md), [HN-C0 closeout](./PHASE_17K0B_HN_OWNER_DECISION_CLOSEOUT.md), [HN-C1 boundary](./PHASE_17K_HNC1_SECURITY_DISCLOSURE_CONTRACT.md)
