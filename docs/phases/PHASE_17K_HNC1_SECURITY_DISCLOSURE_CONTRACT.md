# DEMI — Phase 17K HN-C1: Security & Disclosure Contract

- **ขอบเขต:** documentation-only contract สำหรับ Hospital Network reporting ในอนาคต
- **สถานะเอกสาร:** HN-C1 DOCUMENTATION PREPARED — SECURITY ACCEPTANCE PENDING
- **สถานะข้อมูลจริง:** ยังห้ามเปิดเผย Network aggregate ที่ได้รับผลจาก temporal หรือ privacy gate
- **implementation:** ไม่ได้รับอนุญาตจากการจัดทำเอกสารนี้; HN-C2 IMPLEMENTATION BLOCKED
- **ฐานที่ตรวจ:** branch `docs/hn-c1-security-disclosure-contract`, starting HEAD `577405e0ae142798f727be41e845600b6e32693e` (HN-C0), worktree สะอาดก่อนเริ่ม; ตรวจ ณ 2026-10-10
- **ผู้อนุมัติ/วันที่อนุมัติ:** ไม่ระบุ เพราะไม่มีหลักฐานการลงนามหรือการตัดสินใน repository

> เอกสารนี้กำหนดข้อเสนอด้าน security และ disclosure เพื่อให้พิจารณา ไม่ใช่หลักฐาน Product Owner/security/privacy approval, ไม่ติดตั้ง capability และไม่อนุมัติการพัฒนา การ deploy หรือการเปิดเผยข้อมูลจริง

## 1. ขอบเขตและ security invariants

### 1.1 ขอบเขต

Hospital Network reporting ในเอกสารนี้หมายถึงเฉพาะ aggregate ตามโครงสร้างที่รับรองไว้ใน HN-C0:

- **P** = Parent Hospital
- **C** = ACTIVE direct child Hospitals ที่ eligible ตาม metric และ temporal/privacy gates
- **N** = P ∪ C

Unique persons คำนวณใหม่ภายในแต่ละ set; ห้ามบวก P.unique กับ C.unique เพื่อสร้าง N.unique. Capability ที่เสนอในเอกสารนี้ไม่ให้สิทธิ์อ่านแถวบุคคลหรือ clinical records.

### 1.2 เงื่อนไขผู้ใช้และทรัพยากรที่เสนอ

การอนุญาต Network operation ต้องผ่านทุกข้อ ณ server-side authorization boundary:

1. มี authenticated DEMI User จาก current authenticated session
2. User มีสถานะ `ACTIVE`
3. User มี `Role.HOSPITAL`
4. มี direct `HospitalMembership` ที่ `ACTIVE` และ type `OWNER`
5. `HospitalMembership.hospitalId` เท่ากับ Parent Hospital เป้าหมายแบบ exact match
6. Parent Hospital ปัจจุบันมีสถานะ `ACTIVE`
7. ความสัมพันธ์ Parent/Child, lifecycle และ policy ที่ query ใช้ยังผ่านการตรวจ authoritative ปัจจุบัน

หลาย role อนุญาตได้ต่อเมื่อ actor ผ่านชุดเงื่อนไข exact Parent OWNER ข้างต้นด้วยตนเองเท่านั้น เช่น OSM/PATIENT role เพิ่มเติมไม่ให้หรือข้ามสิทธิ์ ส่วน ADMIN-only ไม่มีสิทธิ์นี้; ADMIN ที่มี HOSPITAL role และ membership OWNER ที่ตรง Parent อาจผ่านได้เพราะ membership OWNER นั้น ไม่ใช่เพราะ ADMIN.

### 1.3 การปฏิเสธและข้อห้ามสืบทอด

ต้องปฏิเสธ actor ที่เป็น MEMBER-only, child-only OWNER, ADMIN-only, OSM-only, PATIENT-only, User ที่ไม่ ACTIVE, membership ที่ไม่ ACTIVE/revoked/stale หรือ Parent ที่ไม่ ACTIVE. ห้ามอนุมานสิทธิ์จาก browser state, cached ActorContext, Hospital ID ที่ client ส่ง, ชื่อ/รหัสโรงพยาบาล หรือ hierarchy เพียงอย่างเดียว.

Hospital hierarchy ให้ได้เฉพาะขอบเขต organizational aggregate ที่ผ่านการอนุมัติในอนาคตเท่านั้น ไม่ให้:

- clinical Patient read หรือ patient roster
- exact Patient, PatientHospitalRelationship, Program, Follow-up หรือ clinical-record read
- Patient assignment หรือ Patient mutation
- workforce/Staff/OSM management ของ child
- sibling, grandchild, unrelated Hospital หรือ platform-wide access
- export

ความสามารถเหล่านี้ยังคงอยู่ภายใต้ exact policies เดิมและ requirement gates ของตน.

### 1.4 Source-of-truth และสถานะหลักฐาน

คำต่อไปนี้ใช้แยกข้อเท็จจริงออกจากข้อเสนอ:

| ป้ายสถานะ | ความหมายใน HN-C1 |
| --- | --- |
| `OWNER_RECEIVED` | HN-A01–A06 และ HN-M01–M06/time subdecisions ตาม HN-C0 เท่านั้น; เป็น business semantics ที่บันทึกไว้ ไม่ใช่ runtime approval |
| `ACCEPTED_ARCHITECTURAL_CONTRACT` | ADR-0002 และ architecture baseline: Role + Capability + Scope, server authority, fail closed; ห้าม client state ให้สิทธิ์ |
| `VERIFIED_CURRENT_IMPLEMENTATION` | พฤติกรรมที่ตรวจพบใน schema/source ปัจจุบันตาม §1.5; ไม่ถือว่ามี Network reporting |
| `PROPOSED_SECURITY_DESIGN` | แนวทางใน HN-C1 ที่ต้องให้ decision authority รับรองก่อนนำไปใช้ |
| `OPEN_BLOCKER` | เงื่อนไขที่ยังทำให้ query หรือเปิดเผย aggregate จริงไม่ได้ |
| `DEFERRED / NOT AUTHORIZED` | ขอบเขตที่ถูกยกเว้นและห้ามเริ่มจาก HN-C1 |

HN-C1 คง HN-A01–A06, HN-M01–M06 และ HN-M06-T01–T09/T06-S01/S02/T09-S01 ตามนิยามและสถานะใน [HN-C0](./PHASE_17K0B_HN_OWNER_DECISION_CLOSEOUT.md) โดยไม่เพิ่ม metric, เปลี่ยนเวลา หรือเลื่อน proposal เป็น Owner decision. HN-C1 ไม่แก้ความหมาย/รหัส/ตัวเลือก/สถานะ K-Q01–K-Q25 ใน [decision pack เดิม](./PHASE_17K0_HOSPITAL_GOVERNANCE_RESPONSIBILITY_AREA_DECISION_PACK.md); HN hierarchy ไม่ปิด K-Q01/K-Q22 ทั้งหมด, K-Q07 หรือ K-Q17. OWNER-01 และ AREA-01 ยังคงเป็น requirement gates แยกต่างหาก.

### 1.5 หลักฐาน implementation ปัจจุบัน

| สถานะ | หลักฐานที่ตรวจ | สิ่งที่ยืนยันได้ / ขอบเขต |
| --- | --- | --- |
| `VERIFIED_CURRENT_IMPLEMENTATION` | [Prisma schema](../../prisma/schema.prisma) | `Hospital.parentHospitalId` เป็น nullable self-reference ปัจจุบัน; Hospital มี `createdAt/updatedAt`, ไม่มี effective-dated parent history model ที่ตรวจพบ. มี User/UserRole, HospitalMembership, PatientHospitalRelationship, PatientClassification/PatientClassificationHistory, PatientProgram, PatientFollowup และ OsmHospitalRelationship; history model ที่เกี่ยวข้องในรายการนี้เป็นของ classification ไม่ใช่ hierarchy. |
| `VERIFIED_CURRENT_IMPLEMENTATION` | [ActorContext service](../../src/modules/auth/services/actor-context-service.ts), [ActorContext type](../../src/modules/auth/types/actor-context.ts) | ดึง authenticated subject จาก Supabase server-side แล้วโหลด User status, roles, memberships, membership status และ Hospital status ปัจจุบันจากฐานข้อมูล. ActorContext ที่โหลดได้เป็น snapshot ของการอ่านนั้น; ไม่รับประกันว่าจะยัง current เมื่อ query ภายหลังทำงาน. |
| `VERIFIED_CURRENT_IMPLEMENTATION` | [Hospital Owner policy](../../src/modules/workforce/policies/hospital-owner-policy.ts) | ตรวจ HOSPITAL role, exact target Hospital, direct ACTIVE OWNER membership และ ACTIVE Hospital จาก ActorContext. ไม่มี Network candidate capability; policy helper เองไม่ทำ atomic revalidation กับ query ภายหลัง. |
| `VERIFIED_CURRENT_IMPLEMENTATION` | [Patient Directory policy](../../src/modules/patient-directory/policies/patient-directory-policy.ts) | Patient read ใช้ direct ACTIVE OWNER/MEMBER membership ของ exact Hospital; ไม่มี hierarchy inheritance. OSM assigned-patient scope เป็นอีก policy. |
| `VERIFIED_CURRENT_IMPLEMENTATION` | [OSM assignment policy](../../src/modules/patient-assignment/policies/patient-osm-assignment-policy.ts) | การจัด OSM เป็น exact-Hospital active OWNER policy ปัจจุบัน; ไม่ใช่ Network workforce management. |
| `VERIFIED_CURRENT_IMPLEMENTATION` | [Hospital governance service](../../src/modules/hospital-governance/services/hospital-governance-service.ts) | Hospital suspend/restore เป็น Platform ADMIN governance operation แยกจาก Parent Owner. ไม่ใช่ Network reporting service. |
| `VERIFIED_CURRENT_IMPLEMENTATION` | [Program report access](../../src/modules/reporting/services/program-report-access-service.ts), [Program report policy](../../src/modules/reporting/policies/program-report-policy.ts) | `report:program:read` ผูกกับ exact Program และ exact PatientHospitalRelationship ภายใต้ scope เดิม; ไม่อนุญาต Hospital cohort, Network aggregate หรือ export. |
| `VERIFIED_CURRENT_IMPLEMENTATION` | schema และการค้น runtime references | ไม่พบ Network capability, directory/resolver, aggregate query หรือ Network reporting handler ใน implementation ที่ตรวจ. `Hospital.updatedAt` ไม่ใช่ hierarchy history. |

Architecture/security basis เพิ่มเติมอยู่ใน [ADR-0002](../adr/0002-role-capability-scope-authorization.md) และ [DEMI Architecture Baseline](../architecture/DEMI_ARCHITECTURE_BASELINE.md). Reporting/domain source semantics อ้าง [15B.0](./PHASE_15B0_PROGRAM_WORKFLOW_FOUNDATION.md), [15C.1](./PHASE_15C1_SERVICE_TWO_PROGRAM_LINKAGE_DOMAIN_PERSISTENCE.md), [15E.0](./PHASE_15E0_REPORTING_DASHBOARD_EXPORT_CONTRACT_CONSOLIDATION.md), [15E.1](./PHASE_15E1_PROGRAM_REPORTING_PROJECTION_FOUNDATION.md) และ [16D.3](./PHASE_16D3_PATIENT_CLASSIFICATION_PERSISTENCE_HISTORY_RECONCILIATION.md).

## 2. Candidate Network read capabilities

ชื่อและ contract ต่อไปนี้เป็น `PROPOSED_SECURITY_DESIGN` เท่านั้น: ยังไม่ติดตั้ง ไม่ใช่ capability matrix ที่อนุมัติ และต้องปิด decision HN-C1-D01 ก่อน implementation. ทั้งสาม capability ห้ามให้ patient-level read, clinical detail, patient roster, mutation, generic workforce management หรือ export.

### 2.1 `network:directory:read` — candidate

- **ผู้เรียก:** actor ที่ผ่าน §1.2 ต่อ exact ACTIVE Parent Hospital.
- **Target/scope:** exact Parent Hospital ที่ client ใช้เป็น locator; server หาเฉพาะแถว child ที่ `child.parentHospitalId === parent.id`. ไม่มี traversal.
- **ข้อมูลที่อาจอนุญาต:** direct-child organizational metadata เท่านั้น. Safety proposal ขั้นต่ำคือ opaque `hospitalId`, `name`, `status`; `hospitalCode` ยังต้องตัดสินว่า “จำเป็นต่อ use case” หรือไม่. ไม่รวม contact, address, Owner/member identity/count, patient count, clinical data, หรือข้อมูลของ sibling/grandchild.
- **Lifecycle:** directory อาจแสดง direct child สถานะ `PENDING_VERIFICATION`, `ACTIVE`, `SUSPENDED` ตาม HN-A04. สถานะเป็นข้อมูลประกอบการจัดองค์กรเท่านั้น; ไม่ทำให้ child เป็น contributor หรือ grant child access. Parent ต้อง ACTIVE.
- **Revocation/failure:** ทุก request ตรวจ User, role, membership, Parent และ direct relationship ปัจจุบัน; ถ้า Parent ไม่ ACTIVE, Owner ถูกระงับ/ลดสิทธิ์, scope stale หรือ resolver ล้มเหลวให้ deny/unavailable แบบปลอดภัย.
- **Implementation dependency:** Owner/security ต้องอนุมัติ capability, field allowlist, directory disclosure และ lifecycle/race behavior (HN-C1-D01/D02/D08/D11). Directory ห้ามกลายเป็นช่องทางรายงานผู้ป่วยหรือ cohort.

### 2.2 `network:summary:read` — candidate

- **ผู้เรียก:** actor ที่ผ่าน §1.2 ต่อ exact ACTIVE Parent Hospital.
- **Target/scope:** exact Parent; aggregate scopes P, C และ N ตาม HN-C0 โดย C มีเฉพาะ ACTIVE direct child. ใช้ Hospital IDs ที่ resolve จาก authoritative DB เท่านั้น.
- **ข้อมูลที่อาจอนุญาต:** HN-M01–M06 aggregates ตาม §7 หลังผ่าน historical eligibility และ HN-M07 release gates. ไม่คืน rows, identifiers, free text, per-patient data หรือ per-record details.
- **Lifecycle:** Parent ต้อง ACTIVE. Non-ACTIVE child ไม่เป็น contributor และไม่แสดงเป็น Hospital ที่มี contribution เท่ากับศูนย์. Current summary ไม่ล้างประวัติและไม่แปลสถานะทางคลินิก.
- **Revocation/failure:** current Owner/Parent/scope checks ต้องอยู่ในขอบเขต consistency ที่อนุมัติ; temporal attribution ที่พิสูจน์ไม่ได้ให้ `TEMPORAL_UNPROVEN`; privacy rule ให้ withheld คือ `PRIVACY_WITHHELD`; source/read failure คือ `SOURCE_UNAVAILABLE`. ห้ามแปลงเป็น 0.
- **Implementation dependency:** HN-C1-D01/D03–D11 ต้องได้รับการตัดสินและทดสอบก่อนเขียน query. จนกว่าจะถึงตอนนั้น aggregate จริงทั้งหมดที่ได้รับผลจาก blocker ต้อง withheld.

### 2.3 `network:child-summary:read` — candidate

- **ผู้เรียก:** actor ที่ผ่าน §1.2 ต่อ Parent Hospital เดียวกัน.
- **Target/scope:** exact ACTIVE child ซึ่งฐานข้อมูลยืนยันว่า `child.parentHospitalId === parent.id`; Parent ก็ต้อง ACTIVE. Child ID จาก client เป็นเพียง locator.
- **ข้อมูลที่อาจอนุญาต:** bounded aggregate ของ HN-M01–M06 สำหรับ child เดียวตาม metric eligibility; ไม่เปิด child record หรือ roster.
- **Lifecycle:** child ที่ไม่ ACTIVE, ไม่ใช่ direct child หรือถูก reparent แล้ว ต้องไม่ผ่าน target check. การแสดง directory status ไม่สร้าง child-summary authority.
- **Revocation/failure:** ตรวจ current parent-child relation, Parent/child lifecycle, Owner และ temporal/privacy gates; scope เปลี่ยนหรือ reparent ระหว่างทำงานต้อง fail closed ภายใต้ concurrency contract ที่ยัง OPEN.
- **Implementation dependency:** HN-C1-D01/D03–D11; child drilldown อยู่ใต้ HN-A06 แต่ disclosure จริงยังถูก block โดย HN-M07 และ historical reparent gate.

## 3. Server-side scope resolution contract (เสนอ)

การประมวลผลแต่ละ request ในอนาคตต้องทำตาม boundary นี้; ลำดับเชิง transaction/read-isolation ยังต้องตัดสิน ไม่ถือว่ารายการนี้เลือก isolation level แล้ว:

1. ยืนยัน authenticated actor จาก current server session; โหลด ActorContext ล่าสุดจาก authoritative store.
2. ตรวจ candidate capability/action จาก server-side allowlist; client เลือกหรือประดิษฐ์ capability ไม่ได้.
3. parse และ validate Parent Hospital locator; resolve Parent จากฐานข้อมูล ไม่เชื่อ client status/name/ownership.
4. ตรวจ User `ACTIVE`, `Role.HOSPITAL`, direct membership `ACTIVE/OWNER` ที่ exact Parent และ Parent `ACTIVE` ใหม่ใน operation context.
5. โหลด Children จาก authoritative Hospital relationship โดยเงื่อนไขตรงตัว `child.parentHospitalId === parent.id`; ห้าม recursive traversal.
6. ใช้ lifecycle filter: directory อนุญาตเฉพาะสถานะที่ HN-A04 ระบุ; aggregate contributors ต้องเป็น ACTIVE Parent และ ACTIVE direct children เท่านั้น. Non-ACTIVE child ถูกตัดออก ไม่สร้าง zero-contribution row.
7. สำหรับ child-summary ตรวจ child เป้าหมายว่า ACTIVE direct child ของ Parent ปัจจุบันก่อน query.
8. ตัดสิน temporal/provenance eligibility สำหรับทุก source contribution ก่อนรวมค่า; hierarchy ปัจจุบันหรือ `updatedAt` อย่างเดียวไม่ผ่านเงื่อนไขนี้.
9. สร้าง query โดยใส่ exact authorized Hospital source predicates ลงใน database query เอง; ห้าม aggregate กว้างแล้วกรองผลบน client.
10. คำนวณ P, C, N แยกกัน โดย unique sets ใช้ distinct identity ต่อ set; ใช้ HN-M07 approved disclosure control กับชุด output และประวัติคำขอที่เกี่ยวข้อง.
11. ส่งเฉพาะ approved sanitized result หรือสถานะ denied/withheld/unavailable แบบไม่เป็นตัวเลขตาม §6; ห้าม fallback เป็น factual zero.

`child.parentHospitalId === parent.id` เป็นกฎ eligibility สำหรับ direct child เพียงกฎเดียวใน contract นี้. ไม่ใช้ path traversal, Area, geography, role ของ child, Patient relationship หรือ assignment เพื่อขยาย Network scope. `report:program:read` ยังคง exact-Program permission.

### 3.1 Revocation และ concurrency ที่ยังไม่ตัดสิน

การโหลด ActorContext ใหม่ทุก request เป็นหลักฐานที่ดีต่อ current-state check แต่ไม่ปิด TOCTOU ระหว่าง authorization, scope resolution และ aggregate query. ต้องกำหนดและทดสอบพฤติกรรมเมื่อเกิดพร้อมกันกับ:

- Owner ถูก demote, membership suspend/revoke หรือ User ถูก suspend
- Parent ถูก suspend
- child ถูก suspend หรือ reparent จาก A ไป B
- resolver/read หลาย query เห็นสถานะจากคนละ database state
- transaction retry หรือ serialization failure

ต้องกำหนด linearization point หรือระดับความสอดคล้องที่ต้องการ, วิธีผูก authorization กับ query/snapshot, ผลลัพธ์เมื่อ mutation แข่งกัน และเกณฑ์ abort/retry แบบจำกัด. ห้ามอ้างว่า As-of instant หนึ่งค่าให้ consistent database snapshot; ห้ามรับรองว่า revocation ถอนข้อมูลที่ response ส่งไปแล้วหรือที่ผู้ใช้บันทึกภาพหน้าจอไว้ได้.

## 4. Historical reparenting disclosure — RELEASE-CRITICAL OPEN_BLOCKER

### 4.1 ข้อเท็จจริงและ invariant

Schema ปัจจุบันมี `Hospital.parentHospitalId` และ `updatedAt`; ไม่พบ effective-dated hierarchy history ที่บอก parent เดิม ช่วงเวลาที่สัมพันธ์มีผล หรือเหตุการณ์ย้ายอย่าง authoritative. `updatedAt` เป็นเวลาแก้ไขแถวปัจจุบัน ไม่ใช่เวลาเริ่ม/สิ้นสุดของ parent relation. Classification history, Program lifecycle และ Follow-up `recordedAt` ไม่ใช่หลักฐาน Hospital hierarchy history.

> **Current organizational membership does not automatically authorize disclosure of pre-reparent records.**

เมื่อ Child ย้ายจาก Parent A ไป Parent B:

- Parent A สูญเสีย current direct-child scope เมื่อ relationship ปัจจุบันเปลี่ยน; ข้อมูลที่เคยอยู่ใน network ของ A ไม่ได้คง authority ต่อไปโดยอัตโนมัติ.
- Parent B ได้ current organizational relationship แต่ไม่ได้ historical disclosure authority ต่อข้อมูลก่อนการย้ายเพียงเพราะ pointer ปัจจุบันชี้มาที่ B.
- HN-M01/M02 และ M03 เป็น CURRENT_SNAPSHOT ตาม metric semantics แต่ population ปัจจุบันอาจสะสม/เปลี่ยนก่อนการย้าย; current snapshot ไม่ใช่หลักฐานว่าทุก contribution เกิดในช่วง parentage ของ B.
- Program episode ที่เริ่มก่อน transfer และสิ้นสุดหลัง transfer ไม่มีข้อมูล hierarchy history ที่จะจัดทั้ง episode หรือแบ่งส่วนอย่างปลอดภัย. ห้ามใช้ `startedAt`, `completedAt` หรือ current relationship เพียงลำพังเป็น eligibility proof.
- Follow-up ที่ `recordedAt` ก่อน/หลังการย้ายระบุ application recording time ไม่ใช่เวลา observation และไม่บอกว่าใครมีสิทธิ์รับรู้ตอนนั้น.
- Mixed หรือ unverifiable source contributions ทำให้ aggregate รวมเสี่ยงเปิดเผย pre-transfer cohort แม้ผลลัพธ์เป็นจำนวนรวม.
- เมื่อพิสูจน์ไม่ได้ว่าไม่มี reparent หรือไม่มีช่วงข้อมูลที่เกี่ยวข้อง ห้ามสมมติ no-reparent จากการไม่มีประวัติ.
- Reparent ที่เกิดระหว่าง scope resolution และ query อาจทำให้ Parent eligibility กับ source set ไม่สอดคล้อง; ต้อง fail closed ภายใต้ concurrency contract.

### 4.2 พฤติกรรม fail-closed

เมื่อ attribution ตามเวลาไม่พิสูจน์ได้ ให้ mark affected scope/metric ว่า `TEMPORAL_UNPROVEN` ภายในระบบ และ withhold ค่าตัวเลขทั้งหมดที่ได้รับผล. ห้ามแปลงเป็น 0, นับเฉพาะส่วนที่หาได้โดยไม่ระบุ, แสดงเป็น no contributor, หรือเลือก Parent ปัจจุบันเป็นย้อนหลัง. หากพิสูจน์ขอบเขต contamination แยกไม่ได้ ให้ปิด aggregate ที่ได้รับผลทั้ง scope/request จนกว่าจะมี decision ที่ระบุได้ว่าปิดส่วนใดอย่างปลอดภัย.

### 4.3 ทางเลือกที่ไม่ผูกมัด (ยังไม่เลือก)

| ทางเลือก | ความหมาย | ข้อแลกเปลี่ยน/หลักฐานที่ต้องมีก่อนอนุมัติ |
| --- | --- | --- |
| **A. Withhold** | งด Network aggregate ที่มีหรืออาจมีประวัติ reparent/temporal provenance ไม่พอ จนกว่าจะมีหลักฐานที่เชื่อถือได้ | ปลอดภัยและง่ายที่สุดต่อการตีความ แต่ทำให้รายงานบาง scope ใช้ไม่ได้; ต้องนิยามวิธีระบุ affected scope โดยไม่เดา |
| **B. Approved effective-dated source** | ใช้ hierarchy history หรือ authoritative provenance แยกที่ได้รับการอนุมัติและตรวจสอบได้ | ต้องมีเจ้าของ/source of truth, valid-from/to, correction/backdate, audit, concurrency, retention และ source-to-metric mapping; อาจต้องมีเอกสาร/schema/migration แยกภายหลัง แต่ HN-C1 ไม่สร้างสิ่งเหล่านี้ |
| **C. Prospective-only cutover** | เริ่มสิทธิ์รายงานหลัง cutover ที่อนุมัติแยก โดยไม่ให้ authority ย้อนหลัง | ต้องกำหนด effective cutover จากหลักฐานอิสระและจัดการช่วงก่อนหน้า; M01–M03 เป็น current snapshots จึงยังต้องแก้คำถามว่าประชากรเดิมที่ยังอยู่ใน snapshot จะ withheld/แยก/เริ่มนับเมื่อใด. ห้ามใช้ `createdAt` หรือ `updatedAt` เดา parent eligibility. |

ไม่มีการเลือก A/B/C ใน HN-C1.

### 4.4 หลักฐาน/คำตัดสินที่ต้องปิดก่อน HN-C2

ต้องมีบันทึกจาก decision authority ที่เหมาะสมว่า: (1) เลือก disclosure path และแหล่ง provenance ที่เชื่อถือได้, (2) ระบุ temporal attribution ของ M01–M05 รวม snapshot, Program spanning transfer, Follow-up ก่อน/หลังและ mixed cohort, (3) ระบุการแก้/ขาด/ขัดแย้งของ history และ fail-closed scope, (4) ระบุ concurrency/read consistency กับ reparent, และ (5) รับรอง adversarial fixtures/expected outputs. หากไม่มีหลักฐานเหล่านี้ HN-C2 ยังเริ่มไม่ได้. ห้าม HN-C1 เพิ่ม history table, migration, backfill, effective date ที่อนุมาน หรือแก้ clinical records.

## 5. HN-M07 — Aggregate Privacy & Disclosure Protection (`OPEN_BLOCKER`)

HN-M07 ยังคง OPEN_BLOCKER จาก HN-C0. การ aggregate ลดรายละเอียดต่อแถวแต่ไม่ได้ทำให้ข้อมูลไม่อ่อนไหวโดยอัตโนมัติ; exact counts และการเปรียบเทียบหลายชุดอาจเปิดเผยข้อมูลบุคคลหรือ cohort.

### 5.1 Threat model

| Threat | ตัวอย่างเส้นทางอนุมาน | ข้อกำหนด/สถานะ |
| --- | --- | --- |
| Small cell / rare cohort | กลุ่มเล็กหรือสถานะพบไม่บ่อยชี้ไปยังผู้ป่วยที่รู้จัก | ต้องมี primary suppression rule ที่ทดสอบได้; threshold ยังไม่กำหนด |
| Rare patient/cohort inference | จำนวนรวมประกอบกับความรู้ภายนอก/จำนวนที่ทราบ ทำให้อนุมานสมาชิกได้ | ไม่สมมติว่า aggregate ปลอดภัยเพราะไม่มีชื่อ |
| P/C/N complementary disclosure | ปิด C แต่เปิด P และ N หรือเปิด child อื่นจนลบกลับได้ | ต้องประเมินทุก cell และผลรวมร่วมกัน; complementary/secondary suppression ยังไม่อนุมัติ |
| Parent-versus-Network subtraction | N กับ P เหลือผลต่างที่เผย contribution ของ children | ห้ามปล่อยผลต่างที่ทำให้ reconstruct ค่า withheld |
| Direct-child / cross-child subtraction | N, P และ child summaries ของ sibling children ใช้แก้ค่าของ child ที่ถูกปิดได้ | ต้องพิจารณาชุดคำตอบรวมถึงสถานะ/ขนาดของกลุ่ม |
| Unique versus relationship count | Patient คนเดียวมีหลาย Hospital relationship; count สอง grain ต่างกัน | relationship count ลบ unique count หรือเทียบ child/parent อาจเปิดเผย multiplicity |
| N.unique และ P/C overlap | N.unique คำนวณ DISTINCT ใหม่; `N.unique - P.unique` ไม่จำเป็นต้องเท่ากับ C.unique แต่ภายใต้ set model อาจเปิดจำนวนคนที่อยู่ใน C แต่ไม่อยู่ P | เป็น complementary inference ที่ต้องป้องกัน; ห้ามบวก P.unique + C.unique เพื่อสร้าง N.unique |
| Cross-metric inference | รวม total, RISK/DIABETES, Staff/OSM, Program และ Follow-up counts | ต้องพิจารณาความสัมพันธ์และการหักลบข้าม metric; RISK/DIABETES ไม่ใช่ diagnosis ที่ยืนยัน |
| Program/Follow-up comparisons | Program episode/unique participants เทียบ Follow-up record/unique Patients | M05 ไม่ได้เป็น subset ของ M04; การเปรียบเทียบ/หักลบอาจเปิด cohort |
| Repeated overlapping ranges | เปรียบเทียบช่วง date range ที่ทับกันเพื่อแยก record/สมาชิก | ต้องมี cross-request protection; per-cell threshold อย่างเดียวไม่พอ |
| MTD refresh differencing | MTD เปลี่ยนทุกวัน/ทุก refresh และเผยผู้เข้าใหม่หรือจำนวนเปลี่ยน | ต้องตัดสิน refresh cadence, As-of stability และ release-history-aware control |
| Different As-of timestamps | คำตอบช่วงเดียวกันที่ As-of ต่างกันใช้หาผลต่างของ lifecycle/status | ต้องรวมความต่างของ As-of ในการวิเคราะห์ differencing |
| Reparent inference | เปรียบเทียบ Network ก่อน/หลังเปลี่ยน parent เพื่ออนุมาน cohort ที่ย้าย | เกี่ยวข้องทั้ง HN-M07 และ §4 temporal blocker; ปิดค่าเมื่อ provenance ไม่พอ |
| Error/status oracle | DENIED, SUPPRESSED, empty, 0 หรือ error ที่ต่างกันบอกว่ามี child/cohort/count หรือไม่ | ต้องใช้ client-visible response ที่ไม่เป็น numeric และไม่เปิดเผยเหตุผลละเอียด |
| Cache/stale disclosure | cache คงค่าเดิมหลัง Owner revoke, suspend หรือ reparent; shared cache ส่งข้าม actor | ต้องไม่ปล่อยผล stale/ข้าม scope; cache contract และ reauthorization ยังเปิด |

**เงื่อนไขทางคณิตศาสตร์ที่ต้องรักษา:** N = P ∪ C; unique persons คำนวณ DISTINCT ใหม่ของแต่ละ set. N.unique ไม่ใช่ P.unique + C.unique. สำหรับ record counts ที่เป็นคนละ record ต่อ Hospital (เช่น relationship IDs) ผลรวมอาจ additive ได้ก็ต่อเมื่อ grain ไม่ซ้ำและ join ไม่ fan-out; แม้ additive ก็ยังเสี่ยง subtraction. Unique-person sets อาจ overlap ระหว่าง P/C และไม่ additive.

### 5.2 Decision matrix สำหรับ privacy control

| ประเด็น | สิ่งที่ต้องตัดสิน/ทดสอบ | ข้อเสนอเพื่อความปลอดภัย (ยังไม่อนุมัติ) | สถานะจนกว่าจะปิด |
| --- | --- | --- | --- |
| Primary suppression | ขั้นต่ำต่อ cell/cohort, หน่วยนับที่ใช้, metric ไหนบ้าง, treatment ของ 0/1 | Withhold small/rare cells เมื่อ policy ที่ Owner/privacy รับรองระบุว่าเสี่ยง; ห้ามกำหนดค่า k ใน HN-C1 | OPEN; ไม่มี numeric threshold |
| Complementary/secondary suppression | ต้องปิด P/C/N หรือ child อื่นใดร่วมกันเพื่อกัน arithmetic reconstruction | คำนวณ disclosure risk บน output vector ทั้งชุด; อย่าปล่อยค่าอื่นที่ทำให้ย้อนกลับ cell ที่ปิดได้ | OPEN; ไม่มี accepted algorithm |
| Cross-request differencing | overlapping dates, child selections, filters, As-of, refresh และประวัติคำตอบ | พิจารณา release ledger/query governance หรือวิธี privacy อื่นที่ได้รับอนุมัติ; rate limit เพียงอย่างเดียวไม่พอ | OPEN; ไม่มี budget/cadence/algorithm |
| Allowed dimensions/breakdowns | P/C/N, child, time window, metric, classification, status และการผสมมิติใดเปิดได้ | อนุญาตเฉพาะมิติที่ทดสอบการรวม/ผลต่างครบ; default ปิด dimension combination ที่ยังไม่ประเมิน | OPEN; ไม่มี permitted-dimension list |

ยังไม่มี numeric minimum threshold, suppression algorithm, differential-privacy budget, permitted disclosure dimensions, refresh frequency หรือ acceptable privacy-risk threshold ที่อนุมัติแล้ว. การผ่าน `count >= k` ต่อ cell เพียงอย่างเดียวไม่ปิด complementary, overlap, cross-metric, repeated-query หรือ historical differencing.

**Release boundary:** จนกว่า HN-M07 จะมี model ที่ Owner/privacy authority อนุมัติและผ่าน adversarial tests ได้ ให้งดค่าจริงของ Network aggregate ที่ได้รับผลทั้งหมด. Directory องค์กรอาจพิจารณาแยกภายใต้ D02 แต่ห้ามใช้เป็นช่องทางอนุมานจำนวนผู้ป่วย/cohort หรือใช้ร่วมกับ aggregate ที่ถูก withheld.

## 6. Disclosure, failure, cache และ audit contract (ข้อเสนอ)

### 6.1 Internal outcome candidates

สถานะต่อไปนี้เป็นชื่อเชิงแนวคิด ไม่ใช่ DTO/API ที่อนุมัติ:

| Candidate outcome | ความหมายที่ต้องแยก | ตัวเลข/การจัดการ |
| --- | --- | --- |
| `AVAILABLE` | actor/scope/source/temporal/privacy checks ผ่าน และผลเป็นข้อมูลสมบูรณ์ที่เปิดได้ | Factual zero ใช้ได้เฉพาะเมื่อ query ที่ได้รับอนุญาตยืนยันจำนวนเป็นศูนย์จริง; ห้ามใช้แทน blocked/unknown |
| `DENIED` | actor, capability, Parent/child target หรือ current authorization ไม่ผ่าน | ไม่มีค่า aggregate |
| `TEMPORAL_UNPROVEN` | ไม่มี provenance พอพิสูจน์ว่า source contribution อยู่ใน disclosure boundary ที่อนุมัติ | Withhold; ห้ามคืน 0 หรือ partial total ที่ทำให้เข้าใจว่า complete |
| `PRIVACY_WITHHELD` | ผลมีความเสี่ยงตาม accepted privacy policy หรือปิดค่าเพื่อกัน inference | Withhold; ห้ามให้ suppressed value/log/cache |
| `SOURCE_UNAVAILABLE` | database/source/policy dependency ล้มเหลวหรืออ่านสถานะ authoritative ไม่ครบ | Unavailable; ห้าม fallback เป็นค่าเดิมหรือ 0 |

กรณี **ไม่มี eligible contributor** แยกจาก factual zero: เช่น C ว่างเพราะไม่มี ACTIVE direct child ไม่ได้หมายความว่ามี Hospital หลายแห่งที่แต่ละแห่ง contribution=0. ภายในอาจใช้ detail code `NO_ELIGIBLE_CONTRIBUTOR` ภายใต้ contract ที่อนุมัติ; ไม่สร้าง Hospital zero row และ client ไม่ควรเห็นจำนวน/สถานะที่เพิ่ม existence oracle. Suppressed, temporal-unproven, unauthorized, no-contributor และ source failure ต้องไม่ถูกรวมเป็นสถานะ numeric เดียวกัน.

### 6.2 Client-visible disclosure

**Safety proposal:** ทุก non-numeric unavailable/denied state แสดงข้อความทั่วไป เช่น “ขณะนี้ไม่สามารถแสดงข้อมูลสรุปนี้ได้” โดยไม่คืน count, threshold, suppressed value, child/cohort existence, SQL/error reason หรือ temporal provenance. ห้ามบอก “0” เมื่อ state ไม่ใช่ `AVAILABLE` factual zero. แยกข้อความเฉพาะสิทธิ์ได้ก็ต่อเมื่อ security/privacy review ยืนยันว่าไม่สร้าง existence oracle. รายละเอียดภายในยังคงแยก candidate outcomes ข้างต้นเพื่อการปฏิบัติการและ audit.

### 6.3 Cache, authorization และ revocation

- ก่อนปิด release gates ให้ถือว่าไม่มี real aggregate cache; ห้าม shared/public/CDN cache สำหรับ Network report.
- หากภายหลังอนุมัติ cache ต้องเป็น private ต่อผู้ใช้และ authorization scope; cache key ต้อง bind capability, Parent, child set/scope, time inputs/As-of และ contract/policy version ตาม design ที่รับรอง.
- ทุก request ต้อง reauthorize current User/role/membership/Hospital/parentage ก่อนคืน cached result; stale cached authorization ห้ามใช้เป็น grant.
- ต้องระบุ TTL, invalidation เมื่อ suspend/demote/reparent/source update, consistency window, race behavior และการป้องกัน cross-user key collision ก่อนใช้งาน; ยังไม่มีค่าที่อนุมัติ.
- การ revoke สิทธิ์หยุดการส่งคำตอบใหม่ได้ตาม consistency contract แต่ไม่สามารถเรียกคืนข้อมูลที่แสดงไปแล้ว, screenshot หรือสำเนาที่ผู้ใช้บันทึกเอง.

### 6.4 Audit ที่ลดข้อมูลอ่อนไหว

**Proposal for review:** หากมี audit ให้เก็บเฉพาะ metadata ขั้นต่ำที่ security/privacy policy อนุมัติ เช่น request/correlation ID, actor reference, capability, target Parent/child reference, เวลา, policy/version และ outcome category. ไม่บันทึก Patient/Profile/relationship IDs, national IDs, suppressed/factual values, clinical detail, SQL, raw filter/source query payload หรือ response body. Retention, purpose, access to logs และการเก็บ failed/denied requests เป็น OPEN (HN-C1-D09); ห้ามอ้างว่ามี retention policy ใหม่จากเอกสารนี้.

### 6.5 Export boundary

HN-M08 Network Export ยังคง **DEFERRED / NOT AUTHORIZED**: CSV, Excel, PDF, bulk API download, patient roster และ endpoint สำหรับ export เฉพาะ ถูกห้ามรวมใน C1–C3. On-screen aggregate approval ในอนาคตจะไม่ grant export. การเปลี่ยนขอบเขตต้องมี requirement/approval แยกและ contract ใหม่.

## 7. Source predicate และการแยก reporting semantics

คำนิยามต่อไปนี้สืบทอดตาม HN-C0 เท่านั้น ไม่เพิ่ม metric ใหม่. การเขียน query ต้องใช้ source predicates ตรงตาม accepted definition; ห้าม reconstruct state ย้อนหลังจากข้อมูล current ที่ไม่เก็บ history.

| ID / time basis | Definition ที่สืบทอดจาก HN-C0 | Security/source predicate และข้อจำกัด |
| --- | --- | --- |
| **HN-M01 — CURRENT_SNAPSHOT** | `patientUniquePatients = COUNT(DISTINCT PatientHospitalRelationship.patientProfileId)`; `patientRelationshipCount = COUNT(PatientHospitalRelationship.id)` | จำกัด relationship rows ด้วย exact eligible Hospital scope ก่อนนับ; relationship ไม่พิสูจน์ clinical visit/treatment; ห้ามคืน Patient row. |
| **HN-M02 — CURRENT_SNAPSHOT** | ใช้ current profile-global `PatientClassification` เฉพาะ `RISK`/`DIABETES`; นับ `riskUniquePatients`, `riskRelationships`, `diabetesUniquePatients`, `diabetesRelationships` | Join กับ in-scope PatientHospitalRelationship ก่อน deduplicate profile. ไม่มี classification row ยังคงนับใน overall HN-M01 แต่ไม่เข้า classification-specific counts; ไม่มี classification ที่สาม. RISK ไม่ใช่ Pre-DM diagnosis ที่ยืนยันอย่างเป็นทางการ และ DIABETES ไม่ใช่ diagnosis ที่ยืนยันแยกโดยอิสระ. ห้ามเปิด cross-Hospital profile visibility. |
| **HN-M03 — CURRENT_SNAPSHOT** | `staffUniqueUsers` = distinct `HospitalMembership.userId`; `staffActiveRelationships` = eligible ACTIVE memberships; `osmUniqueUsers` = distinct `OsmHospitalRelationship.userId`; `osmActiveRelationships` = eligible ACTIVE OSM-Hospital relationships | **Exact role/account-status/OWNER-vs-MEMBER/inconsistent-state eligibility predicates ยังคง OPEN_BLOCKER.** ห้ามเดา/implement จน formalize; Staff และ OSM อาจเป็น User เดียวกัน จึงห้ามรวม distinct populations. |
| **HN-M04 — PERIOD_BASED** | `programUniqueParticipants` = distinct PatientProfile ผ่าน exact PatientHospitalRelationship; `programEpisodeCount` = eligible PatientProgram IDs. รวม ACTIVE/COMPLETED ที่ lifecycle overlap กับ period. | ใช้ HN-M06 interval; completion endpoint exclusive. `startedAt === completedAt` ตัดออกจาก M04 เท่านั้น; ห้าม delete/repair/backfill. Program participation ไม่ใช่ success/outcome/clinical result. |
| **HN-M05 — PERIOD_BASED** | `followupUniquePatients` = distinct PatientProfile; `followupRecordCount` = eligible PatientFollowup IDs; ต้องมี `patientProgramId IS NOT NULL` และ `recordedAt` อยู่ใน period. | ตรวจ exact composite Program/relationship consistency; NULL-linked historical Follow-up ไม่รวมและไม่ backfill. ไม่ต้องอยู่ใน M04 selected Program overlap population; M05 ไม่ใช่ subset ของ M04. `recordedAt` คือ application record time ไม่ใช่ clinical observation time. |
| **HN-M06 — mixed time contract** | M01–M03 เป็น current snapshot; M04–M05 เป็น period-based; เปลี่ยน selected period ไม่ re-filter snapshot. | คงข้อย่อย T01–T09 ตาม §7.1. Current-state mutable fields ไม่ได้กลายเป็น historical-as-of semantics. |

### 7.1 HN-M06 time subdecisions — คงตาม HN-C0

| ID | กฎที่ต้องรักษา |
| --- | --- |
| HN-M06-T01 | Program lifecycle ต้อง overlap กับ selected period. |
| HN-M06-T02 | Program-linked Follow-up ใช้ `recordedAt` ที่อยู่ใน selected period. |
| HN-M06-T03 | Business reporting timezone คือ `Asia/Bangkok`. |
| HN-M06-T04 | เลือก local Start/End dates แบบ inclusive; แปลงเป็น absolute half-open interval `[startInclusive, nextDay(end))`. |
| HN-M06-T05 | Default คือ current Bangkok calendar Month-to-Date. |
| HN-M06-T06 | สูงสุด 12 calendar months ต่อ request. |
| HN-M06-T06-S01 | Rolling 12 calendar months anchor ที่ selected local start date; ไม่ใช่ fixed 365 วันหรือจำนวน calendar buckets ที่แตะ. |
| HN-M06-T06-S02 | Start Feb 29 ใน leap year: anniversary end-exclusive ในปีที่ไม่ leap คือ Mar 1 จึงรวม Feb 28 ได้. |
| HN-M06-T07 | ปฏิเสธ End Date หลัง current Bangkok calendar date. |
| HN-M06-T08 | ใช้ authoritative server As-of instant เดียวต่อ request; source timestamps หลัง As-of ไม่ถูกนับ. นี่ไม่ใช่ consistent database snapshot. |
| HN-M06-T09 | Program `completedAt` เป็น exclusive; completion ตรง period start ไม่ overlap. |
| HN-M06-T09-S01 | Program zero-duration ถูกตัดออกจาก HN-M04 overlap metrics เท่านั้น โดยไม่ mutate persisted record. |

ไม่มี historical classification/membership/hierarchy reconstruction ที่อนุมัติ. HN-C1-D10/D11 ต้องปิด exact source eligibility ของ HN-M03 และ DB read-consistency/mutable-state As-of design ก่อน HN-C2.

## 8. Adversarial test matrix — design-only

รายการต่อไปนี้เป็น acceptance-design เท่านั้น. ไม่ได้ execute และไม่มีผล PASS ใน HN-C1. Expected result ของ privacy/history/source-eligibility cases ที่รอ Owner/security decisions ให้คง `CONDITIONAL/OPEN`.

| Test ID | Fixture / attack | Expected decision | Requirement |
| --- | --- | --- | --- |
| AUTH-01 | ACTIVE User + HOSPITAL role + ACTIVE direct OWNER membership ใน ACTIVE Parent | ผ่าน authorization scope; aggregate ยัง withheld จน privacy/history gates ผ่าน | HN-A01, D01 |
| AUTH-02 | Parent MEMBER-only | DENIED | HN-A01 |
| AUTH-03 | OWNER อยู่เฉพาะ Child | DENIED ต่อ Parent scope | HN-A01 |
| AUTH-04 | ADMIN-only | DENIED; ADMIN ไม่ใช่ bypass | HN-A01, ADR-0002 |
| AUTH-05 | OSM-only | DENIED | HN-A01 |
| AUTH-06 | PATIENT-only | DENIED | HN-A01 |
| AUTH-07 | HOSPITAL+OWNER exact Parent พร้อม OSM/PATIENT role เพิ่ม | ผ่านได้จาก exact OWNER เท่านั้น; roles เพิ่มไม่เปลี่ยน scope | HN-A01 |
| AUTH-08 | ADMIN+HOSPITAL แต่ไม่มี exact Parent OWNER | DENIED | HN-A01 |
| AUTH-09 | User PROVISIONED/INVITED/SUSPENDED หรือไม่ ACTIVE | DENIED | HN-A01 |
| AUTH-10 | OWNER membership suspended, revoked, demoted เป็น MEMBER หรือ stale | DENIED เมื่อ current state ถูกอ่าน; stale-cache/race ต้อง fail closed | HN-A01, D11 |
| AUTH-11 | Parent ไม่ ACTIVE | DENIED; ห้ามคืนสถิติ 0 | HN-A01/A04 |
| AUTH-12 | ActorContext เก่าขัดกับ User/role/membership ที่ DB ปัจจุบัน | re-read/revalidation ต้องปฏิเสธ | HN-A01, ADR-0002 |
| AUTH-13 | Demotion/suspension แข่งกับ reporting read | abort/deny/unavailable ตาม concurrency rule ที่ยังต้องตัดสิน; ห้ามอ้างว่ารับประกันอยู่แล้ว | D11, OPEN |
| HIER-01 | ACTIVE direct child ที่ `child.parentHospitalId === parent.id` | เข้า C หลัง temporal/privacy gates เท่านั้น | HN-A02/A04 |
| HIER-02 | Grandchild ที่ parent ของตนเองเป็น child | DENIED/excluded; ไม่มี recursive traversal | HN-A02 |
| HIER-03 | Sibling ของ target child | DENIED/excluded จาก child-summary | HN-A02/A06 |
| HIER-04 | Unrelated Hospital | DENIED/excluded | HN-A02 |
| HIER-05 | forged client Hospital ID ของ child อื่น/Parent อื่น | server resolve exact relationship; DENIED เมื่อไม่ตรง | ADR-0002, D01 |
| HIER-06 | direct child SUSPENDED/PENDING_VERIFICATION | อาจอยู่ directory ตาม D02; ไม่ contributor, ไม่ zero-contribution row | HN-A04 |
| HIER-07 | reparent พร้อมกับ resolver/query | ต้อง fail closed ตาม approved snapshot/serialization policy; ปัจจุบัน CONDITIONAL/OPEN | HN-A05, D03/D11 |
| TEMP-01 | cohort/source เกิดก่อน child ย้ายจาก Parent A ไป B | A เสีย current scope; B ไม่ได้ย้อนหลัง; withhold หากไม่มี provenance ที่พิสูจน์ได้ | HN-A05, D03/D04 |
| TEMP-02 | contribution ที่พิสูจน์ได้ว่าอยู่หลัง cutover | eligibility เป็น CONDITIONAL จนเลือก/อนุมัติ A/B/C และ source rule | D03/D04 |
| TEMP-03 | Program เริ่มก่อน transfer และจบหลัง transfer | ไม่กำหนด attribution เอง; withhold เมื่อ episode eligibility แบ่งพิสูจน์ไม่ได้ | HN-M04/A05, D04 |
| TEMP-04 | Program-linked Follow-up `recordedAt` ก่อน/หลัง transfer | recording time ไม่พิสูจน์ hierarchy authority; withhold ตาม source attribution gate | HN-M05/A05, D04 |
| TEMP-05 | CURRENT_SNAPSHOT มี Patient/relationship/classification ก่อน reparent | current pointer ไม่พอ; withhold หากประวัติ/ขอบเขตปนกันพิสูจน์ไม่ได้ | HN-M01/M02/A05, D03 |
| TEMP-06 | no-reparent history ไม่มี หรือ provenance ขัดแย้ง/หาย | ห้ามอนุมาน no-reparent/zero; TEMPORAL_UNPROVEN | HN-A05, D03 |
| PRIV-01 | small cell หรือ rare cohort | ค่า real aggregate withheld จน policy ที่อนุมัติระบุ expected result | HN-M07 |
| PRIV-02 | ปิด cell C แต่เปิด P/N ซึ่งหักลบกลับได้ | ปิด complementary outputs ตาม algorithm ที่ต้องอนุมัติ; ปัจจุบัน OPEN | HN-M07 |
| PRIV-03 | P, N และ sibling-child outputs ใช้หา child ที่ withheld | ต้องกัน cross-child subtraction; outcome CONDITIONAL/OPEN | HN-M07 |
| PRIV-04 | `N.unique - P.unique` เทียบกับ C.unique | ยืนยัน N distinct set ใหม่; แม้ไม่เท่ากับ C อาจเปิดจำนวน C-only identities; ต้องปิดค่าที่เสี่ยง | HN-A03/M07 |
| PRIV-05 | relationship count กับ distinct Patient count | ทดสอบ overlap/multiplicity inference; ห้ามบวก unique counts | HN-M01/M07 |
| PRIV-06 | total เทียบ RISK/DIABETES หรือ metric อื่น | ทดสอบ rare-class และ cross-metric inference; outcome OPEN | HN-M02/M07 |
| PRIV-07 | Program episode/participant เทียบ Follow-up count/unique | ทดสอบ comparison โดยไม่สมมติ M05 subset M04; outcome OPEN | HN-M04/M05/M07 |
| PRIV-08 | repeated overlapping date ranges | cross-request differencing ต้องไม่เปิด withheld cell; algorithm OPEN | HN-M07 |
| PRIV-09 | MTD refresh successive dates | test release history/cadence; current expected release OPEN | HN-M06-T05/M07 |
| PRIV-10 | same range, different As-of instants | test lifecycle/source-state differencing; expected policy OPEN | HN-M06-T08/M07/D11 |
| PRIV-11 | status/error/empty/zero แตกต่างจนเป็น existence oracle | client ได้ safe non-numeric response; internal states ไม่ถูกยุบเป็น zero | §6, HN-M07 |
| PRIV-12 | cache หลัง revoke/suspend/reparent หรือ cache key ข้าม actor | reauthorize; no shared stale response; invalidation/race test ตาม approved policy | §6, D08/D11 |
| ISO-01 | inspect result fields for Patient rows/IDs/national IDs | ไม่มี row-level/identifier output | HN-A03/A06 |
| ISO-02 | request clinical detail หรือ exact Patient record | DENIED; Network hierarchy ไม่ใช่ clinical authorization | ADR-0002, HN-A01 |
| ISO-03 | ใช้ `report:program:read` เพื่อขยายเป็น Network | ยังคง exact Program/relationship; DENIED ต่อ Network aggregate | 15E.1, HN-A03 |
| ISO-04 | CSV/Excel/PDF/bulk API/patient roster request | NOT AUTHORIZED; ไม่มี export path | HN-M08 |
| ISO-05 | Parent Owner แก้ child workforce/OSM membership | DENIED; ไม่มี mutation capability | HN-A06, OWNER-01 |
| CONS-01 | Patient เดียวมี relationships ที่ Parent และหลาย Children | unique แยกคำนวณ P/C/N; N dedup ทั้ง union | HN-M01/A03 |
| CONS-02 | User เดียวมี Staff และ OSM relationships | นับคนละ metric; ห้ามรวมเป็น unique workforce เดียว | HN-M03 |
| CONS-03 | joins ซ้ำ/fan-out หลาย Programs/Follow-ups | record grain ไม่ถูกคูณ; unique ใช้ DISTINCT ที่ถูก scope | HN-M01–M05 |
| CONS-04 | User/membership/Hospital/child status เปลี่ยนระหว่าง reads | consistency contract ต้องให้ abort/consistent result ตามแบบที่อนุมัติ; ปัจจุบัน OPEN | D11 |
| CONS-05 | As-of instant เดียวแต่ query เห็น DB states คนละ snapshot | test ว่าไม่มีการอ้าง snapshot consistency เทียม; design gate OPEN | HN-M06-T08/D11 |
| TIME-01 | Bangkok local inclusive dates แปลงเป็น absolute half-open interval | start รวม/end-exclusive ถูกต้องตาม Asia/Bangkok | HN-M06-T03/T04 |
| TIME-02 | MTD, rolling 12 calendar months, Feb 29 anniversary | ตรง T05/T06/T06-S01/S02; ไม่มี fixed 365-day assumption | HN-M06 |
| TIME-03 | Future End Date | ปฏิเสธตาม Bangkok calendar date | HN-M06-T07 |
| TIME-04 | Program completedAt ตรง period start; zero-duration episode | ไม่ overlap; zero duration ตัดจาก M04 เท่านั้น ไม่ mutate | HN-M06-T09/S01 |
| TIME-05 | Follow-up `recordedAt` หลัง As-of หรือ NULL Program link | หลัง As-of ไม่รวม; NULL link ไม่รวม; ห้ามใช้ clinical-observation semantics | HN-M05/M06-T02/T08 |

## 9. Open decision & release gate register

รายการนี้เป็น stable IDs สำหรับปิด requirement เท่านั้น ไม่ใช่คำตอบแทน Owner. `Proposed safety boundary` ทุกข้อเป็น proposal จนกว่าจะมี decision record/authority ระบุชัด.

### HN-C1-D01 — Network capability/policy

- **คำถาม:** อนุมัติ candidate capabilities ทั้งสามหรือไม่ และ actor/scope/operation ใดบ้าง?
- **สถานะ:** PROPOSED / OPEN DECISION.
- **หลักฐาน:** HN-A01–A06 `OWNER_RECEIVED`; ADR-0002 กำหนด Role + Capability + Scope แต่ยังไม่มี Network capability.
- **ทางเลือก:** อนุมัติแยกตาม purpose; ปรับชื่อ/scope; ไม่เปิดบาง capability; หรือไม่อนุมัติ.
- **ขอบเขตปลอดภัยที่เสนอ:** exact active Parent HOSPITAL OWNER เท่านั้น; hierarchy aggregate ไม่ให้ clinical/row/mutation/export access.
- **ผู้มีอำนาจตัดสิน:** Product Owner และ security decision authority ที่ได้รับมอบหมาย; identity/sign-off ยังไม่ทราบ.
- **ผล implementation:** policy, target resolver, request checks และ allow/deny tests.
- **ผล release:** ไม่ปิด D01 = ไม่มี Network feature/exposure.

### HN-C1-D02 — Minimal directory fields

- **คำถาม:** Directory เปิดเผย fields ใดให้ Parent Owner และจำเป็นต้องมี `hospitalCode` นอกเหนือจาก opaque ID/name/status หรือไม่?
- **สถานะ:** OPEN DECISION.
- **หลักฐาน:** HN-A04 ยอมรับ organizational directory สถานะ PENDING_VERIFICATION/ACTIVE/SUSPENDED; current governance directory เป็น Platform ADMIN feature ไม่ใช่หลักฐาน Parent Owner access.
- **ทางเลือก:** allowlist ขั้นต่ำ (เสนอ opaque hospital ID, name, status); เพิ่ม code เมื่อยืนยัน use case; หรือไม่เปิด directory.
- **ขอบเขตปลอดภัยที่เสนอ:** ไม่แสดง contact, staff/Owner, patient/cohort metrics หรือ clinical data; Child metadata ไม่ให้ child access.
- **ผู้มีอำนาจตัดสิน:** Product Owner + security/privacy authority.
- **ผล implementation:** projection allowlist, lifecycle behavior, UX/error tests.
- **ผล release:** หากยังไม่ปิด อาจพิจารณา directory แยกจาก aggregates ได้ต่อเมื่อ review แล้ว; ห้ามเปิด aggregate ผ่าน directory.

### HN-C1-D03 — Historical reparent disclosure authority/source

- **คำถาม:** เลือก A/B/C ใน §4.3 หรือแนวทางอื่นใด พร้อมหลักฐานที่กำหนด authority ต่อ pre-reparent contribution อย่างไร?
- **สถานะ:** RELEASE-CRITICAL OPEN_BLOCKER.
- **หลักฐาน:** HN-A05; schema มี current `parentHospitalId/updatedAt` แต่ไม่มี effective-dated hierarchy history.
- **ทางเลือก:** A withhold; B approved effective-dated/provenance source; C approved prospective cutover พร้อมจัดการ snapshot เดิม.
- **ขอบเขตปลอดภัยที่เสนอ:** fail closed; current membership ไม่ grant historical disclosure.
- **ผู้มีอำนาจตัดสิน:** Product Owner และ security/privacy decision authority; architecture/data owner ต้องรับรอง source design หากเลือก B/C.
- **ผล implementation:** อาจต้องมีแหล่งข้อมูล/contract แยก; HN-C1 ไม่สร้าง schema, history, migration หรือ backfill.
- **ผล release:** ไม่ปิดพร้อมหลักฐาน = HN-C2 BLOCKED, affected real aggregates withheld.

### HN-C1-D04 — Temporal attribution ต่อ metrics

- **คำถาม:** จะจัด contribution ของ M01–M05 อย่างไรเมื่อ hierarchy เปลี่ยน, history ปนกัน, Program ข้ามช่วง หรือ Follow-up อยู่ก่อน/หลัง transfer?
- **สถานะ:** RELEASE-CRITICAL OPEN_BLOCKER.
- **หลักฐาน:** HN-M01–M06 definitions; 15B.0/15C.1 source timestamps; ไม่มี hierarchy temporal source.
- **ทางเลือก:** ตาม provenance ที่ D03 เลือก; withhold ทั้ง scope เมื่อแบ่งแยกไม่ได้; cutover rule ที่อนุมัติอย่างอิสระ.
- **ขอบเขตปลอดภัยที่เสนอ:** ไม่แปล createdAt/updatedAt/recordedAt เป็น effective parent date.
- **ผู้มีอำนาจตัดสิน:** Product Owner + domain/security/privacy authority ตาม source.
- **ผล implementation:** per-metric source eligibility predicates และ temporal tests.
- **ผล release:** unresolved attribution = no numeric affected aggregate.

### HN-C1-D05 — Primary small-cell rule

- **คำถาม:** นิยามกลุ่มเล็ก/rare cell อย่างไรต่อ metric/grain และค่า 0/1?
- **สถานะ:** HN-M07 OPEN_BLOCKER.
- **หลักฐาน:** 15E.0 cohort/reporting review; HN-C0; ยังไม่มี accepted threshold.
- **ทางเลือก:** threshold/policy ที่ Owner/privacy กำหนด, model อื่นที่ประเมินความเสี่ยง หรือ withhold aggregates.
- **ขอบเขตปลอดภัยที่เสนอ:** อย่าคิดค่า k เอง; until accepted, withhold affected real counts.
- **ผู้มีอำนาจตัดสิน:** Product Owner + privacy/security authority และผู้ควบคุมข้อมูลตาม governance ที่กำหนด.
- **ผล implementation:** suppression evaluator และ tests ที่ใช้ approved threshold/policy.
- **ผล release:** ไม่ปิด/ไม่ทดสอบ = no affected aggregate exposure.

### HN-C1-D06 — Complementary/secondary suppression

- **คำถาม:** ต้องปิด output ใดร่วมกันระหว่าง P/C/N/children/metrics เพื่อกันคำนวณย้อน?
- **สถานะ:** HN-M07 OPEN_BLOCKER.
- **หลักฐาน:** HN-A03 unique sets และ HN-C0 small-cell/complementary threat.
- **ทางเลือก:** algorithm ที่ทดสอบ arithmetic closure, release only coarser totals, หรือ withhold.
- **ขอบเขตปลอดภัยที่เสนอ:** ประเมิน output vector ร่วมกัน ไม่ตัดสินทีละ cell.
- **ผู้มีอำนาจตัดสิน:** Product Owner + privacy/security authority.
- **ผล implementation:** joint suppression logic และ cross-output fixtures.
- **ผล release:** ไม่ปิด = P/C/N/child outputs ที่ประกอบกันได้ยัง withheld.

### HN-C1-D07 — Cross-request differencing และ permitted dimensions

- **คำถาม:** อนุญาต date windows, MTD refresh, As-of variants, child breakdown และ metric combinations ใด; ป้องกัน release history อย่างไร?
- **สถานะ:** HN-M07 OPEN_BLOCKER.
- **หลักฐาน:** HN-M06 time semantics; HN-M07 repeated-query/As-of threat.
- **ทางเลือก:** query governance/release ledger, bounded approved dimensions/cadence, privacy model ที่ได้รับอนุมัติ หรือ no repeated real releases; ไม่มีตัวเลือกใดถูกเลือก.
- **ขอบเขตปลอดภัยที่เสนอ:** rate limiting อย่างเดียวไม่พอ; block combinations ที่ยังประเมินไม่ได้.
- **ผู้มีอำนาจตัดสิน:** Product Owner + privacy/security authority.
- **ผล implementation:** request history/policy, range canonicalization และ differencing tests ตาม decision.
- **ผล release:** ไม่มี cross-request policy = no real aggregate release.

### HN-C1-D08 — Failure/disclosure/cache behavior

- **คำถาม:** ยืนยัน internal state mapping, client messages, private-cache policy, reauthorization และ revocation behavior อย่างไร?
- **สถานะ:** PROPOSED / OPEN DECISION.
- **หลักฐาน:** ADR-0002 fail-closed; HN-C0 ห้ามแทน unavailable/suppressed ด้วย zero; 15E.0 missing/report contracts.
- **ทางเลือก:** ข้อเสนอ §6 หรือ policy ที่ผ่าน security review.
- **ขอบเขตปลอดภัยที่เสนอ:** แยก internal outcomes; client generic non-numeric unavailable; ไม่ใช้ shared cache; reauthorize ทุก request.
- **ผู้มีอำนาจตัดสิน:** Product Owner + security/privacy authority; architecture/runtime owner ยืนยัน consistency.
- **ผล implementation:** sanitized response, cache isolation/invalidation และ response-oracle tests.
- **ผล release:** unresolved mapping/cache race blocks affected serving.

### HN-C1-D09 — Audit และ retention

- **คำถาม:** ต้อง audit report view/deny/withhold ใด เก็บ metadata และ logs นานเท่าใด ใครเข้าถึงได้?
- **สถานะ:** OPEN DECISION.
- **หลักฐาน:** 15E.0 ระบุ access logging/retention ต้องตัดสิน; ไม่มี Network report audit contract.
- **ทางเลือก:** minimum metadata ตาม §6.4; event classes/retention แยกตาม policy; หรือ audit อื่นที่ลดข้อมูล.
- **ขอบเขตปลอดภัยที่เสนอ:** ไม่ log patient IDs, national IDs, suppressed values, clinical/source query payload.
- **ผู้มีอำนาจตัดสิน:** security/privacy authority + Product Owner/data controller ตาม governance ที่ระบุ.
- **ผล implementation:** audit event schema, access control, retention/deletion และ log tests; ห้ามทำใน HN-C1.
- **ผล release:** ถ้า audit เป็น prerequisite ตาม policy และยังไม่ปิด ห้ามเปิดใช้งานจริง.

### HN-C1-D10 — HN-M03 exact eligibility

- **คำถาม:** `HospitalMembership`/OSM relationship ที่ eligible ต้องผูกกับ Role ใด, User status ใด, OWNER/MEMBER แบบใด และจัด inconsistent states อย่างไร?
- **สถานะ:** OPEN_BLOCKER.
- **หลักฐาน:** HN-M03 accepted metric concepts; schema แยก Role, Membership type/status, User status และ OSM-Hospital status.
- **ทางเลือก:** ต้องยืนยัน predicates ต่อ domain; ห้ามยืม authorization predicate ของ Owner reporting มาเป็น workforce denominator โดยอัตโนมัติ.
- **ขอบเขตปลอดภัยที่เสนอ:** ยังไม่คืน M03 values จน predicate ครบ.
- **ผู้มีอำนาจตัดสิน:** Product Owner + workforce/domain authority + security.
- **ผล implementation:** exact database WHERE clauses, current-state rules และ combination tests.
- **ผล release:** M03 blocked; dependent summary ต้องแสดง unavailable หรือถูก withheld ตาม approved contract.

### HN-C1-D11 — As-of และ database read consistency

- **คำถาม:** จะได้ authoritative, coherent source read อย่างไรเมื่อ authorization, parentage, statuses, snapshot rows และ multi-query metrics เปลี่ยนพร้อมกัน?
- **สถานะ:** OPEN_BLOCKER.
- **หลักฐาน:** HN-M06-T08 ให้ server As-of หนึ่งค่า แต่ HN-C0 ชี้ชัดว่าไม่เท่ากับ DB snapshot; actor resolver/policies/query ปัจจุบันเป็นแยกขั้น.
- **ทางเลือก:** transaction/snapshot design ที่ verified, single-query projection หรือวิธีอื่นหลัง engineering/security review; ไม่มีการเลือก isolation level ใน HN-C1.
- **ขอบเขตปลอดภัยที่เสนอ:** ถ้า policy/scope/source state อ่านไม่ครบหรือขัดกัน ให้ abort/fail closed; อย่าอ้าง consistent snapshot จาก clock cutoff.
- **ผู้มีอำนาจตัดสิน:** architecture/database/security authority ร่วมกับ Product Owner สำหรับ acceptable behavior.
- **ผล implementation:** isolation/locking/version contracts, retry rules และ concurrent transition tests.
- **ผล release:** unresolved state consistency = HN-C2 blocked.

### HN-C1-D12 — HN-M08 Network Export

- **คำถาม:** มี authorization ใหม่ให้เริ่ม export หรือไม่?
- **สถานะ:** DEFERRED / NOT AUTHORIZED ตาม HN-C0; ไม่มีคำตอบใหม่ใน HN-C1.
- **หลักฐาน:** HN-M08 register, ADR/reporting precedent ที่แยก export permission.
- **ทางเลือก:** คง deferral; การเปิดในอนาคตต้องเป็น separate Owner decision/authorization และ contract.
- **ขอบเขตปลอดภัยที่เสนอ:** ไม่มี CSV/Excel/PDF/bulk API/patient roster.
- **ผู้มีอำนาจตัดสิน:** Product Owner + security/privacy authority หากมีคำขอใหม่.
- **ผล implementation:** ไม่มี export path ใน HN-C1/C2/C3 ตาม scope ปัจจุบัน.
- **ผล release:** export ยังคงปิด.

### HN-C1-D13 — OWNER-01 / AREA-01 separation

- **คำถาม:** workforce editing หรือ Responsibility Area requirements จะปิดเมื่อใดและด้วย decision pack/authorization ใด?
- **สถานะ:** OPEN / REQUIREMENT-GATED; ไม่ใช่ HN-C1 decision.
- **หลักฐาน:** HN-C0 และ Phase 17K.0 pack; [UAT Backlog](./PHASE_17_UAT_BACKLOG.md).
- **ทางเลือก:** ดำเนิน decision closure แยกตาม original scope; ห้ามใช้ HN hierarchy acceptance แทน.
- **ขอบเขตปลอดภัยที่เสนอ:** HN permission ไม่ทำให้ Parent Owner แก้ child workforce หรือ Area; ไม่สร้าง Area/geography model.
- **ผู้มีอำนาจตัดสิน:** requirement authority ของ OWNER-01/AREA-01; identity ไม่ระบุใน repository.
- **ผล implementation:** แยก requirement/ADR/contract/test gates.
- **ผล release:** remain independently gated; K-Q identities/statuses unchanged.

## 10. Exit criteria

### HN-C1 Documentation Prepared

ถือว่าเอกสารพร้อมได้เมื่อครบทั้งหมด:

- contract ระบุ scope, capability candidates, server boundary, temporal/privacy threats, outcomes, audit/cache, predicates, adversarial tests และ release register;
- traceability แยก HN-C0 owner-received semantics, accepted architecture, current implementation, proposal และ blockers;
- HN-M07/history blockers และทางเลือกยังมองเห็นชัดโดยไม่มีค่า/algorithm/effective date สมมติ;
- K-Q01–K-Q25, OWNER-01, AREA-01, HN-M01–M06/time และ HN-M08 สอดคล้องกับเอกสารอ้างอิง;
- ไม่มีการแก้ accepted ADR เพื่อบันทึก proposal;
- มี current-status link ใน CONTEXT และ backlog;
- documentation-only diff, links, UTF-8/Thai และสถานะ Git ผ่านการตรวจ.

### HN-C1 Security Contract Accepted

**ยังห้าม claim** จน decision authorities รับรองและมี decision evidence สำหรับอย่างน้อย:

1. Network capability/policy design (D01), รวม field allowlist ของ directory (D02)
2. historical reparent disclosure authority/provenance และ source attribution (D03/D04)
3. HN-M07 primary/complementary/cross-request protections และ permitted dimensions (D05–D07)
4. failure/disclosure/cache/revocation behavior ที่ทดสอบได้ (D08)
5. audit/retention policy เมื่อเป็นเงื่อนไขของ governance (D09)
6. exact HN-M03 eligibility predicates (D10)
7. As-of/database snapshot/concurrent transition consistency contract (D11)

การรับรองเอกสารไม่อนุมัติ HN-C2 implementation, schema/migration, deployment หรือ data exposure. HN-C2 ต้องมี implementation authorization แยกและทุก release blocker ที่เกี่ยวข้องต้องปิดก่อน. HN-C3 และ Phase 17K.1–17K.3 ไม่ได้รับอนุญาตจากเอกสารนี้. Phase 17J.5B คง NOT AUTHORIZED / NOT EXECUTED; LINE gates เดิมไม่เปลี่ยน.

## 11. References

### Decisions and architecture

- [HN-C0 Hospital Owner Decision Closeout](./PHASE_17K0B_HN_OWNER_DECISION_CLOSEOUT.md)
- [Phase 17K.0 Hospital Governance / Responsibility Area Decision Pack](./PHASE_17K0_HOSPITAL_GOVERNANCE_RESPONSIBILITY_AREA_DECISION_PACK.md)
- [Phase 17 UAT Backlog](./PHASE_17_UAT_BACKLOG.md)
- [ADR-0002: Role, Capability and Scope Authorization](../adr/0002-role-capability-scope-authorization.md)
- [DEMI Architecture Baseline](../architecture/DEMI_ARCHITECTURE_BASELINE.md)

### Verified implementation and source contracts

- [Prisma schema](../../prisma/schema.prisma)
- [ActorContext service](../../src/modules/auth/services/actor-context-service.ts)
- [Hospital Owner policy](../../src/modules/workforce/policies/hospital-owner-policy.ts)
- [Patient Directory policy](../../src/modules/patient-directory/policies/patient-directory-policy.ts)
- [OSM assignment policy](../../src/modules/patient-assignment/policies/patient-osm-assignment-policy.ts)
- [Hospital governance service](../../src/modules/hospital-governance/services/hospital-governance-service.ts)
- [Program report access service](../../src/modules/reporting/services/program-report-access-service.ts)
- [Program report policy](../../src/modules/reporting/policies/program-report-policy.ts)
- [Phase 15B.0 Program Workflow Foundation](./PHASE_15B0_PROGRAM_WORKFLOW_FOUNDATION.md)
- [Phase 15C.1 Program Linkage & Domain Persistence](./PHASE_15C1_SERVICE_TWO_PROGRAM_LINKAGE_DOMAIN_PERSISTENCE.md)
- [Phase 15E.0 Reporting, Dashboard & Export Contract](./PHASE_15E0_REPORTING_DASHBOARD_EXPORT_CONTRACT_CONSOLIDATION.md)
- [Phase 15E.1 Program Reporting Projection Foundation](./PHASE_15E1_PROGRAM_REPORTING_PROJECTION_FOUNDATION.md)
- [Phase 16D.3 Patient Classification Persistence and History](./PHASE_16D3_PATIENT_CLASSIFICATION_PERSISTENCE_HISTORY_RECONCILIATION.md)
