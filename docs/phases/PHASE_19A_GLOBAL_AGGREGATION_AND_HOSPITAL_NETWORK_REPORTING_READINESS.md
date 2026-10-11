# DEMI — Phase 19A: Global Aggregation & Hospital Network Reporting Readiness

- **สถานะ:** VERIFIED READINESS REVIEW COMPLETE / GLOBAL และ NETWORK AGGREGATION BLOCKED
- **ขอบเขต:** documentation-only; ไม่มี runtime, schema, migration, seed หรือ provider change
- **ฐานตรวจ:** `main` / `3a15f55ee0e0eeaac0ac7718e20dc195d25a2e71`; working tree สะอาดก่อนเริ่ม
- **ข้อมูลจริง:** ไม่เข้าถึง production หรือ Patient records; อ่าน source, schema, migrations, tests และเอกสารใน repository
- **การอนุมัติ:** เอกสารนี้ไม่ให้ implementation, disclosure, deployment หรือ export authorization

## Verdict

| ความสามารถ | ผล | ขอบเขตที่ตรวจยืนยัน |
| --- | --- | --- |
| Hospital OWNER Dashboard, Service Process และ XLSX | **GO — มีอยู่แล้ว** | exact ACTIVE Hospital ที่ actor เป็น ACTIVE `HOSPITAL` และมี direct ACTIVE OWNER membership; scope หนึ่ง Hospital ต่อ request |
| Platform ADMIN selected-Hospital Dashboard, Service Process และ XLSX | **GO — มีอยู่แล้ว** | ACTIVE user + current database `ADMIN`; เลือก Hospital ACTIVE หนึ่งแห่ง; query และ workbook ยังคง exact-Hospital |
| Organizational hierarchy directory | **GO — มีอยู่แล้ว** | แสดงโครงสร้าง/สถานะ Hospital ตาม policy ของ directory; เป็นข้อมูลจัดองค์กร ไม่ใช่ Patient/Program aggregation |
| P/C/N structural scope resolution | **GO — มีอยู่บางส่วน** | `resolveHospitalNetworkScope()` ตรวจ Parent OWNER ปัจจุบันและคืน Parent, ACTIVE direct children, Network IDs; ยังไม่ใช่ reporting permission หรือ report query |
| Global Patient/Program aggregation หรือ per-Hospital comparison | **BLOCKED** | ไม่มี global metrics projection; `statusCounts` ใน directory เป็นจำนวน Hospital แยกสถานะเท่านั้น |
| Parent/Child Network metrics และ child aggregate breakdown | **BLOCKED** | ไม่มี aggregate query, Network reporting DTO, dashboard หรือ disclosure contract ที่ผ่าน gate |
| Network-specific reporting authorization/disclosure | **BLOCKED — มีเพียง structural scope foundation** | ยังไม่มี report capability/policy, M07 suppression, temporal attribution contract หรือ release controls |
| Network Export | **DEFERRED / NOT AUTHORIZED** | HN-M08; ห้ามอนุมานสิทธิ์จาก Hospital หรือ Global export |
| Global Patient discovery/detail | **OUT OF SCOPE / SECURITY-PRIVACY GATED** | Role.ADMIN และ selected-Hospital report ไม่ให้ cross-Hospital discovery หรือ exact-Program detail |

`GO` ในตารางหมายถึงความสามารถเดิมที่มีใน source ไม่ใช่การอนุญาตให้ขยาย scope ใน Phase 19A. ไม่มีความสามารถ aggregation ใหม่ที่ได้ GO สำหรับ implementation.

## 1. หลักฐานและสถานะของเอกสาร

### 1.1 หลักฐานจาก repository ปัจจุบัน

1. `src/modules/reporting/policies/hospital-report-policy.ts` แยก dashboard, row และ export capabilities ของ OWNER; access service ตรวจ current User, role, membership และ Hospital. Query service จำกัด PatientProgram ด้วย Hospital ID เดียวและมี projection ที่มี Patient identity/clinical facts ตามรายงาน exact-Hospital เดิม. Global ADMIN เรียก query path เดียวกันผ่าน operation แยก ไม่ได้เปลี่ยน predicate เป็นหลาย Hospital. ดู [policy](../../src/modules/reporting/policies/hospital-report-policy.ts), [query service](../../src/modules/reporting/services/hospital-report-query-service.ts#L586) และ [projection](../../src/modules/reporting/projections/hospital-report-projection.ts).
2. `src/modules/reporting/policies/global-reporting-policy.ts` มี workspace, directory, selected-Hospital read และ selected-Hospital export; access service ตรวจสถานะ User/Role.ADMIN ปัจจุบันและ Hospital เป้าหมาย. `GlobalReportingDirectory` มี hierarchy และจำนวน Hospital ตามสถานะ ไม่ได้มี Patient หรือ Program metrics. ดู [Global policy](../../src/modules/reporting/policies/global-reporting-policy.ts), [access](../../src/modules/reporting/services/global-reporting-access-service.ts) และ [directory service](../../src/modules/reporting/services/global-reporting-service.ts).
3. `src/modules/hospital-hierarchy/services/hospital-hierarchy-service.ts` มี `resolveHospitalNetworkScope()`: อาศัย exact direct Parent OWNER policy, Parent ACTIVE, hierarchy ปัจจุบันที่ไม่ผิดรูป และกรอง C เป็น ACTIVE direct children. `tests/integration/hospital-hierarchy.integration.test.ts` ยืนยัน P/C/N, ตัด grandchild/non-ACTIVE child, ปฏิเสธ ADMIN/child-only/inactive actor และแสดงว่า reparent ย้าย current C scope จาก Parent เดิมไป Parent ใหม่. Helper นี้ไม่มี metric, privacy check หรือ historical eligibility. ดู [resolver](../../src/modules/hospital-hierarchy/services/hospital-hierarchy-service.ts#L462) และ [integration evidence](../../tests/integration/hospital-hierarchy.integration.test.ts#L316).
4. `tests/integration/hospital-reporting.integration.test.ts` ยืนยัน Global ADMIN อ่านและส่งออกเฉพาะ Hospital ที่เลือก; record ของ Parent/sibling ไม่เข้า report ของ child, ADMIN ไม่มี exact-Program report access และ Parent OWNER ไม่ได้ Global ADMIN access. Test ยังครอบคลุมการเพิกถอน ADMIN ก่อนปล่อย workbook. ดู [integration evidence](../../tests/integration/hospital-reporting.integration.test.ts#L677).
5. `prisma/schema.prisma` เก็บ `Hospital.parentHospitalId` และ `updatedAt` เป็นสถานะปัจจุบัน; ไม่พบ effective-dated parent history. `reconcileHospitalMaster()` เปลี่ยน `parentHospitalId` ได้เมื่อยืนยันการแก้ parent. `PatientHospitalRelationship` ไม่มี lifecycle status; `PatientClassification` มี current row และ history table แยก; Membership/OSM relationship มี current status; Program มี status/start/completion; Follow-up มี nullable Program link และ `recordedAt`. ดู [schema](../../prisma/schema.prisma), [hierarchy migration](../../prisma/migrations/20260813120000_hospital_onboarding/migration.sql) และ [reconciliation](../../src/modules/hospital-hierarchy/services/hospital-master-reconciliation-service.ts#L425).
6. Program reporting ยังคง exact relationship + exact Program policy; ไม่ใช่ cohort permission หรือ Global/Network fallback. ดู [program report policy](../../src/modules/reporting/policies/program-report-policy.ts), [access](../../src/modules/reporting/services/program-report-access-service.ts) และ [integration test](../../tests/integration/program-reporting.integration.test.ts#L425).

การตรวจด้านบนเป็น source inspection ไม่ได้รัน tests ใน Phase 19A. ผลการรันเดิมที่ handoff บันทึกไว้เป็นหลักฐานตามเวลาของ handoff ไม่ใช่การ verify ซ้ำบนเครื่องในรอบนี้.

### 1.2 เอกสารที่มีอำนาจและประเด็นที่ถูก supersede

- [ADR-0010](../adr/0010-production-ready-mvp-and-deployment-neutral-runtime.md), [AGENTS.md](../../AGENTS.md), [PRODUCT.md](../../PRODUCT.md) และ [CONTEXT.md](../CONTEXT.md) กำหนด codebase เดียวที่ production-ready และให้ยึด current decision/implementation เหนือ phase record เก่า.
- [Phase 18D.1 handoff](./PHASE_18D1_HOSPITAL_REPORTING_IMPLEMENTATION_HANDOFF.md) และ [18D.2 handoff](./PHASE_18D2_GLOBAL_ADMIN_REPORTING_IMPLEMENTATION_HANDOFF.md) supersede สถานะเตรียมอนุมัติของเอกสารก่อนหน้า เฉพาะ exact-Hospital OWNER report และ selected-Hospital ADMIN report/export ตามลำดับ. ADR-0010 และ runtime correction ถอด hosting/demo-specific authorization gates; ไม่ได้ขยายข้อมูลข้าม Hospital.
- ข้อเสนอใน [18C.1B security contract](./PHASE_18C1B_GLOBAL_REPORTING_SECURITY_CONTRACT.md), [18C.2 architecture](./PHASE_18C2_REPORTING_ARCHITECTURE_BLUEPRINT.md) และ [18C.2 roadmap](./PHASE_18C2_IMPLEMENTATION_READINESS_ROADMAP.md) ถูก supersede เฉพาะ Global selected-Hospital MVP ที่ implement แล้ว; Global aggregate/comparison และ Patient discovery/detail ยังคงเป็นคนละ capability ที่ไม่อนุมัติ.
- ข้อความใน [HN-C0 closeout](./PHASE_17K0B_HN_OWNER_DECISION_CLOSEOUT.md) ว่า runtime Network scope resolver ยังไม่มี เป็น historical snapshot. โค้ดและ test ปัจจุบันมี structural resolver ตามหัวข้อ 1.1. การเปลี่ยนนี้ไม่ปิด HN-M07, historical disclosure, M03 semantic gate หรือ read-consistency gate.
- [HN-C1 Security & Disclosure Contract](./PHASE_17K_HNC1_SECURITY_DISCLOSURE_CONTRACT.md) และ [Decision Direction Record](./PHASE_17K_HNC1_DECISION_DIRECTION_RECORD.md) ระบุ engineering direction D01–D13 ที่ requester ยืนยัน แต่ยังไม่ใช่ Security/Privacy/Data Controller approval, implementation clearance หรืออนุญาตเปิดเผย aggregate จริง.

## 2. Network data contract ที่สืบทอดจาก HN-C0

ส่วนนี้บันทึก semantics ที่ `OWNER_RECEIVED` แล้วตาม HN-A01–A06 และ HN-M01–M06 โดยไม่เปลี่ยน metric definition. ชื่อ DTO/capability และวิธีใช้จริงยังต้องผ่าน decision gates.

### 2.1 Scope และ eligibility

- **P:** Parent Hospital เป้าหมายหนึ่งแห่ง; ต้องเป็น ACTIVE และ actor ต้องมี User ACTIVE, `Role.HOSPITAL`, direct ACTIVE OWNER membership ของ Parent นั้น.
- **C:** Hospital ที่ `child.parentHospitalId === P.id` เท่านั้น และสถานะ Hospital เป็น ACTIVE. ไม่รวม grandchild, sibling หรือ Hospital อิสระ. Child ที่ไม่ ACTIVE อาจอยู่ใน organizational directory แต่ไม่เป็น metric contributor และห้ามแสดงเป็นค่า 0.
- **N:** P ∪ C. Query ต้อง resolve Hospital IDs จากฐานข้อมูลฝั่ง server. คำนวณ distinct ใหม่ตลอดแต่ละชุด; ห้ามนำค่า unique ของ P และ C มาบวกเป็น N.
- Parent/child hierarchy เป็นขอบเขต Network aggregate เท่านั้น; ไม่ให้ Patient row, identifier, clinical read, child workforce management หรือสิทธิ์แก่ Role.ADMIN โดยลำพัง.

### 2.2 Source tables, grain และ predicates

| ID / basis | Source และ grain | Predicate ที่ต้องใช้ | ขอบเขต/ข้อควรระวัง |
| --- | --- | --- | --- |
| HN-M01 — current snapshot | `PatientHospitalRelationship.id` เป็น relationship count; `patientProfileId` เป็น unique Patient grain | `hospitalId ∈ P/C/N`; นับ `COUNT(id)` และ `COUNT(DISTINCT patientProfileId)` แยกกัน | Relationship ไม่ได้ยืนยัน visit, ongoing care หรือ treatment; ไม่คืนแถว Patient. |
| HN-M02 — current snapshot | current `PatientClassification` ต่อ `PatientProfile` ซึ่ง unique; เชื่อมกับ relationship ที่อยู่ใน scope ก่อน aggregate | นับเฉพาะ `RISK` หรือ `DIABETES`; distinct profile และ classification relationship count แยกกัน | ไม่ map RISK เป็น Pre-DM หรือ DIABETES เป็น clinical diagnosis; ไม่มี classification ที่สาม. Current value เท่านั้น. |
| HN-M03 — current snapshot | `HospitalMembership` และ `OsmHospitalRelationship`, count relationship IDs และ distinct `userId` แยกกัน | จำกัด Hospital set; เฉพาะ ACTIVE relationship ตาม metric | exact User status, role predicate, OWNER/MEMBER inclusion และ inconsistent states ยังรอ formal confirmation. D10 ใน HN-C1 เป็น engineering direction เท่านั้น: Staff เสนอ ACTIVE User + `HOSPITAL` + OWNER/MEMBER; OSM เสนอ ACTIVE User + `OSM` + ACTIVE OSM relationship. ห้ามรวม Staff กับ OSM เป็น unique workforce. |
| HN-M04 — period-based | `PatientProgram` ที่ผูก exact `PatientHospitalRelationship`; episode grain = Program ID, participant grain = profile ID | สถานะ ACTIVE/COMPLETED และ lifecycle overlap กับช่วงรายงาน; completion เป็น exclusive endpoint; ตัด `startedAt = completedAt` ออกจาก metric โดยไม่แก้ record | นับ Program episodes และ unique participants แยกกัน; COMPLETED ไม่ได้แปลว่ารักษาสำเร็จ/มี Final/ทำ Follow-up ครบ. Network unique คำนวณใหม่ทั้งช่วง. |
| HN-M05 — period-based | `PatientFollowup` ที่ผูกกับ exact relationship และ exact Program ตาม composite relation | `patientProgramId IS NOT NULL`; ใช้ `recordedAt` ในช่วงรายงาน; ใช้ exact relationship/Hospital scope | นับ Follow-up IDs และ unique profiles แยกกัน. Legacy null-link ถูก exclude ไม่ backfill; M05 ไม่ใช่ subset ของ M04; `recordedAt` ไม่ใช่เวลาทำกิจกรรมทางคลินิก. |
| HN-M06 — mixed time basis | M01–M03 อ่าน current tables; M04–M05 ใช้ Program lifecycle / Follow-up recording time | M01–M03 เป็น CURRENT_SNAPSHOT; M04–M05 เป็น PERIOD_BASED | การเปลี่ยน period ห้ามเปลี่ยน snapshot metrics. As-of timestamp ไม่สร้าง historical row state หรือ database snapshot โดยตัวมันเอง. |

### 2.3 ปฏิทิน, As-of และสถานะที่เปลี่ยน

- เขตเวลารายงานคือ `Asia/Bangkok`; ผู้ใช้เลือกวันเริ่ม/สิ้นสุดแบบ inclusive แล้วแปลงเป็น absolute half-open interval `[local start midnight, midnight หลัง local end)`. ค่าเริ่มต้นคือ Bangkok Month-to-Date; ช่วงสูงสุด 12 calendar months anchor ด้วยวันเริ่ม ไม่ใช่ 365 วัน; เมื่อเริ่ม 29 ก.พ. ใน leap year ขอบ exclusive ในปีที่ไม่ใช่ leap คือ 1 มี.ค. (จึงรวม 28 ก.พ.). ปฏิเสธ end date ที่อยู่หลัง Bangkok calendar date ปัจจุบัน.
- Server สร้าง authoritative As-of instant เดียวต่อ request; source timestamp หลัง As-of ไม่นับ. T08 ยังไม่ตัดสินว่าจะจัดการ current mutable row ที่เปลี่ยนหลัง As-of อย่างไร และ As-of ไม่ได้ทำให้หลาย query อ่าน DB snapshot เดียวกัน.
- Current `parentHospitalId` ใช้หา direct children; เมื่อ reparent แล้ว scope ปัจจุบันย้ายตาม pointer. ไม่มีหลักฐาน effective-from/effective-to ของ parent-child relation ที่อนุมัติให้ใช้ตัดสินสิทธิ์ย้อนหลัง.
- User, role, OWNER membership, Parent status และ child status ต้องอ่านใหม่จาก authoritative database. Role/membership/User/Parent เปลี่ยนระหว่าง resolve และ response ต้องมี concurrency contract. HN-M03 status predicates ของผู้ถูกนับยังต้องยืนยันแยกจากสิทธิ์ของผู้ขอรายงาน.
- Program lifecycle และ classification ปัจจุบันมี source state; อย่าสร้าง historical-as-of classification, membership หรือ hierarchy จาก `updatedAt`. Classification history ไม่ได้ทดแทน parent-child history.

### 2.4 ขอบเขต DTO ที่เสนอ

ข้อมูลเข้าเช่น Parent ID และวันรายงานเป็น locator/filter เท่านั้น ไม่ใช่ authority. Server-only resolver ต้องสร้าง P/C/N IDs แล้วใช้เป็น query predicate ก่อน aggregate.

DTO ฝั่ง client ในอนาคตควรมีเฉพาะ metric cells ที่อนุมัติ, reporting basis/time metadata และ label ของ Parent/direct child เท่าที่ directory field allowlist อนุมัติ. HN-C1-D02 เสนอ opaque Hospital ID, name, status; `hospitalCode` ยังต้องยืนยัน necessity. Suppressed/unavailable cell ไม่มี numeric value. `DENIED` ไม่ควรอยู่ใน aggregate DTO; transport ส่งข้อความปลอดภัยที่ไม่เป็น existence/cardinality oracle.

ห้าม DTO นี้มี `PatientProfile.id`, Person/name, `hospitalNumber`, PHR/Program/Follow-up IDs, row-level data, clinical measurements, notes, OSM identity, attachment, search result หรือ export link. ใช้ DTO ใหม่สำหรับ aggregate; ห้าม reuse `HospitalReportingPageProjection` หรือ `ProgramReportingProjection` ที่มี Patient/Program rows. Global summary มี population/DTO แยกจาก Network และห้ามใช้ global selected-Hospital projection เป็น summary.

## 3. Security, Privacy และ temporal decision matrix

คำแนะนำด้านล่างเป็น **ข้อเสนอสำหรับอนุมัติ** ไม่ใช่ policy ที่ติดตั้งแล้ว. HN-A01–A06/M01–M06 คงนิยามเดิม; HN-C1 D01–D13 ยังคงเป็น engineering direction ที่รอ authority acceptance.

| ประเด็น | หลักฐาน/สถานะจริง | คำแนะนำและ trade-off | คำตัดสินที่ต้องขอ |
| --- | --- | --- | --- |
| **1. Reparent และ historical disclosure** | `parentHospitalId` เป็น current pointer; reconciliation เปลี่ยน pointer ได้; ไม่มี effective-dated history. HN-A05 ห้าม Parent ใหม่ได้ย้อนหลังและ Parent เก่าเสีย current child scope. HN-C1-D03 requester เลือกแนวทาง Option A (withhold unverifiable history) แต่ยังเป็น OPEN_BLOCKER. | ใช้ fail-closed Option A เป็น release baseline: ถ้าแยก pre-reparent/mixed contribution ที่พิสูจน์ไม่ได้ ให้ withhold affected metric/scope ทั้งก้อน ห้ามคืน 0 หรือใช้ current pointer ย้อนเวลา. ทางเลือก B คืออนุมัติ temporal hierarchy/provenance source สำหรับอนาคต; ต้องมีกติกา cutover และ legacy data, migration แบบ additive และห้าม backfill วันเริ่มที่ไม่มีหลักฐาน. A ปลอดภัย/ไม่มี migration แต่ข้อมูลใช้งานได้น้อย; B ให้ attribution ชัดขึ้นแต่ซับซ้อนและไม่แก้ประวัติที่พิสูจน์ไม่ได้. | Product Owner + source/data owner + Security/Privacy/Data Controller รับรอง Option A และระบุขอบเขต withheld; หรือสั่ง contract แยกเพื่อออกแบบ Option B พร้อม provenance/cutover/legacy handling. ห้ามเปิด aggregate ก่อน. |
| **2. Small-cell, complementary และ repeated-query privacy** | HN-M07 OPEN_BLOCKER; ไม่มีค่า k, algorithm หรือ acceptable risk. ผล P/C/N, child cells, classification, unique/relationship counts และช่วงเวลาทับซ้อนอาจหักลบ/อนุมานกันได้. Global C1A/C1B ระบุ privacy gate แยกเช่นกัน. | อนุมัตินโยบายร่วมที่มี primary suppression ตาม protected unit/grain, complementary suppression ครอบสมการ P+C=N และ linked cells, และ cross-request controls สำหรับ overlapping dates/As-of/child/metric. Rate limit อย่างเดียวไม่พอ. จำกัด dimensions/release cadence ได้แต่ลดความยืดหยุ่นและต้องไม่เปลี่ยน HN-M06 เงียบ ๆ. ไม่กำหนด threshold ใน 19A; ถ้าพิสูจน์ผลปลอดภัยไม่ได้ให้ withhold. | Privacy/Security/Data Controller กำหนด protected unit, threshold/risk tolerance, complementary algorithm, query/release history และผลลัพธ์ของค่า 0/1/rare cell; Product Owner อนุมัติ trade-off ของช่วงวันที่/มิติ. รวม Global aggregate แยกใน decision เดียวกันได้เฉพาะเมื่อระบุ population ของ Global ชัด. |
| **3. Network capabilities และ actor** | HN-A01 รับเฉพาะ ACTIVE User + `HOSPITAL` + direct ACTIVE OWNER ของ ACTIVE Parent. Resolver ปัจจุบันใช้ hierarchy/owner governance scope แต่ไม่มี report capability. HN-C1-D01 เสนอ `network:directory:read`, `network:summary:read`, `network:child-summary:read`; ยังไม่ accepted permission. | เพิ่ม capability/policy สำหรับ Network operation แยกจาก `hospital:report:*`, `global:report:*` และ `report:program:read`. Parent OWNER เป็นผู้มีสิทธิ์ขอ; ADMIN-only, child OWNER, MEMBER, OSM/PATIENT และ hierarchy-only denied. แยก child aggregate permission จาก summary ถ้า owner ต้องการ least privilege. ไม่สร้าง persisted grant framework จนมี requirement จริง. | Product Owner + security authority ยืนยัน capability names, ว่า P/C/N summary และ child breakdown ใช้ capability เดียวหรือแยก, directory field allowlist และ deny semantics. ยืนยัน Role.ADMIN โดยลำพังไม่มี Network authority. |
| **4. Revalidation, revocation และ read consistency** | Hierarchy scope helper rechecks current Parent owner/status; exact reports ใช้ RepeatableRead และ final authorization recheck เป็น precedent. HN-C1-D11 ยัง OPEN เพราะยังไม่กำหนด race contract สำหรับ revoke/reparent/source mutation. | เสนอ transaction เดียวระดับ `RepeatableRead` สำหรับ actor/Parent/child scope และทุก metric query; หลัง projection recheck current actor, role, membership, Parent และ current child scope ก่อน response. Query ใช้ trusted Hospital IDs ใน predicate, private/no-store, ไม่ cache aggregate. On mismatch/error/revocation ให้ abort แบบ non-numeric generic unavailable/denied. นี่ลด race แต่ไม่ถอน response ที่ส่งแล้วและยังมี race หลัง final check; ถ้าต้องการ guarantee แข็งกว่านี้ต้องพิจารณา locking/version scheme. | Product Owner + Architecture/DB/Security อนุมัติ isolation/final-check point, การจัดการ reparent/status ระหว่าง query, ขอบเขต revocation ที่ยอมรับได้ และว่าจำเป็นต้องมี version/lock เพิ่มหรือไม่. |
| **5. Data minimization, audit และ non-leaking errors** | Current OWNER projection มี identity/measurement/Program rows; Global directory มี Hospital labels/status. `AuditEvent` มี validated scalar metadata แต่ schema guard ไม่ใช่ general PHI detector และไม่มี Network audit/retention policy. | สร้าง allowlisted aggregate DTO แยก; log เฉพาะ actor, capability, Parent/child target ที่จำเป็น, request/correlation, time และ outcome; ไม่ log metric value, Patient IDs, search term หรือ response. แยก internal `DENIED`, `TEMPORAL_UNPROVEN`, `PRIVACY_WITHHELD`, `SOURCE_UNAVAILABLE`; map client เป็น generic non-numeric state. ใช้ private/no-store. ความปลอดภัยสูงขึ้นแต่รายละเอียด error สำหรับผู้ใช้น้อยลง. | Security/Privacy/Data Controller กำหนด event/retention/audit reader policy; Product/UX รับรองข้อความ unavailable; ยืนยัน field allowlist ของ Parent/child labels. Failure/audit ไม่ควรเปิดว่า Patient หรือ child มีข้อมูลหรือไม่. |
| **6. Global aggregation is separate** | Global ADMIN MVP มี directory และ selected-Hospital report/export; ไม่มี system-wide Patient/Program aggregate. Global eligible Hospital population, metric definitions, cross-Hospital dedup, grants และ suppression ยังไม่อนุมัติใน 18C.1A/B. | สร้าง Global summary contract แยก actor/scope/DTO จาก HN. ต้องกำหนด eligible Hospital population, distinct identity semantics, metric/time/freshness, suppression และว่า current `Role.ADMIN` ทุกคนหรือเฉพาะผู้ได้รับ approval ใช้ summary ได้. ห้ามบวก selected-Hospital responses หรือ expose through existing `/app/admin/reporting`. | Product Owner/Data Owner กำหนด Global population/metrics; Security/Privacy/Data Controller อนุมัติ permission, privacy, purpose และ audit. ยืนยันว่า ADMIN ที่เข้าถึง selected-H report ไม่ได้ Global aggregate permission โดยอัตโนมัติ. |

## 4. Conditional implementation roadmap — Phase 19B–19D

ทุก slice ด้านล่าง **ยังไม่เริ่มและยังไม่ได้รับ implementation authorization**. เริ่มได้เมื่อ prerequisites ของ slice นั้นปิดด้วย decision evidence; หาก disclosure gate ใดเปิด ให้หยุดก่อน aggregate/query/UI. ไม่มี slice ใดอนุญาต export, unrestricted Global Patient discovery, clinical derivation หรือ historical disclosure.

### Phase 19B.1 — Network authorization และ exact source eligibility

- **Prerequisites:** อนุมัติ D01/D02/D08/D09/D10/D11 ที่เกี่ยวข้อง; ยืนยัน Parent OWNER, child scope, capability split, M03 predicate/label และ denial/revocation contract. Historical/privacy approval ต้องปิดก่อน aggregate exposure.
- **Files/modules ที่คาด:** reuse `src/modules/hospital-hierarchy/services/hospital-hierarchy-service.ts` เฉพาะ current P/C/N structural resolution; reporting-specific policy/access resolver ใน `src/modules/reporting/policies/` และ `services/`; focused policy/service tests. ไม่แก้ exact-Hospital OWNER หรือ Global selected-Hospital policies.
- **Data/migration:** ไม่มี migration หากใช้ User/Role/HospitalMembership/status ปัจจุบัน. หากอนุมัติเก็บ explicit grants, hierarchy effective dates หรือ release history ให้แยก schema/migration review; ไม่มี backfill โดยอนุมาน.
- **Acceptance:** unit + PostgreSQL allow/deny สำหรับ exact active Parent OWNER; deny MEMBER-only, child-only OWNER, ADMIN-only, OSM/PATIENT, inactive User/role/membership/Parent; direct child เท่านั้น; non-ACTIVE child ไม่ contributor; query scope มาจาก DB ไม่ใช่ browser; ไม่มี Patient query/row access.
- **Rollback:** ลบ/ปิด Network reporting entry point และ capability check ใหม่ได้โดยไม่เปลี่ยน exact report. Migration ที่เพิ่ม temporal/grant evidence ต้องมีแผนรักษาหลักฐาน; ห้าม drop/rollback แบบสูญเสีย history.
- **Blockers:** HN-C1 security acceptance, M03 predicate confirmation, D11 concurrency design และ historical/purpose approval ที่จำเป็น.

### Phase 19C.1 — Bounded aggregate query/projection

- **Prerequisites:** 19B.1 ผ่าน; HN-M07 primary/complementary/cross-request policy approved และ testable; HN-A05 attribution ปิด; HN-M03 predicate ปิด; time/As-of/mutable-row/DB-snapshot contract approved. Global query ต้องมี Global population/metric contract แยก.
- **Files/modules ที่คาด:** reporting-owned query/projection/schema ภายใน `src/modules/reporting/{services,projections,schemas}`; query รับเฉพาะ trusted scope ที่ server resolve แล้ว. ใช้ source owner tables โดย `select` เฉพาะ IDs สำหรับ aggregate; ห้าม reuse `HospitalReportingPageProjection` หรือ selected-Hospital export.
- **Data/migration:** none หาก source/schema ปัจจุบันพอและ privacy algorithm ไม่ต้องเก็บ release state. Temporal provenance, suppression release history หรือ grant persistence ต้องมี approved additive migration/data-retention plan ก่อน.
- **Acceptance:** PostgreSQL tests ตรวจ P/C/N distinct re-computation เมื่อ PatientProfile ซ้ำข้าม Hospital; relationship vs unique grains; classification/current states; staff/OSM overlap; Program interval/zero duration; nullable Follow-up link, exact relationship, recordedAt/As-of; suppression closure/differencing; no row/identity/clinical payload. Scope change/revoke during read fail closed.
- **Rollback:** ถอน query/projection และไม่คืนค่า numeric; ไม่มี persisted aggregate to clean. หากมี migration ที่บันทึก provenance/release ต้องรักษา evidence และใช้ approved forward-repair/rollback.
- **Blockers:** M07, D03/D04 historical attribution, D10 M03, D11 read consistency และ audit/retention acceptance.

### Phase 19C.2 — Focused PostgreSQL authorization/privacy tests

- **Prerequisites:** query/policy contract approved และ implementation stable; ใช้ disposable controlled PostgreSQL กับ synthetic fixtures เท่านั้น.
- **Files/modules ที่คาด:** เพิ่ม integration coverage ใน `tests/integration/` สำหรับ reporting/hierarchy; policy/query unit tests ใน `src/modules/reporting/**/*.test.ts`.
- **Data/migration:** fixtures transactionally cleaned; apply only the already approved migrations to test DB. No production data or deployment.
- **Acceptance:** direct/indirect hierarchy, reparent old/new Parent, actor/membership/Hospital transitions, concurrent status changes, P/C/N and overlaps, each primary/complementary cell, repeated/overlapping queries, source after As-of, audit sanitization, safe errors and no Patient rows; tests assert DB predicates and results.
- **Rollback:** test-only files/fixtures are removable; tests never mutate persistent production data.
- **Blockers:** หากไม่มี expected result ที่ authority อนุมัติสำหรับ suppression/reparent/concurrency ห้ามสร้าง assertion ตามการเดาและห้ามผ่านไป consumer.

### Phase 19D.1 — Global summary consumer

- **Prerequisites:** Global population/metric/time contract, distinct scope permission, Privacy/Security/Data Controller decision, field-minimal DTO, audit/failure contract และ Global aggregate query/test ผ่าน.
- **Files/modules ที่คาด:** Global summary policy/query/projection ใน reporting modules แยกจาก selected-Hospital path; UI ที่ `app/app/admin/reporting/` เฉพาะเมื่อ consumer/route ได้รับอนุมัติ; component tests.
- **Data/migration:** ไม่มี migration หากใช้ source counts; approved explicit grant/release ledger อาจต้อง migration แยก. ห้ามยืม selected-Hospital XLSX/report route.
- **Acceptance:** Global page แสดงเฉพาะ approved non-identifying cells; no Patient ID/name/row, explicit unavailable/suppressed state, exact server population predicate, current auth revalidation, audit/no-store, aggregate privacy tests.
- **Rollback:** ถอน Global summary entry/view/query; คง directory และ selected-Hospital report เดิม. Persisted grant/release evidence ไม่ลบทิ้งโดยอัตโนมัติ.
- **Blockers:** global capability assignment (`ADMIN` ทั้งหมดหรือ selected approval), population, metric catalog, cross-Hospital de-dup/privacy, independent approvals.

### Phase 19D.2 — Network Dashboard consumer

- **Prerequisites:** 19B.1 + 19C.1/19C.2 ผ่าน; child label allowlist, mobile/accessibility, no-store และ safe unavailable/denied states approved.
- **Files/modules ที่คาด:** Network reporting page/context/UI ใน `app/app/hospitals/` และ transport/view modules ใน `src/modules/reporting/`; reuse hierarchy directory presentation only for approved labels; no child Patient detail link.
- **Data/migration:** none for UI; any temporal-history or query-release storage remains a separately approved migration.
- **Acceptance:** Parent OWNER sees only P/C/N aggregate, ACTIVE direct-child breakdown allowed by policy; no child patient list or clinical detail; suppressed/temporal-unproven values have no number and are not rendered as zero; current access checked on every server request.
- **Rollback:** remove dashboard route/navigation while retaining exact-Hospital OWNER report; do not add deployment/demo feature gates.
- **Blockers:** unresolved privacy/history decision, capability/label acceptance, unknown hierarchy state, unavailable aggregate consistency.

### Phase 19D.3 — Authenticated browser acceptance

- **Prerequisites:** 19D consumers are complete; authenticated controlled test environment and synthetic accounts for Parent OWNER, child OWNER, MEMBER, ADMIN, inactive actor, plus controlled synthetic database; no production Patient records.
- **Files/modules ที่คาด:** browser acceptance artifacts/test harness approved by project; fix only the responsible reporting page, transport or service module if an observed defect occurs.
- **Data/migration:** use disposable synthetic test DB and only approved test migrations; no provider changes or deployment in this phase.
- **Acceptance:** login → navigation → authorized Global summary and Parent Network Dashboard → suppression/unavailable state → direct child breakdown → denied roles/states → revoke Parent ownership/suspend target during reload. Confirm no Patient row/detail/export route appears; trace result to server authorization and PostgreSQL assertions.
- **Rollback:** failed acceptance blocks release and disables the new consumer path; existing exact-Hospital reports remain available under their established policy.
- **Blockers:** missing controlled environment/credentials, any open authorization/privacy/history approval, any identity/clinical leakage or non-deterministic authorization result.

## 5. Decision requests for the next authorized phase

เพื่อเปิด Phase 19B โดยไม่เปลี่ยนนิยาม HN ที่รับไว้แล้ว ต้องมี decision evidence ตอบอย่างน้อย:

1. **Historical rule:** ratify HN-C1-D03 Option A และระบุ metric/scope ที่ต้อง withhold เมื่อ attribution แยกไม่ได้; หรืออนุมัติ data source/cutover/legacy policy สำหรับทางเลือก temporal history.
2. **Privacy rule:** ระบุ protected unit, threshold/risk acceptance, complementary suppression และขอบเขต cross-request differencing โดยไม่เปลี่ยน HN-M06 เงียบ ๆ.
3. **Authorization:** อนุมัติ capability/scope ของ Network directory, summary, child summary; ยืนยัน direct ACTIVE Parent OWNER, ไม่ให้ ADMIN-only และตัดสินว่า child summary ต้องเป็น capability แยกหรือไม่.
4. **Predicate and consistency:** ยืนยัน M03 Staff/OSM eligibility/labels และอนุมัติ snapshot/revalidation/race behavior ของ User, membership, Parent/child status, reparent และ mutable source rows.
5. **DTO, audit, errors:** ยืนยัน Hospital label allowlist, numeric withheld behavior, sanitized event/retention policy และข้อความภายนอกที่ไม่เปิดเผย existence/cardinality.
6. **Global summary:** ระบุ eligible Hospital set, metric/time/freshness, cross-Hospital dedup, actor permission (ADMIN ทั้งหมดหรือ approval แยก) และ Privacy/Data Controller acceptance. การอนุมัติข้อนี้ไม่เปิด HN และ HN ไม่เปิด Global.

## 6. Verification, assumptions และ references

### ตรวจใน Phase 19A

- อ่านเอกสาร Product/architecture และ phase records ที่อ้างอิงด้านล่าง พร้อม source files, Prisma schema, migration และ reporting/hierarchy/program integration tests.
- ตรวจ HEAD/working tree, source cross-references และความสอดคล้องระหว่าง current code กับ handoff. Test files อ่านแล้วแต่ไม่ได้ execute.
- `npm run test`, full suite, lint, typecheck, build, authenticated browser, production/Patient data access, deployment และ provider changes **ไม่ได้รัน/ดำเนินการ**; เป็น documentation-only review. Phase 18D.2 handoff ระบุว่า authenticated browser acceptance ของ reporting MVP ยังไม่ผ่าน/ไม่ได้ตรวจ.
- Package scripts ไม่มี dedicated markdown/link checker; ลิงก์ภายในของเอกสารใหม่นี้ตรวจด้วย path validation หลังเขียน และตรวจ diff/Thai UTF-8 ก่อนจบ.

### ข้อสมมติ/ข้อเสนอ/เรื่องที่ยังเปิด

- **ข้อเท็จจริง:** อ้างเฉพาะ source/schema/test ที่ลิงก์ในหัวข้อ 1.1 และ working-tree HEAD ข้างต้น.
- **ข้อยุติที่รับไว้:** HN-A01–A06, HN-M01–M06/time จาก HN-C0 เป็น OWNER_RECEIVED semantics; ไม่เท่ากับการอนุญาต runtime/disclosure. ADR-0010 เป็น Accepted.
- **Engineering direction:** HN-C1 D01–D13 และ D03 Option A/D10 predicates เป็นแนวทางที่ requester ยืนยัน แต่ Security/Privacy/Controller authority และ implementation clearance ยัง pending.
- **ข้อเสนอ:** Recommendations ในหัวข้อ 3 และ roadmap ในหัวข้อ 4 เป็น conditional. ไม่ได้สร้าง capability names/threshold/DTO/migration ที่ยอมรับแล้ว.
- **ยังไม่ทราบ:** historical attribution source/cutover, M07 algorithm/threshold, final M03 predicates, DB consistency/revocation guarantee, audit retention, Global population/metrics/actor grant.

### Evidence references

- Product/authority: [AGENTS.md](../../AGENTS.md), [PRODUCT.md](../../PRODUCT.md), [Project Context](../CONTEXT.md), [ADR-0010](../adr/0010-production-ready-mvp-and-deployment-neutral-runtime.md).
- Implemented reporting: [Phase 18D.1 handoff](./PHASE_18D1_HOSPITAL_REPORTING_IMPLEMENTATION_HANDOFF.md), [Phase 18D.2 handoff](./PHASE_18D2_GLOBAL_ADMIN_REPORTING_IMPLEMENTATION_HANDOFF.md), [Hospital report query](../../src/modules/reporting/services/hospital-report-query-service.ts), [Global access policy](../../src/modules/reporting/policies/global-reporting-policy.ts), [Global report page context](../../src/modules/reporting/transport/global-reporting-page-context.ts).
- Reporting architecture/security: [18C.1A reconciliation](./PHASE_18C1A_GLOBAL_REPORTING_REQUIREMENT_RECONCILIATION.md), [18C.1B security contract](./PHASE_18C1B_GLOBAL_REPORTING_SECURITY_CONTRACT.md), [18C.1B decision register](./PHASE_18C1B_SECURITY_DECISION_REGISTER.md), [18C.1B acceptance matrix](./PHASE_18C1B_SECURITY_ACCEPTANCE_MATRIX.md), [18C.2 blueprint](./PHASE_18C2_REPORTING_ARCHITECTURE_BLUEPRINT.md), [18C.2 field/metric catalog](./PHASE_18C2_FIELD_LINEAGE_AND_METRIC_CATALOG.md), [18C.2 roadmap](./PHASE_18C2_IMPLEMENTATION_READINESS_ROADMAP.md).
- Hospital Network: [17K.0B closeout](./PHASE_17K0B_HN_OWNER_DECISION_CLOSEOUT.md), [HN-C1 security/disclosure contract](./PHASE_17K_HNC1_SECURITY_DISCLOSURE_CONTRACT.md), [HN-C1 direction record](./PHASE_17K_HNC1_DECISION_DIRECTION_RECORD.md), [hierarchy service](../../src/modules/hospital-hierarchy/services/hospital-hierarchy-service.ts), [hierarchy PostgreSQL integration](../../tests/integration/hospital-hierarchy.integration.test.ts), [reporting PostgreSQL integration](../../tests/integration/hospital-reporting.integration.test.ts).
- Metric source: [Prisma schema](../../prisma/schema.prisma), [Hospital hierarchy migration](../../prisma/migrations/20260813120000_hospital_onboarding/migration.sql), [Hospital master reconciliation](../../src/modules/hospital-hierarchy/services/hospital-master-reconciliation-service.ts), [Program report policy](../../src/modules/reporting/policies/program-report-policy.ts), [Program reporting PostgreSQL integration](../../tests/integration/program-reporting.integration.test.ts), [Audit schema](../../src/modules/audit/schemas/audit-schemas.ts), [Audit service](../../src/modules/audit/services/audit-service.ts).

**สรุป:** Phase 19A ปิด readiness review ได้; exact-Hospital reporting เดิมยัง GO ตาม contract ปัจจุบัน. Global aggregation และ Network metrics/UI ยัง BLOCKED จน decision/privacy/temporal gates ผ่านและได้รับ authorization แยก. หยุดที่ Phase 19A; ไม่มี runtime implementation.
