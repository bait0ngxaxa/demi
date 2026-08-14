# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

ผู้ใช้งาน DEMI มี 4 บทบาทระดับบน ได้แก่ `ADMIN`, `HOSPITAL`, `OSM` และ `PATIENT` Phase 3B target เพิ่ม public Hospital applicant ซึ่งยังไม่เป็น role ของระบบจนกว่า Platform `ADMIN` จะอนุมัติ application ผู้สมัครที่อนุมัติแล้วจึงเป็น `HOSPITAL` พร้อม OWNER membership ของ Hospital ที่เกี่ยวข้อง

## Product Purpose

DEMI เป็นระบบสำหรับงานบริการสุขภาพที่แยกบุคคลจริง (`Person`) ออกจากบัญชีแอปพลิเคชัน (`User`) และกำหนดสิทธิ์จากข้อมูล application-side ที่ตรวจสอบบน server Phase 2.1 ให้ผู้ใช้ `ACTIVE` เข้าสู่ protected application shell ได้อย่างปลอดภัย Phase 3B เพิ่ม trusted Hospital organization onboarding และ manual governance review โดยไม่เปลี่ยน authentication foundation

## Positioning

การยืนยันตัวตนจากผู้ให้บริการภายนอกไม่ใช่การอนุญาตให้ใช้ DEMI โดยอัตโนมัติ ทุก session ต้อง map กลับมายัง DEMI User ที่ `ACTIVE` และ resolve เป็น server-side `ActorContext` ก่อนเข้าถึงแอปพลิเคชัน

## Operating Context

- Responsive Web เป็น platform ปัจจุบันและต้องใช้งานได้ดีบนหน้าจอขนาดเล็ก
- ผู้ใช้เข้าสู่ระบบด้วยเลขบัตรประชาชนไทยและ user-owned password โดย server resolve HMAC identity ไปยัง opaque Supabase Auth login alias
- Phase 3B target คือ `/hospital/onboarding` และ Platform Admin review UI โดย business operation อยู่ใน transport-agnostic Application Service
- Staff/OSM invitation, Patient onboarding/activation และ clinical workflows ยังไม่อยู่ใน Phase 3A/3B target

## Capabilities and Constraints

- ไม่มี public role selection หรือ automatic provisioning ระหว่าง login
- Public applicant สร้างได้เฉพาะ Hospital Onboarding Application ที่ match controlled Hospital Master entry; ผู้สมัครสร้าง role, OWNER membership หรือ ACTIVE Hospital เองไม่ได้
- MVP ใช้ manual Platform `ADMIN` approval; approved applicant เป็น `HOSPITAL + OWNER` เฉพาะ Hospital นั้นและไม่เป็น Platform Admin
- Role, membership, capability และ scope ต้องมาจากข้อมูล DEMI ฝั่ง server เท่านั้น
- Phase 3B capability vocabulary จำกัดที่ `hospital:onboard`, `hospital:review`, `hospital:approve`, `hospital:reject`
- Hospital Master เริ่มต้นมี 78 canonical records จาก approved normalized artifact; JSON seed เป็น source ของ controlled reference data และไม่ bind กับ external provider
- Submit ทำให้ applicant เป็น `PROVISIONED` และ application เป็น `PENDING`; approval เท่านั้นจึง activate Hospital/User และสร้าง `HOSPITAL + OWNER`
- UI ต้องเรียบง่ายและไม่สร้าง dashboard หรือ operational workflow ที่ยังไม่มี requirement
- External Hospital Master provider, exact verification evidence, provider-account recovery, Patient activation, staff/OSM invitation, LIFF, ThaID, native authentication และ complete capability matrix ยังเป็น open requirements

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
