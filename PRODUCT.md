# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

ผู้ใช้งาน DEMI มี 4 บทบาทระดับบน ได้แก่ `ADMIN`, `HOSPITAL`, `OSM` และ `PATIENT` Phase 3B target เพิ่ม public Hospital applicant ซึ่งยังไม่เป็น role ของระบบจนกว่า Platform `ADMIN` จะอนุมัติ application ผู้สมัครที่อนุมัติแล้วจึงเป็น `HOSPITAL` พร้อม OWNER membership ของ Hospital ที่เกี่ยวข้อง Hospital personnel ใช้ `HOSPITAL` กับ `HospitalMembership(MEMBER)` และ profession classification ส่วน OSM ใช้ `OSM` กับ Hospital association model แยก

## Product Purpose

DEMI เป็นระบบสำหรับงานบริการสุขภาพที่แยกบุคคลจริง (`Person`) ออกจากบัญชีแอปพลิเคชัน (`User`) และกำหนดสิทธิ์จากข้อมูล application-side ที่ตรวจสอบบน server Phase 2.1 ให้ผู้ใช้ `ACTIVE` เข้าสู่ protected application shell ได้อย่างปลอดภัย Phase 3B เพิ่ม trusted Hospital organization onboarding และ manual governance review โดยไม่เปลี่ยน authentication foundation

## Positioning

การยืนยันตัวตนจากผู้ให้บริการภายนอกไม่ใช่การอนุญาตให้ใช้ DEMI โดยอัตโนมัติ ทุก session ต้อง map กลับมายัง DEMI User ที่ `ACTIVE` และ resolve เป็น server-side `ActorContext` ก่อนเข้าถึงแอปพลิเคชัน

## Operating Context

- Responsive Web เป็น platform ปัจจุบันและต้องใช้งานได้ดีบนหน้าจอขนาดเล็ก
- ผู้ใช้ Hospital เข้าสู่ระบบด้วยเลขบัตรประชาชนไทยและ user-owned password; Platform Admin ใช้ตัวระบุที่ตั้งจาก trusted bootstrap ในช่อง login เดียวกัน โดย server resolve HMAC identity ไปยัง opaque Supabase Auth login alias
- Phase 3B target คือ `/hospital/onboarding` และ Platform Admin review UI โดย business operation อยู่ใน transport-agnostic Application Service
- Fresh environment ใช้ trusted interactive `npm run admin:bootstrap` เพื่อสร้าง Platform `ADMIN` คนแรก; ไม่มี public admin signup และ target environment มาจาก credentials ของ process ปัจจุบัน
- Phase 4A ปิด contract และ Phase 4B implement แล้วสำหรับ workforce provisioning + first-time activation MVP; Phase 5B.2 implement แล้วสำหรับ Patient first-time activation MVP; รายละเอียด implementation อยู่ที่ [Phase 4B handoff](docs/phases/PHASE_4B_WORKFORCE_PROVISIONING.md) และ [Phase 5B.2 handoff](docs/phases/PHASE_5B2_PATIENT_FIRST_TIME_ACTIVATION.md)

## Capabilities and Constraints

- ไม่มี public role selection หรือ automatic provisioning ระหว่าง login
- มีเฉพาะ first-admin bootstrap แบบ trusted CLI/server-side operation; bootstrap ปฏิเสธทันทีเมื่อมี `UserRole.ADMIN` ใด ๆ อยู่แล้ว และไม่ใช่ generic admin-management system
- Public applicant สร้างได้เฉพาะ Hospital Onboarding Application ที่ match controlled Hospital Master entry; ผู้สมัครสร้าง role, OWNER membership หรือ ACTIVE Hospital เองไม่ได้
- MVP ใช้ manual Platform `ADMIN` approval; approved applicant เป็น `HOSPITAL + OWNER` เฉพาะ Hospital นั้นและไม่เป็น Platform Admin
- Role, membership, capability และ scope ต้องมาจากข้อมูล DEMI ฝั่ง server เท่านั้น
- Phase 3B capability vocabulary จำกัดที่ `hospital:onboard`, `hospital:review`, `hospital:approve`, `hospital:reject`
- Phase 4B workforce provisioning จำกัดที่ active Hospital Owner ของ target Hospital โดยใช้ operation vocabulary `membership:read`, `membership:create` และ `osm:provision`; ordinary Hospital member และ Platform `ADMIN` ไม่ bypass policy
- Hospital personnel ใช้ `HOSPITAL + HospitalMembership(MEMBER)` กับ `DOCTOR`, `NURSE`, `COORDINATOR` หรือ `OTHER`; profession ไม่ใช่ top-level role หรือ authority ด้วยตัวเอง
- OSM ใช้ `OsmHospitalRelationship` แยกจาก `HospitalMembership` และ relationship นี้หมายถึง OSM–Hospital association เท่านั้น ไม่ใช่ area, assigned patient หรือ clinical scope
- New workforce account เริ่ม `PROVISIONED` และ target user activate ด้วย opaque one-time activation URL; QR และ assisted in-person เป็น presentation ของ capability เดียวกัน โดย target เป็นผู้ตั้ง password เอง
- Copy link/QR มี expiry default 24 ชั่วโมง และ assisted activation 15 นาที; email, SMS และ LINE/LIFF ไม่ใช่ core activation dependency แต่อาจเป็น future delivery channels ส่วน ThaID และ external identity ต้องมี decision แยก
- Existing `ACTIVE` user ที่มี valid provider mapping และ credential ownership แล้ว reuse identity และเพิ่ม relationship ได้โดยไม่เรียก provider หรือ activation ซ้ำ
- New staff/OSM activation ใช้ one-time URL ที่เก็บเฉพาะ digest, รองรับ QR และ assisted handoff; target user ตั้ง password เอง แล้วกลับเข้าสู่ existing `/login`
- Patient activation ใช้ `PatientActivation` แยก purpose จาก WorkforceActivation; Hospital actor ที่มี direct active membership ออก one-time link/QR ให้ Patient ตั้ง password เอง แล้วกลับเข้าสู่ existing `/login`
- Hospital Master เริ่มต้นมี 78 canonical records จาก approved normalized artifact; JSON seed เป็น source ของ controlled reference data และไม่ bind กับ external provider
- Submit ทำให้ applicant เป็น `PROVISIONED` และ application เป็น `PENDING`; approval เท่านั้นจึง activate Hospital/User และสร้าง `HOSPITAL + OWNER`
- UI ต้องเรียบง่ายและไม่สร้าง dashboard หรือ operational workflow ที่ยังไม่มี requirement
- External Hospital Master provider, exact verification evidence, provider-account recovery, long-term Patient identity-proofing/recovery, OSM clinical/geographic scope, patient assignment, ownership governance, parent/child authority, staff transfer, LIFF, ThaID, native authentication และ complete capability matrix ยังเป็น open requirements

## Brand Commitments

- ใช้ชื่อผลิตภัณฑ์ “DEMI” โดยไม่มีโลโก้หรือ brand asset เพิ่มเติม
- UI และข้อความโต้ตอบใช้ภาษาไทย
- บุคลิกของผลิตภัณฑ์สุภาพ เรียบง่าย เหมาะกับระบบสุขภาพ และเป็นกลางต่อทุกบทบาท

## Evidence on Hand

เอกสาร architecture baseline, accepted ADRs, Prisma schema และ Phase 1 authentication/authorization tests ภายใน repository เป็นหลักฐานของ product boundary ปัจจุบัน ไม่มีโลโก้ ภาพประกอบ คำรับรอง หรือข้อมูลเชิงพาณิชย์สำหรับนำมาใช้ใน UI

## Product Principles

- DEMI authorization ต้องแยกจาก provider authentication อย่างชัดเจน
- Hospital organization identity ต้องมาจาก canonical `hospitalCode` ไม่ใช่ applicant-controlled free-text name
- ทุก protected access ต้องตรวจฝั่ง server และ fail closed
- ผู้ใช้ไม่กำหนดบทบาทหรือขอบเขตสิทธิ์ให้ตนเอง
- ใช้งานง่ายบน mobile โดยไม่ลดทอนความปลอดภัยหรือความชัดเจน
- Implement เฉพาะ requirement ที่ยืนยันแล้วและคง architecture ให้พร้อมต่อ transport อื่นในอนาคต
- ก่อนเปิด public traffic ต้องมี shared/deployment-level abuse protection/rate limiting และ owner/process สำหรับ production master-data updates กับ verification evidence

## Accessibility & Inclusion

หน้า login และ application shell ต้องรองรับ keyboard, label ที่ชัดเจน, loading/error state ที่อ่านได้ และ responsive layout สำหรับหน้าจอขนาดเล็ก
