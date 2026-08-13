# DEMI Project Context

เอกสารนี้เป็นจุดเริ่มต้นแบบกระชับสำหรับ developer และ AI coding agent ก่อนลงมือเปลี่ยนระบบ อ่านรายละเอียดที่ [Architecture Baseline](./architecture/DEMI_ARCHITECTURE_BASELINE.md) และเหตุผลของแต่ละ decision ที่ [ADR Index](./adr/README.md)

## Project Purpose

DEMI กำลังถูก redesign/rewrite ใหม่เพื่อแยก identity, account, role, membership, authorization และ operational responsibility ออกจากกันอย่างชัดเจน

Legacy DEMI repository ใช้ศึกษา behavior, terminology และ domain knowledge เดิมได้เท่านั้น ไม่ใช่ target architecture และไม่ใช่ source of truth สำหรับ authentication, authorization, role model หรือ data-access pattern ของระบบใหม่

## Current Phase

โปรเจกต์อยู่ใน **Implementation Phase 2.1: National ID Login Adapter** ต่อจาก Phase 2 Authentication & Application Access ระยะนี้เปลี่ยน primary interactive login identifier เป็นเลขบัตรประชาชนไทย โดยยังคง Supabase password authentication, ACTIVE ActorContext และ protected application boundary เดิม

## Phase 2.1 National ID Login Adapter

ส่วนที่ implement แล้วใน Phase 2.1 มีขอบเขตดังต่อไปนี้:

- `/login` เป็นหน้าเข้าสู่ระบบภาษาไทยแบบ responsive รับเลขบัตรประชาชนไทยและ user-owned password ผ่าน Server Action โดยไม่ต้องแสดงหรือขออีเมล
- Login input validate ด้วย Zod ฝั่ง server: trim เฉพาะช่องว่างรอบนอก, ต้องเป็นเลข ASCII 13 หลัก, checksum ไทยถูกต้อง และมี length bound ก่อนทำ HMAC/database/provider work
- server ใช้ identity service source เดิมคำนวณ HMAC ด้วย namespace `thai-national-id` แล้ว resolve `Person.identityKeyHash → Person → User`
- Supabase password authentication ใช้ opaque internal alias ที่ derive จาก stable `User.id`; alias ไม่บรรจุ National ID ไม่ใช่อีเมลจริง/contact method และไม่ถูก expose ใน `ActorContext` หรือ browser
- หลัง provider authentication สำเร็จ ระบบ validate provider identity ด้วย `auth.getUser()` แล้วใช้ service เดิม resolve `User.authSubject` เป็น DEMI actor
- subject ที่ provider คืนต้องตรงกับ `User.authSubject` ที่ National ID resolution เลือกไว้; mismatch ถูก deny และ local sign-out แบบ fail closed
- actor resolution แยกผล `UNAUTHENTICATED`, `APPLICATION_ACCESS_DENIED` และ `AUTHORIZED`; provider/database infrastructure failure ยังคง throw เป็น predictable infrastructure error
- เฉพาะ mapped `User.status = ACTIVE` ที่ resolve `ActorContext` ได้จึงเข้า `/app`; `PROVISIONED`, `INVITED`, `SUSPENDED` และ unmapped provider user ถูก deny
- login ไม่สร้าง `Person`, `User`, role หรือ hospital membership และไม่อ่าน authority จาก provider metadata หรือ browser state
- `/app` ตรวจ protected access ฝั่ง server และแสดง role จาก server-resolved `ActorContext` ใน shared application shell เท่านั้น
- `/` redirect ACTIVE actor ไป `/app` และ redirect สถานะอื่นไป `/login`; infrastructure failure ไม่ถูกแปลงเป็น anonymous state
- logout เรียก Supabase Auth server client ด้วย `scope: "local"` เพื่อ invalidate เฉพาะ current browser/device session และ redirect ไป `/login` โดยไม่แก้ DEMI identity/authorization records
- auth mutations ใช้ Supabase server client ที่กำหนดให้ cookie writes ต้องสำเร็จ; read-only Server Components ยังคงใช้ defensive cookie-write behavior ได้
- unknown National ID และ wrong password ให้ client-facing `INVALID_CREDENTIALS` ข้อความเดียวกัน; identity/provider/database infrastructure failure ยังแยกเป็น infrastructure error ภายใน
- National ID, `identityKeyHash`, password, provider alias, token และ cookie ไม่ถูก log หรือส่งกลับ client
- ไม่มี Prisma schema หรือ migration change ใน Phase 2.1 เพราะ `User.id` เป็น opaque stable alias source อยู่แล้ว และ `authSubject` ยังคงหมายถึง provider subject
- Repository ยังไม่มี shared distributed login rate limiter; bounded validation และ provider safeguards เป็น boundary ปัจจุบัน ส่วน deployment-level rate limiting เป็น security follow-up ก่อนขยาย public exposure

Phase 2.1 ไม่ได้ finalize provider-account transition สำหรับบัญชี development เดิม, patient activation mechanism, Hospital onboarding verification, staff/OSM invitation mechanism, LIFF identity linking, ThaID, native authentication, role capability matrix หรือ operational business workflows Trusted provisioning ในอนาคตต้อง reuse server-only alias primitive และรับผิดชอบ provider/database partial failure อย่างชัดเจน

## Phase 1 Foundation Implementation

ส่วนที่ implement แล้วใน foundation นี้มีขอบเขตดังต่อไปนี้:

- Prisma schema/migration สำหรับ `Person`, `User`, `UserRole`, `Hospital`, `HospitalMembership` และ `AuditEvent`
- `Person.identityKeyHash` เป็น opaque hash ของ identity reference ที่ผ่าน validation; Phase 2.1 กำหนด namespace `thai-national-id` สำหรับ interactive login แล้ว ส่วน external identity/provider link อื่นยังไม่ถูกล็อก
- Supabase Auth เป็น current server authentication adapter โดย provider subject map ผ่าน `User.authSubject`; Supabase user metadata ไม่ใช่ source of truth ของ DEMI authorization
- `ActorContext` load จาก active application `User`, roles และ hospital memberships ผ่าน Prisma
- Next.js 16 `proxy.ts` refreshes Supabase SSR cookies per request; `auth.getUser()` validates the provider identity before mapping to the application `User`
- fail-closed authorization primitives สำหรับ role requirement และ `GLOBAL`/`HOSPITAL`/`SELF`/`DENIED` scope เท่านั้น; primitive นี้ยังไม่ประกาศ capability matrix หรือ OSM scope semantics
- identity lookup ใช้ deterministic HMAC-SHA-256 ด้วย server-only `IDENTITY_HASH_SECRET`
- audit input boundary ที่จำกัด metadata และปฏิเสธ credential/identity secrets
- audit persistence รับ transaction-compatible Prisma client ได้ และ audit actor foreign key ไม่อนุญาต hard-delete User ที่มีประวัติ audit
- Prisma migration scripts มี database-target safety preflight และ integration suite แยกใช้ dedicated test database
- สำหรับ local integration ใช้ `.env.integration` กับ `compose.integration.yaml` ซึ่งเปิด PostgreSQL แบบ disposable ที่ `127.0.0.1:55432`; `DATABASE_URL`, `DIRECT_URL` และ `DEMI_TEST_DATABASE_URL` ต้องชี้ฐานข้อมูล test เดียวกัน
- รัน verification แบบครบวงจรด้วย `npm run test:integration:local` หรือเปิด/ปิดฐานข้อมูลเองด้วย `npm run test:db:up`, `npm run prisma:migrate:test`, `npm run test:integration` และ `npm run test:db:down`
- server-side health check ที่ไม่เปิดเผย secret หรือ internal error

Implementation directories และ commands ดูได้จาก [README](../README.md) และ [Architecture Baseline](./architecture/DEMI_ARCHITECTURE_BASELINE.md)

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

## Client and Transport Rules

- DEMI field UX เป็น mobile-first โดย `OSM` และ `PATIENT` ต้องใช้งานหลักได้ดีบน mobile devices
- Responsive Web เป็น implementation platform หลักในระยะแรก
- LIFF เป็น initial client/access channel ไม่ใช่ identity หรือ authorization authority
- Native mobile app เป็น future client และไม่อยู่ใน current implementation scope
- Server Actions เป็น web transport adapters
- HTTP APIs เป็น transport adapters สำหรับ client/integration ที่มี requirement จริง
- Application Services ต้อง transport-agnostic และ reuse ได้จากทั้ง Server Action และ HTTP API
- Business logic, Policy และ Prisma orchestration ต้องไม่อยู่ใน Server Actions หรือ Route Handlers
- HTTP API เพิ่มแบบ incremental; ไม่สร้าง endpoint แบบ speculative สำหรับทุก business operation
- LINE identity อาจเชื่อมเป็น external authentication method ของ DEMI User แต่ห้ามแทน `Person`, `User`, role, membership, capability หรือ scope

รายละเอียดและ open questions อยู่ที่ [ADR-0007](./adr/0007-client-transport-and-mobile-ready-architecture.md)

## Application Architecture

```text
Web → Server Action ─────────┐
                             │
LIFF → HTTP API? ────────────┼→ Application Service
                             │           ↓
Native → HTTP API (future) ──┘  Policy / Authorization
                                         ↓
                                       Prisma
                                         ↓
                                PostgreSQL / Supabase
```

| Layer | Responsibility |
| --- | --- |
| Client / UI | Responsive Web และ LIFF ในปัจจุบัน รวมถึง native app ในอนาคต; ทำ rendering/interaction แต่ไม่ตัดสิน authorization ขั้นสุดท้าย |
| Server Action / HTTP API | Peer transport adapters สำหรับ authentication/session resolution, transport validation, input mapping, service invocation และ client response mapping |
| Application Service | Orchestrate business operation, business rules, policy และ persistence โดยไม่กลายเป็น god module |
| Policy / Authorization | ประเมิน actor, role/membership, capability, target resource และ scope; ambiguity หรือ resolution failure ต้องจบด้วย deny |
| Prisma | Typed persistence, scoped queries และ transaction; ไม่ใช่ authorization engine |
| PostgreSQL / Supabase | เก็บและบังคับใช้ data integrity ตามที่กำหนด; managed provider ไม่ได้แทน application authorization |

UI, page component, Server Action และ Route Handler ต้องไม่ถือ business rule/query เป็น source of truth

> หาก agent เห็นว่า operation ต้องมี HTTP API ต้องระบุ current client/use case ที่ต้องใช้ endpoint นั้นก่อน เหตุผลว่า “native app อาจต้องใช้สักวัน” เพียงอย่างเดียวยังไม่เพียงพอ

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
- LIFF target workflows/audience, LINE account linking, `/api/v1` operations, native authentication, offline/sync, push/device capabilities และ trigger สำหรับเริ่ม native development

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
- ไม่ bind DEMI identity/authorization เข้ากับ LINE identity หรือ client transport
- ไม่สร้าง HTTP API โดยไม่มี identified current consumer/use case
- ไม่ออก full database schema จาก conceptual entities ใน baseline โดยไม่มี task อนุมัติ
- เมื่อ architecture decision เปลี่ยนสาระสำคัญ ให้สร้าง ADR ใหม่เพื่อ supersede ฉบับเดิม แล้ว sync baseline/context
