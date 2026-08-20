# Phase 14B — DEMI Demo Productization & UX Polish

สถานะ: ปิดแล้วหลังผ่าน Phase 14B.1 post-review fixes และ integration sign-off

## Problem statement

ระบบ rewrite มี business flow สำหรับ workshop ครบเพียงพอแล้ว แต่ประสบการณ์ใช้งานยังมีข้อความแบบ engineering prototype, การแสดงสถานะระหว่างดำเนินการยังไม่ชัด และการเตรียมข้อมูล demo ต้องใช้เลขบัตรประชาชนที่ผ่าน checksum เสมอ Phase นี้จึงปรับเฉพาะ development ergonomics, query usability, interaction feedback และภาษาที่ผู้ใช้เห็น โดยไม่เปลี่ยน business หรือ security boundary ที่ยอมรับไว้

## Implemented scope

### Development National ID mode

- เพิ่มตัวเลือก `DEMI_ALLOW_TEST_NATIONAL_IDS` ใน `.env.example`
- เปิดใช้ได้เมื่อกำหนดค่าเป็น `true` อย่างชัดเจน และ `NODE_ENV` เป็น `development` หรือ `test` เท่านั้น
- ยังคงตรวจว่าต้องเป็นตัวเลข 13 หลักและ category digit ต้องผ่านกฎเดิม
- bypass เฉพาะ checksum เพื่อรองรับค่า demo เช่น `1111111111111`
- production จะบังคับ checksum เสมอ แม้มีการส่งค่า bypass เข้ามาที่ factory
- การตรวจสอบยังรวมศูนย์อยู่ที่ `src/modules/identity/schemas/identity-schemas.ts`

### Patient activation: search by name

- เพิ่ม `NAME` เป็น lookup type ของการเปิดใช้งานบัญชีผู้ป่วย
- ค้นหาแบบแยกคำตาม whitespace และให้ทุกคำต้องตรงกับ `givenName` หรือ `familyName` แบบไม่คำนึงถึงตัวพิมพ์
- จำกัดผลลัพธ์ไว้ที่ 25 รายการเช่นเดิม หากมากกว่านั้นจะ fail safely โดย NAME แนะนำให้ระบุชื่อเพิ่ม ส่วน lookup type อื่นแนะนำให้ตรวจสอบข้อมูลหรือติดต่อผู้ดูแลระบบ ไม่เลือก subset แบบเงียบ ๆ
- ยังคงตรวจ actor, สิทธิ์, Hospital ที่เลือก, Patient eligibility และ result projection ฝั่ง server ก่อนคืนผล
- เงื่อนไขค้นหาและผลสำเร็จของ NATIONAL ID และ HN lookup รวมถึงขั้นตอนออกลิงก์ยังใช้ behavior เดิม

### Interaction feedback

- ขยาย `Button` ให้รองรับ spinner, `aria-busy` และ disabled state ระหว่าง pending
- เพิ่ม loading feedback ให้ login, ค้นหา, บันทึก, อนุมัติ/ปฏิเสธ, provisioning, activation, governance/lifecycle และ workflow ผู้ป่วยที่มีอยู่
- เพิ่ม contextual loading skeleton สำหรับ route/data loading ที่เห็นได้ชัด โดยไม่เปลี่ยน server-first flow
- รักษาผลลัพธ์เดิมระหว่างค้นหาใหม่ พร้อมบอกสถานะว่ากำลังอัปเดตผล
- ใช้ `Alert` ใกล้ operation ที่เกี่ยวข้อง พร้อม `role="alert"`/`role="status"` และข้อความที่บอกแนวทางถัดไป
- ผลสำเร็จของ mutation ยังคงแสดง inline ในบริบทของรายการหรือผลลัพธ์ ไม่เพิ่ม toast framework

### Wording and business language

- เปลี่ยนชื่อ action หลักของผู้ป่วยเป็นภาษาไทย: `แบบประเมิน`, `แผนเป้าหมายและกิจกรรม`, `นัดหมาย` และ `การติดตามผล`
- เปลี่ยนสถานะและผลลัพธ์ที่ผู้ใช้เห็นจาก enum/code เป็นป้ายภาษาไทย เช่น `ออกลิงก์แล้ว`, `หมดอายุ`, `ทำได้บางส่วน` และ `พบผู้ป่วยหลายรายการ`
- ลบ warning block ที่แสดงคำว่า `ต้นแบบเพื่อเก็บ Requirement` ออกจากหน้าการใช้งานจริงของ Screening, Goal Plan, Follow-up, Appointment และส่วนที่เกี่ยวข้อง
- ลบรายละเอียดภายในที่ไม่ช่วยการทำงาน เช่น รหัสกิจกรรมในฟอร์มติดตามผล และแปลง validation feedback ที่ผู้ใช้เห็นเป็นภาษาไทย
- คงคำที่เป็นชื่อมาตรฐานหรือจำเป็นต่อความเข้าใจไว้ เช่น DEMI, HN, OSM, PAM, PROMs, DTX, หน่วยวัด, JPEG/PNG/WEBP และ Excel
- ไม่เปลี่ยน technical identifiers, enum values, version keys หรือ historical requirement documents

## Explicitly excluded business requirements

Phase นี้ไม่ได้ตัดสินหรือเปลี่ยน unresolved decisions จาก Phase 14A รวมถึงความหมายทางคลินิกของระดับ/โซน, ownership และ visibility ของข้อมูล, Patient self-service, account recovery, reconciliation, OSM scope, lifecycle governance, reporting, correction/retention และ policy ที่ยังรอ customer workshop

ไม่มี schema/database migration, capability ใหม่, authorization redesign, i18n framework, toast framework หรือ state-management framework เพิ่มเข้ามา

## Verification performed

- `npm run lint` — ผ่าน
- `npm run typecheck` — ผ่าน
- targeted unit/transport tests สำหรับ National ID และ patient activation Server Action — ผ่าน 27 tests ใน 2 test files
- `npm test` — ผ่าน 612 tests ใน 94 test files
- `npm run test:integration` — Prisma generate และ migrations ผ่าน จากนั้น integration suite ผ่าน 129 tests ใน 17 test files

## Post-review fixes / Phase 14B.1

- ปรับข้อความเมื่อผลค้นหากำกวมให้สอดคล้องกับ lookup type: NAME แนะนำให้ระบุชื่อเพิ่ม, HN แนะนำให้ตรวจสอบข้อมูลหรือติดต่อผู้ดูแลระบบ และ NATIONAL_ID แนะนำให้ติดต่อผู้ดูแลระบบโดยไม่เปิดเผยรายละเอียดภายใน
- เปลี่ยน National ID checksum bypass เป็น fail-closed allowlist โดยต้องมีทั้ง `DEMI_ALLOW_TEST_NATIONAL_IDS=true` และ `NODE_ENV` ที่เท่ากับ `development` หรือ `test`; production, ค่าที่ไม่รู้จัก และค่าที่หายไปยังคงตรวจ checksum อย่างเคร่งครัด
- ปุ่มออกจากระบบใช้ shared `Button` loading behavior แล้ว จึงมี spinner, `aria-busy` และ disabled state จากจุดเดียวกัน
- รัน integration workflow จริงสำเร็จครบทั้ง Prisma generate, migration deploy และ integration tests จึงปิด Phase 14B ได้

## Known remaining UX issues

ประเด็นที่ต้องใช้ customer requirements ก่อนจึงจะปรับต่อได้ ได้แก่ ความหมายและการแสดงผลทางคลินิกของ Screening level/zone, Patient self-service, account recovery, reconciliation, lifecycle/governance ที่ยังเปิดอยู่ และกติกา ownership/visibility/correction ของข้อมูลผู้ป่วย การคง behavior เหล่านี้ไว้ไม่ใช่การปิด requirement
