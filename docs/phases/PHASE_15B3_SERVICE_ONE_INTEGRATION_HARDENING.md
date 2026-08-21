# Phase 15B.3 — Service 1 Integration Hardening & Program Journey Completion

สถานะ: Implemented

เอกสารนี้เป็น handoff ของ Phase 15B.3 หลัง Phase 15B.2 โดยจำกัดงานไว้ที่การเชื่อมต่อและทำให้เส้นทาง Patient Program + Service 1 ใช้งานได้สอดคล้องกันใน demo ปัจจุบัน ไม่ได้เพิ่ม Service 2, reporting, generic workflow หรือกฎผลลัพธ์ทางคลินิก

## Purpose

ทำให้เส้นทางต่อไปนี้เข้าใจได้และทนต่อ state ที่เปลี่ยนระหว่างใช้งาน:

```text
Patient detail
    → Patient Program
    → Program detail
    → Service 1 activities
    → optional evidence
    → structural progress
    → Program completion
    → historical read-only Program
```

Server, application service, policy และ Prisma ยังคงเป็น boundary เดิมจาก 15B.0–15B.2

## Actual integration gaps found

1. ปุ่มเปิดและจบ Program refresh เฉพาะเมื่อสำเร็จ หากเกิด lifecycle conflict จากคำขออื่น หน้าจออาจยังแสดง state เก่าหลังแสดงข้อความผิดพลาด
2. Completion UX ระบุว่าเป็นการเปลี่ยนสถานะถาวร แต่ยังไม่บอกครบว่า Service 1 และการแนบหลักฐานใหม่จะถูกปิด และการจบ Program ไม่ใช่ผลสำเร็จทางคลินิก
3. Badge `n จาก 4 กิจกรรมถูกบันทึกแล้ว` ใช้สี success เมื่อครบ 4 รายการ ซึ่งอาจทำให้เข้าใจว่าเป็นเกณฑ์ผ่าน แม้ข้อความประกอบจะบอกว่าเป็น structural progress
4. เมื่อ upload สำเร็จแต่ Service 1 association ล้มเหลว UI แสดงเฉพาะ error ของ association จึงไม่อธิบายชัดว่า artifact ยังอยู่ใน Evidence ของ relationship แต่ยังไม่ใช่หลักฐานของกิจกรรมนั้น รวมถึงกรณี response สำเร็จแต่ไม่มี artifact ID ยังไม่ refresh state
5. Regression เดิมยังไม่มี scenario ที่ยืนยัน evidence เดิมอ่านได้หลัง Program completion และไม่มี OSM stale-page mutation หลัง assignment ถูกยกเลิก

ไม่พบ correctness gap ที่ต้องเปลี่ยน active uniqueness, immutable activity model, narrow evidence association, หรือ serializable lifecycle transaction จึงไม่มี schema migration ใน phase นี้

## Changes implemented

### Program lifecycle feedback

- `PatientProgramOpenControl` และ `PatientProgramCompleteControl` เรียก `router.refresh()` เมื่อได้รับ `CONFLICT` เช่นเดียวกับ success เพื่อให้ active/history/read-only state กลับไปยึด server projection ล่าสุด
- Completion confirmation ระบุว่า Program จะเป็นประวัติอ่านอย่างเดียว ปิดการบันทึก/แนบหลักฐาน Service 1 เพิ่ม และไม่ใช่การตัดสินผลทางคลินิก
- Completed detail ใช้ข้อความและ neutral alert ที่สื่อ read-only state โดยไม่ใช้ success color เป็นความหมายของ clinical outcome

### Program and Service 1 UX

- ลบคำว่า `episode` ที่แสดงต่อผู้ใช้และใช้ภาษาผลิตภัณฑ์ เช่น โปรแกรมรอบใหม่และประวัติโปรแกรม
- Progress badge ใช้ neutral presentation เสมอ พร้อมข้อความเดิมเชิงโครงสร้างและคำอธิบายว่าไม่ใช่เกณฑ์ผ่านหรือผลลัพธ์ทางคลินิก
- ปรับ evidence association feedback ให้แยกชัดเจนระหว่าง upload สำเร็จ กับ association สำเร็จ หาก association ล้มเหลวจะ refresh authoritative state และไม่แสดง attached success
- กรณี upload response ไม่สมบูรณ์จะ refresh และแสดงข้อความที่ไม่อ้างว่าผูกกับกิจกรรมแล้ว
- หาก association Server Action คืน application-level `ERROR` ถือเป็น association ที่ล้มเหลวแน่นอนและแสดง deterministic failure; หาก action โยน error จาก transport/runtime จะถือว่าผลลัพธ์ยังไม่ทราบแน่ชัด โดย refresh authoritative state และแจ้งให้ตรวจสอบข้อมูลล่าสุดก่อนลองอีกครั้ง

### Regression coverage

เพิ่ม coverage สำหรับ:

- historical Service 1 activity และ evidence projection หลัง Program completion
- การ reject association ใหม่หลัง completion
- OSM ที่เคยเปิดหน้า Program ขณะ assigned แต่ถูก unassign ก่อน submit mutation
- structural progress ที่ไม่ใช้ success styling เมื่อครบ 4 รายการ
- incomplete upload response ที่ต้อง refresh และไม่เรียก association
- association action ที่โยน error ซึ่งต้อง refresh หนึ่งครั้งและสื่อว่า association outcome ยังยืนยันไม่ได้

## Program journey after hardening

1. ผู้ใช้ HOSPITAL ที่มี direct active membership หรือ OSM ที่มี exact active assignment เปิด Patient detail ได้ตาม relationship scope
2. Program card แสดง active Program, ปุ่มเปิดรายละเอียด, ประวัติ completed Programs และปุ่มเปิดรอบใหม่เมื่อไม่มี active Program และ actor มี manage scope
3. Program detail แสดงสถานะ, เวลาเริ่ม/จบ, initial Baseline identity และ Service 1 projection
4. ACTIVE Program ที่ actor มี manage scope บันทึก Routine, Floating/Sinking Chart, Dream Card และ Confidence แยกกันได้ โดยแต่ละกิจกรรมบันทึกได้ครั้งเดียว
5. Evidence สำหรับสามกิจกรรมที่รองรับจะแนบได้หลังมี activity record แล้วเท่านั้น และ preview ใช้ protected content route เดิม
6. Structural progress แสดงจำนวน record ที่มีอยู่ ไม่ใช่ completion state ของ Service 1
7. Program จบได้ตาม Program contract แม้ Service 1 จะบันทึกเพียงบางกิจกรรม เพราะยังไม่มี requirement ที่กำหนด 4/4 gate
8. หลังจบ Program mutation controls หายไป, Service 1 และ evidence เดิมยังอ่านได้, และ mutation ใหม่ถูก reject ฝั่ง server
9. เมื่อจบ Program A แล้ว สามารถเปิด Program B ได้ตาม contract เดิม โดย Service 1 record และ association ของ B เริ่มจาก state ของ B เอง และ artifact ของ A ไม่ถูก reuse โดย implicit behavior

## Authorization and lifecycle behavior

ยังใช้ policy เดิม ไม่มี access semantics ใหม่:

| Actor | Behavior |
| --- | --- |
| HOSPITAL | ต้องเป็น `Role.HOSPITAL` พร้อม direct active membership ใน Hospital เดียวกับ exact PatientHospitalRelationship และ Hospital ต้อง active |
| OSM | ต้องเป็น `Role.OSM`, มี active OSM–Hospital relationship ที่ตรง Hospital และมี active assignment ของ exact relationship ที่เป็นของ actor ปัจจุบัน |
| ADMIN-only | ไม่มี Program หรือ Service 1 care workflow authority จาก Platform Admin เพียงอย่างเดียว |
| PATIENT | ยังไม่มี self-service Service 1 authority |

ทุก mutation รับเพียง opaque IDs และ payload ตาม schema; actor, relationship, Hospital, assignment, Program lifecycle และ evidence ownership ถูก resolve/re-read ฝั่ง server ไม่เชื่อ browser state

### Completion race

Activity mutation และ evidence association ใช้ serializable transaction พร้อม conditional Program write บน lifecycle row เดียวกับ completion path ผลที่ยอมรับมีเพียง:

```text
Service 1 write/association commit ก่อน → completion commit ภายหลัง
หรือ
completion commit ก่อน → Service 1 write/association ถูก reject
```

จึงไม่มี association หรือ activity record ใหม่ที่ commit หลัง authoritative `COMPLETED` state

## Provisional Service 1 semantics retained

- Routine, Floating/Sinking Chart, Dream Card และ Confidence เป็นสี่ activity ที่รู้จักแน่นอนใน phase นี้
- `n จาก 4 กิจกรรมถูกบันทึกแล้ว` เป็น structural progress เท่านั้น ไม่ใช่ผ่าน/ไม่ผ่าน, clinical success, Service 1 completion หรือ Program eligibility
- ไม่บังคับให้ครบทั้งสี่กิจกรรมก่อนจบ Program
- Evidence ของสามกิจกรรมเป็น optional และ association เป็น one-time immutable; Confidence ไม่มี image association
- Activity และ association ที่สำเร็จแล้วแก้ไข, replace หรือ amend ไม่ได้ใน phase นี้
- Upload artifact และ Service 1 association ยังคงเป็นสอง server operations หาก association ล้มเหลว artifact relationship-owned ที่ upload สำเร็จไม่ถูกลบอัตโนมัติ และ UI จะไม่แสดงว่า activity แนบสำเร็จ

## Tests executed

ผลที่รันจริงในรอบนี้:

- `npm test -- src/modules/patient-program` — PASS, 9 files / 61 tests
- `npx prisma validate` — PASS
- `npx prisma generate` — PASS (`@prisma/client` 6.19.3)
- `npx tsc --noEmit` — PASS
- `npm run lint` — PASS
- `npm test` — PASS, 107 files / 685 tests
- `npm run test:integration` — PASS; Prisma Client generate สำเร็จ, 20 migrations ไม่มี pending, 18 files / 145 tests
- `node C:\Users\Bait0ng\.agents\skills\impeccable\scripts\detect.mjs --json ...changed UI files...` — PASS, no findings (`[]`)
- `git diff --check` — PASS

## Environment limitations

- Integration tests ใช้ disposable/local PostgreSQL ตาม `.env.integration` ที่ `127.0.0.1:55432` และไม่แตะ production หรือ live Supabase data
- `npm run test:integration` ใช้ local integration database path ได้สำเร็จ
- `npm run test:db:status` ตรวจแล้วไม่สำเร็จเพราะ `Docker Engine is unavailable in WSL distribution Ubuntu`; ไม่ได้ทำให้ local disposable PostgreSQL integration path ที่ใช้ทดสอบข้างต้นเสีย และไม่ได้แตะ production หรือ live Supabase data

## Database migration status

ไม่มี schema change และไม่มี migration ใหม่ใน Phase 15B.3 โมเดลและ constraints เดิมจาก 15B.0–15B.2 ยังคงเป็น source of truth สำหรับ:

- one ACTIVE Program ต่อ exact relationship
- one-time Service 1 activity records
- narrow Service 1 artifact association
- cross-relationship และ cross-Program foreign-key isolation
- Program lifecycle checks

## Remaining unresolved customer requirements

รายการต่อไปนี้ยังจงใจไม่ตอบโดยไม่มี accepted requirement:

- ทุก Service 1 activity จำเป็นต้องทำหรือไม่
- Evidence จำเป็นสำหรับกิจกรรมใดหรือไม่
- อะไรคือ official Service 1 completion
- Service 1 completion ต้องเกิดก่อน Program completion หรือไม่
- Confidence มีความหมายทางคลินิกหรือเป็นเพียง reflection อย่างไร
- ต้องมี correction/amendment หรือไม่
- Evidence เปลี่ยนแทนได้หรือไม่
- Patient self-service จะเข้าร่วม Service 1 หรือไม่
- Service 1 จะปรากฏใน report อย่างไร
- ความสัมพันธ์ระหว่าง Service 1 กับ Services ถัดไป
- official Program start/end timing, outcome, requiredness และ reporting projection semantics

Phase นี้จึงไม่เพิ่ม Service 2, reporting/dashboard, clinical score, completion gate, activity editing, evidence replacement หรือ generic workflow

## Handoff recommendation

ก่อนเริ่ม Service 2 หรือ reporting ควรทำ requirement-confirmation phase ที่ปิด semantic contract ของ Program/Service 1, requiredness, correction และ report projection ให้ชัดเจนก่อน โดยยังรักษา narrow Service 1 model และ exact authorization boundary เดิมไว้
