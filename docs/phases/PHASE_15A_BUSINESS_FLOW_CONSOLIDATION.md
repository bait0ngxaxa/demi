# Phase 15A — Business Flow Consolidation & Legacy Program Activity Audit

- **Status:** ANALYSIS COMPLETE — DOCUMENTATION ONLY
- **Conclusion:** BUSINESS FLOW BASELINE COMPLETE (substantially complete; detail-level decisions remain open)
- **Scope:** This phase inspected the current rewrite, customer workbook, and pinned legacy source. It did not change application code, Prisma schema, migrations, routes, UI behavior, authorization capabilities, calculations, or exports.

## 1. Objective and conclusion

This phase triangulates:

1. The newly supplied customer workbook, Dashboard App Demi.xlsx, as the strongest current evidence of the intended service workflow and reporting layout.
2. The pinned legacy DEMI source as behavioral and terminology evidence only.
3. The current rewrite implementation and accepted architecture as the implementation baseline.

The evidence supports this conclusion:

> **Business-flow discovery is substantially complete.** The macro DEMI journey is reconstructable from Patient/Hospital context through initial assessment, service activities, repeated behavioral follow-up, final/outcome values, and reporting. Remaining uncertainty is primarily detailed field semantics, clinical calculations, program episode lifecycle, correction authority, visibility, requiredness, and report projection rules.

This does not mean that the journey is implemented in the rewrite, or that workbook labels are approved clinical definitions. An absent rewrite entity is an implementation gap; it is not evidence that the business domain is unidentified.

## 2. Inspected sources and revisions

### 2.1 Current rewrite

~~~text
HEAD: a5a183f95bbc7c9cd482cef5cf841ad318b73ab1
Branch: main
~~~

The initial working-tree check showed the newly supplied workbook as the only untracked file:

~~~text
?? docs/Dashboard App Demi.xlsx
~~~

Inspected current sources included:

- PRODUCT.md, DESIGN.md, docs/CONTEXT.md
- docs/architecture/DEMI_ARCHITECTURE_BASELINE.md
- Accepted ADRs 0001–0008 and docs/adr/README.md
- docs/phases/PHASE_14A_REQUIREMENT_WORKSHOP_PREPARATION.md
- docs/phases/PHASE_14B_DEMO_PRODUCTIZATION_UX_POLISH.md
- docs/phases/PHASE_14B2_LOADING_UI_SYSTEM_ROUTE_COVERAGE.md
- Phase 7 Screening, Phase 8 Goals, Phase 9 Appointment/Follow-up, and Phase 10 Profile/Baseline/Evidence documents
- prisma/schema.prisma
- current Patient directory/detail, assignment, Screening, Goal Plan, Appointment, Follow-up, Baseline, and Evidence routes, services, policies, schemas, and tests

### 2.2 Customer workbook

The actual file inspected was:

~~~text
docs/Dashboard App Demi.xlsx
~~~

It is a blank, formatted report template rather than a populated data export. It contains two sheets, styled blank rows, merged headings, and literal explanatory notes. It contains no sample Patient rows and no formula cells. The detailed field map is in PHASE_15A_REPORTING_DATA_MAP.md.

### 2.3 Legacy DEMI

The exact baseline recorded in the existing phase documentation was verified:

~~~text
Repository: raviut-max/demi-plus-web-v2
Local checkout: C:\Users\Bait0ng\Desktop\legacy-demi\demi-plus-web-v2
Commit: 7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e
~~~

The local checkout was at that commit and clean. This phase did not silently change the legacy revision.

The audit included the legacy Follow-up form/detail/history, Baseline, Screening, Goals, Appointments, Patient detail, export path, Supabase query helpers, browser client, and storage/upload behavior. Phase 9A already records the pinned source list and general Appointment/Follow-up audit; this phase focuses on the customer service/report workflow.

## 3. Evidence hierarchy and reading rules

The hierarchy applied was:

1. CUSTOMER WORKBOOK — current customer-provided service/report evidence.
2. ACCEPTED CURRENT REQUIREMENT / ARCHITECTURE — accepted ADRs, architecture baseline, and accepted phase contracts.
3. CURRENT REWRITE IMPLEMENTATION — executable behavior and schema evidence.
4. LEGACY BEHAVIOR — behavioral and terminology evidence only.
5. ENGINEERING RECOMMENDATION — reversible guidance, labeled as such.
6. OPEN REQUIREMENT — unresolved semantics that must not be guessed.

The audit therefore treats:

- a legacy field or formula as non-authoritative;
- a workbook column as a report concept, not a database field;
- a report visibility column as non-authoritative for access;
- a legacy role check as non-authoritative for current permissions;
- a visible label or formula as non-authoritative for clinical meaning;
- fixed report rounds as a projection, not fixed persistence.

## 4. Accepted architecture that remains in force

### 4.1 Identity and scope

- Person and User remain separate.
- Patient clinical/service resources are reached through the exact PatientHospitalRelationship.
- Hospital direct scope does not become global Patient scope.
- OSM Patient access remains exact active assignment scoped through PatientOsmAssignment.
- Hospital hierarchy does not widen Patient authorization.
- Platform ADMIN is not automatically a routine care actor.

Evidence: docs/architecture/DEMI_ARCHITECTURE_BASELINE.md, docs/CONTEXT.md, prisma/schema.prisma lines 198–237, src/modules/patient-directory, and src/modules/patient-assignment.

### 4.2 Application and persistence boundary

- Browser routes use server transport adapters.
- Services orchestrate parsing, policy checks, persistence, audit, and revalidation.
- Policies own authorization and fail closed.
- Prisma is the persistence boundary.
- Consistency-critical mutations use transactions and server-derived actor identity.
- Clinical values do not belong in audit metadata.
- Evidence storage is private and server-mediated; signed access is short lived and not persisted.

Evidence: the architecture baseline, ADR-0005/0006, current module services/policies, patient-evidence storage, and Phase 10D.0.

## 5. Current executable rewrite journey

~~~text
Patient provisioning and activation
    ↓
PatientHospitalRelationship
    ↓
Patient directory / exact Hospital or OSM-assignment access
    ↓
OSM assignment when applicable
    ↓
Screening assessment
    ↓
Goal Plan and activity items
    ↓
Appointment lifecycle
    ↓
Follow-up rounds and optional activity progress
    ↓
Patient profile / Baseline / relationship-level Evidence
    ↓
History and detail projections
~~~

This is the current connected workflow, not yet the complete customer program/report contract.

| Current stage | Current rewrite evidence | Classification |
| --- | --- | --- |
| Patient–Hospital context | PatientHospitalRelationship, Patient directory, relationship routes | ACCEPTED ARCHITECTURE + IMPLEMENTED |
| Hospital access | Direct active Hospital membership and relationship predicates | ACCEPTED ARCHITECTURE + IMPLEMENTED |
| OSM access | PatientOsmAssignment, exact assignment policy, assigned directory | ACCEPTED ARCHITECTURE + IMPLEMENTED |
| Patient activation | Provisioning/activation modules and routes | IMPLEMENTED; outside new Phase 15A semantics |
| Screening | Versioned question/scoring definitions, strict validation, relationship policy, serializable transaction, nonce, history/detail | IMPLEMENTED PROTOTYPE; semantics provisional |
| Goal Plan | Versioned template, primary goal, activity items, target days/value/unit, optional Screening source, history/detail | IMPLEMENTED PROTOTYPE; activity meaning provisional |
| Appointment | Create/reschedule/cancel/complete/no-show, responsible user, history, relationship policy, transaction/audit | IMPLEMENTED PROTOTYPE; operational semantics provisional |
| Follow-up | Relationship-scoped rounds, optional completed Appointment, optional Goal Plan, measurements, confidence, notes, activity progress | IMPLEMENTED PROTOTYPE; customer fields incomplete |
| Baseline | Dedicated one-per-relationship PatientBaseline, measurements, adaptation text, confidence, summary/recommendations | IMPLEMENTED PROTOTYPE; not a full program BEFORE record |
| Evidence | Relationship-level image artifact metadata, private storage, bounded upload, exact scope, short-lived content access | IMPLEMENTED PROTOTYPE; event ownership open |
| Histories/detail | Screening, Goal Plan, Appointment, Follow-up, Baseline, and Evidence projections | IMPLEMENTED; report projection not implemented |
| Program episode | No enrollment/start/end/completion entity | NEW — REQUIRED |
| Service 1 | No explicit owner for routine schedule, floating/sinking chart, or dream card | NEW — REQUIRED / EXTEND after decisions |
| Final/AFTER assessment | No program-tied final record distinct from latest Follow-up | NEW — REQUIRED / decision-dependent |
| Dashboard/report/export | No customer workbook projection or export contract | REPORT PROJECTION ONLY; deferred |

### 5.1 Accepted architecture versus provisional behavior

Accepted architecture includes exact relationship/assignment scope, server-side authority, policy/service/Prisma boundaries, transactional writes, versioned definitions where historical reproducibility matters, dedicated Baseline ownership, and relationship-level Evidence without a generic polymorphic attachment model.

Provisional prototype behavior includes Screening wording and scoring, confidence meaning, Goal activity vocabulary and target semantics, Follow-up measurement units and activity statuses, Baseline completeness, artifact ownership for future activity images, clinical calculations, and official outcome vocabulary.

Unresolved requirements include program episode lifecycle, DM/Pre-DM and illness duration, BEFORE/AFTER timing, HbA1c/DTX/height/BMI/CVD risk semantics, achievement aggregation, outcome/adjustment/obstacle semantics, correction, visibility, and export.

## 6. Customer workbook interpretation

### 6.1 Inventory

| Sheet | Worksheet part | Dimension | Observed purpose |
| --- | --- | --- | --- |
| Dashboard ภาพรวม | xl/worksheets/sheet1.xml | A1:AQ29 | Overall/outcome report with context, BEFORE values, six visible during-program rounds, and AFTER values |
| รายงานการจัดบริการ | xl/worksheets/sheet2.xml | A1:BM37 | Service-process report with BEFORE/AFTER values, Service 1/2 coverage, and visible Service 3–6 groups |

The workbook has merged headings and styled blank rows but no populated observations. It has no formula cells, data-validation records, or encoded dropdown list. The service sheet has a literal note that the application already uses a dropdown for outcome phrases; that describes intended application behavior, not a workbook validation rule.

### 6.2 Overall/outcome sheet

The first sheet groups:

- Hospital/site and DM/Pre-DM case counts;
- sequence, first name, last name, ID, illness duration, and OSM/caregiver;
- BEFORE: program start date, CVD risk score, HbA1c, DTX, body weight, BMI, height, waist, and BP upper/lower;
- during-program rounds 1–6: DTX, body weight, and Achieve score;
- AFTER: program end date, CVD risk score, HbA1c, DTX, body weight, BMI, waist, and BP upper/lower.

It is evidence for a start/during/end comparison. It does not establish formula, units, authority, timing, or persistence.

### 6.3 Service-process sheet

The second sheet groups:

- Hospital/site and DM/Pre-DM counts;
- sequence, name, ID, illness duration, OSM/caregiver, program start/end;
- BEFORE: DTX, body weight, PAM score, PROMs score, confidence ruler, and weekly exercise time;
- AFTER: DTX, body weight, weekly exercise time, and count of times achievement rate was greater than 70%;
- Service 1 Know Yourself: floating/sinking chart, dream card, routine schedule, each with ทำ/ไม่ทำ;
- Service 2 health plan/small goals: food quantity reduction, food type change, meals per week, exercise goal, exercise days per week, total exercise time per week;
- Service 3 onward: follow-up date, achieved days/count, achievement rate, outcome phrase, plan adjustment, and obstacle presence.

The visible Service 3–6 layout is not a hard maximum. The note says to record as many follow-ups as occur and expects approximately 2–4 per program.

### 6.4 Supported versus unsupported conclusions

**CUSTOMER WORKBOOK supports:**

- a BEFORE/during/AFTER shape;
- a Know Yourself stage;
- a health-plan/small-goals stage;
- repeated behavioral follow-up;
- food, exercise, reflection artifacts, achieved days, rate, outcome, adjustment, and obstacles as report concepts;
- a completeness overview with detail in individual records;
- variable follow-up count.

**The blank workbook does not establish:**

- mandatory fields;
- source or authority of ID, DM/Pre-DM, illness duration, OSM, CVD risk, PAM, PROMs, or measurements;
- DTX/HbA1c units/context;
- CVD risk formula/version;
- whether BMI is entered or derived;
- exact BEFORE/AFTER timing;
- denominator/zero-target/aggregation/threshold semantics;
- official outcome vocabulary;
- report access or export authorization.

## 7. Deep legacy program-activity audit

All findings in this section are LEGACY BEHAVIOR. They are not promoted to current requirements.

### 7.1 Legacy data split and Baseline

~~~text
Screening
  → profiles.pam_level / zone
  → Goals rounds
  → records-style daily activity data

Appointment
  → appointment_followups
  → Follow-up detail/history
~~~

Legacy Baseline is not a dedicated entity. The Baseline page writes an appointment_followups row with followup_round = 0 and appointment_id = null (app/admin/patients/[id]/baseline/page.tsx:364-398). The rewrite deliberately uses a separate PatientBaseline.

The legacy complete Follow-up helper stores measurements, adaptation fields, coarse activity statuses, confidence, summary, recommendations, and status (lib/supabase/queries.ts:1810-1875). It does not contain structured achieved-days, achievement-rate, or outcome-code fields.

### 7.2 Activity trace

| Activity | UI and input | Representation/persistence | Detail/history/calculation/link | Evidence-based meaning |
| --- | --- | --- | --- | --- |
| Life/routine schedule | Image upload labelled as a life schedule/work sheet; no structured routine/time-slot input. followup page.tsx:516-531; baseline page.tsx:561-598 | life_schedule_image_url on the legacy Follow-up row; followup page.tsx:326-330; queries.ts:1767-1799 | Detail renders image/thumbnail and link; no parser, content validation, or calculation. view page.tsx:211-238 | Richer self-reflection activity represented as an artifact, not routine data |
| Floating/sinking chart | Image plus floating_chart_summary text. followup page.tsx:547-568 | floating_chart_image_url plus floating_chart_summary | Detail displays both; no point schema, required content, validation, or calculation. view page.tsx:270-315 | Artifact/text activity with unknown business interpretation |
| Dream card | Image plus dream_card_description. followup page.tsx:570-591 | dream_card_image_url plus dream_card_description | Detail displays both; no calculation or structured dream fields. view page.tsx:317-361 | Artifact/text reflection activity with unknown content/requiredness |
| Confidence ruler | Screening, Baseline, and Follow-up expose a 0–10 input/slider and improvement-plan text. screening page.tsx:479-529; baseline page.tsx:48-57; followup page.tsx:625-651 | Screening stores in screenings; Baseline/Follow-up store in appointment_followups. queries.ts:1204-1270 and 1810-1875 | Detail shows score/plan; history compares first/latest and treats higher as improvement. history page.tsx:185-228 | Repeated 0–10 reflection construct, not proven to be one authoritative clinical instrument |
| Food quantity | Three-choice status plus note | food_amount_status plus note | Auto-summary creates success/failure phrases but does not use Goal targets | Manual coarse adherence observation, not achievement rate |
| Food type | Three-choice status plus note | food_type_status plus note | Same summary behavior | Manual coarse adherence observation |
| Movement/exercise | Three-choice status plus note | movement_status plus note | Same summary behavior | Manual coarse adherence observation |
| Goal activities | Food, exercise, measurement, water, sleep, and other codes; target days/value/unit. queries.ts:1339-1400 | Goals/records are separate from three Follow-up statuses; records use completion and exercise-minute fields. queries.ts:1580-1683 | Legacy percentage is completed records divided by records present, not target-days denominator; no reliable active UI call site for all records writes | Plan/progress distinction, not canonical achievement formula |
| Adaptation/obstacles | obstacles, opportunities, or other choice then text areas | adaptation_summary, adaptation_obstacles, adaptation_opportunities, adaptation_other | Detail renders text; no controlled classification or conditional validation | Reflection/obstacle/opportunity notes |
| Summary/recommendations | Summary generated from three statuses; recommendations free text | summary and recommendations | Detail shows both; status values include excellent, good, fair, needs_improvement, monitoring | Narrative plus a legacy status with no confirmed meaning |
| Achievement/success | Status changes generate success/failure sentences | No achieved-days, numerator, denominator, rate, code, or >70% counter | Separate records percentage uses another denominator | Progress workflow exists; official workbook metrics do not |

### 7.3 Follow-up rounds and links

- The form and getFollowupRoundCount use count(appointment_followups for Patient) + 1 (followup page.tsx:215-223; queries.ts:1917-1927).
- Because Baseline is round 0 in the same table, the first true Follow-up can be misnumbered as round 2.
- History loads rows ordered by date/round; some form context shows only the latest three.
- Patient detail links Screening, Goals, Appointments, and Follow-up history.
- A completed Appointment may expose Follow-up creation; the Follow-up then updates Appointment status separately.
- The sequence is not atomic: insert Follow-up, then update Appointment.
- Rewrite Follow-up uses a relationship-scoped round and serializable transaction, and validates an optional Appointment as completed.

### 7.4 Files, images, and storage

Legacy uploads:

- accept image MIME types and enforce a client-side 5 MB limit;
- use followup-images or patient-status-images buckets;
- create names from Patient/round/field/time/random fragments;
- persist one-year signed URLs in application rows;
- do not persist a consistent event/artifact metadata record for life/floating/dream images;
- have inconsistent status-tracking and Baseline image paths.

The browser Supabase client, local-storage session/role checks, broad queries, long-lived embedded URLs, raw client errors, and separate writes are architecture-conflicting legacy patterns. The rewrite's private, server-mediated relationship Evidence boundary is the accepted direction.

### 7.5 Legacy inconsistencies and unsafe patterns

The audit verified rather than normalized:

1. Direct browser Supabase reads/writes and client-side role checks.
2. Follow-up input can be detached from the Appointment ID passed in a query string.
3. Duplicate Follow-up persistence paths have different field sets.
4. Baseline is a Follow-up row with round zero, causing round ambiguity.
5. Auto-summary can overwrite operator-entered summary text.
6. Follow-up and Appointment status are separate writes.
7. Numeric values have weak semantic validation; source data/units are not authoritative.
8. Legacy scope can expand to parent/sibling Hospitals; this is not current Patient access evidence.
9. Legacy status, summary, and trend charts contain unapproved directionality and visual calculations.

## 8. Canonical current program journey

~~~text
Patient has an active Hospital relationship and an authorized care actor
    ↓
Program episode is opened
    ↓
BEFORE assessment and measurements
    ├─ PAM / PROMs and confidence reflection
    ├─ DTX, weight, waist, BP, and approved additional measures
    └─ DM / Pre-DM and illness-duration context when authoritative
    ↓
Service 1 — Know Yourself
    ├─ routine/life schedule
    ├─ floating/sinking chart
    ├─ dream card
    └─ completion/reflection evidence
    ↓
Service 2 — Health Plan / Small Goals
    ├─ food quantity goal
    ├─ food type/change goal
    └─ exercise/movement goal with approved targets
    ↓
Service 3..N — Behavioral Follow-up
    ├─ follow-up event/date and measurements
    ├─ achieved days/count and achievement rate
    ├─ outcome phrase/code
    ├─ plan adjustment
    └─ obstacle presence/details
    ↓
Final / AFTER assessment and measurements
    ↓
Program completion event
    ↓
Outcome dashboard and service-completeness report
    ↓
Individual detail/history for supporting evidence
~~~

The exact start/completion event, multiple-episode policy, and final-record representation remain open. This is a canonical business-flow baseline, not an accepted database design.

| Concept | Meaning | Do not conflate with |
| --- | --- | --- |
| Business stage | Know Yourself, Health Plan/Small Goals, Behavioral Follow-up | A table or report column |
| Activity | Routine schedule, chart, dream card, food goal, exercise goal | Assessment or completed Appointment |
| Assessment | Screening/PAM/PROMs/confidence or final/initial outputs | Raw measurement or report count |
| Measurement | DTX, weight, waist, BP, HbA1c, height, BMI, or approved risk input | Formula or derived dashboard number |
| Follow-up event | Dated behavioral round with notes/progress | Fixed report round column |
| Goal Plan | Versioned activities and targets | Later achievement result |
| Appointment | Operational scheduling/lifecycle record | Proof that a service was completed |
| Program episode | Bounded program participation context | Patient–Hospital relationship |
| Report projection | Audience-specific output from normalized history | Authorization or source-of-truth persistence |

## 9. Current rewrite mapping

| Flow element | Rewrite mapping | Reuse | Missing/decision |
| --- | --- | --- | --- |
| Patient/Hospital | PatientHospitalRelationship and directory | Exact scope, Hospital, HN, Person/Profile separation | Report ID meaning |
| OSM/caregiver | PatientOsmAssignment | Active assignment and history | Current versus episode-responsible OSM |
| Program episode | None | Relationship as parent scope | Start/end/completion, multiple episodes, actor, authority |
| BEFORE | Screening plus dedicated Baseline | Versioned Screening, dedicated Baseline, history | Event membership, timing, completeness |
| PAM/PROMs | Screening response/result JSON | Historical version preservation | Approval and visibility |
| Confidence | confidenceScore in three prototype contexts | 0–10 validation/storage | Semantic equivalence and source |
| Service 1 | None; generic relationship Evidence | Private Evidence boundary | Content, artifact owner, visibility |
| Service 2 | PatientGoalPlan and PatientGoalItem | Versioned plans and target shape | Map customer food/exercise categories |
| Appointment | PatientAppointment | Scope, responsible user, lifecycle | Whether every service follow-up requires one |
| Service 3..N | PatientFollowup and progress rows | Normalized rounds, links, measurements | Achieved days/rate/outcome/adjustment/obstacle |
| AFTER | None | Historical reads only as projection input | Final event, timing, correction |
| Reports | None | Existing scoped query/service boundaries | Contract, metrics, access, overflow, export |

## 10. Implementation coverage matrix

| Concept | Customer workbook | Legacy | Rewrite | Current status | Recommended action |
| --- | --- | --- | --- | --- | --- |
| Patient–Hospital relationship | Context in both sheets | Global/user-centric IDs | Exact relationship access parent | IMPLEMENTED — REUSE | Reuse exact scope |
| OSM assignment | Caregiver column | Broad caregiver/operator context | Exact active assignment/history | IMPLEMENTED — VERIFY SEMANTICS | Decide report OSM projection |
| Program enrollment/lifecycle | Start/end imply bounded program | No explicit episode | No entity | NEW — REQUIRED | Define episode identity/lifecycle |
| Program start/end | Explicit dates | No reliable events | No fields | DECISION REQUIRED | Do not infer from Baseline/Appointment |
| DM / Pre-DM | Counts/groups | Terms only | No classification | DECISION REQUIRED | Approve source/rule/version |
| Illness duration | Direct context column | Unconfirmed | No field | NEW — REQUIRED | Approve source/unit/reference date |
| Screening | PAM/PROMs in BEFORE | Legacy questionnaire/score | Versioned provisional Screening | IMPLEMENTED — VERIFY SEMANTICS | Reuse boundary; do not promote score |
| PAM | BEFORE score | Answers/sum/profile projection | Screening result JSON | IMPLEMENTED — VERIFY SEMANTICS | Confirm questionnaire/meaning |
| PROMs | BEFORE score | Answers/sum/profile projection | Screening result JSON | IMPLEMENTED — VERIFY SEMANTICS | Confirm questionnaire/meaning |
| Confidence ruler | BEFORE ruler score | 0–10 score/plan | 0–10 in Screening/Baseline/Follow-up | IMPLEMENTED — EXTEND | Confirm equivalence/requiredness |
| Baseline/BEFORE | BEFORE groups | Follow-up round 0 | Dedicated Baseline | IMPLEMENTED — EXTEND | Define program linkage/completeness |
| AFTER/final assessment | AFTER groups/end date | Latest Follow-up informal equivalent | None | NEW — REQUIRED | Define final event/timing |
| Weight | BW before/round/after | Follow-up/Baseline weight | Baseline/Follow-up weight | IMPLEMENTED — VERIFY SEMANTICS | Confirm unit/context |
| Waist | Before/after waist | Follow-up/Baseline waist | Baseline/Follow-up waist | IMPLEMENTED — VERIFY SEMANTICS | Confirm unit/timing |
| BP | Upper/lower before/after | Sys/dia, mmHg UI | Baseline/Follow-up sys/dia | IMPLEMENTED — VERIFY SEMANTICS | Confirm context/validation |
| DTX | Before/round/after DTX | blood_sugar_dtx, DTX/mg% label | Baseline/Follow-up blood sugar | IMPLEMENTED — VERIFY SEMANTICS | Confirm unit/context |
| HbA1c | Before/after | Terminology only | None | NEW — REQUIRED | Approve source/unit/date |
| Height | Before | Profile/detail terminology, not Follow-up input | None | NEW — REQUIRED | Approve source/unit/date |
| BMI | Before/after | Display/visual only | None | DERIVED — DO NOT STORE BLINDLY | Approve height/weight/formula/rounding |
| CVD risk | Before/after | No approved formula | None | DECISION REQUIRED | Approve formula/version/source |
| Life/routine schedule | Service 1 completion | Image-only URL | No owner; generic Evidence | NEW — REQUIRED | Confirm structure/requiredness |
| Floating/sinking chart | Service 1 completion | Image + summary | No owner | NEW — REQUIRED | Confirm content/ownership |
| Dream card | Service 1 completion | Image + description | No owner | NEW — REQUIRED | Confirm content/ownership |
| Goal Plan | Service 2 | Legacy Goals rounds | Versioned Goal Plan/items | IMPLEMENTED — EXTEND | Map customer categories |
| Food quantity goal | Reduce meals and meals/week | Food status/activities | Generic goal item | IMPLEMENTED — EXTEND | Define quantity/frequency meaning |
| Food type goal | Change food type | Food status/activities | Generic goal item | IMPLEMENTED — EXTEND | Define code/target |
| Exercise goal | Presence/days/time | Movement/status/value | Generic target days/value/unit | IMPLEMENTED — EXTEND | Confirm time/day semantics |
| Target days | Weekly-looking values | target_days | targetDays 1–7 | IMPLEMENTED — VERIFY SEMANTICS | Confirm period/denominator |
| Target value/unit | Meals/time | target value/unit | targetValue/targetUnit | IMPLEMENTED — VERIFY SEMANTICS | Confirm allowed units |
| Follow-up rounds | Six visible, variable note | History/round | Normalized roundNumber | IMPLEMENTED — REUSE | Define projection overflow |
| Achieved days/count | Per follow-up | Not structured | None | NEW — REQUIRED | Define numerator/period |
| Achievement rate | Achieve score/rate/note ratio | No official rate | None | DECISION REQUIRED | Define formula/zero/missing |
| Outcome/result | Phrase field/dropdown note | Free text/status phrases | None | DECISION REQUIRED | Obtain controlled vocabulary |
| Plan adjusted | Yes/no | Goals can archive/replace | None | NEW — REQUIRED | Define event/new Plan relation |
| Obstacle presence | Yes/no | Obstacle text | Notes only | IMPLEMENTED — EXTEND | Define boolean/detail owner |
| Follow-up measurements | DTX/BW and selected values | Measurement set | Weight/waist/BP/DTX | IMPLEMENTED — EXTEND | Add only approved fields |
| Summary/recommendations | Detail elsewhere | Free text | Notes/summary fields | IMPLEMENTED — VERIFY SEMANTICS | Define ownership/visibility |
| Service completeness | Explicit completeness-only report | No same report | None | REPORT PROJECTION ONLY | Define requiredness/completeness |
| Dashboard | Overall dashboard sheet | Statistics incomplete | None | REPORT PROJECTION ONLY | Define scope/metrics |
| Report | Both sheets | Different legacy export | None | REPORT PROJECTION ONLY | Treat as output candidate |
| Excel export | Actual workbook template | Six-follow-up flattening | None | DEFERRED | Wait for contract/access/overflow |

## 11. What legacy may safely supply as a prototype default

LEGACY-ALIGNED SAFE DEFAULT candidates, only if explicitly reversible and provisional:

- separate Service 1 cards for routine schedule, floating/sinking chart, and dream card;
- optional image-plus-text activity inputs using the rewrite's server-side Evidence boundary;
- separate food quantity, food type, and movement prompts tied to the selected Goal Plan;
- current rewrite activity statuses DONE, PARTIAL, NOT_DONE, and NOT_APPLICABLE as structural workshop values;
- current 0–10 confidence field as a provisional input;
- fixed six-column report output as a projection from normalized 0..N history.

Not safe to default:

- legacy PAM/PROMs formulas or clinical thresholds;
- CVD risk, BMI, or any clinical derived formula;
- DTX/HbA1c units/context;
- DM/Pre-DM classification;
- image requiredness;
- official outcome/status vocabulary;
- achievement denominator, >70% count, or multi-activity aggregation;
- correction, amendment, review, visibility, or responsible-OSM authority;
- legacy URLs, direct browser persistence, local-storage roles, broad scope, or separate non-transactional writes.

## 12. Remaining decision register

| ID | Question | Why it matters | Evidence | Classification | Smallest safe recommendation |
| --- | --- | --- | --- | --- | --- |
| P15A-D01 | What is workbook ID: Patient ID, Hospital-local HN, relationship ID, external program ID, or alias? | Wrong identity can join reports to the wrong resource | Workbook only says ID; rewrite has relationship ID/HN; legacy has global IDs | BLOCKS_IMPLEMENTATION | Keep report ID unresolved; use opaque relationship identity internally |
| P15A-D02 | What is the DM/Pre-DM source/rule/version? | Controls counts and sensitive grouping | Workbook counts; no formula; legacy terms not authoritative | BLOCKS_IMPLEMENTATION | Do not derive/store until source and effective date are approved |
| P15A-D03 | What is illness-duration source, unit, and reference date? | Direct report context can be misread | Workbook column; no rewrite field; legacy unconfirmed | BLOCKS_IMPLEMENTATION | Obtain owner-defined source/unit |
| P15A-D04 | What event opens/completes a program, and are multiple episodes allowed? | Controls start/end, uniqueness, grouping, final state | Workbook dates; legacy no episode; rewrite no entity | BLOCKS_IMPLEMENTATION | Define episode identity/lifecycle/cardinality |
| P15A-D05 | Current OSM or OSM responsible during program? | Assignment can change and accountability differs | Workbook caregiver; rewrite assignment history; legacy broad | BLOCKS_IMPLEMENTATION | Choose an episode-responsible projection only if confirmed |
| P15A-D06 | Is confidence ruler equivalent across Screening, Baseline, and Follow-up? | Affects comparison, requiredness, and meaning | Workbook label; legacy/rewrite repeat 0–10 | BLOCKS_IMPLEMENTATION | Confirm scale, construct, owner, source |
| P15A-D07 | What content/requiredness do routine, chart, and dream card require? | Determines shape, validation, completeness, ownership | Workbook completion; legacy image/text only | BLOCKS_IMPLEMENTATION | Approve minimum content and image/text requirement |
| P15A-D08 | Do activity images belong to Service 1, Baseline, Follow-up, or relationship Evidence? | Wrong owner loses provenance or leaks data | Legacy uploads; rewrite Evidence relationship-level | BLOCKS_IMPLEMENTATION | Select one owner per artifact type |
| P15A-D09 | What CVD risk formula/version/source is approved? | Wrong official-looking value is unsafe | Workbook label only; no rewrite formula | BLOCKS_IMPLEMENTATION | Do not calculate until approved |
| P15A-D10 | What are HbA1c/DTX units, contexts, dates, and authorities? | Same number can have different meaning | Workbook labels; legacy UI; rewrite provisional units | BLOCKS_IMPLEMENTATION | Confirm measurement metadata first |
| P15A-D11 | Is BMI entered or derived, and which height/weight observations feed it? | Duplicate/stale values can contradict | Workbook has BMI/height; no formula/rewrite fields | BLOCKS_IMPLEMENTATION | Approve source, formula, rounding, version |
| P15A-D12 | What exactly counts as BEFORE/AFTER and when recorded? | Determines report source and comparison | Workbook groups/dates; legacy latest Follow-up informal | BLOCKS_IMPLEMENTATION | Define timing windows and authoritative events |
| P15A-D13 | Achievement numerator, denominator, period, and zero-target behavior? | Controls score/rate/completeness | Workbook note gives concept only; legacy ratios differ | BLOCKS_IMPLEMENTATION | Approve named calculation contract |
| P15A-D14 | How is multi-activity achievement aggregated and what does >70% count? | AFTER output can silently misstate success | Workbook count; no formula/legacy equivalent | BLOCKS_IMPLEMENTATION | Define per-activity/per-round unit and aggregation |
| P15A-D15 | What is the official outcome phrase/code vocabulary? | Stable report values require a controlled list | Workbook note says dropdown; file has no validation; legacy differs | BLOCKS_IMPLEMENTATION | Obtain versioned controlled list; separate narrative |
| P15A-D16 | What does plan adjusted mean, and when does it create a new Goal Plan? | Yes/no may represent a domain mutation | Workbook yes/no; legacy archive/replace; rewrite immutable plans | BLOCKS_IMPLEMENTATION | Make adjustment an explicit event decision |
| P15A-D17 | What correction/amendment/review rules apply? | Immutable data needs safe correction | Current phases open; legacy overwrites/edits without provenance | BLOCKS_IMPLEMENTATION | Choose append-only amendment semantics |
| P15A-D18 | Who may read/report/export, and what may OSM/Hospital roles see? | Workbook visibility is not authorization | Accepted exact scope; workbook no policy; legacy broad | BLOCKS_IMPLEMENTATION | Define capabilities/projections; fail closed |
| P15A-D19 | What happens beyond six visible follow-ups? | Note allows as-many-as-recorded | Workbook six-wide; rewrite normalized | BLOCKS_IMPLEMENTATION | Preserve all rounds; define continuation/overflow |
| P15A-D20 | Can current status labels and artifact/text layout remain provisional? | Enables reversible validation | Legacy/rewrite structural pattern | CAN_USE_SAFE_PROTOTYPE_DEFAULT | Use only with no official calculation |
| P15A-D21 | Can export formatting wait for normalized reporting contract? | Formatting cannot solve missing semantics | Workbook layout only; rewrite no export | CAN_DEFER | Defer export implementation |

## 13. Business-flow closure assessment

### Decision: BUSINESS FLOW BASELINE COMPLETE

This decision is supported because:

1. The workbook identifies the same macro area present in legacy: Patient context, initial assessment, self-reflection activities, health-plan goals, repeated behavioral follow-up, final values, and reporting.
2. Legacy confirms the named activities and shows a workflow richer than a completed flag: life/routine schedule, floating/sinking chart, dream card, confidence ruler, food quantity/type, movement, adaptation obstacles/opportunities, measurements, history, summary/recommendations, and images.
3. The rewrite already implements the operational spine and accepted security boundary: relationship, exact OSM assignment, Screening, Goal Plan, Appointment, Follow-up, Baseline, Evidence, and history/detail.
4. The remaining gaps are identifiable extensions/projections of that spine: program lifecycle, Service 1 ownership, richer Follow-up values, final/AFTER semantics, approved measurement/calculation contracts, and reporting/export.
5. No additional macro domain was found that cannot be placed in the reconstructed journey.

This conclusion should be reopened if the customer identifies a separate workflow such as medication management, clinician review/approval, referral/diagnosis, billing, or a different program cohort process. None was evidenced by the inspected workbook or pinned legacy program flow.

## 14. Recommended Phase 15B scope

Phase 15B should close the implementation contract before building:

1. Program episode identity, cardinality, start/completion/cancellation/re-entry, BEFORE/AFTER ownership, DM/Pre-DM, illness duration, and OSM projection.
2. Service 1 minimum content, requiredness, structured versus artifact data, artifact ownership, visibility, correction, and retention.
3. Service 2 and Follow-up mapping for food quantity/type/movement, target period, achieved days, rate, zero denominator, aggregation, >70% count, outcome vocabulary, plan adjustment, obstacles, and summaries.
4. Measurement/assessment rules for DTX/HbA1c, height/BMI, CVD risk, and initial/final timing.
5. Report capabilities, actor projections, completeness, normalized-to-wide projection, overflow, export authority, and format.
6. A small current program/report contract, an ADR only if accepted architecture changes, and an implementation-ready vertical-slice list.

Phase 15B must not copy legacy persistence/security patterns or begin clinical calculations before the relevant decisions are accepted.

## 15. Verification and self-review

- Current rewrite HEAD and initial working-tree state were checked.
- The exact legacy revision was verified in documentation and local checkout.
- Workbook sheets, dimensions, headings, merged layout, notes, blank-template nature, absence of formulas, and absence of encoded validations were inspected from the actual XLSX package.
- Current schema fields were checked against prisma/schema.prisma.
- Current routes/services/policies/schemas were checked for Screening, Goals, Appointments, Follow-ups, Baseline, Evidence, Patient assignment, and directory scope.
- Legacy field names and activity paths were traced from UI input through persistence, detail/history rendering, calculations, and storage.
- Legacy-only formulas and security patterns were marked non-authoritative.
- Fixed workbook round columns were treated as report projection, not persistence design.
- No clinical formula, threshold, authorization capability, or schema was invented or changed.

After both Phase 15A documents are created, run git diff --check and inspect the diff for Thai encoding/mojibake. No build or integration suite is necessary for this documentation-only phase.
