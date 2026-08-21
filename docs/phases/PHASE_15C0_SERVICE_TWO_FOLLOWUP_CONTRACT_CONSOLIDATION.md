# DEMI Phase 15C.0 — Service 2 & Follow-up Contract Consolidation

**สถานะ:** Analysis / contract consolidation only  
**วันที่ตรวจสอบ:** 2026-08-21  
**Readiness gate:** `READY_WITH_PROVISIONAL_DEFAULTS`

เอกสารนี้กำหนดสัญญาขั้นต่ำที่ปลอดภัยสำหรับ Phase 15C.1+ โดยไม่แก้ Prisma schema, migration, route, Server Action, service, policy, UI หรือ production data ใน Phase 15C.0

## 1. Executive conclusion

คำตอบหลักคือ **Goal Plan และ Follow-up ปัจจุบันยังไม่สามารถแยกหลาย Patient Program ได้อย่างปลอดภัยโดยไม่มี Program linkage** ทั้งสอง domain ผูกกับ `PatientHospitalRelationship` และใช้ `roundNumber` ที่ unique ในระดับ relationship เท่านั้น ขณะที่ Service 1 ผูกกับ `PatientProgram` โดยตรงแล้ว ดังนั้นการแสดง “แผนล่าสุด” หรือ “Follow-up ล่าสุด” จาก relationship เดิมจะมีความเสี่ยงนำข้อมูลของ Program A ไปแสดงเป็น progress ของ Program B

แนวทางที่เล็กที่สุดและไม่สร้างระบบซ้ำคือ:

```text
PatientProgram
    ↓
PatientGoalPlan.patientProgramId (required for new Program workflow)
    ↓
PatientGoalItem
    ↓
PatientFollowup.patientProgramId (required for new Program workflow)
    ↓
PatientFollowupActivityProgress
```

ข้อเสนอเชิง implementation คือเพิ่ม linkage แบบ nullable ใน storage เพื่อรักษา historical pre-Program records ที่ยังไม่มีหลักฐานว่าเป็นของ Program ใด แต่บังคับ `patientProgramId` ที่ application boundary สำหรับ record ใหม่ของ Program workflow วิธีนี้ไม่ต้อง backfill ข้อมูลเดิมไปยัง Program ที่เดาเอง และไม่ต้องสร้าง `PatientProgramServiceTwo*` หรือ goal/follow-up subsystem คู่ขนาน

สัญญาที่พร้อมนำไปออกแบบใน 15C.1 คือ:

- Goal Plan ใหม่ต้องเป็นของ **หนึ่ง ACTIVE Program** ที่อยู่ใน exact Patient/Hospital relationship เดียวกัน
- Follow-up ใหม่ต้องเป็นของ **หนึ่ง ACTIVE Program** เช่นกัน
- ถ้า Follow-up อ้าง `sourceGoalPlanId`, Goal Plan ต้องเป็นของ Program เดียวกัน
- `PatientFollowupActivityProgress` ยังคงเป็น child ของ Follow-up และไม่ต้องมี Program FK ซ้ำ
- Follow-up ยังคงเป็น normalized `0..N` records และ `roundNumber` เป็น Program-scoped สำหรับ records ใหม่ ไม่ใช่คอลัมน์ `Followup1` ถึง `Followup6`
- Appointment ยังคงเป็น operational scheduling record ที่ optional ไม่ถูกบังคับให้เป็น Service 2/Follow-up record
- ยังไม่บันทึกหรือคำนวณ official achievement rate, `>70%`, outcome enum, plan-adjustment semantics หรือ completion gate

สิ่งที่ยังไม่รู้ เช่น สูตร achievement rate, ความหมายของ plan adjustment และ controlled outcome vocabulary ไม่ควรขวาง domain foundation ของ 15C.1 แต่ต้องขวางเฉพาะ field/calculation/reporting ที่พึ่งพาคำตอบเหล่านั้น

## 2. Sources inspected

ใช้ source hierarchy ตาม Phase 15A:

```text
customer workbook
→ accepted architecture / ADR / phase contracts
→ current rewrite implementation
→ pinned legacy behavior
→ engineering recommendation
→ open requirement
```

### Accepted architecture and phase contracts

- [PHASE_15A_BUSINESS_FLOW_CONSOLIDATION.md](./PHASE_15A_BUSINESS_FLOW_CONSOLIDATION.md) — canonical journey, evidence hierarchy, Service 2/Follow-up gaps, authorization and reporting boundaries
- [PHASE_15A_REPORTING_DATA_MAP.md](./PHASE_15A_REPORTING_DATA_MAP.md) — workbook-to-domain mapping and normalized reporting boundary
- [PHASE_15B0_PROGRAM_WORKFLOW_FOUNDATION.md](./PHASE_15B0_PROGRAM_WORKFLOW_FOUNDATION.md) — `PatientProgram` lifecycle, exact relationship policy, baseline linkage and no Service 2 completion gate
- [PHASE_15B1_SERVICE_ONE_DOMAIN_PERSISTENCE.md](./PHASE_15B1_SERVICE_ONE_DOMAIN_PERSISTENCE.md) — Program-owned Service 1 records, immutable writes and policy
- [PHASE_15B2_SERVICE_ONE_UI_EVIDENCE_INTEGRATION.md](./PHASE_15B2_SERVICE_ONE_UI_EVIDENCE_INTEGRATION.md) — narrow Service 1 evidence association and private Evidence boundary
- [PHASE_15B3_SERVICE_ONE_INTEGRATION_HARDENING.md](./PHASE_15B3_SERVICE_ONE_INTEGRATION_HARDENING.md) — current Program journey, historical read behavior and absence of a Service 1 completion gate
- [PHASE_8A_GOALS_AND_ACTIVITY_PLAN_REQUIREMENTS.md](./PHASE_8A_GOALS_AND_ACTIVITY_PLAN_REQUIREMENTS.md) — accepted rewrite Goal Plan shape and provisional legacy-derived template registry
- [PHASE_8B0_GOALS_AND_ACTIVITY_PLAN_WORKING_PROTOTYPE.md](./PHASE_8B0_GOALS_AND_ACTIVITY_PLAN_WORKING_PROTOTYPE.md) — executable Goal Plan prototype behavior
- [PHASE_9A_APPOINTMENT_AND_FOLLOWUP_REQUIREMENTS.md](./PHASE_9A_APPOINTMENT_AND_FOLLOWUP_REQUIREMENTS.md) — accepted Follow-up prototype contract and legacy-only observations
- [PHASE_9B0_APPOINTMENT_WORKING_PROTOTYPE.md](./PHASE_9B0_APPOINTMENT_WORKING_PROTOTYPE.md) — Appointment lifecycle and policy
- [PHASE_9C0_FOLLOWUP_PROGRESS_WORKING_PROTOTYPE.md](./PHASE_9C0_FOLLOWUP_PROGRESS_WORKING_PROTOTYPE.md) — current normalized Follow-up/progress contract
- [DEMI_ARCHITECTURE_BASELINE.md](../architecture/DEMI_ARCHITECTURE_BASELINE.md) — server-side authorization, application boundary, transactions and unresolved-requirement rule
- [ADR-0002](../adr/0002-role-capability-scope-authorization.md), [ADR-0005](../adr/0005-server-side-application-boundary.md), [ADR-0006](../adr/0006-transactional-business-operations.md) — accepted role/capability/scope, service boundary and atomic persistence decisions

### Customer evidence

- `docs/Dashboard App Demi.xlsx`, read-only with `openpyxl`
  - `Dashboard ภาพรวม`: `A1:AQ29`
  - `รายงานการจัดบริการ`: `A1:BM37`
  - The workbook is a formatted blank template. It contains no sample records, formulas or data-validation rules. Its labels and notes are customer evidence, not a database schema or an accepted calculation contract.

Important workbook evidence includes:

- Service 1: `รู้จักตัวเอง`
- Service 2: `ทำแผนสุขภาพ เป้าหมายเล็กๆที่ตั้งไว้`
- food concepts: `การลดมื้ออาหาร`, `การเปลี่ยนอาหาร`, `จำนวนมื้อ/สัปดาห์`
- exercise concepts: `มีการตั้งเป้า`, `จำนวนวัน/สัปดาห์`, `รวมเวลา/สัปดาห์`
- repeated follow-up concepts: date, achieved count, achievement rate, result, plan adjustment and obstacle presence
- measurements: DTX and body weight in visible rounds; the dashboard also contains waist and blood-pressure columns in Before/After
- the notes describe `Achieve score` as a ratio, but do not establish numerator, denominator, period, missing-data behavior, zero-target behavior, aggregation or rounding
- the visible report shows six follow-up groups, while the same workbook says follow-up may be recorded as many times and expects approximately 2–4 rounds per program

### Current rewrite and verification targets

Inspected:

- `prisma/schema.prisma`
- `src/modules/goals/**`
- `src/modules/followups/**`
- `src/modules/appointments/**`
- `src/modules/patient-program/**`
- `src/modules/patient-baseline/**`
- `src/modules/patient-evidence/**`
- related transport/server actions, UI/query services and policy modules
- integration tests for Goals, Follow-ups, Patient Program, Baseline and Evidence

The repository HEAD is the supplied baseline commit `98434b7` (`fix(phase-15b3): clarify uncertain evidence association outcome`). No application or schema change was made for this phase.

### Legacy behavioral reference

The local pinned checkout corresponding to `raviut-max/demi-plus-web-v2` was inspected read-only at commit:

```text
7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e
```

Legacy behavior is used only to explain historical UI/data shapes. It is not promoted to a current requirement. In particular, legacy status values, client-supplied actor/date fields, same-day replacement behavior and percentage logic are non-authoritative.

## 3. Current executable Goal Plan contract

### 3.1 Actual persistence shape

`PatientGoalPlan` currently has these relevant properties:

| Area | Current executable behavior | Evidence strength |
| --- | --- | --- |
| Parent scope | `patientHospitalRelationshipId`; no `patientProgramId` | `CURRENT_IMPLEMENTATION` |
| Identity/provenance | creator, template key/version, optional source Screening, unique submission nonce, created timestamp | `CURRENT_IMPLEMENTATION` |
| Rounds | immutable relationship-scoped `roundNumber`; database unique `(patientHospitalRelationshipId, roundNumber)` | `CURRENT_IMPLEMENTATION` |
| Items | one or more `PatientGoalItem` rows, maximum 20 through schema/service validation, unique activity code per plan, stable `sortOrder` | `CURRENT_IMPLEMENTATION` |
| Targets | `targetDays` required; `targetValue` and `targetUnit` optional; activity/template rules validate known target constraints | `CURRENT_IMPLEMENTATION` |
| Categories | activity/template registry has `FOOD`, `EXERCISE`, `MEASUREMENT`, `REST`; this is not a customer nutrition ontology | `CURRENT_IMPLEMENTATION` / `ENGINEERING_RECOMMENDATION` |
| Screening | optional source Screening association; no automatic Screening-to-plan creation | `CURRENT_IMPLEMENTATION` |
| Follow-up link | Follow-up may optionally reference this plan through `sourceGoalPlanId`; the Goal Plan service does not create or mutate Follow-up rows | `CURRENT_IMPLEMENTATION` |
| Active/archive | no active flag, archive lifecycle or in-place current-plan mutation; each accepted submission is another immutable round | `CURRENT_IMPLEMENTATION` |
| Correction | no edit/archive/delete/amendment operation in the rewrite; same nonce and same payload is idempotent, changed payload conflicts | `CURRENT_IMPLEMENTATION` |
| Write boundary | strict transport schema → application service → Goal policy → Prisma transaction → audit; serializable/retry protects round allocation | `ACCEPTED_REQUIREMENT` / `CURRENT_IMPLEMENTATION` |
| Read boundary | exact relationship scope, newest/history queries, preserved template key/version and optional Screening context; history is bounded to the current query limit | `CURRENT_IMPLEMENTATION` |

The current template registry includes provisional activity codes such as `reduce_rice`, `protein_vegetable`, `exercise_walk` and `water_intake`. Their target rules are rewrite implementation data derived partly from the Phase 8 prototype; they do not prove that the workbook's food or exercise wording has the same business meaning.

### 3.2 Current authorization

Goal read/record access uses server-resolved `Role + capability + exact scope`:

- `HOSPITAL`: direct active membership in the exact active Hospital and the exact `PatientHospitalRelationship`; OWNER/MEMBER behavior follows the current Goal policy
- `OSM`: active OSM–Hospital relationship plus the exact active Patient assignment
- `ADMIN` alone: denied as a routine care workflow actor
- `PATIENT`: denied for Goal Plan creation/read under the current Goal policy
- profession labels do not create additional permission in this phase

The client cannot provide a trusted owner, role, Hospital or Patient scope. The service re-resolves the actor and target from the server-side database.

### 3.3 Actual limitation for Service 2

The model is a sound reusable Goal Plan foundation, but it is relationship-owned rather than Program-owned. A query for the latest relationship plan has no Program predicate. Reusing it for Service 2 without explicit Program linkage would make Program A and Program B indistinguishable when both use the same Patient/Hospital relationship.

## 4. Current executable Follow-up contract

### 4.1 Actual persistence shape

`PatientFollowup` currently supports:

| Concept | Current executable behavior |
| --- | --- |
| Parent scope | `patientHospitalRelationshipId`; no `patientProgramId` |
| Round | integer `roundNumber`, unique with relationship; next round allocated in a serializable transaction and protected by the database unique constraint |
| Date/provenance | server `recordedAt`, creator user, unique `submissionNonce`, request hash and created timestamp |
| Appointment | optional `appointmentId`; when present it must resolve to the exact relationship and `COMPLETED` Appointment; Follow-up does not complete or mutate the Appointment |
| Goal source | optional `sourceGoalPlanId`; it must resolve to a historical Goal Plan in the exact relationship |
| Progress | normalized `PatientFollowupActivityProgress` child rows, one row per selected activity code, unique per Follow-up/activity, with `DONE`, `PARTIAL`, `NOT_DONE` or `NOT_APPLICABLE` and optional note |
| Measurements | optional weight, waist circumference, systolic/diastolic blood pressure and blood sugar/DTX-shaped field |
| Confidence/notes | optional confidence score 0–10, reflection note, confidence plan and general note |
| Responsible actor | Follow-up stores the creating actor for provenance; an optional Appointment may have its own responsible user, but this is not a Follow-up care-team assignment (`CURRENT_IMPLEMENTATION`) |
| Calculations | no official achievement count, achievement rate, `>70%` result or clinical calculation |
| Outcome | no customer outcome enum or controlled vocabulary |
| Plan adjustment | no plan-adjusted field and no automatic new Goal Plan |
| Obstacle | no boolean/detail field; notes can hold narrative but blank is not authoritative `ไม่มีอุปสรรค` |
| Correction | immutable; no edit/delete/correction/amendment operation |

When a Goal Plan is selected, the service validates progress activity codes against that historical plan. When no plan is selected, a standalone Follow-up remains valid under the current prototype contract. This optionality is current behavior and must not be silently changed into a required Appointment or required Goal Plan.

### 4.2 Current Follow-up authorization

The current Follow-up policy grants `followup:read` and `followup:record` to:

- HOSPITAL actors with direct active membership and exact Patient/Hospital relationship scope
- OSM actors with an active OSM–Hospital relationship and exact active Patient assignment

`ADMIN`-only and `PATIENT` actors are denied. The policy re-reads current actor status, active Hospital state and current OSM assignment. A Follow-up creator is stored for attribution, not as a permanent authorization grant.

### 4.3 Actual lifecycle and idempotency

The Follow-up service normalizes input, hashes the request, returns the existing record for the same actor/scope/payload nonce, rejects a changed payload under the same nonce, allocates the next round inside a serializable transaction, creates the Follow-up/progress/audit atomically and retries known serialization/unique conflicts within the configured limit. It does not create a fixed number of rounds.

## 5. Service 2 customer-workbook mapping

The workbook describes Service 2 concepts, but does not define a new persistence schema. The safest mapping is to reuse the existing Goal Plan/Item structure where the concept is merely a goal label plus a target. A structured code or weekly aggregate is not assumed from the label alone.

| Workbook concept | Current rewrite mapping | Classification | Source strength | Safe interpretation for 15C |
| --- | --- | --- | --- | --- |
| ลดปริมาณอาหาร / food quantity reduction | Generic `PatientGoalItem` and an activity target can express a human-readable goal; current activity codes are not an exact quantity ontology | `REUSE_WITH_MAPPING` | `CUSTOMER_WORKBOOK` + `CURRENT_IMPLEMENTATION` | Reuse the Goal Item shape only after confirming the human target wording. Do not invent quantity units or a coded nutrition model. |
| เปลี่ยนชนิดอาหาร / food type/change | Generic food activity plus target/note can carry a provisional instruction; no structured food-type codes exist | `REUSE_WITH_MAPPING` | `CUSTOMER_WORKBOOK` + `CURRENT_IMPLEMENTATION` | Use existing activity/template vocabulary where an exact mapping exists; otherwise keep narrative and mark the canonical code open. |
| จำนวนมื้อ/สัปดาห์ / meals per week | `targetDays`, `targetValue`, and `targetUnit` exist as generic fields, but no accepted `meals/week` rule or unit contract exists | `DECISION_REQUIRED` | `CUSTOMER_WORKBOOK` + `CURRENT_IMPLEMENTATION` | Do not treat a numeric field as meals/week until target owner, period and unit are confirmed. |
| exercise goal presence | Goal Item and the existing exercise category can represent a goal item | `REUSE_WITH_MAPPING` | `CUSTOMER_WORKBOOK` + `CURRENT_IMPLEMENTATION` | Preserve goal presence through existence of a Goal Item; do not add a separate Service 2 table. |
| exercise days/week | `targetDays` is an existing integer 1–7 field | `REUSE_WITH_MAPPING` | `CURRENT_IMPLEMENTATION` | Candidate reuse, but confirm whether it means days per week for one activity or a whole exercise plan. |
| total exercise time/week | `targetValue`/`targetUnit` can represent some activity target rules, but current rules do not establish a weekly aggregate | `DECISION_REQUIRED` | `CUSTOMER_WORKBOOK` + `CURRENT_IMPLEMENTATION` | No weekly-total formula or unit conversion. Add a narrow field only if the customer confirms this is a distinct target semantic. |
| Goal Plan history/version | immutable relationship-scoped rounds with template key/version | `EXACT_REUSE` | `CURRENT_IMPLEMENTATION` + `PHASE_8` | Keep immutable plan history; Program linkage is the required extension, not a duplicate plan model. |
| optional Screening context | `sourceScreeningAssessmentId` already exists and is optional | `EXACT_REUSE` | `CURRENT_IMPLEMENTATION` | Keep optional and exact-relationship validated; do not make Screening automatically create a plan. |
| Service 2 ownership by Program | no Program link in the current model | `NARROW_EXTENSION_REQUIRED` | `ACCEPTED_REQUIREMENT` + `CURRENT_IMPLEMENTATION` | Add explicit Program linkage for new Program workflow records as specified in section 7. |

## 6. Follow-up customer-workbook mapping

The workbook's “Service 3–6” columns are a report-shaped view. The rewrite's domain shape remains a repeated normalized Follow-up record.

| Workbook concept | Current rewrite | Classification | Decision impact | Recommended action |
| --- | --- | --- | --- | --- |
| Follow-up date | server `recordedAt`; optional Appointment `scheduledAt`/completion context | `IMPLEMENTED_BUT_SEMANTICS_OPEN` | Occurrence date versus record-created date is not fixed | Keep server attribution. If backdated occurrence is needed, define it separately; do not repurpose Appointment date. |
| Follow-up round | normalized `roundNumber`, currently relationship-scoped | `IMPLEMENTED_BUT_SEMANTICS_OPEN` | Must become Program-scoped for new Program records | Keep `0..N`; add Program-scoped uniqueness for linked records and preserve legacy history explicitly. |
| achieved days/count | no current field in Follow-up or progress | `EXTENSION_REQUIRED` | Owner, activity/round scope and period are unknown; blocks the specific field only | Capture only after the customer defines whether it is per activity or whole round. A future raw `achievedCount` may be stored independently from any rate. |
| achievement rate / Achieve score | no current field or calculation | `CALCULATION_CONTRACT_REQUIRED` | Blocks official calculation and final reporting | Do not reuse legacy percentage or workbook note as executable formula. |
| `>70%` count | no current field or aggregation | `CALCULATION_CONTRACT_REQUIRED` | `BLOCKS_FINAL_REPORTING` | Defer until rate, activities, rounds, threshold (`>` versus `>=`) and N/A behavior are defined. |
| outcome/result phrase | current free-text notes only; no official outcome field | `CONTROLLED_VOCABULARY_REQUIRED` | Blocks an official result field/report dimension | Use existing narrative notes only as provisional context; do not add legacy statuses or a new enum. |
| plan adjusted | no current boolean, note, version event or replacement relation | `EXTENSION_REQUIRED` | Blocks the specific plan-adjustment field | Do not automatically edit/replace a plan. Preserve immutable plans and wait for the meaning of “ปรับ”. |
| obstacle presence/details | narrative notes can hold facts; no `hasObstacle`/details pair | `EXTENSION_REQUIRED` | Scope (Follow-up, item or plan) is open | Do not interpret empty notes as `false`. A narrow Follow-up-level boolean/detail pair is a future option only after confirmation. |
| DTX | current `bloodSugar` field in Follow-up and baseline-shaped DTX support | `IMPLEMENTED_BUT_SEMANTICS_OPEN` | Timing, unit and clinical meaning remain open | Reuse factual measurement storage; do not add DTX-derived clinical logic. |
| body weight | current `weight` field | `IMPLEMENTED_BUT_SEMANTICS_OPEN` | Observation timing/unit/context remain open | Reuse the field; do not derive BMI or other clinical metrics. |
| waist | current `waistCircumference` field | `IMPLEMENTED_BUT_SEMANTICS_OPEN` | Workbook placement and unit/context need confirmation | Preserve existing field, outside the new official reporting contract. |
| blood pressure | current systolic/diastolic fields | `IMPLEMENTED_BUT_SEMANTICS_OPEN` | Unit/timing/context remain open | Preserve existing fields; no risk score or clinical interpretation. |
| confidence | current 0–10 confidence score and plan | `IMPLEMENTED_BUT_SEMANTICS_OPEN` | Customer report use is not confirmed | Reuse current field as captured observation only. |
| optional Appointment | current optional completed Appointment link | `IMPLEMENTED_BUT_SEMANTICS_OPEN` | Requiredness is not established | Keep optional; separate operational scheduling from care/progress recording. |
| six visible rounds | report projection only | `REPORT_PROJECTION_ONLY` | Exact export/report contract remains open | Do not create fixed six columns/tables in persistence. |

## 7. Program linkage analysis

### 7.1 Current ownership map

| Entity | Current owner/scope | Program linkage today | Consequence |
| --- | --- | --- | --- |
| `PatientProgram` | exact `PatientHospitalRelationship` episode | root episode; Service 1 links directly | Program lifecycle is explicit |
| `PatientProgramServiceOne*` | `PatientProgram` | direct, one-time records | Service 1 is isolated per episode |
| `PatientGoalPlan` | exact relationship | none | plans from different episodes share one round namespace |
| `PatientGoalItem` | parent Goal Plan | inherited only | no separate linkage needed if parent is linked |
| `PatientFollowup` | exact relationship | none | Follow-up history is not episode-isolated |
| `PatientFollowupActivityProgress` | parent Follow-up | inherited only | no separate Program FK needed |
| `PatientAppointment` | exact relationship | none | operational schedule is not an episode identity |
| `PatientBaseline` | one per relationship; optional initial link from Program | not a per-Program baseline | later Programs must not silently reuse the historical initial baseline |
| `PatientEvidenceArtifact` | exact relationship; Service 1 association is Program-scoped | narrow association only | no generic evidence attachment should be introduced |

### 7.2 Required isolation invariant

The intended future invariant is:

```text
Goal Plan belongs to one Program
Follow-up belongs to one Program
Follow-up source Goal Plan, when present, belongs to the same Program
Follow-up round is unique within that Program
Goal Items and Progress belong through their parent
```

The current schema cannot enforce this because Goal Plan and Follow-up have no Program FK. The current service checks exact relationship scope for optional Appointment and Goal Plan, but that is not enough to distinguish Program A from Program B inside the same relationship.

Therefore the answer to the required question is:

> **No. The current Goal Plan and Follow-up model cannot safely represent multiple Patient Programs without additional Program linkage.**

### 7.3 Smallest safe linkage recommendation

This is a future implementation recommendation, not a Phase 15C.0 schema change:

1. Add nullable `patientProgramId` storage to `PatientGoalPlan` and `PatientFollowup`.
2. Require a valid `patientProgramId` at the application boundary for all new Service 2 and behavioral Follow-up records created in the Program workflow.
3. Derive the relationship from the server-loaded Program. Do not trust a client-supplied relationship or Hospital as the authority.
4. Keep `PatientGoalItem` and `PatientFollowupActivityProgress` as children; do not duplicate Program IDs there.
5. When `sourceGoalPlanId` is supplied to a Follow-up, require the source plan's Program and relationship to match the Follow-up's Program and relationship. Prefer a composite database invariant in addition to the service check.
6. Keep Appointment linkage optional and relationship-validated. Do not add a Program FK to Appointment until the customer explicitly says scheduling is episode-owned; an Appointment is operational scheduling, not automatically a care-progress record.

The nullable storage is deliberate. Existing relationship-level records cannot be safely assigned to Program A or B from the inspected evidence. A migration that guesses a Program owner would create false historical provenance. Existing rows should therefore remain readable as explicit **pre-Program relationship history** and must not be silently included in a current Program's progress.

### 7.4 Future database and query invariants

The future migration/design review must cover:

- composite ownership from `(patientProgramId, patientHospitalRelationshipId)` to the Program's corresponding composite identity;
- a same-Program constraint for Follow-up → source Goal Plan;
- Program-scoped unique `(patientProgramId, roundNumber)` for new linked records;
- preservation of relationship-scoped uniqueness for nullable pre-Program records, likely through separate PostgreSQL partial unique indexes or an equivalent explicitly reviewed strategy;
- queries for a Program detail that filter by the Program ID and never use relationship-level “latest” as current progress;
- `ON DELETE RESTRICT`/no destructive deletion semantics consistent with current Program, Goal Plan and Follow-up behavior;
- writes allowed only while the Program is `ACTIVE`; completed Programs remain readable and reject new workflow writes;
- no backfill until a separately accepted historical mapping exists.

The existing `PatientProgram` composite uniqueness is a useful foundation for exact cross-scope constraints, but it does not currently make Goal Plan or Follow-up Program-owned.

### 7.5 Program A / Program B behavior

The target behavior is:

```text
Program A
    Goal Plan A
        Follow-up A1
        Follow-up A2

Program B
    Goal Plan B
        Follow-up B1

Pre-Program relationship history
    remains readable
    is not silently inherited by A or B
```

Completion of Program A does not make its Goal Plan or Follow-up the current plan for Program B. Program B must start with its own explicit Program-linked workflow records.

## 8. Required data-gap matrix

“Legacy” below means behavioral evidence only. “Current Rewrite” describes executable code/schema, not an intended future contract.

| Concept | Workbook | Current Rewrite | Legacy | Classification | Source strength | Recommended 15C action |
| --- | --- | --- | --- | --- | --- | --- |
| Food quantity goal | yes: ลดปริมาณอาหาร | Generic food Goal Item/target shape; no confirmed quantity unit | Coarse food amount statuses | `REUSE_WITH_MAPPING` | `CUSTOMER_WORKBOOK` + `CURRENT_IMPLEMENTATION` | Reuse Goal Item with human target after mapping; do not import legacy status or invent units. |
| Food type goal | yes: เปลี่ยนชนิดอาหาร | Generic activity/note; no food ontology | Coarse food type statuses | `REUSE_WITH_MAPPING` | `CUSTOMER_WORKBOOK` + `CURRENT_IMPLEMENTATION` | Keep existing template vocabulary where exact; defer structured food codes. |
| Exercise goal | yes | Existing exercise activity category/items | Movement status fields | `REUSE_WITH_MAPPING` | `CUSTOMER_WORKBOOK` + `CURRENT_IMPLEMENTATION` | Reuse Goal Item; confirm whether the goal is activity-level or plan-level. |
| Target days | yes: days/week | `targetDays` 1–7 | Legacy target days and helper defaults differ | `REUSE_WITH_MAPPING` | `CURRENT_IMPLEMENTATION` + `LEGACY_ONLY` | Reuse field; do not treat legacy defaults as customer semantics. |
| Target value/unit | yes: total time/frequency concepts | optional generic `targetValue`/`targetUnit`, activity rules only | Activity-specific numeric defaults | `DECISION_REQUIRED` | `CUSTOMER_WORKBOOK` + `CURRENT_IMPLEMENTATION` + `LEGACY_ONLY` | Confirm period and unit before using for meals/week or total minutes/week. |
| Service 2 Program owner | implied by journey | not present | relationship/user-oriented flow | `NARROW_EXTENSION_REQUIRED` | `ACCEPTED_REQUIREMENT` + `CURRENT_IMPLEMENTATION` | Add direct nullable storage linkage; require it for new Program workflow records. |
| Follow-up round | yes, visible 3–6 | normalized relationship+round, no Program | fixed UI/report shapes and global count | `IMPLEMENTED_BUT_SEMANTICS_OPEN` | `CURRENT_IMPLEMENTATION` + `CUSTOMER_WORKBOOK` + `LEGACY_ONLY` | Keep normalized `0..N`; change new workflow namespace to Program scope. |
| Follow-up date | yes | server `recordedAt`, optional Appointment | client date/appointment behavior | `IMPLEMENTED_BUT_SEMANTICS_OPEN` | `CURRENT_IMPLEMENTATION` + `LEGACY_ONLY` | Preserve server attribution; define occurrence date separately if needed. |
| Achieved days/count | yes | absent from Follow-up/progress | legacy count/derived behavior is not reliable | `EXTENSION_REQUIRED` | `CUSTOMER_WORKBOOK` + `LEGACY_ONLY` | Resolve owner, period and raw observation first; possible narrow raw count later. |
| Achievement rate | yes | absent | legacy percentage is unreliable | `CALCULATION_CONTRACT_REQUIRED` | `CUSTOMER_WORKBOOK` + `LEGACY_ONLY` | `BLOCKS_CALCULATION`; no official rate in 15C.1. |
| `>70%` count | yes | absent | no authoritative formula | `CALCULATION_CONTRACT_REQUIRED` | `CUSTOMER_WORKBOOK` + `LEGACY_ONLY` | `BLOCKS_FINAL_REPORTING`; defer. |
| Outcome/result | yes: phrase/dropdown concept | free-text notes only, no enum | legacy statuses are non-authoritative | `CONTROLLED_VOCABULARY_REQUIRED` | `CUSTOMER_WORKBOOK` + `LEGACY_ONLY` | No new enum; use narrative only as provisional context. |
| Plan adjusted | yes: ปรับ/ไม่ปรับ | absent; plans immutable | partial status/flow evidence | `EXTENSION_REQUIRED` | `CUSTOMER_WORKBOOK` + `CURRENT_IMPLEMENTATION` + `LEGACY_ONLY` | Do not auto-edit or replace a plan; define meaning first. |
| Obstacle | yes: มี/ไม่มี and detail concept | notes only | obstacle notes | `EXTENSION_REQUIRED` | `CUSTOMER_WORKBOOK` + `CURRENT_IMPLEMENTATION` + `LEGACY_ONLY` | Do not map blank to false; defer owner and boolean/detail semantics. |
| DTX | yes | `bloodSugar`/DTX-shaped field exists | legacy DTX | `IMPLEMENTED_BUT_SEMANTICS_OPEN` | `CURRENT_IMPLEMENTATION` + `CUSTOMER_WORKBOOK` + `LEGACY_ONLY` | Reuse factual field; no clinical formula. |
| Weight | yes | `weight` exists | legacy weight | `IMPLEMENTED_BUT_SEMANTICS_OPEN` | `CURRENT_IMPLEMENTATION` + `CUSTOMER_WORKBOOK` + `LEGACY_ONLY` | Reuse factual field; no BMI. |
| Waist/BP | dashboard includes fields | current waist and systolic/diastolic fields | legacy measurements | `IMPLEMENTED_BUT_SEMANTICS_OPEN` | `CURRENT_IMPLEMENTATION` + `CUSTOMER_WORKBOOK` + `LEGACY_ONLY` | Preserve current fields; no risk calculation. |
| Confidence | current Follow-up field | score 0–10 and plan exist | legacy confidence | `IMPLEMENTED_BUT_SEMANTICS_OPEN` | `CURRENT_IMPLEMENTATION` + `LEGACY_ONLY` | Keep as captured observation. |
| Appointment linkage | date/context is visible, requiredness not proved | optional completed Appointment link | appointment and standalone entry both existed | `IMPLEMENTED_BUT_SEMANTICS_OPEN` | `CURRENT_IMPLEMENTATION` + `CUSTOMER_WORKBOOK` + `LEGACY_ONLY` | Keep optional; do not conflate schedule with Follow-up. |
| Six visible follow-up rounds | yes in report layout | no fixed storage | fixed/report-shaped behavior | `REPORT_PROJECTION_ONLY` | `CUSTOMER_WORKBOOK` + `LEGACY_ONLY` | Keep report projection outside persistence phase. |
| Official clinical metrics | no accepted formula for new phase | no HbA1c/BMI/CVD logic in Follow-up | legacy/labels only | `NOT_SUPPORTED_BY_SOURCE` | `OPEN_REQUIREMENT` + `LEGACY_ONLY` | Do not add HbA1c, BMI, CVD risk or DM/Pre-DM semantics. |

### 8.1 Calculation gate: raw observation versus official metric

The current rewrite can safely capture factual observations without claiming that they are an official achievement metric. However, `PatientFollowupActivityProgress` cannot safely receive an `achievedCount` field until the count's owner and period are explicit. The row is the correct structural location **only if** one count means one selected Goal Item/activity for one defined measurement period. If the workbook count is instead one whole-round count, it belongs to a different explicitly defined scope. This is a `BLOCKS_SPECIFIC_FIELD` decision, not a reason to block all Follow-up persistence.

Before calculating an official achievement rate, the contract must define all of the following:

- numerator: what exactly counts as achieved;
- denominator: target days, target occurrences, sessions, or another quantity;
- measurement period and target period;
- per activity versus whole Goal Plan aggregation;
- missing observations and partial completion;
- zero target/zero denominator behavior;
- `NOT_APPLICABLE` behavior;
- multiple goals and duplicate activities;
- rounding precision, display precision and whether the stored result is authoritative.

Before calculating the workbook's “count over 70%”, the contract must additionally define which rate is used, which activities and rounds are included, whether the comparison is strict `>70` or `>=70`, whether `NOT_APPLICABLE` rounds count, and whether the result aggregates goals, Follow-ups or Programs. Until those decisions are accepted, the rate and `>70%` count remain out of 15C persistence and reporting.

## 9. Authorization analysis

The Program, Goal Plan, Follow-up and Evidence policies currently use the same accepted direct-scope model. Appointment has a deliberate capability difference for OSM.

| Actor | Program / Goal / Follow-up / Evidence | Appointment | 15C.1 rule |
| --- | --- | --- | --- |
| HOSPITAL | `Role.HOSPITAL` + direct active membership + exact active Hospital + exact PatientHospitalRelationship | read/manage under the current Appointment policy | Preserve exact scope; server derives relationship from Program. |
| OSM | `Role.OSM` + active OSM–Hospital relationship + exact active Patient assignment | read is allowed; manage is not allowed under current Appointment policy | Preserve current difference; Follow-up recording does not imply Appointment management. |
| ADMIN-only | not an automatic care workflow actor | denied under the current operational boundary | Do not grant Service 2/Follow-up self-authority. |
| PATIENT | no Service 2/Follow-up self-service in accepted current contract | denied | Do not add self-service in 15C.1. |

Multi-role behavior remains server policy behavior: a user with a valid HOSPITAL or OSM scope may be authorized through that valid path; `ADMIN` alone is not a bypass.

### Program policy versus Goal/Follow-up policy

The role and exact relationship boundary is aligned. The mismatch is episode scope and lifecycle:

- Program policy resolves an exact Program, its relationship, Hospital status and ACTIVE/COMPLETED lifecycle.
- Goal/Follow-up policies resolve only the relationship and current actor assignment.
- 15C.1 should extend the existing service/policy context with Program ownership checks rather than create a new authorization vocabulary.
- A client-provided `patientProgramId` is an identifier to resolve, not proof of authority.
- If Program lookup is ambiguous, stale or cross-relationship, the operation must fail closed.

### Historical authorization

If OSM A recorded a Follow-up and is later unassigned, the current query/policy path authorizes based on the actor's **current** valid assignment. The creator field remains attribution and does not grant permanent Patient access. This is the safe current architectural distinction:

```text
recordedBy = historical provenance
current policy scope = present authorization
```

There is no accepted requirement for creator-retained historical access. Do not add it in 15C.1. A customer request for that behavior would need a separate capability and audit decision.

## 10. Lifecycle and concurrency analysis

### Goal Plan

- A plan is immutable history, not a mutable “current row”.
- A new plan is a new round; no destructive replacement or archive behavior is currently implemented.
- Plan and items plus audit are created atomically.
- `submissionNonce`, request validation, serializable transaction and unique round constraint provide idempotency/concurrency protection.
- A future Program-linked create must require `Program.status = ACTIVE` and exact Program/relationship scope.

### Follow-up

- A Follow-up is an immutable normalized round.
- It may contain zero or more progress rows, subject to current schema/service validation.
- Optional completed Appointment and optional historical Goal Plan are validated in the exact relationship.
- Follow-up, progress and audit are written atomically.
- A future Program-linked create must require `Program.status = ACTIVE`; completed Program history remains readable but rejects new writes.

### Round allocation race

The current implementation already handles two users creating the next relationship round concurrently with serializable transactions, a database unique guard and bounded retry. For Program workflow records, the same pattern must be retained with the Program-scoped namespace:

```text
read current Program round
→ allocate next number inside transaction
→ rely on DB unique guard
→ retry only a known serialization/unique conflict
```

The future migration must not leave the old relationship unique constraint in a shape that prevents round 1 in both Program A and Program B, nor remove the old guard in a way that allows duplicate pre-Program rounds. This is why the nullable historical strategy needs separate reviewed uniqueness behavior.

### Appointment relationship

Appointment remains operational scheduling. It can be linked to a Follow-up when it is an exact-relationship, completed Appointment, but the Follow-up write does not complete or update it. Making every Follow-up require an Appointment would change current behavior without source evidence.

### Program completion

Phase 15B currently permits Program completion without an invented Service 1 completion gate. Phase 15C must preserve that behavior:

- no required Goal Plan before completion;
- no minimum number of Follow-ups;
- no achieved-target requirement;
- no `>70%` requirement;
- no obstacle-free requirement;
- no automatic Service 2/Follow-up completion transition.

## 11. Decision register

Classification values use the Phase 15C.0 contract:

```text
BLOCKS_15C1_DOMAIN
BLOCKS_SPECIFIC_FIELD
BLOCKS_CALCULATION
BLOCKS_FINAL_REPORTING
CAN_USE_REVERSIBLE_PROTOTYPE_DEFAULT
CAN_DEFER
```

| ID | Decision/question | Evidence and source strength | Classification | Disposition |
| --- | --- | --- | --- | --- |
| D-15C-01 | Can Goal Plan/Follow-up remain relationship-only? | Schema and queries have no Program link; Program A/B isolation is required | `BLOCKS_15C1_DOMAIN` | No. Add explicit direct linkage for new Program workflow records. |
| D-15C-02 | Should old relationship records be backfilled? | No source maps an old plan/follow-up to a specific Program | `CAN_DEFER` | Do not backfill by guess. Preserve nullable pre-Program history and require a future explicit mapping if needed. |
| D-15C-03 | Must Follow-up and source Goal Plan share one Program? | Required by episode isolation; current service checks relationship only | `BLOCKS_15C1_DOMAIN` | Yes for new linked records; enforce in service and preferably composite DB constraints. |
| D-15C-04 | What is the new round uniqueness scope? | Current relationship scope conflicts with multi-Program isolation | `BLOCKS_15C1_DOMAIN` | Program + round for linked records; preserve an explicit guard for nullable legacy rows. |
| D-15C-05 | Does food quantity mean a coded quantity, meals/week or a narrative goal? | Workbook label only; generic target fields exist but no unit contract | `BLOCKS_SPECIFIC_FIELD` | Reuse generic Goal Item provisionally; do not introduce unit/ontology. |
| D-15C-06 | Does food type require structured food codes? | Workbook phrase; no accepted ontology; legacy statuses are non-authoritative | `BLOCKS_SPECIFIC_FIELD` | No new codes in 15C.1; narrative/mapped template only. |
| D-15C-07 | Do exercise days/value mean per activity, per session or per week? | `targetDays` and `targetValue/unit` exist; period semantics are open | `BLOCKS_SPECIFIC_FIELD` | Do not derive weekly totals or convert units. |
| D-15C-08 | Where does achieved count live and what does it count? | Workbook has count; current progress has status/note only | `BLOCKS_SPECIFIC_FIELD` | Resolve per-activity versus whole-round owner and measurement period before adding a field. |
| D-15C-09 | What is the official achievement-rate formula? | Workbook note is incomplete; no accepted rewrite formula; legacy formula unreliable | `BLOCKS_CALCULATION` | Capture factual data separately if defined later; no official rate now. |
| D-15C-10 | What does `>70%` count? | No rate, activity aggregation, round/N/A/threshold contract | `BLOCKS_FINAL_REPORTING` | Defer to reporting contract. |
| D-15C-11 | What is the outcome vocabulary? | Workbook mentions phrase/dropdown; rewrite has no enum; legacy values non-authoritative | `BLOCKS_SPECIFIC_FIELD` | Keep narrative only as provisional; do not add enum. |
| D-15C-12 | What does “plan adjusted” mean? | Workbook says ปรับ/ไม่ปรับ; immutable plans have no adjustment event | `BLOCKS_SPECIFIC_FIELD` | Do not auto-edit, replace or version from a Follow-up. |
| D-15C-13 | Is obstacle presence per Follow-up, item or plan? | Workbook shows presence; current model has notes only | `BLOCKS_SPECIFIC_FIELD` | Do not infer false from blank; consider a narrow field only after confirmation. |
| D-15C-14 | Are DTX/weight/waist/BP official clinical metrics here? | Current factual fields exist; formulas/clinical semantics are not accepted | `CAN_USE_REVERSIBLE_PROTOTYPE_DEFAULT` | Reuse as factual observations; no HbA1c, BMI, CVD or DM/Pre-DM logic. |
| D-15C-15 | Is Appointment mandatory for Follow-up? | Current Follow-up allows standalone and optional completed Appointment; workbook does not prove requiredness | `CAN_DEFER` | Keep optional and separate operational scheduling from care record. |
| D-15C-16 | Does a creator retain access after OSM reassignment? | Current policy resolves current assignment; no accepted creator exception | `CAN_DEFER` | Preserve current-scope authorization; creator is attribution only. |
| D-15C-17 | Are corrections/amendments required? | Current Goal Plan/Follow-up are immutable and have no amendment framework | `CAN_DEFER` | Preserve current immutable behavior; do not add generic correction system. |
| D-15C-18 | Should Service 2/Follow-up gate Program completion? | Phase 15B explicitly has no such gate | `CAN_USE_REVERSIBLE_PROTOTYPE_DEFAULT` | Keep no gate until accepted requirement says otherwise. |
| D-15C-19 | Are six report rounds a persistence limit? | Workbook also says follow-up count is variable and expected 2–4 | `BLOCKS_FINAL_REPORTING` | Treat six as report projection only; persistence remains `0..N`. |
| D-15C-20 | Is this the reporting phase? | Phase 15C scope excludes dashboard/export/aggregation | `CAN_DEFER` | Preserve normalized facts for later reporting; implement no report now. |

## 12. Safe prototype defaults

The following are explicitly labeled provisional engineering defaults, not newly accepted clinical requirements:

- reuse `PatientGoalPlan` and `PatientGoalItem` for Service 2;
- use existing activity/template validation and generic target fields only where an exact mapping is known;
- add no duplicate Service 2 model or generic workflow engine;
- reuse normalized immutable `0..N` Follow-up and `PatientFollowupActivityProgress`;
- use nullable Program linkage for storage compatibility, but require Program linkage for new Program workflow records;
- use Program-scoped reads and rounds for new records; keep pre-Program history separate;
- reuse current DTX/blood sugar, weight, waist, blood-pressure and confidence fields as factual observations;
- keep Appointment linkage optional and require `COMPLETED` when an Appointment is selected;
- retain current server-derived actor identity, exact Hospital/OSM scope and fail-closed policy;
- retain atomic Goal Plan and Follow-up writes, audit, nonce/idempotency and serializable/retry behavior;
- keep Goal Plan/Follow-up correction behavior immutable until an amendment requirement exists;
- leave outcome, plan adjustment, obstacle boolean/detail, official rate and `>70%` absent or narrative-only as appropriate;
- keep Program completion independent of Goal Plan, Follow-up count and target achievement.

For achieved count, the safe default is **do not persist a guessed field in 15C.1**. If the customer confirms that it is a per-activity factual count over a defined period, a nullable raw `achievedCount` on `PatientFollowupActivityProgress` is a narrow future extension. It must remain separate from any calculated rate and must not silently define the denominator.

## 13. Explicitly unsafe assumptions

The following are not approved defaults:

- importing a legacy achievement percentage or treating the workbook note as a complete formula;
- adding a legacy outcome enum such as `excellent`, `good`, `fair`, `needs_improvement` or `monitoring`;
- persisting exactly six Follow-up records/columns/tables;
- implementing a `>70%` metric without a confirmed rate and aggregation contract;
- inferring DM/Pre-DM classification;
- adding official CVD risk, BMI formula, HbA1c semantics or other clinical calculations;
- automatically changing/replacing a Goal Plan when a Follow-up says “ปรับ”;
- automatically completing a Program because it has a Goal Plan, a number of Follow-ups, a target rate or no obstacles;
- enabling Patient Service 2/Follow-up self-service;
- creating a generic workflow engine or generic polymorphic attachment model;
- treating `PatientHospitalRelationship` as a sufficient substitute for Program ownership;
- attaching old relationship-level plans/follow-ups to whichever Program is currently active;
- using blank notes as an authoritative `no obstacle` result;
- making Appointment mandatory because the report has a date column;
- granting historical access to the original recorder after current OSM assignment is removed;
- deriving weekly totals, food units, clinical meaning or report authorization from column labels;
- turning legacy client-provided dates, actors, statuses or mutable edits into rewrite requirements.

## 14. Proposed Phase 15C implementation slices

### Phase 15C.1 — Service 2 Program Linkage & Domain Persistence

Scope:

- additive Program linkage design for Goal Plan and Follow-up;
- migration strategy preserving nullable pre-Program history without guessed backfill;
- Program-aware Goal Plan and Follow-up application inputs and queries;
- same-Program validation for Follow-up → source Goal Plan;
- Program-scoped round uniqueness and concurrency behavior;
- ACTIVE write / COMPLETED read-only lifecycle checks;
- unchanged exact authorization, transaction, audit and idempotency boundaries;
- integration tests for cross-Program isolation, legacy nullable rows, races, nonce behavior and authorization.

Not in this slice: official rate, `>70%`, outcome enum, plan adjustment, obstacle semantics, report projection or new UI behavior.

### Phase 15C.2 — Structured Behavioral Follow-up Data

Scope only after the corresponding customer decisions:

- narrow raw achieved-count capture, with owner and measurement period defined;
- optional obstacle presence/details if scope is confirmed;
- outcome capture only as approved narrative or controlled vocabulary;
- plan-adjustment observation only if its meaning is separated from plan mutation;
- measurement context/unit clarifications that do not add clinical formulas.

This slice must keep raw observations separate from derived rates and must not import legacy statuses or formulas.

### Phase 15C.3 — Service 2 / Follow-up UI Integration

Scope:

- Program-detail entry for Goal Plan and Follow-up using existing services/actions;
- progressive Goal Plan and normalized repeated Follow-up UX;
- exact mapping of approved food/exercise target wording;
- optional Appointment selection without changing Appointment ownership;
- safe display of provisional narrative/observation data;
- no fixed six-round persistence and no report dashboard.

### Phase 15C.4 — Integration Hardening & Program Journey Re-audit

Scope:

- end-to-end Program A/B isolation verification;
- stale actor/assignment and completed-Program checks;
- concurrency, idempotency and cross-scope database checks;
- historical read behavior and immutable correction review;
- Service 1 → Service 2 → Follow-up journey consistency;
- handoff notes for a later reporting phase without implementing reporting.

These boundaries keep domain ownership and data capture separate from UI and later calculation/reporting policy. If the customer confirms a calculation contract before 15C.2, it should still be implemented as a separate, explicitly tested slice rather than hidden in persistence.

## 15. Recommended Phase 15C.1 contract

This is the concrete contract recommended for implementation after this analysis. It is a proposal, not an implementation performed in 15C.0.

### 15.1 Goal Plan create

Input should identify a `patientProgramId` and existing Goal Plan fields. The service must:

1. resolve the Program server-side;
2. derive and verify its exact Patient/Hospital relationship;
3. require an ACTIVE Program and current Goal capability for that exact relationship;
4. validate the existing template, activity membership, target days/value/unit and notes;
5. preserve optional exact-relationship Screening provenance;
6. create the Program-linked Goal Plan, items and audit atomically;
7. allocate a Program-scoped round with the existing nonce/serializable/retry semantics.

The relationship, Hospital and actor are not accepted from the client as authority. A relationship-level legacy create may remain only for explicitly supported pre-Program compatibility paths; it must not be used by the new Program workflow.

### 15.2 Follow-up create

Input should identify a `patientProgramId`, optional `appointmentId`, optional `sourceGoalPlanId`, existing measurements/confidence/notes and existing progress rows. The service must:

1. resolve the Program and exact relationship server-side;
2. require an ACTIVE Program and current Follow-up capability;
3. validate an optional Appointment against the exact relationship and `COMPLETED` status;
4. validate an optional source Goal Plan against the same Program and relationship;
5. validate progress codes against the selected historical Goal Plan when one is selected;
6. create one normalized Follow-up with zero or more progress children and audit atomically;
7. allocate a Program-scoped round with the existing nonce/hash/serializable/retry semantics.

The contract deliberately contains no official achievement count, rate, `>70%` result, outcome enum, plan-adjustment event or obstacle boolean until the decisions in section 11 are resolved. Existing factual measurements, confidence and narrative notes may continue to be captured within their current semantics.

### 15.3 Query/read contract

Program-scoped reads must:

- filter Goal Plans and Follow-ups by the requested Program ID;
- verify the Program belongs to the exact relationship and active Hospital;
- show pre-Program relationship history only as explicitly separate history;
- never use the relationship's latest Goal Plan/Follow-up as implicit current Program progress;
- allow completed Program history reads under the current policy;
- reject new writes after completion;
- retain existing history bounds and fail-closed behavior.

### 15.4 Database contract to carry into migration design

The future schema work should enforce, as far as the database representation allows:

```text
GoalPlan.patientProgramId → PatientProgram
Followup.patientProgramId → PatientProgram
Followup.sourceGoalPlanId → GoalPlan in the same Program
Program + roundNumber is unique for new linked records
pre-Program nullable records retain an explicit legacy uniqueness guard
```

The exact migration SQL, partial-index representation and existing-row strategy must be reviewed in Phase 15C.1. Phase 15C.0 intentionally does not modify `prisma/schema.prisma` or migrations.

## 16. Verification performed

The following checks were performed for this documentation-only phase:

- verified the repository was clean before work with `git status --short` and `git diff --stat`;
- verified HEAD is the supplied `98434b7` baseline;
- inspected all required phase documents listed in section 2;
- inspected the architecture baseline and ADR-0002/0005/0006;
- inspected the current Prisma models, domain schemas, application services, query services, policies, transport actions, UI/query paths and integration tests;
- read the workbook without editing it; confirmed its dimensions, Thai labels, blank-template nature, absence of formulas and absence of data-validation rules;
- inspected the pinned legacy checkout read-only at `7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e` and did not change the checkout;
- ran `git diff --check` after creating this document;
- checked the new file as UTF-8 without BOM and searched its bytes for the replacement character (`U+FFFD`);
- verified after writing that only this intended documentation file is changed/untracked; no application, schema, migration, route, policy, UI or data file was touched;
- did not run application tests, lint, typecheck, build, migration or live Supabase operations because this phase is documentation-only.

## Phase 15C.1 readiness gate

```text
READY_WITH_PROVISIONAL_DEFAULTS
```

15C.1 can proceed as a domain/persistence foundation using the explicit Program-linkage contract above. The unresolved rate, `>70%`, outcome, plan-adjustment and obstacle semantics block only their specific fields/calculations/reporting. Before a migration is authored, the team must accept the nullable historical-record policy and the Program-scoped/legacy round-uniqueness strategy; assigning old relationship records to a Program by guess is not an acceptable shortcut.
