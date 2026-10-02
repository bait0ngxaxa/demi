# Phase 17G.0 — Medication Domain Decision Pack

สถานะเอกสาร: **17G.0 DECISION PACK COMPLETE**<br>
สถานะการตัดสินใจ: **Q30–Q53 OPEN / NOT OWNER APPROVED**<br>
สถานะการพัฒนา: **17G.1 NOT CLEARED FOR IMPLEMENTATION**<br>
MED-02: **REQUIREMENT-GATED**

เอกสารนี้เป็น requirement analysis, domain-boundary analysis และ security/privacy review เพื่อให้เจ้าของผลิตภัณฑ์ตัดสินใจ ไม่ใช่ implementation contract และไม่ใช่หลักฐานว่าเจ้าของอนุมัติข้อเสนอใดแล้ว

## 1. จุดเริ่มต้นและสถานะงาน

| รายการ | หลักฐาน / สถานะ |
| --- | --- |
| Repository | bait0ngxaxa/demi |
| Expected baseline | 12c63c933e5a0d7de6e65a24621c123f35f17a49 — fix(phase-17f4a): preserve grant acceptance evidence |
| Actual starting HEAD | 80839fa640beda1db955d098fc84a0bc34605ecd — docs(phase-17f4b): record blocked family device UAT |
| ความสัมพันธ์กับ baseline | HEAD จริงใหม่กว่า baseline ที่คาดหนึ่ง commit และมี baseline เป็น parent โดยตรง ใช้ source ที่ HEAD จริงเป็น authority; ไม่ reset, revert, amend หรือเขียนทับ commit นั้น |
| สถานะก่อนเริ่ม | main อยู่ ahead 1 จาก origin/main; working tree สะอาด |
| ประเภทงาน | เอกสารวิเคราะห์และ decision pack เท่านั้น |

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
| Q30 — Medication semantic | MED-01 personal list, MED-02 clinical gate. A Patient-maintained item; B clinically authoritative medication/prescription; C ทั้งสองใน record เดียว; D อื่น | **RECOMMENDATION — NOT OWNER APPROVED:** A สำหรับ 17G.1 | Patient เป็นผู้ให้ข้อมูล ไม่ใช่ clinical truth; provenance เป็น user-entered; correction ตาม policy; Hospital ไม่เห็นโดยปริยาย; copy ห้ามสื่อว่า DEMI prescribed/verified |
| Q31 — Creator authority | ยังไม่มี medication writer policy. A Patient SELF; B Patient + Hospital; C Patient + assigned OSM; D ทั้งสาม; E อื่น | **RECOMMENDATION — NOT OWNER APPROVED:** A — Patient SELF only | role HOSPITAL, OSM, ADMIN, assignment หรือ family relation ไม่ให้สิทธิ์สร้าง/แก้ |
| Q32 — Read authority | Family grant ปัจจุบันเป็น appointment-only. A SELF; B + Hospital; C + OSM; D + caregiver; E mixed matrix | **RECOMMENDATION — NOT OWNER APPROVED:** A — Patient SELF only | family-delegation-v1 และ family-appointment-read-v1 ไม่ให้ medication access |
| Q33 — Name/source | ไม่มี name field/catalog. A free text; B local catalog; C external catalog; D free text + future mapping | **RECOMMENDATION — NOT OWNER APPROVED:** D โดยเริ่ม bounded free text | ต้องอนุมัติ maximum/normalization; 200 Unicode code points เป็น technical-cap ตัวอย่างเท่านั้น ไม่ใช่ requirement/medical standard; รองรับ Thai/Unicode, trim ขอบ, ไม่บังคับ lowercase/transliteration; ชื่อไม่ใช่ identity |
| Q34 — Dose representation | ไม่มี dose semantics. A free-text instruction; B amount + unit; C amount/unit + optional instruction; D full prescribing SIG | **RECOMMENDATION — NOT OWNER APPROVED:** C candidate เมื่อ owner นิยาม amount/unit; มิฉะนั้น A ใน first slice | ต้องแยก user-entered dose จาก drug strength, route, form, SIG; decimal, “ครึ่งเม็ด”, topical/inhaled และ PRN แสดงข้อจำกัด; หลีกเลี่ยง false clinical precision |
| Q35 — Dose-unit strategy | ไม่มี approved terminology. A free text; B fixed enum; C controlled common set + OTHER; D external terminology | **RECOMMENDATION — NOT OWNER APPROVED:** C + OTHER หาก Q34 อนุมัติ | tablet, capsule, mL, mg, unit, puff, drop เป็นตัวอย่างเท่านั้น ไม่ใช่ approved values; unit อาจหมายถึง mass, volume, count หรือ form |
| Q36 — Schedule model | customer flow เอ่ย schedule/reminder แต่ไม่ระบุ recurrence. A text only; B one/more daily local times; C weekdays; D calendar/interval engine; E prescription-grade | **RECOMMENDATION — NOT OWNER APPROVED:** B สำหรับ schedule slice จำกัด หากลูกค้ายืนยัน | Medication → 0..N local daily times; ไม่รวม alternate days, every N hours, cyclic/taper, date exception หรือ SIG; อยู่ใน 17G.2 ไม่จำเป็นต้องรวม 17G.1 |
| Q37 — Timezone | UAT ใช้ Asia/Bangkok; recurring daily time ไม่ใช่ instant | **RECOMMENDATION — NOT OWNER APPROVED:** local time-of-day ใช้ Patient-facing configured application timezone ซึ่งปัจจุบันเป็น Asia/Bangkok | ไม่แปลงเป็น UTC instant; หาก multi-timezone ต้องตัดสิน current Patient timezone เทียบกับ timezone ที่ schedule ผูกไว้; occurrence generation เป็น 17G.3 |
| Q38 — Meal/timing instruction | ไม่มี semantics ก่อน/หลัง/พร้อมอาหาร, bedtime หรือ PRN. A optional text; B small enum; C full ontology | **RECOMMENDATION — NOT OWNER APPROVED:** A | ลดการสร้าง medical meaning ที่ไม่มีหลักฐาน; instruction text เป็นข้อความผู้ใช้ ไม่ใช่คำแนะนำระบบ |
| Q39 — Lifecycle | MED-01 ถาม active/discontinued แต่ยังไม่ตัดสิน. A ACTIVE/STOPPED; B + PAUSED; C start/end; D prescription lifecycle | **RECOMMENDATION — NOT OWNER APPROVED:** A; STOPPED เป็น terminal ใน candidate v1 | STOPPED คือไม่ติดตามเป็น current และไม่มี reminder ใหม่ ไม่ใช่ clinical discontinuation order; ต้องตัดสิน undo/re-open หรือสร้าง item ใหม่ |
| Q40 — Delete/history | ยังไม่มี retention/legal classification. A hard delete; B soft archive; C terminal STOPPED; D immutable revisions | **RECOMMENDATION — NOT OWNER APPROVED:** C สำหรับ record ที่สร้างแล้ว; no routine hard delete | correction ใช้ Q41; accidental creation และ privacy deletion request ต้องตัดสินแยก; ไม่อ้างกฎหมาย clinical retention |
| Q41 — Edit/correction | Phase 17A เปิด correction/history; Context เปิด broader clinical immutable/auditable history. A in-place; B versioned; C immutable replace; D mixed | **RECOMMENDATION — NOT OWNER APPROVED:** D — Patient แก้ได้, bounded lifecycle evidence, ไม่อ้าง immutable clinical history | updatedAt/lifecycle audit อาจพอ; การแสดงค่าเก่า/reason ต้องตัดสินเพิ่ม; immutable revisions เป็น requirement แยก |
| Q42 — Provenance | first source ที่เสนอคือ Patient SELF. A implicit; B enum PATIENT_SELF; C free text; D clinician/import | **RECOMMENDATION — NOT OWNER APPROVED:** A ใน first slice | derive creator จาก authenticated actor; เพิ่ม source field เมื่อมีหลาย source และ contract; ห้ามเชื่อ client-supplied creator/source |
| Q43 — Duplicates | ชื่อเดียวอาจมี dose/instruction ต่างกันหรือ active + stopped. A allow; B unique by name; C warning; D compound key | **RECOMMENDATION — NOT OWNER APPROVED:** A; ห้าม unique บนชื่อ | duplicates อาจชอบธรรม; ห้าม auto-merge/block; warning เป็น UX decision ภายหลัง |
| Q44 — Adherence | ไม่มี adherence events; schedule/reminder คนละ concept. A none in 17G.1; B log now; C later 17G.3 | **RECOMMENDATION — NOT OWNER APPROVED:** C และไม่มี adherence ใน 17G.1/17G.2 | taken/missed/skipped/delayed/percentage ต้องมี event semantics; ห้ามอนุมาน non-adherence, treatment failure หรือ diagnosis |
| Q45 — Reminder boundary | Phase 17A ให้ source หลัง 17G contract และ 17J เป็น Notifications. A 17G delivery; B 17G source / 17J delivery; C none | **RECOMMENDATION — NOT OWNER APPROVED:** B | 17J ตัดสิน recipient/timing/preference/consent/channel/retry; 17G ห้ามส่ง LINE/email/SMS/push |
| Q46 — Family/caregiver | 17F grant ปัจจุบัน appointment-only; Q5 real-data ยัง governance-blocked. A automatic; B never; C future explicit grant; D other | **RECOMMENDATION — NOT OWNER APPROVED:** C; 17G.1 SELF only | family-delegation-v1 และ family-appointment-read-v1 ให้ medication access = ZERO; ต้องมี grant/version/acceptance ใหม่ |
| Q47 — Hospital/OSM | ไม่มี medication ownership ใน care models. A none in MED-01; B read-only; C write; D separate clinical domain | **RECOMMENDATION — NOT OWNER APPROVED:** A | Hospital MEMBER/OWNER และ assigned OSM ไม่มีสิทธิ์ต่อ personal list; MED-02 ตัดสินแยก |
| Q48 — MED-02 boundary | MED-02 REQUIREMENT NEEDED; ไม่มี prescription workflow. Include prescription/order/reconcile/dispense/prescriber/pharmacy/verification? | **RECOMMENDATION — NOT OWNER APPROVED:** ไม่รวมใน 17G.1 | ห้าม partial e-prescribing หรือเรียก personal item ว่า prescription; clinical owner/provenance/integration เป็น requirement แยก |
| Q49 — Goal Plan relation | Current/legacy มี goal objective เกี่ยวกับยา; ไม่มี cross-domain sync. A automatic; B independent; C future projection | **RECOMMENDATION — NOT OWNER APPROVED:** B | STOPPED ไม่แปลว่า Medication De-escalation goal สำเร็จ; projection ต้องมี explicit semantics |
| Q50 — Route/UX | Personal routes อยู่ใต้ /app/personal; flow ระบุ medication navigation. Candidate /app/personal/medications | **RECOMMENDATION — NOT OWNER APPROVED:** Patient Personal; label candidate “ยาของฉัน” | ใช้ responsive Personal pattern; nav เป็น presentation เท่านั้น; สื่อว่า user-entered และมี empty/loading/error/saved/stopped states |
| Q51 — Model shape | หนึ่ง item อาจมีหลายเวลา; schedule lifecycle อาจแยก. A all-in-one; B PersonalMedication 1→N MedicationSchedule; C generic clinical framework | **RECOMMENDATION — NOT OWNER APPROVED:** B เป็น conceptual candidate ถ้า Q36 อนุมัติหลายเวลา | ห้ามล็อก Prisma names ก่อน Q30–Q50; หาก schedule deferred 17G.1 อาจมีเพียง personal item |
| Q52 — Audit | 17F ใช้ transactional lifecycle audit ไม่ audit ทุก read; ไม่ใช่ mandate ให้ medication. A none; B lifecycle; C reads; D immutable clinical audit | **RECOMMENDATION — NOT OWNER APPROVED:** B สำหรับ create/update/stop หากตรง conventions | application audit ≠ clinical/legal immutable history; จำกัดข้อมูลส่วนตัวใน audit; ไม่อ้าง compliance |
| Q53 — Export/sharing | ไม่มี export/share requirement ใน MED-01/17F medication scope. A include; B PDF/CSV/print; C link/QR; D defer | **RECOMMENDATION — NOT OWNER APPROVED:** D — defer ทั้งหมด | ต้องมี field/recipient/purpose/access/revocation/audit/privacy contract ก่อนเปิดเผยนอก SELF |

### 7.1 Dose, name, unit และ schedule notes

- ชื่อยาควรรองรับ Unicode/Thai โดยไม่บังคับ English-only, transliteration หรือ lowercase; ชื่อซ้ำไม่ใช่ identity
- ข้อเสนอ cap 200 Unicode code points เป็น technical-cap ตัวอย่างเท่านั้น ยังไม่มี source กำหนด และไม่ใช่ medical standard
- Structured dose อาจสับสนระหว่าง strength กับจำนวนที่ผู้ใช้รับ; tablet/capsule อาจหมายถึง form หรือ count; mg เป็น mass; “ครึ่งเม็ด”, topical/inhaled และ PRN ต้องการบริบทเพิ่ม
- หาก owner ยืนยัน Q34=C ต้องกำหนด amount/unit/instruction/optionality/validation ก่อน schema; หากยังนิยามไม่ได้ Q34=A มีความเสี่ยง false precision ต่ำกว่า
- ตัวอย่าง unit ใน Q35 เป็นตัวอย่างประกอบการคุยเท่านั้น ไม่มี approved values
- Q36=B หมายถึง local clock times เท่านั้น ไม่ใช่ interval/prescription schedule

## 8. Record scope และ data minimization

### 8.1 Record scope

**RECOMMENDATION — NOT OWNER APPROVED:** MED-01 เป็น Patient/Profile-level personal record ผูกกับ PatientProfile ไม่ใช่ Hospital-owned PHR และไม่ผูกกับ PatientHospitalRelationship

เหตุผล: personal list อาจครอบคลุมหลาย provider; Hospital scope จะสร้าง ownership/visibility ที่ไม่มีหลักฐาน แต่ต้องให้ owner อนุมัติก่อน schema design

### 8.2 RECOMMENDATION — NOT OWNER APPROVED: ข้อมูลขั้นต่ำ candidate

| หมวด | Candidate | ขอบเขต |
| --- | --- | --- |
| Patient link | exact PatientProfile จาก authenticated User → Person → PatientProfile | client เลือก owner ID ไม่ได้ |
| ชื่อยา | bounded free text หลัง Q33 | ไม่มี drug code/catalog |
| Dose/instruction | เฉพาะ representation ที่อนุมัติ Q34–Q35 | ยังไม่ล็อก type/meaning |
| Schedule | local times ใน 17G.2 หาก Q36–Q37 อนุมัติ | ไม่สร้าง complex recurrence |
| Lifecycle | ACTIVE/STOPPED candidate | ไม่ใช่ prescription order |
| Evidence | timestamps/lifecycle audit หาก Q41/Q52 อนุมัติ | ไม่อ้าง immutable clinical history |

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

Patient SELF read policy ปัจจุบันไม่ให้ mutation authority; ห้ามใช้สร้าง/update/stop โดยไม่มี policy decision ใหม่. Hidden navigation, role switch, UUID และ direct URL ไม่ใช่ boundary. ทุก request ต้อง auth และตรวจ exact SELF ที่ server; denial ไม่ควรเปิดเผยว่ามี record ของผู้อื่นหรือไม่ ตาม response convention ที่อนุมัติ

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
| STOPPED ถูกเปิดกลับ | STOPPED ไม่ active/reminder source; re-open ต้องนิยาม | lifecycle service/conditional update/audit | terminal vs undo/re-create Q39–Q41 |
| Edited history หาย | correction ตาม personal policy; ไม่อ้าง immutable clinical history | service validation, updatedAt, optional audit | revisions/retention OPEN |
| Duplicate ถูก merge/block | ห้าม unique by normalized name และ auto-merge | schema constraint/UI | warning UX |
| Stale schedule หลังแก้/stop | due source อิง current schedule state | transaction/version และ source revalidation | concurrency/dedupe |
| Reminder หลัง STOPPED | stopped schedule งด occurrence; delivery ตรวจ current eligibility | 17G.3 source + 17J delivery | cutoff/cancel/in-flight semantics |
| Direct URL/deep link | ทุก request ตรวจ SELF ใหม่ | route/service server policy | safe denial |
| Browser cache หลัง logout/account switch | ห้าม reuse ข้าม actor | response/cache policy, client state clearing | no-store vs user-scoped cache |
| Audit data exposure | audit metadata ขั้นต่ำ; no per-read audit | AuditEvent transaction/access | fields, retention, deletion policy |

## 11. Safety wording, Goal Plan และ reminder boundary

### Personal wording

Future UI ต้องไม่สื่อว่า DEMI สั่งยา, แพทย์/Hospital ตรวจหรือ reconcile แล้ว, ข้อมูลถูกต้อง/ปลอดภัยสำหรับเปลี่ยนยา, หรือระบบแนะนำ dose/timing/treatment. Final legal disclaimer ยังต้องมี product/legal requirement แยก

### Goal Plan separation

**RECOMMENDATION — NOT OWNER APPROVED:** Medication domain เป็นอิสระจาก Goal Plan ใน first slice

Legacy “Medication De-escalation” เป็นเป้าหมายระยะยาวภายใต้การกำกับแพทย์ ไม่ใช่ prescription/adherence/lifecycle event. การตั้ง STOPPED ไม่ทำให้ Goal Plan สำเร็จ; ห้าม sync สถานะอัตโนมัติ

### Schedule source กับ notification delivery

**RECOMMENDATION — NOT OWNER APPROVED:**

~~~text
MedicationSchedule (ถ้า Q36–Q37 อนุมัติ)
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

- route candidate: /app/personal/medications; label candidate: “ยาของฉัน”
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
| 17G.1 | Personal Medication Foundation: persistence, exact SELF auth, create/read/update/stop, Personal UI, PostgreSQL/security verification | ไม่เริ่มจน decisions ที่จำเป็นอนุมัติ; NOT CLEARED |
| 17G.2 | schedule model/lifecycle และ local-time semantics | หลัง Q36–Q38 |
| 17G.3 | approved reminder occurrence source และ/หรือ adherence semantics; no delivery | หลัง requirements; 17J เป็น delivery owner |
| 17G.4A | automated security/DB/privacy re-audit | หลัง runtime slice ที่อนุมัติ |
| Manual/device UAT | UAT อุปกรณ์จริงตาม resource readiness | อาจ deferred ร่วมกับ Phase 17 manual UAT; defer ≠ PASS |

## 15. Implementation impact map (หลัง approval เท่านั้น)

**RECOMMENDATION — NOT OWNER APPROVED:** ชื่อและตำแหน่ง illustrative ไม่ใช่การล็อก architecture:

| Area | Likely impact | Boundary |
| --- | --- | --- |
| Domain module | src/modules/medications/ | แยกจาก Goal Plan และ MED-02 |
| Route | app/app/personal/medications/ | Personal route ตรวจ actor ทุก request |
| Persistence | แนวคิด PersonalMedication; MedicationSchedule ถ้า Q36 อนุมัติ | ไม่มี schema/migration ใน 17G.0 |
| Identity/policy | existing User/Person/PatientProfile และ Patient SELF conventions | self-read policy ไม่ใช่ write grant |
| Audit | AuditEvent lifecycle write ถ้า Q52 อนุมัติ | ไม่ใช่ clinical immutable history |
| Notifications | 17J consumes approved source | 17G ไม่ส่ง channel/retry |
| Independent domains | PatientAppointment, PatientGoalPlan, Family grants, PatientOsmAssignment, HospitalMembership | ไม่มี inheritance/sync/authorization coupling |

## 16. Database design questions — defer

ยังไม่เลือก schema/type:

- UUID identifiers; FK ไป PatientProfile หรือ Person ภายใต้ identity invariant จริง
- lifecycle enum ACTIVE/STOPPED, timestamp หรือทั้งคู่; STOPPED reactivation
- decimal dose precision/range/CHECK หรือ text-only; unit/form/strength semantics
- local-time representation และ timezone owner; ไม่เลือก instant โดยไม่จำเป็น
- Medication กับ Schedule แยก table หรือไม่; ordering หลายเวลา/lifecycle
- pagination/order stability
- optimistic concurrency/version field
- partial uniqueness — ข้อเสนอไม่มี uniqueness บนชื่อ; constraint อื่นต้องมาจาก invariant
- FK/CHECK/index หลัง fields ชัด
- audit fields, revision snapshot, retention และ privacy deletion
- transaction boundary ระหว่าง medication lifecycle กับ schedule/event invalidation

ห้ามใช้รายการนี้เป็น authorization ให้สร้าง schema ก่อน Q30–Q53

## 17. ADR assessment

**RECOMMENDATION — NOT OWNER APPROVED:** ไม่เสนอ ADR ใหม่ใน 17G.0. Personal medication ที่ยึด identity model, Patient SELF authorization, server boundary และ transaction conventions ปัจจุบันโดยตัวมันเองไม่น่าต้อง ADR

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

- **17G.0 DECISION PACK COMPLETE**
- **Q30–Q53 OPEN / NOT OWNER APPROVED**
- **17G.1 NOT CLEARED FOR IMPLEMENTATION**
- **MED-02 REQUIREMENT-GATED**
- **P17F-L04 OPEN / deferred; no device-UAT PASS inferred**
- **Q5 unchanged: real Patient delegated-data use GOVERNANCE BLOCKED**
- **No runtime, schema, migration, route, capability, reminder delivery, prescription workflow, or medication UI changed**

## 20. Proposed smallest 17G.1 first slice

### PROPOSED / RECOMMENDED — NOT OWNER APPROVED — DO NOT IMPLEMENT YET

~~~text
Patient SELF
  → Personal
  → Personal medication list
  → add personal medication
  → view medication
  → edit/correct under approved policy
  → stop/archive under approved lifecycle
~~~

Candidate: Patient/Profile-level personal scope; Patient SELF only; other Patient/OSM/Hospital/ADMIN routine access/caregiver DENY; include name and only owner-approved dose/instruction representation; no schedule in 17G.1 unless owner explicitly moves simple schedule into scope; no reminders, notification delivery, adherence, export, sharing, Goal Plan sync, clinical/prescription semantics, or final Prisma names/types.

นี่เป็น proposal เท่านั้น; **17G.1 NOT CLEARED FOR IMPLEMENTATION** จนกว่าจะปิด decision ที่เกี่ยวข้อง
