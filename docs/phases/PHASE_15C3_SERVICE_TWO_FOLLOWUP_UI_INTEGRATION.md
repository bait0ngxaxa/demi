# Phase 15C.3 — Service 2 / Follow-up UI Integration

Status: COMPLETE

## 1. Objective

The authoritative current-care journey is now Program-scoped:

```text
Patient detail
  → Patient Program
  → Service 1 — รู้จักตัวเอง
  → Service 2 — แผนสุขภาพและเป้าหมาย
  → การติดตามผล 0..N รอบ
  → Program completion
  → read-only Program history
```

Program remains one participation episode. It is not a generic container for patient identity, the hospital relationship, general Evidence history, Screening history, or operational Appointment history.

## 2. Existing UI gaps

Before this phase, Program detail embedded Service 1 but did not project Program Goal Plans or Program Follow-ups. The page also described Goal Plans and Follow-ups as outside the Program, and patient-level navigation made relationship-wide create routes look like the current workflow.

The existing relationship Goal Plan and Follow-up forms were substantial working forms, so this phase extended them with explicit scope contracts instead of creating parallel forms.

## 3. Program workflow navigation

`PatientProgramDetailView` now renders, in order:

1. Program summary and scope explanation
2. Service 1 workspace
3. Service 2 workspace
4. Follow-up workspace
5. Existing Program completion control

The completion control remains available from the existing lifecycle and authorization contract. It does not require Service 1 completion, a Goal Plan, a Follow-up, activity status, or any behavioral outcome.

## 4. Service 2 workspace

`PatientProgramServiceTwoWorkspace` presents `Service 2 — แผนสุขภาพและเป้าหมาย` as a projection of Program-owned `PatientGoalPlan` records.

It provides:

- a neutral empty state: `ยังไม่มีแผนสุขภาพในโปรแกรมนี้`;
- the latest round, date, primary goal, activity count, and selected activity targets;
- compact immutable round history with Program-scoped detail links;
- a create action only for an ACTIVE Program when the actor may manage it;
- a full Program Goal history route.

No completion percentage, success percentage, achievement calculation, or Service 2 completion state is shown.

## 5. Goal Plan Program routes

Added routes:

```text
/app/patients/[relationshipId]/programs/[programId]/goals
/app/patients/[relationshipId]/programs/[programId]/goals/new
/app/patients/[relationshipId]/programs/[programId]/goals/[goalPlanId]
```

Each route first resolves `getPatientProgramDetail(actor, relationshipId, programId)`. The scoped query then uses the authoritative Program identifier from that result. A mismatched relationship/Program pair or cross-Program Goal Plan fails closed with the established not-found behavior.

The routes reuse:

- `getGoalPlanOverviewForProgram`;
- `getGoalPlanCreateContextForProgram`;
- `getGoalPlanDetailForProgram`.

## 6. Goal Plan form reuse

`goal-plan-form.tsx` now accepts the discriminated `GoalPlanFormScope`:

```ts
type GoalPlanFormScope =
  | { kind: "relationship"; relationshipId: string }
  | { kind: "program"; relationshipId: string; patientProgramId: string };
```

Relationship mode continues to use `submitGoalPlanAction`. Program mode uses `submitGoalPlanForProgramAction` and sends only the hidden `patientProgramId` authority field. The server action derives the relationship from the Program.

Program success navigation stays within Program routes and opens the new immutable round detail. Screening remains suggestion/context only.

## 7. Follow-up workspace

`PatientProgramFollowupWorkspace` presents `การติดตามผล` as Program-local normalized history.

It provides:

- a neutral empty state: `ยังไม่มีการติดตามผลในโปรแกรมนี้`;
- recorded round count and the latest date;
- compact recent history with source Goal Plan round and Appointment context when available;
- a full Program Follow-up history route;
- a create action only when the Program is ACTIVE and `canRecord` is true.

The workspace explicitly keeps Follow-up valid without a Goal Plan. It does not create fixed six-round slots or calculate clinical outcomes.

## 8. Follow-up Program routes

Added routes:

```text
/app/patients/[relationshipId]/programs/[programId]/followups
/app/patients/[relationshipId]/programs/[programId]/followups/new
/app/patients/[relationshipId]/programs/[programId]/followups/[followupId]
```

The routes validate the exact route relationship through `getPatientProgramDetail`, then use:

- `getFollowupHistoryForProgram`;
- `getFollowupCreateContextForProgram`;
- `getFollowupDetailForProgram`.

The Program history projection includes a read-only `totalCount` so the workspace can report all recorded rounds while showing only a bounded recent preview.

## 9. Follow-up form reuse

`followup-form.tsx` now accepts the discriminated `FollowupFormScope`:

```ts
type FollowupFormScope =
  | { kind: "relationship"; relationshipId: string }
  | { kind: "program"; relationshipId: string; patientProgramId: string };
```

Relationship mode continues to use `createFollowupAction`. Program mode uses `createFollowupForProgramAction`, sends only `patientProgramId`, and navigates to the Program Follow-up detail after success.

The Program selector receives only the exact Program's Goal Plan options. The form still permits a Follow-up with no selected Goal Plan and preserves the accepted factual fields, activity status/notes, confidence fields, and general note.

## 10. Relationship-history compatibility behavior

The relationship routes remain available:

```text
/app/patients/[relationshipId]/goals
/app/patients/[relationshipId]/followups
```

They are now presented as all-history/compatibility views. When an ACTIVE Program exists, their primary current-workflow CTA points to that Program. Relationship history rows distinguish Program-linked records from pre-Program records, and linked detail views provide a route back to the owning Program.

Patient detail navigation now says:

- `ประวัติแผนเป้าหมายทั้งหมด`;
- `ประวัติการติดตามผลทั้งหมด`.

Contextual Screening and completed Appointment actions also point to the ACTIVE Program when the actor can record there. No old relationship create request is silently converted to a Program write.

## 11. ACTIVE vs COMPLETED behavior

For ACTIVE Programs:

- Goal Plan creation is available only through the Program route and actor authorization;
- Follow-up creation is available only when `canRecord` is true;
- neither Service 2 nor Follow-up is gated on Service 1;
- Program completion is not gated on Goal Plans or Follow-ups.

For COMPLETED Programs:

- Service 1, Goal Plan history, and Follow-up history remain readable;
- existing Goal Plan and Follow-up detail routes remain readable;
- create controls are absent;
- `goals/new` and `followups/new` are guarded server-side by the create-context APIs and redirect back to Program when lifecycle state is no longer writable.

No success styling is used to imply clinical success.

## 12. Authorization/lifecycle behavior

Program pages validate route relationship and Program ownership before rendering scoped projections. Server Actions remain authoritative for authentication, authorization, exact Program ownership, lifecycle, idempotency, and persistence.

If a stale ACTIVE page submits after completion or authorization drift, the existing safe action error mapping is shown, no success navigation occurs, and the form refreshes authoritative state on conflict/forbidden responses. No automatic mutation retry was added.

Program-specific Goal Plan and Follow-up mutations now revalidate:

- relationship patient/history/detail paths;
- Program detail/history/detail paths.

## 13. User-facing wording corrections

The obsolete Program scope wording was replaced with a precise episode explanation. User-visible Follow-up activity notes now describe the actual operational field rather than workshop/customer discussion instructions.

Touched UI does not display phase, prototype, requirement-gating, workshop, domain-model, or implementation terminology.

## 14. Mobile/accessibility review

Affected views retain the existing responsive Tailwind conventions:

- primary actions use existing minimum tap-target sizing;
- workspace actions stack vertically on narrow screens;
- cards and definition lists replace wide tables;
- long Thai labels can wrap with `min-w-0`, `break-words`, and stacked layouts;
- headings remain semantic and associated lists retain accessible labels;
- native links, buttons, labels, form controls, disabled/loading states, and focus-visible rings are preserved.

No new horizontal-scroll table or clickable non-button control was introduced. A code-level responsive/accessibility audit was completed for the affected pages; live browser/device inspection remains a Phase 15C.4 hardening activity.

## 15. Tests

Added or updated focused coverage for:

- Program Goal history isolation from other Programs and pre-Program records;
- Program Goal detail rejection for a Goal Plan owned by another Program;
- Program Follow-up history isolation;
- Program Follow-up Goal selector source and standalone Follow-up without a Goal Plan;
- Program Follow-up detail rejection for a Follow-up owned by another Program;
- Program-scoped Goal/Follow-up transport authority and Program route revalidation.

No new component-testing framework was added for the final presentation correction because the repository has no existing React component-rendering test infrastructure. The corrected workspace copy was verified by direct component inspection together with the existing Follow-up module suite.

## 16. Verification

Executed successfully:

```text
npm test -- src/modules/goals       # 6 files, 50 tests
npm test -- src/modules/followups   # 5 files, 60 tests
npm test -- src/modules/patient-program # 9 files, 62 tests
npm test                             # 107 files, 695 tests
npx tsc --noEmit
npm run lint
npm run test:integration             # 18 files, 153 tests; no pending migrations
git diff --check
```

Final corrective pass: the Program Follow-up workspace preview now reports only the authoritative total count and no longer claims that all loaded history items are visibly rendered. The existing four-item preview and `ดูประวัติทั้งหมด` navigation remain unchanged.

The following corrective-pass checks were also executed successfully:

```text
npm test -- src/modules/followups
npx tsc --noEmit
npm run lint
git diff --check
```

No live Supabase or production data was accessed.

## 17. Explicitly deferred 15C.2 fields

Phase 15C.2 remains `PARTIAL_COMPLETE_REQUIREMENT_GATED` for unresolved behavioral fields. This phase intentionally adds no UI or schema for:

- `achievedCount`;
- number of successful days;
- achievement rate or percentage;
- Achieve score or `>70%` semantics;
- obstacle presence/details;
- outcome dropdown/code/status;
- plan-adjusted or `ปรับแผน / ไม่ปรับ` behavior;
- any clinical outcome calculation.

## 18. Remaining customer decisions

Customer decisions are still required before any of the deferred behavioral fields can become accepted UI or business semantics. No assumption was made about success thresholds, obstacle taxonomy, outcomes, plan adjustment, or Service 2/Follow-up completion.

## 19. Phase 15C.4 handoff

Do not treat this document as implementation of 15C.4. The next phase is:

```text
Phase 15C.4 — Service 2 / Follow-up Integration Hardening & Program Journey Re-audit
```

It should re-audit the complete journey, including stale lifecycle submissions, authorization drift, nested-route isolation, navigation, completed read-only history, mobile/device behavior, and regression coverage across the next Program episode.
