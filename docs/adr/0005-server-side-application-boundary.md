# ADR-0005: Server-Side Application Boundary

- Status: Accepted
- Date: 2026-08-12

## Context

DEMI ต้องรักษา business rule และ authorization ให้เหมือนกันไม่ว่าจะเรียกผ่าน UI, Server Action หรือ Route Handler การวาง query/decision ใน page component หรือ transport handler ทำให้กฎกระจาย ทดสอบยาก และเสี่ยงให้ client กลายเป็น authority

## Decision

ใช้ application boundary ต่อไปนี้:

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

- Client/UI รับผิดชอบ rendering, form interaction และ UX ไม่ตัดสิน authorization ขั้นสุดท้าย
- Server Action/Route Handler เป็น transport boundary สำหรับ request controls ที่เกี่ยวข้อง, authentication/session resolution, input parsing/validation และเรียก application service
- Application Service เป็นจุด orchestration ของ business operation, policy และ persistence
- Policy/Authorization รวมการตัดสิน Role + Capability + Scope ฝั่ง server และ fail closed
- Prisma ให้ typed persistence, query และ transaction; ไม่แทน policy
- PostgreSQL/Supabase เป็น data/provider layer และไม่แทน application authorization
- ห้ามกระจาย business rules หรือ persistence queries ลง page components
- ห้ามเปลี่ยน Server Action/Route Handler เป็น god module ที่รวม transport, policy, business rule และ persistence ทั้งหมด
- ไม่เพิ่ม repository abstraction จนมี concrete benefit เช่น isolation ของ complex data access หรือ test seam ที่ต้องใช้จริง

## Extension by ADR-0007

[ADR-0007](./0007-client-transport-and-mobile-ready-architecture.md) extends this boundary for multiple client and transport types without superseding the original decision. Service, Policy, Prisma และ database responsibilities remain unchanged.

```text
                Web
                 │
          Server Action
                 │
                 ├────────────┐
                              │
LIFF / Native / Integration   │
          │                   │
      HTTP API                │
          │                   │
          └──────────┬────────┘
                     ↓
             Application Service
                     ↓
             Policy / Authorization
                     ↓
                   Prisma
                     ↓
                  Database
```

> Server Action and HTTP API are peer transport adapters above Application Service.

- Server Actions remain the web adapter for the current Next.js application.
- HTTP APIs are added only for an identified client or integration that requires an HTTP contract.
- Both adapters resolve authenticated actor context, validate transport input, convert it to application input, invoke the same Application Service และ map the result back to their client.
- Neither adapter owns business rules, authorization policy or Prisma orchestration.

## Phase 1 Implementation Note

The current foundation uses Supabase Auth as the server authentication adapter. It validates the authenticated provider subject on the server, maps that subject to `User.authSubject`, and then resolves `Person`, roles, and hospital memberships from Prisma. This is an implementation boundary for the current phase, not a commitment that future external providers or native authentication flows use the same transport.

## Rationale

Boundary นี้ทำให้ transport และ UI บาง ส่วน business operation มีจุดอ้างอิงเดียว และ authorization อยู่ในเส้นทาง server-side ก่อนการเข้าถึงหรือเปลี่ยน resource ที่ protected

## Alternatives Considered

- Query/authorize ใน page หรือ UI component: ปฏิเสธเพราะ client ไม่ใช่ trust boundary และกฎจะกระจาย
- ใส่ business logic ทั้งหมดใน Server Action: ปฏิเสธเพราะทำให้ reuse ข้าม entry point ยากและสร้าง god layer ใหม่
- พึ่ง Supabase/PostgreSQL provider เป็น authorization ทั้งหมด: ปฏิเสธเพราะ provider ไม่ทราบ application capability/workflow semantics ทั้งหมด
- บังคับ repository layer สำหรับทุก model: ไม่รับเป็น baseline เพราะยังไม่มี concrete benefit และเพิ่ม indirection

## Consequences

### Positive

- Business operation และ policy reuse ได้จากหลาย server entry points
- Unit/integration test แยก business orchestration, authorization และ persistence boundary ได้ชัดขึ้น
- UI เปลี่ยนได้โดยไม่เปลี่ยน authority ของระบบ

### Trade-offs / Risks

- ต้องรักษา dependency direction และไม่ bypass application service/policy ใน entry point ใหม่
- Policy อาจต้องอ่าน relationship จาก database; implementation ต้องป้องกัน TOCTOU และใช้ transaction เมื่อ consistency ต้องการ
- Service ที่ใหญ่เกินไปยังเป็นความเสี่ยง จึงต้องแบ่งตาม cohesive business operation ไม่ใช่ตาม transport

## Open Questions

- Module boundaries และ naming ของ application services เมื่อ business domains ชัดขึ้น
- Future authentication providers/external identity links beyond the current Supabase Auth adapter และวิธี map external identity ไป User/Person
- Policy context ใดควรถูก load ด้วย scoped query หรือประเมินภายใน transaction
- Background jobs/webhooks ในอนาคตต้อง reuse application operation ใดบ้าง

## References

- [Architecture Baseline: Application Architecture](../architecture/DEMI_ARCHITECTURE_BASELINE.md#19-application-architecture-baseline)
- [ADR-0002: Role, Capability and Scope Authorization](./0002-role-capability-scope-authorization.md)
- [ADR-0006: Transactional Business Operations](./0006-transactional-business-operations.md)
- [ADR-0007: Client Transport and Mobile-Ready Architecture](./0007-client-transport-and-mobile-ready-architecture.md)
