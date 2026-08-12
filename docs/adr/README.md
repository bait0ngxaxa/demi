# DEMI Architecture Decision Records

Architecture Decision Record (ADR) ใช้บันทึก decision ที่กำหนดรูปทรงหรือ boundary สำคัญของ DEMI พร้อมเหตุผล ทางเลือก ผลกระทบ และคำถามที่ยังเปิดอยู่ ADR ไม่ใช่ requirement specification และไม่ใช้บันทึก implementation detail ทั่วไป

## Status

| Status | Meaning |
| --- | --- |
| `Proposed` | อยู่ระหว่างพิจารณา ยังไม่ใช่ source of truth |
| `Accepted` | ยอมรับแล้วและมีผลกับ architecture ปัจจุบัน |
| `Superseded` | ถูกแทนด้วย ADR ใหม่; เก็บไว้เป็นประวัติและต้องลิงก์ไปฉบับใหม่ |
| `Deprecated` | เลิกใช้โดยไม่มี decision ทดแทนโดยตรง; เก็บไว้เป็นประวัติ |

## Naming Convention

ใช้ชื่อไฟล์ `NNNN-short-kebab-case-title.md` โดยเลข ADR เพิ่มขึ้นตามลำดับและไม่ reuse หมายเลขเดิม เช่น `0008-example-decision.md`

## Index

| ADR | Status | Decision |
| --- | --- | --- |
| [ADR-0001](./0001-person-and-user-identity.md) | Accepted | Person and User Identity |
| [ADR-0002](./0002-role-capability-scope-authorization.md) | Accepted | Role, Capability and Scope Authorization |
| [ADR-0003](./0003-hospital-led-onboarding.md) | Accepted | Hospital-Led Onboarding |
| [ADR-0004](./0004-patient-provisioning-and-activation.md) | Accepted | Patient Provisioning and First-Time Activation |
| [ADR-0005](./0005-server-side-application-boundary.md) | Accepted | Server-Side Application Boundary |
| [ADR-0006](./0006-transactional-business-operations.md) | Accepted | Transactional Business Operations |
| [ADR-0007](./0007-client-transport-and-mobile-ready-architecture.md) | Accepted | Client Transport and Mobile-Ready Architecture |

## Change Rules

- ห้าม rewrite เนื้อหาของ Accepted ADR แบบเงียบ ๆ จนเหตุผลหรือ decision ในอดีตเปลี่ยนความหมาย
- การแก้ typo, formatting หรือลิงก์ทำใน ADR เดิมได้เมื่อไม่เปลี่ยนสาระ
- หาก decision เปลี่ยนสาระสำคัญ ให้สร้าง ADR ใหม่ ระบุ ADR เดิมเป็น `Superseded` และเชื่อมลิงก์ทั้งสองทาง
- เมื่อ current architecture เปลี่ยน ให้ update [Architecture Baseline](../architecture/DEMI_ARCHITECTURE_BASELINE.md) และ [Project Context](../CONTEXT.md) ให้สอดคล้องกับ Accepted ADR ใหม่

## When to Create an ADR

สร้าง ADR เมื่อ decision มีอย่างน้อยหนึ่งลักษณะต่อไปนี้:

- เป็น architectural boundary หรือกำหนด dependency direction
- revert ยากหรือมีต้นทุนสูง
- กระทบหลาย module หรือหลาย workflow
- เป็น security, privacy หรือ data-integrity boundary
- มีเหตุผลที่มีแนวโน้มถูกถามซ้ำในอนาคต

ไม่ต้องสร้าง ADR สำหรับ implementation detail ปกติ การตั้งชื่อภายใน หรือ choice ที่เปลี่ยนได้ง่ายและไม่กระทบ boundary
