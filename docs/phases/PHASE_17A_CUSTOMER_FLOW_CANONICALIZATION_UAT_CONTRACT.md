# DEMI Phase 17A — สัญญา Canonical Customer Flow และ UAT

สถานะ: **CLOSED — authoritative product contract และแผนยอมรับสำหรับ Phase 17B เป็นต้นไป**
วันที่จัดทำ: 2026-09-29
ขอบเขต: วิเคราะห์เอกสารและ runtime ปัจจุบันเท่านั้น ไม่มีการเปลี่ยน behavior ของผลิตภัณฑ์
Backlog แบบ machine-readable: [Phase 17 UAT Backlog](./PHASE_17_UAT_BACKLOG.md)

## 1. เป้าหมายและขอบเขต

เป้าหมายตั้งแต่ Phase 17 คือ **DEMI demo ที่ลูกค้าทดลองใน UAT ได้จริง** ไม่ใช่เพียง requirement-gathering prototype และยังไม่ใช่ production-ready release

UAT ต้องให้ผู้ใช้ตัวแทนเข้าสู่ระบบ เปิด workspace ที่ตรงกับบริบท ใช้เส้นทางงานที่รองรับ บันทึกข้อมูลตัวอย่างจริง อ่านข้อมูลที่บันทึกกลับ ตรวจสอบสิทธิ์และขอบเขตข้อมูล ใช้งานบนจอขนาดมือถือ และส่งความเห็นจาก workflow ที่ทำงานจริงได้

Phase 17A ปิดเฉพาะ product/architecture contract และ implementation mapping นี้ ไม่สร้าง Patient Home, schema, domain หรือ feature ใหม่

## 2. แหล่งตัดสินใจและหลักฐาน

ใช้ลำดับนี้โดยแยก “ความตั้งใจผลิตภัณฑ์” ออกจาก “ข้อจำกัดที่กลไกต้องเคารพ”:

1. **Customer product intent ล่าสุดที่ยืนยันชัด** กำหนด actor, journey และผลลัพธ์ที่ต้องการ และ supersede ขอบเขต demo เก่าที่แคบกว่า
2. **Security, privacy, data-integrity และ architecture invariants ที่ยอมรับแล้ว** จำกัดวิธีทำเสมอ Customer intent ไม่อนุญาตให้เปลี่ยน trust boundary, identity model, authorization, credential ownership หรือ transaction guarantees โดยปริยาย หาก UX ขัดกัน ให้รักษาเจตนาแล้วเปลี่ยนกลไกให้ปลอดภัย
3. **Runtime, Prisma schema, route, service, policy และ test ปัจจุบัน** เป็นหลักฐานว่าอะไรทำงานอยู่จริงและขอบเขตใดถูกบังคับใช้ ไม่ใช่หลักฐานว่าลูกค้าอนุมัติ semantics ของ prototype แล้ว
4. **ADR และ phase contract ที่ยอมรับแล้ว** เป็นข้อผูกพันด้าน architecture/business semantics จนกว่าจะถูก supersede ด้วย decision ใหม่อย่างชัดเจน Current runtime ใช้แก้คำกล่าวอ้าง implementation ที่ล้าสมัย แต่ไม่เปลี่ยน ADR เอง
5. **Customer artifact** เป็นหลักฐานประกอบเฉพาะสิ่งที่ artifact แสดงได้ สมุดสรุป flow สำหรับ Phase 17A มาจากข้อความ whiteboard ที่ลูกค้าส่งมาใน request นี้ ไม่พบภาพ whiteboard แยกใน repository; ไฟล์ Dashboard workbook ไม่ใช่หลักฐานยืนยัน flow, metric หรือ clinical semantics
6. Legacy DEMI ใช้ค้นพบคำศัพท์/behavior เท่านั้น ไม่ใช่ target architecture หรือ authority
7. Engineering proposal และ assumption ใช้ท้ายสุด ต้องระบุให้ชัดและห้ามเขียนเป็น customer-approved truth

เอกสารที่ตรวจประกอบ: [DEMI Context](../CONTEXT.md), [Architecture Baseline](../architecture/DEMI_ARCHITECTURE_BASELINE.md), [ADR index](../adr/README.md), [ADR-0001 Identity](../adr/0001-person-and-user-identity.md), [ADR-0002 Authorization](../adr/0002-role-capability-scope-authorization.md), [ADR-0003 Hospital onboarding](../adr/0003-hospital-led-onboarding.md), [ADR-0004 Patient activation](../adr/0004-patient-provisioning-and-activation.md), [ADR-0005 server boundary](../adr/0005-server-side-application-boundary.md), [ADR-0006 transactions](../adr/0006-transactional-business-operations.md), [ADR-0008 workforce activation](../adr/0008-workforce-provisioning-and-activation.md), [Phase 15A](./PHASE_15A_BUSINESS_FLOW_CONSOLIDATION.md), [Phase 15E.3 closeout](./PHASE_15E3_DEMO_CLOSEOUT_FULL_JOURNEY_REAUDIT_RELEASE_READINESS.md) และ Phase 16E patient-import closeout ที่สรุปใน Context

## 3. Disposition และ UAT priority

ทุกรายการใน matrix มี disposition หลักเพียงหนึ่งค่า:

- **KEEP** — implementation ปัจจุบันตอบเจตนาที่มีความหมายแล้ว
- **EXTEND** — domain เดิมถูกต้อง แต่ต้องเพิ่ม workflow, route/UI, query, capability หรือ policy
- **NEW DOMAIN** — เป็นแนวคิดแยก ไม่ควรบังคับใส่ใน domain ปัจจุบัน
- **REQUIREMENT NEEDED** — semantics ยังไม่พอที่จะ implement อย่างปลอดภัยหรือถูกต้อง
- **REJECT / REPLACE** — ปฏิเสธกลไกที่ขัด invariant และระบุ replacement ที่คงเจตนาไว้

ทุกรายการมี UAT priority หนึ่งค่า:

- **UAT-P0** — ขาดแล้วผู้ใช้เดิน core end-to-end journey ไม่ได้
- **UAT-P1** — เพิ่ม coverage ที่สำคัญ แต่ไม่ขวาง core journey
- **UAT-P2** — เพิ่มความสมจริง/ความครบถ้วนภายหลัง
- **REQUIREMENT-GATED** — ยัง implement ไม่ได้จนกว่าจะยืนยัน semantics แม้จะเป็นสิ่งที่ลูกค้าคาดหวัง

รายการที่มี disposition REQUIREMENT NEEDED หรือ NEW DOMAIN อาจเป็น UAT-P0 ได้ หากความสามารถนั้นเป็น blocker; priority ไม่ได้ยกเลิก requirement gate

## 4. Canonical actor และ workspace

| คำลูกค้า | DEMI actor/authority | Canonical mapping |
| --- | --- | --- |
| คนทั่วไป / ผู้ป่วยที่ใช้บริการของตนเอง | PATIENT | PATIENT เป็น role ของ User และหมายถึง authenticated person's own patient/self-service context; ไม่ใช่ Person และไม่ใช่ PatientHospitalRelationship. ปัจจุบัน PATIENT login ได้แต่ไม่มี self-service route หรือ self-read policy; Phase 17 ต้องเพิ่ม exact self scope จาก identity ฝั่ง server |
| ญาติ / ผู้ดูแลผู้ป่วยคนอื่น | ยังไม่มี canonical DEMI role หรือ authorization mapping ที่ยอมรับ | “ญาติ” ไม่ได้หมายถึง PATIENT โดยอัตโนมัติ และผู้ดูแลไม่จำเป็นต้องมี PatientProfile/PATIENT role เพื่อขอสิทธิ์ดูแล. การแทนตัวตนและ authority ต้อง requirement-gated ใน FAM-01; อาจเป็น authenticated User ที่มีสิทธิ์จาก accepted CareRelationship, PATIENT ที่ดูแลผู้อื่นด้วย, หรือรูปแบบอื่นที่ยืนยันภายหลัง |
| อาสาสมัครสาธารณสุข (อสม.) | OSM | ทำงานกับผู้ป่วยได้เฉพาะ exact active PatientOsmAssignment และ OSM-Hospital relationship ที่ active ไม่ได้สิทธิ์จากชื่อ role, geography หรือ Hospital hierarchy อย่างเดียว |
| เจ้าหน้าที่สาธารณสุข รพ./รพ.สต. | HOSPITAL + HospitalMembership MEMBER + profession metadata | Profession เช่น DOCTOR, NURSE, COORDINATOR, OTHER ใช้บอกประเภทงาน ไม่ใช่ authorization authority ใหม่ด้วยตัวเอง |
| แอดมิน รพ. | HOSPITAL + HospitalMembership OWNER ภายใน Hospital โดยตรง | ใช้ Hospital governance/workforce authority ที่ policy ระบุ ไม่ใช่ Platform ADMIN |
| Platform administrator | ADMIN | Platform governance เช่น onboarding/review เท่านั้น Role ADMIN ลำพังไม่มี routine patient-care scope |
| บุคคลที่ทำงานและเป็นผู้ป่วยด้วย | Person/User เดียว มีหลาย UserRole เช่น OSM + PATIENT หรือ HOSPITAL + PATIENT | เพิ่มบริบท Personal และ Work ใน UI ได้ แต่เป็น workspace projection เท่านั้น Server ยัง resolve ActorContext และตรวจ role, capability, direct Hospital/relationship scope ใหม่ทุก request |

### Invariants ที่ Phase 17 คงไว้

- Person คือมนุษย์; User คือ account; หนึ่ง User เชื่อม Person เดียว และมีหลาย UserRole ได้ ห้ามสร้างบัญชีซ้ำเพื่อทำให้ผู้ปฏิบัติงานเป็นผู้ป่วยเอง
- Client เลือก workspace เพื่อ UX ได้ แต่ห้ามส่ง role, Hospital, owner หรือ permission มาเป็น authority; server derive authority จาก ActorContext และข้อมูลปัจจุบัน
- Hospital parent reference ใน schema ไม่ทำให้ parent/child authority สืบทอดกัน
- Hospital OWNER ไม่ใช่ Platform ADMIN
- Staff ห้ามรู้หรือเลือก predictable patient password
- “ญาติ/ผู้ดูแล” ไม่ใช่ role ที่ยอมรับแล้ว; ห้ามบังคับเพิ่ม PATIENT role เพื่อได้ caregiver access หรือสร้าง CAREGIVER Role enum ใน Phase 17A. หากอนุมัติภายหลัง caregiver authority ต้องมาจาก explicit authoritative relationship และ scoped permissions ไม่ใช่จากการมี PATIENT role อย่างเดียว
- OSM assignment และ family/caregiver relationship เป็นคนละ domain, ความสัมพันธ์ และ trust/permission semantics; ห้าม reuse PatientOsmAssignment
- QR เป็นเพียง invitation transport ไม่ใช่ authorization grant
- Follow-up persistence คง 0..N ถึงแม้ UI จะเน้นหกรอบแรก
- Report/export เป็น projection/query จาก canonical operational records; ห้ามสร้าง second source of truth เพื่อ dashboard หรือ Excel
- Multi-step writes ที่ต้อง atomic ยังคง transaction/idempotency/concurrency semantics เดิม

## 5. Canonical customer journeys

### Patient / บุคคลทั่วไป

Provision โดย actor ที่ได้รับอนุญาต
→ Activation แบบ one-time
→ ผู้ป่วยตั้ง credential เอง
→ Login ด้วย National ID และ password
→ Personal Home
→ My Health
→ Care Journey: Screening/Baseline/Patient Program/Service 1/Goal Plan/Follow-up/Final/History ตามข้อมูลที่มีและเปิดให้เห็น
→ Appointment: ดูรายการ/รายละเอียด และทำ action ที่ contract อนุญาต
→ Profile

Current implementation มี provisioning, activation, National ID login และ operator-side care workflows แล้ว แต่ไม่มี Personal Home, own-care authorization หรือ Patient appointment read/action route ดังนั้น journey นี้ยังไม่ UAT-ready ฝั่งผู้ป่วย

“เพิ่มบริการ”/เลือกบริการและการระบุ OSM เป็น CARE-07 requirement gate แยกต่างหาก: ห้ามสมมติว่าเป็นการสร้าง PatientProgram, PatientHospitalRelationship หรือ PatientOsmAssignment โดยตรง; การเลือก OSM อาจเป็น preference/request หรืออำนาจ assignment ของ Hospital ซึ่งยังไม่ยืนยัน

Family/caregiver, medication, wellness, content, consent, reminders และ hospital contact เป็น future extension ตาม matrix; ห้ามแสดงหน้าเปล่าหรือปุ่มหลอกเป็นงานเสร็จแล้ว

### OSM

Login → Work context → Assigned Patients → Patient Detail → Screening / Baseline / Patient Program / Service 1 / Goal Plan / Follow-up → Appointment read ตามสิทธิ์ปัจจุบัน → History

เมื่อ OSM มี PATIENT capability ด้วย: สลับไป Personal context แล้วทำ own patient journey โดยใช้ Person/User เดิม การสลับ context ไม่ขยาย OSM assignment หรือสร้างตัวตนผู้ป่วยซ้ำ

### Hospital staff

Login → Hospital Work context ที่ server อนุญาต → Patient Directory → Patient Detail → Care workflow → Appointment → Workforce/operational function เฉพาะ capability และ Hospital scope ที่มี

หากมี PATIENT role ด้วย ให้ Personal context ใช้ identity เดิมและ own patient scope แยกจาก work scope การมี profession หรือการอยู่ Hospital เดียวกันไม่ทำให้เพิ่ม authority เอง

### Hospital Owner

Login → Hospital governance/workforce context → Provision/ดูแลผู้ป่วย บุคลากร และ OSM ตาม policy ปัจจุบัน → Responsibility-area operations เมื่อความหมายและ scope ถูกกำหนดแล้ว → Factual service report และ export เมื่อ scope/fields/authorization contract พร้อม

Hospital Owner ไม่ได้ platform onboarding, platform-wide directory หรือสิทธิ์ ADMIN จากการเป็นผู้ดูแลโรงพยาบาล

## 6. Current-vs-customer gap matrix

Evidence ใช้ path ปัจจุบันใน repository; ชื่อ model, policy และ test ในช่อง evidence ใช้ตรวจ behavior จริง ไม่ใช่ดูจากชื่อ feature อย่างเดียว สำหรับรายการที่ไม่มี implementation ระบุ absence จาก route inventory, src/modules inventory และ prisma/schema.prisma

| ID | คำลูกค้า | DEMI concept / actor | Current evidence: route, module/model, policy, tests | Disposition | Exact gap, implementation layer, dependency/question | UAT |
| --- | --- | --- | --- | --- | --- | --- |
| AUTH-01 | Login ด้วยเลขบัตรประชาชน | Authentication / ทุก account ที่เปิดใช้ | app/login; auth login actions, password-login-identity-service; Person/User และ authSubject; server actor resolution; tests password-login-identity-service.test, login-schema.test, actor-context-service.test | KEEP | National ID + password มีอยู่แล้ว; National ID เป็น identity lookup ไม่ใช่ ownership proof. ไม่มี gap ต่อ customer intent นี้. Layer: none | UAT-P0 |
| AUTH-02 | ผู้ป่วยถูกเพิ่มโดยเจ้าหน้าที่และเข้าใช้งานครั้งแรก | Patient provision → activation / Hospital actor ที่ policy อนุญาตและ PATIENT | app/app/patients/provision, app/app/patients/activation, app/activate/patient; patient-provisioning/patient-activation; Person, User, PatientProfile, PatientHospitalRelationship, PatientActivation; provisioning/activation policies; tests patient-provisioning, activation-token-service, patient-activation-page, server-actions | KEEP | Provisioning แยกจาก credential; ผู้ป่วยที่ถูก provision รับ one-time activation แล้วตั้ง password เอง. flow นี้ยังเป็นเส้นทางที่รองรับและไม่ถูกแทนที่ด้วยคำว่า “ลงทะเบียน” ในหน้า Login; customer intent นั้นแยกเป็น AUTH-04. Layer: ปัจจุบันรองรับ | UAT-P0 |
| AUTH-03 | Whiteboard เสนอวันเกิดเป็น password | Patient credential establishment / patient และผู้ provision | app/activate/patient; patient activation กับ password-auth provisioning service; ADR-0004 และ Phase 5B.2 | REJECT / REPLACE | ห้ามใช้ DOB, National ID, phone หรือ default ที่เดาได้เป็น password. คง intent เข้าใช้งานครั้งแรกด้วย Provision → one-time activation → ผู้ใช้ตั้ง credential เอง → Login. Layer: security/authentication; dependency: patient activation proofing ที่ ADR ระบุ | UAT-P0 |
| AUTH-04 | “ลงทะเบียนเข้าใช้งานที่หน้า Login” | Login-entry onboarding intent / บุคคลที่ยังไม่มี session; identity และ Hospital authority ยังไม่ทราบ | app/login มี login flow; patient provisioning/activation routes และ ADR-0004 แยก provisioning ออกจาก activation; ไม่พบ confirmed public self-registration route/workflow ใน runtime | REQUIREMENT NEEDED | ยังเลือกความหมายไม่ได้: (1) สร้าง Patient/account ใหม่, (2) ค้นหา Patient ที่ provision แล้วเริ่ม activation, (3) ส่งคำขอให้ Hospital ตรวจสอบ, หรือ (4) เริ่ม identity/onboarding แบบควบคุมอื่น. ห้าม public create, client-selected role, uncontrolled Hospital relationship, DOB/default/predictable credential หรือข้าม server-side identity verification. Layer: product/authentication + identity/provisioning/policy; dependency: customer decision on identity proofing and Hospital relationship ownership | REQUIREMENT-GATED |
| NAV-01 | เจ้าหน้าที่เข้า Home และไปยังงานตามบทบาท | Work navigation / HOSPITAL, OSM, OWNER, ADMIN | app/app, app/app/patients, app/app/patients/assigned, app/app/workforce และ admin routes; app-shell application-navigation/application-workspace; ActorContext; policies ประกอบแต่ละลิงก์; tests application-navigation.test, application-workspace.test | KEEP | /app และเมนูงานตาม scope มีจริง พร้อม empty/suspended states. ใช้เป็นฐานของ Work context. Layer: ปัจจุบันรองรับ | UAT-P0 |
| NAV-02 | Patient Home / หน้าแรกของผู้ป่วย | Personal patient workspace / PATIENT | app/app/page.tsx แสดงว่า patient-only ยังไม่มีรายการงาน; ไม่มี patient-home route/module/model/read policy | EXTEND | เพิ่ม Patient Home ที่นำไปยังข้อมูลและขั้นตอนที่ผู้ป่วยมีสิทธิ์จริง ไม่มี empty placeholder ที่เสนอเป็น feature เสร็จ. Layer: UI + query + policy; dependency: NAV-04 own scope | UAT-P0 |
| NAV-03 | OSM/เจ้าหน้าที่ที่เป็นผู้ป่วยสลับ Personal กับ Work | Workspace projection / OSM+PATIENT, HOSPITAL+PATIENT | Person/User/UserRole รองรับหลาย role; /app project workspaces และแสดง role labels; application-navigation/application-workspace tests; ไม่มี context selector หรือ patient route | EXTEND | ทำ Personal/Work context selection โดยไม่เปลี่ยน identity และไม่ให้ client-selected role เป็น authority. Layer: UI + workspace projection; dependency: NAV-04 | UAT-P0 |
| NAV-04 | ผู้ป่วยเห็นเฉพาะข้อมูลของตนเอง | Patient self-scope / PATIENT | Patient detail และ clinical access services resolve exact PatientHospitalRelationship; patient-directory, screening, baseline, goal, follow-up, appointment, evidence policies อนุญาต direct Hospital/exact OSM และปฏิเสธ PATIENT; ไม่มี self policy | EXTEND | เพิ่ม server-side scope จาก authenticated User → Person → PatientProfile → exact relationship(s) ของตน และ per-capability self read. ห้ามรับ relationshipId จาก client แล้วถือว่าเป็น ownership. Layer: policy + query/service; dependency: identity links ที่มีอยู่ | UAT-P0 |
| PAT-01 | Health information: ชื่อ/อายุ/ที่อยู่/ข้อมูลฉุกเฉิน | Patient own profile projection / PATIENT | app/app/patients/[relationshipId]; patient-profile-view; Person.givenName/familyName และ PatientProfile.dateOfBirth, gender, phoneNumber, addressText, emergencyContactName/Phone; patient-directory detail access; patient-detail-page.test | EXTEND | ข้อมูลบางส่วนแสดงแก่ operator แบบ read-only; ยังไม่มี Patient self-read. ไม่มีอายุที่ persist หรือ derive ใน runtime. เพิ่ม projection ให้เจ้าของข้อมูลอ่าน field ที่มีโดยตรง; อย่าคำนวณหรือแปลความข้อมูลใหม่. Layer: UI + query/policy; dependency: NAV-04 | UAT-P0 |
| PAT-02 | Health information: weight/height/waist และค่าที่บันทึกใน care journey | Patient view of existing raw measurements / PATIENT | Baseline, Follow-up, Final routes; patient-baseline, followups, patient-final-assessment; PatientBaseline, PatientFollowup, PatientFinalAssessment; capability เดิม staff/assigned OSM; query/service tests ของแต่ละ module | EXTEND | Raw fields มีใน workflow ปัจจุบันแต่ Patient ถูก deny. เพิ่ม own read ของ persisted facts พร้อมวันที่/บริบทและ empty state; ห้ามเรียกเป็นคำแนะนำหรือผลสำเร็จ. Layer: policy + query + UI; dependency: NAV-04 และ PAT-03 semantics สำหรับ derived data | UAT-P0 |
| PAT-03 | Age, BMI, NCD diagnosis และ family history | Clinical/derived health facts / PATIENT และผู้ดูแล care | PatientClassification มีเพียง RISK/DIABETES; baseline มี height/weight แต่ไม่มี BMI field/formula; ไม่มี diagnosis หรือ family-history model/module | REQUIREMENT NEEDED | Classification ไม่ใช่ diagnosis. ห้ามคำนวณ BMI, อายุเชิงกฎหมาย/คลินิก หรือแสดง RISK/DIABETES เป็น diagnosis. ต้องระบุแหล่งข้อมูล, หน่วย, effective date, formula/version, owner และความหมาย family history ก่อน. Layer: domain/query/clinical governance | REQUIREMENT-GATED |
| PAT-04 | แก้ไข Profile, address, phone, emergency contact | Patient profile editing / PATIENT และ Hospital operator | PatientProfile fields แสดงใน Patient Detail; ไม่มี profile-edit route/service/policy; Phase 10A/10B0 unresolved เรื่อง owner, visibility, correction, actor editability | REQUIREMENT NEEDED | ไม่เปิดแก้ไขเพียงเพราะมี column อยู่. ยืนยัน field ownership, patient-editable fields, verification, correction/history และ Hospital-local vs person-wide ownership. Layer: policy + application service + database หากต้องเก็บ history | REQUIREMENT-GATED |
| PAT-05 | Health plan | Patient health/care plan / PATIENT, OSM, HOSPITAL | PatientBaseline, PatientProgram, PatientGoalPlan เป็นคนละ model; /goals คือ Goal Plan prototype สำหรับกิจกรรม; no model ชื่อ health plan/care plan | REQUIREMENT NEEDED | ยืนยันว่า Health Plan หมายถึง Goal Plan เดิม, clinician-authored plan, patient-facing summary หรือรายการอื่น. ห้าม rename/ขยาย Goal Plan โดยอาศัยคำว่า plan อย่างเดียว. Layer: domain contract + query/UI | REQUIREMENT-GATED |
| CARE-01 | Screening, Baseline และ measurements | Screening/Initial Baseline / HOSPITAL, exact OSM; future PATIENT read | routes screenings and baseline; ScreeningAssessment/PatientBaseline; screening/baseline policies; screening-service and patient-baseline-service tests; Patient self-access is denied | EXTEND | Provider-entered/readback workflow มีจริง; เพิ่ม own read path เพื่อให้ผู้ป่วยเห็นรายการของตน. PAM/PROM exact instrument แยกเป็น CARE-02. Layer: UI + query + policy; dependency: NAV-04 | UAT-P0 |
| CARE-02 | PAM/PROM, life/self-knowledge, motivation activity และ life table | Assessment/empowerment semantics / patient and care staff | screening question-sets/scoring are source-defined legacy-prototype-v1; Service 1 has Routine/Floating Chart/Dream Card/Confidence; Phase 15A and 15E.3 mark these provisional; no customer-approved mapping | REQUIREMENT NEEDED | ระบุว่าแต่ละคำหมายถึง Screening, Service 1, Goal Plan หรือ domain ใหม่; confirm instrument/version, respondent, validated language, scoring/display, correction และผู้มีสิทธิ์เห็นก่อนนำเสนอเป็น approved measure. Layer: domain/validation/policy/UI | REQUIREMENT-GATED |
| CARE-03 | Service, Follow-up และ care/service history รวม Service 1 / Goal Plan | Patient Program episode, Service 1, Goal Plan/Service 2, Follow-up / PATIENT + care actors | programs, goals, followups routes; PatientProgram, four PatientProgramServiceOne* records, PatientGoalPlan/Items, PatientFollowup; patient-program/goals/followups policies/query; corresponding service/query/transport tests | EXTEND | Operator flow บันทึกและอ่านข้อมูลจริง มี Program + relationship isolation; Patient journey/read access, navigable history และ own readback ยังไม่มี. Goal Plan ไม่ได้เท่ากับ customer Health Plan โดยอัตโนมัติ. Layer: patient UI + self-read query/policy; dependency NAV-04 | UAT-P0 |
| CARE-04 | Follow-up rounds 1–6 และเพิ่มรอบได้ | Extensible Follow-up rounds / HOSPITAL, assigned OSM, future PATIENT read | PatientFollowup.roundNumber; unique namespace per Program/relationship with 0..N semantics; followups service/query; Phase 15E.3 re-audited seven rounds and >6 history | KEEP | Persist 0..N เหมือนเดิม. Customer UX expectation != database cardinality. UI จะเน้นหกรอบแรกและมีทางเข้ารอบต่อได้ภายหลังโดยไม่ทำ schema หกรอบ. Layer: ปัจจุบันรองรับ | UAT-P0 |
| CARE-05 | Final assessment และประวัติบริการ | Program Final / PATIENT read and care actors | PatientFinalAssessment unique per PatientProgram; Program report projection; patient-final-assessment/reporting policies/tests; nested routes under relationship/program | EXTEND | Final/Report เป็น facts ที่ operator อ่านได้ แต่ยังไม่มี patient navigation/read policy. เปิดเผย exact Program facts หลังตรวจ self scope และ visibility; no clinical outcome derivation. Layer: query/policy/UI; dependency NAV-04 | UAT-P1 |
| CARE-06 | Patient participates in measurements, assessment, empowerment activities | Patient-authored clinical/care inputs / PATIENT | Existing mutations derive actor server-side and allow Hospital/exact OSM; patient role denied; no patient mutation capability in care modules | REQUIREMENT NEEDED | แยกสิ่งที่ผู้ป่วยกรอกเองจาก clinician/OSM record; กำหนด review/correction, provenance, units, duplicate/concurrent submission และหากต้อง approve. Layer: policy + service + schema/database | REQUIREMENT-GATED |
| CARE-07 | เพิ่ม/เลือกบริการ: คัดกรอง, ติดตาม, เสริมพลัง; เลือก อสม. หรือให้โรงพยาบาลจัดผู้ดูแล | Patient service request/enrollment/care assignment / PATIENT, Hospital, OSM | PatientProgram, PatientHospitalRelationship, PatientOsmAssignment และ operator-side workflows มีอยู่; patient-program-policy ใช้ program:manage กับ direct active Hospital scope หรือ exact active OSM assignment และไม่รับ PATIENT; open service ปฏิเสธ Program ACTIVE ซ้ำด้วย conflict. ไม่พบ Patient service-request/enrollment route, request model, request policy หรือ Patient-authorized creation flow | REQUIREMENT NEEDED | กำหนดก่อนว่า “เพิ่มบริการ” สร้าง Program หรือ request, Patient self-enroll ได้หรือไม่, Hospital approval/ownership, service types, OSM choice เป็น preference หรือ authoritative assignment และ lifecycle ก่อนเริ่ม delivery. Conflict เมื่อ operator เปิด ACTIVE Program ซ้ำเป็น behavior ปัจจุบัน ไม่ใช่คำตอบที่อนุมัติสำหรับ Patient request. ห้ามอ้าง model ปัจจุบันว่าแทน customer flow นี้แล้ว. Layer: product/domain + application service + policy/transaction/database ตามผลตัดสินใจ | REQUIREMENT-GATED |
| APT-01 | เจ้าหน้าที่สร้าง/อ่าน/เลื่อน/ยกเลิก/ปิด/บันทึก no-show และดูประวัตินัด | Current appointment operations / HOSPITAL OWNER/MEMBER, assigned OSM read | app/app/patients/[relationshipId]/appointments, new, detail, edit; PatientAppointment; appointment service/query; appointment:read and appointment:manage; appointment policy/query/service/server-actions tests | KEEP | Current operator flow and real persistence/readback pass Phase 15E.3. HOSPITAL direct active scope manages; exact assigned OSM reads only. Existing prototype is not itself customer approval of every state. Layer: ปัจจุบันรองรับ | UAT-P0 |
| APT-02 | Patient appointment list/detail/history พร้อม date/time, hospital/location, responsible person | Patient-scoped appointment read / PATIENT | Same appointment routes/model/query; model stores scheduledAt, location, responsibleUserId, type and status; appointment policy denies PATIENT; no patient route | EXTEND | Add own appointment list/detail/history read. Expose only approved fields through own exact relationship scope; no write permission implied by read. Layer: route + query + policy + UI; dependency NAV-04 | UAT-P0 |
| APT-03 | Patient appointment response/confirmation | Appointment response / PATIENT | Current status enum is SCHEDULED, COMPLETED, CANCELLED, NO_SHOW; no CONFIRMED/DECLINED or appointment:respond; patient denied | REQUIREMENT NEEDED | ยืนยันว่า response คือ acknowledge, confirm attendance, decline หรืออย่างอื่น; states, deadlines, reminders, audit and whether response mutates scheduled status. Layer: domain + capability/policy + transaction | REQUIREMENT-GATED |
| APT-04 | Patient ขอเลื่อนนัดหรืออาจยืนยัน/เปลี่ยนนัด | Reschedule request vs direct reschedule / PATIENT, scheduler | Current HOSPITAL appointment:manage reschedules directly using expectedUpdatedAt; no request entity, patient action, appointment:request-reschedule or cancel capability | REQUIREMENT NEEDED | เลือกว่า Patient ส่ง request ให้ผู้รับผิดชอบหรือแก้วันเวลาโดยตรง; ตัดสิน patient cancellation/decline, conflicts, approval, notification, audit. ห้ามให้ appointment:manage เพียงเพื่อเพิ่ม action เดียว. Layer: application contract + policy + service/database | REQUIREMENT-GATED |
| APT-05 | สิทธิ์ appointment แยกตาม action | Appointment capability contract / HOSPITAL, OSM, PATIENT | appointment-policy defines current appointment:read and appointment:manage; service uses manage for existing create/reschedule/terminal transitions; OSM manage explicitly denied; policy tests cover roles/scopes | EXTEND | คง runtime capabilities appointment:read/manage สำหรับ behavior ที่รองรับจนมีการตัดสินใจและตั้งใจเปลี่ยน. หลังอนุมัติ actor/action/scope matrix อาจพิจารณา candidate เช่น appointment:read, appointment:create, appointment:respond, appointment:request-reschedule, appointment:reschedule, appointment:cancel, appointment:complete; รายการนี้ยังไม่ใช่ contract สุดท้ายหรือ implementation list. Layer: policy + service authorization; dependency: APT-03 response semantics, APT-04 reschedule/cancel semantics, OSM appointment-action decision และ approved actor/action/scope matrix | REQUIREMENT-GATED |
| APT-06 | นัดแสดงโรงพยาบาล/สถานที่/ผู้จัด/ผู้ป่วย/ช่องทางติดต่อ/OSM | Appointment display contract / Patient, OSM, scheduler | PatientAppointment has responsibleUserId, locationType/detail, note, relationship; query resolves Hospital and Patient; OSM assignment is separate PatientOsmAssignment; no appointment-owned contact field | REQUIREMENT NEEDED | ระบุว่า responsibleUserId คือผู้จัดนัดหรือผู้รับผิดชอบบริการ, แหล่ง contact ของ Hospital/Patient, และ OSM เป็น current assignment ณ ตอนดูหรือ snapshot ณ วันนัด. Layer: read model/domain contract | REQUIREMENT-GATED |
| OSM-01 | OSM เห็น “เพื่อนที่ดูแล” และทำ service/follow-up/assessment/history | Assigned patient work context / OSM | /app/patients/assigned; PatientOsmAssignment, exact active relationship policy; patient detail, screening, baseline, program, goal, followup, evidence modules; assigned-directory/assignment tests | KEEP | Existing assigned-patient work journey is real and exact-scope. Patient profile/detail is operator projection, not OSM’s personal patient self-service. Layer: ปัจจุบันรองรับ | UAT-P0 |
| OSM-02 | OSM ซึ่งเป็น PATIENT เข้า Personal ของตน | One User with OSM + PATIENT / OSM and PATIENT | Role enum permits both; Person/User and UserRole are separate; actor context retains role set; /app projects work only and patient-only empty message; no own patient route | EXTEND | Reuse same Person/User; add Personal patient scope and selector. Keep assigned OSM work resources and personal resources in separate queries/policies. Layer: workspace/UI + self-scope policy; dependency NAV-03/04 | UAT-P0 |
| OSM-03 | OSM มี appointment interaction | Assigned OSM appointment action / OSM | Appointment policy grants exact assigned read and explicitly denies manage; no other appointment-action capability | REQUIREMENT NEEDED | ระบุว่า interaction คืออ่าน, ยืนยันร่วม, ประสานเลื่อน, หรือแก้/ยกเลิกนัด. Do not widen OSM authority from customer label alone. Layer: policy + workflow | REQUIREMENT-GATED |
| STAFF-01 | Staff โรงพยาบาลทำ patient service/care workflow | HOSPITAL MEMBER and profession metadata / HOSPITAL | Patient directory/detail and current screening, baseline, program, goal, followup, final, appointment, evidence routes; direct active Hospital membership boundary; module policy tests | KEEP | Current direct-Hospital care operation exists. Profession is classification and does not independently change authority; preserve existing capability-specific policy. Layer: ปัจจุบันรองรับ | UAT-P0 |
| STAFF-02 | Staff ที่เป็นผู้ป่วยดูข้อมูลส่วนตัวของตน | HOSPITAL + PATIENT / staff and self | Person/User supports multiple roles; no patient self-service route/policy; work patient reads are Hospital scope, not self scope | EXTEND | Add Personal context using same account and NAV-04 own scope. Hospital work access must not expose own record through another Hospital’s general directory shortcut. Layer: workspace + self-scope query/policy; dependency NAV-03/04 | UAT-P0 |
| STAFF-03 | Staff provision patient/OSM/staff และเข้าถึงข้อมูลตามสิทธิ์ | Hospital operational provisioning / OWNER and permitted HOSPITAL actors | routes patients/provision, patients/activation, workforce; patient-provisioning, patient-activation, workforce modules and scoped policies; Person/User reuse, PatientActivation/WorkforceActivation; provisioning/workforce tests | KEEP | Existing approved role-specific provisioning, activation and workforce flows should be reused. They do not imply arbitrary staff profile edit, area assignment or export. Layer: ปัจจุบันรองรับตามแต่ละ policy | UAT-P1 |
| OWNER-01 | แอดมิน รพ. เพิ่มและดูแลผู้ป่วย/OSM/staff | Hospital governance / HOSPITAL OWNER | /app/workforce, patient provision/activation; workforce, hospital-governance modules; HospitalMembership OWNER policy; owner/workforce service tests | EXTEND | มี provision/activation และ membership/profession lifecycle บางส่วน; ยังไม่มี generic profile/contact edit หรือ responsibility-area assignment. เพิ่มเฉพาะ governance action ที่ยืนยันแล้ว ไม่เพิ่ม broad user authority. Layer: UI + services + policy; dependency: field ownership และ AREA-01 | UAT-P1 |
| OWNER-02 | “แอดมิน รพ.” ไม่ใช่ Platform Admin | Hospital OWNER vs ADMIN | Role enum ADMIN/HOSPITAL/OSM/PATIENT; MembershipType OWNER/MEMBER; hospital-owner/onboarding policies; ADR-0002/0003/0008; tests prohibit admin-only routine patient access | KEEP | Map customer hospital admin to active direct HOSPITAL OWNER membership. Platform ADMIN-only remains denied for routine patient workflows. Layer: ปัจจุบันรองรับ | UAT-P0 |
| AREA-01 | เลือก/assign เขตความรับผิดชอบ รพ./รพ.สต. | Responsibility area / Hospital, staff, OSM, patient | Hospital has parentHospitalId only; OsmHospitalRelationship and PatientOsmAssignment have exact relationship semantics; no responsibility-area entity/module/policy | REQUIREMENT NEEDED | แยกว่าเป็น org hierarchy, operational grouping, geography/service area, work assignment, authorization scope, report grouping หรือหลายอย่าง. ห้ามใช้ parentHospitalId หรือสร้าง authorization scope ใหม่จนกว่าจะนิยาม inheritance/revocation. Layer: domain + database + policy/query | REQUIREMENT-GATED |
| FAM-01 | ครอบครัวของฉัน, ผู้ที่ฉันดูแล, ผู้ที่ดูแลฉัน และ link caregiver | Family/caregiver relationship / authenticated User; PATIENT role not required by current evidence | No family/caregiver route, module, model or policy in src/modules, app/app, prisma/schema.prisma; PatientOsmAssignment is separate exact OSM work assignment | NEW DOMAIN | ออกแบบ explicit authoritative relationship และ scoped permissions; caregiver authority ห้ามเกิดจาก PATIENT role อย่างเดียว. “ญาติ” อาจเป็น authenticated User ที่ไม่มี PatientProfile/PATIENT role; จะต้องมี role หรือไม่ยัง requirement-gated. ห้ามสร้าง CAREGIVER Role enum ตอนนี้. Layer: domain + database + policy + invitation transport | REQUIREMENT-GATED |
| FAM-02 | QR ใช้เชื่อมครอบครัวหรือ caregiver | Secure invitation transport / inviters and invitees | No QR relationship model; workforce/patient activation QR/link ปัจจุบันนำเสนอ one-time activation credential ที่ server ตรวจ; no family authorization | REJECT / REPLACE | QR ที่เปิดสิทธิ์ทันทีถูกปฏิเสธ. คง intentด้วย create invitation → QR/link → authenticate → verify invitation → explicit accept → server creates scoped relationship → expire/revoke; access remains capability/scope checked. Layer: auth + invitation service + relationship policy; depends FAM-01 decisions | REQUIREMENT-GATED |
| MED-01 | Patient-maintained personal medication tracking | Personal / PATIENT SELF | No medication route/module/model/policy implemented | NEW DOMAIN | Q30–Q53 CLOSED / OWNER APPROVED; name + optional instruction; own PatientProfile; ACTIVE edit; terminal STOPPED; no prescription claims, structured dose or schedule in 17G.1. See [17G.1 contract](./PHASE_17G1_PERSONAL_MEDICATION_IMPLEMENTATION_CONTRACT.md) | CONTRACT APPROVED / 17G.1 CLEARED FOR IMPLEMENTATION; NOT IMPLEMENTED |
| MED-02 | Prescription หรือ Hospital-managed medication | Prescribing/dispensing workflow / HOSPITAL and PATIENT | No medication/prescription model, workflow or policy; existing care models have no medication ownership | REQUIREMENT NEEDED | ยืนยันว่าต้องการดูรายการยาที่ได้รับ, reconcile, issue prescription, dispensing, หรือเพียง personal note. Do not implement e-prescribing or clinical medication management from “medication” wording. Layer: clinical domain + policy + integrations if confirmed | REQUIREMENT-GATED |
| WELL-01 | บันทึกมื้อเช้า/กลางวัน/เย็น/ของว่าง | Meal journal / PATIENT | No meal route/module/model/policy; existing PatientGoalPlan/PatientGoalItem represent care/activity goals, not meal journal | NEW DOMAIN | แยก wellness meal log จาก Goal Plan. Gate minimum record fields, date/time, free-text/portion/image, edit/delete/history and visibility. Customer categories are breakfast/lunch/dinner/snack. Layer: domain/database/UI | REQUIREMENT-GATED |
| WELL-02 | บันทึกการออกกำลังกายและดูประวัติ | Exercise journal/history / PATIENT | No exercise-log route/module/model/policy; PatientGoalItem stores plan targetDays/value/unit, not actual completed exercise history | NEW DOMAIN | แยก actual exercise records จาก Goal Plan targets. Gate activity vocabulary, duration/unit, date/time, free-text, correction/history and visibility. Layer: domain/database/query/UI | REQUIREMENT-GATED |
| WELL-03 | Weight goal | Personal wellness target / PATIENT | No weight-target model; Baseline/Follow-up are observed measurements; Goal Plan is provisional care activity plan | REQUIREMENT NEEDED | ยืนยันว่าเป็น patient-selected target, clinician-agreed goal, weight-loss program target หรือ display-only preference; define units, target date, review/correction and relation to care plan. Do not overload PatientGoalPlan. Layer: domain + policy/database | REQUIREMENT-GATED |
| CONTENT-01 | Hospital news/health knowledge: NCD, food, exercise, other | Patient-facing content / hospital publisher and PATIENT reader | No CMS/content route/module/model/policy; no content category model in schema; HospitalMaster is reference data, not CMS | NEW DOMAIN | กำหนด source/author, publisher/approval, Hospital ownership, audience, category vocabulary, publication/expiry, moderation and versioning. Layer: new bounded content domain + query/UI | REQUIREMENT-GATED |
| CONTENT-02 | Hospital contact information | Hospital contact card / PATIENT, HOSPITAL | Hospital stores hospitalCode/name/status/parentHospitalId; appointment stores location detail; no canonical Hospital address/phone/contact model | REQUIREMENT NEEDED | กำหนด authoritative contact fields, source/owner/update permission, public vs scoped visibility and Hospital vs รพ.สต. rendering. น่าจะ extend Hospital master/contact data หลังตัดสิน ไม่สร้าง duplicate per page. Layer: data ownership + query/UI | REQUIREMENT-GATED |
| NOTIF-01 | Reminder เช้า/กลางวัน/เย็น/ก่อนนอน และ event reminders | Reminder/event notification / PATIENT and care actors | No notification route/module/model/preference; Appointment exists; medication schedule does not; Follow-up records have dates but no due-date schedule | REQUIREMENT NEEDED | Candidate sources: upcoming Appointment; medication reminder only after MED-01 contract; Follow-up due only after due-date source is defined. Resolve local time, quiet hours, timezone, opt-in, delivery/retry and channel separately. Do not build generic engine or presume Push/LINE/email. Layer: cross-cutting events/preferences/delivery | REQUIREMENT-GATED |
| ACCOUNT-01 | Profile/account/settings | Account and personal preferences / authenticated user | Person/User/PatientProfile exist; Profile values are operator read-only; no patient account/settings route or preferences model | REQUIREMENT NEEDED | แยก identity/profile edit, credential actions, notification preference และ accessibility settings. Define owner, verification, recovery, privacy and persisted preferences before mutation. Layer: account service + policy + UI/database as needed | REQUIREMENT-GATED |
| ACCOUNT-02 | Terms, privacy, health disclosure และ marketing consent | Versioned consent / user, controller, Hospital if applicable | No consent/terms/privacy/marketing-consent model/module/policy found | REQUIREMENT NEEDED | Define legal purpose, document/version, affirmative evidence, actor, time, scope, withdrawal, re-consent and effect on access/processing. ห้ามแทน versioned consent ด้วย arbitrary booleans. Layer: legal/domain + transactional persistence + audit | REQUIREMENT-GATED |
| SUPPORT-01 | Report application problem | User feedback/support request / all authenticated actors | No in-app issue-report route/module/model/policy; generic safe server errors are not a feedback workflow | NEW DOMAIN | Add only after destination, required context, sensitive/health data handling, reporter identity, access and retention are defined. Avoid sending PHI/secrets in logs or external messages by default. Layer: support intake + privacy + UI | REQUIREMENT-GATED |
| RPT-01 | Service history/report ที่มีอยู่ | Program factual report projection / active direct HOSPITAL OWNER/MEMBER and exact assigned OSM | nested app/app/patients/[relationshipId]/programs/[programId]/report; reporting projection/query/policy; report:program:read; source Baseline, Program, Service 1, Goal Plan, Follow-up, Final without duplicate persistence; report tests and Phase 15E.3 | KEEP | Existing report is scoped, factual, paginated projection. Reuse source operational records and current exact access; it is not a hospital-wide dashboard and does not include official clinical outcome. Layer: ปัจจุบันรองรับ | UAT-P1 |
| RPT-02 | Hospital service dashboard และ download/export | Reporting projection + export / Hospital actors per future scope | Only Program factual report route/module exists; no Hospital dashboard/export route; Phase 15E.3 register RPT-02/24/25/28 and source report projection | EXTEND | Reuse canonical operational records → reporting projection/query → dashboard/export; no second persisted truth. Gate dimensions, columns, actor/Hospital scope, PII, format, pagination/overflow, audit and abuse control. Layer: reporting query + policy + transport/export UI | REQUIREMENT-GATED |

สรุป **50 product capabilities** (ไม่นับ UAT Delivery / Environment Track): **KEEP 10, EXTEND 14, NEW DOMAIN 6, REQUIREMENT NEEDED 18, REJECT / REPLACE 2**. Product UAT priority: **UAT-P0 19, UAT-P1 4, UAT-P2 0, REQUIREMENT-GATED 27**. APT-03/04 และ APT-05 เป็น gate ของ appointment interaction/capability refinement แต่ไม่ขวาง patient appointment read-only ใน 17C.

Product UAT-P0 ที่ implement/reuse ได้ทันที: **AUTH-01, AUTH-02, AUTH-03, NAV-01, NAV-02, NAV-03, NAV-04, PAT-01, PAT-02, CARE-01, CARE-03, CARE-04, APT-01, APT-02, OSM-01, OSM-02, STAFF-01, STAFF-02, OWNER-02**. รายการ UAT Delivery มี priority แยกและไม่นับรวมใน 50 capabilities นี้.

### CARE-07: คำถามที่ต้องยืนยันก่อนออกแบบ service request

- “เพิ่มบริการ” สร้าง PatientProgram โดยตรง หรือสร้างเพียง service request ก่อน?
- Patient self-enroll ได้หรือ Hospital ต้องอนุมัติ? Patient เลือกชนิดบริการใดได้บ้าง?
- Patient เลือก OSM ได้หรือไม่; เป็น preference/request หรือ authoritative assignment? Hospital เป็นผู้ assign ขั้นสุดท้ายและ override/change ได้หรือไม่?
- request ผูกกับ Hospital ใด; Patient ขอจากหลาย Hospital ได้หรือไม่?
- หากมี ACTIVE Program อยู่แล้ว จะปฏิเสธ, queue, ต่อ Program เดิม หรือมีกติกาอื่น?
- Patient ยกเลิก/ถอน request ได้หรือไม่ และต้องมี state transitions ใดก่อนเริ่ม service delivery จริง?

PatientProgram, PatientHospitalRelationship และ PatientOsmAssignment เป็นแนวคิดปัจจุบันที่อาจนำมาพิจารณาภายหลัง แต่ยังไม่ถือว่าแทน request/enrollment flow นี้.

### สิ่งที่ข้อมูลปัจจุบันบอกได้ — และบอกไม่ได้

- มี raw measurements บางชุดจริง: PatientBaseline มี weight/height/waist/BP/DTX/HbA1c; Follow-up และ Final มี subset. ค่าความหมาย/หน่วยและ longitudinal/clinical interpretation ยัง provisional ตาม Phase 15A/15E.3.
- PatientClassification ปัจจุบันมี RISK/DIABETES และ history; ไม่ใช่ medical diagnosis หรือ approved NCD diagnosis.
- Person/PatientProfile มีชื่อและ field บางส่วน รวม DOB/address/emergency contact; อายุไม่ถูก derive และ profile เป็น operator read-only.
- PatientProgram, Service 1, Goal Plan, Follow-up, Final, Evidence และ Program factual report เป็น domains จริงที่ exact relationship/Program scope บังคับใช้อยู่. Patient self-service ไม่ได้ตามมาจากการมีข้อมูลเหล่านี้.
- PatientAppointment มี scheduled time, type/status, responsibleUserId, duration, location fields, note และ creator; current service บังคับ current active Hospital state, serializable writes, stale-update/conflict และ idempotent creation. Patient ไม่มี access และ OSM อ่านอย่างเดียว.
- Follow-up มี 0..N ต่อ namespace, มีการตรวจ runtime/test มากกว่า 6 รอบ; whiteboard ไม่เปลี่ยน schema cardinality.
- Hospital มี parentHospitalId แต่ไม่มี responsibility-area semantics หรือ authority inheritance.
- ไม่มี Family/Caregiver, Medication, Wellness journal, CMS, Notification, Consent หรือ Support domain ใน schema/module/route inventory ปัจจุบัน.

### Evidence test index

ไฟล์ test ที่รองรับข้อกล่าวอ้างใน matrix:

- Authentication/identity: [password-login-identity-service.test.ts](../../src/modules/auth/services/password-login-identity-service.test.ts), [login-schema.test.ts](../../src/modules/auth/schemas/login-schema.test.ts), [actor-context-service.test.ts](../../src/modules/auth/services/actor-context-service.test.ts)
- Workspace/navigation: [application-navigation.test.ts](../../src/components/app-shell/application-navigation.test.ts), [application-workspace.test.ts](../../src/components/app-shell/application-workspace.test.ts)
- Patient directory/detail, provisioning/import, activation: [patient-detail-page.test.ts](../../src/modules/patient-directory/transport/patient-detail-page.test.ts), [patient-provisioning-transaction.test.ts](../../src/modules/patient-provisioning/services/patient-provisioning-transaction.test.ts), [patient-roster-import-service.test.ts](../../src/modules/patient-provisioning/services/patient-roster-import-service.test.ts), [activation-token-service.test.ts](../../src/modules/patient-activation/services/activation-token-service.test.ts), [patient-activation-page.test.ts](../../src/modules/patient-activation/transport/patient-activation-page.test.ts)
- Screening/Baseline/Program/Goal/Follow-up/Final/Evidence/Reporting: [screening-service.test.ts](../../src/modules/screening/services/screening-service.test.ts), [patient-baseline-service.test.ts](../../src/modules/patient-baseline/services/patient-baseline-service.test.ts), [patient-program-service.test.ts](../../src/modules/patient-program/services/patient-program-service.test.ts), [patient-program-service-one-service.test.ts](../../src/modules/patient-program/services/patient-program-service-one-service.test.ts), [goal-service.test.ts](../../src/modules/goals/services/goal-service.test.ts), [followup-service.test.ts](../../src/modules/followups/services/followup-service.test.ts), [patient-final-assessment-service.test.ts](../../src/modules/patient-final-assessment/services/patient-final-assessment-service.test.ts), [patient-evidence-service.test.ts](../../src/modules/patient-evidence/services/patient-evidence-service.test.ts), [program-report-query-service.test.ts](../../src/modules/reporting/services/program-report-query-service.test.ts)
- Appointment: [appointment-policy.test.ts](../../src/modules/appointments/policies/appointment-policy.test.ts), [appointment-service.test.ts](../../src/modules/appointments/services/appointment-service.test.ts), [appointment-query-service.test.ts](../../src/modules/appointments/services/appointment-query-service.test.ts), [server-actions.test.ts](../../src/modules/appointments/transport/server-actions.test.ts)
- OSM assignment and workforce governance: [patient-osm-assignment-service.test.ts](../../src/modules/patient-assignment/services/patient-osm-assignment-service.test.ts), [workforce-policy.test.ts](../../src/modules/workforce/policies/workforce-policy.test.ts), [hospital-owner-governance.test.ts](../../src/modules/workforce/services/hospital-owner-governance.test.ts)

## 7. UAT backlog และ implementation sequence

Backlog เต็มแบบ machine-readable อยู่ที่ [PHASE_17_UAT_BACKLOG.md](./PHASE_17_UAT_BACKLOG.md). ลำดับที่แนะนำตาม dependency และ code evidence:

1. **Phase 17B — Patient workspace และ own-scope foundation (P0).** Patient Home, Personal/Work projection สำหรับ multi-role, server-derived self scope และ read path ขั้นต่ำของ own profile/current relationships. ใช้ login/activation เดิม.
2. **Phase 17C — Patient care journey และ appointment read (P0).** เชื่อม read-only own health/care facts กับ Screening, Baseline, Program, Service 1, Goal Plan, Follow-up, Final/history และ appointment list/detail; read-after-write จาก source record เดิม.
3. **Phase 17D — Appointment response/reschedule contract และ capability slices.** ทำ customer decision ก่อนเพิ่ม mutation: response state, patient-request vs direct change, cancel authority, staff/OSM roles. จากนั้นแยก capability ตาม action ที่อนุมัติ. Patient appointment read จาก 17C ไม่รอ mutation decision.
4. **Phase 17E — Profile/account and consent contract.** นำ field ownership/editability/recovery และ versioned legal/health/marketing consent decisions มาทำ slice ที่แยกกัน.
5. **Phase 17F — Family/caregiver relationship.** ทำหลัง permission model, consent/acceptance, direction, revoke/expiry และ minor/legal representative semantics ชัด; QR invitation เป็น transport.
6. **Phase 17G — Medication.** 17G.0 CLOSED; Q30–Q53 CLOSED / OWNER APPROVED; MED-01 contract approved for bounded 17G.1; 17G.1 CLEARED FOR IMPLEMENTATION / NOT IMPLEMENTED; MED-02 REQUIREMENT-GATED; 17G.2 schedule NOT IMPLEMENTED; 17G.3 reminder/adherence NOT IMPLEMENTED; 17J notification delivery future; P17F-L04 OPEN / deferred; Q5 unchanged GOVERNANCE BLOCKED. See [17G.0B closeout](./PHASE_17G0B_MEDICATION_DECISION_CLOSEOUT.md) and [17G.1 contract](./PHASE_17G1_PERSONAL_MEDICATION_IMPLEMENTATION_CONTRACT.md). Bounded personal tracking only; no runtime/schema/migration changed.
7. **Phase 17H — Food, fitness และ weight goal.** แยก wellness observations จาก clinical Goal Plan; เริ่มเมื่อ record fields, units และ edit/history contract พร้อม.
8. **Phase 17I — Hospital knowledge/contact.** ทำ content publishing domain และ authoritative Hospital contact projection หลัง source/ownership/privacy decisions.
9. **Phase 17J — Notifications.** สร้างจาก event source ที่มีสัญญาแล้ว เช่น upcoming Appointment; medication/follow-up source ต้องเกิดจาก 17G/contract. เลือก external delivery channel แยก.
10. **Phase 17K — Responsibility areas และ hospital operational extensions.** อย่าสร้าง area/scope จนได้ taxonomy, owner, relationship, hierarchy/inheritance และ reporting use.
11. **Phase 17L — Hospital dashboard/export.** ต่อ reporting projection หลัง fields, actor scope, privacy/PII, format, pagination และ audit contract พร้อม.
12. **Phase 17M — In-app support/problem report.** เป็นงานเสริมหลัง core UAT; ทำเมื่อมี support destination, PHI handling, access และ retention contract แล้ว.

UAT Delivery / Environment Track ทำขนานกับ product phases ตลอดช่วง 17B เป็นต้นไป; หาก hosting/deployment target ยังไม่ยืนยัน ให้คงเป็น decision gate และอย่าสร้าง platform assumption.

17B เป็น implementation slice ที่แนะนำให้เริ่มหลัง review Phase 17A; Phase 17A นี้ไม่เริ่ม implementation ของ 17B. Requirement-gated slices ไม่ต้องเริ่มตามเลข phase หาก dependency/customer decision ยังไม่พร้อม.

## 8. Open requirement register

### Implementable now

- ใช้ National ID + password login ที่มีอยู่; National ID ใช้ resolve identity เท่านั้น.
- ใช้ Patient provision → secure activation → user establishes password สำหรับ Patient ที่มี record provision แล้ว (AUTH-02). “ลงทะเบียนเข้าใช้งานที่หน้า Login” ยังเป็น AUTH-04 requirement gate; ห้ามตีความเป็น unrestricted signup หรือเปลี่ยน activation path ก่อน customer decision.
- ทำ Patient Home, Personal/Work selector และ own self-read scope โดย server derive identity links ที่มีอยู่.
- ให้ Patient อ่าน own persisted profile fields และ raw facts ที่มีอยู่ผ่าน allowlisted query; แสดง missing/empty state โดยไม่คำนวณ age/BMI หรือเปลี่ยนความหมาย clinical.
- เพิ่ม Patient appointment read สำหรับ own relationship โดยไม่ให้ write capability ตามมา.
- ใช้ current Hospital direct scope, exact OSM assignment และ current patient/Program services; ไม่คัดลอก business rule ไปชั้น UI.
- คง provider-side care workflow, Program report, transaction และ data isolation ที่มีอยู่.

### Assumption acceptable for UAT

- PATIENT หมายถึง Person/User ที่มี PATIENT role และ PatientProfile; own relationship set derive จาก identity ในฐานข้อมูล.
- Work/Personal เป็น UI context projection เท่านั้น; context selection ไม่ได้ grant/revoke authority.
- OSM + PATIENT และ HOSPITAL + PATIENT ใช้ Person/User เดียว.
- Customer “แอดมิน รพ.” หมายถึง Hospital OWNER; Platform ADMIN แยกขาด.
- “Health information” อ่านได้เฉพาะ current persisted facts ที่ owner/scope มีอยู่; ค่าที่ไม่มีหรือ clinical meaning ที่ยัง provisional ต้องไม่แสดงเหมือน approved calculation.
- Follow-up UI อาจเน้น rounds 1–6 แต่ต้องอ่าน/ต่อรอบเกินหกได้จาก 0..N source.
- Appointment read เริ่มด้วย own list/detail/history; patient mutation รอ contract APT-03/04.
- “ญาติ/ผู้ดูแล” ไม่ได้เป็น PATIENT โดยอัตโนมัติ; ไม่มี caregiver role/authorization mapping ที่อนุมัติแล้ว. ห้ามสร้าง CAREGIVER Role enum หรือบังคับ PATIENT role ใน Phase 17A.
- สถานะ/label ของ prototype ที่มีอยู่ใช้ต่อใน actor flow เดิมได้ตามข้อจำกัดของ Phase 15; ห้ามนำเสนอ provisional instrument/calculation เป็น truth ที่ลูกค้าอนุมัติ.

### Customer decision required before implementation

- **AUTH-04 — Registration from Login:** “ลงทะเบียนเข้าใช้งานที่หน้า Login” หมายถึง (1) สร้าง Patient/account ใหม่, (2) ค้นหา Patient ที่ provision แล้วเพื่อเริ่ม activation, (3) ส่งคำขอให้ Hospital ตรวจสอบ, หรือ (4) controlled identity/onboarding แบบอื่น? บุคคลมี Patient record อยู่แล้วหรือไม่; ใครตรวจ identity; ใครสร้าง/ยืนยัน Hospital relationship; จุดเริ่มต้นนี้เพียงเริ่ม activation หรือสร้าง record จริง? ห้ามตัดสินเองหรือข้าม server-side proofing.
- **CARE-07 — Patient service request/enrollment:** “เพิ่มบริการ” สร้างอะไร: request หรือ PatientProgram; Patient self-enroll ได้หรือไม่; Hospital ต้องอนุมัติหรือไม่; Patient เลือก service type ได้อะไร; เลือก OSM ได้ไหมและเป็น preference หรือ authoritative assignment; Hospital assign/override/change OSM ได้หรือไม่; request อยู่ใต้ Hospital ใดและขอหลาย Hospital ได้ไหม; ACTIVE Program ที่มีอยู่แล้วจัดการอย่างไร; Patient ถอน/ยกเลิก request ได้หรือไม่; state transitions ใดเกิดก่อนเริ่ม delivery? PatientProgram, PatientHospitalRelationship และ PatientOsmAssignment เป็นเพียง concepts ที่อาจพิจารณา ไม่ใช่คำตอบที่อนุมัติแล้ว.
- Appointment response มี states/actions ใด, patient reschedule เป็น request หรือ direct edit, patient cancellation/decline authority, responsible/contact/OSM snapshot และ per-action actor capabilities.
- Clinical participation: PAM/PROM instrument/version/scoring, ผู้ตอบ, visibility, patient-authored measurement, approval/review/correction และหน่วย/วันที่.
- Age/BMI/diagnosis/family-history source, formula/version, owner, effective date, access และ correction.
- Health Plan เทียบกับ existing Goal Plan/Baseline/Program.
- Profile-editable field ownership/verification/correction; identity/contact changes; account recovery/session invalidation.
- Responsibility area ว่าเป็น hierarchy, operation, geography, assignment, authorization scope หรือ reporting grouping; parent/child inheritance และ lifecycle.
- **FAM-01 — Relative/caregiver identity and authority:** caregiver ต้องมี PATIENT role หรือมี caregiver-only authenticated User ได้; relationship ใดให้ authority และใครเป็นผู้สร้าง/ยอมรับ; อ่านข้อมูลใดและทำ action ใดได้; ต้องเก็บ acceptance/consent/expiry/revocation/audit อย่างไร; กรณี minor/legal representative มีหลักฐานและ authority แบบใด? ห้ามให้ role PATIENT เพียงอย่างเดียวแทน CareRelationship.
- Medication list vs schedule vs adherence vs prescription/dispensing; data authority, dose/unit/time and edit history.
- Meal/exercise minimum fields, units, categories, date/time, correction/delete/history and visibility; weight-goal semantics.
- Hospital content source, author/reviewer, Hospital ownership, categories, target audience, effective/expiry and publication lifecycle.
- Hospital contact source of truth, fields, editor and disclosure scope.
- Notification event definitions, timezone, quiet hours, preference/consent, delivery/retry and channels. Push/LINE/email decision แยกจาก event contract.
- Consent document/version, legal purpose, affirmative evidence, scope, withdrawal, re-consent, retention and processing effect.
- Support issue destination, safe context, PHI handling, staff visibility and retention.
- Dashboard/export metrics, columns, actors, scope, PII, format, overflow, audit and abuse controls.

### Production-hardening questions

ไม่ขวาง UAT flow เมื่อ core behavior ทำงานจริง แต่ต้องตัดสินก่อน production: route-level abuse/rate limiting, operational alerting/log retention, backup/restore/incident response, deployment secret and session operations, export abuse/audit retention, report reproducibility/cursor protection, long-term activation recovery proofing และ channel delivery guarantees. รายการที่เคยบันทึกใน Phase 15E.3 ยังคงเป็น production follow-up; เอกสารนี้ไม่ยกระดับเป็น UAT requirement โดยอัตโนมัติ.

## 9. UAT acceptance definition

Flow หนึ่งจะเรียกว่า **UAT-ready** ได้เมื่อครบทุกข้อ:

1. เข้าถึงผ่าน navigation และ deep-link ที่ตั้งใจไว้; ทุก primary action ทำงานจริงและไม่พาไปหน้า placeholder.
2. Authentication ใช้ credential ownership ตาม contract; server สร้าง ActorContext ใหม่ และทุก read/mutation ตรวจ role + capability + exact scope ฝั่ง server.
3. Resource ID จาก URL หรือ client ไม่เพิ่มสิทธิ์; self, Hospital, Program และ OSM boundaries แยกและ fail closed.
4. Workflow persist จริงเมื่อควรบันทึก และผู้ใช้เห็น read-after-write จาก authoritative source.
5. ผู้ใช้เดินข้าม step ที่เกี่ยวข้องได้; ไม่บังคับกรอก record ที่ไม่มี business need และไม่สร้าง side effect ที่ซ่อนอยู่.
6. Loading/pending, success, validation error, conflict/stale update, empty, forbidden และ safe unexpected-error state มีข้อความ/ทางไปต่อที่เหมาะสม.
7. ใช้ได้บนหน้าจอมือถือโดยไม่มี control สำคัญถูกตัด, ตารางบังคับ desktop หรือ primary action ใช้งานยาก.
8. ข้อมูลตัวอย่างพอสมจริงให้ทดสอบหลาย actor/relationship และอ่านกลับได้; ไม่ใช้ client-only fake persistence หรือ success ปลอม.
9. Clinical/business meaning ที่ยังไม่อนุมัติถูกตัดออกหรือแสดงเป็น provisional ชัดเจน; ไม่มี clinical calculation/diagnosis ที่คิดขึ้นเอง.
10. ไม่มี dead primary button, fake submit, navigation ไปหน้าเปล่าที่นำเสนอเป็น feature เสร็จ, หรือ unresolved placeholder ที่ masquerade เป็น complete feature.

UAT-ready ไม่ได้อ้าง production readiness และไม่อนุมัติ clinical/legal semantics ที่ยังเปิดอยู่

## 10. ความต่างจาก Phase 15 closeout

Phase 15E.3 ปิดวันที่ 2026-08-22 ที่ HEAD 5e8c02c และระบุขอบเขตชัดว่าเป็น **requirement-gathering demo**, ไม่ใช่ UAT/Production. ในเวลานั้น PATIENT self-service ถูก defer/deny, patient work experience เป็น operator-side และ hospital-wide dashboard/export อยู่นอก accepted scope. Current runtime ที่ตรวจใน branch นี้ยังไม่มี patient-self route/policy, family/medication/wellness/content/notification/consent domains หรือ hospital export; ส่วน operator-side appointments, care journeys และ factual Program report ที่ผ่าน closeout ยังคงมีอยู่และถูกนำมา map ใหม่ ไม่ได้ประกาศว่าครอบคลุม customer flow ใหม่ครบแล้ว.

HEAD ปัจจุบันของ branch main คือ ff6248edf75c12bfb7d20570e5e5a04756722a32 ซึ่งใหม่กว่า HEAD ใน Phase 15E.3 และรวม Phase 16 patient-import work ที่ปิด release gate ภายหลัง. Phase 16 เพิ่ม roster import/reconciliation ไม่ได้ปิด patient self-service/profile ownership หรือเปลี่ยน appointment/customer semantics. Scope เก่าใน Phase 15E.3 จึงไม่ใช่ product target ปัจจุบัน; สัญญา Phase 17A นี้คือ mapping/priority สำหรับ UAT intent ใหม่ โดยคง accepted security/architecture invariants.

## Phase 17F current-contract addendum (2026-10-01; updated by 17F.2B)

FAM-01/FAM-02 matrix, original roadmap and open questions above remain Phase 17A discovery evidence. [17F.0](./PHASE_17F0_FAMILY_CAREGIVER_DELEGATED_ACCESS_CONTRACT.md) and G01..G08 CLOSED / OWNER APPROVED; [17F.1](./PHASE_17F1_FAMILY_CAREGIVER_RELATIONSHIP_SECURITY_FOUNDATION.md) now IMPLEMENTED / CLOSED for relationship foundation. Existing ACTIVE User/Person intended-account invitation, canonical/hash National-ID locator (never authority), explicit acceptance, 24-hour invitation TTL, no automatic ACTIVE relationship expiry, audited terminal Patient revoke/own caregiver withdrawal and zero-data relationship acceptance remain unchanged. C07 remains ERRONEOUS / NOT A DECISION; G08 authoritative. No QR permission payload or new-account onboarding.

[17F.2B closeout](./PHASE_17F2B_DELEGATED_APPOINTMENT_READ_CONTRACT.md) records **L01/L02/L06 CLOSED / OWNER APPROVED** only for adult voluntary Patient-designated trusted caregiver appointment read (non-relatives permitted; no kinship type/verification). **17F.2 CLEARED FOR IMPLEMENTATION for synthetic/demo data; NOT IMPLEMENTED; runtime delegated Patient-resource allowlist EMPTY.** Real-data delegated disclosure remains controller/privacy governance-blocked under Q5; synthetic implementation/UAT may proceed now.

Separate immutable family-appointment-read-v1 grant, exact Patient-selected PHR, Patient proposal + intended caregiver acceptance; only hospitalName/type/scheduledAt/durationMinutes/locationType/status, upcoming rolling 90-day SCHEDULED/CANCELLED feed, no independent automatic expiry, mutation/export/other Patient resources. New PHR/parent never inherits; expansion requires new immutable grant/version + acceptance. Temporary Hospital/account ineligibility denies only; terminal revoke/withdraw immediately ends authority after commit. Lifecycle audit, no ordinary durable per-read AuditEvent. L03 QR OPEN / 17F.3; L04 OPEN re-audit/UAT; L05 OPEN / FUTURE expiry/renewal. Minors/legal representation deferred (no runtime capacity verification), 17E.2 parked, medication 17G. Original OSM/emergency-contact meanings and SELF/direct Hospital policies unchanged. See [backlog](./PHASE_17_UAT_BACKLOG.md).

## Current-status addendum — Phase 17F.3B (2026-10-02)

Earlier 17F.2B clearance/empty-allowlist and L03-open statements above are historical. 17F.2 family-appointment-read-v1 is IMPLEMENTED synthetic/demo only; see [implementation handoff](./PHASE_17F2_DELEGATED_APPOINTMENT_READ_IMPLEMENTATION.md). [17F.3B QR contract](./PHASE_17F3B_FAMILY_INVITATION_QR_CONTRACT.md): **P17F-L03 CLOSED / OWNER APPROVED; Q18–Q29 = A; 17F.3 CLEARED FOR IMPLEMENTATION / NOT IMPLEMENTED**. L04 OPEN; L05 OPEN / FUTURE; Q5 real-data GOVERNANCE BLOCKED unchanged. No runtime/schema/migration/new authority/native integration; narrow preview-response hardening is future implementation scope, login/fragment edges remain L04 evidence-gated. 17F.0 CLOSED; 17F.1 IMPLEMENTED / CLOSED; L01/L02/L06 CLOSED / OWNER APPROVED. Original OSM/emergency-contact and SELF/direct Hospital semantics unchanged.
