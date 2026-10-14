# Phase B — Hospital operations

ต่อจาก Phase A commit `12d5607` บน branch `feat/ops-phase-b`.

## Behavior และ source

| ขอบเขต | Implementation / จุดใช้งาน |
| --- | --- |
| PAT-08, WB-DF-10/11 | `PatientHospitalHealthHistory` หนึ่งรายการต่อ PatientHospitalRelationship; YES/NO/UNKNOWN, โรคอื่น, ประวัติญาติสายตรง และปี พ.ศ. วินิจฉัย. เจ้าหน้าที่ exact ACTIVE OWNER/MEMBER แก้ผ่าน `/app/patients/[relationshipId]/profile`; SELF อ่าน “ข้อมูลสุขภาพ” ใน `/app/personal/care/[relationshipId]`; ผู้มีสิทธิ์ care อ่านที่รายละเอียดผู้ป่วยและหัวสัญญาณชีพรายครั้ง |
| APT-04, WB-DF-06 | `PatientAppointmentRescheduleRequest` มี nonce/source/sourceAppointmentUpdatedAt/resolve fields. รายละเอียดนัด Work/Personal มีคำขอและประวัติ. อนุมัติผ่าน edit เดิมที่ผูก request ID แสดงเหตุผล/ตัวเลือกและเริ่มจากตัวเลือกแรก; APPROVED เฉพาะเมื่อเวลาเปลี่ยนและ transaction สำเร็จ; REJECTED ต้องมีเหตุผล; การแก้นัดอื่นหรือ terminal transition จะ SUPERSEDED |
| APT-07, WB-DF-07 | ใช้ HOME_VISIT เดิมสำหรับเยี่ยมบ้าน/ชุมชน. อสม. ที่ยังได้รับมอบหมายสร้างได้ และแก้/ยกเลิกเฉพาะนัดที่ตนสร้าง. responsibleUserId = null; creator และ assignment snapshot เดิมยังเก็บ. ห้ามคลินิก/ออนไลน์/อื่น ๆ และ complete/no-show |
| OWNER-08/11, WB-DF-08 | OWNER-only “นำออกจากระบบ” ต้องพิมพ์ยืนยัน. Serializable transaction ทำ ENDED + จบ assignment ในโรงพยาบาลนี้ + เพิกถอน workforce activation/reset ที่ค้าง + audit. Last eligible OWNER guard ใช้ร่วมกับ demotion; database trigger ป้องกัน restore. Provisioning สร้าง relationship ใหม่ ไม่เปลี่ยน ENDED เดิม |
| OWNER-04, WB-DF-09 | exact ACTIVE OWNER/MEMBER แก้ PatientHospitalProfile เท่านั้น: เบอร์ ที่อยู่/องค์ประกอบ ผู้ติดต่อฉุกเฉิน อาชีพ การศึกษา. strict schema ปฏิเสธ Person identity/ชื่อ-สกุล; version CAS และ audit ใน transaction เดียว |
| รายงาน | ใช้ประวัติโรงพยาบาลปัจจุบัน: ปี พ.ศ. ปัจจุบันประเทศไทย − diagnosisYear; ไม่ทราบเป็น NOT_RECORDED. Dashboard UI และคอลัมน์ E ทั้งสอง sheet ใช้ fact เดียวกัน. Golden coverage: SOURCE_READY 96 / DECISION_OPEN 2 / SOURCE_MISSING 10 |

## กลุ่มไฟล์ที่เปลี่ยน

- `prisma/schema.prisma` และสอง migrations ของ Phase B.
- `src/modules/patient-hospital-profile`: schemas, health-history read/write, staff profile update และ server actions.
- `src/modules/appointments`: policy/access, schemas, request/history/resolve services, linked edit และ actions.
- `src/modules/workforce`: release capability/schema/service/action และ live-relationship provisioning selectors; selectors ที่ใช้ร่วมใน Hospital onboarding/Patient provisioning ปรับตาม partial uniqueness.
- `src/modules/reporting`: source select/projection/workbook และ coverage/golden contract.
- `app/app/patients`, `app/app/personal`, `app/app/workforce`, `app/app/hospitals/reporting`: forms, readback, request history, permission controls และ report display.
- Unit/rendering/integration tests ของพื้นที่ที่เปลี่ยน; canonical rows, WB decisions และ workbook coverage docs.
- ไม่รวม `.impeccable/config.json` ที่มีอยู่ก่อนเริ่มงาน.

## Security และ concurrency

- mutation อ่าน actor/membership/assignment ปัจจุบันจากฐานข้อมูล ไม่ใช้ browser role หรือ cached ActorContext เป็น authority; ENDED ไม่ผ่าน ACTIVE checks.
- เปลี่ยน compound uniqueness ของ staff/OSM เป็น partial unique index ของ relationship ที่ยังไม่ ENDED เพื่อรักษารายการประวัติและรองรับ re-provisioning.
- partial unique index บังคับหนึ่งคำขอเลื่อนนัด PENDING ต่อ appointment; nonce replay ต้องตรง appointment, actor, source, version, เหตุผล และตัวเลือกเวลา.
- การอนุมัติคำขอและการเปลี่ยนเวลา/audit/LINE outbox เป็น transaction เดียว. ไม่มี success เมื่อ appointment/request ล้าสมัยหรือ audit ล้มเหลว.
- SELF historical readback คงใช้ตัวตรวจสิทธิ์ SELF เดิมเมื่อโรงพยาบาลถูกระงับ; ไม่มีสิทธิ์ส่งคำขอหรือแก้ไขในสถานะนั้น. Work mutations ยังคงต้องมีโรงพยาบาลและ relationship ACTIVE.
- โปรไฟล์และประวัติสุขภาพใช้ expectedVersion = 0 เมื่อยังไม่มี local record; competing create/update ให้ conflict.
- audit เก็บ actor/resource/version/transition/count ไม่ใส่ข้อมูลติดต่อ สุขภาพ ข้อความเหตุผล หรือ plaintext credentials.
- Product Owner ยืนยันให้ญาติคง `family-appointment-read-v1`: ไม่เพิ่มเหตุผลหรือประวัติการดำเนินการของคำขอใน delegated read.

## Migrations

- `20261017090000_workforce_ended_status`: เพิ่ม enum ENDED แยก migration เพื่อ commit enum ก่อนใช้ใน partial indexes.
- `20261017100000_ops_phase_b`: health history, reschedule requests, constraints/indexes/FKs และ terminal relationship triggers.
- ตรวจแล้วว่า migrations apply ได้บน PostgreSQL 17 test database ทั้งการเพิ่มจากฐานเดิมและสร้างใหม่; integration workflow ใช้ฐานทดสอบหลัง apply จริง.
- ใช้การ revoke Supabase Data API privileges สำหรับ current/future tables ตาม migration hardening เดิม; application authorization อยู่ใน server services ผ่าน Prisma.

## Verification

- `npx prisma validate` และ `npx prisma generate`: ผ่าน.
- `npm run typecheck`: ผ่าน.
- `npm run lint -- --max-warnings=0`: ผ่าน.
- `npm run test`: 337 files / 3,055 tests ผ่านในรอบยืนยันสุดท้าย. รอบแรกพบ 7 failures ใน renderer/ข้อความของ tests หน้านัดหมาย; ปรับ page ให้โหลดข้อมูลก่อนส่งเข้า pure view และแก้ expectation ตาม contract ใหม่ แล้ว focused tests ผ่านก่อนรันยืนยัน.
- Focused unit/policy/schema/report tests: ผ่าน รวม golden คอลัมน์ E ทั้งสอง sheet.
- `npm run test:integration:focused -- tests/integration/ops-phase-b.integration.test.ts`: 8 tests ผ่าน ครอบคลุม source/readback/report, conflict/identity rejection, requests/approval/rejection/race/rollback/LINE intent, OSM home-visit bounds, release/restore/re-provisioning และ last-owner concurrency รวม historical SELF readback เมื่อโรงพยาบาลถูกระงับ.
- `npm run test:integration`: 44 files / 813 tests ผ่าน; หลังปรับ SELF readback เฉพาะส่วนเพิ่ม รัน focused Phase B อีกครั้ง 8 tests ผ่าน.
- Impeccable detector ของ UI ที่เพิ่ม/แก้: ไม่มี findings.

## ข้อจำกัดการตรวจ

ไม่ได้ส่ง LINE Push ไปยังผู้ใช้จริง; ตรวจการสร้าง PENDING intent ที่ใช้ delivery pipeline เดิม. ไม่ได้ deploy หรือ apply migration ใน production. ไม่มี `lint:strict`/`architecture:check` script ใน package.json จึงใช้ lint แบบ zero warnings และตรวจ module imports/diff. ไม่เริ่ม dev server หรือ production build; browser UAT ยังต้องตรวจบน environment ที่มี session ของแต่ละบทบาท.
