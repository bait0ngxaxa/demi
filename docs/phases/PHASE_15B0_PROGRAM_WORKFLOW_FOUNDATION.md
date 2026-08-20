# Phase 15B.0 — Program Workflow Foundation

สถานะ: Implemented

เอกสารนี้เป็น handoff ของ Phase 15B.0 ใน DEMI rewrite และใช้ข้อสรุปจาก Phase 15A เป็นหลัก โดยเฉพาะ P15A-D04 เรื่อง Program episode และ P15A-D12 เรื่องการเชื่อมโยง initial/BEFORE context ขั้นต่ำ

## ขอบเขตที่ทำเสร็จ

เพิ่ม `PatientProgram` เป็น bounded participation episode ที่อยู่ภายใต้ `PatientHospitalRelationship` เดิม โปรแกรมไม่ได้กลายเป็นเจ้าของข้อมูล Patient, ความสัมพันธ์กับ Hospital, Screening, Baseline, Goal Plan, Appointment, Follow-up หรือ Evidence

Program มีสัญญาขั้นต่ำดังนี้

| Field | Contract |
| --- | --- |
| `id` | UUID opaque ที่ Prisma/server เป็นผู้สร้าง ใช้เป็น internal/navigation identity เท่านั้น ไม่ใช่ workbook display ID |
| `patientHospitalRelationshipId` | required foreign key ไปยังความสัมพันธ์ผู้ป่วยกับ Hospital หนึ่งรายการแบบ exact scope |
| `initialBaselineId` | nullable foreign key ไปยัง `PatientBaseline` ที่ใช้เป็น initial context เมื่อมีข้อมูล |
| `createdByUserId` | actor ที่ server ตรวจสอบและบันทึกจาก authoritative actor context |
| `status` | มีเฉพาะ `ACTIVE` และ `COMPLETED` |
| `startedAt` | server-authoritative domain timestamp ตอนเปิด episode |
| `completedAt` | nullable จนกว่าจะจบ และ server เป็นผู้กำหนดตอน transition |
| `createdAt` | server/database timestamp |

ไม่มีการเพิ่ม field สำหรับ DM/Pre-DM, illness duration, CVD risk, HbA1c, BMI, outcome, report projection หรือ clinical formula ใด ๆ ลงใน Program

## Lifecycle และ cardinality

- ผู้ป่วยหนึ่ง `PatientHospitalRelationship` มี Program history ได้หลาย episode เมื่อ episode ก่อนหน้าเสร็จสิ้นแล้ว
- มี Program ที่เป็น `ACTIVE` ได้ไม่เกินหนึ่งรายการต่อ exact relationship
- lifecycle ที่รองรับใน slice นี้มีเพียง `ACTIVE → COMPLETED`
- `ACTIVE` ต้องมี `completedAt IS NULL`
- `COMPLETED` ต้องมี `completedAt IS NOT NULL`
- `completedAt` ต้องไม่มาก่อน `startedAt`
- `startedAt` และ `completedAt` แก้จาก client ไม่ได้
- การจบ Program เป็น explicit server-side mutation และไม่เปิดให้ delete, reopen, แก้ timestamp หรือใช้สถานะ speculative เช่น `PAUSED`, `CANCELLED` หรือ `DROPPED_OUT`
- การเรียก complete ซ้ำกับรายการที่ `COMPLETED` จะคืนผล `ALREADY_COMPLETED` โดยไม่เขียน `completedAt` ซ้ำและไม่สร้าง audit ซ้ำ

Invariant lifecycle มีทั้ง PostgreSQL `CHECK` constraints และ application validation การเปิดใช้ PostgreSQL partial unique index เพื่อบังคับ active cardinality จึงไม่ขึ้นกับ UI หรือ pre-check เพียงอย่างเดียว

## Active uniqueness และ transaction boundary

Migration เพิ่ม index ต่อไปนี้:

```sql
CREATE UNIQUE INDEX "PatientProgram_one_active_per_relationship_idx"
    ON "PatientProgram"("patientHospitalRelationshipId")
    WHERE "status" = 'ACTIVE';
```

Prisma schema language ยังไม่แสดง partial unique index ได้ จึงเก็บ constraint นี้ไว้ใน SQL migration โดยมี comment อธิบายเหตุผลไว้ชัดเจน

Create/Open ใช้ Serializable transaction, ตรวจ active episode เพื่อให้ error อ่านง่าย และยังคงพึ่ง database partial unique index เป็น final race guard เมื่อมีคำขอเปิดพร้อมกันสองรายการ การ retry รองรับ Prisma `P2002` และ `P2034` ตาม pattern ของ repository

Complete ใช้ server timestamp และ conditional `updateMany` ที่ระบุ `ACTIVE` กับ `completedAt: null` เพื่อไม่ให้ transition ที่ชนกันเขียนทับประวัติ หลัง update จะอ่าน record กลับมาตรวจ invariant และเขียน audit ใน transaction เดียวกัน

## Authorization

Program ใช้ exact Patient authorization boundary เดิม ไม่สร้าง organization-wide Program scope ใหม่

| Actor | Read / mutate behavior |
| --- | --- |
| HOSPITAL | ต้องมี active direct `OWNER` หรือ `MEMBER` membership ใน Hospital เดียวกับ exact `PatientHospitalRelationship` และ Hospital ต้อง active |
| OSM | ต้องเป็น OSM ที่ active ใน Hospital และมี `PatientOsmAssignment` ที่ยัง active ของ exact relationship และเป็นของ actor คนเดียวกัน |
| ADMIN-only | ถูก deny สำหรับ routine Program/clinical access |
| PATIENT | ยังไม่มี self-service capability ใน Phase 15B.0 |

เมื่อเข้าถึง service จะใช้ actor จาก server boundary แล้ว re-read user status, role, Hospital membership และ OSM-Hospital relationship จาก database ก่อน policy decision เสมอ Browser ไม่สามารถกำหนด actor, role, Hospital หรือ relationship scope ได้เอง การเข้าถึงด้วย Program ID จะค้นผ่าน authorized relationship ก่อน จึง fail closed เมื่อ ID เป็นของ relationship อื่น

Multi-role actor จะได้รับสิทธิ์เฉพาะเมื่อมี valid HOSPITAL หรือ OSM care scope อยู่จริง ไม่ได้สิทธิ์จาก `ADMIN` เพียงอย่างเดียว

## Initial / Baseline association

เลือกให้ `PatientProgram` อ้างถึง `PatientBaseline` ด้วย `initialBaselineId` และ composite foreign key:

```text
(PatientProgram.initialBaselineId,
 PatientProgram.patientHospitalRelationshipId)
    → (PatientBaseline.id,
       PatientBaseline.patientHospitalRelationshipId)
```

เหตุผลคือ `PatientBaseline` เป็น dedicated relationship-owned record ที่มีอยู่แล้ว การอ้างอิงด้วย composite key ทำให้ database บังคับว่า Baseline กับ Program เป็นของ exact `PatientHospitalRelationship` เดียวกัน โดยไม่คัดลอก measurement, confidence หรือข้อความ clinical ใด ๆ เข้า Program

พฤติกรรม provisional ที่เลือกสำหรับ MVP/demo:

- เปิด Program ได้แม้ยังไม่มี Baseline
- ถ้ามี Baseline อยู่แล้วตอนเปิด จะเก็บเฉพาะ Baseline ID นั้น
- ถ้าสร้าง Baseline หลังเปิด Program ระบบจะ link Baseline ให้กับ current ACTIVE Program ที่ยังไม่มี initial context ภายใน transaction เดียวกับการสร้าง Baseline
- completed history จะไม่ถูก link ย้อนหลังโดยการสร้าง Baseline ใหม่
- เนื่องจาก Baseline ปัจจุบันเป็นหนึ่งรายการต่อ relationship หลาย episode อาจอ้าง initial Baseline เดียวกันได้ จนกว่าจะมี requirement ใหม่ที่อนุมัติ episode-specific baseline

slice นี้ไม่ได้กำหนด official BEFORE/AFTER timing window, final context, outcome vocabulary หรือ reporting semantics และไม่ได้ใช้ legacy `followup_round = 0`

## Application service และ read model

โมดูลใหม่อยู่ที่ `src/modules/patient-program/` และแยก policy, schema, access, query, mutation service และ server action ตาม architecture เดิม

Operations ที่เปิดใช้:

- `openPatientProgram(actor, input)` — validate, authorize exact relationship, derive actor/time server-side, resolve Baseline identity, create และ audit ใน transaction
- `getPatientProgramPageContext(actor, relationshipId)` — คืน patient summary, active Program, bounded history, `canOpen` และ `canManage`
- `getPatientProgramDetail(actor, relationshipId, programId)` — คืน safe Program projection เฉพาะเมื่อ Program และ relationship ตรงกัน
- `completePatientProgram(actor, input)` — explicit `ACTIVE → COMPLETED` transition หรือ deterministic `ALREADY_COMPLETED`

History projection จำกัด 50 รายการและเรียง `startedAt DESC, id DESC` เพื่อรองรับ relationship + status/history reads โดยไม่เปิดข้อมูล actor memberships หรือ clinical values ที่ไม่เกี่ยวข้อง

Server actions รับเฉพาะ opaque relationship/Program ID ที่ผ่าน strict schema, ไม่รับ actor/role/Baseline/timestamp จาก browser และคืนข้อความ error ที่ปลอดภัย

Patient detail workspace มี Program status card, start time, initial Baseline state, open action เมื่อไม่มี active episode, history ของ completed episodes และ internal detail navigation การเปิด/จบทำผ่าน server action และ refresh read model ส่วน Program detail แสดง Service 1 เป็นข้อความ deferred เท่านั้น ยังไม่มี Service 1 activity persistence

## Audit และ observability

มี audit lifecycle mutation ดังนี้:

- `patient_program.created`
- `patient_program.completed`

Metadata จำกัดอยู่ที่ actor/Program/relationship/Hospital identifiers และ status transition ที่ปลอดภัย ไม่บันทึก measurement, confidence, note, phone หรือข้อมูล clinical ใด ๆ

## Migration และ referential integrity

เพิ่ม migration:

`prisma/migrations/20260820150000_patient_program_workflow_foundation/migration.sql`

Migration นี้:

- สร้าง enum `PatientProgramStatus`
- เพิ่ม composite unique index ที่จำเป็นสำหรับ Baseline foreign key
- สร้าง `PatientProgram` โดยไม่มี backfill และไม่สร้างข้อมูลปลอมให้ผู้ป่วยเดิม
- เพิ่ม lifecycle/time `CHECK` constraints
- เพิ่ม relationship/status/history indexes
- เพิ่ม partial unique active index
- ใช้ foreign keys แบบ `ON DELETE RESTRICT` เพื่อคงประวัติและ exact ownership

ไม่มี destructive change ต่อข้อมูล Patient care เดิม

ไม่มี ADR ใหม่ เพราะการเพิ่ม bounded Program episode และ minimum Baseline association เป็นการลงมือทำตาม P15A-D04/P15A-D12 และใช้ pattern ที่ accepted อยู่แล้ว ไม่ได้สร้าง architectural abstraction ใหม่

## ความแตกต่างจาก legacy

Legacy ใช้เป็น behavioral/business evidence เท่านั้น implementation นี้จงใจไม่ย้าย:

- browser-side authorization หรือ role/Hospital values จาก client
- direct Supabase persistence/data access สำหรับ Program
- legacy follow-up round convention เพื่อทำหน้าที่เป็น initial state
- การรวม clinical values หรือ reporting fields เข้า episode model
- broad hierarchy/ADMIN access
- generic workflow, activity หรือ polymorphic evidence engine

แหล่งข้อมูลปัจจุบันยังคงเป็น rewrite architecture: services orchestrate, policies authorize, Prisma เป็น persistence boundary และ exact relationship/assignment scope เป็น security boundary

## สิ่งที่เลื่อนไป Phase ถัดไป

ยังไม่ทำใน 15B.0:

- Service 1 activity persistence และ form: `รู้จักตัวเอง`
- routine/life schedule, floating/sinking chart, dream card, confidence UI ใหม่
- Service 2, food/exercise redesign และ plan adjustment
- achieved days, Achieve score/rate และ `>70%` calculation
- HbA1c, CVD risk, BMI และ clinical formulas
- official BEFORE/AFTER timing, final context และ outcome dropdown/vocabulary
- workbook display ID, report OSM projection, report authorization, Dashboard และ Excel export
- Patient self-service Program
- generic workflow/activity/correction framework หรือ reopen/cancel semantics

Open Phase 15A reporting/clinical decisions เหล่านี้จึงไม่ถูกย้ายเข้ามาเป็น schema blocker ของ Program foundation

## Verification

ผลการตรวจสอบที่ทำกับ implementation นี้:

- `npx prisma validate` — PASS
- `npx prisma generate` — PASS (`@prisma/client` 6.19.3)
- `npm run prisma:migrate:test` — PASS; migration 15B.0 apply สำเร็จและไม่มี pending migration ใน subsequent run
- focused Program integration — PASS, 1 file / 5 tests
- full integration suite `npm run test:integration` — PASS, 18 files / 134 tests
- focused unit tests — PASS, 4 files / 32 tests
- `npx tsc --noEmit` — PASS
- `npm run lint` — PASS (ไม่มี error; มี warning ชั่วคราวที่ถูกแก้ก่อน final verification)
- `git diff --check` — ตรวจซ้ำก่อน commit

`npm run test:db:up` ไม่สามารถตรวจ Docker wrapper ได้เพราะรายงาน `Docker Engine is unavailable in WSL distribution Ubuntu` แต่มี disposable PostgreSQL ที่ `127.0.0.1:55432` ทำงานอยู่ จึงใช้ `prisma:migrate:test` และ integration suite กับ local test database สำเร็จแทน ไม่ได้ใช้ production หรือ Supabase database

## Handoff ไป Phase 15B.1

Phase 15B.1 ควรจำกัด scope ที่ Service 1 — `รู้จักตัวเอง` โดยใช้ `PatientProgram` เป็น episode owner และ reuse exact relationship/OSM authorization boundary นี้:

1. ระบุ Service 1 record/activity contract และ cardinality ภายใต้ Program จาก customer/workbook evidence ที่อนุมัติแล้ว
2. กำหนด persistence, idempotency, immutable/history behavior และ audit metadata ของ Service 1 เท่าที่จำเป็น
3. เพิ่ม read/write projection ที่ Program detail ใช้เป็น entry point
4. เพิ่ม focused policy/service/integration tests สำหรับ HOSPITAL, exact assigned OSM, cross-relationship และ retry/concurrency behavior

ยังไม่ควรเริ่ม Service 2, reporting, final/AFTER semantics หรือ generic activity engine ใน handoff นี้
