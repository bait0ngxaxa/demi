# ADR-0002: Role, Capability and Scope Authorization

- Status: Accepted
- Date: 2026-08-12

## Context

DEMI มี actor ที่ทำ action คล้ายกันแต่ต่อ resource คนละขอบเขต เช่น Patient เข้าถึงข้อมูลของตนเอง และ OSM อาจเข้าถึงเฉพาะผู้ป่วยที่ได้รับมอบหมาย การตรวจเพียงชื่อ role จึงไม่สามารถพิสูจน์สิทธิ์ต่อ target resource ได้

## Decision

Authorization ใช้แบบจำลอง:

```text
Role + Capability + Scope → Policy Decision
```

- Top-level roles ที่ยืนยันแล้วคือ `ADMIN`, `HOSPITAL`, `OSM`, `PATIENT`
- Role ระบุชนิดของ actor แต่ไม่เท่ากับ permission
- Capability ระบุ action ที่ policy กำลังประเมิน
- Scope เป็น first-class input ที่ผูก actor/action กับ target resource
- Server-side policy เป็น authority และต้อง fail closed
- Client state, hidden UI, local role หรือ request parameter grant permission ไม่ได้
- Doctor/Nurse เป็น profession classification และยังไม่ใช่ top-level authorization role
- Capability matrix และ role-to-capability assignment ต้องมาจาก confirmed business requirements

Vocabulary ต่อไปนี้เป็นเพียง conceptual candidates ไม่ใช่ final semantics:

```text
GLOBAL
HOSPITAL
HOSPITAL_NETWORK
AREA
ASSIGNED_PATIENTS
SELF
DENIED
```

หาก scope ไม่ชัดเจน resolve ไม่สำเร็จ หรือ policy input ไม่ครบ ผลลัพธ์ต้องเป็น deny

## Rationale

สิทธิ์ของ DEMI ขึ้นกับทั้ง action และความสัมพันธ์ระหว่าง actor กับ resource การแยก role, capability และ scope ทำให้ policy แสดง business boundary ได้ตรงกว่า role check และป้องกันการตีความ scope failure เป็น global access

## Alternatives Considered

- Role-only authorization: ปฏิเสธเพราะตอบไม่ได้ว่า actor เข้าถึง resource ใด
- Authorization เฉพาะ UI: ปฏิเสธเพราะ client ถูกแก้ไขหรือเรียก endpoint โดยตรงได้
- กำหนด Doctor/Nurse เป็น role พร้อม permission ล่วงหน้า: ปฏิเสธเพราะยังไม่มี requirement ยืนยัน behavior ที่ต่างกัน
- สร้าง generic RBAC framework เต็มรูปแบบตั้งแต่ initialization: เลื่อนออกไปจนมี concrete requirement เพื่อลด abstraction ที่ยังพิสูจน์ประโยชน์ไม่ได้

## Consequences

### Positive

- มี server-side boundary ที่ตรวจสอบและทดสอบได้
- รองรับ multi-role และ resource scope โดยไม่กระจาย role check ไปทั่ว UI/actions
- สามารถเพิ่ม profession-sensitive policy ภายหลังได้โดยไม่เปลี่ยน core identity model

### Trade-offs / Risks

- ทุก protected operation ต้องระบุ capability, target resource และ context ที่ policy ต้องใช้
- Scope resolver ที่ไม่สอดคล้องกันอาจสร้าง authorization gap จึงต้องรวม policy logic และทดสอบ fail-closed path
- Capability vocabulary อาจเปลี่ยนเมื่อ requirement ชัดขึ้น ต้องหลีกเลี่ยง permission ที่คาดเดาเอง

## Open Questions

- Final capability matrix ของแต่ละ business flow
- Final semantics ของ OSM scope และ hospital network scope
- Doctor/Nurse ต้องมี permission ต่างกันหรือไม่
- วิธีเลือก active hospital context สำหรับ User ที่มีหลาย membership
- Policy ใดต้องพิจารณา record status, assignment หรือ clinical workflow state เพิ่มเติม

## References

- [Architecture Baseline: Core Architecture Principles](../architecture/DEMI_ARCHITECTURE_BASELINE.md#2-core-architecture-principles)
- [Architecture Baseline: Scope](../architecture/DEMI_ARCHITECTURE_BASELINE.md#16-scope-is-a-first-class-authorization-concept)
- [ADR-0005: Server-Side Application Boundary](./0005-server-side-application-boundary.md)

