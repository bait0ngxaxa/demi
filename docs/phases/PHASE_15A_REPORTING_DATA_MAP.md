# Phase 15A — Reporting Data Map

- **Status:** ANALYSIS COMPLETE — REPORTING MAP ONLY
- **Primary input:** docs/Dashboard App Demi.xlsx
- **Purpose:** Map the actual customer workbook's report fields to business concepts, current rewrite sources, legacy evidence, and unresolved semantics.
- **Non-goal:** This document does not turn the workbook's wide layout into a Prisma schema, fixed round columns, a clinical calculation engine, a dashboard query, or an export implementation.

## 1. Reading rules

The workbook is the strongest current customer evidence for report intent, but it is a blank formatted template. A label establishes that a report consumer expects to see a concept; it does not establish:

- database ownership;
- requiredness;
- clinical meaning;
- units or context;
- calculation formula;
- authority or correction policy;
- actor visibility;
- whether the value is entered, imported, or derived.

The source classifications used here are CUSTOMER WORKBOOK, ACCEPTED CURRENT REQUIREMENT / ARCHITECTURE, CURRENT REWRITE IMPLEMENTATION, LEGACY BEHAVIOR, ENGINEERING RECOMMENDATION, and OPEN REQUIREMENT.

Field status values are IMPLEMENTED — REUSE, IMPLEMENTED — VERIFY SEMANTICS, IMPLEMENTED — EXTEND, NEW — REQUIRED, DERIVED — DO NOT STORE BLINDLY, REPORT PROJECTION ONLY, LEGACY-ALIGNED SAFE DEFAULT, DECISION REQUIRED, and DEFERRED. `DECISION REQUIRED` means that a detail is unresolved; it is not shorthand for blocking all future implementation. Scoped decision-impact labels used below are `BLOCKS_PROGRAM_FOUNDATION`, `BLOCKS_SPECIFIC_FEATURE`, `BLOCKS_FINAL_REPORTING`, `CAN_USE_SAFE_PROTOTYPE_DEFAULT`, and `CAN_DEFER`.

### Canonical field classifications

The field tables use a compact Raw/derived column. Every meaningful workbook field has one primary classification from the requested set:

| Table wording | Canonical classification |
| --- | --- |
| SOURCE DATA, SOURCE/ORDER, SOURCE/PROJECTION, SOURCE DATA / UNKNOWN | SOURCE DATA, or UNKNOWN / REQUIRES CONFIRMATION when the source itself is not selected |
| DERIVED, DERIVED REPORT COUNT, DERIVED/IMPORTED CLINICAL VALUE, MEASUREMENT/DERIVED | DERIVED DATA when the report value is calculated or aggregated; the imported/source part remains unresolved |
| ACTIVITY COMPLETION, COMPLETION + ARTIFACT | ACTIVITY COMPLETION |
| PROGRAM STATE | PROGRAM STATE |
| ASSESSMENT, ASSESSMENT/DERIVED, ASSESSMENT/PROJECTION | ASSESSMENT |
| MEASUREMENT | MEASUREMENT |
| REPORT GROUP, REPORT PRESENTATION, REPORT CONTEXT, PRESENTATION, REPORT GROUP/PROJECTION | REPORT-ONLY PROJECTION |
| GOAL DATA, GOAL TARGET | SOURCE DATA for the selected Goal Plan target; its report presence is a REPORT-ONLY PROJECTION |
| OUTCOME | ASSESSMENT unless the customer confirms it is a program-state code |

When a table cell combines a source value and a report projection, the table records both the business concept and its primary classification; it does not imply two persisted fields.

The blocking scope is defined by P15A-D01 through P15A-D21 in the business-flow
document. In particular, report-only uncertainty does not block Program or
Service 1 persistence, and a clinical calculation uncertainty blocks that
calculation and its official report projection only. A field may therefore
remain `DECISION REQUIRED` in this map while an unrelated implementation slice
proceeds.

## 2. Workbook sheet inventory

The actual XLSX package contains:

| Sheet | Worksheet part | Dimension | Layout observations | Report intent |
| --- | --- | --- | --- | --- |
| Dashboard ภาพรวม | xl/worksheets/sheet1.xml | A1:AQ29 | 51 merged ranges, styled blank report rows, no sample records, no formulas, no encoded data-validation rules | Overall/outcome dashboard-style projection |
| รายงานการจัดบริการ | xl/worksheets/sheet2.xml | A1:BM37 | 62 merged ranges, styled blank report rows, no sample records, no formulas, no encoded data-validation rules | Service delivery/process completeness projection |

The workbook has no comments/notes part. The service-sheet หมายเหตุ block is literal cell text, not a spreadsheet formula or external annotation.

## 3. Report purpose

### 3.1 Dashboard ภาพรวม

This sheet is an overall/outcome projection:

~~~text
Hospital/site
  → DM and Pre-DM case counts
  → Patient/context identifiers
  → BEFORE program assessment and measurements
  → during-program rounds 1–6
  → AFTER program assessment and measurements
~~~

It lets a reader compare starting state, progress rounds, and end state across a Patient list. It does not describe whether a value is entered or calculated.

### 3.2 รายงานการจัดบริการ

This sheet is a service-process report. Its final note states:

~~~text
รายงานนี้ แสดงภาพรวมความครบถ้วนการจัดบริการเท่านั้น หากต้องการทราบรายละเอียด ก็ให้ไปดูในการบันทึกรายบุคคล
~~~

The report therefore projects service/activity presence and selected BEFORE/AFTER/follow-up summary values. It is not the detailed source record.

## 4. Overall report field map — Dashboard ภาพรวม

### 4.1 Report context and cohort counts

| Cell/group | Workbook field | Source business concept | Current rewrite source | Legacy source | Raw/derived | Requiredness evidence | Status | Unresolved semantics / notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A1 | รพ.สต.......................... | Reporting Hospital/site | PatientHospitalRelationship.hospital and scoped directory | Legacy Hospital context and broad lists | SOURCE DATA / REPORT CONTEXT | Header only | REPORT PROJECTION ONLY | Confirm report scope and Hospital selector authority |
| A2/C2 | จำนวนเคส; เบาหวาน...................ราย | DM case count | No classification/count query | Legacy statistics/reporting incomplete; profile terms exist | DERIVED REPORT COUNT | Header only | BLOCKS_SPECIFIC_FEATURE / BLOCKS_FINAL_REPORTING | P15A-D02: cohort classification and official count only; do not derive from legacy Screening thresholds |
| C3 | กลุ่มเสี่ยง(Pre-DM)…...................ราย | Pre-DM case count | No classification field | Legacy terms are behavioral evidence only | DERIVED REPORT COUNT | Header only | BLOCKS_SPECIFIC_FEATURE / BLOCKS_FINAL_REPORTING | P15A-D02: cohort classification and official count only; do not derive from legacy Screening thresholds |

### 4.2 Patient and caregiver context

| Cells | Workbook field | Source business concept | Current rewrite source | Legacy source | Raw/derived | Requiredness evidence | Status | Unresolved semantics / notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A4/A5 | ลำดับ | Report row order | Query ordering/pagination | Legacy export row index | DERIVED PRESENTATION | Column exists | REPORT PROJECTION ONLY | Not stable identity and not clinical data |
| B4/B5 | รายชื่อ; ชื่อ; สกุล | Patient display name | Person/PatientProfile through relationship | Legacy profile name | SOURCE DATA | Column exists | IMPLEMENTED — REUSE | Exact relationship scope controls visibility |
| C4/C5 | ID | Customer-facing Patient/program identifier | Opaque relationship ID and Hospital-local HN exist; display choice not selected | Legacy global/user/profile ID | SOURCE DATA / UNKNOWN | Column exists | CAN_DEFER / BLOCKS_FINAL_REPORTING | P15A-D01: use opaque relationship/Program identity internally; display choice remains open |
| D4 | ระยะเวลาการเจ็บป่วย | Illness duration | No current field | Legacy source not confirmed | SOURCE DATA | Column exists | CAN_DEFER / BLOCKS_FINAL_REPORTING | P15A-D03: source, unit, and reference date must be confirmed before official projection |
| E4 | อสม.ที่ดูแล | OSM/caregiver context | Active and historical PatientOsmAssignment | Legacy caregiver/operator context broad | SOURCE DATA / PROJECTION | Column exists | CAN_DEFER / BLOCKS_FINAL_REPORTING | P15A-D05: current exact assignment authorization remains; report projection is open |

### 4.3 BEFORE group

| Cells | Workbook field | Source business concept | Current rewrite source | Legacy source | Raw/derived | Requiredness evidence | Status | Unresolved semantics / notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| F4/F5 | ข้อมูลเริ่มต้น(Before) | Initial program state | Dedicated Baseline plus Screening candidate | Legacy Baseline as Follow-up round 0 | REPORT GROUP | Group heading only | IMPLEMENTED — EXTEND | Need authoritative initial event; do not equate to legacy round 0 |
| G5 | วันที่เริ่มโปรแกรม | Program start date | No field/event | No reliable program episode start | PROGRAM STATE | Column exists | BLOCKS_PROGRAM_FOUNDATION | P15A-D04: minimum episode start contract; exact backdating policy may remain separate |
| H5 | CVD risk score | Cardiovascular risk result | No field/formula | Terminology but no approved formula | DERIVED/IMPORTED CLINICAL VALUE | No formula | BLOCKS_SPECIFIC_FEATURE / BLOCKS_FINAL_REPORTING | P15A-D09: no official calculation or value until formula/version/source/visibility are approved |
| I5 | HbA1C | HbA1c measurement | No field | Legacy terminology only | MEASUREMENT | No unit/context | BLOCKS_SPECIFIC_FEATURE / BLOCKS_FINAL_REPORTING | P15A-D10: HbA1c remains unimplemented until field/unit/date/source/visibility are confirmed |
| J5 | DTX | DTX/blood glucose measurement | Baseline bloodSugarDtx; Follow-up bloodSugar | blood_sugar_dtx; DTX/mg% UI label | MEASUREMENT | No context | IMPLEMENTED — VERIFY SEMANTICS | Unit and measurement context provisional |
| K5 | BW. | Body weight | Baseline and Follow-up weight | Legacy weight | MEASUREMENT | No unit | IMPLEMENTED — VERIFY SEMANTICS | Confirm source/unit |
| L5 | BMI | Body-mass index | No field/formula | Legacy display/visual terminology | DERIVED | No formula | DERIVED — DO NOT STORE BLINDLY | Requires approved height/weight observations |
| M5 | ส่วนสูง | Height | No field | Legacy profile/detail terminology; not audited Follow-up input | MEASUREMENT | No unit | BLOCKS_SPECIFIC_FEATURE | P15A-D11: confirm source/unit/date before using it for official BMI or report output |
| N5 | รอบเอว | Waist circumference | Baseline and Follow-up waist | Legacy waist circumference | MEASUREMENT | No unit | IMPLEMENTED — VERIFY SEMANTICS | Confirm unit/timing |
| O5/P7 | BP; ตัวบน; ตัวล่าง | Blood pressure systolic/diastolic | Baseline and Follow-up systolic/diastolic | Legacy sys/dia and mmHg UI label | MEASUREMENT | Group fields present | IMPLEMENTED — VERIFY SEMANTICS | Confirm unit/context/validation |

### 4.4 During-program rounds

| Cells | Workbook field | Source business concept | Current rewrite source | Legacy source | Raw/derived | Requiredness evidence | Status | Unresolved semantics / notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Q4:AH4 | ระหว่างอยู่ในโปรแกรม | Repeated program observations | No program entity; normalized Follow-up history | Legacy Follow-up rounds | REPORT GROUP | Group heading only | IMPLEMENTED — EXTEND | Project normalized history |
| Q5:AG5 | Round labels 1–6 | Visible report positions | PatientFollowup.roundNumber | Legacy followup_round | REPORT PRESENTATION | Six visible positions only | REPORT PROJECTION ONLY | Workbook note allows more actual Follow-ups |
| Q6/Q7 per round | DTX | Round blood glucose | Follow-up bloodSugar | Legacy blood_sugar_dtx | MEASUREMENT | Column exists | IMPLEMENTED — VERIFY SEMANTICS | Confirm context/unit |
| R6/R7 per round | BW | Round weight | Follow-up weight | Legacy weight | MEASUREMENT | Column exists | IMPLEMENTED — VERIFY SEMANTICS | Confirm whether every round requires it |
| S6/S7 per round | Achieve score | Achievement rate/score | No field/formula | No official legacy rate | DERIVED | Label only | BLOCKS_SPECIFIC_FEATURE / BLOCKS_FINAL_REPORTING | P15A-D13/D14: keep source progress data, but do not persist or report an official rate/counter |

### 4.5 AFTER group

| Cells | Workbook field | Source business concept | Current rewrite source | Legacy source | Raw/derived | Requiredness evidence | Status | Unresolved semantics / notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| AI5 | วันที่สิ้นสุดโปรแกรม | Program end/completion date | No field/event | No reliable completion event | PROGRAM STATE | Column exists | BLOCKS_PROGRAM_FOUNDATION / BLOCKS_FINAL_REPORTING | P15A-D04: minimum completion contract is foundational; official report timing remains open |
| AJ5 | CVD risk score | Final CVD risk | No field/formula | No approved formula | DERIVED/IMPORTED CLINICAL VALUE | No formula | BLOCKS_SPECIFIC_FEATURE / BLOCKS_FINAL_REPORTING | P15A-D09: same formula/source issue as BEFORE |
| AK5 | HbA1C | Final HbA1c | No field | Terminology only | MEASUREMENT | No unit/context | BLOCKS_SPECIFIC_FEATURE / BLOCKS_FINAL_REPORTING | P15A-D10: final source/date/visibility remain open |
| AL5 | DTX | Final DTX | Follow-up/Baseline DTX-like fields | Legacy blood sugar DTX | MEASUREMENT | No context | IMPLEMENTED — VERIFY SEMANTICS | Final timing/authority open |
| AM5 | BW. | Final weight | Follow-up/Baseline weight | Legacy weight | MEASUREMENT | No unit | IMPLEMENTED — VERIFY SEMANTICS | Final timing/authority open |
| AN5 | BMI | Final BMI | No field/formula | Display terminology only | DERIVED | No formula | DERIVED — DO NOT STORE BLINDLY | Approve calculation |
| AO5 | รอบเอว | Final waist | Follow-up/Baseline waist | Legacy waist | MEASUREMENT | No unit | IMPLEMENTED — VERIFY SEMANTICS | Final timing/authority open |
| AP/AQ | BP; ตัวบน; ตัวล่าง | Final BP | Follow-up/Baseline BP | Legacy sys/dia | MEASUREMENT | Group fields present | IMPLEMENTED — VERIFY SEMANTICS | Final timing/authority open |

## 5. Service-process report field map — รายงานการจัดบริการ

### 5.1 Report and Patient context

| Cells | Workbook field | Source business concept | Current rewrite source | Legacy source | Raw/derived | Requiredness evidence | Status | Unresolved semantics / notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A1 | Service Process record | Service-process report title | No report module | Separate legacy workflows | PRESENTATION | Header | REPORT PROJECTION ONLY | Title does not create a domain entity |
| A2 | รพ.สต.......................... | Hospital/site | Relationship Hospital | Legacy Hospital context | REPORT CONTEXT | Header | REPORT PROJECTION ONLY | Scope/capability open |
| A3/C3 | จำนวนเคส; DM count | Cohort count | No classification/count query | Legacy terminology only | DERIVED COUNT | Header | BLOCKS_SPECIFIC_FEATURE / BLOCKS_FINAL_REPORTING | P15A-D02: classification source and official count only |
| C4 | Pre-DM count | Cohort count | No classification field | Legacy terminology only | DERIVED COUNT | Header | BLOCKS_SPECIFIC_FEATURE / BLOCKS_FINAL_REPORTING | P15A-D02: classification source and official count only |
| A5/A6 | ลำดับ; ชื่อ; สกุล | Display row/name | Person/Profile through relationship | Legacy profile name | SOURCE/ORDER | Columns exist | IMPLEMENTED — REUSE | Display remains policy-controlled |
| C5 | ID | Patient/program identifier | Relationship ID/HN candidates | Legacy user/profile ID | SOURCE UNKNOWN | Column exists | CAN_DEFER / BLOCKS_FINAL_REPORTING | Same P15A-D01; do not assume database primary key |
| D5 | ระยะเวลาการเจ็บป่วย | Illness duration | No field | Unconfirmed | SOURCE DATA | Column exists | CAN_DEFER / BLOCKS_FINAL_REPORTING | Same P15A-D03; source/unit/reference date open |
| E5 | อสม.ที่ดูแล | OSM/caregiver | Assignment history | Broad operator context | SOURCE/PROJECTION | Column exists | CAN_DEFER / BLOCKS_FINAL_REPORTING | Same P15A-D05; current versus episode-responsible OSM |
| F5 | วันที่เริ่มเข้าโปรแกรม | Program start | No event | No reliable start | PROGRAM STATE | Column exists | BLOCKS_PROGRAM_FOUNDATION | Same P15A-D04; minimum episode start contract |
| G5 | วันที่สิ้นสุด | Program end | No event | No reliable completion | PROGRAM STATE | Column exists | BLOCKS_PROGRAM_FOUNDATION / BLOCKS_FINAL_REPORTING | Same P15A-D04; minimum completion contract plus report timing |

### 5.2 BEFORE fields

| Cells | Workbook field | Source business concept | Current rewrite source | Legacy source | Raw/derived | Requiredness evidence | Status | Unresolved semantics / notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| H5/H6 | Before | Initial state group | Dedicated Baseline plus Screening | Legacy Baseline round 0 | REPORT GROUP | Group only | IMPLEMENTED — EXTEND | Need program-linked initial record |
| I6 | DTX | Initial DTX | Baseline DTX | Legacy DTX | MEASUREMENT | Column exists | IMPLEMENTED — VERIFY SEMANTICS | Unit/context/authority open |
| J6 | BW | Initial weight | Baseline weight | Legacy weight | MEASUREMENT | Column exists | IMPLEMENTED — VERIFY SEMANTICS | Unit/timing open |
| K6 | PAM score | Initial PAM result | Screening result JSON | Legacy PAM score/profile | ASSESSMENT/DERIVED | Column exists | IMPLEMENTED — VERIFY SEMANTICS | Questionnaire/scoring/visibility open |
| L6 | PROMs score | Initial PROMs result | Screening result JSON | Legacy PROMs score/profile | ASSESSMENT/DERIVED | Column exists | IMPLEMENTED — VERIFY SEMANTICS | Questionnaire/scoring/visibility open |
| M6 | คะแนนไม้บรรทัดวัดใจ | Initial confidence | Screening/Baseline confidence | Legacy 0–10 confidence | ASSESSMENT | Column exists | LEGACY-ALIGNED SAFE DEFAULT | P15A-D06: current 0–10 structure is provisional; final equivalence/requiredness remains open |
| N6 | เวลาออกกำลังกาย/สัปดาห์ | Initial weekly exercise time | Goal target value/unit is available, not observed time | Legacy targets/records inconsistent | MEASUREMENT/SOURCE | Column exists | NEW — REQUIRED | Confirm self-report, target, or observation |

### 5.3 AFTER fields

| Cells | Workbook field | Source business concept | Current rewrite source | Legacy source | Raw/derived | Requiredness evidence | Status | Unresolved semantics / notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| O5/O6 | After | Final state group | No final assessment | Latest Follow-up informal equivalent | REPORT GROUP | Group only | BLOCKS_SPECIFIC_FEATURE / BLOCKS_FINAL_REPORTING | P15A-D12: define final record/timing before official comparison |
| P6 | DTX | Final DTX | Follow-up/Baseline DTX-like field | Legacy DTX | MEASUREMENT | Column exists | IMPLEMENTED — EXTEND | Final timing/context open |
| Q6 | BW | Final weight | Follow-up weight | Legacy weight | MEASUREMENT | Column exists | IMPLEMENTED — EXTEND | Final timing/context open |
| R6 | เวลาออกกำลังกาย/สัปดาห์ | Final weekly exercise time | No observed weekly-time field | Legacy exercise minutes not confirmed as this value | MEASUREMENT/DERIVED | Column exists | NEW — REQUIRED | Confirm source/aggregation |
| S6 | จำนวนครั้งที่อัตราความสำเร็จตามเป้าหมาย>70% | Count of rates over 70% | No field/formula | No structured equivalent | DERIVED | Column exists | BLOCKS_SPECIFIC_FEATURE / BLOCKS_FINAL_REPORTING | P15A-D14: define counted unit, denominator, and aggregation |

### 5.4 Service 1 — Know Yourself

The group heading is บริการครั้งที่ 1: รู้จักตัวเอง. Each activity has a completion pair at row 8.

| Visible activity | Workbook labels | Source business concept | Current rewrite source | Legacy source | Raw/derived | Status | Unresolved semantics |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Floating/sinking chart | กราฟวัดลอยจม; ทำ/ไม่ทำ | Activity completion plus artifact | No dedicated owner; relationship Evidence only | Image plus floating_chart_summary | COMPLETION + ARTIFACT | LEGACY-ALIGNED SAFE DEFAULT | P15A-D07: provisional optional image + summary; P15A-D08 blocks only the explicit artifact association/owner |
| Dream card | การ์ดความฝัน; ทำ/ไม่ทำ | Activity completion plus artifact | No dedicated owner | Image plus dream_card_description | COMPLETION + ARTIFACT | LEGACY-ALIGNED SAFE DEFAULT | P15A-D07: provisional optional image + description; P15A-D08 blocks only the explicit artifact association/owner |
| Routine schedule | ตารางกิจวัตร; ทำ/ไม่ทำ | Activity completion plus artifact | No dedicated owner; relationship Evidence only | Image-only life_schedule_image_url | COMPLETION + ARTIFACT | LEGACY-ALIGNED SAFE DEFAULT | P15A-D07: provisional optional image artifact; P15A-D08 blocks only the explicit artifact association/owner |

The visible pairs do not prove that the persistence model should store a boolean for each column. The underlying activity/event should be the source, with the report pair derived after requiredness is approved.

### 5.5 Service 2 — Health Plan / Small Goals

The group heading is บริการครั้งที่ 2 : ทำแผนสุขภาพ เป้าหมายเล็กๆที่ตั้งไว้.

| Cells/row | Workbook field | Source business concept | Current rewrite source | Legacy source | Raw/derived | Status | Unresolved semantics |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Y6/Z8 | เป้าหมายอาหาร; มี/ไม่มี | Food-goal presence | Generic Goal Plan items | Food status/activity codes | ACTIVITY COMPLETION | IMPLEMENTED — EXTEND | Whether no food goal is valid |
| Y7 | การลดมื้ออาหาร | Food quantity/frequency goal | Generic activity code/target | Food amount status | GOAL DATA | BLOCKS_SPECIFIC_FEATURE (Service 2 only) | Quantity versus frequency meaning remains open; does not block Program or Service 1 |
| AA6/AB8 | การเปลี่ยนอาหาร; มี/ไม่มี | Food type/change goal | Generic Goal Plan item | Food type status | ACTIVITY COMPLETION | IMPLEMENTED — EXTEND | Canonical code/target |
| AC7 | จำนวนมื้อ/สัปดาห์ | Weekly meal target/value | Goal target value/unit candidate | Legacy target fields, no confirmed mapping | GOAL TARGET | BLOCKS_SPECIFIC_FEATURE (Service 2 only) | Target versus observed; period/unit remains open |
| AD6/AE8 | เป้าหมายออกกำลัง; มี/ไม่มี | Exercise-goal presence | Generic exercise Goal item | Movement/exercise status | ACTIVITY COMPLETION | IMPLEMENTED — EXTEND | Allowed activity set |
| AD7 | มีการตั้งเป้า | Exercise target exists | Goal item presence | Legacy target value/unit | GOAL DATA | IMPLEMENTED — EXTEND | Exact meaning of “has target” |
| AF7 | จำนวนวัน/สัปดาห์ | Exercise target days | PatientGoalItem.targetDays | Legacy target_days | GOAL TARGET | BLOCKS_SPECIFIC_FEATURE (Service 2/achievement only) | Weekly period/denominator confirmation |
| AG7 | รวมเวลา/สัปดาห์ | Exercise weekly time | targetValue/targetUnit candidate | Legacy exercise minute targets | GOAL TARGET | BLOCKS_SPECIFIC_FEATURE (Service 2 only) | Target versus calculated observation remains open |

### 5.6 Service 3 through Service 6 — Behavioral Follow-up

The workbook labels Service 3 as บริการครั้งที่ 3 : ติดตามการฝึกซ้อมพฤติกรรม and repeats the same group shape for visible services 4, 5, and 6.

| Group field | Thai label | Source business concept | Current rewrite source | Legacy source | Raw/derived | Status | Unresolved semantics |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Date | วันที่ติดตาม | Dated Follow-up event | PatientFollowup.recordedAt and optional Appointment | Editable legacy followup_date | SOURCE DATA | IMPLEMENTED — EXTEND | Occurrence date/backdating |
| Count | จำนวนวันที่ทำได้ | Achieved days/count | No field | No structured equivalent | SOURCE/DERIVED | BLOCKS_SPECIFIC_FEATURE / BLOCKS_FINAL_REPORTING | P15A-D13: numerator and period; source capture may proceed without official rate |
| Rate | อัตราความสำเร็จตามเป้า | Achievement rate | No field/formula | Legacy ratios differ | DERIVED | BLOCKS_SPECIFIC_FEATURE / BLOCKS_FINAL_REPORTING | P15A-D13: formula, zero target, missing observations |
| Outcome | ผลลัพธ์ที่ได้ | Controlled outcome phrase/code | No field | Free text/status/auto-summary | OUTCOME | BLOCKS_SPECIFIC_FEATURE / BLOCKS_FINAL_REPORTING | P15A-D15: controlled vocabulary/version; narrative remains possible provisionally |
| Plan adjustment | ปรับแผนใหม่; ปรับ/ไม่ปรับ | Goal Plan adjustment decision | No field; Plans immutable | Goals can archive/replace; no Follow-up flag | PROGRAM EVENT | BLOCKS_SPECIFIC_FEATURE (Goal Plan adjustment only) | P15A-D16: relation to a new Goal Plan; do not infer mutation from a boolean |
| Obstacle | มีอุปสรรค; มี/ไม่มี | Obstacle presence | Notes only | Adaptation obstacle text | ASSESSMENT/PROJECTION | IMPLEMENTED — EXTEND | Boolean versus detail/owner |

The report has fixed visible columns, while the note at rows 35–37 says to record as many Follow-ups as occur and expects approximately 2–4 per program. The business concept is repeated Follow-up collection, not six fixed database records.

## 6. Workbook notes and semantic evidence

| Location | Literal note/label | Interpretation | Classification |
| --- | --- | --- | --- |
| Rows 31–32 | อัตราความสำเร็จตามเป้า = Achieve score; = จำนวนครั้งที่ได้ทำตามเป้าหมาย : จำนวนครั้งที่ตั้งเป้าหมาย/สัปดาห์ | Conceptual achieved-count to target-count relationship | CUSTOMER WORKBOOK; DERIVED DATA |
| Row 33 | ผลลัพธ์ที่ได้ = ดึงมาจาก "ประโยค/วลี" ที่บันทึกไว้ในโปรแกรม(ทำเป็น Drop down list อยู่แล้ว) | Outcome comes from a controlled application phrase list | CUSTOMER WORKBOOK; vocabulary open |
| Row 34 | อุปสรรค ลงบันทึกแค่ว่า มีหรือไม่มี | Report needs obstacle presence, not necessarily detail | CUSTOMER WORKBOOK; requiredness/detail open |
| Row 35 | ติดตามกี่ครั้งก็ลงไปตามนั้น คาดหวังว่า ติดตามประมาณ 2-4 ครั้ง/โปรแกรม | Follow-up count is variable; 2–4 is expectation, not maximum | CUSTOMER WORKBOOK |
| Row 37 | Report shows service completeness; details are in individual record | Wide report is a projection, not detailed source | CUSTOMER WORKBOOK |

The file itself has no Excel validation records. Row 33 can describe intended application behavior, but the actual phrase list must be supplied separately.

## 7. Raw versus derived

### 7.1 Source data, pending authority/semantics

The report wants values that may be captured or imported:

- Patient/program identifier;
- illness duration;
- OSM/caregiver;
- program start/end;
- DTX, weight, waist, BP, HbA1c, height;
- PAM/PROMs result values;
- confidence score;
- weekly exercise time;
- achieved days/count;
- outcome phrase/code;
- plan-adjusted and obstacle presence.

Source data means the report needs a value from somewhere. It does not mean the workbook proves that the value should be persisted exactly as displayed.

### 7.2 Derived values

The following appear to be derived or aggregated:

- DM/Pre-DM case counts;
- BMI;
- CVD risk score;
- Achieve score / achievement rate;
- count of rates greater than 70%;
- service completeness.

No formula should be implemented from a label alone. BMI and CVD risk require approved clinical formula/source contracts. Achievement requires the note's numerator/denominator concept to be expanded to period, missing data, zero denominator, rounding, and aggregation.

### 7.3 Activity completion

Service 1 and Service 2 pairs are report-level projections:

- ทำ / ไม่ทำ;
- มี / ไม่มี;
- ปรับ / ไม่ปรับ;
- มี / ไม่มี obstacle.

They do not prove that the database should store a separate boolean for every visible cell. The normalized activity/event should be the source, with report booleans derived after requiredness and semantics are accepted.

### 7.4 Program state and assessment

Program start/end/completion are program state, not measurements. PAM/PROMs, confidence, and outcome are assessments/outcome observations, not merely report labels. The report must not change state or authority by writing a visible cell.

## 8. Normalized persistence versus wide report projection

The six visible during-program rounds and repeated Service 3–6 groups are presentation decisions. The customer note explicitly permits as many Follow-ups as recorded. The rewrite already has normalized historical Follow-up records with a round number.

ENGINEERING RECOMMENDATION:

~~~text
Relationship-scoped source records
  → future bounded program episode
  → initial/final assessments and measurements
  → Service 1 activity records/artifacts
  → Goal Plan and activity targets
  → 0..N Follow-up records
  → report projection
~~~

This is a projection principle, not a request for a generic workflow engine, questionnaire engine, or clinical observation framework. The smallest future model should add only customer-proven concepts and preserve existing domain owners.

An accepted wide projection must answer:

- what appears in visible rounds 1–6;
- what happens to round 7+;
- whether a continuation sheet is used;
- whether aggregate fields summarize all rounds or only visible rounds;
- whether missing values are blank, not applicable, or incomplete;
- which actor may run/export the projection.

Until then, do not create round1 through round6 database fields or duplicate derived counters.

## 9. Cross-source deltas and contradictions

| Topic | Customer workbook | Legacy behavior | Current rewrite | Audit conclusion |
| --- | --- | --- | --- | --- |
| Follow-up count | Visible 3–6 groups, note says record as many as occur, expects 2–4 | History open-ended; count logic exists | Normalized rounds, unique per relationship/round | Keep normalized 0..N; six is projection |
| Achievement rate | Explicit name and conceptual count ratio | No official rate; records ratio differs | No rate field | Official implementation blocked |
| Outcome list | Note says application dropdown phrase list | Free text/status/auto-summary | No outcome field | Need controlled vocabulary |
| Service 1 | Completion pairs for three activities | Image/text pairs in Follow-up/Baseline | No dedicated owner; generic Evidence | Activity domain confirmed; ownership/content open |
| Program start/end | Explicit columns | No reliable episode | No program entity | Lifecycle gap plus decisions |
| BEFORE/AFTER | Explicit groups and dates | Latest Follow-up informal after | Dedicated Baseline only; no final | Need timing/authority |
| Units | Labels but no metadata/formulas | UI labels kg/cm/mmHg/DTX/mg% | Units provisional | Confirm, do not infer |
| CVD risk/BMI | Visible values | Terminology/visuals only | No fields/formulas | Formula decisions required |
| Authorization | No access policy in sheet | Broad legacy behavior | Exact relationship/assignment policy | Never infer report authority |
| Images | Service 1 completion | Image uploads for life/floating/dream | Relationship Evidence only | Event ownership/requiredness open |

## 10. Implementation handoff

The map supports future reuse of:

- relationship-scoped Patient, Hospital, OSM assignment, Screening, Goal Plan, Appointment, Follow-up, Baseline, and Evidence services;
- existing measurement/progress domains only after field semantics are approved;
- versioned calculation/service boundaries for report-derived values;
- workbook generation as a projection, not source of truth;
- private storage and server-side scope for activity artifacts;
- the existing audit boundary without clinical values.

The map does not authorize:

- fixed six-round schema;
- automatic DM/Pre-DM classification;
- BMI/CVD/achievement calculations;
- a generic clinical measurement framework;
- report access for any role;
- direct browser Supabase access or legacy URL storage;
- silent correction or mutable historical rewrites.

## 11. Open requirements and blocking scope

The detailed questions remain in
`PHASE_15A_BUSINESS_FLOW_CONSOLIDATION.md`. Their reporting-map impact is
scoped as follows; none of the report-only rows below authorize a report query,
export, or broader role capability.

| Decision(s) | Reporting-map impact | What may proceed |
| --- | --- | --- |
| P15A-D01, D03, D05 | `CAN_DEFER` for Program workflow; `BLOCKS_FINAL_REPORTING` for ID, illness-duration, and OSM projections | Program persistence and Service 1 can proceed with authoritative relationship/assignment identity and no official projection of the unresolved columns. |
| P15A-D02 | `BLOCKS_SPECIFIC_FEATURE` for cohort classification; `BLOCKS_FINAL_REPORTING` for DM/Pre-DM counts | Program and Service 1 can proceed without deriving classification from legacy Screening. |
| P15A-D04 | `BLOCKS_PROGRAM_FOUNDATION` | The minimum Program episode identity/cardinality/start/completion contract must be resolved in the 15B implementation slice. |
| P15A-D06, D07, D20 | `CAN_USE_SAFE_PROTOTYPE_DEFAULT` | Reversible 0–10 confidence and Service 1 image/text interaction structures may be used provisionally; final clinical/content meaning remains open. |
| P15A-D08 | `BLOCKS_SPECIFIC_FEATURE` for Service 1 artifact association/ownership | Program foundation and text/completion flow can proceed; use only a narrow relationship-scoped Evidence association, not a generic attachment model. |
| P15A-D09, D11 | `BLOCKS_SPECIFIC_FEATURE` and `BLOCKS_FINAL_REPORTING` for CVD/BMI | Other Program and Service 1 data can proceed without calculating or reporting these values. |
| P15A-D10 | Existing DTX capture is a provisional safe default; HbA1c and official measurement meaning are `BLOCKS_SPECIFIC_FEATURE` / `BLOCKS_FINAL_REPORTING` | Existing structural DTX fields can remain provisional; HbA1c and official units/context wait for the measurement contract. |
| P15A-D12 | `BLOCKS_PROGRAM_FOUNDATION` only for the minimum stage association; `BLOCKS_SPECIFIC_FEATURE` / `BLOCKS_FINAL_REPORTING` for exact final timing and comparison | 15B can establish the minimum initial-stage link; final/outcome timing and official comparison remain later-slice work. |
| P15A-D13–D15 | `BLOCKS_SPECIFIC_FEATURE` and `BLOCKS_FINAL_REPORTING` for achievement, aggregation, and official outcome values | Capture source follow-up progress and provisional narrative without calculating official rates or assigning an unapproved code. |
| P15A-D16 | `BLOCKS_SPECIFIC_FEATURE` for Goal Plan adjustment semantics | Program, Service 1, and existing immutable Goal Plan behavior can proceed; do not infer a new plan from a boolean. |
| P15A-D17, D21 | `CAN_DEFER` | Existing safe append-oriented behavior and a non-export workflow can proceed. |
| P15A-D18 | `BLOCKS_FINAL_REPORTING` | Current Patient/relationship authorization remains the workflow authority; reporting/export waits for an explicit capability contract. |
| P15A-D19 | `CAN_DEFER` for normalized Program/Follow-up persistence; `BLOCKS_FINAL_REPORTING` for exact Excel overflow presentation | Persist normalized 0..N Follow-ups and project visible rounds later; never model six fixed persistence fields. |

This separation is intentional: a field can remain unresolved in the report map
without blocking the next Program implementation slice.

## 12. Verification

- The actual workbook, not a prior summary, was inspected.
- Sheet names, dimensions, headings, merged layout, literal notes, and blank-template nature were checked.
- No formula cells or encoded data validations were found.
- Thai labels and notes are preserved as source text.
- Current rewrite model/source references were checked against prisma/schema.prisma and corresponding services/schemas/routes.
- Legacy fields cited here were verified in the pinned checkout at commit 7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e.
- Wide report columns were explicitly treated as projections, not persistence instructions.
- `git diff --check` for this correction — PASS.
- UTF-8/Thai mojibake inspection of both Phase 15A Markdown files — PASS; no replacement characters or corrupted Thai text were found.
- Documentation-only scope check — PASS; the working-tree diff contains only `PHASE_15A_BUSINESS_FLOW_CONSOLIDATION.md` and `PHASE_15A_REPORTING_DATA_MAP.md`.
- No documentation lint script was configured; no build or integration suite was run for this documentation-only correction.
