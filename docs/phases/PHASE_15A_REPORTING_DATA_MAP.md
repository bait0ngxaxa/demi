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

Field status values are IMPLEMENTED — REUSE, IMPLEMENTED — VERIFY SEMANTICS, IMPLEMENTED — EXTEND, NEW — REQUIRED, DERIVED — DO NOT STORE BLINDLY, REPORT PROJECTION ONLY, LEGACY-ALIGNED SAFE DEFAULT, DECISION REQUIRED, and DEFERRED.

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
| A2/C2 | จำนวนเคส; เบาหวาน...................ราย | DM case count | No classification/count query | Legacy statistics/reporting incomplete; profile terms exist | DERIVED REPORT COUNT | Header only | DECISION REQUIRED | Depends on approved DM source/rule |
| C3 | กลุ่มเสี่ยง(Pre-DM)…...................ราย | Pre-DM case count | No classification field | Legacy terms are behavioral evidence only | DERIVED REPORT COUNT | Header only | DECISION REQUIRED | Do not derive from legacy Screening thresholds |

### 4.2 Patient and caregiver context

| Cells | Workbook field | Source business concept | Current rewrite source | Legacy source | Raw/derived | Requiredness evidence | Status | Unresolved semantics / notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A4/A5 | ลำดับ | Report row order | Query ordering/pagination | Legacy export row index | DERIVED PRESENTATION | Column exists | REPORT PROJECTION ONLY | Not stable identity and not clinical data |
| B4/B5 | รายชื่อ; ชื่อ; สกุล | Patient display name | Person/PatientProfile through relationship | Legacy profile name | SOURCE DATA | Column exists | IMPLEMENTED — REUSE | Exact relationship scope controls visibility |
| C4/C5 | ID | Customer-facing Patient/program identifier | Opaque relationship ID and Hospital-local HN exist; display choice not selected | Legacy global/user/profile ID | SOURCE DATA / UNKNOWN | Column exists | DECISION REQUIRED | See P15A-D01; do not assume database primary key |
| D4 | ระยะเวลาการเจ็บป่วย | Illness duration | No current field | Legacy source not confirmed | SOURCE DATA | Column exists | NEW — REQUIRED | Source, unit, and reference date open |
| E4 | อสม.ที่ดูแล | OSM/caregiver context | Active and historical PatientOsmAssignment | Legacy caregiver/operator context broad | SOURCE DATA / PROJECTION | Column exists | DECISION REQUIRED | Current versus episode-responsible OSM |

### 4.3 BEFORE group

| Cells | Workbook field | Source business concept | Current rewrite source | Legacy source | Raw/derived | Requiredness evidence | Status | Unresolved semantics / notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| F4/F5 | ข้อมูลเริ่มต้น(Before) | Initial program state | Dedicated Baseline plus Screening candidate | Legacy Baseline as Follow-up round 0 | REPORT GROUP | Group heading only | IMPLEMENTED — EXTEND | Need authoritative initial event; do not equate to legacy round 0 |
| G5 | วันที่เริ่มโปรแกรม | Program start date | No field/event | No reliable program episode start | PROGRAM STATE | Column exists | DECISION REQUIRED | Start event/backdating open |
| H5 | CVD risk score | Cardiovascular risk result | No field/formula | Terminology but no approved formula | DERIVED/IMPORTED CLINICAL VALUE | No formula | DECISION REQUIRED | Formula/version/source/visibility required |
| I5 | HbA1C | HbA1c measurement | No field | Legacy terminology only | MEASUREMENT | No unit/context | NEW — REQUIRED | Confirm field, unit, date, source, visibility |
| J5 | DTX | DTX/blood glucose measurement | Baseline bloodSugarDtx; Follow-up bloodSugar | blood_sugar_dtx; DTX/mg% UI label | MEASUREMENT | No context | IMPLEMENTED — VERIFY SEMANTICS | Unit and measurement context provisional |
| K5 | BW. | Body weight | Baseline and Follow-up weight | Legacy weight | MEASUREMENT | No unit | IMPLEMENTED — VERIFY SEMANTICS | Confirm source/unit |
| L5 | BMI | Body-mass index | No field/formula | Legacy display/visual terminology | DERIVED | No formula | DERIVED — DO NOT STORE BLINDLY | Requires approved height/weight observations |
| M5 | ส่วนสูง | Height | No field | Legacy profile/detail terminology; not audited Follow-up input | MEASUREMENT | No unit | NEW — REQUIRED | Confirm source/unit/date |
| N5 | รอบเอว | Waist circumference | Baseline and Follow-up waist | Legacy waist circumference | MEASUREMENT | No unit | IMPLEMENTED — VERIFY SEMANTICS | Confirm unit/timing |
| O5/P7 | BP; ตัวบน; ตัวล่าง | Blood pressure systolic/diastolic | Baseline and Follow-up systolic/diastolic | Legacy sys/dia and mmHg UI label | MEASUREMENT | Group fields present | IMPLEMENTED — VERIFY SEMANTICS | Confirm unit/context/validation |

### 4.4 During-program rounds

| Cells | Workbook field | Source business concept | Current rewrite source | Legacy source | Raw/derived | Requiredness evidence | Status | Unresolved semantics / notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Q4:AH4 | ระหว่างอยู่ในโปรแกรม | Repeated program observations | No program entity; normalized Follow-up history | Legacy Follow-up rounds | REPORT GROUP | Group heading only | IMPLEMENTED — EXTEND | Project normalized history |
| Q5:AG5 | Round labels 1–6 | Visible report positions | PatientFollowup.roundNumber | Legacy followup_round | REPORT PRESENTATION | Six visible positions only | REPORT PROJECTION ONLY | Workbook note allows more actual Follow-ups |
| Q6/Q7 per round | DTX | Round blood glucose | Follow-up bloodSugar | Legacy blood_sugar_dtx | MEASUREMENT | Column exists | IMPLEMENTED — VERIFY SEMANTICS | Confirm context/unit |
| R6/R7 per round | BW | Round weight | Follow-up weight | Legacy weight | MEASUREMENT | Column exists | IMPLEMENTED — VERIFY SEMANTICS | Confirm whether every round requires it |
| S6/S7 per round | Achieve score | Achievement rate/score | No field/formula | No official legacy rate | DERIVED | Label only | DECISION REQUIRED | See P15A-D13/D14; do not persist blind counters |

### 4.5 AFTER group

| Cells | Workbook field | Source business concept | Current rewrite source | Legacy source | Raw/derived | Requiredness evidence | Status | Unresolved semantics / notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| AI5 | วันที่สิ้นสุดโปรแกรม | Program end/completion date | No field/event | No reliable completion event | PROGRAM STATE | Column exists | DECISION REQUIRED | Define end/completion |
| AJ5 | CVD risk score | Final CVD risk | No field/formula | No approved formula | DERIVED/IMPORTED CLINICAL VALUE | No formula | DECISION REQUIRED | Same formula/source issue as BEFORE |
| AK5 | HbA1C | Final HbA1c | No field | Terminology only | MEASUREMENT | No unit/context | NEW — REQUIRED | Final source/date/visibility open |
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
| A3/C3 | จำนวนเคส; DM count | Cohort count | No classification/count query | Legacy terminology only | DERIVED COUNT | Header | DECISION REQUIRED | Classification source required |
| C4 | Pre-DM count | Cohort count | No classification field | Legacy terminology only | DERIVED COUNT | Header | DECISION REQUIRED | Classification source required |
| A5/A6 | ลำดับ; ชื่อ; สกุล | Display row/name | Person/Profile through relationship | Legacy profile name | SOURCE/ORDER | Columns exist | IMPLEMENTED — REUSE | Display remains policy-controlled |
| C5 | ID | Patient/program identifier | Relationship ID/HN candidates | Legacy user/profile ID | SOURCE UNKNOWN | Column exists | DECISION REQUIRED | Same P15A-D01 |
| D5 | ระยะเวลาการเจ็บป่วย | Illness duration | No field | Unconfirmed | SOURCE DATA | Column exists | NEW — REQUIRED | Same P15A-D03 |
| E5 | อสม.ที่ดูแล | OSM/caregiver | Assignment history | Broad operator context | SOURCE/PROJECTION | Column exists | DECISION REQUIRED | Same P15A-D05 |
| F5 | วันที่เริ่มเข้าโปรแกรม | Program start | No event | No reliable start | PROGRAM STATE | Column exists | DECISION REQUIRED | Same P15A-D04 |
| G5 | วันที่สิ้นสุด | Program end | No event | No reliable completion | PROGRAM STATE | Column exists | DECISION REQUIRED | Same P15A-D04 |

### 5.2 BEFORE fields

| Cells | Workbook field | Source business concept | Current rewrite source | Legacy source | Raw/derived | Requiredness evidence | Status | Unresolved semantics / notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| H5/H6 | Before | Initial state group | Dedicated Baseline plus Screening | Legacy Baseline round 0 | REPORT GROUP | Group only | IMPLEMENTED — EXTEND | Need program-linked initial record |
| I6 | DTX | Initial DTX | Baseline DTX | Legacy DTX | MEASUREMENT | Column exists | IMPLEMENTED — VERIFY SEMANTICS | Unit/context/authority open |
| J6 | BW | Initial weight | Baseline weight | Legacy weight | MEASUREMENT | Column exists | IMPLEMENTED — VERIFY SEMANTICS | Unit/timing open |
| K6 | PAM score | Initial PAM result | Screening result JSON | Legacy PAM score/profile | ASSESSMENT/DERIVED | Column exists | IMPLEMENTED — VERIFY SEMANTICS | Questionnaire/scoring/visibility open |
| L6 | PROMs score | Initial PROMs result | Screening result JSON | Legacy PROMs score/profile | ASSESSMENT/DERIVED | Column exists | IMPLEMENTED — VERIFY SEMANTICS | Questionnaire/scoring/visibility open |
| M6 | คะแนนไม้บรรทัดวัดใจ | Initial confidence | Screening/Baseline confidence | Legacy 0–10 confidence | ASSESSMENT | Column exists | IMPLEMENTED — EXTEND | Equivalence/requiredness open |
| N6 | เวลาออกกำลังกาย/สัปดาห์ | Initial weekly exercise time | Goal target value/unit is available, not observed time | Legacy targets/records inconsistent | MEASUREMENT/SOURCE | Column exists | NEW — REQUIRED | Confirm self-report, target, or observation |

### 5.3 AFTER fields

| Cells | Workbook field | Source business concept | Current rewrite source | Legacy source | Raw/derived | Requiredness evidence | Status | Unresolved semantics / notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| O5/O6 | After | Final state group | No final assessment | Latest Follow-up informal equivalent | REPORT GROUP | Group only | NEW — REQUIRED | Define final record |
| P6 | DTX | Final DTX | Follow-up/Baseline DTX-like field | Legacy DTX | MEASUREMENT | Column exists | IMPLEMENTED — EXTEND | Final timing/context open |
| Q6 | BW | Final weight | Follow-up weight | Legacy weight | MEASUREMENT | Column exists | IMPLEMENTED — EXTEND | Final timing/context open |
| R6 | เวลาออกกำลังกาย/สัปดาห์ | Final weekly exercise time | No observed weekly-time field | Legacy exercise minutes not confirmed as this value | MEASUREMENT/DERIVED | Column exists | NEW — REQUIRED | Confirm source/aggregation |
| S6 | จำนวนครั้งที่อัตราความสำเร็จตามเป้าหมาย>70% | Count of rates over 70% | No field/formula | No structured equivalent | DERIVED | Column exists | DECISION REQUIRED | Define counted unit/denominator |

### 5.4 Service 1 — Know Yourself

The group heading is บริการครั้งที่ 1: รู้จักตัวเอง. Each activity has a completion pair at row 8.

| Visible activity | Workbook labels | Source business concept | Current rewrite source | Legacy source | Raw/derived | Status | Unresolved semantics |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Floating/sinking chart | กราฟวัดลอยจม; ทำ/ไม่ทำ | Activity completion plus artifact | No dedicated owner; relationship Evidence only | Image plus floating_chart_summary | COMPLETION + ARTIFACT | DECISION REQUIRED | Minimum content, image/text requirement, owner |
| Dream card | การ์ดความฝัน; ทำ/ไม่ทำ | Activity completion plus artifact | No dedicated owner | Image plus dream_card_description | COMPLETION + ARTIFACT | DECISION REQUIRED | Minimum content, image/text requirement, owner |
| Routine schedule | ตารางกิจวัตร; ทำ/ไม่ทำ | Activity completion plus artifact | No dedicated owner | Image-only life_schedule_image_url | COMPLETION + ARTIFACT | DECISION REQUIRED | Structured versus image/text content |

The visible pairs do not prove that the persistence model should store a boolean for each column. The underlying activity/event should be the source, with the report pair derived after requiredness is approved.

### 5.5 Service 2 — Health Plan / Small Goals

The group heading is บริการครั้งที่ 2 : ทำแผนสุขภาพ เป้าหมายเล็กๆที่ตั้งไว้.

| Cells/row | Workbook field | Source business concept | Current rewrite source | Legacy source | Raw/derived | Status | Unresolved semantics |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Y6/Z8 | เป้าหมายอาหาร; มี/ไม่มี | Food-goal presence | Generic Goal Plan items | Food status/activity codes | ACTIVITY COMPLETION | IMPLEMENTED — EXTEND | Whether no food goal is valid |
| Y7 | การลดมื้ออาหาร | Food quantity/frequency goal | Generic activity code/target | Food amount status | GOAL DATA | DECISION REQUIRED | Quantity versus frequency meaning |
| AA6/AB8 | การเปลี่ยนอาหาร; มี/ไม่มี | Food type/change goal | Generic Goal Plan item | Food type status | ACTIVITY COMPLETION | IMPLEMENTED — EXTEND | Canonical code/target |
| AC7 | จำนวนมื้อ/สัปดาห์ | Weekly meal target/value | Goal target value/unit candidate | Legacy target fields, no confirmed mapping | GOAL TARGET | DECISION REQUIRED | Target versus observed; period/unit |
| AD6/AE8 | เป้าหมายออกกำลัง; มี/ไม่มี | Exercise-goal presence | Generic exercise Goal item | Movement/exercise status | ACTIVITY COMPLETION | IMPLEMENTED — EXTEND | Allowed activity set |
| AD7 | มีการตั้งเป้า | Exercise target exists | Goal item presence | Legacy target value/unit | GOAL DATA | IMPLEMENTED — EXTEND | Exact meaning of “has target” |
| AF7 | จำนวนวัน/สัปดาห์ | Exercise target days | PatientGoalItem.targetDays | Legacy target_days | GOAL TARGET | IMPLEMENTED — VERIFY SEMANTICS | Weekly denominator confirmation |
| AG7 | รวมเวลา/สัปดาห์ | Exercise weekly time | targetValue/targetUnit candidate | Legacy exercise minute targets | GOAL TARGET | IMPLEMENTED — VERIFY SEMANTICS | Target versus calculated observation |

### 5.6 Service 3 through Service 6 — Behavioral Follow-up

The workbook labels Service 3 as บริการครั้งที่ 3 : ติดตามการฝึกซ้อมพฤติกรรม and repeats the same group shape for visible services 4, 5, and 6.

| Group field | Thai label | Source business concept | Current rewrite source | Legacy source | Raw/derived | Status | Unresolved semantics |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Date | วันที่ติดตาม | Dated Follow-up event | PatientFollowup.recordedAt and optional Appointment | Editable legacy followup_date | SOURCE DATA | IMPLEMENTED — EXTEND | Occurrence date/backdating |
| Count | จำนวนวันที่ทำได้ | Achieved days/count | No field | No structured equivalent | SOURCE/DERIVED | NEW — REQUIRED | Numerator and period |
| Rate | อัตราความสำเร็จตามเป้า | Achievement rate | No field/formula | Legacy ratios differ | DERIVED | DECISION REQUIRED | Formula, zero target, missing observations |
| Outcome | ผลลัพธ์ที่ได้ | Controlled outcome phrase/code | No field | Free text/status/auto-summary | OUTCOME | DECISION REQUIRED | Controlled vocabulary/version |
| Plan adjustment | ปรับแผนใหม่; ปรับ/ไม่ปรับ | Goal Plan adjustment decision | No field; Plans immutable | Goals can archive/replace; no Follow-up flag | PROGRAM EVENT | DECISION REQUIRED | Relation to new Goal Plan |
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

## 11. Open requirements referenced by the business-flow document

The detailed register is in PHASE_15A_BUSINESS_FLOW_CONSOLIDATION.md:

- P15A-D01 report ID;
- P15A-D02 DM/Pre-DM source;
- P15A-D03 illness duration;
- P15A-D04/D12 program and BEFORE/AFTER lifecycle;
- P15A-D05 OSM context;
- P15A-D06–D08 confidence and Service 1/artifact ownership;
- P15A-D09–D11 CVD risk, HbA1c/DTX, height/BMI;
- P15A-D13–D16 achievement, outcome, plan adjustment, obstacles;
- P15A-D17 correction/amendment;
- P15A-D18–D19 report access/export and Follow-up overflow.

## 12. Verification

- The actual workbook, not a prior summary, was inspected.
- Sheet names, dimensions, headings, merged layout, literal notes, and blank-template nature were checked.
- No formula cells or encoded data validations were found.
- Thai labels and notes are preserved as source text.
- Current rewrite model/source references were checked against prisma/schema.prisma and corresponding services/schemas/routes.
- Legacy fields cited here were verified in the pinned checkout at commit 7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e.
- Wide report columns were explicitly treated as projections, not persistence instructions.
