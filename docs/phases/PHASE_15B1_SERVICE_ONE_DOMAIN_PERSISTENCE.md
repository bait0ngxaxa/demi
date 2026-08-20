# Phase 15B.1 — Service 1 Domain & Persistence

สถานะ: Implemented — พร้อม handoff ไปยัง Phase 15B.2

เอกสารนี้บันทึก bounded domain และ persistence foundation ของ Service 1 `รู้จักตัวเอง` ภายใต้ `PatientProgram` โดยยึดข้อสรุปจาก Phase 15A, architecture ของ rewrite และ Program foundation ใน Phase 15B.0 เป็นหลัก Legacy ใช้เป็น behavioral evidence เท่านั้น และไม่มีการนำ persistence, browser authorization หรือ upload architecture ของ legacy มาใช้

## ขอบเขต

Slice นี้รองรับการบันทึกกิจกรรมแบบ progressive แยกกันสี่รายการ:

1. routine / life schedule
2. floating / sinking chart
3. dream card
4. confidence reflection

ยังไม่รวม final Service 1 UI, file picker, upload flow, Service 2, clinical calculation, reporting หรือ official Service 1 completeness rule

Workbook ยืนยันว่า Service 1 มี routine/life schedule, floating/sinking chart และ dream card และ reporting ต้องทราบว่ากิจกรรมเหล่านั้นถูกทำหรือไม่ ส่วน confidence scale 0–10 และข้อความของกิจกรรมเป็น legacy-aligned structural default ที่ยังไม่ใช่ข้อสรุปทางคลินิกหรือ requirement ที่ final แล้ว

## Domain contract

`PatientProgram` เป็นเจ้าของ Service 1 เสมอ ไม่ใช่ Patient แบบ global, `PatientHospitalRelationship` โดยตรง, Baseline, Follow-up, Evidence หรือ generic workflow instance

Service 1 ใน slice นี้เป็น bounded aggregate ที่ประกอบด้วย activity records ที่รู้จักแน่นอนสี่ชนิดซึ่งอ้างถึง Program โดยตรง ไม่มี parent row ที่มีสถานะรวม เพราะยังไม่มี lifecycle หรือ completeness contract สำหรับ Service 1 และไม่มีการเพิ่ม `serviceOneCompleted`

การมี activity record เป็น authoritative structural signal ว่ากิจกรรมนั้นถูกบันทึก/ดำเนินการแล้ว:

| Activity | Structural signal | Domain data |
| --- | --- | --- |
| Routine / life schedule | มี routine record | provenance ของการบันทึก |
| Floating / sinking chart | มี floating-chart record | optional `summary` |
| Dream card | มี dream-card record | optional `description` |
| Confidence reflection | มี confidence record | `score` 0–10 และ optional `improvementPlan` |

จึงไม่มี completion boolean, status หรือ field อื่นที่สามารถขัดแย้งกับการมีอยู่ของ record ได้ และไม่มีการกำหนดว่า Service 1 จะถือว่า complete เมื่อกิจกรรมครบทั้งสี่รายการ

## Persistence model

เพิ่ม model แบบ explicit ใน Prisma ดังนี้:

- `PatientProgramServiceOneRoutine`
- `PatientProgramServiceOneFloatingChart`
- `PatientProgramServiceOneDreamCard`
- `PatientProgramServiceOneConfidence`

แต่ละ model มี `id`, `patientProgramId`, `recordedByUserId` และ `recordedAt` เป็นอย่างน้อย โดย activity ที่มีข้อมูลเฉพาะจะมี field เพิ่มตามตารางด้านบน `patientProgramId` เป็น unique ต่อ activity ทำให้ Program หนึ่งมี record ของ activity แต่ละชนิดได้ไม่เกินหนึ่งรายการ และทั้งสี่รายการรวมกันเป็น current bounded Service 1 state ของ Program นั้น

การเลือกสี่ model แยกกันแทน generic `Activity`, questionnaire engine, JSON payload หรือ EAV มีเหตุผลดังนี้:

- รู้จัก activity ของ Service 1 ล่วงหน้าและมีจำนวนจำกัด
- รองรับการบันทึกทีละกิจกรรมโดยไม่บังคับ giant submission
- เก็บ provenance แยกต่อกิจกรรมได้ถูกต้องเมื่อคนละ actor เป็นผู้บันทึก
- ให้ database บังคับ one-time cardinality ได้โดยตรง
- ทำให้ field, length และ constraint ของ confidence ตรวจสอบได้ชัดเจน
- ไม่สร้าง abstraction สำหรับ Service หรือ activity ในอนาคตที่ยังไม่มีหลักฐานรองรับ

ยังไม่มี artifact foreign key ใน model เหล่านี้

## Cardinality และ migration

- Program เดิมไม่มีการ backfill record ใด ๆ
- Program ใหม่เริ่มต้นโดยไม่มี Service 1 activity record
- แต่ละ activity มีได้ไม่เกินหนึ่ง record ต่อ Program ด้วย unique index บน `patientProgramId`
- Foreign key จาก activity ไป `PatientProgram` และ `User` ใช้ `ON DELETE RESTRICT`
- มี index สำหรับ `recordedByUserId, recordedAt` และ unique Program lookup
- Confidence มี PostgreSQL `CHECK (score BETWEEN 0 AND 10)` เพิ่มจาก schema validation
- Text columns ใช้ `VARCHAR(2000)` และ request schemas ใช้ maximum เดียวกัน
- Migration `20260820160000_patient_program_service_one_domain_persistence` เป็น additive, ไม่มี destructive change และไม่มี fake Service 1 data

Foreign key ที่ไปยัง Program ทำให้ activity ไม่สามารถเป็นของ Program อื่นได้ ส่วน exact relationship ของ Program ยังคงถูกบังคับผ่าน Program และ access boundary เดิมของ Phase 15B.0 ไม่ได้สร้าง relationship scope คู่ขนาน

## Provenance

ทุก activity ที่บันทึกสำเร็จเก็บข้อมูล domain provenance โดยตรง:

- `patientProgramId` ระบุ Program owner
- Program ระบุ exact `patientHospitalRelationshipId` ของผู้ป่วยและ Hospital
- `recordedByUserId` มาจาก actor context ที่ server ตรวจสอบแล้ว
- `recordedAt` ถูกสร้างโดย server/service และไม่รับ timestamp จาก browser

Audit ไม่ได้ถูกใช้แทน domain provenance และไม่มี global `createdByUserId` เพียงค่าเดียวบน Service 1 ที่อาจทำให้ actor ของกิจกรรมภายหลังคลาดเคลื่อน

## Mutation semantics

มี application-service operation แยกกันสำหรับ routine, floating chart, dream card และ confidence โดยทุก operation:

1. รับ input ผ่าน strict Zod schema
2. trim text และ normalize empty string, `null` และ `undefined` เป็น `null`
3. จำกัด `summary`, `description` และ `improvementPlan` ไม่เกิน 2,000 ตัวอักษร
4. รับ confidence เป็น integer เท่านั้นในช่วง 0–10 โดยไม่มีการตีความทางคลินิก
5. resolve Program ผ่าน `resolvePatientProgramByIdAccessContext` และ `PATIENT_PROGRAM_MANAGE_CAPABILITY`
6. ตรวจ Program lifecycle แล้วเขียน record และ audit ใน transaction เดียวกัน

Routine ไม่มี activity-specific payload ใน slice นี้ เพราะ image/artifact boundary ถูกเลื่อนไป 15B.2

## Repeated submission และ immutability

Correction/amendment semantics ยัง deferred จึงเลือก one-time recording:

- การ retry ด้วยข้อมูลที่ normalized แล้วเหมือน record เดิมคืน `ALREADY_RECORDED` และไม่ update record หรือสร้าง audit ซ้ำ
- routine ไม่มี payload จึง retry ได้ deterministic จาก record เดิม
- floating chart, dream card และ confidence หากส่งข้อมูลขัดแย้งกับ record เดิมจะได้ `ConflictError` และไม่มีการ overwrite
- ไม่มี general versioning, amendment หรือ correction framework

## Program lifecycle

เขียน Service 1 ได้เฉพาะ Program ที่เป็น `ACTIVE` และมี `completedAt IS NULL` เท่านั้น

- `ACTIVE` → อนุญาตเมื่อผ่าน access policy
- `COMPLETED` → ปฏิเสธ mutation ใหม่
- completed history → ยังอ่าน Service 1 ได้
- Service 1 ไม่สามารถ reopen หรือ mutate Program ที่ completed
- การบันทึก Service 1 ไม่เปลี่ยนสถานะ Program และไม่ทำให้ Goal Plan หรือ domain อื่นถูก lock

## Authorization

ใช้ Program authorization boundary เดิมจาก Phase 15B.0 ไม่สร้าง policy หรือ scope แยกสำหรับ Service 1

| Actor | Service 1 behavior |
| --- | --- |
| HOSPITAL | อนุญาตเฉพาะ active direct Hospital membership ของ exact `PatientHospitalRelationship` และ Hospital เดียวกัน |
| OSM | อนุญาตเฉพาะ exact active `PatientOsmAssignment` ของ relationship นั้น และ OSM-Hospital relationship ที่ตรงกัน |
| ADMIN-only | deny; ไม่มี routine clinical access จาก ADMIN เพียงอย่างเดียว |
| PATIENT | ยังไม่มี self-service access ใน Phase 15B.1 |

Actor, role, Hospital, OSM, Program ownership และ relationship ไม่รับจาก browser เป็น authority service จะ re-read authoritative actor/relationship state ผ่าน existing access resolver และ fail closed เมื่อ Program ID เป็นของ relationship อื่นหรือ policy scope ไม่ตรงกัน

## Concurrency

ทุก mutation ใช้ Serializable transaction และ retry แบบ bounded สำหรับ Prisma `P2002`/`P2034`

- unique `patientProgramId` เป็น database race guard สำหรับ duplicate activity
- mutation อ่าน lifecycle แล้วใช้ conditional write บนแถว `PatientProgram` เดิม (`ACTIVE` และ `completedAt IS NULL`) เพื่อรับ row lock เดียวกับ completion transition
- ถ้า completion ชนะ serialization order mutation จะไม่ commit activity ใหม่กับ Program ที่ completed
- ถ้า activity mutation ชนะก่อน completion activity จะอยู่ในประวัติและ completion จะเกิดภายหลังตาม serialization order
- duplicate concurrent submissions จะได้ผล authoritative เพียงหนึ่ง record; retry ที่เห็น record เดิมคืน deterministic existing result และ request ที่ payload ต่างกันไม่ overwrite
- cross-Program และ cross-relationship access ถูก reject ก่อน persistence และถูกป้องกันซ้ำด้วย Program foreign key / exact access query

ไม่มี generic concurrency framework เพิ่มเข้ามา

## Read projection

`getPatientProgramDetail` เพิ่ม server-side `serviceOne` projection โดย query select เฉพาะ field ที่จำเป็น:

- `recorded` ต่อ activity
- `recordedAt` ต่อ activity
- `recordedBy.displayName` เมื่อมี record
- floating chart `summary`
- dream card `description`
- confidence `score` และ `improvementPlan`

Projection ที่ยังไม่มี record จะคืน `recorded: false`, timestamp และ actor เป็น `null` ส่วน activity ที่มีบางรายการจะสะท้อน partial progress ได้โดยไม่มี overall completion flag

Projection ไม่เปิดเผย actor ID, membership details หรือ Patient clinical data ที่ไม่เกี่ยวข้อง และ historical completed Program ใช้ query เดิมที่อ่านได้โดยไม่เปิด write capability

## Audit

การสร้าง record ใหม่ audit ใน transaction เดียวกันด้วย action ต่อไปนี้:

- `patient_program.service_one.routine_recorded`
- `patient_program.service_one.floating_chart_recorded`
- `patient_program.service_one.dream_card_recorded`
- `patient_program.service_one.confidence_recorded`

Audit metadata มีเฉพาะ safe identifiers ได้แก่ Program, exact relationship, Hospital และ activity/resource identifiers ที่จำเป็น ไม่เก็บ confidence score, floating-chart summary, dream-card description, improvement plan หรือ image content การ retry ที่ไม่สร้าง record ใหม่ไม่สร้าง audit ซ้ำ

## Artifact boundary และ handoff ไป 15B.2

15B.1 ไม่เพิ่ม upload UI, file picker, browser-direct Supabase upload, generic attachment หรือ `entityType/entityId` และไม่คัดลอก legacy bucket logic

15B.2 ควรเชื่อม image/artifact เฉพาะเมื่อ UI และ customer requirement ชัดเจน โดยใช้ `PatientEvidenceArtifact` ที่มีอยู่ ซึ่งเป็น relationship-scoped และ server-managed อยู่แล้ว association ต้องเป็น narrow Service 1-specific boundary ที่ระบุ activity ที่รู้จักแน่นอน ตรวจ exact `patientHospitalRelationshipId` ของ Program ทุกครั้ง และไม่เปิดให้ artifact จาก relationship อื่นถูกผูกเข้ามา หากต้องเพิ่ม schema relation ให้เพิ่มเฉพาะ known Service 1 activity ไม่สร้าง generic attachment engine

## Provisional และ unresolved requirements

ค่า default ที่ใช้ใน slice นี้เป็น smallest reversible implementation ไม่ใช่การปิด requirement เหล่านี้:

- image ของ routine, floating chart หรือ dream card จำเป็นหรือไม่
- text ของ summary, description และ improvement plan จำเป็นหรือไม่ และต้องมี format ใด
- confidence ใน Service 1 มีความหมายเทียบเท่ากันใน Screening, Baseline หรือ Follow-up หรือไม่
- official Service 1 completeness rule และ outcome vocabulary
- correction/amendment และการทำกิจกรรมซ้ำใน episode เดียวกัน
- reporting semantics, calculation และ artifact ownership ที่ final

ยังไม่มีการคัดลอก confidence จาก Screening/Baseline และไม่มี clinical calculation, report state หรือ automatic Goal Plan adjustment

## Verification

รันบน repository และ disposable PostgreSQL integration database ที่ `127.0.0.1:55432` (`demi_test`) ไม่ใช่ production หรือ Supabase:

- `npx prisma validate` — PASS
- `npx prisma generate` — PASS (Prisma Client 6.19.3)
- `npm run prisma:migrate:test` — PASS; 19 migrations found, no pending migrations
- focused Service 1 tests — PASS; 3 files, 17 tests
- `npm run test:integration` — PASS; 18 files, 141 tests
- `npm test` — PASS; 103 files, 664 tests
- `npx tsc --noEmit` — PASS
- `npm run lint` — PASS
- `git diff --check` — PASS (ไม่มี whitespace error)

Docker/WSL wrapper ไม่ได้ใช้ใน verification นี้เนื่องจาก environment limitation ที่บันทึกไว้จาก Phase 15B.0; ใช้ disposable local PostgreSQL path ที่ repository รองรับแทน

## Handoff

ผลลัพธ์ของ 15B.1 คือ persistence และ server contract สำหรับ UI สามารถแสดง progress และส่ง mutation แยกกิจกรรมได้ โดยยังไม่กำหนด final clinical UX หรือ completion outcome

ขั้นถัดไปที่แนะนำ:

`Phase 15B.2 — Service 1 UI & Evidence Integration`

15B.2 ต้องใช้ projection และ server actions ที่มีอยู่, คง exact Program authorization, ออกแบบ artifact association ให้แคบกับ Service 1 และยืนยัน requiredness กับ customer ก่อนทำ final upload experience
