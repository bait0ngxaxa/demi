# DEMI Phase 17K.0B — HN-C0 Hospital Network Owner Decision Closeout

- **ขอบเขต:** HN-C0 — ปิดข้อกำหนด Hospital Network / Hierarchy และ reporting semantics แบบเอกสารเท่านั้น
- **สถานะ closeout:** DOCUMENTATION CLOSEOUT COMPLETE — บันทึกข้อกำหนดที่ Product Owner รับรองตามข้อมูลในคำสั่งงาน
- **สถานะ implementation:** IMPLEMENTATION_NOT_AUTHORIZED
- **ฐาน repository ที่ตรวจ:** branch **main**, HEAD **c0f7c0a221d9de5cccb39ba3ca69f2642134afe9**, worktree สะอาด, วันที่ 2026-10-10
- **สถานะ HN:** HN-A01–A06 และ HN-M01–M06 ได้รับเป็น OWNER_RECEIVED; HN-M07 และการเปิดเผยข้อมูลย้อนหลังจากการเปลี่ยน Parent เป็น OPEN_BLOCKER; HN-M08 เป็น DEFERRED / NOT AUTHORIZED
- **สถานะส่วนที่ไม่ใช่ HN:** OWNER-01 และ AREA-01 รวมถึง K-Q ที่ไม่ได้ตอบตรงความหมาย ยังคงเปิดตามขอบเขตเดิม

> เอกสารนี้บันทึกการรับข้อกำหนดเชิงความหมาย ไม่ใช่หลักฐานว่ามีการติดตั้งความสามารถหรืออนุมัติการเขียน runtime ไม่มีลายเซ็นหรือวันประชุม Owner ใน repository จึงไม่สร้างข้อมูลดังกล่าวขึ้นเอง

## 1. จุดประสงค์ ขอบเขต และหลักฐาน

HN-C0 ทำหน้าที่ปิดการตีความข้อกำหนด Hospital Network ที่ Owner รับรองแล้ว และส่งต่อข้อจำกัดที่ยังปิดไม่ได้ให้เป็น gate ที่ตรวจสอบได้ งานนี้ไม่สร้าง Network policy, capability, aggregation query, UI, export, persistence หรือ migration

เอกสาร [Phase 17K.0 decision pack](./PHASE_17K0_HOSPITAL_GOVERNANCE_RESPONSIBILITY_AREA_DECISION_PACK.md) ยังคงเป็นหลักฐานข้อเสนอและคำถามเดิม ไม่เขียนทับ option หรือสถานะย้อนหลังในเอกสารนั้น เอกสารนี้สร้าง register อิสระด้วยรหัส HN เพื่อไม่ให้ K-Q identity หรือ option letter ชนกัน

การรับรอง Owner ในเอกสารนี้มาจากข้อกำหนดที่ให้ไว้สำหรับงาน HN-C0 และจัดสถานะเป็น OWNER_RECEIVED ตาม vocabulary ที่กำหนด ไม่ได้อ้างการรับรอง OWNER-01, AREA-01, Network Export หรือ implementation

### 1.1 หลักฐานสถานะปัจจุบัน

| หลักฐาน | ประเภท | สิ่งที่ยืนยันได้ |
| --- | --- | --- |
| Repository preflight | VERIFIED CURRENT REPOSITORY STATE | main, HEAD c0f7c0a221d9de5cccb39ba3ca69f2642134afe9, origin/main ตรงกัน และไม่มี tracked/untracked worktree change ก่อนเริ่ม |
| Owner HN statements ในคำสั่ง HN-C0 | CUSTOMER REQUIREMENT / OWNER_RECEIVED | HN-A01–A06, HN-M01–M06 และ HN-M06 subdecisions ตาม register ด้านล่าง |
| [ADR-0002](../adr/0002-role-capability-scope-authorization.md) และ [DEMI architecture baseline](../architecture/DEMI_ARCHITECTURE_BASELINE.md) | ACCEPTED ARCHITECTURAL CONTRACT | Authorization ใช้ Role + Capability + Scope, server-side policy เป็น authority และ fail closed; client state ไม่ให้สิทธิ์ |
| [Prisma schema](../../prisma/schema.prisma) และ policy/service ปัจจุบัน | VERIFIED CURRENT IMPLEMENTATION | มี Hospital self-reference, exact Hospital membership/Patient relationship/OSM assignment และ exact-Program reporting; ไม่มี Network reporting capability หรือ Area model ใน runtime ที่ตรวจ |
| Phase 15B.0, 15C.1, 15E.0, 15E.1 และ 16D.3 | HISTORICAL IMPLEMENTATION / CONTRACT EVIDENCE | แสดง lifecycle, exact Program authorization, source timestamp meanings และ current profile-global classification; ไม่ใช่การอนุมัติ Network feature |
| DEMI_PHASE_17K0B_FINAL_CONSOLIDATED_REVIEW.md | NOT AVAILABLE IN REPOSITORY | ค้นใน repository แล้วไม่พบไฟล์นี้; งานดำเนินต่อจากข้อกำหนดที่ส่งมากับ task และหลักฐานใน repository |

## 2. ขอบเขต Hospital Network ที่ Owner รับรอง

Hospital Network สำหรับ HN-C0 หมายถึง Parent Hospital หนึ่งแห่งรวมกับ **direct children ที่ผ่านเงื่อนไขของ metric นั้น** เท่านั้น ขอบเขตนี้เป็นสัญญาสำหรับ Network aggregate ที่เสนอในอนาคต ไม่เปลี่ยนความหมายของ parentHospitalId ในระบบส่วนอื่น และไม่สร้าง Hospital hierarchy inheritance ทั่วไป

มี aggregate scope สามชุดที่ต้องคำนวณแยก:

| สัญลักษณ์ | ความหมาย |
| --- | --- |
| P | Parent Hospital |
| C | Eligible direct child Hospitals |
| N | Network = P ∪ C |

ค่าที่นับเป็น unique ต้องคำนวณ DISTINCT ใหม่ภายในแต่ละ scope โดยเฉพาะ N ห้ามนำค่า unique ของ P และ C มาบวกกัน

ขอบเขตนี้ไม่เปลี่ยน accepted identity/authentication architecture: Person และ User ยังเป็นคนละ entity, ผู้ใช้คนเดิมยังใช้ identity เดียวข้าม role/membership, authentication ยังมาจาก DEMI session ที่ใช้ Supabase และ authorization ยังคงเป็น Role + Capability + Scope ผ่าน server-side policy. Top-level roles ยังคง ADMIN, HOSPITAL, OSM, PATIENT; Doctor/Nurse ยังคงเป็น profession ไม่ใช่ role. HN Network aggregate ไม่เพิ่ม role, ไม่เปลี่ยน auth authority และไม่ขยายสิทธิ์ทางคลินิก.

## 3. การกระทบยอด HN IDs กับ K-Q เดิม

HN decision IDs เป็น register ใหม่และเป็น authoritative สำหรับความหมาย HN ใน closeout นี้ ส่วน K-Q01–K-Q25 ยังคงมี identity, wording, option enumeration และ status เดิม เว้นแต่ semantic match ที่ระบุแคบ ๆ ด้านล่าง

| HN decision | ความสัมพันธ์กับ K-Q เดิม | ผลต่อสถานะ K-Q |
| --- | --- | --- |
| HN-A02 — direct-child scope | ตรงกับ **แง่โครงสร้าง Hospital hierarchy** ใน K-Q01 และยืนยันว่า hierarchy ปัจจุบันระบุ direct children ได้สำหรับ HN Network scope ซึ่งเป็นแง่หนึ่งของ K-Q22 (ความเพียงพอของ hierarchy ต่อ use case) | K-Q01 และ K-Q22 โดยรวมยัง OPEN: HN-A02 ไม่ตัดสินว่า Responsibility Area คืออะไร หรือว่า hierarchy พอสำหรับ Area, delegation หรือ use case อื่นหรือไม่ |
| HN-A05 — current hierarchy / temporal security | เป็นข้อกำหนดเรื่อง authority ของ Network reporting เมื่อ parent ปัจจุบันเปลี่ยน | ไม่ตอบ K-Q07 หรือ K-Q17 ซึ่งถาม Area inheritance และการตีความ Area ในรายงานย้อนหลัง |
| HN-A06 — aggregate child drilldown | เป็น breakdown ระดับ Hospital แบบ aggregate เท่านั้น | ไม่ได้อนุมัติ Area inheritance, staff/OSM membership inheritance หรือ authorization inheritance |
| HN-M01–M06 และ HN-D05 | เป็น requirement ของ Hospital Network reporting scope, metrics และเวลารายงาน | ไม่ได้อนุมัติ Area เป็น reporting key หรือ Area-based cohort |

K-Q07 ใน decision pack เดิมถามว่า Area definition, Area membership/work allocation, reporting และ authorization จะ inherit ข้าม hierarchy อย่างไร โดยแยกความสัมพันธ์เหล่านั้นออกจากกัน HN-A02 กำหนดเพียงว่า Network นี้รวม direct child เท่านั้น ส่วน HN-A06 อนุญาตเพียง aggregate breakdown ที่ยังติด privacy/history gates จึงไม่ใช่คำตอบให้ K-Q07

ใน K-Q01 เดิม option A หมายถึงโครงสร้าง Hospital ส่วน option D หมายถึงงาน/ผู้รับผิดชอบ (work allocation); HN-A02 อ้างเฉพาะความหมาย hierarchy ของ option A และไม่ใช้ option D ตาม mapping ที่คลาดเคลื่อนจากบทสนทนาก่อนหน้า K-Q17 ยังคงถามประวัติของ Area ในรายงาน ไม่ใช่ historical Network eligibility.

ดังนั้น K-Q02–K-Q25 ยังคง identity และสถานะเดิม โดย K-Q22 มีเพียง facet เรื่อง direct-child Network scope ที่ได้รับคำตอบเชิงความหมาย; K-Q07 และ K-Q17 ยัง OPEN ห้ามใช้ HN-C0 เพื่อปิดคำถาม Area, Workforce Editing, geography, assignment หรือ Owner transition ที่ไม่ได้อยู่ใน HN scope

## 4. HN-A01–A06 — Authorization และ hierarchy register

### HN-A01 — สิทธิ์ของ Parent Owner

- **Business meaning / accepted result:** อนุญาตเฉพาะ actor ที่ User เป็น ACTIVE, มี Role.HOSPITAL, มี direct HospitalMembership ที่ ACTIVE และ type OWNER ใน Parent Hospital เป้าหมาย และ Parent Hospital เป็น ACTIVE ทุก request ต้องผ่าน authoritative server-side policy ที่ revalidate สถานะปัจจุบัน.
- **Status:** OWNER_RECEIVED.
- **Source basis:** schema User, UserRole, HospitalMembership, Hospital; current exact-owner policy คือ decideHospitalOwnerPolicy ใน src/modules/workforce/policies/hospital-owner-policy.ts.
- **Authorization consequence:** MEMBER-only, child-only OWNER, ADMIN-only, OSM-only, PATIENT-only, actor/user/membership/hospital ที่ suspended, revoked หรือ stale ต้องถูกปฏิเสธ การมี role ADMIN อย่างเดียวไม่ใช่สิทธิ์ Network และสิทธิ์นี้ไม่ให้ clinical Patient read.
- **Explicit exclusions:** ไม่ได้อนุมัติสิทธิ์อ่าน Patient list/identifier/clinical record, จัดการ workforce ของ child, sibling access หรือ global ADMIN authority.
- **Dependency:** ก่อนมี aggregate exposure ต้องมี policy contract ที่ระบุ capability/action/target scope และ revalidation/revocation behavior; ชื่อ capability ยังเป็น proposal.
- **References:** [ADR-0002](../adr/0002-role-capability-scope-authorization.md), [schema](../../prisma/schema.prisma), [Hospital Owner policy](../../src/modules/workforce/policies/hospital-owner-policy.ts).

### HN-A02 — ความลึกของ hierarchy

- **Business meaning / accepted result:** C มีเฉพาะ Hospital ซึ่ง child.parentHospitalId === parent.id; ไม่รวม grandchildren, siblings หรือ Hospital อิสระ.
- **Status:** OWNER_RECEIVED.
- **Source basis:** Hospital.parentHospitalId, self-relation parentHospital / childHospitals ใน schema; runtime Network resolver ยังไม่มีใน source ที่ตรวจ.
- **Authorization consequence:** ความสัมพันธ์ Parent/Child นี้เป็นเพียงขอบเขต Network aggregate ตาม HN contract ไม่ทำให้สิทธิ์ของผู้ใช้หรือ Patient สืบทอด.
- **Explicit exclusions:** ไม่แก้หรือ reinterpret field เดิม; ไม่ recursive traversal; ไม่ขยายสิทธิ์ไปยัง child Owner/member.
- **Dependency:** C1 ต้อง resolve direct child จากฐานข้อมูล authoritative และทดสอบ deny สำหรับ grandchild/sibling/unrelated.
- **References:** [Hospital schema](../../prisma/schema.prisma), [K-Q01–K-Q07 เดิม](./PHASE_17K0_HOSPITAL_GOVERNANCE_RESPONSIBILITY_AREA_DECISION_PACK.md).

### HN-A03 — P, C และ N เป็น aggregation scopes แยกกัน

- **Business meaning / accepted result:** คง P, C, N เป็นสาม aggregate; N เป็น union ของ P กับ C ที่ eligible. คำนวณ unique identity ใหม่ด้วย DISTINCT ในแต่ละ scope.
- **Status:** OWNER_RECEIVED.
- **Source basis:** Patient/Hospital, workforce/Hospital, OSM/Hospital และ Program/relationship model ที่มีอยู่; ยังไม่มี Network aggregate query.
- **Authorization consequence:** Network summary เป็น capability/scope ใหม่ในเชิงความหมาย; report:program:read ใช้แทนไม่ได้.
- **Explicit exclusions:** ห้ามบวก unique counts ของ P และ C; ห้ามเผย row-level identifier ผ่าน aggregate.
- **Dependency:** C2 ต้องมี query ที่จำกัด Hospital IDs ที่ C1 อนุญาต และตรวจ correctness ของ distinct ข้าม P/C.
- **References:** [schema](../../prisma/schema.prisma), [Program report access](../../src/modules/reporting/services/program-report-access-service.ts).

### HN-A04 — Hospital status

- **Business meaning / accepted result:** organizational child directory อาจแสดง direct child ที่ PENDING_VERIFICATION, ACTIVE หรือ SUSPENDED; Network statistics รวมเฉพาะ ACTIVE Parent และ ACTIVE direct children. Child ที่ไม่ ACTIVE ถูกตัดออก ไม่ใช่ contributor ที่มีค่า 0. Parent ที่ไม่ ACTIVE ไม่มีอำนาจอนุญาต Network reporting.
- **Status:** OWNER_RECEIVED.
- **Source basis:** HospitalStatus ปัจจุบันมีสถานะสามค่าดังกล่าว; current Hospital governance directory และ lifecycle เป็นคนละ feature กับ Network directory/statistics.
- **Authorization consequence:** การพบ child ใน directory ไม่ใช่สิทธิ์รายงานหรือการอ่านข้อมูลของ child; status ต้องตรวจซ้ำฝั่ง server.
- **Explicit exclusions:** ไม่อนุมัติ status inheritance, child lifecycle management โดย Parent Owner หรือการคืนข้อมูลศูนย์แทนการ deny/suppress.
- **Dependency:** C1/C2 ต้องกำหนดกรณี Parent/child status เปลี่ยนระหว่าง resolution/query และผลลัพธ์ unavailable/denied.
- **References:** [Hospital schema](../../prisma/schema.prisma), [Hospital governance service](../../src/modules/hospital-governance/services/hospital-governance-service.ts).

### HN-A05 — Hierarchy ปัจจุบันและ temporal security

- **Business meaning / accepted result:** resolve hierarchy จาก Hospital relationship ปัจจุบันที่ authoritative. ห้ามสร้าง topology ย้อนหลังโดยไม่มีแหล่งข้อมูลที่ Owner อนุมัติ. Parent ใหม่ห้ามได้ย้อนหลังถึงข้อมูลก่อนถูก reparent เพียงเพราะ parentHospitalId ปัจจุบันชี้มาที่ Parent นั้น; Parent เก่าที่เสีย child ต้องเสีย scope child ปัจจุบัน. หากพิสูจน์ eligibility ตามเวลาไม่ได้ ให้ fail closed.
- **Status:** OWNER_RECEIVED สำหรับหลักการ; การเปิดเผย aggregate ที่กระทบประวัติยังเป็น OPEN_BLOCKER.
- **Source basis:** Hospital มี parentHospitalId, createdAt, updatedAt; ไม่พบ effective-dated hierarchy history ใน schema ที่ตรวจ.
- **Authorization consequence:** เป็นข้อจำกัดทั้ง period metrics และ current snapshots ที่มี record ก่อน reparent รวมถึง Program ที่คาบเกี่ยวและ Follow-up history; ห้ามถือ current parent เป็นหลักฐาน authority ย้อนหลัง.
- **Explicit exclusions:** ไม่เขียน clinical history ใหม่, ไม่ย้ายข้อมูลเงียบ ๆ, ไม่กำหนดย้อนหลังวันเริ่มสิทธิ์ และไม่เสนอ history table หรือ temporal migration โดยไม่มีการตัดสินเพิ่มเติม.
- **Dependency:** เป็น release gate ของทุก aggregate ที่อาจเปิดเผย cohort ก่อน/หลัง reparent; ต้องมีแหล่ง eligibility ที่อนุมัติและ fail-closed contract ก่อนเผยค่า.
- **References:** [Hospital schema](../../prisma/schema.prisma), [ADR-0002](../adr/0002-role-capability-scope-authorization.md).

### HN-A06 — Aggregate child drilldown

- **Business meaning / accepted result:** Parent OWNER อาจดู bounded aggregate breakdown ของ ACTIVE direct children ในอนาคต.
- **Status:** OWNER_RECEIVED สำหรับขอบเขตที่อนุญาต; การแสดงผลจริงยัง blocked โดย HN-M07 และ historical reparent disclosure.
- **Source basis:** ไม่มี Network child-summary implementation ปัจจุบัน.
- **Authorization consequence:** เป็นค่า aggregate เท่านั้น ไม่ให้ Patient list/identifiers/clinical records, child staff/OSM membership management, sibling-wide authority, arbitrary Hospital access หรือ Network Export.
- **Explicit exclusions:** child breakdown ที่เล็กหรือแตกต่างกันจนอนุมาน cohort ได้ต้องถูก withheld ตาม HN-M07.
- **Dependency:** Privacy contract และ temporal eligibility ต้องผ่านก่อน C2 expose breakdown.
- **References:** [Phase 15E.0 report authorization analysis](./PHASE_15E0_REPORTING_DASHBOARD_EXPORT_CONTRACT_CONSOLIDATION.md), [Phase 15E.1 exact Program report](./PHASE_15E1_PROGRAM_REPORTING_PROJECTION_FOUNDATION.md).

## 5. HN-M01–M06 — Metric decision register

Metric requirements ต่อไปนี้ได้รับสถานะ OWNER_RECEIVED; เป็น definition ที่ต้องนำไปทำ technical contract ภายหลัง ไม่ใช่ query ที่ติดตั้งแล้ว

### HN-M01 — Patient metrics

- **Accepted result:** Current Snapshot: patientUniquePatients = COUNT(DISTINCT PatientHospitalRelationship.patientProfileId); patientRelationshipCount = COUNT(PatientHospitalRelationship.id).
- **Status:** OWNER_RECEIVED.
- **Source basis:** PatientHospitalRelationship ผูก PatientProfile กับ Hospital และ unique ต่อ PatientProfile/Hospital.
- **Authorization consequence:** scope ของแถวต้องเป็น P หรือ eligible C ตาม HN-A01–A05; N unique ต้องคำนวณ DISTINCT profile ตลอด P ∪ C.
- **Explicit exclusions:** Relationship ไม่พิสูจน์ clinical visit, ongoing care หรือ treatment status; ไม่คืน Patient rows.
- **Dependency / references:** C2 query และ P/C/N tests; [schema](../../prisma/schema.prisma), [Patient directory policy](../../src/modules/patient-directory/policies/patient-directory-policy.ts).

### HN-M02 — Patient classification metrics

- **Accepted result:** ใช้ current profile-global PatientClassification ที่รองรับ RISK และ DIABETES เท่านั้น; นับ riskUniquePatients, riskRelationships, diabetesUniquePatients, diabetesRelationships.
- **Status:** OWNER_RECEIVED.
- **Source basis:** current unique classification row ต่อ PatientProfile; ไม่ใช่ค่าต่อ Hospital relationship และมี history model แยก.
- **Authorization consequence:** classification count ต้อง join กับ PatientHospitalRelationship ที่อยู่ใน P/C/N scope ก่อน deduplicate ตาม profile; ห้ามขยาย visibility ของ global profile ข้าม Hospital.
- **Explicit exclusions:** RISK ไม่ใช่ diagnosis Pre-DM ที่ยืนยันอย่างเป็นทางการ; DIABETES ไม่ใช่ diagnosis ที่ยืนยันแยกโดยอิสระ; ไม่มี classification เป็นส่วนของ overall Patient metrics แต่ไม่อยู่ในสอง classification-specific counts; ห้ามเพิ่ม classification ที่สาม.
- **Dependency / references:** C2 ใช้ current value เท่านั้นและต้องผ่าน privacy/temporal gate; [schema](../../prisma/schema.prisma), [Phase 16D.3](./PHASE_16D3_PATIENT_CLASSIFICATION_PERSISTENCE_HISTORY_RECONCILIATION.md).

### HN-M03 — Staff และ OSM metrics

- **Accepted result:** Current Snapshot: staffUniqueUsers = DISTINCT HospitalMembership.userId; staffActiveRelationships = จำนวน HospitalMembership ที่ eligible และ ACTIVE; osmUniqueUsers = DISTINCT OsmHospitalRelationship.userId; osmActiveRelationships = จำนวน OSM-Hospital relationship ที่ eligible และ ACTIVE.
- **Status:** OWNER_RECEIVED สำหรับ metric concepts; exact eligibility predicates เป็น OPEN_BLOCKER ต่อ implementation contract.
- **Source basis:** HospitalMembership และ OsmHospitalRelationship เป็นคนละ entity; User มีสถานะและหลาย role/membership ได้.
- **Authorization consequence:** unique staff กับ unique OSM อาจ overlap; ห้ามบวกแล้วเรียกว่า unique workforce. Count ต้องจำกัดอยู่กับ eligible Hospital set.
- **Explicit exclusions:** ยังไม่กำหนดการนับ OWNER/MEMBER, role predicate, User account status ที่ไม่สอดคล้องกับ relationship status หรือรายละเอียด predicate อื่น; เอกสารนี้ไม่เติมกติกาแทน Owner.
- **Dependency / references:** C1/C2 ต้อง formalize predicates และทดสอบ state combinations ก่อน expose; [schema](../../prisma/schema.prisma), [workforce service](../../src/modules/workforce/services/workforce-service.ts).

### HN-M04 — Program participation

- **Accepted result:** Period-based programUniqueParticipants = DISTINCT PatientHospitalRelationship.patientProfileId; programEpisodeCount = จำนวน eligible PatientProgram.id. รวมสถานะ ACTIVE และ COMPLETED ที่ lifecycle overlap กับ reporting interval. Program ที่ startedAt = completedAt ถูกตัดออก.
- **Status:** OWNER_RECEIVED.
- **Source basis:** Program เป็น episode ของ exact PatientHospitalRelationship; schema เก็บ status, startedAt, nullable completedAt.
- **Authorization consequence:** join และ scope ตาม relationship/Hospital ที่ได้รับอนุญาต; N uniques คำนวณใหม่ทั้งช่วง ไม่รวมผล unique รายเดือน.
- **Explicit exclusions:** COMPLETED ไม่แปลว่ารักษาสำเร็จ, มี Final Assessment, ทำ Follow-up ครบ หรือมี clinical outcome; ห้ามลบ/ซ่อม/แก้/backfill zero-duration episodes.
- **Dependency / references:** ใช้ HN-M06-T01/T09/T09-S01; [schema](../../prisma/schema.prisma), [Phase 15B.0 lifecycle](./PHASE_15B0_PROGRAM_WORKFLOW_FOUNDATION.md).

### HN-M05 — Follow-up metrics

- **Accepted result:** Period-based followupUniquePatients = DISTINCT PatientHospitalRelationship.patientProfileId; followupRecordCount = จำนวน eligible PatientFollowup.id. รวมเฉพาะ record ที่ patientProgramId IS NOT NULL และใช้ recordedAt ใน period.
- **Status:** OWNER_RECEIVED.
- **Source basis:** Follow-up มี nullable Program link และ composite Program/relationship consistency; recordedAt เป็น application record time.
- **Authorization consequence:** metric เป็น count เท่านั้น; ขอบเขต Hospital/Network ต้องแก้จาก current authorized scope และ exact relation; ไม่ต้องผ่าน selected Program overlap population ของ HN-M04.
- **Explicit exclusions:** legacy Follow-up ที่ไม่มี Program link ถูก exclude โดยไม่ลบ/backfill; recordedAt ไม่ใช่เวลาสังเกตการณ์/ทำกิจกรรมทางคลินิก; ไม่ถือว่า HN-M05 เป็น subset ทางคณิตศาสตร์ของ HN-M04; ห้ามคิด participation/completion/coverage rate.
- **Dependency / references:** ใช้ HN-M06-T02/T08; [schema](../../prisma/schema.prisma), [Phase 15C.1 linkage](./PHASE_15C1_SERVICE_TWO_PROGRAM_LINKAGE_DOMAIN_PERSISTENCE.md).

### HN-M06 — Mixed reporting time basis

- **Accepted result:** HN-M01–M03 เป็น CURRENT_SNAPSHOT; HN-M04–M05 เป็น PERIOD_BASED. เปลี่ยน selected reporting period แล้วห้ามเปลี่ยนหรือ re-filter Patient, Classification, Staff หรือ OSM snapshot metrics.
- **Status:** OWNER_RECEIVED.
- **Source basis:** Current source tables เก็บ current state; Program lifecycle uses startedAt / completedAt; Follow-up uses recordedAt.
- **Authorization consequence:** Snapshot และ period metrics มี time basis คนละแบบ ต้อง label ชัดและไม่คำนวณทดแทนกัน.
- **Explicit exclusions:** As-of instant เดียวไม่เท่ากับ consistent database snapshot และไม่อนุมัติ historical-as-of reconstruction.
- **Dependency / references:** HN-M06-T01–T09; [Phase 15B.0](./PHASE_15B0_PROGRAM_WORKFLOW_FOUNDATION.md), [Phase 15C.1](./PHASE_15C1_SERVICE_TWO_PROGRAM_LINKAGE_DOMAIN_PERSISTENCE.md), [Phase 15E.1 timestamp semantics](./PHASE_15E1_PROGRAM_REPORTING_PROJECTION_FOUNDATION.md).

## 6. HN-M06 time decision register และตัวอย่าง

แต่ละ ID ในตารางเป็น decision แยกกันและมีสถานะ OWNER_RECEIVED.

| ID | Accepted rule |
| --- | --- |
| HN-M06-T01 | Program lifecycle ต้อง overlap กับ selected period. |
| HN-M06-T02 | Program-linked Follow-up ใช้ recordedAt ที่อยู่ใน selected period. |
| HN-M06-T03 | Business reporting timezone คือ Asia/Bangkok. |
| HN-M06-T04 | ผู้ใช้เลือก local start/end dates แบบ inclusive; แปลงเป็น absolute half-open interval [start, nextDay(end)). |
| HN-M06-T05 | Default คือ current Bangkok calendar Month-to-Date. |
| HN-M06-T06 | Reporting interval สูงสุด 12 calendar months ต่อ request. |
| HN-M06-T06-S01 | Rolling 12 calendar months anchor ที่ selected local start date; ไม่ใช่ fixed 365 วันหรือจำนวน calendar-month buckets ที่แตะ. |
| HN-M06-T06-S02 | ถ้าเริ่ม Feb 29 ใน leap year และปีถัดไปไม่ใช่ leap year, end-exclusive anniversary คือ Mar 1 จึงรวม Feb 28 ได้. |
| HN-M06-T07 | ปฏิเสธ End Date ที่หลัง current Bangkok calendar date. |
| HN-M06-T08 | ใช้ authoritative server As-of instant เดียวต่อ request; source timestamps หลัง As-of ต้องไม่ถูกนับ. |
| HN-M06-T09 | Program completion endpoint เป็น exclusive; Program ที่ completed ตรง period start ไม่ overlap. |
| HN-M06-T09-S01 | ตัด zero-duration Programs ออกจาก HN-M04 overlap metrics. ห้ามลบ, repair, mutate หรือ backfill episode ที่ persist แล้ว. |

### 6.1 การแยกความหมายของเวลา

1. **Selected local dates:** วันที่เริ่มและสิ้นสุดตามปฏิทิน Asia/Bangkok; วันสิ้นสุดที่ผู้ใช้เลือกยังรวมอยู่.
2. **Absolute interval:** แปลง local midnight ของ Start Date ถึง local midnight หลัง End Date เป็นช่วง [startInclusive, endExclusive). Source timestamp ที่ตรง start รวม; ที่ตรง end-exclusive ไม่รวม.
3. **As-of instant:** เวลาจาก authoritative server หนึ่งค่าใน request ใช้ป้องกันการนับ source timestamp ที่อยู่อนาคตจากเวลานั้น ไม่ใช่เวลาที่ผู้ใช้ส่งมา.
4. **Database state:** การอ่านหลาย query ภายใต้ As-of เดียวไม่ได้รับประกันว่าเห็น database snapshot เดียวกัน. Read isolation และ cross-query consistency เป็น technical design gate.
5. **Historical state:** CURRENT_SNAPSHOT อ่าน current data ตาม contract; HN ไม่อนุมัติการสร้างย้อนหลังว่า classification, membership, account status หรือ hierarchy เคยมีค่าใด ณ As-of เก่า. updatedAt ปัจจุบันไม่ใช่ state history.
6. **Program lifecycle:** M04 ทดสอบการทับซ้อนของช่วง lifecycle กับ reporting interval; completion endpoint ไม่รวม.
7. **Follow-up application recording time:** M05 เทียบ PatientFollowup.recordedAt กับ reporting interval ไม่ได้แทนเวลาสังเกต/ทำกิจกรรมจริง.

### 6.2 ตัวอย่างและ boundary acceptance cases

| กรณี | ผลที่ต้องยอมรับ |
| --- | --- |
| Inclusive start / exclusive end | ช่วงวันที่ local 1–1 ม.ค. 2026 คือ [2025-12-31 17:00Z, 2026-01-01 17:00Z); timestamp ที่ start รวมและที่ end-exclusive ไม่รวม. |
| Bangkok midnight | 2025-01-01 00:00 Asia/Bangkok ตรงกับ 2024-12-31 17:00Z; ห้ามตัดวันด้วย UTC calendar date. |
| Month-to-Date | ถ้า current Bangkok date คือ 10 ต.ค. ช่วง default คือ local 1–10 ต.ค. และ end-exclusive เป็น local midnight วันที่ 11; server As-of ยังคงเป็น instant แยกต่างหาก. |
| Year rollover | local 31 ธ.ค. 2024–1 ม.ค. 2025 ครอบคลุมสองวันตาม local calendar; conversion ต้องไม่เปลี่ยนขอบเขตเมื่อเปลี่ยนปี. |
| Rolling 12 months | เมื่อ start คือ 15 มิ.ย. 2025 เพดานช่วงคือ end-exclusive 15 มิ.ย. 2026; ไม่คำนวณด้วย 365 วันหรือจำนวน bucket. |
| Feb 29 anniversary | start local 29 ก.พ. 2024 มี maximum end-exclusive local 1 มี.ค. 2025 จึงรวมวันที่ 28 ก.พ. 2025 ได้. |
| Future End Date | End Date หลัง current Bangkok calendar date ถูกปฏิเสธ แม้ timestamp ที่ส่งมาจะเป็นเวลาอื่นในวันนั้น. |
| Follow-up after As-of | Follow-up ที่ recordedAt หลัง authoritative As-of ไม่ถูกนับ แม้ selected local dates จะครอบคลุมวันนั้น. |
| Program completed at period start | completedAt เท่ากับ period start ไม่ overlap เพราะ completion endpoint exclusive. |
| Zero-duration Program | startedAt เท่ากับ completedAt ถูกตัดออกจาก M04 โดยตรง ไม่ mutate record. |
| ACTIVE Program began before period | หาก lifecycle ยัง overlap กับช่วงที่เลือก ให้รวม แม้ startedAt จะก่อน start date. |
| Program spans months | episode เดียวอาจถูกนับในแต่ละ monthly interval ที่ lifecycle overlap; quarterly/annual unique ต้อง recompute ตลอดช่วงที่เลือก. |
| Different Program / Follow-up populations | Program ที่ complete ก่อนช่วง แต่มี Program-linked Follow-up บันทึกในช่วง อาจไม่ถูกนับใน M04 แต่ Follow-up นั้นอาจเข้า M05; ห้ามบังคับ M05 เป็น subset ของ M04. |

**Open implementation detail:** T08 กำหนด cutoff ของ source timestamp แต่ไม่ได้ตัดสินวิธีจัดการ current mutable rows ที่ update หลัง As-of หรือขอบเขตที่ต้อง fail closed เมื่อ state เดิมกู้คืนไม่ได้ จึงต้องปิดรายละเอียดนี้ใน C1/C2 โดยไม่สร้าง historical-as-of behavior เอง

## 7. HN-D05 — Proposed Network Summary contract

**Status:** semantic grouping ได้รับจาก HN-M01–M06 (OWNER_RECEIVED); response metadata และ DTO names เป็น WORKING_SAFETY_BASELINE / PROPOSED เท่านั้น. ไม่มี route, DTO, capability หรือ UI นี้ใน runtime ปัจจุบัน

รูปแบบสรุปที่เสนอแบ่งสอง section:

| Section | Metrics | Time basis |
| --- | --- | --- |
| Current Snapshot | Patients, Classification, Staff, OSM | HN-M01–M03 / CURRENT_SNAPSHOT |
| Period-based | Program Participation, Program-linked Follow-up Records | HN-M04–M05 / PERIOD_BASED |

แต่ละ section ควรรักษาความหมาย P / C / N แยกกันโดยไม่ซ่อนว่า Children หมายถึง eligible ACTIVE direct children ตาม HN-A02/A04 และโดยไม่รวม child ที่ไม่ eligible เป็นค่า 0

ชื่อ metadata ต่อไปนี้เป็นตัวอย่างเชิงเอกสารเท่านั้นและยังไม่ใช่ DTO contract:

- reportingTimeBasis
- businessTimezone
- selectedLocalStartDate / selectedLocalEndDate
- absoluteStartInclusive / absoluteEndExclusive
- requestAsOfInstant
- currentAuthorizedHospitalScope
- eligibleChildren
- สถานะแยก AVAILABLE, DENIED, UNAVAILABLE, SUPPRESSED

ชื่อ candidate capabilities สำหรับ directory, Network summary และ child summary เป็น design proposal เท่านั้น ยังไม่มีชื่อที่อนุมัติหรือถูกติดตั้ง. report:program:read มีขอบเขต exact Program หนึ่งรายการต่อ exact relationship และห้ามตีความเป็น Hospital cohort หรือ Network summary permission.

ผล DENIED, UNAVAILABLE หรือ SUPPRESSED ห้ามแสดงเงียบ ๆ เป็น factual zero. การส่งค่าของ child aggregate ยังติด HN-M07 และ historical reparent gate.

## 8. Safety baseline, blockers และ deferred scope

| หัวข้อ | สถานะ | ข้อสรุป |
| --- | --- | --- |
| การ withheld aggregate ที่เปิดเผยอย่างปลอดภัยไม่ได้ | WORKING_SAFETY_BASELINE | ระหว่างยังไม่มี disclosure contract ให้ไม่เปิด aggregate ที่เสี่ยง inference; ห้ามแทนการ withheld ด้วย 0. |
| HN-M07 Aggregate Privacy | OPEN_BLOCKER | ต้องมี contract สำหรับ small cells, minimum group size, complementary suppression ระหว่าง P/C/N, repeated/overlapping requests, snapshots คนละ As-of, differencing unique กับ record counts, child drilldown และ derived cohort inference. ไม่มี numeric threshold หรือ algorithm ที่ได้รับอนุมัติ. |
| Historical reparent disclosure (ผลต่อ HN-A05) | OPEN_BLOCKER | Hospital.parentHospitalId และ Hospital.updatedAt ไม่มี effective-dated history. Current parent ไม่พิสูจน์ authority ต่อ record ก่อน reparent. ครอบคลุม snapshot, long-running Program และ period-based Follow-up. หากพิสูจน์ eligibility ไม่ได้ ต้อง withhold aggregate ที่ได้รับผลกระทบ ไม่คืนเป็น 0. |
| HN-M03 exact eligibility | OPEN_BLOCKER ต่อ implementation contract | ต้อง formalize role/status, OWNER/MEMBER และ inconsistent account state ก่อนเขียน query/test. |
| T08 current-state cutoff และ multi-query consistency | OPEN_BLOCKER ต่อ technical contract | As-of instant ไม่ได้ให้ database snapshot เดียว; mutable state และ query isolation ต้องมี design ที่ไม่อ้าง historical state ที่ไม่มีหลักฐาน. |
| HN-M08 Network Export | DEFERRED / NOT AUTHORIZED | ไม่มี Excel, CSV, PDF, bulk API download, Patient roster หรือ indirect export. |
| OWNER-01 / Workforce Editing | OPEN | HN decision ไม่ให้แก้ Person, User credential/account, global identity, Hospital membership, OSM relationship หรือ workforce field ใดเพิ่ม. |
| AREA-01 / Responsibility Area | OPEN | ไม่อนุมัติ Area CRUD, taxonomy, membership, assignment, geography หรือ Area-based authorization/reporting. |
| Clinical Patient access | UNCHANGED / OUT OF SCOPE | HN aggregate permission ไม่ให้ Patient rows หรือ clinical read/update. Exact-Hospital Patient policy และ exact PatientOsmAssignment boundary คงเดิม. |
| Implementation | IMPLEMENTATION_NOT_AUTHORIZED | HN-C0 เป็นเอกสารเท่านั้น; HN-C1/C2/C3 ต้องได้รับคำสั่งแยก. |

ห้ามเปลี่ยน accepted ADR เพื่อบันทึก proposal ในเอกสารนี้ หาก contract ที่ Owner อนุมัติภายหลังเปลี่ยนหลักสถาปัตยกรรมอย่างมีนัยสำคัญ ให้จัดทำ ADR ใหม่หรือ amendment ตาม governance ก่อน implementation.

## 9. Threat และ data-correctness matrix

| Scenario / threat | Required handling from accepted decisions | Residual gate / test |
| --- | --- | --- |
| MAIN/Parent กับ direct SUB/child | รวมเฉพาะ direct child ด้วย parent ID ปัจจุบัน; aggregate ต้องเป็น P/C/N แยกกัน. | C1 direct-child resolver; C2 distinct aggregate test. |
| Grandchild, sibling หรือ independent Hospital | ไม่เข้า scope; ไม่ใช้ recursive hierarchy, shared geography หรือชื่อองค์กรเพื่อขยายสิทธิ์. | Deny tests ใน C1. |
| Parent Owner แต่เป็น MEMBER, OWNER อยู่ child, ADMIN-only หรือ OSM/PATIENT | ปฏิเสธตาม HN-A01. | Role + membership + hospital status combination tests; revalidate ทุก request. |
| User, membership หรือ Hospital ถูก suspend/revoke ระหว่าง governance change | ใช้ authoritative current state; stale actor/scope ไม่ผ่าน. | C1 revocation/concurrency tests; request-time consistency design. |
| Parent Hospital suspended | ห้าม authorize Network reporting. | Deny test; ไม่แสดงสถิติเป็นศูนย์. |
| Child PENDING_VERIFICATION/SUSPENDED | directory อาจแสดงสถานะ แต่ไม่เป็น statistical contributor; ไม่แทนด้วย zero-count row. | Directory vs aggregate eligibility tests. |
| HospitalMembership หรือ OSM-Hospital relationship ถูก suspend | Current metrics ระบุจำนวน relationship ที่ ACTIVE เท่านั้น; exact eligibility เพิ่มเติมของ account/role ยังเป็น blocker HN-M03. | Membership/relationship lifecycle กับ account-state combination tests หลัง formalize predicate. |
| Parent สูญเสีย child / child reparent | Parent เดิมเสีย current child scope; Parent ใหม่ไม่ได้รับ retrospective access จาก pointer ปัจจุบัน. | OPEN_BLOCKER: ไม่มี effective-dated history; aggregate ที่ได้รับผลกระทบต้อง withheld. |
| Current snapshots มี records ก่อน reparent | ห้ามสมมติว่าการอยู่ใน current P/C ทำให้ Parent ใหม่มี authority ต่อ cohort เก่า. | Historical disclosure gate ครอบคลุม M01–M05 ตามความเหมาะสม; fail-closed behavior. |
| Patient อยู่หลาย Hospital | นับ relationship ต่อ Hospital; unique profile deduplicate ใหม่ใน Network. | P/C/N fixture ที่มี profile ซ้ำ. |
| Staff และ OSM identity overlap | แสดง distinct แยก metric; ห้ามรวมเป็น population เดียว. | HN-M03 predicate blocker และ overlap tests. |
| OSM มี assignment หลาย Hospital | HN metrics ไม่เปลี่ยน PatientOsmAssignment policy; ไม่มี Patient row/drilldown จาก summary. | Exact assignment tests remain existing boundary; Network aggregate cannot be used as access path. |
| Program/Follow-up source grain ซ้ำกัน | ใช้ distinct profile และ count episode/follow-up IDs ตาม M04/M05; ไม่คูณจาก join. | PostgreSQL aggregate grain tests; no record output. |
| Program status/time boundary, zero duration, Follow-up nullable Program link | ใช้ statuses, overlap, endpoint, zero-duration exclusion, recordedAt, exact Program link ตาม M04/M05/T decisions. | Boundary and regression tests; no repair/backfill. |
| Month/As-of query changes, overlapping ranges | ใช้ Bangkok half-open dates และหนึ่ง server As-of; ห้าม reclassify snapshots ตาม period. | M07 repeated-query differencing blocker; time/property tests. |
| Small cells, child + parent totals, unique vs record counts | Withhold/suppress ตาม privacy contract ที่ยังต้องตัดสิน; ไม่ออก threshold เอง. | HN-M07 blocks exposure and acceptance of privacy algorithm. |
| Area rename, retire, transfer, membership reassignment | อยู่นอก HN และ AREA-01 ยัง OPEN; ไม่มีผลต่อ Network scope ใน C0. | Do not add Area data or infer relation semantics. |

## 10. Documentation-to-implementation traceability

| Requirement | Existing source of truth / current evidence | Conditional future contract and verification |
| --- | --- | --- |
| HN-A01–A04 | Hospital, HospitalMembership, User, UserRole; decideHospitalOwnerPolicy; Hospital lifecycle service | C1 server policy and current scope resolver; allow/deny for active Parent OWNER vs denied role/status combinations; direct child and status tests. |
| HN-A05 / historical disclosure | Hospital.parentHospitalId and updatedAt; no effective-dated parent history found | C1 must establish approved temporal eligibility or fail closed. Do not implement a history model or migration absent approval. Test reparent, lost child, parent change and affected aggregates. |
| HN-A06 / HN-D05 | No child summary or Network report in current reporting module | C1 authorization/privacy contract, then C2 bounded aggregate projection and explicit non-factual unavailable/denied/suppressed states. |
| HN-M01–M03 | PatientHospitalRelationship, PatientClassification, HospitalMembership, OsmHospitalRelationship | C2 DB-side counts; P/C/N distinct recomputation, overlapping identity and eligibility-predicate tests. |
| HN-M04 | PatientProgram.status, startedAt, completedAt, exact relationship link | C2 period query; interval overlap, status, zero-duration, month/year unique recomputation tests. |
| HN-M05 | PatientFollowup.patientProgramId, composite Program/relationship relation, recordedAt | C2 exact Program-linked counts; NULL exclusion, recording-time boundaries, As-of and non-subset tests. |
| HN-M06-T01–T09 | Program lifecycle and Follow-up timestamp contracts exist; no Network reporting period handler exists | C1/C2 Bangkok calendar validation, half-open conversion, MTD, max rolling range, leap-year, future end, As-of and lifecycle boundary tests. |
| HN-M07 | Phase 15E.0 notes cohort/privacy decisions need a contract; no accepted numeric suppression rule here | Owner/security acceptance of safe aggregate disclosure contract before any exposure; small-cell, complementary suppression, differencing and repeated-query tests. |
| HN-M08 | No Network export is authorized | Exclude export endpoints/adapters from C1–C3. A future export is a separate deferred decision. |
| OWNER-01 / AREA-01 | Original 17K.0 pack, K-Q register and backlog | Remain on their own approved requirement and technical-contract path; do not use HN-C0 as their authority. |

## 11. Conditional execution roadmap

มีเพียง HN-C0 ที่ได้รับอนุญาตใน task นี้ ขอบเขต HN-C1–C3 เป็นข้อเสนอ conditional เท่านั้น และไม่ใช้เอกสาร Phase 17K.1–17K.3 เดิมซึ่งเน้น OWNER-01/AREA-01 มาแทน implementation authorization สำหรับ HN

### HN-C0 — Owner Decision Closeout

- **Status:** DOCUMENTATION CLOSEOUT COMPLETE.
- **Included:** บันทึก Owner-received HN semantics, reconcile IDs, ระบุ blocker/deferred, traceability และ test readiness.
- **Excluded:** source/schema/migration/seed/UI/API/service/policy/config/database/provider/device/LINE operations.
- **Exit:** เอกสารและ current-status references ครบ; ไม่มี implementation authorization.

### HN-C1 — Security and Disclosure Contract

- **Entry prerequisites:** separate authorization to prepare the security/disclosure contract; confirm that scope is only Network aggregates; retain the accepted HN-A/HN-M semantics; ensure the Product Owner/security decision authority can resolve HN-M07 and historical eligibility. These blockers are work for C1 to close, not prerequisites that prevent C1 from being authorized.
- **Candidate included work:** specify (do not implement) server-side exact Parent OWNER revalidation, direct-child resolution, current status eligibility, fail-closed temporal authorization, bounded P/C/N scope, patient-row denial and export denial. Define privacy/suppression and safe error-state contracts without inventing thresholds or history sources.
- **Explicit exclusions:** no Network aggregation/UI until disclosure gates pass; no Area/Workforce editing; no clinical access expansion; no export; no historical topology reconstruction without an approved source.
- **Expected layers:** contract for auth policy/capability, authoritative scope resolver, reporting service boundary, audit/error states and focused policy/PostgreSQL test design. C1 is specification work; file/module names remain provisional.
- **Security invariants:** ADR-0002 remains authoritative; Role + Capability + Scope; no hierarchy inheritance for clinical access; every request revalidates; denied/suppressed is not zero.
- **Migration:** none is presumed. If the approved solution requires a new historical eligibility source or persistence, it needs a separate accepted contract and migration plan before implementation.
- **Test matrix:** direct/indirect hierarchy, user/membership/parent/child suspend/revoke, multi-role actor, stale scope, reparent before/after data, temporal fail-closed, patient-list denial, export denial, P/C/N scope boundary.
- **Exit criteria:** accepted and versioned security/disclosure contract; all required decisions and failure states explicit. HN-M07 and historical reparent disclosure must be closed, or the contract must explicitly keep affected aggregation unavailable; C2 is not ready while either release gate remains open.
- **Outstanding gates:** HN-M07 and historical reparent disclosure are release blockers; HN-M03 predicates and T08 mutable-state behavior require technical closure.

### HN-C2 — Aggregation and Dashboard

- **Entry prerequisites:** separate implementation authorization; C1 complete; HN-M07 and historical reparent disclosure closed; HN-M03 predicates accepted/formalized; time/read-isolation design documented; HN-M01–M06 definitions translated to query contract.
- **Candidate included behavior:** database-side metrics with correct P/C/N distincts; snapshot/period separation; candidate metadata and explicit safe unavailable/denied/suppressed presentation; bounded Parent/direct-child aggregate views only.
- **Explicit exclusions:** Patient rows/identifiers, child management, Area CRUD, assignment changes, Network Export and clinical permission changes.
- **Expected layers:** bounded query/projection, service integration, server policy invocation, dashboard presentation, accessibility/mobile states and PostgreSQL integration fixtures. No existing route/DTO/UI is implied by this proposal.
- **Security invariants:** client-selected Hospital IDs never grant scope; current policy determines scope; parent hierarchy grants aggregate scope only under accepted HN contract; exact Patient authorization remains unchanged.
- **Migration:** no schema migration unless an independently approved contract proves it necessary; never backfill/rewrite clinical history or create a temporal hierarchy table by inference.
- **Test matrix:** all M01–M05 grains/statuses, P/C/N distinct behavior, duplicate profile across Hospitals, M03 overlaps, classification current values, Program overlap/zero duration, Follow-up exact-link/null/timestamp, Bangkok boundaries, As-of, unavailable states, privacy suppression/differencing, reparent fail-closed.
- **Exit criteria:** every accepted metric matches its source/grain, authorization and privacy contract; report metadata is accurate; suppressed/denied/unavailable is distinguishable from zero; no row-level access or export path; focused PostgreSQL and security verification pass.
- **Outstanding gates:** none of the aggregate exposure gates may remain open at release; do not begin while M07/history are unresolved.

### HN-C3 — Integration and Security Re-audit

- **Entry prerequisites:** separately authorized; C1/C2 complete; implementation diff stable; bounded PostgreSQL environment and synthetic dataset approved.
- **Candidate included behavior:** role/scope/revocation and reparent re-audit; calendar/leap-year/As-of boundary audit; P/C/N count verification; privacy/differencing regression; bounded UAT readiness report.
- **Explicit exclusions:** real-provider/device UAT, LINE operations, production operations, export and clinical access expansion.
- **Expected layers:** focused unit and disposable-PostgreSQL integration tests, source-to-policy traceability and re-audit documentation.
- **Security invariants:** independent verification of HN-A01–A06, exact Patient scope, no hierarchy inheritance for clinical access, no fake zero for suppressed/denied data.
- **Migration:** validate only separately approved migration if one exists; no production apply or backfill under this roadmap.
- **Test matrix:** complete allow/deny cases; reparent history; concurrent revocation/scope mutation; all temporal cases in §6; distinct and relationship grains; small-cell/complementary suppression; repeated requests; export and patient-row absence.
- **Exit criteria:** bounded automated re-audit passes and documents residual limits; UAT readiness is not real-provider/device UAT authorization.
- **Outstanding gates:** any release-critical privacy, historical, capability, or data-consistency gap blocks readiness.

## 12. Acceptance criteria and future test matrix

### HN-C0 documentation acceptance

- [x] HN-A01–A06 and HN-M01–M06 are recorded separately as OWNER_RECEIVED.
- [x] HN-M06-T01–T09 and T06-S01/S02, T09-S01 are recorded by independent IDs and definitions.
- [x] Original K-Q identities are preserved; the K-Q01 hierarchy facet, K-Q22 direct-child scope facet, and K-Q07 mismatch are explicit.
- [x] HN-M07 and historical reparent disclosure remain OPEN_BLOCKER; HN-M08 remains DEFERRED / NOT AUTHORIZED.
- [x] HN-D05 metadata/capability names are marked proposed; no factual-zero fallback is allowed.
- [x] OWNER-01, AREA-01, exact Patient authorization, accepted ADRs and Phase 17J operational gates are preserved.
- [x] Context and backlog point to this closeout; no runtime/schema/migration/seed/config/UI/API change is authorized or made.
- [ ] Implementation authorization — NOT GRANTED.
- [ ] Phase 17K completion — NOT CLAIMED.

### Required before future HN exposure

| Test group | Required cases |
| --- | --- |
| Authorization | ACTIVE parent OWNER; MEMBER-only; child-only OWNER; ADMIN-only; OSM/PATIENT; inactive User, role, membership, Parent; stale/revoked actor; revalidation on each read. |
| Hierarchy | exact direct children only; no grandchild, sibling or unrelated Hospital; direct child removed/reparented; no retrospective authority for newly assigned Parent; no current access after old Parent loses child. |
| Status | child directory status choices; only ACTIVE Parent/direct children contribute; non-ACTIVE children excluded rather than counted as zero; inactive Parent denies reporting. |
| Counts | P/C/N recomputation; duplicate PatientProfile across Hospitals; relationship count versus distinct patient count; overlapping Staff/OSM identities; no double-count through joins. |
| Classification | profile-global current RISK/DIABETES; no third class; unclassified included only in overall Patient metrics; current classification is not historical diagnosis. |
| Program | ACTIVE/COMPLETED; overlap start/end; completed at start excluded; zero duration excluded without mutation; started before range and still overlapping; episode crossing months; full-period unique recomputation. |
| Follow-up | non-null exact Program link only; composite Program/relationship integrity; NULL legacy exclusion; recordedAt boundaries and after-As-of exclusion; not filtered through M04 overlap set; M05 not assumed subset. |
| Time | Asia/Bangkok midnight, inclusive start, end-exclusive, MTD, year rollover, rolling 12 months, Feb 29, future end rejection, one server As-of; distinguish cutoff from DB snapshot isolation. |
| Privacy | approved minimum-cell behavior; complementary P/C/N suppression; overlapping requests and different As-of snapshots; unique/record differencing; child cohort inference; safe suppressed/unavailable/denied states. Numeric policy remains blocked until approved. |
| Non-expansion | no Patient list/identifiers/clinical record; no Area/Workforce edits; no new Patient authorization; no export; report:program:read remains exact Program. |

## 13. Explicit non-goals

- ไม่ implement Hospital Network functionality ใน HN-C0.
- ไม่สร้าง, เปลี่ยน หรือ migrate schema, seed, data, API, Server Action, service, policy, capability, route, dashboard หรือ feature flag.
- ไม่ขยาย Hospital hierarchy ไปยัง Patient, clinical record, workforce management หรือ Area membership.
- ไม่อนุมัติ Area CRUD, geography taxonomy, operational assignment หรือ Area-based reporting.
- ไม่อนุมัติ Workforce profile editing, global Person/User change, promote/demote changes หรือ cross-Hospital workforce management.
- ไม่อนุมัติ Network Export, bulk download, patient roster, clinical row exposure หรือ historical-as-of reconstruction.
- ไม่เริ่ม HN-C1, HN-C2, HN-C3, Phase 17K.1–17K.3 หรือ Phase 17J.5B.
- ไม่ดำเนินการกับ provider/device/LINE, production, deployment หรือฐานข้อมูลใด.

## 14. Final status register

| Area | Status |
| --- | --- |
| HN-C0 documentation closeout | COMPLETE — ready for Product Owner review of the recorded register and blockers. |
| HN-A01–A06, HN-M01–M06, HN-M06 subdecisions | OWNER_RECEIVED; requirement record only, no code installed. |
| HN-D05 exact DTO/capability names | WORKING_SAFETY_BASELINE / PROPOSED; no runtime contract. |
| HN-M07 Aggregate Privacy | OPEN_BLOCKER. |
| Historical reparent disclosure | OPEN_BLOCKER. |
| HN-M03 eligibility and T08 mutable-state/read consistency | OPEN_BLOCKER for implementation contract. |
| HN-M08 Network Export | DEFERRED / NOT AUTHORIZED. |
| Original K-Q01–K-Q25 | Preserve original identities/statuses; the K-Q01 hierarchy and K-Q22 direct-child Network-scope facets are semantically addressed; K-Q01/K-Q22 overall and K-Q07/K-Q17 remain OPEN; no blanket closure. |
| OWNER-01 / AREA-01 | Independently requirement-gated; not closed by HN-C0. |
| Implementation authorization | IMPLEMENTATION_NOT_AUTHORIZED. |
| Phase 17K completion | NOT CLAIMED. |
| Phase 17J.5B real-provider/device UAT | NOT AUTHORIZED / NOT EXECUTED; unchanged. |
| LINE operational gates | Unchanged: DEMI_LINE_DISCONNECTION_ENABLED=false; appointment notification flag remains unset/default OFF; no provider/device operation performed. |

## 15. Evidence references

### Accepted architecture and current code

- [ADR-0002: Role, Capability and Scope Authorization](../adr/0002-role-capability-scope-authorization.md).
- [DEMI Architecture Baseline](../architecture/DEMI_ARCHITECTURE_BASELINE.md).
- [Prisma schema](../../prisma/schema.prisma): User, UserRole, Hospital, HospitalMembership, PatientProfile, PatientClassification, PatientHospitalRelationship, PatientOsmAssignment, PatientProgram, PatientFollowup, OsmHospitalRelationship.
- [Hospital Owner policy](../../src/modules/workforce/policies/hospital-owner-policy.ts): decideHospitalOwnerPolicy; exact target Hospital, HOSPITAL role, direct active OWNER, active Hospital.
- [Workforce service](../../src/modules/workforce/services/workforce-service.ts): provisioning, listing/detail, promotion/demotion, profession and membership/OSM relationship lifecycle are separate existing operations.
- [Hospital governance service](../../src/modules/hospital-governance/services/hospital-governance-service.ts): Hospital directory/detail and Platform ADMIN suspend/restore transitions.
- [Patient directory policy](../../src/modules/patient-directory/policies/patient-directory-policy.ts): direct Hospital patient scope; hierarchy is not a policy input.
- [Patient OSM assignment policy](../../src/modules/patient-assignment/policies/patient-osm-assignment-policy.ts) and [assignment service](../../src/modules/patient-assignment/services/patient-osm-assignment-service.ts): exact Hospital Owner assignment governance.
- [Program report policy](../../src/modules/reporting/policies/program-report-policy.ts): report:program:read delegates to exact Program scope.
- [Program report access service](../../src/modules/reporting/services/program-report-access-service.ts) and [query service](../../src/modules/reporting/services/program-report-query-service.ts): one exact Program plus one exact relationship.
- [Hospital Owner governance PostgreSQL integration](../../tests/integration/hospital-owner-governance.integration.test.ts): exact-Hospital isolation, hierarchy-only denial, stale writes/actor contexts and last-Owner protection.
- [Patient–OSM assignment PostgreSQL integration](../../tests/integration/patient-osm-assignment.integration.test.ts): same-Hospital Owner assignment and exact active assignment reads.
- [Program reporting PostgreSQL integration](../../tests/integration/program-reporting.integration.test.ts): exact Program projection, relationship ownership and current actor scope.
- [Hospital governance PostgreSQL integration](../../tests/integration/hospital-governance.integration.test.ts): Platform ADMIN boundary, exact audited lifecycle transition and Hospital isolation.

### Historical domain and reporting contracts

- [Phase 17K.0 Hospital Governance / Responsibility Area decision pack](./PHASE_17K0_HOSPITAL_GOVERNANCE_RESPONSIBILITY_AREA_DECISION_PACK.md) — historical proposal and K-Q01–K-Q25 meanings/status.
- [Phase 17 UAT Backlog](./PHASE_17_UAT_BACKLOG.md) — OWNER-01, OWNER-02, AREA-01, STAFF-03, RPT-01/RPT-02 status.
- [Phase 15B.0 Program Workflow Foundation](./PHASE_15B0_PROGRAM_WORKFLOW_FOUNDATION.md) — Program lifecycle, status and exact relationship scope.
- [Phase 15C.1 Program Linkage](./PHASE_15C1_SERVICE_TWO_PROGRAM_LINKAGE_DOMAIN_PERSISTENCE.md) — nullable legacy Follow-up Program link and exact composite relation.
- [Phase 15E.0 Reporting Contract Consolidation](./PHASE_15E0_REPORTING_DASHBOARD_EXPORT_CONTRACT_CONSOLIDATION.md) — cohort, aggregate, privacy, audit and export requirements previously left gated.
- [Phase 15E.1 Program Reporting Projection](./PHASE_15E1_PROGRAM_REPORTING_PROJECTION_FOUNDATION.md) — exact Program report capability and timestamp semantics.
- [Phase 16D.3 Patient Classification](./PHASE_16D3_PATIENT_CLASSIFICATION_PERSISTENCE_HISTORY_RECONCILIATION.md) — current profile-global RISK/DIABETES source, history and non-expanded access.
- [Phase 17J.5A LINE Integration Re-audit](./PHASE_17J5A_LINE_INTEGRATION_REAUDIT_UAT_READINESS.md) — automated re-audit and separate, unexecuted 17J.5B real-provider/device gate.
- [Current DEMI context](../CONTEXT.md) — current architecture and non-HN operational status.
