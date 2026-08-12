# ADR-0004: Patient Provisioning and First-Time Activation

- Status: Accepted
- Date: 2026-08-12

## Context

Patient อาจเข้าสู่ DEMI ผ่าน hospital/field workflow ก่อนพร้อมใช้งาน account หากบังคับให้สมัครใหม่จะเสี่ยงสร้าง Person/User ซ้ำและทำให้ patient record ที่ trusted actor provision ไว้ไม่เชื่อมกับ credential ของเจ้าตัว

## Decision

```text
Registration ≠ Account Activation
```

- Hospital/OSM provision patient ได้เฉพาะเมื่อ server-side policy อนุญาต
- ต้องทำ identity lookup/resolution ก่อนสร้าง Person ใหม่
- Patient ที่ถูก provision แล้วไม่ทำ public registration ซ้ำ
- Patient ใช้ first-time account activation เพื่อพิสูจน์ตัวตนและรับ ownership ของ interactive account
- Provisioning person/profile/relationship แยกจาก credential establishment
- Staff/OSM ต้องไม่รู้ secret credential และห้ามตั้ง predictable patient password
- ห้าม derive password จาก birth date, national ID, phone number หรือค่า default ที่เดาได้
- Activation mechanism เช่น OTP, email หรือ external identity provider ยังเปิดไว้ตาม requirement

## Rationale

การแยก provisioning จาก activation รองรับ care workflow ที่เริ่มโดย trusted actor โดยไม่ลดความเป็นเจ้าของ credential ของ Patient และไม่ทำให้ข้อมูลคนเดียวแตกเป็นหลาย identity

## Alternatives Considered

- ให้ Patient สมัครใหม่หลังถูก provision: ปฏิเสธเพราะเสี่ยง duplicate Person/User และ relationship ไม่ต่อเนื่อง
- ให้ staff/OSM ตั้ง password แล้วส่งต่อ: ปฏิเสธเพราะ staff รู้ credential และ password มีแนวโน้ม predictable/reused
- สร้าง active credential อัตโนมัติจากข้อมูลส่วนบุคคล: ปฏิเสธเพราะเป็นความเสี่ยงด้าน account takeover
- ล็อก activation provider ตั้งแต่ initialization: เลื่อนจน requirement ด้าน identity proofing, accessibility และ operation ชัดเจน

## Consequences

### Positive

- Patient record มีอยู่ได้ก่อน interactive login
- Credential ownership อยู่กับ Patient
- ลด duplicate registration และรักษาความต่อเนื่องของ care relationship
- สามารถเปลี่ยน activation provider โดยไม่เปลี่ยน provisioning semantics

### Trade-offs / Risks

- Identity lookup และ activation proofing เป็น high-risk boundary ที่ต้องป้องกันทั้ง false match และ account takeover
- ต้องรองรับ provisioned-but-not-active state และ recovery/expiry อย่างชัดเจน
- UI ต้องใช้ภาษา “เข้าใช้งานครั้งแรก” แทน “สมัครสมาชิก” สำหรับผู้ที่มี record แล้ว

## Open Questions

- Hospital/OSM actor ใด provision patient ได้และอยู่ใน scope ใด
- Identifier/หลักฐานที่ใช้ resolve Person และ activate account
- Activation channel, expiry, retry, abuse protection และ recovery process
- กรณี Patient ไม่มี phone/email หรือใช้ข้อมูลร่วมกับผู้อื่นต้องดำเนินการอย่างไร
- Hospital relationship และ OSM assignment ใดเป็น mandatory ในแต่ละ workflow

## References

- [Architecture Baseline: Patient Provisioning](../architecture/DEMI_ARCHITECTURE_BASELINE.md#11-patient-registration-and-provisioning)
- [Architecture Baseline: First-Time Activation](../architecture/DEMI_ARCHITECTURE_BASELINE.md#12-patient-first-time-activation-instead-of-re-registration)
- [ADR-0001: Person and User Identity](./0001-person-and-user-identity.md)
- [ADR-0006: Transactional Business Operations](./0006-transactional-business-operations.md)

