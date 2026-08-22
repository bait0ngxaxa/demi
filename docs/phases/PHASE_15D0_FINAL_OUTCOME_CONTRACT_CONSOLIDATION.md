# Phase 15D.0 — Final / Outcome Contract Consolidation

**Status:** COMPLETE — documentation-only contract audit

**Date:** 2026-08-22

**Baseline branch:** `main`

**Baseline HEAD for this correction:** `bef5eb6af52b89b2bd6f775aaa34b63bbc171aab`

**Original 15D.0 audit baseline HEAD:** `75ced5cee7eee1cc7085f594a4330ab0cda4c01e`

**Original 15D.0 audit working tree:** clean at audit start (`git status --short --branch` reported `## main`)

**Correction review working tree:** clean before this documentation change (`git status --short --branch` reported `## main`)

**Scope:** contract, architecture, evidence classification, and data mapping only. This phase does not change Prisma, migrations, persistence, routes, Server Actions, forms, calculations, exports, dashboards, or authorization capabilities.

## 1. Objective and executive conclusion

Phase 15D.0 establishes the safest contract for the next Final / Outcome slices:

```text
BEFORE
  ↓
Program activity and Follow-up history
  ↓
AFTER / explicit Final Assessment
  ↓
Program historical outcome projection
```

The customer workbook establishes a report shape with `BEFORE`, repeated during-program values, and `AFTER`. It does not establish the authoritative timing, measurement authority, clinical units, formulas, import semantics, correction policy, requiredness, report visibility, or success thresholds. Those details remain requirement-gated.

The safest architectural direction is an explicit Final / Outcome Assessment owned by the exact `PatientProgram`, with relationship ownership checked through the Program:

```text
PatientHospitalRelationship
    ↓
PatientProgram
    ↓
Explicit Final / Outcome Assessment
```

Because Final is Program-owned, its creation follows the existing Program-owned mutation lifecycle. The accepted persistence rule is:

```text
ACTIVE Program
  → Final creation may occur subject to authorization, cardinality, and accepted input contract

COMPLETED Program
  → existing Final records remain historically readable
  → new Final creation is rejected
  → no new Program-owned Final write is allowed
```

This is a mutation-lifecycle rule, not a clinical observation-timing rule. It does not require a Final Assessment before completion and does not create one during completion.

The latest Follow-up must not be promoted into an AFTER record. Program completion remains a lifecycle state only. It does not imply a Final Assessment, Service 1 success, Goal achievement, Follow-up completion, clinical improvement, or successful outcome.

No exact table name, column name, one-record cardinality, amendment model, clinical formula, or medical threshold is selected by this document.

## 2. Evidence hierarchy and classifications

This audit uses the repository's established evidence hierarchy:

1. Confirmed current customer/business requirements
2. Accepted architecture, ADRs, and accepted phase contracts
3. Current rewrite implementation
4. Customer workbook as report/workflow-intent evidence
5. Legacy DEMI as behavioral and terminology evidence only
6. Engineering recommendation
7. Open requirement

Every conclusion in this document is labeled with one of the following classifications:

| Classification | Meaning in this audit |
| --- | --- |
| `ACCEPTED` | Accepted architecture or phase contract that remains in force. |
| `CURRENT IMPLEMENTATION` | Behavior or data shape currently present in the rewrite. It is not automatically a final business requirement. |
| `CUSTOMER EVIDENCE` | Workbook/report or other customer-origin evidence of expected intent, not proof of persistence or clinical meaning. |
| `SAFE PROTOTYPE DEFAULT` | Reversible, non-clinical behavior already permitted as provisional prototype behavior. |
| `ENGINEERING RECOMMENDATION` | A proposed safer design direction, not an approved requirement. |
| `REQUIREMENT-GATED` | Implementation depends on a missing owner-approved decision. |
| `OPEN REQUIREMENT` | The repository does not contain enough evidence to decide the question. |

The terms `IMPLEMENTED — REUSE`, `IMPLEMENTED — VERIFY SEMANTICS`, `NEW — STRUCTURAL FIELD POSSIBLE`, `REQUIREMENT-GATED`, `DERIVED — DO NOT STORE BLINDLY`, and `DO NOT IMPLEMENT YET` are used as implementation classifications in the measurement matrix. They describe scope, not clinical approval.

## 3. Sources inspected

The following primary repository sources were inspected before drafting this contract:

- [`docs/CONTEXT.md`](../CONTEXT.md), including the source-of-truth order and unresolved-requirements rules.
- [`docs/architecture/DEMI_ARCHITECTURE_BASELINE.md`](../architecture/DEMI_ARCHITECTURE_BASELINE.md), especially the application boundary, authorization, transaction, data-integrity, and unresolved-clinical/reporting sections.
- All accepted ADRs in the [`docs/adr` index](../adr/README.md) were checked. The detailed boundaries used here are [`0002-role-capability-scope-authorization.md`](../adr/0002-role-capability-scope-authorization.md), [`0005-server-side-application-boundary.md`](../adr/0005-server-side-application-boundary.md), and [`0006-transactional-business-operations.md`](../adr/0006-transactional-business-operations.md).
- Phase 15A business-flow contract [`PHASE_15A_BUSINESS_FLOW_CONSOLIDATION.md`](./PHASE_15A_BUSINESS_FLOW_CONSOLIDATION.md).
- Phase 15A reporting map [`PHASE_15A_REPORTING_DATA_MAP.md`](./PHASE_15A_REPORTING_DATA_MAP.md).
- Phase 15B Program and Service 1 documents: [`15B.0`](./PHASE_15B0_PROGRAM_WORKFLOW_FOUNDATION.md), [`15B.1`](./PHASE_15B1_SERVICE_ONE_DOMAIN_PERSISTENCE.md), [`15B.2`](./PHASE_15B2_SERVICE_ONE_UI_EVIDENCE_INTEGRATION.md), and [`15B.3`](./PHASE_15B3_SERVICE_ONE_INTEGRATION_HARDENING.md).
- Phase 15C documents: [`15C.0`](./PHASE_15C0_SERVICE_TWO_FOLLOWUP_CONTRACT_CONSOLIDATION.md), [`15C.1`](./PHASE_15C1_SERVICE_TWO_PROGRAM_LINKAGE_DOMAIN_PERSISTENCE.md), [`15C.2`](./PHASE_15C2_STRUCTURED_BEHAVIORAL_FOLLOWUP_DATA.md), [`15C.3`](./PHASE_15C3_SERVICE_TWO_FOLLOWUP_UI_INTEGRATION.md), and [`15C.4`](./PHASE_15C4_SERVICE_TWO_FOLLOWUP_INTEGRATION_HARDENING.md).
- [`prisma/schema.prisma`](../../prisma/schema.prisma), including the current `PatientHospitalRelationship`, `PatientBaseline`, `PatientProgram`, `PatientGoalPlan`, `PatientFollowup`, `ScreeningAssessment`, `PatientAppointment`, and Service 1 models.
- Current module sources under [`src/modules/patient-program`](../../src/modules/patient-program), [`patient-baseline`](../../src/modules/patient-baseline), [`followups`](../../src/modules/followups), [`screening`](../../src/modules/screening), [`goals`](../../src/modules/goals), and [`appointments`](../../src/modules/appointments), including schemas, policies, access services, queries, mutations, and tests.
- Relevant executable projections under `app/app/patients/[relationshipId]/programs`, `app/app/patients/[relationshipId]/baseline`, and the corresponding screening, appointment, Goal Plan, and Follow-up routes/views.
- The present [customer workbook](../Dashboard%20App%20Demi.xlsx) was inspected read-only. It contains the two formatted report sheets recorded by Phase 15A, including the `BEFORE`/during/`AFTER` labels and workflow notes. It remains supporting customer evidence only: no workbook label is promoted here into a domain field, requiredness rule, clinical unit, or formula without supporting evidence.

The baseline repository was read-only during the audit. No schema, migration, runtime, route, UI, or test file was changed.

## 4. Accepted boundaries carried forward from Phase 15C.4

The following boundaries are `ACCEPTED` and are not reopened by 15D.0:

- `PatientProgram` is one bounded participation episode under an exact `PatientHospitalRelationship`.
- Program-scoped Goal Plans and Follow-ups have exact Program ownership and relationship consistency.
- Pre-Program Goal Plan and Follow-up rows remain nullable compatibility/history data. They are not implicitly adopted by a later Program.
- Program A and Program B have independent Goal Plan, Follow-up, and Service 1 namespaces.
- A completed Program remains historically readable, while new Program-owned writes fail closed.
- Stale lifecycle and authorization state is re-read server-side at mutation time.
- Program completion is a lifecycle state only. It does not represent clinical success or completion of any child domain.
- Appointment remains an operational, relationship-scoped record. It may be optional context for a Follow-up and is not silently made Program-owned.
- Screening remains contextual input/provenance for existing flows. It does not automatically create a Goal Plan or a Final Assessment.
- Sensitive measurement values, confidence, notes, and clinical/free-text payloads are not copied into generic audit metadata.
- Normalized source history is separate from a future wide report projection.

These conclusions are documented in the [Phase 15C.4 integration hardening audit](./PHASE_15C4_SERVICE_TWO_FOLLOWUP_INTEGRATION_HARDENING.md), particularly its Program A → B, lifecycle, authorization, completed-read, and requirement-gated sections.

## 5. Current executable Program and measurement model

### 5.1 Program episode

`CURRENT IMPLEMENTATION` in [`PatientProgram`](../../prisma/schema.prisma):

```text
PatientProgram
  patientHospitalRelationshipId
  initialBaselineId (nullable)
  status = ACTIVE | COMPLETED
  startedAt
  completedAt (nullable)
  createdByUserId
```

The current Program query projection exposes lifecycle dates, creator display name, and a linked initial Baseline summary. The Program detail UI shows Service 1, Program-scoped Goal Plan history, Program-scoped Follow-up history, and the lifecycle completion control. It does not show a Final Assessment because no such domain record exists yet.

### 5.2 Current source domains

| Domain | Current ownership and facts | Current semantic limit |
| --- | --- | --- |
| `PatientHospitalRelationship` | Exact Patient–Hospital context, HN, OSM assignment relation, relationship-wide history boundary. | It is not a Program episode and cannot substitute for Program ownership. |
| `PatientBaseline` | One immutable relationship-owned snapshot with `recordedOn`, server-derived recorder, weight, waist, systolic/diastolic BP, DTX-like blood sugar, adaptation text, confidence, summary, and recommendations. | Its field units, requiredness, correction policy, and clinical comparison semantics remain provisional/open. It is not a Final Assessment. |
| `PatientProgram` | Exact episode lifecycle, optional `initialBaselineId`, Service 1 ownership, and inverse Program Goal/Follow-up relations. | `COMPLETED` is not an outcome or success state. |
| `PatientGoalPlan` / `PatientGoalItem` | Program-linked immutable goal-plan rounds and target values/units, plus explicitly separate pre-Program compatibility history. | Target semantics, achieved counts, rates, and plan-adjustment semantics remain gated. |
| `PatientFollowup` / progress rows | Program-linked normalized `0..N` rounds with `recordedAt`, optional completed Appointment, optional same-Program Goal Plan, factual measurements, confidence, notes, and progress statuses. | `recordedAt` is not automatically the measurement observation time; no official achievement/outcome calculation exists. |
| `ScreeningAssessment` | Relationship-owned versioned responses/results with `submittedAt`, actor, question-set version, and scoring version. | It is not a Program BEFORE record by default and is not automatically a Final Assessment. |
| `PatientAppointment` | Relationship-owned operational scheduling/history with server-side lifecycle and optional completed link from Follow-up. | Appointment completion is not a service completion, final assessment, or clinical outcome. |

### 5.3 Current measurement fields

The rewrite currently accepts structural positive numeric values for Baseline measurements and non-negative numeric values for Follow-up measurements, bounded by large structural maxima. Existing UI labels display `kg`, `cm`, `mmHg`, and `DTX / mg%` in some places. These are `CURRENT IMPLEMENTATION` and `SAFE PROTOTYPE DEFAULT` evidence only; they do not establish the final clinical unit/context contract.

The current implementation has no approved persistence or calculation contract for HbA1c, Height, BMI, or CVD risk. It also has no separate measurement observation timestamp or source/device/import authority on the current Baseline/Follow-up records.

## 6. BEFORE / Baseline re-audit

### 6.1 What is currently persisted

`CURRENT IMPLEMENTATION`: `PatientBaseline` is a dedicated, relationship-owned, immutable initial snapshot. It is not `Followup(round = 0)`, not `ScreeningAssessment` round zero, not a `PatientProfile` field group, and not a current-health status row. Its visible fields are read-only after creation in the current UI.

The Program may reference a Baseline through `initialBaselineId`, with a composite relationship check. The current Program opening flow can use an existing relationship Baseline as the initial Baseline when it has not already been used by an earlier Program. If a Baseline is created after an ACTIVE Program opens, the current Baseline service may link it to that ACTIVE Program when the Program has no initial link and the Baseline has not already been used. This is existing initial-context behavior, not a Final Assessment and not a completion side effect. If a relationship already has historical Program usage, a newly created Baseline is not retroactively attached to a completed episode, and the same relationship-level Baseline is not blindly reused as the initial state of a later episode.

### 6.2 Baseline, Initial Program Assessment, and BEFORE projection are not identical

| Concept | Evidence status | Safest current interpretation |
| --- | --- | --- |
| Baseline | `CURRENT IMPLEMENTATION` / `ACCEPTED` architectural direction | A dedicated relationship-owned initial snapshot with one current prototype record per relationship. |
| Initial Program Assessment | `OPEN REQUIREMENT` | A Program-specific assessment may need to exist if each Program requires its own initial event, timing, actor, or measurement authority. No such separate record is currently approved. |
| BEFORE report projection | `CUSTOMER EVIDENCE` / `ENGINEERING RECOMMENDATION` | A future report group derived from authoritative Program-linked initial source data. It must not be a persistence column group or an implicit alias for any one existing row. |

The existing `initialBaselineId` relation is sufficient to preserve an explicitly linked initial snapshot where it exists. It is not sufficient to guarantee a distinct, Program-specific BEFORE record for every Program episode, particularly when a relationship has more than one Program. Phase 15D.1 must not infer Program B BEFORE from Program A AFTER, from the latest relationship Baseline, or from the latest Follow-up.

### 6.3 Fields that can currently be projected, with caveats

The current Baseline projection can expose:

- recorded date and server-derived recorder;
- weight;
- waist circumference;
- systolic and diastolic blood pressure;
- DTX-like blood sugar;
- adaptation summary/obstacle/opportunity text;
- provisional confidence score and plan;
- summary and recommendations.

These values can be read as factual prototype data where access is authorized. The workbook's BEFORE label does not make every Baseline field required, clinically interpreted, or officially reportable. The current Baseline date is a recording/reference date, not proof of a clinical observation timestamp.

### 6.4 Initial-Baseline handoff position

`ENGINEERING RECOMMENDATION`: keep the existing Baseline ownership and composite Program link. Do not create a second generic initial-state framework in 15D.0.

`REQUIREMENT-GATED`: before 15D.1 claims that every Program has a complete BEFORE state, confirm whether the existing relationship Baseline may serve multiple episodes, whether a later episode needs a new Program-specific initial observation, and whether a Baseline can be recorded after an episode opens. These choices affect cardinality, timing, correction, and reporting only; they must not be solved by copying prior episode data.

## 7. Final / AFTER ownership contract

### 7.1 Direction

`CUSTOMER EVIDENCE`: Phase 15A identifies AFTER / Final Assessment as a new domain concept. The workbook's AFTER group is a report expectation, not a schema prescription.

`ENGINEERING RECOMMENDATION`: use an explicit Final / Outcome Assessment whose exact ownership is:

```text
PatientHospitalRelationship
    ↓ exact relationship consistency
PatientProgram
    ↓ exact episode ownership
Final / Outcome Assessment
```

The record should be resolvable by exact Program ID and must carry relationship consistency that the server/database can verify. The relationship is a parent scope; the Program is the episode owner. A relationship-wide “latest final” lookup is not an adequate source of truth.

Because this record is Program-owned, creation must follow the established Program-owned mutation lifecycle. A Final Assessment may be newly persisted only while its authoritative Program is `ACTIVE`. If the authoritative Program is already `COMPLETED`, creation must fail closed; the completed Program is historical/read-only for new Final writes. Existing Final records remain readable after completion.

### 7.2 Why the latest Follow-up is not an AFTER record

The latest Follow-up is an operationally recorded, repeated during-program event. Its `recordedAt`, round number, optional Goal Plan, optional Appointment, activity progress, and factual measurements describe a Follow-up row. It does not prove:

- that the customer designated that event as final;
- that the timing satisfies an AFTER window;
- that all final fields were observed together;
- that the actor had Final Assessment authority;
- that correction or amendment rules for a final record were satisfied;
- that the Program reached a clinical or business outcome.

Promoting “latest” to “AFTER” would make an ordering implementation detail into a clinical/business rule and would fail when a later Follow-up is recorded, a Follow-up is missing, or Program A and Program B share relationship history. It is therefore explicitly disallowed.

### 7.3 Ownership and provenance requirements

The following are the minimum structural requirements for a future Final Assessment operation. They are a contract direction, not an implementation performed here:

- exact `PatientProgram` ownership;
- exact relationship consistency with the Program;
- server-derived authenticated actor identity;
- explicit recording timestamp/date;
- separate representation when the measurement observation time differs from the system recording time;
- immutable provenance sufficient to explain who recorded the record and under which source/authority, once that source vocabulary is approved;
- no reliance on browser state, hidden fields, route parameters, or current page projections as authority;
- historical read behavior that continues to identify the owning Program;
- no automatic creation when a Program is completed;
- no automatic completion of the Program when a Final Assessment is recorded.

The Final persistence lifecycle is closed by this contract:

```text
ACTIVE Program
  → Final Assessment creation may occur subject to authorization, cardinality, and accepted input contract

COMPLETED Program
  → an existing Final Assessment remains historically readable
  → new Final Assessment creation is rejected
  → completed Programs are read-only for new Final writes
```

This rule does not select the Final table/model name, cardinality, correction model, actor capability, or clinical field contract.

### 7.4 Final Assessment versus other domains

| Domain | Final Assessment relationship |
| --- | --- |
| Program lifecycle | Independent. Completion may exist without a Final Assessment, and a Final Assessment must not imply completion. |
| Follow-up | Separate. A Follow-up may be a source of history but is not an AFTER record by default. |
| Baseline | Separate. Baseline is initial/reference data; Final is an explicit later assessment owned by a Program. |
| Screening | Separate. Screening may provide contextual assessment provenance but does not become Final automatically. |
| Appointment | Separate operational context. Appointment completion is not Final recording authority or proof of outcome. |
| Service 1 / Goal Plan | Separate child-domain history. Neither completion nor record presence proves final success. |

### 7.5 Cardinality and correction status

`OPEN REQUIREMENT`: the repository does not decide whether a Program has:

- exactly zero-or-one Final Assessment;
- one current Final Assessment plus immutable amendments/versions;
- multiple independently recorded Final Assessments;
- a review/approval state; or
- a correction workflow outside the original recorder.

`ENGINEERING RECOMMENDATION`: do not choose a one-row overwrite model or a versioned/amendment model in 15D.1 until the owner confirms which historical truth must be reproducible. This is a `BLOCKS_15D1` domain-cardinality decision, not merely a later report concern.

## 8. Measurement contract matrix

The matrix below separates customer report presence from current persistence and from approved clinical meaning. “Current source” means the rewrite can currently hold or display a factual value; it does not mean that the field is approved for official interpretation.

| Concept | Customer workbook presence | Current rewrite source | Legacy evidence | BEFORE / DURING / AFTER | Raw vs derived | Current persistence owner | Candidate future owner | Unit status | Context status | Observation date/time | Provenance/source | Validation status | Calculation status | Official reporting readiness | Implementation classification |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DTX / blood glucose | `CUSTOMER EVIDENCE`: BEFORE, repeated during rounds, AFTER | `PatientBaseline.bloodSugarDtx`; `PatientFollowup.bloodSugar` | Terminology and legacy `blood_sugar_dtx` / DTX-like UI only | BEFORE: Baseline when present. DURING: Follow-up. AFTER: no explicit Final source; existing values are only candidates | Raw factual measurement; not an interpretation or diagnosis | Baseline or Follow-up, each with its existing owner | Explicit Final-owned raw value or a narrowly approved reusable observation concept; exact model name is open | `REQUIREMENT-GATED`: UI displays `mg%`, but official unit is not approved | `REQUIREMENT-GATED`: fasting/random/post-meal and other context are not defined | Baseline has `recordedOn`; Follow-up has server `recordedAt`; neither proves observation time | Recorder is server-derived; device/import/source authority is open | Structural finite positive/non-negative bounds only; no clinical range | No official calculation or classification | Prototype factual read only; official DTX interpretation/reporting blocked | `IMPLEMENTED — VERIFY SEMANTICS`; `REQUIREMENT-GATED` for official use |
| Body weight | `CUSTOMER EVIDENCE`: BEFORE, during, AFTER | `PatientBaseline.weight`; `PatientFollowup.weight` | Legacy weight field/label | BEFORE: Baseline. DURING: Follow-up. AFTER: no explicit Final source | Raw factual measurement | Baseline or Follow-up | Explicit Final-owned raw value or approved observation source | `REQUIREMENT-GATED`: UI displays `kg`; authority and conversion policy are not confirmed | Context such as clothing, device, or measurement setting is open | Current dates are record dates, not guaranteed observation times | Server actor exists; scale/import/source authority is open | Structural numeric validation only | No calculation in current contract | Prototype factual read only; official comparison blocked until semantics | `IMPLEMENTED — VERIFY SEMANTICS` |
| Waist circumference | `CUSTOMER EVIDENCE`: BEFORE and AFTER; no visible during-round column | `PatientBaseline.waistCircumference`; `PatientFollowup.waistCircumference` | Legacy waist field/label | BEFORE: Baseline. DURING: current Follow-up can hold a value but the workbook does not show it in its visible rounds. AFTER: no explicit Final source | Raw factual measurement | Baseline or Follow-up | Explicit Final-owned raw value or approved observation source | `REQUIREMENT-GATED`: UI displays `cm`; unit/measurement policy is not approved | Measurement position/protocol and context are open | Current dates are record dates, not guaranteed observation times | Server actor exists; measuring source/device/protocol authority is open | Structural numeric validation only | No calculation in current contract | Prototype factual read only; official comparison blocked | `IMPLEMENTED — VERIFY SEMANTICS` |
| Systolic blood pressure | `CUSTOMER EVIDENCE`: BEFORE and AFTER; no visible during-round column | `PatientBaseline.bloodPressureSystolic`; `PatientFollowup.systolicBloodPressure` | Legacy systolic field and `mmHg` label | BEFORE: Baseline. DURING: current Follow-up can hold a value but the workbook does not show it in its visible rounds. AFTER: no explicit Final source | Raw factual measurement | Baseline or Follow-up | Explicit Final-owned raw value paired with diastolic value or approved observation source | `REQUIREMENT-GATED`: UI displays `mmHg`; official unit/validation authority is open | Resting state, position, repeated readings, device, and pairing semantics are open | Current dates are record dates, not guaranteed observation times | Server actor exists; device/protocol/source authority is open | Structural numeric validation only; no clinical range | No calculation in current contract | Prototype factual read only; official BP interpretation blocked | `IMPLEMENTED — VERIFY SEMANTICS` |
| Diastolic blood pressure | `CUSTOMER EVIDENCE`: BEFORE and AFTER; no visible during-round column | `PatientBaseline.bloodPressureDiastolic`; `PatientFollowup.diastolicBloodPressure` | Legacy diastolic field and `mmHg` label | BEFORE: Baseline. DURING: current Follow-up can hold a value but the workbook does not show it in its visible rounds. AFTER: no explicit Final source | Raw factual measurement | Baseline or Follow-up | Explicit Final-owned raw value paired with systolic value or approved observation source | `REQUIREMENT-GATED`: UI displays `mmHg`; official unit/validation authority is open | Same unresolved BP context and pairing questions as systolic | Current dates are record dates, not guaranteed observation times | Server actor exists; device/protocol/source authority is open | Structural numeric validation only; no clinical range | No calculation in current contract | Prototype factual read only; official BP interpretation blocked | `IMPLEMENTED — VERIFY SEMANTICS` |
| HbA1c | `CUSTOMER EVIDENCE`: BEFORE and AFTER; no accepted during source | No current field, schema owner, or approved service contract | Terminology only | BEFORE: requested by workbook. DURING: not established. AFTER: requested by workbook | Raw measurement, not a derived BMI/risk value | None | Explicit Final-owned field only if approved, or an approved reusable measurement observation concept; exact owner is open | `REQUIREMENT-GATED`: unit not approved | Context/assay/specimen and interpretation authority are open | Observation date is required before persistence; recording time is not a substitute | Must decide manual entry/import/external source and authority | No approved medical validation range; structural validation must be owner-approved | No formula is to be invented | Not report-ready; official field blocked | `REQUIREMENT-GATED`; `DO NOT IMPLEMENT YET` |
| Height | `CUSTOMER EVIDENCE`: BEFORE; no accepted during/AFTER presence | No current field | Legacy profile/detail terminology only; not an audited Follow-up input | BEFORE: requested. DURING/AFTER: not established | Raw measurement | None | A raw height observation source, possibly relationship/patient or Program-specific, is open; do not select a global owner yet | `REQUIREMENT-GATED`: unit not approved | Measurement context and whether height changes between stages are open | Observation date/time and authority are open | Source/actor/device/import authority is open | No approved validation contract | No calculation in 15D.0 | Not report-ready; may block official BMI | `NEW — STRUCTURAL FIELD POSSIBLE`; `REQUIREMENT-GATED` |
| BMI | `CUSTOMER EVIDENCE`: BEFORE and AFTER; no accepted during source | No current field or formula | Display/visual terminology only | BEFORE/AFTER requested; exact source event is open | Derived data; must not be treated as raw input | None | Prefer a future report/domain projection from authoritative height and weight observations; persisted snapshot only if reproducibility requires it | Derived scale/unit and conversion rules need approval | Height source, weight source, timing, and whether AFTER reuses height are open | Must define which observation times feed the derivation | Must preserve source observations and, if required, calculation provenance | No approved BMI validation/rounding contract | Formula, version, rounding, and missing-input behavior are open | Official BMI report blocked | `DERIVED — DO NOT STORE BLINDLY`; `REQUIREMENT-GATED` |
| CVD risk | `CUSTOMER EVIDENCE`: BEFORE and AFTER; no accepted during source | No current field, formula, or calculation service | Terminology only; legacy formula is not authoritative | BEFORE/AFTER requested; timing and input set are open | Derived or externally imported clinical result; source mode is unresolved | None | Approved calculation result or explicitly imported result under a future narrow contract; no generic clinical framework | Result scale/unit and percentage representation are open | Formula inputs, authority, interpretation, and threshold semantics are open | Observation/calculation date and source snapshot are required for reproducibility | Must decide formula owner, manual/import allowance, and version provenance | No official range or input validation contract | Formula, algorithm, version, required inputs, rounding, and interpretation are all open | `BLOCKED FOR OFFICIAL IMPLEMENTATION` and report projection | `REQUIREMENT-GATED`; `DO NOT IMPLEMENT YET` |

### 8.1 Matrix conclusions

- Existing DTX, weight, waist, and BP fields may continue as provisional factual prototype data under their current owners. Existing persistence is not approved clinical semantics.
- HbA1c has no approved persistence/measurement contract and must not be added in 15D.0.
- Height is a possible future raw field, but its owner, unit, timing, and authority are not approved.
- BMI is derived data. It must not be copied into a stored field merely because the workbook has a BMI column.
- CVD risk is explicitly blocked for official implementation until the complete formula/source/version contract is accepted.
- No field's workbook presence proves requiredness. Report completeness and clinical success remain separate questions.

## 9. DTX / blood glucose contract boundary

`CURRENT IMPLEMENTATION`: the rewrite stores DTX-like values in Baseline and blood-glucose-like values in Follow-up. Existing UI labels include `DTX / mg%`.

`SAFE PROTOTYPE DEFAULT`: existing values may remain readable and operational where the current workflow already supports them, provided they are represented as recorded factual values without diagnostic classification or official interpretation.

`REQUIREMENT-GATED`: the repository does not approve:

- the unit;
- fasting, random, post-meal, or other context;
- device/source/import authority;
- observation date/time distinct from recording time;
- validation ranges or clinical thresholds;
- whether a value is manually entered, imported, or externally verified;
- final-report interpretation.

Therefore:

```text
existing persistence ≠ approved clinical semantics
```

15D.1 may reuse the existing raw value shape only as explicitly provisional data. It must not rename or reinterpret it as an official clinical contract without a separate accepted measurement decision.

## 10. HbA1c contract gate

`CUSTOMER EVIDENCE`: the workbook expects HbA1c in BEFORE and AFTER.

`CURRENT IMPLEMENTATION`: there is no HbA1c field, request contract, persistence owner, or approved calculation/measurement service. Phase 15A and Phase 15C explicitly leave this unresolved.

Before a future slice may persist HbA1c, the minimum requirement decision must define:

1. unit and representation;
2. observation date, and whether time is required;
3. source and authority;
4. whether manual staff entry, import, or an external source is allowed;
5. structural validation responsibility and any owner-approved range policy (no range is invented here);
6. whether historical observations are immutable, amendable, reviewable, or versioned;
7. whether the value belongs directly to a Final Assessment or to a reusable measurement observation owned elsewhere;
8. who may record, read, correct, and report it under the accepted capability vocabulary.

Classification: `REQUIREMENT-GATED`, `DO NOT IMPLEMENT YET`, `BLOCKS_SPECIFIC_FIELD`, and `BLOCKS_FINAL_REPORTING`. It does not block Program lifecycle, existing Baseline, or existing Follow-up behavior.

## 11. Height and BMI contract gate

### 11.1 Height

`CUSTOMER EVIDENCE`: Height appears in the workbook BEFORE group.

`CURRENT IMPLEMENTATION`: no Height field is persisted in the rewrite. Legacy terminology is not an approved owner or semantics.

`OPEN REQUIREMENT`: decide whether Height is:

- a relationship/patient attribute;
- a Program-specific initial observation;
- a measurement captured again for AFTER;
- manually entered or imported;
- immutable historical evidence or correctable source data;
- recorded in which unit and at what observation time.

Height may be a `NEW — STRUCTURAL FIELD POSSIBLE` in a later slice, but it remains `REQUIREMENT-GATED` for 15D.1 implementation.

### 11.2 BMI

`CUSTOMER EVIDENCE`: BMI appears in BEFORE and AFTER.

`ACCEPTED`: Phase 15A classifies BMI as derived and says not to store it blindly.

The following must be decided before calculation:

- authoritative Height observation;
- authoritative Weight observation;
- units and conversion policy;
- observation timing for both inputs;
- formula and version;
- rounding and display precision;
- whether AFTER BMI uses the same Height or a new Height observation;
- behavior when either input is missing or belongs to a different Program;
- whether BMI is a calculated projection, an immutable derived snapshot, or an externally supplied value.

`ENGINEERING RECOMMENDATION`: prefer deriving BMI from preserved source observations rather than maintaining a mutable duplicate. If reproducibility requires persisted derived snapshots, that must be an explicit versioned contract, not a shortcut added to a measurement table.

Classification: `DERIVED — DO NOT STORE BLINDLY`, `REQUIREMENT-GATED`, `BLOCKS_CALCULATION`, and `BLOCKS_FINAL_REPORTING` only. No BMI calculation is implemented in 15D.0.

## 12. CVD-risk contract gate

`CUSTOMER EVIDENCE`: CVD risk appears in BEFORE and AFTER.

`CURRENT IMPLEMENTATION`: no approved formula, version, required input list, unit set, source, or calculation authority exists. Legacy terminology or a public/internet calculator is not sufficient evidence.

Before any official implementation, the customer/owner must specify:

```text
formula / algorithm
version
required inputs
input units
calculation authority
rounding
result scale
interpretation
observation/calculation timing
audit and version reproducibility
```

The contract must also distinguish a calculated result from an externally imported result and define whether a result is allowed when some inputs are missing.

Classification: `REQUIREMENT-GATED`, `BLOCKS_CALCULATION`, `BLOCKS_SPECIFIC_FIELD`, `BLOCKS_FINAL_REPORTING`, and `BLOCKED FOR OFFICIAL IMPLEMENTATION`. No formula, threshold, percentage, or interpretation is selected here.

## 13. Timing and provenance model

### 13.1 Separate time concepts

The current system contains distinct timestamps/dates:

| Time concept | Current meaning | Must not be assumed to mean |
| --- | --- | --- |
| `PatientProgram.startedAt` | Server-controlled Program lifecycle start | Baseline observation time or first clinical measurement time |
| `PatientBaseline.recordedOn` | User-supplied date-only Baseline recording/reference date | Exact observation time, Program start, or report BEFORE window |
| `PatientFollowup.recordedAt` | Server-controlled Follow-up record time | Measurement observation time or proof of final status |
| `PatientProgram.completedAt` | Server-controlled lifecycle completion time | Final Assessment time, last measurement time, or clinical outcome time |
| Future Final `recordedAt`/date | Application persistence/recording time, expected to be server-derived if approved | Measurement observation time unless explicitly designed that way |
| Future measurement `observedAt` | Not currently persisted for these fields | System recording time |

`ENGINEERING RECOMMENDATION`: where a measurement may be observed before it is entered, preserve separate recording and observation concepts. The exact requiredness, timezone, date precision, backdating, and allowed windows remain `OPEN REQUIREMENT`.

### 13.2 No invented timing window

The workbook distinguishes BEFORE/DURING/AFTER but does not define exact windows. This audit does not invent a rule such as “within seven days of completion”, “on completion day”, or “latest Follow-up before completion”.

The Final record-creation lifecycle is not open: the authoritative Program must be `ACTIVE` when a Final Assessment is persisted. A `COMPLETED` Program remains readable, but a new Program-owned Final write must be rejected. This does not decide when the represented clinical/source measurements were observed.

The future contract must define, for each stage:

- the authoritative event association;
- allowed observation/recording order;
- whether dates may be backdated;
- how far before Final record creation an observation may have occurred;
- whether an observation can occur after Program completion;
- what event or time window qualifies as AFTER;
- whether individual measurements require separate observation timestamps;
- how missing or late observations are represented;
- which timestamp the report uses.

Whether measurements may be backdated, observed before or after other workflow events, or assigned to an AFTER window remains `REQUIREMENT-GATED`. These observation-time questions may `BLOCKS_SPECIFIC_FIELD` and `BLOCKS_FINAL_REPORTING`, but they do not block a narrow structural Final record that uses server-derived recording time and does not claim an official clinical window. Existing historical Baseline/Follow-up records are not invalidated.

### 13.3 Provenance boundary

`ACCEPTED`: current mutations resolve actor identity on the server, enforce exact Patient/Hospital/OSM scope, and write bounded audit metadata atomically with critical records. Audit metadata contains action and resource context, not the full sensitive clinical payload.

`REQUIREMENT-GATED`: Final measurement provenance must define source/authority semantics beyond the existing recorder identity if manual entry, import, device, review, or external verification is allowed. Do not add a generic provenance framework in 15D.0.

## 14. Program completion versus Final Assessment state model

Program lifecycle and Final Assessment presence are independent dimensions, but Final persistence is subject to the accepted Program mutation lifecycle.

| Program state | Final Assessment state | Safe interpretation | Mutation position |
| --- | --- | --- | --- |
| `ACTIVE` | None | Valid active Program without Final Assessment. No missing-data error may be invented by 15D.0. | Final creation may be available subject to authorization, cardinality, and accepted input contract. |
| `ACTIVE` | Exists | Valid active Program with a Final already recorded. This does not complete the Program or prove success. | Additional Final mutation depends on unresolved cardinality/correction semantics and accepted authorization. |
| `COMPLETED` | None | Valid historical Program completed without a Final Assessment. | Read-only for new Final writes; new Final creation is rejected. |
| `COMPLETED` | Exists | Valid historical Program whose Final was recorded while the Program was `ACTIVE` and which was completed afterward. | Historical read remains allowed subject to authorization; new Program-owned Final mutation is rejected. |

The Final persistence lifecycle is therefore:

```text
ACTIVE Program
  → Final Assessment creation may occur subject to authorization, cardinality, and accepted input contract

COMPLETED Program
  → existing Final Assessment remains historically readable
  → new Final Assessment creation is rejected
  → no late Program-owned Final write is allowed
```

The following distinctions remain explicit:

```text
Program completion ≠ Final Assessment recorded
Final Assessment recorded ≠ Program completion
Final Assessment recorded ≠ clinical success
Final Assessment recorded ≠ Service completion
Final Assessment recorded ≠ Goal achievement
Final Assessment recorded ≠ Follow-up completion
```

No accepted evidence requires a Final Assessment before completion, and no accepted evidence permits completion to automatically create an AFTER row. The valid historical states `COMPLETED + no Final Assessment` and `COMPLETED + existing Final Assessment` must both remain readable. The latter means the Final was recorded while the Program was `ACTIVE`; it does not imply that Final presence caused completion.

## 15. Authorization boundary for a future Final Assessment

No new capability is introduced by 15D.0. A future operation must reuse the accepted capability vocabulary and be granted only after the actor/authority decision is confirmed.

The expected server-side chain for a future Final mutation is:

```text
request / size and abuse checks where required
  → resolve authenticated ActorContext
  → validate input
  → resolve exact PatientProgram
  → derive exact PatientHospitalRelationship from the Program
  → re-read User / Hospital / membership / OSM assignment state
  → evaluate Final capability and scope
  → lock or otherwise authoritatively re-read Program lifecycle inside the mutation transaction
  → require Program.status = ACTIVE
  → persist Final
  → bounded audit
  → response / revalidation
```

The operation must:

- derive actor identity on the server;
- never trust browser state or hidden fields for authority;
- resolve the relationship from the exact Program, not from a trusted browser field;
- verify that the route relationship and Program relationship match;
- re-read current User, membership, Hospital, and OSM assignment state;
- resolve the exact Program and reject cross-Program access;
- fail closed for wrong Hospital, wrong relationship, inactive, unassigned, stale scope, or a Program that is no longer `ACTIVE`;
- enforce the `ACTIVE` lifecycle requirement inside the authoritative mutation/transaction boundary so stale pages cannot commit after completion;
- avoid treating `ADMIN`, Hospital Owner, Doctor, Nurse, or OSM as automatically authorized merely from role/profession;
- preserve historical read policy separately from record capability;
- preserve historical Final reads after Program completion;
- not grant permanent access merely because a user originally recorded the record.

`OPEN REQUIREMENT`: the exact actor/capability vocabulary for recording, reading, reviewing, correcting, or exporting Final data. This is `BLOCKS_15D1` only for the authorization part of the Final mutation; it does not authorize a new role or bypass existing policy.

## 16. Data integrity and audit boundary

The future Final contract must preserve these invariants:

- Final Assessment belongs to exactly one Program episode.
- Its relationship must be the exact relationship of that Program.
- Program A's Final record can never attach to Program B.
- A Final record cannot be discovered or reassigned through a relationship-wide “latest” lookup.
- No Final Assessment may be newly persisted against a `COMPLETED` Program.
- Actor identity is server-derived and provenance is immutable enough to explain the recorded operation.
- Lifecycle validation must occur inside the authoritative mutation/transaction boundary, using the current Program row and requiring `status = ACTIVE` at Final persistence time.
- A page rendered while the Program was `ACTIVE` must not be able to commit a Final Assessment after another request has completed the Program.
- Concurrent writes must not create duplicate current records, overwrite an accepted historical value, or produce ambiguous ownership. The exact one-record versus versioned policy remains open.
- Sensitive clinical values are not copied into generic audit metadata.
- Audit records describe action, actor, resource, Program, relationship, and safe non-sensitive context; they do not duplicate the full clinical payload.
- Multi-record writes that must succeed or fail together use the established cohesive transaction boundary.
- External provider/device I/O, if later approved, must not be pretended to be part of a local database transaction without a specific consistency design.

Do not create a generic clinical-record, EAV, polymorphic measurement, or universal amendment framework. The future implementation should remain narrow to the DEMI Final / Outcome domain and reuse existing ownership, policy, and transaction patterns.

## 17. Program A → Program B isolation contract

For one relationship `R`, the authoritative episode shape is:

```text
Relationship R

Program A
  BEFORE A
  Service 1 A
  Goals A
  Follow-ups A
  AFTER A

Program B
  BEFORE B
  Service 1 B
  Goals B
  Follow-ups B
  AFTER B
```

The following are `ACCEPTED` constraints carried from Phase 15C.4:

- `AFTER A` must never become `AFTER B`.
- Program B must not infer BEFORE B from Program A's AFTER A.
- Program B must not infer BEFORE B from the latest relationship Baseline or latest relationship Follow-up without an explicit future business rule.
- Pre-Program rows remain compatibility history and are not silently adopted by either Program.
- Program-local Follow-up and Goal Plan round numbers are not relationship-global chronology.
- Relationship-wide history may display both episodes, but every row must retain explicit owning Program identity or explicit pre-Program `NULL` identity.
- A completed Program remains readable without becoming the source of a later Program's current state.

`ENGINEERING RECOMMENDATION`: make the owning Program visible in every Final read projection and use exact Program-scoped queries for Program pages. Historical relationship reports may combine episodes only as an explicit projection that preserves ownership.

## 18. Reporting boundary

Phase 15D prepares normalized source data for Phase 15E; it does not implement reporting.

```text
normalized domain history
        ↓
future report read model / projection
```

Do not persist workbook columns such as `Round 1` through `Round 6`. The workbook itself allows the number of Follow-ups to vary, and Phase 15C already uses normalized Program-local `0..N` history. Six visible rounds are a presentation constraint only.

Phase 15E owns:

- reporting read models;
- dashboard queries;
- service completeness;
- report access and capability scope;
- workbook projection and overflow handling;
- export.

15D should provide only reliable source ownership and provenance. It must not add wide report tables, dashboard queries, fixed round columns, DM/Pre-DM classification, service completion logic, achievement rates, CVD risk, BMI, or report-specific authorization.

## 19. Phase 15D decision and blocker matrix

The impact labels are precise:

- `BLOCKS_15D1`: blocks the corresponding Final domain/persistence slice.
- `BLOCKS_SPECIFIC_FIELD`: blocks only the named field or domain extension.
- `BLOCKS_CALCULATION`: blocks a formula/derived value.
- `BLOCKS_FINAL_REPORTING`: blocks official report projection, not unrelated source capture.
- `CAN_DEFER`: does not block the next safe structural slice, but must remain visible.

| ID | Question | Evidence | Decision / current position | Classification | Blocks | Safe until confirmed |
| --- | --- | --- | --- | --- | --- | --- |
| 15D-D01 | Is AFTER an explicit Program-owned record? | Phase 15A identifies Final/AFTER as a new required domain concept; latest Follow-up is only an informal legacy equivalent. | Yes as the architectural direction: explicit Program-owned Final / Outcome Assessment. All new Program-owned Final creation follows the accepted `ACTIVE`-only lifecycle; exact names/cardinality remain open. | `ACCEPTED` architectural direction; `REQUIREMENT-GATED` for final persistence details | `BLOCKS_15D1` for domain/persistence shape | Do not use latest Follow-up as AFTER. |
| 15D-D02 | What is the relationship between Program completion and Final Assessment? | Phase 15B–15C.4 explicitly make completion lifecycle-only and completed Programs read-only for new Program-owned writes. | Independent states. Final creation is allowed only while the Program is `ACTIVE`; completion does not create Final, and Final does not cause completion. | `ACCEPTED` | `CAN_DEFER` | Preserve `ACTIVE`/`COMPLETED` history with or without Final; reject new Final writes after completion. |
| 15D-D03 | When may a Final Assessment record be created? | Phase 15C.4 establishes completed Programs as read-only for new Program-owned writes. Phase 15D establishes Final Assessment as Program-owned. Workbook timing labels do not define clinical observation windows. | Final Assessment creation is allowed only while the authoritative Program is `ACTIVE`. A `COMPLETED` Program is historical/read-only and rejects new Final creation. Clinical observation timing, backdating, and measurement windows remain unresolved. | `ACCEPTED` lifecycle boundary + `OPEN REQUIREMENT` for observation timing | `CAN_DEFER` for narrow structural persistence; `BLOCKS_SPECIFIC_FIELD` and/or `BLOCKS_FINAL_REPORTING` for observation semantics | Require `Program.status = ACTIVE` at authoritative mutation time; do not invent measurement windows or late Final writes. |
| 15D-D04 | Who may record/read/review Final data? | ADR-0002 requires Role + Capability + Scope; current modules fail closed and do not infer profession authority. | Reuse server-side exact relationship/Program policy; actor capability is unresolved. | `ACCEPTED` boundary + `OPEN REQUIREMENT` vocabulary | `BLOCKS_15D1` for authorization | No new role/capability; existing policy remains authoritative. |
| 15D-D05 | What are DTX official semantics? | Current Baseline/Follow-up fields and workbook/legacy labels exist; unit/context/source are not approved. | Continue only as provisional factual values; no official meaning. | `CURRENT IMPLEMENTATION`; `SAFE PROTOTYPE DEFAULT`; `REQUIREMENT-GATED` | `BLOCKS_SPECIFIC_FIELD`; `BLOCKS_FINAL_REPORTING` | Reuse existing fields without reinterpretation. |
| 15D-D06 | What is the HbA1c contract? | Workbook BEFORE/AFTER; no current field or approved measurement contract. | Do not implement until unit/date/source/entry/validation/history/owner are confirmed. | `REQUIREMENT-GATED` | `BLOCKS_SPECIFIC_FIELD`; `BLOCKS_FINAL_REPORTING` | Leave absent; do not invent ranges. |
| 15D-D07 | What is the Height contract? | Workbook BEFORE; no current field; legacy terminology only. | Raw Height owner, unit, timing, source, and repeat-observation policy are open. | `OPEN REQUIREMENT` | `BLOCKS_SPECIFIC_FIELD`; `BLOCKS_CALCULATION` for BMI | No Height field or inferred patient attribute. |
| 15D-D08 | What is the BMI source/formula/rounding? | Workbook BEFORE/AFTER; Phase 15A says derived and do not store blindly; no rewrite formula. | Must define source observations, units, formula/version, rounding, missing-input behavior, and persistence/projection mode. | `REQUIREMENT-GATED`; `ENGINEERING RECOMMENDATION` | `BLOCKS_CALCULATION`; `BLOCKS_FINAL_REPORTING` | Do not calculate or persist BMI. |
| 15D-D09 | What is the CVD risk formula/version/source? | Workbook label only; no approved rewrite or legacy formula authority. | Official implementation is blocked pending complete algorithm and provenance contract. | `REQUIREMENT-GATED` | `BLOCKS_CALCULATION`; `BLOCKS_SPECIFIC_FIELD`; `BLOCKS_FINAL_REPORTING` | Do not calculate, import, threshold, or display an official percentage. |
| 15D-D10 | What are BP unit and measurement-context semantics? | Current raw systolic/diastolic fields and UI `mmHg`; no accepted protocol/source contract. | Keep paired factual fields provisionally; unit/context/validation remain open. | `CURRENT IMPLEMENTATION`; `REQUIREMENT-GATED` | `BLOCKS_SPECIFIC_FIELD`; `BLOCKS_FINAL_REPORTING` | No clinical interpretation or threshold. |
| 15D-D11 | What are waist unit and context semantics? | Current field and UI `cm`; workbook/legacy labels only. | Keep raw factual field provisionally; unit/protocol/timing/source remain open. | `CURRENT IMPLEMENTATION`; `REQUIREMENT-GATED` | `BLOCKS_SPECIFIC_FIELD`; `BLOCKS_FINAL_REPORTING` | No threshold or derived interpretation. |
| 15D-D12 | What are weight unit and context semantics? | Current field and UI `kg`; workbook/legacy labels only. | Keep raw factual field provisionally; unit/conversion/timing/source remain open. | `CURRENT IMPLEMENTATION`; `REQUIREMENT-GATED` | `BLOCKS_SPECIFIC_FIELD`; `BLOCKS_FINAL_REPORTING` | No trend/success claim from raw values. |
| 15D-D13 | What correction/amendment semantics apply? | Current Baseline/Goal/Follow-up prototypes are immutable or append-oriented; no Final amendment framework is accepted. | One-row overwrite, immutable amendment, review, and versioning remain unresolved. | `OPEN REQUIREMENT` | `BLOCKS_15D1` for cardinality/correction design | Do not add edit/delete or generic amendment behavior. |
| 15D-D14 | Which timestamps represent Final measurement observation? | Program, Baseline, Follow-up, and completion timestamps have different current meanings. | Final persistence/`recordedAt` must occur while the Program is `ACTIVE`; `observedAt` remains a separate, requirement-gated clinical/source concept. `completedAt` and latest Follow-up time are not Final observation time. | `ACCEPTED` lifecycle separation + `REQUIREMENT-GATED` observation semantics | `CAN_DEFER` for narrow structural persistence; `BLOCKS_SPECIFIC_FIELD` and `BLOCKS_FINAL_REPORTING` for observation-dependent fields/reports | Do not equate `startedAt`, `recordedOn`, `recordedAt`, `completedAt`, and `observedAt`. |
| 15D-D15 | How is Program A → B isolation preserved? | Phase 15C.1/15C.4 integration evidence demonstrates exact ownership and independent namespaces. | Final records must be exact Program-owned; no cross-episode reuse or inferred BEFORE. | `ACCEPTED` | `CAN_DEFER` | Keep Program ID explicit and preserve nullable pre-Program history. |
| 15D-D16 | Is normalized source history ready for report projection? | Phase 15A/15C separates normalized history from wide workbook projection; current Program/Goal/Follow-up queries are scoped. | Source foundations are sufficient to prepare 15E, but final measurement semantics, report access, and overflow remain open. | `ACCEPTED` boundary; `ENGINEERING RECOMMENDATION` | `BLOCKS_FINAL_REPORTING` for official report | Keep normalized `0..N`; no wide schema or export. |
| 15D-D17 | Is current `initialBaselineId` sufficient for every Program BEFORE state? | Baseline is relationship-owned and can be linked to an eligible first Program; later episodes are not silently given the same Baseline. | Sufficient only where explicitly linked; not sufficient to promise Program-specific BEFORE for all episodes. | `CURRENT IMPLEMENTATION`; `OPEN REQUIREMENT` | `BLOCKS_SPECIFIC_FIELD` for Program-specific BEFORE | Preserve existing link; no backfill or Program B reuse. |
| 15D-D18 | What is the minimum structural Final payload for MVP? | No accepted source lists the required Final fields. Workbook labels are customer evidence only; clinical field contracts remain gated. | The minimum payload is unresolved. 15D.1 must persist only explicitly approved structural fields and must omit unapproved clinical fields rather than guessing. | `OPEN REQUIREMENT` | `BLOCKS_15D1` | Use server-derived provenance/recording metadata and only owner-approved values; do not promote workbook columns automatically. |

## 20. Explicit open requirements

The following must remain visible to the customer/requirements owner:

The Final record-creation lifecycle is closed by this phase: a new Final Assessment may be persisted only while the authoritative Program is `ACTIVE`; a `COMPLETED` Program remains historical/read-only and rejects new Final writes. The open requirements below must not be interpreted as reopening that lifecycle rule.

1. Final Assessment cardinality: one current record, immutable amendments, or multiple final records.
2. Clinical/source observation timing relative to Program events: whether measurements may be backdated, occur before or after other workflow events or Program completion, what event/window qualifies as AFTER, and how late observations are represented. This does not permit late Final record creation after completion.
3. Final actor/capability vocabulary, reviewer/approval need, read scope, and correction authority.
4. How the valid absence of a Final Assessment should appear in operational/reporting completeness; its lifecycle validity is already accepted.
5. Whether a relationship Baseline may serve multiple Program episodes or whether each episode needs a Program-specific initial observation.
6. DTX unit, context, observation timestamp, source/device/import semantics, validation authority, and report interpretation.
7. Weight, waist, and BP units, context/protocol, observation time, source authority, and validation responsibility.
8. HbA1c unit, observation date/time, source/authority, entry/import rules, historical immutability, validation responsibility, and owner.
9. Height owner, unit, observation timing, repeat policy, source, and correction semantics.
10. BMI formula/version, input observations, units, rounding, missing-input behavior, source snapshot, and whether to calculate or persist.
11. CVD-risk algorithm, version, required inputs, units, authority, rounding, scale, interpretation, timing, and reproducibility.
12. Meaning of report BEFORE/AFTER when timestamps do not align exactly.
13. Whether report completeness is distinct from clinical success and whether any customer-approved success vocabulary exists.
14. Report access scope and whether Final values may be exported for each actor. This belongs to Phase 15E, not a new 15D capability.

No item above is resolved by a workbook label, common clinical convention, or legacy behavior alone.

## 21. Safe implementation subset for Phase 15D.1

15D.1 may proceed after accepting the genuine structural decisions marked `BLOCKS_15D1`. The `ACTIVE`-only Final creation boundary is already accepted and is not an unresolved blocker. Clinical observation timing may remain gated when the narrow structural record uses server-derived recording time and does not claim an official observation window.

### Allowed after the required contract decisions are accepted

- An explicit Final / Outcome Assessment domain owned by exact `PatientProgram`.
- Relationship consistency enforced from the Program ownership chain.
- Server-derived actor provenance and explicit recording timestamp/date.
- Final creation allowed only for an authoritative `ACTIVE` Program.
- Historical Final reads allowed for authorized `ACTIVE` and `COMPLETED` Programs.
- Exact Program-scoped reads and historical read behavior for ACTIVE and COMPLETED Programs.
- Atomic persistence/audit boundary when multiple records must commit together.
- Concurrency protection that re-checks the authoritative Program lifecycle before persistence.
- Reuse of existing raw DTX, weight, waist, and paired BP fields only if the slice explicitly labels them as provisional factual values and does not claim final clinical semantics.
- A safe absence state: no Final record is a valid state until an accepted requirement says otherwise.

### Not allowed in 15D.1 without separate field contracts

- HbA1c persistence or medical ranges.
- Height persistence as an assumed patient/global field.
- BMI calculation or persisted BMI.
- CVD-risk formula, imported official percentage, threshold, or interpretation.
- Any achievement rate, `>70%` count, DM/Pre-DM classification, or clinical success status.
- Automatic Final creation on Program completion.
- Program completion gating on Final, Goal, Follow-up, Service 1, or clinical result.
- Latest Follow-up → AFTER conversion.
- Cross-Program reuse, backfill, or “current latest” inference.
- Generic measurement/event/provenance/amendment frameworks.
- New authorization capabilities or role assumptions.

### 15D.1 readiness statement

`15D.1 is structurally ready only after the customer accepts Final cardinality/correction, actor authority, and the minimum structural Final payload.` The lifecycle boundary is already fixed: Final creation is `ACTIVE`-only, while historical reads remain allowed after completion. Clinical observation timing/backdating/window semantics may remain open and must not be guessed. No clinically official Final field is unconditionally approved by this audit. Existing raw measurement reuse is a provisional option, not a claim that DTX/weight/waist/BP semantics are complete.

## 22. Recommended Phase 15D.1–15D.4 handoff

### 15D.1 — Final Assessment Domain & Persistence

Implement only the explicitly accepted Final domain contract:

- exact Program ownership and relationship integrity;
- accepted cardinality and correction/amendment semantics;
- recording timestamp/date and actor/provenance boundary;
- `ACTIVE`-only Final creation;
- historical Final reads for authorized `ACTIVE` and `COMPLETED` Programs;
- no new Final write against a `COMPLETED` Program;
- existing raw measurement fields only where their provisional reuse is explicitly accepted;
- no speculative clinical calculations or new authorization capabilities.

If Final cardinality, correction semantics, actor authority, or the minimum structural payload is not confirmed, keep 15D.1 at documentation/design readiness and do not create a speculative model. Do not leave `ACTIVE`/`COMPLETED` Final write behavior owner-selectable; the lifecycle boundary is already fixed. Clinical observation timing may remain gated separately.

### 15D.2 — Approved Measurement Semantics

Extend only fields with complete contracts:

- DTX, weight, waist, and BP only after unit/context/source/timing decisions are accepted if official semantics are required;
- HbA1c only after its unit, date, source, entry/import, validation, history, and owner contract is accepted;
- Height only after raw-source ownership and timing are accepted;
- BMI only after Height/Weight source, formula/version, rounding, and persistence/projection behavior are accepted;
- CVD risk only after the complete approved algorithm/version/input/provenance contract is accepted.

Any field still marked `REQUIREMENT-GATED` after 15D.0 must be skipped by 15D.2 rather than represented by a placeholder or guessed default.

### 15D.3 — Final / Outcome UI Integration

After domain and field contracts exist, integrate the Program journey:

```text
BEFORE → During Program → AFTER
```

The UI should use exact Program projections, show safe read-only absence/completed states, preserve historical Program A/B ownership, and avoid implying success from record presence. It must not add client-side authority or expose values whose report visibility is not approved.

### 15D.4 — Final / Outcome Hardening & Program Journey Re-audit

Re-audit:

- Program A → Program B isolation;
- stale lifecycle and authorization drift;
- exact relationship/Program ownership;
- concurrency and idempotency;
- correction/amendment and historical reproducibility;
- Final/measurement timestamp behavior;
- completed Program reads and absence states;
- report handoff without implementing Phase 15E reporting.

15D.4 must also prove the lifecycle/concurrency race when implementation exists:

```text
Request A: create Final Assessment
Request B: complete Program
```

Only these serialized outcomes are valid:

```text
A commits first
  → Final Assessment exists
  → B completes the Program successfully
  → completed Program contains the historical Final record

B commits first
  → Program becomes COMPLETED
  → A re-reads/locks authoritative Program state
  → Final creation is rejected
```

This outcome is invalid:

```text
B completes Program
  → stale A request still commits a new Final afterward
```

The proof belongs to future implementation/integration coverage; no test is added by this documentation-only correction.

## 23. Contradictions and gaps discovered

The review found one internal documentation inconsistency: earlier wording left Final creation after Program completion open even though Phase 15C.4 makes completed Programs read-only for new Program-owned writes. This correction closes that inconsistency. No contradiction remains in the accepted Phase 15B–15C lifecycle/ownership boundary.

The following evidence gaps must remain explicit:

- The workbook's AFTER layout and legacy “latest Follow-up” behavior are not enough to define a Final Assessment. Treating the latter as authoritative would conflict with the current normalized Program contract.
- The relationship-owned Baseline is sound for the current prototype but does not guarantee a distinct BEFORE record for every later Program episode. Program B must not reuse Program A's outcome as its initial state.
- Current `recordedOn`/`recordedAt` values provide recording provenance but not a complete clinical observation-time contract.
- Current DTX/weight/waist/BP persistence is operationally available but semantically provisional; the existence of columns and UI units does not close the measurement contract.
- The customer workbook has report labels for HbA1c, Height, BMI, and CVD risk while the rewrite has no approved domain contracts for them. This is a planned requirement gap, not an implementation defect to close by guessing.
- Final one-record versus versioned/amended history is not decided. It affects persistence cardinality and auditability, so it cannot be postponed until only reporting.

These are not reasons to change the existing Program, Baseline, Goal Plan, Follow-up, Screening, or Appointment architecture in 15D.0.

## 24. Non-goals and validation boundary

This phase intentionally did not:

- modify [`prisma/schema.prisma`](../../prisma/schema.prisma) or migrations;
- add a FinalAssessment model, route, form, Server Action, service, policy, or query;
- calculate BMI or CVD risk;
- define HbA1c ranges, DTX interpretation, BP thresholds, or clinical success;
- convert latest Follow-up into AFTER;
- make Program completion depend on Final, Service 1, Goal, Follow-up, or clinical outcome;
- create a generic clinical measurement/event/provenance/correction framework;
- add report queries, dashboards, workbook projection, or exports;
- add authorization capabilities or infer role/profession permissions.

The final review validation for this documentation-only phase is:

- intended documentation file only is changed;
- Markdown links point to existing repository paths;
- final diff is inspected for contradictions against Phase 15A–15C;
- unresolved HbA1c, Height, BMI, CVD, timing, source, authority, correction, and report-access semantics remain explicitly gated;
- no schema/code/runtime behavior changes;
- Thai source text remains UTF-8 and is not rewritten or translated;
- `git diff --check` passes.

## 25. Final handoff position

The next implementation agent may safely carry forward exact Program ownership, relationship consistency, server-side actor resolution, fail-closed scope, `ACTIVE`-only Final creation, historical reads after completion, lifecycle independence, normalized history, and explicit absence states.

The next implementation agent may not guess Final cardinality, correction semantics, actor authority, minimum payload, clinical observation timing/backdating/windows, measurement authority, clinical units, HbA1c semantics, Height ownership, BMI formula, CVD algorithm, report access, or success thresholds.

The safest next step is to review and accept the genuine `BLOCKS_15D1` decisions in the matrix—cardinality/correction, actor authority, and minimum structural payload—then implement only the narrow structural Final contract with `ACTIVE`-only creation and historical reads after completion. Clinical observation timing remains gated and must not be guessed.
