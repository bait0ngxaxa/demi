# BF-GAP-WB-03 — Decision Pack: ServiceRequest ↔ downstream record และ OSM acceptance

**Program:** Business Flow Closure Program
**Date:** 2026-10-12 (Asia/Bangkok)
**Analyzed HEAD:** `1a0c1705d24f2c67ba6816e68fd44e3e9ba8459d` (`main`, working tree สะอาดก่อนเริ่มแก้เอกสาร)
**Disposition:** DECISION PACK PREPARED / OWNER DECISIONS PENDING
**Canonical register:** [Business Flow Gap Canonical](../requirements/BUSINESS_FLOW_GAP_CANONICAL.md)
**Primary DoD / pending register:** [BF-GAP-WB-00 §5.2](./BF_GAP_WB_00_WORKBOOK_DOD_CLOSURE_PLAN.md)

เอกสารนี้เตรียมทางเลือกให้ Owner เท่านั้น ไม่อนุมัติ design และไม่ implement runtime/schema/migration/policy/UI/test. ข้อเสนอด้านล่างไม่ใช่ UAT acceptance หรือ production readiness. Workbook เป็น primary DoD ตามทิศทาง Product Owner วันที่ 2026-10-12; capability inventory สนับสนุนการตรวจ flow ไม่ใช่การสั่งเดินครบทุกแถว.

## 1. Current behavior — Canva 02 → 03 → 04 เทียบ runtime

Customer context ที่ผู้ใช้ระบุ: Canva “DEMI App Flow” `DAHW1jWjScY` วาด 01 Onboard → 02 appointment/service request → 03 assign/accept → 04 deliver service → 05 record results → 06 review health plan → 07 next follow-up. Whiteboard “ร่าง DEMI App ใหม่” `DAHSvdQ3gvU` เพิ่มเลือกคัดกรอง/ติดตาม/เสริมพลังใจ และเลือก อสม. หรือไม่ระบุให้โรงพยาบาลเลือก. งานนี้ใช้ข้อความ customer context ที่ให้มา ไม่อ้างว่าอ่าน Canva โดยตรง และไม่อนุมาน clinical schema จากลูกศร.

| Canva step | Runtime ที่ HEAD | หลักฐานโดยตรง / ขอบเขต |
| --- | --- | --- |
| 02 ขอรับบริการ | Patient SELF สร้างคำขอภายใต้ own relationship; offering ที่เปิดใน Hospital; optional preferredOsmUserId ตรวจ active OSM–Hospital relationship แต่ไม่สร้าง assignment. Patient ถอน PENDING/APPROVED ได้ | `prisma/schema.prisma` (HospitalServiceOffering, PatientServiceRequest); `src/modules/patient-service-requests/services/patient-service-request-service.ts` (create/withdraw); `src/modules/patient-service-requests/policies/patient-service-request-policy.ts`; `app/app/personal/services/patient-service-request-controls.tsx` |
| 02 นัดหมาย | Appointment เป็นอีก domain; request ไม่มี appointment FK จึงไม่ถือว่าคำขอสร้างนัดโดยอัตโนมัติ | `prisma/schema.prisma` (PatientServiceRequest, PatientAppointment); `src/modules/appointments/services/appointment-service.ts` |
| 03 review / start | HOSPITAL direct ACTIVE OWNER/MEMBER ที่ Hospital ACTIVE และไม่มี ADMIN role ตาม review policy; service ตรวจ persisted reviewer ซ้ำใน transaction. START รับเฉพาะ APPROVED แล้ว updateMany ด้วย expected status → STARTED + startedByUserId/startedAt + audit ใน serializable transaction | `src/modules/patient-service-requests/policies/patient-service-request-policy.ts`; `src/modules/patient-service-requests/services/patient-service-request-service.ts` (`reviewPatientServiceRequest`, START branch); `src/modules/patient-service-requests/transport/server-actions.ts` |
| 03 หลัง START ใน UI | ปุ่ม “ยืนยันว่าเริ่มให้บริการแล้ว” บันทึกสถานะ; workspace แสดงว่าคำขอไม่สร้าง Program/assignment และลิงก์ไปหน้าผู้ป่วยเพื่อใช้ workflow เดิม; ไม่ส่ง request ID ไป downstream creation | `app/app/patients/service-requests/hospital-service-request-controls.tsx`; `app/app/patients/service-requests/hospital-service-requests-workspace.tsx` |
| 03 assign / accept | Assign/reassign/unassign เป็น direct ACTIVE HOSPITAL OWNER operation; ตรวจ active User/OSM role/OSM–Hospital relationship และห้าม actor assign ตัวเอง. เปลี่ยนคนจะ end assignment เดิมก่อน create ใหม่พร้อม audit ใน transaction. ไม่มี accept/decline state | `src/modules/patient-assignment/policies/patient-osm-assignment-policy.ts`; `src/modules/patient-assignment/services/patient-osm-assignment-service.ts`; `src/modules/patient-assignment/services/patient-osm-assignment-transaction.ts`; `prisma/schema.prisma` (มี assignedByUserId, endedByUserId, createdAt, endedAt) |
| 04 เปิด Program / ให้บริการ | Program เปิดโดย HOSPITAL direct ACTIVE OWNER/MEMBER หรือ OSM exact current assignment + active OSM–Hospital relationship เมื่อ Hospital ACTIVE. ไม่รับ PATIENT จาก role SELF เพียงอย่างเดียว; ไม่มี request prerequisite | `src/modules/patient-program/policies/patient-program-policy.ts`; `src/modules/patient-program/services/patient-program-access-service.ts`; `src/modules/patient-program/services/patient-program-service.ts` (`openInTransaction`) |
| 04 records | ScreeningAssessment, Program/ServiceOne, PatientFollowup เป็น persistence แยกกัน ไม่มี ServiceRequest FK ใน records เหล่านี้ และ START ไม่สร้าง records เหล่านี้ | `prisma/schema.prisma`; `src/modules/screening/services/screening-service.ts`; `src/modules/followups/services/followup-service.ts`; `src/modules/patient-program/services/patient-program-service-one-service.ts` |

### 1.1 Offering types และ downstream ที่ยังต้องตัดสิน

`PatientServiceCode` มีเพียง SCREENING, FOLLOW_UP, EMPOWERMENT; HospitalServiceOffering unique `(hospitalId, code)` และเปิด/ปิดด้วย enabled. UI map เป็น “คัดกรอง”, “ติดตาม”, “เสริมพลัง” ใน `src/modules/patient-service-requests/presentation/patient-service-request-presentation.ts`; label หลังนี้เป็น candidate ของ customer “เสริมพลังใจ” ไม่ใช่การรับรอง clinical equivalence. หลักฐาน enum/model: `prisma/schema.prisma`; catalog: `src/modules/patient-service-requests/services/patient-service-catalog-service.ts`.

| Offering | Candidate downstream (ข้อเสนอให้ตัดสิน ไม่ใช่ mapping ที่มีแล้ว) | Runtime boundary |
| --- | --- | --- |
| SCREENING | ScreeningAssessment เมื่อมีการบันทึกผล; ไม่บังคับสร้าง Program | `prisma/schema.prisma`; `src/modules/screening/services/screening-service.ts` — assessment เป็น relationship-scoped record |
| FOLLOW_UP | PatientFollowup ใน existing ACTIVE Program หรือ pre-Program context ที่ Owner ยอมรับ; ไม่สร้าง Program ใหม่เพียงเพราะขอติดตาม | `prisma/schema.prisma` (patientProgramId nullable); `src/modules/followups/services/followup-service.ts` — รองรับ Program/pre-Program แยกขอบเขต |
| EMPOWERMENT | PatientProgram ถ้าคำขอนี้เริ่ม episode; ถ้าเป็นกิจกรรมใน Program ที่มีแล้ว Owner ต้องระบุ record ของกิจกรรมที่ส่งมอบ ห้ามตั้งชื่อแล้วถือว่าเป็น Program เสมอ | `prisma/schema.prisma` (PatientProgramServiceOne*); `src/modules/patient-program/services/patient-program-service-one-service.ts` — ไม่มี EMPOWERMENT → record mapping ใน request START |

### 1.2 Cardinality และ authority ที่มีแล้ว

- หนึ่ง ACTIVE Program ต่อ PatientHospitalRelationship: service ตรวจแล้ว conflict และ partial unique index ใน `prisma/migrations/20260820150000_patient_program_workflow_foundation/migration.sql` ป้องกัน concurrent ACTIVE episodes. ไม่ได้แปลว่าหนึ่ง request ต้องเป็นหนึ่ง Program; Program เปิดโดย Hospital/assigned OSM โดยไม่ผ่าน request ได้ตาม service ข้างต้น.
- หนึ่ง assignment ที่ endedAt IS NULL ต่อ relationship: partial unique index ใน `prisma/migrations/20260816100000_patient_osm_assignment/migration.sql`; reassign end เดิม/create ใหม่ใน serializable transaction. ไม่อนุญาต current assignments ซ้อนกันผ่าน path นี้ แต่ยังไม่ได้มี temporal exclusion constraint ห้ามช่วงย้อนหลังทับกันทุกแบบ.
- Current assignment เป็น scope input ไม่ใช่เพียงชื่อผู้ดูแล: `src/modules/patient-program/services/patient-program-access-service.ts`, `src/modules/patient-program/policies/patient-program-policy.ts`, `src/modules/patient-directory/services/patient-directory-query-service.ts` และ `src/modules/appointments/services/appointment-access-service.ts` ใช้ current assignment ประกอบ policy. ตาม [ADR-0002](../adr/0002-role-capability-scope-authorization.md) Role + Capability + Scope และ deny เมื่อ scope ไม่ครบ.
- Appointment เก็บ `osmAssignmentIdAtCreation` จาก current assignment ใน `src/modules/appointments/services/appointment-service.ts`; access resolver เลือก endedAt=null ใน `src/modules/appointments/services/appointment-access-service.ts`; readback อ่าน historical assignment ใน `src/modules/appointments/services/appointment-query-service.ts`. Snapshot เป็นข้อเท็จจริงตอนสร้างนัด ไม่ใช่สิทธิ์ปัจจุบันหรือหลักฐาน accept.

## 2. Gap และผลกระทบ

PatientServiceRequest มี PENDING/APPROVED/REJECTED/WITHDRAWN/STARTED และ startedByUserId/startedAt แต่ไม่มี FK ไป PatientProgram, ScreeningAssessment, PatientFollowup หรือ PatientOsmAssignment (`prisma/schema.prisma`). START service ข้างต้นเขียนสถานะและ audit เท่านั้น. ดังนั้นระบบมี audit ว่าใครกด START แต่ไม่สามารถพิสูจน์ด้วย canonical link ว่าคำขอใดนำไปสู่ record การส่งมอบใด/assignment ใด หรือ อสม. ยอมรับงานเมื่อไร. CARE-07 complete ใน register เป็นเพียง bounded request/review lifecycle ไม่ใช่ Canva step 03→04 ครบ.

ผลต่อ audit: join ด้วย relationship/เวลาเป็นเพียง candidate ไม่พิสูจน์ causality. ผลต่อ reporting: Program facts ที่มีอยู่รายงานได้ แต่ conversion จาก request → delivery และ attribution ผู้รับงานย้อนหลังกำกวม (`src/modules/reporting/services/hospital-report-query-service.ts`, `src/modules/reporting/services/hospital-report-workbook-service.ts`). ผลต่อ data integrity: DB ป้องกัน reference ข้าม Hospital ของ request/offering และกัน ACTIVE Program/assignment ซ้ำได้แล้ว แต่ไม่ได้ enforce request–delivery consistency ที่ยังไม่มี link. นี่เป็น integrity contract ที่ต้องตัดสิน ไม่ใช่ข้อกล่าวหาว่าข้อมูลเดิมผิดทั้งหมด.

## 3. Decisions — รอ Owner ตอบ

### D1 / P-13 — STARTED ต้อง link downstream หรือไม่ และ link อะไรต่อ offering?

Owner ต้องตอบเป็น mapping SCREENING / FOLLOW_UP / EMPOWERMENT พร้อม cardinality และความหมายของ STARTED: เริ่มงาน/เปิด episode หรือมีผลส่งมอบบันทึกแล้ว. Screening/Follow-up สร้างพร้อมผลใน runtime ปัจจุบัน; ถ้า STARTED ต้องเกิดก่อนมีผล ห้ามสร้าง assessment/follow-up เปล่าเพื่อให้ FK ผ่าน. ต้องเลือกเลื่อน transition ให้ผูกผลจริง หรือใช้ Program/record เริ่มงานที่มี domain contract จริง. การเพิ่ม in-progress record เป็นงานใหม่ได้เฉพาะเมื่อ Owner ยืนยันความจำเป็น.

| ทางเลือก | Cardinality | Hospital-initiated Program | Transaction (ADR-0006) | Legacy |
| --- | --- | --- | --- | --- |
| (a) Nullable typed FK บน PatientServiceRequest ไป downstream | Request เก็บหนึ่งปลายทางที่มีความหมาย; unique target FK เมื่อ Owner กำหนด 1 request : 1 record; หากหลาย request อ้าง existing Program เดียว อย่า unique Program FK. 1 request หลาย delivery records ต้องเปลี่ยน contract ไม่ใช้หลาย nullable fields อ้างครบแล้ว | Program ไม่มี request ได้ตามเดิม เพราะ link อยู่บน request | CREATE/select target + ตรวจ scope/type + conditional START + audit ต้อง atomic เมื่อ contract บอกว่า START รับรอง link; ใช้ service orchestration ไม่เรียก independent actions ต่อกัน | คง FK null ที่ provenance ไม่ทราบ; ต้องกำหนด grandfather rule แยกจาก new START enforcement ไม่เติมแบบเดา |
| (b) Nullable sourceServiceRequestId บน downstream record | unique source request ต่อ target table เหมาะกับ provenance แบบ 1:1 ของ record ที่สร้างใหม่; Program เดียวรับหลาย request ไม่ได้ด้วย scalar source. Screening/Follow-up/Program คนละ table ยังต้องกันหนึ่ง request ถูกใช้ซ้ำข้ามชนิด | null source รองรับ Program ที่ Hospital เริ่มเอง | ทิศ FK ไม่ทำให้ atomic เอง; target write + START + audit ยังต้อง transaction เดียว | legacy downstream source=null; backfill เฉพาะคู่ที่ตรวจหลักฐานได้; reuse existing Program ต้องตัดสิน provenance ไม่ overwrite source เดิม |
| (c) ไม่ link คงปัจจุบัน | ไม่ประกาศ/ไม่ enforce request:Program cardinality; แยกหลายคำขอกับหลาย records ไม่ได้ | คง workflow ปัจจุบัน | START + audit atomic อยู่แล้ว แต่ไม่มี atomicity ร่วม delivery | ไม่ต้อง backfill ตอนนี้; ไม่มี causal history เพิ่ม ความกำกวมสะสม |

**Engineering recommendation — PROPOSAL:** เลือก (a) เฉพาะ typed target ที่ Owner ยืนยัน; เหมาะกับคำขอติดตามซึ่งอาจไป existing Program โดยไม่ถือว่าทุกคำขอสร้าง episode. เริ่มจาก mapping table ข้างต้นเป็น candidate และบังคับ new START มี canonical target ใน transaction เมื่อกำหนดความหมาย START แล้ว. หาก Owner ยืนยันเฉพาะ new-record 1:1 provenance และไม่มี Program reuse ให้พิจารณา (b) ซึ่งใช้ pattern sourceFollowupId ได้ตรงกว่า. ยังไม่อนุมัติ mapping ของ EMPOWERMENT หรือ 1 request : 1 Program.

### D2 / P-14 — อสม. ต้องยอมรับ assignment หรือไม่?

| ทางเลือก | Authority | ผลต่อ operation / notifications / snapshot |
| --- | --- | --- |
| ไม่ต้อง (current) | OWNER assign แล้ว current assignment ให้ exact scope ตาม policy ปัจจุบัน | เล็กที่สุดแต่ไม่มี accept event; ห้ามเรียก assignment ว่า accepted. Appointment snapshot ยังคง assignment ณ ตอนสร้าง |
| Accept only | เสนอ → pending → accepted; pending ไม่ให้ Patient read/write จากข้อเสนอนี้ | ต้องมีการถอน/หมดอายุข้อเสนอโดย Hospital เมื่อ อสม. ไม่ตอบ; ไม่มี explicit decline. ต้องนิยาม pending notification และ snapshot แยกจาก effective assignment |
| Accept/decline | เสนอ → pending → accepted หรือ declined; terminal decision เก็บ actor/time; pending/declined ไม่ให้ Patient authority จากข้อเสนอนี้ | ปิดวงจรตอบรับ/ปฏิเสธได้ตรง step 03; Hospital เลือกคนใหม่ได้หลัง decline. ต้องกัน concurrent accept/withdraw/reassign และระบุ notification events |

**Engineering recommendation — PROPOSAL:** accept/decline ผ่านข้อเสนอการมอบหมายแยกจาก effective PatientOsmAssignment; สร้าง assignment เมื่อ accept ผ่าน server checks แล้วเท่านั้น. วิธีนี้คง semantics endedAt=null สำหรับ effective assignments และลดความเสี่ยง readers เดิมให้สิทธิ์ pending. ไม่ auto-accept legacy assignments และไม่ย้อนอ้างว่ามี acceptance แล้ว.

Pending OSM อ่าน Patient data ผ่าน pending proposal **ไม่ได้**; proposal inbox ให้เฉพาะ opaque offer reference/Hospital/ประเภทงานที่อนุมัติ ไม่เผยชื่อ/HN/สุขภาพก่อนรับ. ถ้า actor มีสิทธิ์อื่นที่เป็นอิสระอยู่แล้ว เช่น Hospital membership/current assignment เดิม สิทธิ์นั้นต้องตรวจแยกตาม ADR-0002 ไม่ใช่สิทธิ์จาก pending proposal. ในการ transfer คง assignment เดิมจนคนใหม่ accept; end เดิม/create ใหม่/accept event ต้อง atomic. ไม่ขยาย MEMBER review ให้เป็น assignment authority; OWNER ยังเป็นผู้เสนอการมอบหมาย.

Notification: ปัจจุบัน request START และ assignment transaction ไม่มี acceptance/outbox event; appointment LINE outbox อยู่ใน `src/modules/appointments/services/appointment-service.ts`, `src/modules/appointments/services/appointment-line-notification-outbox-service.ts` เป็นคนละ flow ไม่ถือว่าแจ้ง อสม. pending/decline ได้แล้ว. ข้อเสนอเริ่มด้วย in-app inbox; ถ้าต้อง push ต้องยืนยัน recipient/channel/consent/safe payload แล้วสร้าง intent ใน transaction ไม่ส่ง network ระหว่าง DB transaction.

Appointment snapshot: pending proposal ไม่ถูกเลือก; ตอนสร้างนัด snapshot เฉพาะ effective accepted assignment (หรือ legacy effective assignment ที่ระบุ provenance ตามจริง). ถ้าไม่มี effective assignment ให้ null ตาม schema; ห้ามแก้ snapshot เดิมหลัง accept หรือ reassign. Owner ต้องยืนยันว่าขณะ pending ให้นัดต่อโดยยังใช้ผู้ดูแลเดิม/null ได้หรือควรรอ — ห้าม conflating appointment acknowledgement กับ assignment acceptance.

### D3 / P-15 — preferredOsmUserId เป็น candidate สำหรับข้อเสนอ หรือ Hospital เลือกใหม่เสมอ?

| ทางเลือก | Trade-off |
| --- | --- |
| เสนอชื่อ preferred เป็น candidate ให้ OWNER ตรวจแล้วเสนอ assignment | ลดการกรอกซ้ำและรักษาเจตนา Patient แต่ต้องตรวจ ACTIVE User/OSM role/OSM–Hospital eligibility ใหม่ตอนเสนอ/accept; OWNER override ได้; null คือให้ Hospital เลือก |
| Hospital เลือกทุกครั้ง ไม่ preselect preference | ง่ายและคุม workload ได้ แต่ความประสงค์ Patient เป็นเพียงข้อมูลประกอบ ต้องแสดงว่า Hospital เลือกคนอื่นและแยก preferred กับ actual history |

**Engineering recommendation — PROPOSAL:** ใช้ preferred เป็น candidate ที่ OWNER ต้องยืนยัน ไม่ auto-create assignment และไม่สร้าง authority. MEMBER reviewer ทำ request START ได้ตาม policy เดิม แต่ส่งต่อ OWNER เพื่อเสนอ assignment; อสม. accept ตาม D2 ก่อน effective authority. ถ้า preference ใช้ไม่ได้ต้องเลือกใหม่ ไม่ silently grant หรือ fallback ไปคนใดโดยไม่มี OWNER decision. หลักฐาน current preference-only และ eligibility: `src/modules/patient-service-requests/services/patient-service-request-service.ts`; assignment authority: `src/modules/patient-assignment/policies/patient-osm-assignment-policy.ts`.

## 4. Implementation sketch หลังตัดสินใจ — ไม่มี code ในงานนี้

### 4.1 Fields / constraints ที่เสนอแบบมีเงื่อนไข

- ถ้าเลือก D1(a): เพิ่มเฉพาะ nullable UUID target fields ที่ mapping อนุมัติ เช่น downstreamProgramId, screeningAssessmentId, followupId บน PatientServiceRequest; ไม่เพิ่มครบทุก field ล่วงหน้า. CHECK จำกัด target combination/code ที่อนุมัติ; offering.code อยู่คนละ table จึงต้อง enforce ด้วย service และ DB mechanism ที่ตรวจ type ได้จริง ไม่เขียน CHECK ที่อ้าง table อื่น. หากต้อง DB-enforce type ให้ออกแบบ composite reference โดยมี approved code contract ก่อน.
- Composite FK `(downstreamProgramId, patientHospitalRelationshipId)` → PatientProgram `(id, patientHospitalRelationshipId)`; ScreeningAssessment/PatientFollowup เพิ่ม unique `(id, patientHospitalRelationshipId)` เป็น referenced key เมื่อยังไม่มี. Request มี composite relationship/Hospital FK อยู่แล้ว จึงคงขอบเขต Hospital ผ่าน relationship เดียวกัน. ถ้าต้องผูก Follow-up กับ specific Program ด้วย ต้องรวม patientProgramId ใน composite key และมี CHECK กัน null ทำให้ bypass ได้.
- Unique target field เฉพาะ cardinality ที่อนุมัติ (เช่น assessment หนึ่งรายการตอบหนึ่ง request); ไม่ unique Program เมื่ออนุญาตหลาย request ใน episode เดียว. ไม่แทน accepted pending rule ด้วย client validation. Delete RESTRICT สำหรับ causal history; terminal unlink/correction ต้องมี approved audit semantics.
- ถ้าเลือก D1(b): downstream sourceServiceRequestId nullable + unique ตาม cardinality พร้อม composite FK `(sourceServiceRequestId, patientHospitalRelationshipId)` → request `(id, patientHospitalRelationshipId)` และ referenced unique; กัน cross-type duplicate consumption ด้วย transaction/request-state guard และ DB backstop ที่รองรับ contract จริง ไม่อ้างว่า per-table unique กันข้าม tables ได้.
- ใช้ `prisma/migrations/20261012140000_goal_plan_source_followup/migration.sql` เป็น pattern: source nullable, unique, composite FK same Program/relationship, CHECK source ต้องมี Program เพราะ FK ไม่ตรวจเมื่อ component เป็น null. ไม่คัดลอก unique 1:1 ไป request:Program โดยไม่ตัดสิน cardinality.
- Legacy STARTED: additive nullable links; ถ้าจะมี DB CHECK new START ต้อง link ให้มี explicit linkage-contract version (เช่น linkageVersion null = legacy, 1 = new approved contract) พร้อม new-write service enforcement และ CHECK version/state/required target. ไม่ default legacy เป็น linked และไม่อ้าง nullable FK อย่างเดียวบังคับ STARTED มี target. ต้องตรวจ actual row inventory ก่อนเลือก migration/backfill; ห้ามเติม guessed links.
- ถ้าเลือก D2 proposal model: PatientOsmAssignmentProposal fields ที่จำเป็นคือ id, patientHospitalRelationshipId, proposedOsmUserId, proposedByUserId, status (PENDING/ACCEPTED/DECLINED/WITHDRAWN), createdAt, respondedAt/respondedByUserId และ acceptedAssignmentId nullable. Partial unique หนึ่ง PENDING proposal ต่อ relationship; unique acceptedAssignmentId; composite FK กับ assignment `(id, patientHospitalRelationshipId)` และ CHECK terminal timestamps/link consistency. Atomic accept revalidate target active role/Hospital relation และ OWNER-origin proposal validity; conditional status guard ให้ retry ไม่สร้าง assignment ซ้ำ. ไม่สร้าง effective assignment ที่ endedAt=null ขณะ pending.
- ถ้าต้อง trace “ใครรับงานของ request นี้” ให้เพิ่ม request `osmAssignmentIdAtStart` nullable snapshot + composite FK `(osmAssignmentIdAtStart, patientHospitalRelationshipId)` ไป assignment referenced unique; ไม่ใช้ current assignment หรือ preferredOsmUserId ย้อนแทน snapshot. D1/D2 ต้องยืนยันว่า START รอ accept หรือ delivery โดย Hospital ไม่มี OSM ได้ (กรณีหลัง snapshot null ต้องเป็นเหตุผลที่ยอมรับ ไม่ใช่ implicit assignment).

### 4.2 Services / policies / UI / tests ที่จะเปลี่ยน

| Boundary | Existing paths ที่ต้องพิจารณาหลัง approval | สิ่งที่ต้องทำ / ตรวจ |
| --- | --- | --- |
| Request | `src/modules/patient-service-requests/schemas/patient-service-request-schemas.ts`; `src/modules/patient-service-requests/policies/patient-service-request-policy.ts`; `src/modules/patient-service-requests/services/patient-service-request-service.ts`; `src/modules/patient-service-requests/transport/server-actions.ts` | Typed target validation, exact Hospital/relationship authorization, offering mapping, approved START semantics, persisted actor recheck, conditional transition/retry + audit; ไม่ให้ request-review privilege ข้ามไป OWNER assignment privilege |
| Downstream | `src/modules/patient-program/services/patient-program-service.ts`; `src/modules/patient-program/policies/patient-program-policy.ts`; `src/modules/screening/services/screening-service.ts`; `src/modules/followups/services/followup-service.ts` | Reuse transaction-level writes/validators โดย service orchestration ตาม ADR-0006; target มีจริงตรง scope/type; preserve Hospital-initiated Program และ single ACTIVE invariant; ไม่สร้าง placeholder clinical records |
| Assignment | `src/modules/patient-assignment/services/patient-osm-assignment-transaction.ts`; `src/modules/patient-assignment/services/patient-osm-assignment-service.ts`; `src/modules/patient-assignment/policies/patient-osm-assignment-policy.ts`; `src/modules/patient-assignment/services/patient-osm-assignment-query-service.ts` | OWNER propose/withdraw, exact proposed OSM accept/decline, fresh eligibility, transfer atomic, response idempotency; pending list ไม่มี Patient data authority |
| Consumers | `src/modules/patient-program/services/patient-program-access-service.ts`; `src/modules/patient-directory/services/patient-directory-query-service.ts`; `src/modules/appointments/services/appointment-access-service.ts`; `src/modules/appointments/services/appointment-service.ts`; `src/modules/appointments/services/appointment-query-service.ts` | ตรวจ readers ที่ใช้ endedAt=null ว่าเห็นเฉพาะ effective assignment; pending deny, stale assignment/role/Hospital revoke deny; snapshot ไม่ถูก rewritten |
| UI | `app/app/patients/service-requests/hospital-service-requests-workspace.tsx`; `app/app/patients/service-requests/hospital-service-request-controls.tsx`; `app/app/personal/services/patient-service-request-controls.tsx`; `app/app/patients/[relationshipId]/assignment/patient-osm-assignment-workspace.tsx` | Start/select authorized target แสดง preference/proposed/effective แยกกัน; pending/declined/withdrawn states, errors/retry; OSM offer inbox ใหม่เฉพาะถ้า D2 ผ่าน; link ไป actual readback ไม่ใช่หน้าผู้ป่วยทั่วไปอย่างเดียว |
| Tests | `src/modules/patient-service-requests/policies/patient-service-request-policy.test.ts`; `src/modules/patient-program/services/patient-program-service.test.ts`; `src/modules/patient-assignment/services/patient-osm-assignment-service.test.ts`; `src/modules/appointments/services/appointment-query-service.test.ts` | เพิ่ม request→target integration/DB constraint tests ตาม contract, cross-Hospital/type deny, stale eligibility, concurrent START/accept/reassign, duplicate retry/rollback ไม่มี false audit, legacy null, Hospital-without-request, pending OSM Patient read deny และ appointment historical snapshot |

Schema/migrations ที่อนุมัติต้องปฏิบัติตาม ADR-0002/0006 และตรวจผล constraint จริงก่อนส่งมอบ. งาน implementation ภายหลังต้องใช้ UI/UX skill ตาม AGENTS.md; งานนี้ไม่ปรับ UI หรือพึ่ง API ใหม่ของ library.

## 5. Workbook DoD impact

**ยังไม่มี workbook column ที่ได้ source value ใหม่โดยตรงจาก decision pack นี้.** Workbook ปัจจุบันอ่าน Program/Baseline/ServiceOne/Goal/Follow-up/Final และ BR-08 ใช้ current assignment (`src/modules/reporting/services/hospital-report-query-service.ts`, `src/modules/reporting/services/hospital-report-workbook-service.ts`). การเพิ่ม request provenance/OSM acceptance ไม่ให้ achievedDays, clinical measurements, BR-05 vocabulary หรืออนุมัติ MEMBER export/Area; P-01..P-12 จึงยังเปิดตามเดิม.

เหตุผลที่ควรทำคือปิด causal trace ของ Canva 02→03→04, แยก Patient preference จาก authority และทำให้ audit/operational readback อธิบายการส่งต่องานได้. อาจมีผลโดยอ้อมต่อ BR-08 เมื่อ effective assignment เปลี่ยน แต่ต้องคง label “มอบหมายปัจจุบัน” และไม่แปลงเป็น historical provider/acceptance. ไม่เสนอคอลัมน์ conversion/export ใหม่ภายใต้งานนี้.

## 6. Legacy / data inventory และคำถาม Owner

[ADR-0010](../adr/0010-production-ready-mvp-and-deployment-neutral-runtime.md) กำหนด codebase เดียว, deployment-neutral authorization และ synthetic fixtures; ไม่ใช่หลักฐานว่า database ใดไม่มีข้อมูลจริง. `docs/phases/PHASE_17J3D_UAT_OPERATOR_SETUP_GUIDE.md` ระบุว่า deployment label ไม่พิสูจน์ประเภทข้อมูลและยังไม่ได้รับรอง population ทั้งหมด synthetic; `docs/phases/PHASE_17J3D_UAT_TEST_MATRIX.md` เป็นแผนใช้ synthetic identities ไม่ใช่ inventory ของ STARTED requests.

**Repo นี้ยืนยันไม่ได้ว่ามี STARTED ใน real/UAT database กี่แถว และ backfill คู่ใดได้จริง.** งานนี้ไม่ได้เชื่อม/อ่านฐานข้อมูลภายนอก. Status transition ใน runtime พิสูจน์ว่าเขียน STARTED ได้ ไม่ใช่พิสูจน์ว่าถูกใช้แล้ว. Request เก็บ relationship/เวลา/actor แต่ไม่มี downstream key (`prisma/schema.prisma`, START service ใน §1); ถ้า Operator ไม่มี external provenance ที่ตรวจได้ ห้ามจับคู่ด้วยเวลาใกล้กันหรือ preferred/current OSM แล้วเรียก verified link.

Owner ต้องตอบ:

1. **P-13 / D1:** target ต่อ offering, STARTED หมายถึงอะไร, 1 request ให้หลาย records ได้ไหม, หลาย request ใช้ Program เดียวได้ไหม, Hospital-only delivery ไม่มี OSM ได้ไหม, และรับ legacy null ที่พิสูจน์ไม่ได้อย่างไร?
2. **P-14 / D2:** ต้อง accept/decline หรือไม่; effective authority เริ่มเมื่อไร; transfer pending ใช้ผู้ดูแลเดิมต่อหรือไม่; START/นัดต้องรอ accept ไหม; notification แค่ in-app หรือช่องทางใดที่มี consent?
3. **P-15 / D3:** ให้ OWNER ยืนยัน preferred candidate หรือเลือกทุกครั้ง; UI สื่อสาร override อย่างไร?
4. **Data Owner/Operator ภายใต้ P-13:** มี real/UAT STARTED กี่แถว แยก environment/ข้อมูลประเภทใด; ใครรับรอง inventory; มี audit/manual records ที่พิสูจน์ target/assignment ได้หรือไม่? ให้ส่งเฉพาะสรุปและหลักฐานที่ sanitize ไม่ใส่ Patient identifiers ในเอกสารนี้.

## 7. Risk of deferring

ตราบใดที่ START branch เดิมยังรับ APPROVED → STARTED โดยไม่มี target link (`src/modules/patient-service-requests/services/patient-service-request-service.ts`) ทุกครั้งที่ใช้งานจะเพิ่ม STARTED ที่ไม่มี causal reference. ปริมาณจริงยังไม่ทราบ แต่การเลื่อนทำให้การ backfill ภายหลังเสี่ยงต้องเดาจากเวลา/relationship และ reassign history; หากพิสูจน์ไม่ได้ต้องคง unknown. ไม่มีสิทธิ์แปลง preference เป็น assignment เพื่อแก้ช่องว่างย้อนหลัง.

## 8. Verification / disposition

ตรวจ schema, migrations, service, policy, query, UI และ existing test sources ที่ HEAD โดย read-only; ตรวจ cited runtime paths ด้วย `git cat-file -e HEAD:<path>`. ไม่รัน tests/build, ไม่แก้ runtime/schema/migration/test/configuration และไม่ commit/push. เอกสารนี้เพิ่ม P-13..P-15 ใน WB-00 §5.2 เท่านั้น; ทุก decision ยัง PENDING.
