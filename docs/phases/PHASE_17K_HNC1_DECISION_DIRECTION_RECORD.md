# DEMI — Phase 17K HN-C1 Decision Direction Record

- **ประเภทเอกสาร:** บันทึกทิศทาง engineering สำหรับ HN-C1 D01–D13; documentation-only
- **สถานะ:** ENGINEERING DIRECTION CONFIRMED BY REQUESTER; SECURITY / PRIVACY ACCEPTANCE PENDING
- **สาขา:** docs/hn-c1-security-disclosure-contract
- **HN-C1 commit ที่ทบทวน:** 7ef8c3d92d450270e36bcee9fd6a43c6c2d584eb
- **การเปิดเผย Network aggregate จริง / HN-C2 implementation:** ไม่ได้รับอนุญาตจากเอกสารนี้; HN-C2 IMPLEMENTATION BLOCKED

> การยืนยันในบันทึกนี้หมายถึงผู้ร้องยอมรับคำแนะนำเป็นทิศทาง engineering ที่ต้องการเท่านั้น ไม่ใช่การอนุมัติแยกจาก Product Owner, security, privacy, data controller หรือ production authority และไม่ใช่ implementation clearance ไม่มีการระบุตัวผู้อนุมัติหรือวันอนุมัติที่ไม่มีหลักฐาน

## 1. จุดประสงค์และการอ่านสถานะ

เอกสารนี้บันทึกเจตนาทาง engineering ที่ยืนยันแล้วสำหรับ D01–D13 โดยเสริม [HN-C1 Security & Disclosure Contract](./PHASE_17K_HNC1_SECURITY_DISCLOSURE_CONTRACT.md) ไม่แทนที่ HN-C0, accepted ADR หรือการตัดสินใจของ authority ที่ยังต้องมีแยกต่างหาก

- OWNER_RECEIVED คือ semantics ที่ HN-C0 บันทึกไว้แล้ว; รายการเดิมและสถานะไม่เปลี่ยน.
- ENGINEERING DIRECTION CONFIRMED BY REQUESTER คือทิศทางการออกแบบที่ผู้ร้องเลือก; ไม่เท่ากับ SECURITY APPROVED, business-owner approval, ติดตั้ง capability หรืออนุญาต release.
- OPEN / OPEN_BLOCKER หมายถึงยังขาด authority decision, source evidence, testable policy หรือ technical design ที่ระบุใน register.
- DEFERRED / NOT AUTHORIZED คงปิดขอบเขตจนกว่าจะมีคำขอและการอนุมัติแยกต่างหาก.

D01–D11 ไม่ได้ถูกปิดรวมเป็นชุด และไม่มี Network real-data aggregate exposure ใดได้รับอนุญาตจากบันทึกนี้.

## 2. HN-C0 ที่สืบทอดโดยไม่เปลี่ยนแปลง

HN-A01–A06, HN-M01–M06 และ HN-M06 time subdecisions คงความหมายและ OWNER_RECEIVED ตาม [HN-C0](./PHASE_17K0B_HN_OWNER_DECISION_CLOSEOUT.md) ทุกประการ; ตารางต่อไปนี้ช่วย trace เท่านั้น ไม่ได้แก้หรือขยาย semantics:

- **HN-A01–A06:** เฉพาะ ACTIVE User ที่มี Role.HOSPITAL และ ACTIVE direct OWNER membership ใน ACTIVE exact Parent Hospital; children เป็น direct children เท่านั้น; P, C, N เป็น scopes แยกกันและคำนวณ unique ซ้ำต่อ scope; directory อาจแสดง child ที่ PENDING_VERIFICATION, ACTIVE, SUSPENDED แต่ aggregate ใช้เฉพาะ ACTIVE Parent/ACTIVE direct children; current hierarchy ไม่ใช่ historical authority; child breakdown คงเป็น aggregate เท่านั้น. ไม่มี clinical Patient access, Patient rows, child workforce management, Area inheritance หรือสิทธิ์โดยอาศัย ADMIN-only.
- **HN-M01–M05:** คงนิยามเดิมของ current unique Patient/relationship counts; current RISK/DIABETES classification; Staff/OSM distinct User และ eligible active relationship counts; eligible Program participant/episode counts; และ Program-linked Follow-up distinct Patient/record counts ตาม recordedAt โดยไม่รวม nullable Program-link ที่ไม่มีค่า. ข้อยกเว้น ความหมาย และ exclusions ให้ยึด HN-C0 §§5–6.
- **HN-M06:** คงการแยก CURRENT_SNAPSHOT สำหรับ M01–M03 และ PERIOD_BASED สำหรับ M04–M05. HN-M06-T01–T09, T06-S01/S02 และ T09-S01 ยังคง OWNER_RECEIVED: Program lifecycle overlap และ exclusive completion endpoint; Follow-up recordedAt; Asia/Bangkok; inclusive local dates แปลงเป็น absolute half-open interval; current Bangkok month-to-date default; rolling 12-calendar-month limit และ Feb 29 exception; ปฏิเสธ End Date ในอนาคต; authoritative server As-of instant เดียว; และตัด zero-duration Program เฉพาะ HN-M04. As-of instant เดียวไม่รับรอง database snapshot consistency.
- HN-M07 ยังเป็น OPEN_BLOCKER; historical provenance/attribution ยังเป็น release gate; HN-M08 ยังคง DEFERRED / NOT AUTHORIZED. OWNER-01, AREA-01 และสถานะ/option meanings ของ K-Q01–K-Q25 คงแยกจาก Network hierarchy และไม่เปลี่ยน.

## 3. D01–D13 — ทิศทางและสถานะรายข้อ

### D01 — Network Read Capabilities

- **ทิศทาง / เหตุผล:** ใช้ candidate แยกสามชื่อ network:directory:read, network:summary:read, network:child-summary:read โดยมุ่งที่ organizational directory, Parent/Network summary และ ACTIVE direct-child summary คนละ purpose. actor ต้องเป็น ACTIVE User, มี Role.HOSPITAL และ ACTIVE direct OWNER membership ใน exact ACTIVE Parent Hospital; ตรวจจาก authoritative server data ทุก request. การแยก capability ช่วยจำกัด scope ตามการใช้งาน.
- **ขอบเขตปฏิเสธ:** ADMIN-only, MEMBER-only, child-only OWNER, OSM-only/PATIENT-only, suspended/inactive/revoked actor หรือ stale membership ไม่ qualify; multi-role user ต้องผ่าน exact Parent membership เดียวกัน. ไม่ให้ Patient row/clinical access, child workforce mutation, general export หรือ authority สืบทอดจาก role/hierarchy; report:program:read ใช้แทนไม่ได้.
- **สถานะ / คงค้าง:** engineering direction ยืนยันแล้ว; ชื่อยังเป็น candidate และยังไม่มี capability/policy acceptance หรือ implementation.
- **ผู้มีอำนาจ / ผลต่อ implementation และ release:** Product Owner กับ security decision authority ที่ได้รับมอบหมายต้องรับรอง actor/scope/operation; ต้องมี policy และ adversarial authorization tests. หากยังไม่รับรอง ห้ามเปิด Network feature หรือข้อมูลจริง.

### D02 — Minimal Hospital Directory

- **ทิศทาง / เหตุผล:** allowlist เริ่มต้นมี opaque internal Hospital ID, Hospital name และ Hospital status เท่านั้น. hospitalCode เพิ่มได้เมื่อยืนยัน necessity และ disclosure scope. Directory จำกัดที่ direct children สถานะ PENDING_VERIFICATION, ACTIVE หรือ SUSPENDED; เฉพาะ ACTIVE contributors เข้า aggregate.
- **ขอบเขตปฏิเสธ:** ไม่มี Patient/cohort/clinical data, staff identity, private contact หรือ metadata อื่นนอก allowlist. Directory ไม่เป็นช่องทางอนุมาน patient/cohort.
- **สถานะ / คงค้าง:** engineering direction ยืนยันแล้ว; field disclosure acceptance และเหตุผลสำหรับ hospitalCode ยังเปิด.
- **ผู้มีอำนาจ / ผลต่อ implementation และ release:** Product Owner และ security/privacy authority ต้องยืนยัน field allowlist และ scope; implementation ต้องใช้ server-side projection แบบ allowlist. การยืนยันนี้ไม่เปิด directory endpoint หรือ aggregate โดยตัวมันเอง.

### D03 — Historical Reparenting

- **ทิศทาง / เหตุผล:** เลือก **Option A — withhold unverifiable historical contributions** เป็นแนวทางอนุรักษ์นิยมปัจจุบัน เพื่อไม่ใช้ current parentage อนุมานสิทธิ์ย้อนหลัง. Option B (authoritative effective-dated hierarchy/provenance source) เป็นเพียง architectural candidate ในอนาคต; Option C ไม่ได้เลือก.
- **ขอบเขต / สถานะ:** การเลือก A ไม่ใช่หลักฐานว่า source ปัจจุบันแยก contribution ที่ตรวจสอบได้ทั้งหมดออกจาก contribution ที่พิสูจน์ไม่ได้. ห้ามสมมติ parentage, effective date, history หรือ record ownership; HN-A05 ยังคงหลักการและ historical disclosure ยังคง OPEN_BLOCKER.
- **ผู้มีอำนาจ / ผลต่อ implementation และ release:** Product Owner, security/privacy/data-controller authority ต้องยอมรับ policy; architecture/data owner ต้องยืนยัน provenance หากเสนอ B ภายหลัง. หากแยก affected contribution ไม่ได้ ให้ aggregate ที่ได้รับผล unavailable ทั้ง scope/metric ที่เกี่ยวข้อง; ห้ามคืนเลขศูนย์แทน. ไม่มีการอนุมัติ history table, migration, backfill หรือ rewrite.

### D04 — Temporal Attribution

- **ทิศทาง / เหตุผล:** fail closed ที่ขอบเขต metric/scope ที่ได้รับผล: withhold pre-reparent ที่พิสูจน์ไม่ได้และ mixed current-snapshot populations ที่แยกไม่ได้; ไม่ split Program episode ที่ข้าม transfer หากยังไม่มี attribution rule; Follow-up recordedAt ไม่ใช่หลักฐาน historical Parent authority. Parent เดิมเสีย current child scope เมื่อ reparent ตาม consistency contract ที่ต้องกำหนด.
- **สถานะ / คงค้าง:** ทิศทางยืนยันแล้ว; source-level eligibility และ technical provenance ยังเป็น release gates. unavailable ห้ามแทนด้วย factual zero.
- **ผู้มีอำนาจ / ผลต่อ implementation และ release:** Product Owner, domain/source owner และ security/privacy authority ต้องกำหนด attribution ที่ยอมรับได้; implementation ต้องมี source predicate ต่อ metric และ temporal tests. หากพิสูจน์ไม่ได้ ให้ withheld/non-numeric state.

### D05 — Small-cell Privacy

- **ทิศทาง / เหตุผล:** ใช้ risk-based primary suppression เป็นทิศทางความปลอดภัย; ไม่กำหนดค่า k หรือ numeric threshold ในบันทึกนี้. การปกป้องต้องพิจารณาหน่วยที่คุ้มครอง, metric grain, ค่า 0/1 และ rare cohort.
- **สถานะ / คงค้าง:** HN-M07 DISCLOSURE CONTRACT OPEN; PRIVACY IMPLEMENTATION RULE OPEN. ยังไม่มี accepted threshold, algorithm หรือ acceptable disclosure risk.
- **ผู้มีอำนาจ / ผลต่อ implementation และ release:** Product Owner, privacy/security authority และ data-controller authority ตาม governance ต้องกำหนด protected unit/risk. ต้องมี policy ที่ testable และ adversarial cases ก่อน; จนกว่าจะยอมรับและทดสอบได้ affected real aggregate values ถูก withheld.

### D06 — Complementary Suppression

- **ทิศทาง / เหตุผล:** ประเมินการเปิดเผยร่วมกันระหว่าง P/C/N, direct-child และ linked metric outputs; ห้ามใช้ per-cell threshold แยกอิสระ. หากผลที่ยังแสดงอยู่ประกอบกลับเป็นค่าที่ withheld ได้ ต้อง withhold related outputs เพิ่มตามกลไกที่อนุมัติ.
- **สถานะ / คงค้าง:** SUPPRESSION ALGORITHM OPEN; ยังไม่ได้เลือกหรือรับรองอัลกอริทึม.
- **ผู้มีอำนาจ / ผลต่อ implementation และ release:** Product Owner และ privacy/security authority ต้องอนุมัติวิธีประเมิน joint disclosure; ต้องทดสอบ arithmetic/complementary closure รวม unique-set และ additive-count cases. หากยัง reconstruct ได้ output ที่เชื่อมโยงกันยังห้ามเปิด.

### D07 — Cross-request Differencing

- **ทิศทาง / เหตุผล:** ป้องกันการอนุมานข้าม overlapping windows, As-of timestamps, refreshed snapshots, child selection และ linked metrics; rate limiting เพียงอย่างเดียวไม่พอ. อาจประเมิน controlled release cadence หรือ restricted dimensions เป็น MVP direction.
- **ข้อจำกัดสำคัญ:** ห้ามเปลี่ยน HN-M06 date-range contract ที่รับไว้แล้วโดยเงียบ ๆ. หาก privacy control จำกัด flexible dates ที่อนุมัติไว้ ต้องเปิด Product Owner decision ใหม่.
- **สถานะ / คงค้าง:** CROSS-REQUEST PRIVACY CONTRACT OPEN; ยังไม่มี permitted dimensions, cadence หรือ release-history rule.
- **ผู้มีอำนาจ / ผลต่อ implementation และ release:** Product Owner และ privacy/security authority ต้องตัดสิน; implementation อาจต้องควบคุม release history/dimensions และทดสอบ repeated-query differencing. หากยังไม่มี policy ห้ามปล่อย real aggregates.

### D08 — Failure, Disclosure และ Cache

- **ทิศทาง / เหตุผล:** fail closed, ใช้ private/no-store เป็นค่าเริ่มต้น และคง internal outcomes แยกกัน: AVAILABLE, DENIED, TEMPORAL_UNPROVEN, PRIVACY_WITHHELD, SOURCE_UNAVAILABLE. withheld/unauthorized ต้องไม่มี numeric value; ภายนอกใช้ข้อความ unavailable แบบ non-numeric ที่ไม่เป็น existence/cardinality oracle.
- **Reauthorization / ข้อจำกัด:** reauthorize ทุก request รวมถึง cache access ในอนาคต. การ revoke ป้องกันการเข้าถึงครั้งถัดไปตาม consistency contract แต่ไม่สามารถเรียกคืนข้อมูลที่เห็นหรือ screenshot ได้.
- **สถานะ / คงค้าง:** outcome names เป็น conceptual candidates ไม่ใช่ API DTO ที่อนุมัติ; external mapping, invalidation และ concurrency behavior ยังต้อง security review.
- **ผู้มีอำนาจ / ผลต่อ implementation และ release:** Product Owner, security/privacy authority และ runtime/architecture owner ต้องอนุมัติ mapping/consistency; ต้องมี response-oracle/cache/revocation tests. ก่อนปิด ห้าม serve affected report.

### D09 — Audit และ Retention

- **ทิศทาง / เหตุผล:** เก็บ security audit metadata ขั้นต่ำ: actor reference, capability, target Parent/Child reference เมื่ออนุญาต, timestamp, correlation ID และ decision outcome.
- **ข้อห้าม:** ห้าม log Patient ID, national ID, clinical detail, suppressed values, raw source query หรือ response body.
- **สถานะ / คงค้าง:** audit purpose, event types, retention period และ access policy ยังเปิด; minimal fields ไม่ได้เท่ากับ audit/retention approval.
- **ผู้มีอำนาจ / ผลต่อ implementation และ release:** security/privacy authority และ data-controller/records governance authority ต้องกำหนด policy. ก่อนมี policy ที่จำเป็นต่อ governance ห้ามเปิดใช้งานจริง; implementation ต้องจำกัดข้อมูลและทดสอบ sanitized logs.

### D10 — Staff และ OSM Eligibility (HN-M03)

- **ทิศทาง / เหตุผล:** counting predicates ตาม engineering direction:
  - **Staff:** ACTIVE User, Role.HOSPITAL, ACTIVE HospitalMembership, รวมทั้ง OWNER และ MEMBER, จำกัด exact eligible Hospital scope.
  - **OSM:** ACTIVE User, Role.OSM, ACTIVE OsmHospitalRelationship, จำกัด exact eligible Hospital scope.
  - คำนวณ DISTINCT User counts แยกจาก eligible relationship counts; User เดียวอาจอยู่ทั้ง Staff และ OSM populations; ห้ามรวมเป็น unique workforce count.
- **สถานะ / คงค้าง:** direction ของ predicates ยืนยันแล้ว แต่ HN-M03 REPORTING SEMANTICS SUBJECT TO REQUIRED CONFIRMATION. การรวม OWNER/MEMBER อาจมีความหมายเป็น Hospital Users/Members มากกว่า clinical Staff; label และ business interpretation ต้องตรวจรับรอง. Inconsistent role/account/relationship states และ source eligibility evidence ยังต้องทดสอบ.
- **ผู้มีอำนาจ / ผลต่อ implementation และ release:** Product Owner และ workforce/domain authority ต้องยืนยัน label/ความหมาย; engineering ต้องพิสูจน์ predicates ใน source และจัด PostgreSQL tests สำหรับสถานะไม่สอดคล้องก่อนใช้. ห้ามรายงาน M03 จน gate นี้ปิด.

### D11 — Read Consistency

- **ทิศทาง / เหตุผล:** ต้องการ authoritative, coherent read ครอบคลุม authentication, Parent OWNER authorization, hierarchy, contributor eligibility และ reporting state พร้อม concurrency contract สำหรับ suspension, demotion, reparenting และ source mutations.
- **ทางประเมิน / สถานะ:** engineering ต้องประเมิน snapshot/transaction isolation, locking หรือ version checks, final authorization validation และ bounded retries จากหลักฐานจริง. ไม่ถือว่า As-of timestamp เดียวรับรอง DB snapshot และไม่สมมติว่า SERIALIZABLE อย่างเดียวปิด revocation race. ยังไม่เลือก isolation strategy.
- **ผู้มีอำนาจ / ผลต่อ implementation และ release:** architecture/database/security authority ต้อง review พร้อม Product Owner ตัดสิน acceptable behavior; ต้องมี concurrency/source-consistency evidence. READ CONSISTENCY IMPLEMENTATION DESIGN OPEN; HN-C2 ยังคง blocked.

### D12 — Network Export

- **ทิศทาง / เหตุผล:** คง HN-M08 DEFERRED / NOT AUTHORIZED เพื่อไม่ขยาย reporting permission ไปสู่ downloadable/bulk copies โดยไม่มี decision แยก.
- **ขอบเขต:** ไม่มี CSV, Excel, PDF, bulk API download, patient roster หรือ export-specific permission. การเปิดในอนาคตต้องมี decision และ authorization แยก.
- **ผู้มีอำนาจ / ผลต่อ implementation และ release:** Product Owner และ security/privacy authority สำหรับคำขอใหม่; ไม่มี export path ใน scope ปัจจุบัน และบันทึกนี้ไม่อนุมัติ export.

### D13 — OWNER-01 / AREA-01

- **ทิศทาง / เหตุผล:** คงเป็น independent requirement gates. ไม่มี generic workforce editing, Area model, geography/membership inheritance หรือ clinical-scope expansion. Hospital Network hierarchy ไม่ได้ปิด Area meaning/authority.
- **สถานะ / คงค้าง:** OWNER-01 / AREA-01 ยังคงแยกจาก HN-C1; original K-Q IDs, option meanings และสถานะไม่เปลี่ยน.
- **ผู้มีอำนาจ / ผลต่อ implementation และ release:** requirement authority ของ OWNER-01 และ AREA-01 ต้องตัดสินผ่าน scope แยก; implementation เหล่านั้นไม่ได้รับอนุญาตจากบันทึกนี้. Phase 17K.1–17K.3 ยังคง NOT AUTHORIZED.

## 4. สถานะปัจจุบันและ release gates

- HN-C1 DOCUMENTATION PREPARED
- ENGINEERING DIRECTION CONFIRMED BY REQUESTER
- SECURITY / PRIVACY ACCEPTANCE PENDING
- HN-M07 DISCLOSURE CONTRACT OPEN
- HISTORICAL PROVENANCE / ATTRIBUTION RELEASE GATE OPEN
- HN-M03 REPORTING SEMANTICS SUBJECT TO REQUIRED CONFIRMATION
- READ CONSISTENCY IMPLEMENTATION DESIGN OPEN
- HN-C2 IMPLEMENTATION BLOCKED
- HN-M08 EXPORT DEFERRED
- OWNER-01 / AREA-01 SEPARATELY GATED

D01–D11 ต้องไม่ถูกรวมเรียกว่า CLOSED หรือ SECURITY APPROVED. ไม่มี Network aggregate real-data exposure ได้รับอนุญาต. การจบ security/privacy acceptance และการอนุมัติเริ่ม HN-C2 เป็นคนละการตัดสินใจ; ต้องมี implementation authorization แยกและปิด release gates ที่เกี่ยวข้องก่อน.

## 5. ขั้นถัดไปก่อน HN-C2 (ไม่ใช่ implementation)

ให้ decision authorities ที่เหมาะสมปิด register ตามลำดับหลักฐาน: ยืนยัน business semantics ที่ค้าง (โดยเฉพาะ D10 และผลกระทบ D07 ต่อ HN-M06), ตัดสิน HN-M07 และ disclosure/cache/audit policy, และให้ architecture/data owners พิสูจน์ historical provenance กับ read-consistency design. บันทึกผู้ตัดสินและหลักฐานโดยไม่ระบุตัวตนหรือผลที่ยังไม่ได้รับอนุมัติ จากนั้นจึงพิจารณาคำขอ authorization สำหรับ HN-C2 แยกต่างหาก; เอกสารนี้ไม่เริ่ม HN-C2.

## 6. แหล่งอ้างอิง

- [HN-C1 Security & Disclosure Contract](./PHASE_17K_HNC1_SECURITY_DISCLOSURE_CONTRACT.md) — threat model, scope, candidate policy, release gates และ adversarial design matrix.
- [HN-C0 Hospital Network Owner Decision Closeout](./PHASE_17K0B_HN_OWNER_DECISION_CLOSEOUT.md) — OWNER_RECEIVED HN-A01–A06, HN-M01–M06/time, exclusions และ HN-C2 gates.
- [ADR-0002: Role, Capability and Scope Authorization](../adr/0002-role-capability-scope-authorization.md) — accepted authorization architecture; ไม่ได้ติดตั้ง Network capabilities.
- [DEMI Architecture Baseline](../architecture/DEMI_ARCHITECTURE_BASELINE.md) — role/capability/scope และ Hospital Owner boundaries.
- [Phase 17 UAT Backlog](./PHASE_17_UAT_BACKLOG.md) — RPT-02, OWNER-01 และ AREA-01 requirement gates.
- [Phase 17K.0 Decision Pack](./PHASE_17K0_HOSPITAL_GOVERNANCE_RESPONSIBILITY_AREA_DECISION_PACK.md) — original K-Q01–K-Q25 identities, option meanings และ statuses.
- [Phase 15E.0 Reporting Contract Consolidation](./PHASE_15E0_REPORTING_DASHBOARD_EXPORT_CONTRACT_CONSOLIDATION.md) — prior reporting/privacy/export requirements.
- [Phase 15B.0 Program Workflow Foundation](./PHASE_15B0_PROGRAM_WORKFLOW_FOUNDATION.md), [Phase 15C.1 Program Linkage](./PHASE_15C1_SERVICE_TWO_PROGRAM_LINKAGE_DOMAIN_PERSISTENCE.md) และ [Phase 15E.1 Program Reporting Projection](./PHASE_15E1_PROGRAM_REPORTING_PROJECTION_FOUNDATION.md) — accepted Program/Follow-up source and timing references.
