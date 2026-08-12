# ADR-0007: Client Transport and Mobile-Ready Architecture

- Status: Accepted
- Date: 2026-08-12

## Context

DEMI คาดว่าจะถูกใช้งานผ่านอุปกรณ์ mobile อย่างมีนัยสำคัญ โดยเฉพาะ field workflow ของ `OSM` และ self-service ของ `PATIENT` ลูกค้าต้องการ native mobile application ในอนาคต แต่ native development ยังไม่อยู่ใน initial implementation phase

Responsive Web เป็น implementation platform หลักในระยะแรก และ LIFF มีแผนเป็นช่องทางเข้าถึง/กระจายประสบการณ์ให้ field users และ patients แนวทาง Next.js web ใช้ Server Actions ได้ แต่ถ้า business logic อยู่ภายใน Server Actions โดยตรง LIFF flow ที่ต้องใช้ HTTP API, native app หรือ integration ในอนาคตจะต้อง duplicate หรือ rewrite logic นั้น

ในทางกลับกัน การสร้าง REST API ครบทุก operation ตั้งแต่ก่อนมี consumer จริงจะเพิ่ม transport code, tests, documentation, versioning และ maintenance จาก requirement ที่ยังไม่เกิด

เป้าหมายจึงเป็น:

```text
API-ready, not speculative API-first
```

## Decision

### A. Mobile-First Field Experience

- Initial web application ต้อง responsive และออกแบบ mobile-first สำหรับ field-oriented experiences
- `OSM` และ `PATIENT` เป็น primary mobile-first actor experiences
- Hospital management และ Platform Admin อาจใช้ desktop-enhanced interaction เมื่อเหมาะกับงาน
- แต่ละ screen ต้องเหมาะกับ device/use context ของตน ไม่จำเป็นต้องใช้ interaction pattern เหมือนกันทุก viewport

### B. LIFF as an Initial Client/Access Channel

LIFF ใช้เป็น convenient client entry/access channel สำหรับ field users และ patients ได้ แต่ไม่ใช่ DEMI identity model หรือ authorization authority

```text
LIFF != DEMI Identity Model
```

Identity relationship ยังคงเป็น:

```text
Person
  ↓
User
  ↓
External Identity / Authentication Method
```

Possible future providers เช่น `Email/password`, `LINE`, `ThaID` หรือ approved provider อื่นเป็นตัวอย่างเท่านั้น หากเชื่อม LINE identity ในอนาคต ต้องเชื่อมเป็น external authentication/identity provider ของ DEMI User ที่ resolve แล้วอย่างปลอดภัย

External provider ใช้พิสูจน์หรือช่วย establish account identity; provider ไม่กำหนด DEMI role, membership, capability หรือ scope ADR นี้ไม่กำหนด LINE login flow หรือ `ExternalIdentity` database schema

LIFF ที่ทำงานเป็น responsive web experience อาจใช้ web transport path ได้ ส่วน LIFF use case ที่ต้องมี independent HTTP contract จึงค่อยใช้ HTTP API ที่เพิ่มจาก requirement จริง

### C. Application Services Must Be Transport-Agnostic

Business operations เช่น:

```text
provisionPatient()
inviteHospitalMember()
approveHospital()
assignOsm()
createScreening()
createFollowup()
```

อยู่ใน Application Services และต้องเรียกใช้ได้โดยไม่ขึ้นกับ transport โดยตรง Application Service ต้องไม่ depend on:

```text
Next.js FormData
Next.js cookies API
NextRequest
NextResponse
LIFF SDK
React components
browser APIs
```

Transport adapter ต้อง parse/validate transport input และแปลงเป็น application input ก่อนเรียก service

### D. Server Actions Are Web Transport Adapters

Server Actions ยังคงเหมาะกับ Next.js web application โดยจำกัด responsibility ไว้ที่:

```text
receive request/input
validate transport-level input
resolve authenticated actor/session
invoke Application Service
map service result/error to UI response
```

Server Action ไม่ใช่ business source of truth และต้องไม่ duplicate Policy หรือ Prisma orchestration ในแต่ละ action

### E. HTTP API Is Introduced Incrementally

DEMI reserve versioned API namespace เช่น:

```text
/api/v1
```

สำหรับ consumer ที่ต้องใช้ HTTP contract จริง แต่ไม่สร้าง endpoint เพียงเพราะมี equivalent Server Action อยู่แล้ว Endpoint ใหม่ต้องมี identified consumer/use case เช่น:

- LIFF use case ที่ต้องสื่อสารผ่าน HTTP API
- native application
- approved external integration
- client อื่นที่ได้รับการบันทึก requirement อย่างชัดเจน

```text
API-ready
```

ไม่เท่ากับ:

```text
API-everything-from-day-one
```

### F. Native Mobile Clients Are Future Clients

Native iOS/Android development ถูก defer ออกจาก initial implementation phase เมื่อมี native client ในอนาคต client นั้นต้องเรียก HTTP API และ reuse Application Service/Policy เดียวกับ web transport

```text
Native Client
      ↓
HTTP API
      ↓
Application Service
      ↓
Policy / Authorization
      ↓
Prisma
```

ADR นี้ไม่เลือก `Flutter`, `React Native`, native iOS หรือ native Android

### G. Future Native Authentication Remains Open

ADR นี้ไม่กำหนด future native authentication architecture และไม่อนุมัติ custom OAuth server, custom access/refresh-token framework, mobile JWT architecture หรือ native-specific authentication flow ล่วงหน้า

Invariant ที่ยอมรับในตอนนี้มีเพียง runtime resolution ต่อไปนี้:

```text
Authenticated Identity
        ↓
DEMI User
        ↓
Person
        ↓
Roles / Memberships
        ↓
Capability + Scope
```

ทุก transport ต้องเข้าสู่ server-side policy เดียวกันและ fail closed ตาม [ADR-0002](./0002-role-capability-scope-authorization.md)

## Rationale

1. Mobile usage มีแนวโน้มสูง แต่ requirement ยังไม่คุ้มต้นทุน native development ในระยะแรก
2. Responsive Web + LIFF ช่วย validate field workflow ได้เร็วกว่าโดยไม่เพิ่ม native release surface
3. Application Services เป็น reuse boundary ที่มีอยู่แล้วและเหมาะกับหลาย transport
4. Server Actions ให้ ergonomics ที่ดีสำหรับ Next.js web client ปัจจุบัน
5. HTTP API เพิ่มเฉพาะ operation ที่มี non-Server-Action consumer จริงได้
6. การแยก transport จาก business logic ป้องกัน future rewrite และ behavior drift
7. การไม่สร้าง REST API แบบ speculative ลด code, tests, documentation, versioning และ maintenance ที่ยังไม่สร้างคุณค่า

## Alternatives Considered

### Alternative 1 — Server Actions Only

ปฏิเสธเพราะ future LIFF use case, native client หรือ external integration ที่ต้องมี HTTP contract ไม่สามารถใช้ Server Actions เป็น stable application contract ได้

### Alternative 2 — Full REST API First, Even for Web

ปฏิเสธสำหรับ initial MVP เพราะเพิ่ม transport boilerplate และ API maintenance ก่อนมี client ที่ต้องการ contract นั้นจริง

### Alternative 3 — Native Application Immediately

ปฏิเสธเพราะ current requirements ยังไม่รองรับต้นทุน platform, release, deployment และ maintenance เพิ่มเติม

### Alternative 4 — Duplicate Business Logic per Client

ปฏิเสธเพราะ validation, permission, workflow และ data-integrity behavior จะไม่สอดคล้องกันระหว่าง clients

## Consequences

### Positive

- Future native app reuse business core เดียวกันได้
- LIFF ใช้ application behavior และ authorization policy เดียวกับ web
- Business rules อยู่รวมใน Application Services
- Authorization behavior สอดคล้องกันข้าม clients
- Web development ยังคงใช้ Server Actions ได้อย่างมีประสิทธิภาพ
- หลีกเลี่ยง HTTP endpoints ที่ยังไม่มี consumer
- Product ตัดสิน timing ของ native app จาก field usage จริงภายหลังได้

### Trade-offs / Risks

- Application Services ต้องรักษา framework independence
- บาง use case อาจมีทั้ง Server Action และ HTTP API adapters
- Transport-level validation และ error/result mapping ต้องดูแลแยกตาม transport
- API versioning และ compatibility มีผลเมื่อมี public/native contract จริง
- Developer ต้องไม่ปล่อยให้ business logic ไหลกลับไปอยู่ใน Server Actions หรือ Route Handlers

## Open Questions

- Which workflows will first be exposed through LIFF?
- Will LIFF primarily target OSM, Patient, or both?
- What exact LINE account-linking/activation flow will be used?
- Which future operations require `/api/v1`?
- What authentication scheme will future native clients use?
- Does field usage eventually require offline-first behavior?
- Is background synchronization needed?
- Are push notifications required from a future native app?
- Which device capabilities may eventually require a native client?
- When does product evidence justify creating the native application?

Do not answer these questions without confirmed product requirements and a later approved decision where appropriate.

## References

- [Architecture Baseline: Application Architecture](../architecture/DEMI_ARCHITECTURE_BASELINE.md#19-application-architecture-baseline)
- [Architecture Baseline: Client and Transport Architecture](../architecture/DEMI_ARCHITECTURE_BASELINE.md#196-client-and-transport-architecture)
- [ADR-0001: Person and User Identity](./0001-person-and-user-identity.md)
- [ADR-0002: Role, Capability and Scope Authorization](./0002-role-capability-scope-authorization.md)
- [ADR-0005: Server-Side Application Boundary](./0005-server-side-application-boundary.md)
