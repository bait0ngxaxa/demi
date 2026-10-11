# DEMI — Phase 19A: Global Aggregation & Hospital Network Reporting Readiness

> **Current requirement supersession:** Use [Reporting Access Canonical](../requirements/REPORTING_ACCESS_CANONICAL.md) for current reporting intent. This readiness verdict covers merged Global/Network aggregates only. OR-RPT-01 confirms Parent OWNER per-eligible-Child-Hospital reports as a separate required flow; HN-M07 and historical aggregate attribution do not block that exact-Hospital read. Global merged aggregation and N-only Network reporting are not the primary next delivery.

- **สถานะ:** VERIFIED AGGREGATE READINESS REVIEW COMPLETE / AGGREGATE GATES REMAIN OPEN
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
| Parent OWNER per-Child-Hospital report view | **IMPLEMENTATION GAP — confirmed requirement** | Hierarchy context/Child list exists, but report access and selector remain limited to directly owned Hospital; no Parent-to-Child report grant is implemented |
| Global Patient/Program aggregation หรือ per-Hospital comparison | **BLOCKED / FUTURE_NOT_PRIORITIZED** | ไม่มี global metrics projection; `statusCounts` ใน directory เป็นจำนวน Hospital แยกสถานะเท่านั้น; not an initial requirement |
| Parent/Child Network metrics และ child aggregate breakdown | **BLOCKED / FUTURE_NOT_PRIORITIZED** | ไม่มี aggregate query, Network reporting DTO, dashboard หรือ disclosure contract ที่ผ่าน gate; separate from exact per-Hospital Child report |
| Network aggregate-specific authorization/disclosure | **BLOCKED for aggregates** | ยังไม่มี aggregate capability/policy, M07 suppression, temporal attribution contract หรือ aggregate release controls; this is not a blanket block on exact-Hospital Child reads |
| Network Export | **DEFERRED / NOT AUTHORIZED** | HN-M08; ห้ามอนุมานสิทธิ์จาก Hospital หรือ Global export |
| Global Patient discovery/detail | **OUT OF SCOPE / SECURITY-PRIVACY GATED** | Role.ADMIN และ selected-Hospital report ไม่ให้ cross-Hospital discovery หรือ exact-Program detail |

`GO` ในตารางหมายถึงความสามารถเดิมที่มีใน source ไม่ใช่การอนุญาตให้ขยาย scope ใน Phase 19A. Parent-to-Child per-Hospital access เป็น confirmed business requirement แต่ยังเป็น implementation gap; field-level disclosure decisions ยังคงเปิด. ไม่มีความสามารถ aggregate ใหม่ที่ได้ GO สำหรับ implementation.

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
- ใน HN aggregate contract นี้ Parent/child hierarchy กำหนด aggregate scope เท่านั้น. OR-RPT-01 แยก Parent-to-Child exact-Hospital report access เป็น operation ใหม่ที่ต้อง authorize บน server; มันยังไม่ให้ Patient mutation, child workforce management หรือสิทธิ์แก่ Role.ADMIN โดยลำพัง.

### 2.2 Source tables, grain และ predicates

| ID / basis | Source และ grain | Predicate ที่ต้องใช้ | ขอบเขต/ข้อควรระวัง |
| --- | --- | --- | --- |
| HN-M01 — current snapshot | `PatientHospitalRelationship.id` เป็น relationship count; `patientProfileId` เป็น unique Patient grain | `hospitalId ∈ P/C/N`; นับ `COUNT(id)` และ `COUNT(DISTINCT patientProfileId)` แยกกัน | Relationship ไม่ได้ยืนยัน visit, ongoing care หรือ treatment; ไม่คืนแถว Patient. |
| HN-M02 — current snapshot | current `PatientClassification` ต่อ `PatientProfile` ซึ่ง unique; เชื่อมกับ relationship ที่อยู่ใน scope ก่อน aggregate | นับเฉพาะ `RISK` หรือ `DIABETES`; distinct profile และ classification relationship count แยกกัน | ไม่ map RISK เป็น Pre-DM หรือ DIABETES เป็น clinical diagnosis; ไม่มี classification ที่สาม. Current value เท่านั้น. |
| HN-M03 — current snapshot | `HospitalMembership` และ `OsmHospitalRelationship`, count relationship IDs และ distinct `userId` แยกกัน | จำกัด Hospital set; เฉพาะ ACTIVE relationship ตาม metric | exact User status, role predicate, OWNER/MEMBER inclusion และ inconsistent states ยังรอ formal confirmation. D10 ใน HN-C1 เป็น engineering direction เท่านั้น: Staff เสนอ ACTIVE User + `HOSPITAL` + OWNER/MEMBER; OSM เสนอ ACTIVE User + `OSM` + ACTIVE OSM relationship. ห้ามรวม Staff กับ OSM เป็น unique workforce. |
| HN-M04 — period-based | `PatientProgram` ที่ผูก exact `PatientHospitalRelationship`; episode grain = Program ID, participant grain = profile ID | สถานะ ACTIVE/COMPLETED และ lifecycle overlap กับช่วงรายงาน; completion เป็น exclusive endpoint; ตัด `startedAt = completedAt` ออกจาก metric โดยไม่แก้ record | นับ Program episodes และ unique participants แยกกัน; COMPLETED ไม่ได้แปลว่ารักษาสำเร็จ/มี Final/ทำ Follow-up ครบ. Network unique คำนวณใหม่ทั้งช่วง. |
| HN-M05 — period-based | `PatientFollowup` ที่ผูกกับ exact relationship และ exact Program ตาม composite relation | `patientProgramId IS NOT NULL`; ใช้ `recordedAt` ในช่วงรายงาน; ใช้ exact relationship/Hospital scope | นับ Follow-up IDs และ unique profiles แยกกัน. Legacy null-link ถูก exclude ไม่ backfill; M05 ไม่ใช่ subset ของ M04; `recordedAt` ไม่ใช่เวลาทำกิจกรรมทางคลินิก. |
| HN-M06 — mixed time basis | M01–M03 อ่าน current tables; M04–M05 ใช้ Program lifecycle / Follow-up recording time | M01–M03 เป็น CURRENT_SNAPSHOT; M04–M05 เป็น PERIOD_BASED | การเปลี่ยน period ห้ามเปลี่ยน snapshot metrics. As-of timestamp ไม่สร้าง historical row state หรือ database snapshot โดยตัวมันเอง. |

### 2.3 การรวม scope, grain และ cardinality

HN-A03 กำหนด P, C และ N เป็นสาม aggregate scopes แยกกัน โดย N คือ union ของ Hospital ที่ eligible ใน P ∪ C. การรวมค่า P/C เป็น N ใช้ได้เฉพาะเมื่อ metric และ source grain รองรับ ไม่ใช่กฎทั่วไป.

- **Additive source-record counts:** เช่น HN-M01 `relationshipCount` จะใช้ `N.relationshipCount = P.relationshipCount + C.relationshipCount` ได้ก็ต่อเมื่อ source records ของ P และ C เป็น ownership partitions ที่ไม่ทับกัน และ joins ไม่ทำให้ record ที่ grain นั้นถูกนับซ้ำ. หากพิสูจน์ partition/ความไม่ซ้ำไม่ได้ ห้ามสมมติว่าบวกได้; aggregate บน union ที่ scope ถูกต้องและรักษา source-record grain เช่นนับ distinct source ID.
- **Distinct identity counts:** คำนวณ set ของ identity ใหม่บน union ทั้งหมด: `N.unique = |P_unique ∪ C_unique|`. เขียนได้เทียบเท่า `N.unique = P.unique + C.unique - |P_unique ∩ C_unique|`. ห้ามถือว่า intersection เป็นศูนย์ เว้นแต่ source-backed invariant พิสูจน์ว่า populations ทับกันไม่ได้. การคำนวณ intersection ภายในไม่ได้อนุญาตให้เปิดเผยหรืออนุมานว่าการเผยแพร่ค่านั้นได้รับอนุญาต.
- **การทดสอบความถูกต้อง:** ใช้ metric-specific grain และ distinct semantics; Patient/User ที่สัมพันธ์กับหลาย Hospital อาจอยู่ใน unique sets มากกว่าหนึ่ง scope. ห้ามบวก unique ของ P/C เพื่อสร้าง N และห้ามให้ join fan-out เพิ่ม record count.

### 2.4 แนวทาง database-native aggregation ในอนาคต

แนวทางนี้เป็น design expectation สำหรับ implementation ที่ได้รับอนุญาตในอนาคต; Phase 19A ไม่ได้เพิ่ม query/service/SQL/migration และไม่ได้ benchmark หรือยืนยัน query plan ใด.

- ให้ PostgreSQL ทำ aggregation ใกล้แหล่งข้อมูล โดยใช้ `COUNT`, `COUNT(DISTINCT ...)` และ scoped `GROUP BY` ตามความเหมาะสมของ metric. ใช้ typed Prisma aggregation/grouping เมื่อแสดง predicates และ grain ที่ต้องการได้ครบ; ไม่บังคับ raw SQL.
- ใช้ exact Hospital ID predicate ที่ server อนุญาตกับทุก source ก่อน aggregate; browser input เป็นเพียง locator/filter. คำนวณ P, C และ N แยกด้วย source predicate และ semantics ที่อนุมัติ.
- รักษา metric-specific source grain และ distinct identity semantics. ป้องกัน join fan-out โดยนับ source ID ที่ grain ถูกต้อง/แยก aggregate ตามความจำเป็น; ห้ามแก้ผลผิดด้วยการบวก aggregate ที่ grain ต่างกัน.
- หลีกเลี่ยง unbounded `findMany()` ที่ดึง Patient, relationship, workforce, Program หรือ Follow-up IDs ทั้งชุดเข้า Node.js เพียงเพื่อ count. หลีกเลี่ยง materializing source datasets ใน application memory เมื่อ database-native aggregation ให้ผลตาม contract ได้.
- ใช้ query/service เดิมเฉพาะเมื่อ authorization scope, data semantics และ row/aggregate boundary ตรงกันจริง. DTO ผลลัพธ์ต้องเป็น allowlisted, minimal, aggregate-only ตามหัวข้อ 2.6.
- เมื่อ implementation ได้รับอนุญาต ให้พิจารณา indexes, query plans, transaction boundaries และ consistency contract ร่วมกัน; อย่าสรุปว่า query มีประสิทธิภาพหรือ consistency ถูกต้องจนกว่าจะมีหลักฐานการรัน/ตรวจสอบ.

### 2.5 ปฏิทิน, As-of และสถานะที่เปลี่ยน

- เขตเวลารายงานคือ `Asia/Bangkok`; ผู้ใช้เลือกวันเริ่ม/สิ้นสุดแบบ inclusive แล้วแปลงเป็น absolute half-open interval `[local start midnight, midnight หลัง local end)`. ค่าเริ่มต้นคือ Bangkok Month-to-Date; ช่วงสูงสุด 12 calendar months anchor ด้วยวันเริ่ม ไม่ใช่ 365 วัน; เมื่อเริ่ม 29 ก.พ. ใน leap year ขอบ exclusive ในปีที่ไม่ใช่ leap คือ 1 มี.ค. (จึงรวม 28 ก.พ.). ปฏิเสธ end date ที่อยู่หลัง Bangkok calendar date ปัจจุบัน.
- Server สร้าง authoritative As-of instant เดียวต่อ request; source timestamp หลัง As-of ไม่นับ. T08 ยังไม่ตัดสินว่าจะจัดการ current mutable row ที่เปลี่ยนหลัง As-of อย่างไร และ As-of ไม่ได้ทำให้หลาย query อ่าน DB snapshot เดียวกัน.
- Current `parentHospitalId` ใช้หา direct children; เมื่อ reparent แล้ว scope ปัจจุบันย้ายตาม pointer. ไม่มีหลักฐาน effective-from/effective-to ของ parent-child relation ที่อนุมัติให้ใช้ตัดสินสิทธิ์ย้อนหลัง.
- User, role, OWNER membership, Parent status และ child status ต้องอ่านใหม่จาก authoritative database. Role/membership/User/Parent เปลี่ยนระหว่าง resolve และ response ต้องมี concurrency contract. HN-M03 status predicates ของผู้ถูกนับยังต้องยืนยันแยกจากสิทธิ์ของผู้ขอรายงาน.
- Program lifecycle และ classification ปัจจุบันมี source state; อย่าสร้าง historical-as-of classification, membership หรือ hierarchy จาก `updatedAt`. Classification history ไม่ได้ทดแทน parent-child history.

### 2.6 ขอบเขต DTO ที่เสนอ

ข้อมูลเข้าเช่น Parent ID และวันรายงานเป็น locator/filter เท่านั้น ไม่ใช่ authority. Server-only resolver ต้องสร้าง P/C/N IDs แล้วใช้เป็น query predicate ก่อน aggregate.

DTO ฝั่ง client ในอนาคตควรมีเฉพาะ metric cells ที่อนุมัติ, reporting basis/time metadata และ label ของ Parent/direct child เท่าที่ directory field allowlist อนุมัติ. HN-C1-D02 เสนอ opaque Hospital ID, name, status; `hospitalCode` ยังต้องยืนยัน necessity. Suppressed/unavailable cell ไม่มี numeric value. `DENIED` ไม่ควรอยู่ใน aggregate DTO; transport ส่งข้อความปลอดภัยที่ไม่เป็น existence/cardinality oracle.

ห้าม DTO นี้มี `PatientProfile.id`, Person/name, `hospitalNumber`, PHR/Program/Follow-up IDs, row-level data, clinical measurements, notes, OSM identity, attachment, search result หรือ export link. ใช้ DTO ใหม่สำหรับ aggregate; ห้าม reuse `HospitalReportingPageProjection` หรือ `ProgramReportingProjection` ที่มี Patient/Program rows. Global summary มี population/DTO แยกจาก Network และห้ามใช้ global selected-Hospital projection เป็น summary.

## 3. Security, Privacy และ temporal decision matrix

คำแนะนำด้านล่างเป็น **ข้อเสนอสำหรับอนุมัติ** ไม่ใช่ policy ที่ติดตั้งแล้ว. HN-A01–A06/M01–M06 คงนิยามเดิม; HN-C1 D01–D13 ยังคงเป็น engineering direction ที่รอ authority acceptance.

| ประเด็น | หลักฐาน/สถานะจริง | คำแนะนำและ trade-off | คำตัดสินที่ต้องขอ |
| --- | --- | --- | --- |
| **1. Reparent และ historical disclosure** | `parentHospitalId` เป็น current pointer; reconciliation เปลี่ยน pointer ได้; ไม่มี effective-dated history. HN-A05 ห้าม Parent ใหม่ได้ย้อนหลังและ Parent เก่าเสีย current child scope. HN-C1-D03 requester เลือกแนวทาง Option A (withhold unverifiable history) แต่ยังเป็น OPEN_BLOCKER. | ใช้ fail-closed Option A เป็น release baseline: ถ้าแยก pre-reparent/mixed contribution ที่พิสูจน์ไม่ได้ ให้ withhold affected metric/scope ทั้งก้อน ห้ามคืน 0 หรือใช้ current pointer ย้อนเวลา. ทางเลือก B คืออนุมัติ temporal hierarchy/provenance source สำหรับอนาคต; ต้องมีกติกา cutover และ legacy data, migration แบบ additive และห้าม backfill วันเริ่มที่ไม่มีหลักฐาน. A ปลอดภัย/ไม่มี migration แต่ข้อมูลใช้งานได้น้อย; B ให้ attribution ชัดขึ้นแต่ซับซ้อนและไม่แก้ประวัติที่พิสูจน์ไม่ได้. | Product Owner + source/data owner + Security/Privacy/Data Controller รับรอง Option A และระบุขอบเขต withheld; หรือสั่ง contract แยกเพื่อออกแบบ Option B พร้อม provenance/cutover/legacy handling. ห้ามเปิด aggregate ก่อน. |
| **2. Small-cell, complementary และ repeated-query privacy** | HN-M07 OPEN_BLOCKER; ไม่มีค่า k, algorithm หรือ acceptable risk. P/C/N, child cells, linked metrics และช่วงเวลาทับซ้อนอาจเปิดเผยข้อมูลด้วย arithmetic reconstruction หรือ set-overlap inference. Global C1A/C1B ระบุ privacy gate แยกเช่นกัน. | ออกแบบ primary suppression ตาม protected unit/grain และประเมิน output vector ร่วมกัน: (a) arithmetic reconstruction สำหรับ record counts ที่ additive ได้จริงภายใต้ disjoint ownership partitions และ joins ที่ไม่ duplicate records; (b) overlap inference/reconstruction สำหรับ distinct-identity sets ตาม `N.unique = |P_unique ∪ C_unique|`. ห้ามสมมติ intersection เป็นศูนย์หรือเปิด intersection เพียงเพราะคำนวณได้. รวม linked metrics, direct-child breakdowns และ repeated requests. Per-cell threshold หรือ rate limit อย่างเดียวไม่พอ. จำกัด dimensions/release cadence อาจลดความยืดหยุ่นและห้ามเปลี่ยน HN-M06 เงียบ ๆ. ไม่กำหนด threshold/algorithm ใน 19A; ถ้าความเสี่ยงยังประเมินไม่ได้ให้ withhold. | Privacy/Security/Data Controller กำหนด protected unit, threshold/risk tolerance, complementary method สำหรับ additive arithmetic closure และ distinct-set overlap, linked/child outputs, cross-request history/release policy และผลลัพธ์ของค่า 0/1/rare cell; Product Owner อนุมัติ trade-off ของช่วงวันที่/มิติ. การเปิด Global aggregate ต้องมี population decision แยก. |
| **3. Network capabilities และ actor** | HN-A01 รับเฉพาะ ACTIVE User + `HOSPITAL` + direct ACTIVE OWNER ของ ACTIVE Parent. Resolver ปัจจุบันใช้ hierarchy/owner governance scope แต่ไม่มี report capability. HN-C1-D01 เสนอ `network:directory:read`, `network:summary:read`, `network:child-summary:read`; ยังไม่ accepted permission. | เพิ่ม capability/policy สำหรับ Network operation แยกจาก `hospital:report:*`, `global:report:*` และ `report:program:read`. Parent OWNER เป็นผู้มีสิทธิ์ขอ; ADMIN-only, child OWNER, MEMBER, OSM/PATIENT และ hierarchy-only denied. แยก child aggregate permission จาก summary ถ้า owner ต้องการ least privilege. ไม่สร้าง persisted grant framework จนมี requirement จริง. | Product Owner + security authority ยืนยัน capability names, ว่า P/C/N summary และ child breakdown ใช้ capability เดียวหรือแยก, directory field allowlist และ deny semantics. ยืนยัน Role.ADMIN โดยลำพังไม่มี Network authority. |
| **4. Revalidation, revocation และ read consistency** | Hierarchy scope helper rechecks current Parent owner/status; exact reports ใช้ RepeatableRead และ final authorization recheck เป็น precedent. HN-C1-D11 ยัง OPEN เพราะยังไม่กำหนด race contract สำหรับ revoke/reparent/source mutation. | เสนอ transaction เดียวระดับ `RepeatableRead` สำหรับ actor/Parent/child scope และทุก metric query; หลัง projection recheck current actor, role, membership, Parent และ current child scope ก่อน response. Query ใช้ trusted Hospital IDs ใน predicate, private/no-store, ไม่ cache aggregate. On mismatch/error/revocation ให้ abort แบบ non-numeric generic unavailable/denied. นี่ลด race แต่ไม่ถอน response ที่ส่งแล้วและยังมี race หลัง final check; ถ้าต้องการ guarantee แข็งกว่านี้ต้องพิจารณา locking/version scheme. | Product Owner + Architecture/DB/Security อนุมัติ isolation/final-check point, การจัดการ reparent/status ระหว่าง query, ขอบเขต revocation ที่ยอมรับได้ และว่าจำเป็นต้องมี version/lock เพิ่มหรือไม่. |
| **5. Data minimization, audit และ non-leaking errors** | Current OWNER projection มี identity/measurement/Program rows; Global directory มี Hospital labels/status. `AuditEvent` มี validated scalar metadata แต่ schema guard ไม่ใช่ general PHI detector และไม่มี Network audit/retention policy. | สร้าง allowlisted aggregate DTO แยก; log เฉพาะ actor, capability, Parent/child target ที่จำเป็น, request/correlation, time และ outcome; ไม่ log metric value, Patient IDs, search term หรือ response. แยก internal `DENIED`, `TEMPORAL_UNPROVEN`, `PRIVACY_WITHHELD`, `SOURCE_UNAVAILABLE`; map client เป็น generic non-numeric state. ใช้ private/no-store. ความปลอดภัยสูงขึ้นแต่รายละเอียด error สำหรับผู้ใช้น้อยลง. | Security/Privacy/Data Controller กำหนด event/retention/audit reader policy; Product/UX รับรองข้อความ unavailable; ยืนยัน field allowlist ของ Parent/child labels. Failure/audit ไม่ควรเปิดว่า Patient หรือ child มีข้อมูลหรือไม่. |
| **6. Global aggregation is separate** | Global ADMIN MVP มี directory และ selected-Hospital report/export; ไม่มี system-wide Patient/Program aggregate. Global eligible Hospital population, metric definitions, cross-Hospital dedup, grants และ suppression ยังไม่อนุมัติใน 18C.1A/B. | สร้าง Global summary contract แยก actor/scope/DTO จาก HN. ต้องกำหนด eligible Hospital population, distinct identity semantics, metric/time/freshness, suppression และว่า current `Role.ADMIN` ทุกคนหรือเฉพาะผู้ได้รับ approval ใช้ summary ได้. ห้ามบวก selected-Hospital responses หรือ expose through existing `/app/admin/reporting`. | Product Owner/Data Owner กำหนด Global population/metrics; Security/Privacy/Data Controller อนุมัติ permission, privacy, purpose และ audit. ยืนยันว่า ADMIN ที่เข้าถึง selected-H report ไม่ได้ Global aggregate permission โดยอัตโนมัติ. |

## 4. HISTORICAL / SUPERSEDED — DO NOT EXECUTE AS CURRENT ROADMAP — Conditional implementation roadmap, Phase 19B–19D

หัวข้อนี้เป็นแผน aggregate ตามการตีความเดิม ไม่ใช่ลำดับงานปัจจุบัน. ลำดับที่ยืนยันล่าสุดคือ [RPT-NET-01 และ RPT-NET-02 ใน canonical reporting requirements](../requirements/REPORTING_ACCESS_CANONICAL.md#4-ขอบเขต-initial-และ-implementation-priorities): Parent OWNER ต้องเข้าถึงรายงานของ eligible direct Child Hospital แยกเป็นราย Hospital. เก็บ roadmap และ decision gates ด้านล่างไว้เป็นหลักฐานประวัติศาสตร์สำหรับ aggregate work; อย่าใช้เป็น prerequisite ของ per-Hospital reporting. HN-M07 และ historical aggregate attribution ยังคงใช้กับ aggregate disclosure ตามขอบเขตเดิม.

ทุก slice ด้านล่าง **ยังไม่เริ่มและยังไม่ได้รับ implementation authorization**. แต่ละ slice ต้องมี decision evidence จาก Product Owner, Security, Privacy, Data Controller, Data Owner และ Architecture ตามอำนาจ/ประเด็นที่เกี่ยวข้อง; การเรียงลำดับนี้ไม่ปิด gate หรืออนุมัติ runtime. หาก disclosure gate ใดยังเปิด ให้หยุดก่อน aggregate exposure หรือ consumer. ไม่มี slice ใดอนุญาต Network Export, unrestricted Global Patient discovery, clinical derivation หรือ historical disclosure.

### Phase 19B — Authorization & Aggregate Query Foundation

#### 19B.1 — Network authorization and exact source eligibility

- **Prerequisites:** อนุมัติ HN-C1 D01/D02/D08/D09/D10/D11 ที่เกี่ยวข้อง; ยืนยัน direct ACTIVE Parent OWNER, child scope, capability split, M03 predicates/labels และ denial/revocation contract. HN-M07 และ historical attribution ต้องปิดก่อน aggregate exposure.
- **Files/modules ที่คาด:** reuse `src/modules/hospital-hierarchy/services/hospital-hierarchy-service.ts` เฉพาะ current P/C/N structural resolution; reporting-specific policy/access resolver ใน `src/modules/reporting/policies/` และ `services/`; focused policy/service tests. ไม่แก้ exact-Hospital OWNER หรือ Global selected-Hospital policies.
- **Data/migration:** ไม่มี migration หากใช้ User/Role/HospitalMembership/status ปัจจุบัน. หากอนุมัติเก็บ explicit grants, hierarchy effective dates หรือ release history ให้แยก schema/migration review; ไม่มี backfill โดยอนุมาน.
- **Acceptance:** unit + PostgreSQL allow/deny สำหรับ exact active Parent OWNER; deny MEMBER-only, child-only OWNER, ADMIN-only, OSM/PATIENT, inactive User/role/membership/Parent; direct child เท่านั้น; non-ACTIVE child ไม่ contributor; query scope มาจาก DB ไม่ใช่ browser; ไม่มี Patient query/row access.
- **Rollback:** ถอน Network reporting entry point และ capability check ใหม่ได้โดยไม่เปลี่ยน exact report. Migration ที่เพิ่ม temporal/grant evidence ต้องมีแผนรักษาหลักฐาน; ห้าม drop/rollback แบบสูญเสีย history.
- **Blockers:** HN-C1 security acceptance, M03 predicate confirmation, D11 concurrency design และ historical/purpose approval ที่จำเป็น.

#### 19B.2 — Bounded aggregate query and projection

- **Prerequisites:** 19B.1 ผ่าน; HN-M07 primary/complementary/cross-request policy approved และ testable; HN-A05 attribution ปิด; HN-M03 predicates ปิด; time/As-of/mutable-row/DB-snapshot contract approved. Global aggregation ต้องมี population/metric/authorization/disclosure contract แยกก่อนเพิ่ม query ของ Global.
- **Files/modules ที่คาด:** reporting-owned query/projection/schema ภายใน `src/modules/reporting/{services,projections,schemas}`; รับเฉพาะ trusted scope ที่ server resolve แล้ว. ปฏิบัติตาม database-native guidance ในหัวข้อ 2.4: PostgreSQL `COUNT`, `COUNT(DISTINCT ...)`, scoped `GROUP BY` หรือ typed Prisma aggregation เมื่อรักษา predicate/grain ได้ครบ; ไม่บังคับ raw SQL. ห้าม reuse `HospitalReportingPageProjection`, selected-Hospital export หรือ query/service ที่มี scope/data semantics ไม่ตรง.
- **Data/migration:** ไม่มี migration หาก source/schema ปัจจุบันพอและ policy ไม่ต้อง persist release state. Temporal provenance, suppression release history หรือ grant persistence ต้องมี approved additive migration/data-retention plan ก่อน.
- **Acceptance:** PostgreSQL checks สำหรับ exact authorized Hospital predicates; M01 relationship count เทียบ unique Patient grain; additive source counts เฉพาะ disjoint ownership partitions ที่ joins ไม่ duplicate records; N unique คำนวณบน union/DISTINCT และทดสอบ PatientProfile overlap; M02 current classification; M03 Staff/OSM eligibility และ overlap ตาม predicate ที่ยืนยัน; M04 lifecycle interval/zero-duration rule; M05 nullable Program-link exclusion, exact relationship/Program link และ `recordedAt`/As-of; no join fan-out; approved suppression closure/differencing; aggregate-only DTO. การเปลี่ยน scope/revocation ระหว่างอ่านต้อง fail closed ตาม D11 ที่อนุมัติ. เมื่อได้รับอนุญาตให้ตรวจ indexes/query plans และ transaction/consistency behavior โดยไม่อ้าง benchmark หากไม่ได้รัน.
- **Rollback:** ถอน query/projection และไม่คืน numeric result; ไม่มี persisted aggregate ให้ล้าง. หากมี migration ที่เก็บ provenance/release ต้องรักษาหลักฐานและใช้ approved forward-repair/rollback.
- **Blockers:** HN-M07, D03/D04 historical attribution, D10 M03, D11 read consistency และ audit/retention acceptance.

#### 19B.3 — Focused PostgreSQL authorization, data correctness, and privacy regression tests

- **Prerequisites:** authorization/query contracts และ expected outcomes ได้รับอนุมัติ; implementation ใน 19B.1/19B.2 stable; ใช้ disposable controlled PostgreSQL กับ synthetic fixtures เท่านั้น.
- **Files/modules ที่คาด:** integration coverage ใน `tests/integration/` สำหรับ reporting/hierarchy; focused policy/query tests ใน `src/modules/reporting/**/*.test.ts`.
- **Data/migration:** fixtures transactionally cleaned; apply only approved migrations to test DB. No production data or deployment.
- **Acceptance:** direct/indirect hierarchy, reparent old/new Parent, actor/membership/Hospital transitions, concurrent status changes, P/C/N overlaps, additive partition and join fan-out, unique union/intersection cases, each approved primary/complementary outcome, linked metrics/repeated requests, source after As-of, audit sanitization, safe errors and no Patient rows; assert DB predicates and results. Do not invent suppression expected values while policy remains open.
- **Rollback:** test-only files/fixtures are removable; tests use only the disposable synthetic database.
- **Blockers:** หาก authority ยังไม่อนุมัติ expected result สำหรับ suppression/reparent/concurrency ห้ามสร้าง assertion จากการเดาและห้ามผ่านไป Consumer.

### Phase 19C — Reporting Dashboard Consumers

#### 19C.1 — Global Summary Dashboard

- **Prerequisites:** Global eligible population, metrics/time/freshness, distinct semantics, actor permission, disclosure/suppression, field-minimal DTO, audit/failure contract ได้รับอนุมัติแยกจาก HN; Global query/projection ใน 19B.2 และ 19B.3 coverage สำหรับ contract นี้ผ่าน.
- **Files/modules ที่คาด:** Global summary policy/query/projection ใน reporting modules แยกจาก selected-Hospital path; UI ที่ `app/app/admin/reporting/` เฉพาะเมื่อ consumer/route ได้รับอนุมัติ; component tests.
- **Data/migration:** ไม่มี migration หากใช้ source counts; approved explicit grant/release ledger อาจต้อง migration แยก. ห้ามยืม selected-Hospital XLSX/report route.
- **Acceptance:** แสดงเฉพาะ approved non-identifying cells; ไม่มี Patient ID/name/row; มี explicit unavailable/suppressed state; exact server population predicate, current auth revalidation, audit/no-store และ privacy regression coverage.
- **Rollback:** ถอน Global summary entry/view/query; คง directory และ selected-Hospital report เดิม. Persisted grant/release evidence ไม่ลบทิ้งโดยอัตโนมัติ.
- **Blockers:** Global capability assignment (`ADMIN` ทั้งหมดหรือ selected approval), population, metric catalog, cross-Hospital dedup/privacy และ independent approvals.

#### 19C.2 — Hospital Network Dashboard

- **Prerequisites:** 19B.1–19B.3 ผ่าน; HN-M07 และ historical attribution ปิดตาม authority; child label allowlist, mobile/accessibility, no-store และ safe unavailable/denied states approved.
- **Files/modules ที่คาด:** Network reporting page/context/UI ใน `app/app/hospitals/` และ transport/view modules ใน `src/modules/reporting/`; reuse hierarchy directory presentation เฉพาะ approved labels; ไม่มี child Patient detail link.
- **Data/migration:** ไม่มี migration สำหรับ UI; temporal-history หรือ query-release storage ต้องผ่าน migration approval แยก.
- **Acceptance:** Parent OWNER เห็นเฉพาะ approved P/C/N aggregates และ ACTIVE direct-child breakdown ตาม capability; ไม่มี child patient list/clinical detail; suppressed/temporal-unproven cells ไม่มีตัวเลขและไม่แสดงเป็นศูนย์; ตรวจ current access ทุก server request.
- **Rollback:** ถอน Dashboard route/navigation โดยคง exact-Hospital OWNER report; ไม่เพิ่ม deployment/demo feature gates.
- **Blockers:** privacy/history/capability/label decision ที่ยังเปิด, unknown hierarchy state หรือ aggregate consistency ที่ยังไม่อนุมัติ.

### Phase 19D — End-to-End Acceptance & Release Readiness

#### 19D.1 — Authenticated browser acceptance, security/privacy regression, and UAT evidence

- **Prerequisites:** 19C.1 และ 19C.2 ที่ได้รับอนุมัติเสร็จ; controlled authenticated test environment, synthetic Parent OWNER/child OWNER/MEMBER/ADMIN/inactive accounts และ controlled synthetic database; decision gates ที่เกี่ยวข้องปิดแล้ว. ไม่มี production Patient records.
- **Files/modules ที่คาด:** approved browser acceptance artifacts/test harness; แก้เฉพาะ page/transport/service ที่มี defect ซึ่ง acceptance สังเกตได้.
- **Data/migration:** disposable synthetic test DB และ approved test migrations เท่านั้น; ไม่เปลี่ยน providers. Release/deployment authorization แยกต่างหากและไม่ได้รับจาก acceptance slice หรือ Phase 19A.
- **Acceptance:** login → authorized Global Summary และ Network Dashboard → approved suppression/unavailable states → direct-child breakdown → denied roles/states → revoke Parent ownership/suspend target ระหว่าง reload; ตรวจไม่พบ Patient row/detail/export route และเชื่อมผล browser กับ server authorization/PostgreSQL assertions. บันทึก security/privacy regression และ UAT evidence ตามผู้มีอำนาจ.
- **Rollback:** acceptance fail หรือ gate เปิดให้หยุด release และถอน consumer path ใหม่; exact-Hospital reports เดิมคง policy เดิม.
- **Blockers:** controlled environment/credentials หรือ decision approval ขาด; identity/clinical leakage; non-deterministic authorization/privacy result. การผ่าน acceptance ไม่แทน Product Owner/security/privacy/data-controller release approval หรือ deployment authorization.

## 5. HISTORICAL / SUPERSEDED — DO NOT EXECUTE AS CURRENT ROADMAP — Previous decision requests

รายการขอตัดสินด้านล่างจัดทำสำหรับ roadmap aggregate เดิม จึงไม่ใช่คำถามหรือ gate ปัจจุบันสำหรับ RPT-NET-01/02. สำหรับลำดับที่ใช้ปัจจุบัน ให้ดู [RPT-NET-01 และ RPT-NET-02 ใน canonical reporting requirements](../requirements/REPORTING_ACCESS_CANONICAL.md#4-ขอบเขต-initial-และ-implementation-priorities); คำถาม field-level ที่ยังเปิดสำหรับ Parent-to-Child reporting ระบุแยกในเอกสารนั้น. คงรายการเดิมไว้เพื่อ traceability โดยไม่เปลี่ยนสถานะ HN-M07 หรือ decision IDs.

ก่อนพิจารณาเริ่ม slice ที่เกี่ยวข้องใน Phase 19B หรือ Global consumer 19C.1 โดยไม่เปลี่ยนนิยาม HN ที่รับไว้แล้ว ต้องมี decision evidence ตอบอย่างน้อย. การปิดรายการนี้ไม่ใช่ implementation หรือ disclosure authorization:

1. **Historical rule:** ratify HN-C1-D03 Option A และระบุ metric/scope ที่ต้อง withhold เมื่อ attribution แยกไม่ได้; หรืออนุมัติ data source/cutover/legacy policy สำหรับทางเลือก temporal history.
2. **Privacy rule:** ระบุ protected unit และ threshold/risk acceptance; complementary method ต้องครอบ (a) arithmetic reconstruction เฉพาะ additive record counts ที่มี disjoint partitions/no join duplication และ (b) overlap inference/reconstruction สำหรับ distinct identity sets; รวม linked metrics, direct-child breakdowns และ cross-request differencing โดยไม่เปลี่ยน HN-M06 เงียบ ๆ. HN-M07 ยังคง OPEN จนมีการอนุมัติ.
3. **Authorization:** อนุมัติ capability/scope ของ Network directory, summary, child summary; ยืนยัน direct ACTIVE Parent OWNER, ไม่ให้ ADMIN-only และตัดสินว่า child summary ต้องเป็น capability แยกหรือไม่.
4. **Predicate and consistency:** ยืนยัน M03 Staff/OSM eligibility/labels และอนุมัติ snapshot/revalidation/race behavior ของ User, membership, Parent/child status, reparent และ mutable source rows.
5. **DTO, audit, errors:** ยืนยัน Hospital label allowlist, numeric withheld behavior, sanitized event/retention policy และข้อความภายนอกที่ไม่เปิดเผย existence/cardinality.
6. **Global summary (19C.1):** ระบุ eligible Hospital set, metric/time/freshness, cross-Hospital dedup, actor permission (ADMIN ทั้งหมดหรือ approval แยก), query/data contract และ Product Owner/Architecture decision พร้อม Security/Privacy/Data Owner/Data Controller acceptance. การอนุมัตินี้ไม่เปิด HN และ HN ไม่เปิด Global.

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

**สรุปตามขอบเขต Phase 19A:** readiness review นี้ปิดเฉพาะ Global/Network aggregation. Direct exact-Hospital OWNER และ selected-Hospital ADMIN report/export มีอยู่แล้ว; Parent OWNER per-Child-Hospital report เป็น confirmed requirement และยังเป็น implementation gap. Aggregate privacy/temporal gates ยังคงเปิดเฉพาะ aggregate outputs และไม่ block การวางแผน exact-Hospital Child report. Global aggregation เป็น future/not initial scope. ไม่มี runtime implementation ใน Phase 19A.
