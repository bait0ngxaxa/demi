# Phase 18C.1 — แบบทบทวนและบันทึก Customer / Clinical Sign-off

- **ผล Phase:** DECISION REVIEW READY — CUSTOMER / CLINICAL SIGN-OFF PENDING
- **Source HEAD ที่ตรวจ:** 302acaec724ca14e60a9243a333bf235241ebb42
- **จุดประสงค์:** ใช้เตรียมประชุมและเก็บคำตอบจริงโดยตรวจสอบย้อนกลับได้
- **คำตอบที่มีใน repository ตอนจัดทำ:** ไม่มีคำตอบใหม่จากลูกค้าหรือ clinical authority; ทุกช่องเลือกคำตอบยัง NOT PROVIDED / OPEN

ใช้คู่กับ [Decision Review Register](./PHASE_18C1_DECISION_REVIEW_REGISTER.md) ซึ่งระบุ source, alternatives, dependencies และผลต่อระบบ และ [Phase 18C.0 Workshop & Acceptance](./PHASE_18C0_CUSTOMER_WORKSHOP_AND_ACCEPTANCE.md) ซึ่งมี synthetic scenarios. แบบฟอร์มนี้ไม่ได้เป็นหลักฐานว่าเกิดการประชุมหรือมีผู้อนุมัติแล้ว.

## 1. วิธีใช้และการบันทึกสถานะ

1. ระบุผู้เข้าร่วมและขอบเขตหน้าที่ก่อนตอบ; Product Owner ไม่แทน Clinical, Security/privacy หรือ Data owner ที่ต้องอนุมัติร่วม.
2. เลือกถ้อยคำที่ตอบคำถามได้ชัด ไม่เลือกจาก engineering convenience. Candidate ในเอกสารเป็นเพียงข้อเสนอ.
3. บันทึกคำตอบหนึ่งชุดต่อ R24A-Dxx; หากตอบได้เพียงบางส่วนให้บันทึกส่วนที่ยืนยันและคงสถานะ PARTIALLY_CONFIRMED หรือ OWNER_RECEIVED.
4. เก็บหลักฐานประชุม/อีเมล/เอกสารที่อนุมัติไว้ในระบบที่องค์กรกำหนด แล้วใส่ URL หรือ reference ที่ตรวจสอบได้ที่นี่; ห้ามใส่ข้อมูลผู้ป่วยจริงในเอกสารนี้.
5. ใช้ ACCEPTED เฉพาะเมื่อ exact wording, authority, approving person/body, date, evidence, scope, effective version และ conditions ครบ. คำตอบในแบบฟอร์มนี้ไม่แก้สถานะ canonical ใน RPT-24A เอง; ผู้ดูแล register ต้องอัปเดต canonical source ภายใต้การอนุมัติที่เหมาะสม.
6. การอนุมัติ decision ไม่ใช่ implementation authorization, RPT-24C approval, UAT หรือ production approval.

สถานะปัจจุบันของ D01–D15 จาก RPT-24A คือ PROPOSED FOR REQUESTER / CUSTOMER REVIEW ซึ่งใน register นี้ map เป็น PROPOSED. ยังไม่มีการกรอกผลประชุม.

## 2. Customer / Product Owner review

คำถามต่อไปนี้ใช้ภาษาธุรกิจ; ทางเลือกเป็นตัวช่วยสนทนา ไม่ใช่คำตอบที่อนุมัติ. ช่องคำตอบทุกข้อเริ่มเป็น NOT PROVIDED.

### กลุ่ม A — Population และ identity

#### R24A-D01 — ใครอยู่ในรายงาน?

- **คำถาม:** Dashboard และรายงานการจัดบริการควรรวมผู้ป่วย/Program ของโรงพยาบาลใด และต้องยังมีความสัมพันธ์แบบใดจึงอยู่ในรายงาน?
- **ตัวเลือกคุย:** exact Hospital ที่ผู้ใช้มีสิทธิ์; เฉพาะ relationship ปัจจุบัน; หรือรวม historical relationship ตามเกณฑ์ที่ระบุ. ยืนยันด้วยว่ารวมทั้ง ACTIVE และ COMPLETED Program หรือไม่ และมีช่วงวันเริ่ม/สิ้นสุดหรือไม่.
- **Approver:** Customer/Requester + Product Owner + Hospital operations; Security/privacy ตรวจ scope แยก.
- **คำตอบที่เลือก:** NOT PROVIDED · **ถ้อยคำที่อนุมัติ:** NOT PROVIDED
- **ผู้อนุมัติ / role:** NOT PROVIDED · **วันที่:** NOT PROVIDED · **หลักฐาน URL/reference:** NOT PROVIDED
- **Scope:** NOT PROVIDED · **Version/effective date:** NOT PROVIDED · **Conditions:** NOT PROVIDED · **Status:** OPEN

#### R24A-D02 — หนึ่งแถวแทนอะไร?

- **คำถาม:** เมื่อคนหนึ่งมีหลาย Program แถวในแต่ละชีตควรแทน Patient หนึ่งคน, Patient Program หนึ่งรายการ หรือกิจกรรม Follow-up?
- **ตัวเลือกคุย:** หนึ่งแถวต่อ Patient Program; รวม Program ในแถวเดียว; หรือแสดง Follow-up ในรายละเอียดแยก.
- **Approver:** Customer + Product Owner.
- **คำตอบที่เลือก:** NOT PROVIDED · **ถ้อยคำที่อนุมัติ:** NOT PROVIDED
- **ผู้อนุมัติ / role:** NOT PROVIDED · **วันที่:** NOT PROVIDED · **หลักฐาน URL/reference:** NOT PROVIDED
- **Scope:** NOT PROVIDED · **Version/effective date:** NOT PROVIDED · **Conditions:** NOT PROVIDED · **Status:** OPEN

#### R24A-D03 — แยกข้อมูลหลายโรงพยาบาลอย่างไร?

- **คำถาม:** หากผู้ป่วยมี Program หรือความสัมพันธ์กับมากกว่าหนึ่งโรงพยาบาล ผู้ใช้แต่ละโรงพยาบาลควรเห็นอะไร?
- **ตัวเลือกคุย:** แยกทุกความสัมพันธ์/Program ในโรงพยาบาลที่กำลังรายงาน; รวมข้อมูลข้ามโรงพยาบาล; หรือแสดงเฉพาะ Program ที่ลูกค้าระบุ. การเปิดข้าม Hospital ใช้ไม่ได้หากไม่มี Security/privacy authorization แยก.
- **Approver:** Product Owner + Hospital operations; Security/privacy มีอำนาจแยกเรื่อง disclosure.
- **คำตอบที่เลือก:** NOT PROVIDED · **ถ้อยคำที่อนุมัติ:** NOT PROVIDED
- **ผู้อนุมัติ / role:** NOT PROVIDED · **วันที่:** NOT PROVIDED · **หลักฐาน URL/reference:** NOT PROVIDED
- **Scope:** NOT PROVIDED · **Version/effective date:** NOT PROVIDED · **Conditions:** NOT PROVIDED · **Status:** OPEN

#### R24A-D04 — ช่อง Patient ID หมายถึงอะไร?

- **คำถาม:** ลูกค้าใช้รหัสใดในการค้นหา/จับคู่แถว และกรณีไม่มีรหัสควรแสดงอย่างไร?
- **ตัวเลือกคุย:** ใช้เลขประจำโรงพยาบาลเมื่อ data owner ยืนยัน; เว้นว่าง/ใช้คำที่อนุมัติ; หรือไม่แสดง ID. จะไม่ใช้ internal ID แทน.
- **Approver:** Customer + Product Owner + Hospital data owner; Security/privacy อนุมัติการเปิดเผย.
- **คำตอบที่เลือก:** NOT PROVIDED · **ถ้อยคำที่อนุมัติ:** NOT PROVIDED
- **ผู้อนุมัติ / role:** NOT PROVIDED · **วันที่:** NOT PROVIDED · **หลักฐาน URL/reference:** NOT PROVIDED
- **Scope:** NOT PROVIDED · **Version/effective date:** NOT PROVIDED · **Conditions:** NOT PROVIDED · **Status:** OPEN

#### R24A-D05 — จะแสดงชื่อ Patient / OSM อย่างไร?

- **คำถาม:** ต้องใช้ชื่อใดในไฟล์ และชื่อ OSM ต้องหมายถึงผู้รับผิดชอบปัจจุบัน, ผู้ที่เคยได้รับมอบหมาย, ผู้บันทึก หรือผู้ให้บริการ?
- **ตัวเลือกคุย:** แสดงเฉพาะ identity ที่ได้รับอนุมัติ; แสดง OSM ปัจจุบันโดยระบุว่าเป็นข้อมูล ณ เวลารายงาน; หรือไม่แสดง OSM จนกว่าจะพิสูจน์ความรับผิดชอบย้อนหลังได้.
- **Approver:** Customer + Product Owner + Hospital operations/data owner; Security/privacy อนุมัติ disclosure แยก.
- **คำตอบที่เลือก:** NOT PROVIDED · **ถ้อยคำที่อนุมัติ:** NOT PROVIDED
- **ผู้อนุมัติ / role:** NOT PROVIDED · **วันที่:** NOT PROVIDED · **หลักฐาน URL/reference:** NOT PROVIDED
- **Scope:** NOT PROVIDED · **Version/effective date:** NOT PROVIDED · **Conditions:** NOT PROVIDED · **Status:** OPEN

### กลุ่ม B — ความหมายทางธุรกิจและ clinical

#### R24A-D06 — Before / During / After หมายถึงช่วงใด?

- **คำถาม:** คอลัมน์ Before, During และ After หมายถึงการวัดหรือเหตุการณ์ใด; วันใดควรถือเป็นวันที่สังเกต/ตรวจจริง?
- **ตัวเลือกคุย:** ใช้ชื่อ Baseline / Follow-up / Final ตามบันทึก; ใช้ Before / During / After เมื่อ clinical mapping ได้รับรอง; หรือแสดงเฉพาะ field ที่ระบุช่วงและวันได้.
- **Approver:** Customer/Product + Clinical authority + Data owner.
- **คำตอบที่เลือก:** NOT PROVIDED · **ถ้อยคำที่อนุมัติ:** NOT PROVIDED
- **ผู้อนุมัติ / role:** NOT PROVIDED · **วันที่:** NOT PROVIDED · **หลักฐาน URL/reference:** NOT PROVIDED
- **Scope:** NOT PROVIDED · **Version/effective date:** NOT PROVIDED · **Conditions:** NOT PROVIDED · **Status:** OPEN

#### R24A-D07 — ยอมรับ field ที่ยังไม่มีค่าได้หรือไม่?

- **คำถาม:** รายงานรุ่นแรกต้องมีครบทุกช่องใน workbook หรือยอมรับบางช่องที่ยังไม่มี source/clinical meaning โดยระบุ omission อย่างชัดเจน?
- **ตัวเลือกคุย:** อนุมัติ factual subset; รอข้อมูลครบทุกช่อง; หรือแบ่งขอบเขต field ต่อ worksheet/version.
- **Approver:** Customer + Product Owner; Clinical/Data authority ยืนยันความหมายของ field ทางคลินิก.
- **คำตอบที่เลือก:** NOT PROVIDED · **ถ้อยคำที่อนุมัติ:** NOT PROVIDED
- **ผู้อนุมัติ / role:** NOT PROVIDED · **วันที่:** NOT PROVIDED · **หลักฐาน URL/reference:** NOT PROVIDED
- **Scope:** NOT PROVIDED · **Version/effective date:** NOT PROVIDED · **Conditions:** NOT PROVIDED · **Status:** OPEN

#### R24A-D08 — DM / Pre-DM และจำนวนกลุ่มใช้หลักใด?

- **คำถาม:** ใครเป็นผู้กำหนดความหมาย DM/Pre-DM และจำนวนสรุปนับเป็นคน, ความสัมพันธ์กับโรงพยาบาล หรือ Program?
- **ตัวเลือกคุย:** งดตัวเลขจนมีนิยาม; แสดงสถานะต้นทางด้วยชื่อเดิมหาก customer ยอมรับ; หรือใช้ clinical definition/denominator ที่ clinical/data authority อนุมัติ.
- **Approver:** Clinical authority + Product/Data owner + Hospital operations; Security/privacy ทบทวน aggregate disclosure. Product Owner คนเดียวอนุมัติ clinical classification ไม่ได้.
- **คำตอบที่เลือก:** NOT PROVIDED · **ถ้อยคำที่อนุมัติ:** NOT PROVIDED
- **ผู้อนุมัติ / role:** NOT PROVIDED · **วันที่:** NOT PROVIDED · **หลักฐาน URL/reference:** NOT PROVIDED
- **Scope:** NOT PROVIDED · **Version/effective date:** NOT PROVIDED · **Conditions:** NOT PROVIDED · **Status:** OPEN

#### R24A-D09 — คะแนนและ achievement หมายถึงอะไร?

- **คำถาม:** Dashboard แสดง Achieve Score ใน During 1–6; รายงานการจัดบริการแสดง Achieved Days, Achievement Rate ใน Service 3–6 และจำนวน Follow-up ที่เกิน 70%. ต้องการให้ค่าเหล่านี้วัดอะไรและใครรับรองวิธีคำนวณ?
- **ตัวเลือกคุย:** เว้นค่าตัวเลขจนอนุมัติ; ให้ clinical/data authority กำหนด observation และสูตร; หรือใช้ค่าจากแหล่งภายนอกที่ระบุ provenance. คำอธิบาย workbook อยู่ที่ รายงานการจัดบริการ!AK32.
- **Approver:** Clinical authority + Data owner สำหรับ clinical/data definition; Customer/Product สำหรับ label, threshold และการใช้งาน.
- **คำตอบที่เลือก:** NOT PROVIDED · **ถ้อยคำที่อนุมัติ:** NOT PROVIDED
- **ผู้อนุมัติ / role:** NOT PROVIDED · **วันที่:** NOT PROVIDED · **หลักฐาน URL/reference:** NOT PROVIDED
- **Scope:** NOT PROVIDED · **Version/effective date:** NOT PROVIDED · **Conditions:** NOT PROVIDED · **Status:** OPEN

#### R24A-D10 — “ทำแล้ว/ครบ” และผลลัพธ์หมายถึงอะไร?

- **คำถาม:** ลูกค้าต้องการทราบว่ามีบันทึก, เริ่มบริการ, ให้บริการแล้ว, ผู้ป่วยเข้าร่วม, ทำครบ หรือมีผลลัพธ์อย่างอื่น?
- **ตัวเลือกคุย:** แสดงการมีบันทึกเท่านั้น; กำหนดสถานะการส่งมอบบริการ; แยกผลลัพธ์ด้าน operation กับ clinical; หรือเว้น field ที่ยังไม่มีข้อมูลที่เชื่อถือได้.
- **Approver:** Customer/Product + Hospital operations + Clinical authority.
- **คำตอบที่เลือก:** NOT PROVIDED · **ถ้อยคำที่อนุมัติ:** NOT PROVIDED
- **ผู้อนุมัติ / role:** NOT PROVIDED · **วันที่:** NOT PROVIDED · **หลักฐาน URL/reference:** NOT PROVIDED
- **Scope:** NOT PROVIDED · **Version/effective date:** NOT PROVIDED · **Conditions:** NOT PROVIDED · **Status:** OPEN

### กลุ่ม C — workbook behavior, missing values และเวลา

#### R24A-D11 — Follow-up เกิน 6 รายการแสดงอย่างไร?

- **คำถาม:** หากมี Follow-up มากกว่าหกครั้ง ต้องแสดงทั้งหมดด้วยวิธีใด?
- **ตัวเลือกคุย:** เพิ่มชีตรายละเอียด; ขยายแถวในชีตเดิม; หรือหยุดสร้างไฟล์พร้อมแจ้งเกินขอบเขตที่ตกลง. ห้ามตัดรายการเงียบ.
- **Approver:** Customer + Product Owner.
- **คำตอบที่เลือก:** NOT PROVIDED · **ถ้อยคำที่อนุมัติ:** NOT PROVIDED
- **ผู้อนุมัติ / role:** NOT PROVIDED · **วันที่:** NOT PROVIDED · **หลักฐาน URL/reference:** NOT PROVIDED
- **Scope:** NOT PROVIDED · **Version/effective date:** NOT PROVIDED · **Conditions:** NOT PROVIDED · **Status:** OPEN

#### R24A-D12 — ช่องว่างและค่าไม่มีข้อมูลแสดงอย่างไร?

- **คำถาม:** จะแยกศูนย์จริง, ไม่มีบันทึก, ไม่ทราบ, ไม่เกี่ยวข้อง และข้อมูลที่ไม่อนุญาตให้เปิดเผยอย่างไร?
- **ตัวเลือกคุย:** เว้นช่อง; ใช้คำไทยที่อนุมัติเมื่อปลอดภัย; หรือไม่แสดง column/value. Security/privacy ต้องตรวจว่าข้อความไม่เผยการมีอยู่ของข้อมูลที่ถูกปกปิด.
- **Approver:** Customer/Product + Data owner; Security/privacy อนุมัติ disclosure.
- **คำตอบที่เลือก:** NOT PROVIDED · **ถ้อยคำที่อนุมัติ:** NOT PROVIDED
- **ผู้อนุมัติ / role:** NOT PROVIDED · **วันที่:** NOT PROVIDED · **หลักฐาน URL/reference:** NOT PROVIDED
- **Scope:** NOT PROVIDED · **Version/effective date:** NOT PROVIDED · **Conditions:** NOT PROVIDED · **Status:** OPEN

#### R24A-D13 — ต้องเหมือน workbook เดิมแค่ไหน?

- **คำถาม:** ผู้ใช้จำเป็นต้องได้สองชีตและรูปแบบเดิมทุกประการหรือยอมรับ version ใหม่/ชีต Follow-up รายละเอียด?
- **ตัวเลือกคุย:** คงสองชีตและใช้งานเทียบเท่า; ทำซ้ำตามแบบเดิม; หรือปรับ layout/version เมื่อข้อมูลจริงต้องการ.
- **Approver:** Customer + Product Owner.
- **คำตอบที่เลือก:** NOT PROVIDED · **ถ้อยคำที่อนุมัติ:** NOT PROVIDED
- **ผู้อนุมัติ / role:** NOT PROVIDED · **วันที่:** NOT PROVIDED · **หลักฐาน URL/reference:** NOT PROVIDED
- **Scope:** NOT PROVIDED · **Version/effective date:** NOT PROVIDED · **Conditions:** NOT PROVIDED · **Status:** OPEN

#### R24A-D14 — เวลาใดควรแสดงในไฟล์?

- **คำถาม:** ผู้ใช้ต้องเห็นเวลาขอไฟล์, เวลา snapshot ข้อมูล หรือเวลาสร้างไฟล์อย่างไร?
- **ตัวเลือกคุย:** แสดงเฉพาะเวลาที่พิสูจน์ได้; แสดง request และ generated time แยก; หรือไม่แสดง Data As-of จนกว่าจะพิสูจน์ snapshot boundary ได้.
- **Approver:** Customer/Product เรื่อง label; Architecture/DB + Security/privacy เรื่อง snapshot evidence และกลไก.
- **คำตอบที่เลือก:** NOT PROVIDED · **ถ้อยคำที่อนุมัติ:** NOT PROVIDED
- **ผู้อนุมัติ / role:** NOT PROVIDED · **วันที่:** NOT PROVIDED · **หลักฐาน URL/reference:** NOT PROVIDED
- **Scope:** NOT PROVIDED · **Version/effective date:** NOT PROVIDED · **Conditions:** NOT PROVIDED · **Status:** OPEN

#### R24A-D15 — เรียงแถวและจับคู่ข้อมูลอย่างไร?

- **คำถาม:** ควรเรียงตามชื่อ, ID, วันที่เริ่ม Program หรือเกณฑ์อื่น; ผู้ใช้จับคู่หลาย Program ในสองชีตอย่างไร?
- **ตัวเลือกคุย:** ลำดับตาม ID/ชื่อที่อนุมัติและวันที่ Program; ลำดับเวลา; หรือ customer-defined sequence. ระบบยังต้องเรียงให้คงที่เมื่อข้อมูลเหมือนเดิม.
- **Approver:** Customer + Product Owner; Engineering กำหนด stable tie-breaker ภายหลัง.
- **คำตอบที่เลือก:** NOT PROVIDED · **ถ้อยคำที่อนุมัติ:** NOT PROVIDED
- **ผู้อนุมัติ / role:** NOT PROVIDED · **วันที่:** NOT PROVIDED · **หลักฐาน URL/reference:** NOT PROVIDED
- **Scope:** NOT PROVIDED · **Version/effective date:** NOT PROVIDED · **Conditions:** NOT PROVIDED · **Status:** OPEN

## 3. Hospital operations review

ใช้คำถามต่อไปนี้กับผู้ปฏิบัติงานที่รับผิดชอบจริง; ไม่ต้องเลือกโครงสร้างฐานข้อมูลหรือ API.

| Existing reference | คำถามสำหรับ Hospital operations | คำตอบปัจจุบัน |
| --- | --- | --- |
| D01 / BR-01 | ผู้ป่วย/Program ใดถือว่ายังอยู่ในความรับผิดชอบของ Hospital; การสิ้นสุดความสัมพันธ์มีผลต่อรายงานอย่างไร? | NOT PROVIDED / OPEN |
| D06 / BR-01 | ในการทำงานจริง Baseline, Follow-up, Final เกิดเมื่อใด; ใครยืนยันวันพบ/วันวัด? | NOT PROVIDED / OPEN |
| D10 / BR-02 | หลักฐานใดบอกว่าแค่วางแผน, เริ่ม, ส่งมอบ, ผู้ป่วยเข้าร่วม หรือทำครบ; ใครเป็นผู้บันทึกแต่ละสถานะ? | NOT PROVIDED / OPEN |
| D06/D10 / BR-03 | เป้าหมายกิจกรรมใช้ช่วงใด; ใครปรับเป้าหมาย และเป้าหมายใหม่มีผลตั้งแต่วันใด? | NOT PROVIDED / OPEN |
| D09/D10 / BR-04 | ใครสังเกตและบันทึกกิจกรรมจริงในแต่ละช่วง; การแก้ค่าภายหลังต้องมีหลักฐานอะไร? | NOT PROVIDED / OPEN |
| D10/D12 / BR-05–BR-07 | Outcome, ปรับแผน และ obstacle ใครเป็นผู้บันทึก; เป็นของทั้ง Follow-up หรือรายกิจกรรม; แก้ไขได้อย่างไร? | NOT PROVIDED / OPEN |
| D05 / BR-08 | ชื่อ OSM ที่ต้องการในรายงานอธิบายงานของใครและช่วงเวลาใด; reassignment ควรเปลี่ยนอดีตหรือไม่? | NOT PROVIDED / OPEN |

คำตอบที่เกี่ยวกับ meaning/actor/effective date ให้บันทึกใน D ID เดิมตามส่วน 2; ไม่สร้าง BR decision ID.

## 4. Clinical / Data authority review

ต้องมี authority ที่รับผิดชอบ clinical meaning หรือแหล่งข้อมูลจริง. Product/customer ยืนยันความจำเป็นและข้อความใน workbook ได้ แต่ไม่แทน clinical approval.

| Topic / linked Decision | คำถามที่ต้องตอบ | หลักฐานขั้นต่ำก่อนปิด | คำตอบปัจจุบัน |
| --- | --- | --- | --- |
| CL-01 / D06-D07-D09-D12 — HbA1c | Before/After ใช้แหล่งใด วันตรวจใด หน่วยใด และมี provenance/correction/history อย่างไร? Final ต้องมีค่าที่บันทึกแยกหรือไม่? | Clinical + lab/data owner ระบุ source, stage, unit, date, requiredness, correction และมีตัวอย่าง synthetic | NOT PROVIDED / OPEN |
| CL-02 / D07-D09-D12 — BMI | ใครรับรอง input ต่อ stage, unit, formula/version, rounding, height reuse, missing และ validation? | การอนุมัติทาง clinical ที่ระบุ version และ synthetic test vectors | NOT PROVIDED / OPEN |
| CL-03 / D07-D09 — CVD Risk | ใช้ assessment ใด, คำนวณหรือรับจากภายนอก, input/version/time/range/missing/reproducibility เป็นอย่างไร? | Clinical authority ระบุวิธีและ version; data owner ระบุแหล่งและ provenance | NOT PROVIDED / OPEN |
| CL-04 / D01-D03-D08-D12 — DM/Pre-DM | ใครกำหนดนิยามและ effective date; นับเป็น Patient, relationship หรือ Program; จัดการ unclassified/correction/duplicates อย่างไร? | Clinical vocabulary และ denominator ที่อนุมัติ; Security/privacy ทบทวนการเปิดเผยยอดแยก | NOT PROVIDED / OPEN |
| CL-05 / D07-D09-D12 — Illness duration | นับจากเหตุการณ์ใด; reported หรือ clinically verified; ใช้หน่วย/as-of/correction ใด? | Clinical/data owner ระบุ source, date, unit, correction และ requiredness | NOT PROVIDED / OPEN |
| CL-06 / D06-D07-D09-D12 — PAM/PROMs | instrument/version ใด; ใครเป็นเจ้าของ scoring/range/interpretation; ใช้ช่วงใดและผูก Program อย่างไร? | Clinical authority อนุมัติ instrument/scoring/version/reassessment และตัวอย่าง synthetic | NOT PROVIDED / OPEN |
| CL-07 / D06-D07-D09-D12 — Weekly exercise | ต้องการ self-report หรือ observed; สัปดาห์หมายถึงช่วงใด; รวม entries/link Program/review/privacy อย่างไร? | Data/clinical authority ระบุ actor, period, linkage, inclusion และ privacy approver ยืนยัน reuse/access | NOT PROVIDED / OPEN |
| BR-04 / D09 — Achievement | วันทำได้หมายถึงอะไร; period, numerator/denominator, PARTIAL/NA/zero/null, rate/rounding/revision และ >70 boundary เป็นอย่างไร? | Clinical/data-approved formula or factual measure contract, version, test vectors; customer อนุมัติ label/threshold | NOT PROVIDED / OPEN |
| BR-05/06/07 / D10/D12 — Outcome / adjustment / obstacle | Controlled vocabulary มีใครบ้างเป็น owner; outcome, decision to adjust, applied Plan และ obstacle แยกกันอย่างไร? | Clinical/operations approved vocabulary and event semantics, linkage, actors, timing, correction | NOT PROVIDED / OPEN |

ห้ามเลือกสูตร BMI/CVD/PAM/PROMs/achievement, mapping RISK เป็น Pre-DM, คัดลอก HbA1c Before เป็น After หรือแปลง free text เป็น outcome ในที่ประชุมโดยไม่มี authority และหลักฐานตามรายการ.

## 5. Security / privacy dependencies แยกจาก sign-off นี้

การตัดสิน business meaning ในแบบฟอร์มด้านบนไม่อนุมัติการเปิดเผยข้อมูล. ส่งรายการต่อไปนี้ให้ผู้มีอำนาจตาม [RPT-24 / RPT-24C](./PHASE_17_RPT24_ON_DEMAND_ASOF_EXCEL_EXPORT_CONTRACT.md) แยกต่างหาก:

| Gate | สิ่งที่ Security/privacy/Architecture ต้องตรวจ | สถานะ |
| --- | --- | --- |
| Actor/capability and exact Hospital scope | ผู้ขอ export, capability, exact Hospital และการปฏิเสธ parent/child หรือ cross-Hospital access | OPEN |
| Field disclosure | Patient/OSM identity, clinical field allowlist, aggregate/small-count disclosure และ missing/withheld wording | OPEN |
| Consistent snapshot | ทั้งสอง worksheets, counts, pagination และ related records ต้องอิง approved snapshot boundary เดียวกัน | OPEN |
| Revocation and audit | การเพิกถอนสิทธิ์ระหว่าง request, audit evidence, access denial/failure behavior | OPEN |
| Delivery controls | File handling, lifetime/download policy, resource bounds และ delivery failure | OPEN |
| Hospital Network | HN-M08 Network Export remains DEFERRED / NOT AUTHORIZED; parent ownership ไม่ให้ Patient access | DEFERRED / NOT AUTHORIZED |

ไม่มีรายการใดในตารางนี้ได้รับอนุมัติจากการเตรียมเอกสาร. การ review ต้องใช้ RPT-24C gate และ authority ของตน.

## 6. แบบฟอร์มบันทึกผลจริง — หนึ่งชุดต่อ Decision ID

คัดลอกแบบฟอร์มนี้ต่อหนึ่ง decision และเก็บ prior answer/version ไว้ ห้ามเติมชื่อหรือหลักฐานแทนผู้อนุมัติ. ช่องว่างด้านล่างหมายถึงยังไม่มีข้อมูล ไม่ใช่การยอมรับ option.

| Field | บันทึก |
| --- | --- |
| Existing Decision ID (R24A-D01–D15) | NOT PROVIDED |
| Chosen option | NOT PROVIDED |
| Exact approved wording | NOT PROVIDED |
| Approver name / role / authority basis | NOT PROVIDED |
| Approval date | NOT PROVIDED |
| Evidence URL or reference | NOT PROVIDED |
| Approval scope / exclusions | NOT PROVIDED |
| Version / effective date | NOT PROVIDED |
| Conditions / unresolved parts | NOT PROVIDED |
| Dependencies / related Decision IDs | NOT PROVIDED |
| Resulting status (OPEN / PROPOSED / PARTIALLY_CONFIRMED / OWNER_RECEIVED / ACCEPTED / DEFERRED / BLOCKED) | OPEN |
| Canonical RPT-24A update owner and date, if later authorized | NOT PROVIDED |

หากมีคำตอบใหม่แต่หลักฐานหรือ authority ยังไม่ครบ ให้บันทึกว่า RECEIVED พร้อมรายละเอียดและคง OPEN/OWNER_RECEIVED/PARTIALLY_CONFIRMED; อย่าแก้ย้อนหลังให้ดูเหมือน approved ตั้งแต่ต้น. หาก authority ไม่ตรงกันให้ BLOCKED และบันทึกข้อขัดแย้งกับผู้ที่ต้องช่วยตัดสิน.

## 7. Review disposition

- เอกสารพร้อมใช้ประชุมและเก็บหลักฐาน: **YES — DECISION REVIEW READY**.
- ลูกค้าหรือ Clinical authority ได้ตอบ/อนุมัติจากเอกสารนี้แล้ว: **NO — NOT PROVIDED**.
- R24A-D01–D15: คง PROPOSED ตาม canonical RPT-24A จนกว่าจะมี approval evidence จริง.
- BR-01–BR-08 / CL-01–CL-07: ยัง OPEN; ไม่มีสูตรหรือ clinical rule ใดได้รับอนุมัติ.
- RPT-24C export/security/privacy gates: ยังคง OPEN; HN-M08 ยังคง DEFERRED / NOT AUTHORIZED.
- ขั้นถัดไปหลังได้คำตอบ: รวบรวม evidence, ตรวจ authority และ scope, update canonical decision register ผ่าน review ที่ได้รับอนุมัติ แล้วประเมิน Phase 18C.2. ไม่เริ่ม implementation โดยอัตโนมัติ.
