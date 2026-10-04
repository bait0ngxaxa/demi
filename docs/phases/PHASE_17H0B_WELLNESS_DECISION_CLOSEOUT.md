# Phase 17H.0B — Wellness Owner Decision Closeout

## CURRENT-status addendum — Phase 17H.2 (2026-10-04)

[Exercise implementation contract](./PHASE_17H2_EXERCISE_JOURNAL_IMPLEMENTATION_CONTRACT.md): **Phase 17H.2 CLEARED FOR IMPLEMENTATION / NOT IMPLEMENTED; WELL-02 CLEARED FOR IMPLEMENTATION**. Q64–Q68 remain CLOSED / OWNER APPROVED — Option A: one actually performed Patient-reported session, required free-text activity/date, OPTIONAL duration/note, exact persisted ACTIVE Patient SELF only. Technical bound closed: nullable INTEGER duration 1..2,147,483,647 minutes, storage safety only, no clinical meaning; raw/normalized activity 240/120 and note 2,000/1,000 UTF-16 units. Dedicated Exercise + payload-free surviving owner/nonce receipt, retryLimit=0, expectedUpdatedAt, physical delete, minimized atomic audit, private 50-row signed-cursor history. Two independent live Meal/Exercise sections at existing `/app/personal/wellness` are the later UX contract; no Exercise runtime exists now.

**17H.1 IMPLEMENTED / CLOSED; WELL-01 IMPLEMENTED** unchanged, including corrected distinct consumed-create recovery requiring explicit new intent and server-authoritative Bangkok date validation without stale static browser max. **17H.3 PLANNED / NOT IMPLEMENTED; WELL-03 OWNER DECISIONS CLOSED / TARGET-ONLY / NOT IMPLEMENTED**; corrected Q71 unchanged naturally passed targetDate edit exception preserved. **Personal Weight Observation DEFERRED / NOT APPROVED FOR FIRST 17H SCOPE**. No Goal/care write-back, richer measurements, scoring/advice, reporting/sharing/export, delegated visibility, reminders or generic Wellness framework. Earlier pending-cap/contract/planned references are historical and superseded for Exercise only; Weight technical contract remains required.

**17G.4A PASS / AUTOMATED RE-AUDIT COMPLETE**; Family P17F-L04 OPEN/device UAT pending, P17F-L05 OPEN/FUTURE, Q5 real-data delegated use GOVERNANCE BLOCKED, parked 17E.2 consent, MED-02 REQUIREMENT-GATED and 17J delivery/system authority REQUIREMENT-GATED unchanged. Documentation-only source/status/link/UTF-8/diff validation; no runtime/schema/migration/test/env/config change or runtime checks, no manual browser/device UAT or production claim. Prior phase evidence below is historical.

## Historical runtime addendum — 17H.1 (2026-10-03)

**Phase 17H.1 IMPLEMENTED / CLOSED; WELL-01 IMPLEMENTED**. See [implementation handoff](./PHASE_17H1_MEAL_JOURNAL_IMPLEMENTATION.md) for actual runtime/migration/automated results. Q54–Q83 remain CLOSED / OWNER APPROVED — Option A; corrected Q71 and all deferred/excluded boundaries unchanged. WELL-02 planned 17H.2 / NOT IMPLEMENTED; WELL-03 target-only planned 17H.3 / NOT IMPLEMENTED; Personal Weight Observation DEFERRED / NOT APPROVED FOR FIRST 17H SCOPE. No manual browser/device UAT or production deployment claim. Clearance/no-runtime statements below record the historical 17H.0B contract task, not current delivery status.

## Historical 17H.0B disposition — 2026-10-03 (Asia/Bangkok)

**17H.0 CLOSED / DECISIONS CLOSED; Q54–Q83 CLOSED / OWNER APPROVED — Option A.**
**17H.0B CLOSED / DOCUMENTATION CONTRACT COMPLETE.** WELL-01 / **17H.1 CLEARED FOR IMPLEMENTATION / NOT IMPLEMENTED** through the [Meal Journal contract](./PHASE_17H1_MEAL_JOURNAL_IMPLEMENTATION_CONTRACT.md). WELL-02 decisions closed / planned 17H.2 / NOT IMPLEMENTED; WELL-03 decisions closed / target-only planned 17H.3 / NOT IMPLEMENTED. Personal Weight Observation **DEFERRED / NOT APPROVED FOR FIRST 17H SCOPE**.

## A. Baseline and approval

- Actual starting HEAD: `f34d4aa41548aef7b3c53d9ed746d59bb7e2fd62` — `docs(phase-17h0): clarify target dates and prioritize current status`; matches expected HEAD. Starting working tree clean; no newer commits to reconcile.
- Source: [corrected Phase 17H.0 Wellness Decision Pack](./PHASE_17H0_WELLNESS_DECISION_PACK.md). Its evidence analysis remains historical; the final dispositions here supersede its pre-approval status.
- Explicit owner statement in this task: **“Q54–Q83: APPROVE ALL RECOMMENDED OPTION A, WITHOUT CHANGES.”** This approval occurred after the corrected Q71 targetDate semantics. No alternative B/C/etc. or future-gated option was approved.
- Owner separately confirmed optional Meal description, optional Exercise duration, deferred photos and Personal Weight Observation, excluded BMI/scoring/advice, deferred sharing/export/reporting/reminders, and 17J as future delivery/system-authority boundary.
- Documentation/contract only: no runtime, schema, migration, application code, routes/UI, tests, environment/config changes; no commit or push. Approval of an exclusion/deferment does **not** approve implementation of that feature.

## B. Final decision matrix

Every row records the final owner disposition, not a new recommendation.

| Decision | Final disposition | Approved semantic |
| --- | --- | --- |
| Q54 | CLOSED / OWNER APPROVED — Option A | Personal Patient-reported self-tracking; not clinical truth or clinician verification. |
| Q55 | CLOSED / OWNER APPROVED — Option A | Create/edit/delete by exact persisted Patient SELF only. |
| Q56 | CLOSED / OWNER APPROVED — Option A | Read own SELF only; Work/Family/ADMIN authority denied; future grants need a new contract. |
| Q57 | CLOSED / OWNER APPROVED — Option A | Independent of Goal Plan; no synchronization, completion or progress write-back. |
| Q58 | CLOSED / OWNER APPROVED — Option A | One reported consumed meal/snack occasion; multiple entries per date/category legal; retry must not duplicate one attempt. |
| Q59 | CLOSED / OWNER APPROVED — Option A | BREAKFAST — มื้อเช้า; LUNCH — มื้อกลางวัน; DINNER — มื้อเย็น; SNACK — ของว่าง. Patient-selected; no OTHER or clock inference. |
| Q60 | CLOSED / OWNER APPROVED — Option A | Meal occurrence civil date, Asia/Bangkok; past/today allowed, future denied; no meal time or fake midnight instant. |
| Q61 | CLOSED / OWNER APPROVED — Option A | Required category/date; optional plain-text description ≤1,000 characters; richer food/quantity/nutrition fields outside first scope. |
| Q62 | CLOSED / OWNER APPROVED — Option A | Meal photos/storage deferred. |
| Q63 | CLOSED / OWNER APPROVED — Option A | Edit current Meal record + physical delete from active persistence; surviving event history, no content revisions/archive/restore. |
| Q64 | CLOSED / OWNER APPROVED — Option A | One actually performed Patient-reported Exercise session; multiple same-day/same-name sessions allowed; no Goal completion. |
| Q65 | CLOSED / OWNER APPROVED — Option A | Required free-text activity name ≤120 characters; no controlled list or Goal activity-code reuse. |
| Q66 | CLOSED / OWNER APPROVED — Option A | Activity/date + OPTIONAL positive finite integer duration in minutes + optional note ≤1,000 characters; no inferred duration; richer measurements excluded/deferred. |
| Q67 | CLOSED / OWNER APPROVED — Option A | Exercise civil date Asia/Bangkok; past/today allowed, future denied; optional duration separate, no start/end inference. |
| Q68 | CLOSED / OWNER APPROVED — Option A | Edit current Exercise session + physical delete; paginated surviving event history, no revisions/restore or care write-back. |
| Q69 | CLOSED / OWNER APPROVED — Option A | Patient-selected personal weight target; no clinician/program target or required decrease. Owner approval confirms this intent. |
| Q70 | CLOSED / OWNER APPROVED — Option A | Target kg only, finite positive value; no unit-conversion framework or clinical healthy-weight range. |
| Q71 | CLOSED / OWNER APPROVED — Option A | Required target kg + optional Asia/Bangkok civil targetDate; corrected create/edit rules below; no start weight/change/note/status/advice. |
| Q72 | CLOSED / OWNER APPROVED — Option A | 0..1 current target per PatientProfile; explicit atomic edit/replace/remove; no prior-target content history or medication STOPPED lifecycle. |
| Q73 | CLOSED / OWNER APPROVED — Option A | No automatic current-weight source/hierarchy/progress/delta; no latest care-measurement selection or overwrite. |
| Q74 | CLOSED / OWNER APPROVED — Option A | NO Personal Weight Observation in first 17H scope; deferred and requires separate explicit contract if ever requested. |
| Q75 | CLOSED / OWNER APPROVED — Option A | BMI excluded, including storage/calculation/classification. |
| Q76 | CLOSED / OWNER APPROVED — Option A | All automated nutrition/fitness/clinical scoring/advice excluded. |
| Q77 | CLOSED / OWNER APPROVED — Option A | Atomic minimized successful mutation audit; no sensitive payload/value/hash, duplicate retry/NOOP audit or ordinary durable per-read audit. |
| Q78 | CLOSED / OWNER APPROVED — Option A | Export/print feature/sharing/external API deferred; no automatic caregiver grant. |
| Q79 | CLOSED / OWNER APPROVED — Option A | Excluded from Hospital/Program/outcome/adherence/cohort/population reporting; future reporting deferred. |
| Q80 | CLOSED / OWNER APPROVED — Option A | No Wellness reminder source or delivery; future source contract separate from 17J delivery/system authority. |
| Q81 | CLOSED / OWNER APPROVED — Option A | Fresh persisted exact SELF, private reads, no cross-actor cache or sensitive URLs/logs; safe missing/foreign denial. |
| Q82 | CLOSED / OWNER APPROVED — Option A | Personal `/app/personal/wellness`; eventual อาหาร / การออกกำลังกาย / เป้าหมายน้ำหนัก sections; mobile-first, truthful source copy. |
| Q83 | CLOSED / OWNER APPROVED — Option A | Sequential Meal → Exercise → target-only Weight Goal → automated re-audit/UAT readiness after closeout; no combined framework. |

**Q71 corrected rules are binding:** Create: optional targetDate; when supplied it must be **>= current Asia/Bangkok civil date**, today allowed. Edit retaining the unchanged existing date: a naturally passed targetDate may remain while another field is edited; this must not fail validation. Edit changing targetDate: a newly supplied date must be **>= current Asia/Bangkok civil date**, today allowed; clearing an optional date is permitted. Passing targetDate causes **no automatic complete, expire, overdue state, cancel, clinical interpretation, reminder, scoring or automatic progress**. The old blanket “no past date on edit” rule is not approved.

Exercise numeric cap and Weight Goal precision/range remain technical implementation bounds to close in their own 17H.2/17H.3 contracts before runtime; they are not reopened owner product decisions, not invented in the Meal-only contract and not clearance for those runtimes.

## C. Final domain boundary

> Personal wellness data **!=** clinical/program measurement **!=** Goal Plan target

Approved distinct domains: **Personal Meal Journal**, **Personal Exercise Journal**, **Personal Weight Goal**. Not approved as first-scope domains: Personal Weight Observation, nutrition/macronutrient engine, BMI, automated clinical/wellness interpretation, provider-authored wellness data, shared wellness record, or generic universal WellnessEntry/EAV model. No clinical amendment/lifecycle semantics copied from medication or care records.

## D. Authorization

Initial authority is **exact persisted ACTIVE Patient SELF, exact own PatientProfile only**: authenticated ACTIVE User → persisted PATIENT role → exact Person → exact PatientProfile. Resource ID is only a locator, never authority. No owner transfer or client-selected identity/role scope.

Hospital MEMBER, Hospital OWNER, assigned OSM, Family/caregiver, family appointment grant, routine Platform ADMIN and access to any other Patient's Wellness are denied. Multi-role PATIENT + another Work role does **not** union Work authority into Wellness; eligible multi-role actors can use only their own SELF records. Recheck persisted eligibility on every read/write/continuation; stale actor/removed role/invalid binding fails closed.

## E. Visibility and secondary use

Initial Wellness records do **not** automatically feed PatientGoalPlan completion, PatientFollowup activity completion, PatientBaseline, Final Assessment, Hospital dashboards, Program reporting, adherence scores, cohort/population analytics, Family delegated projections or notifications. Any future projection requires a new explicit source/meaning/purpose/visibility/authority contract. Absence of a Meal/Exercise record proves neither absence of consumption/activity nor non-adherence.

## F. Deferred items and operational boundaries

Meal photos/storage; structured food items; portions/quantity semantics; nutrition/macros/calories; controlled exercise vocabulary; distance/repetitions/sets/intensity/device data; Personal Weight Observation; current-weight hierarchy/progress/delta; BMI; scoring/advice; sharing/export/API; reminders/delivery; reporting/analytics remain deferred or excluded as recorded above. These are **not implementation gaps for 17H.1**.

Physical delete removes active Meal payload/read paths after commit; it does not promise instant erasure from backups, browser/device memory or caches. No authoritative Wellness-specific backup retention/account-erasure/audit-retention duration was found in reviewed project contracts. Operational/privacy follow-up: accountable owner must define backup expiry/restore handling, account erasure (including technical create receipts), audit access/retention and deployment privacy controls before real deployment decisions that require them. Do not invent legal retention or compliance certification; this follow-up does not itself block synthetic/demo implementation under existing Phase 17A production-hardening guidance.

## G. Sequence, unchanged gates and validation

17H.0 decision analysis COMPLETE / decisions CLOSED → **17H.0B closeout + Meal contract CLOSED** → **17H.1 Meal CLEARED / NOT IMPLEMENTED** → 17H.2 Exercise → 17H.3 Personal Weight Goal → 17H.4A automated authorization/security/DB/privacy re-audit + UAT readiness. Personal Weight Observation is not automatically part of 17H.3. Manual mobile/browser/device UAT needs separate later evidence.

17G.4A remains PASS / AUTOMATED RE-AUDIT COMPLETE; medication adherence DEFERRED, MED-02 and 17J delivery/system authority REQUIREMENT-GATED. Family P17F-L04 OPEN/device UAT pending, P17F-L05 OPEN/FUTURE, Q5 real-data delegated use GOVERNANCE BLOCKED, and parked 17E.2 consent unchanged.

Documentation validation: starting HEAD/tree, all 30 dispositions against corrected Option A, Q71 preservation, optional fields/exclusions/SELF boundaries, retry/concurrency contract, current operational status, local links, strict UTF-8/Thai integrity and final diff/status. No unit/integration/Prisma/lint/typecheck/build/dev-server checks run; no runtime/UAT PASS inferred.
