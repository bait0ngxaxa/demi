# Phase 15D.2 — Measurement Semantics & Requirement-Gated Data Contract Consolidation

**Status:** Documentation-only contract and implementation-readiness review
**Starting branch:** `main`
**Starting HEAD:** `b93f7bf977061f6c778066a7fb9e87dbd712f921`
**Working tree at start:** Clean
**Scope:** Measurement meaning, data ownership, timing, provenance, stage mapping, and customer decision gates
**Out of scope:** Prisma persistence expansion, migrations, clinical calculations, Final Assessment UI, dashboards, exports, reporting implementation, and speculative clinical semantics

## 1. Baseline and scope

Phase 15D.2 re-audits the measurement concepts carried by the current rewrite and
maps the requirements needed before they can become official clinical or report
fields. It does not approve a unit, protocol, threshold, formula, outcome label,
or report interpretation merely because the prototype currently displays or stores
one.

The current Phase 15D.1 foundation is treated as an accepted implementation
boundary for this phase and is not reopened:

```text
PatientHospitalRelationship
  └── PatientProgram
        └── PatientFinalAssessment (0..1, immutable, CREATE + READ)
```

The Final Assessment may be created only while its Program is `ACTIVE`, may be
read historically after the Program is `COMPLETED`, is owned by the exact
Program and relationship, uses server-derived recorder and persistence time,
and contains only provisional raw nullable measurement fields. `recordedAt` is
not a clinical observation time.

This document therefore answers two separate questions:

1. What can safely remain as a factual prototype value?
2. What must remain requirement-gated before official field semantics,
   calculation, comparison, or reporting are implemented?

No current field is promoted to an official clinical contract by this document.

## 2. Evidence sources inspected

### 2.1 Requirements, architecture, and decision records

- [`docs/CONTEXT.md`](../CONTEXT.md) — rewrite context, source-of-truth order,
  authorization boundary, and unresolved clinical/reporting requirements.
- [`docs/architecture/DEMI_ARCHITECTURE_BASELINE.md`](../architecture/DEMI_ARCHITECTURE_BASELINE.md)
  — application boundary, server authority, transaction expectations, and
  anti-overengineering constraints.
- [`docs/adr/README.md`](../adr/README.md) and accepted ADR-0001 through
  ADR-0008 — especially server-side policy authority, transport/application
  service separation, transactional consistency, and no speculative framework.
- [`docs/phases/PHASE_15A_BUSINESS_FLOW_CONSOLIDATION.md`](PHASE_15A_BUSINESS_FLOW_CONSOLIDATION.md)
  — normalized relationship, Program, Baseline, Follow-up, and Final flow.
- [`docs/phases/PHASE_15A_REPORTING_DATA_MAP.md`](PHASE_15A_REPORTING_DATA_MAP.md)
  — workbook map, report projection boundaries, and requirement register.
- [`docs/phases/PHASE_15D0_FINAL_OUTCOME_CONTRACT_CONSOLIDATION.md`](PHASE_15D0_FINAL_OUTCOME_CONTRACT_CONSOLIDATION.md)
  — accepted evidence hierarchy for this domain, provisional measurement map,
  timing boundary, Program A/B isolation, and reporting handoff.
- [`docs/phases/PHASE_15D1_FINAL_ASSESSMENT_DOMAIN_PERSISTENCE.md`](PHASE_15D1_FINAL_ASSESSMENT_DOMAIN_PERSISTENCE.md)
  — current Final Assessment persistence and ownership foundation.
- [`docs/phases/PHASE_10A_PATIENT_PROFILE_BASELINE_STATUS_REQUIREMENTS.md`](PHASE_10A_PATIENT_PROFILE_BASELINE_STATUS_REQUIREMENTS.md)
  and [`docs/phases/PHASE_10C0_BASELINE_INITIAL_STATE_WORKING_PROTOTYPE.md`](PHASE_10C0_BASELINE_INITIAL_STATE_WORKING_PROTOTYPE.md)
  — earlier explicit statements that the Baseline measurement subset and its
  display units remain provisional, and that correction/history requirements
  remain open.

### 2.2 Current implementation

- [`prisma/schema.prisma`](../../prisma/schema.prisma) — exact model names,
  ownership relations, nullability, timestamps, and constraints.
- `src/modules/patient-baseline/**` — Baseline schema, service, query, policy,
  and tests.
- `src/modules/followups/**` — Follow-up schema, service, query, definitions,
  and tests.
- `src/modules/patient-final-assessment/**` — Final schema, service, query,
  access, and tests.
- `src/modules/patient-program/**` — Program creation, initial Baseline link,
  lifecycle, access, and query behavior.
- Current Baseline, Follow-up, Program, and nested route UI under
  `app/app/patients/[relationshipId]/**`, including the existing exact
  relationship-plus-Program route checks used by Goal Plan and Follow-up
  flows.

### 2.3 Customer workbook evidence

[`docs/Dashboard App Demi.xlsx`](../Dashboard%20App%20Demi.xlsx) was inspected
read-only with `openpyxl`. It contains the sheets `Dashboard ภาพรวม` and
`รายงานการจัดบริการ`. The workbook has formatted blank report layouts, no
sample records, no formulas, and no data-validation rules. Relevant labels
include:

- `Dashboard ภาพรวม!G4:AQ7`: `ข้อมูลเริ่มต้น(Before)`, `ระหว่างอยู่ในโปรแกรม`,
  `After`, `CVD risk score`, `HbA1C`, `DTX`, `BW.`, `BMI`, `ส่วนสูง`, `รอบเอว`,
  and BP `ตัวบน`/`ตัวล่าง`.
- `รายงานการจัดบริการ!I5:BM8`: Before and After DTX, BW, waist, BP, HbA1c,
  BMI, and related service/report columns.

The workbook is **CUSTOMER EVIDENCE** of report/layout intent. It does not by
itself establish field ownership, requiredness, approved units, measurement
context, algorithm authority, correction policy, observation timing, or report
access authorization.

### 2.4 Legacy evidence boundary

Legacy DEMI was used only for terminology and behavioral evidence already
recorded in the Phase 10 and Phase 15 documents. Legacy field names, form
defaults, client-side checks, and any historical calculation are not clinical
authority for the rewrite.

## 3. Evidence classification and interpretation rules

The following labels are used throughout this document:

| Label | Meaning in this document |
| --- | --- |
| `ACCEPTED` | Accepted architectural or lifecycle boundary already established for the rewrite, including the Phase 15D.1 Final ownership/lifecycle foundation. It is not automatically an accepted clinical meaning. |
| `CURRENT IMPLEMENTATION` | A field, validation, timestamp, route, or UI behavior that exists in the current rewrite. |
| `CUSTOMER EVIDENCE` | A workbook label or other customer-provided artifact indicating desired terminology or report shape, without sufficient contract detail. |
| `SAFE PROTOTYPE DEFAULT` | A deliberately narrow behavior that records or displays a fact without claiming clinical meaning. |
| `ENGINEERING RECOMMENDATION` | A recommended implementation boundary that still requires the relevant business/clinical decision where it changes meaning. |
| `REQUIREMENT-GATED` | Must not be promoted to an official field, calculation, classification, or report value until the listed contract is accepted. |
| `OPEN REQUIREMENT` | A customer/clinical owner decision not closed by repository evidence. |

The following are not treated as acceptance on their own:

- an existing database column;
- a current UI label or unit suffix;
- a workbook column or heading;
- a legacy behavior;
- a mathematically familiar formula;
- a value that happens to be present in an existing record.

## 4. Executive conclusion

1. **Weight, waist circumference, blood pressure, and DTX/blood sugar** already
   exist as raw prototype values in Baseline and/or Follow-up, and the five
   current Final fields exist in Phase 15D.1. They may remain as
   `SAFE PROTOTYPE FACTUAL CAPTURE` because the current services validate only
   bounded structural numbers and do not calculate, classify, or declare
   success.
2. Current labels `kg`, `cm`, `mmHg`, and `DTX / mg%` are
   `CURRENT IMPLEMENTATION`/provisional display evidence. They are not
   owner-approved clinical units in the current repository evidence.
3. The DTX terminology is not normalized in this phase. `bloodSugarDtx` in
   Baseline, `bloodSugar` in Follow-up and Final, `DTX` in the workbook, and
   `DTX / mg%` in the UI are mapped as related prototype terminology only. The
   repository does not establish that they are interchangeable official
   measurements, nor does it establish fasting/random/post-meal context,
   device, unit, or observation time.
4. **HbA1c and Height** have customer/workbook evidence but no accepted current
   rewrite persistence contract. They remain requirement-gated; no Prisma field
   is added.
5. **BMI** remains derived and must not be stored blindly. Its implementation
   is blocked by authoritative Height/Weight ownership, stage/timing
   compatibility, precision, missing-input, reproducibility, and report rules.
6. **CVD risk** is completely blocked. No algorithm, version, source, complete
   input contract, scale, threshold, or reproducibility policy is accepted. No
   common score may be selected by engineering and no legacy calculation may be
   promoted.
7. Current timestamps distinguish lifecycle and application recording events,
   not clinical observation time. This blocks official Before/During/After
   comparison and reporting semantics, but does not block retaining current raw
   prototype facts.
8. Program A and Program B remain isolated. Final A cannot become Final B's
   Before, latest Follow-up A cannot become Program B's Before, and a
   relationship-wide latest value is not automatically a Program source of
   truth. The nullable `PatientProgram.initialBaselineId` means a Program does
   not necessarily have an authoritative Before measurement.
9. **No schema change is required in Phase 15D.2.** The current nullable Final
   raw fields remain safe prototype capture. Renaming `bloodSugar` to
   `bloodSugarDtx` would create migration churn without closing the actual
   terminology contract.
10. Phase 15D.3 may integrate a factual, explicitly non-clinical Final view.
    Phase 15E must not turn those facts into official outcomes, comparisons,
    classifications, dashboard metrics, or exports until the decision gates
    below are closed.

## 5. Current ownership and field map

### 5.1 Current domain graph

| Domain | Current owner | Measurement shape | Current timing/provenance |
| --- | --- | --- | --- |
| Baseline | `PatientHospitalRelationship` | One immutable relationship-owned snapshot (`0..1`) | User supplies `recordedOn` date-only; server derives recorder and persists system timestamps. |
| Program | `PatientHospitalRelationship` → `PatientProgram` | One participation episode; `initialBaselineId` is nullable | `startedAt` and `completedAt` are server lifecycle timestamps. |
| Follow-up | Relationship-owned legacy-compatible row or exact `PatientProgram` row | Immutable `0..N`; Program rounds are local to that Program | `recordedAt` is server application recording time; actor is server-derived. |
| Final Assessment | Exact `PatientProgram` plus exact relationship | Immutable `0..1`; CREATE + READ only | `recordedAt` is server application persistence time; actor is server-derived. |

The current data model does not have a separate clinical Observation entity,
measurement source/device field, import provenance field, observation timestamp,
or official stage classification field.

### 5.2 Current raw field inventory

| Concept | Exists now? | Exact current fields | Current user-facing labels | Current domain ownership |
| --- | --- | --- | --- | --- |
| Weight | Yes | Baseline `weight`; Follow-up `weight`; Final `weight` | `น้ำหนัก (kg)` / `น้ำหนัก` | Relationship Baseline; relationship/Program Follow-up; exact Program Final. |
| Waist circumference | Yes | Baseline `waistCircumference`; Follow-up `waistCircumference`; Final `waistCircumference` | `รอบเอว (cm)` / `รอบเอว` | Same domain boundaries as Weight. |
| Blood pressure | Yes | Baseline `bloodPressureSystolic`, `bloodPressureDiastolic`; Follow-up `systolicBloodPressure`, `diastolicBloodPressure`; Final `systolicBloodPressure`, `diastolicBloodPressure` | Baseline `ความดันตัวบน (mmHg)`, `ความดันตัวล่าง (mmHg)`; Follow-up/Final same concepts | Same domain boundaries as Weight; systolic/diastolic are separate structural fields. |
| DTX / blood sugar | Yes, with differing names | Baseline `bloodSugarDtx`; Follow-up `bloodSugar`; Final `bloodSugar` | Baseline `ระดับน้ำตาลในเลือด (DTX / mg%)`; Follow-up `น้ำตาลในเลือด / DTX (DTX / mg%)`; detail views use `น้ำตาลในเลือด / DTX` | Same domain boundaries as Weight. |
| HbA1c | No current rewrite field | None in current Prisma/modules/UI | Workbook `HbA1C` only | Unresolved; no accepted owner. |
| Height | No current rewrite source | None in current Prisma/modules/UI | Workbook `ส่วนสูง`; legacy form terminology only | Unresolved; no accepted owner. |
| BMI | No current field or calculation | None | Workbook `BMI` only | Derived ownership unresolved; must not be persisted in this phase. |
| CVD risk | No current rewrite field or approved calculation | None | Workbook `CVD risk score` only | Algorithm and output ownership unresolved; completely blocked. |

Current structural validation is intentionally not a clinical validator. Baseline
measurement values use finite positive bounded numbers; Follow-up and Final use
finite nonnegative bounded numbers. Values are nullable/optional in those input
contracts, except that a Final Assessment must contain at least one of its five
raw measurements. The difference between these structural guards is
`CURRENT IMPLEMENTATION`, not an approved clinical range or zero-validity rule.

## 6. Raw measurement re-audit

### 6.1 Weight

**Existence and names — `CURRENT IMPLEMENTATION`**

- `PatientBaseline.weight` is relationship-owned and nullable.
- `PatientFollowup.weight` is nullable and may belong to an exact Program when
  created through the Program path; older relationship rows may have a null
  Program owner.
- `PatientFinalAssessment.weight` is nullable and exact-Program-owned.

**Labels and unit evidence**

- Current Baseline and Follow-up UI labels display `น้ำหนัก (kg)` or `น้ำหนัก`
  with `kg`.
- The Final model has no unit column and no Final UI yet.
- The workbook uses `BW.` in Before, during-Program, and After report
  positions, but does not supply a unit contract.
- `kg` is therefore `CURRENT IMPLEMENTATION` and a `SAFE PROTOTYPE DEFAULT`
  for the existing factual display only. It is not an `ACCEPTED` owner-approved
  clinical unit based on the inspected evidence.

**Source, stage, and timing**

- Candidate BEFORE source: the Baseline only when the Program's
  `initialBaselineId` explicitly points to that Baseline and the Baseline has a
  weight value.
- Candidate DURING source: zero or more Program-scoped Follow-up values.
- Candidate AFTER source: the Program's Final Assessment weight, if a Final
  exists. Program completion or the latest Follow-up does not substitute for a
  Final.
- Baseline has user-supplied `recordedOn`; Follow-up and Final have server
  `recordedAt`. None is currently an authoritative clinical observation time.

**Context, source, and correction**

No accepted evidence specifies clothing, scale/device, location, measurement
protocol, manual versus imported source, observation time, requiredness for a
stage, or a correction/amendment workflow. Baseline and Follow-up are currently
immutable after creation; Final is immutable after creation. That is an
accepted/provisional persistence behavior, not a complete clinical correction
policy.

**Semantic position**

Weight is a raw factual prototype value. No automatic trend, improvement,
success, threshold, or report comparison is safe. Retention is safe;
official interpretation remains `REQUIREMENT-GATED`.

### 6.2 Waist circumference

**Existence and names — `CURRENT IMPLEMENTATION`**

- `PatientBaseline.waistCircumference` is relationship-owned and nullable.
- `PatientFollowup.waistCircumference` is nullable and may be Program-owned.
- `PatientFinalAssessment.waistCircumference` is nullable and Program-owned.

**Labels and unit evidence**

- Current UI displays `รอบเอว (cm)` / `รอบเอว` and `cm`.
- The workbook shows `รอบเอว` in Before and After positions; it does not
  provide a visible unit or protocol.
- `cm` is `CURRENT IMPLEMENTATION` only, not an approved owner contract.

**Stage, context, source, and timing**

- Candidate BEFORE/DURING/AFTER sources follow the same explicit Baseline,
  Program Follow-up, and Program Final rules as Weight.
- The workbook does not show a visible during-Program waist column, but the
  current Follow-up and Final structures can carry a raw waist value. That
  structural possibility must not be converted into a report-stage decision.
- No measurement location, posture, tape/protocol, device/source, manual or
  import path, observation timestamp, or late-entry rule is accepted.

**Semantic position**

Waist is a raw factual prototype value. No risk threshold, healthy/unhealthy
classification, trend, or success conclusion may be inferred. Retention is
safe; official semantics and reporting are `REQUIREMENT-GATED`.

### 6.3 Blood pressure

**Exact field-name differences — `CURRENT IMPLEMENTATION`**

| Domain | Systolic field | Diastolic field |
| --- | --- | --- |
| Baseline | `bloodPressureSystolic` | `bloodPressureDiastolic` |
| Follow-up | `systolicBloodPressure` | `diastolicBloodPressure` |
| Final Assessment | `systolicBloodPressure` | `diastolicBloodPressure` |

The naming difference is documented, not silently normalized in this phase.

**Labels and unit evidence**

- Baseline form labels the components as `ความดันตัวบน (mmHg)` and
  `ความดันตัวล่าง (mmHg)`.
- Follow-up UI uses the same `mmHg` label family; its definitions expose
  `ความดันตัวบน`, `ความดันตัวล่าง`, and unit `mmHg`.
- The workbook maps BP to Before/After `ตัวบน` and `ตัวล่าง`.
- `mmHg` is current UI/report terminology, not an owner-approved unit
  contract in the inspected evidence.

**One observation versus two structural values**

Clinically, the two values might later be required to describe one paired BP
observation. The current rewrite does not establish that rule. It stores two
nullable structural values, and current Final schema tests deliberately accept
one component without inventing a pairing requirement. Baseline read UI can
render a combined display while showing a missing half as `ไม่ระบุ`; this is a
presentation behavior, not pairing validation.

Therefore:

- current structural behavior is retained;
- missing-half handling remains an open requirement;
- no BP classification or threshold is implemented;
- no protocol, number of readings, rest period, position, device, source,
  averaging, or observation time is inferred.

**Stage, provenance, and correction**

Candidate BEFORE/DURING/AFTER sources are respectively an explicitly linked
Baseline, Program Follow-ups, and Program Final. The timestamps are recording
timestamps, not observation timestamps. No device/import/manual-source field is
currently persisted. Immutable history is a prototype persistence choice;
clinical correction, review, replacement, and amendment are open.

**Semantic position**

Systolic and diastolic values are raw factual prototype fields. They are not a
single approved clinical observation contract, classification, or outcome.

## 7. DTX terminology and semantics map

### 7.1 Exact terminology map

| Term | Where it appears | Evidence classification | What can safely be concluded |
| --- | --- | --- | --- |
| `DTX` | Workbook headings and current UI labels | `CUSTOMER EVIDENCE` + `CURRENT IMPLEMENTATION` | DTX is a customer/prototype term that must be clarified; the repository does not define its official unit or context. |
| `blood sugar` / `ระดับน้ำตาลในเลือด` | Thai UI descriptions and Follow-up detail labels | `CURRENT IMPLEMENTATION` | The UI presents a blood-sugar concept, but does not establish clinical equivalence or measurement context. |
| `blood glucose` | Conceptual English synonym only in analysis/legacy terminology | `OPEN REQUIREMENT` | Do not silently substitute it as the official contract for DTX. |
| `bloodSugarDtx` | `PatientBaseline` field and Baseline input key | `CURRENT IMPLEMENTATION` | Baseline raw field name. It is not evidence that all later fields must use this name. |
| `bloodSugar` | `PatientFollowup` and `PatientFinalAssessment` fields | `CURRENT IMPLEMENTATION` | Follow-up/Final raw field name. Do not rename in this phase. |
| `DTX / mg%` | Baseline and Follow-up UI labels/definitions | `CURRENT IMPLEMENTATION` | Provisional display text. It is not an approved unit normalization to `mg/dL` or another unit. |

These terms are related by current product language, not proven to be
interchangeable official measurements. The current contract does not answer
whether the customer specifically means capillary DTX, a generic blood glucose
result, a lab result, or a display alias.

### 7.2 Current DTX data map

- Baseline: `PatientBaseline.bloodSugarDtx`, nullable, relationship-owned.
- Follow-up: `PatientFollowup.bloodSugar`, nullable, relationship/Program
  scoped according to the row owner.
- Final: `PatientFinalAssessment.bloodSugar`, nullable, exact Program-owned.
- Current labels: `ระดับน้ำตาลในเลือด (DTX / mg%)` and
  `น้ำตาลในเลือด / DTX (DTX / mg%)`.
- Workbook: `DTX` in Before, during-Program, and After report positions.

### 7.3 Known and unknown semantics

Known as `CURRENT IMPLEMENTATION`:

- the current field names and nullable structural input behavior;
- the current UI text containing `DTX / mg%`;
- server-derived recorder and recording timestamps;
- no automatic calculation or classification;
- immutable Baseline, Follow-up, and Final persistence behavior in the current
  slices.

Unknown as `OPEN REQUIREMENT`:

- whether the required concept is DTX specifically or generic blood glucose;
- approved unit and display unit;
- fasting, non-fasting, random, post-meal, or other context;
- device, specimen, lab, manual-entry, or import source;
- observation date/time and relationship to recording time;
- requiredness at Before, during, or After stages;
- acceptable precision and structural/clinical validation authority;
- whether a value can be imported and how its source is identified;
- whether missing DTX is allowed in an official report;
- whether DTX values may be clinically classified or compared.

The current `mg%` suffix must not be silently changed to `mg/dL`, and no
interpretation may be derived from the numeric value.

## 8. HbA1c requirement contract

The workbook provides `HbA1C` in Before and After report positions. No current
rewrite Prisma model, validation schema, service, or UI field carries HbA1c.
This is `CUSTOMER EVIDENCE`, not an accepted persistence contract.

The following checklist must be answered before HbA1c can be added:

| Requirement | Decision needed | Why it gates implementation |
| --- | --- | --- |
| Field/domain owner | Is HbA1c owned by a relationship, a Program episode, a Baseline/Final observation, or a separate lab/assessment domain? | Determines foreign keys, isolation, and report joins. |
| Program ownership | Is there one relationship value, one value per Program, or multiple observations per Program? | Prevents Program B from inheriting or overwriting Program A. |
| Stage usage | Is it Before only, Before + After, during-Program, or all stages? | Determines capture points and report projection. |
| Unit | Which unit must users record and display? | Prevents unsafe unit conversion or mislabeled values. |
| Precision | What decimal precision is required for entry, storage, and display? | Determines structural validation and reproducible presentation. |
| Structural validation | What values are syntactically acceptable, including missing/zero/negative behavior? | Separates input-shape rules from clinical validity. |
| Clinical validation authority | Who defines acceptable clinical ranges or rejects a result? | Engineering must not invent a medical range. |
| Observation date/time | What date/time identifies the clinical measurement? | Separates measurement time from application recording time. |
| Lab/sample date | Is a specimen collection or lab result date needed separately? | A lab result may have more than one meaningful time. |
| Recording/import time | Should server recording time remain separately captured? | Required for provenance and late-entry behavior. |
| Entry mode | May staff enter manually, import from a lab, or both? | Determines source/provenance and duplicate semantics. |
| Source/provenance | Which lab/provider/device/import reference is required? | Enables traceability without inventing a generic provenance system. |
| Recorder authority | Which roles may record, review, import, or correct it? | Determines server authorization. |
| History/correction | Is the value immutable, amendable, superseded, voidable, or versioned? | Determines history and report reproducibility. |
| Missing values | Is absence allowed, and how must it appear in reports? | Prevents blank from being interpreted as failure. |
| Report projection | Which exact Before/After value and date are shown? | Defines report source and avoids latest-value inference. |

Until these are accepted, HbA1c is `REQUIREMENT-GATED` and blocks the specific
HbA1c field and any official report using it. It must not be added to Prisma in
Phase 15D.2.

## 9. Height ownership analysis

Height appears in the workbook as `ส่วนสูง` in the initial/report context and in
legacy terminology, but there is no accepted current rewrite source, field,
validation contract, or UI input. Height is therefore `OPEN REQUIREMENT`.

The owner decision has materially different architectural consequences:

| Candidate ownership | Consequence if selected | Program A → B implication |
| --- | --- | --- |
| Person-level or relatively stable `PatientProfile` attribute | One current value may be reused across relationships/Programs; correction and effective-date policy becomes profile governance, not a Program observation. | Program B could reference the same profile value only if the customer explicitly defines that reuse and its timing. |
| Relationship/hospital-specific value | Value belongs to a specific patient–hospital relationship and may vary by care setting; correction/history is relationship-scoped. | It may be reusable within that relationship only under an explicit effective-date rule; it is not automatically a Program Before. |
| Program-specific BEFORE observation | Each Program carries an independent initial height; isolation and report reproducibility are clear, but the same person's stable height may be duplicated. | Program B must capture or explicitly link its own accepted observation; no implicit copy from A. |
| Baseline-owned value | Height joins the existing relationship-owned Baseline snapshot and follows its one-per-relationship immutable boundary. | A later Program may have no distinct Before if the Baseline was used by an earlier Program; the current model cannot represent a second Program-specific Baseline. |
| Separately versioned observation | History, observation dates, source, and corrections can be represented explicitly. | Requires a concrete domain decision and additional persistence scope; does not justify a generic measurement table in this phase. |

The customer must select the conceptual owner, whether Height is needed After or
during the Program, unit/precision, observation timing, source/manual/import
behavior, and correction policy. Until then, no Height persistence is added and
no BMI input is treated as available.

## 10. BMI dependency and formula-readiness contract

BMI is present only as a workbook label. It has no current rewrite field or
calculation and must remain **DERIVED — DO NOT STORE BLINDLY**.

Before any implementation, the following dependency contract must be accepted:

1. The authoritative Height owner and observation source are identified.
2. The authoritative Weight owner and observation source are identified.
3. The customer defines whether BEFORE BMI uses the weight in the explicitly
   linked initial Baseline, rather than a relationship-wide latest value or a
   previous Program's Final.
4. The customer defines whether AFTER BMI uses the weight in the current
   Program's Final, and what happens when no Final exists.
5. Height and Weight observations must have compatible timing. The rule for
   using values recorded on different dates must be explicit.
6. Accepted units and any conversion rules are defined. Engineering must not
   infer a conversion from a current UI suffix.
7. The formula/name/version and its authoritative source are approved. The
   existence of a well-known mathematical formula does not resolve the input
   ownership or report-stage contract.
8. Decimal precision and rounding for calculation, storage if materialized,
   display, and export are defined.
9. Missing-input behavior is defined. Missing Height, Weight, or an incompatible
   timestamp must not silently produce a value or a failure classification.
10. The customer chooses read/report-time calculation versus materialization.
    If materialized, the system must preserve enough source/version information
    to reproduce the result.
11. Report projection rules define which BMI result belongs to Before and After,
    which source dates are shown, and how recalculation behaves after a source
    correction.

BMI is therefore `REQUIREMENT-GATED`, blocks `BLOCKS_CALCULATION` and
`BLOCKS_FINAL_REPORTING`, and must not be persisted in Phase 15D.2.

## 11. CVD-risk algorithm-readiness contract

CVD risk is completely blocked from official implementation. The workbook's
`CVD risk score` heading is customer evidence of a desired report column only.
No current rewrite algorithm or accepted clinical authority was found.

The customer/clinical owner must provide all of the following:

- exact algorithm or score name;
- algorithm version and authoritative source;
- complete required inputs and whether age, sex, treatment, smoking, diabetes,
  laboratory values, or other dependencies apply;
- unit contract for every input;
- source observation timing for every input and compatibility rules;
- handling of missing, stale, conflicting, or imported inputs;
- output scale, including percentage versus another score representation;
- rounding and decimal precision;
- risk category/threshold definitions, if categories are required;
- interpretation wording and who is allowed to see it;
- reproducibility requirements and whether algorithm version/input snapshot must
  be persisted;
- report timing and Before/After source selection;
- recalculation behavior when an input is corrected or a Program changes state;
- whether the value can ever be manually imported versus calculated by the
  system.

Engineering must not search for a “reasonable” CVD formula, choose a common
score, infer thresholds, or promote a legacy implementation to authority.

Classification: `REQUIREMENT-GATED` + `OPEN REQUIREMENT`. Blocks
`BLOCKS_CALCULATION`, `BLOCKS_FINAL_REPORTING`, and `BLOCKS_15E`.

## 12. Recording time versus observation time

### 12.1 Current timestamp matrix

| Current concept | Current field | Supplied by | What it means now | Backdating/late entry | Separate `observedAt` needed? | Impact |
| --- | --- | --- | --- | --- | --- | --- |
| Program start | `PatientProgram.startedAt` | Server | Program lifecycle start/persistence event | Not a measurement date | Potentially, for any measurement captured at start | Does not establish a Baseline observation or official Before window. |
| Baseline business date | `PatientBaseline.recordedOn` | User input, validated as date-only | Date the initial state was recorded or applies to, per the prototype contract | Historical dates are currently selectable; this is current UI behavior, not an accepted clinical backdating policy | Requirement-gated if exact clinical time or a separate observation date is required | Raw Baseline capture remains possible; official Before timing/reporting is blocked. |
| Baseline system timestamp | `PatientBaseline.createdAt` | Server/database | Persistence timestamp | No user backdating of this system timestamp | Does not replace observation time | Provenance only; not a clinical observation. |
| Follow-up recording | `PatientFollowup.recordedAt` | Server | Application recording time | No accepted client-supplied observation time or import-late-entry policy | Requirement-gated | Raw Follow-up history remains possible; stage comparison is blocked. |
| Final recording | `PatientFinalAssessment.recordedAt` | Server/application service | Final raw record persistence/recording time | Final creation is restricted to an ACTIVE Program; no late write after completion | Requirement-gated | Safe to display as recording time; not an After observation time. |
| Program completion | `PatientProgram.completedAt` | Server | Lifecycle completion timestamp | Controlled lifecycle transition | Not a measurement time | Completion is not Final completion, last measurement, or clinical success. |

### 12.2 Domain consequence

For Weight, waist, BP, DTX, and any future HbA1c/Height value, the current
recording timestamp does not prove when the patient was observed. The repository
does not define a Before window, during-Program window, After window, allowable
backdating, late data entry, or whether a measurement recorded after Program
completion may still belong to the Program.

A separate `observedAt` field may eventually be required for a specific domain,
but Phase 15D.2 does not add a generic field or provenance framework merely for
future flexibility. The customer must first decide which domains need observation
time, what precision is required, and how late/imported data is represented.

The timing gap blocks official stage assignment, Before/After comparison, and
Final reporting semantics. It does not block the existing factual prototype
capture where the current owner and lifecycle are already safe.

## 13. Normalized BEFORE / DURING / AFTER source matrix

The following is a candidate source map, not an approved clinical report map.
“Provisional” means the source can be displayed as an explicitly raw value when
present; it does not mean that the source is complete or clinically authoritative.

| Concept | BEFORE candidate source | DURING candidate source | AFTER candidate source | Current reliability |
| --- | --- | --- | --- | --- |
| Weight | `PatientBaseline.weight` only when the current Program explicitly links that Baseline through `initialBaselineId` | `PatientFollowup.weight` for the exact Program, zero or more rounds | `PatientFinalAssessment.weight` for the exact Program, if present | Provisional raw capture; no universal Before exists. |
| Waist circumference | Explicitly linked Baseline waist | Program-scoped Follow-up waist when supplied; workbook does not show a visible round column | Program Final waist when supplied | Provisional raw capture; protocol and stage timing open. |
| Blood pressure | Explicitly linked Baseline `bloodPressureSystolic`/`bloodPressureDiastolic` | Program-scoped Follow-up components | Program Final components | Provisional raw components; pairing and protocol open. |
| DTX / blood sugar | Explicitly linked Baseline `bloodSugarDtx` | Program-scoped Follow-up `bloodSugar` | Program Final `bloodSugar` | Provisional raw terminology; DTX/unit/context open. |
| HbA1c | None in current rewrite | None in current rewrite | None in current rewrite | Blocked; workbook evidence only. |
| Height | None in current rewrite; workbook shows initial/report intent | None in current rewrite | None in current rewrite | Ownership and source unresolved. |
| BMI | Derived from approved Height + Weight sources only after timing contract | Derived only if a customer-approved during-Program definition exists | Derived from approved current Program After sources only | Blocked; do not store or infer. |
| CVD risk | None until algorithm and input snapshot are accepted | Not assumed | None until algorithm and input snapshot are accepted | Completely blocked. |

The nullable `PatientProgram.initialBaselineId` is important: it is an explicit
link, not a guarantee that every Program has a Baseline or an authoritative
Before measurement. No matrix row may fall back automatically to:

- the latest relationship value;
- a Baseline used by Program A;
- Program A's Final;
- Program A's latest Follow-up;
- a Follow-up with a null Program owner;
- the most recently recorded value regardless of observation stage.

## 14. Program A → Program B measurement isolation

### 14.1 Scenario

```text
Relationship R

Program A
  initial context A
  Follow-ups A
  Final A
  COMPLETED

Program B
  initial context B ?
  Follow-ups B
  Final B ?
```

### 14.2 Already safe — `ACCEPTED`

- Final A is owned by Program A and Final B, if created, is owned by Program B;
  `Final A ≠ Final B`.
- A completed Program remains readable but cannot receive a second Final or
  new Program-scoped writes.
- Exact Program access checks include the relationship ownership chain.
- Program-local Follow-up rounds are independent; round 1 in B is not round 1
  in A.
- Final A cannot automatically become Program B's Before.
- Latest Follow-up A cannot automatically become Program B's Before.
- A relationship-wide latest value cannot automatically become the source of
  truth for Program B.

### 14.3 Unresolved data-model gap — `OPEN REQUIREMENT`

The current Baseline is relationship-owned and unique per relationship, while a
Program's `initialBaselineId` is nullable and explicitly links an existing
Baseline only under the current reuse rules. If the customer requires a distinct
Program B-specific Before snapshot after Program A has used the relationship
Baseline, the current model cannot represent that requirement.

The correct next step is a customer decision about Program-specific initial
context and its ownership. It is not implicit copying, latest-value selection,
or a silent reclassification of a prior record. No persistence expansion is
made in Phase 15D.2.

## 15. Semantic layer versus persistence layer

The phase boundary must remain explicit:

```text
RAW PERSISTED FACT
        ↓
DERIVED VALUE
        ↓
CLINICAL INTERPRETATION / CLASSIFICATION
        ↓
REPORT PROJECTION
```

| Layer | Current example | Current status |
| --- | --- | --- |
| Raw persisted fact | Weight, waist, BP components, DTX/blood-sugar values | Safe prototype capture where the current owner/lifecycle exists; no official unit/context claim. |
| Derived value | BMI from an approved Height + Weight input pair | Not implemented; requirement-gated. |
| Clinical interpretation/classification | DTX category, BP category, BMI category, CVD risk category, improvement/success | Not implemented; no accepted thresholds or authority. |
| Report projection | Before, during rounds, After, outcome score, dashboard/export column | Workbook is a projection template/customer evidence; no official source-selection or report-access contract is implemented. |

For example, a raw DTX value may later feed an approved clinical
interpretation, which may later feed a report classification. None of those
later layers is implied by the raw `bloodSugarDtx`/`bloodSugar` field. Likewise,
`PatientProgram.status` is a lifecycle state and must not be rendered as a
clinical result.

Absence is also a data state: no Final Assessment is not clinical failure, and a
completed Program is not proof that an outcome was completed or successful.

## 16. Current Final Assessment compatibility

### 16.1 Compatibility conclusion

Keeping the following nullable raw fields is safe as
`SAFE PROTOTYPE FACTUAL CAPTURE`:

- `PatientFinalAssessment.weight`
- `PatientFinalAssessment.waistCircumference`
- `PatientFinalAssessment.systolicBloodPressure`
- `PatientFinalAssessment.diastolicBloodPressure`
- `PatientFinalAssessment.bloodSugar`

This conclusion is limited to persistence of bounded factual values under the
accepted Phase 15D.1 Program ownership/lifecycle. It does **not** approve their
official clinical semantics, unit, observation time, source, correction policy,
Before/After comparison, or report meaning.

### 16.2 Why no schema change is required

- Phase 15D.1 already enforces exact Program + relationship ownership, 0..1
  Final cardinality, ACTIVE-only creation, historical read, server-derived
  recorder/time, and immutable CREATE + READ behavior.
- Final input is strict and accepts only the current five raw fields; at least
  one measurement must be present; no clinical range or threshold is invented.
- BP components remain structurally independent, matching the current Baseline
  and Follow-up conventions. Phase 15D.2 does not invent a pairing rule.
- `bloodSugar` remains the current Final field name. Renaming it to
  `bloodSugarDtx` would not resolve whether DTX and blood sugar are clinically
  equivalent and would create migration churn.
- The Final record has no fallback to Baseline or Follow-up, preserving episode
  isolation.

Therefore Phase 15D.2 requires **NO schema, migration, source, route, UI, or
test change**. The current fields may remain until a customer-approved contract
requires a narrowly scoped change.

## 17. Customer requirement questionnaire

These questions are intentionally business/clinical decisions. They do not ask
the customer to choose database types or other engineering implementation
details.

### P0 — needed before implementing a specific field/domain safely

| ID | Decision question | Why it matters / what it blocks |
| --- | --- | --- |
| P0-01 DTX | Does the customer require **DTX specifically**, generic blood glucose, or both? Which unit and display label are approved? | Prevents silently treating `bloodSugarDtx`, `bloodSugar`, and `DTX / mg%` as interchangeable. Blocks an official DTX field and report semantics. |
| P0-02 DTX context | Is each DTX value fasting, random/non-fasting, post-meal, or another context? Is the context required? | The same numeric value can have different meaning. Blocks DTX interpretation and official comparison. |
| P0-03 DTX source | May staff enter DTX manually, import it, or both? What device/lab/provider/source reference and observation date/time must be retained? | Determines provenance and late-entry behavior. Blocks official DTX capture/reporting. |
| P0-04 Existing raw measurements | Confirm approved units, precision, requiredness, and measurement context for Weight, Waist, and BP. | Current `kg`, `cm`, and `mmHg` are only UI evidence. Blocks official field contracts. |
| P0-05 BP structure | Are systolic and diastolic required as one paired observation? What is the missing-half rule and measurement protocol? | Current fields are independent nullable values. Blocks official BP observation and classification. |
| P0-06 HbA1c | What owner, Program/relationship scope, Before/After use, unit, precision, validation authority, observation/lab/sample date, source/import path, recorder roles, correction policy, missing-value rule, and report projection apply? | Closes the minimum HbA1c contract. Blocks HbA1c persistence and reporting. |
| P0-07 Height | Is Height a stable Person/Profile value, relationship/hospital value, Baseline value, Program-specific Before value, or separately versioned observation? Is it needed After or during the Program? | Ownership changes Program B isolation and BMI inputs. Blocks Height persistence and BMI. |
| P0-08 Program-specific Before | Must every Program capture its own initial context, or may an explicitly linked relationship Baseline be reused? If reusable, under what time/episode rule? | Current `initialBaselineId` is nullable and cannot represent every possible Program-specific Before. Blocks authoritative Before reporting. |
| P0-09 Observation timing | What defines Before, During, and After windows? Are historical/backdated or late/imported observations allowed, and which date selects the report stage? | Current timestamps are recording/lifecycle times only. Blocks official stage comparison and report selection. |

### P1 — needed before official Before/After reporting

| ID | Decision question | Why it matters / what it blocks |
| --- | --- | --- |
| P1-01 BMI | Which approved Height and Weight observations form Before and After BMI? What timing compatibility, unit conversion, formula/version, precision, rounding, missing-input, recalculation, and report rules apply? | Blocks BMI calculation and any official BMI report field. |
| P1-02 CVD risk | What exact algorithm/name/version/source, inputs/units, input timing, missing behavior, scale, rounding, categories/thresholds, interpretation, reproducibility, version persistence, and recalculation policy are approved? | Blocks CVD calculation, classification, and reporting. |
| P1-03 Source/import | For every official measurement, what source categories are allowed (manual, device, lab, import), what provenance is required, and who may review/accept imported values? | Blocks reliable official reporting and source traceability. |
| P1-04 Correction/history | Are records immutable, amendable, superseded, voidable, or versioned? Who may correct them, and which value/date is used in a historical report? | Blocks reproducible official reports and safe correction behavior. |
| P1-05 Report Before/After | Does Before mean the linked initial observation, a date window, or another explicit source? Does After require a Final, a measurement window, or both? How should missing Final/measurements render? | Prevents latest-value inference and “blank means failure.” Blocks Phase 15E final reporting. |
| P1-06 Report authorization | Which roles may view/export individual reports, aggregate reports, and measurement detail? | Report access/export is a separate authorization contract. Blocks production reporting/export. |

### P2 — can defer beyond the demo

| ID | Decision question | Why it matters / what it blocks |
| --- | --- | --- |
| P2-01 Overflow projection | How should more than six Follow-up rounds appear in a wide dashboard/export layout? | Current source history is normalized `0..N`; only the wide projection can defer. Blocks only the eventual overflow layout. |
| P2-02 Presentation wording | Which Thai/English labels and non-clinical disclaimers should appear for provisional raw values? | Needed before polished UI copy, but does not require new persistence. |
| P2-03 Report formatting | Which workbook columns, ordering, empty-state text, and date display are required after source semantics are approved? | Formatting can follow the accepted data contract; it must not define that contract. |

## 18. Blocker and decision matrix

| ID | Concept | Current evidence | Current implementation | Safe prototype position | Missing decision | Classification | Blocks | Recommended action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| M-01 | Weight | Current Baseline/Follow-up/Final fields; workbook BW Before/during/After; `kg` UI label | Nullable raw bounded values; separate domain owners; recording dates/times | Retain and display as captured with non-clinical wording | Approved unit, context, source, observation timing, requiredness, correction, comparison rule | `CURRENT IMPLEMENTATION` + `SAFE PROTOTYPE DEFAULT` + `REQUIREMENT-GATED` | `CAN_DEFER` for raw capture; `BLOCKS_SPECIFIC_FIELD` and `BLOCKS_FINAL_REPORTING` for official semantics | Keep current field; do not calculate trend or success. |
| M-02 | Waist | Current Baseline/Follow-up/Final fields; workbook Before/After; `cm` UI label | Nullable raw bounded values | Retain factual value only | Unit, protocol/context, source, timing, requiredness, correction, threshold/report rule | `CURRENT IMPLEMENTATION` + `SAFE PROTOTYPE DEFAULT` + `REQUIREMENT-GATED` | `CAN_DEFER`; `BLOCKS_SPECIFIC_FIELD`; `BLOCKS_FINAL_REPORTING` | Keep current field; do not infer risk threshold. |
| M-03 | BP | Separate Baseline names versus Follow-up/Final names; workbook Before/After upper/lower; `mmHg` UI label | Two nullable structural values; no pair rule | Retain components; missing half remains factual absence | Approved unit, pair/observation rule, missing-half rule, protocol, source, timing, correction | `CURRENT IMPLEMENTATION` + `SAFE PROTOTYPE DEFAULT` + `REQUIREMENT-GATED` | `CAN_DEFER`; `BLOCKS_SPECIFIC_FIELD`; `BLOCKS_FINAL_REPORTING` | Preserve current structure; do not add pairing/classification. |
| M-04 | DTX / blood sugar | Workbook DTX Before/during/After; Baseline `bloodSugarDtx`; Follow-up/Final `bloodSugar`; UI `DTX / mg%` | Nullable raw bounded values; no interpretation | Retain exact current names and factual value | DTX versus glucose meaning, unit, context, source/device/import, observation time, requiredness, correction | `CURRENT IMPLEMENTATION` + `CUSTOMER EVIDENCE` + `SAFE PROTOTYPE DEFAULT` + `REQUIREMENT-GATED` | `CAN_DEFER` for raw capture; `BLOCKS_SPECIFIC_FIELD`; `BLOCKS_FINAL_REPORTING` | Do not rename or normalize; obtain P0 DTX decisions. |
| M-05 | HbA1c | Workbook Before/After labels only; no rewrite field | Not implemented | No capture yet | Full field, owner, stage, unit/precision, dates, source/import, actor, correction, missing, report contract | `CUSTOMER EVIDENCE` + `OPEN REQUIREMENT` + `REQUIREMENT-GATED` | `BLOCKS_SPECIFIC_FIELD`; `BLOCKS_FINAL_REPORTING`; `BLOCKS_15E` | Do not add Prisma field in 15D.2; close P0-06 first. |
| M-06 | Height | Workbook initial/report label; legacy terminology; no rewrite source | Not implemented | No capture yet | Owner model, Program B behavior, stage use, unit/precision, source/timing, correction | `CUSTOMER EVIDENCE` + `OPEN REQUIREMENT` + `REQUIREMENT-GATED` | `BLOCKS_SPECIFIC_FIELD`; `BLOCKS_CALCULATION`; `BLOCKS_FINAL_REPORTING` | Decide ownership before adding Height or BMI dependencies. |
| M-07 | BMI | Workbook Before/After label; no current field/formula | Not implemented; must remain derived | No value or classification | Authoritative Height/Weight, stage timing, formula/version, units, precision, missing/recalc/report rules | `ENGINEERING RECOMMENDATION` + `REQUIREMENT-GATED` | `BLOCKS_CALCULATION`; `BLOCKS_FINAL_REPORTING`; `BLOCKS_15E` | Do not persist or calculate. |
| M-08 | CVD risk | Workbook score label only; no accepted algorithm | Not implemented | No score/category | Exact algorithm/version/source, inputs, units, timing, missing, scale, thresholds, interpretation, reproducibility | `OPEN REQUIREMENT` + `REQUIREMENT-GATED` | `BLOCKS_CALCULATION`; `BLOCKS_FINAL_REPORTING`; `BLOCKS_15E` | Do not select a common score or use legacy behavior. |
| M-09 | Recording versus observation | Baseline `recordedOn`; Follow-up/Final `recordedAt`; Program lifecycle timestamps | Server recorder/time plus user Baseline date; no generic `observedAt` | Show recording time as recording time | Stage windows, observation timestamp/date, late entry/import/backdating rules | `ACCEPTED` lifecycle boundary + `CURRENT IMPLEMENTATION` + `OPEN REQUIREMENT` | Raw capture `CAN_DEFER`; official stage/report `BLOCKS_FINAL_REPORTING` | Keep timestamp meanings explicit; do not add generic provenance now. |
| M-10 | Program-specific Before | `initialBaselineId` is nullable; Baseline is relationship-owned/unique; Phase 15B/15D0 isolation rules | Explicit link only; no implicit copy | Display no Before when no explicit source exists | Whether each Program needs a distinct initial observation and how it is owned | `ACCEPTED` isolation + `OPEN REQUIREMENT` | `BLOCKS_SPECIFIC_FIELD`; `BLOCKS_FINAL_REPORTING`; `BLOCKS_15E` | Ask P0-08; never copy A to B implicitly. |
| M-11 | Correction/history | Baseline/Follow-up/Final currently immutable in these slices; correction deferred | No edit/delete/amend API | Preserve original factual record | Amendment/supersession/void/review and report version rule | `CURRENT IMPLEMENTATION` + `OPEN REQUIREMENT` | `CAN_DEFER` for demo raw display; `BLOCKS_FINAL_REPORTING` for regulated/reproducible use | Keep immutable prototype; do not invent a generic correction framework. |
| M-12 | Final Assessment compatibility | Phase 15D.1 accepted Program ownership/lifecycle; exact five raw fields | 0..1 immutable Final; strict structural input; no clinical semantics | Safe factual capture and absence/presence display | Only future official semantics, not current persistence | `ACCEPTED` + `SAFE PROTOTYPE DEFAULT` | `CAN_DEFER`; no current `BLOCKS_15D3` for factual display | No schema change or rename. |
| M-13 | Final/Outcome UI | Existing raw domains but no current Final UI integration | D3 can query exact Program Final through the established access boundary | Show raw values, recorder, recording time, Program ownership, presence/absence | Final wording, official units, comparison, classification | `SAFE PROTOTYPE DEFAULT` + `REQUIREMENT-GATED` | `CAN_DEFER` for factual UI; official report semantics `BLOCKS_FINAL_REPORTING` | D3 may integrate only a non-clinical view and must enforce nested ownership. |
| M-14 | Report access/export | Workbook layout only; no accepted report authorization contract | Not implemented | No production report/export claim | Actor scope, authorization, projection, export format, audit/access logging | `CUSTOMER EVIDENCE` + `OPEN REQUIREMENT` | `BLOCKS_FINAL_REPORTING`; `BLOCKS_15E` | Defer Phase 15E implementation until access and source maps are accepted. |

`BLOCKS_15D3` is intentionally not assigned to existing raw factual values:
15D.3 can safely display them with explicit non-clinical wording. It would apply
only if 15D.3 attempts to implement the blocked official semantics listed above.

## 19. Explicit implementation-ready subset

The following is ready to carry forward without expanding clinical meaning:

1. Keep the current five nullable Final raw fields and their exact names.
2. Keep the accepted Phase 15D.1 Program + relationship ownership and lifecycle
   rules unchanged.
3. Keep current structural validation as structural validation only; do not add
   clinical ranges, threshold checks, unit conversion, or interpretation.
4. Allow a future Final UI to show the raw values that are actually present,
   explicit Final presence/absence, exact Program ownership, server-derived
   recorder, and server recording time.
5. Label server time as recording/persistence time, not observation time.
6. Treat Baseline, Follow-up, and Final values as immutable prototype history
   under the current slices; do not claim that this is the final correction
   policy.
7. Preserve current terminology/field names and document the DTX naming
   mismatch rather than silently normalize it.
8. Preserve Program A/B isolation and exact nested relationship-plus-Program
   authorization checks.

This subset is sufficient for a factual prototype demonstration. It is not
sufficient for official clinical outcomes or production reporting.

## 20. Explicit DO-NOT-IMPLEMENT list

Do not implement in Phase 15D.2:

- HbA1c persistence or validation from workbook labels alone;
- Height persistence before ownership is decided;
- BMI persistence, formula calculation, or inferred Before/After values;
- any CVD risk score, common formula, threshold, category, or legacy algorithm;
- automatic unit normalization, especially `DTX / mg%` to `mg/dL`;
- DTX fasting/random/post-meal interpretation;
- BP pairing, averaging, clinical classification, or thresholds;
- weight/waist/BP/DTX threshold or success labels;
- automatic trend, improvement, achievement, or outcome conclusions;
- latest Follow-up → Final/After fallback;
- latest relationship value → Program B Before fallback;
- Program A Baseline/Final/Follow-up → Program B copy or inheritance;
- a generic `observedAt` field solely for future flexibility;
- a Measurement/Observation/EAV/FHIR-like table or generic provenance/unit
  conversion/rules engine;
- a generic correction/amendment framework without an accepted workflow;
- dashboards, exports, report read models, or report authorization;
- fixed six-column persistence for Follow-ups;
- schema renames or migration churn for provisional terminology.

## 21. Phase 15D.3 handoff — Final / Outcome UI integration

### 21.1 Safe factual display

Phase 15D.3 may safely display:

- existing raw provisional Weight, Waist, BP component, and DTX/blood-sugar
  values when present;
- the current presence/absence of a Final Assessment;
- exact Program ownership and Program status;
- server-derived recorder;
- server recording time, explicitly labeled as recording/persistence time;
- the fact that the displayed values are recorded raw values, with no automatic
  clinical interpretation.

Current UI unit suffixes may be retained only as current/provisional labels. They
must not be presented as newly approved clinical units. If the UI cannot make
that distinction clear, it should omit an official unit claim rather than invent
one.

### 21.2 Unsafe without accepted requirements

15D.3 must not display or calculate:

- official clinical unit claims where the unit is not approved;
- clinical status, severity, risk, improvement, achievement, or success;
- BMI or CVD risk;
- HbA1c, because it is not implemented;
- inferred Before/After comparison or trend;
- BP/DTX/waist thresholds or categories;
- “missing Final = clinical failure” or “completed Program = successful
  outcome.”

### 21.3 Required nested-route hardening

For a route conceptually shaped like:

```text
/patients/:relationshipId/programs/:programId/...
```

15D.3 must verify the exact `relationshipId + programId` ownership chain before
rendering or mutating Final Assessment data. It must not authorize or render
based on `programId` alone beneath a user-visible patient breadcrumb. The route
pattern must match the exact nested ownership checks already used by Goal Plan
and Follow-up flows: resolve the relationship-scoped Program first, fail closed
on mismatch, then query/mutate only within that verified Program context.

## 22. Phase 15E reporting handoff

Phase 15E must not assume:

- workbook columns are automatically authoritative source fields;
- a blank or missing Final Assessment is clinical failure;
- Program completion is Final completion or clinical success;
- raw measurements imply clinical success or interpretation;
- Follow-up count is six persisted columns rather than normalized `0..N` history;
- BMI or CVD can be generated before their contracts are approved;
- DTX/blood sugar terminology is normalized or clinically interchangeable;
- Program A and Program B share an episode, Before source, Final, or outcome;
- the latest relationship or Follow-up value is the report source without an
  explicit stage/ownership rule;
- report access/export is covered by the current patient/Program read policy;
- a report may silently choose a value when observation and recording times
  differ;
- correction of a source record leaves historical reports unchanged or
  reproducible unless that policy is accepted.

Phase 15E must first consume an accepted normalized source map, timing/stage
contract, missing-value semantics, calculation contracts, and separate report
authorization/export decision. The workbook can guide the projection shape
after those source decisions are closed.

## 23. Verification and change boundary

Completed for this phase:

- verified actual starting HEAD and branch rather than relying on the expected
  SHA;
- verified the starting working tree was clean and unrelated changes were not
  present;
- inspected the primary Phase 15 documents, architecture/ADR material, and
  earlier Baseline requirements;
- inspected exact Prisma model fields, relations, nullability, timestamps, and
  constraints;
- inspected current Baseline, Follow-up, Final, and Program schemas/services,
  access/query paths, and targeted tests;
- inspected current UI labels and recording-time wording;
- inspected the customer workbook read-only; no workbook content was changed;
- kept every unresolved clinical/data-contract item visibly gated;
- made no changes to `prisma/schema.prisma`, `prisma/migrations/**`, `src/**`,
  `app/**`, or `tests/**`.

Required final checks for this documentation-only change:

```text
git diff --check
```

No build, Prisma generate, migration, development server, or full test suite is
required because no runtime code changed. The final diff must contain only this
documentation file and must contain no mojibake or unintended Thai text/encoding
changes.
