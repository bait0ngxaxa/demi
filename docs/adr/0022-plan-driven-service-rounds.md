# ADR-0022: Plan-driven service rounds

- Status: Accepted — Product Owner decisions FR-D1..FR-D7 and FR-D4a, 2026-10-28
- Partially supersedes: SR-D1 and the "all resolved" rule of SR-D4 in [WB_ALIGNMENT_DECISIONS](../requirements/WB_ALIGNMENT_DECISIONS.md) §R1 (effective when FR-2 ships); the fixed per-round tool CHECKs of SR-D8/SR-D11 (replaced in FR-1).
- Related: [ADR-0006](0006-transactional-business-operations.md), [ADR-0016](0016-network-patient-read.md), [ADR-0021](0021-caregiver-accounts-by-invitation.md)

## Context

Phase R1 made every service round a fixed, required checklist: `ROUND_STEPS` in code listed the steps of rounds 1-6, a round could end only when every step was DONE or SKIPPED, and the database pinned each per-round tool to fixed rounds with CHECKs (ไม้บรรทัดวัดใจ 1,2,3,4,6; ตารางชีวิตของฉัน 1,2,4,5; กราฟวัดลอยจม 1,4; ความฝันของฉัน 3). Rounds were the literal numbers 1-6, and Follow-ups after round 6 were "extra history".

In practice staff adapt each visit to the patient. The Product Owner confirmed on 2026-10-28 that the checklist is a guideline, that a visit may add or drop items, that staff may add service rounds after round 6, and that a registered patient may record part of their own round.

## Decision

### Product decisions

- **FR-D1 — Plan per round.** The per-round checklist becomes a guideline that seeds an editable plan for each opened round. Staff may end a round when at least one plan item is DONE; VITALS is not mandatory. Every plan item still unresolved at that moment is recorded as a skip with the system reason `NOT_DONE_AT_CLOSE` ("ยังไม่ได้ทำเมื่อจบบริการ") in the same transaction. An empty plan can never be ended.
- **FR-D2 — Custom items.** A plan may hold free-text items: a title (≤ 120 characters), a "ทำแล้ว" mark and an optional note (≤ 500 characters).
- **FR-D3 — Round count.** Rounds 1-6 follow the guideline by default; staff may add rounds up to 12. Rounds 7+ open with an empty plan.
- **FR-D4 — Who records.** The assigned อสม. records first; MEMBER staff and the OWNER of the patient's own Hospital are the fallback (today's write access, unchanged). The registered patient may self-record in their own Program under FR-D4a. Plan editing (add/remove), skip/unskip, ending a round and adding a round stay with อสม./MEMBER/OWNER. A caregiver is read-only. A network Parent Hospital stays read-only for its Child facilities (ADR-0016).
- **FR-D4a — Patient self-recording.** Only in the current open round of the patient's own ACTIVE Program, and only VITALS (self-measured), PAM, PROMS, CONFIDENCE_RULER, ROUTINE, FLOATING_CHART, DREAM_CARD, KNOW_SELF, and marking an existing CUSTOM item done. Never plan edits, skips, completion, adding a round, HEALTH_PLAN_REVIEW, a Goal Plan, HEALTHY_PLAN or HEALTH_PATH_REVIEW. Every patient-recorded fact keeps the patient as its recorder, and staff see "ผู้ป่วยบันทึกเอง". Staff and อสม. may re-record or correct it before the round is ended (existing replace semantics).
- **FR-D5 — Follow-ups.** Every Program Follow-up belongs to the current opened, unfinished round (previous round completed), derived by the server. It requires round >= 3, no existing Follow-up in that round, and VITALS or HEALTH_PLAN_REVIEW in its active plan. PatientFollowup.roundNumber = service round minus 2; missing Follow-ups in earlier rounds do not shift that mapping. Relationship-only Follow-ups keep their numbering. Migration 20261126100000 refuses legacy Program Follow-ups numbered >= 5 without an opened corresponding round, reporting the count. There is no real user data in these development/demo databases; synthetic databases are reset rather than fabricating history.
- **FR-D6 — Reports.** Reports keep the columns ครั้งที่ 1-6 and add "ครั้งเพิ่มเติม (จำนวน)"; details stay in the per-patient view.
- **FR-D7 — Removing guideline items.** A guideline item may be removed from a round's plan. Removal is soft, audited and reversible by adding the item again.

### Kept and superseded rules

Kept: SR-D3 (skip with a reason), SR-D5 (round n is writable only after round n-1 is completed), SR-D7 (stepper), immutable completion (SR-D4 apart from its "all resolved" condition) and the RT-1 labelled timeline. Superseded: SR-D1 (every item required) and the SR-D4 "all resolved" rule, replaced by FR-D1 in FR-2. The fixed tool rounds of SR-D8/SR-D11 are replaced by the round's plan in FR-1; one result per tool and round remains.

### Data model

- `PatientProgramRound` is one opened round: Program, Hospital relationship (composite foreign key to `PatientProgram`, like its siblings), `roundNumber` 1-12, `origin` (`GUIDELINE` exactly for rounds 1-6, `EXTRA` for 7-12), `openedAt`, `openedByUserId`, and a unique `submissionNonce`. `(patientProgramId, roundNumber)` is unique. A round is never deleted, and its row is frozen once the round is completed.
- `PatientProgramRoundPlanItem` is one item of a round's plan, referencing its round through a composite foreign key: `stepCode` (the step enum gains `CUSTOM`), `customTitle` (present exactly for CUSTOM, trimmed, never blank), `position`, `origin` (`GUIDELINE` or `ADDED`, with `addedByUserId` present exactly for ADDED), soft removal (`removedAt` and `removedByUserId` together), and the CUSTOM done mark (`doneAt` and `doneByUserId` together, `doneNote` only when done). Recorder columns are not constrained to staff roles because patients record in FR-4. One active non-CUSTOM item per step and round (partial unique index), so a removed step can be added again as a new item. Items are never deleted, an item's identity never changes, a removal is final, and the plan of a completed round is frozen.
- The skip reason enum gains `NOT_DONE_AT_CLOSE`, which only the system writes.
- A skip belongs to one plan item (FR-1b): `PatientProgramRoundStepSkip.planItemId` with a composite foreign key `(planItemId, patientProgramId, roundNumber, stepCode)` to the plan item, so a skip's step and round always equal its item's, and one skip per item (unique `planItemId`). Several CUSTOM items of a round can each be skipped, `NOT_DONE_AT_CLOSE` can resolve every unresolved item, and an item added again after a removal starts without the removed item's skip. A skip needs an active item, and a skipped item is unskipped before it is removed (triggers). Skip and unskip requests name the `planItemId`; the round status matches skips by item only.
- Completions, skips, round vitals and ledger rows (`PatientProgramRoundActivity`, FR-1b) accept rounds 1-12; completions, skips and round vitals require an opened round. A round opens only as round 1 or after the previous round is completed (FR-1b trigger on `PatientProgramRound` insert; rows of the FR-1 data step predate it).
- The ledger source is read from the plan (FR-1b): PLANNED when the round's active plan lists the tool's step (the health path as HEALTH_PATH_REVIEW in rounds >= 6), otherwise EXTRA, evaluated in the writing transaction. A per-round tool result (ไม้บรรทัดวัดใจ, ตารางชีวิตของฉัน, กราฟวัดลอยจม, ความฝันของฉัน) requires an active plan item for its tool in its round; a trigger replaces the fixed-round CHECKs.
- Round vitals may be recorded in any round (FR-4). A round's VITALS evidence is its round vitals or its Follow-up measurements: DONE when either source holds every required measurement. When both exist, the view shows the latest recorded one and names its source.
- All guards are database triggers and constraints behind the service checks. The demo/test reset keeps the transaction-local `demi.service_area_purge = 'demo-reset'` escape for deletes.

### Why the plan is materialized

A round's plan is stored when the round opens, not computed from the guideline when it is read. A later guideline change therefore never rewrites the history of a round that already ran, and every edit, removal or completion applies to one persisted plan that the services, views and triggers share. The guideline in code (`ROUND_GUIDELINES`) only seeds new rounds. Program creation opens round 1, and completing round n < 6 opens round n + 1 in the same serializable transaction, both with the guideline plan. A guideline round that is not opened yet is shown as a preview of its guideline. The migration seeded the plans of existing Programs from the same guideline, and a unit test keeps that seed equal to `ROUND_GUIDELINES`.

### Phasing

- **FR-1:** schema, triggers, data step, `ROUND_GUIDELINES` / `ROUND_ITEM_CATALOG`, round numbers as `number` with `isValidRoundNumber` (integer 1-12), status computed over the plan, round opening on Program creation and completion, plan checks for tool writes, skips and unskips. No visible behaviour change: the completion rule stays "every plan item resolved"; rounds 7-12 cannot be added yet; Follow-up mapping, the Final Assessment gate, authorization, UI and reports are unchanged.
- **FR-1b:** skips keyed by plan item (CUSTOM items become skippable through the existing skip path), the ledger widened to rounds 1-12 with a plan-based source, and the round-opening order trigger. Still no visible behaviour change.
- **FR-2:** services and server actions for plan editing, adding rounds 7-12, FR-D1 completion with `NOT_DONE_AT_CLOSE`, current-round Follow-ups and their data guard, the Final Assessment gate (at least six opened rounds, all opened rounds completed), and health-path review in rounds >= 6.
- **FR-3:** the staff UI for plans, added rounds and ending a round.
- **FR-4:** patient self-recording.
- **FR-5:** reports.
- **FR-6:** hardening and end-to-end coverage. Each phase is delivered separately.

## Consequences

- Every round fact now needs an opened round. Writers that bypass the services (tests, scripts) must open the round first; the demo reset deletes plan items and rounds under the reset switch.
- Round writes gain one or two lookups (round opened, active plan item) inside the same serializable transaction.
- A tool write for a step the plan does not list is refused with the round conflict message "รายการนี้ไม่อยู่ในแผนของครั้งที่ n" (previously a validation error).

## Open questions

- Resolved in FR-1b: skips per (Program, round, step) could not hold two CUSTOM skips or `NOT_DONE_AT_CLOSE` for several items; skips are now keyed by plan item. The ledger accepted rounds 1-6 only with a guideline-derived source; it now accepts 1-12 with a plan-based source. Round opening was ordered by the services only; a trigger now backs it.
- Resolved in FR-2: HEALTH_PATH_REVIEW is addable in rounds >= 6 with round-1 vitals and reviews rounds 1..n. HEALTH_PLAN_REVIEW and HEALTHY_PLAN additions require an existing Goal Plan; the round-2 guideline still creates the first Goal Plan.
- Guideline opening is audited by its containing Program creation or round completion. Staff-added EXTRA rounds are audited separately as patient_program_round.opened.
