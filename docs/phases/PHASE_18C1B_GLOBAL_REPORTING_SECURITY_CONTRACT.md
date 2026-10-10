# Phase 18C.1B — Global Reporting Security & Authorization Contract

- **สถานะเอกสาร:** SECURITY CONTRACT PREPARED — APPROVAL PENDING
- **ฐานตรวจสอบ:** branch `main`, HEAD `fc8335450622209f1681425700f765344c4c0f27`; working tree สะอาดก่อนเริ่ม
- **Product direction:** CONFIRMED / OWNER_RECEIVED; อ้างอิง GR-REQ-01 จาก Phase 18C.1A
- **Global reporting policy:** PROPOSED / SECURITY REVIEW PENDING
- **Patient-level access:** SECURITY_PRIVACY_BLOCKED
- **Data Controller approval:** PENDING
- **Implementation:** NOT AUTHORIZED

เอกสารนี้เป็นข้อเสนอเชิงความปลอดภัยเพื่อ review เท่านั้น ไม่มี customer clinical approval, independent Security approval, Privacy approval, Data Controller sign-off หรือ implementation authorization ที่แนบมา จึงไม่สร้าง capability จริง ไม่ปิด decision เดิม และไม่อนุญาตข้อมูลจริง

## 1. วัตถุประสงค์และ authorization boundaries

Global Admin หมายถึงผู้ดูแล DEMI Platform/System ที่มี Role.ADMIN ตามระบบ ไม่ใช่ Hospital OWNER, Hospital MEMBER, Parent Hospital OWNER หรือ Hospital Network Administrator. Role.ADMIN เป็นตัวระบุ actor ฝั่ง Platform; ไม่ใช่สิทธิ์อ่าน clinical data โดยอัตโนมัติ และไม่จำเป็นต้องเป็นสมาชิก Hospital เพื่อให้มีสิทธิ์ reporting grant ในอนาคต

| บริบท | Actor และ scope | สิ่งที่ role/ความสัมพันธ์พิสูจน์ | สิ่งที่ไม่ให้สิทธิ์ |
| --- | --- | --- | --- |
| Platform administration | Role.ADMIN; Global reporting ต้องมี capability/grant ที่อนุมัติแยก | ตัวตนผู้ดูแล Platform และ governance actions ที่มี policy เฉพาะ | Patient/Program read, Hospital OWNER authority, Network OWNER authority หรือ export |
| Hospital operations | Role.HOSPITAL พร้อม direct active HospitalMembership ที่ target Hospital; OSM ใช้ exact active assignment ตาม operation | เฉพาะ Hospital, PatientHospitalRelationship และ Program ที่ policy ปัจจุบัน resolve ได้ | Global reporting หรือ scope ของ Hospital อื่นจาก membership เดียว |
| Hospital Network reporting | direct Parent Hospital OWNER ตาม contract HN-C0/HN-C1 ที่แยกต่างหาก | Network aggregate candidate ตาม direct Parent/eligible child contract | Patient-level access ผ่าน hierarchy, Global Platform access หรือ export |

ADMIN-only ไม่ผ่าน Network Owner policy; multi-role actor จะใช้ Network capability ได้ก็ต่อเมื่อมี Role.HOSPITAL พร้อม direct active OWNER membership ที่ eligible Parent Hospital และผ่าน Network policy แยกอย่างอิสระ

HN-M07 และ historical reparent disclosure ยังคง OPEN blocker; HN-M08 ยังคง DEFERRED / NOT AUTHORIZED. Global Platform reporting ไม่ใช่ Hospital Network capability และไม่มีการเปลี่ยน HN-C0/HN-C1 ใน phase นี้

### 1.1 หลักฐานจาก source ปัจจุบัน

| ข้อสังเกตที่ตรวจแล้ว | ความหมายและขอบเขต |
| --- | --- |
| ActorContext มี User/Person ID, roles, direct Hospital memberships และ OSM-Hospital relationships; actor resolver ตรวจ User ACTIVE และ role/membership/status มาจาก DB | ไม่มี Global reporting entitlement ใน ActorContext ปัจจุบัน; การโหลด ActorContext ครั้งหนึ่งไม่ใช่หลักฐานว่า grant หรือ scope ยังไม่ถูก revoke ภายหลัง |
| Hospital governance มี hospital:read-governance, hospital:suspend, hospital:restore โดย policy กำหนด Platform ADMIN | governance capability ไม่ใช่ reporting capability หรือ Patient read |
| Patient directory ใช้ patient:read และ direct active Hospital OWNER/MEMBER scope หรือ exact OSM assigned relationships | query คืน Hospital-local name/number/classification และ directory detail มี demographic/contact fields; จำกัดแบบ Hospital/assignment จึงห้ามนำ query นี้ไปใช้เป็น Global directory โดยไม่ทำ policy/projection ใหม่ |
| Patient classification มี patient:classification:read/manage แยก; read จำกัด direct active Hospital scope หรือ exact active OSM assignment; count query เป็น exact-Hospital PatientHospitalRelationship rows | RISK/DIABETES current state ไม่ใช่ DM/Pre-DM clinical definition หรือ Global metric approval |
| OSM assignment ใช้ patient:assign-osm และ active direct Hospital OWNER membership; mutation authority ไม่ได้แปลเป็น Patient read grant | OWNER policy เป็น Hospital operation เท่านั้น; ไม่อนุญาต Global reporting หรือ Parent/Child scope |
| Patient Program access query ตรวจ Patient user role, target Hospital ACTIVE, direct active Hospital membership หรือ exact active OSM assignment | Role.ADMIN-only ถูกปฏิเสธใน Program read policy; report:program:read ยังเป็น exact Program เท่านั้น |
| report:program:read ครอบ policy ของ Patient Program สำหรับ exact Program; access resolver ตรวจ relationship ID ให้ตรงกับ Program | เป็น exact-Program factual read เท่านั้น ไม่ใช่ cohort, Global, export หรือ capability grant |
| Program report projection มี identity display, Program lifecycle, linked Baseline, Service 1 facts/evidence metadata, Goal Plan, Follow-up และ Final Assessment บางส่วน | มี measurements และ note fields บางชนิด; เป็น projection เฉพาะ operation ปัจจุบัน ไม่ใช่ field allowlist ที่อนุมัติสำหรับ Global Admin |
| PatientHospitalRelationship ผูก PatientProfile กับ Hospital และมี Hospital-local hospitalNumber; PatientProgram ผูก exact relationship; Person identity เป็น global identity link | ต้อง grant และ resolve exact Hospital/relationship/Program ก่อนอ่าน care records; ห้ามใช้ Person join เพื่อขยายไป Hospital อื่น |
| AuditEvent และ recordAuditEvent มีอยู่; audit schema จำกัด metadata และปฏิเสธ key sensitive บางประเภท | พบการ audit mutation ที่มีอยู่ แต่ไม่พบ Global reporting read audit; retention/access policy ยังไม่ได้รับการยืนยัน |

หลักฐานอ้างอิง: [ADR-0002](../adr/0002-role-capability-scope-authorization.md), [Architecture baseline](../architecture/DEMI_ARCHITECTURE_BASELINE.md), [Prisma schema](../../prisma/schema.prisma), [ActorContext](../../src/modules/auth/types/actor-context.ts), [actor resolver](../../src/modules/auth/services/actor-context-service.ts), [governance policy](../../src/modules/hospital-governance/policies/hospital-governance-policy.ts), [Patient directory policy/query](../../src/modules/patient-directory/policies/patient-directory-policy.ts) / [query service](../../src/modules/patient-directory/services/patient-directory-query-service.ts), [Patient Program policy/access](../../src/modules/patient-program/policies/patient-program-policy.ts) / [access service](../../src/modules/patient-program/services/patient-program-access-service.ts), [classification policy/access/query](../../src/modules/patient-classification/policies/patient-classification-policy.ts) / [access service](../../src/modules/patient-classification/services/patient-classification-access-service.ts) / [query service](../../src/modules/patient-classification/services/patient-classification-query-service.ts), [OSM assignment policy/query](../../src/modules/patient-assignment/policies/patient-osm-assignment-policy.ts) / [query service](../../src/modules/patient-assignment/services/patient-osm-assignment-query-service.ts), [report policy/access/query](../../src/modules/reporting/policies/program-report-policy.ts) / [access service](../../src/modules/reporting/services/program-report-access-service.ts) / [query service](../../src/modules/reporting/services/program-report-query-service.ts) / [projection](../../src/modules/reporting/projections/program-report-projection.ts), [audit service/schema](../../src/modules/audit/services/audit-service.ts) / [schema](../../src/modules/audit/schemas/audit-schemas.ts).

## 2. Access levels และ candidate capabilities

ชื่อ capability ทั้งหมดในตารางเป็น **candidate identifiers only** ตามรูปแบบ vocabulary เดิม เช่น report:program:read. ยังไม่ใช่ permission ที่อนุมัติหรือ implement. Capability ไม่สืบทอดถึงกันเอง; การมี capability หนึ่งไม่ทำให้มี capability อื่น

Readiness: ทุก candidate ยังไม่ approved และไม่มี runtime implementation. Global overview/per-Hospital summary ยังคงรอ policy, population/metric และ aggregate privacy review; Patient directory, identity และ detail อยู่ใน SECURITY_PRIVACY_BLOCKED จนกว่าจะมี independent approval และ field/scope contract.

| Candidate | Purpose / actor / additional grant | Target และ scope ที่ server ต้อง resolve | ข้อมูลที่อาจเปิดเผย / explicit exclusion | Dependency, revoke, audit และ classification | Authority / readiness |
| --- | --- | --- | --- | --- | --- |
| report:global:summary:read | ภาพรวมระบบให้ Platform Role.ADMIN ที่ active พร้อม grant เฉพาะ summary | Population ของ Hospitals/relationships/Programs ที่อนุมัติ; scope GLOBAL ใช้ได้เฉพาะกับ aggregate ที่อนุมัติ | Approved, non-identifying measures เท่านั้น; ห้าม Patient identifiers, row-level output หรือสูตรที่ยังไม่รับรอง | ต้องกำหนด population/grain/time/freshness/suppression; recheck role/grant/policy ทุก request; audit summary access/denial; aggregate remains sensitive | Product/Operations, Privacy/Security; metric owner/Clinical เมื่อมี clinical meaning; PROPOSED / SECURITY REVIEW PENDING |
| report:global:hospital-summary:read | เปรียบเทียบ Hospital โดย Platform Role.ADMIN active และมี grant เฉพาะ per-Hospital summary | Hospital IDs จาก authoritative eligible set; server-resolved exact Hospital; ไม่รับ browser ID เป็น permission | Approved aggregate ตาม semantics เดียวกับ Level A; ไม่มี Patient rows/identifiers และไม่มี hierarchy inheritance | Hospital eligibility/status, metric consistency, small-cell/differencing, time/freshness; recheck Hospital/grant; audit selected target/decision โดยลด identifiers | Product/Operations, Privacy/Security, Data Controller ตามข้อมูล; PROPOSED / SECURITY REVIEW PENDING |
| report:global:patient-directory:read | ค้นพบ PatientHospitalRelationship โดย Role.ADMIN active พร้อม grant directory แยก | Exact grant scope: all eligible Hospitals เป็นเพียง option, selected Hospitals หรือ selected cases/relationships; ต้อง resolve relationship ใน Hospital นั้น | Discovery อาจคืน opaque relationship locator เท่าที่จำเป็น; ไม่ได้ให้ identity fields หรือ care detail | ต้องตัดสิน Hospital set, search fields/mode, page/limits, anti-enumeration, rate controls; reauthorize ทุก page; audit search/denial โดยไม่เก็บ raw term; identifiable lookup is sensitive | Product, Security, Privacy, Data Controller; PROPOSED / SECURITY_PRIVACY_BLOCKED |
| report:global:patient-identity:read | เปิดเผย identity fields แยกจากการค้นพบ; Role.ADMIN active พร้อม identity grant | exact granted PatientHospitalRelationship; identity ที่คืนต้องอยู่ใน field allowlist และ Hospital context ที่ชัด | Candidate fields ต้องตัดสินเป็นราย field เช่น ชื่อ, Hospital-local number, วันเกิด, contact; national ID ไม่อนุญาตโดย default | Depends on disclosure purpose/necessity, cross-Hospital correlation and masking; recheck grant; audit identity access; identifiable personal data | Privacy, Data Controller, Security; Product/Data Owner; PROPOSED / SECURITY_PRIVACY_BLOCKED |
| report:global:patient-detail:read | เปิด Patient/Program detail โดย Role.ADMIN active พร้อม detail grant ที่เจาะจง | Hospital → PatientHospitalRelationship → exact PatientProgram; selected Hospital, selected relationship/case, time interval และ field set เป็น grant options | เฉพาะ field allowlist ที่อนุมัติ; ไม่ทำให้ global Person link รวม care records; ไม่ให้ mutation/export | แยก identity, lifecycle, measurements, activity, notes, attachments; revalidate every request; audit detail open/denial/abort; health/clinical data | Data Controller, Privacy, Security, Clinical authority ตาม field, Product; PROPOSED / SECURITY_PRIVACY_BLOCKED |
| report:hospital:summary:read | Hospital dashboard candidate; Role.HOSPITAL และ direct active membership; OWNER/MEMBER authority ตาม operation ยังต้องตัดสิน | exact direct Hospital membership; ไม่ขยาย parent/child; Patient scope ตาม existing domain policy | Aggregate ที่อนุมัติเท่านั้น; membership ไม่ให้ Global, Patient detail หรือ export โดยปริยาย | ต้องแยกจาก report:global:* และปิด metric/privacy gates; recheck membership/Hospital status ทุก request; audit access; aggregate sensitivity | Product, Hospital/Data Owner, Privacy/Security; PROPOSED / NOT IMPLEMENTED |

### 2.1 Level A — Global overview

ระบบอาจนำเสนอจำนวน Hospital, Patient/relationship/Program, lifecycle facts, service/follow-up summaries และ operational results ได้เมื่ออนุมัติ population, counting grain, time boundaries, freshness และ privacy controls แล้วเท่านั้น. เอกสารนี้ไม่กำหนดสูตรทางคลินิก ไม่ตีความ RISK/DIABETES เป็น DM/Pre-DM และไม่อนุมาน denominators หรือ outcome. ค่า count แม้ไม่มีชื่อก็ยังอาจเป็นข้อมูลอ่อนไหว

ก่อนคืน aggregate ต้องมี policy สำหรับ eligible Hospital set, duplicate/cross-Hospital counting, small cells, complementary suppression, repeated-query differencing และสถานะ unavailable/suppressed ที่ไม่เปิด existence. หาก gate ที่กระทบตัวเลขยังเปิด ให้ใช้ safe non-numeric/unavailable response ตาม contract ที่อนุมัติภายหลัง; ห้ามแทนด้วยศูนย์

### 2.2 Level B — Per-Hospital summary

Hospital comparison ต้องใช้ metric definitions, population grain, time semantics และ freshness เดียวกับ Level A. Server ต้อง resolve Hospital จาก eligible set และตรวจ status ปัจจุบัน. การเปลี่ยน Hospital ID ใน browser ต้องไม่เปลี่ยน entitlement. Hospital summary ไม่คืน raw Patient record; Parent Hospital ไม่ได้ Child summary จาก hierarchy โดยอัตโนมัติ; dimensions ที่เทียบกันได้ต้องมีรายการอนุมัติและทดสอบ differencing.

### 2.3 Level C — Patient discovery และ identity

Directory discovery และ identity disclosure เป็นคนละ capability. Directory-only grant อาจค้นพบ relationship locator ที่จำเป็น แต่ไม่แสดงชื่อ, hospitalNumber, national ID, contact หรือ clinical facts เว้นแต่มี identity grant ที่ครอบ field นั้นด้วย

ต้องตัดสิน Hospital set, exact/partial matching, name search, exact Hospital-local number, national-ID search, pagination, query bounds, rate limits, enumeration monitoring, result limits, duplicate/ambiguous identity behavior, search audit/retention และ cross-Hospital correlation. ค่าเริ่มต้นที่ปลอดภัยก่อนอนุมัติคือไม่เปิด Global directory และไม่ยอมรับ free-text/name/national-ID search; national ID ไม่เป็น searchable/display field โดยปริยาย. Current Person schema stores identityKeyHash as an HMAC lookup key, not a raw National ID; the login identity resolver is not a Global search permission. ห้ามบันทึก search terms หรือเลขบัตรใน audit/log. หากอนาคตอนุมัติ search ให้ใช้ server-side scope predicate, bounded request/page และ anti-enumeration response ที่ไม่ยืนยันการมีอยู่เกินข้อมูลที่อนุมัติ

### 2.4 Level D — Patient / Program detail และ field review

Locator จาก browser เช่น Hospital ID, PatientProfile ID, PatientHospitalRelationship ID หรือ Program ID ใช้ระบุตำแหน่งเท่านั้น ไม่พิสูจน์ permission. ลำดับ resolution ที่เสนอคือ:

Hospital ที่ grant ครอบคลุมและยัง eligible
→ PatientHospitalRelationship ที่อยู่ Hospital นั้น
→ PatientProgram ที่ผูก relationship เดียวกัน
→ field projection ที่ grant และ field allowlist อนุญาต

PatientProfile/Person global identity ห้ามใช้เป็น join shortcut เพื่อคืน relationship หรือ care record ของ Hospital อื่น. ก่อน detail response ต้องตรวจ exact ownership chain จาก authoritative records

| Field category | ตัวอย่างข้อมูลใน source | Contract decision ที่ยังต้องมี |
| --- | --- | --- |
| Minimum Patient identity | display name, opaque relationship locator | วัตถุประสงค์, field จำเป็น, masking, identity permission แยก |
| Hospital-local identifier | hospitalNumber | Hospital-local meaning, disclosure necessity, uniqueness/masking |
| Program lifecycle facts | status, startedAt/completedAt, createdAt | approved use, actor/provenance display, time labels |
| Baseline measurements | weight, heightCm, waist, BP, DTX, HbA1c, adaptation/confidence/summary fields | clinical owner, field/unit/time/source meaning, least-necessary subset |
| Service activity records | Service 1 status/time/evidence metadata | meaning and sensitive evidence metadata; actual content/link exclusion |
| Goal Plan | goal/activity codes, targets, primaryGoalNote, weeklyNote | structured vs narrative split; per-field approval |
| Follow-up | measurements, activity status, note, round/date | field-specific health and narrative disclosure approval |
| Final Assessment | measurements and recorded time/provenance | clinical purpose, meaning and approved fields |
| Clinical scores/outcomes | Screening, confidence or derived outcomes | clinical formula/version/input approval; no inferred formula |
| Free-text narratives | notes, summaries, recommendations, obstacles | default excluded until individually reviewed; high re-identification/sensitivity risk |
| Attached evidence/files | artifacts, image/document content, signed URLs | default excluded; separate file purpose, access, expiry and audit contract |

รายการข้างต้นเป็น field-review checklist ไม่ใช่ allowlist. Patient detail grant ไม่ทำให้ทุก category visible; unauthorized field request ต้อง fail closed หรือส่งผล safe ตาม response contract ที่ Security/Privacy รับรอง. Detail read ไม่ให้สร้าง/แก้ record, assignment, impersonation, CSV/XLSX, bulk API หรือไฟล์แนบ

## 3. Platform Admin entitlement/grant contract — proposal

Role.ADMIN เป็น prerequisite ของ Platform grant ไม่ใช่ grant เอง. ผู้ใช้ที่มี ADMIN แต่ไม่มี reporting entitlement ต้องถูกปฏิเสธข้อมูล Patient และ Global reporting ที่ยังไม่ได้รับอนุมัติ. ไม่ต้องสร้าง Hospital OWNER/MEMBER membership เพื่อให้ Platform Admin มี reporting grant; membership เป็น Hospital operations scope คนละ authorization context

### 3.1 ทางเลือกที่ต้อง review

| ทางเลือก | รูปแบบ | ประเมิน |
| --- | --- | --- |
| A. ADMIN + explicit capability grants | Role.ADMIN active และ grant แยกตาม capability | จำเป็นต่อการกัน role-only access; capability ต้องไม่ imply กัน |
| B. Bounded Hospital/resource entitlement | เพิ่ม target Hospital, relationship/case, Program, field set หรือ interval ลง grant | จำเป็นต่อ Patient access แบบ least privilege; all-Hospital เป็น option ที่ต้องมีเหตุผล/อนุมัติ ไม่ใช่ default |
| C. Time-/purpose-bound approval | ผูก validity, purpose หรือ case reference และ expiry | ควรให้ Security/Privacy/Data Controller ตัดสินความจำเป็นและกรณีใช้; ไม่เลือกกลไกหรือเวลาในเอกสารนี้ |

ข้อเสนอเพื่อ review: Patient-level access ต้องรวม A กับ B; ให้ decision authority ตัดสินว่าต้องมี C เสมอหรือเฉพาะบาง case. ยังไม่เลือก schema, issuer workflow, retention หรือ enforcement implementation

### 3.2 Minimum grant facts ที่ต้องนิยามก่อนอนุมัติ

ทุก grant ที่จะใช้จริงต้องระบุอย่างน้อย:

- subject User ID และหลักฐานว่า User ยัง ACTIVE พร้อม Role.ADMIN ในเวลาตัดสิน
- capability แบบเจาะจง; ห้าม wildcard หรือ capability inheritance โดยปริยาย
- allowed Hospital set และ resource type/IDs ที่ครอบคลุม; ระบุชัดว่า all eligible Hospitals, selected Hospitals หรือ selected cases/relationships
- allowed field categories/field names; ระบุข้อมูลที่ห้ามคืนด้วย
- purpose ที่อนุมัติและ approved purpose/case reference หากจำเป็น
- issuer/granting authority, approving authority และหลักฐาน/วันที่/ขอบเขต/เวอร์ชันการอนุมัติ
- issue time, effective time, expiry ถ้ามี, revoked state/time/actor และ revocation reason/reference ตามนโยบาย
- policy/grant version หรือ generation สำหรับ revalidation และ audit provenance
- exact denial behavior เมื่อ role/account/Hospital/relationship/Program/grant หมดอายุ ถูกพัก ถูกยกเลิก หรือข้อมูลไม่ครบ/ขัดแย้ง

ข้อเสนอ denial rule: ปฏิเสธเมื่อ ADMIN หาย/ไม่ active, grant ขาด/ยังไม่ effective/expired/revoked, capability ไม่ตรง, purpose ไม่ผ่าน, target/field อยู่นอก grant, Hospital ไม่ eligible/ถูกพัก, relationship/Program chain ไม่ตรง, identity ambiguous, revalidation ล้มเหลว หรือ decision authority ยังไม่ปิด. ห้าม fallback ไป membership, report:program:read, Parent ownership หรือ global Person

## 4. Proposed server-side decision contract

ทุก future transport ใช้ server-side application service และ policy เดียวกัน. UI/page visibility ไม่ใช่ authorization boundary. Decision inputs ขั้นต่ำ:

- authenticated actor จาก current server session และ current User/role status
- requested capability ที่ validate จาก closed vocabulary
- grant ที่ authoritative และ valid ตอน request
- server-resolved Hospital/resource target และ exact relationship/Program ownership
- requested field categories/allowlist และ approved purpose/context ถ้ากำหนด
- current Hospital, Patient relationship, Program และ grant state
- policy/grant version และ audit decision context ที่ไม่เก็บ clinical payload

ลำดับตรวจที่เสนอ:

1. ตรวจ transport input/schema, size, query/page bounds และ abuse/rate controls ที่อนุมัติ
2. resolve authenticated User บน server; ปฏิเสธ account ที่ไม่ active หรือ auth subject mismatch
3. ตรวจ capability ที่ร้องขอเป็น candidate ที่ผ่าน approval; unknown/unsupported = deny
4. ตรวจ prerequisite Role.ADMIN หรือ direct Hospital/OSM eligibility ของบริบทที่ตรงกัน
5. อ่านและตรวจ grant, purpose, effective/expiry/revocation และ grant version ปัจจุบัน
6. resolve eligible target Hospital และ relationship/Program ด้วย authoritative DB predicate ที่ผูก scope ไว้ก่อนอ่าน records
7. ตรวจ exact ownership chain และ status ของ resource; locator จาก client เป็นเพียงเงื่อนไขค้นหา
8. enforce field allowlist ใน query select และ projection/serialization; ไม่โหลดทั้งหมดแล้วกรองที่ UI
9. revalidate เงื่อนไขที่เปลี่ยนระหว่าง query ตาม consistency contract ที่อนุมัติ; ความไม่แน่ใจให้หยุด
10. เขียน audit metadata ขั้นต่ำตาม policy; audit failure behavior ต้องอนุมัติก่อน sensitive response
11. คืน safe projection และ safe denial/error โดยไม่เปิด SQL, record existence, raw clinical data หรือ grant internals

Boundary ที่ต้องบังคับเมื่อ implementation ได้รับอนุญาต: page/data loader และทุก Server Action/API transport, application service, policy/access resolver, DB query/resource predicate, field select/projection/serialization. หากเพิ่ม API ภายหลังให้ versioned contract ตาม ADR/project rules และเรียก service/policy เดิม. DB/RLS หากใช้เป็น defense-in-depth ไม่แทน application policy; phase นี้ไม่เสนอหรือแก้ RLS

ห้ามใช้เงื่อนไข Role.ADMIN แล้ว allow ทั้งหมด. ห้ามนำ Hospital OWNER governance policy มาเป็น shortcut ให้ Patient read. ใช้รูปแบบที่ reuse ได้จากปัจจุบัน ได้แก่ server-resolved actor, exact Hospital predicate, exact relationship/Program checks, bounded query inputs, minimal Prisma select, shared service/policy across transports และ audit validator; อย่า reuse scope ที่กว้างไม่ตรง operation

## 5. Revocation, consistency และ concurrency

| เหตุการณ์ | การตัดสินที่ future contract ต้องกำหนด | ความเสี่ยงที่ยังเปิด |
| --- | --- | --- |
| ADMIN role removed / account suspended | ตรวจ current role/status ซ้ำและ deny requests/pages ใหม่ | session หรือ ActorContext ที่ resolve ก่อนการเปลี่ยนแปลงอาจยังอยู่ใน memory |
| Grant revoked/expired | request ใหม่และ page ถัดไปต้อง reauthorize จาก grant state ปัจจุบัน; abort เมื่อ revalidation พบ revoke | query ที่เริ่มก่อน revoke อาจอ่านและกำลังจะส่ง response |
| Hospital suspended | deny Hospital summary/discovery/detail สำหรับ Hospital นั้นตาม policy ที่รับรอง | scope/list/count ที่อ่านก่อน suspend อาจ stale |
| PatientHospitalRelationship หรือ Program เปลี่ยน/ปิดสิทธิ์ | ตรวจ exact relationship/Program chain และ current eligibility ทุก request | multi-query projection อาจเห็น state คนละเวลา |
| Multi-role transition | ประเมิน capability/context ที่ระบุ ไม่รวม role เป็น additive bypass; แต่ละ direct Hospital role ยังคง scope ของตน | stale role snapshot หรือ wrong workspace context |
| Pagination | page token ผูก actor, capability, grant/policy generation, scope และ cursor; authorize ใหม่ทุก page | revoke หลัง page 1; cursor ที่ส่งซ้ำ/แก้ไข; เปลี่ยน eligible Hospital set |
| Cache, prefetch, previously opened page | ไม่มี cross-actor/grant/Hospital reuse; page change และ sensitive read ต้อง reauthorize; stale UI ไม่ได้เป็น access | browser memory/back-forward/prefetch อาจยังแสดงข้อมูลที่เคยส่งแล้ว |
| Request in flight | ระบุ decision time, read boundary, revalidation boundary และ response boundary; stop/abort หากตรวจพบ revoke ก่อนส่งได้ | revoke หลัง final check แต่ก่อน/ระหว่างส่งตอบกลับไม่อาจถอนข้อมูลที่ส่งแล้ว |

ActorContext ปัจจุบันตรวจ User ACTIVE ระหว่าง resolve; Program access service มี DB re-read actor/role/membership และ scoped relationship checks. อย่างไรก็ตาม Program reporting query ไม่เปิด transaction เองและอ่าน access, Program, Baseline, Final, Goal Plan, Follow-up หลาย query; ความสามารถส่ง TransactionClient ไม่ได้พิสูจน์ว่าเรียกใช้ transaction หรือเป็น coherent snapshot ทุกครั้ง. การ resolve ActorContext หนึ่งครั้งไม่รับรอง revocation safety ข้าม request หรือ in-flight response

กลยุทธ์ที่ Security/Architecture/DB ต้องประเมินก่อน implementation: (ก) current role/grant/resource predicates ใน query เดียว/ขอบเขต transaction ที่พิสูจน์ได้, (ข) final authorization version check ก่อน serialize/deliver, (ค) grant/policy generation เพื่อ invalidate page/cache tokens, หรือ (ง) combination ที่ตรงกับ consistency guarantee ที่ต้องการ. ต้องชั่ง latency, transaction semantics, false abort และช่อง race; เอกสารนี้ไม่เลือก isolation level, lock, snapshot หรือ claim ว่ากลยุทธ์ใดกำจัด race ได้หมด

การ revoke หยุด response ในอนาคตได้ตาม consistency guarantee ที่อนุมัติ แต่เรียกคืนข้อมูลที่ผู้ใช้เห็น/ดาวน์โหลด/ถ่ายภาพหน้าจอไปแล้วไม่ได้. Stale session ต้องได้ safe deny/re-authentication ที่ไม่เปิด resource existence; error และ unavailable ต้องไม่กลายเป็น zero/empty ที่ชวนตีความเป็นข้อมูลจริง

### 5.1 Cache, query และ pagination requirements

- Patient directory/detail/Program detail เป็น sensitive response; candidate default คือ private no-store หรือเทียบเท่าที่ Security/Architecture รับรอง
- ถ้าอนาคตอนุญาต server cache: key ต้องผูก actor ID, capability, grant ID/version, exact Hospital/resource scope, field set และ policy generation; ห้ามใช้ shared key ข้าม actor/grant/scope
- grant/role/account/Hospital/resource change ต้องมี invalidation หรือ revalidation ที่กำหนด; TTL อย่างเดียวไม่พิสูจน์ revoke
- authorize ใหม่ทุก navigation, detail open, page/cursor continuation, prefetch และ retry; cursor ต้อง opaque/validated/bounded และไม่เปิดข้อมูลจาก query scope อื่น
- กำหนด pagination/query ceilings, stable ordering, rate limit/abuse response ก่อน directory; ไม่ expose total count ที่ enable enumeration หากยังไม่ได้อนุมัติ
- ห้ามมี client/local cache ที่เป็นเหตุให้ stale Patient data แสดงต่อหลัง session/context เปลี่ยน; client cache policy และ back-forward behavior ต้อง review

## 6. Privacy, purpose และ audit proposal

### 6.1 Purpose / data governance

ก่อนเปิด Patient data ต้องมี lawful/legitimate processing purpose, legal/privacy basis, Data Controller ที่รับผิดชอบ, authorized grant issuer, minimum necessary fields, disclosure conditions, access review cadence, retention/deletion, incident handling, audit access restrictions และ patient-notice/consent decision ตาม governance ที่ใช้จริง. Product requirement หรือ technical architecture ไม่ใช่การตัดสินกฎหมาย. เอกสารนี้ไม่อ้าง PDPA compliance

### 6.2 Candidate audit events

- global reporting entitlement issued, changed, revoked, expired
- global summary/per-Hospital summary accessed หรือถูกปฏิเสธ
- Patient directory searched, detail opened, access denied หรือ aborted เมื่อพบ revocation
- repeated/suspicious enumeration หรือ search-bound violation
- audit integrity/persistence failure ตาม approved handling

Metadata ขั้นต่ำที่ review ได้: actor User ID, action/capability, grant/policy reference/version, Hospital/resource reference เมื่อจำเป็น, decision/outcome category, timestamp, correlation/request ID และ approved purpose/case reference. บันทึกได้เฉพาะ metadata ที่ Security/Privacy อนุมัติ. ห้ามบันทึก Patient row/body, ชื่อ, National ID, raw search term, measurement, free-text note, attachment/workbook body, raw SQL/query payload, access token หรือเหตุผล error ภายใน. Resource IDs เองอาจ sensitive; ต้องเลือก pseudonymous/reference strategy และ access restriction ก่อนใช้

AuditEvent/recordAuditEvent และ schema validation ปัจจุบันเป็นจุด reuse สำหรับ audit boundary เท่านั้น; ไม่พบ read-event implementation สำหรับ Reporting ใน source ที่ตรวจ. Retention, deletion, audit-log reader authorization, access review, failed/denied event retention และ incident process ยังเป็น decision ไม่ใช่คุณสมบัติที่ยืนยันแล้ว

## 7. Cross-Hospital isolation และ policy separation

- Platform global scope เป็น entitlement ที่อนุมัติแยก; ไม่เท่ากับ Role.ADMIN อย่างเดียวและไม่ต้องพึ่ง Hospital membership
- Hospital operations ใช้ direct Hospital membership/assignment และ exact relationship/Program ตาม policy ปัจจุบัน; ไม่ได้สิทธิ์ Global summary จาก OWNER/MEMBER
- Hospital Network ใช้ direct Parent OWNER และ aggregate-only HN contract; no Patient rows, no clinical drill-down, no hierarchy-based patient permission
- PatientProfile/Person อาจเชื่อม identity เดียวกับหลาย Hospital relationships; authorization ต่อ relationship A ไม่ให้ join/disclose relationship B
- report:program:read, patient:read, program:read, hospital:read-governance, parentHospitalId และ local Hospital selection ไม่เป็น substitute สำหรับ Global grant
- Patient detail ไม่ให้ mutation, OSM assignment, clinical record creation, impersonation, bulk API, CSV/XLSX หรือ attachment download
- RPT-24 exact-Hospital Excel export, Global on-screen reporting และ HN Network aggregate เป็นสาม contracts แยก; approval ในขอบเขตหนึ่งไม่ขยายอีกขอบเขตหนึ่ง

ไม่จำเป็นต้องแก้ accepted ADR-0002 ใน phase documentation นี้. ก่อน implementation อาจเสนอ ADR addendum/proposal เพื่อระบุว่า Platform-scoped reporting grant แยกจาก role/membership และ Patient-level access มี scoped grant/purpose/field controls; ต้องให้ ADR authority พิจารณาเป็นงานแยก ห้ามเปลี่ยน accepted ADR โดยนัย

## 8. Readiness gates

Phase 18C.1B ผลลัพธ์คือ **SECURITY CONTRACT PREPARED** เท่านั้น. ก่อน design freeze/implementation ต้องปิด security decisions ใน [Security Decision Register](./PHASE_18C1B_SECURITY_DECISION_REGISTER.md), ตกลง field/population semantics ที่พึ่ง R24A-D01–D15 โดยไม่เปลี่ยนสถานะ, ปิด Data Controller/Privacy/Clinical approvals ที่เกี่ยวข้อง และรับ implementation authorization แยก. [Synthetic Acceptance Matrix](./PHASE_18C1B_SECURITY_ACCEPTANCE_MATRIX.md) เป็น test design เท่านั้น ยังไม่ใช่ test execution

- Requester product direction: CONFIRMED / OWNER_RECEIVED (GR-REQ-01)
- Global policy: PROPOSED / SECURITY REVIEW PENDING
- Patient-level access: SECURITY_PRIVACY_BLOCKED
- Data Controller approval: PENDING
- Implementation: NOT AUTHORIZED
- HN-M07 / historical reparent disclosure: OPEN
- HN-M08: DEFERRED / NOT AUTHORIZED
- R24A-D01–D15: PROPOSED FOR REQUESTER / CUSTOMER REVIEW
- RPT-24C export authorization/security/privacy/snapshot/delivery gates: OPEN

## 9. References

- [Phase 18C.1A requirement reconciliation](./PHASE_18C1A_GLOBAL_REPORTING_REQUIREMENT_RECONCILIATION.md) — GR-REQ-01, reporting scopes, current readiness
- [Phase 18C.1 decision register](./PHASE_18C1_DECISION_REVIEW_REGISTER.md), [clinical sign-off form](./PHASE_18C1_CUSTOMER_CLINICAL_SIGNOFF.md) และ [implementation gate matrix](./PHASE_18C1_IMPLEMENTATION_GATE_MATRIX.md)
- [RPT-24 export contract](./PHASE_17_RPT24_ON_DEMAND_ASOF_EXCEL_EXPORT_CONTRACT.md), [RPT-24A customer workbook decision pack](./PHASE_17_RPT24A_CUSTOMER_WORKBOOK_DECISION_PACK.md), [Phase 18B data gap verification](./PHASE_18B_EXCEL_DATA_GAP_VERIFICATION.md)
- [HN-C0 closeout](./PHASE_17K0B_HN_OWNER_DECISION_CLOSEOUT.md), [HN-C1 Security & Disclosure Contract](./PHASE_17K_HNC1_SECURITY_DISCLOSURE_CONTRACT.md), [HN-C1 Decision Direction Record](./PHASE_17K_HNC1_DECISION_DIRECTION_RECORD.md)
- [Global Reporting Security Decision Register](./PHASE_18C1B_SECURITY_DECISION_REGISTER.md) และ [Synthetic Acceptance Matrix](./PHASE_18C1B_SECURITY_ACCEPTANCE_MATRIX.md)
