# DEMI Project Context

เอกสารนี้เป็นจุดเริ่มต้นแบบกระชับสำหรับ developer และ AI coding agent ก่อนลงมือเปลี่ยนระบบ อ่านรายละเอียดที่ [Architecture Baseline](./architecture/DEMI_ARCHITECTURE_BASELINE.md) และเหตุผลของแต่ละ decision ที่ [ADR Index](./adr/README.md)

## Project Purpose

DEMI กำลังถูก redesign/rewrite ใหม่เพื่อแยก identity, account, role, membership, authorization และ operational responsibility ออกจากกันอย่างชัดเจน

Legacy DEMI repository ใช้ศึกษา behavior, terminology และ domain knowledge เดิมได้เท่านั้น ไม่ใช่ target architecture และไม่ใช่ source of truth สำหรับ authentication, authorization, role model หรือ data-access pattern ของระบบใหม่

## Current Phase

โปรเจกต์อยู่ในช่วง **initialization + requirement discovery** ยังไม่มีการยืนยัน business flow โดยละเอียดครบทุก domain หรือทุก actor เอกสารชุดนี้จึงกำหนดเฉพาะ architecture baseline ที่ยอมรับแล้ว และระบุเรื่องที่ยังต้องเก็บ requirement แยกไว้

## Accepted Actors

Top-level business roles ที่ยืนยันแล้วมี 4 รายการ:

| Actor | Responsibility |
| --- | --- |
| `ADMIN` | DEMI Platform Admin ดูแล governance, hospital verification, audit, recovery, reconciliation และ exceptional cases ไม่ใช่ผู้ปฏิบัติงานประจำใน patient workflow |
| `HOSPITAL` | สมาชิกของโรงพยาบาลหรือองค์กรบริการสุขภาพ เป็น actor ฝั่งบริการ/ดูแลเคสภายใน capability และ scope ที่ business requirement อนุญาต |
| `OSM` | อสม. หรือ field operator ทำงานภาคสนามภายใน assignment/scope ที่จะต้องยืนยันจาก requirement |
| `PATIENT` | ผู้ป่วยที่เป็น actor ของระบบและทำ self-service ได้เฉพาะข้อมูลหรือ action ของตนที่ policy อนุญาต |

## Critical Architecture Rules

- `Person` คือบุคคลจริง และแยกจาก `User` ซึ่งเป็น application account
- หนึ่งคนต้องไม่ถูกสร้าง duplicate core identity เพียงเพราะมีหลาย role
- User มีหลาย role ได้
- User มีหลาย hospital membership ได้โดยไม่สร้าง User หรือ Person ซ้ำ
- Doctor/Nurse เป็น profession classification ก่อน ไม่ใช่ top-level authorization role
- Hospital Owner คือ `HOSPITAL` + owner membership และไม่ใช่ Platform `ADMIN`
- ไม่มี generic public signup ที่ให้ผู้ใช้เลือก role เอง
- Public signup ใช้สำหรับ Hospital organization onboarding
- Staff/OSM ถูก provision หรือ invite จาก trusted hospital context และไม่ self-assign role
- Patient ที่ Hospital/OSM provision แล้วไม่ register ซ้ำ แต่ใช้ first-time account activation
- Provisioning identity แยกจาก credential ownership; staff/OSM ต้องไม่รู้หรือกำหนด patient secret
- Authorization ตัดสินด้วย `Role + Capability + Scope` ผ่าน server-side policy และต้อง fail closed
- Browser, client state หรือ request parameter ไม่ใช่ authority สำหรับ permission หรือ scope
- Multi-record business operation ที่ consistency-critical ต้องเป็น transactional
- Admin เน้น governance/recovery ไม่ใช่ routine operational workflow

## Application Architecture

```text
Client / UI
    ↓
Server Action / Route Handler
    ↓
Application Service
    ↓
Policy / Authorization
    ↓
Prisma
    ↓
PostgreSQL / Supabase
```

| Layer | Responsibility |
| --- | --- |
| Client / UI | Rendering, form interaction และ UX; แสดงผลตามสิทธิ์ได้แต่ไม่ตัดสิน authorization ขั้นสุดท้าย |
| Server Action / Route Handler | Transport boundary สำหรับ authentication/session resolution, input validation และเรียก application service |
| Application Service | Orchestrate business operation, business rules, policy และ persistence โดยไม่กลายเป็น god module |
| Policy / Authorization | ประเมิน actor, role/membership, capability, target resource และ scope; ambiguity หรือ resolution failure ต้องจบด้วย deny |
| Prisma | Typed persistence, scoped queries และ transaction; ไม่ใช่ authorization engine |
| PostgreSQL / Supabase | เก็บและบังคับใช้ data integrity ตามที่กำหนด; managed provider ไม่ได้แทน application authorization |

UI หรือ page component ต้องไม่ถือ business rule/query เป็น source of truth และห้ามย้าย logic ที่รวมศูนย์เกินไปจาก page ไปกองใน Server Action

## Open Requirements

รายการ canonical อยู่ที่ [Explicitly Unresolved Questions](./architecture/DEMI_ARCHITECTURE_BASELINE.md#23-explicitly-unresolved-questions) โดยประเด็นที่ยังห้ามล็อกในการ implementation ได้แก่:

- OSM scope: area, assigned patients, hospital หรือการผสมกัน
- สิทธิ์ของ parent/main hospital ต่อ child hospitals
- การแต่งตั้ง Hospital Owner เพิ่มเติม
- ความแตกต่างด้าน permission ระหว่าง Doctor/Nurse และผู้อนุมัติ care plan
- patient-editable fields และ health measurements ที่ผู้ป่วยส่งเองได้
- ผู้สร้าง เปลี่ยนเวลา หรือยกเลิก appointment
- การ transfer/reassign patient โดย OSM และการเปลี่ยน hospital affiliation โดย patient
- หลักฐานและขั้นตอนสำหรับ hospital verification
- activation mechanism เช่น phone OTP, email, external identity provider หรือ ThaID
- clinical data ที่ต้องมี immutable/auditable history
- รายงานที่ต้องใช้และ scope ของแต่ละ actor

> หาก business rule ที่จำเป็นต่อ implementation ยังไม่มีในเอกสาร ห้ามเดา ให้ mark เป็น open requirement หรือขอ clarification

## Source of Truth

เรียงลำดับอำนาจจากสูงไปต่ำ:

1. Confirmed current business requirements
2. Accepted ADRs
3. [Architecture baseline](./architecture/DEMI_ARCHITECTURE_BASELINE.md)
4. `CONTEXT.md`
5. Legacy code เฉพาะ behavioral reference

เมื่อ accepted ADR ใหม่ supersede decision เดิม ต้อง update architecture baseline และ `CONTEXT.md` ใน change เดียวกันเพื่อไม่ให้คำแนะนำปัจจุบันขัดกัน

## Agent Working Rules

- รักษาไฟล์และข้อความภาษาไทยเป็น UTF-8 without BOM; ตรวจไม่ให้เกิด mojibake
- ให้ correctness มาก่อน abstraction และเลือก implementation ที่เรียบง่าย ดูแลได้
- ใช้ schema, policy และ business service ที่มีอยู่เป็น source of truth ก่อนสร้างของใหม่
- สร้าง authorization ฝั่ง server และ fail closed เสมอ; UI ใช้เพื่อ UX เท่านั้น
- ใช้ capability ที่มาจาก confirmed requirement ไม่สร้าง generic RBAC framework ล่วงหน้า
- ไม่สร้าง permission เพียงเพราะ profession ต่างกัน หาก requirement ไม่ได้กำหนด behavior ต่างกัน
- ไม่เดา OSM, hospital network หรือ patient scope
- ไม่ออก full database schema จาก conceptual entities ใน baseline โดยไม่มี task อนุมัติ
- เมื่อ architecture decision เปลี่ยนสาระสำคัญ ให้สร้าง ADR ใหม่เพื่อ supersede ฉบับเดิม แล้ว sync baseline/context

