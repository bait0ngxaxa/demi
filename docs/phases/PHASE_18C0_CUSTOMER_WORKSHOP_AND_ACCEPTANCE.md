# Phase 18C.0 — ชุดคำถาม Workshop และ Synthetic Acceptance Scenarios

**สถานะ:** PHASE 18C.0 — DECISION PACKAGE PREPARED / CUSTOMER & CLINICAL CONFIRMATION PENDING
**Source HEAD:** main / ff6cfa7458183f43ca7b4ad1228700f33b6ba059 (2026-10-10)

**ใช้ร่วมกับ:** [Business & Clinical Decision Pack](./PHASE_18C0_BUSINESS_CLINICAL_DECISION_PACK.md), [Data Capture Readiness Matrix](./PHASE_18C0_DATA_CAPTURE_READINESS_MATRIX.md), [Phase 18AB backlog](./PHASE_18AB_VERIFIED_GAP_BACKLOG.md)

นี่คือเอกสารเตรียมประชุม ไม่ใช่ผลการประชุมหรือการอนุมัติ. ทางเลือกและ candidate เป็นข้อเสนอให้ทบทวน; ผู้เข้าร่วมต้องตอบตามอำนาจของตน และบันทึก approval จากผู้มีอำนาจจริง. R24A-D01–D15 ยังคง PROPOSED FOR REQUESTER / CUSTOMER REVIEW.

## 1. วิธีใช้ Workshop

- Product Owner/Customer ระบุว่าคอลัมน์ใดบังคับ, ใช้เพื่อการตัดสินใจแบบใด และยอมรับการ omit เมื่อ source ยังไม่พร้อมหรือไม่.
- Hospital operations ระบุว่าใครทำกิจกรรมจริง, ใครกรอกข้อมูล และข้อมูลใดมีหลักฐานจากการปฏิบัติงาน.
- Clinical authority ตัดสินศัพท์คลินิก, instrument, stage, unit, score, threshold และความหมายของ outcome; Product หรือ Engineering ไม่แทนผู้อนุมัติคลินิก.
- Data owner ยืนยันแหล่งข้อมูล, provenance, effective/observation date, correction/history และเจ้าของ field.
- Security/privacy authority แยกพิจารณา disclosure/permission ใน RPT-24C; Phase 18C.0 ไม่อนุมัติ export, cohort access, privacy, revocation, snapshot หรือ delivery.
- Repository ไม่ระบุชื่อบุคคลผู้มีอำนาจ; Customer ต้องแต่งตั้งผู้แทนตาม role ก่อนตัดสินใจ. จดชื่อผู้อนุมัติ, role, วันที่, scope, version/effective date และหลักฐานในช่องทาง authoritative.
- รหัส BR/CL ด้านล่างอ้างหัวข้อใน Decision Pack; parent decision IDs เป็น R24A เดิมเท่านั้น. หากแยกคำตอบย่อย ให้บันทึกเป็นส่วนประกอบของ parent decision ไม่สร้าง ID แข่งขัน.

## 2. Agenda สำหรับ Customer / Product / Hospital Operations

### W1 — ความหมายของ Before / During / After และวันที่ · P0 · R24A-D06

- **ถาม:** “Before” ใช้ Baseline ใด; “During” ใช้วันให้บริการหรือวันบันทึก; “After” คือ Final Assessment หรือผลที่วัดหลังจบ? ต้องการแสดง Program start/end แยกจากวันตรวจ/วันติดตามหรือไม่?
- **ทำไม:** Source มี Baseline.recordedOn, Program.startedAt/completedAt และ application record timestamps คนละความหมาย; Follow-up/Final ยังไม่มี encounter date ที่ยืนยัน.
- **ทางเลือก/ผล:** ใช้ label ตาม source (Baseline/Follow-up/Final) ซื่อตรงแต่ต่าง workbook; ใช้ Before/During/After หลังอนุมัติ mapping ซึ่งอาจต้องเก็บ event date เพิ่ม; omit stage ที่ยังจับคู่ไม่ได้เพื่อลดความเข้าใจผิด.
- **Candidate:** แยก lifecycle date, clinical event date และ record timestamp; ไม่ใช้ recordedAt เป็นวันพบผู้ป่วย.
- **เจ้าของ:** Customer/Product Owner + Hospital operations + Clinical/Data authority.
- **Fallback:** แสดงเฉพาะวันที่ source บอกได้และไม่ตั้งชื่อเป็นวันตรวจ; ไม่คัดลอกค่าข้าม stage. รายละเอียด BR-01.

### W2 — คอลัมน์ใดบังคับ และยอมรับ coverage แบบมีข้อจำกัดหรือไม่ · P0 · R24A-D07/D12

- **ถาม:** สำหรับแต่ละ field ที่ยังไม่มี/ไม่ครบ ลูกค้าต้องการให้เป็น mandatory หรือยอมรับการเว้นโดยมี label ที่ปลอดภัย? ควรเผยแพร่รายงานเฉพาะ field ที่มี source หรือรอให้ครบตาม template?
- **ตัวอย่าง:** CVD Risk, HbA1c After, BMI, illness duration, PAM/PROM score, achieved days/rate และ structured outcome.
- **ทางเลือก/ผล:** factual subset ลดเวลารอแต่ไม่ใช่รายงานครบ; รอครบทุก field ลดข้อจำกัดแต่ไม่ควรเติมข้อมูลโดยเดา; แยก version/coverage label ช่วยสื่อสารแต่เป็น workbook/presentation decision.
- **Candidate:** ระบุ field mandatory ต่อผลทางธุรกิจ; field ที่ไม่มี authoritative source ให้ omit/แสดง unavailable ตาม presentation rule ที่อนุมัติ.
- **เจ้าของ:** Customer/Product Owner; Clinical/Data authority สำหรับ clinical field; Security/privacy สำหรับข้อความที่เปิดเผย source state.
- **Fallback:** ห้ามแทน missing ด้วย 0, ค่าเดิม หรือ status ที่ไม่เทียบเท่า. รายละเอียด BR-01 และ CL-01–CL-07.

### W3 — DM / Pre-DM label และตัวหารของจำนวน · P0 · R24A-D08 (พึ่ง D01/D03)

- **ถาม:** “เบาหวาน” และ “กลุ่มเสี่ยง (Pre-DM)” ใช้ clinical definition/source ใด และนับต่อ Patient, Hospital relationship หรือ Patient Program? บุคคลที่มีหลาย Hospital relationship นับอย่างไรในรายงานของ Hospital เดียว?
- **ทำไม:** Source เก็บ RISK/DIABETES ต่อ PatientProfile; query ปัจจุบันนับ relationship rows. ทั้งชื่อ classification และ denominator ยังไม่เท่ากับ workbook labels.
- **ทางเลือก/ผล:** งด count จนอนุมัติ; ใช้ source labels เดิมหากลูกค้ายอมรับว่าไม่ใช่ DM/Pre-DM; หรือให้ clinical authority อนุมัตินิยาม/เวลา/denominator ใหม่.
- **Candidate:** งดแปล RISK → Pre-DM และ DIABETES → DM โดยอัตโนมัติ; นับเฉพาะ exact-Hospital population ที่อนุมัติใน gate แยก.
- **เจ้าของ:** Clinical authority + Product/Data owner + Hospital operations; Security/privacy ทบทวนการเปิดเผย aggregate.
- **Fallback:** ไม่แสดงจำนวนทางคลินิก. รายละเอียด CL-04; exact population/export authorization ไม่ปิดใน workshop นี้.

### W4 — Service completeness หมายถึงอะไร · P0 · R24A-D10

- **ถาม:** “ครบ”, “ทำแล้ว” หรือ “จัดบริการแล้ว” หมายถึงมี record, เริ่มบริการ, ส่งมอบจริง, ผู้ป่วยเข้าร่วม, ทำกิจกรรมครบ หรือบริการไม่เกี่ยวข้อง?
- **ตัวอย่าง:** Service 1 มี record; Goal Plan มี target; Follow-up มี note; PatientServiceRequest เป็น STARTED.
- **ทางเลือก/ผล:** แสดง record presence ที่ source พิสูจน์ได้; เก็บ delivery/participation/completion fact เพิ่มหลังนิยาม; แยก source-record coverage และ service-delivery status เป็นคนละคอลัมน์.
- **Candidate:** แยก planned / recorded / started / delivered / participated / completed; STARTED ใน request ไม่ใช่ Program/Service completion.
- **เจ้าของ:** Customer/Product Owner + Hospital operations + Clinical authority.
- **Fallback:** ใช้ “มี/ไม่มี record ใน DEMI” เฉพาะเมื่อ label ได้รับอนุมัติ; ห้ามอ้างว่าให้บริการแล้วจากการมี row. รายละเอียด BR-02.

### W5 — เป้าหมาย Service 2 มีช่วงเวลาและการแก้ไขแบบใด · P0 · R24A-D06/D10

- **ถาม:** Target days/frequency/value/unit ใช้กับวันปฏิทิน, สัปดาห์ที่เริ่มวันใด, rolling period หรือช่วงระหว่าง Follow-up? เมื่อสร้าง Goal Plan round ใหม่ target เก่าหยุดมีผลเมื่อใด?
- **ทางเลือก/ผล:** calendar week เทียบง่ายแต่ต้องกำหนด timezone; Follow-up interval สอดคล้องกับนัดแต่ต้องเก็บช่วงจริง; แสดง target โดยไม่เทียบ actual จนมี period.
- **Candidate:** คง target กับ Goal Plan round ที่มีอยู่; การเปลี่ยน target ไม่มีผลย้อนหลังจนกว่าจะตัดสิน effective date.
- **เจ้าของ:** Customer/Product Owner + Hospital operations + Clinical/Data authority.
- **Fallback:** แสดงเป็น target ที่บันทึกไว้เท่านั้น; ไม่ใช้เป็น achievement. รายละเอียด BR-03.

### W6 — Achieve score และจำนวน Follow-up ที่ >70% · P0 · R24A-D09 / G18-04 (พึ่ง D10/D12; D01–D03 เฉพาะเมื่อจำเป็นต่อ Reporting Population)

- **ถาม:** Dashboard ภาพรวมต้องการ Achieve Score ใน During 1–6 ส่วนรายงานการจัดบริการต้องการ Achieved Days และ Achievement Rate ใน Service 3–6: “จำนวนวันที่ทำได้” ใครเป็นผู้ยืนยันและในช่วงใด? ตัวเศษ/ตัวหารคืออะไร? PARTIAL, zero target, missing, unknown และ not applicable จัดการอย่างไร? คะแนนอยู่ระดับ activity, Follow-up หรือ Program? >70% หมายถึงมากกว่า 70 จริงหรือ 70 ขึ้นไป และนับ Follow-up ชุดใด?
- **หลักฐานให้ทบทวน:** worksheet note!AK32 มีคำอธิบายสัดส่วนจำนวนครั้งที่ทำได้กับจำนวนครั้งที่ตั้งเป้าหมายต่อสัปดาห์ แต่ยังไม่กำหนด period, observation method, status conversion, revision, rounding หรือ missing rules.
- **ทางเลือก/ผล:** เก็บ categorical status อย่างเดียวและไม่แสดง score; เก็บ actual occurrences พร้อมผู้บันทึก/period แล้วค่อยอนุมัติ formula; รับ score จาก external/clinical source ที่มี provenance. Formula ต้องกำหนด strict/inclusive threshold, denominator, precision และ correction ด้วย.
- **Candidate:** ไม่แปลง DONE/PARTIAL เป็นจำนวนวันและไม่คำนวณ >70% จนมี clinical/data-approved rule กับ synthetic test vectors.
- **เจ้าของ:** Clinical authority + Data owner + Customer/Product Owner + Hospital operations.
- **Fallback:** เว้นตัวเลขที่ไม่มี source หรือใช้ categorical source label ตามที่อนุมัติ; ห้ามรายงาน achieved rate/count. รายละเอียด BR-04.

### W7 — Outcome, plan adjustment และ obstacle เป็นคนละข้อเท็จจริง · P0 · R24A-D10/D12

- **ถาม outcome:** รายการ phrase ที่ customer note กล่าวถึงคือ vocabulary รุ่นใด ใครเป็นเจ้าของ เป็นผลทางคลินิกหรือสถานะปฏิบัติงาน และเก็บหนึ่งหรือหลายค่า?
- **ถาม adjustment:** ต้องการบอกว่าตัดสินใจปรับ, สร้าง Plan ใหม่ หรือปรับจริงแล้ว? ต้อง link Plan ก่อน/หลัง, decision/effective date, actor และ reason หรือไม่?
- **ถาม obstacle:** workbook note ขอ Yes/No เท่านั้นหรือเหตุผลด้วย; Unknown ต่างจาก No อย่างไร; เกี่ยวกับทั้ง Follow-up หรือ activity เดียว; ใครแก้ได้?
- **ทางเลือก/ผล:** controlled vocabulary/event ทำให้รายงานสม่ำเสมอแต่เพิ่มการเก็บและ governance; omit จนชัดปลอดภัยกว่าแต่ไม่มีคอลัมน์ที่เชื่อถือได้; free-text inference เสี่ยงตีความผิดและเปิดเผยข้อมูลอ่อนไหวจึงไม่ใช่ตัวเลือก.
- **Candidate:** แยก outcome, adjustment decision/application และ obstacle; เก็บเท่าที่เจ้าของ rule ยืนยัน; no/unknown/not applicable ไม่รวมกัน.
- **เจ้าของ:** Clinical authority + Hospital operations + Customer/Product; Security/privacy ร่วมเมื่อจะเก็บ/แสดง reason หรือ narrative.
- **Fallback:** ไม่มี outcome/adjustment/obstacle indicator จาก note หรือ Plan count. รายละเอียด BR-05–BR-07.

### W8 — OSM ที่แสดงเป็นใคร · P1 · R24A-D05

- **ถาม:** คอลัมน์ อสม.ที่ดูแล หมายถึง OSM ปัจจุบัน, ผู้ได้รับ assignment ตอนเริ่ม Program, ผู้รับผิดชอบในช่วง Follow-up, ผู้บันทึก หรือผู้ให้บริการจริง?
- **ทางเลือก/ผล:** current-at-report ใช้บอกผู้ดูแลปัจจุบันแต่ไม่ใช่ history; historical assignee ต้องกำหนดเวลา/provenance; service deliverer ต้องมี source ที่ระบุคนทำจริง; omit ลดความเสี่ยง attribution ผิดแต่ลดประโยชน์.
- **Candidate:** ไม่ใช้ assignment ปัจจุบันแทน attribution ย้อนหลัง และไม่ใช้ record creator แทน care deliverer.
- **เจ้าของ:** Hospital operations + Product Owner + Hospital data owner; Security/privacy ตัดสินการเปิดเผยแยก.
- **Fallback:** เว้น/label ตามความหมายที่ source ยืนยันได้เท่านั้น. รายละเอียด BR-08; ห้ามเปลี่ยน OSM authorization.

### W9 — เวลาออกกำลังกาย/สัปดาห์มาจากใคร · P1 · R24A-D06/D07/D09

- **ถาม:** workbook ต้องการ patient self-report หรือการสังเกต/ทวนสอบโดย care team? สัปดาห์เริ่ม/จบเมื่อใด? รวมหลายรายการ/รายการซ้อนอย่างไร? ยอมให้ Personal Wellness มาเติม Program report หรือไม่?
- **ทางเลือก/ผล:** ใช้ self-report ที่ติดป้ายชัดแต่ไม่ใช่ clinical observation; เก็บ Program-linked reviewed fact หลังอนุมัติ; omit จนแหล่งข้อมูลตรงกับความหมาย.
- **Candidate:** รักษา Patient SELF กับ care-team scopes แยก; ไม่ project PersonalExerciseEntry เข้ารายงานบริการโดยเงียบ.
- **เจ้าของ:** Clinical/Data authority + Customer/Product Owner + Patient privacy/security authority.
- **Fallback:** ไม่แสดงเป็น Program-observed weekly exercise. รายละเอียด CL-07.

## 3. คำถามสำหรับ Clinical authority / Data owner

ใช้ [CL-01–CL-07 ใน Decision Pack](./PHASE_18C0_BUSINESS_CLINICAL_DECISION_PACK.md) เป็นรายละเอียดตัวเลือก; ด้านล่างคือการเรียงคำถามโดยไม่กำหนดสูตรแทน authority.

| Priority / parent | คำถามที่จะปิด | Owner | Fallback หากยัง OPEN |
| --- | --- | --- | --- |
| P0 · D06/D07/D09/D12 · CL-01 | HbA1c แต่ละ stage ใช้ผลจาก source ใด, วันตรวจใด, unit/provenance/correction แบบใด? After ต้องเก็บ result แยกหรือไม่? | Clinical authority + Hospital lab/data owner | ใช้ Baseline Before ได้เฉพาะเมื่อ stage/source อนุมัติ; After ว่าง/omit; ห้าม copy Before |
| P0 · D07/D09/D12 · CL-02 | BMI ใช้ stage-matched height/weight จากไหน, ใครอนุมัติ formula/version/rounding/validation และแก้ย้อนหลังอย่างไร? | Clinical authority + Data owner | ไม่คำนวณหรือเติม BMI |
| P0 · D07/D09 · CL-03 | CVD risk ใช้ assessment/algorithm/version ใด, รับจากภายนอกหรือคำนวณ; inputs, range, time, missing และ reproducibility เป็นอย่างไร? | Clinical authority; source owner ระบุระบบต้นทาง | ไม่แสดง CVD score |
| P0 · D01/D03/D08/D12 · CL-04 | ใครกำหนด DM/Pre-DM, effective date และ denominator; unclassified/หลาย relationship/history แก้อย่างไร? | Clinical authority + Product/Data owner + Hospital operations | ไม่แปล RISK/DIABETES และไม่เผยแพร่ count ที่ไม่มี denominator |
| P0 · D07/D09/D12 · CL-05 | Illness duration เริ่มนับจากเหตุการณ์ใด, reported หรือ verified, unit/effective date/correction และ requiredness คืออะไร? | Clinical authority + Hospital data owner | ไม่ใช้ Program start แทน onset และไม่คำนวณ |
| P0 · D06/D07/D09 · CL-06 | PAM/PROM instrument/version, scoring owner/range/interpretation, respondent, timing, Program link และ reassessment rule คืออะไร? | Clinical authority + Data owner + Product Owner | ไม่เรียก prototype JSON ว่าคะแนนที่อนุมัติ |
| P0/P1 · D06/D07/D09 · CL-07 | เวลาออกกำลังกายเป็น self-report หรือ observed; ช่วงสัปดาห์, inclusion, dedup, Program linkage, review และผู้เข้าถึงคืออะไร? | Clinical/Data authority + Product Owner + Privacy authority | Personal Wellness ยังคง SELF-only และไม่เป็น Program fact |

## 4. Decisions ที่ต้องคงเป็น dependency แยก

รายการต่อไปนี้อาจรับคำตอบ business intent จาก customer ได้ แต่ Phase 18C.0 ไม่ปิด approval หรือ implementation gate:

| Existing decision | คำถาม/งานสำหรับรอบ review ที่เหมาะสม | Authority ตาม RPT-24A | สถานะที่ต้องคงไว้ |
| --- | --- | --- | --- |
| R24A-D01–D03 | ระบุ Hospital population eligibility, row grain และการแยก Program/relationship เพื่อส่งต่อเข้า reporting contract review | Customer/Product Owner + Hospital operations; Security ทบทวน scope | PROPOSED FOR REQUESTER / CUSTOMER REVIEW; ไม่ถือเป็น cohort/export authorization |
| R24A-D04–D05 | ระบุ Patient ID/display และความหมายชื่อ OSM ที่ต้องการ; field disclosure ทบทวนแยก | Customer/Product + Hospital data owner + Security/privacy | OPEN; no UUID fallback, no historical attribution by current assignment |
| R24A-D11–D13/D15 | เลือกแนวทาง overflow, compatibility, required columns, missing presentation และ ordering เพื่อเตรียม customer workbook review | Customer + Product Owner; Engineering กำหนด deterministic mechanism ภายหลัง | OPEN; ไม่มีการแก้ workbook/template ใน Phase นี้ |
| R24A-D14 และ RPT-24C | พิสูจน์ coherent snapshot boundary, requestedAt/dataAsOf/generatedAt, authorization/revocation/audit/file delivery | Architecture/DB + Security/privacy; Customer/Product สำหรับ label | OPEN / NOT AUTHORIZED; ไม่ใช่ clinical/business formula question |
| HN-M08 Network Export | ไม่มีการอนุมัติรายบุคคลหรือ export ผ่าน Hospital Network | Network governance + Security/privacy ตาม gate เดิม | DEFERRED / NOT AUTHORIZED |

## 5. Synthetic-only acceptance scenarios (เตรียมไว้ ไม่ได้รัน)

ทุกกรณีใช้ synthetic identities และค่าทดสอบที่ไม่มีข้อมูลผู้ป่วยจริง. สิ่งที่คาดว่าจะ persist เขียนแบบมีเงื่อนไขตาม accepted rules; ไม่มี numeric score/result ที่คาดหวังก่อนอนุมัติสูตร. ต้องใช้ approved actor, exact Hospital/Program scope และ record readback หลัง implementation/UAT ที่ได้รับอนุญาต.

| Scenario | Initial state → user operation | Expected persisted fact เมื่อ rule อนุมัติ | Expected report meaning / evidence to accept | Current status |
| --- | --- | --- | --- | --- |
| SC-01 Before/During/After dates | Synthetic Program มี linked Baseline, service record, Follow-up และ Final; actor บันทึกตาม operation ที่อนุมัติ | เก็บ stage source และ event date แยกจาก Program lifecycle time และ record timestamp | เทียบเฉพาะค่าจาก stage ที่อนุมัติ; ต้องอ่านกลับ source/time/actor เดิมและยืนยันว่าไม่มี timestamp substitution | BLOCKED_BY_DECISION: D06, source Follow-up/Final encounter date ยังไม่ยืนยัน |
| SC-02 Missing vs zero vs not applicable | Baseline/Follow-up/Final บางค่าเป็น null, บางค่ามี numeric zero, บาง activity ถูกอนุมัติว่า not applicable | คง null, factual zero และ NA เป็นคนละสถานะ; absence of record แยกจาก absent field | report แสดงตาม approved missing vocabulary โดยไม่แทน null ด้วย zero และไม่เผย withheld state | BLOCKED_BY_DECISION: D12 และ disclosure gate |
| SC-03 Partial active Program | Program ACTIVE มี Service 1/GoalPlan บางรายการ แต่ไม่มี Follow-up/Final | persist source records ที่มีจริง; ไม่มี completion fact จากข้อมูลที่ไม่ได้บันทึก | ACTIVE แสดงเป็น lifecycle; ห้ามแสดงว่า service ครบหรือผลลัพธ์สำเร็จ | BLOCKED_BY_DECISION: D10; factual lifecycle source ใช้ได้แต่ label ยังรอ |
| SC-04 Completed Program without Final | Program เปลี่ยนเป็น COMPLETED แต่ไม่มี Final Assessment | Program.status/completedAt มี; Final source absent | report แยก completed lifecycle จาก Final/clinical outcome; ห้ามเติม After จาก Baseline | BLOCKED_BY_DECISION: D06/D07/D10/D12 |
| SC-05 Multiple Goal Plan rounds | Program มี Goal Plan round เก่า/ใหม่; Follow-up อ้าง sourceGoalPlanId ที่บันทึกไว้ | เก็บแต่ละ target กับ round และ Follow-up source reference ตามจริง; no implicit supersedes/adjustment | actual ต้องอิง Plan/time window ที่อนุมัติ; Plan ใหม่ไม่เปลี่ยน target เก่าย้อนหลัง | BLOCKED_BY_DECISION: D06/D09/D10 |
| SC-06 Follow-up 0, 1, 6, 7+ | Synthetic Program มีจำนวน Follow-up ต่างกัน รวมเกินหก; actor บันทึกตาม workflow | persistence/readback คงทุก Follow-up 0..N และ order source; หก worksheet positions ไม่ใช่ maximum | report/export ต้อง represent ทุก record หรือ fail ชัดตาม layout ที่อนุมัติ; ตรวจ pagination/overflow ไม่มี truncation | BLOCKED_BY_DECISION: D11/D13/D15 และ RPT-24C snapshot |
| SC-07 Category is not achieved days | Follow-up มี DONE, PARTIAL, NOT_DONE, NOT_APPLICABLE แต่ไม่มี actual-day observations | persist categorical statuses เท่านั้น; ไม่มี numeric achieved-day/score หากไม่มี authorized input | report ไม่แปลง category เป็น days/rate และไม่คำนวณ >70% | BLOCKED_BY_DECISION: D09/D10/D12 |
| SC-08 Plan unchanged vs adjustment | Follow-up ไม่มีการปรับ, มีเพียง decision, หรือมี resulting Plan ใหม่ตามทางเลือกที่ authority อนุมัติ | บันทึก decision และ applied change แยกกัน พร้อม prior/resulting Plan/time/actor หาก rule ต้องใช้ | indicator สะท้อนความหมายที่เลือก; จำนวน Plan rounds ไม่ใช้เป็นหลักฐาน adjustment | BLOCKED_BY_DECISION: D10 |
| SC-09 Obstacle/outcome unknown and correction | Follow-up มี Yes, No, Unknown/NA; outcome เลือกจาก approved vocabulary; มีการแก้ record ตาม correction rule | บันทึก structured field, author, event time, vocabulary version และ correction history ตาม rule | unknown ไม่กลายเป็น no; free text ไม่ถูกจัด outcome; report แสดงผลล่าสุด/ประวัติตาม approved policy | BLOCKED_BY_DECISION: D10/D12 and vocabulary decision |
| SC-10 Baseline and Final stage coverage | Baseline มี height/HbA1c; Final มี weight แต่ไม่มี height/HbA1c | persist เฉพาะ source facts; capture เพิ่มหรือ derivation ทำได้หลัง authority เลือก source/formula | ไม่มี BMI/HbA1c After ที่คัดลอก/คำนวณจาก stage อื่นโดยไม่อนุมัติ | BLOCKED_BY_DECISION: D06/D07/D09 |
| SC-11 OSM reassigned after service | OSM A ถูก assign, บันทึก event; ต่อมาถูกยุติและ OSM B ได้ assignment ใหม่ | เก็บ PatientOsmAssignment history และ record creator แยก; care responsibility fact เก็บเฉพาะเมื่อ approved source มี | report ไม่แสดง OSM B เป็นผู้ดูแล event เก่าจาก current assignment อย่างเดียว | BLOCKED_BY_DECISION: D05 |
| SC-12 Same Patient, multiple Programs and Hospitals | Synthetic Person มีสอง Program ใน Hospital A และ relationship อีกแห่งใน Hospital B; actor ขอ read/report ภายใต้ Hospital A | Program FK และ relationship scope แยกตาม Hospital/Program; ไม่มี cross-Hospital aggregation จาก identity link | row grain ต้องไม่ผสม Program; read ที่ไม่มี exact scope ถูกปฏิเสธ; population/count ใช้ approved scope เท่านั้น | BLOCKED_BY_DECISION: D01–D03; RPT-24C authorization gate |
| SC-13 Personal exercise vs Program observation | Patient SELF เพิ่ม/แก้ PersonalExerciseEntry; OSM/Staff เปิด Program report | Personal entry อยู่ใน self PatientProfile เท่านั้น; ไม่มี Program FK | report ไม่เรียก self-report ว่า observed/service activity หากไม่มี accepted linkage and review | BLOCKED_BY_DECISION: D06/D07/D09; preserve SELF/care boundary |
| SC-14 Classification changes over time | Classification ปัจจุบันเปลี่ยนจาก RISK เป็น DIABETES; มี history event; มีหลาย relationship | เก็บ current classification/history ตาม operation; effective clinical date/Program snapshot ยังไม่มีจนอนุมัติ | report ไม่นับเป็น Pre-DM→DM timeline และไม่ dedup count โดย assumption | BLOCKED_BY_DECISION: D01/D03/D08/D14 |

## 6. Evidence required after approval

เมื่อ decision ถูกปิดโดย authority แล้ว acceptance review ควรเก็บหลักฐานต่อไปนี้แยกจากกัน:

1. decision record ระบุ parent R24A ID, ตัวเลือก/นิยามที่เลือก, authority role และผู้อนุมัติจริง, วันที่, scope, version/effective time และข้อจำกัดที่ยอมรับ;
2. source-level verification ด้วย synthetic record แสดง operation, actor, exact PatientHospitalRelationship/PatientProgram, persisted fact และ readback;
3. focused automated checks สำหรับ status/time/units/linkage/authorization เมื่อมี implementation authorization; historical test PASS ไม่ใช่ผลปัจจุบัน;
4. synthetic business UAT ตาม scenario ที่ไม่ถูก BLOCKED_BY_DECISION; บันทึก expected vs actual โดยไม่ใช้ real patient data;
5. แยก customer acceptance, clinical approval, security/privacy approval และ external verification; หนึ่งสถานะไม่แทนอีกสถานะ.

ใน Phase 18C.0 ไม่มี UAT, database write, test suite, build, deployment หรือ implementation ดำเนินการ.

**Next step:** Phase 18C.1 — Business & Clinical Decision Review / Closure. เริ่มได้เมื่อผู้มีอำนาจตามบทบาทเข้าร่วมและมีหลักฐานการตัดสินใจ; ไม่เริ่มจากเอกสารฉบับนี้โดยอัตโนมัติ.
