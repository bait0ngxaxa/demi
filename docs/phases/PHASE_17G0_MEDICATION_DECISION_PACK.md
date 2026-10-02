# Phase 17G.0 — Medication Domain Decision Pack (Corrected)

สถานะเอกสาร: **17G.0 CLOSED / CORRECTED PACK OWNER CLOSEOUT RECORDED**<br>
สถานะการตัดสินใจ: **Q30–Q53 CLOSED / OWNER APPROVED**<br>
สถานะการพัฒนา: **17G.1 CLEARED FOR IMPLEMENTATION / NOT IMPLEMENTED**<br>
MED-02: **REQUIREMENT-GATED**

## Current owner closeout — Phase 17G.0B

17G.0 CLOSED; Q30–Q53 CLOSED / OWNER APPROVED; MED-01 contract approved for bounded 17G.1; 17G.1 CLEARED FOR IMPLEMENTATION / NOT IMPLEMENTED; MED-02 REQUIREMENT-GATED; 17G.2 schedule NOT IMPLEMENTED; 17G.3 reminder/adherence NOT IMPLEMENTED; 17J notification delivery future; P17F-L04 OPEN / deferred; Q5 unchanged GOVERNANCE BLOCKED. See [owner closeout](./PHASE_17G0B_MEDICATION_DECISION_CLOSEOUT.md) and [implementation contract](./PHASE_17G1_PERSONAL_MEDICATION_IMPLEMENTATION_CONTRACT.md). Owner explicitly accepted the corrected package exactly. No runtime/schema/migration changes.

**Historical reading rule:** All OPEN / NOT OWNER APPROVED, NOT CLEARED and MED-01 REQUIREMENT-GATED statements in preserved sections 1–21 below describe the pre-17G.0B recommendation state. This later approval supersedes that state, including its then-final status. Historical options/evidence remain; they do not reopen Q30–Q53 or approve MED-02. Current technical authority is the linked 17G.1 contract.

## Historical recommendation pack (before 17G.0B approval)

เอกสารนี้เป็น requirement analysis, domain-boundary analysis และ security/privacy review เพื่อให้เจ้าของผลิตภัณฑ์ตัดสินใจ ไม่ใช่ implementation contract และไม่ใช่หลักฐานว่าเจ้าของอนุมัติข้อเสนอใดแล้ว

## 1. จุดเริ่มต้นและสถานะงาน

| รายการ | หลักฐาน / สถานะ |
| --- | --- |
| Repository | bait0ngxaxa/demi |
| Expected baseline | 12c63c933e5a0d7de6e65a24621c123f35f17a49 — fix(phase-17f4a): preserve grant acceptance evidence |
| Original pack actual starting HEAD | 80839fa640beda1db955d098fc84a0bc34605ecd — docs(phase-17f4b): record blocked family device UAT |
| ความสัมพันธ์กับ baseline | HEAD จริงใหม่กว่า baseline ที่คาดหนึ่ง commit และมี baseline เป็น parent โดยตรง ใช้ source ที่ HEAD จริงเป็น authority; ไม่ reset, revert, amend หรือเขียนทับ commit นั้น |
| สถานะก่อนเริ่ม | main อยู่ ahead 1 จาก origin/main; working tree สะอาด |
| ประเภทงาน | เอกสารวิเคราะห์และ decision pack เท่านั้น |
| Correction starting HEAD | 0a63e4c2441554508d16652ac46a1625a256e867 — docs(phase-17g0): add medication decision pack; working tree สะอาด |

ค่า Original pack actual starting HEAD ด้านบนเป็นประวัติของการจัดทำ decision pack ครั้งแรกและคงไว้ตามเดิม.

สถานะ Phase 17F ที่ใช้ในเอกสารนี้:

- 17F.1 IMPLEMENTED / CLOSED; 17F.2 และ 17F.3 IMPLEMENTED ตามขอบเขตที่อนุมัติไว้
- 17F.4A automated/security/PostgreSQL re-audit PASS
- P17F-L04 OPEN — real-device/browser UAT ยัง deferred เพราะทรัพยากรไม่พร้อม การตรวจอัตโนมัติไม่ใช่ UAT และไม่ปิด L04
- P17F-L05 OPEN / FUTURE; Q5 real Patient delegated-data use ยังคง GOVERNANCE BLOCKED
- สถานะเหล่านี้ไม่ขัดขวาง requirement analysis ของ 17G และเอกสารนี้ไม่เปลี่ยนสถานะใด

สถานะ medication หลังเอกสารนี้:

- 17G.0 เสร็จในฐานะ decision pack เท่านั้น
- Q30–Q53 ยัง OPEN และไม่มีข้อใดเป็น OWNER APPROVED
- MED-01 ยัง REQUIREMENT-GATED จนกว่าจะมี owner decision ที่ชัดเจน
- 17G.1 NOT CLEARED FOR IMPLEMENTATION
- MED-02 ยังคง REQUIREMENT-GATED และแยกจาก MED-01

## 2. วิธีอ่านหลักฐาน

- **หลักฐาน runtime ปัจจุบัน** — route, module, model, policy หรือ test ที่พบใน rewrite ณ HEAD จริง
- **ความตั้งใจผลิตภัณฑ์ที่เอกสารบันทึก** — customer-flow/navigation intent ที่ยังไม่ใช่ domain contract
- **หลักฐาน legacy** — คำศัพท์หรือ behavior ใน repository เดิม ใช้ประกอบความเข้าใจเท่านั้น
- **RECOMMENDATION — NOT OWNER APPROVED** — ข้อเสนอเพื่อช่วยตัดสินใจ ไม่ใช่ข้ออนุมัติหรือ requirement
- **OPEN / REQUIREMENT-GATED** — ต้องได้คำตัดสินก่อนนำไป implementation

การไม่พบ implementation เป็นผลจากการตรวจ route/module/schema และการค้นคำที่ระบุในเอกสารนี้ ณ revision ที่ระบุ ไม่ได้พิสูจน์ว่าไม่มีการใช้งานนอก repository

## 3. หลักฐานใน rewrite ปัจจุบัน

ตรวจ HEAD 80839fa640beda1db955d098fc84a0bc34605ecd:

1. [Phase 17A customer-flow contract](./PHASE_17A_CUSTOMER_FLOW_CANONICALIZATION_UAT_CONTRACT.md) ระบุ MED-01 เป็น Personal medication list/schedule/reminders และ MED-02 เป็น prescription หรือ Hospital-managed medication ทั้งคู่ยัง REQUIREMENT-GATED
2. Phase 17A ระบุว่าไม่มี medication route/module/model/policy ใน app/app, src/modules และ prisma/schema.prisma; ยังเปิดคำถาม name, dose, unit, timing, creator/editor, active/discontinued, authority และ correction/history
3. [Phase 17 UAT backlog](./PHASE_17_UAT_BACKLOG.md) คง MED-01/MED-02 เป็น REQUIREMENT-GATED; NOTIF-01 ต้องรอ event source และ preference/consent contract
4. ค้น source ที่เกี่ยวกับ medication พบเฉพาะ Goal Plan template เก่าและ test ของ template ไม่พบ medication management module, route, medication/prescription model, policy หรือ workflow ใน runtime
5. Current Personal workspace มีเส้นทางใต้ /app/personal เช่น profile, care, appointments และ services; นี่เป็นหลักฐาน route context เท่านั้น ไม่ได้อนุมัติปลายทางยา
6. [Phase 17B own-scope foundation](./PHASE_17B_PATIENT_WORKSPACE_OWN_SCOPE_FOUNDATION.md) ระบุ authenticated User → Person → PatientProfile และ SELF scope แยกจาก Hospital/OSM; self-read policy ปัจจุบันไม่ใช่สิทธิ์เขียน medication
7. [Goal Plan template ปัจจุบัน](../../src/modules/goals/domain/goal-templates/legacy-prototype-v1.ts) มี primary goal code medication และ label “ลดการใช้ยา” ใน Goal Plan เท่านั้น ไม่มีรายการยา ขนาดยา ตารางเวลา หรือ medication-administration history

คำว่า medication ใน Goal Plan ปัจจุบันจึงไม่ใช่ medication-management feature และ self-read policy ปัจจุบันไม่ควรถูกขยายเป็น medication mutation โดยปริยาย

## 4. หลักฐานจาก legacy repository

ตรวจ [raviut-max/demi-plus-web-v2](https://github.com/raviut-max/demi-plus-web-v2) ที่ legacy HEAD 7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e โดยค้น medication, medicine, drug, ชื่อยา, ขนาดยา, เวลารับประทาน, รับประทานยา, prescription, dispense, adherence และ reminder

พบสองตำแหน่ง ทั้งคู่เป็น Goal Plan choices:

- [app/admin/goals/page.tsx](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/app/admin/goals/page.tsx) มี code medication, label “ลดยาได้ (Medication De-escalation)” และข้อความ “ปรับลดหรือหยุดยาภายใต้การกำกับของแพทย์”
- [app/admin/patients/[id]/goals/setup/page.tsx](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/app/admin/patients/%5Bid%5D/goals/setup/page.tsx) มี Goal Plan choice เดียวกัน

ไม่พบ substantive medication-management implementation จากการค้นนี้ ได้แก่ inventory/list, prescription record, dose schedule, reminder, dispensing, administration, adherence log, reconciliation, prescriber authority หรือ drug catalog

ขอบเขตข้อสรุปจำกัดที่ source ของ legacy revision นี้ Goal Plan objective เรื่องลด/หยุดยาภายใต้การกำกับแพทย์เป็น semantics ของเป้าหมายระยะยาวเท่านั้น ไม่ใช่หลักฐานว่า legacy จัดการยา หรือเป็นคำแนะนำให้ Patient หยุดยาเอง

## 5. Customer-flow evidence และข้อจำกัด

- [Phase 17F.0 Family contract](./PHASE_17F0_FAMILY_CAREGIVER_DELEGATED_ACCESS_CONTRACT.md) บันทึกว่า whiteboard flow ที่ส่งให้โครงการมี navigation ไปยัง health/care information, health plan, appointments และ medication; Phase 17F เองคง medication ไว้นอก Family scope และไม่มี caregiver medication grant
- [Phase 17A](./PHASE_17A_CUSTOMER_FLOW_CANONICALIZATION_UAT_CONTRACT.md) บันทึก medication เป็น future extension และแนะนำให้เริ่ม 17G ด้วย personal list/schedule/reminders เฉพาะส่วนที่ลูกค้ายืนยัน โดย prescription/Hospital-managed behavior เป็นอีก decision
- หลักฐานนี้รองรับ product surface/ปลายทางที่คาดหวังและการเปิด MED-01/MED-02 เท่านั้น
- ไม่ได้กำหนด record owner, ผู้บันทึก field จริง, dose/schedule/adherence semantics, clinical verification, caregiver access, Hospital visibility หรือ prescribing authority
- เอกสารเดิมระบุว่าไม่มีภาพ whiteboard แยกใน repository; อ้างได้เฉพาะ flow summary ที่บันทึกไว้

**Navigation intent ≠ medication domain contract.** ห้ามเติมความหมายที่หายไปจากชื่อเมนู “ยา”

## 6. MED-01 กับ MED-02

| มิติ | MED-01 — Personal medication | MED-02 — Clinical / Hospital medication |
| --- | --- | --- |
| ความหมายที่พิจารณา | รายการส่วนตัวที่ Patient ดูแลเพื่อช่วยจำและดูข้อมูลที่ตนบันทึก | Reconciliation, physician prescription/order, dispensing, clinician-managed plan หรือ external prescription |
| Authority | Patient SELF เป็นผู้บันทึกข้อมูลส่วนตัว; ไม่ใช่ clinical source of truth | ต้องตัดสิน owner, clinician/prescriber authority, provenance และ source of truth แยก |
| ขอบเขตที่อาจมี | ชื่อยา dose/instruction และ schedule เฉพาะที่ owner อนุมัติ | Clinical order, reconciliation, pharmacy workflow หรือ integration ตาม contract แยก |
| ห้ามอนุมาน | ไม่ได้แปลว่าแพทย์/Hospital สั่งยา ตรวจสอบ หรือรับรอง | ไม่เกิดจาก personal note หรือเพียงมี Hospital relationship |
| สถานะ | REQUIREMENT-GATED จน owner ตัดสิน Q30–Q53 | REQUIREMENT-GATED; ห้ามทำ partial e-prescribing |

ห้ามรวมสอง domain เป็น record เดียวที่เปลี่ยน authority ตาม actor หรือ Hospital context โดยไม่มี contract ใหม่

## 7. Owner decision checklist: Q30–Q53

ทุกรายการยัง OPEN; recommendation ทุกข้อด้านล่างคือ **RECOMMENDATION — NOT OWNER APPROVED** เจ้าของผลิตภัณฑ์ต้องยืนยันหรือเลือกทางอื่นก่อนเริ่ม 17G.1

| ID | Evidence และ options | RECOMMENDATION — NOT OWNER APPROVED | Consequence / สิ่งที่ต้องยืนยัน |
| --- | --- | --- | --- |
| Q30 — Medication semantic | MED-01 คือ personal list; MED-02 เป็น clinical gate. A Patient-maintained item; B clinically authoritative medication/prescription; C รวม semantics ใน record เดียว; D อื่น | **RECOMMENDATION — NOT OWNER APPROVED:** A — Patient-maintained personal medication item สำหรับ MED-01/17G.1 | เป็นข้อมูลส่วนตัวที่ผู้ใช้ป้อน ไม่ใช่ prescription, clinically reconciled list, Hospital-verified, physician-approved หรือ clinical source of truth; MED-02 แยกต่างหาก |
| Q31 — Creator authority | ยังไม่มี medication writer policy. A Patient SELF; B Patient + Hospital; C Patient + assigned OSM; D ทั้งสาม; E อื่น | **RECOMMENDATION — NOT OWNER APPROVED:** A — Patient SELF only | HOSPITAL, OSM, ADMIN, Family relationship และ appointment-sharing grant ไม่มี create/update/stop authority; multi-role Patient ใช้ exact SELF เท่านั้น |
| Q32 — Read authority | Family grant ปัจจุบันเป็น appointment-only. A SELF; B + Hospital; C + OSM; D + caregiver; E mixed matrix | **RECOMMENDATION — NOT OWNER APPROVED:** A — Patient SELF only | Hospital, OSM, Family caregiver, Platform ADMIN routine workflow และ appointment-sharing caregiver อ่านไม่ได้; ไม่มี role fallback |
| Q33 — Medication name/source | ไม่มี name field/catalog. A free text; B local catalog; C external catalog; D free text + future mapping | **RECOMMENDATION — NOT OWNER APPROVED:** bounded free-text medication name; future catalog mapping deferred | รองรับ Unicode/Thai; trim ขอบและยุบ whitespace ซ้ำที่ชัดเจน; คง case/script; ไม่ใช้ lowercase/transliteration เป็น identity; duplicates allowed; ชื่อเป็นข้อความแสดงผล ไม่ใช่ identity key. ความยาวสูงสุดเป็น implementation validation limit ที่เลือกใน 17G.1 design; ไม่มี TMT/RxNorm/ATC/formulary ID |
| Q34 — Dose/instruction representation | ไม่มี dose semantics. A one free-text instruction; B amount + unit; C amount/unit + optional instruction; D full prescribing SIG | **RECOMMENDATION — NOT OWNER APPROVED:** A — optional bounded free-text instruction field ใน 17G.1 | ตัวอย่าง “ครั้งละ 1 เม็ด หลังอาหารเช้า” เป็นข้อความบรรยายที่ Patient ป้อนเท่านั้น; ไม่มี doseAmount, doseUnit, strength, dosage form, route, SIG structure หรือ PRN ontology. ลด false clinical precision เพราะหลักฐานแยก amount/count/form/strength/route ไม่ได้ |
| Q35 — Dose-unit strategy | ไม่มี approved terminology. A free text; B fixed enum; C controlled common set + OTHER; D external terminology | **RECOMMENDATION — NOT OWNER APPROVED:** DEFERRED / NOT APPLICABLE TO 17G.1 — ไม่มี structured dose unit | ไม่สร้าง enum, controlled list, OTHER หรือ external terminology; หากอนาคตเพิ่ม structured dose ให้เปิด Q34/Q35 พร้อมกัน |
| Q36 — Schedule model | customer flow เอ่ย schedule/reminder แต่ไม่ระบุ recurrence. A text only; B one/more daily local times; C weekdays; D calendar/interval engine; E prescription-grade | **RECOMMENDATION — NOT OWNER APPROVED:** B — 0..N daily local clock times สำหรับ 17G.2 เท่านั้น; ไม่มี schedule persistence ใน 17G.1 | ตัวอย่าง 08:00 และ 20:00; ไม่รวม every N hours, alternate days, weekdays, date exceptions, tapering, cycles, prescription recurrence หรือ cron/RRULE product semantics |
| Q37 — Timezone | หลาย current UI/input/display flows ใช้ Asia/Bangkok เช่น [Patient SELF presentation](../../app/app/personal/patient-self-care-presentation.tsx) และ [appointment form](../../app/app/patients/%5BrelationshipId%5D/appointments/new/appointment-form.tsx); ไม่พบหลักฐาน global configurable timezone หรือ Patient timezone preference | **RECOMMENDATION — NOT OWNER APPROVED:** สำหรับ 17G.2 ให้ตีความ daily schedule เป็น local time-of-day ใน Asia/Bangkok ตาม bounded DEMI/UAT convention ปัจจุบัน | นี่ไม่ใช่ global configurable application timezone, Patient-specific preference หรือ future multi-timezone policy; ไม่เก็บ daily recurrence เป็น UTC instant เพียงเพื่อให้เข้ากับ timestamp patterns; timezone หลายพื้นที่เป็น requirement งานอนาคต |
| Q38 — Meal/timing instruction | ไม่มี semantics ก่อน/หลัง/พร้อมอาหาร, bedtime หรือ PRN. A no structured ontology; B small enum; C full ontology | **RECOMMENDATION — NOT OWNER APPROVED:** A — ไม่มี structured meal/timing ontology; ใช้ Q34 free-text instruction เท่านั้น | ไม่สร้าง BEFORE_MEAL, AFTER_MEAL, WITH_MEAL, BEDTIME หรือ PRN enum ใน 17G.1; ข้อความเป็นคำบรรยายที่ผู้ใช้ป้อน ไม่ใช่ระบบแนะนำ |
| Q39 — Lifecycle | MED-01 ถาม active/discontinued แต่ยังไม่ตัดสิน. A ACTIVE/STOPPED; B + PAUSED; C start/end; D prescription lifecycle | **RECOMMENDATION — NOT OWNER APPROVED:** A — ACTIVE / STOPPED; STOPPED เป็น terminal | ACTIVE คือ Patient ติดตามเป็นรายการปัจจุบัน; STOPPED คือ Patient ไม่ติดตามเป็นปัจจุบัน ไม่ใช่ clinician discontinuation. ไม่มี STOPPED→ACTIVE, PAUSED, restart หรือ reopen; การติดตามอีกครั้งสร้าง item/lifecycle ใหม่ |
| Q40 — Delete/history | ยังไม่มี retention/legal classification. A hard delete; B soft archive; C terminal STOPPED; D immutable revisions | **RECOMMENDATION — NOT OWNER APPROVED:** C — ใช้ terminal STOPPED ใน normal user workflow; ไม่มี routine hard-delete UI | การนำออกจาก current list คือ ACTIVE→STOPPED. Privacy/legal deletion, administrative correction และ accidental-record purge เป็น governance/operations requirement แยก; ไม่อ้าง legal/clinical retention |
| Q41 — Edit/correction | Phase 17A เปิด correction/history; Context เปิด broader clinical immutable/auditable history. A in-place; B versioned; C immutable replace; D mixed | **RECOMMENDATION — NOT OWNER APPROVED:** mutable current-value correction ขณะ ACTIVE พร้อม updatedAt และ Q52 mutation audit; ไม่มี user-visible immutable revision history ใน 17G.1 | Patient แก้ name/instruction ของ own ACTIVE item ได้; STOPPED แก้ไม่ได้ผ่าน workflow ปกติ; ไม่มี revision browser หรือ reason-for-correction requirement; ไม่อ้าง clinical immutable record |
| Q42 — Provenance | first source ที่เสนอคือ Patient SELF. A implicit; B enum PATIENT_SELF; C free text; D clinician/import | **RECOMMENDATION — NOT OWNER APPROVED:** A — source implicit จาก authenticated Patient SELF | ไม่เพิ่ม enum ค่าเดียว; derive creator จาก server actor/audit convention; ไม่เชื่อ client createdBy/source/Patient owner ID; หลาย source ในอนาคตต้องมี decision ใหม่ |
| Q43 — Duplicates | ชื่อเดียวอาจมี dose/instruction ต่างกันหรือ active + stopped. A allow; B unique by name; C warning; D compound key | **RECOMMENDATION — NOT OWNER APPROVED:** A — duplicates allowed | ไม่มี uniqueness จาก normalized name หรือ name+instruction; ไม่มี auto-merge/replacement; duplicate warning เป็น future UX เท่านั้น |
| Q44 — Adherence | ไม่มี adherence events; schedule/reminder คนละ concept. A none in 17G.1; B log now; C later 17G.3 | **RECOMMENDATION — NOT OWNER APPROVED:** C — defer adherence semantics ไป decision อนาคตของ 17G.3; ไม่มี events ใน 17G.1/17G.2 | ไม่มี taken/missed/skipped/delayed/percentage/compliance score; ห้ามอนุมาน adherence จาก notification delivery/opening |
| Q45 — Reminder boundary | Phase 17A ให้ source หลัง 17G contract และ 17J เป็น Notifications. A 17G delivery; B 17G source / 17J delivery; C none | **RECOMMENDATION — NOT OWNER APPROVED:** B — 17G เป็นเจ้าของ approved schedule/reminder source; 17J เป็นเจ้าของ delivery | 17G.1 ไม่มี source; 17G.2 กำหนด schedule; 17G.3 กำหนด reminder occurrence source ตาม semantics ที่อนุมัติแยก. 17G ไม่ส่ง LINE/push/email/SMS; 17J กำหนด recipient/channel/preferences/consent/quiet time/retry/delivery state |
| Q46 — Family/caregiver | 17F grant ปัจจุบัน appointment-only; Q5 real-data ยัง governance-blocked. A automatic; B never; C future explicit grant; D other | **RECOMMENDATION — NOT OWNER APPROVED:** C — ต้องมี future medication-specific sharing grant; 17G.1 Family DENY | family-delegation-v1 และ family-appointment-read-v1 ให้ medication access = ZERO; ไม่ขยาย 17F |
| Q47 — Hospital/OSM | ไม่มี medication ownership ใน care models. A none in MED-01; B read-only; C write; D separate clinical domain | **RECOMMENDATION — NOT OWNER APPROVED:** A — ไม่มี Hospital/OSM access ต่อ MED-01 | Hospital MEMBER/OWNER, assigned OSM และ Platform ADMIN routine use เป็น DENY; provider visibility ต้องมี MED-02 หรือ contract แยก |
| Q48 — MED-02 boundary | MED-02 REQUIREMENT NEEDED; ไม่มี prescription workflow. Candidate semantics: prescription/order/reconciliation/prescriber/dispensing/pharmacy/verification/import | **RECOMMENDATION — NOT OWNER APPROVED:** exclude ALL MED-02 semantics from 17G.1 | ไม่รวม prescription/order, reconciliation, prescriber, clinician verification, pharmacy, dispensing, administration, external prescription import หรือ Hospital-owned list; MED-02 REQUIREMENT-GATED |
| Q49 — Goal Plan relation | Current/legacy มี goal objective เกี่ยวกับยา; ไม่มี cross-domain sync. A automatic; B independent; C future projection | **RECOMMENDATION — NOT OWNER APPROVED:** B — Medication และ Goal Plan เป็นอิสระต่อกัน | ไม่มี automatic sync; STOPPED ไม่ได้แปลว่า Medication De-escalation goal สำเร็จ |
| Q50 — Route/UX | Personal routes อยู่ใต้ /app/personal; flow ระบุ medication navigation. Proposed /app/personal/medications | **RECOMMENDATION — NOT OWNER APPROVED:** Patient Personal context; proposed route /app/personal/medications; proposed label “ยาของฉัน” | Navigation เป็นตำแหน่ง UX ไม่ใช่ authority; exact SELF server policy ยังคงเป็นขอบเขตสิทธิ์ |
| Q51 — Model shape | หนึ่ง item อาจมีหลายเวลา; schedule lifecycle แยกได้. A all-in-one; B PersonalMedication 1→N MedicationSchedule; C generic clinical framework | **RECOMMENDATION — NOT OWNER APPROVED:** 17G.1 ใช้แนวคิด PersonalMedication เท่านั้น; future 17G.2 ใช้แนวคิด PersonalMedication 1→N MedicationSchedule | ไม่มี schedule persistence/columns ใน 17G.1; ชื่อเป็นแนวคิด ไม่ใช่ Prisma/schema decision |
| Q52 — Audit | 17F ใช้ transactional lifecycle audit ไม่ audit ทุก read; ไม่ใช่ mandate ให้ medication. A none; B mutation/lifecycle; C reads; D immutable clinical audit | **RECOMMENDATION — NOT OWNER APPROVED:** B — AuditEvent เฉพาะ create/update/stop | ไม่มี per-read audit; metadata ขั้นต่ำและไม่ใส่ medication name, instruction/dose text หรือ Patient PII ใน 17G.1; เป็น operational/security evidence ไม่ใช่ immutable clinical history |
| Q53 — Export/sharing | ไม่มี export/share requirement ใน MED-01/17F medication scope. A include; B PDF/CSV/print; C link/QR; D defer | **RECOMMENDATION — NOT OWNER APPROVED:** D — defer all export/sharing | ไม่มี PDF/CSV/print/public link/QR/external API sharing ใน 17G.1; การเปิดเผยภายหน้าต้องกำหนด recipient/purpose/fields/access/revocation แยก |

### 7.1 Dose, name, unit และ schedule notes

- ชื่อยารองรับ Unicode/Thai; trim whitespace รอบข้อความและยุบ whitespace ซ้ำที่ชัดเจน; คง case/script; ไม่ใช้ lowercase/transliteration เป็น identity. การกำหนดความยาวสูงสุดเป็น implementation validation limit ที่เลือกใน 17G.1 design ไม่ใช่ medical/product semantics
- Q34 ใช้ optional free-text instruction เท่านั้นใน 17G.1. คำว่า “ครั้งละ 1 เม็ด หลังอาหารเช้า” เป็นคำบรรยายที่ผู้ใช้ป้อน ไม่ใช่ structured dose หรือคำแนะนำจากระบบ
- ไม่แยก strength, administered amount, count, form, route หรือ SIG; “ครึ่งเม็ด”, topical/inhaled และ PRN ยิ่งแสดงว่าหลักฐานไม่พอสำหรับ structured semantics
- Q35 ไม่มี structured unit ใน 17G.1; ไม่กำหนด enum หรือ terminology
- Q36 เป็น 0..N local daily times ในอนาคตของ 17G.2 เท่านั้น; ไม่มี schedule persistence ใน 17G.1 และไม่ใช่ interval/prescription schedule

## 8. Record scope และ data minimization

### 8.1 Record scope

**RECOMMENDATION — NOT OWNER APPROVED:** MED-01 เป็น Patient/Profile-level personal record ผูกกับ PatientProfile ไม่ใช่ Hospital-owned PHR และไม่ผูกกับ PatientHospitalRelationship

เหตุผล: personal list อาจครอบคลุมหลาย provider; Hospital scope จะสร้าง ownership/visibility ที่ไม่มีหลักฐาน แต่ต้องให้ owner อนุมัติก่อน schema design

### 8.2 RECOMMENDATION — NOT OWNER APPROVED: ข้อมูลขั้นต่ำ candidate

| หมวด | Candidate | ขอบเขต |
| --- | --- | --- |
| Patient link | exact PatientProfile จาก authenticated User → Person → PatientProfile | client เลือก owner ID ไม่ได้ |
| ชื่อยา | bounded free text หลัง Q33 | ไม่มี drug code/catalog |
| Instruction | optional bounded free-text instruction ตาม recommendation Q34 | descriptive user-entered text เท่านั้น; length limit เป็น implementation validation ที่กำหนดใน 17G.1 design |
| Schedule | ไม่มี schedule ใน 17G.1; 0..N local daily times เป็น recommendation สำหรับ 17G.2 | ไม่สร้าง complex recurrence |
| Lifecycle | ACTIVE/STOPPED โดย STOPPED terminal | ไม่ใช่ prescription order/discontinuation |
| Evidence | updatedAt และ create/update/stop AuditEvent ตาม Q41/Q52 recommendations | audit เป็น operational/security evidence ไม่ใช่ immutable clinical history |

### 8.3 RECOMMENDATION — NOT OWNER APPROVED: ข้อมูลที่ไม่ควรเพิ่มโดยปริยาย

**RECOMMENDATION — NOT OWNER APPROVED:** ไม่ควรเก็บ/สร้างโดยปริยาย: diagnosis, allergy, drug interaction, prescriber, verification, prescription/order, Hospital, HN, National ID, pharmacy, clinical note, refill/quantity, adherence score, dose recommendation หรือ caregiver/Hospital/OSM recipient list. ไม่ใช้ PatientHospitalRelationship ID เป็น owner

นี่เป็น data-minimization proposal ไม่ใช่ schema contract หรือการจัดประเภทตามกฎหมาย

## 9. Authorization matrix

**RECOMMENDATION — NOT OWNER APPROVED:** Patient SELF เท่านั้น; derive profile scope จาก server identity และตรวจ resource ownership ซ้ำที่ query/service boundary

| Actor / context | Proposed result | Boundary |
| --- | --- | --- |
| Patient SELF, own PatientProfile | ALLOW เฉพาะ capability ที่อนุมัติ | authenticated User → Person → PatientProfile; route ไม่รับ owner ID จาก client |
| Patient A → Patient B | DENY | ตรวจ resource/profile ownership ต่อ request |
| OSM | DENY | assignment ไม่ grant medication access |
| Hospital MEMBER | DENY | Hospital membership/direct relationship ไม่ grant MED-01 |
| Hospital OWNER | DENY | Hospital governance ไม่ใช่ personal-medication authority |
| Platform ADMIN | DENY routine access | ไม่มี ADMIN fallback; break-glass หากต้องการเป็น policy แยก |
| Family caregiver | DENY | relationship ไม่ใช่ resource grant |
| Caregiver with family-appointment-read-v1 | DENY medication | capability ปัจจุบัน appointment-only |
| Patient + HOSPITAL/OSM | ALLOW own SELF only | PATIENT + exact identity; work role ไม่ขยาย scope |
| Multi-role caregiver + Patient | อนุญาต own PatientProfile เท่านั้น | caregiver relation ห้ามใช้เข้าถึง target profile |

Patient SELF read policy ปัจจุบันไม่ให้ mutation authority; ห้ามใช้สร้าง/update/stop โดยไม่มี policy decision ใหม่. Server derive current Patient SELF; client เลือก Patient owner ไม่ได้. Resource ID เป็น locator ไม่ใช่ authority; hidden navigation, role switch และ direct URL ไม่ขยายสิทธิ์. ทุก request ต้อง auth และตรวจ exact SELF ที่ server; denial ไม่ควรเปิดเผยว่ามี record ของผู้อื่นหรือไม่ ตาม response convention ที่อนุมัติ

## 10. Security / privacy threat review

ตารางนี้เป็น threat model สำหรับข้อเสนอ ไม่ใช่หลักฐานว่า controls ถูก implement แล้ว

| Threat | Proposed invariant | Likely implementation boundary | Remaining decision |
| --- | --- | --- | --- |
| Patient A อ่าน/แก้ Patient B | exact SELF ทุก read/mutation | actor resolver, policy, owner-scoped query, service transaction | denial/error semantics |
| Hospital staff เดา ID | Hospital role ไม่มี MED-01 authority | route/service policy และ query | response เมื่อ deny |
| OSM เดา ID/มี assignment | assignment ไม่ grant medication | policy แยกจาก assigned-patient queries | ยืนยัน deny ทุกสถานะ |
| Caregiver มี ACTIVE Family relationship | relationship ไม่ให้ medication | Family allowlist และ policy แยก | future grant ต้อง version/accept ใหม่ |
| Caregiver มี appointment grant | family-appointment-read-v1 อ่านยาไม่ได้ | capability projection ห้ามขยาย fields | Q5 แยกจาก future med-sharing gate |
| Caregiver เป็น multi-role | work role ไม่เปลี่ยน owner | ActorContext + exact PatientProfile | own Patient access ได้เฉพาะ SELF |
| STOPPED ถูกเปิดกลับ | STOPPED terminal; normal workflow ไม่มี STOPPED→ACTIVE; track อีกครั้งสร้าง item/lifecycle ใหม่ | lifecycle service/conditional update/audit | owner approval of Q39–Q41 |
| Edited history หาย | correction ปรับ current value เฉพาะ ACTIVE; ไม่อ้าง immutable clinical history | server validation, updatedAt, Q52 mutation audit | historical revision browser อยู่นอก 17G.1 |
| Duplicate ถูก merge/block | ห้าม unique by normalized name และ auto-merge | schema constraint/UI | warning UX |
| Stale schedule หลังแก้/stop | due source อิง current schedule state | transaction/version และ source revalidation | concurrency/dedupe |
| Reminder หลัง STOPPED | stopped schedule งด occurrence; delivery ตรวจ current eligibility | 17G.3 source + 17J delivery | cutoff/cancel/in-flight semantics |
| Direct URL/deep link | ทุก request ตรวจ SELF ใหม่ | route/service server policy | safe denial |
| Browser cache หลัง logout/account switch | ห้าม reuse ข้าม actor | response/cache policy, client state clearing | no-store vs user-scoped cache |
| Audit data exposure | AuditEvent metadata ขั้นต่ำและไม่มี per-read audit | AuditEvent transaction/access boundary | operational retention/deletion policy |

## 11. Safety wording, Goal Plan และ reminder boundary

### Personal wording

Future UI ต้องไม่สื่อว่า DEMI สั่งยา, แพทย์/Hospital ตรวจหรือ reconcile แล้ว, ข้อมูลถูกต้อง/ปลอดภัยสำหรับเปลี่ยนยา, หรือระบบแนะนำ dose/timing/treatment. Final legal disclaimer ยังต้องมี product/legal requirement แยก

### Goal Plan separation

**RECOMMENDATION — NOT OWNER APPROVED:** Medication domain เป็นอิสระจาก Goal Plan ใน first slice

Legacy “Medication De-escalation” เป็นเป้าหมายระยะยาวภายใต้การกำกับแพทย์ ไม่ใช่ prescription/adherence/lifecycle event. การตั้ง STOPPED ไม่ทำให้ Goal Plan สำเร็จ; ห้าม sync สถานะอัตโนมัติ

### Schedule source กับ notification delivery

**RECOMMENDATION — NOT OWNER APPROVED:**

~~~text
MedicationSchedule (แนวคิดสำหรับ 17G.2 ตาม Q36–Q37 recommendation)
        ↓
17G.3 approved due/reminder event source
        ↓
Phase 17J notification policy and delivery
        ↓
recipient / timing / preference / channel / retry
~~~

17G ไม่ส่ง LINE/email/SMS/push และไม่เป็นเจ้าของ retry. Missed reminder ไม่ใช่ clinical non-adherence/noncompliance/treatment failure และห้าม alert Hospital/OSM/caregiver โดยปริยาย

## 12. First-implementation non-goals

**RECOMMENDATION — NOT OWNER APPROVED:** 17G.1 ไม่รวม e-prescribing, clinician order entry, pharmacy/dispensing/administration, reconciliation, drug interaction/allergy checks, drug catalog/external terminology (เช่น TMT/RxNorm/ATC/formulary ID), Hospital/OSM write/read, caregiver access, prescription import, reminder delivery channels, adherence scoring/escalation, dose/treatment advice, Goal Plan sync, PDF/CSV/print, external share link หรือ QR sharing. แต่ละเรื่องอาจกลับมาเป็น requirement แยก

## 13. Route / UX recommendation

**RECOMMENDATION — NOT OWNER APPROVED.**

อิง route ใต้ app/app/personal และ design system ปัจจุบัน:

- proposed route: /app/personal/medications; proposed label: “ยาของฉัน”
- อยู่ใน Patient Personal context ไม่ใช่ Hospital Work
- ใช้ responsive Personal shell; nav visibility เป็น presentation ไม่ใช่ authorization
- สื่อ ownership/provenance ตรงไปตรงมา; ACTIVE/STOPPED มี label ไม่พึ่งสีอย่างเดียว
- กำหนด empty/loading/validation error/save success/stale-denied/stopped states ก่อน UAT
- mobile-first form, label ชัด, keyboard/focus รองรับ, action สำคัญไม่ถูกซ่อน
- หลีกเลี่ยง copy/visuals ที่สื่อ prescription, diagnosis หรือ clinical advice

เป็นเพียง UX direction; ยังไม่มี UI ที่อนุมัติหรือ implement

## 14. Proposed phase breakdown

ทั้งหมดเป็น **RECOMMENDATION — NOT OWNER APPROVED**:

| Phase | ขอบเขตเสนอ | Gate / สถานะ |
| --- | --- | --- |
| 17G.0 | decision pack นี้ | COMPLETE ในฐานะ analysis เท่านั้น |
| 17G.1 | Personal Medication Foundation: name, optional user-entered instruction, ACTIVE/STOPPED terminal lifecycle, edit ACTIVE, exact SELF auth, Personal UI | เริ่มได้เมื่อ owner อนุมัติ Q30–Q53 และ implementation contract; ปัจจุบัน NOT CLEARED |
| 17G.2 | Daily schedule 0..N local times ตาม Q36–Q37; ไม่มี complex recurrence | หลัง owner อนุมัติ package และ schedule implementation contract |
| 17G.3 | กำหนด reminder occurrence source และตัดสิน adherence semantics แยก; ไม่มี channel delivery | หลัง owner อนุมัติ reminder/adherence requirements; 17J เป็น delivery owner |
| 17G.4A | automated security/DB/privacy re-audit | หลัง runtime slice ที่อนุมัติ |
| Manual/device UAT | UAT อุปกรณ์จริงตาม resource readiness | สามารถ deferred ร่วมกับ Phase 17 manual UAT เมื่อ resource ไม่พร้อม; defer ≠ PASS |

## 15. Implementation impact map (หลัง approval เท่านั้น)

**RECOMMENDATION — NOT OWNER APPROVED:** ชื่อและตำแหน่ง illustrative ไม่ใช่การล็อก architecture:

| Area | Likely impact | Boundary |
| --- | --- | --- |
| Domain module | src/modules/medications/ | แยกจาก Goal Plan และ MED-02 |
| Route | app/app/personal/medications/ | Personal route ตรวจ actor ทุก request |
| Persistence | 17G.1 แนวคิด PersonalMedication; 17G.2 แนวคิด MedicationSchedule 1:N | ไม่มี schema/migration ใน 17G.0 |
| Identity/policy | existing User/Person/PatientProfile และ Patient SELF conventions | self-read policy ไม่ใช่ write grant |
| Audit | AuditEvent create/update/stop ตาม Q52 | ไม่ใช่ clinical immutable history |
| Notifications | 17J consumes approved source | 17G ไม่ส่ง channel/retry |
| Independent domains | PatientAppointment, PatientGoalPlan, Family grants, PatientOsmAssignment, HospitalMembership | ไม่มี inheritance/sync/authorization coupling |

## 16. Database design questions — defer

ยังไม่เลือก schema/type:

- UUID identifiers; FK ไป PatientProfile หรือ Person ภายใต้ identity invariant จริง
- lifecycle representation ที่บังคับ ACTIVE/STOPPED และ STOPPED terminal
- instruction text validation limit; ไม่มี decimal dose/unit schema ใน 17G.1; structured dose semantics เป็น future requirement
- local-time representation และ timezone owner; ไม่เลือก instant โดยไม่จำเป็น
- Medication กับ Schedule แยก table หรือไม่; ordering หลายเวลา/lifecycle
- pagination/order stability
- optimistic concurrency/version field
- partial uniqueness — ข้อเสนอไม่มี uniqueness บนชื่อ; constraint อื่นต้องมาจาก invariant
- FK/CHECK/index หลัง fields ชัด
- minimal audit metadata/retention และ privacy deletion; ไม่มี revision snapshot/user-visible history ใน 17G.1
- transaction boundary ระหว่าง medication lifecycle กับ schedule/event invalidation

ห้ามใช้รายการนี้เป็น authorization ให้สร้าง schema ก่อน Q30–Q53

## 17. ADR assessment

**RECOMMENDATION — NOT OWNER APPROVED:** ไม่เปิด ADR ใหม่สำหรับ bounded MED-01/17G.1 ที่ยึด identity model, Patient SELF authorization, server boundary และ transaction conventions ปัจจุบัน

หาก MED-02 เพิ่ม clinical source-of-truth, external medication master, pharmacy/prescription architecture หรือ interoperability ให้ประเมิน ADR แยกก่อนออกแบบ/implementation

## 18. Source index

- [DEMI Context](../CONTEXT.md)
- [Phase 17A](./PHASE_17A_CUSTOMER_FLOW_CANONICALIZATION_UAT_CONTRACT.md)
- [Phase 17 UAT Backlog](./PHASE_17_UAT_BACKLOG.md)
- [Phase 17F.0](./PHASE_17F0_FAMILY_CAREGIVER_DELEGATED_ACCESS_CONTRACT.md)
- [Phase 17B Patient SELF convention](./PHASE_17B_PATIENT_WORKSPACE_OWN_SCOPE_FOUNDATION.md)
- [Current Goal Plan template](../../src/modules/goals/domain/goal-templates/legacy-prototype-v1.ts)
- [Legacy Goal Plan choice](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/app/admin/goals/page.tsx)
- [Legacy Patient Goal Plan setup](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/app/admin/patients/%5Bid%5D/goals/setup/page.tsx)

## 19. Final status

- **17G.0 DECISION PACK COMPLETE / CORRECTED**
- **Q30–Q53 OPEN / NOT OWNER APPROVED**
- **17G.1 NOT CLEARED FOR IMPLEMENTATION**
- **MED-01 REQUIREMENT-GATED**
- **MED-02 REQUIREMENT-GATED**
- **P17F-L04 OPEN / deferred; no device-UAT PASS inferred**
- **Q5 unchanged: real Patient delegated-data use GOVERNANCE BLOCKED**
- **No runtime, schema, migration, route, capability, reminder delivery, prescription workflow, or medication UI changed**

## 20. Proposed smallest 17G.1 first slice

### PROPOSED / RECOMMENDED — NOT OWNER APPROVED — DO NOT IMPLEMENT YET

~~~text
Patient SELF
  → /app/personal/medications
  → list own PersonalMedication records
  → create: medicationName + optional instructionText
  → view own item
  → edit medicationName + instructionText on own ACTIVE item
  → stop own ACTIVE item
  → STOPPED is terminal; no restart/reactivation
~~~

Patient/Profile-level exact owner; not Hospital/PHR scope; Patient SELF only. No schedule, structured dose/unit, meal enum, adherence, reminders, notification delivery, Family/Hospital/OSM access, prescription/reconciliation/clinician verification/pharmacy, Goal Plan sync, export/sharing, or restart/reactivation. No final Prisma names/types.

นี่เป็น **RECOMMENDATION — NOT OWNER APPROVED**; **DO NOT IMPLEMENT YET**. สถานะ **17G.1 NOT CLEARED FOR IMPLEMENTATION** คงเดิม

## 21. Recommended owner package for approval

### RECOMMENDATION — NOT OWNER APPROVED

ข้อเสนอหนึ่งชุดสำหรับ owner review โดยไม่มี sub-decision ซ่อนอยู่; Q30–Q53 ยังคง OPEN จนกว่า owner จะยืนยันโดยชัดแจ้ง:

- Q30 A — Patient-maintained personal medication item; ไม่ใช่ prescription หรือ clinical source of truth
- Q31 A — Patient SELF only เป็นผู้สร้าง/แก้/หยุด
- Q32 A — Patient SELF only อ่านได้
- Q33 bounded free-text name; normalize whitespace; preserve case/script; duplicates allowed; future catalog mapping deferred
- Q34 A — optional bounded free-text instruction; ไม่มี structured dose ใน 17G.1
- Q35 DEFERRED / NOT APPLICABLE TO 17G.1 — ไม่มี structured dose unit
- Q36 B — 0..N daily local clock times ใน 17G.2; ไม่มี schedule ใน 17G.1
- Q37 — 17G.2 ใช้ Asia/Bangkok local time-of-day ตาม bounded DEMI/UAT convention ปัจจุบัน; ไม่ใช่ global หรือ Patient-specific timezone policy
- Q38 A — ไม่มี structured meal/timing ontology; ใช้ Q34 text เท่านั้น
- Q39 A — ACTIVE/STOPPED; STOPPED terminal; track ใหม่ใช้ item/lifecycle ใหม่
- Q40 C — normal removal คือ ACTIVE→STOPPED; ไม่มี routine hard-delete UI
- Q41 — แก้ current values ได้เฉพาะ own ACTIVE item; updatedAt + Q52 audit; ไม่มี user-visible revisions; STOPPED immutable ใน workflow ปกติ
- Q42 A — provenance implicit จาก authenticated Patient SELF; ไม่มี source enum
- Q43 A — duplicates allowed; no uniqueness, auto-merge or replacement
- Q44 C — defer adherence decision ไป 17G.3; ไม่มี events ใน 17G.1/17G.2
- Q45 B — 17G owns approved schedule/reminder source; 17J owns all notification delivery
- Q46 C — Family access ต้องมี future medication-specific sharing grant; ปัจจุบัน DENY
- Q47 A — MED-01 ไม่มี Hospital/OSM access; Platform ADMIN routine access DENY
- Q48 — exclude ALL MED-02 semantics; MED-02 remains REQUIREMENT-GATED
- Q49 B — Medication independent from Goal Plan; no automatic sync
- Q50 — Patient Personal; proposed route /app/personal/medications; proposed label “ยาของฉัน”
- Q51 — 17G.1 PersonalMedication concept only; future 17G.2 concept PersonalMedication 1→N MedicationSchedule
- Q52 B — AuditEvent for create/update/stop only; minimal metadata; no read audit
- Q53 D — defer all export/sharing

การเห็นชอบชุดนี้ต้องมาจาก owner อย่างชัดแจ้ง; จนกว่าจะมีการยืนยัน **Q30–Q53 OPEN / NOT OWNER APPROVED** และ **17G.1 NOT CLEARED FOR IMPLEMENTATION**.
