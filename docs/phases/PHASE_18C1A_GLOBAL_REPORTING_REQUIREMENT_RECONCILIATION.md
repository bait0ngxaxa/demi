# Phase 18C.1A — Hospital and Global Reporting Requirement Reconciliation

- **ผล Phase:** GLOBAL REPORTING PRODUCT DIRECTION RECORDED / ACCESS CONTRACT OPEN / IMPLEMENTATION NOT AUTHORIZED
- **HEAD ที่ตรวจ:** main / 23dd09356db3c06e70507c0800b70f7923fcbfda
- **วันที่บันทึกคำยืนยัน:** 2026-10-10
- **ขอบเขต:** documentation-only; ไม่เปลี่ยน runtime, schema, authorization, export หรือ production access

เอกสารนี้เพิ่มหลักฐานและการตีความต่อจาก Phase 18C.1 โดยไม่แก้สถานะ R24A-D01–D15 หรือ HN-M01–HN-M08. รหัส **GR-REQ-01** เป็น requirement reference สำหรับ trace เท่านั้น ไม่ใช่ Decision ID และไม่แทน R24A-D16 หรือ HN-Mxx.

## 1. ทิศทางผลิตภัณฑ์ที่ผู้ร้องขอยืนยัน

คำขอ Phase 18C.1A ลงวันที่ 2026-10-10 ยืนยันว่าต้องมี reporting dashboard สำหรับ Hospital แต่ละแห่งและ Platform Admin ระดับระบบ โดย Global Admin ต้องทำได้ครบสามระดับ:

1. ดู system-wide reporting summaries.
2. เลือก Hospital และดูหรือเปรียบเทียบผลราย Hospital.
3. drill-down ไปยังข้อมูลราย Patient ข้าม Hospital ได้ **เฉพาะเมื่อมี patient-data access permission แยกที่อนุมัติและกำหนด scope ไว้อย่างชัดเจน**.

ข้อ 3 เป็น product requirement ที่บันทึกแล้ว ห้ามตัดออกเพราะ runtime ปัจจุบันยังไม่มีสิทธิ์ดังกล่าว. การยืนยันนี้ใช้สถานะ **OWNER_RECEIVED / REQUESTER-CONFIRMED PRODUCT DIRECTION** เฉพาะเจตนาผลิตภัณฑ์. ไม่พบชื่อผู้อนุมัติ ลายมือชื่อ minutes หรือหลักฐานอนุมัติจาก Security, Privacy, Data Controller หรือ Clinical authority.

การยืนยันผลิตภัณฑ์นี้ **ไม่ใช่** security/privacy/clinical approval, authorization policy, field disclosure approval, permission grant, implementation authorization หรือ production access. Default deny คงเดิมจนกว่าจะปิด gate ที่เกี่ยวข้อง.

## 2. หลักฐานและ provenance

| หลักฐาน | ข้อสังเกต | ขอบเขตความหมาย |
| --- | --- | --- |
| คำขอผู้ใช้ Phase 18C.1A, 2026-10-10 | ระบุ Hospital dashboard, Global summary, per-Hospital comparison และ cross-Hospital patient drill-down แบบมี permission แยก | หลักฐาน product direction; ไม่มีชื่อบุคคลหรือ independent approval |
| [Customer workbook](../Dashboard%20App%20Demi.xlsx) | มีชีต Dashboard ภาพรวม และ รายงานการจัดบริการ; XML dimensions A1:AQ29 และ A1:BM37; ไม่พบสูตร; เป็นแบบฟอร์ม/หัวตาราง ไม่ใช่ข้อมูล Patient | ยืนยันหัวข้อและ field ที่ลูกค้าต้องการเห็น; ไม่อนุมัติสูตร clinical, population, disclosure หรือ export |
| [RPT-24A](./PHASE_17_RPT24A_CUSTOMER_WORKBOOK_DECISION_PACK.md) §§3, 6, 13 | บันทึก workbook mapping และ D01–D15 เป็น PROPOSED FOR REQUESTER / CUSTOMER REVIEW | ยังคงเป็นแหล่ง canonical ของ workbook decision identities และ statuses |
| [Phase 17A](./PHASE_17A_CUSTOMER_FLOW_CANONICALIZATION_UAT_CONTRACT.md) RPT-02 | ณ baseline เดิม Hospital-wide dashboard/export ยังไม่มี route และเป็น REQUIREMENT-GATED | historical state ที่ถูกต้อง ณ เวลาตรวจ; คำยืนยันใหม่เปลี่ยน product intent แต่ไม่ทำให้ implementation เกิดย้อนหลัง |
| [Phase 18B](./PHASE_18B_EXCEL_DATA_GAP_VERIFICATION.md) และ [Phase 18C.0](./PHASE_18C0_DATA_CAPTURE_READINESS_MATRIX.md) | ยืนยัน data-source, projection, semantics และ authorization gaps ราย field | ยังคงใช้ได้; Phase 18C.1A เพิ่ม consumer scope ไม่ได้ปิด gap เหล่านี้ |
| Current source | มี exact-Program factual reporting projection; ไม่พบ Hospital cohort dashboard, Global aggregate projection หรือ Global patient-read policy/route | source behavior ไม่ใช่ customer approval และไม่อนุญาตการเข้าถึงใหม่ |

ไฟล์ workbook ที่ตรวจไม่มีข้อมูล Patient ในบริเวณ rows ข้อมูล และไม่มีสูตร. มี labels/formatting และข้อความประกอบสำหรับวิเคราะห์โครงสร้างเท่านั้น. ไม่ใช้ real patient data.

## 3. ขอบเขต Hospital Dashboard เทียบกับ Global Dashboard

| Consumer view | Product intent | ขอบเขตข้อมูลที่ต้องออกแบบ | สถานะ implementation ปัจจุบัน |
| --- | --- | --- | --- |
| Hospital — Dashboard ภาพรวม | Hospital ดู population, Program activity และ Before/During/After ตาม workbook | Hospital ที่ตรงกับ direct authorized scope; cohort และ denominator ต้องยืนยัน; Patient/Program detail ต้องตรวจ policy แยก | ยังไม่มี Hospital-wide aggregate/dashboard route; มีข้อมูลราย Patient/Program และ exact-Program report เท่านั้น |
| Hospital — รายงานการจัดบริการ | Hospital ดู Service 1, Goal Plan, Follow-up และ Final ตาม workbook | exact Hospital relationship และ Program; record presence, delivery, achievement และ outcome ต้องไม่ปะปน | ยังไม่มี Hospital cohort report/export; factual sources บางส่วนอ่านได้ใน exact Program scope |
| Global — Level A: overview | ผู้ได้รับอนุญาตดู system-wide summary | Aggregate only, ไม่มี Patient identifier; eligible Hospital, population grain, period, denominator, suppression และ snapshot ต้องอนุมัติ | ไม่มี Global summary projection/query/dashboard |
| Global — Level B: Hospital summary | ผู้ได้รับอนุญาตเลือกและเปรียบเทียบ Hospital ด้วยนิยามเดียวกัน | Exact Hospital context; ไม่มี Patient identifier; Hospital eligibility, status, deduplication และ small-cell disclosure เปิดอยู่ | มี Hospital governance directory สำหรับงานกำกับดูแล แต่ไม่ใช่ reporting projection หรือ patient-data grant |
| Global — Level C: Patient drill-down | Global Admin เข้าถึง Patient information ข้าม Hospital ได้เมื่อมีสิทธิ์แยก | แยก discovery, identity, exact Patient relationship และ exact Program detail; field allowlist, purpose, grant scope, revocation และ audit ต้องอนุมัติ | ไม่มี Global patient directory หรือ Global detail policy; ADMIN-only ถูก deny ใน exact Program report policy |

Hospital OWNER/MEMBER ไม่ได้สิทธิ์ dashboard หรือ export ทุกชนิดจาก membership เพียงอย่างเดียว. ปัจจุบัน Hospital/OSM ที่ผ่าน policy อ่าน Program report ได้เฉพาะ exact Program ตาม scope ที่ resolve บน server. Global view เป็น reporting scope คนละชุดและต้องมี capability/policy ของตนเอง.

## 4. Data lineage: import ถึง dashboard

การนำเข้าข้อมูลสร้าง Patient identity/relationship และบาง domain facts เท่านั้น. ไม่ได้สร้าง Patient Program โดยอัตโนมัติ. Dashboard ต้องอ่าน authoritative facts จาก module เจ้าของข้อมูล ไม่สร้างสำเนาเพื่อเลียนแบบ workbook.

| ขั้น | Source field / operation | Persisted fact และ ownership | Read-back ที่มีอยู่ | Gap / boundary |
| --- | --- | --- | --- | --- |
| Hospital eligibility | Hospital Master; Hospital governance submit/review/approve | Hospital.id, hospitalCode, name, status; HospitalMembership direct scope แยกจาก Platform ADMIN | listHospitalGovernanceDirectory อ่าน directory สำหรับ governance | สถานะ PENDING_VERIFICATION, ACTIVE, SUSPENDED มีอยู่; นิยามว่า status ใดนับในแต่ละ dashboard ยังต้องตัดสิน |
| Official import template | [Template จริง](../../public/templates/demi-patient-import-template-v1.xlsx) และ [template contract](../../src/modules/patient-provisioning/import/patient-import-template-contract.ts) | 28 columns A:AB ตาม canonical contract | excel-patient-import-adapter อ่านและสร้าง field assessment | parse ไม่เท่ากับ persist; target Hospital มาจาก server-validated operation ไม่ใช่ Hospital name ใน workbook |
| Patient identity / Hospital link | nationalId, givenName, familyName, HN; importPatientRoster → provisionPatientInTransaction | Person ใช้ identityKeyHash; ชื่อ Patient; PatientProfile; User/role; PatientHospitalRelationship ต่อ Hospital; hospitalNumber เป็น Hospital-local และ nullable | Patient directory query อ่าน relationship ภายใต้ direct Hospital หรือ exact OSM access | nationalId ใช้ resolve identity แบบ hash ไม่ใช่ display field; relationship ไม่มี lifecycle status history; ห้ามรวม Person ข้าม Hospital เพื่อเปิด care records |
| Initial Baseline | Template weight, height, waist, DTX, HbA1c; effective date; createPatientBaselineInTransaction | PatientBaseline ต่อ exact PatientHospitalRelationship; recordedOn, recordedByUserId, nullable measurements; heightCm เก็บ cm | Baseline query อ่านตาม relationship; Program report อ่าน Baseline ได้เฉพาะเมื่อ Program link ผ่าน initialBaselineId | Import Baseline ไม่สร้าง Program และไม่ทำให้ Baseline เป็น Before ของทุก Program; current Program projection ยังละ heightCm และ hba1c |
| Patient classification | Template กลุ่มเสี่ยง/เบาหวาน; setPatientClassificationInTransaction | PatientProfile-level RISK/DIABETES และ PatientClassificationHistory | getPatientClassificationCounts เป็น exact-Hospital query ปัจจุบันนับ PatientHospitalRelationship rows | ไม่เท่ากับ clinical DM/Pre-DM, ไม่มี Program-effective snapshot และ denominator/dedup ยังไม่อนุมัติ |
| OSM assignment | Template ชื่อผู้ดูแล; exact roster resolution; OWNER-specific assignment mutation | PatientOsmAssignment ผูก exact PatientHospitalRelationship มี createdAt/endedAt | assignment query อ่าน current/history ตาม operation | current assignment ไม่ใช่ผู้ดูแลย้อนหลังหรือหลักฐานว่า OSM ส่งมอบบริการ |
| Patient Program | การเปิด Program เป็น operation แยกจาก import | PatientProgram ผูก exact relationship; ACTIVE/COMPLETED, startedAt/completedAt; initialBaselineId เป็น nullable explicit link | getPatientProgramDetail และ Program report query | import ไม่เปิด Program; Program completion ไม่ใช่ผลลัพธ์สุขภาพสำเร็จ |
| Service 1 | Service 1 operations บันทึก routine/chart/dream/confidence แยกใน exact Program | PatientProgramServiceOne* และ evidence association บางชนิด | Service 1 query ถูกนำเข้า Program report projection | projection ยืนยัน record presence/provenance; ไม่ยืนยัน delivered, participation หรือ success |
| Goal Plan / Service 2 | createGoalPlanForProgram | PatientGoalPlan + PatientGoalItem: exact Program link เมื่อสร้างใน Program workflow, round, activity, targetDays/value/unit | Goal query และ exact Program report projection; legacy Goal Plan อาจไม่มี Program link | Goal target ไม่ใช่ achieved activity; period/revision/effective-date semantics ยังเปิด |
| Follow-up / Services 3–6 | createFollowupForProgram | PatientFollowup 0..N ต่อ Program, recordedAt/createdAt, measurements และ categorical activity progress | Follow-up query และ Program report projection มี pagination | recordedAt คือเวลา record ไม่ใช่ encounter time; DONE/PARTIAL/NOT_DONE/NOT_APPLICABLE ไม่ใช่ achieved-day count/rate; ไม่มี structured outcome/obstacle/adjustment fact ที่อนุมัติ |
| Final Assessment | createPatientFinalAssessment | PatientFinalAssessment exact Program + relationship; recordedAt, weight, waist, BP, blood sugar | Final Assessment query และ Program report projection | ไม่มี After HbA1c/height เทียบเท่า; Final record ไม่ได้แปลว่า Program completed |
| Factual reporting | getProgramReportingProjection | Projection อ่าน exact Program, Hospital, patient display name, linked Baseline, Service 1, Goal Plan, Follow-up และ Final | [Program report page](../../app/app/patients/%5BrelationshipId%5D/programs/%5BprogramId%5D/report/page.tsx) และ [query/projection](../../src/modules/reporting/services/program-report-query-service.ts) | เป็น exact-Program read; ไม่มี cohort/dashboard aggregation, Global Hospital summary, export query หรือ Global patient drill-down |

### Field ที่ template มีแต่ยังไม่ใช่ imported persistence

Template มี 28 columns จริง. Contract และ parser แยก field ที่ supported ออกจาก parsed requirement-gated fields. รายการต่อไปนี้ยังไม่ persist จาก bulk import แม้ schema บางส่วนจะมี field สำหรับ workflow อื่น:

| Template columns | Parsed fields | สถานะใน current import |
| --- | --- | --- |
| C, G, H | วันเกิด, เพศ, เบอร์โทร | PARSED_REQUIREMENT_GATED; ไม่รวมใน provisioning input ที่ persist |
| P:X | รายละเอียดที่อยู่ | PARSED_REQUIREMENT_GATED; ไม่ persist จาก import |
| Y:AA | ชื่อ/โทรศัพท์/ความสัมพันธ์ผู้ติดต่อฉุกเฉิน | PARSED_REQUIREMENT_GATED; ไม่ persist จาก import |
| I:K, M:N | weight, height, waist, DTX, HbA1c | รองรับ initial Baseline เมื่อมีวันที่และผ่าน reconciliation |
| L | ประเภทเบาหวาน | รองรับ Patient-level classification RISK/DIABETES; ไม่รับรองความหมาย DM/Pre-DM |
| AB | ชื่อผู้ดูแล OSM | parse/resolve; assignment mutation exact Hospital และต้องผ่าน OWNER authority/reconciliation |

หลักฐาน runtime อยู่ที่ [patient import field contract](../../src/modules/patient-provisioning/import/patient-import-contract.ts), [parser](../../src/modules/patient-provisioning/adapters/excel-patient-import-adapter.ts), [roster import service](../../src/modules/patient-provisioning/services/patient-roster-import-service.ts), [provision transaction](../../src/modules/patient-provisioning/services/patient-provisioning-transaction.ts) และ [schema](../../prisma/schema.prisma). ห้ามสรุปว่า fields ทั้งหมด 28 columns ถูกบันทึกแล้ว.

## 5. Customer workbook → Dashboard views

mapping ราย field ที่ละเอียดให้ยึด [RPT-24A §6/§13](./PHASE_17_RPT24A_CUSTOMER_WORKBOOK_DECISION_PACK.md) และ [Phase 18B](./PHASE_18B_EXCEL_DATA_GAP_VERIFICATION.md). ตารางนี้บันทึกเฉพาะ dashboard scope และ implementation delta:

| Workbook worksheet | Customer-facing sections | Factual source / readiness |
| --- | --- | --- |
| Dashboard ภาพรวม | Hospital/cohort summary; Patient/ID/OSM; illness duration; Before; During 1–6 DTX/body weight/Achieve Score; After | Hospital, relationship, Program, Baseline, Service 1, Goal Plan, Follow-up, Final บางส่วนมี source; ไม่มี aggregate dashboard projection. D01–D10 และ clinical/identity semantics ยังเปิด. CVD Risk, illness duration, After BMI/HbA1c และ Achieve Score ยังไม่ใช่ approved report facts |
| รายงานการจัดบริการ | Before/After; PAM/PROMs/confidence/exercise; Service 1; Service 2 Goal Plan; Service 3–6 Follow-up date, Achieved Days, Achievement Rate, outcome, adjustment, obstacle; จำนวน Follow-up >70% | Goal Plan target และ categorical Follow-up facts มี source บางส่วน; achieved days/rate, structured outcome, adjustment และ obstacle ยังไม่มี approved source/formula. Screening/exercise link/semantics และ clinical score ยังเปิด |

สถานะที่ต้องแยกกัน:

- **IMPLEMENTED FACTUAL SOURCE:** มี Patient/relationship, Program, Baseline, Classification, Service 1, Goal Plan, Follow-up และ Final records ใน domain ปัจจุบันตาม scope ของแต่ละ service.
- **SOURCE EXISTS BUT NOT PROJECTED:** Baseline height/HbA1c และบาง raw fields ไม่อยู่ใน current Program projection; projection ที่เพิ่มภายหลังยังต้องผ่าน field-disclosure approval.
- **SEMANTIC APPROVAL REQUIRED:** Before/During/After, DM/Pre-DM, service completeness, outcomes, OSM attribution, exercise linkage และ achievement.
- **AUTHORITATIVE SOURCE MISSING:** CVD risk algorithm/result ที่ยอมรับ, illness onset, achieved-day observation, structured outcome/adjustment/obstacle, Final HbA1c/height.
- **SECURITY / DISCLOSURE GATED:** Hospital cohort, Global aggregates และ patient-level cross-Hospital access; การอ่าน source ได้ใน exact Program scope ไม่เท่ากับอนุญาต report/export.

## 6. Global reporting contract ที่เสนอเพื่อ review

### Level A — Global overview

Candidate metrics จำกัดเฉพาะ eligible Hospital counts และ patient/program/service/follow-up aggregates ที่มี factual source และ approved definition. ห้ามเพิ่ม metric เพื่อเติมหน้า dashboard. ไม่มี Patient identifier, rare-cohort facts หรือ clinical score ที่ยังไม่มี approval. ก่อนนับ ต้องระบุ Hospital status, Patient vs relationship vs Program grain, multi-Hospital relationship, deduplication, denominator, time basis, snapshot และ suppression.

### Level B — per-Hospital summary and comparison

Global Admin ที่แยก entitlement แล้วอาจเลือก Hospital และเปรียบเทียบ summary ได้เมื่อ Hospital eligibility และ metric definition เหมือนกันทุก Hospital. Aggregate query ต้องระบุ exact Hospital set, status semantics, population grain, date/stage basis, duplicate handling, missing/unclassified behavior และ protection จาก small-cell, complementary suppression และ repeated-query differencing. ห้ามส่ง Patient ID/name จาก aggregate endpoint.

การใช้ Hospital ID จาก browser เป็นเพียง locator. Server ต้อง resolve current Hospital record/status และ authorization grant เอง. Parent/child Hospital relationship ไม่ใช่ global reporting authority.

### Level C — Global Patient drill-down

นี่เป็น requirement ที่ยืนยันแล้ว แต่ต้องออกแบบ authorization contract แยกจาก Level A/B และจาก HN Network. ต้องแยกอย่างน้อย:

1. สิทธิ์อ่าน Global aggregate.
2. สิทธิ์อ่าน summary ของ Hospital หนึ่งแห่ง.
3. สิทธิ์ค้นพบ/เลือก eligible Patient relationship.
4. สิทธิ์อ่าน exact Patient identity.
5. สิทธิ์อ่าน exact Patient Program detail และ field allowlist.

Hospital ID, Patient ID, relationship ID หรือ Program ID จาก browser เป็น locator ไม่ใช่หลักฐาน permission. Server ต้อง resolve Hospital + PatientHospitalRelationship + Program จาก authoritative records และตรวจ grant, capability, scope, account/Hospital/resource status ใหม่ทุก request. การเชื่อม identity ข้าม Hospital ห้ามทำให้ care record จากอีก Hospital ปรากฏเอง. ไม่ทำ national-ID หรือ patient-name search แบบครอบคลุมระบบโดยไม่มี contract เฉพาะ.

Patient identity view และ clinical detail view ต้องเป็นคนละ permission candidate. การเปิด Patient detail ไม่ได้ grant export/download, mutation, OSM assignment, Family/private data, Patient Wellness, impersonation หรือ emergency/break-glass access.

## 7. Global access/privacy decisions ที่ยัง OPEN

รายการต่อไปนี้เป็นหัวข้อ review ของ security contract ไม่ใช่ Decision IDs ใหม่. Owner ต้องถูกระบุเป็น role ที่มีอำนาจ และบันทึก named approver/evidence ก่อนปิด:

| Ref | คำถามที่ต้องตัดสิน | Authority ที่ต้องร่วม |
| --- | --- | --- |
| A | ใคร grant/revoke global entitlement และทบทวนสิทธิ์เป็นระยะ? | Security/IAM owner + Product Owner |
| B | Role.ADMIN จำเป็นแต่ไม่เพียงพอหรือไม่; role อื่นมีเส้นทางอนุมัติหรือไม่? | Product Owner + Security |
| C | วัตถุประสงค์ที่ชอบด้วยนโยบายสำหรับดู Patient data คืออะไร? | Data Controller/Privacy + Product |
| D | Patient detail grant ครอบคลุมทุก eligible Hospital หรือเป็น Hospital subset/งานเฉพาะ? | Security + Privacy/Data Controller + Product |
| E | อนุญาต field Patient/Program ใด; แยก identity, measurements, clinical records และ narrative อย่างไร? | Privacy/Data Controller + Clinical/Data owner + Security |
| F | การเห็น Patient identity แยกจาก clinical detail ได้หรือไม่ และใครอนุมัติ? | Privacy/Data Controller + Product + Security |
| G | Grant มีอายุเท่าใด หรือผูกกับงาน/session/case เฉพาะหรือไม่? | Security + Data Controller |
| H | ต้องบันทึกเหตุผลก่อนดู Patient หรือไม่; รูปแบบใดลดการเก็บข้อมูลเกินจำเป็น? | Privacy + Security + Operations |
| I | เก็บหลักฐาน grant, scope, approver, purpose, access outcome และ version อย่างไร? | Security/Audit owner + Data Controller |
| J | การ revoke account, role, entitlement, Hospital หรือ relationship มีผลเมื่อใด? | Security + Architecture/DB + Operations |
| K | ระหว่าง long-running read/page ผู้ใช้ถูก revoke แล้วจุดใดต้อง deny/abort? | Security + Architecture/DB |
| L | บันทึก successful, denied และ failed access อย่างไรโดยไม่ log health data? | Security/Audit owner + Privacy |
| M | Search, pagination, UI navigation และ cache แยกตาม actor/scope อย่างไร; อะไรเป็น no-store? | Security + Architecture |
| N | Retention, legal/privacy basis และ Data Controller obligation ใดต้องผ่านก่อนเปิดข้อมูล? | Data Controller/Privacy/Legal ตาม governance |
| O | Emergency access จะมีหรือไม่; หากมีต้องเป็นสัญญา break-glass แยกอย่างไร? | Clinical governance + Security + Data Controller |

ทุกข้อยัง **OPEN / SECURITY_PRIVACY_BLOCKED**. Candidate direction ที่ปลอดภัยคือ least privilege, explicit server-side grant, minimum necessary fields, bounded scope, auditable/revocable access และ fail closed. Candidate ไม่ใช่ accepted policy.

## 8. Candidate capability/access matrix

ชื่อ capability ต่อไปนี้เป็น **design candidates only**. รูป domain:action สอดคล้องกับ naming pattern ปัจจุบัน เช่น report:program:read แต่ยังไม่ใช่ runtime vocabulary และไม่ได้รับอนุมัติ.

| Candidate capability | Target scope candidate | Data class | State |
| --- | --- | --- | --- |
| report:global:summary:read | approved Global aggregate scope | non-identifying aggregates only | PROPOSED |
| report:global:hospital-summary:read | one or more server-resolved eligible Hospitals | Hospital summary, no Patient identifiers | PROPOSED |
| report:global:patient-directory:read | explicitly granted Hospital/Patient relationship set | minimum identity fields for discovery | PROPOSED |
| report:global:patient-detail:read | exact Hospital + PatientHospitalRelationship + exact Program | separately approved field allowlist | PROPOSED |
| report:hospital:summary:read | exact active Hospital scope | approved Hospital summary | PROPOSED |
| report:program:read (current) | one exact Patient Program under current policy | existing factual Program projection | IMPLEMENTED; not cohort/global/export grant |

ADR-0002 ระบุ Role + Capability + Scope และมี GLOBAL เป็น conceptual scope candidate; ไม่ได้สร้าง Global permission หรือให้ Role.ADMIN clinical access. การอนุมัติว่า ADMIN เป็น required role, ใคร assign candidate capabilities และวิธี scope resolver ยังคง open.

### Actor / context matrix

| Actor/context | Current verified boundary | Candidate future outcome before approvals close |
| --- | --- | --- |
| Platform ADMIN ไม่มี reporting grant | Governance operations แยกจาก clinical access; exact Program report policy deny ADMIN-only | DENY global summary, Hospital summary, Patient discovery และ detail |
| Platform ADMIN มี summary grant ที่อนุมัติแล้วในอนาคต | ยังไม่มี runtime grant | อนุญาตเฉพาะ approved aggregate; ห้ามมี Patient identifiers |
| Platform ADMIN มี patient-detail grant ที่อนุมัติแล้วในอนาคต | ยังไม่มี grant/policy; scope และ fields OPEN | อ่านได้เฉพาะ exact granted Hospital/relationship/Program และ field allowlist; ห้าม bulk/export/mutation โดยปริยาย |
| Hospital direct OWNER | patient/report access ปัจจุบันอยู่ใน direct active Hospital scope ตามแต่ละ capability | Hospital dashboard ต้องมี capability/policy ของตน; Owner status ไม่ได้ export |
| Hospital direct MEMBER | patient/report access ปัจจุบันอยู่ใน direct active Hospital scope ตามแต่ละ capability | เหมือน OWNER เฉพาะ capability ที่ได้รับ; ห้ามอิง membership เพื่อข้าม Hospital |
| OSM กับ exact active assignment | อ่าน exact assigned Patient/Program ได้ตาม policy; ไม่มี cohort scope | ไม่ได้รับ Hospital/global summary หรือ cross-Hospital discovery จาก assignment |
| Patient SELF | SELF scope ของตนเอง; Personal Wellness ยังแยกจาก Program care | ไม่มี Global/Hospital report scope |
| Parent Hospital OWNER | HN-C0/HN-C1 เป็น Network aggregate context เท่านั้นเมื่อ gate อนุมัติ; current HN implementation ยังไม่ authorized | ห้าม Patient-level access ผ่าน network/child hierarchy |
| Suspended, inactive, revoked actor/grant/Hospital | current operation policies fail closed ตาม status | DENY; ต้องไม่แสดง cached/search result ต่อ |
| Multi-role actor | แต่ละ request ต้องผ่าน capability และ resource scope ที่ตรง; roles ไม่ใช่ additive bypass | DENY เมื่อ tuple, grant หรือ target scope ไม่ชัด; การรวม role ไม่ทำให้เกิด global patient authority |

## 9. Threat scenarios และ synthetic acceptance/denial

ตารางนี้เป็น design-only. ไม่ได้รัน UAT และไม่มี patient data. ทุกผลจริงยังขึ้นกับ approved contract; เมื่อ rule ยัง open ให้คง BLOCKED_BY_DECISION และ default deny.

| ID | Synthetic scenario | Expected evidence/result | State |
| --- | --- | --- | --- |
| GR-SYN-01 | ADMIN-only เปิด Global summary โดยไม่มี grant | Server ปฏิเสธ; ไม่มี aggregate/patient existence leak | BLOCKED_BY_DECISION until authorization contract accepted |
| GR-SYN-02 | ADMIN มี summary grant แล้วพยายามดู names/IDs | Summary response ไม่มี patient identifiers; detail action แยก permission | BLOCKED_BY_DECISION |
| GR-SYN-03 | Hospital summary request เปลี่ยน Hospital locator ใน browser | Server re-resolve target; unauthorized Hospital ถูก deny | BLOCKED_BY_DECISION |
| GR-SYN-04 | ADMIN detail grant ครอบคลุม Hospital A; ขอ relationship/Program ของ Hospital B | Deny ก่อน readback; no fallback ไป shared Person | BLOCKED_BY_DECISION |
| GR-SYN-05 | Synthetic Person มี relationship แยก Hospital A/B และคนละ Program | Hospital view แสดง exact relationship เท่านั้น; Global detail ต้องใช้ explicit scope | BLOCKED_BY_DECISION |
| GR-SYN-06 | Patient discovery แล้วขอ clinical detail ที่ field allowlist ไม่รวมไว้ | Deny field/detail; ไม่มี hidden fetch หรือ UI-only filtering | BLOCKED_BY_DECISION |
| GR-SYN-07 | Grant ถูก revoke ระหว่าง pagination หรือ cache lifetime | Reauthorization/abort ตาม approved consistency point; response หลัง revoke ห้ามส่งข้อมูล | BLOCKED_BY_DECISION |
| GR-SYN-08 | Aggregate มี cell เล็กหรือ query ซ้ำเพื่อ differencing | Withhold/suppress ตาม policy ที่อนุมัติ; ห้าม substitute zero | BLOCKED_BY_DECISION |
| GR-SYN-09 | Parent OWNER ใช้ Hospital Network context เพื่อ drill-down Patient ของ child | Deny; HN scope ไม่ใช่ Global Admin patient scope | BLOCKED_BY_DECISION |
| GR-SYN-10 | Global patient detail viewer กด download/export หรือใช้ mutation | Deny หากไม่มี permission contract แยกสำหรับ action นั้น | BLOCKED_BY_DECISION |
| GR-SYN-11 | Request ผิดพลาดและ log/error ถูกตรวจ | ไม่มี Patient name, national ID, clinical value หรือ raw query ใน client error/audit payload | BLOCKED_BY_DECISION |
| GR-SYN-12 | Actor มี ADMIN + Hospital role แต่ขอ Patient นอก direct Hospital scope | ไม่รวม roles เพื่อ bypass; แต่ละ explicit capability/scope ต้องถูกตรวจ | BLOCKED_BY_DECISION |

Threats ที่ต้องมี controls ใน future review ได้แก่ ADMIN universal bypass, Hospital-context tampering, cross-Hospital identity inference, directory enumeration, clinical field leakage, PII ใน log/error/audit, stale grant after revocation, cache cross-actor delivery, aggregate-to-individual inference, export inheritance และการสับสน Parent Hospital hierarchy กับ Platform administration.

## 10. แยกจาก HN-C0/HN-C1 และ RPT-24

### Hospital Network

[HN-C0 closeout](./PHASE_17K0B_HN_OWNER_DECISION_CLOSEOUT.md), [HN-C1 security/disclosure contract](./PHASE_17K_HNC1_SECURITY_DISCLOSURE_CONTRACT.md) และ [HN-C1 direction record](./PHASE_17K_HNC1_DECISION_DIRECTION_RECORD.md) เป็นผลิตภัณฑ์ Parent Hospital OWNER ที่ scope เครือข่ายและ aggregate เท่านั้น. ไม่ให้ Patient row, child clinical access, hierarchy inheritance หรือ ADMIN-only Network Owner authority.

Global Platform Reporting เป็นคนละ actor, purpose, target scope และ permission policy. ห้ามใช้ HN-Mxx เป็น Global decision identity และห้ามย้าย Global patient drill-down เข้า Network scope. HN-M07 / historical reparent gates คงเดิม; **HN-M08 Network Export = DEFERRED / NOT AUTHORIZED**. Global request ไม่ authorize Network Export.

### RPT-24 / RPT-24C

[RPT-24](./PHASE_17_RPT24_ON_DEMAND_ASOF_EXCEL_EXPORT_CONTRACT.md) เป็น on-demand Excel export contract สำหรับ exact Hospital/Patient Program factual progress. report:program:read ยังคง exact Program read และไม่ใช่ cohort/export permission. RPT-24C ในเอกสารดังกล่าวคง security/privacy/snapshot/revocation/audit/delivery gates ของ export.

Global Dashboard direction ไม่ขยาย RPT-24 D01 exact-Hospital export population ไปเป็น system-wide Excel. R24A-D01–D15 ยัง PROPOSED. On-screen Global aggregate/detail และการดาวน์โหลดไฟล์ต้องมี authorization/delivery decisions แยก. หากภายหลังต้องการ Global export ให้เสนอ contract/scope review แยกและ reconcile RPT-24 อย่างชัดเจนก่อน implementation; ห้ามอนุมานจาก global read.

## 11. Privacy/security/Data Controller gates

สถานะรวม: **OPEN / SECURITY_PRIVACY_BLOCKED**.

- Role.ADMIN alone ไม่ได้ patient/clinical permission.
- ไม่เพิ่ม capability, scope, membership, OSM assignment, Family grant หรือ hierarchy inheritance ใน phase นี้.
- Global aggregate ต้อง review minimum counts, small-cell suppression, complementary suppression, differencing, time windows และ denominator.
- Patient drill-down ต้องแยก identity/discovery/clinical field allowlist, purpose, Hospital subset, grantor, effective period, access reason, audit and retention.
- Server reauthorization, revocation timing, in-flight read, cache isolation, search, pagination, safe errors/logs และ audit minimization ต้องมีข้อกำหนดที่อนุมัติ.
- Export, download, bulk API, modification, assignment change, family data, Personal Wellness และ break-glass ไม่อยู่ใน grant ที่ร้องขอโดยปริยาย.
- Privacy/Data Controller ต้องระบุ approval authority, purpose/legal basis และ retention ตาม governance ขององค์กร; engineering ไม่กำหนดแทน.
- Source facts ที่มีอยู่ไม่ได้แปลว่ามีอำนาจเปิดเผยให้ Global Admin.

## 12. ลำดับงานในอนาคต — design readiness, not implementation

1. **Stage 1 — Requirement reconciliation:** บันทึก Hospital/Global consumer scope นี้; ใช้ workbook และ RPT-24A mapping เดิม; ปิด business/clinical decisions ที่จำเป็นต่อแต่ละ metric โดยไม่แก้ประวัติ.
2. **Stage 2 — Separate Global Reporting Security Contract:** กำหนด role/capability/scope, grant/revoke, purpose, Patient discovery, field allowlist, audit, revocation, search/cache, privacy/Data Controller acceptance และ denial cases. Patient drill-down ต้องเป็น gate แยกจาก aggregate.
3. **Stage 3 — Reporting architecture design:** วาง shared factual projection โดย domain source เดิม; แยก Hospital query, Global aggregate, per-Hospital summary และ explicitly authorized exact Patient/Program query; ระบุ population/time/consistency, small-cell และ pagination. ห้ามสร้าง reporting copy source หรือ generic framework.
4. **Stage 4 — Conditional implementation:** เริ่มเฉพาะ work package ที่มี accepted business/clinical/security requirements และ explicit implementation authorization แยก. ห้ามเปิด real patient access หรือ export จนกว่าจะผ่าน gates ของตน.

ยังสามารถเตรียม design สำหรับ factual, non-identifying subset โดยไม่รอ clinical metrics ที่ไม่เกี่ยวข้อง. ห้ามแสดง unapproved medical scores, inferred outcomes หรือ Patient data ที่ไม่ได้รับอนุญาต.

## 13. Customer / Clinical decisions ที่ยังเปิด

ทิศทาง dashboard ไม่ปิด R24A-D01–D15:

| Existing identity | สิ่งที่ยังต้องตอบ | Owner |
| --- | --- | --- |
| R24A-D01–D03 | Exact-Hospital export population/row grain เดิม; สำหรับ Global dashboard ต้องระบุ eligible Hospital, Patient/relationship/Program grain, cross-Hospital dedup และ population เพิ่มโดยไม่เปลี่ยน D01–D03 | Product/Customer + Hospital operations; Security/Privacy |
| R24A-D04–D05 | Patient identifier/name, OSM display และ historical responsibility | Customer/Product + Hospital data owner; Privacy/Security |
| R24A-D06–D07 | Before/During/After mapping, mandatory fields, accept omissions, date/stage semantics | Clinical authority + Customer/Product + Data owner |
| R24A-D08 | DM/Pre-DM definition, time basis, denominator, unclassified/dedup | Clinical authority + Data owner + Product |
| R24A-D09 | BMI/CVD/Achievement/70% metric formula, inputs, version and validation | Clinical authority + Data owner; Product |
| R24A-D10 | Service presence/delivery/completion/outcome vocabulary | Hospital operations + Clinical authority + Product |
| R24A-D11–D13 | Follow-up overflow, missing values, workbook compatibility/layout; ใช้กับ export ไม่ใช่ Global dashboard grant | Customer/Product + Data owner + Security |
| R24A-D14–D15 | Export requestedAt/dataAsOf/generatedAt และ output ordering; Dashboard freshness/refresh contract ยังเป็นเรื่องแยก | Product + Architecture/DB + Security |
| CL-01–CL-07 / BR-01–BR-08 | Measurement, classification, stage, exercise, service completeness, achievement, outcome, adjustment, obstacle และ historical OSM | Clinical/Data authority + Hospital operations + Product ตามหัวข้อ |

สถานะ D01–D15 ให้อ่านจาก canonical [RPT-24A](./PHASE_17_RPT24A_CUSTOMER_WORKBOOK_DECISION_PACK.md); ทุก decision ยังคง PROPOSED FOR REQUESTER / CUSTOMER REVIEW. Clinical/business approvals ต้องมีหลักฐานแยก. Global product direction ไม่ได้เลือก formula, denominator หรือ patient fields ให้.

## 14. Disposition และ next phase

- **Hospital Dashboard requirement:** REQUESTER-CONFIRMED PRODUCT DIRECTION / OWNER_RECEIVED.
- **Global system-wide overview:** REQUESTER-CONFIRMED PRODUCT DIRECTION / OWNER_RECEIVED; implementation ยังไม่มี.
- **Per-Hospital comparison:** REQUESTER-CONFIRMED PRODUCT DIRECTION / OWNER_RECEIVED; population/metric/security contract ยังเปิด.
- **Cross-Hospital Patient drill-down:** REQUESTER-CONFIRMED product requirement; **SECURITY / PRIVACY / DATA-CONTROLLER APPROVAL PENDING**; ยังไม่มี access contract หรือ runtime capability.
- **R24A-D01–D15:** คง PROPOSED; ไม่มีรายการใด ACCEPTED จาก Phase นี้.
- **HN-M08:** DEFERRED / NOT AUTHORIZED.
- **RPT-24C:** export security/privacy/snapshot/revocation/audit/delivery gates ยัง OPEN.
- **Implementation / production access:** NOT AUTHORIZED.

ผลที่ปิดได้คือ **PHASE 18C.1A — GLOBAL REPORTING REQUIREMENT RECORDED / ARCHITECTURE RECONCILIATION COMPLETE**. ไม่ใช่ Global patient access approval, clinical approval, export authorization, UAT หรือ production readiness.

**ขั้นถัดไปที่แนะนำ:** Phase 18C.1B — Global Reporting Security Contract Preparation and Approval. เตรียมให้ Security/Privacy/Data Controller ตัดสิน A–O ใน §7 และแยก aggregate scope จาก Patient-detail scope. ไม่เริ่ม Phase 18C.1B หรือ implementation โดยอัตโนมัติ.

## 15. Source index

- Authorization architecture: [ADR-0002](../adr/0002-role-capability-scope-authorization.md), [Architecture baseline](../architecture/DEMI_ARCHITECTURE_BASELINE.md).
- Existing policies: [Program report policy](../../src/modules/reporting/policies/program-report-policy.ts), [policy tests](../../src/modules/reporting/policies/program-report-policy.test.ts), [Patient Program policy](../../src/modules/patient-program/policies/patient-program-policy.ts).
- Current report read: [access service](../../src/modules/reporting/services/program-report-access-service.ts), [query service](../../src/modules/reporting/services/program-report-query-service.ts), [projection](../../src/modules/reporting/projections/program-report-projection.ts).
- Import: [template contract](../../src/modules/patient-provisioning/import/patient-import-template-contract.ts), [field contract](../../src/modules/patient-provisioning/import/patient-import-contract.ts), [adapter](../../src/modules/patient-provisioning/adapters/excel-patient-import-adapter.ts), [roster service](../../src/modules/patient-provisioning/services/patient-roster-import-service.ts), [provision transaction](../../src/modules/patient-provisioning/services/patient-provisioning-transaction.ts).
- Domain sources: [Prisma schema](../../prisma/schema.prisma), [Program service](../../src/modules/patient-program/services/patient-program-service.ts), [Service 1 service](../../src/modules/patient-program/services/patient-program-service-one-service.ts), [Goal service](../../src/modules/goals/services/goal-service.ts), [Follow-up service](../../src/modules/followups/services/followup-service.ts), [Final Assessment service](../../src/modules/patient-final-assessment/services/patient-final-assessment-service.ts).
- Scope/read evidence: [Patient directory query](../../src/modules/patient-directory/services/patient-directory-query-service.ts), [classification counts](../../src/modules/patient-classification/services/patient-classification-query-service.ts), [Hospital governance service](../../src/modules/hospital-governance/services/hospital-governance-service.ts).
- Customer and prior authorization records: [RPT-24](./PHASE_17_RPT24_ON_DEMAND_ASOF_EXCEL_EXPORT_CONTRACT.md), [RPT-24A](./PHASE_17_RPT24A_CUSTOMER_WORKBOOK_DECISION_PACK.md), [HN-C0](./PHASE_17K0B_HN_OWNER_DECISION_CLOSEOUT.md), [HN-C1](./PHASE_17K_HNC1_SECURITY_DISCLOSURE_CONTRACT.md), [HN-C1 direction](./PHASE_17K_HNC1_DECISION_DIRECTION_RECORD.md).
