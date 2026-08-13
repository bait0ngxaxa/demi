# ADR-0003: Hospital-Led Onboarding

- Status: Accepted
- Date: 2026-08-12
- Refined: 2026-08-13 (Phase 3A requirement closure; original trust-chain decision unchanged)

## Context

Generic public signup ที่ให้ผู้ใช้เลือก role เองสร้าง trust chain ที่อ่อนและเปิดให้ business classification มาจากข้อมูลที่ client อ้างเอง ระบบใหม่ต้องให้ organization และ trusted upstream actor เป็นผู้เริ่ม membership/provisioning แทน

## Accepted

- ไม่มี generic public signup ที่ให้ผู้ใช้เลือก `ADMIN`, `HOSPITAL`, `OSM`, `PATIENT`, Doctor หรือ Nurse เอง
- Public onboarding ใน phase นี้มีเฉพาะ Hospital organization onboarding
- Hospital ต้อง match canonical/trusted Hospital Master entry โดยใช้ `hospitalCode` เป็น stable business identifier; uncontrolled free-text name ไม่ใช่ authoritative organization identity
- MVP ใช้ approved normalized Hospital Master artifact `demi_hospital_master_v2.xlsx` ซึ่งถูกแปลงเป็น deterministic fixture 78 records; `HH / hh` ไม่ถูก import และ `KANG`/`KHON` เป็น canonical corrections ที่ยืนยันแล้ว
- authoritative external Hospital Master source ยังไม่ถูกเลือก Application/domain layer จึงต้องเรียกผ่าน replaceable boundary และ MVP ใช้ controlled development/test master data ได้
- Hospital ต้องผ่าน manual Platform `ADMIN` verification ก่อนเป็น active organization
- ผู้สมัครคนแรกที่ได้รับอนุมัติเป็น `HOSPITAL` พร้อม `HospitalMembership.membershipType = OWNER` ของโรงพยาบาลนั้น
- Hospital Owner เป็น tenant-level owner ของ hospital context และไม่ใช่ Platform `ADMIN`
- Hospital Owner provision/invite hospital staff และ OSM จาก trusted hospital context
- Doctor/Nurse เป็น profession classification ภายใต้ hospital membership ก่อน ไม่ใช่ top-level role
- onboarding reuse Phase 2.1 National-ID/password authentication architecture: resolve HMAC identity ผ่าน `Person → User`, ใช้ opaque provider alias และ map provider subject ที่ `User.authSubject`; ไม่มี parallel login system หรือ mandatory email identifier
- National ID เป็น identity lookup input ไม่ใช่หลักฐานว่า public caller เป็นเจ้าของ Person/User; existing identity ที่พิสูจน์ ownership ไม่ได้ต้อง fail closed ไป trusted review/reconciliation และห้าม activate หรือ overwrite
- identity resolution ต้องเกิดก่อนสร้าง Person/User และต้อง reuse identity เดิมสำหรับ existing applicant หรือ multi-hospital membership
- application persistence แยกจาก `Hospital` ด้วย lifecycle ขั้นต่ำ `PENDING → APPROVED | REJECTED` เพื่อเก็บ rejected history/audit และไม่สร้าง active domain organization ก่อน approval
- เมื่อ submit สำเร็จ applicant ใหม่จะมี `Person` + `User(PROVISIONED)` + trusted password provider mapping และ application `PENDING`; ยังไม่มี role, OWNER membership หรือ active hospital relationship
- consistency-critical PostgreSQL writes ของ approval เป็น atomic business operation: activate/create Hospital, assign/reuse `HOSPITAL` role, create ACTIVE OWNER membership, transition account/application state ที่เกี่ยวข้อง และ record audit event ต้องสำเร็จหรือ rollback ร่วมกัน
- Phase 3B ใช้ existing canonical Hospital row จาก master แล้วเปลี่ยนสถานะเป็น `ACTIVE` เมื่อ approve; parent/main/sub reference เป็นข้อมูลประกอบและไม่ grant authority
- Supabase Auth และ PostgreSQL ไม่มี distributed transaction; credential provisioning ที่จำเป็นต้องใช้ user-owned password ผ่าน trusted Phase 2.1 primitive พร้อม compensation/reconciliation และห้าม expose primitive เป็น public account-creation API
- Exact verification evidence, reapplication, recovery และ exception paths ที่ระบุใน Open Questions ยังไม่ถูกอนุมาน

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
- Application record และ organization record แยก lifecycle กัน Service/transaction ต้อง guard stale, duplicate และ concurrent decisions
- Cross-system credential provisioning ต้องมี explicit compensation/reconciliation และห้ามรายงาน success จาก partial state

## Still Open

- exact real-world evidence, contact proof, reviewer checklist และ SLA ที่ Platform Admin ใช้ใน manual hospital verification
- authoritative external Hospital Master source/provider, production import/update owner และวิธี reconcile master data
- future automated verification mechanism
- ผู้สมัคร reapply หลัง `REJECTED` ได้เมื่อใด และใคร resolve conflicting/competing claims
- recovery path สำหรับ existing non-active User หรือ provider identity conflict
- Hospital Owner แต่งตั้ง owner เพิ่มหรือโอน ownership ได้หรือไม่
- Invitation/activation mechanism และ expiry/revocation ของ staff/OSM
- Parent/main hospital มี authority ต่อ child hospitals อย่างไร

## References

- [Architecture Baseline: Hospital Owner](../architecture/DEMI_ARCHITECTURE_BASELINE.md#8-hospital-owner-is-not-platform-admin)
- [Architecture Baseline: Signup and Onboarding](../architecture/DEMI_ARCHITECTURE_BASELINE.md#9-signup-and-onboarding-strategy)
- [Architecture Baseline: Staff and OSM Provisioning](../architecture/DEMI_ARCHITECTURE_BASELINE.md#10-staff-and-osm-are-provisioned-not-self-assigned)
- [Phase 3A Hospital Onboarding Contract](../phases/PHASE_3A_HOSPITAL_ONBOARDING.md)
