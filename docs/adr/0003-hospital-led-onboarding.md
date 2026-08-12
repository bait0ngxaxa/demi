# ADR-0003: Hospital-Led Onboarding

- Status: Accepted
- Date: 2026-08-12

## Context

Generic public signup ที่ให้ผู้ใช้เลือก role เองสร้าง trust chain ที่อ่อนและเปิดให้ business classification มาจากข้อมูลที่ client อ้างเอง ระบบใหม่ต้องให้ organization และ trusted upstream actor เป็นผู้เริ่ม membership/provisioning แทน

## Decision

- ไม่มี generic public signup ที่ให้ผู้ใช้เลือก `ADMIN`, `HOSPITAL`, `OSM`, `PATIENT`, Doctor หรือ Nurse เอง
- Public signup ใช้สำหรับ Hospital organization onboarding
- Hospital ต้องผ่าน platform-side verification ก่อนเป็น active organization
- ผู้สมัครคนแรกที่ได้รับอนุมัติเป็น `HOSPITAL` พร้อม owner membership ของโรงพยาบาลนั้น
- Hospital Owner เป็น tenant-level owner ของ hospital context และไม่ใช่ Platform `ADMIN`
- Hospital Owner provision/invite hospital staff และ OSM จาก trusted hospital context
- Doctor/Nurse เป็น profession classification ภายใต้ hospital membership ก่อน ไม่ใช่ top-level role
- ใช้ trusted Hospital Master เพื่อ select/match organization เมื่อทำได้ แทน uncontrolled free-text organization creation
- Exact verification evidence, review workflow และ exception path ยังเป็น open requirement

## Rationale

Hospital-led onboarding ทำให้ role และ membership เกิดจาก trust chain ที่ตรวจสอบได้ แยก platform governance ออกจาก hospital operations และลดการสร้าง organization/role ที่ผู้สมัครอ้างเองโดยไม่มีผู้รับรอง

## Alternatives Considered

- Public role-selection signup: ปฏิเสธเพราะ user self-assign trust-sensitive role ได้
- ให้ Hospital Owner เป็น Platform Admin: ปฏิเสธเพราะขยาย tenant authority เป็น global authority
- สร้าง organization จาก free text เสมอ: ไม่เลือกเป็น default เพราะเสี่ยง duplicate/misidentified hospital; อาจต้องมี exception เมื่อ trusted master ไม่ครอบคลุม
- ให้ Platform Admin provision staff ทุกคน: ปฏิเสธเป็น routine flow เพราะทำให้ Admin กลายเป็น operational bottleneck

## Consequences

### Positive

- มี trust chain จาก Platform Admin ไป Hospital Owner และ hospital personnel
- แยก platform governance ออกจาก hospital membership administration
- ลด role self-selection และ duplicate organization

### Trade-offs / Risks

- Hospital verification เป็นจุดควบคุมสำคัญและอาจเป็น onboarding bottleneck
- Hospital Master ต้องมี owner, update process และ exception handling ที่ชัดเจนก่อนใช้งานจริง
- Compromised owner account มีผลต่อ provisioning ใน hospital scope จึงต้องมี recovery/audit requirement

## Open Questions

- หลักฐาน ขั้นตอน SLA และผู้อนุมัติ hospital verification
- แหล่งข้อมูลและวิธี reconcile trusted Hospital Master
- Hospital Owner แต่งตั้ง owner เพิ่มหรือโอน ownership ได้หรือไม่
- Invitation/activation mechanism และ expiry/revocation ของ staff/OSM
- Parent/main hospital มี authority ต่อ child hospitals อย่างไร

## References

- [Architecture Baseline: Hospital Owner](../architecture/DEMI_ARCHITECTURE_BASELINE.md#8-hospital-owner-is-not-platform-admin)
- [Architecture Baseline: Signup and Onboarding](../architecture/DEMI_ARCHITECTURE_BASELINE.md#9-signup-and-onboarding-strategy)
- [Architecture Baseline: Staff and OSM Provisioning](../architecture/DEMI_ARCHITECTURE_BASELINE.md#10-staff-and-osm-are-provisioned-not-self-assigned)

