# Phase 17K.0 — วิเคราะห์ข้อกำหนด Hospital Governance และ Responsibility Area

**สถานะเอกสาร:** DECISION PACK COMPLETE
**สถานะการตัดสินใจ:** OPEN / NOT OWNER APPROVED
**สถานะการพัฒนา:** Phase 17K.1–17K.3 ยังไม่อนุญาตให้เริ่ม
**วันที่ตรวจ baseline:** 2026-10-10
**HEAD จริงตอนเริ่มงาน:** acd6a29797de01c5ac1841fd1a3666809d4729a1

> เอกสารนี้บันทึกหลักฐานและข้อเสนอเพื่อให้ Product Owner ตัดสินใจ ไม่ได้ปิด OWNER-01 หรือ AREA-01 และไม่ใช่สัญญาอนุมัติ implementation ข้อเสนอทุกข้อยังต้องได้รับคำตอบจาก Owner อย่างชัดเจน

## 1. สรุปสำหรับ Product Owner

Phase 17K.0 ตรวจเอกสาร สคีมา โค้ด policy/service/UI และ PostgreSQL integration tests ที่เกี่ยวข้องแล้ว หลักฐานพบว่า Hospital Owner มีความสามารถด้าน workforce และการจัดการงานเฉพาะ Hospital อยู่หลายส่วนแล้ว แต่ยังไม่มีการแก้ข้อมูลประวัติบุคลากรทั่วไป และยังไม่มีโดเมน Responsibility Area

ความสามารถปัจจุบันที่ยืนยันจากโค้ด:

- Owner ที่เป็น HOSPITAL และมี OWNER membership แบบ ACTIVE โดยตรงใน Hospital เป้าหมายที่ ACTIVE อ่าน Workforce และ provision บุคลากรหรือ OSM ได้
- Owner เปลี่ยน profession และ suspend/restore HospitalMembership ของ staff ที่เป็น MEMBER ได้ โดยไม่เปลี่ยน User account หรือ membership ของ Hospital อื่น
- Owner suspend/restore OsmHospitalRelationship ได้เมื่อไม่มี PatientOsmAssignment ที่ยังใช้งานอยู่
- Owner promote/demote staff เป็น OWNER ได้ด้วย transaction, audit, stale-write guard และการป้องกันไม่ให้เหลือ eligible Owner เป็นศูนย์
- Owner provision Patient และจัดการ PatientOsmAssignment ในขอบเขต PatientHospitalRelationship ของ Hospital ที่ตนมีสิทธิ์ได้
- Owner แก้ HospitalContact ของ Hospital ที่ตนเป็น Owner ได้ตามสัญญาที่ปิดใน Phase 17I; นี่เป็นข้อมูลติดต่อขององค์กร ไม่ใช่ข้อมูลติดต่อส่วนบุคคลของ workforce
- ไม่มี Area model, Area policy, Area assignment หรือ Area-based authorization
- การอ่าน Patient ของ Hospital ใช้ direct Hospital scope; OSM ใช้ exact PatientOsmAssignment ที่ผูกกับ PatientHospitalRelationship โดยตรง

**RECOMMENDATION — NOT OWNER APPROVED:** คง exact-Hospital และ exact-assignment authorization ไว้ ใช้ parentHospitalId เป็นข้อมูลลำดับ Hospital ตามเดิมโดยไม่ตีความเพิ่ม และยังไม่สร้าง Area persistence จน Owner ระบุวัตถุประสงค์หลัก taxonomy เจ้าของข้อมูล cardinality lifecycle และผลต่อ worklist/reporting ได้ครบ หากภายหลังยืนยันว่า Area เป็นเพียงกลุ่มงานของ Hospital ให้พิจารณา Hospital-local operational grouping แยกจาก geography และ authorization

สถานะปลายทางของเอกสารนี้คือ:

- **DECISION PACK COMPLETE**
- **OWNER DECISIONS OPEN**
- **IMPLEMENTATION NOT AUTHORIZED**
- **Phase 17K is not complete**

## 2. Baseline และขอบเขต

### 2.1 Repository baseline จริง

- Branch: main ตรงกับ origin/main
- HEAD: acd6a29797de01c5ac1841fd1a3666809d4729a1
- Worktree ตอนเริ่ม: clean
- Commit ล่าสุด: acd6a29 — fix: complete LINE integration re-audit
- Commit ก่อนหน้า: 1fcc038 — fix: retry bounded LINE Push rate limits
- ไม่มีการเปลี่ยนแปลงของผู้ใช้ค้างอยู่ตอนเริ่มตรวจ

เอกสาร Phase 17J.5A บันทึก reviewed starting HEAD เป็น 1fcc038ea2bd9f0e10eba48d88671984cde49a2f และรายงาน automated integration re-audit ผ่านสำหรับขอบเขตที่อนุมัติไว้ สถานะปัจจุบันใน HEAD ยืนยันว่า Phase 17J.5B real-provider/device UAT ยังแยกต่างหาก ไม่ได้ดำเนินการและไม่ได้รับอนุญาต

ระหว่าง Phase 17K.0 นี้ไม่ได้เรียก LINE provider ไม่เปลี่ยน environment หรือ deployment ไม่เริ่ม Phase 17J.5B และไม่เริ่ม comprehensive customer requirement gap review คง safety gates ตามสถานะปัจจุบัน: DEMI_LINE_DISCONNECTION_ENABLED=false และ appointment notification ยังคง OFF ตามค่าเริ่มต้น

### 2.2 ขอบเขตงานนี้

งานนี้เป็น documentation-only ตามคำสั่ง: ไม่เปลี่ยน runtime, Prisma schema/migration, seed, Server Action, service, policy, UI, environment, external integration หรือ production data

การอ่าน implementation มีจุดประสงค์เพื่อจำแนก “ระบบทำอะไรอยู่” ออกจาก “Product Owner อนุมัติให้ระบบควรทำอะไร” เท่านั้น

### 2.3 ป้ายกำกับหลักฐาน

| ป้าย | ความหมาย |
| --- | --- |
| ACCEPTED ARCHITECTURAL CONTRACT | ข้อตกลงที่ยอมรับแล้วใน ADR, architecture baseline หรือ phase closeout ที่อนุมัติ |
| VERIFIED CURRENT IMPLEMENTATION | พฤติกรรมที่เห็นจาก schema, code, route หรือ test ใน HEAD ปัจจุบัน แต่ไม่ใช่หลักฐาน Owner approval โดยตัวมันเอง |
| CUSTOMER REQUIREMENT EVIDENCE | ความต้องการ/ช่องว่างที่มีบันทึกใน customer-flow หรือ backlog แต่ยังไม่ได้ปิดความหมาย |
| LEGACY BEHAVIORAL REFERENCE | พฤติกรรมจากระบบเดิมหรือ prototype ใช้เป็นข้อมูลประกอบเท่านั้น |
| PROPOSAL / UNCONFIRMED REQUIREMENT | ข้อเสนอหรือความหมายที่ยังต้องให้ Owner ตัดสินใจ |

## 3. Evidence inventory

| Evidence | แหล่งอ้างอิง | การจำแนก | สิ่งที่ยืนยันได้ |
| --- | --- | --- | --- |
| E01 Identity และ authorization baseline | [ADR-0001](../adr/0001-person-and-user-identity.md), [ADR-0002](../adr/0002-role-capability-scope-authorization.md), [ADR-0005](../adr/0005-server-side-application-boundary.md), [ADR-0006](../adr/0006-transactional-business-operations.md), [ADR-0008](../adr/0008-workforce-provisioning-and-activation.md), [architecture baseline](../architecture/DEMI_ARCHITECTURE_BASELINE.md) | ACCEPTED ARCHITECTURAL CONTRACT | Person/User แยกกัน; authorization เป็น Role + Capability + Scope บน server; Owner เป็น HOSPITAL + direct OWNER membership; relationship และ transaction boundary มีความหมายแยกกัน |
| E02 Current schema | [prisma/schema.prisma](../../prisma/schema.prisma) | VERIFIED CURRENT IMPLEMENTATION | Hospital มี parentHospitalId; HospitalMembership, OsmHospitalRelationship, PatientHospitalRelationship และ PatientOsmAssignment เป็นคนละ entity; ไม่มี Area model |
| E03 Workforce provisioning และ governance | [workforce service](../../src/modules/workforce/services/workforce-service.ts), [workforce policy](../../src/modules/workforce/policies/workforce-policy.ts), [Owner policy](../../src/modules/workforce/policies/hospital-owner-policy.ts), [workforce actions](../../src/modules/workforce/transport/server-actions.ts), [workforce UI](../../app/app/workforce/workforce-workspace.tsx) | VERIFIED CURRENT IMPLEMENTATION | มี exact-Hospital workforce list/detail, provisioning, profession edit, staff/OSM lifecycle และ Owner promotion/demotion |
| E04 Hospital lifecycle | [hospital governance policy](../../src/modules/hospital-governance/policies/hospital-governance-policy.ts), [hospital governance service](../../src/modules/hospital-governance/services/hospital-governance-service.ts) | VERIFIED CURRENT IMPLEMENTATION | Platform ADMIN เป็นผู้ suspend/restore Hospital; การเปลี่ยน status มี transaction, stale check และ audit |
| E05 Patient scope และ assignment | [Patient Directory policy](../../src/modules/patient-directory/policies/patient-directory-policy.ts), [assignment policy](../../src/modules/patient-assignment/policies/patient-osm-assignment-policy.ts), [assignment service](../../src/modules/patient-assignment/services/patient-osm-assignment-service.ts), [Phase 6A contract](./PHASE_6A_PATIENT_ACCESS_AND_ASSIGNMENT.md) | ACCEPTED ARCHITECTURAL CONTRACT และ VERIFIED CURRENT IMPLEMENTATION | Hospital อ่านตาม direct Hospital scope; OSM อ่านตาม active exact assignment; Hospital hierarchy ไม่ grant Patient scope |
| E06 Hospital Contact | [Phase 17I.0B closeout](./PHASE_17I0B_HOSPITAL_KNOWLEDGE_CONTACT_DECISION_CLOSEOUT.md), [Hospital Contact policy](../../src/modules/hospital-contact/policies/hospital-contact-policy.ts), [service](../../src/modules/hospital-contact/services/hospital-contact-service.ts) | ACCEPTED ARCHITECTURAL CONTRACT และ VERIFIED CURRENT IMPLEMENTATION | OWNER ของ Hospital เดียวจัดการ addressText/phoneNumber ของ Hospital นั้น; ไม่สืบทอด contact จาก parent |
| E07 Patient provisioning และ profile | [Patient provisioning](../../src/modules/patient-provisioning/services/patient-provisioning-service.ts), [Patient Hospital Profile policy](../../src/modules/patient-hospital-profile/policies/patient-hospital-profile-policy.ts), [service](../../src/modules/patient-hospital-profile/services/patient-hospital-profile-service.ts) | VERIFIED CURRENT IMPLEMENTATION | Provisioning สร้าง/ใช้ Patient identity และ Hospital relationship; การแก้ PatientHospitalProfile ใช้ Patient SELF policy |
| E08 Reporting | [Program report access](../../src/modules/reporting/services/program-report-access-service.ts), [report query](../../src/modules/reporting/services/program-report-query-service.ts), [Phase 17 backlog](./PHASE_17_UAT_BACKLOG.md) | VERIFIED CURRENT IMPLEMENTATION และ CUSTOMER REQUIREMENT EVIDENCE | มี factual Program report ที่ถูก scope ด้วย Program; Hospital dashboard/export เป็น RPT-02 ซึ่งยัง requirement-gated; ไม่พบ Area aggregation |
| E09 Customer flow | [Phase 17A](./PHASE_17A_CUSTOMER_FLOW_CANONICALIZATION_UAT_CONTRACT.md), [17 UAT backlog](./PHASE_17_UAT_BACKLOG.md) | CUSTOMER REQUIREMENT EVIDENCE | OWNER-01 ต้องตัดสิน editable fields/area scope; AREA-01 ยังต้องตัดสิน taxonomy, ownership, membership, inheritance, authorization และ reporting |
| E10 Workforce governance history | [11A requirements](./PHASE_11A_WORKFORCE_LIFECYCLE_HOSPITAL_GOVERNANCE_REQUIREMENTS.md), [11B prototype](./PHASE_11B0_STAFF_MEMBERSHIP_LIFECYCLE_WORKING_PROTOTYPE.md), [11C analysis](./PHASE_11C_OSM_RELATIONSHIP_LIFECYCLE_ASSIGNMENT_CONSEQUENCES.md), [12C contract](./PHASE_12C_OWNER_GOVERNANCE_ACCOUNT_RECOVERY_CONTRACT.md), [12D prototype](./PHASE_12D0_HOSPITAL_OWNER_GOVERNANCE_WORKING_PROTOTYPE.md) | LEGACY BEHAVIORAL REFERENCE และ PROPOSAL / UNCONFIRMED REQUIREMENT | ใช้เทียบพฤติกรรมเดิมและขอบเขต prototype; 12D ระบุชัดว่าไม่ใช่นโยบายสุดท้ายที่ Customer อนุมัติ |

## 4. Invariants ที่ Phase 17K ต้องรักษา

ขอบเขตต่อไปนี้ไม่เปิดให้ Phase 17K เปลี่ยนโดยปริยาย:

1. Person คือบุคคลจริง; User คือบัญชีแอปพลิเคชัน และคนเดียวกันใช้ core identity เดิมข้าม role/Hospital
2. Top-level roles มี ADMIN, HOSPITAL, OSM และ PATIENT; Doctor/Nurse/Profession เป็น classification ไม่ใช่ role
3. Hospital Owner คือ User ที่มี HOSPITAL และ direct OWNER membership ที่มีสิทธิ์ใน Hospital เป้าหมาย; ไม่ใช่ Platform ADMIN
4. Authentication authority ยังคงเป็น Supabase-backed DEMI session และ ActorContext ที่ server resolve จากข้อมูลปัจจุบัน
5. ทุก operation ใช้ Role + Capability + Scope; policy ฝั่ง server เป็น authority และ fail closed
6. Request parameter, client state, selected Hospital, area membership หรือ UI visibility ไม่ grant permission
7. parentHospitalId ไม่ถูกแก้หรือ reinterpret เพื่อสืบทอดสิทธิ์
8. OsmHospitalRelationship หมายถึง OSM–Hospital association เท่านั้น ไม่ใช่ Patient assignment, geography หรือ clinical access
9. PatientOsmAssignment เป็น access boundary แบบ exact relationship-level และไม่ถูกแทนด้วย Area
10. การมี geography หรือ operational grouping ไม่ทำให้ได้ Patient read/update authority
11. การเปลี่ยนหลาย record ที่เป็น invariant เดียวกันต้องใช้ transaction และประสาน success audit event
12. การเปลี่ยน governance ไม่ rewrite historical clinical records, appointment, PatientHospitalRelationship หรือ PatientOsmAssignment
13. Existing direct Hospital Patient scope และ exact assigned-Patient OSM scope เป็นค่าเริ่มต้นต่อไป; การขยาย scope ต้องเป็น decision ใหม่ มี policy contract และ security tests แยก

Key service entry points verified in code include provisionHospitalMember, provisionOsm, listWorkforceOwnerHospitals, getWorkforceDetail, listWorkforce, promoteHospitalOwner, demoteHospitalOwner, updateHospitalMembershipProfession, suspendHospitalMembership, restoreHospitalMembership, suspendOsmRelationship, restoreOsmRelationship, provisionPatient, assignOsmToPatient, unassignOsmFromPatient, suspendHospital and restoreHospital. Relevant policy functions include decideHospitalOwnerPolicy, decidePatientReadPolicy and decideOsmAssignedPatientReadPolicy. Model names and owning files are listed in the evidence inventory.

## 5. Current implementation audit

### A. Hospital และ parentHospitalId

**VERIFIED CURRENT IMPLEMENTATION:** Hospital มี identity fields hospitalCode/name/status และ optional self-reference parentHospitalId ที่มี foreign key แบบ restrict. Hospital Master projection แสดง parentHospitalCode ใน onboarding context. ไม่พบ Area model หรือ MAIN/SUB enum ใน schema ปัจจุบัน และการค้น runtime references พบ parentHospitalId ใน schema, migration และ Hospital Master presentation เท่านั้น

**ผลต่อ policy:** โค้ด Owner, Patient Directory และ assignment ใช้ exact hospitalId และสถานะ Hospital; parent/child ไม่ถูกใช้ขยาย authorization

**ข้อจำกัดของหลักฐาน:** การมี self-reference ไม่ได้บอกว่าลูกค้าต้องการโครงสร้างแบบใด ไม่พิสูจน์ว่า parent เป็นผู้บังคับบัญชา ไม่ได้ยืนยันความครบถ้วนของ master data และไม่ให้เหตุผลแก้ parentHospitalId ใน Phase 17K

### B. HospitalMembership, OWNER/MEMBER และ Profession

**VERIFIED CURRENT IMPLEMENTATION:** HospitalMembership เป็นความสัมพันธ์ User–Hospital มี unique(userId, hospitalId), membershipType OWNER/MEMBER, profession แบบ nullable, status และ timestamps. Profession มี Doctor, Nurse, Coordinator และ Other ตาม enum ปัจจุบัน

Owner มี policy/service แยกสำหรับอ่าน workforce, provision staff, เปลี่ยน profession ของ MEMBER, suspend/restore MEMBER และ promote/demote OWNER. Mutation ตรวจ actor/target ใหม่ใน serializable transaction และใช้ expectedUpdatedAt ป้องกัน stale write. Audit event อยู่ใน transaction

**ข้อจำกัด requirement:** 12D เรียก behavior Owner promote/demote ว่า working prototype และไม่ใช่ customer-approved final policy. การที่ capability มีอยู่ไม่ปิดคำถาม OWNER-01

### C. OsmHospitalRelationship

**VERIFIED CURRENT IMPLEMENTATION:** OSM ใช้ Role.OSM และ OsmHospitalRelationship แยกจาก HospitalMembership. มี unique(userId, hospitalId) และ lifecycle status. ActorContext โหลด OSM–Hospital relationships จากฐานข้อมูล

OSM relationship ใช้ยืนยัน association กับ Hospital เท่านั้น. การมี relationship ไม่สร้าง Area, Patient assignment หรือ clinical authority. Owner suspend/restore ได้เฉพาะ relationship ใน Hospital ของตน และ service ปฏิเสธเมื่อ OSM ยังมี current PatientOsmAssignment ใน Hospital นั้น

### D. PatientHospitalRelationship

**VERIFIED CURRENT IMPLEMENTATION:** PatientHospitalRelationship ผูก PatientProfile กับ Hospital, เก็บ Hospital-local hospitalNumber และบังคับ unique(patientProfileId, hospitalId). Patient หนึ่งคนมี relationship ได้หลาย Hospital. Model ปัจจุบันไม่มี lifecycle status ของ relationship; ห้ามสมมุติ ACTIVE/TRANSFERRED/CLOSED field ที่ไม่มีจริง

Owner provisioning ทำให้มี Patient–Hospital relationship ตาม policy; ไม่มี generic Owner operation สำหรับแก้ Patient identity หรือย้าย relationship

### E. PatientOsmAssignment

**ACCEPTED ARCHITECTURAL CONTRACT และ VERIFIED CURRENT IMPLEMENTATION:** PatientOsmAssignment อ้าง PatientHospitalRelationship โดยตรง เก็บ OSM user, assigning actor, createdAt, endedAt และ actor ที่ปิด assignment เพื่อรักษาประวัติ. Assignment ไปยัง Patient ที่ Hospital อื่นเป็นคนละ relationship และต้องผ่าน policy/validation เดิม

การสร้าง/สิ้นสุด assignment เป็น Hospital OWNER operation แบบ exact Hospital และ transactional audit. OSM roster และ Patient read ตรวจ exact assignment และความสัมพันธ์ OSM–Hospital ปัจจุบันตามเงื่อนไข policy

### F. Hospital Owner governance actions

**VERIFIED CURRENT IMPLEMENTATION:**

| Operation | ความสามารถที่มี | ขอบเขตที่ตรวจ |
| --- | --- | --- |
| Workforce read | membership:read | direct active OWNER + exact active Hospital |
| Staff provisioning | membership:create | provision/reuse Person/User, HOSPITAL role, MEMBER relationship, profession และ activation ตามเงื่อนไข |
| OSM provisioning | osm:provision | provision/reuse User, OSM role และ OsmHospitalRelationship แยก |
| Profession | membership:update | เปลี่ยน profession ของ active MEMBER เท่านั้น |
| Staff membership lifecycle | membership:suspend / membership:restore | เปลี่ยนเฉพาะ status ของ MEMBER; ไม่เปลี่ยน User status |
| OSM relationship lifecycle | osm:suspend / osm:restore | เปลี่ยนเฉพาะ OSM–Hospital relationship; reject เมื่อมี Patient assignment ปัจจุบัน |
| Owner governance | hospital-owner:promote / hospital-owner:demote | เปลี่ยน membershipType ของ exact active membership; ป้องกัน last eligible Owner |
| Patient assignment | patient:assign-osm | assign/unassign OSM ใน exact PatientHospitalRelationship |
| Hospital contact | hospital-contact:update | แก้เฉพาะ contact ของ exact Hospital ที่ Owner มีสิทธิ์ |

hospital:suspend และ hospital:restore เป็น Platform ADMIN governance ไม่ใช่ Hospital Owner operation

### G. Workforce provisioning และ lifecycle

New workforce identity ถูก resolve ด้วย identity service ก่อนสร้าง Person ใหม่; existing Person/User ถูก reuse. Name ที่ส่งระหว่าง provision ไม่เขียนทับชื่อ Person ที่มีอยู่แล้ว. New User เป็น PROVISIONED และรับ activation capability แบบ one-time; target User ตั้งรหัสผ่านเอง. Existing active User ใช้ credential เดิม

การ suspend membership หรือ OSM relationship เป็น lifecycle ของ relationship ไม่ใช่การระงับ User ทั้งบัญชี. Owner ไม่มี operation ทั่วไปเพื่อเปลี่ยน User.status, credential, authSubject, global UserRole หรือข้อมูล Person

### H. Multi-Hospital identity และ authorization

Person หนึ่งคนมี User เดียวและ User มีได้หลาย role, HospitalMembership และ OsmHospitalRelationship. Membership/profession/status เป็นค่าของความสัมพันธ์ Hospital นั้น ไม่ใช่คุณสมบัติ workforce ระดับ global. การเป็น Owner ที่ Hospital A ไม่ให้ membership disclosure หรือ authority ใน Hospital B

listWorkforceOwnerHospitals แสดงเฉพาะ Hospital ที่ actor มี active direct Owner membership. ตัวเลือก Hospital จาก browser เป็น locator ที่ service ตรวจซ้ำ

### I. Hospital-scoped Patient access

Hospital role OWNER/MEMBER อ่าน Patient ได้เมื่อมี direct active membership ใน Hospital เป้าหมายที่ active ตาม patient:read. Patient ใน Hospital ลูก/พี่น้อง/เครือข่ายไม่รวมอยู่ด้วย

OSM อ่าน Patient ได้เมื่อมี exact current PatientOsmAssignment ภายใต้ PatientHospitalRelationship ของ Patient นั้น รวมถึงเงื่อนไข User, role, OSM–Hospital relationship และ Hospital ที่ active. OSM–Hospital association เพียงอย่างเดียวไม่พอ. Patient provisioning เป็นคนละ operation กับ Patient read และไม่สร้าง assignment โดยอัตโนมัติ

### J. Reporting และ organizational grouping

ปัจจุบันมี factual Program report ที่ query/access ถูก bind กับ Program และ PatientHospitalRelationship จริง. ไม่พบ Hospital-wide Area report, Area aggregation, hierarchy report inheritance หรือ Area dashboard/export. Backlog RPT-02 แยก Hospital dashboard/export เป็น requirement-gated ใน Phase 17L

ผลคือ Area, ถ้าได้รับอนุมัติ, จะยังไม่กลายเป็น reporting source โดยอัตโนมัติ. การ aggregate ต้องกำหนด actor scope, fields, PII, minimum group size, filters, historical meaning, export และ audit แยกต่างหาก

## 6. OWNER-01 — ขอบเขต capability ปัจจุบันและช่องว่าง

OWNER-01 ใน Phase 17 backlog ระบุให้ reuse provisioning/lifecycle ที่มี และเพิ่มเฉพาะการแก้ข้อมูลหรือ governance ที่ Owner ยืนยันแล้ว. STAFF-03 ยืนยันว่า Hospital-scoped provisioning ไม่ได้หมายถึง arbitrary edit หรือ Area assignment. OWNER-02 คงข้อห้ามไม่ให้ Hospital Owner กลายเป็น Platform ADMIN

### ยืนยันจาก code เทียบกับสิ่งที่ยังไม่มี

| หัวข้อ | สิ่งที่มีใน HEAD | Gap / ความหมายที่ยังต้องตัดสิน |
| --- | --- | --- |
| Workforce listing/detail | exact Hospital projection แสดงชื่อ, kind, profession ของ staff, status ของ relationship/account และ activation state ที่ allowlist | ไม่มี cross-Hospital membership disclosure; Owner ต้องไม่ใช้ข้อมูลจาก Hospital อื่นเป็น implicit authority |
| Provision staff/OSM | schema รับชื่อ, Thai National ID และ Hospital target; staff เพิ่ม profession; OSM แยก relationship; Person/User ถูก reuse | นี่เป็น create/reuse flow ไม่ใช่ generic edit form; National ID เป็น lookup ไม่ใช่หลักฐาน ownership |
| Membership lifecycle | Owner เปลี่ยน profession และ suspend/restore MEMBER ที่เงื่อนไขผ่าน | ไม่มีการเปลี่ยนบัญชี global หรือแก้ arbitrary profile |
| OSM lifecycle | Owner suspend/restore exact association; assignment ที่ active ทำให้ operation conflict | ยังไม่มี transfer/reassignment อัตโนมัติ; ไม่ควรเดาความหมายจาก Area |
| Owner promote/demote | มี bounded membershipType transition, last eligible Owner guard, audit, transaction และ stale guard | มีทั้ง Phase 12C contract และ Phase 12D working prototype เป็นที่มา; Phase 12D ระบุว่าไม่ใช่ final customer-approved policy; ยังต้องยืนยันผู้แต่งตั้ง, self-demote และ last-owner exception |
| Display/contact | Workforce ใช้ display name จาก Person; HospitalContact มี addressText/phoneNumber ซึ่ง exact Hospital Owner แก้ได้ | ไม่มี staff phone/email/DOB/license/specialty profile editor; Hospital contact เป็นคนละ entity |
| Generic profile edit | ไม่พบ service/policy/schema/action สำหรับ Owner เปลี่ยน Person/User fields ทั่วไป | field owner, verification/correction, audit, cross-Hospital impact ยังไม่ปิด |
| Area assignment | ไม่มี Area persistence, membership, workflow หรือ policy | ต้องตัดสินก่อนสร้าง domain; ห้ามทำเพียงเพราะ UI ต้องมี dropdown |

ข้อมูลเดิมใน Phase 11A แสดง legacy edit modal ที่เปลี่ยนชื่อ specialization phone email วันเกิด Hospital และ ID รวมถึง legacy hierarchy access helper ที่ขยาย main/child/sibling scope. สิ่งเหล่านี้เป็น LEGACY BEHAVIORAL REFERENCE เท่านั้น. Phase 11A เองระบุว่า field ownership และ Hospital authority เป็น open requirements; ไม่ยก legacy fields หรือ scope มาเป็น requirement ของ DEMI

## 7. Field ownership matrix

ตารางนี้แยก canonical entity กับ actor ที่อาจได้รับสิทธิ์ในอนาคต. “RECOMMENDATION — NOT OWNER APPROVED” หมายถึงข้อเสนอ ไม่ใช่การอนุญาตให้ implement. การกระทำที่ code ทำได้ในปัจจุบันยังต้องไม่ถูกนำไปสรุปว่า Owner อนุมัติ final policy

| Field/entity | Canonical owner และ scope | Current behavior | Actor/capability ที่เสนอ | Validation และ audit | Cross-Hospital effect / Read-only / Owner approval |
| --- | --- | --- | --- | --- | --- |
| Person.givenName / familyName | Person; global ต่อบุคคลจริง | Workforce ใช้แสดงชื่อ; provisioning สร้างชื่อเมื่อสร้าง Person ใหม่; resolvePerson คืน Person เดิมโดยไม่เขียนทับ | **RECOMMENDATION — NOT OWNER APPROVED:** Owner อ่านได้ใน projection ขั้นต่ำ แต่ไม่มี generic edit capability; correction ใช้ identity/profile process ที่ Owner อนุมัติแยก | Provision ใช้ชื่อ required 1–120 ตัวอักษร; correction ต้องมีหลักฐาน/ผู้รับผิดชอบ/audit ที่ยืนยันก่อน | การแก้กระทบ User และ Hospital ทุกแห่งของ Person; ให้อ่านอย่างเดียวสำหรับ Owner จนกว่า approval และ correction contract ชัด |
| Candidate personal contact / birth / credential fields (phone, email, DOB, specialty/license) | ยังไม่มี canonical field/entity ที่ยืนยันใน current schema; ถ้าต้องเก็บต้องตัดสิน global Person vs Hospital-local profile | ไม่พบ generic workforce editor; legacy modal เป็น LEGACY BEHAVIORAL REFERENCE | **RECOMMENDATION — NOT OWNER APPROVED:** ยังไม่เปิด Owner edit; กำหนด owner/verification ต่อ field ก่อน | กำหนด format, sensitivity, verification, correction evidence, retention และ field-specific audit; ห้ามบันทึก secret/ID ใน audit | scope ยังไม่ชัดและอาจกระทบทุก Hospital หากเป็น global; read-only จน Owner อนุมัติ field-by-field |
| Person.identityKeyHash / National ID input | Identity domain; global identity locator | ไม่แสดงใน workforce projection; ใช้ HMAC resolution ตอน provision | **RECOMMENDATION — NOT OWNER APPROVED:** ไม่มี Owner edit/read capability; ไม่ใช้เป็น profile field | ตรวจ schema/identity service; ห้าม audit raw ID/hash; reconciliation ต้องเป็น privileged flow ที่แยก | กระทบ identity ทุก role/Hospital; read-only และห้าม Owner เปลี่ยน |
| User.status, authSubject, credentials, UserRole | User/account + authentication boundary; global | ActorContext อนุญาตเฉพาะ User ACTIVE; workforce flow ไม่แก้ credential; activation ให้ target ตั้ง password | **RECOMMENDATION — NOT OWNER APPROVED:** ไม่มี Hospital Owner capability; account recovery/global status แยกต่างหาก | Server auth/account service, explicit recovery/activation contract; ห้ามเก็บ secret ใน audit | เปลี่ยนทุก Hospital/role; Owner read-only เฉพาะสถานะจำเป็น ห้ามแก้ global account |
| Hospital.name, hospitalCode, parentHospitalId, Hospital.status | Hospital Master / Platform governance; organization-level | Parent แสดงใน Master context; suspend/restore ใช้ ADMIN policy | **RECOMMENDATION — NOT OWNER APPROVED:** ไม่เพิ่ม Owner edit; hierarchy/status ใช้เจ้าของข้อมูลและ operation เดิม | Master/source validation; status transition พร้อม transaction/audit ตามปัจจุบัน | กระทบทุก user/relationship; Owner read-only; ห้ามแก้/reinterpret parentHospitalId ใน 17K |
| HospitalMembership.membershipType | HospitalMembership; exact Hospital relationship | Owner มี promote/demote สำหรับ exact active Member/Owner | **RECOMMENDATION — NOT OWNER APPROVED:** คงเฉพาะ capability เดิมหลัง Owner ยืนยัน promotion/demotion policy; ห้ามแก้ role ระดับ User | target role/state + expectedUpdatedAt; serializable transaction; last eligible Owner guard; audit | เปลี่ยนเฉพาะ membership นี้; ไม่เปลี่ยน Hospital อื่น; ต้อง Owner อนุมัตินโยบายสุดท้าย |
| HospitalMembership.profession | HospitalMembership; Hospital-local classification | Owner เปลี่ยน profession ของ active MEMBER ผ่าน membership:update | **RECOMMENDATION — NOT OWNER APPROVED:** คงขอบเขต exact membership; ห้ามใช้ profession เป็น permission | enum ปัจจุบัน; target MEMBER ACTIVE; stale check; atomic audit | ไม่เปลี่ยน Person/User หรือ profession ใน Hospital อื่น; read-only นอก exact Owner scope; ยืนยัน field set กับ Owner |
| HospitalMembership.status | HospitalMembership; Hospital-local lifecycle | Owner suspend/restore Member ผ่าน membership:suspend/restore | **RECOMMENDATION — NOT OWNER APPROVED:** คง relationship-only lifecycle; ไม่ cascade เป็น User.status | ACTIVE↔SUSPENDED ตาม transition; target/account/hospital recheck; stale check; audit ใน transaction | ผลอยู่ใน Hospital นี้; membership/role อื่นยังอยู่; Owner approval ต้องยืนยันผลต่อ care/workflow |
| OsmHospitalRelationship.status | OSM–Hospital association; exact Hospital | Owner suspend/restore ผ่าน osm:suspend/restore เมื่อไม่มี current Patient assignments | **RECOMMENDATION — NOT OWNER APPROVED:** คง exact lifecycle; ไม่เปลี่ยน Role.OSM หรือ Hospital อื่น | ตรวจ User ACTIVE, Role.OSM, Hospital ACTIVE, expected status/version และ assignment count; audit atomic | กระทบ OSM access ใน Hospital นี้เท่านั้น; read-only นอก scope; Owner ยืนยันว่าต้อง unassign ก่อน |
| HospitalContact.addressText / phoneNumber | HospitalContact; Hospital-local operational contact | Exact active Owner manage ได้ตาม approved 17I.0B; Patient อ่านผ่าน own Hospital relationship | ใช้ hospital-contact:update ที่มีอยู่ | schema/length bounds, version check, transaction/audit ตาม 17I contract | ไม่กระทบ Person/workforce หรือ Hospital อื่น; นี่เป็น approved 17I scope และไม่ใช่ decision ใหม่ของ OWNER-01 |
| PatientProfile fields | PatientProfile/Person; Patient data | Hospital อ่านได้เฉพาะ projection ที่ policy อนุญาต; Owner edit ทั่วไปไม่พบ | **RECOMMENDATION — NOT OWNER APPROVED:** ไม่มี Owner profile-edit capability | ใช้ Patient SELF/identity contract; field-specific validation | กระทบ Patient ทุก Hospital หากเป็น global; Owner read-only เว้นแต่ contract ระบุ field |
| PatientHospitalProfile fields | PatientHospitalRelationship-local Patient-provided profile | updateOwnPatientHospitalProfile ใช้ PATIENT SELF และ patient:profile:update | **RECOMMENDATION — NOT OWNER APPROVED:** ห้ามเพิ่ม Owner edit โดยอนุมานจาก Hospital scope | schema/version check ใน Patient SELF service; การแก้ไขมีเจ้าของเป็น Patient ตามปัจจุบัน | จำกัดต่อ Patient–Hospital relationship; Owner ไม่ใช่ editor |
| PatientHospitalRelationship.hospitalNumber / relationship | PatientProfile–Hospital; exact relationship | Provisioning/import สร้างหรือ reuse; no lifecycle status ใน model | **RECOMMENDATION — NOT OWNER APPROVED:** ไม่มี generic Owner move/transfer; correction ต้อง contract เฉพาะ | ตรวจ Patient identity/Hospital scope/uniqueness; transaction/audit สำหรับ operation ที่อนุมัติ | การแก้ Hospital เปลี่ยนขอบเขต Patient; read-only สำหรับ arbitrary edit/transfer |
| PatientOsmAssignment | exact PatientHospitalRelationship | Owner assign/unassign OSM ผ่าน patient:assign-osm; history ถูกเก็บ | ใช้ capability/service ที่มีอยู่เฉพาะ assignment action | ตรวจ exact relation, same-Hospital active OSM, stale/concurrency และ atomic audit | ไม่ควรสร้าง/ลบเพราะ Area ถูกเปลี่ยน; เป็น authority boundary แยก |
| Responsibility Area (ไม่มีในระบบ) | ยังไม่มี canonical owner หรือ identity | ไม่มี persistence, policy หรือ UI | **RECOMMENDATION — NOT OWNER APPROVED:** ยังไม่มี actor/capability จนปิด K-Q01–K-Q18 | ต้องกำหนด taxonomy, ownership, cardinality, lifecycle, validation, audit และ concurrency ก่อน | ห้ามเป็น Patient access grant; ห้ามใช้ข้าม Hospital โดยปริยาย; ยังไม่ใช่ field ที่แก้ได้ |

## 8. AREA-01 — วิเคราะห์ความหมายและทางเลือกของ Responsibility Area

คำว่า “เขตความรับผิดชอบ” ยังไม่ระบุว่าเป็นขอบเขตองค์กร ภูมิศาสตร์ การจัดงาน บุคลากร ผู้ป่วย สิทธิ์ หรือมิติรายงาน Phase 17A บันทึกความหมายเหล่านี้เป็นคำถามเปิด ไม่ใช่ข้อกำหนดที่ตัดสินแล้ว

### 8.1 ความหมายที่อาจเป็นไปได้

| ความหมาย | วัตถุประสงค์ / source of truth / identity | Scope, cardinality และผู้จัดการ | Lifecycle, authorization, revocation และหลาย Hospital | Reporting, history, migration และคำถามเปิด |
| --- | --- | --- | --- | --- |
| A. โครงสร้างองค์กร | แสดง Hospital และความสัมพันธ์ parent/child; source คือ Hospital Master; identity คือ Hospital.id | Hospital หนึ่งมี parent ได้ตาม schema ปัจจุบัน; parent มี child ได้หลายแห่ง; owner ของข้อมูลเป็น Platform/Hospital Master | ปัจจุบัน parentHospitalId เป็น metadata; ห้ามถือว่า parent หรือ child สืบทอด authority; การแก้โครงสร้างควรเป็น governance ระดับ Master | จัดกลุ่มรายงานได้เมื่อ query กำหนดเอง; ต้องไม่เปลี่ยนย้อนหลัง clinical relationship; ต้องถามว่า hierarchy มีความหมายเชิงองค์กรอะไรบ้าง |
| B. พื้นที่ภูมิศาสตร์ | แสดงขอบเขต เช่น จังหวัด/อำเภอ/ตำบล/หมู่บ้าน; source อาจเป็นทะเบียนภูมิศาสตร์ทางการ; identity ต้องเป็นรหัสภูมิศาสตร์ canonical ไม่ใช่ชื่ออย่างเดียว | ภูมิศาสตร์หนึ่งมีหลายระดับและหลายขอบเขต; Hospital ครอบคลุมพื้นที่ได้หลายแห่งและพื้นที่อาจเกี่ยวกับหลาย Hospital | ผู้จัดการข้อมูลอาจอยู่นอก Hospital; เปลี่ยนรหัส/เขตได้ตามเวลา; geography ไม่ควรให้สิทธิ์ clinical data | ต้องระบุ effective date, boundary version, การยุบ/เปลี่ยนรหัส และ mapping ประวัติ; ต้องมีแหล่งข้อมูลและนโยบาย backfill ก่อน |
| C. กลุ่มงานปฏิบัติการของ Hospital | จัดคิว/ทีม/พื้นที่ทำงานภายในหน่วยงาน; source คือ Hospital ที่กำหนดกลุ่มงาน; identity เป็น ID เฉพาะ Hospital | โดยข้อเสนอ อาจมีหลายกลุ่มต่อ Hospital และบุคลากรหลายคนต่อกลุ่ม; บุคลากรอาจอยู่หลายกลุ่มได้ก็ต่อเมื่อ Owner ยืนยัน | Owner ของ Hospital เป้าหมายอาจเป็นผู้จัดการ; การระงับ/ย้ายสมาชิกกระทบ worklist เท่านั้นตามข้อเสนอ; ห้ามมีผล authorization อัตโนมัติ | อาจใช้ group-by ในรายงาน operational แบบ exact-Hospital; ต้องกำหนดเก็บ snapshot หรือใช้ membership ปัจจุบัน; การนำข้อมูลเดิมเข้าไม่ควรเดาจากที่อยู่ |
| D. การจัดสรรบุคลากร | บอกว่าใครทำงานให้พื้นที่/งานใด; source คือ operational assignment contract; identity คือ assignment ที่มีผู้รับ ช่วงเวลา และผู้กำหนด | อาจเป็นหลายต่อหลายและมี effective dates; assignment ต้องอยู่ใน Hospital scope ที่ชัด | การเพิ่ม/ถอน assignment มี audit และ revoke เฉพาะงานที่กำหนด; ไม่ทำให้ user เข้าอ่าน Patient อัตโนมัติ | ต้องกำหนดงานที่แสดงใน worklist, stale update, การส่งต่องาน และรายงานประวัติ; ต้องแยกจาก membership ของ OSM–Hospital |
| E. การจัดสรร Patient | บอกผู้รับผิดชอบ Patient รายบุคคล; source ปัจจุบันคือ PatientOsmAssignment ที่ exact PatientHospitalRelationship | ปัจจุบัน Patient relationship หนึ่งมี assignment history ต่อ OSM; OSM อาจมี assignment หลาย Patient | เป็น access boundary ที่มีอยู่; grant/revoke ตาม policy/service ปัจจุบัน; การเปลี่ยน Area ต้องไม่สร้าง/ลบ assignment | รักษาประวัติ endedAt และการระบุผู้กระทำ; การย้าย Patient/Hospital หรือ OSM ต้องใช้ contract เฉพาะ ไม่อนุมานผ่าน Area |
| F. Authorization scope | บอกทรัพยากรที่ actor อ่าน/เขียนได้; source คือ policy server-side Role + Capability + Scope | ต้องประเมิน actor, action, resource และ exact relationship ที่เกี่ยวข้อง; ไม่ใช่เพียง taxonomy ของพื้นที่ | ปัจจุบัน Hospital และ Patient assignment policies เป็น authority; หากเพิ่ม Area scope ต้องเป็น decision แยกและทดสอบ deny/revoke/fail-closed | รายงานการเข้าถึงต้องระบุขอบเขตและหลักฐาน; ห้ามย้าย authority ไปสู่ browser filter หรือ area membership โดยเงียบ |
| G. Reporting grouping | จัดกลุ่มผลรวมเพื่อมุมมอง operation; source อาจเป็น Hospital, geography หรือ operational grouping ที่นิยาม | group หนึ่งอาจรวมหลาย relationship; ต้องประกาศ exact scope และผู้ดูรายงาน | read model/report permission แยกจากการมอบหมายงานและ clinical access; ห้าม aggregate ข้าม Hospital โดยปริยาย | ต้องกำหนด filter, de-identification, historical “as-of” semantics และ denominator; ปัจจุบันไม่มี Hospital Area report ที่อนุมัติ |

### 8.2 เปรียบเทียบทางเลือกของ model

| ทางเลือก | สิ่งที่ทำ | ข้อดี | ต้นทุน/ความเสี่ยงและเงื่อนไข | การประเมิน |
| --- | --- | --- | --- | --- |
| Option A — ใช้ Hospital hierarchy metadata ที่มี โดยไม่สร้าง Area persistence | ใช้ Hospital.id/parentHospitalId สำหรับแสดงโครงสร้างหรือ filter ที่ตั้งใจระบุ | ไม่เพิ่ม schema; สอดคล้องกับข้อมูลปัจจุบัน | ไม่ครอบคลุมพื้นที่ภูมิศาสตร์/ทีมปฏิบัติการ; ต้องไม่มี hierarchy inheritance; ต้องยืนยันว่าโครงสร้าง Master ตอบโจทย์ส่วนใด | ใช้ได้เป็นข้อมูลโครงสร้างที่มีอยู่; ไม่ใช่ Area model และไม่ควรตีความเพิ่ม |
| Option B — Hospital-local operational grouping ที่ไม่ authoritative | สร้างกลุ่มงานเป็น metadata ใน Hospital เดียว; แสดงการจัดกลุ่ม แต่ไม่ให้สิทธิ์ Patient | ตอบโจทย์จัดระเบียบงานได้ด้วยขอบเขตชัด; ไม่เปลี่ยน clinical policy หากคุม read/write แยก | ยังต้องตัดสิน taxonomy, cardinality, ผู้จัดการ, lifecycle, audit, report semantics และข้อมูลย้าย; หากเพิ่มสมาชิกต้องแยก workforce membership จาก OSM relationship | อาจเป็น MVP หาก Owner ยืนยันความหมายว่าเป็น operational grouping และไม่ใช้เป็น authorization |
| Option C — canonical geographic areas พร้อมความสัมพันธ์ explicit กับ Hospital | มี identity/รหัสพื้นที่จากแหล่งภูมิศาสตร์ และเชื่อมกับ Hospital อย่างชัดเจน | เหมาะเมื่อโจทย์คือพื้นที่บริการ/ภูมิศาสตร์ที่ต้องเทียบข้าม Hospital | ต้องกำหนด authoritative registry, versioning, overlapping coverage, transfer, correction, effective dates, seed/backfill และ privacy/report scope; ไม่ให้สิทธิ์ Patient โดยตัวมันเอง | ไม่ควรเริ่มจนยืนยันโจทย์ภูมิศาสตร์และ source of truth |
| Option D — operational assignments แยกสัญญา authorization | สร้าง assignment ระหว่าง staff/OSM กับ area/work item พร้อม actor, lifecycle, scope และ audit; policy แต่ละ resource แยกชัด | สะท้อนงานที่มีผู้รับผิดชอบและ revoke ได้; แยก worklist จาก access ได้ | เป็น domain เพิ่ม; ต้องกำหนด target ของ assignment และ worklist; Patient assignment ที่เป็น clinical access ต้องอยู่กับ policy exact relationship เดิมหรือได้รับอนุมัติแยก | ใช้ร่วมกับ B ได้ หาก work assignment ไม่กลายเป็น clinical grant; อย่ารวมเป็นตาราง/สิทธิ์เดียวโดยไม่ตัดสิน |
| Option E — เลื่อน Area จน taxonomy/workflow ชัด | คง schema และ behavior ปัจจุบัน; เก็บคำถามเปิดไว้ใน Owner pack | ลดความเสี่ยงสร้าง entity ผิดและ migration ซ้ำ; รักษาสิทธิ์เดิม | ไม่ได้ส่งมอบ Area UI ใน 17K.1; อาจต้องทบทวนลำดับงานเมื่อ Owner ระบุ use case | **RECOMMENDATION — NOT OWNER APPROVED:** ทางเลือกที่ปลอดภัยที่สุดสำหรับ 17K.1 จน K-Q01–K-Q18 ปิด |

Option A อยู่ร่วมกับ B หรือ D ได้ หาก hierarchy ทำหน้าที่จัดโครงสร้างองค์กรเท่านั้น. B กับ D ใช้ร่วมกันได้เมื่อ Area เป็นกลุ่ม/ปลายทางงาน และ assignment เป็นความสัมพันธ์มี lifecycle. C อาจเชื่อมกับ B/D ในอนาคต แต่ identity ภูมิศาสตร์กับกลุ่มงานยังต้องแยก. Option E เป็นการเลื่อนการสร้าง model ไม่ได้ลบความสามารถ hierarchy ที่มีอยู่. ทุกแบบต้องคง Patient authorization ตาม exact relationship/assignment ปัจจุบัน เว้นแต่มีการตัดสินและออกแบบ security contract ใหม่โดยชัดแจ้ง

## 9. Hospital hierarchy และสถานการณ์ authorization

Default ที่เสนอคือคง policy ปัจจุบัน: direct active Hospital membership สำหรับ Hospital workforce/patient scope และ exact PatientOsmAssignment สำหรับ OSM; parentHospitalId ไม่เปลี่ยนและไม่ให้สิทธิ์เพิ่ม

| สถานการณ์ | หลักฐาน/behavior ปัจจุบัน | ความเสี่ยงหากขยายโดย Area/hierarchy | ข้อเสนอ |
| --- | --- | --- | --- |
| MAIN กับ SUB Hospital | parentHospitalId เป็น optional self-reference; ไม่มี runtime authorization inheritance ที่พบ | MAIN owner อาจเห็น/เปลี่ยนข้อมูล SUB โดยไม่มี direct membership | รักษา exact Hospital scope; ถ้าต้องการ delegation ให้เป็น policy decision แยก |
| Parent กับ child | parent/child เป็นข้อมูล Master; patient-directory และ owner policy ตรวจ Hospital เป้าหมายโดยตรง | ความสัมพันธ์องค์กรอาจถูกเข้าใจผิดเป็นการมอบอำนาจ | ไม่อนุมาน read/write/owner authority จาก parent link |
| Sibling Hospitals | ไม่พบ policy ให้ sibling access | Area รวม sibling อาจกลายเป็น implicit cross-Hospital scope | Deny หาก actor ไม่มี direct scope/assignment ที่ policy ต้องการ |
| Independent Hospitals | scope แยกตาม Hospital relationship | ใช้ชื่อ Area เดียวกันอาจถูกรวมผิดหรือเปิดรายงานข้ามแห่ง | ID และ query ต้องผูก exact Hospital หรือผ่าน approved explicit relationship |
| Staff ที่เป็นสมาชิกหลาย Hospital | User/Person identity ใช้ซ้ำ; HospitalMembership แยกต่อ Hospital; projection จำกัดเฉพาะ Hospital ที่ขอ | การแก้ Person/global field ผ่าน Owner แห่งหนึ่งกระทบสมาชิกภาพ/ข้อมูลอีกแห่ง | เปลี่ยนเฉพาะ HospitalMembership ปัจจุบัน; global identity editing แยกและยังไม่ให้ Owner |
| OSM มีหลาย OsmHospitalRelationship | OSM role เป็น role ระดับ User; relationship และ status แยกต่อ Hospital | Suspend หนึ่ง association อาจถูกตีความเป็นปิดบัญชี OSM ทุกแห่ง | เปลี่ยนเฉพาะ association เป้าหมาย; ห้ามเปลี่ยน User.status/Role.OSM |
| Patient อยู่หลาย Hospital | PatientProfile เป็น identity; PatientHospitalRelationship เชื่อม Patient กับ Hospital แบบแยก | Area/shared report อาจเผยข้อมูลจาก relationship อื่น | ทุก query/mutation ใช้ Hospital relationship ที่ actor มีสิทธิ์; ไม่เปิด sibling/parent relationship |
| OSM assigned ให้ Patient ข้าม Hospital | PatientOsmAssignment ชี้ relationship เฉพาะ; policy ต้อง OSM relationship ใน Hospital เดียวกัน | Area assignment อาจข้าม Hospital และใช้แทน assignment | คง same-Hospital exact assignment; cross-Hospital case ต้อง policy/approval/test ใหม่ |
| ย้าย Area ระหว่าง Hospital | ไม่มี Area domain ปัจจุบัน | ย้าย metadata แล้วอาจเปลี่ยน worklist/report/access โดยไม่ตั้งใจ | ยังไม่มี transfer behavior; หากอนุมัติ ต้องระบุ source/target, authorization, transaction, history และผลต่อ assignment |
| เปลี่ยนชื่อ Area | ไม่มี Area domain ปัจจุบัน | report เก่าอาจถูกจัดกลุ่มใหม่ถ้า join ชื่อปัจจุบัน | หากสร้างภายหลังใช้ stable ID; บันทึก audit; ตัดสินว่า report historical ใช้ชื่อ ณ เวลานั้นหรือชื่อปัจจุบัน |
| เกษียณ/retire หรือ restore Area | ไม่มี lifecycle model | การลบ/restore อาจทำให้ assignment หายหรือกลับมาให้สิทธิ์โดยไม่ตั้งใจ | ต้อง soft-retire/restore semantics, active assignments และ audit ที่กำหนดก่อน persistence |
| Reassign สมาชิกหรือ Area | ปัจจุบัน staff/OSM/Patient มี lifecycle แยก ไม่ผูก Area | การแทนผู้รับอาจลบประวัติหรือสร้างสิทธิ์ซ้ำ | ใช้ explicit end/create records หรือ transition ที่อนุมัติ; ไม่แก้ clinical history |
| Hospital suspension | Platform ADMIN ระงับ Hospital ผ่าน governance policy/service; Owner action ใน Hospital ที่ไม่ active ไม่ควรผ่าน | Area ที่คงอยู่ระหว่าง suspension อาจถูกเข้าใจว่าเปิดสิทธิ์ | คง Hospital status เป็น authoritative gate ตามปัจจุบัน; Area ไม่ override |
| Workforce membership suspension | Owner suspend exact MEMBER; กระทบ membership นี้ ไม่ใช่ User global | area membership อาจยังคงค้างและทำให้ UI เหมือนมอบหมายงาน | หากมี Area membership ต้องแสดงผล/cleanup policy; ห้ามคง authority จาก membership ที่ถูกระงับ |
| OSM relationship suspension | ปัจจุบัน Owner operation conflict หากยังมี assignment active | แยก status กับ assignment อาจปล่อย stale worklist/access | รักษา guard เดิม; ต้องระบุ revocation/unassignment workflow ก่อนเปลี่ยน behavior |
| ลบ operational Area | ยังไม่มี entity | hard-delete อาจทำให้สูญเสียประวัติหรือ orphan assignment | เสนอ retirement + audit หลังตัดสิน; hard-delete ไม่ควรลบ clinical/assignment history |
| Governance mutation ที่ stale พร้อมกัน | service บาง operation ใช้ expectedUpdatedAt และ serializable transaction; policy rechecks owner/hospital | สอง Owner อาจย้าย/ถอนสมาชิกซ้ำ หรือเหลือ Owner ไม่ครบ | คง stale guard, DB constraints/transaction ตาม invariant; ออกแบบ concurrency tests สำหรับทุก mutation ใหม่ |

การขยายสิทธิ์จาก hierarchy, Area, geography หรือ operational assignment เป็นการตัดสินแยก ต้องมี Owner approval, policy contract ที่ระบุ resource/action/scope/revocation, และ security tests ทั้ง allow และ deny. ไม่มีการเปลี่ยน parentHospitalId หรือกำหนดความหมายใหม่ในเอกสารนี้

## 10. Proposed MVP และทางเลือกที่ไม่เลือกในขณะนี้

**RECOMMENDATION — NOT OWNER APPROVED:** ให้ first implementation slice หลังปิด requirement เริ่มจากส่วนที่ Owner ตัดสินและมี technical contract แล้วเท่านั้น โดยค่าเริ่มต้นเสนอว่า:

1. Hospital Owner จัดการเฉพาะ Hospital ที่มี direct active OWNER membership และ Hospital ยัง active
2. คง workforce capability ที่มีอยู่; เพิ่ม field edit เฉพาะรายการที่ Owner ระบุและมี canonical owner/validation/audit contract
3. หากนิยาม Area เป็นกลุ่มงาน ให้เริ่มเป็น operational grouping ภายใน Hospital และไม่มีผลเป็น authorization grant
4. Patient access ยังคงใช้ direct Hospital scope และ exact PatientOsmAssignment ตาม policy ที่มี
5. ไม่เปิด hierarchy inheritance; ไม่แชร์ Area ข้าม Hospital ใน slice แรก
6. ไม่เพิ่ม generic Person/User editing, Patient reassignment หรือการย้าย Patient/OSM ข้าม Hospital
7. ไม่เขียนทับ clinical history; reporting ใช้ query/projection ที่ประกาศ Hospital scope และช่วงเวลาชัด
8. หาก Owner ยังไม่ยืนยัน taxonomy, workflow และ data owner ให้เลื่อน Area persistence; สามารถทำ approved OWNER governance work แยกได้หากไม่ต้องพึ่ง Area

เหตุผล: ข้อเสนอนี้สอดคล้องกับ boundary ที่มีจริงในโค้ด และหลีกเลี่ยงการให้ Area หรือ hierarchy กลายเป็นสิทธิ์โดยปริยาย แต่ไม่อาจสรุปว่าครอบคลุม customer workflow จน Owner เลือก use case จริง

### ทางเลือกที่ปฏิเสธชั่วคราว

| ทางเลือก | เหตุผลที่ไม่แนะนำในขณะนี้ | เงื่อนไขที่ทำให้พิจารณาใหม่ |
| --- | --- | --- |
| ให้ parent Hospital สืบทอดสิทธิ์ child | ไม่มี accepted policy; เสี่ยงขยาย access ของ Owner/staff/OSM และข้อมูล Patient โดยไม่ตั้งใจ | Owner ระบุ delegation/action/resource/scope/revocation ชัด พร้อม threat review และ security tests |
| ใช้ Area membership เป็น Patient authorization | ปะปน operational assignment กับ clinical access และไม่รักษา exact Patient relationship boundary | เฉพาะ decision ใหม่ที่ระบุ resource, consent, assignment, revocation, audit และ migration แล้ว; ต้องมี ADR หากเปลี่ยน accepted architecture |
| ใช้ geography เป็น operational Area โดยตรง | taxonomy, source, versioning, overlapping coverage และ effective date ยังไม่ชัด | Owner ระบุแหล่งข้อมูล/เจ้าของ/การเปลี่ยนเขตและ customer workflow ที่ต้องใช้ |
| ให้ Owner แก้ global Person/User fields | คนหนึ่งมีหลาย Hospital/role; เปลี่ยนแห่งเดียวอาจกระทบทุกแห่งและ authentication | field-by-field decision, canonical source, correction/verification flow, cross-Hospital notice, authorization และ audit |
| ย้าย/ลบ assignment เมื่อ Area เปลี่ยน | ไม่มี requirement ว่า Area เป็นเจ้าของ Patient assignment; ทำลายประวัติหรือเปลี่ยน authority | explicit migration/transfer contract, transaction, concurrency and audit design, backfill policy |
| สร้าง Area CRUD ก่อนปิดความหมาย | schema จะผูก business definition ที่ยังไม่ผ่าน Owner และสร้าง migration cost | ปิด K-Q01–K-Q17 และผ่าน 17K.0B ก่อน domain implementation |

## 11. Owner decision questions

ทุกข้อด้านล่างมีสถานะ **OPEN / NOT OWNER APPROVED**. ข้อเสนอเป็นเพียง **RECOMMENDATION — NOT OWNER APPROVED**. Owner ตอบเป็น option หรือแก้คำตอบได้; หลังตอบต้องบันทึกผลและ scope ใน 17K.0B ก่อนออก implementation contract

### K-Q01 — “เขตความรับผิดชอบ” หมายถึงอะไรในงานจริง?

- **ข้อกำหนดที่ต้องปิด:** ระบุปัญหา/งานที่คำนี้ต้องแก้ และแยก geography, Hospital hierarchy, operational grouping, workforce assignment, patient assignment, authorization และ reporting
- **ตัวเลือก:** A) โครงสร้าง Hospital; B) พื้นที่ภูมิศาสตร์; C) กลุ่มปฏิบัติการภายใน Hospital; D) งาน/ผู้รับผิดชอบ; E) หลายความหมายซึ่งใช้ domain แยกกัน; F) ยังไม่ต้องมี Area
- **RECOMMENDATION — NOT OWNER APPROVED:** เลือกความหมายหลักเพียงหนึ่งหรือแยกหลาย use case เป็น domain คนละชุด; หากยังไม่ชัดให้ E พร้อมเลื่อน persistence
- **เหตุผล/ข้อแลกเปลี่ยน:** ลดการผูก entity เดียวเข้ากับหลาย lifecycle; อาจต้องจัดทำหลาย slice เมื่อ use case ต่างกัน
- **ผล security/data:** หากเลือก authorization หรือ patient assignment ต้องมี policy contract; ห้ามถือว่า operational grouping ให้สิทธิ์คลินิก
- **dependency:** เป็น prerequisite ของ K-Q02–K-Q18, model/schema และ 17K.1
- **สถานะ:** OPEN / NOT OWNER APPROVED

### K-Q02 — taxonomy และชื่อ canonical ของ Area คืออะไร?

- **ข้อกำหนดที่ต้องปิด:** กำหนดชนิด/ระดับ/รหัส/ชื่อ และกติกา uniqueness
- **ตัวเลือก:** A) ใช้รหัสภูมิศาสตร์มาตรฐาน; B) ชื่อกลุ่มงานที่ Hospital ตั้งเอง; C) แบ่ง taxonomy หลายชนิดพร้อม namespace; D) ไม่สร้าง Area ตอนนี้
- **RECOMMENDATION — NOT OWNER APPROVED:** ถ้าเป็นกลุ่มงาน ให้ใช้ Hospital-local stable ID และ label ที่แก้ชื่อได้; ถ้าเป็น geography ให้แยก canonical registry และ version
- **เหตุผล/ข้อแลกเปลี่ยน:** stable ID ป้องกัน rename ทำลายประวัติ; taxonomy แยกชนิดเพิ่ม model แต่ลดความหมายกำกวม
- **ผล security/data:** ชื่อซ้ำไม่ควรทำให้ record ข้าม Hospital ถูกรวม; ห้ามใช้ label เป็น authorization key
- **dependency:** K-Q01, source of truth, unique constraints และ reporting
- **สถานะ:** OPEN / NOT OWNER APPROVED

### K-Q03 — ใครเป็น source of truth และใครรับผิดชอบความถูกต้องของนิยาม?

- **ข้อกำหนดที่ต้องปิด:** ระบุเจ้าของข้อมูล/ผู้ตรวจและทางแก้ข้อมูลผิด
- **ตัวเลือก:** A) Hospital Owner สำหรับกลุ่มงาน; B) หน่วยงานกลาง/ทะเบียนทางการสำหรับ geography; C) Platform ADMIN สำหรับ Hospital Master; D) แยกตาม Area type; E) ยังไม่กำหนด
- **RECOMMENDATION — NOT OWNER APPROVED:** source of truth ต้องตรงกับชนิดที่เลือกใน K-Q01; แยกผู้อนุมัติ/ผู้แก้จากผู้ใช้รายงานหากจำเป็น
- **เหตุผล/ข้อแลกเปลี่ยน:** ลดค่าซ้ำที่ขัดกัน; source ภายนอกอาจเพิ่มรอบ sync และการจัดการ version
- **ผล security/data:** ห้าม Owner แก้ canonical geography หรือ Hospital Master โดยอาศัยสิทธิ์จัดการทีม
- **dependency:** K-Q01–Q02; validation, import, audit, correction และ migration design
- **สถานะ:** OPEN / NOT OWNER APPROVED

### K-Q04 — Area เป็น Hospital-local หรือ global?

- **ข้อกำหนดที่ต้องปิด:** ระบุขอบเขต identity และการใช้ซ้ำระหว่าง Hospital
- **ตัวเลือก:** A) Hospital-local เท่านั้น; B) global canonical geography ที่เชื่อม Hospital อย่าง explicit; C) มีทั้งสองประเภทแต่คนละ model; D) defer
- **RECOMMENDATION — NOT OWNER APPROVED:** หาก first use case เป็นกลุ่มงาน ให้ Hospital-local; global ใช้เฉพาะ geographic entity ที่มี canonical source และความต้องการเชื่อมชัด
- **เหตุผล/ข้อแลกเปลี่ยน:** local ง่ายและกั้นข้อมูล; global ช่วยเทียบข้ามแห่งแต่ต้องจัดการ governance/version
- **ผล security/data:** การใช้ label/ID ร่วมกันห้ามสร้าง cross-Hospital access หรือรายงานโดยปริยาย
- **dependency:** K-Q01–Q03; schema key, unique constraint, query scope และ transfer
- **สถานะ:** OPEN / NOT OWNER APPROVED

### K-Q05 — Area หนึ่งสัมพันธ์กับ Hospital ได้กี่แห่ง?

- **ข้อกำหนดที่ต้องปิด:** กำหนด cardinality และการจัดการ Area ที่ครอบคลุม/ใช้ซ้ำหลายแห่ง
- **ตัวเลือก:** A) หนึ่ง Area ต่อหนึ่ง Hospital; B) global Area เชื่อมหลาย Hospital ด้วย relation explicit; C) แยก Area local กับ geography global; D) ไม่มี Area
- **RECOMMENDATION — NOT OWNER APPROVED:** ใช้ A สำหรับ operational grouping; ใช้ C หากต้องการ geography; หลีกเลี่ยงแชร์ identity/permission ใน MVP
- **เหตุผล/ข้อแลกเปลี่ยน:** one-to-many local ลดความกำกวม; explicit many-to-many รองรับพื้นที่ทับซ้อนแต่ซับซ้อนเรื่อง owner/reporting
- **ผล security/data:** relation กับ Hospital ต้องเป็น data link เท่านั้น เว้นแต่ policy ระบุ scope; ห้ามรวมข้อมูลข้ามแห่งเพราะใช้ Area เดียวกัน
- **dependency:** K-Q01, Q04, Q06–Q07; relational constraints และ authorization query
- **สถานะ:** OPEN / NOT OWNER APPROVED

### K-Q06 — MAIN/SUB และ parent/child Hospital เกี่ยวข้องกับ Area อย่างไร?

- **ข้อกำหนดที่ต้องปิด:** ระบุว่า Area เป็นของ parent, child, ทั้งคู่ หรือข้อมูลแยกอิสระ
- **ตัวเลือก:** A) แต่ละ Hospital กำหนดของตนเอง; B) parent กำหนดและ child อ้างอิง; C) explicit link หลายแห่ง; D) hierarchy ใช้แสดงโครงสร้างเท่านั้น; E) defer
- **RECOMMENDATION — NOT OWNER APPROVED:** D ร่วมกับ A สำหรับ operational grouping จนมี workflow ที่ยืนยันการ share
- **เหตุผล/ข้อแลกเปลี่ยน:** รักษาขอบเขตที่ระบบใช้อยู่; independent configuration อาจซ้ำคำจำกัดความ แต่ลด coupled lifecycle
- **ผล security/data:** parent-child link ไม่ให้สิทธิ์แก้/อ่าน Area หรือ Patient ของอีก Hospital
- **dependency:** K-Q04–Q05 และ K-Q07; ห้ามแก้ parentHospitalId ใน slice นี้
- **สถานะ:** OPEN / NOT OWNER APPROVED

### K-Q07 — Area สืบทอด/เข้าถึงข้าม hierarchy หรือสมาชิกต้องถูกกำหนดแยก?

- **ข้อกำหนดที่ต้องปิด:** กำหนด inheritance สำหรับ Area definition, staff/OSM assignment, report และ authorization แยกกัน
- **ตัวเลือก:** A) ไม่มี inheritance; B) inherit display/grouping only; C) inherit membership/work allocation; D) inherit authorization; E) กำหนดแยกตาม relation แต่ละชนิด
- **RECOMMENDATION — NOT OWNER APPROVED:** A ใน first slice; หากอนุมัติอนาคตให้ E พร้อม policy แยก
- **เหตุผล/ข้อแลกเปลี่ยน:** ไม่ขยาย scope; งานซ้ำอาจเพิ่มแต่สิทธิ์และเจ้าของข้อมูลชัด
- **ผล security/data:** D เป็นการเปลี่ยน authority ต้อง Owner approve, ADR หากกระทบ architecture และ allow/deny/revocation tests
- **dependency:** Q01, Q04–Q06; policy contract, query scopes, migration และ tests
- **สถานะ:** OPEN / NOT OWNER APPROVED

### K-Q08 — ใครสร้าง แก้ชื่อ/รายละเอียด ระงับ/retire และ restore Area ได้?

- **ข้อกำหนดที่ต้องปิด:** ระบุ actor ต่อ lifecycle action และแยก canonical Area จาก local grouping
- **ตัวเลือก:** A) exact Hospital Owner; B) Hospital admin ที่กำหนดใหม่; C) Platform ADMIN; D) authoritative registry owner; E) แยกตาม Area type; F) defer
- **RECOMMENDATION — NOT OWNER APPROVED:** สำหรับ local operational grouping ให้ exact active Hospital Owner เท่านั้น; ไม่เพิ่ม role ใหม่; geography ให้เจ้าของ source เป็นผู้จัดการ
- **เหตุผล/ข้อแลกเปลี่ยน:** reuse capability boundary; อาจต้องมี workflow กลางเมื่อหลาย Hospital ใช้ข้อมูล canonical เดียวกัน
- **ผล security/data:** server policy fail-closed, exact scope, stale-write check, audit; suspend Hospital ต้อง block management
- **dependency:** Q01–Q04, Q06–Q07; service/policy/UI และ concurrency tests
- **สถานะ:** OPEN / NOT OWNER APPROVED

### K-Q09 — บุคลากรหนึ่งคนอยู่ได้หลาย Area หรือไม่?

- **ข้อกำหนดที่ต้องปิด:** กำหนด cardinality, role, effective date และผลต่อ membership ของ staff
- **ตัวเลือก:** A) ไม่เกินหนึ่ง Area ต่อ Hospital; B) หลาย Area ต่อ Hospital; C) optional ไม่มี Area; D) ยังไม่ทำ staff-area relation
- **RECOMMENDATION — NOT OWNER APPROVED:** C และเลื่อน assignment จนมี workflow; หากยืนยัน operational use ให้ B ได้เฉพาะเมื่อรองรับหลายทีมจริง
- **เหตุผล/ข้อแลกเปลี่ยน:** หลาย Area สอดคล้องงานจริงที่ทับซ้อนแต่เพิ่มการจัดการและ worklist; หนึ่ง Area จำกัดการทำงาน
- **ผล security/data:** membership Area ไม่เปลี่ยน HospitalMembership และไม่ grant Patient access
- **dependency:** Q01, Q04, Q08; membership model, uniqueness, audit และ lifecycle reconciliation
- **สถานะ:** OPEN / NOT OWNER APPROVED

### K-Q10 — OSM หนึ่งคนอยู่ได้หลาย Area หรือไม่?

- **ข้อกำหนดที่ต้องปิด:** กำหนด cardinality ภายใน Hospital และความสัมพันธ์กับ OsmHospitalRelationship
- **ตัวเลือก:** A) ไม่เกินหนึ่ง Area; B) หลาย Area; C) optional; D) ไม่ทำจนกำหนดงาน OSM
- **RECOMMENDATION — NOT OWNER APPROVED:** D; ถ้าต้องมี Area membership ให้เป็น relation แยกจาก OsmHospitalRelationship และ PatientOsmAssignment
- **เหตุผล/ข้อแลกเปลี่ยน:** OSM-Hospital คือ association ปัจจุบัน; Area membership เป็นงานอีกชั้นหนึ่ง
- **ผล security/data:** suspend OSM relationship ต้องไม่ถูกลบ/คืนสิทธิ์โดย Area; Area assignment ไม่อนุญาตให้อ่าน Patient
- **dependency:** Q01, Q04, Q07–Q09, Q13–Q15; test revocation และ same-Hospital boundary
- **สถานะ:** OPEN / NOT OWNER APPROVED

### K-Q11 — Patient มี direct Area membership หรือไม่?

- **ข้อกำหนดที่ต้องปิด:** ระบุว่า Area ใช้จัดกลุ่ม Patient โดยตรงหรือ derive จาก geography/assignment/report
- **ตัวเลือก:** A) ไม่มี Patient-Area relation; B) PatientHospitalRelationship มี Area-local grouping; C) Patient ผูก geography canonical; D) relation หลายชนิดแยกกัน; E) defer
- **RECOMMENDATION — NOT OWNER APPROVED:** E; ไม่สร้าง patient-area relation จนมี use case, owner, lifecycle และ historical semantics
- **เหตุผล/ข้อแลกเปลี่ยน:** การไม่มี relation เลื่อน worklist/report use case; การเพิ่ม relation เสี่ยง duplicate/misaligned กับ PatientHospitalRelationship
- **ผล security/data:** relation ไม่ย้าย Patient และไม่ให้สิทธิ์ Patient แก่ OSM/staff; clinical history คงเดิม
- **dependency:** Q01–Q05, Q12–Q17; schema, assignment policy และ backfill contract
- **สถานะ:** OPEN / NOT OWNER APPROVED

### K-Q12 — การกำหนด/เปลี่ยน Area เปลี่ยน Patient authority หรือไม่?

- **ข้อกำหนดที่ต้องปิด:** ระบุผลต่อ Patient read, update, assignment และ deactivation
- **ตัวเลือก:** A) ไม่มีผล; B) ใช้กรองงานเท่านั้น; C) เพิ่ม Patient read; D) เพิ่ม read/update/assignment; E) ตัดสินแยกตาม action
- **RECOMMENDATION — NOT OWNER APPROVED:** A/B เท่านั้นสำหรับ operational grouping; C/D ต้องเป็น decision และ security contract แยก
- **เหตุผล/ข้อแลกเปลี่ยน:** separation of duties ชัด; user อาจต้องทำ assignment เพิ่มอีกขั้น
- **ผล security/data:** ห้าม Area grant แทน exact PatientOsmAssignment; การถอน Area ห้าม revoke/restore clinical assignments โดยปริยาย
- **dependency:** เป็น blocker ต่อ policy implementation; ต้องมี threat model, unit/PG allow-deny tests และ audit semantics ก่อนพิจารณา C/D
- **สถานะ:** OPEN / NOT OWNER APPROVED

### K-Q13 — Area assignment มีผลต่อ OSM worklist อย่างไร?

- **ข้อกำหนดที่ต้องปิด:** ระบุรายการงานที่ OSM เห็น, ผู้สร้าง/ผู้ปิดงาน และความสัมพันธ์กับ PatientOsmAssignment
- **ตัวเลือก:** A) ไม่เปลี่ยน worklist; B) แบ่งกลุ่มงานโดยไม่เปลี่ยนผู้ป่วยที่อ่านได้; C) Area assignment เพิ่ม work item แต่ Patient access ยังคง exact assignment; D) ใช้แทน PatientOsmAssignment
- **RECOMMENDATION — NOT OWNER APPROVED:** B หรือ C หลังระบุ workflow; ปฏิเสธ D สำหรับ first slice
- **เหตุผล/ข้อแลกเปลี่ยน:** grouping ช่วยงานประจำวันแต่ต้องไม่สับสนกับการมอบหมาย clinical responsibility
- **ผล security/data:** worklist filter ไม่ใช่ authorization; API/query ต้องยังใช้ patient policy และ exact relation
- **dependency:** Q01, Q09–Q12, Q15; worklist contract, indexing/query scope และ integration tests
- **สถานะ:** OPEN / NOT OWNER APPROVED

### K-Q14 — การแชร์/โอน Area ข้าม Hospital มี semantics อย่างไร?

- **ข้อกำหนดที่ต้องปิด:** ระบุว่าการโอนเป็นการย้าย ownership, link เพิ่ม, copy, หรือไม่รองรับ
- **ตัวเลือก:** A) ไม่มี cross-Hospital use; B) explicit shared geographic reference; C) transfer ที่ปิด source membership และสร้าง target relation; D) copy definition; E) ยังไม่ตัดสิน
- **RECOMMENDATION — NOT OWNER APPROVED:** A สำหรับ MVP; ภูมิศาสตร์ shared ใช้ canonical reference อย่าง explicit โดยไม่แชร์ operational membership
- **เหตุผล/ข้อแลกเปลี่ยน:** เลี่ยง side effects ข้าม tenant; transfer อาจต้อง coordination ระหว่าง Owner สองแห่ง
- **ผล security/data:** ห้ามข้าม Hospital scope; transfer ต้องตรวจ actor ฝั่งต้นทาง/ปลายทาง, relation ที่ได้รับผล, stale version, audit และ transaction semantics
- **dependency:** Q04–Q08, Q15–Q17; หากเลือก C ต้องมี transfer protocol/migration plan และ concurrency tests
- **สถานะ:** OPEN / NOT OWNER APPROVED

### K-Q15 — เมื่อถอน/ย้าย Area membership ต้อง revoke อะไร และคง assignment เดิมอย่างไร?

- **ข้อกำหนดที่ต้องปิด:** ระบุการสิ้นสุด assignment, PatientOsmAssignment, task, report snapshot และประวัติ
- **ตัวเลือก:** A) ถอนเฉพาะ operational membership; B) จบ/มอบหมายใหม่ explicit; C) cascade clinical assignments; D) ห้ามมี relation ที่ต้อง cascade; E) ตัดสินแยกตาม relation
- **RECOMMENDATION — NOT OWNER APPROVED:** E โดย Area change ไม่ cascade ไป PatientOsmAssignment; clinical reassignment ใช้ existing explicit service
- **เหตุผล/ข้อแลกเปลี่ยน:** ต้องมีขั้นตอน handoff เพิ่มเพื่อไม่ทิ้งงานค้าง; เก็บประวัติการทำงานไว้
- **ผล security/data:** revoke ต้องทันทีตาม relation ที่ยกเลิก; ห้ามเปิด access กลับโดย restore Area; ห้าม rewrite historical clinical records
- **dependency:** Q09–Q14, lifecycle model, transaction/audit plan และ integration tests สำหรับ revoke
- **สถานะ:** OPEN / NOT OWNER APPROVED

### K-Q16 — Area lifecycle และ audit ต้องเก็บอะไรบ้าง?

- **ข้อกำหนดที่ต้องปิด:** กำหนด create/update/rename/retire/restore, actor, เวลา, version และผลต่อ active relations
- **ตัวเลือก:** A) audit field changes และ lifecycle; B) audit เฉพาะ create/retire; C) immutable versioned definitions; D) ยังไม่สร้าง Area
- **RECOMMENDATION — NOT OWNER APPROVED:** หากมี persistence ให้บันทึก actor/action/Area/Hospital/old-new non-sensitive state/time และใช้ soft retirement; ห้าม hard-delete history
- **เหตุผล/ข้อแลกเปลี่ยน:** audit ครบช่วยตรวจสอบแต่เพิ่มข้อมูล/retention obligations; immutable versions ช่วยรายงานย้อนหลังแต่ซับซ้อนกว่า
- **ผล security/data:** audit อยู่ใน consistency boundary ของ mutation; ไม่บันทึก National ID/credentials/secrets; stale concurrent writes ต้อง fail closed
- **dependency:** Q02–Q08, Q14–Q15; schema, transaction, audit infrastructure, retention policy และ concurrency tests
- **สถานะ:** OPEN / NOT OWNER APPROVED

### K-Q17 — รายงานย้อนหลังต้องตีความ Area อย่างไร?

- **ข้อกำหนดที่ต้องปิด:** เลือก “as-of event”, “as-of current definition”, หรือไม่ต้องมี Area historical report; ระบุ scope, aggregation, privacy
- **ตัวเลือก:** A) ไม่ทำรายงาน Area ใน 17K; B) operational report ใช้ membership ปัจจุบัน; C) เก็บ historical snapshot/effective-date; D) geography version ตามวันที่
- **RECOMMENDATION — NOT OWNER APPROVED:** A สำหรับ 17K.1; เริ่ม report ภายหลังเมื่อ definition, audience, data scope, retention และ historical semantics ชัด
- **เหตุผล/ข้อแลกเปลี่ยน:** เลื่อนความสะดวกของ dashboard แต่หลีกเลี่ยงผลรวมผิด/ย้อนหลังเปลี่ยนตาม rename
- **ผล security/data:** report permission แยกจาก membership; aggregation ต้อง exact Hospital; ไม่เผย Patient cross-Hospital
- **dependency:** Q01–Q05, Q14–Q16; reporting contract and test data; RPT-02 remains separately gated
- **สถานะ:** OPEN / NOT OWNER APPROVED

### K-Q18 — Hospital Owner แก้ workforce fields ใดได้บ้าง?

- **ข้อกำหนดที่ต้องปิด:** ตัดสิน field-by-field สำหรับชื่อ, profession, เบอร์/อีเมลส่วนบุคคล, วันเกิด, specialty/license, Hospital/Area assignment, membership, account status และ credentials
- **ตัวเลือก:** A) คงปัจจุบัน: profession + relationship lifecycle + promotion/demotion; B) เพิ่มเฉพาะ Hospital-local fields ที่ Owner ระบุ; C) ให้แก้ generic profile; D) แยก capability ต่อ field
- **RECOMMENDATION — NOT OWNER APPROVED:** A เป็น baseline; หากเพิ่ม ให้ B/D พร้อมรายการ field exact และไม่รวม Person/User global fields โดยอนุมาน
- **เหตุผล/ข้อแลกเปลี่ยน:** field-level scope จำกัด cross-Hospital effects; อาจต้องแยกข้อมูลติดต่อส่วนบุคคลออกจาก HospitalContact
- **ผล security/data:** national ID, credentials, global account status, Patient data และ another Hospital relationship ไม่แก้โดย Owner; audit และ validation ต้องระบุราย field
- **dependency:** Q19–Q20, canonical ownership, UI/service/policy contract และ tests; OWNER-01 blocker
- **สถานะ:** OPEN / NOT OWNER APPROVED

### K-Q19 — ใครเป็นเจ้าของ ตรวจสอบ และแก้ข้อมูลของแต่ละ field?

- **ข้อกำหนดที่ต้องปิด:** ระบุ source of truth และผู้ยืนยัน/correct field ต่อ field รวมข้อมูลที่ OSM/บุคลากรป้อนเอง
- **ตัวเลือก:** A) บุคคลเจ้าของ profile; B) Hospital Owner สำหรับ local employment/profession; C) HR/หน่วยงานกลาง; D) field-specific ownership; E) ยังไม่อนุมัติ edit
- **RECOMMENDATION — NOT OWNER APPROVED:** D; Person identity/contact ให้เจ้าของ profile หรือ verification flow; profession/relationship อยู่ Hospital-local; HospitalContact คงสัญญา 17I
- **เหตุผล/ข้อแลกเปลี่ยน:** ลดข้อมูลซ้ำขัดแย้ง; field-specific flow เพิ่มงานกำหนด governance
- **ผล security/data:** cross-Hospital impact ระบุทุกครั้ง; ห้าม audit raw national ID หรือ secret; correction ต้องติดตาม actor/time/evidence ตามข้อมูลอ่อนไหว
- **dependency:** Q18 และ data inventory; validation schema, policy, audit/consent, user communication
- **สถานะ:** OPEN / NOT OWNER APPROVED

### K-Q20 — จัดการข้อมูลขัดกันเมื่อคนเดียวมีหลาย Hospital membership อย่างไร?

- **ข้อกำหนดที่ต้องปิด:** ระบุ field ที่ global/local, ลำดับการแก้, แจ้งผู้ได้รับผล และ conflict resolution
- **ตัวเลือก:** A) เก็บ global Person fields ชุดเดียว; B) Hospital-local profile แยก; C) authoritative global plus local override; D) field-by-field; E) ยังไม่เปิด profile edit
- **RECOMMENDATION — NOT OWNER APPROVED:** D; ห้าม Owner แห่งหนึ่งเปลี่ยนค่าที่อีก Hospital ใช้โดยไม่ประกาศผลและมี authorization contract
- **เหตุผล/ข้อแลกเปลี่ยน:** local copies ลดการกระทบข้ามแห่งแต่เสี่ยง drift; global source ลดซ้ำแต่ต้อง governance
- **ผล security/data:** actor ใน Hospital A ไม่มีสิทธิ์แก้ data ของ Hospital B; การเปลี่ยน Person กระทบทุก role/Hospital ต้องผ่าน flow ที่แยกจาก workforce governance
- **dependency:** Q18–Q19; schema ownership, reconciliation, conflict UI, audit และ multi-Hospital integration tests
- **สถานะ:** OPEN / NOT OWNER APPROVED

### K-Q21 — Area management รวมอยู่ใน first implementation slice หรือไม่?

- **ข้อกำหนดที่ต้องปิด:** ระบุว่าหลัง 17K.0B จะ implement governance ก่อน, Area foundation ก่อน, ทั้งคู่ หรือเลื่อน Area
- **ตัวเลือก:** A) governance gap ที่อนุมัติเท่านั้น; B) Area foundation; C) Area CRUD/workflow; D) defer ทั้งหมด; E) แยก roadmap
- **RECOMMENDATION — NOT OWNER APPROVED:** E; ปล่อย 17K.1 เฉพาะ domain/persistence ที่ตัดสินครบ; Area UI/workflow รอ 17K.2 readiness
- **เหตุผล/ข้อแลกเปลี่ยน:** ทำ approved owner governance ได้เร็วขึ้นหากไม่ผูก Area; หลายสายงานอาจต้องจัด integration เพิ่ม
- **ผล security/data:** ไม่มี implementation จน decision ที่เกี่ยวข้องปิด; ห้าม placeholder Area permission/CRUD
- **dependency:** K-Q01–Q20 และการปิด 17K.0B; อนุมัติ slice-by-slice
- **สถานะ:** OPEN / NOT OWNER APPROVED

### K-Q22 — Hospital hierarchy ปัจจุบันเพียงพอสำหรับส่วนใดของ use case?

- **ข้อกำหนดที่ต้องปิด:** ระบุว่าลูกค้าต้องการดูโครงสร้างองค์กร, grouping, delegation, geography หรือ reporting แบบใด
- **ตัวเลือก:** A) hierarchy พอสำหรับการแสดงโครงสร้างเท่านั้น; B) ต้องมี operational Area; C) ต้องมี canonical geography; D) ต้องมี delegation policy แยก; E) use cases หลายแบบ
- **RECOMMENDATION — NOT OWNER APPROVED:** A เป็นความหมายปัจจุบัน; ถ้าโจทย์เกิน display ให้เลือก B/C/D แยก ไม่ขยาย parentHospitalId
- **เหตุผล/ข้อแลกเปลี่ยน:** ใช้ Master metadata ที่มีช่วยลด model; แต่อาจไม่รองรับ operation จริง
- **ผล security/data:** hierarchy ไม่ขยาย authority; การ delegation เป็น security-sensitive change ต้องผ่าน threat analysis/security tests
- **dependency:** customer flow evidence และ K-Q01, Q06–Q07; implementation dependency ตาม use case
- **สถานะ:** OPEN / NOT OWNER APPROVED

### K-Q23 — ต้อง migrate, seed หรือ backfill ข้อมูลเดิมหรือไม่?

- **ข้อกำหนดที่ต้องปิด:** ระบุ source, mapping, data quality, default, rollback และการยืนยันผลก่อน rollout
- **ตัวเลือก:** A) ไม่มี Area persistence/backfill ใน MVP; B) manual creation หลังเปิดใช้; C) seed จาก authoritative registry; D) backfill จาก address/legacy text; E) import/validated mapping
- **RECOMMENDATION — NOT OWNER APPROVED:** A จนมี taxonomy/source; ไม่ infer Area จากที่อยู่, parent link, legacy grouping หรือ assignment โดยอัตโนมัติ
- **เหตุผล/ข้อแลกเปลี่ยน:** ไม่มี backfill ลดความเสี่ยงข้อมูลผิด แต่ต้องสร้างข้อมูลใหม่ด้วยกระบวนการที่ยืนยัน
- **ผล security/data:** migration ต้อง idempotent, auditable, preserve clinical history, resolve duplicates and conflicts; production changes ผ่าน migration เท่านั้น
- **dependency:** Q01–Q05, Q14–Q17, data inventory; migration plan, dry-run/verification and PostgreSQL tests
- **สถานะ:** OPEN / NOT OWNER APPROVED

### K-Q24 — สิ่งใดถูกเลื่อนออกจาก Phase 17K อย่างชัดเจน?

- **ข้อกำหนดที่ต้องปิด:** ยืนยันขอบเขตที่ไม่ทำ เพื่อไม่ให้ approved decision ถูกตีความกว้าง
- **ตัวเลือก:** A) เลื่อน hierarchy inheritance, cross-Hospital Area, clinical access via Area, generic Person/User edit, Patient transfer, Area reporting และ Area backfill; B) เลือกบางรายการพร้อม acceptance criteria; C) Owner เสนอ scope เพิ่มพร้อม decision IDs ใหม่
- **RECOMMENDATION — NOT OWNER APPROVED:** A เป็น explicit defer list; C ต้องเปิด decision ใหม่และไม่ถือว่าอนุมัติจากการตอบข้ออื่น
- **เหตุผล/ข้อแลกเปลี่ยน:** จำกัด first release; use case ที่เลื่อนต้องมีแผน/เจ้าของและไม่ถูกซ่อนเป็น implicit behavior
- **ผล security/data:** deferred capability ไม่มี route/service/policy/UI; no production migration or external action
- **dependency:** ตัดสินใน 17K.0B ก่อนประกาศ 17K.1 scope; changes to accepted boundaries require ADR review
- **สถานะ:** OPEN / NOT OWNER APPROVED

### K-Q25 — ยืนยันนโยบาย Owner promotion/demotion และ last eligible Owner หรือไม่?

- **ข้อกำหนดที่ต้องปิด:** ยืนยันว่าใคร promote/demote ได้, self-demotion อนุญาตหรือไม่, ต้องเหลือ Owner อย่างน้อยหนึ่งคนหรือมี exception/transfer workflow และต้อง recheck อย่างไร
- **ตัวเลือก:** A) ยืนยัน current exact-Hospital transition และ last-eligible-Owner guard; B) จำกัดผู้รับ promotion/ผู้เริ่ม action เพิ่ม; C) ให้ Platform ADMIN อนุมัติ/ทำแทน; D) ปิด/เลื่อน promotion-demotion จนมี workflow; E) แยกกติกา promote, demote และ emergency recovery
- **RECOMMENDATION — NOT OWNER APPROVED:** คง exact-Hospital active Owner authority, serializable transaction, stale-write check และ last-eligible-Owner protection; ไม่ให้ hierarchy หรือ global ADMIN power โดยนัย; Owner ต้องยืนยันเรื่อง self-demote และ exception
- **เหตุผล/ข้อแลกเปลี่ยน:** คงมาตรการป้องกันการไม่มีผู้ดูแล Hospital; guard อาจต้องมี transfer/recovery process เมื่อ Owner คนเดียวออกจากงาน
- **ผล security/data:** ห้ามเปลี่ยน UserRole/global account; mutation ต้อง atomic กับ audit และ revalidate actor/target; exception ต้องมี privileged capability และ audit contract
- **dependency:** OWNER-01, 17K.0B และ 17K.2 หากมีการเปลี่ยน UI/service; ยืนยันก่อนขยายหรือแก้ current behavior
- **สถานะ:** OPEN / NOT OWNER APPROVED

## 12. Proposed Phase 17K execution roadmap

ขอบเขต 17K.1–17K.3 เป็น provisional; 17K.0B ต้องบันทึกคำตอบและ Owner approval ที่ตรวจสอบย้อนกลับได้ก่อนปล่อยแต่ละ slice. การตอบคำถามหนึ่งไม่อนุมัติการเปลี่ยน architecture โดยอัตโนมัติ

### 17K.0 — Requirement analysis and Owner decision pack

- **Entry prerequisites:** baseline HEAD/branch/worktree ตรวจแล้ว; อ่าน current-status addenda ก่อน historical record; 17J.5A bounded automated integration re-audit complete; 17J.5B แยกต่างหาก, NOT AUTHORIZED/NOT EXECUTED
- **Included:** audit code/schema/policies/services/UI/test evidence; เปรียบเทียบ Area semantics; field ownership; hierarchy threat analysis; 25 Owner questions; roadmap และ gate
- **Excluded:** runtime/schema/migration/seed changes; Area CRUD; profile editing; production action; 17J.5B และ comprehensive customer requirement gap review
- **Expected artifacts/layers:** เอกสารนี้; current-status references ใน [docs/CONTEXT.md](../CONTEXT.md) และ [Phase 17 UAT backlog](./PHASE_17_UAT_BACKLOG.md)
- **Security invariants:** ไม่เปลี่ยน policy, authority, role, relationship หรือ parentHospitalId; no production access
- **Migration:** ไม่มี
- **Unit tests / PostgreSQL integration tests:** ไม่รันเพราะ documentation-only; ตรวจ evidence จาก test source โดยไม่กล่าวอ้างว่ารัน
- **Exit criteria:** document references valid; recommendations labeled; no runtime files changed; Owner questions OPEN; current status links added
- **Outstanding Owner decisions:** K-Q01–K-Q25 ทั้งหมด
- **สถานะ:** DECISION PACK COMPLETE; ไม่เท่ากับ OWNER DECISIONS CLOSED หรือ IMPLEMENTATION AUTHORIZED

### 17K.0B — Explicit Owner decision closeout

- **Entry prerequisites:** Product Owner review decision pack และตอบ K-Q01–K-Q25; ถ้าบางข้อยังค้าง ให้ระบุว่า deferred/not in scope พร้อม owner, rationale และ dependency
- **Included:** บันทึก decision/status ต่อ ID; แยก accepted requirement, rejected option, deferred item และ follow-up; สรุป exact 17K.1 proposal; ระบุ need สำหรับ future ADR หากเปลี่ยน accepted architecture
- **Excluded:** เขียน code/schema; ถือว่า silence หรือเริ่มประชุมเป็น approval; อนุมัติด้วย signature ที่ไม่ได้รับจาก Owner
- **Expected layers/files:** update decision pack และ current-status references; ไม่แก้ accepted ADR เพื่อบันทึก proposal
- **Security invariants:** decision ที่เพิ่ม access ต้องมี resource/action/scope/grant/revoke/deny contract; approval ต้องระบุ actor และ exact scope
- **Migration:** ยังไม่มี; ระบุ requirement ถ้าภายหลังต้องเปลี่ยนข้อมูล
- **Unit test matrix:** ไม่ใช่ implementation slice; review traceability และ completeness ของทุก decision ID
- **PostgreSQL integration test matrix:** ไม่รัน; ระบุกรณีที่ต้องทดสอบใน 17K.1/17K.2 จาก decision ที่อนุมัติ
- **Exit criteria:** Owner มีคำตอบบันทึกครบหรือ explicitly defers; no ambiguous approval; implementation entry criteria ชัด; ADR need identified; status register reflects actual response
- **Outstanding Owner decisions:** จนกว่าจะ close ไม่มี 17K.1 authorization
- **สถานะ:** ยังไม่เริ่ม/รอ Owner; no approval asserted

### 17K.1 — Approved domain and persistence foundation (provisional)

- **Entry prerequisites:** 17K.0B ปิด decisions ที่จำเป็นต่อ model; approved written requirements; entity ownership, taxonomy, cardinality, lifecycle, access boundary และ migration/backfill decision; architecture review; ADR approved หากเปลี่ยน accepted architecture
- **Included:** domain vocabulary/schema/constraints สำหรับ approved subset เท่านั้น; migration หาก data contract ต้องการ; validation และ service/domain operations ที่จำเป็นต่อ persistence; audit/transaction/concurrency design
- **Excluded:** UI/worklist/reporting ใหม่; hierarchy inheritance; cross-Hospital sharing; Area-based Patient access; generic Person/User editing; unapproved profile fields
- **Expected layers/files:** prisma/schema.prisma, migration ที่มีแผน rollback/verification, module domain/service/policy เฉพาะ responsibility (เช่น workforce หรือ hospital-governance ตาม existing ownership); validation schemas/types; audit integration; source paths finalise ตาม repository pattern ก่อนแก้
- **Security invariants:** exact Hospital owner authorization; fail-closed server policy; no browser grants; Area membership != Patient access; preserve Person/User distinction and exact assignments; no parentHospitalId reinterpretation
- **Migration:** เฉพาะ approved mapping; no inference from address, legacy behavior, sibling/parent, or Patient assignment; uniqueness/FK/constraints at DB as business invariants; preserve historical clinical records
- **Unit test matrix:** validation and domain lifecycle; owner capability/scope; cross-Hospital deny; cardinality/uniqueness; stale transition; retirement/revocation; audit payload excludes secrets
- **PostgreSQL integration test matrix:** transaction + atomic audit; constraints/races for concurrent Owner updates; exact-Hospital read/write; multiple memberships; rollback; data migration idempotency and no unintended patient/assignment mutation
- **Exit criteria:** approved contract implemented; migration reviewed and verified; focused unit and PostgreSQL integration tests pass; architecture/lint/type checks per repo policy; no broadened access
- **Outstanding Owner decisions:** Any unresolved decision that touches schema, lifecycle, ownership, or authorization blocks relevant behavior; deferred capability remains out
- **สถานะ:** NOT AUTHORIZED

### 17K.2 — Approved Hospital governance / Area UI and service integration (provisional)

- **Entry prerequisites:** 17K.1 contract/schema available; approved Owner field matrix; capabilities/policies and service APIs stable; user-visible actor, effect, validation/error and audit behavior specified
- **Included:** UI/service workflow for approved exact-Hospital governance and/or non-authoritative operational grouping; loading/error/empty/disabled states; accessible inputs; explain scoped effects
- **Excluded:** fields or workflows not named in approved field matrix; hierarchy or cross-Hospital delegation; clinical permission via Area; reporting unless separately approved; external provider/device UAT
- **Expected layers/files:** app/app/workforce/ or exact existing governance routes; existing workforce/hospital-governance services and policies; scoped query helpers; validation/types; focused component tests where established. Add Area-specific module only if approved domain has distinct responsibility
- **Security invariants:** UI is not authority; every mutation re-checks session, exact active Owner, Hospital status and target; no client-supplied owner/role trust; audit and optimistic concurrency where consistency requires
- **Migration:** normally none beyond 17K.1; any later data backfill needs separate approved plan
- **Unit test matrix:** form validation; capability-based visibility as usability only; server policy deny; exact scope; safe errors; stale form response; loading/error/empty states
- **PostgreSQL integration test matrix:** Owner can mutate exact approved fields only; non-owner/admin/other-Hospital denies as specified; no Person/User/global side effects; concurrent updates fail safely; audit commits atomically; relationship suspension does not erase clinical history
- **Exit criteria:** end-to-end approved workflow passes relevant focused checks; accessibility/state review; service tests and PostgreSQL integration pass; no unresolved scope leak
- **Outstanding Owner decisions:** UI labels/terminology, field-level validation and any deferred workflow must be closed before implementation
- **สถานะ:** NOT AUTHORIZED

### 17K.3 — Cross-slice security, integration re-audit and UAT readiness (provisional)

- **Entry prerequisites:** 17K.1 and 17K.2 implementation stable; final diff reviewed; database migration and focused tests complete; decision/status registers current
- **Included:** cross-slice role/capability/scope audit; main/sub/sibling/multi-Hospital deny cases; lifecycle/revocation/concurrency review; bounded PostgreSQL integration re-audit; evidence pack and separate UAT readiness decision
- **Excluded:** real-provider/device UAT without its own explicit authorization; 17J.5B LINE device/provider actions; production operations; comprehensive customer requirement gap review unless separately requested/authorized
- **Expected layers/files:** existing integration/security test suites; audit output and phase handoff documentation; no runtime changes unless a finding is triaged and separately authorized as implementation work
- **Security invariants:** re-audit cannot loosen policy to make tests pass; exact assignment remains; no implicit hierarchy/Area authorization; LINE notifications/disconnection safety gates remain unchanged
- **Migration:** verify approved migration evidence and data invariants; no production execution
- **Unit test matrix:** run selected unit tests for governance and policy transitions; include explicit deny/revoke/last-owner/stale cases
- **PostgreSQL integration test matrix:** run affected governance, workforce, patient-directory, patient-provisioning, assignment, and contact integration tests; validate transaction/audit and cross-Hospital scope
- **Exit criteria:** findings dispositioned; automated integration re-audit evidence complete; UAT scenarios, device/provider prerequisites, data fixtures, stop conditions, and explicit authorization documented separately before any real-provider/device execution
- **Outstanding Owner decisions:** any approved scope changes, data retention, named UAT scenario approvals, and permission to execute real-provider/device UAT (not provided here)
- **สถานะ:** NOT AUTHORIZED; 17J.5B remains separate and not authorized

## 13. Acceptance criteria สำหรับ 17K.0

- [x] Baseline SHA/branch/worktree และ 17J.5A/17J.5B status ระบุจาก repository จริง
- [x] มี code/schema/service/policy/UI/test evidence แยกจาก requirement approval
- [x] วิเคราะห์ OWNER-01 และ field ownership โดยแยก Person, User, HospitalMembership, OsmHospitalRelationship, PatientProfile, PatientHospitalRelationship, PatientOsmAssignment และ Area
- [x] เปรียบเทียบ Area meanings และ Options A–E พร้อม trade-offs/conditions
- [x] ระบุ threat scenarios hierarchy, multi-Hospital, lifecycle, transfer, revoke และ stale mutation
- [x] มี K-Q01–K-Q25 พร้อมตัวเลือก, ข้อเสนอ, rationale, security/data impact, dependency, status
- [x] มี 17K.0B–17K.3 provisional roadmaps พร้อม entry/exit, exclusions, layers, invariants, migrations และ unit/PG test matrices
- [x] เอกสารไม่แก้ runtime/schema/migration/seed/config/external operations
- [ ] Owner decisions closed — **ยังไม่ผ่าน/รอ Owner**
- [ ] Phase 17K.1 authorized — **ยังไม่ผ่าน/ไม่ได้อนุมัติ**
- [ ] Phase 17K complete — **ยังไม่ผ่าน/ห้ามอ้างว่า complete**

## 14. Requirement gates และ explicit non-goals


### Blockers before 17K.1

17K.1 ยังไม่ authorized. ก่อนเริ่ม implementation ต้องมี 17K.0B บันทึก Owner decision และ technical contract สำหรับ exact scope ที่เสนอ; การเลื่อนคำถามต้องระบุชัดและตัด behavior ที่พึ่งคำตอบนั้นออกจาก slice:

- **Area domain/persistence foundation:** K-Q01–K-Q08 เพื่อระบุ meaning, taxonomy, source, ownership, cardinality และ hierarchy; K-Q16 สำหรับ lifecycle/audit; K-Q21–K-Q24 เพื่อกำหนด first slice, hierarchy sufficiency, migration และ defer list
- **Area member/worklist/Patient/report behavior:** K-Q09–K-Q15 และ K-Q17 เป็น blocker เฉพาะเมื่อ slice นั้นรวม relation, worklist, transfer/revocation, clinical effect หรือ reporting; ถ้า defer ต้องไม่มี implementation หรือ permission side effect
- **Owner workforce field edits:** K-Q18–K-Q20 ต้องปิดก่อนแก้ field/profile data
- **Owner promote/demote policy changes:** K-Q25 ต้องปิดก่อนขยายหรือเปลี่ยน transition, self-demotion, last-owner หรือ recovery behavior
- **ทุกกรณี:** 17K.0B ต้องยืนยันรายการที่ approved/deferred, actor/scope, security contract, migration need และ exit criteria; หากเปลี่ยน accepted architecture ให้มี future ADR ที่ผ่านการอนุมัติก่อน implementation

การปิดข้อใดข้อหนึ่งไม่อนุญาตให้ทำ behavior อื่นโดยนัย. เฉพาะ Owner-approved และ technically specified subset จึงอาจถูกพิจารณาเป็น 17K.1 slice.

รายการต่อไปนี้ requirement-gated หรือถูกเลื่อน ไม่ใช่ behavior ที่อนุมัติแล้ว:

- OWNER-01 field set นอก capability ปัจจุบัน; generic edit; contact/profile fields; owner promotion policy ที่ยังต้องยืนยัน
- AREA-01 taxonomy, source of truth, identity, cardinality, actor, lifecycle, membership, reporting และ migration
- parent/child/sibling inheritance หรือ delegation
- geography-driven operations; cross-Hospital Area sharing/transfer
- staff/OSM/Patient Area membership และ worklist effects
- Area-based Patient access, Patient reassignment หรือการ cascade assignment
- Area/reporting projections และ historical “as-of” semantics
- workforce data correction ที่มีผลข้าม Hospital
- seed/backfill/import จาก address, legacy grouping หรือ historical prototype
- production migration/operations, 17J.5B provider/device UAT และ comprehensive customer requirement gap review

**Non-goals ของเอกสารนี้:** อนุมัติ requirement แทน Product Owner; แก้ accepted ADR; เปลี่ยน business rule; implement Area; เปลี่ยน authorization; เริ่ม Phase 17K.1–17K.3; เปลี่ยน LINE notification/disconnection safety gates; อ้างว่า Phase 17K complete

## 15. Evidence references

หลักฐานต่อไปนี้รองรับสถานะปัจจุบันและการวิเคราะห์; source code/test เป็นหลักฐาน implementation ไม่ใช่การอนุมัติ customer requirement.

- Product/architecture: [PRODUCT.md](../../PRODUCT.md), [docs/CONTEXT.md](../CONTEXT.md), [architecture baseline](../architecture/DEMI_ARCHITECTURE_BASELINE.md), [ADR index and decisions](../adr/)
- Customer-flow boundary: [Phase 17A canonical flow](./PHASE_17A_CUSTOMER_FLOW_CANONICALIZATION_UAT_CONTRACT.md), [Phase 17 UAT backlog](./PHASE_17_UAT_BACKLOG.md)
- Current-status and handoff: [Phase 17J.5A integration re-audit](./PHASE_17J5A_LINE_INTEGRATION_REAUDIT_UAT_READINESS.md), [Phase 17J.5A handoff](./PHASE_17J5A_LINE_INTEGRATION_REAUDIT_UAT_READINESS.md), [Phase 17I.0B closeout](./PHASE_17I0B_HOSPITAL_KNOWLEDGE_CONTACT_DECISION_CLOSEOUT.md)
- Historical examples, not final requirements: [Phase 11A](./PHASE_11A_WORKFORCE_LIFECYCLE_HOSPITAL_GOVERNANCE_REQUIREMENTS.md), [Phase 11B](./PHASE_11B0_STAFF_MEMBERSHIP_LIFECYCLE_WORKING_PROTOTYPE.md), [Phase 11C](./PHASE_11C_OSM_RELATIONSHIP_LIFECYCLE_ASSIGNMENT_CONSEQUENCES.md), [Phase 12C](./PHASE_12C_OWNER_GOVERNANCE_ACCOUNT_RECOVERY_CONTRACT.md), [Phase 12D](./PHASE_12D0_HOSPITAL_OWNER_GOVERNANCE_WORKING_PROTOTYPE.md), [Phase 17I.0 decision pack](./PHASE_17I0_HOSPITAL_KNOWLEDGE_CONTACT_DECISION_PACK.md)
- Data model: [prisma/schema.prisma](../../prisma/schema.prisma)
- Auth context/policy: [src/modules/auth/](../../src/modules/auth/), [src/modules/auth/policies/authorization.ts](../../src/modules/auth/policies/authorization.ts)
- Workforce governance: [src/modules/workforce/policies/](../../src/modules/workforce/policies/), [src/modules/workforce/services/workforce-service.ts](../../src/modules/workforce/services/workforce-service.ts)
- Hospital governance/onboarding/contact: [src/modules/hospital-governance/](../../src/modules/hospital-governance/), [src/modules/hospital-onboarding/](../../src/modules/hospital-onboarding/), [src/modules/hospital-contact/](../../src/modules/hospital-contact/)
- Patient and OSM boundaries: [src/modules/patient-provisioning/](../../src/modules/patient-provisioning/), [src/modules/patient-assignment/](../../src/modules/patient-assignment/), [src/modules/patient-directory/](../../src/modules/patient-directory/)
- UI projection: [app/app/workforce/](../../app/app/workforce/)
- PostgreSQL integration test sources: [workforce.integration.test.ts](../../tests/integration/workforce.integration.test.ts), [hospital-governance.integration.test.ts](../../tests/integration/hospital-governance.integration.test.ts), [patient-provisioning.integration.test.ts](../../tests/integration/patient-provisioning.integration.test.ts), [patient-directory.integration.test.ts](../../tests/integration/patient-directory.integration.test.ts), [patient-osm-assignment.integration.test.ts](../../tests/integration/patient-osm-assignment.integration.test.ts), [hospital-contact.integration.test.ts](../../tests/integration/hospital-contact.integration.test.ts)

## 16. Approval and status register

| Record | Status as of 2026-10-10 | Evidence / next action |
| --- | --- | --- |
| Starting baseline | HEAD acd6a29797de01c5ac1841fd1a3666809d4729a1; branch main; worktree clean before edits | Recorded at start; docs-only changes follow |
| Phase 17J.5A bounded automated integration re-audit | COMPLETE | See J5A audit and handoff; no claim beyond its stated bounded scope |
| Phase 17J.5B real-provider/device UAT | NOT EXECUTED / NOT AUTHORIZED | Separate phase gate; no action taken |
| Phase 17K.0 decision pack | DECISION PACK COMPLETE | This document plus current-status links |
| OWNER-01 / AREA-01 decisions | OPEN / NOT OWNER APPROVED; 25 questions | Product Owner to respond in 17K.0B |
| OWNER DECISIONS CLOSED | NO | No Owner approval/signature is represented |
| 17K.1 implementation | NOT AUTHORIZED | Blocked by unresolved decisions and lack of explicit implementation authorization |
| Phase 17K complete | NO | 17K.0 completion is not Phase 17K completion |
| LINE notification/disconnection safety gates | Preserved | No external integration, notification, device or production action performed |

**Future ADR:** หาก Owner อนุมัติ hierarchy inheritance, Area-based clinical access, global Area authority หรือความเปลี่ยนแปลงอื่นที่กระทบ accepted architecture ให้เสนอ ADR ใหม่และผ่าน review/approval ก่อน implementation; เอกสารนี้ไม่แก้ไขหรือรับรอง ADR ใด
