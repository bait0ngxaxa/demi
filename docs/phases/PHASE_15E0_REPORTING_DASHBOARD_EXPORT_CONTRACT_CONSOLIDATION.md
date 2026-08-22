# DEMI Phase 15E.0 — Reporting, Dashboard & Export Contract Consolidation

## 1. Status and scope

Status: documentation-only consolidation and implementation-readiness handoff.

Date of audit: 2026-08-22.

This document establishes the current reporting contract after Phase 15D.3. It reconciles:

- the accepted architecture and ADRs;
- the historical Phase 15A reporting map;
- the accepted Phase 15B–15D contracts;
- the current executable rewrite implementation; and
- the customer workbook as layout and terminology evidence.

The workbook is evidence of requested presentation concepts. It is not, by itself, an accepted database source, clinical definition, formula, unit, timing rule, authorization rule, or export specification.

This phase does not implement a production dashboard, report UI, report route, report query module, Excel/PDF/CSV export, Prisma schema change, migration, clinical calculation, or reporting persistence.

The governing rule is:

    SOURCE RECORD → TYPED REPORT PROJECTION

The projection must remain a read model. It must not become a second source of truth.

## 2. Starting branch, HEAD, and working tree

The requested baseline was verified before the audit:

| Check | Result |
| --- | --- |
| Branch | main |
| HEAD | 6259381afece5d3ecaf97d456da29f575cf00dc2 |
| HEAD subject | feat(phase-15d3): integrate Final Assessment into Program UI |
| origin/main at audit start | 6259381afece5d3ecaf97d456da29f575cf00dc2 |
| Working tree at audit start | clean |

No reset, force checkout, discard, or unrelated overwrite was performed.

## 3. Evidence sources inspected

### 3.1 Product, architecture, and phase contracts

The following were read or inspected:

- docs/CONTEXT.md
- docs/architecture/DEMI_ARCHITECTURE_BASELINE.md
- docs/adr/README.md
- docs/adr/0001 through docs/adr/0008
- docs/phases/PHASE_15A_BUSINESS_FLOW_CONSOLIDATION.md
- docs/phases/PHASE_15A_REPORTING_DATA_MAP.md
- the Phase 15B documents covering Program and Service 1
- the Phase 15C documents covering Goal Plan, Follow-up, and Program linkage
- docs/phases/PHASE_15D0_FINAL_OUTCOME_CONTRACT_CONSOLIDATION.md
- docs/phases/PHASE_15D1_FINAL_ASSESSMENT_DOMAIN_PERSISTENCE.md
- docs/phases/PHASE_15D2_MEASUREMENT_SEMANTICS_CONSOLIDATION.md
- docs/phases/PHASE_15D3_FINAL_OUTCOME_UI_INTEGRATION.md

### 3.2 Current implementation

The current schema and implementation audit covered:

- prisma/schema.prisma and the relevant migrations;
- src/modules/patient-program;
- src/modules/patient-baseline;
- src/modules/patient-final-assessment;
- src/modules/followups;
- src/modules/goals;
- src/modules/patient-assignment;
- src/modules/patient-directory;
- src/modules/screening;
- src/modules/appointments;
- the Service 1 Program-owned records;
- the relevant Program and patient routes under app/app/patients/[relationshipId].

### 3.3 Customer workbook

The workbook was inspected read-only with openpyxl:

- docs/Dashboard App Demi.xlsx
- sheet Dashboard ภาพรวม, used dimension A1:AQ29
- sheet รายงานการจัดบริการ, used dimension A1:BM37

The workbook SHA-256 at inspection was:

    F70B4FC42D31B5CA5FB9B9F8F915A91709B376A31839FA420A62F8103EFE7D43

Both sheets are blank formatted templates. No formulas, data validations, sample records, or Excel comments/notes objects were found; explanatory text cells are documented below. Merged cells and labels were inspected without saving the workbook.

## 4. Classification and readiness vocabulary

The audit uses these classifications:

| Classification | Meaning |
| --- | --- |
| ACCEPTED | Established by an accepted contract or ADR. |
| CURRENT IMPLEMENTATION | Verified in the current executable rewrite. |
| CUSTOMER EVIDENCE | Present in the workbook, but not yet an accepted semantic contract. |
| SAFE FACTUAL PROJECTION | A source fact can be exposed without interpretation, subject to authorization. |
| SAFE WITH PROVISIONAL WORDING | A source fact is safe, but its customer-facing stage or label must not imply an unaccepted clinical meaning. |
| SAFE PROTOTYPE DEFAULT | A temporary implementation choice acceptable only for a bounded prototype and clearly labeled. |
| ENGINEERING RECOMMENDATION | Recommended design, not a customer or clinical decision. |
| REQUIREMENT-GATED | A source or meaning exists as a possibility, but the required business/clinical decision is absent. |
| OPEN REQUIREMENT | A decision owner and accepted rule are still needed. |
| BLOCKED | The concept must not be implemented as an official report value. |

Readiness results:

- READY_FOR_FACTUAL_PROJECTION
- READY_WITH_PROVISIONAL_LABEL
- REQUIRES_SOURCE_DECISION
- REQUIRES_TIMING_DECISION
- REQUIRES_AUTHORIZATION_DECISION
- REQUIRES_CLINICAL_CONTRACT
- REQUIRES_CALCULATION_CONTRACT
- NO_CURRENT_SOURCE
- BLOCKED_FROM_15E_IMPLEMENTATION

## 5. Reconciliation of historical Phase 15A statements

Phase 15A was an earlier implementation snapshot. Its statements that Program or Final Assessment did not yet exist remain historical evidence, not current truth. They are not rewritten here.

| Concept | Phase 15A historical position | Current verified position | Current reporting consequence |
| --- | --- | --- | --- |
| Program | Program-specific ownership was not yet implemented. | PatientProgram exists, is relationship-owned, and has lifecycle state and timestamps. | Program is the episode boundary for future factual projection. |
| Initial Before linkage | A Program-specific Before source was unresolved. | PatientProgram.initialBaselineId explicitly links a Program to the exact PatientBaseline when present. | A linked Baseline is a safe candidate source; no link means no authoritative Program Before source. |
| Service 1 | Service records were not yet connected as current Program records. | Routine, Floating Chart, Dream Card, and Confidence are Program-owned optional records. | Presence and recording facts are projectable; success is not implied. |
| Goal Plan | Goal/Service 2 ownership and linkage were unresolved. | PatientGoalPlan can be linked exactly to a Program; items contain selected activity and target facts. | Exact Program Goal Plan facts can be projected. |
| Follow-up | The visible workbook rounds were not a persistence contract. | PatientFollowup supports Program-scoped normalized history with local round numbers and 0..N records. | The source is normalized history; six workbook positions are presentation only. |
| Final | Final Assessment did not yet exist. | PatientFinalAssessment is an exact Program-owned 0..1 immutable factual record. | Final presence and raw values can be projected; Final is not automatically an official clinical After assessment. |
| Clinical report fields | Formula, unit, stage, and clinical authority were unresolved. | 15D.2 keeps these unresolved. | DM/Pre-DM, HbA1c, Height, BMI, CVD risk, and outcome calculations remain blocked. |

## 6. Current implementation re-audit

### 6.1 Current reporting domain graph

The current relationship and Program boundaries are:

    Patient / Person
        ↓
    PatientHospitalRelationship
        ├── Hospital
        ├── PatientOsmAssignment history
        ├── PatientBaseline 0..1
        ├── PatientProgram 0..N
        │   ├── initialBaselineId → exact PatientBaseline 0..1
        │   ├── Service 1 records 0..1 each
        │   ├── Program-linked PatientGoalPlan 0..N
        │   ├── Program-linked PatientFollowup 0..N
        │   │   └── PatientFollowupActivityProgress 0..N
        │   └── PatientFinalAssessment 0..1
        ├── ScreeningAssessment 0..N
        ├── PatientAppointment 0..N
        └── legacy/compatibility records that may remain relationship-owned

The graph is an ownership map, not a statement that every node belongs in every report.

### 6.2 Entity audit

| Entity | Owner and cardinality | Scope and isolation | Mutability/history | Time and provenance | Authorization and factual suitability |
| --- | --- | --- | --- | --- | --- |
| Hospital | One Hospital owns many relationships. hospitalCode is unique. | Hospital scope. Parent/child fields exist but do not create report permission by themselves. | Name/status can change; identity is persistent. | createdAt/updatedAt; no clinical meaning. | Hospital identity is a factual candidate after scope authorization. |
| Person / PatientProfile | Person is the identity record; PatientProfile is one-to-one with Person. | Patient identity can participate in many hospital relationships. | Identity/profile fields are mutable according to existing patient flows. | createdAt/updatedAt; no measurement observation time. | Given/family name is PII and needs report authorization. No accepted customer-facing Patient ID is defined. |
| PatientHospitalRelationship | One patient-hospital relationship; unique per PatientProfile and Hospital. | Relationship scope; this is not a Program episode. | Relationship HN is nullable and mutable; relationship history survives Program completion. | createdAt/updatedAt; no illness-duration source. | Direct Hospital membership and exact OSM assignment are current read boundaries for patient flows. |
| PatientOsmAssignment | Assignment history belongs to a relationship and OSM user. | Exact relationship assignment, active when endedAt is null. | Historical rows survive; active assignment can end. | createdAt, endedAt, assigned/ended actors. | Supports exact assigned-patient access; does not establish aggregate report or export authority. |
| PatientBaseline | At most one current immutable Baseline per relationship. | Relationship-owned; a Program may point to it through initialBaselineId. | Prototype behavior is immutable; it is not a per-Program collection. | recordedOn is a user-supplied date-only field; createdAt is persistence time; recordedByUserId is provenance. | Raw values are safe candidates only through the exact Program link. Relationship-wide Baseline must not be substituted for a Program with no link. |
| PatientProgram | Many Programs per relationship; at most one active Program by database invariant. | The episode boundary for Program reporting. | Lifecycle status ACTIVE/COMPLETED; completedAt is independent of Final existence. | startedAt/completedAt are lifecycle times; createdAt is persistence time; createdByUserId is provenance. | Current program:read policy resolves exact relationship and Program for authorized Hospital or assigned OSM. |
| PatientProgram.initialBaselineId | Nullable exact foreign-key link from Program to Baseline. | Program-to-relationship-consistent link. | Link is established by Program workflow and is not a fallback selector. | Link has no separate observation timestamp. | The only current candidate source for Program Before Baseline facts. Null means no linked source. |
| PatientFollowup | Relationship record optionally linked to a Program; current Program flow uses exact Program and relationship. | Program-scoped when patientProgramId is present; pre-Program compatibility rows can have null Program. | 0..N normalized history; local round numbers; immutable records in current flow. | recordedAt is application recording time; createdAt is persistence time; createdByUserId is provenance. | Exact Program read is factual; relationship-wide latest Follow-up is not a Program source. |
| PatientFollowupActivityProgress | Child rows of a Follow-up. | Inherits exact Follow-up and therefore exact Program scope. | One progress status/note per activity within the record. | createdAt; creator inherited from Follow-up context. | Raw DONE/PARTIAL/NOT_DONE/NOT_APPLICABLE facts are projectable; no achievement formula. |
| PatientFinalAssessment | Exact 0..1 child of a Program and relationship. | Program-owned; relationship consistency is enforced. | Immutable in current flow; created only while Program is active; readable after completion. | recordedAt is application recording time; createdAt is persistence time; recordedByUserId is provenance. | Final presence/raw values are factual; completion does not create a Final and Final is not automatically clinical After. |
| Service 1 records | Routine, FloatingChart, DreamCard, and Confidence are each optional 0..1 and Program-owned. | Exact Program scope. | Current records are immutable/idempotent per Program/record type. | recordedAt and recordedByUserId; artifacts have upload/association times. | Presence, values entered in the record, and artifact metadata can be projected. Private artifact URLs must not be exposed without storage authorization. |
| PatientGoalPlan / PatientGoalItem | Goal Plan belongs to relationship and may link to one exact Program; items belong to the plan. | Program-linked rows are exact Program scope; null patientProgramId rows are compatibility history. | Multiple rounds/versioned rows; selected goals and target items are stored facts. | createdAt/createdByUserId; source Screening link may exist. | Exact selected goals/targets are factual; customer-approved categories and success semantics are unresolved. |
| ScreeningAssessment | Relationship-owned assessment; no Program FK. | Relationship scope, not a Program stage source. | Multiple submitted assessments; JSON responses/result. | submittedAt/createdAt and conductedBy. | Current prototype result is not an accepted DM/Pre-DM authority and must not drive official cohort counts. |
| PatientAppointment | Relationship-owned appointment, optionally linked from Follow-up. | Relationship scope; an appointment is not automatically a Program measurement. | Status and scheduling fields can change. | scheduledAt is a scheduled business date/time; createdAt/updatedAt are persistence times. | Useful for service workflow facts; not a Baseline/Follow-up/Final observation source. |

### 6.3 Current access behavior relevant to reporting

The current Program read boundary is exact and fail-closed:

- HOSPITAL users require an active direct OWNER or MEMBER relationship with the Hospital.
- OSM users require an active OSM-Hospital relationship and an exact active PatientOsmAssignment.
- ADMIN-only and PATIENT access are denied by the current Program prototype.
- The resolver verifies the Program, its relationship, and the authorized scope together.
- Goal, Follow-up, Screening, Appointment, Baseline, and Final reads apply their own exact relation/assignment checks.

This is evidence for a bounded patient-level factual projection. It is not an accepted authorization contract for a dashboard cohort, multi-Hospital report, or export.

## 7. Workbook re-inspection

### 7.1 Sheet Dashboard ภาพรวม

The sheet occupies A1:AQ29. Meaningful labels and groups are:

| Range / cells | Exact workbook label or group | Intended concept | Current rewrite candidate | Classification and readiness |
| --- | --- | --- | --- | --- |
| A1 | รพ.สต.......................... | Hospital/site heading | Hospital.name / hospitalCode | CUSTOMER EVIDENCE; READY_WITH_PROVISIONAL_LABEL |
| A2, C2 | จำนวนเคส; เบาหวาน...................ราย | DM case count | No accepted classification source | CUSTOMER EVIDENCE; BLOCKED_FROM_15E_IMPLEMENTATION |
| C3 | กลุ่มเสี่ยง(Pre-DM)…...................ราย | Pre-DM case count | No accepted classification source | CUSTOMER EVIDENCE; BLOCKED_FROM_15E_IMPLEMENTATION |
| A4:C5 | ลำดับ; รายชื่อ; ชื่อ; สกุล | Row number and patient name | Person/PatientProfile | CUSTOMER EVIDENCE; READY_WITH_PROVISIONAL_LABEL subject to PII authorization |
| D4 | ID | Customer-facing patient identifier | Relationship HN is a candidate source only; a future customer ID remains possible; internal UUID is not an approved display ID and no identifier is exposed before RPT-03 acceptance | CUSTOMER EVIDENCE; REQUIRES_SOURCE_DECISION |
| E4 | ระยะเวลาการเจ็บป่วย | Illness duration | No current PatientProfile or relationship source | CUSTOMER EVIDENCE; NO_CURRENT_SOURCE |
| F4 | อสม.ที่ดูแล | OSM/caregiver | Active PatientOsmAssignment and OSM Person name | CUSTOMER EVIDENCE; REQUIRES_AUTHORIZATION_DECISION |
| G4:P4 | ข้อมูลเริ่มต้น(Before) | Before group | Exact Program.initialBaselineId → PatientBaseline | CUSTOMER EVIDENCE; READY_WITH_PROVISIONAL_LABEL |
| G5 | วันที่เริ่มโปรแกรม | Program start | PatientProgram.startedAt | CUSTOMER EVIDENCE; SAFE_FACTUAL_PROJECTION, lifecycle label only |
| H5 | CVD risk score | CVD risk | No accepted source/algorithm | CUSTOMER EVIDENCE; BLOCKED |
| I5 | HbA1C | HbA1c | No persistence contract | CUSTOMER EVIDENCE; NO_CURRENT_SOURCE |
| J5 | DTX | Blood sugar/DTX | linked Baseline.bloodSugarDtx | CUSTOMER EVIDENCE; SAFE_WITH_PROVISIONAL_WORDING, unit/context gated |
| K5 | BW. | Weight | linked Baseline.weight | CUSTOMER EVIDENCE; SAFE_WITH_PROVISIONAL_WORDING, unit/timing gated |
| L5 | BMI | BMI | Derived from weight and height, but no accepted Height source/contract | CUSTOMER EVIDENCE; BLOCKED |
| M5 | ส่วนสูง | Height | No accepted Height owner | CUSTOMER EVIDENCE; NO_CURRENT_SOURCE |
| N5 | รอบเอว | Waist | linked Baseline.waistCircumference | CUSTOMER EVIDENCE; SAFE_WITH_PROVISIONAL_WORDING, unit/timing gated |
| O5:P7 | BP; ตัวบน; ตัวล่าง | Systolic/diastolic BP | linked Baseline.bloodPressureSystolic/Diastolic | CUSTOMER EVIDENCE; SAFE_WITH_PROVISIONAL_WORDING, unit/timing gated |
| Q4:AH4 | ระหว่างอยู่ในโปรแกรม | During group with visible positions 1–6 | exact Program-linked PatientFollowup 0..N | CUSTOMER EVIDENCE; READY_WITH_PROVISIONAL_LABEL |
| Q5:S5 … AF5:AH5 | round 1 … round 6 | Presentation slots | Followup roundNumber local to exact Program; no six-column persistence | CUSTOMER EVIDENCE; SAFE_FACTUAL_PROJECTION as an adapter only |
| Q/T/W/Z/AC/AF | DTX | Follow-up blood sugar fact | Followup.bloodSugar | CUSTOMER EVIDENCE; SAFE_WITH_PROVISIONAL_WORDING |
| R/U/X/AA/AD/AG | BW. | Follow-up weight fact | Followup.weight | CUSTOMER EVIDENCE; SAFE_WITH_PROVISIONAL_WORDING |
| S/V/Y/AB/AE/AH | Achieve score | Achievement score | No accepted stored score or formula | CUSTOMER EVIDENCE; BLOCKED |
| AI4:AQ4 | After | After group | exact Program FinalAssessment only | CUSTOMER EVIDENCE; READY_WITH_PROVISIONAL_LABEL |
| AI5 | วันที่สิ้นสุดโปรแกรม | Program completion date | PatientProgram.completedAt | CUSTOMER EVIDENCE; SAFE_FACTUAL_PROJECTION, lifecycle label only |
| AJ5 | CVD risk score | CVD risk | No accepted source/algorithm | CUSTOMER EVIDENCE; BLOCKED |
| AK5 | HbA1C | HbA1c | No persistence contract | CUSTOMER EVIDENCE; NO_CURRENT_SOURCE |
| AL5 | DTX | Final blood sugar fact | PatientFinalAssessment.bloodSugar | CUSTOMER EVIDENCE; SAFE_WITH_PROVISIONAL_WORDING |
| AM5 | BW. | Final weight fact | PatientFinalAssessment.weight | CUSTOMER EVIDENCE; SAFE_WITH_PROVISIONAL_WORDING |
| AN5 | BMI | BMI | No accepted Height/derived contract | CUSTOMER EVIDENCE; BLOCKED |
| AO5 | รอบเอว | Final waist fact | PatientFinalAssessment.waistCircumference | CUSTOMER EVIDENCE; SAFE_WITH_PROVISIONAL_WORDING |
| AP5:AQ7 | BP; ตัวบน; ตัวล่าง | Final systolic/diastolic BP | PatientFinalAssessment.systolic/diastolicBloodPressure | CUSTOMER EVIDENCE; SAFE_WITH_PROVISIONAL_WORDING |

The visible six During groups do not authorize six persisted columns, six required follow-ups, an achievement score, or an expected count.

### 7.2 Sheet รายงานการจัดบริการ

The sheet occupies A1:BM37. Its meaningful groups are independent from Dashboard ภาพรวม:

| Range / cells | Exact workbook label or group | Intended concept | Current rewrite candidate | Classification and readiness |
| --- | --- | --- | --- | --- |
| A1 | Service Process record | Service report heading | Presentation-only title | CUSTOMER EVIDENCE; SAFE PROTOTYPE DEFAULT |
| A2 | รพ.สต.......................... | Hospital/site filter/title | Hospital identity | CUSTOMER EVIDENCE; REQUIRES_AUTHORIZATION_DECISION |
| A3, C3, C4 | จำนวนเคส; เบาหวาน...................ราย; กลุ่มเสี่ยง(Pre-DM)…...................ราย | DM/Pre-DM case counts | No accepted classification source | CUSTOMER EVIDENCE; BLOCKED |
| A5:C6 | ลำดับ; รายชื่อ; ชื่อ; สกุล | Row number and name | Person/PatientProfile | CUSTOMER EVIDENCE; READY_WITH_PROVISIONAL_LABEL subject to PII authorization |
| D5 | ID | Customer-facing identifier | Relationship HN is a candidate source only; the customer-facing ID contract is required before any HN/ID exposure | CUSTOMER EVIDENCE; REQUIRES_SOURCE_DECISION |
| E5 | ระยะเวลาการเจ็บป่วย | Illness duration | No current source | CUSTOMER EVIDENCE; NO_CURRENT_SOURCE |
| F5 | อสม.ที่ดูแล | Caregiver context | PatientOsmAssignment plus OSM identity | CUSTOMER EVIDENCE; REQUIRES_AUTHORIZATION_DECISION |
| G5:H5 | วันที่เริ่มเข้าโปรแกรม; วันที่สิ้นสุด | Program lifecycle dates | PatientProgram.startedAt/completedAt | CUSTOMER EVIDENCE; SAFE_FACTUAL_PROJECTION with lifecycle wording |
| I5:N6 | Before; DTX; BW; PAM; PROMs; คะแนนไม้บรรทัดวัดใจ; เวลาออกกำลังกาย/สัปดาห์ | Service-oriented Before values | DTX/weight candidate from linked Baseline; Screening has provisional PAM/PROM results; no accepted ruler/exercise source | CUSTOMER EVIDENCE; mixed: factual candidates, source/semantics gated |
| O5:R6 | After; DTX; BW; เวลาออกกำลังกาย/สัปดาห์; จำนวนครั้งที่อัตราความสำเร็จตามเป้าหมาย>70% | Service-oriented After values | DTX/weight candidate from exact Final; no exercise/achievement source or formula | CUSTOMER EVIDENCE; mixed: raw candidates, achievement blocked |
| S5:X6 | บริการครั้งที่ 1: รู้จักตัวเอง; กราฟวัดลอยจม; การ์ดความฝัน; ตารางกิจวัตร | Service 1 artifacts/records | FloatingChart, DreamCard, Routine presence/content | CUSTOMER EVIDENCE; READY_FOR_FACTUAL_PROJECTION for presence/record facts |
| Y5:AG7 | บริการครั้งที่ 2 : ทำแผนสุขภาพ เป้าหมายเล็กๆที่ตั้งไว้; เป้าหมายอาหาร; การลดมื้ออาหาร; การเปลี่ยนอาหาร; จำนวนมื้อ/สัปดาห์; มีการตั้งเป้า; จำนวนวัน/สัปดาห์; รวมเวลา/สัปดาห์ | Selected goals and target values | exact Program-linked PatientGoalPlan and PatientGoalItem fields where matching source exists | CUSTOMER EVIDENCE; READY_WITH_PROVISIONAL_LABEL, category/unit semantics remain open |
| AH5:AO8 | บริการครั้งที่ 3; วันที่ติดตาม; จำนวนวันที่ทำได้; อัตราความสำเร็จตามเป้า; ผลลัพธ์ที่ได้; ปรับแผนใหม่; มีอุปสรรค | Follow-up group 3 | exact Program-linked Followup date, activity progress facts; no stored outcome/plan-adjustment/obstacle fields | CUSTOMER EVIDENCE; mixed: date/progress factual, other concepts blocked |
| AP5:AW8 | บริการครั้งที่ 4 and same subfields | Follow-up group 4 | exact Program-linked Followup history | CUSTOMER EVIDENCE; same as group 3 |
| AX5:BE8 | บริการครั้งที่ 5 and same subfields | Follow-up group 5 | exact Program-linked Followup history | CUSTOMER EVIDENCE; same as group 3 |
| BF5:BM8 | บริการครั้งที่ 6 and same subfields | Follow-up group 6 | exact Program-linked Followup history | CUSTOMER EVIDENCE; same as group 3 |
| AH31:AI35, AK32, AI33:AI35 | หมายเหตุ; อัตราความสำเร็จตามเป้า = Achieve score; explanatory notes; row-8 choices ปรับ/ไม่ปรับ and มี/ไม่มี | Presentation guidance, including achievement and expected 2–4 follow-ups | No accepted formula or fixed follow-up count; row-8 choices do not correspond to current structured plan/obstacle fields | CUSTOMER EVIDENCE; requirement-gated |
| AH37:BM37 | report detail note | Presentation evidence only | Does not authorize report shape or permission | CUSTOMER EVIDENCE; requirement-gated |

The second sheet does not contain the Dashboard ภาพรวม CVD, HbA1c, Height, BMI, waist, or BP columns. Those labels must not be copied into this service sheet without a new customer decision.

The workbook note that describes an achievement rate as target actions divided by weekly target is not an accepted application formula. The template contains no executable formula and no approved denominator, zero-target behavior, or handling for partial/not-applicable progress.

## 8. Normalized current source map

The following is the proposed source map for a future factual projection. It names the current source record and keeps report presentation separate.

| Report concept | Source record and exact scope | Raw/derived/presentation | Current status | Readiness |
| --- | --- | --- | --- | --- |
| Hospital/site | Hospital reached through the authorized PatientHospitalRelationship | Raw identity | Hospital is current source | READY_FOR_FACTUAL_PROJECTION |
| Patient display name | Person/PatientProfile for the relationship | Raw PII | Current source exists; exposure is authorization-gated | READY_WITH_PROVISIONAL_LABEL |
| Customer-facing Patient ID | Relationship.hospitalNumber is the strongest current candidate; internal IDs are not approved display IDs | Raw candidate, not final contract | Current data exists, but no approved customer-facing field exists; do not expose any identifier before RPT-03 acceptance | REQUIRES_SOURCE_DECISION |
| Hospital Number / HN | PatientHospitalRelationship.hospitalNumber, nullable | Raw relationship data; internal use only until RPT-03 acceptance | Candidate source only; do not expose as the customer-facing Patient ID or HN report field until RPT-03 is explicitly accepted | REQUIRES_SOURCE_DECISION |
| Illness duration | No authoritative current field | None | No source | NO_CURRENT_SOURCE |
| OSM/caregiver | Active PatientOsmAssignment joined to assigned OSM Person; assignment history is separately available | Raw relationship context | Exact current assignment can be factual; visibility and historical display are open | REQUIRES_AUTHORIZATION_DECISION |
| Program start | PatientProgram.startedAt for exact Program | Raw lifecycle timestamp | Current source | READY_FOR_FACTUAL_PROJECTION |
| Program completion | PatientProgram.completedAt for exact Program, nullable | Raw lifecycle timestamp | Current source; null is not failure | READY_FOR_FACTUAL_PROJECTION |
| Linked Before existence | PatientProgram.initialBaselineId and exact Baseline relation | Raw link/presence | Current source; null must remain explicit | READY_FOR_FACTUAL_PROJECTION |
| Before weight | PatientBaseline.weight through exact initialBaselineId | Raw nullable value | Candidate fact; stage/timing/unit are not clinical contract | READY_WITH_PROVISIONAL_LABEL |
| Before waist | PatientBaseline.waistCircumference through exact initialBaselineId | Raw nullable value | Candidate fact; stage/timing/unit gated | READY_WITH_PROVISIONAL_LABEL |
| Before systolic/diastolic BP | PatientBaseline.bloodPressureSystolic/Diastolic through exact initialBaselineId | Raw nullable values | Candidate facts; stage/timing/unit gated | READY_WITH_PROVISIONAL_LABEL |
| Before DTX | PatientBaseline.bloodSugarDtx through exact initialBaselineId | Raw nullable value | Candidate fact; context/unit gated | READY_WITH_PROVISIONAL_LABEL |
| During history | PatientFollowup rows with exact patientProgramId and relationshipId | Raw normalized history | Source of truth; 0..N | READY_FOR_FACTUAL_PROJECTION |
| During round | PatientFollowup.roundNumber within the exact Program | Raw local ordinal | Program-local fact; not global chronology or six-column persistence | READY_FOR_FACTUAL_PROJECTION |
| During DTX/weight/BP/waist | Corresponding nullable raw fields on exact Followup | Raw nullable values | Factual candidates; no derived progress claim | READY_WITH_PROVISIONAL_LABEL |
| During activity progress | PatientFollowupActivityProgress for exact Followup | Raw status/note | Factual statuses only | READY_FOR_FACTUAL_PROJECTION |
| Service 1 presence | Routine/FloatingChart/DreamCard/Confidence rows for exact Program | Raw existence and selected factual values | Current source | READY_FOR_FACTUAL_PROJECTION |
| Service 1 artifact | PatientEvidenceArtifact association metadata only | Raw metadata | Do not expose private URL; storage authorization remains required | READY_WITH_PROVISIONAL_LABEL |
| Goal Plan presence | PatientGoalPlan with exact patientProgramId | Raw existence | Current source | READY_FOR_FACTUAL_PROJECTION |
| Selected goals | PatientGoalPlan.primaryGoalCode/notes and PatientGoalItem.activityCode | Raw stored selections | Source exists; customer vocabulary remains open | READY_WITH_PROVISIONAL_LABEL |
| Goal targets | PatientGoalItem.targetDays/targetValue/targetUnit | Raw target facts | Source exists; unit and achievement meaning remain open | READY_WITH_PROVISIONAL_LABEL |
| Follow-up date | PatientFollowup.recordedAt and any linked appointment data | Raw recording/scheduling facts | Do not label as clinical observation without contract | READY_WITH_PROVISIONAL_LABEL |
| Follow-up plan changes | No structured plan-adjustment field | None | No current authoritative source | NO_CURRENT_SOURCE |
| Follow-up obstacles | No structured obstacle field | None | No current authoritative source; free text is not an accepted structured substitute | NO_CURRENT_SOURCE |
| Follow-up outcome | No structured outcome field or accepted vocabulary | None | No current authoritative source | BLOCKED_FROM_15E_IMPLEMENTATION |
| Final presence | PatientFinalAssessment for exact Program, 0..1 | Raw existence | Current source | READY_FOR_FACTUAL_PROJECTION |
| Final weight/waist/BP/DTX | Corresponding nullable raw fields on exact Final | Raw nullable values | Factual candidates; not automatically clinical After | READY_WITH_PROVISIONAL_LABEL |
| HbA1c | No current persistence field | None | No source | NO_CURRENT_SOURCE |
| Height | No accepted owner or field | None | No source | NO_CURRENT_SOURCE |
| BMI | Weight/height calculation would be derived | Derived | Contract, inputs, units, rounding, and correction behavior absent | BLOCKED_FROM_15E_IMPLEMENTATION |
| CVD risk | No accepted owner, algorithm, or version | Derived or imported, unresolved | Fully blocked | BLOCKED_FROM_15E_IMPLEMENTATION |
| DM/Pre-DM classification | Screening result is not an accepted authority | Derived/classification | No official source or effective-date rule | BLOCKED_FROM_15E_IMPLEMENTATION |

## 9. Before, During, and Final candidate source contract

### 9.1 Before

The only safe candidate mapping is:

    exact PatientProgram
        ↓ initialBaselineId
    exact PatientBaseline

The relationship-wide Baseline is not automatically a Program Before record. initialBaselineId = null means:

- no authoritative linked Before source exists for that Program;
- do not use another Program's Baseline;
- do not use the latest relationship measurement;
- do not use a previous Program's Final;
- do not use a Follow-up from any Program.

If a linked Baseline exists, its nullable raw weight, waist, systolic BP, diastolic BP, and DTX fields are factual candidate values. They must not be labeled an official clinical Before observation until timing, unit, context, and clinical-stage requirements are accepted.

### 9.2 During Program

The source is:

    exact PatientProgram
        ↓ patientProgramId + relationshipId
    PatientFollowup 0..N

Follow-up history remains normalized and unbounded. roundNumber is Program-local. The workbook's positions 1–6 are a presentation adapter, not a persistence shape. A future report may paginate or display the first six positions only if truncation and overflow behavior are explicit; persistence must remain 0..N.

Raw Follow-up DTX, weight, waist, BP, recording timestamp, and activity-progress statuses can be projected. There is no accepted achievement score, rate, success label, or official During clinical interpretation.

### 9.3 Final / After candidate

The source is:

    exact PatientProgram
        ↓
    PatientFinalAssessment 0..1

Current factual raw values are weight, waistCircumference, systolicBloodPressure, diastolicBloodPressure, and bloodSugar, each nullable. Final is a Program-owned raw record. It is not automatically an approved clinical After assessment.

The following substitutions are forbidden:

- Program completion → Final;
- latest Follow-up → Final;
- missing Final → failed outcome;
- another Program's Final → this Program's Final.

## 10. Program A / Program B isolation rules

The source map must preserve episode isolation:

    Relationship R
    ├── Program A
    │   ├── linked Baseline A?
    │   ├── Service A
    │   ├── Goal Plan A
    │   ├── Follow-ups A
    │   └── Final A?
    │
    └── Program B
        ├── linked Baseline B?
        ├── Service B
        ├── Goal Plan B
        ├── Follow-ups B
        └── Final B?

For a report row keyed by Program B, every Program-scoped source query must constrain the same Program B and the same relationship. It must never:

- map Final A to Program B After;
- map Follow-up A to Program B During;
- map Final A to Program B Before;
- borrow the latest relationship value as Program B source;
- borrow a relationship-wide latest Follow-up;
- borrow a relationship-wide latest Final;
- merge round numbers across Programs;
- treat a pre-Program Goal Plan or Follow-up as Program B data.

A future cross-episode rule requires an explicit accepted requirement, source rule, timing rule, and authorization rule. No such rule exists in this phase.

## 11. Timing and stage contract

Current dates and timestamps do not all mean the same thing. A report must preserve their meaning instead of presenting every value as an observation date.

| Field | Current meaning | Time classification | What it does not prove |
| --- | --- | --- | --- |
| PatientProgram.startedAt | Program lifecycle start recorded by the application | LIFECYCLE TIME | It does not prove that a Baseline measurement was taken at that instant. |
| PatientProgram.completedAt | Program lifecycle completion recorded by the application | LIFECYCLE TIME | It does not create a Final Assessment or prove a Final measurement at completion. |
| PatientBaseline.recordedOn | User-supplied date-only field on the relationship Baseline | USER-SUPPLIED BUSINESS DATE | It does not prove a timestamped clinical observation or a Program start match. |
| PatientBaseline.createdAt | Database/application persistence time | DATABASE CREATION TIME | It does not prove the measurement date. |
| PatientBaseline.recordedByUserId | User attribution | ACTOR/PROVENANCE | It does not prove the actor observed the value clinically. |
| PatientFollowup.recordedAt | Server/application recording time for a Follow-up | APPLICATION RECORDING TIME | It does not prove the time of the behavior or measurement. |
| PatientFollowup.createdAt | Persistence time | DATABASE CREATION TIME | It does not prove an observation time. |
| PatientFollowupActivityProgress.createdAt | Persistence time for the progress child record | DATABASE CREATION TIME | It does not prove the activity occurred at that time. |
| PatientFinalAssessment.recordedAt | Server/application recording time for Final | APPLICATION RECORDING TIME | It does not prove a clinical observation at Program completion. |
| PatientFinalAssessment.createdAt | Persistence time | DATABASE CREATION TIME | It does not prove the measurement date. |
| Service 1 recordedAt fields | Application recording time for the Service 1 record | APPLICATION RECORDING TIME | They do not prove clinical success or a behavior observation time. |
| PatientGoalPlan.createdAt | Persistence/creation time for a selected plan or round | DATABASE CREATION TIME | It does not prove when a goal was clinically agreed or performed. |
| PatientAppointment.scheduledAt | Scheduled appointment date/time | USER-SUPPLIED BUSINESS DATE | It does not prove attendance or measurement. |
| ScreeningAssessment.submittedAt | Application submission time for the screening | APPLICATION RECORDING TIME | It does not establish a DM/Pre-DM classification authority or a Program stage. |

### 11.1 Explicit timing answers

| Question | Current answer |
| --- | --- |
| Can Program start define official Before measurement timing? | No. It is a lifecycle time. It can be displayed as Program start, but not as the observation time of a linked Baseline. |
| Can Program completion define official After measurement timing? | No. It is a lifecycle time. Completion is independent of Final existence. |
| Does Baseline recordedOn prove clinical measurement time? | No. It is a user-supplied date-only business field. |
| Does Follow-up recordedAt prove observation time? | No. It is an application recording timestamp. |
| Does Final recordedAt prove observation time? | No. It is an application recording timestamp. |
| How should late entry, import, or backdating be handled? | The current model has no generic observedAt/import provenance contract. Preserve the source field and recording time, label the distinction, and require an accepted late-entry rule before official stage reporting. Do not silently backdate or normalize a value to Program start/completion. |

No observedAt field is added in this phase. A future timing contract must specify source, actor, timezone, precision, late-entry correction, import provenance, and whether a business date can be entered independently from recording time.

## 12. Missing-value semantics

Missing data is a state, not a clinical conclusion. A future typed projection should retain explicit missing states even if a later presentation adapter renders them as blank text.

| State | Meaning | Safe projection behavior |
| --- | --- | --- |
| NOT_RECORDED | The source field or record was expected/available but has no value. | Keep the value absent; do not convert to zero, false, failure, or normal. |
| NOT_APPLICABLE | The field is not applicable under an accepted rule. | Use only when the rule exists; do not infer it from null. |
| NOT_YET_AVAILABLE | The lifecycle allows the source later, but it has not been recorded. | Keep distinct from failure or not applicable. |
| SOURCE_DOMAIN_DOES_NOT_EXIST | The current rewrite has no authoritative source domain, such as Height or HbA1c. | Report capability/source absence, not a numeric blank pretending the source exists. |
| PROGRAM_HAS_NO_LINKED_BASELINE | initialBaselineId is null. | Do not borrow a relationship Baseline, another Program, latest Follow-up, or previous Final. |
| PROGRAM_HAS_NO_FINAL | No exact PatientFinalAssessment exists for the Program. | Display no Final recorded; never display failed outcome. |
| FIELD_NULL_INSIDE_EXISTING_RECORD | The record exists but that field is nullable and null. | Preserve the record presence and field absence separately. |
| NOT_AUTHORIZED_OR_OUT_OF_SCOPE | The caller is not authorized to see the source. | Fail closed; do not reveal whether a source exists by returning an apparently empty clinical value. |

Potential future presentation labels include blank, ไม่ระบุ, and ไม่มีข้อมูล. The exact label, locale, and export encoding are requirement decisions. A report must not use 0, false, failure, not achieved, normal, negative, or no disease as a generic null representation.

Examples:

- Program completed plus no Final means no Final recorded, not a failed outcome.
- Program with no initialBaselineId has no authoritative linked Before source.
- Nullable Final weight means weight was not recorded in that Final, not zero.
- A source domain that does not exist is different from a source record that exists with a null field.

## 13. Report authorization contract

Current patient and Program read authorization cannot be promoted automatically into a report or export permission. Reporting must have a server-side, fail-closed scope policy.

### 13.1 Known current capabilities

| Actor | Current patient/Program read evidence | Safe conclusion for a future factual report |
| --- | --- | --- |
| HOSPITAL | Direct active OWNER or MEMBER Hospital membership can authorize the exact relationship/Program read. | A bounded one-Program factual projection can reuse this exact scope only after the report capability is explicitly adopted. It does not authorize all Hospital rows, all Hospitals, or export. |
| OSM | Active OSM-Hospital relationship plus exact active PatientOsmAssignment supports assigned-patient reads. | Exact assigned-patient factual projection is a candidate. Aggregate Hospital reporting and export remain open. |
| ADMIN | Current Program prototype denies ADMIN-only access. | Platform-wide access, clinical row access, and audit visibility must be explicitly decided. ADMIN must not be assumed to see clinical rows automatically. |
| PATIENT | Current Program prototype denies PATIENT access. | Self-report access is open; it is not implied by the role. |

### 13.2 Scope decision matrix

| Scope | Existing evidence | Current readiness | Required rule |
| --- | --- | --- | --- |
| One exact Patient Program | Existing exact Program read policy for HOSPITAL/OSM | Candidate for Phase 15E.1 factual foundation | Adopt or create an explicit report capability and keep the exact relationship/Program check server-side. |
| Assigned Patients for one OSM | Exact assignment policy exists for ordinary reads | Requirement-gated for reporting | Decide whether report rows and aggregates are allowed, and whether ended assignments retain historical access. |
| One Hospital cohort | Membership exists, but cohort reporting is a new purpose | REQUIRES_AUTHORIZATION_DECISION | Define role, Hospital scope, filters, PII, and whether all relationship rows are visible. |
| Multiple Hospitals | No current report scope contract | BLOCKED | Define platform-wide and cross-Hospital authority explicitly. |
| Platform-wide | ADMIN role alone is not enough evidence | BLOCKED | Decide whether ADMIN may view clinical report rows and under what audit controls. |
| Patient self | No current report access | BLOCKED | Decide self-scope, masking, and whether the same projection is safe for patient-facing use. |
| On-screen report | Not currently implemented | REQUIRES_AUTHORIZATION_DECISION | Define report capability separately from domain read capability. |
| Excel/PDF export | Not currently implemented | REQUIRES_AUTHORIZATION_DECISION | Separate export capability, row limits, PII, audit, and access logging. |

The browser must not be allowed to choose an unrestricted Hospital ID or scope. The server must derive and validate scope from authenticated identity, membership, assignment, and explicit report policy. Hospital Owner membership alone does not imply export authority.

## 14. Clinical and derived-field blockers

### 14.1 DM / Pre-DM

Official DM and Pre-DM counts remain blocked. The current Screening prototype has responses and provisional result data, but no accepted classification authority, threshold contract, effective date, historical behavior, or case-count scope. Do not classify from DTX, legacy thresholds, or HbA1c assumptions.

Required decisions:

- classification source and authority;
- entered, imported, or derived status;
- rule/version and effective date;
- historical correction behavior;
- relationship versus Program scope;
- cohort inclusion and exclusion;
- visibility and authorization.

### 14.2 HbA1c

No accepted persistence contract exists. Do not add a field in this phase or map a workbook heading to a non-existent source.

Required decisions include source, owner, unit, observation date, manual/import origin, requiredness, correction, visibility, and Before/After mapping.

### 14.3 Height and BMI

No accepted Height owner exists in the current rewrite. Height must not be selected from a convenient profile or legacy location without a semantic decision.

BMI is derived and remains blocked. Before any calculation, the contract must accept:

- authoritative Height and Weight sources;
- stage compatibility;
- unit normalization;
- precision and rounding;
- missing-input behavior;
- reproducibility;
- historical correction behavior.

Do not store BMI blindly and do not calculate it merely because the mathematical formula is familiar.

### 14.4 CVD risk

CVD risk remains fully blocked. An owner must provide the algorithm, version, authoritative reference, required inputs, units, missing-input behavior, scale, thresholds/categories, timing, reproducibility/version retention, and visibility. Do not choose an industry-common formula or copy a legacy calculation.

### 14.5 DTX, weight, waist, and BP semantics

The current raw fields can be factual candidates through exact source records. Their report meaning remains gated by context, unit, timing, precision, and customer/clinical labels. Do not convert DTX mg% to mg/dL or perform unit normalization in this phase. Do not claim a measurement was made at a clinical stage merely because it was recorded inside a stage workflow.

### 14.6 Achievement, success, outcome, and plan language

The current system stores progress inputs and target facts, but not an accepted achievement score. Do not invent:

- achievement rate;
- denominator;
- zero-target behavior;
- more-than-70-percent semantics;
- aggregate success score;
- ดีขึ้น;
- สำเร็จ;
- clinical outcome;
- official plan-adjustment or obstacle status.

Stored activity status is a fact. A derived percentage, success vocabulary, outcome, plan adjustment, or obstacle concept requires an accepted contract.

## 15. Safe factual projection subset

There is an implementation-ready narrow subset, but not an implementation-ready reproduction of the workbook.

The gated Patient ID/HN row below is recorded for contract completeness only; it is not part of the unconditional Phase 15E.1 output.

| Candidate | Safe status | Required boundary |
| --- | --- | --- |
| Hospital/site identity | SAFE NOW | Exact authorized relationship/Program scope. |
| Patient display name | SAFE WITH PROVISIONAL LABEL | PII permission must be explicit; no unrestricted cohort exposure. |
| Customer-facing Patient ID / HN | GATED — REQUIRES_SOURCE_DECISION; SAFE ONLY AFTER RPT-03 ACCEPTANCE | Omit from the Phase 15E.1 projection until RPT-03 is explicitly accepted. If accepted, expose only the approved identifier contract; internal IDs may remain technical DTO fields and are not customer-facing fields. |
| Program lifecycle start/completion | SAFE NOW | Label as lifecycle timestamps; nullable completion is not failure. |
| Linked Baseline presence | SAFE NOW | Use exact initialBaselineId only. |
| Linked Baseline raw weight/waist/BP/DTX | SAFE WITH PROVISIONAL LABEL | Preserve raw nullable values and recording/provenance metadata; do not call official clinical Before. |
| Program Follow-up count | SAFE NOW | Count exact Program-linked rows only; no relationship-wide fallback. |
| Program Follow-up rows | SAFE WITH PROVISIONAL LABEL | Use normalized 0..N history, local round numbers, and raw nullable fields. |
| Follow-up activity statuses | SAFE NOW | Project raw statuses/notes only; no achievement calculation. |
| Service 1 presence | SAFE NOW | Report record existence/recording facts; no success claim. |
| Service 1 artifact metadata | SAFE WITH PROVISIONAL LABEL | Do not expose private URLs or bypass storage authorization. |
| Goal Plan presence and exact source data | SAFE WITH PROVISIONAL LABEL | Project selected goals/targets as stored facts; do not invent customer categories. |
| Final presence | SAFE NOW | Exact Program Final only; missing Final is neutral. |
| Final raw weight/waist/BP/DTX | SAFE WITH PROVISIONAL LABEL | Raw Final facts only; do not label official clinical After. |
| Recorder and application recording timestamps | SAFE WITH PROVISIONAL LABEL | Label as recording/provenance time, not observation time. |

The subset must not classify disease, calculate health improvement, calculate BMI/CVD/achievement, derive Before/After deltas, merge episodes, or expose unauthorized PII.

## 16. Explicit DO-NOT-IMPLEMENT list for Phase 15E.0

Do not implement any of the following in this phase:

- production dashboard;
- report UI;
- report route;
- reporting query module;
- Excel export;
- PDF export;
- CSV export;
- Prisma schema changes;
- migrations;
- report tables;
- materialized views;
- cached aggregate tables;
- HbA1c persistence;
- Height persistence;
- BMI calculation;
- BMI persistence;
- CVD risk;
- DM / Pre-DM automatic classification;
- official achievement rate;
- official more-than-70-percent achievement count;
- success/failure outcome logic;
- unit normalization;
- DTX mg% to mg/dL conversion;
- clinical thresholds;
- Before/After deltas;
- trend arrows;
- improvement percentages;
- inferred missing values;
- relationship-wide latest-value fallback;
- fixed six Follow-up columns in persistence;
- Program A/B inheritance;
- generic observation framework;
- generic analytics framework;
- speculative report permissions;
- copying Dashboard ภาพรวม fields into รายงานการจัดบริการ without evidence;
- exposing private artifact URLs as report data.

## 17. Reporting architecture recommendation

The smallest maintainable architecture for the next implementation slice is a typed application-level projection over the transactional schema:

    Server Component or Route Handler
        ↓
    Reporting Application Service
        ↓
    Report Authorization / Scope Policy
        ↓
    Domain query services / Prisma select
        ↓
    Typed report projection DTO
        ↓
    Dashboard, table, and later export adapters

A dedicated reporting module is justified when the first factual projection is implemented because authorization, source selection, missing states, and DTO stability should not be duplicated across a page, route, and export. The recommended future shape is:

    src/modules/reporting/
        policies/
        services/
        projections/
        transport/

This phase does not create that module.

For MVP, a typed query/projection layer over the transactional schema is sufficient. It should:

- receive a server-derived scope, never a client-authorized Hospital scope;
- query exact relationship and Program keys;
- select only fields needed by the DTO;
- return raw source values plus explicit missing states;
- preserve source ownership and recording/provenance metadata;
- keep policy decisions outside the UI;
- provide a stable projection version when later export or audit reproducibility needs it.

Do not introduce a data warehouse, OLAP cube, CQRS/event sourcing, materialized reporting framework, generic analytics engine, generic export framework, FHIR reporting model, or EAV report schema without demonstrated scale or domain need.

## 18. Query shape and performance considerations

The first safe projection can be served by scoped indexed queries in the current prototype volume. Performance work must follow the accepted scope and source contract.

### 18.1 Main risks

- N+1 queries when loading each Program's Baseline, Service 1 records, Goal Plan, Follow-up rows, and Final separately for a cohort.
- Full relationship or full Hospital loading when the requested scope is one Program.
- Loading all Follow-up history into a fixed six-column UI without pagination or an explicit overflow rule.
- Computing aggregate counts before the DM/Pre-DM classification contract is accepted.
- Exporting PII rows without a bounded row limit, scope, and audit decision.
- Joining relationship-wide latest values and accidentally crossing Program episodes.

### 18.2 Recommended query shape for the factual foundation

For one exact Program:

1. Resolve the authenticated actor and server-side report scope.
2. Resolve the exact Program and relationship together.
3. Select Hospital, Person/PatientProfile, lifecycle fields, and initialBaselineId.
4. Select the linked Baseline only through the exact Program link and relationship consistency.
5. Select exact Program-owned Service 1 rows.
6. Select exact Program-linked Goal Plan rows and items.
7. Select exact Program-linked Follow-up rows, ordered by Program-local round and recording time, with explicit pagination if needed.
8. Select the exact Final row.
9. Map to a typed DTO without calculating clinical or achievement fields.

A Prisma nested select can be appropriate for a bounded Program detail projection if it does not load unbounded children without limits. Separate queries are appropriate when Follow-up pagination, authorization checks, or independently reusable domain services make the boundary clearer. The choice should be verified with query plans and actual volume, not theoretical optimization.

For a Hospital/cohort report, the future implementation must define scope and classification first, then use indexed filtering and cursor pagination. A cohort aggregate that depends on unresolved clinical classification is not made safe by optimizing the query.

Potentially useful current constraints/indexes include relationship/Hospital lookup, Program relationship/status/startedAt, initialBaselineId, Program Goal Plan, Program Follow-up/recordedAt and round uniqueness, Service 1 uniqueness, Final uniqueness, and assignment history. No cache or materialized view is justified by this audit alone.

## 19. Dashboard, tabular report, and export boundaries

The customer workbook provides layout evidence. It does not require pixel-for-pixel regeneration unless explicitly accepted.

| Concern | On-screen dashboard | Tabular report | Excel export | PDF export |
| --- | --- | --- | --- | --- |
| Primary purpose | Navigate and summarize authorized current facts | Inspect rows and source facts | Transfer/filter/analyze an authorized projection | Human-readable snapshot |
| Authorization | Separate report view capability; fail closed | Same or narrower row capability | Separate export capability | Separate export capability |
| Scope | Must be server-derived; cohort scope is open | Exact Program is the safe first scope | Explicit scope and row limit required | Explicit scope and page/row limit required |
| Filters | Require accepted filter semantics | Require accepted filter semantics | Must record applied filters | Must record applied filters |
| Missing values | Typed missing state rendered by an accepted locale label | Same | Stable machine/readable representation must be decided | Stable visual representation must be decided |
| PII | Minimize and role-gate | Minimize and role-gate | Explicit PII decision and protection | Explicit PII decision and protection |
| Generated-at | Display as generation time, not observation time | Display if useful | Required for reproducibility | Required for reproducibility |
| Timezone | Explicit application/report timezone | Explicit | File metadata/content decision | Header/footer/content decision |
| Audit/access logging | Report view logging decision required | Report view logging decision required | Access and download logging required by decision | Access and download logging required by decision |
| Projection version | Recommended when semantics stabilize | Recommended | Required for repeatability if used operationally | Required for repeatability if used operationally |
| Workbook shape | May use a safer responsive layout | May use normalized rows | Exact workbook reproduction is open | Workbook layout is not a PDF contract |

The report/export contract must decide file naming, generated-at timestamp, timezone, row limits, PII handling, audit retention, access logging, projection version, missing-value representation, and whether the supplied workbook is a required output format. None of these decisions is created by the blank template.

## 20. Requirement decision register

The following register separates decisions that affect the safe factual foundation from decisions that block clinical semantics or export. A safe factual Program projection must not be held hostage by unrelated CVD or cohort-classification decisions, but it must still use an explicit server-side authorization boundary.

| ID | Concept | Current evidence | Safe current behavior | Decision required | Classification | Impact | Recommended owner |
| --- | --- | --- | --- | --- | --- | --- | --- |
| RPT-01 | Report actor and access scope | Existing exact Program reads for HOSPITAL and assigned OSM; no report capability | Reuse only as a bounded candidate for exact Program facts | Define one Program, assigned patients, Hospital cohort, multi-Hospital, ADMIN, and PATIENT scopes | OPEN REQUIREMENT | BLOCKS_15E1 for a new report endpoint until adopted; CAN_USE_SAFE_FACTUAL_PROJECTION under explicit existing-scope reuse | Product owner + security/clinical governance |
| RPT-02 | Export authorization | No export capability exists | No export | Define separate Excel/PDF/CSV permissions, scopes, PII, and download controls | OPEN REQUIREMENT | BLOCKS_EXPORT | Product owner + security |
| RPT-03 | Customer-facing Patient ID / HN | Nullable relationship HN is the strongest current candidate; internal UUID, Program UUID, User ID, Person ID, and PatientProfile ID are technical identifiers | Do not expose a customer-facing Patient ID or HN report field until RPT-03 is accepted. Internal IDs may be used for authorization, ownership, routing, DTO identity, and Program/relationship correlation only; they are not display fields | Decide which identifier is customer-facing; whether HN is the intended workbook ID; label; uniqueness scope; visibility; masking if applicable; fallback when HN is null; and whether any internal ID is ever displayable | REQUIREMENT-GATED | CAN_USE_SAFE_FACTUAL_PROJECTION with customer-facing ID/HN omitted; DOES_NOT_BLOCK_15E1; BLOCKS_EXPORT if an identifier is required in files | Product owner + Hospital operations |
| RPT-04 | Illness duration | No field in current PatientProfile or relationship source | Omit or explicit no-current-source state | Define owner, unit, start-date semantics, correction, and visibility | NO_CURRENT_SOURCE | CAN_DEFER; BLOCKS_ILLNESS_REPORTING | Clinical owner + product owner |
| RPT-05 | OSM/caregiver projection | Exact active assignment and OSM identity exist | Project only within exact authorized relationship if allowed | Decide current versus historical assignment, name visibility, and aggregate exposure | REQUIREMENT-GATED | CAN_USE_SAFE_FACTUAL_PROJECTION for exact scope; BLOCKS_COHORT_REPORTING if unresolved | Product owner + security |
| RPT-06 | DM / Pre-DM classification | Screening prototype result is not an accepted classification authority | Do not count or classify | Accept authority, rule/version, effective date, correction, and cohort scope | BLOCKED | BLOCKS_CLINICAL_REPORTING; BLOCKS_OFFICIAL_COHORT_COUNTS | Clinical owner |
| RPT-07 | Official Before semantics | Exact initialBaselineId link exists; timing is not clinical observation | Project linked raw Baseline facts with provisional wording | Decide stage label, inclusion, timing, and unit | REQUIREMENT-GATED | BLOCKS_CLINICAL_REPORTING; CAN_USE_SAFE_FACTUAL_PROJECTION | Clinical owner + product owner |
| RPT-08 | Official During semantics | Exact Program Follow-up 0..N and progress records exist | Project raw Program history and local rounds | Decide whether fields are observations, activities, or service evidence and define stage labels | REQUIREMENT-GATED | BLOCKS_CLINICAL_REPORTING; CAN_USE_SAFE_FACTUAL_PROJECTION | Clinical owner + product owner |
| RPT-09 | Official After semantics | Exact Final 0..1 exists; completion is independent of Final | Project Final presence/raw fields with provisional wording | Decide whether and when Final is the official After assessment | REQUIREMENT-GATED | BLOCKS_CLINICAL_REPORTING; CAN_USE_SAFE_FACTUAL_PROJECTION | Clinical owner |
| RPT-10 | HbA1c | No accepted persistence or measurement contract | Omit and identify no source | Define source, owner, unit, observation date, import/manual origin, correction, visibility, and stage mapping | BLOCKED | BLOCKS_CLINICAL_REPORTING; BLOCKS_EXPORT if workbook field is mandatory | Clinical owner + data owner |
| RPT-11 | Height | No accepted current owner | Omit and identify no source | Choose authoritative owner and lifecycle/correction semantics | OPEN REQUIREMENT | BLOCKS_BMI_AND_HEIGHT_REPORTING; CAN_DEFER_15E1 | Clinical owner + architecture owner |
| RPT-12 | BMI | Derived; Height and contract absent | Do not calculate or persist | Accept inputs, units, stage compatibility, rounding, null behavior, and reproducibility | BLOCKED | BLOCKS_CLINICAL_REPORTING | Clinical owner + data owner |
| RPT-13 | CVD risk | No owner, algorithm, version, or input contract | Omit | Accept algorithm/version/source, inputs, units, missing behavior, scale, thresholds, timing, retention, and visibility | BLOCKED | BLOCKS_CLINICAL_REPORTING; CAN_DEFER_SAFE_FACTUAL_PROJECTION | Clinical owner |
| RPT-14 | DTX context and unit | Raw DTX fields exist in Baseline, Follow-up, and Final; context/unit is unresolved | Preserve raw source value with explicit provisional label; no conversion | Define context, unit, normalization, precision, timing, and display | REQUIREMENT-GATED | BLOCKS_CLINICAL_INTERPRETATION; CAN_USE_SAFE_FACTUAL_PROJECTION | Clinical owner + product owner |
| RPT-15 | BP, waist, and weight unit approval | Raw fields exist; current UI labels are not a customer contract | Preserve raw field and source unit only if known; do not normalize | Accept units, precision, range validation, and stage labels | REQUIREMENT-GATED | BLOCKS_CLINICAL_INTERPRETATION; CAN_USE_SAFE_FACTUAL_PROJECTION | Clinical owner |
| RPT-16 | Observation time and late entry | Current timestamps are lifecycle, business-date, recording, or persistence times; no generic observedAt | Show recording/lifecycle time with correct label | Define observation date/time, timezone, late entry/import/backdating, correction, and provenance | OPEN REQUIREMENT | BLOCKS_OFFICIAL_STAGE_TIMING; CAN_USE_SAFE_FACTUAL_PROJECTION | Clinical owner + architecture owner |
| RPT-17 | Achievement rate | Target and progress inputs exist; no accepted formula | Project target/progress facts only | Define numerator, denominator, partial/not-applicable rules, zero-target behavior, time window, and rounding | BLOCKED | BLOCKS_CLINICAL_REPORTING; BLOCKS_EXPORT_OF_ACHIEVEMENT | Clinical owner + product owner |
| RPT-18 | Count of achievement greater than 70 percent | Workbook note/evidence mentions more-than-70-percent count | Do not calculate or count | Define formula, threshold inclusivity, denominator, aggregation scope, and missing handling | BLOCKED | BLOCKS_CLINICAL_REPORTING; BLOCKS_EXPORT | Clinical owner |
| RPT-19 | Outcome vocabulary | Workbook has outcome cells; current Follow-up has no structured outcome field | Do not display success, failure, improved, or clinical outcome | Define vocabulary, source, actor, timing, correction, and authorization | BLOCKED | BLOCKS_CLINICAL_REPORTING; BLOCKS_EXPORT | Clinical owner |
| RPT-20 | Plan-adjustment reporting | Workbook has ปรับแผนใหม่; no structured current field | Do not infer from edits, notes, or later Goal Plan rows | Define event, source, actor, version, and display semantics | NO_CURRENT_SOURCE | BLOCKS_PLAN_REPORTING; CAN_DEFER_SAFE_FACTUAL_PROJECTION | Clinical owner + product owner |
| RPT-21 | Obstacle reporting | Workbook has มีอุปสรรค; no structured current field | Do not infer from free text or absence of progress | Define source, vocabulary, privacy, timing, and display | NO_CURRENT_SOURCE | BLOCKS_OBSTACLE_REPORTING; CAN_DEFER_SAFE_FACTUAL_PROJECTION | Clinical owner |
| RPT-22 | Missing-value representation | Current nullable fields and absent records are distinct; workbook is blank | Return typed missing states and render provisionally | Approve blank/ไม่ระบุ/ไม่มีข้อมูล, locale, exports, and machine representation | REQUIREMENT-GATED | CAN_USE_SAFE_FACTUAL_PROJECTION; BLOCKS_EXPORT_FORMAT | Product owner + data owner |
| RPT-23 | Fixed workbook shape versus flexible report | Workbook shows six visible Follow-up positions; current persistence is 0..N | Keep normalized source and use an adapter if needed | Decide whether UI/export must reproduce six positions and how overflow works | CUSTOMER EVIDENCE | CAN_USE_SAFE_FACTUAL_PROJECTION; BLOCKS_EXACT_WORKBOOK_EXPORT | Product owner |
| RPT-24 | Exact Excel export requirement | Workbook is a blank formatted template without formulas | Do not generate Excel | Confirm pixel/layout, sheet names, merged cells, formulas, row limits, and versioning | OPEN REQUIREMENT | BLOCKS_EXPORT | Product owner + customer |
| RPT-25 | PDF requirement | No PDF contract exists | Do not generate PDF | Define purpose, layout, page limits, PII, timezone, and source/version footer | OPEN REQUIREMENT | BLOCKS_EXPORT | Product owner + customer |
| RPT-26 | Audit and access logging | Domain mutations have audit/provenance patterns; report/export access contract absent | Do not assume ordinary read audit is sufficient | Define view/download events, actor/scope, retention, sensitive-value handling, and failure logging | OPEN REQUIREMENT | BLOCKS_EXPORT; BLOCKS_COHORT_REPORTING if required by policy | Security + product owner |
| RPT-27 | Report projection version and reproducibility | No reporting DTO/version exists | Keep source records authoritative | Define DTO/schema version, generated-at, timezone, and correction reproducibility | ENGINEERING_RECOMMENDATION | CAN_DEFER_15E1 for internal prototype; BLOCKS_OPERATIONAL_EXPORT | Architecture owner + product owner |
| RPT-28 | Cohort filter and aggregate semantics | Workbook has case-count headings; classification is unresolved | Support no official cohort count | Define Hospital/program status/date/assignment filters and denominator | REQUIREMENT-GATED | BLOCKS_COHORT_REPORTING; CAN_DEFER_SAFE_FACTUAL_PROJECTION | Product owner + clinical owner |
| RPT-29 | Screening/PAM/PROM report usage | Screening stores provisional JSON result and no Program link | Treat it as relationship assessment evidence only | Decide if/when Screening values are reportable and their stage/authority | REQUIREMENT-GATED | BLOCKS_OFFICIAL_SCREENING_REPORTING; CAN_DEFER_15E1 | Clinical owner |
| RPT-30 | Appointment report usage | Appointment is relationship-owned and may link a Follow-up | Project appointment workflow facts only if requested | Decide whether appointment status/date belongs in service report and its scope | REQUIREMENT-GATED | CAN_DEFER_15E1 | Product owner |

## 21. Phase 15E.1 implementation handoff

### Recommendation

Phase 15E.1 should be a narrow:

    Phase 15E.1 — Program Reporting Projection Foundation

It is implementation-ready only for a patient-level, exact-Program factual projection. It is not implementation-ready for the full workbook, Hospital-wide dashboard, clinical cohort counts, or exports.

### IMPLEMENT

Subject to explicit adoption of the server-side scope policy:

- a typed Program-level factual report DTO;
- exact Hospital, relationship, and Program lookup;
- exact Program authorization using the existing HOSPITAL direct-membership or OSM assignment boundary, or a new explicitly named report capability with the same fail-closed scope;
- Hospital/site identity;
- patient display name only within the authorized scope;
- no customer-facing Patient ID or HN field by default; omit it unless RPT-03 has been explicitly accepted before or during Phase 15E.1, in which case only the approved identifier contract may be added;
- Program lifecycle start and completion timestamps with lifecycle labels;
- linked Baseline presence through initialBaselineId;
- linked Baseline raw weight, waist, BP, and DTX values with explicit source and provisional stage labels;
- exact Program Follow-up count and paginated normalized rows;
- Program-local round numbers;
- raw Follow-up measurement fields and recording timestamps;
- raw Follow-up activity progress statuses;
- exact Service 1 record presence and safe factual metadata;
- exact Program-linked Goal Plan presence, selected goal facts, and target facts;
- exact Final presence and raw Final values;
- explicit missing states in the DTO;
- tests for source ownership, authorization, and Program A/B isolation.

### DO NOT IMPLEMENT

- dashboard-wide or Hospital-wide DM/Pre-DM counts;
- clinical Before/During/After claims;
- HbA1c, Height, BMI, CVD risk, or unit conversion;
- Before/After delta, trend, improvement, achievement, success, failure, or outcome fields;
- more-than-70-percent counts;
- plan-adjustment or obstacle facts not stored by the current source;
- relationship-wide latest fallback;
- six-column persistence or silent Follow-up truncation;
- unrestricted ADMIN, PATIENT, multi-Hospital, or export access;
- Excel, PDF, or CSV transport;
- private artifact URL exposure;
- HN or any other customer-facing Patient ID before explicit RPT-03 acceptance;
- new Prisma fields, report tables, migrations, caches, or materialized views.

### REQUIRED AUTHORIZATION

The server must:

1. authenticate the actor;
2. validate the requested exact Program identifier and any bounded filter input;
3. resolve the Program and relationship together;
4. apply the accepted report capability and exact Hospital membership or OSM assignment;
5. fail closed on mismatch, inactive assignment, missing relationship, or unsupported actor;
6. never treat a client-selected Hospital ID as permission;
7. keep export authorization separate from on-screen factual read authorization.

The first slice should not silently grant ADMIN or PATIENT access. If product chooses a different actor scope, that must be recorded as an accepted decision before implementation.

### SOURCE OF TRUTH

- Hospital: Hospital.
- Patient identity: Person and PatientProfile.
- Customer-facing Patient ID: no approved report source yet. Candidate: PatientHospitalRelationship.hospitalNumber. It may enter the projection only after RPT-03 is explicitly accepted. Internal relationship/Program IDs may remain in the DTO for technical ownership and correlation, but they are not customer-facing fields.
- Program lifecycle: exact PatientProgram.
- Before candidate: exact PatientProgram.initialBaselineId → PatientBaseline.
- During candidate: exact Program-linked PatientFollowup and PatientFollowupActivityProgress.
- Service 1: exact Program-owned Service 1 records and authorized artifact metadata.
- Service 2: exact Program-linked PatientGoalPlan and PatientGoalItem.
- Final candidate: exact PatientFinalAssessment.

The DTO is a projection and must not be written back as report truth.

### MISSING VALUE BEHAVIOR

The DTO must distinguish:

- no linked Baseline;
- no Final;
- source record exists but field is null;
- source domain does not exist;
- not yet available, only when the lifecycle rule is accepted;
- not authorized/out of scope, handled by an authorization failure rather than a clinical null.

The first implementation may return a typed discriminated state and leave exact Thai display labels to a later presentation contract. It must never map missing to zero, false, failure, normal, negative, no disease, or not achieved.

### PROGRAM ISOLATION

Every child query must constrain both the exact Program and its relationship. The implementation must include negative tests proving:

- Final A cannot appear in Program B;
- Follow-up A cannot appear in Program B;
- Baseline A cannot appear as Program B when B has no link;
- a relationship-wide latest record cannot satisfy a Program B source;
- pre-Program Goal Plan/Follow-up rows cannot appear as Program B rows;
- local round numbers do not merge across Programs.

### TEST REQUIREMENTS

At minimum, the next slice should test behavior:

- authorized HOSPITAL exact Program read succeeds;
- authorized OSM exact assigned Program read succeeds;
- inactive/ended OSM assignment fails closed;
- unrelated Hospital relationship fails closed;
- unsupported ADMIN-only and PATIENT access is denied unless separately accepted;
- Program A/B isolation for Baseline, Service 1, Goal Plan, Follow-up, and Final;
- Program with no initialBaselineId returns no linked Before source;
- Program with no Final returns no Final state, not failure;
- nullable raw fields remain absent and are not coerced;
- Follow-up history supports 0..N and does not require six records;
- raw progress status is not transformed into achievement;
- private artifact URLs are not present in the DTO;
- completed Program remains readable according to policy without fabricating a Final;
- source timestamps retain lifecycle versus recording semantics.

## 22. Verification

The Phase 15E.0 verification record is:

- Starting branch and HEAD were verified as main and 6259381afece5d3ecaf97d456da29f575cf00dc2.
- The workbook was inspected read-only and was not re-saved.
- The workbook sheets and used dimensions were re-inspected: Dashboard ภาพรวม A1:AQ29 and รายงานการจัดบริการ A1:BM37.
- The workbook SHA-256 remained F70B4FC42D31B5CA5FB9B9F8F915A91709B376A31839FA420A62F8103EFE7D43.
- Current Prisma schema, migrations, phase contracts, modules, authorization policies, and Program routes were inspected.
- Historical Phase 15A implementation-gap statements were reconciled in this document without rewriting the historical files.
- The source map preserves exact Program A/Program B isolation.
- No workbook label was promoted to a clinical formula, unit, timing rule, or permission without evidence.
- No calculation was invented.
- The new document is UTF-8 without BOM and was checked for replacement characters.
- No runtime code, Prisma schema, migration, generated file, or workbook was modified.
- git diff --check was run for the working tree.

No build, dev server, Prisma generate, or runtime test suite was run because this phase changes documentation only. Phase 15E.1 must add targeted authorization, projection, null-state, and isolation tests before any report transport is exposed.

The genuine blockers are customer/clinical-owner decisions in RPT-01 through RPT-30, especially report/export scope, customer-facing ID, timing, units, DM/Pre-DM, HbA1c, Height, BMI, CVD risk, achievement, outcome, missing-value presentation, and export requirements. Those blockers do not prevent a bounded exact-Program factual projection if its authorization boundary is explicitly adopted.
