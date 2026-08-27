# DEMI Phase 16D.3 — Patient Classification Persistence, History & Roster Reconciliation

**สถานะ:** Implemented

**วันที่ดำเนินการ:** 2026-08-27

**Starting HEAD:** `fa317ebb925739224948ba798203a1f960fb5c81`

Phase นี้เริ่มจาก HEAD ที่ตรวจพบจริงหลังตรวจ branch และ `origin/main` แล้ว โดยไม่
reset หรือเขียนทับการเปลี่ยนแปลงเดิม

## 1. ผลลัพธ์และขอบเขต

ยืนยันและนำ `กลุ่มเสี่ยง` / `เบาหวาน` ไปใช้เป็นสถานะปัจจุบันของผู้ป่วยแบบ
patient-global แล้ว โดยแยก current state ออกจากประวัติการเปลี่ยนแปลง รองรับการ
เปลี่ยนได้ทั้งสองทิศทาง มี audit governance trace และใช้ query ปัจจุบันสำหรับ
รายชื่อ/ตัวนับ

Phase นี้ไม่ทำ OSM roster assignment, Hospital hierarchy หรือ profile/contact/
address persistence

## 2. Vocabulary และ canonical import

ค่าที่ persist ได้มีเพียง:

| ค่าจาก roster | ค่า canonical/Prisma |
| --- | --- |
| `กลุ่มเสี่ยง` | `RISK` |
| `เบาหวาน` | `DIABETES` |

การ normalize ทำ NFC, รวม whitespace ที่ปลอดภัย, trim และจัดการ punctuation รอบ
ขอบเขตที่อนุมัติเท่านั้น ไม่ fuzzy-match ค่าเช่น `เบาหวาน type 2` หรือ `เสี่ยงมาก`
และไม่ persist source string ที่ไม่รู้จัก ค่าเหล่านี้เป็น
`CLASSIFICATION_DATA_INVALID`/แถว invalid

Header aliases เดิม เช่น `ประเภทเบาหวาน` และ `กลุ่มเสี่ยง หรือ เบาหวาน` ยังคง
ระบุ field เดิม ส่วน cell value เป็นผู้กำหนด `RISK` หรือ `DIABETES`

`diabetesClassification` เปลี่ยนจาก parsed-but-not-persisted เป็น field ที่
participate ใน preview, reconciliation, confirm และ persistence เมื่อค่าถูกต้อง

## 3. Schema และ migration

เพิ่ม enum ใน Prisma:

```text
PatientClassificationType: RISK | DIABETES
PatientClassificationSource: ROSTER_IMPORT | MANUAL
```

เพิ่ม model:

- `PatientClassification` — current row หนึ่ง row ต่อ `PatientProfile` ด้วย
  unique constraint, เก็บ classification, `updatedByUserId`, `createdAt`,
  `updatedAt`
- `PatientClassificationHistory` — หลาย row ต่อ `PatientProfile` เก็บ
  `fromClassification` nullable, `toClassification`, `changedAt`,
  `changedByUserId`, `source`

การไม่มี classification หมายถึงไม่มี current row ไม่ได้เพิ่ม `UNKNOWN` หรือค่า
สำหรับ clear status

Migration เดียวที่เพิ่มคือ:

```text
prisma/migrations/20260827120000_patient_classification_persistence/migration.sql
```

Foreign key ใช้ `ON DELETE RESTRICT` ตามแนวทาง history ของ patient domain และไม่
แก้ migration เดิมหรือทำ data backfill

## 4. Patient-global scope และ authorization

Classification ผูกกับ `PatientProfile` ไม่ใช่ `PatientHospitalRelationship` จึงมี
current state เดียวแม้ผู้ป่วยมีหลาย Hospital ความสามารถในการเห็นยังคงขึ้นกับ
patient-access ของแต่ละ Hospital ไม่ได้เปิด cross-Hospital visibility อัตโนมัติ

ใช้ capability แยก:

```text
patient:classification:read
patient:classification:manage
```

สำหรับ mutation server จะ reload actor จากฐานข้อมูลและตรวจครบว่า:

- actor เป็น `ACTIVE` และมี `Role.HOSPITAL`;
- มี direct membership ที่ `ACTIVE` ใน Hospital เดียวกับ relationship;
- membership เป็น `OWNER` หรือ `MEMBER`;
- Hospital เป็น `ACTIVE`;
- Patient มี relationship กับ Hospital นั้นจริง

Hospital `OWNER` และ `MEMBER` จึงเปลี่ยน classification ของผู้ป่วยใน Hospital
ของตนได้ คนละ Hospital ที่มี relationship ที่ถูกต้องก็เปลี่ยน current global row
เดียวกันได้ และ history ระบุ actor แต่ละคน

OSM มี read scope ได้เฉพาะ patient assignment เดิมที่ active แต่ไม่มี manage
scope ใน phase นี้ `ADMIN` แบบไม่มี Hospital scope ก็ไม่มี routine classification
authority

## 5. Current state, history และ audit

`setPatientClassificationInTransaction(...)` รับ `Prisma.TransactionClient` และ
ไม่เปิด nested transaction

- ไม่มี current row + ค่าใหม่: create current และ history `null → value`
- ค่าใหม่เท่ากับ current: `NOOP` ไม่มี history และไม่มี mutation audit
- ค่าใหม่ต่างจาก current: update current และ append history `old → new`
- `changedAt`/เวลาที่ update ใช้ server-side mutation time ไม่รับจาก client,
  workbook หรือ Baseline effective date
- ทุก real mutation เขียน bounded audit event
  `patient_classification.created` หรือ `patient_classification.changed`
- audit metadata มีเฉพาะ patient profile id, ค่าเดิม, ค่าใหม่ และ source ไม่ใส่
  National ID, ชื่อ, address, raw workbook row หรือ measurement

Current row, history row และ audit ถูกเขียนใน caller-owned Serializable transaction
เดียวกัน หาก history/audit ล้มเหลว current state และ mutation อื่นของ row จะ
rollback ทั้งหมด Unique current row และ Serializable retry/recheck ป้องกัน
duplicate semantic transition จาก concurrent same-target mutations

## 6. Roster preview, reconciliation และ binding

แต่ละ row มี `patientClassification` diagnostic แยกจาก core row
`classification` และใช้สถานะ:

```text
NOT_APPLICABLE
CLASSIFICATION_READY
CLASSIFICATION_ALREADY_EXISTS
CLASSIFICATION_CHANGE_REQUIRES_CONFIRMATION
CLASSIFICATION_DATA_INVALID
```

กติกา:

- ไม่มี source value → `NOT_APPLICABLE`, ไม่ mutate
- valid source + ไม่มี current → `CLASSIFICATION_READY`, create ได้
- valid source + ค่าเดิมตรงกัน → `CLASSIFICATION_ALREADY_EXISTS`, NOOP
- valid source + ค่าเดิมต่างกัน → `CLASSIFICATION_CHANGE_REQUIRES_CONFIRMATION`,
  ไม่ import row จนกว่าจะยืนยัน
- invalid/unsupported source → `CLASSIFICATION_DATA_INVALID`, row persist ไม่ได้

Preview binding เดิมยังผูก actor, Hospital, file fingerprint, effective date และ
contract version และเพิ่ม descriptor HMAC ต่อ classification conflict โดยผูก:

```text
actor + target Hospital + file fingerprint + effective date + contract version
+ source row number + current classification + source classification
```

Confirm จะ parse choice ด้วย schema, ตรวจ HMAC, re-read/re-preview ไฟล์และ current
state ก่อนเรียก import service หาก current เปลี่ยนไปเป็น source ระหว่าง preview
กับ confirm จะเป็น authoritative NOOP หากเปลี่ยนเป็นค่าอื่นจะถูกปฏิเสธเป็น stale
reconciliation ไม่เชื่อ arbitrary `patientId/classification/confirmed` จาก browser

UI แสดงข้อความปัจจุบัน/จากไฟล์และ checkbox ภาษาไทยต่อแถว:

```text
ยืนยันเปลี่ยนสถานะผู้ป่วยรายนี้เป็น “...”
```

การกด `ยืนยันนำเข้ารายการที่พร้อม` เพียงอย่างเดียวไม่ใช่ consent ให้ overwrite
classification conflict

## 7. Row transaction และ Baseline compatibility

Roster row orchestrator compose ใน Serializable transaction เดียวตามลำดับ
provision patient, reconcile immutable Baseline และ reconcile classification โดย
เรียก transaction seam ของ classification โดยตรง ไม่เรียก public standalone service
จากภายใน row import

Row ใหม่ที่มี core + Baseline + classification จะ commit พร้อมกัน หาก classification
fail จะ rollback Person, User, PATIENT role, relationship, Baseline, current row,
history และ audit ของ row นั้น แต่ไม่ rollback row อื่น

Phase 16D.2 semantics ไม่เปลี่ยน: Baseline ใช้ shared effective date,
present-field-only comparison และ immutable conflict behavior ส่วน classification
ใช้ server mutation time แยกจาก `PatientBaseline.recordedOn`

## 8. Manual mutation และ history UI

Patient detail เพิ่มส่วน `สถานะผู้ป่วย` แสดง current value, คำเตือนว่าสถานะเป็น
global patient state และ control `กลุ่มเสี่ยง`/`เบาหวาน` สำหรับ actor ที่ policy
อนุญาตเท่านั้น การเปลี่ยน existing value มี explicit browser confirmation และ
server action re-authorize ทุกครั้ง

History แสดงล่าสุดก่อน จำกัดที่ 50 rows และแสดงวันที่/เวลา, สถานะเดิม, สถานะใหม่,
ผู้ดำเนินการแบบ display name ที่ปลอดภัย และ source ภาษาไทย:

```text
ROSTER_IMPORT → นำเข้าจาก roster
MANUAL        → แก้ไขในระบบ
```

ไม่แสดง internal UUID ให้ผู้ใช้เห็น

## 9. Filtering และ counting

Patient directory หลักและ assigned directory เพิ่ม filter:

```text
ทั้งหมด | กลุ่มเสี่ยง | เบาหวาน
```

Filter ยังคง Hospital/assignment scoped ตามเดิม และใช้ current classification
relation เท่านั้น ผู้ป่วยที่ไม่มี current row อยู่ใน `ทั้งหมด` แต่ไม่อยู่ใน
`RISK`/`DIABETES`

หน้า patient list หลักใช้ aggregate query แบบ bounded สำหรับ total, RISK, DIABETES
และ unclassified โดยไม่ count history และไม่เพิ่ม dashboard ใหม่

## 10. Tests และ verification

เพิ่ม focused unit/integration tests ครอบคลุม mapping/whitespace/invalid source,
create/NOOP/change ทั้งสองทิศทาง, history/audit/server time, policy ของ OWNER,
MEMBER, OSM, ADMIN, inactive membership/Hospital, exact relationship, concurrency,
atomic rollback, preview/confirm HMAC, stale recheck, list filter และ current-state
count รวมถึง Baseline regression

ผลที่ตรวจแล้ว:

```text
npx prisma validate                                  PASS
npx prisma generate                                  PASS
npx prisma migrate status (local demi_test)           PASS — schema up to date
npm run lint -- --no-warn-ignored                    PASS
npx tsc --noEmit                                    PASS
npm test                                             PASS — 131 files, 868 tests
focused tests                                       PASS — 13 files, 86 tests
npm run test:integration                             PASS — 22 files, 188 tests
  includes prisma migrate deploy; no pending migrations
```

`npm run test:db:status` ไม่สามารถใช้ตรวจ Docker service ได้ใน environment นี้
เนื่องจาก Docker Engine ไม่พร้อมใน WSL distribution `Ubuntu` แต่ PostgreSQL
integration database ที่ `127.0.0.1:55432` เข้าถึงได้และ migration/status กับ
integration suite ผ่านตามรายการข้างต้น

ข้อมูลทดสอบทั้งหมดเป็น synthetic data ไม่มี real workbook, National ID จริง หรือ
patient PII ใน repository

## 11. Remaining gates และ Phase 16D.4 handoff

ปิด/implemented ใน Phase 16D.3:

- classification current-status semantics
- classification changeability
- vocabulary `RISK` / `DIABETES`
- patient-global current state และ history
- Hospital `OWNER`/`MEMBER` classification authority
- filtering/counting support
- explicit roster conflict reconciliation

ยังเปิดและไม่ถูกแก้ใน phase นี้:

- `IMP-REQ-03` — Hospital / รพ.สต. hierarchy
- `P16C-OSM-01` — OSM roster resolution/assignment workflow และ authority
- `P16C-PROFILE-01` — profile/contact/address persistence ownership

Phase 16D.4 ควรทำ OSM/Coach roster resolution + reconciliation โดยใช้ exact
Hospital, exact eligible OSM candidates, no fuzzy matching และ existing
`PatientOsmAssignment`/OWNER-only policy พร้อม preview states matched, not found,
ambiguous, same assignment และ assignment conflict การทำงานดังกล่าวอยู่นอก
Phase 16D.3
