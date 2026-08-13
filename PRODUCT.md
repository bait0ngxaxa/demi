# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

ผู้ใช้งาน DEMI ที่ได้รับการ provision แล้วใน 4 บทบาทระดับบน ได้แก่ `ADMIN`, `HOSPITAL`, `OSM` และ `PATIENT` โดยหน้าเข้าสู่ระบบและ application shell ระยะนี้เป็น shared experience สำหรับทุกบทบาท

## Product Purpose

DEMI เป็นระบบสำหรับงานบริการสุขภาพที่แยกบุคคลจริง (`Person`) ออกจากบัญชีแอปพลิเคชัน (`User`) และกำหนดสิทธิ์จากข้อมูล application-side ที่ตรวจสอบบน server เป้าหมายของ Phase 2 คือให้ผู้ใช้ DEMI ที่ได้รับอนุญาตและมีสถานะ `ACTIVE` เข้าสู่ protected application shell ได้อย่างปลอดภัย

## Positioning

การยืนยันตัวตนจากผู้ให้บริการภายนอกไม่ใช่การอนุญาตให้ใช้ DEMI โดยอัตโนมัติ ทุก session ต้อง map กลับมายัง DEMI User ที่ `ACTIVE` และ resolve เป็น server-side `ActorContext` ก่อนเข้าถึงแอปพลิเคชัน

## Operating Context

- Responsive Web เป็น platform ปัจจุบันและต้องใช้งานได้ดีบนหน้าจอขนาดเล็ก
- ผู้ใช้เข้าสู่ระบบด้วยความสามารถ email/password ของ Supabase Auth ที่โปรเจกต์ตั้งค่าไว้
- Hospital/OSM/Patient onboarding, activation และ invitation workflow ยังไม่อยู่ใน Phase 2

## Capabilities and Constraints

- ไม่มี public role selection หรือ automatic provisioning ระหว่าง login
- Role, membership, capability และ scope ต้องมาจากข้อมูล DEMI ฝั่ง server เท่านั้น
- หน้า `/login`, `/app` และ logout เป็นขอบเขต UI ของ Phase 2
- UI ต้องเรียบง่ายและไม่สร้าง dashboard หรือ operational workflow ที่ยังไม่มี requirement
- Patient activation, Hospital verification, staff/OSM invitation, LIFF, ThaID, native authentication และ capability matrix ยังเป็น open requirements

## Brand Commitments

- ใช้ชื่อผลิตภัณฑ์ “DEMI” โดยไม่มีโลโก้หรือ brand asset เพิ่มเติม
- UI และข้อความโต้ตอบใช้ภาษาไทย
- บุคลิกของผลิตภัณฑ์สุภาพ เรียบง่าย เหมาะกับระบบสุขภาพ และเป็นกลางต่อทุกบทบาท

## Evidence on Hand

เอกสาร architecture baseline, accepted ADRs, Prisma schema และ Phase 1 authentication/authorization tests ภายใน repository เป็นหลักฐานของ product boundary ปัจจุบัน ไม่มีโลโก้ ภาพประกอบ คำรับรอง หรือข้อมูลเชิงพาณิชย์สำหรับนำมาใช้ใน UI

## Product Principles

- DEMI authorization ต้องแยกจาก provider authentication อย่างชัดเจน
- ทุก protected access ต้องตรวจฝั่ง server และ fail closed
- ผู้ใช้ไม่กำหนดบทบาทหรือขอบเขตสิทธิ์ให้ตนเอง
- ใช้งานง่ายบน mobile โดยไม่ลดทอนความปลอดภัยหรือความชัดเจน
- Implement เฉพาะ requirement ที่ยืนยันแล้วและคง architecture ให้พร้อมต่อ transport อื่นในอนาคต

## Accessibility & Inclusion

หน้า login และ application shell ต้องรองรับ keyboard, label ที่ชัดเจน, loading/error state ที่อ่านได้ และ responsive layout สำหรับหน้าจอขนาดเล็ก
