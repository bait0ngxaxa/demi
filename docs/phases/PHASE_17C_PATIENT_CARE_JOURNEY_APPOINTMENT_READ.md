# DEMI Phase 17C — Patient Care Journey & Appointment Read

- สถานะ: **IMPLEMENTED — VERIFIED**
- วันที่ handoff: 2026-09-29
- Baseline: `1d80686c9232fbc1d7fae54f7fc2de1b108fd6c7` — Phase 17B closed
- Product contract: [Phase 17A Customer Flow Canonicalization UAT Contract](./PHASE_17A_CUSTOMER_FLOW_CANONICALIZATION_UAT_CONTRACT.md)
- Previous foundation: [Phase 17B Patient Workspace & Own-Scope Foundation](./PHASE_17B_PATIENT_WORKSPACE_OWN_SCOPE_FOUNDATION.md)
- Backlog: [Phase 17 UAT Backlog](./PHASE_17_UAT_BACKLOG.md)

## Goal

ขยายพื้นที่ Personal เป็นทางอ่านประวัติการดูแลและนัดหมายของ Patient แบบ read-only โดยอ่านจาก canonical records ชุดเดียวกับ Hospital/OSM Work และตรวจ SELF ownership ฝั่ง server ทุก request. ไม่มี Patient write authority, copied records, timeline persistence หรือ schema/migration ใหม่.

Phase 17A ยังคงเป็นสัญญา product/UAT; Phase 17B ยังคงเป็นฐาน Patient self-scope. Handoff นี้บันทึกเฉพาะ implementation ของ read slice ที่อนุมัติแล้ว และไม่เปลี่ยน decision หรือ requirement gate ใน 17A.

## Backlog scope delivered

| ID | สถานะใน 17C | Implementation evidence |
| --- | --- | --- |
| PAT-02 | Implemented | Patient อ่าน Baseline DTX ที่ยืนยันหน่วยแล้ว และ raw weight/waist/BP ใน Follow-up/Final; generic bloodSugar ที่ยังไม่มี accepted unit/context ถูกเว้นไว้; ไม่มี BMI หรือ outcome derivation |
| CARE-01 | Implemented | Screening event metadata และ Baseline ผ่าน SELF-scoped projection แบบแบ่งหน้า |
| CARE-03 | Implemented | นำทาง Program, Service 1 factual progress, Goal Plan และ Follow-up จาก canonical rows |
| CARE-04 | Implemented | Follow-up ใช้หน้า 50 รายการพร้อม `hasMore`/ลิงก์ไปหน้าก่อนหน้า; ไม่มีเพดาน 6 รอบและ round > 6 มี regression coverage |
| CARE-05 | Implemented | Final assessment factual measurements และ Service 1 factual history อยู่ใน Program detail |
| APT-02 | Implemented | Patient appointment history แบบแบ่งหน้า/detail ผ่าน `appointment:read + SELF` และ allowlisted fields |

No requirement-gated item was promoted to implemented. `CARE-02`, `CARE-06/07`, `PAT-03/04/05`, `APT-03/04/05/06`, `OSM-03` และ domain อื่นที่ Phase 17A ระบุยังคง gated.

## Routes and navigation

Personal Home และ navigation มีทางเข้า “ข้อมูลการดูแล” กับ “นัดหมาย” ส่วนเส้นทางความสัมพันธ์มีดังนี้:

| Route | Behavior |
| --- | --- |
| `/app/personal/care` | แสดง Patient-Hospital relationships ทุกแถวเป็นตัวเลือกแยกกัน |
| `/app/personal/care/[relationshipId]` | Screening metadata, Baseline facts, Program, Goal Plan และ Follow-up history ของ relationship เดียว |
| `/app/personal/care/[relationshipId]/programs/[programId]` | Program lifecycle, Service 1 records, Goal/Follow-up history และ Final facts |
| `/app/personal/care/[relationshipId]/goal-plans/[goalPlanId]` | Goal Plan detail และรายการกิจกรรมตาม template version ที่บันทึกไว้ |
| `/app/personal/care/[relationshipId]/followups/[followupId]` | Follow-up raw measurements และ safe activity progress |
| `/app/personal/appointments` | แสดง relationship choices แยกตาม Hospital |
| `/app/personal/appointments/[relationshipId]` | Appointment history ของ relationship เดียว |
| `/app/personal/appointments/[relationshipId]/[appointmentId]` | Appointment detail แบบ read-only |

Screening event metadata, Baseline และ activity details ไม่แยกเป็น route ที่ไม่มีประโยชน์; แต่ละรายการอยู่ใน care journey หรือ Program/detail context ที่สัมพันธ์กัน. ไม่มี link ไป operator page หรือ route ที่ไม่มีปลายทาง.

## Patient relationship resolution and authorization

Navigation ใช้ internal `PatientSelfRelationshipNavigation` projection แยกจาก public profile projection ของ Phase 17B. `resolveOwnPatientRelationshipContext(actor, relationshipId)` ตรวจทุกครั้งตาม chain:

```text
authenticated ActorContext userId + personId
  → exact Person
  → linked ACTIVE User with persisted PATIENT role
  → that Person's PatientProfile
  → requested PatientHospitalRelationship nested under that profile
```

Relationship ID เป็น opaque locator สำหรับ route เท่านั้น ไม่ใช่หลักฐาน authority. Resolver คืนเฉพาะ relationship locator ที่จำเป็นต่อ downstream scope และ Hospital code/name/HN/status; ไม่คืน User ID, PatientProfile ID หรือ Hospital ID. Patient resource queries ใช้ทั้ง record ID และ `patientHospitalRelationshipId` ในเงื่อนไขเดียวกัน. Foreign/malformed relationship/resource และ missing resource ใช้ not-found behavior เดียวกัน.

Patient SELF read policy อนุญาตเฉพาะ capability เดิม:

- `patient:read`
- `screening:read`
- `program:read`
- `goal:read`
- `followup:read`
- `appointment:read`

Decision ใช้ `PATIENT + existing read capability + SELF`; role/capability policy อย่างเดียวไม่ grant row access—query ยังต้อง resolve exact own relationship. PATIENT mutation capabilities ไม่ถูกเพิ่มหรืออนุญาต. ไม่มี `*:self:read` capability vocabulary, operator mutation service, `canManage`/`canCreate`/`canRecord` field หรือ action state ใน Patient DTO.

Multi-role `OSM + PATIENT` และ `HOSPITAL + PATIENT` ใช้ Personal SELF resolver ตาม User→Person→PatientProfile ของตนเท่านั้น. OSM assignment และ Hospital membership ไม่ถูกส่งเข้า SELF query และไม่เปลี่ยน target. Operator Work query/policy ไม่ได้ถูกแก้; active Hospital checks, exact active OSM assignment และ direct Hospital scope ยังคงตามเดิม. Platform ADMIN ไม่ได้ SELF authority จาก ADMIN role.

Patient SELF ownership ไม่กรองด้วย Hospital operational status. Resolver แสดง status เป็นข้อเท็จจริงและอนุญาต own historical reads เมื่อ Hospital ไม่ ACTIVE เพราะ `PatientHospitalRelationship` ไม่มี accepted lifecycle/status ที่ให้ตีความเป็นการปิด relationship. ไม่ infer ว่า relationship สิ้นสุดหรือถูกระงับ. ไม่มี primary Hospital; relationships หลายรายการยังแยก context และ timeline กัน.

## Patient-facing projections

ทุก query เป็น server-only, select เฉพาะ fields ที่ projection ใช้ และอ่าน canonical records เดิม. ไม่มี operator DTO pass-through.

| Domain | Patient may read | Intentionally withheld |
| --- | --- | --- |
| Screening | persisted `submittedAt`, chronological event, neutral “บันทึกแล้ว” status | responses, PAM/PROM totals, levels, zones, scoring/question-set interpretation, recorder IDs |
| Baseline | `recordedOn`, weight, height, waist, systolic/diastolic BP, DTX-like blood sugar, HbA1c | BMI, categories, diagnosis/risk, clinical recommendations, adaptation/obstacle/opportunity summaries, confidence, improvement plan, recorder/audit IDs |
| Program | status, `startedAt`, `completedAt`, history | open/close/manage actions and success/recovery/health outcome interpretation |
| Service 1 | neutral canonical activity label (Routine, Floating Chart, Dream Card, Confidence), whether/when its record exists | score, free text, clinical/empowerment interpretation, recommendation, evidence/artifact metadata |
| Goal Plan | round, created date, canonical primary-goal label, persisted factual notes and activity labels/targets (days/value/unit), Program lifecycle context | Health Plan framing, prescription/adherence/success interpretation, linked Screening score/level/zone/responses, mutation controls |
| Follow-up | round, recorded date, raw weight/waist/BP, safe canonical activity label and factual progress status | bloodSugar (unit/context not accepted), confidence, reflection/behavioral notes/plans, general note, adherence/outcome calculation, evidence |
| Final Assessment | recorded date, weight/waist/BP | bloodSugar (unit/context not accepted), before/after comparison, improvement percentage, success/failure, recovery/control/risk or clinical conclusion |
| Appointment | type, scheduled time, status, duration, location type/detail, relationship Hospital context | responsible/creator User and display names, internal notes, scheduler authority, contact fields, response or manage actions |

Goal Plan is still named “แผนเป้าหมาย”; it is not “Health Plan”. Historical goal/activity labels come from the exact persisted template key/version. If an old template version or activity cannot be resolved, the request fails safely rather than inventing a label. Baseline shows only the separately confirmed `bloodSugarDtx` as `DTX / mg/dL`. Follow-up and Final `bloodSugar` are omitted from Patient selects and DTOs because their accepted contracts do not establish a unit/context; no DTX label or conversion is applied to them. Screening, Program, Goal Plan, Follow-up, and Appointment histories use bounded 50-item pages (`take: 51` to detect more records) with older-page navigation. This bounds each request without limiting persisted rounds; round 7+ remains discoverable across pages. Ordering remains deterministic by factual timestamps and ID.

Appointment status is the current persisted factual row state; this schema does not provide an approved Patient response/status-event history. No confirm, decline, reschedule, cancel, edit, complete or no-show action is rendered.

## UI, loading and error behavior

- Hospital relationships are shown as separate cards with code, HN and factual Hospital status; no relationship is silently selected as primary.
- Sections have explicit empty states; Program/final, Goal Plan, Follow-up and Appointment history each disclose when records are absent.
- Existing route loading skeleton conventions are reused. Personal route not-found copy does not reveal whether a foreign record exists; route-level error boundary has retry/back navigation and does not render technical errors.
- Histories use responsive lists/cards and wrap Thai text, long names, identifiers and measurements; no wide desktop table is used.
- Date-time uses the existing `th-TH` / `Asia/Bangkok` presentation convention; date-only values preserve UTC calendar-date semantics.
- The initial Phase 17C implementation passed a Chrome mobile emulation at 390×844 against rendered Personal components and project Tailwind/global CSS using synthetic records. Both document/body scroll widths equaled 390px. The later correction adds only wrapping location text and older-page links; a second browser viewport run was not made.

## Models and schema

Reuse existing `PatientHospitalRelationship`, `ScreeningAssessment`, `PatientBaseline`, `PatientProgram`, its Service 1 child records, `PatientGoalPlan`/`PatientGoalItem`, `PatientFollowup`/activity progress, `PatientFinalAssessment` and `PatientAppointment`. Read-after-write is naturally shared with operator workflows because no data is copied.

**Schema status: unchanged. No migration.** No Patient timeline/copy, health plan, response, preference, relationship lifecycle or measurement submission storage was added.

## Tests and verification

- Focused Patient SELF policy/query tests cover own/foreign exact relationship resolution, PATIENT and multi-role actors, Hospital status independence, capability allowlist, bounded fields, route-ID scoping, and round 7+ history.
- Patient care query tests cover Screening/Baseline, Program/Service 1/Final, Goal Plan without Screening-context selection, Follow-up factual fields and fail-safe historical labels, bounded 50-item pagination including round 7+, Appointment pagination/allowlist, and foreign resource not-found behavior.
- Patient view tests cover multiple separated Hospital relationships, 0..N history including round 7, allowlisted factual rendering, gated-field/action absence, empty states and responsive structure.
- Application navigation and Personal Home regressions assert Personal paths remain separate from Work navigation.
- Corrective Patient SELF regression command: `npm run test -- src/modules/patient-self/services/patient-self-care-query-service.test.ts src/modules/patient-self/services/patient-self-query-service.test.ts src/modules/patient-self/policies/patient-self-policy.test.ts app/app/personal/personal-pages.test.ts src/components/app-shell/application-navigation.test.ts` — **PASS, 5 files / 65 tests**.
- The view test is `.test.tsx`, while the repository Vitest include only discovers `.test.ts`; it was run separately with a temporary TSX-inclusive config, then that config was removed — **PASS, 1 file / 6 tests**.
- `npm run typecheck -- --incremental false` — **PASS**.
- Targeted ESLint over changed TypeScript/TSX files — **PASS, no warnings**.
- The previous full-suite run at the initial 17C implementation passed **145 files / 1,027 tests**. It was not repeated after this isolated Patient SELF projection/pagination correction.
- The initial 390×844 mobile emulation passed before this correction; a second viewport run was not made. Pagination links and location text use the existing wrapping/min-width patterns.
- Architecture check — not run; `package.json` does not define an `architecture:check` script.

## Known limitations and preserved gates

- Existing Screening result semantics remain provisional; this slice only reports that an assessment event was submitted and when.
- Goal/Service 1 legacy template text may encode historical prototype terminology; exact template-version lookup is used and unavailable versions fail safely. Future product semantics still need approved definitions.
- History pagination uses deterministic offset pages; if a new record is inserted between page requests, an item may shift across page boundaries. Each request remains bounded, and a later cursor-based approach can address live-history boundary shifts if UAT demonstrates a need.
- Appointment has no Patient response/action history; only the current canonical row and its current status are shown.
- Historical routes are only testable with an active authenticated Patient actor and canonical records; deployment/UAT environment, representative accounts and dataset remain the separate UAT Delivery / Environment track.
- No Patient-authored clinical/care data, Goal/Follow-up/Program mutation, appointment response/reschedule/cancel, staff/contact semantics, caregiver/family, medication, journaling, reminders, consent, enrollment, Hospital hierarchy, diagnosis, outcome calculation or recommendations were introduced.

`CARE-02`, `CARE-06/07`, `PAT-03/04/05`, `APT-03/04/05/06`, `OSM-03`, family/caregiver, medication, wellness, consent, notifications, Hospital contact/hierarchy and reporting dashboard/export remain requirement-gated as listed in Phase 17A.

## Handoff

Phase 17C adds read-only Patient care/appointment projections to the 17B SELF foundation. Phase 17D or later work must start from the remaining Phase 17A gates and must not infer Patient mutation, appointment action authority, validated PAM/PROM meaning, Health Plan meaning, care outcomes, primary Hospital, or relationship lifecycle from these read routes.
