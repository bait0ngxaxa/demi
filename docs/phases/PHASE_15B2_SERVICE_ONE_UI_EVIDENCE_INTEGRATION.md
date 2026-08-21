# Phase 15B.2 — Service 1 UI & Evidence Integration

สถานะ: Implemented — พร้อม handoff ไปยัง Phase 15B.3

เอกสารนี้บันทึกการทำให้ Service 1 `รู้จักตัวเอง` ใช้งานได้เป็น demo workflow บนหน้า Program detail โดยต่อกับ Evidence boundary ที่มีอยู่ของ rewrite เท่านั้น ไม่ได้กำหนด official Service 1 completion หรือ outcome ทางคลินิก

## ขอบเขต

เพิ่มใน slice นี้:

- UI แบบสี่การ์ดอิสระบน Program detail สำหรับ Routine, Floating/Sinking Chart, Dream Card และ Confidence
- structural progress `n จาก 4 กิจกรรมถูกบันทึกแล้ว`
- การบันทึกกิจกรรม Service 1 แบบ one-time/immutable ตาม 15B.1
- การแนบภาพแบบ optional ให้ Routine, Floating/Sinking Chart และ Dream Card
- read projection ของ evidence ที่ปลอดภัยสำหรับ UI
- explicit Service 1 artifact association และ migration ที่บังคับ relationship/program integrity
- server action สำหรับ association ที่ใช้ actor และ Program authorization เดิม
- focused unit, transport, UI และ PostgreSQL integration coverage

ไม่รวม Service 2, reporting, dashboard, generic workflow, generic attachment/gallery, correction/amendment หรือ official completion rule

## UI structure

หน้า `Program detail` แสดง section:

`Service 1 — รู้จักตัวเอง`

1. `ตารางกิจวัตร` — บันทึกกิจกรรมโดยไม่บังคับรูป
2. `กราฟวัดลอยจม` — summary optional ไม่เกิน 2,000 ตัวอักษร และรูป optional
3. `การ์ดความฝัน` — description optional ไม่เกิน 2,000 ตัวอักษร และรูป optional
4. `ไม้บรรทัดวัดใจ` — เลือกคะแนนจำนวนเต็ม 0–10 และ reflection/improvement plan optional ไม่เกิน 2,000 ตัวอักษร

แต่ละการ์ดมี pending state, success state, validation/error state และ conflict refresh แยกกัน ไม่ทำให้ทั้งหน้าอยู่ใน loading state เดียว การแสดงผลใช้ existing Button, Alert, StatusBadge และ utility classes ของ design system เดิม โดยรองรับ mobile แบบ stacked และ desktop แบบสองคอลัมน์

Progress เป็นค่าที่ derive จาก record ที่มีอยู่เท่านั้น ไม่มีการ persist `serviceOneCompleted` และไม่มีข้อความ `ผ่าน`, `ไม่ผ่าน`, clinical success หรือ official completion หากทุกกิจกรรมถูกบันทึกจะแสดงเพียงจำนวนเชิงโครงสร้าง

เมื่อ activity ถูกบันทึกแล้ว UI แสดง recorded state, เวลา และผู้บันทึก โดยไม่แสดง Edit form หรือ Edit button การแนบภาพจะแสดงเฉพาะหลัง activity ถูกบันทึก เพื่อให้ evidence association มี activity record เป็น source of truth เดียวกัน

Confidence ถูกนำเสนอเป็น provisional self-reflection measure ไม่ใช่ severity หรือผลคัดกรอง และไม่คัดลอกค่าจาก Screening, Baseline หรือ Follow-up

## Artifact association model

เลือก model เฉพาะชื่อ `PatientProgramServiceOneArtifactAssociation` ไม่สร้าง `entityType/entityId`, `attachmentOwnerType`, JSON metadata-only relation, generic `ActivityAttachment` หรือ gallery

Association มี field สำคัญ:

- `patientProgramId`
- `patientHospitalRelationshipId`
- `patientEvidenceArtifactId`
- nullable `routineId`
- nullable `floatingChartId`
- nullable `dreamCardId`
- `createdAt`

มี database `CHECK` ให้มี activity reference ที่ไม่เป็น null เท่ากับหนึ่งรายการพอดี ดังนั้น confidence ไม่มี artifact association ใน phase นี้ ความสัมพันธ์ที่เลือกเป็น explicit relation ของสามกิจกรรมที่แหล่งข้อมูลรองรับแล้ว และยังแก้ไข/ขยายได้ภายหลังโดยไม่เปิด generic attachment boundary

Canonical file metadata ยังคงอยู่ที่ `PatientEvidenceArtifact` เท่านั้น ไม่ duplicate `storageObjectKey`, hash หรือ file metadata ลง Service 1 activity tables

## Cardinality และ immutability

- Routine มี artifact ได้ไม่เกินหนึ่งรายการ
- Floating/Sinking Chart มี artifact ได้ไม่เกินหนึ่งรายการ
- Dream Card มี artifact ได้ไม่เกินหนึ่งรายการ
- artifact หนึ่งรายการมี Service 1 association ได้ไม่เกินหนึ่งรายการใน exact Patient/Hospital relationship
- artifact เดียวกันจึงไม่สามารถถูกย้ายไปอีก activity หรืออีก Program โดย implicit behavior
- association เดิมที่มี input เดียวกันตอบ `ALREADY_ASSOCIATED` แบบ deterministic
- artifact ใหม่สำหรับ activity ที่มี association แล้วตอบ `ConflictError`
- artifact เดิมที่ผูกกับ activity อื่นหรือ Program อื่นตอบ `ConflictError`
- ไม่มี silent replacement และไม่มี delete/replace semantics ใน phase นี้

Activity และ association เป็น one-time historical records ตาม 15B.1 การแก้ไขหรือ amendment ต้องเป็นงานในอนาคต

## Cross-relationship และ cross-Program integrity

Association ใช้ composite foreign keys ที่มี relationship identity รวมอยู่ด้วย:

- `(patientProgramId, patientHospitalRelationshipId)` → `PatientProgram`
- `(patientEvidenceArtifactId, patientHospitalRelationshipId)` → `PatientEvidenceArtifact`
- `(routineId, patientProgramId)` → `PatientProgramServiceOneRoutine`
- `(floatingChartId, patientProgramId)` → `PatientProgramServiceOneFloatingChart`
- `(dreamCardId, patientProgramId)` → `PatientProgramServiceOneDreamCard`

มี composite unique indexes ที่ parent tables เพื่อรองรับ foreign keys และมี unique indexes ที่ association สำหรับ artifact/activity cardinality ทุก relation ใช้ `ON DELETE RESTRICT` เพื่อไม่ลบประวัติหรือทำให้ association ชี้ไปยัง parent ที่หายไป

ผลคือ artifact จาก relationship A ไม่สามารถถูก associate กับ Program ของ relationship B ได้ แม้ browser จะส่ง ID ที่ดูถูกต้อง และ artifact ของ Program เดิมใน relationship เดียวกันก็ไม่สามารถถูกนำไปใช้กับ Program ใหม่โดย implicit reuse ได้

## Lifecycle และ authorization

การสร้าง Service 1 record และการ associate evidence ใหม่ทำได้เฉพาะเมื่อ Program เป็น `ACTIVE` เท่านั้น `lockActiveProgram` อ่าน scope และ lifecycle ใหม่ใน transaction แล้วทำ conditional write บน Program row เดียวกับ completion path

`COMPLETED` Program:

- อ่าน Program, Service 1 records และ evidence เดิมได้เมื่อมี scope ถูกต้อง
- บันทึก activity ใหม่ไม่ได้
- associate evidence ใหม่ไม่ได้
- UI แสดง read-only state และไม่แสดง controls สำหรับเขียนข้อมูล

Authorization ใช้ Program policy เดิมโดยไม่สร้าง access semantics ใหม่:

- HOSPITAL ต้องมี direct active membership ของ Hospital ที่ตรงกับ exact relationship
- OSM ต้องมี exact active assignment ของผู้ป่วย และ active OSM–Hospital relationship ที่ตรงกัน
- ADMIN-only ไม่ถูกยกระดับเป็น care actor
- Patient self-service ยังไม่เปิด
- actor ถูก derive/re-read ฝั่ง server และ authorization ถูกตรวจใน consistency-critical transaction
- browser ไม่สามารถกำหนด actor, relationship ownership, Hospital scope หรือ ownership ของ artifact ได้

Input association รับเพียง Program ID, artifact ID และ activity ที่อยู่ใน allow-list เซิร์ฟเวอร์ resolve relationship จาก Program และ Artifact จาก exact relationship เอง

## Upload และ storage boundary

UI ใช้ Evidence upload route เดิม:

`Browser FormData → server upload route → exact Evidence authorization → server validation → server storage adapter → PatientEvidenceArtifact`

จากนั้น UI ส่ง artifact ID ที่ server คืนมาเข้า Service 1 association action ซึ่งทำ Program authorization และ lifecycle check ใหม่ ไม่เพิ่ม direct browser-to-Supabase upload และไม่สร้าง upload architecture ชุดที่สอง

กฎ Evidence เดิมยังใช้เหมือนเดิม:

- JPEG, PNG และ WEBP เท่านั้น
- ไฟล์ต้องไม่ว่าง
- ขนาดไม่เกิน 5 MiB ตาม Evidence limits
- ตรวจเนื้อหา/ชนิดไฟล์ฝั่ง server ไม่พึ่ง `accept`, client MIME หรือ client byte size
- object key สร้างโดย server จาก artifact ID
- privileged storage client และ service-role credential ไม่ออกไป browser
- safe filename/object ownership ไม่รับจาก browser

อ่านภาพผ่าน relationship-authorized content route ที่สร้าง short-lived access URL ฝั่ง server ไม่ส่ง raw `storageObjectKey` หรือ permanent private bucket URL ให้ UI

External object upload และ database ไม่ใช่ distributed transaction เดียวกัน จึงคง repository behavior ของ Evidence: ถ้า storage upload สำเร็จแต่ artifact row/transaction ล้ม จะพยายามลบ object เป็น compensation และ log operational failure หากลบไม่สำเร็จ หาก artifact row สำเร็จแต่ association ล้ม artifact ที่ยังไม่ผูกจะคงเป็น relationship-owned Evidence ที่อ่านได้ผ่าน Evidence boundary และไม่ถูกลบอัตโนมัติ เพราะการลบอาจกระทบหลักฐานที่ไม่เกี่ยวข้อง

กรณี Program จบระหว่าง upload กับ association: upload route อาจสร้าง relationship-owned artifact ตาม Evidence contract แต่ association จะ reject เมื่อ re-check พบ Program `COMPLETED` จึงไม่มี Service 1 association ใหม่หลัง completion

## Read projection และ preview

`patientProgramServiceOneSelect` เพิ่มเฉพาะ field ที่ UI ต้องใช้:

- `artifactId`
- `mediaType`
- `byteSize`
- `createdAt`

Routine, Floating/Sinking Chart และ Dream Card ได้ `evidence: ... | null`; Confidence ไม่มี evidence projection ไม่ส่ง `storageObjectKey`, content hash, caption ที่ไม่จำเป็น, membership details หรือ unrelated evidence

Program detail อ่านผ่าน exact relationship + Program scope เดิม ดังนั้น valid Hospital/OSM ที่อ่าน historical completed Program ได้จะอ่านภาพเดิมผ่าน protected route ได้ด้วย ส่วน unrelated Hospital, unrelated OSM และ ADMIN-only ไม่สามารถใช้ artifact ID เพื่อ bypass scope ได้

## Concurrency

ใช้ serializable transaction และ unique constraints ร่วมกัน:

1. concurrent association ของ activity เดียวกัน: unique activity key ทำให้มี association เดียว คำขอที่ชนกันถูก normalize เป็น conflict หรือ retry แล้วได้ deterministic existing result
2. concurrent use ของ artifact เดียวกัน: unique artifact + relationship key ป้องกันการผูกหลาย activity/Program
3. activity submit และ association: association ตรวจว่ามี activity record ก่อนสร้าง relation จึงไม่เกิด relation ลอย
4. Program completion race: association และ completion ใช้ Program lifecycle row lock/conditional update เดียวกัน ผลจึงเป็น association ก่อน completion หรือ reject หลัง completion เท่านั้น
5. OSM reassignment race: access resolver อ่าน authoritative assignment/relationship ใน transaction ไม่เชื่อ page-load state

ไม่มี distributed transaction framework หรือ retry แบบไม่มีขอบเขต

## Audit

การ attach สำเร็จสร้าง audit action:

`patient_program.service_one.artifact_attached`

metadata มีเฉพาะ safe identifiers: Program ID, exact relationship ID, Hospital ID, activity key และ artifact ID ไม่ใส่ image contents, storage object key, summary, dream description, confidence score หรือ improvement plan การ retry แบบ idempotent ไม่สร้าง audit ซ้ำ

## Provisional defaults และ unresolved requirements

ค่าใน phase นี้เป็น safe/reversible defaults ที่ aligned กับ legacy evidence เท่านั้น:

- ภาพของทั้งสาม activity เป็น optional
- summary ของ Floating/Sinking Chart เป็น optional
- description ของ Dream Card เป็น optional
- Routine ไม่มี payload text และไม่บังคับภาพ
- Confidence เป็น integer 0–10 พร้อม optional reflection/improvement plan
- หนึ่งภาพต่อ activity
- activity record และ evidence association เป็น one-time immutable

ยังไม่สรุปเป็น customer requirement:

- image requiredness
- text requiredness
- ทุก activity ต้องทำหรือไม่
- official Service 1 completion criteria
- clinical meaning ของ confidence
- correction/amendment/replacement semantics
- report presentation semantics

## Migration

เพิ่ม migration:

`prisma/migrations/20260821100000_patient_program_service_one_evidence_association/migration.sql`

เป็น additive migration ไม่มี backfill และไม่มี fake association สร้าง table, composite unique indexes, explicit foreign keys, one-activity check และ minimal query indexes โดยไม่ redesign `PatientEvidenceArtifact`, `PatientProgram` หรือ Service 1 text payloads

ไม่มีการเพิ่ม ADR เพราะเป็น narrow relation ที่ใช้ Evidence boundary ที่ accepted แล้ว ไม่ใช่ cross-cutting architecture change

## Verification

ตรวจด้วยฐาน PostgreSQL disposable local ตาม `.env.integration` ที่ `127.0.0.1:55432` ไม่ใช้ production/Supabase:

- `npx prisma validate` — PASS
- `npx prisma generate` — PASS (Prisma Client 6.19.3)
- `npm run prisma:migrate:test` — PASS, 20 migrations applied/no pending
- focused Service 1 association/query/transport/UI/server-action tests — PASS, 20 tests
- `npm run test:integration` — PASS, 18 files / 144 tests
- `npm test` — PASS, 107 files / 681 tests
- `npx tsc --noEmit` — PASS
- `npm run lint` — PASS
- `node .../impeccable/scripts/detect.mjs --json ...` — PASS, no findings
- `git diff --check` — PASS

ข้อจำกัด environment: `npm run test:db:status` และ Docker-managed reset ใช้ไม่ได้ เพราะ Docker Engine ไม่พร้อมใน WSL distribution `Ubuntu` แต่ disposable PostgreSQL ที่ repository กำหนดไว้ยังทำงาน จึงรัน migration และ integration suite ผ่าน local test database path ได้

## Handoff

15B.2 ส่งมอบ Service 1 demo UI, narrow evidence association, secure read/preview, exact authorization และ immutable lifecycle แล้ว งานถัดไปที่แนะนำคือ:

`Phase 15B.3 — Service 1 Integration Hardening & Program Journey Completion`

Phase 15B.3 ควรทบทวน journey end-to-end และ operational hardening โดยยังต้องไม่ยกระดับ provisional defaults ในเอกสารนี้เป็น customer-confirmed completion contract โดยไม่มีหลักฐานใหม่
