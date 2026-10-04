# Phase 17H.0 — Wellness Decision Pack

## CURRENT-status addendum - Phase 17H.3 (2026-10-04)

[Weight Goal technical contract](./PHASE_17H3_WEIGHT_GOAL_IMPLEMENTATION_CONTRACT.md): **Phase 17H.3 - CLEARED FOR IMPLEMENTATION / NOT IMPLEMENTED; WELL-03 - CLEARED FOR IMPLEMENTATION / TARGET-ONLY.** Patient-selected kg target only; 0..1 unique PatientProfile owner; canonical decimal string, scale 3, 0.001..1,000,000 structural bounds, Decimal/NUMERIC(10,3). Corrected Q71 permits unchanged naturally passed targetDate during weight edits; create/changed date >= Bangkok today, explicit clear allowed, no date lifecycle. Dedicated payload-free surviving create receipt prevents successful old-intent resurrection; expectedUpdatedAt and minimized atomic audit; exact persisted ACTIVE Patient SELF. Future Weight joins the existing shared Wellness private-authority generation and three anchored sections at `/app/personal/wellness`. No Weight runtime delivered.

**17H.1 IMPLEMENTED / CLOSED; WELL-01 IMPLEMENTED. 17H.2 IMPLEMENTED / CLOSED; WELL-02 IMPLEMENTED. Personal Weight Observation DEFERRED / NOT APPROVED FOR FIRST 17H SCOPE.** Q69-Q74 and all approved exclusions preserved; no current-weight source/progress/BMI/advice/history. 17H.4A re-audit/UAT readiness remains future. 17G.4A, Family P17F-L04/L05, Q5 governance, parked 17E.2 consent, MED-02 and 17J remain unchanged. Earlier dated planned/precision-pending statements are historical and superseded by this contract; prior runtime/test evidence is not rerun or extended here.

## Historical-status addendum — Phase 17H.2 (2026-10-04)

**Phase 17H.2 — IMPLEMENTED / CLOSED; WELL-02 — IMPLEMENTED.** See [Exercise implementation handoff](./PHASE_17H2_EXERCISE_JOURNAL_IMPLEMENTATION.md) for runtime, migration, and automated evidence. Exercise is a dedicated Patient-reported actually performed session with required free-text activity/date; optional duration 1..1,000,000 minutes (DEMI structural bound only) and optional note; Asia/Bangkok civil date past/today; exact persisted ACTIVE Patient SELF. Owner-bound payload-free receipt prevents retry duplicates and survives physical deletion; stale writes use expectedUpdatedAt; success audit is minimized and atomic; private history uses Exercise-bound signed cursor. Meal + Exercise occupy the existing `/app/personal/wellness` route as independent sections. No Goal Plan/care linkage or future measurements were added.

**Evidence:** full unit **208 files / 1,725 tests PASS**; full PostgreSQL integration **30 files / 421 tests PASS**, including real Exercise create/replay/delete, authorization, idempotency, edit/delete races, audit rollback and history/cursor. Focused Meal + Exercise/UI regression **13 files / 171 tests PASS**; Exercise+Meal PostgreSQL focused **2 files / 55 tests PASS**. Prisma client generation, schema validation, existing disposable DB migration, a new empty disposable database through all **35 migrations**, typecheck, lint and UI detector PASS. No production migration/deployment. Manual browser/mobile/device/BFCache UAT is **NOT EXECUTED**.

**Phase 17H.1 IMPLEMENTED / CLOSED; WELL-01 IMPLEMENTED** remains intact. **17H.3 PLANNED / NOT IMPLEMENTED; WELL-03 OWNER DECISIONS CLOSED / TARGET-ONLY**; its separate technical contract is required before runtime. **Personal Weight Observation DEFERRED / NOT APPROVED FOR FIRST 17H SCOPE.** 17H.4A Wellness re-audit/UAT readiness remains future. 17G.4A PASS, Family P17F-L04/L05, Q5 governance gate, parked 17E.2 consent, MED-02 and 17J statuses remain unchanged. Earlier clearance-only Phase17H.2 addenda are historical.

## Historical runtime addendum — 17H.1 (2026-10-03)

**Phase 17H.1 IMPLEMENTED / CLOSED; WELL-01 IMPLEMENTED**. See [implementation handoff](./PHASE_17H1_MEAL_JOURNAL_IMPLEMENTATION.md) for actual runtime/migration/automated results. Q54–Q83 remain CLOSED / OWNER APPROVED — Option A; corrected Q71 and all deferred/excluded boundaries unchanged. WELL-02 planned 17H.2 / NOT IMPLEMENTED; WELL-03 target-only planned 17H.3 / NOT IMPLEMENTED; Personal Weight Observation DEFERRED / NOT APPROVED FOR FIRST 17H SCOPE. No manual browser/device UAT or production deployment claim. Clearance/no-runtime statements below record the historical 17H.0B contract task, not current delivery status.

วันที่วิเคราะห์: **2026-10-03 (Asia/Bangkok)**

## Historical 17H.0B owner closeout — 2026-10-03 (Asia/Bangkok)

**Phase 17H.0 CLOSED / DECISIONS CLOSED**<br>
**Q54–Q83 CLOSED / OWNER APPROVED — Option A**<br>
**Phase 17H.0B CLOSED / DOCUMENTATION CONTRACT COMPLETE**<br>
**WELL-01 / Phase 17H.1 CLEARED FOR IMPLEMENTATION / NOT IMPLEMENTED**<br>
**WELL-02 DECISIONS CLOSED / PLANNED 17H.2 / NOT IMPLEMENTED**<br>
**WELL-03 DECISIONS CLOSED / TARGET-ONLY PLANNED 17H.3 / NOT IMPLEMENTED**<br>
**Personal Weight Observation DEFERRED / NOT APPROVED FOR FIRST 17H SCOPE**

Owner review corrected pack แล้วและอนุมัติชัดเจนว่า **“Q54–Q83: APPROVE ALL RECOMMENDED OPTION A, WITHOUT CHANGES.”** การอนุมัติเกิด **หลังแก้ Q71 targetDate semantics** ไม่อนุมัติตัวเลือก B/C/etc., future grant หรือการ implement สิ่งที่ deferred/excluded. Meal description ยังคง OPTIONAL; Exercise duration ยังคง OPTIONAL; photos/observations/sharing/export/reporting/reminders ยังคง deferred หรือ excluded; BMI/scoring/advice excluded; 17J ยังคงเป็น delivery/system-authority boundary.

ดู matrix ที่อนุมัติครบใน [final decision closeout](./PHASE_17H0B_WELLNESS_DECISION_CLOSEOUT.md) และขอบเขต implementation/retry/concurrency/privacy ใน [17H.1 Meal contract](./PHASE_17H1_MEAL_JOURNAL_IMPLEMENTATION_CONTRACT.md) งานนี้เป็นเอกสารเท่านั้น ยังไม่มี Wellness runtime.

**Historical analysis notice:** Sections 1–15 and the response template retain the original analysis-time evidence/recommendations for traceability. Their OPEN / NOT OWNER APPROVED / REQUIREMENT-GATED wording describes the pre-approval baseline, not CURRENT status. Each Q54–Q83 now has a final disposition above its historical recommendation; the corrected Option A content is approved, while alternate options and conditional future branches are not. Future Exercise/Weight technical bounds require their own implementation contracts; approval does not invent those details. Section 16 below is the current final disposition. Original evidence analysis is not rewritten.

## 1. Phase/status baseline

| รายการ | หลักฐาน / สถานะ |
| --- | --- |
| Target repository | bait0ngxaxa/demi; origin ตรงกับ repository ที่ระบุ |
| Expected และ actual starting HEAD | `58e79fa34c8b0aa65f958a38dda4ced773f8f545` — `audit(phase-17g4a): complete medication security re-audit` |
| Starting working tree | สะอาด; HEAD ไม่ได้เคลื่อนจาก baseline จึงไม่มี newer commits ให้ reconcile |
| Legacy revision | raviut-max/demi-plus-web-v2 ที่ `7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e`; shallow checkout แยกใน temporary directory ไม่เพิ่มไฟล์ legacy ใน rewrite |
| ขอบเขตการเปลี่ยน | decision pack นี้ และ dated CURRENT addenda ใน CONTEXT/UAT backlog เท่านั้น |
| Approval | ไม่มี owner approval สำหรับ Q54–Q83; การขอจัดทำ pack ไม่ใช่การอนุมัติคำตอบ |

[17G.4A re-audit](./PHASE_17G4A_MEDICATION_REAUDIT_UAT_READINESS.md) เป็น current medication baseline: 17G.0 CLOSED; Q30–Q53 OWNER APPROVED; 17G.1/17G.2 IMPLEMENTED / CLOSED; 17G.3C IMPLEMENTED / CLOSED **เฉพาะ reminder occurrence source**; 17G.4A PASS / AUTOMATED RE-AUDIT COMPLETE การวิเคราะห์นี้ไม่เปิด decision ใดของ 17G ใหม่ ไม่อนุมาน manual/browser/device UAT PASS; adherence DEFERRED, MED-02 และ 17J notification delivery/system authority REQUIREMENT-GATED

17F.4A automated re-audit PASS ไม่ปิด P17F-L04 real-device UAT; P17F-L05 OPEN / FUTURE และ Q5 real-data delegated use GOVERNANCE BLOCKED คงเดิม รวมทั้ง 17E.2 consent ที่ parked อยู่

## 2. Evidence-reading rules

- Rewrite source ณ HEAD จริงเป็นหลักฐาน current behavior; phase handoff บอกขอบเขต/ประวัติ ไม่ใช่การอนุมัติ wellness ใหม่
- Phase 17A เป็น customer-flow discovery: ชื่อ destination ไม่กำหนด field, unit, provenance, authority หรือ clinical meaning
- Legacy เป็น behavioral/terminology evidence เท่านั้น ไม่โอน client-side role checks, direct Supabase, schema, IDs หรือ access scope มา rewrite
- ผลค้นว่าไม่พบจำกัดที่ tracked source ใน revision ที่ระบุ ไม่พิสูจน์ว่าระบบภายนอกหรือฐานข้อมูลจริงไม่มี record
- Helper ที่เขียน persistence ได้ ≠ UI flow ที่มี caller ≠ หลักฐานการใช้จริง; read-history code ≠ verified database contents
- **RECOMMENDATION — NOT OWNER APPROVED** คือข้อเสนอเท่านั้น; OPEN / REQUIREMENT-GATED ไม่ใช่ช่องว่างที่ agent เติมเองได้
- ใช้ [17G.0 pack](./PHASE_17G0_MEDICATION_DECISION_PACK.md) เป็นโครงสร้างการอ่านหลักฐาน/decision/lifecycle/privacy เท่านั้น ไม่คัดลอก STOPPED, daily schedule หรือ medication occurrence semantics

## 3. Rewrite source inventory

ตรวจ file inventory, schema และส่วนของ source ที่รับผิดชอบ creation, query, access, provenance และ reporting ดังนี้; ไม่ได้อ้างว่า execute tests หรืออ่านทุกบรรทัดของทุก module

| Source | สิ่งที่พบและข้อจำกัด |
| --- | --- |
| [Prisma schema](../../prisma/schema.prisma) | มี PatientGoalPlan/PatientGoalItem, PatientBaseline, PatientFollowup, PatientFinalAssessment; ไม่มี dedicated meal/exercise journal หรือ personal weight-target/observation model |
| [Goal template](../../src/modules/goals/domain/goal-templates/legacy-prototype-v1.ts), [validation](../../src/modules/goals/domain/goal-validation.ts) | Primary `weight` = “น้ำหนักลด”; FOOD/EXERCISE/MEASUREMENT เป็น activity targets; targetDays/value/unit เป็นแผน ไม่ใช่ actual consumption/exercise |
| [Goal service](../../src/modules/goals/services/goal-service.ts), [query](../../src/modules/goals/services/goal-query-service.ts), [policy](../../src/modules/goals/policies/goal-policy.ts), [access](../../src/modules/goals/services/goal-access-service.ts) | immutable plan rounds, template provenance, optional Screening/Program source, server-derived Work access; ไม่มี journal mutation หรือ automatic journal→completion |
| [Baseline service](../../src/modules/patient-baseline/services/patient-baseline-service.ts), [transaction](../../src/modules/patient-baseline/services/patient-baseline-transaction.ts), [schema](../../src/modules/patient-baseline/schemas/patient-baseline-schemas.ts), [policy](../../src/modules/patient-baseline/policies/patient-baseline-policy.ts) | immutable relationship-owned baseline; date-only recordedOn, recorder provenance; weight/heightCm เป็น care/roster observation ไม่ใช่ SELF journal |
| [Follow-up service](../../src/modules/followups/services/followup-service.ts), [definitions](../../src/modules/followups/domain/followup-definitions.ts), [policy](../../src/modules/followups/policies/followup-policy.ts) | relationship-owned หรือ exact Program follow-up, 0..N; server recording time, measurements และ structured activity progress ที่อ้างแผน ไม่ใช่ meal/exercise events |
| [Final service](../../src/modules/patient-final-assessment/services/patient-final-assessment-service.ts), [access](../../src/modules/patient-final-assessment/services/patient-final-assessment-access-service.ts), [schema](../../src/modules/patient-final-assessment/schemas/patient-final-assessment-schemas.ts) | exact Program + relationship, immutable 0..1 Final, program-managed create authority; nullable weight ไม่ใช่ current SELF weight |
| [Reporting query](../../src/modules/reporting/services/program-report-query-service.ts), [projection](../../src/modules/reporting/projections/program-report-projection.ts), [policy](../../src/modules/reporting/policies/program-report-policy.ts) | factual exact-Program projection; explicit linked Baseline, scoped Goal/Follow-up/Final; ไม่มี wellness source หรือ clinical inference |
| [SELF policy](../../src/modules/patient-self/policies/patient-self-policy.ts), [SELF query](../../src/modules/patient-self/services/patient-self-query-service.ts), [care query](../../src/modules/patient-self/services/patient-self-care-query-service.ts) | own persisted identity/read projections แยก Work; SELF care read ไม่ใช่ wellness write authority |
| [Personal home](../../app/app/personal/patient-personal-home.tsx), [Personal page](../../app/app/personal/page.tsx), [own care plan route](../../app/app/personal/care/%5BrelationshipId%5D/goal-plans/%5BgoalPlanId%5D/page.tsx) | Personal routes มี profile/care/appointments/services/medications; Patient อ่านแผน care ของตนได้แล้ว ไม่มี `/app/personal/wellness` |
| [Medication owner resolver](../../src/modules/medications/services/personal-medication-access-service.ts) | exact persisted User→Person→PatientProfile, ACTIVE + PATIENT เป็น infrastructure evidence; ไม่ใช้ medication policy เป็น wellness authority |
| [CONTEXT](../CONTEXT.md), [Phase 17A](./PHASE_17A_CUSTOMER_FLOW_CANONICALIZATION_UAT_CONTRACT.md), [UAT backlog](./PHASE_17_UAT_BACKLOG.md) | WELL-01/02/03 ยัง requirement-gated และต้องแยก wellness จาก care |
| [Phase 15A data map](./PHASE_15A_REPORTING_DATA_MAP.md), [15D.2 measurements](./PHASE_15D2_MEASUREMENT_SEMANTICS_CONSOLIDATION.md), [15E.0 reporting contract](./PHASE_15E0_REPORTING_DASHBOARD_EXPORT_CONTRACT_CONSOLIDATION.md), [15E.1 projection](./PHASE_15E1_PROGRAM_REPORTING_PROJECTION_FOUNDATION.md) | weekly meal/exercise *targets* และ Before/During/After expectations ไม่ใช่ personal journals; latest relationship measurement ไม่ใช่ exact-Program source โดยอัตโนมัติ |
| [16D.2 roster baseline](./PHASE_16D2_INITIAL_BASELINE_ROSTER_IMPORT_PERSISTENCE.md), [UI foundation](../ui/DEMI_UI_FOUNDATION.md), [DESIGN](../../DESIGN.md) | later roster evidence มี height cm และ weight kg; Personal UX ใช้ existing Thai responsive primitives ไม่ต้องมี design system ใหม่ |

**ข้อแก้ความเข้าใจจาก historical evidence:** 15D.2 เคยระบุไม่มี height source แต่ current schema มี `PatientBaseline.heightCm` หลัง 16D.2 แล้ว หน่วย roster kg/cm ได้รับอนุมัติในขอบเขต import ของมัน ไม่อนุมัติ WELL-03 หรือ BMI โดยปริยาย ต้องอ่าน historical map คู่กับ current source

## 4. Legacy evidence

ตรวจ [legacy repository](https://github.com/raviut-max/demi-plus-web-v2/tree/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e) โดยค้น `food`, `meal`, `breakfast`, `lunch`, `dinner`, `snack`, `อาหาร`, `มื้อเช้า`, `มื้อกลางวัน`, `มื้อเย็น`, `ของว่าง`, `exercise`, `fitness`, `workout`, `activity`, `ออกกำลังกาย`, `weight`, `น้ำหนัก`, `BMI`, `goal`, `activities` ทั้ง repository และเจาะ app/lib; ไม่แสดงข้อมูลบุคคลจาก CSV ตัวอย่างใน pack

| ประเภทหลักฐาน | Source / behavior ที่พบ | สิ่งที่ยังพิสูจน์ไม่ได้ |
| --- | --- | --- |
| Actual persistence code / history query | [queries.ts](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/lib/supabase/queries.ts): `saveRecord` (L1580), `saveExerciseRecord` (L1613) upsert `records` conflict key user_id/activity_id/record_date; payload มี is_completed และ optional weight/blood_sugar/sweet_type/exercise_minutes; getPatientRecords/getTodayRecords/getProgress อ่าน history | ค้น export names ใน TS/TSX แล้วไม่พบ caller ของ saveRecord/saveExerciseRecord นอกนิยาม ไม่มีหลักฐานว่า Patient UI เขียนผ่าน helper นี้จริง; ไม่ได้ตรวจ live DB/constraints/RLS หรือ deploy |
| Goal-linked history UI | [Patient goals page](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/app/admin/patients/%5Bid%5D/goals/page.tsx) อ่าน records 90 วัน, join activities, match activity_id, แสดง completed/not-completed, weekly/calendar และ percentage | เป็น operator-side Goal progress presentation ไม่ใช่ dedicated meal entry/exercise-session journal; generic history ไม่ยืนยัน provenance หรือความครบถ้วน |
| Goal Plan choices / persistence | [Goals setup](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/app/admin/patients/%5Bid%5D/goals/setup/page.tsx) และ [Goals page](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/app/admin/goals/page.tsx): primary weight reduction, activities food/exercise/measurement/rest, target_days/value/unit, weekly_activity goal rounds/archive | เป้าหมาย “น้ำหนักลด” ไม่ใช่ persisted numeric personal weight target; goal target minutes ไม่ใช่ actual exercise duration |
| UI wording / care observations | [Baseline form](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/app/admin/patients/%5Bid%5D/baseline/page.tsx) และ [Appointment follow-up](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/app/admin/appointments/followup/%5Bid%5D/page.tsx): weight, food_amount/type/movement status/note; registerPatient เก็บ profile current_weight/height | Program/care entry และ profile field ไม่ยืนยัน personal weight observation journal; followup image upload ไม่ใช่ meal photo requirement |
| Reporting expectations | [Dashboard page](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/app/admin/dashboard/page.tsx) เรียก getDashboardStats; helper นับ todayRecords ใน records และ goals page คำนวณ progress | ไม่เป็น approval ให้ rewrite Hospital dashboard อ่าน personal wellness หรือใช้ adherence denominator เดิม |
| Unsupported assumptions | ไม่พบ dedicated breakfast/lunch/dinner/snack journal หรือ standalone Patient-authored exercise-session/weight-target flow จาก app/lib search | ไม่สามารถอ้าง full personal-journal parity; nutrition/macros/calorie engine, clinical advice, device/GPS integration และ wellness sharing ไม่ได้ยืนยัน |

**Legacy ไม่ได้มีเพียง Goal choices อย่างเดียว:** มี activity-linked persistence helpers และ history-read code จริง แต่ไม่มีหลักฐานเพียงพอของ dedicated personal journal ครบ write/read flow จึงไม่สรุปว่าไม่มี records เลย และไม่สรุปว่า WELL-01/02/03 มี implementation parity แล้ว ห้ามคัดลอก generic `records` model, completion score, browser user_id authority หรือ direct Supabase patterns มา rewrite

## 5. Customer-flow evidence

[Phase 17A](./PHASE_17A_CUSTOMER_FLOW_CANONICALIZATION_UAT_CONTRACT.md) WELL-01 ระบุบันทึกมื้อเช้า/กลางวัน/เย็น/ของว่าง, WELL-02 ระบุบันทึกการออกกำลังกายและดูประวัติ, WELL-03 ระบุ Weight goal; [UAT backlog](./PHASE_17_UAT_BACKLOG.md) คง gates เดียวกัน Evidence รองรับ destination/intention และหมวดมื้อ 4 ค่าเท่านั้น ไม่ยืนยัน calories, photo, duration mandatory, sharing, clinical authority หรือ self-weight log

Phase 17A บันทึกว่า customer whiteboard flow มาจากข้อความ request และไม่มีภาพ whiteboard แยกใน repository ไม่ได้ตรวจภาพต้นฉบับใหม่ใน phase นี้ Workbook reporting เป็น layout/terminology evidence ไม่ใช่การอนุมัติ source/สูตร/authority ของ wellness

**RECOMMENDATION — NOT OWNER APPROVED:** ใช้ขั้นต่ำที่ตรง intent (self-reported meals, performed exercise history, personal weight target) และให้ Q54–Q83 ตัดสินสิ่งที่ flow ไม่ได้กำหนดก่อนทำ implementation contract

## 6. Explicit domain-boundary analysis

| Concept | ความหมาย / ขอบเขต | สถานะ |
| --- | --- | --- |
| A. Personal Meal Journal | Patient รายงานว่าบริโภคอะไรในมื้อหนึ่ง; ไม่รับรองครบ intake ของวัน | WELL-01 REQUIREMENT-GATED; ไม่มี dedicated domain |
| B. Personal Exercise Journal | Patient รายงาน exercise ที่ทำจริงหนึ่งเหตุการณ์; ไม่ใช่ prescribed target | WELL-02 REQUIREMENT-GATED; ไม่มี dedicated domain |
| C. Personal Weight Goal | Patient-selected wellness target; ตัวเลขเป้าหมายไม่ใช่ measurement | WELL-03 REQUIREMENT-GATED; semantic ยังรอ Q69 |
| D. Personal Weight Observation | possible Patient-authored measured weight พร้อม provenance ของตน | ยังไม่ approved จาก WELL-03; Q73/Q74 ต้องตัดสินแยก |
| E. PatientGoalPlan / PatientGoalItem | care/program plan immutable rounds; weekly activity targetDays/value/unit, primaryGoalCode, template/version; optional Program/Screening context | มี runtime; Work creation และ SELF care-read เป็นคนละ access path |
| F. PatientBaseline / Follow-up / Final | care/program observations; Baseline ต่อ exact relationship, Follow-up 0..N relationship/Program, Final 0..1 exact Program | มี runtime; provider/program-recorded หรือ approved roster provenance ไม่ใช่ SELF journal |

**RECOMMENDATION — NOT OWNER APPROVED:** D **ไม่อยู่ใน first 17H implementation**; Q73=A ไม่เลือก current-weight source อัตโนมัติ และ Q74=A ไม่เพิ่ม observation domain ทำ WELL-03 เป็น target-only ได้โดยไม่ต้องมี chart/progress/delta/BMI หาก owner เลือก YES ต้องปิด observation contract แยกก่อน 17H.3 หรือแยก slice เพิ่ม ห้ามสร้างเพราะกราฟจะทำง่ายขึ้น

**RECOMMENDATION — NOT OWNER APPROVED:** A/B/C ใช้ domain records แยกตาม semantics ไม่รวม E/F และไม่ใช้ generic WellnessEntry/EAV/universal event infrastructure; wellness owner เป็น persisted PatientProfile แยก Hospital relationship/Program scope

## 7. Owner decisions — Q54–Q83 (closed; historical checklist retained)

**Final disposition: ทุกข้อ Q54–Q83 CLOSED / OWNER APPROVED — Option A.** The following original checklist sentence and recommendation labels are historical only.

**ทุกข้อ OPEN / NOT OWNER APPROVED** ตัวเลือก A/B/C ฯลฯ ใน pack นี้เป็นรหัสช่วยตอบเฉพาะข้อ ไม่สืบทอด medication decisions ข้อเสนอในแต่ละข้อมีผลเฉพาะหาก owner อนุมัติ

### Q54 — Wellness semantic boundary

**FINAL OWNER DISPOSITION: CLOSED / OWNER APPROVED — Option A.**

ตัวเลือก: A personal self-tracking only; B clinically authoritative wellness record; C mixed personal + clinical; D other (ระบุ)

**RECOMMENDATION — NOT OWNER APPROVED: A.** บันทึกเป็น Patient-reported SELF data ไม่เรียก clinical truth A รองรับการจำ/ดูประวัติของตน; B ต้องมี clinician authority, verification, correction/retention และ governance ใหม่; C ต้องแยก source/provenance และระบุว่าใครรับรองอะไร มิฉะนั้นเกิด authority ambiguity

### Q55 — Creator authority

**FINAL OWNER DISPOSITION: CLOSED / OWNER APPROVED — Option A.**

ตัวเลือก: A Patient SELF only; B Hospital; C assigned OSM; D Family/caregiver; E combinations/other (ระบุ create/edit/delete แต่ละ actor)

**RECOMMENDATION — NOT OWNER APPROVED: A.** create/update/delete ผ่าน exact persisted SELF เท่านั้น Hospital/OSM Program หรือ Goal Plan authority ไม่ถ่ายมาด้วย การเลือก B–E ต้องกำหนด proxy provenance, consent/grant, field authority และ conflict rules เพิ่ม

### Q56 — Read authority / visibility

**FINAL OWNER DISPOSITION: CLOSED / OWNER APPROVED — Option A.**

ตัวเลือก: A SELF only; B SELF + Hospital MEMBER/OWNER; C เพิ่ม assigned OSM; D เพิ่ม Family/caregiver; E routine Platform ADMIN; F future explicit share/grant only; G ระบุ matrix อื่น

**RECOMMENDATION — NOT OWNER APPROVED: A ตอนแรก; F เป็น future gate เท่านั้น.** MEMBER/OWNER, assigned OSM, routine ADMIN และ Family denied สำหรับของผู้อื่น การมี active family relationship หรือ appointment-read grant ไม่อนุญาต wellness ไม่ว่ามี role อื่นร่วมด้วยหรือไม่; future grants ต้องมี purpose/field/version/acceptance/revoke contract ใหม่

### Q57 — Goal Plan relationship

**FINAL OWNER DISPOSITION: CLOSED / OWNER APPROVED — Option A.**

ตัวเลือก: A independent; B automatically synchronized; C projection-only relation; D other

**RECOMMENDATION — NOT OWNER APPROVED: A.** บันทึก meal/exercise ไม่เปลี่ยน completion/progress ของ Goal Plan; weight target ไม่สร้าง/เปลี่ยน plan B เพิ่ม shared mutation/conflict risk; C ต้องมี approved mapping/read policy/source label ก่อน ห้ามใช้ projection แอบสร้าง authority

### Q58 — Meal record semantic

**FINAL OWNER DISPOSITION: CLOSED / OWNER APPROVED — Option A.**

ตัวเลือก: A one Patient-reported consumed meal/snack occasion; B daily aggregate intake; C planned meal/adherence record; D other

**RECOMMENDATION — NOT OWNER APPROVED: A.** หนึ่ง entry เป็นคำรายงานการบริโภคหนึ่งครั้ง อนุญาตหลาย entry ในวัน/หมวดเดียวกัน; category-only entry ไม่ทราบ food/quantity และไม่พิสูจน์ intake ครบ ไม่มี inference nutrition, diet quality, calories หรือ clinical compliance การส่งซ้ำจาก retry ต้องไม่สร้าง entry ซ้ำ แต่การบันทึกคนละครั้งตั้งใจต้องทำได้

### Q59 — Meal category vocabulary

**FINAL OWNER DISPOSITION: CLOSED / OWNER APPROVED — Option A.**

ตัวเลือก: A BREAKFAST/LUNCH/DINNER/SNACK; B เพิ่ม OTHER; C uncontrolled categories; D other

**RECOMMENDATION — NOT OWNER APPROVED: A.** ใช้ labels มื้อเช้า/มื้อกลางวัน/มื้อเย็น/ของว่าง ตาม customer evidence หมวดเป็นสิ่งที่ Patient เลือก ไม่ derive จากเวลา ไม่เพิ่ม clinical nutrition categories; หากหมวดไม่พอ owner ต้องระบุกรณีก่อนเพิ่ม

### Q60 — Meal occurrence time / timezone

**FINAL OWNER DISPOSITION: CLOSED / OWNER APPROVED — Option A.**

ตัวเลือก: A date only; B date + local time; C timestamp/instant; D other; ทุกตัวเลือกต้องระบุ timezone interpretation

**RECOMMENDATION — NOT OWNER APPROVED: A + Asia/Bangkok.** วันบริโภคเป็น civil date ที่ Patient เลือก ไม่สร้าง midnight instant ปลอม; createdAt/updatedAt เป็น system instants แยก ไม่ infer meal time จากหมวด อนุญาตย้อนหลังแต่ไม่วันที่อนาคต; timezone/date validation และ UI Thai calendar conversion ต้องปิดใน 17H.0B ไม่ใช้ browser timezone เปลี่ยนวันที่เงียบ ๆ

### Q61 — Meal content fields

**FINAL OWNER DISPOSITION: CLOSED / OWNER APPROVED — Option A.**

ตัวเลือก: A category/date + optional bounded description; B portion/quantity; C structured food items; D nutrition/macros/calories; E photo/location/tags; F ระบุ combination

**RECOMMENDATION — NOT OWNER APPROVED: A.** optional plain-text description ไม่เกิน 1,000 characters เป็น proposed technical cap ไม่ใช่ nutrition ontology; portion/quantity/items/tags deferred; macros/calories/location reject first slice; photo แยก Q62 ไม่มีการคำนวณ calories/macros

### Q62 — Meal images

**FINAL OWNER DISPOSITION: CLOSED / OWNER APPROVED — Option A.**

ตัวเลือก: A deferred; B included now พร้อม storage/privacy/lifecycle contract

**RECOMMENDATION — NOT OWNER APPROVED: A.** ไม่มี upload/bucket/signed URL ใน first slice หาก B ต้องกำหนด private Supabase Storage ownership/object namespace, server-derived owner, actual file MIME/magic-byte allowlist, byte/dimension limits, metadata stripping (EXIF/GPS), safe decode/re-encode, authenticated read/short-lived signed URLs/cache, deletion/retry/orphan cleanup และ backup retention ห้าม public bucket หรือ copy follow-up upload pattern โดยไม่มี review

### Q63 — Meal correction/delete/history

**FINAL OWNER DISPOSITION: CLOSED / OWNER APPROVED — Option A.**

ตัวเลือก: A edit current value + physical delete, no content revisions; B immutable revisions + deletion policy; C soft-delete/archive; D other

**RECOMMENDATION — NOT OWNER APPROVED: A.** SELF แก้ current entry หรือยืนยันลบ payload จาก active database; activity history = รายการเหตุการณ์ที่เหลือ ไม่ใช่ revision history ไม่มี restore/revision UI เก็บ minimized operation audit ตาม Q77 tradeoff: A ลด retained sensitive content แต่ไม่ reconstruct ก่อนแก้; B/C ช่วย trace แต่เก็บข้อความที่ผู้ใช้คิดว่าลบแล้ว ต้องปิด backup/audit retention และคำอธิบายการลบใน 17H.0B

### Q64 — Exercise record semantic

**FINAL OWNER DISPOSITION: CLOSED / OWNER APPROVED — Option A.**

ตัวเลือก: A one actually performed Patient-reported activity session; B daily aggregate; C Goal Plan completion; D other

**RECOMMENDATION — NOT OWNER APPROVED: A.** บันทึกสิ่งที่ทำจริง ไม่ใช่เป้าที่ตั้ง ไม่รับรองโดย provider และไม่ mark Goal item completed อนุญาตหลาย session ต่อวัน/ชื่อเดียวกันโดยแยก intentional submission กับ retry

### Q65 — Exercise activity vocabulary

**FINAL OWNER DISPOSITION: CLOSED / OWNER APPROVED — Option A.**

ตัวเลือก: A free-text activity; B controlled list; C common list + OTHER; D reuse Goal Plan codes; E other

**RECOMMENDATION — NOT OWNER APPROVED: A.** required plain-text activity name ไม่เกิน 120 characters; ยังไม่มี customer-approved controlled exercise list จึงไม่ copy exercise_walk/stretching/cardio/strengthening/hiit codes จาก care template B/C ต้องอนุมัติ list/version/OTHER semantics; D อาจผูก domain ที่มี authority ต่างกัน

### Q66 — Exercise measurement fields

**FINAL OWNER DISPOSITION: CLOSED / OWNER APPROVED — Option A.**

ตัวเลือก: A activity/date + optional duration minutes/note; B distance; C repetitions/sets; D intensity; E calories/heart rate; F ระบุ combination

**RECOMMENDATION — NOT OWNER APPROVED: A โดย duration เป็น optional.** legacy saveExerciseRecord มี exercise_minutes เป็น evidence อ่อนของ quantity แต่ไม่มี verified Patient write flow จึงไม่บังคับ duration; duration ถ้ามีเป็น positive finite integer minutes, ไม่ derive จาก targetValue; note optional ≤1,000 characters Distance/repetitions/sets/intensity deferred; calories/heart rate reject first slice ไม่มี fitness-device semantics และ technical numeric cap ต้องปิดใน 17H.0B

### Q67 — Exercise occurrence date/time/timezone

**FINAL OWNER DISPOSITION: CLOSED / OWNER APPROVED — Option A.**

ตัวเลือก: A date only; B date + local start time; C start/end instants; D other

**RECOMMENDATION — NOT OWNER APPROVED: A + Asia/Bangkok.** Patient เลือก civil occurrence date แยก optional duration อนุญาตย้อนหลัง ไม่อนาคต ไม่มี inference start/end หรือ midnight timestamp Duration ไม่ใช้แทน occurrence time; system recording timestamps ไม่เรียกเวลาออกกำลัง

### Q68 — Exercise correction/delete/history

**FINAL OWNER DISPOSITION: CLOSED / OWNER APPROVED — Option A.**

ตัวเลือก: A edit current + physical delete without revisions; B immutable correction revisions; C archive/soft-delete; D other

**RECOMMENDATION — NOT OWNER APPROVED: A.** own session history แบบ paginated; correction ไม่เขียน Goal Plan/Follow-up ยืนยันลบหนึ่ง session, stale edit/delete fail safely; ไม่มี restore หรือ retained exercise-note revisions ผล privacy/audit และ backup retention ต้องตกลงเหมือน Q63 โดยไม่สืบทอด care immutable rules

### Q69 — Weight goal semantic

**FINAL OWNER DISPOSITION: CLOSED / OWNER APPROVED — Option A.**

ตัวเลือก: A Patient-selected personal target; B clinician-agreed care target; C Hospital/program target; D display-only preference; E mixed authority

**RECOMMENDATION — NOT OWNER APPROVED: A หาก owner ยืนยัน customer intent.** บันทึกน้ำหนักเป้าหมายส่วนตัว ไม่อ้างว่าเป็นเป้าลดน้ำหนักที่แพทย์แนะนำ; ไม่มี required decrease เทียบน้ำหนักปัจจุบัน B/C/E ต้องใช้ care-authority contract แยก WELL-03 wording และ legacy “น้ำหนักลด” ยังไม่พออนุมัติ numeric target semantics

### Q70 — Weight unit

**FINAL OWNER DISPOSITION: CLOSED / OWNER APPROVED — Option A.**

ตัวเลือก: A kg only; B canonical kg + conversion/display units; C other

**RECOMMENDATION — NOT OWNER APPROVED: A.** kg สอดคล้อง current care/roster labels แต่ยังต้องอนุมัติสำหรับ personal target ไม่มี lbs หรือ generic unit framework ค่าต้อง finite positive, precision/range เป็น structural bounds ที่ 17H.0B ระบุ ไม่เป็น healthy-weight range

### Q71 — Weight target fields

**FINAL OWNER DISPOSITION: CLOSED / OWNER APPROVED — Option A.**

ตัวเลือก: A target weight + optional target date; B start weight; C desired change; D note/reason; E status; F ระบุ combination

**RECOMMENDATION — NOT OWNER APPROVED: A.** target kg required; targetDate เป็น optional civil date Asia/Bangkok ไม่เก็บ start weight/desired change เพราะไม่มี approved current source; note/reason deferred; status ไม่จำเป็นใน current-only model (Q72) ห้าม derive rate/deadline advice

**RECOMMENDATION — NOT OWNER APPROVED — กฎ targetDate ทั้งหมดด้านล่าง:**

- **Create:** หากระบุ targetDate ต้องไม่ก่อน current Asia/Bangkok civil date; วันนี้ใช้ได้
- **Edit — retain existing:** หาก targetDate เดิมผ่านไปตามเวลา Patient คงวันที่เดิมที่ไม่เปลี่ยนไว้ขณะแก้ field อื่น เช่น targetWeight ได้ การคงวันที่เดิมย้อนหลังต้องไม่ทำให้ validation fail
- **Edit — change date:** หาก Patient เปลี่ยน targetDate เป็นค่าใหม่ ค่านั้นต้องไม่ก่อน current Asia/Bangkok civil date; วันนี้ใช้ได้ การเปลี่ยนหรือลบวันที่ยังอยู่ภายใต้ SELF mutation policy ที่จะอนุมัติหาก Q71 ได้รับ owner approval ภายหลัง
- **No implicit lifecycle transition:** targetDate ที่ผ่านไปไม่ทำให้ goal complete/cancel/expire หรือได้รับ clinical interpretation; target ยังคงเป็น current target จน Patient explicit edit/replace/remove ตาม Q72 ไม่เพิ่ม OVERDUE/EXPIRED/COMPLETED state, automatic replacement, reminders, scoring, progress calculation หรือ clinician review workflow

### Q72 — Weight-goal lifecycle/cardinality

**FINAL OWNER DISPOSITION: CLOSED / OWNER APPROVED — Option A.**

ตัวเลือก: A zero or one current target, explicit edit/replace/remove, no prior-goal content history; B multiple targets; C active + completed/cancelled/replaced lifecycle/history; D other

**RECOMMENDATION — NOT OWNER APPROVED: A.** หนึ่ง current target ต่อ PatientProfile, atomic edit/replace ป้องกัน competing submissions และ explicit remove ได้ ไม่มี inferred achieved/completed เมื่อพบ measurement เปลี่ยน; previous sensitive values ไม่เก็บ revision history B/C ต้องมีเหตุผลของแต่ละ state ไม่ copy medication STOPPED

### Q73 — Source of current weight

**FINAL OWNER DISPOSITION: CLOSED / OWNER APPROVED — Option A.**

ตัวเลือก: A no automatic source; B personal weight observation; C latest Baseline; D latest Follow-up/Final; E selected hierarchy; F other

**RECOMMENDATION — NOT OWNER APPROVED: A.** target-only view ไม่แสดง current weight/progress/delta การอ่าน care weight ที่อื่นยังมี source label/สิทธิ์ของ domain เดิม C/D/E มีหลาย Hospital/Program/time semantics จึงไม่เลือก “latest” แบบไร้ source contract; ห้ามเรียก care observation ว่า Patient บันทึกเอง และไม่เขียนกลับ Baseline/Follow-up

### Q74 — Personal weight observation

**FINAL OWNER DISPOSITION: CLOSED / OWNER APPROVED — Option A.**

ตัวเลือก: A NO ใน first 17H scope (target only); B YES พร้อม separate domain contract; C future separate slice

**RECOMMENDATION — NOT OWNER APPROVED: A; C ยัง future-gated.** หาก B: owner ต้องระบุ persisted SELF ownership/creator, measuredAt หรือ civil date/time + timezone (ไม่ใช้ createdAt แทน), kg/precision/range, correction/delete/revisions, read matrix, retention, provenance label และ no overwrite E/F; วาง record แยก Weight Goal พร้อม validation/audit/concurrency tests ไม่มีการอนุมัติ B จาก WELL-03 หรือ legacy optional weight helper

### Q75 — BMI

**FINAL OWNER DISPOSITION: CLOSED / OWNER APPROVED — Option A.**

ตัวเลือก: A excluded; B derived display-only; C persisted; D clinically interpreted

**RECOMMENDATION — NOT OWNER APPROVED: A.** Phase 17A/15D.2 ยัง gate formula/source/meaning; การมี heightCm ไม่ปิด gate B ต้องระบุ height/weight provenance และ formula/version/time contract; C/D เพิ่ม source-of-truth/clinical governance ห้าม store/interpret BMI ใน first wellness slice

### Q76 — Recommendations / scoring

**FINAL OWNER DISPOSITION: CLOSED / OWNER APPROVED — Option A.**

ตัวเลือก: A exclude all automated nutrition/fitness/clinical scoring/advice; B specify separately approved features

**RECOMMENDATION — NOT OWNER APPROVED: A.** ไม่รวม calorie targets, diet/exercise scoring, weight-loss advice, BMI classification, healthy/unhealthy judgments หรือ automated clinical advice ไม่ copy legacy percentage/adherence และไม่สร้าง coaching/diagnosis/treatment behavior

### Q77 — Audit policy

**FINAL OWNER DISPOSITION: CLOSED / OWNER APPROVED — Option A.**

ตัวเลือก: A minimized mutation/lifecycle audits; B content/value snapshots; C no durable audits; D other

**RECOMMENDATION — NOT OWNER APPROVED: A.** create/update/delete meal/session และ create/update/replace/remove target ที่เปลี่ยน state จริง ทำ atomic AuditEvent; retry/NOOP ไม่ audit ซ้ำ ไม่มี ordinary durable per-read event Metadata มี operation, actor, opaque resource ID, event time และ version ตามจำเป็น ไม่ meal text/photo, activity/note, weight value, target date, health reason หรือ payload hash ที่เดาค่าได้ Retention/access ของ audit และ backup ต้องปิดใน 17H.0B; audit ไม่ควรกลายเป็นวิธีกู้ sensitive payload ที่ลบแล้ว

### Q78 — Export/sharing

**FINAL OWNER DISPOSITION: CLOSED / OWNER APPROVED — Option A.**

ตัวเลือก: A deferred; B SELF export/print; C explicit grants to Family/Hospital/OSM; D external API; E other

**RECOMMENDATION — NOT OWNER APPROVED: A.** ไม่เพิ่ม export/print feature/share/caregiver read/external API; browser print/screenshot ที่ผู้ใช้ทำเองห้ามอ้างว่าระบบป้องกันได้ Future disclosure ต้องมี purpose, minimal fields, acceptance/revoke, retention และ privacy/controller review แยก Q5 เดิมไม่ได้อนุมัติ wellness sharing

### Q79 — Reporting / analytics

**FINAL OWNER DISPOSITION: CLOSED / OWNER APPROVED — Option A.**

ตัวเลือก: A excluded from existing reporting; B Hospital dashboard; C Program report/outcome; D adherence score; E population analytics; F other

**RECOMMENDATION — NOT OWNER APPROVED: A.** ไม่ feed personal records เข้า existing report projections/dashboard/cohort หรือ clinical outcome/adherence score Self list/history เป็น journal query ไม่ใช่ authorization ให้ analytics; future projection ต้องอนุมัติ source/meaning/visibility ใหม่

### Q80 — Reminder / notification boundary

**FINAL OWNER DISPOSITION: CLOSED / OWNER APPROVED — Option A.**

ตัวเลือก: A no reminder source in first slice; B future source/state only after explicit source contract; C other

**RECOMMENDATION — NOT OWNER APPROVED: A.** หากต้องการภายหลัง 17H อาจเป็น owner ของ well-defined source/state เฉพาะที่อนุมัติ; 17J เป็น owner delivery policy/channel/system authority ไม่ส่ง LINE/email/SMS/push และไม่ reuse medication occurrence โดยปริยาย

### Q81 — Privacy/cache

**FINAL OWNER DISPOSITION: CLOSED / OWNER APPROVED — Option A.**

ตัวเลือก: A exact SELF + private request-scoped reads and safe denial; B broader caching/access (ระบุ contract)

**RECOMMENDATION — NOT OWNER APPROVED: A.** no cross-actor cache reuse; ห้าม journal text/weight ใน URL/log; server-derived owner, opaque ID เป็น locator ไม่ใช่ token; foreign/missing ID ให้ safe equivalent denial; recheck persisted identity ทุก read/write/cursor continuation ไม่มี shared persistent payload cache/browser durable draft และ clear client state บน logout/account switch (รายละเอียด section 10)

### Q82 — Route / UX

**FINAL OWNER DISPOSITION: CLOSED / OWNER APPROVED — Option A.**

ตัวเลือก: A Personal-context `/app/personal/wellness` พร้อม bounded sections; B separate Personal destinations; C care/Goal Plan destination; D other

**RECOMMENDATION — NOT OWNER APPROVED: A.** อาหาร / การออกกำลังกาย / เป้าหมายน้ำหนัก แยกจาก care plan และ Work; route ยังไม่สร้าง Navigation visibility ไม่ใช่ authority ใช้ mobile-first states ตาม section 12; copy ไม่อ้าง professional nutrition/exercise/medical advice

### Q83 — First implementation boundary

**FINAL OWNER DISPOSITION: CLOSED / OWNER APPROVED — Option A.**

ตัวเลือก: A sequential domain slices after owner closeout; B combined implementation; C other split

**RECOMMENDATION — NOT OWNER APPROVED: A.** 17H.0 analysis → 17H.0B owner closeout + first contract → 17H.1 Meal → 17H.2 Exercise → 17H.3 Weight Goal (Observation เฉพาะ Q73/Q74 approve) → 17H.4A automated authorization/security/DB/privacy re-audit + UAT-readiness ไม่มี slice cleared ใน pack นี้

## 8. Proposed records / data minimization

**RECOMMENDATION — NOT OWNER APPROVED — ใช้กับทุกแถวด้านล่าง.** ชื่อ field เป็น conceptual proposal ไม่ใช่ Prisma design ค่าที่เป็น REQUIRED เป็น minimum ของ proposed record หาก approved; OPTIONAL ยังไม่ถือว่า included คำตอบ owner ต้องระบุรวม/ไม่รวมให้ชัด

| Record / field | Classification | เหตุผล / decision |
| --- | --- | --- |
| ทุก record: opaque id | REQUIRED FOR FIRST SLICE | locate exact resource โดยไม่เปิด identity |
| ทุก record: persisted PatientProfile owner | REQUIRED FOR FIRST SLICE | server-derived SELF; ไม่รับ owner จาก browser, ไม่มี transfer (Q55/81) |
| ทุก record: createdAt/updatedAt system instants | REQUIRED FOR FIRST SLICE | persistence provenance ไม่แทน occurrence date |
| ทุก record: conflict version / retry identifier ตาม operation | REQUIRED FOR FIRST SLICE | stale write/retry safety; เป็น technical metadata ไม่ clinical history; exact strategy/retention ใน 17H.0B |
| ทุก record: copied name/National ID/HN/HospitalId/ProgramId/GoalItemId | REJECT FOR FIRST SLICE | ไม่จำเป็นกับ personal owner; ป้องกัน scope/linkage confusion |
| Meal: occurrence date | REQUIRED FOR FIRST SLICE | journal day civil date Q60 |
| Meal: BREAKFAST/LUNCH/DINNER/SNACK category | REQUIRED FOR FIRST SLICE | customer vocabulary Q59 |
| Meal: description/note (หนึ่งช่อง) | OPTIONAL IF OWNER APPROVES | เล่าสิ่งที่บริโภค ≤1,000 characters; ไม่สร้าง note สองช่องซ้ำ (Q61) |
| Meal: local time/instant/timezone ต่อ record | DEFERRED | proposed date-only + fixed Bangkok ไม่ต้องมี guessed event time |
| Meal: portion/quantity | DEFERRED | ต้องมี quantity/unit semantics ไม่อนุมานจากชื่ออาหาร |
| Meal: structured food items | DEFERRED | ยังไม่มี accepted catalog/source contract |
| Meal: nutrition/macros/calories | REJECT FOR FIRST SLICE | ไม่มี approved engine/formula/intake completeness |
| Meal: photo/storage metadata | DEFERRED | Q62=A; ไม่มี infrastructure-only upload |
| Meal: location | REJECT FOR FIRST SLICE | ไม่จำเป็นและเพิ่ม location privacy risk |
| Meal: tags | DEFERRED | ไม่มี product evidence ของ vocabulary |
| Meal: immutable revisions / archive / deletedAt | DEFERRED | Q63=A current + physical delete ไม่ต้องมี hidden retained payload |
| Exercise: activity name | REQUIRED FOR FIRST SLICE | required bounded plain text ≤120 (Q65); ไม่มี Goal code |
| Exercise: occurrence date | REQUIRED FOR FIRST SLICE | actual performed day Q67 |
| Exercise: duration minutes | OPTIONAL IF OWNER APPROVES | legacy helper quantity evidence แต่ไม่ mandatory; finite positive integer; cap ต้อง approve |
| Exercise: note | OPTIONAL IF OWNER APPROVES | context ของตน ≤1,000 characters ไม่ fitness assessment |
| Exercise: controlled activity code/list | DEFERRED | ต้องตัดสิน vocabulary/version ถ้าเลือก Q65 B/C |
| Exercise: distance | DEFERRED | ไม่มี approved unit/source |
| Exercise: repetitions | DEFERRED | semantics ต่อ session/activity ยังไม่กำหนด |
| Exercise: sets | DEFERRED | ไม่มี accepted repetitions/set relation |
| Exercise: intensity | DEFERRED | subjective scale/meaning ยังเปิด |
| Exercise: calories | REJECT FOR FIRST SLICE | ไม่ estimate metabolic expenditure |
| Exercise: heart rate / device source | REJECT FOR FIRST SLICE | ไม่มี device/clinical acquisition contract |
| Exercise: start/end local time/instant | DEFERRED | duration แยก date; ไม่สร้าง end time จาก guessed start |
| Exercise: GPS/location | REJECT FOR FIRST SLICE | ไม่จำเป็นกับ journal intent |
| Exercise: correction revisions / archive | DEFERRED | Q68=A ไม่เก็บ historical note revisions |
| Weight Goal: target weight in kg | REQUIRED FOR FIRST SLICE | personal target Q69/70; positive finite decimal; precision/cap ยังรอ closeout |
| Weight Goal: target date | OPTIONAL IF OWNER APPROVES | Q71; civil date Asia/Bangkok; create/เปลี่ยนเป็นค่าใหม่ต้องไม่ก่อนวันนี้ (วันนี้ได้); วันที่เดิมที่ผ่านไปคงไว้ขณะแก้ field อื่นได้; ไม่ trigger lifecycle/advice |
| Weight Goal: start weight | DEFERRED | Q73 ไม่มี current source; ไม่ซ่อน observation ใน target record |
| Weight Goal: desired change | REJECT FOR FIRST SLICE | derived redundant field ที่ต้องมี start/current source |
| Weight Goal: note | DEFERRED | ไม่มี evidence ว่าจำเป็น |
| Weight Goal: reason | DEFERRED | เสี่ยง sensitive health text โดยไม่มี purpose |
| Weight Goal: status / completed/cancelled/replaced timestamps | DEFERRED | current-only cardinality Q72; ไม่มี inferred lifecycle |
| Weight Goal: previous target content/history | DEFERRED | Q72=A; edit/remove ลด retained values |
| Personal Weight Observation: domain และทุก field | DEFERRED | Q74=A ไม่อยู่ first scope; ถ้า YES ต้อง classify ownership/value/unit/time/correction/privacy ใหม่ก่อน implement |
| ทุก record: BMI, healthy/unhealthy, adherence/clinical score | REJECT FOR FIRST SLICE | Q75/76/79 ไม่มี formula/authority |

**RECOMMENDATION — NOT OWNER APPROVED:** เก็บ journal จน SELF ลบและ target จน SELF แก้/ลบ; ไม่เพิ่ม auto-expiry โดยไร้ requirement 17H.0B ต้องปิด payload bounds, weight precision, duration cap, account closure/erasure, audit/retry metadata retention และ backup expiry กับ responsible owner ก่อนส่ง implementation contract ไม่อ้างว่า physical delete ลบทุก backup ทันที การอนุมัติ field ไม่อนุมัติ unrestricted retention

## 9. Proposed authorization matrix

**RECOMMENDATION — NOT OWNER APPROVED — ทุกแถวเป็น proposed future matrix; ไม่ใช่ current wellness runtime.** Operations ใช้เฉพาะ lifecycle ที่ Q63/68/72 approve และ Observation ไม่ included หาก Q74=A

| Actor / target | List/detail/history | Create | Update/delete/replace/remove | Sharing/export/report |
| --- | --- | --- | --- | --- |
| ACTIVE persisted Patient SELF ของ exact PatientProfile | own only | own only | own only + conflict guard | deferred/denied |
| Patient A ต่อ records Patient B | deny | ห้ามระบุ B เป็น owner | deny | deny |
| Hospital MEMBER ต่อ Patient ใน direct scope | deny | deny | deny | deny |
| Hospital OWNER ต่อ Patient ใน direct scope | deny | deny | deny | deny |
| exact assigned OSM | deny | deny | deny | deny |
| active Family/caregiver relationship | deny | deny | deny | deny |
| caregiver มี family-appointment-read-v1 | deny | deny | deny | deny |
| routine Platform ADMIN | deny | deny | deny | deny |
| PATIENT + HOSPITAL / PATIENT + OSM | own SELF only; role Work ไม่ขยาย | own only | own only | deferred/denied |
| ADMIN + PATIENT หาก persisted SELF มีจริง | evaluate SELF เฉพาะของตน ไม่มี ADMIN bypass | own only | own only | deferred/denied |
| suspended/missing account, removed PATIENT role, mismatched User/Person, missing profile | deny | deny | deny | deny |
| future explicit share/grant | ไม่ implement จาก pack นี้ | ไม่มี authority อัตโนมัติ | ไม่มี authority อัตโนมัติ | new contract required |

**RECOMMENDATION — NOT OWNER APPROVED:** ทุก operation re-resolve authoritative ACTIVE User + persisted PATIENT role + exact User↔Person↔PatientProfile จาก server resource predicate มี owner เสมอ Mutation rechecks ใน transaction พร้อม current version; ไม่มี owner-transfer operation Hospital suspend/assignment removal ไม่ย้าย personal ownership หาก account/SELF ยัง eligible; แต่ actor status/role เปลี่ยนต้อง deny ทันทีจาก fresh authority ไม่พึ่ง cached ActorContext

## 10. Security/privacy threat review

**RECOMMENDATION — NOT OWNER APPROVED — mitigation และ future verification ทุกแถว.** เป็น design threat analysis ไม่มี automated authorization/DB/privacy PASS สำหรับ wellness ใน phase นี้

| Threat / concrete attempt | Proposed mitigation / future evidence |
| --- | --- |
| Patient A ใช้ B ID อ่าน/แก้/ลบ | owner predicate ทั้ง list/detail/write/history; foreign/missing safe equivalent not-found; negative read/write tests |
| Hospital MEMBER/OWNER เดา ID แม้ direct care scope | separate wellness SELF boundary; ไม่ fallback goal/program policy; Work actor matrix tests |
| assigned OSM เดา ID | assignment ไม่ grant wellness; deny ทั้ง route/service/query; assigned/unassigned cases |
| Family active relationship / appointment-read grant | allowlist appointment-only ไม่ extend; deny wellness identifiers และไม่มี wellness join ใน delegated DTO |
| PATIENT+HOSPITAL หรือ PATIENT+OSM สลับ context | own SELF predicates คงเดิม; ไม่ union Work scope; own succeeds/other fails tests |
| routine ADMIN ใช้ support/work path | ไม่มี routine access capability หรือ privileged bypass; trusted operational DB access ต้องอยู่ governance แยก ไม่ใช่ app read permission |
| stale ownership หลัง role/account/identity change | fresh persisted checks ทุก request/transaction; mismatched binding fail closed; ไม่มี transfer ตาม client owner/role |
| suspended account | authentication + ACTIVE authoritative check ก่อน read/write; reject stale session/removed PATIENT role |
| direct URL / action submission โดยไม่เห็นเมนู | server page/action/service authorization independently; route visibility ไม่ security boundary |
| cursor/resource-ID tampering | cursor schema/bounds, actor/owner/filter binding และ authenticated codec ตาม convention; owner-scoped anchor check, fresh authority ทุก continuation; cursor ไม่ grant access |
| cache หลัง logout/account switch | no shared persistent sensitive cache/static projection; no cross-actor keys; no localStorage/IndexedDB durable journal draft; clear form/list state, reauthorize back/forward/navigation |
| browser history/cache เก็บข้อมูล | opaque locators เท่านั้นใน URL; private/no-store sensitive response strategy ตาม framework guidance ใน implementation; redact error/telemetry; browser back/BFCache QA ต้องแยกจาก server access proof ห้ามรับรองว่า erased ทุก device snapshot |
| deleted/archived record กลับมาใน history | proposed physical delete: pagination/query ไม่คืน deleted payload; stale cursor safely restart/deny; restored backup ต้องรักษา erasure policy ไม่ resurrect silently ถ้า owner เลือก archive ต้องนิยาม read filters/restore ใหม่ |
| concurrent edit/delete/replace และ retry | version guard, bounded retry-safe submissions, transaction + atomic audit; deleted resource ไม่ upsert คืนจาก stale request; competing target creates ไม่เกิดสอง current targets |
| audit/log leakage | allowlist metadata, no payload/value/health note/photo URL/hash; errors sanitized; generic telemetry ไม่ dump form/database row; audit access/retention restricted |
| photo URL leakage ถ้า Q62=B | private ownership-checked object read, short-lived signed URLs, no URL logs/analytics/cache reuse, revoke/delete lifecycle; metadata strip และ orphan cleanup contract; Q62=A ไม่สร้าง asset |
| reporting ขยาย visibility | no wellness import/join into Program/Hospital/analytics; automated boundary assertions หลัง approval |
| Goal Plan linkage ทำให้ provider มี authority | ไม่วาง wellness ใต้ relationship/Program-owned query และไม่ FK ไป Goal item ใน first proposal; future projection แยก read contract |
| free text injection / oversize input | bounded plain text, safe rendering, no HTML/Markdown execution, strict field allowlist; size/abuse protection ก่อน auth/parsing ตาม repo; reject unexpected owner/status/clinical fields |
| misleading clinical certainty | source labels “ข้อมูลที่คุณบันทึก” / “เป้าหมายส่วนตัว”; no medical/nutrition score; absence of record ไม่เท่ากับไม่ได้กิน/ไม่ได้ออกกำลัง |

**RECOMMENDATION — NOT OWNER APPROVED:** reuse shared abuse/transaction/error/audit/form-validation conventions หลังตรวจ semantic fit; privacy-safe rate-limit diagnostics ไม่เก็บเนื้อหา wellness ต้องกำหนด accountable retention/erasure owner และ deployment-level protection ใน 17H.0B ไม่มี legal-compliance certification จาก pack นี้

## 11. Goal Plan / clinical-measurement separation

**Invariant สำหรับการอ่านหลักฐานและการไม่ขยาย scope ใน analysis นี้:**

> Personal wellness data **!=** clinical/program measurement **!=** Goal Plan target

- Meal journal entry ไม่พิสูจน์ Goal Plan food adherence
- Exercise journal entry ไม่พิสูจน์ exercise target completion
- Patient-entered weight (หาก approved ภายหลัง) ไม่ overwrite PatientBaseline หรือ Follow-up
- Weight goal ไม่ rewrite PatientGoalPlan
- Goal Plan item ไม่กลายเป็น personal journal record
- “บันทึกน้ำหนักและน้ำตาล” ใน care template เป็น *planned activity* ไม่ใช่ measured weight หรือ SELF observation domain

Current template “ลดหวาน”, “ลดข้าว/แป้ง”, “เพิ่มโปรตีนและผัก”, “ควบคุมคาร์โบไฮเดรต”, “ดื่มน้ำ”, “เดินออกกำลังกาย”, “ยืดเหยียด”, cardio, strengthening, HIIT และ “บันทึกน้ำหนักและน้ำตาล” เป็น E ทั้งหมด แม้ label คล้าย A/B/D และ primary weight reduction ก็ไม่ใช่ C numeric target

Baseline recordedOn เป็น date-only observation provenance; Follow-up/Final recordedAt เป็น application persistence time ไม่ใช่ยืนยัน measured-at time ที่สร้างใหม่ได้ Care/program records เป็น raw facts/provisional measurement semantics ไม่รับรอง clinical truth เพราะเก็บใน care module การให้ Patient SELF อ่านได้ไม่เปลี่ยน authorship

**RECOMMENDATION — NOT OWNER APPROVED:** หากต้องการ relation ในอนาคต ใช้ explicit read projection/contract พร้อม source, purpose, authority, unit/time semantics, conflict และ provenance; ไม่ใช้ shared mutable source-of-truth ไม่เลือก latest weight ข้าม Hospital/Program และไม่เอา personal journal มาเติม missing Before/After report source

## 12. UX/navigation recommendation

**RECOMMENDATION — NOT OWNER APPROVED — ทั้ง UX proposal นี้.** ใช้ Impeccable planning principles, current Personal workspace และ DEMI UI foundation; mode Operate สำหรับ Patient ที่บันทึก/ทบทวนตนเองบน mobile ไม่สร้าง UI ใน phase นี้

- Personal destination `/app/personal/wellness` ด้วย sections **อาหาร / การออกกำลังกาย / เป้าหมายน้ำหนัก**; อยู่นอก care relationship/Work destination ใช้ existing PageHeader/Panel/forms/status/error patterns และ Thai design tokens
- Meal/exercise แสดง dated list/history แบบ bounded pagination, primary “บันทึกมื้ออาหาร” / “บันทึกการออกกำลังกาย”; target แสดง “น้ำหนักเป้าหมายส่วนตัว (kg)” ไม่มี progress chart/current-weight card เมื่อ Q73/Q74 ไม่อนุมัติ source
- Day/category ไม่ preselect เป็นข้อเท็จจริงจน Patient review; ไม่ derive มื้อจากนาฬิกา ไม่เดาชื่อกิจกรรมจาก Goal Plan Patient เลือกวันย้อนหลังได้ตาม proposed time contract
- Copy “ข้อมูลที่คุณบันทึก” และ “เป้าหมายส่วนตัว” ไม่บอก “ทำได้ตามแผน”, “สุขภาพดี/ไม่ดี”, “เหมาะสมทางการแพทย์” หรือ “ควรลดน้ำหนัก” ไม่มี goal/streak/compliance badges

| State | Proposed interaction / truthfulness |
| --- | --- |
| Empty | “ยังไม่มีบันทึก” + action ที่ approved; ไม่บอกไม่ได้กิน/ออกกำลัง |
| Loading | neutral pending state ไม่แสดงค่าของ actor คนก่อน |
| Create | labeled fields, date/unit explanation, server validation และ review ก่อน submit |
| Edit | load exact own current value/version; คง targetDate เดิมที่ผ่านไปได้ตาม Q71 โดยไม่บังคับเปลี่ยนวันที่เมื่อแก้ targetWeight; ไม่เดา prior clinical facts |
| Delete / cancel | confirm irreversible record removal ตาม approved lifecycle; cancel form ไม่ใช่ cancelled clinical state; target remove ไม่ใช่ completed goal |
| Validation error | Thai field-level message, retained in-memory draft, focus summary; no internal details |
| Save success | แสดง persisted readback เมื่อ commit สำเร็จ; pending ป้องกัน accidental repeat ไม่อ้างสำเร็จก่อน response |
| Stale / conflict | ข้อมูลเปลี่ยนแล้ว ให้โหลดใหม่และ review; ไม่ overwrite silent ไม่ recover deleted record ด้วย upsert |
| Denied / not-found | safe generic state ไม่ disclose owner/existence; suspended actor ไม่ได้ form |
| History | exercise/meal event history หาก approved; ไม่มี revision/prior-target history ใน Q63/68/72 A |

**RECOMMENDATION — NOT OWNER APPROVED:** mobile single-column forms, visible units/date labels, keyboard/focus/accessible status messaging และ loading/error/disabled states ใช้ primitives เดิม Navigation ไม่ปรากฏก่อน capability มีจริง ไม่มี fake/dead wellness CTA ก่อน approval; usability/device UAT ต้องทำหลัง implementation ไม่อ้างผ่านจากเอกสาร

## 13. First-implementation non-goals

**RECOMMENDATION — NOT OWNER APPROVED — exclusions ของ proposed first slices.**

- ไม่มี clinical/prescribed nutrition/exercise/weight target, automatic care-plan completion/sync หรือ write-back measurement
- ไม่มี nutrition ontology/food database/calorie/macros engine, fitness-device sync, Apple Health/Google Fit, GPS/heart-rate tracking, coaching/weight-loss algorithm, diagnosis/treatment/clinical interpretation
- ไม่มี BMI storage/formula/classification, adherence/diet/exercise/healthy-unhealthy scoring
- ไม่มี meal image/storage support, external export/print/share, caregiver/Hospital/OSM visibility หรือ external API
- ไม่มี notification delivery LINE/email/SMS/push, reminder source หรือ implicit reuse medication source; 17J gated
- ไม่มี personal weight observations/charts/current-weight hierarchy เมื่อ Q73=A/Q74=A; ไม่มี generic WellnessEntry/EAV framework
- ไม่มี reopening 17G, 17F/Q5, MED-02, consent หรือ reporting gates

## 14. Proposed implementation slices after approval

**RECOMMENDATION — NOT OWNER APPROVED — roadmap ทุกแถวเป็นเงื่อนไขหลัง approval.**

| Slice | Proposed outcome / prerequisite |
| --- | --- |
| 17H.0 | decision analysis เท่านั้น — pack นี้เสร็จ ไม่ clear implementation |
| 17H.0B | explicit Q54–Q83 closeout; record alternatives/deferred decisions; close first-slice technical bounds, privacy/retention/backup policy, account erasure, retry/conflict semantics และ approved implementation contract; ไม่ถือว่าทุก option ถูกเลือกเพราะส่ง template กลับ |
| 17H.1 | Personal Meal Journal เฉพาะ approved fields/time/lifecycle, exact SELF policy, server validation, persistence, audit, cursor/readback, mobile states; focused behavioral/DB/authorization/privacy verification |
| 17H.2 | Personal Exercise Journal/history แยก model/semantic validation; ไม่ reuse Goal activity target codes/authority; quantity เฉพาะ field ที่ approved |
| 17H.3 | Personal Weight Goal แบบ approved cardinality/unit; Observation เฉพาะ Q73/Q74 explicit YES และ observation contract ปิดแล้ว หากยังไม่พร้อมให้แยก follow-on slice โดยไม่ block target-only |
| 17H.4A | automated authorization/security/DB/privacy re-audit + UAT-readiness; actor matrix/IDOR/concurrency/retry/delete/cache/reporting separation evidence แล้วจัด manual mobile/browser/device UAT track แยก ไม่อนุมาน UAT PASS |

**RECOMMENDATION — NOT OWNER APPROVED:** split ตาม domain ลด semantic ambiguity สอดคล้องสาม WELL intents ไม่มี evidence ให้รวมเป็น universal event model Reuse เฉพาะ SELF actor-resolution conventions, transaction helper, audit infrastructure, cursor conventions, application errors และ form validation utilities ที่ responsibility ตรงจริง ห้าม lower layers import UI และห้ามสร้าง speculative shared helper เพื่อจำนวนไฟล์น้อยลง

## 15. Validation performed

Documentation-focused validation เท่านั้น:

1. อ่าน AGENTS.md ก่อน source review; `git status --short`, `git rev-parse HEAD`, `git remote -v`, `git log -3 --oneline`, `git diff --stat` ยืนยัน starting HEAD ตรงและ tree สะอาด ไม่มี newer user commit/work ให้ overwrite
2. `git ls-remote` และ temporary shallow checkout pin legacy HEAD; deliberate keyword search, persistence/helper caller search และอ่าน Goal/history/Baseline/Follow-up/dashboard/query snippets ไม่ใช้ legacy auth/schema เป็น contract ไม่เปิด live legacy database
3. ตรวจ actual file inventory ของ goals/baseline/followups/final/reporting/Personal routes และ schema; cross-check source กับ CONTEXT, 17A, UAT backlog, 15A data-map, 15D.2/15E และ later 16D.2 context
4. ตรวจ local Markdown targets รวม percent-encoded dynamic-route paths และ pinned legacy source links กับ checkout inventory; legacy repository/HEAD ยืนยันจาก Git remote ไม่ได้อ้าง browser/deployed behavior
5. ตรวจ decision headings/template Q54–Q83 ครบ 30 ข้อ, explicit NOT OWNER APPROVED labels, requirement gates และไม่มีข้อความ owner-approved wellness/implementation clearance
6. ตรวจ strict UTF-8 decoding, new pack UTF-8 without BOM, existing document BOM/line-ending/content preservation และไม่มี replacement character; review final diff/status มีเพียง 3 documentation files
7. ไม่ execute unit/integration suite, Prisma validate/generate/migrate, lint/typecheck, Next build หรือ dev server ตาม documentation-only scope ไม่มี runtime/schema/migration/test/env change, commit หรือ push

ข้อขัดแย้ง/หลักฐานเก่าที่พบ: 15D.2 historical “no height” ไม่ใช่ current schema หลัง 16D.2; 17A/17G.0 historical “not implemented” ไม่ใช่ current medication status หลัง 17G.4A ไม่แก้ accepted historical statements; ใช้ dated CURRENT addenda และ source baseline นี้ ไม่พบข้อขัดแย้งกับ current WELL gates หรือ E/F boundaries จากการตรวจที่ระบุ

ข้อจำกัด: ไม่มี original whiteboard image ใหม่, live legacy DB, runtime wellness, executed wellness security tests, browser/device UAT หรือ owner decision จึงไม่มี clinical/production/privacy-compliance PASS จาก phase นี้ Numeric caps/retention operational details ที่เปิดอยู่ต้องปิดใน 17H.0B ก่อน implementation

## 16. Final disposition — updated by 17H.0B

**Phase 17H.0 — CLOSED / DECISIONS CLOSED**<br>
**Q54–Q83 — CLOSED / OWNER APPROVED — Option A**<br>
**Phase 17H.0B — CLOSED / DOCUMENTATION CONTRACT COMPLETE**<br>
**WELL-01 — CLEARED FOR IMPLEMENTATION through the 17H.1 contract**<br>
**Phase 17H.1 — CLEARED FOR IMPLEMENTATION / NOT IMPLEMENTED**<br>
**WELL-02 — DECISIONS CLOSED / PLANNED 17H.2 / NOT IMPLEMENTED**<br>
**WELL-03 — DECISIONS CLOSED / TARGET-ONLY PLANNED 17H.3 / NOT IMPLEMENTED**<br>
**Personal Weight Observation — DEFERRED / NOT APPROVED FOR FIRST 17H SCOPE**

Corrected Q71 Option A remains binding: create/newly changed targetDate >= current Asia/Bangkok civil date, today allowed; unchanged naturally passed targetDate may remain on edit without validation failure. Passing the date causes no automatic complete/expire/overdue/cancel, clinical interpretation, reminder, scoring or automatic progress. No blanket ban on unchanged past dates on edit.

ไม่มี runtime/schema/migration/test/env เปลี่ยน Phase 17G.4A PASS / COMPLETE, Family/Q5/Consent/MED-02/17J gates และข้อจำกัด manual/device-UAT คงเดิม งานนี้ปิด owner decisions และ clear Meal contract เท่านั้น ยังไม่ใช่ Wellness implementation หรือ UAT PASS.

## 17. Historical compact owner-response template (superseded by explicit approval)

**RECOMMENDATIONS ONLY — NOT OWNER APPROVED**<br>
**RECOMMENDATION — NOT OWNER APPROVED — ทุกบรรทัดใน template นี้.**

คัดลอกเพื่อ review/ตอบ เปลี่ยนข้อที่ไม่เห็นด้วยและระบุ approved/deferred/rejected ให้ชัด การคัดลอก template หรือส่งรับทราบไม่ถือเป็น approval เอง หากเลือกต่างจาก first-slice recommendation ให้ระบุ field/actor/lifecycle/source ที่เปลี่ยนด้วย

```text
RECOMMENDATIONS ONLY — NOT OWNER APPROVED
Owner disposition: [explicit APPROVE / APPROVE WITH CHANGES / DEFER]
Q54: A — personal self-tracking, ไม่ clinical truth
Q55: A — creator/editor/deleter Patient SELF only
Q56: A — SELF only; future explicit grants gated
Q57: A — independent from Goal Plan; no sync/completion
Q58: A — one reported consumed meal/snack; multiple entries allowed
Q59: A — BREAKFAST/LUNCH/DINNER/SNACK
Q60: A — occurrence date only, Asia/Bangkok, past allowed/no future
Q61: A — optional plain-text description ≤1,000; richer fields deferred/excluded
Q62: A — photos deferred
Q63: A — edit current + physical delete, no content revisions
Q64: A — one actually performed reported exercise session
Q65: A — free-text activity name ≤120; no Goal activity-code reuse
Q66: A — optional duration minutes + note ≤1,000; numeric cap pending 17H.0B
Q67: A — occurrence date only, Asia/Bangkok; duration separate
Q68: A — edit current + physical delete; event history, no revisions
Q69: A — Patient-selected personal target, subject to intent confirmation
Q70: A — kg only; precision/range pending 17H.0B
Q71: A — target weight + optional Asia/Bangkok target date; create/new date >= today; unchanged passed date may be retained on edit
Q72: A — 0..1 current target; edit/replace/remove; no prior-target history
Q73: A — no automatic current-weight source/progress
Q74: A — NO personal weight observation in first 17H scope
Q75: A — BMI excluded
Q76: A — all automated nutrition/fitness/clinical scoring/advice excluded
Q77: A — atomic minimized mutation audit; no sensitive payload/value metadata
Q78: A — export/print feature/sharing/external API deferred
Q79: A — excluded from Hospital/Program/outcome/adherence/population reporting
Q80: A — no reminder source/delivery; future source contract + 17J separate
Q81: A — fresh exact persisted SELF; private reads/no cross-actor cache/safe denial
Q82: A — proposed /app/personal/wellness; อาหาร/การออกกำลังกาย/เป้าหมายน้ำหนัก
Q83: A — 17H.0B closeout → Meal → Exercise → Target → automated re-audit/UAT readiness
17H.0B open details: numeric bounds/precision, retention/backup/erasure,
retry/conflict metadata and approved first implementation contract
Owner changes / deferred items: [...]
```

ก่อนรับ explicit owner approval สถานะยังเป็น **OPEN / NOT OWNER APPROVED; WELL-01/02/03 REQUIREMENT-GATED; 17H.1 NOT CLEARED FOR IMPLEMENTATION**
