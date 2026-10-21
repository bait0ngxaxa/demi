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
| [ADR-0008](./0008-workforce-provisioning-and-activation.md) | Accepted (amended 2026-10-14) | Workforce Provisioning and First-Time Activation |
| [ADR-0009](./0009-demi-line-oa-liff-identity-and-messaging.md) | Accepted | DEMI LINE OA, LIFF Identity and Messaging Boundary |
| [ADR-0010](./0010-production-ready-mvp-and-deployment-neutral-runtime.md) | Accepted | Production-Ready MVP and Deployment-Neutral Runtime |
| [ADR-0011](./0011-patient-import-profile-persistence.md) | Accepted | Patient Import Profile Persistence and Hospital Ownership |

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

- [ADR-0012 — Global credential recovery proof](./0012-global-credential-recovery-proof.md): security restriction superseding assisted-recovery ownership assumptions; independent proof remains pending.
- [ADR-0013 — Responsibility areas as direct Child Hospitals](./0013-responsibility-areas.md): accepted 2026-10-17 (จ-1..จ-5); area = active direct Child, Parent OWNER nine-value summary view/export (RPT-32) only.

- [ADR-0014 — Operational Hospital Service Area Ownership](./0014-operational-hospital-service-areas.md): Phase A; partially supersedes H1 of ADR-0013, keeps H2–H5 and official Master authority unchanged; no Patient/workforce/report inheritance.
- [ADR-0015 — Platform-governed Hospital network roles and transfers](./0015-admin-governed-hospital-network.md): Platform ADMIN sets PARENT/CHILD roles, registers/renames Hospitals and transfers areas; OWNERs attach any free CHILD; partially supersedes ADR-0014.
- [ADR-0016 — Read-only network Patient access](./0016-network-patient-read.md): Parent OWNER (and granted MEMBERs) read Child Patients read-only with audit; Parent reports follow the network; supersedes ADR-0013 H5.
- [ADR-0017 — Retire Hospital Master](./0017-retire-hospital-master.md): ADMIN registers every Hospital; Master seed/reconcile and `Hospital.parentHospitalId` removed; hierarchy service projects the network.
- [ADR-0018 — Parent-led Child onboarding](./0018-parent-led-child-onboarding.md): ADMIN bulk-registers Parents from CSV; public onboarding is Parent-only; Parent OWNERs create Children and invite their first OWNER through the workforce activation link (`CHILD_OWNER_ONBOARDING`); partially supersedes ADR-0003/0015/0016; resolves WB-PD-12.

- [ADR-0019 — Owner-only administration and Excel-only patient onboarding](./0019-owner-administration-and-import-only-roster.md): supersedes MEMBER OSM administration, delegated report export and manual patient registration.
