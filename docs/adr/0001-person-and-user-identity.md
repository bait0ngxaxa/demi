# ADR-0001: Person and User Identity

- Status: Accepted
- Date: 2026-08-12

## Context

DEMI ต้องรองรับบุคคลที่ถูกบันทึกใน care workflow ก่อนมีบัญชีใช้งาน บุคคลคนเดียวอาจเป็นทั้ง OSM และ Patient หรือทำงานกับหลายโรงพยาบาล การผูกตัวตน บัญชี role และโรงพยาบาลไว้ใน User record เดียวจะทำให้เกิด duplicate identity และขยายความสัมพันธ์เหล่านี้ได้ยาก

## Decision

- `Person` แทนบุคคลจริงที่ DEMI รู้จัก
- `User` แทน application account สำหรับ credential, session และ account lifecycle
- Person มีอยู่ก่อนการสร้างหรือ activation ของ User ได้
- บุคคลหนึ่งคนควรมีหนึ่ง core identity และมีหลาย role ผ่านความสัมพันธ์ที่แยกจาก account ได้
- ห้ามสร้าง User หรือ Person ซ้ำเพียงเพราะคนเดียวกันเป็นทั้ง OSM และ Patient
- ห้ามสร้าง User หรือ Person ซ้ำเพียงเพราะคนเดียวกันมีหลาย hospital membership
- ต้องทำ identity resolution ก่อนสร้าง Person ใหม่
- Exact database columns, constraints และ external identity links ยังไม่ถูกกำหนดโดย ADR นี้

Model แบบนี้ไม่เพียงพอ:

```text
users.role
users.hospital_id
```

เพราะหนึ่งค่า role ไม่รองรับหลาย role, หนึ่ง `hospital_id` ไม่รองรับหลาย membership และ profession/scope ไม่ควรถูกบังคับให้เปลี่ยนตาม account identity

## Rationale

การแยก real-world identity ออกจาก application account ทำให้ provisioning เกิดก่อน activation ได้ รักษาความต่อเนื่องของบุคคลเดียวเมื่อ role หรือ hospital affiliation เปลี่ยน และลดความเสี่ยงที่ข้อมูลสุขภาพ/การดูแลกระจายอยู่ใน identity ซ้ำหลายชุด

## Alternatives Considered

- เก็บ `role` และ `hospital_id` อย่างละหนึ่งค่าใน `users`: ปฏิเสธเพราะไม่รองรับ multi-role หรือ multi-hospital โดยไม่เพิ่ม special case
- สร้าง User ใหม่ต่อ role หรือโรงพยาบาล: ปฏิเสธเพราะทำให้ credential, audit trail และข้อมูลของบุคคลเดียวแตกเป็นหลาย identity
- สร้าง Person ใหม่ทุกครั้งที่ trusted actor provision: ปฏิเสธเพราะละเลย identity resolution และสร้าง duplicate clinical/business records

## Consequences

### Positive

- รองรับ Person ที่ยังไม่มี interactive account
- รองรับ multi-role และ multi-hospital โดยไม่ duplicate core identity
- แยก account lifecycle ออกจาก person/patient lifecycle
- มีจุดรองรับ duplicate resolution และ identity linking อย่างชัดเจน

### Trade-offs / Risks

- ต้องออกแบบ identity matching, conflict handling และ duplicate resolution อย่างระมัดระวัง
- การ lookup ที่ match ผิดคนมีผลด้าน privacy และ data integrity สูง จึงต้องไม่ใช้ heuristic ที่ยังไม่ยืนยัน
- Query และ service ต้องเลือกใช้ Person, User, role และ membership ให้ตรง concern

## Open Questions

- Identifier และหลักฐานใดใช้ match หรือยืนยันว่าเป็น Person เดิม
- กรณีข้อมูลระบุตัวตนขัดแย้งกัน ใครมีสิทธิ์ resolve และต้องมี audit แบบใด
- Exact cardinality ระหว่าง Person, User และ external identity provider links
- Database uniqueness constraints และ merge/recovery workflow ที่เหมาะสม

## References

- [Architecture Baseline: Person and User](../architecture/DEMI_ARCHITECTURE_BASELINE.md#4-person-and-user-are-different-concepts)
- [Architecture Baseline: One Human, One Core Identity](../architecture/DEMI_ARCHITECTURE_BASELINE.md#5-one-human-one-core-identity-multiple-roles)
- [ADR-0004: Patient Provisioning and First-Time Activation](./0004-patient-provisioning-and-activation.md)

