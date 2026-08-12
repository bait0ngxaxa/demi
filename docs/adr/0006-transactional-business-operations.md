# ADR-0006: Transactional Business Operations

- Status: Accepted
- Date: 2026-08-12

## Context

Business operation บางรายการของ DEMI เปลี่ยนหลาย record ที่รวมกันจึงจะเป็น state ที่ถูกต้อง หาก write บางส่วนสำเร็จแต่ส่วนที่เหลือล้มเหลว ระบบจะมี orphan/incomplete state ที่ไม่ตรง business meaning เช่นมี Person แต่ไม่มี Patient Profile หรือ relationship ที่ operation รับรองว่าจะสร้าง

## Decision

- Operation ที่ต้องรักษาความสอดคล้องข้ามหลาย record ต้อง atomic
- Partial success ของ consistency-critical operation เป็น invalid business state
- Transaction boundary ครอบ cohesive business operation เท่าที่จำเป็น ไม่ครอบทุก query โดยอัตโนมัติ
- Application Service เป็นผู้ orchestrate operation และใช้ Prisma transaction สำหรับ persistence ที่ต้องสำเร็จ/rollback ร่วมกัน
- Error handling ต้องไม่รายงาน success เมื่อ transaction rollback
- Audit event ที่ยืนยัน successful state change ต้องประสานกับผล transaction เพื่อไม่ให้เกิด audit success ของ operation ที่ล้มเหลว; exact mechanism ยังขึ้นกับ requirement
- ห้ามกำหนด transaction boundary ของ domain ที่ business invariant ยังไม่ชัด

Patient provisioning เป็น representative conceptual operation:

```text
resolve/create Person
+
provision User when needed
+
assign PATIENT role
+
create Patient Profile
+
create hospital relationship
+
create OSM assignment when applicable
=
one consistency-critical business operation
```

ส่วนที่ requirement ระบุว่าจำเป็นต่อ operation ต้องสำเร็จทั้งหมดหรือ rollback ตาม consistency requirement; คำว่า “when needed/applicable” ต้อง resolve จาก policy/business rule ก่อน implementation

## Rationale

Transaction ที่ผูกกับ business invariant ป้องกัน partial records และทำให้ผลลัพธ์ของ operation มีความหมายเดียวกันต่อ caller, audit และ downstream workflow โดยไม่เพิ่ม transaction ให้ read หรือ operation ที่เป็นอิสระโดยไม่จำเป็น

## Alternatives Considered

- เขียนทีละ record แล้วปล่อย partial success: ปฏิเสธสำหรับ consistency-critical operation เพราะสร้าง invalid state
- ครอบทุก query ด้วย transaction: ปฏิเสธเพราะเพิ่ม overhead/locking โดยไม่มี invariant รองรับ
- ชดเชยย้อนหลังด้วย cleanup job เป็น default: ปฏิเสธสำหรับ local atomic writes ที่ transaction รองรับ; compensation อาจใช้กับ external/distributed effects เมื่อมี requirement
- กำหนด transaction boundary ทุก domain ล่วงหน้า: เลื่อนจน business operation และ invariants ได้รับการยืนยัน

## Consequences

### Positive

- ป้องกัน orphan และ incomplete business records
- Caller ได้ success/failure ที่สอดคล้องกับ business operation
- ทำให้ invariant และ integration test ของ critical mutation ระบุได้ชัด

### Trade-offs / Risks

- Transaction ที่ยาวหรือรวม external I/O อาจเพิ่ม contention และ failure modes จึงต้องจำกัดเฉพาะ database work ที่จำเป็น
- Retry ต้องพิจารณา idempotency และ unique constraints ไม่เช่นนั้นอาจสร้าง duplicate state
- Audit/outbound side effects อาจต้องใช้ pattern เพิ่มเติมเมื่อ requirement มี external system แต่ ADR นี้ยังไม่กำหนด pattern ล่วงหน้า

## Open Questions

- Exact mandatory records และ transaction boundary ของ patient provisioning แต่ละ entry point
- Database constraints ที่ enforce identity, role, profile และ relationship invariants
- Isolation/concurrency behavior สำหรับ identity resolution ที่เกิดพร้อมกัน
- Idempotency semantics ของ provisioning/invitation/activation mutations
- Audit persistence และ external event delivery consistency requirements

## References

- [Architecture Baseline: Transaction and Data Integrity](../architecture/DEMI_ARCHITECTURE_BASELINE.md#20-transaction-and-data-integrity-baseline)
- [ADR-0004: Patient Provisioning and First-Time Activation](./0004-patient-provisioning-and-activation.md)
- [ADR-0005: Server-Side Application Boundary](./0005-server-side-application-boundary.md)

